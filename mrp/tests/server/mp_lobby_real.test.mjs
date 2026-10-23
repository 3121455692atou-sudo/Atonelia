// M3b 大厅接真引擎（规格 M.6.3、M.6.4、M.6.8、M.6.9）：契约测试（mp_lobby.test.mjs）用的是替身世界，
// 这里用真的 createWorld 走一遍：从零局开局（电脑公司名单、规则开关进世界）、中途接管电脑公司、掉线托管再交还、分岔局按选的公司入座；
// 每一局最后全员暂停，从开局快照重放的哈希等于现场。
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, stopServer, api, Client, waitFor, replayHash, tmpDir } from '../helpers/mp_server.mjs';
import { readLog } from '../../server/store.mjs';
import { BOT_COMPANIES } from '../../src/career/data/selfplay.js';

const ok = r => { assert.equal(r.status, 200, r.text); assert.equal(r.json?.ok, true, r.text); return r.json; };
let srv, data;
const clients = [];
const client = (room, cookie) => { const c = new Client(srv.base, room, cookie); clients.push(c); return c; };
const post = (p, body, cookie) => api(srv.base, p, { method: 'POST', body, cookie });
const status = async room => ok(await api(srv.base, `/api/r/${room}/status`));

// 建一间大厅、第二个人申请入座、房主批准、两人报公司资料并准备、开局。
async function openLobby(settings, companies) {
  const created = await post('/api/rooms', { lobby: true, settings });
  const { room } = ok(created);
  const host = client(room, created.cookie);
  await host.connect();
  const joined = await post(`/api/r/${room}/join`, { seat: 1 });
  const member = ok(joined).member;
  const guest = client(room, joined.cookie);
  await guest.connect();
  ok(await host.roomCmd('approveSeat', { member, seat: 1 }));
  ok(await host.roomCmd('ready', { ...companies[0], ready: true }));
  ok(await guest.roomCmd('ready', { ...companies[1], ready: true }));
  ok(await host.roomCmd('start'));
  await waitFor(() => host.s && guest.s, 20000);
  return { room, host, guest, dir: path.join(data, room) };
}
// 全员暂停（全员同意不限时），再拿现场哈希和从头重放比。
async function pauseAndReplay(room, dir, members) {
  for (const c of members) ok(await c.roomCmd('pause'));
  const st = await status(room);
  assert.equal(st.paused, true);
  assert.equal(replayHash(dir), `${st.day} ${st.hash}`, '从开局快照重放的哈希等于现场');
  return st;
}

describe('联机大厅接真引擎（M3b）', () => {
  before(async () => { data = tmpDir(); srv = await startServer({ data, timeScale: 0.01, args: ['--tick-ms', '3'] }); });
  after(async () => { for (const c of clients) c.close(); await stopServer(srv); fs.rmSync(data, { recursive: true, force: true }); });

  it('从零局：电脑公司用共用名单，规则开关进世界；中途接管电脑公司、掉线托管再交还，重放一致', async () => {
    const { room, host, guest, dir } = await openLobby(
      { humans: 2, bots: 2, years: 1, seed: 31, start: '2024', rules: { short: false, distill: false, protectionDays: 60 } },
      [{ name: '甲辰智能', brand: '甲辰', country: 'CN' }, { name: '乙巳智能', brand: '乙巳', country: 'US' }]);
    const start = readLog(dir).find(e => e.t === 'room' && e.name === 'start');
    assert.deepEqual(start.args.settings.companies.filter(c => c.kind === 'bot').map(c => c.name), BOT_COMPANIES.slice(0, 2).map(b => b.name));
    // 世界设置里只记和默认不同的规则；做空、闭源 API 蒸馏的入口都关着。
    const init = host.events.find(e => e.type === 'init').data;
    assert.equal(init.seat, 0);
    assert.equal(init.seats.filter(x => x.kind === 'human').length, 2);
    const bot = init.seats.find(x => x.kind === 'bot');
    await waitFor(async () => (await status(room)).day >= '2024-01-20', 20000);
    // 中途加入：申请接管一家电脑公司，房主批准，已经连着的 SSE 收到 init。
    const joined = await post(`/api/r/${room}/join`, { companyId: bot.id });
    const member = ok(joined).member;
    const third = client(room, joined.cookie);
    await third.connect();
    ok(await host.roomCmd('approveSeat', { member, companyId: bot.id }));
    await waitFor(() => third.s, 20000);
    assert.equal(third.company, bot.id);
    assert.equal(third.seat, 2);
    // 掉线：先全局保护暂停，到点转托管（时间接着走），回来交还。
    guest.close();
    await waitFor(async () => (await status(room)).players.find(p => p.seat === 1).hosted, 20000);
    await guest.connect();
    await waitFor(async () => !(await status(room)).players.find(p => p.seat === 1).hosted, 20000);
    await waitFor(async () => (await status(room)).day >= '2024-02-20', 30000);
    await pauseAndReplay(room, dir, [host, guest, third]);
    const log = readLog(dir);
    for (const name of ['sys.takeover', 'sys.host', 'sys.unhost', 'sys.dropPause']) assert.ok(log.some(e => e.name === name), name);
    // 规则开关真的进了世界：重放出来的世界设置里有 short:false、distill:false、protect:60。
    const { rebuild } = await import('../../server/store.mjs');
    const { world } = rebuild(dir, { fromStart: true });
    assert.equal(world.settings.short, false);
    assert.equal(world.settings.distill, false);
    assert.equal(world.settings.protect, 60);
    for (const c of [host, guest, third]) c.close();
  });

  it('分岔局：每个真人选一家不同的真实公司接手，座位按入座顺序；没选齐不能开局', async () => {
    const created = await post('/api/rooms', { lobby: true, settings: { mode: 'fork', start: '2024-06', humans: 2, years: 1, keep: 6, seed: 5 } });
    const { room } = ok(created);
    const host = client(room, created.cookie);
    await host.connect();
    const joined = await post(`/api/r/${room}/join`, { seat: 1 });
    const member = ok(joined).member;
    const guest = client(room, joined.cookie);
    await guest.connect();
    ok(await host.roomCmd('approveSeat', { member, seat: 1 }));
    ok(await host.roomCmd('ready', { name: '深度求索', brand: '深度', country: 'CN', pick: 'deepseek' }));
    ok(await guest.roomCmd('ready', { name: '月之暗面', brand: '月面', country: 'CN' }));
    const refused = await host.roomCmd('start');
    assert.equal(refused.status, 400);
    assert.match(refused.json.err, /分岔局每个真人都要选一家不同的公司/);
    ok(await guest.roomCmd('ready', { name: '月之暗面', brand: '月面', country: 'CN', pick: 'kimi' }));
    ok(await host.roomCmd('start'));
    await waitFor(() => host.s && guest.s, 30000);
    assert.equal(host.company, 'deepseek');
    assert.equal(guest.company, 'kimi');
    const init = host.events.find(e => e.type === 'init').data;
    assert.equal(init.seats.filter(x => x.kind === 'human').length, 2);
    await waitFor(async () => (await status(room)).day >= '2024-06-15', 30000);
    await pauseAndReplay(room, path.join(data, room), [host, guest]);
    for (const c of [host, guest]) c.close();
  });
});
