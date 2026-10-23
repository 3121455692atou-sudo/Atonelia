// 后台 · 榜单：能力榜（按榜单、按量级）、调用量、性价比。
import * as E from '../../engine.js';
import { monthsBetween } from '../../data/core.js';
import { BENCHMARKS, BENCH_BY_ID, lastRefresh } from '../../data/benchmarks.js';
import { RELEASES } from '../../data/rivals.js';
import { esc, count, tokens, benchUnit } from '../fmt.js';
import { barBoard, eloBoard, scatter, shareBars } from '../charts.js';

// ---------- SOTA 角标和徽章（规格 D10、D11）：榜上每一行也标明 ----------
const BADGE_NAME = { open_top: '开源最强', community: '社区之选', works: '能干活' };
const ym = d => String(d || '').slice(0, 7);
const isTainted = m => !!m?.tainted && !m?.untainted;
const rowRelease = (S, row) => (row.mine ? null : RELEASES.find(r => r.mod === S.mod && r.family === row.family && r.name === row.model && (!row.day || r.day === row.day)) || null);
function rowBadges(S, row) {
  if (row.mine) {
    const m = (S.models || []).find(x => x.id === row.modelId);
    if (!m || isTainted(m)) return [];
    return (Array.isArray(m.badges) ? m.badges : (m.stage === 'released' ? E.badgesFor(S, m) : [])).filter(b => BADGE_NAME[b]);
  }
  const rel = rowRelease(S, row);
  if (!rel || isTainted(rel)) return [];
  return (Array.isArray(rel.badges) ? rel.badges : E.badgesFor(S, rel)).filter(b => BADGE_NAME[b]);
}
function rowMarks(S, row) {
  const h = S.sota?.holder;
  const now = row.mine ? (h?.by === 'me' && h?.id === row.modelId) : (!!h && h.by === row.family && h.name === row.model);
  const past = (S.sota?.log || []).filter(x => (row.mine ? x.by === 'me' && x.id === row.modelId : x.by === row.family && x.name === row.model));
  const out = [];
  if (now) out.push(`<span class="sota-badge sota-badge--now" title="${h.counted ? '世界第一' : '还没经过挑战'}">SOTA</span>`);
  for (const x of past) out.push(`<span class="sota-badge sota-badge--past" title="${x.counted ? '曾经是世界第一' : '还没经过挑战'}">曾为 SOTA（${ym(x.from)} 至 ${ym(x.until)}）</span>`);
  for (const b of rowBadges(S, row)) out.push(`<span class="model-badge model-badge--${b}">${BADGE_NAME[b]}</span>`);
  return out;
}
// 榜上的标记条：只列有 SOTA、曾为 SOTA 或徽章的行，跟在图后面。
function marksBoard(S, rows) {
  const items = rows.map(row => ({ row, marks: rowMarks(S, row) })).filter(x => x.marks.length);
  if (!items.length) return '';
  return `<div class="board-marks">${items.map(({ row, marks }) => `<div class="board-mark"><b>${esc(row.name.replace(/（非旗舰）$/, ''))}</b>${row.company ? `<small>${esc(row.company)}</small>` : ''}${marks.join('')}</div>`).join('')}</div>`;
}

export function render(S, st) {
  const list = BENCHMARKS.filter(b => b.mod === S.mod && S.date >= b.from && (!b.cnOnly || S.company.country === 'CN'));
  if (!st.bench || !list.find(b => b.id === st.bench)) st.bench = (list.find(b => b.id === 'arena' || b.kind === 'elo') || list[0])?.id;
  const live = E.liveModel(S);
  const tabs = `<div class="tabs">${[['bench', '能力榜'], ['usage', '调用量'], ['value', '性价比']].map(([k, l]) => `<button class="${st.board === k ? 'is-on' : ''}" data-board="${k}">${l}</button>`).join('')}</div>`;
  if (st.board === 'usage') {
    const ub = E.usageBoards(S);
    const parts = Object.values(ub).map(x => `<div class="card"><div class="card-head"><b>${esc(x.title)}</b><small>${esc(x.unit)}</small></div>${shareBars(x.rows, { fmt: v => (x.unit === '人' ? count(v) : tokens(v)) })}</div>`);
    return `<h2>榜单</h2>${tabs}<p class="muted">调用量反映真实使用。开源、便宜的模型在 OpenRouter 这类第三方平台上特别受欢迎；Coding Plan 用量随编程 Agent 普及而暴涨。</p>${parts.join('') || '<p class="muted">这个时期还没有公开的调用量统计。</p>'}`;
  }
  if (st.board === 'value') {
    // 纵轴用竞技场 Elo：现实里的“价格—能力”图也常用它，头部模型拉得开；竞技场上线前用 MMLU。
    const b = BENCH_BY_ID[S.mod === 'llm' ? (S.date >= '2023-05' ? 'arena' : 'mmlu') : list[0].id];
    const lb = E.leaderboard(S, b.id);
    const pts = lb.rows.map(r => ({ x: E.listPrice(S.date, { price: r.mine ? S.products.api?.tier || 'standard' : r.price || 'standard', cls: r.cls, name: r.name }), y: r.score, label: r.name, mine: r.mine }));
    return `<h2>榜单</h2>${tabs}<div class="card"><div class="card-head"><b>价格与能力</b><small>横轴：每百万 token 价格（对数）；纵轴：${esc(b.name)}</small></div>${scatter(pts, { xLabel: '每百万 token 价格', yLabel: b.name })}<p class="muted">左上角是又便宜又强的“性价比区”。中国模型想出海，最常见的打法就是把自己放进这个区。价格是按美元标价估算的，挤在一起的点悬停可以看名字。</p></div>`;
  }
  const b = BENCH_BY_ID[st.bench];
  const lb = E.leaderboard(S, b.id, { cls: st.cls || null });
  const chart = b.kind === 'elo' ? eloBoard(lb.rows) : barBoard(lb.rows, { unit: benchUnit(b), lower: b.kind === 'lower', max: b.kind === 'pct' || b.kind === 'lower' ? 100 : b.hi });
  const refreshed = lastRefresh(b, S.date);
  // 同分同名次；真有并列时才说明。全榜 0 分是题太难、大家都在最低分上，不是谁领先。
  const tied = lb.rows.some((r, i) => i > 0 && r.rank === lb.rows[i - 1].rank);
  const tieNote = !tied ? '' : lb.rows.every(r => r.score === 0) ? '全榜都是最低分 0 分，名次并列，还分不出高下。' : '同分的名次并列（例如 1、1、3）。';
  return `<h2>榜单</h2>${tabs}
    <div class="chips">${list.map(x => `<button class="chip-btn ${x.id === st.bench ? 'is-on' : ''}" data-bench="${x.id}">${esc(x.name)}</button>`).join('')}</div>
    <div class="card"><div class="card-head"><b>${esc(b.name)}</b><small>${b.kind === 'elo' ? `${count(b.items)} 场对战 · Elo` : `${b.items} 题 · ${b.kind === 'lower' ? '越低越好' : '越高越好'}`}${refreshed !== b.from ? ` · ${refreshed} 换过题` : ''}</small></div>
      <p class="muted">${esc(b.desc)}</p>
      <div class="chips">${[['', '总榜'], ['small', '轻量'], ['mid', '中型'], ['large', '大型'], ['frontier', '前沿']].map(([k, l]) => `<button class="chip-btn ${st.cls === k ? 'is-on' : ''}" data-cls="${k}">${l}</button>`).join('')}</div>
      ${chart}
      ${marksBoard(S, lb.rows)}
      <p class="muted">${tieNote}单项第一不等于综合最强，综合能力看「对手」页。</p>
      ${!S.published[b.id] && live ? '<p class="muted">你们还没有在这个榜单上提交成绩。可以用主界面的「跑分」提交。</p>' : ''}
      ${S.published[b.id] && S.published[b.id].date < refreshed ? '<p class="warn">榜单换过题，你们之前的成绩已失效，需要重新跑分。</p>' : ''}
      <p class="muted">${monthsBetween(b.from, S.date) > 18 ? '这个榜单已经发布很久，不少模型的训练数据里可能混进了题目，分数偏虚。' : '这是比较新的榜单，更能反映真实能力。'}</p></div>`;
}

export function click(S, t, { st, draw }) {
  const bench = t.closest('[data-bench]');
  if (bench) { st.bench = bench.dataset.bench; draw(); return; }
  const cls = t.closest('[data-cls]');
  if (cls) { st.cls = cls.dataset.cls; draw(); return; }
  const board = t.closest('[data-board]');
  if (board) { st.board = board.dataset.board; draw(); }
}
