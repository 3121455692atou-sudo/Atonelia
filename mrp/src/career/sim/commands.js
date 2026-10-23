// 命令协议（规格 M.6.5）：唯一一张命令参数表 COMMANDS，和唯一入口 applyCommand。
// 界面的 guard、联机服务器、net/protocol.js 都从这里拿参数表，不另写一份；机器人走的每一步也都能用它表达。
//
// COMMANDS[name] = {
//   fn(s, args, ctx) → 引擎返回值,      // 真正的引擎调用
//   args: { 参数名: 参数说明 },          // 参数名、类型、取值范围；没有就是不带参数
//   check(args, s, ctx) → 中文原因|null, // 跨参数的检查（例如 decide 的动作决定要带哪个参数）
//   readOnly: false,                    // 结算后的只读回看（s.status !== 'playing'）里能不能用；
//                                       // 引擎命令都会改状态，所以全部是 false，只读回看只放行界面自己的导出和返回
// }
// 参数说明的字段：type（string / int / num / bool / enum / array / object / any）、values（enum 的取值）、
// min / max（数值范围）、minItems / maxItems（数组长度）、optional（可以不带）、nullable（可以显式写 null）、
// check(value, args)（额外检查，返回中文原因）、items（数组元素的说明）。
//
// applyCommand(s, { name, args }, ctx) → { ok: true, result } | { ok: false, err }
// 先按参数表校验，全部通过才调用引擎；校验不通过时一个字都不改。引擎自己抛的错原样放进 err（M.6.5：原话回给客户端）。
import { P } from './provider.js';
import { GPUS, PRICE_TIERS } from '../data/core.js';
import { JOBS } from '../data/balance.js';
import { startJob, cancelJob, pauseJob, setJobPrio, setJobCap, setPost, setRush, setRepair, setAutoRepair, setOwnOnly, setPlan, focusResearch } from './jobs.js';
import { submitEval, cancelEval } from './evals.js';
import { decide } from './loop.js';
import { researchTech, stopTech } from './research.js';
import { buyGpu, buySmuggled, releaseGpu, setInferShare } from './compute.js';
import { setLease, setProduct, setTier, setSmallApi, setRouting, setPolicy, ROUTINGS, POLICIES } from './service.js';
import { trade, startFunding, startIpo, borrow, repay } from './capital.js';
import { startStrategy, cancelStrategy } from './strategy.js';
import { resolveEvent } from './queue.js';
import { applyAdvice } from './advisor.js';

const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const JOB_KINDS = ['pretrain', 'distill', 'finetune', 'post', 'trial'];
// setPost 的结束条件，和 jobs.js 的 untilOk 同一套写法。
const untilOk = u => u === 'none' || u === 'stall' || (isObj(u) && Number.isFinite(u.days) && u.days >= 1) || (isObj(u) && typeof u.dim === 'string' && Number.isFinite(u.to));
// 送评参数里这些项原样进 submitEval 的 opts（名字、授名、开源、顶替、论文、许可条款，见 T6.2、M.5.4）。
const EVAL_OPTS = ['name', 'grant', 'open', 'replace', 'papers', 'licenseTerms'];
const evalOpts = a => Object.fromEntries(EVAL_OPTS.filter(k => a[k] !== undefined).map(k => [k, a[k]]));

const jobId = { type: 'string', min: 1 };
const onFlag = { type: 'bool' };

// 股市命令转给世界的 Provider；史实模式没有本局上市的公司。
function stockOp(op, ...args) {
  const p = P();
  if (typeof p[op] !== 'function') throw new Error('只有自洽世界和联机里有股市');
  return p[op](...args);
}
// 其余互动命令（许可条款、挖人）也只在自洽世界和联机里有：史实模式没有别家公司可以互动。
function worldOp(op, ...args) {
  const p = P();
  if (typeof p[op] !== 'function') throw new Error('只有自洽世界和联机里能这样做');
  return p[op](...args);
}

export const COMMANDS = {
  // ---------- 训练作业（T11.2） ----------
  // spec 的其余字段（种类对应的 cfg、target、line、prio、cap……）由 jobs.js 的 jobCheck 逐项校验，参数表只管种类。
  startJob: {
    fn: (s, a) => startJob(s, a.spec),
    args: { spec: { type: 'object', check: v => (JOB_KINDS.includes(v.kind) ? null : `作业种类只能是 ${JOB_KINDS.join('、')}`) } },
  },
  cancelJob: { fn: (s, a) => cancelJob(s, a.id), args: { id: jobId } },
  // 暂停和继续都走这条；不带 on 就是暂停。
  pauseJob: { fn: (s, a) => pauseJob(s, a.id, a.on ?? true), args: { id: jobId, on: { ...onFlag, optional: true } } },
  setJobPrio: {
    fn: (s, a) => setJobPrio(s, a.id, a.prio),
    args: { id: jobId, prio: { type: 'enum', values: Object.keys(JOBS.WEIGHT) } },
  },
  // cards 是“这项作业最多用几张卡”，null 表示不封顶。
  setJobCap: {
    fn: (s, a) => setJobCap(s, a.id, a.cards),
    args: { id: jobId, cards: { type: 'int', min: 1, nullable: true } },
  },
  setPost: {
    fn: (s, a) => setPost(s, a.id, { dir: a.dir, bench: a.bench, until: a.until }),
    args: {
      id: jobId,
      dir: { type: 'string', optional: true },
      bench: { type: 'string', optional: true },
      until: { type: 'any', optional: true, check: v => (untilOk(v) ? null : "只能是 'none'、'stall'、{ days } 或 { dim, to }") },
    },
  },
  setRush: { fn: (s, a) => setRush(s, a.id, a.on), args: { id: jobId, on: onFlag } },
  setRepair: { fn: (s, a) => setRepair(s, a.on), args: { on: onFlag } },
  setAutoRepair: { fn: (s, a) => setAutoRepair(s, a.on), args: { on: onFlag } },
  setOwnOnly: { fn: (s, a) => setOwnOnly(s, a.on), args: { on: onFlag } },
  // 下一代计划；cfg 为 null 表示清掉计划。
  setPlan: { fn: (s, a) => setPlan(s, a.cfg), args: { cfg: { type: 'object', nullable: true } } },
  focusResearch: { fn: (s, a) => focusResearch(s, a.on), args: { on: onFlag } },

  // ---------- 送评（T6） ----------
  // 名字、授名、开源、顶替、论文、许可条款在送评时定；tier 为 skip 时当天发布。
  submitEval: {
    fn: (s, a) => submitEval(s, { modelId: a.modelId, tier: a.tier, opts: evalOpts(a) }),
    args: {
      modelId: { type: 'string', min: 1 },
      tier: { type: 'enum', values: ['strict', 'standard', 'quick', 'skip'] },
      name: { type: 'string', min: 1, optional: true },
      grant: { type: 'string', min: 1, optional: true },
      open: { ...onFlag, optional: true },
      replace: { ...onFlag, optional: true },
      papers: { type: 'array', items: { type: 'string', min: 1 }, optional: true },
      licenseTerms: { type: 'any', optional: true },
    },
  },
  cancelEval: { fn: (s, a) => cancelEval(s, a.id), args: { id: jobId } },

  // ---------- 其余引擎命令（M.6.5） ----------
  // 只收 data（买数据、下生成订单）和 eval（跑分）两个动作；maintain / research / train / idle / pretrain / release 是兼容出口，不进协议。
  decide: {
    fn: (s, a) => decide(s, a.action, a.action === 'data' ? { id: a.id } : { bench: a.bench, role: a.role }),
    args: {
      action: { type: 'enum', values: ['data', 'eval'] },
      id: { type: 'string', min: 1, optional: true },
      bench: { type: 'string', min: 1, optional: true },
      role: { type: 'enum', values: ['flagship', 'small'], optional: true },
    },
    check: a => (a.action === 'data' ? (a.id ? null : 'data 动作要带 id') : (a.bench ? null : 'eval 动作要带 bench')),
  },
  researchTech: { fn: (s, a) => researchTech(s, a.id), args: { id: { type: 'string', min: 1 } } },
  stopTech: { fn: (s, a) => stopTech(s, a.id), args: { id: { type: 'string', min: 1 } } },
  buyGpu: {
    fn: (s, a) => buyGpu(s, a.id, a.n, a.rent ?? false),
    args: { id: { type: 'enum', values: Object.keys(GPUS) }, n: { type: 'int', min: 1 }, rent: { ...onFlag, optional: true } },
  },
  buySmuggled: { fn: (s, a) => buySmuggled(s, a.id, a.n), args: { id: { type: 'string', min: 1 }, n: { type: 'int', min: 1 } } },
  // rented 默认 true：退掉租来的卡；false 是卖掉自己买的卡。
  releaseGpu: {
    fn: (s, a) => releaseGpu(s, a.id, a.n, a.rented ?? true),
    args: { id: { type: 'enum', values: Object.keys(GPUS) }, n: { type: 'int', min: 1 }, rented: { ...onFlag, optional: true } },
  },
  setInferShare: { fn: (s, a) => setInferShare(s, a.v), args: { v: { type: 'num', min: 0.05, max: 0.9 } } },
  setLease: { fn: (s, a) => setLease(s, a.n), args: { n: { type: 'int', min: 0 } } },
  setProduct: { fn: (s, a) => setProduct(s, a.id, a.patch), args: { id: { type: 'string', min: 1 }, patch: { type: 'object' } } },
  setTier: {
    fn: (s, a) => setTier(s, a.id, a.tier, a.key ?? 'tier'),
    args: { id: { type: 'string', min: 1 }, tier: { type: 'enum', values: Object.keys(PRICE_TIERS) }, key: { type: 'enum', values: ['tier', 'smallTier'], optional: true } },
  },
  setSmallApi: { fn: (s, a) => setSmallApi(s, a.on), args: { on: onFlag } },
  setRouting: { fn: (s, a) => setRouting(s, a.mode), args: { mode: { type: 'enum', values: [...ROUTINGS] } } },
  setPolicy: {
    fn: (s, a) => setPolicy(s, a.key, a.value),
    args: { key: { type: 'enum', values: Object.keys(POLICIES) }, value: { type: 'string', min: 1 } },
    check: a => (POLICIES[a.key]?.includes(a.value) ? null : `${a.key} 只能是 ${(POLICIES[a.key] || []).join('、')}`),
  },
  trade: {
    fn: (s, a) => trade(s, a.ticker, a.usd),
    args: { ticker: { type: 'string', min: 1 }, usd: { type: 'num', check: v => (v !== 0 ? null : '不能是 0') } },
  },
  startFunding: { fn: (s, a) => startFunding(s, a.dilution), args: { dilution: { type: 'num', min: 0.000001, max: 0.999999 } } },
  startIpo: { fn: s => startIpo(s), args: {} },
  startStrategy: { fn: (s, a) => startStrategy(s, a.id), args: { id: { type: 'string', min: 1 } } },
  cancelStrategy: { fn: s => cancelStrategy(s), args: {} },
  // 收件箱按下标处理任意一张（M.6.4）；不带 at 就是队首。
  resolveEvent: {
    fn: (s, a) => resolveEvent(s, a.choiceId, a.at ?? 0),
    args: { choiceId: { type: 'string', min: 1 }, at: { type: 'int', min: 0, optional: true } },
  },
  // 顾问的建议本身就是一条命令（A10、T9.3）。
  applyAdvice: { fn: (s, a) => applyAdvice(s, a.advice), args: { advice: { type: 'object' } } },
  // 股市（M.5.5，M2a 在末尾追加）：只有自洽世界和联机里有，ticker 是上市公司的 id。
  stockBuy: { fn: (s, a) => stockOp('stockBuy', s, a.ticker, a.usd), args: { ticker: { type: 'string', min: 1 }, usd: { type: 'num', min: 0.01 } } },
  stockSell: { fn: (s, a) => stockOp('stockSell', s, a.ticker, a.shares), args: { ticker: { type: 'string', min: 1 }, shares: { type: 'num', min: 1e-6 } } },
  stockShort: { fn: (s, a) => stockOp('stockShort', s, a.ticker, a.shares), args: { ticker: { type: 'string', min: 1 }, shares: { type: 'num', min: 1e-6 } } },
  stockCover: { fn: (s, a) => stockOp('stockCover', s, a.ticker, a.shares), args: { ticker: { type: 'string', min: 1 }, shares: { type: 'num', min: 1e-6 } } },
  stockBuyback: { fn: (s, a) => stockOp('stockBuyback', s, a.usd), args: { usd: { type: 'num', min: 0.01 } } },
  stockIssue: { fn: (s, a) => stockOp('stockIssue', s, a.usd), args: { usd: { type: 'num', min: 0.01 } } },
  // 自洽和联机里启动 IPO 时选发行比例（10%、20%、30%）。
  startIpoIssue: { fn: (s, a) => startIpo(s, a.frac), args: { frac: { type: 'enum', values: [0.1, 0.2, 0.3] } } },
  // 互动（M.5.2、M.5.3、M.5.6，M2b 在末尾追加）。
  // 处理收件箱里的蒸馏指控卡（按案子 id 找，不用排在第一张）：封号不声张、公开指控、起诉、收授权费。
  distillReply: {
    fn: (s, a) => {
      const at = (s.queue || []).findIndex(q => q.kind === 'distill_caught' && q.id === a.case);
      if (at < 0) throw new Error('收件箱里没有这起蒸馏案子');
      return resolveEvent(s, a.choice, at);
    },
    args: { case: { type: 'string', min: 1 }, choice: { type: 'enum', values: ['ban', 'accuse', 'sue', 'license'] } },
  },
  // 受限开源条款：之后发布的受限许可模型按这套（署名、大户分成、禁止训练竞品，缺的按默认全勾）。
  setLicenseTerms: { fn: (s, a) => worldOp('setLicenseTerms', s, a.terms), args: { terms: { type: 'object' } } },
  // 挖人（大厅里默认关）：n 不填就按对方团队的 3%。
  poach: { fn: (s, a) => worldOp('poach', s, a.target, a.n ?? null), args: { target: { type: 'string', min: 1 }, n: { type: 'int', min: 1, optional: true } } },
  // 显卡抵押贷款（规格 K4，K 包在末尾追加）：借款上限 = 自有卡回收价 × 50%，年息 12%。
  borrow: { fn: (s, a) => borrow(s, a.usd), args: { usd: { type: 'num', min: 1 } } },
  repay: { fn: (s, a) => repay(s, a.usd), args: { usd: { type: 'num', min: 1 } } },
};
// 所有命令都会改局面：结算后的只读回看里一条都不放行（由 applyCommand 统一拦）；readOnly 统一补成 false。
for (const def of Object.values(COMMANDS)) def.readOnly ??= false;

function checkOne(where, spec, v, args) {
  if (v === null && spec.nullable) return null;
  const bad = why => `${where}${why}`;
  switch (spec.type) {
    case 'any':
      break;
    case 'string':
      if (typeof v !== 'string') return bad('要是字符串');
      if (spec.min !== undefined && v.length < spec.min) return bad('不能是空的');
      if (spec.max !== undefined && v.length > spec.max) return bad(`不能超过 ${spec.max} 个字`);
      break;
    case 'int':
      if (!Number.isSafeInteger(v)) return bad('要是整数');
      break;
    case 'num':
      if (!Number.isFinite(v)) return bad('要是数');
      break;
    case 'bool':
      if (typeof v !== 'boolean') return bad('只能是 true 或 false');
      break;
    case 'enum':
      if (!spec.values.includes(v)) return bad(`只能是 ${spec.values.join('、')}`);
      break;
    case 'array':
      if (!Array.isArray(v)) return bad('要是数组');
      if (spec.minItems !== undefined && v.length < spec.minItems) return bad(`至少要 ${spec.minItems} 项`);
      if (spec.maxItems !== undefined && v.length > spec.maxItems) return bad(`最多 ${spec.maxItems} 项`);
      if (spec.items) for (let i = 0; i < v.length; i++) { const why = checkOne(`${where}的第 ${i + 1} 项`, spec.items, v[i], args); if (why) return why; }
      break;
    case 'object':
      if (!isObj(v)) return bad('要是对象');
      break;
    default:
      return bad('的参数表写错了（未知类型）');
  }
  if (Number.isFinite(spec.min) && (spec.type === 'int' || spec.type === 'num') && v < spec.min) return bad(`不能小于 ${spec.min}`);
  if (Number.isFinite(spec.max) && (spec.type === 'int' || spec.type === 'num') && v > spec.max) return bad(`不能大于 ${spec.max}`);
  if (spec.check) { const why = spec.check(v, args); if (why) return bad(`：${why}`); }
  return null;
}

// 按参数表校验一条命令，合法返回 null，不合法返回中文原因。
function checkArgs(name, def, args) {
  if (!isObj(args)) return `命令 ${name} 的参数必须是一个对象`;
  for (const k of Object.keys(args)) if (!Object.hasOwn(def.args, k)) return `命令 ${name} 不认识参数「${k}」`;
  for (const [k, spec] of Object.entries(def.args)) {
    const v = args[k];
    if (v === undefined) {
      if (spec.optional) continue;
      return `命令 ${name} 缺少参数「${k}」`;
    }
    const why = checkOne(`命令 ${name} 的参数「${k}」`, spec, v, args);
    if (why) return why;
  }
  if (def.check) { const why = def.check(args); if (why) return `命令 ${name}：${why}`; }
  return null;
}

export function applyCommand(s, cmd, ctx = {}) {
  if (!s || typeof s !== 'object') return { ok: false, err: '没有可操作的局面' };
  if (!isObj(cmd)) return { ok: false, err: '命令必须是一个对象' };
  const name = cmd.name;
  const def = typeof name === 'string' && Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : null;
  if (!def) return { ok: false, err: `没有这条命令：${String(name)}` };
  const args = cmd.args ?? {};
  const why = checkArgs(name, def, args);
  if (why) return { ok: false, err: why };
  if (s.status !== 'playing' && !def.readOnly) return { ok: false, err: '这一局已经结束，只能回看' };
  try {
    return { ok: true, result: def.fn(s, args, ctx) ?? null };
  } catch (e) {
    // 引擎自己拒绝的（条件不满足、现金不够……）原话回给调用方；命令表不改写这些原因。
    return { ok: false, err: String(e?.message || e) };
  }
}
