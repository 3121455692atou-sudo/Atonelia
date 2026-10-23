// 行业大事触发器（规格 M.3.9）：价格战、开源冲击、出口管制、管制放宽、反垄断、版权官司。
// 每天收盘第 6 步由 world/index.js 的 checkTriggers 调用；蒸馏指控是 M5.2 的事，这里不做。
// 每件事的条件都从世界账本读：发布行、SOTA 持有者、月结表、各家快照。后果写 world.flags，下次开盘各家读镜像。
import { addDays, daysBetween } from '../sim/clock.js';
import { clamp } from '../sim/util.js';
import { DATASET_BY_ID } from '../data/datasets.js';
import { CASES } from '../data/events.js';
import { INDEX } from '../data/selfplay.js';
import { applyEffects } from '../sim/effects.js';
import { registerKind } from '../sim/queue.js';
import { openCase } from '../sim/legal.js';
import { qOf } from '../sim/sota.js';
import { apiPriceOf } from './market.js';

const WAR_DAYS = 90;
const WAR_COOL_DAYS = 180;
const SHOCK_DAYS = INDEX.SHOCK_DAYS;
const OPEN_COOL_DAYS = 180;
const EXPORT_NEAR = 3;
const EXPORT_DAYS = 60;
const EXPORT_FULL_DAYS = 365;
const EXPORT_QUIET_DAYS = 180;
const ANTITRUST_SHARE = 0.5;
const ANTITRUST_DAYS = 90;
const ANTITRUST_COOL_DAYS = 365;
const COPYRIGHT_REV = 5e7;
const COPYRIGHT_COOL_DAYS = 365;

const active = world => Object.values(world.companies).filter(c => !c.frozen && c.s?.status === 'playing');
const r1 = x => Math.round(x * 10) / 10;
const pct = x => `${x > 0 ? '+' : ''}${Math.round(x * 1000) / 10}%`;
const companyName = (world, org) => world.companies[org]?.name || world.companies[org]?.s?.company?.company || org;
const liveOf = s => (s?.models || []).find(m => m.id === s.live) || null;
const monthRevenue = s => (s?.history || []).at(-1)?.revenue || 0;
const orgRows = (world, day = world.day) => Object.entries(world.relMeta || {}).filter(([, x]) => x.org !== 'academia' && x.day <= day);

// 各家最强（只算已发布的行）。
function topOrgs(world, day = world.day, n = 3) {
  const bag = new Map();
  for (const [, x] of orgRows(world, day)) bag.set(x.org, Math.max(bag.get(x.org) ?? -Infinity, x.q));
  return [...bag.entries()].map(([org, q]) => ({ org, q })).sort((a, b) => b.q - a.q || (a.org < b.org ? -1 : 1)).slice(0, n);
}

function ensure(world) {
  const f = world.flags;
  f.priceWar ??= {};
  f.priceWarCool ??= {};
  f.openShockCool ??= {};
  f.antitrust ??= {};
  f.antitrustCool ??= {};
  f.copyrightCool ??= {};
  f.chipShocks ??= [];
  f.apiShocks ??= [];
  f.apiSeen ??= {};
  world.series ??= {};
  world.events ??= [];
  if (f.exportSince === undefined) f.exportSince = f.export ? world.startDay : null;
  if (f.cnThreatSince === undefined) f.cnThreatSince = null;
  if (f.cnThreatDay === undefined) f.cnThreatDay = null;
}

// ---------- 读 flags 的小工具（market.js / valuation.js 也照这几条读） ----------
// 冲击按天线性回到 0：新冲击 90 天，旧的按剩余比例叠加。
export function shockAt(list, day) {
  let sum = 0;
  for (const x of list || []) {
    const age = daysBetween(x.day, day);
    if (age < 0 || age >= SHOCK_DAYS) continue;
    sum += x.amount * (1 - age / SHOCK_DAYS);
  }
  return sum;
}
export const chipShockAt = (world, day = world.day) => shockAt(world.flags?.chipShocks, day);
export const apiShockAt = (world, day = world.day) => shockAt(world.flags?.apiShocks, day);

// ---------- 新闻 ----------
// 行业大事进世界新闻，也进每家的新闻。点名到某家时，那家自己看到的是“你们”。
function triggerNews(world, { id, day, type = 'world', title, detail, region = null, org = null, major = true }) {
  const date = day.slice(0, 7);
  const ev = { date, day, id, type, title, detail, region };
  world.events.push(ev);
  world.news.unshift({ date, day, type, title, detail, region, major, w: id });
  const own = org ? companyName(world, org) : null;
  for (const c of active(world)) {
    const mine = !!org && c.id === org;
    c.s.news.unshift({
      date, day, type,
      title: mine && own ? title.replaceAll(own, '你们') : title,
      detail: mine && own ? detail.replaceAll(own, '你们') : detail,
      region, major, w: id,
    });
  }
  if (world.news.length > 100) world.news.length = 100;
}

// ---------- 1. 价格战 ----------
// 两个条件满足一个：某地区 API 参考价 60 天内跌了 30% 以上；或者榜单前三有一家的 API 定在普惠档、离世界最强不到 3 分。
export function priceWarCandidate(world, day = world.day) {
  const holder = world.label.holder;
  const holderQ = holder?.q ?? -Infinity;
  const top = active(world)
    .map(c => {
      const m = liveOf(c.s);
      return { c, q: m ? qOf(c.s.mod, m.dims) : -Infinity };
    })
    .filter(x => Number.isFinite(x.q))
    .sort((a, b) => b.q - a.q || (a.c.id < b.c.id ? -1 : 1))
    .slice(0, 3);
  const hit = top.find(x => x.c.s.products?.api?.on && x.c.s.products.api.tier === 'budget' && x.q >= holderQ - 3);
  if (!hit) return null;
  const region = hit.c.s.company.country === 'CN' ? 'CN' : 'global';
  return { region, org: hit.c.id, q: hit.q, kind: 'price' };
}
function priceDrop(world, day) {
  for (const region of ['global', 'CN']) {
    const seen = (world.flags.apiSeen[region] ??= []);
    const now = apiPriceOf(world, region, day);
    // 60 天里最早的那次读数：中间有几个月更贵，不影响“跌了 30%”。
    const old = seen.filter(x => daysBetween(x.day, day) >= 60 && daysBetween(x.day, day) <= 120)
      .reduce((a, x) => (a === null || x.value > a.value ? x : a), null);
    if (old && old.value > 0 && now <= old.value * 0.7) return { region, org: null, q: null, kind: 'drop', before: old.value, now };
  }
  return null;
}
function recordApiPrices(world, day) {
  for (const region of ['global', 'CN']) {
    const seen = (world.flags.apiSeen[region] ??= []);
    seen.push({ day, value: apiPriceOf(world, region, day) });
    world.flags.apiSeen[region] = seen.filter(x => daysBetween(x.day, day) <= 150);
  }
}
function checkPriceWar(world, day) {
  const f = world.flags;
  const cand = priceWarCandidate(world, day) || priceDrop(world, day);
  if (!cand) return null;
  if ((f.priceWarCool[cand.region] || '') > day) return null;
  const regionLabel = cand.region === 'CN' ? '中国' : '全球';
  f.priceWar[cand.region] = addDays(day, WAR_DAYS);
  f.priceWarCool[cand.region] = addDays(day, WAR_COOL_DAYS);
  // 套用现有 w_pricewar 的效果：地区里的公司 s.world.priceWar 为真。
  for (const c of active(world)) {
    const inRegion = cand.region === 'global' || c.s.company.country === 'CN';
    if (inRegion) applyEffects(c.s, { world: { priceWar: true } }, { source: 'world', id: 'w_pricewar' });
  }
  const id = `w_trigger_pricewar_${cand.region}_${day.replace(/-/g, '')}`;
  const lead = cand.org ? companyName(world, cand.org) : null;
  const what = cand.kind === 'drop'
    ? `${regionLabel}的 API 参考价 60 天内从 ${r1(cand.before)} 降到 ${r1(cand.now)}。`
    : `${lead ? `${lead}把 API 定在了普惠档，` : ''}离世界最强不到 3 分，其他几家很快跟上。`;
  triggerNews(world, {
    id, day, type: 'price', region: cand.region, org: cand.org,
    title: `${regionLabel}打起了价格战`,
    detail: `${what}接下来 ${WAR_DAYS} 天${regionLabel}的 API 参考价按六折算。`,
  });
  return { id, region: cand.region, org: cand.org };
}

// ---------- 2. 开源冲击 ----------
// 一款开源权重拿到标签，或者离持有者不到 1.5 分。同一个模态 180 天最多一次。
export function openShockCandidate(world, day = world.day) {
  if (world.mod !== 'llm') return null;
  const holder = world.label.holder;
  if (!holder) return null;
  let hit = null;
  for (const [relId, x] of Object.entries(world.relMeta || {})) {
    if (x.org === 'academia' || x.day > day || !x.open) continue;
    if (x.q < holder.q - 1.5) continue;
    if (!hit || x.q > hit.q || (x.q === hit.q && relId < hit.relId)) hit = { ...x, relId };
  }
  return hit;
}
function checkOpenShock(world, day) {
  const f = world.flags;
  const hit = openShockCandidate(world, day);
  if (!hit) return null;
  const cool = f.openShockCool[world.mod];
  if (cool && day <= cool) return null;
  const holder = world.label.holder;
  const gap = clamp(holder.q - hit.q, 0, 1.5);
  // 离持有者越近跌得越多：0 分时 −17%，1.5 分时 −10%。
  const amount = -(0.17 - 0.07 * (gap / 1.5));
  f.chipShocks.push({ day, amount, relId: hit.relId });
  f.apiShocks.push({ day, amount: -0.1, relId: hit.relId });
  f.openShockCool[world.mod] = addDays(day, OPEN_COOL_DAYS);
  f.chipShock = chipShockAt(world, day);
  const id = `w_trigger_open_${day.replace(/-/g, '')}`;
  triggerNews(world, {
    id, day, type: 'shock',
    title: '开源权重逼近榜首，算力市场跟着抖了一下',
    detail: `一款开源权重离榜首不到 ${r1(gap) || 1.5} 分，算力指数的冲击项 ${pct(amount)}，API 参考价也降了一成；${SHOCK_DAYS} 天内慢慢恢复。已上市的闭源公司会挨一轮卖单（M2 的做市池里做，这里先留口子）。`,
  });
  return { id, amount, relId: hit.relId };
}

// ---------- 3/4. 出口管制与管制放宽 ----------
// 出口管制：在场公司至少 6 家，一家中国公司连续 60 天在世界前三、离持有者不到 3 分。
// 管制放宽：管制满 365 天，而且连续 180 天没有中国公司满足上面的条件。
function cnThreat(world, day) {
  const holder = world.label.holder;
  const holderQ = holder?.q ?? -Infinity;
  const top = topOrgs(world, day, 3);
  return top.find(x => {
    const c = world.companies[x.org];
    return c?.s?.company?.country === 'CN' && x.q >= holderQ - EXPORT_NEAR;
  }) || null;
}
function checkExport(world, day) {
  const f = world.flags;
  const live = active(world);
  // 不足 6 家的房间里连“威胁”也不累计：条件里的“前 60 天”应该是这个房间里发生的事。
  const threat = live.length >= 6 ? cnThreat(world, day) : null;
  if (threat) { f.cnThreatSince ??= day; f.cnThreatDay = day; }
  else f.cnThreatSince = null;
  if (!f.export) {
    // 公司少于 6 家的房间不触发新管制，开局的管制状态照旧。
    if (live.length < 6 || !f.cnThreatSince) return null;
    if (daysBetween(f.cnThreatSince, day) < EXPORT_DAYS) return null;
    f.export = true;
    f.exportSince = day;
    const id = `w_trigger_export_${day.replace(/-/g, '')}`;
    triggerNews(world, {
      id, day, type: 'regulation',
      title: '美国扩大对华 AI 芯片管制',
      detail: `一家中国公司连续 ${EXPORT_DAYS} 天排在世界前三，离榜首不到 ${EXPORT_NEAR} 分。美国扩大了管制：中国公司买不到当代的美国卡，规则和以前那套一样。`,
    });
    return { id, export: true };
  }
  const since = f.exportSince || world.startDay;
  const quietFrom = f.cnThreatDay || since;
  if (daysBetween(since, day) < EXPORT_FULL_DAYS || daysBetween(quietFrom, day) < EXPORT_QUIET_DAYS) return null;
  f.export = false;
  f.exportSince = null;
  const id = `w_trigger_export_relax_${day.replace(/-/g, '')}`;
  triggerNews(world, {
    id, day, type: 'regulation',
    title: '对华芯片管制放宽一档',
    detail: `管制已经生效满一年，最近半年也没有中国公司逼近榜首。特供卡重新可以买了。`,
  });
  return { id, export: false };
}

// ---------- 5. 反垄断 ----------
// 该地区至少 3 家在卖 API，某一家份额超过 50% 连续 90 天。同一家 365 天最多一次。
function checkAntitrust(world, day) {
  const f = world.flags;
  const table = world.market?.table;
  if (!table) return null;
  for (const entry of Object.values(table)) {
    if (entry.product !== 'api') continue;
    const rows = entry.rows.filter(r => r.org !== 'academia' && r.share > 0);
    const orgs = [...new Set(rows.map(r => r.org))];
    if (orgs.length < 3) continue;
    for (const org of orgs) {
      const share = rows.filter(r => r.org === org).reduce((a, r) => a + r.share, 0);
      if (share <= ANTITRUST_SHARE) {
        if (f.antitrust[org]?.region === entry.region) delete f.antitrust[org];
        continue;
      }
      const rec = f.antitrust[org];
      if (!rec || rec.region !== entry.region) { f.antitrust[org] = { since: day, region: entry.region }; continue; }
      if (daysBetween(rec.since, day) < ANTITRUST_DAYS) continue;
      if ((f.antitrustCool[org] || '') > day) continue;
      f.antitrustCool[org] = addDays(day, ANTITRUST_COOL_DAYS);
      delete f.antitrust[org];
      const c = world.companies[org];
      if (!c) continue;
      const id = `w_trigger_antitrust_${org}_${day.replace(/-/g, '')}`;
      const name = companyName(world, org);
      c.s.queue.push({ kind: 'antitrust', id: 'antitrust', params: { org, name, region: entry.region, share } });
      triggerNews(world, {
        id, day, type: 'antitrust', org, region: entry.region,
        title: `${name} 被反垄断调查`,
        detail: `${entry.region === 'CN' ? '中国' : '全球'}的 API 市场里，${name}的份额连续 ${ANTITRUST_DAYS} 天超过一半。监管给了一张二选一的单子：交罚款，或者承诺降一档价格。`,
      });
      return { id, org };
    }
  }
  return null;
}

const lowerTier = tier => (tier === 'premium' ? 'standard' : tier === 'standard' ? 'budget' : 'budget');
const TIER_LABEL = { budget: '普惠', standard: '标准', premium: '旗舰' };

// 反垄断卡片：罚款 = 上月收入的 3 倍，或承诺把 API 降一档价格。
registerKind('antitrust', {
  view(s, q) {
    const rec = s.history?.at(-1)?.revenue || 0;
    const fine = Math.max(1e5, Math.round(rec * 3));
    const tier = s.products?.api?.tier || 'standard';
    const next = lowerTier(tier);
    const choices = [
      { id: 'fine', label: `交罚款 ${Math.round(fine / 1e4).toLocaleString('zh-CN')} 万美元`, hint: '按上月收入的 3 倍算，一次付清，不认罚就继续查。' },
      { id: 'cut', label: `把 API 从「${TIER_LABEL[tier] || tier}」降到「${TIER_LABEL[next] || next}」`, hint: '只降 API 这一项，价格下来以后需求会涨，但单位毛利变薄。' },
    ];
    // 电脑公司按现金流选：交得起就交，交不起就降价（确定性规则）。
    if (s.cash < fine) choices.reverse();
    return {
      kind: 'antitrust', tag: '行业大事', title: '反垄断调查',
      text: `${q.params?.name || s.company.company}的 API 份额连续三个月超过一半，监管发来了调查通知。二选一：交罚款，或者承诺降一档价格。`,
      lines: [], choices,
    };
  },
  resolve(s, q, choiceId) {
    const rec = s.history?.at(-1)?.revenue || 0;
    const fine = Math.max(1e5, Math.round(rec * 3));
    if (choiceId === 'fine') {
      applyEffects(s, { cash: -fine, rep: -2 }, { source: 'world', id: 'antitrust' });
      return `罚款 ${Math.round(fine / 1e4).toLocaleString('zh-CN')} 万美元交了，调查结束。`;
    }
    const tier = s.products?.api?.tier || 'standard';
    const next = lowerTier(tier);
    applyEffects(s, { rep: 1, ...(s.products?.api ? { service: { apiTier: next } } : {}) }, { source: 'world', id: 'antitrust' });
    return `承诺把 API 从「${TIER_LABEL[tier] || tier}」降到「${TIER_LABEL[next] || next}」，监管接受。`;
  },
});

// ---------- 6. 版权官司 ----------
// 月收入超过 5000 万美元，而且语料里有 pirated 或 unclear 的数据。每家 365 天最多一次。
// 规格写的是 legal.openCase(CASES.copyright)；现有官司表里没有 copyright 这一项，
// 按模态取最接近的版权类官司（LLM 用 books：作者集体诉讼）。以后补上统一的 copyright 条目时自动优先用它。
const COPYRIGHT_CASE = { llm: CASES.copyright ? 'copyright' : 'books', image: 'image', music: 'music', speech: 'voice' };
function riskyCorpus(s) {
  for (const id of Object.keys(s.data?.risky || {})) {
    const rights = DATASET_BY_ID[id]?.rights;
    if (rights === 'pirated' || rights === 'unclear') return true;
  }
  return false;
}
function checkCopyright(world, day) {
  const f = world.flags;
  for (const c of active(world)) {
    const s = c.s;
    if (monthRevenue(s) < COPYRIGHT_REV || !riskyCorpus(s)) continue;
    if ((f.copyrightCool[c.id] || '') > day) continue;
    const type = COPYRIGHT_CASE[s.mod] || 'books';
    if (!openCase(s, type)) continue;
    f.copyrightCool[c.id] = addDays(day, COPYRIGHT_COOL_DAYS);
    const id = `w_trigger_copyright_${c.id}_${day.replace(/-/g, '')}`;
    const name = companyName(world, c.id);
    triggerNews(world, {
      id, day, type: 'lawsuit', org: c.id,
      title: `${name} 被版权方起诉`,
      detail: `${name}的月收入已经超过 5000 万美元，训练语料里又有来路不清的数据。版权方挑这个时候递了起诉书，公司收到一张应诉卡片。`,
    });
    return { id, org: c.id };
  }
  return null;
}

// ---------- 总入口（M.4 收盘第 6 步） ----------
// 返回这次触发了哪些大事（脚本统计用）。同一天可以触发多件，按表格顺序检查。
export function checkTriggers(world, day = world.day) {
  ensure(world);
  recordApiPrices(world, day);
  const out = [];
  for (const fn of [checkPriceWar, checkOpenShock, checkExport, checkAntitrust, checkCopyright]) {
    try {
      const r = fn(world, day);
      if (r) out.push({ kind: fn.name.replace(/^check/, '').toLowerCase(), ...r });
    } catch (e) {
      world.errors.push({ org: null, day, message: `触发器 ${fn.name}: ${e.message}` });
    }
  }
  // 冲击项按天走到当前值，给算力指数和界面读。
  world.flags.chipShock = chipShockAt(world, day);
  world.flags.apiShock = apiShockAt(world, day);
  if (out.length) {
    world.flags.triggerLog ??= [];
    world.flags.triggerLog.push({ day, kinds: out.map(x => x.kind) });
    if (world.flags.triggerLog.length > 200) world.flags.triggerLog.shift();
  }
  return out;
}

// 测试和脚本用：每件大事触发过几次（按 triggerLog 数）。
export function triggerCounts(world) {
  const out = {};
  for (const x of world.flags?.triggerLog || []) for (const k of x.kinds) out[k] = (out[k] || 0) + 1;
  return out;
}

