import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, tmpDir, startServer, stopServer, api, waitFor, roomSettings, replayHash } from '../helpers/mp_server.mjs';
import { fixtureProject } from '../helpers/mp_fixture.mjs';

test('失败创建取消长期TTL定时器并释放worker/注册，旧目录保留', async t => {
  const root = fixtureProject(ROOT), data = tmpDir();
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(data, { recursive: true, force: true }); });
  const file = path.join(root, 'server/mp.mjs');
  // 只在临时服务副本统计长期timer；不依赖Node私有Timer字段，不等真实14天。
  const observe = `
const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
const longTimers = new Set();
globalThis.setTimeout = (fn, ms, ...args) => {
  const timer = realSetTimeout(fn, ms, ...args);
  if (ms >= 86400000) { longTimers.add(timer); console.log('TEST_LONG_TIMERS=' + longTimers.size); }
  return timer;
};
globalThis.clearTimeout = timer => {
  const deleted = longTimers.delete(timer); realClearTimeout(timer);
  if (deleted) console.log('TEST_LONG_TIMERS=' + longTimers.size);
};
`;
  fs.writeFileSync(file, observe + fs.readFileSync(file, 'utf8').replace(/^#![^\n]*\n/, ''));
  const s = await startServer({ root, data, args: ['--max-rooms', '1'] });
  t.after(() => stopServer(s));
  const count = () => Number([...s.log().matchAll(/TEST_LONG_TIMERS=(\d+)/g)].at(-1)?.[1]);
  for (let i = 0; i < 2; i++) {
    const r = await api(s.base, '/api/rooms', { method: 'POST', body: { lobby: true, settings: { humans: 999 } } });
    assert.equal(r.status, 400, r.text);
    await waitFor(() => s.log().includes('TEST_LONG_TIMERS='), 1000);
    assert.equal(count(), 0, '失败建房不能将room引用保留14天');
    const dirs = fs.readdirSync(data); assert.equal(dirs.length, i + 1);
    for (const id of dirs) assert.equal((await api(s.base, `/api/r/${id}/status`)).status, 404);
  }
  const live = await api(s.base, '/api/rooms', { method: 'POST', body: { lobby: true } });
  assert.equal(live.status, 200, live.text);
  assert.equal(count(), 1, '只有成功房间持有保留期timer');
  await stopServer(s);
  assert.equal(count(), 0, '正常shutdown也清理timer');
});

test('启动恢复失败同样撤销注册并保留原始目录', async t => {
  const root = fixtureProject(ROOT), data = tmpDir(), dir = path.join(data, 'abcdef');
  fs.mkdirSync(dir); const original = JSON.stringify({ id: 'abcdef', created: new Date().toISOString(), lobby: true, settings: {} });
  fs.writeFileSync(path.join(dir, 'meta.json'), original); // 缺失日志/快照，不能恢复。
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(data, { recursive: true, force: true }); });
  const s = await startServer({ root, data, args: ['--max-rooms', '1'] }); t.after(() => stopServer(s));
  await waitFor(() => s.log().includes('恢复失败'), 2000);
  await waitFor(async () => (await api(s.base, '/api/r/abcdef/status')).status === 404, 1000);
  assert.equal(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'), original);
  assert.equal((await api(s.base, '/api/rooms', { method: 'POST', body: { lobby: true } })).status, 200);
  await stopServer(s);
});


const directoryBytes = dir => Object.fromEntries(fs.readdirSync(dir).sort().map(name => [name, fs.readFileSync(path.join(dir, name)).toString('base64')]));
for (const failure of ['invalid', 'stalled']) test(`恢复 ${failure} 目录在前：释放失败容量后恢复合法房，MAX1和原档保持`, async t => {
  const root = fixtureProject(ROOT), data = tmpDir(), servers = [];
  t.after(async () => {
    for (const server of servers) await stopServer(server);
    fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(data, { recursive: true, force: true });
  });
  const initial = await startServer({ root, data, args: ['--max-rooms', '2', '--tick-ms', '10000'] }); servers.push(initial);
  const good = [];
  for (const seed of [11, 12]) {
    const created = await api(initial.base, '/api/rooms', { method: 'POST', body: { settings: roomSettings({ humans: 1, bots: 1, days: 30, seed }) } });
    assert.equal(created.status, 200, created.text);
    const status = await api(initial.base, `/api/r/${created.json.room}/status`); assert.equal(status.status, 200, status.text);
    good.push({ id: created.json.room, cookie: created.cookie, hash: status.json.hash, day: status.json.day });
  }
  await stopServer(initial);
  good.sort((a, b) => a.id.localeCompare(b.id));
  const badId = '000000'; assert.ok(good.every(room => room.id !== badId));
  const badDir = path.join(data, badId); fs.mkdirSync(badDir);
  fs.writeFileSync(path.join(badDir, 'meta.json'), JSON.stringify({ id: badId, created: new Date().toISOString(), lobby: true, settings: {} }));
  const badBytes = directoryBytes(badDir), skippedDir = path.join(data, good[1].id), skippedBytes = directoryBytes(skippedDir);
  const mainFile = path.join(root, 'server/mp.mjs');
  let main = fs.readFileSync(mainFile, 'utf8').replace(/^#![^\n]*\n/, '');
  // Filesystem directory ordering is unspecified: force the failed archive first
  // only in the disposable test copy, without changing production selection order.
  const ordered = `const realReadDir = fs.readdirSync;
fs.readdirSync = function (dir, ...args) {
  const entries = realReadDir.call(fs, dir, ...args);
  return path.resolve(String(dir)) === DATA ? entries.sort() : entries;
};\n`;
  if (failure === 'stalled') {
    assert.ok(main.includes('const RECOVERY_READY_TIMEOUT_MS = 30000;'));
    main = main.replace('const RECOVERY_READY_TIMEOUT_MS = 30000;', 'const RECOVERY_READY_TIMEOUT_MS = 2000;');
    const workerFile = path.join(root, 'server/room.mjs');
    const hang = `if (workerData.mode === 'resume' && workerData.meta.id === '${badId}') {
  setInterval(() => {}, 1000);
  await new Promise(() => {});
}\n`;
    fs.writeFileSync(workerFile, hang + fs.readFileSync(workerFile, 'utf8'));
  }
  fs.writeFileSync(mainFile, ordered + main);
  const startedAt = Date.now();
  const resumed = await startServer({ root, data, args: ['--max-rooms', '1', '--tick-ms', '10000'] }); servers.push(resumed);
  assert.ok(Date.now() - startedAt < 15000, '挂起的ready必须有界失败而非永久阻塞启动');
  const room = good[0], status = await api(resumed.base, `/api/r/${room.id}/status`);
  assert.equal(status.status, 200, `${status.text}\n${resumed.log()}`);
  assert.equal((await api(resumed.base, `/api/r/${badId}/status`)).status, 404);
  assert.match(resumed.log(), new RegExp(`房间 ${badId} 恢复失败`));
  if (failure === 'stalled') assert.match(resumed.log(), /恢复初始化超时/);
  assert.equal(status.json.hash, room.hash); assert.equal(status.json.day, room.day); assert.equal(status.json.paused, true);
  const command = { method: 'POST', body: { name: 'save', args: {} } };
  assert.equal((await api(resumed.base, `/api/r/${room.id}/room`, command)).status, 401, '恢复不放宽身份校验');
  const authorized = await api(resumed.base, `/api/r/${room.id}/room`, { ...command, cookie: room.cookie });
  assert.equal(authorized.status, 200, authorized.text);
  assert.equal((await api(resumed.base, `/api/r/${good[1].id}/status`)).status, 404, '第二间合法房仍受MAX1约束');
  assert.equal((await api(resumed.base, '/api/rooms', { method: 'POST', body: { lobby: true } })).status, 503);
  assert.deepEqual(directoryBytes(badDir), badBytes, '坏目录不删除、不修补、不迁移');
  assert.deepEqual(directoryBytes(skippedDir), skippedBytes, '超容量未恢复的合法目录不改动');
  await stopServer(resumed);
  for (const fromStart of [true, false]) {
    const [day, hash] = replayHash(path.join(data, room.id), { root, fromStart }).split(' ');
    assert.equal(day, room.day); assert.equal(hash, room.hash);
  }
});
