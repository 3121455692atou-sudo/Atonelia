// 按天推进：走一天（tickDay）、到期的计时器（dueTick）、排在某天的新闻和事件、月度结算（monthClose）、新的一个月（startOfMonth）；
// 还有做决定的总入口 decide，和按月推进的老接口 act、runMonth（测试和自动对局用）。
import { END, START_RESOURCES, TECHS, fmtDate } from '../data/core.js';
import { BENCHMARKS } from '../data/benchmarks.js';
import { FAMILIES, RELEASES } from '../data/rivals.js';
import { clamp, rand } from './util.js';
import { monthOf, addDays, dayInMonth } from './clock.js';
import { quarterOf } from '../data/supply.js';
import { workingModel } from './model.js';
import { researchTick, knowTick } from './research.js';
import { P, relId } from './provider.js';
import { simulateService, monthlyCosts, monthlyDepreciation, accrueComputeDay, updateValuation, hypeIndex } from './economy.js';
import { bubbleTick } from './bubble.js';
import { capitalProcesses, loanMonth, millenniumCheck } from './capital.js';
import { doAcquire } from './data_ops.js';
import { conditionalEvents } from './events.js';
import { finish } from './finish.js';
import { postTick, baseTick, idleTick, jobOp, smallModels } from './jobs.js';
import { submitEval, cancelEval, evalTick, defaultTier } from './evals.js';
import { legalTick } from './legal.js';
import { log } from './log.js';
import { dailyOrders } from './orders.js';
import { milestoneFire, admit, closePopupDay } from './queue.js';
import { doEval, dailyDeploy } from './release.js';
import { updateReputation, serviceDynamics } from './reputation.js';
import { serviceDue } from './service.js';
import { checkSuperEvents } from './super.js';
import { applyWorldEvent, benchRefresh, releaseNews } from './world.js';
import { labelOnRival, kinTick, isMine, qOf } from './sota.js';
import { judgeDeferred } from './expect.js';
import { strategyTick, expireSpirits } from './strategy.js';
import { routeTick } from './route.js';
import { exclusiveMonth } from './exclusive.js';

// 按天推进：一天是一个月的 1/30，按月写的数值摊到每天时乘它。
export const DAY = 1 / 30;

function assertCanAct(s) {
  if (s.status !== 'playing') throw new Error('游戏已经结束');
  if (P().queueBlocks && s.queue.length) throw new Error('请先处理眼前的事件');
}
// 做一个决定，不推进时间。
export function decide(s, action, arg = {}) {
  assertCanAct(s);
  if (action === 'data') return doAcquire(s, arg.id);
  if (action === 'eval') return doEval(s, arg.bench, arg);
  // 送评（T6.2）：modelId 不给就是主线在练模型（role: 'small' 是第一个待发布的小模型）；tier 不给按默认档。跳过评测当天发布，返回发布结果。
  if (action === 'submit') {
    const modelId = arg.modelId ?? (arg.role === 'small' ? smallModels(s)[0]?.id : s.working) ?? null;
    return submitEval(s, { modelId, tier: arg.tier ?? defaultTier(s), opts: arg });
  }
  if (action === 'cancelEval') return cancelEval(s, arg.id);
  // 作业操作（界面和顾问用）：{ op: 'start' | 'cancel' | 'pause' | 'prio' | 'cap' | 'post' | 'rush' | 'repair' | 'autoRepair' | 'focusResearch' | 'plan', … }。
  if (action === 'job') return jobOp(s, arg);
  throw new Error('未知行动');
}

// ---------- 按天推进 ----------
// 走一天。眼前有事件要处理时不走（界面会暂停）；跨月时做月度结算。返回这一天发生的事。
export function tickDay(s) {
  if (s.status !== 'playing' || (P().queueBlocks && s.queue.length)) return null;
  // 今天的卡都处理完了：推进途中触发的卡到明天才弹，算明天的名额（规格 E4“同一天最多弹 1 张”）。
  closePopupDay(s);
  const out = { day: s.day, notes: [] };
  // 今天到期的计时器先结算（备案、融资、上市出结果，下架的对话产品重新上架）。
  dueTick(s, out);
  // AI 泡沫的检查点（规格 K5）：史实局在固定日期判一次；自洽和联机由世界收盘判。
  bubbleTick(s);
  // 先按今天一早的卡和分配记一天的算力账（租金、运维、出租收入、推理能力）。
  accrueComputeDay(s);
  postTick(s, out);
  knowTick(s, 1);
  for (const d of researchTick(s, 1)) {
    out.notes.push(`研究完成：${d.tech.name}${d.first ? '（业界还没人公开过，是你们自己摸索出来的）' : ''}。`);
    log(s, `研究完成：${d.tech.name}${d.first ? '（首创）' : ''}`);
    milestoneFire(s, { on: 'tech', tech: d.tech.id, first: d.first });
  }
  // v1.0 的每日钩子（P0.3a 预埋，存根阶段什么都不做）：公司策略推进（P2.2），delayed 路线的旧代开放（P1.3）。
  strategyTick(s, out);
  routeTick(s, out);
  // 同集团别的模态换手的新闻、局内“集团出过 SOTA”（规格 D10.5）。
  kinTick(s, out);
  baseTick(s, out);
  dailyOrders(s, out);
  // 评完的候选当天发布（T6.2），排在灰度结算之前；发布结果放进 out.releases。
  evalTick(s, out);
  dailyDeploy(s, out);
  idleTick(s);
  const next = addDays(s.day, 1);
  if (monthOf(next) !== s.date) {
    const before = s.queue.length;
    out.report = monthClose(s);
    out.report.notes.unshift(...out.notes);
    // 月结时触发的事件散落到下个月的头三周，不全挤在 1 号（放出来那天再过弹窗名额）。
    const fresh = s.queue.splice(before).filter(Boolean);
    for (const item of fresh) {
      if (item.kind === 'notice' || item.kind === 'board') s.queue.push(item);
      else s.scheduled.push({ at: addDays(next, Math.floor(rand(s) * 20)), item });
    }
    if (s.status !== 'playing') return out;
    if (s.date >= END) { finish(s, 'complete'); return out; }
    s.date = monthOf(next);
    s.day = next;
    startOfMonth(s, false);
  } else s.day = next;
  releaseScheduled(s);
  return out;
}
// 排在今天或之前的新闻、行业大事和事件放出来。
export function releaseScheduled(s) {
  if (!s.scheduled.length) return;
  const due = s.scheduled.filter(x => x.at <= s.day).sort((a, b) => a.at.localeCompare(b.at));
  if (!due.length) return;
  s.scheduled = s.scheduled.filter(x => x.at > s.day);
  for (const x of due) releaseDue(s, x);
  if (s.news.length > 100) s.news.length = 100;
}
function later(s, at, entry) { if (at <= s.day) releaseDue(s, entry); else s.scheduled.push({ at, ...entry }); }
// 排期里到日子的一项放出来（和 release.js 导出的发布流程 releaseNow 不是一回事，P2.4a 改名免得混淆）。
function releaseDue(s, entry) {
  // 挂在某款发布上的技术公开（TECH_SRC 第 5 列，规格 D2）：发布新闻已经在了就并进去，同一件事只发一条。
  const rn = entry.techrel ? releaseNews(s, P().relById(relId(entry.techrel)) || {}) : null;
  if (rn && entry.news) {
    rn.detail = `${rn.detail ? `${rn.detail}。` : ''}${entry.technote}：${entry.news.detail}`;
    (rn.techs ??= []).push(entry.techsrc[0]);
  } else if (entry.news) s.news.unshift(entry.news);
  else if (entry.world) applyWorldEvent(s, P().worldEvent(entry.world));
  // 排期里的卡片（月结散到下个月的、被挤下来顺延的）和当天弹的卡共用名额（queue.js 的 admit）。
  else if (entry.item) admit(s, entry.item);
  // 对手发布变为可见的这一天：先过 SOTA 标签（P1.1），场地第一次凑满时补评市场期待（P3.E），再看里程碑。
  // 标签换手的那句话并进这条发布的新闻，同一件事只发一条（规格 D10.3）。
  if (entry.rel) {
    const rel = P().relById(relId(entry.rel));
    if (rel) {
      const lab = labelOnRival(s, rel);
      if (lab.text) {
        if (entry.news) entry.news.detail = `${entry.news.detail ? `${entry.news.detail}。` : ''}${lab.text}`;
        else s.news.unshift({ date: s.date, day: s.day, type: 'sota', title: lab.text, family: rel.family });
      }
      if (lab.filled) judgeDeferred(s);
      if (!P().isNpc(rel.family)) milestoneFire(s, { on: 'rival', rel });
    }
  }
  if (entry.techsrc) { const [tech, fam, level, note] = entry.techsrc; if (level !== 'proof') milestoneFire(s, { on: 'rivaltech', tech, fam, level, note }); }
}

// ---------- 计时器 ----------
// 计时器和冷却都存到期日（s.due、s.cool，'YYYY-MM-DD'），到期日当天一早结算；到期日之前一律按“还在生效”算（判断写 s.due.k > s.day）。
// 有结果的几项（备案、对话产品下架、融资、上市）由各自的模块结算；其余到期的直接删掉。
function dueTick(s, out) {
  const due = (s.due ??= {}), cool = (s.cool ??= {});
  serviceDue(s, out);
  capitalProcesses(s, out);
  for (const bag of [due, cool]) for (const k of Object.keys(bag)) if (!(bag[k] > s.day)) delete bag[k];
}

// ---------- 月度结算 ----------
// 每月最后一天结一次账：服务收入、成本、口碑、估值、官司、条件事件。
function monthClose(s) {
  const report = { date: s.date, notes: [] };
  // 账单和推理能力都读这个月的逐日账本。
  const sv = simulateService(s, { settle: true });
  // 严格防蒸馏的月费已经算在 monthlyCosts 里（规格 B3）。
  const costs = monthlyCosts(s, { settle: true });
  const revenue = sv.total || 0;
  // 规格 K2：现金扣推理成本，不扣折旧（买卡时已经付过）；经营利润再减折旧。
  const serve = sv.serve || 0;
  const dep = monthlyDepreciation(s);
  s.cash += revenue - costs.total - serve;
  // 显卡抵押贷款的利息和追加（规格 K4）：利息进经营利润。
  const interest = loanMonth(s, report);
  costs.interest = interest;
  report.revenue = revenue;
  report.costs = costs;
  report.serve = serve;
  report.dep = dep;
  report.profit = revenue - costs.total - serve - dep - interest;
  report.service = sv;
  s.service.hist429.push(sv.r429);
  if (s.service.hist429.length > 6) s.service.hist429.shift();
  s.service.lastR429 = sv.r429;
  updateReputation(s, sv);
  serviceDynamics(s, sv);
  s.hype = hypeIndex(s);
  updateValuation(s, revenue);
  legalTick(s, report);
  s.health = clamp(s.health + 4, 0, 100);
  // 这个月大半时间在训练算加班；连续加班几个月，士气会掉。研究交流做得多，士气回升。
  s.trainStreak = s.mstat.train >= 20 ? s.trainStreak + 1 : 0;
  if (s.trainStreak >= 4 && s.morale > -2 && rand(s) < 0.35) { s.morale -= 1; report.notes.push('团队连续加班几个月，状态下滑。'); }
  if (s.mstat.research >= 15 && s.morale < 2) s.morale += 1;
  s.mstat = { train: 0, research: 0 };
  for (const k of Object.keys(s.quota)) if (!k.startsWith(quarterOf(s.date)) && !k.endsWith(s.date)) delete s.quota[k];
  const r0 = v => Math.round(v || 0);
  s.history.push({ date: s.date, revenue, costs: costs.total + serve + interest, serve: Math.round(serve), dep: Math.round(dep), profit: Math.round(report.profit), cash: s.cash, users: sv.users || 0, r429: sv.r429, valuation: s.valuation, rep: s.rep, util: sv.util, tokens: sv.tokens || 0, share: sv.share?.chat ?? sv.share?.subscription ?? sv.share?.api ?? 0,
    rev: Object.fromEntries(Object.entries(sv.revenue || {}).map(([k, v]) => [k, r0(v)])), cost: { staff: r0(costs.staff), owned: r0(costs.owned), rented: r0(costs.rented), rd: r0(costs.rd), serve: r0(serve), other: r0(costs.legal + (costs.risk || 0) + interest) } });
  if (s.history.length > 60) s.history.shift();
  conditionalEvents(s, sv, report);
  // 虚构的“千禧年难题”（规格 K4）：按（公司、月份）散列判，不动随机数。
  millenniumCheck(s, report);
  milestoneFire(s, { on: 'month' });
  // v1.0 的月结钩子（P0.3a 预埋）：专属事件按月检查（P2.2），到期的公司特质删掉。
  exclusiveMonth(s, report);
  expireSpirits(s, report);
  if (s.seen.runway > 0) s.flags.minVal = Math.min(s.flags.minVal ?? s.valuation, s.valuation);
  if (s.status === 'playing') checkSuperEvents(s, sv);
  s.monthsPlayed += 1;
  return report;
}

// ---------- 新的一个月 ----------
// 一条对手发布的排期项：发布那天放出新闻，并按 rel 过 SOTA 标签和里程碑（读旧档时 sota 迁移也用它补排期）。
export function releaseEntry(r) {
  return { news: { date: r.date, day: r.day, type: 'release', title: `${FAMILIES[r.family].company} 发布 ${r.name}`, detail: `${r.open ? '开源权重' : '闭源'} · ${{ frontier: '前沿规模', large: '大型', mid: '中型', small: '轻量' }[r.cls]}`, family: r.family }, rel: r.name };
}
export function startOfMonth(s, first = false) {
  const date = s.date;
  // 对手发布按真实发布日放出（规格 D2，r.day）；同一天的按综合分从高到低排，SOTA 标签逐条处理（D10.2）。行业大事和历史时刻落到当月的某一天。
  const due = P().scheduleRivals ? RELEASES.filter(x => x.date === date && !isMine(s, x.family)).sort((a, b) => a.day.localeCompare(b.day) || qOf(b.mod, b.dims) - qOf(a.mod, a.dims) || a.ord - b.ord) : [];
  for (const r of due) later(s, r.day, releaseEntry(r));
  // 别家（或学界）公开一项技术：有了论文或开源代码，照着学会快很多。
  for (const t of TECHS.filter(x => x.mod === s.mod && !x.start)) {
    for (const [d, fam, level, note, rel] of P().techSources(t.id) || []) {
      if (d !== date || (fam !== 'academia' && isMine(s, fam))) continue;
      // rel：这次公开挂在某款发布上（同月）：挂到发布那天，放出时并进那条发布新闻（规格 D2，和行业大事一样）。
      const r = rel ? P().relById(relId(rel)) : null;
      const onRel = !!r && r.date === date && !isMine(s, r.family);
      const at = onRel ? r.day : dayInMonth(date, `${t.id}|${fam}`);
      const who = fam === 'academia' ? '学界' : FAMILIES[fam]?.company || fam;
      later(s, at, { news: { date, day: at, type: 'tech', title: `${who}：${note}`, detail: `「${t.name}」${{ proof: '有人做出来了，方法没公开', paper: '的论文公开了，照着学会快不少', open: '开源了，可以直接照着学' }[level]}。` }, techsrc: [t.id, fam, level, note],
        ...(onRel ? { techrel: r.name, technote: note } : {}) });
    }
  }
  for (const w of P().worldEvents(date)) later(s, dayInMonth(date, w.id), { world: w.id });
  for (const b of BENCHMARKS.filter(x => x.mod === s.mod && (x.refresh || []).includes(date))) benchRefresh(s, b);
  if (s.company.kind === 'division' && date.endsWith('-01') && !first) {
    const perf = clamp(0.7 + (s.rep - 50) / 80 + (s.history.slice(-12).reduce((a, x) => a + x.revenue, 0) > 0 ? 0.2 : 0), 0.5, 1.8);
    s.queue.push({ kind: 'event', id: 'budget', params: { budget: Math.round(START_RESOURCES.bigtech[s.scenario].cash * perf / 1e7) * 1e7 } });
  }
  for (const g of s.goals) if (g.status === 'pending' && g.date === date && g.check.type !== 'final') s.queue.push({ kind: 'board', id: g.id });
  if (s.news.length > 100) s.news.length = 100;
  if (first && !workingModel(s)) s.queue.unshift({ kind: 'notice', title: '从零开始', text: `${fmtDate(date)}。你们还没有自己的模型。先在「后台 → 训练」里立项：定好总参数、激活参数、架构和训练 token 数。立项以后预训练按天推进，进度条在主界面上。底座练好以后，在训练页给它挂上后训练；练够两周就可以送评，评完自动发布。` });
}
