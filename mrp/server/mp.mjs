#!/usr/bin/env node
// 联机服务器主进程（规格 M.6.1、M.6.2、M.6.5、M.6.8、M.6.9、M.6.10）：零依赖，只用内置模块。
//   node server/mp.mjs --port 8790 --host 127.0.0.1 --max-rooms 4 --data ./mp-data --time-scale 1 [--tick-ms N（浸泡用，覆盖档位）]
// HTTP/SSE 在主线程；包括大厅在内，每间房只有一个 worker 能写日志和 meta，避免审批与日结交错。
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { MP, PROTOCOL_V, sseFrame } from '../src/career/net/protocol.js';
import { serveStatic } from './static.mjs';
import { ensureDir, readMeta, roomDir } from './store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const number = (k, d, min, max = Infinity, integer = false) => {
  const n = Number(arg(k, d));
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) throw new Error(`${k} 的数值不对`);
  return n;
};
const PORT = number('--port', MP.PORT, 0, 65535, true);
const HOST = arg('--host', MP.HOST);
const MAX_ROOMS = number('--max-rooms', MP.MAX_ROOMS, 1, 10000, true);
const DATA = path.resolve(arg('--data', path.join(ROOT, 'mp-data')));
const TIME_SCALE = number('--time-scale', 1, 0.000001, 1000);
// tick-ms 是浸泡测试的真实毫秒覆盖值；没传时，四个速度档随 time-scale 缩放。
const TICK_MS = argv.includes('--tick-ms') ? number('--tick-ms', 0, 0, 2147483647) : null;
ensureDir(DATA);

const rooms = new Map();
const sha = x => crypto.createHash('sha256').update(String(x)).digest('hex');
const cookieName = id => `mrp_${id}`;
const json = (res, code, body, headers = {}) => {
  if (res.destroyed || res.writableEnded) return;
  const s = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(s), ...headers });
  res.end(s);
};
const fail = (res, code, err) => json(res, code, { ok: false, err });
const cookie = (id, token, req) => `${cookieName(id)}=${token}; HttpOnly; SameSite=Strict; Path=/api/r/${id}; Max-Age=${MP.KEEP_DAYS * 86400}${req.socket.encrypted ? '; Secure' : ''}`;
function actorOf(req, room) {
  const part = (req.headers.cookie || '').split(/;\s*/).find(x => x.startsWith(`${cookieName(room.id)}=`));
  if (!part) return null;
  const actor = room.meta.tokens?.[sha(part.slice(part.indexOf('=') + 1))];
  return typeof actor === 'string' && room.meta.members?.[actor] ? actor : null;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', d => { n += d.length; if (n <= MP.BODY) chunks.push(d); });
    req.on('end', () => {
      if (n > MP.BODY) return reject(new Error(`请求太大，最多 ${MP.BODY} 字节`));
      try {
        const b = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
        if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error();
        resolve(b);
      } catch { reject(new Error('请发送一个 JSON 对象')); }
    });
    req.on('error', reject);
    req.on('aborted', () => reject(new Error('请求中断了')));
  });
}
// 滑动窗口，不会在相邻两个整秒的边界放过一串突发命令；安全限流始终按真实秒算。
function limited(room, actor, kind) {
  const key = `${actor}:${kind}`, now = Date.now();
  const a = (room.rate.get(key) || []).filter(t => t > now - 1000);
  room.rate.set(key, a);
  if (a.length >= MP.RATE[kind]) return true;
  a.push(now); return false;
}

function startRoom(id, meta, mode) {
  const dir = ensureDir(roomDir(DATA, id));
  const worker = new Worker(new URL('./room.mjs', import.meta.url), { workerData: { dir, meta, mode, tickMs: TICK_MS, timeScale: TIME_SCALE } });
  const baseEid = Date.now() * 1000;
  const room = { id, dir, meta, worker, baseEid, eid: baseEid, reqId: 0, pending: new Map(), clients: new Map(), ring: new Map(), floor: new Map(), initialized: new Set(), bytes: new Map(), rate: new Map(), dead: null };
  let ready, rejectReady;
  room.ready = new Promise((resolve, reject) => { ready = resolve; rejectReady = reject; });
  room.ready.catch(() => {});
  const dead = error => {
    if (room.dead) return;
    room.dead = String(error?.message || error);
    rejectReady(new Error(room.dead));
    for (const p of room.pending.values()) p.reject(new Error('这个房间暂时不可用，请稍后重连'));
    room.pending.clear();
    for (const set of room.clients.values()) for (const c of set) c.res.end();
    console.error(`房间 ${id} 出错：${room.dead}`);
  };
  worker.on('error', dead);
  worker.on('exit', code => { if (!stopping) dead(`房间线程已退出（${code}）`); });
  worker.on('message', msg => {
    if (msg.t === 'ready' || msg.t === 'meta') {
      room.meta = msg.meta;
      // 先撤销身份再断开旧连接；后续重连不能靠旧 cookie 找回被踢的座位。
      for (const [actor, set] of room.clients) if (!room.meta.members?.[actor]) {
        for (const c of set) c.res.end();
        room.clients.delete(actor); room.ring.delete(actor); room.floor.delete(actor); room.initialized.delete(actor);
      }
      if (msg.t === 'ready') ready(room);
    } else if (msg.t === 'res') {
      const p = room.pending.get(msg.id);
      if (p) { room.pending.delete(msg.id); p.resolve({ res: msg.res, eid: room.eid }); }
    } else if (msg.t === 'ev') fanOut(room, msg);
    else if (msg.t === 'fatal') dead(msg.err || '存档失败，房间已停止');
  });
  rooms.set(id, room);
  return room;
}
function callAt(room, msg) {
  if (room.dead) return Promise.reject(new Error('这个房间暂时不可用'));
  return new Promise((resolve, reject) => {
    const id = ++room.reqId;
    room.pending.set(id, { resolve, reject });
    try { room.worker.postMessage({ ...msg, id }); }
    catch (e) { room.pending.delete(id); reject(e); }
  });
}
const call = async (room, msg) => (await callAt(room, msg)).res;

function send(room, actor, c, frame) {
  if (c.res.destroyed || c.res.writableEnded) return;
  // 慢客户端自己重连取快照，不能让它把整个主线程的内存吃完。
  if (c.res.writableLength > 1024 * 1024) { c.res.destroy(); return; }
  c.res.write(frame);
  const key = room.meta.members?.[actor]?.seat ?? actor;
  room.bytes.set(key, (room.bytes.get(key) || 0) + Buffer.byteLength(frame));
}
function fanOut(room, msg) {
  const id = ++room.eid;
  const frame = sseFrame(id, msg.type, msg.data);
  const members = Object.values(room.meta.members || {});
  const targets = msg.member ? members.filter(m => m.id === msg.member)
    : members.filter(m => msg.audience === 'all' || (m.approved && Number.isInteger(m.seat) && (msg.seat == null || m.seat === msg.seat)));
  for (const m of targets) {
    const ring = room.ring.get(m.id) || [];
    ring.push({ id, frame });
    while (ring.length > MP.RESUME_EVENTS) room.floor.set(m.id, ring.shift().id);
    room.ring.set(m.id, ring);
    if (msg.type === 'init') room.initialized.add(m.id);
    for (const c of room.clients.get(m.id) || []) {
      if (c.waiting) {
        c.queue.push({ id, frame });
        if (c.queue.length > MP.RESUME_EVENTS) c.res.destroy();
      } else send(room, m.id, c, frame);
    }
  }
}

async function createRoom(req, res) {
  let body;
  try { body = await readBody(req); } catch (e) { return fail(res, 400, e.message); }
  if ([...rooms.values()].filter(r => !r.dead).length >= MAX_ROOMS) return fail(res, 503, `房间已满，最多 ${MAX_ROOMS} 间`);
  if (body.lobby !== undefined && typeof body.lobby !== 'boolean') return fail(res, 400, 'lobby 要填 true 或 false');
  if (body.settings !== undefined && (!body.settings || typeof body.settings !== 'object' || Array.isArray(body.settings))) return fail(res, 400, '房间设置要是一个对象');
  if (body.password !== undefined && (typeof body.password !== 'string' || [...body.password].length > MP.TEXT)) return fail(res, 400, `密码最多 ${MP.TEXT} 字`);
  let id;
  do { id = crypto.randomBytes(3).toString('hex'); } while (rooms.has(id) || fs.existsSync(roomDir(DATA, id)));
  const token = crypto.randomBytes(24).toString('base64url'), memberId = crypto.randomBytes(12).toString('hex');
  let password = null;
  if (body.password) {
    const salt = crypto.randomBytes(16).toString('hex');
    password = { salt, hash: crypto.scryptSync(body.password, salt, 32).toString('hex') };
  }
  const meta = {
    id, created: new Date().toISOString(), v: PROTOCOL_V, lobby: body.lobby === true,
    phase: body.lobby === true ? 'lobby' : 'playing', settings: body.settings || {}, password, host: memberId,
    tokens: { [sha(token)]: memberId },
    members: { [memberId]: { id: memberId, seat: 0, approved: true, ready: false, company: { name: '我的模型公司', brand: '新星', country: 'CN' }, ipHash: sha(req.socket.remoteAddress) } },
  };
  const room = startRoom(id, meta, 'new');
  try { await room.ready; }
  catch { rooms.delete(id); await room.worker.terminate(); return fail(res, 400, '建房失败，请检查开局设置'); }
  const host = room.meta.members[room.meta.host];
  json(res, 200, { ok: true, room: id, member: host.id, seat: host.seat, seats: room.meta.settings.humans ?? room.meta.settings.companies?.filter(c => c.kind === 'human').length, phase: room.meta.phase }, { 'Set-Cookie': cookie(id, token, req) });
}
async function joinRoom(room, req, res) {
  let body;
  try { body = await readBody(req); } catch (e) { return fail(res, 400, e.message); }
  if (actorOf(req, room)) return fail(res, 409, '这个浏览器已经在房间里了，不能再占一个座位');
  const token = crypto.randomBytes(24).toString('base64url'), memberId = crypto.randomBytes(12).toString('hex');
  const r = await call(room, { t: 'join', memberId, tokenHash: sha(token), ipHash: sha(req.socket.remoteAddress), body });
  json(res, r.ok ? 200 : (r.status ?? 400), r, r.ok ? { 'Set-Cookie': cookie(room.id, token, req) } : {});
}
async function postCmd(room, req, res, kind) {
  const actor = actorOf(req, room);
  if (!actor) { req.resume(); return fail(res, 401, '没有房间凭证，请先加入'); }
  if (limited(room, actor, 'cmd')) { req.resume(); return fail(res, 429, '命令发得太快了，每秒最多 10 条'); }
  let body;
  try { body = await readBody(req); } catch (e) { return fail(res, 400, e.message); }
  if (kind === 'room' && body.name === 'chat' && limited(room, actor, 'chat')) return fail(res, 429, '聊天每秒只能发一条');
  const r = await call(room, kind === 'cmd' ? { t: 'cmd', actor, body } : { t: 'room', actor, name: body.name, args: body.args ?? {} });
  json(res, r.ok ? 200 : 400, r);
}
async function events(room, req, res) {
  const actor = actorOf(req, room);
  if (!actor) return fail(res, 401, '没有房间凭证，请先加入');
  const set = room.clients.get(actor) || new Set();
  if (set.size >= MP.SSE_PER_SEAT) return fail(res, 429, `同一个座位最多开 ${MP.SSE_PER_SEAT} 个页面`);
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const c = { res, waiting: true, queue: [] };
  const first = !set.size;
  set.add(c); room.clients.set(actor, set);
  const ping = setInterval(() => send(room, actor, c, ': ping\n\n'), Math.max(10, MP.PING_S * 1000 * TIME_SCALE));
  // request.close 在请求读完时也可能触发；在线身份要跟响应流的寿命一致。
  res.on('close', () => {
    clearInterval(ping);
    if (!set.delete(c)) return;
    if (!set.size) {
      room.clients.delete(actor);
      if (!stopping && room.meta.members?.[actor]) call(room, { t: 'presence', actor, online: false }).catch(() => {});
    }
  });
  if (first) await call(room, { t: 'presence', actor, online: true });
  if (res.destroyed) return;
  const rawLast = req.headers['last-event-id'];
  const last = rawLast === undefined || rawLast === '' ? NaN : Number(rawLast);
  const canResume = Number.isSafeInteger(last) && room.initialized.has(actor) && last >= (room.floor.get(actor) ?? room.baseEid) && last <= room.eid;
  let barrier;
  if (canResume) {
    barrier = room.eid;
    for (const e of room.ring.get(actor) || []) if (e.id > last && e.id <= barrier) send(room, actor, c, e.frame);
  } else {
    const answer = await callAt(room, { t: 'init', actor });
    barrier = answer.eid;
    if (!answer.res.ok) { res.end(); return; }
    const bundle = answer.res.events;
    // 整组快照收到后才推进游标；否则只收到 lobby 就断线，会把后面的 init 当成已经收到。
    for (let i = 0; i < bundle.length; i++) {
      const e = bundle[i], frame = sseFrame(barrier, e.type, e.data);
      send(room, actor, c, i === bundle.length - 1 ? frame : frame.replace(/^id:[^\n]*\n/, ''));
    }
    room.initialized.add(actor);
  }
  // init 与日结之间的消息不能丢，也不能重复应用已包含在 init 里的差分。
  c.waiting = false;
  for (const e of c.queue) if (e.id > barrier) send(room, actor, c, e.frame);
  c.queue.length = 0;
}

let stopping = false;
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/rooms' && req.method === 'POST') return await createRoom(req, res);
    const m = u.pathname.match(/^\/api\/r\/([0-9a-f]{6})\/(join|cmd|room|events|status)$/);
    if (m) {
      const room = rooms.get(m[1]);
      if (!room) return fail(res, 404, '没有这个房间');
      if (room.dead) return fail(res, 503, '这个房间暂时不可用，请稍后重连');
      await room.ready;
      if (m[2] === 'join' && req.method === 'POST') return await joinRoom(room, req, res);
      if (m[2] === 'cmd' && req.method === 'POST') return await postCmd(room, req, res, 'cmd');
      if (m[2] === 'room' && req.method === 'POST') return await postCmd(room, req, res, 'room');
      if (m[2] === 'events' && req.method === 'GET') return await events(room, req, res);
      if (m[2] === 'status' && req.method === 'GET') {
        const s = await call(room, { t: 'status' });
        const clients = Object.fromEntries([...room.clients].map(([actor, set]) => [room.meta.members[actor]?.seat ?? actor, set.size]));
        return json(res, 200, { ok: true, room: room.id, ...s, bytes: Object.fromEntries(room.bytes), clients });
      }
      return fail(res, 405, '方法不对');
    }
    if (u.pathname.startsWith('/api/')) return fail(res, 404, '没有这个接口');
    if (!serveStatic(ROOT, req, res, { deny: [DATA] })) fail(res, 405, '方法不对');
  } catch (e) {
    if (!res.headersSent) fail(res, 500, '服务器忙不过来了，请稍后重试');
    else res.end();
    console.error(e);
  }
});
server.requestTimeout = 30000;

// 过期目录只跳过；保留原始文件，便于玩家自行备份和离线复盘。
for (const id of fs.readdirSync(DATA)) {
  if (!/^[0-9a-f]{6}$/.test(id)) continue;
  const dir = roomDir(DATA, id);
  let meta;
  try { meta = readMeta(dir); }
  catch (e) { console.error(`跳过房间 ${id}：${e.message}`); continue; }
  if (!meta || !Number.isFinite(Date.parse(meta.created)) || Date.now() - Date.parse(meta.created) > MP.KEEP_DAYS * 86400000 * TIME_SCALE) continue;
  if ([...rooms.values()].filter(r => !r.dead).length >= MAX_ROOMS) break;
  startRoom(id, meta, 'resume').ready.catch(e => console.error(`房间 ${id} 恢复失败：${e.message}`));
}
server.listen(PORT, HOST, () => {
  const a = server.address();
  console.log(`联机服务器：http://${a.address}:${a.port}/  数据：${DATA}  房间上限：${MAX_ROOMS}`);
});
async function stop() {
  if (stopping) return;
  stopping = true;
  server.close();
  server.closeAllConnections();
  const force = setTimeout(() => process.exit(0), 3000); force.unref();
  await Promise.allSettled([...rooms.values()].map(async r => { if (!r.dead) await call(r, { t: 'stop' }); await r.worker.terminate(); }));
  clearTimeout(force); process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
