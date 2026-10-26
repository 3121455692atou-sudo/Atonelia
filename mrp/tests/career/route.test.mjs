// 开源路线（规格 B，P1.3）：五档定义、开局路线表 B6、发布时的开闭规则（按发布角色 relRole）、delayed 档的旧代开放、
// 切换效果和冷却、读档迁移（B7）、经济和事件的读取点（B3）、防蒸馏开关、顾问和机器人的开源选项。
// “只有允许的文件能调用 setStance”的静态检查在 seams.test.mjs（P0.3a）。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as E from '../../src/career/engine.js';
import { companyFile } from '../../src/career/data/companies/index.js';
import { nodeOf } from '../../src/career/sim/strategy.js';
import { STANCES, STANCE, START_STANCE, START_SCENARIOS, parseStance, routeLabel } from '../../src/career/data/routes.js';
import { COMPANIES, SCENARIOS } from '../../src/career/data/core.js';
import { RELEASES } from '../../src/career/data/rivals.js';
import { DELAY_DAYS, ROUTE_COOLDOWN } from '../../src/career/data/balance.js';
import { setStance, releaseOpenRule, routeTick, routeCooldownLeft, stanceSwitchEffects, licenseOf, openStance, ensureRoute, routeOf } from '../../src/career/sim/route.js';
import { playerBrand, usageBoards, simulateService, monthlyCosts, ANTI_DISTILL_FEE } from '../../src/career/sim/economy.js';
import { conditionalEvents } from '../../src/career/sim/events.js';
import { applyWorldEvent } from '../../src/career/sim/world.js';
import { serviceDue } from '../../src/career/sim/service.js';
import { addDays, daysBetween } from '../../src/career/sim/clock.js';

import { DAY } from '../../src/career/sim/loop.js';
import { playGame, playAdvised, resolveAll, advance } from '../helpers/career_bot.mjs';
import { clone, baseJob } from '../helpers/career_util.mjs';
import { CAREER, jsFiles, careerRel } from '../helpers/imports.mjs';
import { projectTick, startFinetune } from '../helpers/legacy_jobs.mjs';
import * as L from '../helpers/legacy_jobs.mjs';
// 本家树会带数值特质；只测路线规则时先摘掉本家的（P3.T 起 gpt、claude 有本家树）。
const stripHome = s => { const home = companyFile(s.charId)?.spirits || {}; for (const id of Object.keys(s.strategy?.spirits || {})) if (home[id]) delete s.strategy.spirits[id]; return s; };
// 开局以后本家路线节点可能改路线：按发布日之前最后完成的那一个算当时的路。
// 发布当天的路线：开局路线，加上那天之前完成的公司路线节点，按完成日先后施加（P3.T 起 glm、gpt 这类公司会中途转路线）。
const stanceAt = (s, id, sc, day) => {
  let stance = START_STANCE[id][sc].stance;
  const done = Object.entries(s.strategy?.done || {}).filter(([nid, d]) => d?.day <= day && nodeOf(s, nid)?.stance)
    .sort((a, b) => (a[1].day < b[1].day ? -1 : a[1].day > b[1].day ? 1 : 0));
  for (const [nid] of done) stance = nodeOf(s, nid).stance;
  return STANCE[stance];
};

globalThis.document ??= { baseURI: 'http://localhost/' };
const releaseOpenPanel = await import('../../src/career/ui/panels/release_open.js');
const SPEC = fs.readFileSync(new URL('../../docs/spec/v1.0-spec.md', import.meta.url), 'utf8');
const FIXTURES = fileName => JSON.parse(fs.readFileSync(new URL(`../fixtures/saves/${fileName}.json`, import.meta.url), 'utf8'));

// 规格 B6 的表原样读出来：{ 公司: ['closed', 'open/P', …] }（“(→X)”是开局播种的节点，不是开局路线，去掉）。
function specB6() {
  const sec = SPEC.slice(SPEC.indexOf('### B6.'), SPEC.indexOf('### B7.'));
  const rows = sec.split('\n').filter(l => l.startsWith('| ') && !l.startsWith('| 公司'));
  const out = {};
  for (const l of rows) {
    const cells = l.split('|').slice(1, -1).map(x => x.trim());
    const cos = cells[0].replace(/（.*?）/g, '').split('、').map(x => x.trim());
    const vals = cells.slice(1).map(c => c.match(/^([a-z_]+(?:\/[PR])?)/)[1]);
    for (const c of cos) out[c] = vals;
  }
  return out;
}
// 造一个待发布的小模型（复制在练旗舰，能力按 delta 调），放进小模型线。
function addSmallWorking(s, ref, delta) {
  const sw = { ...clone(E.workingModel(s) || E.liveModel(s)), id: `mtest_small_${s.models.length}`, role: 'small', origin: 'distill', stage: 'post', released: null, name: '测试小模型' };
  for (const k of ['line', 'releasedDay', 'hist', 'sota', 'license', 'openAt']) delete sw[k];
  sw.dims = Object.fromEntries(Object.entries(ref.dims).map(([k, v]) => [k, v + delta]));
  s.models.push(sw);
  s.smallWorking = sw.id;
  return sw;
}
// 在练旗舰练够两周可以发布，能力调到在线旗舰 + delta。
function readyWorking(s, delta) {
  const w = E.workingModel(s), live = E.liveModel(s);
  w.postDays = (w.postDays || 0) + 40;
  if (live) w.dims = Object.fromEntries(Object.entries(live.dims).map(([k, v]) => [k, v + delta]));
  return w;
}
const fresh = (id, sc, seed = 1) => { const s = E.createGame(id, sc, seed); resolveAll(s); s.queue = []; return s; };
// 发布前先把眼前的事件处理掉（上一次发布可能弹了里程碑）。
const release = (s, arg) => { resolveAll(s); s.queue = []; return L.decide(s, 'release', arg); };
const flagshipCount = s => [1, 2, 3, 4, 5].filter(n => E.cond(s, { released: { role: 'flagship', count: n } })).length;
const smallCount = s => [1, 2, 3, 4, 5].filter(n => E.cond(s, { released: { role: 'small', count: n } })).length;

describe('五档定义（B1）', () => {
  it('五档、顺序、各档的旗舰开闭、小模型默认、许可、数值；两端的 apiBrand、overseas 等于原来写死的常量', () => {
    assert.deepEqual(STANCES, ['closed', 'open_family', 'delayed', 'open_restricted', 'open']);
    assert.deepEqual(Object.keys(STANCE), STANCES);
    assert.deepEqual(STANCES.map(x => STANCE[x].flagshipOpen), [false, false, false, true, true]);
    assert.deepEqual(STANCES.map(x => STANCE[x].smallDefault), [false, true, true, true, true]);
    assert.deepEqual(STANCES.map(x => STANCE[x].license ?? null), [null, null, null, 'restrictive', 'permissive']);
    assert.equal(STANCE.delayed.reopen, true);
    assert.deepEqual([STANCE.closed.mods, STANCE.open.mods], [{ apiBrand: 1, overseas: 0.15 }, { apiBrand: 0.8, overseas: 0.35 }]);
    assert.deepEqual(STANCES.map(x => STANCE[x].mods.overseas), [0.15, 0.2, 0.25, 0.3, 0.35]);
    assert.equal(routeLabel({ stance: 'delayed', license: 'restrictive' }), '旧代开源（受限许可）');
    assert.throws(() => parseStance('wide_open'), /没有这一档/);
    assert.throws(() => parseStance('open/X'), /不认识的许可/);
  });
});

describe('开局路线（B6）', () => {
  it('START_STANCE 逐格等于规格 B6 的表（24 × 4，含许可），mistral y2024 = open_family', () => {
    const b6 = specB6();
    assert.deepEqual(Object.keys(b6).sort(), COMPANIES.map(c => c.id).sort());
    assert.deepEqual(START_SCENARIOS, SCENARIOS.map(x => x.id));
    assert.deepEqual(Object.keys(START_STANCE).sort(), COMPANIES.map(c => c.id).sort());
    let cells = 0;
    for (const c of COMPANIES) START_SCENARIOS.forEach((sc, i) => { assert.deepEqual(START_STANCE[c.id][sc], parseStance(b6[c.id][i]), `${c.id} ${sc}`); cells++; });
    assert.equal(cells, 96);
    assert.deepEqual(START_STANCE.mistral.y2024, { stance: 'open_family', license: null });
    assert.deepEqual(START_STANCE.grok.y2026, { stance: 'delayed', license: 'restrictive' });
    assert.deepEqual(START_STANCE.llama.y2023, { stance: 'open_restricted', license: 'restrictive' });
  });
  it('createGame 的 s.route 等于表；凡是开局有在线旗舰的格子，旗舰的开闭 = flagshipOpen；继承的开源型号按真实许可补 license', () => {
    const bad = [];
    let withLive = 0;
    for (const c of COMPANIES) for (const sc of START_SCENARIOS) {
      const s = E.createGame(c.id, sc, 1);
      const want = START_STANCE[c.id][sc];
      assert.deepEqual(s.route, { stance: want.stance, license: want.license, since: s.day, by: 'start' }, `${c.id} ${sc}`);
      const live = E.liveModel(s);
      if (live) { withLive++; if (live.open !== STANCE[want.stance].flagshipOpen) bad.push(`${c.id} ${sc} ${live.name}`); }
      for (const m of s.models.filter(x => x.stage === 'released' && x.open)) assert.ok(['permissive', 'restrictive'].includes(m.license), `${c.id} ${sc} ${m.name} 没有许可`);
    }
    assert.deepEqual(bad, []);
    assert.ok(withLive >= 70, `有在线旗舰的格子只有 ${withLive} 个`);
    // 真实许可：Llama 2 70B 是 LR，Mistral 7B 是 LP（Mistral y2024 的在线旗舰闭源，开源的是小模型线）。
    const llama = E.liveModel(E.createGame('llama', 'y2024', 1));
    assert.deepEqual([llama.open, llama.license], [true, 'restrictive']);
  });
});

describe('发布时的开闭（B2，按发布角色 relRole）', () => {
  it('releaseOpenRule：旗舰按 flagshipOpen 锁定，小模型和副线自己选（默认 smallDefault，许可取路线的许可）', () => {
    const s = E.createGame('gpt', 'y2024', 1);
    for (const st of STANCES) {
      setStance(s, st, { src: 'start' });
      const f = releaseOpenRule(s, 'flagship'), sm = releaseOpenRule(s, 'small');
      assert.equal(f.open, STANCE[st].flagshipOpen, st);
      assert.equal(f.license, STANCE[st].flagshipOpen ? STANCE[st].license : null, st);
      assert.match(f.why, new RegExp(`^路线：${STANCE[st].label.replace(/[()（）]/g, '.')}`));
      assert.deepEqual([sm.open, sm.default, sm.license], ['choice', STANCE[st].smallDefault, STANCE[st].license ?? 'permissive'], st);
    }
    setStance(s, 'delayed', { src: 'start', license: 'restrictive' });
    assert.equal(releaseOpenRule(s, 'small').license, 'restrictive');
    // 缺少路线不能被静默解释成闭源。
    assert.throws(() => releaseOpenRule({ day: s.day }, 'flagship'), /不支持|路线/);
  });
  it('闭源档：旗舰不能开源（勾了也不算），小模型可以开源，不勾就按默认闭源', () => {
    const s = fresh('gpt', 'y2024');
    assert.equal(s.route.stance, 'closed');
    const live = E.liveModel(s);
    readyWorking(s, 1);
    const r = release(s, { open: true });
    assert.equal(r.line, 'main');
    assert.deepEqual([r.model.open, r.model.license], [false, null]);
    addSmallWorking(s, live, -20);
    const a = release(s, { role: 'small', open: true });
    assert.deepEqual([a.line, a.model.open, a.model.license], ['side', true, 'permissive']);
    advance(s, 20);
    addSmallWorking(s, live, -20);
    const b = release(s, { role: 'small' });
    assert.deepEqual([b.line, b.model.open, b.model.license], ['side', false, null]);
  });
  it('蒸馏出身的快照顶替旗舰时，开闭等于 flagshipOpen，计入 released:{role:flagship}；不看出身', () => {
    for (const [id, sc, want, lic] of [['gpt', 'y2024', false, null], ['llama', 'y2024', true, 'restrictive'], ['rwkv', 'y2024', true, 'permissive']]) {
      const s = fresh(id, sc);
      const live = E.liveModel(s);
      const [f0, s0] = [flagshipCount(s), smallCount(s)];
      const sw = addSmallWorking(s, live, 3);
      assert.equal(sw.origin, 'distill');
      const r = release(s, { role: 'small', open: !want });
      assert.equal(r.line, 'main', id);
      assert.deepEqual([r.model.open, r.model.license], [want, lic], id);
      assert.deepEqual([flagshipCount(s), smallCount(s)], [f0 + 1, s0], `${id} 计入旗舰发布`);
    }
  });
  it('训练线出身的副线：开闭可选，按小模型算，不计入 released:{role:flagship}', () => {
    for (const open of [true, false]) {
      const s = fresh('llama', 'y2024');
      readyWorking(s, -5);
      const [f0, s0] = [flagshipCount(s), smallCount(s)];
      const r = release(s, { open });
      assert.equal(r.line, 'side');
      assert.equal(r.model.origin, 'pretrain');
      assert.deepEqual([r.model.open, r.model.license], [open, open ? 'restrictive' : null]);
      assert.deepEqual([flagshipCount(s), smallCount(s)], [f0, s0 + 1]);
    }
    // 不勾就用路线的默认：llama 是受限许可开源，smallDefault 为真。
    const s = fresh('llama', 'y2024');
    readyWorking(s, -5);
    assert.equal(release(s, {}).model.open, true);
  });
  it('发布面板的开源一行：锁定时只有说明、没有勾选框；可选时有勾选框，默认按路线', () => {
    const s = fresh('gpt', 'y2024');
    const w = readyWorking(s, 1);
    const locked = releaseOpenPanel.render(s, w, 'flagship');
    assert.ok(!locked.includes('<input') && locked.includes('旗舰不开放权重'), locked);
    w.dims = Object.fromEntries(Object.entries(E.liveModel(s).dims).map(([k, v]) => [k, v - 5]));
    const side = releaseOpenPanel.render(s, w, 'flagship');
    assert.ok(side.includes('id="rel-open"') && !side.includes('checked') && side.includes('副线'), side);
    const sw = addSmallWorking(s, E.liveModel(s), -20);
    setStance(s, 'open_family', { src: 'start' });
    const small = releaseOpenPanel.render(s, sw, 'small');
    assert.ok(small.includes('id="rel-small-open"') && small.includes('checked'), small);
    assert.equal(releaseOpenPanel.render(s, null, 'small'), '');
  });
});

describe('没发布的模型不写 open（G1 遗留 #21，B7 第 5 条：开闭只在发布时按路线和发布角色定）', () => {
  it('24 × 4 开局：在练模型、待发布小模型都不带 open（和读档迁移过来的同一形状），已发布的继承型号照旧带', () => {
    for (const c of COMPANIES) for (const sc of START_SCENARIOS) {
      const s = E.createGame(c.id, sc, 1);
      for (const m of s.models) assert.equal('open' in m, m.stage === 'released', `${c.id} ${sc} ${m.name}（${m.stage}）`);
    }
  });
  it('预训练、蒸馏、续训三种立项和练出来的模型都不写 open（立项配置里传的 open 也不留）；发布时按路线写进快照', () => {
    // llama y2024（受限许可开源）：预训练立项照旧写法传 open:false，在练模型不带 open，顶替旗舰发布时照样按路线开源。
    const s = fresh('llama', 'y2024');
    if (baseJob(s)) E.cancelJob(s, baseJob(s).id);
    s.gpus.owned = { H100: 4096 };
    L.decide(s, 'maintain');
    L.startProject(s, { total: 70, active: 70, arch: 'dense', tokens: 1, open: false });
    assert.ok(!('open' in baseJob(s).pj) && !('open' in baseJob(s).pj.cfg), JSON.stringify(baseJob(s).pj.cfg));
    baseJob(s).pj.done = baseJob(s).pj.need;
    projectTick(s, { notes: [] }, DAY);
    const w = E.workingModel(s);
    assert.ok(w.stage === 'post' && !('open' in w), w.name);
    readyWorking(s, 1);
    const r = release(s, {});
    assert.deepEqual([r.line, r.model.open, r.model.license], ['main', true, 'restrictive']);
    assert.ok(!('open' in E.workingModel(s)), '发布以后留在训练线上的在练模型也不带');
    // gpt y2024（闭源）：蒸馏表单原来默认勾“开源”，现在立项不留；小模型不带 open，发布时不勾就按路线默认闭源。
    const g = fresh('gpt', 'y2024');
    L.decide(g, 'maintain');
    L.startDistill(g, { teacher: 'self', total: 7, active: 7, arch: 'dense', tokens: 1.5, open: true });
    assert.ok(!('open' in baseJob(g).pj) && !('open' in baseJob(g).pj.cfg));
    Object.assign(baseJob(g).pj, { done: baseJob(g).pj.need, elapsedDays: 7 });
    projectTick(g, { notes: [] }, DAY);
    const sw = E.smallWorking(g);
    assert.ok(sw && !('open' in sw), sw?.name);
    const a = release(g, { role: 'small' });
    assert.deepEqual([a.line, a.model.open, a.model.license], ['side', false, null]);
    // 续训：别家开源底座上练出来的在练模型同样不带 open。
    const q = fresh('qwen', 'y2025');
    q.gpus.owned = { H100: 20000 };
    q.strategy = { unlocks: { adopt_open_base: q.day } };
    L.decide(q, 'maintain');
    startFinetune(q, { relId: RELEASES.find(x => x.name === 'Llama 3.1 405B').id });
    assert.ok(!('open' in baseJob(q).pj));
    baseJob(q).pj.done = baseJob(q).pj.need;
    projectTick(q, { notes: [] }, DAY);
    const f = E.workingModel(q);
    assert.ok(f.lineage?.kind === 'finetune' && !('open' in f));
  });
});

describe('delayed 档的旧代开放（B5）', () => {
  it('新旗舰全量上线时，被取代的闭源旗舰记下开放日；满 180 天自动开放，许可取路线的许可，发新闻', () => {
    const s = fresh('grok', 'y2025');
    assert.deepEqual([s.route.stance, s.route.license], ['delayed', 'permissive']);
    const old = E.liveModel(s);
    assert.equal(old.open, false);
    readyWorking(s, 2);
    const r = release(s, {});
    assert.deepEqual([r.line, r.model.open], ['main', false]);
    for (let i = 0; i < 60 && s.live !== r.model.id; i++) advance(s, 1);
    assert.equal(s.live, r.model.id);
    const liveDay = addDays(r.until, 0);
    assert.equal(old.openAt, addDays(liveDay, DELAY_DAYS));
    advance(s, daysBetween(s.day, old.openAt) - 1);
    assert.equal(old.open, false, '还差一天');
    advance(s, 2);
    assert.deepEqual([old.open, old.license, old.openAt], [true, 'permissive', addDays(liveDay, DELAY_DAYS)]);
    assert.ok(s.news.some(n => n.title === `按路线，开放上一代 ${old.name} 的权重`));
    assert.equal(r.model.openAt, undefined, '在线旗舰不开放');
  });
  it('到期那天：开放、品牌 ×1.02；不在 delayed 档时什么都不做；离开 delayed 档取消还没到日子的', () => {
    const s = stripHome(fresh('grok', 'y2026'));
    assert.deepEqual([s.route.stance, s.route.license], ['delayed', 'restrictive']);
    const m = E.liveModel(s);
    m.openAt = s.day;
    const b = s.brand, out = { notes: [] };
    routeTick(s, out);
    assert.deepEqual([m.open, m.license], [true, 'restrictive']);
    assert.ok(Math.abs(s.brand / b - 1.02) < 1e-9);
    assert.equal(out.notes.length, 1);
    const g = fresh('gpt', 'y2024');
    const gm = E.liveModel(g);
    gm.openAt = g.day;
    routeTick(g, { notes: [] });
    assert.equal(gm.open, false, '闭源档不开放');
    const d = fresh('grok', 'y2025');
    const dm = E.liveModel(d);
    dm.openAt = addDays(d.day, 30);
    setStance(d, 'closed', { src: 'strategy', by: 'g_route_close_all' });
    assert.equal(dm.openAt, undefined);
  });
  it('闭源档换代不记开放日', () => {
    const s = fresh('gpt', 'y2024');
    const old = E.liveModel(s);
    readyWorking(s, 2);
    const r = release(s, {});
    advance(s, daysBetween(s.day, r.until) + 1);
    assert.equal(s.live, r.model.id);
    assert.equal(old.openAt, undefined);
  });
});

describe('切换效果与冷却（B4、B5）', () => {
  it('来源只能是 strategy、start；只有 strategy 带切换效果：走向开放加品牌，走向封闭扣口碑、加估值', () => {
    assert.deepEqual(stanceSwitchEffects('closed', 'open'), { brand: 1.16 });
    assert.deepEqual(stanceSwitchEffects('open', 'open_family'), { rep: -9, valuation: 1 + 0.03 * 3 });
    assert.equal(stanceSwitchEffects('open', 'open'), null);
    const s = stripHome(fresh('gpt', 'y2024'));
    const b = s.brand;
    setStance(s, 'open_family', { src: 'start' });
    assert.equal(s.brand, b, '开局设路线没有效果');
    setStance(s, 'open', { src: 'strategy', by: 'g_route_open' });
    assert.ok(Math.abs(s.brand / b - 1.12) < 1e-9);
    assert.deepEqual(s.route, { stance: 'open', license: 'permissive', since: s.day, by: 'g_route_open' });
    const p = fresh('kimi', 'y2024');
    setStance(p, 'open', { src: 'start' });
    const [rep, val] = [p.rep, p.valuation];
    setStance(p, 'closed', { src: 'strategy', by: 'g_route_close_all' });
    assert.equal(p.rep, rep - 12);
    assert.ok(Math.abs(p.valuation / val - 1.12) < 1e-9);
    // 集团内团队不改估值。
    const g = fresh('gemini', 'y2025');
    const gv = g.valuation;
    setStance(g, 'closed', { src: 'strategy', by: 'g_route_close_all' });
    assert.equal(g.valuation, gv);
    for (const src of ['event', 'effects', 'world', 'migration', undefined]) assert.throws(() => setStance(s, 'closed', { src }), /只能由/);
  });
  it('冷却：公司策略改路线之后 ROUTE_COOLDOWN 天；开局设的路线不起冷却', () => {
    const s = fresh('gpt', 'y2024');
    assert.equal(routeCooldownLeft(s), 0);
    setStance(s, 'open_family', { src: 'strategy', by: 'g_route_open_family' });
    assert.equal(routeCooldownLeft(s), ROUTE_COOLDOWN);
    advance(s, 30);
    assert.equal(routeCooldownLeft(s), ROUTE_COOLDOWN - 30);
    advance(s, ROUTE_COOLDOWN);
    assert.equal(routeCooldownLeft(s), 0);
  });
  it('效果词表里没有路线相关的键', () => {
    for (const k of ['stance', 'route']) assert.throws(() => E.applyEffects(fresh('gpt', 'y2024'), { [k]: 'open' }, { source: 'event', id: 'x' }));
  });
});

describe('旧路线结构不支持', () => {
  it('历史 v3 夹具明确拒绝，原始 JSON 不改写', () => {
    const dir = new URL('../fixtures/saves/', import.meta.url);
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json') && !x.startsWith('.'))) {
      const raw = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')), before = JSON.stringify(raw);
      const r = E.migrateGame(raw); assert.equal(r.ok, false, f); assert.match(r.reason, /不支持|版本|旧存档/);
      assert.equal(JSON.stringify(raw), before, f);
    }
  });
  it('旧路线：拒绝缺失结构且不补写原对象', () => {
    const s = E.createGame('qwen', 'y2025', 1); delete s.route;
    const before = JSON.stringify(s); assert.throws(() => ensureRoute(s), /不支持|旧存档/);
    assert.equal(JSON.stringify(s), before);
    const r = E.migrateGame(s); assert.equal(r.ok, false); assert.equal(JSON.stringify(s), before);
  });
});

describe('读取点（B3）', () => {
  it('API 品牌读 modifier(apiBrand)（来源是路线）；中国公司出海系数按路线', () => {
    const s = fresh('qwen', 'y2024');
    const brand = {}, oversea = {};
    for (const st of STANCES) {
      setStance(s, st, { src: 'start' });
      assert.equal(E.modifier(s, 'apiBrand'), STANCE[st].mods.apiBrand, st);
      brand[st] = playerBrand(s, 'api', 'CN');
      oversea[st] = playerBrand(s, 'chat', 'global') / playerBrand(s, 'chat', 'CN');
    }
    for (const st of STANCES) {
      assert.ok(Math.abs(brand[st] / brand.closed - STANCE[st].mods.apiBrand) < 1e-9, st);
      assert.ok(Math.abs(oversea[st] / oversea.closed - STANCE[st].mods.overseas / 0.15) < 1e-9, st);
    }
  });
  it('API 收入看在线旗舰本身：宽松 ×0.75，受限 ×0.85，闭源 ×1；OpenRouter 按每一款在线模型：宽松 ×2.2，受限 ×1.8', () => {
    const s = fresh('glm', 'y2025');
    s.gpus.owned = { H100: 1e6 };
    s.inferShare = 0.9;
    const m = E.liveModel(s);
    const api = {}, router = {};
    for (const [k, open, license] of [['closed', false, null], ['permissive', true, 'permissive'], ['restrictive', true, 'restrictive']]) {
      Object.assign(m, { open, license });
      const out = simulateService(s, { commit: false });
      assert.equal(out.r429, 0);
      api[k] = out.revenue.api;
      router[k] = usageBoards(s).openrouter.rows.find(x => x.mine && x.name === m.name).value;
    }
    assert.ok(Math.abs(api.permissive / api.closed - 0.75) < 1e-9 && Math.abs(api.restrictive / api.closed - 0.85) < 1e-9, JSON.stringify(api));
    assert.ok(Math.abs(router.permissive / router.closed - 2.2) < 1e-9 && Math.abs(router.restrictive / router.closed - 1.8) < 1e-9, JSON.stringify(router));
    // 没有许可的旧结构不能被静默解释成宽松许可。
    assert.throws(() => licenseOf({ open: true }), /不支持|许可/);
    assert.equal(licenseOf({ open: false, license: 'permissive' }), null);
  });
  it('被别家蒸馏：在线旗舰闭源、离世界最强不到 3 分才会出现；许可之争：在线旗舰开源而且是受限许可才会出现', () => {
    const hits = (s, id) => {
      let n = 0;
      for (let i = 1; i <= 200; i++) {
        const t = clone(s);
        t.rng = i * 7919;
        conditionalEvents(t, {}, { notes: [], costs: { total: 0 }, revenue: 0 });
        if (t.queue.some(q => q.id === id)) n++;
      }
      return n;
    };
    const s = fresh('gpt', 'y2025');
    const m = E.liveModel(s);
    const top = E.worldSota(s).q;
    // 把在线旗舰的综合分挪到“比世界最强低 gap 分”：知识、代码、数学、写作四项权重合计 0.88。
    const at = gap => { const d = (top - gap - E.qOf('llm', m.dims)) / 0.88; for (const k of ['knowledge', 'code', 'math', 'writing']) m.dims[k] += d; };
    at(2.5);
    assert.ok(hits(s, 'distilled_by_others') > 0, '闭源、差 2.5 分');
    m.open = true; m.license = 'permissive';
    assert.equal(hits(s, 'distilled_by_others'), 0, '开源');
    m.open = false;
    at(3.5);
    assert.equal(hits(s, 'distilled_by_others'), 0, '差 3.5 分');
    const l = fresh('llama', 'y2024');
    assert.deepEqual([E.liveModel(l).open, E.liveModel(l).license], [true, 'restrictive']);
    assert.ok(hits(l, 'license_fork') > 0, '受限许可');
    E.liveModel(l).license = 'permissive';
    assert.equal(hits(l, 'license_fork'), 0, '宽松许可');
  });
  it('世界事件的 openBoost 只给旗舰开放权重的路线（受限许可开源、完全开源）', () => {
    const w = { id: 'w_test', date: '2025-01', mod: 'llm', type: 'release', title: '测试', detail: '', effects: { openBoost: 1.3 } };
    for (const st of STANCES) {
      const s = fresh('qwen', 'y2025');
      // P3.T 起 qwen 有本家特质（例如 Apache 许可的 brandGain），这里只测路线的 openBoost，先摘掉。
      s.strategy.spirits = {};
      setStance(s, st, { src: 'start' });
      const b = s.brand;
      applyWorldEvent(s, w);
      assert.ok(Math.abs(s.brand / b - (STANCE[st].flagshipOpen ? 1.3 : 1)) < 1e-9, st);
      assert.equal(openStance(s), STANCE[st].flagshipOpen);
    }
  });
  it('全库读不到 company.open；COMPANIES 没有 open、line、sibling', () => {
    const bad = [];
    for (const f of jsFiles(CAREER)) if (/company\.(open|line|sibling)\b/.test(fs.readFileSync(f, 'utf8'))) bad.push(careerRel(f));
    assert.deepEqual(bad, []);
    for (const c of COMPANIES) for (const k of ['open', 'line', 'sibling']) assert.ok(!(k in c), `${c.id}.${k}`);
  });
});

describe('防蒸馏开关（B3）', () => {
  it('有闭源在线模型才能开严格防蒸馏；月费并进 monthlyCosts；在线模型都开放了就自动回到标准', () => {
    const s = fresh('gpt', 'y2024');
    const base = monthlyCosts(s).total;
    E.setPolicy(s, 'antiDistill', 'strict');
    assert.deepEqual([monthlyCosts(s).risk, monthlyCosts(s).total - base], [ANTI_DISTILL_FEE, ANTI_DISTILL_FEE]);
    E.liveModel(s).open = true;
    assert.throws(() => E.setPolicy(s, 'antiDistill', 'strict'), /用不着防蒸馏/);
    const out = { notes: [] };
    serviceDue(s, out);
    assert.equal(s.service.antiDistill, 'standard');
    assert.equal(monthlyCosts(s).risk, 0);
    assert.equal(out.notes.length, 1);
    // 开源旗舰、闭源小模型在线：开关还在。
    const l = fresh('deepseek', 'y2025');
    const small = E.smallLive(l);
    assert.ok(E.liveModel(l).open && small);
    small.open = false;
    E.setPolicy(l, 'antiDistill', 'strict');
    serviceDue(l, { notes: [] });
    assert.equal(l.service.antiDistill, 'strict');
  });
  it('月结扣的就是这一笔（不再另加）', () => {
    const s = fresh('gpt', 'y2024');
    E.setPolicy(s, 'antiDistill', 'strict');
    let report = null;
    for (let i = 0; i < 40 && !report; i++) { resolveAll(s); report = E.tickDay(s)?.report ?? null; }
    assert.equal(report.costs.risk, ANTI_DISTILL_FEE);
    // 规格 K3：成本里多了前沿研发开支（rd）；推理成本另算在 report.serve。
    assert.equal(report.costs.total, report.costs.staff + report.costs.owned + report.costs.rented + report.costs.rd + report.costs.legal + report.costs.risk);
  });
});

describe('顾问和机器人的开源选项', () => {
  it('机器人和“下一步”大按钮整局发布：顶替旗舰的开闭 = flagshipOpen，副线和小模型 = smallDefault', () => {
    for (const [id, sc] of [['gpt', 'y2023'], ['glm', 'y2023'], ['rwkv', 'y2024'], ['llama', 'y2025'], ['seed', 'y2026']]) {
      for (const play of [playGame, playAdvised]) {
        const { s, errors } = play(id, sc, 1);
        assert.deepEqual(errors, [], `${id} ${sc}`);
        const mine = s.models.filter(m => m.stage === 'released' && !m.hist && !m.openAt);
        for (const m of mine) { const st = stanceAt(s, id, sc, m.releasedDay); assert.equal(m.open, E.relRole(m) === 'flagship' ? st.flagshipOpen : st.smallDefault, `${id} ${sc} ${play.name} ${m.name} ${m.line}`); }
      }
    }
  });
});
