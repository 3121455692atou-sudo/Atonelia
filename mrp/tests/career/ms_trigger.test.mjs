// 真实年代经营模式（v0.7）：里程碑按条件触发，不按日期。原来在 career.test.mjs 里，按 describe 拆成单独的文件。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { setStance } from '../../src/career/sim/route.js';
import { resolveAll, advanceMonth } from '../helpers/career_bot.mjs';
import { pendingEvents, jumpTo } from '../helpers/career_util.mjs';
import * as L from '../helpers/legacy_jobs.mjs';

describe('里程碑按条件触发，不按日期', () => {
  it('玩 DeepSeek 不做推理模型，到了 2025 年 1 月也不会弹 R1 的事件；“第一个开源推理模型”会被别家拿走', () => {
    const s = E.createGame('deepseek', 'y2024', 8);
    resolveAll(s);
    s.goals = [];
    for (let i = 0; i < 17 && s.status === 'playing'; i++) advanceMonth(s);
    assert.ok(s.date >= '2025-05', s.date);
    // 旧版按日期弹的历史时刻已经删除：队列和排期里都不会有 personal_deepseek_r1。
    assert.ok(!pendingEvents(s).some(q => q?.id === 'personal_deepseek_r1'));
    const ms = s.ms.ms_open_reasoning;
    assert.ok(ms && ms.who !== 'me' && !['deepseek', 'deepseek_pro'].includes(ms.who), JSON.stringify(ms));
  });
  it('玩家抢先发布开源推理模型，这个“行业第一次”归玩家，弹“你们做到了”', () => {
    const s = E.createGame('qwen', 'y2024', 9);
    resolveAll(s);
    jumpTo(s, '2024-11');
    s.techs.push('grpo', 'reasoning');
    const w = E.workingModel(s);
    w.dims.math = 86;
    w.postDays = (w.postDays || 0) + 40;
    s.queue = [];
    L.decide(s, 'release', { open: true });
    const mine = pendingEvents(s).filter(q => q.kind === 'milestone' && q.v === 'mine').map(q => q.id);
    assert.ok(s.ms.ms_open_reasoning?.who === 'me', JSON.stringify(s.ms.ms_open_reasoning));
    assert.ok(mine.includes('ms_open_reasoning'), mine.join(','));
    const v = E.currentEvent({ ...s, queue: [{ kind: 'milestone', id: 'ms_open_reasoning', v: 'mine' }] });
    assert.match(v.text, /比现实早/);
  });
  it('同一次发布最多弹一个自家里程碑，其余的留到以后', () => {
    const s = E.createGame('gpt', 'y2023', 4);
    resolveAll(s);
    s.queue = [];
    const w = E.workingModel(s);
    w.postDays = (w.postDays || 0) + 40;
    // 旗舰开不开源由开源路线定（P1.3）：GPT 开局闭源，这里把路线设成完全开源，这一版旗舰才会开放权重。
    setStance(s, 'open', { src: 'start' });
    L.decide(s, 'release', { open: true });
    const pops = pendingEvents(s).filter(q => q.kind === 'milestone' && q.v === 'mine');
    assert.ok(pops.length <= 2, pops.map(q => q.id).join(','));
    // 没弹出来的“行业第一次”照样记在玩家名下。
    assert.equal(s.ms.ms_open_commercial?.who, 'me');
  });
  it('开局前就发生过的“行业第一次”记在做到的那家名下，不会再弹', () => {
    const s = E.createGame('qwen', 'y2025', 1);
    // 门槛是 atLeast GPT-4 −0.5（P1.4）：GPT-4 自己就够格，开局前就记在 GPT 名下（静默、不弹）。
    assert.equal(s.ms.ms_gpt4?.who, 'gpt', JSON.stringify(s.ms.ms_gpt4));
    assert.equal(s.ms.ms_gpt4.model, 'GPT-4');
    assert.ok(s.ms.ms_gpt4.silent);
    assert.ok(!pendingEvents(s).some(q => q.kind === 'milestone' && q.id === 'ms_gpt4'));
  });
  it('开不开源、公不公开技术报告由玩家决定：不勾就不公开', () => {
    const s = E.createGame('glm', 'y2024', 6);
    resolveAll(s);
    s.queue = [];
    s.firsts = { grpo: s.day };
    if (!s.techs.includes('grpo')) s.techs.push('grpo');
    const w = E.workingModel(s);
    w.postDays = (w.postDays || 0) + 40;
    L.decide(s, 'release', { open: false });
    assert.deepEqual(E.unpublishedFirsts(s), ['grpo']);
    assert.ok(!s.papers.grpo);
    const w2 = E.workingModel(s);
    w2.postDays = (w2.postDays || 0) + 40;
    s.queue = [];
    s.scheduled = [];
    s.deploy = [];
    jumpTo(s, '2024-06');
    L.decide(s, 'release', { open: false, papers: ['grpo'] });
    assert.ok(s.papers.grpo);
  });
  it('里程碑数据完整：史实存在、技术存在、文案里不写死公司名', async () => {
    const { MILESTONES } = await import('../../src/career/data/milestones.js');
    const { histInfo } = await import('../../src/career/data/history.js');
    const { MS_TEXT } = await import('../../src/career/data/milestones_gen.js');
    for (const ms of MILESTONES) {
      assert.ok(histInfo(ms.hist, ms.mod), `${ms.id} 缺史实`);
      if (ms.tech) assert.ok(E.researchOptions || true);
      const t = MS_TEXT[ms.id];
      if (!t) continue;
      const all = JSON.stringify(t);
      assert.ok(!/DeepSeek|OpenAI|Anthropic|谷歌|月之暗面|智谱|20[12]\d 年/.test(all), `${ms.id} 写死了公司或年份`);
      assert.ok(t.mine?.scene?.length >= 3, `${ms.id} 缺短剧`);
    }
  });
});
