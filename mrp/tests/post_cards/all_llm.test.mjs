import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { HistoryProvider } from '../../src/career/sim/provider.js';
import { DIRECTIONS } from '../../src/career/data/core.js';
import { TRAIN_PACE } from '../../src/career/data/balance.js';
import { addDays } from '../../src/career/sim/clock.js';
import { activatePostSessions, validatePostSessionSave } from '../../src/career/sim/post_plan_state.js';
import { postCardEfficiency } from '../../src/career/sim/post_cards.js';
import { applyGains, postPreview } from '../../src/career/sim/model.js';

const dirs = DIRECTIONS.llm.filter(d => !d.special).map(d => d.key);
function fresh() {
  E.setProvider(new HistoryProvider()); const s = E.createGame('deepseek', 'y2025', 1);
  s.jobs.list = []; s.queue = []; s.jobs.repair = false; s.jobs.autoRepair = false; s.health = 90;
  if (!s.techs.includes('func_call')) s.techs.push('func_call');
  return s;
}
function cmd(s, name, args = {}) { const r = E.applyCommand(s, { name, args }); assert(r.ok, r.err); return r.result; }
function planned(s, dir = 'writing') {
  cmd(s, 'postPlan.enable'); let v = cmd(s, 'postPlan.open', { modelId: s.working, expectedModelToken: null });
  v = cmd(s, 'postPlan.confirmDeck', { sessionId: v.sessionId, expectedRevision: v.revision, cardIds: v.deck, directionPolicy: 'model-general' });
  for (let i = 0; i < 6; i++) v = cmd(s, 'postPlan.choose', { sessionId: v.sessionId, expectedRevision: v.revision, turn: v.turn, cardId: v.hand.find(h=>h.affordable).id }).view;
  s.day = v.effectiveFromDay; s.date = s.day.slice(0, 7); activatePostSessions(s);
  const j = E.startJob(s, { kind: 'post', target: 'main', dir, until: 'none' });
  return { v: E.postPlanView(s, v.sessionId), j };
}
function normalFrom(s) {
  const n = structuredClone(s); delete n.postCards; delete n.postPlanSessions;
  for (const m of n.models) { m.post = structuredClone(m.postExposure); delete m.postExposure; delete m.postExposureVersion; }
  return n;
}
function checkBounded(s, normal, before) {
  const m = E.workingModel(s), nm = E.workingModel(normal);
  for (const k of Object.keys(m.dims)) {
    assert(m.dims[k] <= nm.dims[k] + 1e-12, `${k}: ${m.dims[k]} > ${nm.dims[k]}`);
    if (nm.dims[k] < before[k]) assert.equal(m.dims[k], nm.dims[k], `negative ${k} must remain undiscounted`);
  }
  assert.deepEqual(m.postExposure, nm.post); assert.equal(m.tainted, nm.tainted); assert.equal(s.cash, normal.cash);
}

for (const dir of dirs) for (const avail of [0, 1e20, 1e22]) test(`v2 ${dir} normal complete step bounded at actual compute ${avail}`, () => {
  const s = fresh(), { j } = planned(s, dir), m = E.workingModel(s), normal = normalFrom(s), before = structuredClone(m.dims);
  const p = postPreview(s, dir, { model: m, avail }); assert(p);
  const gains = Object.fromEntries(Object.entries(p.gains).map(([k, v]) => [k, v / 30 * TRAIN_PACE]));
  const options = { preMixed: true, sigma: p.sigma, dshare: p.dshare, levels: p.levels };
  applyGains(normal, E.workingModel(normal), gains, options);
  applyGains(s, m, gains, { ...options, postCardEfficiency: postCardEfficiency(s, j, m) });
  checkBounded(s, normal, before);
});

for (const dir of [...dirs, 'auto']) test(`v2 real daily ${dir} uses same plan and unmodified costs/risk/RNG`, () => {
  const s = fresh(), { j, v } = planned(s, dir), normal = normalFrom(s), before = structuredClone(E.workingModel(s).dims);
  const item = E.allocJobs(s).items.find(it => it.job.id === j.id); assert(item.run, item.why);
  E.postTick(normal, { notes: [] }); E.postTick(s, { notes: [] });
  checkBounded(s, normal, before);
  assert.equal(E.workingModel(s).postDays, E.workingModel(normal).postDays);
  assert.equal(s.health, normal.health); assert.equal(s.morale, normal.morale); assert.equal(s.rng, normal.rng);
  assert.equal(s.postPlanSessions.activeByModel[s.working], v.sessionId);
  const once = JSON.stringify(s); E.postTick(s, { notes: [] }); assert.equal(JSON.stringify(s), once);
});

test('direction roundtrips, original auto seven-day decisions and cancellation never issue a new ticket', () => {
  const s = fresh(), first = planned(s, 'auto'), id = first.v.sessionId;
  let job = first.j;
  const recipe = JSON.stringify(s.postPlanSessions.sessions[id]);
  for (let i = 0; i < 10; i++) {
    const normal = normalFrom(s), before = structuredClone(E.workingModel(s).dims);
    E.postTick(normal, { notes: [] });
    E.postTick(s, { notes: [] });
    checkBounded(s, normal, before);
    const normalJob = normal.jobs.list.find(j => j.id === job.id);
    for (const key of ['autoDir', 'autoAt', 'autoModel']) assert.equal(job[key], normalJob[key]);
    assert(job.autoDir); assert.equal(s.postPlanSessions.nextEpoch, 1); assert.equal(JSON.stringify(s.postPlanSessions.sessions[id]), recipe);
    s.day = addDays(s.day, 1); s.date = s.day.slice(0, 7);
  }
  for (const dir of [...dirs, 'auto', 'writing']) {
    E.setPost(s, job.id, { dir }); assert(E.allocJobs(s).items.find(it => it.job.id === job.id).run);
    assert.equal(JSON.stringify(s.postPlanSessions.sessions[id]), recipe);
  }
  E.cancelJob(s, job.id); job = E.startJob(s, { kind: 'post', target: 'main', dir: 'math', until: 'none' });
  assert(E.allocJobs(s).items.find(it => it.job.id === job.id).run);
  assert.equal(cmd(s, 'postPlan.open', { modelId: s.working, expectedModelToken: first.v.generationToken }).sessionId, id);
  validatePostSessionSave(s);
});

test('existing auto/ordinary jobs can opt in but bench remains explicitly excluded', () => {
  const s = fresh(); E.startJob(s, { kind: 'post', target: 'main', dir: 'auto', until: 'none' });
  cmd(s, 'postPlan.enable'); assert.equal(E.allocJobs(s).items[0].why, 'sessionPending');
  const t = fresh(); E.startJob(t, { kind: 'post', target: 'main', bench: 'mmlupro', until: 'none' });
  const before = JSON.stringify(t), r = E.applyCommand(t, { name: 'postPlan.enable' });
  assert.equal(r.ok, false); assert.match(r.err, /刷榜/); assert.equal(JSON.stringify(t), before);
});
