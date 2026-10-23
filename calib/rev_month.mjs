// 逐月收入拆分：node rev_month.mjs id sc seed from to
import { playGame } from '../mrp/src/career/sim/bot.js';
const [id, sc, seed = 7919, from = '2024-08', to = '2025-04'] = process.argv.slice(2);
playGame(id, sc, Number(seed), {
  onMonth(s, rep) {
    const h = s.history.at(-1);
    if (!h || h.date < from || h.date > to) return;
    const rev = h.revenue || {};
    const sv = s.service.last || {};
    const live = s.models.filter(m => m.stage === 'released' && !m.hist).slice(-2).map(m => `${m.name}@${m.released}`).join(' ');
    console.log(h.date, Object.entries(typeof rev === 'object' ? rev : { all: rev }).map(([k, v]) => `${k}:${(v / 1e4).toFixed(0)}万`).join(' '), '| share', JSON.stringify(sv.share ?? sv.shares ?? null)?.slice(0, 120), '|', live);
  },
});
