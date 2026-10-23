// 自动对局机器人：按“正常玩家”的思路玩完一局，用于测试和平衡校准。
// 不追求最优，只做明显合理的事：处理事件、研究技术、按负载扩容、开训练作业（底座、后训练、试验、小模型线）、送评。
// 时间按天走；机器人每 7 天看一次局面做决定（像真人隔一阵暂停一下）。
import * as E from 'file:///Volumes/ESD-EPA/atonelia-scratch/p42/pro2/mrp/src/career/engine.js';
import { TECHS, GPUS, PARAM_TOTALS, PARAM_ACTIVES, SCALES, DIRECTIONS, PRICE_TIERS, monthsBetween, gpuAvailable } from 'file:///Volumes/ESD-EPA/atonelia-scratch/p42/pro2/mrp/src/career/data/core.js';
import { DATASETS } from 'file:///Volumes/ESD-EPA/atonelia-scratch/p42/pro2/mrp/src/career/data/datasets.js';
import { BENCH_BY_ID } from 'file:///Volumes/ESD-EPA/atonelia-scratch/p42/pro2/mrp/src/career/data/benchmarks.js';
import { playerScore, dataCatOf, MAX_EPOCHS } from 'file:///Volumes/ESD-EPA/atonelia-scratch/p42/pro2/mrp/src/career/sim/model.js';
import { addDays } from 'file:///Volumes/ESD-EPA/atonelia-scratch/p42/pro2/mrp/src/career/sim/clock.js';
import { BOT } from 'file:///Volumes/ESD-EPA/atonelia-scratch/p42/pro2/mrp/src/career/data/balance.js';
import { sotaMade, Q_W } from 'file:///Volumes/ESD-EPA/atonelia-scratch/p42/pro2/mrp/src/career/sim/sota.js';
import { pickStrategy, wantsDistill, distillTeacher, shouldHold, grantWindow, grantGap } from 'file:///Volumes/ESD-EPA/atonelia-scratch/p42/pro2/mrp/src/career/sim/strategy_ai.js';
import { grantsFor } from 'file:///Volumes/ESD-EPA/atonelia-scratch/p42/pro2/mrp/src/career/sim/naming.js';
import { P } from 'file:///Volumes/ESD-EPA/atonelia-scratch/p42/pro2/mrp/src/career/sim/provider.js';

// 最近一个要考榜单的里程碑：玩家会盯着它练。
// 也会顺带照顾下一个榜单目标（权重减半），像真人一样提前准备。
function goalFocus(s) {
  const [g, g2] = s.goals.filter(x => x.status === 'pending' && (x.check.type === 'bench' || x.check.type === 'rank')).sort((a, b) => a.date.localeCompare(b.date));
  if (!g) return null;
  const b = BENCH_BY_ID[g.check.bench];
  const w = { ...b.w };
  if (g2 && monthsBetween(s.date, g2.date) <= 14) for (const [k, v] of Object.entries(BENCH_BY_ID[g2.check.bench].w)) w[k] = (w[k] || 0) + 0.5 * v;
  return { g, b, w, months: monthsBetween(s.date, g.date) };
}
const est = (s, b, m) => (m && s.date >= b.from ? playerScore(s, b, m) * (b.kind === 'lower' ? -1 : 1) : -1e9);

// 明显不负责任的选项（偷偷降智、否认、放任反代等）机器人不选。
const AVOID = new Set(['quant_secret', 'deny', 'partial', 'ignore', 'welcome', 'overseas', 'free', 'defend']);

// 带 distill 标记的选项（下载别家权重做蒸馏，规格 A10）：只在 wantsDistill 为真、老师就是卡上那一家时选；
// 否则选同一事件里不带标记的选项（还是“第一个不在 AVOID 里的”）。别的事件照旧。“已被抢先”这类提示直接关掉。
function defaultChoice(s, opts) {
  const d = opts.find(o => o.distill);
  if (d && wantsDistill(s, s.queue[0]?.fam ?? s.queue[0]?.params?.family ?? null)) return d;
  const plain = opts.filter(o => !o.distill);
  return plain.find(o => !AVOID.has(o.id)) || plain[0] || opts[0];
}
export function resolveAll(s, pick) {
  let guard = 0;
  while (s.queue.length && s.status === 'playing' && guard++ < 50) {
    const ev = E.currentEvent(s);
    const opts = ev.choices.filter(c => !c.disabled);
    let c = pick?.(ev, opts) || defaultChoice(s, opts);
    if (ev.id === 'e429') c = opts.find(o => o.id === 'rent') || c;
    if (ev.id === 'lawsuit') c = opts.find(o => o.id === 'remediate') || c;
    globalThis.__G1?.card?.(s, ev); E.resolveEvent(s, c.id);
  }
}
// 让时间走 n 天（途中有事件就处理掉）。测试用。
export function advance(s, days, pick) {
  for (let i = 0; i < days && s.status === 'playing'; i++) { resolveAll(s, pick); E.tickDay(s); globalThis.__G1?.day?.(s); }
  resolveAll(s, pick);
}
// 走到下个月 1 号。
export function advanceMonth(s, pick) {
  const start = s.date;
  for (let i = 0; i < 40 && s.status === 'playing' && s.date === start; i++) { resolveAll(s, pick); E.tickDay(s); globalThis.__G1?.day?.(s); }
  resolveAll(s, pick);
}

function techValue(t, focus) {
  const e = t.effects || {};
  let v = 1 + Object.keys(e.cap || {}).length * 0.5 + Object.keys(e.post || {}).length * 0.5;
  for (const k of [...Object.keys(e.cap || {}), ...Object.keys(e.post || {})]) v += 4 * (focus?.w[k] || 0);
  if (t.id === 'reasoning') v += 6;
  if (t.id === 'agentic_rl' || t.id === 'moe') v += 3;
  return v;
}
function freeOps(s) {
  const focus = goalFocus(s);
  // 研究槽空着就排上最划算的一项（有用程度 ÷ 要花的时间）。
  while (s.research.length < E.researchSlots(s)) {
    const opt = E.researchOptions(s).filter(x => x.check.ok && (x.st.level !== 'secret' || techValue(x.t, focus) >= 6)).sort((a, b) => techValue(b.t, focus) / b.need - techValue(a.t, focus) / a.need)[0];
    if (!opt) break;
    E.researchTech(s, opt.t.id);
  }
  const sv = s.service.last;
  if (sv && sv.util > 0.9) s.inferShare = Math.min(0.85, s.inferShare + 0.08);
  if (sv && sv.util < 0.45 && s.inferShare > 0.15) s.inferShare -= 0.05;
  // 负载高就加租（同一个月只租一次，等卡开通）。
  if (sv && sv.util > 0.8 && s.flags.botRentAt !== s.date) {
    const g = E.bestRentGpu(s);
    const per = GPUS[g].infer * s.inferShare;
    const n = Math.max(32, Math.ceil(((sv.needGpu - sv.capGpu * 0.75) / Math.max(per, 0.05)) / 32) * 32);
    if (s.cash > n * GPUS[g].rent * 8) { try { E.buyGpu(s, g, n, true); s.flags.botRentAt = s.date; } catch { /* 租不到就算了 */ } }
  }
  // 资本：现金撑不过一年半就融资；手里钱多就扩充训练算力（每半年最多一次）。
  const last = s.history.at(-1);
  const burn = Math.max(1, (last?.costs || 0) - (last?.revenue || 0));
  if (s.company.kind !== 'division' && !s.capital.round && s.cash < burn * 18) {
    // 有战略投资报价就先拿它（还附带一年的租卡折扣）；上市以后改成增发 10%（规格 K4）。
    const offers = E.fundingOffers(s);
    const offer = offers.find(o => o.strategic) || offers.find(o => o.dilution === (s.capital.listed ? 0.1 : 0.15));
    if (offer) { try { E.startFunding(s, offer.dilution); } catch { /* 谈不成 */ } }
    // 融资谈不了（泡沫、冷却）又撑不过半年：拿显卡抵押借钱，借够半年的开销。
    else if (s.cash < burn * 6 && E.borrowLimit(s) > 0) { try { E.borrow(s, burn * 6 - Math.max(0, s.cash)); } catch { /* 借不到 */ } }
  }
  if (E.ipoCheck(s).ok && P().gate('botIpo', s)) { try { E.startIpo(s); } catch { /* 条件变化 */ } }
  if (!s.flags.botGpuAt || s.monthsPlayed - s.flags.botGpuAt >= 6) {
    const covered = (last?.revenue || 0) >= (last?.costs || 0) * 0.3;
    const budget = s.company.kind === 'division' ? s.cash * 0.25 : s.company.tier === 'small' && !covered ? 0 : s.cash - burn * 12;
    const g = ['Rubin', 'B300', 'B200', 'H200', 'H100', 'Ascend950', 'Ascend910C', 'H20', 'Ascend910B', 'A100'].find(id => gpuAvailable(id, s.date, s.company.country));
    if (g && budget > GPUS[g].price * 512) {
      const n = Math.min(8192, Math.floor(budget * 0.5 / GPUS[g].price / 256) * 256);
      if (n >= 256) { try { E.buyGpu(s, g, n); s.flags.botGpuAt = s.monthsPlayed; } catch { /* 现金不足或配额用完 */ } }
    }
  }
  for (const pid of Object.keys(s.products)) {
    if (pid !== 'gpu_lease' && !s.products[pid].on) { try { E.setProduct(s, pid, { on: true }); } catch { /* 条件不够 */ } }
  }
  // 定价：新产品上线后，按当前模型和对手把档位调到“收入 − 推理成本”最高的一档，每月最多算一次。
  // 机器人以前一直停在开局那时史实发布的价格档，模型换代、对手变强以后也不会调，白白漏掉收入。
  // 正常公司会跟着自己的竞争力定价：卖得动才提价，卖不动就降到普惠档走量；这里用服务预览逐档试算，不写死某家公司。
  const month = s.date.slice(0, 7);
  if (s.flags.botPriceMonth !== month) {
    s.flags.botPriceMonth = month;
    for (const pid of Object.keys(s.products)) {
      const p = s.products[pid];
      if (pid === 'gpu_lease' || !p.on) continue;
      let best = p.tier || 'standard', bestVal = -Infinity;
      for (const tier of (pid === 'api' && grantApiTiers(s)) || Object.keys(PRICE_TIERS)) {
        // 预览不改状态，也不动随机数；只比这一个产品的档位，其他产品保持现状。
        const pv = E.previewService(s, { [pid]: { tier } });
        const val = (pv.revenue?.[pid] || 0) - (pv.serve || 0);
        if (val > bestVal) { bestVal = val; best = tier; }
      }
      if (best !== p.tier) { try { E.setTier(s, pid, best); } catch { /* 档位没变或条件不够 */ } }
    }
  }
}

// 手里还有效的授名在世界条件里规定了 API 价格档（GPT-4o、Claude 3.5 Sonnet 要普惠或标准档）：定价时 API 只在这些档里挑，
// 像真实公司为那一代旗舰主动降价（A10 授名时机：电脑会去满足手里授名的条件）。授名用掉、作废或过期以后照常按贡献定价。
// 几条授名都有要求时取交集；交集为空就不限制。
function grantApiTiers(s) {
  let allowed = null;
  for (const hn of [...grantsFor(s, 'flagship'), ...grantsFor(s, 'small')]) {
    const t = hn.world?.service?.apiTier;
    if (!t) continue;
    const list = Array.isArray(t) ? t : [t];
    allowed = allowed ? allowed.filter(x => list.includes(x)) : list;
  }
  return allowed?.length ? allowed : null;
}

// ---------- 训练作业（规格 T9.1）：取代原来的 planProject 和每周选团队任务，仍然每 7 天决定一次 ----------
const BIG = s => ['frontier', 'bigtech'].includes(s.company.tier);
const MAJOR = s => BIG(s) || s.company.tier === 'major';
const filingPending = s => s.company.country === 'CN' && s.mod === 'llm' && P().gate('cnFiling', s) && s.service.filing !== 'done';
// 手里有效授名对结构的要求（arch、参数规模、激活参数、技术）。主线底座只看旗舰授名；多个都有要求时取到期最早的。
// 没有这样的授权返回 null。
const STRUCT_KEYS = ['arch', 'minTotal', 'maxTotal', 'maxActive', 'techs'];
function grantStructure(s) {
  const list = [];
  for (const hn of grantsFor(s, 'flagship')) {
    const mc = hn.model || {}, req = {};
    for (const k of STRUCT_KEYS) if (mc[k] !== undefined) req[k] = mc[k];
    if (!Object.keys(req).length) continue;
    list.push({ req, until: s.strategy?.rights?.[hn.id]?.until ?? null });
  }
  list.sort((a, b) => String(a.until ?? '').localeCompare(String(b.until ?? '')));
  return list[0]?.req ?? null;
}
const asList = v => (Array.isArray(v) ? v : [v]);
// 结构候选的两条常识线：MoE 的激活参数至少总参数的 1/11（V2 的 21/236 就在这条线上），避免为了“省算力”挑 671B/0.5B
// 这种训不出东西的搭配；token 配方固定按机器人惯用的 200× 激活参数估（结构之间只比规模，不靠少喂数据来省）。
const MOE_ACTIVE_FLOOR = 11, STRUCT_TOKEN_MULT = 200;
// 底座的 token 配方：激活参数的多少倍（20× 是 Chinchilla 最优，后来的模型普遍远超：DeepSeek-V3 约 400×，Llama 3 8B 约 1900×）。
// 语料最多重复 MAX_EPOCHS 遍，和顾问、立项检查同一个上限。
const TOKEN_MULTS = [20, 80, 200, 500];
function structureOk(s, cfg, req) {
  if (req.arch !== undefined && !asList(req.arch).includes(cfg.arch)) return false;
  if (req.minTotal !== undefined && !(cfg.total >= req.minTotal)) return false;
  if (req.maxTotal !== undefined && !(cfg.total <= req.maxTotal)) return false;
  if (req.maxActive !== undefined && !(cfg.active <= req.maxActive)) return false;
  if (cfg.arch === 'moe' && cfg.total >= 32 && cfg.active < cfg.total / MOE_ACTIVE_FLOOR) return false;
  // techs 是能力条件：底座要练几个月，训练期间还能补研究，送评时 nameGrantCheck 会照常校验。
  // 例外是 maxActive 卡得很紧的授名（现实里某一代的具体 MoE 结构）：技术没到位就不硬凑，免得练出一个用不上的形状。
  if (req.techs !== undefined && !asList(req.techs).every(t => (s.techs || []).includes(t))) return req.maxActive === undefined;
  return true;
}
// 主线底座：枚举规模 × token（沿用 planProject），取“底座分和 − 炸炉 × 30”最大的。工期按加进作业表以后实际分到的卡算，要 ≤ maxDays；
// 另外要求最低卡 ≤ 训练卡的 90%，并且加上已有后训练的最低卡放得下。
// 手里有对结构有要求的有效授名时（P3.D2 授名时机）：在放行、工期不超过 maxDays 的结构里，挑满足要求、总算力最省的一个；
// 挑不出来照原规则。
export function chooseBase(s, maxDays = P().botParams?.(s)?.HORIZON_DAYS ?? 150) {
  const pool = E.poolStats(s).tokens;
  const T = E.allocJobs(s).T;
  const postMin = E.allocJobs(s).items.filter(i => i.job.kind === 'post' && i.run).reduce((a, i) => a + i.minCards, 0);
  let chosen = null, bestQ = -Infinity;
  let grantChosen = null, grantNeed = Infinity;
  const ctx = E.allocCtx(s);
  const req = grantStructure(s);
  const feasible = cfg => {
    if (!E.projectCheck(s, cfg).ok) return null;
    const pv = E.previewProject(s, cfg, { eta: false });
    const min = s.mod === 'llm' ? Math.ceil(16 * pv.structure.total / 80) : 8;
    if (!(min <= 0.9 * T) || min + postMin > T) return null;
    Object.assign(pv, E.baseEtaFor(s, pv, ctx));
    return pv.days <= maxDays ? pv : null;
  };
  const consider = cfg => {
    const pv = feasible(cfg);
    if (!pv) return;
    const q = Object.values(pv.base).reduce((a, b) => a + b, 0) - (pv.risk || 0) * 30;
    if (!(q > bestQ)) return;
    bestQ = q; chosen = { cfg, pv };
  };
  // 授名要求的结构：总算力 pv.need 最省。同算力取枚举里先出现的那个（顺序固定，结果确定）。
  // token 配方统一取 200×（STRUCT_TOKEN_MULT），所以“最省”只由规模 × 激活决定。
  const considerGrant = (cfg, mult) => {
    if (!req || !structureOk(s, cfg, req)) return;
    if (mult !== undefined && mult < STRUCT_TOKEN_MULT) return;
    const pv = feasible(cfg);
    if (!pv || !(pv.need < grantNeed)) return;
    grantNeed = pv.need; grantChosen = { cfg, pv };
  };
  const each = (cfg, mult) => { consider(cfg); considerGrant(cfg, mult); };
  if (s.mod === 'llm') {
    const archs = ['dense', ...(s.techs.includes('moe') ? ['moe'] : []), ...(s.charId === 'rwkv' ? ['rnn'] : [])];
    for (const arch of archs) for (const total of PARAM_TOTALS) {
      for (const active of (arch === 'moe' ? PARAM_ACTIVES.filter(a => a <= total / 3) : [total])) {
        for (const mult of TOKEN_MULTS) each({ total, active, arch, tokens: Math.max(0.5, Math.min(pool * MAX_EPOCHS, Math.round(active * mult / 100) / 10)) }, mult);
      }
    }
  } else for (const sc of SCALES[s.mod]) each({ scaleId: sc.id, tokens: 1 });
  return grantChosen || chosen;
}
// 立项前的试验（T9.1 第 4 条）：下一代计划没有 120 天内的调参结论时先调参（拿得到想要卡一半以上开中档，否则小档）；
// major 及以上再对一项已掌握、配得上计划架构的技术做架构验证；bigtech、frontier 再做一项数据配比。同时最多 1 项（大厂、前沿 2 项）。
function planTrials(s, cfg, errors) {
  const J = s.jobs;
  const max = BIG(s) ? 2 : 1;
  const running = () => J.list.filter(j => j.kind === 'trial');
  const fresh = type => E.matchFindings(s, cfg).some(f => f.type === type && E.daysBetween(f.day, s.day) <= 120) || running().some(j => j.type === type);
  const kinds = [];
  if (!fresh('tune')) kinds.push({ type: 'tune' });
  if (MAJOR(s) && !fresh('arch')) {
    const tech = E.archChoices(s, cfg).find(t => s.techs.includes(t) && !J.findings.some(f => f.tech === t));
    if (tech) kinds.push({ type: 'arch', tech });
  }
  if (BIG(s) && !fresh('mix')) kinds.push({ type: 'mix', dim: Object.keys(Q_W[s.mod]).includes('code') ? 'code' : Object.keys(Q_W[s.mod])[0] });
  for (const k of kinds) {
    if (running().length >= max) break;
    let pick = null;
    for (const size of ['mid', 'small']) {
      const c = E.jobCheck(s, { kind: 'trial', ...k, size });
      if (c.ok && c.cards.got > 0 && (size === 'small' || c.cards.got >= 0.5 * (c.cards.want ?? Infinity))) { pick = size; break; }
    }
    if (pick) { try { E.startJob(s, { kind: 'trial', ...k, size: pick }); } catch (e) { errors.push(`${s.day} trial: ${e.message}`); } }
  }
}
function planJobs(s, errors) {
  const J = s.jobs;
  J.autoRepair = true;
  const w = E.workingModel(s);
  const live = E.liveModel(s);
  const focus = goalFocus(s);
  const near = focus && focus.months <= 12;
  const did = (label, fn) => { resolveAll(s); if (s.status !== 'playing') return null; try { return fn(); } catch (e) { errors.push(`${s.day} ${label}: ${e.message}`); return null; } };
  const ctx = { bestGain: 0, train: !!w && w.stage === 'post' };
  const slotFree = (reserve = 0) => E.slotsUsed(s) + reserve < E.jobSlots(s);
  // 2. 主线后训练常开：方向沿用原来的选法（备案缺安全、在练模型也不够时练安全；否则按目标加权的预估涨幅取最大）；关键研究还差 14–90 天时专心研究。
  if (ctx.train) {
    const filingLow = filingPending(s) && E.filingSafety(s) < 52 && (w.dims.safety ?? 0) < 52;
    const key = s.research.map(r => TECHS.find(x => x.id === r.id)).filter(Boolean).sort((x, y) => techValue(y, focus) - techValue(x, focus))[0];
    const keyLeft = key ? E.daysLeft(s, s.research.find(r => r.id === key.id)) : 0;
    let dir = null;
    if (filingLow && live) dir = 'safety';
    else if (!(key && techValue(key, focus) >= 4 && keyLeft > 14 && keyLeft <= 90)) {
      // 授名时机（P3.D2）：手里有只差单科分的授名时，换成补差得最多那一科的方向，直到条件成立或授权过期。
      const gap = grantGap(s, w);
      const dim = gap ? Object.entries(gap.dims).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] : null;
      let gapDir = null, gapGain = 0;
      if (dim) {
        for (const d of E.directionsFor(s)) {
          if (d.special) continue;
          const p = E.postPreview(s, d.key);
          const g = p?.gains?.[dim[0]] || 0;
          if (g > gapGain) { gapGain = g; gapDir = d.key; }
        }
      }
      if (gapDir) dir = gapDir;
      else {
        let bv = -1;
        for (const d of E.directionsFor(s)) {
          if (d.special) continue;
          const p = E.postPreview(s, d.key);
          if (!p) continue;
          const v = Object.entries(p.gains).reduce((x, [k, y]) => x + y * (near ? 0.3 + 4 * (focus.w[k] || 0) : 1), 0) * (1 - p.fail / 200);
          if (v > bv) { bv = v; dir = d.key; }
        }
        ctx.bestGain = bv;
      }
    }
    const job = E.mainPostJob(s);
    if (dir) {
      if (Array.isArray(J.focusPause)) did('resume', () => E.focusResearch(s, false));
      if (job) { if (job.paused) job.paused = false; if (job.dir !== dir || job.bench) did('post', () => E.setPost(s, job.id, { dir })); }
      else if (slotFree()) did('post', () => E.startJob(s, { kind: 'post', target: 'main', dir, until: 'none' }));
    } else if (job && !job.paused) did('research', () => E.focusResearch(s, true));
  }
  // 3. 送评（原来的发布条件；永远不跳过）。小模型：蒸馏出来的直接送评，小底座挂完 30 天后训练再送评；上一代收尾攒够发布天数就送评（快速）。
  const tier = E.defaultTier(s);
  for (const m of E.smallModels(s)) {
    if (E.postJobFor(s, m)) continue;
    if (m.origin === 'pretrain' && !(m.postDays > 0)) {
      const sft = E.directionsFor(s).filter(d => !d.special && !d.rl).sort((a, b) => (E.postPreview(s, b.key, { model: m })?.gains[b.main] ?? 0) - (E.postPreview(s, a.key, { model: m })?.gains[a.main] ?? 0))[0];
      if (sft && slotFree()) { did('post small', () => E.startJob(s, { kind: 'post', target: `small:${m.id}`, dir: sft.key, until: { days: 30 } })); continue; }
    }
    // 授名时机（P3.D2）：小模型线有成立的授名时，不看后训练天数，能送就送。
    const gs = grantWindow(s, m);
    if (gs || !E.submitBlock(s, m, 'small')) did('submit small', () => E.submitEval(s, { modelId: m.id, tier, opts: { role: 'small' } }));
  }
  const a = E.availableActions(s);
  if (a.release && w) {
    const better = !focus || est(s, focus.b, w) > est(s, focus.b, live) + 0.3;
    // 截止前把练好的版本送出去：原来是检查前一个月里发布；现在整段往前挪出评测的天数（T6.3），评完正好赶上检查。
    const evalDays = E.evalDaysFor(s, tier, 'main'), toCheck = near ? E.daysBetween(s.day, `${focus.g.date}-01`) : Infinity;
    const lastCall = toCheck > evalDays && toCheck <= evalDays + 31;
    const want = (w.postMonths >= 3 && better) || w.postMonths >= 6 || (lastCall && better) || (!live && w.postMonths >= 1);
    // 备案缺安全、而在练模型已经够线：立刻按标准档送评，评完再备案（T6.6）。
    const forFiling = filingPending(s) && E.filingSafety(s) < 52 && (w.dims.safety ?? 0) >= 52;
    // 授名时机（P3.D2）：手里有成立的授名、submitBlock 放行就送评；不看后训练几个月，也不看 shouldHold。
    const grantNow = !!grantWindow(s, w) && !E.submitBlock(s, w, 'main');
    if (forFiling || grantNow || (want && !shouldHold(s))) did('submit', () => E.submitEval(s, { modelId: w.id, tier: forFiling ? 'standard' : tier, opts: {} }));
  }
  const pm = E.prevModel(s);
  // 上一代收尾本来就“能送就送”；有成立的授名时也走这里，releaseNamePlan 会自动选上（C7）。
  if (pm && !E.submitBlock(s, pm, 'prev')) did('submit prev', () => E.submitEval(s, { modelId: pm.id, tier: 'quick', opts: {} }));
  // 4. 主线底座：触发条件沿用 planProject；开局既没有在练模型也没有在线模型时直接立项，不等试验。
  const baseOn = E.hasBaseJob(s, 'main');
  const saturated = ctx.train && E.directionsFor(s).every(d => { const p = E.postPreview(s, d.key); return !p || (p.gains[d.main] || 0) < 0.6; });
  const since = s.flags.botProjectAt === undefined ? s.monthsPlayed : s.monthsPlayed - s.flags.botProjectAt;
  // 一代底座的节奏（BOT.BASE_EVERY_MONTHS，顾问的“该准备下一代”用同一个数）：开局后满这么多个月、或者上一次立项后再多一个月，就到期。
  const every = BOT.BASE_EVERY_MONTHS;
  const yearly = s.flags.botProjectAt === undefined ? s.monthsPlayed >= every : since >= every + 1;
  const due = !baseOn && (!w || saturated || (w.postMonths >= 5 && (w.releases || 0) >= 2) || yearly);
  // 立项前三周左右先做试验：快到期（再练一个月就够 5 个月、或者离一年一代不到一个月）时就开始。
  const soon = !baseOn && !due && !!w && (((w.postMonths >= 4) && (w.releases || 0) >= 2) || (s.flags.botProjectAt === undefined ? s.monthsPlayed >= every - 1 : since >= every));
  const fresh = !w && !live;
  let picked;
  const pickBase = () => (picked === undefined ? (picked = chooseBase(s)) : picked);
  if ((due || soon) && !fresh) {
    const pick = pickBase();
    if (pick) {
      if (JSON.stringify(J.plan) !== JSON.stringify(pick.cfg)) E.setPlan(s, pick.cfg);
      planTrials(s, pick.cfg, errors);
    }
  }
  if (due && slotFree()) {
    const trials = J.list.some(j => j.kind === 'trial');
    s.flags.botWaitAt ??= s.day;
    if (fresh || !trials || E.daysBetween(s.flags.botWaitAt, s.day) >= 14) {
      if (trials && J.list.some(j => j.kind === 'trial')) picked = undefined;
      const pick = pickBase();
      if (pick && E.jobCheck(s, { kind: 'pretrain', line: 'main', cfg: pick.cfg }).ok) {
        did('pretrain', () => { E.startJob(s, { kind: 'pretrain', line: 'main', cfg: pick.cfg }); s.flags.botProjectAt = s.monthsPlayed; delete s.flags.botWaitAt; });
      }
    }
  } else if (!due) delete s.flags.botWaitAt;
  // 5. 小模型线（只有语言模型）：底座到期时总要留一个作业位给它，蒸馏、小底座不抢这个位子。
  if (s.mod !== 'llm') return ctx;
  const reserve = (due || soon) && !E.hasBaseJob(s, 'main') ? 1 : 0;
  const sl = E.smallLive(s);
  if (live && E.smallLineCount(s) === 0 && (!sl || !sl.releasedDay || E.daysBetween(sl.releasedDay, s.day) >= 365) && slotFree(reserve) && live.total > 14) {
    const size = BIG(s) ? 7 : 14;
    const cfg = { teacher: 'self', total: size, active: size, arch: 'dense', tokens: 1.5 };
    if (E.distillCheck(s, cfg).ok) {
      const pv = E.previewDistill(s, cfg);
      if (pv && pv.days <= 90 && E.jobCheck(s, { kind: 'distill', cfg }).ok) did('distill', () => E.startJob(s, { kind: 'distill', cfg }));
    }
  }
  // 同代小号（bigtech、frontier）：每一代主线一次，训练卡闲置 ≥ 20% 连续 7 天时，用闲着的卡从零练 ≤ min(120B, 参照底座 × 0.2) 里 60 天内练得完的最大一档；
  // “最多 N 张”设成当时闲着的卡数，下一代主线底座立项时不会被它拖慢。
  const ref = E.refModel(s);
  if (BIG(s) && ref && (s.flags.botFamilyGen ?? 0) < s.gen && E.idleDays(s) >= 7 && E.smallLineCount(s) < 3 && slotFree(reserve)) {
    const al = E.allocJobs(s);
    const idle = Math.floor(al.free * al.T);
    const capTotal = Math.min(120, ref.total * 0.2);
    let pick = null;
    for (const total of PARAM_TOTALS.filter(x => x <= capTotal && x >= 7)) {
      const cfg = { total, active: total, arch: 'dense', tokens: Math.max(0.5, Math.min(15, Math.round(E.poolStats(s).tokens * 2))) };
      const c = E.jobCheck(s, { kind: 'pretrain', line: 'small', cfg, prio: 'normal', cap: idle });
      if (c.ok && c.eta <= 60) pick = cfg;
    }
    if (pick) did('small base', () => { E.startJob(s, { kind: 'pretrain', line: 'small', cfg: pick, prio: 'normal', cap: idle }); s.flags.botFamilyGen = s.gen; });
  }
  return ctx;
}

// 公司策略（A10）：空闲时挑一项。史实模式按史实挑（historic：不选 g_beyond、架空节点和主干的路线节点）；
// 自洽世界的电脑公司一律 adaptive（M.3.12）。模式从 P().botParams 读，史实下没有这一项。
function strategyWeekly(s, errors) {
  if (!s.strategy?.tree || s.strategy.cur) return;
  const id = pickStrategy(s, P().botParams?.(s)?.STRATEGY ?? 'historic');
  if (!id) return;
  resolveAll(s);
  if (s.status !== 'playing') return;
  try { E.startStrategy(s, id); } catch (e) { errors.push(`${s.day} strategy ${id}: ${e.message}`); }
}
// 补数据（A10）：炼出过 SOTA 的，综合分算进去的几类后训练数据补到 BOT.MAKER_DATA 档，只买授权、宽松许可的，每周最多一单（在途的也算进档位）；
// 其余的照原规则（某类低于 1.5 档才买）。现金门槛都是一单不超过现金的 15%。
function postLevels(s) {
  const lvl = { ...s.data.post };
  for (const o of s.orders.filter(x => x.kind === 'data')) for (const [k, v] of Object.entries(DATASETS.find(d => d.id === o.ref)?.posts || {})) lvl[k] = (lvl[k] || 0) + v;
  return lvl;
}
function makerPick(s, focusData) {
  if (!sotaMade(s)) return null;
  const cats = new Set(Object.keys(Q_W[s.mod]).map(k => dataCatOf(s.mod, k)).filter(Boolean));
  const lvl = postLevels(s);
  return DATASETS.filter(d => d.mod === s.mod && d.kind !== 'pre' && ['licensed', 'permissive'].includes(d.rights) && !d.gen && d.cost < s.cash * 0.15
    && !s.orders.some(o => o.ref === d.id) && E.datasetAvailable(s, d).ok && Object.keys(d.posts || {}).some(k => cats.has(k) && (lvl[k] || 0) < BOT.MAKER_DATA))
    .sort((x, y) => Number(Object.keys(y.posts || {}).some(k => focusData.includes(k))) - Number(Object.keys(x.posts || {}).some(k => focusData.includes(k))))[0] ?? null;
}

// 每周的决定：公司策略、要不要下数据单、要不要买蒸馏数据（送评和后训练在 planJobs 里）。
function weekly(s, errors, ctx = {}) {
  const focus = goalFocus(s);
  const near = focus && focus.months <= 12;
  const tryDo = (action, arg) => { resolveAll(s); if (s.status !== 'playing') return false; try { E.decide(s, action, arg); return true; } catch (e) { errors.push(`${s.day} ${action}: ${e.message}`); return false; } };
  strategyWeekly(s, errors);
  const focusData = near ? DIRECTIONS[s.mod].filter(d => d.main && focus.w[d.main]).map(d => d.data) : [];
  const inFlight = s.orders.some(o => o.kind === 'data');
  const dataPick = DATASETS.filter(d => d.mod === s.mod && E.datasetAvailable(s, d).ok && d.cost < s.cash * 0.15
    && (d.kind === 'pre' ? d.quality >= 1.0 && !s.data.acquired.includes(d.id) : (s.data.post[Object.keys(d.posts)[0]] || 0) < 1.5)
    && d.rights !== 'pirated' && d.rights !== 'tos')
    .sort((x, y) => Number(Object.keys(y.posts || {}).some(k => focusData.includes(k))) - Number(Object.keys(x.posts || {}).some(k => focusData.includes(k))));
  // 训练涨得慢、或者还没有模型可练时，顺手把数据订上（不占团队）。炼出过 SOTA 的先补冲顶要的那几类。
  const mk = makerPick(s, focusData);
  if (mk) tryDo('data', { id: mk.id });
  else if (dataPick.length && !inFlight && (!ctx.train || ctx.bestGain < 1.2)) tryDo('data', { id: dataPick[0].id });
  // 蒸馏（wantsDistill）：没炼出过、落后当前最强一截、有许可宽松的开源老师明显更强，买那位老师的蒸馏数据。
  const dt = distillTeacher(s);
  if (dt) tryDo('data', { id: dt.id });
}

// 电脑公司的一次“想事情”（规格 M.3.12）：先打理不占作业位的日常，再排训练作业，再做每周的决定。
// 现有的机器人 playGame 每周就调这一个出口；自洽模式的电脑公司也走它，行为必须和原来三句连写时一样。
export function botStep(s, errors) {
  freeOps(s);
  // 被动（托管）档：只跑 freeOps，不立新项目、不送评（M.3.12）。产品照开、续买数据、生成订单留给 freeOps。
  if (P().botParams?.(s)?.MODE === 'passive') return { passive: true };
  // 训练作业（T9.1）：顺序固定为 freeOps → planJobs → weekly。
  const ctx = planJobs(s, errors);
  weekly(s, errors, ctx);
  return ctx;
}

// 玩完一局；返回最终状态与失败过的操作（正常情况下应为空）。
export function playGame(charId, scenarioId, seed, opts = {}) {
  const s = E.createGame(charId, scenarioId, seed);
  const errors = [];
  let decideAt = s.day;
  for (let i = 0; i < 2500 && s.status === 'playing'; i++) {
    resolveAll(s, opts.pick);
    if (s.status !== 'playing') break;
    if (s.day >= decideAt) {
      botStep(s, errors);
      decideAt = addDays(s.day, 7);
      opts.onWeek?.(s);
    }
    const out = E.tickDay(s); globalThis.__G1?.day?.(s);
    if (out?.report) opts.onMonth?.(s, out.report);
    // opts.onDay(s, out)：每走完一天调用一次（只读：测试和 jobs_report.mjs 逐日量作业用）。
    opts.onDay?.(s, out);
  }
  return { s, errors };
}

// 照着“下一步”大按钮玩完一局：每周把建议从上往下照做，直到最后那条作业建议（kind 'jobs'），然后让时间走一周。
// opts.onWeek(s)：每周末（时间走完一周后）调用一次，和 playGame 的同名回调对应；指纹、冒烟脚本靠它取检查点。
export function playAdvised(charId, scenarioId, seed, opts = {}) {
  const s = E.createGame(charId, scenarioId, seed);
  const errors = [];
  for (let week = 0; week < 400 && s.status === 'playing'; week++) {
    resolveAll(s);
    if (s.status !== 'playing') break;
    // 开局一天里可能有好几条不占时间的事（排满研究槽、订几份数据、上线产品），但同一条建议不该重复出现。
    const seen = new Map();
    for (let k = 0; k < 30; k++) {
      const __t0 = performance.now(); const [a] = E.advise(s); globalThis.__G1?.adv?.(performance.now() - __t0);
      if (!a) { errors.push(`${s.day} 没有建议`); break; }
      if (a.kind === 'event') { resolveAll(s); continue; }
      // 扩容这类会被当月配额截断的，可能要连着做两三次。
      if (a.kind !== 'jobs' && (seen.get(a.id) || 0) >= 3) { errors.push(`${s.day} 不占时间的建议在原地打转：${a.label}`); break; }
      seen.set(a.id, (seen.get(a.id) || 0) + 1);
      try { E.applyAdvice(s, a); } catch (e) { errors.push(`${s.day} ${a.label}: ${e.message}`); break; }
      if (a.kind === 'jobs') break;
      if (k === 29) errors.push(`${s.day} 不占时间的建议太多：${a.label}`);
    }
    advance(s, 7);
    opts.onWeek?.(s);
  }
  return { s, errors };
}
