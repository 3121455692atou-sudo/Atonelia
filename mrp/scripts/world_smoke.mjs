#!/usr/bin/env node
// 自洽世界冒烟（M1a）：从零 {2023, 2024, 2025} × {小作坊, 初创, 大厂} × {3, 6, 12 家}，每种 2 个种子，各跑 730 天。
// 打印每局一行：换手次数、最长停滞天数、每年涨幅、末尾世界最强、行业大事触发次数、报错数；最后打印汇总和总耗时。
//   node scripts/world_smoke.mjs [--seeds 2] [--days 730] [--only 2024-初创-6]
//   node scripts/world_smoke.mjs --perf         只跑 12 家 730 天，量性能
import * as E from '../src/career/engine.js';
import { SELF, TIER_LABEL } from '../src/career/data/selfplay.js';
import { addDays, daysBetween } from '../src/career/sim/clock.js';
import { triggerCounts } from '../src/career/world/triggers.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SEEDS = Math.max(1, Number(arg('--seeds', 2)));
const DAYS = Math.max(1, Number(arg('--days', 730)));
const ONLY = arg('--only', null);
const PERF = argv.includes('--perf');
const r1 = x => Math.round(x * 10) / 10;
const r2 = x => Math.round(x * 100) / 100;
const med = a => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return b[Math.floor((b.length - 1) / 2)]; };
const pct = (a, p) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * (b.length - 1)))]; };

const NAMES = ['晨星', '北岭', '蓝鲸', '泰拉', '流光', '山巅', '青穹', '远望', '星环', '赤道', '白泽', '风眼'];
const COUNTRIES = ['CN', 'US', 'EU'];
function makeCompanies(n, tier) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ name: `${NAMES[i]}智能`, brand: NAMES[i], country: COUNTRIES[i % 3], tier, kind: 'bot' });
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

function runOne(year, tier, n, seed) {
  const start = `${year}-01`;
  const world = E.createWorld({ seed, start, days: DAYS, companies: makeCompanies(n, tier) });
  const acad0 = world.acad.start;
  let swaps = 0, lastHolder = world.label.holder?.org ?? null;
  let bestSeen = -Infinity, lastUp = null, stallMax = 0, stallFrom = null;
  const yearBest = {};
  let paused = false;
  const t0 = performance.now();
  try {
    for (let i = 0; i < DAYS; i++) {
      const D = world.day;
      const res = E.tick(world);
      if (res.paused) { paused = true; break; }
      const h = world.label.holder?.org ?? null;
      if (h && lastHolder && h !== lastHolder) swaps += 1;
      lastHolder = h;
      const best = E.worldBest(world, D);
      if (Number.isFinite(best)) {
        if (best > bestSeen + 1e-9) { bestSeen = best; lastUp = D; }
        const stall = lastUp ? daysBetween(lastUp, D) : 0;
        if (stall > stallMax) { stallMax = stall; stallFrom = lastUp; }
        const y = D.slice(0, 4);
        yearBest[y] = Math.max(yearBest[y] ?? -Infinity, best);
      }
    }
  } catch (e) {
    return { year, tier, n, seed, error: String(e?.message || e), swaps, stallMax, annual: [], endBest: null, errors: 1, bad: [], ms: performance.now() - t0, paused };
  }
  const ms = performance.now() - t0;
  const lastDay = addDays(world.day, -1);
  const endBest = E.worldBest(world, lastDay);
  const ys = Object.keys(yearBest).sort();
  const annual = ys.map((y, i) => {
    const prev = i ? yearBest[ys[i - 1]] : acad0;
    return r1(yearBest[y] - prev);
  });
  const errors = Object.values(world.companies).reduce((a, c) => a + c.errors.length, 0) + world.errors.length;
  const bad = badNumbers({ companies: Object.values(world.companies).map(c => c.s), world });
  const triggers = triggerCounts(world);
  return { year, tier, n, seed, swaps, stallMax, stallFrom, annual, endBest: Number.isFinite(endBest) ? r1(endBest) : null, acad0: r1(acad0), errors, bad, ms, paused, holder: world.label.holder, triggers };
}

const TRIGGER_LABEL = { pricewar: '价格战', openshock: '开源冲击', export: '出口管制', antitrust: '反垄断', copyright: '版权官司' };
const fmtTriggers = t => Object.entries(t || {}).filter(([, n]) => n > 0).map(([k, n]) => `${TRIGGER_LABEL[k] || k}${n}`).join('/') || '无';

const combos = [];
for (const y of [2023, 2024, 2025]) for (const tier of SELF.TIERS) for (const n of [3, 6, 12]) {
  const label = `${y}-${TIER_LABEL[tier]}-${n}`;
  if (ONLY && !label.includes(ONLY)) continue;
  combos.push({ year: y, tier, n, label });
}

if (PERF) {
  const t0 = performance.now();
  const r = runOne(2024, 'specialist', 12, 11);
  const ms = performance.now() - t0;
  console.log(`性能：12 家 730 天 ${r2(ms / 1000)} 秒（${Math.round(ms)} ms，${r2(ms / DAYS)} ms/天），报错 ${r.errors}`);
  process.exit(r.errors || r.paused ? 1 : 0);
}

const rows = [];
const t0 = performance.now();
for (const c of combos) {
  for (let s = 1; s <= SEEDS; s++) {
    const r = runOne(c.year, c.tier, c.n, s);
    rows.push({ ...r, label: c.label });
    const yearly = r.annual?.length ? `每年+${r.annual.join('/+')}` : '每年—';
    console.log(`${c.label} seed=${s} 换手=${r.swaps} 停滞=${r.stallMax}天 ${yearly} 末尾=${r.endBest ?? '—'} 大事=${fmtTriggers(r.triggers)} 报错=${r.errors + (r.bad?.length ? ` 非有限数${r.bad.length}` : '')}${r.paused ? ' 卡死' : ''}${r.error ? ` 抛错:${r.error}` : ''} 用时=${r2(r.ms / 1000)}s`);
  }
}
const total = performance.now() - t0;

const totalErrors = rows.reduce((a, r) => a + r.errors + (r.bad?.length || 0) + (r.error ? 1 : 0), 0);
const totalThrows = rows.filter(r => r.error).length;
const totalPaused = rows.filter(r => r.paused).length;
const swaps = rows.map(r => r.swaps);
const stalls = rows.map(r => r.stallMax);
const zeroSwap = rows.filter(r => r.swaps === 0).length;
const annual = rows.flatMap(r => r.annual || []);
const groups = [...new Set(rows.map(r => r.label))];

console.log(`\n=== 汇总：${rows.length} 局（${combos.length} 种组合 × ${SEEDS} 个种子），${DAYS} 天，总耗时 ${r2(total / 1000)} 秒`);
console.log(`抛错 ${totalThrows} 局；卡死 ${totalPaused} 局；报错 ${totalErrors} 次；非有限数 ${rows.reduce((a, r) => a + (r.bad?.length || 0), 0)} 处`);
console.log(`换手：合计 ${swaps.reduce((a, b) => a + b, 0)} 次，中位 ${med(swaps)}，最多 ${Math.max(...swaps)}；换手 0 次的局 ${zeroSwap}/${rows.length}（${r1(100 * zeroSwap / rows.length)}%，F4a 目标 ≤ 25%）`);
console.log(`世界最强连续不涨：中位 ${med(stalls)} 天（F4a 目标每组中位 ≤ 240），最长 ${Math.max(...stalls)} 天（目标单局 ≤ 300），p90 ${pct(stalls, 0.9)}`);
console.log(`进步速度（每年涨幅，分年）：${annual.length ? `中位 ${med(annual)}，最少 ${Math.min(...annual)}，最多 ${Math.max(...annual)}` : '还没有跨年发布'}（F4a 目标 ≥ 3 分/年；只报数，M1 最后统一校准）`);
for (const g of groups) {
  const rs = rows.filter(r => r.label === g);
  console.log(`  ${g}：换手中位 ${med(rs.map(r => r.swaps))}，停滞中位 ${med(rs.map(r => r.stallMax))}，最长 ${Math.max(...rs.map(r => r.stallMax))}，末尾最强 ${rs.map(r => r.endBest ?? '—').join('/')}，每年 ${rs.flatMap(r => r.annual || []).join('/')}`);
}
// 每局各种大事触发了几次（M.3.9）。
const TRIGGER_KINDS = ['pricewar', 'openshock', 'export', 'antitrust', 'copyright'];
const trigTotal = Object.fromEntries(TRIGGER_KINDS.map(k => [k, 0]));
for (const r of rows) for (const k of TRIGGER_KINDS) trigTotal[k] += r.triggers?.[k] || 0;
console.log(`行业大事：${TRIGGER_KINDS.map(k => `${TRIGGER_LABEL[k] || k} ${trigTotal[k]} 次`).join('，')}`);
for (const r of rows) console.log(`  ${r.label} seed=${r.seed}：${fmtTriggers(r.triggers)}`);
console.log(`性能：12 家 730 天见 --perf；本机本次全部 ${rows.length} 局共 ${r2(total / 1000)} 秒。`);
process.exitCode = totalErrors || totalPaused ? 1 : 0;
