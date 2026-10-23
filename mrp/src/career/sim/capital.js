// 资本：股票交易、融资、上市，以及到期结算进行中的融资和上市流程（到期日存在 s.due.funding、s.due.ipo）。
import { clamp, rand, fmtMoney, hash01 } from './util.js';
import { applyEffects } from './effects.js';
import { addDays, daysBetween } from './clock.js';
import { liveModel, peerCls } from './model.js';
import { qOf, rivalStandings } from './sota.js';
import { tickerPrice, fx } from './economy.js';
import { log } from './log.js';
import { P } from './provider.js';
import { customerRevenue, CUSTOMER_KEYS } from '../world/valuation.js';
import { quarterOf } from '../data/supply.js';
import { FOLLOW_ON, FUNDING } from '../data/economy.js';
import { GPUS } from '../data/core.js';
import { bubbleActive, bubbleDaysLeft, bubbleMult } from './bubble.js';

export function trade(s, ticker, usd) {
  if (!Number.isFinite(usd) || usd === 0) throw new Error('交易金额必须是不为 0 的数');
  // 自洽和联机：股票是本局上市的公司，走世界的交易所（M.5.5）；下面是史实模式的真实股票。
  if (P().mode !== 'history') return P().trade(s, ticker, usd, null);
  const price = tickerPrice(ticker, s.date) * fx(ticker);
  if (!price) throw new Error('没有这只股票');
  const h = s.market.holdings;
  if (usd > 0) {
    if (usd > s.cash) throw new Error('现金不足');
    s.cash -= usd;
    h[ticker] = (h[ticker] || 0) + usd / price;
    s.market.cost[ticker] = (s.market.cost[ticker] || 0) + usd;
  } else {
    const shares = Math.min(h[ticker] || 0, -usd / price);
    // 手里没有这只股票：什么都不改（以前会把持仓写成 NaN）。
    if (!shares) return;
    const ratio = (h[ticker] || 0) > 0 ? shares / h[ticker] : 0;
    s.cash += shares * price;
    s.market.cost[ticker] = (s.market.cost[ticker] || 0) * (1 - ratio);
    h[ticker] -= shares;
    if (h[ticker] < 1e-6) { delete h[ticker]; delete s.market.cost[ticker]; }
  }
}
// 现在为什么谈不了融资（界面写原因）；能谈时为 null。
export function fundingBlock(s) {
  if (s.company.kind === 'division') return '集团内部的团队不能单独融资';
  if (s.capital.round) return '这一轮还在谈';
  // AI 泡沫破裂后 180 天内谈不成任何融资（规格 K5）。
  if (bubbleActive(s)) return `AI 泡沫破裂后投资人都收手了（还要 ${bubbleDaysLeft(s)} 天）`;
  // 两轮之间至少隔 180 天（规格 K4）。
  const last = s.capital.lastRoundDay;
  if (last && daysBetween(last, s.day) < FUNDING.COOLDOWN) return `上一轮刚结束，${FUNDING.COOLDOWN - daysBetween(last, s.day)} 天后才能再谈`;
  if (s.capital.listed && P().mode !== 'history') return '上市以后在交易所增发';
  return null;
}
// 重大成果带来的融资加成（规格 K4）：{ mult, why, until } | null。
export const fundBoost = s => (s.flags?.fundBoost && s.flags.fundBoost.until > s.day ? s.flags.fundBoost : null);
export function noteBreakthrough(s, kind) {
  const B = FUNDING.BOOST;
  const next = kind === 'millennium' ? { mult: B.millennium, why: '证明了一个千禧年难题', until: addDays(s.day, B.millenniumDays) }
    : { mult: B.sota, why: '刚拿下 SOTA', until: addDays(s.day, B.sotaDays) };
  const cur = fundBoost(s);
  if (!cur || next.mult >= cur.mult) s.flags.fundBoost = next;
  return s.flags.fundBoost;
}
// 战略投资（规格 K4）：大公司每年一次，出让 10%，之后一年租卡 85 折。
function strategicOk(s) {
  const X = FUNDING.STRATEGIC;
  const tier = P().tierOf(s) || s.company.tier;
  const last = s.capital.lastStrategic;
  return !s.capital.listed && X.tiers.includes(tier) && s.valuation >= X.minVal && !(last && daysBetween(last, s.day) < X.every);
}
export function fundingOffers(s) {
  if (fundingBlock(s)) return [];
  const k = fundBoost(s)?.mult ?? 1;
  const offer = (d, extra = {}) => ({ dilution: d, amount: Math.round(s.valuation * k * d / (1 - d)), pre: s.valuation * k, ...extra });
  // 上市以后（史实模式）照样能增发，比例小一些（规格 K4）；自洽和联机的上市公司走交易所的增发命令。
  if (s.capital.listed) return FOLLOW_ON.map(d => offer(d, { followOn: true }));
  return [...[0.08, 0.15, 0.22].map(d => offer(d)), ...(strategicOk(s) ? [offer(FUNDING.STRATEGIC.frac, { strategic: true })] : [])];
}
export function startFunding(s, dilution) {
  const o = fundingOffers(s).find(x => x.dilution === dilution);
  if (!o) throw new Error('现在不能融资');
  s.capital.round = { ...o };
  s.due.funding = addDays(s.day, 60);
  log(s, `启动融资：出让 ${Math.round(dilution * 100)}%`);
}
export function ipoCheck(s) {
  if (s.company.kind === 'division') return { ok: false, reason: '集团内部团队不能单独上市' };
  if (s.capital.listed) return { ok: false, reason: '已经上市' };
  if (s.capital.ipo) return { ok: false, reason: '上市流程进行中' };
  if (bubbleActive(s)) return { ok: false, reason: `AI 泡沫破裂后市场关着门（还要 ${bubbleDaysLeft(s)} 天）` };
  if (!P().ipoOpen(s)) return { ok: false, reason: '市场窗口还没打开（2024 年起）' };
  if (s.valuation < 3e9) return { ok: false, reason: '估值需要达到 30 亿美元' };
  // 自洽世界按 M.5.5：还要有两个季度的客户收入。收入只算对话、订阅、API、Coding Plan 四项，
  // 出租显卡和公司之间的钱不算（史实路径维持原来的条件，指纹不变）。
  if (P().mode !== 'history') {
    const quarters = new Set();
    for (const h of s.history || []) {
      if (!h.rev) continue;
      const sum = CUSTOMER_KEYS.reduce((a, k) => a + (h.rev[k] || 0), 0);
      if (sum > 0) quarters.add(quarterOf(h.date));
    }
    if (customerRevenue(s) <= 0 || quarters.size < 2) return { ok: false, reason: '还需要两个季度的客户收入' };
  }
  if (s.legal.cases.some(c => c.type === 'class' || c.type === 'books')) return { ok: false, reason: '有重大未决诉讼' };
  return { ok: true };
}
// frac：自洽和联机里挂牌时的发行比例（10%、20%、30%，M.5.5）；史实模式不传。
export function startIpo(s, frac) {
  const c = ipoCheck(s);
  if (!c.ok) throw new Error(c.reason);
  s.capital.ipo = frac === undefined ? {} : { frac };
  s.due.ipo = addDays(s.day, 90);
  log(s, '启动 IPO');
}

// 每天一早（loop.js 的 dueTick）：到期的融资谈完、上市挂牌。结果写进 out.notes。
export function capitalProcesses(s, out) {
  const c = s.capital;
  if (c.round) {
    if (!(s.due.funding > s.day)) {
      delete s.due.funding;
      const top = rivalStandings(s, { cls: peerCls(s) })[0];
      const m = liveModel(s);
      const f = top && m ? clamp(1 + (qOf(s.mod, m.dims) - top.q) / 15, 0.3, 1.4) : 0.6;
      const p = clamp(0.3 + 0.35 * f + 0.2 * (s.hype - 1) + (s.rep - 50) / 200 + (fundBoost(s) ? FUNDING.BOOST.p : 0), 0.1, 0.95);
      // 不管谈没谈成，都从这一天起算下一轮的冷却（规格 K4）。
      s.capital.lastRoundDay = s.day;
      if (rand(s) < p) {
        s.cash += c.round.amount;
        s.equity *= 1 - c.round.dilution;
        s.valuation += c.round.amount;
        // 上市公司增发：总股本按出让比例摊薄（股价不变，市值跟着估值走）。
        if (c.round.followOn && c.listed) c.listed.shares = Math.round(c.listed.shares / (1 - c.round.dilution));
        // 战略投资：之后一年在这家云上租卡打 85 折。
        if (c.round.strategic) { c.lastStrategic = s.day; s.flags.cloudPartner = addDays(s.day, FUNDING.STRATEGIC.days); }
        c.rounds.push({ date: s.date, amount: c.round.amount, post: s.valuation });
        out.notes.push(`融资完成：到账 ${fmtMoney(c.round.amount)}，投后估值 ${fmtMoney(s.valuation)}。`);
      } else out.notes.push('这轮融资没谈成，投资人对增长和技术领先性有疑虑。');
      c.round = null;
    }
  }
  if (c.ipo) {
    if (!(s.due.ipo > s.day) && P().mode !== 'history') {
      // 自洽和联机：在世界的交易所挂牌，发行价按 V 打 85 折，公司拿全部发行款（M.5.5）。
      delete s.due.ipo;
      const L = P().listIpo(s, c.ipo.frac ?? 0.2);
      c.ipo = null;
      out.notes.push(`上市了，代码 ${L.ticker}，募资 ${fmtMoney(L.npcLong * 2 * L.issuePrice)}。`);
      // 挂牌只是告诉玩家一声，没有选项、也不改变任何东西（规格 E4）：进新闻条，资本页和股市页本来就看得到挂牌状态。
      s.news.unshift({ date: s.date, day: s.day, type: 'ipo', title: '上市了', detail: `今天挂牌，代码 ${L.ticker}。发行价按估值打 85 折，发行的股票一半进做市池、一半给长线基金。之后股价围着公司价值波动，但不影响你们的身家：身家只按公司价值算。` });
    } else if (!(s.due.ipo > s.day)) {
      delete s.due.ipo;
      const pop = 1 + (rand(s) - 0.3) * 0.5;
      const shares = 1e9;
      const price = s.valuation * pop / shares;
      c.listed = { ticker: c.ipo.ticker || tickerFor(s), market: s.company.country === 'CN' ? '港交所' : '纳斯达克', shares, price, ipoPrice: price, pop, history: [[s.date, price]] };
      s.cash += s.valuation * 0.08;
      c.ipo = null;
      out.notes.push(`${c.listed.market}上市，首日市值 ${fmtMoney(s.valuation * pop)}。`);
      s.news.unshift({ date: s.date, day: s.day, type: 'ipo', title: '上市了', detail: `今天在${c.listed.market}挂牌，代码 ${c.listed.ticker}。首日市值 ${fmtMoney(s.valuation * pop)}，募资 ${fmtMoney(s.valuation * 0.08)}。之后股价会随你们的发布、榜单、收入和诉讼波动。` });
    }
  }
}
function tickerFor(s) { return s.company.country === 'CN' ? `0${100 + (s.charId.length * 37) % 800}.HK` : (s.persona.name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'AILB'); }

// ---------- 显卡抵押贷款（规格 K4） ----------
// 抵押物 = 自有卡的回收价（买价 × 55%，泡沫破裂时再 ×0.6）。借款上限 = 抵押物 × LTV；年息按月付。
export function collateralValue(s) {
  let v = 0;
  for (const [id, n] of Object.entries(s.gpus?.owned || {})) v += (GPUS[id]?.price || 0) * n * 0.55;
  return v * bubbleMult(s, 'GPU_RESALE');
}
export const loanOf = s => s.capital?.loan?.principal || 0;
export function borrowLimit(s) {
  if (s.company.kind === 'division') return 0;
  return Math.max(0, collateralValue(s) * FUNDING.LOAN.ltv - loanOf(s));
}
export function borrow(s, usd) {
  if (!(usd > 0)) throw new Error('借款要大于 0');
  const left = borrowLimit(s);
  if (!(left > 0)) throw new Error('抵押额度用完了：买更多卡，或者先还一部分');
  const amt = Math.min(usd, left);
  s.capital.loan = { principal: loanOf(s) + amt, since: s.capital.loan?.since ?? s.day };
  s.cash += amt;
  log(s, `显卡抵押贷款：借 ${fmtMoney(amt)}，年息 ${Math.round(FUNDING.LOAN.rate * 100)}%`);
  return { amount: amt, principal: s.capital.loan.principal };
}
export function repay(s, usd) {
  const owe = loanOf(s);
  if (!(owe > 0)) throw new Error('没有要还的贷款');
  const amt = Math.min(usd, owe, Math.max(0, s.cash));
  if (!(amt > 0)) throw new Error('现金不够还款');
  s.cash -= amt;
  s.capital.loan.principal = owe - amt;
  if (s.capital.loan.principal < 1) delete s.capital.loan;
  log(s, `还贷款 ${fmtMoney(amt)}`);
  return { amount: amt, principal: loanOf(s) };
}
// 月结（loop.js）：付利息；抵押物跌到借款以下就追加——先扣现金，不够就按回收价卖便宜的卡。返回这个月的利息。
export function loanMonth(s, report) {
  const owe = loanOf(s);
  if (!(owe > 0)) return 0;
  const interest = owe * FUNDING.LOAN.rate / 12;
  s.cash -= interest;
  const cap = collateralValue(s) * FUNDING.LOAN.ltv;
  if (owe > cap + 1) {
    let need = owe - cap;
    const fromCash = Math.min(need, Math.max(0, s.cash));
    s.cash -= fromCash; s.capital.loan.principal -= fromCash; need -= fromCash;
    const ids = Object.keys(s.gpus.owned).filter(id => s.gpus.owned[id] > 0).sort((a, b) => (GPUS[a]?.price || 0) - (GPUS[b]?.price || 0) || (a < b ? -1 : 1));
    let sold = 0;
    for (const id of ids) {
      if (!(need > 1)) break;
      const per = (GPUS[id]?.price || 0) * 0.55 * bubbleMult(s, 'GPU_RESALE');
      // 卖一张卡既还掉 per，也让抵押额度少 per × LTV，所以每张实际只减少 per × (1 − LTV) 的缺口。
      const k = Math.min(s.gpus.owned[id], Math.ceil(need / Math.max(1, per * (1 - FUNDING.LOAN.ltv))));
      s.gpus.owned[id] -= k;
      if (!s.gpus.owned[id]) delete s.gpus.owned[id];
      s.capital.loan.principal -= k * per; need -= k * per * (1 - FUNDING.LOAN.ltv); sold += k;
    }
    if (s.capital.loan.principal < 1) delete s.capital.loan;
    report?.notes?.push(`抵押物跌价，贷款追加：先用现金还了 ${fmtMoney(fromCash)}${sold ? `，又卖了 ${sold} 张卡` : ''}。`);
    s.queue.push({ kind: 'notice', title: '贷款追加', text: `抵押的显卡跌价了，借款超过了抵押额度。先用现金还了 ${fmtMoney(fromCash)}${sold ? `，现金不够，按回收价卖了 ${sold} 张卡` : ''}。` });
  }
  return interest;
}

// ---------- 虚构的“千禧年难题”（规格 K4） ----------
// 在线旗舰会推理、数学 ≥ 95 时，每月按（公司、月份）散列 3% 触发；全局只发生一次（自洽和联机由世界记，史实记在自己身上）。
export function millenniumCheck(s, report) {
  const X = FUNDING.MILLENNIUM;
  const m = (s.models || []).find(x => x.id === s.live);
  if (!m || s.mod !== 'llm' || s.marks?.millennium || P().millenniumDone?.(s)) return false;
  if (!((m.techs || s.techs || []).includes(X.tech) && (m.dims?.math || 0) >= X.math)) return false;
  if (!(hash01(`${s.date}|millennium|${s.charId}`) < X.p)) return false;   // 月份放在前面：FNV 对只有末尾不同的串分布不匀
  s.marks.millennium = s.day;
  P().claimMillennium?.(s);
  noteBreakthrough(s, 'millennium');
  applyEffects(s, { brand: X.brand }, { source: 'event', id: 'millennium' });
  s.news.unshift({ date: s.date, day: s.day, type: 'sota', title: `${s.company.company} 的模型证明了一个千禧年难题`, detail: '证明在数学界通过了独立复核。（虚构）全行业的热度又被点燃了一次。' });
  s.queue.push({ kind: 'notice', title: '千禧年难题', text: `${m.name} 交出了一份通过独立复核的证明。投资人排着队打电话来：之后 ${FUNDING.BOOST.millenniumDays} 天里，融资估值按 ${FUNDING.BOOST.millennium} 倍谈。（虚构剧情）` });
  report?.notes?.push(`${m.name} 证明了一个千禧年难题。`);
  return true;
}
