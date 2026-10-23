// 存档结构 v3 → v4（P0.3b，规格 E8）：6 份 v3 夹具逐项检查结构步骤做对了（done 拆分、计时器换到期日、队列改名、
// 历史时刻删除、孤儿 work 副本清掉、死状态删除、riskMods 并进 risk、目标补 due0、补 s.expect）；结构步骤幂等；
// 在 v3 存档上乱改 v3 才有的字段，模糊测试 500 例迁移永不抛错。推进 120 天不抛错见 fixtures.test.mjs。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import { toV4 } from '../../src/career/sim/migrations/v4_structure.js';
import { addDays } from '../../src/career/sim/clock.js';
import { addMonths } from '../../src/career/data/core.js';
import { EVENTS } from '../../src/career/data/events.js';
import { FEATURES, FEATURE_STEPS } from '../../src/career/sim/migrations/index.js';
import { advance } from '../helpers/career_bot.mjs';

const clone = v => JSON.parse(JSON.stringify(v));
const DIR = new URL('../fixtures/saves/', import.meta.url);
const NAMES = ['gpt_y2023_open', 'deepseek_y2025_mid', 'history_queue_claude', 'teachercap_rwkv', 'kimi_y2026', 'listed_glm_y2026'];
const raw = name => JSON.parse(fs.readFileSync(new URL(`${name}.json`, DIR), 'utf8'));
const load = r => { const out = E.migrateGame(r); assert.equal(out.ok, true, out.reason); return out.s; };
const DEAD = ['done', 'timers', 'cooldowns', 'riskMods', 'lastAction', 'lastReport', 'grace'];

describe('v3 → v4：6 份夹具', () => {
  for (const name of NAMES) {
    it(`${name}：结构版本 4，旧字段都换成新字段`, () => {
      const r = raw(name), s = load(r);
      assert.equal(r.v, 3);
      assert.equal(s.v, 4);
      assert.deepEqual(s.mig, Object.fromEntries(FEATURES.map(k => [k, true])));
      for (const k of DEAD) assert.ok(!(k in s), `还留着 s.${k}`);
      assert.ok(!('pending' in s.data), '还留着 data.pending');
      assert.ok(!Object.keys(s.flags).some(k => k.startsWith('super:')) && !('superEarned' in s.flags));
      for (const k of ['seen', 'marks', 'due', 'cool', 'risk']) assert.ok(s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]), `没有 s.${k}`);
      assert.ok(s.expect && Array.isArray(s.expect.log), '补上了 s.expect');
      // done：经营事件记次数，viral_*、ban_* 进 marks，超事件按 flags 里的日子进 marks，里程碑和别的不搬。
      for (const id of r.done) {
        if (/^(viral|ban)_/.test(id)) assert.ok(s.marks[id], id);
        else if (EVENTS[id]) assert.equal(s.seen[id], r.done.filter(x => x === id).length, id);
        else assert.ok(!(id in s.seen), `${id} 不该记进 seen`);
      }
      for (const [k, v] of Object.entries(r.flags).filter(([k]) => k.startsWith('super:'))) assert.equal(s.marks[k], v);
      // 计时器：今天 + 30 × 剩余月数；0 的丢掉。
      for (const [k, n] of Object.entries(r.timers)) assert.equal(s.due[k], n > 0 ? addDays(r.day, 30 * n) : undefined, `timers.${k}`);
      for (const [k, n] of Object.entries(r.cooldowns)) assert.equal(s.cool[k], n > 0 ? addDays(r.day, 30 * n) : undefined, `cooldowns.${k}`);
      // riskMods 并进 risk，compliance 丢掉。
      for (const [k, v] of Object.entries(r.riskMods)) assert.equal(s.risk[k], k === 'compliance' ? undefined : v, k);
      // 队列：没有 goal、history，也没有事件版的两条引擎提示。
      for (const q of [...s.queue, ...s.scheduled.map(x => x.item).filter(Boolean)]) {
        assert.ok(!['goal', 'history'].includes(q.kind), JSON.stringify(q));
        assert.ok(!(q.kind === 'event' && ['first_release_hint', 'small_ready'].includes(q.id)), JSON.stringify(q));
      }
      // 目标补 due0：宽限过的往回推两个月。
      for (const g of s.goals) assert.equal(g.due0, g.grace ? addMonths(g.date, -2) : g.date, g.id);
      // 孤儿 work 副本：开局复制、马上被下一代顶掉的 <id>w 清掉；被引用的模型一个不少。
      const used = new Set([r.working, r.smallWorking, r.live, r.smallLive].filter(Boolean));
      const orphans = r.models.filter(m => m.id.endsWith('w') && m.stage !== 'released' && !used.has(m.id)).map(m => m.id);
      assert.deepEqual(s.models.map(m => m.id), r.models.map(m => m.id).filter(id => !orphans.includes(id)));
      for (const id of used) assert.ok(s.models.some(m => m.id === id), id);
    });
  }
  it('具体数值：DeepSeek 中局的 e429、regulator_talk 冷却、viral 标记、风险乘子；Kimi 两次 integration；GPT 的 cooldowns', () => {
    const ds = load(raw('deepseek_y2025_mid'));
    assert.equal(ds.seen.e429, 1);
    assert.equal(ds.marks.viral_aime25, '2025-10-01');
    assert.equal(ds.cool.regulator_talk, addDays('2025-10-01', 270));
    assert.ok(!('e429' in ds.cool) && !('adapt' in ds.due), '剩 0 个月的当作已经到期');
    assert.deepEqual(ds.risk, { image: 1.5, routing: 2, piracy: 2 });
    assert.ok(ds.marks['super:super_cn_first'] && !('ms_linear' in ds.seen));
    assert.equal(load(raw('kimi_y2026')).seen.integration, 2);
    assert.deepEqual(load(raw('gpt_y2023_open')).cool, { dc_fire: addDays('2023-10-01', 540), media_interview: addDays('2023-10-01', 180), data_leak: addDays('2023-10-01', 420), distilled_by_others: addDays('2023-10-01', 210) });
  });
  it('队列里的旧版历史时刻删掉；孤儿副本在 3 份开局有下一代的夹具里都有，读档后都清掉', () => {
    const r = raw('history_queue_claude');
    assert.ok(r.queue.some(q => q.kind === 'history'));
    assert.ok(!load(r).queue.some(q => q.kind === 'history'));
    for (const name of ['gpt_y2023_open', 'deepseek_y2025_mid', 'history_queue_claude', 'kimi_y2026', 'listed_glm_y2026']) {
      const id = raw(name).models[0].id + 'w';
      assert.ok(raw(name).models.some(m => m.id === id), `${name} 本来有 ${id}`);
      assert.ok(!load(raw(name)).models.some(m => m.id === id), `${name} 读档后还有 ${id}`);
    }
  });
  it('队列项改名：goal → board；first_release_hint、small_ready → notice；融资、上市的剩余月数换成到期日', () => {
    const r = raw('kimi_y2026');
    r.queue = [{ kind: 'goal', id: r.goals[0].id }, { kind: 'event', id: 'first_release_hint', params: { model: 'Kimi 测试版' } }, { kind: 'history', id: 'personal_kimi_long' }];
    r.scheduled.push({ at: addDays(r.day, 3), item: { kind: 'event', id: 'small_ready', params: { small: '小 K', total: 8, active: 8, costRatio: '9%' } } });
    r.capital.round = { dilution: 0.15, amount: 1e8, pre: 1e9, left: 2 };
    r.capital.ipo = { left: 1, ticker: 'TEST' };
    r.timers = { filing: 2, chatBan: 1, poach: 6 };
    r.goals[0].grace = true;
    const s = load(r);
    assert.deepEqual(s.queue.map(q => q.kind), ['board', 'notice']);
    assert.equal(s.queue[1].title, '预训练完成');
    assert.match(s.queue[1].text, /Kimi 测试版 的底座训练完了/);
    const sm = s.scheduled.find(x => x.item?.kind === 'notice');
    assert.ok(sm && /小 K 蒸馏完成/.test(sm.item.text));
    assert.deepEqual([s.due.funding, s.due.ipo, s.due.filing, s.due.chatBan, s.due.poach], [60, 30, 60, 30, 180].map(n => addDays(r.day, n)));
    assert.ok(!('left' in s.capital.round) && !('left' in s.capital.ipo) && s.capital.ipo.ticker === 'TEST');
    assert.equal(s.goals[0].due0, addMonths(r.goals[0].date, -2));
    // 读进来以后照常推进：融资 60 天后出结果，上市 30 天后挂牌。
    advance(s, 61);
    assert.ok(!s.capital.round && s.capital.listed?.ticker === 'TEST' && !('funding' in s.due) && !('ipo' in s.due));
  });
});

describe('幂等', () => {
  it('结构步骤跑两遍和跑一遍一样；迁移过的存档再读一遍不变', () => {
    for (const name of NAMES) {
      const once = clone(raw(name));
      toV4(once);
      const twice = clone(once);
      toV4(twice);
      assert.deepEqual(twice, once, name);
      const s = load(raw(name));
      assert.deepEqual(load(clone(s)), s, `${name}：v4 存档再读一遍`);
    }
  });
  it('新开局的存档本来就是 v4 的样子：去掉版本号按 v3 读，结构步骤只清掉孤儿副本（开局还会留一个，P2.1 改开局继承时修），别的字段不动', () => {
    const s = E.createGame('deepseek', 'y2025', 5);
    const old = clone(s);
    delete old.v;
    const m = load(old);
    for (const k of Object.keys(s)) if (k !== 'v' && k !== 'models') assert.deepEqual(m[k], s[k], k);
    assert.deepEqual(m.models, s.models.filter(x => x.id !== `${s.live}w`));
  });
});

describe('特性步骤与开发期存档（E8）', () => {
  it('开发期存档（mig.strategy 已记、没有 strategy）：读档时就补上策略树，读两遍结果相同', () => {
    const dev = clone(load(raw('deepseek_y2025_mid')));
    assert.equal(dev.mig.strategy, true);
    delete dev.strategy;
    const a = load(clone(dev));
    assert.ok(a.strategy?.tree, '读档后应该已经有策略树');
    assert.ok(E.resolvedTree(a)?.nodes?.length > 0, '策略树里应该有节点');
    const b = load(clone(dev));
    assert.deepEqual(b, a, '同一份开发期存档读两遍结果要一样');
    assert.deepEqual(load(clone(a)), a, '补过树的存档再读一遍也不变');
  });
  it('新开局把全部特性步骤记成执行过（stampFeatures），读档不再跑：G1 以后、P2.1 和 P2.2 落地以前开的存档，naming、strategy 两步以后也不会跑', () => {
    const s = E.createGame('deepseek', 'y2025', 1);
    assert.deepEqual([s.mig.naming, s.mig.strategy], [true, true]);
    const keep = { ...FEATURE_STEPS }, calls = [];
    try {
      for (const k of FEATURES) FEATURE_STEPS[k] = x => { calls.push(k); return keep[k](x); };
      load(clone(s));
      assert.deepEqual(calls, [], '新存档读档一步都不跑');
      const dev = clone(s);
      delete dev.mig.naming;
      delete dev.mig.strategy;
      load(dev);
      assert.deepEqual(calls, ['naming', 'strategy'], '没记的才跑');
    } finally { Object.assign(FEATURE_STEPS, keep); }
  });
});

describe('模糊测试：v3 存档的旧字段乱写也永不抛错', () => {
  it('500 例：done、timers、cooldowns、riskMods、goals、队列、排期、融资上市、flags、models 写成各种垃圾', () => {
    let seed = 20261021;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const atoms = [null, undefined, 0, -3, 2.5, NaN, Infinity, '', 'x', '2025-01', 'e429', 'viral_arena', 'super_sota', true, [], {}, [null], { left: 'x' }, { kind: 'goal' }, { kind: 'history', id: 1 }];
    const junk = d => {
      const k = rnd();
      if (d > 2 || k < 0.45) return atoms[Math.floor(rnd() * atoms.length)];
      if (k < 0.7) return Array.from({ length: Math.floor(rnd() * 4) }, () => junk(d + 1));
      const o = {};
      for (const key of ['e429', 'filing', 'chatBan', 'kind', 'id', 'left', 'date', 'grace', 'due0', 'item', 'at', 'params', 'super:x', 'compliance', 'abuse']) if (rnd() < 0.3) o[key] = junk(d + 1);
      return o;
    };
    const FIELDS = ['done', 'timers', 'cooldowns', 'riskMods', 'risk', 'seen', 'marks', 'due', 'cool', 'goals', 'queue', 'scheduled', 'capital', 'flags', 'models', 'data', 'lastReport', 'expect', 'working'];
    const bases = NAMES.map(raw);
    let ok = 0;
    for (let i = 0; i < 500; i++) {
      const r = clone(bases[i % bases.length]);
      for (let j = 0; j < 1 + Math.floor(rnd() * 3); j++) r[FIELDS[Math.floor(rnd() * FIELDS.length)]] = junk(0);
      if (rnd() < 0.3) r.queue = [junk(1), junk(1), { kind: 'goal', id: junk(2) }];
      if (rnd() < 0.2 && Array.isArray(r.goals)) r.goals.push(junk(1));
      let out;
      assert.doesNotThrow(() => { out = E.migrateGame(r); }, `第 ${i} 份`);
      assert.equal(typeof out.ok, 'boolean');
      if (out.ok) { ok++; assert.ok(E.validateGame(out.s)); assert.equal(out.s.v, 4); } else assert.ok(typeof out.reason === 'string' && out.reason.length > 0);
    }
    assert.ok(ok > 100, `只有 ${ok} 份读得进来，坏得太狠测不到结构步骤`);
  });
});
