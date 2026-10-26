// 市场期待（规格 D11）：发布那一刻判一次，结果分冠军 / 挑战者 / 小团队三档，五种结果。
// 只读状态：sota.js（标签、世界最强、发布角色）、model.js（综合分、量级、蒸馏基线）、data/expect.js（奖惩表）。
// 奖惩全部走 applyEffects（ctx.source = 'release'），不新开通道。签名以 D11.10 为准。
import { EXPECT, kcapOffset } from '../data/balance.js';
import { EXPECT_FX } from '../data/expect.js';
import { applyEffects } from './effects.js';
import { addDays, daysBetween } from './clock.js';
import { clamp } from './util.js';
import { qOf, worldSota, relRole, visible, relDims, sotaWouldTake, orgOf } from './sota.js';
import { isTainted, clsOf, distillBaseline, licenseOf, knowledgeCap } from './model.js';
import { releaseLine } from './release.js';
import { releaseOpen } from './route.js';
import { P } from './provider.js';
import { RELEASES } from '../data/rivals.js';

const ORDER = { under: 0, under_half: 1, flat: 2, meet: 3, over: 4 };
const RESULT_ORDER = r => ORDER[r] ?? -1;

// 期待状态的默认形状（D11.10）。ask 是 D11.6 的“集团预支的超出预期”。
export function initExpect() {
  return { lastJudged: { flagship: null, small: null }, cool: {}, hot: null, worksDay: null, pending: null, ask: null, log: [] };
}
// 只校验当前期待账本；缺项不能通过每日计算被静默补成新存档。
export function ensureExpect(s) {
  const e = s.expect;
  if (!isObj(e) || !isObj(e.lastJudged) || !Object.hasOwn(e.lastJudged, 'flagship') || !Object.hasOwn(e.lastJudged, 'small') || !isObj(e.cool) || !Array.isArray(e.log)
    || ['hot', 'worksDay', 'pending', 'ask'].some(k => !Object.hasOwn(e, k))) throw Error('不支持缺少市场期待字段的旧存档，请新开一局');
  return e;
}

// ---------- 小工具 ----------
const modOf = (s, m) => m?.mod ?? s.mod;
const qOfModel = (s, m) => qOf(modOf(s, m), m?.dims || {});
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const r2 = v => Math.round(v * 100) / 100;
const released = (s, mod) => (s?.models || []).filter(m => m.stage === 'released' && (m.mod ?? s.mod) === mod);
const relDayOf = m => m?.releasedDay ?? null;
const isOpenSnap = m => !!m?.open && ['permissive', 'restrictive', 'LP', 'LR'].includes(m.license);
const isOpenRival = r => !!r?.open && (licenseOf(r) === 'LP' || licenseOf(r) === 'LR');
// 量级口径（D1.1）：frontier 并入 large。
const wc = c => (c === 'frontier' ? 'large' : c);
const sameClass = (a, b) => !!a && !!b && wc(a) === wc(b);
const resultLabel = { over: '超出', meet: '符合', flat: '平淡', under_half: '略低', under: '不及' };

// D11.1：冠军（炼出过 SOTA，永不过期）→ 小团队（small，或 specialist 且没炼出过）→ 挑战者。
// excludeId：这一款自己刚拿到的标签是“发布后”的事实，不能让它把这一次的期待档抬成冠军。
function tierFor(s, excludeId = null) {
  const made = !!s?.sota?.before || (s?.sota?.made || []).some(x => x.modelId !== excludeId);
  if (made) return 'champion';
  const t = P().tierOf(s);
  return t === 'small' || t === 'specialist' ? 'small' : 'challenger';
}

// 发布前在线旗舰（含已经排进灰度、全量后会顶替它的那几款）的 q；没有在线旗舰时为 −∞（首发）。
// 和 release.js 的 releaseLine 用同一个“要比的旗舰”口径。
function prevFlagshipQ(s) {
  let best = null;
  const consider = m => { if (m && (!best || qOfModel(s, m) > qOfModel(s, best))) best = m; };
  consider((s.models || []).find(m => m.id === s.live) || null);
  for (const d of s.deploy || []) {
    if (d.role === 'small') continue;
    consider((s.models || []).find(m => m.id === d.id) || null);
  }
  return best ? qOfModel(s, best) : -Infinity;
}
// 发布前自家持标快照的 q（不持标时为 −∞）。
function ownHolderQ(s) {
  const h = s.sota?.holder;
  return h && h.by === 'me' ? h.q : -Infinity;
}
function fieldReady(s) {
  const f = s.sota?.field;
  if (!Array.isArray(f)) return true;
  // 这一版发布后场地才算数：玩家自己的 org 可能还不在 field 里。
  return new Set([...f, orgOf(s)]).size >= 2;
}
// 新鲜度（D11.5）：按同一条线两次发布之间的天数折算，三个月以上算一次完整发布。
// 用独立的 flags 键，避免和 release.js 的发布品牌读同一个键、谁先谁后的问题。
const freshOf = (s, small) => {
  const last = s.flags?.[small ? 'expectSmallRelDay' : 'expectRelDay'];
  return last ? clamp(daysBetween(last, s.day) / 90, 0.25, 1) : 1;
};
const bumpFresh = (s, small) => { (s.flags ??= {})[small ? 'expectSmallRelDay' : 'expectRelDay'] = s.day; };

// ---------- D11.2 徽章 ----------
// 被污染的模型（蒸馏过别家的、在开源权重上续训的、从被污染的自家模型自蒸馏的）拿不到任何徽章。
export function badgesFor(s, snap) {
  if (!snap || isTainted(snap)) return [];
  const out = [];
  const mod = modOf(s, snap);
  const q = qOfModel(s, snap);
  const cls = wc(clsOf(snap) ?? snap.cls ?? null);

  // 开源最强：开放权重、不是续训来的，q 高出可见开源发布的最高 q。
  if (isOpenSnap(snap) && snap.lineage?.kind !== 'finetune') {
    let best = -Infinity;
    for (const r of RELEASES) {
      if (r.mod !== mod || !r.open || !isOpenRival(r) || !visible(s, r) || r.id === snap.id) continue;
      best = Math.max(best, qOf(mod, relDims(s, r)));
    }
    for (const m of released(s, mod)) {
      const d = relDayOf(m);
      if (m.id === snap.id || !m.open || !d || d > s.day) continue;
      best = Math.max(best, qOfModel(s, m));
    }
    if (q > best + EXPECT.OPEN_MARGIN) out.push('open_top');
  }

  // 社区之选：开放权重、小尺寸；同量级至少 COMM_FIELD 款对手开源发布，q 高出同量级最强和蒸馏基线。
  if (isOpenSnap(snap)) {
    const sizeOk = mod === 'llm' ? Number.isFinite(snap.total) && snap.total <= EXPECT.COMM_MAX_TOTAL : cls !== 'large';
    if (sizeOk) {
      const base = distillBaseline(s, snap);
      const baseOk = base === null || q >= base + EXPECT.BASE_MARGIN;
      let count = 0, best = -Infinity;
      for (const r of RELEASES) {
        if (r.mod !== mod || !r.open || !isOpenRival(r) || !visible(s, r) || !sameClass(cls, r.cls)) continue;
        count += 1;
        best = Math.max(best, qOf(mod, relDims(s, r)));
      }
      for (const m of released(s, mod)) {
        const d = relDayOf(m);
        if (m.id === snap.id || !m.open || !d || d > s.day || !sameClass(cls, clsOf(m))) continue;
        best = Math.max(best, qOfModel(s, m));
      }
      if (count >= EXPECT.COMM_FIELD && baseOk && q >= best + EXPECT.COMM_MARGIN) out.push('community');
    }
  }

  // 能干活：LLM 会函数调用；主业两维都过一年前同量级的门槛；至少开着一个 API / 对话 / 订阅产品。
  const products = s.products || {};
  const selling = ['api', 'chat', 'subscription'].some(id => !!products[id]?.on);
  if (selling) {
    const techs = snap.techs || s.techs || [];
    const llmOk = mod !== 'llm' || techs.includes('func_call');
    if (llmOk) {
      const ks = (s.company?.strengths || []).filter(k => k !== 'safety').slice(0, 2);
      if (mod === 'llm') for (const k of ['code', 'agent']) {
        if (ks.length >= 2) break;
        if (!ks.includes(k)) ks.push(k);
      }
      if (ks.length) {
        const day = addDays(s.day, -EXPECT.WORKS_LAG);
        let env = null, seen = 0;
        for (const r of RELEASES) {
          if (r.mod !== mod || !visible(s, r) || r.day > day || !sameClass(cls, r.cls)) continue;
          seen += 1;
          env ??= {};
          for (const [k, v] of Object.entries(r.dims || {})) env[k] = Math.max(env[k] ?? -Infinity, v ?? 0);
        }
        if (seen) {
          const ok = ks.every(k => {
            let bar = env[k] ?? -Infinity;
            if (mod === 'llm') bar = Math.min(bar, knowledgeCap(snap.total, EXPECT.WORKS_QUALITY) + kcapOffset(k));
            return (snap.dims?.[k] ?? 0) >= bar - EXPECT.WORKS_SLACK;
          });
          if (ok) out.push('works');
        }
      }
    }
  }
  return out;
}

// ---------- D11.4 判定 ----------
const regressed = (q, prev) => q < prev - EXPECT.REGRESS;
const worksReady = (s, badges) => badges.includes('works') && (!s.expect.worksDay || daysBetween(s.expect.worksDay, s.day) >= EXPECT.WORKS_COOL);

// 按档位算一次结果。lab 由 labelOnRelease 给出（预告时用 sotaWouldTake 模拟）。
function resultFor(s, { tier, q, x, badges, label, ownQ, prev, last, first }) {
  if (tier === 'champion') {
    // 预告时标签还没接过来，holdingAfter 要把“这一版会拿标”算进去。
    const holdingAfter = !!label || (!!s.sota?.holder && s.sota.holder.by === 'me');
    if (holdingAfter && (label || q >= ownQ - EXPECT.REGRESS)) {
      const lead = q - Math.max(worldSota(s)?.q ?? -Infinity, ownQ);
      return label && lead >= EXPECT.CHAMP_LEAD ? 'over' : 'meet';
    }
    return regressed(q, prev) ? 'under' : x >= -EXPECT.NEAR_MISS ? 'under_half' : 'under';
  }
  if (tier === 'challenger') {
    const ot = badges.includes('open_top');
    let res;
    if (label || (ot && x >= -EXPECT.OPEN_NEAR) || x >= -EXPECT.CHAL_NEAR) res = 'over';
    else if (x >= -(EXPECT.BAND[P().tierOf(s)] ?? 5) || ot || (last && x - last.x >= EXPECT.CLOSE_BY)) res = 'meet';
    else res = first ? 'flat' : 'under';
    return regressed(q, prev) ? 'under' : res;
  }
  const works = worksReady(s, badges);
  let res;
  if (label || badges.includes('open_top') || badges.includes('community') || works) res = 'over';
  else if (first || q >= prev + EXPECT.SMALL_UP) res = 'meet';
  else res = 'flat';
  return regressed(q, prev) ? 'under' : res;
}

// D11.6 的追加预算：结果降一档，降到不及时按全额罚（略低也变成不及）。
function downgrade(res) {
  return res === 'over' ? 'meet' : res === 'meet' ? 'flat' : 'under';
}

// D11.5 的折算：正面效果按新鲜度打折；略低的惩罚减半；负面效果不打折。
const MULT_KEYS = new Set(['brand', 'valuation', 'team']);
function scaleFx(fx, { fresh = 1, half = false } = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fx || {})) {
    if (k === 'stockShock' && isObj(v)) {
      out[k] = Object.fromEntries(Object.entries(v).map(([t, x]) => {
        const n = half ? x / 2 : x;
        return [t, x > 0 ? n * fresh : n];
      }));
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      if (MULT_KEYS.has(k)) out[k] = v < 1 ? (half ? 1 + (v - 1) / 2 : v) : (half ? 1 + (v - 1) / 2 : 1 + (v - 1) * fresh);
      else out[k] = half ? v / 2 : v > 0 ? v * fresh : v;
    } else out[k] = v;
  }
  return out;
}

// 冷却：同一档的“超出”数值奖励、以及“不及”的数值惩罚，COOL 天内只给一次。
function cooled(s, tier, result) {
  const key = result === 'over' ? `${tier}:over` : result === 'under' || result === 'under_half' ? `${tier}:under` : null;
  if (!key) return null;
  const last = s.expect.cool[key];
  return last && daysBetween(last, s.day) < EXPECT.COOL ? key : null;
}
function markCool(s, tier, result) {
  const key = result === 'over' ? `${tier}:over` : result === 'under' || result === 'under_half' ? `${tier}:under` : null;
  if (key) s.expect.cool[key] = s.day;
}

function pushLog(s, row) {
  s.expect.log.push(row);
  if (s.expect.log.length > EXPECT.LOG_MAX) s.expect.log.splice(0, s.expect.log.length - EXPECT.LOG_MAX);
}

// 结算一次结果：写 lastJudged、冷却、奖惩和日志。snap 为 null 时（推迟记录丢失）只清 pending。
function settle(s, { snap, tier, result, x, why, rejudge = false, deferred = false, flagship = true, fresh = 1, worksOver = false }) {
  const q = snap ? qOfModel(s, snap) : null;
  const rec = { modelId: snap?.id ?? null, day: s.day, q: q === null ? null : r2(q), x: r2(x ?? 0), gen: snap?.gen ?? null, result };
  if (snap) {
    if (flagship) s.expect.lastJudged.flagship = rec;
    else s.expect.lastJudged.small = rec;
  }
  let cooledOut = false;
  if (result && result !== 'flat') {
    const key = cooled(s, tier, result);
    if (key) cooledOut = true;
    else {
      const half = result === 'under_half';
      const fx = scaleFx(EXPECT_FX[tier]?.[half ? 'under' : result], { fresh, half });
      applyEffects(s, fx, { source: 'release', id: snap?.id ?? null, model: snap ?? null });
      markCool(s, tier, result);
      if (result === 'over') s.expect.hot = s.day;
    }
  }
  if (worksOver && snap) s.expect.worksDay = s.day;
  if (snap) snap.expect = { tier, result, why, rejudge: !!rejudge };
  pushLog(s, { modelId: snap?.id ?? null, day: s.day, tier, result, x: r2(x ?? 0), q: q === null ? null : r2(q), rejudge: !!rejudge, deferred: !!deferred, cooled: cooledOut });
  return snap?.expect ?? null;
}

// 发布时判定（doRelease 在 labelOnRelease 之后调用；lab 是 labelOnRelease 的返回值）→ 写 snap.expect 并返回它。
export function judgeRelease(s, snap, lab) {
  ensureExpect(s);
  if (!snap || snap.hist) return null;
  if (snap.expect) return snap.expect;
  snap.badges = badgesFor(s, snap);
  const tier = tierFor(s, snap.id);
  const flagship = relRole(snap) === 'flagship';
  const q = qOfModel(s, snap);
  const prev = prevFlagshipQ(s);
  // 自家持标是发布前的事实；labelOnRelease 已经接过标签，所以从 lab.prev 取，不能读现在的 holder。
  const ownQ = lab ? (lab.prev?.by === 'me' ? lab.prev.q : -Infinity) : ownHolderQ(s);
  const small = snap.role === 'small';

  // 小模型和副线：只对小团队档评，而且只评超出。
  if (!flagship && tier !== 'small') {
    bumpFresh(s, small);
    snap.expect = { tier, result: null, why: '副线发布，不按旗舰评期待', rejudge: false };
    return snap.expect;
  }

  // D11.3 推迟：没有可见对手，或发布后场地仍不足 2 家，先记 pending。
  const world = worldSota(s);
  if (!world || !fieldReady(s)) {
    // 没有可比的（-Infinity）存成 null：存档是 JSON，-Infinity 会变成 null 却读不回原值；判定时按 ?? -Infinity 读回来。
    const fin = v => (Number.isFinite(v) ? v : null);
    s.expect.pending = { modelId: snap.id, day: s.day, tier, q, x: null, prev: fin(prev), ownQ: fin(ownQ), gen: snap.gen ?? null, flagship, fresh: freshOf(s, small) };
    bumpFresh(s, small);
    snap.expect = { tier, result: null, why: '这个领域还没有对手，等场地凑满再评', rejudge: false };
    return snap.expect;
  }

  const x = q - world.q;
  const fresh = freshOf(s, small);
  bumpFresh(s, small);
  const last = s.expect.lastJudged.flagship;
  const first = !last;
  const due = !last || (snap.gen ?? null) !== (last.gen ?? null) || daysBetween(last.day, s.day) >= EXPECT.JUDGE_GAP;
  let result = resultFor(s, { tier, q, x, badges: snap.badges, label: !!lab?.got, ownQ, prev, last, first });
  // 加评：60 天内、同一底座，只有试算结果比上次好才评。
  if (!due && RESULT_ORDER(result) <= RESULT_ORDER(last.result)) {
    snap.expect = { tier, result: null, why: `距离上次被评不到 ${EXPECT.JUDGE_GAP} 天，这一版只发新闻`, rejudge: false };
    return snap.expect;
  }
  let why = '';
  if (!flagship) { if (result !== 'over') { snap.expect = { tier, result: null, why: '副线发布，只评超出预期', rejudge: false }; return snap.expect; } why = '副线发布，小团队档超出预期'; }
  // D11.6 追加预算：下一次被评的旗舰降一档，判完清掉；推迟判定不消耗。
  if (flagship && s.expect.ask) {
    const before = result;
    result = downgrade(result);
    s.expect.ask = null;
    why = `集团预支了超出预期，评价从「${resultLabel[before]}」降到「${resultLabel[result]}」`;
  }
  const worksOver = tier === 'small' && result === 'over' && !lab?.got && !snap.badges.includes('open_top') && !snap.badges.includes('community') && worksReady(s, snap.badges);
  return settle(s, { snap, tier, result, x, why: why || `离最强 ${Math.abs(x).toFixed(1)} 分`, rejudge: !due, flagship, fresh, worksOver });
}

// 场地第一次凑满时补评（loop.js 在 labelOnRival 返回 filled 时调用）。评最新的那一款，x 和标签按这一刻算。
export function judgeDeferred(s) {
  ensureExpect(s);
  const p = s.expect.pending;
  if (!p) return null;
  const world = worldSota(s);
  if (!world || !fieldReady(s)) return null;
  const snap = (s.models || []).find(m => m.id === p.modelId) || null;
  if (!snap) { s.expect.pending = null; return null; }
  const q = qOfModel(s, snap);
  const x = q - world.q;
  const h = s.sota?.holder;
  const label = !!h && h.by === 'me' && h.id === snap.id;
  const badges = snap.badges || badgesFor(s, snap);
  const last = s.expect.lastJudged.flagship;
  let result = resultFor(s, { tier: p.tier, q, x, badges, label, ownQ: p.ownQ ?? -Infinity, prev: p.prev ?? -Infinity, last, first: !last });
  // 推迟的判定不罚：算出“不及”或“略低”的，一律记为平淡。
  if (result === 'under' || result === 'under_half') result = 'flat';
  const flagship = p.flagship !== false;
  if (!flagship && result !== 'over') {
    snap.expect = { tier: p.tier, result: null, why: '副线发布，只评超出预期', rejudge: false };
    s.expect.pending = null;
    return snap.expect;
  }
  const worksOver = p.tier === 'small' && result === 'over' && !label && !badges.includes('open_top') && !badges.includes('community') && worksReady(s, badges);
  s.expect.pending = null;
  return settle(s, { snap, tier: p.tier, result, x, why: '场地凑满，补评', rejudge: false, deferred: true, flagship, fresh: p.fresh ?? 1, worksOver });
}

// 发布面板的预告：按 m 现在的分数假设立即发布 → { tier, result, x, need, badges, text } | null。
// 预览不写状态、不消耗 ask、不动冷却；结果口径和 judgeRelease 完全一致。
// opts 是送评面板上的勾选（P3.U2）：replace 勾了“顶替在线旗舰”就按顶替后的角色预告；open 是面板上开源勾选的当前值
// （只在路线让自己选时才有）。不传时按默认角色和路线默认的开闭，顾问和机器人都不传。
export function expectPreview(s, m, opts = {}) {
  ensureExpect(s);
  if (!m) return null;
  const tier = tierFor(s);
  const q = qOfModel(s, m);
  // 预告看的开闭按当前路线的默认值；已经定好开闭的快照直接用自己的。
  const line = releaseLine(s, m, { replace: !!opts.replace });
  let view = m;
  if (typeof m.open !== 'boolean') {
    const o = releaseOpen(s, line);
    view = { ...m, open: typeof opts.open === 'boolean' ? opts.open : o.open, license: o.license };
  }
  const badges = badgesFor(s, view);
  const world = worldSota(s);
  const flagship = line === 'main';
  const last = s.expect.lastJudged.flagship;
  const prev = prevFlagshipQ(s);
  const ownQ = ownHolderQ(s);

  if (!world || !fieldReady(s)) return { tier, result: null, x: null, need: null, badges, text: '这个领域还没有对手，等第一家对手出现时再评。' };
  const x = q - world.q;
  const first = !last;
  const label = sotaWouldTake(s, q) === true;
  let result = resultFor(s, { tier, q, x, badges, label, ownQ, prev, last, first });
  const due = !last || (m.gen ?? null) !== (last.gen ?? null) || daysBetween(last.day, s.day) >= EXPECT.JUDGE_GAP;
  let blocked = '';
  if (!flagship && tier !== 'small') return { tier, result: null, x: r2(x), need: Math.max(0, -x), badges, text: '作为副线发布，不按旗舰评期待。' };
  if (!due && RESULT_ORDER(result) <= RESULT_ORDER(last.result)) {
    blocked = `距离上次被评不到 ${EXPECT.JUDGE_GAP} 天，这一版只发新闻。`;
    result = null;
  }
  if (!flagship && tier === 'small' && result !== 'over') {
    blocked = '作为副线发布，只评超出预期。';
    result = null;
  }
  if (flagship && s.expect.ask && result) result = downgrade(result);

  // need：冠军档算到“领先 CHAMP_LEAD”还差多少；其余算到世界最强还差多少。
  const need = tier === 'champion'
    ? Math.max(0, Math.max(world.q, ownQ) + EXPECT.CHAMP_LEAD - q)
    : Math.max(0, -x);
  return { tier, result, x: r2(x), need: r2(need), badges, text: previewText(s, { tier, result, x, need, badges, line, blocked }) };
}

function previewText(s, { tier, result, x, need, badges, line, blocked }) {
  const gap = Math.abs(x).toFixed(1);
  let text;
  if (tier === 'champion') {
    text = `市场期待：新的世界第一。按现在的水平${result === 'over' || result === 'meet' ? '够得上' : `拿不到（差 ${need.toFixed(1)}）`}，会${result ? resultLabel[result] + '预期' : '先不评'}。`;
  } else if (tier === 'challenger') {
    const band = EXPECT.BAND[P().tierOf(s)] ?? 5;
    text = `市场期待：离最强 ${band} 分以内。按现在差 ${gap}，${result ? resultLabel[result] + '预期' : '还不够'}` +
      `${badges.includes('open_top') ? '；开源，而且能拿「开源最强」' : ''}。`;
  } else {
    const parts = [];
    parts.push(badges.includes('community') ? '社区之选：已达标' : `社区之选：还差 ${need.toFixed(1)} 分`);
    parts.push(badges.includes('works') ? '能干活：已达标' : `能干活：还差 ${Math.max(0, need).toFixed(1)} 分`);
    if (badges.includes('open_top')) parts.push('开源最强：已达标');
    text = parts.join('｜') + '。';
  }
  if (!flagshipLine(line)) text = `作为副线发布，不按旗舰评期待。${text}`;
  if (blocked) text += blocked;
  return text;
}
const flagshipLine = line => line === 'main';
