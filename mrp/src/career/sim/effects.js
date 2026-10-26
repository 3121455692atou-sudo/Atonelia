// 统一的效果结算（规格 E1）：applyEffects(s, e, ctx) → 这次实际发生的变化（中文短句数组）。
// 策略、专属事件、经营事件、里程碑、超事件、世界事件、董事会、发布结果（市场期待）写数值都走它，不再各写一份 clamp。
// 另有：describeEffects 生成选项提示（提示和代码只有一份来源）；validateEffects、validateChoice 遇到不认识的键就报错。
//
// ctx = { source, id, model? }，source 只能是 SOURCES 里的一种。键按 KEYS 的顺序结算（和数据里的书写顺序无关）。
// 词表里没有 stance、route、right：路线和授名只能通过策略节点的字段写入（B4、C2）。
// 超事件选项的 action（真实操作）不是效果键：它写在选项上，只允许出现在超事件选项上，命令限 balance.js 的 SUPER_ACTIONS（validateChoice 检查）。
import { START_RESOURCES, TECH_BY_ID, PRICE_TIERS, MODALITIES, DIRECTIONS } from '../data/core.js';
import { EVENTS, CASES } from '../data/events.js';
import { BEYOND, SUPER_ACTIONS } from '../data/balance.js';
import { clamp, round1, fmtMoney, scaleBrand } from './util.js';
import { addDays } from './clock.js';
import { workingModel, liveModel, applyGains } from './model.js';
import { delayResearch, publishPapers, unpublishedFirsts } from './research.js';
import { openCase } from './legal.js';
import { fire } from './queue.js';
import { modifier } from './modifiers.js';
import { cond, validateCond } from './cond.js';
import { addSpirit, removeSpirit, spiritBlocks, spiritDef } from './strategy.js';

export const SOURCES = ['strategy', 'exclusive', 'event', 'milestone', 'super', 'world', 'board', 'release'];

// ---------- 白名单 ----------
const RISK_KEYS = ['abuse', 'copyright', 'minor', 'piracy', 'tos', 'image', 'music', 'voice', 'routing', 'distilled'];
const RISK_LABEL = { abuse: '滥用', copyright: '版权', minor: '未成年人', piracy: '盗版语料', tos: '服务条款', image: '图像版权', music: '音乐版权', voice: '声音冒用', routing: '偷换模型', distilled: '被蒸馏' };
// 世界状态（s.world）：hype 是乘数，其余是标记。cotHidden：有人把推理过程藏起来了（别家照着学推理更难，C4 ex_o1_hidden_cot）。
const WORLD_KEYS = { hype: 'mult', priceWar: 'flag', cotHidden: 'flag' };
// 世界状态里的标记类键（开局补开局前已经发生的世界事件时只补这些，规格 E5）。
export const isWorldFlag = k => WORLD_KEYS[k] === 'flag';
const WORLD_LABEL = { hype: '行业热度', priceWar: '价格战', cotHidden: '推理过程不公开' };
// 公司标记（s.flags）。
const FLAG_KEYS = { noFunding: '不再融资', overseasRent: '海外租卡渠道', poachingEra: '挖人潮' };
// 限时需求乘子（写进 s.boosts，到期自动失效；economy 在 P2.2 接上限时加成来源后读取）。短名和加成键都认。
const DEMAND_KEYS = { chat: 'chatDemand', api: 'apiDemand', sub: 'subDemand', coding: 'codingDemand', router: 'routerDemand' };
const DEMAND_LABEL = { chatDemand: '对话需求', apiDemand: 'API 需求', subDemand: '订阅需求', codingDemand: '编程需求', routerDemand: 'OpenRouter 调用' };
const demandKey = k => DEMAND_KEYS[k] || (Object.values(DEMAND_KEYS).includes(k) ? k : null);
// 服务设置：只认这几项。
const SERVICE_KEYS = { chatFree: '对话产品免费', apiTier: 'API 价格档', contentPolicy: '内容尺度' };
const CONTENT_POLICIES = ['strict', 'standard', 'lenient'];
const POLICY_LABEL = { strict: '从严', standard: '标准', lenient: '宽松' };
const ALL_DIMS = new Set(Object.values(MODALITIES).flatMap(m => m.dims.map(d => d.key)));
const DIM_LABEL = Object.fromEntries(Object.entries(MODALITIES).map(([mod, m]) => [mod, Object.fromEntries(m.dims.map(d => [d.key, d.label]))]));
// 共享维度键的名称依模态而异；缺少模态或该模态没有此键时保留原键，不借用别的模态。
const dimLabel = (mod, key) => DIM_LABEL[mod]?.[key] || key;
// 后训练数据的类别（s.data.post 的键）就是各训练方向的 data，界面名取那个方向的名字。
const POST_LABEL = Object.fromEntries(Object.values(DIRECTIONS).flat().filter(d => d.data).map(d => [d.data, d.label]));

// ---------- 小工具 ----------
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const num = v => typeof v === 'number' && Number.isFinite(v);
const need = (ok, msg) => { if (!ok) throw new Error(msg); };
const sign = v => (v > 0 ? '+' : v < 0 ? '−' : '');
const plus = v => `${sign(v)}${Math.abs(round1(v))}`;
const pct = v => { const p = Math.round((v - 1) * 1000) / 10; return `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p)}%`; };
const money = v => `${v >= 0 ? '+' : '−'}${fmtMoney(Math.abs(v))}`;
const startCash = s => START_RESOURCES[s.company?.tier]?.[s.scenario]?.cash ?? 0;
// “自己”的股票代码：上市了就是自家；集团内团队算母公司，幅度减半；都不是就没有。
function selfTicker(s) {
  if (s.capital?.listed) return { own: true, mult: 1 };
  if (s.company?.kind === 'division' && s.company.parent) return { ticker: s.company.parent, mult: 0.5 };
  return null;
}
const addShock = (s, ticker, x) => { const t = (s.flags.tickerShock ??= {}); t[ticker] = (t[ticker] || 0) + x; };

// ---------- 词表 ----------
// 每个键：apply(s, v, ctx) → 实际变化的说明（字符串、字符串数组或空）；say(v, s) → 提示里的说明；check(v, ctx) 校验写法。
const KEYS = {
  cash: { apply: (s, v) => { s.cash += v; return `现金 ${money(v)}`; }, say: v => `现金 ${money(v)}`, check: v => need(num(v), 'cash 要写数字（美元）') },
  cashOfStart: {
    apply: (s, v) => { const x = v * startCash(s); s.cash += x; return `现金 ${money(x)}`; },
    say: (v, s) => (s ? `现金 ${money(v * startCash(s))}` : `现金 ${sign(v)}${Math.abs(round1(v * 100))}%（按开局现金）`),
    check: v => need(num(v) && Math.abs(v) <= 1, 'cashOfStart 要写 −1 到 1 之间的比例'),
  },
  brand: {
    // 乘法；涨幅部分再乘 brandGain（特质加成）；结果夹在 0.02–12。
    apply: (s, v) => { const g = modifier(s, 'brandGain'); return `品牌 ${pct(scaleBrand(s, v > 1 && g !== 1 ? 1 + (v - 1) * g : v))}`; },
    say: v => `品牌 ${pct(v)}`, check: v => need(num(v) && v > 0, 'brand 要写正数倍数'),
  },
  rep: { apply: (s, v) => { const b = s.rep; s.rep = clamp(s.rep + v, 0, 100); return `口碑 ${plus(s.rep - b)}`; }, say: v => `口碑 ${plus(v)}`, check: v => need(num(v), 'rep 要写数字') },
  morale: { apply: (s, v) => { const b = s.morale; s.morale = clamp(s.morale + v, -2, 2); return `团队士气 ${plus(s.morale - b)}`; }, say: v => `团队士气 ${plus(v)}`, check: v => need(num(v), 'morale 要写数字') },
  health: { apply: (s, v) => { const b = s.health; s.health = clamp(s.health + v, 0, 100); return `集群健康度 ${plus(s.health - b)}`; }, say: v => `集群健康度 ${plus(v)}`, check: v => need(num(v), 'health 要写数字') },
  know: { apply: (s, v) => { const b = s.know || 0; s.know = Math.max(0, b + v); return `技术积累 ${plus(s.know - b)}`; }, say: v => `技术积累 ${plus(v)}`, check: v => need(num(v), 'know 要写数字') },
  team: { apply: (s, v) => { const b = s.team; s.team = Math.round(s.team * v); return `团队 ${plus(s.team - b)} 人`; }, say: v => `团队 ${pct(v)}`, check: v => need(num(v) && v > 0, 'team 要写正数倍数') },
  valuation: {
    apply: (s, v) => { if (s.company?.kind === 'division') return null; s.valuation *= v; return `估值 ${pct(v)}`; },
    say: v => `估值 ${pct(v)}`, check: v => need(num(v) && v > 0, 'valuation 要写正数倍数'),
  },
  raise: {
    // 按当前估值立即融资：现金 + v·x/(1−x)，股权 ×(1−x)。集团内团队、被特质禁止融资时跳过。
    apply: (s, x) => {
      if (s.company?.kind === 'division') return null;
      if (spiritBlocks(s, 'funding')) return '公司特质禁止融资，这轮没融';
      const amount = s.valuation * x / (1 - x);
      s.cash += amount;
      s.equity *= 1 - x;
      return `融资 ${fmtMoney(amount)}（出让 ${round1(x * 100)}% 股权）`;
    },
    say: x => `按现在的估值融资（出让 ${round1(x * 100)}% 股权）`, check: v => need(num(v) && v > 0 && v < 1, 'raise 要写 0 到 1 之间的出让比例'),
  },
  stockShock: {
    // 一律累加。self：上市的取自家股价（月结时生效），集团内团队取母公司代码、幅度减半，都不是就忽略。
    apply: (s, v) => Object.entries(v).map(([t, x]) => {
      if (t !== 'self') { addShock(s, t, x); return `${t} 股价 ${pct(1 + x)}`; }
      const me = selfTicker(s);
      if (!me) return null;
      if (me.own) { s.flags.stockShock = (s.flags.stockShock || 0) + x; return `自家股价 ${pct(1 + x)}`; }
      addShock(s, me.ticker, x * me.mult);
      return `母公司股价 ${pct(1 + x * me.mult)}`;
    }),
    say: v => Object.entries(v).map(([t, x]) => `${t === 'self' ? '自家股价' : `${t} 股价`} ${pct(1 + x)}`).join('，'),
    check: v => need(isObj(v) && Object.values(v).every(num), 'stockShock 要写成 { 股票代码或 self: 幅度 }'),
  },
  delayResearch: { apply: (s, v) => { delayResearch(s, v); return `在研项目推迟约 ${Math.round(v)} 天`; }, say: v => `在研项目推迟约 ${Math.round(v)} 天`, check: v => need(num(v) && v >= 0, 'delayResearch 要写天数') },
  techRead: {
    apply: (s, v) => { s.techRead ??= {}; for (const id of v) s.techRead[id] = s.date; return `${v.map(id => TECH_BY_ID[id].name).join('、')}至少按论文已公开算`; },
    say: v => `${v.map(id => TECH_BY_ID[id]?.name || id).join('、')}至少按论文已公开算`,
    check: v => need(Array.isArray(v) && v.every(id => TECH_BY_ID[id]), 'techRead 要写技术 id 的数组'),
  },
  techBoost: {
    apply: (s, v) => { s.techBoost ??= {}; for (const [id, x] of Object.entries(v)) s.techBoost[id] = Math.min(s.techBoost[id] || 1, x); return Object.entries(v).map(([id, x]) => `研究「${TECH_BY_ID[id].name}」的工作量 ×${x}`); },
    say: v => Object.entries(v).map(([id, x]) => `研究「${TECH_BY_ID[id]?.name || id}」的工作量 ×${x}`).join('，'),
    check: v => need(isObj(v) && Object.entries(v).every(([id, x]) => TECH_BY_ID[id] && num(x) && x > 0 && x <= 1), 'techBoost 要写成 { 技术: 0–1 的工作量乘子 }'),
  },
  data: {
    // 自有后训练数据档位，不超过 2.5。
    apply: (s, v) => Object.entries(v.post || {}).map(([k, x]) => { s.data.post[k] = Math.min(2.5, (s.data.post[k] || 0) + x); return `「${POST_LABEL[k]}」后训练数据 ${plus(x)} 档`; }),
    say: v => Object.entries(v.post || {}).map(([k, x]) => `「${POST_LABEL[k] || k}」后训练数据 ${plus(x)} 档`).join('，'),
    check: v => need(isObj(v) && Object.keys(v).every(k => k === 'post') && isObj(v.post) && Object.entries(v.post).every(([k, x]) => k in POST_LABEL && num(x)), `data 要写成 { post: { 数据类别: 档位 } }，类别只认 ${Object.keys(POST_LABEL).join('、')}`),
  },
  dims: {
    // 作用于在练模型，没有就作用于在线模型。经过 applyGains（规格 D7）：吃难度曲线、上限和污染上限，说明按实际加上的分写。
    apply: (s, v) => {
      const m = workingModel(s) || liveModel(s);
      if (!m) return null;
      const r = applyGains(s, m, Object.fromEntries(Object.entries(v).filter(([k]) => m.dims[k] !== undefined)));
      return Object.entries(r.applied).filter(([, x]) => Math.abs(x) >= 0.05).map(([k, x]) => `${dimLabel(m.mod ?? s.mod, k)} ${plus(round1(x))}`);
    },
    say: (v, s) => Object.entries(v).map(([k, x]) => `${dimLabel(s?.mod, k)} ${plus(x)}`).join('，'),
    check: v => need(isObj(v) && Object.entries(v).every(([k, x]) => ALL_DIMS.has(k) && num(x)), 'dims 要写成 { 维度: 加分 }'),
  },
  risk: {
    // 风险乘子，写在 s.risk（取代旧的 riskMods）。
    apply: (s, v) => { const bag = (s.risk ??= {}); return Object.entries(v).map(([k, x]) => { bag[k] = (bag[k] || 1) * x; return `${RISK_LABEL[k]}风险 ${pct(x)}`; }); },
    say: v => Object.entries(v).map(([k, x]) => `${RISK_LABEL[k] || k}风险 ${pct(x)}`).join('，'),
    check: v => need(isObj(v) && Object.entries(v).every(([k, x]) => RISK_KEYS.includes(k) && num(x) && x > 0), `risk 只认 ${RISK_KEYS.join('、')}（compliance 已删除），值是正数倍数`),
  },
  world: {
    apply: (s, v) => { s.world ??= {}; return Object.entries(v).map(([k, x]) => { if (WORLD_KEYS[k] === 'mult') { s.world[k] = (s.world[k] ?? 1) * x; return `${WORLD_LABEL[k]} ${pct(x)}`; } s.world[k] = x; return `${WORLD_LABEL[k]}：${x ? '是' : '否'}`; }); },
    say: v => Object.entries(v).map(([k, x]) => (WORLD_KEYS[k] === 'mult' ? `${WORLD_LABEL[k]} ${pct(x)}` : `${WORLD_LABEL[k]}：${x ? '是' : '否'}`)).join('，'),
    check: v => need(isObj(v) && Object.entries(v).every(([k, x]) => WORLD_KEYS[k] && (WORLD_KEYS[k] === 'mult' ? num(x) && x > 0 : typeof x === 'boolean')), `world 只认 ${Object.keys(WORLD_KEYS).join('、')}`),
  },
  flag: {
    apply: (s, v) => Object.entries(v).map(([k, x]) => { s.flags[k] = x; return `${FLAG_KEYS[k]}：${x ? '是' : '否'}`; }),
    say: v => Object.entries(v).map(([k, x]) => `${FLAG_KEYS[k] || k}：${x ? '是' : '否'}`).join('，'),
    check: v => need(isObj(v) && Object.entries(v).every(([k, x]) => k in FLAG_KEYS && typeof x === 'boolean'), `flag 只认 ${Object.keys(FLAG_KEYS).join('、')}`),
  },
  spirit: {
    apply: (s, v) => [
      ...(v.add || []).map(x => { const it = typeof x === 'string' ? { id: x } : x; addSpirit(s, it.id, it.days ?? null); return `获得特质「${spiritDef(s, it.id)?.title || it.id}」${it.days ? `（${it.days} 天）` : ''}`; }),
      ...(v.remove || []).filter(id => s.strategy?.spirits?.[id]).map(id => { removeSpirit(s, id); return `失去特质「${spiritDef(s, id)?.title || id}」`; }),
    ],
    say: (v, s) => [...(v.add || []).map(x => { const it = typeof x === 'string' ? { id: x } : x; return `获得特质「${(s && spiritDef(s, it.id)?.title) || it.id}」${it.days ? `（${it.days} 天）` : ''}`; }), ...(v.remove || []).map(id => `失去特质「${(s && spiritDef(s, id)?.title) || id}」`)].join('，'),
    check: v => need(isObj(v) && Object.keys(v).every(k => ['add', 'remove'].includes(k)) && (v.add || []).every(x => typeof x === 'string' || (isObj(x) && typeof x.id === 'string' && (x.days === undefined || (num(x.days) && x.days > 0)))) && (v.remove || []).every(x => typeof x === 'string'), 'spirit 要写成 { add: [{ id, days }], remove: [id] }'),
  },
  demand: {
    apply: (s, v, ctx) => {
      const mults = Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'days').map(([k, x]) => [demandKey(k), x]));
      (s.boosts ??= []).push({ ...mults, until: addDays(s.day, v.days), src: ctx.id ?? ctx.source });
      return Object.entries(mults).map(([k, x]) => `${DEMAND_LABEL[k]} ${pct(x)}（${v.days} 天）`);
    },
    say: v => Object.entries(v).filter(([k]) => k !== 'days').map(([k, x]) => `${DEMAND_LABEL[demandKey(k)] || k} ${pct(x)}（${v.days} 天）`).join('，'),
    check: v => need(isObj(v) && num(v.days) && v.days > 0 && Object.keys(v).length > 1 && Object.entries(v).every(([k, x]) => k === 'days' || (demandKey(k) && num(x) && x > 0)), 'demand 要写成 { chat、api、sub、coding、router: 倍数, days: 天数 }'),
  },
  service: {
    apply: (s, v) => Object.entries(v).map(([k, x]) => {
      if (k === 'chatFree') { if (!s.products.chat) return null; s.products.chat.free = x; return x ? '对话产品改为免费' : '对话产品恢复收费'; }
      if (k === 'apiTier') { if (!s.products.api) return null; s.products.api.tier = x; return `API 价格调到「${PRICE_TIERS[x].label}」档`; }
      s.service.contentPolicy = x;
      return `内容尺度改为${POLICY_LABEL[x]}`;
    }),
    say: v => Object.entries(v).map(([k, x]) => (k === 'chatFree' ? (x ? '对话产品改为免费' : '对话产品恢复收费') : k === 'apiTier' ? `API 价格调到「${PRICE_TIERS[x]?.label || x}」档` : `内容尺度改为${POLICY_LABEL[x] || x}`)).join('，'),
    check: v => need(isObj(v) && Object.entries(v).every(([k, x]) => (k === 'chatFree' ? typeof x === 'boolean' : k === 'apiTier' ? x in PRICE_TIERS : k === 'contentPolicy' && CONTENT_POLICIES.includes(x))), `service 只认 ${Object.keys(SERVICE_KEYS).join('、')}`),
  },
  case: {
    // 立即立案，走统一的 openCase：同类官司已经在打、在排队、或者还在冷却期就不立。
    apply: (s, v) => (openCase(s, v.type, { now: true, mult: v.mult ?? 1 }) ? `被起诉：${CASES[v.type].title}` : null),
    say: v => `会被起诉：${CASES[v.type]?.title || v.type}`,
    check: v => need(isObj(v) && CASES[v.type] && (v.mult === undefined || (num(v.mult) && v.mult > 0)) && Object.keys(v).every(k => ['type', 'mult'].includes(k)), 'case 要写成 { type: 官司种类, mult }'),
  },
  queue: { apply: (s, v) => { s.queue.push({ kind: 'event', id: v }); return null; }, say: v => `接下来会遇到：${EVENTS[v]?.title || v}`, check: v => need(typeof v === 'string' && EVENTS[v], `queue 要写经营事件 id：${v}`) },
  news: {
    apply: (s, v) => { s.news.unshift({ date: s.date, day: s.day, type: 'event', title: v.title, detail: v.detail || '' }); return null; },
    say: () => '', check: v => need(isObj(v) && typeof v.title === 'string' && Object.keys(v).every(k => ['title', 'detail'].includes(k)), 'news 要写成 { title, detail }'),
  },
  papers: {
    // 公开首创技术，同时触发 paper 钩子（里程碑）。
    apply: s => null, // 实际结算见 applyEffects（要先拿到 ids 再 fire）
    say: v => (v === 'all' ? '公开全部首创技术' : `公开「${v.map(id => TECH_BY_ID[id]?.name || id).join('、')}」`),
    check: v => need(v === 'all' || (Array.isArray(v) && v.every(id => TECH_BY_ID[id])), "papers 要写 'all' 或技术 id 的数组"),
  },
  if: {
    apply: () => null, // 见 applyEffects
    say: (v, s) => { const a = describeEffects(v.then, s), b = describeEffects(v.else, s); return [a && `满足条件时：${a}`, b && `否则：${b}`].filter(Boolean).join('；'); },
    check: (v, ctx) => { need(isObj(v) && v.cond && Object.keys(v).every(k => ['cond', 'then', 'else'].includes(k)), 'if 要写成 { cond, then, else }'); validateCond(v.cond); if (v.then) validateEffects(v.then, ctx); if (v.else) validateEffects(v.else, ctx); },
  },
  beyondTrial: {
    // 只有 g_beyond 用（D8）：给在练模型挂上“只用自有数据的干净训练”考验。
    apply: s => { const m = workingModel(s); if (!m) return null; m.beyondTrial = { need: BEYOND.trialDays, clean: 0 }; return `在练模型开始 ${BEYOND.trialDays} 天只用自有数据的干净训练`; },
    say: () => `在练模型要做 ${BEYOND.trialDays} 天只用自有数据的干净训练`, check: v => need(v === true, 'beyondTrial 只能写 true'),
  },
};
// 旧键：data/super.js 的 rp（研究点），按 0.6 折成技术积累，只认超事件来源。P1.4 清理超事件数据（E7）时连同这一项一起删除。
const LEGACY = { rp: { sources: ['super'], to: v => ({ know: v * 0.6 }) } };
export const EFFECT_KEYS = Object.keys(KEYS);
// 选项（事件、里程碑、超事件、专属事件的 choices）的字段。distill：这个选项会买蒸馏数据（机器人和顾问按 wantsDistill 决定选不选，A10）。
export const CHOICE_KEYS = ['id', 'label', 'hint', 'effects', 'result', 'action', 'distill'];
// 超事件选项 action 的形状（以 data/super.js 为准）。
const ACTION_SHAPE = {
  rentGpus: a => Object.keys(a).length === 1,
  setTier: a => typeof a.product === 'string' && (a.dir === 1 || a.dir === -1) && Object.keys(a).length === 3,
  setInferShare: a => num(a.add) && a.add > 0 && num(a.max) && a.max > 0 && a.max <= 1 && Object.keys(a).length === 3,
  buyGpus: a => num(a.cashShare) && a.cashShare > 0 && a.cashShare <= 1 && Object.keys(a).length === 2,
};

// ---------- 结算 ----------
export function applyEffects(s, e, ctx = {}) {
  if (!SOURCES.includes(ctx.source)) throw new Error(`效果来源不对：${ctx.source}（只能是 ${SOURCES.join('、')}）`);
  if (e === null || e === undefined) return [];
  if (!isObj(e)) throw new Error('效果要写成对象');
  const notes = [];
  const push = r => { for (const x of [].concat(r ?? [])) if (x) notes.push(x); };
  for (const k of Object.keys(e)) {
    if (k in KEYS) continue;
    if (LEGACY[k]?.sources.includes(ctx.source)) continue;
    throw new Error(k === 'action' ? 'action 不是效果键：它写在超事件选项上' : `效果里有不认识的键：${k}`);
  }
  // 旧键先折成新键（同名的新键也写了时两者相加）。
  let eff = e;
  for (const [k, def] of Object.entries(LEGACY)) {
    if (e[k] === undefined || e[k] === null || e[k] === 0) continue;
    eff = { ...eff };
    delete eff[k];
    for (const [nk, nv] of Object.entries(def.to(e[k]))) eff[nk] = eff[nk] === undefined ? nv : eff[nk] + nv;
  }
  for (const [k, def] of Object.entries(KEYS)) {
    const v = eff[k];
    // 没写、写成 null 的跳过；加减类写 0 也跳过（免得把本来就越界的值顺手夹回去）。
    if (v === undefined || v === null || (v === 0 && ['cash', 'cashOfStart', 'rep', 'morale', 'health', 'know', 'delayResearch'].includes(k))) continue;
    if (k === 'papers') {
      const done = publishPapers(s, v === 'all' ? unpublishedFirsts(s) : v);
      if (done.length) { fire(s, { on: 'paper', techs: done.map(t => t.id) }); push(`公开了「${done.map(t => t.name).join('、')}」`); }
      continue;
    }
    if (k === 'if') { push(applyEffects(s, cond(s, v.cond, ctx) ? v.then : v.else, ctx)); continue; }
    push(def.apply(s, v, ctx));
  }
  return notes;
}

// 选项提示：白话说明这些效果（还没发生，按写法说；给了 s 时，按开局现金一类的数换算成实数）。
export function describeEffects(e, s = null) {
  if (!isObj(e)) return '';
  const parts = [];
  for (const [k, v] of Object.entries(e)) {
    if (v === undefined || v === null) continue;
    if (k === 'rp') { parts.push(`技术积累 ${plus(v * 0.6)}`); continue; }
    const def = KEYS[k];
    if (!def) continue;
    const t = def.say(v, s);
    if (t) parts.push(t);
  }
  return parts.join('，');
}

// 校验效果的写法。不认识的键、写错的值都报错；action 不是效果键；旧键 rp 只认超事件来源。
export function validateEffects(e, ctx = {}) {
  if (e === null || e === undefined) return true;
  need(isObj(e), `效果要写成对象：${JSON.stringify(e)}`);
  if (ctx.source !== undefined) need(SOURCES.includes(ctx.source), `效果来源不对：${ctx.source}`);
  for (const [k, v] of Object.entries(e)) {
    need(k !== 'action', 'action 不是效果键：它只能写在超事件选项上');
    if (LEGACY[k]) { need(LEGACY[k].sources.includes(ctx.source), `旧键 ${k} 只允许出现在超事件里`); need(num(v), `${k} 要写数字`); continue; }
    need(KEYS[k], `效果里有不认识的键：${k}`);
    KEYS[k].check(v, ctx);
  }
  return true;
}

// 校验一个选项：字段在 CHOICE_KEYS 里；效果合法；action 只能出现在超事件选项上，命令在 SUPER_ACTIONS 里、形状对。
export function validateChoice(c, ctx = {}) {
  need(isObj(c), '选项要写成对象');
  for (const k of Object.keys(c)) need(CHOICE_KEYS.includes(k), `选项里有不认识的字段：${k}`);
  need(typeof c.id === 'string' && c.id, '选项要有 id');
  if (c.distill !== undefined) need(c.distill === true, 'distill 只能写 true');
  validateEffects(c.effects, ctx);
  if (c.action !== undefined) {
    need(ctx.source === 'super', `只有超事件选项能带 action（这里的来源是 ${ctx.source ?? '空'}）`);
    need(isObj(c.action) && SUPER_ACTIONS.includes(c.action.cmd), `action 的命令不在白名单 SUPER_ACTIONS 里：${c.action?.cmd}`);
    need(ACTION_SHAPE[c.action.cmd](c.action), `action ${c.action.cmd} 的写法不对：${JSON.stringify(c.action)}`);
  }
  return true;
}
