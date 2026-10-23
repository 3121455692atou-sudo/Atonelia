#!/usr/bin/env node
// 整局冒烟：24 家公司 × 4 个剧本 × {机器人 playGame, 大按钮 playAdvised}，共 192 局，种子 1。
// 每局要求：
//   1. 0 次抛错：引擎不抛错，机器人的操作也没有失败（r.errors 为空）；
//   2. 0 局卡死：必须打到结束（status 不再是 playing），而且天数不超过该剧本的上限（开局到 END 再加 60 天）；
//   3. 终局状态（含结算 s.result）里的数字全是有限数，没有 NaN / Infinity；
//   4. 存档能 JSON 来回并读回：每 90 天一次中途存档，加上终局存档，都要经 ui/storage.js 的 safeLoadState(json) 读回
//      （界面 boot、标题页、“继续”用的就是它，里面是 migrateGame + validateGame），
//      而且读回后的 JSON 和原状态一模一样（新版存档再读一遍不该有任何变化）。
// 用法：node scripts/smoke.mjs [--only 公司,…] [--verbose]     退出码非 0 表示有一局不过。
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = p => pathToFileURL(path.join(ROOT, p)).href;
const bot = await import(url('tests/helpers/career_bot.mjs'));
const { COMPANIES, SCENARIOS, END } = await import(url('src/career/data/core.js'));
const { daysBetween } = await import(url('src/career/sim/clock.js'));
const { safeLoadState } = await import(url('src/career/ui/storage.js'));

const SEED = 1;
const CHECKPOINT_DAYS = 90;
const SLACK_DAYS = 60;
const MODES = { bot: 'playGame', advised: 'playAdvised' };

const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const verbose = argv.includes('--verbose');

function badNumbers(x, at = 's', seen = new WeakSet(), out = []) {
  if (typeof x === 'number') { if (!Number.isFinite(x)) out.push(at); } else if (x && typeof x === 'object') {
    if (seen.has(x)) return out;
    seen.add(x);
    for (const [k, v] of Object.entries(x)) { badNumbers(v, `${at}.${k}`, seen, out); if (out.length >= 5) break; }
  }
  return out;
}

class Stuck extends Error {}

function playOne(company, scenario, mode) {
  const problems = [];
  const sc = SCENARIOS.find(x => x.id === scenario);
  const cap = daysBetween(`${sc.start}-01`, `${END}-01`) + SLACK_DAYS;
  let next = CHECKPOINT_DAYS;
  const roundTrip = (s, label) => {
    const json = JSON.stringify(s);
    let r;
    try { r = safeLoadState(json); } catch (e) { problems.push(`${label}：存档读回抛错：${String(e.message).slice(0, 100)}`); return; }
    if (!r.ok) { problems.push(`${label}：存档读回失败：${String(r.reason).slice(0, 100)}`); return; }
    const back = r.s;
    if (JSON.stringify(back) !== json) problems.push(`${label}：存档读回后内容变了`);
    const bad = badNumbers(back);
    if (bad.length) problems.push(`${label}：读回后有非有限数 ${bad.join(', ')}`);
  };
  const onWeek = s => {
    const d = daysBetween(`${s.start}-01`, s.day);
    if (d > cap) throw new Stuck(`超过天数上限（${s.day}，已走 ${d} 天，上限 ${cap}）`);
    if (d >= next) { next = (Math.floor(d / CHECKPOINT_DAYS) + 1) * CHECKPOINT_DAYS; roundTrip(s, `${s.day} 中途存档`); }
  };
  let s = null;
  try {
    const r = bot[MODES[mode]](company, scenario, SEED, { onWeek });
    s = r.s;
    if (r.errors.length) problems.push(`${r.errors.length} 次操作失败：${r.errors.slice(0, 2).join(' ; ')}`);
  } catch (e) {
    problems.push(e instanceof Stuck ? `卡死：${e.message}` : `抛错：${String(e.stack).split('\n').slice(0, 3).join(' | ')}`);
    return { problems, s };
  }
  if (s.status === 'playing') problems.push('卡死：没打完（status 还是 playing）');
  else if (!s.result?.rank) problems.push('没有结算（s.result.rank 为空）');
  const bad = badNumbers(s);
  if (bad.length) problems.push(`终局有非有限数 ${bad.join(', ')}`);
  roundTrip(s, `${s.day} 终局存档`);
  return { problems, s };
}

let fail = 0;
let total = 0;
const t0 = performance.now();
for (const c of COMPANIES) {
  if (only && !only.includes(c.id)) continue;
  for (const sc of SCENARIOS) {
    for (const mode of Object.keys(MODES)) {
      total++;
      const t = performance.now();
      const { problems, s } = playOne(c.id, sc.id, mode);
      const tag = `${c.id}/${sc.id}/${mode}`;
      if (problems.length) { fail++; console.log(`失败 ${tag}  ${problems.slice(0, 3).join(' / ')}${problems.length > 3 ? ` / …共 ${problems.length} 条` : ''}`); }
      else if (verbose) console.log(`OK   ${tag}  ${((performance.now() - t) / 1000).toFixed(2)} 秒  评级 ${s.result.rank} 终局 ${s.day}`);
    }
  }
}
const secs = ((performance.now() - t0) / 1000).toFixed(1);
console.log(fail ? `冒烟未通过：${fail} / ${total} 局有问题（${secs} 秒）` : `冒烟通过：${total} 局，0 次抛错、0 局卡死、0 个非有限数、存档读回全部一致（${secs} 秒）`);
process.exit(fail ? 1 : 0);
