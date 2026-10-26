// 电脑公司（M.3.12）：四档多久想一次、被动档不立项不送评、困难档照顾问第一条、ROUTE_MIX、botPublish 两条规则。
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import { packRisk, PACK_RISK_MAX } from '../../src/career/world/bots.js';
import { P } from '../../src/career/sim/provider.js';
import { ROUTE_MIX } from '../../src/career/data/selfplay.js';
import { advise } from '../../src/career/sim/advisor.js';
import { resolveAll } from '../../src/career/sim/bot.js';
import { restoreHistory } from '../helpers/world_provider.mjs';

after(() => restoreHistory());

const names = ['安', '波', '辰', '丁', '戊', '己'];
function world(levels, seed = 3, days = 20) {
  return E.createWorld({
    seed, start: '2024-01', days,
    companies: levels.map((level, i) => ({ name: `${names[i]}智能`, brand: names[i], country: ['US', 'CN', 'EU'][i % 3], tier: 'specialist', kind: 'bot', bot: level })),
  });
}
function run(w, days) {
  for (let i = 0; i < days; i++) {
    const r = w.tick();
    assert.equal(r.paused, undefined, `第 ${i} 天不应暂停`);
  }
}

describe('电脑公司（M.3.12）', () => {
  it('四档“多久想一次”：简单 14、普通 7、困难 3、被动 1 天', () => {
    const w = world(['easy', 'normal', 'hard', 'passive'], 3, 20);
    run(w, 20);
    const by = Object.fromEntries(Object.values(w.companies).map(c => [c.bot, c]));
    assert.deepEqual(by.easy.thinkDays, ['2024-01-01', '2024-01-15']);
    assert.deepEqual(by.normal.thinkDays, ['2024-01-01', '2024-01-08', '2024-01-15']);
    assert.deepEqual(by.hard.thinkDays, ['2024-01-01', '2024-01-04', '2024-01-07', '2024-01-10', '2024-01-13', '2024-01-16', '2024-01-19']);
    assert.equal(by.passive.thinkDays.length, 20);
    for (const c of Object.values(w.companies)) assert.equal(c.s.route.stance, ROUTE_MIX[(c.seat + 3) % 3]);
  });

  it('被动档不立项、不送评；产品照开', () => {
    const w = world(['passive'], 3, 120);
    const before = w.companies[Object.keys(w.companies)[0]].s.models.length;
    // 先验证截止前的被动行为，再验证最后一天仍保持被动并正确结算。
    run(w, 119);
    const s = Object.values(w.companies)[0].s;
    assert.equal(s.jobs.list.length, 0, '被动档不应立项目');
    assert.equal(s.evals.length, 0, '被动档不应送评');
    assert.equal(s.models.length, before, '被动档不应有新模型');
    // 产品照开、续买数据、生成订单由 freeOps 负责；没有在线模型时产品开不起来，这里只要求不报错。
    assert.equal(s.status, 'playing');
    assert.equal(w.day, w.end, '最后一天尚未日结');
    assert.equal(w.result, undefined);
    run(w, 1);
    assert.equal(s.jobs.list.length, 0, '最后一天也不立项目');
    assert.equal(s.evals.length, 0, '最后一天也不送评');
    assert.equal(s.models.length, before, '最后一天也不产生新模型');
    assert.equal(s.status, 'ended', '完成全部 120 天后必须结算');
    assert.equal(s.result.kind, 'world');
    assert.equal(w.result.settledThrough, w.end);
    assert.equal(w.tickNo, 120);
    assert.deepEqual(w.errors, [], '被动档正常运行到期，不是崩溃退出');
  });

  it('困难档照顾问 advise() 的第一条建议做', () => {
    const w = world(['hard'], 7, 1);
    const s = Object.values(w.companies)[0].s;
    resolveAll(s);
    const first = advise(s).find(a => a.kind !== 'event');
    assert.ok(first, '开局应该至少有一条建议');
    const a = E.followAdvice(s);
    assert.ok(a, '困难档应该照做一条建议');
    assert.equal(a.id, first.id);
  });

  it('从零局的电脑公司按种子轮流取 ROUTE_MIX', () => {
    for (const seed of [0, 1, 2]) {
      const w = world(['normal', 'normal', 'normal'], seed, 1);
      const got = Object.values(w.companies).sort((a, b) => a.seat - b.seat).map(c => c.s.route.stance);
      assert.deepEqual(got, [0, 1, 2].map(i => ROUTE_MIX[(i + (seed % 3)) % 3]));
    }
  });

  it('botPublish：开源 / 受限开源路线发全部首创技术；其余路线只在藏不住或满 365 天时发', () => {
    const w = world(['normal', 'normal'], 4, 1);
    const [open, closed] = Object.values(w.companies).sort((a, b) => a.seat - b.seat);
    open.s.route.stance = 'open';
    closed.s.route.stance = 'closed';
    for (const c of [open, closed]) {
      c.s.firsts.moe = c.s.day;
      c.s.firsts.dpo = c.s.day;
      c.s.papers = {};
    }
    E.botPublish(w, open);
    assert.ok(open.s.papers.moe && open.s.papers.dpo, '开源路线要附上全部首创技术');
    E.botPublish(w, closed);
    assert.ok(!closed.s.papers.moe, '还没藏不住，闭源路线不该发');
    w.tech.moe = { level: 'proof', by: 'other', since: w.day, cal: false };
    E.botPublish(w, closed);
    assert.ok(closed.s.papers.moe, '别家做到 proof 以后就该发');
    closed.s.firsts.dpo = '2021-01-01';
    E.botPublish(w, closed);
    assert.ok(closed.s.papers.dpo, '自己做出来满 365 天也该发');
  });

  it('策略只用 adaptive：SimProvider 的 STRATEGY 固定 adaptive，bot.js 从这里读', () => {
    const w = world(['normal'], 3, 1);
    const s = Object.values(w.companies)[0].s;
    assert.equal(P().botParams(s).STRATEGY, 'adaptive');
    const src = fs.readFileSync(new URL('../../src/career/sim/bot.js', import.meta.url), 'utf8');
    assert.match(src, /pickStrategy\(s, P\(\)\.botParams\?\.\(s\)\?\.STRATEGY \?\? 'historic'\)/);
  });

  it('M2 的三列都接上了：炒股、困难档的闭源 API 蒸馏（单包风险 < 10% 才用）、当老师时的处置', () => {
    assert.equal(typeof E.tradeTick, 'function');
    assert.equal(typeof E.distillTick, 'function');
    assert.equal(typeof E.accuseTick, 'function');
    const w = E.createWorld({ seed: 2, start: '2024-01', days: 60, companies: [
      { name: '甲智能', brand: '甲甲', country: 'US', tier: 'specialist', kind: 'bot', bot: 'hard' },
      { name: '乙智能', brand: '乙乙', country: 'US', tier: 'specialist', kind: 'bot', bot: 'normal' },
    ] });
    const [a, b] = Object.values(w.companies);
    assert.ok(packRisk(w, b.id) < PACK_RISK_MAX, `标准防护的单包风险 ${packRisk(w, b.id)}`);
    b.s.service.antiDistill = 'strict';
    assert.ok(packRisk(w, b.id) >= PACK_RISK_MAX, '对方开严格防护时困难档不用 API');
    // 普通档不碰闭源 API。
    assert.equal(E.distillTick(w, b), null);
    void a;
  });
});
