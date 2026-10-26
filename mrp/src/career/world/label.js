import { riskPost } from '../sim/post_exposure.js';
// SOTA 世界账本（规格 M.3.4、M.3.10）：全世界只存一份标签，各家读收盘时投影回来的镜像 s.sota。
// - 候选：公司的全部发布，不分大小、开闭源；学界的行不当候选，但给候选设门槛；
// - 挂标、换手、挡住挑战才算数、稳坐也算数；
// - “炼出过”永久记在 world.label.made[公司]；
// - 行业第一次记在 world.ms，学界不登记。
import { SOTA } from '../data/balance.js';
import { OWNER_OF } from '../data/core.js';
import { SELF } from '../data/selfplay.js';
import { FAMILIES } from '../data/rivals.js';
import { MILESTONES, msMods } from '../data/milestones.js';
import { rivalMatch } from '../sim/milestones.js';
import { daysBetween } from '../sim/clock.js';

const EPS = SOTA.EPS, FILL = SOTA.FILL_LEAD, FIELD = SOTA.FIELD;
const DEFEND_NEAR = SELF.DEFEND_NEAR, STEADY = SELF.STEADY_DAYS;

export function blankLabel() {
  return { holder: null, field: [], log: [], made: {}, steadySince: null, best: {} };
}

export const acadBest = world => world.acad?.q ?? -Infinity;

export function companyRows(world, day = world.day) {
  const out = [];
  for (const [relId, x] of Object.entries(world.relMeta || {})) {
    if (x.org === 'academia' || x.day > day) continue;
    out.push({ ...x, relId });
  }
  return out;
}
export function companyBest(world, day = world.day) {
  let best = -Infinity;
  for (const x of companyRows(world, day)) best = Math.max(best, x.q);
  return best;
}

function bestOther(world, org, day) {
  let best = acadBest(world);
  for (const x of companyRows(world, day)) if (x.org !== org) best = Math.max(best, x.q);
  return best;
}

// 完整血统（只在服务器上）：这款模型的老师（后训练、续训底座、合成教材）所在公司，再并上那些公司已发布行的血统，去掉自己。
export function kinOf(world, org, m) {
  const fams = new Set([
    ...Object.keys(riskPost(m)?.teachers || {}),
    ...Object.keys(m?.taintTeachers || {}),
    m?.lineage?.fam,
    m?.distillation?.teacher?.id,
  ].filter(x => x && x !== 'self'));
  const set = new Set();
  for (const f of fams) {
    // 血统按世界公司 id 记：分岔局里家族 gpt 的公司 id 是 gpt（OWNER_OF），不是真实 org openai；从零局里两者一样。
    const o = OWNER_OF[f] ?? FAMILIES[f]?.org ?? f;
    if (o === org) continue;
    set.add(o);
    for (const x of Object.values(world.relMeta || {})) if (x.org === o) for (const k of x.kin || []) if (k !== org) set.add(k);
  }
  return [...set];
}

function credit(world, h, via, day) {
  if (!h || h.org === 'academia' || !h.modelId) return;
  const bag = (world.label.made[h.org] ??= []);
  if (bag.some(x => x.relId === h.relId)) return;
  bag.push({ relId: h.relId, modelId: h.modelId, day, q: h.q, via });
}

function setHolder(world, meta, day, via, counted, countedAt = null) {
  world.label.holder = {
    org: meta.org, relId: meta.relId, modelId: meta.modelId, name: meta.name, q: meta.q, dims: { ...meta.dims },
    kin: [...(meta.kin || [])], seq: meta.seq, day, since: day, via, counted: !!counted, countedAt: counted ? countedAt ?? day : null,
  };
}

// 一条公司发布过世界标签（M.3.4）。meta 是 appendRelease 返回的发布行；返回 { result, prev }。
// result：'fill' | 'swap' | 'self' | 'defend' | null。
export function offerLabel(world, meta, day = meta.day) {
  if (!meta || meta.org === 'academia') return { result: null, prev: null };
  const L = world.label;
  if (!L.field.includes(meta.org)) L.field.push(meta.org);
  const prevBest = L.best[meta.org] ?? -Infinity;
  const main = meta.q >= prevBest;
  if (main) L.best[meta.org] = meta.q;
  if (L.field.length < FIELD) return { result: null, prev: null };
  if (meta.q <= acadBest(world)) return { result: null, prev: null };

  const h = L.holder;
  const prev = h ? { ...h } : null;
  if (!h) {
    const pool = companyRows(world, day).filter(x => x.q > acadBest(world));
    const best = pool.reduce((a, x) => (!a || x.q > a.q || (x.q === a.q && (x.seq ?? 0) < (a.seq ?? 0)) ? x : a), null);
    if (!best) return { result: null, prev };
    const other = bestOther(world, best.org, day);
    setHolder(world, best, day, 'fill', best.q - other >= FILL);
    if (world.label.holder.counted) credit(world, world.label.holder, 'fill', day);
    return { result: 'fill', prev };
  }
  if (meta.org === h.org) {
    if (meta.q >= h.q && meta.relId !== h.relId) {
      L.log.push({ ...h, until: day });
      setHolder(world, meta, day, 'self', h.counted, h.countedAt);
      if (world.label.holder.counted) credit(world, world.label.holder, 'self', day);
      return { result: 'self', prev };
    }
    return { result: null, prev };
  }
  if (meta.q > h.q + EPS) {
    L.log.push({ ...h, until: day });
    setHolder(world, meta, day, 'swap', true);
    credit(world, world.label.holder, 'swap', day);
    return { result: 'swap', prev };
  }
  // 挡住挑战才算数：主线、1 分内、完整血统里没有持有者。
  if (!h.counted && main && meta.q >= h.q - DEFEND_NEAR && !(meta.kin || []).includes(h.org)) {
    h.counted = true;
    h.countedAt = day;
    credit(world, h, 'defend', day);
    return { result: 'defend', prev };
  }
  return { result: null, prev };
}

// 稳坐（M.3.4 第 5 条）：持有者领先“别家最强和学界最强中较高者”≥ FILL_LEAD，连续 STEADY 天也算炼出。
export function steadyCheck(world, day = world.day) {
  const L = world.label, h = L.holder;
  if (!h || h.counted) { L.steadySince = null; return null; }
  if (h.q - bestOther(world, h.org, day) < FILL) { L.steadySince = null; return null; }
  L.steadySince ??= day;
  if (daysBetween(L.steadySince, day) < STEADY) return null;
  h.counted = true;
  h.countedAt = day;
  credit(world, h, 'steady', day);
  L.log.push({ ...h, via: 'steady', until: null });
  return 'steady';
}

// 把世界账本投回某家的 s.sota（M.3.1 的镜像）：本家持标 by='me'、id 写快照 id；别家持标 by 写公司 id、id 写 relId。
export function projectSota(world, org, s) {
  if (!s) return null;
  if (!s.sota) s.sota = { holder: null, field: [], log: [], made: [], before: false, seed: null, kin: null };
  const so = s.sota;
  const h = world.label.holder;
  so.holder = h ? {
    by: h.org === org ? 'me' : h.org,
    org: h.org,
    id: h.org === org ? h.modelId : h.relId,
    name: h.name,
    q: h.q,
    since: h.since,
    via: h.via,
    counted: h.counted,
    countedAt: h.countedAt ?? null,
  } : null;
  so.field = [...world.label.field];
  so.made = (world.label.made[org] || []).map(x => ({ modelId: x.modelId, day: x.day, q: x.q, via: x.via }));
  return so;
}

// 行业第一次（M.3.10）：收盘时按当天 q 从高到低的顺序登记；学界不登记（isNpc）。
// 返回这次新记下的 [{ id, org, relId }]。
export function registerFirsts(world, fresh, day = world.day) {
  const out = [];
  const firsts = MILESTONES.filter(ms => ms.type === 'first' && ms.rival && msMods(ms).includes(world.mod));
  for (const { c, rel, meta } of fresh) {
    if (!c) continue;
    for (const ms of firsts) {
      if (world.ms[ms.id]) continue;
      if (!rivalMatch(c.s, ms, rel, meta.day)) continue;
      world.ms[ms.id] = { org: c.id, relId: meta.relId, day: meta.day };
      out.push({ id: ms.id, org: c.id, relId: meta.relId });
    }
  }
  return out;
}

// 镜像里的 s.ms：照抄世界账本里的行业第一次（本家的 who 写 'me'）；公司自己的里程碑保留。
export function projectFirsts(world, org, s) {
  for (const [id, x] of Object.entries(world.ms || {})) {
    if (id.startsWith('__npc:')) continue;
    const prev = s.ms?.[id];
    if (prev && prev.who === 'me') continue;
    const meta = world.relMeta?.[x.relId];
    s.ms = s.ms || {};
    s.ms[id] = { who: x.org === org ? 'me' : FAMILIES[x.org]?.name || x.org, day: x.day, model: meta?.name || null, modelId: meta?.modelId ?? null, open: !!meta?.open };
  }
}
