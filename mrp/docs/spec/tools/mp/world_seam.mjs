// 原型 v2：WorldProvider 接缝演示（规格 M 章附录 M-A）。v1 和它的输出放在 ./v1/。
//
// 和 v1 的区别（按评审意见改）：
// - 所有公司都用现有机器人当大脑（sim/bot.js 的 freeOps → planProject → weekly，策略用 adaptive 模式），不再用两套“简单策略”；
//   电脑发论文按 M.3.12 的 botPublish。开局路线按 ROUTE_MIX 轮流取（开源 / 受限开源 / 闭源），也可以 --routes open|closed 全员同一路线。
// - 引擎在外置盘上复制一份（.gen/career/，项目文件不动），只打 M0 的几处口子（见下面 PATCHES）：
//   锚点 R 按 M.3.5 取（别家可见最强，排除血统里有自己的发布，含学界）；从头预训练的底座不过出生护栏；techStatus 认自家公开（techSelf）；
//   机器人：策略模式、立项工期上限、发布时附论文。
// - 冲顶力参照默认取“在场公司训练算力和技术积累的中位数”，下限是日历值的 2% / 10%（M.3.5 第 4 条）；--ref calendar 是对照组。
// - 学界与开源社区（NPC）进场：起点按本局设置算（M.3.7），之后只跟随公司的开源发布和技术扩散，学界行带血统。
// - 技术账本开局时初始化；学界日历只留学界自己首创的 5 项；账本只在等级真正提高时记事件（M.3.6）。
// - SOTA 世界账本按 M.3.4：学界不当候选、候选要高过学界、挑战要在 1 分内且血统不含持有者、稳坐 30 天也算炼出。收盘后投影回各家 s.sota。
//
// 运行（Node 22+，不用 npm install）：
//   node world_seam.mjs [--days 730] [--seed 11] [--tier specialist] [--year 2024] [--n 3] [--routes mix|open|closed]
//                       [--shill] [--clamp] [--ref calendar] [--anchor engine] [--horizon 5] [--quiet] [--json]
//   --clamp：引擎原样的出生护栏（对照）；--ref calendar：冲顶力参照用日历表（对照）；--anchor engine：引擎原样的锚点算法（对照）。
//   --shill：再加一家小公司 delta，只蒸馏当前最强的开源模型再开源发布（量“陪跑抬锚”）。
//   环境变量 DBG=1：stderr 打印每次底座出生和每月的难度读数。
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const REPO = '/Users/mac/model-raising-plan';
const SRC = `${REPO}/src/career`;
const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SEED = Number(arg('--seed', 11));
const TIER = arg('--tier', 'specialist');
const YEAR = String(arg('--year', '2024'));
const NCO = Number(arg('--n', 3));
const ROUTES = arg('--routes', 'mix');
const SHILL = argv.includes('--shill');
const KEEP_CLAMP = argv.includes('--clamp');
const REF_MODE = arg('--ref', 'world');
const ANCHOR_MODE = arg('--anchor', 'world');
const HORIZON = Number(arg('--horizon', 5));
const SUPPLY_MULT = Number(arg('--supply', 2));   // 对照：共用卡池总量 = Σ 开局档配额 × 这个倍数（M.3.8 第 3 条的 SUPPLY_SELF.MULT）
const QUIET = argv.includes('--quiet');
const JSON_OUT = argv.includes('--json');

// ---------- 0. 引擎副本 + M0 口子（只在外置盘上；项目文件一个不改） ----------
const GEN = join(HERE, '.gen');
const CAREER = join(GEN, 'career');
const PATCHES = [
  // M.3.5 第 2 条：锚点 R、包络 E 由世界给（别家可见最强，排除血统里有自己的发布，含学界）。
  ['sim/sota.js', 'export function anchor(s, { day = s.day, mod = s.mod } = {}) {\n',
    'export function anchor(s, { day = s.day, mod = s.mod } = {}) {\n  if (globalThis.__MP?.anchor) return globalThis.__MP.anchor(s, day, mod);\n'],
  ['sim/sota.js', 'export function anchorEnv(s, { day = s.day, mod = s.mod } = {}) {\n',
    'export function anchorEnv(s, { day = s.day, mod = s.mod } = {}) {\n  if (globalThis.__MP?.anchorEnv) return globalThis.__MP.anchorEnv(s, day, mod);\n'],
  // M.3.5 第 1 条：从头预训练的底座不过出生护栏（续训本来就钳在底座之下）。
  ['sim/model.js', 'export function birthClamp(s, m) {\n  if (!m?.dims) return m;\n',
    'export function birthClamp(s, m) {\n  if (!m?.dims) return m;\n  if (globalThis.__MP?.birthScaling) return m;\n'],
  // M.3.6：techSelf，自家公开的也算进世界水平（“公开了，自己的独门技术就少一项”）。
  ['sim/research.js', "if (date > s.date || (fam !== 'academia' && isMine(s, fam))) continue;",
    "if (date > s.date || (fam !== 'academia' && !globalThis.__MP?.techSelf && isMine(s, fam))) continue;"],
  // 机器人：三个内部函数导出（botStep 的雏形），策略用 adaptive，立项工期上限可调，发布时附论文（botPublish）。
  ['sim/bot.js', /^function (freeOps|planProject|weekly)\(/gm, 'export function $1(', 3],
  ['sim/bot.js', "pickStrategy(s, 'historic')", "pickStrategy(s, globalThis.__MP?.stratMode ?? 'historic')"],
  ['sim/bot.js', 'if (pv.months <= 5 && q > bestQ)', 'if (pv.months <= (globalThis.__MP?.horizon ?? 5) && q > bestQ)'],
  ['sim/bot.js', "tryDo('release', {});", "tryDo('release', globalThis.__MP?.relOpts?.(s) ?? {});"],
];
{
  let head = 'nogit';
  try { head = execSync(`git -C ${REPO} rev-parse HEAD`).toString().trim() + execSync(`git -C ${REPO} status --porcelain src/career`).toString(); } catch { /* 没有 git 就每次重拷 */ }
  const stamp = createHash('sha1').update(head + JSON.stringify(PATCHES.map(p => String(p[1]) + p[2]))).digest('hex');
  const stampFile = join(GEN, 'career.stamp');
  if (!existsSync(stampFile) || readFileSync(stampFile, 'utf8') !== stamp || head === 'nogit') {
    rmSync(CAREER, { recursive: true, force: true });
    mkdirSync(CAREER, { recursive: true });
    for (const p of ['engine.js', 'sim', 'data']) cpSync(join(SRC, p), join(CAREER, p), { recursive: true, filter: f => !f.split('/').pop().startsWith('._') });
    for (const [file, find, repl, times = 1] of PATCHES) {
      const fp = join(CAREER, file);
      const src = readFileSync(fp, 'utf8');
      const n = typeof find === 'string' ? src.split(find).length - 1 : (src.match(find) || []).length;
      if (n !== times) throw new Error(`口子没打上：${file} 里 ${find} 出现 ${n} 次（应为 ${times}）`);
      writeFileSync(fp, typeof find === 'string' ? src.replace(find, repl) : src.replace(find, repl));
    }
    writeFileSync(stampFile, stamp);
  }
}
const imp = p => import(pathToFileURL(join(CAREER, p)).href);
const BOT = await imp('sim/bot.js');
const RV = await imp('data/rivals.js');
const { RELEASE_DAYS_OVERRIDES } = await imp('data/release_days_overrides.js');
const W = await imp('data/world.js');
const CORE = await imp('data/core.js');
const { START_STANCE } = await imp('data/routes.js');
const { TECH_SRC } = await imp('data/techsrc.js');
const { BENCH_BY_ID } = await imp('data/benchmarks.js');
const { DATASETS } = await imp('data/datasets.js');
const { releaseEntry, releaseScheduled } = await imp('sim/loop.js');
const SOTA = await imp('sim/sota.js');
const M = await imp('sim/model.js');
const RS = await imp('sim/research.js');
const E = await imp('engine.js');
const { addDays, daysBetween } = await imp('sim/clock.js');
const { EFFORT } = await imp('data/balance.js');
const SUP = await imp('data/supply.js');
for (const k of Object.keys(SUP.QUOTA)) SUP.QUOTA[k] = Math.round(SUP.QUOTA[k] * SUPPLY_MULT);
for (const k of Object.keys(SUP.RENT_QUOTA)) SUP.RENT_QUOTA[k] = Math.round(SUP.RENT_QUOTA[k] * SUPPLY_MULT);
const { FAMILIES } = RV;
const { COMPANY_BY_ID, PLAYABLE, TECH_BY_ID, TECHS, PARAM_TOTALS, dimKeys, END } = CORE;
const qOf = dims => SOTA.qOf('llm', dims);
const r1 = x => Math.round(x * 10) / 10;
const money = v => (Math.abs(v) >= 1e8 ? `${r1(v / 1e8)}亿` : `${Math.round(v / 1e4)}万`);
const med = a => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return b[Math.floor((b.length - 1) / 2)]; };
const REAL = RV.RELEASES.filter(r => r.mod === 'llm').map(r => ({ name: r.name, day: r.day, open: r.open, dims: { ...r.dims }, q: qOf(r.dims) }));   // 冻结的真实发布表
const realBest = (day, open = false) => REAL.filter(r => r.day <= day && (!open || r.open)).reduce((a, r) => (!a || r.q > a.q ? r : a), null);

// ---------- 1. 常量（规格 §1.3a 的 SELF / ACAD 节选） ----------
const LAB = { EPS: 0.1, FIELD: 2, FILL_LEAD: 3.0, DEFEND_NEAR: 1.0, STEADY_DAYS: 30 };
const ACAD = { OPEN_LAG: 90, OPEN_GAP: 2, TECH_GAIN: 0.4, BELOW_TOP: 1.0, STEP: 0.5, REAL_GAP: 4, PROBE_GAP: 3, PROBE_MONTHS: 4 };
const AUTO = { PROOF_TO_PAPER: 365, PAPER_TO_OPEN: 180 };
const EFFORT_FLOOR = { T: 0.02, K: 0.1 };
const ACAD_ORIGINAL = ['distill', 'dpo', 'long_ctx', 'flash_attn', 'spec_decode'];   // TECH_SRC 里第一条来源就是学界的 5 项
const LV = ['none', 'secret', 'proof', 'paper', 'open'];
const ROUTE_MIX = ['open', 'open_restricted', 'closed'];

// 冲顶力参照：在场公司的中位数（M.3.5 第 4 条）。EFFORT 表是可写的单例，按年份全写成同一个值。
const CAL_REF = JSON.parse(JSON.stringify({ T: EFFORT.TRAIN_REF.llm, K: EFFORT.KNOW_REF.llm }));
function setEffortRef(list) {
  if (REF_MODE !== 'world' || !list.length) return;
  const T = med(list.map(s => M.trainFlops(s) / 1e21)), K = med(list.map(s => s.know || 0));
  for (const y of Object.keys(EFFORT.TRAIN_REF.llm)) {
    EFFORT.TRAIN_REF.llm[y] = Math.max(T, CAL_REF.T[y] * EFFORT_FLOOR.T);
    EFFORT.KNOW_REF.llm[y] = Math.max(K, CAL_REF.K[y] * EFFORT_FLOOR.K);
  }
}

// ---------- 2. SimWorld：WorldProvider 的替身（世界账本只存一份） ----------
class SimWorld {
  constructor(startDay) {
    this.start = startDay;
    this.day = startDay;
    this.version = 0;
    this.rows = [];             // setReleases 的原始行（只追加；规格里 world.rels）
    this.meta = new Map();      // relId → { org, relId, modelId, name, q, dims, day, open, license, kin, bench, techs, seq }
    this.label = { holder: null, field: new Set(), best: {}, chain: [], made: {}, steadySince: null };
    this.tech = {};             // techId → { level, by, since, cal }
    this.techLog = [];
    this.acad = { q: 0, rows: 0, src: null, gains: new Set(), publishers: new Set(), log: [] };
    this.companies = [];
    this.seq = 0;
  }
  registerCompany({ id, name, tier, country = 'US', stance = 'closed', license = null, strengths = ['code'] }) {
    COMPANY_BY_ID[id] = { id, org: id, company: `${name} 实验室`, country, tier, modality: 'llm', families: [id], strengths, name };
    PLAYABLE.push({ ...COMPANY_BY_ID[id], artId: null, smallArtId: null, label: '' });
    FAMILIES[id] = { name, company: `${name} 实验室`, org: id, mod: 'llm', region: country === 'CN' ? 'cn' : 'global', brand: 0.5, pusher: true };
    START_STANCE[id] = Object.fromEntries(['y2023', 'y2024', 'y2025', 'y2026'].map(sc => [sc, { stance, license }]));
  }
  // 完整血统（只在服务器上）：这款模型的老师（后训练老师、续训底座、合成教材）所在的公司，再并上那些公司已发布行的血统。不含自己。
  kinOf(org, m) {
    const fams = new Set([...Object.keys(m.post?.teachers || {}), m.lineage?.fam, m.distillation?.teacher?.id].filter(x => x && x !== 'self'));
    const out = new Set();
    for (const f of fams) {
      const o = FAMILIES[f]?.org ?? f;
      if (o === org) continue;
      out.add(o);
      for (const x of this.meta.values()) if (x.org === o) for (const k of x.kin) if (k !== org) out.add(k);
    }
    return [...out];
  }
  appendRelease(org, m, kin) {
    const keys = dimKeys('llm');
    const tags = [...(m.open ? [m.license === 'restrictive' ? 'LR' : 'LP'] : []), ...(org === 'academia' ? ['A'] : [])];
    if ([...this.meta.values()].some(x => E.normName(x.name) === E.normName(m.name) || x.relId === RV.relId(m.name))) throw new Error(`名字撞了：${m.name}`);
    RELEASE_DAYS_OVERRIDES[m.name] = { day: m.releasedDay };
    this.rows.push([org, m.releasedDay.slice(0, 7), m.name, org === 'academia' ? 'large' : (M.clsOf(m) || 'mid'), m.open ? 1 : 0, keys.map(k => r1(m.dims[k] ?? 0)), m.price || 'standard', tags.join(',')]);
    RV.setReleases([...this.rows]);
    this.version += 1;
    const rel = RV.RELEASES.find(r => r.id === RV.relId(m.name));
    const bench = {};
    for (const b of ['mmlu', 'arena']) if (BENCH_BY_ID[b].from <= rel.date) bench[b] = r1(M.rivalScore(BENCH_BY_ID[b], rel, rel.date));
    const meta = { org, relId: rel.id, modelId: m.id ?? null, name: m.name, q: qOf(m.dims), dims: { ...m.dims }, day: m.releasedDay, open: !!m.open, license: m.license ?? null, kin, bench, techs: m.techs || [], seq: ++this.seq };
    this.meta.set(rel.id, meta);
    return { rel, meta };
  }
  companyRows(day = this.day) { return [...this.meta.values()].filter(x => x.org !== 'academia' && x.day <= day); }
  companyBest(day = this.day) { return Math.max(-Infinity, ...this.companyRows(day).map(x => x.q)); }
  acadBest() { return this.acad.q; }
  // 锚点（M.3.5 第 2 条）：别家可见的最强，排除血统里有自己的发布；学界行同样按血统排除（退回到最近一行不含自己的）。
  anchorRows(org, day) { return [...this.meta.values()].filter(x => x.day <= day && x.org !== org && !x.kin.includes(org)); }
  anchorFor(org, day) { return Math.max(0, ...this.anchorRows(org, day).map(x => x.q)); }
  envFor(org, day) {
    const out = {};
    for (const x of this.anchorRows(org, day)) for (const [k, v] of Object.entries(x.dims)) if (!(out[k] >= v)) out[k] = v;
    return out;
  }
  // SOTA 世界账本（M.3.4）。c = { org, relId, modelId, name, q, day, kin }。
  offer(c) {
    const L = this.label;
    L.field.add(c.org);
    const main = !(c.org in L.best) || c.q >= L.best[c.org];
    if (main) L.best[c.org] = c.q;
    if (L.field.size < LAB.FIELD) return null;
    const acad = this.acadBest();
    if (c.q <= acad) return null;                                   // labelGate：候选要高过学界最强
    const h = L.holder;
    const credit = (x, via) => { (L.made[x.org] ??= []).push({ relId: x.relId, modelId: x.modelId, day: c.day, q: x.q, via }); };
    if (!h) {
      const pool = this.companyRows(c.day).filter(x => x.q > acad);
      const best = pool.reduce((a, x) => (!a || x.q > a.q || (x.q === a.q && x.seq < a.seq) ? x : a), null);
      const other = Math.max(acad, ...this.companyRows(c.day).filter(x => x.org !== best.org).map(x => x.q));
      L.holder = { ...best, since: c.day, via: 'fill', counted: best.q - other >= LAB.FILL_LEAD, countedAt: null };
      if (L.holder.counted) { L.holder.countedAt = c.day; credit(L.holder, 'fill'); }
      return 'fill';
    }
    if (c.org === h.org) {
      if (c.q >= h.q && c.relId !== h.relId) { L.holder = { ...c, since: c.day, via: 'self', counted: h.counted, countedAt: h.countedAt }; return 'self'; }
      return null;
    }
    if (c.q > h.q + LAB.EPS) { L.holder = { ...c, since: c.day, via: 'swap', counted: true, countedAt: c.day }; credit(L.holder, 'swap'); return 'swap'; }
    if (!h.counted && main && c.q >= h.q - LAB.DEFEND_NEAR && !c.kin.includes(h.org)) { h.counted = true; h.countedAt = c.day; credit(h, 'defend'); return 'defend'; }
    return null;
  }
  // 稳坐（评审意见：领先别家最强和学界中较高者 ≥ FILL_LEAD 连续 30 天，也算炼出）。
  steadyCheck(day) {
    const L = this.label, h = L.holder;
    if (!h || h.counted) { L.steadySince = null; return null; }
    const other = Math.max(this.acadBest(), ...this.companyRows(day).filter(x => x.org !== h.org).map(x => x.q));
    if (h.q - other < LAB.FILL_LEAD) { L.steadySince = null; return null; }
    L.steadySince ??= day;
    if (daysBetween(L.steadySince, day) < LAB.STEADY_DAYS) return null;
    h.counted = true; h.countedAt = day;
    (L.made[h.org] ??= []).push({ relId: h.relId, modelId: h.modelId, day, q: h.q, via: 'steady' });
    return 'steady';
  }
  // 技术账本（M.3.6）。cal：学界日历条目（天时，不触发自动升档、不算技术扩散）。
  techUp(id, level, org, why, { cal = false } = {}) {
    const t = TECH_BY_ID[id];
    if (!t || t.mod !== 'llm') return false;
    const cur = this.tech[id]?.level ?? 'none';
    if (LV.indexOf(level) <= LV.indexOf(cur)) return false;
    this.tech[id] = { level, by: org, since: this.day, cal };
    this.techLog.push(`${this.day} ${t.name}：${{ none: '没人会', secret: '有人自研', proof: '有人做出', paper: '论文', open: '开源' }[cur]} → ${{ secret: '自研（只有它知道）', proof: '有人做出来了', paper: '论文公开', open: '开源' }[level]}（${org === 'academia' ? '学界' : org}，${why}）`);
    if (level === 'secret' || cal) return true;
    const fam = org;
    const note = `${org === 'academia' ? '学界' : FAMILIES[fam].company}${why}`;
    (TECH_SRC[id] ??= []).push([this.day.slice(0, 7), fam, level, note]);
    for (const c of this.companies) if (c.id !== org) c.s.scheduled.push({ at: c.s.day, news: { date: c.s.date, day: c.s.day, type: 'tech', title: `${org === 'academia' ? '学界' : FAMILIES[fam].company}：${t.name}`, detail: why }, techsrc: [id, fam, level, note] });
    // 技术扩散只算“方法第一次公开”（从没公开过升到论文或开源）；原本就有论文的技术再开源，不算。
    if (org !== 'academia' && LV.indexOf(cur) < LV.indexOf('paper') && LV.indexOf(level) >= LV.indexOf('paper') && !this.acad.gains.has(id)) { this.acad.gains.add(id); this.acad.publishers.add(org); }
    return true;
  }
  techAuto() {
    for (const [id, x] of Object.entries(this.tech)) {
      if (x.cal) continue;
      const age = daysBetween(x.since, this.day);
      if (x.level === 'proof' && age >= AUTO.PROOF_TO_PAPER) this.techUp(id, 'paper', 'academia', '照着产品反推出方法发了论文');
      else if (x.level === 'paper' && age >= AUTO.PAPER_TO_OPEN) this.techUp(id, 'open', 'academia', '开源了复现代码');
    }
  }
  // 学界跟进（M.3.7）：每月最后一天收盘时算一次目标值，够 STEP 就追加一行。
  acadMonthly(D) {
    const best = this.companyBest(D);
    if (!Number.isFinite(best)) return null;
    let follow = -Infinity, src = null;
    for (const x of this.companyRows(D)) if (x.open && daysBetween(x.day, D) >= ACAD.OPEN_LAG && x.q - ACAD.OPEN_GAP > follow) { follow = x.q - ACAD.OPEN_GAP; src = x; }
    const target = Math.min(best - ACAD.BELOW_TOP, Math.max(this.acad.start, follow) + ACAD.TECH_GAIN * this.acad.gains.size);
    if (target - this.acad.q < ACAD.STEP) return null;
    const base = src && follow >= this.acad.start ? src : this.acad.startRow;
    const dims = Object.fromEntries(Object.entries(base.dims).map(([k, v]) => [k, v * target / base.q]));
    const kin = [...new Set([...(base.org !== 'academia' ? [base.org, ...base.kin] : []), ...this.acad.publishers])];
    this.acad.rows += 1;
    const name = `社区开源基线 ${D.slice(0, 7)}`;
    const { meta } = this.appendRelease('academia', { name, releasedDay: D, dims, open: true, license: 'permissive', price: 'budget' }, kin);
    this.acad.log.push(`${D} ${name} q=${r1(meta.q)}（跟进 ${src ? src.name : '—'}，技术扩散 ${this.acad.gains.size} 项${kin.length ? `，血统含 ${kin.join(',')}` : ''}）`);
    this.acad.q = meta.q;
    return meta;
  }
  // 收盘：当天的发布统一入表（按 q 从高到低，同分按命令先后），过标签、记技术；月末学界跟进；推给别家（次日早上可见）。
  settleDay(D) {
    const fresh = [];
    if (D.endsWith('-01')) for (const id of ACAD_ORIGINAL) for (const [ym, fam, level] of this.calendar[id] || []) if (ym === D.slice(0, 7) && fam === 'academia') this.techUp(id, level, 'academia', '学界（日历）', { cal: true });
    for (const c of this.companies) {
      const s = c.s;
      for (const m of s.models) if (m.stage === 'released' && m.releasedDay === D && !m.hist && !c.seen.has(m.id)) { c.seen.add(m.id); fresh.push({ c, m, seq: c.cmdSeq }); }
      for (const id of Object.keys(s.firsts || {})) if (!c.firsts.has(id)) { c.firsts.add(id); this.techUp(id, 'secret', c.id, '自研完成'); }
      for (const id of Object.keys(s.papers || {})) if (!c.papers.has(id)) { c.papers.add(id); this.techUp(id, 'paper', c.id, '发了技术报告'); }
    }
    fresh.sort((a, b) => qOf(b.m.dims) - qOf(a.m.dims) || a.seq - b.seq);
    const out = [];
    for (const { c, m } of fresh) {
      const kin = this.kinOf(c.id, m);
      const { rel, meta } = this.appendRelease(c.id, m, kin);
      const res = this.offer({ org: c.id, relId: rel.id, modelId: m.id, name: m.name, q: meta.q, day: D, kin, seq: meta.seq });
      if (res && res !== 'defend') this.label.chain.push({ ...this.label.holder });
      for (const id of m.techs || []) this.techUp(id, m.open ? 'open' : 'proof', c.id, m.open ? `开源 ${m.name} 的权重` : `${m.name} 上线`);
      out.push({ c, m, rel, meta, res });
    }
    const steady = this.steadyCheck(D);
    if (steady) this.label.chain.push({ ...this.label.holder, via: 'steady', since: D });
    this.techAuto();
    const acadRow = addDays(D, 1).slice(0, 7) !== D.slice(0, 7) ? this.acadMonthly(D) : null;
    // 推给别家：沿用 loop.js 的“标签 → 新闻 → 里程碑”链（M1 里由 s.scheduled 次日早上放出）。
    for (const x of [...out.map(o => ({ from: o.c, rel: o.rel })), ...(acadRow ? [{ from: null, rel: RV.RELEASES.find(r => r.id === acadRow.relId) }] : [])])
      for (const o of this.companies) if (o !== x.from && o.s.status === 'playing') { o.s.scheduled.push({ at: addDays(D, 1), ...releaseEntry(x.rel) }); releaseScheduled(o.s); }
    // 回写镜像（M.3.1 的 projectSota）：本家 by='me'、id=快照 id；别家 by=公司 id、id=relId；made 换成数组形状。
    for (const c of this.companies) this.projectSota(c);
    return { out, steady, acadRow };
  }
  projectSota(c) {
    const so = c.s.sota, h = this.label.holder;
    if (!so) return;
    so.holder = h ? { by: h.org === c.id ? 'me' : h.org, org: h.org, id: h.org === c.id ? h.modelId : h.relId, name: h.name, q: h.q, since: h.since, via: h.via, counted: h.counted, countedAt: h.countedAt ?? null } : null;
    so.field = [...this.label.field];
    so.made = (this.label.made[c.id] || []).map(x => ({ modelId: x.modelId, day: x.day, q: x.q, via: x.via }));
  }
  board(benchId) {
    const best = {};
    for (const x of this.meta.values()) { if (x.org === 'academia') continue; const v = x.bench[benchId]; if (v !== undefined && !(best[x.org]?.v >= v)) best[x.org] = { v, name: x.name }; }
    return Object.entries(best).sort((a, b) => b[1].v - a[1].v).map(([org, x], i) => `${i + 1}.${x.name}(${org}) ${x.v}`);
  }
}

// ---------- 3. 清空真实世界，只留天时；技术账本开局初始化 ----------
const startDay = `${YEAR}-01-01`;
const world = new SimWorld(startDay);
RV.setReleases([]);
W.setWorldEvents([]);   // 原型里政策类大事全关（M.3.9 的触发器不在原型范围）
FAMILIES.academia = { name: '社区开源基线', company: '学界与开源社区', org: 'academia', mod: 'llm', region: 'global', brand: 0.08 };
world.calendar = {};
const initLog = [];
let techCleared = 0;
for (const t of TECHS.filter(x => x.mod === 'llm')) {
  const list = TECH_SRC[t.id];
  if (!list) { if (t.from <= startDay.slice(0, 7)) world.tech[t.id] = { level: 'paper', by: 'academia', since: startDay, cal: true }; continue; }   // 老技术：照旧到 t.from 自动按论文公开
  const pre = list.filter(([ym, fam]) => fam === 'academia' && ym <= startDay.slice(0, 7));   // 从零局：开局前只认学界条目
  const future = ACAD_ORIGINAL.includes(t.id) ? list.filter(([ym, fam]) => fam === 'academia' && ym > startDay.slice(0, 7)) : [];
  techCleared += list.length - pre.length - future.length;
  world.calendar[t.id] = future;
  TECH_SRC[t.id] = [...pre, ...future];   // 删空的留空数组，免得 techStatus 当成“老技术”到日子自动公开
  for (const [, , level] of pre) if (LV.indexOf(level) > LV.indexOf(world.tech[t.id]?.level ?? 'none')) world.tech[t.id] = { level, by: 'academia', since: startDay, cal: true };
}
for (const [id, x] of Object.entries(world.tech)) initLog.push(`${TECH_BY_ID[id].name}=${{ paper: '论文', open: '开源', proof: '有人做出' }[x.level]}`);

// ---------- 4. 公司 ----------
const NAMES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Mu'];
const SPECS = [];
for (let i = 0; i < NCO; i++) {
  const stance = ROUTES === 'mix' ? ROUTE_MIX[(i + SEED) % 3] : ROUTES;
  SPECS.push({ id: NAMES[i].toLowerCase(), name: NAMES[i], tier: TIER, kind: 'bot', stance, license: stance === 'open' ? 'permissive' : stance === 'open_restricted' ? 'restrictive' : null });
}
if (SHILL) SPECS.push({ id: 'shill', name: 'Shill', tier: 'small', kind: 'shill', stance: 'open', license: 'permissive' });
for (const sp of SPECS) world.registerCompany(sp);

// 从零局的开局技术（M.2.2）：只给开局时世界账本里已到论文或开源的（引擎按年份给的那批里，没公开的一律拿掉）。
const zeroTechs = s => { s.techs = s.techs.filter(id => TECH_BY_ID[id].start || TECH_BY_ID[id].mod !== 'llm' || ['paper', 'open'].includes(world.tech[id]?.level)); return s; };
// 学界起点（M.3.7）：min(开局前真实开源最强 − 4, 本局最弱开局档 4 个月内能练出的最好底座出生 q − 3)。
const realOpen = realBest(addDays(startDay, -1), true) ?? REAL.find(r => r.open);
let probeQ = -Infinity;
{
  const probe = { id: 'c_probe', name: 'Probe', tier: TIER };
  world.registerCompany(probe);
  const s = E.createGame('c_probe', `y${YEAR}`, SEED);
  zeroTechs(s);
  const pool = E.poolStats(s).tokens;
  for (const total of PARAM_TOTALS) for (const mult of [20, 80, 200]) {
    const cfg = { total, active: total, arch: 'dense', tokens: Math.max(0.5, Math.min(pool * 2, Math.round(total * mult / 100) / 10)) };
    if (!E.projectCheck(s, cfg).ok) continue;
    const pv = E.previewProject(s, cfg);
    if (pv.months > ACAD.PROBE_MONTHS) continue;
    const birth = Object.fromEntries(Object.entries(pv.base).map(([k, v]) => [k, Math.min(95, v + (k === 'safety' ? 18 : 2))]));
    probeQ = Math.max(probeQ, qOf(birth));
  }
  delete COMPANY_BY_ID.c_probe; delete FAMILIES.c_probe; PLAYABLE.splice(PLAYABLE.findIndex(p => p.id === 'c_probe'), 1);
}
const acadStart = r1(Math.min(realOpen.q - ACAD.REAL_GAP, probeQ - ACAD.PROBE_GAP));
{
  const dims = Object.fromEntries(Object.entries(realOpen.dims).map(([k, v]) => [k, v * acadStart / realOpen.q]));
  const { meta } = world.appendRelease('academia', { name: `社区开源基线 ${startDay.slice(0, 7)}`, releasedDay: startDay, dims, open: true, license: 'permissive', price: 'budget' }, []);
  world.acad.q = meta.q; world.acad.start = meta.q; world.acad.startRow = meta;
  world.acad.log.push(`${startDay} 起点 q=${r1(meta.q)}（真实开源参照 ${realOpen.name} ${r1(realOpen.q)} − ${ACAD.REAL_GAP}；本局 ${TIER} 档 4 个月内最好底座 ${r1(probeQ)} − ${ACAD.PROBE_GAP}；取小）`);
}

world.companies = SPECS.map((sp, i) => ({ ...sp, s: zeroTechs(E.createGame(sp.id, `y${YEAR}`, SEED + i)), decideAt: startDay, seen: new Set(), firsts: new Set(), papers: new Set(), errors: [], cmdSeq: 0 }));

// 世界口子（M0 的 P() 在原型里的替身）
const mpStratMode = 'adaptive';
globalThis.__MP = {
  stratMode: mpStratMode,
  horizon: HORIZON,
  techSelf: true,
  birthScaling: !KEEP_CLAMP,
  anchor: ANCHOR_MODE === 'world' ? (s, day) => world.anchorFor(s.company.org, day) : null,
  anchorEnv: ANCHOR_MODE === 'world' ? (s, day) => world.envFor(s.company.org, day) : null,
  // botPublish（M.3.12）：开源和受限开源路线，发布时附上全部首创技术的报告；其余路线由 weeklyPublish 处理。
  relOpts: s => (ROUTES !== 'closed' && ['open', 'open_restricted'].includes(s.route?.stance) ? { papers: RS.unpublishedFirsts(s) } : {}),
};
function weeklyPublish(c) {
  if (ROUTES === 'closed') return;
  const s = c.s;
  if (['open', 'open_restricted'].includes(s.route?.stance)) return;
  const ids = RS.unpublishedFirsts(s).filter(id => { const x = world.tech[id]; return (x && x.by !== c.id && LV.indexOf(x.level) >= LV.indexOf('proof')) || daysBetween(s.firsts[id], s.day) >= 365; });
  if (ids.length) RS.publishPapers(s, ids);
}
// 陪跑：只蒸馏当前最强的开源模型，练完就开源发布。
function shillWeekly(c) {
  const s = c.s;
  const tryDo = (fn, label) => { try { fn(); return true; } catch (e) { c.errors.push(`${s.day} ${label}: ${e.message}`); return false; } };
  BOT.freeOps(s);
  const w = E.workingModel(s);
  if (!s.project && !w) {
    const pool = E.poolStats(s).tokens;
    let best = null, bq = -1;
    for (const total of PARAM_TOTALS) { const cfg = { total, active: total, arch: 'dense', tokens: Math.max(0.3, Math.min(pool * 2, Math.round(total * 20 / 100) / 10)) }; if (!E.projectCheck(s, cfg).ok) continue; const pv = E.previewProject(s, cfg); if (pv.months <= 4 && qOf(pv.base) > bq) { bq = qOf(pv.base); best = cfg; } }
    if (best) tryDo(() => E.startProject(s, best), 'project');
  }
  if (w?.stage === 'post' && !s.orders.some(o => o.kind === 'data')) {
    const o = E.distillOptions(s).filter(x => x.open && x.ok && x.mode !== 'api' && x.cost < s.cash).sort((a, b) => b.teacherQ - a.teacherQ)[0];
    if (o) tryDo(() => E.decide(s, 'data', { id: o.id }), 'distill');
  }
  const a = E.availableActions(s), live = E.liveModel(s), wk = E.workingModel(s);
  if (a.release && (!live || qOf(wk.dims) >= qOf(live.dims) + 0.3 || wk.postMonths >= 4)) tryDo(() => E.decide(s, 'release', {}), 'release');
  BOT.resolveAll(s);
  const dir = a.train ? E.directionsFor(s)[0]?.key : null;
  tryDo(() => E.decide(s, dir ? 'train' : 'research', dir ? { dir } : {}), 'focus');
}

// ---------- 5. 主循环：命令 → 开盘 → 各家 tickDay（顺序每天轮换）→ 收盘 ----------
const endDay = `${END}-${String(new Date(Date.UTC(Number(END.slice(0, 4)), Number(END.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`;
const DAYS = Math.min(Number(arg('--days', 730)), daysBetween(startDay, endDay) + 1);
const monthly = [], relLog = [];
const MET = { stallMax: 0, stallFrom: null, lastUp: null, lead8Run: 0, lead8Max: 0, holderViol: 0, acadViol: 0, acadCheckDays: 0, kinLift: 0, swaps: 0, firstRel: null, firstOver: null, leaderF: [], allF: [], fZero: 0 };
let worldBestSeen = -Infinity;
const t0 = performance.now();
let curMonth = startDay.slice(0, 7);
for (let i = 0; i < DAYS; i++) {
  const D = world.day;
  // 命令段：电脑公司做决定（M1 里在这一步分配命令序号）
  for (const c of world.companies) {
    const s = c.s;
    if (s.status !== 'playing') continue;
    try {
      BOT.resolveAll(s);
      if (s.status === 'playing' && s.day >= c.decideAt) {
        c.cmdSeq = ++world.seq;
        if (c.kind === 'shill') shillWeekly(c); else { BOT.freeOps(s); BOT.planProject(s); BOT.weekly(s, c.errors); weeklyPublish(c); }
        c.decideAt = addDays(s.day, 7);
      }
      BOT.resolveAll(s);
    } catch (e) { c.errors.push(`${s.day} 命令抛错 ${e.stack.split('\n').slice(0, 3).join(' | ')}`); }
  }
  // 开盘：冲顶力参照（中位数）
  setEffortRef(world.companies.filter(c => c.s.status === 'playing' && c.kind !== 'shill').map(c => c.s));
  // 各家推进：读的都是昨天收盘的世界；顺序每天轮换
  const order = world.companies.map((_, k) => world.companies[(k + i) % world.companies.length]);
  for (const c of order) {
    const s = c.s;
    if (s.status !== 'playing') continue;
    try {
      if (s.queue.length) BOT.resolveAll(s);
      E.tickDay(s);
      if (process.env.DBG) for (const m of s.models) if (m.pretraining?.completed === s.day && !m.dbg) { m.dbg = 1; console.error(s.day, c.id, '底座出生', m.total, 'B q', r1(qOf(m.dims))); }
    } catch (e) { c.errors.push(`${s.day} 抛错 ${e.stack.split('\n').slice(0, 3).join(' | ')}`); s.status = 'crashed'; }
  }
  // 收盘
  const { out, steady } = world.settleDay(D);
  for (const x of out) {
    if (x.res === 'swap') MET.swaps += 1;
    MET.firstRel ??= D; MET.firstQ ??= r1(x.meta.q);
    relLog.push(`${D} ${x.c.id} 发布 ${x.m.name} q=${r1(x.meta.q)} ${x.m.open ? `开源(${x.meta.license === 'restrictive' ? '受限' : '宽松'})` : '闭源'}${x.meta.kin.length ? ` 血统含 ${x.meta.kin.join(',')}` : ''}${x.res ? ` → 标签:${x.res}` : ''}`);
  }
  if (steady) relLog.push(`${D} ${world.label.holder.name} 稳坐 ${LAB.STEADY_DAYS} 天，算炼出`);
  // 指标
  const best = world.companyBest(D);
  if (Number.isFinite(best)) {
    if (best > worldBestSeen + 1e-9) { worldBestSeen = best; MET.lastUp = D; }
    const stall = daysBetween(MET.lastUp, D);
    if (stall > MET.stallMax) { MET.stallMax = stall; MET.stallFrom = MET.lastUp; }
    const per = {};
    for (const x of world.companyRows(D)) per[x.org] = Math.max(per[x.org] ?? -Infinity, x.q);
    const top = Object.values(per).sort((a, b) => b - a);
    MET.lead8Run = top.length >= 2 && top[0] - top[1] > 8 ? MET.lead8Run + 1 : 0;
    if (top.length >= 2) { MET.spreadSum = (MET.spreadSum || 0) + top[0] - top.at(-1); MET.leadSum = (MET.leadSum || 0) + top[0] - top[1]; MET.spreadN = (MET.spreadN || 0) + 1; }
    MET.lead8Max = Math.max(MET.lead8Max, MET.lead8Run);
    const h = world.label.holder;
    const visMax = Math.max(best, world.acadBest());
    if (h && h.q < visMax - LAB.EPS - 1e-9) MET.holderViol += 1;
    if (best >= world.acad.start + 1) { MET.firstOver ??= D; MET.acadCheckDays += 1; if (world.acadBest() > best - ACAD.BELOW_TOP + 1e-9) MET.acadViol += 1; }
    for (const c of world.companies) {
      if (c.kind === 'shill' || c.s.status !== 'playing') continue;
      const w = E.workingModel(c.s);
      if (!w || w.stage !== 'post') continue;
      const hd = M.hardness(c.s, w);
      if (Math.abs(hd.delta) <= 1) { MET.allF.push(hd.F); if (h && h.org === c.id) MET.leaderF.push(hd.F); }
      if (ANCHOR_MODE === 'world') { const all = Math.max(0, ...[...world.meta.values()].filter(x => x.day <= c.s.day && x.org !== c.id).map(x => x.q)); if (all > world.anchorFor(c.id, c.s.day) + 0.05) MET.kinLift += 1; }
    }
  }
  world.day = addDays(D, 1);
  if (world.day.slice(0, 7) !== curMonth) {
    const h = world.label.holder;
    monthly.push(`${curMonth} | ${h ? `${h.name}(${h.org}) ${r1(h.q)}${h.counted ? ' 算数' : ' 未算数'}` : '无'} | 公司最强 ${Number.isFinite(best) ? r1(best) : '—'} 学界 ${r1(world.acadBest())} | 在练/在线 q ${world.companies.map(c => { const w = E.workingModel(c.s) || E.liveModel(c.s); return w ? r1(qOf(w.dims)) : '—'; }).join('/')} | 现金 ${world.companies.map(c => money(c.s.cash)).join(' ')}`);
    if (process.env.DBG) for (const c of world.companies) { const w = E.workingModel(c.s); if (!w) continue; const hd = M.hardness(c.s, w); console.error(curMonth, c.id, 'R', r1(hd.R), 'q', r1(hd.q), 'A', hd.A.toFixed(2), 'fComp', hd.fComp.toFixed(2), 'fData', hd.fData.toFixed(2), 'fKnow', hd.fKnow.toFixed(2), 'fLead', hd.fLead.toFixed(2), 'rho', hd.rho.toFixed(2), 'F', hd.F.toFixed(3), 'Hq', hd.Hq.toFixed(3), 'focus', c.s.focus?.kind, c.s.focus?.dir || '', '| gains', E.directionsFor(c.s).map(d => { const p = E.postPreview(c.s, d.key); return d.key + ':' + (p ? r1(Object.entries(p.gains).filter(([k]) => k !== 'safety').reduce((a, [, v]) => a + v, 0)) : '-'); }).join(' '), '| caps', JSON.stringify(Object.fromEntries(Object.entries(M.effectiveCaps(c.s, w)).map(([k, v]) => [k, r1(v)]))), 'dims', JSON.stringify(Object.fromEntries(Object.entries(w.dims).map(([k, v]) => [k, r1(v)])))); }
    curMonth = world.day.slice(0, 7);
  }
}
const ms = performance.now() - t0;

// ---------- 6. 输出 ----------
const lastDay = addDays(world.day, -1);
const rb = realBest(lastDay), ro = realBest(lastDay, true);
const endBest = world.companyBest(lastDay);
const res = {
  tier: TIER, year: YEAR, n: NCO, routes: ROUTES, seed: SEED, days: DAYS, ref: REF_MODE, anchor: ANCHOR_MODE, clamp: KEEP_CLAMP, shill: SHILL,
  horizon: HORIZON, supply: SUPPLY_MULT, spreadMean: MET.spreadN ? r1(MET.spreadSum / MET.spreadN) : null, leadMean: MET.spreadN ? r1(MET.leadSum / MET.spreadN) : null, firstQ: MET.firstQ ?? null, acadStart, realOpenRef: r1(realOpen.q), probeQ: r1(probeQ), firstRel: MET.firstRel, firstOver: MET.firstOver,
  acadOverDays: MET.firstOver ? daysBetween(startDay, MET.firstOver) : null,
  endBest: r1(endBest), realOpenEnd: r1(ro.q), realFrontEnd: r1(rb.q), band: Number.isFinite(endBest) && endBest >= ro.q - 12 && endBest <= rb.q + 3,
  swaps: MET.swaps, stallMax: MET.stallMax, lead8Max: MET.lead8Max, holderViol: MET.holderViol, acadViol: MET.acadViol,
  leaderFmed: MET.leaderF.length ? Number(med(MET.leaderF).toFixed(2)) : null, leaderFn: MET.leaderF.length, allFmed: MET.allF.length ? Number(med(MET.allF).toFixed(2)) : null,
  made: Object.fromEntries(Object.entries(world.label.made).map(([k, v]) => [k, v.length])), kinLift: MET.kinLift,
  acadRows: world.acad.rows, acadEnd: r1(world.acadBest()), techEvents: world.techLog.length,
  errors: world.companies.reduce((a, c) => a + c.errors.length, 0), crashed: world.companies.filter(c => c.s.status === 'crashed').length,
  msPerCoDay: Number((ms / DAYS / world.companies.length).toFixed(2)),
};
if (JSON_OUT) { console.log(JSON.stringify(res)); process.exit(0); }
const o = [];
const say = (...a) => o.push(a.join(' '));
say(`=== 原型 v2：一个世界、${world.companies.length} 家公司（种子 ${SEED}，${YEAR}-01 从零开局，${TIER} 档，${DAYS} 天到 ${lastDay}）`);
say(`口子：锚点 ${ANCHOR_MODE === 'world' ? 'M.3.5（排除血统，含学界）' : '引擎原样（对照）'}；出生护栏 ${KEEP_CLAMP ? '引擎原样（对照）' : '从头预训练不过护栏'}；冲顶力参照 ${REF_MODE === 'world' ? '在场公司中位数（下限日历 2%/10%）' : '日历表（对照）'}；机器人策略 ${mpStratMode}，立项工期上限 ${HORIZON} 个月`);
say(`公司：${world.companies.map(c => `${c.id}=${c.kind === 'shill' ? '陪跑' : '现有机器人'}（${c.tier}，${c.stance}）`).join('；')}`);
say(`真实世界已清空：发布 0 行；行业大事 0 条；技术来源删掉 ${techCleared} 条（真实公司的全部，加学界日历里 7 条“跟着真实公司走”的）。`);
say(`技术账本开局初始化：${initLog.join('、') || '（空）'}；之后学界日历只剩 ${ACAD_ORIGINAL.join('、')} 这 5 项里开局以后的条目。`);
say(`学界：${world.acad.log[0]}`);
say('\n--- 每月：世界账本的 SOTA 持有者 | 公司已发最强、学界 | 各家在练/在线 q | 各家现金');
for (const l of monthly) say(l);
say('\n--- 发布流水（世界账本，同一天按 q 从高到低，同分按命令先后）');
for (const l of relLog.slice(0, QUIET ? 15 : 60)) say(l);
if (relLog.length > (QUIET ? 15 : 60)) say(`……共 ${relLog.length} 条`);
say('\n--- 标签链');
for (const hh of world.label.chain) say(`${hh.since} ${hh.name}(${hh.org}) q=${r1(hh.q)} ${hh.via}${hh.counted ? ' 算数' : ''}`);
say(`炼出过：${JSON.stringify(res.made)}`);
say('\n--- 学界与开源社区');
for (const l of world.acad.log) say(l);
say('\n--- 技术账本（开局初始化之后真正发生的升档）');
for (const l of world.techLog.slice(0, QUIET ? 15 : 40)) say(l);
if (world.techLog.length > (QUIET ? 15 : 40)) say(`……共 ${world.techLog.length} 条`);
say('\n--- 世界榜单（一款一个分，发布那天写进行里；学界不参与名次）');
for (const b of ['arena', 'mmlu']) say(`${BENCH_BY_ID[b].name}：${world.board(b).join('  ') || '（还没有）'}`);
say('\n--- F4a 指标');
say(`世界最强（公司）：${r1(endBest)}；真实开源最强 ${r1(ro.q)}（${ro.name}），真实前沿 ${r1(rb.q)}（${rb.name}）；落在“开源 −12 到前沿 +3”之间：${res.band ? '是' : '否'}`);
say(`SOTA 换手（换成别家）：${MET.swaps} 次；世界最强连续不涨最长 ${MET.stallMax} 天（从 ${MET.stallFrom ?? '—'} 起）；领先第二名超过 8 分连续最长 ${MET.lead8Max} 天`);
say(`持标那款比世界可见最强（含学界）低出 EPS 的天数：${MET.holderViol}；有公司超过学界以后，学界 > 公司最强 − 1 的天数：${MET.acadViol}/${MET.acadCheckDays}`);
say(`第一款公司发布 ${MET.firstRel ?? '—'}；公司最强第一次超过学界起点 1 分：${MET.firstOver ?? '—'}（开局后 ${res.acadOverDays ?? '—'} 天）`);
say(`冲顶力：持标者在 |δ|≤1 时 F 的中位数 ${res.leaderFmed ?? '—'}（${MET.leaderF.length} 个公司·天）；所有公司在 |δ|≤1 时 F 中位 ${res.allFmed ?? '—'}`);
say(`锚点里被“血统排除”拿掉的抬锚（公司·天）：${MET.kinLift}；第一名和最后一名的平均差距 ${res.spreadMean ?? '—'} 分，第一名领先第二名平均 ${res.leadMean ?? '—'} 分`);
{
  const shares = world.companies.map(c => { const live = E.liveModel(c.s); if (!live) return 0; return E.marketShares(c.s, 'api', 'global', [{ q: qOf(live.dims), tier: c.s.products.api?.tier || 'standard', role: 'flagship' }]).mine[0].share; });
  say(`API 全球份额（各家自己算，加起来）：合计 ${r1(shares.reduce((a, b) => a + b, 0) * 100)}%（M1 换成共用月结以前不守恒）`);
}
say('\n--- 结局');
for (const c of world.companies) {
  const s = c.s, live = E.liveModel(s);
  say(`${c.id} ${s.status} 现金 ${money(s.cash)} 估值 ${money(s.valuation)} 在线 ${live?.name ?? '—'} ${live ? r1(qOf(live.dims)) : ''} 发布 ${s.models.filter(m => m.stage === 'released').length} 款 卡 ${E.gpuCount(s)} 首创 ${Object.keys(s.firsts || {}).length} 论文 ${Object.keys(s.papers || {}).length} 报错 ${c.errors.length}${c.errors.length ? ` 例：${c.errors[0]}` : ''}`);
}
say(`世界表版本 ${world.version}；推进 ${DAYS} 天用时 ${Math.round(ms)} ms（约 ${res.msPerCoDay} ms/家/天，含每天给在练模型算一次难度读数）`);
say(`\nJSON ${JSON.stringify(res)}`);
console.log(o.join('\n'));
