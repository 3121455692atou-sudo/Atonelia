// 模型能力：结构、预训练底座、蒸馏、后训练、跑分与排行榜。数值“像模像样”即可，不追求严格。
import { knowFx, techStatus } from './research.js';
import { MODALITIES, DIRECTIONS, SCALES, GPUS, RENT_FACTOR, ARCHS, TECH_BY_ID, weightClass, dimKeys, yearOf, addMonths, monthsBetween } from '../data/core.js';
import { BENCHMARKS, BENCH_BY_ID, lastRefresh } from '../data/benchmarks.js';
import { RELEASES, FAMILIES } from '../data/rivals.js';
import { structureForRelease } from '../data/model_structure.js';
import { clamp, sigmoid, round1, rand, hash01 } from './util.js';
import { KNOW_PRETRAIN, REPEAT_RSTAR, MAX_EPOCHS, DISTILL_MIN_DAYS, BOARD_WINDOW_DAYS, kcapOffset, DIM_MAX, CURVE, EFFORT, SOTA_EASE, SOTA, DISTILL_MIX, APPROACH, OWN_EDGE, DISTILL_HEAVY, TAINT_MIN_DIST, DISTILL_GAP, EXPECT, GEN } from '../data/balance.js';
import { modifier, capMods } from './modifiers.js';
import { daysBetween, addDays } from './clock.js';
import { qOf, isMine, orgOf, familyBest, orgBest, benchBest, orgsOf, relDims, Q_W, anchor, anchorEnv, worldSota, histOther, ownHist, sotaMade, sotaWouldTake } from './sota.js';
import { compShare, postAvail, allocJobs, jobEta, baseJob, fastestDays } from './jobs.js';
import { P } from './provider.js';

// 平衡常量（2026-10-21 决定，规格 F6）已搬进 data/balance.js，数值不变；这里照旧转出口，原来从 model.js 导入的地方不用改。
// KNOW_PRETRAIN：预训练完成时给的研发经验；REPEAT_RSTAR、MAX_EPOCHS：重复语料的饱和常数和遍数上限（只用于 LLM）；
// DISTILL_MIN_DAYS：蒸馏小模型的流程下限（天）。
export { KNOW_PRETRAIN, REPEAT_RSTAR, MAX_EPOCHS, DISTILL_MIN_DAYS };

export const scaleById = (mod, id) => SCALES[mod].find(x => x.id === id);
// “自家”按 org 算（规格 D1，sota.js）：同 org 同模态的家族都是自己的，不出现在对手里。这里照旧转出口，原来从 model.js 导入的地方不用改。
export { isMine };
export const workingModel = s => s.models.find(m => m.id === s.working) || null;
export const liveModel = s => s.models.find(m => m.id === s.live) || null;
export const smallLive = s => s.models.find(m => m.id === s.smallLive) || null;
export const smallWorking = s => s.models.find(m => m.id === s.smallWorking) || null;

// ---------- 技术 ----------
// 技术（以及以后的路线、特质、限时加成）给的加成一律读 modifier(s, key)（规格 E3）：train、infer、stability、dataQuality、post.<维度>、cap.<维度>。
// 维度和后训练方向要么写 needTech（学会这项技术才开放，Agent 要先会函数调用），要么写 from（这个月以后才有）。
const unlocked = (s, d) => (d?.needTech ? (s.techs || []).includes(d.needTech) : !d?.from || s.date >= d.from);
export function dimUnlocked(s, mod, key) {
  return unlocked(s, MODALITIES[mod].dims.find(x => x.key === key));
}

// ---------- 数据池 ----------
// 同一份状态里 poolStats 在顾问、立项表单、分卡里一天要读很多次；池子只会在订单到货时变（tokens/qw 一起变），
// 加上数据质量加成没变就直接用上次的结果。返回的对象只读，调用方都不改它。
const POOL_CACHE = new WeakMap();
export function poolStats(s) {
  const p = s.data.pool;
  const dq = modifier(s, 'dataQuality');
  const c = POOL_CACHE.get(s);
  if (c && c.tokens === p.tokens && c.qw === p.qw && c.dq === dq) return c.val;
  const quality = p.tokens > 0 ? p.qw / p.tokens : 1;
  const mix = {};
  for (const [k, v] of Object.entries(p.mix)) mix[k] = p.tokens > 0 ? v / p.tokens : 0;
  const val = { tokens: p.tokens, quality: quality * dq, mix };
  POOL_CACHE.set(s, { tokens: p.tokens, qw: p.qw, dq, val });
  return val;
}
export function addPoolData(s, ds) {
  const p = s.data.pool;
  p.tokens += ds.tokens;
  p.qw += ds.tokens * ds.quality;
  for (const [k, v] of Object.entries(ds.mix || {})) p.mix[k] = (p.mix[k] || 0) + v * ds.tokens;
  if (['pirated', 'unclear', 'tos'].includes(ds.rights)) s.data.risky[ds.id] = true;
}

// ---------- 结构 ----------
// 语言模型结构：{ total, active, arch }。非语言模型沿用预设规模。
export function cfgFromPreset(mod, scale) {
  return { total: scale.total, active: scale.active, arch: scale.moe ? 'moe' : 'dense', scaleId: scale.id, cls: scale.cls };
}
// 量级（规格 D1.1）：语言模型先读规模表里写明的 cls（f2t 就是前沿），否则按总参数分小、中、大（CLASS_EDGES）；
// 继承的参数不公开的闭源旗舰记着 'frontier'，单列一档，不并进大。图像、音乐、语音只有三档，读模型或规模表上的 cls。
export function clsOf(model) {
  if (!model) return null;
  if (model.mod !== 'llm') return model.cls ?? SCALES[model.mod]?.find(x => x.id === model.scaleId)?.cls ?? null;
  if (model.cls === 'frontier') return 'frontier';
  const scale = SCALES.llm.find(x => x.id === model.scaleId) || SCALES.llm.find(x => x.total === model.total && (model.active == null || x.active === model.active));
  return scale?.cls ?? weightClass(model.total);
}
export function archOf(model) { return ARCHS[model.arch] || ARCHS.dense; }

// 有效算力 = 6·N_active·D·数据质量（MoE 与架构修正）。校准：Llama 2 70B → 知识约 62；GPT-4 约 78；Llama 3.1 405B 约 81。
// quality 是训练信号的质量（已按重复语料折算）；capacityQuality 是语料本身的质量，决定知识容量和安全底子，重复不扣它。
export function llmBase(cfg, tokensT, quality, mix, capacityQuality = quality) {
  const moe = cfg.active < cfg.total;
  const flops = 6 * cfg.active * 1e9 * tokensT * 1e12;
  const moeGain = moe ? 1 + 1.4 * Math.log10(cfg.total / cfg.active) : 1;
  const archGain = cfg.arch === 'rnn' ? 0.6 : cfg.arch === 'hybrid' ? 0.9 : 1;
  const eff = flops * quality * moeGain * archGain;
  const raw = 11.6 * Math.log10(Math.max(eff, 1e18)) - 215.6;
  const g = raw <= 80 ? raw : 80 + (raw - 80) * 0.55;
  const kcap = knowledgeCap(cfg.total, capacityQuality);
  const soft = v => (v <= kcap ? v : kcap + (v - kcap) * 0.3);
  const m = k => mix[k] || 0;
  return {
    base: {
      knowledge: soft(g + 4 * m('sci') + 3 * m('books')),
      code: soft(g - 10 + 40 * m('code')),
      math: soft(g - 14 + 45 * (m('math') + 0.3 * m('sci'))),
      writing: soft(g - 6 + 25 * m('books') + 4 * m('cn')),
      safety: clamp(24 + 6 * (capacityQuality - 1), 15, 40),
      agent: clamp(g - 48, 0, 30),
    },
    kcap,
  };
}
// 参数量决定能装下多少知识；数据越好，小模型越能逼近上限。
export const knowledgeCap = (total, quality) => 52 + 11 * Math.log10(Math.max(total, 0.5)) + 4 * Math.log2(Math.max(quality, 0.5));

const NONLLM_MIX_BONUS = {
  image: { photo: { realism: 6, aesthetics: 2 }, art: { aesthetics: 7 } },
  music: { song: { vocals: 5, composition: 4, lyrics: 3 }, instrumental: { composition: 3, fidelity: 3 } },
  speech: { read: { naturalness: 2 }, conversational: { naturalness: 5, expressive: 5 }, multilingual: { multilingual: 8 } },
};
export function nonLlmBase(mod, scale, quality, mix) {
  const out = {};
  const q = 6 * Math.log2(Math.max(quality, 0.5));
  for (const key of dimKeys(mod)) out[key] = scale.base + q - (key === 'safety' ? 30 : 0) - (key === 'text' ? 25 : 0);
  for (const [k, share] of Object.entries(mix)) for (const [d, v] of Object.entries(NONLLM_MIX_BONUS[mod]?.[k] || {})) out[d] += v * share * 1.5;
  return { base: out, kcap: null };
}
// 后训练还能往上走多少（规格 D6.1）。knowledge 从 3 调到 6（审查报告 C1）：开局继承的在训模型 base = 史实 − 6，
// 技术加成不再重复计算以后，知识上限正好回到史实发布值，不会比现实还低。
export const HEADROOM = {
  llm: { knowledge: 6, code: 9, math: 11, writing: 12, safety: 48, agent: 14 },
  image: { aesthetics: 10, adherence: 12, text: 12, realism: 10, safety: 40 },
  music: { composition: 10, vocals: 10, lyrics: 12, fidelity: 10, safety: 40 },
  speech: { naturalness: 10, cloning: 12, multilingual: 12, expressive: 12, safety: 40 },
};
// 技术给的上限加成里，这个模型的底座已经“含着”的那部分（规格 D6.1 修掉的重复计算）。
// m.capTechs：底座能力里已经体现了效果的技术。开局继承、续训、蒸馏出来的模型，底座取自真实型号或老师的能力，本来就含着当时掌握的技术，
// 记成当时的 s.techs；自己预训练的底座按缩放律算，不含任何技术的上限效果，记 []（这些技术照常加上限）。之后新学的技术对谁都照常加。
function bakedTechCap(s, model, k) {
  let v = 0;
  for (const id of model.capTechs || []) if ((s.techs || []).includes(id)) v += TECH_BY_ID[id]?.effects?.cap?.[k] || 0;
  return v;
}
// 自研上限（D6.1 的三项）：底座 + 余量 + 底座之后新学的技术 + 其他来源的 cap 加成；知识容量；DIM_MAX。
// cm（可不传）：同一份状态里连着算很多个底座时，传算好的 capMods(s, dimKeys(model.mod))（顾问枚举候选底座用）。
export function computeCaps(s, model, cm) {
  const caps = {};
  const keys = dimKeys(model.mod);
  cm ??= capMods(s, keys);
  const baked = !!model.capTechs?.length;
  for (const k of keys) {
    let c = model.base[k] + (HEADROOM[model.mod][k] || 8) + cm[k] - (baked ? bakedTechCap(s, model, k) : 0);
    if (model.kcap && k !== 'safety') c = Math.min(c, model.kcap + kcapOffset(k));
    caps[k] = clamp(c, 0, DIM_MAX);
  }
  return caps;
}

// ---------- 算力 ----------
const GPU_FLOPS = Object.fromEntries(Object.entries(GPUS).map(([k, v]) => [k, v.flops]));
const GPU_INFER = Object.fromEntries(Object.entries(GPUS).map(([k, v]) => [k, v.infer]));
export function clusterGpus(s) {
  const out = {};
  for (const src of ['owned', 'rented']) for (const [k, n] of Object.entries(s.gpus[src])) out[k] = (out[k] || 0) + n;
  return out;
}
// 卡数都是整数，直接按自有、租用两张表相加（和先合并再相加结果一样，省得每次新建一张表）。
export const gpuCount = s => { let n = 0; for (const src of ['owned', 'rented']) for (const v of Object.values(s.gpus[src])) n += v; return n; };
export const rawFlops = (s, table = clusterGpus(s)) => Object.entries(table).reduce((a, [k, n]) => a + n * (GPU_FLOPS[k] || 0), 0);
// 实际租出去的卡：不超过手里的卡数。卖卡、机房失火之后，旧的出租张数不再算数，也不再收租金。
export function leaseGpus(s) {
  const n = s.products.gpu_lease?.gpus;
  return Number.isFinite(n) ? clamp(Math.floor(n), 0, gpuCount(s)) : 0;
}
// 一张账分卡：出租的卡先从集群里划走；推理滑杆分的是剩下的自用卡，其余归训练。
// 生成订单（规格 D7，sim/orders.js）只从推理那一份里借卡：推理份额 inferGpus 里，借给生成的那一桶记 genGpus，剩下的 serveGpus 才给服务用；
// 训练那一份一张都不动。训练、推理（含生成）、出租收入和界面都读这张账，三份加起来正好是手里的卡，不会超卖，也没有凭空保底。
export function gpuAllocation(s) {
  const total = gpuCount(s);
  const lease = leaseGpus(s);
  const self = total - lease;
  const share = clamp(Number.isFinite(s.inferShare) ? s.inferShare : 0.3, 0.05, 0.9);
  const pool = self * share;
  const train = self - pool;
  const plan = genPlan(s);
  const gen = plan.eq > 0 && plan.perCard > 0 ? Math.min(pool, plan.eq / plan.perCard) : 0;
  const serve = pool - gen;
  return { total, leaseGpus: lease, selfGpus: self, inferGpus: pool, genGpus: gen, serveGpus: serve, trainGpus: train,
    leaseShare: total ? lease / total : 0, inferShare: total ? pool / total : 0, genShare: total ? gen / total : 0, serveShare: total ? serve / total : 0, trainShare: total ? train / total : 0 };
}

// ---------- 生成订单占的卡（规格 D7 的 F2–F4） ----------
// 卡的 H100 当量按推理能力折（A100 约 0.45 张 H100）；出租出去的卡不算。pool 是推理滑杆分到的那一份。
const HOPPER_UP = new Set(['H100', 'H800', 'H20', 'H200', 'B200', 'B300', 'Rubin']);
export function inferPool(s) {
  const cl = clusterGpus(s);
  const total = Object.values(cl).reduce((a, b) => a + b, 0);
  const self = total - leaseGpus(s);
  const raw = Object.entries(cl).reduce((a, [k, n]) => a + n * (GPU_INFER[k] || 0), 0);
  const eqAll = total > 0 ? raw * self / total : 0;
  const share = clamp(Number.isFinite(s.inferShare) ? s.inferShare : 0.3, 0.05, 0.9);
  return { total, self, eqAll, pool: eqAll * share, perCard: self > 0 ? eqAll / self : 0 };
}
// F4：生成最多能借的推理卡（H100 当量）= min(全部卡的 30%, 推理卡 − 全部卡的 5%)。
export function genBudget(s, ip = inferPool(s)) {
  return Math.max(0, Math.min(GEN.maxShare * ip.eqAll, ip.pool - GEN.keepInfer * ip.eqAll));
}
// F2：放下老师要几张卡（H100 当量）。有 fp8 技术、而且手里的卡全是 Hopper 及以后的，权重按 1 字节存，否则 2 字节。
export function genMinCards(s, totalB) {
  const cl = clusterGpus(s);
  const hopper = Object.entries(cl).every(([k, n]) => !n || HOPPER_UP.has(k));
  const bytes = (s.techs || []).includes('fp8') && hopper ? 1 : 2;
  return Math.max(1, Math.ceil(GEN.memOverhead * Math.max(0, totalB || 0) * bytes / 80));
}
// F1：生成要多少 H100·小时（A 是老师解码激活参数、N 是生成 token，都按十亿计；rho 是过采样倍数）。
export const genHours = (activeB, gTok, rho = GEN.rho.plain) => GEN.hPerGTok * Math.max(0, activeB || 0) * Math.max(0, gTok || 0) * rho;
// F3：照现在的卡，一张单要几天（放不下老师时是 Infinity）。
export function genDays(s, hours, nMin, budget = genBudget(s)) {
  if (!(budget > 0) || budget < nMin) return Infinity;
  return Math.max(GEN.minDays, Math.ceil(GEN.cleanupDays + hours / (24 * budget)));
}
// 今天每张生成单分到多少卡：按下单顺序，第一张放得下老师的单拿走全部预算，后面的排队（同一时间只跑一张）。暂停的、算完了的不占卡。
// wait 记分不到卡的原因：'queue' 是预算放得下老师、只是被前面一张占着；'nofit' 是预算本身放不下老师（< nMin）。
export function genPlan(s) {
  const list = (s.orders || []).filter(o => o.gen?.mode === 'gpu' && !o.gen.paused && o.gen.done < o.gen.need);
  if (!list.length) return { use: {}, wait: {}, eq: 0, perCard: 0, budget: 0 };
  const ip = inferPool(s);
  const budget = genBudget(s, ip);
  let left = budget, eq = 0;
  const use = {}, wait = {};
  for (const o of list) {
    if (left > 0 && left >= o.gen.nMin) { use[o.id] = left; eq += left; left = 0; } else {
      use[o.id] = 0;
      wait[o.id] = budget > 0 && budget >= o.gen.nMin ? 'queue' : 'nofit';
    }
  }
  return { use, wait, eq, perCard: ip.perCard, budget };
}
// al：当场的分卡账（allocJobs 已经算过一次时传进来，省得再算）。
export function trainFlops(s, al = null) {
  const health = 0.7 + 0.3 * s.health / 100;
  const adapt = s.due?.adapt > s.day ? 0.85 : 1;
  const poach = s.due?.poach > s.day ? 0.9 : 1;
  return rawFlops(s) * (al ?? gpuAllocation(s)).trainShare * health * modifier(s, 'train') * adapt * poach;
}
// 还要几个月；一张训练卡都分不到时返回 Infinity，界面显示“等待算力”。
const monthsFor = (need, flops) => (flops > 0 ? need / flops : Infinity);
export function inferGpuEq(s) {
  const eq = Object.entries(clusterGpus(s)).reduce((a, [k, n]) => a + n * (GPU_INFER[k] || 0), 0);
  // 服务能用的推理能力：推理份额里扣掉借给生成订单的那一桶。
  return eq * gpuAllocation(s).serveShare * (0.75 + 0.25 * s.health / 100);
}
// 每张 H100 每月能服务的 token：激活参数越小越便宜，架构与推理技术再打折。
export function tokensPerGpu(s, model) {
  const active = model?.active || 30;
  return 8e9 * Math.pow(37 / Math.max(active, 0.5), 0.8) * archOf(model || {}).speed * modifier(s, 'infer');
}
// 单个请求的生成速度（tokens/s）与每百万 token 的推理成本，用于模型档案展示。
export function modelSpeed(s, model) {
  return Math.round(70 * Math.pow(37 / Math.max(model.active || 30, 0.5), 0.35) * archOf(model).speed * Math.sqrt(modifier(s, 'infer')));
}
export function costPerMillion(s, model) {
  const rent = GPUS.H100.rent * (RENT_FACTOR[clamp(yearOf(s.date), 2023, 2026)] || 1);
  return rent / tokensPerGpu(s, model) * 1e6;
}

// ---------- 立项 ----------
// LLM：cfg = { total, active, arch, tokens }；其他模态：{ scaleId, tokens }。
// 重复语料（Muennighoff 等 2023 的指数饱和）：同一批语料练 E 遍，相当于多少遍新数据。E ≤ 1 不折算。
export const effectiveEpochs = E => (E <= 1 ? E : 1 + REPEAT_RSTAR * (1 - Math.exp(-(E - 1) / REPEAT_RSTAR)));
// 每个训练 token 的利用率 = 等效遍数 ÷ 实际遍数，乘在训练信号的质量上；算力仍按全部遍数付。没语料时兜底 0.3。
export function repeatEfficiency(poolTokens, trainTokens) {
  if (!Number.isFinite(trainTokens) || trainTokens <= 0) return 0;
  if (!Number.isFinite(poolTokens) || poolTokens <= 0) return 0.3;
  const E = trainTokens / poolTokens;
  return E <= 1 ? 1 : effectiveEpochs(E) / E;
}
// 预训练按哪个公式折算重复：LLM 用上面的；其他模态的“token”是归一化单位，没有文献可对照，先保持旧公式。
export function pretrainRepeat(s, poolTokens, tokens) {
  if (s.mod === 'llm') return repeatEfficiency(poolTokens, tokens);
  return poolTokens > 0 ? Math.min(1, Math.pow(poolTokens / tokens, 0.35)) : 0.3;
}
// 预训练完成时给的研发经验（规格 F6）。F 是有效训练 FLOPs（算力需求 × 重复利用率）；同一配方做过几次，收获按 1/√(n+1) 递减。
// 下限只给像样的训练：有效算力到 2e22（约 20 H100·月）才有 0.6，再少就线性降到 0，玩具模型拿不到经验。
export function pretrainCredit(total, F, previous = 0) {
  const k = KNOW_PRETRAIN;
  const workFactor = Math.max(-Math.expm1(-F / k.refFlops), k.floor * Math.min(1, F / k.floorFlops));
  const novelty = 1 / Math.sqrt(previous + 1);
  return { credit: (k.base + k.perDoubling * Math.log2(Math.max(1, total / 7))) * workFactor * novelty, workFactor, novelty };
}
// opts.eta = false：只算底座能力、算力需求和炸炉风险，不估工期（顾问、机器人挑配置时先比分数，入选的再用 baseEtaFor 估工期）。
// opts.pool、opts.riskEnv：同一份状态里反复预估时，传算好的 poolStats(s)、riskEnv(s)（顾问枚举候选底座用）。
export function previewProject(s, cfg, opts = {}) {
  const pool = opts.pool || poolStats(s);
  const tokens = cfg.tokens;
  const repeat = pretrainRepeat(s, pool.tokens, tokens);
  const quality = pool.quality * repeat;
  // 练几遍、相当于几遍新数据（界面显示用）。
  const epochs = pool.tokens > 0 ? tokens / pool.tokens : 0;
  let base, kcap, need, structure;
  if (s.mod === 'llm') {
    structure = { total: cfg.total, active: Math.min(cfg.active, cfg.total), arch: cfg.arch || (cfg.active < cfg.total ? 'moe' : 'dense') };
    ({ base, kcap } = llmBase(structure, tokens, quality, pool.mix, pool.quality));
    need = 6 * structure.active * 1e9 * tokens * 1e12;
  } else {
    const scale = scaleById(s.mod, cfg.scaleId);
    structure = cfgFromPreset(s.mod, scale);
    ({ base } = nonLlmBase(s.mod, scale, quality, pool.mix));
    need = scale.pretrainH100 * 1e21 * Math.max(0.6, tokens);
  }
  const risk = projectRisk(s, structure, opts.riskEnv);
  const minGpus = s.mod === 'llm' ? Math.ceil(structure.total * 16 / 80) : 8;
  const pv = { structure, tokens, quality, repeat, epochs, freshEpochs: epochs * repeat, base, kcap, need, risk, minGpus, fastest: fastestDays(s, structure) };
  return opts.eta === false ? pv : Object.assign(pv, baseEtaFor(s, pv));
}
// 工期按“加进作业表以后实际分到的卡”估（T2.2、T4.4）：卡再多也快不过最快天数；分不到最低卡（排队）是 Infinity。→ { months, days, cards }
// ctx：同一个循环里反复估的时候，传 jobs.js 的 allocCtx(s) 算好的底稿。
export function baseEtaFor(s, pv, ctx = null) {
  const hypo = { kind: 'pretrain', line: 'main', prio: 'high', pj: { type: 'pretrain', structure: pv.structure, need: pv.need, done: 0, tokens: pv.tokens } };
  const al = allocJobs(s, hypo, { ctx });
  const days = jobEta(s, hypo, al.extra);
  const cards = { min: Math.round(al.extra?.minCards ?? 0), want: Number.isFinite(al.extra?.wantCards) ? Math.round(al.extra.wantCards) : null, got: Math.round(al.extra?.cards ?? 0) };
  return { months: days / 30, days, cards };
}
// 进行中的底座类作业还要几个月（默认主线那一项）：和每天推进用同一个算法（jobs.js 的 jobEta）。分不到卡时是 Infinity，没有作业是 0。
export function projectEta(s, job = baseJob(s, 'main') || baseJob(s, null)) {
  return job ? jobEta(s, job) / 30 : 0;
}
// 项目进度（0–1）：算力跑完、并且满了流程下限才算 100%。
export const projectProgress = pj => (pj ? Math.min(1, pj.done / pj.need, pj.minDays ? (pj.elapsedDays || 0) / pj.minDays : 1) : 0);
// 炸炉风险里只和公司状态有关、和底座结构无关的几项。顾问一次要比几百个候选底座，算一遍传给 projectRisk。
export function riskEnv(s) {
  return {
    health: Math.max(0, (65 - s.health) / 120),
    // FP8 的方法还没公开到“开源”级别时，自己摸索更容易炸（规格 E5：不按日期，看这项技术的公开程度）。
    fp8: s.techs.includes('fp8') && techStatus(s, TECH_BY_ID.fp8).level !== 'open' ? 0.01 : 0,
    stability: modifier(s, 'stability'),
    // 技术积累越厚，越不容易炼炸。
    know: 1 - knowFx(s).risk,
  };
}
// 每月“炼炸”的概率：越大越容易出问题，MoE 路由不稳，集群健康度低时更糟。env 不传就现算（riskEnv）。
export function projectRisk(s, st, env = riskEnv(s)) {
  const size = s.mod === 'llm' ? Math.max(0, Math.log10(Math.max(st.total, 1) / 7)) : 0.3;
  let r = 0.02 + 0.035 * size + (ARCHS[st.arch]?.stable > 1 ? 0.025 * (ARCHS[st.arch].stable - 1) / 0.35 : 0);
  r += env.health;
  r += env.fp8;
  r *= env.stability;
  r *= env.know;
  return clamp(r, 0.02, 0.6);
}

// ---------- 蒸馏 ----------
// 老师可以是自家旗舰，也可以是别家开源模型（需要自己的算力）。学生越小，差距越大。
// 别家老师的快照：总参数、激活参数、结构统一取自 structureForRelease（规格 D7），立项后冻结在项目里。
// 开源发布的许可在第 8 列 tags 里：LP 宽松、LR 受限但可商用、LN 不可商用。
export const licenseOf = r => (r?.tags || []).find(t => t === 'LP' || t === 'LR' || t === 'LN') || null;
function rivalTeacher(f, r, dims = r.dims) {
  const st = structureForRelease('llm', r);
  return { id: f, name: r.name, date: r.date, day: r.day ?? null, relId: r.id ?? null, dims: { ...dims }, total: st.total, active: st.active, arch: st.arch,
    open: true, own: false, license: licenseOf(r) };
}
// 被污染（规格 D7）：tainted 而且没有靠 g_beyond 解除。
export const isTainted = m => !!m?.tainted && !m.untainted;
// 续训谱系（D7）：只认 { kind: 'finetune' } 这种对象；开局继承型号的 lineage 是命名用的型号名字符串，不算。
export const finetuneLineage = m => (m?.lineage && typeof m.lineage === 'object' && m.lineage.kind === 'finetune' ? m.lineage : null);
export function distillTeachers(s) {
  const own = liveModel(s);
  if (s.mod !== 'llm') return [];
  // 自家旗舰当老师：快照里带上它干不干净、蒸过谁、是不是续训来的，学生照样继承（D7 的自蒸馏）。
  const lin = finetuneLineage(own);
  const out = own ? [{ id: 'self', name: own.name, modelId: own.id, dims: { ...own.dims }, total: own.total, active: own.active, arch: own.arch, open: true, own: true,
    tainted: isTainted(own), teachers: isTainted(own) ? { ...(own.post?.teachers || {}) } : {}, lineage: lin ? { ...lin } : null }] : [];
  for (const f of Object.keys(FAMILIES)) {
    if (FAMILIES[f].mod !== 'llm' || isMine(s, f)) continue;
    // 开源老师 = familyBest(open:true)（规格 D1）：先筛开源再取最强，家族里更强的一款是闭源的，已经放出来的开源权重照样能用。
    const r = familyBest(s, f, s.day, { open: true });
    if (r) out.push(rivalTeacher(f, r, relDims(s, r)));
  }
  const byQ = (a, b) => qOf('llm', b.dims) - qOf('llm', a.dims);
  const top = out.sort(byQ).slice(0, 6);
  // 自家旗舰总在名单里，不会被六家更强的开源模型挤掉。
  if (own && !top.some(t => t.own)) top.push(out.find(t => t.own));
  return top;
}
// 按老师家族从历史目录取截至某个月底综合最强的开源一款，不受名单前六名的限制。旧档补老师快照用（G1-4）。
export function historyTeacher(fam, date) {
  if (FAMILIES[fam]?.mod !== 'llm') return null;
  const r = familyBest(null, fam, `${date}-31`, { open: true });
  return r ? rivalTeacher(fam, r) : null;
}
// 学生差距（D7，2026-10-21 决定第 6 项）：N_eff = min(总参^0.7 × 激活^0.3, 10 × 激活)；gapQ = max(2.5, 25 · N_eff^−0.55 · (D / 36T)^−0.2)。
export function studentGap(total, active, tokensT) {
  const g = DISTILL_GAP;
  const nEff = Math.min(Math.pow(total, 1 - g.activeW) * Math.pow(active, g.activeW), g.capMult * active);
  return Math.max(g.floor, g.k * Math.pow(Math.max(nEff, 1e-3), g.exp) * Math.pow(Math.max(tokensT, 1e-3) / g.refT, g.dataExp));
}
// Q 计入的各维一起往下减，直到 qOf ≤ limit（每维不低于 0）。出生护栏、蒸馏学生的整体上限、出生即被污染的新底座（projects.js）共用。
export function lowerQTo(mod, dims, limit) {
  const keys = Object.keys(Q_W[mod]);
  for (let i = 0; i < 10; i++) {
    const over = qOf(mod, dims) - limit;
    if (!(over > 1e-12)) break;
    const live = keys.filter(k => dims[k] > 0);
    const w = live.reduce((a, k) => a + Q_W[mod][k], 0);
    if (!(w > 0)) break;
    for (const k of live) dims[k] = Math.max(0, dims[k] - over / w);
  }
  return dims;
}
// 被污染模型的后训练整体上限 qCap = min(这些老师里最高的 q, 当前最强) − APPROACH；一位老师都查不到时按当前最强算。
function teachersCapQ(s, fams) {
  let tq = -Infinity;
  for (const f of fams) { const t = teacherRec(s, f); if (t && Number.isFinite(t.q)) tq = Math.max(tq, t.q); }
  const ws = worldSota(s)?.q ?? Infinity;
  const v = Math.min(tq > -Infinity ? tq : Infinity, ws);
  return v === Infinity ? Infinity : v - APPROACH;
}
// 第三个参数 { quality, teacher }：quality 不传时取 max(数据池质量, 1.6)；teacher 不传时从当天的名单里按 cfg.teacher 找。
// 旧写法第三个参数直接传老师快照（旧档迁移补快照）也认。
export function previewDistill(s, cfg, opts = null) {
  const o = opts && opts.dims ? { teacher: opts } : (opts || {});
  const t = o.teacher || distillTeachers(s).find(x => x.id === cfg?.teacher);
  if (!t || !cfg) return null;
  const tokens = cfg.tokens ?? 1.5;
  const st = { total: cfg.total, active: Math.min(cfg.active, cfg.total), arch: cfg.arch || (cfg.active < cfg.total ? 'moe' : 'dense') };
  if (![st.total, st.active, tokens].every(Number.isFinite) || st.active < 0.5 || tokens <= 0) return null;
  const quality = Number.isFinite(o.quality) ? o.quality : Math.max(poolStats(s).quality, 1.6);
  const kcap = knowledgeCap(st.total, quality);
  // 学生各维 ≤ 老师维 − 该维差距，还不超过知识容量 + 偏移；整体 ≤ min(老师 q, 当前最强) − 2.5。
  const gap = studentGap(st.total, st.active, tokens);
  const teacherQ = qOf('llm', t.dims);
  const ws = worldSota(s)?.q ?? null;
  const limit = Math.min(teacherQ, ws ?? Infinity) - DISTILL_GAP.floor;
  const dims = {};
  for (const [k, v] of Object.entries(t.dims)) {
    let d = v - gap * (DISTILL_GAP.dimMul[k] ?? 1) - (k === 'safety' ? 4 : 0);
    if (k !== 'safety') d = Math.min(d, kcap + kcapOffset(k));
    dims[k] = round1(clamp(d, 0, 95));
  }
  if (qOf('llm', dims) > limit) {
    lowerQTo('llm', dims, limit);
    for (const k of Object.keys(Q_W.llm)) if (dims[k] !== undefined) dims[k] = Math.max(0, Math.floor(dims[k] * 10 + 1e-9) / 10);
  }
  // 算力（D7）：学生 6·A学生·D + 老师给每个 token 跑一遍前向 2·A老师·D。立项后和预训练一样按天推进，拿同样的项目算力。
  // 工期 = max(7 天流程下限, 算力 ÷ 项目分到的卡) × distillTime 加成，不低于 7 天。
  const studentNeed = 6 * st.active * 1e9 * tokens * 1e12;
  const teacherNeed = 2 * t.active * 1e9 * tokens * 1e12;
  const mult = modifier(s, 'distillTime');
  const need = (studentNeed + teacherNeed) * mult;
  const minDays = Math.max(DISTILL_MIN_DAYS, Math.ceil(DISTILL_MIN_DAYS * mult));
  // 按“加进作业表以后实际分到的卡”估（T4.4）：最低卡要放下学生和老师（老师给 logits），分不到就是 Infinity。
  const hypo = { kind: 'distill', line: 'small', prio: 'high', pj: { type: 'distill', structure: st, need, done: 0, minDays, elapsedDays: 0, preview: { teacher: t } } };
  const it = allocJobs(s, hypo).extra;
  const computeMonths = monthsFor(need, it?.run ? trainFlops(s) * it.share * (1 + knowFx(s).pretrain) : 0);
  const months = Math.max(minDays / 30, computeMonths);
  // 项目实际占的训练卡（界面显示“约占 N 张卡”）。
  const gpus = Math.round(it?.cards ?? 0);
  const computeDays = computeMonths * 30;
  const days = Number.isFinite(computeDays) ? Math.max(minDays, Math.ceil(computeDays)) : Infinity;
  // 污染（D7）：别家老师蒸出来的学生被污染；自家老师被污染（含续训来的）时学生跟着被污染，继承老师的老师。
  // 被污染的学生之后后训练钳在 capQ = min(老师们里最高的 q, 当前最强) − APPROACH。
  const taint = t.own ? !!t.tainted : true;
  const capTeachers = t.own ? { ...(t.tainted ? t.teachers || {} : {}) } : { [t.id]: 1 };
  const own = t.own ? null : { q: teacherQ };
  const capQ = !taint ? null : own ? Math.min(teacherQ, ws ?? Infinity) - APPROACH : teachersCapQ(s, Object.keys(capTeachers));
  return { structure: st, dims, kcap, gap, need, studentNeed, teacherNeed, months, computeDays, days, minDays, gpus, quality, limit, teacherQ, worldQ: ws,
    taint, capQ: Number.isFinite(capQ) ? capQ : null, capTeachers, lineage: t.own && t.lineage ? { ...t.lineage } : null,
    teacher: { ...t, dims: { ...t.dims } }, tokens };
}
// 蒸馏基线（D7，给 D11 的社区之选用）：拿当天对玩家可见、许可 LP 或 LR 的最强开源发布当老师，
// 蒸一个和 snap 一样大的学生（BASE_TOKENS 万亿 token、数据质量 BASE_QUALITY），看能到多少 q。
// 没有可用的老师时返回 null：非语言模型（游戏里没有蒸馏），或语言模型当天没有 LP、LR 许可的可见开源发布。
export function distillBaseline(s, snap) {
  if (!s || s.mod !== 'llm' || !snap || !Number.isFinite(snap.total)) return null;
  let best = null, bq = -Infinity;
  for (const r of RELEASES) {
    if (r.mod !== 'llm' || !r.open || !(r.day <= s.day) || isMine(s, r.family)) continue;
    const lic = licenseOf(r);
    if (lic !== 'LP' && lic !== 'LR') continue;
    const d = relDims(s, r), q = qOf('llm', d);
    if (q > bq) { bq = q; best = rivalTeacher(r.family, r, d); }
  }
  if (!best) return null;
  const active = Number.isFinite(snap.active) ? Math.min(snap.active, snap.total) : snap.total;
  const pv = previewDistill(s, { teacher: best.id, total: snap.total, active, arch: snap.arch, tokens: EXPECT.BASE_TOKENS }, { quality: EXPECT.BASE_QUALITY, teacher: best });
  return pv ? qOf('llm', pv.dims) : null;
}

// ---------- 蒸馏数据与老师（D7 的状态读法） ----------
// s.data.teachers[fam]：每个家族只留最强的一条老师快照 { relId, name, day, dims, q, kind, license }。
// s.data.distill[cat]：{ [fam]: 等级 }，各位老师合计不超过 2.5。读的时候一律容错：旧档的平铺数字当作老师 legacy，坏值当作没有。
export function teacherRec(s, fam) {
  const t = s.data?.teachers?.[fam];
  if (t) return t;
  // 迁移之前（开发期存档）：旧 teacherCap 当作老师 legacy。
  if (fam === 'legacy' && s.data?.teacherCap && Object.keys(s.data.teacherCap).length) return { name: '早先蒸馏的数据', dims: { ...s.data.teacherCap }, q: qOf(s.mod, s.data.teacherCap), kind: 'api', license: null };
  return null;
}
export function distillLevels(s, cat) {
  const v = s.data?.distill?.[cat];
  if (v && typeof v === 'object') {
    const out = {};
    for (const [f, x] of Object.entries(v)) if (Number.isFinite(x) && x > 0) out[f] = x;
    return out;
  }
  return Number.isFinite(v) && v > 0 ? { legacy: v } : {};
}
// 弱老师（D7“第一次使用某位老师的数据前，如果这位老师弱于当前模型，弹出确认”）：老师的综合分低于这一代现在的综合分，
// 这一代又没用过它（m.post.teachers 里没有）、也没确认过（m.weakOk）。确认之前它的数据不计入 σ，等于对这位老师自动只用自有数据。
// 查不到快照的老师（旧档没有 teacherCap 的平铺等级）无从比较，照常用。
export function weakTeacher(s, m, fam) {
  if (!m || m.weakOk?.[fam] || (m.post?.teachers?.[fam] ?? 0) > 0) return false;
  const t = teacherRec(s, fam);
  return !!t && Number.isFinite(t.q) && t.q < qOf(m.mod ?? s.mod, m.dims || {});
}
// 这一代后训练某类数据时实际用到的蒸馏等级：“只用自有数据”打开时一位都不用；弱老师没确认前不用（held 里列出来给界面提示）。
export function usableLevels(s, m, cat) {
  const levels = {}, held = [];
  if (s.jobs?.ownOnly) return { levels, held };
  for (const [f, x] of Object.entries(distillLevels(s, cat))) (weakTeacher(s, m, f) ? held.push(f) : (levels[f] = x));
  return { levels, held };
}
// 被污染模型的上限（D7 applyGains）：各维 cap_k = min(自研上限, T_k − APPROACH + ownEdge_k)，整体 qCap。没被污染时返回 null。
// 安全维不跟老师比（老师的安全分和能力上限无关），照自研上限。
export function taintCaps(s, m, selfCaps = computeCaps(s, m)) {
  if (!isTainted(m)) return null;
  const fams = Object.keys(m.post?.teachers || {});
  const T = {};
  for (const f of fams) { const t = teacherRec(s, f); if (t) for (const [k, v] of Object.entries(t.dims || {})) if (Number.isFinite(v)) T[k] = Math.max(T[k] ?? -Infinity, v); }
  const caps = { ...selfCaps };
  for (const k of Object.keys(Q_W[m.mod ?? s.mod] || {})) {
    if (T[k] === undefined) continue;
    const ownEdge = OWN_EDGE * Math.min(1, (s.data?.post?.[dataCatOf(m.mod ?? s.mod, k)] ?? 0) / 2.5);
    caps[k] = Math.min(caps[k], T[k] - APPROACH + ownEdge);
  }
  return { caps, qCap: teachersCapQ(s, fams), T };
}
// 蒸馏出身的模型（有 m.distillation）后训练的上限（T2.4，修 D7 的漏洞）：每个 Q 计入维钳到“老师维 − 该维差距”，
// 差距是 m.distillation.gap × DISTILL_GAP.dimMul[k]；整体再钳到 min(老师 q, 当天 worldSota) − DISTILL_GAP.floor。不是蒸馏出身的返回 null。
export function distillCaps(s, m) {
  const d = m?.distillation;
  if (!d?.teacher?.dims) return null;
  const mod = m.mod ?? s.mod;
  const gap = Number.isFinite(d.gap) ? d.gap : studentGap(m.total || 7, m.active || m.total || 7, d.tokens ?? 1.5);
  const caps = {};
  for (const k of Object.keys(Q_W[mod] || {})) if (Number.isFinite(d.teacher.dims[k])) caps[k] = d.teacher.dims[k] - gap * (DISTILL_GAP.dimMul[k] ?? 1);
  const ws = worldSota(s)?.q ?? Infinity;
  return { caps, qCap: Math.min(qOf(mod, d.teacher.dims), ws) - DISTILL_GAP.floor };
}
// 合成上限（applyGains 第 1、2 步、postPreview 用）：自研上限、污染上限（taintCaps）、蒸馏出身的上限（distillCaps）取最严的。都没有时返回 null。
export function capsFor(s, m, selfCaps = computeCaps(s, m)) {
  const tc = taintCaps(s, m, selfCaps);
  const dc = distillCaps(s, m);
  if (!tc && !dc) return null;
  const caps = { ...(tc?.caps ?? selfCaps) };
  let qCap = tc?.qCap ?? Infinity;
  if (dc) {
    for (const [k, c] of Object.entries(dc.caps)) if (caps[k] !== undefined) caps[k] = Math.min(caps[k], c);
    qCap = Math.min(qCap, dc.qCap);
  }
  return { caps, qCap, T: tc?.T ?? null };
}
// 实际起作用的上限：没被污染、不是蒸馏出身就是自研上限。
export function effectiveCaps(s, m) {
  const self = computeCaps(s, m);
  return capsFor(s, m, self)?.caps ?? self;
}

// ---------- 难度曲线（规格 D6） ----------
// 每个维度的后训练数据类别（方向的 data）；冲顶力的数据项、污染上限的 ownEdge 都按它读。
const CAT_OF = Object.fromEntries(Object.entries(DIRECTIONS).map(([mod, list]) => [mod, Object.fromEntries(list.filter(d => d.main && !d.special).map(d => [d.main, d.data]))]));
export const dataCatOf = (mod, k) => CAT_OF[mod]?.[k] ?? null;
// 参照表按年份取，年内线性插值（2023 以前按 2023，2026 年以后插到 2027 为止）。
const yearOfDay = day => { const y = Number(day.slice(0, 4)); return y + daysBetween(`${y}-01-01`, day) / 365; };
const levelMult = l => (l <= 0 ? 0.55 : l < 1 ? 0.8 : l < 2 ? 1.05 : 1.2);
// 独门技术：玩家已掌握、对外还是 secret / proof 的技术（本模态）。
export function leadTechs(s) {
  return (s.techs || []).filter(id => { const t = TECH_BY_ID[id]; return t && t.mod === s.mod && ['secret', 'proof'].includes(techStatus(s, t).level); });
}
// 冲顶力 A = fComp · fData · fKnow · fLead（四样同时到位才有用，D6.2）。
export function effortOf(s, leads = leadTechs(s)) {
  const ref = s.mod === 'llm' ? 'llm' : 'other', y = yearOfDay(s.day);
  // 算力项：底座类作业占训练卡的份额越大，冲顶力越小；最多压到 25%（T4.6：max(1 − baseShareFree, 0.25)，和旧的“有项目 ×0.25”相同）。
  const flops = trainFlops(s) * compShare(s);
  const fComp = clamp(Math.sqrt(Math.max(0, flops) / (P().effortRef('train', ref, y) * 1e21)), ...EFFORT.COMP);
  let dq = 0;
  for (const [k, w] of Object.entries(Q_W[s.mod])) dq += w * (s.data?.post?.[dataCatOf(s.mod, k)] ?? 0);
  const fData = clamp(dq / 2, ...EFFORT.DATA);
  const fKnow = clamp(Math.max(0, s.know || 0) / P().effortRef('know', ref, y), ...EFFORT.KNOW);
  const fLead = 1 + EFFORT.LEAD_STEP * Math.min(EFFORT.LEAD_MAX, leads.length);
  return { A: Math.min(CURVE.A_MAX, fComp * fData * fKnow * fLead), fComp, fData, fKnow, fLead, leads };
}
// 技术储备 ρ = clamp(1 + ease)：策略上线后读特质（modifier 'sotaEase'）；还没有策略状态（P2.2 合入前、旧档迁移前）时按炼没炼出过回退：
// 炼出过 maker（1.6），开局 ○ 或局内“集团出过”kin（0.7），其余 rookie（0.45）。
export function easeOf(s) {
  if (s.strategy?.tree) return modifier(s, 'sotaEase');
  return sotaMade(s) ? SOTA_EASE.maker : s.sota?.seed === '○' || s.sota?.kin ? SOTA_EASE.kin : SOTA_EASE.rookie;
}
export const rhoOf = s => clamp(1 + easeOf(s), CURVE.RHO_MIN, CURVE.RHO_MAX);
// 贴线速度 F、越线衰减宽度 b、落后区宽度 W。
export function curveParams(A, rho) {
  const F = Math.min(CURVE.F_MAX, CURVE.F0 * rho * clamp((A - CURVE.A0) / (1 - CURVE.A0), 0, CURVE.A_MAX));
  return { F, b: CURVE.B0 * rho, W: CURVE.W0 / rho };
}
// 难度系数：落后时 1 − (1 − F)·e^(x/W)，越线以后 F·e^(−x/b)。x = 0 处两边都是 F，连续、单调不增。
export const curveH = (x, p) => (x <= 0 ? 1 - (1 - p.F) * Math.exp(x / p.W) : p.F * Math.exp(-x / p.b));
// 锚点 R、包络 E 只在对手表翻过一条发布（含自家史线前瞻的那条）、标签或“领先”变了的时候才变：按这些计数缓存，两次发布之间的日子直接取上次的值。
// 冲顶力每次现算（训练算力、数据、技术积累随时会变），只有“独门技术”按月缓存。
let DAYIX = null;
function dayIndex() {
  if (DAYIX?.src === RELEASES && DAYIX.ver === P().version()) return DAYIX;
  const all = {}, own = {};
  for (const r of RELEASES) {
    (all[r.mod] ??= []).push(r.day);
    (own[`${FAMILIES[r.family]?.org ?? r.family}|${r.mod}`] ??= []).push(r.day);
  }
  for (const list of [...Object.values(all), ...Object.values(own)]) list.sort();
  return (DAYIX = { src: RELEASES, ver: P().version(), all, own });
}
function countUpTo(list = [], day) {
  let lo = 0, hi = list.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid] <= day) lo = mid + 1; else hi = mid; }
  return lo;
}
// 和 sota.js 的 anchor 用同一个“领先”判定：正持有标签，或本模态还没有可见对手，或在练模型现在发布就能拿到标签。
function leadingNow(s) {
  if (s.sota?.holder?.by === 'me' || worldSota(s) === null) return true;
  const w = (s.models || []).find(m => m.id === s.working);
  return !!w && sotaWouldTake(s, qOf(s.mod, w.dims)) === true;
}
const ANCHOR_CACHE = new WeakMap(), LEAD_CACHE = new WeakMap();
function anchorPart(s) {
  const ix = dayIndex();
  const made = sotaMade(s);
  // “领先”只影响自家史线那一项（没炼出过的公司不计自家史线），所以只在炼出过时才算它（算一次要找当前最强、试算能不能拿标签）。
  const key = [P().version(), s.mod, countUpTo(ix.all[s.mod], s.day), made ? countUpTo(ix.own[`${orgOf(s)}|${s.mod}`], addDays(s.day, SOTA.HIST_LOOKAHEAD)) : -1,
    made && leadingNow(s) ? 1 : 0, made ? 1 : 0].join('|');
  const hit = ANCHOR_CACHE.get(s);
  if (hit && hit.key === key) return hit.val;
  const R = anchor(s), E = anchorEnv(s);
  const ws = worldSota(s)?.q ?? null, ho = histOther(s);
  const og = made ? ownHist(s) : null;
  // R 从哪来：对手最强（rival）、真实历史（hist，含自家史线）、临时锚（temp，这个模态还没有别家发布）。
  const src = ws !== null && Math.abs(R - ws) < 1e-9 ? 'rival' : ws === null && ho === null && og === null ? 'temp' : 'hist';
  const val = { R, E, src, ws };
  ANCHOR_CACHE.set(s, { key, val });
  return val;
}
function leadsCached(s) {
  const key = `${s.date}|${(s.techs || []).join(',')}|${Object.keys(s.techRead || {}).join(',')}`;
  const hit = LEAD_CACHE.get(s);
  if (hit && hit.key === key) return hit.val;
  const val = leadTechs(s);
  LEAD_CACHE.set(s, { key, val });
  return val;
}
function curveBase(s) {
  const eff = effortOf(s, leadsCached(s));
  const rho = rhoOf(s);
  return { ...anchorPart(s), ...eff, rho, ease: rho - 1, ...curveParams(eff.A, rho) };
}
// hardness(s, m)：难度曲线的全部读数 → { R, E, src, ws, A, fComp, fData, fKnow, fLead, leads, rho, F, b, W, q, delta, deltaK, H: {维: H_k}, Hq }。
// δ_k = max(δ, DIM_STEEP·(dims_k − E_k − DIM_SLACK))：一科比世界包络高出 DIM_SLACK 以后按 DIM_STEEP 倍折算（单维护栏）。A、F、H、δ 永远是有限数。
export function hardness(s, m = workingModel(s)) {
  const base = curveBase(s);
  const mod = m?.mod ?? s.mod;
  const dims = m?.dims || {};
  const q = qOf(mod, dims), delta = q - base.R;
  const H = {}, deltaK = {};
  for (const k of Object.keys(Q_W[mod])) {
    deltaK[k] = Math.max(delta, CURVE.DIM_STEEP * ((dims[k] ?? 0) - (base.E[k] ?? 0) - CURVE.DIM_SLACK));
    H[k] = curveH(deltaK[k], base);
  }
  return { ...base, q, delta, deltaK, H, Hq: curveH(delta, base) };
}

// ---------- 能力加分的唯一入口（规格 D7 applyGains） ----------
// 后训练、刷榜以外的所有 dims 加分（里程碑、史实、事件效果里的 dims）都要经过这里；后训练的 dailyFocus 传 preMixed（难度系数已经在 postPreview 的混合系数里）。
// 第 0 步：没混合过的正涨幅，Q 计入的维度乘 H_k；折成 Q 超过 GAIN_STEP 时按每段 ≤ GAIN_STEP 分段，每段按当时的 δ_k 算 H_k，写完再算下一段。
// 第 1 步：正涨幅逐维钳到 max(0, cap_k − dims_k)（被污染时 cap 还要跟老师比）；负涨幅照常生效；已有的 dims 永远不往下削。
// 第 2 步：被污染的模型整体钳在 qCap 前：一次加完会越过 qCap 时，所有正涨幅乘 f，每次只走剩余距离的一半，只会无限逼近。
// sigma、dshare、levels：这次涨幅里蒸馏那一份占多少、各位老师的数据等级，用来记 m.post（谁贡献了多少），并判定污染。
//   dshare（后训练传，postPreview 算的“蒸馏那一份占 mix_k 的比例”）：按实际贡献拆——各维写入的涨幅乘 dshare_k，按 Q 加权合计。
//   越线以后（fade = 0）蒸馏那一份一分没贡献，就一分不记，所以模型被污染的那一刻一定在 qCapD 以下（qCapD ≤ 当前最强 − APPROACH）。
//   没传 dshare 时按 sigma 记（别的来源都是 σ = 0）。
// 污染在这一步生效时，这一步的涨幅按污染上限重钳一遍：被污染的模型从第一天起就满足 q < qCap。
export function applyGains(s, m, gains, { preMixed = false, sigma = 0, dshare = null, levels = null } = {}) {
  if (!m || !gains) return { G: 0, applied: {} };
  const mod = m.mod ?? s.mod, QK = Q_W[mod];
  const before = { ...m.dims };
  const q0 = qOf(mod, m.dims);
  const pos = {}, neg = {};
  for (const [k, v] of Object.entries(gains)) {
    if (!Number.isFinite(v) || m.dims[k] === undefined) continue;
    if (v > 0) pos[k] = v;
    else if (v < 0) neg[k] = v;
  }
  let segs = 1;
  if (!preMixed) {
    const qg = Object.entries(pos).reduce((a, [k, v]) => a + (QK[k] || 0) * v, 0);
    segs = Math.max(1, Math.ceil(qg / CURVE.GAIN_STEP - 1e-9));
  }
  const write = () => {
    for (const [k, v] of Object.entries(neg)) m.dims[k] = clamp(m.dims[k] + v, 0, DIM_MAX);
    const selfCaps = computeCaps(s, m);
    const tc = capsFor(s, m, selfCaps);
    const caps = tc?.caps ?? selfCaps;
    for (let i = 0; i < segs; i++) {
      const hv = preMixed ? null : hardness(s, m).H;
      const g = {};
      for (const [k, v] of Object.entries(pos)) {
        let x = v / segs;
        if (hv && QK[k] !== undefined) x *= hv[k];
        g[k] = Math.min(x, Math.max(0, caps[k] - m.dims[k]));
      }
      if (tc && tc.qCap < Infinity) {
        const a = qOf(mod, m.dims);
        const b = qOf(mod, Object.fromEntries(Object.keys(QK).map(k => [k, (m.dims[k] ?? 0) + (g[k] ?? 0)])));
        if (b > tc.qCap) {
          const f = a >= tc.qCap ? 0 : 0.5 * (tc.qCap - a) / (b - a);
          for (const k of Object.keys(g)) g[k] *= f;
        }
      }
      for (const [k, x] of Object.entries(g)) if (x > 0) m.dims[k] = Math.min(DIM_MAX, m.dims[k] + x);
    }
    return Math.max(0, qOf(mod, m.dims) - q0);
  };
  // 这次涨幅里蒸馏那一份的比例：按各维实际写入的正涨幅加权。
  const shareNow = () => {
    if (!dshare) return sigma;
    let all = 0, dist = 0;
    for (const k of Object.keys(QK)) {
      const inc = (m.dims[k] ?? 0) - (before[k] ?? 0);
      if (!(inc > 0)) continue;
      all += QK[k] * inc;
      dist += QK[k] * inc * clamp(dshare[k] ?? 0, 0, 1);
    }
    return all > 0 ? dist / all : 0;
  };
  let G = write();
  const wasTainted = isTainted(m), post0 = m.post ? { ...m.post, teachers: { ...(m.post.teachers || {}) } } : null;
  recordPost(m, G, shareNow(), levels);
  if (!wasTainted && isTainted(m)) {
    const qc = taintCaps(s, m)?.qCap ?? Infinity;
    if (qOf(mod, m.dims) > qc) {
      Object.assign(m.dims, before);
      G = write();
      m.post = post0 ?? { own: 0, dist: 0, teachers: {} };
      recordPost(m, G, shareNow(), levels);
      m.tainted = true;
    }
  }
  const applied = {};
  for (const k of Object.keys(m.dims)) if (m.dims[k] !== before[k]) applied[k] = m.dims[k] - before[k];
  return { G, applied, q0, q1: qOf(mod, m.dims) };
}
// m.post 记“按 Q 加权累计的涨幅”：自有那一份、蒸馏那一份、各位老师各贡献多少；蒸馏那一份够多就判定被污染（终身有效，只有换新底座才清零）。
function recordPost(m, G, sigma, levels) {
  if (!(G > 0)) return;
  const p = (m.post ??= { own: 0, dist: 0, teachers: {} });
  p.teachers ??= {};
  const sg = clamp(Number.isFinite(sigma) ? sigma : 0, 0, 1);
  p.own += G * (1 - sg);
  if (sg > 0) {
    p.dist += G * sg;
    const D = Object.values(levels || {}).reduce((a, b) => a + b, 0);
    if (D > 0) for (const [f, x] of Object.entries(levels)) p.teachers[f] = (p.teachers[f] || 0) + G * sg * x / D;
  }
  if (!m.tainted && p.dist >= TAINT_MIN_DIST && p.dist / (p.own + p.dist) >= DISTILL_HEAVY) m.tainted = true;
}

// ---------- 底座出生护栏（规格 D6.5） ----------
// finishPretrain、续训完成写完 dims 后调用：Q 计入的各维不超过 E_k + DIM_SLACK；整体超过 R − BIRTH_GAP 的部分各维统一减掉（不低于 0）。
// m.base、m.kcap、上限都不动。新模型已经是在练模型时，“领先”的判定会跟着出生时的能力变，所以算到稳定为止（只会越钳越低）。
export function birthClamp(s, m) {
  if (!m?.dims) return m;
  if (P().birthMode(s, m) !== 'clamp') return m;
  const mod = m.mod ?? s.mod;
  for (let i = 0; i < 4; i++) {
    const R = anchor(s, { mod }), E = anchorEnv(s, { mod });
    const q0 = qOf(mod, m.dims);
    for (const k of Object.keys(Q_W[mod])) if (m.dims[k] !== undefined && Number.isFinite(E[k])) m.dims[k] = Math.max(0, Math.min(m.dims[k], E[k] + CURVE.DIM_SLACK));
    lowerQTo(mod, m.dims, R - CURVE.BIRTH_GAP);
    if (Math.abs(qOf(mod, m.dims) - q0) < 1e-12) break;
  }
  return m;
}

// ---------- 后训练 ----------
export function directionsFor(s) {
  return DIRECTIONS[s.mod].filter(d => unlocked(s, d) && !d.special);
}
// 针对榜单训练：分数涨，真实能力几乎不涨；换新题后作废。
// model：要刷的模型（默认主线在练模型）；avail：这项作业当场的算力（不给就按作业表估，见 jobs.js 的 postAvail）。
export function benchmaxPreview(s, benchId, model = null, avail = null) {
  const m = model || workingModel(s);
  const b = BENCH_BY_ID[benchId];
  if (!m || m.stage !== 'post' || !b || b.mod !== s.mod || s.date < b.from || b.kind === 'elo' && !b.refresh) return null;
  const cur = validBoost(m, b, s.date);
  // 私有题集刷不动：题目拿不到，只能练同类题。
  const leak = b.leak ?? 1;
  const gain = round1(Math.max(0.3, (6 - cur * 0.5) * (0.25 + 0.75 * leak)));
  // 一张训练卡都分不到时停着：不涨分、不攒发布天数、不累集群。
  const a = avail ?? postAvail(s, m, null);
  return { bench: b, gain, current: cur, health: -8, leak, paused: !(a > 0) };
}
export function validBoost(model, b, date) {
  const x = model.boost?.[b.id];
  return x && x.since >= lastRefresh(b, date) ? x.pts : 0;
}
// 一个方向练一个月大约涨多少（规格 D6.3、D7）。
// 自有数据 O、蒸馏数据 D（“只用自有数据”打开时 D = 0；比这一代弱、还没确认的老师不算，见 weakTeacher），σ = D / (O + D)。
// raw：原公式（主维 (cap − cur) · rate · eff₀，副维按 side 系数），eff₀ 不再含数据档位。
// 混合系数 mix_k = (1 − σ)·levelMult(O)·H_k + σ·levelMult(min(2.5, O + D))·SPEED·fade·(1 + 0.1σ)：
//   自有那一份吃难度曲线；蒸馏那一份不吃，但在 qCapD = min(本类数据的老师里最强的 q, 当前最强) − APPROACH 前 ZONE 分内线性收口。
//   安全维：mix = levelMult(min(2.5, O + D))，不拆分、不乘 H。
// opts.model：要练的模型（默认主线在练模型；上一代收尾、待发布的小模型也能算）；opts.avail：这项作业当场的算力
// （postTick 传实得算力 F_j；不给就按作业表估：有这项作业而且在跑就是它当场的份额，否则按假想的一项估，见 jobs.js 的 postAvail）。
export function postPreview(s, dirKey, { model = workingModel(s), avail = null } = {}) {
  const dir = DIRECTIONS[s.mod].find(d => d.key === dirKey);
  if (!model || !dir || !unlocked(s, dir)) return null;
  const selfCaps = computeCaps(s, model);
  const tc = capsFor(s, model, selfCaps);
  const caps = tc?.caps ?? selfCaps;
  const O = s.data.post?.[dir.data] ?? 0;
  const { levels, held } = usableLevels(s, model, dir.data);
  const D = Object.values(levels).reduce((a, b) => a + b, 0);
  const sigma = O + D > 0 ? D / (O + D) : 0;
  const moraleMult = 1 + 0.1 * s.morale;
  const needPerMonth = (dir.rl ? 6 * (model.active || 3) * 1e9 * 4e11 : 6 * (model.active || 3) * 1e9 * 6e10) * (s.mod === 'llm' ? 1 : 0.02);
  // 后训练分到的算力：读作业的分卡（T4.2）。底座和后训练都没封顶时按 3:1 分。没有保底：一张卡都没有就不涨。
  const got = Number.isFinite(avail) ? avail : postAvail(s, model, dirKey);
  const computeMult = clamp(Math.sqrt(got / needPerMonth), 0, 1.2);
  const rate = dir.rl ? 0.17 : 0.2;
  const eff0 = moraleMult * computeMult * modifier(s, `post.${dir.main}`) * (1 + knowFx(s).post);
  const hd = hardness(s, model);
  const q = hd.q;
  let qCapD = -Infinity;
  if (D > 0) {
    let tq = -Infinity;
    for (const f of Object.keys(levels)) { const t = teacherRec(s, f); if (t && Number.isFinite(t.q)) tq = Math.max(tq, t.q); }
    const ws = hd.ws ?? Infinity;
    qCapD = tq > -Infinity ? Math.min(tq, ws) - APPROACH : ws - APPROACH;
  }
  const fade = clamp((qCapD - q) / DISTILL_MIX.ZONE, 0, 1);
  const QK = Q_W[s.mod];
  // 蒸馏那一份；dshare_k = 它占 mix_k 的比例（记 m.post 时按这个拆“蒸馏贡献了多少”，fade = 0 时为 0）。
  const distOf = k => (QK[k] === undefined ? 0 : sigma * levelMult(Math.min(2.5, O + D)) * DISTILL_MIX.SPEED * fade * (1 + 0.1 * sigma));
  const mixOf = k => (QK[k] === undefined ? levelMult(Math.min(2.5, O + D)) : (1 - sigma) * levelMult(O) * hd.H[k] + distOf(k));
  const shareOf = k => (mix[k] > 0 ? distOf(k) / mix[k] : 0);
  const cur = model.dims[dir.main];
  const rawMain = Math.max(0, (caps[dir.main] - cur) * rate * eff0);
  const raw = { [dir.main]: rawMain };
  const mix = { [dir.main]: mixOf(dir.main) };
  const gains = { [dir.main]: rawMain * mix[dir.main] };
  const dshare = { [dir.main]: shareOf(dir.main) };
  for (const [k, c] of Object.entries(dir.side)) {
    if (!dimUnlocked(s, s.mod, k)) continue;
    raw[k] = rawMain * c;
    mix[k] = mixOf(k);
    dshare[k] = c > 0 ? shareOf(k) : 0;
    gains[k] = c > 0 ? Math.min(raw[k] * mix[k], Math.max(0, caps[k] - model.dims[k])) : raw[k];
  }
  const fail = Math.round(clamp((50 - s.health) * 1.8 + (model.total > 300 ? 3 : 0), 0, 90));
  return { dir, gains, raw, mix, dshare, caps, selfCaps, qCap: tc?.qCap ?? null, fail, dataLevel: O, distLevel: D, levels, held, sigma, useDistill: sigma > 0, dataMult: levelMult(O),
    computeMult, qCapD: D > 0 ? qCapD : null, fade, curve: hd, paused: !(got > 0), avail: got, needPerMonth, health: dir.rl ? -15 : -11 };
}

// ---------- 跑分 ----------
export function suiteFor(s, date = s.date) {
  return BENCHMARKS.filter(b => b.mod === s.mod && b.suite && date >= b.suite[0] && date <= b.suite[1] && date >= b.from && (!b.cnOnly || s.company.country === 'CN'));
}
function benchX(b, dims, cnAdj = 0) {
  let x = 0;
  // for…in 和 Object.entries 的顺序一样（求和顺序不变），但不用每次新建数组：一天要调几万次。
  for (const k in b.w) x += b.w[k] * (dims[k] || 0);
  if (b.cn) x += cnAdj;
  return x;
}
export function scoreFromX(b, x) {
  if (b.kind === 'elo') return Math.round(b.base + b.k * x);
  const t = sigmoid((x - b.mid) / b.s);
  if (b.kind === 'lower') return round1(b.hi - (b.hi - b.lo) * t);
  if (b.kind === 'score10' || b.kind === 'score5') return Math.round((b.lo + (b.hi - b.lo) * t) * 100) / 100;
  return round1(b.lo + (b.hi - b.lo) * t);
}
export const lowerIsBetter = b => b.kind === 'lower';
// 榜单越老，见过题的模型越多，分数越虚；换新题后清零。新榜单更能体现真实能力。
export function contamination(b, rel, date) {
  const last = lastRefresh(b, date);
  if (rel.date < last) return 0;
  const age = monthsBetween(last, rel.date);
  const gamer = 0.3 + 0.9 * hash01(`${rel.family}|gaming`);
  return gamer * (b.leak ?? 1) * clamp(age / 6, 0, 4);
}
// 区分度很高（曲线陡）的基准，同样的随机波动会被放大，所以按斜率缩小噪声。
const noiseScale = b => (b.s ? clamp(b.s / 5, 0.35, 1) : 1);
export function rivalScore(b, rel, date = rel.date) {
  const fixed = P().benchOf(rel, b.id);
  if (fixed !== null && fixed !== undefined) return fixed;
  const cnAdj = FAMILIES[rel.family].region === 'cn' ? b.cn || 0 : -(b.cn ? 5 : 0);
  const noise = (hash01(`${rel.name}|${b.id}`) - 0.5) * 3 * noiseScale(b);
  return scoreFromX(b, benchX(b, rel.dims, cnAdj) + noise + contamination(b, rel, date));
}
export function playerScore(s, b, model, noise = 0) {
  const cnAdj = b.cn ? (s.company.country === 'CN' ? b.cn : -5) + 20 * ((model.cn || 0) - 0.1) : 0;
  return scoreFromX(b, benchX(b, model.dims, cnAdj) + noise + validBoost(model, b, s.date));
}
// 跑一次评测：得分、做对的题数、花费。
export function runBenchmark(s, benchId, model, opts = {}) {
  const b = BENCH_BY_ID[benchId];
  const noise = (rand(s) - 0.5) * 2.4 * noiseScale(b) + (opts.arenaVariant ? 3.5 : 0);
  const score = playerScore(s, b, model, noise);
  const solved = b.kind === 'pct' || b.kind === 'lower' ? Math.round(score / 100 * b.items) : null;
  const tokensPerItem = s.mod === 'llm' ? (s.techs.includes('reasoning') ? 9000 : 1500) : 1;
  const cost = s.mod === 'llm' ? Math.round(b.items * tokensPerItem * 1e-6 * costPerMillion(s, model) * 3 + 500) : Math.round(b.items * 0.05 + 300);
  return { bench: b, benchId, score, solved, cost, model: model.name, modelId: model.id, role: model.role || 'flagship', cls: clsOf(model), date: s.date, day: s.day, variant: !!opts.arenaVariant };
}

// ---------- 排行榜（规格 D1.1） ----------
// 对手行只看对手表，按（基准, 天, 量级）缓存；换对手表（setReleases）时整个清掉，攒太多也清掉重来。
const CACHE_MAX = 5000;
const cache = { rel: null, board: new Map() };
function memo(map, key, make) {
  if (cache.rel !== RELEASES) { cache.rel = RELEASES; cache.board.clear(); }
  if (map.has(key)) return map.get(key);
  if (map.size >= CACHE_MAX) map.clear();
  const v = make();
  map.set(key, v);
  return v;
}
// 榜单日期：不写就是今天；写月份时，本月就是今天，别的月份按那个月 1 号（董事会在 1 号考核）。
const boardDay = (s, date) => (!date ? s.day : date.length > 7 ? date : date === s.date ? s.day : `${date}-01`);
// 对手行：每个 org 一行，取这家截至当天在这个基准上分数最高的一款（benchBest）；总榜上这款不是这家的综合旗舰（orgBest）时，名字后标“（非旗舰）”。
// 量级榜先按量级筛、只收 BOARD_WINDOW_DAYS 天内的发布，再在每家里取最高。旗舰判定用对手表的原始能力（缓存跨局共用）。
function rivalRows(b, day, cls) {
  return memo(cache.board, `${P().version()}|${b.id}|${day}|${cls ?? ''}`, () => {
    const rows = [];
    const month = day.slice(0, 7);
    for (const org of orgsOf(b.mod)) {
      if (P().isNpc(org)) continue;
      const rel = benchBest(null, org, b.id, day, { cls });
      if (!rel) continue;
      const side = !cls && orgBest(null, org, b.mod, day) !== rel;
      rows.push({ name: side ? `${rel.name}（非旗舰）` : rel.name, model: rel.name, flagship: !side, family: rel.family, org, company: FAMILIES[rel.family].company,
        cls: rel.cls, open: rel.open, score: rivalScore(b, rel, month), date: rel.date, day: rel.day, price: rel.price });
    }
    return rows;
  });
}
const runDay = run => run.day ?? `${run.date}-01`;
// 玩家一行：已发布的各款模型（m.benchmarks，按 modelId 找模型）和旧档的 s.published 里，换题以后、不晚于榜单日期的最好成绩。
// 量级榜只收这个量级、BOARD_WINDOW_DAYS 天内发布的模型的成绩。playerModel（modelId）给出时只看这一款自己的成绩（发布回执、官方评测报的是它的名次）。
function playerRows(s, b, day, opts) {
  const lower = lowerIsBetter(b);
  const month = day.slice(0, 7);
  const since = lastRefresh(b, month);
  const runs = s.models.filter(m => m.stage === 'released' && m.benchmarks?.[b.id]).map(m => m.benchmarks[b.id]);
  for (const key of [b.id, `${b.id}@small`]) if (s.published?.[key]) runs.push(s.published[key]);
  let best = null;
  for (const run of runs) {
    if (run.date < since || run.date > month || runDay(run) > day) continue;
    const m = run.modelId ? s.models.find(x => x.id === run.modelId) : null;
    if (opts.playerModel && run.modelId !== opts.playerModel) continue;
    if (opts.cls) {
      if (run.cls !== opts.cls) continue;
      const rd = m?.releasedDay ?? (m?.released ? `${m.released}-15` : null);
      if (rd && daysBetween(rd, day) > BOARD_WINDOW_DAYS) continue;
    }
    if (!best || (lower ? run.score < best.score : run.score > best.score) || (run.score === best.score && run.date > best.date)) best = run;
  }
  if (!best) return [];
  const m = best.modelId ? s.models.find(x => x.id === best.modelId) : null;
  return [{ name: best.model, modelId: best.modelId || null, family: s.charId, org: orgOf(s), company: s.company.company, cls: best.cls, open: !!m?.open, score: best.score, date: best.date, mine: true, role: best.role }];
}
// 排行榜：对手每个 org 一行 + 玩家一行。同分同名次（1、1、3）。
export function leaderboard(s, benchId, opts = {}) {
  const b = BENCH_BY_ID[benchId];
  const day = boardDay(s, opts.date);
  const lower = lowerIsBetter(b);
  const list = rivalRows(b, day, opts.cls).filter(r => !isMine(s, r.family)).map(r => ({ ...r }));
  list.push(...playerRows(s, b, day, opts));
  list.sort((a, b2) => (lower ? a.score - b2.score : b2.score - a.score));
  list.forEach((r, i) => { r.rank = i > 0 && r.score === list[i - 1].score ? list[i - 1].rank : i + 1; });
  return { bench: b, rows: list };
}
// modelId 给出时报这一款自己的名次；不给就是玩家这一行（各款里最好的成绩）。tied 是同名次的行数（含自己）。
// role 参数留着兼容旧调用：榜上玩家只有一行，不再分旗舰和小模型。
export function myRank(s, benchId, cls = null, role = 'flagship', modelId = null) {
  const lb = leaderboard(s, benchId, { cls, playerModel: modelId });
  const me = lb.rows.find(r => r.mine);
  return me ? { rank: me.rank, of: lb.rows.length, tied: lb.rows.filter(r => r.rank === me.rank).length, model: me.name } : null;
}
// 小团队只和同量级比。
export function peerCls(s) {
  const m = liveModel(s) || workingModel(s);
  return s.company.tier === 'small' && m ? clsOf(m) : null;
}
export { addMonths };
