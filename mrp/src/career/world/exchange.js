// 自洽和联机的股市（规格 M.5.5、M.5.10）。只有自洽和联机读，史实模式不碰。
// 每家上市公司一个恒定乘积做市池（股数 × 现金 = k，手续费 0.3% 留在池里，k 只增不减），不做订单簿。
// NPC 价值资金每天开盘把池价往“V ÷ 总股本”拉回对数差的 10%；V 从不读市价，所以抬别人、砸别人的股价，
// 都改变不了那家老板的身家（M.5.10）。做空借 NPC 长线基金的票，押 150% 保证金，跌破 130% 次日开盘按同一个池价强平。
import { EXCHANGE } from '../data/exchange.js';
import { VALUE_SELF } from '../data/selfplay.js';
import { addDays, daysBetween } from '../sim/clock.js';
import { moneyFrozen, newbieDays } from './transfer.js';

const X = EXCHANGE;
export const SHARES0 = 1e9;          // 上市前的总股本：创始团队按 s.equity 持有，其余是早期投资人
const EPS = 1e-9;
const HIST_MAX = 400;

export function initExchange(world) {
  world.exchange ??= {};
  const ex = world.exchange;
  ex.listings ??= {};
  ex.npc ??= { valueCash: 0, valueShares: {} };    // 价值资金从外面拿钱进出：花掉的现金记负，换来的股数记正
  ex.vol ??= { day: null, used: {} };              // 当天累计成交额：`${交易方}|${股票}` → 美元
  ex.notices ??= {};                               // 持股公示：`${持有方}|${股票}` → 上次公示时的比例
  ex.sector ??= { div: null, value: null };        // AI 板块指数：市值加权，新股上市时调除数保持连续
  return ex;
}

const listingOf = (world, org) => world.exchange?.listings?.[org] ?? null;
export const isListed = (world, org) => !!listingOf(world, org);
export const poolPrice = L => L.pool.c / L.pool.s;
const companyS = (world, org) => world.companies?.[org]?.s ?? null;
const nameOf = (world, org) => world.companies?.[org]?.name ?? org;
// 公允价 = V ÷ 总股本。
export function fairPrice(world, L) {
  const s = companyS(world, L.org);
  return Math.max(EPS, (s?.valuation || 0) / L.total);
}

// ---------- 池子的算术（不含任何上限） ----------
// 用 usd 现金买：全部 usd 进池，按扣掉手续费的部分换股（k 只增不减）。返回换出的股数。
function sharesForUsd(L, usd) {
  const { s, c } = L.pool;
  return s - (s * c) / (c + usd * (1 - X.FEE));
}
// 卖 n 股：按扣掉手续费的部分算能拿走的现金。
function usdForShares(L, n) {
  const { s, c } = L.pool;
  return c - (s * c) / (s + n * (1 - X.FEE));
}
// 买到恰好 n 股要付多少现金。
function costOfShares(L, n) {
  const { s, c } = L.pool;
  if (!(n < s)) return Infinity;
  return ((s * c) / (s - n) - c) / (1 - X.FEE);
}
const priceAfterBuy = (L, usd) => (L.pool.c + usd) / (L.pool.s - sharesForUsd(L, usd));
const priceAfterSell = (L, n) => (L.pool.c - usdForShares(L, n)) / (L.pool.s + n);

// 在 [0, hi] 里找满足 ok(x) 的最大 x（ok 单调：小的都满足）。
function maxWhere(hi, ok) {
  if (ok(hi)) return hi;
  let lo = 0;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
  return lo;
}

// ---------- 每天的参照（涨跌停、成交上限都按开盘那一刻的池子算） ----------
function refresh(world, L) {
  if (L.refDay === world.day) return;
  L.refDay = world.day;
  L.openP = poolPrice(L);
  L.openC = L.pool.c;
}
function volKey(world, trader, org) {
  const ex = world.exchange;
  if (ex.vol.day !== world.day) { ex.vol.day = world.day; ex.vol.used = {}; }
  return `${trader}|${org}`;
}
function volLeft(world, L, trader) {
  const k = volKey(world, trader, L.org);
  return Math.max(0, X.DAY_CAP * L.openC - (world.exchange.vol.used[k] || 0));
}
function useVol(world, L, trader, usd) {
  const k = volKey(world, trader, L.org);
  world.exchange.vol.used[k] = (world.exchange.vol.used[k] || 0) + usd;
}
// 检查阶段只读不写（被拒的命令不能改局面）；真要成交时再用 market(s) 补齐字段。
const peek = s => ({ holdings: s.market?.holdings || {}, shorts: s.market?.shorts || {}, margin: s.market?.margin || {}, cost: s.market?.cost || {} });
const market = s => {
  s.market ??= { holdings: {}, cost: {} };
  s.market.holdings ??= {};
  s.market.cost ??= {};
  s.market.shorts ??= {};
  s.market.margin ??= {};
  return s.market;
};
function need(world, s, org) {
  const L = listingOf(world, org);
  if (!L) throw new Error('这家公司还没上市');
  if (s.charId === org) throw new Error('自家股票不能买卖，也不能做空，只能回购或增发');
  if (L.halted) throw new Error('这家公司已经清算，股票停牌');
  // 重组后 180 天内、清算以后，不能买卖别家股票（M.5.8）。
  const fr = moneyFrozen(world, s.charId);
  if (fr) throw new Error(fr);
  refresh(world, L);
  return L;
}
// 持股达到 5% 公示，之后每变动 1% 再公示一次（M.5.5）。
function disclose(world, s, org) {
  const L = listingOf(world, org);
  const held = market(s).holdings[org] || 0;
  const r = held / L.total;
  const key = `${s.charId}|${org}`;
  const last = world.exchange.notices[key] ?? 0;
  if ((r >= X.HOLD.disclose || last >= X.HOLD.disclose) && Math.abs(r - last) >= X.HOLD.step - 1e-12) {
    world.exchange.notices[key] = r;
    world.news.unshift({ date: world.day.slice(0, 7), day: world.day, type: 'stake', title: `${nameOf(world, s.charId)} 持有 ${nameOf(world, org)} ${(r * 100).toFixed(1)}% 的股份`, detail: '持股 5% 以上每变动 1% 公示一次。' });
  }
}

// ---------- 交易：买、卖、做空、回补 ----------
// 用 usd 现金买 org 的股票。受当天成交上限、涨停、25% 持股上限约束，超出的部分自动截掉；一点都买不了就报原因。
export function buy(world, s, org, usd) {
  if (!(usd > 0)) throw new Error('买入金额要大于 0');
  const L = need(world, s, org);
  let u = Math.min(usd, s.cash || 0);
  if (!(u > 0)) throw new Error('现金不足');
  u = Math.min(u, volLeft(world, L, s.charId));
  if (!(u > 0)) throw new Error('今天对这只股票的成交额已经到上限（池中现金的 5%）');
  const top = L.openP * (1 + X.LIMIT);
  u = maxWhere(u, x => priceAfterBuy(L, x) <= top + 1e-12);
  const room = X.HOLD.cap * L.total - (peek(s).holdings[org] || 0);
  if (!(room > 0)) throw new Error('外部单一股东最多持有 25%');
  u = maxWhere(u, x => sharesForUsd(L, x) <= room + 1e-6);
  if (!(u > EPS)) throw new Error('今天已经涨停，买不进了');
  const n = sharesForUsd(L, u);
  const m = market(s);
  L.pool.c += u; L.pool.s -= n;
  s.cash -= u;
  m.holdings[org] = (m.holdings[org] || 0) + n;
  m.cost[org] = (m.cost[org] || 0) + u;
  useVol(world, L, s.charId, u);
  disclose(world, s, org);
  return { shares: n, usd: u, price: u / n };
}
// 卖出 n 股（不超过持有的）。受当天成交上限、跌停约束。
export function sell(world, s, org, shares) {
  if (!(shares > 0)) throw new Error('卖出股数要大于 0');
  const L = need(world, s, org);
  let n = Math.min(shares, peek(s).holdings[org] || 0);
  if (!(n > 0)) throw new Error('手里没有这只股票');
  const left = volLeft(world, L, s.charId);
  if (!(left > 0)) throw new Error('今天对这只股票的成交额已经到上限（池中现金的 5%）');
  n = maxWhere(n, x => usdForShares(L, x) <= left + 1e-6);
  const floor = L.openP * (1 - X.LIMIT);
  n = maxWhere(n, x => priceAfterSell(L, x) >= floor - 1e-12);
  if (!(n > EPS)) throw new Error('今天已经跌停，卖不出了');
  const got = usdForShares(L, n);
  const m = market(s);
  const held = m.holdings[org];
  L.pool.s += n; L.pool.c -= got;
  s.cash += got;
  m.cost[org] = (m.cost[org] || 0) * (1 - n / held);
  m.holdings[org] = held - n;
  if (m.holdings[org] < 1e-6) { delete m.holdings[org]; delete m.cost[org]; }
  useVol(world, L, s.charId, got);
  disclose(world, s, org);
  return { shares: n, usd: got, price: got / n };
}
// 可借的股数：NPC 长线基金持股的一半，减去已经借出的。
export const lendable = L => Math.max(0, L.npcLong * X.SHORT.lendPart - L.lent);
// 借券费年化 = min(150%, 1% + 60% × 占用率²)。
export function borrowRate(L) {
  const [base, slope, cap] = X.SHORT.fee;
  const util = L.lent / Math.max(EPS, L.npcLong * X.SHORT.lendPart);
  return Math.min(cap, base + slope * util * util);
}
const dropBanned = (world, L) => !!L.dropDay && daysBetween(L.dropDay, world.day) <= 1;
// 空头上限的基数：池价在公允价时池里有多少股（√(k ÷ 公允价)）和眼下池中股数取小。价值资金把价往公允价拉时会从池里买走股票，
// 只按开空那一刻的池子算，拉回以后空头占比会超过 15%，全部强平时的峰值就封不住了（规格：轧空峰值 ≤ 公允价 1.4 倍）。
const shortBase = (world, L) => Math.min(L.pool.s, Math.sqrt((L.pool.s * L.pool.c) / fairPrice(world, L)));
// 做空 n 股：借券卖进池子，押 150% 保证金（卖得的钱加上自己补的现金）。
export function short(world, s, org, shares) {
  if (!(shares > 0)) throw new Error('做空股数要大于 0');
  const L = need(world, s, org);
  if (world.settings?.short === false) throw new Error('这一局房主关了做空');
  if (daysBetween(L.listedDay, world.day) < X.SHORT.afterListing) throw new Error(`上市满 ${X.SHORT.afterListing} 天才能做空`);
  // 新手保护（M.5.7）：进场 120 天内谁都不能被做空（联机房主可以改天数）。
  const joined = world.companies?.[org]?.joined;
  const guard = newbieDays(world);
  if (joined && daysBetween(joined, world.day) < guard) throw new Error(`对方进场还不满 ${guard} 天，在新手保护期里，不能被做空`);
  if (dropBanned(world, L)) throw new Error('这只股票当天跌了 10% 以上，当天和次日都不能新开空单');
  let n = Math.min(shares, lendable(L), Math.max(0, X.SHORT.cap * shortBase(world, L) - L.lent));
  if (!(n > 0)) throw new Error('没有可借的股票了（空头总量不超过池中股数的 15%）');
  const left = volLeft(world, L, s.charId);
  if (!(left > 0)) throw new Error('今天对这只股票的成交额已经到上限（池中现金的 5%）');
  n = maxWhere(n, x => usdForShares(L, x) <= left + 1e-6);
  const floor = L.openP * (1 - X.LIMIT);
  n = maxWhere(n, x => priceAfterSell(L, x) >= floor - 1e-12);
  if (!(n > EPS)) throw new Error('今天已经跌停，开不了空单');
  const got = usdForShares(L, n);
  const pAfter = priceAfterSell(L, n);
  const extra = Math.max(0, X.SHORT.im * n * pAfter - got);
  if (extra > (s.cash || 0)) throw new Error('现金不够押保证金（要押空单市值的 150%）');
  const m = market(s);
  L.pool.s += n; L.pool.c -= got;
  L.lent += n;
  s.cash -= extra;
  m.shorts[org] = (m.shorts[org] || 0) + n;
  m.margin[org] = (m.margin[org] || 0) + got + extra;
  useVol(world, L, s.charId, got);
  return { shares: n, usd: got, margin: got + extra };
}
// 回补 n 股：从池里买回，先用保证金付，不够再从现金扣；全部回补以后剩下的保证金退回现金。
export function cover(world, s, org, shares, { forced = false } = {}) {
  if (!(shares > 0)) throw new Error('回补股数要大于 0');
  const L = forced ? listingOf(world, org) : need(world, s, org);
  if (!L) throw new Error('这家公司还没上市');
  if (forced) refresh(world, L);
  let n = Math.min(shares, peek(s).shorts[org] || 0);
  if (!(n > 0)) throw new Error('没有这只股票的空单');
  if (!forced) {
    const left = volLeft(world, L, s.charId);
    if (!(left > 0)) throw new Error('今天对这只股票的成交额已经到上限（池中现金的 5%）');
    n = maxWhere(n, x => costOfShares(L, x) <= left + 1e-6);
    const top = L.openP * (1 + X.LIMIT);
    n = maxWhere(n, x => (L.pool.c + costOfShares(L, x)) / (L.pool.s - x) <= top + 1e-12);
    if (!(n > EPS)) throw new Error('今天已经涨停，回补不了');
  }
  const cost = costOfShares(L, n);
  const m = market(s);
  const fromMargin = Math.min(cost, m.margin[org] || 0);
  const fromCash = cost - fromMargin;
  if (!forced && fromCash > (s.cash || 0) + 1e-6) throw new Error('保证金加现金不够回补');
  L.pool.c += cost; L.pool.s -= n;
  L.lent -= n;
  m.margin[org] = (m.margin[org] || 0) - fromMargin;
  s.cash -= fromCash;
  m.shorts[org] -= n;
  if (!forced) useVol(world, L, s.charId, cost);
  if (m.shorts[org] < 1e-6) {
    delete m.shorts[org];
    s.cash += m.margin[org] || 0;
    delete m.margin[org];
  }
  return { shares: n, usd: cost };
}

// ---------- 自家股票：只能回购或增发（M.5.5） ----------
const ownPerShare = (world, s, L) => (s.valuation || 0) / L.total;
// 回购：价格 = max(池价, V 每股价)，从池里拿股注销；终局前 60 天禁止。
export function buyback(world, s, usd) {
  const L = listingOf(world, s.charId);
  if (!L) throw new Error('还没上市，不能回购');
  refresh(world, L);
  if (world.end && daysBetween(world.day, world.end) < X.OWN.buybackFreezeDays) throw new Error(`终局前 ${X.OWN.buybackFreezeDays} 天不能回购`);
  let u = Math.min(usd, s.cash || 0, volLeft(world, L, s.charId));
  if (!(u > 0)) throw new Error('现金不足，或今天的成交额已经到上限');
  const price = Math.max(poolPrice(L), ownPerShare(world, s, L));
  const n = Math.min(u / price, L.pool.s * 0.5);
  u = n * price;
  const T = L.total;
  L.pool.s -= n; L.pool.c += u;
  L.total -= n;
  s.cash -= u;
  s.equity = Math.min(1, s.equity * T / L.total);
  useVol(world, L, s.charId, u);
  return { shares: n, usd: u, price };
}
// 增发：价格 = min(池价, V 每股价)，新股卖进池子。
export function issue(world, s, usd) {
  const L = listingOf(world, s.charId);
  if (!L) throw new Error('还没上市，不能增发');
  const b = world.flags?.bubble;
  if (b && !b.averted && world.day >= b.day && world.day < b.until) throw new Error('AI 泡沫破裂后半年内不能增发');
  refresh(world, L);
  let u = Math.min(usd, volLeft(world, L, s.charId), L.pool.c * 0.5);
  if (!(u > 0)) throw new Error('今天的成交额已经到上限');
  const price = Math.min(poolPrice(L), ownPerShare(world, s, L));
  const n = u / price;
  const T = L.total;
  L.pool.s += n; L.pool.c -= u;
  L.total += n;
  s.cash += u;
  s.equity *= T / L.total;
  useVol(world, L, s.charId, u);
  return { shares: n, usd: u, price };
}

// ---------- 上市（IPO 流程走完那天） ----------
const tickerOf = s => (String(s.company?.name || s.charId).replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || s.charId.slice(2, 6).toUpperCase());
// 发行价 = V ÷ 总股本 × 0.85，公司拿到全部发行款；发行的股票一半进做市池（NPC 配等值现金），一半给 NPC 长线基金。
export function listCompany(world, s, frac = 0.2) {
  initExchange(world);
  if (isListed(world, s.charId)) throw new Error('已经上市');
  const f = X.IPO.issue.includes(frac) ? frac : 0.2;
  const T0 = SHARES0;
  const N = T0 * f / (1 - f);
  const price = Math.max(EPS, (s.valuation || 0) / T0 * X.IPO.discount);
  const poolS = N * X.IPO.poolPart;
  const before = sectorIndexNow(world);
  const L = {
    org: s.charId, ticker: tickerOf(s), total: T0 + N, pool: { s: poolS, c: poolS * price }, npcLong: N - poolS, lent: 0,
    listedDay: world.day, issuePrice: price, lockUntil: addDays(world.day, X.IPO.lock), dropDay: null,
    refDay: world.day, openP: price, openC: poolS * price, hist: [[world.day, price]], calls: {},
  };
  world.exchange.listings[s.charId] = L;
  s.cash += N * price;
  s.equity *= 1 - f;
  s.capital.listed = { ticker: L.ticker, market: '自洽交易所', shares: L.total, price, ipoPrice: price, pop: 1, history: [[s.date, price]], issue: f };
  // 板块指数：新股进来时调整除数，指数不跳。
  const cap = marketCap(world);
  world.exchange.sector.div = before === null ? cap / 100 : cap / before;
  world.exchange.sector.value = before === null ? 100 : before;
  world.news.unshift({ date: world.day.slice(0, 7), day: world.day, type: 'ipo', title: `${nameOf(world, s.charId)} 上市，代码 ${L.ticker}`, detail: `发行 ${Math.round(f * 100)}%，发行价按估值打 85 折，募资 ${Math.round(N * price / 1e6)} 百万美元。` });
  return L;
}

// ---------- 板块指数、终局身家、清算价 ----------
const marketCap = world => Object.values(world.exchange?.listings || {}).reduce((a, L) => a + poolPrice(L) * L.total, 0);
function sectorIndexNow(world) {
  const sec = world.exchange?.sector;
  if (!sec?.div) return null;
  return marketCap(world) / sec.div;
}
// AI 板块指数：全部上市公司按市值加权（M.3.8 第 6 条）。还没有公司上市时为 null。
export const sectorIndex = world => (world?.exchange?.sector?.value ?? null);
// 持仓按“整仓卖回池子”能拿到的现金、空头按“整仓买回”要付的现金（V 里的资产口径，M.3.8 第 4 条）。
export function holdingsLiquidation(world, s) {
  let v = 0;
  for (const [org, n] of Object.entries(s.market?.holdings || {})) { const L = listingOf(world, org); if (L && n > 0) v += usdForShares(L, n); }
  return v;
}
export function shortsBuyback(world, s) {
  let v = 0;
  for (const [org, n] of Object.entries(s.market?.shorts || {})) {
    const L = listingOf(world, org);
    if (!L || !(n > 0)) continue;
    const c = costOfShares(L, n);
    v += Number.isFinite(c) ? c : n * poolPrice(L) * 10;
  }
  return v;
}
export const marginCash = s => Object.values(s.market?.margin || {}).reduce((a, x) => a + (x || 0), 0);
// 终局身家（M.5.10）= 自家持股比例 × 公司价值；上市取 V，未上市取 V × 0.8。
export function finalWealth(world, s) {
  // 清算了的公司：身家 = e × max(0, 清算价值)（M.5.8）。
  const r = world.ix?.restr?.[s.charId];
  if (r?.liquidated) return (s.equity || 0) * Math.max(0, r.liqValue || 0);
  const V = s.valuation || 0;
  return (s.equity || 0) * (isListed(world, s.charId) ? V : V * VALUE_SELF.UNLISTED);
}

// 新闻冲击（M.5.2 公开指控）：价值资金按冲击幅度把池价压下去（k 不变，不收手续费），不低于当天跌停价；
// 之后照常每天往公允价拉回。返回实际的跌幅。
export function newsShock(world, org, pct) {
  const L = listingOf(world, org);
  if (!L || !(pct < 0)) return 0;
  refresh(world, L);
  const p0 = poolPrice(L);
  const target = Math.max(p0 * (1 + pct), L.openP * (1 - X.LIMIT));
  if (!(target < p0)) return 0;
  const k = L.pool.s * L.pool.c;
  const sNew = Math.sqrt(k / target), cNew = Math.sqrt(k * target);
  const ex = world.exchange;
  ex.npc.valueCash += L.pool.c - cNew;
  ex.npc.valueShares[org] = (ex.npc.valueShares[org] || 0) - (sNew - L.pool.s);
  L.pool.s = sNew; L.pool.c = cNew;
  return target / p0 - 1;
}

// ---------- 开盘、收盘（world.tick 的 M.4 第 2、4 步） ----------
// 开盘：扣借券费 → 执行昨天收盘判定的强平 → 价值资金拉回 → 记下今天的参照价。
export function exchangeOpen(world) {
  const ex = initExchange(world);
  for (const L of Object.values(ex.listings)) {
    const p = poolPrice(L);
    const rate = borrowRate(L) / 365;
    for (const c of Object.values(world.companies)) {
      const s = c.s;
      const n = s?.market?.shorts?.[L.org];
      if (!(n > 0)) continue;
      const fee = rate * n * p;
      const fromMargin = Math.min(fee, s.market.margin[L.org] || 0);
      s.market.margin[L.org] -= fromMargin;
      s.cash -= fee - fromMargin;
    }
    // 强平：只从池里买回到保证金恢复 150% 为止，不一次全平。
    for (const holder of Object.keys(L.calls || {})) {
      const s = companyS(world, holder);
      const n = s?.market?.shorts?.[L.org];
      if (!(n > 0)) continue;
      const mg = s.market.margin[L.org] || 0;
      const ok = k => {
        const cost = costOfShares(L, k);
        const pAfter = (L.pool.c + cost) / (L.pool.s - k);
        return mg - cost >= X.SHORT.im * (n - k) * pAfter;
      };
      let lo = 0, hi = n;
      if (!ok(n)) lo = n;
      else for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
      const k = Math.min(n, hi);
      if (k > EPS) cover(world, s, L.org, k, { forced: true });
      world.news.unshift({ date: world.day.slice(0, 7), day: world.day, type: 'margin', title: `${nameOf(world, holder)} 做空 ${nameOf(world, L.org)} 被强平`, detail: '保证金跌破空单市值的 130%，开盘时按池价买回一部分。' });
    }
    L.calls = {};
    if (L.halted) continue;                              // 清算停牌：价值资金不再拉
    // 价值资金：把池价往公允价拉回对数差的 10%（不收手续费，k 不变）。
    const fair = fairPrice(world, L);
    const pNow = poolPrice(L);
    const target = pNow * Math.exp(X.PULL * Math.log(fair / pNow));
    const k = L.pool.s * L.pool.c;
    const sNew = Math.sqrt(k / target), cNew = Math.sqrt(k * target);
    ex.npc.valueCash -= cNew - L.pool.c;
    ex.npc.valueShares[L.org] = (ex.npc.valueShares[L.org] || 0) + (L.pool.s - sNew);
    L.pool.s = sNew; L.pool.c = cNew;
    L.refDay = null;
    refresh(world, L);
  }
}
// 收盘：记价格、判跌超 10%（当天和次日禁新空单）、判保证金（次日开盘强平）、更新板块指数和公司的上市信息。
export function exchangeClose(world) {
  const ex = initExchange(world);
  for (const L of Object.values(ex.listings)) {
    refresh(world, L);
    const p = poolPrice(L);
    if (p <= L.openP * (1 - X.SHORT.dropBan) + 1e-12) L.dropDay = world.day;
    L.hist.push([world.day, p]);
    if (L.hist.length > HIST_MAX) L.hist.splice(0, L.hist.length - HIST_MAX);
    L.calls = {};
    for (const c of Object.values(world.companies)) {
      const s = c.s;
      const n = s?.market?.shorts?.[L.org];
      if (n > 0 && (s.market.margin[L.org] || 0) < X.SHORT.mm * n * p) L.calls[c.id] = true;
    }
    const own = companyS(world, L.org);
    if (own?.capital?.listed) { own.capital.listed.price = p; own.capital.listed.shares = L.total; }
  }
  const v = sectorIndexNow(world);
  if (v !== null) ex.sector.value = v;
}

// ---------- 给 SimProvider 的读口 ----------
export function tickersOf(world) {
  return Object.values(world.exchange?.listings || {}).map(L => ({ id: L.org, name: nameOf(world, L.org), ticker: L.ticker, ccy: 'USD', listed: L.listedDay.slice(0, 7) }));
}
// 某天的价格：今天取池价；过去的日子取那天收盘（找不到就取最早的一天）。
export function priceOf(world, org, date = null) {
  const L = listingOf(world, org);
  if (!L) return 0;
  if (!date || date >= world.day.slice(0, date.length)) return poolPrice(L);
  let p = L.hist[0]?.[1] ?? poolPrice(L);
  for (const [d, v] of L.hist) { if (d.slice(0, date.length) <= date) p = v; else break; }
  return p;
}

// ---------- 交易所页的报价（M.7）：拿池子、成交额、持仓的副本跑同一个 buy / sell / short / cover，局面一点不动 ----------
// 副本只换掉这几样会被写的东西；公司、互动账本这些只读的照旧指向原世界。
function sandbox(world, s, org) {
  const ex = world.exchange;
  const L0 = listingOf(world, org);
  const L = { ...L0, pool: { ...L0.pool }, calls: { ...L0.calls } };
  const vol = { day: world.day, used: ex.vol?.day === world.day ? { ...ex.vol.used } : {} };
  const w = { ...world, news: [], exchange: { ...ex, listings: { ...ex.listings, [org]: L }, vol, notices: { ...ex.notices } } };
  const m = s.market || {};
  const t = { charId: s.charId, cash: s.cash, market: { holdings: { ...m.holdings }, cost: { ...m.cost }, shorts: { ...m.shorts }, margin: { ...m.margin } } };
  return { w, t, L };
}
const TRADE = { buy, sell, short, cover };
// side：buy 按美元，其余按股数。返回成交的股数、金额、均价、成交后的池价；被截掉一部分时 clipped = true；一点都做不了时 ok = false 和原因。
export function quote(world, s, org, side, amount) {
  if (!listingOf(world, org)) return { ok: false, err: '这家公司还没上市' };
  if (!TRADE[side]) return { ok: false, err: `没有这种交易：${side}` };
  const { w, t, L } = sandbox(world, s, org);
  try {
    const r = TRADE[side](w, t, org, amount);
    const asked = side === 'buy' ? r.usd : r.shares;
    return { ok: true, side, ...r, price: r.usd / r.shares, after: poolPrice(L), cash: t.cash, clipped: asked < amount * (1 - 1e-9) };
  } catch (e) {
    return { ok: false, side, err: String(e?.message || e) };
  }
}
// 一次最多能做多少（buy 按美元，其余按股数）：上限先按现金、持仓、可借股数取，做不了就二分找能做的最大量。
export function quoteMax(world, s, org, side) {
  const L = listingOf(world, org);
  if (!L) return 0;
  const m = peek(s);
  const hi = side === 'buy' ? (s.cash || 0) : side === 'sell' ? (m.holdings[org] || 0) : side === 'cover' ? (m.shorts[org] || 0) : lendable(L);
  if (!(hi > 0)) return 0;
  const got = q => (q.ok ? (side === 'buy' ? q.usd : q.shares) : 0);
  const top = quote(world, s, org, side, hi);
  if (top.ok) return got(top);
  let lo = 0, up = hi;
  for (let i = 0; i < 40; i++) { const mid = (lo + up) / 2; if (quote(world, s, org, side, mid).ok) lo = mid; else up = mid; }
  return lo > 0 ? got(quote(world, s, org, side, lo)) : 0;
}
// 一只股票今天的盘面：价格、公允价、涨跌停、还能成交多少、我的持仓和空单、借券、做空的门槛。只读。
export function boardOf(world, s, org) {
  const L = listingOf(world, org);
  if (!L) return null;
  const today = L.refDay === world.day;
  const openP = today ? L.openP : poolPrice(L);
  const openC = today ? L.openC : L.pool.c;
  const ex = world.exchange;
  const used = ex.vol?.day === world.day ? (ex.vol.used[`${s.charId}|${org}`] || 0) : 0;
  const m = peek(s);
  const p = poolPrice(L);
  const held = m.holdings[org] || 0, sh = m.shorts[org] || 0, mg = m.margin[org] || 0;
  const prev = [...L.hist].reverse().find(([d]) => d < world.day)?.[1] ?? L.issuePrice;
  const joined = world.companies?.[org]?.joined;
  const shortBlock = s.charId === org ? '自家股票不能做空'
    : world.settings?.short === false ? '这一局房主关了做空'
    : daysBetween(L.listedDay, world.day) < X.SHORT.afterListing ? `上市满 ${X.SHORT.afterListing} 天才能做空（还差 ${X.SHORT.afterListing - daysBetween(L.listedDay, world.day)} 天）`
    : joined && daysBetween(joined, world.day) < newbieDays(world) ? `对方还在新手保护期（进场不满 ${newbieDays(world)} 天）`
    : dropBanned(world, L) ? '当天跌了 10% 以上，当天和次日不能新开空单' : null;
  return {
    org, ticker: L.ticker, name: nameOf(world, org), listedDay: L.listedDay, halted: !!L.halted, lockUntil: L.lockUntil,
    price: p, prev, fair: fairPrice(world, L), issuePrice: L.issuePrice, cap: p * L.total, total: L.total,
    pool: { s: L.pool.s, c: L.pool.c }, top: openP * (1 + X.LIMIT), floor: openP * (1 - X.LIMIT),
    volCap: X.DAY_CAP * openC, volLeft: Math.max(0, X.DAY_CAP * openC - used),
    held, cost: m.cost[org] || 0, value: held > 0 ? usdForShares(L, held) : 0, holdRoom: Math.max(0, X.HOLD.cap * L.total - held),
    short: sh, margin: mg, shortCost: sh > 0 ? costOfShares(L, sh) : 0, marginRatio: sh > 0 ? mg / (sh * p) : null, called: !!L.calls?.[s.charId],
    lendable: lendable(L), borrowRate: borrowRate(L), shortBlock,
    hist: L.hist,
  };
}
// 持股 5% 以上的公示（公开信息）：[{ holder, org, ratio }]，按比例从大到小。
export function stakesOf(world, org = null) {
  const out = [];
  for (const [k, r] of Object.entries(world.exchange?.notices || {})) {
    const [holder, o] = k.split('|');
    if ((org && o !== org) || !(r >= X.HOLD.disclose)) continue;
    out.push({ holder, org: o, ratio: r, name: nameOf(world, holder) });
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}
// 自家股票：回购价 max(池价, V/股)、增发价 min(池价, V/股)，今天还能做多少（都受当天成交上限）。
export function ownBoard(world, s) {
  const L = listingOf(world, s.charId);
  if (!L) return null;
  const b = boardOf(world, { ...s, charId: `${s.charId}#own` }, s.charId);
  const per = ownPerShare(world, s, L);
  const ex = world.exchange;
  const used = ex.vol?.day === world.day ? (ex.vol.used[`${s.charId}|${s.charId}`] || 0) : 0;
  const volLeft = Math.max(0, b.volCap - used);
  const bub = world.flags?.bubble;
  const issueBlock = bub && !bub.averted && world.day >= bub.day && world.day < bub.until ? 'AI 泡沫破裂后半年内不能增发' : null;
  const buybackBlock = world.end && daysBetween(world.day, world.end) < X.OWN.buybackFreezeDays ? `终局前 ${X.OWN.buybackFreezeDays} 天不能回购` : null;
  return { ...b, held: 0, value: 0, short: 0, perShare: per, buybackPrice: Math.max(b.price, per), issuePrice: Math.min(b.price, per), volLeft,
    buybackMax: Math.min(s.cash || 0, volLeft), issueMax: Math.min(volLeft, L.pool.c * 0.5), issueBlock, buybackBlock, equity: s.equity };
}
