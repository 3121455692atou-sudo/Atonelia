// 后台 · 股市：真实月末收盘价，选中一只看走势、买卖。
import * as E from '../../engine.js';
import { addMonths } from '../../data/core.js';
import { TICKERS } from '../../data/world.js';
import { esc, usd, pct } from '../fmt.js';
import { act } from '../act.js';
import { lineChart, sparkline } from '../charts.js';

export function render(S, st) {
  const rows = TICKERS.filter(t => E.tickerListed(t, S.date) && !(t.family && E.isMine(S, t.family))).map(t => {
    const ser = E.tickerSeries(t.id, addMonths(S.date, -11) < '2023-01' ? '2023-01' : addMonths(S.date, -11), S.date);
    const p = E.tickerPrice(t.id, S.date);
    const prev = E.tickerPrice(t.id, addMonths(S.date, -1));
    const hold = S.market.holdings[t.id] || 0;
    const value = hold * p * E.fx(t.id);
    return { t, ser, p, chg: prev ? p / prev - 1 : 0, hold, value, cost: S.market.cost[t.id] || 0 };
  });
  const L = S.capital.listed;
  const total = rows.reduce((a, r) => a + r.value, 0);
  const cost = rows.reduce((a, r) => a + r.cost, 0);
  const sel = rows.find(r => r.t.id === st.ticker) || rows[0];
  return `<h2>股市</h2><p class="muted">真实月末收盘价，月内略有波动。公司闲钱可以买入股票，盈亏计入现金。新股从上市当月起可以交易。</p>
    <div class="card"><div class="card-head"><b>${esc(sel.t.name)} · ${esc(sel.t.id)}</b><small>${esc(sel.t.sector)} · ${E.ccySign(sel.t.id)}${sel.p} · ${sel.chg >= 0 ? '+' : ''}${pct(sel.chg, 1)}</small></div>
      ${lineChart([{ name: sel.t.id, points: E.tickerSeries(sel.t.id, S.date < '2024-01' ? '2023-01' : addMonths(S.date, -35), S.date) }], { yFmt: v => v.toFixed(0) })}
      <div class="trade"><button class="btn btn--sm" data-trade="buy" data-amt="0.01">买入 1% 现金</button><button class="btn btn--sm" data-trade="buy" data-amt="0.05">买入 5% 现金</button>${sel.hold ? `<button class="btn btn--sm" data-trade="sell">全部卖出（${usd(sel.value)}）</button>` : ''}</div></div>
    <table class="tbl tickers"><thead><tr><th>股票</th><th>价格</th><th>月涨跌</th><th>一年走势</th><th>持仓市值</th></tr></thead><tbody>
      ${L ? `<tr class="mine"><td>${esc(S.persona.name)} · ${esc(L.ticker)}</td><td>$${L.price.toFixed(2)}</td><td></td><td>${sparkline(L.history.slice(-12).map(x => x[1]))}</td><td>你们自己</td></tr>` : ''}
      ${rows.map(r => `<tr class="${r.t.id === st.ticker ? 'is-on' : ''}" data-ticker="${r.t.id}"><td>${esc(r.t.name)} <small class="muted">${esc(r.t.id)}</small></td><td>${E.ccySign(r.t.id)}${r.p}</td><td class="${r.chg >= 0 ? 'ok' : 'bad'}">${r.chg >= 0 ? '+' : ''}${pct(r.chg, 1)}</td><td>${sparkline(r.ser.map(x => x[1]))}</td><td>${r.value ? usd(r.value) : ''}</td></tr>`).join('')}
    </tbody></table>
    ${total ? `<p>持仓市值 ${usd(total)} · 成本 ${usd(cost)} · <b class="${total >= cost ? 'ok' : 'bad'}">${total >= cost ? '+' : ''}${usd(total - cost)}</b></p>` : ''}`;
}

export function click(S, t, { st, draw, guard }) {
  const tick = t.closest('[data-ticker]');
  if (tick && !t.closest('button')) { st.ticker = tick.dataset.ticker; draw(); return; }
  const tr = t.closest('[data-trade]');
  if (tr) return guard(() => { if (tr.dataset.trade === 'buy') act(S, 'trade', { ticker: st.ticker, usd: Math.round(S.cash * Number(tr.dataset.amt)) }); else act(S, 'trade', { ticker: st.ticker, usd: -1e15 }); });
}
