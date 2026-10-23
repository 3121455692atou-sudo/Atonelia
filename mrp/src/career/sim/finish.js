// 结算：经营为主，榜单是阶段性的。
import { SCORE_GROWTH, RANKS } from '../data/goals.js';
import { clamp } from './util.js';
import { clsOf, liveModel, suiteFor, myRank } from './model.js';
import { BUBBLE } from '../data/economy.js';

export function finish(s, reason, goal = null) {
  if (s.status === 'ended') return s.result;
  s.status = 'ended';
  s.queue = [];
  const final = s.goals.find(g => g.check.type === 'final');
  if (final && reason === 'complete') final.status = 'met';
  const m = liveModel(s);
  const cls = s.company.tier === 'small' && m ? clsOf(m) : null;
  const boards = suiteFor(s).map(b => b.id).filter(id => s.published[id]);
  let capScore = 20;
  if (m && boards.length) {
    const pcts = boards.map(id => { const r = myRank(s, id, cls); return r ? 1 - (r.rank - 1) / Math.max(1, r.of - 1) : 0; });
    capScore = 100 * pcts.reduce((a, b) => a + b, 0) / pcts.length;
  }
  const rev = s.history.slice(-3).reduce((a, x) => a + x.revenue, 0) / Math.max(1, Math.min(3, s.history.length));
  const growth = SCORE_GROWTH[s.scenario];
  let ref = { frontier: 6e8, bigtech: 8e7, major: 4e7, small: 3e6, specialist: 2e7 }[s.company.tier] * (s.company.country === 'CN' ? 0.3 : 1);
  if (growth) ref = Math.max(ref, (s.history.find(h => h.date === s.start)?.revenue || 0) * growth.revenue);
  const bizScore = clamp(50 + 25 * Math.log10(Math.max(rev, 1) / ref), 0, 100);
  const valRef = Math.max(s.valuationStart, 1) * (growth?.valuation || 1);
  const capitalScore = s.company.kind === 'division' ? clamp(50 + 25 * Math.log10(Math.max(rev, 1) / ref), 0, 100) : clamp(50 + 10 * Math.log2(Math.max(s.valuation, 1) / valRef) + (s.capital.listed ? growth?.listedBonus ?? 10 : 0), 0, 100);
  const share = s.history.at(-1)?.share || 0;
  const marketScore = clamp(100 * Math.sqrt(share / 0.25), 0, 100);
  const goals = s.goals.filter(g => g.check.type !== 'final');
  const goalScore = goals.length ? 100 * goals.filter(g => g.status === 'met').length / goals.length : 60;
  const lost = s.legal.history.filter(x => x.outcome === '败诉').length;
  const seen = id => (s.seen?.[id] || 0) > 0;
  const penalty = lost * 4 + (seen('exposed') ? 6 : 0) + (seen('arena_scandal') ? 4 : 0) + (seen('benchmax_exposed') ? 4 : 0);
  // 规格 K5：熬过 AI 泡沫破裂 +5，“扭亏为盈”躲过泡沫 +8。
  const winter = s.bubble && !s.bubble.averted && reason === 'complete' ? BUBBLE.SCORE.winter : 0;
  const profitAch = s.marks?.ach_profitable ? BUBBLE.SCORE.profit : 0;
  let total = 0.3 * bizScore + 0.2 * capitalScore + 0.12 * marketScore + 0.15 * capScore + 0.1 * s.rep + 0.13 * goalScore - penalty + winter + profitAch;
  if (reason !== 'complete') total = Math.min(total, 45);
  total = Math.round(clamp(total, 0, 100));
  let rank = 'G';
  for (const [min, r] of RANKS) if (total >= min) rank = r;
  s.result = { reason, goal: goal?.title || null, total, rank, parts: { bizScore: Math.round(bizScore), capitalScore: Math.round(capitalScore), marketScore: Math.round(marketScore), capScore: Math.round(capScore), rep: Math.round(s.rep), goalScore: Math.round(goalScore), penalty, winter, profitAch }, date: s.date, model: m?.name || null, modelId: m?.id ?? null, revenue: rev, valuation: s.valuation };
  if (growth) s.result.basis = { revenue: ref, valuation: valRef };
  return s.result;
}
