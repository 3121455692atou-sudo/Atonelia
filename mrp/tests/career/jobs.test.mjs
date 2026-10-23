// 训练作业（规格 T 章，P2.4a）：分卡、最快天数、作业位和线、健康与检修、重活口径、严重炸炉、上一代收尾、迁移、小底座防刷、专心研究、
// 闲置提醒、读旧字段报错、分卡不缓存（T12 的 jobs 清单）。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import { COMPANIES, SCENARIOS } from '../../src/career/data/core.js';
import { REPAIR } from '../../src/career/data/balance.js';
import { waterFill, postTick, baseTick, allocJobs, guardOldFields, setRepair, startJob } from '../../src/career/sim/jobs.js';
import { rand } from '../../src/career/sim/util.js';
import { researchSpeed, knowFx } from '../../src/career/sim/research.js';
import { addDays } from '../../src/career/sim/clock.js';
import { playGame, playAdvised, resolveAll, advance } from '../helpers/career_bot.mjs';
import { loadSave, clone, baseJob } from '../helpers/career_util.mjs';
import * as L from '../helpers/legacy_jobs.mjs';

const fresh = (id, sc, seed = 1) => { const s = E.createGame(id, sc, seed); resolveAll(s); return s; };
const out = () => ({ notes: [] });
// 让 s.rng 接下来几次 rand 依次落在给定的区间里（找一个种子，不改引擎）。
function rigRand(s, ...ranges) {
  for (let seed = 1; seed < 5e6; seed++) {
    const t = { rng: seed };
    if (ranges.every(([lo, hi]) => { const v = rand(t); return v >= lo && v < hi; })) { s.rng = seed; return; }
  }
  throw new Error('找不到合适的随机数种子');
}
// 把一项底座类作业直接练满（记账字段给个像样的值），下一次 baseTick 就出模型。
const fillUp = j => { Object.assign(j.pj, { done: j.pj.need }); if (j.pj.acc) Object.assign(j.pj.acc, { w: 1, q: 1.2, effectiveQ: 1.2, repeat: 1 }); };
const midMonth = s => { s.day = `${s.date}-15`; };

describe('T4.2 分卡', () => {
  it('表 T0：不设最低卡、不封顶时，底座 + 后训练 === 0.75 / 0.25，只有一项时 === 1', () => {
    const two = [{ w: 3, min: 0, upper: Infinity }, { w: 1, min: 0, upper: Infinity }];
    waterFill(two, 1);
    assert.ok(two[0].share === 0.75 && two[1].share === 0.25);
    for (const w of [3, 1]) { const one = [{ w, min: 0, upper: Infinity }]; waterFill(one, 1); assert.ok(one[0].share === 1); }
  });
  it('1. 分卡不变量（24×4 局机器人每天）：出租 + 推理 + Σ 实得卡 + 闲置 = 总卡；在跑的 ≥ 最低卡，排队的为 0；每项 ≤ max(最低卡, min(想要卡, cap))', () => {
    let days = 0;
    const bad = [];
    for (const c of COMPANIES) for (const sc of SCENARIOS) {
      playGame(c.id, sc.id, 1, {
        onDay: s => {
          if (s.status !== 'playing') return;
          days += 1;
          const al = allocJobs(s), ga = E.gpuAllocation(s);
          const sum = ga.leaseGpus + ga.inferGpus + al.items.reduce((a, i) => a + i.cards, 0) + al.free * al.T;
          const err = [];
          if (Math.abs(sum - ga.total) > 1e-6) err.push(`合计 ${sum} ≠ ${ga.total}`);
          for (const i of al.items) {
            if (i.run && i.cards + 1e-6 < i.minCards) err.push(`${i.job.id} 在跑却低于最低卡 ${i.cards}/${i.minCards}`);
            if (!i.run && i.cards !== 0) err.push(`${i.job.id} 排队却有卡`);
            if (i.run && i.cards > Math.max(i.minCards, Math.min(i.wantRaw, i.job.cap ?? Infinity)) + 1e-6) err.push(`${i.job.id} 超过想要卡`);
          }
          if (err.length && bad.length < 5) bad.push(`${c.id} ${sc.id} ${s.day}：${err.join('；')}`);
        },
      });
    }
    assert.deepEqual(bad, []);
    assert.ok(days > 50000, `${days}`);
  });
  it('3. 先保底座：推理份额调到 0.9，底座排在最前仍拿到最低卡，放不下的排队；前面排队不挡后面最低卡更小的作业', () => {
    const s = fresh('deepseek', 'y2025');
    E.setPlan(s, { total: 671, active: 37, arch: 'moe', tokens: 3 });
    const x = startJob(s, { kind: 'trial', type: 'tune', size: 'mid' });
    const base = startJob(s, { kind: 'pretrain', line: 'main', cfg: { total: 1000, active: 37, arch: 'moe', tokens: 2 } });
    const y = startJob(s, { kind: 'trial', type: 'mix', dim: 'code', size: 'small' });
    E.setInferShare(s, 0.9);
    let al = allocJobs(s);
    const bi = al.items.find(i => i.job === base);
    assert.equal(al.items[0], bi, '底座优先，排在最前（虽然开工比试验晚）');
    assert.ok(bi.run && bi.cards >= bi.minCards - 1e-9);
    // 前一项试验的最低卡抬到放不下（成本放大），后一项的放得下：前一项排队，后一项照跑。
    const left = al.T - bi.minCards;
    const phi = al.tf / al.T;
    x.cost = (left + 10) / 0.25 * phi * (x.minDays / 30);
    y.cost = 8 * phi * (y.minDays / 30);
    al = allocJobs(s);
    const xi = al.items.find(i => i.job === x), yi = al.items.find(i => i.job === y);
    assert.ok(xi.minCards > left);
    assert.equal(xi.why, 'min');
    assert.equal(xi.cards, 0);
    assert.ok(yi.run && yi.cards >= yi.minCards - 1e-9, '前面排队不挡后面最低卡更小的作业');
  });
  it('3b. 排队的规则（直接用分卡函数）：按顺序发最低卡，放不下就排队，后面放得下的照发', () => {
    const items = [{ w: 3, min: 0.6, upper: 1 }, { w: 1, min: 0.5, upper: 1 }, { w: 1, min: 0.1, upper: 1 }];
    let left = 1;
    const run = [];
    for (const it of items) if (left + 1e-12 >= it.min) { left -= it.min; run.push(it); } else it.share = 0;
    waterFill(run, 1);
    assert.deepEqual(run.map(i => i.min), [0.6, 0.1]);
    assert.ok(Math.abs(run.reduce((a, i) => a + i.share, 0) - 1) < 1e-12);
    assert.equal(items[1].share, 0);
  });
  it('4. 溢出回流：后训练吃饱（到想要卡）以后多出来的卡回给底座；所有作业都吃饱时剩下的记为闲置', () => {
    const s = fresh('deepseek', 'y2025');
    startJob(s, { kind: 'post', target: 'main', dir: 'code', until: 'none' });
    const base = startJob(s, { kind: 'pretrain', line: 'main', cfg: { total: 1000, active: 37, arch: 'moe', tokens: 6 } });
    const al = allocJobs(s);
    const bi = al.items.find(i => i.job === base), pi = al.items.find(i => i.job.kind === 'post');
    assert.ok(pi.cards < 0.25 * al.T, '后训练想要的卡少于四分之一');
    assert.ok(Math.abs(pi.cards - pi.wantCards) < 1e-6, '后训练拿满想要卡');
    assert.ok(bi.cards > 3 * pi.cards, '多出来的回给底座（不再是 3:1）');
    assert.ok(Math.abs(bi.cards - Math.min(bi.wantCards, al.T - pi.cards)) < 1e-6, '底座拿到剩下的，或者吃饱');
    base.cap = Math.ceil(bi.minCards * 1.5);
    const al2 = allocJobs(s);
    assert.ok(al2.items.find(i => i.job === base).cards <= base.cap + 1e-6);
    assert.ok(al2.free > 0.3, `闲置 ${al2.free}`);
    // 冲顶力只看底座没封顶时本该分到的份额（T4.6）：封顶不抬冲顶力。
    assert.ok(Math.abs(al2.baseShareFree - al.baseShare) < 1e-9);
  });
  it('16. 不缓存：同一天调推理份额以后，allocJobs 和立项预估立刻变；同一天里后训练先扣损耗，底座用的是扣完以后的 trainFlops', () => {
    const s = fresh('deepseek', 'y2025');
    const cfg = { total: 236, active: 236, arch: 'dense', tokens: 2 };
    startJob(s, { kind: 'post', target: 'main', dir: 'code', until: 'none' });
    const before = E.previewProject(s, cfg).days, T0 = allocJobs(s).T;
    E.setInferShare(s, 0.7);
    assert.ok(allocJobs(s).T < T0);
    assert.ok(E.previewProject(s, cfg).days > before);
    E.setInferShare(s, 0.5);
    const j = startJob(s, { kind: 'pretrain', line: 'main', cfg });
    s.health = 90;
    midMonth(s);
    rigRand(s, [0.99, 1]);
    postTick(s, out());
    assert.ok(s.health < 90, '后训练先扣了损耗');
    const pj = j.pj;
    const it = allocJobs(s).items.find(i => i.job === j);
    const expect = Math.min(E.trainFlops(s) * it.share * (1 + knowFx(s).pretrain) / 30, pj.need / E.fastestDays(s, pj.structure));
    const done0 = pj.done;
    rigRand(s, [0.99, 1]);
    baseTick(s, out());
    assert.ok(Math.abs(pj.done - done0 - expect) <= 1e-9 * expect, `${pj.done - done0} / ${expect}`);
  });
});

describe('T2.2 最快天数', () => {
  it('5. gpt y2026 全卡练 671B/37B、15T：48 天（±1）；DeepSeek-V3 的真实卡数（2048 张 H800）54 ± 3 天；Llama 3.1 405B（16384 张 H100）约 72 天', () => {
    let s = fresh('gpt', 'y2026');
    assert.ok(Math.abs(E.previewProject(s, { total: 671, active: 37, arch: 'moe', tokens: 15 }).days - 48) <= 1);
    assert.deepEqual([7, 14, 32, 70, 120, 236, 405, 671, 1000, 1600].map(t => Math.round(E.fastestDays(s, { total: t }))), [20, 24, 29, 34, 37, 41, 45, 48, 50, 53]);
    s = fresh('deepseek', 'y2025');
    // 这一段量的是“2048 张 H800 训练 DeepSeek-V3”的纯算力工期；P3.D 的树会带来“省卡训练”（train ×1.08）等特质，先摘掉。
    s.strategy.spirits = {};
    Object.assign(s, { gpus: { owned: { H800: 2560 }, rented: {} }, inferShare: 0.2, health: 90, know: 0, techs: [] });
    assert.equal(allocJobs(s).T, 2048);
    assert.equal(E.modifier(s, 'train'), 1);
    const v3 = E.previewProject(s, { total: 671, active: 37, arch: 'moe', tokens: 14.8 }).days;
    assert.ok(Math.abs(v3 - 54) <= 3, `${v3}`);
    Object.assign(s, { gpus: { owned: { H100: 20480 }, rented: {} } });
    const l3 = E.previewProject(s, { total: 405, active: 405, arch: 'dense', tokens: 15.6 }).days;
    assert.ok(Math.abs(l3 - 72) <= 3, `${l3}`);
  });
  it('赶工：进度 ×1.25 但不突破最快天数；取消底座时赶工跟着清掉', () => {
    const s = fresh('rwkv', 'y2024');
    const j = startJob(s, { kind: 'pretrain', line: 'main', cfg: { total: 7, active: 7, arch: 'dense', tokens: 2 } });
    const e0 = E.jobEta(s, j);
    E.setRush(s, j.id, true);
    const e1 = E.jobEta(s, j);
    assert.ok(e1 >= E.fastestDays(s, j.pj.structure) - 1e-9 && e1 <= e0);
    assert.equal(L.rushOn(s), true);
    E.cancelJob(s, j.id);
    assert.equal(L.rushOn(s), false);
  });
  it('立项检查：超过 365 天不让立，原因写“超过一年”和现在能练的最大规模；超过 270 天提示', () => {
    const s = fresh('rwkv', 'y2023');
    const c = E.jobCheck(s, { kind: 'pretrain', line: 'main', cfg: { total: 70, active: 70, arch: 'dense', tokens: 2 } });
    assert.equal(c.ok, false);
    assert.match(c.reason, /超过一年/);
    assert.match(c.reason, /现在能练的最大规模是|练不了/);
  });
});

describe('T3 作业位和线', () => {
  it('6a. 作业位 = max(按人, 按卡)，各五档；出租让自用卡变少时作业位跟着变', () => {
    const s = fresh('rwkv', 'y2023');
    s.gpus = { owned: { H100: 100 }, rented: {} };
    for (const [team, n] of [[18, 2], [59, 2], [60, 3], [119, 3], [120, 4], [240, 5], [479, 5], [480, 6], [5000, 6]]) { s.team = team; assert.equal(E.slotsByTeam(s), n, `${team} 人`); }
    s.team = 18;
    for (const [cards, n] of [[100, 2], [511, 2], [512, 3], [1024, 4], [2048, 5], [4096, 6], [99999, 6]]) { s.gpus.owned = { H100: cards }; assert.equal(E.slotsByCards(s), n, `${cards} 张`); assert.equal(E.jobSlots(s), n); }
    s.gpus.owned = { H100: 4096 };
    s.products.gpu_lease.gpus = 3700;
    assert.equal(E.jobSlots(s), 2, '租出去的卡不算自用卡');
  });
  it('6b. 作业位满时 startJob 拒绝底座和后训练，但试验照开；第 3 项试验拒绝；作业位变少时已有作业照跑', () => {
    const s = fresh('perplexity', 'y2025');
    assert.equal(E.jobSlots(s), 2);
    E.setPlan(s, { total: 70, active: 70, arch: 'dense', tokens: 2 });
    startJob(s, { kind: 'post', target: 'main', dir: 'code', until: 'none' });
    startJob(s, { kind: 'pretrain', line: 'main', cfg: { total: 7, active: 7, arch: 'dense', tokens: 1 } });
    assert.match(E.jobCheck(s, { kind: 'distill', cfg: { teacher: 'self', total: 7, active: 7, arch: 'dense', tokens: 1 } }).reason, /作业位已满（2\/2）/);
    startJob(s, { kind: 'trial', type: 'tune', size: 'small' });
    startJob(s, { kind: 'trial', type: 'mix', dim: 'code', size: 'small' });
    assert.match(E.jobCheck(s, { kind: 'trial', type: 'tune', size: 'mid' }).reason, /同时最多 2 项试验/);
    s.team = 5;
    assert.equal(s.jobs.list.length, 4);
    assert.ok(allocJobs(s).items.some(i => i.run));
  });
  it('6c. 主线第二个底座、小模型线第 4 个、同一模型第二项后训练、非语言模型开小模型线、小底座超过 min(120B, 参照 × 0.2)，都拒绝', () => {
    const s = fresh('gpt', 'y2025');
    startJob(s, { kind: 'pretrain', line: 'main', cfg: { total: 70, active: 70, arch: 'dense', tokens: 2 } });
    assert.match(E.jobCheck(s, { kind: 'pretrain', line: 'main', cfg: { total: 7, active: 7, arch: 'dense', tokens: 1 } }).reason, /主线已经有一项底座在练/);
    startJob(s, { kind: 'post', target: 'main', dir: 'code', until: 'none' });
    assert.match(E.jobCheck(s, { kind: 'post', target: 'main', dir: 'math' }).reason, /已经有一项后训练/);
    assert.match(E.jobCheck(s, { kind: 'pretrain', line: 'small', cfg: { total: 236, active: 236, arch: 'dense', tokens: 1 } }).reason, /小底座最大 min\(120B, 主线的 1\/5\)/);
    for (let i = 0; i < 3; i++) startJob(s, { kind: 'pretrain', line: 'small', cfg: { total: 14, active: 14, arch: 'dense', tokens: 1 } });
    assert.equal(E.smallLineCount(s), 3);
    assert.match(E.jobCheck(s, { kind: 'distill', cfg: { teacher: 'self', total: 7, active: 7, arch: 'dense', tokens: 1 } }).reason, /小模型线已满（3 个）/);
    const img = fresh('midjourney', 'y2025');
    assert.match(E.jobCheck(img, { kind: 'pretrain', line: 'small', cfg: { scaleId: 'i1', tokens: 1 } }).reason, /只有语言模型有小模型线/);
  });
});

describe('T4.5 健康与检修', () => {
  it('7a. 同类只取最重一项：底座 + RL 后训练 = 每月 −20；再加一项 SFT 后训练也不叠加', () => {
    const s = fresh('gpt', 'y2025');
    const rl = E.directionsFor(s).find(d => d.rl), sft = E.directionsFor(s).find(d => !d.rl);
    startJob(s, { kind: 'post', target: 'main', dir: rl.key, until: 'none' });
    startJob(s, { kind: 'pretrain', line: 'main', cfg: { total: 7, active: 7, arch: 'dense', tokens: 1 } });
    s.health = 90; midMonth(s);
    rigRand(s, [0.99, 1], [0.99, 1]);
    let h0 = s.health;
    postTick(s, out()); baseTick(s, out());
    assert.ok(Math.abs(s.health - (h0 - 20 / 30)) < 1e-9, `${s.health - h0}`);
    const sj = startJob(s, { kind: 'pretrain', line: 'small', cfg: { total: 14, active: 14, arch: 'dense', tokens: 1 } });
    fillUp(sj);
    baseTick(s, out());
    startJob(s, { kind: 'post', target: `small:${E.smallModels(s)[0].id}`, dir: sft.key });
    s.health = 90;
    rigRand(s, [0.99, 1], [0.99, 1], [0.99, 1]);
    h0 = s.health;
    postTick(s, out()); baseTick(s, out());
    assert.ok(Math.abs(s.health - (h0 - 20 / 30)) < 1e-9, `${s.health - h0}`);
  });
  it('7b. 检修：后训练全部暂停、留出 25% 训练卡、每天 +1.6，研究倍率 0.4、knowTick 0.03；自动检修每天查，< 40 开、≥ 75 关', () => {
    const s = fresh('gpt', 'y2025');
    startJob(s, { kind: 'post', target: 'main', dir: 'math', until: 'none' });
    s.health = 39; midMonth(s);
    postTick(s, out());
    assert.equal(s.jobs.repair, true);
    assert.ok(Math.abs(s.health - (39 + REPAIR.rate)) < 1e-9);
    const al = allocJobs(s);
    assert.equal(al.cap, 0.75);
    assert.equal(al.items.find(i => i.job.kind === 'post').why, 'repair');
    assert.deepEqual(E.heavyWork(s), { busy: 0.4, know: 0.03, kind: 'repair' });
    s.health = 75;
    postTick(s, out());
    assert.equal(s.jobs.repair, false);
  });
  it('7c. 兼容出口：先 maintain 再 train，检修自动关；先 maintain 再 research，检修关、后训练全部暂停', () => {
    const s = fresh('gpt', 'y2025');
    L.decide(s, 'train', { dir: 'code' });
    L.decide(s, 'maintain');
    assert.equal(s.jobs.repair, true);
    L.decide(s, 'train', { dir: 'math' });
    assert.equal(s.jobs.repair, false);
    assert.equal(E.mainPostJob(s).dir, 'math');
    L.decide(s, 'maintain');
    L.decide(s, 'research');
    assert.equal(s.jobs.repair, false);
    assert.ok(s.jobs.list.filter(j => j.kind === 'post').every(j => j.paused));
    assert.equal(L.legacyFocus(s).kind, 'research');
  });
  it('7d. 后训练进行时健康不会回升：只开后训练、留 90% 闲卡，30 天里除月结 +4 以外每天健康都不升', () => {
    const s = fresh('gpt', 'y2025');
    s.jobs.autoRepair = false;
    const j = startJob(s, { kind: 'post', target: 'main', dir: 'code', until: 'none' });
    j.cap = Math.max(E.minCards(s, j), Math.ceil(allocJobs(s).T * 0.1));
    s.health = 60;
    for (let i = 0; i < 30; i++) {
      const h = s.health, d = s.date;
      E.tickDay(s); resolveAll(s);
      if (s.date === d) assert.ok(s.health <= h + 1e-12, `${s.day} ${h} → ${s.health}`);
    }
    assert.ok(allocJobs(s).free > 0.85);
  });
});

describe('T4.7 重活口径', () => {
  it('8. 只开底座和试验 1.7 / 0.3；有后训练（含排队）0.4 / 0.08；只有刷榜 0.4 / 0.03；检修 0.4 / 0.03', () => {
    const s = fresh('deepseek', 'y2025');
    E.setPlan(s, { total: 671, active: 37, arch: 'moe', tokens: 3 });
    startJob(s, { kind: 'pretrain', line: 'main', cfg: { total: 7, active: 7, arch: 'dense', tokens: 1 } });
    startJob(s, { kind: 'trial', type: 'tune', size: 'small' });
    assert.deepEqual(E.heavyWork(s), { busy: 1.7, know: 0.3, kind: 'none' });
    const r1 = researchSpeed(s);
    const bench = ['aime25', 'gpqa', 'swebv', 'hle', 'mmlu', 'humaneval', 'arena'].find(id => E.benchmaxPreview(s, id));
    assert.ok(bench, '有能刷的榜');
    const p = startJob(s, { kind: 'post', target: 'main', bench, until: 'none' });
    assert.deepEqual(E.heavyWork(s), { busy: 0.4, know: 0.03, kind: 'benchmax' });
    E.setPost(s, p.id, { dir: 'code' });
    E.setInferShare(s, 0.9);
    assert.deepEqual(E.heavyWork(s), { busy: 0.4, know: 0.08, kind: 'post' }, '排队的也算');
    assert.ok(Math.abs(researchSpeed(s) / r1 - 0.4 / 1.7) < 1e-9);
    setRepair(s, true);
    assert.deepEqual(E.heavyWork(s), { busy: 0.4, know: 0.03, kind: 'repair' });
  });
});

describe('T2.2 严重炸炉', () => {
  it('9. 回退 = min(5 天进度, 25% 已完成)，当天不推进，记账按同一比例回滚', () => {
    const s = fresh('gpt', 'y2025');
    const j = startJob(s, { kind: 'pretrain', line: 'main', cfg: { total: 236, active: 236, arch: 'dense', tokens: 4 } });
    midMonth(s);
    for (let i = 0; i < 20; i++) { rigRand(s, [0.99, 1]); baseTick(s, out()); }
    const pj = j.pj;
    const it = allocJobs(s).items.find(i => i.job === j);
    const rate = Math.min(E.trainFlops(s) * it.share * (1 + knowFx(s).pretrain) / 30, pj.need / E.fastestDays(s, pj.structure));
    const done = pj.done, w = pj.acc.w;
    const p = E.projectRisk(s, pj.structure) / 30;
    rigRand(s, [0, p * 0.5], [0, 0.4]);
    const o = out();
    baseTick(s, o);
    assert.equal(o.blowup, 'severe');
    const back = Math.min(5 * rate, 0.25 * done);
    assert.ok(Math.abs(done - pj.done - back) <= 1e-6 * done, `${done - pj.done} / ${back}`);
    assert.ok(Math.abs(pj.acc.w - w * (done - back) / done) <= 1e-9);
    assert.equal(pj.blowups.severe, 1);
  });
});

describe('T2.4 后训练结束条件', () => {
  it('13c. 自动方向 + 练到涨不动：安全对齐不算以后会自己结束', () => {
    const s = fresh('gpt', 'y2023');
    const b = startJob(s, { kind: 'pretrain', line: 'main', cfg: { total: 70, active: 70, arch: 'dense', tokens: 2 } });
    fillUp(b);
    baseTick(s, out());
    // 练到其他方向都接近上限、只剩安全对齐涨幅很高：安全对齐算进“涨不动”时就永远停不下来。
    const m = E.workingModel(s), caps = E.computeCaps(s, m);
    for (const k of Object.keys(m.dims)) if (k !== 'safety') m.dims[k] = Math.max(0, caps[k] - 0.2);
    const j = startJob(s, { kind: 'post', target: 'main', dir: 'auto', until: 'stall' });
    let ended = false;
    for (let d = 0; d < 60 && s.status === 'playing'; d++) {
      advance(s, 1);
      if (!s.jobs.list.includes(j)) { ended = true; break; }
    }
    assert.ok(ended, `自动方向的后训练没有自己结束（跑了 ${j.days || 0} 天）`);
  });
});

describe('T7 上一代收尾', () => {
  it('10. 新底座练完时有未发布进步的旧模型进入收尾，60 天内能送评发布，到期归档；没有进步的直接顶替', () => {
    const s = fresh('gpt', 'y2025');
    const old = E.workingModel(s);
    old.postDays = 30; old.relDays = 0;
    const j = startJob(s, { kind: 'pretrain', line: 'main', cfg: { total: 7, active: 7, arch: 'dense', tokens: 1 } });
    fillUp(j);
    baseTick(s, out());
    assert.notEqual(s.working, old.id);
    assert.equal(s.prevWorking.id, old.id);
    assert.equal(s.prevWorking.until, addDays(s.day, 60));
    assert.equal(E.prevModel(s), old);
    resolveAll(s);
    const r = L.decide(s, 'submit', { modelId: old.id, tier: 'quick' });
    assert.equal(r.kind, 'submit');
    assert.equal(r.eval.line, 'prev');
    s.day = s.prevWorking.until;
    postTick(s, out());
    assert.equal(s.prevWorking, null, '到期归档');
    assert.ok(s.evals.some(e => e.modelId === old.id), '已经在评测中的候选照常发布');
    const cur = E.workingModel(s);
    cur.postDays = 0; cur.relDays = 0;
    const j2 = startJob(s, { kind: 'pretrain', line: 'main', cfg: { total: 7, active: 7, arch: 'dense', tokens: 1 } });
    fillUp(j2);
    baseTick(s, out());
    assert.equal(s.prevWorking, null, '没有进步的直接顶替');
  });
});

describe('T11.3 迁移', () => {
  const dir = new URL('../fixtures/saves/', import.meta.url);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('.'));
  it('11. 6 份 v3 夹具：底座作业的 pj 等于原 s.project，主线后训练的方向、榜单、since 等于原 s.focus，maintain 变成检修；第一天不排队；idle 迁移成没有作业', () => {
    assert.equal(files.length, 6);
    for (const f of files) {
      const raw = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
      const s = loadSave(raw);
      const base = s.jobs.list.find(E.isBaseJob);
      if (raw.project) {
        assert.ok(base, `${f} 有项目`);
        for (const k of ['type', 'need', 'done', 'start', 'tokens', 'structure']) assert.deepEqual(base.pj[k], raw.project[k], `${f} pj.${k}`);
        assert.equal(base.prio, 'high');
        assert.equal(base.rush, !!raw.flags?.push);
        assert.ok(Number.isFinite(base.legacyMin));
      } else assert.equal(base, undefined);
      const post = s.jobs.list.find(j => j.kind === 'post');
      if (['train', 'benchmax'].includes(raw.focus?.kind)) {
        assert.equal(post.dir ?? null, raw.focus.dir ?? null);
        assert.equal(post.bench ?? null, raw.focus.bench ?? null);
        assert.equal(post.since, raw.focus.since);
        assert.equal(post.until, 'none');
      } else assert.equal(post, undefined);
      assert.equal(s.jobs.repair, raw.focus?.kind === 'maintain');
      const json = JSON.parse(JSON.stringify(s));
      assert.ok(!('project' in json) && !('focus' in json) && !('push' in json.flags) && !('postPaused' in json.flags));
      assert.ok(s.models.filter(m => m.stage === 'released').every(m => m.evalTier === 'legacy'));
      assert.ok(allocJobs(s).items.every(i => i.why !== 'min'), `${f} 读档就排队`);
      assert.ok(E.validateGame(s));
    }
    const raw = JSON.parse(fs.readFileSync(new URL(files[0], dir), 'utf8'));
    const idle = loadSave({ ...raw, focus: { kind: 'idle', since: '2025-01-01' }, project: null });
    assert.deepEqual(idle.jobs.list, []);
    assert.deepEqual(idle.jobs.focusPause, []);
  });
});

describe('T2.3 小底座防刷', () => {
  it('12. 一年内连练 10 个小底座（14B、120B 混着）：研发经验每代只给第一个、乘规模比；s.gen、s.working 都不变', () => {
    const s = fresh('gpt', 'y2025');
    const gen = s.gen, working = s.working;
    const ref = E.refModel(s).total;
    let gained = 0;
    for (let i = 0; i < 10; i++) {
      const total = i % 2 ? 120 : 14;
      const j = startJob(s, { kind: 'pretrain', line: 'small', cfg: { total, active: total, arch: 'dense', tokens: 2 } });
      fillUp(j);
      const k0 = s.know;
      baseTick(s, out());
      gained += s.know - k0;
      for (const m of E.smallModels(s)) L.decide(s, 'submit', { modelId: m.id, tier: 'skip', role: 'small' });
      assert.equal(s.gen, gen);
      assert.equal(s.working, working);
    }
    const smalls = s.models.filter(m => m.origin === 'pretrain' && m.role === 'small');
    assert.equal(smalls.length, 10);
    const first = smalls[0];
    assert.ok(Math.abs(gained - first.pretraining.experience.credit) < 1e-9);
    assert.ok(first.pretraining.experience.credit < 5, '14B 在 1600B 主线下打折');
    assert.equal(smalls.filter(m => m.pretraining.experience.credit > 0).length, 1);
    assert.ok(ref >= 600);
  });
});

describe('T4.7 专心研究', () => {
  it('13. 主线、上一代、小模型各挂一项后训练：focusResearch 以后三项都暂停、研究倍率 1.7；恢复后三项一起恢复', () => {
    const s = fresh('gpt', 'y2025');
    E.workingModel(s).postDays = 20;
    const j = startJob(s, { kind: 'pretrain', line: 'main', cfg: { total: 70, active: 70, arch: 'dense', tokens: 1 } });
    fillUp(j);
    baseTick(s, out());
    const sj = startJob(s, { kind: 'pretrain', line: 'small', cfg: { total: 14, active: 14, arch: 'dense', tokens: 1 } });
    fillUp(sj);
    baseTick(s, out());
    const small = E.smallModels(s)[0];
    startJob(s, { kind: 'post', target: 'main', dir: 'code', until: 'none' });
    startJob(s, { kind: 'post', target: 'prev', dir: 'code' });
    startJob(s, { kind: 'post', target: `small:${small.id}`, dir: 'writing' });
    assert.equal(E.heavyWork(s).busy, 0.4);
    const r = E.focusResearch(s, true);
    assert.equal(r.paused.length, 3);
    assert.ok(s.jobs.list.filter(x => x.kind === 'post').every(x => x.paused));
    assert.deepEqual(E.heavyWork(s), { busy: 1.7, know: 0.3, kind: 'none' });
    E.focusResearch(s, false);
    assert.ok(s.jobs.list.filter(x => x.kind === 'post').every(x => !x.paused));
    assert.equal(s.jobs.focusPause, null);
  });
  it('13b. 专心研究时新开一项后训练：自动恢复后训练，第二天就在推进、拿到了卡', () => {
    const s = fresh('gpt', 'y2025');
    const sb = startJob(s, { kind: 'pretrain', line: 'small', cfg: { total: 14, active: 14, arch: 'dense', tokens: 1 } });
    fillUp(sb);
    baseTick(s, out());
    const small = E.smallModels(s)[0];
    const main = startJob(s, { kind: 'post', target: 'main', dir: 'code', until: 'none' });
    E.focusResearch(s, true);
    assert.ok(main.paused);
    const j = startJob(s, { kind: 'post', target: `small:${small.id}`, dir: 'writing', until: 'none' });
    assert.equal(j.paused, false, '新开的后训练不该跟着暂停');
    assert.equal(s.jobs.focusPause, null, '自动退出了专心研究');
    assert.equal(main.paused, false, '原来暂停的后训练一起恢复');
    assert.ok(s.jobs.log.some(x => x.text === '已恢复后训练'));
    assert.ok(allocJobs(s).items.find(i => i.job === j).cards > 0, '拿到了卡');
    const days0 = j.days || 0;
    E.tickDay(s);
    assert.ok((j.days || 0) > days0, '第二天在推进');
  });
});

describe('T9.2 闲置提醒与大按钮', () => {
  it('14. 大按钮跑 gpt y2026 一整局 0 次报错；作业类建议执行后当天和隔 1–6 天都不再出；“调高推理份额”只在负载 > 0.8 时出现', () => {
    const { errors, s: end } = playAdvised('gpt', 'y2026', 1);
    assert.deepEqual(errors, []);
    assert.ok(end.status !== 'playing');
    // 构造负载 > 0.8、训练卡闲置的局面：闲置建议应该提议调高推理份额。
    const s = fresh('gpt', 'y2026');
    const live = E.liveModel(s);
    s.smallLive = live.id;
    live.releasedDay = s.day;
    s.jobs.smallCredit[s.gen] = true;
    s.inferShare = 0.5;
    s.service.last = { ...(s.service.last || {}), needGpu: 2 * E.inferGpuEq(s) };
    s.jobs.idle.since = addDays(s.day, -7);
    const a = E.advise(s).find(x => x.id === 'jobs:idle');
    assert.ok(a, '负载 > 0.8 时应给出闲置建议');
    assert.match(a.label, /推理份额调到/, '负载 > 0.8 时提议调高推理份额');
    E.applyAdvice(s, a);
    // 每天把局面恢复成“闲置卡够、负载 > 0.8”，只有 7 天冷却能挡住同一条建议。
    for (let d = 0; d <= 6; d++) {
      if (d > 0) advance(s, 1);
      s.inferShare = 0.5;
      s.service.last = { ...(s.service.last || {}), needGpu: 2 * E.inferGpuEq(s) };
      s.jobs.idle.since = addDays(s.day, -7);
      assert.ok(!E.advise(s).some(x => x.id === a.id), `${a.id} 在 ${d} 天后又出`);
    }
  });
});

describe('T11.2 读旧字段报错', () => {
  it('15. 测试环境里读写 s.project、s.focus 抛错；JSON.stringify(s) 里没有这两个键；读档的、深拷贝的也一样', () => {
    const s = fresh('deepseek', 'y2025');
    assert.throws(() => s.project, /s\.project 已删除/);
    assert.throws(() => s.focus, /s\.focus 已删除/);
    assert.throws(() => { s.project = null; }, /已删除/);
    const json = JSON.stringify(s);
    assert.ok(!/"project":/.test(json) && !/"focus":/.test(json));
    const back = loadSave(JSON.parse(json));
    assert.throws(() => back.project, /已删除/);
    assert.throws(() => clone(s).focus, /已删除/);
    assert.equal(guardOldFields(back), back);
    assert.ok(baseJob(s) === null);
  });
});
