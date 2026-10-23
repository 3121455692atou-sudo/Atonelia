// 技术账本（M.3.6）：公开以后别家研究倍率下降、自家 fLead 少一项、学界目标 +0.4；全员闭源时学界停在起点。
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { TECH_BY_ID } from '../../src/career/data/core.js';
import { techStatus, researchNeed } from '../../src/career/sim/research.js';
import { leadTechs } from '../../src/career/sim/model.js';
import { techUp } from '../../src/career/world/tech.js';
import { acadTarget } from '../../src/career/world/academia.js';
import { restoreHistory } from '../helpers/world_provider.mjs';

const companies = (stance) => [
  { name: '晨星智能', brand: '晨星', country: 'US', tier: 'specialist', kind: 'bot', stance },
  { name: '北岭智能', brand: '北岭', country: 'CN', tier: 'specialist', kind: 'bot', stance },
];

after(() => restoreHistory());

describe('技术账本（M.3.6）', () => {
  it('一家把独门技术发论文：别家研究倍率 2.6 → 1，自家 fLead 少一项，学界目标 +0.4', () => {
    const world = E.createWorld({ seed: 21, start: '2024-06', days: 1, companies: companies('closed') });
    const [a, b] = E.companyList(world);
    const t = TECH_BY_ID.grpo;
    if (!a.s.techs.includes('grpo')) a.s.techs.push('grpo');
    a.s.date = '2024-06';
    b.s.date = '2024-06';
    a.s.day = world.day;
    b.s.day = world.day;

    assert.equal(techStatus(b.s, t).level, 'secret', '还没人公开时是 secret');
    assert.ok(leadTechs(a.s).includes('grpo'), '自家的独门技术应算进 fLead');
    const before = researchNeed(b.s, t);
    const target0 = acadTarget(world, world.day);
    // 造一条闭源的强发布，让学界目标有上限可算。
    world.relMeta.gainrow = { org: b.id, relId: 'gainrow', modelId: null, name: 'g', q: 55, dims: { knowledge: 55, code: 55, math: 55, writing: 55, agent: 55 }, day: world.day, open: false, kin: [], seq: 99 };
    const acad0 = acadTarget(world, world.day).target;

    assert.equal(techUp(world, 'grpo', 'paper', a.id, '发了论文'), true);
    assert.equal(techStatus(b.s, t).level, 'paper', '别家应看到论文');
    const after = researchNeed(b.s, t);
    assert.equal(Math.round((before / after) * 100) / 100, 2.6, `倍率应从 2.6 降到 1，实际 ${before}/${after}`);
    assert.ok(!leadTechs(a.s).includes('grpo'), '自己公开以后 fLead 应少一项');
    assert.ok(world.acad.gains.includes('grpo'), '技术扩散应记一次');
    const acad1 = acadTarget(world, world.day).target;
    assert.equal(Math.round((acad1 - acad0) * 10) / 10, 0.4, `学界目标应 +0.4，实际 ${acad0} → ${acad1}`);
    assert.ok(target0 === null || target0.target <= acad0);
  });

  it('全员闭源跑 120 天：学界一直停在起点', () => {
    const world = E.createWorld({ seed: 22, start: '2024-01', days: 120, companies: companies('closed') });
    const start = world.acad.start;
    for (let i = 0; i < 120; i++) {
      const res = E.tick(world);
      assert.equal(res.paused, undefined);
    }
    assert.equal(world.acad.log.length, 1, '学界不该追加新行');
    assert.equal(world.acad.q, start, '学界应停在起点');
  });
});
