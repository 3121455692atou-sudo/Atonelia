// 安全评测（规格 T6，sim/evals.js）：候选冻结、档位天数、撤回、riskSafety、跳过的代价、备案口径、机器人从不跳过、蒸馏出身的后训练上限、
// evalTier 一定有、授名预留、发布碰撞、out.releases、小模型送评冻结（T12 的 evals 清单）。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import { companyFile } from '../../src/career/data/companies/index.js';
import { COMPANIES, SCENARIOS } from '../../src/career/data/core.js';
import { EVAL, DISTILL_GAP } from '../../src/career/data/balance.js';
import { COMPANY_FILES } from '../../src/career/data/companies/index.js';
import { RELEASES } from '../../src/career/data/rivals.js';
import { RELEASE_GAP } from '../../src/career/data/supply.js';
import { startJob, baseTick, postTick } from '../../src/career/sim/jobs.js';
import { evalTick } from '../../src/career/sim/evals.js';

import { qOf, Q_W } from '../../src/career/sim/sota.js';
import { addDays } from '../../src/career/sim/clock.js';
import { playGame, resolveAll } from '../helpers/career_bot.mjs';
import { releaseEvaluated } from '../helpers/career_util.mjs';
import { doRelease } from '../helpers/legacy_jobs.mjs';
import * as L from '../helpers/legacy_jobs.mjs';
// 本家树会带数值特质；这个文件只测公共规则，先把本家的摘掉（P3.T 起 gpt、claude 有本家树）。
const stripHome = s => { const home = companyFile(s.charId)?.spirits || {}; for (const id of Object.keys(s.strategy?.spirits || {})) if (home[id]) delete s.strategy.spirits[id]; return s; };

const fresh = (id, sc, seed = 1) => { const s = E.createGame(id, sc, seed); resolveAll(s); return s; };
const out = () => ({ notes: [] });
// 可以送评：在练模型后训练满两周、没有在评测的。
const ready = s => { const w = E.workingModel(s); w.postDays = Math.max(w.postDays || 0, (w.relDays || 0) + 30); return w; };
const fillUp = j => { Object.assign(j.pj, { done: j.pj.need }); if (j.pj.acc) Object.assign(j.pj.acc, { w: 1, q: 1.2, effectiveQ: 1.2, repeat: 1 }); };

describe('T6.2 送评、候选、评测期间接着练', () => {
  it('1. 候选冻结：送评后在练模型继续涨，发布出来的快照等于送评那天的能力和 techs', () => {
    const s = fresh('deepseek', 'y2025');
    const w = ready(s);
    const dims = { ...w.dims }, techs = [...s.techs];
    const r = L.decide(s, 'submit', { tier: 'standard' });
    assert.equal(r.kind, 'submit');
    assert.equal(r.days, EVAL.TIERS.standard.days);
    startJob(s, { kind: 'post', target: 'main', dir: 'code', until: 'none' });
    // 走到评完的前一天（标准档天数 P4.2 调过，不写死）。
    for (let i = 0; i < EVAL.TIERS.standard.days - 1; i++) { E.tickDay(s); resolveAll(s); }
    assert.ok(qOf('llm', w.dims) > qOf('llm', dims), '在练模型照常涨');
    s.techs.push('engram_test_tech');
    let rel = null;
    for (let i = 0; i < 5 && !rel; i++) { const o = E.tickDay(s); resolveAll(s); rel = o?.releases?.[0] ?? rel; }
    assert.ok(rel, '评完那天 tickDay 的 out.releases 带发布结果');
    assert.deepEqual(rel.model.dims, dims);
    assert.deepEqual(rel.model.techs, techs);
    assert.equal(rel.model.evalTier, 'standard');
    assert.equal(rel.model.id, `${w.id}r0`);
  });
  it('1b. 评测期间对手发布更强模型：标签和期待按发布当天判（候选拿不到标签）', () => {
    const s = fresh('gpt', 'y2024');
    const w = ready(s);
    const r = L.decide(s, 'submit', { tier: 'quick' });
    const ws = E.worldSota(s)?.q ?? 0;
    // 发布当天的最强比候选高：把候选的能力压到当前最强之下 1 分，再评完。
    const ev = s.evals.find(e => e.id === r.eval.id);
    const lower = Math.max(0, qOf('gpt' && 'llm', ev.cand.dims) - ws) + 1;
    for (const k of Object.keys(Q_W.llm)) ev.cand.dims[k] = Math.max(0, ev.cand.dims[k] - lower);
    const rel = E._finishEvalNow(s, ev.id);
    assert.ok(!rel.model.sota?.holder, '比发布当天的最强弱，拿不到标签');
    assert.ok(w);
  });
  it('2. 档位天数：小模型减半；从严、标准、快速至少 4 天，跳过和 legacy 没有天数；evalDays 乘法；撤回后 relDays、releases、授名预留都复原', () => {
    const s = fresh('deepseek', 'y2025');
    assert.deepEqual(['full', 'standard', 'quick', 'skip', 'legacy'].map(t => E.evalDaysFor(s, t, 'main')), [42, 14, 7, 0, 0]);
    assert.deepEqual(['full', 'standard', 'quick'].map(t => E.evalDaysFor(s, t, 'small')), [21, 7, 4]);
    s.strategy.spirits = { ...(s.strategy.spirits || {}), g_move_fast: { day: s.day } };
    const mult = E.modifier(s, 'evalDays');
    assert.equal(mult, 0.75);
    assert.deepEqual(['full', 'standard', 'quick'].map(t => E.evalDaysFor(s, t, 'main')), [32, 11, 5]);
    assert.equal(E.evalDaysFor(s, 'quick', 'small'), 4, '至少 4 天');
    delete s.strategy.spirits.g_move_fast;
    const w = ready(s);
    const before = { relDays: w.relDays || 0, releases: w.releases || 0 };
    const r = L.decide(s, 'submit', { tier: 'full' });
    assert.equal(w.releases, before.releases + 1);
    L.decide(s, 'cancelEval', { id: r.eval.id });
    assert.deepEqual({ relDays: w.relDays || 0, releases: w.releases || 0 }, before);
    assert.deepEqual(s.evals, []);
  });
});

describe('T6.4 风险读数 riskSafety', () => {
  it('3. 五档的 adj 和 cap；没写档的按 skip 算；跳过的版本安全 90 时 abuse 的 hazard > 0；legacy 等于原安全维；中标率、诉讼胜率也按它算', () => {
    const s = stripHome(fresh('gpt', 'y2025'));
    const m = tier => ({ dims: { safety: 90 }, ...(tier ? { evalTier: tier } : {}) });
    assert.deepEqual(['full', 'standard', 'quick', 'skip', 'legacy', undefined].map(t => E.riskSafety(s, m(t))), [94, 92, 80, 62, 90, 62]);
    assert.equal(E.riskSafety(s, { dims: { safety: 50 }, evalTier: 'quick' }), 50);
    assert.equal(E.riskSafety(s, null), null);
    assert.ok(72 - E.riskSafety(s, m('skip')) > 0, 'abuse hazard 的系数 max(0, 72 − 安全) > 0');
    const ev = fs.readFileSync(new URL('../../src/career/sim/events.js', import.meta.url), 'utf8');
    const lg = fs.readFileSync(new URL('../../src/career/sim/legal.js', import.meta.url), 'utf8');
    for (const [name, src] of [['abuse', ev.slice(ev.indexOf("hazard('abuse'") - 900, ev.indexOf("hazard('abuse'"))], ['中标率', ev.slice(ev.indexOf("case 'big_customer'"), ev.indexOf("case 'big_customer'") + 400)], ['立案胜率', lg]]) assert.match(src, /riskSafety\(s, /, name);
    s.strategy.spirits = { ...(s.strategy.spirits || {}), g_safety_first: { day: s.day } };
    assert.equal(E.riskSafety(s, { dims: { safety: 60 }, evalTier: 'standard' }), 64, '安全优先：评测过的再 +2');
    assert.equal(E.riskSafety(s, { dims: { safety: 60 }, evalTier: 'skip' }), 60);
  });
});

describe('T6.5 跳过评测', () => {
  it('4. 当天发布，口碑 −3、品牌 ×0.97，不能拿去备案；decide("release") 和 doRelease 也按跳过算', () => {
    const s = fresh('kimi', 'y2025'), q = fresh('kimi', 'y2025');
    ready(s); ready(q);
    const r = L.decide(s, 'submit', { tier: 'skip' });
    const rq = releaseEvaluated(q, {});
    assert.equal(r.kind, 'release');
    assert.equal(r.model.evalTier, 'skip');
    assert.equal(rq.model.evalTier, 'quick');
    assert.equal(r.model.releasedDay, s.day);
    assert.ok(Math.abs(s.rep - (q.rep - 3)) < 1e-9, `${s.rep} / ${q.rep}`);
    assert.ok(Math.abs(s.brand / q.brand - 0.97) < 1e-9, '品牌 ×0.97');
    assert.ok(s.news.some(n => /没做安全评测就上线了/.test(n.title)));
    const t = fresh('kimi', 'y2025');
    ready(t);
    const r2 = L.decide(t, 'release', {});
    assert.equal(r2.model.evalTier, 'skip');
    const u = fresh('kimi', 'y2025');
    ready(u);
    const live0 = E.liveModel(u);
    u.deploy = [];
    const r3 = doRelease(u, {});
    assert.equal(r3.model.evalTier, 'skip');
    // 跳过的版本当上在线旗舰以后不算备案。
    for (let i = 0; i < 30; i++) { E.tickDay(t); resolveAll(t); }
    if (E.liveModel(t)?.evalTier === 'skip') assert.equal(E.filingSafety(t), 0);
    assert.ok(live0);
  });
});

describe('T6.6 国内对话备案', () => {
  it('5. 在练模型不算；评测中的候选不算；今天评完的算；档位 skip 的在线旗舰不算；顾问在“在练模型够线、在线不够”时建议先送评，不建议备案', () => {
    const s = fresh('deepseek', 'y2024');
    s.service.filing = 'none';
    const live = E.liveModel(s), w = ready(s);
    live.dims.safety = 40; live.evalTier = 'legacy';
    w.dims.safety = 70;
    assert.equal(E.filingSafety(s), 40, '在练模型不算');
    const r = L.decide(s, 'submit', { tier: 'standard' });
    assert.equal(E.filingSafety(s), 40, '评测中的候选不算');
    const ev = s.evals.find(e => e.id === r.eval.id);
    ev.until = s.day;
    assert.equal(E.filingSafety(s), 70, '今天评完的算');
    live.evalTier = 'skip';
    L.decide(s, 'cancelEval', { id: ev.id });
    assert.equal(E.filingSafety(s), 0, '跳过的在线旗舰不算');
    // 顾问：在练够线、在线不够：先送评（标准），不建议提交备案。
    live.evalTier = 'legacy';
    s.products.chat.on = false;
    const list = E.advise(s);
    assert.ok(!list.some(a => a.id === 'filing'), list.map(a => a.label).join(' / '));
    const sub = list.find(a => a.op?.action === 'submit' && a.op.arg?.modelId === w.id);
    assert.ok(sub, list.map(a => a.label).join(' / '));
    assert.equal(sub.op.arg.tier, 'standard');
    assert.match(sub.detail, /评完再备案/);
  });
});

describe('机器人与终局', () => {
  it('6、8. 机器人 24×4 局跳过评测 0 次；新发布的快照和小模型全部带 evalTier，而且没有 legacy', () => {
    const bad = [];
    for (const c of COMPANIES) for (const sc of SCENARIOS) {
      const { s } = playGame(c.id, sc.id, 1);
      const rel = s.models.filter(m => m.stage === 'released' && !m.hist);
      const skip = rel.filter(m => m.evalTier === 'skip').length;
      const missing = rel.filter(m => !EVAL.TIERS[m.evalTier] || m.evalTier === 'legacy').length;
      if ((skip || missing) && bad.length < 5) bad.push(`${c.id} ${sc.id}：跳过 ${skip}，缺档或 legacy ${missing}`);
      assert.ok(s.models.filter(m => m.hist && m.stage === 'released').every(m => m.evalTier === 'legacy'), `${c.id} ${sc.id} 继承的历史版本记 legacy`);
    }
    assert.deepEqual(bad, []);
  });
});

describe('T2.4 蒸馏出身的后训练上限', () => {
  it('7. 蒸馏出身的小模型后训练 400 天：每天各维 ≤ 老师维 − 该维差距，整体 ≤ min(老师 q, worldSota) − 2.5 + 1e-9', () => {
    const s = fresh('qwen', 'y2025');
    const live = E.liveModel(s);
    const j = startJob(s, { kind: 'distill', cfg: { teacher: 'self', total: 7, active: 7, arch: 'dense', tokens: 1.5 } });
    Object.assign(j.pj, { done: j.pj.need, elapsedDays: 30 });
    baseTick(s, out());
    resolveAll(s);
    const m = E.smallModels(s)[0];
    assert.ok(m?.distillation?.gap > 0);
    startJob(s, { kind: 'post', target: `small:${m.id}`, dir: 'code', until: 'none' });
    const T = m.distillation.teacher.dims, gap = m.distillation.gap;
    for (let i = 0; i < 400; i++) {
      s.health = 100;
      s.day = `${s.date}-15`;
      postTick(s, out());
      const ws = E.worldSota(s)?.q ?? Infinity;
      for (const k of Object.keys(Q_W.llm)) if (Number.isFinite(T[k])) assert.ok(m.dims[k] <= Math.max(T[k] - gap * (DISTILL_GAP.dimMul[k] ?? 1), m.base[k]) + 1e-9, `${k} 第 ${i} 天 ${m.dims[k]}`);
      assert.ok(qOf('llm', m.dims) <= Math.max(Math.min(qOf('llm', T), ws) - DISTILL_GAP.floor, qOf('llm', m.base)) + 1e-9);
    }
    assert.ok(live);
  });
});

describe('C7 授名预留', () => {
  it('9. 送评时预留，评测期间授名到期，评完照常用上、不抛错，授名照常记账；撤回清掉预留', () => {
    const was = COMPANY_FILES.deepseek;
    COMPANY_FILES.deepseek = { company: 'deepseek', tree: null, spirits: {}, startSpirits: [], exclusives: [],
      names: [{ id: 'hn_ds_test', name: 'DeepSeek-Prime', series: null, role: 'flagship', node: 'test_node', real: '2025-01-20', model: null, world: null, clean: null, events: [] }] };
    try {
      const s = fresh('deepseek', 'y2025');
      s.strategy.rights = { hn_ds_test: { day: s.day, until: addDays(s.day, 5), used: null, void: null } };
      const w = ready(s);
      const r = L.decide(s, 'submit', { tier: 'standard', grant: 'hn_ds_test' });
      const cand = `${w.id}r0`;
      assert.equal(s.strategy.rights.hn_ds_test.used, cand, '送评时预留');
      L.decide(s, 'cancelEval', { id: r.eval.id });
      assert.equal(s.strategy.rights.hn_ds_test.used ?? null, null, '撤回清掉预留');
      const r2 = L.decide(s, 'submit', { tier: 'standard', grant: 'hn_ds_test' });
      let rel = null;
      for (let i = 0; i < 30 && !rel; i++) { const o = E.tickDay(s); resolveAll(s); rel = o?.releases?.[0] ?? null; }
      assert.ok(rel, '评完发布');
      assert.ok(s.day > s.strategy.rights.hn_ds_test.until, '授名在评测期间到期了');
      assert.deepEqual([rel.model.name, rel.model.grant, s.strategy.rights.hn_ds_test.used, s.strategy.rights.hn_ds_test.void ?? null], ['DeepSeek-Prime', 'hn_ds_test', rel.model.id, null]);
      assert.ok(r2);
    } finally { COMPANY_FILES.deepseek = was; }
  });
});

describe('T6.2 发布碰撞', () => {
  it('10. 快速档到期时 postDays − relDays < RELEASE_GAP 也照常发布；主线和上一代前后脚到期、前一款还在灰度：后一款当天发布、until 顺延；小模型碰上小模型灰度同理；都不抛错', () => {
    const s = fresh('gpt', 'y2025');
    const old = ready(s);
    const r1 = L.decide(s, 'submit', { tier: 'quick' });
    assert.ok(RELEASE_GAP > 7);
    // 新底座练完：旧的进上一代收尾，新的在练模型当天就能送评（测试里补满后训练天数）。
    const j = startJob(s, { kind: 'pretrain', line: 'main', cfg: { total: 70, active: 70, arch: 'dense', tokens: 1 } });
    fillUp(j);
    baseTick(s, out());
    resolveAll(s);
    assert.equal(s.prevWorking?.id, old.id);
    const w2 = ready(s);
    const r2 = L.decide(s, 'submit', { tier: 'quick', replace: true });
    // 快速档到期那天，两款的“送评以后又练的天数”都小于 RELEASE_GAP。
    const rels = [];
    for (let i = 0; i < 10 && rels.length < 2; i++) { const o = E.tickDay(s); resolveAll(s); rels.push(...(o?.releases || [])); }
    assert.equal(rels.length, 2, '两款都照常发布');
    const [a, b] = rels;
    if (a.line === 'main' && b.line === 'main') assert.ok(b.until >= a.until, '后一款的 until 顺延到前一款之后');
    assert.ok(r1 && r2 && w2);
    // 小模型碰上小模型灰度。
    const t = fresh('gpt', 'y2025');
    for (let i = 0; i < 2; i++) { const d = startJob(t, { kind: 'distill', cfg: { teacher: 'self', total: 7 + i, active: 7 + i, arch: 'dense', tokens: 1.5 } }); Object.assign(d.pj, { done: d.pj.need, elapsedDays: 30 }); baseTick(t, out()); resolveAll(t); }
    const [m1, m2] = E.smallModels(t);
    const x1 = L.decide(t, 'submit', { modelId: m1.id, role: 'small', tier: 'skip' });
    resolveAll(t);
    const x2 = L.decide(t, 'submit', { modelId: m2.id, role: 'small', tier: 'skip' });
    assert.ok(x2.until >= x1.until, '小模型的 until 顺延到前一款之后');
  });
  it('11. 发布结果：评完那天 tickDay 的 out.releases 带发布结果；plan.papers 在发布那天公开', () => {
    const s = fresh('deepseek', 'y2025');
    ready(s);
    s.firsts = { ...(s.firsts || {}), mla: s.day };
    s.papers = {};
    const r = L.decide(s, 'submit', { tier: 'quick', papers: ['mla'] });
    assert.ok(!s.papers.mla, '送评时还没公开');
    let rel = null;
    const until = r.eval.until;
    for (let i = 0; i < 10 && !rel; i++) { const o = E.tickDay(s); resolveAll(s); if (o?.releases?.length) rel = { day: o.day, r: o.releases[0] }; }
    assert.ok(rel);
    assert.equal(rel.day, until);
    assert.ok(s.papers.mla, '发布那天公开');
    assert.equal(rel.r.kind, 'release');
  });
});

describe('T7 小模型送评', () => {
  it('12. 冻结、后训练作业结束、不在 smallModels 里但仍占小模型线；撤回以后解冻', () => {
    const s = fresh('qwen', 'y2025');
    const d = startJob(s, { kind: 'distill', cfg: { teacher: 'self', total: 7, active: 7, arch: 'dense', tokens: 1.5 } });
    Object.assign(d.pj, { done: d.pj.need, elapsedDays: 30 });
    baseTick(s, out());
    resolveAll(s);
    const m = E.smallModels(s)[0];
    startJob(s, { kind: 'post', target: `small:${m.id}`, dir: 'code' });
    const n = E.smallLineCount(s);
    const r = L.decide(s, 'submit', { modelId: m.id, role: 'small', tier: 'standard' });
    assert.equal(r.days, Math.max(EVAL.MIN_DAYS, Math.round(EVAL.TIERS.standard.days * EVAL.SMALL)));
    assert.equal(m.evalId, r.eval.id);
    assert.ok(!E.smallModels(s).includes(m));
    assert.equal(E.smallLineCount(s), n);
    assert.ok(!s.jobs.list.some(j => j.kind === 'post' && j.target === `small:${m.id}`), '后训练作业结束');
    assert.throws(() => startJob(s, { kind: 'post', target: `small:${m.id}`, dir: 'code' }), /评测/);
    L.decide(s, 'cancelEval', { id: r.eval.id });
    assert.ok(E.smallModels(s).includes(m));
    assert.equal(m.evalId, undefined);
    // 评完发布：从待发布里摘掉。
    const rel = releaseEvaluated(s, { modelId: m.id, role: 'small' });
    assert.equal(rel.model.stage, 'released');
    assert.equal(rel.model.evalTier, 'quick');
    assert.ok(!E.smallModels(s).includes(m) && s.smallWorking !== m.id);
  });
});
