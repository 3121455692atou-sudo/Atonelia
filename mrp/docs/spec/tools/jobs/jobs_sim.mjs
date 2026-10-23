// 规格 T 章（训练作业）的数值模拟，第 2 版（按两位评审的意见修订）。只读导入项目模块取开局状态和现成公式，不改任何项目文件。
// 运行：node docs/spec/tools/jobs/jobs_sim.mjs [--seeds 20] [--only gpt:y2025]
// 输出：表 T0 分卡等价自检；T1 开局分卡与底座工期；T2 一年时间线摘要（多种子）；T3 试验收益分布；T4 训练与推理的取舍；
//       T5 按真实卡数复现；T6 防刷自检；T7 作业位分布（96 个开局）。
// 简化（和真机器人的差别都写在规格附录 T 里）：卡数一年不变；后训练按 RL 算；涨分和研究进度不模拟；送评按固定节奏（取现引擎机器人实测的旗舰发布间隔）。
import { pathToFileURL } from 'node:url';
import { JOBS, REPAIR, LAB, EVAL } from './consts.mjs';
const R = '/Users/mac/model-raising-plan/src/career/';
const imp = p => import(pathToFileURL(R + p).href);
const G = await imp('sim/game.js');
const M = await imp('sim/model.js');
const P = await imp('sim/projects.js');
const RS = await imp('sim/research.js');
const EC = await imp('sim/economy.js');
const SO = await imp('sim/sota.js');
const core = await imp('data/core.js');
const { EFFORT, DISTILL_MIN_DAYS } = await imp('data/balance.js');
const { hash01, clamp, round1 } = await imp('sim/util.js');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SEEDS = Number(arg('--seeds', 20));
const ONLY = arg('--only', null);

// ---------- 公式（和规格 T2–T5 一一对应） ----------
const memMin = (total, bytes) => Math.ceil(bytes * total / JOBS.MEM.card);
export const fastestDays = (mod, total) => (mod === 'llm' ? clamp(JOBS.FAST.base + JOBS.FAST.perDecade * Math.log10(Math.max(total, 7) / 7), JOBS.FAST.base, JOBS.FAST.max) : JOBS.FAST.nonLlm);
// T3 作业位：按人、按自用卡取大的那个
export const slotsByTeam = team => clamp(JOBS.SLOTS.base + Math.floor(Math.log2(Math.max(1, team) / JOBS.SLOTS.team)), JOBS.SLOTS.min, JOBS.SLOTS.max);
export const slotsByCards = cards => clamp(JOBS.SLOTS.base + Math.floor(Math.log2(Math.max(1, cards) / JOBS.SLOTS.cards)), JOBS.SLOTS.min, JOBS.SLOTS.max);
export const slotsOf = (team, cards) => Math.min(JOBS.SLOTS.max, Math.max(slotsByTeam(team), slotsByCards(cards)));
const postNeed = (mod, active, rl) => 6 * (active || 3) * 1e9 * (rl ? 4e11 : 6e10) * (mod === 'llm' ? 1 : 0.02);
const W = JOBS.WEIGHT;

// T4.2 分卡：以最低卡为下限、想要卡为上限的加权水位分配，在“份额”上算（训练卡 = 1），闭式解，不用二分。
// items 已按 优先→正常、同级按开工先后 排好；每项 { w, min, upper }（都是份额）。cap 是可分的份额（检修时 0.75）。
export function waterFill(items, cap = 1) {
  let left = cap;
  for (const it of items) {
    if (left + 1e-12 >= it.min) { it.run = true; left -= it.min; } else { it.run = false; it.share = 0; }
  }
  const run = items.filter(i => i.run);
  if (!run.length) return { free: cap };
  const up = i => Math.max(i.min, i.upper);
  const target = Math.min(cap, run.reduce((a, i) => a + up(i), 0));
  const f = l => run.reduce((a, i) => a + Math.min(Math.max(l * i.w, i.min), up(i)), 0);
  const bps = [...new Set(run.flatMap(i => [i.min / i.w, up(i) / i.w]).filter(Number.isFinite))].sort((a, b) => a - b);
  let lo = 0;
  for (const b of bps) { if (f(b) >= target) break; lo = b; }
  const free = run.filter(i => i.min / i.w <= lo && up(i) / i.w > lo);
  let fixedSum = 0;
  for (const i of run) if (!free.includes(i)) fixedSum += i.min / i.w > lo ? i.min : up(i);
  const l = (target - fixedSum) / free.reduce((a, i) => a + i.w, 0);
  for (const i of run) i.share = free.includes(i) ? l * i.w : (i.min / i.w > lo ? i.min : up(i));
  return { free: cap - run.reduce((a, i) => a + i.share, 0) };
}

function mkRand(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const lerpYear = (tab, y) => { const i = clamp(Math.floor(y), 2023, 2026); return tab[i] + (tab[i + 1] - tab[i]) * clamp(y - i, 0, 1); };

// 送评节奏（输入，不是结果）：取现引擎机器人整局旗舰发布间隔的中位（critic/bot_now_full.mjs，6 个种子）。首发是底座练满 30 天（bot：没有在线模型且 postMonths ≥ 1）。
const SUBMIT_GAP = { 'rwkv:y2023': 112, 'perplexity:y2025': 112, 'qwen:y2024': 56, 'deepseek:y2025': 35, 'gpt:y2025': 56, 'gpt:y2026': 49 };

// ---------- 一局的模拟状态 ----------
function makeSim(id, sc, seed, opts = {}) {
  const s = G.createGame(id, sc, 1);
  s.project = null;
  if (opts.inferShare) s.inferShare = opts.inferShare;
  const al = M.gpuAllocation(s);
  const T = al.trainGpus;
  const tfBase = M.trainFlops(s) / (0.7 + 0.3 * s.health / 100);
  const w = M.workingModel(s), l = M.liveModel(s);
  const y0 = Number(s.day.slice(0, 4)) + (Number(s.day.slice(5, 7)) - 1) / 12;
  const mdl = m => (m ? { total: m.total, active: m.active ?? m.total, arch: m.arch, tokens: m.pretraining?.tokens ?? null, postDays: 0, relDays: 0 } : null);
  return {
    s, id, sc, key: `${id}:${sc}`, seed, tier: s.company.tier, mod: s.mod, T, total: al.total, selfCards: al.selfGpus, tfBase, health: s.health, y0,
    day: 0, seq: 0, jobs: [], findings: [], evals: [], log: [], rng: mkRand(seed * 7919 + id.length * 104729),
    slots: slotsOf(s.team, al.selfGpus), team: s.team,
    working: mdl(w), liveRef: mdl(l), live: !!l,
    smallLive: null, prev: null, shelf: 0, repair: false, gen: 0, trialKnowGen: {}, techCut: {},
    baseStarted: 0, lastBaseDone: null, relSinceBase: 0, waitTrial: 0, idleRun: 0, familyGen: -1,
    st: { days: 0, running: [], runningJobs: [], queued: [], freeShare: [], fNew: [], fOld: [], heavy: 0, repairDays: 0, spikes: 0, blow: { minor: 0, severe: 0 },
          healthMin: 100, healthSum: 0, evals: 0, evalDays: 0, releases: 0, smallReleases: 0, trials: [], bases: [], saves: [], smallBases: [], postDaysMain: 0,
          trialCardDays: 0, trainCardDays: 0, baseCardDays: 0, smallJobsMax: 0, cutDays: 0 },
  };
}
const tf = sim => sim.tfBase * (0.7 + 0.3 * sim.health / 100);          // 当天 trainFlops（只随健康变）
const kp = sim => 1 + RS.knowFx(sim.s).pretrain;
const isBase = j => j.kind === 'pretrain' || j.kind === 'distill' || j.kind === 'finetune';
const slotJobs = sim => sim.jobs.filter(j => j.kind !== 'trial').length;  // 试验不占作业位（T3）

function minCards(sim, j) {
  if (j.kind === 'pretrain') return sim.mod === 'llm' ? memMin(j.structure.total, JOBS.MEM.pretrain) : JOBS.NONLLM_MIN;
  if (j.kind === 'distill') return memMin(j.studentTotal, JOBS.MEM.pretrain) + M.genMinCards(sim.s, j.teacherTotal);
  if (j.kind === 'post') return sim.mod === 'llm' ? memMin(j.model.total, JOBS.MEM.post) : 1;
  return Math.max(LAB.MIN_CARDS, Math.ceil(LAB.MIN_FRAC * wantCards(sim, j)));
}
function wantCards(sim, j) {
  const perCard = tf(sim) / sim.T;
  if (j.kind === 'pretrain') return j.need / (j.fast / 30) / (perCard * kp(sim) * (j.rush ? JOBS.RUSH : 1));
  if (j.kind === 'distill') return j.need / (DISTILL_MIN_DAYS / 30) / (perCard * kp(sim));
  if (j.kind === 'post') return JOBS.POST_SAT * postNeed(sim.mod, j.model.active, j.rl) / perCard;
  return j.cost / (j.minDays / 30) / perCard;
}
function plan(sim, jobs = sim.jobs) {
  const cap = sim.repair ? 1 - REPAIR.share : 1;
  const items = jobs.filter(j => !j.paused && !(sim.repair && j.kind === 'post'))
    .map(j => ({ j, w: W[j.prio], min: minCards(sim, j) / sim.T, upper: Math.min(wantCards(sim, j), j.cap ?? Infinity) / sim.T }))
    .sort((a, b) => b.w - a.w || a.j.seq - b.j.seq);
  const { free } = waterFill(items, cap);
  for (const it of items) it.got = it.share * sim.T;
  return { items, free: free + (1 - cap) };
}

// ---------- 参照底座（T5.1、T2.3）：主线在练模型；没有就用在线旗舰 ----------
const refModel = sim => sim.working || sim.liveRef;
function refNeed(sim) {
  const r = refModel(sim);
  if (!r) return LAB.REF_MIN_LLM;
  const tokens = r.tokens ?? Math.max(0.1, Math.round(20 * r.active / 100) / 10);   // 开局继承的模型没有训练记录：按每参数 20 token 估
  return Math.max(LAB.REF_MIN_LLM, M.previewProject(sim.s, { total: r.total, active: r.active, arch: r.arch === 'moe' ? 'moe' : 'dense', tokens }).need);
}
const pRef = (sim, cost, size) => Math.min(1, cost / (LAB.SHARE[size] * refNeed(sim)));

// ---------- 机器人挑主线底座（T9：沿用 planProject 的打分，工期按“加进作业表以后实际分到的卡”估） ----------
function chooseBase(sim, maxDays = 150) {
  const s = sim.s;
  const pool = M.poolStats(s).tokens;
  const archs = ['dense', ...(s.techs.includes('moe') ? ['moe'] : []), ...(s.charId === 'rwkv' ? ['rnn'] : [])];
  let best = null, bq = -Infinity;
  const postMin = sim.jobs.filter(j => j.kind === 'post').reduce((a, j) => a + minCards(sim, j), 0);
  for (const arch of archs) for (const total of core.PARAM_TOTALS) for (const active of (arch === 'moe' ? core.PARAM_ACTIVES.filter(a => a <= total / 3) : [total])) for (const mult of [20, 80, 200]) {
    const cfg = { total, active, arch, tokens: Math.max(0.5, Math.min(pool * 2, Math.round(active * mult / 100) / 10)) };
    if (!P.projectCheck(s, cfg).ok) continue;
    const mn = memMin(total, JOBS.MEM.pretrain);
    if (mn > 0.9 * sim.T || mn + postMin > sim.T) continue;            // 最低卡不超过训练卡的 90%，并且和后训练的最低卡一起放得下
    const pv = M.previewProject(s, cfg);
    const job = { kind: 'pretrain', structure: pv.structure, need: pv.need, fast: fastestDays(sim.mod, total), prio: 'high', seq: 1e9 };
    const it = plan(sim, [...sim.jobs.filter(j => j.kind !== 'trial' && j.line !== 'small'), job]).items.find(x => x.j === job);
    if (!it || !(it.got > 0)) continue;
    const days = Math.max(job.fast, pv.need / (it.got * tf(sim) / sim.T * kp(sim)) * 30);
    if (days > maxDays) continue;
    const q = Object.values(pv.base).reduce((a, b) => a + b, 0) - (pv.risk || 0) * 30;
    if (q > bq) { bq = q; best = { cfg, pv, days, got: it.got, min: mn, want: wantCards(sim, job), fast: job.fast }; }
  }
  return best;
}

// ---------- 试验（T5） ----------
function trialOdds(sim, type, size, tech) {
  let o = LAB.ODDS[type][size] + Math.min(LAB.ODDS_KNOW_MAX, (sim.s.know || 0) / LAB.ODDS_KNOW);
  if (type === 'arch' && tech) o += LAB.PUB[RS.techStatus(sim.s, core.TECH_BY_ID[tech]).level] ?? 0;
  return clamp(o, ...LAB.ODDS_RANGE);
}
function trialOutcome(seed, jobId, odds) {
  return { ok: hash01(`${seed}|${jobId}|ok`) < odds, g: LAB.GAIN_MIN + (1 - LAB.GAIN_MIN) * hash01(`${seed}|${jobId}|gain`) };
}
const findingScore = f => f.save + (1 - f.risk) + f.dimBonus;
// 架构验证能选的技术（T5.2）：配得上计划架构；已掌握的，或正在研究槽里的
const archFits = (tech, planArch) => { const a = LAB.ARCH_TECHS.llm[tech]; return a === '*' || a === planArch; };
function finishTrial(sim, j) {
  const odds = trialOdds(sim, j.type, j.size, j.tech);
  const { ok, g } = trialOutcome(sim.seed, `t${j.seq}_${sim.id}`, odds);
  const gain = LAB.GAIN[j.type][j.size];
  const p = pRef(sim, j.cost, j.size);
  let cut = 0;
  if (ok) {
    const f = { type: j.type, size: j.size, tech: j.tech, dim: j.dim, target: j.target, cost: j.cost,
      save: (gain.save || 0) * g, risk: gain.risk ? 1 - (1 - gain.risk) * g : 1, dimBonus: (gain.dim || 0) * g, day: sim.day };
    const same = sim.findings.findIndex(x => x.type === f.type && x.tech === f.tech && x.dim === f.dim);
    if (same < 0) sim.findings.push(f); else if (findingScore(f) > findingScore(sim.findings[same])) sim.findings[same] = f;
  }
  if (j.type === 'arch') {                          // 每项技术只验一次研究缩短：失败也记上（T5.6）
    if (ok && j.inResearch && !sim.techCut[j.tech]) cut = gain.cut * g * p;
    sim.techCut[j.tech] = true;
  }
  const k = (ok ? 1 : LAB.KNOW.fail) * LAB.KNOW[j.size] * p;
  const used = sim.trialKnowGen[sim.gen] || 0;
  const add = Math.max(0, Math.min(k, LAB.KNOW.perGen - used));
  sim.trialKnowGen[sim.gen] = used + add;
  sim.s.know += add;
  sim.st.trials.push({ type: j.type, size: j.size, ok, odds, days: j.elapsed, cardDays: j.cardDays, cut, p });
  sim.log.push(`第${sim.day}天 试验${{ tune: '调参', arch: '架构验证', mix: '数据配比' }[j.type]}${j.size === 'mid' ? '中档' : '小档'}${j.tech ? `(${j.tech})` : ''}${ok ? '成功' : '失败'}（${j.elapsed}天）`);
}
// 立项时用掉匹配的结论（T5.5）：系数 p = min(1, 结论成本 ÷ (档位比例 × 新底座打折前的需求))；省算力合计 ≤ 13%，炸炉倍率 ≥ ×0.5。
// 架构验证还要立项时已经掌握这项技术，没掌握的留着。
function consumeFindings(sim, cfg, need0) {
  let keep = 1, risk = 1, dims = 0;
  const left = [];
  for (const f of sim.findings) {
    const match = f.target.arch === cfg.arch && cfg.total >= f.target.total / LAB.MATCH && cfg.total <= f.target.total * LAB.MATCH && sim.day - f.day <= LAB.EXPIRE;
    if (!match || (f.type === 'arch' && !sim.s.techs.includes(f.tech))) { left.push(f); continue; }
    const p = Math.min(1, f.cost / (LAB.SHARE[f.size] * need0));
    keep *= 1 - f.save * p; risk *= 1 - (1 - f.risk) * p; dims += f.dimBonus * p;
  }
  sim.findings = left;
  return { save: Math.min(LAB.SAVE_CAP, 1 - keep), risk: Math.max(LAB.RISK_FLOOR, risk), dims };
}

// ---------- 每天 ----------
function step(sim) {
  const s = sim.s;
  // 自动检修（T4.5）：每天检查，< 40 打开，到 75 关
  if (sim.repair && sim.health >= REPAIR.until) sim.repair = false;
  if (!sim.repair && sim.health < REPAIR.start) sim.repair = true;
  s.health = sim.health;
  const { items, free } = plan(sim);
  const perCard = tf(sim) / sim.T;
  let baseShare = 0, postRan = false, rush = false, labRan = false, postWear = 0;
  for (const it of items) {
    const j = it.j;
    j.got = it.got;
    if (!it.run) { j.queuedDays = (j.queuedDays || 0) + 1; continue; }
    if (isBase(j)) {
      baseShare += it.share; if (j.rush) rush = true;
      let rate = it.got * perCard * kp(sim) * (j.rush ? JOBS.RUSH : 1) / 30;
      if (j.kind === 'pretrain') rate = Math.min(rate, j.need / j.fast);
      if (sim.rng() < M.projectRisk(s, j.structure) * (j.labRisk ?? 1) / 30) {
        const severe = sim.rng() < 0.4;
        if (severe) { j.done = Math.max(0, j.done - Math.min(JOBS.ROLLBACK_DAYS * rate, JOBS.ROLLBACK_MAX * j.done)); rate = 0; sim.st.blow.severe++; }
        else { rate *= 0.55; sim.st.blow.minor++; }
        sim.health = clamp(sim.health - (severe ? 15 : 8), 0, 100);
      }
      j.done = Math.min(j.need, j.done + rate);
      j.elapsed = (j.elapsed || 0) + 1; j.gotSum = (j.gotSum || 0) + it.got;
      sim.st.baseCardDays += it.got;
    } else if (j.kind === 'post') {
      postRan = true; postWear = Math.max(postWear, j.rl ? JOBS.WEAR.rl : JOBS.WEAR.sft);
      j.model.postDays++; j.days = (j.days || 0) + 1;
      if (j.model === sim.working) sim.st.postDaysMain++;
    } else if (j.kind === 'trial') {
      labRan = true;
      j.done += it.got * perCard / 30; j.elapsed = (j.elapsed || 0) + 1; j.cardDays = (j.cardDays || 0) + it.got;
      sim.st.trialCardDays += it.got;
    }
  }
  sim.st.trainCardDays += sim.T;
  // 冲顶力 fComp（T4.6）：√(trainFlops × max(1 − 底座类份额, 0.25) ÷ 参照)；旧规则是有项目就 ×0.25
  const y = sim.y0 + sim.day / 365;
  const ref = lerpYear(EFFORT.TRAIN_REF.llm, y) * 1e21;
  sim.st.fNew.push(clamp(Math.sqrt(tf(sim) * Math.max(1 - baseShare, 0.25) / ref), ...EFFORT.COMP));
  sim.st.fOld.push(clamp(Math.sqrt(tf(sim) * (sim.jobs.some(j => j.kind === 'pretrain') ? 0.25 : 1) / ref), ...EFFORT.COMP));
  // 集群健康（T4.5）：底座类、后训练类各取最重一项；检修每天 +1.6（后训练全停）
  const wear = (baseShare > 0 || labRan ? JOBS.WEAR.base : 0) + (rush ? JOBS.WEAR.rush : 0) + postWear;
  sim.health = clamp(sim.health - wear / 30 + (sim.repair ? REPAIR.rate : 0), 0, 100);
  if (sim.day % 30 === 29) sim.health = clamp(sim.health + 4, 0, 100);
  if (postRan && sim.health < 50 && sim.rng() < (50 - sim.health) * 0.018 / 30) { sim.health = clamp(sim.health - 6, 0, 100); sim.st.spikes++; }
  if (postRan || sim.repair) sim.st.heavy++;
  if (sim.repair) sim.st.repairDays++;
  sim.st.healthMin = Math.min(sim.st.healthMin, sim.health);
  sim.st.healthSum += sim.health;
  const runJobs = items.filter(it => it.run).length;
  sim.st.runningJobs.push(runJobs);
  if (baseShare > 0) (sim.st.runBase ??= []).push(runJobs);
  sim.st.running.push(runJobs + sim.evals.length);
  sim.st.queued.push(items.filter(it => !it.run).length);
  sim.st.freeShare.push(free);
  sim.idleRun = free >= JOBS.IDLE_NAG.share ? sim.idleRun + 1 : 0;
  sim.idleCards = free * sim.T;
  sim.st.smallJobsMax = Math.max(sim.st.smallJobsMax, sim.jobs.filter(j => j.line === 'small').length + sim.shelf + sim.evals.filter(e => e.line === 'small').length);
  sim.st.days++;
  // 完成
  for (const j of [...sim.jobs]) {
    if (j.kind === 'pretrain' && j.line === 'small' && j.done >= j.need - 1e-6) {
      // 小模型线的小底座：不动 s.gen、不动在练模型，练完进待发布（T2.3）
      sim.jobs = sim.jobs.filter(x => x !== j);
      const sm = { total: j.structure.total, active: j.structure.active, postDays: 0, relDays: 0, line: 'small' };
      sim.shelf++;
      sim.st.smallBases.push({ total: j.structure.total, days: j.elapsed });
      sim.jobs.push({ kind: 'post', model: sm, rl: false, prio: 'normal', until: 30, seq: nextSeq(sim), line: 'smallpost' });
      sim.log.push(`第${sim.day}天 小底座 ${j.structure.total}B ${j.cfg.tokens}T 练完（${j.elapsed}天，平均${Math.round(j.gotSum / j.elapsed)}张卡），挂 30 天后训练`);
    } else if (j.kind === 'post' && j.until && j.days >= j.until) {
      sim.jobs = sim.jobs.filter(x => x !== j);
      sim.shelf--; submitEval(sim, 'small');                 // 小模型送评即冻结（T7 方案 A），评测中仍占小模型线
    } else if (j.kind === 'pretrain' && j.done >= j.need - 1e-6) {
      sim.jobs = sim.jobs.filter(x => x !== j);
      sim.st.bases.push({ cfg: j.cfg, days: j.elapsed, avgGot: j.gotSum / j.elapsed, fast: j.fast, save: j.save || 0 });
      const old = sim.working;
      sim.jobs = sim.jobs.filter(x => !(x.kind === 'post' && x.model === old));
      if (old && old.postDays > old.relDays) sim.prev = { ...old, until: sim.day + JOBS.PREV_DAYS };   // 上一代收尾（T7）
      sim.working = { total: j.structure.total, active: j.structure.active, arch: j.structure.arch, tokens: j.cfg.tokens, postDays: 0, relDays: 0 };
      sim.gen++; sim.lastBaseDone = sim.day; sim.relSinceBase = 0;
      sim.log.push(`第${sim.day}天 底座 ${j.structure.total}B/${j.structure.active}B ${j.cfg.tokens}T 练完（${j.elapsed}天，平均${Math.round(j.gotSum / j.elapsed)}张卡）`);
    } else if (j.kind === 'distill' && j.done >= j.need - 1e-6 && j.elapsed >= DISTILL_MIN_DAYS) {
      sim.jobs = sim.jobs.filter(x => x !== j);
      sim.st.distills = (sim.st.distills || 0) + 1;
      sim.log.push(`第${sim.day}天 蒸馏 ${j.studentTotal}B 练完（${j.elapsed}天）`);
      submitEval(sim, 'small');
    } else if (j.kind === 'trial' && j.done >= j.cost - 1e-6 && j.elapsed >= j.minDays) {
      sim.jobs = sim.jobs.filter(x => x !== j);
      finishTrial(sim, j);
    }
  }
  // 安全评测（T6）：只走日历天，不占卡、不占作业位
  for (const e of [...sim.evals]) {
    if (sim.day < e.until) continue;
    sim.evals = sim.evals.filter(x => x !== e);
    if (e.line === 'small') { sim.smallLive = sim.day; sim.st.smallReleases++; }
    else {
      sim.live = true; sim.st.releases++; sim.relSinceBase++; if (e.line === 'prev') sim.prev = null;
      if (e.model && (e.line === 'main' || !sim.liveRef || e.model.total >= sim.liveRef.total)) sim.liveRef = { ...e.model };
    }
    sim.log.push(`第${sim.day}天 ${e.line === 'small' ? '小模型' : e.line === 'prev' ? '上一代收尾版' : '旗舰候选'}评测完（${e.tier} ${e.days}天）发布`);
  }
  if (sim.prev && sim.day >= sim.prev.until && !sim.evals.some(e => e.line === 'prev')) { sim.log.push(`第${sim.day}天 上一代收尾期满归档`); sim.prev = null; }
  sim.day++;
}
const evalTier = sim => (['frontier', 'bigtech'].includes(sim.tier) ? 'standard' : 'quick');
function submitEval(sim, line, model = null) {
  const tier = evalTier(sim);
  let days = EVAL.TIERS[tier].days;
  if (line === 'small') days = Math.max(EVAL.MIN_DAYS, Math.round(days * EVAL.SMALL));
  sim.evals.push({ line, tier, days, until: sim.day + days, model: model ? { ...model } : null });
  sim.st.evals++; sim.st.evalDays += days;
}
const nextSeq = sim => ++sim.seq;

// ---------- 机器人每 7 天（T9.1 的简化版） ----------
const BASE_AT = 45;        // 开局有在练模型时，第 45 天起立项下一代；之后按“上一代练完满 150 天且发过 2 版”（planProject 的条件）
function weekly(sim) {
  const slotsFree = () => sim.slots - slotJobs(sim);
  const big = ['frontier', 'bigtech'].includes(sim.tier);
  const major = big || sim.tier === 'major';
  // 1 后训练常开
  if (sim.working && !sim.jobs.some(j => j.kind === 'post' && j.model === sim.working) && slotsFree() > 0)
    sim.jobs.push({ kind: 'post', model: sim.working, rl: true, prio: 'normal', seq: nextSeq(sim) });
  // 2 送评（评测期间在练模型照常练）；节奏是输入
  const w = sim.working;
  const gap = SUBMIT_GAP[sim.key] ?? 56;
  if (w && !sim.evals.some(e => e.line === 'main') && w.postDays - w.relDays >= (sim.live ? gap : 30)) { submitEval(sim, 'main', w); w.relDays = w.postDays; }
  if (sim.prev && !sim.evals.some(e => e.line === 'prev') && sim.prev.postDays - sim.prev.relDays >= 14) { submitEval(sim, 'prev', sim.prev); sim.prev.relDays = sim.prev.postDays; }
  // 3 主线底座：时候到了先开试验（最多等 14 天），再立项；开局既没有在练模型也没有在线模型时直接立项
  const baseRunning = sim.jobs.some(j => j.kind === 'pretrain' && j.line === 'main');
  const fresh = !sim.working && !sim.live && !sim.baseStarted;
  const due = !baseRunning && (fresh || (sim.lastBaseDone === null ? sim.day >= BASE_AT && !sim.baseStarted : sim.day - sim.lastBaseDone >= 150 && sim.relSinceBase >= 2));
  const soon = !baseRunning && !due && (sim.lastBaseDone === null ? sim.day >= BASE_AT - 21 && !sim.baseStarted : sim.day - sim.lastBaseDone >= 130 && sim.relSinceBase >= 2);
  const target = (due || soon) && !fresh ? chooseBase(sim) : null;
  const maxTrials = big ? 2 : 1;
  if (target && target.cfg.total >= (refModel(sim)?.total ?? 0) * LAB.PLAN_MIN) {
    const kinds = [];
    const has = t => sim.findings.some(f => f.type === t && sim.day - f.day <= 120) || sim.jobs.some(j => j.type === t);
    if (!has('tune')) kinds.push({ type: 'tune' });
    if (major && !has('arch')) {
      // 立项前三周内只验已掌握的技术（T9.1）；在研技术要来得及在立项前学完才验，模拟里研究不推进，所以只剩已掌握的
      const owned = Object.keys(LAB.ARCH_TECHS.llm).find(t => archFits(t, target.cfg.arch) && sim.s.techs.includes(t) && !sim.findings.some(f => f.tech === t));
      if (owned) kinds.push({ type: 'arch', tech: owned, inResearch: false });
    }
    if (big && !has('mix')) kinds.push({ type: 'mix', dim: 'code' });
    for (const k of kinds) {
      if (sim.jobs.filter(j => j.kind === 'trial').length >= maxTrials) break;
      let pick = null;
      for (const size of ['mid', 'small']) {
        const job = { kind: 'trial', ...k, size, target: { ...target.cfg }, cost: LAB.SHARE[size] * target.pv.need, minDays: LAB.DAYS[size], done: 0, prio: 'normal', seq: 1e9 };
        const est = plan(sim, [...sim.jobs, job]).items.find(x => x.j === job);
        if (est && est.run && (size === 'small' || est.got >= 0.5 * wantCards(sim, job))) { pick = job; break; }
      }
      if (pick) { pick.seq = nextSeq(sim); sim.jobs.push(pick); }
    }
  }
  if (due && slotsFree() > 0) {
    if (sim.jobs.some(j => j.kind === 'trial') && sim.waitTrial < 14) sim.waitTrial += 7;
    else {
      const b = target || chooseBase(sim);
      if (b) {
        const lab = consumeFindings(sim, b.cfg, b.pv.need);
        const need = b.pv.need * (1 - lab.save);
        sim.jobs.push({ kind: 'pretrain', line: 'main', cfg: b.cfg, structure: b.pv.structure, need, need0: b.pv.need, save: lab.save, done: 0, fast: b.fast, labRisk: lab.risk, prio: 'high', seq: nextSeq(sim) });
        sim.baseStarted++; sim.waitTrial = 0;
        sim.st.saves.push(lab.save);
        if (!sim.st.baseChoice) sim.st.baseChoice = { ...b, lab };
        sim.log.push(`第${sim.day}天 立项底座 ${b.cfg.total}B/${b.cfg.active}B ${b.cfg.tokens}T（最低${b.min}张、想要${Math.round(b.want)}张、不算试验约${Math.round(b.days)}天；试验加成 省算力${(lab.save * 100).toFixed(1)}% 炸炉×${lab.risk.toFixed(2)}）`);
      }
    }
  }
  // 4 小模型线（只有语言模型有；T9.1 第 5 条）
  const smallBusy = () => sim.jobs.filter(j => j.line === 'small' || j.line === 'smallpost').length + sim.evals.filter(e => e.line === 'small').length;
  const reserve = (due || soon) && !baseRunning ? 1 : 0;   // 底座快到期时留一个作业位
  //  4a 前沿和大厂：每代主线一次，训练卡闲置 ≥ 20% 连续 7 天时，用闲着的卡从零练一个同代小号（“最多 N 张” = 闲着的卡），规模 ≤ min(120B, 参照底座 × 0.2)
  if (big && sim.mod === 'llm' && sim.familyGen < sim.gen && sim.idleRun >= JOBS.IDLE_NAG.days && smallBusy() < JOBS.SMALL_LINE && slotsFree() > reserve && refModel(sim)) {
    const capTotal = Math.min(JOBS.SMALL_MAX_TOTAL, refModel(sim).total * JOBS.SMALL_FRAC);
    const capCards = Math.floor(sim.idleCards);
    let pick = null;
    for (const total of core.PARAM_TOTALS.filter(t => t <= capTotal && t >= 7)) {
      const cfg = { total, active: total, arch: 'dense', tokens: Math.min(15, Math.round(M.poolStats(sim.s).tokens * 2)) };
      const pv = M.previewProject(sim.s, cfg);
      const job = { kind: 'pretrain', line: 'small', cfg, structure: pv.structure, need: pv.need, done: 0, fast: fastestDays(sim.mod, total), prio: 'normal', cap: capCards, seq: 1e9 };
      const est = plan(sim, [...sim.jobs, job]).items.find(x => x.j === job);
      const days = est?.run ? Math.max(job.fast, pv.need / (est.got * tf(sim) / sim.T * kp(sim)) * 30) : Infinity;
      if (days <= 60) pick = job;
    }
    if (pick) {
      pick.seq = nextSeq(sim); sim.jobs.push(pick); sim.familyGen = sim.gen;
      sim.log.push(`第${sim.day}天 立项小底座 ${pick.cfg.total}B ${pick.cfg.tokens}T（用闲着的 ${pick.cap} 张卡）`);
    }
  }
  //  4b 蒸馏：还没有在线小模型（或已满一年）、线空着、按现在分到的卡 90 天内蒸得完
  const teacher = sim.liveRef ?? sim.working;
  if (sim.mod === 'llm' && sim.live && smallBusy() === 0 && (sim.smallLive === null || sim.day - sim.smallLive >= 365) && teacher?.total > 14 && slotsFree() > reserve) {
    const sz = big ? 7 : 14;
    const need = (6 * sz + 2 * teacher.active) * 1e9 * 1.5e12;
    const job = { kind: 'distill', line: 'small', need, done: 0, studentTotal: sz, teacherTotal: teacher.total, structure: { total: sz, active: sz, arch: 'dense' }, prio: 'high', seq: 1e9 };
    const est = plan(sim, [...sim.jobs, job]).items.find(x => x.j === job);
    const days = est?.run ? Math.max(DISTILL_MIN_DAYS, need / (est.got * tf(sim) / sim.T * kp(sim)) * 30) : Infinity;
    if (days <= 90) { job.seq = nextSeq(sim); sim.jobs.push(job); }
  }
}
function runYear(id, sc, seed, opts = {}) {
  const sim = makeSim(id, sc, seed, opts);
  for (let d = 0; d < 365; d++) { if (d % 7 === 0) weekly(sim); step(sim); }
  return sim;
}

// ---------- 报表 ----------
const pct = v => `${Math.round(v * 100)}%`;
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const med = a => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN; };
const f2 = v => (Number.isFinite(v) ? v.toFixed(2) : '—');
const CASES = [['rwkv', 'y2023', '小公司 2023'], ['perplexity', 'y2025', '小公司 2025'], ['suno', 'y2024', '专精非 LLM 2024'], ['qwen', 'y2024', '大厂 2024'], ['deepseek', 'y2025', '中厂 2025'], ['gpt', 'y2025', '前沿 2025'], ['gpt', 'y2026', '前沿 2026']]
  .filter(([c, sc]) => !ONLY || ONLY === `${c}:${sc}`);
const LLM_CASES = CASES.filter(([c, sc]) => makeSim(c, sc, 1).mod === 'llm');

console.log('### 表 T0 分卡等价自检（第一次提交：不设最低卡、不封顶时必须正好是旧值）\n');
{
  const a = [{ w: 3, min: 0, upper: Infinity }, { w: 1, min: 0, upper: Infinity }];
  waterFill(a);
  const b = [{ w: 3, min: 0, upper: Infinity }];
  waterFill(b);
  console.log(`- 底座 + 后训练：份额 ${a[0].share} / ${a[1].share}（要求 0.75 / 0.25，=== 比较：${a[0].share === 0.75 && a[1].share === 0.25}）`);
  console.log(`- 只有底座：份额 ${b[0].share}（要求 1：${b[0].share === 1}）`);
  console.log(`- fComp 的算力项：max(1 − 0.75, 0.25) = ${Math.max(1 - 0.75, 0.25)}，max(1 − 1, 0.25) = ${Math.max(1 - 1, 0.25)}，没有底座时 = ${Math.max(1 - 0, 0.25)}（旧值 0.25 / 0.25 / 1）`);
}

console.log('\n### 表 T1 开局分卡与底座工期（种子 1，开局状态，推理份额取开局默认，在练模型挂一项 RL 后训练）\n');
console.log('| 公司 | 总卡 / 训练卡 | 每张训练卡 H100·月/月 | 团队 / 作业位（按人、按卡 → 取大） | 机器人挑的底座 | 最低 / 想要 / 实得卡 | 新工期（天） | 旧规则工期（天） | 最快天数 | 后训练 最低 / 想要 / 实得卡 | 后训练 computeMult 新 / 旧 | 冲顶力 fComp 新 / 旧 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const [c, sc, label] of CASES) {
  const sim = makeSim(c, sc, 1);
  if (sim.working) sim.jobs.push({ kind: 'post', model: sim.working, rl: true, prio: 'normal', seq: nextSeq(sim) });
  const b = chooseBase(sim);
  const perCard = tf(sim) / sim.T;
  const ref = lerpYear((sim.mod === 'llm' ? EFFORT.TRAIN_REF.llm : EFFORT.TRAIN_REF.other), sim.y0) * 1e21;
  const pvOf = () => {
    if (sim.mod === 'llm') return b;
    // 非 LLM：取 150 天内练得完的最大一档（和 planProject 一样只看 tokens = 1）
    let pick = null;
    for (const x of (core.SCALES[sim.mod] || [])) {
      if (!P.projectCheck(sim.s, { scaleId: x.id, tokens: 1 }).ok) continue;
      const pv = M.previewProject(sim.s, { scaleId: x.id, tokens: 1 });
      const job = { kind: 'pretrain', structure: pv.structure, need: pv.need, fast: JOBS.FAST.nonLlm, prio: 'high', seq: 1e9 };
      const it = plan(sim, [...sim.jobs, job]).items.find(y => y.j === job);
      const d = it?.run ? Math.max(job.fast, pv.need / (it.got * perCard * kp(sim)) * 30) : Infinity;
      if (d <= 150 || !pick) pick = { cfg: { total: x.id, active: '', arch: x.id, tokens: 1 }, pv, min: JOBS.NONLLM_MIN, fast: JOBS.FAST.nonLlm };
    }
    return pick;
  };
  const bb = pvOf();
  const slotTxt = `${sim.team} / ${slotsByTeam(sim.team)}、${slotsByCards(sim.selfCards)} → ${sim.slots}`;
  if (!bb) { console.log(`| ${label}（${c}） | ${sim.total} / ${Math.round(sim.T)} | ${(perCard / 1e21).toFixed(2)} | ${slotTxt} | 150 天内练不完任何底座 | — | — | — | — | — | — | — |`); continue; }
  const job = { kind: 'pretrain', structure: bb.pv.structure, need: bb.pv.need, fast: bb.fast, prio: 'high', seq: 1e9 };
  const { items } = plan(sim, [...sim.jobs, job]);
  const it = items.find(x => x.j === job);
  const post = items.find(x => x.j.kind === 'post');
  const days = Math.max(job.fast, bb.pv.need / (it.got * perCard * kp(sim)) * 30);
  const oldDays = bb.pv.need / (tf(sim) * (post ? 0.75 : 1) * kp(sim)) * 30;
  let pTxt = '—', cm = '—';
  if (post) {
    const pn = postNeed(sim.mod, post.j.model.active, true);
    pTxt = `${minCards(sim, post.j)} / ${Math.round(wantCards(sim, post.j))} / ${Math.round(post.got)}`;
    cm = `${f2(clamp(Math.sqrt(post.got * perCard / pn), 0, 1.2))} / ${f2(clamp(Math.sqrt(tf(sim) * 0.25 / pn), 0, 1.2))}`;
  }
  const fN = f2(clamp(Math.sqrt(tf(sim) * Math.max(1 - it.share, 0.25) / ref), ...EFFORT.COMP)), fO = f2(clamp(Math.sqrt(tf(sim) * 0.25 / ref), ...EFFORT.COMP));
  const name = sim.mod === 'llm' ? `${bb.cfg.total}B/${bb.cfg.active}B ${bb.cfg.arch === 'moe' ? 'MoE' : '稠密'} ${bb.cfg.tokens}T` : `${bb.cfg.arch} 档`;
  console.log(`| ${label}（${c}） | ${sim.total} / ${Math.round(sim.T)} | ${(perCard / 1e21).toFixed(2)} | ${slotTxt} | ${name} | ${minCards(sim, job)} / ${Math.round(wantCards(sim, job))} / ${Math.round(it.got)} | ${Math.round(days)} | ${Math.round(oldDays)} | ${Math.round(job.fast)} | ${pTxt} | ${cm} | ${fN} / ${fO} |`);
}

console.log(`\n### 表 T2 一年时间线摘要（机器人 planJobs 简化版，${SEEDS} 个种子取中位；卡数一年不变；送评节奏是输入）\n`);
console.log('| 公司 | 同时在跑的作业 中位 / 最多 | 底座在练的日子里 中位 | 加上评测 中位 / 最多 | ≥3 项作业的天数 | 排队作业·天 | 闲置训练卡平均 | 主线底座：开了几个 / 工期中位（天）/ 试验省算力 | 小底座：个数 / 规模 / 工期（天） | 试验占训练卡·天 | 送评间隔（输入）/ 送评次数 / 评测天数 | 旗舰发布 / 小模型发布 | 小模型线最多同时 | 一年练出的模型（主线底座 + 小底座 + 蒸馏） | 试验 / 成功 | 健康 最低 / 平均 | 检修天数（占比） | 重活天数占比 | 炸炉 轻 / 重 | spike |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const sample = {};
for (const [c, sc, label] of LLM_CASES) {
  const runs = [];
  for (let seed = 1; seed <= SEEDS; seed++) runs.push(runYear(c, sc, seed));
  sample[`${c}:${sc}`] = runs[0];
  const m = fn => med(runs.map(fn));
  const baseDays = runs.flatMap(r => r.st.bases.map(b => b.days));
  const saves = runs.flatMap(r => r.st.saves);
  const sb = runs.flatMap(r => r.st.smallBases);
  const sbTxt = sb.length ? `${m(r => r.st.smallBases.length)} / ${Math.round(med(sb.map(x => x.total)))}B / ${Math.round(med(sb.map(x => x.days)))}` : '0 / — / —';
  const rep = m(r => r.st.repairDays);
  console.log(`| ${label}（${c}） | ${m(r => med(r.st.runningJobs))} / ${m(r => Math.max(...r.st.runningJobs))} | ${m(r => med(r.st.runBase || [0]))} | ${m(r => med(r.st.running))} / ${m(r => Math.max(...r.st.running))} | ${pct(m(r => r.st.runningJobs.filter(x => x >= 3).length / r.st.days))} | ${m(r => r.st.queued.reduce((a, b) => a + b, 0))} | ${pct(m(r => avg(r.st.freeShare)))} | ${m(r => r.baseStarted)} / ${baseDays.length ? Math.round(med(baseDays)) : '一年内没练完'} / ${saves.length ? `${(med(saves) * 100).toFixed(1)}%` : '—'} | ${sbTxt} | ${(m(r => r.st.trialCardDays / r.st.trainCardDays) * 100).toFixed(1)}% | ${SUBMIT_GAP[`${c}:${sc}`]} 天 / ${m(r => r.st.evals)} / ${m(r => r.st.evalDays)} | ${m(r => r.st.releases)} / ${m(r => r.st.smallReleases)} | ${m(r => r.st.smallJobsMax)} | ${m(r => r.st.bases.length + r.st.smallBases.length + (r.st.distills || 0))} | ${m(r => r.st.trials.length)} / ${m(r => r.st.trials.filter(t => t.ok).length)} | ${Math.round(m(r => r.st.healthMin))} / ${Math.round(m(r => r.st.healthSum / r.st.days))} | ${rep}（${(rep / 365 * 100).toFixed(1)}%） | ${pct(m(r => r.st.heavy / r.st.days))} | ${m(r => r.st.blow.minor)} / ${m(r => r.st.blow.severe)} | ${m(r => r.st.spikes)} |`);
}
console.log('\n种子 1 的时间线（前 16 条）：');
for (const [k, sim] of Object.entries(sample)) console.log(`- ${k}：${sim.log.slice(0, 16).join('；')}`);

// 数据配比的出生加成在真引擎的出生护栏之后还剩多少（birthClamp、computeCaps 都是真函数）
function birthDelta(s, cfg, dim, bonus) {
  const run = add => {
    const pool = M.poolStats(s);
    const repeat = M.pretrainRepeat(s, pool.tokens, cfg.tokens);
    const st = { total: cfg.total, active: cfg.active, arch: cfg.arch };
    const r = M.llmBase(st, cfg.tokens, pool.quality * repeat, pool.mix, pool.quality);
    const m = P.newModel(s, st, { role: 'flagship' });
    m.base = r.base; m.kcap = r.kcap;
    for (const k of Object.keys(m.base)) m.base[k] = round1(clamp(m.base[k], 0, 95));
    m.dims = {};
    for (const k of core.dimKeys(s.mod)) m.dims[k] = round1(clamp(m.base[k] + (k === 'safety' ? 18 : 2), 0, 95));
    m.base[dim] += add; m.dims[dim] += add;
    m.capTechs = [];
    M.birthClamp(s, m);
    return { d: m.dims[dim], cap: M.computeCaps(s, m)[dim] };
  };
  const a = run(0), b = run(bonus);
  return { d: b.d - a.d, cap: b.cap - a.cap };
}

console.log(`\n### 表 T3 试验收益分布（每格 2000 个作业 id，按开局技术积累算成功率；成本和工期按机器人挑的下一代底座）\n`);
console.log('| 公司 | 试验 | 成功率 | 成功时收益（均值，区间） | 成本（H100·月） | 拿满想要卡的天数和卡数（只拿到最低卡时） | 期望省算力 | 折成底座工期 | 研究缩短 / 技术积累的系数 p_ref |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const [c, sc, label] of LLM_CASES) {
  const sim = makeSim(c, sc, 1);
  if (sim.working) sim.jobs.push({ kind: 'post', model: sim.working, rl: true, prio: 'normal', seq: nextSeq(sim) });   // 和表 T1 一样：在练模型挂一项 RL 后训练
  const b = chooseBase(sim);
  if (!b) continue;
  const perCard = tf(sim) / sim.T;
  const owned = Object.keys(LAB.ARCH_TECHS.llm).find(t => archFits(t, b.cfg.arch) && sim.s.techs.includes(t));
  const rows = [['tune', 'small'], ['tune', 'mid'], ...(owned ? [['arch', 'small', owned], ['arch', 'mid', owned]] : []), ['mix', 'mid']];
  if (!owned) console.log(`| ${label} | 架构验证 | — | 计划 ${b.cfg.arch === 'moe' ? 'MoE' : '稠密'}，没有已掌握、配得上的架构类技术（在研技术要立项前学完才验） | — | — | — | — | — |`);
  for (const [type, size, tech] of rows) {
    const odds = trialOdds(sim, type, size, type === 'arch' ? tech : null);
    let ok = 0; const gains = [];
    for (let i = 0; i < 2000; i++) { const o = trialOutcome(1, `mc${i}_${c}_${type}_${size}`, odds); if (o.ok) { ok++; gains.push(o.g); } }
    const gn = LAB.GAIN[type][size];
    const g = avg(gains);
    const cost = LAB.SHARE[size] * b.pv.need;
    const want = cost / (LAB.DAYS[size] / 30) / perCard;
    const mn = Math.max(LAB.MIN_CARDS, Math.ceil(LAB.MIN_FRAC * want));
    const p = pRef(sim, cost, size);
    let desc, expTxt = '—', daysTxt = '—';
    if (type === 'mix') {
      const bd = birthDelta(sim.s, b.cfg, 'code', gn.dim * g);
      desc = `该维出生 +${(gn.dim * g).toFixed(2)}（${(gn.dim * 0.5).toFixed(1)}–${gn.dim}）；过真引擎出生护栏后 code +${bd.d.toFixed(2)}，上限 +${bd.cap.toFixed(2)}`;
    } else {
      desc = `省算力 ${(gn.save * g * 100).toFixed(1)}%（${(gn.save * 50).toFixed(0)}–${gn.save * 100}%），炸炉 ×${(1 - (1 - gn.risk) * g).toFixed(2)}${gn.cut ? `；技术在研时剩余工作量 −${Math.round(gn.cut * g * 100)}%（每项技术一次）` : ''}`;
      const es = gn.save * g * ok / 2000;
      expTxt = `${(es * 100).toFixed(1)}%`;
      daysTxt = b.days > b.fast + 1e-9 ? `少约 ${Math.min(b.days - b.fast, b.days * es).toFixed(1)} 天（${Math.round(b.days)} 天的底座）` : `已到最快天数：少用约 ${Math.round(b.want * es)} 张卡`;
    }
    console.log(`| ${label} | ${{ tune: '调参', arch: `架构验证（${tech}）`, mix: '数据配比' }[type]}${size === 'mid' ? '中档' : '小档'} | ${pct(ok / 2000)} | ${desc} | ${(cost / 1e21).toFixed(1)} | ${LAB.DAYS[size]} 天、${Math.round(Math.max(want, LAB.MIN_CARDS))} 张（${mn} 张时 ${Math.round(LAB.DAYS[size] * want / mn)} 天） | ${expTxt} | ${daysTxt} | ${f2(p)} |`);
  }
}

console.log(`\n### 表 T4 训练与推理的取舍（开局状态；底座用推理 50% 时机器人挑的那个；收入按 economy.simulateService 现算）\n`);
console.log('| 公司 | 推理份额 | 训练卡 | 底座工期（天） | 后训练 computeMult | 冲顶力 fComp | 闲置训练卡 | 月收入 | 推理负载 | 429 比例 |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const [c, sc, label] of LLM_CASES) {
  const base = makeSim(c, sc, 1, { inferShare: 0.5 });
  const b = chooseBase(base);
  for (const share of [0.3, 0.5, 0.7]) {
    const sim = makeSim(c, sc, 1, { inferShare: share });
    if (sim.working) sim.jobs.push({ kind: 'post', model: sim.working, rl: true, prio: 'normal', seq: nextSeq(sim) });
    let days = '—', cm = '—', fc = '—', free = '—';
    if (b) {
      const job = { kind: 'pretrain', structure: b.pv.structure, need: b.pv.need, fast: b.fast, prio: 'high', seq: 1e9 };
      const pl = plan(sim, [...sim.jobs, job]);
      const it = pl.items.find(x => x.j === job);
      const perCard = tf(sim) / sim.T;
      days = it.run ? Math.round(Math.max(b.fast, b.pv.need / (it.got * perCard * kp(sim)) * 30)) : '排队（卡不够最低）';
      const post = pl.items.find(x => x.j.kind === 'post');
      if (post) cm = post.run ? f2(clamp(Math.sqrt(post.got * perCard / postNeed(sim.mod, post.j.model.active, true)), 0, 1.2)) : '排队';
      const ref = lerpYear(EFFORT.TRAIN_REF.llm, sim.y0) * 1e21;
      fc = f2(clamp(Math.sqrt(tf(sim) * Math.max(1 - (it.share || 0), 0.25) / ref), ...EFFORT.COMP));
      free = pct(pl.free);
    }
    const sv = EC.simulateService(sim.s, { commit: false });
    console.log(`| ${label} | ${pct(share)} | ${Math.round(sim.T)} | ${days} | ${cm} | ${fc} | ${free} | ${(sv.total / 1e6).toFixed(1)}M | ${f2(sv.util)} | ${pct(sv.r429 || 0)} |`);
  }
}

console.log('\n### 表 T5 按真实卡数复现（1 张 H100·月 = 1e21，健康 90 即 ×0.97，无技术加成；工期 = max(最快天数, 算力天数)）\n');
console.log('| 训练 | 卡 | 激活参数 × token | 游戏工期（天） | 最快天数 | 真实 |');
console.log('|---|---|---|---|---|---|');
for (const [name, cards, flops, total, active, tok, real] of [
  ['DeepSeek-V3', 2048, 9.2e20, 671, 37, 14.8, '预训练 2.664M 卡时 ÷ 2048 ≈ 54 天，“不到两个月”'],
  ['Llama 3.1 405B', 16384, 1e21, 405, 405, 15.6, '30.84M 卡时 ÷ 16384 ≈ 78 天（含中断）'],
  ['671B/37B 15T，头部公司 2026 全给', 45000, 2.83e21, 671, 37, 15, '—（只受最快天数限制）'],
  ['7B 2T，小公司 2023（47 张 A100）', 47, 3.2e20, 7, 7, 2, '—'],
]) {
  const need = 6 * active * 1e9 * tok * 1e12;
  const per = flops * 0.97;
  const fast = fastestDays('llm', total);
  const cd = need / (cards * per) * 30;
  console.log(`| ${name} | ${Math.round(cards)} | ${active}B × ${tok}T | ${Math.round(Math.max(fast, cd))}（算力 ${Math.round(cd)}） | ${Math.round(fast)} | ${real} |`);
}

console.log('\n### 表 T6 防刷自检（开局状态，种子 1）\n');
console.log('| 公司 | 参照底座（总参 / 参照算力 H100·月） | 极小计划 0.5B·0.5T：能不能开 / 中档架构验证成本 / p_ref | 正常计划的中档调参 p_ref | 小底座研发经验：v1（每个都给）半年 3 条线 / 现在（每代只给第一个，乘规模比） | 试验技术积累每代上限 |');
console.log('|---|---|---|---|---|---|');
for (const [c, sc, label] of LLM_CASES) {
  const sim = makeSim(c, sc, 1);
  const r = refModel(sim);
  const rn = refNeed(sim);
  const tiny = { total: 0.5, active: 0.5, arch: 'dense', tokens: 0.5 };
  const tinyCost = LAB.SHARE.mid * M.previewProject(sim.s, tiny).need;
  const allowed = !r || tiny.total >= r.total * LAB.PLAN_MIN;
  const b = chooseBase(sim);
  const pNorm = b ? pRef(sim, LAB.SHARE.mid * b.pv.need, 'mid') : NaN;
  // 小底座经验：14B（或参照的 1/5 以内最大一档）满 token 的 pretrainCredit
  const sbTotal = r ? core.PARAM_TOTALS.filter(t => t <= Math.min(JOBS.SMALL_MAX_TOTAL, r.total * JOBS.SMALL_FRAC)).at(-1) : null;
  let credTxt = '没有参照底座，不能练小底座';
  if (sbTotal && sbTotal >= 0.5) {
    const tok = Math.min(15, Math.round(M.poolStats(sim.s).tokens * 2));
    const need = 6 * sbTotal * 1e9 * tok * 1e12;
    const { credit } = M.pretrainCredit(sbTotal, need, 0);
    const c14 = M.pretrainCredit(14, 6 * 14e9 * tok * 1e12, 0).credit;
    credTxt = `14B 每个 +${c14.toFixed(1)}，半年可练十几个 / ${sbTotal}B 一代只给一次 +${(credit * Math.min(1, sbTotal / r.total)).toFixed(1)}`;
  }
  console.log(`| ${label} | ${r ? `${r.total}B` : '没有'} / ${(rn / 1e21).toFixed(0)} | ${allowed ? '能' : `不能（< 参照 ${r.total}B 的 1/4）`} / ${(tinyCost / 1e21).toFixed(3)} / ${f2(pRef(sim, tinyCost, 'mid'))} | ${f2(pNorm)} | ${credTxt} | ${LAB.KNOW.perGen}（× p_ref） |`);
}

console.log('\n### 表 T7 作业位分布（96 个开局；旧 = 只按人，新 = 按人、按自用卡取大）\n');
{
  const cnt = { old: {}, neu: {} }, two = [];
  let n = 0;
  for (const co of core.COMPANIES) for (const scn of core.SCENARIOS) {
    let s; try { s = G.createGame(co.id, scn.id, 1); } catch { continue; }
    n++;
    const al = M.gpuAllocation(s);
    const o = slotsByTeam(s.team), nw = slotsOf(s.team, al.selfGpus);
    cnt.old[o] = (cnt.old[o] || 0) + 1; cnt.neu[nw] = (cnt.neu[nw] || 0) + 1;
    if (nw === 2) two.push(`${co.id}:${scn.id}（${s.team} 人、自用卡 ${Math.round(al.selfGpus)}）`);
  }
  console.log('| 作业位 | 2 | 3 | 4 | 5 | 6 |');
  console.log('|---|---|---|---|---|---|');
  console.log(`| 旧（按人） | ${[2, 3, 4, 5, 6].map(k => cnt.old[k] || 0).join(' | ')} |`);
  console.log(`| 新（按人、按卡取大） | ${[2, 3, 4, 5, 6].map(k => cnt.neu[k] || 0).join(' | ')} |`);
  console.log(`\n共 ${n} 个开局。新规则下仍只有 2 个作业位的：${two.join('、') || '无'}。试验不占作业位，所以这些公司也能在“底座 + 后训练”之外开试验。`);
}
