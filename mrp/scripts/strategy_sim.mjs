#!/usr/bin/env node
// 公司策略的史实模拟（规格 F3，给 P3.D、P3.T-*、P3.1 的内容包自查用）：用机器人（按史实挑策略，A10 的 historic 模式）把一家公司玩几局，打印
//   每个节点的完成日期和史实日期的对照、授名日期（用了没有、作废没有）、空闲天数、路线时间线。
//
// 用法（仓库根目录）：
//   node scripts/strategy_sim.mjs --only deepseek --sc y2025 --seeds 5
//   --only <公司 id>（必填）  --sc <剧本，逗号分隔；不写跑四个剧本>  --seeds <种子个数，默认 5，种子 1..N>  --days <只跑开局后多少天，不写跑完整局>
import * as E from '../src/career/engine.js';
import { COMPANY_BY_ID, SCENARIOS } from '../src/career/data/core.js';
import { STANCE } from '../src/career/data/routes.js';
import { companyFile, COMPANY_FILES } from '../src/career/data/companies/index.js';
import { playGame } from '../src/career/sim/bot.js';
import { resolvedTree, histDay } from '../src/career/sim/strategy.js';
import { daysBetween, addDays } from '../src/career/sim/clock.js';

const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const company = arg('--only');
if (!company || !COMPANY_BY_ID[company]) {
  console.error(`用法：node scripts/strategy_sim.mjs --only <公司 id> [--sc y2025] [--seeds 5] [--days 365]\n公司 id：${Object.keys(COMPANY_BY_ID).join('、')}`);
  process.exit(2);
}
const scs = (arg('--sc') || SCENARIOS.map(x => x.id).join(',')).split(',').filter(Boolean);
for (const sc of scs) if (!SCENARIOS.some(x => x.id === sc)) { console.error(`没有这个剧本：${sc}`); process.exit(2); }
const seeds = Math.max(1, Number(arg('--seeds', '5')) || 5);
const maxDays = arg('--days') ? Number(arg('--days')) : null;

const pad = (s, n) => { s = String(s); let w = 0; for (const ch of s) w += /[⺀-￿]/.test(ch) ? 2 : 1; return s + ' '.repeat(Math.max(1, n - w)); };
const cut = (s, n) => { let w = 0, out = ''; for (const ch of String(s)) { w += /[⺀-￿]/.test(ch) ? 2 : 1; if (w > n) return `${out}…`; out += ch; } return out; };
const sign = d => (d > 0 ? `+${d}` : `${d}`);

// 空闲天数：按策略日志算（开始以前、上一项做完或作废以后、放下以后都算空闲）。日志最多 80 条，满了的局可能偏少。
function idleDays(s) {
  let idle = 0, from = null, cur = null;
  const start = `${s.start}-01`;
  const log = s.strategy.log;
  if (!log.length || log[0].day > start) from = start;
  for (const x of log) {
    if (x.kind === 'start') { if (from) idle += Math.max(0, daysBetween(from, x.day)); from = null; cur = x.id; }
    else if ((x.kind === 'done' || x.kind === 'void' || x.kind === 'bypass') && x.id === cur) { from = x.day; cur = null; }
    else if (x.kind === 'shelve' && x.id === cur) { from = x.day; cur = null; }
  }
  if (from) idle += Math.max(0, daysBetween(from, s.day));
  return { idle, truncated: log.length >= 80 };
}

function runOne(sc, seed) {
  const route = [];
  let last = null;
  const startDay = `${SCENARIOS.find(x => x.id === sc).start}-01`;
  const stopAt = maxDays ? addDays(startDay, maxDays) : null;
  const note = s => {
    const r = s.route;
    const key = `${r?.stance}|${r?.since}`;
    if (key !== last) { route.push({ stance: r?.stance, license: r?.license, since: r?.since, by: r?.by }); last = key; }
  };
  // --days：到点把状态设成 stopped，playGame 就不再往下跑；跑完改回 playing，结局行写“停在某天”。
  // 最后补记一次路线只用 note（不再走到点判断），否则状态又被设回 stopped，结局行就空了。
  const onWeek = s => { note(s); if (stopAt && s.day >= stopAt) s.status = 'stopped'; };
  const { s, errors } = playGame(company, sc, seed, { onWeek });
  note(s);
  if (s.status === 'stopped') s.status = 'playing';
  return { s, errors, route };
}

const file = COMPANY_FILES[company];
const fileNote = file ? '本家文件' : `本家文件还是存根，用 ${companyFile(company)?.tree?.id ?? '主干'}`;
for (const sc of scs) {
  const runs = Array.from({ length: seeds }, (_, i) => runOne(sc, i + 1));
  const s0 = runs[0].s;
  const t = resolvedTree(s0);
  console.log(`\n== ${COMPANY_BY_ID[company].company}（${company}）· ${sc} · 种子 1–${seeds} · 树 ${t.id}（${fileNote}，${t.nodes.length} 个节点）${maxDays ? ` · 只跑开局后 ${maxDays} 天` : ''}`);
  for (const [i, r] of runs.entries()) if (r.errors.length) console.log(`  种子 ${i + 1} 有 ${r.errors.length} 次操作失败：${r.errors.slice(0, 3).join('；')}`);
  // 节点完成日期与史实对照。
  console.log('\n节点完成（“开局前”是播种预完成；括号里是比史实早几天（−）或晚几天（+）；空着是没做）');
  console.log(`  ${pad('节点', 34)}${pad('史实', 12)}${runs.map((_, i) => pad(`种子${i + 1}`, 18)).join('')}`);
  const shown = t.nodes.filter(n => runs.some(r => r.s.strategy.done[n.id]) || histDay(n));
  for (const n of shown) {
    const hd = histDay(n);
    const cells = runs.map(r => {
      const d = r.s.strategy.done[n.id];
      if (!d) return E.nodeStatus(r.s, n.id).state === 'excluded' ? '（互斥排除）' : E.nodeStatus(r.s, n.id).state === 'blocked' ? '（做不成了）' : '';
      if (d.how === 'start') return '开局前';
      const tag = d.how === 'bypass' ? '绕过 ' : '';
      return `${tag}${d.day}${hd ? `(${sign(daysBetween(hd, d.day))})` : ''}`;
    });
    console.log(`  ${pad(cut(`${n.id} ${n.title}`, 32), 34)}${pad(n.hist?.date ?? (n.fiction ? '架空' : '—'), 12)}${cells.map(c => pad(c, 18)).join('')}`);
  }
  // 授名。
  const names = companyFile(company)?.names || [];
  const rightIds = [...new Set(runs.flatMap(r => Object.keys(r.s.strategy.rights)))];
  console.log('\n授名（拿到授权的日子；用了、作废了另外注明）');
  if (!rightIds.length) console.log('  （没有拿到过授名）');
  for (const hn of rightIds) {
    const def = names.find(x => x.id === hn);
    const cells = runs.map(r => {
      const x = r.s.strategy.rights[hn];
      if (!x) return '';
      return `${x.day}${x.used ? ' 用了' : x.void ? ' 作废' : ''}`;
    });
    console.log(`  ${pad(cut(`${hn} ${def?.name ?? ''}`, 32), 34)}${pad(def?.real ?? '', 12)}${cells.map(c => pad(c, 18)).join('')}`);
  }
  // 空闲天数。
  console.log('\n空闲天数（没有进行中的策略）');
  console.log(`  ${runs.map((r, i) => { const x = idleDays(r.s); return `种子${i + 1} ${x.idle} 天${x.truncated ? '（日志满了，可能偏少）' : ''}`; }).join('  ')}`);
  // 路线时间线。
  console.log('\n路线');
  for (const [i, r] of runs.entries()) {
    const line = r.route.map(x => `${STANCE[x.stance]?.label ?? x.stance}${x.stance === 'delayed' && x.license ? `（${x.license === 'permissive' ? '宽松' : '受限'}）` : ''}${x.by === 'start' ? '（开局）' : x.by === 'migration' ? '（读档）' : ` ${x.since}（${x.by}）`}`).join(' → ');
    console.log(`  种子${i + 1}：${line}`);
  }
  // 结局。
  console.log(`\n结局：${runs.map((r, i) => `种子${i + 1} ${r.s.status === 'playing' ? `停在 ${r.s.day}` : `${r.s.result?.rank ?? ''} ${r.s.result?.reason ?? ''}`}`).join('  ')}`);
}
