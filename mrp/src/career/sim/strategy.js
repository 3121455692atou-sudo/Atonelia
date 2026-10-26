// 公司策略（规格 A1–A6）：树的展开、节点状态、开始与搁置、每天推进（自动绕过、暂停、永久失效、完成）、开局播种、特质与限时加成。
// 单槽、固定天数、AND 套 OR 的前置、互斥、绕过、公司特质（照 HOI4 国策），另有三处不同：换项时旧进度保留 SHELF_DAYS 天；
// 条件失效先暂停、进度保留；只有确定永远做不成才作废并提示。整个过程不用随机数，同一份存档推进结果一样。
//
// 状态（A3）：s.strategy = { tree, cur, shelved, done, spirits, rights, unlocks, ex, exPending, idleSince, log }，另有两项本文件和顾问用的：
//   snooze：玩家在顾问那里点了“先不做”的日子（下一个 IDLE_ADVICE_EVERY 周期才再提醒）；trail、hold：发布时机规则（strategy_ai.js 的 shouldHold）；
// 存档里只存 id，节点、特质的数值都来自数据。路线只能经 completeNode 里的 setStance(src 'strategy') 改（B4）。
//
// 特质的几个小工具（spiritDef、hasSpirit、spiritBlocks、addSpirit、removeSpirit）给 applyEffects 的 spirit 键、条件 canRaise、
// 效果 raise、g_beyond 的试炼（focus.js）用，策略树还没建好的状态（手搭的测试状态）也能用。
import { SPIRITS } from '../data/spirits.js';
import { CORE_TREES, CORE_OF, CORE_NODE_IDS } from '../data/strategy_core.js';
import { companyFile, treeFor, resolveTree } from '../data/companies/index.js';
import { STANCE } from '../data/routes.js';
import { SHELF_DAYS, SEED_WINDOW, SEED_MIN_LEFT, RIGHT_TAIL, SOTA } from '../data/balance.js';
import { addDays, daysBetween, fmtDay } from './clock.js';
import { clamp } from './util.js';
import { cond, condWhy, condPermanent, condPermanentWhy } from './cond.js';
import { applyEffects, describeEffects } from './effects.js';
import { registerModSource, invalidateMods, modifier, arrayQuick } from './modifiers.js';
import { fire, registerKind } from './queue.js';
import { setStance, routeCooldownLeft, routeOf } from './route.js';
import { sotaMade, gapOf, qOf, sotaWouldTake } from './sota.js';
import { liveModel, workingModel, taintCaps } from './model.js';
import { log } from './log.js';
import { pickStrategy, holdTick } from './strategy_ai.js';
import { nodeExclusives, registerExclusiveKind } from './exclusive.js';

// ---------- 特质 ----------
// 特质定义：通用的在 data/spirits.js，本家的在公司文件里。
export const spiritDef = (s, id) => SPIRITS[id] ?? companyFile(s.charId)?.spirits?.[id] ?? null;
export const hasSpirit = (s, id) => !!s.strategy?.spirits?.[id];
// 现有特质里有没有禁用某个后台功能的（blocks，例如 'funding'）。
export const spiritBlocks = (s, what) => Object.keys(s.strategy?.spirits ?? {}).some(id => spiritDef(s, id)?.blocks?.includes(what));
// 特质表的版本号（加成缓存的签名用）：每个特质对象一个编号，经下面三个函数增删时换新编号。存档读进来、整份换掉的特质表是新对象，自然是新编号。
// modifier 每次读数都要算签名，所以不每次把特质 id 拼一遍。
const SP_VER = new WeakMap();
let spSeq = 0;
const spVer = sp => { let v = SP_VER.get(sp); if (v === undefined) SP_VER.set(sp, (v = ++spSeq)); return v; };
const spTouch = sp => { if (sp) SP_VER.set(sp, ++spSeq); };
// 加一个特质；days 给出时写到期日（{ since, until }，见 A3）。
export function addSpirit(s, id, days = null, day = s.day) {
  const sp = ((s.strategy ??= {}).spirits ??= {});
  sp[id] = { since: day, until: days ? addDays(day, days) : null };
  spTouch(sp);
  return sp[id];
}
export function removeSpirit(s, id) { if (s.strategy?.spirits && id in s.strategy.spirits) { delete s.strategy.spirits[id]; spTouch(s.strategy.spirits); } }
// 删掉已过期的特质（每天推进时删一次，月结再兜一次）。没有 s.strategy 时什么都不做。
export function expireSpirits(s, report) {
  const sp = s.strategy?.spirits;
  if (!sp) return;
  for (const [id, x] of Object.entries(sp)) if (x?.until && x.until < s.day) { delete sp[id]; spTouch(sp); }
}
// 国家说明特质（A2，只解释已有的硬规则）：中国公司算力受限、诉讼压力小，做对话产品的还要备案；美国公司官司多。
export function countrySpirits(s) {
  const c = s.company?.country;
  if (c === 'CN') return ['cn_compute_limited', ...(s.mod === 'llm' ? ['cn_filing'] : []), 'cn_light_liability'];
  if (c === 'US') return ['us_litigation'];
  return [];
}

// 技术储备（D6.2 的 ρ = 1 + sotaEase）。g_sota 的三档特质在存档里次日才换（拿到第一枚算数标签的次日 g_sota 以绕过完成；
// 局内“集团出过”也是次日换，A4 规则 8），但 ρ 从事实成立那一刻起就按新的一档算：和 P1.2 的回退口径（sotaMade、seed、kin）一模一样，
// 不会因为换特质晚一天，当天的训练多吃一天“技术储备不足”。三档都不在身上（手搭的状态）时不算。
const EASE_IDS = ['g_sota_maker', 'g_sota_kin', 'g_sota_rookie'];
function easeStand(s) {
  const sp = s.strategy?.spirits;
  if (!sp || !EASE_IDS.some(id => sp[id])) return null;
  if (sp.g_sota_maker || sotaMade(s)) return 'g_sota_maker';
  if (sp.g_sota_kin || s.sota?.kin || s.sota?.seed === '○') return 'g_sota_kin';
  return 'g_sota_rookie';
}
function spiritMods(s) {
  const sp = s.strategy?.spirits;
  if (!sp) return [];
  const out = [];
  for (const id of Object.keys(sp)) {
    if (EASE_IDS.includes(id)) continue;
    const d = spiritDef(s, id);
    if (d?.mods && !d.info) out.push(d.mods);
  }
  const ease = easeStand(s);
  if (ease) out.push(SPIRITS[ease].mods);
  return out;
}
// 加成来源（E3）：特质；限时需求乘子（applyEffects 的 demand 写进 s.boosts，到期日 until 当天起失效）。
registerModSource(spiritMods, { id: 'spirits', sig: s => { const sp = s.strategy?.spirits; return sp ? `${spVer(sp)}${sotaMade(s) ? 'm' : ''}${s.sota?.kin ? 'k' : ''}` : ''; },
  quick: s => { const sp = s.strategy?.spirits; return sp ? spVer(sp) * 4 + (sotaMade(s) ? 2 : 0) + (s.sota?.kin ? 1 : 0) : 0; } });
// 限时加成只会追加（applyEffects 的 demand）和整份换掉（到期清理），签名看条数和最后一条。
registerModSource(s => (Array.isArray(s.boosts) ? s.boosts : []).filter(b => b && b.until > s.day).map(({ until, src, ...mods }) => mods),
  { id: 'timed', sig: s => (Array.isArray(s.boosts) && s.boosts.length ? `${s.boosts.length}|${s.boosts[s.boosts.length - 1]?.until}` : ''), quick: s => arrayQuick(s.boosts) });

// ---------- 树 ----------
// 这家公司的树：本家文件；本家还是存根时用模态的通用树；通用树也没有时只用主干（A5）。展开 extends + omit，按树对象缓存。
export function resolvedTree(s) {
  if (!s?.charId) return null;
  return resolveTree(treeFor(s.charId) ?? CORE_TREES[CORE_OF[s.mod]] ?? null);
}
export const nodeOf = (s, id) => resolvedTree(s)?.byId.get(id) ?? null;
// 史实日期：只写月份的按 15 日算。
export const histDay = n => { const d = n?.hist?.date; return typeof d === 'string' ? (d.length === 7 ? `${d}-15` : d) : null; };
const isDone = (s, id) => !!s.strategy?.done?.[id];
const prereqOk = (s, n) => (n.prereq || []).every(g => g.some(id => isDone(s, id)));
// 互斥：任一方完成，另一方永久排除（校验器要求写成对称，这里两边都看）→ 排除它的那个节点 id | null。
function excludedBy(s, n) {
  for (const id of n.excludes || []) if (isDone(s, id)) return id;
  for (const id of Object.keys(s.strategy?.done || {})) if (nodeOf(s, id)?.excludes?.includes(n.id)) return id;
  return null;
}
// 可重复节点（主干路线节点）完成后的冷却，以及带 stance 的节点要等路线冷却（B5）。→ 剩余天数。
function cooldownLeft(s, n) {
  let left = 0;
  const d = s.strategy?.done?.[n.id];
  if (n.repeatable && d) left = Math.max(0, (n.cooldownDays || 0) - daysBetween(d.day, s.day));
  if (n.stance) left = Math.max(left, routeChangeBlocked(s));
  return left;
}
const fromOk = (s, n) => !n.from || n.from.includes(routeOf(s).stance);

// 条件叶子表达不了的两条门槛（规格里点名的两个主干节点），由引擎另查：
//   g_beyond 开始前：在线旗舰已经练到蒸馏上限（q ≥ qCap − 0.5，D8）；
//   g_sota 的绕过：第一枚算数的标签是昨天或更早拿到的（“次日自动完成”，A6；开局前就有的直接算）。
function liveAtCap(s) {
  const m = liveModel(s);
  const tc = m ? taintCaps(s, m) : null;
  return !!tc && qOf(s.mod, m.dims) >= tc.qCap - 0.5;
}
function madeBefore(s) {
  if (s.sota?.before) return true;
  const first = (s.sota?.made || []).map(x => x.day).filter(Boolean).sort()[0];
  return !!first && first < s.day;
}
const GATES = {
  g_beyond: { available: liveAtCap, line: s => { const m = liveModel(s), tc = m ? taintCaps(s, m) : null; return { text: '在线旗舰已经练到蒸馏上限（差不到 0.5 分）', ok: liveAtCap(s), now: tc ? `差 ${Math.max(0, Math.round((tc.qCap - qOf(s.mod, m.dims)) * 10) / 10)} 分` : '在线旗舰没有被蒸馏污染' }; } },
  g_sota: { bypass: madeBefore },
};
const availOk = (s, n) => cond(s, n.available) && (GATES[n.id]?.available?.(s) ?? true);
const bypassOk = (s, n) => !!n.bypass && cond(s, n.bypass) && (GATES[n.id]?.bypass?.(s) ?? true);
function availWhy(s, n) {
  const lines = condWhy(s, n.available);
  const g = GATES[n.id]?.line;
  return g ? [...lines, g(s)] : lines;
}
// 永久失效（A4 规则 3）：available 里有永远不会再成立的条件（里程碑被别家拿走、不许出现的技术已经学会……），或者互斥的节点已完成。
const permanent = (s, n) => !!excludedBy(s, n) || condPermanent(s, n.available);

// 能不能现在开始（顾问、机器人、startStrategy 共用）→ '' 表示能，否则是原因（白话）。
// asCur：查进行中的那一项（curBlock 用），不算“正在做这一项”，也不看冷却（每天推进不因冷却暂停）。
function startBlock(s, n, { asCur = false } = {}) {
  const S = s.strategy;
  if (!S?.tree) return '公司策略还没有上线';
  if (!n) return '没有这项策略';
  if (n.auto) return '这一项条件达成后自动完成，不用开始';
  if (!asCur && S.cur?.id === n.id) return '正在做这一项';
  if (isDone(s, n.id) && !n.repeatable) return '已经完成了';
  const ex = excludedBy(s, n);
  if (ex) return `和「${nodeOf(s, ex)?.title ?? ex}」互斥，那一项已经完成`;
  if (!prereqOk(s, n)) return '前置策略还没完成';
  if (!fromOk(s, n)) return `现在的路线（${STANCE[routeOf(s).stance]?.label}）不能走这一步`;
  const cd = asCur ? 0 : cooldownLeft(s, n);
  if (cd > 0) return `还要等 ${cd} 天${n.stance ? '（路线刚改过）' : ''}`;
  if (!availOk(s, n)) return '条件还不够';
  return '';
}
export const canStart = (s, n) => !startBlock(s, typeof n === 'string' ? nodeOf(s, n) : n);
// 进行中的这一项按 canStart 的口径还站不站得住（前置、互斥、路线 from、available，外加没有永久失效）→ '' 表示站得住，否则是原因（白话）。
// 校验器的播种检查用（_schema.js 的 seedErrors，A4.7）：开局播种出来的 cur 第一天推进时不能暂停，也不能作废。没有进行中的返回 ''。
export function curBlock(s) {
  const c = s.strategy?.cur;
  if (!c) return '';
  const n = nodeOf(s, c.id);
  if (n && !excludedBy(s, n) && permanent(s, n)) return `做不成了：${voidWhy(s, n)}`;
  const why = startBlock(s, n, { asCur: true });
  return why === '条件还不够' ? `条件不成立：${firstUnmet(s, n)}` : why;
}

// ---------- 节点状态 ----------
// 条件清单：前置（AND 套 OR）、互斥、路线、冷却、开始条件，每条 { text, ok, now }。
function whyLines(s, n) {
  const out = [];
  for (const g of n.prereq || []) {
    const names = g.map(id => `「${nodeOf(s, id)?.title ?? id}」`);
    out.push({ text: g.length > 1 ? `已完成${names.join('或')}` : `已完成${names[0]}`, ok: g.some(id => isDone(s, id)), now: g.some(id => isDone(s, id)) ? '完成了' : '还没完成' });
  }
  const ex = excludedBy(s, n);
  if (n.excludes?.length || ex) out.push({ text: `没选过${(n.excludes || []).map(id => `「${nodeOf(s, id)?.title ?? id}」`).join('、') || `「${nodeOf(s, ex)?.title ?? ex}」`}（互斥）`, ok: !ex, now: ex ? `已经选了「${nodeOf(s, ex)?.title ?? ex}」` : '都没选' });
  if (n.from) out.push({ text: `现在的路线是${n.from.map(x => STANCE[x]?.label ?? x).join('、')}之一`, ok: fromOk(s, n), now: STANCE[routeOf(s).stance]?.label ?? '' });
  const cd = n.auto ? 0 : cooldownLeft(s, n);
  if (n.repeatable || n.stance) out.push({ text: n.stance ? '路线冷却已经结束' : '冷却已经结束', ok: cd === 0, now: cd ? `还要 ${cd} 天` : '没有冷却' });
  if (n.id === 'g_sota') out.push({ text: '发布一款拿到 SOTA 标签的模型', ok: sotaMade(s), now: sotaMade(s) ? '拿到过' : sotaNow(s) });
  else out.push(...availWhy(s, n));
  return out;
}
// g_sota 条件行的“现在”：拿在练和在线里更强的一款比。只有 sotaWouldTake 说现在发布能拿到标签时才写“发布就能拿到”
// （别家持有时要高出现任 SOTA.EPS 才换手，领先不到这么多就是持平；这个模态发过模型的公司不到 SOTA.FIELD 家时谁也挂不上标签）。
function sotaNow(s) {
  const m = [workingModel(s), liveModel(s)].filter(Boolean).sort((a, b) => qOf(s.mod, b.dims) - qOf(s.mod, a.dims))[0];
  const x = m ? gapOf(s, m.dims) : null;
  if (x === null) return '还没有可见的对手';
  const r = Math.round(x * 10) / 10;
  const take = sotaWouldTake(s, qOf(s.mod, m.dims));
  if (take === true) return r > 0 ? `领先最强 ${r} 分，发布就能拿到` : '发布就能拿到';
  if (r < 0) return `离最强还差 ${-r} 分`;
  if (take === null) return `${r > 0 ? `领先最强 ${r} 分` : '和最强持平'}，可这个领域发过模型的公司还不到 ${SOTA.FIELD} 家，发布也挂不上标签`;
  return `和最强持平（要比现在挂着标签的模型高出 ${SOTA.EPS} 分以上才拿得到）`;
}
// → { state, why, days, need, shelvedDays }。state：done | bypassed | active | paused | available | locked | excluded | cooldown | blocked。
// days 是已做的天数（进行中的或搁置着的）；shelvedDays 是搁置的进度还能保留几天。
export function nodeStatus(s, id) {
  const n = nodeOf(s, id);
  const S = s.strategy;
  const base = { state: 'locked', why: [], days: 0, need: n?.days ?? 0, shelvedDays: 0 };
  if (!n || !S?.tree) return base;
  const sh = S.shelved?.[id];
  if (sh && sh.until >= s.day) Object.assign(base, { days: sh.days, shelvedDays: daysBetween(s.day, sh.until) });
  base.why = whyLines(s, n);
  if (S.cur?.id === id) return { ...base, state: S.cur.paused ? 'paused' : 'active', days: S.cur.days, need: S.cur.need };
  const d = S.done?.[id];
  if (d && !n.repeatable) return { ...base, state: d.how === 'bypass' ? 'bypassed' : 'done' };
  if (excludedBy(s, n)) return { ...base, state: 'excluded' };
  if (!d && permanent(s, n)) return { ...base, state: 'blocked' };
  if (!n.auto && cooldownLeft(s, n) > 0 && (d || n.stance)) return { ...base, state: 'cooldown' };
  return { ...base, state: startBlock(s, n) ? 'locked' : 'available' };
}
// 全部节点加状态（界面和 AI 用），按树里的顺序。
export function strategyOptions(s) {
  const t = s.strategy?.tree ? resolvedTree(s) : null;
  return t ? t.nodes.map(n => ({ id: n.id, node: n, ...nodeStatus(s, n.id) })) : [];
}

// ---------- 开始、搁置 ----------
function assertCanAct(s) {
  if (s.status !== 'playing') throw new Error('游戏已经结束');
  if (s.queue?.length) throw new Error('请先处理眼前的事件');
}
const LOG_MAX = 80;
function pushLog(s, id, kind) {
  const L = s.strategy.log;
  L.push({ day: s.day, id, kind });
  if (L.length > LOG_MAX) L.splice(0, L.length - LOG_MAX);
}
function shelveCur(s) {
  const S = s.strategy, c = S.cur;
  if (!c) return null;
  S.shelved[c.id] = { days: c.days, until: addDays(s.day, SHELF_DAYS) };
  S.cur = null;
  pushLog(s, c.id, 'shelve');
  return S.shelved[c.id];
}
// 开始一项（不检查能不能开始）：搁置着、还没过期的接着做，不再扣 upfront；否则从 0 开始，扣 upfront（扣了不退）。
function begin(s, n) {
  const S = s.strategy;
  const sh = S.shelved[n.id];
  let days = 0;
  if (sh && sh.until >= s.day) days = sh.days;
  else if (n.upfront) applyEffects(s, n.upfront, { source: 'strategy', id: n.id });
  delete S.shelved[n.id];
  S.cur = { id: n.id, days, need: n.days, since: s.day, paused: null };
  S.idleSince = null;
  delete S.snooze;
  pushLog(s, n.id, 'start');
  return S.cur;
}
// 开始一项策略。正在做别的就把它搁置 SHELF_DAYS 天（这期间换回来能接着做）。
export function startStrategy(s, id) {
  assertCanAct(s);
  const n = nodeOf(s, id);
  const why = startBlock(s, n);
  if (why) throw new Error(why);
  if (s.strategy.cur) shelveCur(s);
  const c = begin(s, n);
  log(s, `公司策略：开始「${n.title}」${c.days ? `（接着搁置前的 ${c.days} 天）` : ''}`);
  return c;
}
// 搁置当前的策略（进度保留 SHELF_DAYS 天）→ 搁置记录 | null。
export function cancelStrategy(s) {
  if (s.status !== 'playing' || !s.strategy?.cur) return null;
  const id = s.strategy.cur.id;
  const sh = shelveCur(s);
  s.strategy.idleSince = s.day;
  log(s, `公司策略：先放下「${nodeOf(s, id)?.title ?? id}」，已做的 ${sh.days} 天保留到 ${fmtDay(sh.until)}`);
  return sh;
}
// 玩家在顾问那里点了“先不做”：这个提醒周期（IDLE_ADVICE_EVERY 天）里顾问不再建议定策略（A4 规则 5）。
export function snoozeStrategyAdvice(s) { if (s.strategy?.tree) s.strategy.snooze = s.day; }
// 路线冷却还剩几天（0 表示可以改路线，B5）：上一次由公司策略改路线以后 ROUTE_COOLDOWN 天内，带 stance 的节点都不能开始。
export function routeChangeBlocked(s) { return routeCooldownLeft(s); }

// ---------- 完成 ----------
// 特质的增删（A4 规则 4 第 2 步）。day：开局播种时按史实日算，带期限的特质在开局前就过期的不加。
function applySpirits(s, n, day) {
  const notes = [];
  for (const id of n.spirits?.remove || []) if (hasSpirit(s, id)) { removeSpirit(s, id); notes.push(`失去特质「${spiritDef(s, id)?.title ?? id}」`); }
  for (const x of n.spirits?.add || []) {
    const it = typeof x === 'string' ? { id: x } : x;
    if (it.days && addDays(day, it.days) < s.day) continue;
    addSpirit(s, it.id, it.days ?? null, day);
    notes.push(`获得特质「${spiritDef(s, it.id)?.title ?? it.id}」${it.days ? `（${it.days} 天）` : ''}`);
  }
  return notes;
}
// 授名（C2）：rights[hn] = { day, until: max(现实发布 + 365, 完成日 + 180), used, void }。比现实早做到也算数，没有下限。
function grantRight(s, hn, day) {
  const def = (companyFile(s.charId)?.names || []).find(x => x.id === hn);
  const real = typeof def?.real === 'string' ? (def.real.length === 7 ? `${def.real}-15` : def.real) : null;
  const until = [addDays(day, RIGHT_TAIL.afterDone), real ? addDays(real, RIGHT_TAIL.afterReal) : null].filter(Boolean).sort().at(-1);
  s.strategy.rights[hn] ??= { day, until, used: null, void: null };
  return def?.name ?? hn;
}
// 完成一个节点。how：'done'（做完）按顺序：效果 → 特质 → 路线 → 授名 → 解锁 → 专属事件 → 弹卡片或发新闻；
// 'bypass'（条件达成自动完成）和 'start'（开局播种）只增删特质，'start' 另外写效果里的世界标记（例如价格战已经开打）。
// 返回这次实际发生的变化（白话）。
export function completeNode(s, id, how = 'done', { day = s.day } = {}) {
  const S = s.strategy, n = nodeOf(s, id);
  if (!S?.tree || !n) throw new Error(`没有这项策略：${id}`);
  if (!['done', 'bypass', 'start'].includes(how)) throw new Error(`完成方式不对：${how}`);
  const notes = [];
  S.done[id] = { day, how };
  if (S.cur?.id === id) { S.cur = null; S.idleSince = s.day; }
  delete S.shelved[id];
  if (how === 'done') notes.push(...applyEffects(s, n.effects, { source: 'strategy', id }));
  else if (how === 'start' && n.effects?.world) applyEffects(s, { world: n.effects.world }, { source: 'strategy', id });
  notes.push(...applySpirits(s, n, day));
  invalidateMods(s);
  if (how !== 'start') pushLog(s, id, how);
  if (how === 'bypass') {
    if (n.popup !== 'none') s.news.unshift({ date: s.date, day: s.day, type: 'strategy', title: `公司策略：「${n.title}」的条件已经达成，直接算完成`, detail: notes.join('，') });
    log(s, `公司策略：「${n.title}」条件达成，自动完成`);
    return notes;
  }
  if (how === 'start') return notes;
  let route = null;
  if (n.stance) {
    const from = routeOf(s).stance;
    setStance(s, n.stance, { src: 'strategy', by: id, license: n.license ?? null });
    route = { from, to: s.route.stance, license: s.route.license };
    if (from !== s.route.stance) notes.push(`开源路线：${STANCE[from]?.label ?? from} → ${STANCE[s.route.stance].label}`);
  }
  const names = (n.grants?.names || []).map(hn => grantRight(s, hn, day));
  if (names.length) notes.push(`可以争取型号名 ${names.join('、')}`);
  for (const u of n.grants?.unlock || []) S.unlocks[u] ??= day;
  const exCards = nodeExclusives(s, n);
  log(s, `公司策略完成：「${n.title}」`);
  // 带路线或授名的节点一定弹卡片（校验器也这么要求）；popup 'none' 的只发新闻。
  const card = n.popup === 'none' && !n.stance && !names.length ? null
    : { kind: 'strategy', id, v: day, notes, route, plain: true, news: { title: `公司策略完成：${n.title}`, detail: notes.join('，') } };
  if (!card) s.news.unshift({ date: s.date, day: s.day, type: 'strategy', title: `公司策略完成：${n.title}`, detail: notes.join('，') });
  fire(s, { on: 'strategy', id, cards: [card, ...exCards].filter(Boolean) });
  return notes;
}

// ---------- 每天推进 ----------
// 自动绕过（A4 规则 2）：前置都完成、bypass 条件成立的节点直接算完成（只发特质）。一个绕过可能让别的也满足前置，最多连着过几轮。
function autoBypass(s) {
  const t = resolvedTree(s);
  for (let round = 0; round < 6; round++) {
    let hit = false;
    for (const n of t.nodes) {
      if (!n.bypass || isDone(s, n.id) || excludedBy(s, n) || !prereqOk(s, n) || !bypassOk(s, n)) continue;
      completeNode(s, n.id, 'bypass');
      hit = true;
    }
    if (!hit) return;
  }
}
// 第一条不满足的条件（暂停原因）。
function firstUnmet(s, n) {
  const l = availWhy(s, n).find(x => !x.ok) || whyLines(s, n).find(x => !x.ok);
  return l ? `${l.text}（现在：${l.now}）` : '条件不满足';
}
// 永久失效的原因（白话）：互斥的那一项已经完成；或者 available 里永远成立不了的那一条，各类条件有自己的说法（cond.js 的 condPermanentWhy），
// 例如里程碑被别家拿走写“开源推理追上前沿这件事，阿里巴巴先做到了”，不许出现的技术已经学会写“已经掌握了「X」，这一项用不上了”。
function voidWhy(s, n) {
  const ex = excludedBy(s, n);
  if (ex) return `已经选了「${nodeOf(s, ex)?.title ?? ex}」，这一项不能再做了`;
  return condPermanentWhy(s, n.available) || '条件再也满足不了了';
}
// 每天（tickDay 里紧跟研究推进之后）：到期的特质、限时加成和搁置进度清掉 → 局内“集团出过 SOTA” → 自动绕过 → 永久失效
// → 推进当前节点（条件不满足就暂停）→ 记空闲 → 发布时机规则的记账。
export function strategyTick(s, out) {
  registerStrategyKind();
  if (!ensureStrategy(s)) return;
  const S = s.strategy;
  expireSpirits(s);
  if (Array.isArray(s.boosts) && s.boosts.some(b => !(b?.until > s.day))) s.boosts = s.boosts.filter(b => b?.until > s.day);
  for (const [id, sh] of Object.entries(S.shelved)) if (!(sh?.until >= s.day)) delete S.shelved[id];
  // A4 规则 8、D10.5：同集团别的模态拿到算数标签（kinTick 写 s.sota.kin）的次日，技术储备不足换成集团出过，只发新闻。
  if (s.sota?.kin && hasSpirit(s, 'g_sota_rookie') && !sotaMade(s)) {
    removeSpirit(s, 'g_sota_rookie');
    addSpirit(s, 'g_sota_kin');
    s.news.unshift({ date: s.date, day: s.day, type: 'strategy', title: '公司特质：技术储备不足 → 集团出过 SOTA', detail: SPIRITS.g_sota_kin.desc });
    log(s, '公司特质：集团出过 SOTA');
  }
  autoBypass(s);
  for (const id of Object.keys(S.shelved)) { const n = nodeOf(s, id); if (!n || permanent(s, n)) delete S.shelved[id]; }
  const c = S.cur;
  const n = c ? nodeOf(s, c.id) : null;
  if (c && !n) S.cur = null;
  else if (c && permanent(s, n)) {
    S.cur = null;
    pushLog(s, n.id, 'void');
    s.queue.push({ kind: 'notice', title: `「${n.title}」做不成了`, text: `「${n.title}」做不成了：${voidWhy(s, n)}。${c.days >= 1 ? `已经做的 ${Math.floor(c.days)} 天作废，` : ''}换一项策略吧。` });
    log(s, `公司策略：「${n.title}」做不成了`);
  }
  // 授名作废（C2）只在 naming.js 的 namingTick 里做一份（release.js 的 dailyDeploy 每天调用），这里不再重复。
  if (S.cur) {
    const cn = nodeOf(s, S.cur.id);
    if (!availOk(s, cn) || !fromOk(s, cn)) {
      const why = firstUnmet(s, cn);
      if (!S.cur.paused) pushLog(s, cn.id, 'pause');
      S.cur.paused = why;
    } else {
      S.cur.paused = null;
      S.cur.days = Math.round((S.cur.days + 1 + modifier(s, 'strategySpeed')) * 1000) / 1000;
      if (S.cur.days >= S.cur.need) {
        const notes = completeNode(s, cn.id, 'done');
        out?.notes?.push(`公司策略完成：${cn.title}${notes.length ? `（${notes.join('，')}）` : ''}。`);
      }
    }
  }
  if (S.cur) S.idleSince = null;
  else S.idleSince ??= s.day;
  holdTick(s);
}

// ---------- 新开局 ----------
// 播种（A4 规则 7）：开局特质和国家说明特质 → 第 0 步（按 s.sota.seed：★ 以 start 完成 g_sota，○ 加“集团出过”，— 加“技术储备不足”）
// → 史实日期早于开局的史实节点按日期、前置满足的前提下记为 start（互斥方随之排除，跳过架空和自动节点）
// → 开局才播种进行中的策略：开局后 SEED_WINDOW 天内最早一个前置满足的史实节点，进度按离史实日还有几天算；没有就让顾问挑一项（adaptive）。
// startOverride 只写例外：skip 的不预完成，done 的另外预完成，cur 指定开局进行中的那一项。路线不经过播种（B6 的表才是开局路线）。
export function initStrategy(s) {
  registerStrategyKind();
  const t = resolvedTree(s);
  if (!t) return null;
  // 开局特质和第 0 步都记在真实开局当天，不接受存档日补种。
  const st = s.day;
  s.strategy = { tree: t.id, cur: null, shelved: {}, done: {}, spirits: {}, rights: {}, unlocks: {}, ex: {}, exPending: [], idleSince: null, log: [] };
  const S = s.strategy;
  const file = companyFile(s.charId);
  for (const id of [...(file?.startSpirits || []), ...countrySpirits(s)]) if (spiritDef(s, id) && !S.spirits[id]) addSpirit(s, id, null, st);
  const seed = s.sota?.seed ?? (sotaMade(s) ? '★' : '—');
  if (seed === '★' && t.byId.has('g_sota')) completeNode(s, 'g_sota', 'start', { day: st });
  else if (!S.spirits.g_sota_maker) addSpirit(s, seed === '○' ? 'g_sota_kin' : 'g_sota_rookie', null, st);
  const ov = file?.startOverride?.[s.scenario] || {};
  const skip = new Set(ov.skip || []);
  const order = new Map(t.nodes.map((n, i) => [n.id, i]));
  const byDate = (a, b) => (histDay(a) < histDay(b) ? -1 : histDay(a) > histDay(b) ? 1 : order.get(a.id) - order.get(b.id));
  const histNodes = t.nodes.filter(n => histDay(n) && !n.fiction && !n.auto).sort(byDate);
  const cutoff = st;
  for (const n of histNodes) {
    if (histDay(n) >= cutoff || skip.has(n.id) || isDone(s, n.id) || !prereqOk(s, n) || excludedBy(s, n)) continue;
    completeNode(s, n.id, 'start', { day: histDay(n) });
  }
  for (const id of ov.done || []) { const n = nodeOf(s, id); if (n && !isDone(s, id)) completeNode(s, id, 'start', { day: histDay(n) && histDay(n) < st ? histDay(n) : st }); }
  {
    const seedNode = histNodes.find(n => histDay(n) >= st && daysBetween(st, histDay(n)) < SEED_WINDOW && !skip.has(n.id) && !isDone(s, n.id) && prereqOk(s, n) && !excludedBy(s, n));
    const forced = ov.cur ? nodeOf(s, ov.cur) : null;
    if (forced) { S.cur = { id: forced.id, days: 0, need: forced.days, since: st, paused: null }; pushLog(s, forced.id, 'start'); }
    else if (seedNode) {
      const need = seedNode.days;
      S.cur = { id: seedNode.id, days: clamp(need - daysBetween(st, histDay(seedNode)), 0, need - SEED_MIN_LEFT), need, since: st, paused: null };
      pushLog(s, seedNode.id, 'start');
    } else {
      const id = pickStrategy(s, 'adaptive');
      if (id) begin(s, nodeOf(s, id));
    }
  }
  S.idleSince = S.cur ? null : s.day;
  invalidateMods(s);
  return S;
}
// 当前结构必须有初始化的策略树；运行中不替开发期旧档补树。
export function ensureStrategy(s) {
  if (!s?.strategy?.tree) throw Error('不支持缺少策略树的旧存档，请新开一局');
  return s.strategy;
}

// ---------- 完成卡片（kind strategy） ----------
// 节点完成时弹的卡（popup 为 card 或 scene）：效果清单、路线变化前后、可争取的型号名、现实中的这一步。没有选项，落选时只进新闻。
function strategyView(s, q) {
  const n = nodeOf(s, q.id);
  const lines = [n?.desc, (q.notes || []).length ? `完成后：${q.notes.join('；')}。` : describeEffects(n?.effects, s)];
  if (q.route && q.route.from !== q.route.to) lines.push(`开源路线从「${STANCE[q.route.from]?.label ?? q.route.from}」改成「${STANCE[q.route.to]?.label ?? q.route.to}」：${STANCE[q.route.to]?.flagshipOpen ? '以后的旗舰必须开放权重' : '以后的旗舰不开放权重'}，小模型发布时自己选。`);
  if (n?.hist?.text) lines.push(`现实中：${n.hist.text}`);
  return { kind: 'strategy', id: q.id, tag: '公司策略', title: `公司策略完成：${n?.title ?? q.id}`, text: lines.filter(Boolean).join('\n'), scene: null, sceneId: n?.scene ?? null, lines: [], choices: [{ id: 'ok', label: '好', hint: '' }] };
}
// 事件种类登记（queue.js 的 registerKind）。几个模块互相引用，本文件可能先于 queue.js 求值：那时登记会碰到还没初始化的变量，
// 就等这一轮模块都加载完再登记；开局、读档、每天推进前也各补一次（幂等）。
let kindsDone = false;
export function registerStrategyKind() {
  registerExclusiveKind();
  if (kindsDone) return;
  registerKind('strategy', { view: strategyView, resolve: () => '', known: (s, q) => !!nodeOf(s, q.id) });
  kindsDone = true;
}
try { registerStrategyKind(); } catch (e) { if (!(e instanceof ReferenceError)) throw e; queueMicrotask(registerStrategyKind); }
export { CORE_NODE_IDS };
