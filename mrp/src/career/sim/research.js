// 研究：像钢铁雄心那样有几个研究槽并行，每项技术要花几十到几百天。
// 别人做出来、发了论文、开了源以后，照着学会快很多；谁都没公开过的只能自研，最慢。
// 技术积累（s.know）是团队多年攒下的经验：研究更快、预训练更稳更快、后训练更有效；蒸馏会拖慢它。
import { TECHS, TECH_BY_ID, monthsBetween, fmtDate } from '../data/core.js';
import { LEVEL_MULT, LEVEL_LABEL, AHEAD_MONTHS, AHEAD_PENALTY, PREREQ } from '../data/techsrc.js';
import { FAMILIES } from '../data/rivals.js';
import { isMine } from './sota.js';
import { P } from './provider.js';
import { clamp, scaleBrand } from './util.js';
import { log } from './log.js';
import { modifier } from './modifiers.js';
import { heavyWork } from './jobs.js';

const LEVELS = ['secret', 'proof', 'paper', 'open'];
const famName = f => (f === 'academia' ? '学界与开源社区' : FAMILIES[f]?.company || f);

// 这项技术眼下在业界公开到什么程度。玩家自己这条线的“现实成果”不算：那条线由玩家来写。
export function techStatus(s, t) {
  let best = null;
  const sources = P().techSources(t.id);
  for (const [date, fam, level, note] of sources || []) {
    if (date > s.date || (!P().techSelf && fam !== 'academia' && isMine(s, fam))) continue;
    if (!best || LEVELS.indexOf(level) > LEVELS.indexOf(best.level)) best = { level, date, fam, who: famName(fam), note };
  }
  // 没有来源记录的老技术：到了公开时间就当作论文已公开。
  if (!best && sources === undefined && s.date >= t.from) best = { level: 'paper', date: t.from, fam: 'academia', who: famName('academia'), note: '' };
  // 读过别家的论文或拆过开源权重（事件里选的“照着复现”），按至少论文级别算。
  if (s.techRead?.[t.id] && (!best || LEVELS.indexOf(best.level) < LEVELS.indexOf('paper'))) best = { level: 'paper', date: s.techRead[t.id], fam: 'academia', who: '你们读过的论文', note: '' };
  const level = best?.level || 'secret';
  return { level, label: LEVEL_LABEL[level], src: best, ahead: Math.max(0, monthsBetween(s.date, t.from)) };
}

export const missingPrereq = (s, t) => (PREREQ[t.id] || []).filter(id => !s.techs.includes(id)).map(id => TECH_BY_ID[id]);
// 研究槽：按团队规模 1–5 个，再加特质给的 slots（规格 E3，例如推理攻坚组 +1），至少 1 个。
export const researchSlots = s => Math.max(1, (s.team < 30 ? 1 : s.team < 90 ? 2 : s.team < 250 ? 3 : s.team < 800 ? 4 : 5) + Math.round(modifier(s, 'slots')));

// 技术积累带来的加成。
export function knowFx(s) {
  const k = Math.max(0, s.know || 0);
  return { research: Math.min(0.4, k / 500), pretrain: Math.min(0.12, k / 1200), risk: Math.min(0.4, k / 500), post: Math.min(0.1, k / 1000) };
}

// 一个研究槽每天能推进几“人天”。团队越大越快；专心做研究时快很多；技术积累、士气加成；依赖蒸馏、刚被挖走人时变慢；再乘特质的 research（E3）。
export function researchSpeed(s) {
  const base = clamp(0.55 + 0.25 * Math.log2(Math.max(1, s.team) / 40), 0.4, 1.4);
  // 团队在训练、维护时只有少数人顾得上研究；专心做研究时快得多。
  // “重活”口径（规格 T4.7，jobs.js 的 heavyWork）：有后训练（含排队、刷榜）或正在检修时 ×0.4，没有时 ×1.7。
  const focus = heavyWork(s).busy;
  return base * focus * (1 + knowFx(s).research) * (1 + 0.08 * (s.morale || 0)) * (1 - 0.4 * (s.distillDep || 0)) * (s.due?.poach > s.day ? 0.8 : 1) * modifier(s, 'research');
}

// 还要多少人天才能做完：基础工作量 × 公开程度倍率（自研还要加上超前惩罚）× 读过论文的折扣。
export function researchNeed(s, t) {
  const st = techStatus(s, t);
  let mult = LEVEL_MULT[st.level];
  if (st.level === 'secret') mult += AHEAD_PENALTY * st.ahead;
  return Math.round(t.cost * 3.5 * mult * (s.techBoost?.[t.id] || 1));
}

// 能不能开始研究，不能的话为什么。
export function researchCheck(s, t) {
  if (!t || t.mod !== s.mod) return { ok: false, reason: '不适用' };
  if (s.techs.includes(t.id)) return { ok: false, reason: '已经掌握' };
  if ((s.research || []).some(r => r.id === t.id)) return { ok: false, reason: '正在研究' };
  const st = techStatus(s, t);
  if (st.level === 'secret' && st.ahead > AHEAD_MONTHS) return { ok: false, reason: `还摸不到门路（技术年表 ${fmtDate(t.from)} 才进入探索期，最多能提前 ${AHEAD_MONTHS} 个月自研）` };
  const lack = missingPrereq(s, t);
  if (lack.length) return { ok: false, reason: `要先掌握：${lack.map(x => x.name).join('、')}` };
  if ((s.research || []).length >= researchSlots(s)) return { ok: false, reason: `研究槽满了（${researchSlots(s)} 个）` };
  return { ok: true, reason: '' };
}

// 能看到的技术：已经能研究的，以及最多提前一年能自研的。
export function researchOptions(s) {
  return TECHS.filter(t => t.mod === s.mod && !s.techs.includes(t.id) && !(s.research || []).some(r => r.id === t.id))
    .map(t => ({ t, st: techStatus(s, t), need: researchNeed(s, t), check: researchCheck(s, t) }))
    .filter(x => x.st.level !== 'secret' || x.st.ahead <= AHEAD_MONTHS);
}

export function startResearch(s, id) {
  const t = TECH_BY_ID[id];
  const c = researchCheck(s, t);
  if (!c.ok) throw new Error(c.reason);
  const st = techStatus(s, t);
  s.research = s.research || [];
  // 以前做到一半停下的，进度还在。
  const done = s.researchDone?.[id] || 0;
  s.research.push({ id, done, need: researchNeed(s, t), level: st.level, since: s.day });
  return { tech: t, level: st.level, days: daysLeft(s, s.research.at(-1)) };
}
export function stopResearch(s, id) {
  const r = (s.research || []).find(x => x.id === id);
  if (!r) return;
  s.researchDone = { ...(s.researchDone || {}), [id]: r.done };
  s.research = s.research.filter(x => x.id !== id);
}
export const daysLeft = (s, r) => Math.max(1, Math.ceil((r.need - r.done) / Math.max(0.05, researchSpeed(s))));

// 公开程度变了（别人发了论文、开了源）：在研项目剩下的工作量跟着缩短。
function refreshNeed(s, r) {
  const t = TECH_BY_ID[r.id];
  const need = researchNeed(s, t);
  if (need < r.need) { r.done = r.done * need / r.need; r.need = need; r.level = techStatus(s, t).level; }
}

// 每天推进；做完的返回列表（里面带着做完时的公开程度，secret 就是业界首创）。
export function researchTick(s, day = 1) {
  const out = [];
  if (!s.research?.length) return out;
  const v = researchSpeed(s) * day;
  for (const r of s.research) {
    refreshNeed(s, r);
    r.done += v;
    if (r.done >= r.need) out.push(r);
  }
  for (const r of out) {
    const t = TECH_BY_ID[r.id];
    s.research = s.research.filter(x => x !== r);
    if (s.researchDone) delete s.researchDone[r.id];
    s.techs.push(r.id);
    s.know = (s.know || 0) + t.cost * (r.level === 'secret' ? 0.8 : r.level === 'open' ? 0.25 : 0.4);
    if (r.level === 'secret') s.firsts = { ...(s.firsts || {}), [r.id]: s.day };
  }
  return out.map(r => ({ tech: TECH_BY_ID[r.id], first: r.level === 'secret' }));
}

// 事件里“占用研究团队几天”：在研项目一起往后推。
export function delayResearch(s, days) {
  const v = researchSpeed(s) * days;
  for (const r of s.research || []) r.done = Math.max(0, r.done - v);
}

// 技术积累的日常增长：做研究攒得最快，训练时也攒一点；依赖蒸馏时攒得慢；再乘特质的 knowGain（E3）。
export function knowTick(s, day = 1) {
  const base = clamp(0.55 + 0.25 * Math.log2(Math.max(1, s.team) / 40), 0.4, 1.6);
  // 检修 0.03、有非刷榜的后训练 0.08、只有刷榜 0.03、都没有 0.3（jobs.js 的 heavyWork）。
  const rate = heavyWork(s).know;
  s.know = (s.know || 0) + base * rate * (1 - 0.6 * (s.distillDep || 0)) * modifier(s, 'knowGain') * day;
}

// 玩家首创、还没公开的技术（发布时可以选择写进技术报告）。
export const unpublishedFirsts = s => Object.keys(s.firsts || {}).filter(id => !(s.papers || {})[id]);
// 发表技术报告：口碑、品牌、技术积累都涨；从此别人也能照着学。
export function publishPapers(s, ids) {
  if (!Array.isArray(ids)) throw new Error('技术报告列表必须是数组');
  // One report earns its reward once, even when a submission repeats the ID.
  // Resolve the entire selection before writing; unknown/non-string IDs remain ignored.
  const papers = s.papers || {};
  const fresh = [...new Set(ids)].filter(id => typeof id === 'string' && Object.hasOwn(TECH_BY_ID, id)
    && Object.hasOwn(s.firsts || {}, id) && s.firsts[id] && !Object.hasOwn(papers, id));
  s.papers = papers;
  for (const id of fresh) {
    s.papers[id] = s.day;
    s.know = (s.know || 0) + 6;
    scaleBrand(s, 1.03);
    s.rep = clamp(s.rep + 1.5, 0, 100);
  }
  return fresh.map(id => TECH_BY_ID[id]);
}

// 开局时的技术积累：公司越大、开局越晚，攒得越多。
export function startKnow(tier, scenarioStart) {
  const base = { frontier: 120, bigtech: 80, major: 55, specialist: 40, small: 20 }[tier] ?? 40;
  return Math.round(base * (1 + 0.3 * Math.max(0, monthsBetween('2023-01', scenarioStart) / 12)));
}
// 研究不再是攒够点数立刻学会：放进研究槽，按天推进。旧接口名保留给测试和自动对局用。
export function researchTech(s, id) {
  const r = startResearch(s, id);
  log(s, `开始研究：${r.tech.name}（${LEVEL_LABEL[r.level]}，约 ${r.days} 天）`);
  return r.tech;
}
export function stopTech(s, id) { stopResearch(s, id); log(s, `暂停研究：${TECH_BY_ID[id]?.name || id}`); }
