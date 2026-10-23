// 算力：买卡、租卡和配额、灰色渠道、卖卡和退租、推理份额、加急扩容挑哪款卡。
import { SMUGGLE, GPUS, gpuRentable } from '../data/core.js';
import { bubbleMult } from './bubble.js';
import { clamp, rand } from './util.js';
import { addDays, fmtDay } from './clock.js';
import { leadDays, quarterOf, RENT_LEAD, SMUGGLE_LEAD } from '../data/supply.js';
import { P } from './provider.js';
import { log } from './log.js';
import { addOrder } from './orders.js';
import { modifier } from './modifiers.js';

// 买卡要排队交货，每季度有配额；租卡约 10 天开通，每月能新租的也有限。美国公司一样会被卡住。
// 配额再乘特质的 gpuQuota、rentQuota（E3，例如自建集群买卡配额 ×1.5）：买卡仍按 64 张取整。
export const buyQuota = (s, id) => Math.round(P().gpuQuota(s, id) * modifier(s, 'gpuQuota') / 64) * 64;
export const rentQuota = s => Math.round(P().rentQuota(s) * modifier(s, 'rentQuota'));
export function gpuOrderInfo(s, id, rent = false) {
  const g = GPUS[id];
  if (rent) {
    const used = s.quota[`rent|${s.date}`] || 0;
    // 自洽模式的租卡现货价来自共用租卡池（M.3.8 第 3 条）；史实模式仍是目录月租。
    return { lead: RENT_LEAD, left: Math.max(0, rentQuota(s) - used), price: P().mode === 'sim' ? P().rentPrice(s, id) : g.rent };
  }
  const used = s.quota[`${quarterOf(s.date)}|${id}`] || 0;
  return { lead: leadDays(id, s.date), left: Math.max(0, buyQuota(s, id) - used), price: P().gpuPrice(s, id) };
}
export function buyGpu(s, id, n, rent = false) {
  // 型号只认 GPUS 自己的键：'toString'、'__proto__' 这类原型上的名字不算。
  if (!Object.hasOwn(GPUS, id)) throw new Error('没有这款卡');
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error('显卡数量必须是正整数');
  if (rent ? !gpuRentable(id, s.date, s.company.country, s.flags.overseasRent) : !P().gpuAvailable(id, s.date, s.company.country)) throw new Error('这款卡现在买不到');
  const g = GPUS[id];
  const info = gpuOrderInfo(s, id, rent);
  n = Math.min(n, info.left);
  if (n <= 0) throw new Error(rent ? '这个月云上已经租不到更多卡了' : `这个季度 ${g.label} 的配额已经用完，下个季度再订`);
  const eta = addDays(s.day, info.lead);
  if (rent) {
    s.quota[`rent|${s.date}`] = (s.quota[`rent|${s.date}`] || 0) + n;
    addOrder(s, { kind: 'rent', ref: id, n, eta });
    log(s, `租用 ${n} 张 ${g.label}，预计 ${fmtDay(eta)} 开通`);
    return { n, eta };
  }
  const cost = info.price * n;
  if (cost > s.cash) throw new Error('现金不足');
  s.cash -= cost;
  s.quota[`${quarterOf(s.date)}|${id}`] = (s.quota[`${quarterOf(s.date)}|${id}`] || 0) + n;
  addOrder(s, { kind: 'gpu', ref: id, n, eta, cost });
  log(s, `订购 ${n} 张 ${g.label}，预计 ${fmtDay(eta)} 到货`);
  return { n, eta, cost };
}

// ---------- 灰色渠道 ----------
// 被禁运的卡经第三地转运进来：每月限量、价格翻倍，买得越多“风声”越紧，被查到会被没收和罚款。
export function smuggleOffers(s) {
  const g = s.gray;
  if (s.company.country !== 'CN' || g?.closed || (g?.closedUntil && s.date < g.closedUntil)) return [];
  return Object.entries(SMUGGLE)
    .filter(([id, x]) => s.date >= x.from && (!x.to || s.date <= x.to) && !P().gpuAvailable(id, s.date, 'CN'))
    .map(([id, x]) => ({ id, label: GPUS[id].label, mult: x.mult, price: Math.round(GPUS[id].price * x.mult), left: Math.max(0, x.monthly - (g?.month === s.date ? g.bought[id] || 0 : 0)) }));
}
// 风声：0 平静，1 有人在打听，2 很紧。
export const grayHeatLevel = s => { const h = s.gray?.heat || 0; return h < 0.6 ? 0 : h < 1.6 ? 1 : 2; };
export function buySmuggled(s, id, n) {
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error('显卡数量必须是正整数');
  const o = smuggleOffers(s).find(x => x.id === id);
  if (!o) throw new Error('这条渠道现在走不通');
  n = Math.min(n, o.left);
  if (n <= 0) throw new Error('这个月中间商手里的货已经被抢完了');
  const cost = o.price * n;
  if (cost > s.cash) throw new Error('现金不足');
  const g = s.gray = s.gray || { owned: {}, bought: {}, month: s.date, heat: 0, total: 0, spent: 0 };
  if (g.month !== s.date) { g.month = s.date; g.bought = {}; }
  s.cash -= cost;
  g.bought[id] = (g.bought[id] || 0) + n;
  g.total += n;
  g.spent += cost;
  // 大厂和上市公司盯着的人多，同样的量更容易出事。
  g.heat += n / 400 * (s.company.kind === 'division' || s.capital.listed ? 1.5 : 1);
  const eta = addDays(s.day, SMUGGLE_LEAD[0] + Math.floor(rand(s) * (SMUGGLE_LEAD[1] - SMUGGLE_LEAD[0])));
  // 在路上的卡还不算持有（held: false），到货才记进 g.owned；路上被扣就一张都不记。
  addOrder(s, { kind: 'smuggle', ref: id, n, eta, cost, held: false });
  log(s, `经第三地转运订了 ${n} 张 ${GPUS[id].label}，大约 ${fmtDay(eta)} 到`);
  return { n, cost, eta };
}
export function grayTick(s) {
  const g = s.gray;
  if (!g || g.heat <= 0.05) return;
  const held = Object.values(g.owned).reduce((a, n) => a + n, 0);
  if (held > 0 && !s.queue.some(q => q.id === 'smuggle_exposed') && rand(s) < clamp(0.01 + 0.06 * g.heat, 0, 0.4)) {
    s.queue.push({ kind: 'event', id: 'smuggle_exposed', params: { n: held } });
  }
  g.heat *= 0.85;
}

export function releaseGpu(s, id, n, rented = true) {
  if (!Object.hasOwn(GPUS, id) || !Number.isSafeInteger(n) || n <= 0) throw new Error('显卡型号和数量无效');
  const src = rented ? s.gpus.rented : s.gpus.owned;
  n = Math.min(n, src[id] || 0);
  src[id] -= n;
  if (!src[id]) delete src[id];
  // 卖卡按买价的 55%；AI 泡沫破裂后 180 天内再 ×0.6（规格 K5）。
  if (!rented) s.cash += GPUS[id].price * n * 0.55 * bubbleMult(s, 'GPU_RESALE');
  // 先卖正规渠道的卡；走私来的卡数不会超过实际持有。
  if (!rented && s.gray?.owned[id]) s.gray.owned[id] = Math.min(s.gray.owned[id], s.gpus.owned[id] || 0);
  return n;
}
export function setInferShare(s, v) {
  if (!Number.isFinite(v)) throw new Error('推理份额必须是数');
  s.inferShare = clamp(v, 0.05, 0.9);
}

// 加急扩容时能租到的最好的卡。
export function bestRentGpu(s) {
  const order = s.company.country === 'CN' ? ['H200', 'Ascend950', 'Ascend910C', 'H20', 'Ascend910B'] : ['Rubin', 'B300', 'B200', 'H200', 'H100'];
  return order.find(g => gpuRentable(g, s.date, s.company.country, s.flags.overseasRent)) || 'H100';
}

// 存档的浅副本，假装这些买卡（gpu）、租卡（rent）订单已经到了：只用来估推理能力和租金，不改原存档。
export function withOrders(s, orders) {
  const gpus = { ...s.gpus, owned: { ...s.gpus.owned }, rented: { ...s.gpus.rented } };
  for (const o of orders) { const to = o.kind === 'rent' ? gpus.rented : gpus.owned; to[o.ref] = (to[o.ref] || 0) + o.n; }
  return { ...s, gpus };
}
