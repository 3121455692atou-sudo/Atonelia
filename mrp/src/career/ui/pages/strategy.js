// Company strategy atlas: semantic branches, obstacle-routed prerequisites and local details.
import { layoutTree } from '../tree_layout.js';
import { bindTreeViewport } from '../tree_viewport.js';
import * as E from '../../engine.js';
import { STANCES, STANCE, LICENSES, routeLabel } from '../../data/routes.js';
import { SHELF_DAYS } from '../../data/balance.js';
import { STRATEGY_ICONS, strategyIconSrc } from '../../data/strategy_icons.js';
import { esc } from '../fmt.js';
import { getState, toast } from '../state.js';
import { isRemote, act, after as then } from '../act.js';

const BRANCH_COLORS = ['#2f78aa', '#8a73c4', '#4f9474', '#c08a3e', '#b35f6a', '#5a8f9c', '#8a6d4c'];
const TREE_LABEL = tree => (String(tree?.id || '').startsWith('_generic') ? '通用策略树' : '本家策略树');

// 节点状态在界面上的说法。搁置是引擎的附带信息（完成了的优先级更高），所以放在 locked 之前单独判一次。
function statusOf(S, o) {
  const cur = S.strategy?.cur;
  const done = ['done', 'bypassed'].includes(o.state);
  if (o.state === 'active') return { key: 'active', label: '进行中', tone: 'active', note: `${Math.floor(o.days)}/${o.need} 天` };
  if (o.state === 'paused') return { key: 'paused', label: '暂停', tone: 'warn', note: cur?.paused || '条件不成立了' };
  if (o.state === 'done') return { key: 'done', label: '已完成', tone: 'done', note: '' };
  if (o.state === 'bypassed') return { key: 'bypassed', label: '已完成', tone: 'done', note: '条件达成后自动完成' };
  if (o.state === 'excluded') return { key: 'excluded', label: '互斥失效', tone: 'bad', note: '和已经选过的那一项互斥' };
  if (o.state === 'blocked') return { key: 'blocked', label: '做不成了', tone: 'bad', note: '' };
  if (o.state === 'cooldown') {
    const now = (o.why || []).find(x => !x.ok)?.now || '';
    return { key: 'cooldown', label: '冷却中', tone: 'warn', note: now };
  }
  if (!done && o.shelvedDays > 0) return { key: 'shelved', label: '搁置', tone: 'warn', note: `已做 ${Math.floor(o.days)} 天，进度还能留 ${o.shelvedDays} 天` };
  if (o.state === 'available') return { key: 'available', label: '可开始', tone: 'ok', note: '' };
  return { key: 'locked', label: '锁定', tone: 'locked', note: '' };
}

const DONE = new Set(['done', 'bypassed']);

// 完成效果（全用引擎的白话）：数值 / 技术 / 数据变化走 describeEffects，路线、特质、授名、事件只写数量，不露内部键。
function effectText(S, n) {
  const parts = [];
  const fx = E.describeEffects(n.effects, S);
  if (fx) parts.push(fx);
  if (n.stance) parts.push(`路线改成「${STANCE[n.stance]?.label || '新路线'}」`);
  const add = (n.spirits?.add || []).map(x => (typeof x === 'string' ? x : x.id));
  const names = add.map(id => E.spiritDef(S, id)?.title).filter(Boolean);
  if (names.length) parts.push(`获得公司特质「${names.join('」「')}」`);
  else if (add.length) parts.push(`获得 ${add.length} 个公司特质`);
  if (n.spirits?.remove?.length) parts.push(`失去 ${n.spirits.remove.length} 个旧特质`);
  if (n.grants?.names?.length) parts.push(`可以争取 ${n.grants.names.length} 个史实型号名`);
  if (n.grants?.events?.length) parts.push(`解锁 ${n.grants.events.length} 个专属事件`);
  if (n.grants?.unlock?.length) parts.push(`解锁 ${n.grants.unlock.length} 项后续做法`);
  return parts.length ? parts.join('；') : '没有额外效果';
}

function condList(o) {
  const why = o.why || [];
  if (!why.length) return '<li class="strategy-cond ok"><i>✓</i><span>没有额外条件</span></li>';
  return why.map(x => `<li class="strategy-cond ${x.ok ? 'ok' : 'no'}"><i>${x.ok ? '✓' : '✗'}</i><span>${esc(x.text)}${x.now ? `（现在：${esc(x.now)}）` : ''}</span></li>`).join('');
}

function detailHtml(S, o, st = {}) {
  const n = o.node;
  const up = n.upfront ? `<p class="strategy-upfront"><b>开始时</b>：${esc(E.describeEffects(n.upfront, S) || '不扣东西')}</p>` : '';
  return `<p class="strategy-desc">${esc(n.desc || '')}</p>
    <div class="strategy-sub"><b>开始条件</b><ul class="strategy-conds">${condList(o)}</ul></div>
    ${up}
    <p class="strategy-effects"><b>完成效果</b>：${esc(effectText(S, n))}</p>
    ${actionsHtml(S, o, st)}`;
}

// 按钮：进行中只给“先搁置”；可开始的给“开始 / 换成这项”，换项第一次点只进确认态，第二次才真换。
function actionsHtml(S, o, st = {}) {
  const n = o.node;
  const cur = S.strategy?.cur;
  if (n.auto) return `<p class="strategy-auto">这一项条件达成后自动完成，不占策略槽。</p>`;
  if (cur?.id === n.id) return `<div class="strategy-acts"><button class="btn btn--sm" data-strategy-op="shelve" data-id="${esc(n.id)}" ${st.readOnly||st.strategyPending?'disabled':''}>先搁置（进度保留 ${SHELF_DAYS} 天）</button></div>`;
  if (o.state !== 'available') return '';
  const resume = o.shelvedDays > 0 && o.days > 0 ? `接着做（已做 ${Math.floor(o.days)} 天，还能保留 ${o.shelvedDays} 天）` : '';
  const label = cur ? (resume ? `换成这项（接着做 ${Math.floor(o.days)} 天）` : '换成这项') : (resume || '开始这项策略');
  return `<div class="strategy-acts"><button class="btn btn--sm btn--primary" data-strategy-op="${cur ? 'switch' : 'start'}" data-id="${esc(n.id)}" ${st.readOnly||st.strategyPending?'disabled':''}>${esc(label)}</button></div>`;
}

// 换项的二次确认提示（渲染时根据后台状态里的 strategyConfirm 显示）。
function confirmHtml(S, o, st) {
  const cur = S.strategy?.cur;
  if (!cur || cur.id === o.node.id || st.strategyConfirm !== o.node.id) return '';
  const old = E.strategyOptions(S).find(x => x.id === cur.id)?.node;
  const oldDays = Math.floor(cur.days);
  return `<p class="strategy-confirm" role="status">再点一次“换成这项”就换过去。「${esc(old?.title || '现在这一项')}」已经做了 ${oldDays} 天，这 ${oldDays} 天会保留 ${SHELF_DAYS} 天；${SHELF_DAYS} 天内换回来还能接着做。</p>`;
}

// Layout is presentation-only, cached by topology rather than game progress.
const geometryCache = new Map();
export function strategyGeometry(tree, opts) {
  const nodes=opts.map(o=>({id:o.id,group:o.node.branch}));
  const edges=[], seen=new Set();
  for(const o of opts){
    for(const g of o.node.prereq||[])for(const id of g)edges.push({from:id,to:o.id,kind:g.length>1?'alternative':'required'});
    for(const id of o.node.excludes||[]){const k=[o.id,id].sort().join('|');if(!seen.has(k)){seen.add(k);edges.push({from:o.id,to:id,kind:'exclusive'});}}
  }
  const key=JSON.stringify([nodes,edges,tree.branches]);
  if(!geometryCache.has(key))geometryCache.set(key,layoutTree(nodes,edges,Object.entries(tree.branches||{}).map(([id,label])=>({id,label})),{width:156,height:132}));
  return geometryCache.get(key);
}
function linksSvg(opts, layout, selected) {
  return `<svg class="strategy-links" viewBox="0 0 ${layout.width} ${layout.height}" aria-hidden="true"><defs><marker id="strategy-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 8 4 L 0 8 Z" fill="#b99a5b"/></marker></defs>${layout.edges.map(e=>`<path class="strategy-link${e.kind==='exclusive'?' strategy-link--excl':''}${e.kind==='alternative'?' strategy-link--alternative':''}${selected?(e.from===selected||e.to===selected?' is-related':' is-muted'):''}" data-from="${esc(e.from)}" data-to="${esc(e.to)}" d="${e.d}" ${e.kind!=='exclusive'?'marker-end="url(#strategy-arrow)"':''}/>`).join('')}</svg>`;
}

export function after(el, S, st = {}, ctx = {}) {
  if(st.strategyRequest?.state===S)st.strategyRequest.viewActive=true;
  bindTreeViewport(el, st, 'strategyCamera');
  const list=el?.querySelector?.('.strategy-list-mode');
  if(list)list.ontoggle=()=>{st.strategyListOpen=list.open;};
  for(const branch of el?.querySelectorAll?.('[data-mobile-branch]')||[])branch.ontoggle=()=>{(st.strategyBranches||={})[branch.dataset.mobileBranch]=branch.open;};
  if(st.strategyListFocus){const node=[...el.querySelectorAll('[data-strategy-open]')].find(n=>n.dataset.strategyOpen===st.strategyListFocus);node?.focus?.({preventScroll:true});delete st.strategyListFocus;}
  if(st.strategyReturnFocus){
    const node=[...el.querySelectorAll('[data-strategy-node]')].find(n=>n.dataset.strategyNode===st.strategyReturnFocus);
    node?.focus?.({preventScroll:true});delete st.strategyReturnFocus;
  }
}

const branchColor = (tree, key) => {
  const i = Object.keys(tree.branches || {}).indexOf(key);
  return BRANCH_COLORS[(i < 0 ? 0 : i) % BRANCH_COLORS.length];
};
// 节点图标：有图用图，没有就写标题首字。状态角标：完成 ✓、进行中 ▶、暂停 Ⅱ、互斥或做不成 ✕、冷却和搁置 …
const BADGE = { done: '✓', bypassed: '✓', active: '▶', paused: 'Ⅱ', excluded: '✕', blocked: '✕', cooldown: '…', shelved: '…' };
function iconHtml(n, s, { cls = '', pct = null } = {}) {
  const img = STRATEGY_ICONS.has(n.id)
    ? `<img src="${esc(strategyIconSrc(n.id))}" alt="" loading="lazy" decoding="async" />`
    : `<span class="sg-icon-letter">${esc([...String(n.title || '·')][0])}</span>`;
  const ring = pct !== null ? ` style="--pct:${Math.round(pct)}"` : '';
  const badge = BADGE[s.key] ? `<i class="sg-badge sg-badge--${s.tone}">${BADGE[s.key]}</i>` : '';
  return `<span class="sg-icon ${cls}"${ring}>${img}${badge}</span>`;
}
const curPct = (S, n) => {
  const cur = S.strategy?.cur;
  return cur?.id === n.id && cur.need > 0 ? Math.max(0, Math.min(100, cur.days / cur.need * 100)) : null;
};

// Compact nodes keep explanations in the nearby inspector.
function nodeCard(S, o, tree, layout, sel) {
  const n = o.node;
  const s = statusOf(S, o);
  const cell = layout.rects.get(n.id);
  const sub = s.key === 'active' ? s.note : s.key === 'done' || s.key === 'bypassed' ? '已完成' : `${n.days} 天`;
  return `<button type="button" class="strategy-node ${s.tone}${sel ? ' is-sel' : ''}" data-strategy-node="${esc(n.id)}" data-strategy-pick="${esc(n.id)}" data-state="${s.key}" aria-pressed="${sel}"
    ${sel ? 'data-tree-selected' : ''} aria-label="${esc(`${n.title}，${s.label}，${n.days} 天`)}" style="left:${cell.x}px;top:${cell.y}px;--branch:${branchColor(tree, n.branch)}">
    ${iconHtml(n, s, { pct: curPct(S, n) })}
    <b class="strategy-title">${esc(n.title)}</b>
    <small class="strategy-node-sub">${esc(sub)} · ${s.label}</small>
  </button>`;
}

// No automatic inspector: open only the node the player selected.
function selectedOf(S, opts, st) {
  return opts.find(o => o.node.id === st.strategySel);
}
function detailPanel(S, o, tree, st) {
  const n = o.node;
  const s = statusOf(S, o);
  return `<aside class="strategy-detail" data-strategy-detail-panel="${esc(n.id)}" data-tree-popover role="dialog" aria-label="${esc(n.title)}" aria-live="polite">
    <button class="strategy-detail-close" data-strategy-close data-tree-close aria-label="关闭策略详情">×</button>
    <div class="strategy-detail-head" style="--branch:${branchColor(tree, n.branch)}">
      ${iconHtml(n, s, { cls: 'sg-icon--big', pct: curPct(S, n) })}
      <div><span class="strategy-branch-tag">${esc(tree.branches?.[n.branch] || '其他')}</span><b class="strategy-detail-title">${esc(n.title)}</b>
        <div class="strategy-state-line"><span class="strategy-state strategy-state--${s.tone}">${s.label}</span><span class="strategy-days">${n.days} 天</span>${s.note ? `<small>${esc(s.note)}</small>` : ''}</div></div>
    </div>
    ${detailHtml(S, o, st)}
    ${confirmHtml(S, o, st)}
  </aside>`;
}

function desktopTree(S, tree, opts, st) {
  const layout = strategyGeometry(tree,opts), sel = selectedOf(S,opts,st);
  return `<section class="card strategy-tree-card">
    <div class="card-head"><b>公司策略 · 分支路线图</b><small>${esc(TREE_LABEL(tree))} · ${opts.length} 项</small></div>
    <div class="strategy-map-tools"><span>实线：全部前置 · 点线：任选前置 · 红虚线：互斥</span><div><button class="btn btn--sm" data-tree-zoom="out" aria-label="缩小策略树">−</button><output data-tree-scale>100%</output><button class="btn btn--sm" data-tree-zoom="in" aria-label="放大策略树">＋</button><button class="btn btn--sm" data-tree-zoom="reset">原大</button><button class="btn btn--sm" data-tree-zoom="fit">全图</button></div></div>
    <p class="strategy-map-hint">同一分支沿纵向推进 · 拖动空白或滚动浏览 · 点击节点查看附近详情</p>
    <div class="strategy-tree-body" data-tree-shell>
      <div class="strategy-map-wrap" data-tree-viewport tabindex="0" aria-label="公司策略树，可滚动或拖动，使用加减键缩放"><div data-tree-stage><div class="strategy-grid" data-tree-canvas data-width="${layout.width}" data-height="${layout.height}" style="width:${layout.width}px;height:${layout.height}px">
        ${layout.lanes.map(l=>`<div class="strategy-lane" style="left:${l.x}px;top:${l.y}px;width:${l.w}px;height:${l.h}px;--branch:${branchColor(tree,l.id)}"><b>${esc(l.label)}</b></div>`).join('')}
        ${linksSvg(opts,layout,sel?.id)}${opts.map(o=>nodeCard(S,o,tree,layout,o===sel)).join('')}
      </div></div></div>
      ${sel?detailPanel(S,sel,tree,st):''}
    </div>
  </section>`;
}

function mobileNode(S, o, st) {
  const n = o.node;
  const s = statusOf(S, o);
  const open = st.strategyOpen === n.id;
  const one = effectText(S, n);
  return `<div class="strategy-m-item ${s.tone}${open ? ' is-open' : ''}" data-mobile-node="${esc(n.id)}">
    <button class="strategy-m-node" data-strategy-open="${esc(n.id)}" aria-expanded="${open}">
      ${iconHtml(n, s, { cls: 'sg-icon--row' })}
      <span class="strategy-m-main"><b>${esc(n.title)}</b><small>${n.days} 天 · ${esc(one)}</small></span>
      <span class="strategy-m-state strategy-m-state--${s.tone}">${s.label}</span>
    </button>
    ${open ? `<div class="strategy-m-detail" data-strategy-detail="${esc(n.id)}">${s.note ? `<p class="strategy-state-note">${esc(s.note)}</p>` : ''}${detailHtml(S, o, st)}${confirmHtml(S, o, st)}</div>` : ''}
  </div>`;
}

function mobileTree(S, tree, opts, st) {
  const keys = [...new Set(opts.map(o => o.node.branch))];
  const order = [...Object.keys(tree.branches || {}).filter(k => keys.includes(k)), ...keys.filter(k => !(k in (tree.branches || {})))];
  return `<section class="strategy-mobile" aria-label="策略树（手机）">
    ${order.map(key => {
      const list = opts.filter(o => o.node.branch === key);
      const done = list.filter(o => DONE.has(o.state)).length;
      const open = st.strategyBranches?.[key] ?? list.some(o => ['available', 'active', 'paused'].includes(o.state) || o.shelvedDays > 0);
      return `<details class="strategy-branch" data-mobile-branch="${esc(key)}" ${open ? 'open' : ''}>
        <summary><b>${esc(tree.branches?.[key] || '其他')}</b><small>${list.length} 项 · 已完成 ${done}</small></summary>
        <div class="strategy-m-list">${list.map(o => mobileNode(S, o, st)).join('')}</div>
      </details>`;
    }).join('')}
  </section>`;
}

function currentCard(S, opts) {
  const cur = S.strategy?.cur;
  if (!cur) {
    return `<section class="card strategy-current is-idle">
      <div class="card-head"><b>当前策略</b><small>现在没有进行中的策略</small></div>
      <p class="muted">去下面挑一项。同一时间只推进一项；换项时旧进度保留 ${SHELF_DAYS} 天。</p>
    </section>`;
  }
  const o = opts.find(x => x.id === cur.id);
  const n = o?.node;
  const pct = cur.need > 0 ? Math.max(0, Math.min(100, cur.days / cur.need * 100)) : 0;
  const left = Math.max(0, Math.ceil(cur.need - cur.days));
  return `<section class="card strategy-current">
    <div class="card-head"><b>当前策略</b><small>${cur.paused ? '暂停中' : `还剩 ${left} 天`}</small></div>
    <div class="strategy-current-main"><b>${esc(n?.title || '进行中的策略')}</b><span>${Math.floor(cur.days)}/${cur.need} 天</span></div>
    <div class="progress big"><i style="width:${pct}%"></i></div>
    ${cur.paused ? `<p class="strategy-confirm">暂停：${esc(cur.paused)}。条件恢复后会自动接着做。</p>` : ''}
    ${n ? `<p class="strategy-current-fx"><b>完成后</b>：${esc(effectText(S, n))}</p>` : ''}
  </section>`;
}

function routeCard(S, opts) {
  const stance = S.route?.stance;
  const st = STANCE[stance];
  const left = E.routeChangeBlocked(S);
  const can = opts.filter(o => o.node.stance);
  return `<section class="card strategy-route-card">
    <div class="card-head"><b>开源路线</b><small>${esc(routeLabel(S.route))}</small></div>
    <div class="strategy-route-line">${STANCES.map((k, i) => `${i ? '<i>→</i>' : ''}<span class="strategy-route-step${k === stance ? ' is-on' : ''}">${esc(STANCE[k].label)}</span>`).join('')}</div>
    <p class="muted">旗舰：${st?.flagshipOpen ? `必须开放权重（${LICENSES[st.license] || '按路线'}）` : '不开放权重'} · 小模型：发布时自己选（默认${st?.smallDefault ? '开源' : '闭源'}）</p>
    <div class="strategy-route-nodes"><b>能改路线的策略</b>${can.map(o => `<span class="strategy-route-node">${esc(o.node.title)}（${statusOf(S, o).label}）</span>`).join('')}</div>
    <p class="muted">路线冷却：${left > 0 ? `还要等 ${left} 天` : '没有冷却'}</p>
  </section>`;
}

function spiritsCard(S) {
  const sp = S.strategy?.spirits || {};
  const chips = Object.keys(sp).map(id => {
    const d = E.spiritDef(S, id);
    return `<span class="chip strategy-spirit" title="${esc(d?.desc || '')}">${esc(d?.title || '公司特质')}${sp[id]?.until ? ' · 限时' : ''}</span>`;
  });
  return `<section class="card strategy-spirits"><div class="card-head"><b>公司特质</b><small>${chips.length} 个</small></div>
    <div class="strategy-spirit-row">${chips.length ? chips.join('') : '<span class="muted">还没有公司特质。</span>'}</div>
  </section>`;
}

export function render(S, st = {}) {
  const tree = E.resolvedTree(S);
  const opts = E.strategyOptions(S);
  if (!tree || !opts.length) return `<div class="strategy-page"><h2>公司策略</h2><p class="muted">这局还没有公司策略树。</p></div>`;
  return `<div class="strategy-page">
    <div class="strategy-head"><h2>公司策略</h2><p class="muted">同一时间只推进一项。换项时旧进度保留 ${SHELF_DAYS} 天；条件不成立会暂停，确定永远做不成才会作废。</p></div>
    ${st.strategyPending?'<p role="status">正在等待服务器确认策略操作…</p>':''}
    ${currentCard(S, opts)}
    ${desktopTree(S, tree, opts, st)}
    <details class="strategy-supplement"><summary>开源路线与公司特质</summary>${routeCard(S, opts)}${spiritsCard(S)}</details>
    <details class="strategy-list-mode" ${st.strategyListOpen ? 'open' : ''}><summary>切换阅读方式：分支列表</summary>${mobileTree(S, tree, opts, st)}</details>
  </div>`;
}

// 点击：手机节点原位展开 / 收起；开始、换项（两次确认）、搁置都走后台的 guard，出错只提示、不白屏。
const requests=new Set();
export function dispose(S){for(const request of requests)if(request.state===S)request.viewActive=false;}
function command(S,ctx,fn) {
  const {st={},draw,guard}=ctx;
  if(st.readOnly||st.strategyPending)return;
  if(!isRemote())return guard(()=>then(fn(),r=>{st.strategyConfirm=null;return r;}));
  const request={state:S,wasCurrent:getState()===S,viewActive:true,page:st.page,confirmation:st.strategyConfirm};
  st.strategyRequest=request;st.strategyPending=true;requests.add(request);
  const current=()=>st.strategyRequest===request&&(!request.wasCurrent||getState()===S);
  const visible=()=>current()&&request.viewActive&&st.page===request.page;
  const error=e=>{if(visible())toast(e?.message||String(e||'策略操作失败'));};
  let result;try{result=fn();}catch(e){error(e);if(current()){st.strategyPending=false;delete st.strategyRequest;}requests.delete(request);draw?.();return;}
  draw?.();
  return Promise.resolve(result).then(r=>{
    if(!current())return;
    if(st.strategyConfirm===request.confirmation)st.strategyConfirm=null;
    if(visible()&&r?.note)toast(r.note);
  }).catch(error).finally(()=>{
    const redraw=visible();requests.delete(request);
    if(current()){st.strategyPending=false;delete st.strategyRequest;}
    if(redraw)draw?.();
  });
}
export function click(S, t, ctx) {
  if(t.closest?.('[data-strategy-close]')){ctx.st.strategyReturnFocus=ctx.st.strategySel;ctx.st.strategySel=null;ctx.st.strategyConfirm=null;ctx.draw();return;}
  // Select a node without changing simulation state.
  const pick = t.closest?.('[data-strategy-pick]');
  if (pick) {
    ctx.st.strategySel = pick.dataset.strategyPick;
    if (ctx.st.strategyConfirm !== ctx.st.strategySel) ctx.st.strategyConfirm = null;
    ctx.draw();
    return;
  }
  const toggle = t.closest?.('[data-strategy-open]');
  if (toggle) {
    const id = toggle.dataset.strategyOpen;
    ctx.st.strategySel = null;
    ctx.st.strategyConfirm = null;
    ctx.st.strategyListOpen = true;
    ctx.st.strategyListFocus = id;
    const branch=E.strategyOptions(S).find(o=>o.id===id)?.node.branch;
    if(branch)(ctx.st.strategyBranches||={})[branch]=true;
    ctx.st.strategyOpen = ctx.st.strategyOpen === id ? null : id;
    ctx.draw();
    return;
  }
  const b = t.closest?.('[data-strategy-op]');
  if (!b || ctx.st.readOnly || ctx.st.strategyPending) return;
  const id = b.dataset.id;
  const op = b.dataset.strategyOp;
  if (id && !b.closest?.('[data-mobile-node]')) ctx.st.strategySel = id;
  const title = E.strategyOptions(S).find(x => x.id === id)?.node?.title || '这一项';
  if (op === 'shelve') {
    return command(S,ctx,() => then(act(S, 'cancelStrategy'), sh => {
      return { note: sh ? `已搁置「${title}」，已做的 ${Math.floor(sh.days)} 天保留 ${SHELF_DAYS} 天` : '现在没有进行中的策略' };
    }));
  }
  if (op !== 'start' && op !== 'switch') return;
  const cur = S.strategy?.cur;
  if (op === 'switch' && cur && ctx.st.strategyConfirm !== id) {
    ctx.st.strategyConfirm = id;
    ctx.draw();
    return;
  }
  return command(S,ctx,() => then(act(S, 'startStrategy', { id }), () => {
    return { note: `开始了「${title}」` };
  }));
}
