// 真实年代经营模式（v0.7）：研究要花时间。原来在 career.test.mjs 里，按 describe 拆成单独的文件。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { resolveAll } from '../helpers/career_bot.mjs';
import { jumpTo } from '../helpers/career_util.mjs';

describe('研究要花时间', () => {
  it('排进研究槽不会马上学会，要按天推进；做完才进已掌握', () => {
    const s = E.createGame('qwen', 'y2024', 11);
    resolveAll(s);
    const opt = E.researchOptions(s).find(x => x.check.ok);
    E.researchTech(s, opt.t.id);
    assert.ok(!s.techs.includes(opt.t.id));
    assert.equal(s.research.length, 1);
    const days = E.daysLeft(s, s.research[0]);
    assert.ok(days >= 10, `${opt.t.name} 只要 ${days} 天`);
    for (let i = 0; i < days + 40 && !s.techs.includes(opt.t.id); i++) { resolveAll(s); E.tickDay(s); }
    assert.ok(s.techs.includes(opt.t.id), '到时间也没学会');
  });
  it('别人开源过的照着学最快，有论文次之，没人公开过只能自研、最慢；自家这条线的现实成果不算公开', () => {
    const s = E.createGame('kimi', 'y2024', 3);
    const t = E.TECH_BY_ID?.reasoning || { id: 'reasoning', cost: 60, from: '2024-09' };
    const need = ym => { jumpTo(s, ym); return E.researchNeed(s, t); };
    const lv = ym => { jumpTo(s, ym); return E.techStatus(s, t).level; };
    assert.equal(lv('2024-06'), 'secret');
    assert.equal(lv('2024-10'), 'proof');
    assert.equal(lv('2025-02'), 'open');
    assert.ok(need('2024-06') > need('2024-10') && need('2024-10') > need('2025-02'));
    // DeepSeek 自己就是 R1 的那条线：R1 开源不算数，要等 Kimi 的论文。
    const d = E.createGame('deepseek', 'y2024', 3);
    jumpTo(d, '2025-02');
    const st = E.techStatus(d, t);
    assert.notEqual(st.src?.fam, 'deepseek_pro');
  });
  it('有前置技术：推理要先会 GRPO 一类的强化学习算法', () => {
    const s = E.createGame('qwen', 'y2024', 5);
    jumpTo(s, '2024-10');
    s.techs = s.techs.filter(x => x !== 'grpo' && x !== 'reasoning');
    const c = E.researchCheck(s, { id: 'reasoning', mod: 'llm', name: '长思维链推理 RL', cost: 60, from: '2024-09' });
    assert.equal(c.ok, false);
    assert.match(c.reason, /GRPO/);
  });
  it('技术积累越厚，研究越快、越不容易炼炸', () => {
    const s = E.createGame('glm', 'y2024', 2);
    resolveAll(s);
    s.know = 0;
    const slow = E.researchSpeed(s);
    const st = { total: 300, active: 30, arch: 'moe' };
    const risky = E.projectRisk(s, st);
    s.know = 400;
    assert.ok(E.researchSpeed(s) > slow * 1.3);
    assert.ok(E.projectRisk(s, st) < risky);
  });
  it('蒸馏拖慢研究和技术积累', () => {
    const s = E.createGame('minimax', 'y2025', 4);
    resolveAll(s);
    const fast = E.researchSpeed(s);
    s.distillDep = 0.6;
    assert.ok(E.researchSpeed(s) < fast * 0.85);
  });
});
