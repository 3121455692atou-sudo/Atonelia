import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, workingModel, liveModel } from '../../src/career/engine.js';
import { MODALITIES } from '../../src/career/data/core.js';
import { applyEffects, describeEffects } from '../../src/career/sim/effects.js';
import { applyGains } from '../../src/career/sim/model.js';

const companies = { llm: 'kimi', image: 'midjourney', music: 'suno', speech: 'elevenlabs' };
const ctx = { source: 'event', id: 'modality-label-test' };
describe('effect dimension labels are modality-local and display-only', () => {
  for (const [mod, company] of Object.entries(companies)) {
    it(`${mod}: every dimension preview is correctly labeled and read-only`, () => {
      const s = createGame(company, 'y2025', 7), before = structuredClone(s);
      for (const { key, label } of MODALITIES[mod].dims) {
        assert.equal(describeEffects({ dims: { [key]: 3.5 } }, s), `${label} +3.5`);
      }
      assert.deepEqual(s, before);
    });
    for (const target of ['working', 'live']) {
      it(`${mod}/${target}: real gain state (including RNG and ledgers) equals direct applyGains`, () => {
        for (const delta of [3.5, -2, 0, 500]) {
          const s = createGame(company, 'y2025', 7);
          if (target === 'live') s.working = null;
          const twin = structuredClone(s);
          const m = workingModel(s) || liveModel(s), tm = workingModel(twin) || liveModel(twin);
          const gains = Object.fromEntries(MODALITIES[mod].dims.map(d => [d.key, delta]));
          const expected = applyGains(twin, tm, gains);
          const notes = applyEffects(s, { dims: gains }, ctx);
          const label = Object.fromEntries(MODALITIES[mod].dims.map(d => [d.key, d.label]));
          assert.deepEqual(notes, Object.entries(expected.applied).filter(([,x]) => Math.abs(x) >= .05)
            .map(([k,x]) => `${label[k]} ${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(Math.round(x * 10) / 10)}`));
          assert.deepEqual(s, twin);
          assert.equal(m.mod, mod);
        }
      });
    }
  }
  it('settlement uses actual target modality rather than company modality', () => {
    const s = createGame('kimi', 'y2025', 7);
    s.mod = 'speech';
    assert.equal(applyEffects(s, { dims: { safety: -1 } }, ctx)[0], '安全对齐 −1');
  });
  it('missing/unknown modality or foreign dimension uses raw key, never another modality label', () => {
    for (const s of [null, {}, { mod: 'unknown' }]) {
      assert.equal(describeEffects({ dims: { safety: 3.5 } }, s), 'safety +3.5');
    }
    assert.equal(describeEffects({ dims: { knowledge: 1 } }, { mod: 'speech' }), 'knowledge +1');
  });
  it('no target remains a no-op; nested preview retains state modality', () => {
    const s = createGame('kimi', 'y2025', 7);
    s.working = null; s.live = null;
    const before = structuredClone(s);
    assert.deepEqual(applyEffects(s, { dims: { safety: 3.5 } }, ctx), []);
    assert.deepEqual(s, before);
    assert.equal(describeEffects({ if: { then: { dims: { safety: 3.5 } } } }, s), '满足条件时：安全对齐 +3.5');
  });
});
