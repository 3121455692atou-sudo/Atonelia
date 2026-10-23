// 编排层契约测试（M3b）：真实 HTTP、SSE、worker、WAL 与快照，世界用隔离的确定性替身（tests/helpers/mp_fixture.mjs）。
// 原 tests/server/mp.test.mjs 仍针对真实引擎运行，不能拿这里代替引擎回归。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT, tmpDir, startServer, stopServer, api, Client, sleep, waitFor, replayHash, roomSettings } from '../helpers/mp_server.mjs';
import { fixtureProject } from '../helpers/mp_fixture.mjs';

const root = fixtureProject(ROOT);
after(() => fs.rmSync(root, { recursive: true, force: true }));
const ok = r => { assert.equal(r.status, 200, r.text); assert.equal(r.json?.ok, true, r.text); return r.json; };
const post = (s, p, body, cookie) => api(s.base, p, { method: 'POST', body, cookie });
const events = (c, type) => c.events.filter(e => e.type === type);
const logs = dir => fs.readFileSync(path.join(dir, 'log.ndjson'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);

async function setup(t, { timeScale = .005, tickMs = 10000, data = tmpDir(), args = [] } = {}) {
  const s = await startServer({ root, data, timeScale, args: ['--tick-ms', String(tickMs), ...args] });
  s.data = data; s.clients = []; s.extraServers = [];
  s.client = (room, cookie) => { const c = new Client(s.base, room, cookie); s.clients.push(c); return c; };
  t.after(async () => { for (const c of s.clients) c.close(); await stopServer(s); for (const extra of s.extraServers) await stopServer(extra); fs.rmSync(data, { recursive: true, force: true }); });
  return s;
}
async function lobby(s, { seed = 7, password, settings = {} } = {}) {
  const created = await post(s, '/api/rooms', { lobby: true, password, settings: { humans: 2, bots: 1, years: 1, seed, ...settings } });
  if (!created.json?.ok) throw new Error(created.text + '\n' + s.log());
  const { room } = ok(created);
  const host = s.client(room, created.cookie); await host.connect();
  const joined = await post(s, `/api/r/${room}/join`, { password, seat: 1 });
  const member = ok(joined).member;
  const guest = s.client(room, joined.cookie); await guest.connect();
  const status = async () => ok(await api(s.base, `/api/r/${room}/status`));
  return { s, room, host, guest, member, hostMember: created.json.member, status, dir: path.join(s.data, room) };
}
async function game(t, options = {}) {
  const s = await setup(t, options);
  const g = await lobby(s, options);
  ok(await g.host.roomCmd('approveSeat', { member: g.member, seat: 1 }));
  ok(await g.host.roomCmd('ready', { name: '甲公司', brand: '甲', country: 'CN', ready: true }));
  ok(await g.guest.roomCmd('ready', { name: '乙公司', brand: '乙', country: 'US', ready: true }));
  ok(await g.host.roomCmd('start'));
  await waitFor(() => g.host.s && g.guest.s, 3000);
  return g;
}

// 权限与凭证检查走 HTTP，不直接调用实现内部函数。
test('大厅：申请、批准、公司资料、准备、开局；权限、一 cookie 一座与纯文本', async t => {
  const s = await setup(t);
  const g = await lobby(s, { password: '一间小屋' });
  assert.match(g.room, /^[0-9a-f]{6}$/);
  await waitFor(() => events(g.guest, 'lobby').length, 3000);
  assert.equal(events(g.guest, 'init').length, 0);
  assert.equal((await post(s, `/api/r/${g.room}/join`, { password: '错误' })).status, 403);
  assert.equal((await g.guest.roomCmd('approveSeat', { member: g.member, seat: 1 })).status, 400);
  assert.equal((await g.guest.roomCmd('settings', { humans: 3 })).status, 400);
  ok(await g.host.roomCmd('settings', { speedMax: 2 }));
  ok(await g.host.roomCmd('approveSeat', { member: g.member, seat: 1 }));
  await waitFor(() => events(g.host, 'lobby').some(e => e.data.sameIp?.some(group => group.includes(g.member) && group.includes(g.hostMember))), 1000);
  const again = await post(s, `/api/r/${g.room}/join`, { seat: 0, password: '一间小屋' }, g.guest.cookie);
  assert.ok(again.status === 400 || again.status === 409, again.text);
  assert.equal((await g.host.roomCmd('start')).status, 400);
  ok(await g.guest.roomCmd('setCompany', { name: '<b>乙公司</b>', brand: '乙', country: 'US' }));
  assert.equal((await g.guest.roomCmd('setCompany', { name: '名'.repeat(201) })).status, 400);
  ok(await g.host.roomCmd('ready', { name: '甲公司', brand: '甲', country: 'CN' }));
  ok(await g.guest.roomCmd('ready'));
  ok(await g.host.roomCmd('start'));
  await waitFor(() => events(g.guest, 'init').length, 3000);
  const state = await g.status();
  assert.equal(state.started, true); assert.equal(state.companies, 3); assert.equal(state.speedMax, 2);
  const meta = JSON.parse(fs.readFileSync(path.join(g.dir, 'meta.json'), 'utf8'));
  assert.ok(!JSON.stringify(meta).includes(g.host.cookie.split('=')[1]));
  assert.ok(!JSON.stringify(meta).includes('一间小屋'));
  assert.ok(g.guest.raw.includes('<b>乙公司</b>'));
});

test('投票：在线真人中位数，偶数取慢档，上限由房主设置', async t => {
  const g = await game(t);
  ok(await g.host.roomCmd('speed', { speed: 3 }));
  ok(await g.host.roomCmd('vote', { speed: 3 }));
  ok(await g.guest.roomCmd('vote', { speed: 1 }));
  assert.equal((await g.status()).speed, 1);
  ok(await g.guest.roomCmd('vote', { speed: 2 }));
  assert.equal((await g.status()).speed, 2);
  ok(await g.host.roomCmd('speed', { speed: 1 }));
  assert.equal((await g.status()).speed, 1);
  assert.equal((await g.guest.roomCmd('speed', { speed: 3 })).status, 400);
});

test('暂停：60 秒自动继续，30 秒后别人才能继续，非房主每年三次', async t => {
  const g = await game(t, { timeScale: .005 });
  ok(await g.guest.roomCmd('pause'));
  assert.equal((await g.host.roomCmd('resume')).status, 400);
  await sleep(180);
  ok(await g.host.roomCmd('resume'));
  for (let i = 0; i < 2; i++) {
    ok(await g.guest.roomCmd('pause'));
    await waitFor(async () => !(await g.status()).paused, 1500);
  }
  const fourth = await g.guest.roomCmd('pause');
  assert.equal(fourth.status, 400, fourth.text);
  assert.equal((await g.status()).players.find(p => p.seat === 1).pauseUses, 3);
  assert.ok(logs(g.dir).some(e => e.name === 'sys.autoResume'));
});

test('全员同意暂停不设超时；房主不受三次限制', async t => {
  const g = await game(t, { timeScale: .002 });
  ok(await g.host.roomCmd('pause'));
  ok(await g.guest.roomCmd('pause'));
  await sleep(180);
  assert.equal((await g.status()).paused, true);
  assert.equal((await g.status()).pause.all, true);
  ok(await g.guest.roomCmd('resume'));
  for (let i = 0; i < 3; i++) {
    ok(await g.host.roomCmd('pause'));
    await waitFor(async () => !(await g.status()).paused, 1000);
  }
});

test('掉线：两次 120 秒保护，之后 60 秒托管；回来交还，全员离线存快照', async t => {
  const g = await game(t, { timeScale: .002 });
  for (let attempt = 0; attempt < 3; attempt++) {
    g.guest.close();
    const offline = await waitFor(async () => { const s = await g.status(); return !s.players.find(p => p.seat === 1).online && s; }, 1000);
    assert.equal(offline.dropUsed, Math.min(attempt + 1, 2));
    assert.equal(offline.paused, attempt < 2);
    await waitFor(async () => (await g.status()).players.find(p => p.seat === 1).hosted, 1500);
    assert.equal((await g.status()).paused, false);
    await g.guest.connect();
    await waitFor(async () => !(await g.status()).players.find(p => p.seat === 1).hosted, 1000);
  }
  g.host.close(); g.guest.close();
  await waitFor(async () => { const s = await g.status(); return s.paused && s.players.every(p => !p.online); }, 1000);
  assert.ok(fs.readdirSync(g.dir).some(f => /^snap-/.test(f)));
  const log = logs(g.dir);
  assert.ok(log.some(e => e.name === 'sys.host'));
  assert.ok(log.some(e => e.name === 'sys.unhost'));
  assert.ok(log.some(e => e.name === 'sys.allOffline'));
});

test('收件箱：十天已经过去也要等满 45 秒，期限只发给本人', async t => {
  const g = await game(t, { seed: 45, timeScale: .02, tickMs: 10 });
  await waitFor(() => events(g.host, 'inbox').some(e => e.data.cards.length), 2000);
  await waitFor(async () => (await g.status()).day >= '2024-01-12', 2000);
  assert.ok(!logs(g.dir).some(e => e.name === 'sys.autoResolve'));
  assert.ok(!g.guest.raw.includes('card-0'));
  await waitFor(() => logs(g.dir).some(e => e.name === 'sys.autoResolve'), 2500);
  const entry = logs(g.dir).find(e => e.name === 'sys.autoResolve');
  assert.equal(entry.args.id, 'c0'); assert.equal(entry.args.at, 0);
});

test('收件箱：45 秒已过仍需十个游戏日', async t => {
  const g = await game(t, { seed: 45, timeScale: .002, tickMs: 40 });
  await sleep(130);
  assert.ok(!logs(g.dir).some(e => e.name === 'sys.autoResolve'));
  await waitFor(() => logs(g.dir).some(e => e.name === 'sys.autoResolve'), 2000);
  const entry = logs(g.dir).find(e => e.name === 'sys.autoResolve');
  assert.ok(entry.day >= '2024-01-11');
});

test('重大卡：0 档降速、处理后恢复、每人每年累计最多 180 秒', async t => {
  const g = await game(t, { seed: 180, timeScale: .003, tickMs: 10000 });
  assert.equal((await g.status()).speed, 0);
  ok(await g.guest.cmd(1, 'answer', { at: 0 }));
  await waitFor(async () => (await g.status()).speed === 1, 1000);
  ok(await g.guest.cmd(2, 'refill', { major: true }));
  await waitFor(async () => (await g.status()).speed === 0, 1000);
  await waitFor(async () => (await g.status()).speed === 1, 2000);
  const p = (await g.status()).players.find(p => p.seat === 1);
  assert.ok(p.slowUsed >= 179.9 && p.slowUsed <= 180.1, String(p.slowUsed));
  assert.ok(logs(g.dir).some(e => e.name === 'sys.slowCap'));
  assert.ok(events(g.guest, 'inbox').at(-1).data.cards.length > 0);
});

test('聊天：广播纯文本、200 字上限、每现实秒一条；请求体至多 8KB', async t => {
  const g = await game(t);
  const text = '<img src=x onerror=alert(1)>你好';
  ok(await g.host.roomCmd('chat', { text }));
  await waitFor(() => events(g.guest, 'chat').length, 1000);
  assert.equal(events(g.host, 'chat').at(-1).data.text, text);
  assert.equal(events(g.guest, 'chat').at(-1).data.seat, 0);
  assert.equal((await g.host.roomCmd('chat', { text: '第二条' })).status, 429);
  assert.equal((await g.guest.roomCmd('chat', { text: '字'.repeat(201) })).status, 400);
  const huge = await api(g.s.base, `/api/r/${g.room}/room`, { method: 'POST', cookie: g.guest.cookie, raw: JSON.stringify({ name: 'chat', args: { text: 'x'.repeat(9000) } }) });
  assert.equal(huge.status, 400);
  assert.ok(logs(g.dir).some(e => e.t === 'room' && e.name === 'chat' && e.args.text === text));
});

test('中途批准仅能接管电脑公司，既有 SSE 收到 init；系统日志从开局重放哈希一致', async t => {
  const g = await game(t, { timeScale: .003, tickMs: 15, seed: 45 });
  const joined = await post(g.s, `/api/r/${g.room}/join`, { companyId: 'c2' });
  const member = ok(joined).member;
  const third = g.s.client(g.room, joined.cookie); await third.connect();
  assert.equal((await g.guest.roomCmd('approveSeat', { member, companyId: 'c2' })).status, 400);
  assert.equal((await g.host.roomCmd('approveSeat', { member, companyId: 'c0' })).status, 400);
  ok(await g.host.roomCmd('approveSeat', { member, companyId: 'c2' }));
  await waitFor(() => events(third, 'init').length, 1500);
  assert.equal(third.company, 'c2'); assert.equal(third.seat, 2);
  ok(await third.cmd(1, 'noop'));
  g.guest.close();
  await waitFor(async () => (await g.status()).players.find(p => p.seat === 1).hosted, 1500);
  await g.guest.connect();
  await waitFor(async () => !(await g.status()).players.find(p => p.seat === 1).hosted, 1000);
  await waitFor(() => logs(g.dir).some(e => e.name === 'sys.autoResolve'), 2000);
  ok(await g.host.roomCmd('pause'));
  const before = await g.status();
  assert.equal(replayHash(g.dir, { root }), `${before.day} ${before.hash}`);
  const log = logs(g.dir);
  for (const name of ['sys.takeover', 'sys.host', 'sys.unhost', 'sys.autoResolve']) assert.ok(log.some(e => e.name === name), name);
});

test('旧建房/直接入座路径、同 seq 去重与终局公开全部 privateView', async t => {
  const s = await setup(t, { tickMs: 15 });
  const created = await post(s, '/api/rooms', { settings: roomSettings({ humans: 2, bots: 1, days: 3 }) });
  if (!created.json?.ok) throw new Error(created.text + '\n' + s.log());
  const { room } = ok(created);
  const joined = await post(s, `/api/r/${room}/join`, { seat: 1 }); ok(joined);
  const host = s.client(room, created.cookie), guest = s.client(room, joined.cookie);
  await host.connect(); await guest.connect();
  ok(await host.cmd(7, 'noop'));
  ok(await host.cmd(7, 'noop'));
  ok(await host.roomCmd('start'));
  await waitFor(() => events(host, 'end').length && events(guest, 'end').length, 2000);
  const end = events(host, 'end').at(-1).data;
  assert.equal(end.companies.length, 3);
  assert.deepEqual(end.companies.map(c => c.id).sort(), ['c0', 'c1', 'c2']);
  for (const c of end.companies) assert.equal(c.s.secret, `PRIVATE-${c.id}`);
  assert.equal(end.companies.find(c => c.id === 'c0').s.actions, 1);
  const dir = path.join(s.data, room);
  const state = ok(await api(s.base, `/api/r/${room}/status`));
  assert.equal(replayHash(dir, { root }), `${state.day} ${state.hash}`);
});

test('SSE 断线补发、超过三条拒绝；保存后 kill -9 恢复仍能从头重放', async t => {
  const g = await game(t, { timeScale: .003 });
  const second = g.s.client(g.room, g.host.cookie), third = g.s.client(g.room, g.host.cookie);
  await second.connect(); await third.connect();
  const fourth = g.s.client(g.room, g.host.cookie);
  await assert.rejects(fourth.connect(), /429/);
  await waitFor(() => events(g.host, 'init').length, 1000);
  const last = g.host.lastId; g.host.close();
  ok(await second.roomCmd('chat', { text: '补发这一句' }));
  await g.host.connect(last);
  await waitFor(() => events(g.host, 'chat').some(e => e.data.text === '补发这一句'), 1000);
  ok(await second.roomCmd('save'));
  const before = await g.status();
  const died = new Promise(resolve => g.s.proc.once('exit', resolve)); g.s.proc.kill('SIGKILL'); await died;
  for (const c of g.s.clients) c.close();
  const restarted = await startServer({ root, data: g.s.data, timeScale: .003, args: ['--tick-ms', '10000'] });
  g.s.extraServers.push(restarted);
  const state = ok(await api(restarted.base, `/api/r/${g.room}/status`));
  assert.equal(state.hash, before.hash); assert.equal(state.paused, true);
  assert.equal(replayHash(g.dir, { root }), `${state.day} ${state.hash}`);
});

test('暂停次数按游戏年重置；托管座位不参与速度投票', async t => {
  const s = await setup(t, { timeScale: .001, tickMs: 20 });
  const created = await post(s, '/api/rooms', { settings: { ...roomSettings({ humans: 2, bots: 1, days: 100 }), start: '2024-12' } });
  if (!created.json?.ok) throw new Error(created.text + '\n' + s.log());
  const { room } = ok(created);
  const joined = await post(s, `/api/r/${room}/join`, { seat: 1 }); ok(joined);
  const host = s.client(room, created.cookie), guest = s.client(room, joined.cookie);
  await host.connect(); await guest.connect(); ok(await host.roomCmd('start'));
  const status = async () => ok(await api(s.base, `/api/r/${room}/status`));
  for (let i = 0; i < 3; i++) {
    ok(await guest.roomCmd('pause'));
    await waitFor(async () => !(await status()).paused, 1000);
  }
  assert.equal((await guest.roomCmd('pause')).status, 400);
  await waitFor(async () => (await status()).day >= '2025-01-01', 3000);
  ok(await guest.roomCmd('pause'));
  assert.equal((await status()).players.find(p => p.seat === 1).pauseUses, 1);
  await waitFor(async () => !(await status()).paused, 1000);
  ok(await host.roomCmd('speed', { speed: 3 }));
  ok(await host.roomCmd('vote', { speed: 3 }));
  ok(await guest.roomCmd('vote', { speed: 0 }));
  assert.equal((await status()).speed, 0);
  guest.close();
  await waitFor(async () => (await status()).players.find(p => p.seat === 1).hosted, 1000);
  assert.equal((await status()).speed, 3);
});

test('收件箱：下标平移不重置剩余卡期限，系统处理可以从头重放', async t => {
  const g = await game(t, { seed: 46, timeScale: .02, tickMs: 10 });
  await waitFor(() => events(g.host, 'inbox').some(e => e.data.cards.length === 2), 1000);
  await sleep(500);
  ok(await g.host.cmd(1, 'answer', { at: 0 }));
  const after = await waitFor(() => events(g.host, 'inbox').findLast(e => e.data.cards.length === 1 && e.data.cards[0].id === 'card-b'), 1000);
  assert.equal(after.data.cards[0].at, 0);
  assert.ok(after.data.cards[0].wallMsLeft < 600, String(after.data.cards[0].wallMsLeft));
  await waitFor(() => logs(g.dir).some(e => e.name === 'sys.autoResolve'), 700);
  const e = logs(g.dir).find(e => e.name === 'sys.autoResolve');
  assert.equal(e.args.at, 0);
  ok(await g.host.roomCmd('pause'));
  const state = await g.status();
  assert.equal(replayHash(g.dir, { root }), `${state.day} ${state.hash}`);
});

test('超过保留期的房间不恢复，磁盘目录保留', async t => {
  const s = await setup(t, { timeScale: .001 });
  const created = await post(s, '/api/rooms', { lobby: true, settings: { humans: 2, bots: 1 } });
  if (!created.json?.ok) throw new Error(created.text + '\n' + s.log());
  const { room } = ok(created);
  await stopServer(s);
  const dir = path.join(s.data, room), file = path.join(dir, 'meta.json');
  const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
  meta.created = new Date(Date.now() - 15 * 86400000).toISOString();
  fs.writeFileSync(file, JSON.stringify(meta));
  const again = await startServer({ root, data: s.data, timeScale: .001 });
  s.extraServers.push(again);
  assert.equal((await api(again.base, `/api/r/${room}/status`)).status, 404);
  assert.equal(fs.existsSync(file), true);
});

test('退场电脑拒绝接管：返回 null 或无副作用异常均不中断房间，失败尝试仍可重放', async t => {
  for (const seed of [88, 89]) {
    const g = await game(t, { seed });
    const before = await g.status();
    const joined = await post(g.s, `/api/r/${g.room}/join`, { companyId: 'c2' });
    const member = ok(joined).member;
    const pending = g.s.client(g.room, joined.cookie); await pending.connect();
    const refused = await g.host.roomCmd('approveSeat', { member, companyId: 'c2' });
    assert.equal(refused.status, 400, refused.text);
    const after = await g.status();
    assert.equal(after.hash, before.hash); assert.equal(after.seats, 2);
    ok(await g.host.roomCmd('speed', { speed: 2 }));
    assert.equal(events(pending, 'init').length, 0);
    assert.equal(replayHash(g.dir, { root }), `${after.day} ${after.hash}`);
  }
});

test('踢人撤销 cookie、断开 SSE 并托管；旧路径不能重占被踢座位', async t => {
  const g = await game(t);
  assert.equal((await g.guest.roomCmd('kick', { seat: 0 })).status, 400);
  ok(await g.host.roomCmd('kick', { member: g.member }));
  await waitFor(() => g.guest.streamClosed, 1000);
  assert.equal((await g.guest.cmd(1, 'noop')).status, 401);
  await assert.rejects(g.guest.connect(), /401/);
  assert.equal((await g.status()).players.find(p => p.seat === 1).hosted, true);
  const again = await post(g.s, `/api/r/${g.room}/join`, { companyId: 'c1' }, g.guest.cookie);
  const replacement = ok(again).member;
  const returning = g.s.client(g.room, again.cookie); await returning.connect();
  assert.equal((await g.host.roomCmd('approveSeat', { member: replacement, companyId: 'c1' })).status, 400);
  ok(await g.host.roomCmd('approveSeat', { member: replacement, companyId: 'c2' }));
  const state = await g.status();
  assert.equal(replayHash(g.dir, { root }), `${state.day} ${state.hash}`);

  const old = await post(g.s, '/api/rooms', { settings: roomSettings({ humans: 2, bots: 1 }) });
  const { room } = ok(old);
  const joined = await post(g.s, `/api/r/${room}/join`, { seat: 1 }); ok(joined);
  const host = g.s.client(room, old.cookie), guest = g.s.client(room, joined.cookie);
  await host.connect(); await guest.connect();
  ok(await host.roomCmd('kick', { seat: 1 }));
  const reuse = await post(g.s, `/api/r/${room}/join`, { seat: 1 }, guest.cookie);
  assert.equal(reuse.status, 400, reuse.text);
});

test('八个真人已满时不能继续接管电脑，失败不改变世界', async t => {
  const s = await setup(t);
  const created = await post(s, '/api/rooms', { lobby: true, settings: { humans: 8, bots: 4, years: 1, seed: 7 } });
  const { room } = ok(created);
  const host = s.client(room, created.cookie); await host.connect();
  for (let seat = 1; seat < 8; seat++) {
    const joined = await post(s, `/api/r/${room}/join`, { seat });
    const member = ok(joined).member;
    const guest = s.client(room, joined.cookie); await guest.connect();
    ok(await host.roomCmd('approveSeat', { member, seat }));
    ok(await guest.roomCmd('ready'));
  }
  ok(await host.roomCmd('ready')); ok(await host.roomCmd('start'));
  const before = ok(await api(s.base, `/api/r/${room}/status`));
  const joined = await post(s, `/api/r/${room}/join`, { companyId: 'c8' });
  const member = ok(joined).member;
  assert.equal((await host.roomCmd('approveSeat', { member, companyId: 'c8' })).status, 400);
  const state = ok(await api(s.base, `/api/r/${room}/status`));
  assert.equal(state.seats, 8); assert.equal(state.hash, before.hash);
  assert.equal(replayHash(path.join(s.data, room), { root }), `${state.day} ${state.hash}`);
});

test('引擎抛出无副作用拒绝时返回玩家错误，房间仍能接受下一条命令', async t => {
  const g = await game(t);
  const before = await g.status();
  const refused = await g.guest.cmd(1, 'throwNoop');
  assert.equal(refused.status, 400, refused.text);
  assert.equal((await g.status()).hash, before.hash);
  ok(await g.guest.cmd(2, 'noop'));
  const after = await g.status();
  assert.notEqual(after.hash, before.hash);
  assert.equal(replayHash(g.dir, { root }), `${after.day} ${after.hash}`);
});

test('最后一次 tick 已提交但终局日志尚未写入时崩溃，恢复仍公开完整终局', async t => {
  const s = await setup(t, { tickMs: 10 });
  const created = await post(s, '/api/rooms', { settings: roomSettings({ humans: 2, bots: 1, days: 3 }) });
  const { room } = ok(created);
  const joined = await post(s, `/api/r/${room}/join`, { seat: 1 }); ok(joined);
  const host = s.client(room, created.cookie), guest = s.client(room, joined.cookie);
  await host.connect(); await guest.connect(); ok(await host.roomCmd('start'));
  await waitFor(() => events(host, 'end').length, 2000);
  const before = ok(await api(s.base, `/api/r/${room}/status`));
  await stopServer(s);
  const dir = path.join(s.data, room), log = logs(dir);
  // 精确留下最后一天已提交的 tick，移除随后本该执行的 sys.end 和快照。
  const cut = log.findLastIndex(e => e.t === 'tick') + 1;
  assert.ok(cut > 0);
  assert.ok(log.slice(cut).some(e => e.name === 'sys.end'));
  fs.writeFileSync(path.join(dir, 'log.ndjson'), log.slice(0, cut).map(e => JSON.stringify(e)).join('\n') + '\n');
  for (const file of fs.readdirSync(dir).filter(f => /^snap-\d+\.json\.gz$/.test(f))) {
    const snap = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, file))).toString('utf8'));
    if (snap.logN > cut) fs.unlinkSync(path.join(dir, file));
  }
  const again = await startServer({ root, data: s.data, timeScale: .005, args: ['--tick-ms', '10000'] });
  s.extraServers.push(again);
  const state = ok(await api(again.base, `/api/r/${room}/status`));
  assert.equal(state.ended, true); assert.equal(state.paused, true);
  assert.equal(state.hash, before.hash);
  const reconnected = new Client(again.base, room, created.cookie); s.clients.push(reconnected);
  await reconnected.connect();
  await waitFor(() => events(reconnected, 'end').length, 2000);
  const end = events(reconnected, 'end').at(-1).data;
  assert.equal(end.companies.length, 3);
  for (const c of end.companies) assert.equal(c.s.secret, `PRIVATE-${c.id}`);
  assert.equal(replayHash(dir, { root }), `${state.day} ${state.hash}`);
});
