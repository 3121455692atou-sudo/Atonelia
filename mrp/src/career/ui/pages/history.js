// 后台 · 公司历程（规格 E6、D10.5）：我们的 SOTA 时刻、里程碑（行业第一次 / 我们的里程碑）、路线变迁、
// 完成的策略、授名和名字的使用。每一块都按时间倒序；没有内容时写“还没有”。手机整页纵向滚动，不弹窗。
import * as E from '../../engine.js';
import { MODALITIES, fmtDate } from '../../data/core.js';
import { FAMILIES } from '../../data/rivals.js';
import { STANCE, routeLabel } from '../../data/routes.js';
import { MS_BY_ID } from '../../data/milestones.js';
import { companyFile } from '../../data/companies/index.js';
import { esc } from '../fmt.js';

const dayOf = x => String(x?.day || x?.from || x?.date || '');
const desc = (a, b) => dayOf(b).localeCompare(dayOf(a));
const empty = text => `<p class="muted hist-empty">还没有${text ? `：${text}` : ''}。</p>`;
const dateText = d => (d ? fmtDate(d) : '开局前');

// 我们的 SOTA 时刻：开局前的记录从 SOTA_HISTORY 里取本公司的（含同一集团别的模态），
// 开局后的从 s.sota（当前持有者、被接过的 log、拿到的 made）取；两边按型号名 + 开始日期去重。
function sotaMoments(S) {
  const out = [], seen = new Set();
  const add = (id, name, from, until, counted, mod = S.mod) => {
    if (!name || !from) return;
    const key = `${name}|${from}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ id, name, from, until: until || null, counted: !!counted, mod });
  };
  const org = E.orgOf(S);
  const start = S.start || S.day;
  for (const [mod, chain] of Object.entries(E.SOTA_HISTORY || {})) {
    for (const x of chain || []) if (x.org === org && String(x.since) < String(start)) add(x.id, x.name, x.since, x.until, x.counted, mod);
  }
  for (const x of S.sota?.log || []) if (x.by === 'me') add(x.id, x.name, x.from, x.until, x.counted, S.mod);
  const h = S.sota?.holder;
  if (h?.by === 'me') add(h.id, h.name, h.since, null, h.counted, S.mod);
  for (const x of S.sota?.made || []) {
    const m = (S.models || []).find(y => y.id === x.modelId);
    add(x.modelId, m?.name || x.modelId, x.day, null, true, S.mod);
  }
  return out.sort((a, b) => String(b.from).localeCompare(String(a.from)));
}

// 里程碑：只指 s.ms。行业第一次可能在别家名下；我们的里程碑写“我们”。
function milestoneRows(S, type) {
  return Object.entries(S.ms || {})
    .map(([id, e]) => ({ id, e, def: MS_BY_ID[id] }))
    .filter(x => x.def && (x.def.type || 'first') === type)
    .sort((a, b) => desc(a.e, b.e))
    .map(({ id, e, def }) => {
      const who = e.who === 'me' ? '我们' : (FAMILIES[e.who]?.company || (e.who === 'academia' ? '学界' : '别家'));
      const model = e.model ? ` · ${e.model}` : '';
      return `<li><span>${esc(dateText(e.day))}</span><div><b>${esc(def.title || id)}</b><small>${esc(`${who}${model}`)}</small>${e.note ? `<small>${esc(e.note)}</small>` : ''}</div></li>`;
    });
}

// 路线变迁：看完成的策略节点里带 stance 的那些（setStance 只从那里写）。
function routeChanges(S) {
  const tree = E.resolvedTree(S);
  const out = [];
  for (const [id, d] of Object.entries(S.strategy?.done || {})) {
    const n = tree?.byId?.get(id);
    if (!n?.stance) continue;
    out.push({ day: d.day, title: n.title || '一项策略', label: STANCE[n.stance]?.label || '新路线' });
  }
  return out.sort(desc);
}

// 完成的策略：s.strategy.done 的全部节点（含改路线的那些）。
function doneStrategies(S) {
  const tree = E.resolvedTree(S);
  const out = [];
  for (const [id, d] of Object.entries(S.strategy?.done || {})) {
    const n = tree?.byId?.get(id);
    if (!n) continue;
    out.push({ day: d.day, title: n.title || '一项策略', how: d.how });
  }
  return out.sort(desc);
}

// 授名（s.strategy.rights）和名字的使用（已经发布出去的快照）。
function namingRows(S) {
  const names = companyFile(S.charId)?.names || [];
  const byId = new Map(names.map(n => [n.id, n]));
  const rows = [];
  for (const [id, r] of Object.entries(S.strategy?.rights || {})) {
    const hn = byId.get(id);
    if (!hn) continue;
    const used = r.used ? (S.models || []).find(m => m.id === r.used) : null;
    let state;
    if (r.void) state = `用不上了：${r.void}`;
    else if (used?.stage === 'released') state = `用来发布了「${used.name}」`;
    else if (used) state = '在评测里预留着';
    else if (r.until && r.until < S.day) state = '已经过期，没有用上';
    else state = '还没用';
    rows.push({ day: r.day, name: hn.name, text: state, kind: '授名' });
  }
  for (const m of S.models || []) {
    if (m.stage !== 'released' || !m.released || !m.name) continue;
    rows.push({ day: m.day || m.releasedDay || m.released, name: m.name, text: m.grant ? '用授名发布' : '发布时起的名字', kind: '名字' });
  }
  return rows.sort(desc);
}

export function render(S) {
  const sota = sotaMoments(S);
  const first = milestoneRows(S, 'first');
  const self = milestoneRows(S, 'self');
  const routes = routeChanges(S);
  const done = doneStrategies(S);
  const naming = namingRows(S);
  const route = routeLabel(S.route);
  return `<h2>公司历程</h2>
    <p class="muted">按时间倒序列出这家公司自己走过的路。里程碑只算“行业第一次”和“我们的里程碑”；董事会目标在「董事会目标」页。</p>
    <section class="hist-block"><h3>我们的 SOTA 时刻</h3>${sota.length ? `<ol class="hist-list">${sota.map(x => `<li><span><i>${esc(dateText(x.from))}${x.until ? '' : ' 起'}</i>${x.until ? `<i>至 ${esc(dateText(x.until))}</i>` : ''}</span><div><b>${esc(x.name)}</b><small>${x.mod !== S.mod ? `${esc(MODALITIES[x.mod]?.label || '别的领域')} · ` : ''}${x.counted ? '算数的世界第一' : '还没经过挑战'}</small></div></li>`).join('')}</ol>` : empty()}</section>
    <section class="hist-block"><h3>行业第一次</h3>${first.length ? `<ol class="hist-list">${first.join('')}</ol>` : empty()}</section>
    <section class="hist-block"><h3>我们的里程碑</h3>${self.length ? `<ol class="hist-list">${self.join('')}</ol>` : empty()}</section>
    <section class="hist-block"><h3>路线变迁</h3><p class="muted">现在的路线：${esc(route)}${S.route?.since ? `（${esc(dateText(S.route.since))}起）` : ''}</p>${routes.length ? `<ol class="hist-list">${routes.map(x => `<li><span>${esc(dateText(x.day))}</span><div><b>${esc(x.label)}</b><small>「${esc(x.title)}」完成后改的</small></div></li>`).join('')}</ol>` : empty()}</section>
    <section class="hist-block"><h3>完成的策略</h3>${done.length ? `<ol class="hist-list">${done.map(x => `<li><span>${esc(dateText(x.day))}</span><div><b>${esc(x.title)}</b><small>${x.how === 'bypass' ? '条件达成后自动完成' : '按计划完成'}</small></div></li>`).join('')}</ol>` : empty()}</section>
    <section class="hist-block"><h3>授名和名字的使用</h3>${naming.length ? `<ol class="hist-list">${naming.map(x => `<li><span>${esc(dateText(x.day))}</span><div><b>${esc(x.name)}</b><small>${esc(x.kind)} · ${esc(x.text)}</small></div></li>`).join('')}</ol>` : empty()}</section>`;
}
