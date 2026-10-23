// P4.2 顾问“抢 SOTA”：在练模型现在发布就能从别家手里拿下 SOTA 标签、而且领先持标者至少 1 分时，
// 送评排在作业建议最前面，档位照公司平时的规则（规格 T9.2 第 3 条下的“抢 SOTA”）。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { qOf } from '../../src/career/sim/sota.js';
import { resolveAll } from '../helpers/career_bot.mjs';

// Claude y2024 按电脑打法走，停在第一个“可以送评、标签在别家手里、没有授名窗口”的日子（种子 1：2024-01-30，
// 在练模型 65.3 分，标签在 GPT-4 Turbo 手里 64.2 分）。
function raceDay() {
  const s = E.createGame('claude', 'y2024', 1);
  for (let i = 0; i < 400 && s.status === 'playing'; i++) {
    resolveAll(s);
    const w = E.workingModel(s);
    const h = s.sota?.holder;
    if (w?.stage === 'post' && E.availableActions(s).release && h && h.by !== 'me' && !E.submitBlock(s, w, 'main') && !E.grantWindow(s, w)) return { s, w, h };
    E.botStep(s, []);
    E.tickDay(s);
  }
  throw new Error('没走到可以抢标签的日子');
}
const firstJob = s => E.advise(s).find(a => a.kind === 'jobs' || String(a.id).startsWith('jobs:'));

describe('P4.2 顾问：抢 SOTA', () => {
  it('领先持标者 ≥ 1 分：第一条作业建议是“抢 SOTA：送评”，档位照公司平时的规则', () => {
    const { s, w, h } = raceDay();
    const q = qOf('llm', w.dims);
    assert.ok(q >= h.q + 1, `前提：领先 ${q - h.q}`);
    const a = firstJob(s);
    assert.equal(a.id, 'jobs:submit');
    assert.match(a.label, /^抢 SOTA：送评 /);
    assert.equal(a.op.arg.tier, E.defaultTier(s));
    assert.match(a.detail, new RegExp(`比标签现在的持有者 ${h.name}`));
  });

  it('领先不到 1 分：不出“抢 SOTA”，照旧按后训练月数的规则', () => {
    const { s, w, h } = raceDay();
    s.sota.holder = { ...h, q: qOf('llm', w.dims) - 0.5 };
    const a = E.advise(s).find(x => x.id === 'jobs:submit');
    assert.ok(!a || !/^抢 SOTA/.test(a.label), a?.label);
  });

  it('标签在自己手里：不用抢', () => {
    const { s, h } = raceDay();
    s.sota.holder = { ...h, by: 'me', q: 0 };
    const a = E.advise(s).find(x => x.id === 'jobs:submit');
    assert.ok(!a || !/^抢 SOTA/.test(a.label), a?.label);
  });
});
