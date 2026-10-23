// 学界与开源社区（规格 M.3.7）：世界里的 NPC 发布者。
// 起点 = min(开局前真实开源最强 − 4, 本局最弱开局档 4 个月内最好底座 − 3)，表由 scripts/build_academia.mjs 生成。
// 之后只由公司行为推动：开源跟进、技术扩散、永远比公司已发最强低 1 分以上；全员闭源时一直停在起点。
import { ACAD_REAL, ACAD_START } from '../data/academia.js';
import { relId } from '../data/rivals.js';
import { ACAD } from '../data/selfplay.js';
import { addDays, daysBetween } from '../sim/clock.js';
import { appendRelease } from './release.js';
import { acadBest, companyBest, companyRows } from './label.js';

const r1 = x => Math.round(x * 10) / 10;

// 开局：追加“社区开源基线 YYYY-MM”，宽松许可，带 A 标签。
export function acadStart(world, { year, tier }) {
  const y = String(year);
  const real = ACAD_REAL[y];
  if (!real?.ref) throw new Error(`没有 ${y} 年的学界起点参照`);
  const tableQ = ACAD_START[y]?.[tier];
  const startQ = Number.isFinite(tableQ) ? tableQ : r1(real.ref.q - ACAD.REAL_GAP);
  const dims = Object.fromEntries(Object.entries(real.ref.dims).map(([k, v]) => [k, v * startQ / real.ref.q]));
  const name = `社区开源基线 ${world.start}`;
  const { meta } = appendRelease(world, {
    family: 'academia', date: world.start, day: world.day, name, cls: 'large',
    open: true, price: 'budget', tags: 'LP,A', dims, q: startQ, kin: [],
  });
  world.acad.q = meta.q;
  world.acad.start = meta.q;
  world.acad.startRelId = meta.relId;
  world.acad.log.push(`${world.day} 起点 q=${r1(meta.q)}（真实开源参照 ${real.ref.name} ${r1(real.ref.q)} − ${ACAD.REAL_GAP}；本局 ${tier} 档 4 个月内最好底座 ${r1(startQ + ACAD.PROBE_GAP)} − ${ACAD.PROBE_GAP}；取小）`);
  return meta;
}

// 学界目标值（不落地）；测试和月结共用。
export function acadTarget(world, day = world.day) {
  const best = companyBest(world, day);
  if (!Number.isFinite(best)) return null;
  let follow = -Infinity, src = null;
  for (const x of companyRows(world, day)) {
    if (!x.open || daysBetween(x.day, day) < ACAD.OPEN_LAG) continue;
    if (x.q - ACAD.OPEN_GAP > follow) { follow = x.q - ACAD.OPEN_GAP; src = x; }
  }
  const target = Math.min(best - ACAD.BELOW_TOP, Math.max(world.acad.start, follow) + ACAD.TECH_GAIN * world.acad.gains.length);
  return { target, follow, src, best };
}

// 每月最后一天收盘时算一次：目标值比现值高 0.5 以上，就当天追加一行（各维取被跟进那一款，按 q 等比缩放）。
export function acadFollow(world, day = world.day) {
  const t = acadTarget(world, day);
  if (!t || t.target - world.acad.q < ACAD.STEP) return null;
  const base = t.src && t.follow >= world.acad.start ? t.src : world.relMeta[world.acad.startRelId];
  if (!base) return null;
  const dims = Object.fromEntries(Object.entries(base.dims).map(([k, v]) => [k, v * t.target / base.q]));
  const kin = [...new Set([
    ...(base.org !== 'academia' ? [base.org, ...(base.kin || [])] : []),
    ...world.acad.publishers,
  ])];
  const name = `社区开源基线 ${day.slice(0, 7)}`;
  // 开局那一行也用“社区开源基线 开局月”。如果同一个月目标就涨了，会撞上开局行；
  // 学界不抢名字，顺延到下个月再发（目标只涨不跌，下个月照样会补上）。
  if (world.relIds?.[relId(name)]) return null;
  const { meta } = appendRelease(world, {
    family: 'academia', date: day.slice(0, 7), day, name, cls: 'large',
    open: true, price: 'budget', tags: 'LP,A', dims, q: t.target, kin,
  });
  world.acad.q = meta.q;
  world.acad.log.push(`${day} ${name} q=${r1(meta.q)}（跟进 ${t.src ? t.src.name : '—'}，技术扩散 ${world.acad.gains.length} 项${kin.length ? `，血统含 ${kin.join(',')}` : ''}）`);
  return meta;
}

export const isNpc = org => org === 'academia';
export { acadBest, addDays };
