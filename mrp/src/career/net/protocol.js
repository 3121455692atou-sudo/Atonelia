// 联机协议（规格 M.6.1、M.6.5、§1.3a 的 net/protocol.js）：客户端和服务器共用。只用相对路径导入，浏览器里也要能加载。
// 下行 SSE：init（自家完整的 s，去掉 rng、seed；世界公开部分；座位表）、day（二级差分）、cmd（自家命令后的差分）、
// clock、end、ping。上行 POST：{v: PROTOCOL_V, seq, name, args}，命令参数表就是 sim/commands.js 的 COMMANDS，不另写一份。
import { COMMANDS } from '../sim/commands.js';

export const MP = { PORT: 8790, HOST: '127.0.0.1', MAX_ROOMS: 4, SEATS: [2, 8], SPEED_MS: [3000, 2000, 1000, 500], SPEED_DEF: 1,
  PAUSES: 3, PAUSE_S: 60, RESUME_S: 30, DROP_PAUSE: { s: 120, times: 2 }, SLOW_CAP_S: 180,
  INBOX: { days: 10, minS: 45 }, OFFLINE_S: 60, PING_S: 20, RESUME_EVENTS: 300, SNAP_DAYS: 30, KEEP_DAYS: 14,
  SSE_PER_SEAT: 3, RATE: { cmd: 10, chat: 1 }, BODY: 8192,
  TEXT: 200, TOTAL: [3, 12] };                                 // M3b：聊天、名字最多 200 字；从零局公司总数 3–12

export const PROTOCOL_V = 2;   // 2（P4.2）：公开视图的 exchange 按股票再拆一层，追加列表能带“前面截掉几条”
// 引擎命令：唯一参数表。房间命令不进引擎；系统命令由服务器自己发，写进日志（M3b 补全）。
export const ENGINE_COMMANDS = Object.keys(COMMANDS);
export const ROOM_COMMANDS = ['start', 'pause', 'resume', 'speed', 'vote', 'ready', 'chat', 'kick', 'approveSeat', 'settings', 'save', 'setCompany'];
// 改世界的只有前四条；其余只记墙上时钟的决定（暂停、掉线、降速、终局……），重放时只恢复 runtime。
export const SYS_COMMANDS = ['sys.autoResolve', 'sys.host', 'sys.unhost', 'sys.takeover', 'sys.dropPause',
  'sys.online', 'sys.offline', 'sys.recover', 'sys.year', 'sys.autoResume', 'sys.dropEnd', 'sys.allOffline', 'sys.allBack',
  'sys.inboxSeen', 'sys.slowStart', 'sys.slowEnd', 'sys.slowUpdate', 'sys.slowCap', 'sys.end', 'sys.seats', 'sys.pauseConsensus'];

// 自家的 s 发给客户端前去掉 rng、seed（M.6.6：只有自己知道的也不发这两样）。
export function stripPrivate(s) {
  if (!s) return s;
  const { rng, seed, ...rest } = s;
  void rng; void seed;
  return rest;
}

const J = v => JSON.stringify(v);
const clone = v => (v === undefined ? undefined : JSON.parse(J(v)));
// 只追加的列表：news 新的在前（unshift），log、history 新的在后（push）。对不上就整条重发。
const FRONT = new Set(['news']);
const BACK = new Set(['log', 'history']);
function listDiff(prev, cur, front) {
  if (!Array.isArray(prev) || !Array.isArray(cur) || cur.length < prev.length) return { set: cur };
  const n = cur.length - prev.length;
  if (front) {
    if (J(cur.slice(n)) === J(prev)) return n ? { front: cur.slice(0, n) } : null;
    // news 有上限（截掉最旧的）：新条目在前、旧的少了尾巴，也按“前面加了几条”发。
    for (let k = 1; k <= Math.min(cur.length, 20); k++) {
      if (J(cur.slice(k)) === J(prev.slice(0, cur.length - k))) return { front: cur.slice(0, k), keep: cur.length };
    }
    return { set: cur };
  }
  if (J(cur.slice(0, prev.length)) === J(prev)) return n ? { back: cur.slice(prev.length) } : null;
  // 有上限的追加列表（股价历史满 400 条以后）：新条目在后、最旧的截掉了，按“后面加了几条、前面去了几条”发。
  for (let k = 1; k <= Math.min(cur.length, 20); k++) {
    const drop = prev.length - (cur.length - k);
    if (drop > 0 && J(cur.slice(0, cur.length - k)) === J(prev.slice(drop))) return { back: cur.slice(cur.length - k), drop };
  }
  return { set: cur };
}
function applyList(arr, L) {
  if (L.set) return L.set;
  if (L.front) { const out = [...L.front, ...(arr || [])]; if (L.keep) out.length = L.keep; return out; }
  if (L.back) return [...(arr || []).slice(L.drop || 0), ...L.back];
  return arr;
}
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
// 股市（公开视图的 exchange）按股票再往下拆一层（P4.2）：每只股票带着最多 400 天的价格历史 hist，整块重发时
// 占了公开差分的九成（上市的公司一多，2 档下行就贴着 5 KB/s 的线）。新上市的整只发、退市的发 id；其余只发变了的字段，
// hist 只发新追加的几天。listings 以外的子键变了整个发。
function exchangeDiff(prev, cur) {
  if (!isObj(prev) || !isObj(cur)) return { whole: cur };
  const out = {};
  for (const k of Object.keys(cur)) {
    if (J(cur[k]) === J(prev[k])) continue;
    if (k !== 'listings' || !isObj(prev[k]) || !isObj(cur[k])) { (out.sub ??= {})[k] = cur[k]; continue; }
    const L = {};
    for (const [id, c] of Object.entries(cur[k])) {
      const p = prev[k][id];
      if (!isObj(p) || !isObj(c)) { (L.add ??= {})[id] = c; continue; }
      const u = {};
      for (const f of Object.keys(c)) {
        if (J(c[f]) === J(p[f])) continue;
        if (f === 'hist') u.hist = listDiff(p[f], c[f], false);
        else (u.set ??= {})[f] = c[f];
      }
      const del = Object.keys(p).filter(f => !(f in c));
      if (del.length) u.del = del;
      if (Object.keys(u).length) (L.upd ??= {})[id] = u;
    }
    const gone = Object.keys(prev[k]).filter(id => !(id in cur[k]));
    if (gone.length) L.del = gone;
    out.listings = L;
  }
  const del = Object.keys(prev).filter(k => !(k in cur));
  if (del.length) out.del = del;
  return Object.keys(out).length ? out : null;
}
// models 按模型 id 再按字段比：只发变了的模型和字段；新模型整个发；没了的发 id。顺序变了另发 order。
function modelsDiff(prev, cur) {
  if (!Array.isArray(prev) || !Array.isArray(cur)) return { set: cur };
  const pm = new Map(prev.map(m => [m?.id, m]));
  const out = {};
  for (const m of cur) {
    const p = pm.get(m?.id);
    if (!p) { (out.add ??= []).push(m); continue; }
    const set = {}, del = [];
    for (const k of Object.keys(m)) if (J(m[k]) !== J(p[k])) set[k] = m[k];
    for (const k of Object.keys(p)) if (!(k in m)) del.push(k);
    if (Object.keys(set).length || del.length) (out.upd ??= {})[m.id] = del.length ? { set, del } : { set };
  }
  const curIds = new Set(cur.map(m => m?.id));
  const gone = prev.filter(m => !curIds.has(m?.id)).map(m => m?.id);
  if (gone.length) out.del = gone;
  const order = cur.map(m => m?.id);
  const prevOrder = prev.filter(m => curIds.has(m?.id)).map(m => m?.id).concat((out.add || []).map(m => m.id));
  if (J(order) !== J(prevOrder)) out.order = order;
  return Object.keys(out).length ? out : null;
}
// 二级差分（M.6.1 定稿）：顶层键变了才发；models、news、log、history 再往下一层。返回 null 表示没变。
export function diffState(prev, cur) {
  if (!prev) return { full: clone(cur) };
  const d = {};
  for (const k of Object.keys(cur)) {
    if (J(cur[k]) === J(prev[k])) continue;
    if (k === 'models') { const md = modelsDiff(prev[k], cur[k]); if (md) d[k] = { models: md }; }
    else if (k === 'exchange') { const ed = exchangeDiff(prev[k], cur[k]); if (ed) d[k] = { ex: ed }; }
    else if (FRONT.has(k) || BACK.has(k)) { const ld = listDiff(prev[k], cur[k], FRONT.has(k)); if (ld) d[k] = { list: ld }; }
    else d[k] = { set: cur[k] };
  }
  const del = Object.keys(prev).filter(k => !(k in cur));
  if (del.length) d.$del = del;
  return Object.keys(d).length ? clone(d) : null;
}
export function applyDiff(obj, d) {
  if (!d) return obj;
  if (d.full) return clone(d.full);
  for (const [k, v] of Object.entries(d)) {
    if (k === '$del') { for (const x of v) delete obj[x]; continue; }
    if (v.set !== undefined) { obj[k] = v.set; continue; }
    if (v.list) { obj[k] = applyList(obj[k], v.list); continue; }
    if (v.ex) {
      const ed = v.ex;
      if (ed.whole !== undefined) { obj[k] = ed.whole; continue; }
      const o = (obj[k] = { ...(obj[k] || {}) });
      for (const [x, y] of Object.entries(ed.sub || {})) o[x] = y;
      for (const x of ed.del || []) delete o[x];
      if (ed.listings) {
        const Ls = (o.listings = { ...(o.listings || {}) });
        for (const id of ed.listings.del || []) delete Ls[id];
        for (const [id, c] of Object.entries(ed.listings.add || {})) Ls[id] = c;
        for (const [id, u] of Object.entries(ed.listings.upd || {})) {
          const L = (Ls[id] = { ...(Ls[id] || {}) });
          Object.assign(L, u.set || {});
          for (const f of u.del || []) delete L[f];
          if (u.hist) L.hist = applyList(L.hist, u.hist);
        }
      }
      continue;
    }
    if (v.models) {
      const md = v.models;
      if (md.set) { obj[k] = md.set; continue; }
      let arr = [...(obj[k] || [])];
      if (md.del) { const gone = new Set(md.del); arr = arr.filter(m => !gone.has(m?.id)); }
      if (md.upd) for (const m of arr) {
        const u = md.upd[m?.id];
        if (!u) continue;
        Object.assign(m, u.set || {});
        for (const x of u.del || []) delete m[x];
      }
      if (md.add) arr.push(...md.add);
      if (md.order) { const byId = new Map(arr.map(m => [m?.id, m])); arr = md.order.map(id => byId.get(id)).filter(Boolean); }
      obj[k] = arr;
    }
  }
  return obj;
}

// SSE 一帧：id 是房间里的事件序号，断线重连按 Last-Event-ID 补发。
export const sseFrame = (id, type, data) => `id: ${id}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
// 把收到的 SSE 原文切成事件（客户端和测试用）。
export function parseSse(text) {
  const out = [];
  for (const block of text.split('\n\n')) {
    if (!block.trim()) continue;
    const ev = {};
    for (const line of block.split('\n')) {
      const i = line.indexOf(': ');
      if (i < 0) continue;
      const k = line.slice(0, i), v = line.slice(i + 2);
      if (k === 'id') ev.id = Number(v);
      else if (k === 'event') ev.type = v;
      else if (k === 'data') ev.data = JSON.parse(v);
    }
    if (ev.type) out.push(ev);
  }
  return out;
}
