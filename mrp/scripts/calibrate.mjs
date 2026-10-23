#!/usr/bin/env node
// 平衡校准：让自动机器人把每家公司、每个剧本各玩几局，汇总结局、评级和里程碑达成率。
// 用法：node scripts/calibrate.mjs [--seeds 3] [--only qwen,deepseek] [--sc y2023] [--advisor]
// --advisor：不用机器人自己的策略，每一步都照着界面上的“下一步”大按钮做。
import { COMPANIES, SCENARIOS } from '../src/career/data/core.js';
import { playGame, playAdvised } from '../tests/helpers/career_bot.mjs';
import { fmtMoney } from '../src/career/sim/util.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const SEEDS = Number(opt('seeds', 3));
const ONLY = opt('only', '') ? opt('only', '').split(',') : null;
const SC = opt('sc', '');
const play = args.includes('--advisor') ? playAdvised : playGame;

const goalStats = {};
const rows = [];
for (const c of COMPANIES.filter(x => !ONLY || ONLY.includes(x.id))) {
  for (const sc of SCENARIOS.filter(x => !SC || x.id === SC)) {
    const res = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { s, errors } = play(c.id, sc.id, seed * 7919);
      for (const g of s.goals.filter(x => x.check.type !== 'final')) {
        const k = `${c.modality}:${g.id}`;
        goalStats[k] = goalStats[k] || { met: 0, n: 0, tiers: {} };
        goalStats[k].n += 1;
        if (g.status === 'met') goalStats[k].met += 1;
        const t = (goalStats[k].tiers[c.tier] = goalStats[k].tiers[c.tier] || [0, 0]);
        t[1] += 1;
        if (g.status === 'met') t[0] += 1;
      }
      res.push({ r: s.result, errors: errors.length, strikes: s.strikes || 0 });
    }
    const avg = k => res.reduce((a, x) => a + (x.r?.[k] || 0), 0) / res.length;
    rows.push({
      id: c.id, sc: sc.id, tier: c.tier,
      ranks: res.map(x => x.r?.rank || '?').join(''),
      total: avg('total').toFixed(0),
      ends: res.map(x => ({ complete: '完', goal_failed: '撤', bankrupt: '破' }[x.r?.reason] || '?')).join(''),
      rev: fmtMoney(avg('revenue')), val: fmtMoney(avg('valuation')),
      parts: ['bizScore', 'capitalScore', 'marketScore', 'capScore', 'rep', 'goalScore'].map(k => Math.round(res.reduce((a, x) => a + (x.r?.parts?.[k] || 0), 0) / res.length)).join('/'),
      err: res.reduce((a, x) => a + x.errors, 0),
    });
  }
}
console.log('公司'.padEnd(12), '剧本 ', '量级'.padEnd(10), '评级', '均分', '结局', '月收入'.padEnd(10), '估值'.padEnd(10), '经营/资本/份额/能力/口碑/目标', '错误');
for (const r of rows) console.log(r.id.padEnd(12), r.sc, r.tier.padEnd(10), r.ranks.padEnd(4), r.total.padStart(3), r.ends.padEnd(4), r.rev.padEnd(10), r.val.padEnd(10), r.parts, r.err);
console.log('\n里程碑达成率');
for (const [k, v] of Object.entries(goalStats)) console.log(k.padEnd(22), `${Math.round(100 * v.met / v.n)}%`.padStart(5), Object.entries(v.tiers).map(([t, [m, n]]) => `${t} ${m}/${n}`).join('  '));
