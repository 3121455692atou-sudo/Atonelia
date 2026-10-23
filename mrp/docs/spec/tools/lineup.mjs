import { COMPANIES, SCENARIOS, addMonths } from '../../../src/career/data/core.js';
import { RELEASES } from '../../../src/career/data/rivals.js';
// v0.9 口径的对照脚本（按月、取家族最新一款）。P1.1 删掉了 rivals.js 里的那个函数，这里留一份本地写法，只读、只打印。
const latestOf = (fam, date) => RELEASES.filter(r => r.family === fam && r.date <= date).pop() || null;
for (const c of COMPANIES) {
  const out = [];
  for (const sc of SCENARIOS) {
    const fam = c.families[0];
    const rel = latestOf(fam, sc.start);
    const ahead = sc.id==='y2026' && !rel ? 6 : 4;
    const next = RELEASES.find(r => r.family === fam && r.date > sc.start && r.date <= addMonths(sc.start, ahead));
    const nxt2 = RELEASES.filter(r => r.family === fam && r.date > sc.start && r.date <= addMonths(sc.start, 12)).map(r=>`${r.date} ${r.name}${r.open?'(O)':'(C)'}`);
    out.push(`${sc.id}: rel=${rel?rel.name+(rel.open?'(O)':'(C)'):'-'} next=${next?next.name+(next.open?'(O)':'(C)'):'-'} | 12mo: ${nxt2.join('; ')}`);
  }
  console.log('##', c.id, c.families.join(','), 'open=', c.open); for (const o of out) console.log('  ', o);
}
