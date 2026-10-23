// 公司文件、策略节点、特质、历史名、专属事件的字段词表（规格 A2、C2、C4），和策略树的校验器（P2.2）。
// 效果和条件的键另有词表（sim/effects.js 的 validateEffects、sim/cond.js 的 validateCond），校验器调用它们。
// 用法（内容包的“校验器通过”）：validateCompanyFile(文件, 公司 id) → 错误清单（空数组就是通过）；validateAllTrees() 校验主干、通用树和 24 家公司文件。
// “校验器通过”包含 A4.7 的播种检查（seedErrors）：写法都对以后，把文件临时装上、4 个剧本各开一局，播种出来的进行中策略开局第一天就要能推进。
import { COMPANIES, COMPANY_BY_ID, SCENARIOS } from '../core.js';
import { STRATEGY_DAYS } from '../balance.js';
import { STANCES } from '../routes.js';
import { SPIRITS } from '../spirits.js';
import { CORE_TREES, CORE_OF } from '../strategy_core.js';
import { COMPANY_FILES, GENERIC_FILES, baseTree, resolveTree } from './index.js';
import { validateCond } from '../../sim/cond.js';
import { validateEffects, validateChoice } from '../../sim/effects.js';
import { isModKey } from '../../sim/modifiers.js';
import { createGame } from '../../sim/game.js';
import { curBlock } from '../../sim/strategy.js';

// 公司文件 export default 的字段。
export const FILE_KEYS = ['company', 'tree', 'spirits', 'startSpirits', 'names', 'exclusives', 'startOverride'];
// tree 的字段。
export const TREE_KEYS = ['id', 'extends', 'omit', 'branches', 'nodes'];
// 策略节点 StrategyNode。auto：只能由 bypass 或开局播种完成，startStrategy 拒绝开始（目前只有 g_sota）。
export const NODE_KEYS = [
  'id', 'title', 'desc', 'branch', 'pos', 'days', 'prereq', 'excludes', 'available', 'bypass', 'upfront', 'effects', 'spirits',
  'stance', 'license', 'from', 'grants', 'popup', 'scene', 'hist', 'fiction', 'repeatable', 'cooldownDays', 'auto', 'ai',
];
export const GRANT_KEYS = ['names', 'unlock', 'events'];
export const AI_KEYS = ['base', 'historic', 'never', 'factors'];
export const POPUPS = ['card', 'scene', 'none'];
export const LICENSES = ['permissive', 'restrictive'];
// 公司特质 Spirit。mods 的键必须在 sim/modifiers.js 的 MOD_KEYS 里；info 为 true 的只说明已有规则，不能带 mods。
export const SPIRIT_KEYS = ['id', 'title', 'desc', 'mods', 'blocks', 'info'];
// 特质能禁用的后台功能。
export const BLOCKS = ['funding'];
// 历史名 HistoricName（C2）。
export const NAME_KEYS = ['id', 'name', 'series', 'role', 'node', 'real', 'model', 'world', 'clean', 'events'];
// 专属事件 ExclusiveEvent（C4）。
export const EXCLUSIVE_KEYS = ['id', 'title', 'on', 'name', 'node', 'delay', 'within', 'cond', 'supersedes', 'scene', 'effects', 'choices', 'notice', 'hist'];
export const EXCLUSIVE_ON = ['release', 'month', 'node'];

// 对象里有哪些字段不在词表里（不是对象时返回 ['（不是对象）']）。
export function unknownKeys(obj, keys) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return ['（不是对象）'];
  return Object.keys(obj).filter(k => !keys.includes(k));
}

// ---------- 树校验器（P2.2） ----------
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string' && v.length > 0;
const strList = v => Array.isArray(v) && v.every(isStr);
const DATE = /^\d{4}-\d{2}(-\d{2})?$/;
const YEAR = /(19|20)\d{2}/;
// 节点 id 的前缀：主干 g_（各模态押注 gi_ gm_ gv_）；通用树 gs_ gi_ gm_ gv_；公司树用公司缩写，不能占用这几个。
const CORE_PREFIX = /^(g|gi|gm|gv)_/, GENERIC_PREFIX = /^(gs|gi|gm|gv)_/, RESERVED = /^(g|gs|gi|gm|gv)_/;
const tryV = (errs, where, f) => { try { f(); } catch (e) { errs.push(`${where}：${e.message}`); } };
// 策略和专属事件直接给在练模型加单科分的上限（规格 A2 树校验器）：模型变强靠训练，策略只给数据、技术加成这类让训练更有效的东西。
export const STRATEGY_DIMS_MAX = 3;
export const STRATEGY_DIMS_SUM = 6;
function dimsCap(errs, where, dims) {
  if (!isObj(dims)) return;
  const vals = Object.values(dims).filter(v => typeof v === 'number');
  const big = Object.entries(dims).filter(([, v]) => typeof v === 'number' && v > STRATEGY_DIMS_MAX).map(([k, v]) => `${k} +${v}`);
  if (big.length) errs.push(`${where}：直接加分每科不超过 ${STRATEGY_DIMS_MAX}（${big.join('、')}）`);
  const sum = vals.reduce((a, v) => a + Math.max(0, v), 0);
  if (sum > STRATEGY_DIMS_SUM) errs.push(`${where}：直接加分合计不超过 ${STRATEGY_DIMS_SUM}（现在 ${sum}）`);
}

// 一个节点自己的写法（不看别的节点）。kind：'core' | 'generic' | 'company'。
function checkNode(errs, n, where, kind, spiritOk) {
  if (!isObj(n)) { errs.push(`${where}：节点不是对象`); return; }
  const bad = unknownKeys(n, NODE_KEYS);
  if (bad.length) errs.push(`${where}：节点里有不认识的字段 ${bad.join('、')}`);
  if (!isStr(n.id)) { errs.push(`${where}：节点要有 id`); return; }
  const at = `${where}.${n.id}`;
  if (kind === 'core' && !CORE_PREFIX.test(n.id)) errs.push(`${at}：主干节点的 id 要以 g_ 开头（模态押注 gi_ gm_ gv_）`);
  if (kind === 'generic' && !GENERIC_PREFIX.test(n.id)) errs.push(`${at}：通用树节点的 id 要以 gs_ gi_ gm_ gv_ 开头`);
  if (kind === 'company' && RESERVED.test(n.id)) errs.push(`${at}：公司节点不能用 g_ gs_ gi_ gm_ gv_ 前缀`);
  if (!isStr(n.title)) errs.push(`${at}：要有标题`);
  if (typeof n.desc !== 'string' || [...n.desc].length > 60) errs.push(`${at}：说明要写，不超过 60 字`);
  if (YEAR.test(`${n.title ?? ''}${n.desc ?? ''}`)) errs.push(`${at}：标题和说明不写年份`);
  if (!isStr(n.branch)) errs.push(`${at}：要写分支`);
  if (!Array.isArray(n.pos) || n.pos.length !== 2 || !n.pos.every(x => Number.isInteger(x) && x >= 0)) errs.push(`${at}：pos 要写成 [列, 行]`);
  if (!STRATEGY_DAYS.includes(n.days)) errs.push(`${at}：天数只能是 ${STRATEGY_DAYS.join('、')}`);
  if (n.prereq !== undefined && !(Array.isArray(n.prereq) && n.prereq.every(g => strList(g) && g.length > 0))) errs.push(`${at}：prereq 要写成 [[a, b], [c]]`);
  if (n.excludes !== undefined && !strList(n.excludes)) errs.push(`${at}：excludes 要写节点 id 数组`);
  tryV(errs, `${at}.available`, () => validateCond(n.available, { allowEra: true }));
  tryV(errs, `${at}.bypass`, () => validateCond(n.bypass));
  tryV(errs, `${at}.upfront`, () => validateEffects(n.upfront, { source: 'strategy' }));
  tryV(errs, `${at}.effects`, () => validateEffects(n.effects, { source: 'strategy' }));
  dimsCap(errs, `${at}.effects.dims`, n.effects?.dims);
  if (n.spirits != null) {
    if (!isObj(n.spirits) || unknownKeys(n.spirits, ['add', 'remove']).length) errs.push(`${at}：spirits 要写成 { add, remove }`);
    else {
      for (const x of n.spirits.add || []) {
        const id = typeof x === 'string' ? x : x?.id;
        if (!isStr(id) || (typeof x === 'object' && (unknownKeys(x, ['id', 'days']).length || (x.days !== undefined && !(Number.isInteger(x.days) && x.days > 0))))) errs.push(`${at}：spirits.add 要写 { id, days? }`);
        else if (!spiritOk(id)) errs.push(`${at}：特质 ${id} 没有定义`);
      }
      for (const id of n.spirits.remove || []) if (!spiritOk(id)) errs.push(`${at}：要去掉的特质 ${id} 没有定义`);
    }
  }
  if (n.stance != null && !STANCES.includes(n.stance)) errs.push(`${at}：没有这一档路线 ${n.stance}`);
  if (n.license != null && (!LICENSES.includes(n.license) || n.stance == null)) errs.push(`${at}：license 只能是 ${LICENSES.join('、')}，而且只跟着 stance 写`);
  if (n.from != null && (!Array.isArray(n.from) || !n.from.every(x => STANCES.includes(x)) || n.stance == null || n.from.includes(n.stance))) errs.push(`${at}：from 要写路线数组，只跟着 stance 写，不能含要去的那一档`);
  if (n.grants != null) {
    if (!isObj(n.grants) || unknownKeys(n.grants, GRANT_KEYS).length) errs.push(`${at}：grants 只能写 names、unlock、events`);
    else for (const k of GRANT_KEYS) if (n.grants[k] !== undefined && !strList(n.grants[k])) errs.push(`${at}：grants.${k} 要写 id 数组`);
  }
  if (!POPUPS.includes(n.popup)) errs.push(`${at}：popup 只能是 ${POPUPS.join('、')}`);
  else if (n.scene ? n.popup !== 'scene' : (n.stance || n.grants?.names?.length) && n.popup !== 'card') errs.push(`${at}：${n.scene ? '有短剧的 popup 要写 scene' : '改路线或授名的节点 popup 要写 card'}`);
  if (n.hist != null) {
    if (!isObj(n.hist) || unknownKeys(n.hist, ['date', 'text', 'src']).length || !DATE.test(n.hist.date || '') || !isStr(n.hist.text)) errs.push(`${at}：hist 要写成 { date: 'YYYY-MM-DD' 或 'YYYY-MM', text, src? }`);
    if (n.fiction) errs.push(`${at}：架空节点不写史实`);
  }
  if (n.fiction !== undefined && typeof n.fiction !== 'boolean') errs.push(`${at}：fiction 写 true 或 false`);
  if (n.repeatable) {
    if (kind !== 'core' || !n.stance) errs.push(`${at}：只有主干的路线节点能重复`);
    if (!(Number.isInteger(n.cooldownDays) && n.cooldownDays > 0)) errs.push(`${at}：能重复的节点要写冷却天数`);
  } else if (n.cooldownDays) errs.push(`${at}：不能重复的节点不写冷却`);
  if (n.auto && !(n.bypass && n.ai?.never === true && n.popup === 'none')) errs.push(`${at}：auto 节点要有 bypass、ai.never 为真、popup 为 none`);
  if (!isObj(n.ai) || unknownKeys(n.ai, AI_KEYS).length) errs.push(`${at}：ai 要写成 { base, historic, never, factors }`);
  else {
    if (!(typeof n.ai.base === 'number' && n.ai.base >= 0)) errs.push(`${at}：ai.base 要写非负数`);
    if (n.ai.historic !== undefined && !(typeof n.ai.historic === 'number' && n.ai.historic >= 0)) errs.push(`${at}：ai.historic 要写非负数`);
    if (n.ai.never !== undefined && typeof n.ai.never !== 'boolean') errs.push(`${at}：ai.never 写 true 或 false`);
    for (const f of n.ai.factors || []) {
      if (!isObj(f) || unknownKeys(f, ['if', 'mult']).length || !(typeof f.mult === 'number' && f.mult > 0)) errs.push(`${at}：ai.factors 要写 [{ if, mult }]`);
      else tryV(errs, `${at}.ai.factors`, () => validateCond(f.if));
    }
  }
}
function checkSpirit(errs, sp, where) {
  if (!isObj(sp)) { errs.push(`${where}：特质不是对象`); return; }
  const bad = unknownKeys(sp, SPIRIT_KEYS);
  if (bad.length) errs.push(`${where}：特质里有不认识的字段 ${bad.join('、')}`);
  if (!isStr(sp.title) || typeof sp.desc !== 'string') errs.push(`${where}：特质要有标题和说明`);
  for (const k of Object.keys(sp.mods || {})) if (!isModKey(k) || typeof sp.mods[k] !== 'number') errs.push(`${where}：mods 里的 ${k} 不是加成键或不是数字`);
  for (const b of sp.blocks || []) if (!BLOCKS.includes(b)) errs.push(`${where}：blocks 里的 ${b} 不认识`);
  if (sp.info && Object.keys(sp.mods || {}).length) errs.push(`${where}：说明特质不能带 mods`);
}
// 走不到的节点：只看前置（不看条件和互斥），每组至少一个走得到才走得到。前置成环的也走不到。
export function unreachableNodes(nodes) {
  const ok = new Set();
  for (let changed = true; changed;) {
    changed = false;
    for (const n of nodes) if (!ok.has(n.id) && (n.prereq || []).every(g => g.some(id => ok.has(id)))) { ok.add(n.id); changed = true; }
  }
  return nodes.filter(n => !ok.has(n.id)).map(n => n.id);
}
// 展开以后的整棵树：id 不重复、引用的节点都在、互斥写成对称、分支都登记过、有 base 分支、g_sota 在 base 分支顶端、没有走不到的节点。
function checkResolved(errs, t, where) {
  const seen = new Map();
  for (const n of t.nodes) {
    if (!isObj(n) || !isStr(n.id)) continue;
    if (seen.has(n.id)) errs.push(`${where}：节点 id ${n.id} 重复`);
    seen.set(n.id, n);
  }
  if (!isStr(t.branches?.base)) errs.push(`${where}：一定要有 base 分支`);
  const g = seen.get('g_sota');
  if (!g) errs.push(`${where}：不能少了 g_sota（不能 omit）`);
  else if (g.branch !== 'base' || g.pos?.[1] !== 0) errs.push(`${where}：g_sota 要放在 base 分支顶端`);
  for (const n of seen.values()) {
    const at = `${where}.${n.id}`;
    if (n.branch && !t.branches?.[n.branch]) errs.push(`${at}：分支 ${n.branch} 没有登记`);
    for (const id of (n.prereq || []).flat()) if (!seen.has(id)) errs.push(`${at}：前置 ${id} 不在树里`);
    for (const id of n.excludes || []) {
      if (!seen.has(id)) errs.push(`${at}：互斥的 ${id} 不在树里`);
      else if (!(seen.get(id).excludes || []).includes(n.id)) errs.push(`${at}：和 ${id} 的互斥要两边都写`);
    }
  }
  const lost = unreachableNodes([...seen.values()].filter(n => Array.isArray(n.prereq ?? [])));
  if (lost.length) errs.push(`${where}：走不到的节点 ${lost.join('、')}`);
}

// 一棵树（主干、通用树、公司树都能用）。kind：'core' | 'generic' | 'company'。company：公司 id（模态要和主干对上）。
function checkTree(errs, tree, where, kind, spiritOk, company = null) {
  if (!isObj(tree)) { errs.push(`${where}：没有 tree`); return null; }
  const bad = unknownKeys(tree, TREE_KEYS);
  if (bad.length) errs.push(`${where}：tree 里有不认识的字段 ${bad.join('、')}`);
  if (!isStr(tree.id)) errs.push(`${where}：tree 要有 id`);
  if (kind === 'core' && tree.extends) errs.push(`${where}：主干不继承别的树`);
  if (kind !== 'core') {
    const up = baseTree(tree.extends);
    if (!up) errs.push(`${where}：extends 只能是 core_* 或 _generic_*`);
    if (kind === 'generic' && !CORE_TREES[tree.extends]) errs.push(`${where}：通用树要直接继承主干`);
  }
  if (tree.omit !== undefined && !strList(tree.omit)) errs.push(`${where}：omit 要写节点 id 数组`);
  if ((tree.omit || []).includes('g_sota')) errs.push(`${where}：不能 omit 掉 g_sota`);
  const parent = tree.extends ? resolveTree(baseTree(tree.extends)) : null;
  for (const id of tree.omit || []) if (!parent?.byId.has(id)) errs.push(`${where}：omit 的 ${id} 不在继承的树里`);
  if (tree.branches !== undefined && !(isObj(tree.branches) && Object.values(tree.branches).every(isStr))) errs.push(`${where}：branches 要写成 { 分支: 名字 }`);
  if (!Array.isArray(tree.nodes)) { errs.push(`${where}：nodes 要写数组`); return null; }
  for (const n of tree.nodes) checkNode(errs, n, where, kind, spiritOk);
  const t = resolveTree(tree);
  if (!t) return null;
  checkResolved(errs, t, where);
  const mod = company ? COMPANY_BY_ID[company]?.modality : null;
  if (mod && t.core !== CORE_OF[mod]) errs.push(`${where}：${company} 是${mod}公司，要接 ${CORE_OF[mod]}（现在是 ${t.core ?? '没有主干'}）`);
  return t;
}

// 公司文件（内容包的文件、四棵通用树）→ 错误清单。file 为 null（内容包落地前的存根）时没有错。
// generic：通用树的文件（company 字段为 null）。company：公司 id（通用树不传）。
export function validateCompanyFile(file, company = null, { generic = false } = {}) {
  const errs = [];
  if (file === null) return errs;
  const where = company ?? file?.tree?.id ?? '公司文件';
  if (!isObj(file)) return [`${where}：文件要导出对象或 null`];
  const bad = unknownKeys(file, FILE_KEYS);
  if (bad.length) errs.push(`${where}：文件里有不认识的字段 ${bad.join('、')}`);
  if (generic ? file.company !== null : file.company !== company) errs.push(`${where}：company 要写${generic ? ' null' : ` '${company}'`}`);
  const own = isObj(file.spirits) ? file.spirits : {};
  if (file.spirits !== undefined && !isObj(file.spirits)) errs.push(`${where}：spirits 要写成 { id: 特质 }`);
  for (const [id, sp] of Object.entries(own)) {
    checkSpirit(errs, sp, `${where} 特质 ${id}`);
    if (SPIRITS[id]) errs.push(`${where}：本家特质 ${id} 和通用特质重名`);
  }
  const spiritOk = id => !!(SPIRITS[id] || own[id]);
  for (const id of file.startSpirits || []) if (!spiritOk(id)) errs.push(`${where}：开局特质 ${id} 没有定义`);
  const t = checkTree(errs, file.tree, where, generic ? 'generic' : 'company', spiritOk, company);
  const nodes = t?.byId ?? new Map();
  const names = Array.isArray(file.names) ? file.names : [];
  const exs = Array.isArray(file.exclusives) ? file.exclusives : [];
  const granted = new Set([...nodes.values()].flatMap(n => n.grants?.names || []));
  const events = new Set([...nodes.values()].flatMap(n => n.grants?.events || []));
  for (const hn of names) {
    const at = `${where} 历史名 ${hn?.id}`;
    if (!isObj(hn) || !isStr(hn.id)) { errs.push(`${where}：历史名要有 id`); continue; }
    const b = unknownKeys(hn, NAME_KEYS);
    if (b.length) errs.push(`${at}：有不认识的字段 ${b.join('、')}`);
    if (!isStr(hn.name)) errs.push(`${at}：要写名字`);
    if (hn.series != null && !isStr(hn.series)) errs.push(`${at}：series 要写前缀`);
    if (!['flagship', 'small'].includes(hn.role)) errs.push(`${at}：role 只能是 flagship 或 small`);
    if (!nodes.get(hn.node)?.grants?.names?.includes(hn.id)) errs.push(`${at}：节点 ${hn.node} 不在树里，或者没有授予这个名字`);
    if (!DATE.test(hn.real || '')) errs.push(`${at}：real 要写现实发布日`);
    tryV(errs, `${at}.model`, () => validateCond({ model: hn.model }));
    tryV(errs, `${at}.world`, () => validateCond(hn.world));
    if (!(hn.clean == null || hn.clean === 'base' || (isObj(hn.clean?.rl) && strList(hn.clean.rl.dirs) && Number.isInteger(hn.clean.rl.days)))) errs.push(`${at}：clean 只能是 null、'base' 或 { rl: { dirs, days } }`);
    for (const e of hn.events || []) if (!exs.some(x => x?.id === e)) errs.push(`${at}：专属事件 ${e} 没有定义`);
  }
  for (const id of granted) if (!names.some(x => x?.id === id)) errs.push(`${where}：节点授予的名字 ${id} 不在名表里`);
  for (const x of exs) {
    const at = `${where} 专属事件 ${x?.id}`;
    if (!isObj(x) || !isStr(x.id)) { errs.push(`${where}：专属事件要有 id`); continue; }
    const b = unknownKeys(x, EXCLUSIVE_KEYS);
    if (b.length) errs.push(`${at}：有不认识的字段 ${b.join('、')}`);
    if (!isStr(x.title)) errs.push(`${at}：要有标题`);
    if (!EXCLUSIVE_ON.includes(x.on)) errs.push(`${at}：on 只能是 ${EXCLUSIVE_ON.join('、')}`);
    if (x.name != null && !names.some(y => y?.id === x.name)) errs.push(`${at}：授名 ${x.name} 不在名表里`);
    if (x.on === 'node' && x.node != null && !nodes.has(x.node)) errs.push(`${at}：节点 ${x.node} 不在树里`);
    if (x.delay !== undefined && !(Array.isArray(x.delay) && x.delay.length === 2 && x.delay.every(d => Number.isInteger(d) && d >= 0) && x.delay[0] <= x.delay[1])) errs.push(`${at}：delay 要写 [最早, 最晚] 天数`);
    if (x.within !== undefined && !(Number.isInteger(x.within) && x.within >= 0)) errs.push(`${at}：within 要写天数`);
    if (x.notice !== undefined && typeof x.notice !== 'boolean') errs.push(`${at}：notice 写 true 或 false`);
    if (!events.has(x.id)) errs.push(`${at}：没有节点在 grants.events 里登记它`);
    tryV(errs, `${at}.cond`, () => validateCond(x.cond));
    tryV(errs, `${at}.effects`, () => validateEffects(x.effects, { source: 'exclusive' }));
    dimsCap(errs, `${at}.effects.dims`, x.effects?.dims);
    for (const c of x.choices || []) tryV(errs, `${at}.choices`, () => validateChoice(c, { source: 'exclusive' }));
    for (const k of ['milestone', 'event']) if (x.supersedes?.[k] !== undefined && !strList(x.supersedes[k])) errs.push(`${at}：supersedes.${k} 要写 id 数组`);
  }
  for (const id of events) if (!exs.some(x => x?.id === id)) errs.push(`${where}：节点登记的专属事件 ${id} 没有定义`);
  const scs = SCENARIOS.map(x => x.id);
  for (const [sc, ov] of Object.entries(file.startOverride || {})) {
    if (!scs.includes(sc) || !isObj(ov) || unknownKeys(ov, ['done', 'skip', 'cur']).length) { errs.push(`${where}：startOverride.${sc} 要写成 { done, skip, cur }`); continue; }
    for (const id of [...(ov.done || []), ...(ov.skip || []), ...(ov.cur ? [ov.cur] : [])]) if (!nodes.has(id)) errs.push(`${where}：startOverride.${sc} 里的 ${id} 不在树里`);
  }
  // 写法都对了再开局查播种（写法有错时开局可能直接抛错，报出来的只会更乱）。
  if (!errs.length) errs.push(...seedErrors(file, company, { generic }));
  return errs;
}
// 播种检查（A4.7）：把文件临时装上，4 个剧本各开一局（种子 1；策略不读随机数），开局播种出来的进行中策略（史实种子节点、
// startOverride 的 cur，或者没有种子时 pickStrategy 挑的那项）要按 canStart 的口径站得住：前置已完成、没被互斥排除、没有永久失效、
// 当前路线在它的 from 里、available 成立（strategy.js 的 curBlock）。站不住的话开局第一天就会暂停或作废。
// 公司文件装到这家公司身上；通用树（generic）装到它这个模态的每一家身上，各家本家文件临时当成存根（通用树是它们的退路）。→ 错误清单。
export function seedErrors(file, company = null, { generic = false } = {}) {
  const errs = [];
  if (!isObj(file?.tree)) return errs;
  let targets, swaps;
  if (generic) {
    const core = resolveTree(file.tree)?.core;
    const mod = Object.keys(CORE_OF).find(m => CORE_OF[m] === core);
    if (!mod) return errs;
    targets = COMPANIES.filter(c => c.modality === mod).map(c => c.id);
    swaps = [[GENERIC_FILES, mod, file], ...targets.map(id => [COMPANY_FILES, id, null])];
  } else {
    if (!COMPANY_BY_ID[company]) return errs;
    targets = [company];
    swaps = [[COMPANY_FILES, company, file]];
  }
  const keep = swaps.map(([o, k]) => [o, k, o[k]]);
  try {
    for (const [o, k, v] of swaps) o[k] = v;
    for (const c of targets) for (const { id: sc } of SCENARIOS) {
      const at = `${generic ? `${file.tree.id}（${c}）` : c} ${sc} 开局`;
      try {
        const s = createGame(c, sc, 1);
        const why = curBlock(s);
        if (why) errs.push(`${at}：播种出来的进行中策略 ${s.strategy.cur.id} 第一天就推进不了（${why}）`);
      } catch (e) { errs.push(`${at}：开局出错（${e.message}）`); }
    }
  } finally { for (const [o, k, v] of keep) o[k] = v; }
  return errs;
}
// 一棵主干 → 错误清单。
export function validateCoreTree(tree) {
  const errs = [];
  checkTree(errs, tree, tree?.id ?? '主干', 'core', id => !!SPIRITS[id]);
  return errs;
}
// 全部：四棵主干、四棵通用树、24 家公司文件、通用特质 → 错误清单（空数组就是全部通过）。
export function validateAllTrees() {
  const errs = [];
  for (const t of Object.values(CORE_TREES)) errs.push(...validateCoreTree(t));
  for (const f of Object.values(GENERIC_FILES)) errs.push(...validateCompanyFile(f, null, { generic: true }));
  for (const [id, f] of Object.entries(COMPANY_FILES)) errs.push(...validateCompanyFile(f, id));
  for (const [id, sp] of Object.entries(SPIRITS)) { checkSpirit(errs, sp, `通用特质 ${id}`); if (sp.id !== id) errs.push(`通用特质 ${id}：id 要和键一样`); }
  return errs;
}
