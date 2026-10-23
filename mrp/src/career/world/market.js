// 客户市场与 d*（规格 M.3.8 第 1、2 条）：全世界共用一张月结表。
// - settleMarket：每月最后一天、各家月结之前跑一次。每个“产品 × 地区”把各家在售旗舰、小模型、
//   学界自部署和“不用 AI”放在一起做多项 Logit，份额加起来正好 100%。
// - dStar：真实历史里世界最强第一次达到本局当前最强的那一天；市场规模、API 参考价按 d* 查表，
//   做 90 天平滑；本局领先真实历史时封顶在今天日历值的 1.3 倍。
// 史实模式不读这个文件；SimProvider 只在自洽模式下把口子接到这里。
import { MARKET, API_PRICE, interp } from '../data/world.js';
import { PRICE_TIERS, PRODUCTS } from '../data/core.js';
import { RELEASES } from '../data/rivals.js';
import { MARKET_SELF, ACAD } from '../data/selfplay.js';
import { addDays, daysBetween } from '../sim/clock.js';
import { qOf } from '../sim/sota.js';
import { liveModel, smallLive } from '../sim/model.js';
import { P } from '../sim/provider.js';
import { productQ, playerBrand } from '../sim/economy.js';

// 冻结一份真实发布表：SimProvider.openWorld 会把 RELEASES 清空给世界账本用。
// 本文件在模块加载时（任何 createWorld 之前）读一次，之后一直用这份副本。
const REAL = RELEASES
  .filter(r => r.day)
  .map(r => ({ day: r.day, q: qOf(r.mod, r.dims), mod: r.mod }))
  .sort((a, b) => a.day.localeCompare(b.day));
// 各模态各算各的：真实历史里“世界最强”只在同一个模态里比。
const REAL_CUM = {};
for (const r of REAL) {
  const list = REAL_CUM[r.mod] ??= [];
  const prev = list.length ? list[list.length - 1].q : -Infinity;
  list.push({ day: r.day, q: Math.max(prev, r.q) });
}

const SMOOTH = MARKET_SELF.SMOOTH;
const AHEAD_CAP = MARKET_SELF.AHEAD_CAP;

const r6 = x => Math.round(x * 1e6) / 1e6;
const ym = day => String(day).slice(0, 7);
const active = world => Object.values(world.companies).filter(c => !c.frozen && c.s?.status === 'playing');
const regionsFor = s => (s.company.country === 'CN' ? ['CN', 'global'] : ['global']);
const productFrom = (mod, id) => PRODUCTS[mod]?.find(p => p.id === id)?.from ?? '0000-00';

// 价格弹性与 marketShares 一致（economy.js 里的 priceFactor 没有导出，这里照抄同一组指数）。
function priceFactor(product, mult) {
  const e = product === 'api' ? 0.95 : product === 'coding_plan' ? 0.7 : 0.45;
  return Math.pow(1 / mult, e);
}
const kOf = product => (product === 'chat' || product === 'subscription' ? 0.15 : 0.12);

// 测试 / 摘要用：真实历史里逐日累积的世界最强（冻结副本，按模态）。
export function realMilestones(mod = 'llm') { return (REAL_CUM[mod] || []).map(x => ({ ...x })); }

// 真实历史里世界最强第一次达到本局当前最强的那一天（M.3.8 第 2 条）。
// 当前最强 = 公司已发最强和学界最强里较高的那个（worldBestVisible 的口径）。
export function dStar(world, day = world.day) {
  void day;
  const series = REAL_CUM[world.mod] || REAL_CUM.llm || [];
  if (!series.length) return world.startDay;
  let best = world.acad?.q ?? -Infinity;
  for (const q of Object.values(world.label?.best || {})) if (Number.isFinite(q)) best = Math.max(best, q);
  if (!Number.isFinite(best)) return series[0].day;
  let lo = 0, hi = series.length - 1, hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].q >= best - 1e-9) { hit = mid; hi = mid - 1; } else lo = mid + 1;
  }
  // 真实历史没追上本局：取最后一天，后面由 1.3 倍封顶处理。
  return hit >= 0 ? series[hit].day : series[series.length - 1].day;
}

// 90 天平滑：取 d* 往前 90 天（含 d*）的日值平均。表本身按月插值，日采样足够。
// 纯函数（序列是常量表），按“序列 + 中心日”记下来：d* 一变就要把十几条序列各平滑 90 天，联机月末单日耗时的大头（M3a 实测）。
const SMOOTH_CACHE = new WeakMap();
function smooth(series, centerDay) {
  let byDay = SMOOTH_CACHE.get(series);
  if (!byDay) SMOOTH_CACHE.set(series, byDay = new Map());
  const hit = byDay.get(centerDay);
  if (hit !== undefined) return hit;
  let sum = 0;
  for (let i = 0; i < SMOOTH; i++) sum += interp(series, ym(addDays(centerDay, -i)));
  const v = sum / SMOOTH;
  byDay.set(centerDay, v);
  return v;
}

// 市场规模 / API 参考价的月缓存。key 是当前日历月，避免一天里反复平滑。
function ensureRefs(world, day) {
  const key = ym(day);
  const center = dStar(world, day);
  const cacheKey = `${key}|${center}`;
  if (world.market.refs?.cacheKey === cacheKey) return world.market.refs;
  const tam = {}, api = {};
  for (const [product, byRegion] of Object.entries(MARKET)) {
    tam[product] = {};
    for (const [region, series] of Object.entries(byRegion)) {
      const today = interp(series, key);
      tam[product][region] = Math.min(smooth(series, center), today * AHEAD_CAP);
    }
  }
  for (const [region, series] of Object.entries(API_PRICE)) {
    const today = interp(series, key);
    api[region] = Math.min(smooth(series, center), today * AHEAD_CAP);
  }
  world.market.dStar = center;
  world.market.refs = { key, cacheKey, dStar: center, tam, api };
  // 这三个字段是给存档 / 哈希看的稳定读数，refs 是缓存。
  world.market.tam = tam;
  world.market.api = api;
  world.market.refPrice = api.global ?? null;
  return world.market.refs;
}

export function marketDateOf(world, s) {
  const day = typeof s === 'string' ? s : s?.day ?? world.day;
  return ensureRefs(world, day).dStar;
}

export function marketValueOf(world, product, region, s) {
  const day = typeof s === 'string' ? s : s?.day ?? world.day;
  const refs = ensureRefs(world, day);
  return refs.tam?.[product]?.[region] ?? 0;
}

// API 参考价还要读触发器写下的两件事（M.3.9）：地区价格战 ×0.6 持续 90 天；开源冲击 −10%，90 天线性恢复。
// 这两项不进 ensureRefs 的缓存，否则同一月里价格不会变。
function shockSum(list, day) {
  const DAYS = 90;
  let sum = 0;
  for (const x of list || []) {
    const age = daysBetween(x.day, day);
    if (age < 0 || age >= DAYS) continue;
    sum += x.amount * (1 - age / DAYS);
  }
  return sum;
}
export function apiPriceOf(world, region, s) {
  const day = String(typeof s === 'string' ? s : s?.day ?? world.day);
  const refs = ensureRefs(world, day);
  const until = world.flags?.priceWar?.[region];
  const war = until && day <= until ? 0.6 : 1;
  const shock = 1 + shockSum(world.flags?.apiShocks, day);
  return (refs.api?.[region] ?? 0) * war * shock;
}

// 一家公司在 API 市场里的份额与“平均份额”（M.3.11 的 share 目标）。
// 只读共用月结表：份额 = 这家在这个地区所有 API SKU 的份额之和；平均份额 = 1 ÷ 参与者数（含“不用 AI”）。
// 有多个地区时取“相对平均份额最宽裕”的那个地区；没有月结表或没在卖 API 时返回 0。
export function apiShareOf(world, org, day = world.day) {
  let best = { share: 0, avg: 0, region: null };
  for (const entry of Object.values(world.market?.table || {})) {
    if (entry.product !== 'api' || entry.day > day) continue;
    const mine = entry.rows.filter(r => r.org === org);
    if (!mine.length) continue;
    const share = mine.reduce((a, r) => a + r.share, 0);
    const n = new Set(entry.rows.map(r => r.org)).size + 1;
    const avg = n > 0 ? 1 / n : 0;
    if (avg > 0 && (best.region === null || share - avg / 2 > best.share - best.avg / 2)) best = { share, avg, region: entry.region };
  }
  return best;
}

// 学界当前的自部署：取最近一行（学界的行才进世界表）。
function acadRow(world, day) {
  let best = null;
  for (const x of Object.values(world.relMeta || {})) {
    if (x.org !== 'academia' || x.day > day) continue;
    if (!best || x.day > best.day) best = x;
  }
  return best;
}

// 一家公司在某个产品、地区里在售的 SKU。条件与 economy.js 的 simulateService 一致。
function skusOf(s, product, region, marketDay) {
  const out = [];
  const p = s.products || {};
  if (!liveModel(s)) return out;
  if (s.mod === 'llm') {
    if (product === 'chat' && p.chat?.on) {
      const canSell = s.service?.filing !== 'pending' &&
        (region !== 'CN' || s.company.country !== 'CN' || s.service.filing === 'done' || !P().gate('cnFiling', s));
      if (canSell) out.push({ role: 'flagship', tier: p.chat.tier || 'standard', q: productQ(s.mod, 'chat', dimsOf(s, 'flagship'), marketDay), name: liveModel(s)?.name, modelId: liveModel(s)?.id, open: !!liveModel(s)?.open });
    }
    if (product === 'api' && p.api?.on) {
      out.push({ role: 'flagship', tier: p.api.tier || 'standard', q: productQ(s.mod, 'api', dimsOf(s, 'flagship'), marketDay), name: liveModel(s)?.name, modelId: liveModel(s)?.id, open: !!liveModel(s)?.open });
      const small = smallLive(s);
      if (small && p.api.small !== false) {
        out.push({ role: 'small', tier: p.api.smallTier || 'budget', q: productQ(s.mod, 'api', small.dims, marketDay), brandMult: 0.9, modelId: small.id, name: small.name, open: !!small.open });
      }
    }
    if (product === 'coding_plan' && p.coding_plan?.on && s.date >= productFrom(s.mod, 'coding_plan')) {
      out.push({ role: 'flagship', tier: p.coding_plan.tier || 'standard', q: productQ(s.mod, 'coding_plan', dimsOf(s, 'flagship'), marketDay), name: liveModel(s)?.name, modelId: liveModel(s)?.id, open: !!liveModel(s)?.open });
    }
  } else {
    if (product === 'subscription' && p.subscription?.on) out.push({ role: 'flagship', tier: p.subscription.tier || 'standard', q: productQ(s.mod, 'sub', dimsOf(s, 'flagship'), marketDay), name: liveModel(s)?.name, modelId: liveModel(s)?.id, open: !!liveModel(s)?.open });
    if (product === 'api' && p.api?.on && s.date >= productFrom(s.mod, 'api')) out.push({ role: 'flagship', tier: p.api.tier || 'standard', q: productQ(s.mod, 'api', dimsOf(s, 'flagship'), marketDay), name: liveModel(s)?.name, modelId: liveModel(s)?.id, open: !!liveModel(s)?.open });
  }
  return out;
}
function dimsOf(s, role) {
  if (role === 'small') return smallLive(s)?.dims || {};
  return liveModel(s)?.dims || {};
}

// 学界自部署的 SKU：用最近一行，按同一个 productQ 折算。
function acadSku(world, s, product, marketDay, day) {
  const row = acadRow(world, day);
  if (!row) return null;
  const q = s.mod === 'llm' ? productQ(s.mod, product === 'subscription' ? 'sub' : product, row.dims, marketDay) : row.q;
  return { role: 'flagship', tier: 'budget', q, name: row.name, modelId: null, open: true };
}

// 每月一次的共用月结（M.3.8 第 1 条）。
export function settleMarket(world, day = world.day) {
  ensureRefs(world, day);
  const table = {};
  const live = active(world);
  const marketDay = world.market.refs.dStar;
  const products = world.mod === 'llm' ? ['chat', 'api', 'coding_plan'] : ['subscription', 'api'];
  // 地区集合：任何一家 CN 公司都要同时在 CN 和 global 卖；其余公司只在 global。
  const regions = new Set(['global']);
  for (const c of live) if (c.s.company.country === 'CN') regions.add('CN');
  for (const product of products) {
    for (const region of regions) {
      const rows = [];
      for (const c of live) {
        const s = c.s;
        if (!regionsFor(s).includes(region)) continue;
        for (const sku of skusOf(s, product, region, marketDay)) {
          const brand = playerBrand(s, product, region) * (sku.brandMult || 1);
          rows.push({
            org: c.id, role: sku.role, name: sku.name ?? liveModel(s)?.name ?? c.name,
            modelId: sku.modelId ?? (sku.role === 'flagship' ? liveModel(s)?.id ?? null : null),
            family: c.id, company: s.company.company, q: sku.q, brand,
            price: priceFactor(product, PRICE_TIERS[sku.tier].mult), tier: sku.tier,
            open: !!sku.open, region, product,
          });
        }
      }
      // 学界自部署：品牌用 ACAD.BRAND；地区系数照 rivalEntries 的写法（学界算海外、开源、普惠）。
      const ac = acadSku(world, live[0]?.s ?? { mod: world.mod }, product, marketDay, day);
      if (ac) {
        const rf = region === 'CN' ? 0.06 : 1;
        rows.push({
          org: 'academia', role: 'flagship', name: '学界自部署', modelId: null, family: 'academia',
          company: '学界与开源社区', q: ac.q, brand: ACAD.BRAND * rf,
          price: priceFactor(product, PRICE_TIERS.budget.mult), tier: 'budget',
          open: true, region, product,
        });
      }
      const k = kOf(product);
      const qmax = rows.reduce((a, r) => Math.max(a, r.q), 1);
      for (const r of rows) r.w = Math.exp(k * (r.q - qmax)) * r.brand * r.price;
      const outsideW = MARKET_SELF.OUTSIDE[product] ?? 0.5;
      const total = rows.reduce((a, r) => a + r.w, 0) + outsideW;
      for (const r of rows) r.share = total > 0 ? r.w / total : 0;
      table[`${product}|${region}`] = {
        product, region, day, rows,
        outside: { w: outsideW, share: total > 0 ? outsideW / total : 0 },
        total: r6(total),
      };
    }
  }
  world.market.month = ym(day);
  world.market.day = day;
  world.market.table = table;
  return table;
}

// 各家月结时读月结表（M.3.2 shareOf）。表里没有这一格（比如月初第一次预览）就退回各家自算。
export function shareOf(world, s, product, region, skus, local) {
  const entry = world.market.table?.[`${product}|${region}`];
  const org = s.charId ?? s.company?.id;
  if (!entry) return local(s, product, region, skus);
  const mine = entry.rows.filter(r => r.org === org);
  if (mine.length !== (skus?.length ?? 0)) return local(s, product, region, skus);
  const others = entry.rows.filter(r => r.org !== org);
  return {
    mine: mine.map(r => ({ ...r, share: r.share })),
    others: others.map(r => ({ ...r, share: r.share })),
    outside: { ...entry.outside },
  };
}

// 测试 / 摘要用：这一格所有参与者的份额合计（含“不用 AI”）。
export function shareTotal(entry) {
  return entry.rows.reduce((a, r) => a + r.share, 0) + (entry.outside?.share ?? 0);
}
