// 基本面估值、公司档位与指数（规格 M.3.8 第 4、5、6 条）。
// V_i = P × w_i / Σw + 资产_i；P = max(Σ 开局估值, Σ 客户收入 × MULT × 情绪)。
// 客户收入只算对话、订阅、API、Coding Plan 四项，不含公司之间的钱，不含出租显卡。
// 期待加成来自 D11 结果，90 天内线性衰减到 0；情绪只读冲击项，所以大户买卡不抬高别家的 V。
import { holdingsLiquidation, shortsBuyback, marginCash, sectorIndex as exchangeSectorIndex } from './exchange.js';
import { GPUS } from '../data/core.js';
import { FX } from '../data/world.js';
import { VALUE_SELF, INDEX } from '../data/selfplay.js';
import { EXPECT_FX } from '../data/expect.js';
import { BUBBLE } from '../data/economy.js';
import { quarterOf } from '../data/supply.js';
import { clamp, rand } from '../sim/util.js';
import { daysBetween } from '../sim/clock.js';
import { liveModel } from '../sim/model.js';
import { qOf } from '../sim/sota.js';
import { P } from '../sim/provider.js';
import { purchasesInQuarter } from './supply.js';

const CUSTOMER_KEYS = ['chat', 'subscription', 'api', 'coding_plan'];
const active = world => Object.values(world.companies).filter(c => !c.frozen && c.s?.status === 'playing');
const r2 = x => Math.round(x * 100) / 100;

// 近 12 个月共用月结里的客户收入（四项）。月结时这一项还没写进 s.history，所以取过去 12 个已结月份。
export function customerRevenue(s) {
  let sum = 0;
  for (const row of (s.history || []).slice(-12)) {
    for (const k of CUSTOMER_KEYS) sum += row.rev?.[k] || 0;
  }
  return sum;
}

// D11 结果折算的期待加成：log(估值倍数) × 90 天线性衰减。
export function expectBonus(s, day = s.day) {
  let b = 0;
  for (const row of s.expect?.log || []) {
    const fx = EXPECT_FX[row.tier]?.[row.result]?.valuation;
    if (!(fx > 0) || fx === 1) continue;
    const age = daysBetween(row.day, day);
    if (age < 0 || age >= VALUE_SELF.EXP_DAYS) continue;
    b += Math.log(fx) * (1 - age / VALUE_SELF.EXP_DAYS);
  }
  // 互动带来的期待减项（M.5.2 公开指控）：同样 90 天线性衰减。
  for (const row of s.vShocks || []) {
    const age = daysBetween(row.day, day);
    if (age < 0 || age >= VALUE_SELF.EXP_DAYS) continue;
    b += row.log * (1 - age / VALUE_SELF.EXP_DAYS);
  }
  return b;
}

// 持仓按“整仓卖回池子”拿到的现金、空头按“整仓买回”要付的现金（M.3.8 第 4 条，M2a 接上交易所）；押着的保证金算现金。
// 没有世界（老调用方）时退回按池价估。
const holdingsValue = (s, world) => (world ? holdingsLiquidation(world, s) : Object.entries(s.market?.holdings || {})
  .reduce((a, [id, n]) => a + n * P().price(id, s.date) * (FX[P().tickers().find(t => t.id === id)?.ccy] ?? 1), 0));
const shortsValue = (s, world) => (world ? shortsBuyback(world, s) : Object.entries(s.market?.shorts || {})
  .reduce((a, [id, n]) => a + n * P().price(id, s.date) * (FX[P().tickers().find(t => t.id === id)?.ccy] ?? 1), 0));

// 资产：净现金 + 自有显卡回收价 + 持仓整仓卖回的现金 − 空头整仓买回的现金。
export function assetsOf(s, world = null) {
  const gpu = Object.entries(s.gpus?.owned || {}).reduce((a, [id, n]) => a + (GPUS[id]?.price || 0) * n * VALUE_SELF.GPU_RESALE, 0);
  return (s.cash || 0) + gpu + marginCash(s) + holdingsValue(s, world) - shortsValue(s, world);
}

function worldBest(world, day) {
  let best = world.acad?.q ?? -Infinity;
  for (const x of Object.values(world.relMeta || {})) if (x.day <= day) best = Math.max(best, x.q);
  return best;
}
function topQ(world, org, day) {
  let best = -Infinity;
  for (const x of Object.values(world.relMeta || {})) if (x.org === org && x.day <= day) best = Math.max(best, x.q);
  return best;
}

// 情绪只读冲击项（M.3.9 的行业大事），夹在 [0.7, 1.2]。买卡量不进这里。
function sentimentOf(world) {
  const shock = Number(world.flags?.valShock || 0) + Number(world.flags?.sentimentShock || 0);
  return clamp(1 + shock, VALUE_SELF.SENT[0], VALUE_SELF.SENT[1]);
}

// 估值快照会缓存到当天：同一天里各家月结读到的 P 和 Σw 必须是同一份。
const VIEW = new WeakMap();
export function valuationView(world, day = world.day, { fresh = false } = {}) {
  const cached = VIEW.get(world);
  if (!fresh && cached?.day === day) return cached.view;
  const live = active(world);
  const rev = {}, w = {}, q = {}, bonus = {}, assets = {};
  const pool0 = live.reduce((a, c) => a + (c.s.valuationStart || 0), 0);
  const wb = worldBest(world, day);
  for (const c of live) {
    const s = c.s;
    const org = c.id;
    rev[org] = customerRevenue(s);
    assets[org] = assetsOf(s, world);
    const lm = liveModel(s);
    q[org] = lm ? qOf(s.mod, lm.dims) : (Number.isFinite(topQ(world, org, day)) ? topQ(world, org, day) : 0);
    bonus[org] = expectBonus(s, day);
    w[org] = Math.exp(
      VALUE_SELF.W_REV * Math.log(1 + rev[org] / 1e7) +
      VALUE_SELF.W_Q * (q[org] - (Number.isFinite(wb) ? wb : q[org])) +
      VALUE_SELF.W_EXP * bonus[org],
    );
  }
  const sentiment = sentimentOf(world);
  // AI 泡沫破裂后 180 天内，估值池腰斩（规格 K5）。
  const b = world.flags?.bubble;
  const bub = b && !b.averted && day >= b.day && day < b.until ? BUBBLE.VAL : 1;
  const pool = Math.max(pool0, live.reduce((a, c) => a + rev[c.id], 0) * VALUE_SELF.MULT * sentiment) * bub;
  const sumW = Object.values(w).reduce((a, x) => a + x, 0) || 1;
  const rows = {};
  for (const c of live) {
    const org = c.id;
    const V = pool * (w[org] || 0) / sumW + assets[org];
    rows[org] = { org, V, w: w[org] || 0, assets: assets[org], revenue: rev[org], q: q[org], bonus: bonus[org] };
  }
  const view = { day, pool, pool0, sentiment, sumW, rows };
  VIEW.set(world, { day, view });
  return view;
}

// 供各家月结读：写 s.valuation，并按原来的方式更新上市公司股价（M2 之前只有这一条渠道）。
export function valuationOf(world, s, monthRevenue = 0) {
  void monthRevenue;
  const view = valuationView(world, s.day);
  const row = view.rows[s.charId];
  // P 和 Σw 用开盘时算好的同一份；资产取这家公司此刻的现金 / 显卡 / 持仓，月结时刚入的账能算进去。
  const V = Math.max(0, (row ? view.pool * row.w / view.sumW : 0) + assetsOf(s, world));
  s.valuation = V;
  if (s.capital?.listed) {
    const L = s.capital.listed;
    const fair = V / L.shares;
    const noise = (rand(s) - 0.5) * 0.12;
    L.price = Math.max(0.5, L.price * Math.exp(0.35 * Math.log(fair / L.price) + noise + (s.flags.stockShock || 0)));
    L.history.push([s.date, L.price]);
    if (L.history.length > 60) L.history.shift();
  }
  s.flags.stockShock = 0;
  return V;
}

// 公司档位（M.3.8 第 5 条）：每季度按 V 排；前 15% frontier、15%–50% major、其余 small。
// 连续两个季度落在同一档才升降。
export function settleTiers(world, day = world.day) {
  const view = valuationView(world, day, { fresh: true });
  const list = Object.entries(view.rows).sort((a, b) => b[1].V - a[1].V || (a[0] < b[0] ? -1 : 1));
  const n = list.length;
  if (!n) return world.valuation.tiers || {};
  const frontierN = Math.max(1, Math.ceil(n * 0.15));
  const majorN = Math.max(frontierN, Math.ceil(n * 0.5));
  const bag = world.valuation.tiers ??= {};
  for (let i = 0; i < list.length; i++) {
    const [org] = list[i];
    const s = world.companies[org]?.s;
    const target = i < frontierN ? 'frontier' : i < majorN ? 'major' : 'small';
    const rec = bag[org] ??= { tier: s?.company.tier ?? 'small', cand: null, streak: 0 };
    if (rec.tier === target) { rec.cand = target; rec.streak = 0; }
    else {
      if (rec.cand === target) rec.streak = (rec.streak || 0) + 1;
      else { rec.cand = target; rec.streak = 1; }
      if (rec.streak >= 2) { rec.tier = target; rec.streak = 0; }
    }
    rec.rank = i + 1;
    rec.V = r2(view.rows[org].V);
  }
  world.valuation.tierDay = day;
  return bag;
}

export function tierOf(world, s) {
  const org = s?.charId;
  return world.valuation.tiers?.[org]?.tier ?? s?.company?.tier ?? 'small';
}

// 算力指数（M.3.8 第 6 条）：100 × (本季全世界买卡数 ÷ 开局季度)^0.3 × (1 + 冲击项)。
// 冲击项来自开源冲击（M.3.9）：触发器写 world.flags.chipShocks，90 天内线性回到 0。
// 触发器每天也会把当前值写进 world.flags.chipShock 给界面读；这里再按天算一遍，测试直接调 updateChipIndex 也对。
function chipShock(world, day = world.day) {
  const list = world.flags?.chipShocks;
  if (Array.isArray(list) && list.length) {
    let sum = 0;
    for (const x of list) {
      const age = daysBetween(x.day, day);
      if (age < 0 || age >= INDEX.SHOCK_DAYS) continue;
      sum += x.amount * (1 - age / INDEX.SHOCK_DAYS);
    }
    return sum;
  }
  return Number(world.flags?.chipShock || 0);
}

export function updateChipIndex(world, day = world.day) {
  const idx = world.index ??= { baseQ: null, base: 1, quarter: null, chip: 100, noShock: 100 };
  const q = quarterOf(day);
  const cur = purchasesInQuarter(world, q);
  if (!idx.baseQ) { idx.baseQ = q; idx.base = Math.max(1, cur); }
  const ratio = cur / Math.max(1, idx.base);
  idx.quarter = q;
  idx.bought = cur;
  idx.noShock = 100 * Math.pow(ratio, INDEX.CHIP_EXP);
  idx.chip = idx.noShock * (1 + chipShock(world));
  return idx;
}

export const chipIndexValue = world => world.index?.chip ?? 100;
export const chipIndexNoShock = world => world.index?.noShock ?? 100;
export const ipoOpenOf = world => chipIndexNoShock(world) >= INDEX.IPO_MIN * 100;

// AI 板块指数：全部上市公司按市值加权，要等股市（M2）才有可读的东西；M1 返回 null。
export function sectorIndex(world) { return exchangeSectorIndex(world); }

export { CUSTOMER_KEYS };
