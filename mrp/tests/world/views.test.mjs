// 公开视图（M.6.6）：搜不到别家的现金、在练模型、作业、送评候选、API 老师、完整血统、rng、seed。
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { restoreHistory } from '../helpers/world_provider.mjs';

after(() => restoreHistory());

const names = ['晨星', '北岭', '蓝鲸', '泰拉', '流光', '山巅'];
const companies = (n = 6) => names.slice(0, n).map((name, i) => ({
  name: `${name}智能`, brand: name, country: ['CN', 'US', 'EU'][i % 3], tier: 'specialist', kind: 'bot',
}));
// 按“键”查，别把公司 id（比如分岔局的 seed）当成 RNG 种子。
const SECRET = ['"cash":', '"rng":', '"seed":', '"jobs":', '"evals":', '"kin":', '"working":', '"teachers":', '"orders":', '"strategy":'];

function checkPublic(world, seat = 0) {
  const text = JSON.stringify(world.publicView(seat));
  for (const k of SECRET) assert.ok(!text.includes(k), `公开视图里不该出现 ${k}`);
  return text;
}

describe('公开与私密视图（M.6.6）', () => {
  it('从零局：公开视图不含私有字段，私密视图带自家完整 s', () => {
    const w = E.createWorld({ seed: 11, start: '2024-01', days: 30, companies: companies(6) });
    for (let i = 0; i < 30; i++) w.tick();
    const pub = w.publicView(0);
    checkPublic(w, 0);
    assert.equal(pub.companies.length, 6);
    assert.ok(pub.rels.length > 0);
    assert.ok(pub.you && w.companies[pub.you]);
    const pv = w.privateView(pub.you);
    assert.ok(pv && typeof pv.s.cash === 'number');
    assert.ok(Array.isArray(pv.s.jobs.list));
    assert.ok(Array.isArray(pv.s.evals));
    // 公开视图里也不该有别的公司的 s
    for (const c of pub.companies) assert.ok(!('s' in c));
  });

  it('分岔局：公开视图同样不含私有字段，冻结公司的 s 也不会漏出来', () => {
    const w = E.createWorld({ mode: 'fork', start: 2024, seed: 11, days: 30, keep: 12, seats: ['gpt'] });
    for (let i = 0; i < 30; i++) w.tick();
    checkPublic(w, 'gpt');
    const fn = Object.values(w.companies).find(c => c.frozen);
    const pv = w.privateView(fn.id);
    assert.equal(pv.s, null);
    assert.equal(pv.company.frozen, true);
  });
});
