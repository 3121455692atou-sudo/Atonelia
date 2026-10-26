// 难度曲线（规格 D6、D9 第 6 条、第 11、12 条，P1.2）：H 的形状、冲顶力不够过不去、锚点不含玩家、首次比再次难、单维护栏、出生护栏、
// 自家线被隐藏、ρ 回退、自家史线的两条界、新手更难、临时锚、预估和实际一致、大额加分分段，以及附录表 0 的参考值。
// 时间冻结的夹具：同一天反复调 dailyFocus，对手线就固定不动（附录 A 的“静态夹具”）；每天把集群健康度拉满，不出 loss spike。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { SCENARIOS, PARAM_TOTALS, SCALES, DIRECTIONS } from '../../src/career/data/core.js';
import { RELEASES } from '../../src/career/data/rivals.js';
import { CURVE, SOTA, TRAIN_PACE } from '../../src/career/data/balance.js';
import {
  hardness, curveParams, curveH, applyGains, postPreview, workingModel, rhoOf, HEADROOM, birthClamp,
} from '../../src/career/sim/model.js';
import { anchor, anchorEnv, histOther, tempAnchor, worldSota, sotaMade, sotaWouldTake, labelOnRelease, qOf, Q_W, envelope } from '../../src/career/sim/sota.js';
import { newModel } from '../../src/career/sim/projects.js';

import { DAY } from '../../src/career/sim/loop.js';
import { addDays } from '../../src/career/sim/clock.js';
import { advance, resolveAll } from '../helpers/career_bot.mjs';
import { clone, baseJob } from '../helpers/career_util.mjs';
import { startJob } from '../../src/career/sim/jobs.js';
import { dailyFocus, projectTick, startFinetune } from '../helpers/legacy_jobs.mjs';
import * as L from '../helpers/legacy_jobs.mjs';

const fresh = (c, sc, seed = 1) => { const s = E.createGame(c, sc, seed); resolveAll(s); return s; };
const QK = mod => Object.keys(Q_W[mod]);
const trainDirs = s => DIRECTIONS[s.mod].filter(d => d.main && !d.special && d.key !== 'safety' && E.directionsFor(s).some(x => x.key === d.key));
// 这一天哪个方向的综合分涨得最多（机器人、顾问都是这么挑的）。
function bestDir(s) {
  let best = null, bv = -Infinity;
  for (const d of trainDirs(s)) {
    const p = postPreview(s, d.key);
    if (!p) continue;
    const v = Object.entries(p.gains).reduce((a, [k, x]) => a + (Q_W[s.mod][k] || 0) * x, 0);
    if (v > bv) { bv = v; best = d.key; }
  }
  return best;
}
// 同一天练一“天”：派方向、健康度拉满（不出 spike）、调 dailyFocus。
function trainOnce(s, dir = bestDir(s)) {
  const j = E.mainPostJob(s);
  if (j) { j.dir = dir; j.paused = false; } else startJob(s, { kind: 'post', target: 'main', dir, until: 'none' });
  s.health = 100;
  dailyFocus(s, { notes: [] });
}

// 时间冻结的夹具：jev y2025（没有自家史线、开局没有模型），装上一个在练模型，能力按世界包络的形状、综合分比对手最强低 gap；
// 上限 = 包络 + capOff（不另加技术上限）。made：开局就“炼出过”（ρ = 1.6），否则技术储备不足（ρ = 0.45）。全力：卡、数据、技术积累都给满。
function fixture({ made = true, gap = 3, capOff = 12, data = 2.5, gpus = 60000, know = 300, capExtra = {} } = {}) {
  const s = fresh('jev', 'y2025');
  s.sota.before = made;
  s.gpus = { owned: { H100: gpus }, rented: {} };
  s.inferShare = 0.05;
  s.data.post = Object.fromEntries(['chat', 'knowledge', 'code', 'math', 'safety', 'agent'].map(k => [k, data]));
  s.know = know;
  const env = envelope(s);
  const ws = worldSota(s).q;
  const c = qOf('llm', env) - ws + gap;
  const m = newModel(s, { total: 70, active: 70, arch: 'dense' }, { stage: 'post', role: 'flagship' });
  m.dims = Object.fromEntries(Object.entries(env).map(([k, v]) => [k, k === 'safety' ? 60 : Math.max(0, v - c)]));
  m.base = Object.fromEntries(Object.entries(env).map(([k, v]) => [k, v + capOff + (capExtra[k] || 0) - (HEADROOM.llm[k] || 8)]));
  m.kcap = null;
  s.models.push(m);
  s.working = m.id;
  s.queue = [];
  return s;
}
const lead = s => qOf('llm', workingModel(s).dims) - worldSota(s).q;

describe('附录表 0：H 的参考值和 F、b、W', () => {
  it('七种情况的 F、b、W 和 δ = −3…+3 的 H 与附录表 0 一致（两位小数）', () => {
    const T0 = [
      [1.5, 1.6, 0.85, 1.6, 0.94, [0.99, 0.95, 0.85, 0.45, 0.24, 0.13]],
      [0.9, 1.6, 0.69, 1.6, 0.94, [0.99, 0.89, 0.69, 0.37, 0.20, 0.11]],
      [0.6, 1.6, 0.34, 1.6, 0.94, [0.97, 0.77, 0.34, 0.18, 0.10, 0.05]],
      [1.5, 0.7, 0.52, 0.70, 2.14, [0.88, 0.70, 0.52, 0.13, 0.03, 0.01]],
      [1.5, 0.45, 0.34, 0.45, 3.33, [0.73, 0.51, 0.34, 0.04, 0, 0]],
      [0.9, 0.45, 0.19, 0.45, 3.33, [0.67, 0.40, 0.19, 0.02, 0, 0]],
      [0.3, 0.45, 0, 0.45, 3.33, [0.59, 0.26, 0, 0, 0, 0]],
    ];
    for (const [A, rho, F, b, W, hs] of T0) {
      const p = curveParams(A, rho);
      assert.deepEqual([p.F, p.b, p.W].map(x => x.toFixed(2)), [F, b, W].map(x => x.toFixed(2)), `A=${A} ρ=${rho}`);
      assert.deepEqual([-3, -1, 0, 1, 2, 3].map(d => curveH(d, p).toFixed(2)), hs.map(x => x.toFixed(2)), `A=${A} ρ=${rho}`);
    }
  });
});

describe('D9 第 6 条：难度曲线', () => {
  it('6.1 H 连续、单调不增：δ 从 −20 到 +10、步长 0.01，五组 (A, ρ)（含 ρ = 0.7），相邻两点不升、差 ≤ 0.02', () => {
    for (const [A, rho] of [[1.5, 1.6], [0.9, 1], [1.2, 0.45], [0.2, 0.45], [1.5, 0.7]]) {
      const p = curveParams(A, rho);
      let prev = curveH(-20, p);
      for (let i = 1; i <= 3000; i++) {
        const h = curveH(-20 + i * 0.01, p);
        assert.ok(h <= prev + 1e-12 && prev - h <= 0.02, `A=${A} ρ=${rho} δ=${(-20 + i * 0.01).toFixed(2)}`);
        prev = h;
      }
    }
  });

  it('6.2 冲顶力不高于 A0 时：对手线固定，1000 天内 q 始终低于锚点（只能无限逼近）', () => {
    const s = fixture({ data: 0 });
    const h0 = hardness(s);
    assert.ok(h0.A <= CURVE.A0 && h0.F === 0, `A=${h0.A}`);
    let top = -Infinity;
    for (let d = 0; d < 1000; d++) { trainOnce(s); top = Math.max(top, qOf('llm', workingModel(s).dims) - anchor(s)); }
    assert.ok(top < 0, `最高 ${top}`);
    assert.ok(top > -1, `确实贴上去了（最高 ${top}）`);
  });

  it('6.3 锚点不含玩家：发布间隔 14、60、120 天，领先到 +1 和 +3 的天数完全相同', () => {
    const runs = [14, 60, 120].map(every => {
      const s = fixture({ made: true });
      const rec = {};
      for (let d = 0; d < 1500 && rec[3] === undefined; d++) {
        trainOnce(s);
        if (d % every === every - 1) {
          const w = workingModel(s);
          const snap = { ...clone(w), id: `${w.id}r${d}`, stage: 'released', released: s.date, releasedDay: s.day, line: 'main' };
          s.models.push(snap);
          labelOnRelease(s, snap);
        }
        for (const x of [1, 3]) if (rec[x] === undefined && lead(s) >= x) rec[x] = d;
      }
      return rec;
    });
    assert.ok(Number.isFinite(runs[0][1]) && Number.isFinite(runs[0][3]), JSON.stringify(runs));
    assert.deepEqual(runs[1], runs[0]);
    assert.deepEqual(runs[2], runs[0]);
  });

  it('6.4 首次与再次：前沿全力从差 3 到能拿标签，“没炼出过 / 炼出过”的天数比在 1.5–2.5', () => {
    const days = made => {
      const s = fixture({ made });
      for (let d = 1; d <= 3000; d++) { trainOnce(s); if (sotaWouldTake(s, qOf('llm', workingModel(s).dims)) === true) return d; }
      return Infinity;
    };
    const rookie = days(false), maker = days(true);
    assert.ok(Number.isFinite(rookie) && Number.isFinite(maker), `${rookie} / ${maker}`);
    const ratio = rookie / maker;
    assert.ok(ratio >= 1.5 && ratio <= 2.5, `没炼出过 ${rookie} 天，炼出过 ${maker} 天，比值 ${ratio.toFixed(2)}`);
  });

  it('6.5 单维护栏：DeepSeek y2025 主攻数学 200 天，数学 ≤ 世界包络 + DIM_SLACK + 0.5；夹具里炼出过、全力只练数学 600 天，数学 ≤ 包络 + DIM_SLACK + 4', () => {
    const s = fresh('deepseek', 'y2025');
    L.decide(s, 'train', { dir: 'math' });
    let worst = -Infinity;
    for (let d = 0; d < 200; d++) {
      advance(s, 1);
      if (L.legacyFocus(s).kind !== 'train' || L.legacyFocus(s).dir !== 'math') { try { L.decide(s, 'train', { dir: 'math' }); } catch { /* 没有在练模型 */ } }
      const w = workingModel(s);
      if (w) worst = Math.max(worst, w.dims.math - anchorEnv(s).math);
    }
    assert.ok(worst <= CURVE.DIM_SLACK + 0.5, `DeepSeek 数学最多比包络高 ${worst}`);
    const f = fixture({ made: true, capExtra: { math: 12 } });
    let top = -Infinity;
    for (let d = 0; d < 600; d++) { trainOnce(f, 'math'); top = Math.max(top, workingModel(f).dims.math - anchorEnv(f).math); }
    assert.ok(top <= CURVE.DIM_SLACK + 4, `夹具数学最多比包络高 ${top}`);
    assert.ok(top > CURVE.DIM_SLACK, `护栏之前确实能练过去（${top}）`);
  });

  it('6.6 出生护栏：预训练、续训完成后 q ≤ 锚点 − BIRTH_GAP，各维 ≤ 包络 + DIM_SLACK；各剧本前沿配额能练出的最大底座也是', () => {
    const check = (s, m, what) => {
      assert.ok(qOf(s.mod, m.dims) <= anchor(s) - CURVE.BIRTH_GAP + 1e-9, `${what}：q ${qOf(s.mod, m.dims)} 锚点 ${anchor(s)}`);
      const env = anchorEnv(s);
      for (const k of QK(s.mod)) assert.ok(m.dims[k] <= env[k] + CURVE.DIM_SLACK + 1e-9, `${what} ${k}`);
    };
    let n = 0;
    for (const sc of SCENARIOS.map(x => x.id)) {
      for (const c of ['gpt', 'image2', 'suno', 'elevenlabs']) {
        const s = fresh(c, sc);
        if (baseJob(s)) E.cancelJob(s, baseJob(s).id);
        s.gpus.owned = { H100: 400000 };
        s.know = 400;
        let cfg = null;
        if (s.mod === 'llm') {
          const pool = E.poolStats(s).tokens;
          for (const total of [...PARAM_TOTALS].sort((a, b) => b - a)) {
            const c1 = { total, active: total, arch: 'dense', tokens: Math.max(1, Math.floor(pool * 4)) };
            const c2 = s.techs.includes('moe') ? { total, active: Math.max(1, Math.round(total / 18)), arch: 'moe', tokens: c1.tokens } : null;
            cfg = [c2, c1].find(x => x && E.projectCheck(s, x).ok);
            if (cfg) break;
          }
        } else cfg = [...SCALES[s.mod]].reverse().map(x => ({ scaleId: x.id, tokens: 3 })).find(x => E.projectCheck(s, x).ok);
        assert.ok(cfg, `${c} ${sc} 立不了项`);
        L.startProject(s, cfg);
        baseJob(s).pj.done = baseJob(s).pj.need;
        projectTick(s, { notes: [] }, DAY);
        assert.equal(E.hasBaseJob(s), false, `${c} ${sc} 底座练完了`);
        check(s, workingModel(s), `${c} ${sc} 预训练`);
        n++;
      }
    }
    // 续训（要公司策略的解锁项；这里直接写进状态）：在开源底座上续训，出生同样被护栏钳住。
    for (const [c, sc] of [['qwen', 'y2025'], ['rwkv', 'y2026'], ['jev', 'y2024']]) {
      const s = fresh(c, sc);
      if (baseJob(s)) E.cancelJob(s, baseJob(s).id);
      s.gpus.owned = { H100: 20000 };
      s.strategy = { unlocks: { adopt_open_base: s.day } };
      const r = RELEASES.filter(x => x.mod === 'llm' && x.open && x.day <= s.day && !E.isMine(s, x.family) && (x.tags || []).some(t => t === 'LP' || t === 'LR'))
        .sort((a, b) => qOf('llm', b.dims) - qOf('llm', a.dims))[0];
      startFinetune(s, { relId: r.id });
      baseJob(s).pj.done = baseJob(s).pj.need;
      projectTick(s, { notes: [] }, DAY);
      const m = workingModel(s);
      assert.deepEqual([m.lineage?.kind, m.tainted, Object.keys(m.post.teachers)], ['finetune', true, [r.family]], `${c} ${sc}`);
      check(s, m, `${c} ${sc} 续训 ${r.name}`);
      n++;
    }
    assert.equal(n, 19);
  });

  it('6.6 补：故意让底座按锚点 +8 出生，出生护栏照样钳在锚点 − 1', () => {
    const s = fixture({ made: true });
    const m = workingModel(s);
    const R = anchor(s), env = anchorEnv(s);
    for (const k of QK('llm')) m.dims[k] = env[k] + 8;
    birthClamp(s, m);
    assert.ok(qOf('llm', m.dims) <= anchor(s) - CURVE.BIRTH_GAP + 1e-9 && qOf('llm', m.dims) > R - CURVE.BIRTH_GAP - 0.01);
  });

  // 6.7 的前两小条（规格 D9 6.7）：G2 时按当时的节奏练不到，暂缓过；P4.2 复核时在现在的 TRAIN_PACE（0.8）下已经能过，恢复成正式用例。
  // 节奏再抬反而不过（能拿标就发会早得太多，和练到 58.8 才发相差超过 7 天），所以 P4.2 不动 TRAIN_PACE。
  it('6.7 自家线隐藏：GPT y2023 的在练模型（56.8）120 天内涨到 58.8；练到 58.8 才第一次发布和“能拿标就发”相差 ≤ 7 天', () => {
    // 夹具同附录表 7：自有后训练数据 2 档（2023 剧本开局一点都没有）。
    const run = holdUntil => {
      const s = fresh('gpt', 'y2023');
      s.data.post = Object.fromEntries(['chat', 'knowledge', 'code', 'math', 'safety', 'agent'].map(k => [k, 2]));
      const q0 = qOf('llm', workingModel(s).dims);
      assert.ok(q0 < 58.8, `起点 ${q0}`);
      for (let d = 1; d <= 120; d++) {
        if (d % 7 === 1) { const dir = bestDir(s); if (dir) L.decide(s, 'train', { dir }); }
        const w = workingModel(s);
        const q = qOf('llm', w.dims);
        if (q >= 58.8) return d;
        if (!holdUntil && !E.releaseBlock(s) && sotaWouldTake(s, q) === true) { try { L.decide(s, 'release', {}); } catch { /* 灰度中 */ } }
        advance(s, 1);
      }
      return Infinity;
    };
    const free = run(false), hold = run(true);
    assert.ok(free <= 120 && hold <= 120, `能拿标就发 ${free} 天，练到 58.8 才发 ${hold} 天`);
    assert.ok(Math.abs(free - hold) <= 7, `${free} / ${hold}`);
  });
  it('6.7 自家线隐藏：Claude y2026 开局 30 天，在练模型每天都涨', () => {
    const s = fresh('claude', 'y2026');
    for (let d = 0; d < 30; d++) {
      const before = qOf('llm', workingModel(s).dims);
      trainOnce(s);
      assert.ok(qOf('llm', workingModel(s).dims) > before, `第 ${d + 1} 天没涨`);
      s.day = addDays(s.day, 1);
    }
  });

  it('6.8 ρ 当前策略特质数值（缺策略拒绝）：DeepSeek y2025 0.45、GPT y2023 1.6、Gemini y2024 0.7；Gemini y2023 在 2023-11-16 以前 0.45、以后 0.7', () => {
    for (const [c, sc, rho] of [['deepseek', 'y2025', 0.45], ['gpt', 'y2023', 1.6], ['gemini', 'y2024', 0.7]]) {
      const s = fresh(c, sc);
      // 当前新局数值不变；删除策略的旧结构不能再走身份回退。
      const bare = clone(s);
      delete bare.strategy;
      assert.throws(() => rhoOf(bare), /不支持|策略树/);
      assert.ok(Math.abs(rhoOf(s) - rho) < 1e-12, `${c} ${sc} ${rhoOf(s)}`);
    }
    // Lyria 在 2023-11-16 拿到算数的标签：那天推进时（D10.5 的 kinTick）写 s.sota.kin，第二天起按“集团出过”算。
    const g = fresh('gemini', 'y2023');
    let switched = null;
    while (g.day <= '2023-12-31') {
      const r = rhoOf(g);
      if (g.day <= '2023-11-16') assert.ok(Math.abs(r - 0.45) < 1e-12, `${g.day} ${r}`);
      else { assert.ok(Math.abs(r - 0.7) < 1e-12, `${g.day} ${r}`); switched ??= g.day; }
      advance(g, 1);
    }
    assert.deepEqual([g.sota.kin, switched, sotaMade(g)], ['2023-11-16', '2023-11-17', false]);
  });

  it('6.8 没有策略树的存根被拒绝；当前树没有 sotaEase 特质时 ρ = 1', () => {
    const s = fresh('deepseek', 'y2025');
    s.strategy = { spirits: {} };
    const before = JSON.stringify(s);
    assert.throws(() => rhoOf(s), /不支持|策略树/); assert.equal(JSON.stringify(s), before);
    s.strategy.tree = 'deepseek';
    assert.equal(rhoOf(s), 1);
  });

  it('6.9 自家史线：没炼出过时锚点 ≤ max(对手最强, 别家史实 − 1)；不领先时锚点 − 对手最强 ≤ GHOST_CAP（12 家 × 4 剧本，开局和之后每 60 天）', () => {
    let n = 0;
    for (const sc of SCENARIOS.map(x => x.id)) {
      for (const cid of ['gpt', 'claude', 'gemini', 'deepseek', 'qwen', 'image2', 'midjourney', 'suno', 'elevenlabs', 'grok', 'llama', 'fable']) {
        const s = fresh(cid, sc);
        for (let k = 0; k < 6 && s.status === 'playing'; k++) {
          const ws = worldSota(s)?.q ?? null, ho = histOther(s), R = anchor(s);
          const bound = ws === null && ho === null ? tempAnchor(s) : Math.max(ws ?? -Infinity, ho === null ? -Infinity : ho - SOTA.HIST_SLACK);
          if (!sotaMade(s)) assert.ok(R <= bound + 1e-9, `${cid} ${sc} ${s.day}`);
          const w = workingModel(s);
          const leading = ws === null || s.sota?.holder?.by === 'me' || (!!w && sotaWouldTake(s, qOf(s.mod, w.dims)) === true);
          if (!leading) assert.ok(R - ws <= SOTA.GHOST_CAP + 1e-9, `${cid} ${sc} ${s.day}：${R} − ${ws}`);
          n++;
          advance(s, 60);
        }
      }
    }
    assert.ok(n > 200);
  });

  it('6.10 新手更难：Claude y2024 夹具（在练模型比对手最强低 1.5，玩家全力），20 个种子里没炼出过的一年内拿标局数 ≤ 炼出过的一半', () => {
    // 夹具同附录 A 的“前沿·玩家全力”：能力按世界包络的形状、比对手最强低 1.5，上限 = 包络 + 12，自有数据 2.2 档，技术积累约 1.15 倍同年前沿。
    const one = (seed, made) => {
      const s = fresh('claude', 'y2024', seed);
      s.sota.before = made;
      s.data.post = Object.fromEntries(['chat', 'knowledge', 'code', 'math', 'safety', 'agent'].map(k => [k, 2.2]));
      s.know = 180;
      const w = workingModel(s);
      const env = anchorEnv(s);
      const c = qOf('llm', env) - (worldSota(s).q - 1.5);
      for (const k of QK('llm')) { w.dims[k] = env[k] - c; w.base[k] = env[k] + 12 - HEADROOM.llm[k]; }
      w.capTechs = [...s.techs];
      w.kcap = null;
      let got = false;
      for (let d = 0; d < 365 && s.status === 'playing' && !got; d++) {
        if (d % 7 === 0) { const dir = bestDir(s); if (dir) L.decide(s, 'train', { dir }); }
        const m = workingModel(s);
        if (m && !E.releaseBlock(s) && sotaWouldTake(s, qOf('llm', m.dims)) === true) { try { L.decide(s, 'release', {}); } catch { /* 灰度中 */ } }
        advance(s, 1);
        got = s.sota.holder?.by === 'me';
      }
      return got;
    };
    const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
    const rookie = seeds.filter(x => one(x, false)).length, maker = seeds.filter(x => one(x, true)).length;
    assert.ok(maker > 0 && rookie <= maker / 2, `没炼出过 ${rookie}/20，炼出过 ${maker}/20`);
  });

  it('6.11 临时锚：Suno y2023 在第一条别家音乐发布（MusicGen）之前锚点就是临时锚（Bark 31.25），这段时间出生的 a3 底座 q ≤ 30.25', () => {
    // 规格写“2023-06-15 之前”是按月中估的；发布日表（D2）里 MusicGen 是 2023-06-12。
    const first = RELEASES.filter(r => r.mod === 'music' && r.family !== 'suno').sort((a, b) => a.day.localeCompare(b.day))[0];
    assert.equal(first.name, 'MusicGen');
    const s = fresh('suno', 'y2023');
    while (s.day < first.day) {
      assert.equal(anchor(s), tempAnchor(s), s.day);
      assert.ok(Math.abs(anchor(s) - 31.25) < 1e-9, `${s.day} ${anchor(s)}`);
      if (s.day === '2023-05-01') {
        if (baseJob(s)) E.cancelJob(s, baseJob(s).id);
        s.gpus.owned = { H100: 4000 };
        const scale = SCALES.music.find(x => x.id === 'a3');
        // 直接塞一项练满的底座作业（跳过立项检查，和原来直接写 s.project 一样）。
        s.jobs.list.push({ id: 'jtest', seq: 999, kind: 'pretrain', line: 'main', prio: 'high', cap: null, paused: false, since: s.day, rush: false, lab: null, need0: 1,
          pj: { type: 'pretrain', cfg: { scaleId: 'a3', tokens: 3 }, structure: { total: scale.total, active: scale.active, arch: 'dense', scaleId: 'a3' }, tokens: 3,
            need: 1, done: 1, start: s.date, acc: { w: 1, q: 1.6, effectiveQ: 1.6, repeat: 1, mix: { song: 1 }, cn: 0 } } });
        projectTick(s, { notes: [] }, DAY);
        const m = workingModel(s);
        assert.ok(qOf('music', m.dims) <= 30.25 + 1e-9, `a3 出生 ${qOf('music', m.dims)}`);
      }
      advance(s, 1);
    }
  });
});

describe('D9 第 11、12 条：预估和实际一致；大额加分分段', () => {
  it('11. 没有 spike、没有钳制的那天，postPreview 的预估涨幅和 dailyFocus 实际写入的涨幅相差 ≤ 1e-9', () => {
    let n = 0;
    for (const [c, sc] of [['deepseek', 'y2025'], ['gpt', 'y2023'], ['suno', 'y2024'], ['claude', 'y2026'], ['qwen', 'y2024']]) {
      const s = fresh(c, sc);
      for (const d of trainDirs(s)) {
        const p = postPreview(s, d.key);
        L.setFocus(s, { kind: 'train', dir: d.key });
        s.health = 100;
        const before = { ...workingModel(s).dims };
        dailyFocus(s, { notes: [] });
        const after = workingModel(s).dims;
        for (const k of Object.keys(before)) {
          const want = (p.gains[k] || 0) * DAY * TRAIN_PACE;
          assert.ok(Math.abs(after[k] - before[k] - want) <= 1e-9, `${c} ${sc} ${d.key} ${k}：预估 ${want} 实际 ${after[k] - before[k]}`);
        }
        n++;
      }
    }
    assert.ok(n >= 20);
  });

  it('12. 一次 dims 加分折成 Q 为 1.0、δ 从 0 起：实际涨幅等于按 0.1 一段逐段积分的结果，小于一次性按 δ = 0 乘 H', () => {
    const s = fixture({ made: true, gap: 0 });
    const w = workingModel(s);
    const R = anchor(s);
    for (const k of QK('llm')) w.dims[k] += (R - qOf('llm', w.dims));
    assert.ok(Math.abs(qOf('llm', w.dims) - R) < 1e-9);
    const g = Object.fromEntries(QK('llm').map(k => [k, 1.0]));
    // 逐段积分：每段 0.1（Q），按当时的 δ_k 算 H_k。
    const sim = clone(w);
    for (let i = 0; i < 10; i++) { const h = hardness(s, sim).H; for (const k of QK('llm')) sim.dims[k] += 0.1 * h[k]; }
    const once = curveH(0, hardness(s, w)) * 1.0;
    const q0 = qOf('llm', w.dims);
    const r = applyGains(s, w, g);
    assert.ok(Math.abs(r.G - (qOf('llm', sim.dims) - q0)) <= 1e-9, `${r.G} vs ${qOf('llm', sim.dims) - q0}`);
    assert.ok(r.G < once - 1e-6, `分段 ${r.G} < 一次性 ${once}`);
    // 后训练（preMixed）不再乘 H、不分段。
    const w2 = clone(workingModel(s));
    const r2 = applyGains(s, w2, { knowledge: 0.01 }, { preMixed: true });
    assert.ok(Math.abs(r2.applied.knowledge - 0.01) < 1e-12);
  });
});
