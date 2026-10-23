// 界面共用的状态和弹层。各界面模块从这里拿 getState、render、openLayer 这些，不从 app.js 导入：
// app.js 要导入它们，它们再导入 app.js 就成了循环，也没法在 Node 里单独加载某一页来测。
// render、scheduleTick、setSpeed 的做法在 app.js（屏幕切换和时钟），启动时用 bind() 登记进来。
// 自洽世界（M1d）另存一份 world：getState() 仍然是玩家那家公司的 s，现有页面一行都不用改。
import { store, SAVE_KEY, saveWorld, dropWorld, markWorldLeave, markLastKind } from './storage.js';

let S = null;
let W = null;
// 联机（M4）：net.js 进房间时放一个客户端状态进来（房间、座位、大厅、时钟、收件箱、聊天、公开视图）。
// 联机时 W 是公开视图拼的镜像世界（只读，不存档、不推进），S 是服务器推来的自家 s。
let MP = null;
// 当前屏幕、选中的剧本和公司、主界面的台词和月报卡、跳过的建议等。
const uiState = { scenario: 'y2023', pick: null, busy: false, emotion: 'neutral', lineIdx: 0, skip: new Set(), solo: null, worldError: null };
let screen = 'title';
// 退出自洽世界（回标题页、开史实局、读史实存档）一律整页重载：发布表、Provider 这些模块单例要回到史实状态。
// 在浏览器里先把世界存好再 reload；Node 测试里没有 location，就只切屏幕。
Object.defineProperty(uiState, 'screen', {
  enumerable: true,
  get: () => screen,
  set(v) {
    screen = v;
    if (v !== 'title' || typeof globalThis.location === 'undefined' || typeof globalThis.location.reload !== 'function') return;
    if (MP) { leaveMp(); return; }
    if (!W) return;
    leaveSolo();
  },
});
export const ui = uiState;
// 时间（像钢铁雄心：可以暂停、五档速度；弹窗、后台打开时自动停）。
export const clock = { speed: 0, last: 2, timer: null, busy: false, down: false };
const hooks = { render() {}, scheduleTick() {}, setSpeed() {} };
export function bind(h) { Object.assign(hooks, h); }

export const getState = () => S;
export const setState = v => { S = v; return S; };
export const getWorld = () => W;
export const setWorld = v => { W = v; return W; };
export const getMp = () => MP;
export const setMp = v => { MP = v; return MP; };

// 存档按种类分发：自洽世界走 world/save.js 的 storage()，史实局照旧写 localStorage 主档。
export const save = () => {
  // 联机的存档在服务器上（房主可以点“存档”），浏览器里不存。
  if (MP) return Promise.resolve({ ok: true, kind: 'mp' });
  if (W) {
    const p = saveWorld(W);
    p.then(r => { if (!r.ok) toast(r.reason); }).catch(e => toast(`自洽世界存档没有写成：${e?.message || e}`));
    return p;
  }
  if (S) { store(SAVE_KEY, S); markLastKind('history'); }
  return Promise.resolve({ ok: true, kind: 'history' });
};

// 离开自洽世界：留下“下一次启动回标题”的标记，存好（或放弃时删掉）世界存档，再整页重载。
let leaving = false;
function leaveSolo() {
  if (leaving) return;
  leaving = true;
  markWorldLeave();
  const abandoned = !S;
  const p = abandoned ? dropWorld() : saveWorld(W);
  Promise.resolve(p)
    .then(r => { if (r && r.ok === false) toast(r.reason); })
    .catch(e => toast(`离开自洽世界时存档失败：${e?.message || e}`))
    .finally(() => { globalThis.location.reload(); });
}

// 离开联机房间：断开、忘掉房间，整页重载（镜像装进去的发布表、公司登记、Provider 都要回到史实状态）。
function leaveMp() {
  try { MP.es?.close(); } catch { /* 已经断了 */ }
  try { globalThis.localStorage?.removeItem('mrp.mp.room'); } catch { /* 隐私模式 */ }
  globalThis.location.reload();
}

export const render = () => hooks.render();
export const scheduleTick = () => hooks.scheduleTick();
export const setSpeed = n => hooks.setSpeed(n);

// 页面上的两个固定容器在 index.html 里；用到时再取，模块加载时不碰页面。
const layer = () => document.getElementById('overlay-root');
export function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.getElementById('toast-root').append(el);
  setTimeout(() => el.classList.add('out'), 2400);
  setTimeout(() => el.remove(), 2800);
}
export function openLayer(html, cls = '') {
  const root = layer();
  root.innerHTML = `<div class="overlay ${cls}"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  return root.firstElementChild;
}
export const closeLayer = () => { layer().innerHTML = ''; scheduleTick(); };
export function waitFor(root, sel) {
  return new Promise(res => {
    root.addEventListener('click', function h(ev) {
      const b = ev.target.closest(sel);
      if (!b || b.disabled) return;
      root.removeEventListener('click', h);
      res(b);
    });
  });
}
