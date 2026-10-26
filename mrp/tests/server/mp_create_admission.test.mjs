import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpDir, startServer, stopServer, api, sleep } from '../helpers/mp_server.mjs';
const post = (s, body) => api(s.base, '/api/rooms', { method: 'POST', body });
async function setup(t, maxRooms = 2) {
  const data = tmpDir(), s = await startServer({ data, args: ['--max-rooms', String(maxRooms)] });
  t.after(async () => { await stopServer(s); fs.rmSync(data, { recursive: true, force: true }); });
  return { ...s, data };
}
test('匿名建房突发有预算，已有房间状态可用，失败后容量和预算恢复', async t => {
  const s = await setup(t);
  const live = await post(s, { lobby: true }); assert.equal(live.status, 200, live.text);
  let complete = 0;
  const requests = Array.from({ length: 12 }, (_, i) => fetch(s.base + '/api/rooms', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `192.0.2.${i}` },
    body: JSON.stringify({ lobby: true, password: 'test', settings: { humans: 999 } }),
  }).then(async r => { complete++; return { status: r.status, retry: r.headers.get('retry-after'), body: await r.json() }; }));
  const begin = performance.now();
  assert.equal((await api(s.base, `/api/r/${live.json.room}/status`)).status, 200);
  const statusMs = performance.now() - begin, atStatus = complete;
  const results = await Promise.all(requests);
  console.log(JSON.stringify({ statusMs, atStatus, statuses: results.map(r => r.status) }));
  assert.ok(results.some(r => r.status === 429), '建房请求必须有速率预算');
  assert.ok(results.filter(r => r.status === 429).every(r => Number(r.retry) >= 1));
  await sleep(1100);
  const recovered = await post(s, { lobby: true, password: 'correct' }); assert.equal(recovered.status, 200, recovered.text);
  const join = await api(s.base, `/api/r/${recovered.json.room}/join`, { method: 'POST', body: { password: 'correct' } }); assert.equal(join.status, 200, join.text);
});
test('异步建房预留容量：并发不能超过max-rooms，错误JSON不创建目录', async t => {
  const s = await setup(t, 1);
  for (const body of [null, []]) assert.equal((await post(s, body)).status, 400);
  assert.equal(fs.readdirSync(s.data).length, 0);
  await sleep(1100);
  const replies = await Promise.all([1, 2, 3].map(() => post(s, { lobby: true, password: 'correct' })));
  assert.equal(replies.filter(r => r.status === 200).length, 1);
  assert.ok(replies.every(r => [200, 429, 503].includes(r.status)));
  assert.equal(fs.readdirSync(s.data).length, 1);
});
