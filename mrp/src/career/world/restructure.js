// 破产、重组与清算（规格 M.5.8），只在自洽和联机里跑；史实模式照旧在月结时按透支额直接破产。
// 现金连续 60 天为负，由债权人重组，每家一局最多 1 次；第 2 次现金连续 60 天为负，直接清算。
// 重组的钱不凭空造：先按买价的 5 折卖卡；不够的部分按 V 每股价的一半向 NPC 债权人增发；补到够 3 个月开销为止，
// 而且补完的现金不超过清算价值。老股东最多剩 30%；团队 ×0.7。重组后 180 天内所有转钱渠道进出都不行，也不能买卖别家股票。
// 清算：公司冻结，持仓和空头按清算价平掉，身家 = e × max(0, 清算价值)，这个人转为旁观。
import { EXCHANGE } from '../data/exchange.js';
import { GPUS } from '../data/core.js';
import { fmtMoney } from '../sim/util.js';
import { addDays, daysBetween } from '../sim/clock.js';
import { finish } from '../sim/finish.js';
import { log } from '../sim/log.js';
import { ensureIx } from './transfer.js';
import { holdingsLiquidation, shortsBuyback, marginCash, cover, isListed, SHARES0 } from './exchange.js';

const R = EXCHANGE.RESTRUCTURE;
const nameOf = (world, org) => world.companies?.[org]?.name || org;
const ownedValue = (s, f) => Object.entries(s.gpus?.owned || {}).reduce((a, [id, n]) => a + (GPUS[id]?.price || 0) * n * f, 0);

// 清算价值：自有卡按 5 折、持仓整仓卖回、空头整仓买回、押着的保证金，加上现金（可以是负的）。
export function liquidationValue(world, s) {
  return (s.cash || 0) + ownedValue(s, R.gpuSale) + marginCash(s) + holdingsLiquidation(world, s) - shortsBuyback(world, s);
}
const monthCost = s => Math.max(0, s.history?.at(-1)?.costs || 0);

// 每天收盘（转账入账之后）：数各家现金连续为负的天数，到 60 天就重组或清算。
export function restructureTick(world, day = world.day) {
  const ix = ensureIx(world);
  const out = [];
  for (const c of Object.values(world.companies).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const s = c.s;
    if (!s || s.status !== 'playing') continue;
    const r = (ix.restr[c.id] ??= { negSince: null, count: 0, day: null, until: null, liquidated: false });
    if (!((s.cash || 0) < 0)) { r.negSince = null; continue; }
    r.negSince ??= day;
    if (daysBetween(r.negSince, day) < R.negDays) continue;
    r.negSince = null;
    out.push(r.count < R.max ? restructure(world, c, day) : liquidate(world, c, day));
  }
  return out;
}

export function restructure(world, c, day = world.day) {
  const s = c.s;
  const r = ensureIx(world).restr[c.id];
  const target = R.months * monthCost(s);
  const cap = Math.max(0, liquidationValue(world, s));  // 补完的现金不超过重组前的清算价值
  // 1) 按买价的 5 折卖卡，便宜的卡先卖，卖到够 3 个月开销为止。
  let sold = 0, got = 0;
  const ids = Object.keys(s.gpus.owned).filter(id => s.gpus.owned[id] > 0).sort((a, b) => (GPUS[a]?.price || 0) - (GPUS[b]?.price || 0) || (a < b ? -1 : 1));
  for (const id of ids) {
    if (s.cash >= target) break;
    const per = (GPUS[id]?.price || 0) * R.gpuSale;
    if (!(per > 0)) continue;
    const k = Math.min(s.gpus.owned[id], Math.ceil((target - s.cash) / per));
    s.gpus.owned[id] -= k;
    if (!s.gpus.owned[id]) delete s.gpus.owned[id];
    if (s.gray?.owned?.[id]) s.gray.owned[id] = Math.min(s.gray.owned[id], s.gpus.owned[id] || 0);
    s.cash += k * per; sold += k; got += k * per;
  }
  // 2) 还不够就向 NPC 债权人增发：价格是 V 每股价的一半；补到 3 个月开销，且不超过清算价值。
  const raise = Math.max(0, Math.min(target, cap) - s.cash);
  let issued = 0;
  const total = isListed(world, c.id) ? world.exchange.listings[c.id].total : SHARES0;
  const perShare = Math.max(1e-9, (s.valuation || 0) / total * R.issueAt);
  if (raise > 0) {
    issued = raise / perShare;
    s.cash += raise;
    if (isListed(world, c.id)) {
      const L = world.exchange.listings[c.id];
      L.total += issued;
      L.npcLong += issued;                               // 债权人的新股记在长线基金名下（可以出借给空头）
    }
  }
  // 3) 老股东最多剩 30%；团队 ×0.7。
  const before = s.equity || 0;
  s.equity = before * Math.min(R.keepEquity, total / (total + issued));
  s.team = Math.max(1, Math.round((s.team || 0) * R.team));
  if (s.products?.gpu_lease) s.products.gpu_lease.gpus = 0;   // 冻结期不能出租（出租收入来自别家）
  r.count += 1; r.day = day; r.until = addDays(day, R.freeze);
  const note = `${nameOf(world, c.id)} 由债权人重组：卖了 ${sold} 张卡（${fmtMoney(got)}），向债权人增发换来 ${fmtMoney(raise)}，老股东持股从 ${Math.round(before * 1000) / 10}% 降到 ${Math.round(s.equity * 1000) / 10}%，团队裁掉三成。`;
  log(s, note);
  s.queue.push({ kind: 'notice', title: '债权人重组', text: `${note}${R.freeze} 天内不能和别家有任何资金往来，也不能买卖别家股票。再有一次现金连续 ${R.negDays} 天为负，公司就清算了。` });
  world.news.unshift({ date: day.slice(0, 7), day, type: 'restructure', title: `${nameOf(world, c.id)} 进入重组`, detail: '现金连续两个月为负，债权人接管。' });
  return { org: c.id, kind: 'restructure', sold, got, raise, equity: s.equity };
}

export function liquidate(world, c, day = world.day) {
  const s = c.s;
  const r = ensureIx(world).restr[c.id];
  // 空头按池价强平（借来的股票要还回去），持仓按整仓卖回的价钱折给 NPC 长线基金（不动池子）。
  for (const org of Object.keys(s.market?.shorts || {})) {
    const n = s.market.shorts[org];
    if (n > 0 && world.exchange?.listings?.[org]) cover(world, s, org, n, { forced: true });
  }
  const hold = holdingsLiquidation(world, s);
  const ex = world.exchange;
  for (const [org, n] of Object.entries(s.market?.holdings || {})) {
    if (!(n > 0) || !ex?.listings?.[org]) continue;
    ex.npc.valueShares[org] = (ex.npc.valueShares[org] || 0) + n;
  }
  if (ex?.npc && hold > 0) ex.npc.valueCash -= hold;
  if (s.market) { s.market.holdings = {}; s.cash += marginCash(s); s.market.margin = {}; }
  s.cash += hold;
  const liq = liquidationValue(world, s);
  r.liquidated = true; r.day = day; r.liqValue = Math.max(0, liq);
  s.valuation = r.liqValue;
  const L = ex?.listings?.[c.id];
  if (L) L.halted = day;
  log(s, `公司清算：清算价值 ${fmtMoney(r.liqValue)}`);
  world.news.unshift({ date: day.slice(0, 7), day, type: 'restructure', title: `${nameOf(world, c.id)} 清算`, detail: '重组后又一次现金连续两个月为负，公司清算。' });
  finish(s, 'liquidated');
  return { org: c.id, kind: 'liquidate', value: r.liqValue };
}
