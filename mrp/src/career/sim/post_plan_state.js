import { TECH_BY_ID } from '../data/core.js';
import { resolveTree, treeFor } from '../data/companies/index.js';
import { queryCatalogue, catalogueCard, cardSummary } from './post_catalog.js';
// Single-player session state. Card mechanics remain in the audited rules module.
// No job id, wall clock, client multiplier, or world RNG is used to issue a draw.
import { CARDS, MAX_DECK_SIZE, cardRequirement, unlocked, validDeck, start, choose, preview, settle, replayProof, deckEffect } from './post_catalog_rules.js';
import { hash01 } from './util.js';
import { addDays } from './clock.js';

import { POST_PLAN_FORMAT, POST_PLAN_RULES, postPlanSchema, postPlanIdentity, validPostPlanIdentity, recognizedPostPlanLedger, postPlanSupported } from './post_card_profiles.js';
export { POST_PLAN_FORMAT, POST_PLAN_RULES } from './post_card_profiles.js';
const clone = value => structuredClone(value);
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const integer = value => Number.isSafeInteger(value) && value >= 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isoDay = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d + 'T00:00:00Z')) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
const exact = (value, fields) => plain(value) && Object.keys(value).length === fields.length && fields.every(k=>Object.hasOwn(value,k));
const CONFIG_KEYS=['profileId','catalogVersion','catalogFingerprint','modality','companyId','rulesVersion','techs','strategy'];
const unlockConfig = (s,c) => validPostPlanIdentity(s,c) && exact(c,CONFIG_KEYS) && c.rulesVersion===POST_PLAN_RULES && Array.isArray(c.techs) && new Set(c.techs).size===c.techs.length && c.techs.every(id=>TECH_BY_ID[id]?.mod===s.mod) && exact(c.strategy,['done']) && plain(c.strategy.done) && Object.entries(c.strategy.done).every(([id,v])=>v===true && !!resolveTree(treeFor(s.charId))?.byId.has(id));
const config = s => ({ ...postPlanIdentity(s), rulesVersion: POST_PLAN_RULES, techs: [...new Set((s.techs || []).filter(id=>TECH_BY_ID[id]?.mod===s.mod))], strategy: { done: Object.fromEntries(Object.entries(s.strategy?.done || {}).filter(([id,v])=>v && resolveTree(treeFor(s.charId))?.byId.has(id)).map(([id])=>[id,true])) } });
const legalStatuses = new Set(['draft', 'playing', 'ready', 'active', 'superseded', 'invalid']);
const modelOf = (s, id) => (s.models || []).find(m => m.id === id);
export const trainablePostModel = (s, id) => {
  const m = modelOf(s, id);
  return !!m && m.mod === s.mod && m.stage === 'post' && [s.working, s.prevWorking?.id, s.smallWorking, ...(s.smallShelf || [])].includes(id);
};
// Automatic evaluation must not freeze a model while its manual card workflow
// is unfinished, including a replacement while an older recipe is still active.
// MP callers must still apply their authority check; they never carry this field.
export function postPlanBlocksAutomaticEval(s, modelId) {
  const L = s?.postPlanSessions;
  if (L === undefined) return false;
  if (!recognizedPostPlanLedger(s)) return true;
  try { validatePostSessionSave(s); } catch { return true; }
  const id = L.byModel?.[modelId], p = L.sessions?.[id];
  return !p || p.status !== 'active' || L.activeByModel?.[modelId] !== id;
}
const seedFor = (s, p) => Math.floor(hash01(`${s.seed}|${s.charId}|${p.modelId}|${p.generationToken}|${p.planEpoch}|${p.cardRulesVersion}${p.profileId ? `|${p.profileId}|${p.modality}|${p.catalogFingerprint}` : ''}`) * 4294967296) >>> 0;

export function newPostPlanLedger(s) {
  const schema = postPlanSchema(s);
  if (!schema) throw Error('不支持的后训练卡牌模态或公司');
  return { format: schema.format, ...postPlanIdentity(s), nextGeneration: 0, nextEpoch: 0, generations: {}, byModel: {}, activeByModel: {}, sessions: {}, receipts: {} };
}
function ledger(s) {
  const L = s.postPlanSessions;
  if (s.postCards?.version !== 1 || !plain(L) || !recognizedPostPlanLedger(s)) throw Error('后训练会话版本已更新（v2），不支持旧版或损坏格式；请新开一局，原存档未修改');
  return L;
}
function writable(s) {
  if (s.status !== 'playing') throw Error('这一局已经结束，只能回看');
  if (!postPlanSupported(s)) throw Error('卡牌方案不支持此模态或公司');
}
function needSession(s, id) {
  const L = ledger(s), p = Object.hasOwn(L.sessions, id) ? L.sessions[id] : null;
  if (!p || p.companyId !== s.charId || !validPostPlanIdentity(s, p) || p.cardRulesVersion !== postPlanSchema(s)?.rules || p.directionPolicy !== postPlanSchema(s)?.policy) throw Error('没有可操作的后训练会话');
  if (L.generations[p.modelId]?.token !== p.generationToken) throw Error('后训练模型代际已失效');
  return p;
}
function needRevision(p, revision) {
  if (revision !== p.revision) throw Error('操作已过期，请读取当前回合');
}
function needPlayable(s, p) {
  writable(s);
  if (ledger(s).byModel[p.modelId] !== p.id) throw Error('这不是当前可编排的方案');
  if (!trainablePostModel(s, p.modelId) || modelOf(s, p.modelId)?.evalId) throw Error('目标模型目前不可编排后训练');
  if (p.status === 'invalid') throw Error(p.invalidReason || '后训练会话已失效');
}
export function replayPostSession(s, p) {
  if (!exact(p.unlockProof,['verifiedAtDay','config','rulesVersion']) || p.unlockProof.rulesVersion !== postPlanSchema(s)?.rules || !unlockConfig(s, p.unlockProof.config) || !isoDay(p.unlockProof.verifiedAtDay) || p.unlockProof.verifiedAtDay < p.createdAtDay || p.unlockProof.verifiedAtDay > s.day) throw Error('后训练确认解锁证明损坏');
  if (!p.confirmedDeck || !validDeck(p.confirmedDeck, p.unlockProof?.config) || !validDeck(p.confirmedDeck, config(s))) throw Error('卡组解锁条件已失效');
  if (p.drawTicket !== seedFor(s, p)) throw Error('后训练抽牌票据损坏');
  const r = start(p.drawTicket, 1, p.confirmedDeck, p.unlockProof.config, p.replayProof?.drawRulesVersion ?? 1);
  for (const id of p.choices) if (!choose(r, id).ok) throw Error('后训练出牌记录非法');
  if (!same(p.replayProof, replayProof(r))) throw Error('后训练有限状态回放证明损坏');
  return r;
}
function receiptFor(p) {
  return {
    id: `receipt:${p.id}`, sourceSessionId: p.id, companyId: p.companyId,
    modelId: p.modelId, generationToken: p.generationToken, planEpoch: p.planEpoch,
    cardRulesVersion: p.cardRulesVersion, effectRulesVersion: p.effectRulesVersion,
    directionPolicy: p.directionPolicy,
    profileId: p.profileId, modality: p.modality, catalogVersion: p.catalogVersion, catalogFingerprint: p.catalogFingerprint, replayProof: clone(p.replayProof),
    confirmedDeck: [...p.confirmedDeck], drawTicket: p.drawTicket, choices: [...p.choices],
    unlockProof: clone(p.unlockProof), terminalRevision: p.revision,
    createdAtDay: p.readyAtDay, effectiveFromDay: p.effectiveFromDay,
  };
}
const unlockIds = cfg => CARDS.filter(c => unlocked(c.id, cfg)).map(c => c.id);
const unionUnlocks = (...sets) => CARDS.map(c => c.id).filter(id => sets.some(ids => ids.includes(id)));
// A ready-to-play bag with varied roles. Players can add every unlocked card.
const STARTER_DECKS = [
  ['basic','ptc_qwen_sample_tabs','ptc_mistral_neat_batch','ptc_glm_task_tiles'],
  ['basic','ptc_deepseek_sketch_dedup','ptc_kimi_bookmark_chain','ptc_ernie_entity_cards'],
  ['basic','ptc_claude_red_team_note','ptc_stepfun_small_steps','ptc_elevenlabs_breath_marks'],
];
function recommendedDeck(s) {
  const owned = config(s);
  const deck = STARTER_DECKS.find(ids => validDeck(ids,owned) && deckEffect(ids).efficiency === 1);
  if (!deck) throw Error('当前目录缺少本模态合法入门卡组');
  const extra = STARTER_DECKS.flat().filter(id => unlocked(id,owned));
  return [...new Set([...deck,...extra])];
}
function makeSession(s, generation, epoch, grant = null) {
  const preferred = recommendedDeck(s);
  return {
    id: `post:${generation.token}:${epoch}`, companyId: s.charId, modelId: generation.modelId, generationToken: generation.token, planEpoch: epoch,
    status: 'draft', controlMode: 'manual', revision: 0, choiceRevision: 0, controlChanges: 0, draftChanges: 0,
    cardRulesVersion: postPlanSchema(s).rules, effectRulesVersion: 1, directionPolicy: postPlanSchema(s).policy, ...postPlanIdentity(s),
    draftDeck: preferred,
    confirmedDeck: null, drawTicket: null, unlockProof: null, replayProof: null, choices: [],
    openUnlockProof: { verifiedAtDay: s.day, config: config(s) }, grant,
    createdAtDay: s.day, readyAtDay: null, effectiveFromDay: null, receiptId: null, invalidReason: null,
  };
}
export function openPostSession(s, { modelId, expectedModelToken }) {
  writable(s);
  const L = ledger(s);
  if (!trainablePostModel(s, modelId)) throw Error('没有可后训练的目标模型');
  const known = L.generations[modelId], existing = L.byModel[modelId];
  if (existing && (expectedModelToken === null || expectedModelToken === known?.token)) return postPlanView(s, existing);
  if ((known?.token ?? null) !== expectedModelToken) throw Error('模型代际已改变，请刷新');
  if (known) throw Error('模型会话账缺少当前引用');
  if (L.nextEpoch >= Number.MAX_SAFE_INTEGER || L.nextGeneration >= Number.MAX_SAFE_INTEGER) throw Error('后训练会话编号已用尽');
  const generation = { token: `g${L.nextGeneration + 1}:${modelId}`, modelId, knownUnlocked: unlockIds(config(s)) };
  const epoch = L.nextEpoch + 1, p = makeSession(s, generation, epoch);
  L.nextGeneration++; L.generations[modelId] = generation;
  L.nextEpoch = epoch; L.sessions[p.id] = p; L.byModel[modelId] = p.id;
  return postPlanView(s, p.id);
}
export function replanPostSession(s, { sessionId, expectedRevision }) {
  const p = needSession(s, sessionId); needPlayable(s, p); needRevision(p, expectedRevision);
  if (!['ready', 'active'].includes(p.status)) throw Error('请先完成当前方案，再使用新解锁卡重新组牌');
  const L = ledger(s), generation = L.generations[p.modelId], now = unlockIds(config(s));
  const added = now.filter(id => !generation.knownUnlocked.includes(id));
  if (!added.length) throw Error('尚无新增真实解锁卡；刷新、取消或切换方向不会获得重编许可');
  if (L.nextEpoch >= Number.MAX_SAFE_INTEGER) throw Error('后训练会话编号已用尽');
  const epoch = L.nextEpoch + 1;
  const grant = { id: `unlock:${generation.token}:${epoch}`, fromSessionId: p.id, cardIds: added, atDay: s.day };
  const next = makeSession(s, generation, epoch, grant);
  // One accepted transaction consumes the real unlock set. It never touches the
  // old active recipe, daily dedupe, real resources, risk or old exercise budget.
  generation.knownUnlocked = unionUnlocks(generation.knownUnlocked, now);
  L.nextEpoch = epoch; L.sessions[next.id] = next; L.byModel[p.modelId] = next.id;
  return postPlanView(s, next.id);
}
const validDraft = (ids, cfg) => Array.isArray(ids) && ids.length >= 1 && ids.length <= MAX_DECK_SIZE && ids.includes('basic') && new Set(ids).size === ids.length && ids.every(id => unlocked(id, cfg));
// Draft selection is a real durable edit, but never confirmation or a draw.
export function updatePostDraft(s, { sessionId, expectedRevision, cardIds }) {
  validatePostSessionSave(s); // Never persist a draft on top of a damaged current-format ledger.
  const p = needSession(s, sessionId); needPlayable(s, p); needRevision(p, expectedRevision);
  if (p.status !== 'draft' || p.confirmedDeck) throw Error('首手已发出，不能修改草稿');
  if (!validDraft(cardIds, config(s))) throw Error('卡包须保留免费卡，只能放入已解锁的不同卡');
  if (same(p.draftDeck, cardIds)) return postPlanView(s, sessionId);
  if (p.revision >= Number.MAX_SAFE_INTEGER) throw Error('后训练版本编号已用尽');
  const next = clone(p); next.draftDeck = [...cardIds]; next.draftChanges++; next.revision++;
  ledger(s).sessions[sessionId] = next;
  return postPlanView(s, sessionId);
}
export function confirmPostDeck(s, { sessionId, expectedRevision, cardIds, directionPolicy }) {
  const p = needSession(s, sessionId); needPlayable(s, p);
  if (directionPolicy !== p.directionPolicy || directionPolicy !== postPlanSchema(s)?.policy) throw Error('当前方案只适用于本模态普通后训练，不包括刷榜');
  // Identical confirm retry returns the accepted state, but never resets a draw.
  if (p.confirmedDeck) {
    if (same(p.confirmedDeck, cardIds) && expectedRevision === p.draftChanges) return postPlanView(s, sessionId);
    throw Error('首手已发出，不能重新组牌或重抽');
  }
  needRevision(p, expectedRevision);
  if (p.status !== 'draft' || !validDeck(cardIds, config(s))) throw Error('卡包至少需要三张不同卡，并保留免费基础卡');
  const next = clone(p);
  next.confirmedDeck = [...cardIds]; next.draftDeck = [...cardIds];
  next.unlockProof = { verifiedAtDay: s.day, config: config(s), rulesVersion: postPlanSchema(s).rules };
  next.drawTicket = seedFor(s, next); next.status = 'playing'; next.revision++;
  next.replayProof = replayProof(start(next.drawTicket,1,next.confirmedDeck,next.unlockProof.config));
  replayPostSession(s, next);
  const L = ledger(s);
  L.sessions[sessionId] = next;
  const g = L.generations[p.modelId];
  g.knownUnlocked = unionUnlocks(g.knownUnlocked, unlockIds(next.unlockProof.config));
  return postPlanView(s, sessionId);
}
export function choosePostSession(s, { sessionId, expectedRevision, turn, cardId }, actor = 'manual') {
  const p = needSession(s, sessionId); needPlayable(s, p); needRevision(p, expectedRevision);
  if (p.status !== 'playing' || !['manual', 'auto'].includes(actor) || p.controlMode !== actor) throw Error('本回合控制权已改变');
  const r = replayPostSession(s, p);
  if (turn !== r.turn || !choose(r, cardId, p.choiceRevision).ok) throw Error('不是当前可使用的手牌');
  const next = clone(p);
  next.choices.push(cardId); next.choiceRevision++; next.revision++; next.replayProof = replayProof(r);
  let receipt = null;
  if (r.status === 'done') {
    next.status = 'ready'; next.readyAtDay = s.day; next.effectiveFromDay = addDays(s.day, 1);
    next.receiptId = `receipt:${next.id}`; receipt = receiptFor(next);
  }
  const L = ledger(s);
  if (receipt && Object.hasOwn(L.receipts, receipt.id)) throw Error('方案已经完成');
  L.sessions[sessionId] = next;
  if (receipt) L.receipts[receipt.id] = receipt;
  return { view: postPlanView(s, sessionId), event: { ...clone(r.log.at(-1)), revision: next.revision, sessionId } };
}
export function controlPostSession(s, { sessionId, expectedRevision, mode, scope }) {
  const p = needSession(s, sessionId); needPlayable(s, p); needRevision(p, expectedRevision);
  if (p.status !== 'playing' || scope !== 'session' || !['manual', 'auto'].includes(mode)) throw Error('只能切换当前进行中的会话');
  replayPostSession(s, p); // A rejected control change must not partially write revision.
  if (p.controlMode !== mode) {
    const next = clone(p); next.controlMode = mode; next.controlChanges++; next.revision++;
    ledger(s).sessions[sessionId] = next;
  }
  return postPlanView(s, sessionId);
}
export function activatePostSessions(s) {
  if (s.postPlanSessions === undefined) return;
  const L = ledger(s);
  // A ready predecessor may activate while its replacement is still a draft.
  // Ascending epochs ensure at most the newest due receipt remains active.
  for (const p of Object.values(L.sessions).sort((a, b) => a.planEpoch - b.planEpoch)) {
    if (p.status === 'invalid') continue;
    if (!trainablePostModel(s, p.modelId)) {
      p.status = 'invalid'; p.invalidReason = '模型已归档或发布'; delete L.activeByModel[p.modelId]; continue;
    }
    if (p.status !== 'ready' || p.effectiveFromDay > s.day) continue;
    if (!same(L.receipts[p.receiptId], receiptFor(p))) throw Error('后训练方案回执损坏');
    replayPostSession(s, p);
    const old = L.sessions[L.activeByModel[p.modelId]];
    if (old && old.id !== p.id) old.status = 'superseded';
    p.status = 'active'; L.activeByModel[p.modelId] = p.id;
  }
}
export function activePostSessionEfficiency(s, m) {
  const L = ledger(s), id = L.activeByModel[m.id], p = id && needSession(s, id);
  if (!p || p.status !== 'active' || p.effectiveFromDay > s.day || !trainablePostModel(s, m.id)) throw Error('等待后训练方案在下一训练日生效');
  if (!same(L.receipts[p.receiptId], receiptFor(p))) throw Error('后训练方案回执损坏');
  const result = settle(replayPostSession(s, p));
  if (!result) throw Error('请先完成后训练卡牌计划');
  return result.rate;
}
export function postPlanModelToken(s, modelId) {
  return s.postPlanSessions?.generations?.[modelId]?.token ?? null;
}
export function postPlanView(s, sessionId) {
  const p = needSession(s, sessionId);
  const r = p.confirmedDeck ? replayPostSession(s, p) : null;
  const result = r ? settle(r) : null;
  const L = ledger(s), g = L.generations[p.modelId], active = L.sessions[L.activeByModel[p.modelId]];
  const added = unlockIds(config(s)).filter(id => !g.knownUnlocked.includes(id));
  const replanAllowed = L.byModel[p.modelId] === p.id && ['ready', 'active'].includes(p.status) && s.status === 'playing' && trainablePostModel(s, p.modelId) && !modelOf(s, p.modelId)?.evalId;
  return {
    sessionId: p.id, modelId: p.modelId, generationToken: p.generationToken, planEpoch: p.planEpoch,
    status: p.status, controlMode: p.controlMode, revision: p.revision, choiceRevision: p.choiceRevision,
    cardRulesVersion: p.cardRulesVersion, directionPolicy: p.directionPolicy,
    deck: [...(p.confirmedDeck || p.draftDeck)], confirmed: !!p.confirmedDeck,
    cards: (p.confirmedDeck || p.draftDeck).map(id => cardSummary(catalogueCard(id),config(s))),
    catalogVersion: p.catalogVersion, catalogFingerprint: p.catalogFingerprint, catalogueCount: CARDS.length-1, pending: r ? clone(r.pending).map(({id,dueTurn})=>({id,dueTurn})) : [],
    turn: r?.turn ?? 0, budget: r?.budget ?? 8, score: r?.score ?? 0,
    focus: r?.focus ?? 0, flow: r?.flow ?? 0, shield: r?.shield ?? 0, boost: r?.boost ?? 0,
    hand: r ? r.hand.map(id => ({ id, ...preview(r, id) })) : [], log: r ? clone(r.log) : [],
    receiptId: p.receiptId, effectiveFromDay: p.effectiveFromDay, invalidReason: p.invalidReason,
    activeSessionId: active?.id ?? null,
    replan: { available: replanAllowed && added.length > 0, newCards: added.map(id => ({ id, name: CARDS.find(c => c.id === id).name })) },
    // An explanation of a recipe, never a claim that any actual training has happened.
    preparation: result ? { coverage: result.deckEfficiency, realization: result.executionRate, scheme: result.scheme } : null,
    readOnly: s.status !== 'playing' || !trainablePostModel(s, p.modelId) || !!modelOf(s, p.modelId)?.evalId || L.byModel[p.modelId] !== p.id || ['ready', 'active', 'superseded', 'invalid'].includes(p.status),
  };
}
export function recommendPostSessionCard(s, sessionId) {
  const p = needSession(s, sessionId), r = replayPostSession(s, p);
  if (p.status !== 'playing') return null;
  const choices = r.hand.map(id => ({ id, p: preview(r, id) })).filter(x => x.p?.affordable);
  const value = x => x.p.total + (x.p.futureValue || 0);
  choices.sort((a, b) => value(b) - value(a));
  return choices[0]?.id ?? null;
}

export function validatePostSessionSave(s) {
  if (s.postPlanSessions === undefined) return;
  const L = ledger(s);
  if (!exact(L,['format','profileId','catalogVersion','catalogFingerprint','modality','companyId','nextGeneration','nextEpoch','generations','byModel','activeByModel','sessions','receipts'])) throw Error('后训练会话账含未知字段');
  if (!integer(L.nextEpoch) || !integer(L.nextGeneration) || !plain(L.sessions) || !plain(L.byModel) || !plain(L.activeByModel) || !plain(L.generations) || !plain(L.receipts)) throw Error('后训练会话账损坏');
  const epochs = new Set(), tokens = new Set(), generationNumbers = new Set();
  for (const [modelId, g] of Object.entries(L.generations)) {
    if (!exact(g,['token','modelId','knownUnlocked']) || g.modelId !== modelId || typeof g.token !== 'string' || tokens.has(g.token) || !modelOf(s, modelId)) throw Error('后训练模型代际账损坏');
    const n = Number(/^g(\d+):/.exec(g.token)?.[1]);
    if (!integer(n) || n < 1 || n > L.nextGeneration || generationNumbers.has(n) || g.token !== `g${n}:${modelId}`) throw Error('后训练模型代际编号损坏');
    generationNumbers.add(n);
    tokens.add(g.token);
  }
  for (const [id, p] of Object.entries(L.sessions)) {
    if (!exact(p,['id','companyId','modelId','generationToken','planEpoch','status','controlMode','revision','choiceRevision','controlChanges','draftChanges','cardRulesVersion','effectRulesVersion','directionPolicy','profileId','catalogVersion','catalogFingerprint','modality','draftDeck','confirmedDeck','drawTicket','unlockProof','replayProof','choices','openUnlockProof','grant','createdAtDay','readyAtDay','effectiveFromDay','receiptId','invalidReason']) || id !== p.id || p.companyId !== s.charId || L.generations[p.modelId]?.token !== p.generationToken || !legalStatuses.has(p.status)) throw Error('后训练会话身份损坏');
    if (!integer(p.planEpoch) || p.planEpoch < 1 || p.planEpoch > L.nextEpoch || epochs.has(p.planEpoch)) throw Error('后训练 epoch 损坏');
    epochs.add(p.planEpoch);
    if (!validPostPlanIdentity(s, p) || p.cardRulesVersion !== postPlanSchema(s).rules || p.effectRulesVersion !== 1 || p.directionPolicy !== postPlanSchema(s).policy) throw Error('不支持的后训练规则版本');
    if (!Array.isArray(p.choices) || p.choices.length > 6 || p.choiceRevision !== p.choices.length || !integer(p.controlChanges) || !integer(p.draftChanges) || !integer(p.revision) || p.revision !== p.choiceRevision + p.controlChanges + p.draftChanges + (p.confirmedDeck ? 1 : 0) || !['manual', 'auto'].includes(p.controlMode)) throw Error('后训练 revision 损坏');
    if (!isoDay(p.createdAtDay) || p.createdAtDay > s.day || (p.invalidReason !== null && typeof p.invalidReason !== 'string')) throw Error('后训练创建日期损坏');
    if (!validDraft(p.draftDeck, config(s)) || (p.confirmedDeck && !same(p.draftDeck, p.confirmedDeck))) throw Error('后训练草稿卡组损坏');
    if (!p.confirmedDeck) {
      if (!['draft', 'invalid'].includes(p.status) || p.controlChanges !== 0 || p.controlMode !== 'manual' || p.choices.length || p.drawTicket !== null || p.unlockProof !== null || p.replayProof !== null || p.receiptId !== null || p.readyAtDay !== null || p.effectiveFromDay !== null) throw Error('后训练草稿损坏');
    } else {
      const r = replayPostSession(s, p);
      if ((r.status === 'done') !== !!p.receiptId || (r.status === 'done' && !['ready', 'active', 'superseded', 'invalid'].includes(p.status))) throw Error('后训练终态损坏');
      if (r.status === 'playing' && (!['playing', 'invalid'].includes(p.status) || p.readyAtDay !== null || p.effectiveFromDay !== null)) throw Error('后训练进行态损坏');
      if (p.receiptId && (!same(L.receipts[p.receiptId], receiptFor(p)) || typeof p.readyAtDay !== 'string' || p.readyAtDay < p.createdAtDay || p.effectiveFromDay !== addDays(p.readyAtDay, 1) || p.readyAtDay > s.day)) throw Error('后训练回执损坏');
      if (p.status === 'active' && p.effectiveFromDay > s.day) throw Error('后训练方案提前激活');
    }
  }
  for (const [modelId, g] of Object.entries(L.generations)) {
    const chain = Object.values(L.sessions).filter(p => p.modelId === modelId).sort((a, b) => a.planEpoch - b.planEpoch);
    if (!chain.length || L.byModel[modelId] !== chain.at(-1).id) throw Error('后训练当前方案引用损坏');
    let known = [], previous = null;
    for (const p of chain) {
      if (!exact(p.openUnlockProof,['verifiedAtDay','config']) || !unlockConfig(s, p.openUnlockProof.config) || p.openUnlockProof.verifiedAtDay !== p.createdAtDay) throw Error('后训练开局解锁证明损坏');
      const atOpen = unlockIds(p.openUnlockProof.config), added = atOpen.filter(id => !known.includes(id));
      if (!previous) { if (p.grant !== null) throw Error('初始方案不能带重编许可'); }
      else if (!exact(p.grant,['id','fromSessionId','cardIds','atDay']) || p.grant.id !== `unlock:${g.token}:${p.planEpoch}` || p.grant.fromSessionId !== previous.id || p.grant.atDay !== p.createdAtDay || !added.length || !same(p.grant.cardIds, added) || !previous.receiptId || previous.readyAtDay > p.createdAtDay) throw Error('新增解锁重编许可损坏或重复消费');
      known = unionUnlocks(known, atOpen, p.confirmedDeck ? unlockIds(p.unlockProof.config) : []);
      previous = p;
    }
    if (!same(g.knownUnlocked, known)) throw Error('已消费解锁集合损坏');
    const active = chain.filter(p => p.status === 'active');
    if (active.length > 1 || (active.length ? L.activeByModel[modelId] !== active[0].id : L.activeByModel[modelId] !== undefined)) throw Error('后训练生效方案引用损坏');
  }
  for (const [modelId, id] of Object.entries(L.byModel)) if (L.sessions[id]?.modelId !== modelId) throw Error('后训练模型引用损坏');
  for (const [modelId, id] of Object.entries(L.activeByModel)) if (L.sessions[id]?.modelId !== modelId || L.sessions[id]?.status !== 'active') throw Error('后训练生效方案引用损坏');
  for (const [id, receipt] of Object.entries(L.receipts)) if (L.sessions[receipt?.sourceSessionId]?.receiptId !== id) throw Error('后训练孤立回执');
}

// External save entry only: the isolated numerical kernel still has its own internal
// roundtrip tests, but kernel-only experimental files are not playable UI saves.
export function assertPostPlanSaveBoundary(s) {
  if (!s || (s.postCards === undefined && s.postPlanSessions === undefined)) return;
  if (s.postCards !== undefined && s.postPlanSessions === undefined) throw Error('不支持旧版卡牌实验存档，请新开一局；原存档未修改');
  validatePostSessionSave(s);
  if (Object.keys(s.postCards).some(k=>!['version','plans','lastDays','lastTickDay'].includes(k))) throw Error('当前格式内核账含未知字段');
  if (!plain(s.postCards.plans) || !plain(s.postCards.lastDays)) throw Error('当前格式缺少后训练内核计划/日账');
  if (Object.keys(s.postCards.plans).length || (s.jobs?.list || []).some(j => j.postCardPlanRef !== undefined)) throw Error('普通后训练会话档不能混入旧内核独立计划');
  if (s.postCards.lastTickDay !== undefined && (!isoDay(s.postCards.lastTickDay) || s.postCards.lastTickDay > s.day)) throw Error('当前格式后训练日账损坏');
  for (const [modelId, day] of Object.entries(s.postCards.lastDays)) if (!modelOf(s, modelId) || !isoDay(day) || !s.postCards.lastTickDay || day > s.postCards.lastTickDay) throw Error('当前格式后训练防重日账损坏');
  const account = p => plain(p) && Number.isFinite(p.own) && p.own >= 0 && Number.isFinite(p.dist) && p.dist >= 0 && plain(p.teachers) && Object.values(p.teachers).every(v => Number.isFinite(v) && v >= 0);
  if (!Array.isArray(s.models) || s.models.some(m => m.postExposureVersion !== 1 || !account(m.postExposure) || !account(m.post))) throw Error('当前格式缺少完整后训练贡献/风险账；原存档未修改');
}

export function postPlanCatalogue(s,query={}) { ledger(s); return queryCatalogue(config(s),query); }
export function postPlanCard(s,id) { ledger(s); const c=catalogueCard(id); return c ? cardSummary(c,config(s)) : null; }
