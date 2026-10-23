// 服务、财务、资本与行情。
import { PRICE_TIERS, PRODUCTS, GPUS, RENT_FACTOR, yearOf, gpuAvailable, gpuMarkup, ownTools } from '../data/core.js';
import { FAMILIES, brandOf } from '../data/rivals.js';
import { TOKENS_PER_USER, FX, interp } from '../data/world.js';
import { clamp, rand, hash01 } from './util.js';
import { liveModel, smallLive, inferGpuEq, leaseGpus, tokensPerGpu, peerCls } from './model.js';
import { qOf, isMine, familyBest, relDims, rivalStandings } from './sota.js';
import { daysInMonth } from './clock.js';
import { modifier } from './modifiers.js';
import { routeOf, licenseOf } from './route.js';
import { STANCE } from '../data/routes.js';
import { P } from './provider.js';
import { SERVE, TALENT, GPU_COST, RD, FUNDING } from '../data/economy.js';
import { bubbleMult } from './bubble.js';

export const regionOf = s => (s.company.country === 'CN' ? 'CN' : 'global');
// 产品从哪个月开始能卖：读 PRODUCTS（规格 E5：不在这里再写一份日期）。
const productFrom = (mod, id) => PRODUCTS[mod]?.find(p => p.id === id)?.from ?? '0000-00';

// ---------- 产品质量 ----------
export function productQ(mod, product, dims, date) {
  const d = k => dims[k] || 0;
  if (mod === 'llm') {
    if (product === 'chat') return 0.4 * d('writing') + 0.3 * d('knowledge') + 0.15 * d('code') + 0.15 * d('math');
    if (product === 'coding_plan') return 0.6 * d('code') + 0.4 * d('agent');
    const agentW = P().gate('agentW2', date) ? 0.3 : P().gate('agentW', date) ? 0.15 : 0;
    return (d('knowledge') + d('code') + d('math') + d('writing') * 0.5 + d('agent') * agentW * 3) / (3.5 + agentW * 3);
  }
  return qOf(mod, dims);
}
// 价格弹性：API 与 Coding Plan 对价格敏感，订阅相对不敏感。
function priceFactor(product, mult) {
  const e = product === 'api' ? 0.95 : product === 'coding_plan' ? 0.7 : 0.45;
  return Math.pow(1 / mult, e);
}
// 某地区市场里的所有参与者：对手各家族的在售旗舰，就是截至今天家族里综合最强的一款（familyBest，规格 D1），能力按玩家看到的算。
function rivalEntries(s, product, region) {
  const out = [];
  const leak = s.due?.leak > s.day ? 2 : 0;
  for (const f of Object.keys(FAMILIES)) {
    const fam = FAMILIES[f];
    if (fam.mod !== s.mod || isMine(s, f)) continue;
    const rel = familyBest(s, f, s.day);
    if (!rel) continue;
    const dims = relDims(s, rel);
    if (product === 'coding_plan' && (dims.code || 0) < 65) continue;
    // 美国模型进不了中国市场；中国模型出海看开源与性价比。
    let rf;
    if (region === 'CN') rf = fam.region === 'cn' ? 1 : 0.06;
    else rf = fam.region === 'cn' ? (rel.open ? 0.3 : 0.12) * (rel.price === 'budget' ? 1.6 : 1) : 1;
    const brand = (product === 'api' && fam.apiBrand ? fam.apiBrand : brandOf(f, s.date)) * rf;
    out.push({ name: rel.name, family: f, company: fam.company, q: productQ(s.mod, product, dims, P().marketDate(s)) + leak, brand, price: priceFactor(product, PRICE_TIERS[rel.price].mult), open: rel.open, region: fam.region });
  }
  return out;
}
// 开放权重让 API 生意变难做：API 收入看在线旗舰本身（宽松许可 ×0.75，受限许可 ×0.85，闭源 ×1）；
// OpenRouter 上的调用量按每一款在线模型自己算（宽松 ×2.2，受限 ×1.8，闭源 ×1），再乘 modifier('routerDemand')（规格 B3）。
const API_OPEN_MULT = { permissive: 0.75, restrictive: 0.85 };
const ROUTER_OPEN_MULT = { permissive: 2.2, restrictive: 1.8 };
const apiOpenMult = m => API_OPEN_MULT[licenseOf(m)] ?? 1;
const routerOpenMult = m => ROUTER_OPEN_MULT[licenseOf(m)] ?? 1;
export function playerBrand(s, product, region) {
  let b = s.brand * (0.45 + s.rep / 110);
  // API 品牌跟着公司名声走：读路线（modifier 'apiBrand' 的来源是路线，规格 B3、E3）。
  if (product === 'api') b *= modifier(s, 'apiBrand');
  // 接入的编程工具越多，Coding Plan 越好卖；自家的编程工具（如 Claude Code）上线后自动算一个。
  if (product === 'coding_plan') b *= 1 + 0.35 * (new Set([...s.service.integrations.tools, ...ownTools(s.charId, s.date)]).size + (s.service.integrations.mode === 'all' ? 3 : 0));
  // 中国公司出海：性价比和实力决定海外用户买不买账。
  if (region === 'global' && s.company.country === 'CN') b *= STANCE[routeOf(s).stance].mods.overseas * modifier(s, 'overseasMult');
  if (region === 'CN' && s.company.country !== 'CN') b *= 0.05;
  // 被列入实体清单：海外客户回避。
  if (region === 'global' && s.flags.entityList) b *= 0.5;
  return Math.max(0.005, b);
}
// 玩家的 SKU（旗舰 + 蒸馏小模型）与对手一起做多项 Logit。
export function marketShares(s, product, region, skus) {
  return P().shareOf(s, product, region, skus, computeShares);
}
function computeShares(s, product, region, skus) {
  const rivals = rivalEntries(s, product, region);
  const k = product === 'chat' || product === 'subscription' ? 0.15 : 0.12;
  const qs = [...rivals.map(r => r.q), ...skus.map(x => x.q)];
  const qmax = Math.max(...qs, 1);
  const pb = playerBrand(s, product, region);
  const mine = skus.map(x => ({ ...x, w: Math.exp(k * (x.q - qmax)) * pb * (x.brandMult || 1) * priceFactor(product, PRICE_TIERS[x.tier].mult) }));
  const others = rivals.map(r => ({ ...r, w: Math.exp(k * (r.q - qmax)) * r.brand * r.price }));
  const total = [...mine, ...others].reduce((a, x) => a + x.w, 0) || 1;
  return { mine: mine.map(x => ({ ...x, share: x.w / total })), others: others.map(x => ({ ...x, share: x.w / total })) };
}
function marketsFor(s) { return s.company.country === 'CN' ? ['CN', 'global'] : ['global']; }
export const refApiPrice = (s, region = regionOf(s)) => P().apiPrice(region, s);
const servingDims = (s, m) => {
  const sv = s.service;
  const pen = sv.routing.startsWith('quant') ? 3 : sv.routing.startsWith('distill') ? 7 : 0;
  return Object.fromEntries(Object.entries(m.dims).map(([k, v]) => [k, v - pen * (sv.lastR429 > 0 ? 0.5 : 0.25)]));
};

// 每月服务结算：份额 → 需求 → 负载 → 429 → 实收。
// settle：月结用逐日账本（出租收入按实际天数、推理能力取当月平均）；不带它就是按当前配置估一整月（界面、测试用）。
// commit：写不写 sv.last（上月报表）；预估用 previewService，不写。
// 需求乘子（规格 E3，特质和限时加成）：chatDemand 乘对话用户，subDemand 乘付费订阅（LLM 是对话的付费部分，其他模态是会员订阅），
// apiDemand 乘 API 收入，codingDemand 乘 Coding Plan 收入；用量、推理负载跟着收入一起变。份额（out.share）还是市场份额，不乘。
// 推理成本（规格 K3 第 1 条）：每百万 token 的单价 = API 参考价 × K × 基准吞吐 ÷ 这个模型的每卡吞吐 ÷ 分流加速。
// 和推理容量用同一套吞吐参数：激活参数小、MoE、量化、蒸馏分流都更省钱；标准价档、37B 激活的模型 API 毛利 = 1 − K。
const ROUTE_SPEED = r => (r.startsWith('quant') ? 1.35 : r.startsWith('distill') ? 1.9 : 1);
export function serveCostPerM(s, model, region = regionOf(s)) {
  return refApiPrice(s, region) * SERVE.K * 8e9 / Math.max(1, tokensPerGpu(s, model)) / ROUTE_SPEED(s.service.routing || 'full');
}
export function simulateService(s, { settle = false, commit = true } = {}) {
  const dm = k => modifier(s, k);
  const flag = liveModel(s);
  const small = smallLive(s);
  const sv = s.service;
  const p = s.products;
  const out = { total: 0, users: 0, rpUsers: 0, codingUsers: 0, revenue: {}, tokens: 0, needGpu: 0, capGpu: 0, util: 0, r429: 0, share: {}, byRegion: {}, apiTokens: 0, overseas: 0, serve: 0 };
  // 推理成本按服务掉的 token 记（K3 第 1 条）；请求失败的那部分不花钱，最后按 429 折。
  const cost = (tk, model, region) => { out.serve += tk / 1e6 * serveCostPerM(s, model, region); };
  const rev = out.revenue;
  const add = (k, v) => { rev[k] = (rev[k] || 0) + v; };
  const ledger = settle && s.computeLedger?.month === s.date ? s.computeLedger : null;
  // 出租的是显卡，不用先发布模型也能收租金；张数按手里实有的卡算。
  const lease = ledger ? ledger.leaseRevenue : leaseMonthlyRevenue(s);
  if (lease > 0) add('gpu_lease', lease);
  if (!flag) { out.total = rev.gpu_lease || 0; if (commit) sv.last = out; return out; }
  let need = 0;
  const fdims = servingDims(s, flag);
  const sdims = small ? servingDims(s, small) : null;
  if (s.mod === 'llm') {
    for (const region of marketsFor(s)) {
      const reg = { users: 0, api: 0 };
      if (p.chat.on && sv.filing !== 'pending' && (region !== 'CN' || s.company.country !== 'CN' || sv.filing === 'done' || !P().gate('cnFiling', s))) {
        const res = marketShares(s, 'chat', region, [{ q: productQ('llm', 'chat', fdims, P().marketDate(s)), tier: p.chat.tier, role: 'flagship' }]);
        const share = res.mine[0].share * (p.chat.free ? 1.3 : 1);
        const users = P().market('chat', region, s) * 1e6 * share * dm('chatDemand');
        const rp = users * sv.tavern;
        const payRate = region === 'CN' ? 0.006 : 0.035;
        const arpu = (region === 'CN' ? 5 : 20) * { budget: 0.5, standard: 1, premium: 2 }[p.chat.tier];
        add('chat', p.chat.free ? 0 : (users + rp * 0.6) * payRate * arpu * dm('subDemand'));
        const tk = users * interp(TOKENS_PER_USER, s.date) + rp * 2e6;
        out.tokens += tk;
        need += tk / tokensPerGpu(s, flag);
        cost(tk, flag, region);
        out.users += users; out.rpUsers += rp; reg.users = users;
        if (region === regionOf(s)) out.share.chat = share;
      }
      if (p.api.on) {
        const skus = [{ q: productQ('llm', 'api', fdims, P().marketDate(s)), tier: p.api.tier, role: 'flagship', model: flag }];
        if (small && p.api.small !== false) skus.push({ q: productQ('llm', 'api', sdims, P().marketDate(s)), tier: p.api.smallTier || 'budget', role: 'small', model: small, brandMult: 0.9 });
        const res = marketShares(s, 'api', region, skus);
        const market = P().market('api', region, s);
        for (const x of res.mine) {
          const mult = PRICE_TIERS[x.tier].mult;
          const r = market * x.share * mult * (1 + sv.tavern * 0.5) * apiOpenMult(flag) * dm('apiDemand');
          add('api', r);
          const tk = r / (refApiPrice(s, region) * mult) * 1e6;
          out.tokens += tk; out.apiTokens += tk;
          need += tk / tokensPerGpu(s, x.model);
          cost(tk, x.model, region);
          reg.api += r;
          if (region === regionOf(s)) out.share[x.role === 'small' ? 'apiSmall' : 'api'] = x.share;
        }
      }
      if (p.coding_plan?.on && s.date >= productFrom('llm', 'coding_plan')) {
        const res = marketShares(s, 'coding_plan', region, [{ q: productQ('llm', 'coding_plan', fdims, P().marketDate(s)), tier: p.coding_plan.tier, role: 'flagship' }]);
        const r = P().market('coding_plan', region, s) * res.mine[0].share * PRICE_TIERS[p.coding_plan.tier].mult ** 0.5 * dm('codingDemand');
        add('coding_plan', r);
        const users = r / (region === 'CN' ? 6 : 20);
        out.codingUsers += users;
        const tk = users * 1.2e7;
        out.tokens += tk;
        need += tk / tokensPerGpu(s, flag);
        cost(tk, flag, region);
        if (region === regionOf(s)) out.share.coding_plan = res.mine[0].share;
      }
      out.byRegion[region] = reg;
    }
    if (s.company.country === 'CN') out.overseas = (out.byRegion.global?.api || 0);
    // 反代：会员额度被包装成 API 转卖，占容量；纳入官方转售后按六折计费。
    const proxyTokens = out.tokens * sv.proxy;
    out.proxyTokens = proxyTokens;
    need += proxyTokens / tokensPerGpu(s, flag);
    cost(proxyTokens, flag, regionOf(s));
    if (sv.proxyPolicy === 'reseller') add('reseller', proxyTokens / 1e6 * refApiPrice(s) * 0.6);
  } else {
    const q = productQ(s.mod, 'sub', fdims, P().marketDate(s));
    for (const region of marketsFor(s)) {
      const total = P().market(s.mod, region, s);
      if (p.subscription?.on) {
        const res = marketShares(s, 'subscription', region, [{ q, tier: p.subscription.tier, role: 'flagship' }]);
        const r = total * 0.7 * res.mine[0].share * PRICE_TIERS[p.subscription.tier].mult ** 0.6 * dm('subDemand');
        add('subscription', r);
        out.users += r / (s.mod === 'image' ? 15 : s.mod === 'music' ? 10 : 11);
        if (region === regionOf(s)) out.share.subscription = res.mine[0].share;
      }
      if (p.api?.on && s.date >= productFrom(s.mod, 'api')) {
        const res = marketShares(s, 'api', region, [{ q, tier: p.api.tier, role: 'flagship' }]);
        add('api', total * 0.3 * res.mine[0].share * PRICE_TIERS[p.api.tier].mult * dm('apiDemand'));
        if (region === regionOf(s)) out.share.api = res.mine[0].share;
      }
    }
    const perGpu = { image: 5000, music: 4000, speech: 9000 }[s.mod];
    need += ((rev.subscription || 0) + (rev.api || 0)) / perGpu;
    // 图像、音乐、语音的推理成本按收入的一半记（毛利约 50%）。
    out.serve += ((rev.subscription || 0) + (rev.api || 0)) * SERVE.K * 0.8;
  }
  // 月结按当月每天推理能力的平均算：月底才把推理拉满，改不了前面那些天。
  const cap = ledger?.days ? ledger.inferCapSum / ledger.days : serviceCapacity(s);
  out.needGpu = need;
  out.capGpu = cap;
  out.util = cap > 0 ? need / cap : need > 0 ? 9 : 0;
  // 有需求却一张推理卡都没有：请求全部失败。
  out.r429 = need > 0 && cap <= 0 ? 1 : out.util <= 0.85 ? 0 : clamp((out.util - 0.85) / out.util * 1.3, 0, 0.92);
  const served = 1 - out.r429;
  for (const k of ['api', 'coding_plan', 'reseller']) if (rev[k]) rev[k] *= served;
  for (const k of ['chat', 'subscription']) if (rev[k]) rev[k] *= 1 - out.r429 * 0.5;
  out.total = Object.values(rev).reduce((a, b) => a + b, 0);
  out.serve *= 1 - out.r429 * 0.75;
  if (commit) sv.last = out;
  return out;
}
// 只读预估：按当前配置估一整月，不写上月报表、不动随机数。patch 临时改几项产品配置，例如 { api: { tier: 'premium' } }。
// 服务页的“当前配置收入预估”和超事件的“提价”“加租”都用它。
export function previewService(s, patch = null) {
  const products = patch ? { ...s.products } : s.products;
  for (const [id, v] of Object.entries(patch || {})) products[id] = { ...s.products[id], ...v };
  return simulateService(patch ? { ...s, products } : s, { commit: false });
}
export function averageRent(s) {
  // 自洽模式：按手里那张卡自己的月租、经租卡池的现货价（M.3.8 第 3 条）。史实模式保持原样。
  if (P().mode === 'sim' && typeof P().averageRent === 'function') return P().averageRent(s);
  const f = RENT_FACTOR[clamp(yearOf(s.date), 2023, 2026)];
  return (s.company.country === 'CN' ? GPUS.H800.rent : GPUS.H100.rent) * f;
}
// 按当前出租张数，一整月能收的租金。
function leaseMonthlyRevenue(s) {
  return leaseGpus(s) * averageRent(s) * 0.85 * (0.7 + 0.3 * clamp(s.hype, 0.5, 1.5));
}
// 当前的推理能力（H100 等效卡），量化、蒸馏分流能多服务一些请求。超事件“加租”也用它估多租几张能多出多少。
export function serviceCapacity(s) {
  const routing = s.service.routing;
  return inferGpuEq(s) * (routing.startsWith('quant') ? 1.35 : routing.startsWith('distill') ? 1.9 : 1);
}

// 逐日算力账单：每天按当天的卡和分配记一笔，月结只读账本。
// 月底最后一天退租照样付前面那些天的租金，月底才出租也只收一天；推理能力取当月平均。界面上的报价仍按当前配置估一整月。
export function accrueComputeDay(s) {
  const rates = monthlyCosts(s);
  const n = daysInMonth(s.date);
  const lease = leaseMonthlyRevenue(s), cap = serviceCapacity(s);
  let ledger = s.computeLedger;
  if (!ledger || ledger.month !== s.date) {
    // 旧档读进来时这个月已经过了几天，没有逐日记录：这几天按现在的配置估，不编造当时的订单。
    const elapsed = Math.max(0, Number(s.day.slice(8, 10)) - 1);
    ledger = s.computeLedger = { month: s.date, days: elapsed, estimatedDays: elapsed,
      owned: rates.owned * elapsed / n, rented: rates.rented * elapsed / n, leaseRevenue: lease * elapsed / n, inferCapSum: cap * elapsed, lastDay: null };
  }
  if (ledger.lastDay === s.day) return;
  ledger.owned += rates.owned / n;
  ledger.rented += rates.rented / n;
  ledger.leaseRevenue += lease / n;
  ledger.inferCapSum += cap;
  ledger.days += 1;
  ledger.lastDay = s.day;
}

// 对外标价（美元 / 百万 token，按输入输出 3:1 折算），只用于性价比图：跟着全球主流价走，按量级和定价档浮动，
// 每个型号再有一点差异。量级系数的参照：2025 年末 GPT-5.2 约 4–5 美元、Claude Opus 4.5 约 10 美元、DeepSeek-V3.2 约 0.3 美元。
const CLS_PRICE = { frontier: 1.6, large: 1, mid: 0.45, small: 0.2 };
export function listPrice(date, { price = 'standard', cls = 'large', name = '' } = {}) {
  return P().apiPrice('global', date) * PRICE_TIERS[price].mult * (CLS_PRICE[cls] || 1) * (0.75 + 0.6 * hash01(`${name}|price`));
}

// ---------- 调用量排行榜（OpenRouter 式 API 调用、Coding Plan、App 月活） ----------
export function usageBoards(s) {
  const boards = {};
  const flag = liveModel(s);
  const small = smallLive(s);
  const sv = s.service.last || {};
  if (s.mod === 'llm' && P().gate('usageBoard', s)) {
    const skus = [];
    if (flag && s.products.api.on) skus.push({ q: productQ('llm', 'api', flag.dims, P().marketDate(s)), tier: s.products.api.tier, role: 'flagship', name: flag.name, model: flag });
    if (small && s.products.api.on) skus.push({ q: productQ('llm', 'api', small.dims, P().marketDate(s)), tier: s.products.api.smallTier || 'budget', role: 'small', name: small.name, brandMult: 0.9, model: small });
    // OpenRouter 是第三方路由平台：开源、便宜的模型在上面特别受欢迎。
    const res = marketShares(s, 'api', 'global', skus);
    const weekTokens = P().market('api', 'global', s) / P().apiPrice('global', s) * 1e6 / 4.3 * 0.04;
    const rows = [
      ...res.others.map(r => ({ name: r.name, company: r.company, family: r.family, value: r.share * weekTokens * (r.open ? 2.2 : 1) * (r.price > 1.5 ? 1.5 : 1) })),
      ...res.mine.map(x => ({ name: x.name, company: s.company.company, family: s.charId, mine: true, value: x.share * weekTokens * routerOpenMult(x.model) * modifier(s, 'routerDemand') * (x.tier === 'budget' ? 1.5 : 1) })),
    ];
    boards.openrouter = rank(rows, 'OpenRouter 周调用量', 'token / 周');
  }
  if (s.mod === 'llm' && s.date >= productFrom('llm', 'coding_plan')) {
    const skus = flag && s.products.coding_plan?.on ? [{ q: productQ('llm', 'coding_plan', flag.dims, P().marketDate(s)), tier: s.products.coding_plan.tier, role: 'flagship', name: flag.name }] : [];
    const region = regionOf(s);
    const res = marketShares(s, 'coding_plan', region, skus);
    const monthTokens = P().market('coding_plan', region, s) / (region === 'CN' ? 6 : 20) * 1.2e7;
    boards.coding = rank([
      ...res.others.map(r => ({ name: r.name, company: r.company, family: r.family, value: r.share * monthTokens })),
      ...res.mine.map(x => ({ name: x.name, company: s.company.company, family: s.charId, mine: true, value: x.share * monthTokens })),
    ], `Coding Plan 月调用量（${region === 'CN' ? '国内' : '全球'}）`, 'token / 月');
  }
  {
    const region = regionOf(s);
    const product = s.mod === 'llm' ? 'chat' : 'subscription';
    const skus = flag && (s.products.chat?.on || s.products.subscription?.on) ? [{ q: productQ(s.mod, product, flag.dims, P().marketDate(s)), tier: (s.products.chat || s.products.subscription).tier, role: 'flagship', name: flag.name }] : [];
    const res = marketShares(s, product, region, skus);
    const mau = s.mod === 'llm' ? P().market('chat', region, s) * 1e6 : P().market(s.mod, region, s) / 12;
    boards.apps = rank([
      ...res.others.map(r => ({ name: FAMILIES[r.family].name, company: r.company, family: r.family, value: r.share * mau })),
      ...res.mine.map(() => ({ name: s.persona.name, company: s.company.company, family: s.charId, mine: true, value: s.mod === 'llm' ? sv.users || 0 : (sv.users || 0) })),
    ], s.mod === 'llm' ? `AI 应用月活（${region === 'CN' ? '国内' : '全球'}）` : `付费用户（${region === 'CN' ? '国内' : '全球'}）`, '人');
  }
  return boards;
}
function rank(rows, title, unit) {
  rows.sort((a, b) => b.value - a.value);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return { title, unit, rows };
}

// ---------- 成本 ----------
export const ANTI_DISTILL_FEE = 3e5;
// settle：月结时自有卡运维和云上租金读逐日账本；不带它就是按当前的卡估一整月。
// 工资、自有卡运维、云上租金再乘特质的 cost（E3，例如精打细算 ×0.9）；账本是按这里的日费率逐日记的，已经乘过。官司费和防蒸馏风控费不打折。
// 人均月成本（含股权激励，规格 K3 第 2 条）：国家月薪 × 档位溢价 × 年份系数。挖人、留人也按它算。
export function staffCostPerHead(s) {
  const salary = { CN: 7000, US: 16000, EU: 12000 }[s.company.country] || 14000;
  const tier = P().tierOf(s) || s.company.tier;
  return salary * (TALENT.tier[tier] ?? 1.5) * interp(TALENT.year, s.date);
}
// 自有卡每张每月的运维（电、机房、网络，K3 第 3 条）和折旧（只进经营利润，不扣现金）。
export const gpuOpex = id => Math.max(GPU_COST.OPEX_MIN, (GPUS[id]?.price || 0) * GPU_COST.OPEX);
export function monthlyDepreciation(s) {
  let dep = 0;
  for (const [id, n] of Object.entries(s.gpus.owned || {})) {
    const g = GPUS[id];
    if (!g || !(n > 0)) continue;
    const [y0, m0] = g.from.split('-').map(Number), [y, m] = s.date.split('-').map(Number);
    if ((y - y0) * 12 + (m - m0) < GPU_COST.DEP_MONTHS) dep += n * g.price / GPU_COST.DEP_MONTHS;
  }
  return dep;
}
// 前沿研发开支（K3 第 5 条）：机群（自有加租用）按买价算的价值 × 月比例 × 档位系数。
export function rdCost(s) {
  let fleet = 0;
  for (const src of ['owned', 'rented']) for (const [id, n] of Object.entries(s.gpus[src] || {})) fleet += n * (GPUS[id]?.price || 0);
  const tier = P().tierOf(s) || s.company.tier;
  const last = s.history?.at(-1);
  const customer = last ? ['chat', 'subscription', 'api', 'coding_plan'].reduce((a, k) => a + (last.rev?.[k] || 0), 0) : 0;
  return fleet * interp(RD.rate, s.date) * (RD.tier[tier] ?? 0.5) + customer * (RD.reinvest[tier] ?? 0.2);
}
export function monthlyCosts(s, { settle = false } = {}) {
  const cm = modifier(s, 'cost');
  const staff = s.team * staffCostPerHead(s) * cm;
  const ledger = settle && s.computeLedger?.month === s.date ? s.computeLedger : null;
  const owned = ledger ? ledger.owned : Object.entries(s.gpus.owned).reduce((a, [id, n]) => a + n * gpuOpex(id), 0) * cm;
  const f = RENT_FACTOR[clamp(yearOf(s.date), 2023, 2026)];
  const rented = ledger ? ledger.rented : Object.entries(s.gpus.rented).reduce((a, [k, n]) => {
    // 自洽模式：租金按那张卡自己的月租、经租卡池的现货价（M.3.8 第 3 条）；史实模式保持原式不变。
    if (P().mode === 'sim') return a + n * P().rentPrice(s, k);
    return a + n * GPUS[k].rent * f * gpuMarkup(k, s.date, s.company.country) * (s.company.country === 'CN' && !gpuAvailable(k, s.date, 'CN') ? 1.4 : 1);
  }, 0) * cm * bubbleMult(s, 'RENT') * (s.flags?.cloudPartner > s.day ? FUNDING.STRATEGIC.rentMult : 1);
  const legal = s.legal.cases.reduce((a, c) => a + (c.fighting ? c.fee : 0), 0);
  // 严格防蒸馏的风控月费（限速、封号、输出水印），规格 B3：并进月度成本，界面和月结看到的是同一笔。
  const risk = s.service.antiDistill === 'strict' ? ANTI_DISTILL_FEE : 0;
  const rd = rdCost(s) * cm;
  return { staff, owned, rented, rd, legal, risk, total: staff + owned + rented + rd + legal + risk };
}

// ---------- 估值 ----------
const TIER_W = { frontier: 1, major: 0.22, small: 0.035, specialist: 0.07, bigtech: 0 };
export function hypeIndex(s) {
  return hypeRaw(s) * bubbleMult(s, 'HYPE');
}
function hypeRaw(s) {
  // 自洽模式：算力指数（M.3.8 第 6 条），100 = 开局季度；史实模式仍读英伟达股价。
  const chip = P().chipIndex?.(s);
  if (Number.isFinite(chip)) return clamp(chip / 100, 0.5, 1.9);
  const nvda = tickerPrice('NVDA', s.date);
  return clamp(0.55 + 0.22 * Math.log2(nvda / 19), 0.5, 1.9);
}
export function updateValuation(s, monthRevenue) {
  if (s.company.kind === 'division') return;
  return P().valuation(s, monthRevenue, computeValuation);
}
function computeValuation(s, monthRevenue, poolBase) {
  const model = liveModel(s);
  const top = rivalStandings(s, { cls: peerCls(s) })[0];
  const myQ = model ? qOf(s.mod, model.dims) : 0;
  const f = top ? Math.exp((myQ - top.q) / 6) : 1;
  const pool = poolBase * (s.company.country === 'CN' ? 0.22 : 1) * (TIER_W[s.company.tier] || 0.05) * (1 - 0.3 * s.distillDep);
  // 特质的 valuation（E3，例如私有化部署 ×1.08）和行业大事的 valMult 一样乘在业务部分上，现金部分不乘。
  const target = (monthRevenue * 12 * (14 + 20 * s.hype) + pool * clamp(f, 0.05, 2.5) * s.hype) * (s.flags.valMult || 1) * modifier(s, 'valuation') + s.cash * 0.6;
  s.valuation = Math.max(s.valuationFloor, 0.78 * s.valuation + 0.22 * target);
  if (s.capital.listed) {
    const L = s.capital.listed;
    const fair = s.valuation / L.shares;
    const noise = (rand(s) - 0.5) * 0.12;
    L.price = Math.max(0.5, L.price * Math.exp(0.35 * Math.log(fair / L.price) + noise + (s.flags.stockShock || 0)));
    L.history.push([s.date, L.price]);
    if (L.history.length > 60) L.history.shift();
  }
  s.flags.stockShock = 0;
}

// ---------- 行情 ----------
export function tickerListed(t, date) { return !t.listed || date >= t.listed; }
export function tickerPrice(id, date) { return P().price(id, date); }
export function tickerSeries(id, from, to) {
  const t = P().tickers().find(x => x.id === id);
  if (t?.listed && from < t.listed) from = t.listed;
  const out = [];
  let d = from;
  let guard = 0;
  while (d <= to && guard++ < 80) { out.push([d, tickerPrice(id, d)]); d = nextMonth(d); }
  return out;
}
function nextMonth(d) { const [y, m] = d.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; }
export const fx = id => FX[P().tickers().find(t => t.id === id)?.ccy] ?? 1;
export const ccySign = id => ({ HKD: 'HK$', CNY: '¥' }[P().tickers().find(t => t.id === id)?.ccy] || '$');
