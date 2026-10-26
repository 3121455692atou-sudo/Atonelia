import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { HistoryProvider } from '../../src/career/sim/provider.js';
import { activatePostSessions, validatePostSessionSave } from '../../src/career/sim/post_plan_state.js';
import { postCardEfficiency } from '../../src/career/sim/post_cards.js';
import { addDays } from '../../src/career/sim/clock.js';
import { researchTick } from '../../src/career/sim/research.js';
import { safeLoadState } from '../../src/career/ui/storage.js';
import { transactPostPlan } from '../../src/career/ui/post_plan_transaction.js';
const json = s => JSON.stringify(s);
function fresh() {
  E.setProvider(new HistoryProvider()); const s = E.createGame('deepseek', 'y2025', 5);
  s.jobs.list = []; s.queue = []; s.research = []; s.jobs.repair = false; s.jobs.autoRepair = false; s.health = 90;
  s.techs = s.techs.filter(id => !['dpo', 'grpo'].includes(id)); s.strategy.done = {};
  return s;
}
function cmd(s, name, args = {}) { const r = E.applyCommand(s, { name, args }); assert(r.ok, r.err); return r.result; }
function open(s) { cmd(s, 'postPlan.enable'); return cmd(s, 'postPlan.open', { modelId: s.working, expectedModelToken: null }); }
function confirm(s, v, deck = v.deck) { return cmd(s, 'postPlan.confirmDeck', { sessionId: v.sessionId, expectedRevision: v.revision, cardIds: deck, directionPolicy: 'model-general' }); }
function finish(s, v) { while (v.status === 'playing') v = cmd(s, 'postPlan.choose', { sessionId: v.sessionId, expectedRevision: v.revision, turn: v.turn, cardId: v.hand.find(h=>h.affordable).id }).view; return v; }
function nextDay(s) { s.day = addDays(s.day, 1); s.date = s.day.slice(0, 7); activatePostSessions(s); }
function replan(s, v) { return cmd(s, 'postPlan.replan', { sessionId: v.sessionId, expectedRevision: v.revision }); }

test('only actual completed new research grants one epoch; unknown client unlocks and pending research do not', () => {
  const s = fresh(); let v = finish(s, confirm(s, open(s)));
  const args = { sessionId: v.sessionId, expectedRevision: v.revision };
  let before = json(s);
  assert.equal(E.applyCommand(s, { name: 'postPlan.replan', args: { ...args, unlocked: ['ptc_qwen_paired_preferences'] } }).ok, false); assert.equal(json(s), before);
  cmd(s, 'researchTech', { id: 'dpo' }); assert(s.research.some(r => r.id === 'dpo')); assert(!s.techs.includes('dpo'));
  before = json(s); assert.equal(E.applyCommand(s, { name: 'postPlan.replan', args }).ok, false); assert.equal(json(s), before);
  for (let i = 0; i < 10000 && !s.techs.includes('dpo'); i++) researchTick(s);
  assert(s.techs.includes('dpo')); const old = structuredClone(s.postPlanSessions.sessions[v.sessionId]);
  const next = replan(s, v); assert.equal(next.planEpoch, v.planEpoch + 1); assert.equal(next.controlMode, 'manual'); assert.equal(next.status, 'draft');
  assert.deepEqual(s.postPlanSessions.sessions[v.sessionId], old);
  assert(s.postPlanSessions.sessions[next.sessionId].grant.cardIds.includes('ptc_qwen_paired_preferences')); assert(s.postPlanSessions.sessions[next.sessionId].grant.cardIds.length > 1);
  before = json(s); assert.equal(E.applyCommand(s, { name: 'postPlan.replan', args }).ok, false); assert.equal(json(s), before);
  validatePostSessionSave(s);
});

test('old active continues through draft/playing/ready, future-day replacement is single and preserves risk/day guard', () => {
  const s = fresh(); let first = finish(s, confirm(s, open(s))); nextDay(s);
  first = E.postPlanView(s, first.sessionId); const j = E.startJob(s, { kind: 'post', target: 'main', dir: 'writing', until: 'none' });
  E.postTick(s, { notes: [] }); const m = E.workingModel(s), oldRate = postCardEfficiency(s, j, m);
  const oldRisk = structuredClone(m.postExposure), oldPost = structuredClone(m.post), guard = structuredClone(s.postCards), oldBudget = E.postPlanView(s, first.sessionId).budget;
  s.techs.push('dpo'); let next = replan(s, first);
  assert.equal(s.postPlanSessions.activeByModel[m.id], first.sessionId); assert.equal(postCardEfficiency(s, j, m), oldRate);
  next = confirm(s, next, ['basic', 'ptc_qwen_sample_tabs', 'ptc_deepseek_pro_tidy_tray', 'ptc_qwen_paired_preferences']);
  assert.equal(postCardEfficiency(s, j, m), oldRate); next = finish(s, next);
  activatePostSessions(s); assert.equal(s.postPlanSessions.activeByModel[m.id], first.sessionId);
  assert.deepEqual(s.postCards, guard); assert.deepEqual(m.postExposure, oldRisk); assert.deepEqual(m.post, oldPost);
  assert.equal(E.postPlanView(s, first.sessionId).budget, oldBudget);
  const settled = json(s); E.postTick(s, { notes: [] }); assert.equal(json(s), settled);
  nextDay(s); assert.equal(s.postPlanSessions.activeByModel[m.id], next.sessionId);
  assert.equal(E.postPlanView(s, first.sessionId).status, 'superseded');
  assert.deepEqual(m.postExposure, oldRisk); assert.deepEqual(m.post, oldPost);
  E.postTick(s, { notes: [] }); assert.equal(s.postCards.lastDays[m.id], s.day); assert.equal(Object.keys(s.postPlanSessions.receipts).length, 2);
  const once = json(s); E.postTick(s, { notes: [] }); assert.equal(json(s), once); validatePostSessionSave(s);
});

test('ready predecessor activates while replacement is unfinished and continues actual training across later days', () => {
  const s = fresh(), old = finish(s, confirm(s, open(s))); s.techs.push('dpo');
  const next = replan(s, old), j = E.startJob(s, { kind: 'post', target: 'main', dir: 'auto', until: 'none' });
  assert.equal(s.postPlanSessions.activeByModel[s.working], undefined);
  nextDay(s); assert.equal(s.postPlanSessions.activeByModel[s.working], old.sessionId);
  const beforeDays = E.workingModel(s).postDays || 0;
  for (let i = 0; i < 3; i++) {
    assert(E.allocJobs(s).items.find(it => it.job.id === j.id).run);
    E.postTick(s, { notes: [] }); nextDay(s);
  }
  assert.equal(E.workingModel(s).postDays, beforeDays + 3);
  assert.equal(E.postPlanView(s, next.sessionId).status, 'draft');
  assert.equal(s.postPlanSessions.activeByModel[s.working], old.sessionId);
  const saved = safeLoadState(json(s)); assert(saved.ok, saved.reason); assert.deepEqual(saved.s.postPlanSessions, s.postPlanSessions);
});

test('cancel, direction, control, save/resume and repeated open cannot manufacture another grant', () => {
  const s = fresh(), first = finish(s, confirm(s, open(s))); nextDay(s);
  s.techs.push('dpo'); let v = replan(s, first), j = E.startJob(s, { kind: 'post', target: 'main', dir: 'auto', until: 'none' });
  v = confirm(s, v); const ticket = s.postPlanSessions.sessions[v.sessionId].drawTicket;
  for (let i = 0; i < 3; i++) {
    E.cancelJob(s, j.id); j = E.startJob(s, { kind: 'post', target: 'main', dir: i % 2 ? 'math' : 'writing', until: 'none' });
    E.setPost(s, j.id, { dir: 'auto' });
    v = cmd(s, 'postPlan.setControl', { sessionId: v.sessionId, expectedRevision: v.revision, mode: 'auto', scope: 'session' });
    v = cmd(s, 'postPlan.setControl', { sessionId: v.sessionId, expectedRevision: v.revision, mode: 'manual', scope: 'session' });
    assert.equal(cmd(s, 'postPlan.open', { modelId: s.working, expectedModelToken: null }).sessionId, v.sessionId);
    assert.equal(s.postPlanSessions.nextEpoch, 2); assert.equal(s.postPlanSessions.sessions[v.sessionId].drawTicket, ticket);
    const loaded = safeLoadState(json(s)); assert(loaded.ok, loaded.reason); assert.deepEqual(loaded.s.postPlanSessions, s.postPlanSessions);
  }
  v = finish(s, v); const before = json(s); assert.equal(E.applyCommand(s, { name: 'postPlan.replan', args: { sessionId: v.sessionId, expectedRevision: v.revision } }).ok, false); assert.equal(json(s), before);
});

test('new company strategy unlock permits another round; uncompleted strategy and previously consumed research do not', () => {
  const s = fresh(); let v = finish(s, confirm(s, open(s)));
  s.strategy.active = { id: 'ds_distill_family' }; assert.equal(E.postPlanView(s, v.sessionId).replan.available, false);
  s.strategy.done.ds_distill_family = true; assert.equal(E.postPlanView(s, v.sessionId).replan.available, true);
  v = replan(s, v); assert(s.postPlanSessions.sessions[v.sessionId].grant.cardIds.includes('ptc_deepseek_distilled_palette'));
  v = finish(s, confirm(s, v, ['basic', 'ptc_qwen_sample_tabs', 'ptc_deepseek_pro_tidy_tray', 'ptc_deepseek_distilled_palette']));
  assert.equal(E.postPlanView(s, v.sessionId).replan.available, false);
  s.techs.push('dpo', 'grpo'); s.strategy.done.ds_grpo = true;
  v = replan(s, v); assert(s.postPlanSessions.sessions[v.sessionId].grant.cardIds.includes('ptc_deepseek_pro_math_service')); assert(s.postPlanSessions.sessions[v.sessionId].grant.cardIds.includes('ptc_qwen_paired_preferences'));
  validatePostSessionSave(s);
});

test('unlocks acquired before confirmation are already usable and cannot be reissued as a later permit', () => {
  const s = fresh(); let v = open(s); s.techs.push('dpo');
  v = finish(s, confirm(s, v, ['basic', 'ptc_qwen_sample_tabs', 'ptc_deepseek_pro_tidy_tray', 'ptc_qwen_paired_preferences']));
  assert.equal(E.postPlanView(s, v.sessionId).replan.available, false);
  const before = json(s); assert.equal(E.applyCommand(s, { name: 'postPlan.replan', args: { sessionId: v.sessionId, expectedRevision: v.revision } }).ok, false); assert.equal(json(s), before);
  validatePostSessionSave(s);
});

test('replan save failure never consumes grant or exposes a new hand; accepted replan persists one epoch', async () => {
  const s = fresh(), v = finish(s, confirm(s, open(s))); s.techs.push('dpo');
  const command = { name: 'postPlan.replan', args: { sessionId: v.sessionId, expectedRevision: v.revision } }, before = json(s);
  await assert.rejects(transactPostPlan(s, command, { persist: async () => ({ ok: false, reason: 'quota' }) }), /quota/);
  assert.equal(json(s), before); assert.equal(E.postPlanView(s, v.sessionId).replan.available, true);
  let saved;
  const next = await transactPostPlan(s, command, { persist: async draft => { saved = structuredClone(draft); return { ok: true }; } });
  assert.equal(next.status, 'draft'); assert.deepEqual(next.hand, []); assert.equal(next.planEpoch, 2); assert.deepEqual(s.postPlanSessions, saved.postPlanSessions);
});

test('v1, corrupt grant, reused consumed unlock and broken active reference reject raw unchanged', () => {
  const s = fresh(), first = finish(s, confirm(s, open(s))); nextDay(s); s.techs.push('dpo'); const next = replan(s, first);
  for (const change of [x => x.postPlanSessions.format = 'solo-post-plan-v1', x => x.postPlanSessions.sessions[next.sessionId].grant.cardIds = ['ptc_qwen_sample_tabs'], x => x.postPlanSessions.generations[x.working].knownUnlocked = ['basic'], x => delete x.postPlanSessions.activeByModel]) {
    const bad = structuredClone(s); change(bad); const before = json(bad), provider = E.P(), loaded = safeLoadState(bad);
    assert.equal(loaded.ok, false); assert.equal(json(bad), before); assert.equal(E.P(), provider);
  }
});

test('two active receipts cannot survive current-format validation', () => {
  const s = fresh(), first = finish(s, confirm(s, open(s))); nextDay(s); s.techs.push('dpo');
  const next = finish(s, confirm(s, replan(s, first))); nextDay(s);
  assert.equal(s.postPlanSessions.sessions[first.sessionId].status, 'superseded');
  s.postPlanSessions.sessions[first.sessionId].status = 'active';
  const before = json(s), loaded = safeLoadState(s); assert.equal(loaded.ok, false); assert.equal(json(s), before);
  assert.equal(s.postPlanSessions.activeByModel[s.working], next.sessionId);
});
