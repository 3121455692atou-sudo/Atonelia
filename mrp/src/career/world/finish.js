// M.5.10：自洽世界按身家结算，不套用史实局的综合评级。
import { assertRuleVersions } from './rules.js';
import { finalWealth } from './exchange.js';
import { addDays } from '../sim/clock.js';

export function finishWorld(world) {
  assertRuleVersions(world);
  if (world.result) return world.result;
  if (!world.end || world.day <= world.end) return null;
  const settledThrough = addDays(world.day, -1);
  const standings = Object.values(world.companies).filter(c => c.s)
    .map(c => ({ id: c.id, name: c.name, wealth: finalWealth(world, c.s) }))
    .sort((a, b) => b.wealth - a.wealth || a.id.localeCompare(b.id))
    .map((row, i) => ({ ...row, place: i + 1 }));
  const result = { kind: 'world', end: world.end, finalizedAt: world.day, settledThrough,
    overdue: settledThrough > world.end, standings };
  for (const row of standings) {
    const s = world.companies[row.id].s;
    // 破产、退场或崩溃不能被终局覆盖成成功；其原始记录仍可复盘。
    if (s.status !== 'playing') continue;
    s.status = 'ended';
    // 固定截止：未决卡保留供复盘，不替玩家选择，也不把其未来效果计入身家。
    const goal = s.goals?.find(g => g.check?.type === 'final');
    if (goal) goal.status = 'met';
    s.result = { kind: 'world', reason: 'complete', date: settledThrough.slice(0, 7),
      end: world.end, settledThrough, finalizedAt: world.day, overdue: result.overdue,
      place: row.place, of: standings.length, wealth: row.wealth, pendingEvents: s.queue?.length || 0, valuation: s.valuation };
  }
  world.result = result;
  return result;
}
