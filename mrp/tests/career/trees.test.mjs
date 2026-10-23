// 公司策略的树（P2.2，规格 A2、A5、A6、A7、A4.7、D10.4）：树校验器（auto、不能 omit g_sota、必须有 base 分支……）的正反用例；
// 主干和全部公司文件过校验；路线连通性；树的分配（本家为空退回通用树，通用树为空只用主干）；
// 24 家 × 4 剧本开局状态合法、第 0 步等于 D10.4 的表、开局总有一项在进行、种子节点开局时按 canStart 的口径站得住（校验器的播种检查，A4.7）；
// 规格 A7 的 DeepSeek 样板树（P3.D 照抄）过校验，播种结果等于 A7 的表。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import { COMPANIES, SCENARIOS } from '../../src/career/data/core.js';
import { STANCES, START_STANCE } from '../../src/career/data/routes.js';
import { CORE_TREES, CORE_OF, CORE_NODE_IDS } from '../../src/career/data/strategy_core.js';
import { SPIRITS } from '../../src/career/data/spirits.js';
import { COMPANY_FILES, GENERIC_FILES, resolveTree } from '../../src/career/data/companies/index.js';
import { validateCompanyFile, validateCoreTree, validateAllTrees, unreachableNodes, seedErrors } from '../../src/career/data/companies/_schema.js';
import { resolvedTree, nodeOf, histDay, curBlock } from '../../src/career/sim/strategy.js';
import { scoreNode } from '../../src/career/sim/strategy_ai.js';
import { cond } from '../../src/career/sim/cond.js';
import { sotaMade } from '../../src/career/sim/sota.js';
import { playGame } from '../helpers/career_bot.mjs';
import { daysBetween } from '../../src/career/sim/clock.js';
import { SEED_WINDOW } from '../../src/career/data/balance.js';

const SCS = SCENARIOS.map(x => x.id);
const SPEC = fs.readFileSync(new URL('../../docs/spec/v1.0-spec.md', import.meta.url), 'utf8');
// 规格 A7 的 DeepSeek 样板（P3.D 照抄落地的那份），名表和专属事件按 C3、C4 补上最少的字段。
async function a7File() {
  const i = SPEC.indexOf('// src/career/data/companies/deepseek.js');
  const src = SPEC.slice(i, SPEC.indexOf('```', i));
  const f = (await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`)).default;
  const names = [['hn_ds_v2', 'DeepSeek-V2', 'ds_mla', '2024-05-06'], ['hn_ds_v3', 'DeepSeek-V3', 'ds_v3', '2024-12-26'], ['hn_ds_r1', 'DeepSeek-R1', 'ds_r1', '2025-01-20'],
    ['hn_ds_r1_distill', 'DeepSeek-R1-Distill-Qwen-32B', 'ds_distill_family', '2025-01-20'], ['hn_ds_v31', 'DeepSeek-V3.1', 'ds_hybrid', '2025-08-21'],
    ['hn_ds_v4_pro', 'DeepSeek-V4-Pro', 'ds_v4', '2026-04-24'], ['hn_ds_v4_flash', 'DeepSeek-V4-Flash', 'ds_v4', '2026-04-24']];
  f.names = names.map(([id, name, node, real]) => ({ id, name, role: 'flagship', node, real, model: { open: true } }));
  f.exclusives = [['ex_ds_price_war', 'node'], ['ex_ds_v3_cost', 'release'], ['ex_r1_moment', 'release'], ['ex_r1_appstore', 'month'], ['ex_r1_gov_ban', 'month']]
    .map(([id, on]) => ({ id, title: id, on, cond: null }));
  return f;
}
function withFile(company, file, fn) {
  const keep = COMPANY_FILES[company];
  COMPANY_FILES[company] = file;
  try { return fn(); } finally { COMPANY_FILES[company] = keep; }
}
// D10.4 的开局播种表（附录表 8）：★ 炼出过、○ 集团出过、— 没有。
const D104 = {
  gpt: '★★★★', image2: '★★★★', midjourney: '★★★★', suno: '—★★★', elevenlabs: '—★★★', claude: '——★★', fable: '——★★',
  gemini: '—○★★', grok: '———★', seed: '——○○', minimax: '———○',
};
const seedOf = (c, sc) => [...(D104[c] ?? '————')][SCS.indexOf(sc)];
const TIER = { '★': 'g_sota_maker', '○': 'g_sota_kin', '—': 'g_sota_rookie' };

describe('树校验器', () => {
  it('主干、四棵通用树、24 家公司文件（存根）、通用特质全部通过；主干都有 g_sota、六个路线节点、安全优先 / 快速迭代和模态押注', () => {
    assert.deepEqual(validateAllTrees(), []);
    for (const [mod, id] of Object.entries(CORE_OF)) {
      const ids = CORE_TREES[id].nodes.map(n => n.id);
      for (const x of ['g_sota', 'g_route_open_family', 'g_route_delayed', 'g_route_open_restricted', 'g_route_open', 'g_route_close_top', 'g_route_close_all', 'g_safety_first', 'g_move_fast']) assert.ok(ids.includes(x), `${id} 少了 ${x}`);
      assert.ok(ids.includes({ llm: 'g_reasoning_bet', image: 'gi_ar_bet', music: 'gm_licensed_bet', speech: 'gv_s2s_bet' }[mod]), id);
      assert.equal(ids.includes('g_beyond'), mod === 'llm', `${id}：g_beyond 只在 core_llm`);
    }
    const g = CORE_TREES.core_llm.nodes.find(n => n.id === 'g_sota');
    assert.deepEqual([g.auto, g.ai.never, g.popup, g.branch, g.pos[1], g.days], [true, true, 'none', 'base', 0, 14]);
    assert.deepEqual(g.spirits, { add: [{ id: 'g_sota_maker' }], remove: ['g_sota_rookie', 'g_sota_kin'] });
    for (const n of CORE_TREES.core_llm.nodes.filter(x => x.stance)) assert.deepEqual([n.repeatable, n.cooldownDays, n.popup, n.days], [true, 120, 'card', 35], n.id);
  });
  it('三档 SOTA 特质和两个 sotaEase 特质的数值（ρ = 1 + sotaEase：1.6、0.7、0.45；青出于蓝 +0.2、坚持从零训练 +0.1）；国家说明特质不带数值', () => {
    assert.deepEqual([SPIRITS.g_sota_maker.mods, SPIRITS.g_sota_kin.mods, SPIRITS.g_sota_rookie.mods], [{ sotaEase: 0.6 }, { sotaEase: -0.3 }, { sotaEase: -0.55 }]);
    assert.equal(SPIRITS.g_self_reliant.mods.sotaEase, 0.2);
    assert.equal(SPIRITS.gs_self_built.mods.sotaEase, 0.1);
    for (const id of ['cn_compute_limited', 'cn_filing', 'cn_light_liability', 'us_litigation']) assert.deepEqual([SPIRITS[id].info, SPIRITS[id].mods], [true, undefined], id);
  });
  it('反例：omit g_sota、没有 base 分支、auto 少了 bypass、互斥不对称、天数不合法、改路线不弹卡、公司节点能重复、走不到的节点、特质没定义、模态接错主干', () => {
    const node = x => ({ id: 'jv_a', title: '甲', desc: '一句话。', branch: 'biz', pos: [0, 1], days: 14, prereq: [], popup: 'none', ai: { base: 1 }, ...x });
    const file = (nodes, tree = {}) => ({ company: 'jev', tree: { id: 'jev', extends: 'core_llm', omit: [], branches: { base: '根基', biz: '生意' }, nodes, ...tree }, spirits: {}, startSpirits: [], names: [], exclusives: [] });
    const has = (f, re, company = 'jev') => { const errs = validateCompanyFile(f, company); assert.ok(errs.some(e => re.test(e)), `应该报 ${re}：${errs.join(' / ') || '（没有错）'}`); };
    assert.deepEqual(validateCompanyFile(file([node()]), 'jev'), []);
    has(file([node()], { omit: ['g_sota'] }), /不能 omit 掉 g_sota|不能少了 g_sota/);
    // base 分支看展开以后的树（公司树从主干继承 base）；主干自己没有 base 分支就报错。
    assert.ok(validateCoreTree({ ...CORE_TREES.core_llm, branches: { route: '路线', core: '通用' } }).some(e => /base 分支/.test(e)));
    has(file([node({ auto: true, ai: { base: 0, never: true } })]), /auto 节点要有 bypass/);
    has(file([node({ auto: true, bypass: { know: 1 }, ai: { base: 0 } })]), /auto 节点/);
    has(file([node({ excludes: ['jv_b'] }), node({ id: 'jv_b' })]), /两边都写/);
    has(file([node({ days: 30 })]), /天数只能是/);
    has(file([node({ stance: 'open', license: 'permissive' })]), /popup 要写 card/);
    has(file([node({ stance: 'open', repeatable: true, cooldownDays: 120, popup: 'card' })]), /只有主干的路线节点能重复/);
    has(file([node({ prereq: [['jv_b']] }), node({ id: 'jv_b', prereq: [['jv_a']] })]), /走不到的节点/);
    has(file([node({ spirits: { add: [{ id: 'jv_nope' }] } })]), /特质 jv_nope 没有定义/);
    has(file([node({ id: 'g_mine' })]), /不能用 g_ gs_ gi_ gm_ gv_ 前缀/);
    has(file([node({ desc: '2025 年开源。' })]), /不写年份/);
    has(file([node({ hist: { date: '2024-03', text: '史实。' }, fiction: true })]), /架空节点不写史实/);
    has(file([node({ available: { era: '2024年' } })]), /era/);
    has(file([node({ bypass: { era: '2024-01' } })]), /era 只能写在策略节点的 available/);
    has(file([node()], { extends: 'core_image' }), /要接 core_llm/);
    has(file([node({ grants: { names: ['hn_jv'] }, popup: 'card' })]), /名字 hn_jv 不在名表里/);
    // 直接加单科分有上限（A2）：每科 ≤ 3，合计 ≤ 6。模型变强靠训练，策略不直接发分。
    assert.deepEqual(validateCompanyFile(file([node({ effects: { dims: { code: 3, agent: 3 } } })]), 'jev'), []);
    has(file([node({ effects: { dims: { code: 40 } } })]), /直接加分每科不超过 3/);
    has(file([node({ effects: { dims: { code: 3, agent: 3, writing: 2 } } })]), /直接加分合计不超过 6/);
    // 存根（null）不报错。
    assert.deepEqual(validateCompanyFile(null, 'jev'), []);
    assert.deepEqual(unreachableNodes([{ id: 'a', prereq: [] }, { id: 'b', prereq: [['a', 'c']] }, { id: 'c', prereq: [['d']] }]), ['c']);
  });
  it('播种检查（A4.7，“校验器通过”包含它）：开局播种出来的进行中策略要按 canStart 的口径站得住，路线不在 from 里、available 不成立、startOverride 的 cur 站不住都报错；通用树装到这个模态的每一家身上查', () => {
    // jev 四个剧本开局都是闭源；史实日 2024-02 离 y2024 开局不到 SEED_WINDOW 天，开 y2024 时它就是种子节点（y2025、y2026 开局前已完成，y2023 还没到窗口）。
    const node = x => ({ id: 'jv_seed', title: '种子', desc: '一句话。', branch: 'biz', pos: [0, 1], days: 35, prereq: [], popup: 'none', ai: { base: 1 }, hist: { date: '2024-02', text: '史实。' }, ...x });
    const file = (nodes, extra = {}) => ({ company: 'jev', tree: { id: 'jev', extends: 'core_llm', omit: [], branches: { base: '根基', biz: '生意' }, nodes }, spirits: {}, startSpirits: [], names: [], exclusives: [], ...extra });
    const route = x => node({ stance: 'open', license: 'permissive', popup: 'card', ...x });
    assert.deepEqual(validateCompanyFile(file([route({ from: ['closed'] })]), 'jev'), [], '开局路线在 from 里：通过');
    const bad = validateCompanyFile(file([route({ from: ['open_restricted'] })]), 'jev');
    assert.equal(bad.length, 1, bad.join(' / '));
    assert.match(bad[0], /^jev y2024 开局：播种出来的进行中策略 jv_seed 第一天就推进不了（现在的路线（闭源）不能走这一步）$/);
    const cash = validateCompanyFile(file([node({ available: { cash: 1e15 } })]), 'jev');
    assert.equal(cash.length, 1, cash.join(' / '));
    assert.match(cash[0], /jev y2024 开局.*jv_seed.*条件不成立：现金不少于/);
    // 开局就永远做不成（不许出现的技术开局时已经学会）也报，用的是作废提示的说法。
    const t0 = E.createGame('jev', 'y2024', 1).techs[0];
    assert.match(validateCompanyFile(file([node({ available: { notTechs: [t0] } })]), 'jev').join(' / '), /jv_seed.*做不成了：已经掌握了「.+」，这一项用不上了/);
    // startOverride 指定的 cur 也查（不看史实日）。
    const ov = validateCompanyFile(file([node({ hist: undefined, fiction: true, available: { cash: 1e15 } })], { startOverride: { y2023: { cur: 'jv_seed' } } }), 'jev');
    assert.deepEqual(ov.map(e => e.slice(0, 13)), ['jev y2023 开局：'], ov.join(' / '));
    // 写法有错时只报写法，不开局。
    assert.ok(validateCompanyFile(file([route({ from: ['open_restricted'], days: 30 })]), 'jev').every(e => !/开局/.test(e)));
    // 通用树：装到这个模态的每一家身上（各家本家文件临时当存根），查完原样还回去。
    const keep = { ...COMPANY_FILES }, keepG = { ...GENERIC_FILES };
    const g = { company: null, tree: { id: '_generic_llm', extends: 'core_llm', omit: [], branches: { base: '根基', biz: '生意' }, nodes: [node({ id: 'gs_seed', available: { cash: 1e15 } })] }, spirits: {}, startSpirits: [], names: [], exclusives: [] };
    const errs = validateCompanyFile(g, null, { generic: true });
    const llm = COMPANIES.filter(c => c.modality === 'llm');
    assert.equal(errs.length, llm.length, errs.join(' / '));
    for (const c of llm) assert.ok(errs.some(e => e.startsWith(`_generic_llm（${c.id}） y2024 开局：`) && /gs_seed/.test(e)), c.id);
    assert.deepEqual([{ ...COMPANY_FILES }, { ...GENERIC_FILES }], [keep, keepG]);
    assert.deepEqual(seedErrors(GENERIC_FILES.llm, null, { generic: true }), []);
  });
  it('规格 A7 的 DeepSeek 样板树（P3.D 照抄）过校验；展开以后是本家 20 个节点 + 主干（omit 掉 g_reasoning_bet）', async () => {
    const f = await a7File();
    assert.deepEqual(validateCompanyFile(f, 'deepseek'), []);
    const t = resolveTree(f.tree);
    assert.equal(f.tree.nodes.length, 20);
    assert.ok(!t.byId.has('g_reasoning_bet') && t.byId.has('g_sota') && t.byId.has('g_beyond') && t.byId.has('ds_r1'));
    assert.equal(t.core, 'core_llm');
  });
});

describe('路线节点与树的分配', () => {
  it('连通性：从五档里任意一档出发，都能经由主干的路线节点走到其余四档（四棵主干一样）', () => {
    for (const t of Object.values(CORE_TREES)) {
      const edges = t.nodes.filter(n => n.stance).flatMap(n => n.from.map(f => [f, n.stance]));
      for (const from of STANCES) {
        const seen = new Set([from]);
        for (let changed = true; changed;) { changed = false; for (const [a, b] of edges) if (seen.has(a) && !seen.has(b)) { seen.add(b); changed = true; } }
        assert.deepEqual([...seen].sort(), [...STANCES].sort(), `${t.id} 从 ${from} 出发`);
      }
    }
  });
  it('树的分配（A5）：本家文件为空用模态的通用树（通用树接上主干）；有本家文件的用自己的树；主干的路线节点顾问和机器人都不选', () => {
    for (const c of COMPANIES) {
      const own = COMPANY_FILES[c.id];
      const s = E.createGame(c.id, 'y2024', 1);
      assert.equal(s.strategy.tree, own ? own.tree.id : `_generic_${c.modality}`, c.id);
      const want = own
        ? resolveTree(own.tree).nodes.map(n => n.id)
        : [...CORE_TREES[CORE_OF[c.modality]].nodes, ...GENERIC_FILES[c.modality].tree.nodes].map(n => n.id);
      assert.deepEqual(resolvedTree(s).nodes.map(n => n.id), want, c.id);
      // 主干的通用路线节点永远不选；本家史实路线节点只在 historic 模式、离史实日 60 天内可选（A10，P3.T 起有本家路线节点）。
      for (const n of resolvedTree(s).nodes.filter(x => x.stance)) {
        assert.equal(scoreNode(s, n, 'adaptive'), 0, `${c.id} ${n.id} adaptive`);
        const hd = histDay(n), near = hd ? Math.abs(daysBetween(s.day, hd)) <= 60 : false;
        if (CORE_NODE_IDS.has(n.id) || !near) assert.equal(scoreNode(s, n, 'historic'), 0, `${c.id} ${n.id} historic`);
        else assert.ok(scoreNode(s, n, 'historic') > 0, `${c.id} ${n.id} historic 靠近史实日时应该可选`);
      }
    }
    // 通用树也是 null 时只用主干。suno 现在有本家史实树（P3.T），连同本家文件一起临时摘掉。
    const keep = GENERIC_FILES.music, keepOwn = COMPANY_FILES.suno;
    GENERIC_FILES.music = null;
    COMPANY_FILES.suno = null;
    try {
      const s = E.createGame('suno', 'y2024', 1);
      assert.equal(s.strategy.tree, 'core_music');
      assert.ok(s.strategy.cur, '照样有一项在进行');
    } finally { GENERIC_FILES.music = keep; COMPANY_FILES.suno = keepOwn; }
  });
});

describe('开局（A4.7 播种、D10.4 第 0 步）', () => {
  it('24 家 × 4 剧本：开局状态合法；第 0 步等于 D10.4 的表（★ 以 start 完成 g_sota 加“炼出过”，○ 集团出过，— 技术储备不足，恰好一档）；开局总有一项在进行，而且现在就能推进', () => {
    let n = 0;
    for (const c of COMPANIES) for (const sc of SCS) {
      const s = E.createGame(c.id, sc, 1);
      const S = s.strategy, at = `${c.id} ${sc}`;
      assert.deepEqual(Object.keys(S).sort(), ['cur', 'done', 'ex', 'exPending', 'idleSince', 'log', 'rights', 'shelved', 'spirits', 'tree', 'unlocks'].sort(), at);
      const seed = seedOf(c.id, sc);
      assert.equal(s.sota.seed, seed, `${at} 播种档`);
      const tiers = Object.values(TIER).filter(id => S.spirits[id]);
      assert.deepEqual(tiers, [TIER[seed]], at);
      assert.equal(S.done.g_sota?.how ?? null, seed === '★' ? 'start' : null, at);
      // 国家说明特质。
      const want = c.country === 'CN' ? ['cn_compute_limited', ...(c.modality === 'llm' ? ['cn_filing'] : []), 'cn_light_liability'] : c.country === 'US' ? ['us_litigation'] : [];
      assert.deepEqual(Object.keys(S.spirits).filter(id => SPIRITS[id]?.info), want, at);
      // 开局路线等于 B6 的表（路线不经过播种）。
      assert.equal(s.route.stance, START_STANCE[c.id][sc].stance, at);
      assert.ok(S.cur && S.idleSince === null, `${at} 开局没有进行中的策略`);
      const node = nodeOf(s, S.cur.id);
      assert.ok(node && !node.auto && cond(s, node.available), `${at}：${S.cur.id} 开局就能推进（种子节点开局时 available 成立）`);
      assert.equal(curBlock(s), '', `${at}：${S.cur.id} 按 canStart 的口径站得住（路线在 from 里，校验器的播种检查同一口径）`);
      assert.ok(S.cur.days >= 0 && S.cur.days <= S.cur.need, at);
      n++;
    }
    assert.equal(n, 96);
  });
  it('“现在没有可做的节点”时，开局 cur 为空并记下空闲（例如主干节点都被排除）', () => {
    const tree = { id: 'jev', extends: 'core_llm', omit: ['g_safety_first', 'g_move_fast', 'g_reasoning_bet', 'g_agent_bet', 'g_beyond'], branches: { base: '根基' }, nodes: [] };
    const s = withFile('jev', { company: 'jev', tree, spirits: {}, startSpirits: [], names: [], exclusives: [] }, () => E.createGame('jev', 'y2023', 1));
    assert.deepEqual([s.strategy.cur, s.strategy.idleSince], [null, s.day]);
  });
  it('规格 A7 的播种表（DeepSeek 样板）：预完成、进行中的节点和进度逐项相等；过期的特质不加；路线仍按 B6 的表；种子节点开局时 available 成立', async () => {
    const f = await a7File();
    const want = {
      y2023: { done: [], cur: ['ds_found', 0] },
      y2024: { done: ['ds_found', 'ds_coder'], cur: ['ds_moe', 60] },
      y2025: { done: ['ds_found', 'ds_coder', 'ds_moe', 'ds_grpo', 'ds_mla', 'ds_price_butcher', 'ds_self_funded', 'ds_r1_lite', 'ds_v3'], cur: ['ds_r1', 16] },
      y2026: { done: ['ds_found', 'ds_coder', 'ds_moe', 'ds_grpo', 'ds_mla', 'ds_price_butcher', 'ds_self_funded', 'ds_r1_lite', 'ds_v3', 'ds_r1', 'ds_distill_family', 'ds_busy_research', 'ds_open_week', 'ds_hybrid', 'ds_cn_chips'], cur: ['ds_v4', 0] },
    };
    withFile('deepseek', f, () => {
      for (const sc of SCS) {
        const s = E.createGame('deepseek', sc, 1);
        const S = s.strategy;
        assert.equal(S.tree, 'deepseek');
        const done = Object.keys(S.done).filter(id => id.startsWith('ds_'));
        assert.deepEqual(done.sort(), [...want[sc].done].sort(), `${sc} 预完成`);
        assert.ok(done.every(id => S.done[id].how === 'start' && S.done[id].day === histDay(nodeOf(s, id))), sc);
        assert.deepEqual([S.cur.id, S.cur.days], want[sc].cur, `${sc} 进行中`);
        const node = nodeOf(s, S.cur.id);
        // 种子节点（离史实日不到 SEED_WINDOW 天的）开局时 available 成立；不是种子的由 pickStrategy 选出，本来就能开始。
        const seeded = histDay(node) >= s.day && daysBetween(s.day, histDay(node)) < SEED_WINDOW;
        assert.equal(seeded, sc === 'y2024' || sc === 'y2025', sc);
        assert.ok(cond(s, node.available), `${sc}：${node.id} 开局时 available 要成立`);
        assert.equal(s.route.stance, START_STANCE.deepseek[sc].stance, `${sc} 路线`);
      }
      const y25 = E.createGame('deepseek', 'y2025', 1);
      for (const x of ['ds_enterprise', 'ds_vc']) assert.equal(E.nodeStatus(y25, x).state, 'excluded', x);
      assert.ok(y25.world.priceWar, '开局前完成的价格屠夫写了世界标记');
      assert.ok(!y25.strategy.rights.hn_ds_v3, '开局前完成的节点不授名（开局继承的型号保留真实名）');
      const y26 = E.createGame('deepseek', 'y2026', 1);
      assert.ok(y26.strategy.spirits.ds_mit && !y26.strategy.spirits.ds_distill_push, 'ds_distill_push（120 天）开局前就过期了，不加');
      // 预完成的路线节点按顺序施加，结果等于 B6 的表：ds_r1 → open。
      const routeNodes = Object.entries(y26.strategy.done).filter(([id]) => nodeOf(y26, id)?.stance).sort((a, b) => (a[1].day < b[1].day ? -1 : 1));
      assert.equal(routeNodes.at(-1)?.[0], 'ds_r1');
      assert.equal(nodeOf(y26, routeNodes.at(-1)[0]).stance, START_STANCE.deepseek.y2026.stance);
    });
  });
  it('开局可重复：同一公司同一剧本开两次，策略状态一字不差（没有随机数）；换种子也一样（策略不读随机数）', () => {
    for (const [c, sc] of [['deepseek', 'y2025'], ['gpt', 'y2023'], ['suno', 'y2024'], ['minimax', 'y2026']]) {
      const a = E.createGame(c, sc, 1), b = E.createGame(c, sc, 1), d = E.createGame(c, sc, 99);
      assert.deepEqual(a.strategy, b.strategy);
      assert.deepEqual(a.strategy, d.strategy);
    }
  });
});

describe('机器人（A10），y2025、y2026（y2023、y2024 在 strategy.test.mjs，分两个文件并行跑）', () => {
  it('24 家 × 2 剧本：操作不失败；不选 ai.never 节点；炼出过 SOTA 以后从不蒸馏；只用许可宽松的开源老师；局末 g_sota 完成当且仅当炼出过', () => {
    let makers = 0;
    for (const c of COMPANIES) for (const sc of ['y2025', 'y2026']) {
      let madeAt = null;
      const { s, errors } = playGame(c.id, sc, 1, { onWeek: x => { if (!madeAt && sotaMade(x)) madeAt = x.day; } });
      const at = `${c.id} ${sc}`;
      assert.deepEqual(errors, [], at);
      for (const [id, d] of Object.entries(s.strategy.done)) if (d.how === 'done') assert.ok(!nodeOf(s, id).ai?.never && !nodeOf(s, id).auto, `${at}：${id}`);
      assert.ok(!s.strategy.log.some(x => x.id === 'g_beyond'), `${at}：选了 g_beyond`);
      assert.equal(!!s.strategy.done.g_sota, sotaMade(s), at);
      const teachers = Object.entries(s.data.teachers || {}).filter(([f]) => !E.isMine(s, f));
      if (madeAt) {
        makers++;
        for (const [f, t] of teachers) assert.ok(t.day < madeAt, `${at}：炼出过（${madeAt}）以后还蒸馏了 ${f}（${t.day}）`);
        if (s.sota.before) assert.equal(teachers.length, 0, `${at}：开局就炼出过，从不蒸馏`);
      }
      for (const t of teachers) assert.equal(t[1].license, 'LP', `${at}：只用许可宽松的开源老师`);
    }
    assert.ok(makers >= 17, `${makers}`);
  });
});
