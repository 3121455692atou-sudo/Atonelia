// M1b-2 相对目标（M.3.11）：自洽模板五条、share / valMult / topFrac 判定、没达成只扣口碑士气、客户收入口径。
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { buildGoals, resolveGoal } from '../../src/career/sim/board.js';
import { ipoCheck } from '../../src/career/sim/capital.js';
import { rankTopOf, checkShareGoal, checkValMultGoal } from '../../src/career/world/goals.js';
import { CUSTOMER_KEYS } from '../../src/career/world/valuation.js';
import { restoreHistory } from '../helpers/world_provider.mjs';

const names = ['晨星', '北岭', '蓝鲸', '泰拉', '流光', '山巅'];
const companies = (n = 6) => names.slice(0, n).map((name, i) => ({
  name: `${name}智能`, brand: name, country: ['CN', 'US', 'EU'][i % 3], tier: 'specialist', kind: 'bot',
}));
const worldOf = (n = 6) => E.createWorld({ seed: 1, start: '2024-01', days: 730, companies: companies(n) });
const ids = world => Object.keys(world.companies).sort();

after(() => restoreHistory());

describe('相对目标（M.3.11）', () => {
  it('自洽模板五条都生成，开局就有模型的公司也有发布目标', () => {
    const world = worldOf(2);
    for (const id of ids(world)) {
      const s = world.companies[id].s;
      const goals = buildGoals(s, true);
      assert.equal(goals.length, 5, `${id} 只有 ${goals.length} 条目标`);
      assert.deepEqual(goals.map(g => g.id).sort(), ['final', 'self_rank', 'self_release', 'self_share', 'self_value']);
      const release = goals.find(g => g.id === 'self_release');
      assert.equal(release.date, '2024-05', '发布目标不是开局 +4 个月');
    }
  });

  it('topFrac：6 家要前 3，5 家向上取整要前 3', () => {
    assert.equal(rankTopOf({ topFrac: 0.5 }, 6), 3);
    assert.equal(rankTopOf({ topFrac: 0.5 }, 5), 3);
    assert.equal(rankTopOf({ top: 2 }, 6), 2);
  });

  it('share / valMult 的判定和文案', () => {
    const world = worldOf(1);
    const s = world.companies[ids(world)[0]].s;
    s.world.apiShare = 0.10;
    s.world.apiAvg = 0.125;
    assert.equal(checkShareGoal(s, { minFrac: 0.5 }).pass, true, '份额达到平均的一半却没通过');
    s.world.apiShare = 0.05;
    assert.equal(checkShareGoal(s, { minFrac: 0.5 }).pass, false);
    s.valuationStart = 1e9;
    s.valuation = 3e9;
    assert.equal(checkValMultGoal(s, { mult: 3 }).pass, true);
    s.valuation = 2.9e9;
    assert.equal(checkValMultGoal(s, { mult: 3 }).pass, false);
  });

  it('没达成只扣口碑和士气，不记警告、不撤换管理层', () => {
    const world = worldOf(1);
    const s = world.companies[ids(world)[0]].s;
    s.rep = 60;
    s.morale = 0;
    s.strikes = 0;
    s.valuationStart = 1e9;
    s.valuation = 1e9;
    s.goals = [{ id: 'g_val', title: '估值三倍', desc: '', date: s.date, due0: s.date, check: { type: 'valMult', mult: 3 }, status: 'pending' }];
    const r = resolveGoal(s, 'g_val');
    assert.equal(r.outcome, 'failed');
    assert.equal(s.status, 'playing', '自洽里撤换了管理层');
    assert.equal(s.strikes, 0, '自洽里记了警告');
    assert.equal(s.rep, 57, '口碑没有 −3');
    assert.equal(s.morale, -1, '士气没有 −1');
    assert.ok(s.log.at(-1).text.includes('估值三倍'), '没有记进复盘日志');
  });

  it('收入口径：董事会目标和 IPO 都只算客户收入，出租显卡不算', () => {
    const world = worldOf(1);
    const s = world.companies[ids(world)[0]].s;
    s.history.push({ date: '2024-01', revenue: 1e8, rev: { gpu_lease: 1e8 } });
    s.goals = [{ id: 'g_rev', title: '月收入', desc: '', date: s.date, check: { type: 'revenue', min: 1e7 }, status: 'pending' }];
    const bad = resolveGoal(s, 'g_rev');
    assert.equal(bad.pass, false, '出租显卡收入算进了董事会目标');
    s.goals[0].status = 'pending';
    s.history.at(-1).rev = { chat: 2e7 };
    const good = resolveGoal(s, 'g_rev');
    assert.equal(good.pass, true, '客户收入没有算进董事会目标');

    // IPO：同样的收入结构。V 够、市场窗口也开着，但没有两个季度的客户收入。
    s.valuation = 4e9;
    s.capital = { listed: null, ipo: null, round: null, rounds: [] };
    s.legal = { cases: [], history: [] };
    world.index.noShock = 100;
    s.history = [
      { date: '2024-01', revenue: 1e8, rev: { gpu_lease: 1e8 } },
      { date: '2024-02', revenue: 1e8, rev: { gpu_lease: 1e8 } },
      { date: '2024-03', revenue: 1e8, rev: { gpu_lease: 1e8 } },
    ];
    assert.equal(ipoCheck(s).ok, false, '只靠出租显卡也能 IPO');
    assert.match(ipoCheck(s).reason, /客户收入/);
    for (let i = 0; i < 6; i++) {
      const row = { date: `2024-0${(i % 6) + 1}`, revenue: 1e7, rev: {} };
      for (const k of CUSTOMER_KEYS) row.rev[k] = 2e6;
      s.history.push(row);
    }
    assert.equal(ipoCheck(s).ok, true, `有客户收入却不能 IPO：${ipoCheck(s).reason}`);
  });
});
