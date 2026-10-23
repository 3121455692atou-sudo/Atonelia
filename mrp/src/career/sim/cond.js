// 统一的条件判断（规格 E2）：cond(s, c, ctx) → true / false。策略节点、授名、专属事件、经营事件、里程碑共用一套写法。
// 另有：condWhy 给 ✓/✗ 清单用的中文条目；condPermanent 判断是不是已经永远做不成，condPermanentWhy 说清楚为什么；validateCond 遇到不认识的键就报错。
//
// 写法：一个对象里的几个键都要满足（等于 all）；all / any / not 组合；叶子见下面的 LEAVES。
// ctx：{ model, preview, role, open }。model 是这次发布的模型（model 叶子只在发布钩子里有）；preview 为 true 表示还没真的发布
// （授名检查、beforeRelease、expectPreview），这时 model 里的 sota 按 sotaWouldTake 试算；role 是发布面板当前勾选的发布角色；
// open 是发布面板对副线、小模型勾的开不开源（试算 open、license 用，不传按路线默认）。
// 还没有的状态（s.sota、s.expect、s.strategy、s.route，各包落地前）一律容错：读不到就按不满足。
import { TECH_BY_ID, COMPANY_BY_ID, SCENARIOS, TIERS, ARCHS, PRICE_TIERS, MODALITIES, dimLabel, fmtDate } from '../data/core.js';
import { MS_BY_ID } from '../data/milestones.js';
import { EVENTS } from '../data/events.js';
import { RELEASES, FAMILIES } from '../data/rivals.js';
import { STANCES, STANCE } from '../data/routes.js';
import { EXPECT } from '../data/balance.js';
import { companyFile } from '../data/companies/index.js';
import { round1, fmtMoney, fmtCount } from './util.js';
import { daysBetween } from './clock.js';
import { workingModel, liveModel, smallLive, gpuCount, licenseOf } from './model.js';
import { techStatus } from './research.js';
import { qOf, worldSota, worldRank, envelope, realQ, sotaMade, sotaWouldTake, relRole, relDims, visible } from './sota.js';
import { P } from './provider.js';
import { releaseLine } from './release.js';
import { releaseOpen } from './route.js';
import { spiritDef, spiritBlocks } from './strategy.js';
import { displayName } from './naming.js';

// ---------- 小工具 ----------
const list = v => (Array.isArray(v) ? v : [v]);
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const num = v => typeof v === 'number' && Number.isFinite(v);
const fail = msg => { throw new Error(msg); };
const need = (ok, msg) => { if (!ok) fail(msg); };
const pt = v => `${round1(v)} 分`;
const techName = id => TECH_BY_ID[id]?.name || id;
const names = ids => list(ids).map(x => `「${x}」`).join('、');
const COUNTRY = { CN: '中国', US: '美国', EU: '欧洲' };
const KIND = { private: '独立公司', division: '集团内团队' };
// 路线的界面名：P1.3 填好 data/routes.js 的 STANCE 以后以它为准。
const STANCE_LABEL = { closed: '闭源', open_family: '旗舰闭源 · 小模型开源', delayed: '旧代开源', open_restricted: '受限许可开源', open: '完全开源' };
const stanceLabel = x => STANCE[x]?.label || STANCE_LABEL[x] || x;
const LICENSE = { permissive: '宽松许可', restrictive: '受限许可' };
const BADGE = { open_top: '开源最强', community: '社区之选', works: '能干活' };
const ORIGIN = { pretrain: '预训练', distill: '蒸馏' };
const MS_MODES = ['me', 'other', 'none', 'notOther', 'any'];
const RIGHT_STATES = ['held', 'used', 'void'];
const SEEN_LEVELS = ['paper', 'open'];
const LEVEL_ORDER = ['secret', 'proof', 'paper', 'open'];
// 风险记录前缀（risky）：数据集风险记录的 id 按前缀认；旧档里的两条另起了名字，也算进来。
const RISKY = { tos: { label: '违反服务条款蒸馏来的', alias: ['ds_gpt4_distill'] }, license: { label: '许可不清的', alias: [] }, music_scrape: { label: '未经授权抓取的曲库', alias: ['mu_scrape'] } };
const ALL_DIMS = new Set(Object.values(MODALITIES).flatMap(m => m.dims.map(d => d.key)));
const dimName = (s, k) => dimLabel(s.mod, k);
const lastMonth = s => s.history?.at(-1) || {};
const msTitle = id => MS_BY_ID[id]?.title || id;
const whoName = who => (who === 'me' ? '我们' : FAMILIES[who]?.company || COMPANY_BY_ID[who]?.company || (who === 'academia' ? '学界' : who));
const nodeTitle = (s, id) => (companyFile(s.charId)?.tree?.nodes || []).find(n => n.id === id)?.title || id;
const hnName = (s, id) => (companyFile(s.charId)?.names || []).find(n => n.id === id)?.name || id;
const dayOf = v => (typeof v === 'string' && v.length === 7 ? `${v}-15` : v);

// 开局继承的型号不算“已发布”：v1.0 记 m.hist（C6，P2.1）；在那之前，继承的型号就是带真实型号名、没有发布日（releasedDay）的那几款
// （玩家发布的旗舰都写 releasedDay；玩家的小模型名字不会是真实型号名）。
const inherited = (s, m) => m.hist === true || P().isLegacy(s, m);
const releasedSnaps = s => (s.models || []).filter(m => m.stage === 'released' && !inherited(s, m));
// 现在发布，这一版默认是什么角色（working 叶子、发布前试算用）：和 doRelease 同一个判定（release.js 的 releaseLine，不勾“顶替”）。
// 不弱于在线旗舰、也不弱于正在灰度的旗舰就顶替（flagship），否则作为副线（small）。
const defaultRole = (s, m) => (releaseLine(s, m) === 'main' ? 'flagship' : 'small');
// 发布前试算这一版能不能拿到 SOTA 标签：还没有 s.sota（P1.1 之前）按不满足；sotaWouldTake 返回 null（发布后场地仍不足）时
// 回退成 lead:0，没有可见对手时视为成立（E2）。
function wouldTake(s, m) {
  if (!s.sota) return false;
  const q = qOf(s.mod, m.dims, s.date);
  const w = sotaWouldTake(s, q);
  if (w !== null && w !== undefined) return !!w;
  const ws = worldSota(s);
  return !ws || q >= ws.q;
}
// 这款模型现在是不是 SOTA 标签的持有者。
function holds(s, m, where, ctx) {
  if (where === 'model' && !ctx.preview) return !!m.sota && !m.sota.until;
  if (where === 'working' || (where === 'model' && ctx.preview)) return wouldTake(s, m);
  const h = s.sota?.holder;
  return !!h && h.by === 'me' && h.id === m.id;
}
// 上一款已发布的旗舰（不含这一款）：codeOverPrev 和它比。
function prevFlagship(s, m) {
  const snaps = (s.models || []).filter(x => x.stage === 'released' && x !== m && x.id !== m.id && relRole(x) === 'flagship');
  return snaps.at(-1) || null;
}
// 对手发布的许可（rival.license 用）：第 8 列 tags 的 LP 是宽松许可，LR、LN 是受限许可（和开局给继承型号补许可同一口径，route.js 的 stampLicenses）；闭源为 null。
const relLicense = r => { const t = r.open ? licenseOf(r) : null; return t ? (t === 'LP' ? 'permissive' : 'restrictive') : null; };
// 对手发布的筛选（exists / none 用）：当前可见（发布日 r.day 不晚于今天，sota.js 的 visible）、非自家；mod 不写时默认本模态。
// 离最强多远按玩家看到的能力算（跟随者钳制以后的 relDims，和 worldSota 同一口径）。按发布日排好，最后一条是最近的一款。
function rivalMatches(s, f) {
  const mod = f.mod ?? s.mod;
  const ws = f.gap !== undefined ? worldSota(s, { mod }) : null;
  return RELEASES.filter(r => r.mod === mod && visible(s, r)
    && (f.open === undefined || r.open === f.open)
    && (f.license === undefined || list(f.license).includes(relLicense(r)))
    && (f.tag === undefined || (r.tags || []).includes(f.tag))
    && (f.family === undefined || list(f.family).includes(r.family))
    && (f.gap === undefined || !ws || qOf(mod, relDims(s, r)) >= ws.q - f.gap))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}
function rivalDesc(f) {
  const bits = [];
  if (f.open !== undefined) bits.push(f.open ? '开源' : '闭源');
  if (f.license !== undefined) bits.push(list(f.license).map(x => LICENSE[x] || x).join('或'));
  if (f.tag !== undefined) bits.push(`带「${f.tag}」标签`);
  if (f.gap !== undefined) bits.push(`离最强 ${f.gap} 分以内`);
  if (f.family !== undefined) bits.push(list(f.family).map(x => FAMILIES[x]?.name || x).join('或'));
  if (f.mod !== undefined) bits.push(MODALITIES[f.mod]?.label || f.mod);
  return bits.join('、') || '任意';
}
const runway = s => {
  const h = lastMonth(s);
  const burn = (h.costs || 0) - (h.revenue || 0);
  return burn > 0 ? (s.cash || 0) / burn : Infinity;
};
const fmtMonths = v => (Number.isFinite(v) ? `${round1(v)} 个月` : '不烧钱');

// ---------- 模型条件 ModelCond ----------
// 每个子键：test(s, m, v, where, ctx)、why(s, m, v, where, ctx) → { text, now }、check(v)。m 一定存在（exists 单独处理）。
const MODEL_KEYS = {
  role: {
    test: (s, m, v, where, ctx) => modelRole(s, m, where, ctx) === v,
    why: (s, m, v, where, ctx) => ({ text: v === 'flagship' ? '作为旗舰发布（顶替在线旗舰）' : '作为小模型或副线发布', now: modelRole(s, m, where, ctx) === 'flagship' ? '旗舰' : '小模型或副线' }),
    check: v => need(['flagship', 'small'].includes(v), `role 只能是 flagship 或 small：${v}`),
  },
  open: {
    test: (s, m, v, where, ctx) => openOf(s, m, where, ctx).open === v,
    why: (s, m, v, where, ctx) => { const o = openOf(s, m, where, ctx); return { text: v ? '开放权重' : '闭源', now: `${o.open ? '开放权重' : '闭源'}${o.planned ? '（发布时按路线）' : ''}` }; },
    check: v => need(typeof v === 'boolean', 'open 要写 true 或 false'),
  },
  license: {
    test: (s, m, v, where, ctx) => list(v).includes(openOf(s, m, where, ctx).license),
    why: (s, m, v, where, ctx) => { const o = openOf(s, m, where, ctx); return { text: `许可是${list(v).map(x => LICENSE[x] || x).join('或')}`, now: `${LICENSE[o.license] || '没有许可信息'}${o.planned ? '（发布时按路线）' : ''}` }; },
    check: v => need(list(v).every(x => x in LICENSE), `license 只能是 permissive 或 restrictive：${v}`),
  },
  reasoning: {
    test: (s, m, v) => isReasoning(s, m) === v,
    why: (s, m, v) => ({ text: v ? '会推理（长思维链）' : '不是推理模型', now: isReasoning(s, m) ? '会推理' : '不会推理' }),
    check: v => need(typeof v === 'boolean', 'reasoning 要写 true 或 false'),
  },
  arch: {
    test: (s, m, v) => list(v).includes(m.arch),
    why: (s, m, v) => ({ text: `架构是${list(v).map(x => ARCHS[x]?.label || x).join('或')}`, now: ARCHS[m.arch]?.label || m.arch || '未知' }),
    check: v => need(list(v).every(x => x in ARCHS), `arch 里有不认识的架构：${v}`),
  },
  minTotal: { test: (s, m, v) => (m.total || 0) >= v, why: (s, m, v) => ({ text: `总参数不少于 ${v}B`, now: `${m.total ?? 0}B` }), check: v => need(num(v), 'minTotal 要写数字') },
  maxTotal: { test: (s, m, v) => (m.total || 0) <= v, why: (s, m, v) => ({ text: `总参数不超过 ${v}B`, now: `${m.total ?? 0}B` }), check: v => need(num(v), 'maxTotal 要写数字') },
  maxActive: { test: (s, m, v) => (m.active || 0) <= v, why: (s, m, v) => ({ text: `激活参数不超过 ${v}B`, now: `${m.active ?? 0}B` }), check: v => need(num(v), 'maxActive 要写数字') },
  techs: {
    test: (s, m, v) => list(v).every(id => modelTechs(s, m).includes(id)),
    why: (s, m, v) => { const miss = list(v).filter(id => !modelTechs(s, m).includes(id)); return { text: `用上了${list(v).map(techName).join('、')}`, now: miss.length ? `还差${miss.map(techName).join('、')}` : '都用上了' }; },
    check: v => need(list(v).every(id => TECH_BY_ID[id]), `techs 里有不认识的技术：${v}`),
  },
  dims: {
    test: (s, m, v) => Object.entries(v).every(([k, x]) => (m.dims?.[k] ?? 0) >= x),
    why: (s, m, v) => ({ text: Object.entries(v).map(([k, x]) => `${dimName(s, k)} ${x}`).join('、'), now: Object.keys(v).map(k => `${dimName(s, k)} ${round1(m.dims?.[k] ?? 0)}`).join('、') }),
    check: v => need(isObj(v) && Object.entries(v).every(([k, x]) => ALL_DIMS.has(k) && num(x)), 'dims 要写成 { 维度: 分数 }'),
  },
  dimLead: {
    test: (s, m, v) => { const env = envelope(s); return Object.entries(v).every(([k, d]) => (m.dims?.[k] ?? 0) >= (env[k] ?? 0) + d); },
    why: (s, m, v) => {
      const env = envelope(s);
      return { text: Object.entries(v).map(([k, d]) => `${dimName(s, k)}${d ? `比世界最好的高 ${d}` : '不低于世界最好的'}`).join('、'),
        now: Object.keys(v).map(k => `${dimName(s, k)} ${round1(m.dims?.[k] ?? 0)}，世界最好 ${round1(env[k] ?? 0)}`).join('；') };
    },
    check: v => need(isObj(v) && Object.entries(v).every(([k, x]) => ALL_DIMS.has(k) && num(x)), 'dimLead 要写成 { 维度: 领先分数 }'),
  },
  gap: {
    test: (s, m, v) => { const ws = worldSota(s); return !ws || qOf(s.mod, m.dims, s.date) >= ws.q - v; },
    why: (s, m, v) => ({ text: `离当前最强不超过 ${v} 分`, now: gapText(s, m) }),
    check: v => need(num(v), 'gap 要写数字'),
  },
  lead: {
    test: (s, m, v) => { if (v === null) return true; const ws = worldSota(s); return !ws || qOf(s.mod, m.dims, s.date) >= ws.q + v; },
    why: (s, m, v) => ({ text: v === null ? '不要求领先' : `领先当前最强 ${v} 分`, now: gapText(s, m) }),
    check: v => need(v === null || num(v), 'lead 要写数字（不要求领先写 null）'),
  },
  atLeast: {
    test: (s, m, v) => { const rq = realQ(v.name); return rq !== null && qOf(s.mod, m.dims, s.date) >= rq - (v.d || 0); },
    why: (s, m, v) => { const rq = realQ(v.name), q = qOf(s.mod, m.dims, s.date); return { text: `不弱于 ${v.name}${v.d ? `（可以差 ${v.d} 分）` : ''}`, now: rq === null ? '没有这个型号' : q >= rq ? `高 ${pt(q - rq)}` : `差 ${pt(rq - q)}` }; },
    check: v => need(isObj(v) && typeof v.name === 'string' && realQ(v.name) !== null && (v.d === undefined || num(v.d)), `atLeast 要写 { name: 真实型号名, d: 容差 }：${JSON.stringify(v)}`),
  },
  rank: {
    test: (s, m, v) => worldRank(s, qOf(s.mod, m.dims, s.date)) <= v,
    why: (s, m, v) => ({ text: `世界排名前 ${v}`, now: `现在第 ${worldRank(s, qOf(s.mod, m.dims, s.date))}` }),
    check: v => need(Number.isInteger(v) && v > 0, 'rank 要写正整数'),
  },
  tainted: { test: (s, m, v) => !!m.tainted === v, why: (s, m, v) => ({ text: v ? '用了别家模型蒸馏（谱系被污染）' : '谱系干净（没被蒸馏污染）', now: m.tainted ? '被污染' : '干净' }), check: v => need(typeof v === 'boolean', 'tainted 要写 true 或 false') },
  teacher: {
    test: (s, m, v) => (v === true ? !!m.teacher : v === false ? !m.teacher : m.teacher === v),
    why: (s, m, v) => ({ text: v === true ? '是蒸馏出来的' : v === false ? '不是蒸馏出来的' : v === 'self' ? '用自家模型当老师蒸馏' : `用 ${FAMILIES[v]?.company || v} 的模型当老师蒸馏`, now: !m.teacher ? '没有老师' : m.teacher === 'self' ? '老师是自家模型' : `老师是 ${FAMILIES[m.teacher]?.name || m.teacher}` }),
    check: v => need(typeof v === 'boolean' || v === 'self' || FAMILIES[v], `teacher 只能写 true、false、'self' 或家族 id：${v}`),
  },
  codeOverPrev: {
    test: (s, m, v) => { const p = prevFlagship(s, m); return !p || (m.dims?.code ?? 0) >= (p.dims?.code ?? 0) + v; },
    why: (s, m, v) => { const p = prevFlagship(s, m); return { text: `代码比上一代旗舰高 ${v} 分`, now: p ? `现在高 ${pt((m.dims?.code ?? 0) - (p.dims?.code ?? 0))}` : '还没有上一代' }; },
    check: v => need(num(v), 'codeOverPrev 要写数字'),
  },
  // 新键（P0.3a 登记）：sota、badge、origin。
  sota: {
    test: (s, m, v, where, ctx) => holds(s, m, where, ctx) === v,
    why: (s, m, v, where, ctx) => ({ text: v ? '这一版拿到 SOTA 标签' : '这一版不拿 SOTA 标签', now: holds(s, m, where, ctx) ? '能拿到' : `拿不到（${gapText(s, m)}）` }),
    check: v => need(typeof v === 'boolean', 'sota 要写 true 或 false'),
  },
  badge: {
    test: (s, m, v, where, ctx) => where === 'model' && !ctx.preview && (m.badges || []).includes(v),
    why: (s, m, v, where, ctx) => ({ text: `拿到「${BADGE[v] || v}」`, now: where === 'model' && !ctx.preview ? ((m.badges || []).map(b => BADGE[b] || b).join('、') || '一枚都没有') : '发布时才判定' }),
    check: v => need(v in BADGE, `badge 只能是 open_top、community、works：${v}`),
  },
  origin: {
    test: (s, m, v) => m.origin === v,
    why: (s, m, v) => ({ text: `出身是${ORIGIN[v]}`, now: ORIGIN[m.origin] || '没有记出身' }),
    check: v => need(v in ORIGIN, `origin 只能是 pretrain 或 distill：${v}`),
  },
};
export const MODEL_COND_KEYS = ['exists', ...Object.keys(MODEL_KEYS)];
// 模型用上了哪些技术：发布出去的快照读 m.techs（发布那天记下的，见 release.js）；还在练的模型按公司现在掌握的技术算，
// 因为后训练会用上底座练完以后才学会的技术（比如 RL 推理）。在练模型身上的 m.techs 是底座完成时的快照（规格 D6.1），不能拿来判断这一版用上了什么。
const modelTechs = (s, m) => (m.stage === 'released' && m.techs) || s.techs || [];
const isReasoning = (s, m) => m.reasoning ?? modelTechs(s, m).includes('reasoning');
// 开闭和许可（open、license 子键）：发布出去的快照读模型自己的 open、license；在练模型（working）和发布前试算（preview）还没定
// （没发布的模型不写 open，B7 第 5 条），按现在发布的角色读路线的规则：route.js 的 releaseOpen，和 doRelease 的 beforeRelease 同一口径。
// 试算时可选的副线、小模型按 ctx.open（发布面板的勾选），没传按路线默认；working 一律按路线默认。
function openOf(s, m, where, ctx) {
  if (where !== 'working' && !(where === 'model' && ctx.preview)) return { open: !!m.open, license: m.license ?? null, planned: false };
  const line = modelRole(s, m, where, ctx) === 'flagship' ? 'main' : 'side';
  const r = releaseOpen(s, line, where === 'working' ? undefined : ctx.open);
  return { open: r.open, license: r.license ?? null, planned: true };
}
function modelRole(s, m, where, ctx) {
  if (where === 'live') return 'flagship';
  if (where === 'smallLive') return 'small';
  if (where === 'working') return defaultRole(s, m);
  return ctx.role ?? (ctx.preview ? defaultRole(s, m) : relRole(m));
}
function gapText(s, m) {
  const ws = worldSota(s);
  if (!ws) return '还没有可见的对手';
  const d = qOf(s.mod, m.dims, s.date) - ws.q;
  return d >= 0 ? `领先最强 ${pt(d)}` : `离最强还差 ${pt(-d)}`;
}
const WHERE = { live: '在线旗舰', smallLive: '在线小模型', working: '在练模型', model: '这次发布的模型' };
function modelOf(s, where, ctx) {
  if (where === 'live') return liveModel(s);
  if (where === 'smallLive') return smallLive(s);
  if (where === 'working') return workingModel(s);
  return ctx.model || null;
}
function modelTest(s, where, mc, ctx) {
  const m = modelOf(s, where, ctx);
  if (mc.exists === false) return !m;
  if (!m) return false;
  return Object.entries(mc).every(([k, v]) => k === 'exists' || MODEL_KEYS[k].test(s, m, v, where, ctx));
}
function modelWhy(s, where, mc, ctx) {
  const m = modelOf(s, where, ctx);
  const head = WHERE[where];
  if (mc.exists === false) return [{ text: `没有${head}`, ok: !m, now: m ? `有：${displayName(m)}` : '没有' }];
  if (!m) return [{ text: `有${head}${Object.keys(mc).some(k => k !== 'exists') ? '，并且满足下面几条' : ''}`, ok: false, now: where === 'model' ? '只在发布时判断' : '没有' }];
  if (!Object.keys(mc).some(k => k !== 'exists')) return [{ text: `有${head}`, ok: true, now: displayName(m) }];
  return Object.entries(mc).filter(([k]) => k !== 'exists').map(([k, v]) => {
    const w = MODEL_KEYS[k].why(s, m, v, where, ctx);
    return { text: `${head}：${w.text}`, ok: MODEL_KEYS[k].test(s, m, v, where, ctx), now: w.now };
  });
}
function checkModel(mc, where) {
  need(isObj(mc), `${where} 要写成 { 子条件 }`);
  for (const [k, v] of Object.entries(mc)) {
    if (k === 'exists') { need(typeof v === 'boolean', 'exists 要写 true 或 false'); continue; }
    need(MODEL_KEYS[k], `模型条件 ${where} 里有不认识的键：${k}`);
    MODEL_KEYS[k].check(v);
  }
}

// ---------- 叶子 ----------
// 每个叶子：test(s, v, ctx)、why(s, v, ctx) → { text, now }、check(v, opts)，可选 perm(s, v)（已经永远做不成）。
const atLeastLeaf = (label, get, fmt = x => String(x)) => ({
  test: (s, v) => (get(s) ?? 0) >= v,
  why: (s, v) => ({ text: `${label}不少于 ${fmt(v)}`, now: fmt(get(s) ?? 0) }),
  check: v => need(num(v), `${label}要写数字`),
});
const oneOf = (label, get, show, valid) => ({
  test: (s, v) => list(v).includes(get(s)),
  why: (s, v) => ({ text: `${label}是${list(v).map(show).join('或')}`, now: show(get(s)) }),
  check: v => need(list(v).every(valid), `${label}写了不认识的值：${v}`),
});
const range = (label, get, fmt) => ({
  test: (s, v) => { const x = get(s); return (v.min === undefined || x >= v.min) && (v.max === undefined || x <= v.max); },
  why: (s, v) => ({ text: [v.min !== undefined ? `${label}不少于 ${fmt(v.min)}` : '', v.max !== undefined ? `${label}不超过 ${fmt(v.max)}` : ''].filter(Boolean).join('，'), now: fmt(get(s)) }),
  check: v => need(isObj(v) && Object.keys(v).length > 0 && Object.entries(v).every(([k, x]) => ['min', 'max'].includes(k) && num(x)), `${label}要写成 { min, max }`),
});
const modelLeaf = where => ({ test: (s, v, ctx) => modelTest(s, where, v, ctx), lines: (s, v, ctx) => modelWhy(s, where, v, ctx), check: v => checkModel(v, where) });
const firstsIn = (s, days) => Object.values(s.firsts || {}).filter(d => days === undefined || daysBetween(dayOf(d), s.day) <= days).length;
const rightState = (s, hn) => { const r = s.strategy?.rights?.[hn]; return !r ? null : r.void ? 'void' : r.used ? 'used' : r.until && r.until < s.day ? 'void' : 'held'; };
const msMatch = (s, id, mode) => {
  const x = s.ms?.[id];
  if (mode === 'me') return x?.who === 'me';
  if (mode === 'other') return !!x && x.who !== 'me';
  if (mode === 'none') return !x;
  if (mode === 'notOther') return !x || x.who === 'me';
  return !!x;
};
// 里程碑条件永远成立不了：要求还没有人做到（none）的已经有人做到；要求我们做到、或者别家没做到（me、notOther）的被别家先做到了。
const msLost = (s, id, mode) => { const x = s.ms?.[id]; return !!x && (mode === 'none' || ((mode === 'notOther' || mode === 'me') && x.who !== 'me')); };
const MS_TEXT = { me: t => `我们做到了「${t}」`, other: t => `别家先做到了「${t}」`, none: t => `还没有人做到「${t}」`, notOther: t => `还没有别家做到「${t}」`, any: t => `已经有人做到「${t}」` };

const LEAVES = {
  // 公司属性
  company: oneOf('公司', s => s.charId, x => COMPANY_BY_ID[x]?.company || x, x => !!COMPANY_BY_ID[x]),
  country: oneOf('公司所在地', s => s.company?.country, x => COUNTRY[x] || x, x => x in COUNTRY),
  tier: oneOf('公司量级', s => s.company?.tier, x => TIERS[x]?.label || x, x => x in TIERS),
  kind: oneOf('公司类型', s => s.company?.kind, x => KIND[x] || x, x => x in KIND),
  mod: oneOf('模态', s => s.mod, x => MODALITIES[x]?.label || x, x => x in MODALITIES),
  scenario: oneOf('剧本', s => s.scenario, x => SCENARIOS.find(y => y.id === x)?.title || x, x => SCENARIOS.some(y => y.id === x)),
  strength: {
    test: (s, v) => list(v).every(k => (s.company?.strengths || []).includes(k)),
    why: (s, v) => ({ text: `公司擅长${list(v).map(k => dimName(s, k)).join('、')}`, now: (s.company?.strengths || []).map(k => dimName(s, k)).join('、') || '没有写' }),
    check: v => need(list(v).every(k => ALL_DIMS.has(k)), `strength 写了不认识的维度：${v}`),
  },
  era: {
    test: (s, v) => s.date >= v,
    why: (s, v) => ({ text: `${fmtDate(v)}以后`, now: fmtDate(s.date) }),
    check: (v, opts) => { need(opts.allowEra, 'era 只能写在策略节点的 available 里'); need(/^\d{4}-\d{2}$/.test(v), `era 要写成 'YYYY-MM'：${v}`); },
  },
  // 技术
  techs: {
    test: (s, v) => list(v).every(id => (s.techs || []).includes(id)),
    why: (s, v) => { const miss = list(v).filter(id => !(s.techs || []).includes(id)); return { text: `掌握${list(v).map(techName).join('、')}`, now: miss.length ? `还差${miss.map(techName).join('、')}` : '都掌握了' }; },
    check: v => need(list(v).every(id => TECH_BY_ID[id]), `techs 写了不认识的技术：${v}`),
  },
  anyTech: {
    test: (s, v) => list(v).some(id => (s.techs || []).includes(id)),
    why: (s, v) => ({ text: `掌握${list(v).map(techName).join('、')}中的任一项`, now: list(v).filter(id => (s.techs || []).includes(id)).map(techName).join('、') || '一项都没有' }),
    check: v => need(list(v).every(id => TECH_BY_ID[id]), `anyTech 写了不认识的技术：${v}`),
  },
  notTechs: {
    test: (s, v) => !list(v).some(id => (s.techs || []).includes(id)),
    why: (s, v) => ({ text: `还没掌握${list(v).map(techName).join('、')}`, now: list(v).filter(id => (s.techs || []).includes(id)).map(techName).join('、') || '都还没掌握' }),
    check: v => need(list(v).every(id => TECH_BY_ID[id]), `notTechs 写了不认识的技术：${v}`),
    perm: (s, v) => list(v).some(id => (s.techs || []).includes(id)),
    permWhy: (s, v) => `已经掌握了${list(v).filter(id => (s.techs || []).includes(id)).map(id => `「${techName(id)}」`).join('、')}，这一项用不上了`,
  },
  firsts: {
    test: (s, v) => (num(v) ? firstsIn(s) >= v : firstsIn(s, v.days) >= v.n),
    why: (s, v) => ({ text: num(v) ? `自己首创过 ${v} 项技术` : `${v.days} 天内自己首创过 ${v.n} 项技术`, now: `现在 ${num(v) ? firstsIn(s) : firstsIn(s, v.days)} 项` }),
    check: v => need(num(v) || (isObj(v) && num(v.n) && num(v.days) && Object.keys(v).every(k => ['n', 'days'].includes(k))), 'firsts 要写数字，或 { n, days }'),
  },
  techSeen: {
    test: (s, v) => Object.entries(v).every(([id, lv]) => LEVEL_ORDER.indexOf(techStatus(s, TECH_BY_ID[id]).level) >= LEVEL_ORDER.indexOf(lv)),
    why: (s, v) => ({ text: Object.entries(v).map(([id, lv]) => `「${techName(id)}」业界已经${lv === 'open' ? '开源' : '发了论文'}`).join('、'), now: Object.keys(v).map(id => `${techName(id)}：${techStatus(s, TECH_BY_ID[id]).label}`).join('；') }),
    check: v => need(isObj(v) && Object.entries(v).every(([id, lv]) => TECH_BY_ID[id] && SEEN_LEVELS.includes(lv)), "techSeen 要写成 { 技术: 'paper' | 'open' }"),
  },
  // 里程碑账本
  ms: {
    test: (s, v) => Object.entries(v).every(([id, mode]) => msMatch(s, id, mode)),
    lines: (s, v) => Object.entries(v).map(([id, mode]) => ({ text: MS_TEXT[mode](msTitle(id)), ok: msMatch(s, id, mode), now: s.ms?.[id] ? `${whoName(s.ms[id].who)}做到了` : '还没人做到' })),
    check: v => need(isObj(v) && Object.entries(v).every(([id, mode]) => MS_BY_ID[id] && MS_MODES.includes(mode)), `ms 要写成 { 里程碑: ${MS_MODES.join(' | ')} }：${JSON.stringify(v)}`),
    perm: (s, v) => Object.entries(v).some(([id, mode]) => msLost(s, id, mode)),
    // 别家先做到了（notOther、me）：“开源推理追上前沿这件事，阿里巴巴先做到了”；要求还没有人做到（none）：“……这件事，我们已经做到了”。
    permWhy: (s, v) => Object.entries(v).filter(([id, mode]) => msLost(s, id, mode)).map(([id, mode]) => `${msTitle(id)}这件事，${whoName(s.ms[id].who)}${mode === 'none' ? '已经' : '先'}做到了`).join('；'),
  },
  // 策略、路线、授名、事件记账
  node: {
    test: (s, v) => list(v).every(id => !!s.strategy?.done?.[id]),
    why: (s, v) => ({ text: `完成了策略${list(v).map(id => `「${nodeTitle(s, id)}」`).join('、')}`, now: list(v).filter(id => !s.strategy?.done?.[id]).map(id => `「${nodeTitle(s, id)}」还没完成`).join('、') || '都完成了' }),
    check: v => need(list(v).every(x => typeof x === 'string'), 'node 要写节点 id'),
  },
  notNode: {
    test: (s, v) => !list(v).some(id => s.strategy?.done?.[id]),
    why: (s, v) => ({ text: `没走过策略${list(v).map(id => `「${nodeTitle(s, id)}」`).join('、')}`, now: list(v).filter(id => s.strategy?.done?.[id]).map(id => `「${nodeTitle(s, id)}」已完成`).join('、') || '都没走过' }),
    check: v => need(list(v).every(x => typeof x === 'string'), 'notNode 要写节点 id'),
    perm: (s, v) => list(v).some(id => s.strategy?.done?.[id]),
    permWhy: (s, v) => `已经走过策略${list(v).filter(id => s.strategy?.done?.[id]).map(id => `「${nodeTitle(s, id)}」`).join('、')}，这一项不能再做了`,
  },
  spirit: {
    test: (s, v) => list(v).every(id => !!s.strategy?.spirits?.[id]),
    why: (s, v) => ({ text: `有公司特质${list(v).map(id => `「${spiritDef(s, id)?.title || id}」`).join('、')}`, now: list(v).every(id => s.strategy?.spirits?.[id]) ? '有' : '没有' }),
    check: v => need(list(v).every(x => typeof x === 'string'), 'spirit 要写特质 id'),
  },
  stance: {
    test: (s, v) => list(v).includes(s.route?.stance),
    why: (s, v) => ({ text: `开源路线是${list(v).map(stanceLabel).join('或')}`, now: s.route?.stance ? stanceLabel(s.route.stance) : '还没有路线' }),
    check: v => need(list(v).every(x => STANCES.includes(x)), `stance 写了不认识的路线：${v}`),
  },
  right: {
    test: (s, v) => Object.entries(v).every(([hn, st]) => rightState(s, hn) === st),
    lines: (s, v) => Object.entries(v).map(([hn, st]) => ({ text: { held: `持有型号名「${hnName(s, hn)}」的授权`, used: `用过型号名「${hnName(s, hn)}」`, void: `型号名「${hnName(s, hn)}」已作废` }[st], ok: rightState(s, hn) === st, now: { held: '持有', used: '用过了', void: '已作废' }[rightState(s, hn)] || '还没拿到' })),
    check: v => need(isObj(v) && Object.values(v).every(x => RIGHT_STATES.includes(x)), "right 要写成 { 历史名: 'held' | 'used' | 'void' }"),
    perm: (s, v) => Object.entries(v).some(([hn, st]) => st === 'held' && ['used', 'void'].includes(rightState(s, hn))),
    permWhy: (s, v) => Object.entries(v).filter(([hn, st]) => st === 'held' && ['used', 'void'].includes(rightState(s, hn))).map(([hn]) => `型号名「${hnName(s, hn)}」的授权${rightState(s, hn) === 'used' ? '已经用过了' : '已经作废了'}`).join('；'),
  },
  ex: {
    test: (s, v) => list(v).every(id => !!s.strategy?.ex?.[id]),
    why: (s, v) => ({ text: `出过专属事件${names(v)}`, now: list(v).every(id => s.strategy?.ex?.[id]) ? '出过' : '还没出' }),
    check: v => need(list(v).every(x => typeof x === 'string'), 'ex 要写专属事件 id'),
  },
  seen: {
    test: (s, v) => list(v).every(id => seenCount(s, id) > 0),
    why: (s, v) => ({ text: `遇到过事件${list(v).map(id => `「${EVENTS[id]?.title || id}」`).join('、')}`, now: list(v).every(id => seenCount(s, id) > 0) ? '遇到过' : '还没遇到' }),
    check: v => need(list(v).every(x => typeof x === 'string'), 'seen 要写事件 id'),
  },
  // 模型
  live: modelLeaf('live'),
  smallLive: modelLeaf('smallLive'),
  working: modelLeaf('working'),
  model: modelLeaf('model'),
  released: {
    test: (s, v) => releasedCount(s, v) >= (v.count ?? 1),
    why: (s, v) => ({ text: `已发布${v.open === undefined ? '' : v.open ? '开源的' : '闭源的'}${v.role === 'flagship' ? '旗舰' : v.role === 'small' ? '小模型或副线' : '模型'}不少于 ${v.count ?? 1} 款`, now: `${releasedCount(s, v)} 款` }),
    check: v => need(isObj(v) && Object.keys(v).every(k => ['count', 'role', 'open'].includes(k)) && (v.count === undefined || num(v.count)) && (v.role === undefined || ['flagship', 'small'].includes(v.role)) && (v.open === undefined || typeof v.open === 'boolean'), 'released 要写成 { count, role, open }'),
  },
  // 经营状态（都是“不少于”）
  users: atLeastLeaf('用户', s => lastMonth(s).users, fmtCount),
  revenue: atLeastLeaf('月收入', s => lastMonth(s).revenue, fmtMoney),
  cash: atLeastLeaf('现金', s => s.cash, fmtMoney),
  valuation: atLeastLeaf('估值', s => s.valuation, fmtMoney),
  know: atLeastLeaf('技术积累', s => s.know, x => String(Math.round(x))),
  team: atLeastLeaf('团队人数', s => s.team, x => `${Math.round(x)} 人`),
  health: atLeastLeaf('集群健康度', s => s.health, x => String(Math.round(x))),
  integrations: atLeastLeaf('接入的编程工具', s => s.service?.integrations?.tools?.length, x => `${x} 家`),
  // 区间
  runwayMonths: range('现金能撑的时间', runway, fmtMonths),
  gpus: range('GPU', s => gpuCount(s), x => `${Math.round(x)} 张`),
  distillDep: {
    test: (s, v) => (s.distillDep || 0) <= v.max,
    why: (s, v) => ({ text: `蒸馏依赖不超过 ${Math.round(v.max * 100)}%`, now: `${Math.round((s.distillDep || 0) * 100)}%` }),
    check: v => need(isObj(v) && num(v.max) && Object.keys(v).length === 1, 'distillDep 要写成 { max }'),
  },
  ownData: {
    test: (s, v) => ownDataCount(s, v.level) >= (v.count ?? 1),
    why: (s, v) => ({ text: `自有后训练数据至少 ${v.count ?? 1} 类达到 ${v.level} 档`, now: `${ownDataCount(s, v.level)} 类` }),
    check: v => need(isObj(v) && num(v.level) && (v.count === undefined || num(v.count)) && Object.keys(v).every(k => ['level', 'count'].includes(k)), 'ownData 要写成 { level, count }'),
  },
  service: {
    test: (s, v) => serviceLines(s, v).every(x => x.ok),
    lines: (s, v) => serviceLines(s, v),
    check: v => need(isObj(v) && Object.entries(v).every(([k, x]) => (k === 'apiTier' ? list(x).every(t => t in PRICE_TIERS) : ['chatOn', 'apiOn'].includes(k) && typeof x === 'boolean')), 'service 要写成 { chatOn, apiOn, apiTier: [...] }'),
  },
  risky: {
    test: (s, v) => riskyHit(s, v),
    why: (s, v) => ({ text: `用过${RISKY[v]?.label || v}数据`, now: riskyHit(s, v) ? '用过' : '没用过' }),
    check: v => need(v in RISKY, `risky 只能写 ${Object.keys(RISKY).join('、')}：${v}`),
  },
  exists: {
    test: (s, v) => rivalMatches(s, v.rival).length > 0,
    why: (s, v) => ({ text: `市面上有${rivalDesc(v.rival)}的对手模型`, now: rivalMatches(s, v.rival).at(-1)?.name || '还没有' }),
    check: v => checkRival(v, 'exists'),
  },
  none: {
    test: (s, v) => rivalMatches(s, v.rival).length === 0,
    why: (s, v) => ({ text: `市面上还没有${rivalDesc(v.rival)}的对手模型`, now: rivalMatches(s, v.rival).at(-1)?.name || '还没有' }),
    check: v => checkRival(v, 'none'),
    perm: (s, v) => rivalMatches(s, v.rival).length > 0,
    permWhy: (s, v) => `市面上已经有${rivalDesc(v.rival)}的对手模型了（${rivalMatches(s, v.rival).at(-1)?.name}）`,
  },
  // 新叶子（P0.3a 登记）：sotaMade、expectHot、canRaise。读不到 s.sota、s.expect 时按不满足。
  sotaMade: {
    test: (s, v) => (v === 'first' ? (s.sota?.made?.length ?? 0) > 0 && !s.sota?.before : sotaMade(s) === v),
    why: (s, v) => ({ text: v === 'first' ? '开局以后第一次炼出 SOTA' : v ? '炼出过 SOTA（拿到过算数的 SOTA 标签）' : '还没炼出过 SOTA', now: sotaMade(s) ? (s.sota?.before ? '开局前就炼出过' : '炼出过') : '还没有' }),
    check: v => need(v === true || v === false || v === 'first', "sotaMade 只能写 true、false 或 'first'"),
  },
  expectHot: {
    test: (s, v) => expectHot(s) === v,
    why: (s, v) => ({ text: v ? `${EXPECT.HOT_WINDOW} 天内有一次发布超出市场预期` : `${EXPECT.HOT_WINDOW} 天内没有超出预期的发布`, now: s.expect?.hot ? `上次超出预期在 ${s.expect.hot}` : '还没有' }),
    check: v => need(typeof v === 'boolean', 'expectHot 要写 true 或 false'),
  },
  canRaise: {
    test: (s, v) => canRaise(s) === v,
    why: (s, v) => ({ text: v ? '现在能融资（独立公司、没上市、没有在谈的融资、没有特质禁止）' : '现在不能融资', now: canRaise(s) ? '能' : raiseBlock(s) }),
    check: v => need(typeof v === 'boolean', 'canRaise 要写 true 或 false'),
  },
};
export const COND_KEYS = ['all', 'any', 'not', ...Object.keys(LEAVES)];

const seenCount = (s, id) => s.seen?.[id] ?? 0;
const releasedCount = (s, v) => releasedSnaps(s).filter(m => (v.role === undefined || relRole(m) === v.role) && (v.open === undefined || !!m.open === v.open)).length;
const ownDataCount = (s, level) => Object.values(s.data?.post || {}).filter(x => x >= level).length;
const riskyHit = (s, v) => Object.keys(s.data?.risky || {}).some(k => k.startsWith(v) || (RISKY[v]?.alias || []).includes(k));
function serviceLines(s, v) {
  const out = [];
  if (v.chatOn !== undefined) out.push({ text: v.chatOn ? '对话产品在线' : '对话产品没上线', ok: !!s.products?.chat?.on === v.chatOn, now: s.products?.chat?.on ? '在线' : '没上线' });
  if (v.apiOn !== undefined) out.push({ text: v.apiOn ? 'API 在线' : 'API 没开', ok: !!s.products?.api?.on === v.apiOn, now: s.products?.api?.on ? '在线' : '没开' });
  if (v.apiTier !== undefined) {
    const t = s.products?.api?.tier;
    out.push({ text: `API 价格是${list(v.apiTier).map(x => PRICE_TIERS[x].label).join('或')}档`, ok: !!s.products?.api?.on && list(v.apiTier).includes(t), now: s.products?.api?.on ? `${PRICE_TIERS[t]?.label || t}档` : 'API 没开' });
  }
  return out;
}
const expectHot = s => { const h = s.expect?.hot; if (typeof h !== 'string') return false; const d = daysBetween(dayOf(h), s.day); return d >= 0 && d <= EXPECT.HOT_WINDOW; };
function raiseBlock(s) {
  if (s.company?.kind !== 'private') return '集团内团队不单独融资';
  if (s.capital?.listed) return '已经上市';
  if (s.capital?.ipo) return '正在上市';
  if (s.capital?.round) return '已经有一轮融资在谈';
  if (spiritBlocks(s, 'funding')) return '公司特质禁止融资';
  return '';
}
const canRaise = s => !raiseBlock(s);
function checkRival(v, key) {
  need(isObj(v) && isObj(v.rival) && Object.keys(v).length === 1, `${key} 要写成 { rival: { … } }`);
  const f = v.rival;
  for (const [k, x] of Object.entries(f)) {
    if (k === 'open') need(typeof x === 'boolean', 'rival.open 要写 true 或 false');
    else if (k === 'license') need(list(x).every(y => y in LICENSE), `rival.license 写了不认识的许可：${x}`);
    else if (k === 'tag') need(typeof x === 'string', 'rival.tag 要写标签字母');
    else if (k === 'gap') need(num(x), 'rival.gap 要写数字');
    else if (k === 'mod') need(x in MODALITIES, `rival.mod 写了不认识的模态：${x}`);
    else if (k === 'family') need(list(x).every(y => FAMILIES[y]), `rival.family 写了不认识的家族：${x}`);
    else fail(`rival 里有不认识的键：${k}`);
  }
}

// ---------- 对外接口 ----------
const leavesOf = c => Object.entries(c);
export function cond(s, c, ctx = {}) {
  if (c === null || c === undefined) return true;
  return leavesOf(c).every(([k, v]) => {
    if (k === 'all') return v.every(x => cond(s, x, ctx));
    if (k === 'any') return v.some(x => cond(s, x, ctx));
    if (k === 'not') return !cond(s, v, ctx);
    const leaf = LEAVES[k];
    if (!leaf) throw new Error(`条件里有不认识的键：${k}`);
    return !!leaf.test(s, v, ctx);
  });
}
// ✓/✗ 清单：[{ text, ok, now }]，text 和 now 都是给玩家看的中文。
export function condWhy(s, c, ctx = {}) {
  if (c === null || c === undefined) return [];
  return leavesOf(c).flatMap(([k, v]) => {
    if (k === 'all') return v.flatMap(x => condWhy(s, x, ctx));
    if (k === 'any') {
      const kids = v.map(x => ({ lines: condWhy(s, x, ctx), ok: cond(s, x, ctx) }));
      const hit = kids.find(x => x.ok);
      return [{ text: `满足其一：${kids.map(x => x.lines.map(l => l.text).join('，')).join('；或者 ')}`, ok: !!hit, now: hit ? `已满足：${hit.lines.map(l => l.text).join('，')}` : '一条都还不满足' }];
    }
    if (k === 'not') { const lines = condWhy(s, v, ctx); return [{ text: `不能：${lines.map(l => l.text).join('，')}`, ok: !cond(s, v, ctx), now: lines.map(l => l.now).join('；') }]; }
    const leaf = LEAVES[k];
    if (!leaf) throw new Error(`条件里有不认识的键：${k}`);
    if (leaf.lines) return leaf.lines(s, v, ctx);
    const w = leaf.why(s, v, ctx);
    return [{ text: w.text, ok: !!leaf.test(s, v, ctx), now: w.now }];
  });
}
// 是否已经永远做不成（策略节点作废、授名作废用）：里程碑被别家拿走、互斥的节点已完成、授权已用掉或作废、不许出现的技术已经学会。
export function condPermanent(s, c) {
  if (c === null || c === undefined) return false;
  return leavesOf(c).some(([k, v]) => {
    if (k === 'all') return v.some(x => condPermanent(s, x));
    if (k === 'any') return v.length > 0 && v.every(x => condPermanent(s, x));
    if (k === 'not') return false;
    return !!LEAVES[k]?.perm?.(s, v);
  });
}
// 永远做不成的原因（策略节点作废的提示用）→ 白话 | null（没有永久失效的条件）。和 condPermanent 同一口径：all 里任一条、any 里全部。
// 叶子有自己的说法（permWhy，例如 notTechs 写“已经掌握了「X」，这一项用不上了”）就用它，没有的写“条件「…」再也满足不了（现在：…）”。
export function condPermanentWhy(s, c) {
  if (c === null || c === undefined) return null;
  for (const [k, v] of leavesOf(c)) {
    let w = null;
    if (k === 'all') w = v.map(x => condPermanentWhy(s, x)).find(Boolean) ?? null;
    else if (k === 'any') w = v.length > 0 && v.every(x => condPermanent(s, x)) ? v.map(x => condPermanentWhy(s, x)).join('；') : null;
    else if (k !== 'not' && LEAVES[k]?.perm?.(s, v)) {
      const leaf = LEAVES[k];
      if (leaf.permWhy) w = leaf.permWhy(s, v);
      else { const lines = condWhy(s, { [k]: v }); const l = lines.find(x => !x.ok) ?? lines[0]; w = l ? `条件「${l.text}」再也满足不了（现在：${l.now}）` : null; }
    }
    if (w) return w;
  }
  return null;
}
// 校验条件的写法：不认识的键、写错的值都报错。era 只有 allowEra（策略节点的 available）才允许。
export function validateCond(c, opts = {}) {
  const o = { allowEra: false, ...opts };
  if (c === null || c === undefined) return true;
  need(isObj(c), `条件要写成对象：${JSON.stringify(c)}`);
  need(Object.keys(c).length > 0, '条件不能是空对象');
  for (const [k, v] of Object.entries(c)) {
    if (k === 'all' || k === 'any') { need(Array.isArray(v) && v.length > 0, `${k} 要写成非空数组`); v.forEach(x => validateCond(x, o)); continue; }
    if (k === 'not') { validateCond(v, o); continue; }
    const leaf = LEAVES[k];
    need(leaf, `条件里有不认识的键：${k}`);
    leaf.check(v, o);
  }
  return true;
}
