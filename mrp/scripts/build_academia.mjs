#!/usr/bin/env node
// 生成 data/academia.js（规格 M.3.7）：各年的真实开源参照、首款真实开源模型，以及学界起点表。
// 只读仓库里已有的真实发布表和技术表，不联网。改动对手数据或训练曲线以后重跑一次：
//   node scripts/build_academia.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RELEASES } from '../src/career/data/rivals.js';
import { qOf } from '../src/career/sim/sota.js';
import { PARAM_TOTALS } from '../src/career/data/core.js';
import { SELF, ACAD } from '../src/career/data/selfplay.js';
import { initTech, levelAt } from '../src/career/world/tech.js';
import { setProvider, HistoryProvider, registerCompany } from '../src/career/sim/provider.js';
import { createGame } from '../src/career/sim/game.js';
import { poolStats, previewProject } from '../src/career/sim/model.js';
import { projectCheck } from '../src/career/sim/projects.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/career/data/academia.js');
const r1 = x => Math.round(x * 10) / 10;
const YEARS = [2023, 2024, 2025];

const openRows = RELEASES.filter(r => r.mod === 'llm' && r.open).map(r => ({
  name: r.name, day: r.day, date: r.date, q: qOf(r.mod, r.dims), dims: { ...r.dims },
}));
const realBestOpen = day => {
  const before = openRows.filter(r => r.day <= day);
  if (before.length) return before.reduce((a, r) => (!a || r.q > a.q ? r : a), null);
  return firstOpen;
};
const firstOpen = openRows.reduce((a, r) => (!a || r.day < a.day ? r : a), null);

// 探针：本局最弱开局档，按 M.2.2 的开局技术（只给世界账本里到论文或开源的）在 4 个月内能练出的最好底座。
const probeBest = (year, tier) => {
  const startDay = `${year}-01-01`;
  const fake = { day: startDay, start: startDay };
  initTech(fake);
  const tc = { small: 's', specialist: 'p', major: 'm' }[tier];
  const id = `c_${('p' + year + tc).slice(-6).toLowerCase()}`;
  const spec = {
    id, company: '探针实验室', name: 'Probe', label: 'Probe', country: 'US', tier, modality: 'llm',
    org: id, families: [id], brand: 0.5, region: 'global',
    stance: Object.fromEntries(['y2023', 'y2024', 'y2025', 'y2026'].map(sc => [sc, 'closed'])),
  };
  registerCompany(spec);
  const s = createGame(id, `y${year}`, 7);
  s.techs = s.techs.filter(t => {
    const x = levelAt(fake, t, s.start);
    return ['paper', 'open'].includes(x) || !fake.techHasSource[t];
  });
  const pool = poolStats(s).tokens;
  let best = -Infinity;
  for (const total of PARAM_TOTALS) for (const mult of [20, 80, 200]) {
    const cfg = { total, active: total, arch: 'dense', tokens: Math.max(0.5, Math.min(pool * 2, Math.round(total * mult / 100) / 10)) };
    if (!projectCheck(s, cfg).ok) continue;
    const pv = previewProject(s, cfg);
    if (pv.months > ACAD.PROBE_MONTHS) continue;
    const birth = Object.fromEntries(Object.entries(pv.base).map(([k, v]) => [k, Math.min(95, v + (k === 'safety' ? 18 : 2))]));
    best = Math.max(best, qOf('llm', birth));
  }
  return best;
}

setProvider(new HistoryProvider());
const ACAD_REAL = {};
const ACAD_START = {};
for (const y of YEARS) {
  const startDay = `${y}-01-01`;
  const ref = realBestOpen(startDay) || firstOpen;
  ACAD_REAL[y] = {
    ref: { name: ref.name, day: ref.day, q: r1(ref.q), dims: Object.fromEntries(Object.entries(ref.dims).map(([k, v]) => [k, r1(v)])) },
    first: firstOpen ? { name: firstOpen.name, day: firstOpen.day, q: r1(firstOpen.q) } : null,
  };
  ACAD_START[y] = {};
  for (const tier of SELF.TIERS) {
    const probe = probeBest(y, tier);
    ACAD_START[y][tier] = r1(Math.min(ref.q - ACAD.REAL_GAP, probe - ACAD.PROBE_GAP));
  }
}

const body = `// 由 scripts/build_academia.mjs 从真实发布表生成，不要手改（重跑：node scripts/build_academia.mjs）。
// ACAD_REAL：各年开局前的真实开源最强（开局前没有开源发布时取表里第一款真实开源模型）。
// ACAD_START：学界起点表（M.3.7）：min(真实开源最强 − ${ACAD.REAL_GAP}, 本局最弱开局档 4 个月内最好底座 − ${ACAD.PROBE_GAP})。
export const ACAD_REAL = ${JSON.stringify(ACAD_REAL, null, 2)};

export const ACAD_START = ${JSON.stringify(ACAD_START, null, 2)};
`;
fs.writeFileSync(OUT, body);
console.log(`写入 ${path.relative(ROOT, OUT)}`);
for (const y of YEARS) console.log(`${y}: ${JSON.stringify(ACAD_START[y])}  参照 ${ACAD_REAL[y].ref.name} ${ACAD_REAL[y].ref.q}`);
