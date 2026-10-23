// 公司之间的钱（规格 M.5.9）：付的一方付 100%，收的一方只入账 60%（TRANSFER.BOOK），其余记作推理成本、税和律师费。
// 这些钱不算客户收入，不进估值池的收入项，也不进 IPO 门槛：只动现金。玩家之间没有直接转账。
// 白天（各家推进、命令）里付方当场扣钱，收方的那笔先记进 world.ix.pending，收盘统一入账，所以结果和推进顺序无关。
// 重组后 180 天内的公司、已经清算的公司，所有转钱渠道进出都不行（M.5.8）。
import { TRANSFER, NEWBIE } from '../data/exchange.js';
import { FAMILIES } from '../data/rivals.js';
import { daysBetween } from '../sim/clock.js';

// 新手保护天数（M.5.7）：联机房主可以改（大厅规则开关），单人局和默认房间都是 120 天。
export const newbieDays = world => world?.settings?.protect ?? NEWBIE.days;

const RECENT = 200;

// 互动账本（M2b）：转账、API 蒸馏的每对记录、指控、许可、挖人、重组。读档的旧世界没有它，用到时补上。
export function ensureIx(world) {
  world.ix ??= {};
  const ix = world.ix;
  ix.pending ??= [];          // 今天白天记下、收盘入账的转账
  ix.recent ??= [];           // 最近入账的转账（公开可查的那几类给公开视图）
  ix.flows ??= {};            // `${付方}>${收方}` → { 类别: 付出的美元 }
  ix.pairs ??= {};            // `${学生}|${老师}` → API 蒸馏这一对的记录（distill_watch.js）
  ix.cases ??= {};            // 查出的 API 蒸馏（distill_watch.js）
  ix.caseSeq ??= 0;
  ix.terms ??= {};            // 受限开源条款：发布 id → 条款（license.js）
  ix.derivs ??= {};           // 署名衍生：发布方 → { 衍生发布 id: 份额 }（license.js）
  ix.poach ??= {};            // `${挖方}|${被挖方}` → 上次挖人的日子（poach.js）
  ix.restr ??= {};            // 重组和清算：公司 → { negSince, count, day, until, liquidated }（restructure.js）
  ix.public ??= [];           // 公开的互动记录：指控、血统公开、许可分成
  return ix;
}

// 家族 → 世界里那家公司的 id。学界、冻结的前人遗产、找不到的都是 null（付给它们的钱就是花掉了）。
export function orgOfFam(world, fam) {
  const cs = world.companies || {};
  if (cs[fam]?.s) return fam;
  for (const c of Object.values(cs)) if (c?.s?.company?.families?.includes(fam)) return c.id;
  const org = FAMILIES[fam]?.org;
  if (org && cs[org]?.s) return org;
  return null;
}

// 这家公司现在能不能收付（重组冻结期、清算以后都不行）。
export function moneyFrozen(world, org, day = world.day) {
  const r = world.ix?.restr?.[org];
  if (!r) return null;
  if (r.liquidated) return '这家公司已经清算了';
  if (r.until && daysBetween(day, r.until) > 0) return `重组后 ${daysBetween(r.day, r.until)} 天内不能和别家有资金往来（到 ${r.until}）`;
  return null;
}

// 记一笔转账：付方的钱已经由调用方扣掉（或者马上扣），这里只记收方那一份，收盘入账。
// 收方不存在、已经清算或在冻结期：钱照样付出去，只是没人收（推理成本、税和律师费）。
export function queueTransfer(world, from, to, usd, kind) {
  if (!(usd > 0) || !to || from === to) return 0;
  const ix = ensureIx(world);
  const key = `${from}>${to}`;
  const f = (ix.flows[key] ??= {});
  f[kind] = (f[kind] || 0) + usd;
  ix.pending.push({ day: world.day, from, to, usd, kind });
  return usd * TRANSFER.BOOK;
}

// 收盘入账：按记账顺序（白天的执行顺序在重放时逐位一致；推进顺序只影响 pending 的先后，加法和顺序无关）。
export function settleTransfers(world, day = world.day) {
  const ix = ensureIx(world);
  if (!ix.pending.length) return [];
  const done = [];
  for (const t of ix.pending) {
    const c = world.companies?.[t.to];
    const booked = c?.s && c.s.status === 'playing' && !moneyFrozen(world, t.to, day) ? t.usd * TRANSFER.BOOK : 0;
    if (booked > 0) c.s.cash += booked;
    const row = { day, from: t.from, to: t.to, usd: Math.round(t.usd), booked: Math.round(booked), kind: t.kind };
    done.push(row);
    ix.recent.push(row);
  }
  if (ix.recent.length > RECENT) ix.recent.splice(0, ix.recent.length - RECENT);
  ix.pending = [];
  return done;
}

export function paidBetween(world, from, to) {
  return Object.values(world.ix?.flows?.[`${from}>${to}`] || {}).reduce((a, b) => a + b, 0);
}
