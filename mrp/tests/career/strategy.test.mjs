// 公司策略引擎（P2.2，规格 A3、A4、A6、A10、C4 的引擎部分、D6.2 的 ρ、D10.5、E8）：
// 同一时间只有一项；搁置 30 天；暂停和永久失效；AND/OR 前置、互斥、绕过（只发特质）；auto 节点不能手动开始；完成的顺序（效果、特质、路线、授名、解锁、专属事件、卡片）；
// 路线冷却；授名作废；专属事件（node、release、month、notice）；拿到第一枚算数标签的次日 g_sota 以绕过完成；局内 rookie → kin 次日换；
// ρ 改由特质提供、数值和回退口径相同（D9 6.8 后半句）；读档特性步骤和开发期存档兜底（E8，含“SOTA 与策略”第 2 小条）；
// 顾问和机器人：建议都可执行、机器人不选 ai.never 节点、炼出过 SOTA 的机器人从不蒸馏、resolveAll 的蒸馏规则、shouldHold 正反用例、永远不勾“顶替在线旗舰”；
// 没有随机数、结果可复现；限时加成和特质到期；
// 作废提示的说法（押注期间学会了押注的技术）、g_sota 条件行只在 sotaWouldTake 为真时写“发布就能拿到”、全面闭源的说明和 B2 一致、strategy_sim --days 的结局行（G2 遗留 B）。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as E from '../../src/career/engine.js';
import { COMPANIES, SCENARIOS } from '../../src/career/data/core.js';
import { COMPANY_FILES } from '../../src/career/data/companies/index.js';
import { CORE_TREES } from '../../src/career/data/strategy_core.js';
import { ROUTE_COOLDOWN, SHELF_DAYS, BOT, IDLE_ADVICE_EVERY, SOTA, SOTA_EASE, CURVE } from '../../src/career/data/balance.js';
import {
  nodeOf, completeNode, snoozeStrategyAdvice, hasSpirit, addSpirit, ensureStrategy, resolvedTree, canStart, spiritDef,
} from '../../src/career/sim/strategy.js';
import { pickStrategy, scoreNode, wantsDistill, distillTeacher, shouldHold } from '../../src/career/sim/strategy_ai.js';
import { afterRelease, exclusiveMonth } from '../../src/career/sim/exclusive.js';
import { rhoOf, workingModel, liveModel } from '../../src/career/sim/model.js';
import { sotaMade, qOf, worldSota, sotaWouldTake } from '../../src/career/sim/sota.js';
import { modifier } from '../../src/career/sim/modifiers.js';
import { applyEffects } from '../../src/career/sim/effects.js';
import { addDays, daysBetween } from '../../src/career/sim/clock.js';
import { advance, resolveAll, playGame, playAdvised } from '../helpers/career_bot.mjs';
import { clone } from '../helpers/career_util.mjs';
import * as L from '../helpers/legacy_jobs.mjs';

const SCS = SCENARIOS.map(x => x.id);
const fresh = (c, sc, seed = 1) => { const s = E.createGame(c, sc, seed); resolveAll(s); return s; };
// 独立数值基准：身份三档 + 非身份特质；不调用已经删除的缺策略旧档回退路径。
const TIER_SPIRITS = ['g_sota_maker', 'g_sota_kin', 'g_sota_rookie'];
function expectedRho(s) {
  const extra = Object.keys(s.strategy.spirits).filter(id => !TIER_SPIRITS.includes(id))
    .reduce((a, id) => a + (spiritDef(s, id)?.mods?.sotaEase || 0), 0);
  const tier = sotaMade(s) ? SOTA_EASE.maker : s.sota.seed === '○' || s.sota.kin ? SOTA_EASE.kin : SOTA_EASE.rookie;
  return Math.max(CURVE.RHO_MIN, Math.min(CURVE.RHO_MAX, 1 + tier + extra));
}
// 测试用的公司文件（装到 jev 身上，测完还原成存根）。节点默认 ai.base 0：顾问和机器人不会自己挑它们。
const NODE = (id, x = {}) => ({ id, title: `节点${id.slice(3)}`, desc: '测试用的节点。', branch: 'biz', pos: [0, 0], days: 14, prereq: [], popup: 'none', ai: { base: 0 }, ...x });
function jevFile(nodes, extra = {}) {
  return {
    company: 'jev', tree: { id: 'jev', extends: 'core_llm', omit: [], branches: { base: '根基与资金', biz: '生意' }, nodes },
    spirits: { jv_sp: { title: '测试特质', desc: '训练快一点。', mods: { train: 1.1 } }, jv_short: { title: '短期特质', desc: '一阵子。', mods: { apiDemand: 1.2 } } },
    startSpirits: [], names: [], exclusives: [], ...extra,
  };
}
function withFile(file, fn, company = 'jev') {
  const keep = COMPANY_FILES[company];
  COMPANY_FILES[company] = file;
  try { return fn(); } finally { COMPANY_FILES[company] = keep; }
}
// 推进一天，途中的卡片都处理掉；返回这一天入队过的卡片种类。
function day(s) {
  resolveAll(s);
  E.tickDay(s);
  const kinds = s.queue.map(q => q.kind);
  resolveAll(s);
  return kinds;
}

// 机器人整局（A10）：操作不失败；做完（how 'done'）的节点里没有 ai.never、auto 的（g_beyond 从没开始过，g_sota 只会 start 或 bypass）；
// 炼出过 SOTA 以后从不蒸馏（开局就炼出过的一次都不蒸馏）；只用许可宽松的开源老师；局末 g_sota 完成当且仅当炼出过。trees.test.mjs 里有同一份。
function botAudit(scenarios) {
  let makers = 0, distilled = 0;
  for (const c of COMPANIES) for (const sc of scenarios) {
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
    if (teachers.length) distilled++;
    for (const t of teachers) assert.equal(t[1].license, 'LP', `${at}：只用许可宽松的开源老师`);
  }
  return { makers, distilled };
}

describe('单槽、搁置、前置、互斥、绕过（A1、A4 规则 1、2）', () => {
  it('同一时间只有一项：开始新的一项，原来那项搁置；搁置 30 天内换回来接着做、不再扣 upfront；过了 30 天进度作废，重新扣', () => {
    withFile(jevFile([NODE('jv_a', { days: 35, upfront: { cash: -1000 } }), NODE('jv_b', { days: 35 })]), () => {
      const s = fresh('jev', 'y2024');
      const first = s.strategy.cur.id;
      assert.ok(first && !first.startsWith('jv_'), '开局顾问挑的是主干节点');
      let cash = s.cash;
      E.startStrategy(s, 'jv_a');
      assert.equal(s.cash, cash - 1000, '开始时扣 upfront');
      assert.deepEqual([s.strategy.cur.id, Object.keys(s.strategy.shelved)], ['jv_a', [first]]);
      advance(s, 10);
      assert.equal(s.strategy.cur.days, 10);
      E.startStrategy(s, 'jv_b');
      assert.deepEqual(s.strategy.shelved.jv_a, { days: 10, until: addDays(s.day, SHELF_DAYS) });
      assert.equal(E.nodeStatus(s, 'jv_a').shelvedDays, SHELF_DAYS);
      advance(s, 20);
      cash = s.cash;
      E.startStrategy(s, 'jv_a');
      assert.deepEqual([s.strategy.cur.id, s.strategy.cur.days, s.cash], ['jv_a', 10, cash], '30 天内换回来接着做，不再扣钱');
      assert.equal(s.strategy.shelved.jv_b.days, 20);
      // 同一时间只有一项：进行中的只有 cur 一个，搁置的不推进。
      advance(s, 5);
      assert.deepEqual([s.strategy.cur.days, s.strategy.shelved.jv_b.days], [15, 20]);
      E.startStrategy(s, 'jv_b');
      advance(s, SHELF_DAYS + 1);
      assert.equal(s.strategy.done.jv_b?.how, 'done', 'jv_b 做完了');
      assert.ok(!(s.strategy.shelved.jv_a?.until >= s.day), '搁置满 30 天作废');
      assert.equal(E.nodeStatus(s, 'jv_a').days, 0);
      cash = s.cash;
      E.startStrategy(s, 'jv_a');
      assert.deepEqual([s.strategy.cur.days, s.cash], [0, cash - 1000], '作废以后从 0 开始，重新扣 upfront');
      assert.throws(() => E.startStrategy(s, 'jv_a'), /正在做/);
      assert.throws(() => E.startStrategy(s, 'jv_b'), /已经完成/);
      // 放下当前这一项：进搁置，记空闲。
      const sh = E.cancelStrategy(s);
      assert.deepEqual([sh.days, s.strategy.cur, s.strategy.idleSince], [0, null, s.day]);
      advance(s, 1);
      assert.equal(s.strategy.cur, null, '空闲时引擎不会自己挑');
    });
  });
  it('AND 套 OR 的前置；互斥一方完成，另一方永久排除；绕过：前置满足、条件成立就自动完成，只发特质（不给效果、授名、事件，也不改路线）', () => {
    const nodes = [
      NODE('jv_p1'), NODE('jv_p2'), NODE('jv_p3'),
      NODE('jv_and', { prereq: [['jv_p1'], ['jv_p2', 'jv_p3']] }),
      NODE('jv_x', { excludes: ['jv_y'] }), NODE('jv_y', { excludes: ['jv_x'] }),
      NODE('jv_bp', { prereq: [['jv_p1']], bypass: { know: 1 }, effects: { know: 100 }, spirits: { add: [{ id: 'jv_sp' }] }, stance: 'open', license: 'permissive', popup: 'card', grants: { unlock: ['adopt_open_base'] } }),
    ];
    withFile(jevFile(nodes), () => {
      const s = fresh('jev', 'y2024');
      const st = id => E.nodeStatus(s, id).state;
      assert.equal(st('jv_and'), 'locked');
      completeNode(s, 'jv_p1', 'done');
      assert.equal(st('jv_and'), 'locked', '只满足第一组');
      assert.equal(E.nodeStatus(s, 'jv_and').why.filter(l => !l.ok).length, 1);
      completeNode(s, 'jv_p3', 'done');
      assert.equal(st('jv_and'), 'available', '第二组满足其一就行');
      E.startStrategy(s, 'jv_x');
      advance(s, 14);
      assert.deepEqual([st('jv_x'), st('jv_y')], ['done', 'excluded']);
      assert.throws(() => E.startStrategy(s, 'jv_y'), /互斥/);
      // 绕过：jv_p1 完成后第一次推进时自动完成。
      const know = s.know, route = s.route.stance;
      assert.equal(s.strategy.done.jv_bp?.how, 'bypass');
      assert.equal(st('jv_bp'), 'bypassed');
      assert.ok(hasSpirit(s, 'jv_sp'), '只发特质');
      assert.ok(s.know < know + 100 && s.route.stance === route && s.route.stance !== 'open' && !s.strategy.unlocks.adopt_open_base, '不给效果、不改路线、不解锁');
    });
  });
  it('auto 节点（g_sota）不能手动开始、不占策略槽；没完成时条件清单写“发布一款拿到 SOTA 标签的模型（当前：离最强还差 x）”', () => {
    const s = fresh('kimi', 'y2025');
    assert.throws(() => E.startStrategy(s, 'g_sota'), /自动完成/);
    const st = E.nodeStatus(s, 'g_sota');
    assert.equal(st.state, 'locked');
    assert.match(st.why.at(-1).text, /发布一款拿到 SOTA 标签的模型/);
    assert.match(st.why.at(-1).now, /离最强还差 \d/);
    assert.ok(!E.strategyOptions(s).some(o => o.state === 'available' && nodeOf(s, o.id).auto));
    assert.equal(pickStrategy(s, 'historic') === 'g_sota' || pickStrategy(s) === 'g_sota', false);
  });
  it('g_sota 的条件行只在 sotaWouldTake 为真时写“发布就能拿到”：领先不到 SOTA.EPS 写“和最强持平”，领先够了才写；这个模态发过模型的公司不够时写挂不上标签', () => {
    // kimi y2025：标签在 OpenAI 的 o1 手里（别家持有，要高出 EPS 才换手）。把在线旗舰改成比世界最强高一点点或高一截，在练的压到最低。
    const s = fresh('kimi', 'y2025');
    const w = worldSota(s), live = liveModel(s), work = workingModel(s);
    assert.ok(s.sota.holder && s.sota.holder.by !== 'me');
    const line = bump => {
      live.dims = { ...w.dims, knowledge: w.dims.knowledge + bump };
      if (work) work.dims = { ...live.dims, knowledge: 0 };
      return { now: E.nodeStatus(s, 'g_sota').why.at(-1).now, take: sotaWouldTake(s, qOf(s.mod, live.dims)), x: qOf(s.mod, live.dims) - w.q };
    };
    const tie = line(0.2);
    assert.ok(tie.x > 0 && tie.x <= SOTA.EPS && tie.take === false, `领先 ${tie.x}`);
    assert.equal(tie.now, `和最强持平（要比现在挂着标签的模型高出 ${SOTA.EPS} 分以上才拿得到）`);
    const lead = line(2);
    assert.ok(lead.x > SOTA.EPS && lead.take === true);
    assert.equal(lead.now, `领先最强 ${Math.round(lead.x * 10) / 10} 分，发布就能拿到`);
    // 场地不足（这个模态发过模型的公司不到 SOTA.FIELD 家）：谁也挂不上标签。
    const field = s.sota.field;
    s.sota.field = [];
    try {
      const nf = line(2);
      assert.equal(nf.take, null);
      assert.match(nf.now, /^领先最强 [\d.]+ 分，可这个领域发过模型的公司还不到 2 家，发布也挂不上标签$/);
    } finally { s.sota.field = field; }
    // 发布就能拿到的话只在 sotaWouldTake 为真时出现。
    for (const b of [-3, 0, 0.1, 0.2, 0.45, 0.5, 1, 4]) { const r = line(b); assert.equal(/发布就能拿到/.test(r.now), r.take === true, `${b}：${r.now}`); }
  });
});

describe('暂停、永久失效、授名作废（A4 规则 2、3，C2）', () => {
  it('条件失效先暂停（进度保留，不推进），条件回来接着做；永久失效（别家拿走了里程碑）作废、清空、入队一条提示，状态变成 blocked', () => {
    const nodes = [NODE('jv_pause', { available: { cash: 1e15 } }), NODE('jv_perm', { days: 35, available: { ms: { ms_reasoning: 'notOther' } } }), NODE('jv_sh', { available: { ms: { ms_computer: 'notOther' } } })];
    withFile(jevFile(nodes), () => {
      const s = fresh('jev', 'y2024');
      s.cash = 2e15;
      E.startStrategy(s, 'jv_pause');
      advance(s, 2);
      s.cash = 1e9;
      advance(s, 3);
      assert.equal(s.strategy.cur.days, 2);
      assert.match(s.strategy.cur.paused, /现金/);
      assert.equal(E.nodeStatus(s, 'jv_pause').state, 'paused');
      assert.ok(s.strategy.log.some(x => x.id === 'jv_pause' && x.kind === 'pause'));
      s.cash = 2e15;
      advance(s, 1);
      assert.deepEqual([s.strategy.cur.paused, s.strategy.cur.days], [null, 3], '条件回来了接着做');
      // 永久失效：进行中的 jv_perm、搁置着的 jv_sh。
      E.startStrategy(s, 'jv_sh');
      E.startStrategy(s, 'jv_perm');
      advance(s, 5);
      assert.ok(s.strategy.shelved.jv_sh && s.strategy.cur.id === 'jv_perm');
      s.ms.ms_reasoning = { who: 'gpt', day: s.day };
      s.ms.ms_computer = { who: 'claude', day: s.day };
      E.tickDay(s);
      assert.equal(s.strategy.cur, null);
      assert.equal(s.strategy.shelved.jv_sh, undefined, '搁置的进度也作废');
      const note = s.queue.find(q => q.kind === 'notice' && /做不成了/.test(q.title));
      assert.ok(note, '入队一条提示');
      assert.match(note.text, /别家先做到了|OpenAI/);
      assert.deepEqual([E.nodeStatus(s, 'jv_perm').state, E.nodeStatus(s, 'jv_sh').state], ['blocked', 'blocked']);
      assert.ok(s.strategy.log.some(x => x.id === 'jv_perm' && x.kind === 'void'));
      assert.throws(() => (resolveAll(s), E.startStrategy(s, 'jv_perm')), /条件还不够/);
    });
  });
  it('永久失效的提示是通顺的中文：押注期间自己学会了押注的技术（notTechs），写“已经掌握了「X」，这一项用不上了”；四棵主干的押注节点都一样', () => {
    for (const [c, id, tech, name] of [['jev', 'g_reasoning_bet', 'reasoning', '长思维链推理 RL'], ['midjourney', 'gi_ar_bet', 'ar_image', '原生多模态图像生成'], ['suno', 'gm_licensed_bet', 'licensed', '唱片公司授权训练'], ['elevenlabs', 'gv_s2s_bet', 's2s', '端到端实时语音']]) {
      const s = fresh(c, 'y2024');
      if (id === 'g_reasoning_bet') s.ms.ms_reasoning = { who: 'gpt', day: s.day };
      s.cash = Math.max(s.cash, 1e10);
      assert.ok(!s.techs.includes(tech), `${c} 还没有 ${tech}`);
      // 三个非 LLM 模态开局挑的就是自己的押注节点；jev 开局做的是别的，换过来。
      if (s.strategy.cur?.id !== id) { assert.ok(canStart(s, id), `${c} ${id} 开得了`); E.startStrategy(s, id); }
      advance(s, 3);
      const days = Math.floor(s.strategy.cur.days);
      s.techs.push(tech);
      E.tickDay(s);
      const note = s.queue.find(q => q.kind === 'notice' && /做不成了/.test(q.title));
      const title = nodeOf(s, id).title;
      assert.equal(note?.text, `「${title}」做不成了：已经掌握了「${name}」，这一项用不上了。已经做的 ${days} 天作废，换一项策略吧。`, `${c} ${id}`);
      assert.doesNotMatch(note.text, /，可/);
      assert.equal(E.nodeStatus(s, id).state, 'blocked');
    }
  });
  it('授名：完成时 until = max(现实发布 + 365, 完成日 + 180)；过期、或世界条件永久失效（别家先做到了）时作废并提示；用过的不动', () => {
    const nodes = [NODE('jv_n1', { grants: { names: ['hn_a', 'hn_b'] }, popup: 'card' }), NODE('jv_n2', { grants: { names: ['hn_c'] }, popup: 'card' })];
    const names = [
      { id: 'hn_a', name: 'Jev-A', role: 'flagship', node: 'jv_n1', real: '2025-06-01', model: { open: false } },
      { id: 'hn_b', name: 'Jev-B', role: 'flagship', node: 'jv_n1', real: '2023-01-15', model: { open: false }, world: { ms: { ms_reasoning: 'notOther' } } },
      { id: 'hn_c', name: 'Jev-C', role: 'flagship', node: 'jv_n2', real: '2023-01-15', model: { open: false } },
    ];
    withFile(jevFile(nodes, { names }), () => {
      const s = fresh('jev', 'y2024');
      completeNode(s, 'jv_n1', 'done');
      completeNode(s, 'jv_n2', 'done');
      const R = s.strategy.rights;
      assert.deepEqual(R.hn_a, { day: s.day, until: '2026-06-01', used: null, void: null }, '现实 + 365 更晚');
      assert.equal(R.hn_c.until, addDays(s.day, 180), '完成日 + 180 更晚');
      R.hn_c.used = 'm_x';
      resolveAll(s);
      s.ms.ms_reasoning = { who: 'gpt', day: s.day };
      E.tickDay(s);
      assert.match(R.hn_b.void, /现实里这一步叫 Jev-B，但这一回OpenAI先做到了/);
      assert.ok(s.queue.some(q => q.kind === 'notice' && /Jev-B/.test(q.title)));
      assert.equal(R.hn_a.void, null);
      resolveAll(s);
      s.day = '2026-06-02';
      E.tickDay(s);
      assert.match(R.hn_a.void, /时代已经过去/);
      assert.deepEqual([R.hn_c.void, R.hn_c.used], [null, 'm_x'], '用过的不动');
    });
  });
});

describe('完成（A4 规则 4）、路线冷却（B5）、专属事件（C4）', () => {
  it('完成的顺序：效果 → 特质 → 路线（setStance，来源 strategy）→ 授名 → 解锁 → 专属事件 → 卡片；带路线的节点一定弹卡片；同一个钩子最多一张，落选的只进新闻', () => {
    const nodes = [NODE('jv_full', { effects: { know: 7 }, spirits: { add: [{ id: 'jv_sp' }] }, stance: 'open_family', popup: 'card', grants: { names: ['hn_full'], unlock: ['adopt_open_base'] }, hist: { date: '2024-05', text: '现实里这一年也这么做了。' } })];
    const names = [{ id: 'hn_full', name: 'Jev-Full', role: 'flagship', node: 'jv_full', real: '2024-05-15', model: { open: false } }];
    withFile(jevFile(nodes, { names }), () => {
      const s = fresh('jev', 'y2024');
      assert.equal(s.route.stance, 'closed');
      E.startStrategy(s, 'jv_full');
      const know = s.know, brand = s.brand;
      let card = null;
      for (let i = 0; i < 14 && !card; i++) { resolveAll(s); E.tickDay(s); card = s.queue.find(q => q.kind === 'strategy'); }
      assert.ok(card, '弹了策略完成卡');
      assert.equal(s.strategy.done.jv_full.how, 'done');
      assert.ok(s.know >= know + 7 && hasSpirit(s, 'jv_sp'));
      assert.deepEqual([s.route.stance, s.route.by], ['open_family', 'jv_full']);
      assert.ok(s.brand > brand, '走向开放：品牌上升（B5）');
      assert.equal(s.strategy.rights.hn_full.day, s.strategy.done.jv_full.day);
      assert.equal(s.strategy.unlocks.adopt_open_base, s.strategy.done.jv_full.day);
      const v = E.currentEvent({ ...s, queue: [card] });
      assert.equal(v.kind, 'strategy');
      assert.match(v.title, /公司策略完成/);
      assert.match(v.text, /开源路线从「闭源」改成「旗舰闭源 · 小模型开源」/);
      assert.match(v.text, /现实中：现实里这一年也这么做了/);
      assert.match(v.text, /可以争取型号名 Jev-Full/);
      assert.ok(card.notes.some(x => /获得特质「测试特质」/.test(x)));
      // 读档清理队列时认得这张卡。
      assert.equal(E.migrateGame(clone(s)).s.queue.filter(q => q.kind === 'strategy').length, s.queue.filter(q => q.kind === 'strategy').length);
    });
  });
  it('路线冷却：策略改了路线以后 ROUTE_COOLDOWN 天内，带 stance 的节点都不能开始，状态是 cooldown；可重复的路线节点过了冷却还能再走；开局路线不起冷却', () => {
    const s = fresh('jev', 'y2024');
    assert.equal(E.routeChangeBlocked(s), 0, '开局路线不起冷却');
    assert.equal(E.nodeStatus(s, 'g_route_open_family').state, 'available', '2024 年已经有可商用的强开源模型');
    E.startStrategy(s, 'g_route_open_family');
    advance(s, 35);
    assert.deepEqual([s.route.stance, s.route.by], ['open_family', 'g_route_open_family']);
    const left = E.routeChangeBlocked(s);
    assert.ok(left > ROUTE_COOLDOWN - 3 && left <= ROUTE_COOLDOWN, `${left}`);
    for (const id of ['g_route_open_restricted', 'g_route_close_all', 'g_route_open_family']) assert.equal(E.nodeStatus(s, id).state, 'cooldown', id);
    assert.throws(() => E.startStrategy(s, 'g_route_open_restricted'), /还要等 \d+ 天/);
    advance(s, left);
    assert.equal(E.routeChangeBlocked(s), 0);
    assert.equal(E.nodeStatus(s, 'g_route_open_restricted').state, 'available');
    assert.equal(E.nodeStatus(s, 'g_route_open_family').state, 'locked', '现在的路线不在它的 from 里');
    E.startStrategy(s, 'g_route_close_all');
    advance(s, 35);
    assert.equal(s.route.stance, 'closed');
    advance(s, ROUTE_COOLDOWN);
    assert.equal(E.nodeStatus(s, 'g_route_open_family').state, 'available', '可重复：过了冷却还能再走');
    E.startStrategy(s, 'g_route_open_family');
    advance(s, 35);
    assert.equal(s.route.stance, 'open_family');
    assert.equal(s.strategy.done.g_route_open_family.day > s.strategy.done.g_route_close_all.day, true);
  });
  it('全面闭源（g_route_close_all）的说明和实际规则一致（B2）：旗舰不放权重，小模型默认也不放、发布时仍可自己选；完成卡上也这么写', () => {
    for (const t of Object.values(CORE_TREES)) assert.equal(t.nodes.find(n => n.id === 'g_route_close_all').desc, '旗舰不放权重，小模型默认也不放（发布时仍可自己选）。', t.id);
    const s = fresh('jev', 'y2024');
    completeNode(s, 'g_route_open_family', 'done');
    advance(s, 1);
    completeNode(s, 'g_route_close_all', 'done');
    assert.equal(s.route.stance, 'closed');
    const f = E.releaseOpenRule(s, 'flagship'), sm = E.releaseOpenRule(s, 'small');
    assert.deepEqual([f.open, sm.open, sm.default], [false, 'choice', false], '旗舰锁闭源；小模型自己选，默认闭源');
    const card = s.queue.find(q => q.kind === 'strategy' && q.id === 'g_route_close_all');
    const v = E.currentEvent({ ...s, queue: [card] });
    assert.match(v.text, /旗舰不放权重，小模型默认也不放（发布时仍可自己选）/);
    assert.match(v.text, /以后的旗舰不开放权重，小模型发布时自己选/);
    assert.doesNotMatch(v.text, /一律|小模型也一样/);
  });
  it('专属事件：登记以后，on node 在节点完成时、on release 在用那个授名发布时、on month 在窗口里的月结检查；cond 不满足不弹；notice 只发新闻和特质；每条最多一次', () => {
    const nodes = [NODE('jv_ev', { grants: { names: ['hn_ev'], events: ['ex_node', 'ex_rel', 'ex_month', 'ex_note', 'ex_never'] }, popup: 'card' })];
    const names = [{ id: 'hn_ev', name: 'Jev-Ev', role: 'flagship', node: 'jv_ev', real: '2024-06-01', model: { open: false }, events: ['ex_rel', 'ex_month'] }];
    const exclusives = [
      { id: 'ex_node', title: '{company} 的节点事件', on: 'node', node: 'jv_ev', cond: null, effects: { rep: 1 } },
      { id: 'ex_rel', title: '{model}：发布事件', on: 'release', name: 'hn_ev', cond: null, choices: [{ id: 'a', label: '甲', effects: { know: 3 } }, { id: 'b', label: '乙' }] },
      { id: 'ex_month', title: '月结事件', on: 'month', name: 'hn_ev', within: 60, cond: { cash: 0 }, effects: { know: 2 } },
      { id: 'ex_note', title: '只发新闻', on: 'month', notice: true, within: 90, cond: null, effects: { spirit: { add: [{ id: 'jv_short', days: 30 }] } } },
      { id: 'ex_never', title: '条件不满足', on: 'release', name: 'hn_ev', cond: { cash: 1e18 } },
    ];
    const file = jevFile(nodes, { names, exclusives });
    withFile(file, () => {
      const s = fresh('jev', 'y2024');
      const rep = s.rep;
      completeNode(s, 'jv_ev', 'done');
      assert.equal(s.strategy.ex.ex_node, s.day);
      assert.ok(s.rep >= rep + 1);
      const shown = s.queue.filter(q => q.kind === 'exclusive' || q.kind === 'strategy');
      assert.deepEqual(shown.map(q => q.kind), ['exclusive'], '同一个钩子最多一张：专属事件比策略完成卡优先');
      assert.ok(s.news.some(n => /公司策略完成：节点ev/.test(n.title)), '落选的策略卡只进新闻');
      assert.deepEqual(s.strategy.exPending.map(p => p.id), ['ex_note'], '名字为空的月结事件从完成日起进窗口');
      resolveAll(s);
      s.popup = null;
      // 用授名发布（P2.1 的 doRelease 会传 grant；这里直接调钩子）。
      const snap = { id: 'snap_ev', name: 'Jev-Ev', mod: 'llm', line: 'main', dims: {} };
      s.models.push(snap);
      afterRelease(s, snap, 'hn_ev');
      assert.deepEqual([s.strategy.ex.ex_rel, s.strategy.ex.ex_never], [s.day, undefined]);
      const q = s.queue.find(x => x.kind === 'exclusive' && x.id === 'ex_rel');
      const v = E.currentEvent({ ...s, queue: [q] });
      assert.deepEqual([v.title, v.choices.map(c => c.id)], ['Jev-Ev：发布事件', ['a', 'b']]);
      const know = s.know;
      s.queue = [q];
      E.resolveEvent(s, 'a');
      assert.equal(s.know, know + 3, '选项的效果在选了以后结算');
      assert.deepEqual(s.strategy.exPending.map(p => [p.id, p.modelId]).sort(), [['ex_month', 'snap_ev'], ['ex_note', null]]);
      // 不用授名的发布不触发。
      afterRelease(s, { ...snap, id: 'snap2' }, null);
      assert.equal(s.strategy.ex.ex_never, undefined);
      // 月结：窗口里条件成立就出。
      s.popup = null;
      exclusiveMonth(s, { notes: [] });
      assert.deepEqual([s.strategy.ex.ex_month, s.strategy.ex.ex_note], [s.day, s.day]);
      assert.ok(hasSpirit(s, 'jv_short') && s.strategy.spirits.jv_short.until === addDays(s.day, 30), 'notice 事件照样加特质');
      assert.ok(s.news.some(n => n.type === 'exclusive' && n.title === '只发新闻'), 'notice 只发新闻');
      assert.equal(s.strategy.exPending.length, 0);
      // 每条最多一次。
      const exBefore = { ...s.strategy.ex };
      afterRelease(s, { ...snap, id: 'snap3' }, 'hn_ev');
      assert.deepEqual(s.strategy.ex, exBefore);
      // 特质到期：每天推进时删掉。
      resolveAll(s);
      s.day = addDays(s.day, 31);
      E.tickDay(s);
      assert.ok(!hasSpirit(s, 'jv_short'));
    });
  });
});

describe('炼出 SOTA 与技术储备（A6、A4 规则 8、D6.2、D9 6.8、D10.5）', () => {
  it('拿到第一枚算数标签的次日，g_sota 以 bypass 完成（加“炼出过”，去掉“技术储备不足”）；ρ 从拿到标签那一刻起就是 1.6，和回退口径相同', () => {
    const s = fresh('kimi', 'y2026');
    assert.ok(hasSpirit(s, 'g_sota_rookie') && !sotaMade(s));
    const w = workingModel(s);
    for (const k of Object.keys(w.dims)) w.dims[k] = 99;
    w.postDays = 200;
    w.relDays = 0;
    L.decide(s, 'release', {});
    const D = s.day;
    assert.ok(sotaMade(s), '这一版拿到了算数的标签');
    assert.equal(s.sota.made[0].day, D);
    assert.equal(s.strategy.done.g_sota, undefined, '当天还没记');
    assert.equal(rhoOf(s), expectedRho(s));
    assert.ok(Math.abs(rhoOf(s) - 1.6) < 1e-12);
    resolveAll(s);
    E.tickDay(s);
    assert.equal(s.strategy.done.g_sota, undefined, `${D} 当天的推进还不记`);
    resolveAll(s);
    E.tickDay(s);
    assert.deepEqual(s.strategy.done.g_sota, { day: addDays(D, 1), how: 'bypass' }, '次日以 bypass 完成');
    assert.ok(hasSpirit(s, 'g_sota_maker') && !hasSpirit(s, 'g_sota_rookie') && !hasSpirit(s, 'g_sota_kin'));
    assert.equal(E.nodeStatus(s, 'g_sota').state, 'bypassed');
    assert.equal(s.queue.filter(q => q.kind === 'strategy').length, 0, 'g_sota 不弹卡（庆祝卡归 ms_first_sota）');
    assert.ok(Math.abs(rhoOf(s) - 1.6) < 1e-12 && rhoOf(s) === expectedRho(s));
  });
  it('构造夹具（Gemini y2023，还没炼出过）：2023-11-16 写入 kin 后，次日特质换成 g_sota_kin，只发新闻不弹卡；ρ 每天都和回退口径相同（11-16 以前 0.45，以后 0.7）', () => {
    const g = fresh('gemini', 'y2023');
    let swapped = null;
    while (g.day <= '2023-12-31') {
      const r = rhoOf(g);
      assert.equal(r, expectedRho(g), g.day);
      assert.ok(Math.abs(r - (g.day <= '2023-11-16' ? 0.45 : 0.7)) < 1e-12, `${g.day} ${r}`);
      const kinds = day(g);
      if (hasSpirit(g, 'g_sota_kin') && !swapped) { swapped = addDays(g.day, -1); assert.ok(!kinds.includes('strategy'), '不弹卡'); }
    }
    assert.deepEqual([g.sota.kin, swapped, sotaMade(g)], ['2023-11-16', '2023-11-17', false], '11-16 写入 kin，11-17 那天推进时换特质');
    assert.ok(!hasSpirit(g, 'g_sota_rookie'));
    assert.ok(g.news.some(n => n.title === '公司特质：技术储备不足 → 集团出过 SOTA' && n.day === '2023-11-17'));
  });
  it('D9 6.8 后半句：P2.2 合入后同一状态下的 ρ 和回退口径一致——24 家 × 4 剧本开局，DeepSeek y2025 0.45、GPT y2023 1.6、Gemini y2024 0.7；机器人整局每周都相同', () => {
    for (const [c, sc, rho] of [['deepseek', 'y2025', 0.45], ['gpt', 'y2023', 1.6], ['gemini', 'y2024', 0.7]]) assert.ok(Math.abs(rhoOf(fresh(c, sc)) - rho) < 1e-12, `${c} ${sc}`);
    let n = 0;
    const same = (s, at) => assert.ok(Math.abs(rhoOf(s) - expectedRho(s)) < 1e-12, `${at}：${rhoOf(s)} ≠ ${expectedRho(s)}`);
    for (const c of COMPANIES) for (const sc of SCS) {
      const s = E.createGame(c.id, sc, 1);
      same(s, `${c.id} ${sc}`);
      n++;
    }
    for (const [c, sc] of [['suno', 'y2023'], ['elevenlabs', 'y2023'], ['seed', 'y2024'], ['minimax', 'y2025'], ['grok', 'y2025'], ['claude', 'y2024']]) {
      playGame(c, sc, 1, { onWeek: s => { same(s, `${c} ${sc} ${s.day}`); n++; } });
    }
    assert.ok(n > 300);
  });
});

describe('策略树不补建旧结构', () => {
  it('历史 v3 夹具明确拒绝，原始 JSON 不改写', () => {
    const dir = new URL('../fixtures/saves/', import.meta.url);
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json') && !x.startsWith('.'))) {
      const raw = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')), before = JSON.stringify(raw);
      const r = E.migrateGame(raw); assert.equal(r.ok, false, f); assert.match(r.reason, /不支持|版本|旧存档/);
      assert.equal(JSON.stringify(raw), before, f);
    }
  });
  it('旧策略树：拒绝缺失结构且不补写原对象', () => {
    const s = E.createGame('qwen', 'y2025', 1); delete s.strategy;
    const before = JSON.stringify(s); assert.throws(() => ensureStrategy(s), /不支持|旧存档/);
    assert.equal(JSON.stringify(s), before);
    const r = E.migrateGame(s); assert.equal(r.ok, false); assert.equal(JSON.stringify(s), before);
  });
});

describe('顾问与机器人（A10）', () => {
  it('打分：ai.never、auto、主干路线节点两种模式都是 0；historic 模式架空节点 0 分、日期吻合加 ai.historic、晚 180 天以上 ×0.1；adaptive 有董事会目标和擅长维度的加权；同分按 id', () => {
    const nodes = [
      NODE('jv_hist', { ai: { base: 10, historic: 90 }, hist: { date: '2024-02-01', text: '史实。' } }),
      NODE('jv_far', { ai: { base: 10, historic: 90 }, hist: { date: '2025-06-01', text: '史实。' } }),
      NODE('jv_fic', { ai: { base: 50 }, fiction: true }),
      NODE('jv_route', { ai: { base: 10, historic: 90 }, stance: 'open', license: 'permissive', popup: 'card', hist: { date: '2024-01-20', text: '史实。' } }),
      NODE('jv_mkt', { ai: { base: 10 }, branch: 'market', effects: { data: { post: { agent: 0.5 } } } }),
      NODE('jv_fac', { ai: { base: 10, factors: [{ if: { company: ['jev'] }, mult: 3 }] } }),
    ];
    const file = jevFile(nodes);
    file.tree.branches.market = '市场';
    withFile(file, () => {
      const s = fresh('jev', 'y2024');
      assert.equal(s.strategy.cur.id, 'jv_route', '开局：90 天窗口里最早的史实节点（公司路线节点也算）播种成进行中');
      E.cancelStrategy(s);
      const t = resolvedTree(s);
      const sc = (id, m) => scoreNode(s, t.byId.get(id), m);
      for (const id of ['g_sota', 'g_beyond', 'g_route_open', 'g_route_close_all']) for (const m of ['historic', 'adaptive']) assert.equal(sc(id, m), 0, `${id} ${m}`);
      assert.equal(sc('jv_hist', 'historic'), 100);
      assert.ok(Math.abs(sc('jv_far', 'historic') - 1) < 1e-12);
      assert.deepEqual([sc('jv_fic', 'historic'), sc('jv_fic', 'adaptive')], [0, 50]);
      assert.deepEqual([sc('jv_route', 'historic'), sc('jv_route', 'adaptive')], [100, 0], '公司史实路线节点只在 historic 模式、日期吻合时选');
      assert.equal(sc('jv_fac', 'adaptive'), 30);
      // jev 擅长 agent：碰到 agent 的 ×1.3；12 个月内有营收目标时市场分支 ×1.5。
      const goals = s.goals.filter(x => x.status === 'pending' && ['revenue', 'valuation', 'usage'].includes(x.check.type) && daysBetween(s.day, `${x.date}-01`) <= 365);
      assert.ok(Math.abs(sc('jv_mkt', 'adaptive') - 10 * 1.3 * (goals.length ? 1.5 : 1)) < 1e-9);
      assert.equal(pickStrategy(s, 'historic'), 'jv_hist');
      s.strategy.done.jv_hist = { day: s.day, how: 'done' };
      assert.equal(pickStrategy(s, 'historic'), 'jv_route');
    });
  });
  it('顾问：策略空闲时在团队任务之前插一条“定下一项公司策略”，照做就开始；日期吻合的史实节点优先并注明；点了“先不做”，这个周期不再提', () => {
    const nodes = [NODE('jv_hist', { ai: { base: 1, historic: 90 }, hist: { date: '2024-01-20', text: '史实。' } })];
    withFile(jevFile(nodes), () => {
      const s = fresh('jev', 'y2024');
      E.cancelStrategy(s);
      let list = E.advise(s);
      const a = list.find(x => x.id === 'strategy');
      assert.ok(a, list.map(x => x.label).join(' / '));
      assert.equal(list.at(-1).kind, 'jobs');
      assert.ok(list.indexOf(a) < list.length - 1);
      assert.equal(a.label, '定下一项公司策略：节点hist');
      assert.match(a.detail, /现实中这家公司这时走了这一步/);
      E.applyAdvice(s, a);
      assert.equal(s.strategy.cur.id, 'jv_hist');
      E.cancelStrategy(s);
      snoozeStrategyAdvice(s);
      assert.ok(!E.advise(s).some(x => x.id === 'strategy'), '先不做');
      advance(s, IDLE_ADVICE_EVERY);
      assert.ok(E.advise(s).some(x => x.id === 'strategy'), '下一个周期再提醒');
    });
  });
  it('顾问不让弱的顶替强的：比在线旗舰弱的版本只建议“作为副线发布”，照做以后 line 是 side、在线旗舰不变（D1）', () => {
    const s = fresh('gpt', 'y2024');
    const live = liveModel(s), w = workingModel(s);
    for (const k of Object.keys(w.dims)) w.dims[k] = Math.max(0, (live.dims[k] ?? 0) - 5);
    Object.assign(w, { postDays: 200, relDays: 0, postMonths: 6 });
    // P2.4a 起发布改成送评（T6）：建议是“送评 X，作为副线发布”，评完发布时按那天的 D1 规则判，line 是 side。
    const a = E.advise(s).find(x => x.id === 'jobs:submit');
    assert.ok(a, E.advise(s).map(x => x.label).join(' / '));
    assert.match(a.label, /作为副线发布/);
    assert.ok(!('replace' in a.op.arg));
    const sub = E.applyAdvice(s, a);
    const r = E._finishEvalNow(s, sub.eval.id);
    assert.deepEqual([r.line, s.live], ['side', live.id]);
  });
  it('照着大按钮玩（含 DeepSeek 样板树之外的主干、通用树）：每条建议都能执行；发布从不勾“顶替在线旗舰”（顾问和机器人的源码里没有 replace）', () => {
    for (const [c, sc, seed] of [['jev', 'y2024', 2], ['midjourney', 'y2025', 3], ['mistral', 'y2025', 4], ['gpt', 'y2026', 5]]) {
      const { s, errors } = playAdvised(c, sc, seed);
      assert.deepEqual(errors, [], `${c} ${sc}`);
      assert.ok(Object.values(s.strategy.done).some(d => d.how === 'done'), `${c} ${sc} 做完过策略`);
    }
    for (const f of ['sim/advisor.js', 'sim/bot.js']) assert.ok(!/replace\s*:/.test(fs.readFileSync(new URL(`../../src/career/${f}`, import.meta.url), 'utf8')), f);
  });
  it('机器人 24 家 × y2023、y2024（y2025、y2026 在 trees.test.mjs，分两个文件并行跑）：操作不失败；不选 ai.never 节点；炼出过 SOTA 以后从不蒸馏；局末 g_sota 完成当且仅当炼出过；没有随机数、结果可复现', () => {
    const { makers, distilled } = botAudit(['y2023', 'y2024']);
    assert.ok(makers >= 8 && distilled > 0, `${makers} / ${distilled}`);
    // 可复现：同一局跑两遍，整份状态一字不差。
    const a = playGame('deepseek', 'y2024', 7).s, b = playGame('deepseek', 'y2024', 7).s;
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    for (const f of ['strategy.js', 'strategy_ai.js', 'exclusive.js']) assert.ok(!/\brand\(|Math\.random/.test(fs.readFileSync(new URL(`../../src/career/sim/${f}`, import.meta.url), 'utf8')), f);
  });
  it('蒸馏（wantsDistill）：前沿档和炼出过的永远不蒸馏；落后不到 DISTILL_GAP 不蒸馏；只用许可宽松（LP）的开源老师；离上次买满 DISTILL_EVERY 天；resolveAll 只在想蒸馏这一家时选“下载权重做蒸馏”', () => {
    const s = fresh('mistral', 'y2025');
    advance(s, 19);
    assert.ok(s.day >= '2025-01-20', s.day);
    s.queue = [];
    s.orders = s.orders.filter(o => o.kind !== 'distill');
    const w = workingModel(s), ws = worldSota(s);
    assert.ok(qOf('llm', w.dims) <= ws.q - BOT.DISTILL_GAP);
    const t = distillTeacher(s);
    assert.ok(t && t.license === 'LP' && t.mode === 'gpu' && t.teacherQ >= qOf('llm', w.dims) + BOT.TEACHER_MIN, JSON.stringify(t && [t.id, t.license]));
    assert.equal(wantsDistill(s, t.teacher), true);
    assert.equal(wantsDistill(s, 'llama'), false, 'Llama 是受限许可');
    // 炼出过：永远不蒸馏。
    const m = clone(s);
    m.sota.before = true;
    assert.equal(wantsDistill(m), false);
    // 前沿档：同样的局面也不蒸馏（P4.2，G2 后决定 4）。
    const fr = clone(s);
    fr.company = { ...fr.company, tier: 'frontier' };
    assert.equal(distillTeacher(fr), null);
    assert.equal(wantsDistill(fr), false);
    // 落后不到 DISTILL_GAP：不蒸馏。
    const near = clone(s);
    const nw = workingModel(near);
    for (const k of Object.keys(nw.dims)) nw.dims[k] += ws.q - qOf('llm', w.dims);
    assert.equal(wantsDistill(near), false);
    // 买过以后 DISTILL_EVERY 天内不再买。
    L.decide(s, 'data', { id: t.id });
    assert.equal(wantsDistill(s), false, '在途');
    s.orders = s.orders.filter(o => o.kind !== 'distill');
    s.data.teachers = { ...s.data.teachers, [t.teacher]: { name: t.teacherName, day: addDays(s.day, -(BOT.DISTILL_EVERY - 1)), q: t.teacherQ, dims: t.teacherDims } };
    assert.equal(wantsDistill(s), false);
    s.data.teachers[t.teacher].day = addDays(s.day, -BOT.DISTILL_EVERY);
    assert.equal(wantsDistill(s), true);
    // resolveAll：卡上的老师是想蒸馏的那一家才选蒸馏，否则选不带标记的。
    const card = fam => { const g = clone(s); g.popup = null; g.queue = [{ kind: 'milestone', id: 'ms_open_reasoning_frontier', v: 'rival', fam, rel: 'DeepSeek-R1' }]; return g; };
    const g1 = card(t.teacher);
    resolveAll(g1);
    assert.ok(g1.orders.some(o => o.kind === 'distill' && o.ref === `distill:${t.teacher}`), '想蒸馏这一家：选了蒸馏');
    const g2 = card(t.teacher);
    g2.sota.before = true;
    resolveAll(g2);
    assert.ok(!g2.orders.some(o => o.kind === 'distill'), '炼出过：选不带标记的');
  });
  it('shouldHold：构造的预告是冠军、“不及”或“略低”，近 30 天还涨了 ≥ 0.3，45 天内没有董事会检查，这一版推迟还没满 45 天，才再练一阵；预告为 null（期待还是存根）时为假', () => {
    const s = fresh('gpt', 'y2024');
    const w = workingModel(s);
    const q = qOf('llm', w.dims);
    s.goals = s.goals.filter(g => daysBetween(s.day, `${g.date}-01`) > BOT.HOLD_MAX_DAYS);
    s.strategy.trail = { id: w.id, pts: [[addDays(s.day, -30), q - 0.5]] };
    const P = (tier, result) => ({ tier, result, x: -0.8, need: 0.9, badges: [], text: '' });
    assert.equal(shouldHold(s, { preview: P('champion', 'under') }), true);
    assert.equal(shouldHold(s, { preview: () => P('champion', 'under_half') }), true);
    assert.equal(shouldHold(s, { preview: P('champion', 'meet') }), false, '能达标就发');
    assert.equal(shouldHold(s, { preview: P('challenger', 'under') }), false, '只管冠军');
    assert.equal(shouldHold(s, { preview: null }), false);
    assert.equal(shouldHold(s), false, 'P3.E 之前 expectPreview 返回 null');
    s.strategy.trail.pts[0][1] = q - 0.2;
    assert.equal(shouldHold(s, { preview: P('champion', 'under') }), false, '近 30 天涨不到 0.3');
    s.strategy.trail.pts[0][1] = q - 0.5;
    s.strategy.hold = { key: `${w.id}#${w.releases || 0}`, since: addDays(s.day, -BOT.HOLD_MAX_DAYS) };
    assert.equal(shouldHold(s, { preview: P('champion', 'under') }), false, '这一版推迟满 45 天');
    s.strategy.hold.since = addDays(s.day, -10);
    assert.equal(shouldHold(s, { preview: P('champion', 'under') }), true);
    s.goals.push({ id: 'g_test', status: 'pending', date: addDays(s.day, 20).slice(0, 7), check: { type: 'revenue', min: 1 } });
    assert.equal(shouldHold(s, { preview: P('champion', 'under') }), false, '45 天内有董事会检查');
  });
});

describe('加成来源：特质和限时加成（E3）', () => {
  it('特质的 mods 进 modifier；applyEffects 的 demand 写进 s.boosts，到期当天失效、推进时清掉', () => {
    const s = fresh('jev', 'y2024');
    const legal = modifier(s, 'legal');
    addSpirit(s, 'g_safety_first');
    assert.ok(Math.abs(modifier(s, 'legal') - legal * 0.8) < 1e-12 && modifier(s, 'cap.safety') >= 3);
    const router = modifier(s, 'routerDemand');
    applyEffects(s, { demand: { router: 1.5, days: 10 } }, { source: 'strategy', id: 't' });
    assert.ok(Math.abs(modifier(s, 'routerDemand') - router * 1.5) < 1e-12);
    advance(s, 10);
    assert.equal(modifier(s, 'routerDemand'), router, '到期当天失效');
    advance(s, 1);
    assert.deepEqual(s.boosts.filter(b => b.src === 't'), [], '推进时清掉');
  });
});

describe('自查脚本 scripts/strategy_sim.mjs（F3，P3.* 做树时用）', () => {
  it('--days N 的结局行写“停在某天”，不是空的；不带 --days 跑完整局时写评级和结局原因', () => {
    const run = (...a) => execFileSync(process.execPath, [fileURLToPath(new URL('../../scripts/strategy_sim.mjs', import.meta.url)), '--only', 'deepseek', '--sc', 'y2023', ...a], { encoding: 'utf8' });
    const end = out => out.trim().split('\n').at(-1);
    assert.match(end(run('--seeds', '2', '--days', '60')), /^结局：种子1 停在 2023-0[23]-\d{2}  种子2 停在 2023-0[23]-\d{2}$/);
    assert.match(end(run('--seeds', '1')), /^结局：种子1 [SABCDEFG] \S+$/);
  });
});
