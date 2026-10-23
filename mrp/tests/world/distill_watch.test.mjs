// M2b 闭源 API 蒸馏（规格 M.5.1、M.5.2、M.5.7、M.5.9，F2 M2 行 ④）：检测公式、只有真做了才会被查出、
// 老师的四个分支、效果按抽取量成比例、分散小号、每年 2 个包、钱入账六成、新手保护、电脑老师。
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { DISTILL_WATCH as W, TRANSFER } from '../../src/career/data/exchange.js';
import { GEN } from '../../src/career/data/balance.js';
import { appendRelease } from '../../src/career/world/release.js';
import { detectP, resolveCase, caseRatio, apiBlock } from '../../src/career/world/distill_watch.js';
import { distillOptions } from '../../src/career/sim/data_ops.js';
import { addDays } from '../../src/career/sim/clock.js';
import { restoreHistory } from '../helpers/world_provider.mjs';

const BASE0 = W.BASE;
after(() => { W.BASE = BASE0; restoreHistory(); });

const DIMS = { knowledge: 80, reasoning: 80, coding: 80, writing: 80, math: 80, agent: 60, safety: 70 };
// 甲（老师）、乙（学生）是真人，丙是电脑。甲发一款闭源模型；乙的进场日往前挪，过了新手保护期。
function setup({ teacherBot = null, studentJoined = '2023-06-01', seed = 7 } = {}) {
  const companies = [
    { name: '甲智能', brand: '甲甲', country: 'US', tier: 'specialist', kind: teacherBot ? 'bot' : 'human', bot: teacherBot ?? 'normal' },
    { name: '乙智能', brand: '乙乙', country: 'US', tier: 'specialist', kind: 'human' },
    { name: '丙智能', brand: '丙丙', country: 'CN', tier: 'specialist', kind: 'bot' },
  ];
  const w = E.createWorld({ seed, start: '2024-01', days: 800, companies });
  const all = Object.values(w.companies).sort((a, b) => a.seat - b.seat);
  const [A, B] = all;
  if (studentJoined) B.joined = studentJoined;
  const picks = { [A.id]: null, [B.id]: 'settle' };
  const clear = (c, pick) => {
    while (c.kind === 'human' && c.s.queue.length) {
      const ev = E.currentEvent(c.s);
      const ch = (pick && ev.choices.find(x => x.id === pick && !x.disabled)) || ev.choices.find(x => !x.disabled);
      E.resolveEvent(c.s, ch.id);
    }
  };
  const step = () => { clear(A, picks[A.id]); clear(B, picks[B.id]); return w.tick(); };
  step(); step();
  appendRelease(w, { family: A.id, org: A.id, modelId: 'tx', date: w.day.slice(0, 7), day: w.day, name: 'TeachX', cls: 'large', open: false, price: 'standard', dims: DIMS, q: 80 });
  step();
  const order = (acct = '') => E.applyNow(w, B.id, { name: 'decide', args: { action: 'data', id: `distill:${A.id}:api${acct}` } });
  return { w, A, B, step, clear, picks, order, cases: () => Object.values(w.ix.cases) };
}
// 跑到出现一起案子（BASE 调成 1 保证当天查出），再跑 extra 天。
function runToCase(env, extra = 0) {
  for (let d = 0; d < 20 && !env.cases().length; d++) env.step();
  for (let d = 0; d < extra; d++) env.step();
  return env.cases()[0];
}

describe('API 蒸馏检测（M.5.2）', () => {
  it('公式：14 天 4.3G token、大客户账号的一个包，被查出约 9%（系数 0.004 时约 7%）；对方开严格防护约 20%；分散小号减半', () => {
    const perDay = GEN.packGTok * 1e9 / GEN.apiDays;
    assert.equal(W.BASE, 0.005);
    const pk = (acct, strict) => 1 - (1 - detectP(perDay, acct, strict)) ** GEN.apiDays;
    assert.ok(Math.abs(pk('big', false) - 0.087) < 0.01, `标准 ${pk('big', false)}`);
    assert.ok(Math.abs(pk('big', true) - 0.20) < 0.015, `严格 ${pk('big', true)}`);
    W.BASE = 0.004;
    const pack = (acct, strict) => 1 - (1 - detectP(perDay, acct, strict)) ** GEN.apiDays;
    assert.ok(Math.abs(pack('big', false) - 0.07) < 0.01, `标准 ${pack('big', false)}`);
    assert.ok(Math.abs(pack('big', true) - 0.17) < 0.015, `严格 ${pack('big', true)}`);
    assert.ok(Math.abs(detectP(perDay, 'spread', false) / detectP(perDay, 'big', false) - W.SPREAD / W.BIG) < 1e-12);
    W.BASE = BASE0;
  });

  it('只有真的做了 API 蒸馏才会被查出：没下单就一起案子也没有，下了单的那一对才有', () => {
    W.BASE = 1;
    const quiet = setup();
    for (let d = 0; d < 30; d++) quiet.step();
    assert.equal(quiet.cases().length, 0);
    const env = setup();
    assert.ok(env.order().ok);
    const c = runToCase(env);
    assert.ok(c, '下了单应该被查出');
    assert.equal(c.stu, env.B.id);
    assert.equal(c.tea, env.A.id);
    assert.ok(env.w.ix.pairs[`${env.B.id}|${env.A.id}`].orders[c.oid].tok > 0);
    W.BASE = BASE0;
  });

  it('钱付给老师那家，收盘只入账六成，不算客户收入', () => {
    W.BASE = 0;
    const env = setup();
    const a0 = env.A.s.cash, b0 = env.B.s.cash;
    assert.ok(env.order().ok);
    for (let d = 0; d < GEN.apiDays + 2; d++) env.step();
    const paid = b0 - env.B.s.cash;
    assert.ok(Math.abs(paid - 2.5e6) < 1, `学生付了 ${paid}`);
    assert.ok(Math.abs((env.A.s.cash - a0) - paid * TRANSFER.BOOK) < 1, `老师入账 ${env.A.s.cash - a0}`);
    assert.ok(!(env.A.s.history.at(-1)?.rev?.api > 0) || env.A.s.history.at(-1).rev.api < paid * 0.01, '不进客户收入');
    W.BASE = BASE0;
  });
});

describe('老师的四个分支（M.5.2）', () => {
  it('封号不声张：订单作废、已付不退、180 天内不能再买，学生收到封号卡', () => {
    W.BASE = 1;
    const env = setup();
    env.picks[env.A.id] = 'ban';
    assert.ok(env.order().ok);
    const c = runToCase(env, 1);
    assert.equal(c.choice, 'ban');
    assert.equal(env.B.s.orders.filter(o => o.gen?.mode === 'api').length, 0);
    const why = apiBlock(env.w, env.B.s, env.A.id);
    assert.match(why, /封了你们的号/);
    const opt = distillOptions(env.B.s).find(o => o.id === `distill:${env.A.id}:api`);
    assert.equal(opt.ok, false);
    // 180 天以后又能买了。
    const pair = env.w.ix.pairs[`${env.B.id}|${env.A.id}`];
    assert.equal(pair.ban, addDays(c.decided, W.FX.ban));
    W.BASE = BASE0;
  });

  it('公开指控：学生口碑、估值按抽取比例受挫，公开记录和新闻；证据不足时指控方口碑 −2', () => {
    W.BASE = 1;
    const env = setup();
    env.picks[env.A.id] = 'accuse';
    const rep0 = env.B.s.rep;
    assert.ok(env.order().ok);
    const c = runToCase(env, 1);
    assert.equal(c.choice, 'accuse');
    const r = c.ratio;
    // 第一天就查出：抽取不到四分之一个包，证据不足。
    assert.ok(r < W.EVID_FRAC, `比例 ${r}`);
    assert.equal(env.B.s.rep, rep0 - 4, '证据不足：学生只因为承认封号丢 4');
    assert.ok(!env.w.ix.public.some(x => x.type === 'accuse'));
    W.BASE = BASE0;
  });

  it('公开指控（证据足）：效果和抽取量成正比；分散小号按欺诈加倍', () => {
    const hit = (days, acct = '') => {
      W.BASE = 0;
      const env = setup();
      env.picks[env.A.id] = 'accuse';
      assert.ok(env.order(acct).ok);
      for (let d = 0; d < days; d++) env.step();
      // 手工开一起案子（检测本身另有用例），看处置的效果。
      W.BASE = 1;
      const c = runToCase(env, 1);
      const rep0 = env.B.s.rep;
      const ratio = caseRatio(env.w, c);
      W.BASE = BASE0;
      return { env, c, ratio, rep0 };
    };
    const a = hit(4), b = hit(9), f = hit(4, ':spread');
    for (const x of [a, b, f]) assert.ok(x.c.choice === 'accuse' && x.ratio >= W.EVID_FRAC, `比例 ${x.ratio}`);
    const loss = x => -(x.env.B.s.vShocks?.[0]?.log ?? 0);
    assert.ok(Math.abs(loss(b) / loss(a) - Math.log(1 + W.FX.unlisted * b.ratio) / Math.log(1 + W.FX.unlisted * a.ratio)) < 1e-9, '估值减项按比例');
    assert.ok(b.ratio > a.ratio && loss(b) > loss(a));
    assert.ok(Math.abs(loss(f) / loss(a) - Math.log(1 + W.FX.unlisted * f.ratio * 2) / Math.log(1 + W.FX.unlisted * a.ratio)) < 1e-9, '欺诈加倍');
    assert.ok(a.env.w.ix.public.some(x => x.type === 'accuse' && x.to === a.env.B.id));
  });

  it('起诉：按已付 API 费的 3 倍索赔，原告是老师公司；学生和解的钱入账六成', () => {
    W.BASE = 0;
    const env = setup();
    env.picks[env.A.id] = 'sue';
    assert.ok(env.order().ok);
    for (let d = 0; d < 6; d++) env.step();
    W.BASE = 1;
    const a0 = env.A.s.cash;
    // 查出的第二天：老师选起诉，学生收到起诉书选和解（45%），钱经转账在当天收盘入账。
    const c = runToCase(env, 1);
    W.BASE = BASE0;
    assert.equal(c.choice, 'sue');
    const paid = env.w.ix.pairs[`${env.B.id}|${env.A.id}`].orders[c.oid].paid;
    const settle = 0.45 * Math.max(1e6, Math.round(paid * W.FX.sue));
    const fromCase = env.w.ix.recent.filter(x => x.kind === 'case' && x.to === env.A.id).reduce((a, x) => a + x.booked, 0);
    assert.ok(Math.abs(fromCase - settle * TRANSFER.BOOK) < 1, `官司入账 ${fromCase}，和解 ${settle}`);
    const got = env.A.s.cash - a0;
    assert.ok(got >= fromCase - 1 && got <= fromCase + paid * TRANSFER.BOOK + 1, `这几天总入账 ${got}`);
    assert.ok(env.B.s.legal.history.some(h => h.type === 'tos' && h.vendorOrg === env.A.id));
  });

  it('收授权费：学生接着用，剩下的钱 ×3，从此不再检测、不算违约', () => {
    W.BASE = 1;
    const env = setup();
    env.picks[env.A.id] = 'license';
    assert.ok(env.order().ok);
    const c = runToCase(env, 1);
    assert.equal(c.choice, 'license');
    const o = env.B.s.orders.find(x => x.id === c.oid);
    assert.ok(o.licensed);
    for (let d = 0; d < GEN.apiDays; d++) env.step();
    assert.equal(env.cases().length, 1, '授权后不再检测');
    assert.ok(!env.B.s.data.risky[`tos_${env.A.id}`], '不算违约');
    const opt = distillOptions(env.B.s).find(x => x.id === `distill:${env.A.id}:api`);
    assert.equal(opt.cost, 2.5e6 * W.FX.license);
    W.BASE = BASE0;
  });
});

describe('限流、小号、新手保护、电脑老师', () => {
  it('同一对公司每个游戏年最多 2 个包；分散小号多花 40%', () => {
    W.BASE = 0;
    const env = setup();
    assert.ok(env.order(':spread').ok);
    const o = env.B.s.orders.find(x => x.gen?.mode === 'api');
    assert.equal(o.gen.cost, 2.5e6 * W.SPREAD_COST);
    assert.equal(o.acct, 'spread');
    for (let d = 0; d < GEN.apiDays + 1; d++) env.step();
    assert.ok(env.order().ok);
    for (let d = 0; d < GEN.apiDays + 1; d++) env.step();
    const r = env.order();
    assert.equal(r.ok, false);
    assert.match(r.err, /限流/);
    W.BASE = BASE0;
  });

  it('新手保护不免罪：学生进场不满 120 天时查出的案子先挂着，满了再交给老师', () => {
    W.BASE = 1;
    const env = setup({ studentJoined: null });
    assert.ok(env.order().ok);
    const c = runToCase(env);
    assert.equal(c.status, 'held');
    assert.equal(env.A.s.queue.filter(q => q.kind === 'distill_caught').length, 0);
    W.BASE = BASE0;
    while (env.w.day <= c.hold) env.step();
    assert.notEqual(env.w.ix.cases[c.id].status, 'held');
  });

  it('电脑老师当场处置，不进收件箱；证据不足一律封号', () => {
    W.BASE = 1;
    const env = setup({ teacherBot: 'hard' });
    assert.ok(env.order().ok);
    const c = runToCase(env);
    assert.equal(c.status, 'done');
    assert.equal(c.choice, 'ban');
    assert.throws(() => resolveCase(env.w, c.id, 'accuse'), /已经处理过/);
    W.BASE = BASE0;
  });

  it('收件箱压着指控卡时存档读回：卡还在，处理结果和不存档一样', () => {
    W.BASE = 1;
    const env = setup();
    assert.ok(env.order().ok);
    for (let d = 0; d < 5 && !env.cases().length; d++) { env.clear(env.B, 'settle'); env.w.tick(); }
    const c = env.cases()[0];
    assert.ok(c);
    const text = E.serialize(env.w);
    const m = E.migrateWorld(E.deserialize(text));
    assert.ok(m.ok, m.reason);
    const w2 = m.world;
    const A2 = w2.companies[env.A.id];
    const at = A2.s.queue.findIndex(q => q.kind === 'distill_caught' && q.id === c.id);
    assert.ok(at >= 0, '卡还在');
    assert.equal(E.currentEvent(A2.s, at).choices.length, 4);
    E.resolveEvent(A2.s, 'license', at);
    for (let d = 0; d < 3; d++) { for (const x of Object.values(w2.companies)) if (x.kind === 'human') while (x.s.queue.length) E.resolveEvent(x.s, E.currentEvent(x.s).choices.find(y => !y.disabled).id); w2.tick(); }
    // 不存档的那一份走同样几步。
    const m2 = E.migrateWorld(E.deserialize(text));
    const w3 = m2.world;
    const A3 = w3.companies[env.A.id];
    E.resolveEvent(A3.s, 'license', A3.s.queue.findIndex(q => q.kind === 'distill_caught'));
    for (let d = 0; d < 3; d++) { for (const x of Object.values(w3.companies)) if (x.kind === 'human') while (x.s.queue.length) E.resolveEvent(x.s, E.currentEvent(x.s).choices.find(y => !y.disabled).id); w3.tick(); }
    assert.equal(w3.hash(), w2.hash());
    assert.equal(w2.ix.cases[c.id].choice, 'license');
    W.BASE = BASE0;
  });

  it('distillReply 命令按案子 id 处理收件箱里的卡；参数不对一个字都不改', () => {
    W.BASE = 1;
    const env = setup();
    env.picks[env.A.id] = '__none__';
    assert.ok(env.order().ok);
    // 不让 step 自动处理老师的卡：直接 tick，卡会留在甲的队列里。
    for (let d = 0; d < 5 && !env.cases().length; d++) { env.clear(env.B, 'settle'); env.w.tick(); }
    const c = env.cases()[0];
    assert.ok(env.A.s.queue.some(q => q.kind === 'distill_caught' && q.id === c.id));
    const bad = E.applyCommand(env.A.s, { name: 'distillReply', args: { case: c.id, choice: 'nuke' } });
    assert.equal(bad.ok, false);
    assert.equal(env.w.ix.cases[c.id].status, 'open');
    const ok = E.applyCommand(env.A.s, { name: 'distillReply', args: { case: c.id, choice: 'license' } });
    assert.ok(ok.ok, ok.err);
    assert.equal(env.w.ix.cases[c.id].choice, 'license');
    W.BASE = BASE0;
  });
});
