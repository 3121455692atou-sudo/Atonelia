// 在途订单：下单后按到货日排队，到期交付（显卡、租卡、数据）；
// 生成订单（规格 D7）：用自家推理卡或 API 老师生成蒸馏数据包、合成教材，按进度交付，可以暂停、恢复、取消。
import { GPUS } from '../data/core.js';
import { DATASET_BY_ID } from '../data/datasets.js';
import { GEN } from '../data/balance.js';
import { rand } from './util.js';
import { addDays, daysBetween } from './clock.js';
import { SMUGGLE_SEIZE } from '../data/supply.js';
import { deliverData, applyDistill, deliverSynth, normalizeDistill } from './data_ops.js';
import { genPlan, genBudget } from './model.js';
import { log } from './log.js';
import { P } from './provider.js';

export function addOrder(s, o) {
  s.orders.push({ placed: s.day, ...o });
  s.orders.sort((a, b) => a.eta.localeCompare(b.eta));
}
export function dailyOrders(s, out) {
  // 先拒绝旧结构，不能在抛错之前删除订单或推进另一张生成单。
  if (s.orders.some(o => o.kind === 'distill' && !o.gen || o.gen?.stalled === true)) throw Error('不支持旧版生成订单，请新开一局');
  genTick(s, out);
  // 到期的普通订单（生成订单按进度交付，不看 eta）。顺序照到货日。
  for (let i = 0; i < s.orders.length;) {
    const o = s.orders[i];
    if (o.gen || !(o.eta <= s.day)) { i++; continue; }
    s.orders.splice(i, 1);
    const label = o.ref && GPUS[o.ref] ? GPUS[o.ref].label.replace(/（.*?）/, '') : '';
    if (o.kind === 'gpu' || o.kind === 'smuggle') {
      if (o.kind === 'smuggle' && rand(s) < SMUGGLE_SEIZE) {
        out.notes.push(`${o.n} 张 ${label} 在转运途中被海关扣下，钱打了水漂。`);
        log(s, `走私的 ${o.n} 张 ${label} 在途中被扣`);
        continue;
      }
      s.gpus.owned[o.ref] = (s.gpus.owned[o.ref] || 0) + o.n;
      if (o.kind === 'smuggle') s.gray.owned[o.ref] = (s.gray.owned[o.ref] || 0) + o.n;
      out.notes.push(`到货：${o.n} 张 ${label}。`);
      log(s, `${o.n} 张 ${label} 到货`);
    } else if (o.kind === 'rent') {
      s.gpus.rented[o.ref] = (s.gpus.rented[o.ref] || 0) + o.n;
      out.notes.push(`云上新租的 ${o.n} 张 ${label} 开通了。`);
    } else if (o.kind === 'data') {
      const ds = DATASET_BY_ID[o.ref];
      if (!ds) { log(s, `数据「${o.name || o.ref}」已经下架，这一单作废`); continue; }
      deliverData(s, ds);
      out.notes.push(`数据到位：${ds.name}。`);
      log(s, `数据到位：${ds.name}`);
    }
  }
}

// ---------- 生成订单 ----------
const findGen = (s, oid) => s.orders.find(o => o.gen && o.id === oid) || null;
// 按现在的卡估还要几天（界面、eta 用）。暂停时按“现在恢复”估。
export function genLeftDays(s, o) {
  const g = o.gen;
  if (g.mode === 'api') return Math.max(0, g.days - g.elapsed);
  const minLeft = Math.max(0, GEN.minDays - g.elapsed);
  if (g.done >= g.need) return Math.max(minLeft, GEN.cleanupDays - g.cleanup);
  const budget = genBudget(s);
  if (!(budget > 0) || budget < g.nMin) return Infinity;
  return Math.max(minLeft, Math.ceil(GEN.cleanupDays + (g.need - g.done) / (24 * budget)));
}
// 完成比例 f：API 按已经扣的钱。自家卡和蒸馏小模型（projectProgress）同一口径，算力和流程下限取小的：
// f = min(算完的比例, 已走天数 ÷ (已走天数 + 至少还要的流程天数))，至少还要的流程天数 = max(7 天下限还差几天, 收尾还差几天)。
// 所以算力一天跑完也要走满 7 天才拿全，收尾那 3 天也不算满；f = 1 只在正常交付那天出现。
export const genProgress = o => {
  const g = o.gen;
  if (!g) return 0;
  if (g.mode === 'api') return g.cost > 0 ? Math.min(1, g.paid / g.cost) : Math.min(1, g.elapsed / Math.max(1, g.days));
  const fc = g.need > 0 ? Math.min(1, g.done / g.need) : 1;
  const rest = Math.max(GEN.minDays - g.elapsed, GEN.cleanupDays - (fc >= 1 ? g.cleanup : 0));
  return rest > 0 ? Math.min(fc, g.elapsed / (g.elapsed + rest)) : fc;
};
function deliverGen(s, o, f, out) {
  s.orders = s.orders.filter(x => x !== o);
  if (o.kind === 'data') deliverSynth(s, o, f);
  else applyDistill(s, o, f);
  const part = f < 1 ? `（只拿到 ${Math.round(f * 100)}%）` : '';
  out?.notes.push(`${o.kind === 'data' ? '数据到位' : '蒸馏数据到位'}：${o.name}${part}。`);
  log(s, `${o.kind === 'data' ? '生成完成' : '蒸馏数据到位'}：${o.name}${part}`);
}
// 每天推进（dailyOrders 里先做）：暂停的不动；自家卡的单按今天分到的卡算，排在前一张后面或放不下老师时当天不推进
// （g.stalled 记原因：'queue' | 'nofit'，在跑时为 false）；算完了再收尾 3 天，总共不少于 7 天。
// API 的单按天扣钱，满 GEN.apiDays 天交付。暂停满 GEN.nagDays 天提醒一次。
function genTick(s, out) {
  if (!s.orders.some(o => o.gen)) return;
  normalizeDistill(s);
  const plan = genPlan(s);
  for (const o of [...s.orders]) {
    const g = o.gen;
    if (!g) continue;
    if (g.paused) {
      if (!g.nagged && daysBetween(g.paused, s.day) >= GEN.nagDays) {
        g.nagged = true;
        s.queue.push({ kind: 'notice', title: '生成订单停了一个月', text: `「${o.name}」已经暂停 ${GEN.nagDays} 天了。订单不会自己恢复，也不会自己作废：推理卡空出来了就恢复它，确实不要了就取消（完成 ${Math.round(GEN.cancelKeep * 100)}% 以上的部分照样入库）。` });
      }
      continue;
    }
    g.elapsed += 1;
    if (g.mode === 'api') {
      // 自洽里转成正规授权的单（M.5.2）中途涨了价：剩下的钱摊到剩下的天数里付完。史实模式没有这种单，照原来的日均付。
      const pay = o.licensed ? Math.max(0, g.cost - g.paid) / Math.max(1, g.days - g.elapsed + 1)
        : Math.min(Math.max(0, g.cost - g.paid), g.cost / Math.max(1, g.days));
      s.cash -= pay;
      g.paid += pay;
      // 自洽和联机：钱付给老师那家（收盘入账六成），同时记下今天抽走的量，收盘时按它掷检测（M.5.2）。
      if (pay > 0) P().apiDistillDay(s, o, pay);
      if (g.elapsed >= g.days) { g.paid = g.cost; deliverGen(s, o, 1, out); continue; }
    } else {
      if (g.done < g.need) {
        const n = plan.use[o.id] ?? 0;
        if (n > 0) { g.done = Math.min(g.need, g.done + 24 * n); g.stalled = false; } else {
          // 停着的原因（genPlan 的 wait）：排在前一张后面，或者推理卡放不下老师。原因变了才再提醒一次。
          const why = plan.wait?.[o.id] === 'queue' ? 'queue' : 'nofit';
          if (g.stalled !== why) {
            g.stalled = why;
            out.notes.push(why === 'queue' ? `「${o.name}」：排在前一张后面，等它跑完（同一时间只跑一张生成单）。`
              : `「${o.name}」：推理卡放不下老师（至少要 ${g.nMin} 张 H100 的显存），先停着。把推理份额调高、或者添卡就能接着跑。`);
          }
        }
      } else g.cleanup += 1;
      if (g.done >= g.need && g.cleanup >= GEN.cleanupDays && g.elapsed >= GEN.minDays) { deliverGen(s, o, 1, out); continue; }
    }
    const left = genLeftDays(s, o);
    o.eta = addDays(s.day, Number.isFinite(left) ? Math.max(1, Math.min(left, 999)) : 999);
  }
}
// 暂停：随时可以，卡当天还给推理。
export function pauseGen(s, oid) {
  const o = findGen(s, oid);
  if (!o) throw new Error('没有这张生成订单');
  if (o.gen.paused) throw new Error('这张订单已经暂停了');
  o.gen.paused = s.day;
  o.gen.nagged = false;
  log(s, `暂停生成：${o.name}`);
  return { kind: 'gen', order: o, note: `「${o.name}」暂停了，借的推理卡今天就还回去。` };
}
// 恢复：随时可以，不排队。
export function resumeGen(s, oid) {
  const o = findGen(s, oid);
  if (!o) throw new Error('没有这张生成订单');
  if (!o.gen.paused) throw new Error('这张订单没有暂停');
  o.gen.paused = null;
  o.gen.nagged = false;
  const left = genLeftDays(s, o);
  o.eta = addDays(s.day, Number.isFinite(left) ? Math.max(1, Math.min(left, 999)) : 999);
  log(s, `恢复生成：${o.name}`);
  return { kind: 'gen', order: o, note: `「${o.name}」接着跑了。` };
}
// 取消：随时可以，卡当天释放。完成比例 ≥ GEN.cancelKeep 时按比例入库（数据包等级、token 数都乘这个比例），不到就作废。
// 自家卡生成没有钱可退（成本是少卖的推理）；API 未扣的部分不再扣，已扣的不退。
// 合成教材一份只能买一次：按比例入库以后就算用掉了（照旧“已经拥有”）；只有作废时才能重新下单。
export function cancelGen(s, oid) {
  const o = findGen(s, oid);
  if (!o) throw new Error('没有这张生成订单');
  const f = genProgress(o);
  if (f >= GEN.cancelKeep) {
    deliverGen(s, o, f, null);
    log(s, `取消生成：${o.name}，完成的 ${Math.round(f * 100)}% 入库`);
    const used = o.kind === 'data' ? '这份教材就算用掉了，不能再下单。' : '';
    return { kind: 'gen', order: o, kept: f, note: `「${o.name}」取消了，已经完成的 ${Math.round(f * 100)}% 入库。${used}` };
  }
  if (o.kind === 'data') s.data.acquired = s.data.acquired.filter(id => id !== o.ref);
  s.orders = s.orders.filter(x => x !== o);
  log(s, `取消生成：${o.name}，只完成 ${Math.round(f * 100)}%，作废`);
  return { kind: 'gen', order: o, kept: 0, note: `「${o.name}」取消了。只完成了 ${Math.round(f * 100)}%，不到 ${Math.round(GEN.cancelKeep * 100)}%，这一单作废。` };
}
