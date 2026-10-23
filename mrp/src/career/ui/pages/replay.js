// 联机复盘（规格 M.6.6、M.7）：一局结束后公开全部隐藏信息。画各家的 q、现金、估值曲线，
// 列出 SOTA 换手、蒸馏指控、价格战、出口管制这类大事的时间线，并公开完整血统。数据全部来自服务器的 end 事件和公开视图，不在浏览器里重算。
import { esc, usd, pct } from '../fmt.js';
import { lineChart } from '../charts.js';

const BIG = new Set(['shock', 'price', 'regulation', 'antitrust', 'lawsuit', 'controversy', 'ipo', 'restructure', 'poach', 'margin', 'trademark', 'survive']);
const kindLabel = c => (c.kind === 'human' ? (c.hosted ? '真人 · 托管' : '真人') : c.frozen ? '电脑 · 已退场' : '电脑');

// 身家（M.5.10）：持股比例 × 估值；没上市的按八折。
const wealthOf = s => (s ? (s.equity || 0) * (s.valuation || 0) * (s.capital?.listed ? 1 : 0.8) : 0);

export function renderReplay(m) {
  const end = m?.end;
  const pub = m?.pub || {};
  if (!end) return '<section class="solo-screen mp-screen"><div class="mp-body"><div class="solo-card"><b>这一局还没有结束。</b></div></div></section>';
  const meta = Object.fromEntries((pub.companies || []).map(c => [c.id, c]));
  const rows = (end.companies || []).map(v => ({ id: v.id, name: v.company?.name || meta[v.id]?.name || v.id, c: { ...(v.company || {}), ...(meta[v.id] || {}) }, s: v.s })).filter(x => x.s);
  rows.sort((a, b) => wealthOf(b.s) - wealthOf(a.s));
  // q 曲线：各家每个月当时发布过的最强一款。
  const months = [...new Set((pub.rels || []).map(r => r.date))].sort();
  const qSeries = rows.slice(0, 8).map(x => {
    let best = null;
    const mine = (pub.rels || []).filter(r => r.org === x.id);
    return { name: x.name, points: months.map(d => { for (const r of mine) if (r.date <= d) best = Math.max(best ?? -Infinity, r.q); return [d, best]; }) };
  });
  const money = key => rows.slice(0, 8).map(x => ({ name: x.name, points: (x.s.history || []).map(h => [h.date, h[key] ?? null]) }));
  // 大事时间线：SOTA 换手 + 世界新闻里的大事 + 公开指控。
  const name = id => meta[id]?.name || id;
  const events = [
    ...(pub.label?.log || []).map(h => ({ day: h.since || h.day, text: `${name(h.org)} 的 ${h.name} 拿下 SOTA（q ${Math.round(h.q * 10) / 10}）` })),
    ...(pub.news || []).filter(n => BIG.has(n.type)).map(n => ({ day: n.day || `${n.date}-01`, text: n.title })),
    ...(pub.ix?.public || []).map(x => ({ day: x.day, text: `${name(x.by || x.tea)} 公开指控 ${name(x.target || x.stu)} 蒸馏` })),
  ].filter(e => e.day).sort((a, b) => String(a.day).localeCompare(String(b.day)));
  // 完整血统：每一款发布的全部来路（续训底座、开源老师、API 老师、合成教材所在的公司），按公司分组。
  const lineage = rows.map(x => {
    const mine = (end.lineage || []).filter(r => r.org === x.id);
    const items = mine.map(r => `<li><b>${esc(r.name)}</b> <small class="muted">${esc(String(r.day).slice(0, 10))}</small>${r.kin.filter(k => k !== x.id).length ? ` ← ${r.kin.filter(k => k !== x.id).map(k => esc(name(k))).join('、')}` : ' · 自研'}</li>`).join('');
    return `<details class="mp-lineage"><summary>${esc(x.name)} · ${mine.length} 款</summary><ul>${items || '<li class="muted">没有发布过模型。</li>'}</ul></details>`;
  }).join('');
  return `<section class="solo-screen mp-screen mp-replay">
    <header class="solo-head"><button class="icon-btn" data-mp="leave" aria-label="离开房间">←</button>
      <div><span class="eyebrow">REPLAY</span><h2>复盘 · ${esc(end.day || '')}</h2><p class="muted">一局结束，全部隐藏信息公开。</p></div></header>
    <div class="mp-body">
      <div class="solo-card"><div class="solo-card-head"><b>终局</b><small>按身家排（持股 × 估值，没上市的打八折）</small></div>
        <table class="tbl mp-rank"><thead><tr><th>#</th><th>公司</th><th>身家</th><th>估值</th><th>现金</th><th>持股</th></tr></thead><tbody>
        ${rows.map((x, i) => `<tr class="${x.id === m.company ? 'is-on' : ''}"><td>${i + 1}</td><td>${esc(x.name)} <small class="muted">${esc(kindLabel(x.c))}</small></td><td>${usd(wealthOf(x.s))}</td><td>${usd(x.s.valuation || 0)}</td><td>${usd(x.s.cash || 0)}</td><td>${pct(x.s.equity || 0, 1)}</td></tr>`).join('')}
        </tbody></table></div>
      <div class="solo-card"><div class="solo-card-head"><b>旗舰能力 q</b></div>${lineChart(qSeries, { yFmt: v => v.toFixed(0) })}</div>
      <div class="solo-card"><div class="solo-card-head"><b>估值</b></div>${lineChart(money('valuation'), { yFmt: v => usd(v) })}</div>
      <div class="solo-card"><div class="solo-card-head"><b>现金</b></div>${lineChart(money('cash'), { yFmt: v => usd(v), zero: true })}</div>
      <div class="solo-card"><div class="solo-card-head"><b>大事时间线</b><small>${events.length} 件</small></div>
        <ol class="mp-timeline">${events.map(e => `<li><time>${esc(String(e.day).slice(0, 10))}</time><span>${esc(e.text)}</span></li>`).join('') || '<li class="muted">这一局风平浪静。</li>'}</ol></div>
      <div class="solo-card"><div class="solo-card-head"><b>完整血统</b><small>局中不公开的 API 老师、合成教材都在这里</small></div>${lineage}</div>
    </div></section>`;
}
