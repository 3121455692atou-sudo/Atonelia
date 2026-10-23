// 市场期待（P3.E，规格 D11）：期待档、徽章、发布判定、预告、冷却、加评、推迟判定。
// 史实夹具用真引擎（createGame + rebuildSota + labelOnRelease + judgeRelease），数值夹具用同一条判定路径。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { RELEASES } from '../../src/career/data/rivals.js';
import { dimKeys, COMPANIES, SCENARIOS } from '../../src/career/data/core.js';
import { EXPECT } from '../../src/career/data/balance.js';
import { EXPECT_FX } from '../../src/career/data/expect.js';
import { initExpect, ensureExpect, badgesFor, judgeRelease, judgeDeferred, expectPreview } from '../../src/career/sim/expect.js';
import { rebuildSota, labelOnRelease, qOf, worldSota, sotaWouldTake, relDims } from '../../src/career/sim/sota.js';
import { releaseLine } from '../../src/career/sim/release.js';
import { releaseOpen } from '../../src/career/sim/route.js';
import { addDays, daysBetween } from '../../src/career/sim/clock.js';
import { conditionalEvents } from '../../src/career/sim/events.js';
import { shouldHold } from '../../src/career/sim/strategy_ai.js';
import { structureForRelease } from '../../src/career/data/model_structure.js';
import { clone } from '../helpers/career_util.mjs';

const setDay = (s, day) => { s.day = day; s.date = day.slice(0, 7); };
const qAt = (s, q) => Object.fromEntries(dimKeys(s.mod).map(k => [k, Math.round(Math.max(0, Math.min(99, q)) * 10) / 10]));
const worldQ = s => worldSota(s)?.q ?? null;
const rec = name => RELEASES.find(r => r.name === name);
const licenseOfTag = r => ((r.tags || []).includes('LP') ? 'permissive' : (r.tags || []).includes('LR') ? 'restrictive' : null);
let seq = 0;

// 由真实发布记录造一个玩家快照（只用于史实夹具）。
function snapFrom(s, r, { line = 'main', dims = null, gen = null } = {}) {
  const base = E.workingModel(s) || E.liveModel(s) || s.models?.[0] || { id: 'b', mod: s.mod, dims: {} };
  const st = structureForRelease(r.mod, r);
  const snap = { ...JSON.parse(JSON.stringify(base)), id: `fix_${r.id}_${seq++}`, name: r.name, mod: r.mod, stage: 'released',
    released: s.date, releasedDay: s.day, line, open: !!r.open, license: r.open ? licenseOfTag(r) : null,
    dims: { ...(dims || r.dims) }, total: st.total, active: st.active, arch: st.arch, cls: base.cls,
    evalTier: 'legacy', role: 'flagship', gen: gen ?? (s.gen ?? 2) };
  for (const k of ['hist', 'expect', 'badges', 'sota', 'hint', 'lineage', 'tainted', 'untainted']) delete snap[k];
  return snap;
}
// 在同一个局里发布一条史实型号（先按当天重放标签和对手，再走真实的 labelOnRelease + judgeRelease）。
function histRelease(s, name, opts = {}) {
  const r = rec(name);
  assert.ok(r, `没有这条史实发布：${name}`);
  setDay(s, r.day);
  rebuildSota(s);
  if (opts.before) s.sota.before = true;
  if (opts.last) s.expect.lastJudged.flagship = { ...opts.last };
  const snap = snapFrom(s, r, opts);
  const preview = expectPreview(s, snap);
  s.models.push(snap);
  const lab = labelOnRelease(s, snap);
  const ex = judgeRelease(s, snap, lab);
  return { snap, preview, lab, ex, x: s.expect.lastJudged.flagship?.modelId === snap.id ? s.expect.lastJudged.flagship.x : null };
}

// 数值夹具：按 q 造一款发布，直接给判定函数；控制 holder / live / lastJudged 来覆盖各种结果。
function synthSnap(s, q, extra = {}) {
  return { id: `syn_${seq++}`, name: '测试款', mod: s.mod, dims: qAt(s, q), total: s.mod === 'llm' ? 14 : undefined,
    active: s.mod === 'llm' ? 14 : undefined, cls: 'small', stage: 'released', released: s.date, releasedDay: s.day,
    line: 'main', open: false, license: null, role: 'flagship', gen: 2 + (seq % 500), techs: [...(s.techs || [])], ...extra };
}
function setLiveQ(s, q) {
  let m = E.liveModel(s);
  if (!m) { m = { id: 'live_test', name: '在线款', mod: s.mod, stage: 'released', dims: {}, line: 'main' }; s.models.push(m); s.live = m.id; }
  m.dims = qAt(s, q);
  return m;
}
function judgeOnly(s, q, { lab = { got: false, prev: { by: 'other', q: -Infinity } }, extra = {} } = {}) {
  const snap = synthSnap(s, q, extra);
  return { snap, ex: judgeRelease(s, snap, lab) };
}
function base(company = 'deepseek', scenario = 'y2025', day = '2025-07-01') {
  const s = E.createGame(company, scenario, 1);
  setDay(s, day);
  rebuildSota(s);
  s.queue = [];
  for (const id of Object.keys(s.products || {})) s.products[id].on = false;
  return s;
}
function noBadges(s) { for (const id of Object.keys(s.products || {})) s.products[id].on = false; }

describe('D11.1 期待档与 D11.10 状态', () => {
  it('initExpect / ensureExpect：D11.10 的形状；已有字段不覆盖，缺的补齐', () => {
    assert.deepEqual(initExpect(), { lastJudged: { flagship: null, small: null }, cool: {}, hot: null, worksDay: null, pending: null, ask: null, log: [] });
    const s = { expect: { hot: '2025-01-01' } };
    ensureExpect(s);
    assert.equal(s.expect.hot, '2025-01-01');
    assert.deepEqual(s.expect.lastJudged, { flagship: null, small: null });
    assert.equal(s.expect.ask, null);
    const t = {};
    assert.equal(ensureExpect(t), t.expect);
    assert.deepEqual(t.expect, initExpect());
  });
  it('冠军（炼出过 SOTA，永不过期）→ 小团队（small；specialist 没炼出过）→ 挑战者', () => {
    const ds = base('deepseek', 'y2025');
    assert.equal(expectPreview(ds, synthSnap(ds, 70)).tier, 'challenger');
    ds.sota.before = true;
    assert.equal(expectPreview(ds, synthSnap(ds, 70)).tier, 'champion');
    const rw = base('rwkv', 'y2025');
    assert.equal(expectPreview(rw, synthSnap(rw, 70)).tier, 'small');
    const su = base('suno', 'y2023');
    assert.equal(expectPreview(su, synthSnap(su, 70)).tier, 'small');
    su.sota.before = true;
    assert.equal(expectPreview(su, synthSnap(su, 70)).tier, 'champion');
  });
  it('这一版刚拿到的标签不把这次的期待档抬成冠军（判定用发布前的事实）', () => {
    const s = base('deepseek', 'y2025');
    const w = worldQ(s);
    const snap = synthSnap(s, w + 2, { open: true, license: 'permissive' });
    s.models.push(snap);
    const lab = labelOnRelease(s, snap);
    // 拿标以后 s.sota.made 里已经有这一款，但这次仍按挑战者判（下一次才按冠军）。
    assert.equal(s.sota.made.some(x => x.modelId === snap.id), !!lab.got);
    const ex = judgeRelease(s, snap, lab);
    assert.equal(ex.tier, 'challenger');
  });
});

describe('D11.11 史实夹具（真实标签 + 真实判定）', () => {
  it('DeepSeek-R1 y2025：开局后第一款，开源最强，x = −1.82，超出', () => {
    const { ex, snap, x } = histRelease(E.createGame('deepseek', 'y2025', 1), 'DeepSeek-R1');
    assert.equal(ex.result, 'over');
    assert.ok(snap.badges.includes('open_top'));
    assert.equal(x, -1.82);
  });
  it('DeepSeek-R1 y2024：R1-Lite 不及；V3 试算符合 → 加评；R1 试算超出 → 再加评，超出', () => {
    const s = E.createGame('deepseek', 'y2024', 1);
    setDay(s, '2024-11-20'); rebuildSota(s);
    // 史实里在这之前已有被评的旗舰（DeepSeek LLM 67B）；构造一条上次记录，避免“第一款”规则把 R1-Lite 判成平淡。
    s.expect.lastJudged.flagship = { modelId: 'old', day: '2024-08-01', q: 60, x: -5, gen: s.gen ?? 2, result: 'under' };
    const a = histRelease(s, 'DeepSeek-R1-Lite-Preview');
    assert.equal(a.ex.result, 'under');
    assert.equal(a.x, -5.58);
    const b = histRelease(s, 'DeepSeek-V3');
    assert.equal(b.ex.result, 'meet');
    assert.equal(b.ex.rejudge, true, '60 天内结果更好，加评');
    const c = histRelease(s, 'DeepSeek-R1');
    assert.equal(c.ex.result, 'over');
    assert.equal(c.ex.rejudge, true, '再加评');
    assert.equal(c.x, -1.82);
  });
  it('Qwen3-235B-A22B-2507 超出；Qwen2.5-72B、Llama 3.1 405B、Kimi K2、GLM-4.5 符合', () => {
    const cases = [
      ['qwen', 'y2025', 'Qwen3-235B-A22B-2507', 'over'],
      ['qwen', 'y2024', 'Qwen2.5-72B', 'meet'],
      ['llama', 'y2024', 'Llama 3.1 405B', 'meet'],
      ['kimi', 'y2025', 'Kimi K2', 'meet'],
      ['glm', 'y2025', 'GLM-4.5', 'meet'],
    ];
    for (const [char, sc, name, want] of cases) assert.equal(histRelease(E.createGame(char, sc, 1), name).ex.result, want, name);
  });
  it('Llama 4 Maverick：同日的 o3 先可见，x = −14.82，不及', () => {
    const { ex, x } = histRelease(E.createGame('llama', 'y2025', 1), 'Llama 4 Maverick', { last: { modelId: 'old', day: '2024-12-01', q: 60, x: -5, gen: 1, result: 'meet' } });
    assert.equal(ex.result, 'under');
    assert.equal(x, -14.22);
  });
  it('GPT-4o 冠军拿标领先 1.14 → 超出；GPT-4 Turbo 冠军接标 → 超出', () => {
    for (const [char, sc, name] of [['gpt', 'y2024', 'GPT-4o'], ['gpt', 'y2023', 'GPT-4 Turbo']]) {
      const { ex, lab, snap } = histRelease(E.createGame(char, sc, 1), name);
      if (name === 'GPT-4o') assert.equal(lab.got, true);
      assert.equal(ex.result, 'over', name);
      assert.ok(snap.badges);
    }
  });
  it('GPT-4.5 是副线不评；o3 拿标领先 0.60 → 符合', () => {
    const s = E.createGame('gpt', 'y2025', 1);
    const a = histRelease(s, 'GPT-4.5', { line: 'side' });
    assert.equal(a.ex.result, null, '副线不评');
    const b = histRelease(s, 'o3');
    assert.equal(b.ex.result, 'meet');
    assert.equal(b.lab.got, true);
  });
  it('Gemini 3.5 Flash、Llama 3.3 70B 是副线，不评', () => {
    assert.equal(histRelease(E.createGame('gemini', 'y2026', 1), 'Gemini 3.5 Flash', { line: 'side' }).ex.result, null);
    assert.equal(histRelease(E.createGame('llama', 'y2024', 1), 'Llama 3.3 70B', { line: 'side' }).ex.result, null);
  });
  it('Claude 3 Opus 拿到标签 → 超出', () => {
    const { ex, lab } = histRelease(E.createGame('claude', 'y2024', 1), 'Claude 3 Opus');
    assert.equal(lab.got, true);
    assert.equal(ex.result, 'over');
  });
  it('Grok 4：Grok 3 只持标 7 天之后，x = −1.32 → 不及；Grok 4.7 期待不过期，x = −2.56 → 不及', () => {
    const b = histRelease(E.createGame('grok', 'y2025', 1), 'Grok 4', { before: true });   // 史实里 Grok 3 拿过标签
    assert.equal(b.ex.tier, 'champion');
    assert.equal(b.ex.result, 'under');
    assert.equal(b.x, -1.32);
    const c = histRelease(E.createGame('grok', 'y2026', 1), 'Grok 4.7');
    assert.equal(c.ex.tier, 'champion');
    assert.equal(c.ex.result, 'under');
    assert.equal(c.x, -2.56);
  });
  it('Eleven Multilingual v2、Bark：场地不足先推迟，凑满那天补评 → 超出', () => {
    for (const [char, sc, name, fill] of [
      ['elevenlabs', 'y2023', 'Eleven Multilingual v2', '2023-11-06'],
      ['suno', 'y2023', 'Bark', '2023-06-12'],
    ]) {
      const s = E.createGame(char, sc, 1);
      const a = histRelease(s, name);
      assert.equal(a.ex.result, null, `${name} 先推迟`);
      assert.equal(s.expect.pending?.modelId, a.snap.id);
      setDay(s, fill); rebuildSota(s);
      const ex = judgeDeferred(s);
      assert.equal(ex.result, 'over', name);
      assert.equal(s.expect.pending, null);
    }
  });
});

describe('D11.4 判定：三档各种结果和防倒退', () => {
  it('挑战者：超出 / 符合 / 平淡 / 不及；倒退一律不及', () => {
    const s = base('deepseek', 'y2025');
    const w = worldQ(s);
    noBadges(s);
    assert.equal(judgeOnly(s, w - 0.5).ex.result, 'over');
    assert.equal(judgeOnly(s, w - 3).ex.result, 'meet');
    s.expect.lastJudged.flagship = null;
    setLiveQ(s, w - 30);
    assert.equal(judgeOnly(s, w - 20).ex.result, 'flat', '第一款达不到符合 → 平淡');
    s.expect.lastJudged.flagship = { modelId: 'x', day: addDays(s.day, -100), q: w - 20, x: -20, gen: 2, result: 'flat' };
    assert.equal(judgeOnly(s, w - 20).ex.result, 'under');
    setLiveQ(s, w + 3);
    assert.equal(judgeOnly(s, w + 2.8).ex.result, 'under', '倒退（低于在线旗舰 0.1 以上）直接不及');
  });
  it('冠军：拿标领先 → 超出；拿标但领先不足 → 符合；差 1 分以内 → 略低；其余 → 不及', () => {
    const s = base('gpt', 'y2025');
    s.sota.before = true;
    const w = worldQ(s);
    noBadges(s);
    const rival = { by: 'other', org: 'x', q: -Infinity };
    assert.equal(judgeOnly(s, w + 1.2, { lab: { got: true, prev: rival } }).ex.result, 'over');
    assert.equal(judgeOnly(s, w + 0.4, { lab: { got: true, prev: rival } }).ex.result, 'meet');
    s.sota.holder = { by: 'other', org: 'x', id: 'h', name: '对手', q: w };
    assert.equal(judgeOnly(s, w - 0.5).ex.result, 'under_half');
    assert.equal(judgeOnly(s, w - 2).ex.result, 'under');
    // 倒退（比在线旗舰低 REGRESS 以上）不享受“略低”。
    setLiveQ(s, w + 5);
    assert.equal(judgeOnly(s, w + 4.8).ex.result, 'under');
  });
  it('小团队：拿标/徽章 → 超出；首发 → 符合；其余 → 平淡；倒退 → 不及', () => {
    const s = base('rwkv', 'y2025');
    const w = worldQ(s);
    noBadges(s);
    assert.equal(judgeOnly(s, w - 20, { lab: { got: true, prev: { by: 'other' } } }).ex.result, 'over');
    s.expect.lastJudged.flagship = null;
    setLiveQ(s, w - 10);
    assert.equal(judgeOnly(s, w - 5).ex.result, 'meet', '首发');
    s.expect.lastJudged.flagship = { modelId: 'x', day: addDays(s.day, -100), q: w - 5, x: -5, gen: 2, result: 'meet' };
    assert.equal(judgeOnly(s, w - 9.5).ex.result, 'flat');
    setLiveQ(s, w + 5);
    assert.equal(judgeOnly(s, w + 4.8).ex.result, 'under', '倒退');
  });
  it('副线只对小团队评，而且只评超出', () => {
    const ds = base('deepseek', 'y2025');
    assert.equal(judgeOnly(ds, worldQ(ds) - 20, { extra: { line: 'side' } }).ex.result, null);
    const rw = base('rwkv', 'y2025');
    const w = worldQ(rw);
    noBadges(rw);
    assert.equal(judgeOnly(rw, w - 20, { extra: { line: 'side' } }).ex.result, null, '小团队副线不超出就不评');
    assert.equal(judgeOnly(rw, w - 20, { extra: { line: 'side' }, lab: { got: true, prev: { by: 'other' } } }).ex.result, 'over');
  });
  it('同一快照只评一次；开局继承的型号不评', () => {
    const s = base('deepseek', 'y2025');
    const w = worldQ(s);
    const { snap, ex } = judgeOnly(s, w - 0.5);
    const n = s.expect.log.length;
    assert.equal(judgeRelease(s, snap, { got: false }), ex);
    assert.equal(s.expect.log.length, n, '第二次不再写日志');
    assert.equal(judgeRelease(s, E.liveModel(s), null), null);
    assert.equal(judgeRelease(s, { ...snap, id: 'hist', hist: true }, { got: true }), null);
  });
});

describe('D11.5 奖惩、冷却和集团/上市', () => {
  it('EXPECT_FX 的形状和数值（D11.5）', () => {
    assert.deepEqual(EXPECT_FX.champion.over, { brand: 1.06, rep: 2, valuation: 1.06, stockShock: { self: 0.06 } });
    assert.deepEqual(EXPECT_FX.challenger.over, { brand: 1.10, rep: 3, valuation: 1.10, stockShock: { self: 0.06 } });
    assert.deepEqual(EXPECT_FX.small.over, { brand: 1.12, rep: 4, valuation: 1.10 });
  });
  it('超出：品牌、口碑、估值、股价都走 applyEffects；正面效果按新鲜度打折', () => {
    const s = base('deepseek', 'y2025');
    s.brand = 1; s.rep = 50; s.valuation = 1e9; s.capital.listed = true;
    s.flags.expectRelDay = addDays(s.day, -45);        // 半个月 → fresh ≈ 0.5
    const w = worldQ(s);
    const ex = judgeOnly(s, w - 0.5).ex;
    assert.equal(ex.result, 'over');
    assert.ok(s.brand > 1 && s.brand < 1.10, `品牌 ${s.brand}`);
    assert.equal(s.rep, 51.5);
    assert.ok(s.valuation > 1e9);
    assert.ok(s.flags.stockShock > 0);
    assert.equal(s.expect.hot, s.day);
  });
  it('差 1 分以内只罚一半：冠军略低，品牌 ×0.98、口碑 −1.5、估值 ×0.965', () => {
    const s = base('gpt', 'y2025');
    s.sota.before = true;
    s.sota.holder = { by: 'other', org: 'x', id: 'h', name: '对手', q: worldQ(s) };
    s.brand = 1; s.rep = 50; s.valuation = 1e9;
    const w = worldQ(s);
    const ex = judgeOnly(s, w - 0.5).ex;
    assert.equal(ex.result, 'under_half');
    assert.ok(Math.abs(s.brand - 0.98) < 1e-9, `品牌 ${s.brand}`);
    assert.equal(s.rep, 48.5);
    assert.ok(Math.abs(s.valuation / 1e9 - 0.965) < 1e-9);
  });
  it('冷却：同档“超出”奖励 180 天内只给一次；“不及”惩罚 180 天内最多一次', () => {
    const s = base('gpt', 'y2025');
    s.sota.before = true; noBadges(s);
    const w = worldQ(s);
    s.brand = 1;
    judgeOnly(s, w + 1.2, { lab: { got: true, prev: { by: 'other' } } });
    const first = s.brand;
    setDay(s, addDays(s.day, 100));
    s.expect.lastJudged.flagship = { ...s.expect.lastJudged.flagship, day: addDays(s.day, -100) };
    const e2 = judgeOnly(s, worldQ(s) + 1.2, { lab: { got: true, prev: { by: 'other' } }, extra: { gen: 3 } }).ex;
    assert.equal(e2.result, 'over');
    assert.equal(s.brand, first, '冷却期内的超出不再加品牌');
    setDay(s, addDays(s.day, 100));
    judgeOnly(s, worldQ(s) + 1.2, { lab: { got: true, prev: { by: 'other' } }, extra: { gen: 4 } });
    assert.ok(s.brand > first, '过了 180 天再给');

    const u = base('gpt', 'y2025');
    u.sota.before = true; u.sota.holder = { by: 'other', org: 'x', q: worldQ(u) }; noBadges(u);
    u.rep = 50;
    judgeOnly(u, w - 2);
    assert.equal(u.rep, 47);
    setDay(u, addDays(u.day, 100));
    judgeOnly(u, worldQ(u) - 2, { extra: { gen: 3 } });
    assert.equal(u.rep, 47, '冷却期内不再扣');
    setDay(u, addDays(u.day, 100));
    judgeOnly(u, worldQ(u) - 2, { extra: { gen: 4 } });
    assert.equal(u.rep, 44);
  });
  it('集团内团队不改估值；股价取母公司代码、幅度减半', () => {
    const s = base('gemini', 'y2025');
    s.sota.before = true; noBadges(s);
    s.valuation = 1e9;
    const w = worldQ(s);
    judgeOnly(s, w + 1.2, { lab: { got: true, prev: { by: 'other' } } });
    assert.equal(s.valuation, 1e9);
    assert.ok(Math.abs((s.flags.tickerShock?.GOOGL || 0) - 0.03) < 1e-9);
  });
  it('D11.6 追加预算：下一次被评旗舰降一档并清掉；略低降到不及按全额罚；推迟不消耗', () => {
    const s = base('gpt', 'y2025');
    s.sota.before = true; noBadges(s);
    const w = worldQ(s);
    s.expect.ask = { day: addDays(s.day, -5) };
    const ex = judgeOnly(s, w + 1.2, { lab: { got: true, prev: { by: 'other' } } }).ex;
    assert.equal(ex.result, 'meet', '超出 → 符合');
    assert.equal(s.expect.ask, null);

    const u = base('gpt', 'y2025');
    u.sota.before = true; u.sota.holder = { by: 'other', org: 'x', q: worldQ(u) }; noBadges(u);
    u.brand = 1; u.rep = 50; u.valuation = 1e9;
    u.expect.ask = { day: addDays(u.day, -2) };
    const uh = judgeOnly(u, worldQ(u) - 0.5).ex;
    assert.equal(uh.result, 'under', '略低 → 不及');
    assert.ok(Math.abs(u.brand - 0.96) < 1e-9, '按全额罚');
    assert.equal(u.rep, 47);

    const d = base('suno', 'y2023', '2023-04-01');
    d.expect.ask = { day: d.day };
    const snap = synthSnap(d, worldQ(d) ?? 30);
    snap.name = 'Bark';
    d.models.push(snap);
    judgeRelease(d, snap, labelOnRelease(d, snap));
    assert.ok(d.expect.pending, '场地不足，先推迟');
    assert.deepEqual(d.expect.ask, { day: '2023-04-01' }, '推迟不消耗');
  });
  it('加评只升不降：60 天内结果不比上次好时只发新闻，上次的结果不撤回', () => {
    const s = base('deepseek', 'y2025');
    const w = worldQ(s);
    noBadges(s);
    const a = judgeOnly(s, w - 0.5).ex;
    assert.equal(a.result, 'over');
    const last = { ...s.expect.lastJudged.flagship };
    const b = judgeOnly(s, w - 3, { extra: { gen: last.gen } }).ex;
    assert.equal(b.result, null);
    assert.deepEqual(s.expect.lastJudged.flagship, last, '上次的结果不撤回');
  });
  it('冠军期待不过期：同一款冠军发布放在上次持标结束后 30 天和 900 天，判定相同', () => {
    const mk = days => {
      const s = base('grok', 'y2026', days === 30 ? '2026-03-30' : '2026-09-01');
      s.sota.before = true; noBadges(s);
      s.expect.lastJudged.flagship = { modelId: 'old', day: addDays(s.day, -days), q: worldQ(s) + 5, x: -1, gen: 1, result: 'meet' };
      return judgeOnly(s, worldQ(s) - 0.5).ex;
    };
    assert.equal(mk(30).result, 'under_half');
    assert.equal(mk(900).result, 'under_half');
  });
});

describe('D11.2 徽章', () => {
  it('被污染的模型拿不到任何徽章；干净的同款照常判', () => {
    const s = base('rwkv', 'y2025');
    s.products.chat.on = true;
    s.techs.push('func_call');
    const w = worldQ(s);
    const clean = synthSnap(s, w + 2, { open: true, license: 'permissive', tainted: true });
    assert.deepEqual(badgesFor(s, clean), []);
    const warm = { ...clean, tainted: false, untainted: false };
    assert.ok(badgesFor(s, warm).length > 0, '干净的同款能拿徽章');
    const cured = { ...clean, untainted: true };
    assert.ok(badgesFor(s, cured).length > 0, '解除污染以后照常判');
  });
  it('社区之选：被污染、低于蒸馏基线时不给；高出同量级开源最强 1 分才给', () => {
    const s = base('rwkv', 'y2025');
    const w = worldQ(s);
    const snap = synthSnap(s, w + 2, { open: true, license: 'permissive', tainted: true });
    assert.ok(!badgesFor(s, snap).includes('community'));
    const clean = { ...snap, tainted: false, untainted: false };
    const b = badgesFor(s, clean);
    assert.ok(b.includes('community'), `社区之选：${b.join(',')}`);
    assert.ok(b.includes('open_top'));
    const low = { ...clean, dims: qAt(s, 0) };
    assert.ok(!badgesFor(s, low).includes('community'));
  });
  it('自蒸馏：被污染的旗舰自蒸馏出的小模型三枚徽章都不给；干净旗舰自蒸馏出的照常判', () => {
    const s = base('rwkv', 'y2025');
    const w = worldQ(s);
    const dirty = synthSnap(s, w + 2, { open: true, license: 'permissive', tainted: true, lineage: { kind: 'distill', relId: 'x' } });
    assert.deepEqual(badgesFor(s, dirty), []);
    const clean = { ...dirty, tainted: false, untainted: false };
    assert.ok(badgesFor(s, clean).length > 0);
  });
  it('非 LLM 的社区之选：同量级两款开源对手，q 比最强高 1 分才给（distillBaseline 为 null）', () => {
    const a = rec('Stable Audio 2.0'), b = rec('Udio 1.5');
    const keep = [a, b].map(r => ({ open: r.open, tags: r.tags }));
    try {
      for (const r of [a, b]) { r.open = true; r.tags = ['LP']; }
      const s = base('suno', 'y2024', '2024-08-01');
      const best = Math.max(...[a, b].map(r => qOf('music', relDims(s, r))));
      const yes = synthSnap(s, best + 1.5, { open: true, license: 'permissive', cls: 'mid' });
      assert.ok(badgesFor(s, yes).includes('community'));
      const no = synthSnap(s, best + 0.5, { open: true, license: 'permissive', cls: 'mid' });
      assert.ok(!badgesFor(s, no).includes('community'));
    } finally { [a, b].forEach((r, i) => Object.assign(r, keep[i])); }
  });
  it('开源最强：续训来的底座拿不到', () => {
    const s = base('rwkv', 'y2025');
    const snap = synthSnap(s, 99, { open: true, license: 'permissive', lineage: { kind: 'finetune', relId: 'r1' } });
    assert.ok(!badgesFor(s, snap).includes('open_top'));
    const clean = { ...snap, lineage: null };
    assert.ok(badgesFor(s, clean).includes('open_top'));
  });
  it('能干活：要 func_call；一年前同量级一款可见发布都没有时不发', () => {
    const s = base('rwkv', 'y2025');
    s.products.chat.on = true;
    const w = worldQ(s);
    const noFn = synthSnap(s, w + 2, { open: false });
    s.techs = s.techs.filter(x => x !== 'func_call');
    assert.ok(!badgesFor(s, { ...noFn, techs: [...s.techs] }).includes('works'));
    s.techs.push('func_call');
    assert.ok(badgesFor(s, { ...noFn, techs: [...s.techs] }).includes('works'));
    const early = base('rwkv', 'y2023', '2023-07-01');
    early.products.chat.on = true;
    early.techs.push('func_call');
    assert.ok(!badgesFor(early, synthSnap(early, 99, { open: false })).includes('works'), '一年前没有同量级发布');
  });
  it('枚举：每个小团队 × 剧本，都存在一款拿得到 works 或 community', () => {
    const companies = ['rwkv', 'perplexity', 'novelai', 'jev', 'suno', 'elevenlabs', 'midjourney'];
    for (const id of companies) for (const sc of ['y2023', 'y2024', 'y2025', 'y2026']) {
      const day = sc === 'y2026' ? '2026-07-01' : '2025-08-01';
      const s = base(id, sc, day);
      s.products.api.on = true;
      if (!s.techs.includes('func_call')) s.techs.push('func_call');
      const snap = synthSnap(s, 99, { open: true, license: 'permissive', total: s.mod === 'llm' ? 14 : undefined });
      const b = badgesFor(s, snap);
      assert.ok(b.includes('works') || b.includes('community'), `${id}/${sc}: ${b.join(',')}`);
    }
  });
});

describe('D11.3/D11.6/D11.12 预告、候选和联机', () => {
  it('expectPreview 与随后的 judgeRelease 在 1000 个随机状态上结果一致', () => {
    const all = [];
    for (const c of COMPANIES) for (const sc of SCENARIOS) all.push([c, sc]);
    let seed = 123456789;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const pick = a => a[Math.floor(rnd() * a.length)];
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    for (let i = 0; i < 1000; i++) {
      const [c, sc] = pick(all);
      const s = E.createGame(c.id, sc.id, 1 + (i % 7));
      const day = addDays(s.day, Math.floor(rnd() * 1000));
      if (day > '2026-09-30') { i -= 1; continue; }
      setDay(s, day);
      rebuildSota(s);
      const baseM = E.workingModel(s) || E.liveModel(s) || s.models[0] || { id: 'b', mod: s.mod, dims: {} };
      const w = worldQ(s);
      const target = clamp((w ?? 70) + rnd() * 14 - 7, 0, 99);
      const dims = qAt(s, target);
      const q = qOf(s.mod, dims);
      const line = releaseLine(s, { ...baseM, dims, mod: s.mod }, {});
      const o = releaseOpen(s, line);
      const gen = Math.floor(rnd() * 4);
      const snap = { ...JSON.parse(JSON.stringify(baseM)), id: `rnd_${i}`, name: '随机款', mod: s.mod, stage: 'released',
        released: s.date, releasedDay: s.day, line, open: o.open, license: o.license, dims, role: 'flagship', gen,
        total: s.mod === 'llm' ? Math.max(1, Math.round(7 + rnd() * 90)) : undefined,
        active: s.mod === 'llm' ? Math.max(1, Math.round(7 + rnd() * 90)) : undefined };
      for (const k of ['hist', 'expect', 'badges', 'sota', 'hint', 'lineage', 'tainted', 'untainted']) delete snap[k];
      if (rnd() < 0.5) s.expect.lastJudged.flagship = { modelId: 'old', day: addDays(day, -Math.floor(rnd() * 110)), q: q - 1, x: -1, gen: rnd() < 0.5 ? gen : gen + 1, result: pick(['over', 'meet', 'flat', 'under_half', 'under']) };
      if (rnd() < 0.2) s.expect.ask = { day: addDays(day, -10) };
      const p = expectPreview(s, snap);
      s.models.push(snap);
      const ex = judgeRelease(s, snap, labelOnRelease(s, snap));
      assert.equal(p?.result ?? null, ex?.result ?? null, `${c.id}/${sc.id}/${day} 预告 ${JSON.stringify(p)} 判定 ${JSON.stringify(ex)}`);
    }
  });
  it('D11.12 候选：预告按今天算；评测期间对手变强，发布当天按发布当天的对手判', () => {
    const s = E.createGame('gpt', 'y2025', 1);
    setDay(s, '2025-03-01'); rebuildSota(s);
    const before = worldQ(s);
    const m = synthSnap(s, before + 1.5);
    const p1 = expectPreview(s, m);
    assert.equal(p1.result, 'over');
    setDay(s, '2025-04-20'); rebuildSota(s);
    const after = worldQ(s);
    assert.ok(after > before, '评测期间对手变强了');
    const p2 = expectPreview(s, m);
    assert.equal(p2.result, 'under_half');
    const snap = { ...m, id: 'cand_1' };
    s.models.push(snap);
    const ex = judgeRelease(s, snap, labelOnRelease(s, snap));
    assert.equal(s.expect.lastJudged.flagship.x, Math.round((qOf(s.mod, snap.dims) - after) * 100) / 100, '按发布当天的对手算');
    assert.equal(ex.result, p2.result);
  });
  it('D11.8 预告和文案：没有年份，副线说清楚', () => {
    const s = base('deepseek', 'y2025');
    const p = expectPreview(s, synthSnap(s, worldQ(s) - 0.5));
    assert.ok(p.text.length > 0);
    assert.doesNotMatch(p.text, /\b(19|20)\d\d\b/);
    setLiveQ(s, worldQ(s) + 10);
    const side = expectPreview(s, synthSnap(s, worldQ(s) - 0.5));
    assert.match(side.text, /副线/);
    assert.equal(side.result, null);
  });
  it('送评面板勾了“顶替在线旗舰”：预告按旗舰评，和顶替发布当天的判定一致；不勾仍是副线', () => {
    const s = base('deepseek', 'y2025');
    setLiveQ(s, worldQ(s) + 10);
    const m = synthSnap(s, worldQ(s) - 0.5);
    assert.equal(releaseLine(s, m), 'side');
    assert.equal(releaseLine(s, m, { replace: true }), 'main');
    assert.equal(expectPreview(s, m).result, null, '不勾顶替：副线不评');
    const p = expectPreview(s, m, { replace: true });
    assert.notEqual(p.result, null, '勾了顶替：按旗舰评');
    assert.doesNotMatch(p.text, /副线/);
    const snap = { ...m, line: 'main' };
    s.models.push(snap);
    assert.equal(judgeRelease(s, snap, labelOnRelease(s, snap)).result, p.result);
  });
  it('D11.6 融资回报：真实的“超出”会带来 ev_hot_round；集团团队只出现 ev_group_budget；已上市不出现', () => {
    const report = { notes: [], costs: { total: 0 }, revenue: 0 };
    const ds = E.createGame('deepseek', 'y2025', 1);
    // P3.D 的史实树开局就带着“不拿外部融资”（blocks funding），融资类事件本来就不会出现；
    // 这一条测的是 D11.6 的融资回报，先摘掉这个特质。
    delete ds.strategy.spirits.ds_self_funded;
    histRelease(ds, 'DeepSeek-R1');
    assert.equal(ds.expect.hot, ds.day);
    ds.queue = []; ds.cool = {};
    conditionalEvents(ds, {}, report);
    assert.ok(ds.queue.some(q => q.id === 'ev_hot_round'), '投资人上门');
    assert.equal(ds.cool.ev_hot_round, addDays(ds.day, EXPECT.ROUND_COOL));

    const listed = clone(ds);
    listed.queue = []; listed.cool = {}; listed.capital.listed = true;
    conditionalEvents(listed, {}, report);
    assert.ok(!listed.queue.some(q => q.id === 'ev_hot_round'), '已上市不出现');

    const qw = E.createGame('qwen', 'y2025', 1);
    histRelease(qw, 'Qwen3-235B-A22B-2507');
    qw.queue = []; qw.cool = {};
    conditionalEvents(qw, {}, report);
    assert.ok(!qw.queue.some(q => q.id === 'ev_hot_round'));
    assert.ok(qw.news.some(n => /集团追加预算/.test(n.title)), '集团直接追加预算，只进新闻');
  });
  it('shouldHold（顾问和机器人共用）：真实的冠军预告为“不及/略低”、还在涨 → 再练一阵；预告变好就不等', () => {
    const s = E.createGame('gpt', 'y2025', 1);
    setDay(s, '2025-07-01'); rebuildSota(s);
    s.goals = []; s.queue = [];
    const w = E.workingModel(s);
    w.postDays = 60; w.relDays = 0;
    const wq = worldQ(s);
    w.dims = qAt(s, wq - 2);
    s.strategy.trail = { id: w.id, pts: [[addDays(s.day, -20), wq - 2.5]] };
    const p = expectPreview(s, w);
    assert.equal(p.tier, 'champion');
    assert.equal(p.result, 'under');
    assert.equal(shouldHold(s), true);
    assert.ok(E.advise(s).some(a => /先别急着送评/.test(a.detail || '')), '顾问会劝再练一阵');
    w.dims = qAt(s, wq + 2);
    assert.equal(expectPreview(s, w).result, 'over');
    assert.equal(shouldHold(s), false);
    w.dims = qAt(s, wq - 2);
    s.strategy.trail.pts = [[addDays(s.day, -20), wq - 2]];
    assert.equal(shouldHold(s), false, '近 30 天没涨');
  });
  it('冠军自家小幅升级：90.05 判符合；89.95 手动顶替判符合；低 0.2 判不及；89.95 不顶替是副线不评', () => {
    const mkState = () => {
      const s = base('gpt', 'y2025');
      s.sota.before = true;
      const w = worldQ(s);
      const own = w + 2;                                // 在线旗舰就是持标款，比对手最强高 2
      const live = setLiveQ(s, own);
      s.sota.holder = { by: 'me', org: s.company.org, id: live.id, name: live.name, q: own };
      return { s, own };
    };
    const run = delta => {
      const { s, own } = mkState();
      const snap = synthSnap(s, own + delta, { open: false });
      s.models.push(snap);
      const lab = labelOnRelease(s, snap);
      return { lab, ex: judgeRelease(s, snap, lab) };
    };
    const a = run(0.05);
    assert.equal(a.lab.got, true, '默认顶替并接标');
    assert.equal(a.ex.result, 'meet');
    const b = run(-0.05);
    assert.equal(b.ex.result, 'meet', '本公司仍持标，没有倒退');
    const c0 = run(-0.2);
    assert.equal(c0.ex.result, 'under');
    const { s } = mkState();
    const snap = synthSnap(s, worldQ(s) + 2 - 0.05, { open: false, line: 'side' });
    assert.equal(judgeRelease(s, snap, { got: false, prev: { by: 'me', q: worldQ(s) + 2 } }).result, null);
  });
});
