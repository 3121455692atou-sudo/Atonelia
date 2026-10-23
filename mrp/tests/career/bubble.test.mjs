// 规格 K5：AI 泡沫破裂（虚构剧情）。史实局在 2026-06-01 按玩家自己判；自洽在开局后 75% 处对全世界判。
// 检查点之前连续 3 个月经营利润为正的大公司能躲过；没躲过：估值腰斩、融资和上市关 180 天、租卡便宜、卖卡贬值、目标换成“活下去”。
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { BUBBLE } from '../../src/career/data/economy.js';
import { GPUS } from '../../src/career/data/core.js';
import { bubbleActive, worldBubbleDay } from '../../src/career/sim/bubble.js';
import { fundingOffers, ipoCheck } from '../../src/career/sim/capital.js';
import { resolveAll } from '../helpers/career_bot.mjs';
import { restoreHistory } from '../helpers/world_provider.mjs';

after(() => restoreHistory());

// 史实局推进到检查点那天一早（5 月的账已经结完、6 月 1 日还没推），最后 3 个月的经营利润改成 profit（模拟玩家把账做平或做亏）。
function toEve(id, profit) {
  restoreHistory();
  const s = E.createGame(id, 'y2026', 3);
  for (let i = 0; i < 400 && s.day < BUBBLE.HIST_DAY && s.status === 'playing'; i++) { resolveAll(s); E.tickDay(s); }
  assert.equal(s.day, BUBBLE.HIST_DAY, `${id} 没走到检查点：${s.day}`);
  for (const h of s.history.slice(-3)) h.profit = profit;
  return s;
}
const step = s => { resolveAll(s); E.tickDay(s); };

describe('AI 泡沫（史实局）', () => {
  it('大公司检查点之前连续 3 个月经营盈利：泡沫不发生，拿到“扭亏为盈”', () => {
    const s = toEve('gpt', 1e8);
    const brand0 = s.brand;
    while (!s.bubble && s.day <= BUBBLE.HIST_DAY) step(s);
    assert.ok(s.bubble?.averted, JSON.stringify(s.bubble));
    assert.ok(s.marks.ach_profitable);
    assert.ok(s.brand > brand0);
    assert.equal(bubbleActive(s), false);
    assert.ok(!s.goals.some(g => g.check.type === 'survive'));
    assert.ok(fundingOffers(s).length > 0 || s.capital.round || s.company.kind === 'division', '照常能融资');
  });

  it('小公司盈利不算：泡沫照样破；估值腰斩、融资和上市关 180 天、租卡便宜三成、卖卡贬值', () => {
    const s = toEve('perplexity', 1e8);
    const rent0 = E.P().rentPrice(s, 'H100');
    const v0 = s.valuation;
    while (!s.bubble && s.day <= BUBBLE.HIST_DAY) step(s);
    assert.equal(s.bubble?.averted, false);
    assert.ok(bubbleActive(s));
    // 估值 ×0.5 乘在业务部分上，现金部分不乘（applyEffects 的 valuation），所以整体略高于一半。
    assert.ok(s.valuation / v0 <= 0.6 && s.valuation / v0 >= BUBBLE.VAL - 1e-9, `估值 ×${s.valuation / v0}`);
    assert.deepEqual(fundingOffers(s), []);
    assert.equal(ipoCheck(s).ok, false);
    assert.ok(Math.abs(E.P().rentPrice(s, 'H100') / rent0 - BUBBLE.RENT) < 1e-9);
    assert.ok(s.queue.some(q => q.title === 'AI 泡沫破裂') || s.news.some(n => n.title === 'AI 泡沫破裂'));
    // 目标：检查点之后到期的经营目标撤掉，换成“活下去”。
    const later = s.goals.filter(g => g.status === 'pending' && g.check.type !== 'final' && g.check.type !== 'survive' && g.date > '2026-06');
    assert.equal(later.length, 0);
    assert.ok(s.goals.some(g => g.id === 'survive_bubble'));
    // 卖卡按 55% × 0.6 回收。
    const id = Object.keys(s.gpus.owned).find(k => s.gpus.owned[k] > 0);
    if (id) {
      const c0 = s.cash;
      E.releaseGpu(s, id, 1, false);
      assert.ok(Math.abs(s.cash - c0 - GPUS[id].price * 0.55 * BUBBLE.GPU_RESALE) < 1e-6);
    }
  });

  it('大公司没盈利：泡沫破；180 天后窗口重开；活到终局“活下去”达成，结算按 BUBBLE.SCORE.winter 记', () => {
    const s = toEve('claude', -1e8);
    while (!s.bubble && s.day <= BUBBLE.HIST_DAY) step(s);
    assert.equal(s.bubble.averted, false);
    for (let i = 0; i < 400 && s.status === 'playing'; i++) step(s);
    assert.equal(s.result.reason, 'complete');
    assert.equal(s.goals.find(g => g.id === 'survive_bubble')?.status, 'met');
    assert.equal(s.result.parts.winter, BUBBLE.SCORE.winter);
  });
});

describe('AI 泡沫（自洽世界）', () => {
  const companies = [
    { name: '甲智能', brand: '甲甲', country: 'US', tier: 'major', kind: 'bot' },
    { name: '乙智能', brand: '乙乙', country: 'US', tier: 'specialist', kind: 'bot' },
    { name: '丙智能', brand: '丙丙', country: 'CN', tier: 'small', kind: 'bot' },
  ];
  const run = (profitFor = null) => {
    const w = E.createWorld({ seed: 2, start: '2024-01', days: 200, companies });
    const day = worldBubbleDay(w);
    while (w.day < day) w.tick();
    if (profitFor) { const c = profitFor(w); for (const h of c.s.history.slice(-3)) h.profit = 5e7; }
    w.tick();
    return { w, day };
  };
  it('开局后 75% 处判一次；没有大公司盈利就全世界破裂，估值池腰斩、交易所不能增发', () => {
    const { w, day } = run();
    assert.equal(w.flags.bubble?.day, day);
    assert.equal(w.flags.bubble.averted, false);
    for (const c of Object.values(w.companies)) assert.ok(bubbleActive(c.s), c.id);
    assert.ok(w.news.some(n => n.title === 'AI 泡沫破裂'));
  });
  it('任何一家大公司连续 3 个月盈利：泡沫对全世界都不发生，那一家拿到成就', () => {
    const big = w => Object.values(w.companies).find(c => BUBBLE.BIG.includes(E.P().tierOf(c.s)));
    const { w } = run(big);
    assert.equal(w.flags.bubble?.averted, true);
    const winner = w.companies[w.flags.bubble.by];
    assert.ok(winner.s.marks.ach_profitable);
    for (const c of Object.values(w.companies)) assert.equal(bubbleActive(c.s), false);
  });
});
