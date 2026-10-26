// 蒸馏上限、蒸馏小模型、生成订单（规格 D7、D8、D9 第 1、2、4、5、7、8、9、10、13、14 条，P1.2），
// 以及审查报告 v0.9-audit §3.4（蒸馏）里每一个复现用例。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as E from '../../src/career/engine.js';
import { DATASETS } from '../../src/career/data/datasets.js';
import { COMPANIES } from '../../src/career/data/core.js';
import { RELEASES } from '../../src/career/data/rivals.js';
import { MS_BY_ID } from '../../src/career/data/milestones.js';
import { histInfo } from '../../src/career/data/history.js';
import { APPROACH, OWN_EDGE, DISTILL_HEAVY, GEN, BEYOND, SYNTH_TAINT, kcapOffset } from '../../src/career/data/balance.js';
import {
  workingModel, liveModel, smallWorking, postPreview, applyGains, computeCaps, effectiveCaps, taintCaps, hardness, previewDistill, distillBaseline, knowledgeCap,
  gpuAllocation, trainFlops, genPlan, HEADROOM, isTainted, teacherRec, distillLevels,
} from '../../src/career/sim/model.js';
import { applyDistill, dropDistill, normalizeDistill } from '../../src/career/sim/data_ops.js';
import { genProgress as genFrac, dailyOrders } from '../../src/career/sim/orders.js';
import { newModel } from '../../src/career/sim/projects.js';
import { playerMatch } from '../../src/career/sim/milestones.js';

import { DAY } from '../../src/career/sim/loop.js';
import { worldSota, sotaAt, qOf, relDims, familyBest, Q_W, gapOf } from '../../src/career/sim/sota.js';
import { addDays } from '../../src/career/sim/clock.js';
import { advance, resolveAll } from '../helpers/career_bot.mjs';
import { clone, loadSave, baseJob } from '../helpers/career_util.mjs';
import { dailyFocus, projectTick, startFinetune } from '../helpers/legacy_jobs.mjs';
import * as L from '../helpers/legacy_jobs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fresh = (c, sc, seed = 1) => { const s = E.createGame(c, sc, seed); resolveAll(s); return s; };
const rel = name => RELEASES.find(r => r.name === name);
const QK = Object.keys(Q_W.llm);
const LLM_CATS = ['chat', 'knowledge', 'code', 'math', 'agent'];
const lic = r => (r.tags || []).find(t => ['LP', 'LR', 'LN'].includes(t)) || null;
// 按真实的入库函数收一份蒸馏数据：老师是对手表里的某一款（当天的玩家视角能力），levels：{ 类别: 等级 }。
function receive(s, name, levels) {
  const r = rel(name);
  applyDistill(s, { kind: 'distill', ref: `distill:${r.family}`, name: `蒸馏 ${r.name}`, teacher: r.family, open: r.open, posts: { ...levels },
    teacherDims: { ...relDims(s, r) }, gen: { mode: r.open ? 'gpu' : 'api' }, teacherName: r.name, relId: r.id, license: r.open ? lic(r) : null });
  return r;
}
// 在练模型的上限抬高一截（不让自研上限先卡住，才看得到老师的天花板）。
function raiseCaps(m, by = 25) { for (const k of QK) m.base[k] += by; m.kcap = null; m.capTechs = []; }
// 每周挑一次综合涨得最多的方向，每天推进（真实时间，对手照常发布）。
function bestDir(s) {
  let best = null, bv = -Infinity;
  for (const d of E.directionsFor(s)) {
    if (d.key === 'safety') continue;
    const p = postPreview(s, d.key);
    if (!p) continue;
    const v = Object.entries(p.gains).reduce((a, [k, x]) => a + (Q_W.llm[k] || 0) * x, 0);
    if (v > bv) { bv = v; best = d.key; }
  }
  return best;
}
function trainDays(s, n, each = () => {}) {
  for (let d = 0; d < n && s.status === 'playing'; d++) {
    if (d % 7 === 0) { const dir = bestDir(s); if (dir) L.decide(s, 'train', { dir }); }
    s.health = Math.max(s.health, 60);
    advance(s, 1);
    each(d);
  }
}
// 被污染模型的整体上限：min(它的老师们里最高的 q, 当前最强) − APPROACH。
function capOf(s, m) {
  const tq = Math.max(...Object.keys(m.post.teachers).map(f => teacherRec(s, f)?.q ?? -Infinity));
  return Math.min(tq, worldSota(s)?.q ?? Infinity) - APPROACH;
}

describe('D9 第 1、2、4 条：被污染模型的上限；数据和老师', () => {
  it('1. 单一老师练 400 天：被污染以后每天 q ≤ min(老师, 当前最强) − APPROACH（只会无限逼近）', () => {
    const s = fresh('rwkv', 'y2025');
    const w = workingModel(s);
    raiseCaps(w);
    const t = receive(s, 'DeepSeek-V3', Object.fromEntries(LLM_CATS.map(c => [c, 2.5])));
    // 从老师下面 4 分起练，400 天里看得到“贴上去”。
    for (const k of QK) w.dims[k] = Math.max(0, relDims(s, t)[k] - 4);
    let tainted = 0, closest = Infinity;
    trainDays(s, 400, () => {
      if (workingModel(s) !== w || !isTainted(w)) return;
      tainted++;
      const cap = capOf(s, w), q = qOf('llm', w.dims);
      assert.ok(q <= cap + 1e-9, `${s.day} q ${q} > ${cap}`);
      closest = Math.min(closest, cap - q);
    });
    assert.ok(tainted > 300, `被污染的天数 ${tainted}`);
    assert.ok(closest < 1.5, `贴近上限（最近差 ${closest}，在蒸馏那一份的收口区里）`);
  });

  it('2. o1、R1、Claude 3.5 Sonnet（新版）三位老师混合：q < 三人里最高的 q − APPROACH；各维也不超过老师 − APPROACH + ownEdge（审计 §3.4“几个老师拼出更强的”“上限可以超过老师”）', () => {
    const s = fresh('mistral', 'y2025');
    advance(s, 30);
    const w = workingModel(s);
    raiseCaps(w);
    const ts = [receive(s, 'o1', { math: 2.5, code: 1 }), receive(s, 'DeepSeek-R1', { code: 1.5, agent: 1.2 }), receive(s, 'Claude 3.5 Sonnet（新版）', { chat: 2.5, knowledge: 2.5 })];
    const top = Math.max(...ts.map(r => qOf('llm', relDims(s, r))));
    assert.ok(Math.abs(top - qOf('llm', rel('o1').dims)) < 1e-9);
    const start = clone(w.dims);
    trainDays(s, 400, () => {
      if (workingModel(s) !== w || !isTainted(w)) return;
      assert.ok(qOf('llm', w.dims) < top - APPROACH + 1e-9, `${s.day} ${qOf('llm', w.dims)}`);
      const tc = taintCaps(s, w);
      for (const k of QK) {
        const T = Math.max(...ts.map(r => relDims(s, r)[k]));
        const edge = OWN_EDGE * Math.min(1, (s.data.post[k === 'writing' ? 'chat' : k] || 0) / 2.5);
        assert.ok(w.dims[k] <= Math.max(start[k], T - APPROACH + edge) + 1e-9, `${s.day} ${k} ${w.dims[k]} 老师最高 ${T}`);
        assert.ok(tc.caps[k] <= T - APPROACH + edge + 1e-9);
      }
    });
    assert.ok(isTainted(w));
    assert.deepEqual(Object.keys(w.post.teachers).sort(), ['claude', 'deepseek_pro', 'gpt']);
  });

  it('4a. 买到同档的自有数据以后，上限不会消失（审计 §3.4“二选一逻辑漏洞”）', () => {
    const s = fresh('rwkv', 'y2025');
    const w = workingModel(s);
    raiseCaps(w);
    receive(s, 'DeepSeek-V3', Object.fromEntries(LLM_CATS.map(c => [c, 2.5])));
    trainDays(s, 90);
    assert.ok(isTainted(w));
    for (const c of LLM_CATS) s.data.post[c] = 2.5;
    trainDays(s, 200, () => { if (workingModel(s) === w) assert.ok(qOf('llm', w.dims) <= capOf(s, w) + 1e-9, s.day); });
  });

  it('4b. 没被污染时弱老师的数据不会卡死模型：蒸馏那一份在 qCapD 前收口，自有那一份照常涨（Gemini y2025 的复现：知识月涨幅不再降到 0）', () => {
    const s = fresh('gemini', 'y2025');
    const w = workingModel(s);
    s.data.post.knowledge = 1;
    receive(s, 'Mistral Large 2', { knowledge: 1 });
    assert.ok(qOf('llm', relDims(s, rel('Mistral Large 2'))) < qOf('llm', w.dims), '老师比自己弱');
    // 第一次用比自己弱的老师之前要确认（D7）：确认之前它的数据不计入 σ，等于只用自有数据。
    const held = postPreview(s, 'knowledge');
    assert.deepEqual([held.sigma, held.held], [0, ['mistral']]);
    L.decide(s, 'data', { id: 'use:mistral' });
    assert.equal(w.weakOk.mistral, s.day);
    assert.throws(() => L.decide(s, 'data', { id: 'use:mistral' }), /不用确认/);
    const mixed = postPreview(s, 'knowledge');
    assert.deepEqual(mixed.held, []);
    // 同样的局面只用自有数据（σ = 0）：对照。
    E.setOwnOnly(s, true);
    const own = postPreview(s, 'knowledge');
    s.data.post.knowledge = 0;
    const pure = postPreview(s, 'knowledge');
    E.setOwnOnly(s, false);
    assert.equal(mixed.sigma, 0.5);
    assert.equal(mixed.fade, 0);
    assert.ok(pure.gains.knowledge > 0 && mixed.gains.knowledge > 0, '没被卡死');
    assert.ok(Math.abs(mixed.gains.knowledge - 0.5 * own.gains.knowledge) < 1e-9, '越过老师以后只剩自有那一份：(1 − σ) 倍');
    assert.ok(Math.abs(held.gains.knowledge - own.gains.knowledge) < 1e-9, '确认之前和只用自有数据一样');
    // 越线以后蒸馏那一份一分没贡献，m.post 也一分不记，练多久都不会因为它被污染。
    assert.equal(mixed.dshare.knowledge, 0);
    L.setFocus(s, { kind: 'train', dir: 'knowledge' });
    for (let i = 0; i < 300; i++) { s.health = 100; dailyFocus(s, { notes: [] }); }
    assert.deepEqual([w.post.dist, isTainted(w)], [0, false]);
  });

  it('4c. 新底座出生后比池子里旧蒸馏数据的老师强：不经确认不用它，训练 365 天不会被它静默冻住（审计 §3.4“旧上限会一直卡住新底座”）', () => {
    const s = fresh('qwen', 'y2025');
    const t = receive(s, 'Llama 3.1 405B', { knowledge: 1.2, chat: 1.2 });
    const tq = qOf('llm', relDims(s, t));
    if (baseJob(s)) E.cancelJob(s, baseJob(s).id);
    s.gpus.owned = { H100: 100000 };
    s.data.pool.tokens *= 3;
    s.data.pool.qw *= 3.6;
    const cfg = { total: 1000, active: 50, arch: 'moe', tokens: Math.min(40, Math.floor(E.poolStats(s).tokens * 4)) };
    L.startProject(s, cfg);
    L.decide(s, 'maintain');
    for (let i = 0; i < 400 && E.hasBaseJob(s); i++) { resolveAll(s); s.health = 100; advance(s, 1); }
    const m = workingModel(s);
    assert.ok(!E.hasBaseJob(s) && m.stage === 'post');
    const q0 = qOf('llm', m.dims);
    assert.ok(q0 > tq, `新底座 ${q0} 比老师 ${tq} 强`);
    assert.deepEqual(postPreview(s, 'knowledge').held, ['llama']);
    for (let d = 0; d < 365 && workingModel(s) === m; d++) {
      s.queue = [];
      if (d % 7 === 0) L.decide(s, 'train', { dir: (d / 7) % 2 ? 'knowledge' : 'writing' });
      s.health = 100;
      E.tickDay(s);
      s.queue = [];
      assert.equal(isTainted(m), false, s.day);
    }
    assert.equal(workingModel(s), m);
    assert.ok(qOf('llm', m.dims) > q0 + 1, `一年涨了 ${qOf('llm', m.dims) - q0}`);
    assert.equal(m.post.dist, 0);
  });
});

describe('D9 第 10 条：掺蒸馏但没被污染', () => {
  // 时间冻结、在练模型已经越过锚点，老师是当前最强（fade = 0）。
  function above(ownLv, distLv) {
    const s = fresh('jev', 'y2025');
    s.gpus = { owned: { H100: 60000 }, rented: {} };
    s.know = 300;
    s.data.post = Object.fromEntries([...LLM_CATS, 'safety'].map(c => [c, ownLv]));
    const env = E.worldSota(s).dims;
    const m = newModel(s, { total: 70, active: 70, arch: 'dense' }, { stage: 'post' });
    m.dims = Object.fromEntries(Object.entries(env).map(([k, v]) => [k, k === 'safety' ? 60 : v + 0.5]));
    m.base = Object.fromEntries(Object.entries(env).map(([k, v]) => [k, v + 12 - (HEADROOM.llm[k] || 8)]));
    m.kcap = null;
    s.models.push(m);
    s.working = m.id;
    s.sota.before = true;
    // 老师（当前最强）比这一代弱：确认过“照样用它”（D7），才有 σ。
    if (distLv) { const r = receive(s, worldSota(s).rel.name, Object.fromEntries(LLM_CATS.map(c => [c, distLv]))); L.decide(s, 'data', { id: `use:${r.family}` }); }
    return s;
  }
  const qGain = p => Object.entries(p.gains).reduce((a, [k, v]) => a + (Q_W.llm[k] || 0) * v, 0);
  it('σ = 0.5、q ≥ 锚点且 fade = 0 以后，每日涨幅 ≤ 同条件纯自研的 (1 − σ) 倍；σ < DISTILL_HEAVY 时越线后的日涨幅 ≤ 纯自研', () => {
    for (const [o, d] of [[1.25, 1.25], [2.25, 0.2]]) {
      const pure = above(o + d, 0), mixed = above(o, d);
      const h = hardness(mixed);
      assert.ok(h.delta >= 0, `越过锚点 δ=${h.delta}`);
      for (const dir of ['writing', 'code', 'math', 'knowledge']) {
        const a = postPreview(pure, dir), b = postPreview(mixed, dir);
        assert.equal(b.fade, 0);
        const sigma = b.sigma;
        if (o === d) assert.equal(sigma, 0.5);
        else assert.ok(sigma < DISTILL_HEAVY);
        // 纯自研：同样多的数据全是自有的（levelMult 相同），所以“同条件纯自研”就是 a。
        assert.ok(qGain(b) <= (1 - sigma) * qGain(a) + 1e-9, `${dir} σ=${sigma} ${qGain(b)} > ${(1 - sigma) * qGain(a)}`);
        assert.ok(qGain(b) <= qGain(a) + 1e-9);
      }
    }
  });

  it('领先的模型永远不会在 q > 当前最强 − APPROACH 时变成被污染：蒸馏那一份按实际贡献记 m.post，越线以后一分不记（σ = 0.5，确认过的老师，练 2000 天）', () => {
    const s = above(1, 1);
    const m = workingModel(s);
    const ws = worldSota(s).q;
    assert.ok(qOf('llm', m.dims) > ws);
    for (let d = 0; d < 2000; d++) {
      L.setFocus(s, { kind: 'train', dir: ['knowledge', 'code', 'math', 'writing'][d % 4] });
      s.health = 100;
      dailyFocus(s, { notes: [] });
      assert.equal(isTainted(m), false, `第 ${d} 天 q ${qOf('llm', m.dims)}`);
    }
    assert.deepEqual([m.post.dist, m.post.teachers], [0, {}]);
    assert.ok(m.post.own > 1, '自有那一份照常涨');
  });

  it('被污染的那一步就按污染上限钳住：从差很多起掺当前最强的数据，变成被污染的那天 q < qCapD ≤ 当前最强 − APPROACH，之后每天 q < qCap', () => {
    const s = fresh('rwkv', 'y2025');
    const w = workingModel(s);
    raiseCaps(w);
    const ws = worldSota(s);
    receive(s, ws.rel.name, Object.fromEntries(LLM_CATS.map(c => [c, 2.5])));
    for (const k of QK) w.dims[k] = Math.max(0, ws.dims[k] - 3);
    let first = null;
    for (let d = 0; d < 400; d++) {
      L.setFocus(s, { kind: 'train', dir: ['knowledge', 'code', 'math', 'writing'][d % 4] });
      s.health = 100;
      const was = isTainted(w);
      dailyFocus(s, { notes: [] });
      if (!isTainted(w)) continue;
      const cap = taintCaps(s, w).qCap;
      assert.ok(cap <= ws.q - APPROACH + 1e-9);
      assert.ok(qOf('llm', w.dims) <= cap + 1e-9, `第 ${d} 天 q ${qOf('llm', w.dims)} > qCap ${cap}`);
      if (!was) first ??= d;
    }
    assert.ok(first !== null, '掺得多，确实被污染了');
  });
});

describe('D9 第 5 条：蒸馏小模型', () => {
  it('别家老师蒸出来的小模型：teacher 有值、被污染、能拿“站在开源模型的肩膀上”，不算“从零训练”（审计 §3.4“newModel 丢掉 teacher”）', () => {
    const s = fresh('perplexity', 'y2025');
    const t = E.distillTeachers(s).find(x => !x.own);
    L.decide(s, 'maintain');
    L.startDistill(s, { teacher: t.id, total: 8, active: 8, arch: 'dense', tokens: 1.5 });
    for (let i = 0; i < 400 && E.hasBaseJob(s); i++) advance(s, 1);
    const m = smallWorking(s);
    assert.ok(m && Object.keys(m.dims).length >= 5 && Object.values(m.dims).every(Number.isFinite));
    assert.deepEqual([m.teacher, m.origin, m.tainted, m.post.teachers], [t.id, 'distill', true, { [t.id]: 1 }]);
    assert.ok(teacherRec(s, t.id), '老师快照记下了');
    assert.equal(playerMatch(s, MS_BY_ID.ms_on_shoulders, { on: 'release', model: m }), true);
    assert.equal(playerMatch(s, MS_BY_ID.ms_from_scratch, { on: 'release', model: m }), false);
  });

  it('每维不超过 knowledgeCap + kcapOffset(k)；整体不超过 min(老师, 当前最强) − 2.5；token 越多差距越小；学生激活比老师大时差距也不再固定为 3', () => {
    const s = fresh('qwen', 'y2025');
    const t = E.distillTeachers(s).find(x => !x.own);
    for (const [total, active, tokens] of [[1.5, 1.5, 0.5], [7, 7, 1.5], [14, 14, 4], [32, 32, 12], [120, 12, 2]]) {
      const pv = previewDistill(s, { teacher: t.id, total, active, arch: active < total ? 'moe' : 'dense', tokens });
      for (const [k, v] of Object.entries(pv.dims)) if (k !== 'safety') assert.ok(v <= pv.kcap + kcapOffset(k) + 1e-9, `${total}B ${k}`);
      assert.ok(qOf('llm', pv.dims) <= Math.min(qOf('llm', t.dims), worldSota(s).q) - 2.5 + 1e-9);
    }
    const few = previewDistill(s, { teacher: t.id, total: 7, active: 7, tokens: 0.5 }), many = previewDistill(s, { teacher: t.id, total: 7, active: 7, tokens: 8 });
    assert.ok(many.gap < few.gap && qOf('llm', many.dims) > qOf('llm', few.dims), '多练 token 学生更强（原来 token 只影响成本）');
    // 671B/A37B 的学生从 R1 蒸：差距按等效参数算（不再固定 3），工期不少于 7 天，算力按 6·A学生 + 2·A老师。
    const r1 = { id: 'deepseek_pro', name: 'DeepSeek-R1', dims: { ...rel('DeepSeek-R1').dims }, total: 671, active: 37, arch: 'moe', open: true, own: false };
    const big = previewDistill(s, { teacher: 'deepseek_pro', total: 671, active: 37, arch: 'moe', tokens: 1.5 }, { teacher: r1 });
    assert.ok(big.gap >= 2.5 && big.days >= 7);
    assert.ok(Math.abs(big.need / ((6 * 37 + 2 * 37) * 1e9 * 1.5e12) - 1) < 1e-12);
  });

  it('previewDistill(s, cfg, { quality: 1 }) 下 7B 的 q ≤ 73.5 + 0.1；32B 约 80.8', () => {
    const s = fresh('qwen', 'y2026');
    const t = { id: 'x', name: '满分老师', dims: Object.fromEntries([...QK, 'safety'].map(k => [k, 99])), total: 2000, active: 100, open: true, own: false };
    const q7 = qOf('llm', previewDistill(s, { teacher: 'x', total: 7, active: 7, tokens: 15 }, { quality: 1, teacher: t }).dims);
    const q32 = qOf('llm', previewDistill(s, { teacher: 'x', total: 32, active: 32, tokens: 15 }, { quality: 1, teacher: t }).dims);
    assert.ok(q7 <= 73.6 && q7 > 73, `7B ${q7}`);
    assert.ok(Math.abs(q32 - 80.8) < 0.15, `32B ${q32}`);
  });

  it('distillBaseline：当天可见、许可 LP 或 LR 的最强开源发布当老师蒸一个同尺寸的；非语言模型、没有这样的老师时返回 null', () => {
    const s = fresh('qwen', 'y2026');
    const b7 = distillBaseline(s, { total: 7, active: 7, arch: 'dense' });
    assert.ok(Number.isFinite(b7) && b7 <= 73.6, `${b7}`);
    assert.ok(distillBaseline(s, { total: 32, active: 32, arch: 'dense' }) > b7);
    assert.equal(distillBaseline(fresh('suno', 'y2025'), { total: 1, active: 1 }), null);
    const g = fresh('gpt', 'y2023');
    assert.ok(!RELEASES.some(r => r.mod === 'llm' && r.open && r.day <= g.day && ['LP', 'LR'].includes(lic(r))), '2023 年初还没有可商用的开源模型');
    assert.equal(distillBaseline(g, { total: 7, active: 7 }), null);
  });
});

describe('D9 第 7、8 条：合成数据洗白；g_beyond 的试炼', () => {
  it('7. 用被污染的在线模型生成合成教材（占语料池 25% 以上），训出的新底座同样被污染、继承老师；在线模型干净时新底座干净', () => {
    for (const dirty of [true, false]) {
      const s = fresh('perplexity', 'y2025');
      if (baseJob(s)) E.cancelJob(s, baseJob(s).id);
      if (!s.techs.includes('textbook')) s.techs.push('textbook');
      const live = newModel(s, { total: 7, active: 7, arch: 'dense' }, { stage: 'released', role: 'flagship' });
      live.dims = { knowledge: 60, code: 50, math: 50, writing: 60, safety: 50, agent: 20 };
      Object.assign(live, { released: s.date, releasedDay: s.day, line: 'main' });
      if (dirty) { live.tainted = true; live.post.teachers = { deepseek_pro: 1 }; receive(s, 'DeepSeek-V3', { math: 0.1 }); }
      s.models.push(live);
      s.live = live.id;
      s.data.pool = { tokens: 0.9, qw: 1.2, mix: { web: 0.9 } };
      s.inferShare = 0.6;
      L.decide(s, 'data', { id: 'ds_synth_self' });
      for (let i = 0; i < 80 && s.orders.some(o => o.ref === 'ds_synth_self'); i++) advance(s, 1);
      assert.ok(!s.orders.some(o => o.ref === 'ds_synth_self'), '教材生成完了');
      assert.equal((s.data.pool.taintW || 0) / s.data.pool.tokens >= SYNTH_TAINT, dirty);
      L.startProject(s, { total: 7, active: 7, arch: 'dense', tokens: 1 });
      baseJob(s).pj.done = baseJob(s).pj.need;
      projectTick(s, { notes: [] }, DAY);
      const m = workingModel(s);
      assert.equal(m.tainted, dirty);
      assert.deepEqual(m.post.teachers, dirty ? { deepseek_pro: 1 } : {});
    }
  });

  it('7. 出生即被污染的新底座也钳在污染上限前（G1 遗留 #15）：GPT y2024 按自家史线的锚点出生会越过当前最强 − APPROACH，钳完 q ≤ qCap，base、kcap 不动', () => {
    // 构造夹具：老师是当前最强的 Gemini 1.0 Pro（API），语料池全部来自被它污染的模型；400B 稠密底座，质量 1.6。干净的对照组照常出生。
    const born = dirty => {
      const s = fresh('gpt', 'y2024');
      if (baseJob(s)) E.cancelJob(s, baseJob(s).id);
      const t = receive(s, 'Gemini 1.0 Pro', { math: 0.1 });
      s.gpus.owned = { H100: 200000 };
      const mix = { web: 0.5, code: 0.2, math: 0.2, books: 0.1 };
      s.data.pool = { tokens: 12, qw: 12 * 1.6, mix: { ...mix }, taintW: dirty ? 12 : 0, taintTeachers: dirty ? { [t.family]: 1 } : {} };
      L.startProject(s, { total: 400, active: 400, arch: 'dense', tokens: 12 });
      Object.assign(baseJob(s).pj, { done: baseJob(s).pj.need, acc: { w: 1, q: 1.6, effectiveQ: 1.6, repeat: 1, mix: { ...mix }, cn: 0 } });
      projectTick(s, { notes: [] }, DAY);
      return { s, m: workingModel(s), t };
    };
    const a = born(true), b = born(false);
    const ws = worldSota(a.s).q;
    assert.equal(qOf('llm', relDims(a.s, a.t)), ws, '老师就是当前最强');
    assert.ok(qOf('llm', b.m.dims) > ws - APPROACH + 1, `干净的对照组出生在当前最强 − APPROACH 之上（${qOf('llm', b.m.dims).toFixed(2)} 对 ${ws.toFixed(2)}），不钳就越线`);
    assert.equal(a.m.tainted, true);
    const tc = taintCaps(a.s, a.m);
    assert.ok(Math.abs(tc.qCap - (ws - APPROACH)) < 1e-9);
    assert.ok(qOf('llm', a.m.dims) <= tc.qCap, `出生 q ${qOf('llm', a.m.dims)} ≤ qCap ${tc.qCap}`);
    for (const [k, c] of Object.entries(tc.caps)) assert.ok(a.m.dims[k] <= Math.max(0, c) + 1e-9, `${k} 不超过污染上限`);
    for (const k of Object.keys(b.m.dims)) assert.ok(a.m.dims[k] <= b.m.dims[k] + 1e-9, `${k} 只往下钳`);
    assert.deepEqual([a.m.base, a.m.kcap], [b.m.base, b.m.kcap], 'base、kcap 不动');
  });

  it('旧上限不会卡住新底座：蒸馏过别家以后，新预训练出来的底座干净、上限只看自己（审计 §3.4）', () => {
    const s = fresh('rwkv', 'y2025');
    receive(s, 'DeepSeek-V3', Object.fromEntries(LLM_CATS.map(c => [c, 2.5])));
    trainDays(s, 60);
    assert.ok(isTainted(workingModel(s)));
    if (baseJob(s)) E.cancelJob(s, baseJob(s).id);
    L.startProject(s, { total: 14, active: 14, arch: 'dense', tokens: 1 });
    baseJob(s).pj.done = baseJob(s).pj.need;
    projectTick(s, { notes: [] }, DAY);
    const m = workingModel(s);
    assert.deepEqual([m.tainted, m.post.teachers], [false, {}]);
    assert.deepEqual(effectiveCaps(s, m), computeCaps(s, m));
  });

  it('8. g_beyond 的试炼：只用自有数据、不出 spike 练满 60 天解除污染（加特质和技术积累）；出 spike 清零；中途用了蒸馏数据作废', () => {
    const setup = () => {
      const s = fresh('rwkv', 'y2025');
      const w = workingModel(s);
      receive(s, 'DeepSeek-V3', { math: 2.5 });
      w.tainted = true;
      w.post.teachers = { deepseek_pro: 1 };
      E.applyEffects(s, { beyondTrial: true }, { source: 'strategy', id: 'g_beyond' });
      L.decide(s, 'train', { dir: 'math' });
      // 下面会把健康压到 0 来触发 spike：关掉自动检修，免得后训练被检修停下（T4.5）。
      s.jobs.autoRepair = false;
      return { s, w };
    };
    const day = s => { s.health = 100; dailyFocus(s, { notes: [] }); };
    // 满 60 天：只用自有数据。
    {
      const { s, w } = setup();
      E.setOwnOnly(s, true);
      const know = s.know;
      for (let i = 0; i < BEYOND.trialDays - 1; i++) day(s);
      assert.deepEqual([w.untainted, w.beyondTrial.clean], [undefined, BEYOND.trialDays - 1]);
      day(s);
      assert.equal(w.untainted, true);
      assert.equal(isTainted(w), false);
      assert.equal(w.beyondTrial, undefined);
      assert.ok(s.strategy.spirits.g_self_reliant);
      assert.equal(s.know, know + 30);
    }
    // 出 spike：清零。用注入的随机数（找一个让下一次掷骰落在失败区间的状态）。
    {
      const { s, w } = setup();
      E.setOwnOnly(s, true);
      w.beyondTrial.clean = 59;
      s.health = 0;
      const p = postPreview(s, 'math');
      let seed = 1;
      for (; seed < 1e6; seed++) { const t = { rng: seed }; if (E.util.rand(t) * 100 < p.fail * DAY) break; }
      s.rng = seed;
      dailyFocus(s, { notes: [] });
      assert.deepEqual([w.beyondTrial.clean, w.untainted, w.cleanStreak.math], [0, undefined, 0]);
    }
    // 中途用了蒸馏数据：作废。
    {
      const { s, w } = setup();
      w.beyondTrial.clean = 30;
      day(s);
      assert.equal(w.beyondTrial, undefined);
      assert.equal(isTainted(w), true);
    }
  });
});

describe('D9 第 14 条：自蒸馏继承污染', () => {
  function liveTainted(s) {
    const w = workingModel(s);
    raiseCaps(w);
    receive(s, 'DeepSeek-V3', Object.fromEntries(LLM_CATS.map(c => [c, 2.5])));
    trainDays(s, 90);
    assert.ok(isTainted(w), '在练模型被污染了');
    const snap = { ...clone(w), id: `${w.id}x`, stage: 'released', released: s.date, releasedDay: s.day, line: 'main' };
    s.models.push(snap);
    s.live = snap.id;
    return snap;
  }
  it('小团队先蒸馏别家、在线旗舰被污染，再自蒸馏 14B：学生被污染、老师们和老师一样；之后后训练 400 天每天 q ≤ min(继承老师的最高 q, 当前最强) − APPROACH', () => {
    const s = fresh('perplexity', 'y2025');
    const teacher = liveTainted(s);
    const chk = E.distillCheck(s, { teacher: 'self', total: 14, active: 14, arch: 'dense', tokens: 1.5 });
    assert.ok(chk.ok && /老师已被污染，学生同样被污染：这一代拿不到同类徽章，也超不过 \d+\.\d/.test(chk.warn), chk.warn);
    L.startDistill(s, { teacher: 'self', total: 14, active: 14, arch: 'dense', tokens: 1.5 });
    baseJob(s).pj.done = baseJob(s).pj.need;
    baseJob(s).pj.elapsedDays = 7;
    projectTick(s, { notes: [] }, DAY);
    const m = smallWorking(s);
    assert.deepEqual([m.teacher, m.tainted, m.post.teachers], ['self', true, teacher.post.teachers]);
    raiseCaps(m);
    for (let d = 0; d < 400; d++) {
      applyGains(s, m, Object.fromEntries(QK.map(k => [k, 0.4])), { preMixed: true });
      const cap = Math.min(Math.max(...Object.keys(teacher.post.teachers).map(f => teacherRec(s, f).q)), worldSota(s).q) - APPROACH;
      assert.ok(qOf('llm', m.dims) <= cap + 1e-9, `第 ${d} 天 ${qOf('llm', m.dims)} > ${cap}`);
      if (d % 20 === 19) advance(s, 20);
    }
  });

  it('老师是续训来的：学生带同一个续训谱系；对照：老师干净时学生干净', () => {
    for (const ft of [true, false]) {
      const s = fresh('qwen', 'y2025');
      const live = liveModel(s);
      if (ft) Object.assign(live, { lineage: { kind: 'finetune', relId: rel('Llama 3.1 405B').id, fam: 'llama' }, tainted: true, post: { own: 0, dist: 0, teachers: { llama: 1 } } });
      if (ft) receive(s, 'Llama 3.1 405B', { chat: 0.1 });
      L.decide(s, 'maintain');
      L.startDistill(s, { teacher: 'self', total: 7, active: 7, arch: 'dense', tokens: 1.5 });
      baseJob(s).pj.done = baseJob(s).pj.need;
      baseJob(s).pj.elapsedDays = 7;
      projectTick(s, { notes: [] }, DAY);
      const m = smallWorking(s);
      if (ft) assert.deepEqual([m.lineage, m.tainted, m.post.teachers], [{ kind: 'finetune', relId: rel('Llama 3.1 405B').id, fam: 'llama' }, true, { llama: 1 }]);
      else assert.deepEqual([m.lineage, m.tainted, m.post.teachers], [undefined, false, {}]);
    }
  });

  // P2.1 接上（原来是 P1.2 留的 todo）：命名不再读 m.lineage（C5 删掉了把它当史实型号名的旧命名），
  // 续训谱系 { kind: 'finetune', … } 只给污染和徽章用。续训模型、从它自蒸馏出的小模型都按建议名起名、发布。
  it('续训模型能发布：旗舰（续训来的）和从它自蒸馏出的小模型都能起名、发布，不抛错', () => {
    const s = fresh('qwen', 'y2025');
    if (baseJob(s)) E.cancelJob(s, baseJob(s).id);
    s.gpus.owned = { H100: 20000 };
    s.strategy.unlocks.adopt_open_base = s.day;
    const r = rel('Llama 3.1 405B');
    L.decide(s, 'maintain');
    startFinetune(s, { relId: r.id });
    baseJob(s).pj.done = baseJob(s).pj.need;
    projectTick(s, { notes: [] }, DAY);
    const m = workingModel(s);
    assert.equal(m.lineage?.kind, 'finetune');
    m.postMonths = 3;
    m.postDays = 60;
    s.deploy = [];
    s.queue = [];
    const snap = L.decide(s, 'release', { replace: true }).model;
    assert.ok(snap.lineage?.kind === 'finetune' && typeof snap.name === 'string' && E.validateModelName(s, snap.name, { modelId: snap.id }).ok, snap.name);
    // 灰度完、续训来的这一版成了在线旗舰，再拿它当老师自蒸馏一个小模型：学生带同一个谱系，也能起名、发布。
    advance(s, 20);
    s.queue = [];
    assert.equal(E.liveModel(s).id, snap.id);
    L.decide(s, 'maintain');
    L.startDistill(s, { teacher: 'self', total: 7, active: 7, arch: 'dense', tokens: 1.5 });
    baseJob(s).pj.done = baseJob(s).pj.need;
    baseJob(s).pj.elapsedDays = 7;
    projectTick(s, { notes: [] }, DAY);
    s.queue = [];
    const small = smallWorking(s);
    assert.equal(small.lineage?.kind, 'finetune');
    const rel2 = L.decide(s, 'release', { role: 'small' }).model;
    assert.ok(rel2 === small && typeof small.name === 'string' && small.name !== snap.name, small.name);
  });
});

describe('D9 第 13 条：蒸馏工期与生成订单', () => {
  it('蒸馏小模型的工期不少于 7 天；8B 学生 ← 37B 激活老师、1.5T，在小公司 2023（96 张 A100）上约 239 天；MoE 学生激活 ÷ 总参 < 1/50 时 distillCheck 拒绝', () => {
    const s = fresh('perplexity', 'y2023');
    assert.deepEqual(s.gpus.owned, { A100: 96 });
    const w = newModel(s, { total: 7, active: 7, arch: 'dense' }, { stage: 'post' });
    w.dims = { knowledge: 40, code: 30, math: 30, writing: 40, safety: 40, agent: 0 };
    w.base = { ...w.dims };
    s.models.push(w);
    s.working = w.id;
    L.decide(s, 'train', { dir: 'writing' });
    s.inferShare = 0.05;
    s.health = 100;
    const t = { id: 'x', name: '37B 激活的老师', dims: { ...rel('DeepSeek-V3').dims }, total: 671, active: 37, arch: 'moe', open: true, own: false };
    const pv = previewDistill(s, { teacher: 'x', total: 8, active: 8, tokens: 1.5 }, { teacher: t });
    // 75/25 分卡时约 239 天；P2.4a 起后训练吃饱以后多出来的卡回给蒸馏（T4.2），按蒸馏实际分到的份额折算。
    const share = E.allocJobs(s, { kind: 'distill', line: 'small', prio: 'high', pj: { type: 'distill', structure: pv.structure, need: pv.need, done: 0, minDays: pv.minDays, elapsedDays: 0, preview: { teacher: t } } }).extra.share;
    const expect = 239 * 0.75 / share;
    assert.ok(share > 0.75 && Math.abs(pv.days - expect) <= 0.1 * expect, `${pv.days} 天（份额 ${share}）`);
    const small = previewDistill(s, { teacher: 'x', total: 1.5, active: 1.5, tokens: 0.01 }, { teacher: t });
    assert.equal(small.days, 7);
    const q = fresh('qwen', 'y2026');
    assert.match(E.distillCheck(q, { teacher: 'self', total: 120, active: 2, arch: 'moe', tokens: 1.5 }).reason, /太稀疏/);
    assert.equal(E.distillCheck(q, { teacher: 'self', total: 120, active: 3, arch: 'moe', tokens: 1.5 }).ok, true);
  });

  it('生成订单让训练卡减少的天数为 0（几张单一起跑、暂停、恢复、取消，逐日对照“没有订单”的训练算力）', () => {
    const s = fresh('rwkv', 'y2025');
    if (!s.techs.includes('textbook')) s.techs.push('textbook');
    s.inferShare = 0.6;
    const opts = E.distillOptions(s).filter(o => o.ok && o.open).slice(0, 2);
    for (const o of opts) L.decide(s, 'data', { id: o.id });
    L.decide(s, 'data', { id: 'ds_synth_self' });
    let fewer = 0, days = 0;
    for (let d = 0; d < 120 && s.orders.some(o => o.gen); d++) {
      const gens = s.orders.filter(o => o.gen);
      if (d === 5) L.decide(s, 'data', { id: `gen:pause:${gens[0].id}` });
      if (d === 9) L.decide(s, 'data', { id: `gen:resume:${gens[0].id}` });
      const withGen = trainFlops(s), a = gpuAllocation(s);
      const save = s.orders;
      s.orders = s.orders.filter(o => !o.gen);
      const without = trainFlops(s), b = gpuAllocation(s);
      s.orders = save;
      if (withGen < without || a.trainGpus < b.trainGpus) fewer++;
      if (a.genGpus > 0) days++;
      advance(s, 1);
    }
    assert.equal(fewer, 0);
    assert.ok(days > 10, `生成订单真的占过推理卡（${days} 天）`);
  });

  it('小公司 2023 用自家 7B 生成 0.3T 合成教材 ≤ 45 天（首发以后推理份额 40%）', () => {
    const s = fresh('jev', 'y2023');
    assert.deepEqual(s.gpus.owned, { A100: 96 });
    if (!s.techs.includes('textbook')) s.techs.push('textbook');
    s.date = '2023-06';
    s.day = '2023-06-01';
    const live = newModel(s, { total: 7, active: 7, arch: 'dense' }, { stage: 'released' });
    live.dims = { knowledge: 50, code: 30, math: 30, writing: 50, safety: 50, agent: 0 };
    Object.assign(live, { released: s.date, releasedDay: s.day, line: 'main' });
    s.models.push(live);
    s.live = live.id;
    s.inferShare = 0.4;
    s.queue = [];
    L.decide(s, 'data', { id: 'ds_synth_self' });
    const o = s.orders.find(x => x.ref === 'ds_synth_self');
    assert.equal(o.gen.nMin, 1);
    let days = 0;
    while (s.orders.includes(o) && days < 200) { E.tickDay(s); s.queue = []; days++; }
    assert.ok(days <= 45, `${days} 天`);
    assert.ok(Math.abs(s.data.pool.tokens - (E.createGame('jev', 'y2023', 1).data.pool.tokens + 0.3)) < 1e-9);
  });

  it('取消：完成 ≥ 25% 按比例入库（蒸馏等级、教材 token 都乘完成比例），不到 25% 作废；API 的单已扣的不退、没扣的不再扣', () => {
    const s = fresh('rwkv', 'y2025');
    s.inferShare = 0.3;
    const opt = E.distillOptions(s).find(o => o.ok && o.open);
    L.decide(s, 'data', { id: opt.id });
    const o = s.orders.find(x => x.gen);
    // 推进到算完一半左右再取消。
    while (o.gen.done < 0.5 * o.gen.need) advance(s, 1);
    const f = o.gen.done / o.gen.need;
    const before = clone(s.data.distill);
    L.decide(s, 'data', { id: `gen:cancel:${o.id}` });
    assert.ok(!s.orders.includes(o));
    for (const [c, v] of Object.entries(opt.posts)) assert.ok(Math.abs((s.data.distill[c]?.[opt.teacher] || 0) - ((before[c]?.[opt.teacher] || 0) + v * f)) < 1e-9, c);
    // 不到 25%：作废。
    const s2 = fresh('rwkv', 'y2025');
    L.decide(s2, 'data', { id: opt.id });
    const o2 = s2.orders.find(x => x.gen);
    const d2 = clone(s2.data.distill);
    L.decide(s2, 'data', { id: `gen:cancel:${o2.id}` });
    assert.deepEqual(s2.data.distill, d2);
    // API 老师：按进度逐日扣钱，取消以后不再扣。
    const s3 = fresh('rwkv', 'y2025');
    const api = E.distillOptions(s3).find(x => x.ok && !x.open);
    L.decide(s3, 'data', { id: api.id });
    const o3 = s3.orders.find(x => x.gen);
    const cash0 = s3.cash;
    for (let i = 0; i < 5; i++) { const c = s3.cash; E.tickDay(s3); s3.queue = []; assert.ok(c - s3.cash >= api.cost / GEN.apiDays - 1e6, '每天扣一份'); }
    assert.ok(Math.abs(o3.gen.paid - api.cost * 5 / GEN.apiDays) < 1e-6);
    L.decide(s3, 'data', { id: `gen:cancel:${o3.id}` });
    const paid = o3.gen.paid;
    E.tickDay(s3);
    assert.equal(o3.gen.paid, paid);
    const f3 = paid / api.cost;
    assert.ok(Math.abs(f3 - 5 / GEN.apiDays) < 1e-9 && f3 >= GEN.cancelKeep);
    for (const [c, v] of Object.entries(api.posts)) assert.ok(Math.abs(s3.data.distill[c][api.teacher] - v * f3) < 1e-9, c);
    assert.ok(Math.abs(cash0 - s3.cash - paid) < 1e-3, '一共只扣了 5 天的钱');
  });

  it('取消的完成比例和流程下限同一口径：算力当天跑完就取消拿不全（< 1），正常交付不少于 7 天；收尾中取消也不满 1', () => {
    const s = fresh('qwen', 'y2025');
    s.inferShare = 0.4;
    const opt = E.distillOptions(s).find(o => o.ok && o.open);
    L.decide(s, 'data', { id: opt.id });
    const o = s.orders.find(x => x.gen);
    let d = 0;
    while (o.gen.done < o.gen.need) { E.tickDay(s); s.queue = []; d++; }
    assert.ok(d < GEN.minDays, `算力 ${d} 天就跑完了`);
    // 算力跑完当天取消：完成比例 = 已走天数 ÷ 7，不到 25% 作废；第二天取消拿 2/7。
    const k1 = clone(s);
    const r1 = L.decide(k1, 'data', { id: `gen:cancel:${o.id}` });
    const f1 = d / GEN.minDays;
    assert.ok(r1.kept < 1 && r1.kept === (f1 >= GEN.cancelKeep ? f1 : 0), `当天取消 kept=${r1.kept}`);
    const k2 = clone(s);
    E.tickDay(k2); k2.queue = [];
    const r2 = L.decide(k2, 'data', { id: `gen:cancel:${o.id}` });
    assert.ok(Math.abs(r2.kept - (d + 1) / GEN.minDays) < 1e-9, `第二天取消 kept=${r2.kept}`);
    for (const [c, v] of Object.entries(opt.posts)) assert.ok(Math.abs((k2.data.distill[c]?.[opt.teacher] || 0) - v * r2.kept) < 1e-9, c);
    // 不取消：走满 7 天才交付，拿全。
    let days = d;
    while (s.orders.includes(o)) { E.tickDay(s); s.queue = []; days++; }
    assert.ok(days >= GEN.minDays, `${days} 天交付`);
    for (const [c, v] of Object.entries(opt.posts)) assert.ok(Math.abs((s.data.distill[c]?.[opt.teacher] || 0) - v) < 1e-9, c);
    // 算力要跑十几天的单：收尾那几天取消也不满 1。
    const t = fresh('rwkv', 'y2025');
    t.inferShare = 0.4;
    const big = E.distillOptions(t).find(x => x.ok && x.open && x.genDays > GEN.minDays + 2);
    L.decide(t, 'data', { id: big.id });
    const ob = t.orders.find(x => x.gen);
    while (ob.gen.done < ob.gen.need) { E.tickDay(t); t.queue = []; }
    for (let i = 0; i < GEN.cleanupDays && t.orders.includes(ob); i++) {
      const k = clone(t);
      const r = L.decide(k, 'data', { id: `gen:cancel:${ob.id}` });
      assert.ok(r.kept > 0.5 && r.kept < 1, `收尾第 ${i} 天 kept=${r.kept}`);
      E.tickDay(t); t.queue = [];
    }
    assert.ok(!t.orders.includes(ob), '收尾 3 天以后正常交付');
  });

  it('合成教材一份只能买一次：按比例入库以后算用掉了，不能再下单；不到 25% 作废才能重新下单（“下单 → 取消”刷不出教材）', () => {
    const s = fresh('qwen', 'y2025');
    if (!s.techs.includes('textbook')) s.techs.push('textbook');
    s.inferShare = 0.6;
    const ds = DATASETS.find(d => d.id === 'ds_synth_self');
    const t0 = s.data.pool.tokens;
    // 一天就取消：作废，可以重新下单，池子不变。
    for (let i = 0; i < 4; i++) {
      L.decide(s, 'data', { id: ds.id });
      const o = s.orders.find(x => x.ref === ds.id);
      E.tickDay(s); s.queue = [];
      const r = L.decide(s, 'data', { id: `gen:cancel:${o.id}` });
      assert.equal(r.kept, 0);
      assert.equal(E.datasetAvailable(s, ds).ok, true);
    }
    assert.ok(Math.abs(s.data.pool.tokens - t0) < 1e-9);
    // 过了 25% 再取消：按比例入库，之后“已经拥有”。
    L.decide(s, 'data', { id: ds.id });
    const o = s.orders.find(x => x.ref === ds.id);
    while (genFrac(o) < GEN.cancelKeep) { E.tickDay(s); s.queue = []; }
    const r = L.decide(s, 'data', { id: `gen:cancel:${o.id}` });
    assert.ok(r.kept >= GEN.cancelKeep && r.kept < 1);
    assert.ok(Math.abs(s.data.pool.tokens - (t0 + ds.tokens * r.kept)) < 1e-9);
    assert.deepEqual(E.datasetAvailable(s, ds), { ok: false, reason: '已经拥有' });
    assert.throws(() => L.decide(s, 'data', { id: ds.id }), /已经拥有/);
  });

  it('暂停：当天卡还给推理、进度不动、满 30 天提醒一次；恢复以后接着跑完；同一老师可以重新下单', () => {
    const s = fresh('rwkv', 'y2025');
    s.inferShare = 0.3;
    const opt = E.distillOptions(s).find(o => o.ok && o.open);
    L.decide(s, 'data', { id: opt.id });
    const o = s.orders.find(x => x.gen);
    advance(s, 2);
    L.decide(s, 'data', { id: `gen:pause:${o.id}` });
    assert.equal(gpuAllocation(s).genGpus, 0);
    const done = o.gen.done, el = o.gen.elapsed;
    let notes = 0;
    for (let i = 0; i < GEN.nagDays + 5; i++) { E.tickDay(s); notes += s.queue.filter(q => q.title === '生成订单停了一个月').length; s.queue = []; }
    assert.deepEqual([o.gen.done, o.gen.elapsed, notes], [done, el, 1]);
    // 顾问看到暂停满一个月的单，建议恢复；照做以后接着跑完。
    const adv = E.advise(s).find(a => a.id === `gen:resume:${o.id}`);
    assert.ok(adv, '顾问建议恢复');
    E.applyAdvice(s, adv);
    assert.equal(o.gen.paused, null);
    for (let i = 0; i < 60 && s.orders.includes(o); i++) advance(s, 1);
    assert.ok(!s.orders.includes(o) && distillLevels(s, Object.keys(opt.posts)[0])[opt.teacher] > 0);
    L.decide(s, 'data', { id: opt.id });
    assert.ok(s.orders.some(x => x.ref === opt.id), '同一老师可以重新下单');
  });

  it('旧平铺等级、teacherCap 和非生成蒸馏订单被拒绝，原状态不改', () => {
    for (const change of [s => s.data.distill = { code: 1.5 }, s => s.data.teacherCap = { code: 80 }, s => s.data.teachers = { legacy: { q: 80 } }]) {
      const s = fresh('qwen', 'y2025'); change(s); const before = JSON.stringify(s);
      assert.throws(() => normalizeDistill(s), /不支持|旧版/); assert.equal(JSON.stringify(s), before);
      assert.equal(E.migrateGame(s).ok, false); assert.equal(JSON.stringify(s), before);
    }
    const s = fresh('qwen', 'y2025'); s.orders.push({kind:'distill',ref:'old',eta:s.day,teacher:'gpt'}); const before = JSON.stringify(s);
    assert.throws(() => dailyOrders(s, {notes:[]}), /不支持|旧版/); assert.equal(JSON.stringify(s), before);
  });
});

describe('审计 §3.4：其余复现用例', () => {
  it('两份绕过上限的数据集：ds_r1_traces 删除；ds_gpt4_distill 走 API 蒸馏通道（老师是 GPT 家族当天的 familyBest(open:false, api:true)，算老师的蒸馏数据）', () => {
    assert.ok(!DATASETS.some(d => d.id === 'ds_r1_traces'));
    assert.ok(!DATASETS.some(d => 'computeH100' in d), '从没被读过的 computeH100 删除');
    const s = fresh('qwen', 'y2024');
    const post = clone(s.data.post);
    L.decide(s, 'data', { id: 'ds_gpt4_distill' });
    const o = s.orders.find(x => x.ref === 'ds_gpt4_distill');
    assert.deepEqual([o.kind, o.teacher, o.gen.mode, o.teacherName], ['distill', 'gpt', 'api', familyBest(s, 'gpt', s.day, { open: false, api: true }).name]);
    for (let i = 0; i < 20 && s.orders.includes(o); i++) { E.tickDay(s); s.queue = []; }
    assert.deepEqual(s.data.post, post, '不进自有数据');
    assert.ok(s.data.distill.chat.gpt > 0 && s.data.risky.tos_gpt);
    assert.equal(E.datasetAvailable(fresh('gpt', 'y2024'), DATASETS.find(d => d.id === 'ds_gpt4_distill')).ok, false, 'OpenAI 自己不能买');
  });

  it('调 API 的那份数据（当前数据集 id 是 ds_gpt4_distill）：标题不写死型号，说明按下单当天 OpenAI 最强的一款写（2025 年初是 o1）', () => {
    const ds = DATASETS.find(d => d.id === 'ds_gpt4_distill');
    assert.equal(ds.name, '调用 OpenAI 的模型生成合成数据');
    const pick = (c, sc) => E.dataOptions(E.createGame(c, sc, 1)).find(o => o.id === 'ds_gpt4_distill');
    for (const [sc, teacher] of [['y2024', 'GPT-4 Turbo'], ['y2025', 'o1'], ['y2026', 'GPT-5.2']]) {
      const s = E.createGame('qwen', sc, 1);
      const o = pick('qwen', sc);
      assert.equal(o.name, '调用 OpenAI 的模型生成合成数据', sc);
      assert.equal(o.teacherName, familyBest(s, 'gpt', s.day, { open: false, api: true }).name, `${sc} 老师就是这一天 OpenAI 最强的 API 款`);
      assert.equal(o.teacherName, teacher, sc);
      assert.ok(o.desc.includes(`老师是 OpenAI 现在最强的一款（现在是 ${teacher}）`), `${sc}：${o.desc}`);
      assert.doesNotMatch(o.name, /GPT-4/, '标题里不留型号');
    }
    // 下单后订单名带上当天的老师；订单里记的老师和说明里写的是同一款。
    const s = fresh('qwen', 'y2025');
    L.decide(s, 'data', { id: 'ds_gpt4_distill' });
    const o = s.orders.find(x => x.ref === 'ds_gpt4_distill');
    assert.equal(o.name, '调用 OpenAI 的模型生成合成数据（o1）');
    assert.equal(o.teacherName, 'o1');
  });

  it('数据集里“老师会变”的条目（调别家 API、用自家在线旗舰生成）：标题和说明里不写死任何一款型号名', () => {
    const teacherDriven = DATASETS.filter(d => d.gen);
    assert.ok(teacherDriven.length >= 2, '至少有调 API 和合成教材两份');
    const names = new Set(RELEASES.map(r => r.name).filter(n => n.length >= 2));
    for (const d of teacherDriven) {
      const hit = [...names].find(n => `${d.name}${d.desc}`.includes(n));
      assert.equal(hit, undefined, `${d.id} 写死了型号名“${hit}”，老师换了就不对`);
    }
  });

  it('里程碑和史实选项的能力加分走 applyGains：R1 里程碑 c0 的数学 +3.8 被上限和难度曲线钳住（不再直接加）', () => {
    const s = fresh('deepseek', 'y2024');
    const w = workingModel(s);
    const ch = histInfo('personal_deepseek_r1', 'llm').choices.find(c => c.id === 'c0');
    assert.equal(ch.effects.dims.math, 3.8);
    const caps = computeCaps(s, w);
    w.dims.math = caps.math - 1;
    const r = applyGains(s, w, ch.effects.dims);
    assert.ok(r.applied.math > 0 && r.applied.math <= 1 + 1e-9, `数学只补到上限：+${r.applied.math}`);
    const w2 = workingModel(fresh('deepseek', 'y2024'));
    const r2 = applyGains(s, w2, ch.effects.dims);
    assert.ok(r2.applied.math < 3.8, '离最强近时按难度曲线打折');
  });

  // effects.js 归 P0.3a，不在 P1.2 的文件里；dims 那一行改成经过 applyGains（用它的返回值写说明）由 G1 门禁并入。
  it('真实路径：applyEffects({ dims }) 也受上限、污染上限和难度曲线约束（RWKV y2025 被污染的在练模型，事件连加 5 次能力也不越过 qCap、当前最强 − APPROACH）', () => {
    const s = fresh('rwkv', 'y2025');
    const w = workingModel(s);
    raiseCaps(w);
    const ws = worldSota(s);
    const t = receive(s, ws.rel.name, { math: 1 });
    w.tainted = true;
    w.post.teachers = { [t.family]: 1 };
    const cap = taintCaps(s, w).qCap;
    assert.ok(cap <= ws.q - APPROACH + 1e-9);
    const q0 = cap - 0.2;
    const dq = q0 - qOf('llm', w.dims);
    for (const k of QK) w.dims[k] += dq;
    assert.ok(Math.abs(qOf('llm', w.dims) - q0) < 1e-9);
    for (let i = 0; i < 5; i++) E.applyEffects(s, { dims: { math: 3.8, code: 3, knowledge: 3, writing: 3 } }, { source: 'event' });
    const q1 = qOf('llm', w.dims);
    assert.ok(q1 > q0 && q1 <= cap + 1e-9, `${q0} → ${q1}，上限 ${cap}`);
    // 没被污染、离最强很近时按难度曲线打折：一次 +3 远远到不了 +3。
    const s2 = fresh('deepseek', 'y2024');
    const w2 = workingModel(s2);
    const m0 = w2.dims.math;
    E.applyEffects(s2, { dims: { math: 3 } }, { source: 'milestone' });
    assert.ok(w2.dims.math - m0 < 3 - 1e-6, `数学 +${w2.dims.math - m0}`);
  });

  it('蒸馏数据的成本与负载：开源蒸馏不再写 flags.distillLoad（两单不再互相覆盖），占卡按生成订单逐日记在 gpuAllocation 的生成一桶；API 蒸馏按进度扣钱', () => {
    const s = fresh('rwkv', 'y2025');
    s.inferShare = 0.6;
    const opts = E.distillOptions(s).filter(o => o.ok && o.open).slice(0, 2);
    for (const o of opts) L.decide(s, 'data', { id: o.id });
    assert.equal(s.flags.distillLoad, undefined);
    const plan = genPlan(s);
    assert.equal(Object.values(plan.use).filter(x => x > 0).length, 1, '同一时间只跑一张，后面的排队');
    assert.ok(gpuAllocation(s).genGpus > 0);
    const cash = s.cash;
    const api = E.distillOptions(s).find(o => o.ok && !o.open);
    L.decide(s, 'data', { id: api.id });
    assert.equal(s.cash, cash, '下单当天不一次付清');
  });

  it('生成订单停着的原因分清（G1 遗留 #17）：预算放得下老师、只是被前一张占着的写“排在前一张后面”，预算 < nMin 才写“推理卡放不下老师”；原因变了再提醒一次', () => {
    // rwkv y2025 下两张开源蒸馏单：预算约 105.6 张，远大于两位老师的 nMin（14、11），第二张只是排队。
    const s = fresh('rwkv', 'y2025');
    s.inferShare = 0.6;
    const opts = E.distillOptions(s).filter(o => o.ok && o.open).slice(0, 2);
    assert.equal(opts.length, 2);
    for (const o of opts) L.decide(s, 'data', { id: o.id });
    const gens = s.orders.filter(o => o.gen);
    const plan = genPlan(s);
    const [run, queued] = [gens.find(o => plan.use[o.id] > 0), gens.find(o => !(plan.use[o.id] > 0))];
    assert.ok(run && queued);
    assert.ok(plan.budget >= queued.gen.nMin, '预算放得下第二张的老师');
    assert.deepEqual([plan.wait[run.id], plan.wait[queued.id]], [undefined, 'queue']);
    let out = { notes: [] };
    dailyOrders(s, out);
    assert.deepEqual(out.notes, [`「${queued.name}」：排在前一张后面，等它跑完（同一时间只跑一张生成单）。`]);
    assert.deepEqual([run.gen.stalled, queued.gen.stalled], [false, 'queue']);
    // 第二天还在排队：不再重复提醒。
    out = { notes: [] };
    dailyOrders(s, out);
    assert.deepEqual(out.notes, []);
    // 推理份额压到预算放不下任何老师：两张都写“放不下”，排队那张因为原因变了再提醒一次。
    s.inferShare = 0.05;
    const p2 = genPlan(s);
    assert.ok(p2.budget < Math.min(run.gen.nMin, queued.gen.nMin));
    assert.deepEqual([p2.wait[run.id], p2.wait[queued.id]], ['nofit', 'nofit']);
    out = { notes: [] };
    dailyOrders(s, out);
    assert.equal(out.notes.length, 2);
    for (const n of out.notes) assert.match(n, /推理卡放不下老师（至少要 \d+ 张 H100 的显存）/);
    assert.deepEqual([run.gen.stalled, queued.gen.stalled], ['nofit', 'nofit']);
    // 旧布尔等待标记不能被悄悄解释成当前等待原因。
    queued.gen.stalled = true;
    out = { notes: [] }; const before = JSON.stringify(s);
    assert.throws(() => dailyOrders(s, out), /不支持|旧版/);
    assert.equal(JSON.stringify(s), before); assert.deepEqual(out.notes, []);
  });

  it('distill_ban 承认：dropDistill 只丢那一家的数据，合法的开源蒸馏数据留着', () => {
    const s = fresh('rwkv', 'y2025');
    receive(s, 'DeepSeek-V3', { math: 1, code: 1 });
    receive(s, 'o1', { math: 1 });
    L.decide(s, 'data', { id: 'drop:math:gpt' });
    assert.deepEqual(s.data.distill.math, { deepseek_pro: 1 });
    assert.deepEqual(s.data.distill.code, { deepseek_pro: 1 });
    assert.throws(() => dropDistill(s, 'math', 'gpt'), /没有这位老师/);
  });

  // events.js 归 P1.3（开源相关行）和 P2.3；distill_ban 的“承认”改成按老师丢数据（dropDistill）由 G1 门禁并入。
  // 原来的写法对 { 老师: 等级 } 求 v − 1.2 得到 NaN，第二天整理时所有老师的数据都被清空。
  it('真实路径：被 OpenAI 指控蒸馏、选“承认”，只丢 GPT 家族的数据，开源老师的数据留着，存档里没有 NaN', () => {
    const s = fresh('rwkv', 'y2025');
    receive(s, 'DeepSeek-V3', { math: 1, code: 1 });
    receive(s, 'o1', { math: 1 });
    s.queue = [{ kind: 'event', id: 'distill_ban', params: { vendor: 'OpenAI', family: 'gpt' } }];
    E.resolveEvent(s, 'admit');
    assert.deepEqual(s.data.distill, { math: { deepseek_pro: 1 }, code: { deepseek_pro: 1 } });
    E.tickDay(s);
    assert.deepEqual(s.data.distill, { math: { deepseek_pro: 1 }, code: { deepseek_pro: 1 } });
  });

  it('比在练模型还弱的老师：蒸馏选项标成不可直接下单（里程碑卡上的按钮置灰，不会抛错卡住队列），后台确认后才能下单', () => {
    const s = fresh('rwkv', 'y2025');
    const w = workingModel(s);
    const opt = E.distillOptions(s).find(o => o.ok && o.open);
    for (const k of QK) w.dims[k] = opt.teacherDims[k] + 2;
    const weak = E.distillOptions(s).find(o => o.id === opt.id);
    assert.deepEqual([weak.ok, weak.weaker], [false, true]);
    assert.match(weak.reason, /比在练的模型还弱：在练的这一代已经比它强，单靠它的数据涨不上去，掺进来只会把这类训练拖慢/);
    assert.throws(() => L.decide(s, 'data', { id: opt.id }), /比在练的模型还弱/);
    L.decide(s, 'data', { id: `confirm:${opt.id}` });
    assert.ok(s.orders.some(o => o.ref === opt.id));
    // 下单时确认过，就是确认了在练的这一代照样用它（D7 只问一次）。
    assert.equal(w.weakOk[opt.teacher], s.day);
  });

  it('第一次用比这一代弱的老师之前要确认（D7）：确认只对这一代有效，换了新模型重新问；用过的老师不再问', () => {
    const s = fresh('rwkv', 'y2025');
    const w = workingModel(s);
    raiseCaps(w);
    const t = receive(s, 'DeepSeek-V3', { math: 1 });
    const tq = qOf('llm', relDims(s, t));
    for (const k of QK) w.dims[k] = relDims(s, t)[k] - 3;
    // 老师比在练模型强：不用确认，照常用；练过以后就算用过了，超过老师也不再问。
    const p = postPreview(s, 'math');
    assert.ok(p.sigma > 0 && p.held.length === 0);
    L.setFocus(s, { kind: 'train', dir: 'math' });
    for (let i = 0; i < 5; i++) { s.health = 100; dailyFocus(s, { notes: [] }); }
    assert.ok(w.post.teachers.deepseek_pro > 0);
    for (const k of QK) w.dims[k] = relDims(s, t)[k] + 2;
    assert.ok(qOf('llm', w.dims) > tq && postPreview(s, 'math').held.length === 0, '用过的老师不再问');
    // 新模型（没用过这位老师）比它强：先放着不用，确认以后才用；确认只记在这一代身上。
    const m = newModel(s, { total: 70, active: 70, arch: 'dense' }, { stage: 'post' });
    m.dims = Object.fromEntries(Object.entries(w.dims).map(([k, v]) => [k, v]));
    m.base = { ...w.base };
    s.models.push(m);
    s.working = m.id;
    const h = postPreview(s, 'math');
    assert.deepEqual([h.sigma, h.held], [0, ['deepseek_pro']]);
    assert.throws(() => L.decide(s, 'data', { id: 'use:gpt' }), /不用确认/);
    L.decide(s, 'data', { id: 'use:deepseek_pro' });
    assert.ok(postPreview(s, 'math').sigma > 0);
    assert.equal(w.weakOk, undefined);
  });

  it('弱老师不弹窗（D7）：数据先放着不用，训练页（在练模型的展开区）和数据页写明，在数据页确认（m.weakOk）；文案是“只会把这类训练拖慢”', async () => {
    globalThis.document ??= { baseURI: 'http://localhost/' };
    const dataPage = await import('../../src/career/ui/pages/data.js');
    // P2.4b 删了旧训练面板，原来面板上的内容搬进后台「训练」页“模型”区在练模型那一行的展开区（规格 T10.2）。
    const trainPage = await import('../../src/career/ui/pages/train.js');
    const trainPanel = { render: s => trainPage.render(s, { modelOpen: 'main', opt: {} }) };
    const s = fresh('rwkv', 'y2025');
    const w = workingModel(s);
    raiseCaps(w);
    const t = receive(s, 'DeepSeek-V3', { math: 1 });
    for (const k of QK) w.dims[k] = relDims(s, t)[k] + 2;
    assert.deepEqual(postPreview(s, 'math').held, ['deepseek_pro']);
    const q0 = s.queue.length;
    L.setFocus(s, { kind: 'train', dir: 'math' });
    for (let i = 0; i < 3; i++) { s.health = 100; dailyFocus(s, { notes: [] }); }
    assert.equal(s.queue.length, q0, '不弹卡');
    assert.equal(w.post.teachers.deepseek_pro ?? 0, 0, '确认之前不用它的数据');
    assert.match(trainPanel.render(s), /DeepSeek-V3 比这一代弱，数据先放着不用（后台「数据」页可以确认）/);
    const html = dataPage.render(s);
    assert.match(html, /这一代暂时不用的老师/);
    assert.match(html, /单靠它涨不上去，只会把这类训练拖慢/);
    assert.match(html, /data-use="deepseek_pro"/);
    L.decide(s, 'data', { id: 'use:deepseek_pro' });
    assert.equal(w.weakOk.deepseek_pro, s.day);
    assert.doesNotMatch(dataPage.render(s), /这一代暂时不用的老师/);
  });

  it('被污染模型的安全维不和老师比（D7）：老师的安全分再低，污染上限也只钳 Q 计入的维度，安全维照旧是自研上限', () => {
    const s = fresh('rwkv', 'y2025');
    const w = workingModel(s);
    raiseCaps(w);
    const t = receive(s, 'DeepSeek-V3', { math: 1 });
    w.tainted = true;
    w.post.teachers = { deepseek_pro: 1 };
    s.data.teachers.deepseek_pro.dims = { ...s.data.teachers.deepseek_pro.dims, safety: 5 };
    const self = computeCaps(s, w), tc = taintCaps(s, w, self);
    assert.ok(tc, '被污染');
    assert.equal(tc.caps.safety, self.safety);
    assert.ok(tc.caps.safety > 5 - APPROACH + OWN_EDGE);
    assert.ok(QK.some(k => tc.caps[k] < self[k]), '其余维度照样被老师钳住');
    assert.equal(t.name, 'DeepSeek-V3');
  });

  it('distillOptions 只列比在线旗舰强 2 分以上的老师（D7）：在线旗舰抬高以后，差不到 2 分的就不列了', () => {
    const s = fresh('rwkv', 'y2025');
    const live = liveModel(s);
    const ownQ = qOf('llm', live.dims);
    const opts = E.distillOptions(s);
    assert.ok(opts.length > 0);
    for (const o of opts) assert.ok(o.teacherQ >= ownQ + 2 - 1e-9, `${o.name} ${o.teacherQ} 对在线 ${ownQ}`);
    // 把在线旗舰抬到某位老师之下 1 分：它就不在列表里了。
    const o = opts.find(x => x.open);
    const lift = o.teacherQ - 1 - ownQ;
    for (const k of QK) live.dims[k] += lift;
    assert.ok(Math.abs(qOf('llm', live.dims) - (o.teacherQ - 1)) < 1e-6);
    assert.ok(!E.distillOptions(s).some(x => x.id === o.id), `${o.name} 只比在线旗舰强 1 分，不该列出`);
  });
});

// 机器人 24 家 × 4 剧本，逐日检查（D9 第 9 条、第 6.12 条；F4 的硬不变量）。机器人只导出 playGame，这里照 oldsave_check 的办法读它的源码，
// 在每天推进之后加一个钩子（其余逻辑一字不动）。
async function botWithDayHook() {
  const file = path.join(ROOT, 'src/career/sim/bot.js');
  let src = fs.readFileSync(file, 'utf8');
  src = src.replace(/(from\s+)(['"])(\.\.?\/[^'"]+)\2/g, (_, f, q, p) => f + q + pathToFileURL(path.resolve(path.dirname(file), p)).href + q);
  const a = '    const out = E.tickDay(s);';
  assert.ok(src.includes(a), 'bot.js 的主循环写法变了，这里要跟着改');
  src = src.replace(a, `${a}\n    opts.onDay?.(s);`);
  return import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
}

describe('D9 第 9 条、第 6.12 条：机器人 24 家 × 4 剧本', () => {
  it('解除污染 0 次；被污染的模型每天 q ≤ 当前最强 − APPROACH；被污染的快照从没拿到标签；每天的 dims、H、A、F、δ 和 gapOf 都是有限数', async () => {
    const bot = await botWithDayHook();
    const fin = (v, what) => assert.ok(Number.isFinite(v), what);
    let games = 0, taintedGames = 0, taintedDays = 0, untainted = 0;
    for (const c of COMPANIES) {
      for (const sc of ['y2023', 'y2024', 'y2025', 'y2026']) {
        let hit = false;
        bot.playGame(c.id, sc, 1, {
          onDay: s => {
            const ws = worldSota(s);
            for (const m of s.models) {
              if (m.untainted) untainted++;
              for (const v of Object.values(m.dims || {})) fin(v, `${c.id} ${sc} ${s.day} ${m.id} dims`);
              if (!isTainted(m) || !ws) continue;
              hit ||= m.stage === 'post';
              if (m.stage === 'post') taintedDays++;
              assert.ok(qOf(s.mod, m.dims) <= ws.q - APPROACH + 1e-9, `${c.id} ${sc} ${s.day} ${m.name} q ${qOf(s.mod, m.dims)} 当前最强 ${ws.q}`);
            }
            const holder = sotaAt(s);
            if (holder && holder.by === 'me') { const m = s.models.find(x => x.id === holder.id); assert.ok(!m || !isTainted(m), `${c.id} ${sc} ${s.day} 被污染的快照拿到了标签`); }
            const w = workingModel(s);
            if (w) {
              const h = hardness(s, w);
              for (const k of ['A', 'F', 'delta', 'R', 'q', 'rho']) fin(h[k], `${c.id} ${sc} ${s.day} ${k}`);
              for (const v of [...Object.values(h.H), ...Object.values(h.deltaK)]) fin(v, `${c.id} ${sc} ${s.day} H`);
              const x = gapOf(s, w.dims);
              if (x !== null) fin(x, `${c.id} ${sc} ${s.day} gapOf`);
            }
          },
        });
        games++;
        if (hit) taintedGames++;
      }
    }
    assert.equal(games, 96);
    assert.equal(untainted, 0);
    assert.ok(taintedGames > 0, '机器人局里确实出现过被污染的在练模型');
    console.log(`机器人 96 局：${taintedGames} 局出现被污染的在练模型，共 ${taintedDays} 个模型日，全部在当前最强 − ${APPROACH} 以下`);
  });
});
