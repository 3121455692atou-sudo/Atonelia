// 正式的 SimProvider（规格 M.3.2）：自洽世界里所有“世界是什么样”的读取都从这里走。
// 市场、算力、估值、档位、算力指数接到 world/market|supply|valuation（M1b-1）；
// 名字账本、董事会目标和 botParams 在 M1b-2 接上（world/names|goals、triggers）。
import { tickersOf, priceOf, buy, sell, short, cover, buyback, issue, listCompany } from './exchange.js';
import { HistoryProvider, registerCompany } from '../sim/provider.js';
import { RELEASES, FAMILIES, setReleases } from '../data/rivals.js';
import { OWNER_OF } from '../data/core.js';
import { WORLD_EVENTS } from '../data/world.js';
import { SELF } from '../data/selfplay.js';
import { SELF_GOALS } from '../data/goals.js';
import { qOf } from '../sim/sota.js';
import { appendRelease, normName } from './release.js';
import { claimName, releaseName, nameTakenMessage } from './names.js';
import { techSources, startTechs } from './tech.js';
import { acadBest } from './label.js';
import { marketDateOf, marketValueOf, apiPriceOf, shareOf as worldShareOf } from './market.js';
import { gpuQuotaOf, gpuPriceOf, gpuAvailableOf, rentQuotaOf, rentPriceOf, averageRentOf } from './supply.js';
import { valuationOf, tierOf as worldTierOf, chipIndexValue, ipoOpenOf } from './valuation.js';
import { queueTransfer, moneyFrozen } from './transfer.js';
import { apiBlock, apiBanned, apiPackCost, apiOrderPlaced, apiDistillDay, apiRisk, apiPacksLeft } from './distill_watch.js';
import { derivOrgs, setLicenseTerms } from './license.js';
import { poach } from './poach.js';

// 真实发布表在模块加载时冻结一份：换掉发布表以后，realQ、reservedNames、学界起点还读它。
// （SimProvider 是单例发布表的一部分；同一个进程只跑一个世界，规格 M.10 第 4 条。）
// 分岔局要用到完整的行（家族、量级、许可、tags、原始行号），所以整条拷一份。
const REAL_RELEASES = RELEASES.map(r => ({
  family: r.family, org: FAMILIES[r.family]?.org ?? r.family, owner: OWNER_OF[r.family] ?? r.family,
  name: r.name, day: r.day, date: r.date, dayExact: r.dayExact, ord: r.ord,
  cls: r.cls, open: !!r.open, price: r.price, tags: [...(r.tags || [])],
  dims: { ...r.dims }, mod: r.mod, q: qOf(r.mod, r.dims),
}));
const REAL_BY_NAME = new Map(REAL_RELEASES.map(r => [r.name, r]));

const CJK = /[\u3400-\u9fff]/;
const words = n => String(n).trim().split(/[\s\-_·.]+/).filter(Boolean).map(w => w.toLowerCase());

// 学界这一家（M.3.1）：新开世界和读世界存档都要先登记，发布表里的学界行要靠它查模态。
export function ensureAcademiaFamily() {
  FAMILIES.academia = { name: '社区开源基线', company: '学界与开源社区', org: 'academia', mod: 'llm', region: 'global', brand: 0.08 };
}

export class SimProvider extends HistoryProvider {
  mode = 'sim';
  labelMode = 'world';       // SOTA 只存一份世界账本，白天引擎不自己回放
  techSelf = true;           // 自家公开的技术也算进世界水平
  followerClamp = false;     // D5 的跟随者钳制只在史实模式里用
  scheduleRivals = false;    // 别家发布一律由收盘推送，月初不再从发布表排
  standIns = false;          // 事件替身全关（M1 没有互动事件）

  restructures = true;       // 破产走重组和清算（M.5.8，world/restructure.js）

  constructor(world) {
    super();
    this.world = world;
    // 单人自洽：卡片照旧暂停游戏；联机（settings.mp）里卡片不挡时间，真人公司带着收件箱照常推进（M.6.4）。
    // 基类用类字段定义了 queueBlocks（实例自有属性），子类原型上的 getter 会被它盖住，所以在这里换成访问器。
    Object.defineProperty(this, 'queueBlocks', { get: () => !this.world?.settings?.mp, configurable: true, enumerable: true });
  }

  // ---------- 换掉真实世界 ----------
  // 发布表清空，学界家族补上；技术账本由 world/index 初始化。
  openWorld() {
    const w = this.world;
    w.rels = [];
    w.relMeta = {};
    w.relIds = {};
    w.names = w.names || {};
    w.relSeq = 0;
    setReleases([]);
    ensureAcademiaFamily();
    return this;
  }

  version() { return this.world.rels.length; }
  registerCompany(spec) { return registerCompany(spec); }
  appendRelease(row) {
    const out = appendRelease(this.world, row);
    this.world.ver = this.world.rels.length;          // 发布表版本就是 world.rels.length（M.3.1）
    return out;
  }
  relById(id) { return RELEASES.find(r => r.id === id) ?? null; }

  // 挡住挑战才算数：挑战者的完整血统里没有持有者那家。
  defendOk(holder, cand) { return !(cand?.kin || []).includes(holder.org); }
  // 候选必须高过当时学界最强。
  labelGate() { return acadBest(this.world); }
  // 锚点要跳过血统里有本公司的发布（学界行也按它的血统判断）。血统和世界账本都按世界公司 id（s.charId）记。
  anchorSkip(s, rel) { return !!s?.charId && (rel?.kin || []).includes(s.charId); }
  // 从头预训练的底座不过出生护栏（只由缩放律和算力决定）；续训锚点换成底座那一款。
  birthMode(s, m) { return m?.lineage?.kind === 'finetune' ? 'teacher' : 'scaling'; }

  // ---------- 难度锚点（M.3.5） ----------
  histOther() { return null; }                         // 自洽：真实历史不让路
  // 分岔局：只有开局前“炼出过”的公司能用自家真实史线，而且只算开局日之前的行（M.3.5、M.3.2）。
  ownHist(s) {
    if (this.world.mode !== 'fork' || !s?.sota?.before) return null;
    const org = s.charId;                       // 世界账本里的公司 id（分岔局是 gpt / claude……）
    let best = null;
    for (const r of REAL_RELEASES) {
      const owner = OWNER_OF[r.family] ?? r.org;
      if (r.mod === s.mod && owner === org && r.day < this.world.startDay) best = Math.max(best ?? -Infinity, r.q);
    }
    return best;
  }
  tempAnchor() { return acadBest(this.world); }        // 对本家不排除的学界最强

  effortRef(kind, ref, y) {
    const e = this.world.effortRef;
    if (e && e.T !== null && e.K !== null) return kind === 'know' ? e.K : e.T;
    return super.effortRef(kind, ref, y);
  }

  // ---------- 技术账本（M.3.6） ----------
  techSources(id) { return techSources(this.world, id); }
  startTechs(s) {
    // 分岔局照史实发开局技术；从零局只给世界账本里已经到论文或开源的（M.2.2）。
    if (this.world.mode === 'fork') return super.startTechs(s);
    return startTechs(this.world, super.startTechs(s), s.start);
  }

  // ---------- 天时（M.1 第 2 条）：只留不带 by / target 的法规类；触发器造出的大事也在这里 ----------
  worldEvents(ym) {
    const list = [...WORLD_EVENTS.filter(w => w.type === 'regulation' && !w.by && !w.target), ...(this.world.events || [])];
    return ym ? list.filter(w => w.date === ym) : list;
  }
  worldEvent(id) { return this.worldEvents(null).find(w => w.id === id) ?? null; }

  // ---------- 市场、算力、估值（M.3.8，M1b-1） ----------
  marketDate(s) { return marketDateOf(this.world, s); }
  market(product, region, s) { return marketValueOf(this.world, product, region, s); }
  apiPrice(region, s) { return apiPriceOf(this.world, region, s); }
  shareOf(s, product, region, skus, local) { return worldShareOf(this.world, s, product, region, skus, local); }
  valuation(s, rev, local) { void local; return valuationOf(this.world, s, rev); }

  // 算力：共用供给池、季末统一价、租卡池。
  gpuQuota(s, id) { return gpuQuotaOf(this.world, s, id); }
  rentQuota(s) { return rentQuotaOf(this.world, s); }
  gpuPrice(s, id) { return gpuPriceOf(this.world, s, id); }
  gpuAvailable(id, date, country) { return gpuAvailableOf(this.world, id, date, country); }
  rentPrice(s, id) { return rentPriceOf(this.world, s, id); }
  averageRent(s) { return averageRentOf(this.world, s); }

  // 档位与指数。
  tierOf(s) { return worldTierOf(this.world, s); }
  chipIndex() { return chipIndexValue(this.world); }

  // ---------- 交易所：简化，M2 替换 ----------
  // 股市（M.5.5，M2a）：自洽世界里只有本局上市的公司，没有真实股票。
  tickers() { return tickersOf(this.world); }
  price(t, date) { return priceOf(this.world, typeof t === 'string' ? t : t?.id, date); }
  // 史实接口 trade(s, ticker, usd)：usd > 0 买入这么多现金的股票，usd < 0 按现价卖出这么多钱的股票。
  trade(s, ticker, usd, local) {
    void local;
    if (usd > 0) return buy(this.world, s, ticker, usd);
    const p = priceOf(this.world, ticker);
    if (!(p > 0)) throw new Error('这家公司还没上市');
    return sell(this.world, s, ticker, -usd / p);
  }
  // IPO 流程走完那天挂牌（capital.js 的 capitalProcesses 调）。
  listIpo(s, frac) { return listCompany(this.world, s, frac); }
  // 交易命令（sim/commands.js 末尾追加的那几条）走这里；史实模式的 Provider 没有这些方法。
  stockBuy(s, org, usd) { return buy(this.world, s, org, usd); }
  stockSell(s, org, shares) { return sell(this.world, s, org, shares); }
  stockShort(s, org, shares) { return short(this.world, s, org, shares); }
  stockCover(s, org, shares) { return cover(this.world, s, org, shares); }
  stockBuyback(s, usd) { return buyback(this.world, s, usd); }
  stockIssue(s, usd) { return issue(this.world, s, usd); }
  ipoOpen(s) { void s; return ipoOpenOf(this.world); }

  // ---------- 门槛（E5 门槛表）：自洽按 d* / ipoOpen / 关 ----------
  gate(key, s) {
    switch (key) {
      case 'ipoWindow':
      case 'ipoAdvice':
      case 'botIpo': return this.ipoOpen(s);
      case 'agentW': return this.marketDate(s) >= '2024-06';
      case 'agentW2': return this.marketDate(s) >= '2025-06';
      case 'contentStorm': return this.marketDate(s) >= '2023-03';
      case 'integrations': return this.marketDate(s) >= '2025-07';
      // 蒸馏指控和版权官司由 M.5.2 / M.3.9 自己触发，不再走替身事件。
      case 'distilledBy':
      case 'booksSuit':
      case 'booksSuit2':
      case 'tosSuit':
      case 'licenseFork': return false;
      default: return super.gate(key, s);
    }
  }

  // ---------- 名字（M.5.4） ----------
  reservedNames() {
    const real = new Map();
    for (const r of REAL_RELEASES) if (!real.has(normName(r.name))) real.set(normName(r.name), r.name);
    for (const x of Object.values(this.world.relMeta || {})) if (!real.has(normName(x.name))) real.set(normName(x.name), x.name);
    // 已用名和送评中的预订名也算保留名；已经发布的那条以发布行为准。
    for (const [n, x] of Object.entries(this.world.names || {})) if (x?.name && !real.has(n)) real.set(n, x.name);
    return real;
  }
  // 名字账本、系列词和血统都按世界公司 id（s.charId）记；分岔局里它和真实的 company.org 不是一回事。
  nameTaken(s, name, modelId) {
    return nameTakenMessage(this.world, s?.charId, name, modelId);
  }
  claimName(s, name, opts) {
    // 分岔局里两家的模型 id 可能碰巧一样（都从 m1_… 起），所以“同一个模型再登记一次”只能按公司判断；
    // 别家已经占了这个名字，就算 modelId 相同也必须挡下。
    const n = normName(name);
    const prev = this.world.names?.[n];
    if (prev?.org && prev.org !== s?.charId) {
      const who = this.world.companies?.[prev.org]?.name || prev.org;
      return prev.released ? `「${prev.name || name}」已经被 ${who} 用了` : '这个名字已经被别家预订了';
    }
    return claimName(this.world, s?.charId, name, opts);
  }
  releaseName(s, name, evalId) {
    return releaseName(this.world, name, evalId);
  }
  // 自己的品牌：世界 id、真实 org、同 org 的别的座位都算自己（Claude 和 Fable 同属 Anthropic）。
  brandOwner(w, n, mine, brands, hit, ctx = {}) {
    const own = this.world.companies?.[mine];
    const orgs = new Set([mine, own?.realOrg].filter(Boolean));
    const ids = new Set(orgs);
    for (const c of Object.values(this.world.companies || {})) if (c?.realOrg && orgs.has(c.realOrg)) ids.add(c.id);
    // 署名衍生（M.5.3）：这一款是哪家受限开源模型的衍生，就可以用那家的品牌词开头。
    if (ctx.s && ctx.modelId) for (const org of derivOrgs(this.world, ctx.s, ctx.modelId)) ids.add(org);
    for (const b of brands) if (!ids.has(b.org) && hit(w, n, b)) return b;
    for (const b of this.world.brandWords || []) {
      if (ids.has(b.org)) continue;
      const x = { org: b.org, text: b.text, cjk: CJK.test(b.text), norm: normName(b.text), words: words(b.text) };
      if (hit(w, n, x)) return x;
    }
    return null;
  }

  // ---------- 发布行与冻结的真实数据 ----------
  benchOf(rel, benchId) { return this.world.relMeta?.[rel?.id]?.bench?.[benchId] ?? null; }
  realQ(name) { return REAL_BY_NAME.get(name)?.q ?? null; }
  isLegacy() { return this.world.mode === 'fork'; }   // 分岔局有开局前的前人遗产

  // ---------- 董事会目标与电脑公司参数（M.3.11、M.3.12） ----------
  goals(s) {
    const list = SELF_GOALS[s.mod] || SELF_GOALS.llm;
    // 终局落在这一局的结束日，不写死年份。
    return list.map(g => (g.check?.type === 'final' ? { ...g, date: this.world.end.slice(0, 7) } : g));
  }
  // 电脑公司这一档的常数（M.3.12）：难度只改“多久想一次、想得多细”，不加资源、不改数值。
  // STRATEGY 固定 adaptive：分岔局也不用 historic。MODE 给 botStep 判断被动档（只跑 freeOps）。
  botParams(s) {
    const org = s?.company?.org ?? s?.charId;
    const c = this.world.companies?.[org];
    const level = c?.hosted ? 'passive' : (c?.bot ?? 'normal');   // 托管中的真人公司按被动档（M.6.3）
    const every = SELF.BOT_EVERY[level] ?? SELF.BOT_EVERY.normal;
    return {
      ...super.botParams(),
      HORIZON_DAYS: SELF.BOT_HORIZON,
      EVERY: { ...SELF.BOT_EVERY },
      EVERY_DAYS: every,
      MODE: level,
      STRATEGY: 'adaptive',
    };
  }

  isNpc(fam) { return fam === 'academia'; }

  // ---------- 公司之间的互动（M2b） ----------
  // 转账：付方的钱由调用方扣，收方收盘入账六成（world/transfer.js）。
  transfer(s, to, usd, kind) { return queueTransfer(this.world, s.charId, to, usd, kind); }
  moneyFrozen(s) { return moneyFrozen(this.world, s.charId, s.day); }
  // 闭源 API 蒸馏（world/distill_watch.js）：封号只封 180 天；限流、冻结、价钱、抽取记账。
  apiBanned(s, fam) { return apiBanned(this.world, s, fam); }
  apiBlock(s, fam) { return apiBlock(this.world, s, fam); }
  apiPackCost(s, fam, base, acct) { return apiPackCost(this.world, s, fam, base, acct); }
  apiOrderPlaced(s, o, acct) { return apiOrderPlaced(this.world, s, o, acct); }
  apiDistillDay(s, o, pay) { return apiDistillDay(this.world, s, o, pay); }
  apiRisk(s, fam, acct) { return apiRisk(this.world, s, fam, acct); }
  apiPacksLeft(s, fam) { return apiPacksLeft(this.world, s, fam); }
  licenseTermsOf(relId) { return this.world.ix?.terms?.[relId] ?? (relId ? { attrib: true, royalty: true, noCompete: true } : null); }
  // 挖人（M.5.6，world/poach.js；大厅里默认关）。
  poach(s, target, n) { return poach(this.world, s, target, n); }
  // AI 泡沫（规格 K5）：自洽和联机里只有一份，存在世界上。
  bubble() { return this.world.flags?.bubble ?? null; }
  // 千禧年难题全世界只发生一次（规格 K4）。
  millenniumDone() { return !!this.world.flags?.millennium; }
  claimMillennium(s) { (this.world.flags ??= {}).millennium = { org: s.charId, day: s.day }; }
  // 受限开源条款（M.5.3，world/license.js）。
  setLicenseTerms(s, terms) { return setLicenseTerms(s, terms); }
}

export { REAL_RELEASES };
