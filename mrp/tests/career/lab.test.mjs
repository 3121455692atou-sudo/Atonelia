// 试验（规格 T5，sim/lab.js）：结果用哈希定、不碰 rand；同种结论只留最好一条；防刷（计划下限、p_ref、匹配、每项技术只缩短一次、每代技术积累封顶）；
// 匹配和过期；数据配比之后仍过出生护栏；省算力（need = need0 × (1 − save)，经验按 need0 记）。T12 的 lab 清单。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { LAB } from '../../src/career/data/balance.js';
import { startJob, baseTick, allocJobs, cancelJob } from '../../src/career/sim/jobs.js';
import { finishTrial, trialOutcome, consumeFindings, matchFindings, pRef, refNeed } from '../../src/career/sim/lab.js';
import { anchor, anchorEnv, qOf, Q_W } from '../../src/career/sim/sota.js';
import { CURVE } from '../../src/career/data/balance.js';
import { addDays } from '../../src/career/sim/clock.js';
import { resolveAll } from '../helpers/career_bot.mjs';
import '../helpers/career_util.mjs';

const fresh = (id, sc, seed = 1) => { const s = E.createGame(id, sc, seed); resolveAll(s); return s; };
const out = () => ({ notes: [] });
// 开一项试验并当场做完（成本跑完、满流程天数），返回结果。
function runTrial(s, spec) {
  const j = startJob(s, { kind: 'trial', ...spec });
  j.done = j.cost; j.elapsed = j.minDays;
  return { job: j, ...finishTrial(s, j, out()) };
}
// 让下一项作业的 id 结果是 ok（或不 ok）：调 s.jobs.seq，找一个合适的号（odds 按这项试验的成功率）。
function nextIdWith(s, odds, want) {
  for (let n = s.jobs.seq + 1; n < s.jobs.seq + 2000; n++) if ((trialOutcome(s, { id: `j${n}`, odds }).ok) === want) { s.jobs.seq = n - 1; return; }
  throw new Error('找不到');
}

describe('T5.3 结果确定、不碰 rand', () => {
  it('1. 同一种子、同一作业 id，结论相同；试验前后 rand(s) 的状态不变', () => {
    const a = fresh('deepseek', 'y2025'), b = fresh('deepseek', 'y2025');
    for (const s of [a, b]) E.setPlan(s, { total: 671, active: 37, arch: 'moe', tokens: 3 });
    const rng = a.rng;
    const ra = runTrial(a, { type: 'tune', size: 'mid' }), rb = runTrial(b, { type: 'tune', size: 'mid' });
    assert.equal(a.rng, rng);
    assert.deepEqual([ra.ok, ra.g], [rb.ok, rb.g]);
    assert.deepEqual(a.jobs.findings, b.jobs.findings);
    const again = trialOutcome(a, ra.job);
    assert.deepEqual([again.ok, again.g], [ra.ok, ra.g]);
  });
});

describe('T5.3 结果提示用中文维度名', () => {
  it('1b. 数据配比成功的提示和公司日志写“代码”，不写 (code) 这类英文键', () => {
    const s = fresh('deepseek', 'y2025');
    E.setPlan(s, { total: 671, active: 37, arch: 'moe', tokens: 3 });
    const p = E.trialPreview(s, { type: 'mix', dim: 'code', size: 'mid' });
    nextIdWith(s, p.odds, true);
    const o = out();
    const j = startJob(s, { kind: 'trial', type: 'mix', dim: 'code', size: 'mid' });
    j.done = j.cost; j.elapsed = j.minDays;
    assert.equal(finishTrial(s, j, o).ok, true);
    const note = o.notes.join('\n'), logs = s.log.slice(-1).map(x => x.text).join('\n');
    assert.match(note, /代码/);
    assert.match(logs, /代码/);
    for (const text of [note, logs]) {
      assert.ok(!/\(code\)|（code）/i.test(text), text);
      assert.ok(!/\(safety\)|（safety）/i.test(text), text);
    }
  });
});

describe('T5.4 结论存放', () => {
  it('2. 同种结论只留最好一条；用掉时省算力合计 ≤ 13%，炸炉倍率 ≥ 0.5', () => {
    const s = fresh('gpt', 'y2025');
    const plan = { total: 1600, active: 1600, arch: 'dense', tokens: 20 };
    E.setPlan(s, plan);
    s.know = 1e4;
    for (let i = 0; i < 6; i++) runTrial(s, { type: 'tune', size: i % 2 ? 'mid' : 'small' });
    assert.equal(s.jobs.findings.filter(f => f.type === 'tune').length, 1);
    const best = s.jobs.findings.find(f => f.type === 'tune');
    for (const tech of ['mla', 'fp8', 'muon', 'mtp']) if (s.techs.includes(tech)) runTrial(s, { type: 'arch', tech, size: 'mid' });
    for (const dim of Object.keys(Q_W.llm)) runTrial(s, { type: 'mix', dim, size: 'mid' });
    assert.ok(best.save >= LAB.GAIN.tune.small.save * LAB.GAIN_MIN);
    const c = consumeFindings(s, plan, E.previewProject(s, plan).need, false);
    assert.ok(c.save <= LAB.SAVE_CAP + 1e-12 && c.save > 0);
    assert.ok(c.risk >= LAB.RISK_FLOOR - 1e-12);
  });
});

describe('T5.1、T5.6 防刷', () => {
  it('3a. 计划总参低于参照底座的 1/4 时拒绝开试验', () => {
    const s = fresh('gpt', 'y2025');
    E.setPlan(s, { total: 0.5, active: 0.5, arch: 'dense', tokens: 0.5 });
    const c = E.jobCheck(s, { kind: 'trial', type: 'tune', size: 'mid' });
    assert.equal(c.ok, false);
    assert.match(c.reason, /计划太小/);
  });
  it('3b. 没有参照底座时，0.5B·0.5T 计划的 p_ref ≤ 0.05，研究缩短和技术积累跟着打折', () => {
    const s = fresh('rwkv', 'y2023');
    assert.equal(E.refModel(s), null);
    assert.equal(refNeed(s), LAB.REF_MIN_LLM);
    E.setPlan(s, { total: 0.5, active: 0.5, arch: 'dense', tokens: 0.5 });
    const p = E.trialPreview(s, { type: 'tune', size: 'mid' });
    assert.ok(p.ok && p.pRef <= 0.05, `${p.pRef}`);
    const k0 = s.know;
    runTrial(s, { type: 'tune', size: 'mid' });
    assert.ok(s.know - k0 <= LAB.KNOW.mid * 0.05 + 1e-12);
  });
  it('3c. 计划改成 0.5B 再用到 671B 底座上：匹配不上，加成为 0', () => {
    const s = fresh('rwkv', 'y2023');
    E.setPlan(s, { total: 0.5, active: 0.5, arch: 'dense', tokens: 0.5 });
    s.know = 1e4;
    for (let i = 0; i < 5 && !s.jobs.findings.length; i++) runTrial(s, { type: 'tune', size: 'mid' });
    assert.ok(s.jobs.findings.length);
    const big = { total: 671, active: 671, arch: 'dense', tokens: 2 };
    assert.deepEqual(matchFindings(s, big), []);
    const c = consumeFindings(s, big, 6 * 671e9 * 2e12, false);
    assert.equal(c.save, 0);
    assert.equal(c.risk, 1);
    // 匹配得上的极小底座：p = min(1, 成本 ÷ (档位比例 × need0))，用到大底座上 p ≈ 0。
    const f = s.jobs.findings[0];
    assert.ok(f.cost / (LAB.SHARE.mid * 6 * 671e9 * 2e12) < 1e-3);
  });
  it('3d. 同一项技术第一次架构验证失败以后再验，研究不再缩短；成功的第一次才缩短', () => {
    const s = fresh('deepseek', 'y2024');
    E.setPlan(s, { total: 67, active: 67, arch: 'dense', tokens: 2 });
    E.researchTech(s, 'mla');
    const r = s.research.find(x => x.id === 'mla');
    assert.ok(r);
    const p = E.trialPreview(s, { type: 'arch', tech: 'mla', size: 'mid' });
    assert.ok(p.ok && p.inResearch);
    nextIdWith(s, p.odds, false);
    const done0 = r.done;
    const a = runTrial(s, { type: 'arch', tech: 'mla', size: 'mid' });
    assert.equal(a.ok, false);
    assert.equal(r.done, done0);
    assert.equal(s.jobs.techCut.mla, true);
    nextIdWith(s, p.odds, true);
    const b = runTrial(s, { type: 'arch', tech: 'mla', size: 'mid' });
    assert.equal(b.ok, true);
    assert.equal(r.done, done0, '失败过一次以后不再缩短');
    // 对照：另一局第一次就成功，研究缩短了 cut × g × p_ref × 剩余。
    const t = fresh('deepseek', 'y2024');
    E.setPlan(t, { total: 67, active: 67, arch: 'dense', tokens: 2 });
    E.researchTech(t, 'mla');
    const rt = t.research.find(x => x.id === 'mla');
    nextIdWith(t, p.odds, true);
    const left = rt.need - rt.done;
    const c = runTrial(t, { type: 'arch', tech: 'mla', size: 'mid' });
    const want = LAB.GAIN.arch.mid.cut * c.g * pRef(t, c.job.cost, 'mid') * left;
    assert.ok(Math.abs(rt.need - rt.done - (left - want)) < 1e-9);
  });
  it('3e. 每代技术积累合计 ≤ 5；练小底座不改 s.gen，上限不会被重置', () => {
    const s = fresh('gpt', 'y2025');
    E.setPlan(s, { total: 1600, active: 1600, arch: 'dense', tokens: 20 });
    const k0 = s.know, gen = s.gen;
    for (let i = 0; i < 8; i++) runTrial(s, { type: i % 3 === 0 ? 'tune' : 'mix', dim: 'code', size: 'mid' });
    const sj = startJob(s, { kind: 'pretrain', line: 'small', cfg: { total: 14, active: 14, arch: 'dense', tokens: 1 } });
    Object.assign(sj.pj, { done: sj.pj.need }); Object.assign(sj.pj.acc, { w: 1, q: 1, effectiveQ: 1, repeat: 1 });
    const k1 = s.know;
    baseTick(s, out());
    const smallCredit = s.know - k1;
    for (let i = 0; i < 8; i++) runTrial(s, { type: 'mix', dim: 'math', size: 'mid' });
    assert.equal(s.gen, gen);
    assert.ok(s.know - k0 - smallCredit <= LAB.KNOW.perGen + 1e-9, `${s.know - k0 - smallCredit}`);
    assert.equal(s.jobs.trialKnow[gen], LAB.KNOW.perGen);
  });
});

describe('T5.5 匹配和过期', () => {
  it('4. 架构不同、规模超出 4 倍、超过 365 天、技术还没掌握的结论都不用掉；取消底座时结论退回', () => {
    const s = fresh('deepseek', 'y2024');
    s.know = 1e4;
    const plan = { total: 67, active: 67, arch: 'dense', tokens: 2 };
    E.setPlan(s, plan);
    for (let i = 0; i < 4 && !s.jobs.findings.some(f => f.type === 'tune'); i++) runTrial(s, { type: 'tune', size: 'mid' });
    E.researchTech(s, 'mla');
    for (let i = 0; i < 6 && !s.jobs.findings.some(f => f.type === 'arch'); i++) runTrial(s, { type: 'arch', tech: 'mla', size: 'mid' });
    assert.ok(s.jobs.findings.some(f => f.type === 'tune') && s.jobs.findings.some(f => f.type === 'arch'));
    assert.deepEqual(matchFindings(s, { ...plan, total: 67 * 4.5, active: 67 * 4.5 }), [], '规模超出 4 倍');
    assert.deepEqual(matchFindings(s, { total: 67, active: 22, arch: 'moe', tokens: 2 }).filter(f => f.type === 'tune'), [], '架构不同');
    assert.ok(!matchFindings(s, plan).some(f => f.type === 'arch'), '技术还没掌握');
    const day = s.day;
    s.day = addDays(day, 366);
    assert.deepEqual(matchFindings(s, plan), [], '超过 365 天');
    s.day = day;
    const n = s.jobs.findings.length;
    const j = startJob(s, { kind: 'pretrain', line: 'main', cfg: plan });
    assert.ok(j.lab && j.lab.used.length === 1, '只用掉调参那一条');
    assert.equal(s.jobs.findings.length, n - 1);
    assert.ok(Math.abs(j.pj.need - j.need0 * (1 - j.lab.save)) < 1e-6 * j.need0);
    cancelJob(s, j.id);
    assert.equal(s.jobs.findings.length, n, '取消底座时结论退回');
  });
});

describe('T5.5 数据配比和出生护栏', () => {
  it('5. 数据配比的出生加成之后仍满足 D6.5 的出生护栏', () => {
    const s = fresh('qwen', 'y2024');
    s.know = 1e4;
    const plan = { total: 120, active: 120, arch: 'dense', tokens: 2 };
    E.setPlan(s, plan);
    for (let i = 0; i < 6 && !s.jobs.findings.some(f => f.type === 'mix'); i++) runTrial(s, { type: 'mix', dim: 'code', size: 'mid' });
    const j = startJob(s, { kind: 'pretrain', line: 'main', cfg: plan });
    assert.ok(j.lab?.dims?.code > 0);
    Object.assign(j.pj, { done: j.pj.need }); Object.assign(j.pj.acc, { w: 1, q: 1.3, effectiveQ: 1.3, repeat: 1, mix: {} });
    baseTick(s, out());
    const m = E.workingModel(s);
    const R = anchor(s, { mod: 'llm' }), En = anchorEnv(s, { mod: 'llm' });
    assert.ok(qOf('llm', m.dims) <= R - CURVE.BIRTH_GAP + 1e-6);
    for (const k of Object.keys(Q_W.llm)) if (Number.isFinite(En[k])) assert.ok(m.dims[k] <= En[k] + CURVE.DIM_SLACK + 1e-6, k);
    assert.ok(m.pretraining.lab.dims.code > 0);
  });
});

describe('T5.5 省算力', () => {
  it('6. 底座 need = need0 × (1 − save)，研发经验按 need0 记；已到最快天数的底座，想要卡变少、工期不变', () => {
    const s = fresh('gpt', 'y2026');
    const plan = { total: 671, active: 37, arch: 'moe', tokens: 15 };
    E.setPlan(s, plan);
    s.know = 1e4;
    for (let i = 0; i < 6 && !s.jobs.findings.some(f => f.type === 'tune'); i++) runTrial(s, { type: 'tune', size: 'mid' });
    const before = E.jobCheck(s, { kind: 'pretrain', line: 'main', cfg: plan });
    const noLab = E.previewProject(s, plan);
    assert.ok(before.lab?.save > 0);
    assert.ok(Math.abs(before.eta - noLab.days) < 1e-6, '卡在最快天数上：工期不变');
    assert.ok(before.cards.want < noLab.cards.want, '想要卡变少');
    const j = startJob(s, { kind: 'pretrain', line: 'main', cfg: plan });
    assert.ok(Math.abs(j.pj.need - j.need0 * (1 - j.lab.save)) < 1e-6 * j.need0);
    Object.assign(j.pj, { done: j.pj.need }); Object.assign(j.pj.acc, { w: 1, q: 1.2, effectiveQ: 1.2, repeat: 1 });
    baseTick(s, out());
    const m = E.workingModel(s);
    assert.ok(Math.abs(m.pretraining.experience.effectiveFlops - j.need0) < 1e-6 * j.need0, '经验按 need0 记');
    assert.ok(allocJobs(s));
  });
});
