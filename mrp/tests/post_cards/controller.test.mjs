import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { HistoryProvider } from '../../src/career/sim/provider.js';
import { resumePostPlanAuto, stopPostPlanController } from '../../src/career/ui/post_plan_controller.js';
import { setState, setWorld, setMp, clock } from '../../src/career/ui/state.js';
import { commitPostPlanCommand } from '../../src/career/ui/post_plan_transaction.js';
function cmd(s, name, args = {}) { const r = E.applyCommand(s, { name, args }); assert(r.ok, r.err); return r.result; }
function fresh() {
  E.setProvider(new HistoryProvider()); const s = E.createGame('deepseek', 'y2025', 91);
  s.jobs.list = []; s.queue = []; setState(s); setWorld(null); setMp(null); clock.busy = false;
  cmd(s, 'postPlan.enable'); const v = cmd(s, 'postPlan.open', { modelId: s.working, expectedModelToken: null });
  return { s, v: cmd(s, 'postPlan.confirmDeck', { sessionId: v.sessionId, expectedRevision: 0, cardIds: v.deck, directionPolicy: 'model-general' }) };
}
async function withStore(fn) {
  const old = globalThis.localStorage, data = new Map();
  globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
  try { await fn(data); } finally { if (old === undefined) delete globalThis.localStorage; else globalThis.localStorage = old; setState(null); setWorld(null); setMp(null); }
}
test('auto runner never starts for default manual authorization', async () => withStore(async data => {
  const { s, v } = fresh(), before = JSON.stringify(s); let accepted = 0;
  await resumePostPlanAuto(s, v.sessionId, { onAccepted: () => accepted++ });
  assert.equal(accepted, 0); assert.equal(JSON.stringify(s), before); assert.equal(data.size, 0);
}));
test('auto persists each accepted choice and matches manual choices exactly', async () => withStore(async data => {
  const { s, v } = fresh(), manual = structuredClone(s), choices = [];
  await commitPostPlanCommand(s, 'postPlan.setControl', { sessionId: v.sessionId, expectedRevision: v.revision, mode: 'auto', scope: 'session' });
  await resumePostPlanAuto(s, v.sessionId, { onAccepted: result => {
    const saved = JSON.parse(data.get('mrp.sim.v2'));
    assert.equal(saved.postPlanSessions.sessions[v.sessionId].choiceRevision, result.view.choiceRevision);
    choices.push(s.postPlanSessions.sessions[v.sessionId].choices.at(-1));
  }, onError: e => { throw e; } });
  assert.equal(choices.length, 6); assert.equal(E.postPlanView(s, v.sessionId).status, 'ready');
  for (const cardId of choices) { const view = E.postPlanView(manual, v.sessionId); cmd(manual, 'postPlan.choose', { sessionId: view.sessionId, expectedRevision: view.revision, turn: view.turn, cardId }); }
  assert.deepEqual(E.postPlanView(s, v.sessionId).log, E.postPlanView(manual, v.sessionId).log);
  assert.deepEqual(E.workingModel(s).dims, E.workingModel(manual).dims); assert.equal(clock.busy, false);
}));
test('close cancels next auto action without undo; reopening resumes same authorized transcript', async () => withStore(async () => {
  const { s, v } = fresh(); await commitPostPlanCommand(s, 'postPlan.setControl', { sessionId: v.sessionId, expectedRevision: v.revision, mode: 'auto', scope: 'session' });
  await resumePostPlanAuto(s, v.sessionId, { onAccepted: () => stopPostPlanController(s) });
  const after = E.postPlanView(s, v.sessionId);
  assert.equal(after.choiceRevision, 1); assert.equal(after.controlMode, 'auto'); assert.equal(after.planEpoch, v.planEpoch);
  await resumePostPlanAuto(s, v.sessionId);
  assert.equal(E.postPlanView(s, v.sessionId).choiceRevision, 6);
}));
test('manual takeover stops automation after last accepted step, no duplicate callbacks', async () => withStore(async () => {
  const { s, v } = fresh(); await commitPostPlanCommand(s, 'postPlan.setControl', { sessionId: v.sessionId, expectedRevision: v.revision, mode: 'auto', scope: 'session' });
  let calls = 0;
  await resumePostPlanAuto(s, v.sessionId, { onAccepted: async result => {
    calls++; stopPostPlanController(s);
    await commitPostPlanCommand(s, 'postPlan.setControl', { sessionId: v.sessionId, expectedRevision: result.view.revision, mode: 'manual', scope: 'session' });
  } });
  const now = E.postPlanView(s, v.sessionId); assert.equal(calls, 1); assert.equal(now.choiceRevision, 1); assert.equal(now.controlMode, 'manual');
  await commitPostPlanCommand(s, 'postPlan.choose', { sessionId: v.sessionId, expectedRevision: now.revision, turn: now.turn, cardId: now.hand.find(h=>h.affordable).id });
  assert.equal(E.postPlanView(s, v.sessionId).choiceRevision, 2);
}));
test('storage failure returns one explicit error without hidden progress; changed game never advances', async () => withStore(async () => {
  const { s, v } = fresh(); await commitPostPlanCommand(s, 'postPlan.setControl', { sessionId: v.sessionId, expectedRevision: v.revision, mode: 'auto', scope: 'session' });
  const before = JSON.stringify(s); let errors = 0, accepted = 0;
  globalThis.localStorage.setItem = () => { throw Error('quota'); };
  await resumePostPlanAuto(s, v.sessionId, { onAccepted: () => accepted++, onError: () => errors++ });
  assert.equal(errors, 1); assert.equal(accepted, 0); assert.equal(JSON.stringify(s), before); assert.equal(clock.busy, false);
  setState({ ...s }); await resumePostPlanAuto(s, v.sessionId);
  assert.equal(JSON.stringify(s), before);
}));
