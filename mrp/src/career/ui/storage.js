export { practiceKind, exitPractice } from './practice_context.js';
// 本地存储：存档和名人堂。浏览器关了存储（隐私模式）时读写都悄悄失败，不报错。
// 存档键 mrp.sim.v2 是存储位置，存档里的 s.v 是结构版本，两回事（规格 E8）。
// 读档只有一个入口 safeLoadState(json)：纯函数，不碰浏览器存储，什么输入都不抛错，读不了就说明原因。
// boot、标题页、“继续”、设置页导入四处共用它；readSaved() 是它在浏览器存储上的只读包装；旧 schema 明确拒绝，不升级或覆盖原文。
import { migrateGame, validateGame, SAVE_VERSION, WORLD_SAVE_VERSION, serialize, migrateWorld, storage as worldStorage, assertPostPlanSaveBoundary } from '../engine.js';

export { previewWorld } from '../engine.js';

export const SAVE_KEY = 'mrp.sim.v2';
export const HOF_KEY = 'mrp.sim.hof.v2';
// 自洽世界的标题页摘要（IndexedDB 的读是异步的，标题页先读这份小的同步摘要）。
export const WORLD_META_KEY = 'mrp.world.meta.v1';
// 离开自洽世界、要重新载入到标题页时留一个一次性标记（sessionStorage，关掉标签页就没了）。
export const WORLD_LEAVE_KEY = 'mrp.world.leave.v1';
// 最后玩的是哪种局（'world' | 'history'）：刷新页面时接着玩它，不会从自洽世界掉进另一份史实存档。
export const LAST_KIND_KEY = 'mrp.last.kind.v1';
export const markLastKind = kind => { try { store(LAST_KIND_KEY, kind); } catch { /* 存不了就按老规矩：史实局优先 */ } };
export const lastKind = () => { const k = load(LAST_KIND_KEY); return k === 'world' || k === 'history' ? k : null; };
export const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 隐私模式 */ } };
export const load = k => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
export const drop = k => { try { localStorage.removeItem(k); } catch { /* ignore */ } };
// 原文读写（不经过 JSON）：导入确认和原文导出用。读不到是 null，写不进去是 false。
export const getRaw = k => { try { return localStorage.getItem(k); } catch { return null; } };
export const setRaw = (k, text) => { try { localStorage.setItem(k, text); return true; } catch { return false; } };

// Product continue/import preflight only. It runs before migrateWorld can install
// a Provider. Raw engine/world loaders still serve MP and non-product tooling.
export function preflightSoloPostPlanSave(json) {
  try {
    let raw = json;
    if (typeof json === 'string') {
      try { raw = JSON.parse(json); } catch { return { ok: false, reason: '存档文字不是有效的 JSON，可能被截断或改坏了', notes: [] }; }
    }
    let s = raw;
    if (raw?.kind === 'world') {
      if (raw.settings?.mp || raw.world?.settings?.mp) throw Error('联机存档不能作为单人局继续或导入');
      if (!Number.isInteger(raw.v) || raw.v !== WORLD_SAVE_VERSION) throw Error(`不支持旧版或未知世界存档；当前只接受 v${WORLD_SAVE_VERSION}，请新开一局，原档未改变`);
      const companies = raw.world?.companies || {};
      const id = raw.world?.settings?.you;
      s = (raw.companies || []).find(c => c?.s?.charId === id)?.s;
      if (!id || companies[id]?.kind !== 'human' || !s) throw Error('单机存档缺少玩家公司');
    }
    if (!Number.isInteger(s?.v) || s.v !== SAVE_VERSION) throw Error(`不支持旧版或未知存档；当前只接受 v${SAVE_VERSION}，请新开一局，原档未改变`);
    if (!['llm', 'image', 'music', 'speech'].includes(s?.mod) || s.company?.modality !== s.mod) throw Error('存档缺少有效且一致的模型模态，原档未改变');
    if (s.postPlanSessions === undefined) throw Error('单机存档缺少当前卡牌方案，请新开一局；原档未改变');
    assertPostPlanSaveBoundary(s);
    return { ok: true };
  } catch (e) { return { ok: false, reason: String(e?.message || e), notes: [] }; }
}

// 只接受当前 schema，不迁移、不补字段；输入对象与浏览器原文均保持不变。
// → { ok: true, s, notes } | { ok: false, reason, notes, empty? }
export function safeLoadState(json) {
  try {
    if (json === undefined || json === null || json === '') return { ok: false, empty: true, reason: '没有存档', notes: [] };
    let raw = json;
    if (typeof json === 'string') {
      try { raw = JSON.parse(json); } catch { return { ok: false, reason: '存档文字不是有效的 JSON，可能被截断或改坏了', notes: [] }; }
    }
    if (!Number.isInteger(raw?.v) || raw.v !== SAVE_VERSION) return { ok: false, reason: `不支持旧版或未知存档；当前只接受 v${SAVE_VERSION}，请新开一局，原档未改变`, notes: [] };
    assertPostPlanSaveBoundary(raw);
    const r = migrateGame(raw);
    if (!r || !r.ok) return { ok: false, reason: String(r?.reason || '读不了这份存档'), notes: Array.isArray(r?.notes) ? r.notes : [] };
    if (!validateGame(r.s)) return { ok: false, reason: '读进来的存档没通过结构检查', notes: r.notes || [] };
    return { ok: true, s: r.s, notes: r.notes || [] };
  } catch (e) {
    return { ok: false, reason: `读档时出错：${e?.message || e}`, notes: [] };
  }
}

// 读浏览器里的当前存档。仅返回原文和校验结果，不写备份、不迁移、不删除失败原档。
export function readSaved() {
  const raw = getRaw(SAVE_KEY);
  if (raw === null) return { ok: false, empty: true, reason: '没有存档', notes: [], raw: null };
  const check = preflightSoloPostPlanSave(raw);
  const r = check.ok ? safeLoadState(raw) : check;
  return { ...r, raw };
}

// ---------- 存档种类分发（史实局 / 自洽世界） ----------
// 认出这份存档是哪一种，读之前先分流：world 走 migrateWorld，其余走 safeLoadState。
// 认得的是“看起来像”的壳：world 看 kind === 'world'，史实局看有没有 charId；认不出返回 'unknown'。
export function saveKind(json) {
  let raw = json;
  if (typeof json === 'string') {
    try { raw = JSON.parse(json); } catch { return 'broken'; }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'unknown';
  if (raw.kind === 'world') return 'world';
  if (typeof raw.charId === 'string' && raw.charId) return 'history';
  return 'unknown';
}

// 自洽世界的标题页摘要：公司、日期、存档方式。没有世界存档时返回 null。
export function readWorldMeta() {
  const meta = load(WORLD_META_KEY);
  return meta && typeof meta === 'object' && meta.company && meta.date ? meta : null;
}
export const dropWorldMeta = () => drop(WORLD_META_KEY);

const playerOf = world => {
  const id = world?.settings?.you;
  return id && world.companies?.[id]?.kind === 'human' && world.companies[id].s ? id : null;
};

// 写自洽世界存档（IndexedDB，退回 localStorage；由 world/save.js 的 storage() 实现）。
// 失败时返回中文原因，不再像史实局那样悄悄忽略；调用方负责把它显示出来。
export async function saveWorld(world) {
  try {
    const text = serialize(world);
    const out = await worldStorage().save(text);
    const pid = playerOf(world);
    const s = pid ? world.companies[pid].s : null;
    store(WORLD_META_KEY, {
      kind: 'world', company: s?.company?.company || '我的公司', date: s?.day || world.day,
      dateMonth: String(s?.day || world.day || '').slice(0, 7), playerId: pid,
      mode: world.mode, start: world.start, end: world.end, savedAt: Date.now(), via: out?.kind || 'unknown',
    });
    markLastKind('world');
    return { ok: true, kind: out?.kind || 'unknown' };
  } catch (e) {
    return { ok: false, reason: `自洽世界存档没有写成：${e?.message || e}` };
  }
}

// 读自洽世界存档：storage().load() → migrateWorld（永不抛错）→ 找出玩家那一家。
export async function loadWorld() {
  try {
    const text = await worldStorage().load();
    if (!text) return { ok: false, empty: true, reason: '没有自洽世界存档', notes: [] };
    const check = preflightSoloPostPlanSave(text);
    if (!check.ok) return check;
    const r = migrateWorld(text);
    if (!r?.ok) return { ok: false, reason: String(r?.reason || '读不了这份自洽世界存档'), notes: Array.isArray(r?.notes) ? r.notes : [] };
    const world = r.world;
    const pid = playerOf(world);
    if (!pid) return { ok: false, reason: '自洽世界存档里找不到你经营的那家公司', notes: [] };
    return { ok: true, world, s: world.companies[pid].s, playerId: pid, notes: Array.isArray(r.notes) ? r.notes : [] };
  } catch (e) {
    return { ok: false, reason: `读自洽世界存档时出错：${e?.message || e}`, notes: [] };
  }
}

export async function dropWorld() {
  try { await worldStorage().remove(); } catch { /* 删不掉也不影响读档失败后的提示 */ }
  dropWorldMeta();
}

// 离开自洽世界：同一个标签页里下一次启动直接回标题页，不自动接着玩。
export function markWorldLeave() {
  try { globalThis.sessionStorage?.setItem(WORLD_LEAVE_KEY, '1'); } catch { globalThis.__mrpWorldLeave = true; }
}
export function takeWorldLeave() {
  let hit = false;
  try { hit = globalThis.sessionStorage?.getItem(WORLD_LEAVE_KEY) === '1'; globalThis.sessionStorage?.removeItem(WORLD_LEAVE_KEY); } catch { /* 隐私模式 */ }
  if (globalThis.__mrpWorldLeave) { hit = true; globalThis.__mrpWorldLeave = false; }
  return hit;
}

// 让浏览器下载一个文本文件（导出存档用）。
export function downloadText(filename, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
