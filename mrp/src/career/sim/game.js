// 开局：createGame、开局阵容和开局持卡。也是 sim 的公共出口：engine.js 从这里转出口，界面只从 engine.js 导入。
import { VERSION, SCENARIOS, COMPANY_BY_ID, PLAYABLE, TIERS, START_RESOURCES, CN_GPU_SWAP, PRODUCTS, addMonths, fmtDate } from '../data/core.js';
import { DATASET_BY_ID } from '../data/datasets.js';
import { structureForRelease } from '../data/model_structure.js';
import { brandOf } from '../data/rivals.js';
import { SCORE_GROWTH } from '../data/goals.js';
import { clamp, round1 } from './util.js';
import { dayKey, addDays, daysInMonth, daysBetween } from './clock.js';
import { addPoolData, knowledgeCap, runBenchmark, suiteFor } from './model.js';
import { startKnow } from './research.js';
import { initMilestones } from './milestones.js';
import { seedWorldFlags } from './world.js';
import { hypeIndex } from './economy.js';
import { buildGoals } from './board.js';
import { log } from './log.js';
import { startOfMonth, releaseScheduled } from './loop.js';
import { newModel, structuredCloneSafe } from './projects.js';
import { recordRun } from './release.js';
import { initSota, orgBest, familyBest, orgReleases, qOf } from './sota.js';
import { ensureExpect } from './expect.js';
import { initRoute } from './route.js';
import { initStrategy } from './strategy.js';
import { initNaming, nextHintText } from './naming.js';
import { stampFeatures } from './migrate.js';
import { initJobs, guardOldFields } from './jobs.js';
import { P } from './provider.js';

// 自定义公司（规格 M.3.1、M.3.2）：登记走当前 Provider——史实模式抛错，自洽模式的 SimProvider
// （和测试里的最小 SimProvider）调 provider.js 的实现。createGameFor 先登记 spec，再照常开局。
export function registerCompany(spec) {
  return P().registerCompany(spec);
}
export function createGameFor(spec, scenario, seed) {
  registerCompany(spec);
  return createGame(spec.id, scenario, seed);
}

// 公共导出：原来都写在 game.js 里，拆分后从各自的文件转出来，名字不变。
export {
  benchmaxPreview, clusterGpus, directionsFor, distillTeachers, gpuAllocation, gpuCount, leaderboard, liveModel, myRank, poolStats, postPreview,
  previewDistill, previewProject, baseEtaFor, projectRisk, smallLive, smallWorking, suiteFor, trainFlops, workingModel,
} from './model.js';
export { averageRent, monthlyCosts, monthlyDepreciation, serveCostPerM, staffCostPerHead, regionOf, tickerPrice, usageBoards } from './economy.js';
export { goalNeed, resolveGoal } from './board.js';
export { fundingOffers, fundingBlock, fundBoost, ipoCheck, startFunding, startIpo, trade, borrow, repay, borrowLimit, loanOf, collateralValue } from './capital.js';
export { bestRentGpu, buyGpu, buySmuggled, gpuOrderInfo, grayHeatLevel, releaseGpu, setInferShare, smuggleOffers } from './compute.js';
export { dataOptions, datasetAvailable, distillOptions } from './data_ops.js';
export { finish } from './finish.js';
export { decide, tickDay } from './loop.js';
export { migrateGame, validateGame, SAVE_VERSION } from './migrate.js';
export { distillCheck, projectCheck, smallBaseCheck, finetuneCheck } from './projects.js';
export { currentEvent, resolveEvent, speaker } from './queue.js';
export { availableActions, releaseBlock, releaseLine } from './release.js';
export { researchTech, stopTech } from './research.js';
export { FILING_SAFETY, setPolicy, setProduct, setRouting, setLease, setTier, setSmallApi } from './service.js';
// v1.0 的接缝（P0.3a）：界面以后要用的统一接口，先从这里转出去；实现由各包补上，名字不变。
export { applyEffects, describeEffects } from './effects.js';
export { cond, condWhy } from './cond.js';
export { modifier } from './modifiers.js';
export { sotaAt, sotaMade, sotaWouldTake, worldSota, gapOf } from './sota.js';
export { expectPreview } from './expect.js';
export { releaseOpenRule } from './route.js';
export { strategyOptions, nodeStatus, startStrategy, cancelStrategy, routeChangeBlocked } from './strategy.js';
export { FEATURES } from './migrate.js';
// 训练作业（P2.4a，规格 T11.2）：分卡、作业位、最快天数、立项检查和作业操作、“重活”口径。
export {
  allocJobs, allocCtx, jobSlots, slotsByTeam, slotsByCards, slotsUsed, minCards, wantCards, fastestDays, startJob, jobCheck, cancelJob, pauseJob, setJobPrio, setJobCap,
  setPost, setRush, setRepair, setAutoRepair, setOwnOnly, setPlan, focusResearch, postTick, baseTick, heavyWork, jobLabel, jobEta, smallModels, smallLineCount, hasBaseJob,
  isBaseJob, baseJob, mainPostJob, postJobFor, postTarget, prevModel, idleDays, bestDir, } from './jobs.js';
export { trialCheck, trialPreview, refNeed, pRef, refModel, archChoices, matchFindings } from './lab.js';
export { submitEval, cancelEval, evalTick, evalDaysFor, riskSafety, filingSafety, defaultTier, submitBlock, evalLine, TIER_LABEL, _finishEvalNow } from './evals.js';
export { releaseNow } from './release.js';
// 命名（P2.1，规格 C1、C2）：显示名、起名校验、建议名、授名条件、发布时的名字（发布面板预告和 doRelease 共用）。
export { displayName, draftLabel, modelLabel, normName, validateModelName, suggestName, nameGrantCheck, releaseNamePlan, grantsFor, draftNameError } from './naming.js';

// 2026 年 1 月正在港交所走上市流程的公司（真实：智谱 1 月 8 日、MiniMax 1 月 9 日挂牌）。
const IPO_AT_START = { y2026: { glm: '2513.HK', minimax: '0100.HK' } };

// 开局持卡。2026 剧本的中国公司直接按实际持卡开局（gpuCN）；之前的剧本把海外型号换成特供卡再打七折。
export function startGpus(company, scenarioId) {
  const res = START_RESOURCES[company.tier][scenarioId];
  const start = SCENARIOS.find(x => x.id === scenarioId).start;
  const cnStock = company.country === 'CN' && res.gpuCN;
  const owned = {};
  for (const [g, n] of Object.entries(cnStock || res.gpu)) {
    let id = g;
    if (company.country === 'CN' && !cnStock) id = P().gate('cnGpuSwap', { date: start }) && g === 'H100' ? 'H800' : (CN_GPU_SWAP[g] || g);
    owned[id] = (owned[id] || 0) + n;
  }
  // 中国公司算力更紧：开局卡量打七折，2025 年起一部分换成 H20。
  if (company.country === 'CN' && !cnStock) for (const k of Object.keys(owned)) owned[k] = Math.round(owned[k] * 0.7);
  if (company.country === 'CN' && scenarioId === 'y2025') owned.H20 = Math.round((owned.H800 || 0) * 0.6);
  return owned;
}
// 某月往后数 n 个月的那个月的最后一天（n = 0 是本月月底）。
const monthEnd = (ym, n) => { const m = addMonths(ym, n); return dayKey(m, daysInMonth(m)); };
// 开局阵容（规格 D2，按日、按 org）：在线 = 开局当天这家公司本模态的 orgBest（综合最强的一款，不看参数、先后、开闭源、S 标签）；
// 在训 = 开局后窗口内（到开局后第 4 个月月底；2026 剧本没有在线模型时取 6 个月）第一款比在线旗舰强的本 org 发布，
// 没有在线模型时取窗口内第一款；窗口内没有更强的，就不设在训旗舰。
function startLineup(company, scenarioId) {
  const start = SCENARIOS.find(x => x.id === scenarioId).start;
  const st = dayKey(start, 1);
  const precise = scenarioId === 'y2026';
  const rel = orgBest(null, company.org, company.modality, st);
  const end = monthEnd(start, (precise && !rel ? 6 : 4) - 1);
  const win = orgReleases(company.org, company.modality).filter(r => r.day > st && r.day <= end);
  const q = rel ? qOf(company.modality, rel.dims) : -Infinity;
  const next = (rel ? win.find(r => qOf(company.modality, r.dims) > q) : win[0]) ?? null;
  return { rel, next, precise, st };
}
// 选人界面用：开局的在线模型和在练的下一代（C6：不剧透下一代的真实型号名，对应名表里的历史名时写候选名和要完成的策略）。
// → { name, date, training, text, detail } | null。name、date 是在线模型的（没有为 null）；training：有在练的下一代；
// text 给选人卡片，detail 给右边的详情。
export function startModel(charId, scenarioId) {
  const { rel, next } = startLineup(COMPANY_BY_ID[charId], scenarioId);
  if (!rel && !next) return null;
  const nx = next ? nextHintText(charId, next.name) : '';
  const text = [rel ? `在线：${rel.name}` : '还没有在线模型', nx].filter(Boolean).join(' · ');
  const detail = [rel ? `${rel.name}（${fmtDate(rel.date)}）` : '', next ? `${rel ? '' : '还没有在线模型；'}${nx.replace('下一代在练', '下一代底座已练好，正在后训练')}` : ''].filter(Boolean).join('；');
  return { name: rel?.name ?? null, date: rel?.date ?? null, training: !!next, text, detail };
}

export function createGame(charId, scenarioId, seed = Date.now()) {
  const company = COMPANY_BY_ID[charId];
  const persona = PLAYABLE.find(p => p.id === charId);
  const scenario = SCENARIOS.find(x => x.id === scenarioId);
  if (!company || !scenario) throw new Error('角色或剧本不存在');
  const tier = company.tier;
  const res = START_RESOURCES[tier][scenarioId];
  const precise = scenarioId === 'y2026';
  const kind = company.kind || TIERS[tier].kind;
  const s = {
    v: VERSION, seed: seed >>> 0, rng: seed >>> 0, charId, scenario: scenarioId, start: scenario.start, date: scenario.start,
    company: { ...company, kind }, persona: { id: persona.id, name: persona.name, label: persona.label, artId: persona.artId, smallArtId: persona.smallArtId }, mod: company.modality,
    status: 'playing', result: null,
    cash: res.cash, valuation: res.valuation, valuationStart: res.valuation, valuationFloor: res.valuation * 0.25, equity: 1,
    capital: { listed: null, ipo: null, round: null, rounds: [] },
    team: res.team, morale: 0, health: 90, know: startKnow(company.tier, scenario.start), research: [], researchDone: {}, techRead: {}, techBoost: {}, firsts: {}, papers: {}, ms: {}, brand: Math.max(...company.families.map(f => brandOf(f, scenario.start))), rep: 62, hype: 1, distillDep: 0,
    gpus: { owned: {}, rented: {} }, inferShare: 0.3,
    techs: [], data: { pool: { tokens: 0, qw: 0, mix: {} }, post: {}, distill: {}, acquired: [], risky: {} },
    models: [], live: null, working: null, smallLive: null, smallWorking: null, gen: 1, published: {},
    products: {}, service: { routing: 'full', routingUnlocked: false, proxy: 0, proxyPolicy: 'none', proxyUnlocked: false, contentPolicy: 'standard', tavern: 0, tavernOn: false,
      antiDistill: 'standard', integrations: { mode: 'none', tools: [], asked: [] }, filing: 'none', evidence: 0, hist429: [], lastR429: 0, last: null },
    legal: { cases: [], history: [] }, risk: {},
    market: { holdings: {}, cost: {} },
    // seen：经营事件 → 处理过几次；marks：一次性的标记（viral_*、ban_*、super:*）；due、cool：计时器和冷却的到期日（tickDay 结算）。
    goals: [], queue: [], news: [], log: [], history: [], flags: {}, due: {}, cool: {},
    trainStreak: 0, monthsPlayed: 0, seen: {}, marks: {},
    // 按天推进：今天、团队正在做的事、在途订单、待上线的版本、排在某天的事件和新闻、本季度 / 本月已用的配额、本月的工作天数。
    day: dayKey(scenario.start, 1), orders: [], deploy: [], scheduled: [], quota: {}, mstat: { train: 0, research: 0 },
    // 训练作业（规格 T 章，P2.4a）：作业表、送评中的候选、上一代收尾、待发布的小模型（smallWorking 之外的）。开局没有作业（团队在做研究）。
    jobs: initJobs(), evals: [], prevWorking: null, smallShelf: [],
  };
  // s.project、s.focus 已删除：装上读旧字段报错的取值器（T11.2）。
  guardOldFields(s);
  s.gpus.owned = startGpus(company, scenarioId);
  for (const id of P().startTechs(s)) s.techs.push(id);
  const startData = { llm: ['ds_cc', 'ds_wiki'], image: ['im_laion'], music: ['mu_stock'], speech: ['sp_libri', 'sp_commonvoice'] }[s.mod];
  if (s.mod === 'llm' && company.country === 'CN') startData.push('ds_cn_web');
  if (scenarioId !== 'y2023' && s.mod === 'llm') startData.push('ds_stack', 'ds_math_web');
  if ((scenarioId === 'y2025' || scenarioId === 'y2026') && s.mod === 'llm') startData.push('ds_fineweb', 'ds_fineweb_edu');
  for (const id of startData) { const ds = DATASET_BY_ID[id]; if (ds && ds.from <= scenario.start) { addPoolData(s, ds); s.data.acquired.push(id); } }
  if (s.mod === 'llm' && scenarioId !== 'y2023') s.data.post = { chat: 1, knowledge: 1, code: 1, math: 1, safety: 1 };
  // 2026 年各家都攒了一年的 Agent 轨迹和编程环境。
  if (s.mod === 'llm' && precise) s.data.post.agent = 1;
  for (const p of PRODUCTS[s.mod]) s.products[p.id] = { on: false, tier: 'standard', gpus: 0 };
  if (s.products.api) s.products.api.smallTier = 'budget';
  // 开局模型：旗舰继承这家公司开局当天的真实旗舰（org 口径，D2）；第二个家族（如 DeepSeek Flash）作为小模型。
  // 继承来的已发布型号记 m.hist（开局前的真实发布，标签只算“开局前炼出过”）、发布日 releasedDay 和发布角色 line。
  const smallFam = company.families[1];
  const { rel, next, st } = startLineup(company, scenarioId);
  if (rel) {
    const m = newModel(s, structureForRelease(s.mod, rel), { name: rel.name, open: rel.open, stage: 'released', role: 'flagship' });
    m.dims = { ...rel.dims };
    m.base = Object.fromEntries(Object.entries(rel.dims).map(([k, v]) => [k, v - (k === 'safety' ? 30 : 6)]));
    m.kcap = s.mod === 'llm' ? Math.max(rel.dims.knowledge + 4, knowledgeCap(m.total, 1.2)) : null;
    m.released = rel.date;
    // 开局继承的已发布版本是真实历史版本，评测档记 legacy（T6.3：不罚）。
    Object.assign(m, { releasedDay: rel.day, hist: true, line: 'main', evalTier: 'legacy' });
    s.models.push(m);
    s.live = m.id;
    // 没有在练的下一代时，复制一份在线旗舰接着后训练（C6：有下一代时不复制，免得留下没人用的孤儿副本）。
    // 这一份还没发布：没有名字（C1），不带开闭（B7 第 5 条：发布时按路线定，见 projects.js 的 newModel）。
    if (!next) {
      const work = { ...structuredCloneSafe(m), id: `${m.id}w`, stage: 'post', released: null, postMonths: 0, name: null };
      for (const k of ['releasedDay', 'hist', 'line', 'open', 'evalTier']) delete work[k];
      s.models.push(work);
      s.working = work.id;
    }
    for (const b of suiteFor(s)) recordRun(s, runBenchmark(s, b.id, m), m);
    // 已经在卖的产品照常上线；有能力门槛的（Coding Plan）要模型达标。
    const meets = p => !p.need || Object.entries(p.need).every(([k, v]) => (m.dims[k] || 0) >= v);
    for (const p of PRODUCTS[s.mod]) if (p.id !== 'gpu_lease' && p.from <= s.date && meets(p)) s.products[p.id] = { ...s.products[p.id], on: true, tier: rel.price || 'standard' };
    if (company.country === 'CN' && P().gate('cnFiling', { date: scenario.start })) s.service.filing = 'done';
    s.inferShare = 0.5;
    s.gen = 2;
  }
  if (smallFam && rel) {
    const sr = familyBest(null, smallFam, st);
    if (sr && sr !== rel) {
      const m = newModel(s, structureForRelease(s.mod, sr), { name: sr.name, open: sr.open, stage: 'released', role: 'small' });
      m.dims = { ...sr.dims };
      m.base = { ...sr.dims };
      m.released = sr.date;
      Object.assign(m, { releasedDay: sr.day, hist: true, line: 'side', evalTier: 'legacy' });
      s.models.push(m);
      s.smallLive = m.id;
      for (const b of suiteFor(s)) recordRun(s, runBenchmark(s, b.id, m), m);
    }
    // 2026 剧本：几个月内要发布的下一代小模型（如 V4-Flash）也已经蒸馏好，等着发布。
    const sn = precise && orgReleases(company.org, s.mod).find(r => r.family === smallFam && r !== next && r.day > st && r.day <= monthEnd(scenario.start, 4));
    // 它也还没发布：没有名字，只带“现实里这一代叫 X”的提示（C5 删掉了写死的“Flash/Mini 2”，C6）。
    if (sn) {
      const m = newModel(s, structureForRelease(s.mod, sn), { stage: 'post', role: 'small' });
      m.hint = { realName: sn.name };
      m.dims = Object.fromEntries(Object.entries(sn.dims).map(([k, v]) => [k, round1(clamp(v - (k === 'safety' ? 6 : 3), 0, 99))]));
      m.base = { ...m.dims };
      m.kcap = s.mod === 'llm' ? sn.dims.knowledge + 2 : null;
      m.postMonths = 1;
      s.models.push(m);
      s.smallWorking = m.id;
    }
  }
  // 现实中几个月内就要发布的下一代，开局时底座早已训练好，正在做后训练。
  // 2026 剧本里手上没有在线模型的（如 Fable），半年内发布的下一代也算；离发布越远，现在的版本越弱。
  // 规格 C6：没有名字（name = null），只带 m.hint = { realName, hn }（“现实里这一代叫 X”，hn 由 initNaming 补）；名字到发布时再起。
  // 能力按距现实发布的远近算：史实 − clamp(0.5 + 1.5 × 距现实发布的月数, 0.5, 4)，安全维再 −6；base 不变。
  // GPT y2023 的在练模型因此从 57.8 降到 56.8，D9 第 6.7 条“120 天内练到 58.8”在现在的节奏下做不到，先改成 todo（P4.2 抬节奏后恢复）。
  if (next) {
    const m = newModel(s, structureForRelease(s.mod, next), { stage: 'post', role: 'flagship' });
    m.gen = s.gen;
    // 月数按天折算（365.25 / 12 天一个月）：GPT-4 在开局后 72 天发布，约 2.4 个月，减 4。
    const months = Math.max(0, daysBetween(s.day, next.day ?? `${next.date}-15`)) / (365.25 / 12);
    const lag = clamp(0.5 + 1.5 * months, 0.5, 4);
    // 史实值离开局越远减得越多，截在 0–99（2023 年的模型 Agent 是 0，不能减成负数）。
    m.dims = Object.fromEntries(Object.entries(next.dims).map(([k, v]) => [k, round1(clamp(v - lag - (k === 'safety' ? 6 : 0), 0, 99))]));
    m.base = Object.fromEntries(Object.entries(next.dims).map(([k, v]) => [k, v - (k === 'safety' ? 30 : 6)]));
    m.kcap = s.mod === 'llm' ? next.dims.knowledge + 4 : null;
    m.hint = { realName: next.name };
    s.models.push(m);
    s.working = m.id;
    s.gen += 1;
  }
  s.goals = buildGoals(s, !!rel || !!next);
  s.hype = hypeIndex(s);
  const ipoTicker = IPO_AT_START[scenarioId]?.[charId];
  if (ipoTicker) { s.capital.ipo = { ticker: ipoTicker }; s.due.ipo = addDays(s.day, 30); log(s, '港交所上市流程进入最后一个月'); }
  // v1.0 的开局钩子（规格 D10.3，顺序固定）：开局阵容和继承型号都定好以后，SOTA 标签 → 市场期待 → 开源路线 → 公司策略 → 命名。
  // 里程碑账本排在公司策略之前：策略播种（A4.7）要读开局前已经发生的“行业第一次”。
  // initSota（P1.1）按 D10.4 播种，再把开局前看得到的对手发布和继承的型号回放一遍；其余各包落地前是存根，不往 s 里写东西。
  // stampFeatures 在结构版本到 4 以后把读档特性步骤记成已执行（新存档不用迁移）。
  initSota(s);
  ensureExpect(s);
  initRoute(s);
  initMilestones(s);
  // 开局前已经发生的世界事件留下的标记（规格 E5，例如 2024-05 的价格战）：要读里程碑账本，排在 initMilestones 之后。
  seedWorldFlags(s);
  initStrategy(s);
  initNaming(s);
  stampFeatures(s);
  startOfMonth(s, true);
  releaseScheduled(s);
  if (ipoTicker) s.queue.unshift({ kind: 'notice', title: '月底挂牌', text: `招股已经结束，${s.company.company} 这个月底在港交所挂牌，代码 ${ipoTicker}。上市后的股价会跟着你们的发布、榜单、收入和诉讼走。` });
  const growth = SCORE_GROWTH[scenarioId];
  if (growth) s.queue.unshift({ kind: 'notice', title: '这一年怎么考核', text: `只有 10 个月。公司底子已经有了，董事会按增长打分：月收入大约要做到开局的 ${growth.revenue} 倍、估值涨到 ${growth.valuation} 倍才算及格。这一年上市的 AI 公司很多，挂牌本身不再加分。榜单和里程碑照常检查。` });
  // 第一条提示：时间怎么走。
  s.queue.unshift({ kind: 'notice', title: '时间怎么走', text: '现在时间是暂停的。点上面的 ▶（或按空格）让日子一天天往前走，数字 1–5 换速度；弹出事件时会自动停下等你拍板。给团队派的任务会一直做下去，直到你换掉；买卡、买数据要等到货，发布要灰度几天才全量。拿不准的时候，看右边那个大按钮的“下一步”。' });
  return s;
}
