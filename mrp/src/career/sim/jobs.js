import { assertRandomWorld, validatePostRandom, dailyPostRandomRate } from './post_random.js';
import { postCardEfficiency, cardJobSupported, validateSavedPostCardPlans } from './post_cards.js';
import { recognizedPostPlanLedger } from './post_card_profiles.js';
import { P } from './provider.js';
// 训练作业（规格 T 章，P2.4a）：训练卡上并行的几项作业——底座（预训练）、蒸馏小模型、续训、后训练、试验——按“优先 / 正常”自动分卡。
// 每项作业有最低卡（放不下就排队）和想要卡（再多也没用）；作业位按团队人数和自用卡数取大（试验不占作业位）。
// 主线同一时间只有一项底座类作业（预训练或续训）；小模型线（只有语言模型有）最多 3 个；每个模型最多挂一项后训练。
// 状态：s.jobs（见 initJobs）。底座类作业的载荷 pj 就是原来的 s.project 对象（字段和键的顺序都不变）。
import {recordAutoTrialOutcome,recordAutoTrialCancel} from './automation_trial_ledger.js';
import { DIRECTIONS, PARAM_TOTALS, PARAM_ACTIVES, SCALES, ARCHS, dimKeys } from '../data/core.js';
import { BENCH_BY_ID } from '../data/benchmarks.js';
import { TRAIN_PACE, BEYOND, JOBS, REPAIR, LAB } from '../data/balance.js';
import { clamp, rand, round1, persistentInputError } from './util.js';
import { daysBetween } from './clock.js';
import {
  postPreview, benchmaxPreview, workingModel, applyGains, gpuAllocation, trainFlops, projectRisk, projectProgress, poolStats, pretrainRepeat,
  genMinCards, previewProject, directionsFor, scaleById, withModelReadSnapshot,
} from './model.js';
import { knowFx } from './research.js';
import { normalizeDistill } from './data_ops.js';
import { addSpirit } from './strategy.js';
import { log } from './log.js';
import { DAY } from './loop.js';
import { modelLabel } from './naming.js';
import { validateTrainingAcc, rescaleTrainingAcc, finishJob, projectCheck, distillCheck, finetuneCheck, smallBaseCheck, makePretrainPj, makeDistillPj, makeFinetunePj, startedLog } from './projects.js';
import { modifier } from './modifiers.js';
import { trialCheck, finishTrial, consumeFindings, returnFindings, TRIAL_LABEL, SIZE_LABEL } from './lab.js';

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const BASE_KINDS = new Set(['pretrain', 'distill', 'finetune']);
export const isBaseJob = job => BASE_KINDS.has(job?.kind);
const isPost = job => job?.kind === 'post';
const isTrial = job => job?.kind === 'trial';

// ---------- 状态 ----------
export function initJobs() {
  return { list: [], seq: 0, ownOnly: false, repair: false, autoRepair: true, plan: null, findings: [], trialKnow: {}, techCut: {}, smallCredit: {},
    focusPause: null, nag: {}, idle: { since: null }, log: [] };
}
export function ensureJobs(s) {
  if (!isObj(s.jobs) || !Array.isArray(s.jobs.list)) throw Error('不支持缺少作业表的旧存档，请新开一局');
  for (const j of s.jobs.list) {
    if (Object.hasOwn(j,'legacyMin')) throw Error('不支持旧版作业最低卡字段，请新开一局');
    validateTrainingAcc(j.pj);
    if (j.kind === 'distill' && (!isObj(j.pj?.preview) || !isObj(j.pj.preview.teacher) || !isObj(j.pj.preview.dims) || !Number.isFinite(j.pj.preview.gap)))
      throw Error('不支持缺少冻结老师快照的旧存档，请新开一局');
  }
  return s.jobs;
}
// 作业日志（最近 40 条）：作业的开工、结束、排队，只进这里，不弹卡（E4）。
export function jobsLog(s, text) {
  const J = ensureJobs(s);
  J.log.unshift({ day: s.day, text });
  if (J.log.length > 40) J.log.length = 40;
}
const removeJob = (s, job) => { const J = ensureJobs(s); J.list = J.list.filter(j => j !== job); if (Array.isArray(J.focusPause)) J.focusPause = J.focusPause.filter(id => id !== job.id); };
export const jobById = (s, id) => ensureJobs(s).list.find(j => j.id === id) || null;
export const baseJob = (s, line = 'main') => ensureJobs(s).list.find(j => isBaseJob(j) && (!line || j.line === line)) || null;
export const hasBaseJob = (s, line = null) => ensureJobs(s).list.some(j => isBaseJob(j) && (!line || j.line === line));
export const postJobs = s => ensureJobs(s).list.filter(isPost);
export const mainPostJob = s => postJobs(s).find(j => j.target === 'main') || null;

// ---------- 模型和线（T7） ----------
const modelById = (s, id) => (s.models || []).find(m => m.id === id) || null;
export const prevModel = s => (s.prevWorking ? modelById(s, s.prevWorking.id) : null);
// 待发布的小模型：smallWorking 排最前，其余在 smallShelf；评测中的（有 evalId）不在列表里，但仍占小模型线的名额。
export function smallPending(s) {
  const ids = [s.smallWorking, ...(Array.isArray(s.smallShelf) ? s.smallShelf : [])].filter(Boolean);
  return ids.map(id => modelById(s, id)).filter(Boolean);
}
export const smallModels = s => smallPending(s).filter(m => !m.evalId);
// 小模型线占了几个：在跑的蒸馏和小底座 + 练完还没发布的小模型（含评测中的）。
export const smallLineCount = s => ensureJobs(s).list.filter(j => isBaseJob(j) && j.line === 'small').length + smallPending(s).length;
// 后训练作业的目标模型：主线跟着 s.working 走；上一代收尾；某个待发布、没在评测中的小模型。找不到返回 null。
export function postTarget(s, job) {
  if (job.target === 'main') { const w = workingModel(s); return w && w.stage === 'post' ? w : null; }
  if (job.target === 'prev') { const m = prevModel(s); return m && m.stage === 'post' ? m : null; }
  if (typeof job.target === 'string' && job.target.startsWith('small:')) { const id = job.target.slice(6); return smallModels(s).find(m => m.id === id) || null; }
  return null;
}
export const postJobFor = (s, m) => postJobs(s).find(j => postTarget(s, j) === m) || null;
const targetOf = (s, m) => (m && m.id === s.working ? 'main' : m && s.prevWorking?.id === m.id ? 'prev' : m ? `small:${m.id}` : null);

// ---------- 作业位（T3） ----------
const slotStep = (n, per) => clamp(JOBS.SLOTS.base + Math.floor(Math.log2(Math.max(1, n) / per)), JOBS.SLOTS.min, JOBS.SLOTS.max);
export const slotsByTeam = s => slotStep(s.team || 0, JOBS.SLOTS.team);
export const slotsByCards = s => slotStep(gpuAllocation(s).selfGpus, JOBS.SLOTS.cards);
export function jobSlots(s) {
  return Math.min(JOBS.SLOTS.max, Math.max(slotsByTeam(s), slotsByCards(s))) + Math.round(modifier(s, 'jobSlots'));
}
// 占作业位的：底座类和后训练（含排队的、被暂停的）；试验不占。
export const slotsUsed = s => ensureJobs(s).list.filter(j => !isTrial(j)).length;

// ---------- 最低卡、想要卡、最快天数（T2.1、T2.2） ----------
const memMin = (totalB, bytes) => Math.max(1, Math.ceil(bytes * Math.max(0, totalB || 0) / JOBS.MEM.card));
export function fastestDays(s, structure) {
  if (s.mod !== 'llm') return JOBS.FAST.nonLlm;
  return clamp(JOBS.FAST.base + JOBS.FAST.perDecade * Math.log10(Math.max(structure?.total || 7, 7) / 7), JOBS.FAST.base, JOBS.FAST.max);
}
const kpOf = s => 1 + knowFx(s).pretrain;
// 后训练一个月要多少算力（和 postPreview 的 needPerMonth 同一个算式）。自动方向按当时选的方向，还没选时按强化学习算。
function postNeed(s, m, job) {
  const key = job.bench ? null : job.dir === 'auto' || !job.dir ? job.autoDir : job.dir;
  const dir = key ? DIRECTIONS[s.mod].find(d => d.key === key) : null;
  const rl = dir ? !!dir.rl : true;
  return (rl ? 6 * (m?.active || 3) * 1e9 * 4e11 : 6 * (m?.active || 3) * 1e9 * 6e10) * (s.mod === 'llm' ? 1 : 0.02);
}
export function minCards(s, job) {
  let n;
  if (job.kind === 'pretrain') n = s.mod === 'llm' ? memMin(job.pj?.structure?.total, JOBS.MEM.pretrain) : JOBS.NONLLM_MIN;
  else if (job.kind === 'distill') n = memMin(job.pj?.structure?.total, JOBS.MEM.pretrain) + genMinCards(s, job.pj?.preview?.teacher?.total ?? 0);
  else if (job.kind === 'finetune') n = s.mod === 'llm' ? memMin(job.pj?.structure?.total, JOBS.MEM.pretrain) : JOBS.NONLLM_MIN;
  else if (job.kind === 'post') { const m = postTarget(s, job) || (job.model ?? null); n = s.mod === 'llm' ? memMin(m?.total ?? 7, JOBS.MEM.post) : 1; }
  else if (job.kind === 'trial') n = Math.max(LAB.MIN_CARDS, Math.ceil(LAB.MIN_FRAC * wantCards(s, job)));
  else n = 0;
  if (Object.hasOwn(job, 'legacyMin')) throw Error('不支持旧版作业最低卡字段，请新开一局');
  return n;
}
// φ：每张训练卡每月的算力（已含健康、加成、挖人、适配）。
const phiOf = s => { const T = gpuAllocation(s).trainGpus; return T > 0 ? trainFlops(s) / T : 0; };
export function wantCards(s, job, phi = phiOf(s)) {
  if (!(phi > 0)) return Infinity;
  const pj = job.pj;
  if (job.kind === 'pretrain') return pj.need / (fastestDays(s, pj.structure) / 30) / (phi * kpOf(s) * (job.rush ? JOBS.RUSH : 1));
  if (job.kind === 'distill') return pj.need / ((pj.minDays || 7) / 30) / (phi * kpOf(s));
  if (job.kind === 'finetune') return minCards(s, job);
  if (job.kind === 'post') return job.bench ? minCards(s, job) : JOBS.POST_SAT * postNeed(s, postTarget(s, job) || job.model, job) / phi;
  if (job.kind === 'trial') return job.cost / (job.minDays / 30) / phi;
  return 0;
}

// ---------- 分卡（T4.2） ----------
// 份额（训练卡 = 1）：先按顺序发最低卡（放不下就排队，前面的排队不挡后面的），再按权重找水位：Σ clamp(l·w, min, upper) = min(cap, Σ upper)。
// 闭式解：把所有 min/w、upper/w 从小到大排，找到目标落在哪一段，l = (目标 − 已顶到下限或上限的份额之和) ÷ 落在中间的作业的权重之和。
export function waterFill(run, cap) {
  if (!run.length) return;
  const target = Math.min(cap, run.reduce((a, i) => a + i.upper, 0));
  const f = l => run.reduce((a, i) => a + Math.min(Math.max(l * i.w, i.min), i.upper), 0);
  const bps = [...new Set(run.flatMap(i => [i.min / i.w, i.upper / i.w]).filter(Number.isFinite))].sort((a, b) => a - b);
  let lo = 0;
  for (const b of bps) { if (f(b) >= target) break; lo = b; }
  const free = run.filter(i => i.min / i.w <= lo && i.upper / i.w > lo);
  const freeSet = new Set(free);
  let fixed = 0;
  for (const i of run) if (!freeSet.has(i)) fixed += i.min / i.w > lo ? i.min : i.upper;
  const wsum = free.reduce((a, i) => a + i.w, 0);
  const l = wsum > 0 ? (target - fixed) / wsum : 0;
  for (const i of run) i.share = freeSet.has(i) ? l * i.w : i.min / i.w > lo ? i.min : i.upper;
}
// 这项作业参不参加今天的分卡：被玩家暂停的、检修时的后训练、目标模型不在了的后训练不参加。假想的后训练按“不在检修”估（预估说的是“练的时候能拿到多少”）。
// Shared readonly gate: unprepared single-player cards reserve neither GPU nor
// team research. It is deliberately not an allocation/run test: ordinary GPU
// queues still reserve the team, and an old active recipe can train while its
// replacement is being assembled. Broken/unknown card state never falls back.
function cardWorkReason(s, job) {
  if (job.hypo || (s.postCards === undefined && s.postPlanSessions === undefined)) return null;
  if (s.postCards?.version !== 1) return 'cardInvalid';
  const L = s.postPlanSessions;
  if (L !== undefined) {
    if (!recognizedPostPlanLedger(s) || !['byModel', 'activeByModel', 'sessions', 'generations', 'receipts'].every(k => isObj(L[k]))) return 'cardInvalid';
    const m = postTarget(s, job), account = p => isObj(p) && Number.isFinite(p.own) && p.own >= 0 && Number.isFinite(p.dist) && p.dist >= 0 && isObj(p.teachers) && Object.values(p.teachers).every(x => Number.isFinite(x) && x >= 0);
    if (!m || m.postExposureVersion !== 1 || !account(m.postExposure) || !account(m.post)) return 'cardInvalid';
    try { validateSavedPostCardPlans(s); } catch { return 'cardInvalid'; }
  }
  if (!cardJobSupported(s, job)) return 'cardUnsupported';
  const m = postTarget(s, job);
  try { postCardEfficiency(s, job, m); return null; }
  catch { return L?.activeByModel?.[m?.id] ? 'cardInvalid' : 'sessionPending'; }
}
function why0(s, J, job) {
  if (job.paused) return 'paused';
  if (isPost(job)) {
    if (J.repair && !job.hypo) return 'repair';
    if (!postTarget(s, job) && !job.model) return 'target';
    const cardReason = cardWorkReason(s, job);
    if (cardReason) return cardReason;
  }
  return null;
}
function fill(items, T, cap) {
  let left = cap;
  const run = [];
  for (const it of items) {
    it.run = false; it.share = 0;
    if (it.why0) { it.why = it.why0; continue; }
    if (T > 0 && left + 1e-12 >= it.min) { it.run = true; it.why = null; left -= it.min; run.push(it); } else it.why = 'min';
  }
  waterFill(run, cap);
  for (const it of items) it.cards = it.share * T;
}
// 作业表这一刻的分卡底稿：训练卡 T、可分的份额 cap、每张训练卡的算力 φ，以及表里每项的最低卡、想要卡（还没分）。
// 同一个同步循环里估很多个假想作业（顾问、机器人挑底座配置）时，底稿算一次、反复用（allocJobs 的 opts.ctx）；状态一变就要重算。
export function allocCtx(s, replace = null) {
  const J = ensureJobs(s);
  const ga = gpuAllocation(s);
  const T = ga.trainGpus;
  const tf = trainFlops(s, ga);
  const phi = T > 0 ? tf / T : 0;
  const items = J.list.filter(j => j !== replace).map(job => itemFor(s, J, job, T, phi));
  return { J, T, cap: J.repair ? 1 - REPAIR.share : 1, tf, phi, items, replace };
}
function itemFor(s, J, job, T, phi) {
  const it = { job, w: JOBS.WEIGHT[job.prio] ?? 1, min: 0, upper: 0, share: 0, cards: 0, run: false, why: null, why0: why0(s, J, job), minCards: 0, wantCards: 0 };
  if (!it.why0) {
    it.minCards = minCards(s, job);
    it.wantRaw = wantCards(s, job, phi);
    it.wantCards = Math.max(it.minCards, Math.min(it.wantRaw, job.cap ?? Infinity));
    it.min = T > 0 ? it.minCards / T : Infinity;
    it.upper = T > 0 ? Math.max(it.min, it.wantCards / T) : Infinity;
  }
  return it;
}
// allocJobs(s, extra) → { T, cap, items: [{ job, w, min, upper, share, cards, run, why, minCards, wantCards }], free, baseShare, baseShareFree, extra, tf }。
// extra 是假想作业（立项表单、顾问、机器人估工期用），opts.replace 把作业表里的某一项换成它（估“这一项换个方向会拿到多少”）。
// 不缓存，每次现算（opts.ctx 只在同一个同步循环里复用刚算的底稿）；实得算力 F_j = trainFlops(s) × share_j，在用的那一刻现算。
export function allocJobs(s, extra = null, opts = {}) {
  const ctx = opts.ctx ?? allocCtx(s, opts.replace ?? null);
  const { J, T, cap, phi } = ctx;
  const hypo = extra ? Object.assign({ seq: Infinity, prio: 'normal', cap: null, paused: false }, extra, { hypo: true }) : null;
  const items = ctx.items.map(i => ({ ...i }));
  if (hypo) items.push(itemFor(s, J, hypo, T, phi));
  items.sort((a, b) => b.w - a.w || a.job.seq - b.job.seq);
  fill(items, T, cap);
  for (const it of items) it.tf = ctx.tf;
  const used = items.reduce((a, i) => a + i.share, 0);
  const baseShare = items.filter(i => i.run && isBaseJob(i.job)).reduce((a, i) => a + i.share, 0);
  // 冲顶力只看“底座没封顶时本该分到的份额”（T4.6）：玩家给底座设的“最多 N 张”不抬冲顶力。
  let baseShareFree = baseShare;
  if (items.some(i => isBaseJob(i.job) && Number.isFinite(i.job.cap) && !i.why0)) {
    const free = items.map(i => ({ ...i, upper: isBaseJob(i.job) && !i.why0 && T > 0 ? Math.max(i.min, i.wantRaw / T) : i.upper }));
    fill(free, T, cap);
    baseShareFree = free.filter(i => i.run && isBaseJob(i.job)).reduce((a, i) => a + i.share, 0);
  }
  return { T, cap, items, free: Math.max(0, 1 - used), baseShare, baseShareFree, extra: hypo ? items.find(i => i.job === hypo) : null, tf: ctx.tf };
}
export const itemOf = (s, job) => allocJobs(s).items.find(i => i.job === job) || null;
// 后训练能拿到的算力（postPreview 用）：作业表里有这个模型的后训练、而且在跑，就是它当场的份额；
// 否则按假想的一项估（换掉作业表里那一项，不在检修、没被暂停），说的是“练的时候能拿到多少”。
// 预估别的方向（强化学习和监督微调的想要卡不一样）时按“换成这个方向”的假想作业估。
export function postAvail(s, m, dirKey = null) {
  const job = postJobFor(s, m);
  const cur = job ? (job.bench ? null : job.dir === 'auto' ? job.autoDir : job.dir) : null;
  if (job && (!dirKey || cur === dirKey)) { const it = itemOf(s, job); if (it?.run) return trainFlops(s) * it.share; }
  const hypo = { kind: 'post', target: targetOf(s, m), model: m, dir: dirKey || job?.dir || 'auto', autoDir: job?.autoDir, bench: job?.bench, prio: job?.prio ?? 'normal', cap: job?.cap ?? null, seq: job?.seq ?? Infinity };
  return trainFlops(s) * (allocJobs(s, hypo, { replace: job }).extra?.share ?? 0);
}
// 冲顶力的算力项系数 max(1 − baseShareFree, 0.25)（T4.6）：底座占训练卡 ≥ 75% 时和旧的“有项目 ×0.25”相同，没有底座时 ×1。
export const compShare = s => Math.max(1 - allocJobs(s).baseShareFree, 0.25);

// ---------- 工期 ----------
// 还要几天（在跑的作业；假想作业按加进作业表以后分到的卡）。分不到卡是 Infinity。
export function jobEta(s, job, it = null) {
  const item = it ?? (ensureJobs(s).list.includes(job) ? itemOf(s, job) : allocJobs(s, job).extra);
  if (isPost(job)) return job.until?.days ? Math.max(0, job.until.days - (job.days || 0)) : null;
  const run = !!item?.run && item.share > 0;
  const F = run ? (item.tf ?? trainFlops(s)) * item.share : 0;
  if (isTrial(job)) {
    const left = Math.max(0, job.cost - (job.done || 0));
    const wait = Math.max(0, job.minDays - (job.elapsed || 0));
    return left > 0 ? (run ? Math.max(wait, left / (F * DAY)) : Infinity) : wait;
  }
  const pj = job.pj;
  const left = Math.max(0, pj.need - pj.done);
  if (job.kind === 'finetune') return left > 0 ? (run ? left : Infinity) : 0;
  const wait = Math.max(0, (pj.minDays || 0) - (pj.elapsedDays || 0));
  if (!(left > 0)) return wait;
  if (!run) return Infinity;
  let rate = F * kpOf(s) * (job.rush ? JOBS.RUSH : 1) * DAY;
  if (job.kind === 'pretrain') rate = Math.min(rate, pj.need / fastestDays(s, pj.structure));
  return Math.max(wait, left / rate);
}

// ---------- 名字 ----------
const sizeText = (s, st, cfg) => (s.mod === 'llm' ? `${st.total}B${st.active < st.total ? `/${st.active}B` : ''}${st.arch && st.arch !== 'dense' ? ` ${ARCHS[st.arch]?.label || st.arch}` : ''}` : scaleById(s.mod, cfg?.scaleId)?.label || '');
const dirLabel = (s, key) => DIRECTIONS[s.mod].find(d => d.key === key)?.label || key;
export function jobLabel(s, job) {
  const pj = job.pj;
  if (job.kind === 'pretrain') return `${job.line === 'small' ? '小底座' : '底座'} · ${pj.draftName ? `${pj.draftName} · ` : ''}${sizeText(s, pj.structure, pj.cfg)} ${pj.tokens}T`;
  if (job.kind === 'distill') return `蒸馏 · ${pj.structure.total}B 小模型（老师 ${pj.preview?.teacher?.name || pj.teacher}）`;
  if (job.kind === 'finetune') return `续训 · ${pj.relName}`;
  if (job.kind === 'trial') return `试验 · ${TRIAL_LABEL[job.type]}${SIZE_LABEL[job.size]}`;
  const m = postTarget(s, job);
  const what = job.bench ? `刷榜 ${BENCH_BY_ID[job.bench]?.name || job.bench}` : job.dir === 'auto' ? `自动（${job.autoDir ? dirLabel(s, job.autoDir) : '还没选'}）` : dirLabel(s, job.dir);
  return `后训练 · ${m ? modelLabel(m) : '（没有模型）'} · ${what}`;
}

// ---------- 立项检查（T2、T3） ----------
const no = reason => ({ ok: false, reason, warn: '', eta: null, cards: null, effects: [], lab: null });
function untilOk(s, u) {
  if (u === 'none' || u === 'stall') return true;
  if (isObj(u) && Number.isFinite(u.days) && u.days >= 1) return true;
  return isObj(u) && typeof u.dim === 'string' && dimKeys(s.mod).includes(u.dim) && Number.isFinite(u.to);
}
// 草稿：按 spec 建出作业（不放进作业表），检查不过返回 { reason }。
function draft(s, spec) {
  const kind = spec?.kind;
  const base = { prio: spec.prio ?? (BASE_KINDS.has(kind) ? 'high' : 'normal'), cap: Number.isFinite(spec.cap) ? spec.cap : null };
  if (kind === 'pretrain') {
    const line = spec.line === 'small' ? 'small' : 'main';
    const c = line === 'small' ? smallBaseCheck(s, spec.cfg) : projectCheck(s, spec.cfg);
    if (!c.ok) return { reason: c.reason };
    const pv = previewProject(s, spec.cfg);
    if (!Number.isFinite(pv.need) || pv.need <= 0) return { reason: '训练计算量超出可用范围' };
    const lab = line === 'main' ? consumeFindings(s, spec.cfg, pv.need, false) : null;
    const need = pv.need * (1 - (lab?.save || 0));
    return { job: { kind, line, ...base, pj: makePretrainPj(s, spec.cfg, pv, need), need0: pv.need, rush: false, lab: lab && lab.used.length ? lab : null } };
  }
  if (kind === 'distill') {
    const c = distillCheck(s, spec.cfg);
    if (!c.ok) return { reason: c.reason };
    const pj = makeDistillPj(s, spec.cfg);
    if (!pj) return { reason: '蒸馏计算量超出可用范围' };
    return { job: { kind, line: 'small', ...base, pj }, warn: c.warn };
  }
  if (kind === 'finetune') {
    const c = finetuneCheck(s, spec.cfg);
    if (!c.ok) return { reason: c.reason };
    return { job: { kind, line: 'main', ...base, pj: makeFinetunePj(s, spec.cfg, c.days) } };
  }
  if (kind === 'post') {
    const t = spec.target ?? 'main';
    const m = postTarget(s, { target: t });
    if (!m) return { reason: t === 'main' ? '现在没有可以后训练的模型' : t === 'prev' ? '没有上一代收尾的模型' : '没有这个待发布的小模型（或它正在评测）' };
    if (postJobFor(s, m)) return { reason: `${modelLabel(m)} 已经有一项后训练了` };
    const dir = spec.bench ? null : spec.dir ?? 'auto';
    if (spec.bench && !benchmaxPreview(s, spec.bench, m)) return { reason: '现在不能针对这个榜单训练' };
    if (dir && dir !== 'auto' && !directionsFor(s).some(d => d.key === dir)) return { reason: '没有这个后训练方向，或者还没解锁' };
    const until = spec.until ?? (t === 'main' ? 'none' : { days: 30 });
    if (!untilOk(s, until)) return { reason: '结束条件不对：7/14/30/60 天、练到主维 X、练到涨不动、一直练' };
    return { job: { kind, line: null, ...base, prio: spec.prio ?? 'normal', target: t, ...(dir ? { dir } : {}), ...(spec.bench ? { bench: spec.bench } : {}), until, days: 0, stall: 0, modelId: m.id } };
  }
  if (kind === 'trial') {
    const c = trialCheck(s, spec);
    if (!c.ok) return { reason: c.reason };
    return { job: { kind, line: null, prio: spec.prio ?? 'normal', cap: base.cap, type: spec.type, size: spec.size, ...(spec.tech ? { tech: spec.tech } : {}), ...(spec.dim ? { dim: spec.dim } : {}),
      inResearch: c.inResearch, target: c.plan, cost: c.cost, done: 0, minDays: c.days, elapsed: 0, odds: c.odds } };
  }
  return { reason: '没有这种作业' };
}
// 能不能开（立项表单、顾问、机器人共用）→ { ok, reason, warn, eta（天）, cards: { min, want, got }, effects: [对别的作业的影响], lab, job }。
export function jobCheck(s, spec) {
  const J = ensureJobs(s);
  const kind = spec?.kind;
  if (spec?.prio != null && (typeof spec.prio !== 'string' || !Object.hasOwn(JOBS.WEIGHT, spec.prio))) return no('优先级只有“优先”和“正常”');
  if (BASE_KINDS.has(kind) || kind === 'post') {
    const n = slotsUsed(s), cap = jobSlots(s);
    if (n >= cap) return no(`作业位已满（${n}/${cap}）：先结束或取消一项`);
  }
  if (kind === 'pretrain' && spec.line !== 'small' && hasBaseJob(s, 'main')) return no('主线已经有一项底座在练（同一时间只练一个旗舰底座）：先等它练完或取消');
  if (kind === 'finetune' && hasBaseJob(s, 'main')) return no('主线已经有一项底座在练：先等它练完或取消');
  if ((kind === 'distill' || (kind === 'pretrain' && spec.line === 'small'))) {
    if (s.mod !== 'llm') return no('只有语言模型有小模型线');
    if (smallLineCount(s) >= JOBS.SMALL_LINE) return no(`小模型线已满（${JOBS.SMALL_LINE} 个）：先发布或取消一个`);
  }
  const d = draft(s, spec);
  if (!d.job) return no(d.reason);
  if (Number.isFinite(spec.cap)) {
    const min = Math.ceil(minCards(s, d.job));
    if (spec.cap < min) return no(`最多张数不能比最低卡少（${min} 张）`);
  }
  const before = allocJobs(s);
  const al = allocJobs(s, d.job);
  const it = al.extra;
  const eta = jobEta(s, d.job, it);
  const cards = { min: Math.round(it?.minCards ?? minCards(s, d.job)), want: Number.isFinite(it?.wantCards) ? Math.round(it.wantCards) : null, got: Math.round(it?.cards ?? 0) };
  const effects = [];
  for (const b of before.items) {
    if (!b.run) continue;
    const a = al.items.find(x => x.job === b.job);
    if (a && Math.round(a.cards) < Math.round(b.cards)) effects.push({ id: b.job.id, label: jobLabel(s, b.job), before: Math.round(b.cards), after: Math.round(a.cards), queued: !a.run });
  }
  let warn = d.warn || '';
  if (!it?.run) warn = `排队：要 ${cards.min} 张卡，现在只剩 ${Math.max(0, Math.floor(al.T * (1 - before.items.reduce((x, i) => x + i.share, 0)) - (J.repair ? al.T * REPAIR.share : 0)))} 张`;
  if (kind === 'pretrain' && !(eta <= JOBS.MAX_DAYS)) {
    const best = biggestBase(s, spec);
    return { ...no(`按现在的分卡要 ${Number.isFinite(eta) ? `${Math.round(eta)} 天` : '排队等卡'}，超过一年。${best ? `现在能练的最大规模是 ${best}` : '现在的卡练不了这么大的底座'}`), eta, cards };
  }
  if (kind === 'pretrain' && eta > JOBS.WARN_DAYS) warn = `这个底座要练约 ${Math.round(eta)} 天（超过 ${JOBS.WARN_DAYS} 天），可以换小一点，或调低推理份额`;
  return { ok: true, reason: '', warn, eta, cards, effects, lab: d.job.lab ?? null, job: d.job };
}
// 同架构、同 token 下，按现在的分卡一年内练得完的最大规模（不让立项时的提示）。
function biggestBase(s, spec) {
  const cfg = spec.cfg || {};
  if (s.mod !== 'llm') {
    for (const sc of [...SCALES[s.mod]].reverse()) { const c = { ...cfg, scaleId: sc.id }; const d = draft(s, { ...spec, cfg: c }); if (d.job && jobEta(s, d.job, allocJobs(s, d.job).extra) <= JOBS.MAX_DAYS) return sc.label; }
    return null;
  }
  for (const total of [...PARAM_TOTALS].reverse()) {
    if (total >= cfg.total) continue;
    const active = cfg.arch === 'moe' ? Math.min(cfg.active, Math.max(...PARAM_ACTIVES.filter(a => a <= total / 3), 0.5)) : total;
    const d = draft(s, { ...spec, cfg: { ...cfg, total, active } });
    if (d.job && jobEta(s, d.job, allocJobs(s, d.job).extra) <= JOBS.MAX_DAYS) return `${total}B${active < total ? `（激活 ${active}B）` : ''}`;
  }
  return null;
}
const JOB_NUMBER_MESSAGES = Object.freeze({
  '["cfg","tokens"]': '训练 token 必须是大于 0 的有限数',
  '["cfg","total"]': '总参数和激活参数必须是至少 0.5B 的有限数',
  '["cfg","active"]': '总参数和激活参数必须是至少 0.5B 的有限数',
});
export function startJob(s, spec) {
  const inputError = persistentInputError(spec, JOB_NUMBER_MESSAGES);
  if (inputError) throw new Error(inputError);
  const c = jobCheck(s, spec);
  if (!c.ok) throw new Error(c.reason);
  const J = ensureJobs(s);
  const job = c.job;
  // 用掉试验结论（T5.5）：底座立项时从 findings 里删掉，取消时退回。
  if (job.lab) Object.assign(job.lab, consumeFindings(s, job.pj.cfg, job.need0, true));
  J.seq += 1;
  // 正在“专心研究”时新开的后训练：自动退出专心研究、恢复后训练，免得作业一直显示“暂停中”（T4.7）。
  if (isPost(job) && Array.isArray(J.focusPause)) {
    focusResearch(s, false);
    jobsLog(s, '已恢复后训练');
  }
  const out = { id: `j${J.seq}`, seq: J.seq, ...job, paused: false, since: s.day, queuedDays: 0 };
  J.list.push(out);
  jobsLog(s, `开工：${jobLabel(s, out)}`);
  startedLog(s, out);
  return out;
}

// ---------- 作业操作（T4.3、T11.2） ----------
const need = (s, id) => { const j = jobById(s, id); if (!j) throw new Error('没有这项作业'); return j; };
export function cancelJob(s, id) {
  const job = need(s, id);
  removeJob(s, job);
  recordAutoTrialCancel(s,id);
  if (job.lab?.back?.length) returnFindings(s, job.lab);
  if (isBaseJob(job)) log(s, job.kind === 'distill' ? '中止蒸馏项目' : '中止训练项目');
  jobsLog(s, `取消：${jobLabel(s, job)}${job.lab?.back?.length ? '（用掉的试验结论退回）' : ''}`);
  return { kind: 'jobs', op: 'cancel', id };
}
export function pauseJob(s, id, on = true) {
  const job = need(s, id);
  job.paused = !!on;
  if (!on && Array.isArray(s.jobs.focusPause)) s.jobs.focusPause = s.jobs.focusPause.filter(x => x !== id);
  jobsLog(s, `${on ? '暂停' : '继续'}：${jobLabel(s, job)}`);
  return { kind: 'jobs', op: 'pause', id, on: !!on };
}
export function setJobPrio(s, id, prio) {
  if (typeof prio !== 'string' || !Object.hasOwn(JOBS.WEIGHT, prio)) throw new Error('优先级只有“优先”和“正常”');
  need(s, id).prio = prio;
  return { kind: 'jobs', op: 'prio', id, prio };
}
export function setJobCap(s, id, cards) {
  const job = need(s, id);
  if (cards === null || cards === undefined || cards === '') { job.cap = null; return { kind: 'jobs', op: 'cap', id, cap: null }; }
  const n = Math.floor(Number(cards));
  const min = Math.ceil(minCards(s, job));
  if (!Number.isFinite(n) || n < min) throw new Error(`最多张数不能比最低卡少（${min} 张）`);
  job.cap = n;
  return { kind: 'jobs', op: 'cap', id, cap: n };
}
export function setPost(s, id, { dir, bench, until } = {}) {
  const job = need(s, id);
  if (!isPost(job)) throw new Error('只有后训练能改方向');
  const m = postTarget(s, job);
  const inputError = persistentInputError({ dir, bench, until });
  if (inputError) throw new Error(inputError);
  if (until !== undefined && !untilOk(s, until)) throw new Error('结束条件不对');
  if (bench !== undefined && bench !== null) {
    if (!benchmaxPreview(s, bench, m)) throw new Error('现在不能针对这个榜单训练');
    job.bench = bench; delete job.dir;
  } else if (dir !== undefined) {
    if (dir !== 'auto' && !directionsFor(s).some(d => d.key === dir)) throw new Error('没有这个后训练方向，或者还没解锁');
    delete job.bench; job.dir = dir;
    if (dir === 'auto') delete job.autoAt;
  }
  if (until !== undefined) { job.until = until; job.stall = 0; }
  return { kind: 'jobs', op: 'post', id };
}
export function setRush(s, id, on) {
  const job = need(s, id);
  if (job.kind !== 'pretrain') throw new Error('只有底座能赶工');
  job.rush = !!on;
  log(s, on ? '训练项目全力推进' : '训练项目恢复正常节奏');
  return { kind: 'jobs', op: 'rush', id, on: !!on };
}
export function setRepair(s, on, why = '') {
  const J = ensureJobs(s);
  if (J.repair === !!on) return { kind: 'jobs', op: 'repair', on: !!on };
  J.repair = !!on;
  jobsLog(s, on ? `开始检修${why ? `（${why}）` : ''}：后训练先停下` : `检修结束${why ? `（${why}）` : ''}`);
  if (!why) log(s, on ? '开始检修集群' : '检修结束');
  return { kind: 'jobs', op: 'repair', on: !!on };
}
export function setAutoRepair(s, on) { ensureJobs(s).autoRepair = !!on; return { kind: 'jobs', op: 'autoRepair', on: !!on }; }
export function setOwnOnly(s, on) {
  const J = ensureJobs(s);
  if (J.ownOnly === !!on) return { kind: 'jobs', op: 'ownOnly', on: !!on };
  J.ownOnly = !!on;
  log(s, on ? '后训练改成只用自有数据' : '后训练恢复使用蒸馏数据');
  return { kind: 'jobs', op: 'ownOnly', on: !!on, note: on ? '后训练只用自有数据了：蒸馏数据先放着不用。' : '后训练重新用上蒸馏数据。' };
}
export function setPlan(s, cfg) {
  if (cfg === null) { ensureJobs(s).plan = null; return { kind: 'jobs', op: 'plan', plan: null }; }
  if (!isObj(cfg) || !(Number.isFinite(cfg.tokens) && cfg.tokens > 0)) throw new Error('计划的训练 token 必须是大于 0 的数');
  const total = s.mod === 'llm' ? Number(cfg.total) : null, active = s.mod === 'llm' ? Number(cfg.active) : null;
  const plan = s.mod === 'llm'
    ? { total, active: Math.min(active, total), arch: cfg.arch || (cfg.active < cfg.total ? 'moe' : 'dense'), tokens: cfg.tokens }
    : { scaleId: cfg.scaleId, tokens: cfg.tokens };
  if (s.mod === 'llm' && !(Number.isFinite(total) && Number.isFinite(active) && Number.isFinite(plan.active) && plan.total >= 0.5 && plan.active >= 0.5 && Object.hasOwn(ARCHS, plan.arch))) throw new Error('计划的参数量或架构不对');
  if (s.mod !== 'llm' && !scaleById(s.mod, plan.scaleId)) throw new Error('计划的规模不认识');
  ensureJobs(s).plan = plan;
  return { kind: 'jobs', op: 'plan', plan };
}
// 专心研究（T4.7）：一键暂停全部后训练（主线、上一代、小模型），暂停了哪几项记在 focusPause；恢复时一起恢复。
export function focusResearch(s, on) {
  const J = ensureJobs(s);
  if (on) {
    const ids = postJobs(s).filter(j => !j.paused).map(j => j.id);
    for (const id of ids) jobById(s, id).paused = true;
    J.focusPause = [...(Array.isArray(J.focusPause) ? J.focusPause : []), ...ids];
    if (ids.length) jobsLog(s, `专心研究：暂停了 ${ids.map(id => jobLabel(s, jobById(s, id)).replace(/^后训练 · /, '').split(' · ')[0]).join('、')}的后训练`);
    return { kind: 'jobs', op: 'focusResearch', on: true, paused: ids };
  }
  const ids = Array.isArray(J.focusPause) ? J.focusPause : [];
  for (const id of ids) { const j = jobById(s, id); if (j) j.paused = false; }
  J.focusPause = null;
  if (ids.length) jobsLog(s, '恢复后训练');
  return { kind: 'jobs', op: 'focusResearch', on: false, resumed: ids };
}

// decide(s, 'job', arg) 的总入口（界面和顾问用）。
export function jobOp(s, arg = {}) {
  switch (arg.op) {
    case 'start': { const job = startJob(s, arg.spec ?? arg); return { kind: 'jobs', op: 'start', job }; }
    case 'cancel': return cancelJob(s, arg.id);
    case 'pause': return pauseJob(s, arg.id, arg.on ?? true);
    case 'prio': return setJobPrio(s, arg.id, arg.prio);
    case 'cap': return setJobCap(s, arg.id, arg.cards ?? null);
    case 'post': return setPost(s, arg.id, arg);
    case 'rush': return setRush(s, arg.id, arg.on);
    case 'repair': return setRepair(s, !!arg.on);
    case 'autoRepair': return setAutoRepair(s, arg.on);
    case 'focusResearch': return focusResearch(s, !!arg.on);
    case 'plan': return setPlan(s, arg.plan ?? null);
    case 'ownOnly': return setOwnOnly(s, !!arg.on);
    default: throw new Error('未知的作业操作');
  }
}

// ---------- “重活”口径（T4.7） ----------
// 按顺序取第一条成立的：① 正在检修 0.4 / 0.03；② 有非刷榜的后训练（没被玩家暂停，含算力排队）0.4 / 0.08；③ 只有刷榜 0.4 / 0.03；④ 都没有 1.7 / 0.3。
// 仅单机卡牌的待方案/不支持方向不算已投入的团队重活；底座本来就不属于此口径。
export function heavyWork(s) {
  const J = ensureJobs(s);
  const soloCards = recognizedPostPlanLedger(s) && s.postRandom === undefined && !P().world?.settings?.mp && !P().mirror && !P().world?.mirror;
  const posts = J.list.filter(j => isPost(j) && !j.paused && !(soloCards && ['sessionPending', 'cardUnsupported'].includes(cardWorkReason(s, j))));
  if (J.repair) return { busy: JOBS.RESEARCH.busy, know: JOBS.KNOW.light, kind: 'repair' };
  if (posts.some(j => !j.bench)) return { busy: JOBS.RESEARCH.busy, know: JOBS.KNOW.post, kind: 'post' };
  if (posts.length) return { busy: JOBS.RESEARCH.busy, know: JOBS.KNOW.light, kind: 'benchmax' };
  return { busy: JOBS.RESEARCH.free, know: JOBS.KNOW.free, kind: 'none' };
}

// ---------- 自动方向（T2.4） ----------
// 每 7 天换到加权预估涨幅最大的方向。权重同机器人和顾问：12 个月内要考的榜单目标的维度加权，按失败率打折。
function goalWeights(s) {
  const [g, g2] = (s.goals || []).filter(x => x.status === 'pending' && (x.check?.type === 'bench' || x.check?.type === 'rank')).sort((a, b) => a.date.localeCompare(b.date));
  if (!g || !BENCH_BY_ID[g.check.bench]) return null;
  const months = Number(g.date.slice(0, 4)) * 12 + Number(g.date.slice(5, 7)) - (Number(s.date.slice(0, 4)) * 12 + Number(s.date.slice(5, 7)));
  if (months > 12) return null;
  const w = { ...BENCH_BY_ID[g.check.bench].w };
  if (g2 && BENCH_BY_ID[g2.check.bench]) for (const [k, v] of Object.entries(BENCH_BY_ID[g2.check.bench].w)) w[k] = (w[k] || 0) + 0.5 * v;
  return w;
}
export function bestDir(s, m) {
  return withModelReadSnapshot(s, () => {
  const w = goalWeights(s);
  let best = null, bv = -1;
  for (const d of directionsFor(s)) {
    const p = postPreview(s, d.key, { model: m });
    if (!p) continue;
    const v = Object.entries(p.gains).reduce((x, [k, y]) => x + y * (w ? 0.3 + 4 * (w[k] || 0) : 1), 0) * (1 - p.fail / 200);
    if (v > bv) { bv = v; best = d.key; }
  }
  return best;
  });
}
function dirFor(s, job, m) {
  if (job.dir !== 'auto') return job.dir;
  if (!job.autoDir || job.autoModel !== m.id || !job.autoAt || daysBetween(job.autoAt, s.day) >= 7) {
    job.autoDir = bestDir(s, m) || job.autoDir || null;
    job.autoAt = s.day;
    job.autoModel = m.id;
  }
  return job.autoDir;
}

// ---------- 每天：后训练（loop.js 的 tickDay 里原 dailyFocus 的位置） ----------
// 先看自动检修、上一代收尾到期；再按今天的分卡推进全部后训练作业（每项各自用 postPreview 算涨幅、各自掷 loss spike）。
// 后训练类损耗只扣在跑的里最重的一项（RL 15、SFT 11、刷榜 8），检修每天 +1.6。最后按“重活”口径记研究日。
export function postTick(s, out) {
  if(s.postRandom !== undefined) { assertRandomWorld(s); validatePostRandom(s); if(s.status !== 'playing' || s.postRandom.lastTickDay === s.day) return; }
  if (s.postCards?.version === 1 && (s.status !== 'playing' || s.postCards.lastTickDay === s.day)) return;
  normalizeDistill(s);
  const J = ensureJobs(s);
  autoRepairTick(s, out);
  prevTick(s, out);
  let al = allocJobs(s);
  stamp(al, true);
  const runs = [];
  for (const it of al.items) {
    const job = it.job;
    if (!isPost(job)) continue;
    const m = postTarget(s, job);
    if (!m) { endPost(s, job, out, 'target'); continue; }
    if (job.modelId !== m.id) { job.modelId = m.id; job.stall = 0; if (s.postCards?.version === 1) delete job.postCardPlanRef; }
    waitNote(s, job, it, out);
    if (!it.run) continue;
    let cardEfficiency = null;
    if(s.postRandom?.version === 1 && !job.bench) { if(s.postRandom.lastDays[m.id] === s.day) continue; cardEfficiency=dailyPostRandomRate(s,m); }
    if (s.postCards?.version === 1 && !job.bench) {
      if (s.postCards.lastDays[m.id] === s.day) continue;
      try { cardEfficiency = postCardEfficiency(s, job, m); }
      catch { job.cardWaiting = true; continue; }
      delete job.cardWaiting;
    }
    const dir = job.bench ? null : dirFor(s, job, m);
    const F = trainFlops(s) * it.share;
    const p = job.bench ? benchmaxPreview(s, job.bench, m, F) : dir ? postPreview(s, dir, { model: m, avail: F }) : null;
    if (!p) { endPost(s, job, out, 'target'); continue; }
    runs.push({ job, m, p, cardEfficiency });
  }
  if (runs.length) {
    s.health = clamp(s.health + Math.min(...runs.map(r => r.p.health)) * DAY, 0, 100);
    s.mstat.train += 1;
  }
  if (J.repair) s.health = clamp(s.health + REPAIR.rate, 0, 100);
  for (const r of runs) advancePost(s, r.job, r.m, r.p, out, r.cardEfficiency);
  if (heavyWork(s).kind === 'none') {
    s.mstat.research += 1;
    s.distillDep = Math.max(0, s.distillDep - 0.06 * DAY);
  }
  if (s.postCards?.version === 1) s.postCards.lastTickDay = s.day;
  if (s.postRandom?.version === 1) s.postRandom.lastTickDay = s.day;
}
// 今天的分卡结果记在作业上（界面、顾问读；每天重算）。
function stamp(al, count) {
  for (const it of al.items) {
    const j = it.job;
    if (j.hypo) continue;
    j.share = it.share; j.cards = it.cards; j.run = it.run; j.why = it.why;
    if (count) j.queuedDays = it.why === 'min' ? (j.queuedDays || 0) + 1 : 0;
  }
}
// 主线后训练分不到卡：只在停下和恢复的那天各提示一次（“进行中”卡上一直挂着“排队”）。
function waitNote(s, job, it, out) {
  if (job.target !== 'main') return;
  if (it.why === 'min' && !job.waitNoted) { job.waitNoted = true; out.notes.push('没有可用的训练卡，后训练先停下，有了算力再接着练。'); log(s, '没有训练算力，后训练暂停'); }
  else if (it.run && job.waitNoted) { delete job.waitNoted; out.notes.push('训练算力回来了，后训练接着练。'); log(s, '训练算力恢复，后训练继续'); }
}
function endPost(s, job, out, why) {
  removeJob(s, job);
  if (why === 'target') {
    if (job.target === 'main') out.notes.push('没有能接着训练的模型，团队先去做研究了。');
    jobsLog(s, `后训练结束：${job.target === 'main' ? '主线' : job.target === 'prev' ? '上一代' : '小模型'}没有能接着训练的模型`);
    return;
  }
  const m = postTarget(s, job);
  const text = `${m ? modelLabel(m) : '这个模型'} 的后训练练够了，可以送评`;
  out.notes.push(`${text}。`);
  jobsLog(s, text);
}
function advancePost(s, job, m, p, out, cardEfficiency = null) {
  m.postDays = (m.postDays || 0) + 1;
  m.postMonths = Math.floor((m.postDays - (m.relDays || 0)) / 30);
  job.days = (job.days || 0) + 1;
  if (job.bench) {
    m.boost = m.boost || {};
    m.boost[job.bench] = { pts: round1(p.current + p.gain * DAY * TRAIN_PACE), since: s.date };
    s.flags.benchmaxed = true;
    if (untilDone(s, job, m, p)) endPost(s, job, out, 'done');
    return;
  }
  const streak = (m.cleanStreak ??= {});
  if (rand(s) * 100 < p.fail * DAY) {
    m.dims[p.dir.main] = Math.max(0, m.dims[p.dir.main] - 0.8);
    s.health = clamp(s.health - 6, 0, 100);
    if (rand(s) < 0.5) s.morale = Math.max(-2, s.morale - 1);
    streak[p.dir.key] = 0;
    if (m.beyondTrial) m.beyondTrial.clean = 0;
    out.notes.push(`${p.dir.label}训练出现 loss spike，回滚了检查点。`);
    log(s, `${p.dir.label}训练出现 loss spike，回滚检查点`);
  } else {
    const step = Object.fromEntries(Object.entries(p.gains).map(([k, v]) => [k, v * DAY * TRAIN_PACE]));
    if (cardEfficiency === null) applyGains(s, m, step, { preMixed: true, sigma: p.sigma, dshare: p.dshare, levels: p.levels });
    else applyGains(s, m, step, { preMixed: true, sigma: p.sigma, dshare: p.dshare, levels: p.levels, postCardEfficiency: cardEfficiency });
    streak[p.dir.key] = (streak[p.dir.key] || 0) + 1;
    if (job.target === 'main') beyondDay(s, m, p, out);
  }
  if (cardEfficiency !== null) (s.postRandom || s.postCards).lastDays[m.id] = s.day;
  if (untilDone(s, job, m, p)) endPost(s, job, out, 'done');
}
// 结束条件：{ days }、{ dim, to }、'stall'（主维预估月涨幅 < 0.3 连续 7 天；自动方向只看除安全对齐以外的方向）、'none'。
function untilDone(s, job, m, p) {
  const u = job.until;
  if (!u || u === 'none') return false;
  if (isObj(u) && Number.isFinite(u.days)) return (job.days || 0) >= u.days;
  if (isObj(u) && typeof u.dim === 'string') return (m.dims[u.dim] ?? 0) >= u.to;
  if (u === 'stall') {
    let gain;
    if (job.bench) gain = p.gain;
    // 安全对齐的预估涨幅一直很高，算进来就永远停不下来；它靠安全评测那套流程处理（T2.4）。
    else if (job.dir === 'auto') gain = Math.max(0, ...directionsFor(s).filter(d => d.key !== 'safety').map(d => postPreview(s, d.key, { model: m })?.gains?.[d.main] ?? 0));
    else gain = p.gains?.[p.dir.main] ?? 0;
    job.stall = gain < JOBS.STALL.gain ? (job.stall || 0) + 1 : 0;
    return job.stall >= JOBS.STALL.days;
  }
  return false;
}
// g_beyond 的试炼（规格 D8）：主线在练模型的后训练当天真的推进了、只用自有数据（σ = 0）、没出 spike，才计一天。
// 当天用了蒸馏数据（σ > 0）试炼作废；出 spike 清零（见上面）；排队的日子既不加也不清零。满了：m.untainted，加特质 g_self_reliant，技术积累 +30。
function beyondDay(s, w, p, out) {
  const t = w.beyondTrial;
  if (!t || w.untainted) return;
  if (p.sigma > 0) {
    delete w.beyondTrial;
    out.notes.push('试炼期间用了蒸馏数据，“青出于蓝”的考验作废了。');
    log(s, '青出于蓝：用了蒸馏数据，试炼作废');
    return;
  }
  t.clean = (t.clean || 0) + 1;
  if (t.clean < (t.need ?? BEYOND.trialDays)) return;
  w.untainted = true;
  delete w.beyondTrial;
  addSpirit(s, 'g_self_reliant');
  s.know = (s.know || 0) + 30;
  out.notes.push(`${modelLabel(w)} 只用自己的数据练满了考验，不再受老师的天花板限制。`);
  log(s, '青出于蓝：试炼完成，这一代解除污染');
}
// 自动检修（T4.5）：每天查一次，健康 < 40 打开，到 75 关。
function autoRepairTick(s, out) {
  const J = ensureJobs(s);
  if (!J.autoRepair) return;
  if (J.repair && s.health >= REPAIR.until) { setRepair(s, false, '健康回到 75'); out.notes.push('集群检修完了，后训练接着练。'); }
  else if (!J.repair && s.health < REPAIR.start) { setRepair(s, true, `健康掉到 ${Math.round(s.health)}`); out.notes.push('集群健康掉到 40 以下，自动检修：后训练先停下，健康每天回升约 1.6。'); }
}
// 上一代收尾到期（T7）：还没送评的就归档（模型记录留在 s.models），挂在它上面的后训练一起结束；已经在评测中的候选照常发布。
function prevTick(s, out) {
  const pw = s.prevWorking;
  if (!pw || !(s.day >= pw.until)) return;
  const m = prevModel(s);
  for (const j of postJobs(s).filter(x => x.target === 'prev')) removeJob(s, j);
  s.prevWorking = null;
  if (m && (m.postDays || 0) > (m.relDays || 0)) {
    log(s, `${modelLabel(m)} 没发布就归档了`);
    out.notes.push(`上一代 ${modelLabel(m)} 收尾期满，没发布的进步归档了。`);
  }
}

// ---------- 每天：底座类作业和试验（原 projectTick 的位置） ----------
// 每项作业各自按当场的份额推进（同一天里后训练先扣损耗、底座再推进，所以底座用的是扣完损耗以后的 trainFlops），各自掷炸炉骰子。
// 底座类损耗：有底座类作业或试验在跑时每月 5，有赶工再加 8，不按作业数叠加。
export function baseTick(s, report) {
  const J = ensureJobs(s);
  let ran = false, rush = false;
  for (const job of [...J.list]) {
    if (!J.list.includes(job) || !(isBaseJob(job) || isTrial(job))) continue;
    const it = itemOf(s, job);
    if (it) { job.share = it.share; job.cards = it.cards; job.run = it.run; job.why = it.why; }
    if (isTrial(job)) { if (trialDay(s, job, it, report)) ran = true; continue; }
    if (baseDay(s, job, it, report)) { ran = true; if (job.rush) rush = true; }
  }
  if (ran) s.health = clamp(s.health - (JOBS.WEAR.base + (rush ? JOBS.WEAR.rush : 0)) * DAY, 0, 100);
}
function baseDay(s, job, it, report) {
  const pj = job.pj;
  validateTrainingAcc(pj);
  const main = job.line === 'main';
  // 蒸馏按日历记天数：分不到卡的日子也算（整理数据、评测照常做）；算力跑完了也要满流程下限才出小模型。
  if (pj.minDays) pj.elapsedDays = Math.round(((pj.elapsedDays || 0) + 1) * 1000) / 1000;
  if (pj.done >= pj.need) {
    if (projectProgress(pj) >= 1) finishJob(s, job, report);
    else if (main) report.project = { type: pj.type, progress: projectProgress(pj), waiting: true };
    return false;
  }
  // 分不到最低卡（排队）或被暂停：停着，不推进、不炸炉、不累集群。
  if (!it?.run || !(it.share > 0)) { if (main) report.project = { type: pj.type, progress: projectProgress(pj), paused: true }; return false; }
  const F = trainFlops(s) * it.share;
  let rate = pj.type === 'finetune' ? 1 : F * kpOf(s) * (job.rush ? JOBS.RUSH : 1) * DAY;
  // 预训练有最快天数：卡再多也快不过它（T2.2）。
  if (pj.type === 'pretrain') rate = Math.min(rate, pj.need / fastestDays(s, pj.structure));
  if (!(rate > 0)) return false;
  // 炸炉：越大越容易出事，用掉的试验结论（lab.risk）能压低。严重时回退 5 天的进度（最多回退已完成部分的 25%），当天不推进，已记的数据权重按同一比例回滚。
  if (rand(s) < projectRisk(s, pj.structure) * (job.lab?.risk ?? 1) * DAY) {
    const severe = rand(s) < 0.4;
    if (severe) {
      const back = Math.min(JOBS.ROLLBACK_DAYS * rate, JOBS.ROLLBACK_MAX * pj.done);
      const f = pj.done > 0 ? (pj.done - back) / pj.done : 1;
      pj.done -= back;
      if (pj.type === 'pretrain' && f < 1) rescaleTrainingAcc(pj.acc, f);
      rate = 0;
    } else rate *= 0.55;
    s.health = clamp(s.health - (severe ? 15 : 8), 0, 100);
    const b = (pj.blowups ??= { minor: 0, severe: 0 });
    b[severe ? 'severe' : 'minor'] += 1;
    report.notes.push(severe ? 'loss 发散，训练炸了：回滚到几天前的检查点。' : '训练中途节点故障，从检查点重启，损失了部分进度。');
    report.blowup = severe ? 'severe' : 'minor';
  }
  // 只记真正用上的算力：最后一天多出来的不算进进度，也不给数据加权重。
  const used = Math.min(Math.max(0, pj.need - pj.done), rate);
  const frac = used / pj.need;
  if (pj.type === 'pretrain' && used > 0) {
    const pool = poolStats(s);
    const repeat = pretrainRepeat(s, pool.tokens, pj.tokens);
    pj.acc.w += frac;
    pj.acc.q += frac * pool.quality;
    pj.acc.effectiveQ += frac * pool.quality * repeat;
    pj.acc.repeat += frac * repeat;
    pj.acc.cn += frac * (pool.mix.cn || 0);
    for (const [k, v] of Object.entries(pool.mix)) pj.acc.mix[k] = (pj.acc.mix[k] || 0) + frac * v;
  }
  pj.done = Math.min(pj.need, pj.done + used);
  if (main) report.project = { type: pj.type, progress: projectProgress(pj) };
  if (projectProgress(pj) >= 1) finishJob(s, job, report);
  return true;
}
// 试验：只在拿到卡的日子记天数；成本跑完、并且满流程天数才出结论（lab.js 的 finishTrial）。
function trialDay(s, job, it, report) {
  if (!it?.run || !(it.share > 0)) return false;
  job.done += trainFlops(s) * it.share * DAY;
  job.elapsed = (job.elapsed || 0) + 1;
  if (job.done >= job.cost - 1e-9 && job.elapsed >= job.minDays) { const result=finishTrial(s,job,report); recordAutoTrialOutcome(s,job,result); }
  return true;
}

// ---------- 闲置提醒的计时（顾问用，T9.2） ----------
// 训练卡里没分出去的部分（含检修留出的那份）≥ 20% 时开始计时；低于就清零。每天在月结前记一次。
export function idleTick(s) {
  const J = ensureJobs(s);
  const al = allocJobs(s);
  if (al.T > 0 && al.free >= JOBS.IDLE_NAG.share) { if (!J.idle.since) J.idle.since = s.day; } else J.idle.since = null;
}
export const idleDays = s => (s.jobs?.idle?.since ? daysBetween(s.jobs.idle.since, s.day) : 0);

// ---------- 读旧字段直接报错（T11.2） ----------
// s.project、s.focus 已经删掉：装不可枚举的取值器，读写都拦。测试环境（globalThis.__MRP_STRICT__）一读就抛错；正式环境返回 undefined，控制台警告一次。
// JSON 不序列化不可枚举的属性，存档和指纹不受影响。
let warned = false;
export function guardOldFields(s) {
  if (!isObj(s)) return s;
  for (const k of ['project', 'focus']) {
    if (Object.hasOwn(s, k) && Object.getOwnPropertyDescriptor(s, k)?.get) continue;
    delete s[k];
    const msg = `s.${k} 已删除：改读作业表`;
    Object.defineProperty(s, k, {
      configurable: true, enumerable: false,
      get() { if (globalThis.__MRP_STRICT__) throw new Error(msg); if (!warned) { warned = true; console.warn(msg); } return undefined; },
      set() { if (globalThis.__MRP_STRICT__) throw new Error(msg); if (!warned) { warned = true; console.warn(msg); } },
    });
  }
  return s;
}
