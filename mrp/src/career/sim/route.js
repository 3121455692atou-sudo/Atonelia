// 开源路线（规格 B）：五档路线只管旗舰开不开源；小模型和副线发布时自己选。
// 写路线只有 setStance 一条路，允许调用它的只有 sim/strategy.js（completeNode，src 'strategy'）、本文件的 initRoute（createGame 调用，src 'start'）
// 其他地方出现 setStance( 或 s.route.stance = 会被静态测试拦下（tests/career/seams.test.mjs）。
// 状态：s.route = { stance, license, since, by }（A3）。license 是这条路线放出权重时用的许可：小模型和副线、delayed 档的旧代开放都按它。
// 读路线的地方：发布开闭（releaseOpenRule，按发布角色 relRole 取）、economy.js 的 API 品牌（modifier 'apiBrand'，本文件登记来源）和出海系数、
// 世界事件的 openBoost（openStance）。跟模型本身有关的效果（API 收入、OpenRouter、被别家蒸馏、许可之争）读模型的 open、license，不读路线。
import { STANCES, STANCE, START_STANCE, LICENSES, routeLabel } from '../data/routes.js';
import { DELAY_DAYS, ROUTE_COOLDOWN } from '../data/balance.js';
import { addDays, daysBetween } from './clock.js';
import { registerModSource } from './modifiers.js';
import { applyEffects } from './effects.js';
import { fire } from './queue.js';
import { relRole } from './sota.js';
import { log } from './log.js';
import { P, relId } from './provider.js';

const SRC = ['strategy', 'start'];
const order = st => STANCES.indexOf(st);

// 路线进加成（规格 E3）：apiBrand 来自路线；overseas 不是加成键，economy.js 直接读 STANCE。
registerModSource(s => (STANCE[s.route?.stance] ? [{ apiBrand: STANCE[s.route.stance].mods.apiBrand }] : []), { id: 'route', sig: s => s.route?.stance ?? '', quick: s => s.route?.stance ?? '' });

// 当前结构必须有显式路线；缺失时拒绝，不能把旧档悄悄当闭源局。
export const routeOf = s => ensureRoute(s);
// 旗舰开放权重的两档（受限许可开源、完全开源）：世界事件的 openBoost 只给它们。
export const openStance = s => STANCE[routeOf(s).stance].flagshipOpen;
// 开源模型必须自带许可；不替旧档猜一个宽松许可。
export const licenseOf = m => { if (!m?.open) return null; if (!LICENSES[m.license]) throw Error('不支持缺少模型许可的旧存档，请新开一局'); return m.license; };

// 切换路线的附带效果（B5，只在 src 为 strategy 时）：Δ = 新旧两档 order 之差。
// 走向开放：品牌 ×(1 + 0.04|Δ|)；走向封闭：口碑 −3|Δ|，估值 ×(1 + 0.03|Δ|)（集团内团队不改估值，applyEffects 管）。
// 策略完成卡片要列出效果时也用它（describeEffects）。
export function stanceSwitchEffects(from, to) {
  if (!STANCE[from] || !STANCE[to] || from === to) return null;
  const d = order(to) - order(from), n = Math.abs(d);
  return d > 0 ? { brand: 1 + 0.04 * n } : { rep: -3 * n, valuation: 1 + 0.03 * n };
}

export function setStance(s, to, { src, by = null, license = null } = {}) {
  if (!SRC.includes(src)) throw new Error(`路线只能由公司策略或开局来改（这次的来源是 ${src ?? '空'}）`);
  if (!STANCES.includes(to)) throw new Error(`没有这一档路线：${to}`);
  const prev = s.route?.stance;
  s.route = { stance: to, license: license ?? STANCE[to].license ?? null, since: s.day, by: by ?? src };
  if (src === 'strategy' && prev && prev !== to) {
    const fx = stanceSwitchEffects(prev, to);
    if (fx) applyEffects(s, fx, { source: 'strategy', id: by ?? 'route' });
    log(s, `开源路线：${STANCE[prev]?.label ?? prev} → ${routeLabel(s.route)}`);
  }
  // 离开 delayed 档：还没到日子的旧代开放一并取消（不想开就改路线，B5）。
  if (prev === 'delayed' && to !== 'delayed') for (const m of s.models || []) if (m.openAt && !m.open) delete m.openAt;
  return s.route;
}

// 路线冷却（B5）：上一次由公司策略改路线之后 ROUTE_COOLDOWN 天内，带 stance 的节点不能开始。返回剩余天数，0 表示没有冷却。
// 开局设的路线不算“切换”，不起冷却（策略页开局显示“冷却：无”，A11）。strategy.js 的 routeChangeBlocked 读它。
export function routeCooldownLeft(s) {
  const r = s.route;
  if (!r?.since || !STANCE[r.stance] || r.by === 'start') return 0;
  return Math.max(0, ROUTE_COOLDOWN - daysBetween(r.since, s.day));
}

// 发布时开不开源的规则（B2）→ { open: true|false|'choice', license, why, default? }。
// role 由调用方按 relRole(snap) 取：顶替在线旗舰的是 'flagship'，副线和小模型是 'small'，不看出身 m.origin。
export function releaseOpenRule(s, role) {
  const r = routeOf(s), st = STANCE[r.stance];
  if (role === 'flagship') {
    const license = st.flagshipOpen ? st.license ?? null : null;
    return { open: st.flagshipOpen, license, why: `路线：${st.label} → ${st.flagshipOpen ? `旗舰必须开放权重（${LICENSES[license]}）` : '旗舰不开放权重'}` };
  }
  const license = r.license ?? 'permissive';
  return { open: 'choice', default: st.smallDefault, license, why: `路线：${st.label} → 小模型和副线开不开源自己定（默认${st.smallDefault ? `开源，${LICENSES[license]}` : '闭源'}）` };
}
// 这一次发布实际开不开、用什么许可：发布角色按 line 定（D1）；旗舰按路线锁定，忽略 want；可选的按 want，没给就用路线的默认。
export function releaseOpen(s, line, want) {
  const rule = releaseOpenRule(s, relRole({ line }));
  const open = rule.open === 'choice' ? (typeof want === 'boolean' ? want : rule.default) : rule.open;
  return { open, license: open ? rule.license ?? 'permissive' : null, rule };
}

// 新旗舰全量上线、顶掉了原来的在线旗舰（release.js 的 dailyDeploy 调用）：delayed 档给被取代的那份闭源快照记下开放日。
export function flagshipReplaced(s, prevId) {
  if (!STANCE[routeOf(s).stance].reopen) return;
  const m = (s.models || []).find(x => x.id === prevId);
  if (m && !m.open && !m.openAt) m.openAt = addDays(s.day, DELAY_DAYS);
}
// 只校验当前路线，不在运行中迁移或补建旧结构。
export function ensureRoute(s) {
  if (!STANCE[s?.route?.stance]) throw Error('不支持缺少路线的旧存档，请新开一局');
  return s.route;
}
// 每天：delayed 档的旧代开放（B5）。到期当天开放权重，许可取路线的许可；发新闻，品牌 ×1.02，再触发 reopen 钩子（里程碑可能因此成立）。
// 玩家不能逐次拒绝；不想开，就用策略把路线改掉（setStance 会取消还没到日子的）。
export function routeTick(s, out) {
  ensureRoute(s);
  if (!STANCE[routeOf(s).stance].reopen) return;
  for (const m of s.models || []) {
    if (m.open || !m.openAt || m.openAt > s.day) continue;
    m.open = true;
    m.license = s.route.license ?? 'permissive';
    m.openAt = s.day;
    s.news.unshift({ date: s.date, day: s.day, type: 'event', title: `按路线，开放上一代 ${m.name} 的权重`, detail: `${LICENSES[m.license]}。被新旗舰取代满 ${DELAY_DAYS} 天的闭源旗舰，按“旧代开源”的路线放出权重。` });
    out?.notes?.push(`按路线开放了上一代 ${m.name} 的权重。`);
    log(s, `旧代开放：${m.name}`);
    applyEffects(s, { brand: 1.02 }, { source: 'strategy', id: 'route_reopen' });
    fire(s, { on: 'reopen', model: m });
  }
}

// 已经开放权重、还没有许可的型号补上许可：按真实发布的许可标签（LP 宽松，LR、LN 受限），查不到的按路线的许可。只补没有许可的，不改已有的。
// 只在新开局初始化真实历史继承型号时调用。
export function stampLicenses(s) {
  const r = routeOf(s);
  for (const m of s.models || []) {
    if (!m || m.stage !== 'released' || !m.open || LICENSES[m.license]) continue;
    const real = m.hist ? P().relById(relId(m.name)) : null;
    const tag = real?.tags?.find(t => t === 'LP' || t === 'LR' || t === 'LN');
    m.license = tag ? (tag === 'LP' ? 'permissive' : 'restrictive') : r.license ?? 'permissive';
  }
}

// createGame：按 START_STANCE 设开局路线（src 'start'），再给继承的开源型号补许可。
export function initRoute(s) {
  const st = START_STANCE[s.charId]?.[s.scenario] ?? { stance: 'closed', license: null };
  setStance(s, st.stance, { src: 'start', license: st.license });
  stampLicenses(s);
}
