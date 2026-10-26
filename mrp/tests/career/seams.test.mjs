// v1.0 的接缝（P0.3a）：钩子的位置和顺序、存根不改状态、路线只有一条写入口、balance.js 和规格 §1.3 一致、
// 读档框架（migrateGame 的返回值、永不抛错、特性步骤登记）、事件种类登记、公司文件登记表、事件视图登记表。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as E from '../../src/career/engine.js';
import * as balance from '../../src/career/data/balance.js';
import { COMPANIES } from '../../src/career/data/core.js';
import { COMPANY_FILES, GENERIC_FILES, companyFile, treeFor } from '../../src/career/data/companies/index.js';
import { CORE_TREES } from '../../src/career/data/strategy_core.js';
import { setStance } from '../../src/career/sim/route.js';
import { initExpect, judgeRelease, judgeDeferred, expectPreview } from '../../src/career/sim/expect.js';
import { pickStrategy, wantsDistill, shouldHold, scoreNode } from '../../src/career/sim/strategy_ai.js';
import { sotaWouldTake, labelOnRival } from '../../src/career/sim/sota.js';
import { registerKind, knownQueueItem, fire, milestoneFire } from '../../src/career/sim/queue.js';
import { SAVE_VERSION } from '../../src/career/sim/migrate.js';
import { CAREER, jsFiles, careerRel } from '../helpers/imports.mjs';
import { playGame, resolveAll } from '../helpers/career_bot.mjs';
import { clone } from '../helpers/career_util.mjs';

const read = rel => fs.readFileSync(path.join(CAREER, rel), 'utf8');
const SPEC = fs.readFileSync(new URL('../../docs/spec/v1.0-spec.md', import.meta.url), 'utf8');
// 一段源码里几个调用按顺序出现（各取第一次出现的位置）。
function inOrder(src, names, where) {
  let at = -1;
  for (const n of names) {
    const i = src.indexOf(n, at + 1);
    assert.ok(i > at, `${where}：${n} 没有出现在 ${names[names.indexOf(n) - 1] ?? '开头'} 之后`);
    at = i;
  }
}
const body = (src, head) => { const i = src.indexOf(head); assert.ok(i >= 0, head); const j = src.indexOf('\nexport ', i + head.length); return src.slice(i, j < 0 ? undefined : j); };

describe('钩子：位置和顺序（规格 F2 的 P0.3a 行）', () => {
  it('createGame：开局阵容之后 initSota → initExpect→ initRoute → initMilestones → initStrategy → initNaming', () => {
    const src = body(read('sim/game.js'), 'export function createGame(');
    inOrder(src, ['startLineup(company', 'initSota(s)', 's.expect = initExpect()', 'initRoute(s)', 'initMilestones(s)', 'initStrategy(s)', 'initNaming(s)'], 'createGame');
  });
  it('releaseNow（P2.4a 起的发布流程）：起名 → 建快照 → labelOnRelease → judgeRelease → afterRelease（里程碑、专属事件），小模型和旗舰两条路径都是；评完发布和跳过评测都走它', () => {
    const src = body(read('sim/release.js'), 'export function releaseNow(');
    const [small, main] = src.split('const line = releaseLine(s, ev.cand');
    inOrder(small, ['dedupeName(s, plan.name, sw.id)', "sw.stage = 'released'", 'labelOnRelease(s, sw)', 'judgeRelease(s, sw, lab)', "milestoneFire(s, { on: 'release', model: sw })", 'exclusiveAfterRelease(s, sw'], '小模型发布');
    inOrder(main, ['dedupeName(s, plan.name, ev.cand.id)', 'const snap = ', 'labelOnRelease(s, snap)', 'judgeRelease(s, snap, lab)', "milestoneFire(s, { on: 'release', model: snap })", 'exclusiveAfterRelease(s, snap'], '旗舰发布');
    const ev = read('sim/evals.js');
    assert.match(body(ev, 'export function submitEval('), /if \(tier === 'skip'\) return releaseNow\(s, \{ ev \}\)/, '跳过评测当天走 releaseNow');
    assert.match(body(ev, 'export function evalTick('), /releaseNow\(s, \{ ev \}\)/, '评完发布走 releaseNow');
    // doRelease 在 P4.1 从引擎里删了（测试辅助 legacy_jobs.mjs 里留着同样的写法）：引擎里不能再有它。
    assert.ok(!read('sim/release.js').includes('export function doRelease('), 'doRelease 已删');
  });
  it('tickDay：研究推进之后 strategyTick、routeTick；monthClose：exclusiveMonth、特质到期；对手发布：labelOnRival → judgeDeferred → 里程碑', () => {
    const src = read('sim/loop.js');
    inOrder(body(src, 'export function tickDay('), ['researchTick(s, 1)', 'strategyTick(s, out)', 'routeTick(s, out)', 'baseTick(', 'evalTick(s, out)', 'dailyDeploy(s, out)'], 'tickDay');
    inOrder(src.slice(src.indexOf('function monthClose(')), ["milestoneFire(s, { on: 'month' })", 'exclusiveMonth(s, report)', 'expireSpirits(s, report)'], 'monthClose');
    inOrder(src.slice(src.indexOf('function releaseDue(')), ['labelOnRival(s, rel)', 'judgeDeferred(s)', "milestoneFire(s, { on: 'rival', rel })"], '对手发布');
  });
  it('存根不往状态里写东西：boosts 这些还没落地的字段不写；结构版本到 4 以后新存档记成特性步骤都执行过', () => {
    // P1.1 落地以后 initSota 写 s.sota 和 s.world（跟随者钳制量），发布写 m.sota、line；P1.3 落地以后 initRoute 写 s.route；
    // P2.2 落地以后 initStrategy 写 s.strategy（有策略树）；P3.E 落地以后 ensureExpect 写 s.expect。其余各包还是存根。
    const s = E.createGame('deepseek', 'y2025', 1);
    for (const k of ['boosts']) assert.ok(!(k in s), `开局就有 s.${k}`);
    assert.deepEqual(s.expect, initExpect(), '开局就有 s.expect');
    assert.equal(s.strategy?.tree, 'deepseek', '开局就有策略树（P3.D 起 DeepSeek 用自己的史实树）');
    assert.ok(s.sota && s.world?.adj, '开局就有 s.sota 和 s.world.adj');
    assert.deepEqual(s.route, { stance: 'open_restricted', license: 'restrictive', since: s.day, by: 'start' });
    assert.equal(Object.hasOwn(s,'mig'), false, '新局不再携带迁移标记');
    const { s: end } = playGame('suno', 'y2023', 2);
    assert.ok(end.expect, '整局后有 s.expect');
    assert.ok(end.models.filter(m => m.hist).every(m => !('expect' in m) && !('badges' in m)), '开局继承的型号不评');
    assert.ok(end.models.filter(m => m.stage === 'released').every(m => ['main', 'side'].includes(m.line)), '已发布的快照都记了 line');
  });
  it('接口：期待初始化、发布判定、推迟判定和预告都已经是真实现；SOTA（P1.1）、路线（P1.3）、公司策略（P2.2）已经落地', () => {
    const s = E.createGame('gpt', 'y2024', 1);
    assert.deepEqual(initExpect(), { lastJudged: { flagship: null, small: null }, cool: {}, hot: null, worksDay: null, pending: null, ask: null, log: [] });
    assert.equal(judgeRelease(s, E.liveModel(s), null), null, '开局继承的型号不评');
    assert.equal(judgeDeferred(s), null, '没有推迟的判定');
    assert.ok(expectPreview(s, E.workingModel(s)), '发布面板拿得到预告');
    // SOTA 部分 P1.1 已经落地：GPT 2024 开局时标签挂在继承的 GPT-4 Turbo 上，99 分这一版发布就能接过；不是对手发布的东西不过标签规则。
    assert.equal(sotaWouldTake(s, 99), true);
    assert.deepEqual(labelOnRival(s, {}), { changed: false, filled: false, defended: false, text: '' });
    // 公司策略（P2.2）已经落地：顾问挑得出下一项；GPT 炼出过 SOTA，从不蒸馏；期待还是存根，不会“再练一阵”；g_sota 自动完成，不能手动开始。
    assert.ok(pickStrategy(s));
    assert.equal(wantsDistill(s), false);
    assert.equal(shouldHold(s), false);
    assert.equal(scoreNode(s, {}, 'adaptive'), 0);
    assert.ok(E.strategyOptions(s).some(o => o.id === 'g_sota' && o.state === 'done'));
    resolveAll(s);
    assert.throws(() => E.startStrategy(s, 'g_sota'), /自动完成/);
    // 路线（P1.3）已经落地：GPT 2024 开局闭源，旗舰不开放权重。
    assert.deepEqual(E.releaseOpenRule(s, 'flagship'), { open: false, license: null, why: '路线：闭源 → 旗舰不开放权重' });
  });
});

describe('路线只有一条写入口 setStance', () => {
  it('静态：只有 sim/strategy.js、sim/game.js 能调用 setStance（定义在 sim/route.js），别处也不能直接写 s.route.stance', () => {
    const ALLOWED = new Set(['sim/route.js', 'sim/strategy.js', 'sim/game.js']);
    const files = jsFiles(CAREER);
    assert.ok(files.length > 80, `只扫到 ${files.length} 个文件`);
    const bad = [];
    for (const f of files) {
      const rel = careerRel(f);
      if (ALLOWED.has(rel)) continue;
      const src = fs.readFileSync(f, 'utf8');
      if (/\bsetStance\s*\(/.test(src)) bad.push(`${rel} 调用了 setStance`);
      if (/\bs\.route\.stance\s*=(?!=)/.test(src)) bad.push(`${rel} 直接写了 s.route.stance`);
    }
    assert.deepEqual(bad, []);
    // 扫描器自己要认得这两种写法。
    assert.ok(/\bsetStance\s*\(/.test("setStance(s, 'open', { src: 'start' })") && /\bs\.route\.stance\s*=(?!=)/.test("s.route.stance = 'open'") && !/\bs\.route\.stance\s*=(?!=)/.test("s.route.stance === 'open'"));
  });
  it('运行时：来源不是 strategy、start、migration 就抛错；路线必须是五档之一', () => {
    const s = E.createGame('qwen', 'y2024', 1);
    for (const src of ['event', 'effects', undefined]) assert.throws(() => setStance(s, 'open', { src }), /只能由/);
    assert.throws(() => setStance(s, 'wide_open', { src: 'start' }), /没有这一档/);
    setStance(s, 'open_restricted', { src: 'start', license: 'restrictive' });
    assert.deepEqual(s.route, { stance: 'open_restricted', license: 'restrictive', since: s.day, by: 'start' });
  });
});

describe('data/balance.js 按规格 §1.3 一次写全', () => {
  it('每个常量都和规格里的代码块一模一样；原来写在 model.js 顶部的常量改成从这里导入', async () => {
    const block = SPEC.slice(SPEC.indexOf('### 1.3 ')).match(/```js\n([\s\S]*?)```/)[1];
    const spec = await import(`data:text/javascript,${encodeURIComponent(block)}`);
    assert.deepEqual(Object.keys(balance).sort(), Object.keys(spec).sort());
    for (const k of Object.keys(spec)) {
      if (typeof spec[k] === 'function') assert.equal(String(balance[k]), String(spec[k]), k);
      else assert.deepEqual(balance[k], spec[k], k);
    }
    for (const k of ['KNOW_PRETRAIN', 'REPEAT_RSTAR', 'MAX_EPOCHS', 'DISTILL_MIN_DAYS']) assert.equal(E[k], balance[k], `${k} 要从 balance.js 来`);
    assert.ok(!/export const (KNOW_PRETRAIN|REPEAT_RSTAR|MAX_EPOCHS|DISTILL_MIN_DAYS)\b/.test(read('sim/model.js')), 'model.js 里不再自己定义');
    assert.deepEqual([balance.kcapOffset('knowledge'), balance.kcapOffset('code')], [6, 14]);
  });
});

describe('读档框架（规格 E8）', () => {
  it('migrateGame 拒绝全部 6 份 v3 夹具，原档不动', () => {
    const dir = new URL('../fixtures/saves/', import.meta.url);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('.'));
    assert.equal(files.length, 6);
    for (const f of files) {
      const raw = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')), before = JSON.stringify(raw);
      const r = E.migrateGame(raw);
      assert.equal(r.ok, false, f);
      assert.match(r.reason, /不支持旧版.*请新开一局/);
      assert.deepEqual(r.notes, []);
      assert.equal(JSON.stringify(raw), before, `${f}：原档被改了`);
      assert.equal(r.s, undefined);
    }
  });
  it('永不抛错：500 份随机垃圾都返回 ok:false 和原因', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const atoms = [null, undefined, 0, -1, NaN, '', 'x', true, [], {}, '2025-01', 'deepseek', 3, 4, 99];
    const junk = d => {
      const k = rnd();
      if (d > 2 || k < 0.4) return atoms[Math.floor(rnd() * atoms.length)];
      if (k < 0.6) return Array.from({ length: Math.floor(rnd() * 4) }, () => junk(d + 1));
      const o = {};
      for (const key of ['charId', 'date', 'day', 'models', 'queue', 'orders', 'v', 'scheduled', 'flags', 'gray', 'project', 'published', 'ms', 'data', 'products'].filter(() => rnd() < 0.5)) o[key] = junk(d + 1);
      return o;
    };
    // 读档面对的是 JSON 原文：用普通的深拷贝造坏存档（career_util 的 clone 会装上读写旧字段报错的取值器）。
    const base = JSON.parse(JSON.stringify(E.createGame('kimi', 'y2026', 1)));
    let ok = 0;
    for (let i = 0; i < 500; i++) {
      // 一半是纯垃圾，一半是在真存档上随机弄坏几个字段。
      const raw = i % 2 ? junk(0) : Object.assign(JSON.parse(JSON.stringify(base)), { [['models', 'queue', 'scheduled', 'orders', 'flags', 'gray', 'project', 'published', 'data', 'v'][i % 10]]: junk(1) });
      let r;
      assert.doesNotThrow(() => { r = E.migrateGame(raw); }, `第 ${i} 份`);
      assert.equal(typeof r.ok, 'boolean');
      assert.ok(Array.isArray(r.notes));
      if (r.ok) { ok++; assert.ok(E.validateGame(r.s)); } else assert.ok(typeof r.reason === 'string' && r.reason.length > 0);
    }
    assert.ok(ok < 500);
  });
  it('当前 v5 精确版本；缺失、旧版与未知版本均不迁移', () => {
    assert.equal(SAVE_VERSION, 5);
    const s=E.createGame('glm','y2024',1);
    for(const v of [undefined,0,2,3,4,6,'5',null]) {
      const raw=JSON.parse(JSON.stringify(s)); if(v===undefined)delete raw.v;else raw.v=v;
      const before=JSON.stringify(raw),r=E.migrateGame(raw);
      assert.equal(r.ok,false);assert.match(r.reason,/请新开一局/);assert.equal(JSON.stringify(raw),before);
    }
    const r=E.migrateGame(s);assert.equal(r.ok,true,r.reason);assert.deepEqual(r.s,s);
  });
  it('生产源没有结构升级/特性步骤目录，新局没有迁移标记', () => {
    assert.equal(fs.existsSync(path.join(CAREER,'sim/migrations')),false);
    assert.equal(Object.hasOwn(E.createGame('gpt','y2024',1),'mig'),false);
  });
  it('未知队列/排期拒绝整份档，不静默删除内容', () => {
    for(const corrupt of [s=>s.queue.push({kind:'mystery',id:'x'}),s=>s.scheduled.push({at:s.day,world:'w_nope'})]) {
      const s=E.createGame('claude','y2024',1);corrupt(s);const before=JSON.stringify(s),r=E.migrateGame(s);
      assert.equal(r.ok,false);assert.match(r.reason,/未知|损坏/);assert.equal(JSON.stringify(s),before);assert.deepEqual(r.notes,[]);
    }
  });
});

describe('事件种类登记、fire', () => {
  it('registerKind：登记过的种类由它自己显示和结算；内置种类不能重复登记', () => {
    const s = E.createGame('gpt', 'y2025', 1);
    resolveAll(s);
    let resolved = null;
    registerKind('test_kind', {
      view: (st, q) => ({ kind: 'test_kind', tag: '测试', title: `测试 ${q.id}`, text: '', lines: [], choices: [{ id: 'a', label: '好', hint: '' }] }),
      resolve: (st, q, c) => { resolved = c; return '结算了'; },
      known: (st, q) => q.id === 'ok',
    });
    assert.ok(knownQueueItem(s, { kind: 'test_kind', id: 'ok' }));
    assert.ok(!knownQueueItem(s, { kind: 'test_kind', id: 'bad' }));
    s.queue.push({ kind: 'test_kind', id: 'ok' });
    assert.equal(E.currentEvent(s).title, '测试 ok');
    assert.equal(E.resolveEvent(s, 'a').text, '结算了');
    assert.equal(resolved, 'a');
    assert.equal(s.queue.length, 0);
    assert.throws(() => registerKind('event', { view() {}, resolve() {} }), /内置/);
    assert.throws(() => registerKind('test_kind', { view() {}, resolve() {} }), /已经登记/);
    assert.throws(() => registerKind('half', { view() {} }), /view 和 resolve/);
  });
  it('fire 就是原来的 milestoneFire（弹窗预算是 P1.4 的事）', () => {
    const a = E.createGame('deepseek', 'y2024', 1), b = clone(a);
    fire(a, { on: 'month' });
    milestoneFire(b, { on: 'month' });
    assert.deepEqual(a, b);
  });
});

describe('登记表：公司文件、主干、事件视图', () => {
  it('24 家公司各一个文件，加四棵通用树；文件为 null 时按模态退回通用树', () => {
    assert.deepEqual(Object.keys(COMPANY_FILES).sort(), COMPANIES.map(c => c.id).sort());
    assert.deepEqual(Object.keys(GENERIC_FILES).sort(), ['image', 'llm', 'music', 'speech']);
    for (const c of COMPANIES) {
      const f = companyFile(c.id);
      assert.ok(f && f.tree, c.id);
      if (!COMPANY_FILES[c.id]) assert.equal(treeFor(c.id).id, `_generic_${c.modality}`, c.id);
    }
    for (const [mod, f] of Object.entries(GENERIC_FILES)) assert.equal(f.tree.extends, `core_${mod}`);
    assert.deepEqual(Object.keys(CORE_TREES).sort(), ['core_image', 'core_llm', 'core_music', 'core_speech']);
  });
  it('事件视图：strategy 用完成卡，经营事件可加IPO确认，其余种类仍走对话；drainQueue 按种类找视图', async () => {
    globalThis.document ??= { baseURI: 'http://localhost/' };
    const { viewFor } = await import('../../src/career/ui/views/index.js');
    const { playEvent } = await import('../../src/career/ui/vn.js');
    const { play } = await import('../../src/career/ui/views/strategy.js');
    assert.equal(viewFor('strategy'), play);
    assert.notEqual(viewFor('strategy'), playEvent);
    assert.notEqual(viewFor('event'), playEvent, '经营事件包装器只为IPO增加独立确认');
    assert.equal(viewFor('notice'), playEvent);
    assert.equal(viewFor('unknown'), playEvent);
    assert.match(read('ui/views/index.js'), /strategy/);
    assert.match(read('ui/views/strategy.js'), /export async function play/);
    assert.match(read('ui/flow.js'), /viewFor\(view\.kind\)\(S, view\)/);
  });
});
