// M2a 交易所（规格 M.5.5、M.5.10、F2 M2 行 ①②③⑤）：守恒、拉高出货必亏、最后 45 天抬价、轧空封顶、现金来回、
// 小号送钱、命令正反例、电脑炒股、上市、自家股票、禁空、公示、强平、存档。
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { EXCHANGE as X } from '../../src/career/data/exchange.js';
import { listCompany, buy, sell, short, cover, buyback, issue, poolPrice, fairPrice, finalWealth, exchangeOpen, exchangeClose, SHARES0, lendable } from '../../src/career/world/exchange.js';
import { assetsOf } from '../../src/career/world/valuation.js';
import { tradeTick } from '../../src/career/world/bots.js';
import { addDays } from '../../src/career/sim/clock.js';
import { restoreHistory } from '../helpers/world_provider.mjs';

after(() => restoreHistory());

const NAMES = ['晨星', '北岭', '蓝鲸', '泰拉', '流光', '山巅'];
const companies = n => NAMES.slice(0, n).map((name, i) => ({ name: `${name}智能`, brand: name, country: ['CN', 'US', 'EU'][i % 3], tier: 'specialist', kind: 'bot' }));
// 开一个世界，跑几天，给每家定一个估值和现金，第一家上市（上市日往前挪 200 天，可以做空）。
function setup(n = 4, { cash = 2e9, V = 5e9 } = {}) {
  const w = E.createWorld({ seed: 3, start: '2024-01', days: 730, companies: companies(n) });
  for (let i = 0; i < 3; i++) w.tick();
  const ids = Object.keys(w.companies).sort();
  for (const id of ids) { const s = w.companies[id].s; s.valuation = V; s.cash = cash; }
  const L = listCompany(w, w.companies[ids[0]].s, 0.2);
  L.listedDay = addDays(w.day, -200);
  w.companies[ids[0]].joined = addDays(w.day, -200);     // 也过了新手保护期（M.5.7），可以被做空
  return { w, ids, L, S: id => w.companies[id].s };
}
const nextDay = w => { w.day = addDays(w.day, 1); };
let seedN = 12345;
const rnd = () => { seedN = (seedN * 1103515245 + 12345) % 2147483648; return seedN / 2147483648; };
const tryDo = f => { try { return f(); } catch { return null; } };

describe('交易所（M2a）：上市', () => {
  it('发行价 = V ÷ 总股本 × 0.85；公司拿全部发行款，持股按发行比例摊薄；发行的一半进池、一半给长线基金', () => {
    const w = E.createWorld({ seed: 3, start: '2024-01', days: 730, companies: companies(3) });
    w.tick();
    const s = Object.values(w.companies)[0].s;
    s.valuation = 6e9; s.cash = 1e8; s.equity = 0.8;
    const L = listCompany(w, s, 0.3);
    const N = SHARES0 * 0.3 / 0.7;
    const price = 6e9 / SHARES0 * X.IPO.discount;
    assert.ok(Math.abs(L.issuePrice - price) < 1e-9);
    assert.ok(Math.abs(s.cash - (1e8 + N * price)) < 1);
    assert.ok(Math.abs(s.equity - 0.8 * 0.7) < 1e-12);
    assert.ok(Math.abs(L.pool.s - N / 2) < 1e-6 && Math.abs(L.npcLong - N / 2) < 1e-6);
    assert.ok(Math.abs(poolPrice(L) - price) < 1e-9);
    assert.equal(L.total, SHARES0 + N);
    assert.throws(() => listCompany(w, s, 0.2), /已经上市/);
  });

  it('终局身家：上市取 V，未上市取 V × 0.8（M.5.10）', () => {
    const { w, ids, S } = setup(3);
    const listed = S(ids[0]), not = S(ids[1]);
    listed.equity = 0.5; not.equity = 0.5;
    assert.equal(finalWealth(w, listed), 0.5 * listed.valuation);
    assert.equal(finalWealth(w, not), 0.5 * not.valuation * 0.8);
  });
});

describe('交易所（M2a）：守恒和池子', () => {
  it('① 1 万次随机交易 0 异常：股数守恒、现金守恒（手续费留在池里），k 不减，储备不为负', () => {
    const { w, ids, L, S } = setup(4, { cash: 5e9 });
    const org = ids[0];
    const traders = ids.slice(1).map(S);
    const issued = L.pool.s + L.npcLong;
    const cash0 = traders.reduce((a, s) => a + s.cash, 0) + L.pool.c;
    let k = L.pool.s * L.pool.c;
    let errors = 0;
    for (let i = 0; i < 10000; i++) {
      if (i % 40 === 0) nextDay(w);
      const s = traders[Math.floor(rnd() * traders.length)];
      const r = rnd();
      try {
        if (r < 0.35) buy(w, s, org, rnd() * 3e7);
        else if (r < 0.65) { const h = s.market.holdings?.[org] || 0; if (h > 0) sell(w, s, org, h * rnd()); }
        else if (r < 0.85) short(w, s, org, rnd() * 2e6);
        else { const n = s.market.shorts?.[org] || 0; if (n > 0) cover(w, s, org, n * rnd()); }
      } catch (e) {
        if (!/[一-鿿]/.test(e.message)) errors++;   // 只允许中文的规则拒绝
      }
      const k2 = L.pool.s * L.pool.c;
      assert.ok(k2 >= k * (1 - 1e-12), `第 ${i} 次 k 变小了`);
      k = k2;
      assert.ok(L.pool.s > 0 && L.pool.c > 0, '储备不能为负');
    }
    assert.equal(errors, 0, '不能有非规则拒绝的异常');
    const held = traders.reduce((a, s) => a + (s.market.holdings?.[org] || 0), 0);
    const shorted = traders.reduce((a, s) => a + (s.market.shorts?.[org] || 0), 0);
    assert.ok(Math.abs(shorted - L.lent) < 1e-3, '借出的股数等于空头总数');
    assert.ok(Math.abs(L.pool.s + L.npcLong - L.lent + held - issued) < 1e-2, '股数守恒');
    const cash1 = traders.reduce((a, s) => a + s.cash + Object.values(s.market.margin || {}).reduce((x, y) => x + y, 0), 0) + L.pool.c;
    assert.ok(Math.abs(cash1 - cash0) < 1, `现金守恒（差 ${cash1 - cash0}）`);
  });

  it('① 开仓、平仓、强平都用同一个池价：同一个局面下主动回补和被强平买回同样股数，花的钱一样', () => {
    const { w, ids, S } = setup(3);
    const org = ids[0];
    const a = S(ids[1]);
    short(w, a, org, 5e6);
    const snap = JSON.parse(JSON.stringify({ pool: w.exchange.listings[org].pool, m: a.market, cash: a.cash, lent: w.exchange.listings[org].lent }));
    nextDay(w);
    const voluntary = cover(w, a, org, 1e6).usd;
    Object.assign(w.exchange.listings[org].pool, snap.pool);
    w.exchange.listings[org].lent = snap.lent;
    a.market = JSON.parse(JSON.stringify(snap.m)); a.cash = snap.cash;
    const forced = cover(w, a, org, 1e6, { forced: true }).usd;
    assert.ok(Math.abs(voluntary - forced) < 1e-6);
  });
});

describe('交易所（M2a）：防作弊（F2 M2 行 ②③⑤）', () => {
  it('② 拉高出货一定亏钱；被抬那家的身家不变（V 不读市价）', () => {
    const { w, ids, S } = setup(3, { cash: 5e9 });
    const org = ids[0];
    const target = S(org);
    const wealth0 = finalWealth(w, target);
    const a = S(ids[1]);
    const cash0 = a.cash;
    for (let d = 0; d < 30; d++) { nextDay(w); tryDo(() => buy(w, a, org, 1e9)); }
    const peak = poolPrice(w.exchange.listings[org]);
    for (let d = 0; d < 60 && (a.market.holdings?.[org] || 0) > 0; d++) { nextDay(w); tryDo(() => sell(w, a, org, a.market.holdings[org])); }
    assert.ok(peak > fairPrice(w, w.exchange.listings[org]) * 1.5, '确实抬上去了');
    assert.equal(a.market.holdings?.[org] || 0, 0, '全部卖完');
    assert.ok(a.cash < cash0, `拉高出货应该亏钱：${a.cash - cash0}`);
    assert.equal(finalWealth(w, target), wealth0);
  });

  it('② 最后 45 天持续买入：买方（持仓按整仓卖回算）和被抬方的身家合计不增加', () => {
    const { w, ids, S } = setup(3, { cash: 5e9 });
    const org = ids[0];
    const a = S(ids[1]), target = S(org);
    const sum0 = assetsOf(a, w) + finalWealth(w, target);
    for (let d = 0; d < 45; d++) { nextDay(w); tryDo(() => buy(w, a, org, 1e9)); exchangeClose(w); exchangeOpen(w); }
    const sum1 = assetsOf(a, w) + finalWealth(w, target);
    assert.ok(sum1 <= sum0 + 1, `合计不该增加：${sum1 - sum0}`);
  });

  it('② 空头封顶（池中股数的 15%）：全部被迫买回，峰值不超过公允价的 1.4 倍', () => {
    const { w, ids, L, S } = setup(5, { cash: 5e10 });
    const org = ids[0];
    const fair = fairPrice(w, L);
    // 先让池价回到公允价附近，再让几家把空头做到上限。
    for (const id of ids.slice(1)) { nextDay(w); tryDo(() => short(w, S(id), org, 1e12)); }
    assert.ok(L.lent <= X.SHORT.cap * L.pool.s + 1e-6, '空头总量不超过池中股数的 15%');
    // 价值资金把价拉回公允价（用很多天），然后一次性全部被迫买回。
    for (let d = 0; d < 80; d++) { nextDay(w); exchangeOpen(w); }
    let peak = 0;
    for (const id of ids.slice(1)) {
      const n = S(id).market.shorts?.[org] || 0;
      if (n > 0) cover(w, S(id), org, n, { forced: true });
      peak = Math.max(peak, poolPrice(L));
    }
    assert.ok(peak <= 1.4 * fair, `轧空峰值 ${peak / fair} 倍公允价`);
  });

  it('③ 现金换股票再换回：身家变化不超过手续费加滑点（小额 < 1%）', () => {
    const { w, ids, S } = setup(3);
    const org = ids[0];
    const a = S(ids[1]);
    const before = assetsOf(a, w);
    const got = buy(w, a, org, 1e6);
    sell(w, a, org, got.shares);
    const loss = (before - assetsOf(a, w)) / 1e6;
    assert.ok(loss > 0 && loss < 0.01, `来回损失 ${(loss * 100).toFixed(3)}%`);
  });

  it('⑤ 小号送钱（股票渠道）：主号身家增幅 ≤ 10%，送钱效率 ≤ 30%', () => {
    const { w, ids, S } = setup(4, { cash: 3e9 });
    const org = ids[0];
    const main = S(ids[1]), alt = S(ids[2]);
    // 主号先按公允价附近买进一笔。
    for (let d = 0; d < 5; d++) { nextDay(w); tryDo(() => buy(w, main, org, 2e8)); exchangeClose(w); exchangeOpen(w); }
    for (let d = 0; d < 20; d++) { nextDay(w); exchangeOpen(w); }
    const main0 = assetsOf(main, w), alt0 = assetsOf(alt, w);
    // 小号每天高位买满、主号每天卖给它。
    for (let d = 0; d < 40; d++) {
      nextDay(w);
      tryDo(() => buy(w, alt, org, 5e8));
      const h = main.market.holdings?.[org] || 0;
      if (h > 0) tryDo(() => sell(w, main, org, h));
      exchangeClose(w); exchangeOpen(w);
    }
    // 小号最后也卖掉（不然它的亏损没落地）。
    for (let d = 0; d < 60 && (alt.market.holdings?.[org] || 0) > 0; d++) { nextDay(w); tryDo(() => sell(w, alt, org, alt.market.holdings[org])); exchangeOpen(w); }
    const gain = assetsOf(main, w) - main0, lossAlt = alt0 - assetsOf(alt, w);
    assert.ok(gain <= 0.10 * main0, `主号增幅 ${(gain / main0 * 100).toFixed(2)}%`);
    if (gain > 0) assert.ok(gain / lossAlt <= 0.30, `送钱效率 ${(gain / lossAlt).toFixed(3)}`);
  });
});

describe('交易所（M2a）：规则', () => {
  it('自家股票不能买卖、不能做空；回购价 ≥ 池价和 V 每股价，增发价 ≤ 两者；终局前 60 天禁回购', () => {
    const { w, ids, L, S } = setup(3);
    const own = S(ids[0]);
    assert.throws(() => buy(w, own, ids[0], 1e6), /自家股票/);
    assert.throws(() => short(w, own, ids[0], 1e3), /自家股票/);
    const p = poolPrice(L), v = own.valuation / L.total;
    const bb = buyback(w, own, 1e6);
    assert.ok(bb.price >= p - 1e-9 && bb.price >= v - 1e-9);
    nextDay(w);
    const p2 = poolPrice(L), v2 = own.valuation / L.total;
    const is = issue(w, own, 1e6);
    assert.ok(is.price <= p2 + 1e-9 && is.price <= v2 + 1e-9);
    const end = w.end; w.end = addDays(w.day, 30);
    assert.throws(() => buyback(w, own, 1e6), /终局前/);
    w.end = end;
  });

  it('外部单一股东最多 25%；持股到 5% 公示', () => {
    const { w, ids, L, S } = setup(3, { cash: 1e12 });
    const org = ids[0], a = S(ids[1]);
    for (let d = 0; d < 400; d++) { nextDay(w); tryDo(() => buy(w, a, org, 1e11)); exchangeOpen(w); }
    assert.ok(a.market.holdings[org] <= X.HOLD.cap * L.total + 1, '不超过 25%');
    assert.ok(w.news.some(n => n.type === 'stake' && n.title.includes(w.companies[org].name)), '有持股公示');
  });

  it('当天跌了 10% 以上：当天和次日都不能新开空单；上市不满 180 天不能做空', () => {
    const { w, ids, L, S } = setup(4, { cash: 1e11 });
    const org = ids[0];
    L.dropDay = w.day;
    assert.throws(() => short(w, S(ids[1]), org, 1e3), /跌了 10%/);
    nextDay(w);
    assert.throws(() => short(w, S(ids[1]), org, 1e3), /跌了 10%/);
    nextDay(w);
    assert.ok(short(w, S(ids[1]), org, 1e3).shares > 0);
    L.listedDay = w.day;
    assert.throws(() => short(w, S(ids[2]), org, 1e3), /上市满/);
  });

  it('保证金跌破 130%：收盘记下，次日开盘只买回到保证金恢复 150%，不一次全平', () => {
    const { w, ids, L, S } = setup(4, { cash: 5e10 });
    const org = ids[0], a = S(ids[1]);
    short(w, a, org, 5e6);
    // 别家把价抬上去，压穿保证金线。
    for (let d = 0; d < 6; d++) { nextDay(w); for (const id of ids.slice(2)) tryDo(() => buy(w, S(id), org, 1e10)); }
    exchangeClose(w);
    assert.ok(L.calls[ids[1]], '收盘判定要强平');
    const n0 = a.market.shorts[org];
    nextDay(w);
    exchangeOpen(w);
    const n1 = a.market.shorts?.[org] || 0;
    assert.ok(n1 < n0, '强平买回了一部分');
    if (n1 > 0) assert.ok(a.market.margin[org] >= X.SHORT.im * n1 * poolPrice(L) * 0.97, '保证金恢复到 150% 左右');
  });

  it('借券费按占用率算：min(150%, 1% + 60% × 占用率²)；可借 = 长线基金一半减已借', () => {
    const { w, ids, L, S } = setup(3, { cash: 1e11 });
    assert.ok(Math.abs(E.borrowRate(L) - 0.01) < 1e-12);
    const full = lendable(L);
    short(w, S(ids[1]), ids[0], full * 0.5);
    assert.ok(E.borrowRate(L) > 0.01 && E.borrowRate(L) <= 1.5);
  });
});

describe('交易所（M2a）：命令、电脑、存档', () => {
  it('股市命令：每条一个正例、一个反例（反例状态不变）', () => {
    const { w, ids, L, S } = setup(4, { cash: 1e10 });
    void w; void L;
    const a = S(ids[1]), own = S(ids[0]);
    const ok = (s, name, args) => { const r = E.applyCommand(s, { name, args }); assert.equal(r.ok, true, `${name}：${r.err}`); return r; };
    const no = (s, name, args) => { const before = JSON.stringify(s.market) + s.cash; const r = E.applyCommand(s, { name, args }); assert.equal(r.ok, false, `${name} 反例应被拒`); assert.match(r.err, /[一-鿿]/); assert.equal(JSON.stringify(s.market) + s.cash, before); };
    ok(a, 'stockBuy', { ticker: ids[0], usd: 1e6 });
    no(a, 'stockBuy', { ticker: 'c_nope00', usd: 1e6 });
    ok(a, 'stockSell', { ticker: ids[0], shares: 10 });
    no(a, 'stockSell', { ticker: ids[2], shares: 10 });
    ok(a, 'stockShort', { ticker: ids[0], shares: 1000 });
    no(own, 'stockShort', { ticker: ids[0], shares: 1000 });
    nextDay(w);
    ok(a, 'stockCover', { ticker: ids[0], shares: 500 });
    no(S(ids[2]), 'stockCover', { ticker: ids[0], shares: 500 });
    ok(own, 'stockBuyback', { usd: 1e6 });
    no(a, 'stockBuyback', { usd: 1e6 });
    ok(own, 'stockIssue', { usd: 1e6 });
    no(a, 'stockIssue', { usd: 1e6 });
    no(a, 'startIpoIssue', { frac: 0.25 });
  });

  it('电脑炒股：普通只做多（低于 0.9 倍买、高于 1.1 倍卖），困难会做空，简单和被动不炒', () => {
    const run = level => {
      const { w, ids, L, S } = setup(3, { cash: 1e10 });
      const c = w.companies[ids[1]];
      c.bot = level;
      // 价格压到公允价 0.7 倍：会买。
      const k = L.pool.s * L.pool.c, low = fairPrice(w, L) * 0.7;
      L.pool.s = Math.sqrt(k / low); L.pool.c = Math.sqrt(k * low); L.refDay = null;
      tradeTick(w, c);
      const h1 = c.s.market?.holdings?.[ids[0]] || 0;
      const bought = h1 > 0;
      // 抬到 1.3 倍：会卖；困难档还会做空。
      nextDay(w);
      const high = fairPrice(w, L) * 1.3;
      L.pool.s = Math.sqrt(k / high); L.pool.c = Math.sqrt(k * high); L.refDay = null;
      tradeTick(w, c);
      // 卖出受当天成交上限和跌停约束，一天卖不完也算卖了（持仓变少）。
      const h2 = c.s.market?.holdings?.[ids[0]] || 0;
      // 卖出用掉了当天的成交额度，做空要等到下一天（价格仍在 1.3 倍）。
      nextDay(w);
      L.pool.s = Math.sqrt(k / high); L.pool.c = Math.sqrt(k * high); L.refDay = null;
      tradeTick(w, c);
      return { bought, sold: h2 < h1, shorted: (c.s.market?.shorts?.[ids[0]] || 0) > 0 };
    };
    const normal = run('normal');
    assert.deepEqual(normal, { bought: true, sold: true, shorted: false });
    const hard = run('hard');
    assert.equal(hard.shorted, true);
    for (const lv of ['easy', 'passive']) assert.deepEqual(run(lv), { bought: false, sold: false, shorted: false });
  });

  it('带着交易所状态存档读回，再跑几天，哈希和不存档一样', () => {
    const make = () => {
      const { w, ids, S } = setup(4, { cash: 1e10 });
      buy(w, S(ids[1]), ids[0], 2e7);
      short(w, S(ids[2]), ids[0], 1e5);
      return w;
    };
    const a = make();
    for (let i = 0; i < 10; i++) a.tick();
    const b = make();
    const m = E.migrateWorld(E.serialize(b));
    assert.equal(m.ok, true, m.reason);
    for (let i = 0; i < 10; i++) m.world.tick();
    assert.equal(m.world.hash(), a.hash());
  });
});
