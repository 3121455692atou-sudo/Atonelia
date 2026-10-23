// 规格 K4：融资渠道。两轮冷却 180 天、重大成果加成（SOTA ×1.4、千禧年难题 ×2.5，取大不叠加）、
// 战略投资（大公司每年一次，之后一年租卡 85 折）、上市后增发、显卡抵押贷款（借款上限、按月付息、跌价追加）、千禧年难题只发生一次。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { FUNDING, BUBBLE } from '../../src/career/data/economy.js';
import { GPUS } from '../../src/career/data/core.js';
import { fundingOffers, fundingBlock, noteBreakthrough, borrow, repay, borrowLimit, collateralValue, loanMonth, loanOf, millenniumCheck, capitalProcesses } from '../../src/career/sim/capital.js';
import { addDays } from '../../src/career/sim/clock.js';

const game = (id = 'kimi', sc = 'y2024') => E.createGame(id, sc, 5);
// 让一轮融资当场谈完（成功率按局面算，这里把随机数固定成最小）。
function closeRound(s, d) {
  E.startFunding(s, d);
  s.due.funding = s.day;
  s.rng = 0;
  capitalProcesses(s, { notes: [] });
}

describe('融资冷却与重大成果加成', () => {
  it('谈完一轮以后 180 天内不能再谈，写明还要几天；过了就恢复', () => {
    const s = game();
    assert.ok(fundingOffers(s).length > 0);
    closeRound(s, 0.15);
    assert.deepEqual(fundingOffers(s), []);
    assert.match(fundingBlock(s), /天后才能再谈/);
    s.day = addDays(s.day, FUNDING.COOLDOWN);
    assert.ok(fundingOffers(s).length > 0);
  });

  it('拿下 SOTA：90 天内融资估值 ×1.4；千禧年难题 ×2.5；两样不叠加，取大的', () => {
    const s = game();
    const base = fundingOffers(s).find(o => o.dilution === 0.15).amount;
    noteBreakthrough(s, 'sota');
    assert.ok(Math.abs(fundingOffers(s).find(o => o.dilution === 0.15).amount / base - FUNDING.BOOST.sota) < 0.01);
    noteBreakthrough(s, 'millennium');
    assert.ok(Math.abs(fundingOffers(s).find(o => o.dilution === 0.15).amount / base - FUNDING.BOOST.millennium) < 0.01);
    noteBreakthrough(s, 'sota');
    assert.ok(Math.abs(fundingOffers(s).find(o => o.dilution === 0.15).amount / base - FUNDING.BOOST.millennium) < 0.01, '小的不顶掉大的');
    s.day = addDays(s.day, FUNDING.BOOST.millenniumDays + 1);
    assert.ok(Math.abs(fundingOffers(s).find(o => o.dilution === 0.15).amount / base - 1) < 0.01, '过期');
  });
});

describe('战略投资与上市后增发', () => {
  it('大公司（估值 ≥ 100 亿、没上市）每年一次战略投资：出让 10%，之后一年租卡 85 折', () => {
    const s = game('claude', 'y2024');
    s.capital.listed = null;
    s.valuation = Math.max(s.valuation, 2e10);
    const st = fundingOffers(s).find(o => o.strategic);
    assert.ok(st, '应该有战略投资报价');
    assert.equal(st.dilution, FUNDING.STRATEGIC.frac);
    const rent0 = E.P().rentPrice(s, 'H100');
    closeRound(s, st.dilution);
    assert.ok(s.flags.cloudPartner > s.day);
    assert.ok(Math.abs(E.P().rentPrice(s, 'H100') / rent0 - FUNDING.STRATEGIC.rentMult) < 1e-9);
    s.day = addDays(s.day, FUNDING.COOLDOWN);
    assert.ok(!fundingOffers(s).some(o => o.strategic), '一年只有一次');
  });

  it('小公司没有战略投资；上市以后（史实）照样能增发', () => {
    const s = game('perplexity', 'y2024');
    assert.ok(!fundingOffers(s).some(o => o.strategic));
    s.capital.listed = { ticker: 'PPLX', market: '纳斯达克', shares: 1e9, price: 5, history: [] };
    const fo = fundingOffers(s);
    assert.ok(fo.length && fo.every(o => o.followOn));
    const shares0 = s.capital.listed.shares;
    closeRound(s, 0.1);
    assert.ok(s.capital.listed.shares > shares0);
  });
});

describe('显卡抵押贷款', () => {
  it('上限 = 自有卡回收价 × 50%；借钱进现金，按月付息；还款扣现金', () => {
    const s = game();
    const coll = collateralValue(s);
    assert.ok(coll > 0);
    assert.ok(Math.abs(borrowLimit(s) - coll * FUNDING.LOAN.ltv) < 1e-6);
    const c0 = s.cash;
    const r = borrow(s, 1e12);
    assert.ok(Math.abs(r.amount - coll * FUNDING.LOAN.ltv) < 1e-6, '借满为止');
    assert.ok(Math.abs(s.cash - c0 - r.amount) < 1e-6);
    assert.throws(() => borrow(s, 1), /额度用完/);
    const c1 = s.cash;
    const interest = loanMonth(s, { notes: [] });
    assert.ok(Math.abs(interest - r.amount * FUNDING.LOAN.rate / 12) < 1e-6);
    assert.ok(Math.abs(c1 - s.cash - interest) < 1e-6);
    repay(s, r.amount / 2);
    assert.ok(Math.abs(loanOf(s) - r.amount / 2) < 1e-6);
  });

  it('卡跌价（泡沫破裂回收价 ×0.6）抵押不够：先用现金还，不够就卖卡', () => {
    const s = game();
    borrow(s, 1e12);
    const owe = loanOf(s);
    // 泡沫破裂：回收价 ×0.6。现金先清零，逼它卖卡。
    s.bubble = { day: s.day, until: addDays(s.day, BUBBLE.DAYS), averted: false };
    s.cash = 0;
    const cards0 = Object.values(s.gpus.owned).reduce((a, n) => a + n, 0);
    loanMonth(s, { notes: [] });
    const cards1 = Object.values(s.gpus.owned).reduce((a, n) => a + n, 0);
    assert.ok(cards1 < cards0, '卖了卡');
    assert.ok(loanOf(s) < owe, '还了一部分');
    assert.ok(loanOf(s) <= collateralValue(s) * FUNDING.LOAN.ltv + 1, '回到抵押线以内');
    assert.ok(s.queue.some(q => q.title === '贷款追加'));
    void GPUS;
  });
});

describe('千禧年难题（虚构）', () => {
  it('在线旗舰会推理、数学 ≥ 95 时按（公司、月份）散列触发，只发生一次，融资估值 ×2.5', () => {
    const s = game('gpt', 'y2025');
    const m = s.models.find(x => x.id === s.live);
    m.techs = [...new Set([...(m.techs || []), 'reasoning'])]; m.dims.math = 96;
    let hit = false;
    for (let k = 0; k < 120 && !hit; k++) {
      const [y, mo] = s.date.split('-').map(Number);
      s.date = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
      hit = millenniumCheck(s, { notes: [] });
    }
    assert.ok(hit, '120 个月里总该碰上一次');
    assert.ok(s.marks.millennium);
    assert.equal(s.flags.fundBoost.mult, FUNDING.BOOST.millennium);
    assert.equal(millenniumCheck(s, { notes: [] }), false, '只发生一次');
    const s2 = game('gpt', 'y2025');
    s2.models.find(x => x.id === s2.live).dims.math = 80;
    assert.equal(millenniumCheck(s2, { notes: [] }), false, '能力不够不触发');
  });
});
