// 技术账本（规格 M.3.6）：世界只存一份“这项技术公开到什么程度”，开局初始化，之后由各家行为升档。
// 等级：secret 只有做出它的那家知道 → proof 产品上线 → paper 论文/技术报告 → open 开源权重。
// 没人主动公开时，学界按天数反推、复现；只有“开局初始化”和“学界日历”来的等级不参加自动升档。
import { TECHS, TECH_BY_ID } from '../data/core.js';
import { TECH_SRC } from '../data/techsrc.js';
import { FAMILIES } from '../data/rivals.js';
import { SELF } from '../data/selfplay.js';
import { addDays, daysBetween } from '../sim/clock.js';

export const LEVELS = ['none', 'secret', 'proof', 'paper', 'open'];
export const ACAD_ORIGINAL = ['distill', 'dpo', 'long_ctx', 'flash_attn', 'spec_decode'];
const LV = LEVELS;

const orgName = org => (org === 'academia' ? '学界' : FAMILIES[org]?.company || org);
const levelWord = level => ({ none: '没人会', secret: '自研（只有它知道）', proof: '有人做出来了', paper: '论文公开', open: '开源' }[level] || level);

// 开局初始化（从零局）：只留学界开局前的条目；学界自己首创的 5 项保留开局以后的日历。
// 没有来源记录的老技术返回 undefined，照旧到 t.from 自动按论文公开（research.js 的原有规则）。
export function initTech(world) {
  const ym0 = world.day.slice(0, 7);
  world.tech = {};
  world.techSrc = {};
  world.techCalendar = {};
  world.techHasSource = {};
  world.techLog = [];
  for (const t of TECHS.filter(x => x.mod === 'llm')) {
    const list = TECH_SRC[t.id];
    if (list === undefined) {
      world.techHasSource[t.id] = false;
      if (t.from <= ym0) world.tech[t.id] = { level: 'paper', by: 'academia', since: world.day, cal: true };
      continue;
    }
    world.techHasSource[t.id] = true;
    const pre = list.filter(([ym, fam]) => fam === 'academia' && ym <= ym0);
    const future = ACAD_ORIGINAL.includes(t.id) ? list.filter(([ym, fam]) => fam === 'academia' && ym > ym0) : [];
    world.techSrc[t.id] = pre.map(([ym, , level, note]) => [ym, 'academia', level, note || '']);
    world.techCalendar[t.id] = future.map(([ym, , level, note]) => [ym, level, note || '']);
    for (const [, , level] of pre) {
      if (LV.indexOf(level) > LV.indexOf(world.tech[t.id]?.level ?? 'none')) world.tech[t.id] = { level, by: 'academia', since: world.day, cal: true };
    }
  }
  return world.tech;
}

// 某项技术在某个年月公开到什么程度（startTechs、开局初始化和测试用）。
export function levelAt(world, id, ym) {
  const t = TECH_BY_ID[id];
  if (!t) return 'none';
  const cur = world.tech?.[id];
  if (cur && cur.since.slice(0, 7) <= ym) return cur.level;
  let best = 'none';
  for (const [d, , level] of world.techSrc?.[id] || []) if (d <= ym && LV.indexOf(level) > LV.indexOf(best)) best = level;
  if (best === 'none' && world.techHasSource?.[id] === false && t.from <= ym) return 'paper';
  return best;
}

// WorldProvider 的口子：折成 research.js 认的四元组。
// 原本没有来源记录的老技术返回 undefined（不是空数组），照旧走“到 t.from 自动按论文公开”。
export function techSources(world, id) {
  if (world.techHasSource?.[id] === false) return undefined;
  return world.techSrc?.[id] || [];
}

// 从零局的开局技术（M.2.2）：引擎按年份发的那批里，只留世界账本里已经到论文或开源的。
export function startTechs(world, baseIds, startYm) {
  return (baseIds || []).filter(id => {
    const t = TECH_BY_ID[id];
    if (!t || t.mod !== 'llm') return true;
    return ['paper', 'open'].includes(levelAt(world, id, startYm));
  });
}

// 升档。只在等级真正提高时记事件；secret 只记在账本里，不算公开。
// cal：学界日历（天时），不触发自动升档，也不算技术扩散。
export function techUp(world, id, level, org, why, { cal = false } = {}) {
  const t = TECH_BY_ID[id];
  if (!t || t.mod !== 'llm') return false;
  const cur = world.tech[id]?.level ?? 'none';
  if (LV.indexOf(level) <= LV.indexOf(cur)) return false;
  world.tech[id] = { level, by: org, since: world.day, cal };
  world.techLog.push(`${world.day} ${t.name}：${levelWord(cur)} → ${levelWord(level)}（${orgName(org)}，${why}）`);
  if (level === 'secret') return true;
  if (!cal) {
    if (!world.techSrc[id]) world.techSrc[id] = [];
    world.techSrc[id].push([world.day.slice(0, 7), org, level, why]);
    // 别家看得到：次日早上排进新闻（沿用 loop.js 的“技术公开 → 里程碑”链）。
    for (const c of Object.values(world.companies || {})) {
      if (c.id === org || c.s?.status !== 'playing') continue;
      c.s.scheduled.push({
        at: addDays(world.day, 1),
        news: { date: world.day.slice(0, 7), day: world.day, type: 'tech', title: `${orgName(org)}：${t.name}`, detail: why },
        techsrc: [id, org, level, why],
      });
    }
  }
  // 技术扩散：一项 LLM 技术第一次由公司从“没公开”升到论文或开源，学界目标 +0.4（每项只算一次）。
  if (org !== 'academia' && LV.indexOf(cur) < LV.indexOf('paper') && LV.indexOf(level) >= LV.indexOf('paper') && !world.acad.gains.includes(id)) {
    world.acad.gains.push(id);
    world.acad.publishers.push(org);
  }
  return true;
}

// 学界日历：只有开局之后、学界自己首创的 5 项（M.3.6 的“天时”）。
export function techCalendarTick(world, day) {
  if (!day.endsWith('-01')) return false;
  const ym = day.slice(0, 7);
  let any = false;
  for (const [id, list] of Object.entries(world.techCalendar || {})) {
    let best = null;
    for (const [d, level, note] of list) if (d === ym && (!best || LV.indexOf(level) > LV.indexOf(best[1]))) best = [id, level, note];
    if (best) any = techUp(world, best[0], best[1], 'academia', '学界（日历）', { cal: true }) || any;
  }
  return any;
}

// 没人主动公开时自动升档：proof 满 365 天反推成 paper，paper 再满 180 天开源复现。
// 开局初始化和学界日历来的等级（cal）不参加。
export function techAuto(world) {
  let any = false;
  for (const [id, x] of Object.entries(world.tech)) {
    if (x.cal) continue;
    const age = daysBetween(x.since, world.day);
    if (x.level === 'proof' && age >= SELF.TECH_AUTO.proofToPaper) any = techUp(world, id, 'paper', 'academia', '照着产品反推出方法发了论文') || any;
    else if (x.level === 'paper' && age >= SELF.TECH_AUTO.paperToOpen) any = techUp(world, id, 'open', 'academia', '开源了复现代码') || any;
  }
  return any;
}

// 公司这一天的行为：研究完成记 secret、发技术报告记 paper。用公司自己的账本去重。
export function refreshCompanyTech(world, c) {
  const s = c.s;
  let any = false;
  for (const id of Object.keys(s.firsts || {})) {
    if (c.techFirsts[id]) continue;
    c.techFirsts[id] = s.firsts[id];
    any = techUp(world, id, 'secret', c.id, '自研完成') || any;
  }
  for (const id of Object.keys(s.papers || {})) {
    if (c.techPapers[id]) continue;
    c.techPapers[id] = s.papers[id];
    any = techUp(world, id, 'paper', c.id, '发了技术报告') || any;
  }
  return any;
}

// 带这项技术的模型上线：开源权重 → open，闭源上线 → proof。
export function refreshReleaseTech(world, org, m) {
  let any = false;
  for (const id of m.techs || []) {
    if (TECH_BY_ID[id]?.mod !== 'llm') continue;
    any = techUp(world, id, m.open ? 'open' : 'proof', org, m.open ? `开源 ${m.name} 的权重` : `${m.name} 上线`) || any;
  }
  return any;
}
