// 自研上限（规格 D6.1、D9 第 3 条，P1.2）：上限只剩三项；技术加成不再重复计算（审查报告 3.5 / C1）；继承在训模型上限不低于史实；
// 副维度和主维度一样受上限约束；已有的能力永远不往下削；生成订单只借推理卡（gpuAllocation 的“数据生成”一桶）。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { COMPANIES, SCENARIOS, TECH_BY_ID, dimKeys } from '../../src/career/data/core.js';
import { RELEASES } from '../../src/career/data/rivals.js';
import { DIM_MAX, kcapOffset } from '../../src/career/data/balance.js';
import { computeCaps, effectiveCaps, applyGains, workingModel, HEADROOM, gpuAllocation, trainFlops, inferGpuEq } from '../../src/career/sim/model.js';

import { DAY } from '../../src/career/sim/loop.js';
import { resolveAll, advance } from '../helpers/career_bot.mjs';
import { clone, baseJob } from '../helpers/career_util.mjs';
import { projectTick } from '../helpers/legacy_jobs.mjs';
import * as L from '../helpers/legacy_jobs.mjs';

const fresh = (c, sc, seed = 1) => { const s = E.createGame(c, sc, seed); resolveAll(s); return s; };

describe('D6.1 上限只剩三项', () => {
  it('继承的在训模型（y2023–y2026 全部带真实型号名的下一代）各维上限不低于史实发布值', () => {
    let n = 0;
    for (const sc of SCENARIOS.map(x => x.id)) for (const c of COMPANIES) {
      const s = E.createGame(c.id, sc, 1);
      const w = workingModel(s);
      const real = w?.hint?.realName;
      if (!real) continue;
      const r = RELEASES.find(x => x.name === real);
      const caps = computeCaps(s, w);
      for (const [k, v] of Object.entries(r.dims)) assert.ok(caps[k] >= v - 1e-9, `${c.id} ${sc} ${real} ${k}：上限 ${caps[k]} < 史实 ${v}`);
      n++;
    }
    assert.ok(n >= 40, `只查到 ${n} 个`);
  });

  it('开局继承的模型：开局时已经会的技术不再加一遍上限（DeepSeek y2025 的在训模型数学上限不再到 99）；之后新学的技术照常加', () => {
    const s = fresh('deepseek', 'y2025');
    const w = workingModel(s);
    assert.deepEqual(w.capTechs, s.techs);
    const caps = computeCaps(s, w);
    for (const k of dimKeys('llm')) assert.equal(caps[k], Math.min(DIM_MAX, Math.min(w.base[k] + HEADROOM.llm[k], k !== 'safety' && w.kcap ? w.kcap + kcapOffset(k) : Infinity)), k);
    assert.ok(caps.math < 95, `数学上限 ${caps.math}`);
    // 开局之后才学会的技术：上限照加。
    const t = ['agentic_rl', 'computer_use', 'mcp', 'skills'].find(id => !s.techs.includes(id));
    s.techs.push(t);
    const after = computeCaps(s, w);
    for (const [k, v] of Object.entries(TECH_BY_ID[t].effects.cap || {})) assert.ok(Math.abs(after[k] - Math.min(DIM_MAX, caps[k] + v)) < 1e-9 || after[k] === w.kcap + kcapOffset(k), `${t} ${k}`);
  });

  it('自己预训练的底座按缩放律算，不含技术的上限效果：已经掌握的技术照常加上限（capTechs 是 []）', () => {
    const s = fresh('qwen', 'y2025');
    if (baseJob(s)) E.cancelJob(s, baseJob(s).id);
    L.startProject(s, { total: 32, active: 32, arch: 'dense', tokens: 2 });
    baseJob(s).pj.done = baseJob(s).pj.need;
    projectTick(s, { notes: [] }, DAY);
    const m = workingModel(s);
    assert.deepEqual([m.capTechs, m.techs], [[], s.techs]);
    const caps = computeCaps(s, m);
    const bonus = k => s.techs.reduce((a, id) => a + (TECH_BY_ID[id]?.effects?.cap?.[k] || 0), 0);
    for (const k of ['code', 'math', 'agent', 'safety']) assert.equal(caps[k], Math.min(DIM_MAX, Math.min(m.base[k] + HEADROOM.llm[k] + bonus(k), k !== 'safety' ? m.kcap + kcapOffset(k) : Infinity)), k);
    assert.ok(bonus('agent') > 0);
  });

  it('m.techs 两种口径：在练模型是底座完成时的快照；发布出去的快照记发布那天的 s.techs，模型条件的 techs、reasoning 对它读快照、对在练模型读公司现在的技术；上限扣的是 capTechs', () => {
    const s = fresh('qwen', 'y2024');
    s.queue = [];
    const w = workingModel(s);
    const base = [...w.techs], capTechs = [...w.capTechs];
    assert.ok(!s.techs.includes('reasoning'));
    // 底座之后才学会的推理：在练模型的 m.techs 不变，模型条件按公司现在的技术算。
    s.techs.push('grpo', 'reasoning');
    assert.deepEqual(w.techs, base);
    assert.equal(E.cond(s, { working: { reasoning: true, techs: ['grpo'] } }), true);
    w.postDays = (w.postDays || 0) + 40;
    L.decide(s, 'release', {});
    const snap = s.models.filter(m => m.stage === 'released').at(-1);
    assert.deepEqual(snap.techs, s.techs, '快照记发布那天的技术');
    assert.deepEqual(w.techs, base, '在练模型仍是底座快照');
    assert.deepEqual(w.capTechs, capTechs, '上限扣的 capTechs 也不变');
    assert.equal(E.cond(s, { model: { reasoning: true, techs: ['reasoning'] } }, { model: snap }), true);
    // 发布以后公司再学会的技术，不算进已发布的快照。
    s.techs.push('mcp');
    assert.equal(E.cond(s, { model: { techs: ['mcp'] } }, { model: snap }), false);
    assert.equal(E.cond(s, { working: { techs: ['mcp'] } }), true);
  });
});

describe('D9 第 3 条：副维度不超过 cap_k；已有的能力不往下削', () => {
  it('长期练有副维度的方向：每天副维度都不超过当天的上限（干净的和被污染的都一样）', () => {
    for (const tainted of [false, true]) {
      const s = fresh('qwen', 'y2025');
      const w = workingModel(s);
      if (tainted) {
        s.data.teachers = { deepseek_pro: { name: 'DeepSeek-V3', dims: { ...RELEASES.find(r => r.name === 'DeepSeek-V3').dims }, q: E.qOf('llm', RELEASES.find(r => r.name === 'DeepSeek-V3').dims), kind: 'weights', license: 'LR' } };
        w.tainted = true;
        w.post.teachers = { deepseek_pro: 1 };
      }
      for (let d = 0; d < 300; d++) {
        const dir = ['math', 'code', 'agent'][Math.floor(d / 30) % 3];
        if (L.legacyFocus(s).dir !== dir) { try { L.decide(s, 'train', { dir }); } catch { /* 不能练 */ } }
        const before = clone(w.dims);
        s.health = 100;
        advance(s, 1);
        if (workingModel(s) !== w) break;
        const caps = effectiveCaps(s, w);
        for (const k of Object.keys(w.dims)) if (w.dims[k] > before[k] + 1e-12) assert.ok(w.dims[k] <= caps[k] + 1e-9, `${tainted ? '被污染' : '干净'} ${s.day} ${k} ${w.dims[k]} > ${caps[k]}`);
      }
    }
  });

  it('applyGains：正涨幅只补到上限，已经高过上限的维度不动（主维度、副维度一视同仁）；负涨幅照常生效', () => {
    const s = fresh('deepseek', 'y2025');
    const w = workingModel(s);
    const caps = computeCaps(s, w);
    w.dims.code = caps.code + 3;
    w.dims.math = caps.math - 0.5;
    const r = applyGains(s, w, { code: 2, math: 2, writing: -1 }, { preMixed: true });
    assert.equal(w.dims.code, caps.code + 3, '高过上限的不削也不涨');
    assert.ok(Math.abs(w.dims.math - caps.math) < 1e-9, '只补到上限');
    assert.ok(r.applied.writing < 0, '负涨幅照常生效');
  });
});

describe('生成订单只借推理卡：gpuAllocation 的“数据生成”一桶', () => {
  it('生成订单跑的时候训练卡、训练算力一点不少；服务能用的推理能力少掉借走的那部分；暂停当天还回去', () => {
    const s = fresh('rwkv', 'y2025');
    const t0 = trainFlops(s), a0 = gpuAllocation(s), inf0 = inferGpuEq(s);
    assert.equal(a0.genGpus, 0);
    L.decide(s, 'data', { id: E.distillOptions(s).find(o => o.ok && o.open).id });
    const a1 = gpuAllocation(s);
    assert.ok(a1.genGpus > 0, '借了推理卡');
    assert.equal(trainFlops(s), t0);
    assert.deepEqual([a1.trainGpus, a1.inferGpus, a1.total], [a0.trainGpus, a0.inferGpus, a0.total]);
    assert.ok(Math.abs(a1.serveGpus + a1.genGpus - a1.inferGpus) < 1e-9);
    assert.ok(inferGpuEq(s) < inf0);
    const o = s.orders.find(x => x.gen);
    L.decide(s, 'data', { id: `gen:pause:${o.id}` });
    assert.equal(gpuAllocation(s).genGpus, 0, '暂停当天卡就还给推理');
    assert.equal(inferGpuEq(s), inf0);
  });
});
