// SOTA 标签与“谁最强”（规格 D1、D1.1、D2、D5、D6.2 的锚点、D10，P1.1）：标签链、播种、换手、算不算数、试算与实际一致、
// 跟随者钳制、局内“集团出过”、开局阵容（附录表 13）、发布时顶不顶替在线旗舰、榜单与量级、读旧档的 sota 迁移。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from '../../src/career/engine.js';
import { COMPANIES, SCENARIOS, SCALES } from '../../src/career/data/core.js';
import { FAMILIES, RELEASES, RAW_RELEASES, setReleases } from '../../src/career/data/rivals.js';
import { SOTA } from '../../src/career/data/balance.js';
import { classTop } from '../../src/career/data/goals.js';
import {
  SOTA_HISTORY, SOTA_PRE, initSota, labelOnRelease, labelOnRival, sotaWouldTake, sotaMade, kinTick, pushEnvelope,
  anchor, anchorEnv, histOther, ownHist, tempAnchor, envelope, realQ, relRole, isMine, ensureSota,
} from '../../src/career/sim/sota.js';
import { addDays, dayInMonth } from '../../src/career/sim/clock.js';
import { releaseEntry } from '../../src/career/sim/loop.js';
import { advance, resolveAll } from '../helpers/career_bot.mjs';
import { clone, loadSave } from '../helpers/career_util.mjs';
import * as L from '../helpers/legacy_jobs.mjs';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/saves');
const rel = name => RELEASES.find(r => r.name === name);
const q = r => E.qOf(r.mod, r.dims);
const chain = mod => SOTA_HISTORY[mod].map(h => h.name);
const SCS = SCENARIOS.map(x => x.id);
const withCatalog = (rows, fn) => { setReleases(rows); try { fn(); } finally { setReleases(RAW_RELEASES); } };
// 能力各维都是 v 的模型：Q 计入的维度权重和是 1，所以 qOf ≈ v。
const QKEYS = { llm: ['knowledge', 'code', 'math', 'writing', 'agent'], image: ['aesthetics', 'adherence', 'text', 'realism'], music: ['composition', 'vocals', 'lyrics', 'fidelity'], speech: ['naturalness', 'cloning', 'multilingual', 'expressive'] };
const flat = (mod, v) => ({ ...Object.fromEntries(QKEYS[mod].map(k => [k, v])), safety: 50 });
// 一款“玩家已发布”的快照，放进 s.models。
function snapOf(s, v, extra = {}) {
  const m = { id: `t${s.models.length}_${Math.round(v * 100)}`, name: `测试 ${v}`, mod: s.mod, role: 'flagship', origin: 'pretrain', stage: 'released', released: s.date, releasedDay: s.day, line: 'main', dims: flat(s.mod, v), ...extra };
  s.models.push(m);
  return m;
}
// 一条构造的对手发布（不在对手表里），当天变为可见。
const fakeRel = (s, fam, v, extra = {}) => ({ family: fam, mod: FAMILIES[fam].mod, name: `构造 ${fam} ${v}`, id: `fake${fam}${v}`, day: s.day, date: s.date, open: false, cls: 'frontier', tags: [], dims: flat(FAMILIES[fam].mod, v), ...extra });

describe('D10.6 第 4 条：SOTA_HISTORY 的标签链', () => {
  it('LLM：GPT-3.5（场地凑满，Krake 已在场，算数）→ GPT-4、GPT-4 Turbo（自家换代）→ Gemini 1.5 Pro → Claude 3 Opus → … → o1 → Grok 3 → Claude 3.7 Sonnet → Gemini 2.5 Pro → … → Claude Opus 5.5', () => {
    const c = chain('llm');
    assert.deepEqual(c.slice(0, 15), ['GPT-3.5（ChatGPT）', 'GPT-4', 'GPT-4 Turbo', 'Gemini 1.5 Pro', 'Claude 3 Opus', 'GPT-4o', 'Claude 3.5 Sonnet', 'o1-preview',
      'Claude 3.5 Sonnet（新版）', 'o1', 'Grok 3', 'Claude 3.7 Sonnet', 'Gemini 2.5 Pro', 'o3', 'Claude Opus 4']);
    const [first, gpt4, turbo] = SOTA_HISTORY.llm;
    assert.deepEqual([first.since, first.via, first.counted, first.countedAt], ['2022-11-30', 'fill', true, '2022-11-30']);
    assert.ok(first.q - q(rel('Krake')) >= SOTA.FILL_LEAD);
    assert.equal((first.q - q(rel('Krake'))).toFixed(2), '20.28');
    assert.deepEqual([gpt4.via, turbo.via, gpt4.since], ['self', 'self', '2023-03-14']);
    assert.equal(SOTA_HISTORY.llm.find(h => h.name === 'o1').since, '2024-12-05');
    // Grok 3 按 release_days 是 2025-02-17（不是 02-15），02-24 被 Claude 3.7 Sonnet 接过：只持标 7 天（D10.6 第 4 条、D11.4、D11.11、附录表 10）。
    const grok3 = SOTA_HISTORY.llm.find(h => h.name === 'Grok 3');
    assert.deepEqual([grok3.since, grok3.until, addDays(grok3.since, 7)], ['2025-02-17', '2025-02-24', '2025-02-24']);
    assert.equal(SOTA_HISTORY.llm.find(h => h.since === grok3.until).name, 'Claude 3.7 Sonnet');
    assert.equal(c.at(-1), 'Claude Opus 5.5');
    assert.equal(SOTA_HISTORY.llm.at(-1).q.toFixed(2), '96.90');
    // 比当时的持有者只高不到 0.1，不换手。
    assert.ok(!c.includes('Claude Sonnet 4.5') && !c.includes('GPT-5.5'));
    assert.ok(!c.includes('Krake'), 'Krake 那时只有一家，不挂标签');
  });
  it('音乐：Bark（MusicGen 让场地凑满，领先 2.5 分不算数；挡住 Stable Audio 那天算数）→ Chirp v2（自家换代）→ Lyria → Suno v3 → Udio …；MusicGen 和 Stable Audio 都不在链上', () => {
    const c = chain('music');
    assert.deepEqual(c.slice(0, 5), ['Bark', 'Chirp v2', 'Lyria', 'Suno v3', 'Udio']);
    // 场地凑满的日子按 release_days：MusicGen 2023-06-12（D11.11 史实夹具里 Bark 推迟到这天评）。
    assert.equal(SOTA_HISTORY.music[0].since, rel('MusicGen').day);
    assert.equal(rel('MusicGen').day, '2023-06-12');
    assert.ok(!c.includes('MusicGen') && !c.includes('Stable Audio'));
    const bark = SOTA_HISTORY.music[0];
    assert.deepEqual([bark.via, bark.since, bark.counted, bark.countedAt], ['fill', rel('MusicGen').day, true, rel('Stable Audio').day]);
    assert.equal((bark.q - q(rel('MusicGen'))).toFixed(2), '2.50');
    assert.equal(SOTA_HISTORY.music[1].via, 'self');
    assert.equal(SOTA_HISTORY.music[1].countedAt, rel('Stable Audio').day, '自家换代继承算不算数');
  });
  it('语音链第一枚是 Eleven Multilingual v2（场地凑满，领先 21.75，直接算数）；图像第一枚是 DALL·E 2', () => {
    const [sp] = SOTA_HISTORY.speech;
    assert.deepEqual([sp.name, sp.via, sp.counted], ['Eleven Multilingual v2', 'fill', true]);
    assert.equal((sp.q - q(rel('OpenAI TTS'))).toFixed(2), '21.75');
    // 场地凑满那天是 OpenAI TTS 的发布日 2023-11-06（D11.11 史实夹具里 ElevenLabs y2023 推迟到这天评）。
    assert.deepEqual([sp.since, rel('OpenAI TTS').day], ['2023-11-06', '2023-11-06']);
    assert.deepEqual([SOTA_HISTORY.image[0].name, SOTA_HISTORY.image[0].counted], ['DALL·E 2', true]);
    assert.deepEqual(SOTA_PRE, {});
  });
});

describe('D10.6 第 5 条：开局播种', () => {
  const SEED = {
    gpt: '★★★★', image2: '★★★★', midjourney: '★★★★', suno: '—★★★', elevenlabs: '—★★★', claude: '——★★', fable: '——★★', gemini: '—○★★',
    grok: '———★', seed: '——○○', minimax: '———○', llama: '————',
  };
  // sota-timeline.json 的摘要（docs/spec/tools/sota2/data.mjs 的 REAL_SEED）；没列的公司四格都是 —。
  const REAL = { gpt: '★★★★', claude: '——★★', fable: '——○○', gemini: '———★', grok: '———★', deepseek: '————', image2: '○★★★', midjourney: '★★★★', suno: '—★★★', elevenlabs: '—★★★', llama: '—○○○', seed: '———○', minimax: '———○' };
  const SEED_DIFF = ['gemini y2024', 'gemini y2025', 'image2 y2023', 'seed y2025', 'fable y2025', 'fable y2026', 'llama y2024', 'llama y2025', 'llama y2026'];
  it('24 × 4 的 ★/○/— 等于规格 D10.4 的表；带 ★ 的家数依次为 3、5、8、9；和研究表只差 SEED_DIFF 的 9 格', () => {
    const got = {}, diff = [];
    for (const c of COMPANIES) {
      got[c.id] = SCS.map(sc => E.createGame(c.id, sc, 1).sota.seed).join('');
      assert.equal(got[c.id], SEED[c.id] || '————', c.id);
      SCS.forEach((sc, i) => { if (got[c.id][i] !== (REAL[c.id] || '————')[i]) diff.push(`${c.id} ${sc}`); });
    }
    assert.deepEqual(SCS.map((_, i) => COMPANIES.filter(c => got[c.id][i] === '★').length), [3, 5, 8, 9]);
    assert.equal(COMPANIES.filter(c => got[c.id] === '————').length, 13);
    assert.deepEqual(diff.sort(), [...SEED_DIFF].sort());
  });
  it('开局 ★ 的 before 为真（sotaMade）；○ 和 — 不是', () => {
    assert.ok(sotaMade(E.createGame('claude', 'y2025', 1)));
    assert.ok(!sotaMade(E.createGame('claude', 'y2024', 1)));
    assert.ok(!sotaMade(E.createGame('gemini', 'y2024', 1)));
  });
});

describe('D10.6 第 6 条：开局和运行时', () => {
  it('GPT y2023：Krake 已经可见、场地已满，initSota 就把标签挂在继承来的 GPT-3.5 上（算数，只设 before），不弹卡', () => {
    const s = E.createGame('gpt', 'y2023', 1);
    const h = s.sota.holder;
    assert.deepEqual([h.by, h.name, h.via, h.counted], ['me', 'GPT-3.5（ChatGPT）', 'fill', true]);
    assert.deepEqual([s.sota.before, s.sota.made.length], [true, 0]);
    assert.deepEqual(s.sota.field.sort(), ['novelai', 'openai']);
    assert.deepEqual(E.liveModel(s).sota, { from: '2022-11-30', until: null });
    assert.ok(E.liveModel(s).hist);
    assert.ok(![...s.queue, ...s.scheduled.map(x => x.item).filter(Boolean)].some(x => /sota/.test(String(x?.id))), '不弹卡');
  });
  it('ElevenLabs y2023：第二家语音公司出现之前没有标签；Suno y2023 在 MusicGen 之前也没有', () => {
    const s = E.createGame('elevenlabs', 'y2023', 1);
    assert.equal(s.sota.holder, null);
    assert.equal(E.sotaAt(s), null);
    assert.equal(sotaWouldTake(s, 99), null, '自己发布以后场地也只有一家');
    advance(s, 120);
    assert.equal(s.sota.holder, null);
    assert.equal(E.createGame('suno', 'y2023', 1).sota.holder, null);
  });
  it('玩 OpenAI 时，被钳制的跟随者拿不到标签（机器人不发布，走到 2025 年底）', () => {
    const s = E.createGame('gpt', 'y2024', 1);
    advance(s, 720);
    const held = [s.sota.holder, ...s.sota.log].map(h => h.name);
    const clamped = RELEASES.filter(r => r.mod === 'llm' && s.world.adj[r.id] < 0).map(r => r.name);
    assert.ok(clamped.includes('DeepSeek-R1'), clamped.join(','));
    for (const n of clamped) assert.ok(!held.includes(n), `${n} 被钳制了却拿到标签`);
  });
  it('sotaAt：今天读 holder；过去的日子按 log 回查；别的模态按 SOTA_HISTORY', () => {
    const s = E.createGame('qwen', 'y2025', 1);
    assert.equal(E.sotaAt(s).name, 'o1');
    assert.equal(E.sotaAt(s, { day: '2024-07-01' }).name, 'Claude 3.5 Sonnet');
    assert.equal(E.sotaAt(s, { day: '2024-07-01', mod: 'music' }).name, 'Udio');
    assert.equal(E.sotaAt(s, { day: '2023-12-01', mod: 'speech' }).name, 'Eleven Multilingual v2');
  });
});

describe('D10.6 第 1 条：换手规则', () => {
  it('别家差不到 0.1 不换手；同分不换手；高出 0.1 以上才换，换手得来的一定算数；带 S 的发布照常参与', () => {
    const s = E.createGame('qwen', 'y2026', 1);
    const h = s.sota.holder;
    assert.equal(h.by, 'claude');
    for (const d of [0, 0.05, 0.1]) assert.equal(labelOnRival(s, fakeRel(s, 'gemini', h.q + d)).changed, false, `高 ${d}`);
    const lab = labelOnRival(s, fakeRel(s, 'grok', h.q + 0.2, { tags: ['S'] }));
    assert.deepEqual([lab.changed, s.sota.holder.name, s.sota.holder.via, s.sota.holder.counted], [true, `构造 grok ${h.q + 0.2}`, 'swap', true]);
    assert.match(lab.text, /^最强易主：构造 grok .* 比 .* 高 0\.2 分。$/);
    assert.equal(s.sota.log.at(-1).name, h.name);
  });
  it('自家新旗舰 q ≥ 自家现任就接过，不需要 EPS，算不算数照旧；同分也接过', () => {
    const s = E.createGame('gpt', 'y2023', 1);
    resolveAll(s);
    const h = s.sota.holder;
    const m = snapOf(s, h.q);
    const lab = labelOnRelease(s, m);
    assert.deepEqual([lab.got, lab.via, lab.counted, lab.prev.name], [true, 'self', true, 'GPT-3.5（ChatGPT）']);
    assert.deepEqual(s.sota.made.map(x => [x.modelId, x.via]), [[m.id, 'self']]);
    assert.equal(E.liveModel(s).sota.until, s.day, '被接过的快照写 until');
    assert.equal(s.sota.log.at(-1).via, 'fill');
    assert.equal(labelOnRelease(s, snapOf(s, h.q - 0.01)).got, false, '比自家现任低就不接');
  });
  it('场地不足两家不挂；第一次凑满两家时直接给当时最强的一款，不需要 EPS', () => {
    const s = E.createGame('elevenlabs', 'y2023', 1);
    resolveAll(s);
    const mine = snapOf(s, 70);
    assert.equal(labelOnRelease(s, mine).got, false, '只有自己一家');
    assert.deepEqual(s.sota.field, ['elevenlabs']);
    s.day = addDays(s.day, 1);   // 对手的发布在一天开始时放出：放在玩家发布的第二天
    const lab = labelOnRival(s, fakeRel(s, 'openai_tts', 60));
    assert.deepEqual([lab.filled, lab.changed], [true, true]);
    assert.deepEqual([s.sota.holder.by, s.sota.holder.id, s.sota.holder.via, s.sota.holder.counted], ['me', mine.id, 'fill', true]);
    assert.deepEqual(s.sota.made.map(x => x.via), ['fill']);
  });
  it('同一天的几条按 q 从高到低处理（构造：两家同一天发布）', () => {
    // 只知道月份的行按名字散列落到当月某一天：挑两个落在同一天的名字。
    const dayOf = name => { setReleases([['claude', '2024-05', name, 'frontier', 0, [1, 1, 1, 1, 1, 1], 'premium']]); return RELEASES[0].day; };
    const seen = new Map();
    let pair = null;
    for (let i = 0; i < 80 && !pair; i++) { const n = `Day ${i}`, d = dayOf(n); if (seen.has(d)) pair = [seen.get(d), n]; else seen.set(d, n); }
    setReleases(RAW_RELEASES);
    assert.ok(pair);
    withCatalog([
      ['gpt', '2024-01', 'A', 'frontier', 0, [59, 59, 59, 59, 50, 59], 'premium'],
      ['claude', '2024-02', 'B', 'frontier', 0, [40, 40, 40, 40, 50, 40], 'premium'],
      ['gpt', '2024-05', pair[0], 'frontier', 0, [60, 60, 60, 60, 50, 60], 'premium'],
      ['claude', '2024-05', pair[1], 'frontier', 0, [61, 61, 61, 61, 50, 61], 'premium'],
    ], () => {
      E.qOf('llm', {});   // 换表后第一次调用 sota.js 时重算 SOTA_HISTORY
      E.familyBest(null, 'gpt', '2024-12-31');
      // 先处理 q 高的 claude：61 > 59 + 0.1 换手；gpt 的 60 再挑战 61 不成。反过来处理会多出一段 gpt 自家换代。
      assert.deepEqual(SOTA_HISTORY.llm.map(h => h.name), ['A', pair[1]]);
    });
    E.familyBest(null, 'gpt', '2024-12-31');
    assert.equal(SOTA_HISTORY.llm[0].name, 'GPT-3.5（ChatGPT）');
  });
  it('开局继承的型号拿到标签：只设 before，不进 made，不弹卡', () => {
    const s = E.createGame('claude', 'y2026', 1);
    assert.deepEqual([s.sota.holder.by, s.sota.holder.name, s.sota.made.length, s.sota.before], ['me', 'Claude Opus 4.5', 0, true]);
    assert.ok(E.liveModel(s).hist);
  });
});

describe('D10.6 第 2 条：算不算“炼出”', () => {
  it('Bark 领先 2.5 分先不算数，挡住 Stable Audio（Stability 的第一款，是主线）那天算数；Eleven Multilingual v2、GPT-3.5 直接算数', () => {
    const bark = SOTA_HISTORY.music[0];
    assert.ok(bark.q - q(rel('MusicGen')) < SOTA.FILL_LEAD);
    assert.equal(bark.countedAt, rel('Stable Audio').day);
    assert.ok(q(rel('Stable Audio')) <= bark.q + SOTA.EPS);
    assert.ok(SOTA_HISTORY.speech[0].counted && SOTA_HISTORY.llm[0].counted);
  });
  it('构造：领先 1 分挂上的标签，挡住一款别家主线新发布的那天变成算数，并在那天补记 made；别家不是主线的发布不算挑战', () => {
    // 放到 2024 年初：OpenAI 的真实发布里此前最强是 OpenAI TTS（56.25），用它判断构造的发布是不是“主线”。
    const s = E.createGame('elevenlabs', 'y2023', 1);
    resolveAll(s);
    Object.assign(s, { date: '2024-01', day: '2024-01-09' });
    const mine = snapOf(s, 61);
    labelOnRelease(s, mine);
    s.day = addDays(s.day, 1);
    labelOnRival(s, fakeRel(s, 'openai_tts', 60));
    assert.deepEqual([s.sota.holder.id, s.sota.holder.counted, s.sota.made.length], [mine.id, false, 0], '领先 1 分，先不算数');
    // 55 没超过 OpenAI 自家此前的最强（56.25），不是主线，不算挑战。
    assert.equal(q(rel('OpenAI TTS')), 56.25);
    let lab = labelOnRival(s, { ...fakeRel(s, 'openai_tts', 55), id: 'fakeweak' });
    assert.equal(lab.defended, false);
    assert.equal(s.sota.holder.counted, false);
    s.day = addDays(s.day, 3);
    // 61.05 是 OpenAI 的新最强（主线），但没高出 0.1：挡住了。
    lab = labelOnRival(s, { ...fakeRel(s, 'openai_tts', 61.05), id: 'fakemain' });
    assert.equal(lab.defended, true);
    assert.deepEqual([s.sota.holder.counted, s.sota.holder.countedAt], [true, s.day]);
    assert.deepEqual(s.sota.made.map(x => [x.modelId, x.day, x.via]), [[mine.id, s.day, 'fill']]);
    assert.ok(sotaMade(s));
  });
});

describe('D10.6 第 3 条：sotaWouldTake 和随后的 labelOnRelease 一致', () => {
  it('1000 个随机状态', () => {
    const bases = [];
    for (const [c, sc, days] of [['gpt', 'y2023', 0], ['gpt', 'y2025', 30], ['claude', 'y2024', 60], ['qwen', 'y2025', 0], ['deepseek', 'y2026', 40], ['elevenlabs', 'y2023', 0],
      ['elevenlabs', 'y2023', 330], ['suno', 'y2023', 0], ['suno', 'y2023', 200], ['midjourney', 'y2024', 10], ['image2', 'y2026', 0], ['jev', 'y2024', 90], ['gemini', 'y2023', 100], ['novelai', 'y2023', 0]]) {
      const s = E.createGame(c, sc, 3);
      advance(s, days);
      bases.push(JSON.stringify(s));
    }
    let rng = 12345;
    const rand = () => ((rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648);
    let yes = 0;
    for (let i = 0; i < 1000; i++) {
      const s = JSON.parse(bases[Math.floor(rand() * bases.length)]);
      const ref = s.sota.holder?.q ?? E.worldSota(s)?.q ?? 50;
      const v = ref + (rand() - 0.5) * 4;
      const dims = flat(s.mod, v);
      const would = sotaWouldTake(s, E.qOf(s.mod, dims));
      const m = snapOf(s, v);
      m.dims = dims;
      const lab = labelOnRelease(s, m);
      assert.equal(would === true, lab.got, `${s.charId} ${s.day} q=${v}：试算 ${would}，实际 ${lab.got}`);
      if (lab.got) yes++;
    }
    assert.ok(yes > 100 && yes < 900, `拿到 ${yes} 次`);
  });
});

describe('D10.6 第 7 条：S 标签只是描述', () => {
  it('SOTA_HISTORY 里带 S 的持有者只有 Bark', () => {
    const s = MOD => SOTA_HISTORY[MOD].filter(h => rel(h.name)?.tags.includes('S')).map(h => h.name);
    assert.deepEqual(['llm', 'image', 'music', 'speech'].flatMap(s), ['Bark']);
  });
  it('24 家公司各自的运行时世界（隐藏本 org 的发布，玩家不发布）：带 S 的发布从不当对手最强，也从不持标', () => {
    for (const c of COMPANIES) {
      const s = E.createGame(c.id, 'y2023', 1);
      s.models = [];
      s.live = s.working = s.smallLive = s.smallWorking = null;
      initSota(s);
      const sDays = RELEASES.filter(r => r.mod === s.mod && r.tags.includes('S') && !isMine(s, r.family)).map(r => r.day);
      for (const r of RELEASES.filter(x => x.mod === s.mod && x.day >= s.day && !isMine(s, x.family)).sort((a, b) => a.day.localeCompare(b.day) || q(b) - q(a))) {
        s.day = r.day;
        labelOnRival(s, r);
      }
      for (const h of [s.sota.holder, ...s.sota.log].filter(Boolean)) assert.ok(!rel(h.name)?.tags.includes('S'), `${c.id}：${h.name} 带 S 却持标`);
      for (const d of sDays) {
        const w = E.worldSota(s, { day: d });
        assert.ok(!w || !w.rel.tags.includes('S') || false, `${c.id} ${d}：对手最强是带 S 的 ${w?.rel.name}`);
      }
    }
  });
});

describe('D10.6 第 8 条、D10.5：局内“集团出过 SOTA”', () => {
  it('Gemini y2023 机器人不发布：2023-11-16 Lyria 拿到音乐标签那天写入 s.sota.kin，并发一条集团新闻', () => {
    const s = E.createGame('gemini', 'y2023', 1);
    assert.equal(s.sota.seed, '—');
    while (s.status === 'playing' && !s.sota.kin && s.day < '2023-12-01') advance(s, 1);
    assert.equal(s.sota.kin, '2023-11-16');
    assert.ok(s.news.some(n => n.day === '2023-11-16' && n.type === 'sota' && n.title.includes('Lyria')));
  });
  it('seed y2023、y2024 是 Seed-TTS 那天，minimax y2023–y2025 是 Speech-02 那天；开局 ○ 或已经炼出过的不写', () => {
    const tts = SOTA_HISTORY.speech.find(h => h.name === 'Seed-TTS').countedAt, s02 = SOTA_HISTORY.speech.find(h => h.name === 'Speech-02').countedAt;
    assert.deepEqual([tts, s02], [rel('Seed-TTS').day, rel('Speech-02').day]);
    assert.deepEqual([tts, s02], ['2024-06-04', '2025-04-02'], 'D10.5、D10.6 第 8 条写的日子');
    const at = (id, sc, day) => {
      const s = E.createGame(id, sc, 1);
      s.day = addDays(day, -1);
      kinTick(s, { notes: [] });
      const before = s.sota.kin;
      s.day = day;
      kinTick(s, { notes: [] });
      return [before, s.sota.kin];
    };
    for (const sc of ['y2023', 'y2024']) assert.deepEqual(at('seed', sc, tts), [null, tts], `seed ${sc}`);
    for (const sc of ['y2023', 'y2024', 'y2025']) assert.deepEqual(at('minimax', sc, s02), [null, s02], `minimax ${sc}`);
    // seed y2025 开局就是 ○；Gemini y2025 开局就是 ★（Seedream、Nano Banana 换手那天也不写）。
    assert.deepEqual(at('seed', 'y2025', SOTA_HISTORY.image.find(h => h.name === 'Seedream 4.0').countedAt), [null, null]);
    assert.deepEqual(at('gemini', 'y2025', SOTA_HISTORY.image.find(h => h.name === 'Nano Banana Pro').countedAt), [null, null]);
  });
});

describe('D5：跟随者钳制', () => {
  const clampedIn = (id, sc) => {
    const s = E.createGame(id, sc, 1);
    return RELEASES.filter(r => r.mod === s.mod && !isMine(s, r.family) && q(r) - E.qOf(r.mod, E.relDims(s, r)) > 1e-9).map(r => `${r.name} ${(q(r) - E.qOf(r.mod, E.relDims(s, r))).toFixed(2)}`);
  };
  it('gpt y2023、y2024 机器人不发布：每条跟随者的 qOf(relDims) ≤ pushEnvelope − 1.0；变为可见那天冻结的钳制量也一样', () => {
    for (const sc of ['y2023', 'y2024']) {
      const s = E.createGame('gpt', sc, 1);
      for (const r of RELEASES.filter(x => x.mod === 'llm' && !isMine(s, x.family) && (x.open || !FAMILIES[x.family].pusher))) {
        const env = pushEnvelope(s, r.day);
        if (env !== null) assert.ok(E.qOf('llm', E.relDims(s, r)) <= env - 1 + 1e-9, `${sc} ${r.name}`);
      }
      advance(s, 400);
      for (const [id, a] of Object.entries(s.world.adj)) {
        const r = RELEASES.find(x => x.id === id);
        assert.ok(a <= 0 && Number.isFinite(a), id);
        if (a < 0) assert.ok(E.qOf('llm', E.relDims(s, r)) <= pushEnvelope(s, r.day) - 1 + 1e-9, `${sc} 冻结的 ${r.name}`);
      }
    }
  });
  it('需要钳的条数（D5）：gpt y2023 7 条（含 Qwen1.5-72B 钳 1.22）、y2024 2 条、y2025 1 条、y2026 0；OpenAI 图像 2、2、2、1；Anthropic 四个剧本各 1 条（Muse Wonder Full 0.34）；midjourney y2023 2 条；suno y2023–y2025 各 3 条、y2026 2 条；其余公司为 0', () => {
    assert.deepEqual(SCS.map(sc => clampedIn('gpt', sc).length), [7, 2, 1, 0]);
    assert.deepEqual(clampedIn('gpt', 'y2023').map(x => x.split(' ').slice(0, -1).join(' ')).sort(), ['Baichuan 3', 'DeepSeek-R1', 'GLM-4', 'Qwen-72B', 'Qwen1.5-72B', 'Qwen3-Max', '文心大模型 4.0'].sort());
    assert.ok(clampedIn('gpt', 'y2023').includes('Qwen1.5-72B 1.22'));
    assert.equal(rel('Qwen1.5-72B').day, '2024-02-04');
    assert.deepEqual(SCS.map(sc => clampedIn('image2', sc).length), [2, 2, 2, 1]);
    assert.deepEqual(clampedIn('image2', 'y2023'), ['Qwen-Image 1.50', 'Qwen-Image-3.0 0.25']);
    for (const id of ['claude', 'fable']) for (const sc of SCS) assert.deepEqual(clampedIn(id, sc), ['Muse Wonder Full 0.34'], `${id} ${sc}`);
    // 垂直模态的 pusher：Midjourney 开局前没有更强的自家线，y2023 看见 SDXL、SD3 Medium 时要钳；Suno 的 Mureka 三款。
    assert.deepEqual(SCS.map(sc => clampedIn('midjourney', sc)), [['SDXL 5.25', 'SD3 Medium 3.00'], [], [], []]);
    for (const sc of ['y2023', 'y2024', 'y2025']) assert.deepEqual(clampedIn('suno', sc), ['Mureka V8 9.25', 'Mureka V9 3.25', 'Mureka V9.5 3.00'], `suno ${sc}`);
    assert.deepEqual(clampedIn('suno', 'y2026'), ['Mureka V9 1.50', 'Mureka V9.5 1.75']);
    // 其余公司一条都不钳（不是 pusher 的公司，D4 保证跟随者本来就在同期最强之下）。
    for (const c of COMPANIES.filter(x => !['gpt', 'image2', 'claude', 'fable', 'midjourney', 'suno'].includes(x.id))) for (const sc of SCS) assert.deepEqual(clampedIn(c.id, sc), [], `${c.id} ${sc}`);
  });
  it('claude y2026：Muse Wonder Full 的 qOf(relDims) 是 95.34；claude y2023 开局时 Krake 的钳制量是 0，relDims 都是有限数', () => {
    const s = E.createGame('claude', 'y2026', 1);
    assert.equal(E.qOf('llm', E.relDims(s, rel('Muse Wonder Full'))).toFixed(2), '95.34');
    const old = E.createGame('claude', 'y2023', 1);
    assert.equal(old.world.adj[rel('Krake').id], 0);
    assert.ok(Object.values(E.relDims(old, rel('Krake'))).every(Number.isFinite));
    assert.deepEqual(E.relDims(old, rel('Krake')), rel('Krake').dims);
  });
});

describe('D2：开局阵容（附录表 13，按日、按 org）', () => {
  const T13 = {
    qwen: ['— / —', 'Qwen-72B / Qwen1.5-72B', 'Qwen2.5-72B / Qwen2.5-Max', 'Qwen3-Max / Qwen3.5-397B-A17B'],
    deepseek: ['— / —', 'DeepSeek LLM 67B / —', 'DeepSeek-V3 / DeepSeek-R1', 'DeepSeek-V3.2 / DeepSeek-V4-Pro（预览）'],
    gemini: ['— / Bard（LaMDA）', 'Gemini 1.0 Pro / Gemini 1.5 Pro', 'Gemini 2.0 Flash Thinking / Gemini 2.5 Pro', 'Gemini 3 Pro / Gemini 3.1 Pro'],
    claude: ['— / Claude', 'Claude 2.1 / Claude 3 Opus', 'Claude 3.5 Sonnet（新版） / Claude 3.7 Sonnet', 'Claude Opus 4.5 / Claude Opus 4.6'],
    gpt: ['GPT-3.5（ChatGPT） / GPT-4', 'GPT-4 Turbo / —', 'o1 / o3', 'GPT-5.2 / GPT-5.4'],
    kimi: ['— / —', 'Kimi Chat / —', 'Kimi Chat / Kimi k1.5', 'Kimi K2 Thinking / Kimi K2.5'],
    glm: ['— / ChatGLM-6B', 'ChatGLM3-6B / GLM-4', 'GLM-4-Plus / —', 'GLM-4.7 / GLM-5'],
    grok: ['— / —', 'Grok-1 / Grok-1.5', 'Grok-2 / Grok 3', 'Grok 4.1 / Grok 4.20'],
    seed: ['— / —', '豆包（云雀） / —', '豆包 Pro / 豆包 1.5 Pro', 'Doubao-Seed-1.8 / Doubao-Seed-2.0 Pro'],
    rwkv: ['— / —', 'RWKV-4 Raven 14B / —', 'RWKV-6 Finch 14B / —', 'RWKV-7 G1 7B / —'],
    ernie: ['— / 文心一言', '文心大模型 4.0 / —', '文心大模型 4.0 / 文心 4.5 / X1', '文心 5.0 / —'],
    mistral: ['— / —', 'Mistral Medium（原型） / Mistral Large', 'Mistral Large 2 / —', 'Mistral Large 3 / Mistral Medium 3.5'],
    minimax: ['— / —', 'abab5.5 / abab6.5', 'abab6.5 / MiniMax-Text-01', 'MiniMax-M2.1 / MiniMax-M2.5'],
    perplexity: ['— / —', 'pplx-70b-online / —', 'Llama 3.1 Sonar Huge 405B Online / Sonar', 'Sonar Reasoning Pro / —'],
    image2: ['DALL·E 2 / —', 'DALL·E 3 / —', 'DALL·E 3 / GPT-4o 图像生成', 'GPT Image 1.5 / GPT Image 2'],
    llama: ['— / LLaMA 65B', 'Llama 2 70B / Llama 3 70B', 'Llama 3.1 405B / Llama 4 Maverick', 'Llama 4 Maverick / Muse Spark'],
    hunyuan: ['— / —', '混元大模型 / —', 'Hunyuan-Large / Hunyuan-T1', 'Hunyuan HY 2.0 Think / Hy3-preview'],
    stepfun: ['— / —', '— / Step-1', 'Step-2 / —', 'Step 3 / Step 3.5 Flash'],
    novelai: ['Krake / —', 'Kayra / —', 'Erato / —', 'Erato / Xialong'],
    midjourney: ['Midjourney V4 / Midjourney V5', 'Midjourney V6 / —', 'Midjourney V6.1 / Midjourney V7', 'Midjourney V7 / Midjourney V8'],
    suno: ['— / Bark', 'Chirp v2 / Suno v3', 'Suno v4 / —', 'Suno v5 / Suno v5.5'],
    elevenlabs: ['— / ElevenLabs Beta', 'Eleven Multilingual v2 / —', 'Eleven Turbo v2.5 / —', 'Eleven v3 / Eleven v3（正式版）'],
    fable: ['— / Claude', 'Claude 2.1 / Claude 3 Opus', 'Claude 3.5 Sonnet（新版） / Claude 3.7 Sonnet', 'Claude Opus 4.5 / Claude Opus 4.6'],
    jev: ['— / —', '— / —', '— / —', '— / —'],
  };
  it('24 × 4 的开局阵容（在线 / 在训）与附录表 13 一致', () => {
    for (const c of COMPANIES) SCS.forEach((sc, i) => {
      const s = E.createGame(c.id, sc, 1);
      const live = E.liveModel(s), w = E.workingModel(s);
      // 在训的下一代没有名字，提示里记着现实里的型号名（P2.1，规格 C6）；没有下一代时，在线旗舰会留一个后训练副本，不算“在训旗舰”。
      const next = w?.hint?.realName ?? '—';
      assert.equal(`${live ? live.name : '—'} / ${next}`, T13[c.id][i], `${c.id} ${sc}`);
      // 选人界面不剧透下一代的名字（C6）：name 只给在线模型的，有下一代时 training 为真。
      assert.deepEqual([E.startModel(c.id, sc)?.name ?? null, !!E.startModel(c.id, sc)?.training], [live ? live.name : null, next !== '—'], `${c.id} ${sc} 选人界面`);
    });
  });
  it('并入时另查出的三处：Gemini y2025 在线的是带 S 的 2.0 Flash Thinking（75.20，高于 2.0 Flash）；Suno y2023 在训的是带 S 的 Bark；Fable 四个剧本和 Claude 完全相同', () => {
    const g = E.liveModel(E.createGame('gemini', 'y2025', 1));
    assert.deepEqual([g.name, q(g).toFixed(2)], ['Gemini 2.0 Flash Thinking', '75.20']);
    assert.ok(q(rel('Gemini 2.0 Flash')) < q(g));
    assert.ok(rel('Bark').tags.includes('S'));
    assert.equal(E.workingModel(E.createGame('suno', 'y2023', 1)).hint?.realName, 'Bark');
    // Fable 现在有自己的名表（hn_fable5），下一代候选提示不再和 Claude 相同；开局阵容本身仍然相同。
    for (const sc of SCS) {
      const a = E.startModel('fable', sc), b = E.startModel('claude', sc);
      assert.deepEqual([a.name, a.date, a.training], [b.name, b.date, b.training], sc);
    }
  });
  it('继承的已发布型号记 hist、真实发布日、发布角色；在训的后训练副本不带这些', () => {
    const s = E.createGame('deepseek', 'y2026', 1);
    const live = E.liveModel(s), small = E.smallLive(s);
    assert.deepEqual([live.hist, live.releasedDay, live.line, live.origin], [true, rel('DeepSeek-V3.2').day, 'main', 'pretrain']);
    assert.deepEqual([small.hist, small.line, small.origin], [true, 'side', 'distill']);
    for (const m of s.models.filter(x => x.stage !== 'released')) assert.ok(!m.hist && !m.releasedDay && !m.line, m.name);
  });
});

describe('D1：发布时顶不顶替在线旗舰', () => {
  const ready = (id, sc) => { const s = E.createGame(id, sc, 1); resolveAll(s); const w = E.workingModel(s); w.postDays = (w.postDays || 0) + 60; return s; };
  it('弱于在线旗舰的训练线发布默认作为副线：line = side，s.live 不变、不进 deploy；勾上“顶替”后 line = main，全量上线后 s.live 指向它', () => {
    const s = ready('gpt', 'y2025');
    const live = E.liveModel(s), w = E.workingModel(s);
    w.dims = flat('llm', q(live) - 3);
    assert.equal(E.releaseLine(s, w), 'side');
    const r = L.decide(s, 'release', {});
    assert.deepEqual([r.line, r.model.line, relRole(r.model)], ['side', 'side', 'small']);
    assert.equal(s.live, live.id);
    assert.ok(!s.deploy.some(d => d.id === r.model.id));
    assert.ok(!E.cond(s, { released: { role: 'flagship' } }), '副线不计入 released:{role:flagship}');
    assert.ok(E.cond(s, { released: { role: 'small' } }));
    resolveAll(s);
    w.postDays += 60;
    const r2 = L.decide(s, 'release', { replace: true });
    assert.deepEqual([r2.line, relRole(r2.model)], ['main', 'flagship']);
    assert.ok(s.deploy.some(d => d.id === r2.model.id && d.role === 'flagship'));
    advance(s, 20);
    assert.equal(s.live, r2.model.id);
    assert.ok(s.models.some(m => m.id === live.id), '原来的旗舰下线，留在模型表里');
  });
  it('强于或等于在线旗舰的一律顶替（没有不顶替的选项）', () => {
    const s = ready('gpt', 'y2025');
    const w = E.workingModel(s);
    w.dims = flat('llm', q(E.liveModel(s)) + 0.5);
    assert.equal(E.releaseLine(s, w, { replace: false }), 'main');
    assert.equal(L.decide(s, 'release', {}).line, 'main');
  });
  it('小模型线出身、强于在线旗舰的快照默认顶替：进 deploy 当旗舰，计入 released:{role:flagship}，全量后 s.live 指向它、不占 smallLive', () => {
    const s = ready('deepseek', 'y2026');
    const sw = E.smallWorking(s), oldSmall = s.smallLive;
    sw.dims = flat('llm', q(E.liveModel(s)) + 1);
    const r = L.decide(s, 'release', { role: 'small' });
    assert.deepEqual([r.line, sw.line, sw.origin, relRole(sw)], ['main', 'main', 'distill', 'flagship']);
    assert.ok(s.deploy.some(d => d.id === sw.id && d.role === 'flagship'));
    assert.ok(E.cond(s, { released: { role: 'flagship' } }));
    advance(s, 20);
    assert.deepEqual([s.live, s.smallLive], [sw.id, oldSmall]);
  });
  it('小模型线弱于在线旗舰：照旧进 smallLive，是副线', () => {
    const s = ready('deepseek', 'y2026');
    const sw = E.smallWorking(s);
    const r = L.decide(s, 'release', { role: 'small' });
    assert.deepEqual([r.line, relRole(sw)], ['side', 'small']);
    advance(s, 20);
    assert.equal(s.smallLive, sw.id);
  });
  it('训练线的新旗舰还在灰度时，小模型线发布和“在线旗舰、正在灰度的旗舰”里较强的一款比：比灰度中的弱就是副线，弱款不会顶掉强款', () => {
    const s = ready('deepseek', 'y2026');
    const base = q(E.liveModel(s));
    E.workingModel(s).dims = flat('llm', base + 5);
    const r = L.decide(s, 'release', {});
    assert.equal(r.line, 'main');
    advance(s, 5);
    assert.ok(s.deploy.some(d => d.id === r.model.id), '训练线那一版还在灰度');
    const sw = E.smallWorking(s);
    sw.dims = flat('llm', base + 2);
    assert.equal(E.releaseLine(s, sw), 'side');
    const r2 = L.decide(s, 'release', { role: 'small' });
    assert.deepEqual([r2.line, relRole(sw)], ['side', 'small']);
    advance(s, 20);
    assert.deepEqual([s.live, s.smallLive], [r.model.id, sw.id]);
  });
  it('小模型线比正在灰度的旗舰还强：照样顶替，而且不早于灰度中的那款全量，最后在线的是最强的这一款', () => {
    const s = ready('deepseek', 'y2026');
    const base = q(E.liveModel(s));
    E.workingModel(s).dims = flat('llm', base + 5);
    const r = L.decide(s, 'release', {});
    const first = s.deploy.find(d => d.id === r.model.id);
    advance(s, 1);
    const sw = E.smallWorking(s);
    sw.dims = flat('llm', base + 6);
    const r2 = L.decide(s, 'release', { role: 'small' });
    assert.equal(r2.line, 'main');
    assert.ok(r2.until >= first.until, '小模型线这款不早于训练线那款全量');
    advance(s, 20);
    assert.equal(s.live, sw.id);
  });
  it('出身记在 m.origin：预训练出来的是 pretrain，蒸馏出来的是 distill', () => {
    const s = E.createGame('qwen', 'y2025', 1);
    assert.ok(s.models.every(m => m.origin === (m.role === 'small' ? 'distill' : 'pretrain')));
  });
});

describe('D1.1：榜单与量级', () => {
  it('总榜每个 org 一行；这款不是这家的综合旗舰时名字后标“（非旗舰）”；玩家只有一行', () => {
    const s = E.createGame('deepseek', 'y2026', 1);
    const rows = E.leaderboard(s, 'mmlupro').rows;
    assert.equal(new Set(rows.filter(r => !r.mine).map(r => r.org)).size, rows.filter(r => !r.mine).length);
    assert.equal(rows.filter(r => r.mine).length, 1, '玩家已发布的旗舰和小模型合成一行，取最好的成绩');
    assert.ok(s.models.filter(m => m.stage === 'released').length >= 2);
    const obs = { charId: '__observer__', mod: 'llm', date: '2025-03', day: '2025-03-01', company: { company: '观察者' }, models: [], published: {} };
    const ai = E.leaderboard(obs, 'mmlu').rows.find(r => r.org === 'openai');
    assert.deepEqual([ai.model, ai.name, ai.flagship], ['GPT-4.5', 'GPT-4.5（非旗舰）', false]);
    assert.equal(E.orgBest(null, 'openai', 'llm', '2025-03-01').name, 'o1');
    assert.ok(E.leaderboard(obs, 'mmlu', { cls: 'frontier' }).rows.every(r => !r.name.includes('（非旗舰）')), '量级榜不标');
  });
  it('量级榜只收 730 天内发布的：Llama 2 70B 在 2023 年的中档榜上，2026 年就不在了', () => {
    const at = day => E.leaderboard({ ...E.createGame('kimi', 'y2026', 1), date: day.slice(0, 7), day }, 'mmlu', { cls: 'mid' }).rows;
    assert.ok(at('2024-01-01').some(r => r.model === 'Llama 2 70B' || r.org === 'meta'));
    const late = at('2026-10-01');
    assert.ok(!late.some(r => r.model === 'Llama 2 70B'));
    assert.ok(late.filter(r => !r.mine).every(r => (Date.parse('2026-10-01') - Date.parse(RELEASES.find(x => x.name === r.model).day)) / 864e5 <= 730));
  });
  it('同量级名次目标的 N = max(1, min(3, floor(对手数 / 2)))：2 家要第一，4 家前二，6 家起前三', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 12].map(classTop), [1, 1, 1, 1, 2, 2, 3, 3, 3]);
  });
  it('clsOf：规模表写明的量级优先（f2t 是前沿），其余按总参数 15 / 100 分小中大', () => {
    const f2t = SCALES.llm.find(x => x.id === 'f2t');
    assert.equal(E.clsOf({ mod: 'llm', total: f2t.total, active: f2t.active }), 'frontier');
    assert.equal(E.clsOf({ mod: 'llm', total: 15 }), 'small');
    assert.equal(E.clsOf({ mod: 'llm', total: 100 }), 'mid');
    assert.equal(E.clsOf({ mod: 'llm', total: 104 }), 'large');
    assert.equal(E.clsOf({ mod: 'llm', total: 1600, cls: 'frontier' }), 'frontier');
    assert.equal(E.clsOf({ mod: 'image', scaleId: 'i20' }), 'large');
  });
});

describe('D6.2 的锚点（P1.2 读）', () => {
  it('GPT y2023：领先时自家史线提前 90 天计入（GPT-4 − 1）；Suno y2023 在 MusicGen 之前用临时锚（Bark 31.25）', () => {
    const s = E.createGame('gpt', 'y2023', 1);
    assert.equal(E.worldSota(s).rel.name, 'Krake');
    assert.equal(ownHist(s), q(rel('GPT-4')));
    assert.equal(histOther(s), q(rel('Krake')));
    assert.equal(anchor(s), q(rel('GPT-4')) - SOTA.HIST_SLACK);
    const env = anchorEnv(s);
    assert.equal(env.knowledge, rel('GPT-4').dims.knowledge - SOTA.HIST_SLACK);
    const suno = E.createGame('suno', 'y2023', 1);
    assert.deepEqual([E.worldSota(suno), histOther(suno)], [null, null]);
    assert.equal(tempAnchor(suno), 31.25);
    assert.equal(anchor(suno), 31.25);
    assert.ok(Object.values(anchorEnv(suno)).every(Number.isFinite));
  });
  it('没炼出过的公司不计自家史线；不领先时自家史线最多算到对手最强 + 1', () => {
    const c = E.createGame('claude', 'y2024', 1);
    assert.ok(!sotaMade(c));
    assert.equal(anchor(c), Math.max(E.worldSota(c).q, histOther(c) - SOTA.HIST_SLACK));
    const g = E.createGame('gpt', 'y2026', 1);
    assert.notEqual(g.sota.holder.by, 'me');
    g.working = null;
    const ws = E.worldSota(g).q;
    assert.ok(anchor(g) <= Math.max(ws + SOTA.GHOST_CAP, histOther(g) - SOTA.HIST_SLACK) + 1e-9);
    for (const c2 of COMPANIES) for (const sc of SCS) { const x = E.createGame(c2.id, sc, 1); assert.ok(Number.isFinite(anchor(x)), `${c2.id} ${sc}`); }
  });
  it('envelope、realQ', () => {
    const s = E.createGame('qwen', 'y2025', 1);
    const env = envelope(s);
    assert.ok(env.math >= rel('o1').dims.math);
    assert.equal(realQ('o1'), q(rel('o1')));
    assert.equal(realQ('不存在'), null);
    const mine = envelope(s, { includeMine: true });
    assert.ok(Object.keys(env).every(k => mine[k] >= env[k]));
  });
});

describe('SOTA 账本不再迁移旧结构', () => {
  it('历史 v3 夹具明确拒绝，原始 JSON 不改写', () => {
    const dir = new URL('../fixtures/saves/', import.meta.url);
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json') && !x.startsWith('.'))) {
      const raw = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')), before = JSON.stringify(raw);
      const r = E.migrateGame(raw); assert.equal(r.ok, false, f); assert.match(r.reason, /不支持|版本|旧存档/);
      assert.equal(JSON.stringify(raw), before, f);
    }
  });
  it('旧 SOTA：拒绝缺失结构且不补写原对象', () => {
    const s = E.createGame('qwen', 'y2025', 1); delete s.sota;
    const before = JSON.stringify(s); assert.throws(() => ensureSota(s), /不支持|旧存档/);
    assert.equal(JSON.stringify(s), before);
    const r = E.migrateGame(s); assert.equal(r.ok, false); assert.equal(JSON.stringify(s), before);
  });
  it('96 个当前新开局都有完整标签账本且继承型号仍带真实史实信息', () => {
    let inherited = 0;
    for (const c of COMPANIES) for (const sc of SCS) {
      const s = E.createGame(c.id, sc, 1); assert.equal(ensureSota(s), s.sota);
      for (const m of s.models.filter(x => x.hist)) { assert.ok(m.releasedDay && m.line && m.origin); inherited++; }
    }
    assert.ok(inherited >= 60);
  });
});
