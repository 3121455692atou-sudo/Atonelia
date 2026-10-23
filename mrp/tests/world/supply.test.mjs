// M1b-1 算力池（M.3.8 第 3 条）：共用供给、季末统一价、按比例分配与顺延、租卡池、管制开关。
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { GPUS, gpuMarkup } from '../../src/career/data/core.js';
import { quotaFor } from '../../src/career/data/supply.js';
import { SUPPLY_SELF } from '../../src/career/data/selfplay.js';
import {
  quarterCap, settleSupply, gpuPriceOf, rentPriceOf, rentPool, rentQuotaOf, gpuAvailableOf,
} from '../../src/career/world/supply.js';
import { restoreHistory } from '../helpers/world_provider.mjs';

const names = ['晨星', '北岭', '蓝鲸', '泰拉', '流光', '山巅'];
const companies = (n = 2, tier = 'small') => names.slice(0, n).map((name, i) => ({
  name: `${name}智能`, brand: name, country: ['US', 'EU', 'CN'][i % 3], tier, kind: 'bot',
}));
const setup = (n = 2, tier = 'small') => {
  const w = E.createWorld({ seed: 31, start: '2024-01', days: 1, companies: companies(n, tier) });
  for (const c of E.companyList(w)) { c.s.cash = 1e9; c.s.quota = {}; }
  return w;
};

after(() => restoreHistory());

describe('算力池（M.3.8 第 3 条）', () => {
  it('总供给 = Σ 开局档原配额 × MULT；新卡头两个季度减半', () => {
    const w = setup(3, 'specialist');
    const cap = quarterCap(w, '2024-03-31');
    let expected = 0;
    for (const c of E.companyList(w)) expected += quotaFor(c.tier0, 'H100', '2024-03-31');
    expected = Math.round(expected * SUPPLY_SELF.MULT);
    assert.equal(cap.H100, expected);
    // H20 2024-02 上市：头两个季度减半（quotaFor 的 fresh = 0.5）。
    let h20 = 0;
    for (const c of E.companyList(w)) h20 += quotaFor(c.tier0, 'H20', '2024-03-31');
    assert.equal(cap.H20, Math.round(h20 * SUPPLY_SELF.MULT));
    assert.ok(cap.H20 < cap.H100, '新卡头两个季度应减半');
  });

  it('一次下满和分批下单，季末付同一个统一价', () => {
    const w = setup(2);
    const [a, b] = E.companyList(w);
    E.buyGpu(a.s, 'H100', 1000);
    E.buyGpu(b.s, 'H100', 500);
    E.buyGpu(b.s, 'H100', 500);
    const cap = { ...quarterCap(w, w.day), H100: 1000 };
    const report = settleSupply(w, '2024-03-31', cap);
    assert.equal(report.demand.H100, 2000);
    assert.equal(report.cap.H100, 1000);
    const factor = Math.sqrt(2000 / 1000);
    assert.ok(Math.abs(report.factor.H100 - Math.round(factor * 100) / 100) < 0.011);
    const ea = w.supply.entries.filter(e => e.org === a.id && e.q === '2024Q1');
    const eb = w.supply.entries.filter(e => e.org === b.id && e.q === '2024Q1');
    assert.equal(ea.reduce((s, e) => s + e.award, 0), 500);
    assert.equal(eb.reduce((s, e) => s + e.award, 0), 500);
    assert.equal(ea[0].factor, eb[0].factor, '所有人同一个统一价');
    const unit = GPUS.H100.price;
    const perCard = unit * factor;
    assert.ok(Math.abs(ea[0].charge / ea[0].award - perCard) < 1e-6);
    assert.ok(Math.abs((1e9 - a.s.cash) - perCard * 500) < 1e-3, '多退少补后的实际支出');
    // 季末之后这一季的报价就是统一价。
    a.s.date = '2024-03';
    assert.ok(Math.abs(gpuPriceOf(w, a.s, 'H100') - perCard) < 1e-6);
  });

  it('超供给按订单比例分，没分到的下季度优先交付', () => {
    const w = setup(2);
    const [a, b] = E.companyList(w);
    E.buyGpu(a.s, 'H100', 400);
    E.buyGpu(b.s, 'H100', 200);
    const cap1 = { ...quarterCap(w, w.day), H100: 300 };
    settleSupply(w, '2024-03-31', cap1);
    const a1 = w.supply.entries.filter(e => e.org === a.id && e.q === '2024Q1');
    const b1 = w.supply.entries.filter(e => e.org === b.id && e.q === '2024Q1');
    assert.equal(a1[0].award, 200, '400/600 × 300');
    assert.equal(b1[0].award, 100, '200/600 × 300');
    const carryA = w.supply.entries.filter(e => e.org === a.id && e.carry);
    const carryB = w.supply.entries.filter(e => e.org === b.id && e.carry);
    assert.equal(carryA[0].n, 200);
    assert.equal(carryB[0].n, 100);
    assert.equal(carryA[0].q, '2024Q2');
    assert.equal(carryA[0].eta, '2024-04-01');

    // 下季度：顺延的 300 张先拿，新订单只能分剩下的 200 张（总供给 500）。
    a.s.date = '2024-04'; a.s.day = '2024-04-01';
    E.buyGpu(a.s, 'H100', 900);
    const cap2 = { ...quarterCap(w, '2024-06-30'), H100: 500 };
    const r2 = settleSupply(w, '2024-06-30', cap2);
    assert.equal(r2.demand.H100, 1200);
    const carry2 = w.supply.entries.filter(e => e.carry && e.q === '2024Q2' && e.settled === '2024Q2');
    assert.equal(carry2.reduce((s, e) => s + e.award, 0), 300, '顺延部分优先、全额交付');
    const fresh2 = w.supply.entries.filter(e => e.q === '2024Q2' && !e.carry && e.settled === '2024Q2');
    assert.equal(fresh2.reduce((s, e) => s + e.award, 0), 200, '新订单只拿到剩下的 200 张');
  });

  it('租金按那张卡自己的月租算，不低于 0.5 倍；出租的卡进池子', () => {
    const w = setup(2);
    const a = E.companyList(w)[0];
    const pool0 = rentPool(w, a.s.day);
    assert.equal(pool0.factor, SUPPLY_SELF.RENT_FLOOR, '没有需求时按 0.5 倍下限');
    const base = id => GPUS[id].rent;
    for (const id of ['A100', 'H100', 'H200']) {
      const got = rentPriceOf(w, a.s, id);
      assert.ok(Math.abs(got - base(id) * pool0.factor) < 1e-6, `${id} 应按自己的月租算`);
    }
    assert.notEqual(rentPriceOf(w, a.s, 'A100'), rentPriceOf(w, a.s, 'H100'), '不再一律按 H100');

    // 出租的卡增加供给；租入的需求把它对冲，价格随需求/供给上升。
    const b = E.companyList(w)[1];
    const cards = E.gpuCount(a.s);
    a.s.products.gpu_lease = { on: true, gpus: cards };
    const withLease = rentPool(w, a.s.day);
    assert.equal(withLease.leased, cards);
    assert.ok(withLease.supply > pool0.supply);
    b.s.gpus.rented = { H100: 2000 };
    const busy = rentPool(w, a.s.day);
    assert.ok(busy.demand >= 2000);
    const got = rentPriceOf(w, a.s, 'A100');
    assert.ok(got >= base('A100') * SUPPLY_SELF.RENT_FLOOR - 1e-9, '不低于 0.5 倍');
    assert.ok(Math.abs(got - base('A100') * busy.factor) < 1e-6);
    assert.ok(rentQuotaOf(w, b.s) >= 0);
  });

  it('出口管制只读 world.flags.export', () => {
    const w = setup(1);
    w.flags.export = false;
    assert.equal(gpuAvailableOf(w, 'H100', '2024-06-01', 'CN'), true);
    w.flags.export = true;
    assert.equal(gpuAvailableOf(w, 'H100', '2024-06-01', 'CN'), false);
    assert.equal(gpuAvailableOf(w, 'H100', '2024-06-01', 'US'), true);
    assert.equal(gpuAvailableOf(w, 'A800', '2024-06-01', 'CN'), false, '停产的型号买不到');
    assert.equal(gpuAvailableOf(w, 'H20', '2024-06-01', 'US'), false, '中国特供卡海外买不到');
  });
});
