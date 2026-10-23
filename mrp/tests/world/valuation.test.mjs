// M1b-1 估值、档位、指数（M.3.8 第 4、5、6 条）：V 的上下界与合计、期待衰减、买卡不影响别家、两季才升降。
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { GPUS, gpuMarkup } from '../../src/career/data/core.js';
import { quotaFor } from '../../src/career/data/supply.js';
import { interp, MARKET, API_PRICE } from '../../src/career/data/world.js';
import { VALUE_SELF } from '../../src/career/data/selfplay.js';
import { HistoryProvider } from '../../src/career/sim/provider.js';
import {
  valuationView, assetsOf, expectBonus, settleTiers, tierOf, customerRevenue,
} from '../../src/career/world/valuation.js';
import { restoreHistory } from '../helpers/world_provider.mjs';

const names = ['晨星', '北岭', '蓝鲸', '泰拉', '流光', '山巅'];
const companies = (n = 6, tier = 'specialist') => names.slice(0, n).map((name, i) => ({
  name: `${name}智能`, brand: name, country: ['CN', 'US', 'EU'][i % 3], tier, kind: 'bot',
}));

after(() => restoreHistory());

describe('基本面估值（M.3.8 第 4 条）', () => {
  it('每天 V_i ≤ 行业池 + 资产_i；Σ V_i = 行业池 + Σ 资产（误差 ≤ 1 美元）', () => {
    const world = E.createWorld({ seed: 41, start: '2024-01', days: 365, companies: companies(6) });
    for (let i = 0; i < 365; i++) {
      const res = world.tick();
      assert.equal(res.paused, undefined);
      const v = valuationView(world, res.day, { fresh: true });
      let sumV = 0, sumAssets = 0;
      for (const [org, row] of Object.entries(v.rows)) {
        assert.ok(row.V <= v.pool + row.assets + 1e-6, `${res.day} ${org} V ${row.V} > P + 资产 ${v.pool + row.assets}`);
        sumV += row.V;
        sumAssets += row.assets;
      }
      assert.ok(Math.abs(sumV - (v.pool + sumAssets)) <= 1, `${res.day} ΣV 不等于 P + Σ资产`);
    }
  });

  it('大户狂买卡不抬高别家的 V（情绪只读冲击项）', () => {
    const world = E.createWorld({ seed: 42, start: '2024-01', days: 1, companies: companies(4) });
    const [big, ...others] = E.companyList(world);
    const before = valuationView(world, world.day, { fresh: true });
    const keep = Object.fromEntries(others.map(c => [c.id, before.rows[c.id].V]));
    big.s.cash += 5e9;
    big.s.gpus.owned.H100 = (big.s.gpus.owned.H100 || 0) + 20000;
    const after = valuationView(world, world.day, { fresh: true });
    for (const c of others) {
      assert.ok(Math.abs(after.rows[c.id].V - keep[c.id]) < 1e-6, `${c.id} 的 V 被别家买卡抬高了`);
    }
    assert.ok(after.rows[big.id].V > before.rows[big.id].V, '买卡只抬高自己的资产部分');
  });

  it('客户收入只算对话、订阅、API、Coding Plan 四项', () => {
    const world = E.createWorld({ seed: 43, start: '2024-01', days: 1, companies: companies(1) });
    const s = E.companyList(world)[0].s;
    s.history = [{ rev: { chat: 1e7, api: 2e7, coding_plan: 3e7, subscription: 4e7, gpu_lease: 9e7, reseller: 9e7 } }];
    assert.equal(customerRevenue(s), 1e8);
  });

  it('期待加成按 D11 结果 90 天线性衰减到 0', () => {
    const world = E.createWorld({ seed: 44, start: '2024-01', days: 1, companies: companies(1) });
    const s = E.companyList(world)[0].s;
    s.expect.log = [{ day: '2024-01-01', tier: 'challenger', result: 'over' }];
    const full = Math.log(1.10);
    assert.ok(Math.abs(expectBonus(s, '2024-01-01') - full) < 1e-9);
    assert.ok(Math.abs(expectBonus(s, '2024-02-15') - full * 0.5) < 1e-6, '45 天应剩一半');
    assert.equal(expectBonus(s, '2024-04-01'), 0, '90 天以后应为 0');
  });

  it('资产 = 净现金 + 显卡回收价 + 持仓 − 空头', () => {
    const world = E.createWorld({ seed: 45, start: '2024-01', days: 1, companies: companies(1) });
    const s = E.companyList(world)[0].s;
    s.cash = 1000;
    s.gpus.owned = { H100: 2 };
    s.market.holdings = { NVDA: 1 };
    s.market.shorts = { NVDA: 2 };
    const price = E.tickerPrice('NVDA', s.date);
    const expect = 1000 + GPUS.H100.price * 2 * VALUE_SELF.GPU_RESALE + price * 1 - price * 2;
    assert.ok(Math.abs(assetsOf(s) - expect) < 1e-6);
  });
});

describe('公司档位（M.3.8 第 5 条）', () => {
  it('每季度按 V 排；连续两个季度达标才升降', () => {
    const world = E.createWorld({ seed: 46, start: '2024-01', days: 1, companies: companies(6) });
    const list = E.companyList(world);
    list.forEach((c, i) => { c.s.cash = 1e12 - i * 1e10; });
    assert.equal(tierOf(world, list[0].s), 'specialist', '开局档不变');

    settleTiers(world, '2024-03-31');
    for (const c of list) assert.equal(tierOf(world, c.s), 'specialist', '第一个季度只记候选，不升降');

    settleTiers(world, '2024-06-30');
    assert.equal(tierOf(world, list[0].s), 'frontier');
    assert.equal(tierOf(world, list[1].s), 'major');
    assert.equal(tierOf(world, list[5].s), 'small');
  });
});

describe('史实路径不变（HistoryProvider）', () => {
  it('市场、算力、估值、档位、IPO 的返回值仍是改之前那套', () => {
    const hp = new HistoryProvider();
    for (const tier of ['small', 'major', 'frontier']) {
      for (const date of ['2023-06', '2024-06', '2025-11']) {
        const s = { date, company: { tier, country: 'CN' } };
        assert.equal(hp.gpuQuota(s, 'H100'), quotaFor(tier, 'H100', date));
        assert.equal(hp.gpuPrice(s, 'H100'), GPUS.H100.price * gpuMarkup('H100', date, 'CN'));
        assert.equal(hp.gpuAvailable('H100', date, 'CN'), false);   // H100 对中国公司一直禁售
        assert.equal(hp.tierOf(s), tier);
        assert.equal(hp.ipoOpen(s), date >= '2024-01');
        assert.equal(hp.market('chat', 'global', s), interp(MARKET.chat.global, date));
        assert.equal(hp.apiPrice('global', s), interp(API_PRICE.global, date));
        const base = GPUS.H100.rent * { 2023: 1.25, 2024: 1, 2025: 0.75, 2026: 0.6 }[date.slice(0, 4)] * gpuMarkup('H100', date, 'CN');
        const want = hp.gpuAvailable('H100', date, 'CN') ? base : base * 1.4;
        assert.ok(Math.abs(hp.rentPrice(s, 'H100') - want) < 1e-9);
      }
    }
    assert.equal(hp.mode, 'history');
  });
});
