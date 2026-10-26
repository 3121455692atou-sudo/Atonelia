import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { HistoryProvider } from '../../src/career/sim/provider.js';
import { transactPostPlan, postPlanPending, persistPostPlanDraft } from '../../src/career/ui/post_plan_transaction.js';
function fresh() { E.setProvider(new HistoryProvider()); const s = E.createGame('deepseek', 'y2025', 1); s.jobs.list = []; s.queue = []; return s; }
const enable = { name: 'postPlan.enable', args: {} };

test('history transaction commits only after successful main save; failure leaves live bytes unchanged', async () => {
  const s = fresh(), before = JSON.stringify(s);
  await assert.rejects(transactPostPlan(s, enable, { persist: async () => ({ ok: false, reason: 'disk full' }) }), /disk full/);
  assert.equal(JSON.stringify(s), before); assert.equal(postPlanPending(s), false);
  let release, persisted;
  const latch = new Promise(resolve => { release = resolve; });
  const work = transactPostPlan(s, enable, { persist: async draft => { persisted = structuredClone(draft); return latch; } });
  assert.equal(postPlanPending(s), true); assert.equal(JSON.stringify(s), before); assert(persisted.postPlanSessions);
  await assert.rejects(transactPostPlan(s, enable), /保存/);
  release({ ok: true }); await work;
  assert.deepEqual(s.postPlanSessions, persisted.postPlanSessions); assert.equal(postPlanPending(s), false);
});

test('confirmation reveals no hand until persistence accepts; retry keeps one ticket', async () => {
  const s = fresh(); await transactPostPlan(s, enable, { persist: async () => ({ ok: true }) });
  const v = await transactPostPlan(s, { name: 'postPlan.open', args: { modelId: s.working, expectedModelToken: null } }, { persist: async () => ({ ok: true }) });
  const confirm = { name: 'postPlan.confirmDeck', args: { sessionId: v.sessionId, expectedRevision: 0, cardIds: v.deck, directionPolicy: 'model-general' } };
  const before = JSON.stringify(s);
  await assert.rejects(transactPostPlan(s, confirm, { persist: async () => { throw Error('storage unavailable'); } }), /storage unavailable/);
  assert.equal(JSON.stringify(s), before); assert.equal(E.postPlanView(s, v.sessionId).hand.length, 0);
  const accepted = await transactPostPlan(s, confirm, { persist: async () => ({ ok: true }) });
  assert.equal(accepted.hand.length, 3);
  const ticket = s.postPlanSessions.sessions[v.sessionId].drawTicket;
  await transactPostPlan(s, confirm, { persist: async () => ({ ok: true }) });
  assert.equal(s.postPlanSessions.sessions[v.sessionId].drawTicket, ticket);
});

test('checked history writer surfaces localStorage failure rather than false success', async () => {
  const old = globalThis.localStorage;
  globalThis.localStorage = { setItem() { throw Error('quota'); } };
  try { assert.equal((await persistPostPlanDraft(fresh(), null)).ok, false); }
  finally { if (old === undefined) delete globalThis.localStorage; else globalThis.localStorage = old; }
});

test('world transaction persists prospective company without mutating live world before ack', async () => {
  const s = fresh(), world = { settings: { you: s.charId }, companies: { [s.charId]: { s } } };
  let saw;
  const out = await transactPostPlan(s, enable, { world, persist: async (draft, supplied, live) => {
    assert.equal(supplied, world); assert.equal(live, s); assert.equal(world.companies[s.charId].s.postPlanSessions, undefined);
    saw = structuredClone(draft); return { ok: true };
  } });
  assert(out.enabled); assert.equal(world.companies[s.charId].s, s); assert.deepEqual(s.postPlanSessions, saw.postPlanSessions);
});

test('multiplayer is rejected before persistence; no card state or write', async () => {
  const s = fresh(), before = JSON.stringify(s); let writes = 0;
  await assert.rejects(transactPostPlan(s, enable, { world: { settings: { mp: true } }, persist: async () => { writes++; return { ok: true }; } }), /联机/);
  assert.equal(writes, 0); assert.equal(JSON.stringify(s), before);
});

test('real world main storage acknowledgement gates commit; failed main write preserves original state', async () => {
  const old = globalThis.localStorage, data = new Map([['mrp.world.v1', 'previous-world']]);
  let failMain = true;
  globalThis.localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { if (key === 'mrp.world.v1' && failMain) throw Error('main quota'); data.set(key, String(value)); },
    removeItem: key => data.delete(key),
  };
  try {
    const s = fresh(), world = { settings: { you: s.charId }, seed: 1, day: s.day, companies: { [s.charId]: { id: s.charId, s } } };
    const before = JSON.stringify(s);
    await assert.rejects(transactPostPlan(s, enable, { world }), /main quota/);
    assert.equal(JSON.stringify(s), before); assert.equal(data.get('mrp.world.v1'), 'previous-world');
    failMain = false;
    await transactPostPlan(s, enable, { world });
    assert(s.postPlanSessions); assert.notEqual(data.get('mrp.world.v1'), 'previous-world');
    assert.equal(world.companies[s.charId].s, s);
  } finally { if (old === undefined) delete globalThis.localStorage; else globalThis.localStorage = old; }
});
