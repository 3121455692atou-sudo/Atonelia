#!/usr/bin/env node
// 行为指纹：标了“指纹不变”的包，改完代码要证明整局结果一模一样。
//   24 家公司 × 4 个剧本 × {机器人 playGame, 大按钮 playAdvised}，种子 1，整局跑完（共 192 局）。
//   每局记两样东西：终局 JSON.stringify(s) 的哈希，以及每 90 天一个检查点的哈希。结果存在 tests/fixtures/fingerprint.json。
//
// 用法（都在仓库根目录运行）：
//   node scripts/fingerprint.mjs --check                    和基线比对；有不一致就列出是哪几局，退出码 1
//   node scripts/fingerprint.mjs --check --only gpt,kimi    只比这几家公司（逗号分隔）
//   node scripts/fingerprint.mjs --write                    重存基线（会改变行为的包：先在 docs/fingerprint-changes.md 登记原因，再重存）
//   node scripts/fingerprint.mjs --diff <公司> <剧本> [--mode bot|advised] [--ref <git 版本>]
//                                                           打印这一局当前代码和基线代码之间第一处不同的路径
//
// 关于 --diff：基线里只存哈希，所以要把“生成基线时的代码”拿出来重跑一遍才能逐项对比。
//   基线代码 = 最后一次改动 fingerprint.json 的那个提交（基线和代码在同一个提交里存下，所以那个提交的代码就是基线代码），
//   可以用 --ref 指定别的版本。旧代码用 git archive 解到仓库下的 .fp-cache/<提交号>/（已在 .gitignore 里；用完可以整个删掉）。
//   环境变量 FP_SCRATCH 可以改放到别的目录，例如内置盘紧张时：FP_SCRATCH=/Volumes/外置盘/某目录 node scripts/fingerprint.mjs --diff gpt y2023。
//
// 稳定性：同一份代码跑两次结果必须一样。引擎里没有读墙钟时间或 Math.random（随机都走 s.rng），createGame 固定传种子 1。
//   --reverse 倒序跑，用来确认结果不依赖“前面跑过哪些局”（模块里有几个缓存，别让它们串局）。
//   哈希依赖 JS 引擎的数学函数实现，换 Node 大版本后若全部不一致，先怀疑这个（基线里记了生成时的 Node 版本）。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'tests/fixtures/fingerprint.json');
const SEED = 1;
const CHECKPOINT_DAYS = 90;
const MODES = { bot: 'playGame', advised: 'playAdvised' };

const hash = s => crypto.createHash('sha256').update(JSON.stringify(s)).digest('hex').slice(0, 16);
const keyOf = (company, scenario, mode) => `${company}/${scenario}/${mode}`;

// 从某个仓库根目录（当前仓库，或 --diff 解出来的旧版本）加载机器人和公司、剧本表。
// 机器人固定走 tests/helpers/career_bot.mjs：拆分以后它只是个转出口，路径不变。
async function loadWorld(root) {
  const url = p => pathToFileURL(path.join(root, p)).href;
  const bot = await import(url('tests/helpers/career_bot.mjs'));
  const core = await import(url('src/career/data/core.js'));
  const clock = await import(url('src/career/sim/clock.js'));
  return { bot, companies: core.COMPANIES.map(c => c.id), scenarios: core.SCENARIOS.map(x => x.id), daysBetween: clock.daysBetween };
}

// 跑一局。onCheckpoint(序号, s) 在每个检查点调用（取快照用）。
function runGame(w, company, scenario, mode, onCheckpoint = null) {
  const cps = [];
  let next = CHECKPOINT_DAYS;
  const onWeek = s => {
    const d = w.daysBetween(`${s.start}-01`, s.day);
    if (d < next) return;
    onCheckpoint?.(cps.length, s);
    cps.push(hash(s));
    next = (Math.floor(d / CHECKPOINT_DAYS) + 1) * CHECKPOINT_DAYS;
  };
  try {
    const { s, errors } = w.bot[MODES[mode]](company, scenario, SEED, { onWeek });
    return { s, rec: { final: hash(s), cp: cps, day: s.day, status: s.status, errors: errors.length } };
  } catch (e) {
    return { s: null, rec: { threw: String(e.message).slice(0, 120), cp: cps } };
  }
}

function allKeys(w, only, reverse) {
  const keys = [];
  for (const c of w.companies) for (const sc of w.scenarios) for (const m of Object.keys(MODES)) if (!only || only.includes(c)) keys.push([c, sc, m]);
  return reverse ? keys.reverse() : keys;
}

function runAll(w, only, reverse) {
  const games = {};
  const t0 = performance.now();
  for (const [c, sc, m] of allKeys(w, only, reverse)) games[keyOf(c, sc, m)] = runGame(w, c, sc, m).rec;
  // 输出时按固定顺序（公司表顺序 × 剧本 × 模式），不受 --reverse 影响。
  const sorted = {};
  for (const [c, sc, m] of allKeys(w, only, false)) sorted[keyOf(c, sc, m)] = games[keyOf(c, sc, m)];
  return { games: sorted, seconds: (performance.now() - t0) / 1000 };
}

function writeBaseline(games) {
  const lines = Object.entries(games).map(([k, r]) => `    ${JSON.stringify(k)}: ${JSON.stringify(r)}`);
  const head = { version: 1, seed: SEED, checkpointDays: CHECKPOINT_DAYS, node: process.version };
  const out = `{\n${Object.entries(head).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n')}\n  "games": {\n${lines.join(',\n')}\n  }\n}\n`;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, out);
}

// 找出两局记录里第一个不同的检查点：返回描述字符串。
function describeDiff(base, cur) {
  if (cur.threw) return `这一局抛错：${cur.threw}`;
  if (base.threw) return '基线里这一局是抛错的，现在能跑了';
  const n = Math.max(base.cp.length, cur.cp.length);
  for (let i = 0; i < n; i++) {
    if (base.cp[i] !== cur.cp[i]) return `第 ${i + 1} 个检查点（约第 ${(i + 1) * CHECKPOINT_DAYS} 天）起不同`;
  }
  if (base.final !== cur.final) return '检查点都一致，只有终局不同';
  return `终局哈希一致，只有 ${['day', 'status', 'errors'].filter(k => base[k] !== cur[k]).join('、')} 不同`;
}

async function check(only, reverse) {
  if (!fs.existsSync(FILE)) { console.error(`没有基线：${path.relative(ROOT, FILE)}。先运行 --write`); return 2; }
  const base = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const w = await loadWorld(ROOT);
  const { games, seconds } = runAll(w, only, reverse);
  const bad = [];
  for (const [k, cur] of Object.entries(games)) {
    const b = base.games[k];
    if (!b) bad.push(`${k}  基线里没有这一局（公司或剧本表变了？）`);
    else if (b.final !== cur.final || cur.threw || b.threw || b.day !== cur.day || b.errors !== cur.errors || b.status !== cur.status || JSON.stringify(b.cp) !== JSON.stringify(cur.cp) || cur.errors !== 0 || cur.status === 'playing') bad.push(`${k}  ${describeDiff(b, cur)}`);
  }
  if (!only) for (const k of Object.keys(base.games)) if (!(k in games)) bad.push(`${k}  基线里有、现在不再跑了（公司或剧本表变了？）`);
  const n = Object.keys(games).length;
  if (!bad.length) { console.log(`指纹一致：${n} 局，${seconds.toFixed(1)} 秒`); return 0; }
  console.log(`指纹不一致：${bad.length} / ${n} 局（${seconds.toFixed(1)} 秒）`);
  for (const line of bad) console.log(`  ${line}`);
  if (base.node !== process.version) console.log(`注意：基线是 Node ${base.node} 生成的，现在是 ${process.version}；若几乎全部不一致，先在原版本下复核。`);
  console.log('逐项看区别：node scripts/fingerprint.mjs --diff <公司> <剧本>');
  return 1;
}

// ---------- --diff ----------
function git(...args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).trim(); }

function extractRef(ref) {
  const sha = git('rev-parse', '--verify', `${ref}^{commit}`);
  const dir = path.join(process.env.FP_SCRATCH || path.join(ROOT, '.fp-cache'), sha.slice(0, 12));
  if (!fs.existsSync(path.join(dir, 'package.json'))) {
    fs.mkdirSync(dir, { recursive: true });
    const tar = execFileSync('git', ['archive', sha, 'package.json', 'src', 'tests/helpers'], { cwd: ROOT, maxBuffer: 1 << 29 });
    execFileSync('tar', ['-x', '-C', dir], { input: tar, maxBuffer: 1 << 29 });
  }
  return { sha, dir };
}

// 深度优先，按键的出现顺序找出不同的路径（最多 limit 条）。
function diffPaths(a, b, pathStr = 's', out = [], limit = 8) {
  if (out.length >= limit) return out;
  if (a === b) return out;
  const ta = a === null ? 'null' : Array.isArray(a) ? 'array' : typeof a;
  const tb = b === null ? 'null' : Array.isArray(b) ? 'array' : typeof b;
  if (ta !== tb || (ta !== 'object' && ta !== 'array')) {
    if (!(ta === 'number' && tb === 'number' && Number.isNaN(a) && Number.isNaN(b))) out.push({ path: pathStr, old: a, now: b });
    return out;
  }
  if (ta === 'array') {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n && out.length < limit; i++) diffPaths(a[i], b[i], `${pathStr}[${i}]`, out, limit);
    return out;
  }
  const keys = [...Object.keys(a), ...Object.keys(b).filter(k => !(k in a))];
  for (const k of keys) {
    if (out.length >= limit) break;
    diffPaths(a[k], b[k], `${pathStr}.${k}`, out, limit);
  }
  return out;
}
const brief = v => { const t = v === undefined ? 'undefined' : JSON.stringify(v); return t.length > 100 ? `${t.slice(0, 100)}…` : t; };

async function diffGame(company, scenario, modes, ref) {
  const base = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : null;
  const refInfo = extractRef(ref || git('log', '-1', '--format=%H', '--', path.relative(ROOT, FILE)) || 'HEAD');
  console.log(`基线代码：${refInfo.sha.slice(0, 12)}（${refInfo.dir}）`);
  const cur = await loadWorld(ROOT);
  const old = await loadWorld(refInfo.dir);
  if (!cur.companies.includes(company)) { console.error(`没有这家公司：${company}（可选：${cur.companies.join('、')}）`); return 2; }
  if (!cur.scenarios.includes(scenario)) { console.error(`没有这个剧本：${scenario}（可选：${cur.scenarios.join('、')}）`); return 2; }
  let anyDiff = false, referenceUnverified = false;
  for (const mode of modes) {
    const k = keyOf(company, scenario, mode);
    const snaps = { cur: new Map(), old: new Map() };
    const keep = which => (i, s) => snaps[which].set(i, JSON.parse(JSON.stringify(s)));
    const rc = runGame(cur, company, scenario, mode, keep('cur'));
    const ro = runGame(old, company, scenario, mode, keep('old'));
    // 快照仓库可能丢失真正生成 fixture 的提交；不能把两份相同的当前代码当成原基线。
    const expected = base?.games?.[k];
    const trusted = !!expected && !expected.threw && !ro.rec.threw
      && expected.final === ro.rec.final && Array.isArray(expected.cp) && JSON.stringify(expected.cp) === JSON.stringify(ro.rec.cp)
      && expected.day === ro.rec.day && expected.status === ro.rec.status && expected.errors === ro.rec.errors
      && ro.rec.errors === 0 && ro.rec.status !== 'playing';
    if (!trusted) {
      referenceUnverified = true;
      console.log(`${k}  UNVERIFIED_REFERENCE：所选参考代码未复现原 fixture 的完整记录；需要准确的生成提交或参考状态，不能判为原基线验收通过`);
    }
    if (rc.rec.threw || ro.rec.threw) { console.log(`${k}  抛错：现在 ${rc.rec.threw || '无'}；参考代码 ${ro.rec.threw || '无'}`); anyDiff = true; continue; }
    const n = Math.max(rc.rec.cp.length, ro.rec.cp.length);
    let at = -1;
    for (let i = 0; i < n; i++) if (rc.rec.cp[i] !== ro.rec.cp[i]) { at = i; break; }
    let a, b, where;
    if (at >= 0 && snaps.cur.has(at) && snaps.old.has(at)) { a = snaps.old.get(at); b = snaps.cur.get(at); where = `第 ${at + 1} 个检查点（约第 ${(at + 1) * CHECKPOINT_DAYS} 天，${b.day}）`; }
    else if (rc.rec.final !== ro.rec.final) { a = JSON.parse(JSON.stringify(ro.s)); b = JSON.parse(JSON.stringify(rc.s)); where = `终局（${rc.s.day}）`; }
    else { console.log(`${k}  ${trusted ? '与基线代码一致' : '与所选参考代码一致，但原基线未验证'}`); continue; }
    anyDiff = true;
    const diffs = diffPaths(a, b);
    console.log(`${k}  ${where}起不同`);
    if (!diffs.length) console.log('  哈希不同但逐项比对没发现区别（键的顺序不同？）');
    diffs.forEach((d, i) => console.log(`  ${i === 0 ? '第一处' : '  其后'} ${d.path}：基线 ${brief(d.old)} → 现在 ${brief(d.now)}`));
    const tops = Object.keys(a).concat(Object.keys(b).filter(x => !(x in a))).filter(x => JSON.stringify(a[x]) !== JSON.stringify(b[x]));
    console.log(`  不同的顶层字段：${tops.join('、') || '（无）'}`);
  }
  return referenceUnverified ? 2 : anyDiff ? 1 : 0;
}

// ---------- 入口 ----------
const argv = process.argv.slice(2);
const flag = n => argv.includes(n);
const opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const only = opt('--only')?.split(',').filter(Boolean) || null;

if (flag('--diff')) {
  const [company, scenario] = argv.slice(argv.indexOf('--diff') + 1).filter(x => !x.startsWith('--'));
  if (!company || !scenario) { console.error('用法：--diff <公司> <剧本> [--mode bot|advised] [--ref <git 版本>]'); process.exit(2); }
  const mode = opt('--mode');
  if (mode && !MODES[mode]) { console.error('--mode 只能是 bot 或 advised'); process.exit(2); }
  process.exit(await diffGame(company, scenario, mode ? [mode] : Object.keys(MODES), opt('--ref')));
} else if (flag('--check')) {
  process.exit(await check(only, flag('--reverse')));
} else if (flag('--write')) {
  if (only) { console.error('--write 要跑全量，不能带 --only'); process.exit(2); }
  const w = await loadWorld(ROOT);
  const { games, seconds } = runAll(w, null, flag('--reverse'));
  const bad = Object.entries(games).filter(([, r]) => r.threw || r.errors);
  writeBaseline(games);
  console.log(`已写入 ${path.relative(ROOT, FILE)}：${Object.keys(games).length} 局，${seconds.toFixed(1)} 秒`);
  if (bad.length) console.log(`提醒：${bad.length} 局有抛错或机器人操作失败：${bad.map(([k, r]) => `${k}(${r.threw || `${r.errors} 次操作失败`})`).join('、')}`);
} else {
  console.error('用法：node scripts/fingerprint.mjs --check [--only 公司,…] | --write | --diff <公司> <剧本> [--mode bot|advised] [--ref <git 版本>]');
  process.exit(2);
}
