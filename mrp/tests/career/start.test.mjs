// 真实年代经营模式（v0.7）：开局。原来在 career.test.mjs 里，按 describe 拆成单独的文件。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { COMPANIES, SCENARIOS, dimKeys } from '../../src/career/data/core.js';
import { RELEASES, FAMILIES } from '../../src/career/data/rivals.js';
import { resolveAll } from '../helpers/career_bot.mjs';
import { daysBetween } from '../../src/career/sim/clock.js';
import * as L from '../helpers/legacy_jobs.mjs';

describe('开局', () => {
  it('每家公司在每个剧本都能开局，存档结构有效', () => {
    for (const c of COMPANIES) for (const sc of SCENARIOS) {
      const s = E.createGame(c.id, sc.id, 7);
      assert.ok(E.validateGame(s), `${c.id}/${sc.id}`);
      assert.equal(s.date, sc.start);
      assert.ok(s.goals.length >= 2, `${c.id}/${sc.id} 没有阶段目标`);
      assert.equal(s.mod, c.modality);
      resolveAll(s);
      assert.equal(s.status, 'playing');
    }
  });
  it('y2026 开局模型不弱于 2025-12 前后同家族发布太多（DeepSeek 同时有 Pro 与 Flash）', () => {
    for (const c of COMPANIES) {
      const s = E.createGame(c.id, 'y2026', 3);
      c.families.forEach((f, i) => {
        const recent = RELEASES.filter(r => r.family === f && r.date <= '2025-12' && r.date >= '2025-07');
        const ref = recent.length ? recent.reduce((a, r) => (E.qOf(r.mod, r.dims) > E.qOf(a.mod, a.dims) ? r : a)) : E.familyBest(null, f, '2025-12-31');
        if (!ref) return;
        const m = i === 0 ? E.liveModel(s) || E.workingModel(s) : E.smallLive(s);
        assert.ok(m, `${c.id}/${f} 开局没有模型`);
        const gap = E.qOf(c.modality, ref.dims) - E.qOf(c.modality, m.dims);
        assert.ok(gap <= 1.5, `${c.id}/${f}：开局 ${m.name} 比 ${ref.name} 弱 ${gap.toFixed(1)}`);
        for (const k of dimKeys(c.modality)) assert.ok(m.dims[k] >= ref.dims[k] - 4, `${c.id}/${f} ${k}：${m.dims[k]} vs ${ref.dims[k]}`);
      });
    }
    const ds = E.createGame('deepseek', 'y2026', 3);
    assert.equal(E.liveModel(ds).name, 'DeepSeek-V3.2');
    assert.deepEqual([E.liveModel(ds).total, E.liveModel(ds).active, E.liveModel(ds).arch], [671, 37, 'moe']);
    assert.ok(E.smallLive(ds) && E.smallWorking(ds), 'DeepSeek 要有在线的 Flash 和待发布的下一代 Flash');
    assert.equal(E.createGame('gemini', 'y2026', 3).models.find(m => m.stage === 'released').name, 'Gemini 3 Pro');
    assert.equal(E.createGame('rwkv', 'y2026', 3).models[0].arch, 'rnn');
  });
  it('y2026：国内公司开局只有特供卡和国产卡，智谱、MiniMax 第一个月在港股挂牌', () => {
    for (const c of COMPANIES.filter(x => x.country === 'CN')) {
      const s = E.createGame(c.id, 'y2026', 2);
      for (const g of Object.keys(s.gpus.owned)) assert.ok(!['H100', 'B200', 'B300', 'H200'].includes(g), `${c.id} 开局有 ${g}`);
    }
    for (const [id, ticker] of [['glm', '2513.HK'], ['minimax', '0100.HK']]) {
      const s = E.createGame(id, 'y2026', 2);
      resolveAll(s);
      L.act(s, 'research');
      assert.equal(s.capital.listed?.ticker, ticker, id);
    }
    assert.equal(E.createGame('kimi', 'y2026', 2).capital.ipo, null);
  });
  it('y2026 每家公司有 2–3 个阶段目标，日期在 2026-04 到 2026-09', () => {
    for (const c of COMPANIES) {
      const s = E.createGame(c.id, 'y2026', 1);
      const stage = s.goals.filter(g => g.check.type !== 'final');
      assert.ok(stage.length >= 2 && stage.length <= 3, `${c.id} 有 ${stage.length} 个阶段目标`);
      for (const g of stage) assert.ok(g.date >= '2026-04' && g.date <= '2026-09', `${c.id} ${g.id} ${g.date}`);
      assert.ok(s.goals.some(g => g.check.type === 'final'), c.id);
    }
  });
  it('y2026：NovelAI 不考 OpenRouter，改考会员订阅收入；其他小团队照旧；Xialong 按 GLM-4.6 的结构继承', () => {
    const ids = s => s.goals.map(g => g.id);
    const nai = E.createGame('novelai', 'y2026', 1);
    assert.ok(!ids(nai).includes('g26_router'));
    const sub = nai.goals.find(g => g.id === 'g26_subs');
    assert.deepEqual([sub.date, sub.check.type, sub.check.product, sub.check.min], ['2026-07', 'revenue', 'chat', 8.2e5]);
    for (const id of ['rwkv', 'perplexity']) {
      const s = E.createGame(id, 'y2026', 1);
      assert.ok(ids(s).includes('g26_router') && !ids(s).includes('g26_subs'), id);
    }
    const w = E.workingModel(nai);
    assert.deepEqual([w.total, w.active, w.arch], [355, 32, 'moe']);
  });
  it('C6 开局继承：在练的下一代按距现实发布的远近减分（史实 − clamp(0.5 + 1.5 × 月数, 0.5, 4)，安全维再 −6；base 不变），GPT y2023 从 56.8 起步', () => {
    const r1 = v => Math.round(v * 10) / 10;
    const expectDims = (s, real) => {
      const months = Math.max(0, daysBetween(s.day, real.day)) / (365.25 / 12);
      const lag = Math.min(4, Math.max(0.5, 0.5 + 1.5 * months));
      return Object.fromEntries(Object.entries(real.dims).map(([k, v]) => [k, r1(Math.min(99, Math.max(0, v - lag - (k === 'safety' ? 6 : 0))))]));
    };
    // GPT y2023：GPT-4 在开局后 72 天发布（约 2.4 个月），减满 4；规格 D9 6.7 写的起点 56.8。
    const g = E.createGame('gpt', 'y2023', 1);
    const gw = E.workingModel(g);
    const gpt4 = RELEASES.find(r => r.family === 'gpt' && r.name === gw.hint.realName);
    assert.equal(gpt4.name, 'GPT-4');
    assert.deepEqual(gw.dims, Object.fromEntries(Object.entries(gpt4.dims).map(([k, v]) => [k, r1(Math.max(0, v - 4 - (k === 'safety' ? 6 : 0)))])));
    assert.equal(r1(E.qOf('llm', gw.dims)), 56.8);
    // 每家公司 × 每个剧本：开局在练的下一代都按这条公式，base 仍是史实 − 6（安全 −30）。
    let n = 0;
    for (const c of COMPANIES) for (const sc of SCENARIOS) {
      const s = E.createGame(c.id, sc.id, 7);
      const w = E.workingModel(s);
      if (!w?.hint?.realName || w.role !== 'flagship') continue;
      const real = RELEASES.find(r => FAMILIES[r.family]?.org === (c.org ?? c.id) && r.mod === c.modality && r.name === w.hint.realName);
      assert.ok(real, `${c.id}/${sc.id} 找不到 ${w.hint.realName}`);
      assert.deepEqual(w.dims, expectDims(s, real), `${c.id}/${sc.id}`);
      assert.deepEqual(w.base, Object.fromEntries(Object.entries(real.dims).map(([k, v]) => [k, v - (k === 'safety' ? 30 : 6)])), `${c.id}/${sc.id} base`);
      n++;
    }
    assert.ok(n >= 20, `只有 ${n} 局开局有在练的下一代`);
  });
  it('2023 年从零开始的公司没有现成模型，要先立项', () => {
    const s = E.createGame('qwen', 'y2023', 1);
    assert.equal(E.liveModel(s), null);
    assert.ok(s.queue.some(q => q.kind === 'notice'));
  });
});
