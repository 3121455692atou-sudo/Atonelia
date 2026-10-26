// Display only: Hamilton rounding of exact allocation, never engine allocation.
// Keep rounded total usage, each row within floor/ceil of its exact share, and
// break equal remainders in allocJobs' existing priority/sequence order.
export function jobCardCounts(al) {
  const rows = al.items.map((it, index) => {
    const raw = it.run ? Math.max(0, it.cards) : 0;
    const exact = Math.abs(raw - Math.round(raw)) < 1e-9 ? Math.round(raw) : raw;
    return { it, index, exact, got: Math.floor(exact), want: Number.isFinite(it.wantCards) ? Math.ceil(it.wantCards - 1e-9) : null };
  });
  const total = Math.max(0, Math.round(al.T));
  const used = Math.min(total, Math.round(rows.reduce((sum, r) => sum + r.exact, 0)));
  let remainder = used - rows.reduce((sum, r) => sum + r.got, 0);
  for (const r of [...rows].sort((a, b) => { const d = (b.exact - b.got) - (a.exact - a.got); return Math.abs(d) < 1e-9 ? a.index - b.index : d; })) {
    if (remainder <= 0) break;
    if (r.exact > r.got) { r.got++; remainder--; }
  }
  return { total, used, idle: total - used, rows, byItem: new Map(rows.map(r => [r.it, r])) };
}
