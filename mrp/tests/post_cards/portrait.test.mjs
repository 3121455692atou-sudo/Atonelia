import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import { HistoryProvider } from '../../src/career/sim/provider.js';
globalThis.document ??= { baseURI: 'http://localhost/' };
const { presentation, render } = await import('../../src/career/ui/panels/post_plan.js');
const { art } = await import('../../src/career/ui/fmt.js');
const { setState, setWorld, setMp } = await import('../../src/career/ui/state.js');
function fresh() {
  E.setProvider(new HistoryProvider());
  const s = E.createGame('deepseek', 'y2025', 7); s.queue = []; s.jobs.list = [];
  setState(s); setWorld(null); setMp(null); return s;
}
function cmd(s, name, args = {}) { const r = E.applyCommand(s, { name, args }); assert(r.ok, r.err); return r.result; }
test('Pro semantic success/focus/fatigue resolve distinct same-character stage resources', () => {
  const s = fresh(), m = E.workingModel(s), view = { status: 'playing', revision: 1, budget: 6 };
  assert.equal(s.persona.artId, 'deepseek_pro');
  const focused = presentation(s, m, view, {});
  const success = presentation(s, m, view, {}, { revision: 1, instant: 20, tick: 0 });
  const tired = presentation({ ...s, morale: -1 }, m, view, {});
  assert.equal(focused.mood, 'determined'); assert.equal(success.mood, 'happy'); assert.equal(tired.mood, 'worried');
  assert.match(tired.label, /疲惫/);
  assert.equal(new Set([focused.url, success.url, tired.url]).size, 3);
  for (const p of [focused, success, tired]) {
    assert.match(p.url, /^\.\/assets\/thumbs\/deepseek_pro-/); assert.doesNotMatch(p.url, /flash/);
    assert(fs.existsSync(new URL(`../../${p.url}`, import.meta.url)));
  }
  for (const mood of ['neutral', 'happy', 'worried', 'determined']) for (const variant of ['stage', 'card', 'face']) {
    assert(fs.existsSync(new URL(`../../${art('deepseek_pro', variant, mood)}`, import.meta.url)));
  }
});
test('reduced motion preserves semantic mood and selected-model identity', () => {
  const s = fresh(), m = E.workingModel(s), view = { status: 'playing', revision: 1, budget: 0 };
  const before = JSON.stringify(s), regular = presentation(s, m, view, {});
  const old = globalThis.matchMedia; globalThis.matchMedia = () => ({ matches: true });
  try { assert.deepEqual(presentation(s, m, view, {}), regular); } finally { globalThis.matchMedia = old; }
  assert.equal(regular.mood, 'worried'); assert.match(regular.label, /预算/);
  assert.equal(presentation(s, { role: 'small' }, view, {}).characterId, s.persona.smallArtId);
  const qwen = presentation({ ...s, persona: { artId: 'qwen', smallArtId: null } }, m, view, {});
  assert.equal(qwen.characterId, 'qwen'); assert.doesNotMatch(qwen.url, /deepseek/);
  assert.equal(JSON.stringify(s), before);
});
test('real confirmed session renders focus then committed success; stale events do not fake progress', () => {
  const s = fresh(); cmd(s, 'postPlan.enable');
  let v = cmd(s, 'postPlan.open', { modelId: s.working, expectedModelToken: null });
  v = cmd(s, 'postPlan.confirmDeck', { sessionId: v.sessionId, expectedRevision: v.revision, cardIds: v.deck, directionPolicy: 'model-general' });
  const html = render(s, { postPlanSessionId: v.sessionId });
  assert.match(html, /data-mood="determined"/); assert.match(html, /deepseek_pro-determined-stage\.webp/);
  const p = presentation(s, E.workingModel(s), v, {}, { revision: v.revision - 1, instant: 100, tick: 0 });
  assert.equal(p.mood, 'determined');
  const error = presentation(s, E.workingModel(s), v, { postPlanError: '保存失败' });
  assert.equal(error.mood, 'worried'); assert.match(error.label, /未保存/);
});
