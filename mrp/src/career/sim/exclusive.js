// 专属事件（规格 C4，kind exclusive）的引擎部分：登记、检查、弹卡和结算。事件本身写在公司文件的 exclusives 里（内容包）。
// 一条专属事件先要“登记”：完成（做完，不算绕过和开局播种）的节点在 grants.events 里列了它。登记以后：
//   on 'node'：那个节点完成时检查（delay 不为 0 或有 within 的，进 exPending 按月检查）；
//   on 'release'：用 name 那个授名发布时检查一次（name 为空的，任何一次旗舰发布都算）；
//   on 'month'：用 name 那个授名发布以后（name 为空的，从节点完成那天起），在 [起点 + delay[0], 起点 + max(delay[1], delay[0] + within)] 里
//               每次月结检查，cond 一成立就弹，过了窗口就作罢。
// cond 不满足就不弹，授名不受影响。每条最多出一次（s.strategy.ex 记日子）。没有随机数。
// 弹出时先结算事件自带的 effects，带选项的卡片在玩家选了以后再结算选项；notice 为 true 的不弹卡，只发新闻（效果照样生效，例如加特质）。
// 卡片和里程碑、策略完成卡一起过弹窗预算（queue.js 的 fire）：supersedes 吞掉同一时刻的里程碑和经营事件弹窗。
// 钩子：loop.js 的月结调 exclusiveMonth；release.js 的 doRelease 在里程碑之后调 afterRelease；strategy.js 的 completeNode 调 nodeExclusives。
import { companyFile } from '../data/companies/index.js';
import { addDays } from './clock.js';
import { cond } from './cond.js';
import { applyEffects, describeEffects } from './effects.js';
import { fire, registerKind } from './queue.js';
import { relRole } from './sota.js';
import { log } from './log.js';
import { resolvedTree } from './strategy.js';

const defs = s => companyFile(s.charId)?.exclusives || [];
export const exclusiveDef = (s, id) => defs(s).find(x => x.id === id) ?? null;
// 已经登记的专属事件：做完的节点的 grants.events。
function armed(s) {
  const out = new Set(), t = resolvedTree(s);
  for (const [id, d] of Object.entries(s.strategy?.done || {})) if (d?.how === 'done') for (const e of t?.byId.get(id)?.grants?.events || []) out.add(e);
  return out;
}
const modelById = (s, id) => (id ? (s.models || []).find(m => m.id === id) ?? null : null);
const fill = (s, text, model) => String(text ?? '').replace(/\{model\}/g, model?.name ?? '').replace(/\{company\}/g, s.company?.company ?? '');
// 检查窗口：起点之后 delay[0] 天开始，到 max(delay[1], delay[0] + within) 天为止。
function windowOf(x, base) {
  const [d0 = 0, d1 = d0] = x.delay || [];
  return { from: addDays(base, d0), until: addDays(base, Math.max(d1, d0 + (x.within || 0))) };
}
function pend(s, x, modelId, base) {
  const P = (s.strategy.exPending ??= []);
  if (P.some(p => p.id === x.id)) return;
  P.push({ id: x.id, modelId: modelId ?? null, ...windowOf(x, base) });
}
// 出一条：记账、结算事件自带的效果，返回要过弹窗预算的卡片（notice 的只发新闻，返回 null）。
function trigger(s, x, model) {
  s.strategy.ex[x.id] = s.day;
  s.strategy.exPending = (s.strategy.exPending || []).filter(p => p.id !== x.id);
  const notes = applyEffects(s, x.effects, { source: 'exclusive', id: x.id, model: model ?? undefined });
  const title = fill(s, x.title, model);
  log(s, `专属事件：${title}`);
  if (x.notice) { s.news.unshift({ date: s.date, day: s.day, type: 'exclusive', title, detail: [x.hist?.text, notes.join('，')].filter(Boolean).join(' ') }); return null; }
  return { kind: 'exclusive', id: x.id, modelId: model?.id ?? null, notes, supersedes: x.supersedes || undefined,
    ...(x.choices?.length ? {} : { plain: true, news: { title, detail: notes.join('，') } }) };
}
const cardsOf = (s, list) => list.filter(Boolean);
// 节点做完时（completeNode 第 6 步）：on 'node' 的当场检查或进窗口，name 为空的 on 'month' 从今天起进窗口。返回卡片，和策略完成卡一起过弹窗预算。
export function nodeExclusives(s, n) {
  if (!s.strategy || !(n.grants?.events || []).length) return [];
  const mine = new Set(n.grants.events);
  const cards = [];
  for (const x of defs(s)) {
    if (!mine.has(x.id) || s.strategy.ex[x.id]) continue;
    if (x.on === 'node' && (!x.node || x.node === n.id)) {
      if ((x.delay?.[0] || 0) > 0 || x.within) pend(s, x, null, s.day);
      else if (cond(s, x.cond)) cards.push(trigger(s, x, null));
    } else if (x.on === 'month' && !x.name) pend(s, x, null, s.day);
  }
  return cardsOf(s, cards);
}
// 发布之后（doRelease 在里程碑之后调用）：on 'release' 的当场检查；带这个授名的 on 'month' 从今天起进窗口。grant 是这次用上的授名 id。
export function afterRelease(s, snap, grant = null) {
  if (!s.strategy?.tree || !snap) return [];
  const on = armed(s);
  const cards = [];
  for (const x of defs(s)) {
    if (!on.has(x.id) || s.strategy.ex[x.id]) continue;
    const hit = x.name ? x.name === grant : relRole(snap) === 'flagship';
    if (!hit) continue;
    if (x.on === 'release') { if (cond(s, x.cond, { model: snap })) cards.push(trigger(s, x, snap)); }
    else if (x.on === 'month' && x.name) pend(s, x, snap.id, s.day);
  }
  const list = cardsOf(s, cards);
  return list.length ? fire(s, { on: 'release', model: snap, milestones: false, cards: list }) : [];
}
// 月结：窗口里的逐条检查，cond 成立就弹；过了窗口的作罢。
export function exclusiveMonth(s, report) {
  const S = s.strategy;
  if (!S?.tree || !S.exPending?.length) return [];
  const cards = [];
  for (const p of [...S.exPending]) {
    const x = exclusiveDef(s, p.id);
    if (!x || S.ex[p.id] || s.day > p.until) { S.exPending = S.exPending.filter(y => y !== p); continue; }
    if (s.day < p.from) continue;
    const model = modelById(s, p.modelId);
    if (cond(s, x.cond, { model: model ?? undefined })) cards.push(trigger(s, x, model));
  }
  const list = cardsOf(s, cards);
  return list.length ? fire(s, { on: 'month', milestones: false, cards: list }) : [];
}

// ---------- 卡片（kind exclusive） ----------
function view(s, q) {
  const x = exclusiveDef(s, q.id);
  const model = modelById(s, q.modelId);
  const choices = x?.choices?.length
    ? x.choices.map(c => ({ id: c.id, label: fill(s, c.label, model), hint: c.hint ? fill(s, c.hint, model) : describeEffects(c.effects, s) }))
    : [{ id: 'ok', label: '好', hint: '' }];
  const text = [x?.hist?.text ? `现实中：${x.hist.text}` : '', (q.notes || []).length ? `${q.notes.join('；')}。` : ''].filter(Boolean).join('\n');
  return { kind: 'exclusive', id: q.id, tag: '专属事件', title: fill(s, x?.title ?? q.id, model), text, scene: null, sceneId: x?.scene ?? null, lines: [], choices };
}
function resolve(s, q, choiceId) {
  const c = (exclusiveDef(s, q.id)?.choices || []).find(y => y.id === choiceId);
  if (!c) return '';
  return applyEffects(s, c.effects, { source: 'exclusive', id: q.id, model: modelById(s, q.modelId) ?? undefined }).join('，');
}
// 事件种类登记（同 strategy.js：本文件可能先于 queue.js 求值，那时等这一轮模块加载完再登记）。
let kindDone = false;
export function registerExclusiveKind() {
  if (kindDone) return;
  registerKind('exclusive', { view, resolve, known: (s, q) => !!exclusiveDef(s, q.id) });
  kindDone = true;
}
try { registerExclusiveKind(); } catch (e) { if (!(e instanceof ReferenceError)) throw e; queueMicrotask(registerExclusiveKind); }
