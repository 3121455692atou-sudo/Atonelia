// 联机客户端的镜像（规格 M.6.5）：客户端不跑 tickDay，只拿服务器推来的公开视图（publicView）和自家的 s。
// 把公开视图拼成一个只读的“镜像世界”（mirror: true），装上 MirrorProvider（SimProvider 的子类），
// 页面照常调 P() 读市场、算力、榜单、交易所。要汇总各家私有状态的读口（租卡池、季度配额）在镜像里直接读公开汇总；
// 本地算的预估（jobCheck、previewProject 这类）以服务器为准。
import { SimProvider, ensureAcademiaFamily } from './sim_provider.js';
import { setProvider, registerCompany, companiesSnapshot, restoreCompanies } from '../sim/provider.js';
import { setReleases } from '../data/rivals.js';
import { RELEASE_DAYS_OVERRIDES } from '../data/release_days_overrides.js';
import { COMPANY_BY_ID } from '../data/core.js';
import { initExchange } from './exchange.js';
import { normName } from './release.js';

// 模块加载时的公司登记表（史实 24 家）：每次进联机先恢复成它，再登记这一局的公司。
const BASE = companiesSnapshot();
const clone = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

export class MirrorProvider extends SimProvider {
  mirror = true;
  queueBlocks = false;        // 联机里卡片不挡时间（M.6.4）
  // 估值只在服务器月结时算；客户端读自家 s 里的那个数。
  valuation(s) { return s.valuation || 0; }
}

// 公开视图 → 镜像世界。只放读口用得到的字段；别家的 s 一律是 null。
export function mirrorWorld(pub, S) {
  const startDay = `${pub.start}-01`;
  const relMeta = {}, relIds = {};
  for (const r of pub.rels || []) {
    relMeta[r.relId] = { ...clone(r), kin: [r.org] };          // 完整血统不公开：只知道是谁发的
    relIds[r.relId] = r.org;
  }
  const w = {
    v: pub.v, mode: pub.mode, mirror: true, seed: 0, rng: 0, day: pub.day, start: pub.start, startDay, end: pub.end, mod: pub.mod ?? 'llm',
    seq: pub.seq ?? 0, relSeq: (pub.rels || []).length, tickNo: pub.tickNo ?? 0, ver: (pub.relRows || []).length,
    settings: clone(pub.settings || {}),
    companies: {},
    rels: clone(pub.relRows || []), relMeta, relIds,
    names: Object.fromEntries((pub.nameKeys || []).map(k => [k, { org: null, relId: null }])),
    series: {}, brands: {}, brandWords: [], legacy: [], legacyIds: [], legacyCount: 0,
    events: clone(pub.events || []),
    label: { holder: null, field: [], log: [], made: {}, steadySince: null, ...clone(pub.label || {}) },
    tech: clone(pub.tech || {}), techSrc: clone(pub.techSrc || {}), techHasSource: clone(pub.techHasSource || {}), techCalendar: {}, techLog: [],
    ms: clone(pub.ms || {}),
    acad: { q: -Infinity, start: 0, startRelId: null, gains: [], publishers: [], log: [], ...clone(pub.acad || {}) },
    market: { month: null, table: {}, refPrice: null, tam: null, dStar: null, ...clone(pub.market || {}) },
    supply: { quarter: null, capQ: null, entries: [], byKey: {}, seq: 0, history: [], factor: {}, rent: null, ...clone(pub.supply || {}) },
    flags: {
      export: false, priceWar: {}, shocks: [], hype: 1, chipShocks: [], apiShocks: [], chipShock: 0, apiShock: 0,
      ...clone(pub.flags || {}), bubble: clone(pub.bubble ?? null),
    },
    effortRef: { T: null, K: null, ...clone(pub.effortRef || {}) },
    valuation: { pool: 0, month: null, pool0: 0, ...clone(pub.valuation || {}), tiers: clone(pub.tiers || {}) },
    index: { baseQ: null, base: 1, quarter: null, chip: 100, noShock: 100, ...clone(pub.index || {}) },
    exchange: clone(pub.exchange || {}),
    ix: clone(pub.ix || {}),
    news: clone(pub.news || []), log: [], errors: [], commands: [],
  };
  if (pub.mode === 'fork') w.legacy = [];
  for (const c of pub.companies || []) {
    w.companies[c.id] = {
      id: c.id, name: c.name, brand: c.brand, series: [], org: c.id, country: c.country, tier0: c.tier, kind: c.kind,
      seat: c.seat, bot: c.bot, joined: c.joined, frozen: !!c.frozen, s: S && c.id === S.charId ? S : null,
      lastSeq: 0, errors: [],
    };
    w.brands[normName(c.brand)] = c.id;
    w.brandWords.push({ org: c.id, text: c.brand });
  }
  initExchange(w);
  // 页面读同场公司时调 W.publicView()：镜像本身就是公开视图拼的，原样给回去（不进 JSON、不随存档走）。
  Object.defineProperty(w, 'publicView', { value: () => pub, enumerable: false });
  return w;
}

// 发布表：真实的发布日写进覆盖表（setReleases 按名字查日子），再换上这一局的表。
function installReleases(pub) {
  for (const r of pub.rels || []) RELEASE_DAYS_OVERRIDES[r.name] = { day: r.day };
  setReleases(pub.relRows || []);
}

// 进联机（或重连拿到 init）时调：公司登记恢复成史实，再登记这一局的自定义公司和学界，换发布表，装上镜像。
export function openMirror(pub, S) {
  restoreCompanies(BASE);
  ensureAcademiaFamily();
  const own = S?.company?.custom === true ? S.company : null;
  for (const spec of pub.specs || []) {
    if (own && spec.id === own.id) continue;
    if (Object.hasOwn(COMPANY_BY_ID, spec.id) && !spec.custom) continue;
    registerCompany(spec);
  }
  if (own) registerCompany(own);
  installReleases(pub);
  const provider = new MirrorProvider(mirrorWorld(pub, S));
  setProvider(provider);
  return provider;
}

// 每天的公开差分合进 pub 以后调：整个镜像世界重拼一遍（几十 KB，日结后一次，不在热路径上）；
// 发布表只在多了行时才换（setReleases 会让缓存失效）。
export function refreshMirror(provider, pub, S) {
  const before = provider.world.rels.length;
  const w = mirrorWorld(pub, S);
  if ((pub.relRows || []).length !== before) installReleases(pub);
  provider.world = w;
  return provider;
}
