// 分岔开局（M.2.2）：在场家数、真人挑的公司在场、冻结遗产、初始 world.label 回放、4 个非 LLM 公司不进。
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { SELF } from '../../src/career/data/selfplay.js';
import { COMPANIES } from '../../src/career/data/core.js';
import { blankLabel, offerLabel } from '../../src/career/world/label.js';
import { restoreHistory } from '../helpers/world_provider.mjs';

after(() => restoreHistory());

const r1 = x => Math.round(x * 10) / 10;

// 把开局前的遗产按世界账本规则独立回放一遍，用来核对初始 world.label。
function replayLegacy(world) {
  const fake = { acad: { q: world.acad.start }, label: blankLabel(), relMeta: {}, relSeq: 0, relIds: {} };
  const rows = Object.entries(world.relMeta)
    .filter(([, m]) => m.legacy)
    .sort((a, b) => a[1].day.localeCompare(b[1].day) || (a[1].seq ?? 0) - (b[1].seq ?? 0));
  for (const [relId, m] of rows) {
    fake.relMeta[relId] = m;
    offerLabel(fake, m, m.day);
  }
  return fake.label;
}

describe('分岔开局（M.2.2）', () => {
  for (const year of [2023, 2024, 2025]) {
    it(`${year} 年：在场 12 家、真人挑的一定在场、初始 label 等于回放、图像音乐语音不进`, () => {
      const world = E.createWorld({ mode: 'fork', start: year, seed: 11, days: 120, keep: 12, seats: ['gpt'] });
      const live = Object.values(world.companies).filter(c => !c.frozen);
      const frozen = Object.values(world.companies).filter(c => c.frozen);
      assert.equal(live.length, 12, '在场家数应为 12');
      assert.equal(live.filter(c => c.kind === 'human').length, 1);
      assert.ok(live.some(c => c.id === 'gpt' && c.kind === 'human'), '真人挑的 gpt 一定在场');
      // 4 个非 LLM 公司不进
      for (const id of ['image2', 'midjourney', 'suno', 'elevenlabs']) {
        const c = world.companies[id];
        assert.ok(!c || c.frozen, `${id} 不应在场`);
        assert.ok(!live.some(x => x.id === id));
      }
      // 冻结的公司只留遗产，没有 s
      for (const c of frozen) assert.equal(c.s, null);
      // 初始 label 等于按新规则回放开局前真实发布的结果
      const lab = replayLegacy(world);
      assert.equal(world.label.holder?.org ?? null, lab.holder?.org ?? null);
      assert.equal(world.label.holder?.relId ?? null, lab.holder?.relId ?? null);
      assert.equal(r1(world.label.holder?.q ?? 0), r1(lab.holder?.q ?? 0));
      assert.deepEqual(world.label.field, lab.field);
      // 每家 s.sota 是投影，before 沿用 seedOf
      for (const c of live) {
        assert.equal(c.s.sota.holder?.org ?? null, world.label.holder?.org ?? null);
        assert.equal(c.s.sota.before, c.seed === '★');
      }
    });
  }

  it('被拿掉的公司开局后不发布，但开局前的发布可见、能当遗产', () => {
    const world = E.createWorld({ mode: 'fork', start: 2024, seed: 11, days: 120, keep: 12 });
    const frozen = Object.values(world.companies).filter(c => c.frozen);
    const pick = frozen.find(c => !Object.values(world.companies).some(x => !x.frozen && x.realOrg === c.realOrg)) || frozen[0];
    const before = Object.values(world.relMeta).filter(m => m.org === pick.id && m.day < world.startDay);
    assert.ok(before.length > 0, `${pick.id} 开局前应有真实发布`);
    assert.ok(before.every(m => m.legacy));
    for (let i = 0; i < 120; i++) {
      const r = world.tick();
      assert.equal(r.paused, undefined);
    }
    const after = Object.values(world.relMeta).filter(m => m.org === pick.id && m.day >= world.startDay && !m.legacy);
    assert.deepEqual(after, [], `${pick.id} 冻结后不应再发布`);
  });

  it('keep 小于默认时，真人挑的低排名公司也会被塞进在场名单', () => {
    const world = E.createWorld({ mode: 'fork', start: 2024, seed: 11, days: 1, keep: 3, seats: ['fable'] });
    const live = Object.values(world.companies).filter(c => !c.frozen);
    assert.equal(live.length, 3);
    assert.ok(live.some(c => c.id === 'fable' && c.kind === 'human'));
  });

  it('分岔三个年份各跑 120 天：0 抛错、状态里没有非有限数', () => {
    const badNumbers = (x, at = 'w', seen = new WeakSet(), out = []) => {
      if (typeof x === 'number') { if (!Number.isFinite(x)) out.push(at); }
      else if (x && typeof x === 'object') {
        if (seen.has(x)) return out;
        seen.add(x);
        for (const [k, v] of Object.entries(x)) badNumbers(v, `${at}.${k}`, seen, out);
      }
      return out;
    };
    for (const year of [2023, 2024, 2025]) {
      const world = E.createWorld({ mode: 'fork', start: year, seed: 5, days: 120, keep: SELF.FORK_KEEP.desktop });
      for (let i = 0; i < 120; i++) {
        const r = world.tick();
        assert.equal(r.paused, undefined);
      }
      const errs = Object.values(world.companies).flatMap(c => c.errors || []).concat(world.errors.map(e => e.message));
      assert.deepEqual(errs, []);
      assert.deepEqual(badNumbers({ companies: Object.values(world.companies).map(c => c.s).filter(Boolean), world }), []);
    }
  });

  it('候选池就是 20 家 LLM 公司（24 家减掉图像、音乐、语音 4 家）', () => {
    const llm = COMPANIES.filter(c => c.modality === 'llm').map(c => c.id).sort();
    assert.equal(llm.length, 20);
    const world = E.createWorld({ mode: 'fork', start: 2024, seed: 1, days: 1, keep: 20 });
    assert.deepEqual(Object.keys(world.companies).sort(), llm);
  });
});
