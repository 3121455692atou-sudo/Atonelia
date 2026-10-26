// M3a 联机服务器核心（规格 M.6.1–M.6.7、F2 M3 行 ①–⑤）。
// 服务器跑在子进程里（127.0.0.1 随机端口、临时数据目录、--tick-ms 0 最快档），测试结束关掉并删目录。
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { startServer, stopServer, api, Client, waitFor, replayHash, roomSettings, tmpDir, sleep, waitForClientDays } from '../helpers/mp_server.mjs';
import { readLog, listSnaps } from '../../server/store.mjs';
import { PROTOCOL_V } from '../../src/career/net/protocol.js';

async function openRoom(srv, opts = {}) {
  const r = await api(srv.base, '/api/rooms', { method: 'POST', body: { settings: roomSettings(opts) } });
  assert.equal(r.status, 200, r.text);
  const room = r.json.room;
  const clients = [new Client(srv.base, room, r.cookie)];
  for (let seat = 1; seat < r.json.seats; seat++) {
    const j = await api(srv.base, `/api/r/${room}/join`, { method: 'POST', body: { seat } });
    assert.equal(j.status, 200, j.text);
    clients.push(new Client(srv.base, room, j.cookie));
  }
  for (const c of clients) await c.connect();
  await waitFor(() => clients.every(c => c.s));
  return { room, clients, dir: path.join(srv.data, room) };
}
const status = async (srv, room) => (await api(srv.base, `/api/r/${room}/status`)).json;
// 让真人偶尔下几条合法命令（调推理份额、开产品），制造日志。
async function playUntil(srv, room, clients, day) {
  let seq = 1;
  for (;;) {
    const st = await status(srv, room);
    if (st.day >= day) break;
    const c = clients[seq % clients.length];
    await c.cmd(seq++, 'setInferShare', { v: [0.1, 0.2, 0.3][seq % 3] });
    await sleep(20);
  }
  // 房主明确暂停持续到主动恢复，确保重放比较期间世界不推进。
  await clients[0].roomCmd('pause');
  return status(srv, room);
}

describe('联机服务器（M3a）', () => {
  let srv, data;
  // M3b 起掉线有全局保护暂停（2 分钟）、到点转托管：墙上时钟按 --time-scale 缩成百分之一，测试不用真等。
  before(async () => { data = tmpDir(); srv = await startServer({ data, timeScale: 0.01, args: ['--tick-ms', '3', '--max-rooms', '4'] }); srv.data = data; });
  after(async () => { await stopServer(srv); fs.rmSync(data, { recursive: true, force: true }); });

  it('① 6 个无头客户端 + 2 家电脑打 120 天：重放的哈希等于现场的哈希；③ 发给 A 的字节里没有 B 的私有数据', async () => {
    const { room, clients, dir } = await openRoom(srv, { humans: 6, bots: 2 });
    assert.equal((await clients[0].roomCmd('start')).status, 200);
    const st = await playUntil(srv, room, clients, '2024-05-01');
    assert.ok(readLog(dir).some(e => e.t === 'cmd'), '日志里有玩家命令');
    // 现场哈希 = 新进程里从开局快照重放全部日志的哈希。
    const [day, h] = replayHash(dir).split(' ');
    assert.equal(day, st.day);
    assert.equal(h, st.hash);
    // 客户端按差分拼出来的 s，和服务器给新连接的 init 一样（二级差分没有丢东西）。
    const fresh = new Client(srv.base, room, clients[1].cookie);
    await fresh.connect();
    await waitFor(() => fresh.s);
    assert.deepEqual(clients[1].s, fresh.s);
    fresh.close();
    // ③ 用快照里 B（座位 1）的私有值，到 A（座位 0）收到的全部原文里搜。
    const snaps = listSnaps(dir);
    const snap = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, snaps.at(-1)))).toString('utf8'));
    const saved = JSON.parse(snap.text);
    const B = saved.companies.find(x => x.spec.id === clients[1].company).s;
    const rawA = clients[0].raw;
    // 按“键:值”搜（seed 这类小整数单独搜会撞上别的数字）；cash 是带小数的长数，单独搜也搜。
    // 只拿和 A 自己不一样的值去搜（开局现金人人一样，A 的流里本来就有它自己的现金）。
    const A = saved.companies.find(x => x.spec.id === clients[0].company).s;
    const pats = [`"rng":${B.rng}`, `"seed":${B.seed}`];
    if (B.cash !== A.cash) pats.push(`"cash":${B.cash}`);
    for (const pat of pats) assert.ok(!rawA.includes(pat), `A 收到了 B 的私有数据：${pat}`);
    assert.ok(!/"rng":/.test(rawA) && !/"seed":\d/.test(rawA.replace(/"settings":\{[^}]*\}/g, '')), 'A 的流里不该有任何 rng；seed 只允许出现在世界设置里');
    assert.ok(!clients[1].raw.includes(`"rng":${B.rng}`), '自己的 rng 也不发');
    const pubB = clients[0].pub.companies.find(x => x.id === clients[1].company);
    for (const k of ['cash', 'jobs', 'evals', 'working', 'kin', 'rng', 'seed', 'models', 's']) assert.ok(!(k in pubB), `公开视图里不该有 ${k}`);
    for (const c of clients) c.close();
  });

  it('② 断开 SSE 再连能补齐（Last-Event-ID）；kill -9 以后从快照加日志恢复，哈希一致', async () => {
    const { room, clients, dir } = await openRoom(srv, { humans: 2, bots: 2, seed: 9 });
    await clients[0].roomCmd('start');
    await waitFor(async () => (await status(srv, room)).day >= '2024-02-01');
    clients[1].close();
    const lastId = clients[1].lastId;
    await waitFor(async () => (await status(srv, room)).day >= '2024-02-20');
    const back = new Client(srv.base, room, clients[1].cookie);
    back.s = clients[1].s; back.pub = clients[1].pub;
    await back.connect(lastId);
    await clients[0].roomCmd('pause');
    await sleep(200);
    const ref = new Client(srv.base, room, clients[1].cookie);
    await ref.connect();
    await waitFor(() => ref.s);
    assert.ok(!back.events.some(e => e.type === 'init'), '差得少应该补发，不该重发 init');
    assert.deepEqual(back.s, ref.s, '补发以后和服务器一致');
    for (const c of [...clients, back, ref]) c.close();
    // 全员断线时服务器会自动暂停并存一份快照（M3b）：等它停稳再复制目录，复制时跳过正在写的 .tmp，免得和快照写入撞上。
    await waitFor(async () => { const st = await status(srv, room); return st.paused && st.reason === 'offline'; });
    await sleep(100);
    // kill -9：起一个单独的服务器跑这一局的数据，跑一阵杀掉，再起来恢复。
    const data2 = tmpDir();
    fs.cpSync(dir, path.join(data2, room), { recursive: true, filter: src => !src.endsWith('.tmp') });
    let s2 = await startServer({ data: data2, args: ['--tick-ms', '0'] });
    const host = await api(s2.base, `/api/r/${room}/status`);
    assert.equal(host.status, 200, host.text);
    // 恢复以后是暂停的；房主连上（全员离线时自动暂停，M3b）再用房主令牌继续跑一阵。
    const cookieHost = clients[0].cookie;
    const hostView = new Client(s2.base, room, cookieHost);
    await hostView.connect();
    await api(s2.base, `/api/r/${room}/room`, { method: 'POST', cookie: cookieHost, body: { name: 'start' } });
    await waitFor(async () => (await api(s2.base, `/api/r/${room}/status`)).json.day >= '2024-04-10');
    hostView.close();
    s2.proc.kill('SIGKILL');
    await new Promise(r => s2.proc.once('exit', r));
    s2 = await startServer({ data: data2, args: ['--tick-ms', '0'] });
    const after = (await api(s2.base, `/api/r/${room}/status`)).json;
    assert.equal(after.paused, true, '恢复以后是暂停的');
    const [day, h] = replayHash(path.join(data2, room)).split(' ');
    assert.equal(after.day, day);
    assert.equal(after.hash, h, '恢复的哈希等于从头重放的哈希');
    await stopServer(s2);
    fs.rmSync(data2, { recursive: true, force: true });
  });

  it('④ 乱命令不崩溃：坏 JSON、超大请求、不认识的命令、错类型参数、越权房间命令；被拒的不改世界', async () => {
    const { room, clients } = await openRoom(srv, { humans: 2, bots: 1, seed: 5 });
    const h0 = (await status(srv, room)).hash;
    const bad = [
      { raw: '{not json' }, { raw: 'x'.repeat(20000) }, { body: { v: 2, seq: 1, name: 'setInferShare', args: { value: 0.2 } } },
      { body: { v: PROTOCOL_V, seq: -1, name: 'setInferShare', args: {} } }, { body: { v: PROTOCOL_V, seq: 3, name: 'nope', args: {} } },
      { body: { v: PROTOCOL_V, seq: 4, name: 'setInferShare', args: { value: 'x' } } }, { body: { v: PROTOCOL_V, seq: 5, name: 'stockBuy', args: { ticker: 'c_zzzzzz', usd: 1e9 } } },
      { body: { v: PROTOCOL_V, seq: 6, name: 'buyGpu', args: { gpu: 'nope', n: -3 } } }, { body: null }, { body: [] },
    ];
    let n = 0;
    for (let i = 0; i < 100; i++) {
      for (const b of bad) {
        const r = await api(srv.base, `/api/r/${room}/cmd`, { method: 'POST', cookie: clients[0].cookie, ...(b.raw !== undefined ? { raw: b.raw } : { body: b.body }) });
        assert.ok([400, 429].includes(r.status), `应该被拒：${r.status} ${r.text}`);
        if (r.json?.err) assert.match(r.json.err, /[一-鿿]/);
        n++;
      }
      if (i % 34 === 0) await sleep(1000);   // 让限流窗口过去，保证一部分真的进了 worker
    }
    const r = await api(srv.base, `/api/r/${room}/room`, { method: 'POST', cookie: clients[1].cookie, body: { name: 'speed', args: { speed: 3 } } });
    assert.equal(r.status, 400, '非房主不能调速');
    const st = await status(srv, room);
    assert.equal(st.hash, h0, `${n} 条乱命令以后世界没变`);
    // 乱命令测完服务器还活着、还能正常回状态。
    assert.equal((await api(srv.base, `/api/r/${room}/status`)).status, 200);
    assert.equal((await api(srv.base, `/api/r/${room}/cmd`, { method: 'POST', body: { v: PROTOCOL_V, seq: 1, name: 'setInferShare', args: { v: 0.2 } } })).status, 401, '没有座位凭证');
    for (const c of clients) c.close();
  });

  it('静态文件：首页能取；路径穿越、隐藏文件、服务器代码、数据目录一律 404', async () => {
    assert.equal((await api(srv.base, '/')).status, 200);
    assert.equal((await api(srv.base, '/src/career/engine.js')).status, 200);
    for (const p of ['/package.json', '/..%2f..%2fetc/passwd', '/%2e%2e/%2e%2e/etc/passwd', '/.git/config', '/server/mp.mjs', '/tests/server/helpers.mjs', '/docs/NEXT.md', '/mp-data/x', '/src/.hidden']) {
      assert.equal((await api(srv.base, p)).status, 404, p);
    }
  });

  it('同一个 seq 重发，返回同样的结果，只执行一次', async () => {
    const { room, clients } = await openRoom(srv, { humans: 2, bots: 0, seed: 6 });
    const a = await clients[0].cmd(77, 'setInferShare', { v: 0.25 });
    const before = (await status(srv, room)).logN;
    const b = await clients[0].cmd(77, 'setInferShare', { v: 0.25 });
    assert.deepEqual(a.json, b.json);
    assert.equal((await status(srv, room)).logN, before, '重发不再写日志');
    for (const c of clients) c.close();
  });

  it('⑤ 一个人卡片没处理，时间照走；同一座位开两个页面都收到；--max-rooms 生效', async t => {
    // 前面已经开了 4 间（上限 4）：第 5 间被拒。
    const full = await api(srv.base, '/api/rooms', { method: 'POST', body: { settings: roomSettings({ humans: 2, bots: 0 }) } });
    assert.equal(full.status, 503);
    assert.match(full.json.err, /房间已满/);
    // 用一间 2 真人的房间：谁都不处理卡片。
    const rooms = fs.readdirSync(data).filter(x => /^[0-9a-f]{6}$/.test(x));
    const room = rooms.find(id => JSON.parse(fs.readFileSync(path.join(data, id, 'meta.json'), 'utf8')).settings.seed === 6);
    const ids = JSON.parse(fs.readFileSync(path.join(data, room, 'meta.json'), 'utf8')).tokens;
    void ids;
    // 座位 0 的令牌在“同一个 seq 重发”那条用例里的客户端上：重新入座拿不到（已有人），所以从 meta 里没法还原明文；
    // 这里换一间：重新开一间不可能（已满），改用 ② 那间（seed 9，2 真人 2 电脑）的客户端令牌不在手上。
    // 所以本用例自己开一个服务器。
    const data3 = tmpDir();
    const s3 = await startServer({ data: data3, args: ['--tick-ms', '3'] });
    t.after(() => stopServer(s3));
    s3.data = data3;
    const { room: r3, clients } = await openRoom(s3, { humans: 2, bots: 1, seed: 21 });
    t.after(() => clients.forEach(c => c.close()));
    void room;
    const twin = new Client(s3.base, r3, clients[0].cookie);
    t.after(() => twin.close());
    await twin.connect();
    await waitFor(() => twin.s);
    await clients[0].roomCmd('start');
    // 等到座位 0 手上有卡没处理，再看时间是不是照走。
    await waitFor(() => clients[0].s?.queue?.length > 0, 30000);
    const dayWithCard = clients[0].day || clients[0].s.day;
    await waitForClientDays(clients, dayWithCard, 30000, () => clients[0].s.queue.length > 0);
    assert.ok(clients[1].day > dayWithCard, '别人的时间也照走');
    // 同一座位两个页面都收到 day 事件，拼出来的 s 一样。
    await clients[0].roomCmd('pause');
    await sleep(200);
    assert.ok(twin.events.some(e => e.type === 'day'));
    assert.deepEqual(twin.s, clients[0].s);
    for (const c of [...clients, twin]) c.close();
    await stopServer(s3);
    fs.rmSync(data3, { recursive: true, force: true });
  });
});
