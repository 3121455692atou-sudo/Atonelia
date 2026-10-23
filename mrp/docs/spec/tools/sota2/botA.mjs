// 表 9：用真实 career_bot（只读 import，不改项目文件）跑每个公司×剧本的第一年，按 D6.2 公式算冲顶力 A 和贴线速度 F。
// node botA.mjs        → 分组汇总；node botA.mjs full → 另附 96 行明细
// 变体“补数据”：模拟 A10 新增的机器人规则——★ 公司把 Q 计入的各类后训练数据补到 2 档（只买 licensed / permissive，每周最多一单）。
import { playGame } from '/Users/mac/model-raising-plan/tests/helpers/career_bot.mjs';
import * as E from '/Users/mac/model-raising-plan/src/career/engine.js';
import { trainFlops } from '/Users/mac/model-raising-plan/src/career/sim/model.js';
import { COMPANIES, DIRECTIONS } from '/Users/mac/model-raising-plan/src/career/data/core.js';
import { DATASETS } from '/Users/mac/model-raising-plan/src/career/data/datasets.js';
import { EFFORT, CURVE, Q_W, clamp, rhoOf, SOTA_EASE } from './curve.mjs';
import { seedCell, SCEN } from './data.mjs';
const lerpYear = (tab, y) => { const i = clamp(Math.floor(y), 2023, 2026); return tab[i] + (tab[i + 1] - tab[i]) * clamp(y - i, 0, 1); };
const catOf = mod => Object.fromEntries(DIRECTIONS[mod].filter(d => d.main).map(d => [d.main, d.data]));
const EASEX = { '★': SOTA_EASE.maker, '○': SOTA_EASE.kin, '—': SOTA_EASE.rookie };
function A_of(s) {
  const mod = s.mod, ref = mod === 'llm' ? 'llm' : 'other', y = Number(s.date.slice(0, 4)) + (Number(s.date.slice(5, 7)) - 1) / 12;
  const fComp = clamp(Math.sqrt(trainFlops(s) * (s.project ? 0.25 : 1) / (lerpYear(EFFORT.TRAIN_REF[ref], y) * 1e21)), ...EFFORT.COMP);
  const cat = catOf(mod);
  const fData = clamp(Object.entries(Q_W[mod]).reduce((a, [k, w]) => a + w * (s.data.post?.[cat[k]] ?? 0), 0) / 2, ...EFFORT.DATA);
  const fKnow = clamp(s.know / lerpYear(EFFORT.KNOW_REF[ref], y), ...EFFORT.KNOW);
  return { A: Math.min(CURVE.A_MAX, fComp * fData * fKnow), fComp, fData, fKnow };
}
const F_of = (A, rho) => Math.min(CURVE.F_MAX, CURVE.F0 * rho * clamp((A - CURVE.A0) / (1 - CURVE.A0), 0, CURVE.A_MAX));
const med = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
function topUp(s) {
  if (s.orders?.some(o => o.kind === 'data')) return;
  const cat = catOf(s.mod), need = new Set(Object.keys(Q_W[s.mod]).map(k => cat[k]).filter(c => (s.data.post?.[c] ?? 0) < 2));
  const ds = DATASETS.find(d => d.mod === s.mod && d.kind === 'post' && ['licensed', 'permissive'].includes(d.rights) && d.cost < s.cash * 0.15
    && E.datasetAvailable(s, d).ok && Object.keys(d.posts || {}).some(c => need.has(c)));
  if (ds) { try { E.decide(s, 'data', { id: ds.id }); } catch { /* 买不了就算了 */ } }
}
function one(c, sc, extra) {
  const samples = []; let d0 = null;
  try {
    playGame(c.id, sc, 1, { onWeek: s => { if (extra) topUp(s); const dd = Math.round(Date.parse(s.day) / 864e5); d0 ??= dd; const t = dd - d0; samples.push({ t, ...A_of(s) }); if (t > 365) throw 'stop'; } });
  } catch (e) { if (e !== 'stop') throw e; }
  return samples;
}
const group = (c, mark) => {
  if (c.tier === 'small') return '小团队（small）';
  if (mark === '★') return c.modality !== 'llm' ? '★·非 LLM' : c.tier === 'frontier' ? '★·LLM·frontier' : '★·LLM·非 frontier（grok y2026）';
  if (c.modality !== 'llm') return '—·非 LLM（suno、elevenlabs y2023）';
  return c.tier === 'frontier' ? '○/—·LLM·frontier' : `○/—·LLM·${c.tier}`;
};
const full = process.argv[2] === 'full', rows = [], groups = {};
for (const c of COMPANIES) for (const sc of Object.keys(SCEN)) {
  const mark = seedCell(c, SCEN[sc]).mark, rho = rhoOf(EASEX[mark]);
  const base = one(c, sc, false), mA = med(base.map(x => x.A));
  const tu = mark === '★' ? one(c, sc, true) : null, mAt = tu ? med(tu.map(x => x.A)) : null;
  const at = (smp, t) => smp.reduce((b, x) => (Math.abs(x.t - t) < Math.abs(b.t - t) ? x : b), smp[0]);
  rows.push(`| ${c.id} | ${c.tier} | ${sc} | ${mark} | ${at(base, 0).A.toFixed(2)} | ${at(base, 180).A.toFixed(2)} | ${at(base, 365).A.toFixed(2)} | ${mA.toFixed(2)} | ${F_of(mA, rho).toFixed(2)} | ${tu ? `${mAt.toFixed(2)} / ${F_of(mAt, rho).toFixed(2)}` : '—'} |`);
  const g = group(c, mark); (groups[g] ??= []).push({ A: mA, F: F_of(mA, rho), At: mAt, Ft: mAt === null ? null : F_of(mAt, rho), id: `${c.id} ${sc}` });
}
console.log('## 表9 真实机器人第一年的冲顶力（一年内每周采样取中位；补数据 = A10 新增的 ★ 机器人规则）');
console.log('| 分组 | 局数 | A 中位（最低–最高） | F 中位 | F = 0 的局 | 补数据后 A 中位 | 补数据后 F 中位 | 补数据后 F = 0 的局 |');
console.log('|---|---|---|---|---|---|---|---|');
for (const [g, xs] of Object.entries(groups)) {
  const t = xs.filter(x => x.At !== null);
  console.log(`| ${g} | ${xs.length} | ${med(xs.map(x => x.A)).toFixed(2)}（${Math.min(...xs.map(x => x.A)).toFixed(2)}–${Math.max(...xs.map(x => x.A)).toFixed(2)}） | ${med(xs.map(x => x.F)).toFixed(2)} | ${xs.filter(x => x.F === 0).length} | ${t.length ? med(t.map(x => x.At)).toFixed(2) : '—'} | ${t.length ? med(t.map(x => x.Ft)).toFixed(2) : '—'} | ${t.length ? t.filter(x => x.Ft === 0).length : '—'} |`);
}
if (full) { console.log('\n| 公司 | 档 | 剧本 | 播种 | 第 1 周 A | 第 180 天 A | 第 365 天 A | 一年中位 A | 一年中位 F | 补数据后 A / F |\n|---|---|---|---|---|---|---|---|---|---|'); console.log(rows.join('\n')); }
