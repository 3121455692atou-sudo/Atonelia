// 服务配置：产品开关和价格档、出租张数、小模型 API、分流方案、服务策略；国内对话产品上线前要过备案。
// 界面改服务配置一律走这里的命令（setProduct、setLease、setTier、setSmallApi……），不直接写 s.products。
import { PRODUCTS, PRICE_TIERS, fmtDate } from '../data/core.js';
import { liveModel, smallLive, gpuCount } from './model.js';
import { filingSafety } from './evals.js';
import { addDays } from './clock.js';
import { log } from './log.js';
import { P } from './provider.js';

// 国内生成式 AI 备案对安全对齐的要求。
export const FILING_SAFETY = 50;

// 产品配置只认这几项；出租张数要在 0 到手里的卡数之间。
const PRODUCT_KEYS = ['on', 'tier', 'smallTier', 'gpus'];
export function setProduct(s, id, patch) {
  const p = s.products[id];
  const def = PRODUCTS[s.mod].find(x => x.id === id);
  if (!p || !def) throw new Error('没有这个产品');
  if (!patch || typeof patch !== 'object') throw new Error('产品配置无效');
  if (Object.keys(patch).some(k => !PRODUCT_KEYS.includes(k))) throw new Error('未知的产品配置');
  if (patch.on !== undefined && typeof patch.on !== 'boolean') throw new Error('产品开关只能是开或关');
  for (const k of ['tier', 'smallTier']) if (patch[k] !== undefined && !Object.hasOwn(PRICE_TIERS, patch[k])) throw new Error('未知的价格档位');
  if (patch.gpus !== undefined && (id !== 'gpu_lease' || !Number.isSafeInteger(patch.gpus) || patch.gpus < 0 || patch.gpus > gpuCount(s))) throw new Error('出租显卡数量无效');
  if (patch.on && !liveModel(s) && id !== 'gpu_lease') throw new Error('还没有发布的模型');
  if (patch.on && def.from > s.date) throw new Error(`${fmtDate(def.from)} 之后才有这类产品`);
  if (patch.on && def.need) {
    const m = liveModel(s);
    for (const [k, v] of Object.entries(def.need)) if ((m?.dims[k] || 0) < v) throw new Error(`需要${k === 'code' ? '代码' : 'Agent'}能力 ≥ ${v}`);
  }
  if (patch.on && id === 'chat' && s.company.country === 'CN' && P().gate('cnFiling', s) && s.service.filing !== 'done') {
    if (s.service.filing === 'pending') return { note: '备案审核中，通过后对话产品会自动上线。' };
    s.service.filing = 'pending';
    s.due.filing = addDays(s.day, 60);
    log(s, '提交生成式 AI 服务备案');
    return { note: `已提交备案，约 2 个月出结果。安全对齐需要不低于 ${FILING_SAFETY}。` };
  }
  Object.assign(p, patch);
  return { note: '' };
}
// 对外出租多少张卡（算力页的滑杆）。按手里实际的卡数钳制：超过的只租出手里有的，负数当 0。
export function setLease(s, n) {
  if (!s.products.gpu_lease) throw new Error('没有出租业务');
  if (!Number.isFinite(n)) throw new Error('出租显卡数量无效');
  // 重组冻结期（M.5.8）：出租收入来自租卡池里的别家，算转钱渠道，不能开。
  const frozen = n > 0 ? P().moneyFrozen(s) : null;
  if (frozen) throw new Error(frozen);
  s.products.gpu_lease.gpus = Math.max(0, Math.min(Math.floor(n), gpuCount(s)));
  return { gpus: s.products.gpu_lease.gpus };
}
// 调价格档。key 是 'tier'（这个产品本身）或 'smallTier'（API 里小模型那一档，只有 API 有）。
export function setTier(s, id, tier, key = 'tier') {
  const p = s.products[id];
  if (!p || !PRODUCTS[s.mod].some(x => x.id === id)) throw new Error('没有这个产品');
  if (key !== 'tier' && !(key === 'smallTier' && id === 'api')) throw new Error('未知的价格设置');
  if (!Object.hasOwn(PRICE_TIERS, tier)) throw new Error('未知的价格档位');
  p[key] = tier;
  return { tier };
}
// 小模型要不要在 API 里单独上架。
export function setSmallApi(s, on) {
  if (!s.products.api) throw new Error('没有 API 产品');
  if (typeof on !== 'boolean') throw new Error('开关只能是开或关');
  s.products.api.small = on;
  return { on };
}
// 防蒸馏开关（规格 B2、B3）：只要有一款在线模型（在线旗舰或在线小模型）是闭源的就有这个开关；权重都放出去了，蒸馏防不住，也不必防。
export const antiDistillShown = s => [liveModel(s), smallLive(s)].some(m => m && !m.open);
// 每天一早（loop.js 的 dueTick）：备案到期出结果；被要求下架的对话产品到期重新上架；没有闭源在线模型时，严格防蒸馏自动回到标准（不再收风控月费）。
export function serviceDue(s, out) {
  if (s.service.antiDistill === 'strict' && !antiDistillShown(s)) {
    s.service.antiDistill = 'standard';
    out?.notes?.push('在线模型都开放了权重，严格防蒸馏停掉了，不再收风控月费。');
  }
  if (s.due.chatBan && !(s.due.chatBan > s.day)) {
    delete s.due.chatBan;
    if (s.products.chat && !s.products.chat.on) { s.products.chat.on = true; out.notes.push('对话产品重新上架。'); }
  }
  if (s.service.filing === 'pending' && !(s.due.filing > s.day)) {
    delete s.due.filing;
    // 只认已经发布、评测过的版本（T6.6）：在线旗舰、正在灰度的旗舰、今天评完的候选；在练模型和评测中的候选不算。
    const safety = filingSafety(s);
    if (safety >= FILING_SAFETY) { s.service.filing = 'done'; s.products.chat.on = true; out.notes.push('备案通过，对话产品面向公众上线。'); }
    else { s.service.filing = 'none'; out.notes.push(`备案被退回：安全对齐 ${Math.round(safety)}，要求不低于 ${FILING_SAFETY}。补做安全训练后重新提交。`); }
  }
}
const ROUTINGS = ['full', 'quant_open', 'quant_secret', 'distill_open', 'distill_secret'];
const POLICIES = { contentPolicy: ['strict', 'standard', 'lenient'], proxyPolicy: ['none', 'limit', 'ban', 'reseller'], antiDistill: ['strict', 'standard'] };
// M0 的命令参数表（sim/commands.js）要照着这两张表写取值范围，所以转出去；界面别直接读，改配置走命令。
export { ROUTINGS, POLICIES };
export function setRouting(s, mode) {
  if (!ROUTINGS.includes(mode)) throw new Error('没有这种分流方案');
  if (!s.service.routingUnlocked && mode !== 'full') throw new Error('还没有分流方案');
  if (mode.startsWith('distill') && !smallLive(s)) throw new Error('需要先有一个小模型');
  s.service.routing = mode;
}
export function setPolicy(s, key, value) {
  if (!Object.hasOwn(POLICIES, key) || !POLICIES[key].includes(value)) throw new Error('没有这种服务策略');
  if (key === 'antiDistill' && value === 'strict' && !antiDistillShown(s)) throw new Error('在线模型都开放了权重，用不着防蒸馏');
  s.service[key] = value;
}
