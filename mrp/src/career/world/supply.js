// 算力共用供给池（规格 M.3.8 第 3 条）：全世界每季度共用一份配额、季末统一价、租卡池。
// - 总供给 = Σ 在场公司开局档的原配额（QUOTA）× SUPPLY_SELF.MULT；新卡头两个季度减半沿用 quotaFor。
// - 下单按目录价预扣，交期照 LEAD；季末按 需求/供给 算全季统一价，多退少补。
//   超出供给的部分按订单比例分配，没分到的顺延到下季度优先交付。
// - 租卡：出租的卡进池子，租入的需求和它对冲；现货租金 = 那张卡自己的月租 × RENT_FACTOR × (需求/供给)^0.5，
//   不低于 0.5 倍。公司之间不直接租，一律经过池子。
// - 出口管制只读 world.flags.export（开局状态算前人遗产，触发在 M1b-2）。
import { GPUS, RENT_FACTOR, gpuMarkup, gpuAvailable as histGpuAvailable } from '../data/core.js';
import { BUBBLE, FUNDING } from '../data/economy.js';
import { quotaFor, quarterOf, RENT_QUOTA } from '../data/supply.js';
import { SUPPLY_SELF } from '../data/selfplay.js';
import { addDays } from '../sim/clock.js';
import { leaseGpus } from '../sim/model.js';

const active = world => Object.values(world.companies).filter(c => !c.frozen && c.s?.status === 'playing');
const r2 = x => Math.round(x * 100) / 100;

// 下一个季度（用季度最后一天表示，交期从这一天之后算）。
function nextQuarter(day) {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  if (m <= 3) return `${y}-04-01`;
  if (m <= 6) return `${y}-07-01`;
  if (m <= 9) return `${y}-10-01`;
  return `${y + 1}-01-01`;
}

// 每季度每种卡的世界总供给（M.3.8 第 3 条）。
export function quarterCap(world, day = world.day) {
  // 联机客户端的镜像（world/mirror.js）没有别家的状态：配额读服务器给的公开汇总。
  if (world.mirror) return world.supply.cap || {};
  const q = quarterOf(day);
  if (world.supply.capQ === q && world.supply.cap) return world.supply.cap;
  const cap = capOf(world, day);
  world.supply.capQ = q;
  world.supply.cap = cap;
  world.supply.quarter = q;
  return cap;
}
// 只读版（公开视图用）：不写缓存，算一份当季配额。视图每天都会算，写缓存会让世界和重放对不上。
export function quarterCapView(world, day = world.day) {
  const q = quarterOf(day);
  return world.supply.capQ === q && world.supply.cap ? world.supply.cap : capOf(world, day);
}
function capOf(world, day) {
  const cap = {};
  for (const id of Object.keys(GPUS)) {
    const g = GPUS[id];
    if (day < g.from || (g.to && day > g.to)) { cap[id] = 0; continue; }
    let n = 0;
    for (const c of active(world)) n += quotaFor(c.tier0, id, day);
    cap[id] = Math.round(n * SUPPLY_SELF.MULT);
  }
  return cap;
}

// ---------- 订单账本 ----------
// s.orders 里到货的订单会被 dailyOrders 删掉，季末要按“整季下过的单”统一结算，所以世界另记一份账本。
// 每天开盘时扫一遍 s.orders 把新订单记进来；测试直接调 settleSupply 时也会先扫一遍。
export function trackOrders(world, day = world.day) {
  const S = world.supply;
  S.entries ??= [];
  S.byKey ??= {};
  S.seq ??= 0;
  for (const c of active(world)) {
    const s = c.s;
    for (const o of s.orders || []) {
      if (o.kind !== 'gpu') continue;
      if (!o.wKey) {
        const wKey = ++S.seq;
        o.wKey = wKey;
        const unit = o.n > 0 && Number.isFinite(o.cost) ? o.cost / o.n : GPUS[o.ref]?.price * gpuMarkup(o.ref, o.placed, s.company.country);
        const e = {
          wKey, org: c.id, ref: o.ref, n: o.n, unit, cost: o.cost || 0,
          placed: o.placed, eta: o.eta, q: quarterOf(o.placed), carry: !!o.carry, settled: null,
        };
        S.entries.push(e);
        S.byKey[wKey] = e;
      } else {
        const e = S.byKey[o.wKey];
        if (e && !e.settled) { e.n = o.n; e.cost = o.cost || 0; e.eta = o.eta; }
      }
    }
  }
  return S.entries;
}

export function purchasesInQuarter(world, q) {
  trackOrders(world, world.day);
  return (world.supply.entries || []).filter(e => e.q === q && !e.carry).reduce((a, e) => a + e.n, 0);
}

// 按比例分配预算，退货最大的先拿。返回剩下没分出去的量（总为 0：按比例分配不会超过预算）。
function allocate(list, budget) {
  const total = list.reduce((a, e) => a + e.n, 0);
  if (total <= 0) return budget;
  if (total <= budget) { for (const e of list) e.award = e.n; return budget - total; }
  const raw = list.map(e => e.n * budget / total);
  const awards = raw.map(Math.floor);
  let left = budget - awards.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; k < left; k++) awards[order[k % order.length][1]] += 1;
  for (let i = 0; i < list.length; i++) list[i].award = awards[i];
  return 0;
}

function findOrder(s, wKey) {
  return (s.orders || []).find(o => o.wKey === wKey) || null;
}

// 把没分到的量挂到下季度优先交付（钱已经在季末按实际分到的量结清，这里成本为 0）。
function addCarry(world, s, id, n, unit, q, day) {
  const S = world.supply;
  const wKey = ++S.seq;
  const eta = addDays(day, 1);
  const o = { kind: 'gpu', ref: id, n, eta, cost: 0, carry: true, wKey, placed: day };
  s.orders.push(o);
  s.orders.sort((a, b) => a.eta.localeCompare(b.eta));
  const e = { wKey, org: s.charId, ref: id, n, unit, cost: 0, placed: day, eta, q, carry: true, settled: null };
  S.entries.push(e);
  S.byKey[wKey] = e;
  return e;
}

// 季末结算（M.3.8 第 3 条；M.4 开盘那一步调用）。capOverride 只给测试用。
export function settleSupply(world, day = world.day, capOverride = null) {
  trackOrders(world, day);
  const q = quarterOf(day);
  const nq = quarterOf(nextQuarter(day));
  const cap = capOverride || quarterCap(world, day);
  const S = world.supply;
  const list = (S.entries || []).filter(e => e.q === q && !e.settled);
  const ids = [...new Set(list.map(e => e.ref))];
  const factors = {};
  const report = { quarter: q, day, cap: {}, demand: {}, factor: {}, deferred: {} };
  for (const id of ids) {
    const all = list.filter(e => e.ref === id);
    const prio = all.filter(e => e.carry);
    const fresh = all.filter(e => !e.carry);
    const capN = Math.max(0, Number(cap[id] || 0));
    const prioQ = prio.reduce((a, e) => a + e.n, 0);
    const freshQ = fresh.reduce((a, e) => a + e.n, 0);
    const demand = prioQ + freshQ;
    // 全季统一价：目录价 × (需求/供给)^0.5；供给为 0 时按目录价，全部顺延。
    const factor = capN > 0 ? Math.pow(demand / capN, SUPPLY_SELF.PRICE_EXP) : 1;
    factors[id] = factor;
    let remain = capN;
    // 上季度没分到的先交付（优先），剩下的才给本季新订单。
    const used = Math.min(prioQ, remain);
    allocate(prio, remain);
    remain -= used;
    allocate(fresh, remain);
    report.cap[id] = capN;
    report.demand[id] = demand;
    report.factor[id] = r2(factor);
    report.deferred[id] = 0;
    for (const e of all) {
      const award = Math.max(0, Math.min(e.n, e.award ?? e.n));
      const charge = e.unit * factor * award;
      const s = world.companies[e.org]?.s;
      if (!s) continue;
      // 多退少补：预扣的是目录价，这里按统一价重算。
      s.cash += (e.cost || 0) - charge;
      e.settled = q;
      e.award = award;
      e.factor = factor;
      e.charge = charge;
      const o = findOrder(s, e.wKey);
      if (award < e.n) {
        const missing = e.n - award;
        report.deferred[id] += missing;
        if (o) {
          // 还在路上的订单：减少到分到的量；到货日不变（照 LEAD，不会因为季末就提前）。
          if (award > 0) { o.n = award; o.cost = charge; } else s.orders = s.orders.filter(x => x !== o);
        } else if (e.eta <= day) {
          // 已经到货的：把多分的卡收回（全季统一价下，所有订单按同一个比例分）。
          const owned = s.gpus.owned[id] || 0;
          if (owned > 0) s.gpus.owned[id] = Math.max(0, owned - missing);
        }
        if (missing > 0) addCarry(world, s, id, missing, e.unit, nq, day);
      } else if (o) {
        o.cost = charge;
      }
    }
  }
  S.factor ??= {};
  S.factor[q] = factors;
  S.last = report;
  S.history ??= [];
  S.history.push(report);
  if (S.history.length > 24) S.history.shift();
  S.quarter = q;
  return report;
}

// ---------- 租卡池 ----------
// 出租的卡进池子，增加供给；租入的需求（已经租到的 + 在途的）和它对冲。
// 云上还有一份基础供给：沿用原来的 RENT_QUOTA（不再按档位限制单个公司能租多少，池子用完为止）。
export function rentPool(world, day = world.day) {
  if (world.mirror) return { cloud: 0, leased: 0, supply: 0, demand: 0, factor: 1, ...(world.supply.rent || {}) };
  let cloud = 0, leased = 0, demand = 0;
  for (const c of active(world)) {
    const s = c.s;
    cloud += RENT_QUOTA[c.tier0] || 256;
    leased += leaseGpus(s);
    demand += Object.values(s.gpus.rented || {}).reduce((a, n) => a + n, 0);
    for (const o of s.orders || []) if (o.kind === 'rent' && o.eta > day) demand += o.n;
  }
  const supply = cloud + leased;
  const factor = supply > 0 ? Math.max(SUPPLY_SELF.RENT_FLOOR, Math.pow(demand / supply, SUPPLY_SELF.RENT_EXP)) : 1;
  return { supply, cloud, leased, demand, factor };
}

export function rentQuotaOf(world, s) {
  const pool = rentPool(world, s.day);
  const base = RENT_QUOTA[s.company.tier] || 256;
  const left = Math.max(0, pool.supply - pool.demand);
  return Math.round(Math.min(base, left));
}

export function rentPriceOf(world, s, id) {
  const g = GPUS[id];
  if (!g) return 0;
  const f = RENT_FACTOR[Math.max(2023, Math.min(2026, Number(String(s.date).slice(0, 4))))];
  const pool = rentPool(world, s.day);
  const banned = s.company.country === 'CN' && !gpuAvailableOf(world, id, s.date, 'CN');
  const b = world.flags?.bubble;
  const bub = b && !b.averted && s.day >= b.day && s.day < b.until ? BUBBLE.RENT : 1;
  const partner = s.flags?.cloudPartner > s.day ? FUNDING.STRATEGIC.rentMult : 1;
  return g.rent * f * pool.factor * gpuMarkup(id, s.date, s.company.country) * (banned ? 1.4 : 1) * bub * partner;
}

// 出租收入按那张卡自己的月租算：手里各型号按张数加权平均。
export function averageRentOf(world, s) {
  const owned = s.gpus.owned || {};
  let n = 0, sum = 0;
  for (const [id, k] of Object.entries(owned)) {
    if (!GPUS[id] || !(k > 0)) continue;
    n += k;
    sum += k * rentPriceOf(world, s, id);
  }
  if (n > 0) return sum / n;
  return rentPriceOf(world, s, s.company.country === 'CN' ? 'H800' : 'H100');
}

// ---------- 口子 ----------
export function gpuQuotaOf(world, s, id) {
  return quarterCap(world, s.day)[id] || 0;
}

export function gpuPriceOf(world, s, id) {
  const g = GPUS[id];
  if (!g) return 0;
  const q = quarterOf(s.date);
  const factor = world.supply.factor?.[q]?.[id] ?? 1;
  return g.price * gpuMarkup(id, s.date, s.company.country) * factor;
}

// 出口管制只读 world.flags.export：生效时沿用现有按型号的规则；未生效时只受上市 / 停产限制。
export function gpuAvailableOf(world, id, date, country) {
  if (!Object.hasOwn(GPUS, id)) return false;
  const g = GPUS[id];
  if (date < g.from || (g.to && date > g.to)) return false;
  if (g.cnOnly && country !== 'CN') return false;
  if (country === 'CN') return world.flags.export ? histGpuAvailable(id, date, country) : true;
  return histGpuAvailable(id, date, country) || (!g.cnOnly && date >= g.from && !(g.to && date > g.to));
}

