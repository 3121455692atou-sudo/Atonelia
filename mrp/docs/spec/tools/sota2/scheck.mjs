// 只读：并入修订二时的 S 标签验证与开局阵容复算。数据 = RAW + D3 第一批（sota_check.mjs 的 fixes/adds）+ 修订二对手数据修订表 A–D。
// 用法：node scheck.mjs   （env DATA/SRULE 由 data.mjs 读取，默认按规格口径）
import { REL, CHAINS, COMPANIES, toDay, orgOf, labelChain } from './data.mjs';
const fmt = d => new Date(d * 864e5).toISOString().slice(0, 10);
const MODS = ['llm', 'image', 'music', 'speech'];
const out = [];
const p = (...a) => console.log(...a);

p('## 0. S 行清单（带 S 标签的发布）');
for (const r of REL.filter(r => r.S)) p(`- ${r.mod} ${r.day} ${r.name}（${r.org}）q=${r.q.toFixed(2)} main=${r.main}`);

p('\n## 1. 全世界逐日最强（全部发布，含 S）：S 行是否曾是某模态的最强（严格高于此前全部发布，或与最强同分）');
for (const m of MODS) {
  let best = -Infinity, bestR = null;
  for (const r of REL.filter(r => r.mod === m)) {
    if (r.q > best) { if (r.S) p(`- 是：${m} ${r.day} ${r.name} q=${r.q.toFixed(2)}，此前最强 ${bestR ? bestR.name + ' ' + best.toFixed(2) : '无（本模态第一条发布）'}`); best = r.q; bestR = r; }
    else if (r.q === best && r.S) p(`- 同分：${m} ${r.day} ${r.name} q=${r.q.toFixed(2)} 与 ${bestR.name}`);
  }
}

p('\n## 2. SOTA_HISTORY（全部真实发布，D10.2 规则）：S 行持标情况');
for (const m of MODS) for (const h of CHAINS[m]) if (h.S) p(`- ${m}：${h.sinceDay} ${h.name} q=${h.q.toFixed(2)} via=${h.via} counted=${h.counted}${h.countedAt ? ' countedAt=' + fmt(h.countedAt) : ''}${h.defendedBy ? ' 挡住 ' + h.defendedBy : ''} 持标到 ${isFinite(h.until) ? fmt(h.until) : '至今'}`);

p('\n## 3. 运行时（玩家所在 org 的发布全部隐藏，只看对手）：每家公司 × 本模态，S 行有没有当过对手最强或持过标签');
const hits = new Set();
for (const c of COMPANIES) {
  const org = orgOf(c.families[0]), m = c.modality;
  const rel = REL.filter(r => r.mod === m && r.org !== org);
  let best = -Infinity, bestR = null;
  for (const r of rel) { if (r.q > best || (r.q === best)) { if (r.S && r.q >= best) hits.add(`${c.id}：对手最强 ${r.day} ${r.name} ${r.q.toFixed(2)}（此前 ${bestR ? bestR.name + ' ' + best.toFixed(2) : '无'}）`); if (r.q > best) { best = r.q; bestR = r; } } }
  for (const h of labelChain(m, rel)) if (h.S) hits.add(`${c.id}：持标 ${h.sinceDay} ${h.name} counted=${h.counted}`);
}
if (!hits.size) p('- 无'); else for (const x of hits) p('- ' + x);

p('\n## 4. 史实线（histOther / ownHist 用）：含不含 S 有没有差别');
for (const m of MODS) {
  const line = (f) => { const o = []; let b = -Infinity; for (const r of REL.filter(r => r.mod === m && f(r))) if (r.q > b) { b = r.q; o.push(r); } return o; };
  const a = line(() => true), b = line(r => !r.S);
  const diff = a.filter(r => !b.includes(r));
  p(`- ${m} 全世界：${diff.length ? '差别 ' + diff.map(r => r.day + ' ' + r.name).join('、') : '无差别'}`);
  for (const org of new Set(REL.filter(r => r.mod === m).map(r => r.org))) {
    const a2 = line(r => r.org === org), b2 = line(r => r.org === org && !r.S);
    const d2 = a2.filter(r => !b2.includes(r));
    if (d2.length) p(`  - ${org}：S 行成为本 org 最强 ${d2.map(r => r.day + ' ' + r.name + ' ' + r.q.toFixed(2)).join('、')}`);
    // 同分取较晚（D1）：S 行与本 org 当时最强同分时，也会在一段时间里成为 familyBest / orgBest
    { let b = -Infinity, bR = null; for (const r of REL.filter(r => r.mod === m && r.org === org)) { if (r.S && r.q === b) p(`  - ${org}：S 行与本 org 最强同分（同分取较晚，期间算本 org 最强）${r.day} ${r.name} ${r.q.toFixed(2)}，同分的是 ${bR.name}${r.rerelease ? '（dims 完全相同，同一份模型重新放出）' : ''}`); if (r.q >= b) { b = r.q; bR = r; } } }
  }
}

p('\n## 5. 开局阵容（在线 = 开局当天 orgBest；在训 = 窗口内第一款 q 高于在线的本 org 发布；没有在线时取窗口内第一款）');
const SC = { y2023: '2023-01-01', y2024: '2024-01-01', y2025: '2025-01-01', y2026: '2026-01-01' };
const endOfMonth = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCMonth(t.getUTCMonth() + n, 0); return Math.round(t / 864e5); };
const better = (a, b) => (a.q > b.q || (a.q === b.q && a.d >= b.d)) ? a : b;   // 同分取较晚（REL 已按日排序，行序靠后的后到）
function lineup(c, sc, { orgLevel = true, noS = false } = {}) {
  const org = orgOf(c.families[0]), m = c.modality, st = toDay(SC[sc]);
  const mine = REL.filter(r => r.mod === m && (orgLevel ? r.org === org : r.family === c.families[0]) && !(noS && r.S));
  const seen = mine.filter(r => r.d <= st);
  const rel = seen.length ? seen.reduce((a, r) => better(r, a)) : null;
  const end = endOfMonth(SC[sc], rel || sc !== 'y2026' ? 4 : 6);
  const win = mine.filter(r => r.d > st && r.d <= end);
  const next = rel ? win.find(r => r.q > rel.q) ?? null : win[0] ?? null;
  return { rel, next };
}
const nm = x => x ? x.name : '—';
for (const c of COMPANIES) for (const sc of Object.keys(SC)) {
  const A = lineup(c, sc), B = lineup(c, sc, { noS: true }), F = lineup(c, sc, { orgLevel: false, noS: true });
  const s = `${nm(A.rel)} / ${nm(A.next)}`;
  const notes = [];
  if (nm(A.rel) !== nm(B.rel) || nm(A.next) !== nm(B.next)) notes.push(`S 的影响：排除 S 时为 ${nm(B.rel)} / ${nm(B.next)}`);
  if (nm(A.rel) !== nm(F.rel) || nm(A.next) !== nm(F.next)) notes.push(`org 口径的影响：只看主家族（不含 S）时为 ${nm(F.rel)} / ${nm(F.next)}`);
  p(`- ${c.id} ${sc}：${s}${A.rel ? '（在线 ' + A.rel.day + ' ' + A.rel.q.toFixed(2) + (A.rel.open ? ' 开源' : ' 闭源') + '）' : ''}${A.next ? '（在训 ' + A.next.day + ' ' + A.next.q.toFixed(2) + '）' : ''}${notes.length ? ' ← ' + notes.join('；') : ''}`);
}

p('\n## 6. 表 13（markdown）');
p('| 公司 | y2023 | y2024 | y2025 | y2026 |\n|---|---|---|---|---|');
for (const c of COMPANIES) p(`| ${c.id} | ${Object.keys(SC).map(sc => { const A = lineup(c, sc); return `${nm(A.rel)} / ${nm(A.next)}`; }).join(' | ')} |`);

p('\n## 7. 局内“集团出过 SOTA”（D10.5 kinTick）：开局是 — 的格子里，同 org 别的模态在开局后第一次拿到算数标签的日子（前提：到那天本公司还没炼出过）');
{ const SCN = { y2023: '2023-01-01', y2024: '2024-01-01', y2025: '2025-01-01', y2026: '2026-01-01' };
  const { seedCell } = await import('./data.mjs');
  let any = false;
  for (const c of COMPANIES) { const org = orgOf(c.families[0]), mod = c.modality;
    for (const [sc, start] of Object.entries(SCN)) { if (seedCell(c, start).mark !== '—') continue; const st = toDay(start);
      const hits = []; for (const m of MODS) if (m !== mod) for (const h of CHAINS[m]) if (h.org === org && h.counted && h.countedAt >= st) hits.push([h.countedAt, m, h.name]);
      hits.sort((a, b) => a[0] - b[0]); if (hits.length) { any = true; p(`- ${c.id} ${sc}：${fmt(hits[0][0])} ${hits[0][1]} ${hits[0][2]}`); } } }
  if (!any) p('- 无'); }
