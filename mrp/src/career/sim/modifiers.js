// 加成统一读数（规格 E3）：modifier(s, key)。技术、路线、特质、限时加成各自用 registerModSource 登记来源，
// 读的地方不用知道加成从哪来。乘法键把各来源的值连乘（默认 1），加法键相加（默认 0）。
// 来源按登记顺序、来源内按列表顺序依次乘（加），浮点结果和原来逐项相乘的写法一模一样（技术来源按 s.techs 的顺序）。
// 技术来源在这里登记（P0.3a）；路线在 P1.3，特质和限时加成在 P2.2。消费方（model.js 的 techMult 等）在 P0.3b 换成读这里。
import { TECH_BY_ID, MODALITIES } from '../data/core.js';

const MULT = [
  'train', 'infer', 'stability', 'dataQuality', 'post', 'legal', 'research', 'knowGain', 'gpuQuota', 'rentQuota',
  'cost', 'valuation', 'brandGain', 'apiDemand', 'chatDemand', 'subDemand', 'codingDemand', 'routerDemand', 'apiBrand', 'overseasMult',
  'distillTime', 'integrationOdds', 'evalDays',
];
// jobSlots（作业位，加）、evalAdj（评测后的风险读数，加）、evalDays（评测天数，乘）是 P2.4a 加的（规格 T8、T6.7）。
const ADD = ['strategySpeed', 'slots', 'sotaEase', 'releaseGapDays', 'jobSlots', 'evalAdj'];
const DIMS = [...new Set(Object.values(MODALITIES).flatMap(m => m.dims.map(d => d.key)))];
// 全部合法的键：上面两组，加上 post.<维度>（乘）和 cap.<维度>（加）。没有 frontierEdge（E3 删除）。
export const MOD_KEYS = [...MULT, ...ADD, ...DIMS.map(k => `post.${k}`), ...DIMS.map(k => `cap.${k}`)];
const KIND = new Map([...MULT.map(k => [k, 'mult']), ...ADD.map(k => [k, 'add']), ...DIMS.map(k => [`post.${k}`, 'mult']), ...DIMS.map(k => [`cap.${k}`, 'add'])]);
export const isModKey = key => KIND.has(key);
export const modKind = key => KIND.get(key) || null;

// 一个来源给出的一份加成里，这个键的值。点号键既认扁平写法（特质 mods 里的 'cap.safety': 3），也认嵌套写法（技术 effects 里的 cap: { safety: 3 }）。
// post.<维度> 还要乘上整体的 post（特质可以写 post: 1.05，对所有方向生效）；消费方读 post.<维度> 一个键就够了。
function valuesIn(mods, key) {
  const dot = key.indexOf('.');
  if (dot < 0) return typeof mods[key] === 'number' ? [mods[key]] : [];
  const group = key.slice(0, dot), dim = key.slice(dot + 1);
  const out = [];
  if (group === 'post' && typeof mods.post === 'number') out.push(mods.post);
  const v = mods[key] ?? (mods[group] && typeof mods[group] === 'object' ? mods[group][dim] : undefined);
  if (typeof v === 'number') out.push(v);
  return out;
}

// ---------- 来源 ----------
// fn(s) → 加成对象的数组（每个对象就是一份 mods）；sig(s) → 字符串签名，签名不变就可以直接用缓存（不给就每次都算）。
const SOURCES = [];
// quick(s) → 一个便宜的读数：同一天里如果它不变，sig(s) 也不会变，可以直接用上次的缓存键。
// 不给 quick 的来源（例如测试里临时登记的）没法便宜地看出变化，只好每次照原样重算签名（慢一点，但结果不变）。
let allQuick = true;
let QUICKS = [];
let cache = new WeakMap();   // 状态对象 → { key, vals }，见下面“缓存”
export function registerModSource(fn, { id = `src${SOURCES.length + 1}`, sig = null, quick = null } = {}) {
  if (typeof fn !== 'function') throw new Error('registerModSource 要传函数');
  if (SOURCES.some(x => x.id === id)) throw new Error(`加成来源 ${id} 已经登记过`);
  SOURCES.push({ id, fn, sig, quick });
  QUICKS = SOURCES.map(x => x.quick);
  if (!quick) allQuick = false;
  cache = new WeakMap();
}
// 数组来源的便宜读数：代码里只会 push（长度变）或整份换掉（引用变），引用 + 长度够看出变化。
const arrSeq = new WeakMap();
let arrN = 0;
function arrVer(a) { let v = arrSeq.get(a); if (v === undefined) arrSeq.set(a, (v = ++arrN)); return v; }
// 给别的来源的数组也用：引用 + 长度（见上）。
export const arrayQuick = a => (Array.isArray(a) ? arrVer(a) * 1e6 + Math.min(a.length, 999999) : 0);

// 技术（E3）：TECHS 的 effects 只认这几样（unlock、demand、cheapFrom 不是加成），按 s.techs 的顺序。
const TECH_KEYS = ['train', 'infer', 'stability', 'dataQuality', 'legal', 'cap', 'post'];
const techMods = new Map();
function techModsOf(id) {
  if (!techMods.has(id)) {
    const e = TECH_BY_ID[id]?.effects;
    techMods.set(id, e ? Object.fromEntries(TECH_KEYS.filter(k => k in e).map(k => [k, e[k]])) : null);
  }
  return techMods.get(id);
}
registerModSource(s => (s.techs || []).map(techModsOf).filter(Boolean), { id: 'techs', sig: s => (s.techs || []).join(','), quick: s => arrayQuick(s.techs) });

// ---------- 缓存 ----------
// 按天缓存：同一份状态、同一天、各来源签名都没变时直接取上次的值。状态变了但签名看不出来时（例如以后的限时加成到期），
// 改状态的地方调 invalidateMods(s)。modCacheKey 给 hardness 之类按天缓存的读数共用同一个失效点（D6.2）。
export function modCacheKey(s) {
  return `${s.day}|${SOURCES.map(x => (x.sig ? x.sig(s) : '*')).join('|')}`;
}
export function invalidateMods(s) { cache.delete(s); }
function bucket(s) {
  // 快路径：同一天、各来源的便宜读数都没变，就直接用上次算好的键，不再逐项拼签名。
  // 7 百万次加法里绝大多数都是这种命中，原来每次都要拼一遍带 sotaMade 之类的键。
  const c = cache.get(s);
  if (c && c.key && allQuick && c.day === s.day) {
    const q = c.quick;
    let same = true;
    for (let i = 0; i < QUICKS.length; i++) if (QUICKS[i](s) !== q[i]) { same = false; break; }
    if (same) return c;
  }
  const key = SOURCES.every(x => x.sig) ? modCacheKey(s) : null;
  const v = { key, vals: new Map() };
  if (key) {
    v.day = s.day;
    if (allQuick) v.quick = QUICKS.map(f => f(s));
    cache.set(s, v);
  } else cache.delete(s);
  return v;
}

function readMod(s, c, key) {
  const kind = KIND.get(key);
  if (!kind) throw new Error(`未知的加成键：${key}`);
  const hit = c.vals.get(key);
  if (hit !== undefined) return hit;
  let v = kind === 'add' ? 0 : 1;
  for (const src of SOURCES) {
    for (const mods of src.fn(s) || []) {
      if (!mods) continue;
      for (const x of valuesIn(mods, key)) v = kind === 'add' ? v + x : v * x;
    }
  }
  c.vals.set(key, v);
  return v;
}

export function modifier(s, key) {
  return readMod(s, bucket(s), key);
}

// 一次读全这一代缓存里要用的 cap.<维度>：computeCaps 对每个模型都要读一遍，同一代里值不变。
// 结果挂在缓存条目上，缓存重建（换天、签名变了、invalidateMods）时一起丢掉。
export function capMods(s, keys = DIMS) {
  const c = bucket(s);
  const out = c.capVals || (c.capVals = {});
  for (const k of keys) if (out[k] === undefined) out[k] = readMod(s, c, `cap.${k}`);
  return out;
}
