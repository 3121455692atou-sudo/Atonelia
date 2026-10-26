import {renderWithImageReuse,releaseImages} from './image_reuse.js';
import {patchPostPlanOffice} from './post_plan_render.js';
import * as automation from './pages/automation.js';
// 后台菜单（外壳）：左边是页面导航，右边是当前页。各页的内容和交互在 pages/ 里，这些操作都不占用当月行动。
// 每个页面模块导出 render(S, st)，按需导出 click(S, t, ctx)、change(S, t, ctx)；ctx 里有 st、draw、guard。
// PAGES 由 P0.3a 一次登记全（规格 F0），各界面包只填自己的页面文件；页面导出 hidden = true 时导航里先不显示（还没做好的存根）。
import { fmtDate } from '../data/core.js';
import { esc, icon } from './fmt.js';
import { getState, getWorld, getMp, onRemoteState, save, render, toast, openLayer, closeLayer, clock } from './state.js';
import { onEnterGame } from './flow.js';
import * as train from './pages/train.js';
import * as model from './pages/model.js';
import * as boards from './pages/boards.js';
import * as service from './pages/service.js';
import * as compute from './pages/compute.js';
import * as data from './pages/data.js';
import * as tech from './pages/tech.js';
import * as finance from './pages/finance.js';
import * as capital from './pages/capital.js';
import * as market from './pages/market.js';
import * as exchange from './pages/exchange.js';
import * as rivals from './pages/rivals.js';
import * as news from './pages/news.js';
import * as legal from './pages/legal.js';
import * as board from './pages/board.js';
import * as archive from './pages/archive.js';
import * as settings from './pages/settings.js';
import * as strategyPage from './pages/strategy.js';
import * as historyPage from './pages/history.js';

// 后台导航按规格 A11 分四组。组的先后、组内条目的顺序都照 A11；“模型”组第一项是训练（P2.4b），
// 公司策略放在“公司”组第一项。训练、模型这些页面的登记没有变，只是换成了分组渲染。
export const NAV_GROUPS = [
  ['公司', ['strategy', 'goals', 'history', 'capital', 'finance', 'legal']],
  ['模型', ['train', 'model', 'data', 'tech', 'boards']],
  ['市场', ['service', 'compute', 'rivals', 'market', 'exchange', 'news']],
  ['其他', ['automation', 'archive', 'settings']],
];
const PAGE_LABEL = {
  automation: '托管',
  strategy: '公司策略', goals: '董事会目标', history: '公司历程', capital: '资本', finance: '财务', legal: '法务',
  train: '训练', model: '模型', data: '数据', tech: '研究', boards: '榜单',
  service: '服务', compute: '算力', rivals: '对手', market: '股市', exchange: '交易所', news: '新闻', archive: '图鉴', settings: '设置',
};
// 导航图标：只是视觉提示，页面登记和顺序不变。
const PAGE_ICON = {
  automation: 'auto', strategy: 'flag', goals: 'target', history: 'research', capital: 'trend', finance: 'cash', legal: 'scale',
  train: 'train', model: 'layers', data: 'data', tech: 'spark', boards: 'eval',
  service: 'users', compute: 'chip', rivals: 'sword', market: 'globe', exchange: 'globe', news: 'news', archive: 'image', settings: 'sliders',
};
export const PAGES = NAV_GROUPS.flatMap(([, ids]) => ids.map(id => [id, PAGE_LABEL[id]]));
// 史实股市页只在史实模式；自洽和联机换成交易所页（M.7）。只影响导航，史实模式下什么都不变。
export const pageVisible = id => !PAGE[id].hidden && !(id === 'market' && !!getWorld()) && !(id === 'exchange' && !getWorld());
export const PAGE = { automation, strategy: strategyPage, train, model, boards, service, compute, data, tech, finance, capital, market, exchange, rivals, news, legal, goals: board, history: historyPage, archive, settings };
// 后台自己的状态：当前页、榜单页的选择、立项和蒸馏的草稿、股市页选中的股票；
// readOnly：结算页“回看后台”是只读的；lastOk：上一次画成功的页（出错卡的“返回”回到那里）；importing：设置页里等玩家确认的导入。
// 训练页（P2.4b）：newJob 展开的是哪张新作业表单；small、post、trial、ft、plan 是各表单的草稿，opt 是各表单的优先级和“最多 N 张”；
// jobMenu 展开了哪一项作业的 ⋯ 菜单；modelOpen 展开了哪个模型的详情；submit 在原位展开了哪个模型的送评；planEdit 下一代计划在不在改。
const freshSt = () => ({ page: 'model', bench: null, cls: '', board: 'bench', proj: null, distill: null, ticker: 'NVDA', readOnly: false, lastOk: null, importing: null,
  newJob: null, small: null, post: null, trial: null, ft: null, plan: null, opt: {}, jobMenu: null, modelOpen: null, submit: null, planEdit: false,
  strategyOpen: null, strategyConfirm: null, strategySel: null, exOpen: null, exSide: 'buy', exAmt: null, exOwn: null });
const st = freshSt();
let root = null;
let mountedPage = null, mountedState = null;
let stopRemote = null;
// 窗口尺寸变化时让当前页重算自己的像素布局（策略页的连线要用）。监听只挂一次；后台关掉（overlay 被清空）时摘掉，
// 下次打开再挂。浏览器没有 ResizeObserver 时只靠 window 的 resize，安静跳过。
let resizeBound = false, resizeObserver = null, resizeWatch = null;
function afterDraw(el, S) {
  const page = PAGE[st.page];
  if (typeof page?.after !== 'function') return;
  try { page.after(el, S, st, { draw }); } catch (err) { console.error(`后台「${PAGE_LABEL[st.page] || st.page}」画完之后出错`, err); }
}
function relayout() {
  if (!root?.isConnected) { stopWatch(); return; }
  afterDraw(root.querySelector('.office'), getState());
}
function startWatch() {
  if (getMp() && !stopRemote) stopRemote = onRemoteState(() => {
    if (!root?.isConnected) { stopWatch(); return; }
    if (st.page === 'automation') automation.sync(getState(), root, st);
    if (st.page === 'train') train.sync(getState(), root, st);
    if (st.page === 'service') service.sync(getState(), root);
  });
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function' && !resizeBound) {
    resizeBound = true;
    window.addEventListener('resize', relayout);
  }
  const el = root?.querySelector('.office');
  if (typeof ResizeObserver === 'function') {
    resizeObserver ??= new ResizeObserver(relayout);
    resizeObserver.disconnect();
    if (el) resizeObserver.observe(el);
  }
  if (typeof MutationObserver === 'function' && !resizeWatch && root?.parentNode) {
    resizeWatch = new MutationObserver(() => { if (!root?.isConnected) stopWatch(); });
    resizeWatch.observe(root.parentNode, { childList: true });
  }
}
function stopWatch() {
  releaseImages(root);
  PAGE[mountedPage]?.dispose?.(mountedState);
  mountedPage = null; mountedState = null;
  stopRemote?.(); stopRemote = null;
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
  if (resizeWatch) { resizeWatch.disconnect(); resizeWatch = null; }
  if (resizeBound && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') { window.removeEventListener('resize', relayout); resizeBound = false; }
}
// 换了一局（新开局、读档、导入）：后台的状态全部回到初始，上一局的立项和蒸馏草稿不能带到下一局
// （换了模态，草稿里的规模、架构在新一局里根本不存在）。st 是各页共用的同一个对象，原地清空。
export function resetOffice() {
  stopWatch();
  for (const k of Object.keys(st)) delete st[k];
  Object.assign(st, freshSt());
  root = null;
}
onEnterGame(resetOffice);

// preset：“下一步”按钮带过来的推荐配置（立项、蒸馏），玩家确认后再立项（训练页上对应的新作业表单直接展开）；preset.readOnly：只读（结算页回看）。
export function openOffice(page, preset = {}) {
  if (page) st.page = page;
  st.trainingEntry=preset.trainingKind==='post';
  if(preset.trainingKind==='pretrain')st.newJob='pretrain';
  if(preset.trainingKind==='overview')st.newJob=null;
  if (preset.proj) { st.proj = preset.proj; st.newJob = 'pretrain'; }
  if (preset.distill) { st.distill = preset.distill; st.newJob = 'distill'; }
  if (preset.post) { st.newJob = 'post'; st.post = { target: preset.post, dir: 'auto', until: preset.post === 'main' ? 'none' : 'd30' }; }
  if (page === 'train') {
    st.postPlanSessionId = preset.postPlanSessionId ?? null;
    st.postPlanInfo = false; st.postPlanError = null; st.postPlanEvent = null; st.postPlanSelected = null;
    if (preset.postPlanSessionId) { st.newJob = null; st.post = null; }
    st.postPlanAutoEnter = !preset.postPlanSessionId && !preset.proj && !preset.distill && !preset.post && !preset.trainingKind;
  }
  st.readOnly = !!preset.readOnly;
  st.importing = null;
  stopWatch();
  root = openLayer('<div class="office"></div>', 'overlay--office');
  draw();
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
}
// 一页画不出来（数据异常、页面代码出错）不能让整个后台白屏：这一页换成错误卡，导航还在，可以去别的页或者返回。
function drawPage(S) {
  const label = PAGES.find(([id]) => id === st.page)?.[1] || st.page;
  try {
    const html = PAGE[st.page].render(S, st);
    st.lastOk = st.page;
    return html;
  } catch (err) {
    console.error(`后台「${label}」画不出来`, err);
    return `<h2>${esc(label)}</h2><div class="card"><b>这一页没能显示出来</b><p class="muted">${esc(err?.message || String(err))}</p>
      <p class="muted">游戏本身没有受影响，可以点「返回」，或者去别的页。想留个底的话，在「设置」里先导出存档。</p>
      <div class="menu-actions"><button class="btn btn--primary" data-back>返回</button></div></div>`;
  }
}
// Restore same-page scrolling before page.after measures anchored details.
// Both containers matter on short landscape screens; navigation resets both.
export function retainOfficeScroll(layer, samePage) {
  const positions=['.office-body','.sheet'].map(selector=>{
    const el=layer?.querySelector?.(selector);
    return {selector,left:samePage?(el?.scrollLeft||0):0,top:samePage?(el?.scrollTop||0):0};
  });
  return ()=>{for(const p of positions){const el=layer?.querySelector?.(p.selector);if(el){el.scrollLeft=p.left;el.scrollTop=p.top;}}};
}
function draw() {
  const S = getState();
  if (!root?.isConnected || !S) return;
  const restoreScroll=retainOfficeScroll(root,mountedPage===st.page&&mountedState===S);
  if (mountedPage !== st.page || mountedState !== S) PAGE[mountedPage]?.dispose?.(mountedState);
  mountedPage = st.page; mountedState = S;
  const el = root.querySelector('.office');
  const html = `
    <aside class="office-nav">
      <div class="office-title"><b>后台</b><small>${fmtDate(S.date)} · ${st.readOnly ? '这一局已经结束，只能看' : getMp() ? '联机时间由房主控制，后台不暂停' : '打开后台时时间暂停'}</small></div>
      <nav>${NAV_GROUPS.map(([group, ids]) => `<div class="office-nav-group"><b>${group}</b>${ids.filter(pageVisible).map(id => `<button class="${id === st.page ? 'is-on' : ''}" data-page="${id}">${icon(PAGE_ICON[id] || 'menu')}<span>${PAGE_LABEL[id]}</span></button>`).join('')}</div>`).join('')}</nav>
      <button class="btn office-close" data-close aria-label="回到主界面">${icon('back')}<span>回到主界面</span></button>
    </aside>
    <section class="office-body">${drawPage(S)}</section>`;
  if (!patchPostPlanOffice(el,html,S)) renderWithImageReuse(el,html);
  markLongNotes(el);
  restoreScroll();
  afterDraw(el, S);
  startWatch();
}
function refresh() { save(); draw(); render(); }
// 换页进场动效：只在真的换了页时给正文加一次 is-entering，动画放完就摘掉；普通重画不加。
let enterTimer = null;
function enterPage() {
  const body = root?.querySelector?.('.office-body');
  if (!body?.classList) return;
  clearTimeout(enterTimer); body.classList.remove('is-entering'); void body.offsetWidth; body.classList.add('is-entering');
  body.scrollTop = 0;
  enterTimer = setTimeout(() => body.classList.remove('is-entering'), 520);
}
// 说明段落（p.muted）先只露两行：画完后量一下，放不下的才标 is-clamped，点击切换展开。纯显示，不碰游戏状态。
const NOTE_LINES = 2;
function markLongNotes(el) {
  const body = el?.querySelector?.('.office-body');
  if (!body || typeof getComputedStyle !== 'function') return;
  for (const p of body.querySelectorAll('p.muted')) {
    if (p.closest('button, a, label, summary, [data-act], .post-plan')) continue;
    const lh = parseFloat(getComputedStyle(p).lineHeight) || 20;
    if (p.scrollHeight > lh * NOTE_LINES + 4) { p.classList.add('is-clamped'); p.title = '点击展开 / 收起'; }
  }
}
function toggleNote(t) {
  const p = t.closest?.('p.muted.is-clamped');
  if (!p || t.closest('a, button, input, select, label')) return false;
  p.classList.toggle('is-open');
  return true;
}

// ---------- 交互 ----------
// 只读时一切改动都不做（也不存档）：提示一声，把被拨动的控件还原。
function guard(fn) {
  if (st.readOnly) { toast('这一局已经结束了，后台只能看，不能改'); draw(); return; }
  if (st.page === 'train' && st.trainPending) { toast('正在等待服务器确认，请稍候'); return; }
  try {
    const r = fn();
    if (st.page === 'service' && r?.then) {
      // 产品请求自行按权威状态同步控件；不要重画其他尚未提交的设置。
      return r.then(result => { if (result?.note) toast(result.note); }).catch(e => toast(e.message));
    }
    if (st.page === 'train' && r?.then) {
      st.trainPending = true;
      const pendingForm=root?.querySelector('.newjob-form'); if(pendingForm) pendingForm.inert=true;
      return r.then(result => { if(result?.note) toast(result.note); })
        .catch(e => toast(e.message)).finally(() => { st.trainPending=false; if(pendingForm?.isConnected) pendingForm.inert=false; if(root?.isConnected) refresh(); });
    }
    if (r?.note) toast(r.note); refresh();
  } catch (e) { toast(e.message); }
}
const ctx = { st, draw: () => { if (st.page !== 'automation' || !automation.sync(getState(), root, st)) draw(); }, guard };
function onClick(ev) {
  if (clock.busy) return;
  const t = ev.target;
  if (t.closest('[data-close]')) { stopWatch(); closeLayer(); render(); return; }
  if (toggleNote(t)) return;
  const page = t.closest('[data-page]');
  if (page) { const changed = st.page !== page.dataset.page; st.page = page.dataset.page; draw(); if (changed) enterPage(); return; }
  if (t.closest('[data-back]')) {
    if (st.lastOk && st.lastOk !== st.page) { st.page = st.lastOk; draw(); } else { stopWatch(); closeLayer(); render(); }
    return;
  }
  PAGE[st.page].click?.(getState(), t, ctx);
}
function onChange(ev) {
  if (clock.busy) return;
  PAGE[st.page].change?.(getState(), ev.target, ctx);
}
