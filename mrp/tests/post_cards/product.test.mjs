import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import { restoreHistory } from '../helpers/world_provider.mjs';
import { activatePostSessions } from '../../src/career/sim/post_plan_state.js';
import { transactPostPlan } from '../../src/career/ui/post_plan_transaction.js';
globalThis.document ??= { baseURI: 'http://localhost/' };
const { startSolo, defaultSolo } = await import('../../src/career/ui/pages/solo_setup.js');
const { preflightSoloPostPlanSave, safeLoadState } = await import('../../src/career/ui/storage.js');
const panel = await import('../../src/career/ui/panels/post_plan.js');
const { setWorld, setMp } = await import('../../src/career/ui/state.js');
afterEach(() => { restoreHistory(); setWorld(null); setMp(null); });
function fresh(id = 'deepseek') { restoreHistory(); return E.createSinglePlayerGame(id, 'y2025', 13); }
function command(s, name, args = {}) { const r = E.applyCommand(s, { name, args }); assert(r.ok, r.err); return r.result; }
function open(s) { return command(s, 'postPlan.open', { modelId: s.working, expectedModelToken: null }); }
function complete(s, v) {
  v = command(s, 'postPlan.confirmDeck', { sessionId: v.sessionId, expectedRevision: v.revision, cardIds: v.deck, directionPolicy: 'model-general' });
  for (let i = 0; i < 6; i++) v = command(s, 'postPlan.choose', { sessionId: v.sessionId, expectedRevision: v.revision, turn: v.turn, cardId: v.hand.find(h=>h.affordable).id }).view;
  return v;
}
function strip(s) { const n = structuredClone(s); delete n.postCards; delete n.postPlanSessions; for (const m of n.models) { delete m.postExposure; delete m.postExposureVersion; } return n; }
test('history product constructor defaults supported companies to an empty valid manual ledger without baseline numeric changes', () => {
  for (const id of ['deepseek', 'qwen']) {
    const s = fresh(id), normal = E.createGame(id, 'y2025', 13);
    assert.deepEqual(strip(s), normal); E.assertPostPlanSaveBoundary(s);
    assert.equal(s.postPlanSessions.format, 'solo-post-plan-catalog-v2'); assert.equal(s.postPlanSessions.nextEpoch, 0);
    assert.deepEqual(s.postPlanSessions.sessions, {}); assert.equal(open(s).controlMode, 'manual');
  }
  const image = fresh('midjourney'); assert.equal(image.postCards.version, 1); assert.equal(image.postPlanSessions.format, 'solo-post-plan-catalog-v2');
  assert.deepEqual(strip(image), E.createGame('midjourney', 'y2025', 13));
});
test('actual solo zero/fork entry initializes just selected human, preserving persona and raw MP/bots', () => {
  for (const mode of ['zero', 'fork']) {
    restoreHistory();
    const r = startSolo({ ...defaultSolo(false,'post'), mode, count: 2, forkKeep: 2, year: '2025', years: 1 }, mode === 'zero' ? 39 : 40);
    E.assertPostPlanSaveBoundary(r.s); assert(r.s.postPlanSessions); assert.equal(r.s.postPlanSessions.nextEpoch, 0);
    for (const c of Object.values(r.world.companies)) if (c.id !== r.playerId && c.s) assert.equal(c.s.postCards, undefined);
    if (mode === 'zero') { assert.equal(r.s.persona.artId, 'qwen'); assert.deepEqual(r.s.company.strengths, ['code', 'math']); }
    assert.equal(preflightSoloPostPlanSave(E.serialize(r.world)).ok, true);
    assert.throws(() => E.createSinglePlayerGame('deepseek', 'y2025', 1), /离开当前世界/);
    assert.throws(() => E.initializeSoloPostPlans({ ...r.world }, r.playerId), /真实单机/);
  }
  restoreHistory(); const w = E.createWorld({ seed: 31, start: '2025-01', days: 2, mp: true, companies: [{ name: '雾灯研究', brand: '雾灯', kind: 'human', tier: 'specialist' }] });
  const c = Object.values(w.companies)[0]; w.settings.you = c.id;
  assert.equal(c.s.postCards, undefined); assert.equal(c.s.postPlanSessions, undefined);
  assert.throws(() => E.initializeSoloPostPlans(w, c.id), /真实单机/);
  assert.equal(E.applyCommand(c.s, { name: 'postPlan.enable', args: {} }, { world: w, multiplayer: true }).ok, false);
});
test('pending normal/auto post gets zero GPU while a real base job progresses at unchanged allocation', () => {
  for (const dir of ['writing', 'auto']) {
    const s = fresh(); s.jobs.list = []; s.queue = []; s.jobs.autoRepair = false;
    const post = E.startJob(s, { kind: 'post', target: 'main', dir, until: 'none' });
    const base = E.startJob(s, { kind: 'pretrain', line: 'main', cfg: { total: 7, active: 7, arch: 'dense', tokens: 1 } });
    const n = structuredClone(s); n.jobs.list = n.jobs.list.filter(j => j.id !== post.id);
    const a = E.allocJobs(s), na = E.allocJobs(n), pending = a.items.find(x => x.job.id === post.id);
    assert.equal(pending.why, 'sessionPending'); assert.equal(pending.cards, 0); assert.equal(pending.share, 0); assert.equal(pending.run, false);
    assert.equal(a.items.find(x => x.job.id === base.id).cards, na.items.find(x => x.job.id === base.id).cards);
    const old = structuredClone(s.models); E.postTick(s, { notes: [] }); assert.deepEqual(s.models, old);
    E.baseTick(s, { notes: [] }); E.baseTick(n, { notes: [] });
    assert(base.pj.done > 0); assert.deepEqual(s.jobs.list.find(j => j.id === base.id).pj, n.jobs.list.find(j => j.id === base.id).pj);
    assert.equal(s.postPlanSessions.nextEpoch, 0);
  }
});
test('new product open still saves before ticket exposure and default manual survives exact current-format reload', async () => {
  const s = fresh(), before = JSON.stringify(s);
  const cmd = { name: 'postPlan.open', args: { modelId: s.working, expectedModelToken: null } };
  await assert.rejects(transactPostPlan(s, cmd, { persist: async () => ({ ok: false, reason: 'main write denied' }) }), /main write denied/);
  assert.equal(JSON.stringify(s), before);
  const v = await transactPostPlan(s, cmd, { persist: async () => ({ ok: true }) }); assert.equal(v.controlMode, 'manual'); assert.equal(v.hand.length, 0);
  const raw = JSON.stringify(s); assert.equal(preflightSoloPostPlanSave(raw).ok, true);
  const loaded = safeLoadState(raw); assert(loaded.ok, loaded.reason); assert.deepEqual(loaded.s.postPlanSessions, s.postPlanSessions);
  const frozen = JSON.stringify(loaded.s.postPlanSessions); panel.entry(loaded.s, {}); panel.entry(loaded.s, {}); assert.equal(JSON.stringify(loaded.s.postPlanSessions), frozen);
});
test('product preflight rejects unsupported and damaged formats without changing raw, live state or Provider', () => {
  const current = fresh(), provider = E.P(), live = JSON.stringify(current), old = E.createGame('deepseek', 'y2025', 4);
  assert.equal(preflightSoloPostPlanSave(old).ok, false);
  for (const mutate of [s => { delete s.postCards; }, s => { s.postPlanSessions.format = 'solo-post-plan-v1'; }, s => { delete s.models[0].postExposure; }, s => { delete s.mod; }, s => { s.mod = 'unknown'; }, s => { s.mod = 'image'; }]) {
    const raw = structuredClone(current); mutate(raw); const before = JSON.stringify(raw);
    assert.equal(preflightSoloPostPlanSave(raw).ok, false); assert.equal(JSON.stringify(raw), before); assert.equal(E.P(), provider); assert.equal(JSON.stringify(current), live);
  }
  const noMode = structuredClone(old); delete noMode.mod;
  const noModeBefore = JSON.stringify(noMode);
  assert.equal(preflightSoloPostPlanSave(noMode).ok, false); assert.equal(JSON.stringify(noMode), noModeBefore); assert.equal(E.P(), provider);
  const r = startSolo({ ...defaultSolo(false,'post'), count: 2 }, 43), doc = JSON.parse(E.serialize(r.world)), p = E.P();
  const saved = JSON.stringify(r.world), human = doc.companies.find(c => c.s.charId === r.playerId).s;
  delete human.postCards; delete human.postPlanSessions; const raw = JSON.stringify(doc);
  assert.equal(preflightSoloPostPlanSave(doc).ok, false); assert.equal(JSON.stringify(doc), raw); assert.equal(E.P(), p); assert.equal(JSON.stringify(r.world), saved);
});
test('automatic evaluation guard is readonly and waits for no-plan, manual work and future replacement activation', () => {
  const s = fresh(); s.techs = ['rlhf']; s.strategy.done = {}; assert.equal(E.postPlanBlocksAutomaticEval(s, s.working), true);
  let v = open(s); assert.equal(E.postPlanBlocksAutomaticEval(s, s.working), true);
  v = complete(s, v); assert.equal(E.postPlanBlocksAutomaticEval(s, s.working), true);
  s.day = v.effectiveFromDay; activatePostSessions(s); assert.equal(E.postPlanBlocksAutomaticEval(s, s.working), false);
  s.techs.push('dpo'); v = command(s, 'postPlan.replan', { sessionId: v.sessionId, expectedRevision: v.revision });
  const before = JSON.stringify(s); assert.equal(E.postPlanBlocksAutomaticEval(s, s.working), true); assert.equal(JSON.stringify(s), before);
  assert.equal(E.postPlanBlocksAutomaticEval({ mod: 'llm' }, 'm'), false); assert.equal(E.postPlanBlocksAutomaticEval({ mod: 'image' }, 'm'), false);
});
test('product entry has no experiment activation and startup hooks do not alter shared constructors', () => {
  const s = fresh(), html = panel.entry(s, {});
  assert.match(html, /选好卡组，手动完成六手训练/); assert.doesNotMatch(html, /待组牌 · 手动演练/); assert.doesNotMatch(html, /data-pp-enable|启用实验/);
  const app = fs.readFileSync(new URL('../../src/career/ui/app.js', import.meta.url), 'utf8');
  assert.match(app, /E\.createSinglePlayerGame\(/);
  const raw = E.createGame('deepseek', 'y2025', 1); assert.equal(raw.postPlanSessions, undefined);
  const unsupportedEntry = panel.entry(raw, {});
  assert.match(unsupportedEntry, /class="pp-warning"/);
  assert.doesNotMatch(unsupportedEntry, /data-pp-enable|data-pp-open/);
});
