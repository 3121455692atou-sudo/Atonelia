// 事件队列：眼前这条事件怎么显示（currentEvent）、怎么结算（resolveEvent）；台词名牌、行业大事短剧、文案填空；各钩子的弹窗入队（fire，弹窗预算）。
// 新的事件种类（strategy、exclusive……）在自己的模块里用 registerKind 登记怎么显示、怎么结算，这里不用跟着改。
import { characterById, plateAt, personaPlate, fmtDate } from '../data/core.js';
import { EVENTS } from '../data/events.js';
import { SUPER_BY_ID } from '../data/super.js';
import { SCENES } from '../data/history.js';
import { FAMILIES } from '../data/rivals.js';
import { POPUP_PER_HOOK } from '../data/balance.js';
import { addDays } from './clock.js';
import { P } from './provider.js';
import { workingModel, liveModel } from './model.js';
import { milestoneCandidates } from './milestones.js';
import { MS_BY_ID } from '../data/milestones.js';
import { goalView, resolveGoal } from './board.js';
import { eventParams, choiceBlocked, applyEventChoice } from './events.js';
import { freezeDistillChoice, milestoneView, applyMilestoneChoice, realOf } from './milestone_view.js';
import { superDef, superActionPlan, applySuperChoice } from './super.js';
import { describeEffects } from './effects.js';
import { modelLabel } from './naming.js';

// ---------- 弹窗预算（规格 E4） ----------
// fire(s, ctx) 是各钩子触发弹窗的统一入口。ctx.on：release、tech、paper、month、strategy、rival、rivaltech、reopen（其余字段随钩子：model、rel、tech……）。
// 同一个钩子的候选先合并：里程碑由 fire 自己查（ctx.milestones === false 时不查），别的模块的候选卡片放在 ctx.cards 里传进来
// （专属事件、策略完成卡、超事件）。每张候选就是要入队的队列项 { kind, id, … }，可以另带：
//   supersedes: { milestone: [id…], event: [id…] }  同一时刻吞并的弹窗：被吞的里程碑账本照记、只发一条快讯；被吞的经营事件从队列和排期里拿掉；
//   plain: true、news: { title, detail }            没有选项的卡片：落选时只发这条新闻。
// 先应用 supersedes，再按优先级排（专属事件 > 行业第一次 > 公司策略 > 自家里程碑 > 超事件），最多入队 POPUP_PER_HOOK 张；
// 同一天弹出来的这几类卡片（POPUP_KINDS）最多 POPUP_PER_DAY 张（当天的名额被还没处理的卡占着、新来的更要紧时，把它挤下来）。落选的：
//   行业第一次：账本照记，只发一条快讯；自家里程碑：从账本撤掉，下次满足条件时再说；
//   带选项的卡片：顺延 DEFER_DAYS 天（排进 s.scheduled）；没有选项的：进新闻。
// 月结那一次还管经营事件：每月最多 MONTH_EVENTS 张，多的顺延一个月（monthEventBudget）。
// “同一天”按卡片弹出来（处理）的那天算：队列里还没处理的卡片都是今天要弹的（队列不空时 tickDay 不推进）；
// 今天入队的、今天处理过的记在 s.popup = { day, cards: [{ kind, id, v, p }] }。tickDay 一开始（队列已经清空）调 closePopupDay：
// 这一天不会再弹卡了，推进途中触发的卡要到第二天才弹，只按队列数。月结散到下个月的卡、顺延的卡从排期放出来时走 admit，和当天的卡共用名额。
// plain、news 留在入队的卡片上：月结散出去、以后放出来时再落选，也照样只发新闻。返回这次入队的卡片。
const POPUP_PER_DAY = 1;
const DEFER_DAYS = 3;
const FIRE_ONLY = ['supersedes'];
// 超事件里什么都不动的选项（“先不动”“再看看”）的提示（规格 E1：没有效果的选项用统一文案）。
const SUPER_NO_EFFECT = '不花钱，什么都不变';
export const POPUP_KINDS = new Set(['milestone', 'super', 'exclusive', 'strategy']);
export function prioOf(item) {
  if (item.kind === 'exclusive') return 0;
  if (item.kind === 'milestone') return MS_BY_ID[item.id]?.type === 'first' ? 1 : 3;
  if (item.kind === 'strategy') return 2;
  if (item.kind === 'super') return 4;
  return 5;
}
export function fire(s, ctx) {
  if (ctx.on === 'month' && ctx.milestones !== false) monthEventBudget(s);
  const cands = [...(ctx.milestones === false ? [] : milestoneCandidates(s, ctx)), ...(ctx.cards || [])];
  if (!cands.length) return [];
  // 1) supersedes：候选里、当天已经入队的，一起吞掉。
  const sup = { milestone: new Set(), event: new Set() };
  for (const c of cands) for (const k of Object.keys(sup)) for (const id of c.supersedes?.[k] || []) sup[k].add(id);
  const rest = [];
  for (const c of cands) if (c.kind === 'milestone' && sup.milestone.has(c.id)) swallow(s, c); else rest.push(c);
  if (sup.milestone.size || sup.event.size) {
    unqueue(s, q => (q.kind === 'milestone' && sup.milestone.has(q.id)) || ((q.kind ?? 'event') === 'event' && sup.event.has(q.id)), q => { if (q.kind === 'milestone') swallow(s, q); });
  }
  // 2) 按优先级排。同一次做到好几件“行业第一次”时，先弹现实里更晚才发生的那件（比现实早得更多，也更难）；其余同级的保持原来的顺序。
  const realDay = c => (c.kind === 'milestone' && prioOf(c) === 1 ? realOf(MS_BY_ID[c.id])?.date || '' : '');
  const ranked = rest.map((c, i) => ({ c, p: prioOf(c), r: realDay(c), i })).sort((a, b) => a.p - b.p || (a.r > b.r ? -1 : a.r < b.r ? 1 : 0) || a.i - b.i);
  // 3) 入队，最多 POPUP_PER_HOOK 张；当天的预算用完了就看能不能把当天那张挤下来。
  const shown = [];
  for (const { c, p } of ranked) {
    if (shown.length < POPUP_PER_HOOK && makeRoom(s, p)) { enqueue(s, c, p); shown.push(c); } else drop(s, c);
  }
  return shown;
}
// 月结产生的经营事件每月最多 MONTH_EVENTS 张（规格 E4）：月结的里程碑检查（loop.js 在经营事件之后调 fire({ on: 'month' })）时，
// 这一天排进队列的经营事件多出来的，按原来的先后顺延一个月。
const MONTH_EVENTS = 2;
function monthEventBudget(s) {
  const extra = s.queue.filter(q => (q.kind ?? 'event') === 'event').slice(MONTH_EVENTS);
  if (!extra.length) return;
  s.queue = s.queue.filter(q => !extra.includes(q));
  extra.forEach((item, i) => s.scheduled.push({ at: addDays(s.day, 30 + i), item }));
}
// 旧名字：P0.3a 之前的调用点（loop.js、release.js）还用它，和 fire 完全一样。
export function milestoneFire(s, ctx) { return fire(s, ctx); }

const sameCard = (q, ref) => !!q && q.kind === ref.kind && q.id === ref.id && (q.v ?? null) === (ref.v ?? null);
const today = s => (s.popup?.day === s.day ? s.popup : null);
// 眼前正在结算的那一项（resolveEvent 里）：它已经弹出来了，不能被挤掉或吞掉。
let RESOLVING = null;
// 今天占名额的：s.popup 里记下的（今天入队的、今天处理过的），加上队列里还没处理、也没记下的这几类卡片（排期放出来的、昨天推进途中入队的）。
function todayCards(s) {
  const recs = today(s)?.cards || [];
  const waiting = s.queue.filter(q => q && (POPUP_KINDS.has(q.kind) || recs.some(x => sameCard(q, x))));
  return { waiting, n: recs.length + waiting.filter(q => !recs.some(x => sameCard(q, x))).length };
}
function makeRoom(s, p) {
  const { waiting, n } = todayCards(s);
  if (n < POPUP_PER_DAY) return true;
  // 今天最不要紧、还在队列里没处理的那张，比新来的更不要紧时挤下来。
  const old = waiting.filter(q => q !== RESOLVING && prioOf(q) > p).sort((a, b) => prioOf(b) - prioOf(a))[0];
  if (!old) return false;
  s.queue.splice(s.queue.indexOf(old), 1);
  const slot = today(s);
  if (slot) slot.cards = slot.cards.filter(x => !sameCard(old, x));
  drop(s, old);
  return true;
}
function mark(s, item, p) {
  if (!today(s)) s.popup = { day: s.day, cards: [] };
  if (!s.popup.cards.some(x => sameCard(item, x))) s.popup.cards.push({ kind: item.kind, id: item.id, v: item.v ?? null, p });
}
function enqueue(s, c, p) {
  const item = { ...c };
  for (const k of FIRE_ONLY) delete item[k];
  freezeDistillChoice(s, item);
  s.queue.push(item);
  mark(s, item, p);
}
// 排期里放出来的一项（loop.js 的 releaseNow）：这几类卡片和当天弹的卡共用名额，名额满了按落选处理（行业第一次发快讯、
// 自家里程碑撤回、带选项的再顺延、没有选项的进新闻）；别的（经营事件、提示……）直接入队。入队时已经冻结过蒸馏选项，这里不再冻结。
export function admit(s, item) {
  if (!POPUP_KINDS.has(item?.kind)) { s.queue.push(item); return true; }
  const p = prioOf(item);
  if (!makeRoom(s, p)) { drop(s, item); return false; }
  s.queue.push(item);
  mark(s, item, p);
  return true;
}
// 一天推进开始（tickDay，队列已经清空）：今天不会再弹卡了。推进途中触发的卡要到第二天才弹，只按队列数，不算今天处理过的。
export function closePopupDay(s) { s.popup = null; }
const whoName = fam => (fam === 'academia' ? '学界' : FAMILIES[fam]?.company || fam || '');
function flash(s, title, detail = '') { s.news.unshift({ date: s.date, day: s.day, type: 'milestone', title, detail }); }
// 里程碑只发一条快讯，账本照记（被吞并的、落选的行业第一次）。
function swallow(s, q) {
  const ms = MS_BY_ID[q.id];
  const e = s.ms?.[q.id];
  if (!ms || !e) return;
  e.silent = true;
  if (e.who === 'me') flash(s, ms.type === 'first' ? `行业第一次：${ms.title}` : `我们的里程碑：${ms.title}`, e.model || '');
  else flash(s, `${whoName(e.who)}：${ms.title}`, q.rel || e.model || q.note || '');
}
// 落选的卡片。
function drop(s, c) {
  if (c.kind === 'milestone') {
    const ms = MS_BY_ID[c.id];
    if (ms?.type === 'first' || c.v === 'rival') swallow(s, c);
    else if (s.ms?.[c.id]?.who === 'me') delete s.ms[c.id];
    return;
  }
  if (c.plain) { if (c.news) s.news.unshift({ date: s.date, day: s.day, type: c.kind, ...c.news }); return; }
  const item = { ...c };
  for (const k of FIRE_ONLY) delete item[k];
  s.scheduled.push({ at: addDays(s.day, DEFER_DAYS), item });
}
// 从队列和排期里拿掉满足 pred 的项（眼前正在结算的那一项除外），each 处理拿掉的每一项。
function unqueue(s, pred, each) {
  const gone = [];
  s.queue = s.queue.filter(q => (q !== RESOLVING && pred(q) ? (gone.push(q), false) : true));
  s.scheduled = s.scheduled.filter(x => (x.item && pred(x.item) ? (gone.push(x.item), false) : true));
  const slot = today(s);
  if (slot) slot.cards = slot.cards.filter(ref => !gone.some(q => sameCard(q, ref)));
  gone.forEach(each);
}

// ---------- 事件种类登记 ----------
// def：{ view(s, q) → 和 currentEvent 一样的视图（要有 choices），resolve(s, q, choiceId) → 结果文字，known?(s, q) → 读档时这一项还认不认得 }。
// 自己记账（seen、ex……）在 resolve 里做；resolveEvent 只负责出队。
// 内置种类：notice 提示、board 董事会目标、world 行业大事、super 超事件、milestone 里程碑、event 经营事件（处理过的记进 s.seen）。
const BUILTIN = ['notice', 'board', 'world', 'super', 'milestone', 'event'];
const KINDS = new Map();
export function registerKind(kind, def) {
  if (BUILTIN.includes(kind)) throw new Error(`事件种类 ${kind} 是内置的，不能再登记`);
  if (KINDS.has(kind)) throw new Error(`事件种类 ${kind} 已经登记过`);
  if (typeof def?.view !== 'function' || typeof def?.resolve !== 'function') throw new Error(`事件种类 ${kind} 要有 view 和 resolve`);
  KINDS.set(kind, def);
}
// 队列里这一项还认不认得（读档时清理坏项用，规格 E8 第 5 步）：种类认得，需要 id 的 id 也认得。
export function knownQueueItem(s, q) {
  if (!q || typeof q !== 'object') return false;
  const kind = q.kind ?? 'event';
  if (kind === 'notice') return true;
  if (kind === 'board') return (s.goals || []).some(g => g.id === q.id);
  if (kind === 'world') return !!P().worldEvent(q.id);
  if (kind === 'super') return !!SUPER_BY_ID[q.id];
  if (kind === 'milestone') return !!MS_BY_ID[q.id];
  if (kind === 'event') return !!EVENTS[q.id];
  const def = KINDS.get(kind);
  return !!def && (def.known ? !!def.known(s, q) : true);
}

// 引擎提示（预训练完成、小模型蒸馏完成）：文案取 data/events.js 里同名的那条，排成一张 notice（规格 E4：提示不记账）。
// 共享教程可按模态选正文；缺失/未知模态仍用中性默认文案，不修改事件定义或状态。
const eventText = (def, s) => typeof def.textByMod?.[s.mod] === 'string' ? def.textByMod[s.mod] : def.text;
export function noticeOf(s, id, params = {}) {
  const def = EVENTS[id];
  return { kind: 'notice', title: fill(def.title, s, params), text: fill(eventText(def, s), s, params) };
}
export function fill(text, s, params = {}) {
  const m = liveModel(s) || workingModel(s);
  // 没发布的模型没有名字（C1）：用代号或“第 N 代底座”，不带“（训练中）”（提示文字会存进队列）。
  const vals = { name: s.persona.name, model: m ? modelLabel(m) : s.persona.name, company: s.company.company, ...params };
  return String(text ?? '').replace(/\{(\w+)\}/g, (_, k) => (vals[k] !== undefined ? vals[k] : `{${k}}`));
}
// 名牌按台词发生的月份取名字（2024 年的小肥鱼还不叫 DeepSeek Flash）。
export function speaker(s, who, params = {}, date = s.date) {
  let id;
  if (who === 'self') id = s.persona.artId;
  else if (who === 'small') id = s.persona.smallArtId || s.persona.artId;
  else id = who.replace(/^npc:/, '');
  if (id === '{tool}') id = params.tool;
  const c = characterById(id);
  const isSelf = who === 'self' || who === 'small';
  if (!c) return { id: s.persona.artId, ...personaPlate(s.persona, date), isSelf: true };
  return { id: c.id, ...(who === 'self' ? personaPlate(s.persona, date) : plateAt(c.id, date)), isSelf };
}
// 玩家自己的角色出现在别家的行业大事里时换成 self。短剧原来的 self 是旁观的另一家公司，这时两边会撞成同一个人：
// 一般去掉旁观者的台词。下面两段反过来，去掉玩家角色在现实里的台词、留下旁观者：
// 价格战之后马上要玩家决定跟不跟降价，蒸馏指控里玩家有没有蒸馏也是玩家自己的事，都不能替玩家先说了。
const KEEP_BYSTANDER = new Set(['w_pricewar', 'w_distill_war']);
export function worldScene(s, w) {
  const raw = SCENES[w.id];
  if (!raw) return null;
  const mine = new Set([s.charId, s.persona.artId, s.persona.smallArtId].filter(Boolean));
  let lines = raw;
  if (raw.some(l => mine.has(l.who)) && raw.some(l => l.who === 'self')) lines = KEEP_BYSTANDER.has(w.id) ? raw.filter(l => !mine.has(l.who)) : raw.filter(l => l.who !== 'self');
  return named(s, lines.map(l => (mine.has(l.who) ? { ...l, who: l.who === s.persona.smallArtId ? 'small' : 'self' } : l)), w.date);
}
export const named = (s, lines, date) => lines.map(l => (l.who === 'narr' ? l : { ...l, name: speaker(s, l.who, {}, date).name }));
export function currentEvent(s, at = 0) {
  const q = s.queue[at];
  if (!q) return null;
  if (q.kind === 'notice') return { kind: 'notice', tag: '提示', title: q.title, text: q.text, lines: [], choices: [{ id: 'ok', label: '知道了', hint: '' }] };
  if (q.kind === 'board') return goalView(s, q.id);
  if (q.kind === 'world') {
    const w = P().worldEvent(q.id);
    return { kind: 'world', wtype: w.type, tag: '行业大事', title: w.title, text: w.detail, date: w.date, scene: worldScene(s, w), lines: [], choices: [{ id: 'ok', label: '继续', hint: '' }] };
  }
  if (q.kind === 'super') {
    const e = superDef(s, q);
    const params = { ...(q.params || {}), date: fmtDate(s.date) };
    return { kind: 'super', id: e.id, bg: e.bg, tag: '超事件', title: fill(e.title, s, params), text: fill(e.text, s, params), date: s.date,
      scene: named(s, e.scene.map(l => ({ ...l, text: fill(l.text, s, params) })), s.date), lines: [],
      choices: e.choices.map(c => {
        const plan = superActionPlan(s, c);
        // 提示（规格 E1）：真实操作的计划在前，数值效果由 describeEffects 生成；两样都没有就用统一文案。
        const fx = describeEffects(c.effects, s);
        return { id: c.id, label: fill(c.label, s, params), hint: [plan.hint, fx].filter(Boolean).join('；') || SUPER_NO_EFFECT,
          disabled: plan.disabled || (c.effects?.cash < 0 && s.cash < -c.effects.cash ? '现金不足' : '') };
      }) };
  }
  if (q.kind === 'milestone') return milestoneView(s, q);
  const reg = KINDS.get(q.kind);
  if (reg) return reg.view(s, q);
  const def = EVENTS[q.id];
  const params = eventParams(s, q);
  return {
    kind: 'event', id: q.id, tag: def.tag, title: fill(def.title, s, params), text: fill(eventText(def, s), s, params),
    lines: def.lines.map(([who, text]) => ({ ...speaker(s, who, params), text: fill(text, s, params) })),
    choices: def.choices.map(c => ({ id: c.id, label: fill(c.label, s, params), hint: fill(c.hint, s, params), ...(c.distill ? { distill: true } : {}), disabled: choiceBlocked(s, q, c.id) })),
  };
}

// 处理队列里的第 at 张卡（默认第 0 张，行为不变；M.6.4 的收件箱按下标处理任意一张到期的卡）。
export function resolveEvent(s, choiceId, at = 0) {
  const q = s.queue[at];
  if (!q) throw new Error('没有待处理的事件');
  if (q.kind === 'board') return resolveGoal(s, q.id);
  const view = currentEvent(s, at);
  const choice = view.choices.find(c => c.id === choiceId);
  if (!choice) throw new Error('无效选项');
  if (choice.disabled) throw new Error(choice.disabled);
  let text = '';
  // 结算时可能又触发弹窗（公开论文、效果里排进的事件）：眼前这一项不能被挤掉，结算完按对象拿掉它，不按位置。
  RESOLVING = q;
  try {
    if (q.kind === 'event') text = applyEventChoice(s, q, choiceId);
    if (q.kind === 'milestone') text = applyMilestoneChoice(s, q, choiceId);
    if (q.kind === 'super') text = applySuperChoice(s, q, choiceId);
    if (KINDS.has(q.kind)) text = KINDS.get(q.kind).resolve(s, q, choiceId) ?? '';
  } finally { RESOLVING = null; }
  const idx = s.queue.indexOf(q);
  if (idx >= 0) s.queue.splice(idx, 1);
  // 这几类卡片记进今天弹过的（昨天推进途中入队、今天才弹出来的，也算今天的名额）。
  if (POPUP_KINDS.has(q.kind)) mark(s, q, prioOf(q));
  // 经营事件记次数（cond 的 seen、只出一次的事件读它）；里程碑记在 s.ms，超事件出的时候就记在 s.marks，这里不再记。
  if (q.kind === 'event') s.seen[q.id] = (s.seen[q.id] || 0) + 1;
  return { title: view.title, choice: choice.label, text };
}
