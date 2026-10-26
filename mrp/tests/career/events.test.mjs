// 经营事件（P2.3，规格 E5、D11.6）：日期抉择已删除，价格战改成看局面，ev_hot_round 和 ev_group_budget，
// CASES.tos 带上厂商参数，license_fork 的新选项，事件选项的 distill 标记。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import { EVENTS, CASES } from '../../src/career/data/events.js';
import { WORLD_EVENTS } from '../../src/career/data/world.js';
import { COMPANIES, START_RESOURCES, PRICE_TIERS, TECH_BY_ID } from '../../src/career/data/core.js';
import { FAMILIES, RELEASES } from '../../src/career/data/rivals.js';
import { EXPECT } from '../../src/career/data/balance.js';
import { conditionalEvents, priceRatio, priceWarDue, HOT_ROUND_FX, GROUP_BUDGET_FX } from '../../src/career/sim/events.js';
import { validateChoice, describeEffects, applyEffects } from '../../src/career/sim/effects.js';
import { addDays, daysBetween } from '../../src/career/sim/clock.js';
import { knownQueueItem, fire } from '../../src/career/sim/queue.js';
import { projectRisk } from '../../src/career/sim/model.js';
import { initExpect } from '../../src/career/sim/expect.js';
import { SPIRITS } from '../../src/career/data/spirits.js';
import { wantsDistill } from '../../src/career/sim/strategy_ai.js';
import { playGame, resolveAll, advance } from '../helpers/career_bot.mjs';
import { clone, jumpTo } from '../helpers/career_util.mjs';
import { CAREER, jsFiles, careerRel } from '../helpers/imports.mjs';

const fresh = (id, sc, seed = 1) => { const s = E.createGame(id, sc, seed); resolveAll(s); s.queue = []; return s; };
const report = () => ({ notes: [], costs: { total: 0 }, revenue: 0 });
// 月结检查：按月结时的样子跑一遍条件事件（服务数据留空，不触发诉讼）。
const check = s => conditionalEvents(s, {}, report());
const has = (s, id) => s.queue.some(q => q.id === id);
const CN = COMPANIES.filter(c => c.country === 'CN' && c.modality === 'llm');
const SOURCES = jsFiles(CAREER).map(f => [careerRel(f), fs.readFileSync(f, 'utf8')]);
const SIM_NO_MIGRATION = SOURCES.filter(([f]) => /^(sim|data)\//.test(f) && !f.startsWith('sim/migrations/'));
// 把某个价格战局面搭出来：中国公司，价格战世界标记已立，API 开着、标准档。
const warGame = (id = 'ernie', sc = 'y2024') => {
  const s = fresh(id, sc);
  s.world = { ...(s.world || {}), priceWar: true };
  s.products.api.on = true;
  s.products.api.tier = 'standard';
  return s;
};
// hot 记最近一次“超出预期”的发布日，测试只改这一项当前字段。
const setHot = (s, day) => { s.expect.hot = day; };
const hotAgo = (s, n) => setHot(s, addDays(s.day, -n));
const stepDays = (s, n) => { s.day = addDays(s.day, n); s.date = s.day.slice(0, 7); };

describe('E5：按日期弹出的抉择已经没有了', () => {
  it('open_question、reasoning_race 的文案、选项、处理代码都删了；世界事件没有 decision 字段', () => {
    assert.equal(EVENTS.open_question, undefined);
    assert.equal(EVENTS.reasoning_race, undefined);
    for (const w of WORLD_EVENTS) assert.ok(!('decision' in w), w.id);
    // 数据和引擎里不再有它们（界面的背景表另算）。
    for (const [f, src] of SIM_NO_MIGRATION) assert.ok(!/open_question|reasoning_race|budgetPromise/.test(src), `${f} 里还有日期抉择的残留`);
  });
  it('引擎里没有“某年某月一到就弹”的写法：不拿日期做相等判断来排事件', () => {
    for (const [f, src] of SOURCES.filter(([f]) => f.startsWith('sim/') && !f.startsWith('sim/migrations/')))
      assert.ok(!/\.date\s*===?\s*'\d{4}-\d{2}'/.test(src), `${f} 里有日期相等的触发`);
  });
  it('旧队列和排期明确拒绝，不静默丢弃 open_question、reasoning_race', () => {
    for (const id of ['open_question', 'reasoning_race']) {
      const s = fresh('gpt', 'y2023');
      assert.equal(knownQueueItem(s, { kind: 'event', id }), false, id);
    }
    const raw = clone(E.createGame('gpt', 'y2023', 1));
    raw.queue.push({ kind: 'event', id: 'open_question' }, { kind: 'event', id: 'reasoning_race' });
    raw.scheduled.push({ at: addDays(raw.day, 9), item: { kind: 'event', id: 'reasoning_race' } });
    const before = JSON.stringify(raw), r = E.migrateGame(raw);
    assert.equal(r.ok, false); assert.match(r.reason, /请新开一局/);
    assert.equal(JSON.stringify(raw), before);
  });
  it('整局玩下来：不出现 open_question、reasoning_race；价格战出现时，局面确实满足条件', () => {
    const games = [['qwen', 'y2023'], ['llama', 'y2023'], ['seed', 'y2024'], ['claude', 'y2025'], ['deepseek', 'y2024'], ['kimi', 'y2023'], ['ernie', 'y2024'], ['minimax', 'y2024'], ['gpt', 'y2023'], ['suno', 'y2023']];
    let wars = 0;
    for (const [c, sc] of games) {
      let cur = null;
      playGame(c, sc, 1, {
        onWeek: s => { cur = s; },
        pick: ev => {
          assert.ok(!['open_question', 'reasoning_race'].includes(ev.id), `${c} ${sc} 弹出了 ${ev.id}`);
          if (ev.id === 'price_war') {
            wars++;
            assert.ok(cur.world?.priceWar && cur.company.country === 'CN' && cur.products.api.on && cur.products.api.tier !== 'budget', `${c} ${sc} 不满足价格战的条件`);
            assert.ok(c !== 'deepseek', 'DeepSeek 是带头降价的，不会被问跟不跟');
          }
          return null;
        },
      });
    }
    assert.ok(wars >= 1, '这几局里一次价格战都没弹，条件可能写死了');
  });
});

describe('E5：开局前已经发生的价格战补成世界标记（createGame）', () => {
  it('2025、2026 年开局的中国 LLM 公司开局就有 priceWar；价格满足条件时当月就弹价格战；y2023、y2024 开局不补', () => {
    for (const sc of ['y2025', 'y2026']) for (const c of ['kimi', 'stepfun', 'glm', 'minimax']) {
      const s = fresh(c, sc);
      assert.equal(s.world?.priceWar, true, `${c} ${sc}`);
      assert.equal(s.world?.hype, undefined, `${c} ${sc}：hype 乘数不补`);
      // 价格满足 E5 的条件：API 开着、旗舰档。2025 年起中国对手的中位数是标准档，旗舰档正好 3 倍。
      s.products.api.on = true;
      s.products.api.tier = 'premium';
      assert.ok(priceRatio(s) >= 3, `${c} ${sc} 倍数 ${priceRatio(s)}`);
      check(s);
      assert.ok(has(s, 'price_war'), `${c} ${sc} 没弹价格战`);
    }
    for (const sc of ['y2023', 'y2024']) for (const c of CN) assert.ok(!fresh(c.id, sc).world?.priceWar, `${c.id} ${sc} 开局不该有价格战标记`);
    // DeepSeek 自己的树（P3.D）在 y2025、y2026 开局前已经做完“价格屠夫”，所以它也有 priceWar；y2023、y2024 还没到。
    for (const sc of ['y2025', 'y2026']) assert.equal(fresh('deepseek', sc).world?.priceWar, true, `deepseek ${sc} 由 ds_price_butcher 写了价格战标记`);
    for (const sc of ['y2023', 'y2024']) assert.ok(!fresh('deepseek', sc).world?.priceWar, `deepseek ${sc}`);
    // 不补的：美国公司，其他模态。
    for (const sc of ['y2025', 'y2026']) for (const c of ['gpt', 'claude', 'suno']) assert.ok(!fresh(c, sc).world?.priceWar, `${c} ${sc}`);
  });
  it('整局推进：kimi y2025 把 API 调到旗舰档，第一个月结就弹价格战（以前开局没有标记，永远不弹）', () => {
    const s = fresh('kimi', 'y2025');
    s.products.api.on = true;
    s.products.api.tier = 'premium';
    const seen = [];
    advance(s, 45, ev => { seen.push(ev.id); return null; });
    assert.ok(seen.includes('price_war'), `45 天里弹过的：${seen.join('、')}`);
    // 对照：同一局把标记拿掉，就不会弹。
    const t = fresh('kimi', 'y2025');
    delete t.world.priceWar;
    t.products.api.on = true;
    t.products.api.tier = 'premium';
    const seen2 = [];
    advance(t, 45, ev => { seen2.push(ev.id); return null; });
    assert.ok(!seen2.includes('price_war'));
  });
});

describe('E5：价格战只在满足条件时弹', () => {
  it('条件逐条：价格战标记、中国公司、API 已开、不在普惠档、价格 ≥ 中国对手中位数的 3 倍', () => {
    const s = warGame();
    // 2024 年初：中国对手的旗舰多数在普惠档（中位数是普惠档），标准档的价格是它的 4 倍。
    assert.equal(priceRatio(s), PRICE_TIERS.standard.mult / PRICE_TIERS.budget.mult);
    assert.equal(priceWarDue(s), priceRatio(s));
    check(s);
    assert.ok(has(s, 'price_war'));
    assert.deepEqual(s.queue.find(q => q.id === 'price_war').params, { ratio: priceRatio(s) });
    // 逐条拿掉。
    const no = (name, f) => { const t = warGame(); f(t); check(t); assert.ok(!has(t, 'price_war'), name); assert.equal(priceWarDue(t), null, name); };
    no('世界标记没立', t => { t.world.priceWar = false; });
    no('没有世界标记', t => { delete t.world.priceWar; });
    no('API 没开', t => { t.products.api.on = false; });
    no('已经在普惠档', t => { t.products.api.tier = 'budget'; });
    // 非中国公司：同一份状态换成美国公司（国别是公司属性）。
    no('美国公司', t => { t.company.country = 'US'; });
    // 价格倍数不到 3 倍：2025 年初中位数是标准档，标准档的价格正好是 1 倍。
    const late = warGame('ernie', 'y2025');
    assert.equal(priceRatio(late), 1);
    check(late);
    assert.ok(!has(late, 'price_war'), '价格只是主流的 1 倍');
    late.products.api.tier = 'premium';
    assert.equal(priceRatio(late), PRICE_TIERS.premium.mult / PRICE_TIERS.standard.mult, '旗舰档是标准档的 3 倍，正好够线');
    check(late);
    assert.ok(has(late, 'price_war'), '正好 3 倍');
  });
  it('倍数是玩家档位价格除以中国对手“在售档位”的中位数；没有中国对手、API 没开时没有倍数', () => {
    const s = warGame('kimi', 'y2024');
    const mults = E.rivalStandings(s).filter(x => FAMILIES[x.rel.family].region === 'cn').map(x => PRICE_TIERS[x.rel.price].mult).sort((a, b) => a - b);
    const n = mults.length, med = n % 2 ? mults[(n - 1) / 2] : (mults[n / 2 - 1] + mults[n / 2]) / 2;
    assert.equal(priceRatio(s), PRICE_TIERS.standard.mult / med);
    s.products.api.tier = 'premium';
    assert.equal(priceRatio(s), PRICE_TIERS.premium.mult / med);
    const us = warGame('gpt', 'y2024');
    us.mod = 'image';
    assert.equal(priceRatio(us), null, '这个模态里没有中国对手');
  });
  it('冷却 12 个月：弹过以后一年内不再弹，满 12 个月且条件还在才会再来', () => {
    const s = warGame();
    s.products.api.tier = 'premium';   // 旗舰档：一整年里倍数都 ≥ 3，条件一直成立
    check(s);
    assert.ok(has(s, 'price_war'));
    const due = s.cool.price_war;
    assert.equal(due, addDays(s.day, 12 * 30));
    s.queue = [];
    for (let i = 0; i < 11; i++) { stepDays(s, 30); check(s); assert.ok(!has(s, 'price_war'), `第 ${i + 1} 个月`); }
    stepDays(s, 30);
    assert.equal(s.cool.price_war, addDays(due, 0));
    assert.ok(s.day >= due, '第 12 个月到期');
    check(s);
    assert.ok(has(s, 'price_war'), '到期以后条件还在，再弹一次');
  });
  it('不会遇到价格战的两种玩家：带头降价的 DeepSeek，已经出过专属事件 ex_ds_price_war 的', () => {
    const ds = warGame('deepseek', 'y2024');
    ds.products.api.tier = 'premium';
    assert.equal(priceWarDue(ds), null, 'DeepSeek 就是 w_pricewar 的 by');
    const s = warGame();
    s.strategy = { ...(s.strategy || {}), ex: { ex_ds_price_war: s.day } };
    assert.equal(priceWarDue(s), null);
    check(s);
    assert.ok(!has(s, 'price_war'));
    // 专属事件和价格战同一天都排上时，fire 的 supersedes 把价格战吞掉（队列、排期都清）。
    const t = warGame();
    t.queue.push({ kind: 'event', id: 'price_war', params: { ratio: 4 } });
    t.scheduled.push({ at: addDays(t.day, 5), item: { kind: 'event', id: 'price_war' } });
    fire(t, { on: 'release', milestones: false, cards: [{ kind: 'exclusive', id: 'ex_ds_price_war', supersedes: { event: ['price_war'] } }] });
    assert.ok(!has(t, 'price_war') && !t.scheduled.some(x => x.item?.id === 'price_war'));
  });
  it('正文不点玩家自家：每家中国公司、几个时间点，正文、选项都没有自家的公司名、产品名和型号名', () => {
    const own = s => {
      const org = E.orgOf(s);
      const fams = Object.keys(FAMILIES).filter(f => FAMILIES[f].org === org && FAMILIES[f].mod === s.mod);
      const names = [s.company.company, ...fams.flatMap(f => [FAMILIES[f].company, FAMILIES[f].name]), ...RELEASES.filter(r => fams.includes(r.family)).map(r => r.name)];
      return [...new Set(names.flatMap(x => String(x).split(/\s*[·/]\s*/)).map(x => x.trim()).filter(x => x.length >= 2))];
    };
    let n = 0;
    for (const c of CN) {
      for (const sc of ['y2024', 'y2025', 'y2026']) {
        const s = warGame(c.id, sc);
        s.queue = [{ kind: 'event', id: 'price_war', params: { ratio: 4 } }];
        const ev = E.currentEvent(s);
        const words = [ev.text, ...ev.choices.flatMap(x => [x.label, x.hint])].join('\n');
        for (const name of own(s)) assert.ok(!words.includes(name), `${c.id} ${sc} 的价格战正文点了自家的“${name}”：${ev.text}`);
        assert.doesNotMatch(words, /\{\w+\}/);
        assert.match(ev.text, /随即跟进/);
        n++;
      }
    }
    assert.ok(n >= 3 * 10);
  });
  it('{lead} 取真正降价的那家：中国对手里定价档最低的那几家中领头的一款；带头降价的那条线在里面就取它', () => {
    const s = warGame('qwen', 'y2025');
    s.queue = [{ kind: 'event', id: 'price_war', params: { ratio: 4 } }];
    const ev = E.currentEvent(s);
    const field = E.rivalStandings(s).filter(x => FAMILIES[x.rel.family].region === 'cn');
    const low = Math.min(...field.map(x => PRICE_TIERS[x.rel.price].mult));
    const cut = field.filter(x => PRICE_TIERS[x.rel.price].mult === low);
    const leader = cut.find(x => FAMILIES[x.rel.family].org === 'deepseek') ?? cut[0];
    assert.ok(ev.text.startsWith(`${leader.rel.name} 把 API 价格降到`), ev.text);
    assert.equal(PRICE_TIERS[leader.rel.price].mult, low);
    // 玩家换成别家，领头的跟着换；玩家自己就是带头的那条线时，价格战问不到他（上一条），正文里也不会有他。
    const t = warGame('kimi', 'y2025');
    t.queue = [{ kind: 'event', id: 'price_war', params: { ratio: 4 } }];
    assert.ok(!/Kimi/.test(E.currentEvent(t).text));
    // 没有人降价（全是标准档）时领头的取最强的那一款，不抛错。
    const u = warGame('ernie', 'y2024');
    for (const x of E.rivalStandings(u)) assert.ok(PRICE_TIERS[x.rel.price]);
  });
  it('选项的结果：跟进 → API 普惠档；全面免费 → 普惠档并且对话产品免费；维持 → 不变', () => {
    const run = (id, pre) => { const s = warGame(); pre?.(s); s.queue = [{ kind: 'event', id: 'price_war', params: { ratio: 4 } }]; E.resolveEvent(s, id); return s; };
    assert.equal(run('follow').products.api.tier, 'budget');
    const free = run('free');
    assert.deepEqual([free.products.api.tier, free.products.chat.free], ['budget', true]);
    const hold = run('hold');
    assert.deepEqual([hold.products.api.tier, !!hold.products.chat.free], ['standard', false]);
    assert.equal(hold.seen.price_war, 1);
    // 排队期间 API 被关了：选项不抛错。
    const off = run('follow', s => { s.products.api = undefined; });
    assert.equal(off.products.api, undefined);
  });
});

describe('D11.6：融资回报 ev_hot_round 与 ev_group_budget', () => {
  it('ev_hot_round 只在 s.expect.hot 的 45 天内、canRaise 时出现', () => {
    assert.equal(EXPECT.HOT_WINDOW, 45);
    const s = fresh('kimi', 'y2025');
    assert.equal(s.company.kind, 'private');
    check(s);
    assert.ok(!has(s, 'ev_hot_round'), '没有“超出预期”的发布（s.expect 还没有，读不到也不抛错）');
    setHot(s, null);
    check(s);
    assert.ok(!has(s, 'ev_hot_round'));
    for (const [n, want] of [[0, true], [20, true], [45, true], [46, false], [120, false]]) {
      const t = fresh('kimi', 'y2025');
      hotAgo(t, n);
      check(t);
      assert.equal(has(t, 'ev_hot_round'), want, `${n} 天前超出预期`);
      assert.ok(!has(t, 'ev_group_budget'), '独立公司不会有集团追加预算');
    }
    // 记的日期在今天之后（读到坏档）不算。
    const f = fresh('kimi', 'y2025');
    setHot(f, addDays(f.day, 3));
    check(f);
    assert.ok(!has(f, 'ev_hot_round'));
  });
  it('canRaise 逐条：上市了、正在上市、有融资轮在谈、公司特质禁止融资，都不出现', () => {
    const base = () => { const s = fresh('kimi', 'y2025'); hotAgo(s, 5); return s; };
    const no = (name, f) => { const t = base(); f(t); check(t); assert.ok(!has(t, 'ev_hot_round'), name); };
    no('已上市', t => { t.capital.listed = true; });
    no('正在上市', t => { t.capital.ipo = { left: 30 }; });
    no('融资轮在谈', t => { t.capital.round = { dilution: 0.08, amount: 1e8, pre: 1e9 }; });
    SPIRITS.x_nofund = { id: 'x_nofund', title: '测试：不融资', desc: '', mods: {}, blocks: ['funding'], info: false };
    try { no('特质禁止融资', t => { t.strategy = { spirits: { x_nofund: { since: t.day, until: null } } }; }); } finally { delete SPIRITS.x_nofund; }
    const ok = base();
    check(ok);
    assert.ok(has(ok, 'ev_hot_round'));
  });
  it('已上市的公司（开局就在上市的也算）任何时候都不出现，超出预期只走股价', () => {
    for (const [id, sc] of [['glm', 'y2026'], ['minimax', 'y2026'], ['kimi', 'y2026']]) {
      const s = fresh(id, sc);
      s.capital.listed = true;
      for (let i = 0; i < 12; i++) { hotAgo(s, 3); check(s); stepDays(s, 30); }
      assert.ok(!has(s, 'ev_hot_round'), id);
    }
  });
  it('集团内团队（bigtech、Gemini）只会出现 ev_group_budget：直接拨开局现金的 6%，只进新闻，不排弹窗', () => {
    assert.deepEqual(GROUP_BUDGET_FX, { cashOfStart: 0.06 });
    for (const [id, sc] of [['qwen', 'y2025'], ['gemini', 'y2024'], ['llama', 'y2025']]) {
      const s = fresh(id, sc);
      assert.equal(s.company.kind, 'division', id);
      hotAgo(s, 10);
      const cash = s.cash, news = s.news.length;
      check(s);
      assert.ok(!has(s, 'ev_hot_round') && !has(s, 'ev_group_budget'), `${id}：集团追加预算不排弹窗`);
      assert.ok(Math.abs(s.cash - cash - 0.06 * START_RESOURCES[s.company.tier][s.scenario].cash) < 1, `${id} 拨款 ${s.cash - cash}`);
      assert.equal(s.news.length, news + 1);
      assert.equal(s.news[0].title, '集团追加预算');
      assert.doesNotMatch(s.news[0].detail, /\{\w+\}/);
      assert.equal(s.seen.ev_group_budget, 1);
      // 同一份“超出预期”，365 天内只拨一次。
      const after = s.cash;
      stepDays(s, 30);
      check(s);
      assert.equal(s.cash, after, id);
    }
    assert.equal(EVENTS.ev_group_budget.news, true);
    assert.deepEqual(EVENTS.ev_group_budget.choices.map(c => c.id), ['ok'], '只进新闻；万一被排进队列也能关掉');
  });
  it('365 天最多一次：到期日记在 s.cool，满 365 天且又有新的“超出预期”才会再来', () => {
    assert.equal(EXPECT.ROUND_COOL, 365);
    const s = fresh('kimi', 'y2025');
    const d0 = s.day;
    const fired = [];
    // 每个月结都有一份新鲜的“超出预期”，条件一直成立，看 14 个月结里哪几次弹（弹出来就算处理了）。
    for (let i = 0; i <= 13; i++) {
      setHot(s, s.day);
      check(s);
      if (has(s, 'ev_hot_round')) { fired.push(daysBetween(d0, s.day)); assert.equal(s.cool.ev_hot_round, addDays(s.day, 365)); s.queue = []; }
      stepDays(s, 30);
    }
    assert.deepEqual(fired, [0, 390], '第 0 天一次；第 360 天还在冷却里，满 365 天后的第一个月结（第 390 天）再一次');
    // 边界：第 364 天不出，第 365 天出。
    const t = fresh('kimi', 'y2025');
    setHot(t, t.day);
    check(t);
    assert.ok(has(t, 'ev_hot_round'));
    t.queue = [];
    stepDays(t, 364);
    setHot(t, t.day);
    check(t);
    assert.ok(!has(t, 'ev_hot_round'), '第 364 天');
    stepDays(t, 1);
    setHot(t, t.day);
    check(t);
    assert.ok(has(t, 'ev_hot_round'), '第 365 天');
  });
  it('排在队列里没处理的时候不重复排；真的在整局里走：窗口内每个月结都满足条件也只弹一次', () => {
    const s = fresh('kimi', 'y2025');
    setHot(s, s.day);
    check(s);
    check(s);
    assert.equal(s.queue.filter(q => q.id === 'ev_hot_round').length, 1);
    // 整局：一直不处理融资轮、每 20 天写一次 hot，800 天里按 365 天一次的节奏。
    const g = fresh('kimi', 'y2025');
    const seen = [];
    for (let i = 0; i < 800 && g.status === 'playing'; i++) {
      if (i % 20 === 0) setHot(g, g.day);
      resolveAll(g, ev => { if (ev.id === 'ev_hot_round') seen.push(g.day); return null; });
      E.tickDay(g);
    }
    assert.ok(seen.length >= 1 && seen.length <= 3, `弹了 ${seen.length} 次`);
    for (let i = 1; i < seen.length; i++) assert.ok(daysBetween(seen[i - 1], seen[i]) >= 365, `${seen[i - 1]} → ${seen[i]}`);
  });
  it('选项：接 = 估值 +10%，按新估值出让 8%，不掷骰；先不融 = 口碑 +1；提示里的到账金额对得上', () => {
    assert.deepEqual(HOT_ROUND_FX, { valuation: 1.1, raise: 0.08 });
    const fx = describeEffects(HOT_ROUND_FX);
    assert.match(fx, /估值 \+10%/);
    assert.match(fx, /8%/);
    const mk = () => { const s = fresh('kimi', 'y2025'); hotAgo(s, 5); check(s); assert.ok(has(s, 'ev_hot_round')); return s; };
    const s = mk();
    const ev = E.currentEvent(s);
    assert.deepEqual(ev.choices.map(c => c.id), ['accept', 'decline']);
    assert.ok(ev.choices.every(c => !c.disabled));
    const expectAmount = s.valuation * 1.1 * 0.08 / 0.92;
    assert.ok(ev.choices[0].hint.includes(E.util.fmtMoney(expectAmount)), ev.choices[0].hint);
    assert.doesNotMatch(JSON.stringify(ev), /\{\w+\}/);
    const [v0, c0, eq0, rng0] = [s.valuation, s.cash, s.equity, s.rng];
    E.resolveEvent(s, 'accept');
    assert.ok(Math.abs(s.valuation / v0 - 1.1) < 1e-9);
    assert.ok(Math.abs(s.cash - c0 - expectAmount) < 1, `到账 ${s.cash - c0}，提示 ${expectAmount}`);
    assert.ok(Math.abs(s.equity / eq0 - 0.92) < 1e-9);
    assert.equal(s.rng, rng0, '不掷骰');
    assert.equal(s.seen.ev_hot_round, 1);
    const d = mk();
    const val0 = d.valuation, cash0 = d.cash;
    d.rep = Math.min(d.rep, 90);
    const rep1 = d.rep;
    E.resolveEvent(d, 'decline');
    assert.equal(d.rep, rep1 + 1);
    assert.equal(d.valuation, val0);
    assert.equal(d.cash, cash0);
  });
  it('小团队一次“超出”（估值 ×1.10）再接这一轮，估值最多涨到原来的 1.21 倍', () => {
    const s = fresh('kimi', 'y2025');
    const v0 = s.valuation;
    applyEffects(s, { valuation: 1.1 }, { source: 'release', id: 'test' });
    applyEffects(s, HOT_ROUND_FX, { source: 'event', id: 'ev_hot_round' });
    assert.ok(Math.abs(s.valuation / v0 - 1.21) < 1e-9);
  });
  it('排队期间公司开始融资或上市了：“接”置灰，不能重复融', () => {
    const s = fresh('kimi', 'y2025');
    hotAgo(s, 5);
    check(s);
    s.capital.round = { dilution: 0.08, amount: 1e8, pre: s.valuation };
    const ev = E.currentEvent(s);
    assert.ok(ev.choices.find(c => c.id === 'accept').disabled);
    assert.ok(!ev.choices.find(c => c.id === 'decline').disabled);
    assert.throws(() => E.resolveEvent(s, 'accept'), /融资/);
  });
});

describe('CASES.tos 带上厂商参数', () => {
  const lawsuit = (s, type, extra = {}) => { s.queue = [{ kind: 'event', id: 'lawsuit', params: { type, claim: 3e7, winp: 0.5, months: 8, fee: 3e5, ...extra } }]; return E.currentEvent(s); };
  it('数据里不再写死 OpenAI：正文用 {vendor}；视图按厂商填，没有厂商的老档按 OpenAI 算', () => {
    assert.ok(CASES.tos.text.includes('{vendor}') && !CASES.tos.text.includes('OpenAI'));
    const s = fresh('qwen', 'y2025');
    for (const v of ['Anthropic', '深度求索', 'OpenAI']) {
      const ev = lawsuit(s, 'tos', { vendor: v });
      assert.ok(ev.text.startsWith(v), ev.text);
      assert.doesNotMatch(ev.text, /\{\w+\}/);
      if (v !== 'OpenAI') assert.ok(!ev.text.includes('OpenAI'));
    }
    assert.ok(lawsuit(s, 'tos').text.startsWith('OpenAI'));
    assert.ok(!lawsuit(s, 'tos', { vendor: undefined }).text.includes('undefined'));
  });
  it('每一类官司的正文都填得干净，其他类型不受影响', () => {
    const s = fresh('qwen', 'y2025');
    for (const type of Object.keys(CASES)) {
      const ev = lawsuit(s, type, { vendor: 'Anthropic' });
      assert.doesNotMatch(`${ev.title}${ev.text}${ev.lines.map(l => l.text).join('')}${ev.choices.map(c => c.hint).join('')}`, /\{\w+\}/, type);
      assert.equal(ev.title, CASES[type].title);
    }
  });
  it('蒸馏了哪家的 API，被告的就是哪家：诉讼从 risky.tos_<家族> 取厂商名', () => {
    for (const [key, vendor] of [['tos_claude', FAMILIES.claude.company], ['tos_deepseek_pro', FAMILIES.deepseek_pro.company], ['tos_gpt', 'OpenAI']]) {
      const s = fresh('qwen', 'y2025');
      s.data.risky[key] = true;
      s.risk.tos = 1e6;
      conditionalEvents(s, { users: 1e8, tokens: 1e13 }, report());
      const q = s.queue.find(x => x.id === 'lawsuit' && x.params.type === 'tos');
      assert.ok(q, `${key} 没有被起诉`);
      assert.equal(q.params.vendor, vendor, key);
      assert.ok(E.currentEvent(s) && E.currentEvent(Object.assign(s, { queue: [q] })).text.startsWith(vendor));
    }
  });
});

describe('license_fork：新选项', () => {
  // 许可之争出现的条件不变：在线旗舰开源而且是受限许可（B3）。
  const hits = (s, n = 300) => {
    for (let i = 1; i <= n; i++) {
      const t = clone(s);
      t.rng = i * 7919;
      check(t);
      if (has(t, 'license_fork')) return t;
    }
    return null;
  };
  const game = () => { const s = fresh('llama', 'y2024'); assert.deepEqual([E.liveModel(s).open, E.liveModel(s).license], [true, 'restrictive']); return s; };
  it('选项只有两个：维持现状（口碑 +2）、着手改许可（没有效果）；正文写的是受限许可', () => {
    const t = hits(game());
    assert.ok(t, '受限许可的开源旗舰应该会吵起来');
    const ev = E.currentEvent(t);
    assert.deepEqual(ev.choices.map(c => c.id), ['keep', 'change']);
    assert.match(ev.text, /受限许可/);
    assert.match(ev.choices[0].hint, /口碑 \+2/);
    assert.doesNotMatch(ev.choices[1].hint, /品牌|估值|口碑/, '着手改许可本身什么都不变');
    assert.match(ev.choices[1].hint, /公司策略/);
    assert.doesNotMatch(JSON.stringify(ev), /\{\w+\}/);
  });
  it('维持现状：口碑 +2，别的不动；着手改许可：什么数值都不变，路线和许可也不变（事件不能改路线）', () => {
    const t = hits(game());
    const pick = (id, f) => { const s = clone(t); f?.(s); const b = { rep: s.rep, brand: s.brand, valuation: s.valuation, cash: s.cash, route: JSON.stringify(s.route), lic: E.liveModel(s).license, open: E.liveModel(s).open }; E.resolveEvent(s, id); return [b, s]; };
    const [b1, s1] = pick('keep', s => { s.rep = 50; });
    assert.equal(s1.rep, 52);
    assert.equal(s1.brand, b1.brand);
    assert.equal(s1.valuation, b1.valuation);
    assert.equal(JSON.stringify(s1.route), b1.route);
    const [b2, s2] = pick('change');
    for (const k of ['rep', 'brand', 'valuation', 'cash']) assert.equal(s2[k], b2[k], k);
    assert.equal(JSON.stringify(s2.route), b2.route);
    assert.equal(E.liveModel(s2).license, 'restrictive');
    assert.equal(E.liveModel(s2).open, true);
  });
  it('旗舰闭源、或者许可是宽松的，不会出现', () => {
    const closed = game();
    E.liveModel(closed).open = false;
    assert.equal(hits(closed), null);
    const open = game();
    E.liveModel(open).license = 'permissive';
    assert.equal(hits(open), null);
  });
});

describe('集团年度预算：保留，但不再承诺年底考核', () => {
  it('“追加预算”多拿 50%，提示和结果里没有年底考核的承诺，也不写 flags.budgetPromise', () => {
    const def = EVENTS.budget;
    assert.ok(!def.choices.some(c => /年底|榜单前列|团队状态/.test(`${c.label}${c.hint}`)));
    const s = fresh('qwen', 'y2025');
    s.queue = [{ kind: 'event', id: 'budget', params: { budget: 1e9 } }];
    const ev = E.currentEvent(s);
    assert.match(ev.choices.find(c => c.id === 'more').hint, /多拿 50%/);
    assert.doesNotMatch(JSON.stringify(ev), /\{\w+\}/);
    const c0 = s.cash;
    const r = E.resolveEvent(s, 'more');
    assert.equal(s.cash, c0 + 1.5e9);
    assert.ok(!/年底/.test(r.text));
    assert.ok(!('budgetPromise' in s.flags));
    const t = fresh('qwen', 'y2025');
    t.queue = [{ kind: 'event', id: 'budget', params: { budget: 1e9 } }];
    const c1 = t.cash;
    E.resolveEvent(t, 'accept');
    assert.equal(t.cash, c1 + 1e9);
  });
  it('D11.6 追加预算的代价：选“申请追加预算”写 s.expect.ask = { day }（下一次被评的旗舰降一档，随 P3.E 生效），提示里说清楚；“按常规接受”不写', () => {
    const hint = EVENTS.budget.choices.find(c => c.id === 'more').hint;
    assert.equal(hint, '多拿 50%，共 {budget2}；集团会对下一款旗舰期待更高，市场评价降一档');
    assert.equal(EVENTS.budget.choices.find(c => c.id === 'accept').hint, '获得 {budget}');
    const mk = () => { const s = fresh('qwen', 'y2025'); s.queue = [{ kind: 'event', id: 'budget', params: { budget: 1e9 } }]; return s; };
    // 新开局已经有 D11.10 形状的 s.expect：选追加时记下 ask。
    const more = mk();
    const r = E.resolveEvent(more, 'more');
    assert.deepEqual(more.expect, { ...initExpect(), ask: { day: more.day } });
    assert.match(r.text, /期待/);
    assert.ok(E.validateGame(more), '带着 ask 的存档仍然有效');
    assert.deepEqual(E.migrateGame(clone(more)).s.expect.ask, { day: more.day }, '存档读回来记录还在');
    // 按常规接受：不写记录。
    const plain = mk();
    E.resolveEvent(plain, 'accept');
    assert.equal(plain.expect?.ask ?? null, null);
    // 下一次年度评审：没用掉的旧记录清掉；再选追加就记新的一条。
    const next = mk();
    next.expect = { ...initExpect(), ask: { day: '2024-01-05' } };
    E.resolveEvent(next, 'accept');
    assert.equal(next.expect.ask, null, '接受常规预算时旧记录清掉');
    const again = mk();
    again.expect = { ...initExpect(), ask: { day: '2024-01-05' } };
    E.resolveEvent(again, 'more');
    assert.deepEqual(again.expect.ask, { day: again.day }, '再追加记新的一条');
  });
  it('每年 1 月的预算评审照旧（这是财年日历，不是史实）：集团内团队玩一年会收到一张', () => {
    const s = E.createGame('qwen', 'y2024', 1);
    let n = 0;
    for (let i = 0; i < 400 && s.status === 'playing'; i++) {
      resolveAll(s, ev => { if (ev.id === 'budget') n++; return null; });
      E.tickDay(s);
    }
    assert.ok(n >= 1);
  });
});

describe('事件选项的 distill 标记（规格 A10）', () => {
  it('每个事件选项的字段都过选项校验；distill 只能写 true', () => {
    for (const [id, e] of Object.entries(EVENTS)) for (const c of e.choices) validateChoice(c, { source: 'event' });
    assert.throws(() => validateChoice({ id: 'x', label: 'y', distill: false }, { source: 'event' }));
  });
  it('标了 distill: true 的只有“被封号以后否认、继续用这批蒸馏数据”；同一个事件里还有不带标记的“承认”', () => {
    const marked = Object.entries(EVENTS).flatMap(([id, e]) => e.choices.filter(c => c.distill).map(c => `${id}.${c.id}`));
    assert.deepEqual(marked, ['distill_ban.deny']);
    assert.ok(EVENTS.distill_ban.choices.some(c => !c.distill && c.id === 'admit'));
    assert.match(EVENTS.distill_ban.choices.find(c => c.id === 'deny').hint, /继续用/);
  });
  it('标记和实际效果对得上：否认以后蒸馏数据还在，承认以后这一家的数据作废', () => {
    const mk = () => { const s = fresh('qwen', 'y2025'); s.data.distill = { chat: { claude: 0.5 }, code: { claude: 0.3, gpt: 0.2 } }; s.queue = [{ kind: 'event', id: 'distill_ban', params: { vendor: 'Anthropic', family: 'claude' } }]; return s; };
    const keep = mk();
    E.resolveEvent(keep, 'deny');
    assert.deepEqual(keep.data.distill, { chat: { claude: 0.5 }, code: { claude: 0.3, gpt: 0.2 } });
    const drop = mk();
    E.resolveEvent(drop, 'admit');
    assert.ok(!drop.data.distill.chat?.claude && !drop.data.distill.code?.claude);
    assert.equal(drop.marks.ban_claude, drop.day);
  });
});

describe('事件数据的自洽', () => {
  it('每个事件都有标题、台词和至少一个选项（排进队列就能处理掉）；选项 id 不重复', () => {
    for (const [id, e] of Object.entries(EVENTS)) {
      assert.ok(e.title && e.text && Array.isArray(e.lines) && Array.isArray(e.choices), id);
      assert.ok(e.choices.length >= 1, id);
      assert.equal(new Set(e.choices.map(c => c.id)).size, e.choices.length, id);
    }
    for (const id of ['ev_hot_round', 'ev_group_budget', 'price_war', 'license_fork']) assert.ok(EVENTS[id], id);
  });
  it('新事件的文案大白话：没有字段名和年份', () => {
    for (const id of ['ev_hot_round', 'ev_group_budget', 'license_fork']) {
      const e = EVENTS[id];
      const words = [e.title, e.text, ...e.lines.map(l => l[1]), ...e.choices.flatMap(c => [c.label, c.hint])].join('\n');
      assert.doesNotMatch(words, /expect|hot|canRaise|\b(19|20)\d\d\b/, id);
    }
  });
  it('新开局的 cool、seen 支持当前事件检查与逐月推进', () => {
    const s = fresh('kimi', 'y2025');
    hotAgo(s, 3);
    assert.doesNotThrow(() => check(s));
    jumpTo(s, '2025-06');
  });
});

// ---------- P2.3 留给门禁的集成修补（deferred-p2.3.diff，G2 遗留修补 C 打上） ----------
// 这两条要改的文件不是 P2.3 的独占文件（queue.js 归 P1.4、P2.1，model.js、economy.js 归 P0.3b、P1.x），由 G2 遗留修补统一打上。
describe('P2.3 留给门禁的集成修补', () => {
  it('queue.js 的 currentEvent 把事件选项的 distill 标记带进视图（P2.2 的 resolveAll 读视图里的标记）', () => {
    const s = fresh('qwen', 'y2025');
    s.queue = [{ kind: 'event', id: 'distill_ban', params: { vendor: 'Anthropic', family: 'claude' } }];
    const ev = E.currentEvent(s);
    assert.deepEqual(ev.choices.map(c => [c.id, !!c.distill]), [['admit', false], ['deny', true]]);
    // 机器人（resolveAll 的 defaultChoice）读的就是视图里的标记：老师正是它想蒸馏的那一家时选“否认”（继续用），别家照旧选“承认”。
    const bot = fam => {
      const t = fresh('rwkv', 'y2024');
      assert.equal(wantsDistill(t, 'mistral'), true, 'RWKV y2024 开局就想蒸馏 Mistral 的开源权重');
      t.data.distill = { chat: { [fam]: 0.5 } };
      t.queue = [{ kind: 'event', id: 'distill_ban', params: { vendor: FAMILIES[fam].company, family: fam } }];
      resolveAll(t);
      return t.data.distill.chat?.[fam] ? 'deny' : 'admit';
    };
    assert.equal(bot('mistral'), 'deny');
    assert.equal(bot('gpt'), 'admit');
  });
  it('E5“写死的日期门槛”：FP8 的额外炸炉风险看这项技术的公开程度（techStatus 到 open 就没有），economy.js 里 Coding Plan、API 的起始月读 PRODUCTS', () => {
    const s = fresh('qwen', 'y2025');
    jumpTo(s, '2025-03');   // 2024-12 起 DeepSeek-V3 的 FP8 训练代码已开源，2025-06 起主流框架才支持
    assert.equal(E.techStatus(s, TECH_BY_ID.fp8).level, 'open');
    const st = { total: 70, active: 70, arch: 'dense' };
    s.techs = s.techs.filter(x => x !== 'fp8');
    const without = projectRisk(s, st);
    s.techs.push('fp8');
    assert.equal(projectRisk(s, st), without, '已经开源了，不该再按日期多加 0.01');
    const economy = fs.readFileSync(`${CAREER}sim/economy.js`, 'utf8');
    assert.ok(!/s\.date >= '2025-07'|s\.date >= \(s\.mod === 'music'/.test(economy), 'economy.js 里还有和 PRODUCTS.from 重复的日期');
  });
});
