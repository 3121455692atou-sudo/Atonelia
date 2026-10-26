// 里程碑判断：谁先做到某件事。只做判断和记账，弹不弹卡由 queue.js 的 fire（弹窗预算），弹窗内容和选项结算在 milestone_view.js。
// 玩家一侧的条件走统一的 cond（规格 E2：player = { on, ...cond }）；对手一侧看发布的标签和相对门槛（atLeast 真实型号、gap 离世界最强），
// 一律按那条发布变为可见的那一天判断。
import { MILESTONES, MS_BY_ID, msMods } from '../data/milestones.js';
import { RELEASES, FAMILIES } from '../data/rivals.js';
import { addDays, dayInMonth } from './clock.js';
import { qOf, isMine, familyBest, worldSota, worldRank, relDims, realQ } from './sota.js';
import { P } from './provider.js';
import { cond } from './cond.js';

const list = v => (Array.isArray(v) ? v : [v]);
// 对手发布的综合分按玩家看到的能力算（跟随者钳制以后，规格 D5）。
const relQ = (s, r) => qOf(r.mod, relDims(s, r));
// 只有带 R 标签的发布才算推理模型（规格 D3、D4 第 5 条）。
export const isReasoningRelease = r => (r.tags || []).includes('R');
const relDay = m => m?.releasedDay ?? null;
const startDay = s => (s.start ? `${s.start}-01` : s.day);
// 截至某天最好的闭源模型：别家各家族最强的闭源型号（先筛闭源再取最强，家族最强那款是开源的也不跳过这家），加上玩家自己发布过的闭源模型。
function bestClosedQ(s, mod, day) {
  let best = 0;
  for (const m of s.models || []) if (m.stage === 'released' && !m.open && (relDay(m) ?? '9999') <= day) best = Math.max(best, qOf(mod, m.dims));
  for (const f of Object.keys(FAMILIES)) {
    if (FAMILIES[f].mod !== mod || FAMILIES[f].extra || isMine(s, f)) continue;
    const r = familyBest(s, f, day, { open: false });
    if (r) best = Math.max(best, relQ(s, r));
  }
  return best;
}
const dimsOk = (dims, need) => Object.entries(need || {}).every(([k, v]) => (dims?.[k] ?? 0) >= v);

// 别家这条发布算不算做到（ms.rival），按 day（默认是它变为可见的那天）判断。
// atLeast 比的是原始综合分（和 realQ 同一口径：现实里那款就是门槛，钳制不改变“它做到了”）；gap、dims、closeToTop 比玩家眼里的能力。
export function rivalMatch(s, ms, rel, day = rel.day ?? s.day) {
  const c = ms.rival;
  if (!c || rel.mod !== ms.mod) return false;
  const tags = rel.tags || [];
  if (c.open !== undefined && !!rel.open !== c.open) return false;
  if (c.cls && !c.cls.includes(rel.cls)) return false;
  if (c.tag && !list(c.tag).every(t => tags.includes(t))) return false;
  if (c.anyTag && !c.anyTag.some(t => tags.includes(t))) return false;
  if (c.reasoning && !isReasoningRelease(rel)) return false;
  if (c.atLeast) { const rq = realQ(c.atLeast.name); if (rq === null || qOf(rel.mod, rel.dims) < rq - (c.atLeast.d || 0)) return false; }
  if (c.gap !== undefined) { const ws = worldSota(s, { day, mod: rel.mod }); if (ws && relQ(s, rel) < ws.q - c.gap) return false; }
  if (c.rank && worldRank(s, relQ(s, rel), day) > c.rank) return false;
  if (c.dims && !dimsOk(relDims(s, rel), c.dims)) return false;
  if (c.closeToTop && relQ(s, rel) < bestClosedQ(s, rel.mod, day) - c.closeToTop) return false;
  return true;
}

// 玩家一侧：钩子对得上，再看钩子自己的键（tech、first、papers）、里程碑自己的两个键，其余交给 cond。
const HOOK_KEYS = new Set(['on', 'tech', 'first', 'papers']);
const LOCAL = {
  // 这一版不弱于一年前的世界最强（“小模型追上了去年的旗舰”）。
  beatLastYear: (s, v, ctx) => !v || (!!ctx.model && qOf(s.mod, ctx.model.dims) >= (worldSota(s, { day: addDays(s.day, -365) })?.q ?? 0)),
  // 对话产品在线、内容尺度宽松。
  lenient: (s, v) => !v || (s.service?.contentPolicy === 'lenient' && !!s.products?.chat?.on),
};
// player 里交给 cond 的那部分（缓存，数据不会变）。
const COND = new WeakMap();
export function playerCond(ms) {
  if (!ms.player) return null;
  if (!COND.has(ms)) {
    const c = Object.fromEntries(Object.entries(ms.player).filter(([k]) => !HOOK_KEYS.has(k) && !(k in LOCAL)));
    COND.set(ms, Object.keys(c).length ? c : null);
  }
  return COND.get(ms);
}
export function playerMatch(s, ms, ctx) {
  const p = ms.player;
  if (!p || !list(p.on).includes(ctx.on)) return false;
  if (ctx.on === 'tech') return ctx.tech === p.tech && (!p.first || !!ctx.first);
  if (ctx.on === 'paper') return (p.papers || []).some(t => (ctx.techs || []).includes(t));
  for (const [k, test] of Object.entries(LOCAL)) if (p[k] !== undefined && !test(s, p[k], ctx)) return false;
  return cond(s, playerCond(ms), { model: ctx.model });
}

const pre = (s, ms) => {
  if (ms.after && !(s.ms[ms.after] && s.ms[ms.after].who !== 'me')) return false;
  if (ms.needMine && s.ms[ms.needMine]?.who !== 'me') return false;
  return true;
};
// 本模态的里程碑：行业第一次排在前面。
export const ofMod = s => MILESTONES.filter(m => msMods(m).includes(s.mod)).sort((a, b) => (a.type === 'first' ? 0 : 1) - (b.type === 'first' ? 0 : 1));
// 卡片上的“这一款”：一般是这次发布的模型；subject 'sota' 是第一枚算数标签的那款。
function subjectOf(s, ms, ctx) {
  if (ms.subject === 'sota') {
    const id = s.sota?.made?.[0]?.modelId;
    return (s.models || []).find(m => m.id === id) || null;
  }
  return ctx.model || null;
}
const mineEntry = (s, m, extra = {}) => ({ who: 'me', day: s.day, model: m?.name || null, modelId: m?.id ?? null, ...extra });

// 有事发生时检查（fire 调用）：返回这个钩子满足条件的里程碑候选卡片，账本已经记好。
// 谁先做到只看账本：行业第一次一旦记下就不会再改；卡片弹不弹由 fire 按弹窗预算决定（落选的行业第一次照样记着，只发快讯；
// 落选的自家里程碑从账本里撤掉，下次满足条件时再说）。
// 开局第一次月结时已经满足的经营类里程碑，算开局前就做到了，悄悄记下、不出卡片。
export function milestoneCandidates(s, ctx) {
  if (s.msVer !== MS_VER || !s.ms || typeof s.ms !== 'object') throw Error('不支持旧版里程碑存档，请新开一局');
  const out = [];
  const silent = ctx.on === 'month' && !s.monthsPlayed;
  for (const ms of ofMod(s)) {
    if (s.ms[ms.id] || !pre(s, ms)) continue;
    if (ctx.on === 'rival' && ms.type === 'first' && ms.rival && rivalMatch(s, ms, ctx.rel, s.day)) {
      s.ms[ms.id] = { who: ctx.rel.family, model: ctx.rel.name, day: s.day, open: ctx.rel.open };
      out.push({ kind: 'milestone', id: ms.id, v: 'rival', fam: ctx.rel.family, rel: ctx.rel.name });
    } else if (ctx.on === 'rivaltech' && ms.type === 'first' && ms.rivalTech === ctx.tech) {
      s.ms[ms.id] = { who: ctx.fam, day: s.day, note: ctx.note, level: ctx.level };
      out.push({ kind: 'milestone', id: ms.id, v: 'rival', fam: ctx.fam, note: ctx.note, level: ctx.level });
    } else if (playerMatch(s, ms, ctx)) {
      const m = subjectOf(s, ms, ctx);
      // “第一次炼出 SOTA”只会在开局以后发生：第一次月结时成立的是被挤掉后补弹的，照样出卡片。
      const quiet = silent && ms.subject !== 'sota';
      s.ms[ms.id] = mineEntry(s, m, quiet ? { silent: true } : {});
      if (!quiet) out.push({ kind: 'milestone', id: ms.id, v: 'mine', model: m?.name || null });
    }
  }
  return out;
}
// 新开局：截止日之前已经有人做到的，悄悄记在做到的人名下，不弹卡。
// cutoff：这一天（不含）之前发生的都算“已经发生过”。只使用开局日。写成 'YYYY-MM' 时按那个月的 1 号算。
// 按日期从早到晚过一遍：
//   - 对手发布（cutoff 之前变为可见的）和开局之前本公司自己的真实发布（现实里是我们做到的，记成 me），按发布那天判断；
//   - 公开技术（rivalTech）：别家或学界在截止日之前公开的，本公司在开局之前公开的（记成 me），或者开局就会这项技术；
//   - 玩家已经发布的模型（开局继承的型号只看自家里程碑），按它发布那天判断；
// 补记完写账本版本号 s.msVer = MS_VER（里程碑表加了要补记的条目时加 1）。
export const MS_VER = 1;
export function initMilestones(s, cutoff = startDay(s)) {
  s.ms = s.ms || {};
  const before = /^\d{4}-\d{2}$/.test(cutoff) ? `${cutoff}-01` : cutoff;
  const st = startDay(s);
  const evs = [];
  for (const r of RELEASES) {
    if (r.mod !== s.mod || !r.day) continue;
    if (isMine(s, r.family) ? r.day < st && r.day < before : r.day < before) evs.push({ day: r.day, ord: r.ord ?? 0, r });
  }
  for (const m of s.models || []) {
    const d = relDay(m);
    if (m.stage === 'released' && d && d < before) evs.push({ day: d, ord: Infinity, m });
  }
  evs.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.ord - b.ord));
  const firsts = ofMod(s).filter(ms => ms.type === 'first');
  for (const e of evs) {
    if (e.r) {
      for (const ms of firsts) {
        if (s.ms[ms.id] || !ms.rival || !rivalMatch(s, ms, e.r, e.day)) continue;
        const own = isMine(s, e.r.family);
        const m = own ? (s.models || []).find(x => x.name === e.r.name) : null;
        s.ms[ms.id] = own ? { who: 'me', day: null, silent: true, model: e.r.name, modelId: m?.id ?? null } : { who: e.r.family, model: e.r.name, day: null, silent: true };
      }
    } else {
      atDay(s, e.day, () => {
        for (const ms of ofMod(s)) {
          // 开局继承的真实型号：行业第一次已经按真实发布（带标签）判断过了，这里只补自家里程碑。
          if (ms.type === 'first' && e.m.hist) continue;
          if (!s.ms[ms.id] && list(ms.player?.on).includes('release') && ms.subject !== 'sota' && pre(s, ms) && playerMatch(s, ms, { on: 'release', model: e.m })) {
            s.ms[ms.id] = { who: 'me', day: null, silent: true, model: e.m.name, modelId: e.m.id };
          }
        }
      });
    }
  }
  for (const ms of firsts) {
    if (s.ms[ms.id] || !ms.rivalTech) continue;
    // 公开那天和 startOfMonth 排新闻的是同一天（dayInMonth）；本公司自己公开的只算开局之前的（现实里是我们做到的，记成 me）。
    const src = (P().techSources(ms.rivalTech) || []).map(([d, f, lv]) => ({ day: dayInMonth(d, `${ms.rivalTech}|${f}`), f, lv, own: f !== 'academia' && isMine(s, f) }))
      .filter(x => x.lv !== 'proof' && x.day < before && (!x.own || x.day < st)).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))[0];
    if (src) s.ms[ms.id] = { who: src.own ? 'me' : src.f, day: null, silent: true };
    else if ((s.techs || []).includes(ms.rivalTech)) s.ms[ms.id] = { who: 'me', day: null, silent: true };
  }
  s.msVer = MS_VER;
}
// 按某一天判断（玩家的旧发布要按它发布那天的世界比）：临时把日期拨过去，判断完拨回来。
function atDay(s, day, fn) {
  if (!day || day === s.day) return fn();
  const d0 = s.day, m0 = s.date;
  s.day = day;
  s.date = day.slice(0, 7);
  try { return fn(); } finally { s.day = d0; s.date = m0; }
}

