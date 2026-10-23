// 世界存档（规格 E8）：纯函数 serialize/deserialize，读档 migrateWorld 永不抛错。
// 存储适配层 storage() 只在浏览器里跑：IndexedDB 库 mrp、表 worlds，主档加备份各一份，gzip 压缩；
// IndexedDB 不可用时退回 localStorage（gzip + base64），主档加备份超过约 1.5MB 就明确报错，不静默吞掉。
// 这个文件必须能在 Node 里导入：测到 indexedDB / localStorage 不存在时安静跳过。
import { COMPANY_BY_ID, dimKeys } from '../data/core.js';
import { RELEASES, setReleases } from '../data/rivals.js';
import { setProvider, HistoryProvider, companiesSnapshot, restoreCompanies, registerCompany } from '../sim/provider.js';
import { migrateGame } from '../sim/migrate.js';
import { projectSota } from './label.js';
import { SimProvider, ensureAcademiaFamily } from './sim_provider.js';
import { attachWorld } from './index.js';

export const WORLD_SAVE_VERSION = 1;
// 世界特性步骤（E8 第 6 步）。M1 还没有世界级的迁移，留空表；M2 以后按需要往里加。
export const FEATURES_WORLD = [];

const clone = x => JSON.parse(JSON.stringify(x ?? null));

// RELEASES 当前内容的原始行快照：回滚时用它把发布表换回史实（数组身份由 setReleases 重建）。
function releaseRows() {
  return RELEASES.map(r => [
    r.family, r.date, r.name, r.cls, r.open ? 1 : 0,
    dimKeys(r.mod).map(k => r.dims?.[k] ?? 0), r.price, (r.tags || []).join(','),
  ]);
}

// 存档：{ kind: 'world', v, engine, settings, world, companies: [{ spec, s }], seed }。
// 纯函数：只读状态，不碰模块单例。state 可以是 world，也可以是 { world, engine }。
export function serialize(state) {
  const world = state?.world ?? state;
  if (!world || typeof world !== 'object') throw new Error('没有可存档的世界');
  const w = clone(world);
  const companies = [];
  for (const c of Object.values(world.companies || {})) {
    if (!c?.s) continue;
    // 自定义公司的 spec 在 s.company 里（带 custom: true）；真实公司没有 spec。
    const spec = c.s.company?.custom === true ? clone(c.s.company) : null;
    companies.push({ spec, s: clone(c.s) });
    delete w.companies[c.id]?.s;
  }
  return JSON.stringify({
    kind: 'world', v: WORLD_SAVE_VERSION,
    engine: String(state?.engine ?? world.engine ?? 'unknown'),
    settings: clone(world.settings || {}),
    world: w,
    companies,
    seed: world.seed,
  });
}

export function deserialize(text) {
  return JSON.parse(String(text));
}

const bad = (reason, notes = []) => ({ ok: false, reason, notes });
// 两份设定是否一样（键的先后不算）。
const stableJson = v => (Array.isArray(v) ? `[${v.map(stableJson).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}` : JSON.stringify(v));
const sameJson = (a, b) => stableJson(a) === stableJson(b);

// 模块加载时的史实快照：读坏档以后一律回到这里（PLAYABLE 只有 24 家、RELEASES 是原表、Provider 是史实）。
const HISTORY_SNAP = companiesSnapshot();
const HISTORY_ROWS = releaseRows();

// 读档（E8 第 1–7 步），永不抛错。任何一步失败都恢复单例快照、换回 HistoryProvider，返回中文原因。
export function migrateWorld(raw) {
  // 失败一律回到模块加载时的史实状态（E8：换回 HistoryProvider）。
  const fail = reason => {
    restoreCompanies(HISTORY_SNAP);
    setReleases(HISTORY_ROWS);
    setProvider(new HistoryProvider());
    return bad(reason);
  };
  let doc = raw;
  try { if (typeof doc === 'string') doc = deserialize(doc); } catch (e) { return fail(`存档不是合法的 JSON：${e.message}`); }

  // 1) 形状检查。
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return fail('世界存档不是一个对象');
  if (doc.kind !== 'world') return fail('这不是世界存档（kind 不是 world）');
  if (Number(doc.v) !== WORLD_SAVE_VERSION) return fail(`世界存档版本不对：v${doc.v}，这一版只认 v${WORLD_SAVE_VERSION}`);
  const world = doc.world;
  if (!world || typeof world !== 'object') return fail('世界存档里没有世界状态');
  if (typeof world.day !== 'string' || typeof world.startDay !== 'string') return fail('世界存档里没有开局日或当前日期');
  if (!Array.isArray(world.rels)) return fail('世界存档里没有发布表（rels）');
  if (!world.companies || typeof world.companies !== 'object') return fail('世界存档里没有公司表');
  if (!Array.isArray(doc.companies)) return fail('世界存档里没有各家的状态');
  if (Number(world.ver) !== world.rels.length) return fail(`世界存档的发布表版本不对：ver ${world.ver}，rels ${world.rels.length} 条`);

  try {
    // JSON 会把共享引用拆成两份：算力账本的 entries 和 byKey 必须指回同一批对象，否则季末结算会走岔。
    if (Array.isArray(world.supply?.entries)) world.supply.byKey = Object.fromEntries(world.supply.entries.map(e => [e.wKey, e]));
    // 4) 逐家 registerCompany（幂等；同 id 不同 spec 由 registerCompany 报坏档），学界也登记上。
    //    要排在换发布表之前：世界表里有学界行和自定义公司发布的行，setReleases 要按家族查模态。
    //    （刷新页面以后直接读档，这个进程里从没开过世界，学界和自定义公司都还没登记。）
    ensureAcademiaFamily();
    for (const ent of doc.companies) {
      if (!ent || typeof ent !== 'object' || !ent.s) return fail('世界存档里有一家公司没有状态');
      if (ent.spec) {
        // 存档里同一家公司的设定存了两份（外层 spec 和 s.company），对不上就是坏档；不能只靠登记表查重，
        // 因为前一次读坏档失败会把登记表恢复成史实状态。
        if (ent.s.company?.custom && sameJson(ent.spec, ent.s.company) === false) return fail(`存档损坏：${ent.spec.id ?? '?'} 的公司设定前后对不上`);
        try { registerCompany(ent.spec); } catch (e) { return fail(`公司登记失败：${e.message}`); }
      } else if (!Object.hasOwn(COMPANY_BY_ID, ent.s.charId)) {
        return fail(`存档里的公司认不出来：${String(ent.s.charId)}`);
      }
    }

    // 3) 用存档建 SimProvider：发布表换成世界表（分岔局的前人遗产也在 rels 里）。
    setReleases(world.rels);
    const provider = new SimProvider(world);
    setProvider(provider);

    // 5) 每家的 s 走 migrateGame。P() 已经是 SimProvider。
    const migrated = new Map();
    for (const ent of doc.companies) {
      const r = migrateGame(ent.s);
      if (!r.ok) return fail(`第 ${ent.s?.charId ?? '?'} 家读档失败：${r.reason}`);
      migrated.set(r.s.charId, r.s);
    }
    for (const c of Object.values(world.companies)) {
      if (!c) continue;
      if (migrated.has(c.id)) c.s = migrated.get(c.id);
      else if (!c.frozen) return fail(`世界存档里缺了 ${c.id} 的状态`);
      else c.s = null;
    }
    // 存档里多出来、但世界表里没有的公司：补一条最小元数据，免得后面的循环读不到。
    for (const [id, s] of migrated) {
      if (world.companies[id]) continue;
      world.companies[id] = {
        id, name: s.company.company, brand: s.company.name, series: [], org: s.company.org,
        country: s.company.country, tier0: s.company.tier, kind: 'human', seat: null, bot: 'normal',
        joined: world.startDay, frozen: false, s, decideAt: s.day, lastSeq: 0, thinks: 0, thinkDays: [],
        seen: {}, evalsSeen: {}, techFirsts: {}, techPapers: {}, errors: [],
      };
    }

    // 6) 世界特性步骤（幂等；M1 是空表）。
    world.mig ??= {};
    for (const key of FEATURES_WORLD) {
      if (world.mig[`world:${key}`]) continue;
      if (typeof key === 'function') key(world);
      world.mig[`world:${key}`] = true;
    }

    // 7) 校验：发布表、版本、每家 s.sota 等于 projectSota。
    if (Number(world.ver) !== world.rels.length) return fail('读档后发布表版本和 rels 条数对不上');
    if (RELEASES.length !== world.rels.length) return fail('读档后 RELEASES 没有换成世界表');
    for (const m of Object.values(world.relMeta || {})) {
      if (!RELEASES.some(r => r.id === m.relId)) return fail(`世界表里找不到发布行：${m.name}`);
    }
    for (const [id, c] of Object.entries(world.companies)) {
      if (!c.s) continue;
      const so = projectSota(world, id, c.s);
      const h = world.label?.holder;
      if (h) {
        if (so.holder?.org !== h.org || so.holder?.q !== h.q) return fail(`第 ${id} 家的 s.sota 和世界标签对不上`);
      } else if (so.holder) return fail(`第 ${id} 家的 s.sota 多出了一个持有者`);
    }
    attachWorld(world);
    return { ok: true, world, notes: [] };
  } catch (e) {
    return fail(`读档时出错：${e?.message || e}`);
  }
}

// ---------- 存储适配层（只在浏览器里跑；Node 里安静跳过） ----------
const LS_MAIN = 'mrp.world.v1';
const LS_BAK = 'mrp.world.v1.bak';
const MAX_LS = 1.5 * 1024 * 1024;

async function gzip(text) {
  if (typeof CompressionStream === 'undefined' || typeof Response === 'undefined') return new TextEncoder().encode(text);
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzip(bytes) {
  if (typeof DecompressionStream === 'undefined' || typeof Response === 'undefined') return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
const b64 = bytes => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
};
const unb64 = str => {
  const s = typeof atob === 'function' ? atob(str) : Buffer.from(str, 'base64').toString('binary');
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('mrp', 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('worlds')) req.result.createObjectStore('worlds'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('打不开 IndexedDB'));
  });
}
const idbGet = (db, key) => new Promise((resolve, reject) => {
  const r = db.transaction('worlds', 'readonly').objectStore('worlds').get(key);
  r.onsuccess = () => resolve(r.result ?? null);
  r.onerror = () => reject(r.error);
});
const idbPut = (db, key, val) => new Promise((resolve, reject) => {
  const tx = db.transaction('worlds', 'readwrite');
  tx.objectStore('worlds').put(val, key);
  tx.oncomplete = () => resolve(true);
  tx.onerror = () => reject(tx.error);
});

// 存储适配层：save(text) 写主档（旧主档转成备份），load() 读主档，remove() 两份都删。
// IndexedDB 可用时优先；否则 localStorage + base64，超过约 1.5MB 抛中文错误。
export function storage() {
  const hasIdb = typeof indexedDB !== 'undefined';
  const hasLs = typeof localStorage !== 'undefined';
  return {
    kind: hasIdb ? 'indexeddb' : hasLs ? 'localstorage' : 'none',
    async save(text) {
      if (hasIdb) {
        const db = await openDb();
        const old = await idbGet(db, 'main');
        if (old) await idbPut(db, 'backup', old);
        await idbPut(db, 'main', await gzip(text));
        db.close();
        return { kind: 'indexeddb' };
      }
      if (!hasLs) throw new Error('这个环境里没有可用的存档存储（IndexedDB 和 localStorage 都不可用）');
      const bytes = await gzip(text);
      const data = b64(bytes);
      // 主档加备份一共不超过约 1.5MB。
      const old = localStorage.getItem(LS_MAIN) || '';
      if (data.length + old.length > MAX_LS) {
        throw new Error(`世界存档太大（主档加备份约 ${Math.ceil((data.length + old.length) / 1024)}KB），超出了 localStorage 的容量，请换用支持 IndexedDB 的浏览器。`);
      }
      localStorage.setItem(LS_BAK, old);
      localStorage.setItem(LS_MAIN, data);
      return { kind: 'localstorage', bytes: data.length };
    },
    async load() {
      if (hasIdb) {
        const db = await openDb();
        const bytes = await idbGet(db, 'main');
        db.close();
        return bytes ? gunzip(bytes) : null;
      }
      if (!hasLs) return null;
      const data = localStorage.getItem(LS_MAIN);
      return data ? gunzip(unb64(data)) : null;
    },
    async remove() {
      if (hasIdb) {
        const db = await openDb();
        await new Promise((resolve, reject) => {
          const tx = db.transaction('worlds', 'readwrite');
          tx.objectStore('worlds').delete('main');
          tx.objectStore('worlds').delete('backup');
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        });
        db.close();
        return;
      }
      if (hasLs) { localStorage.removeItem(LS_MAIN); localStorage.removeItem(LS_BAK); }
    },
  };
}
