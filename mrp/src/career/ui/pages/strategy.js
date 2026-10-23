// 后台 · 公司策略（规格 A11）：当前策略、开源路线、公司特质、整棵策略树。
// 桌面（≥860px）照钢铁雄心的国策树：深色底图上按节点的 pos 摆紧凑节点（圆形图标 + 两行标题 + 天数），
// SVG 画前置（实线）和互斥（红色虚线）；点一个节点，右侧固定的详情栏写状态、条件、完成效果和开始 / 换项 / 搁置按钮。
// 手机（<860px）把同一棵树按分支摊成纵向列表，每行带图标，点一行在原位展开详情，不弹窗、不横向平移。
// 所有可见文字都是白话，不出现节点 id、效果键和年份。图标见 data/strategy_icons.js，没有图标的节点显示首字。
import * as E from '../../engine.js';
import { STANCES, STANCE, LICENSES, routeLabel } from '../../data/routes.js';
import { SHELF_DAYS } from '../../data/balance.js';
import { STRATEGY_ICONS, strategyIconSrc } from '../../data/strategy_icons.js';
import { esc } from '../fmt.js';
import { act, after as then } from '../act.js';

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

function detailHtml(S, o) {
  const n = o.node;
  const up = n.upfront ? `<p class="strategy-upfront"><b>开始时</b>：${esc(E.describeEffects(n.upfront, S) || '不扣东西')}</p>` : '';
  return `<p class="strategy-desc">${esc(n.desc || '')}</p>
    <div class="strategy-sub"><b>开始条件</b><ul class="strategy-conds">${condList(o)}</ul></div>
    ${up}
    <p class="strategy-effects"><b>完成效果</b>：${esc(effectText(S, n))}</p>
    ${actionsHtml(S, o)}`;
}

// 按钮：进行中只给“先搁置”；可开始的给“开始 / 换成这项”，换项第一次点只进确认态，第二次才真换。
function actionsHtml(S, o) {
  const n = o.node;
  const cur = S.strategy?.cur;
  if (n.auto) return `<p class="strategy-auto">这一项条件达成后自动完成，不占策略槽。</p>`;
  if (cur?.id === n.id) return `<div class="strategy-acts"><button class="btn btn--sm" data-strategy-op="shelve" data-id="${esc(n.id)}">先搁置（进度保留 ${SHELF_DAYS} 天）</button></div>`;
  if (o.state !== 'available') return '';
  const resume = o.shelvedDays > 0 && o.days > 0 ? `接着做（已做 ${Math.floor(o.days)} 天，还能保留 ${o.shelvedDays} 天）` : '';
  const label = cur ? (resume ? `换成这项（接着做 ${Math.floor(o.days)} 天）` : '换成这项') : (resume || '开始这项策略');
  return `<div class="strategy-acts"><button class="btn btn--sm btn--primary" data-strategy-op="${cur ? 'switch' : 'start'}" data-id="${esc(n.id)}">${esc(label)}</button></div>`;
}

// 换项的二次确认提示（渲染时根据后台状态里的 strategyConfirm 显示）。
function confirmHtml(S, o, st) {
  const cur = S.strategy?.cur;
  if (!cur || cur.id === o.node.id || st.strategyConfirm !== o.node.id) return '';
  const old = E.strategyOptions(S).find(x => x.id === cur.id)?.node;
  const oldDays = Math.floor(cur.days);
  return `<p class="strategy-confirm" role="status">再点一次“换成这项”就换过去。「${esc(old?.title || '现在这一项')}」已经做了 ${oldDays} 天，这 ${oldDays} 天会保留 ${SHELF_DAYS} 天；${SHELF_DAYS} 天内换回来还能接着做。</p>`;
}

// 桌面网格：pos 是设计时的 [列, 行]，同一格被两个分支占住时往下挪一行，保证每张卡都有位置。
// 连线不再按行列格数估算：卡片插入页面以后，layoutLinks 读每张卡的实际像素位置重画，行高随内容变也不会错位。
function layoutNodes(opts) {
  const used = new Map();
  let maxX = 0, maxY = 0;
  const cells = new Map();
  const sorted = opts.map((o, i) => ({ o, i })).sort((a, b) => {
    const ay = a.o.node.pos?.[1] ?? 0, by = b.o.node.pos?.[1] ?? 0;
    const ax = a.o.node.pos?.[0] ?? 0, bx = b.o.node.pos?.[0] ?? 0;
    return ay - by || ax - bx || a.i - b.i;
  });
  for (const { o } of sorted) {
    let x = Math.max(0, Math.floor(o.node.pos?.[0] ?? 0));
    let y = Math.max(0, Math.floor(o.node.pos?.[1] ?? 0));
    while (used.has(`${x},${y}`)) y += 1;
    used.set(`${x},${y}`, o.node.id);
    cells.set(o.node.id, { x, y });
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { cells, cols: maxX + 1, rows: maxY + 1 };
}

function linksSvg(opts, layout) {
  const paths = [];
  const seen = new Set();
  const add = (a, b, cls = 'strategy-link') => {
    if (!a || !b || a === b) return;
    // 互斥是双向的（两个节点的 excludes 里通常互相写着），一对只画一条。
    const key = cls === 'strategy-link' ? `${cls}|${a}|${b}` : `${cls}|${[a, b].sort().join('|')}`;
    if (seen.has(key)) return;
    seen.add(key);
    const p = layout.cells.get(a), c = layout.cells.get(b);
    if (!p || !c) return;
    paths.push(`<path class="${cls}" data-from="${esc(a)}" data-to="${esc(b)}" d="" />`);
  };
  for (const o of opts) {
    for (const g of o.node.prereq || []) for (const id of g) add(id, o.node.id);
    for (const id of o.node.excludes || []) add(o.node.id, id, 'strategy-link strategy-link--excl');
  }
  return `<svg class="strategy-links" viewBox="0 0 ${layout.cols} ${layout.rows}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${paths.join('')}</svg>`;
}

const round = n => Math.round(n * 10) / 10;
const rectOk = r => r && ['x', 'y', 'w', 'h'].every(k => Number.isFinite(r[k]));

// 一条前置 / 互斥连线的 d。fromRect、toRect 是两张卡相对网格左上角的像素位置 { x, y, w, h }。
// 同一行：从父卡朝向子卡的那一侧、靠上的位置横过去，落到子卡顶部中点；
// 不同行：从父卡底部中点竖下来，在两行之间的空隙里拐弯，落到子卡顶部中点。子卡排在父卡上面时（互斥线、往回指的前置）
// 两头对调，一律从上面那张的底部连到下面那张的顶部，线不会穿过卡片（线没有箭头，方向不影响意思）。
// 纯函数，画完页面以后 layoutLinks 拿实际位置调用它。
export function linkPath(fromRect, toRect) {
  if (!rectOk(fromRect) || !rectOk(toRect)) return '';
  const [f, t] = toRect.y < fromRect.y - 1 ? [toRect, fromRect] : [fromRect, toRect];
  const tx = t.x + t.w / 2;
  // 同一行：卡片顶边一样（行高自适应以后，同一行的卡由 grid 拉到一样高）。
  if (Math.abs(f.y - t.y) < 1) {
    const childRight = t.x + t.w / 2 >= f.x + f.w / 2;
    const sx = childRight ? f.x + f.w : f.x;
    const sy = f.y + Math.min(18, f.h * 0.25);
    return `M ${round(sx)} ${round(sy)} L ${round(tx)} ${round(sy)} L ${round(tx)} ${round(t.y)}`;
  }
  const sx = f.x + f.w / 2;
  const sy = f.y + f.h;
  const ey = t.y;
  const my = (sy + ey) / 2;
  return `M ${round(sx)} ${round(sy)} L ${round(sx)} ${round(my)} L ${round(tx)} ${round(my)} L ${round(tx)} ${round(ey)}`;
}

// 页面插进 DOM 以后调用：SVG 的 viewBox 改成网格的实际像素宽高，逐条按卡片的 offset* 重写 d。
// 只在桌面网格存在时做事；手机视图没有连线。
export function layoutLinks(gridEl) {
  if (!gridEl || typeof gridEl.querySelector !== 'function') return;
  const svg = gridEl.querySelector('.strategy-links');
  if (!svg) return;
  const w = gridEl.offsetWidth || gridEl.clientWidth || 0;
  const h = gridEl.offsetHeight || gridEl.clientHeight || 0;
  if (w <= 0 || h <= 0) return;
  svg.setAttribute('viewBox', `0 0 ${round(w)} ${round(h)}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const rects = new Map();
  for (const card of gridEl.querySelectorAll('[data-strategy-node]')) {
    const id = card.dataset?.strategyNode;
    if (!id) continue;
    rects.set(id, { x: card.offsetLeft, y: card.offsetTop, w: card.offsetWidth, h: card.offsetHeight });
  }
  for (const path of svg.querySelectorAll('path[data-from][data-to]')) {
    const from = rects.get(path.dataset.from), to = rects.get(path.dataset.to);
    if (!from || !to) continue;
    path.setAttribute('d', linkPath(from, to));
  }
}

// 后台画完这一页以后的钩子（office.js 在 el.innerHTML 之后调用）：重算连线。
export function after(el) {
  layoutLinks(el?.querySelector?.('.strategy-grid'));
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

// 树上的紧凑节点：图标、标题、一行小字（天数或进度）。点它在右侧详情栏里看全部。
function nodeCard(S, o, tree, layout, sel) {
  const n = o.node;
  const s = statusOf(S, o);
  const cell = layout.cells.get(n.id) || { x: 0, y: 0 };
  const sub = s.key === 'active' ? s.note : s.key === 'done' || s.key === 'bypassed' ? '已完成' : `${n.days} 天`;
  return `<button type="button" class="strategy-node ${s.tone}${sel ? ' is-sel' : ''}" data-strategy-node="${esc(n.id)}" data-strategy-pick="${esc(n.id)}" data-state="${s.key}" aria-pressed="${sel}"
    title="${esc(`${n.title}：${n.desc || ''}`)}" style="grid-column:${cell.x + 1};grid-row:${cell.y + 1};--branch:${branchColor(tree, n.branch)}">
    ${iconHtml(n, s, { pct: curPct(S, n) })}
    <b class="strategy-title">${esc(n.title)}</b>
    <small class="strategy-node-sub">${esc(sub)}</small>
  </button>`;
}

// 详情栏默认选谁：玩家点过的；否则进行中的；否则第一项可开始的；否则第一项。
function selectedOf(S, opts, st) {
  return opts.find(o => o.node.id === st.strategySel)
    || opts.find(o => o.node.id === S.strategy?.cur?.id)
    || opts.find(o => o.state === 'available' && !o.node.auto)
    || opts[0];
}
function detailPanel(S, o, tree, st) {
  const n = o.node;
  const s = statusOf(S, o);
  return `<aside class="strategy-detail" data-strategy-detail-panel="${esc(n.id)}" aria-live="polite">
    <div class="strategy-detail-head" style="--branch:${branchColor(tree, n.branch)}">
      ${iconHtml(n, s, { cls: 'sg-icon--big', pct: curPct(S, n) })}
      <div><span class="strategy-branch-tag">${esc(tree.branches?.[n.branch] || '其他')}</span><b class="strategy-detail-title">${esc(n.title)}</b>
        <div class="strategy-state-line"><span class="strategy-state strategy-state--${s.tone}">${s.label}</span><span class="strategy-days">${n.days} 天</span>${s.note ? `<small>${esc(s.note)}</small>` : ''}</div></div>
    </div>
    ${detailHtml(S, o)}
    ${confirmHtml(S, o, st)}
  </aside>`;
}

function desktopTree(S, tree, opts, st) {
  const layout = layoutNodes(opts);
  const branches = [...new Set(opts.map(o => o.node.branch))];
  const sel = selectedOf(S, opts, st);
  return `<section class="card strategy-tree-card">
    <div class="card-head"><b>策略树</b><small>${esc(TREE_LABEL(tree))} · 一共 ${opts.length} 项 · 点一项看详情</small></div>
    <div class="strategy-legend">${branches.map(k => `<span><i style="background:${branchColor(tree, k)}"></i>${esc(tree.branches?.[k] || '其他')}</span>`).join('')}</div>
    <div class="strategy-tree-body">
      <div class="strategy-map-wrap"><div class="strategy-grid" style="--cols:${layout.cols};--rows:${layout.rows}">
        ${linksSvg(opts, layout)}
        ${opts.map(o => nodeCard(S, o, tree, layout, o === sel)).join('')}
      </div></div>
      ${sel ? detailPanel(S, sel, tree, st) : ''}
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
    ${open ? `<div class="strategy-m-detail" data-strategy-detail="${esc(n.id)}">${s.note ? `<p class="strategy-state-note">${esc(s.note)}</p>` : ''}${detailHtml(S, o)}${confirmHtml(S, o, st)}</div>` : ''}
  </div>`;
}

function mobileTree(S, tree, opts, st) {
  const keys = [...new Set(opts.map(o => o.node.branch))];
  const order = [...Object.keys(tree.branches || {}).filter(k => keys.includes(k)), ...keys.filter(k => !(k in (tree.branches || {})))];
  return `<section class="strategy-mobile" aria-label="策略树（手机）">
    ${order.map(key => {
      const list = opts.filter(o => o.node.branch === key);
      const done = list.filter(o => DONE.has(o.state)).length;
      const open = list.some(o => ['available', 'active', 'paused'].includes(o.state) || o.shelvedDays > 0);
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
    ${currentCard(S, opts)}
    ${routeCard(S, opts)}
    ${spiritsCard(S)}
    ${desktopTree(S, tree, opts, st)}
    ${mobileTree(S, tree, opts, st)}
  </div>`;
}

// 点击：手机节点原位展开 / 收起；开始、换项（两次确认）、搁置都走后台的 guard，出错只提示、不白屏。
export function click(S, t, ctx) {
  // 桌面：点树上的节点，右侧详情栏换成它（换项的确认态跟着清掉）。
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
    ctx.st.strategyOpen = ctx.st.strategyOpen === id ? null : id;
    ctx.draw();
    return;
  }
  const b = t.closest?.('[data-strategy-op]');
  if (!b) return;
  const id = b.dataset.id;
  const op = b.dataset.strategyOp;
  if (id) ctx.st.strategySel = id;
  const title = E.strategyOptions(S).find(x => x.id === id)?.node?.title || '这一项';
  if (op === 'shelve') {
    ctx.guard(() => then(act(S, 'cancelStrategy'), sh => {
      ctx.st.strategyConfirm = null;
      return { note: sh ? `已搁置「${title}」，已做的 ${Math.floor(sh.days)} 天保留 ${SHELF_DAYS} 天` : '现在没有进行中的策略' };
    }));
    return;
  }
  if (op !== 'start' && op !== 'switch') return;
  const cur = S.strategy?.cur;
  if (op === 'switch' && cur && ctx.st.strategyConfirm !== id) {
    ctx.st.strategyConfirm = id;
    ctx.draw();
    return;
  }
  ctx.guard(() => then(act(S, 'startStrategy', { id }), () => {
    ctx.st.strategyConfirm = null;
    return { note: `开始了「${title}」` };
  }));
}
