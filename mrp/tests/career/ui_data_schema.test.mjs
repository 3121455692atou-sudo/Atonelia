// 数据页只展示当前 teacher map；不能把旧平铺等级伪装成一名 legacy 老师。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { PLAYABLE, SCENARIOS } from '../../src/career/data/core.js';
globalThis.document ??= { baseURI: 'http://localhost/' };
const { render } = await import('../../src/career/ui/pages/data.js');

test('96 个当前新局的数据页均可只读展示，缺少某分类表示尚无蒸馏数据', () => {
  let count = 0;
  for (const p of PLAYABLE) for (const sc of SCENARIOS) {
    const s = E.createSinglePlayerGame(p.id, sc.id, 92), before = JSON.stringify(s);
    const html = render(s);
    assert.match(html, /<h2>数据<\/h2>/, `${p.id}/${sc.id}`);
    assert.doesNotMatch(html, /早先蒸馏的数据/);
    assert.equal(JSON.stringify(s), before, `${p.id}/${sc.id} 页面不能补存档字段`);
    count++;
  }
  assert.equal(count, 96);
});

test('当前老师映射按真实名字展示，零等级不产生虚构来源，不改账本', () => {
  const s = E.createSinglePlayerGame('image2', 'y2025', 93);
  s.data.distill.visual = { teacher_now: 1.2, unused_now: 0 };
  s.data.teachers = { teacher_now: { name: '当前老师<&>', q: 65, kind: 'api' } };
  const before = JSON.stringify(s), html = render(s);
  assert.match(html, /当前老师&lt;&amp;&gt; 1\.2/);
  assert.doesNotMatch(html, /早先蒸馏的数据|unused_now/);
  assert.equal(JSON.stringify(s), before);
});

test('平铺数字、legacy 伪来源和损坏映射明确拒绝，原始值不变', () => {
  for (const value of [1, 0, -1, null, [], { legacy: 1 }, { teacher_now: NaN }, { teacher_now: Infinity }, { teacher_now: -1 }]) {
    const s = E.createSinglePlayerGame('image2', 'y2025', 94);
    s.data.distill.visual = structuredClone(value);
    const before = structuredClone(s);
    assert.throws(() => render(s), /不支持旧版或损坏的蒸馏数据/);
    assert.deepEqual(s, before);
    assert.deepEqual(s.data.distill.visual, value);
  }
});
