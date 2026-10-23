// 同一家公司、同一种子：机器人和大按钮在每个董事会目标截止日的成绩，以及两边的底座/发布时间线。
// 用法：node cmp_modes.mjs id/剧本 [种子]
import * as E from '../mrp/src/career/engine.js';
import { botStep, resolveAll, advance } from '../mrp/src/career/sim/bot.js';
import { resolveGoal } from '../mrp/src/career/sim/board.js';
import { addDays } from '../mrp/src/career/sim/clock.js';
const [arg, seedArg = '7919'] = process.argv.slice(2);
const [id, sc] = arg.split('/');
function run(mode) {
  const s = E.createGame(id, sc, Number(seedArg));
  const rows = [];
  const pick = ev => {
    if (ev.kind === 'goal' && s.goals.find(g => g.id === ev.id)) {
      const c = JSON.parse(JSON.stringify(s));
      const r = resolveGoal(c, ev.id);
      rows.push(`${s.date} ${ev.id}${r.pass ? '✓' : r.outcome === 'grace' ? '…' : '✗'} 要 ${r.need} 有 ${r.detail}`);
    }
    return null;
  };
  if (mode === 'bot') {
    let decideAt = s.day;
    for (let i = 0; i < 2500 && s.status === 'playing'; i++) {
      resolveAll(s, pick);
      if (s.status !== 'playing') break;
      if (s.day >= decideAt) { botStep(s, []); decideAt = addDays(s.day, 7); }
      E.tickDay(s);
    }
  } else {
    for (let week = 0; week < 400 && s.status === 'playing'; week++) {
      resolveAll(s, pick);
      if (s.status !== 'playing') break;
      const seen = new Map();
      for (let k = 0; k < 30; k++) {
        const [a] = E.advise(s);
        if (!a) break;
        if (a.kind === 'event') { resolveAll(s, pick); continue; }
        if (a.kind !== 'jobs' && (seen.get(a.id) || 0) >= 3) break;
        seen.set(a.id, (seen.get(a.id) || 0) + 1);
        try { E.applyAdvice(s, a); } catch { break; }
        if (a.kind === 'jobs') break;
      }
      advance(s, 7, pick);
    }
  }
  const rel = s.models.filter(m => m.stage === 'released' && !m.hist).map(m => `${m.released?.slice?.(0, 7) || m.released} ${m.name}(${m.total}B${m.active < m.total ? `/${m.active}A` : ''},${m.origin || 'pre'})`);
  const log = s.log.filter(l => /立项/.test(l.text)).map(l => `${String(l.date).slice(0, 7)} ${l.text}`);
  console.log(`== ${mode} ${id}/${sc} ${s.result?.reason} ${s.result?.rank} 收入 ${((s.result?.revenue || 0) / 1e6).toFixed(1)}M 卡 ${E.gpuCount ? '' : ''}`);
  for (const r of rows) console.log('   ', r);
  console.log('   立项：', log.join(' | '));
  console.log('   发布：', rel.join(' | '));
}
run('bot'); run('adv');
