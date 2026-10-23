// 学界与开源社区（M.3.7）：起点表、月度跟进节奏、−1 上限、A 标签、isNpc。
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { ACAD_START } from '../../src/career/data/academia.js';
import { FAMILIES, relById } from '../../src/career/data/rivals.js';
import { addDays } from '../../src/career/sim/clock.js';
import { P } from '../../src/career/sim/provider.js';
import { acadFollow, acadTarget } from '../../src/career/world/academia.js';
import { restoreHistory } from '../helpers/world_provider.mjs';

const companies = (stance = 'open') => [
  { name: '晨星智能', brand: '晨星', country: 'US', tier: 'specialist', kind: 'bot', stance },
  { name: '北岭智能', brand: '北岭', country: 'CN', tier: 'specialist', kind: 'bot', stance },
];
const fakeRow = (world, org, id, q, day, open) => {
  world.relMeta[id] = { org, relId: id, modelId: null, name: id, q, dims: { knowledge: q, code: q, math: q, writing: q, agent: q }, day, open, kin: [], seq: 999 };
};

after(() => restoreHistory());

describe('学界与开源社区（M.3.7）', () => {
  it('起点按开局年、最弱档查表；发布行带 A 标签；isNpc 为真', () => {
    const world = E.createWorld({ seed: 31, start: '2024-01', days: 1, companies: companies() });
    assert.equal(world.acad.start, ACAD_START[2024].specialist);
    const rel = relById(world.acad.startRelId);
    assert.ok(rel, '起点行要进世界发布表');
    assert.ok(rel.tags.includes('A'), '学界行的 tags 要带 A');
    assert.equal(rel.family, 'academia');
    assert.equal(world.relMeta[world.acad.startRelId].org, 'academia');
    assert.equal(FAMILIES.academia.org, 'academia');
    assert.equal(P().isNpc('academia'), true);
    assert.equal(P().isNpc(world.settings.companies[0].id), false);
  });

  it('开源发布满 90 天后跟进到 q−2，月初不重复；永远低公司最强 1 分以上', () => {
    const world = E.createWorld({ seed: 32, start: '2024-01', days: 1, companies: companies() });
    const b = E.companyList(world)[0];
    fakeRow(world, b.id, 'open1', 60, '2024-01-01', true);
    assert.equal(acadFollow(world, '2024-03-30'), null, '还没满 90 天，不该跟进');
    const t0 = acadTarget(world, '2024-04-01');
    assert.ok(t0.target <= t0.best - 1 + 1e-6, '目标不能超过公司最强 - 1');
    const row = acadFollow(world, '2024-04-01');
    assert.ok(row, '满了 90 天应追加一行');
    assert.ok(world.acad.q >= 57.5 && world.acad.q <= 58.01, `跟进值应约为 58，实际 ${world.acad.q}`);
    assert.equal(relById(row.relId).tags.includes('A'), true);
    assert.equal(acadFollow(world, '2024-04-01'), null, '同一天不该再追加');
  });

  it('−1 上限：公司最强只比学界高不到 1 分时，学界不动', () => {
    const world = E.createWorld({ seed: 33, start: '2024-01', days: 1, companies: companies() });
    const b = E.companyList(world)[0];
    const start = world.acad.start;
    fakeRow(world, b.id, 'open2', start + 0.4, '2024-01-01', true);
    const t = acadTarget(world, '2024-04-01');
    assert.ok(t.target <= t.best - 1 + 1e-6);
    assert.equal(acadFollow(world, '2024-04-01'), null);
    assert.equal(world.acad.q, start);
  });

  it('月度跟进只发生在月末，行日期就是当天', () => {
    const world = E.createWorld({ seed: 34, start: '2024-01', days: 365, companies: companies('open') });
    for (let i = 0; i < 365; i++) {
      const res = E.tick(world);
      assert.equal(res.paused, undefined);
    }
    const rows = world.acad.log.slice(1);
    assert.ok(rows.length > 0, '全员开源 365 天里学界应该跟进过');
    for (const line of rows) {
      const day = line.slice(0, 10);
      assert.notEqual(addDays(day, 1).slice(0, 7), day.slice(0, 7), `学界行 ${day} 不是月末`);
    }
    const best = E.worldBest(world, addDays(world.day, -1));
    assert.ok(world.acad.q <= best - 1 + 1e-6, `学界 ${world.acad.q} 应低于公司最强 ${best} 至少 1 分`);
  });
});
