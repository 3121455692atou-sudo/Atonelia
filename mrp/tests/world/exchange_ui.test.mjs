// 交易所页（规格 M.7 股市）：报价和真成交逐项一致、报价不动局面、最大量、盘面、持股公示；
// 页面在史实模式只给一句话、自洽里各方向都能渲染，点一行展开、选金额、确认成交，自家股票回购和增发。
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { EXCHANGE as X } from '../../src/career/data/exchange.js';
import { listCompany, buy, sell, short, cover, quote, quoteMax, boardOf, ownBoard, stakesOf, poolPrice } from '../../src/career/world/exchange.js';
import { addDays } from '../../src/career/sim/clock.js';
import { restoreHistory } from '../helpers/world_provider.mjs';

globalThis.document ??= { baseURI: 'http://localhost/' };
const state = await import('../../src/career/ui/state.js');
const { PAGE, pageVisible } = await import('../../src/career/ui/office.js');
const page = PAGE.exchange;

after(() => { state.setWorld(null); restoreHistory(); });

const NAMES = ['晨星', '北岭', '蓝鲸', '泰拉'];
const companies = () => NAMES.map((name, i) => ({ name: `${name}智能`, brand: name, country: ['CN', 'US', 'EU'][i % 3], tier: 'specialist', kind: 'bot' }));
// 两家上市（都过了做空门槛和新手保护期），第三家当“我”。
function setup() {
  const w = E.createWorld({ seed: 5, start: '2024-01', days: 730, companies: companies() });
  for (let i = 0; i < 3; i++) w.tick();
  const ids = Object.keys(w.companies).sort();
  for (const id of ids) { const s = w.companies[id].s; s.valuation = 5e9; s.cash = 2e9; }
  for (const id of ids.slice(0, 2)) {
    const L = listCompany(w, w.companies[id].s, 0.2);
    L.listedDay = addDays(w.day, -200);
    w.companies[id].joined = addDays(w.day, -200);
  }
  return { w, ids, me: w.companies[ids[2]].s, org: ids[0] };
}
const snap = (w, s) => JSON.stringify([w.exchange, w.news.length, s.cash, s.market ?? null]);
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const BAD = /undefined|NaN|\[object|(?<![\w-])null(?![\w-])|Infinity/;
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('交易所报价（M.7）', () => {
  it('报价和真成交逐项一致，报价本身不动局面', () => {
    const { w, me, org } = setup();
    // 四笔加起来不到当天成交上限（池中现金的 5%，这里约 2600 万美元）。
    const steps = [['buy', 5e6, buy], ['sell', null, sell], ['short', 5e5, short], ['cover', null, cover]];
    for (const [side, amt0, fn] of steps) {
      const amt = amt0 ?? (side === 'sell' ? me.market.holdings[org] / 2 : me.market.shorts[org] / 2);
      const before = snap(w, me);
      const q = quote(w, me, org, side, amt);
      assert.equal(snap(w, me), before, `${side} 报价改了局面`);
      assert.ok(q.ok, `${side}: ${q.err}`);
      const L = w.exchange.listings[org];
      const r = fn(w, me, org, amt);
      assert.ok(near(q.shares, r.shares) && near(q.usd, r.usd), `${side} 报价 ${q.shares}/${q.usd}，成交 ${r.shares}/${r.usd}`);
      assert.ok(near(q.after, poolPrice(L)), `${side} 成交后池价`);
      assert.ok(near(q.cash, me.cash), `${side} 成交后现金`);
      if (side === 'short') assert.ok(near(q.margin, r.margin));
    }
  });

  it('被截掉时 clipped；做不了时给原因；最大量正好做得了', () => {
    const { w, me, org } = setup();
    const big = quote(w, me, org, 'buy', 1e12);
    assert.ok(big.ok && big.clipped);
    assert.ok(big.usd <= X.DAY_CAP * w.exchange.listings[org].pool.c + 1e-6, '超不过当天成交上限');
    const max = quoteMax(w, me, org, 'buy');
    assert.ok(near(max, big.usd, 1e-6));
    assert.equal(quote(w, me, org, 'sell', 1).ok, false);
    assert.match(quote(w, me, org, 'sell', 1).err, /手里没有/);
    assert.equal(quoteMax(w, me, org, 'cover'), 0);
    const sm = quoteMax(w, me, org, 'short');
    assert.ok(sm > 0 && quote(w, me, org, 'short', sm).ok);
    // 现金只够押一点保证金时，最大做空量按现金二分出来，正好做得了。
    me.cash = 1e5;
    const small = quoteMax(w, me, org, 'short');
    assert.ok(small > 0 && small < sm);
    assert.ok(quote(w, me, org, 'short', small).ok);
    assert.equal(quote(w, me, org, 'short', small * 1.5).ok, false);
    assert.match(quote(w, me, 'nobody', 'buy', 1e6).err, /还没上市/);
  });

  it('盘面：涨跌停、剩余成交额、持仓和空单；5% 以上公示进名单', () => {
    const { w, me, org } = setup();
    const b0 = boardOf(w, me, org);
    assert.ok(near(b0.top, b0.price * (1 + X.LIMIT)) && near(b0.floor, b0.price * (1 - X.LIMIT)));
    assert.equal(b0.held, 0);
    assert.equal(b0.shortBlock, null);
    const r = buy(w, me, org, 1e12);
    const b1 = boardOf(w, me, org);
    assert.ok(near(b1.volLeft, b0.volLeft - r.usd, 1e-6));
    assert.ok(near(b1.held, r.shares));
    assert.ok(b1.value > 0 && b1.value < r.usd, '整仓卖回拿得比花的少（手续费加滑点）');
    // 天天买，直到 5% 公示。
    for (let i = 0; i < 40 && !stakesOf(w, org).length; i++) { w.day = addDays(w.day, 1); try { buy(w, me, org, 1e12); } catch { /* 涨停或现金不够 */ } }
    const st = stakesOf(w, org);
    assert.ok(st.length && st[0].holder === me.charId && st[0].ratio >= X.HOLD.disclose);
    // 刚上市的、新手保护期里的不能做空，原因写在盘面上。
    w.exchange.listings[org].listedDay = w.day;
    assert.match(boardOf(w, me, org).shortBlock, /上市满/);
  });
});

describe('交易所页（M.7）', () => {
  const el = (attrs = {}, value) => ({
    dataset: Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k.replace(/^data-/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase()), v])),
    value,
    closest(sel) { const m = sel.match(/^\[([\w-]+)\]$/); return m && m[1] in attrs ? this : null; },
    matches(sel) { return !!this.closest(sel); },
  });
  let env, st, notes;
  const ctx = () => ({ st, draw: () => {}, guard: fn => { const r = fn(); if (r?.note) notes.push(r.note); } });
  before(() => {
    env = setup();
    state.setWorld(env.w);
    state.setState(env.me);
    st = { page: 'exchange', exOpen: null, exSide: 'buy', exAmt: null, exOwn: null };
    notes = [];
  });

  it('史实模式只给一句话，导航里也不出现；自洽里出现，史实股市页藏起来', () => {
    state.setWorld(null);
    assert.match(page.render(E.createGame('kimi', 'y2024', 5), st), /只有自洽世界和联机里有交易所/);
    assert.equal(pageVisible('exchange'), false);
    assert.equal(pageVisible('market'), true);
    state.setWorld(env.w);
    assert.equal(pageVisible('exchange'), true);
    assert.equal(pageVisible('market'), false);
  });

  it('列表、展开、四个方向、选金额都能渲染，不出现 undefined / NaN', () => {
    const { me, org } = env;
    const html = page.render(me, st);
    assert.match(html, /AI 板块指数/);
    assert.match(html, /芯片指数/);
    assert.match(html, /IPO 日历/);
    assert.equal((html.match(/data-ex-open=/g) || []).length, 2);
    assert.doesNotMatch(text(html), BAD);
    page.click(me, el({ 'data-ex-open': org }), ctx());
    assert.equal(st.exOpen, org);
    for (const side of ['buy', 'sell', 'short', 'cover']) {
      page.click(me, el({ 'data-ex-side': side }), ctx());
      const h = page.render(me, st);
      assert.match(h, /池子深度/);
      assert.doesNotMatch(text(h), BAD, side);
    }
    page.click(me, el({ 'data-ex-side': 'buy' }), ctx());
    const h = page.render(me, st);
    const amt = Number(h.match(/data-ex-amt="(\d+)"/)[1]);
    page.click(me, el({ 'data-ex-amt': String(amt) }), ctx());
    const q = page.render(me, st);
    assert.match(q, /均价/);
    assert.match(q, /成交后池价/);
    assert.match(q, /data-ex-go/);
    assert.doesNotMatch(text(q), BAD);
  });

  it('确认买入走命令表成交；输入框按万美元；做空显示保证金预估', () => {
    const { me, org } = env;
    st.exOpen = org; st.exSide = 'buy';
    page.change(me, el({ 'data-ex-input': '' }, '1000'), ctx());
    assert.equal(st.exAmt, 1e7);
    const c0 = me.cash;
    page.click(me, el({ 'data-ex-go': '' }), ctx());
    assert.ok(me.market.holdings[org] > 0);
    assert.ok(near(c0 - me.cash, 1e7, 1e-9));
    assert.match(notes.at(-1), /买入 .* 股，均价/);
    assert.equal(st.exAmt, null);
    st.exSide = 'short'; st.exAmt = 5e6;
    const h = page.render(me, st);
    assert.match(h, /押保证金/);
    assert.match(h, /借券费/);
    page.click(me, el({ 'data-ex-go': '' }), ctx());
    assert.ok(me.market.shorts[org] > 0);
    const top = page.render(me, { ...st, exOpen: null });
    assert.match(top, /保证金 \d+%/);
    assert.match(top, /空 /);
  });

  it('自家上市以后：列表里没有自己，自家卡片回购、增发', () => {
    const { w, me } = env;
    me.valuation = 5e9;
    listCompany(w, me, 0.2);
    const html = page.render(me, st);
    assert.match(html, /自家股票/);
    assert.ok(!html.includes(`data-ex-open="${me.charId}"`));
    const o = ownBoard(w, me);
    assert.ok(o.buybackPrice >= o.price && o.issuePrice <= o.price);
    const eq0 = me.equity;
    const amt = Number(html.match(/data-ex-own="buyback" data-amt="(\d+)"/)[1]);
    page.click(me, el({ 'data-ex-own': 'buyback', 'data-amt': String(amt) }), ctx());
    assert.match(page.render(me, st), /确认回购/);
    page.click(me, el({ 'data-ex-own-go': '' }), ctx());
    assert.ok(me.equity > eq0, '回购后持股比例上升');
    assert.match(notes.at(-1), /回购 .* 股/);
    assert.doesNotMatch(text(page.render(me, st)), BAD);
  });
});
