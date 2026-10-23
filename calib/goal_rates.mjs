// 各量级 × 各目标的达成率（最终判定，含宽限期），以及没达成时的成绩分布。用法：node goal_rates.mjs [seeds]
import * as E from '../mrp/src/career/engine.js';
import { botStep, resolveAll } from '../mrp/src/career/sim/bot.js';
import { resolveGoal } from '../mrp/src/career/sim/board.js';
import { addDays } from '../mrp/src/career/sim/clock.js';
import { COMPANIES } from '../mrp/src/career/data/core.js';
const seeds = Number(process.argv[2] || 2);
const stat = {};
for (const c of COMPANIES.filter(x => x.modality === 'llm')) for (const sc of ['y2023', 'y2024']) for (let k = 1; k <= seeds; k++) {
  const s = E.createGame(c.id, sc, k * 7919);
  const last = {};
  const pick = ev => {
    if (ev.kind === 'goal' && s.goals.find(g => g.id === ev.id)) {
      const cl = JSON.parse(JSON.stringify(s));
      const r = resolveGoal(cl, ev.id);
      last[ev.id] = { pass: r.pass, detail: r.detail, need: r.need, out: r.outcome };
    }
    return null;
  };
  let decideAt = s.day;
  for (let i = 0; i < 2500 && s.status === 'playing'; i++) {
    resolveAll(s, pick);
    if (s.status !== 'playing') break;
    if (s.day >= decideAt) { botStep(s, []); decideAt = addDays(s.day, 7); }
    E.tickDay(s);
  }
  for (const g of s.goals) {
    if (!last[g.id] || g.id === 'final') continue;
    const key = `${c.tier}|${g.id}`;
    const st = stat[key] ??= { met: 0, failed: 0, fails: [] };
    if (g.status === 'met') st.met++; else if (g.status === 'failed') { st.failed++; st.fails.push(`${c.id}/${sc}: ${last[g.id].detail}`); }
  }
  (stat[`${c.tier}|_replaced`] ??= { met: 0, failed: 0, fails: [] })[s.result?.reason === 'goal_failed' ? 'failed' : 'met']++;
}
for (const k of Object.keys(stat).sort()) {
  const v = stat[k];
  console.log(k.padEnd(28), `达成 ${v.met}  没达成 ${v.failed}`);
  if (process.env.V) for (const f of v.fails) console.log('      ', f);
}
