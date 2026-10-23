// 每局在董事会目标卡出现时（先在克隆上）判一次，记下要求和实际成绩。用法：node goal_detail.mjs id/sc[,seeds] ...
import * as E from '../mrp/src/career/engine.js';
import { botStep, resolveAll } from '../mrp/src/career/sim/bot.js';
import { resolveGoal } from '../mrp/src/career/sim/board.js';
import { addDays } from '../mrp/src/career/sim/clock.js';
const seeds = Number(process.env.SEEDS || 4);
for (const arg of process.argv.slice(2)) {
  const [id, sc] = arg.split('/');
  for (let k = 1; k <= seeds; k++) {
    const s = E.createGame(id, sc, k * 7919);
    const rows = [];
    const pick = ev => {
      if (ev.kind === 'goal' && s.goals.find(g => g.id === ev.id)) {
        const c = JSON.parse(JSON.stringify(s));
        const r = resolveGoal(c, ev.id);
        rows.push(`${s.date} ${ev.id}${r.pass ? '✓' : r.outcome === 'grace' ? '…' : '✗'} ${r.pass ? '' : `要 ${r.need} 有 ${r.detail}`}`);
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
    console.log(`${id}/${sc}#${k} ${s.result?.reason}`);
    for (const r of rows.filter(r => !r.includes('✓'))) console.log('   ', r);
  }
}
