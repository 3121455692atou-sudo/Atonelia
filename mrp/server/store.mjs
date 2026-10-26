import {validateAutomationSetup,applyAutomationSetup} from './automation_setup.mjs';
import { validateSimulationRulesStart, validateSimulationRulesRuntime, markWorldSimulationRules, validateWorldSimulationRules, validateSimulationRulesSnapshot } from './simulation_rules.mjs';
import { validateInitialMethodsStart, validateInitialMethodsRuntime, markWorldInitialMethods, validateWorldInitialMethods, validateInitialMethodsSnapshot } from './initial_methods.mjs';
import { validatePostTrainingRule, validatePostTrainingStart, enableWorldPostTraining, validateWorldPostTraining, validatePostTrainingSnapshot } from './post_training.mjs';
// 联机存档：先把操作写入日志，再改世界；快照是可丢弃的加速层。
// 每个目录只有房间 worker 写入，主线程只通过 worker 修改 meta，避免两个写入者互相覆盖。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as E from '../src/career/engine.js';
import { autoResolve, setHosted, takeover } from '../src/career/world/index.js';

export const roomDir = (base, room) => path.join(base, room);
export function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); return dir; }

function syncDir(dir) {
  // rename 落盘后再同步目录，避免断电只留下临时文件。
  let fd;
  try { fd = fs.openSync(dir, 'r'); fs.fsyncSync(fd); }
  catch (e) { if (!['EINVAL', 'ENOTSUP', 'EISDIR', 'EPERM', 'EACCES'].includes(e.code)) throw e; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}
function atomicFile(dir, name, data) {
  ensureDir(dir);
  const tmp = path.join(dir, `${name}.tmp`);
  const fd = fs.openSync(tmp, 'w', 0o600);
  try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(tmp, path.join(dir, name));
  syncDir(dir);
}
export function writeMeta(dir, meta) { atomicFile(dir, 'meta.json', JSON.stringify(meta)); }
export function readMeta(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw new Error(`房间资料读不了：${e.message}`); }
}

// 只有完整换行才算一条提交。尾巴可能被 kill -9 截断，中间坏行不能悄悄跳过。
export function readLog(dir, { repair = false } = {}) {
  const file = path.join(dir, 'log.ndjson');
  let bytes;
  try { bytes = fs.readFileSync(file); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  const end = bytes.lastIndexOf(10) + 1;
  const out = [];
  for (const line of bytes.subarray(0, end).toString('utf8').split('\n')) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); }
    catch { throw new Error(`日志第 ${out.length + 1} 条坏了，不能继续恢复`); }
    if (!e || typeof e !== 'object' || Array.isArray(e)) throw new Error('日志里有不是对象的记录');
    if (e.n !== undefined && e.n !== out.length + 1) throw new Error('日志序号不连续，不能继续恢复');
    out.push(e);
  }
  if (repair && end !== bytes.length) {
    const fd = fs.openSync(file, 'r+');
    try { fs.ftruncateSync(fd, end); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
  }
  return out;
}

const writers = new Map();
export function appendLog(dir, entry, n) {
  const file = path.resolve(dir, 'log.ndjson');
  // 首次写入先切掉半行，否则下一条 JSON 会接在残片后面，之后所有记录都读不到。
  if (!writers.has(file)) writers.set(file, readLog(dir, { repair: true }).length);
  if (!Number.isInteger(n) || n !== writers.get(file)) throw new Error('日志写入序号不一致');
  const fd = fs.openSync(file, 'a', 0o600);
  try {
    fs.writeFileSync(fd, `${JSON.stringify({ ...entry, n: n + 1 })}\n`);
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  if (n === 0) syncDir(dir);
  writers.set(file, n + 1);
  return n + 1;
}

// runtime 存座位、投票、暂停计数和计时账本；没有世界的大厅也能拍快照。
export function writeSnap(dir, world, logN, runtime = null, { preserve = false } = {}) {
  const body = { logN, day: world?.day ?? null, text: world ? E.serialize(world) : null, runtime };
  const name = `snap-${String(logN).padStart(9, '0')}.json.gz`;
  atomicFile(dir, name, zlib.gzipSync(JSON.stringify(body)));
  if (!preserve) prune(dir);
  return name;
}
export function listSnaps(dir) {
  try { return fs.readdirSync(dir).filter(f => /^snap-\d+\.json\.gz$/.test(f)).sort((a, b) => Number(a.slice(5, -8)) - Number(b.slice(5, -8))); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}
export function readSnap(dir, name) {
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, name))).toString('utf8'));
}
function prune(dir) {
  const snaps = listSnaps(dir);
  if (snaps.length <= 3) return;
  const keep = new Set([snaps[0], ...snaps.slice(-3)]), years = new Set();
  let firstWorld = false;
  for (const name of snaps) {
    let snap;
    try { snap = readSnap(dir, name); } catch { continue; }
    if (snap.text === null) continue;
    if (!firstWorld) { keep.add(name); firstWorld = true; }
    const year = String(snap.day).slice(0, 4);
    if (!years.has(year)) { keep.add(name); years.add(year); }
  }
  for (const name of snaps) if (!keep.has(name)) {
    try { fs.unlinkSync(path.join(dir, name)); } catch { /* 清理失败不影响已经提交的快照。 */ }
  }
}

function onDay(world, e) {
  if (!world) throw new Error('日志需要世界，但这一局还没开局');
  if (e.day !== undefined && e.day !== null && world.day !== e.day)
    throw new Error(`重放走岔：记录在 ${e.day}，世界在 ${world.day}`);
}

// 返回世界以支持从大厅日志恢复开局；已有世界时仍返回同一对象。
export function replayEntry(world, e) {
  const isStart = e.t === 'room' && ['start', 'room.start'].includes(e.name);
  // Direct CLI replay must not bypass preflight by omitting settings or passing
  // an already-created world. Validate before any world / Provider mutation.
  if (isStart) {
    validateAutomationSetup(e.args);
    validatePostTrainingStart(e.args);
    validateInitialMethodsStart(e.args);
    validateSimulationRulesStart(e.args);
    if (world) validateWorldSimulationRules(world);
  }
  if (Object.hasOwn(e, 'state') || (e.t === 'room' && ['create', 'start', 'room.start'].includes(e.name))) validateSimulationRulesRuntime(e.state);
  if (isStart && !world) {
    const created=E.createWorld({ ...e.args.settings, mp: true, endVersion: e.args.endVersion, autoPostVersion: e.args.autoPostVersion, automationVersion: e.args.automationVersion });
    return applyAutomationSetup(enableWorldPostTraining(markWorldSimulationRules(markWorldInitialMethods(created)),e.args.postTrainingSeed),e.args);
  }
  if (e.t === 'cmd') {
    onDay(world, e);
    const r = E.applyNow(world, e.id, { name: e.name, args: e.args ?? {} });
    if (!r.ok) throw new Error(`重放命令被拒绝：${r.err}`);
  } else if (e.t === 'tick') {
    onDay(world, e);
    world.tick();
  } else if (e.t === 'sys') {
    const name = e.name.startsWith('sys.') ? e.name : `sys.${e.name}`;
    if (['sys.autoResolve', 'sys.host', 'sys.unhost', 'sys.takeover'].includes(name)) {
      onDay(world, e);
      const args = e.args ?? {};
      if (!Object.hasOwn(world.companies, args.id)) throw new Error('系统日志指向不存在的公司');
      if (name === 'sys.autoResolve') autoResolve(world, args.id, args.at);
      else if (name === 'sys.host' || name === 'sys.unhost') setHosted(world, args.id, name === 'sys.host');
      else {
        // 出局公司可能仍留在表里；引擎拒绝且未改世界时，这条意图是可重放的空操作。
        const before = world.hash();
        let seat;
        try { seat = takeover(world, args.id); }
        catch (error) { if (world.hash() !== before) throw error; return world; }
        if (!Number.isInteger(seat) || seat < 0) {
          if (world.hash() !== before) throw new Error('接管改变了世界，却没有返回有效座位');
          return world;
        }
        if (args.seat !== undefined && args.seat !== seat) throw new Error('接管后的座位与日志不一致');
      }
    }
    // 纯时钟记录不改世界，runtime 则按 e.state 恢复；重放不读 Date.now()。
  } else if (e.t === 'hash') {
    onDay(world, e);
    const h = world.hash();
    if (h !== e.h) throw new Error(`重放走岔：${e.day} 的哈希是 ${h}，日志里记的是 ${e.h}`);
  }
  return world;
}

export function rebuild(dir, { fromStart = false, repair = true } = {}) {
  const log = readLog(dir, { repair: false });
  const start=log.find(e=>e.t==='room'&&['start','room.start'].includes(e.name));
  if(start) validatePostTrainingStart(start.args);
  // Preflight every persisted runtime/start before creating or installing a world.
  // This includes unstarted lobbies; no old record is silently upgraded on recovery.
  for (const e of log) {
    if (e.t === 'room' && ['start', 'room.start'].includes(e.name)) {
      validateInitialMethodsStart(e.args);
      validateSimulationRulesStart(e.args);
    }
    if (Object.hasOwn(e, 'state') || (e.t === 'room' && ['create', 'start', 'room.start'].includes(e.name))) {
      validateInitialMethodsRuntime(e.state);
      validateSimulationRulesRuntime(e.state);
    }
  }
  const snaps = listSnaps(dir);
  let selected = null;
  // 最近快照损坏时退回上一份；日志损坏仍然报错，不能跳过已提交操作。
  const candidates = fromStart ? snaps : [...snaps].reverse();
  for (const name of candidates) {
    try {
      const snap = readSnap(dir, name);
      if (!Number.isInteger(snap.logN) || snap.logN < 0 || snap.logN > log.length) continue;
      if (fromStart && snap.text === null) { selected ??= snap; continue; }
      selected = snap;
      break;
    } catch { /* 再试下一份完整快照。 */ }
  }
  if (!selected && !log.length) throw new Error('这一局没有可恢复的快照或日志');
  let world = null, runtime = selected?.runtime ?? null;
  if (selected) { validateInitialMethodsRuntime(selected.runtime); validateSimulationRulesRuntime(selected.runtime); }
  if (selected?.text !== null && selected?.text !== undefined) {
    const raw = E.deserialize(selected.text);
    validatePostTrainingSnapshot(raw);
    validateInitialMethodsSnapshot(raw);
    validateSimulationRulesSnapshot(raw);
    if (!start) throw Error('联机快照缺少初始研究开局版本日志；原存档保留');
    const m = E.migrateWorld(selected.text);
    if (!m.ok) throw new Error(`快照读不了：${m.reason ?? m.err ?? '格式不对'}`);
    world = m.world;
  }
  for (let i = selected?.logN ?? 0; i < log.length; i++) {
    world = replayEntry(world, log[i]);
    if (Object.hasOwn(log[i], 'state')) runtime = log[i].state;
    // tick 的已记录时间也是降速账本的检查点，停机后的现实时间不补算额度。
    if (runtime && Number.isFinite(log[i].at)) runtime.wall = Math.max(runtime.wall ?? 0, log[i].at);
  }
  if(world) {
    validateWorldPostTraining(world);
    validateWorldInitialMethods(world);
    validateWorldSimulationRules(world);
    if(!start || world.postTrainingSeed!==start.args.postTrainingSeed)throw Error('联机后训练快照与开局随机种子不一致；原存档保留');
  }
  if(repair) readLog(dir,{repair:true});
  return { world, logN: log.length, runtime };
}
