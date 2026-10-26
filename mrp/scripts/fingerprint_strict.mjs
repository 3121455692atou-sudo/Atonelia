#!/usr/bin/env node
// 与旧指纹并存：不覆盖旧基线；完整状态和所有检查点单独落盘。
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseOptions, sha256, sourceIdentity, finiteProblems, compareStrictReports } from './lib/acceptance.mjs';
const opts = parseOptions(process.argv.slice(2), ['--repo','--out','--compare','--only','--seed'], ['--reverse','--help']);
if (opts['--help']) { console.log('fingerprint_strict --repo ROOT --out NEW.json [--only qwen,deepseek,rwkv,midjourney --seed 7919] [--reverse] [--compare baseline.json]'); process.exit(0); }
const repo = path.resolve(opts['--repo'] || new URL('..',import.meta.url).pathname);
if (!opts['--out']) throw new Error('必须指定新的 --out；不修改旧指纹');
const seed = Number(opts['--seed'] || 1);
if (!Number.isSafeInteger(seed) || seed < 1 || seed > 0xffffffff) throw new Error('无效 seed');
const load = p => import(pathToFileURL(path.join(repo,p)));
const bot = await load('src/career/sim/bot.js');
const { COMPANIES, SCENARIOS } = await load('src/career/data/core.js');
const { daysBetween } = await load('src/career/sim/clock.js');
const only = opts['--only']?.split(',');
if (only && (new Set(only).size !== only.length || only.some(id => !COMPANIES.some(c => c.id === id)))) throw new Error('无效公司');
const keys = [];
for (const c of COMPANIES) for (const sc of SCENARIOS) for (const mode of ['bot','advised']) if (!only || only.includes(c.id)) keys.push([c.id,sc.id,mode]);
if (opts['--reverse']) keys.reverse();
const report = { version:1, ...sourceIdentity(repo), node:process.version, seed, checkpointDays:90, games:{}, problems:[] };
for (const [c,sc,mode] of keys) {
  const key = `${c}/${sc}/${mode}`, cp = []; let next = 90;
  try {
    const { s,errors } = bot[mode === 'bot' ? 'playGame' : 'playAdvised'](c,sc,seed,{ onWeek(state) {
      const d = daysBetween(`${state.start}-01`,state.day);
      if (d >= next) { const full = JSON.stringify(state); cp.push({ day:state.day, sha256:sha256(full), state:JSON.parse(full) }); next = (Math.floor(d / 90) + 1) * 90; }
    } });
    const full = JSON.stringify(s);
    report.games[key] = { sha256:sha256(full), cp, state:JSON.parse(full), day:s.day, status:s.status, errors };
    if (!s.result || s.status === 'playing' || errors.length || finiteProblems(s).length) report.problems.push(`${key}: 未结算/错误/非有限数`);
  } catch (e) { report.games[key] = { error:String(e.stack),cp }; report.problems.push(`${key}: 抛错`); }
}
if (opts['--compare']) {
  const base = JSON.parse(fs.readFileSync(opts['--compare'],'utf8'));
  report.problems.push(...compareStrictReports(base,report));
}
fs.writeFileSync(opts['--out'], JSON.stringify(report)+'\n',{ flag:'wx' });
console.log(JSON.stringify({ status:report.problems.length ? 'FAIL':'PASS', games:Object.keys(report.games).length, problems:report.problems, out:opts['--out'] }));
process.exitCode = report.problems.length ? 1 : 0;
