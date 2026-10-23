const R = '../mrp';
const E = await import(`${R}/src/career/engine.js`);
const { botStep, resolveAll } = await import(`${R}/src/career/sim/bot.js`);
const { nameGrantCheck } = await import(`${R}/src/career/sim/naming.js`);
const { qOf, worldSota } = await import(`${R}/src/career/sim/sota.js`);
const seed = Number(process.argv[2] || 1);
const s = E.createGame('deepseek', 'y2024', seed);
for (let i = 0; i < 700 && s.status === 'playing'; i++) {
  resolveAll(s);
  if (i % 7 === 0) botStep(s, []);
  const w = E.workingModel(s);
  if (s.day >= '2025-01-20' && s.day <= '2025-05-01' && i % 14 === 0 && w) {
    const c = nameGrantCheck(s, w, 'hn_ds_r1', { role: 'flagship', open: true });
    const ws = worldSota(s);
    console.log(s.day, `在练 q ${qOf('llm', w.dims).toFixed(1)} 数学 ${w.dims.math.toFixed(1)} 最强 ${ws?.q.toFixed(1)}（${ws?.name}）`, (c.lines || []).filter(l => !l.ok).map(l => l.text).join(' | ').slice(0, 160));
  }
  E.tickDay(s);
}
