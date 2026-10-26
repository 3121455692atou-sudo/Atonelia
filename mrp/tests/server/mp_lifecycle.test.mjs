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
test('匿名密码突发有界拒绝，状态不排在全部校验之后，伪造验证无效', async t => {
  const s = await setup(t);
  const r = await post(s, '/api/rooms', { lobby: true, password: '正确', settings: { humans: 2, bots: 1 } });
  assert.equal(r.status, 200, r.text);
  const room = r.json.room, dir = path.join(s.data, room);
  const before = fs.readFileSync(path.join(dir, 'log.ndjson'), 'utf8');
  let complete = 0;
  const requests = Array.from({ length: 16 }, (_, i) => fetch(`${s.base}/api/r/${room}/join`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `192.0.2.${i}` },
    body: JSON.stringify({ password: '错误', verified: true, passwordVerified: true }),
  }).then(async r => { complete++; return { status: r.status, retry: r.headers.get('retry-after'), body: await r.json() }; }));
  await sleep(10);
  const start = performance.now();
  assert.equal((await api(s.base, `/api/r/${room}/status`)).status, 200);
  const completedAtStatus = complete, statusMs = performance.now() - start;
  const replies = await Promise.all(requests);
  console.log(JSON.stringify({ statusMs, completedAtStatus, replies: replies.map(r => r.status) }));
  assert.ok(replies.some(r => r.status === 429), '匿名突发必须有界拒绝');
  assert.ok(replies.every(r => r.status === 403 || (r.status === 429 && Number(r.retry) >= 1)));
  assert.equal(fs.readFileSync(path.join(dir, 'log.ndjson'), 'utf8'), before);
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'))).members).length, 1);
  await sleep(1100);
  const correct = await post(s, `/api/r/${room}/join`, { password: '正确' });
  assert.equal(correct.status, 200, correct.text); assert.equal(correct.json.pending, true);
});

import { roomSettings } from '../helpers/mp_server.mjs';
test('异步校验后并发抢同一座位仍串行裁决，无密码路径保持兼容', async t => {
  const s = await setup(t);
  for (const password of ['正确', undefined]) {
    const created = await post(s, '/api/rooms', { password, settings: roomSettings({ humans: 2, bots: 1 }) });
    assert.equal(created.status, 200, created.text);
    const room = created.json.room;
    const replies = await Promise.all([1, 2].map(() => post(s, `/api/r/${room}/join`, { password, seat: 1 })));
    assert.deepEqual(replies.map(r => r.status).sort(), [200, 400]);
    const meta = JSON.parse(fs.readFileSync(path.join(s.data, room, 'meta.json')));
    assert.equal(Object.values(meta.members).filter(m => m.seat === 1).length, 1);
  }
});
