import test from 'node:test';
import assert from 'node:assert/strict';
import { Admission } from '../../server/admission.mjs';
test('来源、房间、全局预算有界，时窗后清理和恢复', () => {
  let now = 1000;
  const a = new Admission({ now: () => now, sourceMax: 2 });
  for (let i = 0; i < 8; i++) assert.equal(a.limited('a', 'r'), false);
  assert.equal(a.limited('a', 'r'), true);
  assert.equal(a.limited('b', 'r'), false); assert.equal(a.limited('c', 'r'), true);
  now += 1001; a.sweep(); assert.equal(a.sources.size, 0); assert.equal(a.rooms.size, 0);
  const b = new Admission({ now: () => now });
  for (let i = 0; i < 16; i++) assert.equal(b.limited(String(i), 'r'), false);
  assert.equal(b.limited('new', 'r'), true);
  const c = new Admission({ now: () => now });
  for (let i = 0; i < 64; i++) assert.equal(c.limited(String(i), String(i)), false);
  assert.equal(c.limited('new', 'new'), true);
});
test('昂贵计算并发和队列有硬上限，已中断排队项不执行', async () => {
  const a = new Admission({ concurrency: 1, queueMax: 1 });
  const first = a.hash('password', 'salt');
  const cancelled = a.hash('password', 'salt', () => true);
  const check = assert.rejects(cancelled, /关闭/);
  await assert.rejects(a.hash('overflow', 'salt'), e => e.status === 429);
  assert.equal(a.active, 1); assert.equal(a.queue.length, 1);
  await first; await check;
  assert.equal(a.active, 0); assert.equal(a.queue.length, 0);
  assert.equal((await a.hash('recovery', 'salt')).length, 32);
});
