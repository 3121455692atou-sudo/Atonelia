import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { HistoryProvider } from '../../src/career/sim/provider.js';
import { postPlanView, recommendPostSessionCard, validatePostSessionSave } from '../../src/career/sim/post_plan_state.js';
import { postCardEfficiency } from '../../src/career/sim/post_cards.js';

function fresh() {
  E.setProvider(new HistoryProvider());
  const s = E.createGame('deepseek', 'y2025', 1);
  s.queue = []; s.jobs.list = []; s.jobs.autoRepair = false; s.jobs.repair = false; s.health = 90;
  return s;
}
const snapshot = s => JSON.stringify(s);
function cmd(s, name, args = {}, ctx = {}) { const r = E.applyCommand(s, { name, args }, ctx); assert(r.ok, r.err); return r.result; }
function open(s) { cmd(s, 'postPlan.enable'); return cmd(s, 'postPlan.open', { modelId: s.working, expectedModelToken: null }); }
function confirmed(s) {
  const v = open(s);
  return cmd(s, 'postPlan.confirmDeck', { sessionId: v.sessionId, expectedRevision: v.revision, cardIds: ['basic', 'ptc_qwen_sample_tabs', 'ptc_deepseek_pro_tidy_tray', 'ptc_kimi_bookmark_chain'], directionPolicy: 'model-general' });
}
function chooseAvailable(s, v, ctx = {}) { return cmd(s, 'postPlan.choose', { sessionId: v.sessionId, expectedRevision: v.revision, turn: v.turn, cardId: v.hand.find(h=>h.affordable).id }, ctx).view; }

test('draft is manual; opening/reconfirming cannot reroll; view hides ticket and RNG', () => {
  const s = fresh(), v = open(s), epoch = s.postPlanSessions.nextEpoch;
  assert.equal(v.status, 'draft'); assert.equal(v.controlMode, 'manual'); assert.deepEqual(v.hand, []);
  assert.deepEqual(cmd(s, 'postPlan.open', { modelId: s.working, expectedModelToken: null }), v);
  assert.equal(s.postPlanSessions.nextEpoch, epoch);
  const args = { sessionId: v.sessionId, expectedRevision: 0, cardIds: v.deck, directionPolicy: 'model-general' };
  const first = cmd(s, 'postPlan.confirmDeck', args), saved = snapshot(s);
  assert.deepEqual(cmd(s, 'postPlan.confirmDeck', args), first); assert.equal(snapshot(s), saved);
  const wire = JSON.stringify(first);
  assert(!wire.includes('drawTicket')); assert(!wire.includes('rng')); assert(!wire.includes('seed'));
});

test('mode revision is separate from choice revision and accepted actions cannot replay', () => {
  const s = fresh(); let v = confirmed(s);
  v = cmd(s, 'postPlan.setControl', { sessionId: v.sessionId, expectedRevision: v.revision, mode: 'auto', scope: 'session' });
  assert.equal(v.choiceRevision, 0); assert.equal(v.revision, 2);
  const before = snapshot(s);
  const manual = E.applyCommand(s, { name: 'postPlan.choose', args: { sessionId: v.sessionId, expectedRevision: v.revision, turn: v.turn, cardId: 'basic' } });
  assert.equal(manual.ok, false); assert.equal(snapshot(s), before);
  const old = v; v = chooseAvailable(s, v, { postPlanActor: 'auto' });
  assert.equal(v.choiceRevision, 1); assert.equal(v.revision, 3);
  const duplicate = E.applyCommand(s, { name: 'postPlan.choose', args: { sessionId: old.sessionId, expectedRevision: old.revision, turn: old.turn, cardId: 'basic' } }, { postPlanActor: 'auto' });
  assert.equal(duplicate.ok, false);
  v = cmd(s, 'postPlan.setControl', { sessionId: v.sessionId, expectedRevision: v.revision, mode: 'manual', scope: 'session' });
  chooseAvailable(s, v); validatePostSessionSave(s);
});

test('cancel/recreate, direction roundtrip and JSON load preserve model epoch and draw', () => {
  const s = fresh(); let v = confirmed(s); v = chooseAvailable(s, v);
  const j = E.startJob(s, { kind: 'post', target: 'main', dir: 'writing', until: 'none' });
  E.cancelJob(s, j.id); const j2 = E.startJob(s, { kind: 'post', target: 'main', dir: 'writing', until: 'none' });
  E.setPost(s, j2.id, { dir: 'code' }); E.setPost(s, j2.id, { dir: 'writing' });
  assert.deepEqual(cmd(s, 'postPlan.open', { modelId: s.working, expectedModelToken: v.generationToken }), v);
  const loaded = E.migrateGame(JSON.parse(snapshot(s))); assert(loaded.ok, loaded.reason);
  assert.deepEqual(postPlanView(loaded.s, v.sessionId), v);
  assert.equal(loaded.s.postPlanSessions.nextEpoch, 1);
});

test('unknown parameters, locked deck, stale identity and MP contexts reject without writes', () => {
  const s = fresh(), v = open(s);
  const bad = [
    { name: 'postPlan.choose', args: { sessionId: v.sessionId, expectedRevision: 0, turn: 1, cardId: 'basic', rate: 1 } },
    { name: 'postPlan.open', args: { modelId: s.working, expectedModelToken: 'wrong-generation' } },
    { name: 'postPlan.confirmDeck', args: { sessionId: v.sessionId, expectedRevision: 0, cardIds: ['basic', 'basic', 'ptc_deepseek_pro_tidy_tray', 'ptc_qwen_sample_tabs'], directionPolicy: 'model-general' } },
  ];
  for (const action of bad) { const before = snapshot(s); assert.equal(E.applyCommand(s, action).ok, false); assert.equal(snapshot(s), before); }
  for (const ctx of [{ multiplayer: true }, { world: { settings: { mp: true } } }]) {
    const before = snapshot(s); assert.equal(E.applyCommand(s, { name: 'postPlan.enable' }, ctx).ok, false); assert.equal(snapshot(s), before);
  }
  const world = { companies: { [s.charId]: { s } }, settings: { mp: true }, seq: 0, log: [] };
  const before = snapshot(world); assert.equal(E.applyNow(world, s.charId, { name: 'postPlan.enable' }).ok, false); assert.equal(snapshot(world), before);
});

test('ready receipt does not grant training; first payout is a future actual day', () => {
  const s = fresh(); let v = confirmed(s);
  const m = E.workingModel(s), beforeDims = structuredClone(m.dims), beforePostDays = m.postDays || 0;
  for (let i = 0; i < 6; i++) v = chooseAvailable(s, v);
  assert.equal(v.status, 'ready'); assert.deepEqual(m.dims, beforeDims); assert.equal(m.postDays || 0, beforePostDays);
  const j = E.startJob(s, { kind: 'post', target: 'main', dir: 'writing', until: 'none' });
  assert.equal(E.allocJobs(s).items.find(it => it.job.id === j.id).why, 'sessionPending');
  assert.throws(() => postCardEfficiency(s, j, m));
  E.tickDay(s); assert.deepEqual(m.dims, beforeDims); assert.equal(m.postDays || 0, beforePostDays);
  E.tickDay(s); assert.equal(postPlanView(s, v.sessionId).status, 'active'); assert(postCardEfficiency(s, j, m) <= 1);
  assert((m.postDays || 0) > beforePostDays); assert(m.dims.writing >= beforeDims.writing);
  const once = snapshot(s); // postTick already settled the previous processed day; use its day marker.
  const last = s.postCards.lastTickDay; s.day = last;
  const atDay = snapshot(s); E.postTick(s, { notes: [] }); assert.equal(snapshot(s), atDay);
  assert(once.length > 0);
});

test('auto uses the same revealed options and six-step scoring as manual', () => {
  const manual = fresh(), first = confirmed(manual), automatic = structuredClone(manual);
  let a = first, b = cmd(automatic, 'postPlan.setControl', { sessionId: first.sessionId, expectedRevision: first.revision, mode: 'auto', scope: 'session' });
  while (a.status === 'playing') {
    const id = recommendPostSessionCard(automatic, b.sessionId);
    a = cmd(manual, 'postPlan.choose', { sessionId: a.sessionId, expectedRevision: a.revision, turn: a.turn, cardId: id }).view;
    b = cmd(automatic, 'postPlan.choose', { sessionId: b.sessionId, expectedRevision: b.revision, turn: b.turn, cardId: id }, { postPlanActor: 'auto' }).view;
  }
  assert.equal(a.score, b.score); assert.deepEqual(a.preparation, b.preparation); assert.deepEqual(a.log, b.log);
});

test('unknown session format and corrupted independent revisions fail current-format load', () => {
  const s = fresh(); confirmed(s);
  for (const corrupt of [x => x.postPlanSessions.format = 'old-experiment', x => Object.values(x.postPlanSessions.sessions)[0].choiceRevision = 3]) {
    const raw = structuredClone(s); corrupt(raw); const before = snapshot(raw), result = E.migrateGame(raw);
    assert.equal(result.ok, false); assert.equal(snapshot(raw), before);
  }
});

test('a new actual model receives a new persistent epoch and cannot inherit the old session', () => {
  const s = fresh(), old = confirmed(s), m = E.workingModel(s);
  const next = { ...structuredClone(m), id: `${m.id}_new`, gen: m.gen + 1 };
  s.models.push(next); s.working = next.id;
  const before = snapshot(s);
  assert.equal(E.applyCommand(s, { name: 'postPlan.choose', args: { sessionId: old.sessionId, expectedRevision: old.revision, turn: 1, cardId: 'basic' } }).ok, false);
  assert.equal(snapshot(s), before); assert.equal(postPlanView(s, old.sessionId).readOnly, true);
  const v = cmd(s, 'postPlan.open', { modelId: next.id, expectedModelToken: null });
  assert.equal(v.planEpoch, old.planEpoch + 1); assert.notEqual(v.generationToken, old.generationToken);
  assert.deepEqual(v.hand, []); assert.equal(v.controlMode, 'manual');
});

test('loss of unlock eligibility cannot partially commit a control change', () => {
  const s = fresh(), draft = open(s), v = cmd(s,'postPlan.confirmDeck',{sessionId:draft.sessionId,expectedRevision:0,cardIds:['basic','ptc_qwen_sample_tabs','ptc_deepseek_pro_tidy_tray','ptc_qwen_paired_preferences'],directionPolicy:'model-general'}); s.techs = s.techs.filter(id => id !== 'dpo');
  const before = snapshot(s);
  assert.equal(E.applyCommand(s, { name: 'postPlan.setControl', args: { sessionId: v.sessionId, expectedRevision: v.revision, mode: 'auto', scope: 'session' } }).ok, false);
  assert.equal(snapshot(s), before);
});
