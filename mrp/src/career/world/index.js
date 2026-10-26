import {postOnlyEvents} from '../sim/post_only.js';
import { automationVersion, initializeAutomationWorld, assertAutomationWorld, managedAutomationHuman, automationStateError, enableAutomation } from '../sim/automation.js';
import { assertRuleSettings } from './rules.js';
// 自洽世界的总入口（规格 M.1–M.4）：从零开局、两段式日结、世界账本的镜像。
// world.tick 的顺序照 M.4：命令 → 开盘 → 各家推进（顺序每天轮换）→ 收盘（1–11）。
// 月末的共用月结、季末的算力结算和档位重排在 M1b-1 接上；触发器、名字账本和打榜在 M1b-2 接上；交易所还留空（M2）。
import { finishWorld } from './finish.js';
export { finishWorld } from './finish.js';
import { createGameFor, createGame } from '../sim/game.js';
import { applyCommand } from '../sim/commands.js';
import { tickDay, releaseEntry } from '../sim/loop.js';
import { currentEvent, resolveEvent } from '../sim/queue.js';
import { judgeRelease, judgeDeferred } from '../sim/expect.js';
import { trainFlops } from '../sim/model.js';
import { qOf, seedOf } from '../sim/sota.js';
import { setProvider, P, HistoryProvider } from '../sim/provider.js';
import { addDays, daysBetween } from '../sim/clock.js';
import { END, COMPANIES, COMPANY_BY_ID, OWNER_OF, TECH_BY_ID } from '../data/core.js';
import { FAMILIES } from '../data/rivals.js';
import { TECH_SRC } from '../data/techsrc.js';
import { SELF, DEFAULT_COMPANIES, ROUTE_MIX } from '../data/selfplay.js';
import { SimProvider, REAL_RELEASES } from './sim_provider.js';
import { initTech, techCalendarTick, techAuto, refreshCompanyTech, refreshReleaseTech, LEVELS } from './tech.js';
import { botThink } from './bots.js';
import { appendRelease, rowForModel, normName } from './release.js';
import { checkTriggers as runTriggers } from './triggers.js';
import { noteRelease, scoreRelease, objectionTick } from './names.js';
import { blankLabel, offerLabel, steadyCheck, projectSota, projectFirsts, registerFirsts, companyBest, kinOf } from './label.js';
import { acadStart, acadFollow } from './academia.js';
import { settleMarket, apiShareOf } from './market.js';
import { trackOrders, settleSupply, quarterCap, quarterCapView, rentPool } from './supply.js';
import { settleTiers, updateChipIndex, valuationView } from './valuation.js';
import { exchangeOpen as exOpen, exchangeClose as exClose } from './exchange.js';
import { NEWBIE } from '../data/exchange.js';
import { ensureIx, settleTransfers } from './transfer.js';
import { watchClose } from './distill_watch.js';
import { licenseClose, licenseMonth } from './license.js';
import { restructureTick } from './restructure.js';
import { worldBubble } from '../sim/bubble.js';
import { noteBreakthrough } from '../sim/capital.js';
import './poach.js';                                   // 登记“被挖人”的卡片种类

const CAL = new HistoryProvider();
const BOT_EVERY = SELF.BOT_EVERY;
export const AVOID = new Set(['quant_secret', 'deny', 'partial', 'ignore', 'welcome', 'overseas', 'free', 'defend']);
// 重大卡（规格 M.6.4）：有人手上压着它们时全局临时降到 1 档。
export const MAJOR_KINDS = new Set(['super', 'exclusive', 'milestone', 'distill_caught']);
const TIER_ALIAS = { 小作坊: 'small', 初创: 'specialist', 大厂: 'major', small: 'small', specialist: 'specialist', major: 'major' };

const r1 = x => Math.round(x * 10) / 10;
const med = a => {
  if (!a.length) return null;
  const b = [...a].sort((x, y) => x - y);
  return b[Math.floor((b.length - 1) / 2)];
};
const ymOf = day => day.slice(0, 7);
const monthEnd = day => addDays(day, 1).slice(0, 7) !== day.slice(0, 7);
const quarterEnd = day => monthEnd(day) && ['03', '06', '09', '12'].includes(day.slice(5, 7));
const yearFrac = day => Number(day.slice(0, 4)) + daysBetween(`${day.slice(0, 4)}-01-01`, day) / 365;

function normStart(v) {
  if (typeof v === 'number') return `${v}-01`;
  const s = String(v ?? '');
  if (/^\d{4}$/.test(s)) return `${s}-01`;
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  throw new Error(`开局时间只能是 2023-01 / 2024-01 / 2025-01，收到 ${String(v)}`);
}
function normTier(v) {
  const t = TIER_ALIAS[v] || v;
  if (!SELF.TIERS.includes(t)) throw new Error(`开局档只能是 小作坊 / 初创 / 大厂，收到 ${String(v)}`);
  return t;
}
// 稳定的 6 位小写字母数字 id（c_ 开头）。
function companyId(seed, i, name) {
  let h = 2166136261;
  const pool = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  const src = `${seed}|${i}|${name}`;
  for (let k = 0; k < 6; k++) {
    for (const ch of src + k) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    s += pool[(h >>> 0) % pool.length];
  }
  return `c_${s}`;
}
const brandWord = (name, brand) => {
  if (typeof brand === 'string' && brand.trim()) return brand.trim();
  const w = String(name).replace(/(人工智能|智能|科技|实验室|模型|AI)$/u, '').trim();
  return w.length >= 2 ? w : String(name).trim();
};

// 看某个种子的公司顺序（M.3.12 的开局路线按种子轮流取）。
function routeFor(i, seed) { return ROUTE_MIX[(i + (seed % 3)) % ROUTE_MIX.length]; }

// 从零开局。settings：{ seed, start, days, companies: [{ id?, name, brand?, country, tier, kind, bot? }] }
// 分岔开局：createWorld({ mode: 'fork', start, keep, seats, seed, days, bot })，实现见下面的 createForkWorld。
export function createWorld(settings = {}) {
  automationVersion(settings);
  assertRuleSettings(settings);
  if (settings.mode === 'fork') return createForkWorld(settings);
  const seed = Number(settings.seed ?? 11) >>> 0;
  const start = normStart(settings.start ?? '2024-01');
  const startDay = `${start}-01`;
  const days = Math.max(1, Math.floor(Number(settings.days ?? SELF.LENGTH.std)));
  const end0 = addDays(startDay, days - 1);
  // 结束日一律不晚于 END（M.2.2），包含结束日当天的日结。
  const endCap = `${END}-31`;
  const end = end0 > endCap ? endCap : end0;
  const year = Number(start.slice(0, 4));
  const scenario = `y${year}`;
  const specs = (Array.isArray(settings.companies) && settings.companies.length ? settings.companies : DEFAULT_COMPANIES);

  const world = {
    endVersion: 1,
    autoPostVersion: 1,
    v: 2, mode: 'zero', seed, rng: seed, day: startDay, start, startDay, end, mod: 'llm', seq: 0, relSeq: 0, tickNo: 0, ver: 0,
    settings: { seed, start, days, companies: [], ...(settings.mp ? { mp: true } : {}), ...(settings.poach ? { poach: true } : {}), ...roomRules(settings) },   // mp：联机（卡片不挡时间，M.6.4）；poach：开挖人（M.5.6，默认关）
    companies: {},
    rels: [], relMeta: {}, relIds: {}, names: {}, series: {}, brands: {}, brandWords: [],
    events: [],
    label: blankLabel(),
    tech: {}, techSrc: {}, techCalendar: {}, techHasSource: {}, techLog: [],
    ms: {},
    acad: { q: -Infinity, start: 0, startRelId: null, gains: [], publishers: [], log: [] },
    market: { month: null, table: {}, refPrice: null, tam: null, dStar: null },
    supply: { quarter: null, capQ: null, cap: {}, entries: [], byKey: {}, seq: 0, factor: {}, history: [], rent: {} },
    flags: {
      // export：开局已经生效的管制算前人遗产；exportSince 从开局那天起算，管制放宽要看满 365 天。
      export: start >= '2023-10', exportSince: start >= '2023-10' ? startDay : null,
      priceWar: {}, priceWarCool: {}, openShockCool: {}, antitrust: {}, antitrustCool: {}, copyrightCool: {},
      chipShocks: [], apiShocks: [], chipShock: 0, apiShock: 0, apiSeen: {},
      cnThreatSince: null, cnThreatDay: null, shocks: [], hype: 1,
    },
    effortRef: { T: null, K: null },
    valuation: { pool: 0, month: null, tiers: {}, pool0: 0 },
    index: { baseQ: null, base: 1, quarter: null, chip: 100, noShock: 100 },
    exchange: {},
    ix: {},
    news: [], log: [], errors: [], commands: [],
  };

  ensureIx(world);
  const provider = new SimProvider(world);
  provider.openWorld();
  setProvider(provider);
  initTech(world);

  // 各家的规范化 spec（先定 id、开局档、路线，再建公司）。
  const norm = specs.map((sp, i) => {
    const tier = normTier(sp.tier ?? sp.tier0 ?? SELF.TIER);
    const name = String(sp.name ?? sp.company ?? `公司 ${i + 1}`).trim();
    const country = ['US', 'CN', 'EU'].includes(sp.country) ? sp.country : 'US';
    const kind = sp.kind === 'human' ? 'human' : 'bot';
    const stance = typeof sp.stance === 'string' ? sp.stance : routeFor(i, seed);
    const brand = brandWord(name, sp.brand);
    const id = sp.id && /^c_[a-z0-9]{6}$/.test(sp.id) ? sp.id : companyId(seed, i, `${name}|${tier}|${country}|${stance}|${brand}`);
    return { i, id, name, brand, country, tier, kind, stance, bot: sp.bot ?? 'normal' };
  });

  // 学界起点（M.3.7）：取本局最弱那一档（表由 build_academia 生成）。
  const weakest = norm.reduce((a, x) => (SELF.TIERS.indexOf(x.tier) < SELF.TIERS.indexOf(a) ? x.tier : a), 'major');
  acadStart(world, { year, tier: weakest });

  // 建公司（createGameFor 会先 registerCompany，把 spec 写进四张规范表）。
  for (const x of norm) {
    const stance = Object.fromEntries(['y2023', 'y2024', 'y2025', 'y2026'].map(sc => [sc, x.stance]));
    const spec = {
      id: x.id, company: x.name, name: x.brand, label: x.name, country: x.country, tier: x.tier,
      modality: 'llm', org: x.id, families: [x.id], brand: 0.5,
      region: x.country === 'CN' ? 'cn' : 'global', stance,
    };
    const s = createGameFor(spec, scenario, (seed + x.i) >>> 0);
    const c = {
      id: x.id, name: x.name, brand: x.brand, series: [], org: x.id, country: x.country,
      tier0: x.tier, kind: x.kind, seat: x.i, bot: x.bot, joined: startDay, frozen: false,
      s, decideAt: s.day, lastSeq: 0, thinks: 0, thinkDays: [], seen: {}, evalsSeen: {}, techFirsts: {}, techPapers: {}, errors: [],
    };
    world.companies[x.id] = c;
    world.settings.companies.push({ id: x.id, name: x.name, brand: x.brand, country: x.country, tier: x.tier, kind: x.kind, bot: x.bot, stance: x.stance });
    world.brands[normName(x.brand)] = x.id;
    world.brandWords.push({ org: x.id, text: x.brand });
  }

  world.ver = world.rels.length;
  quarterCap(world, startDay, true);
  updateEffortRef(world, startDay);
  mirrorAll(world);
  world.log.push(`${startDay} 从零开局：${Object.keys(world.companies).length} 家，种子 ${seed}，学界起点 q=${r1(world.acad.start)}`);
  // 方法和状态分开：hash() 只哈希状态（不含函数、不含缓存）。
  attachWorld(world);
  initializeAutomationWorld(world);
  return world;
}

// 分岔开局（规格 M.2.2）：真实 LLM 公司照现有 createGame 开局；开局前的真实发布和技术公开留在世界里，
// 联机房间的规则开关（M.6.9）：关做空、关闭源 API 蒸馏、改新手保护天数。只记和默认不同的，默认房间和单人局的世界一字不变。
function roomRules(settings) {
  const out = {};
  if(automationVersion(settings))out.automationVersion=automationVersion(settings);
  if (settings.short === false) out.short = false;
  if (settings.distill === false) out.distill = false;
  const d = Number(settings.protect);
  if (Number.isInteger(d) && d >= 0 && d !== NEWBIE.days) out.protect = d;
  return out;
}
// 按开局前最强模型挑在场家数，被拿掉的公司冻结成只读遗产（开局后不再发布）。
// settings：{ seed, start, days, keep, seats, bot }。seats 可以是公司 id 数组，也可以是 [{ id, kind }]。
function createForkWorld(settings = {}) {
  const seed = Number(settings.seed ?? 11) >>> 0;
  const start = normStart(settings.start ?? '2024-01');
  const startDay = `${start}-01`;
  const year = Number(start.slice(0, 4));
  const scenario = `y${year}`;
  const days = Math.max(1, Math.floor(Number(settings.days ?? SELF.LENGTH.std)));
  const end0 = addDays(startDay, days - 1);
  const endCap = `${END}-31`;
  const end = end0 > endCap ? endCap : end0;
  const bot = settings.bot ?? 'normal';

  // 只开 LLM：图像、音乐、语音那 4 家不进（M.2.2）。
  const pool = COMPANIES.filter(c => c.modality === 'llm');
  const byId = new Map(pool.map(c => [c.id, c]));
  const seatList = (Array.isArray(settings.seats) ? settings.seats : []).map(x => (
    typeof x === 'string' ? { id: x, kind: 'human' } : { id: x?.id, kind: x?.kind ?? 'human' }
  ));
  for (const x of seatList) if (!byId.has(x.id)) throw new Error(`分岔局没有这家公司：${String(x.id)}`);
  const seatIds = new Set(seatList.map(x => x.id));
  // 开局前最强模型：只看这家公司自己的家族、开局日之前的真实发布。
  const preBest = c => {
    const fams = new Set(c.families || [c.id]);
    let q = -Infinity;
    for (const r of REAL_RELEASES) if (r.mod === 'llm' && r.day < startDay && fams.has(r.family)) q = Math.max(q, r.q);
    return q;
  };
  const ranked = [...pool].sort((a, b) => preBest(b) - preBest(a) || (a.id < b.id ? -1 : 1));
  const want = Math.round(Number(settings.keep ?? SELF.FORK_KEEP.desktop) || SELF.FORK_KEEP.desktop);
  const keep = Math.max(seatIds.size, Math.min(ranked.length, want));
  let selected = ranked.slice(0, keep).map(c => c.id);
  // 真人挑的公司一定在场：不在前 keep 就把排最后、且没被真人挑走的那家挤出去。
  for (const id of seatIds) {
    if (selected.includes(id)) continue;
    const drop = [...selected].reverse().find(x => !seatIds.has(x));
    if (drop) selected[selected.indexOf(drop)] = id;
  }
  selected = [...new Set(selected)];
  const frozen = ranked.map(c => c.id).filter(id => !selected.includes(id));

  const world = {
    endVersion: 1,
    autoPostVersion: 1,
    v: 2, mode: 'fork', seed, rng: seed, day: startDay, start, startDay, end, mod: 'llm', seq: 0, relSeq: 0, tickNo: 0, ver: 0,
    settings: { mode: 'fork', seed, start, days, keep, bot, seats: seatList.map(x => x.id), companies: [], ...(settings.mp ? { mp: true } : {}), ...(settings.poach ? { poach: true } : {}), ...roomRules(settings) },
    companies: {},
    rels: [], relMeta: {}, relIds: {}, names: {}, series: {}, brands: {}, brandWords: [],
    legacy: [], legacyIds: [], legacyCount: 0,
    events: [],
    label: blankLabel(),
    tech: {}, techSrc: {}, techCalendar: {}, techHasSource: {}, techLog: [],
    ms: {},
    acad: { q: -Infinity, start: 0, startRelId: null, gains: [], publishers: [], log: [] },
    market: { month: null, table: {}, refPrice: null, tam: null, dStar: null },
    supply: { quarter: null, capQ: null, cap: {}, entries: [], byKey: {}, seq: 0, factor: {}, history: [], rent: {} },
    flags: {
      export: start >= '2023-10', exportSince: start >= '2023-10' ? startDay : null,
      priceWar: {}, priceWarCool: {}, openShockCool: {}, antitrust: {}, antitrustCool: {}, copyrightCool: {},
      chipShocks: [], apiShocks: [], chipShock: 0, apiShock: 0, apiSeen: {},
      cnThreatSince: null, cnThreatDay: null, shocks: [], hype: 1,
    },
    effortRef: { T: null, K: null },
    valuation: { pool: 0, month: null, tiers: {}, pool0: 0 },
    index: { baseQ: null, base: 1, quarter: null, chip: 100, noShock: 100 },
    exchange: {},
    ix: {},
    news: [], log: [], errors: [], commands: [],
  };

  ensureIx(world);
  const provider = new SimProvider(world);
  setProvider(provider);
  FAMILIES.academia = { name: '社区开源基线', company: '学界与开源社区', org: 'academia', mod: 'llm', region: 'global', brand: 0.08 };
  initTech(world);

  // 学界起点（M.3.7）：分岔局取在场公司里最弱那一档。
  const weakest = selected.reduce((a, id) => {
    const t = COMPANY_BY_ID[id].tier;
    return SELF.TIERS.indexOf(t) < SELF.TIERS.indexOf(a) ? t : a;
  }, 'major');
  acadStart(world, { year, tier: weakest });

  // 开局前的真实发布全部留下，算前人遗产；开局以后不再有写死的发布。
  const legacyRows = REAL_RELEASES
    .filter(r => r.mod === 'llm' && r.day < startDay)
    .sort((a, b) => a.day.localeCompare(b.day) || a.ord - b.ord);
  const legacyMeta = [];
  for (const r of legacyRows) {
    const { meta } = appendRelease(world, {
      family: r.family, org: OWNER_OF[r.family] ?? r.org, date: r.date, day: r.day, name: r.name, cls: r.cls,
      open: r.open, price: r.price, tags: r.tags.join(','), dims: r.dims, q: r.q, kin: [],
    });
    meta.legacy = true;
    world.relMeta[meta.relId].legacy = true;
    world.legacy.push(meta.relId);
    world.legacyIds.push(meta.relId);
    legacyMeta.push(meta);
  }

  // 开局前的技术公开也留着：公司来源照 TECH_SRC，学界来源已由 initTech 写进账本。
  const startYm = start;
  for (const [id, list] of Object.entries(TECH_SRC)) {
    if (TECH_BY_ID[id]?.mod !== 'llm') continue;
    for (const [ym, fam, level, note] of list || []) {
      if (ym > startYm || fam === 'academia') continue;
      world.techHasSource[id] = true;
      world.techSrc[id] ??= [];
      world.techSrc[id].push([ym, fam, level, note || '']);
      const cur = world.tech[id]?.level ?? 'none';
      if (LEVELS.indexOf(level) > LEVELS.indexOf(cur)) {
        world.tech[id] = { level, by: OWNER_OF[fam] ?? fam, since: `${ym}-01`, cal: true };
      }
    }
  }

  // 用世界账本的规则（M.3.4）把开局前的真实发布回放一遍，得到初始 world.label。
  // “炼出过”不靠这段回放，按 D10.4 的 seedOf 记在 s.sota.before 上。
  for (const meta of legacyMeta) offerLabel(world, meta, meta.day);
  world.label.made = {};
  world.label.steadySince = null;

  // 建公司：真人挑的照真人，其余由电脑经营；被拿掉的不建 s，冻结成只读遗产。
  const seatOf = new Map(seatList.map((x, i) => [x.id, i]));
  selected.forEach((id, i) => {
    const company = byId.get(id);
    const human = seatIds.has(id);
    const s = createGame(id, scenario, (seed + i) >>> 0);
    s.sota.before = seedOf(company.org, 'llm', startDay) === '★';
    const firstFam = (company.families || [id])[0];
    world.companies[id] = {
      id, name: company.company, brand: FAMILIES[firstFam]?.name || company.name || id,
      series: [], org: id, realOrg: company.org, country: company.country, tier0: company.tier,
      kind: human ? 'human' : 'bot', seat: seatOf.has(id) ? seatOf.get(id) : i,
      bot: human ? 'normal' : bot, joined: startDay, frozen: false,
      s, decideAt: s.day, lastSeq: 0, thinks: 0, thinkDays: [], seen: {}, evalsSeen: {},
      techFirsts: {}, techPapers: {}, errors: [], seed: seedOf(company.org, 'llm', startDay),
    };
    world.settings.companies.push({
      id, name: company.company, brand: world.companies[id].brand, country: company.country,
      tier: company.tier, kind: human ? 'human' : 'bot', bot: human ? 'normal' : bot, frozen: false, seat: world.companies[id].seat,
    });
  });
  for (const id of frozen) {
    const company = byId.get(id);
    world.companies[id] = {
      id, name: company.company, brand: FAMILIES[(company.families || [id])[0]]?.name || company.name || id,
      series: [], org: id, realOrg: company.org, country: company.country, tier0: company.tier,
      kind: 'bot', seat: null, bot, joined: startDay, frozen: true, s: null,
      decideAt: startDay, lastSeq: 0, thinks: 0, thinkDays: [], seen: {}, evalsSeen: {},
      techFirsts: {}, techPapers: {}, errors: [], seed: seedOf(company.org, 'llm', startDay),
    };
    world.settings.companies.push({
      id, name: company.company, brand: world.companies[id].brand, country: company.country,
      tier: company.tier, kind: 'bot', bot, frozen: true, seat: null,
    });
  }

  world.ver = world.rels.length;
  world.legacyCount = legacyMeta.length;
  quarterCap(world, startDay, true);
  updateEffortRef(world, startDay);
  mirrorAll(world);
  world.log.push(`${startDay} 分岔开局：在场 ${selected.length} 家（真人 ${seatIds.size}），冻结 ${frozen.length} 家，种子 ${seed}，学界起点 q=${r1(world.acad.start)}`);
  attachWorld(world);
  initializeAutomationWorld(world);
  return world;
}

// 给世界对象装上方法和短名字（读档后由 save/migrateWorld 再装一次）。
export function attachWorld(world) {
  world.tick = (opts = {}) => tick(world, opts);
  world.hash = () => hash(world);
  world.command = (id, cmd) => command(world, id, cmd);
  world.publicView = seat => publicView(world, seat);
  world.privateView = id => privateView(world, id);
  return world;
}

// ---------- 命令段 ----------
// 真人命令：world.command(id, { name, args }) 排进今天；电脑公司的决定在这一步调用 botStep。
export function command(world, id, cmd) {
  if (world.endVersion === 1 && (world.result || world.day > world.end)) return 0;
  world.commands.push({ at: world.day, id, cmd });
  return world.commands.length;
}
// 立即执行一条命令（联机服务器用，M.6.5）：和命令段同一套做法（分配序号、写世界日志、登记送评的名字），
// 只是不等到下一次日结，好当场回 {ok, err}。两次日结之间按到达顺序执行，重放时按日志同样的顺序执行，结果逐位一致。
export function applyNow(world, id, cmd) {
  if (world.endVersion === 1 && (world.result || world.day > world.end)) return { ok: false, err: '这一局已经结束了' };
  const c = world.companies[id];
  if (!c || !c.s) return { ok: false, err: '没有这家公司' };
  if (c.s.status !== 'playing') return { ok: false, err: '这家公司已经不在场了' };
  // 被拒的命令一点都不改世界（不占序号、不写世界日志）：服务器日志只记成功的，重放时才不会走岔。
  const r = applyCommand(c.s, cmd, { world, companyId: id, multiplayer: !!world.settings?.mp });
  if (!r.ok) return r;
  const seq = ++world.seq;
  c.lastSeq = seq;
  world.log.push({ day: world.day, org: id, seq, cmd: cmd?.name ?? null, ok: true, err: null });
  trackEvals(world, c, cmd?.name);
  return { ...r, seq };
}

function resolveAll(s, errors, human = false) {
  let guard = 0;
  while (s.queue.length && s.status === 'playing' && guard++ < 50) {
    let ev;
    try { ev = currentEvent(s); } catch (e) { errors.push(`${s.day} 事件视图: ${e.message}`); return; }
    if (!ev) return;
    const opts = (ev.choices || []).filter(c => !c.disabled);
    const pick = human && ev.id === 'ipo_window' ? opts.find(o => o.id === 'later') : opts.find(o => !AVOID.has(o.id)) || opts[0];
    if (!pick) return;
    try { resolveEvent(s, pick.id); } catch (e) { errors.push(`${s.day} 处理事件: ${e.message}`); return; }
  }
}
function trackEvals(world, c, cmdName = null) {
  for (const e of c.s.evals || []) {
    if (c.evalsSeen[e.id]) continue;
    c.evalsSeen[e.id] = true;
    const name = e.plan?.name;
    if (!name) continue;
    // 名字已经在 submitEval 里登记过（M.5.4）：这里只补 evalId，别把原样名字和近似名记录冲掉。
    const k = normName(name);
    const prev = world.names[k] || {};
    world.names[k] = { ...prev, org: c.id, name: prev.name || name, evalId: e.id, modelId: e.modelId };
  }
  if (cmdName === 'submitEval') { /* 送评当天就发布的（skip）由 appendRelease 登记 */ }
}
function runCommands(world) {
  const D = world.day;
  const due = world.commands.filter(x => x.at <= D);
  if (due.length) world.commands = world.commands.filter(x => x.at > D);
  for (const q of due) {
    const c = world.companies[q.id];
    if (!c || c.s.status !== 'playing') continue;
    c.lastSeq = ++world.seq;
    const r = applyCommand(c.s, q.cmd, { world, companyId: c.id, multiplayer: !!world.settings?.mp });
    world.log.push({ day: D, org: c.id, seq: c.lastSeq, cmd: q.cmd?.name ?? null, ok: !!r.ok, err: r.err ?? null });
    if (r.ok) trackEvals(world, c, q.cmd?.name);
    else c.errors.push(`${D} 命令 ${q.cmd?.name}: ${r.err}`);
  }
  for (const c of Object.values(world.companies).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const s = c.s;
    // 托管中的真人公司（联机掉线，M.6.3）按被动档跑。
    if (managedAutomationHuman(world,c) || (c.kind !== 'bot' && !c.hosted) || !s || s.status !== 'playing' || s.day < c.decideAt) continue;
    try {
      // 难度：多久想一次读 P().botParams 的 EVERY_DAYS（easy 14 / normal 7 / hard 3 / passive 1）。
      const bp = c.hosted ? { EVERY_DAYS: BOT_EVERY.passive } : P().botParams(s);
      resolveAll(s, c.errors, c.kind === 'human');
      c.lastSeq = ++world.seq;
      c.thinks = (c.thinks || 0) + 1;
      (c.thinkDays ??= []).push(s.day);
      botThink(world, c);
      trackEvals(world, c);
      resolveAll(s, c.errors, c.kind === 'human');
      c.decideAt = addDays(s.day, bp.EVERY_DAYS ?? BOT_EVERY[c.bot] ?? 7);
    } catch (e) {
      c.errors.push(`${s.day} 命令抛错: ${e.message}`);
    }
  }
}

// ---------- 开盘 ----------
// 冲顶力参照（M.3.5 第 4 条）：在场公司训练算力和技术积累的中位数，下限是日历值的 2% / 10%。
export function updateEffortRef(world, day = world.day) {
  const live = Object.values(world.companies).filter(c => c.s && c.s.status === 'playing').map(c => c.s);
  if (!live.length) return world.effortRef;
  const y = yearFrac(day);
  const T = med(live.map(s => trainFlops(s) / 1e21));
  const K = med(live.map(s => s.know || 0));
  const floorT = CAL.effortRef('train', 'llm', y) * SELF.EFFORT_FLOOR.T;
  const floorK = CAL.effortRef('know', 'llm', y) * SELF.EFFORT_FLOOR.K;
  world.effortRef = {
    T: Math.max(T * SELF.EFFORT_REF.T, floorT),
    K: Math.max(K * SELF.EFFORT_REF.K, floorK),
  };
  return world.effortRef;
}

function mirrorAll(world) {
  const day = world.day;
  for (const [id, c] of Object.entries(world.companies)) {
    if (!c.s) continue;
    projectSota(world, id, c.s);
    projectFirsts(world, id, c.s);
    c.s.world ??= {};
    c.s.world.hype = world.flags.hype ?? 1;
    // 价格战按地区：中国公司受中国和全球两场影响，其余公司只看全球。
    const war = world.flags.priceWar || {};
    const inCN = c.s.company?.country === 'CN' && war.CN && day <= war.CN;
    const inGlobal = war.global && day <= war.global;
    c.s.world.priceWar = !!(inCN || inGlobal);
    // API 份额镜像给董事会目标（M.3.11 的 share）。
    const share = apiShareOf(world, id, day);
    c.s.world.apiShare = share.share;
    c.s.world.apiAvg = share.avg;
    c.s.world.apiRegion = share.region;
  }
}
function openDay(world, day) {
  // 每天先把新下的显卡订单记进世界账本：到货以后 s.orders 会删掉，季末仍要按整季的订单统一结算。
  trackOrders(world, day);
  if (monthEnd(day)) {
    settleMarket(world, day);                       // M.3.8 第 1、2 条
    // 估值快照在开盘时一次算好：各家月结只读这一份，结果和推进顺序无关。
    valuationView(world, day, { fresh: true });
  }
  if (quarterEnd(day)) {
    settleSupply(world, day);                       // M.3.8 第 3 条
    updateChipIndex(world, day);                    // M.3.8 第 6 条
    settleTiers(world, day);                        // M.3.8 第 5 条
  }
  updateEffortRef(world, day);
  exchangeOpen(world, day);                         // 借券费、强平、价值资金拉回（M.5.5）
  mirrorAll(world);
}

// 交易所的公开部分：池子、价格、指数、持股公示都公开；当天各家的成交额和保证金追缴名单不公开（会暴露谁在做空）。
function publicExchange(ex) {
  if (!ex) return {};
  const listings = Object.fromEntries(Object.entries(ex.listings || {}).map(([org, L]) => {
    const { calls, ...rest } = L;
    void calls;
    return [org, clone(rest)];
  }));
  return { listings, sector: clone(ex.sector || {}), notices: clone(ex.notices || {}) };
}
// 互动账本的公开部分（M.6.6）：公开指控、许可分成、受限开源条款、署名衍生、重组和清算、各家抓到蒸馏的次数。
// 不公开：转账明细、谁在买谁的 API、没处理完的案子（会暴露谁在蒸馏谁）。
function publicIx(ix) {
  if (!ix) return {};
  const caught = {};
  for (const c of Object.values(ix.cases || {})) if (c.status === 'done' && c.choice !== 'ban') caught[c.tea] = (caught[c.tea] || 0) + 1;
  const restr = Object.fromEntries(Object.entries(ix.restr || {}).filter(([, r]) => r.count || r.liquidated).map(([org, r]) => [org, { count: r.count, day: r.day, until: r.until, liquidated: !!r.liquidated }]));
  return { public: clone(ix.public || []), terms: clone(ix.terms || {}), derivs: clone(ix.derivs || {}), caught, restr };
}
// 触发器（M.3.9）、交易所（M.5.5，M2a）的钩子。交易所的开盘、收盘见 world/exchange.js。
function exchangeOpen(world, day) { void day; exOpen(world); }
function exchangeClose(world, day) { void day; exClose(world); }
function checkTriggers(world, day) { return runTriggers(world, day); }
function pushToClients(world, day) { /* M3 填 */ }

// ---------- 各家推进 ----------
function advance(world, { reverse = false } = {}) {
  const ids = Object.keys(world.companies).sort();
  const n = ids.length;
  const off = n ? world.tickNo % n : 0;
  const order = [...ids.slice(off), ...ids.slice(0, off)];
  if (reverse) order.reverse();
  for (const id of order) {
    const c = world.companies[id];
    const s = c.s;
    if (!s || s.status !== 'playing') continue;
    try {
      // 联机里真人的卡留在收件箱，公司照常推进（到期由服务器发 sys.autoResolve 处理，M.6.4）；单人、电脑和托管中的公司照旧先处理完再走。
      const inbox = !!world.settings?.mp && c.kind === 'human' && (!c.hosted || managedAutomationHuman(world,c));
      if (!inbox && s.queue.length) resolveAll(s, c.errors, c.kind === 'human');
      if (!inbox && s.queue.length) continue;      // 卡片没处理完就不走时间（queueBlocks）
      tickDay(s, {world,id:c.id,execute:cmd=>applyNow(world,c.id,cmd)});
      // 收件箱里的卡记下进来的那一天（期限按 10 个游戏日算）。
      if (inbox) for (const q of s.queue) if (q && q.since === undefined) q.since = world.day;
    } catch (e) {
      c.errors.push(`${s.day} 抛错: ${e.message}`);
      s.status = 'crashed';
      world.errors.push({ org: id, day: world.day, message: e.message });
    }
  }
  return order;
}

// ---------- 收盘 ----------
function collectFresh(world, day) {
  const out = [];
  for (const c of Object.values(world.companies)) {
    const s = c.s;
    if (!s) continue;
    for (const m of s.models || []) {
      if (m.stage !== 'released' || m.releasedDay !== day || m.hist || c.seen[m.id]) continue;
      c.seen[m.id] = day;
      const kin = kinOf(world, c.id, m);
      out.push({ c, m, q: qOf('llm', m.dims), seq: c.lastSeq, kin });
    }
  }
  out.sort((a, b) => b.q - a.q || a.seq - b.seq);
  return out;
}

function closeDay(world, day) {
  // 1. 当天的新发布，按 q 从高到低、同分按送评 seq 逐条追加。
  const cands = collectFresh(world, day);
  const fresh = [];
  for (const x of cands) {
    const row = rowForModel(x.c.id, x.m, { day, date: ymOf(day), kin: x.kin, seq: x.seq || undefined });
    const { rel, meta } = appendRelease(world, row);
    // 名字从送评预订转正，并登记系列词；然后给这一款的每个已上线基准打分（M.5.4）。
    noteRelease(world, x.c.id, x.m.name);
    scoreRelease(world, meta, x.m);
    fresh.push({ ...x, rel, meta, lab: null });
    world.news.unshift({ date: ymOf(day), day, type: 'release', family: x.c.id, title: `${x.c.name} 发布 ${x.m.name}`, detail: `${x.m.open ? '开源权重' : '闭源'} · q ${r1(meta.q)}` });
  }
  // 2. 过世界标签（M.3.4），包括稳坐检查。
  for (const x of fresh) x.lab = offerLabel(world, x.meta, day);
  const steady = steadyCheck(world, day);
  // 3. 行业第一次（M.3.10）。
  const firsts = registerFirsts(world, fresh, day);
  // 4. 技术账本：学界日历、各家的 secret / proof / paper / open、自动升档。
  techCalendarTick(world, day);
  for (const c of Object.values(world.companies)) if (c.s) refreshCompanyTech(world, c);
  for (const x of fresh) refreshReleaseTech(world, x.c.id, x.m);
  techAuto(world);
  // 5. 月末学界跟进（M.3.7）。
  let acadRow = null;
  if (monthEnd(day)) {
    acadRow = acadFollow(world, day);
    if (acadRow) { noteRelease(world, 'academia', acadRow.name); scoreRelease(world, acadRow); }
  }
  // 6. 触发器（M.3.9）。7. 交易所收盘（M2）。
  checkTriggers(world, day);
  // 近似名的商标异议在触发器之后处理：电脑公司按现金流确定性选，真人留一张二选一的卡。
  objectionTick(world, day);
  // 互动（M2b）：闭源 API 蒸馏的检测和电脑老师的处置；受限开源的条款、衍生和违约；月底的署名品牌和大户分成。
  watchClose(world, day);
  licenseClose(world, day, fresh);
  if (monthEnd(day)) licenseMonth(world, day);
  exchangeClose(world, day);
  // 公司之间的钱收盘统一入账六成（M.5.9），然后数现金连续为负的天数（M.5.8 重组、清算）。
  settleTransfers(world, day);
  restructureTick(world, day);
  // AI 泡沫的检查点（规格 K5）：开局后 75% 处对全世界判一次。
  worldBubble(world, day);
  // 8. 给当天发布的快照补写标签结果和期待判定（自洽模式下从 releaseNow 挪到这里）。
  for (const x of fresh) {
    const h = world.label.holder;
    const got = !!h && h.relId === x.meta.relId;
    const lab = { got, prev: x.lab?.prev ?? null, via: got ? h.via : null, counted: got ? h.counted : false };
    if (got) { x.m.sota = { from: day, until: null }; noteBreakthrough(x.c.s, 'sota'); }
    try { judgeRelease(x.c.s, x.m, lab); } catch (e) { x.c.errors.push(`${day} 期待判定: ${e.message}`); }
  }
  // 被换掉的自家快照记上 until。
  for (const [id, c] of Object.entries(world.companies)) {
    if (!c.s) continue;
    const own = world.label.holder?.org === id ? world.label.holder.modelId : null;
    for (const m of c.s.models || []) if (m.sota && !m.sota.until && m.id !== own) m.sota.until = day;
  }
  // 9. 回写镜像；场地凑满后补评推迟的期待。
  mirrorAll(world);
  for (const c of Object.values(world.companies)) {
    if (!c.s) continue;
    try { judgeDeferred(c.s); } catch (e) { c.errors.push(`${day} 补评: ${e.message}`); }
  }
  // 10. 别家的发布排进各家 s.scheduled（次日早上可见）。
  for (const x of fresh) {
    for (const c of Object.values(world.companies)) {
      if (c.id === x.c.id || !c.s || c.s.status !== 'playing') continue;
      c.s.scheduled.push({ at: addDays(day, 1), ...releaseEntry(x.rel) });
    }
  }
  if (acadRow) {
    const rel = { family: 'academia', name: acadRow.name, date: ymOf(day), day, open: true, cls: 'large' };
    for (const c of Object.values(world.companies)) {
      if (!c.s || c.s.status !== 'playing') continue;
      c.s.scheduled.push({ at: addDays(day, 1), ...releaseEntry(rel) });
    }
  }
  // 11. 联机时推送给客户端（M3）。
  pushToClients(world, day);
  return { fresh, steady, firsts, acadRow };
}

// 一天怎么结：两段式日结（M.4）。
export function tick(world, opts = {}) {
  assertAutomationWorld(world);
  const D = world.day;
  if (finishWorld(world)) return { day: D, ended: true };
  // 单人自洽：真人的卡片照旧暂停游戏（M.4 第 5 条）。联机（settings.mp）里卡片不挡时间，进收件箱（M.6.4）。
  if (!world.settings?.mp) for (const c of Object.values(world.companies)) {
    if (!world.settings?.mp && c.kind === 'human') postOnlyEvents(c.s);
    if (c.kind === 'human' && c.s && c.s.status === 'playing' && c.s.queue.length) return { day: D, paused: true };
  }
  quarterCap(world, D);
  runCommands(world);
  openDay(world, D);
  advance(world, opts);
  const out = closeDay(world, D);
  world.ver = world.rels.length;
  world.day = addDays(D, 1);
  // 在暴露新日期给客户端/立即命令之前建立当季基数与当天GPU日程。
  quarterCap(world, world.day);
  world.tickNo += 1;
  const result = finishWorld(world);
  return { day: D, ...out, ...(result ? { ended: true } : {}) };
}

// ---------- 联机的系统命令（M.6.3、M.6.4、M.6.9）：服务器先把系统命令写进日志，再调这些函数，重放时按同样顺序执行 ----------
// 收件箱：这家公司手上压着的卡（真人才有；电脑和托管的当场处理掉了）。
export function inboxOf(world, id) {
  const s = world.companies[id]?.s;
  if (!s) return [];
  return s.queue.map((q, at) => ({ at, kind: q?.kind ?? 'event', id: q?.id ?? null, since: q?.since ?? world.day, major: MAJOR_KINDS.has(q?.kind ?? 'event') }));
}
// 到期自动处理一张卡：选第一个能选、不在 AVOID 里的选项（蒸馏指控卡的第一个就是“封号不声张”）。返回 { title, choice } 或 null。
export function autoResolve(world, id, at = 0) {
  const s = world.companies[id]?.s;
  if (!s || s.status !== 'playing' || !s.queue[at]) return null;
  const ev = currentEvent(s, at);
  if (!ev) return null;
  const opts = (ev.choices || []).filter(c => !c.disabled);
  // 到期不是上市授权：真人（含掉线托管）默认暂缓；NPC 的既有策略不变。
  const pick = world.companies[id]?.kind === 'human' && ev.id === 'ipo_window'
    ? opts.find(o => o.id === 'later') : opts.find(o => !AVOID.has(o.id)) || opts[0];
  if (!pick) return null;
  const r = resolveEvent(s, pick.id, at);
  return { title: r.title, choice: pick.id };
}
// 托管和交还（掉线 60 秒 / 回来）：托管中的公司按被动档跑，卡片当场按默认项处理。
export function setHosted(world, id, on) {
  const c = world.companies[id];
  if (!c || c.kind !== 'human') throw new Error('只有真人公司能托管');
  if (on) c.hosted = true; else delete c.hosted;
  return !!c.hosted;
}
// 中途加入只能接管电脑公司（M.6.8）：变成真人，排到最后一个座位。
export function takeover(world, id) {
  const c = world.companies[id];
  if (!c || c.frozen === true || c.kind !== 'bot' || !c.s || c.s.status !== 'playing') throw new Error('只能接管还在场的电脑公司');
  const automationError=automationStateError(c.s);
  if(automationError)throw new Error(automationError);
  const seats = Object.values(world.companies).filter(x => x.kind === 'human').map(x => x.seat ?? 0);
  c.kind = 'human';
  c.seat = seats.length ? Math.max(...seats) + 1 : 0;
  c.decideAt = c.s.day;
  if(automationVersion(world.settings))enableAutomation(c.s);
  return c.seat;
}

// ---------- 视图（M.6.6） ----------
// 公开视图只放“人人看得到”和“只给档位”里公开的那部分：不出现别家的现金、在练模型、作业、送评候选、
// API 老师、完整血统、rng、seed。私密视图给自己看（服务器和本人座位用），带完整 s。
const clone = x => JSON.parse(JSON.stringify(x));
const seatIdOf = (world, seat) => {
  if (seat === null || seat === undefined) return null;
  if (typeof seat === 'string') return world.companies[seat] ? seat : null;
  const c = Object.values(world.companies).find(x => x.seat === Number(seat));
  return c?.id ?? null;
};
const publicCompany = c => ({
  id: c.id, name: c.name, brand: c.brand, country: c.country, tier: c.tier0 ?? c.s?.company?.tier ?? null,
  kind: c.kind, seat: c.seat ?? null, bot: c.bot ?? null, joined: c.joined ?? null, frozen: !!c.frozen,
  ...(c.hosted ? { hosted: true } : {}),                       // 联机：掉线 60 秒转托管（M.6.3），人人看得到
});
const publicRel = m => ({
  relId: m.relId, org: m.org, modelId: m.modelId ?? null, name: m.name, q: m.q, dims: { ...m.dims },
  day: m.day, date: m.date, open: !!m.open, license: m.license ?? null, cls: m.cls ?? null,
  techs: [...(m.techs || [])], bench: { ...(m.bench || {}) }, contam: { ...(m.contam || {}) },
  seq: m.seq ?? null, legacy: !!m.legacy,
});
const publicHolder = h => (h ? {
  org: h.org, relId: h.relId, modelId: h.modelId ?? null, name: h.name, q: h.q,
  day: h.day, since: h.since ?? h.day, via: h.via ?? null, counted: !!h.counted, countedAt: h.countedAt ?? null,
} : null);

export function publicView(world, seat = null) {
  const you = seatIdOf(world, seat);
  const rels = Object.entries(world.relMeta || {})
    .sort((a, b) => a[1].day.localeCompare(b[1].day) || (a[1].seq ?? 0) - (b[1].seq ?? 0))
    .map(([, m]) => publicRel(m));
  const tech = {};
  for (const [id, x] of Object.entries(world.tech || {})) if (['proof', 'paper', 'open'].includes(x.level)) tech[id] = { level: x.level, by: x.by, since: x.since };
  const label = {
    holder: publicHolder(world.label?.holder),
    field: [...(world.label?.field || [])],
    log: (world.label?.log || []).map(h => ({ ...publicHolder(h), until: h.until ?? null })),
    made: clone(world.label?.made || {}),
    steadySince: world.label?.steadySince ?? null,
  };
  return {
    v: world.v, mode: world.mode, day: world.day, start: world.start, end: world.end, mod: world.mod,
    seq: world.seq, tickNo: world.tickNo, ver: world.rels.length, you,
    ...(world.result ? { result: clone(world.result) } : {}),
    settings: {
      mode: world.settings?.mode ?? world.mode, start: world.settings?.start ?? world.start,
      days: world.settings?.days ?? null, keep: world.settings?.keep ?? null, bot: world.settings?.bot ?? null,
      seats: clone(world.settings?.seats || []),
      ...(automationVersion(world.settings)?{automationVersion:automationVersion(world.settings)}:{}),
      companies: (world.settings?.companies || []).map(x => ({ ...x })),
    },
    companies: Object.values(world.companies).map(publicCompany),
    rels, label, tech,
    acad: { q: world.acad?.q ?? null, start: world.acad?.start ?? null, startRelId: world.acad?.startRelId ?? null, gains: [...(world.acad?.gains || [])] },
    ms: clone(world.ms || {}),
    market: clone(world.market || {}),
    valuation: { pool: world.valuation?.pool ?? 0, month: world.valuation?.month ?? null, pool0: world.valuation?.pool0 ?? 0 },
    exchange: publicExchange(world.exchange),
    ix: publicIx(world.ix),
    flags: {
      export: !!world.flags?.export, priceWar: clone(world.flags?.priceWar || {}),
      shocks: clone(world.flags?.shocks || []), hype: world.flags?.hype ?? 1,
    },
    news: clone(world.news || []),
    events: clone(world.events || []),
    // 联机客户端的镜像要用的公开汇总（M.6.6、M4）：完整发布表（名字、日期、量级、开闭源、各维分数、价格档、标签），
    // 自定义公司的设定，季度卡配额和季末统一价系数，租卡池总量，两只指数，难度参照，档位，技术来源，已被占用的名字（不说是谁），泡沫。
    relRows: clone(world.rels || []),
    specs: Object.values(world.companies).map(c => (c.s?.company?.custom === true ? clone(c.s.company) : null)).filter(Boolean),
    supply: publicSupply(world),
    index: clone(world.index || {}),
    effortRef: clone(world.effortRef || {}),
    tiers: Object.fromEntries(Object.entries(world.valuation?.tiers || {}).map(([id, t]) => [id, { tier: t.tier, rank: t.rank ?? null }])),   // 只给档位，不给估值
    techSrc: clone(world.techSrc || {}), techHasSource: clone(world.techHasSource || {}),
    nameKeys: Object.keys(world.names || {}).sort(),
    bubble: clone(world.flags?.bubble ?? null),
  };
}
// 供给池的公开部分：本季度各型号配额、季末统一价系数、租卡池的总供给 / 总需求 / 价格系数（不说各家租了多少）。
function publicSupply(world) {
  if (!world.supply) return {};
  let rent = null;
  try { rent = rentPool(world, world.day); } catch { rent = null; }
  return { quarter: world.supply.quarter ?? null, cap: clone(quarterCapView(world, world.day)), factor: clone(world.supply.factor || {}), rent: rent && { supply: rent.supply, demand: rent.demand, factor: rent.factor } };
}

// 终局公开（M.6.6）：每一款发布的完整血统（续训底座、开源老师、API 老师、合成教材所在的公司），复盘页用。
export function revealView(world) {
  return Object.values(world.relMeta || {}).sort((a, b) => a.day.localeCompare(b.day) || (a.seq ?? 0) - (b.seq ?? 0))
    .map(m => ({ relId: m.relId, org: m.org, name: m.name, day: m.day, q: m.q, kin: [...(m.kin || [])] }));
}

export function privateView(world, id) {
  const c = world.companies?.[id];
  if (!c) return null;
  return {
    id,
    company: publicCompany(c),
    public: publicView(world, c.seat),
    s: c.s ? clone(c.s) : null,
  };
}

// ---------- 摘要与确定性 ----------
export function companyList(world) {
  return Object.values(world.companies).sort((a, b) => (a.id < b.id ? -1 : 1));
}
export function worldBest(world, day = world.day) { return companyBest(world, day); }

function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    const keys = Object.keys(v).sort().filter(k => typeof v[k] !== 'function' && v[k] !== undefined);
    return `{${keys.map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}
// 世界状态的稳定哈希（不含函数、不含缓存），用来查确定性和推进顺序无关。
export function hash(world) {
  const view = {
    v: world.v, mode: world.mode, seed: world.seed, rng: world.rng, day: world.day, start: world.start, end: world.end,
    mod: world.mod, seq: world.seq, relSeq: world.relSeq, tickNo: world.tickNo, ver: world.ver, settings: world.settings,
    endVersion: world.endVersion, autoPostVersion: world.autoPostVersion,
    ...(world.result ? { result: world.result } : {}),
    legacy: world.legacy, legacyIds: world.legacyIds, legacyCount: world.legacyCount,
    companies: world.companies, rels: world.rels, relMeta: world.relMeta, relIds: world.relIds, names: world.names, series: world.series,
    brands: world.brands, brandWords: world.brandWords, events: world.events, label: world.label, tech: world.tech, techSrc: world.techSrc,
    techCalendar: world.techCalendar, techHasSource: world.techHasSource, techLog: world.techLog, ms: world.ms,
    acad: world.acad, market: world.market, supply: world.supply, flags: world.flags, effortRef: world.effortRef,
    valuation: world.valuation, index: world.index, exchange: world.exchange, ix: world.ix, news: world.news, log: world.log, errors: world.errors,
  };
  return hash16(stable(view));
}
// 纯 JS 的稳定哈希：两路 32 位乘法散列拼成 16 位十六进制。世界代码要在浏览器里跑（引擎会转出这个模块），
// 不能用 node:crypto。只用于确定性比对，不做任何安全用途。
function hash16(str) {
  let h1 = 0x811c9dc5, h2 = 0x9e3779b9;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
    h2 ^= h2 >>> 15;
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 0x85ebca6b) ^ str.length;
  h2 = Math.imul(h2 ^ (h2 >>> 13), 0xc2b2ae35) ^ h1;
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

export { SimProvider } from './sim_provider.js';
export { acadTarget, acadFollow, acadStart } from './academia.js';
export { projectSota, offerLabel, steadyCheck, companyBest, acadBest } from './label.js';
export { appendRelease, tagsOf } from './release.js';
export { initTech, techUp, techAuto, levelAt } from './tech.js';
