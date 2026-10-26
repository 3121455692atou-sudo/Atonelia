// 公司策略的顾问和机器人规则（规格 A10；advisor 和 bot 共用）：节点打分、挑下一项、该不该蒸馏、发布时要不要再练一阵。
// 都不用随机数；同分按 id 排序，结果确定。
import { DIRECTIONS, TECH_BY_ID } from '../data/core.js';
import { BOT } from '../data/balance.js';
import { daysBetween } from './clock.js';
import { cond } from './cond.js';
import { workingModel } from './model.js';
import { qOf, worldSota, sotaMade } from './sota.js';
import { expectPreview, ensureExpect } from './expect.js';
import { distillOptions } from './data_ops.js';
import { resolvedTree, canStart, histDay, spiritDef, CORE_NODE_IDS } from './strategy.js';
import { grantsFor, nameGrantCheck } from './naming.js';
import { releaseLine } from './release.js';
import { submitBlock } from './evals.js';
import { releaseOpen } from './route.js';

// ---------- 打分 ----------
// 董事会目标加权（adaptive）：12 个月内要查的营收、估值、用量目标 → 市场分支 ×1.5；榜单、名次目标 → 推理、效率分支 ×1.5。
const MARKET_GOALS = ['revenue', 'valuation', 'usage'], BENCH_GOALS = ['bench', 'rank'];
const BRANCH_FOR = { market: MARKET_GOALS, reason: BENCH_GOALS, arch: BENCH_GOALS };
function goalTypes(s) {
  const out = new Set();
  for (const g of s.goals || []) {
    if (g.status !== 'pending' || typeof g.date !== 'string' || !/^\d{4}-\d{2}$/.test(g.date)) continue;
    if (daysBetween(s.day, `${g.date}-01`) <= 365) out.add(g.check?.type);
  }
  return out;
}
// 节点碰到了哪些能力维度：效果里的 dims、后训练数据（类别换成维度）、加速研究的技术的上限和后训练效果、特质加成里的 cap.<维度> / post.<维度>。
const DIM_OF_CAT = {};
for (const [mod, list] of Object.entries(DIRECTIONS)) for (const d of list) if (d.data && d.main) (DIM_OF_CAT[mod] ??= {})[d.data] = d.main;
function nodeDims(s, n) {
  const out = new Set(Object.keys(n.effects?.dims || {}));
  for (const c of Object.keys(n.effects?.data?.post || {})) if (DIM_OF_CAT[s.mod]?.[c]) out.add(DIM_OF_CAT[s.mod][c]);
  for (const t of Object.keys(n.effects?.techBoost || {})) for (const g of ['cap', 'post']) for (const k of Object.keys(TECH_BY_ID[t]?.effects?.[g] || {})) out.add(k);
  for (const x of n.spirits?.add || []) for (const k of Object.keys(spiritDef(s, typeof x === 'string' ? x : x.id)?.mods || {})) if (/^(cap|post)\./.test(k)) out.add(k.slice(k.indexOf('.') + 1));
  return out;
}
// 节点打分（mode：'historic' | 'adaptive'）。基础分 ai.base × 满足条件的 factors.mult。
//   historic：有史实日期、离今天 60 天以内的加 ai.historic；史实日期比今天晚 180 天以上的 ×0.1；架空节点 0 分。
//   adaptive：董事会目标加权；碰到公司擅长的维度 ×1.3。
// 两种模式都是 0 分的：ai.never（g_beyond、g_sota）、自动完成的节点、路线节点——主干的路线节点永远不选；
// 公司史实路线节点只在 historic 模式、离史实日 60 天以内才选。
export function scoreNode(s, node, mode = 'adaptive') {
  if (!node?.id || !s?.strategy?.tree) return 0;
  const ai = node.ai || {};
  if (ai.never || node.auto) return 0;
  const hd = histDay(node);
  const dist = hd ? daysBetween(s.day, hd) : null;
  const near = dist !== null && Math.abs(dist) <= 60;
  if (node.stance && (CORE_NODE_IDS.has(node.id) || mode !== 'historic' || !near)) return 0;
  if (mode === 'historic' && node.fiction) return 0;
  let v = ai.base ?? 0;
  for (const f of ai.factors || []) if (cond(s, f.if)) v *= f.mult;
  if (mode === 'historic') {
    if (near) v += ai.historic ?? 0;
    else if (dist !== null && dist > 180) v *= 0.1;
  } else {
    const goals = goalTypes(s);
    if ((BRANCH_FOR[node.branch] || []).some(t => goals.has(t))) v *= 1.5;
    const strong = s.company?.strengths || [];
    if (strong.length && [...nodeDims(s, node)].some(k => strong.includes(k))) v *= 1.3;
  }
  return v;
}
// 挑下一项（现在能开始的节点里分最高的；同分按 id 排序）→ 节点 id | null。0 分的不选。
export function pickStrategy(s, mode = 'adaptive') {
  const t = s?.strategy?.tree ? resolvedTree(s) : null;
  if (!t) return null;
  let best = null, bv = 0;
  for (const n of t.nodes) {
    const v = scoreNode(s, n, mode);
    if (v <= 0 || v < bv || (v === bv && best !== null && n.id > best) || !canStart(s, n)) continue;
    best = n.id;
    bv = v;
  }
  return best;
}
// 顾问推荐的那一项 → { id, historic }：historic 模式里有日期吻合（离史实日 60 天以内）的节点就推荐它，否则按 adaptive。
export function adviseStrategy(s) {
  const h = pickStrategy(s, 'historic');
  const hn = h ? resolvedTree(s).byId.get(h) : null;
  const hd = histDay(hn);
  if (hd && Math.abs(daysBetween(s.day, hd)) <= 60) return { id: h, historic: true };
  const a = pickStrategy(s, 'adaptive');
  return a ? { id: a, historic: false } : null;
}

// ---------- 蒸馏 ----------
// 上一次买别家蒸馏数据的日子：在途的蒸馏单按下单日（单号 ref@日期），到货的按老师快照的日子；都没有为 null。
export function lastDistillDay(s) {
  let last = null;
  for (const o of s.orders || []) if (o?.kind === 'distill') { const d = String(o.id || '').split('@')[1] || s.day; if (!last || d > last) last = d; }
  for (const t of Object.values(s.data?.teachers || {})) if (t?.day && (!last || t.day > last)) last = t.day;
  return last;
}
// 该蒸馏哪位老师（机器人和顾问共用，A10）→ 订数据面板里那一项（distillOptions 的元素）| null。以下全部成立才有：
//   前沿档的公司不蒸馏（P4.2，G2 后决定 4：前沿实验室不靠蒸馏开源模型追赶；蒸了就被污染，这一代再也拿不到标签）；
//   炼出过 SOTA 的公司永远不蒸馏；在练模型落后当前最强至少 BOT.DISTILL_GAP（没有可见对手时不蒸馏）；
//   有对玩家可见、非自家、许可宽松（LP）的开源老师，至少比在练模型强 BOT.TEACHER_MIN，现在就能下单（现金够：现金是负数时连不花钱的开源蒸馏也下不了单）；离上次买蒸馏数据满 BOT.DISTILL_EVERY 天。
//   只用开源权重，不调闭源 API，也不用受限许可（LR、LN）。fam 给出时只看这一家（里程碑弹窗里“下载权重做蒸馏”的那一家）。
export function distillTeacher(s, fam = null) {
  if (s?.mod !== 'llm' || s.company?.tier === 'frontier' || sotaMade(s)) return null;
  const w = workingModel(s);
  if (!w || w.stage === 'pretrain') return null;
  const ws = worldSota(s);
  if (!ws) return null;
  const q = qOf(s.mod, w.dims);
  if (q > ws.q - BOT.DISTILL_GAP) return null;
  const last = lastDistillDay(s);
  if (last && daysBetween(last, s.day) < BOT.DISTILL_EVERY) return null;
  let best = null;
  for (const o of distillOptions(s)) {
    if (!o.open || o.mode === 'api' || o.license !== 'LP' || !o.ok || o.cost > s.cash || (fam && o.teacher !== fam) || !(o.teacherQ >= q + BOT.TEACHER_MIN)) continue;
    if (!best || o.teacherQ > best.teacherQ || (o.teacherQ === best.teacherQ && o.id < best.id)) best = o;
  }
  return best;
}
export function wantsDistill(s, fam = null) { return !!distillTeacher(s, fam); }

// ---------- 授名时机（P3.D2，规 A10） ----------
// 授名检查的 ctx：这款模型默认的发布角色（releaseLine，不勾“顶替”）和路线默认的开闭。
// 和 releaseNamePlan 自动选授名时同一个口径，机器人和顾问看到的就是发布面板会用的那一条。
const grantCtx = (s, m) => {
  const line = releaseLine(s, m);
  return { role: line === 'main' ? 'flagship' : 'small', open: releaseOpen(s, line).open };
};
const grantRole = m => (m?.role === 'small' ? 'small' : 'flagship');
const rightUntil = (s, id) => s?.strategy?.rights?.[id]?.until ?? null;

// 手里还有效的授权里，条件现在全部成立的第一条（按名表顺序）→ { id, name, lines, until } | null。
// “有效”由 grantsFor 判：没用掉、没作废、没过期；条件用 nameGrantCheck，ctx 见上面。
export function grantWindow(s, m) {
  if (!s || !m) return null;
  const c = grantCtx(s, m);
  for (const hn of grantsFor(s, grantRole(m))) {
    const chk = nameGrantCheck(s, m, hn.id, c);
    if (!chk.ok) continue;
    return { id: hn.id, name: hn.name, lines: chk.lines, until: rightUntil(s, hn.id) };
  }
  return null;
}

// 手里有效的授权里，只差单科分（model.dims）、其余条件都成立的那一条；差得最少的优先。
// → { id, dims: { 维度: 差多少 } } | null。差结构（arch、参数、techs 等）或差世界条件的返回 null（那要走立项 / 等世界变化）。
export function grantGap(s, m) {
  if (!s || !m) return null;
  const c = grantCtx(s, m);
  let best = null, bestSum = Infinity;
  for (const hn of grantsFor(s, grantRole(m))) {
    const need = hn.model?.dims;
    if (!need || typeof need !== 'object' || Array.isArray(need)) continue;
    const dims = {};
    let sum = 0;
    for (const [k, v] of Object.entries(need)) {
      const d = Number(v) - Number(m.dims?.[k] ?? 0);
      if (d > 0) { dims[k] = d; sum += d; }
    }
    if (!Object.keys(dims).length) continue;
    // 先把 dims 以外的模型条件、世界条件、干净训练和角色都验一遍；只剩 dims 一条不过才算“差单科”。
    const rest = { ...hn.model };
    delete rest.dims;
    if (!cond(s, { model: rest }, { ...c, model: m, preview: true })) continue;
    if (!cond(s, hn.world, {})) continue;
    const bad = nameGrantCheck(s, m, hn.id, c).lines.filter(l => !l.ok);
    if (bad.length !== 1) continue;
    if (sum < bestSum) { bestSum = sum; best = { id: hn.id, dims }; }
  }
  return best;
}

// ---------- 发布时机 ----------
// 发布时要不要再练一阵（顾问和机器人共用，A10）。以下全部成立才为真：
//   expectPreview 的期待档是冠军、预告结果是“不及”或“略低”（P3.E 合入前 expectPreview 是存根，返回 null，就一律为假）；
//   在练模型近 30 天还涨了至少 0.3；45 天内没有董事会检查；这一轮（这一版）已经推迟的天数还没满 BOT.HOLD_MAX_DAYS。
// opts.preview：测试用，传一个函数 (s, m) → 预告，或者直接传预告对象，代替 expectPreview。
const HOLD_RESULTS = ['under', 'under_half'];
function boardSoon(s, days) {
  return (s.goals || []).some(g => g.status === 'pending' && typeof g.date === 'string' && /^\d{4}-\d{2}$/.test(g.date) && daysBetween(s.day, `${g.date}-01`) <= days);
}
// 在练模型近 30 天涨了多少：每 7 天记一个点（holdTick），和最早那个点比；没有记录时为 0。
export function recentGain(s, w = workingModel(s)) {
  const t = s.strategy?.trail;
  if (!w || !t || t.id !== w.id || !t.pts?.length) return 0;
  return qOf(s.mod, w.dims) - t.pts[0][1];
}
const roundKey = w => `${w.id}#${w.releases || 0}`;  // 在练模型发布一次，releases 加一（P2.1 删了 m.minor）
function holdConds(s, w, p) {
  return !!p && p.tier === 'champion' && HOLD_RESULTS.includes(p.result) && recentGain(s, w) >= 0.3 && !boardSoon(s, BOT.HOLD_MAX_DAYS);
}
// These necessary conditions are pure and much cheaper than badge/market
// preview. A false result cannot be made true by any preview outcome.
const holdWindowOpen = (s, w) => recentGain(s, w) >= 0.3 && !boardSoon(s, BOT.HOLD_MAX_DAYS);
export function shouldHold(s, opts = {}) {
  const w = workingModel(s);
  if (!w || w.stage !== 'post') return false;
  if (!('preview' in opts)) {
    ensureExpect(s); // Preserve malformed-ledger rejection even on the fast path.
    if (!holdWindowOpen(s, w)) return false;
  }
  const p = 'preview' in opts ? (typeof opts.preview === 'function' ? opts.preview(s, w) : opts.preview) : expectPreview(s, w);
  if (!holdConds(s, w, p)) return false;
  const h = s.strategy?.hold;
  const held = h && h.key === roundKey(w) ? daysBetween(h.since, s.day) : 0;
  return held < BOT.HOLD_MAX_DAYS;
}
// 每天（strategyTick 末尾）：记在练模型的涨幅点（每 7 天一个，最早那个点在 27–33 天前）；这一版开始“该再练一阵”的那天记进 hold，
// 条件不再成立（发布了、预告变好了……）就清掉。
const TRAIL_EVERY = 7, TRAIL_KEEP = 33;
export function holdTick(s) {
  const S = s.strategy;
  const w = workingModel(s);
  if (!S || !w || w.stage !== 'post') { if (S?.trail) delete S.trail; if (S?.hold) delete S.hold; return; }
  if (S.trail?.id !== w.id) S.trail = { id: w.id, pts: [] };
  const pts = S.trail.pts;
  if (!pts.length || daysBetween(pts.at(-1)[0], s.day) >= TRAIL_EVERY) pts.push([s.day, Math.round(qOf(s.mod, w.dims) * 100) / 100]);
  while (pts.length > 1 && daysBetween(pts[0][0], s.day) > TRAIL_KEEP) pts.shift();
  ensureExpect(s);
  if (holdWindowOpen(s, w) && holdConds(s, w, expectPreview(s, w))) {
    if (S.hold?.key !== roundKey(w)) {
      // 不可送评时还谈不上推迟本轮发布；已开始的同轮计时仍守原45日历天上限。
      if (!submitBlock(s, w, 'main')) S.hold = { key: roundKey(w), since: s.day };
      else if (S.hold) delete S.hold;
    }
  } else if (S.hold) delete S.hold;
}
