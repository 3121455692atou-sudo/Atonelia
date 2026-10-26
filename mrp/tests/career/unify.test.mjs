// P0.3b 行为重构（规格 E1、E3、E4、E6、E7、E9）：计时器存到期日、在 tickDay 结算；立案只有一个入口 openCase；股价冲击一律累加；
// 品牌统一夹在 0.02–12；s.done 拆成 s.seen 和 s.marks；董事会目标的队列项叫 board、宽限时留 g.due0；两条引擎提示是 notice；
// 历史时刻死路径删除、里程碑里史实那几项的效果走 applyEffects；setLease、setTier、setSmallApi 三个服务命令；
// 蒸馏预览的 kcap 偏移和 computeCaps 统一读 kcapOffset(k)。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import { applyEffects, validateEffects } from '../../src/career/sim/effects.js';
import { openCase, legalTick, CASE_COOL_DAYS } from '../../src/career/sim/legal.js';
import { previewDistill, knowledgeCap, computeCaps, distillTeachers } from '../../src/career/sim/model.js';
import { publishPapers } from '../../src/career/sim/research.js';
import { noticeOf } from '../../src/career/sim/queue.js';
import { initComputeLedger } from '../../src/career/sim/economy.js';
import { addDays } from '../../src/career/sim/clock.js';
import { kcapOffset } from '../../src/career/data/balance.js';
import { HISTORY_FACTS } from '../../src/career/data/history_facts.js';
import { histInfo } from '../../src/career/data/history.js';
import { MODALITIES } from '../../src/career/data/core.js';
import { resolveAll, advance } from '../helpers/career_bot.mjs';
import * as L from '../helpers/legacy_jobs.mjs';

const game = (id = 'deepseek', sc = 'y2025', seed = 7) => { const s = E.createGame(id, sc, seed); resolveAll(s); return s; };
const push = (s, id, params = {}) => s.queue.unshift({ kind: 'event', id, params });
const read = p => fs.readFileSync(new URL(`../../src/career/${p}`, import.meta.url), 'utf8');
// 只走时间、不处理事件（事件留在队列里时 tickDay 不走，所以先清队列）。tickDay 结算的是“今天”（s.day）：
// 到期日是 D 的计时器，在 s.day 走到 D 以后的那一次 tickDay 一早结算。
const days = (s, n) => { for (let i = 0; i < n; i++) { s.queue = []; E.tickDay(s); } };

describe('计时器存到期日，在 tickDay 结算', () => {
  it('融资 60 天后出结果：到期那天一早出结果，之前一直在谈', () => {
    const s = game('kimi', 'y2025');
    const d0 = s.day;
    E.startFunding(s, 0.15);
    assert.equal(s.due.funding, addDays(d0, 60));
    assert.ok(!('left' in s.capital.round));
    days(s, 60);
    assert.equal(s.day, s.due.funding);
    assert.ok(s.capital.round, '到期日当天的结算还没走');
    days(s, 1);
    assert.equal(s.capital.round, null);
    assert.ok(!('funding' in s.due));
  });
  it('上市 90 天后挂牌；开局就在招股的（港股 2026）30 天后、开局当月月底挂牌', () => {
    const s = game('kimi', 'y2025');
    s.valuation = 5e9; s.date = '2024-07'; s.day = '2024-07-10';
    // 夹具把日期移到上市申请日，同时显式建该月当前账本，不依赖旧档估算。
    s.computeLedger = initComputeLedger(s.date);
    E.startIpo(s);
    assert.equal(s.due.ipo, '2024-10-08');
    days(s, 90);
    assert.ok(!s.capital.listed);
    days(s, 1);
    assert.ok(s.capital.listed && !s.capital.ipo);
    const g = E.createGame('glm', 'y2026', 1);
    assert.equal(g.due.ipo, '2026-01-31');
    assert.ok(!('left' in g.capital.ipo));
  });
  it('备案 60 天出结果；被要求下架的对话产品到期重新上架', () => {
    const s = game('kimi', 'y2024', 3);
    s.service.filing = 'none';
    s.products.chat.on = false;
    for (const m of s.models) m.dims.safety = 80;
    const r = E.setProduct(s, 'chat', { on: true });
    assert.match(r.note, /已提交备案/);
    assert.equal(s.due.filing, addDays(s.day, 60));
    days(s, 60);
    assert.equal(s.service.filing, 'pending');
    days(s, 1);
    assert.equal(s.service.filing, 'done');
    assert.equal(s.products.chat.on, true);
    s.products.chat.on = false;
    s.due.chatBan = addDays(s.day, 1);
    days(s, 1);
    assert.equal(s.products.chat.on, false);
    days(s, 1);
    assert.equal(s.products.chat.on, true);
    assert.ok(!('chatBan' in s.due));
  });
  it('事件定的限时状态按天计：挖人 180 天、昇腾适配 90 天、对手偷蒸馏 180 天；到期那天起失效，过期的条目删掉', () => {
    const s = game('deepseek', 'y2025');
    const train = E.trainFlops(s);
    push(s, 'poach', { n: 3 });
    E.resolveEvent(s, 'let_go');
    assert.equal(s.due.poach, addDays(s.day, 180));
    assert.ok(E.trainFlops(s) < train);
    push(s, 'export_ban', { gpus: 'H20' });
    s.cash = 1e12;
    E.resolveEvent(s, 'ascend');
    assert.equal(s.due.adapt, addDays(s.day, 90));
    push(s, 'distilled_by_others');
    E.resolveEvent(s, 'ignore');
    assert.equal(s.due.leak, addDays(s.day, 180));
    push(s, 'distilled_by_others');
    E.resolveEvent(s, 'sue');
    assert.ok(!('leak' in s.due), '发律师函立刻止住');
    s.due.poach = addDays(s.day, 1);
    s.due.adapt = addDays(s.day, 1);
    days(s, 1);
    assert.ok(!(s.due.poach > s.day) && !(s.due.adapt > s.day), '到期那天起失效');
    days(s, 1);
    assert.ok(!('poach' in s.due) && !('adapt' in s.due), '过期的条目删掉');
  });
  it('经营事件的冷却记成到期日：出过以后 30 × 月数天内不再出', () => {
    const s = game('deepseek', 'y2025');
    // 开局阵容按日（规格 D2）以后 DeepSeek y2025 在线的是 V3，服务不一定挤爆：把服务卡压到很少，保证每个月 429 都超过 5%，只测冷却。
    s.gpus.owned = { H800: 64 };
    s.gpus.rented = {};
    s.service.hist429 = [0.2, 0.2];
    s.cool = {};
    let fired = 0;
    for (let i = 0; i < 9 && s.status === 'playing'; i++) {
      const start = s.date;
      while (s.date === start && s.status === 'playing') { s.queue = []; s.scheduled = s.scheduled.filter(x => x.item?.id !== 'e429'); s.service.hist429 = [0.2, 0.2]; const before = s.cool.e429; E.tickDay(s); if (s.cool.e429 && s.cool.e429 !== before) { fired++; assert.equal(s.cool.e429, addDays(addDays(s.day, -1), 180)); } }
    }
    assert.equal(fired, 2, '9 个月里 429 事件只出两次（冷却 6 个月）');
  });
  it('源码里不再有按月计数的 timers、cooldowns，也不再在月结里减 left', () => {
    for (const f of ['sim/loop.js', 'sim/events.js', 'sim/legal.js', 'sim/service.js', 'sim/capital.js', 'sim/model.js', 'sim/research.js', 'sim/economy.js', 'sim/effects.js'])
      assert.ok(!/\btimers\b|\bcooldowns\b|\.left -= 1/.test(read(f).replace(/\/\/.*$/gm, '').replace(/c\.left -= 1/, '')), f);
  });
});

describe('立案只有一个入口 openCase', () => {
  it('收到起诉书、直接立案、效果词表的 case 键共用一套规则：在打、在排队或冷却期内都不立；立了进冷却', () => {
    const s = game('gpt', 'y2025');
    assert.equal(openCase(s, 'abuse'), true);
    assert.equal(s.queue[0].params.type, 'abuse');
    assert.equal(s.cool.case_abuse, addDays(s.day, CASE_COOL_DAYS));
    assert.equal(openCase(s, 'abuse'), false, '冷却期内不再立');
    assert.equal(openCase(s, 'class', { now: true, mult: 1.6 }), true);
    assert.equal(s.legal.cases.filter(c => c.type === 'class').length, 1);
    assert.deepEqual(applyEffects(s, { case: { type: 'class' } }, { source: 'event', id: 't' }), [], '同类在打，不再立');
    s.legal.cases = [];
    assert.deepEqual(applyEffects(s, { case: { type: 'class' } }, { source: 'event', id: 't' }), [], '冷却期内，不再立');
    delete s.cool.case_class;
    assert.equal(applyEffects(s, { case: { type: 'class' } }, { source: 'event', id: 't' }).length, 1);
    // 公关翻车选“否认”：集体诉讼也走同一个入口，冷却期内不会叠第二起。
    push(s, 'exposed');
    E.resolveEvent(s, 'deny');
    assert.equal(s.legal.cases.filter(c => c.type === 'class').length, 1);
    assert.ok(!/openCaseNow/.test(read('sim/legal.js') + read('sim/events.js') + read('sim/effects.js')));
  });
});

describe('股价冲击一律累加', () => {
  it('同一个月里两次冲击相加，不会后一次盖掉前一次；只对上市公司生效', () => {
    const s = game('glm', 'y2026');
    s.capital.listed = s.capital.listed || { ticker: 'X', market: '港交所', shares: 1e9, price: 1, ipoPrice: 1, pop: 1, history: [] };
    s.flags.stockShock = 0;
    s.legal.cases = [{ type: 'books', title: '测试', claim: 1, winp: 0, left: 1, fee: 0, opened: s.date, fighting: true }];
    applyEffects(s, { stockShock: { self: -0.05 } }, { source: 'event', id: 't' });
    legalTick(s, { notes: [] });
    assert.ok(Math.abs(s.flags.stockShock - -0.13) < 1e-12, String(s.flags.stockShock));
    push(s, 'exposed');
    E.resolveEvent(s, 'deny');
    assert.ok(Math.abs(s.flags.stockShock - -0.28) < 1e-12, String(s.flags.stockShock));
    const p = game('kimi', 'y2025');
    p.flags.stockShock = 0;
    applyEffects(p, { stockShock: { self: -0.1 } }, { source: 'event', id: 't' });
    assert.equal(p.flags.stockShock, 0, '没上市的不记');
  });
});

describe('品牌统一夹在 0.02–12', () => {
  it('效果词表、经营事件、发表论文、发布都夹在 12 以内', () => {
    const s = game('gpt', 'y2025');
    s.brand = 11.5;
    applyEffects(s, { brand: 1.3 }, { source: 'event', id: 't' });
    assert.equal(s.brand, 12);
    s.brand = 11.9;
    push(s, 'viral', { bench: 'X' });
    E.resolveEvent(s, 'ride');
    assert.equal(s.brand, 12);
    s.brand = 11.99;
    s.firsts = { fp8: s.day };
    s.papers = {};
    publishPapers(s, ['fp8']);
    assert.equal(s.brand, 12);
    s.brand = 0.03;
    applyEffects(s, { brand: 0.1 }, { source: 'event', id: 't' });
    assert.equal(s.brand, 0.02);
    // 直接乘品牌的写法只剩 reputation.js 的月度结算（那里本来就夹）；其余都走 scaleBrand 或 applyEffects。
    for (const f of ['sim/events.js', 'sim/board.js', 'sim/research.js', 'sim/world.js', 'sim/release.js', 'sim/milestone_view.js', 'sim/super.js'])
      assert.ok(!/s\.brand \*=|s\.brand = /.test(read(f)), f);
  });
});

describe('s.done 拆成 s.seen 和 s.marks', () => {
  it('处理过的经营事件记次数；榜单登顶、被告蒸馏、超事件记标记；里程碑和超事件不记进 seen', () => {
    const s = game('deepseek', 'y2025');
    assert.ok(!('done' in s));
    push(s, 'tavern');
    E.resolveEvent(s, E.currentEvent(s).choices[0].id);
    push(s, 'tavern');
    E.resolveEvent(s, E.currentEvent(s).choices[0].id);
    assert.equal(s.seen.tavern, 2);
    push(s, 'distill_ban', { family: 'gpt' });
    E.resolveEvent(s, 'admit');
    assert.equal(s.marks.ban_gpt, s.day);
    assert.equal(E.dataOptions(s).find(o => o.id === 'distill:gpt')?.ok ?? false, false);
    assert.ok(E.cond(s, { seen: 'tavern' }) && !E.cond(s, { seen: 'e429' }));
  });
});

describe('董事会目标：队列项叫 board，宽限时留 g.due0', () => {
  it('开局每个目标都有 due0；到期月 1 号排进 { kind: board }；宽限挪日期，due0 不动', () => {
    const s = game('kimi', 'y2025');
    const g = s.goals.find(x => x.check.type !== 'final');
    assert.ok(s.goals.every(x => x.due0 === x.date));
    while (s.date < g.date) days(s, 1);
    s.queue = s.queue.filter(q => q.kind === 'board');
    assert.deepEqual(s.queue[0], { kind: 'board', id: g.id });
    const before = g.date;
    g.check = { type: 'revenue', min: 1e15 };
    const r = E.resolveEvent(s, 'check');
    assert.equal(r.outcome, 'grace');
    assert.equal(g.due0, before);
    assert.notEqual(g.date, before);
  });
});

describe('引擎提示是 notice；旧版历史时刻删除', () => {
  it('预训练完成弹的是 notice，不记进 seen', () => {
    const s = game('gpt', 'y2025');
    L.startProject(s, { total: 1.5, active: 1.5, arch: 'dense', tokens: 0.03 });
    const seen = [];
    for (let i = 0; i < 40 && E.hasBaseJob(s); i++) advance(s, 1, ev => { seen.push(`${ev.kind}:${ev.title}`); return null; });
    assert.ok(seen.includes('notice:预训练完成'), seen.join(' / '));
    assert.ok(!('first_release_hint' in s.seen));
    const n = noticeOf(s, 'small_ready', { small: '小 G', total: 3, active: 3, costRatio: '5%' });
    assert.equal(n.kind, 'notice');
    assert.match(n.text, /小 G 蒸馏完成：总参数 3B/);
  });
  it('history 不再是认得的事件种类；史实选项的效果都在词表内，由 applyEffects 结算', () => {
    const s = game('claude', 'y2024');
    const old = structuredClone(s); old.queue.push({ kind: 'history', id: 'personal_claude_trio' });
    const before = JSON.stringify(old), r = E.migrateGame(old);
    assert.equal(r.ok,false); assert.match(r.reason,/请新开一局/);
    assert.equal(JSON.stringify(old),before);
    assert.ok(!/applyHistoryChoice|applyHistEffects|HISTORY\b/.test(read('sim/queue.js') + read('sim/milestone_view.js')));
    assert.ok(!/export const HISTORY\b|function effectsFrom|function hintOf|const DEFAULT/.test(read('data/history.js')));
    for (const f of HISTORY_FACTS) for (const mod of Object.keys(MODALITIES)) for (const c of histInfo(f.id, mod).choices) validateEffects(c.effects, { source: 'milestone' });
    // 迟到效果按词表结算：在研项目推迟、集群健康、品牌（夹逼）、士气。
    const fact = HISTORY_FACTS.find(f => f.choices.some(c => c.effects?.readiness));
    const ch = histInfo(fact.id, 'llm').choices.find(c => c.effects.health);
    const h0 = s.health = 50;
    applyEffects(s, ch.effects, { source: 'milestone', id: 't' });
    assert.equal(s.health, h0 + ch.effects.health);
  });
});

describe('服务命令：setLease、setTier、setSmallApi', () => {
  it('出租张数按手里实际的卡数钳制；负数当 0；坏值报错', () => {
    const s = game('gpt', 'y2025');
    const n = E.gpuCount(s);
    assert.equal(E.setLease(s, n + 5000).gpus, n);
    assert.equal(E.leaseGpus(s), n);
    assert.equal(E.setLease(s, -3).gpus, 0);
    assert.equal(E.setLease(s, 1000.7).gpus, 1000);
    assert.throws(() => E.setLease(s, NaN), /出租显卡数量无效/);
    assert.throws(() => E.setLease(s, '64'), /出租显卡数量无效/);
  });
  it('setTier 只认产品和三档价格，smallTier 只有 API 有；setSmallApi 只认开关', () => {
    const s = game('deepseek', 'y2025');
    E.setTier(s, 'api', 'premium');
    assert.equal(s.products.api.tier, 'premium');
    E.setTier(s, 'api', 'standard', 'smallTier');
    assert.equal(s.products.api.smallTier, 'standard');
    assert.throws(() => E.setTier(s, 'api', 'free'), /未知的价格档位/);
    assert.throws(() => E.setTier(s, 'chat', 'budget', 'smallTier'), /未知的价格设置/);
    assert.throws(() => E.setTier(s, 'nope', 'budget'), /没有这个产品/);
    E.setSmallApi(s, false);
    assert.equal(s.products.api.small, false);
    assert.throws(() => E.setSmallApi(s, 'no'), /开或关/);
  });
});

describe('蒸馏预览的 kcap 偏移和 computeCaps 统一读 kcapOffset(k)', () => {
  it('学生容量小、老师很强时，各维度卡在 kcap + 6（知识）/ kcap + 14（其他）', () => {
    const s = game('deepseek', 'y2025');
    const t = distillTeachers(s).find(t => t.own);
    assert.ok(t, '当前新局的自家老师快照');
    // P1.2 换成规格 D7 的学生差距（1.5B、1T 时约 41 分），老师写得足够强，才看得到 kcap 卡住。
    const pv = previewDistill(s, { teacher: 'x', total: 1.5, active: 1.5, arch: 'dense', tokens: 1 }, { teacher: { ...t, dims: Object.fromEntries(Object.keys(t.dims).map(k => [k, 199])) } });
    assert.equal(pv.kcap, knowledgeCap(1.5, Math.max(E.poolStats(s).quality, 1.6)));
    for (const [k, v] of Object.entries(pv.dims)) if (k !== 'safety') assert.equal(v, Math.round(Math.min(95, pv.kcap + kcapOffset(k)) * 10) / 10, k);
    const caps = computeCaps(s, { mod: 'llm', base: Object.fromEntries(Object.keys(pv.dims).map(k => [k, 90])), kcap: pv.kcap });
    for (const [k, v] of Object.entries(caps)) if (k !== 'safety') assert.equal(v, Math.min(99, pv.kcap + kcapOffset(k)), k);
    assert.ok(!/k === 'knowledge' \? (4|6) : (12|14)/.test(read('sim/model.js')));
  });
});
