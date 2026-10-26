// 型号命名（规格 C1、C2、C5、C6，P2.1）：起名规则的正反用例、建议名、主键改用 id、存档里没有“训练中”、
// 发布面板预告的名字和实际发布一致、授名条件（干净训练、按 sotaWouldTake 判 sota）、授权作废、开局继承、读档迁移和开发期存档兜底。
// 原来的 model_names.test.mjs（旧命名：在练模型叫“真实型号名（训练中）”、s.verNext、按日期代号迭代）随 C5 删除，意思并进这里。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from '../../src/career/engine.js';
import { COMPANIES, SCENARIOS } from '../../src/career/data/core.js';
import { RELEASES } from '../../src/career/data/rivals.js';
import { COMPANY_FILES } from '../../src/career/data/companies/index.js';
import { reservedNames, normName, namingTick, ensureNaming, ORG_BRANDS, hnFor, hnById, grantFits, nextHintText } from '../../src/career/sim/naming.js';
import { newModel } from '../../src/career/sim/projects.js';
import { DAY } from '../../src/career/sim/loop.js';
import { finish } from '../../src/career/sim/finish.js';
import { recordRun } from '../../src/career/sim/release.js';
import { resolveAll, advance, playGame, playAdvised } from '../helpers/career_bot.mjs';
import { clone, loadSave, asOldNaming, baseJob } from '../helpers/career_util.mjs';
import { projectTick } from '../helpers/legacy_jobs.mjs';
import * as L from '../helpers/legacy_jobs.mjs';

globalThis.document ??= { baseURI: 'http://localhost/' };
const releasePanel = await import('../../src/career/ui/panels/release.js');
const modelPage = await import('../../src/career/ui/pages/model.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fresh = (c, sc, seed = 1) => { const s = E.createGame(c, sc, seed); resolveAll(s); return s; };
const ok = (s, name, opts) => E.validateModelName(s, name, opts);
const yes = (s, name, opts) => { const v = ok(s, name, opts); assert.ok(v.ok, `「${name}」应该能用：${v.reason}`); };
const no = (s, name, why, opts) => { const v = ok(s, name, opts); assert.ok(!v.ok, `「${name}」不该能用`); assert.match(v.reason, why, `「${name}」的原因：${v.reason}`); };
// 键排好序再比（迁移会删字段再补，键的先后可能不同）。
const sorted = v => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v);
// 可以发布：后训练满两周、没有在灰度的。
const readyToRelease = s => { const w = E.workingModel(s); w.postDays = Math.max(w.postDays || 0, 30); w.relDays = 0; s.deploy = []; s.queue = []; return w; };
// 临时给某家公司装上历史名表（内容包落地以前公司文件都是 null）。
function withNames(company, names, fn) {
  const was = COMPANY_FILES[company];
  COMPANY_FILES[company] = { company, tree: null, spirits: {}, startSpirits: [], names, exclusives: [] };
  try { return fn(); } finally { COMPANY_FILES[company] = was; }
}
const hn = (id, name, extra = {}) => ({ id, name, series: null, role: 'flagship', node: 'test_node', real: '2025-01-20', model: null, world: null, clean: null, events: [], ...extra });
const grant = (s, id, extra = {}) => { s.strategy = { ...(s.strategy || {}), rights: { ...(s.strategy?.rights || {}), [id]: { day: s.day, until: '2027-01-01', used: null, void: null, ...extra } } }; };
// 发布面板里“旗舰：X”“小模型：X”写的名字。
const panelName = (s, which) => releasePanel.render(s).match(new RegExp(`<b>${which}：([^<]*)</b>`))?.[1] ?? null;
// 玩家发布的名字不是真实型号名；用授名发布的除外：m.grant 有值、名字就是那个授名或它的 series 变体（C2。P3.D 的验收要机器人发出“DeepSeek-R1”）。
const notRealName = (s, m) => (!!m.grant && grantFits(hnById(s, m.grant), m.name)) || !RELEASES.some(r => normName(r.name) === normName(m.name));
// 模拟 P3.D 落地：DeepSeek 的名表里有 hn_ds_r1“DeepSeek-R1”，树上有授它的节点 ds_r1（只为验证断言在名表落地后仍成立）。
function withDeepSeekR1(fn) {
  const was = COMPANY_FILES.deepseek;
  COMPANY_FILES.deepseek = {
    company: 'deepseek',
    tree: { id: 'deepseek', extends: 'core_llm', omit: [], branches: { base: '根基与资金', reason: '推理' },
      nodes: [{ id: 'ds_r1', title: 'R1', desc: '测试用的节点。', branch: 'reason', pos: [0, 0], days: 21, prereq: [], popup: 'none',
        hist: { date: '2025-01-20', text: 'R1 开源。' }, ai: { base: 50, historic: 100 }, grants: { names: ['hn_ds_r1'] } }] },
    spirits: {}, startSpirits: [],
    names: [hn('hn_ds_r1', 'DeepSeek-R1', { node: 'ds_r1' })],
    exclusives: [],
  };
  try { return fn(); } finally { COMPANY_FILES.deepseek = was; }
}
// 整局玩下来，玩家自己发布的名字：合法、不重名、没有日期代号和括号接尾巴、不是真实型号名（授名除外）。
function checkOwnNames(s, at) {
  const mine = s.models.filter(m => m.stage === 'released' && !m.hist);
  const names = s.models.filter(m => m.stage === 'released').map(m => normName(m.name));
  assert.equal(new Set(names).size, names.length, `${at} 重名`);
  for (const m of mine) {
    assert.ok(typeof m.name === 'string' && !/训练中|）-|-\d{4}[a-h]?$/.test(m.name), `${at}：${m.name}`);
    assert.ok(notRealName(s, m), `${at} 用了真实型号名 ${m.name}`);
  }
  return mine;
}

describe('C1 起名规则：每条都有正反用例', () => {
  const s = fresh('deepseek', 'y2025');
  it('第 1 条：长度 1–32 个字、字符集、至少一个字母或汉字、不能含“训练中”', () => {
    no(s, '', /空/);
    no(s, '   ', /空/);
    no(s, 'A'.repeat(33), /32/);
    no(s, 'Phoenix/1', /只能用/);
    no(s, 'Phoenix@home', /只能用/);
    no(s, '2025', /字母或汉字/);
    no(s, '12.5-3', /字母或汉字/);
    no(s, 'Phoenix 训练中', /训练中/);
    no(s, '（内部测试）', /括号外面/);
    yes(s, 'Phoenix');
    yes(s, '  Phoenix  ');
    assert.equal(ok(s, '  Phoenix  ').name, 'Phoenix', '去掉首尾空白');
    yes(s, 'A'.repeat(32));
    yes(s, '凤凰 1.0');
    yes(s, 'Whale-2 (beta)');
    yes(s, 'Whale_2+·（内测）');
  });
  it('第 2 条：规范化后不能和本局已发布的模型重名（自己除外）', () => {
    const t = clone(s);
    const own = { ...clone(E.liveModel(t)), id: 'own1', name: 'Phoenix 1', hist: false };
    t.models.push(own);
    no(t, 'Phoenix 1', /已经有一款叫「Phoenix 1」/);
    no(t, 'phoenix-1', /已经有一款/);
    no(t, 'PHOENIX_1（新版）', /已经有一款/);
    yes(t, 'Phoenix 1', { modelId: 'own1' });
    yes(t, 'Phoenix 2');
    // 在练的模型没有名字，不算重名。
    yes(t, 'Phoenix 3');
  });
  it('第 3 条：不能等于任何真实型号名，自家线的也算，不分年代', () => {
    no(s, 'GPT-4', /现实里的型号名/);
    no(s, 'gpt 4', /现实里的型号名/);
    no(s, 'DeepSeek-V2.5', /现实里的型号名/);
    no(s, 'DeepSeek V3.2', /现实里的型号名/);
    no(s, 'Claude 3.5 Sonnet', /现实里的型号名/);   // RELEASES 里是“Claude 3.5 Sonnet（新版）”和不带括号的那款
    no(s, 'GPT-6 Astra', /现实里的型号名/);          // 2026 年的名字，2025 年开局也不能用
    yes(s, 'DeepSeek-V9');
    assert.ok(RELEASES.every(r => reservedNames(s).has(normName(r.name))), 'reservedNames 含全部 RELEASES 名');
  });
  it('第 4 条：不能等于历史名、不能以 series 前缀开头，除非持有对应授权', () => {
    const names = [hn('hn_qwen25', 'Qwen2.5', { series: 'Qwen2.5-' }), hn('hn_qw_test', '通义星河')];
    withNames('qwen', names, () => {
      const q = fresh('qwen', 'y2025');
      assert.ok(reservedNames(q).has(normName('Qwen2.5')) && reservedNames(q).has(normName('通义星河')));
      no(q, 'Qwen2.5', /留给史实成就/);
      no(q, 'qwen 2.5', /留给史实成就/);
      no(q, 'Qwen2.5-7B', /以「Qwen2.5-」开头/);
      no(q, 'Qwen2.5 Coder', /以「Qwen2.5-」开头/);
      no(q, '通义星河', /留给史实成就/);
      yes(q, 'Qwen2.6-Coder');
      // 持有授权：名字本身和 series 变体都能用；授权用过、作废、过期的不行。
      no(q, 'Qwen2.5', /留给史实成就/, { grant: 'hn_qwen25' });
      grant(q, 'hn_qwen25');
      yes(q, 'Qwen2.5', { grant: 'hn_qwen25' });
      yes(q, 'Qwen2.5-7B', { grant: 'hn_qwen25' });
      no(q, 'Qwen2.5', /留给史实成就/, { grant: 'hn_qw_test' });
      for (const bad of [{ used: 'x' }, { void: '别家先做到了' }, { until: '2024-12-31' }]) {
        grant(q, 'hn_qwen25', bad);
        no(q, 'Qwen2.5-7B', /以「Qwen2.5-」开头/, { grant: 'hn_qwen25' });
      }
      // 别家的历史名也一样不能用（DeepSeek 玩家）。
      no(fresh('deepseek', 'y2025'), '通义星河', /留给史实成就/);
    });
    withNames('llama', [hn('hn_llama2', 'Llama 2', { series: 'Llama 2 ' })], () => {
      const l = fresh('llama', 'y2024');
      no(l, 'Llama 2 13B', /以「Llama 2」开头/);
      yes(l, 'Llama 2.5', {});
    });
  });
  it('第 5 条：不能以别家的品牌词开头；Stepwise、Phoenix、Yield 能用，Step 4、Yi-2 不能；自家品牌词可以用', () => {
    for (const n of ['Stepwise', 'Phoenix', 'Yield', 'Gemstone', 'Claudette', 'Grokking Pro', 'Sunny 2', 'Seedling 2', 'DeepSeek Ultra']) yes(s, n);
    no(s, 'Step 4', /阶跃|StepFun/);
    no(s, 'Yi-2', /「Yi」/);
    no(s, 'GPT 9', /「GPT」/);
    no(s, 'gpt4 ultra', /「GPT」/);
    no(s, 'Qwen3 Turbo', /「Qwen」/);
    // 品牌词的最后一个词：名字里对应的词去掉末尾数字后等于它也算（Qwen3-Ultra、GPT4 Nova、Step9 Pro 都拒）；品牌词本身也按分隔符切词（DALL·E 是两个词）。
    no(s, 'Qwen3-Ultra', /「Qwen」/);
    no(s, 'Qwen3-Max', /现实里的型号名/);   // 规格举的例子：本身就是真实型号名，第 3 条先拒
    no(s, 'GPT4 Nova', /「GPT」/);
    no(s, 'Step9 Pro', /「Step」/);
    no(s, 'dall-e 9', /「DALL·E」/);
    no(s, 'Nano Banana7 Ultra', /「Nano Banana」/);
    yes(s, 'Dall');
    yes(s, 'Nano 2');
    no(s, 'o3-pro', /「o3」/);
    no(s, 'DALL·E 9', /「DALL·E」/);
    no(s, 'Nano Banana X', /「Nano Banana」/);
    no(s, '文心大模型 9', /「文心」/);
    no(s, '通义千问9', /「通义」/);   // 含汉字的品牌词比规范化后的名字开头（中文名常常不加分隔）
    yes(s, '文星 9');
    no(s, 'Claude Next', /「Claude」/);
    no(s, 'Suno-like', /「Suno」/);
    // 自家的品牌：Fable 和 Claude 同属 anthropic，Image 2 和 GPT 同属 openai。
    yes(fresh('fable', 'y2025'), 'Claude Next');
    yes(fresh('image2', 'y2025'), 'GPT Painter');
    yes(fresh('qwen', 'y2025'), 'Qwen9 Turbo');
    no(fresh('qwen', 'y2025'), 'DeepSeek Ultra', /深度求索/);
    // 品牌表按 org 列，24 家可玩公司的 org 都在表里。
    assert.ok(COMPANIES.every(c => ORG_BRANDS[c.org]?.length), '每家公司的 org 都有品牌词');
  });
});

describe('C1 建议名：只是建议，永远避开保留名和已用名', () => {
  it('新底座主版本 +1，同一个底座再发小版本 +1；从在线旗舰复制出来接着练的那份算同一个底座', () => {
    const s = fresh('deepseek', 'y2025');
    assert.equal(E.suggestName(s, 'flagship'), 'DeepSeek-V4', '开局在练的 R1 是新底座：V3 → V4');
    readyToRelease(s);
    assert.equal(L.decide(s, 'release', {}).model.name, 'DeepSeek-V4');
    assert.equal(E.suggestName(s, 'flagship'), 'DeepSeek-V4.1', '同一个底座再发：小版本 +1');
    // 没有下一代的开局（ElevenLabs 2024）：在线旗舰复制出来接着练，第一次发布按小版本走。
    const el = fresh('elevenlabs', 'y2024');
    assert.ok(E.workingModel(el).id.endsWith('w'));
    assert.equal(E.suggestName(el, 'flagship'), 'Eleven Multilingual v2.1');
    // 上一个名字没有版本号的按“1”算：小版本走“Kimi Chat 1.1”，新底座走“Kimi Chat 2”（不接成“Kimi Chat.1”）。
    const km = fresh('kimi', 'y2024');
    assert.equal(E.liveModel(km).name, 'Kimi Chat');
    assert.equal(E.suggestName(km, 'flagship'), 'Kimi Chat 1.1');
    assert.equal(E.suggestName(km, 'flagship', { id: 'm_new_base', role: 'flagship' }), 'Kimi Chat 2');
    assert.equal(E.suggestName(fresh('novelai', 'y2024'), 'flagship'), 'Kayra 1.1');
    readyToRelease(km);
    assert.equal(L.decide(km, 'release', {}).model.name, 'Kimi Chat 1.1');
    assert.equal(E.suggestName(km, 'flagship'), 'Kimi Chat 1.2');
  });
  it('不跳到未来的号：主版本 +1 是保留名或本局用过的名字时，在当前主版本上加小版本（每家公司都一样）', () => {
    // GPT y2023：在线 GPT-3.5（ChatGPT），开局在练的下一代是新底座。GPT-4、GPT-5 都是真实型号名，首发叫 GPT-3.6，不跳成 GPT-6。
    const g = fresh('gpt', 'y2023');
    assert.equal(E.suggestName(g, 'flagship'), 'GPT-3.6');
    readyToRelease(g);
    assert.equal(L.decide(g, 'release', {}).model.name, 'GPT-3.6');
    // 再下一代（新底座）：GPT-4 还是保留名，接着加小版本。
    assert.equal(E.suggestName(g, 'flagship', { id: 'm_new_base', role: 'flagship' }), 'GPT-3.7');
    // 别的公司一样：Midjourney V4 在线，V5–V8 都是真实型号名 → V4.1（原来会跳成 V9）；Grok-1 在线，Grok-2 是真实型号名 → Grok-1.1。
    assert.equal(E.suggestName(fresh('midjourney', 'y2023'), 'flagship'), 'Midjourney V4.1');
    assert.equal(E.suggestName(fresh('grok', 'y2024'), 'flagship'), 'Grok-1.1');
    // 小模型线也一样：Gemma 2 27B 在线，Gemma 3 27B 是真实型号名 → Gemma 2.1 27B。
    assert.equal(E.suggestName(fresh('gemini', 'y2025'), 'small', { id: 'm_new_small', role: 'small' }), 'Gemma 2.1 27B');
    // 主版本 +1 是本局已经用过的名字：同样改加小版本，碰到真实型号名（V3.1、V3.2）继续往上加。
    const d = fresh('deepseek', 'y2025');
    d.models.unshift({ ...clone(E.liveModel(d)), id: 'own_v4', name: 'DeepSeek-V4', hist: false });
    assert.equal(E.suggestName(d, 'flagship'), 'DeepSeek-V3.3');
  });
  it('当前名字的纯数字日期代号不参与版本迭代', () => {
    const s = fresh('gpt', 'y2024'); E.liveModel(s).name = 'GPT-5-2309';
    assert.equal(E.suggestName(s, 'flagship'), 'GPT-5.3');
  });
  it('碰到真实型号名、历史名、本局已用的名字就继续往上加；都通过校验', () => {
    const c = fresh('claude', 'y2026');
    // Claude Opus 4.5 在线、新底座：Opus 5 是真实型号名，改加小版本；Opus 4.6、4.7、4.8 也是真实型号名，到 4.9。
    assert.equal(E.suggestName(c, 'flagship'), 'Claude Opus 4.9');
    withNames('claude', [hn('hn_cl_test', 'Claude Opus 4.9')], () => assert.equal(E.suggestName(c, 'flagship'), 'Claude Opus 4.10'));
    for (const co of COMPANIES) for (const sc of SCENARIOS) {
      const s = E.createGame(co.id, sc.id, 1);
      for (const role of ['flagship', 'small']) {
        const m = role === 'small' ? E.smallWorking(s) : E.workingModel(s);
        const n = E.suggestName(s, role, m);
        assert.ok(E.validateModelName(s, n, { role, modelId: m?.id }).ok, `${co.id} ${sc.id} ${role}：${n}`);
      }
    }
  });
  it('没发布过：品牌名加“ 1”，小模型加“ Mini 1”；已经用掉的往后数', () => {
    const s = fresh('jev', 'y2023');
    assert.equal(E.suggestName(s, 'flagship', null), 'JEV 1');
    assert.equal(E.suggestName(s, 'small', null), 'JEV Mini 1');
    assert.equal(E.suggestName(fresh('fable', 'y2023'), 'small', null), 'Fable Mini 1', '角色名“Fable 5”去掉末尾的版本号');
  });
  it('机器人和大按钮整局玩下来：发布的名字都合法、不重名，没有日期代号和括号接尾巴', () => {
    for (const [c, sc] of [['deepseek', 'y2025'], ['claude', 'y2026'], ['gpt', 'y2024'], ['suno', 'y2023'], ['deepseek', 'y2026']]) {
      for (const play of [playGame, playAdvised]) {
        const { s, errors } = play(c, sc, 7);
        assert.deepEqual(errors, [], `${c} ${sc} ${play.name}`);
        checkOwnNames(s, `${c} ${sc} ${play.name}`);
      }
    }
  });
  it('装上名表（模拟 P3.D）以后整局照样成立：用授名发出的“DeepSeek-R1”是真实名，但带着 grant，不算冒用', () => {
    withDeepSeekR1(() => {
      for (const play of [playGame, playAdvised]) {
        const { s, errors } = play('deepseek', 'y2025', 7);
        assert.deepEqual(errors, [], play.name);
        const mine = checkOwnNames(s, `deepseek y2025 ${play.name}`);
        const r1 = mine.find(m => m.name === 'DeepSeek-R1');
        assert.ok(r1 && r1.grant === 'hn_ds_r1' && s.strategy.rights.hn_ds_r1.used === r1.id, `${play.name}：${mine.map(m => m.name).join('、')}`);
        // 同一个名字不带授权就是冒用。
        assert.ok(!notRealName(s, { ...r1, grant: undefined }));
      }
    });
  });
});

describe('C1 主键一律用 modelId：published、名人堂、ms 账本、deploy', () => {
  it('发布以后：成绩、灰度、全量上线、里程碑账本都按 id 找模型；名字只是副本', () => {
    const s = fresh('deepseek', 'y2025');
    readyToRelease(s);
    // 开局在练的这一代比在线的 V3 弱，勾“顶替在线旗舰”才进灰度（D1）。
    const r = L.decide(s, 'release', { replace: true });
    const snap = r.model;
    assert.equal(snap.id, `${E.workingModel(s).id}r0`, '快照 id 按发布次数编');
    assert.equal(E.workingModel(s).releases, 1);
    assert.ok(!('minor' in E.workingModel(s)) && !('minor' in snap));
    for (const [k, run] of Object.entries(s.published)) if (!k.endsWith('@small') && run.date === s.date) assert.equal(run.modelId, snap.id, k);
    assert.ok(Object.values(snap.benchmarks).every(b => b.modelId === snap.id));
    assert.deepEqual(s.deploy.map(d => d.id), [snap.id]);
    for (const e of Object.values(s.ms)) if (e.who === 'me' && e.day === s.day) assert.equal(e.modelId, snap.id);
    // 榜单按 modelId 认自己：改掉显示名，榜上照样认得出。
    const before = E.leaderboard(s, 'mmlu', { playerModel: snap.id }).rows.filter(x => x.mine).length;
    snap.name = '改了显示名';
    assert.equal(E.leaderboard(s, 'mmlu', { playerModel: snap.id }).rows.filter(x => x.mine).length, before);
    snap.name = r.model.name;
    // 全量上线那天 s.live 指向这份快照的 id。
    advance(s, 20);
    assert.equal(s.live, snap.id);
  });
  it('成绩换代按 modelId 比（不按名字）：同名的另一款、同一天、分数更低，也算换了一款', () => {
    const s = fresh('deepseek', 'y2025');
    const live = E.liveModel(s);
    const twin = { ...clone(live), id: 'twin', benchmarks: {} };
    s.models.push(twin);
    const id = Object.keys(s.published).find(k => !k.endsWith('@small'));
    const prev = s.published[id];
    assert.equal(prev.modelId, live.id);
    const run = E.runBenchmark(s, id, twin);
    Object.assign(run, { score: prev.score - 5, date: prev.date });
    recordRun(s, run, twin);
    assert.equal(s.published[id].modelId, 'twin');
    assert.equal(s.published[id].model, live.name, '名字一样，按名字比就不会换');
    assert.equal(twin.benchmarks[id].modelId, 'twin');
  });
  it('名人堂：结算记下最终模型的 modelId 和名字', async () => {
    const s = fresh('deepseek', 'y2025');
    finish(s, 'complete');
    assert.deepEqual([s.result.modelId, s.result.model], [E.liveModel(s).id, E.liveModel(s).name]);
    const state = await import('../../src/career/ui/state.js');
    const { finishGame } = await import('../../src/career/ui/flow.js');
    const { recordHall } = await import('../../src/career/ui/hof.js');
    const { HOF_KEY } = await import('../../src/career/ui/storage.js');
    const prior = { storage: globalThis.localStorage, s: state.getState(), w: state.getWorld(), mp: state.getMp(), screen: state.ui.screen };
    const mem = new Map();
    globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    try {
      state.setState(s); state.setWorld(null); state.setMp(null);
      finishGame();
      // 加入 finishGame 已启动的同一异步记账，不自行构造含模型字段的条目。
      assert.equal(await recordHall(s, null, {}), true);
      const rows = JSON.parse(mem.get(HOF_KEY));
      assert.equal(rows.length, 1, '实际存入一条结算记录');
      assert.deepEqual([rows[0].modelId, rows[0].model], [E.liveModel(s).id, E.liveModel(s).name], '实际名人堂保留最终型号主键和名字');
      assert.equal(s.hofSaved, true, '异步写成后才标记已记账');
    } finally {
      state.setState(prior.s); state.setWorld(prior.w); state.setMp(prior.mp); state.ui.screen = prior.screen;
      if (prior.storage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = prior.storage;
    }
  });
});

describe('存档里没有“训练中”；没发布的模型没有名字（C1、C5）', () => {
  it('24 × 4 开局：在练模型 name = null；没有 s.verNext、m.minor、m.ver、m.realName、命名用的 lineage 字符串', () => {
    for (const c of COMPANIES) for (const sc of SCENARIOS) {
      const s = E.createGame(c.id, sc.id, 1);
      const json = JSON.stringify(s);
      assert.ok(!json.includes('训练中'), `${c.id} ${sc.id}`);
      assert.equal(s.verNext, undefined);
      for (const m of s.models) {
        if (m.stage !== 'released') assert.equal(m.name, null, `${c.id} ${sc.id} ${m.id}`);
        else assert.ok(typeof m.name === 'string' && m.name);
        for (const k of ['minor', 'ver', 'realName']) assert.ok(!(k in m), `${c.id} ${sc.id} ${m.id}.${k}`);
        assert.ok(typeof m.lineage !== 'string');
      }
    }
  });
  it('整局玩下来（机器人、大按钮）：存档 JSON 里一处“训练中”都没有', () => {
    for (const [c, sc] of [['qwen', 'y2024'], ['gpt', 'y2023'], ['midjourney', 'y2025'], ['jev', 'y2026'], ['deepseek', 'y2026']]) {
      for (const play of [playGame, playAdvised]) {
        const { s } = play(c, sc, 3);
        assert.ok(!JSON.stringify(s).includes('训练中'), `${c} ${sc} ${play.name}`);
        for (const m of s.models) if (m.stage !== 'released') assert.equal(m.name, null);
      }
    }
  });
  it('界面显示：没发布的写代号或“第 N 代底座”加“（训练中）”，发布了写名字；提示文字（会存进队列）不带“（训练中）”', () => {
    const s = fresh('deepseek', 'y2025');
    const w = E.workingModel(s);
    assert.equal(E.displayName(w), `第 ${w.gen} 代底座（训练中）`);
    assert.equal(E.modelLabel(w), `第 ${w.gen} 代底座`);
    assert.equal(E.displayName({ ...w, draftName: '鲸落' }), '鲸落（训练中）');
    assert.equal(E.displayName({ role: 'small', gen: 2, name: null }), '在练的小模型（训练中）');
    assert.equal(E.displayName(E.liveModel(s)), 'DeepSeek-V3');
  });
  it('模型页卡片：标签写状态，标题不再重复“（训练中）”；待发布的小模型写代号或“新的小模型”（和主界面芯片同一个说法）', () => {
    const titles = html => [...html.matchAll(/<span class="ev-tag">([^<]*)<\/span><b>([^<]*)<\/b>/g)].map(x => `${x[1]}｜${x[2]}`);
    for (const c of COMPANIES) for (const sc of SCENARIOS) {
      const html = modelPage.render(E.createGame(c.id, sc.id, 1), {});
      for (const t of titles(html)) assert.ok(!t.includes('（训练中）') && !t.includes('在练的小模型'), `${c.id} ${sc.id}：${t}`);
    }
    const s = fresh('deepseek', 'y2025');
    const w = E.workingModel(s);
    assert.ok(titles(modelPage.render(s, {})).includes(`训练中｜第 ${w.gen} 代底座`));
    w.draftName = '鲸落';
    assert.ok(titles(modelPage.render(s, {})).includes('训练中｜鲸落'));
    // 2026 剧本开局就有一款蒸馏好、等着发布的小模型：没有代号。
    const d26 = E.createGame('deepseek', 'y2026', 1);
    assert.ok(titles(modelPage.render(d26, {})).includes('待发布小模型｜新的小模型'), titles(modelPage.render(d26, {})).join(' / '));
    E.smallWorking(d26).draftName = '小鲸';
    assert.ok(titles(modelPage.render(d26, {})).includes('待发布小模型｜小鲸'));
  });
});

describe('C1 代号 draftName：立项时选填，练完写进模型', () => {
  it('预训练填了代号：练完的底座带 draftName，显示“代号（训练中）”，“预训练完成”提示用代号；不合法的代号立项时就拒绝', () => {
    const s = fresh('jev', 'y2024');
    const cfg = { total: 7, active: 7, arch: 'dense', tokens: 1 };
    assert.match(E.projectCheck(s, { ...cfg, draftName: '鲸落训练中' }).reason, /训练中/);
    assert.match(E.projectCheck(s, { ...cfg, draftName: 'A'.repeat(33) }).reason, /32/);
    assert.ok(E.projectCheck(s, { ...cfg, draftName: '  ' }).ok, '空代号等于没填');
    L.startProject(s, { ...cfg, draftName: ' 鲸落 ' });
    assert.equal(baseJob(s).pj.draftName, '鲸落');
    assert.ok(!('draftName' in baseJob(s).pj.cfg));
    baseJob(s).pj.done = baseJob(s).pj.need;
    s.queue = [];
    projectTick(s, { notes: [] }, DAY);
    const m = E.workingModel(s);
    assert.deepEqual([m.name, m.draftName, E.displayName(m)], [null, '鲸落', '鲸落（训练中）']);
    assert.ok(s.queue.some(q => q.title === '预训练完成' && q.text.startsWith('鲸落 的底座训练完了')));
    // 没填代号：提示写“新一代的底座训练完了”，不拼成“第 N 代 的底座”。
    const t = fresh('jev', 'y2024');
    L.startProject(t, cfg);
    baseJob(t).pj.done = baseJob(t).pj.need;
    t.queue = [];
    projectTick(t, { notes: [] }, DAY);
    assert.ok(t.queue.some(q => q.title === '预训练完成' && q.text.startsWith('新一代的底座训练完了')), JSON.stringify(t.queue.map(q => q.text)));
  });
  it('蒸馏小模型：不再按“Flash/Mini + 计数”起名，2026 剧本写死的“Flash/Mini 2”也没了；发布时按建议名起名', () => {
    const d26 = E.createGame('deepseek', 'y2026', 1);
    const sw = E.smallWorking(d26);
    assert.ok(sw && sw.name === null && sw.hint?.realName, '2026 剧本里等着发布的下一代小模型没有名字，只带提示');
    const s = fresh('qwen', 'y2025');
    L.decide(s, 'maintain');
    L.startDistill(s, { teacher: 'self', total: 7, active: 7, arch: 'dense', tokens: 1.5, draftName: '小鲸' });
    baseJob(s).pj.done = baseJob(s).pj.need;
    baseJob(s).pj.elapsedDays = 7;
    s.queue = [];
    projectTick(s, { notes: [] }, DAY);
    const small = E.smallWorking(s);
    assert.deepEqual([small.name, small.draftName], [null, '小鲸']);
    assert.ok(s.queue.some(q => q.text?.startsWith('小鲸 蒸馏完成')));
    // 没填代号：提示写“新的小模型蒸馏完成”，不拼成“新的小模型 蒸馏完成”。
    const t = fresh('qwen', 'y2025');
    L.decide(t, 'maintain');
    L.startDistill(t, { teacher: 'self', total: 7, active: 7, arch: 'dense', tokens: 1.5 });
    baseJob(t).pj.done = baseJob(t).pj.need;
    baseJob(t).pj.elapsedDays = 7;
    t.queue = [];
    projectTick(t, { notes: [] }, DAY);
    assert.ok(t.queue.some(q => q.text?.startsWith('新的小模型蒸馏完成：')), JSON.stringify(t.queue.map(q => q.text)));
    s.queue = [];
    const want = E.releaseNamePlan(s, small, { role: 'small' }).name;
    assert.equal(panelName(s, '小模型'), want);
    assert.equal(L.decide(s, 'release', { role: 'small' }).model.name, want);
    assert.equal(small.name, want);
  });
});

describe('发布面板预告的名字和实际发布一致', () => {
  it('旗舰：面板写的名字 = releaseNamePlan = doRelease 的快照名；玩家起的名字合法就用，不合法就报错且什么都不改', () => {
    for (const [c, sc] of [['deepseek', 'y2025'], ['claude', 'y2026'], ['elevenlabs', 'y2024'], ['gpt', 'y2023'], ['fable', 'y2026']]) {
      const s = fresh(c, sc);
      readyToRelease(s);
      const shown = panelName(s, '旗舰');
      assert.equal(shown, E.releaseNamePlan(s, E.workingModel(s)).name, `${c} ${sc}`);
      assert.equal(L.decide(s, 'release', {}).model.name, shown, `${c} ${sc}`);
    }
    const s = fresh('deepseek', 'y2025');
    readyToRelease(s);
    const before = JSON.stringify(s);
    assert.throws(() => L.decide(s, 'release', { name: 'GPT-5' }), /现实里的型号名/);
    assert.throws(() => L.decide(s, 'release', { name: 'Step 4' }), /品牌/);
    assert.equal(JSON.stringify(s), before, '名字不合法时什么都不改');
    assert.equal(L.decide(s, 'release', { name: '  鲸落 1  ' }).model.name, '鲸落 1');
  });
  it('用授名：面板预填授名，发布出去就是授名；快照记 grant，授权记 used = 快照 id；用过以后不再预填', () => {
    withNames('deepseek', [hn('hn_ds_r1', 'DeepSeek-R1', { model: { minTotal: 100 }, clean: 'base' })], () => {
      const s = fresh('deepseek', 'y2025');
      grant(s, 'hn_ds_r1');
      readyToRelease(s);
      assert.equal(panelName(s, '旗舰'), 'DeepSeek-R1');
      const plan = E.releaseNamePlan(s, E.workingModel(s));
      assert.deepEqual([plan.name, plan.grant], ['DeepSeek-R1', 'hn_ds_r1']);
      const snap = L.decide(s, 'release', {}).model;
      assert.deepEqual([snap.name, snap.grant, s.strategy.rights.hn_ds_r1.used], ['DeepSeek-R1', 'hn_ds_r1', snap.id]);
      readyToRelease(s);
      assert.equal(panelName(s, '旗舰'), 'DeepSeek-R1.1');
      assert.throws(() => L.decide(s, 'release', { grant: 'hn_ds_r1' }), /已经用过了/);
      // 不用授名（grant: null）时照常按建议名。
      const t = fresh('deepseek', 'y2025');
      grant(t, 'hn_ds_r1');
      readyToRelease(t);
      assert.equal(L.decide(t, 'release', { grant: null }).model.name, 'DeepSeek-V4');
    });
  });
  it('用授名时名字锁定为授名（有 series 的可以是变体）：填了别的名字就报错，存档不变，授权不被用掉', () => {
    withNames('deepseek', [hn('hn_ds_r1', 'DeepSeek-R1')], () => {
      const s = fresh('deepseek', 'y2025');
      grant(s, 'hn_ds_r1');
      readyToRelease(s);
      const plan = E.releaseNamePlan(s, E.workingModel(s), { grant: 'hn_ds_r1', name: 'Phoenix' });
      assert.ok(!plan.ok && plan.grant === null);
      assert.match(plan.reason, /用型号名「DeepSeek-R1」时名字就是「DeepSeek-R1」/);
      const before = JSON.stringify(s);
      assert.throws(() => L.decide(s, 'release', { grant: 'hn_ds_r1', name: 'Phoenix' }), /时名字就是「DeepSeek-R1」/);
      assert.equal(JSON.stringify(s), before, '存档不变');
      assert.equal(s.strategy.rights.hn_ds_r1.used, null, '授权没被用掉');
      // 名字写成授名本身（大小写、分隔符不同也算）照常能用。
      const snap = L.decide(s, 'release', { grant: 'hn_ds_r1', name: 'deepseek r1' }).model;
      assert.deepEqual([snap.grant, s.strategy.rights.hn_ds_r1.used], ['hn_ds_r1', snap.id]);
    });
    withNames('qwen', [hn('hn_qwen25', 'Qwen2.5', { series: 'Qwen2.5-' })], () => {
      const s = fresh('qwen', 'y2025');
      grant(s, 'hn_qwen25');
      readyToRelease(s);
      const bad = E.releaseNamePlan(s, E.workingModel(s), { grant: 'hn_qwen25', name: 'Phoenix 72B' });
      assert.ok(!bad.ok);
      assert.match(bad.reason, /以「Qwen2\.5-」开头/);
      const good = E.releaseNamePlan(s, E.workingModel(s), { grant: 'hn_qwen25', name: 'Qwen2.5-100B' });
      assert.deepEqual([good.ok, good.name, good.grant], [true, 'Qwen2.5-100B', 'hn_qwen25']);
    });
  });
});

describe('C2 授名条件：干净训练、模型条件（sota 按 sotaWouldTake）、世界条件', () => {
  it('严重炸炉的底座不授名（base）：炸炉次数由预训练项目记进 m.train；小故障 1 次还算干净', () => {
    withNames('jev', [hn('hn_jev_test', 'JEV Prime', { clean: 'base' })], () => {
      const run = blowups => {
        const s = fresh('jev', 'y2024');
        L.startProject(s, { total: 7, active: 7, arch: 'dense', tokens: 1 });
        baseJob(s).pj.blowups = blowups;
        baseJob(s).pj.done = baseJob(s).pj.need;
        projectTick(s, { notes: [] }, DAY);
        grant(s, 'hn_jev_test');
        readyToRelease(s);
        return s;
      };
      const bad = run({ minor: 0, severe: 1 });
      const w = E.workingModel(bad);
      assert.deepEqual(w.train, { minor: 0, severe: 1 });
      const c = E.nameGrantCheck(bad, w, 'hn_jev_test');
      assert.ok(!c.ok);
      assert.deepEqual(c.lines.find(l => !l.ok), { text: '底座练得干净（没有严重炸炉，小故障不超过 1 次）', ok: false, now: '严重炸炉 1 次，小故障 0 次' });
      assert.equal(panelName(bad, '旗舰'), 'JEV 1', '条件不满足：面板不预填授名');
      assert.throws(() => L.decide(bad, 'release', { grant: 'hn_jev_test' }), /底座练得干净/);
      assert.equal(L.decide(bad, 'release', {}).model.name, 'JEV 1');
      assert.equal(bad.strategy.rights.hn_jev_test.used, null, '授权还在');
      const two = run({ minor: 2, severe: 0 });
      assert.ok(!E.nameGrantCheck(two, E.workingModel(two), 'hn_jev_test').ok, '小故障 2 次也不干净');
      const good = run({ minor: 1, severe: 0 });
      assert.ok(E.nameGrantCheck(good, E.workingModel(good), 'hn_jev_test').ok);
      assert.equal(L.decide(good, 'release', {}).model.name, 'JEV Prime');
    });
  });
  it('RL 干净天数不足不授名：数学/代码方向的 cleanStreak 加起来要满 days；出 spike 清零以后又不够', () => {
    withNames('deepseek', [hn('hn_ds_r1', 'DeepSeek-R1', { clean: { rl: { dirs: ['math', 'code'], days: 21 } } })], () => {
      const s = fresh('deepseek', 'y2025');
      grant(s, 'hn_ds_r1');
      readyToRelease(s);
      const w = E.workingModel(s);
      w.cleanStreak = { math: 12, code: 8, chat: 30 };
      let c = E.nameGrantCheck(s, w, 'hn_ds_r1');
      assert.ok(!c.ok);
      assert.deepEqual(c.lines.at(-1), { text: '干净训练满 21 天（数学/代码方向，出 loss spike 会清零）', ok: false, now: '20/21 天' });
      assert.equal(E.releaseNamePlan(s, w).grant, null);
      w.cleanStreak.code = 9;
      c = E.nameGrantCheck(s, w, 'hn_ds_r1');
      assert.ok(c.ok, JSON.stringify(c.lines));
      assert.equal(E.releaseNamePlan(s, w).grant, 'hn_ds_r1');
      w.cleanStreak.math = 0;   // 数学方向出了 spike（focus.js 清零）
      assert.ok(!E.nameGrantCheck(s, w, 'hn_ds_r1').ok);
    });
  });
  it('模型条件里的 sota：发布前按 sotaWouldTake 试算；世界条件、授权状态逐条显示当前值', () => {
    withNames('deepseek', [hn('hn_ds_top', 'DeepSeek Apex', { model: { sota: true }, world: { ms: { ms_open_reasoning_frontier: 'notOther' } } })], () => {
      const s = fresh('deepseek', 'y2025');
      readyToRelease(s);
      const w = E.workingModel(s);
      let c = E.nameGrantCheck(s, w, 'hn_ds_top');
      assert.deepEqual([c.ok, c.lines[0].ok, c.lines[0].now], [false, false, '还没拿到（要完成策略「test_node」）']);
      grant(s, 'hn_ds_top');
      assert.equal(E.sotaWouldTake(s, E.qOf(s.mod, w.dims)), false);
      c = E.nameGrantCheck(s, w, 'hn_ds_top');
      assert.ok(!c.ok && c.lines.some(l => /SOTA/.test(l.text) && !l.ok));
      const dims0 = { ...w.dims };
      for (const k of Object.keys(w.dims)) w.dims[k] = 99;
      assert.equal(E.sotaWouldTake(s, E.qOf(s.mod, w.dims)), true);
      c = E.nameGrantCheck(s, w, 'hn_ds_top');
      assert.ok(c.ok, JSON.stringify(c.lines));
      assert.equal(E.releaseNamePlan(s, w).name, 'DeepSeek Apex');
      // 世界条件：别家先做到了，授名条件不满足。
      s.ms.ms_open_reasoning_frontier = { who: 'qwen', day: s.day };
      assert.ok(!E.nameGrantCheck(s, w, 'hn_ds_top').ok);
      Object.assign(w.dims, dims0);
    });
  });
  it('作废：授权过期、world 条件永久失效时写 void 原因并入队提示；授名之后的检查显示“已作废”', () => {
    withNames('deepseek', [hn('hn_ds_r1', 'DeepSeek-R1', { world: { ms: { ms_open_reasoning_frontier: 'notOther' } } }), hn('hn_ds_old', 'DeepSeek Old')], () => {
      const s = fresh('deepseek', 'y2025');
      grant(s, 'hn_ds_r1');
      grant(s, 'hn_ds_old', { until: '2024-12-31' });
      namingTick(s, { notes: [] });
      assert.equal(s.strategy.rights.hn_ds_old.void, '这个名字的时代已经过去');
      assert.equal(s.strategy.rights.hn_ds_r1.void, null, '世界条件还没失效');
      s.ms.ms_open_reasoning_frontier = { who: 'qwen', day: s.day };
      namingTick(s, { notes: [] });
      assert.equal(s.strategy.rights.hn_ds_r1.void, '现实里这一步叫 DeepSeek-R1，但这一回阿里巴巴先做到了');
      assert.deepEqual(s.queue.filter(q => q.kind === 'notice').map(q => q.title), ['型号名「DeepSeek Old」用不上了', '型号名「DeepSeek-R1」用不上了']);
      namingTick(s, { notes: [] });
      assert.equal(s.queue.length, 2, '只提示一次');
      assert.match(E.nameGrantCheck(s, E.workingModel(s), 'hn_ds_r1').lines[0].now, /已作废/);
    });
  });
  it('端到端（P2.2 写授权、P2.1 读）：策略节点做完写入授权 → 发布面板预填授名 → doRelease 用授名、记 used → 专属事件按授名弹出；读档后不变', () => {
    // 临时给 DeepSeek 装一棵只有一个节点的树：做完授名 hn_ds_prime，并登记一条用这个授名发布时弹的专属事件。
    const was = COMPANY_FILES.deepseek;
    COMPANY_FILES.deepseek = {
      company: 'deepseek',
      tree: { id: 'deepseek', extends: 'core_llm', omit: [], branches: { base: '根基与资金', biz: '生意' },
        nodes: [{ id: 'ds_test_name', title: '定名', desc: '测试用的节点。', branch: 'biz', pos: [0, 0], days: 14, prereq: [], popup: 'none', ai: { base: 0 }, grants: { names: ['hn_ds_prime'], events: ['ex_ds_prime'] } }] },
      spirits: {}, startSpirits: [],
      names: [hn('hn_ds_prime', 'DeepSeek-Prime', { node: 'ds_test_name', real: '2024-09-01', model: { minTotal: 100 }, clean: 'base', events: ['ex_ds_prime'] })],
      exclusives: [{ id: 'ex_ds_prime', title: '{model}：发布事件', on: 'release', name: 'hn_ds_prime', cond: null, choices: [{ id: 'a', label: '甲', effects: { know: 3 } }, { id: 'b', label: '乙' }] }],
    };
    try {
      const s = fresh('deepseek', 'y2025');
      const w = E.workingModel(s);
      assert.deepEqual([E.nameGrantCheck(s, w, 'hn_ds_prime').ok, E.releaseNamePlan(s, w).grant], [false, null], '节点没做完：没有授权');
      E.startStrategy(s, 'ds_test_name');
      for (let i = 0; i < 30 && !s.strategy.done.ds_test_name; i++) { resolveAll(s); E.tickDay(s); }
      const done = s.strategy.done.ds_test_name;
      assert.equal(done?.how, 'done');
      assert.deepEqual(s.strategy.rights.hn_ds_prime, { day: done.day, until: '2025-09-01', used: null, void: null }, '授权：现实发布 + 365 比完成日 + 180 晚');
      // 团队练后训练，直到能发布（距上次发布后训练满两周）。
      resolveAll(s);
      L.decide(s, 'train', { dir: 'code' });
      for (let i = 0; i < 40 && E.releaseBlock(s); i++) { resolveAll(s); E.tickDay(s); }
      resolveAll(s);
      assert.equal(E.releaseBlock(s), '');
      const c = E.nameGrantCheck(s, E.workingModel(s), 'hn_ds_prime');
      assert.ok(c.ok, JSON.stringify(c.lines));
      assert.equal(panelName(s, '旗舰'), 'DeepSeek-Prime', '发布面板预填授名');
      const snap = L.decide(s, 'release', {}).model;
      assert.deepEqual([snap.name, snap.grant, s.strategy.rights.hn_ds_prime.used], ['DeepSeek-Prime', 'hn_ds_prime', snap.id]);
      assert.equal(s.strategy.ex.ex_ds_prime, s.day, '用授名发布：专属事件当天弹出');
      const card = s.queue.find(q => q.kind === 'exclusive' && q.id === 'ex_ds_prime');
      assert.equal(E.currentEvent({ ...s, queue: [card] }).title, 'DeepSeek-Prime：发布事件');
      // 用过的授权不再预填，也不会被作废；读档以后快照和授权都还在。
      resolveAll(s);
      E.tickDay(s);
      assert.deepEqual([s.strategy.rights.hn_ds_prime.void, E.releaseNamePlan(s, E.workingModel(s)).grant], [null, null]);
      const back = E.migrateGame(clone(s)).s;
      assert.deepEqual([back.models.find(m => m.id === snap.id)?.grant, back.strategy.rights.hn_ds_prime.used], ['hn_ds_prime', snap.id]);
    } finally { COMPANY_FILES.deepseek = was; }
  });
});

describe('C6 开局继承', () => {
  // 24 × 4 开局逐个检查。hint.hn 是名表里对应的历史名（没有为 null），所以公司名表（P3.D、P3.T）落地以后照样成立。
  const inherit = () => {
    let nexts = 0, named = 0;
    for (const c of COMPANIES) for (const sc of SCENARIOS) {
      const s = E.createGame(c.id, sc.id, 1);
      for (const m of s.models.filter(x => x.stage === 'released')) assert.ok(m.hist === true && RELEASES.some(r => r.name === m.name), `${c.id} ${sc.id} ${m.name}`);
      const w = E.workingModel(s);
      const used = new Set([s.working, s.smallWorking, s.live, s.smallLive]);
      assert.ok(s.models.every(m => used.has(m.id)), `${c.id} ${sc.id} 有没人用的模型`);
      if (w?.hint) {
        nexts++;
        if (w.hint.hn) named++;
        assert.ok(RELEASES.some(r => r.name === w.hint.realName) && w.hint.hn === hnFor(s, w.hint.realName) && w.name === null, `${c.id} ${sc.id}`);
        assert.ok(!s.models.some(m => m.id.endsWith('w')), `${c.id} ${sc.id} 有下一代时不复制在线旗舰`);
      }
    }
    assert.ok(nexts >= 40, `${nexts}`);
    return named;
  };
  // 选人文字：在练的下一代写 nextHintText（有对应的历史名时写候选名和要完成的策略，规格 C6 要的就是这句）；
  // 没有对应历史名的，不能剧透真实型号名。
  const pickText = () => {
    for (const c of COMPANIES) for (const sc of SCENARIOS) {
      const s = E.createGame(c.id, sc.id, 1);
      const x = E.startModel(c.id, sc.id);
      const real = E.workingModel(s)?.hint?.realName;
      if (!real) continue;
      assert.ok(x.text.endsWith(nextHintText(c.id, real)), `${c.id} ${sc.id}：${x.text}`);
      const live = E.liveModel(s)?.name ?? '';
      if (hnFor(s, real) === null) assert.ok(!x.text.replace(live, '').includes(real) && !x.detail.replace(live, '').includes(real), `${c.id} ${sc.id} 剧透了 ${real}`);
    }
  };
  it('开局之前发布的保留真实名、记 hist；在练的下一代没有名字，只带 hint（hn 是对应的历史名）；有下一代时不再复制孤儿 work 副本', () => {
    inherit();
    // 装上名表以后：DeepSeek y2025 在练的下一代（现实里叫 DeepSeek-R1）带上 hn_ds_r1，其余照旧。
    withDeepSeekR1(() => assert.ok(inherit() >= 1));
    withDeepSeekR1(() => assert.equal(E.workingModel(E.createGame('deepseek', 'y2025', 1)).hint.hn, 'hn_ds_r1'));
  });
  it('选人界面不剧透：只写“下一代在练”；名表里有对应的历史名时写候选名和要完成的策略', () => {
    const t = E.startModel('deepseek', 'y2025');
    assert.deepEqual([t.name, t.training, t.text], ['DeepSeek-V3', true, `在线：DeepSeek-V3 · ${nextHintText('deepseek', 'DeepSeek-R1')}`]);
    pickText();
    withDeepSeekR1(() => {
      assert.equal(E.startModel('deepseek', 'y2025').text, '在线：DeepSeek-V3 · 下一代在练（候选史实名：DeepSeek-R1，需要完成「R1」）');
      pickText();
    });
    withNames('deepseek', [hn('hn_ds_r1', 'DeepSeek-R1', { node: 'ds_r1' })], () => {
      assert.equal(E.startModel('deepseek', 'y2025').text, '在线：DeepSeek-V3 · 下一代在练（候选史实名：DeepSeek-R1，需要完成「ds_r1」）');
      assert.equal(E.workingModel(E.createGame('deepseek', 'y2025', 1)).hint.hn, 'hn_ds_r1');
    });
  });
});

describe('C5 旧命名机制已删除', () => {
  it('源码里没有 versionName、lineageNext、uniqueName、versionOf、lineName、verNext，也没有剥“（训练中）”的正则', () => {
    const files = [];
    const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith('.')) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
    walk(path.join(ROOT, 'src/career'));
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '');
      for (const w of ['versionName', 'lineageNext', 'uniqueName', 'versionOf', 'lineName', 'verNext']) assert.ok(!new RegExp(`\\b${w}\\b`).test(src) || f.endsWith('sim/migrate.js') || f.endsWith('sim/naming.js'), `${path.relative(ROOT, f)} 还有 ${w}`);
      assert.ok(!/replace\([^)]*训练中/.test(src), `${path.relative(ROOT, f)} 还在剥“（训练中）”`);
    }
  });
});

describe('命名只接受当前结构', () => {
  it('历史 v3 夹具明确拒绝，原始 JSON 不改写', () => {
    const dir = new URL('../fixtures/saves/', import.meta.url);
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json') && !x.startsWith('.'))) {
      const raw = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')), before = JSON.stringify(raw);
      const r = E.migrateGame(raw); assert.equal(r.ok, false, f); assert.match(r.reason, /不支持|版本|旧存档/);
      assert.equal(JSON.stringify(raw), before, f);
    }
  });
  it('旧命名字段直接拒绝，不能通过每日推进或读档转换', () => {
    for (const modify of [s => s.verNext = 3, s => s.models[0].minor = 2, s => s.models[0].realName = '旧名字', s => s.models[0].lineage = '旧谱系']) {
      const s = E.createGame('qwen', 'y2025', 1); modify(s); const before = JSON.stringify(s);
      assert.throws(() => ensureNaming(s), /不支持|旧版/); assert.equal(JSON.stringify(s), before);
      const r = E.migrateGame(s); assert.equal(r.ok, false); assert.equal(JSON.stringify(s), before);
    }
  });
});
