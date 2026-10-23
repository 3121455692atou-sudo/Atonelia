// M1b-1 客户市场（M.3.8 第 1、2 条）：共用月结份额守恒、d* 查表、90 天平滑、1.3 倍封顶。
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { MARKET, interp } from '../../src/career/data/world.js';
import { MARKET_SELF } from '../../src/career/data/selfplay.js';
import { addDays } from '../../src/career/sim/clock.js';
import { dStar, marketValueOf, realMilestones } from '../../src/career/world/market.js';
import { restoreHistory } from '../helpers/world_provider.mjs';

const names = ['晨星', '北岭', '蓝鲸', '泰拉', '流光', '山巅'];
const companies = (n = 6, tier = 'specialist') => names.slice(0, n).map((name, i) => ({
  name: `${name}智能`, brand: name, country: ['CN', 'US', 'EU'][i % 3], tier, kind: 'bot',
}));
const ym = day => day.slice(0, 7);
const monthEnd = day => addDays(day, 1).slice(0, 7) !== day.slice(0, 7);

after(() => restoreHistory());

describe('客户市场（M.3.8 第 1、2 条）', () => {
  it('6 家从零 2024 跑满一年：每个月的份额（各家、学界、不用 AI）都加起来 100% ± 0.01%', () => {
    const DAYS = 366;
    const world = E.createWorld({ seed: 11, start: '2024-01', days: DAYS, companies: companies(6) });
    const months = new Set();
    let sawCompany = false;
    for (let i = 0; i < DAYS; i++) {
      const res = world.tick();
      assert.equal(res.paused, undefined);
      if (!monthEnd(res.day)) continue;
      const table = world.market.table;
      assert.equal(world.market.month, ym(res.day), `${res.day} 月结表的月份`);
      assert.ok(Object.keys(table).length > 0, `${res.day} 没有月结表`);
      for (const [key, entry] of Object.entries(table)) {
        const parts = entry.rows.reduce((a, r) => a + r.share, 0) + (entry.outside?.share ?? 0);
        assert.ok(Math.abs(parts - 1) <= 1e-4, `${res.day} ${key} 份额合计 ${parts}`);
        assert.ok(entry.rows.every(r => r.share >= 0), `${res.day} ${key} 有负份额`);
        assert.ok(entry.outside?.share > 0, `${res.day} ${key} 没有“不用 AI”`);
        assert.ok(entry.rows.some(r => r.org === 'academia'), `${res.day} ${key} 没有学界自部署`);
        sawCompany ||= entry.rows.some(r => r.org !== 'academia');
      }
      months.add(world.market.month);
    }
    assert.equal(months.size, 12, `应有 12 个月，实际 ${months.size}`);
    assert.ok(sawCompany, '365 天里至少该有一家公司在卖');
  });

  it('d*：真实历史第一次达到本局最强的那一天；市场规模按 d* 做 90 天平滑', () => {
    const world = E.createWorld({ seed: 21, start: '2024-01', days: 1, companies: companies(1) });
    const real = realMilestones();
    // 本局最强压到 0：d* 取真实历史第一天。
    world.acad.q = 0;
    world.market.refs = null;
    assert.equal(dStar(world, '2024-01-15'), real[0].day);
    const got = marketValueOf(world, 'chat', 'global', '2024-01-15');
    let sum = 0;
    for (let i = 0; i < MARKET_SELF.SMOOTH; i++) sum += interp(MARKET.chat.global, ym(addDays(real[0].day, -i)));
    const smooth = sum / MARKET_SELF.SMOOTH;
    const capped = Math.min(smooth, interp(MARKET.chat.global, '2024-01') * MARKET_SELF.AHEAD_CAP);
    assert.ok(Math.abs(got - capped) < 1e-6, `chat 市场 ${got} 应等于 ${capped}`);
  });

  it('领先真实历史时封顶在今天日历值的 1.3 倍', () => {
    const world = E.createWorld({ seed: 22, start: '2024-01', days: 1, companies: companies(1) });
    const real = realMilestones();
    world.acad.q = 999;
    world.market.refs = null;
    assert.equal(dStar(world, '2024-01-15'), real[real.length - 1].day, '超出真实历史时取最后一个真实发布日');
    const today = interp(MARKET.chat.global, '2024-01');
    const got = marketValueOf(world, 'chat', 'global', '2024-01-15');
    assert.ok(Math.abs(got - today * MARKET_SELF.AHEAD_CAP) < 1e-6, `应封顶在 ${today * 1.3}，实际 ${got}`);
    // API 参考价也走同一套 d* + 平滑 + 封顶。
    const api = marketValueOf(world, 'api', 'global', '2024-01-15');
    assert.ok(Number.isFinite(api) && api > 0);
  });
});
