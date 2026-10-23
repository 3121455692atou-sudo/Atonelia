// 世界发布表的追加（规格 M.3.2、M.3.3）：只追加；换掉 setReleases 的数组身份，现有缓存自动失效。
import { RELEASES, relId, setReleases } from '../data/rivals.js';
import { RELEASE_DAYS_OVERRIDES } from '../data/release_days_overrides.js';
import { dimKeys } from '../data/core.js';
import { BENCH_BY_ID } from '../data/benchmarks.js';
import { rivalScore } from '../sim/model.js';
import { qOf } from '../sim/sota.js';

const r1 = x => Math.round(x * 10) / 10;
export const normName = n => String(n ?? '').normalize('NFKC').toLowerCase().replace(/（.*?）|\(.*?\)/g, '').replace(/[\s\-_·.]/g, '');

// 发布行标签（M.3.3）：许可、学界、推理、MoE、长上下文、万亿参数、小模型。
export function tagsOf(m, org) {
  const tags = [];
  if (m.open) tags.push(m.license === 'restrictive' ? 'LR' : 'LP');
  if (org === 'academia') tags.push('A');
  const techs = m.techs || [];
  if (techs.includes('reasoning')) tags.push('R');
  if (techs.includes('moe')) tags.push('E');
  if (techs.includes('long_ctx')) tags.push('C');
  if ((m.total || 0) >= 1000) tags.push('T');
  if (m.role === 'small') tags.push('S');
  return tags.join(',');
}

// 追加一行。row：{ family, org?, modelId, date, day, name, cls, open, price, tags?, dims, q?, kin?, techs?, license?, seq? }
export function appendRelease(world, row) {
  const id = relId(row.name);
  if (world.relIds?.[id]) throw new Error(`名字撞了：${row.name}`);
  const vals = dimKeys('llm').map(k => r1(row.dims?.[k] ?? 0));
  // setReleases 按名字生成 id、按名字查发布日；这里把这个模型真正的发布日写进覆盖表。
  RELEASE_DAYS_OVERRIDES[row.name] = { day: row.day };
  world.rels.push([
    row.family, row.date, row.name, row.cls || 'mid', row.open ? 1 : 0, vals, row.price || 'standard', row.tags ?? tagsOf(row, row.family),
  ]);
  setReleases(world.rels);
  const rel = RELEASES.find(r => r.id === id);
  if (!rel) throw new Error(`追加发布失败：${row.name}`);
  const meta = {
    org: row.family === 'academia' ? 'academia' : (row.org ?? row.family),
    relId: rel.id,
    modelId: row.modelId ?? null,
    name: row.name,
    q: Number.isFinite(row.q) ? row.q : 0,
    dims: { ...row.dims },
    day: row.day,
    date: row.date,
    open: !!row.open,
    license: row.license ?? null,
    kin: [...(row.kin || [])],
    techs: [...(row.techs || [])],
    cls: row.cls || 'mid',
    seq: row.seq ?? ++world.relSeq,
    bench: {},
  };
  world.relMeta[rel.id] = meta;
  world.relIds[rel.id] = meta.org;
  world.names[normName(row.name)] = { org: meta.org, relId: rel.id };
  // 发布那天打的分：所有人看到同一个数（M.3.3）。
  for (const b of ['arena', 'mmlu']) {
    if (BENCH_BY_ID[b] && BENCH_BY_ID[b].from <= rel.date) meta.bench[b] = Math.round(rivalScore(BENCH_BY_ID[b], rel, rel.date) * 10) / 10;
  }
  return { rel, meta };
}

// 一款公司快照的发布行（M.3.3）。tags 从快照推出来，这样别家的发布也能触发行业第一次。
export function rowForModel(org, m, { day, date, kin = [], seq } = {}) {
  return {
    family: org, org, modelId: m.id, date: date ?? day.slice(0, 7), day,
    name: m.name, cls: m.cls || 'mid', open: !!m.open, price: m.price || 'standard',
    tags: tagsOf(m, org), dims: m.dims, q: qOf('llm', m.dims), kin, techs: m.techs || [], license: m.license ?? null, seq,
  };
}
