// “下一步”建议：像文明六右下角的大按钮，告诉玩家现在最该做什么、为什么。
// 先列不占本月行动的事（上线产品、扩容、研究、立项、融资），最后是本月的主要行动。
// 思路和自动对局机器人一致，但只推荐正当做法：不推荐刷榜、偷偷降智、违规蒸馏和走私。
import { TECHS, GPUS, PARAM_TOTALS, PARAM_ACTIVES, SCALES, PRODUCTS, monthsBetween, gpuAvailable, gpuRentable, dimLabel, dimKeys } from '../data/core.js';
import { DATASETS } from '../data/datasets.js';
import { BENCH_BY_ID } from '../data/benchmarks.js';
import { rankTop } from '../data/goals.js';
import { workingModel, liveModel, smallLive, gpuAllocation, playerScore, postPreview, directionsFor, poolStats, previewProject, baseEtaFor, projectEta, inferGpuEq, leaderboard, clsOf, computeCaps, MAX_EPOCHS, gpuCount, riskEnv } from './model.js';
import {
  decide, availableActions, gpuOrderInfo, researchTech, bestRentGpu, buyGpu, setProduct, setInferShare, projectCheck, distillCheck,
  fundingOffers, startFunding, borrow, borrowLimit, ipoCheck, startIpo, datasetAvailable, goalNeed, FILING_SAFETY,
} from './game.js';
import { fmtMoney } from './util.js';
import { researchOptions, researchSlots, researchSpeed, researchNeed, techStatus, daysLeft } from './research.js';
import { dataLeadDays, deployDays } from '../data/supply.js';
import { daysBetween, inDays } from './clock.js';
import { releaseOpenRule } from './route.js';
import { releaseLine } from './release.js';
import { releaseNamePlan } from './naming.js';
import { relRole, sotaMade, Q_W, gapOf, qOf, sotaWouldTake } from './sota.js';
import { GEN, BOT, IDLE_ADVICE_EVERY, JOBS, REPAIR } from '../data/balance.js';
import {
  hasBaseJob, baseJob, allocCtx, mainPostJob, postJobs, postJobFor, smallModels, smallLineCount, prevModel, allocJobs, jobCheck, startJob, jobOp, jobLabel, jobEta, idleDays, focusResearch, setPost, slotsUsed, jobSlots, isBaseJob,
} from './jobs.js';
import { submitBlock, filingSafety, defaultTier, evalDaysFor, TIER_LABEL } from './evals.js';
import { P } from './provider.js';
import { matchFindings, archChoices, trialPreview, refModel as refModelOf } from './lab.js';
import { dataCatOf } from './model.js';
import { expectPreview } from './expect.js';
import { registerStrategyKind, startStrategy, nodeOf, spiritDef } from './strategy.js';
import { adviseStrategy, distillTeacher, shouldHold, grantWindow } from './strategy_ai.js';
import { describeEffects } from './effects.js';
import { capMods } from './modifiers.js';

// 公司策略和专属事件两种卡片在这里登记一次：engine.js 直接导入本文件，求值到这里时 queue.js 已经就绪
// （strategy.js、exclusive.js 求值时 queue.js 往往还没好），界面开机读档、清理队列时就认得这两种卡片。
registerStrategyKind();

const pct = v => `${Math.round(v * 100)}%`;
// 抢标签要领先持标者多少分才建议马上送评（P4.2 校准：0 时大按钮的前沿拿标率冲到 77%–95%，超出 F4 区间）。
const RACE_EDGE = 1.0;
const fmt1 = v => (Math.round(v * 10) / 10).toString();
const TOKEN_STEPS = [0.3, 0.5, 1, 2, 4, 8, 12, 15, 20, 30];

// 一次 advise 里状态不变，同一个方向的后训练预估会被算好几遍（目标规划、立项判断、最后的后训练选择），这里记一遍。
// 只在 advise 调用期间生效，返回空就退回现算；调用方都只读结果，不往里写。
let MEMO = null;
const previewOf = (s, key) => {
  if (!MEMO || MEMO.s !== s) return postPreview(s, key);
  let v = MEMO.post.get(key);
  if (v === undefined) { v = postPreview(s, key); MEMO.post.set(key, v); }
  return v;
};
const dirsOf = s => {
  if (!MEMO || MEMO.s !== s) return directionsFor(s);
  return MEMO.dirs || (MEMO.dirs = directionsFor(s));
};

const lowerBetter = b => b.kind === 'lower';
// 开不开源按路线（规格 B2、B3）：旗舰锁定的照路线，小模型和副线取路线的默认（smallDefault）。发布时的角色按这一版默认会不会顶替在线旗舰定。
const planOpen = (s, role) => { const r = releaseOpenRule(s, role); return r.open === 'choice' ? r.default : r.open; };
const releaseOpenFor = (s, m) => planOpen(s, relRole({ line: releaseLine(s, m) }));
const meets = (b, v, t) => v !== null && (lowerBetter(b) ? v <= t : v >= t);
// 里程碑要多少分：榜单类看门槛；排名类看检查那个月排第 N 的对手（只比同量级的就只看同量级），再留一点余量。
function goalTarget(s, g, m) {
  const c = g.check;
  const b = BENCH_BY_ID[c.bench];
  if (c.type === 'bench') return c.max ?? c.min;
  const rows = leaderboard(s, c.bench, { date: g.date, cls: c.classOnly && m ? clsOf(m) : null }).rows.filter(r => !r.mine);
  const r = rows[rankTop(c, rows.length) - 1];
  if (!r) return lowerBetter(b) ? Infinity : -Infinity;
  const margin = b.kind === 'elo' ? 2 * b.k : 1.5;
  return lowerBetter(b) ? r.score - margin : r.score + margin;
}
// 照对口的方向一直练下去，第几周能达标。每周挑对这个榜单最有用的方向；主维度按“离上限的距离 × 速度”逼近上限，副维度按比例跟着涨。
// 返回 weeks（这一代底座练满也到不了是 Infinity）和 ceiling（练满能到多少分）。
const WEEK_PACE = 0.8 * 7 / 30;
function trainWeeks(s, b, m, target, maxWeeks) {
  const dirs = [];
  for (const d of dirsOf(s)) {
    const p = previewOf(s, d.key);
    if (!p) continue;
    const room = p.caps[d.main] - m.dims[d.main];
    dirs.push({ d, p, rate: room > 0.3 ? p.gains[d.main] / room : 0 });
  }
  if (!dirs.length) return null;
  const score = dims => playerScore(s, b, { dims, cn: m.cn, boost: m.boost });
  const top = { ...m.dims };
  for (const k of Object.keys(b.w)) for (const x of dirs) if (x.d.main === k) top[k] = Math.max(top[k] || 0, x.p.caps[k]);
  const ceiling = score(top);
  let dims = { ...m.dims };
  if (meets(b, score(dims), target)) return { weeks: 0, ceiling };
  if (!meets(b, ceiling, target)) return { weeks: Infinity, ceiling };
  for (let wk = 1; wk <= maxWeeks; wk++) {
    let next = null;
    let ns = null;
    for (const { d, p, rate } of dirs) {
      const g = Math.max(0, (p.caps[d.main] - dims[d.main]) * rate * WEEK_PACE);
      if (g <= 0) continue;
      const nd = { ...dims, [d.main]: dims[d.main] + g };
      for (const k of Object.keys(p.gains)) if (k !== d.main) nd[k] = dims[k] + (d.side[k] > 0 ? Math.min(g * d.side[k], Math.max(0, p.caps[k] - dims[k])) : g * d.side[k]);
      const sc = score(nd);
      if (ns === null || (lowerBetter(b) ? sc < ns : sc > ns)) { ns = sc; next = nd; }
    }
    if (!next) break;
    dims = next;
    if (meets(b, ns, target)) return { weeks: wk, ceiling };
  }
  // 练得到，只是剩下的时间不够：记成“比能练的周数还多”。
  return { weeks: maxWeeks + 1, ceiling };
}
// 一个里程碑的进度：还剩几天、要多少分、在线版和训练中的版本各多少、按现在的练法要几周、扣掉灰度和维护还剩几周能练。
// 团队大约七成时间在训练（其余是维护和杂事），新版本还要在检查前灰度完。
const TRAIN_SHARE = 0.7;
function goalPlan(s, g) {
  const b = BENCH_BY_ID[g.check.bench];
  const w = workingModel(s);
  const live = liveModel(s);
  const m = w?.stage === 'post' ? w : null;
  const days = daysBetween(s.day, `${g.date}-01`);
  const target = goalTarget(s, g, m || live);
  const plan = { g, b, days, months: monthsBetween(s.date, g.date), target, live: live ? playerScore(s, b, live) : null, work: m ? playerScore(s, b, m) : null };
  plan.liveOk = meets(b, plan.live, target);
  plan.avail = m ? Math.max(0, (days - deployDays(m) - 4) / 7) * TRAIN_SHARE : 0;
  // 第一次没达标还有两个月宽限。
  plan.graceAvail = plan.avail + (g.grace ? 0 : (60 / 7) * TRAIN_SHARE);
  const tw = m ? trainWeeks(s, b, m, target, Math.min(60, Math.ceil(plan.graceAvail) + 2)) : null;
  plan.weeks = tw ? tw.weeks : null;
  plan.ceiling = tw ? tw.ceiling : null;
  plan.workOk = plan.weeks === 0;
  // 吃紧：要用掉一大半剩下的时间；没指望：连宽限期都赶不上（或者这一代底座练满也到不了）。
  plan.tight = plan.weeks !== null && plan.weeks > plan.avail * 0.6;
  plan.hopeless = plan.weeks !== null && plan.weeks > plan.graceAvail;
  return plan;
}
// 盯哪个里程碑：12 个月内要考的榜单逐个估算，训练中的版本已经达标的少分点心，越吃紧的越优先。
// 返回最该盯的那个（g、b、months 和进度），以及几个里程碑合起来的维度权重 w，后训练方向、研究和数据都按它打分。
function goalFocus(s) {
  const goals = s.goals.filter(x => x.status === 'pending' && (x.check.type === 'bench' || x.check.type === 'rank')).sort((a, b) => a.date.localeCompare(b.date));
  if (!goals.length) return null;
  const plans = goals.filter(g => monthsBetween(s.date, g.date) <= 12).map(g => goalPlan(s, g));
  const w = {};
  const add = (b, f) => { for (const [k, v] of Object.entries(b.w)) w[k] = (w[k] || 0) + f * v; };
  // 还没有能后训练的模型（或者 12 个月内没有榜单考核）：盯最近的一个，下一个（14 个月内）按一半权重照顾。
  if (!plans.length || plans[0].weeks === null) {
    const [g, g2] = goals;
    const b = BENCH_BY_ID[g.check.bench];
    add(b, 1);
    if (g2 && monthsBetween(s.date, g2.date) <= 14) add(BENCH_BY_ID[g2.check.bench], 0.5);
    return { ...(plans[0] || { g, b, months: monthsBetween(s.date, g.date) }), w, next: plans[0] || null };
  }
  // 紧迫程度 = 要练的周数 / 还能练的周数。已经达标的、这一代底座练满也够不着的（要靠新底座），都不占后训练。
  const urgency = plans.map((p, i) => (p.workOk || p.hopeless ? 0.15 : Math.min(1, Math.max(i === 0 ? 0.5 : 0.25, p.weeks / Math.max(p.avail, 1)))));
  let mi = 0;
  urgency.forEach((u, i) => { if (u > urgency[mi] + 0.05) mi = i; });
  // 最该盯的那个权重 1，其余的按紧迫程度最多一半，免得离上限远、涨得快的方向把要紧的目标挤掉。
  plans.forEach((p, i) => add(p.b, i === mi ? 1 : 0.5 * Math.min(1, urgency[i] / urgency[mi])));
  return { ...plans[mi], w, next: plans[0], plans };
}
const est = (s, b, m) => (m && s.date >= b.from ? playerScore(s, b, m) : null);
const scoreText = (b, v) => (v === null ? '—' : b.kind === 'elo' ? String(Math.round(v)) : `${fmt1(v)}${b.kind === 'pct' || b.kind === 'lower' ? '%' : ''}`);
const when = months => (months <= 0 ? '这个月' : `${months} 个月后`);

function techValue(t, focus) {
  const e = t.effects || {};
  let v = 1 + Object.keys(e.cap || {}).length * 0.5 + Object.keys(e.post || {}).length * 0.5;
  for (const k of [...Object.keys(e.cap || {}), ...Object.keys(e.post || {})]) v += 4 * (focus?.w[k] || 0);
  if (t.id === 'reasoning') v += 6;
  if (t.id === 'agentic_rl' || t.id === 'moe') v += 3;
  return v;
}
// 能马上开始的研究，按“用处 ÷ 要花的时间”排：别人开源过的同样有用、快得多，自研首创要慢很多。
// 自研首创很慢，只有推理、Agent 这种关键技术才值得硬啃；其余的等别人公开了再学。
const openTechs = (s, focus) => researchOptions(s).filter(x => x.check.ok && (x.st.level !== 'secret' || techValue(x.t, focus) >= 6)).sort((a, b) => techValue(b.t, focus) / b.need - techValue(a.t, focus) / a.need).map(x => x.t);

// 按当前的卡和分流方案估算推理负载（扩容或调整之后马上变，不用等下个月）。
function loadNow(s) {
  const sv = s.service.last;
  if (!sv?.needGpu) return 0;
  const coming = s.orders.filter(o => o.kind === 'rent').reduce((a, o) => a + o.n * (GPUS[o.ref]?.infer || 0), 0) * s.inferShare;
  let cap = inferGpuEq(s) + coming;
  if (s.service.routing.startsWith('quant')) cap *= 1.35;
  if (s.service.routing.startsWith('distill')) cap *= 1.9;
  return cap > 0 ? sv.needGpu / cap : 9;
}

// 新底座练满（后训练到上限）大约能到多少分。env：projectAdvice 里算好的 capMods（cm）和数据池（pool）。
function baseCeiling(s, b, pv, env) {
  const caps = computeCaps(s, { mod: s.mod, base: pv.base, kcap: pv.kcap }, env.cm);
  return playerScore(s, b, { dims: caps, cn: env.pool.mix.cn || 0 });
}
// 候选底座表：枚举几百个规模 × token 配置，过立项检查、算底座分 q（不估工期）。这是 advise 里最贵的一步（规格 F4 性能线）。
// 表只取决于下面这些输入：同一份状态里全部没变就复用上一张（UI 每次渲染、顾问一周里连着给几条建议时大多没变），任何一项变了就重算。
//   日期（年代门槛）、已学技术（架构、技术门槛）、卡数（显存）、数据池（poolStats 没变时返回同一个对象）、炸炉风险里的公司部分（riskEnv）、
//   上限加成（capMods 在修正值缓存重建前返回同一个对象）、旗舰开不开源（路线）。主线有底座作业时 projectAdvice 不会走到这里。
// 表是只读的：调用方估工期、返回建议时都另建对象。练满上限（ceils）按榜单记在同一张表上。
const CAND_CACHE = new WeakMap();
function candTable(s, env) {
  const re = env.riskEnv;
  const open = planOpen(s, 'flagship');
  const key = [s.day, s.techs.join(','), env.gpus, re.health, re.fp8, re.stability, re.know, open].join('|');
  const hit = CAND_CACHE.get(s);
  if (hit && hit.key === key && hit.pool === env.pool && hit.cm === env.cm) return hit.table;
  const cands = [];
  const consider = cfg => {
    if (!projectCheck(s, cfg, env).ok) return;
    const pv = previewProject(s, cfg, { eta: false, pool: env.pool, riskEnv: re });
    const q = Object.values(pv.base).reduce((a, b) => a + b, 0) - (pv.risk || 0) * 30;
    if (q > -Infinity) cands.push({ cfg, pv, q });
  };
  if (s.mod === 'llm') {
    // 语料最多重复 MAX_EPOCHS 遍，和 projectCheck、后台立项表单同一个上限。
    const toks = TOKEN_STEPS.filter(t => t <= Math.max(1, env.pool.tokens * MAX_EPOCHS));
    const archs = ['dense', ...(s.techs.includes('moe') ? ['moe'] : []), ...(s.charId === 'rwkv' ? ['rnn'] : [])];
    for (const arch of archs) for (const total of PARAM_TOTALS) {
      for (const active of (arch === 'moe' ? PARAM_ACTIVES.filter(a => a <= total / 3) : [total])) for (const tokens of toks) consider({ total, active, arch, tokens, open });
    }
  } else for (const sc of SCALES[s.mod]) consider({ scaleId: sc.id, tokens: 1, open });
  let byQ = null;
  const ceils = {};
  const table = {
    cands,                                                     // 枚举顺序
    byQ: () => byQ || (byQ = [...cands].sort((x, y) => y.q - x.q)), // 按分从高到低，同分保持枚举顺序
    ceils: b => ceils[b.id] || (ceils[b.id] = cands.map(c => baseCeiling(s, b, c.pv, env))),
  };
  CAND_CACHE.set(s, { key, pool: env.pool, cm: env.cm, table });
  return table;
}
function projectAdvice(s, focus) {
  const w = workingModel(s);
  // 主线有底座类作业就不建议立项；小模型线在蒸馏不挡主线立项（T9.2）。
  if (hasBaseJob(s, 'main') || slotsUsed(s) >= jobSlots(s)) return null;
  const saturated = w && w.stage === 'post' && dirsOf(s).every(d => { const p = previewOf(s, d.key); return !p || (p.gains[d.main] || 0) < 0.6; });
  const old = w && w.postMonths >= 5 && (w.releases || 0) >= 2;
  const yearly = w && s.monthsPlayed % 10 === 9;
  // 这一代底座开工满 BOT.BASE_EVERY_MONTHS 个月（和机器人 planJobs 的“since ≥ 9”同一口径）：开局自带、没有开工记录的按开局月算。
  // 只靠 yearly 一个月的窗口不够：先建议“给下一代调超参数”，试验做完往往已经出了窗口，立项建议就再也不出现（M1e 实测）。
  // due 一旦成立会一直成立到新底座开工，不会错过。（“调参做完就立项”不能当触发：闲卡试验一直在给下一代出结论，等于没底座就立项。）
  const ageMonths = w ? monthsBetween(String(w.pretraining?.started || s.start || s.date).slice(0, 7), s.date) : 0;
  const due = w && ageMonths >= BOT.BASE_EVERY_MONTHS;
  // 12 个月内有榜单目标，这一代底座练满也够不着：趁来得及（检查前或宽限期里能练完），提前换更大的底座。
  const need = focus?.plans?.find(p => p.hopeless && !p.liveOk && p.days >= 60);
  // 眼前的里程碑正练得紧：新底座会接替训练中的版本，预训练还要分走大部分算力，等检查完再立项（练不动了的除外）。
  if (w && !saturated && !need && focus?.tight && !focus.hopeless && focus.days <= 150) return null;
  if (w && !saturated && !old && !yearly && !need && !due) return null;
  const why = !w ? '还没有自己的模型，第一步是练出底座' : saturated ? '现在这一代底座各个方向都练不动了，要靠新底座突破上限'
    : need ? `「${need.g.title}」要求 ${goalNeed(need.g.check)}，这一代底座练满也只有 ${scoreText(need.b, need.ceiling)} 左右，得换更大的底座`
    : old ? '这一代已经迭代好几版了，该开始准备下一代底座'
    : due ? `这一代底座开工已经 ${ageMonths} 个月，对手差不多一年出一代新底座，现在开练才不会掉队` : '对手差不多一年出一代新底座，现在开练，明年才不会掉队';
  let best = null;
  const ctx = allocCtx(s);
  // 只和公司状态有关的几样（卡数、数据池、炸炉风险里的公司部分、上限加成）对所有候选都一样，先算一遍。
  const env = { gpus: gpuCount(s), pool: poolStats(s), riskEnv: riskEnv(s), cm: capMods(s, dimKeys(s.mod)) };
  const T = candTable(s, env);
  if (!need) {
    // 取工期 ≤ 5 个月里底座分最高的（同分取枚举在前的）：按分从高到低（排序稳定，同分保持枚举顺序），第一个练得完的就是。
    // 大底座分高但工期长，从高往低估比从小到大逐个估少估很多次工期。表是缓存的、只读：工期另建一个对象。
    for (const c of T.byQ()) {
      const pv = { ...c.pv, ...baseEtaFor(s, c.pv, ctx) };
      if (pv.months <= 5) { best = { cfg: { ...c.cfg }, pv }; break; }
    }
  } else {
    // 为了够着目标换底座：按这个榜单练满能到多少分挑（ceil 只看底座，不用估工期），还得赶在宽限期结束前练完、留一个月后训练。
    // 同样先按分排好（同分保持枚举顺序），再从高往低估工期，第一个练得完的就是。
    const ceils = T.ceils(need.b);
    const ok = [];
    T.cands.forEach((c, i) => {
      const ceil = ceils[i];
      if (!(lowerBetter(need.b) ? ceil < need.ceiling - 1 : ceil > need.ceiling + 1)) return;
      const q = (lowerBetter(need.b) ? -ceil : ceil) * 10 + c.q * 0.1;
      if (q > -Infinity) ok.push({ c, q });
    });
    for (const { c } of ok.sort((x, y) => y.q - x.q)) {
      const pv = { ...c.pv, ...baseEtaFor(s, c.pv, ctx) };
      if (pv.months <= 5 && pv.months * 30 <= need.days + 30) { best = { cfg: { ...c.cfg }, pv }; break; }
    }
  }
  if (best) {
    const st = best.pv.structure;
    const size = s.mod === 'llm' ? `${st.total}B${st.active < st.total ? `（激活 ${st.active}B）` : ''}、${best.cfg.tokens}T token` : SCALES[s.mod].find(x => x.id === best.cfg.scaleId).label;
    // 下一代计划还没有调参结论时，先给下一代底座调一次超参数（T9.2 第 5 条）；调参在做，就等它做完再立项。
    const tune = tuneAdvice(s, best.cfg, why);
    if (tune === 'wait') return null;
    if (tune) return tune;
    const plan = { type: 'project', cfg: best.cfg };
    return { id: 'project', kind: 'page', label: `立项下一代底座 ${size}：约 ${Math.max(1, Math.round(best.pv.days))} 天，占 ${count(best.pv.cards.got)} 张卡`, detail: `${why}。最低 ${count(best.pv.cards.min)} 张卡、想要 ${best.pv.cards.want === null ? '—' : count(best.pv.cards.want)} 张；每月炸炉风险 ${pct(best.pv.risk)}。${labLine(s, best.cfg, best.pv)}`, op: plan };
  }
  if (need && !saturated && !old && !yearly && !due) return null;
  // 自家旗舰比学生大、现在能立项（distillCheck 和真正立项用同一套检查），才建议自己蒸馏。
  const dcfg = { teacher: 'self', total: 14, active: 14, arch: 'dense', tokens: 1.5, open: planOpen(s, 'small') };
  if (s.mod === 'llm' && distillCheck(s, dcfg).ok && !smallLive(s) && jobCheck(s, { kind: 'distill', cfg: dcfg }).ok) {
    return { id: 'distill', kind: 'page', label: '蒸馏一个 14B 小模型', detail: '算力不够立项新底座，先用自家旗舰蒸馏一个便宜的小模型，API 多一档低价选择。', op: { type: 'distill', cfg: dcfg } };
  }
  return null;
}

function freeAdvice(s, focus) {
  const out = [];
  const live = liveModel(s);
  // 上线产品。
  for (const p of PRODUCTS[s.mod]) {
    // 备案制度（2023 年 8 月）之前就上线的国内对话产品，开关虽然开着，没备案也收不到国内的钱。
    const filing = p.id === 'chat' && s.company.country === 'CN' && P().gate('cnFiling', s) && s.service.filing !== 'done';
    if (p.id === 'gpu_lease' || (s.products[p.id]?.on && !filing) || p.from > s.date || !live) continue;
    if (p.need && Object.entries(p.need).some(([k, v]) => (live.dims[k] || 0) < v)) continue;
    // 备案只认已经发布、评测过的版本（T6.6）；有候选在评测、够线、不弱于在线旗舰、会在备案出结果之前评完，也可以先交。
    const soonCand = filing ? filingCandidate(s) : null;
    if (filing && (s.service.filing === 'pending' || (filingSafety(s) < FILING_SAFETY && !soonCand))) continue;
    out.push(filing
      ? { id: 'filing', kind: 'free', label: '提交对话产品备案', detail: soonCand ? `国内对话产品要先备案，审核约 2 个月。${soonCand.plan.name} 评完以后正好赶上备案审核。` : `国内对话产品要先备案，审核约 2 个月；安全对齐已经够 ${FILING_SAFETY}。`, op: { type: 'product', id: p.id } }
      : { id: `product:${p.id}`, kind: 'free', label: `上线${p.label}`, detail: p.need ? '模型的代码和 Agent 能力已经达标，这块收入现在就能拿。' : '模型已经发布，产品可以开卖了。', op: { type: 'product', id: p.id } });
  }
  // 推理扩容：先把算力往推理挪，挪不动再租卡。
  const load = loadNow(s);
  // 推理负载和推理份额成正比：一步调到负载七成左右，不用一点点挪。
  // 有生成订单在借推理卡时（规格 D7）不成正比了：份额低时生成把推理卡借到只剩 5%，份额高了生成又封顶在 30%。
  // 这时按 5% 一档试算，取负载降到目标的最小份额，免得一会儿调高、一会儿调低。
  const genOn = s.orders.some(o => o.gen?.mode === 'gpu' && !o.gen.paused && o.gen.done < o.gen.need);
  const shareFor = target => {
    if (!genOn) return Math.round(s.inferShare * load / target * 20) / 20;
    for (let v = 0.05; v <= 0.9 + 1e-9; v += 0.05) if (loadNow({ ...s, inferShare: Math.round(v * 100) / 100 }) <= target) return Math.round(v * 100) / 100;
    return 0.9;
  };
  if (load > 0 && load < 0.45 && s.inferShare > 0.15 && (baseRunning(s) || workingModel(s)?.stage === 'post')) {
    const v = Math.max(0.1, Math.min(s.inferShare - 0.05, shareFor(0.7)));
    out.push({ id: 'infer', kind: 'free', label: `推理算力降到 ${pct(v)}`, detail: `推理负载只有 ${pct(load)}，空着的卡挪去训练，模型能练得更快。`, op: { type: 'infer', value: v } });
  }
  if (load > 0.8) {
    const r429 = s.service.last?.r429 || 0;
    const why = `推理负载 ${pct(Math.min(load, 9))}${r429 > 0.01 ? `，高峰有 ${pct(r429)} 的请求被 429 挡掉` : '，快撑不住了'}`;
    if (load > 0.9 && s.inferShare < 0.7 && !baseRunning(s)) {
      const v = Math.min(0.85, Math.max(s.inferShare + 0.05, shareFor(0.75)));
      out.push({ id: 'infer', kind: 'free', label: `推理算力调到 ${pct(v)}`, detail: `${why}。训练暂时用不了那么多卡，先挪一部分去服务用户。`, op: { type: 'infer', value: v } });
    } else {
      const g = bestRentGpu(s);
      const per = GPUS[g].infer * s.inferShare;
      const need = s.service.last.needGpu - inferGpuEq(s) * 0.75;
      const left = gpuRentable(g, s.date, s.company.country, s.flags.overseasRent) ? gpuOrderInfo(s, g, true).left : 0;
      const n = Math.min(left, Math.max(32, Math.ceil(need / Math.max(per, 0.05) / 32) * 32));
      if (n > 0 && s.cash > n * GPUS[g].rent * 8) out.push({ id: 'rent', kind: 'free', label: `扩容：租 ${n} 张 ${GPUS[g].label.replace(/（.*?）/, '')}`, detail: `${why}。每月租金约 ${fmtMoney(n * GPUS[g].rent)}，大约 10 天后开通。${n < need / Math.max(per, 0.05) ? '这个月云上只剩这么多卡。' : ''}`, op: { type: 'rent', gpu: g, n } });
    }
  }
  // 生成订单（规格 D7）：顾问自己从不建议暂停；玩家停下的单，团队不在后训练、或推理卡空出来放得下老师、或者已经停了一个月，就建议恢复。
  out.push(...genAdvice(s));
  // 研究：有空着的研究槽，就把最划算的一项排进去。
  const t = s.research.length < researchSlots(s) ? openTechs(s, focus)[0] : null;
  if (t) {
    const st = techStatus(s, t);
    out.push({ id: `tech:${t.id}`, kind: 'free', label: `研究：${t.name}`, detail: `${t.desc} ${st.level === 'secret' ? '业界还没人公开过，只能自研，' : st.level === 'open' ? '已经有人开源，照着学，' : ''}约 ${Math.ceil(researchNeed(s, t) / Math.max(0.05, researchSpeed(s)))} 天。`, op: { type: 'tech', id: t.id } });
  }
  // 资本：现金撑不过一年半就融资；够条件就上市。
  const last = s.history.at(-1);
  const burn = Math.max(1, (last?.costs || 0) - (last?.revenue || 0));
  const offers = s.company.kind !== 'division' && !s.capital.round && s.cash < burn * 18 ? fundingOffers(s) : [];
  const strat = offers.find(o => o.strategic);
  if (offers.length) {
    const d = strat ? strat.dilution : s.capital.listed ? 0.1 : 0.15;
    out.push({ id: 'fund', kind: 'page', label: strat ? '接受战略投资（出让 10%）' : s.capital.listed ? '增发新股（出让 10%）' : '启动融资（出让 15%）', detail: `按现在的花钱速度，现金只够撑 ${Math.max(0, Math.floor(s.cash / burn))} 个月。两个月后出结果。${strat ? '战略投资方是云厂商，之后一年租卡打 85 折。' : ''}`, op: { type: 'fund', dilution: d } });
  } else if (s.company.kind !== 'division' && s.cash < burn * 6 && borrowLimit(s) > 0) {
    // 融资谈不了（泡沫、冷却）又撑不过半年：建议拿显卡抵押借钱（规格 K4）。
    const amt = Math.min(borrowLimit(s), burn * 6 - Math.max(0, s.cash));
    out.push({ id: 'borrow', kind: 'page', label: `显卡抵押借 ${fmtMoney(amt)}`, detail: `融资现在谈不了，现金只够撑 ${Math.max(0, Math.floor(s.cash / burn))} 个月。用自有显卡抵押，年息 12%，按月付息。`, op: { type: 'borrow', usd: amt } });
  }
  if (ipoCheck(s).ok && P().gate('ipoAdvice', s)) out.push({ id: 'ipo', kind: 'page', label: '启动上市', detail: `估值 ${fmtMoney(s.valuation)}，已经满足上市条件。大约 3 个月后挂牌，能募到估值的 8% 左右。`, op: { type: 'ipo' } });
  // 训练算力：钱多就买卡（半年最多一次）。
  if (s.flags.gpuBuyAt === undefined || s.monthsPlayed - s.flags.gpuBuyAt >= 6) {
    const covered = (last?.revenue || 0) >= (last?.costs || 0) * 0.3;
    const budget = s.company.kind === 'division' ? s.cash * 0.25 : s.company.tier === 'small' && !covered ? 0 : s.cash - burn * 12;
    const g = ['Rubin', 'B300', 'B200', 'H200', 'H100', 'Ascend950', 'Ascend910C', 'H20', 'Ascend910B', 'A100'].find(id => gpuAvailable(id, s.date, s.company.country));
    if (g && budget > GPUS[g].price * 512) {
      const n = Math.min(8192, Math.floor(budget * 0.5 / GPUS[g].price / 256) * 256);
      // 这个季度的配额被别的采购（比如超事件里的“采购”）用完了，就先不建议；只剩一部分时按剩下的写（buyGpu 本来也只买到剩下的）。
      const k = Math.min(n, gpuOrderInfo(s, g).left);
      if (n >= 256 && k > 0) out.push({ id: 'buy', kind: 'free', label: `采购 ${k} 张 ${GPUS[g].label.replace(/（.*?）/, '')}`, detail: `账上留够一年开销后还有余钱，买卡能让预训练和后训练都更快。花 ${fmtMoney(k * GPUS[g].price)}。${k < n ? '这个季度的配额只剩这么多。' : ''}`, op: { type: 'buy', gpu: g, n: k } });
    }
  }
  const pj = projectAdvice(s, focus);
  if (pj) out.push(pj);
  return out;
}

// 暂停中的生成订单什么时候该恢复：团队不在后训练（训练卡闲着，推理份额调高也不耽误）；推理卡空出的部分放得下老师；或者暂停满 GEN.nagDays 天。
function genAdvice(s) {
  const out = [];
  const spare = Math.max(0, inferGpuEq(s) - (s.service.last?.needGpu || 0));
  for (const o of s.orders) {
    if (!o.gen?.paused) continue;
    // 没有后训练作业在跑（排队的不算在跑，T4.8）：训练卡闲着，借推理卡生成不耽误什么。
    const idle = !postRunning(s);
    const fits = o.gen.mode === 'api' || spare >= o.gen.nMin;
    const long = daysBetween(o.gen.paused, s.day) >= GEN.nagDays;
    if (!idle && !fits && !long) continue;
    const why = long ? `已经暂停 ${daysBetween(o.gen.paused, s.day)} 天了，订单不会自己作废，接着跑完才不白下`
      : idle ? '现在没有后训练在跑，借推理卡生成不耽误什么' : `推理卡空出来约 ${Math.round(spare)} 张，放得下老师`;
    out.push({ id: `gen:resume:${o.id}`, kind: 'free', label: `恢复生成：${o.name}`, detail: `${why}。`, op: { type: 'act', action: 'data', arg: { id: `gen:resume:${o.id}` } } });
  }
  return out;
}

// 订数据：后训练数据到手就一直有效，档位决定这个方向练得多快（一点没有只有 0.55 倍，1 档 1.05 倍，2 档以上 1.2 倍）；
// 预训练数据进数据池，下一代底座会更强。只推荐来源干净的（不碰盗版、违反服务条款和来源不明的）。
const dataMult = lvl => (lvl <= 0 ? 0.55 : lvl < 1 ? 0.8 : lvl < 2 ? 1.05 : 1.2);
const CLEAN_RIGHTS = new Set(['public', 'permissive', 'licensed', 'consented']);
function dataAdvice(s, focus, trainDir) {
  // 已经在路上的数据也算进档位，免得重复下单。
  const lvl = { ...s.data.post };
  for (const o of s.orders.filter(x => x.kind === 'data')) for (const [k, v] of Object.entries(DATASETS.find(d => d.id === o.ref)?.posts || {})) lvl[k] = (lvl[k] || 0) + v;
  // 每个方向的数据值多少：眼下在练的、要考的榜单用得上的，最值钱。
  const want = {};
  const dirOf = {};
  for (const d of dirsOf(s)) {
    const v = 0.2 + 2 * (focus?.w[d.main] || 0) + (d.key === trainDir ? 1 : 0);
    if (v > (want[d.data] || 0)) { want[d.data] = v; dirOf[d.data] = d; }
  }
  // 炼出过 SOTA 的公司（A10）：综合分算进去的几类后训练数据要补到 BOT.MAKER_DATA 档，冲顶力的“自有数据”一项才到位（照样只推荐来源干净的）。
  const maker = sotaMade(s) ? new Set(Object.keys(Q_W[s.mod]).map(k => dataCatOf(s.mod, k)).filter(Boolean)) : null;
  if (maker) for (const c of maker) if ((lvl[c] || 0) < BOT.MAKER_DATA) want[c] = Math.max(want[c] || 0, 1);
  const last = s.history.at(-1);
  const tight = s.company.kind !== 'division' && s.cash < Math.max(1, (last?.costs || 0) - (last?.revenue || 0)) * 12;
  let best = null;
  for (const ds of DATASETS) {
    if (ds.mod !== s.mod || !CLEAN_RIGHTS.has(ds.rights) || ds.cost > s.cash * 0.15 || !datasetAvailable(s, ds).ok || s.orders.some(o => o.ref === ds.id)) continue;
    let v = 0;
    let why = '';
    if (ds.kind === 'pre') {
      if (ds.quality < 1.0) continue;
      v = ds.cost ? 0.12 : 0.25;
      why = `质量不错的预训练语料（${ds.tokens >= 1 ? `${fmt1(ds.tokens)}T` : `${Math.round(ds.tokens * 1000)}B`} token），放进数据池，下一代底座会更强。${ds.cost ? `花 ${fmtMoney(ds.cost)}。` : '免费。'}`;
    } else {
      let top = 0;
      for (const [k, x] of Object.entries(ds.posts)) {
        const now = lvl[k] || 0;
        const gain = (want[k] || 0) * (dataMult(Math.min(2.5, now + x)) - dataMult(now));
        v += gain;
        if (gain > top && dirOf[k]) {
          top = gain;
          why = `「${dirOf[k].label}」的训练数据${now <= 0 ? '还没有' : `只有 ${fmt1(now)} 档`}，订上以后这个方向练得快 ${pct(dataMult(Math.min(2.5, now + x)) / dataMult(now) - 1)}，以后一直有效。`;
        }
      }
      if (maker && Object.keys(ds.posts).some(k => maker.has(k) && (lvl[k] || 0) < BOT.MAKER_DATA)) why += `炼出过 SOTA 的公司，这几类自有数据要补到 ${BOT.MAKER_DATA} 档，冲最强才有底气。`;
      why += `${ds.cost ? `花 ${fmtMoney(ds.cost)}，` : '免费，'}大约 ${dataLeadDays(ds)} 天到货。`;
    }
    // 现金紧的时候，只买眼下用得上的。
    if (v < (tight ? 0.3 : 0.05)) continue;
    if (!best || v > best.v || (v === best.v && ds.cost < best.ds.cost)) best = { ds, v, why };
  }
  return best;
}

// 蒸馏（A10 的 wantsDistill）：没炼出过 SOTA、落后当前最强一截、有许可宽松的开源老师明显更强时，建议蒸馏它。只用开源权重。
function distillAdvice(s) {
  const t = distillTeacher(s);
  if (!t) return null;
  return { id: `data:${t.id}`, kind: 'free', label: `蒸馏 ${t.teacherName}`, op: { type: 'act', action: 'data', arg: { id: t.id } },
    detail: `蒸馏 ${t.teacherName}：能很快追近，但这一代永远超不过 ${t.teacherName} 和当前最强。${t.desc}` };
}
// 公司策略空闲时（A10）：定下一项。现实中这家公司这时走了哪一步，就优先推荐它；会改路线的节点只在这种时候推荐。
// 玩家点了“先不做”，这个提醒周期（IDLE_ADVICE_EVERY 天）里不再提。
function strategyAdvice(s) {
  const S = s.strategy;
  if (!S?.tree || S.cur || (S.snooze && daysBetween(S.snooze, s.day) < IDLE_ADVICE_EVERY)) return null;
  const pick = adviseStrategy(s);
  const n = pick ? nodeOf(s, pick.id) : null;
  if (!n) return null;
  const sp = (n.spirits?.add || []).map(x => spiritDef(s, typeof x === 'string' ? x : x.id)).filter(Boolean).map(d => `特质「${d.title}」：${d.desc}`);
  const detail = [n.desc, describeEffects(n.effects, s), ...sp, `${n.days} 天完成。`, pick.historic ? '现实中这家公司这时走了这一步。' : ''].filter(Boolean).join(' ');
  return { id: 'strategy', kind: 'free', label: `定下一项公司策略：${n.title}`, detail, op: { type: 'strategy', id: n.id } };
}

// ---------- 训练作业（规格 T9.2） ----------
const COUNT_FMT = new Intl.NumberFormat('en-US');
const count = n => COUNT_FMT.format(Math.round(n));
// 作业类建议执行以后 7 天内不再出（JOBS.NAG_GAP），大按钮不会在同一周里原地打转。
const nagged = (s, id) => { const d = s.jobs?.nag?.[id]; return !!d && daysBetween(d, s.day) < JOBS.NAG_GAP; };
// 有底座类作业在跑（排队的不算）；有后训练作业在跑。
const baseRunning = s => allocJobs(s).items.some(i => i.run && isBaseJob(i.job));
const postRunning = s => allocJobs(s).items.some(i => i.run && i.job.kind === 'post');
// 能赶在备案出结果（约 60 天）之前评完、够线、发布时会顶替在线旗舰的候选（T6.6、T9.2）。
function filingCandidate(s) {
  const live = liveModel(s);
  return (s.evals || []).find(e => e.line !== 'small' && (e.cand?.dims?.safety ?? 0) >= FILING_SAFETY && daysBetween(s.day, e.until) <= 60
    && (!live || qOf(s.mod, e.cand.dims) >= qOf(s.mod, live.dims))) || null;
}
// 立项表单那一行：用掉的试验结论（“试验省下 6%：约 139 → 131 天”）。
function labLine(s, cfg, pv) {
  const c = jobCheck(s, { kind: 'pretrain', line: 'main', cfg });
  const save = c.ok ? c.job?.lab?.save || 0 : 0;
  return save > 0 ? `试验省下 ${Math.round(save * 100)}%：约 ${Math.round(pv.days)} → ${Math.round(c.eta)} 天。` : '';
}
// 下一代计划没有调参结论：先开一项调参（中档，拿不到想要卡一半就小档）；调参在做就返回 'wait'。
function tuneAdvice(s, cfg, why = '') {
  const has = matchFindings(s, cfg).some(f => f.type === 'tune' && daysBetween(f.day, s.day) <= 120);
  if (has) return null;
  if ((s.jobs?.list || []).some(j => j.kind === 'trial' && j.type === 'tune')) return 'wait';
  for (const size of ['mid', 'small']) {
    const c = jobCheck({ ...s, jobs: { ...s.jobs, plan: cfg } }, { kind: 'trial', type: 'tune', size, plan: cfg });
    if (!c.ok || !(c.cards.got > 0) || (size === 'mid' && c.cards.got < 0.5 * (c.cards.want ?? Infinity))) continue;
    const p = trialPreview(s, { type: 'tune', size, plan: cfg });
    return { id: 'trial:tune', kind: 'free', label: `先给下一代底座调一次超参数（${size === 'mid' ? '中档' : '小档'}，约 ${p.days} 天、${count(c.cards.got)} 张卡）`,
      detail: `${why ? `${why}。` : ''}立项前用小模型试一试超参数：成功率约 ${Math.round(p.odds * 100)}%，成功时${p.gains}。试验不占作业位。`, op: { type: 'trial', plan: cfg, spec: { kind: 'trial', type: 'tune', size, plan: cfg } } };
  }
  return null;
}
const D = (action, arg, label, detail, id = `act:${action}`) => ({ id, kind: 'free', label, detail, op: { type: 'act', action, arg } });
// 作业类建议（不占时间，T9.2 第 1–7 条，第 5 条“该换底座”在 freeAdvice 的 projectAdvice 里）。
function jobsAdvice(s, focus) {
  const out = [];
  const al = allocJobs(s);
  // 1. 排队 ≥ 7 天：把推理份额调低到放得下；调到 5% 也放不下，就暂停一项试验。
  const q = al.items.find(i => i.why === 'min' && !i.job.hypo && (i.job.queuedDays || 0) >= JOBS.QUEUE_NAG);
  if (q && !nagged(s, 'jobs:queue')) {
    const T = al.T, left = Math.max(0, T - al.items.reduce((a, i) => a + i.cards, 0) - (s.jobs.repair ? T * REPAIR.share : 0));
    const need = q.minCards - left;
    const self = gpuAllocation(s).selfGpus;
    const v = Math.floor((s.inferShare - need / Math.max(1, self)) * 20) / 20;
    const trial = al.items.find(i => i.job.kind === 'trial' && i.run);
    if (v >= 0.05 && self > 0) out.push({ id: 'jobs:queue', kind: 'free', nag: true, label: `${jobLabel(s, q.job)} 在排队：把推理份额调到 ${pct(v)}`,
      detail: `要 ${count(q.minCards)} 张卡，现在只剩 ${count(left)} 张。推理份额调到 ${pct(v)} 以下就放得下（推理能力少约 ${pct(1 - v / s.inferShare)}）。`, op: { type: 'infer', value: v } });
    else if (trial) out.push({ id: 'jobs:queue', kind: 'free', nag: true, label: `暂停「${jobLabel(s, trial.job)}」`, detail: `${jobLabel(s, q.job)} 要 ${count(q.minCards)} 张卡，推理份额调到最低也放不下，先把试验停一停。`, op: { type: 'job', op: 'pause', id: trial.job.id, on: true } });
  }
  // 2. 底座工期超过 270 天。
  const b = baseJob(s, 'main');
  if (b && b.kind === 'pretrain') {
    const eta = jobEta(s, b);
    if (Number.isFinite(eta) && eta > JOBS.WARN_DAYS && !nagged(s, 'jobs:slow')) out.push({ id: 'jobs:slow', kind: 'free', nag: true, label: `这个底座要练约 ${Math.round(eta / 30)} 个月`, detail: `${jobLabel(s, b)} 按现在的分卡还要约 ${Math.round(eta)} 天：可以调低推理份额，或者取消换一个小一点的。`, op: { type: 'page', page: 'model' } });
  }
  // 3. 可以送评（取代原来的“发布”）：小模型线先；主线按原来的发布条件，送评档位按 T9.1 的规则选。
  const tier = defaultTier(s);
  for (const m of smallModels(s)) {
    if (postJobFor(s, m) || submitBlock(s, m, 'small')) continue;
    const name = releaseNamePlan(s, m, { role: 'small', line: releaseLine(s, m), open: releaseOpenFor(s, m) }).name;
    out.push(D('submit', { modelId: m.id, role: 'small', tier, open: releaseOpenFor(s, m) }, `送评小模型 ${name}（${TIER_LABEL[tier]} ${evalDaysFor(s, tier, 'small')} 天）`, '小模型已经练好了。评完自动发布：API 多一档便宜的选择，高峰期也能分担负载。', `submit:small:${m.id}`));
  }
  return out;
}

// 送评、下数据单（当天就做，不占团队），以及后训练怎么办（最后一条，kind 'jobs'）。
function monthAdvice(s, focus) {
  const out = jobsAdvice(s, focus);
  const a = availableActions(s);
  const w = workingModel(s);
  const live = liveModel(s);
  const near = focus && focus.months <= 12;
  const J = s.jobs;
  const main = mainPostJob(s);
  const curDir = main && !main.paused && !main.bench ? (main.dir === 'auto' ? main.autoDir : main.dir) : null;
  // 授名时机（P3.D2，A10）：手里有成立的授名时，送评排到作业建议最前面。不受“后训练满 3 个月”和 shouldHold 限制；
  // 名字不用特意指定，releaseNamePlan 送评时会自动选上（C7）。
  const grant = a.release && w ? grantWindow(s, w) : null;
  const grantNow = !!grant && !submitBlock(s, w, 'main');
  if (grantNow) {
    const tier = defaultTier(s);
    const days = evalDaysFor(s, tier, 'main');
    const left = grant.until ? daysBetween(s.day, grant.until) : null;
    const conds = grant.lines.filter(l => l.ok).map(l => l.text).join('；');
    out.unshift({ ...D('submit', { modelId: w.id, tier, open: releaseOpenFor(s, w) }, `趁「${grant.name}」的条件还成立送评`,
      `${conds}。${grant.until ? `授权到 ${grant.until} 为止，还剩 ${left} 天；` : ''}评测 ${days} 天，发布时照常用这个名字。`, 'jobs:submit:grant'), nag: true });
  }
  // 抢标签（P4.2）：在练的这一版现在发布就能从别家手里拿下 SOTA 标签，而且领先持标者至少 RACE_EDGE 分（评测期间不容易被追上），
  // 就别等“后训练满 3 个月”，按公司平时的评测档马上送评。领先不到这么多时照旧按下面的规则送。自家已经持标时不用抢。
  const holder = s.sota?.holder ?? null;
  const qw = w ? qOf(s.mod, w.dims) : null;
  const race = !!a.release && !!w && !grantNow && holder?.by !== 'me' && releaseLine(s, w) === 'main' && !submitBlock(s, w, 'main') && sotaWouldTake(s, qw) === true
    && (!holder || qw >= holder.q + RACE_EDGE);
  if (race && !nagged(s, 'jobs:submit')) {
    const tier = tier0(s);
    const days = evalDaysFor(s, tier, 'main');
    const name = releaseNamePlan(s, w, { open: releaseOpenFor(s, w) }).name;
    const vs = holder ? `比标签现在的持有者 ${holder.name}（${fmt1(holder.q)}）高 ${fmt1(qw - holder.q)} 分` : '比场上所有对手都强';
    out.unshift({ ...D('submit', { modelId: w.id, tier, open: releaseOpenFor(s, w) }, `抢 SOTA：送评 ${name}（${TIER_LABEL[tier]} ${days} 天）`,
      `${name} 现在综合 ${fmt1(qw)} 分，${vs}，发布就能拿下 SOTA 标签。评测期间对手可能先发更强的版本，越早送评越稳。`, 'jobs:submit'), nag: true });
  }
  const F = (op, key, label, detail) => {
    const same = op.op === 'post' ? !!main && !main.paused && curDir === op.dir : op.op === 'focusResearch' ? Array.isArray(J.focusPause) || !postJobs(s).some(j => !j.paused) : op.op === 'repair' ? !!J.repair : false;
    return { id: `jobs:${key}`, kind: 'jobs', same, label: same ? `继续：${label}` : label, detail, op: { type: 'job', ...op } };
  };
  // 送评时机（A10 的 shouldHold）：市场等着新旗舰拿下 SOTA、现在发会“不及预期”，而且还在涨，就先别送评，再练一阵。
  let hold = '';
  if (a.release && shouldHold(s)) {
    const p = expectPreview(s, w);
    const need = Number.isFinite(p?.need) ? p.need : Number.isFinite(p?.x) ? -p.x : -(gapOf(s, w.dims) ?? 0);
    hold = `先别急着送评：市场等着我们的新旗舰拿下 SOTA，现在发出去会被说不及预期。再练一阵（最多 ${BOT.HOLD_MAX_DAYS} 天）${need > 0 ? `，离拿到 SOTA 标签还差 ${fmt1(need)} 分` : ''}。`;
  }
  const filingLow = s.company.country === 'CN' && s.mod === 'llm' && P().gate('cnFiling', s) && s.service.filing !== 'done' && filingSafety(s) < FILING_SAFETY + 2;
  if (a.release && !grantNow && !race && !hold && !nagged(s, 'jobs:submit')) {
    const ew = focus ? est(s, focus.b, w) : null;
    const el = focus ? est(s, focus.b, live) : null;
    const better = ew === null || el === null || (focus.b.kind === 'lower' ? ew < el - 0.3 : ew > el + 0.3);
    // 检查时看的是在线版，新版本要赶在检查前评完、灰度完。按最近一个要检查的榜单里程碑掐时间。
    const nx = focus?.next;
    const lag = deployDays(w) + evalDaysFor(s, tier0(s), 'main');
    const inTime = nx && nx.work !== null && nx.days > lag + 1;
    const nxBetter = inTime && (nx.live === null || (lowerBetter(nx.b) ? nx.work < nx.live - 0.3 : nx.work > nx.live + 0.3));
    const secure = inTime && nx.workOk && !nx.liveOk && nx.days <= 120;
    const lastCall = nxBetter && nx.days - 7 <= lag + 2;
    const forFiling = filingLow && (w.dims.safety ?? 0) >= FILING_SAFETY + 2;
    if ((w.postMonths >= 3 && better) || w.postMonths >= 6 || secure || lastCall || forFiling || !live) {
      const tier = forFiling ? 'standard' : tier0(s);
      const days = evalDaysFor(s, tier, 'main');
      const name = releaseNamePlan(s, w, { open: releaseOpenFor(s, w) }).name;
      const side = releaseLine(s, w) === 'side';
      const why = forFiling ? `先送评（标准 ${days} 天），评完再备案：备案只认已经发布、评测过的版本。`
        : !live ? '底座练好了，先送评，评完自动发布，产品才能开卖。'
        : secure || lastCall ? `「${nx.g.title}」${inDays(nx.days)}检查，要求 ${goalNeed(nx.g.check)}。${nx.b.name} 训练中的版本预计 ${scoreText(nx.b, nx.work)}，在线版是 ${scoreText(nx.b, nx.live)}。评测 ${days} 天、灰度 ${deployDays(w)} 天左右，${lastCall ? '再晚就赶不上了' : '现在送评，检查时就稳了'}。`
        : focus ? `${focus.b.name} 预计 ${scoreText(focus.b, est(s, focus.b, w))}，在线版是 ${scoreText(focus.b, est(s, focus.b, live))}。`
        : `这一版后训练了 ${w.postMonths} 个月，比在线版强，该让用户用上。`;
      out.push({ ...D('submit', { modelId: w.id, tier, open: releaseOpenFor(s, w) }, `送评 ${name}（${TIER_LABEL[tier]} ${days} 天）${side ? '，作为副线发布' : ''}`,
        `评测期间接着练，发布时按那天的对手评标签和期待。${side ? '这一版比在线旗舰弱，作为副线发布：成绩照常公布，不替换在线服务。' : ''}${why}`, 'jobs:submit'), nag: true });
    }
  }
  // 4. 上一代收尾：还有 N 天就归档，送评（快速 7 天），作为副线发布。
  const pm = prevModel(s);
  if (pm && !submitBlock(s, pm, 'prev') && !nagged(s, 'jobs:prev')) {
    const left = daysBetween(s.day, s.prevWorking.until);
    out.push({ ...D('submit', { modelId: pm.id, tier: 'quick', open: releaseOpenFor(s, pm) }, `上一代 ${releaseNamePlan(s, pm, { open: releaseOpenFor(s, pm) }).name} 还有 ${left} 天就归档：送评（快速 ${evalDaysFor(s, 'quick', 'prev')} 天）`,
      '新底座练完以后，上一代还有没发布的进步：送评作为副线发布，别白练。', 'jobs:prev'), nag: true });
  }
  // 6. 闲置训练卡 ≥ 20% 连续 7 天：接一个做了会改变状态的选项（试验、小模型线、调高推理份额），都不满足就不出。
  if (idleDays(s) >= JOBS.IDLE_NAG.days && !nagged(s, 'jobs:idle')) {
    const free = Math.floor(al0(s).free * al0(s).T);
    const opt = idleOption(s, focus);
    if (opt) out.push({ id: 'jobs:idle', kind: 'free', nag: true, label: `有 ${count(free)} 张训练卡空着（${pct(al0(s).free)}）：${opt.label}`, detail: opt.detail, op: opt.op });
  }
  // 7. 作业位空着、在练模型没人练：给它挂一项后训练（在最后一条里给出）。
  const dp = dataAdvice(s, focus, curDir);
  if (dp) out.push(D('data', { id: dp.ds.id }, `订数据：${dp.ds.name}`, dp.why, `data:${dp.ds.id}`));
  const dd = distillAdvice(s);
  if (dd) out.push(dd);
  // 公司策略空闲：在作业建议之前插一条。
  const sa = strategyAdvice(s);
  if (sa) out.push(sa);
  // 最后一条：后训练怎么办（规则沿用原来团队任务的五条）。
  let best = null;
  let bv = -1;
  if (a.train) {
    for (const d of dirsOf(s)) {
      if (d.special) continue;
      const p = previewOf(s, d.key);
      if (!p) continue;
      const v = Object.entries(p.gains).reduce((x, [k, y]) => x + y * (near ? 0.3 + 4 * (focus.w[k] || 0) : 1), 0) * (1 - p.fail / 200);
      if (v > bv) { bv = v; best = { d, p }; }
    }
  }
  const key = s.research.map(r => TECHS.find(x => x.id === r.id)).filter(Boolean).sort((x, y) => techValue(y, focus) - techValue(x, focus))[0];
  const keyLeft = key ? daysLeft(s, s.research.find(r => r.id === key.id)) : 0;
  const helps = x => [...Object.keys(x.effects?.cap || {}), ...Object.keys(x.effects?.post || {})].some(k => focus?.b.w[k]);
  const pressed = near && focus.tight && !focus.hopeless;
  const sprint = pressed && a.train && s.health >= 25 && w && focus.days - deployDays(w) - 2 > 0 && focus.days - deployDays(w) - 2 <= 21;
  const skipResearch = key && pressed && !helps(key);
  const researching = Array.isArray(J.focusPause);
  const pausedNames = () => postJobs(s).filter(j => !j.paused).map(j => jobLabel(s, j).replace(/^后训练 · /, '').split(' · ')[0]);
  if (!J.autoRepair && ((s.health < REPAIR.start && !sprint) || (J.repair && s.health < REPAIR.until))) out.push(F({ op: 'repair', on: true }, 'repair', '开检修', `集群健康度 ${Math.round(s.health)}，训练很容易失败。检修时后训练先停下、留出四分之一训练卡，健康每天回升约 1.6，到 75 再接着练。`));
  else if (filingLow && a.train && live && (w.dims.safety ?? 0) < FILING_SAFETY + 2) out.push(F({ op: 'post', dir: 'safety' }, 'post:safety', '后训练改练安全对齐', `国内对话产品要备案，已经发布、评测过的版本安全对齐要不低于 ${FILING_SAFETY}，现在只有 ${Math.round(filingSafety(s))}，在练的这一版也只有 ${Math.round(w.dims.safety ?? 0)}。`));
  else if (key && !skipResearch && techValue(key, focus) >= 4 && !researching && keyLeft > 14 && keyLeft <= 150) {
    const names = pausedNames();
    out.push(F({ op: 'focusResearch', on: true }, 'research', `专心研究 ${key.name}${names.length ? `：暂停全部后训练（${names.join('、')}）` : ''}`, `「${key.name}」对眼下的目标帮助很大，照现在的速度还要约 ${keyLeft} 天；没有后训练这类重活时研究快四倍。`));
  } else if (best) {
    const gains = Object.entries(best.p.gains).filter(([, v]) => v >= 0.1).map(([k, v]) => `${dimLabel(s.mod, k)} +${fmt1(v)}`).join('、');
    const now = focus ? est(s, focus.b, w) : null;
    const detail = near && focus.w[best.d.main]
      ? `「${focus.g.title}」${when(focus.months)}检查，要求 ${goalNeed(focus.g.check)}${now === null ? '' : `，现在预计 ${scoreText(focus.b, now)}`}。这个方向对它帮助最大（一个月约 ${gains}）。${sprint && s.health < 40 ? `集群健康度只有 ${Math.round(s.health)}，但离检查只剩 ${focus.days} 天，先冲刺练完这一版再检修。` : ''}`
      : `${near && focus.hopeless ? `「${focus.g.title}」光靠后训练赶不上，要靠新底座。眼下` : ''}这个方向涨得最多：一个月约 ${gains}。${best.p.fail >= 15 ? `失败率 ${best.p.fail}%，集群有点累了。` : ''}`;
    const label = `后训练 · ${best.d.label}`;
    const cur = main && !main.paused && curDir === best.d.key;
    out.push(F({ op: 'post', dir: best.d.key }, `post:${best.d.key}`, cur ? label : main ? `改练：${label}` : `给 ${modelLabelOf(w)} 挂一项后训练：${best.d.label}`, `${hold}${detail}`));
  } else if (hasBaseJob(s, 'main')) {
    const eta = projectEta(s);
    out.push(F({ op: 'focusResearch', on: true }, 'research', '专心研究', `底座还要约 ${Number.isFinite(eta) ? `${Math.max(1, Math.round(eta * 30))} 天` : '一阵（现在分不到训练卡，在排队）'}，这段时间专心研究：推进研究槽、攒技术积累，顺便提振士气。`));
  } else out.push(F({ op: 'focusResearch', on: true }, 'research', '专心研究', '眼下没有更急的事，专心研究：推进研究槽、攒技术积累，学了新技术训练上限会更高。'));
  return out;
}
const tier0 = s => defaultTier(s);
const al0 = s => allocJobs(s);
const modelLabelOf = m => m?.name || m?.draftName || '在练的模型';
// 闲置的训练卡能做什么（T9.2 第 6 条），按顺序取第一个做了会改变状态的。
function idleOption(s, focus) {
  // 给下一代计划开一项试验：还有没做过的种类，而且放得下。
  const plan = s.jobs.plan || null;
  if (plan) {
    const kinds = [{ type: 'tune' }, ...archChoices(s, plan).filter(t => s.techs.includes(t)).slice(0, 1).map(tech => ({ type: 'arch', tech })), { type: 'mix', dim: Object.keys(Q_W[s.mod]).includes('code') ? 'code' : Object.keys(Q_W[s.mod])[0] }];
    for (const k of kinds) {
      if (matchFindings(s, plan).some(f => f.type === k.type) || s.jobs.list.some(j => j.kind === 'trial' && j.type === k.type)) continue;
      for (const size of ['mid', 'small']) {
        const c = jobCheck(s, { kind: 'trial', ...k, size });
        if (c.ok && c.cards.got > 0) return { label: `给下一代计划开一项试验（${{ tune: '调参', arch: '架构验证', mix: '数据配比' }[k.type]}${size === 'mid' ? '中档' : '小档'}）`, detail: `闲着的卡拿来试水：成功了下一代底座少花算力、更不容易炸炉。试验不占作业位。`, op: { type: 'job', op: 'start', spec: { kind: 'trial', ...k, size } } };
      }
    }
  }
  // 在小模型线蒸馏一个小模型，或者从零练一个同代小号：语言模型，线没满。规则同机器人（T9.1 第 5 条）：
  // 蒸馏只在还没有在线小模型（或在线小模型已满一年）、小模型线空着的时候；同代小号每一代主线一次（大厂、前沿），用闲着的卡封顶。
  const live = liveModel(s);
  const big = ['frontier', 'bigtech'].includes(s.company.tier);
  const sl = smallLive(s);
  if (s.mod === 'llm' && live && smallLineCount(s) === 0 && (!sl || !sl.releasedDay || daysBetween(sl.releasedDay, s.day) >= 365) && live.total > 14) {
    const size = big ? 7 : 14;
    const cfg = { teacher: 'self', total: size, active: size, arch: 'dense', tokens: 1.5 };
    if (jobCheck(s, { kind: 'distill', cfg }).ok) return { label: `蒸馏一个 ${size}B 小模型`, detail: '用闲着的卡让自家旗舰带一个小模型，出来就能送评，API 多一档便宜的选择。', op: { type: 'distill', cfg } };
  }
  const ref = refModelOf(s);
  if (s.mod === 'llm' && big && ref && !s.jobs.smallCredit?.[s.gen] && !s.jobs.list.some(j => j.kind === 'pretrain' && j.line === 'small') && smallLineCount(s) < JOBS.SMALL_LINE) {
    const al = allocJobs(s);
    const idle = Math.floor(al.free * al.T);
    let pick = null;
    for (const total of PARAM_TOTALS.filter(x => x >= 7 && x <= Math.min(JOBS.SMALL_MAX_TOTAL, ref.total * JOBS.SMALL_FRAC))) {
      const cfg = { total, active: total, arch: 'dense', tokens: Math.max(0.5, Math.min(15, Math.round(poolStats(s).tokens * 2))) };
      const c = jobCheck(s, { kind: 'pretrain', line: 'small', cfg, prio: 'normal', cap: idle });
      if (c.ok && c.eta <= 60) pick = { cfg, eta: c.eta };
    }
    if (pick) return { label: `从零练一个同代小号（${pick.cfg.total}B，约 ${Math.round(pick.eta)} 天）`, detail: `用闲着的卡练一个小底座：最多用 ${count(idle)} 张，不拖慢下一代主线底座。练完挂一段后训练再送评。`,
      op: { type: 'job', op: 'start', spec: { kind: 'pretrain', line: 'small', cfg: pick.cfg, prio: 'normal', cap: idle } } };
  }
  // 把推理份额调高：只在推理负载 > 0.8、调高真能多接住需求时。
  const load = loadNow(s);
  if (load > 0.8 && s.inferShare < 0.85) {
    const v = Math.min(0.85, Math.round((s.inferShare + 0.1) * 20) / 20);
    return { label: `推理份额调到 ${pct(v)}`, detail: `推理负载 ${pct(Math.min(load, 9))}，用不上的训练卡挪去服务用户。`, op: { type: 'infer', value: v } };
  }
  return null;
}

// 按优先顺序给出建议：第一条就是大按钮上的那条。
export function advise(s) {
  if (s.status !== 'playing') return [];
  if (s.queue.length) return [{ id: 'queue', kind: 'event', label: '处理眼前的事件', detail: '有事件在等你拍板，处理完时间才会继续走。', op: { type: 'queue' } }];
  const prev = MEMO;
  MEMO = { s, post: new Map() };
  try {
    const focus = goalFocus(s);
    const list = [...freeAdvice(s, focus), ...monthAdvice(s, focus)];
    // 集群快撑不住了（训练几乎必然失败）：检修排到最前面，别的都往后放（不在检修时）。
    const fix = s.health < 25 && !s.jobs?.repair ? list.findIndex(a => a.op?.type === 'job' && a.op.op === 'repair') : -1;
    if (fix > 0) list.unshift(...list.splice(fix, 1));
    return list;
  } finally {
    MEMO = prev;
  }
}

// 照建议执行（测试和机器人用；界面上立项、融资、上市会先打开后台让玩家确认）。
// 作业类建议（排队、送评、上一代收尾、闲置）执行以后记下日期，JOBS.NAG_GAP 天内不再出；闲置计时同时清零（T9.2）。
export function applyAdvice(s, a) {
  const op = a.op;
  if (a.nag && s.jobs) { (s.jobs.nag ??= {})[a.id] = s.day; if (a.id === 'jobs:idle') s.jobs.idle = { since: null }; }
  switch (op.type) {
    case 'tech': return researchTech(s, op.id);
    case 'product': return setProduct(s, op.id, { on: true });
    case 'infer': return setInferShare(s, op.value);
    case 'rent': return buyGpu(s, op.gpu, op.n, true);
    case 'buy': buyGpu(s, op.gpu, op.n); s.flags.gpuBuyAt = s.monthsPlayed; return null;
    case 'project': return startJob(s, { kind: 'pretrain', line: 'main', cfg: op.cfg }).pj;
    case 'distill': return startJob(s, { kind: 'distill', cfg: op.cfg }).pj;
    case 'fund': return startFunding(s, op.dilution);
    case 'borrow': return borrow(s, op.usd);
    case 'ipo': return startIpo(s);
    case 'strategy': return startStrategy(s, op.id);
    case 'act': return decide(s, op.action, op.arg);
    // 作业操作（T9.2 的最后一条和作业类建议）：post 是“主线后训练练这个方向”（没有就挂一项，被“专心研究”暂停的一起恢复），不动检修。
    case 'job': {
      if (op.op !== 'post') return jobOp(s, op);
      if (Array.isArray(s.jobs.focusPause)) focusResearch(s, false);
      const j = mainPostJob(s);
      if (j) { j.paused = false; return setPost(s, j.id, { dir: op.dir }); }
      return { kind: 'jobs', op: 'start', job: startJob(s, { kind: 'post', target: 'main', dir: op.dir, until: 'none' }) };
    }
    case 'trial': { decide(s, 'job', { op: 'plan', plan: op.plan }); return decide(s, 'job', { op: 'start', spec: op.spec }); }
    case 'page': return null;
    default: throw new Error('这条建议需要在界面上处理');
  }
}
