// 联机客户端（规格 M.6.5、M.7）：建房、加入、SSE、引擎命令和房间命令。
// 服务器推来的 init / day / cmd 合成自家 s（base 是服务器认的那份，S 是界面在用的那份）和公开视图（pub），喂给镜像（world/mirror.js）。
// 客户端不跑 tickDay：时间由服务器推；界面的写操作经 act.js 发过来（纯设定类先在本地跑一遍，服务器的差分回来再校正）。
import * as E from '../engine.js';
import { setRemote } from './act.js';
import { getMp, setMp, setState, setWorld, ui, render, toast } from './state.js';

// 能在本地镜像上先跑一遍的命令：只改自家 s、不掷骰子、不碰世界。其余（下单、送评、开工、交易、处理卡片……）只发服务器。
const LOCAL_OK = new Set([
  'setInferShare', 'setLease', 'setProduct', 'setTier', 'setSmallApi', 'setRouting', 'setPolicy',
  'cancelJob', 'pauseJob', 'setJobPrio', 'setJobCap', 'setPost', 'setRush', 'setRepair', 'setAutoRepair', 'setOwnOnly', 'setPlan', 'focusResearch',
  'cancelEval', 'researchTech', 'stopTech', 'startStrategy', 'cancelStrategy', 'releaseGpu', 'repay',
]);
const ROOM_KEY = 'mrp.mp.room';
const EVENTS = ['lobby', 'init', 'day', 'cmd', 'inbox', 'clock', 'chat', 'end'];
const clone = x => JSON.parse(JSON.stringify(x));

async function post(path, body) {
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
  const m = {
    room, member: info.member ?? null, seat: info.seat ?? null, pending: !!info.pending,
    lobby: null, clock: null, inbox: { cards: [], at: 0 }, chat: [], chatOpen: false, unread: 0,
    pub: null, base: null, S: null, provider: null, company: null, seats: [], end: null,
    seq: Date.now() * 100, es: null, online: false, form: null,
  };
  setMp(m);
  try { globalThis.localStorage?.setItem(ROOM_KEY, room); } catch { /* 隐私模式 */ }
  setRemote({ send, localOk: name => LOCAL_OK.has(name), fail: e => toast(e.message || String(e)) });
  connect(m);
  ui.screen = 'lobby';
  render();
  return m;
}
function connect(m) {
  // EventSource 断了会自己重连，并带上 Last-Event-ID：差得少服务器补发，差得多重发 init（M.6.7）。
  const es = new EventSource(`/api/r/${m.room}/events`);
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
  if (type === 'lobby') {
    m.lobby = data;
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
  render();
}
// 界面在用的 S 换回服务器认的那份（保持同一个对象：镜像世界、页面都拿着它）。
function resync(m) {
  if (!m.S || !m.base) return;
  const fresh = clone(m.base);
  for (const k of Object.keys(m.S)) if (!(k in fresh)) delete m.S[k];
  Object.assign(m.S, fresh);
}

// ---------- 发命令 ----------
// 引擎命令：{v, seq, name, args}。seq 用毫秒时间戳起头再递增，刷新页面以后也不会和服务器记着的旧 seq 撞上。
async function send(name, args = {}) {
  const m = getMp();
  if (!m) throw new Error('没有连上房间');
  const r = await post(`/api/r/${m.room}/cmd`, { v: E.PROTOCOL_V, seq: ++m.seq, name, args });
  if (!r.ok) {
    resync(m);
    render();
    throw new Error(r.err || '服务器没接受这条命令');
  }
  return r.result ?? null;
}
// 房间命令（不进引擎）：vote、pause、resume、ready、setCompany、chat；房主：approveSeat、kick、settings、speed、save、start。
export async function roomCmd(name, args = {}) {
  const m = getMp();
  if (!m) throw new Error('没有连上房间');
  const r = await post(`/api/r/${m.room}/room`, { name, args });
  if (!r.ok) throw new Error(r.err || '服务器没接受');
  return r;
}

// ---------- 读口（界面用） ----------
export const isHost = m => !!m?.lobby && m.lobby.host === m.member;
export const myMember = m => m?.lobby?.members?.find(x => x.member === m.member) ?? null;
// 收件箱里某张卡还剩多久：游戏日和现实秒取较长的那个（M.6.4）；现实秒按收到时刻往下减。
export function cardLeft(m, card) {
  const wall = Math.max(0, (card.wallMsLeft ?? 0) - (Date.now() - (m.inbox.at || Date.now())));
  return { days: card.gameDaysLeft ?? 0, secs: Math.ceil(wall / 1000) };
}
