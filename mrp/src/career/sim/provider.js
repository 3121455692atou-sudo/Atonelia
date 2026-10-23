// 世界接缝（规格 M.3.2）：所有“世界是什么样”的读取都从这里走。
// 史实模式由 HistoryProvider 包住现有写死的数据；自洽模式的 SimProvider 在 M1 再写。
// 这里只做取数，不改变任何计算顺序。
import { TECHS, GPUS, gpuAvailable, gpuMarkup, addMonths, COMPANY_BY_ID, PLAYABLE, TIERS } from '../data/core.js';
import { BUBBLE, FUNDING } from '../data/economy.js';
import { FAMILIES, RELEASES, relId } from '../data/rivals.js';
import { START_STANCE, START_SCENARIOS, parseStance } from '../data/routes.js';
import { WORLD_EVENTS, MARKET, API_PRICE, TICKERS, interp } from '../data/world.js';
import { TECH_SRC } from '../data/techsrc.js';
import { RELEASE_DAYS_OVERRIDES } from '../data/release_days_overrides.js';
import { RENT_QUOTA, quotaFor } from '../data/supply.js';
import { SCENARIO_GOALS, GOAL_TEMPLATES } from '../data/goals.js';
import { BOT, EFFORT, SOTA, RENT_FACTOR } from '../data/balance.js';
import { clamp, hash01 } from './util.js';
import { addDays } from './clock.js';

// 综合分只在这里复制一份权重，避免 provider 反过来依赖 sota.js（sota.js 要读 P()）。
const Q_W = {
  llm: { knowledge: 0.22, code: 0.22, math: 0.22, writing: 0.22, agent: 0.12 },
  image: { aesthetics: 0.25, adherence: 0.25, text: 0.25, realism: 0.25 },
  music: { composition: 0.25, vocals: 0.25, lyrics: 0.25, fidelity: 0.25 },
  speech: { naturalness: 0.25, cloning: 0.25, multilingual: 0.25, expressive: 0.25 },
};
const qOf = (mod, dims) => {
  let a = 0;
  for (const [k, w] of Object.entries(Q_W[mod] || {})) a += w * (dims?.[k] || 0);
  return a;
};
const orgOf = s => s?.company?.org ?? FAMILIES[s?.charId]?.org ?? null;
const famOrg = fam => FAMILIES[fam]?.org ?? fam;
const rawQ = r => qOf(r.mod, r.dims);
const dayKey = r => r.day;

// 难度参照表按年插值（和 model.js 的 lerpYear 同一个算法）。
const lerpYear = (tab, y) => { const i = clamp(Math.floor(y), 2023, 2026); return tab[i] + (tab[i + 1] - tab[i]) * clamp(y - i, 0, 1); };

const TECH_POOL = [['2022-12', 1.5e10], ['2024-01', 6e10], ['2025-01', 1.5e11], ['2026-10', 3.2e11]];

// E5 门槛表：史实下每一条就是原来那条字面日期判断。agentW、booksSuit 有两个日子，第二个用 *2 的 key。
const GATES = {
  cnFiling: s => s.date >= '2023-08',
  ipoWindow: s => s.date >= '2024-01',
  ipoAdvice: s => s.date >= '2024-06',
  botIpo: s => s.date >= '2025-01',
  agentW: s => s.date >= '2024-06',
  agentW2: s => s.date >= '2025-06',
  contentStorm: s => s.date >= '2023-03',
  integrations: s => s.date >= '2025-07',
  distilledBy: s => s.date >= '2023-06',
  booksSuit: s => s.date >= '2023-12',
  booksSuit2: s => s.date >= '2025-09',
  tosSuit: s => s.date >= '2024-06',
  musicSuit: s => s.date >= '2024-06',
  arenaScandal: s => s.date >= '2025-04',
  govContract: s => s.date >= '2024-06',
  licenseFork: s => s.date >= '2023-07',
  booksPrecedent: s => s.date >= '2025-09',
  trillion: s => s.date >= '2024-06',
  bigDense: s => s.date >= '2023-06',
  usageBoard: s => s.date >= '2023-06',
  boardBench: s => s.date >= '2024-07',
  cnGpuSwap: s => s.date >= '2025-01',
};
export const GATE_KEYS = Object.keys(GATES);

// ---------- 自定义公司（规格 M.3.1） ----------
// 自洽和联机里从零开的公司不在 24 家史实公司里：spec 由大厅或存档给出，登记以后写进四个可写单例
// （COMPANY_BY_ID、PLAYABLE、FAMILIES、START_STANCE），之后 createGame 和现有代码照旧只读这几张表。
// spec 只认下面这些字段：缺的补默认值，多出来的（kind、strengths 等）忽略；同一个 id、同一份 spec 重登记是空操作。
const COMPANY_ID_RE = /^c_[a-z0-9]{6}$/;
const MODS = ['llm', 'image', 'music', 'speech'];
// 已登记的自定义公司：id → { key, spec }。key 是规范化以后的 spec（比较“是不是同一份 spec”）。
const CUSTOM = new Map();

const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const str = x => typeof x === 'string' && x.trim() !== '';
// 逐层按键名排序的 JSON：只用来比较两份 spec 是否一样，不受字段顺序影响。
const stable = x => (Array.isArray(x) ? `[${x.map(stable).join(',')}]` : isObj(x) ? `{${Object.keys(x).sort().map(k => `${JSON.stringify(k)}:${stable(x[k])}`).join(',')}}` : JSON.stringify(x));

// spec 不合法时返回中文原因，合法时返回 null。migrateGame / validateGame 读自定义公司的存档时也用它。
export function specError(spec) {
  if (!isObj(spec)) return '公司 spec 不是一个对象';
  if (typeof spec.id !== 'string' || !COMPANY_ID_RE.test(spec.id)) return '公司 id 必须是 c_ 加 6 位小写字母或数字';
  if (!str(spec.company) && !str(spec.name)) return '公司要有名字（company）';
  if (!Object.hasOwn(TIERS, spec.tier)) return `公司的档位不对：${String(spec.tier)}`;
  if (!MODS.includes(spec.modality)) return `公司的模态不对：${String(spec.modality)}`;
  if (spec.org !== undefined && !str(spec.org)) return '公司的 org 要是非空字符串';
  if (spec.country !== undefined && !str(spec.country)) return '公司的 country 要是非空字符串';
  if (spec.families !== undefined && (!Array.isArray(spec.families) || !spec.families.length || spec.families.some(f => !str(f)))) return '公司的家族表（families）要是非空的字符串数组';
  if (spec.brand !== undefined && !(Number.isFinite(spec.brand) && spec.brand >= 0)) return '公司的品牌系数（brand）要是 0 以上的数';
  if (spec.stance !== undefined) {
    if (!isObj(spec.stance)) return '公司的开局路线（stance）要是一个对象';
    for (const [sc, cell] of Object.entries(spec.stance)) {
      try { parseStance(cell); } catch { return `公司的开局路线不对：${sc} 是 ${String(cell)}`; }
    }
  }
  // 家族 id 不能和别家已有的撞（撞了会把别家的发布算错）。
  for (const fam of spec.families || []) {
    const owner = FAMILIES[fam]?.org ?? null;
    if (owner && owner !== (spec.org ?? spec.id)) return `家族 id「${fam}」已经被别的公司占用了`;
  }
  if (Object.hasOwn(COMPANY_BY_ID, spec.id) && !CUSTOM.has(spec.id)) return `公司 id 已经被占了：${spec.id}`;
  return null;
}

// 补默认值。必须幂等：登记时存下来的规范 spec 再登记一次，结果要一样。
function normSpec(spec) {
  const id = spec.id;
  const company = str(spec.company) ? spec.company : spec.name;
  return {
    id,
    company,
    name: str(spec.name) ? spec.name : company,
    label: str(spec.label) ? spec.label : company,
    art: str(spec.art) ? spec.art : id,
    smallArt: str(spec.smallArt) ? spec.smallArt : null,
    country: str(spec.country) ? spec.country : 'US',
    tier: spec.tier,
    modality: spec.modality,
    org: str(spec.org) ? spec.org : id,
    families: [...new Set(spec.families?.length ? spec.families : [id])],
    brand: Number.isFinite(spec.brand) ? spec.brand : 0.5,
    region: str(spec.region) ? spec.region : 'global',
    stance: Object.fromEntries(START_SCENARIOS.map(sc => [sc, spec.stance?.[sc] ?? 'closed'])),
    custom: true,
  };
}

// 登记一家自定义公司（幂等）。史实模式下 P().registerCompany 会抛错；这个函数本身只改四张规范表，给 SimProvider 和测试用。
export function registerCompany(spec) {
  const why = specError(spec);
  if (why) throw new Error(why);
  const norm = normSpec(spec);
  const key = stable(norm);
  const seen = CUSTOM.get(norm.id);
  if (seen) {
    if (seen.key !== key) throw new Error(`存档损坏：公司 ${norm.id} 已经用另一份 spec 登记过了`);
    return COMPANY_BY_ID[norm.id];
  }
  CUSTOM.set(norm.id, { key, spec: norm });
  // s.company 存完整的规范 spec（含 custom: true）；createGame 再补 kind。
  const entry = { ...norm, families: [...norm.families], stance: { ...norm.stance } };
  COMPANY_BY_ID[norm.id] = entry;
  PLAYABLE.push({ ...entry, artId: norm.art, smallArtId: norm.smallArt });
  for (const fam of norm.families) {
    FAMILIES[fam] = { name: norm.name, company: norm.company, org: norm.org, mod: norm.modality, region: norm.region, brand: norm.brand };
  }
  START_STANCE[norm.id] = Object.fromEntries(START_SCENARIOS.map(sc => [sc, parseStance(norm.stance[sc])]));
  return entry;
}

// 存档里的公司认不认得：24 家之一，或者带 custom: true 且 spec 合法。
export function companyKnown(id, company) {
  if (Object.hasOwn(COMPANY_BY_ID, id)) return true;
  return company?.custom === true && specError(company) === null;
}

// ---------- 可写单例的快照与回滚（规格 E8 的读档第 2 步） ----------
// 自洽读档会往 COMPANY_BY_ID、PLAYABLE、FAMILIES、START_STANCE 里写自定义公司；失败时必须原样退回去，
// 否则同一进程里后面的史实局会看到多出来的公司和学界家族。这里在对象上原地增删，保住别的模块已经拿到的引用。
const cloneObj = x => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));
const replaceKeys = (target, src) => {
  for (const k of Object.keys(target)) delete target[k];
  Object.assign(target, src);
};
export function companiesSnapshot() {
  return {
    companyById: { ...COMPANY_BY_ID },
    playable: PLAYABLE.map(x => ({ ...x })),
    families: cloneObj(FAMILIES),
    startStance: cloneObj(START_STANCE),
    techSrc: cloneObj(TECH_SRC),
    worldEvents: WORLD_EVENTS.map(x => ({ ...x })),
    custom: new Map([...CUSTOM].map(([k, v]) => [k, { key: v.key, spec: { ...v.spec } }])),
    days: { ...RELEASE_DAYS_OVERRIDES },
  };
}
export function restoreCompanies(snap) {
  if (!snap) return;
  replaceKeys(COMPANY_BY_ID, snap.companyById);
  PLAYABLE.length = 0;
  PLAYABLE.push(...snap.playable.map(x => ({ ...x })));
  replaceKeys(FAMILIES, snap.families);
  replaceKeys(START_STANCE, snap.startStance);
  replaceKeys(TECH_SRC, snap.techSrc);
  WORLD_EVENTS.length = 0;
  WORLD_EVENTS.push(...snap.worldEvents.map(x => ({ ...x })));
  CUSTOM.clear();
  for (const [k, v] of snap.custom) CUSTOM.set(k, v);
  for (const k of Object.keys(RELEASE_DAYS_OVERRIDES)) delete RELEASE_DAYS_OVERRIDES[k];
  Object.assign(RELEASE_DAYS_OVERRIDES, snap.days);
}

// 史实实现：每个口子都读原来的数据、走原来的算法。
export class HistoryProvider {
  mode = 'history';
  labelMode = 'replay';
  techSelf = false;
  followerClamp = true;
  scheduleRivals = true;
  standIns = true;
  queueBlocks = true;
  restructures = false;      // 史实模式：月结透支直接破产；自洽和联机走 M.5.8 的重组和清算

  version() { return 0; }
  registerCompany() { throw new Error('史实模式不能注册新公司'); }
  appendRelease() { throw new Error('史实模式不能追加发布'); }
  relById(id) { return RELEASES.find(r => r.id === id) ?? null; }
  defendOk() { return true; }
  labelGate() { return -Infinity; }
  anchorSkip() { return false; }
  birthMode() { return 'clamp'; }

  // 别家全部真实发布截至 day 的最强 q（不做可见性过滤和跟随者钳制）。
  histOther(s, { day = s.day, mod = s.mod } = {}) {
    const org = orgOf(s);
    let best = null;
    for (const r of RELEASES) if (r.mod === mod && r.day <= day && famOrg(r.family) !== org) best = Math.max(best ?? -Infinity, rawQ(r));
    return best;
  }
  // 本公司本模态真实发布截至 day + HIST_LOOKAHEAD 的最强 q。
  ownHist(s, { day = s.day, mod = s.mod } = {}) {
    const org = orgOf(s), until = addDays(day, SOTA.HIST_LOOKAHEAD);
    let best = null;
    for (const r of RELEASES) if (r.mod === mod && r.day <= until && famOrg(r.family) === org) best = Math.max(best ?? -Infinity, rawQ(r));
    return best;
  }
  // 本模态全部真实发布截至 day 的最强 q；一条都没有时取本模态第一条发布的 q。
  tempAnchor(s, { day = s.day, mod = s.mod } = {}) {
    let best = null, first = null;
    for (const r of RELEASES) if (r.mod === mod) {
      if (r.day <= day) best = Math.max(best ?? -Infinity, rawQ(r));
      if (!first || dayKey(r) < dayKey(first)) first = r;
    }
    return best ?? (first ? rawQ(first) : 0);
  }
  effortRef(kind, ref, y) {
    const tab = kind === 'know' ? EFFORT.KNOW_REF[ref] : EFFORT.TRAIN_REF[ref];
    return lerpYear(tab, y);
  }
  techSources(id) { return TECH_SRC[id]; }
  startTechs(s) { return TECHS.filter(t => t.mod === s.mod && (t.start || t.from <= addMonths(s.start, -3))).map(t => t.id); }
  worldEvents(ym) { return ym ? WORLD_EVENTS.filter(w => w.date === ym) : [...WORLD_EVENTS]; }
  worldEvent(id) { return WORLD_EVENTS.find(w => w.id === id) ?? null; }
  marketDate(s) { return s.date; }
  market(product, region, s) { return interp(MARKET[product][region], typeof s === 'string' ? s : s.date); }
  apiPrice(region, s) { return interp(API_PRICE[region], typeof s === 'string' ? s : s.date); }
  shareOf(s, product, region, skus, local) { return local(s, product, region, skus); }
  valuation(s, rev, local) { return local(s, rev, interp(TECH_POOL, s.date)); }
  gpuQuota(s, id) { return quotaFor(s.company.tier, id, s.date); }
  rentQuota(s) { return RENT_QUOTA[s.company.tier] || 256; }
  gpuPrice(s, id) { return GPUS[id].price * gpuMarkup(id, s.date, s.company.country); }
  gpuAvailable(id, date, country) { return gpuAvailable(id, date, country); }
  rentPrice(s, id) {
    const g = GPUS[id];
    if (!g) return 0;
    const f = RENT_FACTOR[clamp(Number(s.date.slice(0, 4)), 2023, 2026)];
    // AI 泡沫破裂后 180 天内租卡便宜三成（规格 K5）。
    const b = s.bubble;
    const bub = b && !b.averted && s.day >= b.day && s.day < b.until ? BUBBLE.RENT : 1;
    // 战略投资后一年在合作云上租卡打折（规格 K4）。
    const partner = s.flags?.cloudPartner > s.day ? FUNDING.STRATEGIC.rentMult : 1;
    return g.rent * f * gpuMarkup(id, s.date, s.company.country) * (s.company.country === 'CN' && !gpuAvailable(id, s.date, 'CN') ? 1.4 : 1) * bub * partner;
  }
  tickers() { return TICKERS; }
  price(t, date) {
    const id = typeof t === 'string' ? t : t?.id;
    const tk = TICKERS.find(x => x.id === id);
    if (!tk || (tk.listed && date < tk.listed)) return 0;
    let base;
    if (tk.monthly) {
      base = tk.monthly[date];
      if (base === undefined) { const ks = Object.keys(tk.monthly).sort(); base = tk.monthly[date > ks.at(-1) ? ks.at(-1) : ks[0]]; }
    } else base = interp(tk.anchors, date);
    return Math.round(base * (1 + 0.03 * (hash01(`${id}${date}`) - 0.5)) * 100) / 100;
  }
  trade(s, ticker, usd, local) { return local(s, ticker, usd); }
  ipoOpen(s) { return s.date >= '2024-01'; }
  gate(key, s) {
    const f = GATES[key];
    if (!f) throw new Error(`未知的门槛：${key}`);
    // 门槛只看日期：只传 { date }，不展开整个存档（顾问枚举候选底座时每个候选都要查几次，展开一次存档就占了 advise 三成多的时间）。
    return !!f({ date: typeof s === 'string' ? s : s.date });
  }
  reservedNames() {
    const real = new Map();
    for (const r of RELEASES) if (!real.has(normName(r.name))) real.set(normName(r.name), r.name);
    return real;
  }
  // 同名：本局已发布的、评测中预订的都算。史实下只看本局。
  // 名字账本只存在于自洽世界（M.5.4）：送评时登记、撤回时释放。史实模式不占名，值日当天重名加后缀。
  claimName() { return null; }
  releaseName() { return true; }
  nameTaken(s, name, modelId) {
    const n = normName(name);
    const dup = (s?.models || []).find(m => m && m.stage === 'released' && m.id !== modelId && typeof m.name === 'string' && normName(m.name) === n);
    if (dup) return `这一局已经有一款叫「${dup.name}」的模型了`;
    const cand = (Array.isArray(s?.evals) ? s.evals : []).find(e => e && e.modelId !== modelId && typeof e.plan?.name === 'string' && normName(e.plan.name) === n);
    if (cand) return `「${cand.plan.name}」已经给评测中的候选用了`;
    return null;
  }
  brandOwner(w, n, mine, brands, hit) { return brands.find(x => x.org !== mine && hit(w, n, x)) || null; }
  benchOf() { return null; }
  realQ(name) { const r = RELEASES.find(x => x.name === name); return r ? rawQ(r) : null; }
  isLegacy(s, m) { return !m?.releasedDay && RELEASES.some(r => r.name === m?.name && r.date <= s.start); }
  goals(s) { return SCENARIO_GOALS[s.scenario]?.[s.mod] || GOAL_TEMPLATES[s.mod]; }
  tierOf(s) { return s.company.tier; }
  isNpc() { return false; }
  botParams() { return BOT; }

  // 公司之间的互动（M2b，规格 M.5.1、M.5.2、M.5.8、M.5.9）：史实模式没有别家公司可以收钱、可以查人，全是空口子。
  transfer() { return 0; }
  moneyFrozen() { return null; }
  apiBanned(s, fam) { return !!s.marks?.[`ban_${fam}`]; }
  apiBlock() { return null; }
  apiPackCost(s, fam, base) { return base; }
  apiOrderPlaced() {}
  apiDistillDay() {}
  // AI 泡沫（规格 K5）：史实局的状态存在 s.bubble。
  bubble(s) { return s?.bubble ?? null; }
  // 界面读数（自洽才有）：一包被查出的概率、今年还能买几包、受限开源发布登记的条款。
  apiRisk() { return null; }
  apiPacksLeft() { return null; }
  licenseTermsOf() { return null; }
}
const normName = n => String(n ?? '').normalize('NFKC').toLowerCase().replace(/（.*?）|\(.*?\)/g, '').replace(/[\s\-_·.]/g, '');

let current = new HistoryProvider();
export function setProvider(p) { current = p ?? new HistoryProvider(); return current; }
export function P() { return current; }

export { relId };
