// 安全评测（规格 T6，P2.4a）：送评时把在练模型当天的样子冻结成候选（名字、开源、技术报告也在这时定），评测按日历天走，不占卡、不占作业位；
// 评测期间在练模型照常练下一版，评完自动发布（tickDay 的 out.releases）。评测不改任何维度，只在发布出去的版本上记下评测档 evalTier，
// 之后出事、打官司按 riskSafety 算；跳过评测有一笔不随安全维归零的固定代价，风险封顶 62，也不能拿去备案。
// 和 ui/panels/eval.js、decide('eval')（跑分）不是一回事，跑分不变。
import {cancelledEvaluationReceipt,recordCancelledEvaluation} from './automation_evaluation_ledger.js';
import { EVAL } from '../data/balance.js';
import { RELEASE_GAP } from '../data/supply.js';
import { addDays } from './clock.js';
import { liveModel } from './model.js';
import { modifier } from './modifiers.js';
import { releaseLine, releaseNow } from './release.js';
import { releaseNamePlan, reserveGrant, unreserveGrant, ensureNaming } from './naming.js';
import { structuredCloneSafe } from './projects.js';
import { smallModels, postJobs, postTarget, ensureJobs, jobsLog } from './jobs.js';
import { log } from './log.js';
import { P } from './provider.js';

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
export const TIER_LABEL = { full: '从严', standard: '标准', quick: '快速', skip: '跳过', legacy: '旧档' };
const evalsOf = s => (Array.isArray(s.evals) ? s.evals : (s.evals = []));

// 评测天数 = round(档位天数 × (小模型 ? 0.5 : 1) × evalDays 加成)，从严、标准、快速至少 4 天；跳过和旧档没有天数。
export function evalDaysFor(s, tier, line) {
  const t = EVAL.TIERS[tier];
  if (!t) throw new Error('没有这一档评测');
  if (tier === 'skip' || tier === 'legacy') return 0;
  return Math.max(EVAL.MIN_DAYS, Math.round(t.days * (line === 'small' ? EVAL.SMALL : 1) * modifier(s, 'evalDays')));
}
// 风险读数（T6.4）：min(档.cap, 安全维 + 档.adj + 评测过的三档再加 evalAdj)。没写档的按跳过算（任何漏写都是“从严罚”）。
export function riskSafety(s, m) {
  if (!m) return null;
  const tier = EVAL.TIERS[m.evalTier] ? m.evalTier : 'skip';
  const t = EVAL.TIERS[tier];
  const adj = t.adj + (['full', 'standard', 'quick'].includes(tier) ? modifier(s, 'evalAdj') : 0);
  return Math.min(t.cap, (m.dims?.safety ?? 0) + adj);
}
// 国内对话备案（T6.6）：只认已经发布、评测过的版本——在线旗舰、正在灰度的旗舰、今天评完的候选；档位要能备案（评测过的三档和旧档）。
// 在练模型不算，评测中的候选也不算。
export function filingSafety(s) {
  const ok = tier => !!EVAL.TIERS[tier]?.filing;
  let best = 0;
  const live = liveModel(s);
  if (live && ok(live.evalTier)) best = Math.max(best, live.dims?.safety ?? 0);
  for (const d of s.deploy || []) {
    if (d.role === 'small') continue;
    const m = (s.models || []).find(x => x.id === d.id);
    if (m && ok(m.evalTier)) best = Math.max(best, m.dims?.safety ?? 0);
  }
  for (const e of evalsOf(s)) if (e.line !== 'small' && e.until <= s.day && ok(e.tier)) best = Math.max(best, e.cand?.dims?.safety ?? 0);
  return best;
}
// 默认档位（T10.3、T9.1）：frontier、bigtech 走标准，其余快速；国内对话备案还没过的走标准。永远不默认跳过。
export function defaultTier(s) {
  const filingPending = s.company?.country === 'CN' && s.mod === 'llm' && P().gate('cnFiling', s) && s.service?.filing !== 'done';
  return ['frontier', 'bigtech'].includes(s.company?.tier) || filingPending ? 'standard' : 'quick';
}

// 这个模型在哪条线上：主线在练 main、上一代收尾 prev、待发布没在评测中的小模型 small；都不是返回 null。
export function evalLine(s, m) {
  if (!m) return null;
  if (m.id === s.working && m.stage === 'post') return 'main';
  if (s.prevWorking?.id === m.id && m.stage === 'post') return 'prev';
  if (smallModels(s).some(x => x.id === m.id)) return 'small';
  return null;
}
// 现在为什么不能送评（能送评返回空串）。主线和上一代：自上次送评以来又练了 RELEASE_GAP + releaseGapDays 天；同一条线没有正在评测的候选。
export function submitBlock(s, m, line = evalLine(s, m)) {
  if (!m) return line === 'small' ? '没有待发布的小模型' : '没有在后训练的模型';
  if (!line) return '只能送评主线在练的模型、上一代收尾的模型，或待发布的小模型';
  if (line === 'small') return evalsOf(s).some(e => e.modelId === m.id) ? '这个小模型已经在评测了' : '';
  if (evalsOf(s).some(e => e.line === line)) return '这一条线已经有候选在评测';
  const left = Math.max(0, RELEASE_GAP + modifier(s, 'releaseGapDays')) - ((m.postDays || 0) - (m.relDays || 0));
  return left > 0 ? `再后训练 ${left} 天才能送评` : '';
}

// 送评（T6.2）：opts = { name, grant, open, replace, papers }。名字、授名、开源在这时校验，不合法当场报错、什么都不改。
// 主线、上一代：当天按发布的建快照逻辑做出候选（能力、训练记录、污染、谱系，以及送评那天的 s.techs），w.releases + 1，m.relDays = m.postDays；
// 小模型：模型本身就是候选，记 m.evalId，它的后训练作业结束，评测期间仍占小模型线的名额。
// 史实名能用就预留（rights[hn].used = 候选 id），评测期间授名到期也照常使用。tier 是 'skip' 时当天发布（返回发布结果）。
export function submitEval(s, { modelId, tier, opts = {} } = {}) {
  // 开发期存档读进来马上送评的，先换成新命名（naming.js），候选是按新命名冻结的。
  ensureNaming(s);
  const m = (s.models || []).find(x => x.id === modelId) || null;
  const line = evalLine(s, m);
  const why = submitBlock(s, m, line);
  if (why) throw new Error(why);
  if (!EVAL.TIERS[tier] || tier === 'legacy') throw new Error('没有这一档评测：从严、标准、快速、跳过');
  const o = isObj(opts) ? opts : {};
  const relLine = releaseLine(s, m, { replace: !!o.replace });
  const named = releaseNamePlan(s, m, { ...o, line: relLine });
  if (!named.ok) throw new Error(named.reason);
  const plan = { name: named.name, grant: named.grant ?? null, ...(typeof o.open === 'boolean' ? { open: o.open } : {}), replace: !!o.replace, papers: Array.isArray(o.papers) ? [...o.papers] : [] };
  // 受限开源条款（M.5.3）：只有带了才记，发布时写进快照，世界收盘按它登记（缺的项按默认全勾）。
  if (isObj(o.licenseTerms)) plan.terms = Object.fromEntries(['attrib', 'royalty', 'noCompete'].filter(k => typeof o.licenseTerms[k] === 'boolean').map(k => [k, o.licenseTerms[k]]));
  // 自洽世界在送评这一刻就把名字登记进世界账本（M.5.4）：评测期间一直占着，撤回时释放。
  // 先登记再改 releases，登记失败时什么都不变。史实 Provider 的 claimName 是空操作。
  const plannedId = line === 'small' ? `ev_${m.id}` : `ev_${m.id}r${m.releases || 0}`;
  const nameWhy = P().claimName?.(s, plan.name, { evalId: plannedId, modelId: m.id }) ?? null;
  if (nameWhy) throw new Error(nameWhy);
  const days = evalDaysFor(s, tier, line);
  const ev = { id: null, line, modelId: m.id, tier, start: s.day, until: addDays(s.day, days), days, prevRelDays: m.relDays || 0, prevReleases: m.releases || 0, prevPostMonths: m.postMonths || 0,
    techs: [...(s.techs || [])], cand: null, plan };
  if (line === 'small') {
    ev.id = `ev_${m.id}`;
    for (const j of postJobs(s).filter(x => postTarget(s, x) === m)) ensureJobs(s).list = s.jobs.list.filter(y => y !== j);
  } else {
    // 候选 id 是 ${w.id}r${w.releases}（C5）；然后 w.releases + 1，m.relDays = m.postDays。
    ev.cand = { ...structuredCloneSafe(m), id: `${m.id}r${m.releases || 0}`, benchmarks: {} };
    ev.id = `ev_${ev.cand.id}`;
    m.releases = (m.releases || 0) + 1;
    m.relDays = m.postDays || 0;
    m.postMonths = 0;
  }
  const candId = ev.cand?.id ?? m.id;
  // 命名预留（C7）：授名的 used 记成候选 id，撤回时清掉。
  reserveGrant(s, plan.grant, candId);
  if (tier === 'skip') return releaseNow(s, { ev });
  if (line === 'small') m.evalId = ev.id;
  evalsOf(s).push(ev);
  const label = line === 'small' ? '小模型' : line === 'prev' ? '上一代' : '';
  log(s, `送评${label}「${plan.name}」：${TIER_LABEL[tier]}评测 ${days} 天`);
  jobsLog(s, `送评：${plan.name}（${TIER_LABEL[tier]} ${days} 天）`);
  return { kind: 'submit', eval: ev, name: plan.name, days, until: ev.until };
}
// 撤回（T6.2）：随时可以。候选作废；主线、上一代的 relDays、releases 退回送评前；小模型解冻，回到可训练的列表；授名预留清掉。
export function cancelEval(s, id) {
  const ev = evalsOf(s).find(e => e.id === id);
  if (!ev) throw new Error('没有这个评测');
  const autoCancel=cancelledEvaluationReceipt(s,ev);
  s.evals = evalsOf(s).filter(e => e !== ev);
  const m = (s.models || []).find(x => x.id === ev.modelId);
  if (m && ev.line === 'small') delete m.evalId;
  else if (m) { m.relDays = ev.prevRelDays; m.releases = ev.prevReleases; m.postMonths = Math.floor(((m.postDays || 0) - (m.relDays || 0)) / 30); }
  const candId = ev.cand?.id ?? ev.modelId;
  unreserveGrant(s, ev.plan?.grant, candId);
  // 自洽世界释放这个名字（史实 Provider 什么都不做）。没有确认撤回的评测不释放。
  P().releaseName?.(s, ev.plan?.name, ev.id);
  recordCancelledEvaluation(s,autoCancel);
  log(s, `撤回送评：${ev.plan?.name}`);
  return { kind: 'cancelEval', id };
}
// 每天（tickDay 里 dailyDeploy 之前）：到期的候选走 releaseNow，用送评时冻结的方案发布。发布结果放进 out.releases（界面播发布结果卡）。
export function evalTick(s, out) {
  const due = evalsOf(s).filter(e => e.until <= s.day).sort((a, b) => a.until.localeCompare(b.until));
  for (const ev of due) {
    if (!evalsOf(s).includes(ev)) continue;
    s.evals = evalsOf(s).filter(e => e !== ev);
    const r = releaseNow(s, { ev });
    (out.releases ??= []).push(r);
    out.notes.push(`${r.model.name} 评测完了，今天发布。`);
    // 评测期间名字被别的发布先用了：发布时加了后缀，提示一次（C7）。
    if (r.note) { out.notes.push(r.note); log(s, r.note); }
  }
}
// 只给测试用：把一个候选当天评完发布。
export function _finishEvalNow(s, id) {
  const ev = evalsOf(s).find(e => e.id === id);
  if (!ev) throw new Error('没有这个评测');
  s.evals = evalsOf(s).filter(e => e !== ev);
  return releaseNow(s, { ev });
}
