// 挖人（规格 M.5.6，可选，大厅里默认关：world.settings.poach）。
// 命令 poach(target, n)：挖对方团队的至多 3%，每人付 2 倍年薪（只在挖成时付，钱给跳槽的人，不是公司之间的转账）。
// 对方可以加薪留人：电脑公司按现金确定性地选，真人收到一张二选一的卡。挖成以后：
//   对方 60 天内研究速度 ×0.8（现有的 due.poach）、技术积累少一成；挖人的一方得到对方损失的一半；不转移任何技术。
// 同一对公司 180 天内只能挖一次；对方进场 120 天内不能被挖（新手保护，M.5.7）。
import { POACH as X } from '../data/exchange.js';
import { clamp, hash01, fmtMoney } from '../sim/util.js';
import { addDays, daysBetween } from '../sim/clock.js';
import { applyEffects } from '../sim/effects.js';
import { registerKind } from '../sim/queue.js';
import { log } from '../sim/log.js';
import { P } from '../sim/provider.js';
import { ensureIx, newbieDays } from './transfer.js';
import { priceOf, isListed } from './exchange.js';

const SALARY = { CN: 7000, US: 16000, EU: 12000 };
const KNOW_LOSS = 0.1;
const RETAIN = 1.2;          // 加薪留人：每人多付 1.2 倍年薪
export const annualPay = s => (SALARY[s.company?.country] || 14000) * 12;
const nameOf = (world, org) => world.companies?.[org]?.name || org;

export function poachQuote(world, s, target, n = null) {
  const t = world.companies?.[target];
  if (!world.settings?.poach) return { ok: false, reason: '这一局没开挖人（大厅里默认关）' };
  if (!t?.s || t.s.status !== 'playing') return { ok: false, reason: '没有这家公司' };
  if (target === s.charId) return { ok: false, reason: '不能挖自己' };
  if (daysBetween(t.joined || world.startDay, world.day) < newbieDays(world)) return { ok: false, reason: `对方进场还不满 ${newbieDays(world)} 天，在新手保护期里` };
  const last = world.ix?.poach?.[`${s.charId}|${target}`];
  if (last && daysBetween(last, world.day) < X.gap) return { ok: false, reason: `${X.gap} 天内只能挖同一家一次（下次 ${addDays(last, X.gap)}）` };
  const max = Math.max(1, Math.floor((t.s.team || 0) * X.share));
  const k = n === null ? max : Math.min(max, Math.max(1, Math.floor(n)));
  if ((t.s.team || 0) < 10) return { ok: false, reason: '对方团队太小，挖不动' };
  const cost = k * annualPay(t.s) * X.cost;
  if (cost > (s.cash || 0)) return { ok: false, reason: `现金不够：挖 ${k} 人要 ${fmtMoney(cost)}` };
  return { ok: true, n: k, cost, max };
}

// 命令入口：记下这一次（不管成不成都占掉 180 天），对方是电脑就当场处理，是真人就给对方一张卡。
export function poach(world, s, target, n = null) {
  const q = poachQuote(world, s, target, n);
  if (!q.ok) throw new Error(q.reason);
  const ix = ensureIx(world);
  ix.poach[`${s.charId}|${target}`] = world.day;
  const offer = { id: `po_${s.charId}_${target}_${world.day}`, from: s.charId, to: target, n: q.n, cost: q.cost, day: world.day };
  const t = world.companies[target];
  if (t.kind === 'bot') {
    const burn = Math.max(1, (t.s.history?.at(-1)?.costs || 0) - (t.s.history?.at(-1)?.revenue || 0));
    const retain = q.n * annualPay(t.s) * RETAIN;
    const match = t.bot !== 'passive' && t.s.cash - retain > burn * 6;
    return { kind: 'poach', ...finishPoach(world, offer, match) };
  }
  t.s.queue.push({ kind: 'poach_offer', id: offer.id, params: { ...offer, fromName: nameOf(world, s.charId) } });
  log(s, `向 ${nameOf(world, target)} 的 ${q.n} 个人开了价，等对方回应`);
  return { kind: 'poach', pending: true, n: q.n, cost: q.cost };
}

// 成功率：双方口碑差、对方股价走势（近 30 天）和对方士气。
export function poachP(world, a, b) {
  let trend = 0;
  if (isListed(world, b.charId)) {
    const now = priceOf(world, b.charId), then = priceOf(world, b.charId, addDays(world.day, -30));
    if (now > 0 && then > 0) trend = clamp(Math.log(now / then), -0.5, 0.5);
  }
  return clamp(0.45 + ((a.rep || 50) - (b.rep || 50)) / 100 - 0.4 * trend - 0.08 * (b.morale || 0), 0.1, 0.85);
}

export function finishPoach(world, offer, matched) {
  const a = world.companies[offer.from]?.s, b = world.companies[offer.to]?.s;
  if (!a || !b || a.status !== 'playing' || b.status !== 'playing') return { ok: false, note: '有一方已经不在场了。' };
  if (matched) {
    const retain = offer.n * annualPay(b) * RETAIN;
    b.cash -= retain;
    log(b, `加薪留住了被 ${nameOf(world, offer.from)} 挖的 ${offer.n} 个人，花了 ${fmtMoney(retain)}`);
    log(a, `${nameOf(world, offer.to)} 加薪留人，这次没挖成`);
    return { ok: false, matched: true, note: `${nameOf(world, offer.to)} 加薪留人，没挖成。` };
  }
  const p = poachP(world, a, b);
  if (!(hash01(`${world.seed}|poach|${offer.day}|${offer.from}|${offer.to}`) < p)) {
    log(a, `挖 ${nameOf(world, offer.to)} 的人没谈成`);
    return { ok: false, p, note: '人家没答应。' };
  }
  if (offer.cost > a.cash) return { ok: false, p, note: '临到签约现金不够了，没挖成。' };
  a.cash -= offer.cost;
  const n = Math.min(offer.n, Math.max(0, (b.team || 0) - 1));
  const loss = (b.know || 0) * KNOW_LOSS;
  b.team -= n;
  b.know = Math.max(0, (b.know || 0) - loss);
  b.due.poach = addDays(world.day, X.days);
  applyEffects(b, { morale: -1 }, { source: 'world', id: 'poached' });
  a.team += n;
  a.know = (a.know || 0) + loss * X.gain;
  log(a, `从 ${nameOf(world, offer.to)} 挖来 ${n} 个人，付了 ${fmtMoney(offer.cost)}`);
  log(b, `${n} 个人被 ${nameOf(world, offer.from)} 挖走了，${X.days} 天内研究会慢一些`);
  world.news.unshift({ date: world.day.slice(0, 7), day: world.day, type: 'poach', title: `${nameOf(world, offer.from)} 从 ${nameOf(world, offer.to)} 挖走 ${n} 人`, detail: '据说开出了两倍的年薪。' });
  return { ok: true, p, n, note: `挖来了 ${n} 个人。` };
}

registerKind('poach_offer', {
  view(s, q) {
    const p = q.params || {};
    const retain = p.n * annualPay(s) * RETAIN;
    return {
      kind: 'poach_offer', tag: '挖人', title: `${p.fromName || '别家'} 在挖你们的人`,
      text: `${p.fromName || '别家'} 给你们团队里的 ${p.n} 个人开了两倍年薪。可以加薪把人留住，也可以随他们去（走不走看口碑、士气和股价）。`,
      lines: [],
      choices: [
        { id: 'match', label: `加薪留人（${fmtMoney(retain)}）`, hint: '每人多付 1.2 倍年薪，人留下。', disabled: s.cash < retain ? '现金不足' : '' },
        { id: 'let', label: '随他们去', hint: `走了的话，${X.days} 天内研究速度 ×${X.slow}，技术积累少一成。` },
      ],
    };
  },
  resolve(s, q, choiceId) {
    return finishPoach(P().world, q.params || {}, choiceId === 'match').note;
  },
});
