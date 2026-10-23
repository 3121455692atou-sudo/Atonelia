// P3.T 授名统计（全部 24 家，合并原来六批的 stats.mjs）：每个授名在史实日 ±6 个月内真正用这个授名发布的比例（目标 ≥ 50%）。
// 只统计开局之后才到史实日的授名。用法：node grants_all.mjs <仓库> <种子数> <公司,…> > out.jsonl
const [repo, seedsArg = '8', only = ''] = process.argv.slice(2);
const { playGame } = await import(`${repo}/src/career/sim/bot.js`);
const { COMPANY_FILES } = await import(`${repo}/src/career/data/companies/index.js`);
const { daysBetween } = await import(`${repo}/src/career/sim/clock.js`);
const N = Number(seedsArg), WINDOW = 183;
const START = { y2023: '2023-01-01', y2024: '2024-01-01', y2025: '2025-01-01', y2026: '2026-01-01' };
for (const company of only.split(',').filter(Boolean)) {
  const file = COMPANY_FILES[company];
  const names = (file?.names || []).filter(h => h.real);
  for (const sc of Object.keys(START)) {
    const rel = names.map(h => ({ id: h.id, name: h.name, real: h.real.length === 7 ? `${h.real}-15` : h.real })).filter(h => h.real >= START[sc] && h.real <= '2026-10-31');
    if (!rel.length) continue;
    const rows = rel.map(h => ({ ...h, used: 0, ok: 0, voided: 0, early: 0 }));
    for (let seed = 1; seed <= N; seed++) {
      const { s } = playGame(company, sc, seed);
      for (const r of rows) {
        const hit = (s.models || []).find(m => m.stage === 'released' && m.grant === r.id);
        if (hit) { r.used++; if (Math.abs(daysBetween(r.real, hit.releasedDay)) <= WINDOW) r.ok++; }
        else { if (s.strategy?.rights?.[r.id]?.void) r.voided++; if (s.result?.reason === 'goal_failed') r.early++; }
      }
    }
    for (const r of rows) console.log(JSON.stringify({ company, sc, seeds: N, ...r }));
  }
}
