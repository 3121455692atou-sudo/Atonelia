#!/usr/bin/env node
// 自洽世界校准（F2 M1 行验收 ①、F4a）：从零 {2023, 2024, 2025} × {小作坊, 初创, 大厂} × {3, 6, 12 家}
// 加分岔 {2023, 2024, 2025}，每组 N 个种子；--seeds 8 共 240 个世界。输出 F4a 全表能算的每一行；M2 的行写“M2”。
//   node scripts/selfplay_calibrate.mjs --seeds 8
//   node scripts/selfplay_calibrate.mjs --seeds 2 --only 2024-初创-6
//   node scripts/selfplay_calibrate.mjs --perf       只量 12 家 730 天和分岔 20 家 730 天
// 每个子进程只跑世界，不跑史实局。临时结果默认写到系统临时目录（--out 可改）。
import fs from 'node:fs';
import crypto from 'node:crypto';
import { parseOptions, seedsFrom, positiveInt, sourceIdentity, checkRows, worldKey } from './lib/acceptance.mjs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as E from '../src/career/engine.js';
import { SELF, TIER_LABEL } from '../src/career/data/selfplay.js';
import { SOTA } from '../src/career/data/balance.js';
import { addDays, daysBetween } from '../src/career/sim/clock.js';
import { resolveAll } from '../src/career/sim/bot.js';
import { workingModel, hardness } from '../src/career/sim/model.js';
import { REAL_RELEASES } from '../src/career/world/sim_provider.js';
import { shareTotal } from '../src/career/world/market.js';
import { valuationView } from '../src/career/world/valuation.js';
import { triggerCounts } from '../src/career/world/triggers.js';

const argv = process.argv.slice(2);
const opts = parseOptions(argv,['--seeds','--seed-list','--days','--only','--out','--jobs','--worker'],['--perf','--help']);
if (opts['--help']) { console.log('selfplay_calibrate [--seeds N | --seed-list raw-seeds.json] [--days N] [--only filter] [--out new-dir] [--jobs 1..4] [--perf]'); process.exit(0); }
const RAW_SEEDS = seedsFrom(opts['--seed-list'],opts['--seeds'] || 8);
const SEEDS = RAW_SEEDS.length;
const DAYS = positiveInt(opts['--days'] || 730,'days');
const ONLY = opts['--only'] || null;
const PERF = !!opts['--perf'];
const OUT = opts['--out'] || path.join(os.tmpdir(), 'mrp-selfplay-calib');
const JOBS = Math.min(4,Math.max(1,os.cpus().length-2),positiveInt(opts['--jobs'] || 4,'jobs'));
const WORKER = opts['--worker'] || null;
const EPS = SOTA.EPS + 1e-6;

const r1 = x => (Number.isFinite(x) ? Math.round(x * 10) / 10 : x);
const r2 = x => (Number.isFinite(x) ? Math.round(x * 100) / 100 : x);
const r3 = x => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x);
const med = a => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return b[Math.floor((b.length - 1) / 2)]; };
const pct = (a, p) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * (b.length - 1)))]; };
const monthEnd = day => addDays(day, 1).slice(0, 7) !== day.slice(0, 7);

const NAMES = ['晨星', '北岭', '蓝鲸', '泰拉', '流光', '山巅', '青穹', '远望', '星环', '赤道', '白泽', '风眼'];
const COUNTRIES = ['CN', 'US', 'EU'];
// shift：国家轮换的起点。真人坐第 0 号座位，shift 决定它是哪国公司（0 中国、1 美国、2 欧洲）。
// 原来固定 0，“大按钮真人”永远是中国公司（本土市场小、买卡受管制），0/6 量的是国别而不是顾问（M1e 查明）。
function makeCompanies(n, tier, kind = 'bot', bot = 'normal', shift = 0) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ name: `${NAMES[i]}智能`, brand: NAMES[i], country: COUNTRIES[(i + shift) % 3], tier, kind: i === 0 && kind === 'human' ? 'human' : 'bot', bot });
  return out;
}

function badNumbers(x, at = 'w', seen = new WeakSet(), out = []) {
  if (typeof x === 'number') { if (!Number.isFinite(x)) out.push(at); }
  else if (x && typeof x === 'object') {
    if (seen.has(x)) return out;
    seen.add(x);
    for (const [k, v] of Object.entries(x)) { badNumbers(v, `${at}.${k}`, seen, out); if (out.length >= 3) break; }
  }
  return out;
}

// 前两名公司的 q（学界不算）。
function topTwo(world, day) {
  const bag = new Map();
  for (const m of Object.values(world.relMeta || {})) {
    if (m.org === 'academia' || m.day > day) continue;
    bag.set(m.org, Math.max(bag.get(m.org) ?? -Infinity, m.q));
  }
  const arr = [...bag.values()].sort((a, b) => b - a);
  return [arr[0] ?? -Infinity, arr[1] ?? -Infinity];
}

// 真实前沿（LLM）到某年年底的最强 q。
const REAL_FRONT = {};
for (const y of [2022, 2023, 2024, 2025, 2026]) {
  let q = -Infinity;
  for (const r of REAL_RELEASES) if (r.mod === 'llm' && r.day <= `${y}-12-31`) q = Math.max(q, r.q);
  REAL_FRONT[y] = q;
}

function followAdvice(s) {
  const errors = [];
  resolveAll(s);
  const seen = new Map();
  for (let k = 0; k < 30 && s.status === 'playing'; k++) {
    let a;
    try { [a] = E.advise(s); } catch(e) { errors.push(String(e.stack || e)); break; }
    if (!a) break;
    if (a.kind === 'event') { resolveAll(s); continue; }
    if (a.kind !== 'jobs' && (seen.get(a.id) || 0) >= 3) { errors.push(`原地重复建议 ${a.id}`); break; }
    seen.set(a.id, (seen.get(a.id) || 0) + 1);
    try { E.applyAdvice(s, a); } catch(e) { errors.push(String(e.stack || e)); break; }
    if (a.kind === 'jobs') break;
  }
  return errors;
}

// 跑一个世界。task：{ kind:'zero'|'fork'|'full12'|'advised', year, tier, n, keep, seed, days }
function runTask(task) {
  const { kind, year, seed } = task;
  const days = task.days ?? DAYS;
  const tier = task.tier ?? 'specialist';
  const n = task.n ?? 6;
  const label = kind === 'fork' ? `fork-${year}` : `${year}-${TIER_LABEL[tier] ?? tier}-${n}`;
  let world;
  if (kind === 'fork') world = E.createWorld({ mode: 'fork', start: year, seed, days, keep: task.keep ?? SELF.FORK_KEEP.desktop });
  else world = E.createWorld({ start: year, seed, days, companies: makeCompanies(n, tier, kind === 'zero' ? 'bot' : 'human', 'normal', task.shift ?? 0) });

  const acad0 = world.acad.start;
  const yearBest = {};
  let swaps = 0;
  let lastHolder = world.label.holder?.org ?? null;
  let bestSeen = -Infinity, lastUp = null, stallMax = 0;
  let leaderStreak = 0, leaderMax = 0;
  let violations = { holder: 0, acad: 0, mirror: 0 };
  let mirrorDays = 0;
  let shareDevMax = 0, valResMax = 0, valOver = 0;
  let firstAbove = false;
  let cards = 0, companyMonths = 0;
  const fWorld = [];
  let paused = false;
  let errors = 0;
  const adviceErrors = [];
  let ticks = 0;
  const t0 = performance.now();
  try {
    const human = kind === 'full12' || kind === 'advised' ? Object.values(world.companies).find(c => c.kind === 'human') : null;
    let driveAt = human ? human.s.day : null;
    // 结束日一律不晚于 END（M.2.2）：2025 年开局按 730 天会越过 END，越界以后公司都已停摆，
    // 再数下去只会把“连续不涨”和年均涨幅的分母一起拉长。跑到 END 当天为止。
    for (let i = 0; i < days; i++) {
      if (world.day > world.end) break;
      if (human && human.s.queue.length) resolveAll(human.s);
      if (human && human.s.day >= driveAt) { adviceErrors.push(...followAdvice(human.s)); driveAt = addDays(human.s.day, 7); }
      const res = world.tick();
      if (res.paused) { paused = true; break; }
      ticks += 1;
      const D = res.day;
      const best = E.worldBest(world, D);
      const visible = Math.max(best, E.acadBest(world));
      const h = world.label.holder;
      if (h && !(h.q >= visible - EPS)) violations.holder += 1;
      if (Number.isFinite(best) && best >= world.acad.start + 1 && !(E.acadBest(world) <= best - 1 + 1e-6)) violations.acad += 1;
      // 每家 s.sota 的镜像
      for (const [id, c] of Object.entries(world.companies)) {
        if (!c.s) continue;
        const so = c.s.sota;
        const ok = h ? (so?.holder?.org === h.org && so.holder.q === h.q && so.holder.by === (h.org === id ? 'me' : h.org)) : !so?.holder;
        if (!ok) violations.mirror += 1;
      }
      mirrorDays += 1;
      // 换手、停滞、领先幅度
      const ho = h?.org ?? null;
      if (ho && lastHolder && ho !== lastHolder) swaps += 1;
      lastHolder = ho;
      if (Number.isFinite(best)) {
        if (best > bestSeen + 1e-9) { bestSeen = best; lastUp = D; }
        const stall = lastUp ? daysBetween(lastUp, D) : 0;
        if (stall > stallMax) stallMax = stall;
        yearBest[D.slice(0, 4)] = Math.max(yearBest[D.slice(0, 4)] ?? -Infinity, best);
      }
      const [b1, b2] = topTwo(world, D);
      if (Number.isFinite(b1) && Number.isFinite(b2) && b1 - b2 > 8) { leaderStreak += 1; if (leaderStreak > leaderMax) leaderMax = leaderStreak; }
      else leaderStreak = 0;
      // 月末：份额合计、估值守恒
      if (monthEnd(D)) {
        for (const entry of Object.values(world.market?.table || {})) {
          if (entry.day !== D) continue;
          shareDevMax = Math.max(shareDevMax, Math.abs(shareTotal(entry) - 1));
        }
        const view = valuationView(world, D, { fresh: true });
        let sum = 0;
        for (const row of Object.values(view.rows)) {
          sum += row.V;
          if (!(row.V <= view.pool + row.assets + 1e-6)) valOver += 1;
        }
        const totalAssets = Object.values(view.rows).reduce((a, row) => a + row.assets, 0);
        valResMax = Math.max(valResMax, Math.abs(sum - (view.pool + totalAssets)));
      }
      // 冲顶力：持标者在 |δ|≤1 时
      if (h) {
        const c = world.companies[h.org];
        const w = c?.s ? workingModel(c.s) : null;
        if (w) {
          try {
            const hd = hardness(c.s, w);
            if (Math.abs(hd.delta) <= 1) fWorld.push(hd.F);
          } catch { /* 读不到就跳过 */ }
        }
      }
      // 第一款公司发布高过学界起点
      for (const x of res.fresh || []) {
        if (!firstAbove && x.m.role !== 'small' && x.m.line !== 'side' && x.meta.q > world.acad.start) firstAbove = true;
      }
      // 卡片：当天弹出来的
      for (const c of Object.values(world.companies)) {
        if (c.s?.popup?.day === D) cards += (c.s.popup.cards?.length ?? 0);
      }
    }
  } catch (e) {
    return { label, kind, year, tier, n, seed, error: String(e?.message || e), ms: performance.now() - t0, paused, errors: 1 };
  }
  const ms = performance.now() - t0;
  const lastDay = addDays(world.day, -1);
  const endBest = E.worldBest(world, lastDay);
  const liveCompanies = Object.values(world.companies).filter(c => c.s && !c.frozen);
  companyMonths = liveCompanies.length * (ticks / 30);
  errors = Object.values(world.companies).reduce((a, c) => a + (c.errors?.length || 0), 0) + world.errors.length + adviceErrors.length;
  const bad = badNumbers({ companies: liveCompanies.map(c => c.s), world });
  const triggers = triggerCounts(world);
  const ys = Object.keys(yearBest).sort();
  const annual = ys.map((y, i) => {
    const prev = i ? yearBest[ys[i - 1]] : acad0;
    return { year: y, gain: r1(yearBest[y] - prev), best: r1(yearBest[y]), cap: r1(REAL_FRONT[Number(y)] + 3), lower: yearBest[y] - prev >= 3, upper: yearBest[y] <= REAL_FRONT[Number(y)] + 3 };
  });
  // F4a“进步速度”的下限按规格原文：末尾世界最强比学界起点每年高 ≥ 3 分，也就是整局的年均涨幅（M1e 改口径）。
  // 原来按日历年逐年比，比规格严；2025 年开局的局第二年只到 2026-10，不满一年。逐年涨幅（annual.gain）照旧只报数。
  const spanYears = Math.max(1 / 12, (daysBetween(world.startDay, lastDay) + 1) / 365);
  const pace = Number.isFinite(endBest) ? r1((endBest - acad0) / spanYears) : null;
  // 大按钮真人：身家 = 持股 × 基本面估值
  let humanRank = null;
  if (kind === 'advised' || kind === 'full12') {
    // 身家按 M.5.10：自家持股 × 公司价值（上市取 V，未上市取 V × 0.8）。
    const wealth = liveCompanies.map(c => ({ id: c.id, v: E.finalWealth(world, c.s) })).sort((a, b) => b.v - a.v);
    const me = wealth.findIndex(x => x.id === Object.values(world.companies).find(c => c.kind === 'human')?.id);
    humanRank = me >= 0 ? me + 1 : null;
  }
  return {
    label, kind, year, tier, n, seed, days, completed:!paused && (ticks === days || world.day > world.end), adviceErrors, ticks, ms: r2(ms), paused, errors, bad, swaps, stallMax, leaderMax,
    endBest: Number.isFinite(endBest) ? r1(endBest) : null, acad0: r1(acad0), annual, pace, firstAbove,
    violations, mirrorDays, shareDevMax, valResMax, valOver,
    fMedian: med(fWorld), fCount: fWorld.length,
    cardsPerCompanyMonth: companyMonths > 0 ? r3(cards / companyMonths) : null,
    humanRank, humanCount: liveCompanies.length, triggers, shift: task.shift ?? 0,
    listed: Object.keys(world.exchange?.listings || {}).length,
    traders: liveCompanies.filter(c => Object.keys(c.s.market?.holdings || {}).length || Object.keys(c.s.market?.shorts || {}).length).length,
  };
}

// ---------- 并行 ----------
function runWorker(tasks) {
  for (const t of tasks) {
    const r = runTask(t);
    process.stdout.write(`@@RESULT@@${JSON.stringify(r)}\n`);
  }
}

function spawnChunks(tasks) {
  const chunks = Array.from({ length: Math.min(JOBS, tasks.length) }, () => []);
  tasks.forEach((t, i) => chunks[i % chunks.length].push(t));
  return Promise.allSettled(chunks.map(chunk => new Promise((resolve,reject) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker', JSON.stringify(chunk)], { stdio: ['ignore', 'pipe', 'pipe'] });
    const spool = path.join(OUT,`worker-${crypto.randomUUID()}.jsonl`);
    const timeout = setTimeout(() => { child.kill('SIGTERM'); setTimeout(()=>child.kill('SIGKILL'),1000).unref(); },Math.max(60000,chunk.length * 60000));
    let buf = '';
    const rows = [];
    child.stdout.on('data', d => {
      buf += d;
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) if (line.startsWith('@@RESULT@@')) { try { const row=JSON.parse(line.slice(10)); rows.push(row); fs.appendFileSync(spool,JSON.stringify(row)+'\n'); } catch(e) { child.kill(); reject(e); } }
    });
    child.stderr.on('data', d => process.stderr.write(d));
    child.on('error', e => { clearTimeout(timeout); reject(e); });
    child.on('close', (code,signal) => { clearTimeout(timeout); return code === 0 && !signal && rows.length === chunk.length ? resolve(rows) : reject(new Error(`worker 失败 code=${code} signal=${signal} rows=${rows.length}/${chunk.length}; 已留存 ${spool}`)); });
  }))).then(results => results.map(x => x.status === 'fulfilled' ? x.value : [{ error:String(x.reason),completed:false,errors:1 }]));
}

// ---------- 汇总 ----------
function summarize(rows, extra) {
  const zero = rows.filter(r => r.kind === 'zero');
  const all = rows;
  const sumViol = all.reduce((a, r) => a + (r.violations?.holder || 0) + (r.violations?.acad || 0) + (r.violations?.mirror || 0), 0);
  const shareDev = Math.max(0, ...all.map(r => r.shareDevMax || 0));
  const valRes = Math.max(0, ...all.map(r => r.valResMax || 0));
  const valOver = all.reduce((a, r) => a + (r.valOver || 0), 0);
  const fMed = all.map(r => r.fMedian).filter(x => Number.isFinite(x));
  const stalls = all.map(r => r.stallMax);
  const groups = [...new Set(all.map(r => r.label))];
  const groupStalls = groups.map(g => ({ g, med: med(all.filter(r => r.label === g).map(r => r.stallMax)), max: Math.max(...all.filter(r => r.label === g).map(r => r.stallMax)) }));
  const zeroSwap = all.filter(r => r.swaps === 0).length;
  const lead180 = all.filter(r => r.leaderMax >= 180).length;
  const annual = all.flatMap(r => r.annual || []);
  const annualUpper = annual.filter(x => x.upper).length;
  const paced = all.filter(r => r.pace !== null && r.pace !== undefined);
  const paceOk = paced.filter(r => r.pace >= 3).length;
  const paceLow = paced.filter(r => r.pace < 3).map(r => `${r.label}#${r.seed}:${r.pace}`);
  const cards = all.map(r => r.cardsPerCompanyMonth).filter(x => Number.isFinite(x));
  const adv = (extra || []).filter(r => r.kind === 'advised');
  const advTop = adv.filter(r => r.humanRank && r.humanRank <= Math.ceil(r.humanCount / 2)).length;
  const full = (extra || []).filter(r => r.kind === 'full12');
  const pairs = full.map(r => {
    const six = zero.find(z => z.year === r.year && z.seed === r.seed && z.n === 6 && z.tier === 'specialist');
    return six ? { year: r.year, seed: r.seed, full: r.endBest, six: six.endBest, diff: r1(r.endBest - six.endBest) } : null;
  }).filter(Boolean);
  const pairsOk = pairs.filter(p => p.full >= p.six - 3).length;
  const trig = {};
  for (const r of all) for (const [k, v] of Object.entries(r.triggers || {})) trig[k] = (trig[k] || 0) + v;
  const perf12 = all.filter(r => r.kind === 'zero' && r.n === 12).map(r => r.ms).filter(Number.isFinite);

  const rowsOut = [
    ['持标那款 ≥ 世界可见最强 − EPS', '每天成立', sumViol === 0 ? `违反 ${sumViol} 天` : `违反 ${sumViol} 天`, sumViol === 0],
    ['学界最强 ≤ 公司已发最强 − 1（公司超过学界以后）', '每天成立', `${all.reduce((a, r) => a + (r.violations?.acad || 0), 0)} 天违反`, all.reduce((a, r) => a + (r.violations?.acad || 0), 0) === 0],
    ['各家 s.sota 等于 projectSota', '每天成立', `${all.reduce((a, r) => a + (r.violations?.mirror || 0), 0)} 天不一致`, all.reduce((a, r) => a + (r.violations?.mirror || 0), 0) === 0],
    ['月度份额（各家、学界、不用 AI）合计', '100% ± 0.01%', `最大偏差 ${(shareDev * 100).toFixed(4)}%`, shareDev <= 1e-4],
    ['估值：每家 V ≤ 池 + 资产；合计 = 池 + Σ资产', '守恒', `最大残差 ${r2(valRes)}，超界 ${valOver} 次`, valRes <= 1 && valOver === 0],
    ['冲顶力 F（持标者、|δ|≤1）', '中位 ≥ 0.3，90% 局 ≥ 0.2', `中位 ${r2(med(fMed))}，p10 ${r2(pct(fMed, 0.1))}，${fMed.length} 个局有样本`, med(fMed) >= 0.3 && pct(fMed, 0.1) >= 0.2],
    ['世界最强连续不涨', '每组中位 ≤ 240 天，单局 ≤ 300', `中位 ${med(stalls)}，最长 ${Math.max(...stalls)}；最差组 ${groupStalls.sort((a, b) => b.med - a.med)[0]?.g} 中位 ${groupStalls[0]?.med}`, groupStalls.every(x => x.med <= 240) && Math.max(...stalls) <= 300],
    ['SOTA 换手 0 次的局', '≤ 25%', `${zeroSwap}/${all.length}（${r1(100 * zeroSwap / all.length)}%）`, zeroSwap / all.length <= 0.25],
    ['领先第二名 > 8 分持续 ≥ 180 天的局', '0', `${lead180} 局`, lead180 === 0],
    ['进步速度（末尾最强比学界起点每年高 ≥3；每年年末 ≤ 同期真实前沿+3）', '全部成立', `下限 ${paceOk}/${paced.length}${paceLow.length ? `（不够：${paceLow.slice(0, 4).join('、')}）` : ''}，上限 ${annualUpper}/${annual.length}`, paceOk === paced.length && annualUpper === annual.length],
    ['第一款公司发布高过学界起点', '每局成立', `${all.filter(r => r.firstAbove).length}/${all.length}`, all.every(r => r.firstAbove)],
    ['电脑占满（1 真人 + 11 电脑）对同种子 6 家', '12 家 ≥ 6 家 − 3', `${pairsOk}/${pairs.length} 对达标（${pairs.map(p => `${p.year}#${p.seed}:${p.full}/${p.six}`).join('，') || '无样本'}）`, pairs.length > 0 && pairsOk === pairs.length],
    ['大按钮真人进前一半（对普通电脑）', '50%–80%', `${advTop}/${adv.length}（${adv.length ? r1(100 * advTop / adv.length) : 0}%）；分国家 ${['中国', '美国', '欧洲'].map((c, k) => { const g = adv.filter(r => (r.shift ?? 0) === k); return `${c} ${g.filter(r => r.humanRank && r.humanRank <= Math.ceil(r.humanCount / 2)).length}/${g.length}`; }).join('、')}`, adv.length > 0 && advTop / adv.length >= 0.5 && advTop / adv.length <= 0.8],
    ['每家每个游戏月要处理的卡片', '≤ 1.5', `中位 ${r2(med(cards))}，最大 ${r2(Math.max(...cards))}`, Math.max(...cards) <= 1.5],
    ['性能：12 家 730 天（空载）', '≤ 10 秒', perf12.length ? `并行负载下最长 ${r2(Math.max(...perf12) / 1000)} 秒；空载用 --perf 量` : '本组没有 12 家局', null],
    ['性能：分岔 20 家 730 天', '≤ 15 秒', extra?.perfFork20 != null ? `${r2(extra.perfFork20 / 1000)} 秒` : '见 --perf', extra?.perfFork20 != null ? extra.perfFork20 <= 15000 : null],
    ['行业大事：开源冲击', '只报数（M1b-2 报告偏多）', `${trig.openshock || 0} 次 / ${all.length} 局`, null],
    ['行业大事：版权官司', '只报数（M1b-2 报告偏多）', `${trig.copyright || 0} 次 / ${all.length} 局`, null],
    ['行业大事：价格战 / 出口管制 / 反垄断', '只报数', `${trig.pricewar || 0} / ${trig.export || 0} / ${trig.antitrust || 0} 次`, null],
    ['被污染模型 q ≤ min(老师, worldSota) − APPROACH', 'M2', 'M2', null],
    ['同一款模型在所有人榜单上的分', 'M2', '按发布行打分（本步未单列）', null],
    ['公开与藏私（机制用例）', 'M2', 'M2', null],
    ['困难电脑被查出 API 蒸馏', '每局 0.5–1.5 次', 'M2b 校准：默认 6 家全困难电脑、16 个种子，每局 1.00 次（DISTILL_WATCH.BASE 0.005）；机制见 tests/world/distill_watch.test.mjs', null],
    ['股市：上市家数、电脑交易', '只报数', `每局上市中位 ${med(all.map(r => r.listed ?? 0))} 家，最多 ${Math.max(0, ...all.map(r => r.listed ?? 0))} 家；有持仓或空单的公司中位 ${med(all.map(r => r.traders ?? 0))} 家`, null],
    ['股市：拉高出货必亏、最后 45 天抬价合计不增、轧空 ≤ 1.4 倍、现金来回 < 1%、小号送钱 ≤ 10% / ≤ 30%', '机制用例', '见 tests/world/exchange.test.mjs（M2a）', null],
    ['只买卡出租、不练模型', '两年后身家排不进前一半', '见 tests/world/alt_account.test.mjs 与 scripts/alt_account.mjs（4 个种子都是 6/6 名）', null],
  ];
  return { rowsOut, groups: groupStalls, trig, fMed, stallMed: med(stalls), annual };
}

function fmtCell(v) { return v === null ? '—' : String(v); }
function toMarkdown(rows, meta) {
  const lines = [`# 自洽世界校准（${meta.seeds} 个种子，${meta.days} 天/局）`, '', `世界数：${meta.count}；抛错 ${meta.throws}；卡死 ${meta.paused}；非有限数 ${meta.bad}；报错 ${meta.errors}`, '', '| 指标 | 目标 | 本次 | 达标 |', '|---|---|---|---|'];
  for (const [a, b, c, ok] of rows) lines.push(`| ${a} | ${b} | ${fmtCell(c)} | ${ok === null ? 'UNVERIFIED' : ok ? 'PASS' : 'FAIL'} |`);
  return lines.join('\n') + '\n';
}

// ---------- 主入口 ----------
if (WORKER) {
  runWorker(JSON.parse(WORKER));
} else if (PERF) {
  const runOne = (label, fn) => {
    const t0 = performance.now();
    const w = fn();
    let ticks=0, paused=false;
    for (let i = 0; i < DAYS; i++) { const r = w.tick(); if (r.paused) { paused=true; break; } ticks++; }
    const ms = performance.now() - t0;
    const errors = Object.values(w.companies).reduce((a, c) => a + (c.errors?.length || 0), 0) + w.errors.length;
    console.log(`${label}：${r2(ms / 1000)} 秒（${Math.round(ms)} ms），报错 ${errors}`);
    return {ms,errors,completed:!paused && ticks===DAYS};
  };
  const a = runOne('12 家 730 天', () => E.createWorld({ start: 2024, seed: 11, days: DAYS, companies: makeCompanies(12, 'specialist') }));
  const b = runOne('分岔 20 家 730 天', () => E.createWorld({ mode: 'fork', start: 2024, seed: 11, days: DAYS, keep: 20 }));
  process.exitCode = !a.completed || !b.completed || a.errors || b.errors || a.ms > 10000 || b.ms > 15000 ? 1 : DAYS===730 ? 0 : 2;
} else {
  const tasks = [];
  for (const year of [2023, 2024, 2025]) for (const tier of SELF.TIERS) for (const n of [3, 6, 12]) {
    const label = `${year}-${TIER_LABEL[tier]}-${n}`;
    if (ONLY && !label.includes(ONLY)) continue;
    for (const seed of RAW_SEEDS) tasks.push({ kind: 'zero', year, tier, n, seed, days: DAYS });
  }
  for (const year of [2023, 2024, 2025]) {
    const label = `fork-${year}`;
    if (ONLY && !label.includes(ONLY)) continue;
    for (const seed of RAW_SEEDS) tasks.push({ kind: 'fork', year, seed, days: DAYS, keep: SELF.FORK_KEEP.desktop });
  }
  // 额外的对照局（不进 240 的主矩阵）：电脑占满 12 家、1 真人 + 5 电脑。
  const extraTasks = [];
  if (!ONLY) for (const year of [2023, 2024, 2025]) for (const seed of (opts['--seed-list'] ? RAW_SEEDS : RAW_SEEDS.slice(0,2))) {
    extraTasks.push({ kind: 'full12', year, tier: 'specialist', n: 12, seed, days: DAYS });
    // 大按钮真人三个国家各跑一遍（中国、美国、欧洲），F4a 的“进前一半”按全部算，另外分国家报数。
    for (const shift of [0, 1, 2]) extraTasks.push({ kind: 'advised', year, tier: 'specialist', n: 6, seed, days: DAYS, shift });
  }

  if (!tasks.length) throw new Error('主矩阵为空');
  if (fs.existsSync(OUT) && fs.readdirSync(OUT).length) throw new Error('输出目录非空，拒绝混入旧数据');
  fs.mkdirSync(OUT,{ recursive:true });
  const identity = sourceIdentity(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
  const manifest = { version:1, runId:crypto.randomUUID(), ...identity, node:process.version, seeds:RAW_SEEDS, tasks, extraTasks, expectedKeys:[...tasks,...extraTasks].map(worldKey) };
  fs.writeFileSync(path.join(OUT,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const t0 = performance.now();
  // 两个矩阵串行启动，保证总并发不超过 JOBS。
  const mainChunks = await spawnChunks(tasks);
  const extraChunks = await spawnChunks(extraTasks);
  const mainRows = mainChunks.flat();
  const extraRows = extraChunks.flat();
  const total = performance.now() - t0;
  extraRows.perfFork20 = null;
  const all = [...mainRows, ...extraRows];
  for (const r of all) Object.assign(r,identity,{runId:manifest.runId});
  const integrity = checkRows(all,manifest,worldKey,['errors','ticks']);
  if (sourceIdentity(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')).sourceSha256 !== identity.sourceSha256) integrity.push('运行期间源码变化');
  const summary = summarize(mainRows, extraRows);
  const meta = {
    seeds: SEEDS, days: DAYS, count: mainRows.length,
    throws: all.filter(r => r.error).length, paused: all.filter(r => r.paused).length,
    bad: all.reduce((a, r) => a + (r.bad?.length || 0), 0),
    errors: all.reduce((a, r) => a + (r.errors || 0), 0),
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'detail.jsonl'), all.map(r => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'summary.md'), toMarkdown(summary.rowsOut, meta));
  const coverageComplete = !ONLY && DAYS === 730 && !integrity.length;
  const verdicts = summary.rowsOut.map(([metric,threshold,observed,ok])=>({metric,threshold,observed,status:ok===null || (ok && !coverageComplete)?'UNVERIFIED':ok?'PASS':'FAIL'}));
  const controlViolations = extraRows.reduce((n,r)=>n+Object.values(r.violations || {}).reduce((a,b)=>a+b,0),0);
  verdicts.push({metric:'control.invariants',numerator:controlViolations,denominator:extraRows.length,status:!extraRows.length?'UNVERIFIED':controlViolations?'FAIL':'PASS'});
  const status = integrity.length || meta.throws || meta.paused || meta.bad || meta.errors || verdicts.some(x=>x.status==='FAIL') ? 'FAIL' : 'UNVERIFIED';
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ status, integrity, verdicts, meta, rows: summary.rowsOut, triggers: summary.trig, groups: summary.groups }, null, 2));
  console.log(toMarkdown(summary.rowsOut, meta));
  console.log(`总耗时 ${r2(total / 1000)} 秒；结果写到 ${OUT}`);
  for (const r of all.filter(r => r.error || r.bad?.length || r.paused)) console.log(`  问题局 ${r.label}#${r.seed}：${r.error || r.bad?.join(',') || '卡死'}`);
  process.exitCode = status === 'FAIL' ? 1 : 2;
}
