// 一局一个 worker：大厅也用同一个写入者，避免批准座位和快照恢复互相覆盖。
// 大厅没有世界；start 的日志落盘以后才 createWorld。所有墙钟决定都先写日志。
import { parentPort, workerData } from 'node:worker_threads';
import crypto from 'node:crypto';
import * as E from '../src/career/engine.js';
import { inboxOf } from '../src/career/world/index.js';
import { BOT_COMPANIES } from '../src/career/data/selfplay.js';
import { MP, PROTOCOL_V, diffState, stripPrivate } from '../src/career/net/protocol.js';
import { ensureDir, appendLog, writeMeta, writeSnap as snapshot, rebuild, replayEntry, readLog } from './store.mjs';

const { dir, mode, tickMs = null, timeScale = 1 } = workerData;
ensureDir(dir);
const clone = x => structuredClone(x);
const own = (x, k) => Object.hasOwn(x, k);
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const real = seconds => seconds * 1000 * timeScale;
const text = (x, label, fallback) => {
  if (x === undefined && fallback !== undefined) return fallback;
  if (typeof x !== 'string' || !x.trim() || Array.from(x).length > (MP.TEXT ?? 200))
    throw new Error(`${label}要填 1–200 个字`);
  return x.trim();
};
const integer = (x, min, max, label) => {
  if (!Number.isInteger(x) || x < min || x > max) throw new Error(`${label}要在 ${min}–${max} 之间`);
  return x;
};
// pick：分岔局里这个座位要接手的真实公司 id（从零局不用）。
const company = (x = {}, old = {}) => {
  if (!object(x)) throw new Error('公司资料要是一个对象');
  const pick = x.pick ?? old.pick ?? null;
  if (pick !== null && (typeof pick !== 'string' || !/^[a-z0-9_-]{1,32}$/.test(pick))) throw new Error('要接手的公司 id 不对');
  return { name: text(x.name, '公司名', old.name ?? '未命名公司'),
    brand: text(x.brand, '品牌词', old.brand ?? '新星'),
    country: text(x.country, '国家', old.country ?? 'CN'), ...(pick ? { pick } : {}) };
};
function normalizeSettings(input, old = {}) {
  if (!object(input)) throw new Error('房间设置要是一个对象');
  if (own(input, 'password')) throw new Error('密码请填在建房请求的 password 字段里');
  const s = { ...old, ...input, rules: { ...(old.rules ?? {}), ...(input.rules ?? {}) } };
  if (input.rules !== undefined && !object(input.rules)) throw new Error('规则设置要是一个对象');
  s.mode ??= 'zero';
  if (!['zero', 'fork'].includes(s.mode)) throw new Error('开局方式只能选从零或分岔');
  s.start = String(s.start ?? '2024-01');
  if (/^202[345]$/.test(s.start)) s.start += '-01';
  if (s.mode === 'zero' && !/^202[345]-01(?:-01)?$/.test(s.start)) throw new Error('从零开局只能选 2023、2024 或 2025 年');
  if (s.mode === 'fork' && !/^\d{4}-\d{2}(?:-\d{2})?$/.test(s.start)) throw new Error('分岔日期请填年和月');
  const date = s.start.length === 7 ? `${s.start}-01` : s.start, parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('这个开局日期不存在');
  s.humans = integer(input.humanCount ?? s.humans ?? 2, 2, 8, '真人数');
  s.years = integer(s.years ?? 2, 1, 3, '游戏年数');
  s.days = 365 * s.years;
  s.bots = integer(input.botCount ?? s.bots ?? Math.max(0, 6 - s.humans), 0, 10, '电脑数');
  if (s.mode === 'zero' && (s.humans + s.bots < 3 || s.humans + s.bots > 12)) throw new Error('公司总数要在 3–12 家之间');
  s.keep = integer(s.keep ?? 12, s.humans, 12, '分岔在场公司数');
  s.bot ??= 'normal'; s.tier ??= 'specialist';
  if (!['easy', 'normal', 'hard'].includes(s.bot)) throw new Error('电脑难度只能选 easy、normal 或 hard');
  if (!['small', 'specialist', 'major'].includes(s.tier)) throw new Error('开局档只能选 small、specialist 或 major');
  s.speedMax = integer(s.speedMax ?? 3, 0, 3, '速度上限');
  s.pauses = integer(s.pauses ?? MP.PAUSES, 0, 100, '每人暂停次数');
  for (const [key, value] of Object.entries({ short: true, distill: true, poach: false })) {
    s.rules[key] ??= value;
    if (typeof s.rules[key] !== 'boolean') throw new Error('规则开关只能填 true 或 false');
  }
  s.rules.protectionDays = integer(s.rules.protectionDays ?? 120, 0, 1095, '新手保护天数');
  s.seed ??= crypto.randomInt(0, 0x7fffffff);
  if (!(typeof s.seed === 'string' && s.seed.length <= 200) && !(typeof s.seed === 'number' && Number.isFinite(s.seed))) throw new Error('种子要是数字或短文字');
  delete s.companies; delete s.humanCount; delete s.botCount;
  return s;
}

let world = null, logN = 0, rt, tickTimer = null, maintenanceTimer = null, fatal = false;
function writeSnap(...args) {
  try { return snapshot(...args); } catch (error) { fatal = true; throw error; }
}
const post = msg => parentPort.postMessage(msg);
const emit = (seat, type, data) => post({ t: 'ev', seat, type, data });
const emitAll = (type, data) => post({ t: 'ev', audience: 'all', type, data });
const emitMember = (member, type, data) => post({ t: 'ev', member, type, data });
const year = () => String(world?.day ?? rt.meta.settings.start).slice(0, 4);
const entries = () => Object.entries(rt.players).sort((a, b) => Number(a[0]) - Number(b[0]));
const humans = () => Object.values(world?.companies ?? {}).filter(c => c.kind === 'human').sort((a, b) => a.seat - b.seat);
const connected = () => entries().filter(([, p]) => p.online && !world.companies[p.id]?.hosted && !p.kicked).map(([s]) => Number(s));
const paused = () => !rt.clock.started || rt.clock.ended || rt.clock.recovery || rt.clock.allOffline || !!rt.clock.pause || !!rt.clock.drop;
const baseSpeed = () => {
  const votes = connected().map(s => rt.players[s].vote).sort((a, b) => a - b);
  return Math.min(rt.clock.speedMax, votes.length ? votes[Math.floor((votes.length - 1) / 2)] : MP.SPEED_DEF);
};
const speed = () => rt.clock.slow ? 0 : baseSpeed();
const slowUsed = (p, now = Date.now()) => Math.min(MP.SLOW_CAP_S, p.slowUsed + (p.slowSince === null ? 0 : Math.max(0, now - p.slowSince) / real(1)));

// runtime 是日志里的操作后状态。即使 meta.json 尚未来得及更新，恢复也以日志为准。
function record(t, name, args = {}, change = null, extra = {}, execute = true) {
  const next = clone(rt), before = JSON.stringify(rt.meta), now = Date.now();
  if (change) change(next, now);
  next.wall = now;
  const e = { t, name, args, day: world?.day ?? null, at: now, ...extra, state: next };
  try {
    logN = appendLog(dir, e, logN);
    rt = next;
    if (execute) world = replayEntry(world, e);
    if (before !== JSON.stringify(rt.meta)) { writeMeta(dir, rt.meta); post({ t: 'meta', meta: rt.meta }); }
  } catch (error) {
    // 已提交的操作不能半途放弃再继续 tick，否则之后的日志再也不能重放。
    fatal = true; clearTimeout(tickTimer); clearTimeout(maintenanceTimer);
    throw error;
  }
  return e;
}
const sys = (name, args, change) => record('sys', `sys.${name}`, args, change);
function initial(meta) {
  meta = clone(meta);
  if (!meta.members) {
    const tokens = {}, members = {};
    for (const [hash, seat] of Object.entries(meta.tokens ?? {})) {
      const id = `legacy-${seat}`;
      tokens[hash] = id;
      members[id] = { id, seat, approved: true, ready: true, online: false, company: company(), ipHash: null };
    }
    meta.tokens = tokens; meta.members = members; meta.host = 'legacy-0'; meta.lobby = false;
  }
  meta.phase ??= meta.lobby ? 'lobby' : 'playing';
  if (meta.lobby) meta.settings = normalizeSettings(meta.settings ?? {});
  else {
    const cs = meta.settings?.companies;
    if (!Array.isArray(cs) || cs.length > 12 || cs.filter(c => c?.kind === 'human').length < 1 || cs.filter(c => c?.kind === 'human').length > 8)
      throw new Error('真人座位要 1–8 个，公司最多 12 家');
    for (const c of cs) {
      company(c); if (!['human', 'bot'].includes(c.kind)) throw new Error('公司类型要选 human 或 bot');
    }
    meta.settings.seed ??= crypto.randomInt(0, 0x7fffffff);
  }
  for (const m of Object.values(meta.members)) { m.online = false; m.company = company(m.company); }
  return { meta, wall: Date.now(), players: {}, inbox: {}, clock: {
    started: false, ended: false, recovery: false, allOffline: false,
    speedMax: meta.settings.speedMax ?? 3, pause: null, drop: null, dropUsed: 0,
    slow: false, slowSeats: [], slowRunning: false,
  } };
}
function player(id, online = false) {
  return { id, online, vote: MP.SPEED_DEF, year: year(), pauseUses: 0, slowUsed: 0,
    slowSince: null, offlineAt: null, hostAt: null, kicked: false };
}
function bindWorld() {
  sys('seats', {}, n => {
    for (const c of humans()) {
      const m = Object.values(n.meta.members).find(m => m.approved && m.seat === c.seat);
      n.players[c.seat] ??= player(c.id, !!m?.online);
      const p = n.players[c.seat];
      if (n.clock.started && !p.online && p.offlineAt === null) { p.offlineAt = Date.now(); p.hostAt = p.offlineAt + real(MP.OFFLINE_S); }
      if (m) { m.companyId = c.id; m.company.name = c.name; }
    }
  });
}
function completeTakeover() {
  const intent = rt.pendingTakeover;
  if (!intent) return null;
  const c = world.companies[intent.companyId], m = rt.meta.members[intent.member];
  if (!m) { fatal = true; throw new Error('接管申请的身份丢失了，房间已停止'); }
  if (!c || c.kind !== 'human') {
    record('room', 'approveSeatRejected', intent, n => { n.pendingTakeover = null; });
    return { ok: false, err: '这家电脑公司已经不在场了，换一家试试' };
  }
  const seat = c.seat;
  if (!Number.isInteger(seat) || (rt.players[seat] && rt.players[seat].id !== c.id)) {
    fatal = true; throw new Error('接管后的座位发生冲突，房间已停止');
  }
  record('room', 'approveSeat', { member: m.id, companyId: c.id, seat }, (n, now) => {
    Object.assign(n.meta.members[m.id], { seat, approved: true, ready: true, companyId: c.id });
    n.meta.members[m.id].company.name = c.name;
    n.players[seat] = player(c.id, !!m.online);
    if (!m.online) { n.players[seat].offlineAt = now; n.players[seat].hostAt = now + real(MP.OFFLINE_S); }
    n.pendingTakeover = null;
  });
  return { ok: true, member: m.id, seat };
}
if (mode === 'resume') {
  const saved = rebuild(dir);
  ({ world, logN } = saved);
  rt = saved.runtime ?? initial(workerData.meta);
  const recoveredWall = rt.wall;
  if (world && rt.pendingTakeover) completeTakeover();
  if (world && !Object.keys(rt.players).length) bindWorld();
  sys('recover', {}, n => {
    for (const m of Object.values(n.meta.members)) m.online = false;
    for (const p of Object.values(n.players)) {
      if (p.slowSince !== null) p.slowUsed = Math.min(MP.SLOW_CAP_S, p.slowUsed + Math.max(0, recoveredWall - p.slowSince) / real(1));
      p.slowSince = null; p.online = false;
      p.offlineAt ??= recoveredWall; p.hostAt ??= recoveredWall + real(MP.OFFLINE_S);
    }
    n.clock.recovery = !!world; n.clock.allOffline = !!world;
    n.clock.slow = false; n.clock.slowSeats = []; n.clock.slowRunning = false;
  });
} else {
  rt = initial(workerData.meta);
  record('room', 'create', {}, () => {});
  writeMeta(dir, rt.meta);
  if (!rt.meta.lobby) {
    record('room', 'start', { settings: { ...rt.meta.settings, mp: true } });
    bindWorld();
  }
  writeSnap(dir, world, logN, rt);
}

const prevPriv = new Map(), results = new Map();
let prevPub = world ? clone(E.publicView(world)) : null;
const inboxSig = new Map();
const dayMs = [], tickMsList = [], diffMsList = [], snapMs = [];
for (const [seat, p] of entries()) prevPriv.set(Number(seat), clone(stripPrivate(world.companies[p.id].s)));
// 已成功的 seq 在重启后仍能去重；拒绝的结果只在本次进程保留。
for (const e of mode === 'resume' ? readLog(dir) : []) if (e.t === 'cmd' && Number.isInteger(e.cseq)) {
  const m = results.get(e.seat) ?? new Map();
  m.set(e.cseq, { ok: true, seq: e.cseq, day: e.day });
  if (m.size > 256) m.delete(m.keys().next().value);
  results.set(e.seat, m);
}
function clockInfo() {
  return { day: world?.day ?? null, end: world?.end ?? null, started: rt.clock.started, ended: rt.clock.ended,
    paused: paused(), speed: world ? speed() : MP.SPEED_DEF, baseSpeed: world ? baseSpeed() : MP.SPEED_DEF,
    speedMax: rt.clock.speedMax, slow: rt.clock.slow,
    reason: rt.clock.ended ? 'end' : !rt.clock.started ? 'waiting' : rt.clock.recovery ? 'recovery' : rt.clock.allOffline ? 'offline' : rt.clock.drop ? 'drop' : rt.clock.pause ? 'pause' : null,
    pause: clone(rt.clock.pause), drop: clone(rt.clock.drop), dropUsed: rt.clock.dropUsed,
    players: entries().map(([s, p]) => ({ seat: Number(s), id: p.id, online: p.online,
      vote: p.vote, hosted: !!world.companies[p.id]?.hosted, pauseUses: p.pauseUses, slowUsed: slowUsed(p) })) };
}
function seatTable() {
  return Object.values(world?.companies ?? {}).map(c => ({ seat: c.kind === 'human' ? c.seat : null,
    id: c.id, name: c.name, kind: c.kind, bot: c.bot, hosted: !!c.hosted }));
}
function lobby() {
  const ms = Object.values(rt.meta.members);
  const groups = new Map();
  for (const m of ms.filter(m => m.approved && m.ipHash)) {
    const a = groups.get(m.ipHash) ?? []; a.push(m.id); groups.set(m.ipHash, a);
  }
  return { room: rt.meta.id, phase: rt.meta.phase, host: rt.meta.host, settings: rt.meta.settings,
    password: !!rt.meta.password, seats: seatTable(),
    members: ms.map(m => ({ member: m.id, seat: m.seat, approved: m.approved, ready: m.ready,
      online: m.online, company: m.company, companyId: m.companyId ?? null, request: m.request ?? null })),
    sameIp: [...groups.values()].filter(a => a.length > 1) };
}
const broadcastLobby = () => emitAll('lobby', lobby());
function privateInit(seat) {
  const p = rt.players[seat];
  return { v: PROTOCOL_V, seat, company: p.id, s: stripPrivate(world.companies[p.id].s),
    pub: E.publicView(world, p.id), seats: seatTable(), clock: clockInfo() };
}
// 终局公开：各家完整的私有视图，加上每一款发布的完整血统（引擎没有 revealView 时不带）。
const endData = () => ({
  day: world.day,
  // 每家的私有视图里附带的公开视图客户端早就有了，去掉（不然终局一次要发上兆字节）。
  companies: Object.values(world.companies).map(c => { const v = E.privateView(world, c.id); if (v) delete v.public; return v; }),
  lineage: typeof E.revealView === 'function' ? E.revealView(world) : [],
});
const dayAge = since => Math.max(0, Math.floor((Date.parse(world.day) - Date.parse(since)) / 86400000));
function inboxData(seat, now = Date.now()) {
  const p = rt.players[seat];
  return { day: world.day, cards: (rt.inbox[p.id] ?? []).map(c => ({ ...c,
    gameDaysLeft: Math.max(0, MP.INBOX.days - dayAge(c.since)),
    wallMsLeft: Math.max(0, c.first + real(MP.INBOX.minS) - now) })) };
}
function initFor(actor) {
  const m = rt.meta.members[actor];
  if (!m) return { ok: false, err: '座位凭证已经失效了' };
  const events = [{ type: 'lobby', data: lobby() }];
  if (world && m.approved && rt.players[m.seat]) {
    events.push({ type: 'init', data: privateInit(m.seat) }, { type: 'inbox', data: inboxData(m.seat) });
  }
  if (world && rt.clock.ended) events.push({ type: 'end', data: endData() });
  return { ok: true, events };
}
function privateDiff(seat) {
  const s = stripPrivate(world.companies[rt.players[seat].id].s);
  const d = diffState(prevPriv.get(seat), s);
  prevPriv.set(seat, clone(s));
  return d;
}
function flushPrivate(seqSeat = null, seq = null) {
  for (const [s] of entries()) {
    const seat = Number(s), d = privateDiff(seat);
    if (d) emit(seat, 'cmd', { seq: seat === seqSeat ? seq : null, me: d });
  }
}
function announceInit(actor) {
  const m = rt.meta.members[actor];
  if (!world || !m?.approved) return;
  emitMember(actor, 'init', privateInit(m.seat));
  emitMember(actor, 'inbox', inboxData(m.seat));
}

function resetYear() {
  if (!entries().some(([, p]) => p.year !== year())) return;
  sys('year', { year: year() }, n => {
    for (const p of Object.values(n.players)) if (p.year !== year()) {
      p.year = year(); p.pauseUses = 0; p.slowUsed = 0; p.slowSince = null;
    }
    n.clock.slowRunning = false;
  });
}
function reconcilePause(now) {
  const pause = rt.clock.pause;
  if (!pause) return;
  const online = connected(), all = online.length > 0 && online.every(s => pause.voters.includes(s));
  if (all !== pause.all) sys('pauseConsensus', { all }, n => {
    n.clock.pause.all = all; n.clock.pause.until = all ? null : n.clock.pause.at + real(MP.PAUSE_S);
  });
  if (rt.clock.pause.until !== null && now >= rt.clock.pause.until)
    sys('autoResume', {}, n => { n.clock.pause = null; });
}
function refreshInbox(now) {
  const fresh = {};
  for (const [, p] of entries()) {
    const seen = new Map(), old = new Map((rt.inbox[p.id] ?? []).map(c => [c.key, c]));
    fresh[p.id] = inboxOf(world, p.id).map(card => {
      const base = JSON.stringify([card.kind, card.id, card.since]), ordinal = seen.get(base) ?? 0;
      seen.set(base, ordinal + 1);
      const key = `${base}:${ordinal}`;
      return { ...card, key, first: old.get(key)?.first ?? now };
    });
  }
  if (JSON.stringify(fresh) !== JSON.stringify(rt.inbox)) sys('inboxSeen', {}, n => { n.inbox = fresh; });
}
function resolveExpired(now) {
  // 每处理一张就重新取索引，避免删掉第零张以后把下一张卡跳过去。
  for (;;) {
    let due;
    for (const [, p] of entries()) {
      if (world.companies[p.id].hosted) continue;
      const card = (rt.inbox[p.id] ?? []).find(c => dayAge(c.since) >= MP.INBOX.days && now >= c.first + real(MP.INBOX.minS));
      if (card) { due = { id: p.id, at: card.at, key: card.key }; break; }
    }
    if (!due) return;
    sys('autoResolve', due);
    const before = JSON.stringify(rt.inbox[due.id]);
    refreshInbox(now);
    if (before === JSON.stringify(rt.inbox[due.id])) throw new Error('卡片默认处理没有生效，房间已停止以保护存档');
  }
}
function reconcileSlow(now) {
  const desired = entries().filter(([, p]) => !world.companies[p.id].hosted && !p.kicked &&
    slowUsed(p, now) < MP.SLOW_CAP_S && (rt.inbox[p.id] ?? []).some(c => c.major)).map(([s]) => Number(s));
  const seats = rt.clock.started && !rt.clock.ended && baseSpeed() > 0 ? desired : [];
  const running = seats.length > 0 && !paused();
  if (JSON.stringify(seats) === JSON.stringify(rt.clock.slowSeats) && running === rt.clock.slowRunning) return;
  const cap = entries().some(([, p]) => p.slowSince !== null && slowUsed(p, now) >= MP.SLOW_CAP_S);
  const name = cap ? 'slowCap' : !rt.clock.slow && seats.length ? 'slowStart' : rt.clock.slow && !seats.length ? 'slowEnd' : 'slowUpdate';
  sys(name, { seats }, n => {
    for (const [s, p] of Object.entries(n.players)) {
      p.slowUsed = slowUsed(p, now); p.slowSince = running && seats.includes(Number(s)) ? now : null;
    }
    n.clock.slow = seats.length > 0; n.clock.slowSeats = seats; n.clock.slowRunning = running;
  });
}
function reconcileOffline(now) {
  if (!rt.clock.started || rt.clock.ended || rt.clock.recovery) return;
  const all = !entries().some(([, p]) => p.online && !p.kicked);
  if (all !== rt.clock.allOffline) {
    sys(all ? 'allOffline' : 'allBack', {}, n => { n.clock.allOffline = all; });
    if (all) writeSnap(dir, world, logN, rt);
  }
  for (const [s, p] of entries()) if (!p.online && !p.kicked && p.hostAt !== null && now >= p.hostAt && !world.companies[p.id].hosted) {
    sys('host', { id: p.id }, n => { n.players[s].hostAt = null; });
  }
  if (rt.clock.drop && (now >= rt.clock.drop.until || rt.clock.drop.seats.every(s => rt.players[s]?.online || rt.players[s]?.kicked)))
    sys('dropEnd', {}, n => { n.clock.drop = null; });
}
let lastClock = '';
function emitClock() {
  // 剩余秒数由前端按绝对期限显示；slowUsed 的连续变化不触发每毫秒广播。
  // 日期每天都变，客户端从 day 事件里已经拿到了，不算进签名（否则每天多发一份座位表，2 档下行超 5KB/s）。
  const data = clockInfo(), signature = JSON.stringify({ ...data, day: null, players: data.players.map(p => ({ ...p, slowUsed: Math.floor(p.slowUsed) })) });
  if (signature !== lastClock) { lastClock = signature; emit(null, 'clock', data); }
}
function maintain(forceInbox = false) {
  if (!world || fatal) return;
  // 最后一条 tick 已提交而终局事件尚未写出就宕机，恢复暂停时也要补齐终局。
  finish();
  const now = Date.now();
  resetYear(); reconcileOffline(now); reconcilePause(now); refreshInbox(now);
  // 暂停是留给人处理卡片的：暂停期间卡片不到期（否则全员暂停时世界还会被默认项改动）。
  if (!paused()) resolveExpired(now);
  reconcileSlow(now); flushPrivate(); emitClock();
  // 收件箱只在卡片或剩余游戏日变了才推；现实时间的倒计时由客户端按收到时刻自己减（wallMsLeft 是发出那一刻的剩余）。
  for (const [s] of entries()) {
    const seat = Number(s), data = inboxData(seat, now);
    const sig = JSON.stringify(data.cards.map(c => [c.key, c.gameDaysLeft]));
    if (forceInbox || inboxSig.get(seat) !== sig) { inboxSig.set(seat, sig); emit(seat, 'inbox', data); }
  }
}
function schedule(reset = false) {
  if (reset && tickTimer) { clearTimeout(tickTimer); tickTimer = null; }
  if (!world || paused() || tickTimer || fatal) return;
  tickTimer = setTimeout(step, tickMs ?? MP.SPEED_MS[speed()] * timeScale);
}
function finish() {
  if (!world || rt.clock.ended || world.day <= world.end) return;
  sys('end', {}, n => { n.clock.ended = true; n.clock.pause = null; n.clock.drop = null; n.meta.phase = 'ended'; });
  reconcileSlow(Date.now()); emitAll('end', endData()); broadcastLobby();
  writeSnap(dir, world, logN, rt);
}
function step() {
  tickTimer = null;
  if (fatal || !world || paused()) return;
  try {
    finish(); if (rt.clock.ended) return;
    const beforeSpeed = speed(), t0 = performance.now(), day = world.day;
    const at = Date.now();
    logN = appendLog(dir, { t: 'tick', day, at }, logN); rt.wall = at;
    world.tick();
    const t1 = performance.now(), pub = clone(E.publicView(world)), d = diffState(prevPub, pub);
    prevPub = pub;
    for (const [s] of entries()) emit(Number(s), 'day', { day, next: world.day, me: privateDiff(Number(s)), pub: d });
    const t2 = performance.now();
    dayMs.push(t2 - t0); tickMsList.push(t1 - t0); diffMsList.push(t2 - t1);
    for (const a of [dayMs, tickMsList, diffMsList]) if (a.length > 2000) a.splice(0, a.length - 2000);
    finish(); maintain();
    if (world.tickNo % MP.SNAP_DAYS === 0) {
      const t3 = performance.now(); logN = appendLog(dir, { t: 'hash', day: world.day, h: world.hash() }, logN);
      writeSnap(dir, world, logN, rt); snapMs.push(performance.now() - t3);
    }
    schedule(beforeSpeed !== speed());
  } catch (error) { die(error); }
}
function pulse() {
  if (fatal) return;
  try { const old = world ? `${paused()}:${speed()}` : ''; maintain(); schedule(world && old !== `${paused()}:${speed()}`); }
  catch (error) { die(error); return; }
  maintenanceTimer = setTimeout(pulse, Math.max(2, Math.min(250, real(0.25))));
}
function die(error) {
  fatal = true; clearTimeout(tickTimer); clearTimeout(maintenanceTimer);
  // 错误交给主线程标记房间不可写，不能把内部异常当成普通拒绝后继续运行。
  throw error;
}

function member(actor, approved = true) {
  const m = rt.meta.members[actor];
  if (!m) throw new Error('座位凭证已经失效了');
  if (approved && !m.approved) throw new Error('还在等房主批准');
  return m;
}
function hostOnly(actor) { if (actor !== rt.meta.host) throw new Error('只有房主能这样做'); }
function join({ memberId, tokenHash, ipHash, body }) {
  if (!object(body)) throw new Error('加入申请要是一个对象');
  if (rt.meta.password) {
    const password = typeof body.password === 'string' ? body.password : '';
    if (Array.from(password).length > 200) return { ok: false, status: 403, err: '房间密码不对' };
    const hash = crypto.scryptSync(password, rt.meta.password.salt, 32);
    const expected = Buffer.from(rt.meta.password.hash, 'hex');
    if (hash.length !== expected.length || !crypto.timingSafeEqual(hash, expected)) return { ok: false, status: 403, err: '房间密码不对' };
  }
  if (Object.keys(rt.meta.members).length >= 64) throw new Error('等候的人太多了，稍后再来');
  if (own(rt.meta.tokens, tokenHash) || own(rt.meta.members, memberId)) throw new Error('这个浏览器已经加入了');
  let seat = null, approved = false;
  if (!rt.meta.lobby && body.companyId === undefined && body.id === undefined) {
    seat = integer(body.seat, 0, humans().length - 1, '座位号');
    if (rt.players[seat]?.kicked) throw new Error('这个座位已经退出，只能申请接管电脑公司');
    if (Object.values(rt.meta.members).some(m => m.approved && m.seat === seat)) throw new Error('这个座位已经有人了');
    approved = true;
  } else if (rt.meta.phase === 'ended') throw new Error('这一局已经结束了');
  else if (body.seat !== undefined && !world) integer(body.seat, 0, rt.meta.settings.humans - 1, '座位号');
  const request = { seat: body.seat ?? null, companyId: body.companyId ?? body.id ?? null };
  if (request.companyId !== null && typeof request.companyId !== 'string') throw new Error('请选择要接管的电脑公司');
  const m = { id: memberId, seat, approved, ready: approved, online: false,
    company: company(body.company), ipHash, request };
  if (approved) { m.companyId = rt.players[seat].id; m.company.name = world.companies[m.companyId].name; }
  record('room', 'join', { member: memberId, seat }, n => {
    n.meta.tokens[tokenHash] = memberId; n.meta.members[memberId] = m;
  });
  broadcastLobby();
  return { ok: true, member: memberId, seat, seats: world ? humans().length : rt.meta.settings.humans, pending: !approved };
}
function presence(actor, online) {
  const m = member(actor, false);
  if (m.online === online) return { ok: true };
  const p = m.approved && world ? rt.players[m.seat] : null;
  const protect = p && !online && rt.clock.started && !rt.clock.ended && !rt.clock.drop && rt.clock.dropUsed < MP.DROP_PAUSE.times;
  sys(online ? 'online' : protect ? 'dropPause' : 'offline', { member: actor, seat: m.seat }, (n, now) => {
    n.meta.members[actor].online = online;
    if (!p) return;
    const next = n.players[m.seat]; next.online = online;
    if (online) { next.offlineAt = null; next.hostAt = null; }
    else if (n.clock.started && !n.clock.ended) {
      next.offlineAt = now;
      if (protect) { n.clock.dropUsed++; n.clock.drop = { at: now, until: now + real(MP.DROP_PAUSE.s), seats: [] }; }
      if (n.clock.drop) {
        if (!n.clock.drop.seats.includes(m.seat)) n.clock.drop.seats.push(m.seat);
        next.hostAt = n.clock.drop.until;
      } else next.hostAt = now + real(MP.OFFLINE_S);
    }
  });
  if (p && online && world.companies[p.id].hosted) sys('unhost', { id: p.id });
  broadcastLobby();
  return { ok: true };
}
function start(actor) {
  hostOnly(actor);
  if (world) return roomCommand(actor, 'resume', {});
  const s = rt.meta.settings, people = Object.values(rt.meta.members).filter(m => m.approved).sort((a, b) => a.seat - b.seat);
  if (people.length !== s.humans || people.some((m, i) => m.seat !== i)) throw new Error('真人座位还没坐满');
  if (people.some(m => !m.ready)) throw new Error('还有人没有准备好');
  const cs = people.map(m => ({ name: m.company.name, brand: m.company.brand, country: m.company.country, kind: 'human', tier: s.tier }));
  // 电脑公司用和单人设置页同一份名单，和真人重名、重品牌的跳过。
  const taken = new Set(cs.flatMap(c => [c.name, c.brand]));
  for (const b of BOT_COMPANIES.filter(b => !taken.has(b.name) && !taken.has(b.brand)).slice(0, s.bots)) {
    cs.push({ name: b.name, brand: b.brand, country: ['CN', 'US', 'EU'][(cs.length - people.length) % 3], kind: 'bot', tier: s.tier, bot: s.bot });
  }
  // 分岔局：每个真人在公司资料里带上要接手的真实公司（pick），座位按入座顺序。
  const picks = people.map(m => m.company.pick);
  if (s.mode === 'fork' && (picks.some(x => !x) || new Set(picks).size !== picks.length)) throw new Error('分岔局每个真人都要选一家不同的公司接手');
  // 规则开关按世界认的字段名传（short、distill、protect），世界只记和默认不同的。
  const settings = { seed: s.seed, start: s.start, days: s.days, mp: true, poach: s.rules.poach,
    short: s.rules.short, distill: s.rules.distill, protect: s.rules.protectionDays,
    ...(s.mode === 'fork' ? { mode: 'fork', keep: s.keep, seats: picks, bot: s.bot } : { companies: cs }) };
  record('room', 'start', { settings }, n => {
    n.meta.phase = 'playing'; n.clock.started = true; n.clock.recovery = false;
  }, { seat: 0 });
  const actual = humans();
  if (actual.length !== s.humans || actual.some((c, i) => c.seat !== i)) {
    fatal = true; throw new Error('世界返回的真人座位不匹配，已停止开局');
  }
  bindWorld(); prevPub = clone(E.publicView(world));
  for (const [seat, p] of entries()) prevPriv.set(Number(seat), clone(stripPrivate(world.companies[p.id].s)));
  writeSnap(dir, world, logN, rt);
  maintain(true);
  for (const m of people) announceInit(m.id);
  broadcastLobby();
  return { ok: true, clock: clockInfo() };
}
function approve(actor, args) {
  hostOnly(actor);
  const id = args.member ?? args.memberId, m = member(id, false);
  if (m.approved) throw new Error('这个人已经入座了');
  if (rt.clock.ended) throw new Error('这一局已经结束了');
  let seat;
  if (!world) {
    const occupied = new Set(Object.values(rt.meta.members).filter(m => m.approved).map(m => m.seat));
    seat = args.seat ?? m.request?.seat ?? Array.from({ length: rt.meta.settings.humans }, (_, i) => i).find(i => !occupied.has(i));
    integer(seat, 0, rt.meta.settings.humans - 1, '座位号');
    if (occupied.has(seat)) throw new Error('这个座位已经有人了');
    record('room', 'approveSeat', { member: id, seat }, n => {
      Object.assign(n.meta.members[id], { seat, approved: true, ready: false });
    }, { seat: member(actor).seat });
  } else {
    const companyId = args.companyId ?? args.id ?? m.request?.companyId, c = world.companies[companyId];
    if (!c || c.kind !== 'bot') throw new Error('中途加入只能接管还在场的电脑公司');
    if (humans().length >= MP.SEATS[1]) throw new Error('真人座位已经达到上限了');
    // 日志先记接管意图，再按引擎实际返回的座位绑定；宕机恢复会完成尚未绑定的意图。
    sys('takeover', { id: c.id, member: id }, n => {
      n.pendingTakeover = { member: id, companyId: c.id };
    });
    const approval = completeTakeover();
    if (!approval.ok) return approval;
    seat = approval.seat;
    prevPriv.set(seat, clone(stripPrivate(world.companies[c.id].s)));
    refreshInbox(Date.now()); announceInit(id);
  }
  broadcastLobby();
  return { ok: true, member: id, seat };
}
function kick(actor, args) {
  hostOnly(actor);
  const id = args.member ?? args.memberId ?? Object.values(rt.meta.members).find(m => m.seat === args.seat)?.id;
  const m = member(id, false);
  if (id === rt.meta.host) throw new Error('房主不能把自己踢出去');
  const remove = n => {
    delete n.meta.members[id];
    for (const [hash, owner] of Object.entries(n.meta.tokens)) if (owner === id) delete n.meta.tokens[hash];
    if (world && m.approved) Object.assign(n.players[m.seat], { online: false, kicked: true, hostAt: null });
  };
  if (world && m.approved && !world.companies[rt.players[m.seat].id].hosted)
    sys('host', { id: rt.players[m.seat].id, kicked: id }, remove);
  else record('room', 'kick', { member: id }, remove, { seat: member(actor).seat });
  broadcastLobby();
  return { ok: true };
}
function roomCommand(actor, name, args = {}) {
  if (!object(args)) throw new Error('命令参数要是一个对象');
  const m = member(actor, name !== 'chat'), host = actor === rt.meta.host;
  if (name === 'start') return start(actor);
  if (name === 'approveSeat') return approve(actor, args);
  if (name === 'kick') return kick(actor, args);
  if (name === 'settings') {
    hostOnly(actor);
    if (world) throw new Error('开局以后不能修改这些设置');
    const settings = normalizeSettings(args.settings ?? args, rt.meta.settings);
    if (Object.values(rt.meta.members).some(m => m.approved && m.seat >= settings.humans)) throw new Error('请先腾出多出来的真人座位');
    record('room', name, { settings }, n => {
      n.meta.settings = settings; n.clock.speedMax = settings.speedMax;
      for (const p of Object.values(n.meta.members)) p.ready = false;
    }, { seat: m.seat });
    broadcastLobby(); return { ok: true, settings };
  }
  if (name === 'setCompany' || name === 'ready') {
    if (world) throw new Error('公司资料要在开局前设置');
    if (args.ready !== undefined && typeof args.ready !== 'boolean') throw new Error('准备状态只能填 true 或 false');
    const c = company(args.company ?? args, m.company);
    record('room', name, { company: c, ready: args.ready ?? true }, n => {
      n.meta.members[actor].company = c;
      if (name === 'ready') n.meta.members[actor].ready = args.ready ?? true;
      else n.meta.members[actor].ready = false;
    }, { seat: m.seat });
    broadcastLobby(); return { ok: true };
  }
  if (name === 'chat') {
    const message = { seat: m.approved ? m.seat : null, member: actor,
      name: world && m.approved ? world.companies[rt.players[m.seat].id].name : m.company.name,
      text: text(args.text, '聊天内容'), day: world?.day ?? null };
    record('room', name, message, null, { seat: m.seat }); emitAll('chat', message);
    return { ok: true };
  }
  if (name === 'save') {
    hostOnly(actor); record('room', name, {}, null, { seat: m.seat });
    const file = writeSnap(dir, world, logN, rt); return { ok: true, file, logN };
  }
  if (name === 'speed') {
    hostOnly(actor); const value = integer(args.speed, 0, 3, '速度上限');
    record('room', name, { speed: value }, n => { n.clock.speedMax = value; n.meta.settings.speedMax = value; }, { seat: m.seat });
    broadcastLobby(); return { ok: true, clock: clockInfo() };
  }
  if (!world) throw new Error('房主还没有开局');
  if (rt.clock.ended) throw new Error('这一局已经结束了');
  const p = rt.players[m.seat];
  if (!p || p.kicked) throw new Error('座位已经失效了');
  if (name === 'vote') {
    const vote = integer(args.speed, 0, 3, '速度档');
    record('room', name, { speed: vote }, n => { n.players[m.seat].vote = vote; }, { seat: m.seat });
  } else if (name === 'pause') {
    if (!rt.clock.started) throw new Error('还没有开始计时');
    if (rt.clock.pause?.voters.includes(m.seat)) return { ok: true, clock: clockInfo() };
    resetYear();
    if (!host && rt.players[m.seat].pauseUses >= (rt.meta.settings.pauses ?? MP.PAUSES)) throw new Error('你这一年的暂停次数用完了');
    record('room', name, {}, (n, now) => {
      if (!host) n.players[m.seat].pauseUses++;
      n.clock.pause ??= { owner: m.seat, voters: [], at: now, until: now + real(MP.PAUSE_S), all: false };
      n.clock.pause.voters.push(m.seat);
    }, { seat: m.seat });
    reconcilePause(Date.now());
  } else if (name === 'resume') {
    if ((!rt.clock.started || rt.clock.recovery) && !host) throw new Error('请等房主继续');
    const pause = rt.clock.pause;
    if (pause && pause.owner !== m.seat && Date.now() < pause.at + real(MP.RESUME_S)) throw new Error('暂停满 30 秒后才能替别人继续');
    record('room', name, {}, (n, now) => {
      n.clock.started = true; n.clock.pause = null;
      if (host) n.clock.recovery = false;
      for (const p of Object.values(n.players)) if (!p.online && !p.kicked && p.offlineAt === null) { p.offlineAt = now; p.hostAt = now + real(MP.OFFLINE_S); }
    }, { seat: m.seat });
  } else throw new Error(`没有这个房间命令：${String(name)}`);
  return { ok: true, clock: clockInfo() };
}
function command(actor, body) {
  const m = member(actor);
  if (!object(body)) throw new Error('命令必须是一个对象');
  if (body.v !== PROTOCOL_V) return { ok: false, seq: body.seq ?? null, err: `协议版本不对，这里只认 v${PROTOCOL_V}` };
  if (!Number.isInteger(body.seq) || body.seq < 0) return { ok: false, seq: null, err: 'seq 要是非负整数' };
  const memo = results.get(m.seat) ?? new Map(); results.set(m.seat, memo);
  if (memo.has(body.seq)) return memo.get(body.seq);
  if (!world) throw new Error('房主还没有开局');
  if (rt.clock.ended) throw new Error('这一局已经结束了');
  const p = rt.players[m.seat];
  if (world.companies[p.id].hosted) throw new Error('公司正在托管，请先连上房间');
  if (typeof body.name !== 'string' || !object(body.args ?? {})) throw new Error('命令名字或参数不对');
  let r;
  const beforeHash = world.hash();
  try { r = E.applyNow(world, p.id, { name: body.name, args: body.args ?? {} }); }
  catch (error) {
    if (world.hash() !== beforeHash) { fatal = true; throw error; }
    r = { ok: false, err: '这条命令的参数不对，请检查后再试' };
  }
  // 结果原样回给本人（界面拿它写提示，比如“借到多少”“送评几天”）；太大或不能转 JSON 的就不带。
  const response = r.ok ? { ok: true, seq: body.seq, day: world.day, ...resultOf(r.result) } : { ok: false, seq: body.seq, err: r.err };
  // applyNow 保证拒绝时不改世界；成功后先持久化，才向玩家确认和推差分。
  if (r.ok) record('cmd', body.name, body.args ?? {}, null, { seat: m.seat, id: p.id, cseq: body.seq }, false);
  memo.set(body.seq, response); if (memo.size > 256) memo.delete(memo.keys().next().value);
  if (r.ok) flushPrivate(m.seat, body.seq);
  return response;
}
function resultOf(x) {
  if (x === undefined || x === null) return {};
  try { const t = JSON.stringify(x); return t.length <= 64 * 1024 ? { result: JSON.parse(t) } : {}; } catch { return {}; }
}
const percentile = (a, q) => a.length ? [...a].sort((a, b) => a - b)[Math.min(a.length - 1, Math.floor(q * a.length))] : null;
function status() {
  return { ...clockInfo(), phase: rt.meta.phase, hash: world?.hash() ?? null,
    seats: world ? humans().length : rt.meta.settings.humans, companies: Object.keys(world?.companies ?? {}).length,
    p50: percentile(dayMs, 0.5), p99: percentile(dayMs, 0.99), tickP99: percentile(tickMsList, 0.99),
    diffP99: percentile(diffMsList, 0.99), snapMax: snapMs.length ? Math.max(...snapMs) : null, days: dayMs.length, logN };
}
parentPort.on('message', msg => {
  if (fatal) return post({ t: 'res', id: msg.id, res: { ok: false, err: '房间已停止，请联系房主' } });
  try {
    const before = world ? `${paused()}:${speed()}` : '';
    let res;
    if (msg.t === 'join') res = join(msg);
    else if (msg.t === 'presence') res = presence(msg.actor, msg.online === true);
    else if (msg.t === 'cmd') res = command(msg.actor, msg.body);
    else if (msg.t === 'room') res = roomCommand(msg.actor, msg.name, msg.args ?? {});
    else if (msg.t === 'init') res = initFor(msg.actor);
    else if (msg.t === 'status') res = status();
    else if (msg.t === 'stop') { clearTimeout(tickTimer); clearTimeout(maintenanceTimer); post({ t: 'res', id: msg.id, res: { ok: true } }); return; }
    else throw new Error('没有这个服务器操作');
    if (!['status', 'init'].includes(msg.t)) {
      // 收件箱按签名判断变没变，这里不必强推给每个座位（每条命令都强推，2 档下行会超标）。
      try { maintain(); schedule(world && before !== `${paused()}:${speed()}`); }
      catch (error) { fatal = true; throw error; }
      if (res?.clock) res.clock = clockInfo();
    }
    post({ t: 'res', id: msg.id, res });
  } catch (error) {
    if (fatal) { post({ t: 'fatal', err: error.message }); clearTimeout(tickTimer); clearTimeout(maintenanceTimer); }
    post({ t: 'res', id: msg.id, res: { ok: false, err: error?.message ?? '服务器出错了' } });
  }
});
post({ t: 'ready', meta: rt.meta, seats: world ? humans().length : rt.meta.settings.humans, day: world?.day ?? null });
pulse();
