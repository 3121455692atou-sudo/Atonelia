import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { researchTick, knowTick } from '../../src/career/sim/research.js';
import { activatePostSessions } from '../../src/career/sim/post_plan_state.js';
import { restoreHistory } from '../helpers/world_provider.mjs';
import { JOBS } from '../../src/career/data/balance.js';
afterEach(restoreHistory);
function fresh(card = true, id = 'deepseek') {
  restoreHistory(); const s = card ? E.createSinglePlayerGame(id, 'y2025', 21) : E.createGame(id, 'y2025', 21);
  s.jobs.list = []; s.jobs.autoRepair = false; s.jobs.repair = false; s.queue = [];
  s.distillDep = 0.3; s.techs = s.techs.filter(t => t !== 'dpo'); E.researchTech(s, 'dpo');
  return s;
}
function cmd(s, name, args = {}) { const r = E.applyCommand(s, { name, args }); assert(r.ok, r.err); return r.result; }
function ready(s, modelId = s.working) {
  let v = cmd(s, 'postPlan.open', { modelId, expectedModelToken: null });
  v = cmd(s, 'postPlan.confirmDeck', { sessionId: v.sessionId, expectedRevision: v.revision, cardIds: v.deck, directionPolicy: 'model-general' });
  for (let i = 0; i < 6; i++) v = cmd(s, 'postPlan.choose', { sessionId: v.sessionId, expectedRevision: v.revision, turn: v.turn, cardId: v.hand.find(h=>h.affordable).id }).view;
  return v;
}
function post(s, dir = 'writing') { return E.startJob(s, { kind: 'post', target: 'main', dir, until: 'none' }); }
function observed(s) { return { research: s.research, know: s.know, dep: s.distillDep, mstat: s.mstat, health: s.health, cash: s.cash, billing: s.computeLedger, rng: s.rng, models: s.models }; }
for (const dir of ['writing', 'auto']) for (const base of [false, true]) test(`pending ${dir}, base=${base}: actual daily research/know/dependency/billing equals no-post baseline`, () => {
  const s = fresh(), j = post(s, dir);
  if (base) E.startJob(s, { kind: 'pretrain', line: 'main', cfg: { total: 7, active: 7, arch: 'dense', tokens: 1 } });
  const noPost = structuredClone(s); noPost.jobs.list = noPost.jobs.list.filter(x => x.id !== j.id);
  assert.deepEqual(E.heavyWork(s), E.heavyWork(noPost)); assert.equal(E.heavyWork(s).busy, JOBS.RESEARCH.free);
  const beforeKnow = s.know, beforeDep = s.distillDep, beforeResearch = s.research[0].done;
  for (let day = 0; day < 3; day++) {
    assert.equal(E.researchSpeed(s), E.researchSpeed(noPost));
    const it = E.allocJobs(s).items.find(x => x.job.id === j.id); assert.equal(it.why, 'sessionPending'); assert.equal(it.cards, 0);
    s.queue = []; noPost.queue = []; E.tickDay(s); E.tickDay(noPost);
    assert.deepEqual(observed(s), observed(noPost));
  }
  assert(s.know > beforeKnow); assert(s.distillDep < beforeDep); assert(s.research[0].done > beforeResearch);
  assert.equal(s.postPlanSessions.nextEpoch, 0);
});
test('cardUnsupported bench reserves neither cards nor team, while legacy bench remains original heavy work', () => {
  const s = fresh(), b = E.startJob(s, { kind: 'post', target: 'main', bench: 'mmlupro', until: 'none' });
  assert.equal(E.allocJobs(s).items.find(x => x.job.id === b.id).why, 'cardUnsupported'); assert.equal(E.heavyWork(s).kind, 'none');
  const n = structuredClone(s); n.jobs.list = [];
  E.tickDay(s); E.tickDay(n); assert.deepEqual(observed(s), observed(n));
  const legacy = fresh(false); E.startJob(legacy, { kind: 'post', target: 'main', bench: 'mmlupro', until: 'none' });
  assert.deepEqual(E.heavyWork(legacy), { busy: JOBS.RESEARCH.busy, know: JOBS.KNOW.light, kind: 'benchmax' });
});
test('completed future recipe is free today, then activation restores normal team work and real daily training', () => {
  const s = fresh(), j = post(s), v = ready(s), n = structuredClone(s); n.jobs.list = [];
  assert.equal(E.heavyWork(s).kind, 'none'); assert.equal(E.allocJobs(s).items.find(x => x.job.id === j.id).run, false);
  E.tickDay(s); E.tickDay(n); assert.deepEqual(observed(s), observed(n)); assert.equal(s.day, v.effectiveFromDay);
  const normal = structuredClone(s); delete normal.postCards; delete normal.postPlanSessions;
  for (const m of normal.models) { m.post = structuredClone(m.postExposure); delete m.postExposure; delete m.postExposureVersion; }
  s.queue = []; normal.queue = []; E.tickDay(s); E.tickDay(normal);
  assert.equal(E.postPlanView(s, v.sessionId).status, 'active'); assert.equal(E.heavyWork(s).kind, 'post');
  for (const k of ['know', 'distillDep', 'cash', 'health']) assert.equal(s[k], normal[k], k);
  assert.deepEqual(s.research, normal.research); assert.deepEqual(s.mstat, normal.mstat); assert.deepEqual(s.computeLedger, normal.computeLedger);
  assert(E.workingModel(s).postDays > 0);
});
test('an active recipe still reserves team when GPU queued, and during a newer unfinished replacement', () => {
  const s = fresh(), j = post(s), v = ready(s); s.day = v.effectiveFromDay; activatePostSessions(s);
  s.gpus.owned = {}; s.gpus.rented = {};
  assert.equal(E.allocJobs(s).items.find(x => x.job.id === j.id).run, false); assert.equal(E.heavyWork(s).kind, 'post');
  const oldKnow = s.know, dep = s.distillDep; E.postTick(s, { notes: [] }); knowTick(s); researchTick(s);
  assert(s.know > oldKnow); assert.equal(s.distillDep, dep);
  s.techs.push('dpo'); const replacement = cmd(s, 'postPlan.replan', { sessionId: v.sessionId, expectedRevision: v.revision });
  assert.equal(replacement.status, 'draft'); assert.equal(E.heavyWork(s).kind, 'post');
  E.pauseJob(s, j.id, true); assert.equal(E.heavyWork(s).kind, 'none');
  E.setRepair(s, true); assert.deepEqual(E.heavyWork(s), { busy: JOBS.RESEARCH.busy, know: JOBS.KNOW.light, kind: 'repair' });
});
test('repair and another actual active post retain the original research penalty despite one pending job', () => {
  const s = fresh(), main = E.workingModel(s), j = post(s);
  E.setRepair(s, true); assert.equal(E.heavyWork(s).kind, 'repair'); E.setRepair(s, false);
  const small = structuredClone(main); small.id = `${main.id}:side`; small.role = 'small'; s.models.push(small); s.smallWorking = small.id;
  const v = ready(s, small.id); s.day = v.effectiveFromDay; activatePostSessions(s);
  const active = E.startJob(s, { kind: 'post', target: `small:${small.id}`, dir: 'writing', until: 'none' });
  assert.equal(E.allocJobs(s).items.find(x => x.job.id === j.id).why, 'sessionPending');
  assert.equal(E.allocJobs(s).items.find(x => x.job.id === active.id).run, true);
  const n = structuredClone(s); n.jobs.list = n.jobs.list.filter(x => x.id !== j.id);
  assert.equal(E.heavyWork(s).kind, 'post'); assert.equal(E.researchSpeed(s), E.researchSpeed(n));
  E.tickDay(s); E.tickDay(n); assert.deepEqual(observed(s), observed(n));
});
test('unknown schema, broken active receipt/risk/day accounts cannot become free normal training', () => {
  for (const damage of [s => { s.postCards.version = 99; }, s => { s.postPlanSessions.format = 'unknown'; }, s => { delete s.postCards.lastDays; }, s => { E.workingModel(s).postExposureVersion = 99; }, s => { const id = s.postPlanSessions.activeByModel[s.working]; delete s.postPlanSessions.receipts[s.postPlanSessions.sessions[id].receiptId]; }]) {
    const s = fresh(), j = post(s), v = ready(s); s.day = v.effectiveFromDay; activatePostSessions(s); damage(s);
    const before = structuredClone(s.models), it = E.allocJobs(s).items.find(x => x.job.id === j.id);
    assert.equal(it.why, 'cardInvalid'); assert.equal(it.run, false); assert.equal(it.cards, 0); assert.equal(E.heavyWork(s).kind, 'post');
    E.postTick(s, { notes: [] }); assert.deepEqual(s.models, before);
  }
});
test('no-card normal GPU queue, MP/random mode and non-LLM preserve original team classifier', () => {
  const legacy = fresh(false), j = post(legacy); legacy.gpus.owned = {}; legacy.gpus.rented = {};
  assert.equal(E.allocJobs(legacy).items.find(x => x.job.id === j.id).run, false); assert.equal(E.heavyWork(legacy).kind, 'post');
  E.pauseJob(legacy, j.id, true); assert.equal(E.heavyWork(legacy).kind, 'none');
  // No random math is emulated here: this asserts only the unchanged classifier
  // on the separate mode's shape; actual random/server paired proof is root-owned.
  const random = fresh(false); post(random); random.postRandom = { version: 1 }; const normal = E.heavyWork(random);
  assert.deepEqual(normal, { busy: JOBS.RESEARCH.busy, know: JOBS.KNOW.post, kind: 'post' });
  const p = E.P(), oldWorld = p.world; p.world = { settings: { mp: true } };
  try { assert.deepEqual(E.heavyWork(random), normal); } finally { if (oldWorld === undefined) delete p.world; else p.world = oldWorld; }
  const image = E.createGame('midjourney', 'y2025', 21); image.jobs.list = [];
  E.startJob(image, { kind: 'post', target: 'main', dir: E.directionsFor(image)[0].key, until: 'none' });
  assert.equal(E.heavyWork(image).kind, 'post');
});
