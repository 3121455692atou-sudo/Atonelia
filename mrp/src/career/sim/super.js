// 超事件：玩家做到少见的事（登顶、以小博大、上市大涨、绝境翻盘……）时的虚构大事件，每个只出现一次（出过的记在 s.marks['super:<id>']，值是那一天）。
// 选项上的真实操作（租卡、买卡、调价、调推理份额）先算计划给提示，确认时再算一遍再执行。
import { PRICE_TIERS, GPUS, gpuAvailable, gpuRentable } from '../data/core.js';
import { SUPER_EVENTS, SUPER_BY_ID } from '../data/super.js';
import { SUPER_GAP_DAYS } from '../data/balance.js';
import { fmtMoney } from './util.js';
import { addDays, daysBetween, fmtDay } from './clock.js';
import { RENT_LEAD } from '../data/supply.js';
import { liveModel } from './model.js';
import { qOf, rivalStandings, worldRank, worldSota, relRole } from './sota.js';
import { previewService, serviceCapacity, monthlyCosts, usageBoards } from './economy.js';
import { buyGpu, setInferShare, bestRentGpu, gpuOrderInfo, withOrders } from './compute.js';
import { log } from './log.js';
import { setTier } from './service.js';
import { applyEffects } from './effects.js';
import { fire } from './queue.js';

// 开局时就可能已经成立的几件（名次、调用量、拥堵、收入）：开局第一次月结时已经成立的，算开局前就做到了，悄悄记下、不弹（规格 E4：只认开局之后的变化）。
// 其余几件按定义就只能在开局以后发生（开局后发布的旗舰持标、估值翻十倍、绝境翻盘、上市），开局第一个月里也不检查。
const BASELINE = new Set(['super_small_giant', 'super_router', 'super_soldout', 'super_billion']);
// 玩家持有的 SOTA 标签（super_sota 用，规格 E4）：算数、持标的是开局之后发布的旗舰快照 →
// { holder, model, days（这款持标、而且算数以后过了几天）, lead（领先世界最强几分）, rivals（这个模态发布过模型的对手家数）} | null。
function sotaState(s) {
  const h = s.sota?.holder;
  if (!h || h.by !== 'me' || !h.counted || !h.countedAt) return null;
  const m = (s.models || []).find(x => x.id === h.id);
  if (!m || m.hist || m.stage !== 'released' || relRole(m) !== 'flagship') return null;
  const ws = worldSota(s);
  if (!ws) return null;
  const from = h.since > h.countedAt ? h.since : h.countedAt;
  return { holder: h, model: m, days: daysBetween(from, s.day), lead: qOf(s.mod, m.dims) - ws.q, rivals: rivalStandings(s).length };
}
// 这一条超事件给这家公司看的样子：中国公司用 cn 变体（super_sota 的“东方登顶”）。q.v 是触发时定下的变体。
export function superDef(s, q) {
  const e = SUPER_BY_ID[q.id];
  return q.v === 'cn' && e.cn ? { ...e, ...e.cn } : e;
}
export function checkSuperEvents(s, sv) {
  const live = liveModel(s);
  const q = live ? qOf(s.mod, live.dims) : null;
  const rivals = rivalStandings(s);
  const c = { live, q, sv: sv || {}, rank: null, gap: -99, router: null, sota: sotaState(s) };
  if (q !== null) {
    c.rank = worldRank(s, q);
    c.gap = q - (rivals[0]?.q ?? 0);
    c.router = usageBoards(s).openrouter?.rows.find(r => r.mine)?.rank ?? null;
  }
  const hit = e => { try { return !!e.when(s, c); } catch { return false; } };
  // 开局第一次月结：不弹超事件；开局时就已经成立的几件悄悄记下。
  if (!s.monthsPlayed) {
    for (const e of SUPER_EVENTS) if (BASELINE.has(e.id) && !s.marks[`super:${e.id}`] && hit(e)) s.marks[`super:${e.id}`] = s.day;
    return;
  }
  // 超事件很少见：一次只出一个，两个之间至少隔 SUPER_GAP_DAYS 天。条件只看当下，冷却期里达成的不记账，错过不补演。
  if (s.flags.superLast && daysBetween(s.flags.superLast, s.day) < SUPER_GAP_DAYS) return;
  for (const e of SUPER_EVENTS) {
    if (s.marks[`super:${e.id}`] || !hit(e)) continue;
    s.marks[`super:${e.id}`] = s.day;
    s.flags.superLast = s.day;
    const item = { kind: 'super', id: e.id, params: { pop: s.capital.listed?.pop ? Math.round((s.capital.listed.pop - 1) * 100) : 0 } };
    if (e.cn && s.company.country === 'CN') item.v = 'cn';
    // 和这次月结的里程碑卡一起排弹窗预算（规格 E4）：超事件最不要紧，当天的名额被占了就顺延几天。
    fire(s, { on: 'month', milestones: false, cards: [item] });
    return;
  }
}
export function applySuperChoice(s, q, choiceId) {
  const def = superDef(s, q);
  const ch = def.choices.find(x => x.id === choiceId);
  // 确认时按眼下的局面再算一遍：配额、现金、价格档变了，就做不了。
  const plan = superActionPlan(s, ch);
  if (plan.disabled) throw new Error(plan.disabled);
  let result = ch.result || '';
  const cmd = ch.action?.cmd;
  if (cmd === 'rentGpus') {
    const r = buyGpu(s, plan.gpu, plan.n, true);
    result = `租了 ${r.n} 张 ${gpuName(plan.gpu)}，预计 ${fmtDay(r.eta)} 开通，开通前算力不变；开通后每月租金多约 ${fmtMoney(plan.monthly)}。`;
  } else if (cmd === 'buyGpus') {
    const r = buyGpu(s, plan.gpu, plan.n);
    result = `付了 ${fmtMoney(r.cost)}，订购 ${r.n} 张 ${gpuName(plan.gpu)}，预计 ${fmtDay(r.eta)} 到货，到货前算力不变。订单在「算力」页能看到。`;
  } else if (cmd === 'setTier') {
    setTier(s, ch.action.product, plan.tier);
    result = `旗舰 API 从「${PRICE_TIERS[plan.from].label}」调到「${PRICE_TIERS[plan.tier].label}」，客户按新价格重新选。按现在的局面估：API 月收入 ${fmtMoney(plan.now.revenue.api || 0)} → ${fmtMoney(plan.next.revenue.api || 0)}，服务负载 ${pctOf(plan.now.util)} → ${pctOf(plan.next.util)}。实际以月底结算为准。`;
  } else if (cmd === 'setInferShare') {
    const from = s.inferShare;
    setInferShare(s, plan.share);
    result = `自用算力中的服务占比从 ${pctOf(from)} 提到 ${pctOf(s.inferShare)}。现在就有更多卡做推理，训练算力相应减少。`;
  }
  // 选项的数值效果走统一的 applyEffects（品牌夹在 0.02–12、口碑和士气夹逼、融资按当前估值真的稀释股权）。
  applyEffects(s, ch.effects, { source: 'super', id: q.id });
  log(s, `超事件：${def.title}`);
  return result;
}
const gpuName = id => GPUS[id].label.replace(/（.*?）/, '');
const pctOf = v => `${Math.round(v * 100)}%`;

// 超事件“加租”租哪款卡：先看加急扩容的候选表（bestRentGpu）；表里的卡这时候都租不到，就在现在租得到的卡里挑推理最强的一款，
// 和手动租卡同一套判断（比如中国公司 2023 年中只租得到 A800、H800，美国公司 2023 年初只有 A100）。一款都租不到返回 null。
function superRentGpu(s) {
  const ok = id => gpuRentable(id, s.date, s.company.country, s.flags.overseasRent);
  const first = bestRentGpu(s);
  return ok(first) ? first : Object.keys(GPUS).filter(ok).sort((x, y) => GPUS[y].infer - GPUS[x].infer)[0] || null;
}
// 超事件选项上的真实操作（data/super.js 的 action）：和手动操作走同一套命令，租卡配额、采购配额、现金、价格档照样卡。
// 只读：看选项时算一次给提示，确认时再算一次；做不到时返回 disabled 和原因。
export function superActionPlan(s, ch) {
  const a = ch.action;
  if (!a) return {};
  if (a.cmd === 'setTier') {
    const p = s.products[a.product];
    if (!p?.on) return { disabled: '还没开通 API' };
    const tiers = Object.keys(PRICE_TIERS), from = p.tier, tier = tiers[tiers.indexOf(from) + a.dir];
    if (!tier) return { disabled: `已经是最高的「${PRICE_TIERS[from].label}」档` };
    const now = previewService(s), next = previewService(s, { [a.product]: { tier } });
    return { from, tier, now, next, hint: `${PRICE_TIERS[from].label} → ${PRICE_TIERS[tier].label}，按现在的客户估 API 月收入 ${fmtMoney(now.revenue.api || 0)} → ${fmtMoney(next.revenue.api || 0)}` };
  }
  if (a.cmd === 'setInferShare') {
    const share = Math.min(a.max, Math.round((s.inferShare + a.add) * 100) / 100);
    if (share <= s.inferShare) return { disabled: `自用算力中的服务占比已经到 ${pctOf(a.max)} 上限` };
    return { share, hint: `自用算力中的服务占比 ${pctOf(s.inferShare)} → ${pctOf(share)}，训练算力相应减少` };
  }
  if (a.cmd === 'rentGpus') {
    const gpu = superRentGpu(s);
    if (!gpu) return { disabled: '现在租不到卡' };
    const left = gpuOrderInfo(s, gpu, true).left;
    if (!left) return { disabled: '这个月的租卡配额用完了' };
    // 按现在的负载：把负载压回 80% 左右还差多少推理能力。先扣掉这批开通前就会到的租卡、买卡订单（同一个月里刚租过就不重复租）；
    // 更晚才到的买卡（交货期一两个月到大半年）帮不上眼下这一阵，不扣，只在提示里说一句。
    // 再按“在这之上多租 64 张实际能多出多少”折成张数：健康度、量化或蒸馏分流、出租划走的卡都算进去。64 张起，受这个月剩下的租卡配额限制。
    const sv = previewService(s);
    const opens = addDays(s.day, RENT_LEAD);
    const onRoad = s.orders.filter(o => (o.kind === 'rent' || o.kind === 'gpu') && Object.hasOwn(GPUS, o.ref));
    const pending = onRoad.filter(o => o.eta <= opens);
    const coming = pending.reduce((sum, o) => sum + o.n, 0);
    const later = onRoad.reduce((sum, o) => sum + (o.eta > opens ? o.n : 0), 0);
    const ahead = serviceCapacity(withOrders(s, pending));
    const per = (serviceCapacity(withOrders(s, [...pending, { kind: 'rent', ref: gpu, n: 64 }])) - ahead) / 64;
    // 卖过卡以后出租张数还停在原来的数：新租的卡会先补给出租，推理能力一点不涨。
    if (!(per > 0)) return { disabled: '新租的卡会全部划去出租，推理能力不会变：先去「算力」页把出租张数调低' };
    const want = Math.ceil((sv.needGpu / 0.8 - ahead) / per / 64) * 64;
    const n = Math.min(left, Math.max(64, want));
    const monthly = monthlyCosts(withOrders(s, [{ kind: 'rent', ref: gpu, n }])).rented - monthlyCosts(s).rented;
    const road = [
      !coming ? '' : want < 64 ? `已有 ${coming} 张在路上，这批开通前就到，算上它们负载不到八成，可以先观望` : `已有 ${coming} 张在路上，这批开通前就到，张数已经扣掉了这些`,
      later ? `另有 ${later} 张要等这批开通以后才到，没算进去` : '',
    ].filter(Boolean).map(t => `；${t}`).join('');
    return { gpu, n, monthly, hint: `租 ${n} 张 ${gpuName(gpu)}，约 ${RENT_LEAD} 天后开通，每月租金多约 ${fmtMoney(monthly)}${road}` };
  }
  if (a.cmd === 'buyGpus') {
    const budget = s.cash * a.cashShare;
    // 现在买得到、这个季度还有配额的卡里，挑这笔钱能买到训练算力最多的一款（64 张一批）。
    const opts = Object.keys(GPUS).filter(id => gpuAvailable(id, s.date, s.company.country)).map(id => {
      const info = gpuOrderInfo(s, id);
      const n = Math.min(info.left, Math.floor(Math.max(0, budget) / info.price / 64) * 64);
      return { gpu: id, n, left: info.left, cost: n * info.price, eta: addDays(s.day, info.lead), flops: n * GPUS[id].flops };
    });
    if (!opts.length) return { disabled: '现在买不到卡' };
    if (!opts.some(o => o.left > 0)) return { disabled: '这个季度能买的卡，配额都用完了' };
    const best = opts.filter(o => o.n > 0).sort((x, y) => y.flops - x.flops)[0];
    if (!best) return { disabled: `现金不足：一成现金（${fmtMoney(Math.max(0, budget))}）买不起 64 张卡` };
    return { ...best, hint: `订购 ${best.n} 张 ${gpuName(best.gpu)}，付 ${fmtMoney(best.cost)}，预计 ${fmtDay(best.eta)} 到货` };
  }
  return { disabled: '这个操作现在做不了' };
}
