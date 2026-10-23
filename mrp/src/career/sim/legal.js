// 法务：立案、诉讼进度和判决。
import { CASES } from '../data/events.js';
import { clamp, rand, fmtMoney } from './util.js';
import { addDays } from './clock.js';
import { liveModel } from './model.js';
import { riskSafety } from './evals.js';
import { applyEffects } from './effects.js';
import { P } from './provider.js';

// 同一类官司打完（或和解）以后，这么久之内不会再被告同一类。
export const CASE_COOL_DAYS = 420;

export function legalTick(s, report) {
  for (const c of s.legal.cases) {
    if (!c.fighting) continue;
    c.left -= 1;
    if (c.left <= 0) {
      const win = rand(s) < c.winp;
      c.done = true;
      if (win) { report.notes.push(`${c.title}：法院判你们胜诉。`); s.rep = clamp(s.rep + 2, 0, 100); }
      else { s.cash -= c.claim; if (c.vendorOrg) P().transfer(s, c.vendorOrg, c.claim, 'case'); applyEffects(s, { rep: -6, stockShock: { self: -0.08 } }, { source: 'event', id: 'lawsuit' }); report.notes.push(`${c.title}：败诉，赔偿 ${fmtMoney(c.claim)}。`); }
      s.legal.history.push({ ...c, outcome: win ? '胜诉' : '败诉' });
    }
  }
  s.legal.cases = s.legal.cases.filter(c => !c.done);
}

// 立案的唯一入口（规格 E1 的 case 键也走这里）：同一类官司已经在打、在排队，或者还在冷却期，就不立。立了就进冷却。
// 默认是“收到起诉书”：排进一张诉讼事件卡，由玩家选和解、整改还是应诉。
// now: true 是直接立案开打（集体诉讼一类，没有和解的余地）：索赔按收入的 mult 倍算。
// 返回这次有没有立案。
export function openCase(s, type, { now = false, mult = 1, ...extra } = {}) {
  const cool = (s.cool ??= {});
  if (s.legal.cases.some(c => c.type === type) || cool[`case_${type}`] > s.day || s.queue.some(q => q.params?.type === type)) return false;
  const def = CASES[type];
  cool[`case_${type}`] = addDays(s.day, CASE_COOL_DAYS);
  if (now) {
    const revBase = Math.max(5e6, (s.history.at(-1)?.revenue || 0) * 8);
    s.legal.cases.push({ type, title: def.title, claim: Math.round(revBase * mult), winp: 0.2, left: 8, fee: Math.round(revBase * 0.01), opened: s.date, fighting: true });
    return true;
  }
  const revBase = Math.max(1e6, (s.history.at(-1)?.revenue || 0) * 6);
  const size = s.company.kind === 'division' ? 1.5 : clamp(s.valuation / 2e10, 0.01, 2);
  const usage = clamp(revBase / 3e7, 0.15, 3);
  const claim = Math.round(type === 'class' ? revBase : ['books', 'code', 'tos', 'image', 'music'].includes(type) ? def.claim * size : def.claim * usage);
  // 风险读数统一走 riskSafety（T6.4）：评测档决定加成和封顶，跳过评测的按最多 62 算。
  const safety = riskSafety(s, liveModel(s)) ?? 50;
  let winp = def.win + (safety - 60) / 200;
  if (type === 'books' && P().gate('booksPrecedent', s)) winp -= 0.1;
  if (s.company.country === 'CN') winp += 0.1;
  winp = clamp(winp, 0.05, 0.85);
  s.queue.push({ kind: 'event', id: 'lawsuit', params: { type, claim, winp, months: 6 + Math.round(rand(s) * 6), fee: Math.round(Math.max(1.5e5, claim * 0.01)), ...extra } });
  return true;
}
