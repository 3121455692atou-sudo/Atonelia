// 电脑公司（规格 M.3.12）：难度只改“多久想一次、想得多细”，不加资源、不改数值。
// 大脑沿用 sim/bot.js 的 botStep（freeOps → planJobs → weekly）；这里补的只有三件：
//   - 被动档每天只跑 freeOps（由 botStep 读 P().botParams 的 MODE 决定）；
//   - 困难档另外照顾问 advise() 的第一条建议做一次；
//   - botPublish：按路线决定送评时附带哪些技术报告。
// 炒股（M2a）、闭源 API 蒸馏（M2b）也在这里；查出别家蒸馏以后怎么处置在 distill_watch.js 的 botChoice。
import { buy, sell, short, cover, fairPrice, poolPrice, priceOf } from './exchange.js';
import { detectP } from './distill_watch.js';
import { orgOfFam } from './transfer.js';
import { botStep } from '../sim/bot.js';
import { advise, applyAdvice } from '../sim/advisor.js';
import { unpublishedFirsts, publishPapers } from '../sim/research.js';
import { distillOptions, doDistillData } from '../sim/data_ops.js';
import { workingModel } from '../sim/model.js';
import { qOf, worldSota, sotaMade } from '../sim/sota.js';
import { lastDistillDay } from '../sim/strategy_ai.js';
import { BOT, GEN } from '../data/balance.js';
import { daysBetween } from '../sim/clock.js';
import { P } from '../sim/provider.js';

// 电脑公司发论文（M.3.12）：
//   - 开源、受限开源路线：送评时附上全部首创技术的报告；
//   - 其余路线：一项首创技术要“别家已经做到 proof 以上（藏不住了）”或者“自己做出来满 365 天”才发。
export function botPublish(world, c) {
  const s = c?.s;
  if (!s || s.mod !== 'llm' || s.status !== 'playing') return [];
  const route = s.route?.stance;
  const ids = unpublishedFirsts(s);
  if (!ids.length) return [];
  const openRoute = route === 'open' || route === 'open_restricted';
  const take = openRoute ? ids : ids.filter(id => {
    const x = world.tech?.[id];
    const publicByOther = x && x.by !== c.id && ['proof', 'paper', 'open'].includes(x.level);
    return publicByOther || daysBetween(s.firsts[id], s.day) >= 365;
  });
  if (take.length) publishPapers(s, take);
  return take;
}

// 困难档：把顾问的第一条可执行建议照做一次。事件卡由 runCommands 先处理掉，这里跳过 'event'。
export function followAdvice(s, errors = []) {
  try {
    const list = advise(s);
    const a = list.find(x => x.kind !== 'event');
    if (!a) return null;
    applyAdvice(s, a);
    return a;
  } catch (e) {
    errors.push(`${s.day} 照顾问建议: ${e.message}`);
    return null;
  }
}

// 电脑公司的一次“想事情”。难度从 P().botParams(s).MODE 读，和世界账本里的 c.bot 对应。
export function botThink(world, c) {
  const s = c.s;
  if (!s || s.status !== 'playing') return null;
  // 托管中的真人公司（联机掉线，M.6.3）按被动档：只跑日常，不立项不送评。
  const level = c.hosted ? 'passive' : (c.bot ?? 'normal');
  if (level === 'passive') {
    // 被动档：botStep 只跑 freeOps，不发论文、不送评。
    botStep(s, c.errors);
    return { level, published: [] };
  }
  // 困难档先看闭源 API 老师（通常比开源的强）：买了就占掉这 90 天的蒸馏，botStep 里不会再买开源的。
  if (level === 'hard') distillTick(world, c);
  botStep(s, c.errors);
  if (level === 'hard') followAdvice(s, c.errors);
  tradeTick(world, c);
  const published = botPublish(world, c);
  return { level, published };
}

// ---------- M2 的三列：这里只留接口，M2 填 ----------
// 炒股：简单不炒；普通只做多（低于公允价 0.9 倍买、高于 1.1 倍卖）；困难会做空（高于 1.2 倍，或期待刚落空）。
export function tradeTick(world, c) {
  const s = c.s;
  const level = c.bot ?? 'normal';
  if (!s || s.status !== 'playing' || level === 'easy' || level === 'passive') return;
  const listings = Object.values(world.exchange?.listings || {});
  if (!listings.length) return;
  // 炒股只用闲钱：每次最多动用 2% 现金，持仓（按池价）超过现金的 15% 就不再加仓，免得挤掉经营要花的钱。
  const exposure = Object.entries(s.market?.holdings || {}).reduce((a, [org, n]) => a + n * priceOf(world, org), 0);
  for (const L of listings) {
    if (L.org === s.charId) continue;
    const fair = fairPrice(world, L), p = poolPrice(L);
    const held = s.market?.holdings?.[L.org] || 0;
    const shorted = s.market?.shorts?.[L.org] || 0;
    try {
      if (held > 0 && p > 1.1 * fair) sell(world, s, L.org, held);
      else if (p < 0.9 * fair && s.cash > 0 && exposure < 0.15 * s.cash) buy(world, s, L.org, s.cash * 0.02);
      if (level !== 'hard') continue;
      // 困难档会做空：高于公允价 1.2 倍，或者那家的旗舰刚被判“不及”“略低”（30 天内）。
      const last = world.companies[L.org]?.s?.expect?.lastJudged?.flagship;
      const failed = !!last && ['under', 'under_half'].includes(last.result) && daysBetween(last.day, world.day) <= 30;
      if (shorted > 0 && p < fair) cover(world, s, L.org, shorted);
      else if (!shorted && (p > 1.2 * fair || failed) && s.cash > 0) short(world, s, L.org, (s.cash * 0.02) / p);
    } catch { /* 条件不满足（涨跌停、成交上限、没票可借）：这次不做 */ }
  }
}
// 闭源 API 蒸馏：困难档估算一个数据包被查出的概率低于 10% 时才会用；普通、简单只用宽松开源老师（sim/bot.js 的 distillTeacher）。
// 时机和开源蒸馏同一套（A10）：没炼出过 SOTA、在练模型落后当前最强至少 DISTILL_GAP、离上次买蒸馏数据满 DISTILL_EVERY 天；
// 老师要比在练模型强 TEACHER_MIN 以上，一包的钱不超过现金的四分之一。只用大客户账号，不开小号。
export const PACK_RISK_MAX = 0.10;
export function packRisk(world, fam, acct = 'big') {
  const t = world.companies?.[orgOfFam(world, fam)]?.s;
  const p = detectP(GEN.packGTok * 1e9 / GEN.apiDays, acct, t?.service?.antiDistill === 'strict');
  return 1 - (1 - p) ** GEN.apiDays;
}
export function distillTick(world, c) {
  const s = c.s;
  if (!s || s.status !== 'playing' || s.mod !== 'llm' || (c.bot ?? 'normal') !== 'hard' || sotaMade(s)) return null;
  const w = workingModel(s);
  if (!w || w.stage === 'pretrain') return null;
  const ws = worldSota(s);
  const q = qOf(s.mod, w.dims);
  if (!ws || q > ws.q - BOT.DISTILL_GAP) return null;
  const last = lastDistillDay(s);
  if (last && daysBetween(last, s.day) < BOT.DISTILL_EVERY) return null;
  let best = null;
  for (const o of distillOptions(s)) {
    if (o.mode !== 'api' || !o.ok || o.cost > s.cash * 0.25 || !(o.teacherQ >= q + BOT.TEACHER_MIN)) continue;
    if (packRisk(world, o.teacher) >= PACK_RISK_MAX) continue;
    if (!best || o.teacherQ > best.teacherQ || (o.teacherQ === best.teacherQ && o.id < best.id)) best = o;
  }
  if (!best) return null;
  try { return doDistillData(s, best.id); } catch (e) { c.errors.push(`${s.day} API 蒸馏: ${e.message}`); return null; }
}

// 查出别家蒸馏以后电脑老师怎么处置：规则写在 distill_watch.js 的 botChoice（收盘时当场处置），这里给个老名字。
export { botChoice as accuseTick } from './distill_watch.js';
export { P };
