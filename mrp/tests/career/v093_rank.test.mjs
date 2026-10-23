// v0.9.3 合并 M4：取家族最强、开局统一、榜单逐模型成绩（审查 B2，规格 D1，2026-10-21 决定第 1、2 项）。
// 迁自外部 v0.9.2 改动包 tests/test_rank_integrity.mjs：玩家旧旗舰保留成绩、未来与换题前成绩不进榜、轻量款不挤掉旧旗舰、
// 同一家不同榜由不同版本领先、先筛开源再选老师、窄专项第一不等于综合最强、安全榜越低越好、同分同名次、0 分并列。
// 改动：bestRelease 不再有默认打分（G6-2）；“全行业观察者”状态在这里自己造，
// 不再引外部包的审计脚本；46 个月穷举审计换成下面几条独立的暴力对照。没迁的：
//   - “构造能力更高的小模型可以领先”：规格 D5 会钳制跟随者，这条到 v1.0 必然要改，和本次合并的改动无关（审查 G5-2）。
// 其余按审查 B2 的先修（G6-2、G6-8、modelId、G4-16）和决定第 1 项（Llama y2025 开局是 3.1 405B、里程碑按钮写实际老师）补写。
// P1.1：旧的“家族最强”“最新一款”“对手综合分列表”和按日期变权重的综合分都删了，换成 sota.js 的 familyBest、orgBest、benchBest、
// rivalStandings、qOf（规格 D1、D1.1）：发布按日可见，对手按 org 一行，量级榜先按量级筛再取最强（原来留给 P1.1 的那条，现在按新口径锁住）；
// 断言的意思不变，个别日期按“按日可见”挪了几天。全库搜不到旧函数名由 rivals.test.mjs（规格 D4 第 7 条）检查。
import { describe, it } from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { loadSave } from '../helpers/career_util.mjs';
import { FAMILIES, RELEASES, RAW_RELEASES, setReleases } from '../../src/career/data/rivals.js';
import { BENCHMARKS, BENCH_BY_ID, lastRefresh } from '../../src/career/data/benchmarks.js';
import { addMonths } from '../../src/career/data/core.js';
import { rivalMatch } from '../../src/career/sim/milestones.js';
import { advance, resolveAll } from '../helpers/career_bot.mjs';
import * as L from '../helpers/legacy_jobs.mjs';

const clone = v => JSON.parse(JSON.stringify(v));
const readSrc = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const q = r => E.qOf(r.mod, r.dims);
const withCatalog = (rows, fn) => {
  setReleases(rows);
  try { fn(); } finally { setReleases(RAW_RELEASES); }
};
// 不扮演任何公司的“全行业观察者”：只看对手表，没有自己的模型和成绩。
function observer(mod, date) {
  return {
    charId: '__observer__', mod, date, day: `${date}-01`,
    company: { company: '全行业观察者', country: 'US', open: false },
    models: [], live: null, working: null, smallLive: null, smallWorking: null, published: {},
    products: {}, service: { last: null, integrations: { tools: [], mode: 'none' } },
    timers: {}, flags: {}, persona: { name: '观察者' }, brand: 1, rep: 60,
  };
}
function months(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addMonths(d, 1)) out.push(d);
  return out;
}
// 暴力对照：把截至某天的发布逐条打分，取最高；同分取发布日较晚的，同一天取表里靠后的一行。
function bruteBest(pick, day, score) {
  let best = null, top = -Infinity;
  const list = RELEASES.filter(r => pick(r) && r.day <= day).sort((a, b) => a.day.localeCompare(b.day) || a.ord - b.ord);
  for (const r of list) if (score(r) >= top) { best = r; top = score(r); }
  return best;
}

describe('玩家：每款已发布模型各自保留成绩', () => {
  it('发布较弱的新底座后，旧旗舰的成绩留在榜上；发布回执报的是新版本自己的名次', () => {
    const s = E.createGame('gpt', 'y2025', 59);
    resolveAll(s);
    const old = E.liveModel(s), oldScore = old.benchmarks.arena.score;
    L.startProject(s, { total: 3, active: 3, arch: 'dense', tokens: 0.3 });
    L.decide(s, 'train', { dir: 'math' });
    for (let i = 0; i < 90 && (E.hasBaseJob(s) || E.releaseBlock(s)); i++) advance(s, 1);
    assert.equal(E.hasBaseJob(s), false);
    assert.equal(E.workingModel(s).total, 3);
    // 比在线旗舰弱的版本默认作为副线发布（规格 D1）；这里要它上线，勾上“顶替在线旗舰”。
    const release = L.decide(s, 'release', { replace: true });
    const arena = release.runs.find(x => x.benchId === 'arena');
    assert.ok(arena.score < oldScore);
    assert.equal(arena.rank.model, release.model.name, '新版本不能冒领旧版的名次');
    advance(s, 6);
    assert.equal(E.liveModel(s).id, release.model.id);
    const mine = E.leaderboard(s, 'arena').rows.find(r => r.mine && r.role === 'flagship');
    assert.deepEqual([mine.name, mine.score, mine.modelId], [old.name, oldScore, old.id]);
    assert.equal(E.leaderboard(s, 'arena', { cls: 'small' }).rows.find(r => r.mine).name, release.model.name);
    assert.equal(E.leaderboard(s, 'arena', { cls: E.clsOf(old) }).rows.find(r => r.mine).name, old.name);
    assert.deepEqual(Object.keys(release.model.benchmarks).sort(), release.runs.map(r => r.benchId).sort(), '新版本只记自己跑出来的成绩');
  });

  it('晚于榜单日期的成绩不能穿越进过去的榜，换题以前的成绩不进当前榜', () => {
    const s = E.createGame('gpt', 'y2025', 59);
    assert.ok(E.leaderboard(s, 'arena').rows.some(r => r.mine));
    assert.ok(!E.leaderboard(s, 'arena', { date: '2024-12' }).rows.some(r => r.mine));
    assert.equal(lastRefresh(BENCH_BY_ID.arena, '2025-05'), '2025-05');
    assert.ok(!E.leaderboard(s, 'arena', { date: '2025-05' }).rows.some(r => r.mine));
  });

  it('开源列看产出这条成绩的模型自己，不看公司；玩家那一行按 modelId 找模型，改名也找得到', () => {
    const s = E.createGame('gpt', 'y2025', 59);
    assert.equal(s.route.stance, 'closed');
    const m = E.liveModel(s);
    m.open = true;
    m.name = '改过名的旗舰';
    const row = E.leaderboard(s, 'arena').rows.find(r => r.mine);
    assert.equal(row.modelId, m.id);
    assert.equal(row.open, true);
  });

  it('旧档：已公布的成绩只有型号名，读档时补上 modelId；模型身上没有成绩记录也照样上榜', () => {
    const s = E.createGame('qwen', 'y2025', 7);
    resolveAll(s);
    let old = clone(s);
    old.v = 3;
    for (const m of old.models) delete m.benchmarks;
    for (const run of Object.values(old.published)) delete run.modelId;
    const before = E.leaderboard(old, 'arena').rows.find(r => r.mine && r.role === 'flagship');
    assert.ok(before && before.modelId === null, '没补之前只有名字');
    old = loadSave(old);
    const live = E.liveModel(old);
    assert.ok(Object.values(old.published).filter(r => r.role !== 'small').every(r => r.modelId === live.id));
    const small = E.smallLive(old);
    if (small) assert.ok(Object.values(old.published).filter(r => r.role === 'small').every(r => r.modelId === small.id));
    const after = E.leaderboard(old, 'arena').rows.find(r => r.mine && r.role === 'flagship');
    assert.deepEqual([after.name, after.score, after.modelId, after.rank], [before.name, before.score, live.id, before.rank]);
    const once = clone(old);
    assert.deepEqual(loadSave(old), once, '读两遍结果不变');
  });

  it('竞技场刷榜被曝光后认错撤回：旗舰的竞技场成绩从榜上撤下，模型身上的记录也撤', () => {
    const s = E.createGame('gpt', 'y2025', 59);
    resolveAll(s);
    assert.ok(E.leaderboard(s, 'arena').rows.some(r => r.mine && r.role === 'flagship'));
    s.queue.unshift({ kind: 'event', id: 'arena_scandal' });
    assert.equal(E.currentEvent(s).id, 'arena_scandal');
    E.resolveEvent(s, 'admit');
    assert.ok(!E.leaderboard(s, 'arena').rows.some(r => r.mine && r.role === 'flagship'));
    assert.ok(s.models.every(m => m.role === 'small' || !m.benchmarks?.arena));
  });
});

describe('对手：取家族里已发布的最强一款', () => {
  it('发布较弱的轻量款不会把更强的旧旗舰挤掉；市场在售也看家族最强（规格 D1：没有“最新一款”的口径）', () => {
    const latest = (fam, day) => RELEASES.filter(r => r.family === fam && r.day <= day).sort((a, b) => a.day.localeCompare(b.day)).pop();
    assert.equal(latest('llama', '2025-01-31').name, 'Llama 3.3 70B');
    assert.equal(E.familyBest(null, 'llama', '2025-01-31').name, 'Llama 3.1 405B');
    assert.equal(E.familyBest(null, 'gemini', '2026-01-31').name, 'Gemini 3 Pro');
    assert.equal(latest('gemini', '2026-01-31').name, 'Gemini 3 Flash');
    const state = observer('llm', '2025-01');
    assert.equal(E.rivalStandings(state).find(x => x.rel.family === 'llama').rel.name, 'Llama 3.1 405B');
    assert.equal(E.marketShares(state, 'api', 'global', []).others.find(x => x.family === 'llama').name, 'Llama 3.1 405B');
    assert.equal(E.familyBest(null, 'llama', '2023-01-31'), null, '还没发布的版本不能穿越进来');
  });

  it('同一家在数学榜和知识榜可以由不同版本领先；综合最强只有一款，不是它的标“（非旗舰）”', () => {
    // GPT-4.5 是 2025-02-27 发布的，按日可见要到 3 月 1 日才在榜上。
    const state = observer('llm', '2025-03');
    assert.equal(E.leaderboard(state, 'aime24').rows.find(x => x.org === 'openai').name, 'o1');
    const mmlu = E.leaderboard(state, 'mmlu').rows.find(x => x.org === 'openai');
    assert.deepEqual([mmlu.model, mmlu.name, mmlu.flagship], ['GPT-4.5', 'GPT-4.5（非旗舰）', false]);
    assert.equal(E.orgBest(null, 'openai', 'llm', state.day).name, 'o1');
  });

  it('先筛开源再选老师：闭源的 Max 上市，不撤回已经放出的开源权重；开源排名也和它比', () => {
    // Qwen2.5-Max 是 2025-01-28 发布的，按日可见要到 2 月才看得到。
    const state = observer('llm', '2025-02');
    assert.equal(E.familyBest(state, 'qwen', state.day).open, false);
    assert.equal(E.familyBest(state, 'qwen', state.day, { open: true }).name, 'Qwen2.5-72B');
    assert.equal(E.distillTeachers(state).find(x => x.id === 'qwen')?.name, 'Qwen2.5-72B');
    assert.equal(E.rivalStandings(state, { open: true }).find(x => x.org === 'alibaba')?.rel.name, 'Qwen2.5-72B');
  });

  it('最好的闭源模型：家族最新一款是开源的，也不整家跳过（bestClosedQ）', () => {
    withCatalog([
      ['grok', '2024-01', 'Closed Big', 'frontier', 0, [90, 90, 90, 90, 50, 90], 'premium'],
      ['grok', '2024-03', 'Open Small', 'small', 1, [60, 60, 60, 60, 50, 60], 'budget'],
      ['qwen', '2024-04', 'Open Mid', 'mid', 1, [80, 80, 80, 80, 50, 80], 'budget'],
    ], () => {
      const rel = RELEASES.find(r => r.name === 'Open Mid');
      const ms = { mod: 'llm', rival: { closeToTop: 2 } };
      assert.equal(rivalMatch(observer('llm', '2024-05'), ms, rel), false, '离最好的闭源（90）差 10 分，不算追平');
      assert.equal(rivalMatch(observer('llm', '2024-05'), { mod: 'llm', rival: { closeToTop: 12 } }, rel), true);
    });
  });

  it('窄的数学专项第一可以是小模型，但不能因此算综合最强', () => {
    // 原来靠真实的 Phi-3-medium（2024-04）；D3 第二批把它挪到 2024-05，那时 GPT-4o 已经出了，所以改用构造的对手表。
    withCatalog([
      ['phi', '2024-04', 'Math 7B', 'small', 1, [50, 40, 96, 45, 60, 20], 'budget'],
      ['claude', '2024-03', 'Broad 400B', 'frontier', 0, [83, 70, 62, 83, 82, 28], 'premium'],
    ], () => {
      const state = observer('llm', '2024-05');   // 只知道月份的行落在当月某一天：5 月 1 日两款都看得到
      const winner = E.leaderboard(state, 'aime24').rows[0];
      assert.equal(winner.name, 'Math 7B');
      assert.equal(winner.cls, 'small');
      assert.equal(E.rivalStandings(state)[0].rel.name, 'Broad 400B');
    });
  });

  it('安全榜越低越好：小模型凭真实安全维度领先，综合最强仍是大模型', () => {
    withCatalog([
      ['phi', '2024-01', 'Safe 7B', 'small', 1, [40, 40, 40, 40, 95, 40], 'budget'],
      ['gpt', '2024-01', 'Broad 405B', 'large', 0, [80, 80, 80, 80, 50, 80], 'premium'],
    ], () => {
      const state = observer('llm', '2024-02');
      const board = E.leaderboard(state, 'harmbench');
      assert.equal(board.rows[0].name, 'Safe 7B');
      assert.ok(board.rows[0].score < board.rows[1].score);
      assert.equal(E.rivalStandings(state)[0].rel.name, 'Broad 405B');
    });
  });

  it('同分取较晚发布的一款；同一天同分取表里靠后的一行', () => {
    // 只知道月份的行按名字散列落到当月某一天：挑两个落在同一天的名字，测“同一天取行序靠后的”。
    const dayOf = name => { setReleases([['claude', '2024-02', name, 'large', 0, [70, 70, 70, 70, 50, 70], 'premium']]); return RELEASES[0].day; };
    const names = Array.from({ length: 60 }, (_, i) => `Same ${i}`);
    const seen = new Map();
    let pair = null;
    for (const n of names) { const d = dayOf(n); if (seen.has(d)) { pair = [seen.get(d), n]; break; } seen.set(d, n); }
    setReleases(RAW_RELEASES);
    assert.ok(pair, '找得到落在同一天的两个名字');
    withCatalog([
      ['gpt', '2024-01', 'Tie Early', 'large', 0, [80, 80, 80, 80, 50, 80], 'premium'],
      ['gpt', '2024-03', 'Tie Late', 'large', 0, [80, 80, 80, 80, 50, 80], 'premium'],
      ['claude', '2024-02', pair[1], 'large', 0, [70, 70, 70, 70, 50, 70], 'premium'],
      ['claude', '2024-02', pair[0], 'large', 0, [70, 70, 70, 70, 50, 70], 'premium'],
    ], () => {
      assert.equal(E.familyBest(null, 'gpt', '2024-04-30').name, 'Tie Late');
      assert.equal(E.familyBest(null, 'claude', '2024-04-30').name, pair[0], '同一天同分：表里靠后的一行');
    });
  });

  it('量级榜先按量级筛，再在每家里取这个量级最强的一款（规格 D1.1）：Meta 在大档是 405B，在中档是 3.3 70B', () => {
    const state = observer('llm', '2025-01');
    assert.equal(E.leaderboard(state, 'mmlu', { cls: 'large' }).rows.find(x => x.org === 'meta')?.name, 'Llama 3.1 405B');
    assert.equal(E.leaderboard(state, 'mmlu', { cls: 'mid' }).rows.find(x => x.org === 'meta')?.name, 'Llama 3.3 70B');
    assert.equal(E.rivalStandings(state, { cls: 'mid' }).find(x => x.org === 'meta')?.rel.name, 'Llama 3.3 70B');
  });
});

describe('同分同名次', () => {
  it('越高越好和越低越好的榜都排成 1、1、3，玩家和对手同分也同名次', () => {
    for (const benchId of ['mmlu', 'harmbench']) {
      const state = observer('llm', '2025-01');
      const top = E.leaderboard(state, benchId).rows[0];
      state.published[benchId] = { model: 'Published tie', score: top.score, cls: top.cls, date: state.date, role: 'flagship' };
      const rows = E.leaderboard(state, benchId).rows;
      const tied = rows.filter(r => r.score === top.score);
      assert.ok(tied.length >= 2);
      assert.ok(tied.every(r => r.rank === 1));
      const me = E.myRank(state, benchId);
      assert.deepEqual([me.rank, me.tied], [1, tied.length]);
      assert.equal(rows.find(r => r.score !== top.score).rank, tied.length + 1);
      const b = BENCH_BY_ID[benchId];
      assert.ok(rows.every((r, i) => !i || (b.kind === 'lower' ? r.score >= rows[i - 1].score : r.score <= rows[i - 1].score)));
    }
  });

  it('ARC-AGI-2 开榜时全是 0 分：只能算并列第一，不按家族顺序排出高下；综合最强不受影响', () => {
    const state = observer('llm', '2025-03');
    const rows = E.leaderboard(state, 'arcagi2').rows;
    assert.ok(rows.some(r => r.org === 'rwkv'));
    assert.ok(rows.every(r => r.score === 0 && r.rank === 1));
    assert.notEqual(E.rivalStandings(state)[0].rel.family, 'rwkv');
  });
});

describe('开局继承统一（决定第 1 项）', () => {
  it('各剧本都继承开局时家族里综合最强的一款：Llama y2025 是 3.1 405B，Gemini y2026 是 3 Pro；没有 2026 专用补丁', () => {
    assert.equal(E.startModel('llama', 'y2025').name, 'Llama 3.1 405B');
    assert.equal(E.liveModel(E.createGame('llama', 'y2025', 1)).name, 'Llama 3.1 405B');
    assert.equal(E.startModel('gemini', 'y2026').name, 'Gemini 3 Pro');
    // 按日可见（规格 D2、D4 第 3 条）：R1 是 01-20 发布的，DeepSeek y2025 开局在线的是 V3，R1 在训。
    assert.equal(E.liveModel(E.createGame('deepseek', 'y2025', 1)).name, 'DeepSeek-V3');
    const game = readSrc('../../src/career/sim/game.js');
    assert.ok(!/function start\w*Release\b/.test(game), 'game.js 里不该再有按剧本分支的开局补丁');
  });

  it('别家发布开源新款的里程碑：“下载权重做蒸馏”写的是实际蒸馏的那款（G1-11），下的单也是它', () => {
    const s = E.createGame('rwkv', 'y2025', 7);
    resolveAll(s);
    const opt = E.distillOptions(s).find(o => o.teacher === 'llama');
    assert.deepEqual([opt.teacherName, opt.open], ['Llama 3.1 405B', true]);
    s.queue.unshift({ kind: 'milestone', id: 'ms_open_commercial', v: 'rival', fam: 'llama', rel: 'Llama 3.3 70B' });
    const choice = E.currentEvent(s).choices.find(c => c.id === 'distill');
    assert.ok(choice, '对方开源了，应该能选蒸馏');
    assert.match(`${choice.label} ${choice.hint}`, /Llama 3\.1 405B/);
    E.resolveEvent(s, 'distill');
    assert.ok(s.orders.some(o => o.kind === 'distill' && o.name === '蒸馏 Llama 3.1 405B'));
  });
});

describe('先修：只有一份综合分口径（G6-2），缓存和暴力逐条对照一致（G6-8）', () => {
  it('综合分只有 sota.js 的 qOf 一份：固定权重、没有日期参数；rivals.js 里没有另一份综合分公式', () => {
    const src = readSrc('../../src/career/data/rivals.js');
    assert.ok(!/0\.22|0\.12|agent' *&&|2024-06/.test(src.slice(src.indexOf('export function setReleases'))), 'rivals.js 里不该自己算综合分');
    assert.equal(E.qOf('llm', { knowledge: 100, code: 100, math: 100, writing: 100, safety: 0, agent: 100 }), 100);
    assert.equal(E.qOf('llm', { knowledge: 0, code: 0, math: 0, writing: 0, safety: 100, agent: 100 }), 12, '不计安全，从开局起就计 Agent');
  });

  it('综合最强：全部家族、2023-01 到 2026-10 每月月底，缓存结果和逐条打分一致（含只看开源、只看闭源）', () => {
    for (const date of months('2023-01', '2026-10')) for (const f of Object.keys(FAMILIES)) {
      const day = `${date}-28`;
      assert.equal(E.familyBest(null, f, day), bruteBest(r => r.family === f, day, q), `${f} ${date}`);
      assert.equal(E.familyBest(null, f, day, { open: true }), bruteBest(r => r.family === f && r.open, day, q), `${f} ${date} 开源`);
      assert.equal(E.familyBest(null, f, day, { open: false }), bruteBest(r => r.family === f && !r.open, day, q), `${f} ${date} 闭源`);
    }
  });

  it('榜单：每季度、每个当时可见的基准，对手行就是各 org 在这个基准上逐条打分的最高一款', () => {
    let views = 0;
    for (const date of months('2023-01', '2026-10').filter((_, i) => i % 3 === 0)) {
      for (const b of BENCHMARKS.filter(x => x.from <= date)) {
        const sign = b.kind === 'lower' ? -1 : 1;
        const rows = E.leaderboard(observer(b.mod, date), b.id).rows;
        const orgs = [...new Set(Object.values(FAMILIES).filter(f => f.mod === b.mod).map(f => f.org))];
        const want = orgs.map(o => bruteBest(r => r.mod === b.mod && FAMILIES[r.family].org === o && r.date >= '2022-01', `${date}-01`, r => sign * E.rivalScore(b, r, date))).filter(Boolean);
        assert.deepEqual(rows.map(r => r.model).sort(), want.map(r => r.name).sort(), `${b.id} ${date}`);
        for (const r of rows) assert.equal(r.score, E.rivalScore(b, want.find(x => x.name === r.model), date));
        views++;
      }
    }
    assert.ok(views > 300, `只看了 ${views} 个榜`);
  });

  it('缓存不串：改动返回的行不影响下一次；不同玩家视角各自去掉自家；换对手表后重新算', () => {
    const s = E.createGame('claude', 'y2026', 1);
    Object.assign(s, { date: '2026-07', day: '2026-07-01' });
    const a = E.leaderboard(s, 'hle');
    a.rows[0].score = -1;
    a.rows[0].rank = 99;
    const b = E.leaderboard(s, 'hle');
    assert.notEqual(b.rows[0].score, -1);
    assert.equal(b.rows[0].rank, 1);
    assert.ok(!b.rows.some(r => !r.mine && r.org === 'anthropic'), '玩 Claude 时榜上没有 Anthropic 的对手行');
    const g = E.createGame('qwen', 'y2026', 1);
    Object.assign(g, { date: '2026-07', day: '2026-07-01' });
    assert.ok(E.leaderboard(g, 'hle').rows.some(r => r.org === 'anthropic'));
    withCatalog([['gpt', '2026-01', 'Only One', 'large', 0, [80, 80, 80, 80, 50, 80], 'premium']], () => {
      assert.deepEqual(E.leaderboard(g, 'hle').rows.filter(r => !r.mine).map(r => r.name), ['Only One']);
      assert.equal(E.familyBest(null, 'llama', '2025-01-31'), null);
    });
    assert.equal(E.familyBest(null, 'llama', '2025-01-31').name, 'Llama 3.1 405B');
  });

  it('综合最强口径下，每个月的语言模型第一名也不是中小模型，DeepSeek Flash 拿不到第一', () => {
    for (const date of months('2023-01', '2026-10')) {
      const ranked = E.rivalStandings(observer('llm', date));
      assert.ok(['frontier', 'large'].includes(ranked[0].rel.cls), `${date} 第一名是 ${ranked[0].rel.name}`);
      assert.notEqual(ranked[0].rel.family, 'deepseek', `${date} Flash 成了第一`);
      for (const x of ranked.slice(0, 3)) assert.notEqual(x.rel.cls, 'small', `${date} 前三有轻量模型 ${x.rel.name}`);
    }
  });
});
