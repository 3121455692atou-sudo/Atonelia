// 世界 SOTA 账本（M.3.4）的构造夹具：挂标、挡住挑战、换手、稳坐、made、projectSota。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { blankLabel, offerLabel, steadyCheck, projectSota } from '../../src/career/world/label.js';

function fixture(acadQ = 40) {
  return {
    day: '2024-06-01', mod: 'llm', rels: [], relIds: {}, relMeta: {}, ms: {},
    label: blankLabel(), acad: { q: acadQ, start: acadQ, gains: [], publishers: [] }, companies: {}, _seq: 0,
  };
}
function rel(w, org, name, q, day = '2024-06-01', { open = false, kin = [], seq } = {}) {
  const relId = name;
  w.relMeta[relId] = {
    org, relId, modelId: `${name}m`, name, q, dims: { knowledge: q, code: q, math: q, writing: q, agent: q },
    day, open, kin, seq: seq ?? ++w._seq,
  };
  return w.relMeta[relId];
}

describe('世界 SOTA 账本（M.3.4）', () => {
  it('场地凑满后挂标；挡住 1 分内、血统干净的挑战才算数', () => {
    const w = fixture();
    const a = rel(w, 'A', 'a1', 45);
    const b = rel(w, 'B', 'b1', 44);
    assert.equal(offerLabel(w, a).result, null, '场地不足时不该挂标');
    assert.equal(offerLabel(w, b).result, 'fill');
    assert.equal(w.label.holder.org, 'A');
    assert.equal(w.label.holder.counted, false, '只领先 1 分，不算炼出');
    assert.equal((w.label.made.A || []).length, 0);
    const c = rel(w, 'C', 'c1', 44.5);
    assert.equal(offerLabel(w, c).result, 'defend');
    assert.equal(w.label.holder.org, 'A');
    assert.equal(w.label.holder.counted, true);
    assert.equal(w.label.made.A.length, 1);
    assert.equal(w.label.made.A[0].via, 'defend');
  });

  it('挑战者的完整血统里有持有者那家：不算挑战、不记 made', () => {
    const w = fixture();
    const a = rel(w, 'A', 'a1', 45);
    const b = rel(w, 'B', 'b1', 44.5, '2024-06-01', { kin: ['A'] });
    offerLabel(w, a);
    offerLabel(w, b);
    assert.equal(w.label.holder.org, 'A');
    assert.equal(w.label.holder.counted, false);
    assert.equal((w.label.made.A || []).length, 0);
  });

  it('高出 EPS 就换手；自家换代继承算不算数', () => {
    const w = fixture();
    const a = rel(w, 'A', 'a1', 45, '2024-06-01');
    const c = rel(w, 'C', 'c1', 43, '2024-06-01');
    offerLabel(w, a);
    assert.equal(offerLabel(w, c).result, 'fill');
    assert.equal(w.label.holder.org, 'A');
    const b = rel(w, 'B', 'b1', 46.2, '2024-06-02');
    assert.equal(offerLabel(w, b).result, 'swap');
    assert.equal(w.label.holder.org, 'B');
    assert.equal(w.label.holder.counted, true);
    assert.equal(w.label.made.B[0].via, 'swap');
    const a2 = rel(w, 'A', 'a2', 50, '2024-06-03');
    assert.equal(offerLabel(w, a2).result, 'swap');
    assert.equal(w.label.holder.org, 'A');
    assert.equal(w.label.made.A[0].via, 'swap');
    const a3 = rel(w, 'A', 'a3', 50.5, '2024-06-04');
    assert.equal(offerLabel(w, a3).result, 'self');
    assert.equal(w.label.holder.relId, 'a3');
    assert.equal(w.label.holder.counted, true);
    assert.equal(w.label.made.A.length, 2, '自家换代也要记一条 made');
  });

  it('领先别家 ≥ 3 分连续 30 天：稳坐也算炼出', () => {
    const w = fixture();
    rel(w, 'A', 'a1', 46);
    rel(w, 'B', 'b1', 42);
    w.label.holder = { org: 'A', relId: 'a1', modelId: 'a1m', name: 'a1', q: 46, kin: [], counted: false, countedAt: null, since: '2024-06-01', via: 'fill' };
    w.label.steadySince = '2024-06-01';
    assert.equal(steadyCheck(w, '2024-06-30'), null, '第 29 天还不算');
    assert.equal(steadyCheck(w, '2024-07-01'), 'steady');
    assert.equal(w.label.holder.counted, true);
    assert.equal(w.label.made.A[0].via, 'steady');
  });

  it('projectSota：本家 by=me 写快照 id，别家 by=公司 id 写 relId；made 换成本家数组', () => {
    const w = fixture();
    w.label.holder = { org: 'A', relId: 'a1', modelId: 'a1m', name: 'a1', q: 46, since: '2024-06-01', via: 'fill', counted: true, countedAt: '2024-06-01', kin: [] };
    w.label.field = ['A', 'B'];
    w.label.made = { A: [{ relId: 'a1', modelId: 'a1m', day: '2024-06-01', q: 46, via: 'fill' }] };
    const sa = { sota: { holder: null, field: [], log: [], made: [], before: false } };
    const sb = { sota: { holder: null, field: [], log: [], made: [], before: false } };
    projectSota(w, 'A', sa);
    projectSota(w, 'B', sb);
    assert.deepEqual(sa.sota.holder, { by: 'me', org: 'A', id: 'a1m', name: 'a1', q: 46, since: '2024-06-01', via: 'fill', counted: true, countedAt: '2024-06-01' });
    assert.equal(sb.sota.holder.by, 'A');
    assert.equal(sb.sota.holder.id, 'a1');
    assert.deepEqual(sb.sota.field, ['A', 'B']);
    assert.equal(sa.sota.made.length, 1);
    assert.equal(sb.sota.made.length, 0);
  });
});
