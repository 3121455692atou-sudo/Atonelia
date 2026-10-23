// 董事会目标：开局按公司和剧本生成、显示要求、到期评测结算（累计三次没达成就换掉管理层）。
// 目标存在 s.goals；到期那个月 1 号排进队列，队列项是 { kind: 'board', id }。g.date 是检查的月份，宽限时往后挪，原定的月份留在 g.due0。
import { PRODUCTS, addMonths } from '../data/core.js';
import { BENCH_BY_ID } from '../data/benchmarks.js';
import { SCENARIO_GOALS, classTop } from '../data/goals.js';
import { CLASS_GOAL_MAX } from '../data/balance.js';
import { fmtMoney } from './util.js';
import { clsOf, liveModel, runBenchmark, myRank } from './model.js';
import { usageBoards } from './economy.js';
import { finish } from './finish.js';
import { publish } from './release.js';
import { applyEffects } from './effects.js';
import { log } from './log.js';
import { P } from './provider.js';
import { CUSTOMER_KEYS } from '../world/valuation.js';
import { rankTopOf, checkShareGoal, checkValMultGoal } from '../world/goals.js';

// 自洽世界的“收入”只算客户收入（对话、订阅、API、Coding Plan，M.3.8 第 4 条）；史实路径照旧读总收入。
const SELF_MODE = () => P().mode !== 'history';
const customerRevOf = row => (row?.rev ? CUSTOMER_KEYS.reduce((a, k) => a + (row.rev[k] || 0), 0) : 0);
const revenueOf = row => (SELF_MODE() ? customerRevOf(row) : (row?.revenue || 0));

export function buildGoals(s, hasModel) {
  const tierKey = s.company.tier;
  const out = [];
  const own = SCENARIO_GOALS[s.scenario]?.[s.mod];
  const self = SELF_MODE();
  for (const g of P().goals(s)) {
    if (g.tiers && !g.tiers.includes(tierKey)) continue;
    // 按公司换目标：chars 只给这几家，notChars 这几家不考（换成更贴近本行的）。
    if ((g.chars && !g.chars.includes(s.charId)) || g.notChars?.includes(s.charId)) continue;
    let date = g.date;
    // 自洽模板的 +N 不看开局有没有模型（分岔局开局就有模型）；史实模板照旧跳过。
    if (date.startsWith('+')) { if (hasModel && !self) continue; date = addMonths(s.start, Number(date.slice(1))); }
    else if (!self && !own && g.id !== 'final' && date < addMonths(s.start, 5)) continue;
    else if (!self && own && !hasModel && g.id !== 'final' && date < addMonths(s.start, 7)) continue;
    const check = { ...g.check };
    const cn = s.company.country === 'CN';
    if (cn && check.cnMin) check.min = check.cnMin;
    if (check.min && typeof check.min === 'object') check.min = check.min[tierKey] ?? check.min.major;
    if (check.top && typeof check.top === 'object') check.top = check.top[tierKey] ?? check.top.major;
    if (check.classOnly && typeof check.classOnly === 'object') check.classOnly = !!check.classOnly[tierKey];
    if (check.type === 'bench' && check.cnBench && cn && date >= BENCH_BY_ID[check.cnBench].from) check.bench = check.cnBench;
    if (check.type === 'valuation' && s.company.kind === 'division') { check.type = 'revenue'; check.min = check.bigtechRevenue; check.strict = undefined; }
    if (check.type === 'valuation' && tierKey === 'small' && !own) check.min = Math.min(check.min, 5e8);
    if (cn && !g.check.cnMin && (check.type === 'revenue' || check.type === 'valuation')) check.min = Math.round(check.min * 0.3);
    delete check.cnMin;
    // 按公司单独定的阈值（byChar），覆盖上面按量级、国别算出来的值。
    Object.assign(check, check.byChar?.[s.charId]);
    delete check.byChar;
    if (check.type === 'revenue' && !check.product && tierKey === 'small' && s.mod === 'llm') {
      Object.assign(check, { type: 'rank', bench: P().gate('boardBench', { date }) ? 'mmlupro' : 'mmlu', top: 3, classOnly: true, min: undefined });
      out.push({ id: g.id, title: '同量级领先', desc: '小团队拼不过大公司的营收，但要在同量级模型里站到前列。', date, due0: date, check, status: 'pending' });
      continue;
    }
    out.push({ id: g.id, title: g.title, desc: g.desc, date, due0: date, check, status: 'pending' });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const USAGE_BOARD_NAMES = { openrouter: 'OpenRouter 周调用量', coding: 'Coding Plan 调用量', apps: 'AI 应用月活' };
const productName = id => Object.values(PRODUCTS).flat().find(p => p.id === id)?.label || id;
const CN_NUM = ['一', '二', '三'];
// 同量级名次：N = classTop(对手数)，封顶 CLASS_GOAL_MAX。2 家对手要第一，4 家要前二，6 家起要前三。
function classNeed(name, rivals) {
  const n = Math.min(CLASS_GOAL_MAX, classTop(rivals));
  return `${name} 同量级 ${rivals} 家对手，要排${n <= 1 ? '第一' : `前${CN_NUM[n - 1]}`}`;
}
// 不知道对手数时（顶栏、检查卡片、顾问）写通则，同样从 classTop 和 CLASS_GOAL_MAX 生成：
// “同量级对手 2 家要第一，4 家要前二，6 家起要前三”。
function classRule() {
  const parts = [];
  for (let n = 1; n <= CLASS_GOAL_MAX; n++) {
    const rivals = Array.from({ length: 100 }, (_, i) => i + 1).find(r => classTop(r) === n && r > 1);
    if (rivals === undefined) continue;
    parts.push(`${rivals} 家${n === CLASS_GOAL_MAX ? '起' : ''}要${n <= 1 ? '第一' : `前${CN_NUM[n - 1]}`}`);
  }
  return `同量级对手 ${parts.join('，')}`;
}
// rivals：做这个目标时的同量级对手数（界面按目标日期查榜传入）。没传时写通则，不写死数字。
export function goalNeed(c, rivals = null) {
  if (c.type === 'bench') { const b = BENCH_BY_ID[c.bench]; return `${b.name} ${c.max !== undefined ? `≤ ${c.max}` : `≥ ${c.min}`}${b.kind === 'pct' || b.kind === 'lower' ? '%' : ''}`; }
  if (c.type === 'rank') {
    const b = BENCH_BY_ID[c.bench];
    if (Number.isFinite(c.topFrac)) return `${b.name} ${c.topFrac === 0.5 ? '世界前一半' : `世界前 ${Math.round(c.topFrac * 100)}%`}`;
    if (!c.classOnly) return `${b.name} 总榜前 ${c.top}`;
    const n = Number.isFinite(rivals) ? rivals : (Number.isFinite(c.classRivals) ? c.classRivals : null);
    return n === null ? `${b.name} 同量级名列前茅（${classRule()}）` : classNeed(b.name, n);
  }
  if (c.type === 'share') return 'API 份额不低于平均份额的一半';
  if (c.type === 'valMult') return `估值达到开局的 ${Number.isFinite(c.mult) ? c.mult : 3} 倍`;
  if (c.type === 'revenue') return `${c.product ? `${productName(c.product)} ` : ''}月收入 ≥ ${fmtMoney(c.min)}`;
  if (c.type === 'valuation') return c.strict ? `估值（上市后按市值）≥ ${fmtMoney(c.min)}` : `估值 ≥ ${fmtMoney(c.min)} 或已上市`;
  if (c.type === 'usage') return `${USAGE_BOARD_NAMES[c.board] || c.board}前 ${c.top}`;
  if (c.type === 'release') return '至少发布过一个模型';
  if (c.type === 'survive') return '活到终局，不破产';
  return '综合评级';
}
export function goalView(s, id) {
  const g = s.goals.find(x => x.id === id);
  const c = g.check;
  const official = c.type === 'bench' || c.type === 'rank';
  return { kind: 'goal', id, tag: '董事会目标', title: `${g.title}${g.grace ? '（宽限期）' : ''}`, text: `${g.desc} 要求：${goalNeed(c)}。`, need: goalNeed(c), check: c, lines: [], choices: [{ id: 'check', label: official ? '开始官方评测' : '查看结果', hint: '' }] };
}
export function resolveGoal(s, id) {
  const g = s.goals.find(x => x.id === id);
  const c = g.check;
  const m = liveModel(s);
  let pass = false;
  let run = null;
  let detail = '';
  if (c.type === 'release') { pass = !!m; detail = m ? `已发布 ${m.name}` : '还没有发布任何模型'; }
  // 活下去（规格 K5，AI 泡沫破裂后换上的目标）：到期时还在经营就算达成。
  if (c.type === 'survive') { pass = s.status === 'playing'; detail = pass ? `熬过来了，现金 ${fmtMoney(s.cash)}` : '没熬过去'; }
  if (c.type === 'bench' || c.type === 'rank') {
    if (m && s.date >= BENCH_BY_ID[c.bench].from) {
      run = runBenchmark(s, c.bench, m);
      publish(s, run, m);
      if (c.type === 'bench') { pass = c.max !== undefined ? run.score <= c.max : run.score >= c.min; detail = `${run.bench.name}：${run.score}${run.bench.kind === 'pct' || run.bench.kind === 'lower' ? '%' : ''}`; }
      // 官方评测看的是这次评的在线模型自己的名次，不拿以前发布过的版本的成绩顶上。
      else { const r = myRank(s, c.bench, c.classOnly ? clsOf(m) : null, m.role || 'flagship', m.id); pass = !!r && r.rank <= rankTopOf(c, r.of); detail = r ? `${run.bench.name}${c.classOnly ? '同量级' : Number.isFinite(c.topFrac) ? '世界' : '总榜'}第 ${r.rank} 名（共 ${r.of}）` : '没有成绩'; }
    } else detail = '没有可以评测的模型';
  }
  if (c.type === 'revenue' && c.product) { const rev = s.service.last?.revenue?.[c.product] || 0; pass = rev >= c.min; detail = `上月 ${productName(c.product)} 收入 ${fmtMoney(rev)}`; }
  else if (c.type === 'revenue') { const rev = revenueOf(s.history.at(-1)); pass = rev >= c.min; detail = `上月${SELF_MODE() ? '客户' : ''}收入 ${fmtMoney(rev)}`; }
  if (c.type === 'share') { const r = checkShareGoal(s, c); pass = r.pass; detail = r.detail; }
  if (c.type === 'valMult') { const r = checkValMultGoal(s, c); pass = r.pass; detail = r.detail; }
  if (c.type === 'valuation' && c.strict) { pass = s.valuation >= c.min; detail = `${s.capital.listed ? `${s.capital.listed.market}市值` : '估值'} ${fmtMoney(s.valuation)}`; }
  else if (c.type === 'valuation') { pass = !!s.capital.listed || s.valuation >= c.min; detail = s.capital.listed ? `已在${s.capital.listed.market}上市` : `估值 ${fmtMoney(s.valuation)}`; }
  if (c.type === 'usage') {
    const rows = usageBoards(s)[c.board]?.rows || [];
    const me = rows.find(r => r.mine);
    pass = !!me && me.rank <= c.top;
    detail = me ? `${USAGE_BOARD_NAMES[c.board]}第 ${me.rank} 名（共 ${rows.length}）` : '榜上没有你们的模型';
  }
  // 按卡片对象出队，不按位置：resolveEvent 带下标时，处理的可能不是队首那张。
  const at = s.queue.findIndex(q => q?.kind === 'board' && q.id === id);
  if (at >= 0) s.queue.splice(at, 1);
  let outcome;
  // 董事会目标是阶段性任务：没达成会伤估值和口碑，但公司照常经营；累计三次没达成，董事会才换掉管理层。
  const fx = e => applyEffects(s, e, { source: 'board', id: g.id });
  if (pass) { g.status = 'met'; outcome = 'met'; fx({ morale: 1, brand: 1.03 }); s.strikes = Math.max(0, (s.strikes || 0) - 1); }
  else if (SELF_MODE()) {
    // 自洽和联机里不撤换管理层（M.3.11）：没达成只扣口碑和士气，记进复盘，公司照常经营。
    g.status = 'failed';
    outcome = 'failed';
    fx({ rep: -3, morale: -1 });
    log(s, `董事会目标「${g.title}」没达成：${detail || goalNeed(c)}`);
  }
  else if (!g.grace) { g.due0 ??= g.date; g.grace = true; g.date = addMonths(s.date, 2); outcome = 'grace'; fx({ morale: -1 }); }
  else {
    g.status = 'failed';
    outcome = 'failed';
    s.strikes = (s.strikes || 0) + 1;
    // 上市公司伤股价，没上市的伤估值（集团内团队没有估值）。
    fx({ rep: -6, brand: 0.92, morale: -1, ...(s.capital.listed ? { stockShock: { self: -0.12 } } : { valuation: 0.85 }) });
    if (s.strikes >= 3) finish(s, 'goal_failed', g);
  }
  return { goal: g, pass, outcome, run, detail, need: goalNeed(c), strikes: s.strikes || 0 };
}
