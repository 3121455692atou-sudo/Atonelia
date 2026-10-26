import { practiceKind } from './practice_context.js';
// 联机客户端（规格 M.6.5、M.7）：建房、加入、SSE、引擎命令和房间命令。
// 服务器推来的 init / day / cmd 合成自家 s（base 是服务器认的那份，S 是界面在用的那份）和公开视图（pub），喂给镜像（world/mirror.js）。
// 客户端不跑 tickDay：时间由服务器推；界面的写操作经 act.js 发过来（纯设定类先在本地跑一遍，服务器的差分回来再校正）。
import * as E from '../engine.js';
import { createCommandSequence, nextCommandSequence } from './sequence.js';
import { setRemote } from './act.js';
import { getMp, setMp, setState, setWorld, ui, render, toast, notifyRemoteState } from './state.js';

// 能在本地镜像上先跑一遍的命令：只改自家 s、不掷骰子、不碰世界。其余（下单、送评、开工、交易、处理卡片……）只发服务器。
const LOCAL_OK = new Set([
  'setInferShare', 'setLease', 'setTier', 'setSmallApi', 'setRouting', 'setPolicy',
  'cancelJob', 'pauseJob', 'setJobPrio', 'setJobCap', 'setPost', 'setRush', 'setRepair', 'setAutoRepair', 'setOwnOnly', 'setPlan', 'focusResearch',
  'cancelEval', 'researchTech', 'stopTech', 'startStrategy', 'cancelStrategy', 'releaseGpu', 'repay',
]);
const ROOM_KEY = 'mrp.mp.room';
const EVENTS = ['lobby', 'init', 'day', 'cmd', 'inbox', 'clock', 'chat', 'end'];
const clone = x => JSON.parse(JSON.stringify(x));

async function post(path, body) {
  if (practiceKind()) throw Error('练习中不连接联机房间');
  let res;
  try {
    res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
  } catch {
    throw new Error('连不上联机服务器：这个地址可能只放了单机版');
  }
  let json = null;
  try { json = await res.json(); } catch { /* 不是 JSON */ }
  if (!json) throw new Error(res.status === 404 || res.status === 405 ? '这个地址没有联机服务器（只放了单机版）' : `服务器回了 ${res.status}`);
  return json;
}

// ---------- 进房间 ----------
// 建房（房主拿座位 0）。settings 见规格 M.6.9：humans、bots、years、start、mode、keep、tier、bot、speedMax、pauses、rules。
export async function createRoom({ settings, password } = {}) {
  const r = await post('/api/rooms', { lobby: true, settings, ...(password ? { password } : {}) });
  if (!r.ok) throw new Error(r.err);
  return enter(r.room, r);
}
// 申请入座：开局前带 seat（可不带），开局后带 companyId（接管电脑公司）；都要房主批准。
export async function joinRoom(room, body = {}) {
  const code = String(room || '').trim().toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(code)) throw new Error('房间码是 6 位（0–9、a–f）');
  const r = await post(`/api/r/${code}/join`, body);
  if (!r.ok) throw new Error(r.err);
  return enter(code, r);
}
// 已经有座位（刷新了页面）：直接连 SSE，服务器按 cookie 认人。
export const lastRoom = () => { try { return globalThis.localStorage?.getItem(ROOM_KEY) || null; } catch { return null; } };
export function rejoin(room) { return enter(room, {}); }

function enter(room, info) {
  if (practiceKind()) throw Error('练习中不连接联机房间');
  const m = {
    room, member: info.member ?? null, seat: info.seat ?? null, pending: !!info.pending,
    lobby: null, clock: null, inbox: { cards: [], at: 0 }, chat: [], chatOpen: false, unread: 0,
    pub: null, base: null, S: null, provider: null, company: null, seats: [], end: null,
    seq: createCommandSequence(), es: null, online: false, form: null,
  };
  setMp(m);
  try { globalThis.localStorage?.setItem(ROOM_KEY, room); } catch { /* 隐私模式 */ }
  setRemote({ send, localOk: name => Number.isSafeInteger(m.seq) && m.seq >= 0 && m.seq < Number.MAX_SAFE_INTEGER && LOCAL_OK.has(name), fail: e => toast(e.message || String(e)) });
  connect(m);
  ui.mpAutomation=null;
  ui.screen = 'lobby';
  render();
  return m;
}
// 产品开关只在服务端确认且权威镜像到达后完成；网络结果未知不自动重发。
function settleProducts(m, type, data = {}) {
  for (const [seq, p] of m.productRequests || []) {
    if ((type === 'cmd' && data.seq === seq) || (type === 'init' && p.ack)) p.seen = true;
    if (type === 'init' && p.unknown) {
      m.productRequests.delete(seq);
      p.reject(new Error('产品开关请求结果曾不确定，已重新同步服务器状态，请确认当前开关'));
    } else if (p.ack && (p.seen || m.base?.products?.[p.id]?.on === p.on)) {
      m.productRequests.delete(seq); p.resolve(p.result);
    }
  }
}
function connect(m) {
  // EventSource 断了会自己重连，并带上 Last-Event-ID：差得少服务器补发，差得多重发 init（M.6.7）。
  const es = new EventSource(`/api/r/${m.room}/events?v=${E.PROTOCOL_V}`);
  m.es = es;
  es.addEventListener('open', () => { m.online = true; render(); });
  es.addEventListener('error', () => { m.online = false; render(); });
  for (const type of EVENTS) {
    es.addEventListener(type, ev => {
      try { onEvent(m, type, JSON.parse(ev.data)); } catch (e) { console.error(`联机事件 ${type} 处理出错`, e); }
    });
  }
}

// ---------- 收事件 ----------
export function onEvent(m, type, data) {
  if (getMp() !== m) return;
  if (['lobby', 'init'].includes(type) && data?.v !== E.PROTOCOL_V) {
    m.es?.close(); m.online = false;
    m.syncError = `联机版本不匹配，请刷新客户端并新建 v${E.PROTOCOL_V} 房间`;
    render();
    throw new Error(m.syncError);
  }
  if (type === 'day' || type === 'cmd') {
    try {
      // Validate the whole frame before mutating either public or private view.
      if (type === 'day') E.validateDiff(data.pub);
      E.validateDiff(data.me);
    } catch (error) {
      m.es?.close(); m.online = false;
      m.syncError = `联机同步已停止：${error.message}。请刷新客户端重新同步`;
      render(); throw error;
    }
  }
  if (type === 'lobby') {
    m.lobby = data;
    // self 仅在 cookie 鉴权后的本连接初始快照中提供；普通广播不覆盖身份。
    if (typeof data.self === 'string' && data.members?.some(x => x.member === data.self)) m.member = data.self;
    const me = data.members?.find(x => x.member === m.member);
    if (me) { m.pending = !me.approved; m.seat = me.seat; }
  } else if (type === 'init') {
    m.pub = data.pub;
    m.base = data.s;
    m.seat = data.seat;
    m.company = data.company;
    m.seats = data.seats || [];
    m.clock = data.clock;
    m.pending = false;
    m.S = clone(m.base);
    setState(m.S);
    m.provider = E.openMirror(m.pub, m.S);
    setWorld(m.provider.world);
    if (ui.screen === 'lobby' || ui.screen === 'title') ui.screen = 'home';
  } else if (type === 'day') {
    if (!m.pub) return;
    m.pub = E.applyDiff(m.pub, data.pub);
    m.base = E.applyDiff(m.base, data.me);
    resync(m);
    E.refreshMirror(m.provider, m.pub, m.S);
    setWorld(m.provider.world);
  } else if (type === 'cmd') {
    if (!m.base) return;
    m.base = E.applyDiff(m.base, data.me);
    resync(m);
  } else if (type === 'inbox') {
    m.inbox = { ...data, at: Date.now() };
  } else if (type === 'clock') {
    m.clock = data;
  } else if (type === 'chat') {
    m.chat.push(data);
    if (m.chat.length > 200) m.chat.splice(0, m.chat.length - 200);
    if (!m.chatOpen && data.member !== m.member) m.unread += 1;
  } else if (type === 'end') {
    m.end = data;
    ui.screen = 'replay';
  }
  settleProducts(m, type, data);
  render();
  if (['init', 'day', 'cmd'].includes(type)) notifyRemoteState(type);
}
// 界面在用的 S 换回服务器认的那份（保持同一个对象：镜像世界、页面都拿着它）。
function resync(m) {
  if (!m.S || !m.base) return;
  const fresh = clone(m.base);
  for (const k of Object.keys(m.S)) if (!(k in fresh)) delete m.S[k];
  Object.assign(m.S, fresh);
}

// ---------- 发命令 ----------
// 每次进房生成独立高熵起点；SSE重连沿用原连接及递增序列。
// 同一请求若核验/重试，必须保留原seq；不得把未知结果自动当成新操作重发。
async function send(name, args = {}) {
  const m = getMp();
  if (!m) throw new Error('没有连上房间');
  if (name === 'setProduct') return sendProduct(m, args);
  const r = await post(`/api/r/${m.room}/cmd`, { v: E.PROTOCOL_V, seq: nextCommandSequence(m), name, args });
  if (!r.ok) {
    resync(m);
    render();
    throw new Error(r.err || '服务器没接受这条命令');
  }
  return r.result ?? null;
}
function sendProduct(m, args) {
  m.productRequests ??= new Map();
  if ([...m.productRequests.values()].some(p => p.id === args.id)) return Promise.reject(new Error('正在等待此产品的服务器确认'));
  const seq = nextCommandSequence(m);
  return new Promise((resolve, reject) => {
    const p = { id: args.id, on: !!args.patch?.on, ack: false, seen: false, unknown: false, resolve, reject };
    m.productRequests.set(seq, p);
    post(`/api/r/${m.room}/cmd`, { v: E.PROTOCOL_V, seq, name: 'setProduct', args }).then(r => {
      if (getMp() !== m) { m.productRequests.delete(seq); reject(new Error('已离开原房间，产品请求不再更新当前界面')); return; }
      if (!r.ok) {
        m.productRequests.delete(seq); resync(m); notifyRemoteState('product');
        reject(new Error(r.err || '服务器没接受这条命令')); return;
      }
      p.ack = true; p.result = r.result ?? null; settleProducts(m, 'ack'); notifyRemoteState('product');
    }).catch(() => {
      if (getMp() !== m) { m.productRequests.delete(seq); reject(new Error('已离开原房间')); return; }
      p.unknown = true;
      toast('产品开关结果尚不确定，正在重新连接并同步服务器；不会自动重发');
      notifyRemoteState('product');
      m.es?.close(); connect(m);
    });
  });
}
// 房间命令不进引擎；时间仅房主能改，客户端拦住误触，最终权限仍由服务器校验。
export async function roomCmd(name, args = {}) {
  const m = getMp();
  if (!m) throw new Error('没有连上房间');
  if (name === 'vote') throw new Error('不再使用速度投票，请房主调整');
  if (['pause', 'resume', 'speed'].includes(name) && !isHost(m)) throw new Error('只有房主可以暂停、继续或调整速度');
  const r = await post(`/api/r/${m.room}/room`, { name, args });
  if (!r.ok) throw new Error(r.err || '服务器没接受');
  return r;
}

// ---------- 读口（界面用） ----------
export const isHost = m => typeof m?.member === 'string' && !!m.member && m.lobby?.host === m.member;
export const myMember = m => m?.lobby?.members?.find(x => x.member === m.member) ?? null;
// 收件箱里某张卡还剩多久：游戏日和现实秒取较长的那个（M.6.4）；现实秒按收到时刻往下减。
export function cardLeft(m, card) {
  const wall = Math.max(0, (card.wallMsLeft ?? 0) - (Date.now() - (m.inbox.at || Date.now())));
  return { days: card.gameDaysLeft ?? 0, secs: Math.ceil(wall / 1000) };
}
