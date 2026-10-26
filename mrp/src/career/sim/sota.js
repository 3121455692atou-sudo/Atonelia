// SOTA 的唯一定义（规格 D1、D1.1、D2、D5、D6.2 的锚点、D10）。“谁最强”“截至哪天看得到”“标签在谁身上”都只在这里算。
// - 综合分 qOf：固定权重（知识、代码、数学、写作各 0.22，Agent 0.12，不计安全），没有日期参数；
// - 旗舰 = 截至某天家族（familyBest）或公司（orgBest）里 qOf 最高的一款，同分取发布日较晚的，再同分取 RAW 行序靠后的；
//   不看参数、发布先后、开闭源、价格档、S 标签；
// - 对手发布按日可见（r.day ≤ 今天），同 org 同模态的发布算自家（isMine），不出现在对手里；
// - 跟随者钳制（D5）：跟随者发布变为可见那天冻结 s.world.adj[r.id]，relDims 把它摊到 Q 计入的各维上；
// - SOTA 标签（D10）：每个模态一枚，挂在模型上；s.sota 记持有者、场地、曾为 SOTA 的记录、炼出过的快照、开局播种和局内“集团出过”。
// 标签账本由新开局建立；运行期不补建旧存档状态。
import { RELEASES, FAMILIES } from '../data/rivals.js';
import { dimKeys } from '../data/core.js';
import { BENCH_BY_ID } from '../data/benchmarks.js';
import { SOTA, FOLLOW_GAP, BOARD_WINDOW_DAYS } from '../data/balance.js';
import { addDays, daysBetween } from './clock.js';
import { rivalScore, lowerIsBetter } from './model.js';
import { P } from './provider.js';

const MODS = ['llm', 'image', 'music', 'speech'];
const MOD_NAME = { llm: '语言模型', image: '图像生成', music: '音乐生成', speech: '语音合成' };

// ---------- 综合分与“自家” ----------
export const Q_W = {
  llm: { knowledge: 0.22, code: 0.22, math: 0.22, writing: 0.22, agent: 0.12 },   // 固定权重，从开局起就计 Agent
  image: { aesthetics: 0.25, adherence: 0.25, text: 0.25, realism: 0.25 },
  music: { composition: 0.25, vocals: 0.25, lyrics: 0.25, fidelity: 0.25 },
  speech: { naturalness: 0.25, cloning: 0.25, multilingual: 0.25, expressive: 0.25 },
};
const QW = Object.fromEntries(Object.entries(Q_W).map(([m, w]) => [m, Object.entries(w)]));
const QW_SUM = Object.fromEntries(Object.entries(Q_W).map(([m, w]) => [m, Object.values(w).reduce((a, b) => a + b, 0)]));
// 综合分（v1.0 唯一的一份，取代原来按日期变权重的旧公式）。只认两个参数，旧调用多传的日期不起作用。
export function qOf(mod, dims) {
  let a = 0;
  for (const [k, w] of QW[mod] || []) a += w * (dims?.[k] || 0);
  return a;
}
// 玩家所在的 org 由新开局写入公司配置，不从旧档 id 猜回。
export const orgOf = s => s?.company?.org ?? null;
const famOrg = fam => FAMILIES[fam]?.org ?? fam;
// 同 org、同模态就是自家（取代 sibling）：Anthropic 的 Claude 和 Fable、Google 的 Gemini 和 Gemma、深度求索的 Pro 和 Flash。
export const isMine = (s, fam) => { const f = FAMILIES[fam]; return !!f && !!s && f.mod === s.mod && f.org === orgOf(s); };
export const visible = (s, r, day = s.day) => r.day <= day && !isMine(s, r.family);
// 已发布快照必须有发布线；尚未发布的当前模型仍用流水线 role（立项时还没有 line）。
export const relRole = snap => {
  if (['main', 'side', 'small'].includes(snap?.line)) return snap.line === 'main' ? 'flagship' : 'small';
  if (snap?.stage !== 'released' && ['flagship','small'].includes(snap?.role)) return snap.role;
  throw Error('不支持缺少发布线的旧存档，请新开一局');
};
// 开局继承的、带真实型号名的发布不算“开局后发布”（C6 记 m.hist）。
const startDayOf = s => (s?.start ? `${s.start}-01` : null);
const relDayOf = m => m?.releasedDay ?? null;
const isFollower = r => !!r.open || !FAMILIES[r.family]?.pusher;
const released = (s, mod = s.mod) => (s?.models || []).filter(m => m.stage === 'released' && (m.mod ?? mod) === mod);
const modelById = (s, id) => (s?.models || []).find(m => m.id === id) || null;

// ---------- 对手表的索引（换对手表 setReleases 时整个重建） ----------
// byDay：按（发布日, RAW 行序）排；label：同一天按 q 从高到低（标签按这个顺序逐条处理，D10.2）；pre：各种“截至某天最强”的前缀表。
let IX = null;
export let SOTA_HISTORY = {};
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
function ix() {
  if (IX && IX.src === RELEASES && IX.ver === P().version()) return IX;
  const q = new Map(), ord = new Map(), byFam = new Map(), byMod = {}, byOrgMod = new Map(), orgs = {};
  const push = (map, k, r) => { if (!map.has(k)) map.set(k, []); map.get(k).push(r); };
  RELEASES.forEach((r, i) => {
    q.set(r, qOf(r.mod, r.dims));
    ord.set(r, r.ord ?? i);
    push(byFam, r.family, r);
    (byMod[r.mod] ??= []).push(r);
    push(byOrgMod, `${famOrg(r.family)}|${r.mod}`, r);
  });
  const byDay = (a, b) => cmp(a.day, b.day) || ord.get(a) - ord.get(b);
  for (const list of byFam.values()) list.sort(byDay);
  for (const list of byOrgMod.values()) list.sort(byDay);
  const label = {}, labelIdx = new Map(), fams = new Map();
  for (const mod of Object.keys(byMod)) {
    byMod[mod].sort(byDay);
    label[mod] = [...byMod[mod]].sort((a, b) => cmp(a.day, b.day) || q.get(b) - q.get(a) || ord.get(a) - ord.get(b));
    label[mod].forEach((r, i) => labelIdx.set(r, i));
    orgs[mod] = [...new Set(byMod[mod].map(r => famOrg(r.family)))];
  }
  for (const f of Object.keys(FAMILIES)) push(fams, `${FAMILIES[f].org}|${FAMILIES[f].mod}`, f);
  IX = { src: RELEASES, ver: P().version(), q, ord, byFam, byMod, byOrgMod, orgs, label, labelIdx, fams, pre: new Map() };
  SOTA_HISTORY = buildHistory(IX);
  return IX;
}
const rawQ = r => ix().q.get(r) ?? qOf(r.mod, r.dims);
const ordOf = r => ix().ord.get(r) ?? r.ord ?? 0;
// 某个 org 某个模态的全部真实发布，按发布日排好（开局阵容、榜单、对手页用）。
export const orgReleases = (org, mod) => ix().byOrgMod.get(`${org}|${mod}`) || [];
export const orgsOf = mod => ix().orgs[mod] || [];
const familiesOf = (org, mod) => ix().fams.get(`${org}|${mod}`) || [];

// 前缀表：按发布日累计“截至这天最强的 q”和各维最高值。pick 决定收哪些发布，key 要把 pick 的含义写全。
function prefix(key, mod, pick) {
  const X = ix();
  let t = X.pre.get(key);
  if (t) return t;
  const keys = dimKeys(mod), days = [], qs = [], envs = [];
  let mq = -Infinity, me = null;
  for (const r of X.byMod[mod] || []) {
    if (!pick(r)) continue;
    mq = Math.max(mq, X.q.get(r));
    me = Object.fromEntries(keys.map(k => [k, Math.max(me?.[k] ?? -Infinity, r.dims[k] ?? 0)]));
    days.push(r.day); qs.push(mq); envs.push(me);
  }
  t = { days, qs, envs };
  X.pre.set(key, t);
  return t;
}
// 前缀表里截至 day（含）的最后一项的下标；一项都没有时是 −1。
function upTo(t, day) {
  let lo = 0, hi = t.days.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (t.days[mid] <= day) lo = mid + 1; else hi = mid; }
  return lo - 1;
}
const pushers = (mod, org) => prefix(`push|${mod}|${org}`, mod, r => !r.open && !!FAMILIES[r.family]?.pusher && famOrg(r.family) !== org);
const othersOf = (mod, org) => prefix(`other|${mod}|${org}`, mod, r => famOrg(r.family) !== org);
const ownOf = (mod, org) => prefix(`own|${mod}|${org}`, mod, r => famOrg(r.family) === org);
const allOf = mod => prefix(`all|${mod}`, mod, () => true);
const qUpTo = (t, day) => { const i = upTo(t, day); return i < 0 ? null : t.qs[i]; };
const envUpTo = (t, day) => { const i = upTo(t, day); return i < 0 ? null : t.envs[i]; };

// ---------- 每局的小缓存 ----------
// 同一天、同一份状态里反复问“世界最强”“各家旗舰”的结果相同，按天缓存。玩家发布、对手变为可见（冻结钳制量）时由本文件 touch 失效；
// 外面直接改了 s.models 的长度或换了一天也会失效。
const MEMO = new WeakMap(), VER = new WeakMap();
const touch = s => { if (s && typeof s === 'object') VER.set(s, (VER.get(s) || 0) + 1); };
function memo(s, key, make) {
  if (!s || typeof s !== 'object') return make();
  const stamp = `${s.day}|${s.models?.length ?? 0}|${VER.get(s) || 0}`;
  let m = MEMO.get(s);
  if (!m || m.stamp !== stamp || m.ix !== ix()) { m = { stamp, ix: ix(), map: new Map() }; MEMO.set(s, m); }
  if (m.map.has(key)) return m.map.get(key);
  const v = make();
  m.map.set(key, v);
  return v;
}

// ---------- 跟随者钳制（D5） ----------
// pushEnvelope：截至 day 对玩家可见的 pusher 闭源对手发布、玩家截至 day 已发布的快照、开局日之前玩家自家线的真实发布，三者取最大 q；都没有为 null。
export function pushEnvelope(s, day = s.day) {
  const org = orgOf(s), mod = s.mod;
  let best = qUpTo(pushers(mod, org), day) ?? -Infinity;
  for (const m of released(s, mod)) { const d = relDayOf(m); if (d && d <= day) best = Math.max(best, qOf(mod, m.dims)); }
  const st = startDayOf(s);
  if (st && org) best = Math.max(best, qUpTo(ownOf(mod, org), st) ?? -Infinity);
  return best > -Infinity ? best : null;
}
function calcAdj(s, r) {
  const env = pushEnvelope(s, r.day);
  return env === null ? 0 : Math.min(0, env - FOLLOW_GAP - rawQ(r));
}
// 这条发布的钳制量：变为可见时已冻结的读 s.world.adj；还没冻结（比如问的是以后的日子）按现在的状态现算，不写回。
function adjOf(s, r) {
  if (!P().followerClamp) return 0;
  if (!s || r.mod !== s.mod || !isFollower(r) || isMine(s, r.family)) return 0;
  const a = s.world?.adj?.[r.id];
  return a !== undefined ? a : calcAdj(s, r);
}
// 对手发布变为可见时冻结钳制量（开局时对开局前的发布一次性算；之后不再随时间变）。不是跟随者的记 0：
// s.world.adj 里有这一条，就说明它已经可见、过过标签规则了（labelOnRival 靠它防止同一条发布处理两遍）。
function freezeAdj(s, r) {
  if (r.mod !== s.mod || isMine(s, r.family)) return;
  s.world ??= {};
  s.world.adj ??= {};
  if (s.world.adj[r.id] === undefined) s.world.adj[r.id] = isFollower(r) ? calcAdj(s, r) : 0;
}
// 对手发布在玩家眼里的能力：r.dims 减去钳制量，平均摊到 Q 计入的各维（每维除以权重之和），不低于 0，安全维不动。
// 没被钳制时直接返回 r.dims（是对手表里的原对象，不要改它）。
export function relDims(s, r) {
  const a = adjOf(s, r);
  if (!a) return r.dims;
  const out = { ...r.dims };
  for (const [k] of QW[r.mod]) out[k] = Math.max(0, (out[k] || 0) + a / QW_SUM[r.mod]);
  return out;
}
const relQ = (s, r) => (adjOf(s, r) ? qOf(r.mod, relDims(s, r)) : rawQ(r));

// ---------- 旗舰：familyBest、orgBest、rivalStandings、worldSota ----------
// 一组候选里取最强：q 高的赢；同分取发布日较晚的，再同分取 RAW 行序靠后的。
const better = (s, a, b) => {
  if (!b) return a;
  if (!a) return b;
  const qa = relQ(s, a), qb = relQ(s, b);
  if (qa !== qb) return qa > qb ? a : b;
  return cmp(a.day, b.day) > 0 || (a.day === b.day && ordOf(a) > ordOf(b)) ? a : b;
};
const pass = (r, { open = null, api = null } = {}) => (open === null || r.open === open) && (!api || !r.tags?.includes('X'));
// 家族截至 day（r.day ≤ day）qOf(relDims) 最高的一款。open 为 true / false 时只在开源或闭源行里挑；api 为 true 时排除带 X 标签的行。
// s 可以是 null（开局阵容、选人界面）：这时不做跟随者钳制。
export function familyBest(s, fam, day = s?.day, opts = {}) {
  return memo(s, `fb|${fam}|${day}|${opts.open ?? ''}|${opts.api ?? ''}`, () => {
    let best = null;
    for (const r of ix().byFam.get(fam) || []) {
      if (r.day > day) break;
      if (pass(r, opts)) best = better(s, r, best);
    }
    return best;
  });
}
// 同 org、同模态各家族的 familyBest 里再取最强（Anthropic 是 Claude 加 Fable，Google 的 LLM 是 Gemini 加 Gemma）。
export function orgBest(s, org, mod, day = s?.day, opts = {}) {
  return memo(s, `ob|${org}|${mod}|${day}|${opts.open ?? ''}|${opts.api ?? ''}`, () => {
    let best = null;
    for (const f of familiesOf(org, mod)) best = better(s, familyBest(s, f, day, opts), best);
    return best;
  });
}
// 某个 org 在这个量级里最强的一款（D1.1 的量级口径）：先按行的 cls 筛，只收 day 之前 BOARD_WINDOW_DAYS 天内发布的，再取最强。
function classBest(s, org, mod, day, cls, opts = {}) {
  let best = null;
  for (const r of orgReleases(org, mod)) {
    if (r.day > day) break;
    if (r.cls === cls && daysBetween(r.day, day) <= BOARD_WINDOW_DAYS && pass(r, opts)) best = better(s, r, best);
  }
  return best;
}
// 各对手 org 截至当天的 orgBest，按 qOf 降序 → [{ org, rel, q }]（取代原来按家族取的对手列表和“最强对手”）。
// cls 给出时改取该量级里最强的一款；open 给出时只看开源或闭源（开源排名用）。
export function rivalStandings(s, { day = s.day, mod = s.mod, cls = null, open = null } = {}) {
  const list = memo(s, `rs|${day}|${mod}|${cls ?? ''}|${open ?? ''}`, () => {
    const mine = mod === s.mod ? orgOf(s) : null;
    const out = [];
    for (const org of orgsOf(mod)) {
      if (org === mine || P().isNpc(org)) continue;
      const rel = cls ? classBest(s, org, mod, day, cls, { open }) : orgBest(s, org, mod, day, { open });
      if (rel) out.push({ org, rel, q: relQ(s, rel) });
    }
    return out.sort((a, b) => b.q - a.q);
  });
  return list.map(x => ({ ...x }));
}
// 世界最强：只算对手（不含玩家），对玩家可见的全部发布里 qOf(relDims) 最高的一款 → { q, dims, rel } | null（没有可见对手）。
export function worldSota(s, { day = s.day, mod = s.mod, open = null } = {}) {
  return memo(s, `ws|${day}|${mod}|${open ?? ''}`, () => {
    let best = null, bq = -Infinity;
    for (const r of ix().byMod[mod] || []) {
      if (r.day > day) break;
      if ((open !== null && r.open !== open) || isMine(s, r.family)) continue;
      const q = relQ(s, r);
      if (q >= bq) { best = r; bq = q; }
    }
    return best && { q: bq, dims: relDims(s, best), rel: best };
  });
}
// 这组能力离世界最强差多少（正数是领先）；没有可见对手时为 null。
export const gapOf = (s, dims, day = s.day) => { const w = worldSota(s, { day }); return w ? qOf(s.mod, dims) - w.q : null; };
// 世界排名：1 + 各对手 org 截至当天的 orgBest 里 q 高于这一版的个数。
export const worldRank = (s, q, day = s.day) => 1 + rivalStandings(s, { day }).filter(x => x.q > q).length;
// 各维度的世界包络：截至 day 对玩家可见的对手发布（relDims）每一维的最大值；includeMine 时把玩家已发布的快照也算上。
export function envelope(s, { day = s.day, mod = s.mod, includeMine = false } = {}) {
  const env = { ...memo(s, `env|${day}|${mod}`, () => {
    const out = {};
    for (const r of ix().byMod[mod] || []) {
      if (r.day > day) break;
      if (isMine(s, r.family)) continue;
      for (const [k, v] of Object.entries(relDims(s, r))) if (!(out[k] >= v)) out[k] = v;
    }
    return out;
  }) };
  if (includeMine) for (const m of released(s, mod)) { const d = relDayOf(m); if (d && d <= day) for (const [k, v] of Object.entries(m.dims || {})) if (!(env[k] >= v)) env[k] = v; }
  return env;
}
// 具名真实型号的综合分（atLeast 用；不做钳制）；没有这个型号返回 null。
export function realQ(name) { return P().realQ(name); }

// ---------- 榜单（D1.1） ----------
// 某个 org 截至 day 在这个基准上分数最高的一款（越低越好的榜取最低）；cls 给出时先按量级筛、只收 BOARD_WINDOW_DAYS 天内的发布。
// 跑分用对手表里的原始能力（rivalScore），不做跟随者钳制。
export function benchBest(s, org, benchId, day = s?.day, { cls = null } = {}) {
  const b = BENCH_BY_ID[benchId];
  if (!b || !day) return null;
  const month = day.slice(0, 7), sign = lowerIsBetter(b) ? -1 : 1;
  let best = null, top = -Infinity;
  for (const r of orgReleases(org, b.mod)) {
    if (r.day > day) break;
    if (r.date < '2022-01' || (cls && (r.cls !== cls || daysBetween(r.day, day) > BOARD_WINDOW_DAYS))) continue;
    const v = sign * rivalScore(b, r, month);
    if (Number.isFinite(v) && v >= top) { best = r; top = v; }
  }
  return best;
}

// ---------- 难度锚点（D6.2；P1.2 的难度曲线读） ----------
// 别家全部真实发布（含带 S 的）截至 day 的最强 q：不做可见性过滤和跟随者钳制；没有为 null。
export const histOther = (s, opts = {}) => P().histOther(s, opts);
// 本公司 org 本模态全部真实发布，截至 day + HIST_LOOKAHEAD 的最强 q；没有为 null。
export const ownHist = (s, opts = {}) => P().ownHist(s, opts);
// 临时锚：本模态全部真实发布（含本公司）截至 day 的最强 q；一条都还没有时取本模态第一条真实发布的 q。
export const tempAnchor = (s, opts = {}) => P().tempAnchor(s, opts);
// “领先”：正持有标签，或本模态还没有可见对手，或在练模型现在发布就能拿到标签。
function leading(s, ws, mod) {
  if (ws === null || s.sota?.holder?.by === 'me') return true;
  const w = (s.models || []).find(m => m.id === s.working);
  return !!w && mod === s.mod && sotaWouldTake(s, qOf(mod, w.dims)) === true;
}
// D6.2 的 R：只看对手和史实，不含玩家快照；自家史线只给炼出过的公司，不领先时最多算到对手最强 + GHOST_CAP。永远是有限数。
export function anchor(s, { day = s.day, mod = s.mod } = {}) {
  const ws = worldSota(s, { day, mod })?.q ?? null;
  const ho = histOther(s, { day, mod });
  const og = sotaMade(s) ? ownHist(s, { day, mod }) : null;
  const own = og === null ? -Infinity : leading(s, ws, mod) ? og - SOTA.HIST_SLACK : Math.min(og - SOTA.HIST_SLACK, ws + SOTA.GHOST_CAP);
  const r = Math.max(ws ?? -Infinity, ho === null ? -Infinity : ho - SOTA.HIST_SLACK, own);
  return r > -Infinity ? r : tempAnchor(s, { day, mod });
}
// D6.2 的 E_k：同一规则逐维算（对手 → 世界包络；别家史实、自家史实 → 各维最高；都没有 → 本模态全部真实发布各维最高）。
export function anchorEnv(s, { day = s.day, mod = s.mod } = {}) {
  const ws = worldSota(s, { day, mod });
  const env = ws ? envelope(s, { day, mod }) : null;
  const ho = envUpTo(othersOf(mod, orgOf(s)), day);
  const og = sotaMade(s) ? envUpTo(ownOf(mod, orgOf(s)), addDays(day, SOTA.HIST_LOOKAHEAD)) : null;
  const lead = leading(s, ws ? ws.q : null, mod);
  const all = envUpTo(allOf(mod), day) ?? ix().label[mod]?.[0]?.dims ?? {};
  const out = {};
  for (const k of dimKeys(mod)) {
    const w = env ? env[k] ?? 0 : null;
    const own = og === null ? -Infinity : lead ? og[k] - SOTA.HIST_SLACK : Math.min(og[k] - SOTA.HIST_SLACK, w + SOTA.GHOST_CAP);
    const v = Math.max(w ?? -Infinity, ho ? ho[k] - SOTA.HIST_SLACK : -Infinity, own);
    out[k] = v > -Infinity ? v : all[k] ?? 0;
  }
  return out;
}

// ---------- SOTA 标签（D10） ----------
// 一条候选进场（D10.2）。st：{ holder, field }；pool()：截至现在的全部候选（含这一条），按处理顺序，场地第一次凑满时从里面挑。
// 返回 null（什么都没变）或 { kind: 'fill' | 'swap' | 'self' | 'defend', prev }。
const mk = (c, day, via, counted, countedAt = null) => ({ by: c.by, org: c.org, id: c.id, name: c.name, q: c.q, since: day, via, counted: !!counted, countedAt: counted ? countedAt ?? day : null });
function offer(st, c, pool, mod) {
  if (!st.field.includes(c.org)) st.field.push(c.org);
  if (st.field.length < SOTA.FIELD) return null;
  const h = st.holder;
  if (!h) {
    // 场地第一次凑满：直接给当时候选里 q 最高的一款（同分取先到的），领先别家 FILL_LEAD 才算“炼出”。
    const all = pool();
    const best = all.reduce((a, x) => (!a || x.q > a.q ? x : a), null);
    if (best.q <= P().labelGate(mod, c.day)) return null;
    const other = Math.max(-Infinity, ...all.filter(x => x.org !== best.org).map(x => x.q));
    st.holder = mk(best, c.day, 'fill', best.q - other >= SOTA.FILL_LEAD);
    return { kind: 'fill', prev: null };
  }
  if (c.org === h.org) {
    // 自家换代：不低于现任就接过，不需要 EPS，算不算数照旧继承。
    if (c.q >= h.q && c.id !== h.id) { st.holder = mk(c, c.day, 'self', h.counted, h.countedAt); return { kind: 'self', prev: h }; }
    return null;
  }
  if (c.q > h.q + SOTA.EPS) { st.holder = mk(c, c.day, 'swap', true); return { kind: 'swap', prev: h }; }
  // 别家一款主线新发布没能高出 EPS：挡住了一次挑战，场地凑满时挂上的那一枚从此算数。
  if (!h.counted && c.main && P().defendOk(h, c)) { h.counted = true; h.countedAt = c.day; return { kind: 'defend', prev: null }; }
  return null;
}

// SOTA_PRE：数据起点之前的持有者（带出处）。补进 Krake 以后不需要任何条目，保留这个导出，以后数据起点之前再有缺口时用。
export const SOTA_PRE = {};
// SOTA_HISTORY：全部真实发布（含各家自家线、含带 S 的，不做可见性过滤和跟随者钳制，用原始 dims）按 D10.2 排出的持有者序列，按模态分开。
// 每条 { by: 家族, org, id, name, q, since, until, via, counted, countedAt, mod }；until 是被接过的那天，还在持有时为 null。
function buildHistory(X) {
  const out = {};
  for (const mod of MODS) {
    const st = { holder: null, field: [] }, pool = [], chain = [], best = {};
    for (const r of X.label[mod] || []) {
      const org = famOrg(r.family), q = X.q.get(r);
      const main = !(org in best) || q >= best[org];   // 主线：发布那一刻成为本 org 本模态新的最强（D10.1）
      if (main) best[org] = q;
      const c = { by: r.family, org, id: r.id, name: r.name, q, day: r.day, main };
      pool.push(c);
      const res = offer(st, c, () => pool, mod);
      if (res && res.kind !== 'defend') { st.holder.mod = mod; chain.push(st.holder); }
    }
    chain.forEach((h, i) => { h.until = chain[i + 1]?.since ?? null; });
    out[mod] = [...(SOTA_PRE[mod] || []), ...chain];
  }
  return out;
}
// 开局播种（D10.4）：★ 同 org 同模态在开局日之前有过一枚算数的标签；○ 只有同 org 别的模态有过；— 其余。
export function seedOf(org, mod, startDay) {
  ix();
  const has = m => (SOTA_HISTORY[m] || []).some(h => h.org === org && h.counted && h.countedAt < startDay);
  if (has(mod)) return '★';
  return MODS.some(m => m !== mod && has(m)) ? '○' : '—';
}
// 开局前或开局后拿到过算数的标签。
export const sotaMade = s => !!s?.sota?.before || (s?.sota?.made?.length ?? 0) > 0;

// 候选：对手发布用 relDims 算 q；玩家快照用发布时的 dims。
const rivalCand = (s, r) => ({ by: r.family, org: famOrg(r.family), id: r.id, name: r.name, q: relQ(s, r), day: r.day, r });
const playerCand = (s, m, day) => ({ by: 'me', org: orgOf(s), id: m.id, name: m.name, q: qOf(s.mod, m.dims), day, m });
// 截至现在处理过的全部候选，按处理顺序：对手按（发布日, 原始 q 降序, 行序），同一天的玩家快照排在对手后面。
// upto：对手处理到哪一条为止（含）；没有时收 day 当天及以前的全部对手。
function candidates(s, day, { upto = null, me = null } = {}) {
  const X = ix(), out = [];
  const lim = upto ? X.labelIdx.get(upto) : Infinity;
  for (const r of X.label[s.mod] || []) {
    if (r.day > day || X.labelIdx.get(r) > lim) break;
    if (!isMine(s, r.family)) out.push(rivalCand(s, r));
  }
  const mine = released(s).filter(m => { const d = relDayOf(m); return d && (d < day || (d === day && (!upto || m === me))); });
  for (const m of mine) if (m !== me) out.push(playerCand(s, m, relDayOf(m)));
  if (me) out.push(playerCand(s, me, day));
  return out;
}
function logPrev(s, prev, day) {
  const so = s.sota;
  so.log.push({ by: prev.by, id: prev.id, name: prev.name, q: prev.q, from: prev.since, until: day, via: prev.via, counted: prev.counted, countedAt: prev.countedAt });
  if (so.log.length > SOTA.LOG_MAX) so.log.splice(0, so.log.length - SOTA.LOG_MAX);
}
// 玩家的快照拿到算数的标签（D10.2 第 5 条）：开局继承的型号只设 before；开局后发布的记进 made。
function credit(s, h, day) {
  const m = modelById(s, h.id);
  if (!m) return;
  if (m.hist) s.sota.before = true;
  else if (!s.sota.made.some(x => x.modelId === m.id)) s.sota.made.push({ modelId: m.id, day, q: h.q, via: h.via });
}
// 一条候选过完 offer 之后的记账：被接过的写 until 并记进 log；新持有者是玩家的快照时写 m.sota，算数就记功。
function settle(s, res, day) {
  if (!res) return;
  const h = s.sota.holder;
  if (res.prev) {
    logPrev(s, res.prev, day);
    if (res.prev.by === 'me') { const pm = modelById(s, res.prev.id); if (pm?.sota) pm.sota.until = day; }
  }
  if (h.by !== 'me') return;
  if (res.kind === 'defend') { credit(s, h, day); return; }
  const m = modelById(s, h.id);
  if (m) m.sota = { from: day, until: null };
  if (h.counted) credit(s, h, day);
}
function rivalStep(s, r, day) {
  const c = rivalCand(s, r);
  c.day = day;
  // 主线：q 不低于这家此前（含同一天先处理的）任何一款。
  let top = -Infinity;
  for (const x of orgReleases(c.org, s.mod)) { if (x.day > day) break; if (x !== r) top = Math.max(top, relQ(s, x)); }
  c.main = c.q >= top;
  // 场地凑满时从“截至这一条处理过的全部候选”里挑；不在对手表里的构造发布也要算上它自己。
  const pool = () => { const p = candidates(s, day, { upto: r }); return p.some(x => x.id === c.id) ? p : [...p, c]; };
  const res = offer(s.sota, c, pool, s.mod);
  settle(s, res, day);
  return { res, c };
}
function playerStep(s, m, day) {
  const c = playerCand(s, m, day);
  c.main = released(s).every(x => x === m || !(relDayOf(x) <= day) || qOf(s.mod, x.dims) <= c.q);
  const res = offer(s.sota, c, () => candidates(s, day, { me: m }), s.mod);
  settle(s, res, day);
  return { res, c };
}
const blank = seed => ({ holder: null, field: [], log: [], made: [], before: seed === '★', seed, kin: null });
// 回放：把截至 until 对玩家可见的对手发布和玩家已发布的快照，按日期过一遍 D10.2（不发新闻）。只用于新开局的史实继承。
// rivalsBefore：对手只收 until 之前的（开局：开局当天的发布由 startOfMonth 照常放出）。
function replay(s, until, { rivalsBefore = false } = {}) {
  const evs = [];
  for (const r of ix().label[s.mod] || []) {
    if (rivalsBefore ? r.day >= until : r.day > until) break;
    if (!isMine(s, r.family)) evs.push({ day: r.day, t: 0, i: evs.length, r });
  }
  released(s).forEach((m, i) => { const d = relDayOf(m); if (d && d <= until) evs.push({ day: d, t: 1, i, m }); });
  evs.sort((a, b) => cmp(a.day, b.day) || a.t - b.t || a.i - b.i);
  for (const e of evs) {
    if (e.t === 0) { freezeAdj(s, e.r); rivalStep(s, e.r, e.day); } else playerStep(s, e.m, e.day);
  }
}
// 开局（D10.2 第 7 条）：先按 D10.4 设 seed、before，再把开局日之前对玩家可见的对手发布和开局继承的快照回放一遍。
export function initSota(s) {
  const st = startDayOf(s) ?? s.day;
  s.sota = blank(seedOf(orgOf(s), s.mod, st));
  s.world ??= {};
  s.world.adj ??= {};
  replay(s, st, { rivalsBefore: true });
  touch(s);
}
// 运行期只接受新开局已经建立的标签账本，不回放修复旧档。
export function ensureSota(s) {
  if (!s?.sota || !Array.isArray(s.sota.field) || !Array.isArray(s.sota.log) || !Array.isArray(s.sota.made)) throw Error('不支持缺少 SOTA 账本的旧存档，请新开一局');
  return s.sota;
}
// 某天 q 这一版发布能不能拿到标签（D10.2 第 6 条），和 labelOnRelease 同一套判断 → true | false | null（发布后场地仍不足）。
export function sotaWouldTake(s, q, { day = s?.day, mod = s?.mod } = {}) {
  if (!s?.sota || mod !== s.mod) return null;
  if (P().labelMode === 'world') return null;
  const field = new Set(s.sota.field);
  field.add(orgOf(s));
  if (field.size < SOTA.FIELD) return null;
  const h = s.sota.holder;
  if (!h) return candidates(s, day).every(c => q > c.q);
  return h.by === 'me' ? q >= h.q : q > h.q + SOTA.EPS;
}
// 标签持有者：今天取 s.sota.holder；过去的日子按 s.sota.log 回查；别的模态按 SOTA_HISTORY 查（别的模态只按脚本发布）。
// → { q, by: 'me' | 家族, id, name, since, counted, countedAt } | null（场地不足，或记录已经翻过去了）。
export function sotaAt(s, { day = s?.day, mod = s?.mod } = {}) {
  if (!s) return null;
  const view = (e, since) => ({ q: e.q, by: e.by, id: e.id, name: e.name, since, counted: !!e.counted && !!e.countedAt && e.countedAt <= day, countedAt: e.countedAt });
  if (mod !== s.mod) {
    const e = (ix(), SOTA_HISTORY[mod] || []).find(h => h.since <= day && (!h.until || day < h.until));
    return e ? view(e, e.since) : null;
  }
  const h = s.sota?.holder;
  if (h && h.since <= day) return day >= s.day ? h : view(h, h.since);
  const e = (s.sota?.log || []).find(x => x.from <= day && day < x.until);
  return e ? view(e, e.from) : null;
}
const fmtGap = x => `${Math.max(0.1, Math.round(x * 10) / 10).toFixed(1)}`;
// 对手发布在 r.day 变为可见时调用（loop.js）：先冻结钳制量，再过标签规则 → { changed, filled, defended, text }。
// text 是“最强易主”的一句话，loop.js 把它并进这条发布的新闻；自家换代不写。
export function labelOnRival(s, r) {
  const none = { changed: false, filled: false, defended: false, text: '' };
  if (!s?.sota || !r?.day || r.mod !== s.mod || isMine(s, r.family) || s.world?.adj?.[r.id] !== undefined) return none;
  if (P().labelMode !== 'replay') return none;
  freezeAdj(s, r);
  const { res, c } = rivalStep(s, r, s.day);
  touch(s);
  if (!res) return none;
  const text = res.kind === 'swap' ? `最强易主：${c.name} 比 ${res.prev.name} 高 ${fmtGap(c.q - res.prev.q)} 分。` : '';
  return { changed: res.kind !== 'defend', filled: res.kind === 'fill', defended: res.kind === 'defend' && s.sota.holder.by === 'me', text };
}
// 玩家发布（doRelease 建快照之后）调用 → { got, prev, via, counted }：这一版拿没拿到标签、之前是谁、怎么拿到的、算不算数。
export function labelOnRelease(s, snap) {
  const none = { got: false, prev: null, via: null, counted: false };
  if (!s?.sota || !snap || (snap.mod ?? s.mod) !== s.mod) return none;
  if (P().labelMode !== 'replay') return none;
  touch(s);
  const prev = s.sota.holder ? { ...s.sota.holder } : null;
  const { res, c } = playerStep(s, snap, s.day);
  touch(s);
  const h = s.sota.holder;
  const got = !!res && res.kind !== 'defend' && h?.by === 'me' && h.id === snap.id;
  if (got && res.kind === 'swap') s.news.unshift({ date: s.date, day: s.day, type: 'sota', title: `最强易主：${c.name} 比 ${res.prev.name} 高 ${fmtGap(c.q - res.prev.q)} 分`, detail: h.counted ? '' : '还没经过挑战。' });
  return { got, prev, via: got ? h.via : null, counted: got ? h.counted : false };
}
// 同集团别的模态的标签记录（只按脚本发布，和 SOTA_HISTORY 完全一样）。
const kinEntries = (s) => { ix(); const org = orgOf(s); return MODS.filter(m => m !== s.mod).flatMap(m => (SOTA_HISTORY[m] || []).filter(h => h.org === org)); };
// 每天调用（loop.js，D10.5）：同集团别的模态当天换手到本集团的发一条新闻；当天变成算数的，本公司还没炼出过、开局不是 ○ 时写 s.sota.kin。
export function kinTick(s, out) {
  ensureSota(s);
  if (!s?.sota) return;
  for (const h of kinEntries(s)) {
    if (h.since === s.day && h.via !== 'self') s.news.unshift({ date: s.date, day: s.day, type: 'sota', title: `集团喜讯：${h.name} 成了${MOD_NAME[h.mod] || ''}最强`, detail: '同一集团别的团队拿到了这个领域的 SOTA。' });
    if (h.countedAt === s.day && !sotaMade(s) && s.sota.seed !== '○' && !s.sota.kin) {
      s.sota.kin = s.day;
      out?.notes?.push(`同一集团的 ${h.name} 坐实了${MOD_NAME[h.mod] || ''}最强，我们的技术储备也跟着厚了一点。`);
    }
  }
}
ix();
