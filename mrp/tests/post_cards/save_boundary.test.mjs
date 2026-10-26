import { quarterCap } from '../../src/career/world/supply_state.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { HistoryProvider } from '../../src/career/sim/provider.js';
import { newModel } from '../../src/career/sim/projects.js';
import { safeLoadState } from '../../src/career/ui/storage.js';
function fresh() {
  E.setProvider(new HistoryProvider()); const s = E.createGame('deepseek', 'y2025', 7); s.jobs.list = []; s.queue = [];
  const r = E.applyCommand(s, { name: 'postPlan.enable' }); assert(r.ok, r.err);
  return s;
}
test('external history rejects kernel-only/unknown/current damaged formats without changing raw', () => {
  const s = fresh();
  for (const mutate of [x => delete x.postPlanSessions, x => x.postPlanSessions.format = 'old', x => delete x.models[0].postExposureVersion]) {
    const raw = structuredClone(s); mutate(raw); const before = JSON.stringify(raw), provider = E.P();
    const result = safeLoadState(raw); assert.equal(result.ok, false); assert.match(result.reason, /后训练|旧版|卡牌/);
    assert.equal(JSON.stringify(raw), before); assert.equal(E.P(), provider);
  }
  const result = safeLoadState(s); assert.equal(result.ok, true, result.reason); assert.deepEqual(result.s.postPlanSessions, s.postPlanSessions);
});
test('newly completed model has a zero risk account before its first training day/save', () => {
  const s = fresh(), m = newModel(s, { total: 7, active: 7, arch: 'dense' }); s.models.push(m);
  assert.equal(m.postExposureVersion, 1); assert.deepEqual(m.postExposure, { own: 0, dist: 0, teachers: {} });
  assert.notEqual(m.postExposure, m.post);
  const result = safeLoadState(s); assert(result.ok, result.reason);
});
test('world early boundary rejects old card and multiplayer mixed formats without replacing provider/input', () => {
  for (const mode of ['kernel-only', 'unknown', 'mp', 'missing-days', 'missing-plans', 'invalid-day', 'missing-risk']) {
    const s = fresh(); if (mode === 'kernel-only') delete s.postPlanSessions; if (mode === 'unknown') s.postPlanSessions.format = 'old';
    if (mode === 'missing-days') delete s.postCards.lastDays;
    if (mode === 'missing-plans') delete s.postCards.plans;
    if (mode === 'invalid-day') s.postCards.lastTickDay = '2024-02-31';
    if (mode === 'missing-risk') delete s.models[0].postExposure;
    const settings = { mp: mode === 'mp', you: s.charId };
    const raw = { kind: 'world', v: 1, settings, world: { settings, day: s.day, startDay: s.day, rels: [], ver: 0, companies: { [s.charId]: { id: s.charId } } }, companies: [{ s }] };
    raw.world.companies[s.charId].tier0 = s.company.tier; raw.world.companies[s.charId].s = s; raw.world.supply = {}; quarterCap(raw.world, raw.world.day, true);
    const before = JSON.stringify(raw), provider = E.P(), result = E.migrateWorld(raw);
    assert.equal(result.ok, false); assert.match(result.reason, /后训练|旧版|卡牌/);
    assert.equal(JSON.stringify(raw), before); assert.equal(E.P(), provider);
  }
});
