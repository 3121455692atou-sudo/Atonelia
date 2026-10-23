// 真实年代经营模式（v0.7）：对手与能力的拟真。原来在 career.test.mjs 里，按 describe 拆成单独的文件。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { END, dimKeys } from '../../src/career/data/core.js';
import { FAMILIES, RELEASES, RAW_RELEASES } from '../../src/career/data/rivals.js';
import { months } from '../helpers/career_util.mjs';

describe('对手与能力的拟真', () => {
  it('每条发布的能力维度与模态一致、在 0–100 之间', () => {
    for (const r of RELEASES) {
      assert.deepEqual(Object.keys(r.dims), dimKeys(r.mod), r.name);
      for (const v of Object.values(r.dims)) assert.ok(v >= 0 && v <= 100, `${r.name} ${v}`);
      assert.ok(FAMILIES[r.family], r.family);
    }
    assert.equal(RELEASES.length, RAW_RELEASES.length);
  });
  it('任何月份的语言模型第一名都不会是中小模型，DeepSeek Flash 也拿不到 SOTA', () => {
    for (const date of months('2023-01', END)) {
      // 每个家族截至月底的旗舰（familyBest，规格 D1），按综合分 qOf 排。
      const best = Object.keys(FAMILIES).filter(f => FAMILIES[f].mod === 'llm').map(f => E.familyBest(null, f, `${date}-31`)).filter(Boolean);
      const ranked = best.map(r => ({ r, q: E.qOf('llm', r.dims) })).sort((a, b) => b.q - a.q);
      assert.ok(['frontier', 'large'].includes(ranked[0].r.cls), `${date} 第一名是 ${ranked[0].r.name}`);
      assert.notEqual(ranked[0].r.family, 'deepseek', `${date} Flash 成了第一`);
      for (const x of ranked.slice(0, 3)) assert.notEqual(x.r.cls, 'small', `${date} 前三有轻量模型 ${x.r.name}`);
    }
  });
  it('知识上限随总参数增长：小模型学不进前沿模型的知识量', () => {
    assert.ok(E.knowledgeCap(14, 1.2) < E.knowledgeCap(670, 1.2) - 15);
  });
});
