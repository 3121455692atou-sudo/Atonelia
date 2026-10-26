// Pure authoritative supply state: data-only imports, safe for server preflight.
import { GPUS } from '../data/core.js';
import { quotaFor, quarterOf, QUOTA } from '../data/supply.js';
import { SUPPLY_SELF } from '../data/selfplay.js';
const active = world => Object.values(world.companies).filter(c => !c.frozen && c.s?.status === 'playing');

// 每季度每种卡的世界总供给（M.3.8 第 3 条）。
// 基数由权威开局/日界采样；查询不决定哪些公司计入本季度供给。
export function assertSupplyBasis(world) {
  const b = world.supply?.basis;
  if (!b || typeof b !== 'object' || Array.isArray(b) || !/^\d{4}Q[1-4]$/.test(b.quarter) || !b.tiers || typeof b.tiers !== 'object' || Array.isArray(b.tiers) || Object.keys(b).length !== 2 || !Object.hasOwn(b,'quarter') || !Object.hasOwn(b,'tiers') || Object.entries(b.tiers).some(([tier,n]) => !Object.hasOwn(QUOTA,tier) || !Number.isSafeInteger(n) || n < 0)) throw Error('季度供给基数缺失或损坏；需要新规则世界');
}
export function assertSupplyState(world) {
  assertSupplyBasis(world);
  const q = quarterOf(world.day), S = world.supply;
  if (S.basis.quarter !== q || S.capQ !== q || S.quarter !== q || S.capDay !== world.day || !S.cap || typeof S.cap !== 'object' || Array.isArray(S.cap)) throw Error('季度供给日界状态不一致');
  const expected = capOf(world, world.day);
  if (Object.keys(S.cap).length !== Object.keys(expected).length || Object.entries(expected).some(([id,n]) => S.cap[id] !== n)) throw Error('季度供给容量与基数或GPU日程不一致');
}
export function quarterCap(world, day = world.day, initialize = false) {
  if (world.mirror) return world.supply.cap || {};
  const q = quarterOf(day);
  if (!initialize) assertSupplyBasis(world);
  if (initialize || world.supply.basis.quarter !== q) {
    const tiers = {};
    for (const c of active(world)) tiers[c.tier0] = (tiers[c.tier0] || 0) + 1;
    world.supply.basis = { quarter: q, tiers };
  }
  const cap = capOf(world, day);
  world.supply.capQ = q;
  world.supply.capDay = day;
  world.supply.cap = cap;
  world.supply.quarter = q;
  return cap;
}
export function quarterCapView(world, day = world.day) {
  if (world.mirror) return world.supply.cap || {};
  assertSupplyBasis(world);
  if (world.supply.basis.quarter !== quarterOf(day)) throw Error('季度供给尚未经权威日界初始化');
  return world.supply.capDay === day && world.supply.capQ === quarterOf(day) && world.supply.cap ? world.supply.cap : capOf(world, day);
}
function capOf(world, day) {
  const cap = {};
  for (const id of Object.keys(GPUS)) {
    const g = GPUS[id];
    if (day < g.from || (g.to && day > g.to)) { cap[id] = 0; continue; }
    let n = 0;
    for (const [tier, count] of Object.entries(world.supply.basis.tiers)) n += quotaFor(tier, id, day) * count;
    cap[id] = Math.round(n * SUPPLY_SELF.MULT);
  }
  return cap;
}

