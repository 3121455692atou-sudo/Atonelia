// 后台 · 对手：各家旗舰综合能力的走势，和每家一张档案卡。
// 旗舰按 org 取（规格 D1）：一家公司本模态所有产品线里截至今天综合最强的一款，不看参数、发布先后和开闭源。
import * as E from '../../engine.js';
import { PRICE_TIERS, COMPANIES, TIERS, addMonths, fmtDate, characterById } from '../../data/core.js';
import { FAMILIES, RELEASES } from '../../data/rivals.js';
import { TICKERS } from '../../data/world.js';
import { esc, face } from '../fmt.js';
import { lineChart, sparkline } from '../charts.js';
import { getWorld, getMp } from '../state.js';

const BOT_LABEL = { easy: '简单', normal: '普通', hard: '困难', passive: '托管' };

// ---------- SOTA 角标和徽章（规格 D10、D11）：对手页按各家现在的旗舰标 ----------
const BADGE_NAME = { open_top: '开源最强', community: '社区之选', works: '能干活' };
const ym = d => String(d || '').slice(0, 7);
function marks(S, rel) {
  if (!rel) return '';
  const h = S.sota?.holder;
  const out = [];
  if (h && h.by === rel.family && h.name === rel.name) out.push(`<span class="sota-badge sota-badge--now" title="${h.counted ? '世界第一' : '还没经过挑战'}">SOTA</span>`);
  for (const x of (S.sota?.log || [])) if (x.by === rel.family && x.name === rel.name) out.push(`<span class="sota-badge sota-badge--past" title="${x.counted ? '曾经是世界第一' : '还没经过挑战'}">曾为 SOTA（${ym(x.from)} 至 ${ym(x.until)}）</span>`);
  const badges = rel.tainted && !rel.untainted ? [] : (Array.isArray(rel.badges) ? rel.badges : E.badgesFor(S, rel));
  for (const b of badges.filter(b => BADGE_NAME[b])) out.push(`<span class="model-badge model-badge--${b}">${BADGE_NAME[b]}</span>`);
  return out.length ? `<div class="rival-marks">${out.join('')}</div>` : '';
}

// 月底那天（走势图按月取当时的旗舰）。
const monthEnd = m => `${m}-31`;

// 对手：上面一张各家旗舰综合能力的走势图（含你们），下面每家一张档案卡。
export function render(S) {
  const W = getWorld();
  return W ? renderSolo(S, W) : renderHistory(S);
}
function renderHistory(S) {
  const live = E.liveModel(S);
  const myQ = live ? E.qOf(S.mod, live.dims) : null;
  const rows = E.rivalStandings(S);
  // 走势图：最近两年，前六家 + 你们。每个月取各家当时的旗舰（orgBest）。
  // 你们的线：开局之前用这家公司真实的历史型号，开局以后用你们自己发布过的版本里当时最强的一款；还没有模型的月份留空。
  const mine = S.models.filter(m => m.stage === 'released' && m.released);
  const months = [];
  for (let d = addMonths(S.date, -23); d <= S.date; d = addMonths(d, 1)) months.push(d);
  const at = m => (m === S.date ? S.day : monthEnd(m));
  const q = rel => (rel ? E.qOf(S.mod, E.relDims(S, rel)) : null);
  const series = rows.slice(0, 6).map(r => ({ name: FAMILIES[r.rel.family].company, points: months.map(m => [m, q(E.orgBest(S, r.org, S.mod, at(m)))]) }));
  const myAt = m => {
    if (m < S.start) { const rel = E.orgBest(null, E.orgOf(S), S.mod, monthEnd(m)); return rel ? E.qOf(S.mod, rel.dims) : null; }
    const qs = mine.filter(x => (x.releasedDay ?? `${x.released}-15`) <= at(m)).map(x => E.qOf(S.mod, x.dims));
    return qs.length ? Math.max(...qs) : null;
  };
  series.push({ name: '你们', color: '#c0392b', bold: true, points: months.map(m => [m, myAt(m)]) });
  const chart = series.some(s => s.points.some(p => p[1] !== null)) ? `<div class="card wide"><div class="card-head"><b>旗舰综合能力走势</b><small>最近 ${months.length} 个月 · 每家当时综合最强的一款 · 游戏估算</small></div>${lineChart(series, { w: 900, h: 250, yFmt: v => v.toFixed(0) })}</div>` : '';
  const news = r => S.news.filter(n => FAMILIES[n.family]?.org === r.org || n.title.includes(FAMILIES[r.rel.family].company)).slice(0, 2);
  const card = r => {
    const fam = FAMILIES[r.rel.family];
    const c = COMPANIES.find(x => x.org === r.org && x.modality === S.mod) || COMPANIES.find(x => x.families.includes(r.rel.family));
    const hist = RELEASES.filter(x => x.mod === S.mod && FAMILIES[x.family].org === r.org && x.day <= S.day).sort((a, b) => a.day.localeCompare(b.day)).slice(-6);
    const tk = TICKERS.find(t => t.family && FAMILIES[t.family]?.org === r.org) || (c?.parent && TICKERS.find(t => t.id === c.parent));
    const price = tk && E.tickerPrice(tk.id, S.date);
    const gap = myQ !== null ? r.q - myQ : null;
    return `<div class="card rival-card">
      <div class="rival-head">${c ? face(c.art || c.id) : ''}<div><b>${esc(fam.company)}</b><small>${esc(fam.name)}</small></div>${gap !== null ? `<span class="pill ${gap > 1 ? 'bad' : gap < -1 ? 'ok' : 'warn'}">${gap > 0 ? '领先你们' : '落后你们'} ${Math.abs(gap).toFixed(1)}</span>` : ''}</div>
      <div class="rival-model"><b>${esc(r.rel.name)}</b><small>${fmtDate(r.rel.date)} · ${{ small: '轻量', mid: '中型', large: '大型', frontier: '前沿' }[r.rel.cls]} · ${r.rel.open ? '开源' : '闭源'} · ${PRICE_TIERS[r.rel.price].label}价</small>${marks(S, r.rel)}</div>
      <div class="rival-row"><span>综合 ${r.q.toFixed(1)}</span>${hist.length > 1 ? sparkline(hist.map(x => E.qOf(S.mod, E.relDims(S, x))), { w: 110, h: 26 }) : ''}<small>${hist.length} 个版本</small></div>
      ${price ? `<div class="rival-row"><span>${esc(tk.name || tk.id)}</span><b>${E.ccySign(tk.id)}${price}</b><small>${tk.family ? '已上市' : '母公司股价'}</small></div>` : ''}
      ${news(r).map(n => `<p class="rival-news"><em>${n.day ? n.day.slice(5).replace('-', '/') : n.date}</em>${esc(n.title)}</p>`).join('')}
    </div>`;
  };
  return `<h2>对手</h2><p class="muted">每家公司已经发布的综合最强一款（旗舰）、开源与否、价格和最近的动作。综合能力为游戏估算值。${myQ !== null ? `你们的在线模型综合 ${myQ.toFixed(1)}。` : ''}</p>
    ${chart}${rows.map(card).join('')}`;
}

// ---------- 自洽：同场公司（M.7） ----------
// 只读 world.publicView：不出现别家的现金、在练模型、作业、送评候选。
const fmtLicense = rel => (!rel ? '还没有发布' : rel.open ? (rel.license === 'restrictive' ? '受限许可开源' : '宽松许可开源') : '闭源');
function shareFor(view, org) {
  let sum = 0, found = false;
  for (const key of ['chat|global', 'chat|CN']) {
    const entry = view.market?.table?.[key];
    if (!entry?.rows) continue;
    for (const r of entry.rows) if (r.org === org) { sum += r.share || 0; found = true; }
  }
  return found ? sum : null;
}
function renderSolo(S, W) {
  const view = W.publicView(W.settings?.you);
  const companies = [...view.companies].sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99) || (a.id < b.id ? -1 : 1));
  const relsOf = id => view.rels.filter(r => r.org === id && r.day <= view.day || (r.org === id && !r.day));
  const holder = view.label?.holder;
  const card = c => {
    const mine = c.id === view.you;
    const rels = relsOf(c.id).sort((a, b) => String(a.day || '').localeCompare(String(b.day || '')));
    const best = rels.reduce((a, r) => (!a || r.q > a.q ? r : a), null);
    const last = rels.at(-1) || null;
    const past = (view.label?.log || []).filter(h => h.org === c.id);
    const share = shareFor(view, c.id);
    const who = c.frozen ? '冻结' : c.kind === 'human' ? (c.hosted ? '真人 · 托管中' : '真人') : `电脑 · ${BOT_LABEL[c.bot] || '普通'}`;
    const real = COMPANIES.find(x => x.id === c.id);
    const artId = mine ? S.persona?.artId : (real?.art || c.id);
    const gap = best ? myGap(S, best) : null;
    const marks = [];
    if (holder?.org === c.id) marks.push(`<span class="sota-badge sota-badge--now" title="${holder.counted ? '世界第一' : '还没经过挑战'}">SOTA</span>`);
    for (const h of past) marks.push(`<span class="sota-badge sota-badge--past" title="${h.counted ? '曾经是世界第一' : '还没经过挑战'}">曾为 SOTA（${String(h.since || h.day || '').slice(0, 7)} 至 ${String(h.until || view.day).slice(0, 7)}）</span>`);
    return `<article class="card solo-rival${mine ? ' is-mine' : ''}${c.frozen ? ' is-frozen' : ''}">
      <div class="rival-head">${characterById(artId) ? face(artId) : `<span class="face face--blank face--initial" aria-hidden="true">${esc([...String(c.name || '?')][0])}</span>`}<div><b>${esc(c.name)}${mine ? ' · 你们' : ''}</b><small>${esc(who)} · 开局档 ${esc(TIERS[c.tier]?.label || c.tier || '未知')}</small></div>
        ${Number.isFinite(gap) ? `<span class="pill ${gap > 1 ? 'bad' : gap < -1 ? 'ok' : 'warn'}">${gap > 0 ? '领先你们' : '落后你们'} ${Math.abs(gap).toFixed(1)}</span>` : ''}</div>
      <div class="rival-model"><b>${best ? esc(best.name) : '还没有发布过模型'}</b><small>${best ? `综合 ${best.q.toFixed(1)} · ${fmtDate(best.date)} · ${esc(fmtLicense(best))}` : '开局前也没有能看到的发布'}</small>${marks.length ? `<div class="rival-marks">${marks.join('')}</div>` : ''}</div>
      <div class="solo-rival-facts">
        <span>市场份额 <b>${share === null ? '还没结算' : `${(share * 100).toFixed(1)}%`}</b></span>
        <span>最近发布 <b>${last ? esc(last.name) : '—'}</b><small>${last ? esc(fmtDate(last.date)) : ''}</small></span>
        <span>许可 <b>${esc(fmtLicense(last))}</b></span>
        <span>卡数档 <b>${esc(TIERS[c.tier]?.label || c.tier || '未知')}</b></span>
      </div>
      ${c.frozen ? '<p class="muted">开局前的发布照旧可见；这家以后不再发布。</p>' : ''}
    </article>`;
  };
  return `<h2>同场公司</h2><p class="muted">这个世界上所有还在场的公司。${getMp() ? '真人掉线 60 秒以后由电脑托管，回来就交还；' : '真人只有你一家，其余由电脑经营；'}被冻结的公司开局前的发布照旧可见。综合能力为游戏估算值，只显示人人都看得到的东西。</p>
    <div class="solo-rivals">${companies.map(card).join('')}</div>`;
}
// 自己旗舰和对方旗舰的差（没有在线模型时留空）。
function myGap(S, rel) {
  const live = E.liveModel(S);
  if (!live || !rel) return -Infinity;
  return rel.q - E.qOf(S.mod, live.dims);
}
