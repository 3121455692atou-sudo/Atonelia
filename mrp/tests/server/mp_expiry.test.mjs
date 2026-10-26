import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, tmpDir, startServer, stopServer, api, sleep } from '../helpers/mp_server.mjs';
const post = (s, p, body) => api(s.base, p, { method: 'POST', body });
async function setup(t, options = {}) {
  const data = tmpDir(), s = await startServer({ data, ...options });
  t.after(async () => { await stopServer(s); fs.rmSync(data, { recursive: true, force: true }); });
  return { ...s, data };
}
test('运行期 TTL 回收容量但保留原始存档，重启不恢复过期房', async t => {
  const s = await setup(t, { timeScale: .000001, args: ['--max-rooms', '1'] });
  const created = await post(s, '/api/rooms', { lobby: true });
  assert.equal(created.status, 200, created.text);
  const dir = path.join(s.data, created.json.room), files = fs.readdirSync(dir);
  await sleep(1600);
  const next = await post(s, '/api/rooms', { lobby: true });
  console.log(JSON.stringify({ expired: created.json.room, newStatus: next.status, serverLog: s.log() }));
  assert.equal(next.status, 200, next.text);
  for (const f of files) assert.ok(fs.existsSync(path.join(dir, f)), `保留 ${f}`);
  assert.ok(fs.readdirSync(dir).some(f => f.startsWith('snap-')));
  assert.equal((await api(s.base, `/api/r/${created.json.room}/status`)).status, 404);
  await stopServer(s); await sleep(1400);
  const resumed = await startServer({ data: s.data, timeScale: .000001, args: ['--max-rooms', '1'] });
  t.after(() => stopServer(resumed));
  assert.equal((await api(resumed.base, `/api/r/${created.json.room}/status`)).status, 404);
  assert.equal((await post(resumed, '/api/rooms', { lobby: true })).status, 200);
});

// 故障注入只改临时测试副本，不给生产服务器增加测试开关。
import { fixtureProject } from '../helpers/mp_fixture.mjs';
import { Client, waitFor, replayHash, roomSettings } from '../helpers/mp_server.mjs';
for (const phase of ['playing', 'paused', 'ended']) test(`TTL ${phase}：SSE关闭、快照/完整日志日期与哈希一致`, async t => {
  const root = fixtureProject(ROOT); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const s = await setup(t, { root, timeScale: .000002, args: ['--max-rooms', '2', '--tick-ms', '10'] });
  const created = await post(s, '/api/rooms', { settings: roomSettings({ humans: 1, bots: 2, days: phase === 'ended' ? 2 : 730 }) });
  assert.equal(created.status, 200, created.text);
  const c = new Client(s.base, created.json.room, created.cookie); t.after(() => c.close()); await c.connect();
  await c.roomCmd('start');
  if (phase === 'paused') await c.roomCmd('pause');
  if (phase === 'ended') await waitFor(() => c.events.some(e => e.type === 'end'), 1000);
  await sleep(700);
  const other = await post(s, '/api/rooms', { lobby: true }); assert.equal(other.status, 200, other.text);
  await waitFor(() => s.log().includes(`房间 ${created.json.room} 已到期`), 4000);
  await waitFor(() => c.streamClosed, 1000);
  assert.equal((await api(s.base, `/api/r/${other.json.room}/status`)).status, 200);
  const dir = path.join(s.data, created.json.room);
  assert.equal(replayHash(dir, { root, fromStart: false }), replayHash(dir, { root, fromStart: true }));
  assert.equal((await c.cmd(99, 'noop')).status, 404);
});
for (const point of ['before-snapshot', 'after-snapshot-before-ack', 'save-error']) test(`TTL 中断 ${point}：保存状态不误报、容量有限时释放、日志保留`, async t => {
  const root = fixtureProject(ROOT); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'server/room.mjs'); let code = fs.readFileSync(file, 'utf8');
  const hang = 'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000);';
  if (point === 'before-snapshot') code = code.replace("const file = writeSnap(dir, world, logN, rt, { preserve: true });", hang + "const file = writeSnap(dir, world, logN, rt, { preserve: true });");
  if (point === 'after-snapshot-before-ack') code = code.replace("post({ t: 'res', id: msg.id, res: { ok: true, saved: true", hang + "post({ t: 'res', id: msg.id, res: { ok: true, saved: true");
  if (point === 'save-error') code = code.replace("const file = writeSnap(dir, world, logN, rt, { preserve: true });", "throw new Error('injected disk error'); const file = '';");
  fs.writeFileSync(file, code);
  const s = await setup(t, { root, timeScale: .000001, args: ['--max-rooms', '1'] });
  const created = await post(s, '/api/rooms', { lobby: true }); assert.equal(created.status, 200, created.text);
  const dir = path.join(s.data, created.json.room);
  const old = Object.fromEntries(fs.readdirSync(dir).map(f => [f, fs.readFileSync(path.join(dir, f))]));
  await waitFor(() => s.log().includes('到期关闭异常'), 6000);
  await waitFor(async () => (await api(s.base, `/api/r/${created.json.room}/status`)).status === 404, 1000);
  assert.ok(!s.log().includes('最终快照已确认'));
  for (const [f, bytes] of Object.entries(old)) assert.deepEqual(fs.readFileSync(path.join(dir, f)), bytes);
  assert.equal((await post(s, '/api/rooms', { lobby: true })).status, 200);
});
