// 统一的效果结算（P0.3a，规格 E1）：applyEffects 每个键都有正反用例；超事件选项的 action 只认白名单命令、只能出现在超事件上；
// 数据里所有效果、条件、加成的键都在词表内（词表测试，含 v0.9.3 合并后带 action 的 data/super.js）。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { applyEffects, describeEffects, validateEffects, validateChoice, EFFECT_KEYS, CHOICE_KEYS, SOURCES } from '../../src/career/sim/effects.js';
import { validateCond } from '../../src/career/sim/cond.js';
import { isModKey, MOD_KEYS } from '../../src/career/sim/modifiers.js';
import { addSpirit } from '../../src/career/sim/strategy.js';
import { startResearch } from '../../src/career/sim/research.js';
import { addDays } from '../../src/career/sim/clock.js';
import { applyGains, computeCaps } from '../../src/career/sim/model.js';
import { START_RESOURCES } from '../../src/career/data/core.js';
import { SUPER_EVENTS } from '../../src/career/data/super.js';
import { SUPER_ACTIONS } from '../../src/career/data/balance.js';
import { SPIRITS } from '../../src/career/data/spirits.js';
import { CORE_TREES } from '../../src/career/data/strategy_core.js';
import { STANCE } from '../../src/career/data/routes.js';
import { EXPECT_FX } from '../../src/career/data/expect.js';
import { COMPANY_FILES, GENERIC_FILES } from '../../src/career/data/companies/index.js';
import { FILE_KEYS, TREE_KEYS, NODE_KEYS, SPIRIT_KEYS, NAME_KEYS, EXCLUSIVE_KEYS, GRANT_KEYS, AI_KEYS, BLOCKS, unknownKeys } from '../../src/career/data/companies/_schema.js';
import { resolveAll } from '../helpers/career_bot.mjs';

const CJK = /[一-鿿]/;
// 默认夹具用 kimi（本家文件还是存根，走 _generic_llm）：没有本家特质，E1 的每个键要看的加成、融资限制都只来自效果本身。
// P3.D 起 DeepSeek 的树带“极客文化”（brandGain ×0.9）和“不拿外部融资”（禁止融资），不再适合当无加成的基准。
const game = (id = 'kimi', sc = 'y2025') => { const s = E.createGame(id, sc, 7); resolveAll(s); return s; };
const ev = { source: 'event', id: 'test' };
const run = (s, e, ctx = ev) => applyEffects(s, e, ctx);
const bad = (e, ctx = ev) => assert.throws(() => validateEffects(e, ctx), JSON.stringify(e));

describe('applyEffects：每个键的正反用例', () => {
  it('cash、cashOfStart：加减现金 / 按开局现金的比例；写 0 不动，写错报错', () => {
    const s = game(), c0 = s.cash;
    run(s, { cash: 1e6 });
    assert.equal(s.cash, c0 + 1e6);
    run(s, { cashOfStart: -0.05 });
    assert.equal(s.cash, c0 + 1e6 - 0.05 * START_RESOURCES[s.company.tier][s.scenario].cash);
    const c1 = s.cash;
    run(s, { cash: 0 });
    assert.equal(s.cash, c1);
    bad({ cash: '100' });
    bad({ cashOfStart: 2 });
  });
  it('brand：乘法，结果夹在 0.02–12', () => {
    const s = game();
    s.brand = 2;
    run(s, { brand: 1.1 });
    assert.equal(s.brand, 2 * 1.1);
    s.brand = 11.5;
    run(s, { brand: 1.2 });
    assert.equal(s.brand, 12);
    s.brand = 0.021;
    run(s, { brand: 0.5 });
    assert.equal(s.brand, 0.02);
    bad({ brand: -1 });
  });
  it('rep、morale、health、know：加法，各自夹逼（0–100、−2..2、0–100、≥0）', () => {
    const s = game();
    s.rep = 50; s.morale = 0; s.health = 50; s.know = 100;
    run(s, { rep: 5, morale: 1, health: -10, know: 10 });
    assert.deepEqual([s.rep, s.morale, s.health, s.know], [55, 1, 40, 110]);
    run(s, { rep: 99, morale: 5, health: -200, know: -1e9 });
    assert.deepEqual([s.rep, s.morale, s.health, s.know], [100, 2, 0, 0]);
    run(s, { morale: -9 });
    assert.equal(s.morale, -2);
    bad({ rep: null, morale: 'x' });
  });
  it('team：乘法并取整；valuation：乘法，集团内团队不改估值', () => {
    const s = game();
    s.team = 101;
    run(s, { team: 1.3, valuation: 1.05 });
    assert.equal(s.team, Math.round(101 * 1.3));
    const d = game('qwen', 'y2025'), v0 = d.valuation;
    assert.equal(d.company.kind, 'division');
    run(d, { valuation: 1.5 });
    assert.equal(d.valuation, v0, '集团内团队忽略 valuation');
    bad({ team: 0 });
  });
  it('raise：按当前估值立即融资；集团内团队、被特质禁止融资时跳过', () => {
    const s = game(), v = s.valuation, c = s.cash, eq = s.equity;
    run(s, { raise: 0.15 });
    assert.equal(s.cash, c + v * 0.15 / 0.85);
    assert.equal(s.equity, eq * 0.85);
    const d = game('qwen', 'y2025'), dc = d.cash;
    run(d, { raise: 0.15 });
    assert.equal(d.cash, dc);
    const b = game();
    SPIRITS.t_no_funding = { id: 't_no_funding', title: '测试：不融资', desc: '', mods: {}, blocks: ['funding'] };
    addSpirit(b, 't_no_funding');
    const bc = b.cash;
    assert.match(run(b, { raise: 0.1 }).join(''), /禁止融资/);
    assert.equal(b.cash, bc);
    delete SPIRITS.t_no_funding;
    bad({ raise: 1 });
  });
  it('stockShock：一律累加；self 上市取自家、集团取母公司减半、都不是就忽略', () => {
    const s = game();
    run(s, { stockShock: { NVDA: -0.15 } });
    run(s, { stockShock: { NVDA: -0.05 } });
    assert.ok(Math.abs(s.flags.tickerShock.NVDA + 0.2) < 1e-12);
    const before = s.flags.stockShock;
    run(s, { stockShock: { self: 0.06 } });
    assert.equal(s.flags.stockShock, before, '没上市、也不是集团内团队：忽略');
    s.capital.listed = { shares: 1, price: 1, history: [] };
    run(s, { stockShock: { self: 0.06 } });
    run(s, { stockShock: { self: 0.04 } });
    assert.ok(Math.abs(s.flags.stockShock - 0.1) < 1e-12);
    const d = game('qwen', 'y2025');
    run(d, { stockShock: { self: 0.1 } });
    assert.equal(d.flags.tickerShock[d.company.parent], 0.05);
    bad({ stockShock: { NVDA: 'x' } });
  });
  it('delayResearch：在研项目推迟；没有在研项目时什么都不动', () => {
    const s = game();
    s.research = [];
    const id = E.researchOptions(s).find(x => x.check.ok).t.id;
    startResearch(s, id);
    s.research[0].done = 50;
    run(s, { delayResearch: 14 });
    assert.ok(s.research[0].done < 50);
    const t = game();
    t.research = [];
    assert.deepEqual(run(t, { delayResearch: 14 }), ['在研项目推迟约 14 天']);
    bad({ delayResearch: -1 });
  });
  it('techRead、techBoost：至少按论文级算 / 工作量乘子取最小', () => {
    const s = game();
    run(s, { techRead: ['engram'], techBoost: { engram: 0.5 } });
    assert.equal(s.techRead.engram, s.date);
    assert.equal(s.techBoost.engram, 0.5);
    run(s, { techBoost: { engram: 0.8 } });
    assert.equal(s.techBoost.engram, 0.5, '已经更小的不会被调大');
    bad({ techRead: ['no_such_tech'] });
    bad({ techBoost: { engram: 1.5 } });
  });
  it('data：自有后训练数据加档，不超过 2.5；只认训练方向的数据类别', () => {
    const s = game();
    s.data.post.math = 2.2;
    run(s, { data: { post: { math: 0.5, agent: 0.5 } } });
    assert.equal(s.data.post.math, 2.5);
    assert.equal(s.data.post.agent, (game().data.post.agent || 0) + 0.5);
    bad({ data: { post: { foo: 1 } } });
    bad({ data: { pre: { math: 1 } } });
  });
  it('dims：作用于在练模型，没有就作用于在线模型；经过 applyGains（难度曲线、上限、污染上限，规格 D7），说明按实际加上的写；都没有时不动', () => {
    const s = game();
    const w = E.workingModel(s), m0 = w.dims.math;
    const twin = structuredClone(s);
    const r = applyGains(twin, E.workingModel(twin), { math: 2 });
    assert.deepEqual(run(s, { dims: { math: 2 } }), [`数学推理 +${Math.round(r.applied.math * 10) / 10}`]);
    assert.equal(w.dims.math, E.workingModel(twin).dims.math, '和直接调 applyGains 一样');
    assert.ok(w.dims.math > m0 && w.dims.math < m0 + 2, '离最强近时按难度曲线打折');
    run(s, { dims: { math: 500 } });
    assert.ok(w.dims.math <= computeCaps(s, w).math + 1e-9, '不越过上限');
    const m1 = w.dims.math;
    run(s, { dims: { math: -1 } });
    assert.ok(Math.abs(w.dims.math - (m1 - 1)) < 1e-9, '扣分照常生效');
    s.working = null;
    const live = E.liveModel(s), l0 = live.dims.code;
    run(s, { dims: { code: 1 } });
    assert.ok(live.dims.code > l0 && live.dims.code <= l0 + 1 + 1e-9);
    const empty = E.createGame('jev', 'y2023', 1);
    assert.equal(E.workingModel(empty), null);
    assert.deepEqual(run(empty, { dims: { math: 2 } }), []);
    bad({ dims: { nope: 1 } });
  });
  it('risk：风险乘子累乘；compliance 已删除', () => {
    const s = game();
    run(s, { risk: { abuse: 1.3 } });
    run(s, { risk: { abuse: 2, copyright: 1.5 } });
    const bag = s.risk ?? s.riskMods;
    assert.ok(Math.abs(bag.abuse - 2.6) < 1e-12);
    assert.equal(bag.copyright, 1.5);
    bad({ risk: { compliance: 1.5 } });
  });
  it('world、flag：只认白名单里的键', () => {
    const s = game();
    run(s, { world: { hype: 0.92, priceWar: true }, flag: { noFunding: true } });
    assert.equal(s.world.hype, 0.92);
    assert.equal(s.world.priceWar, true);
    assert.equal(s.flags.noFunding, true);
    bad({ world: { decision: 'open_question' } });
    bad({ flag: { budgetPromise: true } });
  });
  it('spirit：增删公司特质，带 days 的写到期日', () => {
    const s = game();
    run(s, { spirit: { add: [{ id: 't_spirit', days: 30 }, 't_other'] } });
    assert.equal(s.strategy.spirits.t_spirit.until, addDays(s.day, 30));
    assert.equal(s.strategy.spirits.t_other.until, null);
    run(s, { spirit: { remove: ['t_spirit'] } });
    assert.ok(!s.strategy.spirits.t_spirit);
    bad({ spirit: { add: [{ days: 3 }] } });
  });
  it('demand：临时需求乘子写进 s.boosts，带到期日', () => {
    const s = game();
    run(s, { demand: { chat: 1.8, api: 1.5, days: 45 } });
    const b = s.boosts.at(-1);
    assert.deepEqual([b.chatDemand, b.apiDemand], [1.8, 1.5]);
    assert.ok(b.until > s.day);
    bad({ demand: { chat: 1.8 } });
    bad({ demand: { tavern: 2, days: 10 } });
  });
  it('service：只认白名单里的服务设置', () => {
    const s = game();
    run(s, { service: { chatFree: false, apiTier: 'budget', contentPolicy: 'strict' } });
    assert.deepEqual([s.products.chat.free, s.products.api.tier, s.service.contentPolicy], [false, 'budget', 'strict']);
    bad({ service: { routing: 'quant_secret' } });
    bad({ service: { apiTier: 'luxury' } });
  });
  it('case：立即立案；同类官司在打或冷却期内不再立', () => {
    const s = game();
    run(s, { case: { type: 'class', mult: 1.6 } });
    assert.equal(s.legal.cases.filter(c => c.type === 'class').length, 1);
    run(s, { case: { type: 'class' } });
    assert.equal(s.legal.cases.filter(c => c.type === 'class').length, 1);
    bad({ case: { type: 'nope' } });
  });
  it('queue、news：排入经营事件 / 发新闻', () => {
    const s = game();
    run(s, { queue: 'export_ban', news: { title: '测试新闻', detail: '正文' } });
    assert.equal(s.queue.at(-1).id, 'export_ban');
    assert.equal(s.news[0].title, '测试新闻');
    bad({ queue: 'no_such_event' });
    bad({ news: { detail: '没有标题' } });
  });
  it('papers：公开首创技术（并触发 paper 钩子）；没有可公开的就不动', () => {
    const s = game();
    s.firsts = { engram: s.day };
    const notes = run(s, { papers: 'all' });
    assert.ok(s.papers.engram);
    assert.match(notes.join(''), /公开/);
    const k = s.know;
    assert.deepEqual(run(s, { papers: ['engram'] }), [], '已经公开过的不再算');
    assert.equal(s.know, k);
    bad({ papers: 'some' });
  });
  it('if：条件成立走 then，否则走 else', () => {
    const cn = game(), us = game('claude', 'y2025');
    const e = { if: { cond: { country: 'CN' }, then: { rep: 1 }, else: { rep: -1 } } };
    const r1 = cn.rep, r2 = us.rep;
    run(cn, e); run(us, e);
    assert.deepEqual([cn.rep - r1, us.rep - r2], [1, -1]);
    bad({ if: { then: { rep: 1 } } });
    bad({ if: { cond: { nope: 1 }, then: { rep: 1 } } });
  });
  it('beyondTrial：给在练模型挂上 60 天的干净训练考验；没有在练模型时不动', () => {
    const s = game();
    run(s, { beyondTrial: true }, { source: 'strategy', id: 'g_beyond' });
    assert.deepEqual(E.workingModel(s).beyondTrial, { need: 60, clean: 0 });
    s.working = null;
    assert.deepEqual(run(s, { beyondTrial: true }, { source: 'strategy', id: 'g_beyond' }), []);
    bad({ beyondTrial: false });
  });
  it('来源：只认 8 种（含 release）；词表里没有 stance、route、right', () => {
    assert.deepEqual(SOURCES, ['strategy', 'exclusive', 'event', 'milestone', 'super', 'world', 'board', 'release']);
    const s = game();
    run(s, { rep: 1 }, { source: 'release', id: 'm1' });
    assert.throws(() => run(s, { rep: 1 }, { source: 'nope' }));
    for (const k of ['stance', 'route', 'right', 'frontierEdge']) {
      assert.ok(!EFFECT_KEYS.includes(k), k);
      bad({ [k]: 'open' });
      assert.throws(() => run(s, { [k]: 'open' }), k);
    }
  });
  it('旧键 rp 只认超事件（按 0.6 折成技术积累），别的来源报错', () => {
    const s = game(), k = s.know;
    run(s, { rp: 20 }, { source: 'super', id: 'super_sota' });
    assert.equal(s.know, k + 20 * 0.6);
    assert.throws(() => run(s, { rp: 20 }));
    validateEffects({ rp: 20 }, { source: 'super' });
    bad({ rp: 20 });
  });
  it('返回值和 describeEffects 都是中文白话', () => {
    const s = game();
    const notes = run(s, { cash: -3e6, brand: 1.15, rep: 2, demand: { chat: 1.8, days: 45 } });
    assert.ok(notes.length >= 4 && notes.every(n => CJK.test(n)), notes.join(' / '));
    const text = describeEffects({ brand: 1.15, cash: -3e6, cashOfStart: -0.03, morale: 1, techBoost: { reasoning: 0.7 } }, s);
    assert.match(text, /品牌 \+15%/);
    assert.match(text, /现金 −300 万美元/);
    assert.ok(CJK.test(text));
  });
});

describe('超事件选项的 action：白名单命令、只能出现在超事件上', () => {
  it('data/super.js 里带 action 的选项都通过（命令都在 balance.js 的 SUPER_ACTIONS 里）', () => {
    let n = 0;
    for (const e of SUPER_EVENTS) for (const c of e.choices) { validateChoice(c, { source: 'super' }); n += !!c.action; }
    assert.ok(n >= 5, `只有 ${n} 个带 action 的选项`);
    assert.deepEqual(SUPER_ACTIONS, ['rentGpus', 'setTier', 'setInferShare', 'buyGpus']);
  });
  it('白名单外的命令、写法不对、出现在别的来源上、写进 effects 里，都报错', () => {
    assert.throws(() => validateChoice({ id: 'x', action: { cmd: 'sellGpus' } }, { source: 'super' }), /SUPER_ACTIONS/);
    assert.throws(() => validateChoice({ id: 'x', action: { cmd: 'setTier', product: 'api', dir: 2 } }, { source: 'super' }));
    for (const source of SOURCES.filter(x => x !== 'super')) assert.throws(() => validateChoice({ id: 'x', action: { cmd: 'rentGpus' } }, { source }), /只有超事件/, source);
    assert.throws(() => validateEffects({ action: { cmd: 'rentGpus' } }, { source: 'super' }), /action/);
    assert.throws(() => applyEffects(game(), { action: { cmd: 'rentGpus' } }, { source: 'super' }), /action/);
  });
  it('选项字段：distill 是登记过的字段，别的不认识的字段报错', () => {
    assert.ok(CHOICE_KEYS.includes('distill'));
    validateChoice({ id: 'distill', label: '下载权重做蒸馏', distill: true }, { source: 'milestone' });
    assert.throws(() => validateChoice({ id: 'x', label: 'y', weird: 1 }, { source: 'event' }));
  });
});

// ---------- 词表测试 ----------
// 数据里所有效果、条件、加成的键都在词表内。现在大部分数据文件还是存根，这些检查会随内容包落地自动覆盖进来。
function checkNode(n, where) {
  assert.deepEqual(unknownKeys(n, NODE_KEYS), [], where);
  validateCond(n.available, { allowEra: true });
  validateCond(n.bypass);
  validateEffects(n.upfront, { source: 'strategy' });
  validateEffects(n.effects, { source: 'strategy' });
  if (n.grants) assert.deepEqual(unknownKeys(n.grants, GRANT_KEYS), [], `${where}.grants`);
  if (n.ai) { assert.deepEqual(unknownKeys(n.ai, AI_KEYS), [], `${where}.ai`); for (const f of n.ai.factors || []) validateCond(f.if); }
  for (const x of n.spirits?.add || []) assert.ok(typeof x === 'string' || typeof x.id === 'string', where);
}
function checkSpirit(sp, where) {
  assert.deepEqual(unknownKeys(sp, SPIRIT_KEYS), [], where);
  for (const k of Object.keys(sp.mods || {})) assert.ok(isModKey(k), `${where} 的 mods 里有不认识的键：${k}`);
  for (const b of sp.blocks || []) assert.ok(BLOCKS.includes(b), `${where} 的 blocks：${b}`);
  if (sp.info) assert.equal(Object.keys(sp.mods || {}).length, 0, `${where} 是说明特质，不能带 mods`);
}
function checkFile(f, where) {
  assert.deepEqual(unknownKeys(f, FILE_KEYS), [], where);
  assert.deepEqual(unknownKeys(f.tree, TREE_KEYS), [], `${where}.tree`);
  for (const n of f.tree.nodes || []) checkNode(n, `${where}.${n.id}`);
  for (const [id, sp] of Object.entries(f.spirits || {})) checkSpirit(sp, `${where} 特质 ${id}`);
  for (const hn of f.names || []) { assert.deepEqual(unknownKeys(hn, NAME_KEYS), [], `${where} ${hn.id}`); validateCond({ model: hn.model }); validateCond(hn.world); }
  for (const x of f.exclusives || []) {
    assert.deepEqual(unknownKeys(x, EXCLUSIVE_KEYS), [], `${where} ${x.id}`);
    validateCond(x.cond);
    validateEffects(x.effects, { source: 'exclusive' });
    for (const c of x.choices || []) validateChoice(c, { source: 'exclusive' });
  }
}

describe('词表测试：数据里的效果、条件、加成键都登记过', () => {
  it('data/super.js（v0.9.3 合并后，带 action）', () => {
    for (const e of SUPER_EVENTS) for (const c of e.choices) validateChoice(c, { source: 'super' });
  });
  it('主干、通用特质、24 家公司文件和 4 棵通用树、市场期待奖惩表、路线的 mods', () => {
    for (const t of Object.values(CORE_TREES)) for (const n of t.nodes) checkNode(n, `${t.id}.${n.id}`);
    for (const [id, sp] of Object.entries(SPIRITS)) checkSpirit(sp, `特质 ${id}`);
    assert.equal(Object.keys(COMPANY_FILES).length, 24);
    for (const [id, f] of [...Object.entries(COMPANY_FILES), ...Object.entries(GENERIC_FILES)]) if (f) checkFile(f, id);
    for (const byResult of Object.values(EXPECT_FX)) for (const e of Object.values(byResult)) validateEffects(e, { source: 'release' });
    // 路线的 overseas 是路线自己的出海基数（B1，不是加成键），其余必须是加成键。
    for (const [id, st] of Object.entries(STANCE)) for (const k of Object.keys(st.mods || {})) assert.ok(k === 'overseas' || isModKey(k), `${id}.mods.${k}`);
  });
  it('规格里写到的新键都认得：节点 auto、g_sota、g_beyond、路线节点、专属事件和特质的写法', () => {
    // A6、D8 的主干节点（照规格抄的写法，校验它们用到的键都在词表里）。
    const nodes = [
      { id: 'g_sota', title: '炼出 SOTA', desc: '', branch: 'base', pos: [0, 0], days: 14, auto: true, available: { sotaMade: true }, bypass: { sotaMade: true },
        spirits: { add: [{ id: 'g_sota_maker' }], remove: ['g_sota_rookie', 'g_sota_kin'] }, popup: 'none', ai: { base: 0, never: true } },
      { id: 'g_beyond', title: '青出于蓝', desc: '', days: 105, effects: { beyondTrial: true }, ai: { base: 0, never: true } },
      { id: 'g_route_open_family', days: 35, stance: 'open_family', from: ['closed'], available: { any: [{ released: { role: 'small', count: 1 } }, { ms: { ms_open_commercial: 'any' } }] }, repeatable: true, cooldownDays: 120, popup: 'card' },
      { id: 'g_route_close_top', days: 35, stance: 'open_family', from: ['open', 'open_restricted', 'delayed'], available: { any: [{ live: { gap: 3 } }, { runwayMonths: { max: 9 } }] } },
      { id: 'g_reasoning_bet', days: 35, available: { all: [{ any: [{ ms: { ms_reasoning: 'other' } }, { techs: ['grpo'] }] }, { notTechs: ['reasoning'] }] }, upfront: { cashOfStart: -0.03 }, effects: { techBoost: { reasoning: 0.7 } }, spirits: { add: [{ id: 'g_rl_team', days: 120 }] } },
      { id: 'g_agent_bet', days: 35, available: { all: [{ techs: ['func_call'] }, { any: [{ ms: { ms_computer: 'other' } }, { techSeen: { agentic_rl: 'paper' } }] }] }, effects: { techBoost: { agentic_rl: 0.7, computer_use: 0.7 } } },
      { id: 'x_era', days: 70, available: { all: [{ era: '2024-06' }, { firsts: { n: 2, days: 365 } }, { expectHot: true }, { canRaise: true }, { sotaMade: 'first' }] } },
    ];
    for (const n of nodes) checkNode(n, n.id);
    assert.throws(() => checkNode({ id: 'x', frontierEdge: 1 }, 'x'));
    // E3 的加成键：sotaEase 登记了，frontierEdge 没有。
    for (const sp of [{ id: 'g_sota_maker', mods: { sotaEase: 0.6 } }, { id: 'g_safety_first', mods: { legal: 0.8, 'cap.safety': 3 } }, { id: 'g_move_fast', mods: { legal: 1.25, releaseGapDays: -4 } },
      { id: 'g_rl_team', mods: { slots: 1 } }, { id: 'g_agent_team', mods: { 'post.agent': 1.08 } }, { id: 'ds_mit', mods: { brandGain: 1.15, routerDemand: 1.1 } }]) checkSpirit(sp, sp.id);
    assert.ok(MOD_KEYS.includes('sotaEase') && !MOD_KEYS.includes('frontierEdge'));
    // C3 名表的 model / world 条件（ms_open_reasoning_frontier 由 P1.4 新增，用到它的两条等 P1.4 之后由内容包的测试覆盖）。
    const models = [
      { role: 'flagship', open: false, minTotal: 400, sota: true, atLeast: { name: 'GPT-4', d: 2 } },
      { role: 'flagship', open: false, gap: 1, atLeast: { name: 'GPT-4o', d: 2 } },
      { reasoning: true, open: false, dimLead: { math: 0 } },
      { gap: 0.5, codeOverPrev: 5 },
      { role: 'flagship', open: false, techs: ['agentic_rl'], dimLead: { code: 0 }, atLeast: { name: 'Claude Opus 4', d: 1.5 } },
      { arch: ['moe'], techs: ['long_ctx', 'moe'], gap: 1.5 },
      { open: true, license: ['restrictive', 'permissive'], minTotal: 60, atLeast: { name: 'Llama 2 70B', d: 2 } },
      { open: true, arch: ['dense'], minTotal: 400, gap: 6, lead: null },
      { open: true, license: 'permissive', maxTotal: 8, atLeast: { name: 'Mistral 7B', d: 1 } },
      { open: true, license: 'permissive', arch: ['moe'], maxActive: 15, atLeast: { name: 'Mixtral 8x7B', d: 1 } },
      { open: true, arch: ['moe'], minTotal: 600, techs: ['fp8'], gap: 6 },
      { open: true, license: 'permissive', reasoning: true, dims: { math: 85 }, gap: 3 },
      { role: 'small', teacher: 'self', maxTotal: 40, reasoning: true },
      { origin: 'distill', teacher: 'self' },
      { open: true, arch: ['hybrid'], techs: ['linear_attn'], minTotal: 400 },
      { open: true, license: 'permissive', arch: ['moe'], minTotal: 300, gap: 4, rank: 3 },
      { dimLead: { aesthetics: 0 }, atLeast: { name: 'Midjourney V6', d: 1.5 } },
      { dims: { composition: 65, vocals: 60, lyrics: 58 } },
      { badge: 'community' },
    ];
    for (const m of models) validateCond({ model: m });
    for (const w of [{ ms: { ms_gpt4: 'notOther' } }, { none: { rival: { open: true, tag: 'C' } } }, { right: { hn_ds_r1: 'used' } }, { smallLive: { exists: true } }, { service: { chatOn: true, apiTier: ['budget', 'standard'] } }, { released: { open: true, count: 2 } }]) validateCond(w);
    // C4 的专属事件效果。
    for (const e of [{ brand: 1.2, world: { hype: 0.92 }, stockShock: { NVDA: -0.15 }, demand: { chat: 1.8, api: 1.5, days: 45 } }, { papers: ['grpo', 'reasoning'], know: 10, brand: 1.1 },
      { rep: -1, demand: { chat: 0.85, days: 30 } }, { spirit: { add: [{ id: 'ds_banned_abroad', days: 365 }] } }, { brand: 1.05, risk: { distilled: 0.7 } }, { case: { type: 'music', mult: 1.6 } }, { world: { cotHidden: true } }]) validateEffects(e, { source: 'exclusive' });
  });
});
