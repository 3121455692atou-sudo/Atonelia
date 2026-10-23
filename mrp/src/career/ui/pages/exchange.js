// 后台 · 交易所（规格 M.7 股市、M.5.5）：自洽和联机才有。顶部两只指数、我的持仓和保证金条；
// 下面每家上市公司一行，点开在原地展开：价格线、池子深度、买 / 卖 / 做空 / 回补、实时的滑点和保证金预估；另有 IPO 日历和 5% 以上的持股名单。
// 报价拿池子的副本跑同一套成交函数（world/exchange.js 的 quote），看到的就是按下去以后的结果。
import * as E from '../../engine.js';
import { EXCHANGE } from '../../data/exchange.js';
import { getWorld } from '../state.js';
import { esc, usd, pct, count } from '../fmt.js';
import { act, after } from '../act.js';
import { lineChart, sparkline } from '../charts.js';

const X = EXCHANGE;
const { exQuote: quote, exQuoteMax: quoteMax, exBoard: boardOf, exOwnBoard: ownBoard, exStakes: stakesOf, sectorIndex, isListed, chipIndexValue, ipoOpenOf } = E;
const SIDES = [['buy', '买入'], ['sell', '卖出'], ['short', '做空'], ['cover', '回补']];
const CMD = { buy: 'stockBuy', sell: 'stockSell', short: 'stockShort', cover: 'stockCover' };
const FRACS = [[0.1, '10%'], [0.25, '25%'], [0.5, '一半'], [1, '最多']];
const px = v => `$${v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toFixed(4)}`;
const signed = (v, d = 1) => `${v >= 0 ? '+' : ''}${pct(v, d)}`;
const tone = v => (v >= 0 ? 'ok' : 'bad');

// 一次交易的金额：买入按美元；卖出、做空、回补也按市值（美元）输入，成交前换成股数。
const sharesOf = (b, usdAmt) => usdAmt / Math.max(1e-12, b.price);
function maxUsd(w, S, b, side) {
  const m = quoteMax(w, S, b.org, side);
  return side === 'buy' ? m : m * b.price;
}
function quoteFor(w, S, b, side, usdAmt) {
  return quote(w, S, b.org, side, side === 'buy' ? usdAmt : sharesOf(b, usdAmt));
}
// 被截掉一部分时，说是哪一道上限截的。
function clipWhy(q, b, S, side) {
  if (!q.clipped) return '';
  if ((side === 'buy' || side === 'cover') && q.after >= b.top * (1 - 1e-6)) return '碰到涨停价';
  if ((side === 'sell' || side === 'short') && q.after <= b.floor * (1 + 1e-6)) return '碰到跌停价';
  if (q.usd >= b.volLeft * (1 - 1e-6)) return `今天对这只股票的成交额到上限（池中现金的 ${pct(X.DAY_CAP)}）`;
  if (side === 'buy' && b.held + q.shares >= X.HOLD.cap * b.total * (1 - 1e-6)) return `外部单一股东最多持有 ${pct(X.HOLD.cap)}`;
  if (side === 'buy' && q.usd >= (S.cash || 0) * (1 - 1e-6)) return '现金只有这么多';
  if (side === 'sell') return '手里只有这么多';
  if (side === 'cover') return '空单只有这么多';
  if (side === 'short') return `可借的股票只有这么多（空头总量不超过池中股数的 ${pct(X.SHORT.cap)}）`;
  return '超出的部分被截掉了';
}

function topLine(w, S, rows) {
  const sec = sectorIndex(w);
  const chip = chipIndexValue(w);
  const val = rows.reduce((a, b) => a + b.value, 0);
  const cost = rows.reduce((a, b) => a + (b.held > 0 ? b.cost : 0), 0);
  const shortVal = rows.reduce((a, b) => a + b.short * b.price, 0);
  const margin = rows.reduce((a, b) => a + b.margin, 0);
  // 保证金条：0–200%，130% 处强平线、150% 处开仓线。
  const ratio = shortVal > 0 ? margin / shortVal : null;
  const bar = ratio === null ? '' : `<div class="ex-margin ${ratio < X.SHORT.mm ? 'is-call' : ratio < X.SHORT.im ? 'is-warn' : ''}">
      <span>保证金 ${pct(ratio)}</span><div class="ex-margin__bar"><i style="width:${Math.min(100, ratio / 2 * 100).toFixed(1)}%"></i><em style="left:${(X.SHORT.mm / 2 * 100).toFixed(1)}%" title="强平线"></em><em style="left:${(X.SHORT.im / 2 * 100).toFixed(1)}%" title="开仓线"></em></div>
      <small>空单市值 ${usd(shortVal)}，跌破 ${pct(X.SHORT.mm)} 次日开盘强平</small></div>`;
  return `<div class="ex-top">
    <div class="meter-chip"><span>AI 板块指数</span><b>${sec === null ? '还没有公司上市' : sec.toFixed(1)}</b></div>
    <div class="meter-chip"><span>芯片指数</span><b>${chip.toFixed(1)}</b></div>
    <div class="meter-chip"><span>我的持仓</span><b>${usd(val)}</b>${cost > 0 ? `<small class="${tone(val - cost)}">${signed(val / cost - 1)}</small>` : ''}</div>
    <div class="meter-chip"><span>现金</span><b>${usd(S.cash)}</b></div>
    ${bar}</div>`;
}

function ownCard(w, S, st) {
  const o = ownBoard(w, S);
  if (!o) return '';
  const pick = st.exOwn;
  const btn = (kind, f, max, block) => {
    const amt = Math.floor(max * f);
    return `<button class="chip-btn${pick?.kind === kind && pick.amt === amt ? ' is-on' : ''}" data-ex-own="${kind}" data-amt="${amt}" ${block || amt < 1 ? 'disabled' : ''}>${f === 1 ? '最多' : pct(f)} · ${usd(amt)}</button>`;
  };
  return `<div class="card ex-own"><div class="card-head"><b>自家股票 · ${esc(o.ticker)}</b><small>股价 ${px(o.price)} · 每股价值 ${px(o.perShare)} · 创始团队持股 ${pct(S.equity, 1)}</small></div>
    <p class="muted">自家股票不能买卖、不能做空，只能回购或增发：回购价取池价和每股价值里高的，增发价取低的，都受当天成交上限（今天还剩 ${usd(o.volLeft)}）。</p>
    <div class="ex-own__row"><b>回购</b><span class="muted">${o.buybackBlock ? esc(o.buybackBlock) : `每股 ${px(o.buybackPrice)}，股票注销，持股比例上升`}</span>
      <div class="chips">${[0.25, 0.5, 1].map(f => btn('buyback', f, o.buybackMax, o.buybackBlock)).join('')}</div></div>
    <div class="ex-own__row"><b>增发</b><span class="muted">${o.issueBlock ? esc(o.issueBlock) : `每股 ${px(o.issuePrice)}，新股卖进池子，持股比例摊薄`}</span>
      <div class="chips">${[0.25, 0.5, 1].map(f => btn('issue', f, o.issueMax, o.issueBlock)).join('')}</div></div>
    ${pick ? `<div class="ex-quote"><span>${pick.kind === 'buyback' ? `回购 ${usd(pick.amt)}，约 ${count(pick.amt / o.buybackPrice)} 股` : `增发 ${usd(pick.amt)}，约 ${count(pick.amt / o.issuePrice)} 股`}</span>
      <button class="btn btn--primary btn--sm" data-ex-own-go>确认${pick.kind === 'buyback' ? '回购' : '增发'}</button></div>` : ''}</div>`;
}

function tradeBox(w, S, st, b) {
  const side = st.exSide || 'buy';
  const block = side === 'short' ? b.shortBlock : null;
  const max = block ? 0 : maxUsd(w, S, b, side);
  const amt = st.exAmt;
  const q = amt > 0 && !block ? quoteFor(w, S, b, side, amt) : null;
  let qHtml = '';
  if (q && !q.ok) qHtml = `<p class="warn">${esc(q.err)}</p>`;
  else if (q) {
    const slip = q.price / b.price - 1;
    const lines = [
      `<li><span>成交</span><b>${count(q.shares)} 股 · ${usd(q.usd)}</b></li>`,
      `<li><span>均价</span><b>${px(q.price)}（${signed(slip, 2)}）</b></li>`,
      `<li><span>成交后池价</span><b>${px(q.after)}（${signed(q.after / b.price - 1, 2)}）</b></li>`,
    ];
    if (side === 'short') {
      const extra = Math.max(0, q.margin - q.usd);
      lines.push(`<li><span>押保证金</span><b>${usd(q.margin)}（卖得 ${usd(q.usd)} + 自付 ${usd(extra)}）</b></li>`);
      lines.push(`<li><span>借券费</span><b>年化 ${pct(b.borrowRate, 1)}，每天从保证金扣</b></li>`);
    }
    if (side === 'cover') {
      const fromMargin = Math.min(q.usd, b.margin);
      lines.push(`<li><span>付款</span><b>保证金 ${usd(fromMargin)}${q.usd > fromMargin ? ` + 现金 ${usd(q.usd - fromMargin)}` : ''}</b></li>`);
    }
    lines.push(`<li><span>成交后现金</span><b>${usd(q.cash)}</b></li>`);
    const why = clipWhy(q, b, S, side);
    qHtml = `<ul class="kv">${lines.join('')}</ul>${why ? `<p class="muted">只能成交这么多：${esc(why)}。</p>` : ''}
      <button class="btn btn--primary" data-ex-go>确认${SIDES.find(x => x[0] === side)[1]}</button>`;
  }
  return `<div class="ex-trade">
    <div class="chips">${SIDES.map(([k, l]) => `<button class="chip-btn${k === side ? ' is-on' : ''}" data-ex-side="${k}">${l}</button>`).join('')}</div>
    ${block ? `<p class="muted">${esc(block)}</p>` : max < 1 ? `<p class="muted">${side === 'sell' ? '手里没有这只股票。' : side === 'cover' ? '没有这只股票的空单。' : side === 'buy' ? '现在买不进：现金不足、今天已经涨停或成交额到上限。' : '现在开不了空单：没有可借的股票、今天跌停或现金不够押保证金。'}</p>`
      : `<div class="ex-amt"><div class="chips">${FRACS.map(([f, l]) => `<button class="chip-btn${amt === Math.floor(max * f) ? ' is-on' : ''}" data-ex-amt="${Math.floor(max * f)}">${l}</button>`).join('')}</div>
        <label class="ex-amt__input"><span>金额（万美元）</span><input type="number" min="0" step="1" data-ex-input value="${amt > 0 ? Math.round(amt / 1e4) : ''}" placeholder="最多 ${Math.floor(max / 1e4)}" /></label></div>`}
    ${qHtml ? `<div class="ex-quote">${qHtml}</div>` : ''}</div>`;
}

function rowBody(w, S, st, b) {
  const pts = b.hist.slice(-120).map(([d, p]) => [d.slice(5), p]);
  const stakes = stakesOf(w, b.org);
  const pos = [];
  if (b.held > 0) pos.push(`<li><span>持有</span><b>${count(b.held)} 股（${pct(b.held / b.total, 1)}）· 整仓卖回 ${usd(b.value)} · 成本 ${usd(b.cost)} · <span class="${tone(b.value - b.cost)}">${signed(b.value / Math.max(1, b.cost) - 1)}</span></b></li>`);
  if (b.short > 0) pos.push(`<li><span>空单</span><b>${count(b.short)} 股 · 买回要 ${usd(b.shortCost)} · 保证金 ${usd(b.margin)}（<span class="${b.marginRatio < X.SHORT.mm ? 'bad' : b.marginRatio < X.SHORT.im ? 'warn' : 'ok'}">${pct(b.marginRatio)}</span>）${b.called ? ' · 明早开盘强平' : ''}</b></li>`);
  return `<div class="ex-body">
    ${pts.length > 1 ? lineChart([{ name: b.ticker, points: pts }], { h: 180, yFmt: v => px(v) }) : '<p class="muted">刚上市，还没有走势。</p>'}
    <ul class="kv ex-kv">
      <li><span>每股价值</span><b>${px(b.fair)}（池价${signed(b.price / b.fair - 1)}）</b></li>
      <li><span>市值</span><b>${usd(b.cap)}</b></li>
      <li><span>池子深度</span><b>现金 ${usd(b.pool.c)} · ${count(b.pool.s)} 股</b></li>
      <li><span>今天涨停 / 跌停</span><b>${px(b.top)} / ${px(b.floor)}</b></li>
      <li><span>今天还能成交</span><b>${usd(b.volLeft)} / ${usd(b.volCap)}</b></li>
      <li><span>可借做空</span><b>${count(b.lendable)} 股 · 借券年化 ${pct(b.borrowRate, 1)}</b></li>
      <li><span>上市</span><b>${esc(b.listedDay)} · 发行价 ${px(b.issuePrice)}</b></li>
    </ul>
    ${pos.length ? `<ul class="kv ex-pos">${pos.join('')}</ul>` : ''}
    ${b.halted ? '<p class="warn">这家公司已经清算，股票停牌。</p>' : tradeBox(w, S, st, b)}
    ${stakes.length ? `<p class="muted ex-stakes">5% 以上股东：${stakes.map(x => `${esc(x.name)} ${pct(x.ratio, 1)}`).join('、')}</p>` : ''}</div>`;
}

function ipoCal(w, S) {
  const open = ipoOpenOf(w);
  const going = Object.values(w.companies).filter(c => c.s?.capital?.ipo && c.s.due?.ipo).sort((a, b) => (a.s.due.ipo < b.s.due.ipo ? -1 : 1));
  const recent = Object.values(w.exchange?.listings || {}).sort((a, b) => (a.listedDay < b.listedDay ? 1 : -1)).slice(0, 5);
  const allStakes = stakesOf(w);
  return `<div class="card"><div class="card-head"><b>IPO 日历</b><small>${open ? '上市窗口开着' : '上市窗口还没开：要等芯片采购热起来'}</small></div>
    ${going.length ? `<ul class="kv">${going.map(c => `<li><span>${esc(c.name)}${c.id === S.charId ? '（你们）' : ''}</span><b>${esc(c.s.due.ipo)} 挂牌</b></li>`).join('')}</ul>` : '<p class="muted">眼下没有公司在走上市流程。</p>'}
    ${recent.length ? `<p class="muted">最近上市：${recent.map(L => `${esc(w.companies[L.org]?.name || L.org)}（${esc(L.listedDay)}）`).join('、')}</p>` : ''}</div>
    <div class="card"><div class="card-head"><b>5% 以上持股</b><small>持股 5% 以上每变动 1% 公示一次</small></div>
    ${allStakes.length ? `<ul class="kv">${allStakes.map(x => `<li><span>${esc(x.name)} → ${esc(w.companies[x.org]?.name || x.org)}</span><b>${pct(x.ratio, 1)}</b></li>`).join('')}</ul>` : '<p class="muted">还没有人持股到 5%。</p>'}</div>`;
}

export function render(S, st) {
  const w = getWorld();
  if (!w) return '<h2>交易所</h2><p class="muted">只有自洽世界和联机里有交易所。史实模式请看“股市”。</p>';
  const orgs = Object.keys(w.exchange?.listings || {});
  const rows = orgs.filter(o => o !== S.charId).map(o => boardOf(w, S, o)).sort((a, b) => b.cap - a.cap);
  const open = rows.find(b => b.org === st.exOpen) ? st.exOpen : null;
  const list = rows.map(b => {
    const chg = b.price / b.prev - 1;
    const mine = [b.held > 0 ? `<span class="chip chip--small">持 ${usd(b.value)}</span>` : '', b.short > 0 ? `<span class="chip chip--warn">空 ${count(b.short)} 股</span>` : ''].join('');
    return `<div class="ex-row${b.org === open ? ' is-open' : ''}">
      <button class="ex-head" data-ex-open="${esc(b.org)}" aria-expanded="${b.org === open}">
        <span class="ex-name"><b>${esc(b.name)}</b><small>${esc(b.ticker)}${b.halted ? ' · 停牌' : ''}</small></span>
        <span class="ex-px"><b>${px(b.price)}</b><small class="${tone(chg)}">${signed(chg)}</small></span>
        <span class="ex-spark">${sparkline(b.hist.slice(-30).map(x => x[1]))}</span>
        <span class="ex-mine">${mine}</span>
      </button>
      ${b.org === open ? rowBody(w, S, st, b) : ''}</div>`;
  }).join('');
  return `<h2>交易所</h2>
    <p class="muted">每家上市公司一个做市池，按池价成交，手续费 ${pct(X.FEE, 1)}；每天涨跌不超过 ${pct(X.LIMIT)}，对同一只股票的成交额不超过池中现金的 ${pct(X.DAY_CAP)}。价值资金每天把股价往“估值 ÷ 总股本”拉回一点，炒别家的股票改变不了那家老板的身家。</p>
    ${topLine(w, S, rows)}
    ${isListed(w, S.charId) ? ownCard(w, S, st) : ''}
    <div class="card ex-list"><div class="card-head"><b>上市公司</b><small>${rows.length ? `${rows.length} 家，按市值排；点一行展开交易` : ''}</small></div>
      ${rows.length ? list : '<p class="muted">还没有别家上市。估值够了、上市窗口开了，就会有公司走 IPO。</p>'}</div>
    ${ipoCal(w, S)}`;
}

// 执行一笔交易：走命令表（和联机、电脑同一个入口）；联机时发给服务器，回来的结果再写提示。
const run = (S, name, args) => act(S, name, args);

export function click(S, t, { st, draw, guard }) {
  const w = getWorld();
  if (!w) return;
  const op = t.closest('[data-ex-open]');
  if (op) {
    const org = op.dataset.exOpen;
    st.exOpen = st.exOpen === org ? null : org;
    st.exSide = 'buy'; st.exAmt = null;
    draw(); return;
  }
  const side = t.closest('[data-ex-side]');
  if (side) { st.exSide = side.dataset.exSide; st.exAmt = null; draw(); return; }
  const amt = t.closest('[data-ex-amt]');
  if (amt) { st.exAmt = Number(amt.dataset.exAmt) || null; draw(); return; }
  if (t.closest('[data-ex-go]')) {
    const b = boardOf(w, S, st.exOpen);
    const sd = st.exSide || 'buy';
    if (!b || !(st.exAmt > 0)) return;
    return guard(() => after(run(S, CMD[sd], sd === 'buy' ? { ticker: b.org, usd: st.exAmt } : { ticker: b.org, shares: sharesOf(b, st.exAmt) }), r => {
      st.exAmt = null;
      const verb = SIDES.find(x => x[0] === sd)[1];
      return { note: `${verb} ${b.name} ${count(r.shares)} 股，${sd === 'short' ? `卖得 ${usd(r.usd)}，押保证金 ${usd(r.margin)}` : `均价 ${px(r.usd / r.shares)}`}` };
    }));
  }
  const own = t.closest('[data-ex-own]');
  if (own) { st.exOwn = { kind: own.dataset.exOwn, amt: Number(own.dataset.amt) }; draw(); return; }
  if (t.closest('[data-ex-own-go]') && st.exOwn) {
    const { kind, amt } = st.exOwn;
    return guard(() => after(run(S, kind === 'buyback' ? 'stockBuyback' : 'stockIssue', { usd: amt }), r => {
      st.exOwn = null;
      return { note: `${kind === 'buyback' ? '回购' : '增发'} ${count(r.shares)} 股，每股 ${px(r.price)}，共 ${usd(r.usd)}` };
    }));
  }
}

export function change(S, t, { st, draw }) {
  if (!t.matches?.('[data-ex-input]')) return;
  const v = Number(t.value);
  st.exAmt = v > 0 ? Math.round(v * 1e4) : null;
  draw();
}
