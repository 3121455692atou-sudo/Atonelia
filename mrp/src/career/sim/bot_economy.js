// Shared economic decisions use only leaf simulation APIs, never the engine barrel.
import {GPUS,PRICE_TIERS,gpuAvailable} from '../data/core.js';
import {bestRentGpu,gpuOrderInfo,buyGpu} from './compute.js';
import {fundingOffers,startFunding,borrowLimit,borrow,ipoCheck,startIpo} from './capital.js';
import {setProduct,setTier} from './service.js';
import {previewService} from './economy.js';
import {grantsFor} from './naming.js';
import {P} from './provider.js';
// Shared NPC economics, with an optional conservative single-player automation budget.
export function economicOps(s, options = {}) {
  const sv = s.service.last;
  let budget = options.budget ?? Infinity;
  const spend = amount => { budget -= amount; options.onSpend?.(amount); };
  // 负载高就加租（同一个月只租一次，等卡开通）。
  if (sv && sv.util > 0.8 && s.flags.botRentAt !== s.date) {
    const g = bestRentGpu(s);
    const per = GPUS[g].infer * s.inferShare;
    let n = Math.max(32, Math.ceil(((sv.needGpu - sv.capGpu * 0.75) / Math.max(per, 0.05)) / 32) * 32);
    if (options.budget !== undefined) n = Math.min(n, Math.floor(budget / Math.max(1,gpuOrderInfo(s,g,true).price * 8) / 32) * 32);
    if (n > 0 && s.cash > n * GPUS[g].rent * 8) { try { buyGpu(s, g, n, true); spend(n * gpuOrderInfo(s,g,true).price * 8); s.flags.botRentAt = s.date; } catch { /* 租不到就算了 */ } }
  }
  // 资本：现金撑不过一年半就融资；手里钱多就扩充训练算力（每半年最多一次）。
  const last = s.history.at(-1);
  const burn = Math.max(1, (last?.costs || 0) - (last?.revenue || 0));
  if (s.company.kind !== 'division' && !s.capital.round && s.cash < burn * 18) {
    // 有战略投资报价就先拿它（还附带一年的租卡折扣）；上市以后改成增发 10%（规格 K4）。
    const offers = fundingOffers(s);
    const offer = offers.find(o => o.strategic) || offers.find(o => o.dilution === (s.capital.listed ? 0.1 : 0.15));
    if (offer) { try { startFunding(s, offer.dilution); } catch { /* 谈不成 */ } }
    // 融资谈不了（泡沫、冷却）又撑不过半年：拿显卡抵押借钱，借够半年的开销。
    else if (s.cash < burn * 6 && borrowLimit(s) > 0) { try { borrow(s, burn * 6 - Math.max(0, s.cash)); } catch { /* 借不到 */ } }
  }
  // 真人掉线后的被动托管不是 IPO 授权；只保留 NPC / 校准机器人的原上市策略。
  if ((options.allowIpo || P().world?.companies?.[s.charId]?.kind !== 'human') && ipoCheck(s).ok && P().gate('botIpo', s)) { try { startIpo(s); } catch { /* 条件变化 */ } }
  if (!s.flags.botGpuAt || s.monthsPlayed - s.flags.botGpuAt >= 6) {
    const covered = (last?.revenue || 0) >= (last?.costs || 0) * 0.3;
    const gpuBudget = s.company.kind === 'division' ? s.cash * 0.25 : s.company.tier === 'small' && !covered ? 0 : s.cash - burn * 12;
    const g = ['Rubin', 'B300', 'B200', 'H200', 'H100', 'Ascend950', 'Ascend910C', 'H20', 'Ascend910B', 'A100'].find(id => gpuAvailable(id, s.date, s.company.country));
    if (g && gpuBudget > GPUS[g].price * 512) {
      const n = Math.min(8192, Math.floor(gpuBudget * 0.5 / GPUS[g].price / 256) * 256, Math.floor(budget / Math.max(1,gpuOrderInfo(s,g).price) / 256) * 256);
      if (n >= 256) { try { const order=buyGpu(s, g, n); spend(order.cost); s.flags.botGpuAt = s.monthsPlayed; } catch { /* 现金不足或配额用完 */ } }
    }
  }
  for (const pid of Object.keys(s.products)) {
    if (pid !== 'gpu_lease' && !s.products[pid].on) { try { setProduct(s, pid, { on: true }); } catch { /* 条件不够 */ } }
  }
  // 定价：新产品上线后，按当前模型和对手把档位调到“收入 − 推理成本”最高的一档，每月最多算一次。
  // 机器人以前一直停在开局那时史实发布的价格档，模型换代、对手变强以后也不会调，白白漏掉收入。
  // 正常公司会跟着自己的竞争力定价：卖得动才提价，卖不动就降到普惠档走量；这里用服务预览逐档试算，不写死某家公司。
  const month = s.date.slice(0, 7);
  if (s.flags.botPriceMonth !== month) {
    s.flags.botPriceMonth = month;
    for (const pid of Object.keys(s.products)) {
      const p = s.products[pid];
      if (pid === 'gpu_lease' || !p.on) continue;
      let best = p.tier || 'standard', bestVal = -Infinity;
      for (const tier of (pid === 'api' && grantApiTiers(s)) || Object.keys(PRICE_TIERS)) {
        // 预览不改状态，也不动随机数；只比这一个产品的档位，其他产品保持现状。
        const pv = previewService(s, { [pid]: { tier } });
        const val = (pv.revenue?.[pid] || 0) - (pv.serve || 0);
        if (val > bestVal) { bestVal = val; best = tier; }
      }
      if (best !== p.tier) { try { setTier(s, pid, best); } catch { /* 档位没变或条件不够 */ } }
    }
  }
}

// 手里还有效的授名在世界条件里规定了 API 价格档（GPT-4o、Claude 3.5 Sonnet 要普惠或标准档）：定价时 API 只在这些档里挑，
// 像真实公司为那一代旗舰主动降价（A10 授名时机：电脑会去满足手里授名的条件）。授名用掉、作废或过期以后照常按贡献定价。
// 几条授名都有要求时取交集；交集为空就不限制。
function grantApiTiers(s) {
  let allowed = null;
  for (const hn of [...grantsFor(s, 'flagship'), ...grantsFor(s, 'small')]) {
    const t = hn.world?.service?.apiTier;
    if (!t) continue;
    const list = Array.isArray(t) ? t : [t];
    allowed = allowed ? allowed.filter(x => list.includes(x)) : list;
  }
  return allowed?.length ? allowed : null;
}

