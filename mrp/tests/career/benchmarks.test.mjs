// 真实年代经营模式（v0.7）：榜单。原来在 career.test.mjs 里，按 describe 拆成单独的文件。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { BENCHMARKS, BENCH_BY_ID } from '../../src/career/data/benchmarks.js';
import { resolveAll } from '../helpers/career_bot.mjs';
import { rel } from '../helpers/career_util.mjs';

describe('榜单', () => {
  it('跑分换算与真实公开成绩同一量级', () => {
    const near = (name, bench, real, tol) => {
      const r = rel(name);
      assert.ok(r, name);
      const v = E.rivalScore(BENCH_BY_ID[bench], r, r.date);
      assert.ok(Math.abs(v - real) <= tol, `${name} ${bench} = ${v.toFixed(1)}，真实约 ${real}`);
    };
    near('GPT-4', 'mmlu', 86.4, 5);
    near('Llama 2 70B', 'mmlu', 68.9, 7);
    near('Claude Opus 4.5', 'swebv', 80.9, 6);
    near('Gemini 3 Pro', 'gpqa', 91.9, 4);
    near('GPT-5.2', 'gdpval', 70.9, 8);
    near('Claude Opus 5.5', 'tbench4', 64.9, 10);
  });
  it('基准数据完整：有说明、时间窗口合法、泄漏系数在 0–1', () => {
    const ids = new Set();
    for (const b of BENCHMARKS) {
      assert.ok(!ids.has(b.id), `重复 ${b.id}`);
      ids.add(b.id);
      assert.ok(b.desc && b.from && b.name, b.id);
      if (b.suite) assert.ok(b.suite[0] <= b.suite[1], b.id);
      if (b.leak !== undefined) assert.ok(b.leak >= 0 && b.leak <= 1, b.id);
      for (const d of b.refresh || []) assert.ok(d > b.from, `${b.id} 换题早于发布`);
    }
  });
  it('换题之后，针对旧题刷出来的分数作废', () => {
    const model = { boost: { lcb: { pts: 5, since: '2025-04' } } };
    assert.equal(E.validBoost(model, BENCH_BY_ID.lcb, '2025-08'), 5);
    assert.equal(E.validBoost(model, BENCH_BY_ID.lcb, '2025-09'), 0);
  });
  it('私有题集几乎刷不动，公开老题刷分收益更高', () => {
    const s = E.createGame('deepseek', 'y2024', 3);
    resolveAll(s);
    s.date = '2025-06';
    const pub = E.benchmaxPreview(s, 'mmlu');
    const priv = E.benchmaxPreview(s, 'hle');
    assert.ok(pub && priv);
    assert.ok(pub.gain > priv.gain * 2, `${pub.gain} vs ${priv.gain}`);
  });
  it('老榜单的对手分数会因污染虚高，新榜单基本不会', () => {
    const r = rel('Claude Opus 4.5');
    assert.ok(E.contamination(BENCH_BY_ID.mmlu, r, r.date) > E.contamination(BENCH_BY_ID.swepro, r, r.date));
  });
});
