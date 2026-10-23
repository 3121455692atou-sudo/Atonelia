// M2b 其余互动（规格 M.5.6 挖人、M.5.7 新手保护、M.5.8 破产重组清算、M.5.9 转账）：
// 重组一局只一次、第二次清算；冻结期所有转钱渠道进出都不行；挖人默认关、新手保护、加薪留人、挖成的效果。
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { EXCHANGE, POACH, TRANSFER } from '../../src/career/data/exchange.js';
import { queueTransfer, settleTransfers, moneyFrozen } from '../../src/career/world/transfer.js';
import { finishPoach, poachQuote } from '../../src/career/world/poach.js';
import { listCompany, buy, finalWealth } from '../../src/career/world/exchange.js';
import { addDays } from '../../src/career/sim/clock.js';
import { HistoryProvider } from '../../src/career/sim/provider.js';
import { restoreHistory } from '../helpers/world_provider.mjs';

after(() => restoreHistory());
const R = EXCHANGE.RESTRUCTURE;

function setup({ poach = false, kinds = ['human', 'human', 'bot'] } = {}) {
  const companies = kinds.map((kind, i) => ({ name: `${'甲乙丙丁'[i]}智能`, brand: ['Jiaa', 'Yiii', 'Bing', 'Ding'][i], country: 'US', tier: 'specialist', kind, bot: 'normal' }));
  const w = E.createWorld({ seed: 4, start: '2024-01', days: 800, companies, poach });
  const cs = Object.values(w.companies).sort((a, b) => a.seat - b.seat);
  const clear = c => { while (c.kind === 'human' && c.s.queue.length) { const ev = E.currentEvent(c.s); E.resolveEvent(c.s, ev.choices.find(x => !x.disabled).id); } };
  // pre：处理完卡片、日结之前执行（卡片里可能有紧急融资之类的选项，会改现金）。
  const step = pre => { for (const c of cs) clear(c); pre?.(); return w.tick(); };
  return { w, cs, step, clear };
}

describe('破产、重组与清算（M.5.8）', () => {
  it('现金连续 60 天为负：第一次债权人重组（卖卡、增发、老股东 ≤ 30%、团队 ×0.7、冻结 180 天），第二次清算', () => {
    const { w, cs, step } = setup();
    const A = cs[0];
    step();
    const team0 = A.s.team, eq0 = A.s.equity, cards0 = Object.values(A.s.gpus.owned).reduce((a, n) => a + n, 0);
    let day = 0;
    while (!w.ix.restr[A.id]?.count && day++ < 80) step(() => { A.s.cash = -5e7; });
    const r = w.ix.restr[A.id];
    assert.equal(r.count, 1, '重组了一次');
    assert.ok(day >= R.negDays && day <= R.negDays + 2, `第 ${day} 天重组`);
    assert.ok(A.s.equity <= eq0 * R.keepEquity + 1e-12);
    assert.equal(A.s.team, Math.round(team0 * R.team));
    assert.ok(Object.values(A.s.gpus.owned).reduce((a, n) => a + n, 0) < cards0, '卖了卡');
    assert.ok(A.s.cash >= 0, '补到不为负');
    assert.equal(r.until, addDays(r.day, R.freeze));
    assert.match(moneyFrozen(w, A.id), /重组/);
    assert.equal(A.s.status, 'playing');
    // 第二次：直接清算。
    day = 0;
    while (A.s.status === 'playing' && day++ < 80) step(() => { A.s.cash = -5e7; });
    assert.equal(w.ix.restr[A.id].count, 1, '一局只重组一次');
    assert.ok(w.ix.restr[A.id].liquidated);
    assert.notEqual(A.s.status, 'playing');
    assert.equal(finalWealth(w, A.s), A.s.equity * Math.max(0, w.ix.restr[A.id].liqValue));
    assert.ok(w.news.some(n => n.title.includes('清算')));
  });

  it('冻结期：别家转来的钱不入账；买 API、出租卡、买卖别家股票都不行', () => {
    const { w, cs, step } = setup();
    const [A, B] = cs;
    step();
    w.ix.restr[A.id] = { negSince: null, count: 1, day: w.day, until: addDays(w.day, R.freeze), liquidated: false };
    const cash0 = A.s.cash;
    queueTransfer(w, B.id, A.id, 1e7, 'api');
    settleTransfers(w, w.day);
    assert.equal(A.s.cash, cash0, '冻结期收不到钱');
    const lease = E.applyCommand(A.s, { name: 'setLease', args: { n: 10 } });
    assert.equal(lease.ok, false);
    assert.match(lease.err, /重组/);
    for (const c of Object.values(w.companies)) { c.s.valuation = 3e9; c.s.cash = Math.max(c.s.cash, 1e9); }
    listCompany(w, B.s, 0.2);
    assert.throws(() => buy(w, A.s, B.id, 1e6), /重组/);
    // 冻结期满就恢复。
    w.day = addDays(w.ix.restr[A.id].until, 1);
    assert.equal(moneyFrozen(w, A.id), null);
  });

  it('史实模式不走重组：Provider 的开关', () => {
    assert.equal(new HistoryProvider().restructures, false);
    assert.equal(new E.SimProvider({}).restructures, true);
  });
});

describe('挖人（M.5.6）与新手保护（M.5.7）', () => {
  it('大厅里默认关；开了以后进场 120 天内不能被挖', () => {
    const off = setup();
    const r0 = E.applyNow(off.w, off.cs[0].id, { name: 'poach', args: { target: off.cs[1].id } });
    assert.equal(r0.ok, false);
    assert.match(r0.err, /没开挖人/);
    const on = setup({ poach: true });
    const r1 = E.applyNow(on.w, on.cs[0].id, { name: 'poach', args: { target: on.cs[1].id } });
    assert.equal(r1.ok, false);
    assert.match(r1.err, /新手保护/);
  });

  it('电脑公司有钱就加薪留人；同一对 180 天只能挖一次', () => {
    const { w, cs } = setup({ poach: true, kinds: ['human', 'bot', 'bot'] });
    const [A, B] = cs;
    B.joined = '2023-01-01';
    A.s.cash = 1e9; B.s.cash = 1e10;
    const q = poachQuote(w, A.s, B.id);
    assert.ok(q.ok, q.reason);
    assert.equal(q.n, Math.max(1, Math.floor(B.s.team * POACH.share)));
    const r = E.applyNow(w, A.id, { name: 'poach', args: { target: B.id } });
    assert.ok(r.ok, r.err);
    assert.equal(r.result.matched, true);
    assert.ok(B.s.cash < 1e10, '对方付了留人的钱');
    const again = E.applyNow(w, A.id, { name: 'poach', args: { target: B.id } });
    assert.equal(again.ok, false);
    assert.match(again.err, /180 天内/);
  });

  it('真人被挖收到卡；挖成：对方少人、少一成技术积累、60 天研究变慢，挖方得到一半，付 2 倍年薪', () => {
    const { w, cs } = setup({ poach: true });
    const [A, B] = cs;
    B.joined = '2023-01-01';
    A.s.cash = 1e9;
    A.s.rep = 90; B.s.rep = 20;
    const r = E.applyNow(w, A.id, { name: 'poach', args: { target: B.id } });
    assert.ok(r.ok && r.result.pending, r.err);
    const card = B.s.queue.find(q => q.kind === 'poach_offer');
    assert.ok(card);
    // 掷骰按 (种子, 日子, 双方) 散列：换几个日子总能碰上挖成的一次。
    const teamA = A.s.team, teamB = B.s.team, knowB = B.s.know = 100, knowA = A.s.know = 10, cashA = A.s.cash;
    let res = null;
    for (let k = 0; k < 20 && !res?.ok; k++) res = finishPoach(w, { ...card.params, day: addDays(card.params.day, k) }, false);
    assert.ok(res.ok, '20 个日子里总有一次挖成');
    assert.equal(B.s.team, teamB - res.n);
    assert.equal(A.s.team, teamA + res.n);
    assert.ok(Math.abs(B.s.know - knowB * 0.9) < 1e-9);
    assert.ok(Math.abs(A.s.know - (knowA + knowB * 0.1 * POACH.gain)) < 1e-9);
    assert.equal(B.s.due.poach, addDays(w.day, POACH.days));
    assert.equal(cashA - A.s.cash, card.params.cost);
    assert.deepEqual(A.s.techs, A.s.techs, '不转移技术');
  });
});

describe('转账（M.5.9）', () => {
  it('付方付 100%，收方收盘入账 60%；收方不在场就没人收', () => {
    const { w, cs } = setup();
    const [A, B] = cs;
    const a0 = A.s.cash;
    queueTransfer(w, B.id, A.id, 1e6, 'trademark');
    queueTransfer(w, B.id, 'nobody', 1e6, 'trademark');
    const done = settleTransfers(w, w.day);
    assert.equal(A.s.cash - a0, 1e6 * TRANSFER.BOOK);
    assert.equal(done.find(x => x.to === 'nobody').booked, 0);
    assert.equal(w.ix.pending.length, 0);
  });
});
