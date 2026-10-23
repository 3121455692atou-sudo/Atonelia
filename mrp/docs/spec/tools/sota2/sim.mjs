// 单条旗舰线的逐日模拟。涨分速度沿用 curve 方案按真实引擎校准过的口径（每天缩 cap 差距约 0.6–0.9%）。
import { DIRECTIONS } from '/Users/mac/model-raising-plan/src/career/data/core.js';
import { Q_W, APPROACH, SOTA, CURVE, EASE, rhoOf, effort, hardness, H, anchorOf, distFade, levelMult, clamp } from './curve.mjs';
const QW = Q_W.llm, KEYS = Object.keys(QW);
export const qOf = d => KEYS.reduce((a, k) => a + QW[k] * d[k], 0);
const DIRS = DIRECTIONS.llm.filter(d => !d.special && d.key !== 'safety');
const PACE = 1.6, ENV_OFF = 1.5, RATE_SCALE = 0.8 / 30, BOT_HOLD = 45;
export function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const val = (x, y) => (typeof x === 'function' ? x(y) : x);

// c：公司配置；opt.R(t) 对手最强（worldSota，0 = 没有可见对手）；opt.histOther(t) 别家真实主线最强（缺省 = R）；
// opt.own(t) 本公司真实主线（已含前瞻；只有“炼出过”才计入，见 anchorOf）；opt.temp(t) 临时锚；opt.open(t) 开源最强
export function run(c, opt = {}) {
  const days = opt.days ?? 1000, R = opt.R ?? (() => 80), histOther = opt.histOther ?? R, own = opt.own ?? null, temp = opt.temp ?? null, openLine = opt.open ?? (t => R(t) - 3);
  const rng = mulberry(opt.seed ?? 1), year0 = opt.year0 ?? 2025.5, anchorMode = opt.anchorMode ?? 'final';
  let reserve = c.reserve, holding = false;
  let released = c.releasedQ ?? null;
  const anchorAt = t => anchorMode === 'rivalOnly' ? (R(t) > 0 ? R(t) : (released ?? 0))          // curve 原稿：只看对手，没对手时退回自家已发布最强
    : anchorMode === 'withMe' ? Math.max(R(t), released ?? 0)                                         // 反例：锚点含玩家快照（棘轮）
    : anchorOf({ W: R(t) > 0 ? R(t) : null, HO: histOther(t) > 0 ? histOther(t) : null, OG: own && own(t) > 0 ? own(t) : null,
                 made: reserve === 'maker', lead: holding || !(R(t) > 0) || (dims !== undefined && qOf(dims) > R(t) + SOTA.EPS), temp: temp ? temp(t) : null });
  const mk = (q, capQ) => { const d = {}, cp = {}; for (const k of KEYS) { d[k] = q + (c.dimOff?.[k] ?? 0); cp[k] = capQ + (c.capShape?.[k] ?? 0); } return { d, cp }; };
  let dims, caps; ({ d: dims, cp: caps } = mk(c.startVsR !== undefined ? R(0) + c.startVsR : anchorAt(0) + c.start, R(0) + c.capOff));
  if (c.startQ !== undefined) ({ d: dims } = mk(c.startQ, 0));
  released = released ?? qOf(dims); let lastRel = -999, health = 85, maint = false, dir = null;
  let teacherQ = null, lastBuy = -999, post = { own: 0, dist: 0 }, tainted = false;
  let proj = null, nextPre = c.preEvery ?? Infinity, firstLabel = null, labels = 0, labelDays = 0, makerAt = null;
  const rec = {}, marks = opt.marks ?? [-5, -3, -1, 0.1, 0.5, 1, 3], trace = [], labelTimes = [], lossTimes = [];
  let minGapDist = Infinity, maxDimLead = -Infinity, bornGap = [], maxGhost = -Infinity, prevR = R(0), qHist = [], holdSince = null;
  for (let t = 0; t < days; t++) {
    const year = opt.yearFixed ? year0 : Math.min(2026.99, year0 + t / 365), Rt = R(t), anc = anchorAt(t);
    if (!holding && !(prevR > 0) && Rt > 0 && released > Rt) holding = true;     // 场地凑满：标签挂在继承来的型号上
    prevR = Rt;
    if (holding && Rt > released + SOTA.EPS) { holding = false; lossTimes.push(t); }
    if (!holding && Rt > 0 && !(qOf(dims) > Rt + SOTA.EPS)) maxGhost = Math.max(maxGhost, anchorAt(t) - Rt);   // 不领先时：锚点 − 对手最强
    if (holding) labelDays++;
    if (makerAt !== null && t >= makerAt) reserve = 'maker';           // g_sota 由 bypass 次日完成
    if (!proj && t >= nextPre) proj = { end: t + (c.preDays ?? 150) };
    if (proj && t >= proj.end) {                                       // 新底座出生：钳到 anchor − BIRTH_GAP
      const nb = mk(Rt + c.baseOff + 2, Rt + (c.newCapRel ?? (c.baseOff + c.capOff)));
      if (qOf(nb.cp) > qOf(caps) + 1) {
        const over = qOf(nb.d) - (anc - CURVE.BIRTH_GAP); if (over > 0) for (const k of KEYS) nb.d[k] -= over;
        bornGap.push(qOf(nb.d) - anc); dims = nb.d; caps = nb.cp; tainted = false; post = { own: 0, dist: 0 };
      }
      proj = null; nextPre = t + c.preEvery;
    }
    const q = qOf(dims);
    for (const m of marks) if (rec[m] === undefined && q - Rt >= m) rec[m] = t;
    if (c.distill) minGapDist = Math.min(minGapDist, Rt - q);
    if (opt.trace && (t % (opt.traceEvery ?? 30) === 0)) trace.push({ t, R: Rt, anc, q, rel: released, hold: holding ? 1 : 0, tainted, reserve });
    // 发布
    const canLabel = q > Rt + SOTA.EPS && q > released + SOTA.EPS;
    let rel = c.bot ? ((t - lastRel >= 90 && q > released + 0.3) || (t - lastRel >= 180 && q > released))
                      : ((canLabel && t - lastRel >= (opt.minGap ?? 14)) || (q > released + 0.5 && t - lastRel >= (opt.cadence ?? c.cadence ?? 60)));
    if (rel && opt.holdUntil && released < opt.holdUntil && q < opt.holdUntil) rel = false;   // 表 7：练到门槛才第一次发布
    qHist.push(q);
    if (rel && opt.holdRule && reserve === 'maker' && !(q > Rt + SOTA.EPS) && q - (qHist[qHist.length - 31] ?? -Infinity) >= 0.3 && (holdSince ??= t) > t - BOT_HOLD) rel = false;  // A10 发布时机：冠军档预告不及、还在涨，最多推迟 45 天
    if (rel) holdSince = null;
    if (rel) {
      released = q; lastRel = t;
      if (q > Rt + SOTA.EPS) { if (!holding) { labels++; labelTimes.push(t); } holding = true;
        if (firstLabel === null) { firstLabel = t; if (reserve !== 'maker') makerAt = t + 1; } }
    }
    if (t % 30 === 29) { health = Math.min(100, health + 4); if (!opt.yearFixed && c.capDrift) for (const k of KEYS) caps[k] += c.capDrift / 12; }
    if (maint || health < 50) { maint = health < 62; health += 1.6; continue; }
    // 蒸馏老师：每 90 天按当天对手最强（'sota'）或开源最强（'open'）重买
    const wantsDistill = c.distill === true || (c.distillWhenBehind !== undefined && reserve !== 'maker' && anc - q >= c.distillWhenBehind);
    const teacherKind = c.teacher ?? 'open';
    if (wantsDistill && t - lastBuy >= 90) { teacherQ = teacherKind === 'sota' ? Rt : openLine(t); lastBuy = t; }
    const useDist = wantsDistill && teacherQ !== null && teacherQ - q > 0.5;  // 老师须明显强于自己
    const O = c.ownData, D = useDist ? (c.distLevel ?? 2.5) : 0, sigma = O + D > 0 ? D / (O + D) : 0;
    const qCapD = teacherQ !== null ? Math.min(teacherQ, Rt) - APPROACH : -Infinity;
    const e = effort({ trainH100: val(c.gpu, year), dataQ: c.dataQ ?? O, know: val(c.know, year), lead: c.lead ?? 0, year, pretraining: !!proj });
    const hp = hardness(e.A, rhoOf(EASE[reserve] + (c.easeExtra ?? 0)));
    const compMult = clamp(Math.sqrt(c.compNeed ?? 1) * (proj ? 0.5 : 1), 0.35, 1.2);
    const eff0 = compMult * 1.1 * 1.05 * PACE;                                   // (1 + 0.1σ) 移进蒸馏那一份（D7）
    const env = anc + ENV_OFF;
    const multOf = (k, qNow) => {
      const dk = Math.max(qNow - anc, CURVE.DIM_STEEP * (dims[k] - (env + CURVE.DIM_SLACK)));
      const own = (1 - sigma) * levelMult(O) * (opt.noCurve ? 1 : H(dk, hp));
      const dist = sigma * levelMult(Math.min(2.5, O + D)) * 2.5 * distFade(qNow, qCapD) * (1 + 0.1 * sigma);
      return own + dist;
    };
    const rawFor = d => {
      const rate = d.rl ? 0.17 : 0.2, gm = Math.max(0, (caps[d.main] - dims[d.main]) * rate * eff0);
      const g = { [d.main]: gm };
      for (const [k, cc] of Object.entries(d.side)) if (k in QW) g[k] = cc > 0 ? Math.min(gm * cc, Math.max(0, caps[k] - dims[k])) : gm * cc;
      return g;
    };
    const gainsFor = d => { const g = rawFor(d); for (const k of Object.keys(g)) if (g[k] > 0) g[k] *= multOf(k, q); return g; };
    if (c.focusDim) dir = DIRS.find(d => d.main === c.focusDim);
    else if (t % 7 === 0 || !dir) dir = DIRS.reduce((best, d) => { const v = Object.entries(gainsFor(d)).reduce((a, [k, x]) => a + (QW[k] || 0) * x, 0); return !best || v > best.v ? { d, v } : best; }, null).d;
    health += (dir.rl ? -15 : -11) / 30;
    const fail = clamp((50 - health) * 1.8, 0, 90);
    if (rng() * 100 < fail / 30) { dims[dir.main] -= 0.8; health -= 6; continue; }
    const g = gainsFor(dir), step = {};
    for (const [k, v] of Object.entries(g)) step[k] = v * RATE_SCALE;
    // D7 第 2 步：污染模型对 qCapD 每次只走剩余距离的一半
    let f = 1;
    if (tainted) { const q1 = qOf({ ...dims, ...Object.fromEntries(Object.entries(step).map(([k, v]) => [k, dims[k] + v])) }); if (q1 > qCapD) f = q >= qCapD ? 0 : 0.5 * (qCapD - q) / (q1 - q); }
    for (const [k, v] of Object.entries(step)) dims[k] = Math.min(99, dims[k] + (v > 0 ? v * f : v));
    const G = Math.max(0, qOf(dims) - q); post.own += G * (1 - sigma); post.dist += G * sigma;
    if (!tainted && post.dist >= 0.5 && post.dist / (post.own + post.dist) >= 0.15) tainted = true;
    for (const k of KEYS) maxDimLead = Math.max(maxDimLead, dims[k] - env);
  }
  return { rec, labelTimes, lossTimes, labels, labelDays, firstLabel, final: qOf(dims) - R(days - 1), trace, minGapDist, maxDimLead, bornGap, tainted, reserve, maxGhost };
}
