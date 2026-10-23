// 经营事件：月结时按局面触发（条件事件、更多经营事件）；事件参数、选项能不能选、选了以后的结果。
// 没有按日期强制弹出的抉择（规格 E5）：价格战、融资回报这些都看当时的局面；日期只当“最早可能的时候”的门槛。
import { GPUS, CODING_TOOLS, TOOL_OWNER, NPC_INFO, PRICE_TIERS, characterById, addMonths, gpuAvailable, gpuRentable, gpuMarkup } from '../data/core.js';
import { FAMILIES } from '../data/rivals.js';
import { CASES, EVENTS } from '../data/events.js';
import { EXPECT } from '../data/balance.js';
import { clamp, rand, fmtMoney, round1 } from './util.js';
import { RENT_LEAD } from '../data/supply.js';
import { workingModel, liveModel, gpuCount } from './model.js';
import { qOf, worldSota, gapOf, rivalStandings, isMine } from './sota.js';
import { cond } from './cond.js';
import { modifier } from './modifiers.js';
import { addDays } from './clock.js';
import { ipoCheck, startIpo } from './capital.js';
import { grayTick, smuggleOffers, bestRentGpu, gpuOrderInfo, buyGpu, releaseGpu } from './compute.js';
import { finish } from './finish.js';
import { openCase } from './legal.js';
import { fill } from './queue.js';
import { applyEffects } from './effects.js';
import { riskSafety } from './evals.js';
import { dropDistill } from './data_ops.js';
import { licenseOf } from './route.js';
import { initExpect } from './expect.js';
import { P } from './provider.js';

// 经营事件选项里改口碑、品牌、士气、股价的部分走统一的 applyEffects（E1）：口碑夹在 0–100，品牌夹在 0.02–12，股价冲击累加。
const EV = q => ({ source: 'event', id: q.id });
// 冷却按到期日记（s.cool），月数折成 30 天一个月。
const MONTH = 30;

// ---------- 条件事件 ----------
export function conditionalEvents(s, sv, report) {
  const svc = s.service;
  const m = liveModel(s);
  // once：处理过一次就不再出；cool：出过以后这么多个月内不再出（到期日记在 s.cool）。
  const once = (id, fn) => { if (!(s.seen[id] > 0) && !s.queue.some(q => q.id === id)) fn(); };
  const cool = (id, months, fn) => { if (!(s.cool[id] > s.day) && !s.queue.some(q => q.id === id)) { fn(); s.cool[id] = addDays(s.day, months * MONTH); } };
  businessChecks(s, cool);
  const h = svc.hist429;
  if (h.length >= 2 && h.at(-1) >= 0.05 && h.at(-2) >= 0.05) cool('e429', 6, () => s.queue.push({ kind: 'event', id: 'e429', params: { r429: Math.round(h.at(-1) * 100) } }));
  if (svc.evidence >= 100 && svc.routing.endsWith('secret')) { svc.evidence = 0; s.queue.push({ kind: 'event', id: 'exposed' }); }
  if (svc.proxy >= 0.08 && !svc.proxyUnlocked) once('proxy', () => s.queue.push({ kind: 'event', id: 'proxy', params: { proxyPct: Math.round(svc.proxy * 100) } }));
  if (s.mod === 'llm' && m && P().gate('contentStorm', s) && (s.products.chat.on || s.products.api.on) && m.dims.writing >= 72 && (riskSafety(s, m) < 64 || svc.contentPolicy === 'lenient'))
    once('tavern', () => { s.queue.push({ kind: 'event', id: 'tavern' }); svc.tavernOn = true; });
  // 被编程工具找上门的机会再乘特质的 integrationOdds（E3，例如接入编程工具 ×1.5）。
  if (s.mod === 'llm' && m && P().gate('integrations', s) && m.dims.code >= 72 && m.dims.agent >= 55 && svc.integrations.asked.length < 3 && rand(s) < 0.45 * modifier(s, 'integrationOdds')) {
    const tool = CODING_TOOLS.find(t => !svc.integrations.asked.includes(t) && !TOOL_OWNER[t]?.owners.includes(s.charId));
    if (tool && !s.queue.some(q => q.id === 'integration')) { svc.integrations.asked.push(tool); s.queue.push({ kind: 'event', id: 'integration', params: { tool } }); }
  }
  // 闭源头部模型会被别人蒸馏：看在线旗舰本身，闭源而且离世界最强不到 3 分（规格 B3）。
  if (s.mod === 'llm' && m && !m.open && P().gate('distilledBy', s)) {
    const top = worldSota(s);
    if (top && qOf('llm', m.dims) >= top.q - 3 && rand(s) < (svc.antiDistill === 'strict' ? 0.02 : 0.07)) cool('distilled_by_others', 10, () => s.queue.push({ kind: 'event', id: 'distilled_by_others' }));
  }
  // 诉讼：美国公司越出名，安全不过关的官司越多；中国公司安全压力小一些。
  const usage = clamp(Math.log10(1 + (sv.users || 0) / 1e4 + (sv.tokens || 0) / 1e11) / 3, 0, 1.5);
  // 安全读数一律走 riskSafety（T6.4）：按发布时的评测档加成、封顶，跳过评测的最多 62。
  const safety = riskSafety(s, m) ?? 60;
  const region = s.company.country === 'CN' ? 0.45 : clamp(0.6 + 0.25 * s.brand, 0.6, 2.6);
  const lm = modifier(s, 'legal') * region;
  const R = k => s.risk[k] || 1;
  const hazard = (type, p, extra) => { if (rand(s) < p * lm) openCase(s, type, extra); };
  if (m && usage > 0) {
    if (s.mod === 'llm') {
      hazard('abuse', 0.035 * usage * Math.max(0, 72 - safety) / 40 * R('abuse'));
      hazard('defamation', 0.006 * usage * Math.max(0, 85 - m.dims.knowledge) / 20);
      if (svc.tavern > 0.1) hazard('minor', 0.02 * usage * (svc.contentPolicy === 'lenient' ? 2 : 1) * R('minor'));
      if (s.data.risky.ds_books3 || s.data.risky.ds_pile) hazard('books', (P().gate('booksSuit2', s) ? 0.05 : P().gate('booksSuit', s) ? 0.015 : 0.004) * R('piracy'));
      if (s.data.risky.ds_github_all) hazard('code', 0.006);
      const tos = Object.keys(s.data.risky).find(k => k === 'ds_gpt4_distill' || k.startsWith('tos_'));
      if (tos && P().gate('tosSuit', s)) hazard('tos', 0.05 * R('tos'), { vendor: tos === 'ds_gpt4_distill' ? 'OpenAI' : FAMILIES[tos.slice(4)]?.company });
    }
    if (s.mod === 'image') {
      if (s.data.risky.im_art_scrape || s.data.risky.im_laion) hazard('image', 0.012 * R('image'));
      hazard('deepfake', 0.03 * usage * Math.max(0, 70 - safety) / 40);
    }
    if (s.mod === 'music' && s.data.risky.mu_scrape) hazard('music', (P().gate('musicSuit', s) ? 0.06 : 0.01) * R('music'));
    if (s.mod === 'speech') hazard('voice', 0.035 * usage * Math.max(0, 72 - safety) / 40 * R('voice'));
  }
  if (s.flags.poachingEra && ['frontier', 'major'].includes(s.company.tier) && rand(s) < 0.07) cool('poach', 12, () => s.queue.push({ kind: 'event', id: 'poach', params: { n: 3 + Math.floor(rand(s) * 5) } }));
  if (s.health < 22 && (sv.users || 0) > 5e4 && rand(s) < 0.3) cool('outage', 4, () => s.queue.push({ kind: 'event', id: 'outage', params: { hours: 3 + Math.floor(rand(s) * 20) } }));
  grayTick(s);
  moreEvents(s, sv, m, usage, cool, once);
  // 国内公司缺卡时，会有中间商找上门（只出现一次，只是告诉你有这条路）。
  if (s.company.country === 'CN' && s.monthsPlayed >= 2 && smuggleOffers(s).length) once('smuggle_offer', () => s.queue.push({ kind: 'event', id: 'smuggle_offer', params: { card: smuggleOffers(s).at(-1).label } }));
  const burn = (report.costs?.total || 0) - (report.revenue || 0);
  if (s.company.kind !== 'division' && burn > 0 && s.cash < burn * 6) cool('runway', 6, () => s.queue.push({ kind: 'event', id: 'runway', params: { months: Math.max(0, Math.floor(s.cash / burn)) } }));
  if (ipoCheck(s).ok && P().gate('ipoAdvice', s)) cool('ipo_window', 12, () => s.queue.push({ kind: 'event', id: 'ipo_window' }));
  if (s.flags.arenaVariant && P().gate('arenaScandal', s) && rand(s) < 0.5) { s.flags.arenaVariant = null; s.queue.push({ kind: 'event', id: 'arena_scandal' }); }
  if (s.cash < 0) {
    if (s.company.kind === 'division') { s.cash += Math.abs(s.cash) + 2e8; s.morale = Math.max(-2, s.morale - 1); report.notes.push('现金透支，集团紧急拨款，但团队受到批评。'); }
    // 自洽和联机按 M.5.8 走重组和清算（world/restructure.js），不在月结里直接破产。
    else if (!P().restructures && s.cash < -Math.max(5e6, s.valuation * 0.02)) finish(s, 'bankrupt');
  }
}

// ---------- 价格战与融资回报（规格 E5、D11.6） ----------
// 月结检查，不耗随机数，也不占发布钩子的弹窗预算。
// 玩家 API 价格要比中国对手的中位数贵到这个倍数，才会被问“跟不跟降价”。
const PRICE_WAR_RATIO = 3;
// ev_hot_round“接”的效果（D11.6）：估值先涨 10%，再按新估值出让 8%，不掷骰。集团追加预算按开局现金的 6% 拨款。
export const HOT_ROUND_FX = { valuation: 1.1, raise: 0.08 };
export const GROUP_BUDGET_FX = { cashOfStart: 0.06 };

// 中国对手现在在售的定价档：各家（org）当前旗舰（由 familyBest 取出）的定价档，按综合分从高到低。
const cnPriceField = s => rivalStandings(s).filter(x => FAMILIES[x.rel.family]?.region === 'cn' && PRICE_TIERS[x.rel.price]);
const median = a => { const b = [...a].sort((x, y) => x - y); const n = b.length; return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2; };
// 玩家的 API 价格是中国对手中位数的几倍；API 没开或者没有中国对手时是 null。
export function priceRatio(s) {
  const field = cnPriceField(s);
  if (!field.length || !s.products?.api) return null;
  return (PRICE_TIERS[s.products.api.tier]?.mult ?? 1) / median(field.map(x => PRICE_TIERS[x.rel.price].mult));
}
// 现在该不该弹“跟不跟降价”：返回价格倍数，不该弹返回 null。
// 世界标记 priceWar 为真、玩家是中国公司、API 已开、不在普惠档、价格 ≥ 中国对手中位数的 3 倍。
// 带头降价的那条线（w_pricewar 的 by）上的玩家不会遇到，被专属事件 ex_ds_price_war 吞并时也不出现。
export function priceWarDue(s) {
  if (!s.world?.priceWar || s.company.country !== 'CN') return null;
  if (!s.products?.api?.on || s.products.api.tier === 'budget') return null;
  if (warLeaders().some(f => isMine(s, f)) || cond(s, { ex: 'ex_ds_price_war' })) return null;
  const ratio = priceRatio(s);
  return ratio !== null && ratio >= PRICE_WAR_RATIO ? ratio : null;
}
// 世界事件 w_pricewar 里带头降价的那几条线（by）。
const warLeaders = () => [].concat(P().worldEvent('w_pricewar')?.by ?? []);
// 正文里的角色：{lead} 是真正降价（定价档最低）的那几家里领头的一款：带头降价的那条线在里面就取它，否则取最强的一款；
// {rivals} 是同样降价的其余几家。都取自当时的中国对手（rivalStandings 里没有玩家自家），所以正文不会点玩家自家的名。
function priceWarCast(s) {
  const field = cnPriceField(s);
  const low = Math.min(...field.map(x => PRICE_TIERS[x.rel.price].mult));
  const cut = field.filter(x => PRICE_TIERS[x.rel.price].mult === low);
  if (!cut.length) return { lead: 'DeepSeek-V2', rivals: '其他几家' };
  const leaderOrgs = warLeaders().map(f => FAMILIES[f]?.org);
  const lead = cut.find(x => leaderOrgs.includes(FAMILIES[x.rel.family].org)) ?? cut[0];
  return { lead: lead.rel.name, rivals: cut.filter(x => x !== lead).slice(0, 3).map(x => FAMILIES[x.rel.family].company).join('、') || '其他几家' };
}
function businessChecks(s, cool) {
  const ratio = priceWarDue(s);
  if (ratio !== null) cool('price_war', 12, () => s.queue.push({ kind: 'event', id: 'price_war', params: { ratio } }));
  // 融资回报（D11.6）：s.expect.hot 在 HOT_WINDOW 天内。ROUND_COOL 天最多一次，按到期日记在 s.cool。
  const again = id => !(s.cool[id] > s.day) && !s.queue.some(q => q.id === id);
  if (again('ev_hot_round') && cond(s, { all: [{ expectHot: true }, { canRaise: true }] })) {
    s.queue.push({ kind: 'event', id: 'ev_hot_round' });
    s.cool.ev_hot_round = addDays(s.day, EXPECT.ROUND_COOL);
  }
  // 集团内团队没有融资可接，改成集团追加预算：没有选项，直接拨款，只进新闻。
  if (again('ev_group_budget') && cond(s, { all: [{ expectHot: true }, { kind: 'division' }] })) {
    const def = EVENTS.ev_group_budget, before = s.cash;
    applyEffects(s, GROUP_BUDGET_FX, { source: 'event', id: 'ev_group_budget' });
    const params = { amount: fmtMoney(s.cash - before) };
    s.news.unshift({ date: s.date, day: s.day, type: 'event', title: fill(def.title, s, params), detail: fill(def.text, s, params) });
    s.seen.ev_group_budget = (s.seen.ev_group_budget || 0) + 1;
    s.cool.ev_group_budget = addDays(s.day, EXPECT.ROUND_COOL);
  }
}

// ---------- 更多经营事件 ----------
// 按局面触发：有因有果，冷却期内不重复。
const CLIENTS = ['一家大型银行', '一家车企', '一家连锁医院', '一家电网公司', '一家头部券商', '一家跨国物流公司'];
function moreEvents(s, sv, m, usage, cool, once) {
  if (!m || s.status !== 'playing') return;
  const users = sv.users || 0;
  const safety = riskSafety(s, m) ?? 60;
  const scale = s.company.tier === 'frontier' ? 3 : s.company.tier === 'bigtech' ? 2 : s.company.tier === 'small' ? 0.3 : 1;
  if (s.products.api?.on && rand(s) < 0.06) cool('big_customer', 9, () => s.queue.push({ kind: 'event', id: 'big_customer', params: { client: CLIENTS[Math.floor(rand(s) * CLIENTS.length)], contract: Math.round(8e6 * scale * (s.company.country === 'CN' ? 0.4 : 1)) } }));
  if (s.company.country === 'US' && s.mod === 'llm' && ['frontier', 'major'].includes(s.company.tier) && P().gate('govContract', s) && rand(s) < 0.04) once('gov_contract', () => s.queue.push({ kind: 'event', id: 'gov_contract', params: { contract: Math.round(2e7 * scale) } }));
  if (users > 1e6 && rand(s) < 0.02 * (1 + Math.max(0, 65 - safety) / 30)) cool('data_leak', 18, () => s.queue.push({ kind: 'event', id: 'data_leak', params: { users: Math.round(users * (0.002 + rand(s) * 0.01)) } }));
  if (gpuCount(s) > 500 && rand(s) < 0.012 * (s.health < 40 ? 3 : 1)) cool('dc_fire', 24, () => s.queue.push({ kind: 'event', id: 'dc_fire', params: { lost: Math.round(gpuCount(s) * (0.03 + rand(s) * 0.04)) } }));
  const shady = s.service.routing.endsWith('secret') ? '高峰期偷偷给用户换成量化版' : s.flags.benchmaxed ? '专门针对榜单刷分' : Object.keys(s.data.risky).length ? '训练数据来路不正' : '';
  if (shady && rand(s) < 0.05) cool('whistleblower', 15, () => s.queue.push({ kind: 'event', id: 'whistleblower', params: { what: shady } }));
  if (s.brand > 0.8 && rand(s) < 0.05) cool('media_interview', 12, () => s.queue.push({ kind: 'event', id: 'media_interview' }));
  // 许可之争：在线旗舰开放了权重、而且是受限许可时才会吵起来（规格 B3）。事件不改路线。
  if (m.open && licenseOf(m) === 'restrictive' && P().gate('licenseFork', s) && rand(s) < 0.04) once('license_fork', () => s.queue.push({ kind: 'event', id: 'license_fork' }));
  if (s.company.country === 'CN' && s.company.kind !== 'division' && rand(s) < 0.035) cool('talent_join', 18, () => s.queue.push({ kind: 'event', id: 'talent_join' }));
  if (s.company.country === 'CN' && s.mod === 'llm' && users > 1e5 && (safety < 58 || s.service.contentPolicy === 'lenient') && rand(s) < 0.08) cool('regulator_talk', 12, () => s.queue.push({ kind: 'event', id: 'regulator_talk' }));
  // 之前悄悄压下的事，有可能被扒出来。
  if (s.flags.hiddenLeak && rand(s) < 0.15) { s.flags.hiddenLeak = false; applyEffects(s, { rep: -10, stockShock: { self: -0.08 } }, { source: 'event', id: 'data_leak' }); s.news.unshift({ date: s.date, day: s.day, type: 'controversy', title: `${s.company.company} 被曝隐瞒数据泄露`, detail: '记者拿到了内部邮件，显示公司早就知道泄露却没有通知用户。' }); }
  if (s.flags.boldClaim && s.flags.boldClaim <= s.date) {
    const gap = gapOf(s, m.dims);
    if (gap !== null && gap < -1) { applyEffects(s, { rep: -4 }, { source: 'event', id: 'media_interview' }); s.news.unshift({ date: s.date, day: s.day, type: 'controversy', title: `网友翻出 ${s.company.company} 一年前的豪言`, detail: '当初说要追上第一，现在差距还在。' }); }
    s.flags.boldClaim = null;
  }
}
function applyMoreEvent(s, q, c, p) {
  switch (q.id) {
    case 'big_customer': {
      if (c === 'pass') return '你们把精力留给了自己的产品。';
      const m = liveModel(s);
      // 客户看合规材料：评测过的版本更占优，跳过评测的按 62 封顶（T6.4）。
      const win = clamp(0.25 + ((riskSafety(s, m) ?? 60) - 60) / 60 + (c === 'discount' ? 0.25 : 0), 0.1, 0.9);
      if (rand(s) < win) { const v = q.params.contract * (c === 'discount' ? 0.5 : 1); applyEffects(s, { cash: v, rep: c === 'discount' ? -1 : 2 }, EV(q)); return `中标了！合同款 ${fmtMoney(v)} 到账。`; }
      if (c === 'discount') applyEffects(s, { rep: -1 }, EV(q));
      return '没中标。对方最后选了另一家，理由是“合规材料更完整”。';
    }
    case 'gov_contract':
      if (c === 'limited') { applyEffects(s, { cash: q.params.contract, rep: 2 }, EV(q)); return '合同签了，使用范围写得很清楚。'; }
      if (c === 'all') { applyEffects(s, { cash: q.params.contract * 1.6, brand: 0.92, risk: { abuse: 1.3 } }, EV(q)); return '钱到账了，但不少员工联名抗议，媒体也开始追问用途。'; }
      applyEffects(s, { rep: 3, brand: 1.03 }, EV(q)); return '你们婉拒了。社区里不少人为这个决定点赞。';
    case 'data_leak':
      if (c === 'disclose') { applyEffects(s, { rep: -3, cash: -Math.max(5e5, (s.history.at(-1)?.revenue || 0) * 0.05) }, EV(q)); return '公告发出后挨了一波骂，但大家觉得你们至少没瞒着。'; }
      s.flags.hiddenLeak = true; return '漏洞修好了，对外什么也没说。';
    case 'dc_fire': {
      const lost = q.params.lost;
      const [id] = Object.entries(s.gpus.owned).sort((a, b) => b[1] - a[1])[0] || [];
      if (id) {
        s.gpus.owned[id] = Math.max(0, s.gpus.owned[id] - lost);
        if (!s.gpus.owned[id]) delete s.gpus.owned[id];
        // 烧掉的卡里如果有走私来的，账上也跟着少，不留下不存在的卡。
        if (s.gray?.owned[id]) s.gray.owned[id] = Math.min(s.gray.owned[id], s.gpus.owned[id] || 0);
      }
      if (c === 'insure') { applyEffects(s, { cash: lost * (GPUS[id]?.price || 20000) * 0.4, health: -10 }, EV(q)); return '保险赔回了一部分卡钱，集群慢慢恢复。'; }
      applyEffects(s, { cash: -lost * 4000, health: -4 }, EV(q)); return '工程师连轴转了三天，集群恢复了。';
    }
    case 'whistleblower':
      if (c === 'own') { applyEffects(s, { rep: -4 }, EV(q)); if (s.service.routing.endsWith('secret')) s.service.routing = 'full'; return '你们公开回应并整改，舆论慢慢平息。'; }
      if (rand(s) < 0.35) { applyEffects(s, { rep: -12, brand: 0.92 }, EV(q)); return '压帖被网友截图，事情反而闹大了。'; }
      return '帖子沉了下去，没人再提。';
    case 'media_interview':
      if (c === 'bold') { applyEffects(s, { brand: 1.08 }, EV(q)); s.flags.boldClaim = addMonths(s.date, 12); return '标题是“我们明年追上第一”。转发量很高。'; }
      applyEffects(s, { rep: 2 }, EV(q)); return '报道很克制，读者觉得你们挺实在。';
    case 'license_fork':
      // 事件改不了路线（B3、B4）：“着手改许可”本身什么都不变，要换成宽松许可得在公司策略里选开源路线的节点。
      if (c === 'keep') { applyEffects(s, { rep: 2 }, EV(q)); return '你们表态继续用受限许可，吵了几天就平息了。'; }
      return '你们说会认真考虑改许可。许可证本身没变，要换成宽松许可，得在「公司策略」里选开源路线的那一项。';
    case 'ev_hot_round':
      if (c === 'accept') return `基金入了股：${applyEffects(s, HOT_ROUND_FX, EV(q)).join('，')}。`;
      applyEffects(s, { rep: 1 }, EV(q)); return '你们谢绝了这轮融资，说想再自己走一段。';
    case 'talent_join':
      if (c === 'hire') { applyEffects(s, { cash: -p.costN, know: 25, morale: 1 }, EV(q)); s.team += 6; return '大牛带着小团队入职了，组会的讨论质量明显变高。'; }
      return '你们婉拒了，对方去了另一家。';
    case 'regulator_talk':
      if (c === 'rectify') { applyEffects(s, { cash: -p.costN, service: { contentPolicy: 'strict' } }, EV(q)); for (const mm of [workingModel(s), liveModel(s)]) if (mm) mm.dims.safety = clamp(mm.dims.safety + 3, 0, 99); return '整改报告交上去了，审核规则也收紧了。'; }
      applyEffects(s, { rep: -3 }, EV(q));
      if (rand(s) < 0.3 && s.products.chat) { s.products.chat.on = false; s.due.chatBan = addDays(s.day, MONTH); return '没能说服监管，对话产品被要求下架一个月。'; }
      return '监管给了宽限期，但要求下次不能再犯。';
    default: return null;
  }
}

export function eventParams(s, q) {
  const p = { ...(q.params || {}) };
  if (q.id === 'e429' || q.id === 'viral') {
    const g = bestRentGpu(s);
    const last = s.service.last || {};
    const n = Math.max(64, Math.round(((last.needGpu || 100) - (last.capGpu || 0) * 0.8) / Math.max(0.1, GPUS[g].infer * s.inferShare) / 64) * 64);
    Object.assign(p, { rentGpu: GPUS[g].label, rentGpuId: g, rentN: n, rentCost: fmtMoney(n * GPUS[g].rent * gpuMarkup(g, s.date, s.company.country)) });
  }
  if (q.id === 'exposed') p.refund = fmtMoney((s.history.at(-1)?.revenue || 0) * 0.5);
  if (q.id === 'integration') { p.toolName = characterById(p.tool)?.name || p.tool; p.toolRole = NPC_INFO[p.tool]?.role || '编程工具'; }
  if (q.id === 'export_ban') p.ascendCost = fmtMoney(1000 * GPUS.Ascend910B.price);
  if (q.id === 'lawsuit') {
    const def = CASES[p.type];
    // 服务条款官司的原告是被蒸馏的那家厂商（params.vendor）；老档里排着的没有写厂商，按当时唯一的闭源来源 OpenAI 算。
    p.vendor ||= 'OpenAI';
    Object.assign(p, { caseTitle: def.title, caseText: fill(def.text, s, { claim: fmtMoney(p.claim), vendor: p.vendor }), caseLine: def.line, settle: fmtMoney(p.claim * 0.45), settle2: fmtMoney(p.claim * 0.3), months: p.months, fee: fmtMoney(p.fee), winp: Math.round(p.winp * 100) });
  }
  if (q.id === 'poach') p.cost = fmtMoney(p.n * 1.2e7);
  if (q.id === 'outage') p.comp = fmtMoney(Math.max(2e5, (s.history.at(-1)?.revenue || 0) * 0.1));
  if (q.id === 'price_war') {
    // 正文不点玩家自家：领头的和跟进的都取自中国对手（rivalStandings 里没有自家），不然等于先说自己已经降过价，再问跟不跟。
    p.ratio = round1(p.ratio || priceRatio(s) || 4);
    Object.assign(p, priceWarCast(s));
  }
  if (q.id === 'ev_hot_round') p.amount = fmtMoney(s.valuation * HOT_ROUND_FX.valuation * HOT_ROUND_FX.raise / (1 - HOT_ROUND_FX.raise));
  if (q.id === 'ipo_window') p.valuation = fmtMoney(s.valuation);
  if (q.id === 'runway') { const burn = Math.max(1, (s.history.at(-1)?.costs || 0) - (s.history.at(-1)?.revenue || 0)); p.months = Math.max(0, Math.floor(s.cash / burn)); p.dilution = 25; p.gpuCash = fmtMoney(Object.entries(s.gpus.owned).reduce((a, [k, n]) => a + n * GPUS[k].price * 0.55 * 0.3, 0)); }
  if (q.id === 'budget') { p.budget2 = fmtMoney(p.budget * 1.5); p.budget = fmtMoney(p.budget); }
  if (q.id === 'big_customer' || q.id === 'gov_contract') { p.contract = fmtMoney(q.params.contract); p.contract2 = fmtMoney(q.params.contract * 1.6); }
  if (q.id === 'data_leak') { p.users = Math.round(q.params.users).toLocaleString('zh-CN'); p.cost = fmtMoney(Math.max(5e5, (s.history.at(-1)?.revenue || 0) * 0.05)); }
  if (q.id === 'dc_fire') p.cost = fmtMoney(q.params.lost * 4000);
  if (q.id === 'talent_join') { p.costN = s.company.tier === 'small' ? 3e6 : 8e6; p.cost = fmtMoney(p.costN); }
  if (q.id === 'regulator_talk') { p.costN = Math.max(5e5, (s.history.at(-1)?.revenue || 0) * 0.03); p.cost = fmtMoney(p.costN); }
  if (q.id === 'smuggle_exposed') { const g = s.gray || { spent: 0 }; Object.assign(p, { seized: Math.round(p.n * 0.6), fine: fmtMoney(g.spent * 0.25) }); }
  return p;
}
export function choiceBlocked(s, q, id) {
  // 加急租卡：这个时间点一张都租不到（比如国内公司没有海外子公司）就不能选。
  if ((q.id === 'e429' && id === 'rent') || (q.id === 'viral' && id === 'scale')) { const g = bestRentGpu(s); if (!gpuRentable(g, s.date, s.company.country, s.flags.overseasRent) || !gpuOrderInfo(s, g, true).left) return '现在租不到卡'; }
  if (q.id === 'poach' && id === 'equity' && s.company.kind === 'division') return '集团团队没有独立股权';
  if (q.id === 'poach' && id === 'match' && s.cash < q.params.n * 1.2e7) return '现金不足';
  if (q.id === 'export_ban' && id === 'ascend' && s.cash < 1000 * GPUS.Ascend910B.price) return '现金不足';
  if (q.id === 'export_ban' && id === 'overseas' && !gpuOrderInfo(s, 'H100', true).left) return '这个月云上租不到卡';
  if (q.id === 'ipo_window' && id === 'start' && !ipoCheck(s).ok) return ipoCheck(s).reason;
  // 排队等的时候公司可能已经开始融资或上市了。
  if (q.id === 'ev_hot_round' && id === 'accept' && !cond(s, { canRaise: true })) return '现在不能融资';
  return '';
}

export function applyEventChoice(s, q, c) {
  const p = eventParams(s, q);
  const more = applyMoreEvent(s, q, c, p);
  if (more !== null) return more;
  const svc = s.service;
  switch (q.id) {
    case 'e429':
      svc.routingUnlocked = true;
      if (c === 'rent') { const r = buyGpu(s, p.rentGpuId, p.rentN, true); return `新租的 ${r.n} 张卡大约 ${RENT_LEAD} 天后开通，开始分担负载。`; }
      if (c === 'limit') { applyEffects(s, { brand: 0.95, rep: -2 }, EV(q)); s.inferShare = Math.min(0.9, s.inferShare + 0.05); return '付费用户的请求优先处理，部分免费用户转去了别家。'; }
      if (c === 'quant_open') { svc.routing = 'quant_open'; applyEffects(s, { rep: -1 }, EV(q)); return '公告发出后有人抱怨，但大多数人表示理解。之后可以在「服务」里调整分流方案。'; }
      if (c === 'quant_secret') { svc.routing = 'quant_secret'; return '高峰期的请求悄悄分给了量化版。账面上一切正常。'; }
      break;
    case 'exposed':
      svc.routing = 'full';
      if (c === 'apologize') { applyEffects(s, { cash: -(s.history.at(-1)?.revenue || 0) * 0.5, rep: -8 }, EV(q)); return '道歉信和退款安排发出去了，事情慢慢平息。'; }
      if (c === 'partial') { applyEffects(s, { rep: -15 }, EV(q)); openCase(s, 'class', { now: true }); return '声明发出后被逐条反驳，集体诉讼正式立案。'; }
      if (c === 'deny') { applyEffects(s, { rep: -25, stockShock: { self: -0.15 } }, EV(q)); openCase(s, 'class', { now: true, mult: 1.6 }); return '用户贴出了更多证据，监管部门也开始问询。'; }
      break;
    case 'proxy':
      svc.proxyUnlocked = true;
      if (c === 'ban') { svc.proxyPolicy = 'ban'; svc.proxy *= 0.1; applyEffects(s, { cash: -2e5, brand: 0.98 }, EV(q)); return '一批账号被封，密钥全部轮换。少数正常用户被误伤，申诉后已恢复。'; }
      if (c === 'limit') { svc.proxyPolicy = 'limit'; svc.proxy *= 0.5; return '单账号限速上线，转卖生意变得不划算了。'; }
      if (c === 'reseller') { svc.proxyPolicy = 'reseller'; return '几家转售商签了合作，流量从灰色变成了正式渠道。'; }
      return '反代还在继续扩张。之后可以在「服务」里设置反代治理。';
    case 'tavern':
      if (c === 'welcome') { svc.contentPolicy = 'lenient'; return '内容策略放宽，酒馆用户涌了进来，调用量明显上升。'; }
      if (c === 'strict') { svc.contentPolicy = 'strict'; applyEffects(s, { rep: 2 }, EV(q)); return '内容策略收紧。社区里有人失望离开，企业客户更放心了。'; }
      return '保持原样。';
    case 'integration':
      if (c === 'all') { svc.integrations.mode = 'all'; if (!svc.integrations.tools.includes(p.tool)) svc.integrations.tools.push(p.tool); return `${p.toolName} 和其他工具都可以直接接入了。`; }
      if (c === 'whitelist') { if (svc.integrations.mode !== 'all') svc.integrations.mode = 'whitelist'; svc.integrations.tools.push(p.tool); return `${p.toolName} 加入了白名单。`; }
      return '暂时只在自家工具里提供。';
    case 'export_ban':
      if (c === 'ascend') { s.cash -= 1000 * GPUS.Ascend910B.price; s.gpus.owned.Ascend910B = (s.gpus.owned.Ascend910B || 0) + 1000; s.due.adapt = addDays(s.day, 3 * MONTH); return '一千张昇腾 910B 到货，团队开始适配训练框架。'; }
      if (c === 'squeeze') { applyEffects(s, { know: 6 }, EV(q)); return '工程团队开始抠每一点训练效率。'; }
      if (c === 'overseas') { s.flags.overseasRent = true; buyGpu(s, 'H100', 256, true); return `海外子公司租下了 256 张 H100，大约 ${RENT_LEAD} 天后开通。`; }
      break;
    case 'lawsuit': {
      // 自洽和联机里原告可能是别家公司（vendorOrg）：和解金、赔款付给它，收盘入账六成（M.5.9）。
      const vo = q.params.vendorOrg;
      const base = { type: q.params.type, title: CASES[q.params.type].title, claim: q.params.claim, winp: q.params.winp, left: q.params.months, fee: q.params.fee, opened: s.date, ...(vo ? { vendorOrg: vo } : {}) };
      if (c === 'settle') { applyEffects(s, { cash: -q.params.claim * 0.45, rep: -1 }, EV(q)); if (vo) P().transfer(s, vo, q.params.claim * 0.45, 'case'); s.legal.history.push({ ...base, outcome: '和解' }); return `支付 ${p.settle} 达成和解。`; }
      if (c === 'remediate') {
        applyEffects(s, { cash: -q.params.claim * 0.3, rep: 1 }, EV(q));
        if (vo) P().transfer(s, vo, q.params.claim * 0.3, 'case');
        for (const mm of [workingModel(s), liveModel(s)]) if (mm) mm.dims.safety = round1(clamp(mm.dims.safety + 2.5, 0, 99));
        if (q.params.type === 'books') { delete s.data.risky.ds_books3; delete s.data.risky.ds_pile; }
        if (q.params.type === 'tos') for (const k of Object.keys(s.data.risky)) if (k.startsWith('tos_') || k === 'ds_gpt4_distill') delete s.data.risky[k];
        s.legal.history.push({ ...base, outcome: '整改和解' });
        return `支付 ${p.settle2} 并承诺整改，安全对齐得到加强。`;
      }
      s.legal.cases.push({ ...base, fighting: true });
      return `进入诉讼程序，预计 ${q.params.months} 个月出结果。`;
    }
    case 'poach':
      if (c === 'match') { s.cash -= q.params.n * 1.2e7; return '加薪之后，他们决定留下。'; }
      if (c === 'equity') { s.equity *= 0.98; return '新发的期权留住了他们。'; }
      applyEffects(s, { morale: -1 }, EV(q)); s.due.poach = addDays(s.day, 6 * MONTH); s.know *= 0.9; return '他们走了。团队需要时间补位。';
    case 'viral':
      applyEffects(s, { brand: 1.25 }, EV(q));
      if (c === 'scale') { const r = buyGpu(s, p.rentGpuId, p.rentN, true); return `加租的 ${r.n} 张卡大约 ${RENT_LEAD} 天后开通，先顶住这波流量。`; }
      return '热度来了，服务器有点吃紧。';
    case 'outage':
      if (c === 'report') { applyEffects(s, { cash: -Math.max(2e5, (s.history.at(-1)?.revenue || 0) * 0.1), rep: -2 }, EV(q)); return '事故报告写清了原因和补救措施。'; }
      applyEffects(s, { rep: -5 }, EV(q)); return '没有公开说明，但客户都知道发生了什么。';
    case 'price_war':
      if (c === 'follow') { applyEffects(s, { service: { apiTier: 'budget' } }, EV(q)); return 'API 价格降到了普惠档。'; }
      if (c === 'free') { applyEffects(s, { service: { apiTier: 'budget', chatFree: true } }, EV(q)); return '对话产品宣布全面免费。'; }
      return '价格不变。';
    case 'ipo_window':
      if (c === 'start') { startIpo(s); return '上市流程启动，大约 3 个月后挂牌。'; }
      return '暂缓上市。';
    case 'runway':
      if (c === 'raise') { const amount = s.valuation * 0.25 / 0.75 * 0.7; s.cash += amount; s.equity *= 0.75; s.valuation *= 0.85; return `以较低估值融到 ${fmtMoney(amount)}。`; }
      if (c === 'cut') { applyEffects(s, { team: 0.8, morale: -1 }, EV(q)); return '裁员 20%，月度开支降下来了。'; }
      if (c === 'sell_gpu') {
        for (const k of Object.keys(s.gpus.owned)) { const n = Math.round(s.gpus.owned[k] * 0.3); if (n > 0) releaseGpu(s, k, n, false); }
        return '卖掉了三成自有 GPU。';
      }
      break;
    case 'budget':
      // 年度评审（D11.6）：上一年追加了、却一直没轮到旗舰被评的旧记录，到这次评审清掉。
      if (s.expect?.ask) s.expect.ask = null;
      // 追加预算的代价：集团把多给的钱当成预支的“超出预期”，记 s.expect.ask，下一次被评的旗舰市场评价降一档（P3.E 的 judgeRelease 落实）。
      // P3.E 落地以前 s.expect 可能还没有，先按 D11.10 的形状建一个。“按常规接受”不写这条记录。
      if (c === 'more') {
        (s.expect ??= initExpect()).ask = { day: s.day };
        applyEffects(s, { cash: q.params.budget * 1.5 }, EV(q));
        return '追加预算批下来了。集团对下一款旗舰的期待也跟着高了。';
      }
      applyEffects(s, { cash: q.params.budget }, EV(q)); return '预算到位。';
    case 'arena_scandal':
      if (c === 'admit') {
        applyEffects(s, { rep: -6 }, EV(q));
        delete s.published.arena;
        for (const m of s.models) if ((m.role || 'flagship') === 'flagship') delete m.benchmarks?.arena;
        return '成绩撤回，社区接受了解释。';
      }
      applyEffects(s, { rep: -12 }, EV(q)); return '“实验版本”的说法没能平息质疑。';
    case 'benchmax_exposed':
      if (c === 'admit') { applyEffects(s, { rep: -5 }, EV(q)); return '你们公开了训练数据说明，事情渐渐过去。'; }
      applyEffects(s, { rep: -10, brand: 0.93 }, EV(q)); return '否认没有说服社区，之后你们的每个分数都有人质疑。';
    case 'distilled_by_others':
      if (c === 'detect') { svc.antiDistill = 'strict'; applyEffects(s, { brand: 0.99 }, EV(q)); return '检测和水印上线了。之后每月多一笔风控开销。'; }
      if (c === 'sue') { applyEffects(s, { cash: -2e6 }, EV(q)); delete s.due.leak; return '律师函发出，对方暂停了大规模调用。'; }
      s.due.leak = addDays(s.day, 6 * MONTH); return '对手接下来几个月追得更快了。';
    case 'smuggle_offer':
      if (c === 'refuse') { s.gray = { ...(s.gray || { owned: {}, bought: {}, month: s.date, heat: 0, total: 0, spent: 0 }), closed: true }; return '你们回绝了。这条路以后不会再有人来提。'; }
      return '对方留了联系方式。后台「算力」页最下面多了一个“灰色渠道”。';
    case 'smuggle_exposed': {
      const g = s.gray;
      g.heat = 0;
      if (c === 'cooperate') {
        for (const [id, n] of Object.entries(g.owned)) {
          const lose = Math.min(s.gpus.owned[id] || 0, Math.round(n * 0.6));
          s.gpus.owned[id] = (s.gpus.owned[id] || 0) - lose;
          if (!s.gpus.owned[id]) delete s.gpus.owned[id];
          g.owned[id] = n - lose;
        }
        applyEffects(s, { cash: -g.spent * 0.25, rep: -4, stockShock: { self: -0.06 } }, EV(q));
        g.closedUntil = addMonths(s.date, 6);
        return `六成走私卡被查扣，罚款 ${p.fine}。渠道断了半年，公司算是保住了。`;
      }
      g.closed = true;
      applyEffects(s, { rep: -8 }, EV(q));
      if (rand(s) < 0.5) {
        s.flags.entityList = true;
        s.flags.overseasRent = false;
        for (const id of Object.keys(s.gpus.rented)) if (!gpuAvailable(id, s.date, 'CN')) delete s.gpus.rented[id];
        return '美国商务部把你们列入了实体清单：海外云厂商停止租卡给你们，海外客户也开始回避你们的模型。';
      }
      return '风波暂时压了下去，但这条渠道再也走不通了，圈子里都知道你们出过事。';
    }
    case 'distill_ban':
      s.marks[`ban_${q.params.family}`] = s.day;
      if (c === 'admit') { applyEffects(s, { rep: -4 }, EV(q)); for (const k of Object.keys(s.data.distill)) if (s.data.distill[k]?.[q.params.family]) dropDistill(s, k, q.params.family); return '你们承认了，并停止使用这批数据。'; }
      applyEffects(s, { rep: -8 }, EV(q)); return '否认之后，对方表示保留追究的权利。';
    default: break;
  }
  return '';
}
