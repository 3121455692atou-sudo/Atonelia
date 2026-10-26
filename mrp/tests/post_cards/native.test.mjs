// Native catalogue integration: real constructors/research/strategy/daily steps.
// Pure mechanics remain separately tested; no native multiplayer expansion.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { DIRECTIONS, SCENARIOS, TECH_BY_ID, SCALES } from '../../src/career/data/core.js';
import { TRAIN_PACE } from '../../src/career/data/balance.js';
import { addDays } from '../../src/career/sim/clock.js';
import { activatePostSessions } from '../../src/career/sim/post_plan_state.js';
import { postCardEfficiency } from '../../src/career/sim/post_cards.js';
import { applyGains, postPreview } from '../../src/career/sim/model.js';
import { CARDS, unlocked, validDeck, deckEffect } from '../../src/career/sim/post_catalog_rules.js';
import { nativeCardProfile, postPlanIdentity } from '../../src/career/sim/post_card_profiles.js';
import { researchTick, researchCheck } from '../../src/career/sim/research.js';
import { strategyTick, nodeOf } from '../../src/career/sim/strategy.js';
import { restoreHistory } from '../helpers/world_provider.mjs';
import { transactPostPlan } from '../../src/career/ui/post_plan_transaction.js';
globalThis.document ??= { baseURI: 'http://localhost/' };
const { preflightSoloPostPlanSave, safeLoadState } = await import('../../src/career/ui/storage.js');
const panel = await import('../../src/career/ui/panels/post_plan.js');
const { setWorld, setMp } = await import('../../src/career/ui/state.js');
afterEach(() => { restoreHistory(); setWorld(null); setMp(null); });
const companies = ['image2', 'midjourney', 'suno', 'elevenlabs'];
const starter = ['basic', 'ptc_qwen_sample_tabs', 'ptc_deepseek_pro_tidy_tray', 'ptc_kimi_bookmark_chain'];
const config = s => ({ ...postPlanIdentity(s), rulesVersion:'bounded-dsl-v1', techs: [...s.techs], strategy: { done: { ...s.strategy.done } } });
function fresh(id, scenario = 'y2025') { restoreHistory(); const s = E.createSinglePlayerGame(id, scenario, 27); s.jobs.list = []; s.jobs.repair = false; s.jobs.autoRepair = false; s.queue = []; return s; }
function day(s) { s.day = addDays(s.day, 1); s.date = s.day.slice(0, 7); }
function cmd(s, name, args = {}) { const r = E.applyCommand(s, { name, args }); assert(r.ok, `${name}: ${r.err}`); return r.result; }
// No model injection: when history has no work-in-progress model, build the real
// smallest native base with actual baseTick allocation, time and accumulation.
function target(s) {
  if (E.workingModel(s)) return E.workingModel(s);
  const j = E.startJob(s, { kind: 'pretrain', line: 'main', cfg: { scaleId: SCALES[s.mod][0].id, tokens: 0.3 } });
  for (let n = 0; s.jobs.list.some(x => x.id === j.id) && n < 400; n++) { E.baseTick(s, { notes: [] }); day(s); }
  assert(E.workingModel(s), `${s.charId} native base did not finish`); s.jobs.list = [];
  return E.workingModel(s);
}
function open(s) { target(s); return cmd(s, 'postPlan.open', { modelId: s.working, expectedModelToken: null }); }
function complete(s, v, deck = v.deck) {
  v = cmd(s, 'postPlan.confirmDeck', { sessionId: v.sessionId, expectedRevision: v.revision, cardIds: deck, directionPolicy: v.directionPolicy });
  for (let i = 0; i < 6; i++) v = cmd(s, 'postPlan.choose', { sessionId: v.sessionId, expectedRevision: v.revision, turn: v.turn, cardId: v.hand.find(h=>h.affordable).id }).view;
  return v;
}
function planned(s, dir) { let v = complete(s, open(s), starter); s.day = v.effectiveFromDay; s.date = s.day.slice(0, 7); activatePostSessions(s); const j = E.startJob(s, { kind: 'post', target: 'main', dir, until: 'none' }); return { v: E.postPlanView(s, v.sessionId), j }; }
function strip(s) { const n = structuredClone(s); delete n.postCards; delete n.postPlanSessions; for (const m of n.models) { delete m.postExposure; delete m.postExposureVersion; } return n; }
function normalFrom(s) { const n = strip(s); for (let i = 0; i < n.models.length; i++) n.models[i].post = structuredClone(s.models[i].postExposure); return n; }
function bounded(s, n, before) {
  const m = E.workingModel(s), normal = E.workingModel(n);
  for (const k of Object.keys(m.dims)) {
    assert(m.dims[k] <= normal.dims[k] + 1e-12, `${s.charId} ${k}: ${m.dims[k]} > ${normal.dims[k]}`);
    if (normal.dims[k] < before[k]) assert.equal(m.dims[k], normal.dims[k], `negative ${k}`);
  }
  assert.deepEqual(m.postExposure, normal.post); assert.equal(m.tainted, normal.tainted); assert.equal(s.cash, n.cash);
}
for (const id of companies) for (const scenario of SCENARIOS) test(`native startup ${id}/${scenario.id}: four real legal basics, history inheritance unchanged`, () => {
  restoreHistory(); const s = E.createSinglePlayerGame(id, scenario.id, 27), n = E.createGame(id, scenario.id, 27), p = nativeCardProfile(s);
  assert.deepEqual(strip(s), n); assert(s.techs.includes(p.starter)); assert(validDeck(starter, config(s)));
  assert.equal(s.postPlanSessions.format, 'solo-post-plan-catalog-v2'); assert.equal(s.postPlanSessions.profileId,'catalog-v1');
  assert.equal(s.postPlanSessions.nextEpoch, 0); E.assertPostPlanSaveBoundary(s);
  for (const key of ['starter', 'contrast', 'align', 'finishTech']) assert.equal(TECH_BY_ID[p[key]].mod, s.mod);
  for (const key of ['replay', 'finish']) assert(nodeOf(s, p[key]), `${p[key]} not in actual company tree`);
  for (const c of CARDS) assert.equal(unlocked(c.id, config(s)), unlocked(c.id, config(n)));
});
for (const id of companies) for (const dir of DIRECTIONS[{ image2: 'image', midjourney: 'image', suno: 'music', elevenlabs: 'speech' }[id]].filter(d => !d.special)) for (const avail of [0, 1e20, 1e22]) test(`native bounded complete step ${id}/${dir.key}/${avail}`, () => {
  const s = fresh(id), { j } = planned(s, dir.key), m = E.workingModel(s), n = normalFrom(s), before = structuredClone(m.dims);
  const p = postPreview(s, dir.key, { model: m, avail }); assert(p);
  const gains = Object.fromEntries(Object.entries(p.gains).map(([k, v]) => [k, v / 30 * TRAIN_PACE]));
  const opts = { preMixed: true, sigma: p.sigma, dshare: p.dshare, levels: p.levels };
  applyGains(n, E.workingModel(n), gains, opts); applyGains(s, m, gains, { ...opts, postCardEfficiency: postCardEfficiency(s, j, m) });
  bounded(s, n, before);
});
for (const id of companies) for (const dir of [...DIRECTIONS[{ image2: 'image', midjourney: 'image', suno: 'music', elevenlabs: 'speech' }[id]].filter(d => !d.special).map(d => d.key), 'auto']) test(`native daily ${id}/${dir}: normal costs, risk, negatives and same ticket`, () => {
  const s = fresh(id), { j, v } = planned(s, dir), n = normalFrom(s), before = structuredClone(E.workingModel(s).dims);
  assert(E.allocJobs(s).items.find(it => it.job.id === j.id).run);
  E.postTick(n, { notes: [] }); E.postTick(s, { notes: [] }); bounded(s, n, before);
  for (const k of ['health', 'morale', 'rng']) assert.equal(s[k], n[k], k);
  assert.equal(E.workingModel(s).postDays, E.workingModel(n).postDays);
  assert.equal(s.postPlanSessions.activeByModel[s.working], v.sessionId);
  const once = JSON.stringify(s); E.postTick(s, { notes: [] }); assert.equal(JSON.stringify(s), once);
  for (const d of E.directionsFor(s).filter(d => !d.special)) { E.setPost(s, j.id, { dir: d.key }); assert(E.allocJobs(s).items.find(it => it.job.id === j.id).run); }
  E.cancelJob(s, j.id); E.startJob(s, { kind: 'post', target: 'main', dir: 'auto', until: 'none' });
  assert.equal(open(s).sessionId, v.sessionId); assert.equal(s.postPlanSessions.nextEpoch, 1); E.assertPostPlanSaveBoundary(s);
});
function learn(s, tech) {
  if (s.techs.includes(tech)) return;
  const check = researchCheck(s, TECH_BY_ID[tech]); assert(check.ok, `${tech}: ${check.reason}`);
  E.researchTech(s, tech);
  for (let n = 0; !s.techs.includes(tech) && n < 3000; n++) { researchTick(s); day(s); }
  assert(s.techs.includes(tech), `${tech}: actual research did not finish`);
}
function executeStrategy(s, id) {
  while (s.queue.length) { const view = E.currentEvent(s); const choice = view.choices.find(c => !c.disabled); assert(choice, 'strategy acknowledgement missing'); E.resolveEvent(s, choice.id); }
  if (s.strategy.done[id]) return;
  if (s.strategy.cur?.id !== id) E.startStrategy(s, id);
  for (let n = 0; !s.strategy.done[id] && n < 200; n++) { strategyTick(s, { notes: [] }); day(s); }
  assert(s.strategy.done[id], `${id}: actual strategy did not finish`);
}
for (const id of companies) test(`native actual unlock/replan route ${id}: pending no grant, real research + strategy consume once`, () => {
  const s = fresh(id, 'y2023'), p = nativeCardProfile(s); let v = complete(s, open(s), starter);
  s.day = v.effectiveFromDay; s.date = s.day.slice(0, 7); activatePostSessions(s);
  assert(!s.techs.includes(p.contrast)); assert.equal(E.postPlanView(s, v.sessionId).replan.available, false);
  E.researchTech(s, p.contrast); assert.equal(E.postPlanView(s, v.sessionId).replan.available, false);
  for (let n = 0; !s.techs.includes(p.contrast) && n < 3000; n++) { researchTick(s); day(s); }
  assert(s.techs.includes(p.contrast)); assert(E.postPlanView(s, v.sessionId).replan.available);
  const first = v.sessionId; v = cmd(s, 'postPlan.replan', { sessionId: v.sessionId, expectedRevision: v.revision });
  assert.equal(v.controlMode, 'manual'); assert(s.postPlanSessions.sessions[v.sessionId].grant.cardIds.length>0);
  assert.equal(open(s).sessionId, v.sessionId); assert.equal(s.postPlanSessions.activeByModel[s.working], first);
  assert.equal(E.applyCommand(s, { name: 'postPlan.replan', args: { sessionId: v.sessionId, expectedRevision: v.revision } }).ok, false);
  const full = ['basic','ptc_mistral_neat_batch','ptc_qwen_sample_tabs','ptc_glm_task_tiles']; assert.equal(deckEffect(full).efficiency, 1); v = complete(s, v, full);
  s.day = v.effectiveFromDay; s.date = s.day.slice(0, 7); activatePostSessions(s);
  assert.equal(E.postPlanView(s, v.sessionId).replan.available, false);
  // Strategy tests use normal native calendar/entry/ticks, never write done or
  // fake a LLM prerequisite. Image2's era is a real gate, so wait until eligible.
  if (id === 'image2') while (s.date < '2023-09') day(s);
  if(id==='image2') learn(s,'recaption');
  if(id==='suno'){ learn(s,'lyric_align');executeStrategy(s,'su_bark');executeStrategy(s,'su_chirp'); }
  if(id==='elevenlabs') executeStrategy(s,'el_beta');
  const companyNode={image2:'img_dalle3',midjourney:'mj_v5',suno:'su_v3',elevenlabs:'el_multilingual'}[id];
  if(E.postPlanView(s,v.sessionId).replan.available){v=complete(s,cmd(s,'postPlan.replan',{sessionId:v.sessionId,expectedRevision:v.revision}),full);s.day=v.effectiveFromDay;s.date=s.day.slice(0,7);activatePostSessions(s);}
  const beforeStrategy = E.postPlanView(s, v.sessionId);
  if (!s.strategy.done[companyNode]) {
    if (s.strategy.cur?.id !== companyNode) E.startStrategy(s, companyNode);
    assert.equal(E.postPlanView(s, v.sessionId).replan.available, false);
    executeStrategy(s, companyNode);
    assert(E.postPlanView(s, v.sessionId).replan.available);
    v = cmd(s, 'postPlan.replan', { sessionId: v.sessionId, expectedRevision: v.revision });
    assert(s.postPlanSessions.sessions[v.sessionId].grant.cardIds.length>0);
    v = complete(s, v, full); s.day = v.effectiveFromDay; s.date = s.day.slice(0, 7); activatePostSessions(s);
  } else assert(s.strategy.done[companyNode]);
  E.assertPostPlanSaveBoundary(s);
});
for (const id of companies) test(`native ${id}: every mapped advanced requirement is real and reachable without injected tech/done`, () => {
  const s = fresh(id, 'y2023'), p = nativeCardProfile(s);
  if (id === 'image2') while (s.date < '2023-09') day(s);
  executeStrategy(s, p.replay);
  learn(s, p.contrast);
  if (s.mod === 'image') learn(s, 'dit');
  // Flow-TTS/lyric alignment become eligible through the ordinary date gate;
  // this is a module reachability test, not a claim of a solvent full career.
  while (s.date < '2024-01') day(s);
  learn(s, p.align);
  if (id === 'image2') executeStrategy(s, 'img_ip_shield');
  if (id === 'suno') executeStrategy(s, 'su_chirp');
  executeStrategy(s, p.finish);
  learn(s, p.finishTech);
  assert(s.strategy.done[p.replay]); assert(s.strategy.done[p.finish]);
  assert(s.techs.includes(p.align)); assert(s.techs.includes(p.finishTech));
  assert(CARDS.filter(c=>unlocked(c.id,config(s))).length>=4);
  assert.equal(deckEffect(['basic','ptc_mistral_neat_batch','ptc_qwen_sample_tabs','ptc_glm_task_tiles']).efficiency,1);
});
for (const id of companies) test(`native ${id}: M7 readonly wait, manual/auto, future activation, safe save and wrong profile rejection`, async () => {
  const s = fresh(id); target(s); const m = E.workingModel(s), j = E.startJob(s, { kind: 'post', target: 'main', dir: 'auto', until: 'none' });
  const before = JSON.stringify(s); assert.equal(E.postPlanBlocksAutomaticEval(s, m.id), true); assert.equal(JSON.stringify(s), before);
  assert.equal(E.allocJobs(s).items.find(it => it.job.id === j.id).why, 'sessionPending'); assert.equal(E.heavyWork(s).kind, 'none');
  const command = { name: 'postPlan.open', args: { modelId: m.id, expectedModelToken: null } };
  await assert.rejects(transactPostPlan(s, command, { persist: async () => ({ ok: false, reason: 'native main storage failed' }) }), /native main storage failed/);
  assert.equal(JSON.stringify(s), before);
  let v = await transactPostPlan(s, command, { persist: async () => ({ ok: true }) }); assert.equal(v.controlMode, 'manual'); assert.equal(v.hand.length, 0);
  assert.equal(v.controlMode, 'manual'); assert.equal(E.postPlanBlocksAutomaticEval(s, m.id), true);
  const params = { sessionId: v.sessionId, expectedRevision: v.revision, cardIds: starter, directionPolicy: v.directionPolicy };
  const draft = JSON.stringify(s);
  await assert.rejects(transactPostPlan(s, { name: 'postPlan.confirmDeck', args: params }, { persist: async () => ({ ok: false, reason: 'native confirm failed' }) }), /native confirm failed/);
  assert.equal(JSON.stringify(s), draft);
  v = cmd(s, 'postPlan.confirmDeck', params); const ticket = s.postPlanSessions.sessions[v.sessionId].drawTicket;
  const raw = JSON.stringify(s), provider = E.P(); assert.equal(preflightSoloPostPlanSave(raw).ok, true);
  const restored = safeLoadState(raw); assert(restored.ok, restored.reason); assert.deepEqual(restored.s.postPlanSessions, s.postPlanSessions); assert.equal(E.P(), provider);
  for (const mode of ['auto', 'manual', 'auto', 'manual']) {
    v = cmd(s, 'postPlan.setControl', { sessionId: v.sessionId, expectedRevision: v.revision, mode, scope: 'session' });
    assert.equal(v.choiceRevision, 0); assert.equal(s.postPlanSessions.sessions[v.sessionId].drawTicket, ticket);
  }
  for (let i = 0; i < 6; i++) v = cmd(s, 'postPlan.choose', { sessionId: v.sessionId, expectedRevision: v.revision, turn: v.turn, cardId: v.hand.find(h=>h.affordable).id }).view;
  assert.equal(E.postPlanBlocksAutomaticEval(s, m.id), true); assert.equal(E.heavyWork(s).kind, 'none');
  s.day = v.effectiveFromDay; s.date = s.day.slice(0, 7); activatePostSessions(s);
  const active = JSON.stringify(s); assert.equal(E.postPlanBlocksAutomaticEval(s, m.id), false); assert.equal(JSON.stringify(s), active);
  assert.equal(E.heavyWork(s).kind, 'post'); assert.equal(E.allocJobs(s).items.find(it => it.job.id === j.id).run, true);
  const sessionId = v.sessionId;
  for (const damage of [x => { x.postPlanSessions.profileId = 'native-fake-v1'; }, x => { x.postPlanSessions.modality = 'llm'; }, x => { x.postPlanSessions.sessions[sessionId].profileId = 'native-fake-v1'; }, x => { x.postPlanSessions.sessions[sessionId].unlockProof.config.profileId = 'native-fake-v1'; }, x => { delete x.models[0].postExposure; }, x => { x.postPlanSessions.format = 'solo-post-plan-v2'; }]) {
    const broken = structuredClone(s); damage(broken); const unchanged = JSON.stringify(broken);
    assert.equal(preflightSoloPostPlanSave(broken).ok, false); assert.equal(JSON.stringify(broken), unchanged); assert.equal(E.P(), provider); assert.equal(JSON.stringify(s), active);
  }
  const old = strip(s); assert.equal(preflightSoloPostPlanSave(old).ok, false);
  assert.equal(E.applyCommand(s, { name: 'postPlan.confirmDeck', args: { ...params, directionPolicy: 'llm-general' } }).ok, false);
  setWorld({ settings: { mp: true } }); assert.equal(panel.entry(s, {}), ''); setWorld(null);
  const untouched = JSON.stringify(s); assert.equal(E.applyCommand(s, { name: 'postPlan.open', args: { modelId: m.id, expectedModelToken: null } }, { multiplayer: true }).ok, false); assert.equal(JSON.stringify(s), untouched);
});
for (const id of companies) test(`native ${id}: pending actual daily team/compute equals no-post; corruption stays fail-closed`, () => {
  const s = fresh(id); target(s); const p = nativeCardProfile(s);
  // Research can already be owned historically; choose any actual remaining native tech.
  const tech = Object.values(TECH_BY_ID).find(t => t.mod === s.mod && researchCheck(s, t).ok);
  if (tech) E.researchTech(s, tech.id);
  s.distillDep = 0.3;
  const j = E.startJob(s, { kind: 'post', target: 'main', dir: 'auto', until: 'none' });
  const n = structuredClone(s); n.jobs.list = [];
  for (let i = 0; i < 3; i++) {
    s.queue = []; n.queue = []; E.tickDay(s); E.tickDay(n);
    for (const k of ['research', 'know', 'distillDep', 'mstat', 'cash', 'health', 'rng', 'computeLedger', 'models']) assert.deepEqual(s[k], n[k], `${id}/${k}`);
  }
  assert.equal(s.postPlanSessions.nextEpoch, 0);
  s.postPlanSessions.profileId = p.id + '-unknown';
  const models = structuredClone(s.models); assert.equal(E.allocJobs(s).items.find(it => it.job.id === j.id).why, 'cardInvalid'); assert.equal(E.heavyWork(s).kind, 'post'); E.postTick(s, { notes: [] }); assert.deepEqual(s.models, models);
});
