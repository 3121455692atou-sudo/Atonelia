import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import { HistoryProvider } from '../../src/career/sim/provider.js';
import { transactPostPlan } from '../../src/career/ui/post_plan_transaction.js';
import { acceptedFeedback, mountPostPlanFeedback, queuePostPlanFeedback, rejectPostPlanFeedback, disposePostPlanFeedback, selectPostPlanFeedback, postPlanFeedbackDelay, POST_PLAN_MOTION_MS, queuePostPlanDeal, preparePostPlanFeedbackRender } from '../../src/career/ui/post_plan_feedback.js';
import { setState, setWorld, setMp } from '../../src/career/ui/state.js';
import { resumePostPlanAuto, stopPostPlanController } from '../../src/career/ui/post_plan_controller.js';
globalThis.document ??= { baseURI: 'http://localhost/' };
const panel = await import('../../src/career/ui/panels/post_plan.js');

function command(s, name, args = {}) { const r = E.applyCommand(s, { name, args }); assert(r.ok, r.err); return r.result; }
function fresh(deck) {
  E.setProvider(new HistoryProvider());
  const s = E.createSinglePlayerGame('deepseek', 'y2025', 7); s.jobs.list = []; s.queue = [];
  s.techs = [...new Set([...s.techs, 'long_ctx', 'reasoning'])];
  setState(s); setWorld(null); setMp(null);
  const v = command(s, 'postPlan.open', { modelId: s.working, expectedModelToken: null });
  return { s, v: command(s, 'postPlan.confirmDeck', { sessionId: v.sessionId, expectedRevision: v.revision, cardIds: deck || v.deck.slice(0,3), directionPolicy: 'model-general' }) };
}
const choose = (s, v, cardId = 'basic') => command(s, 'postPlan.choose', { sessionId: v.sessionId, expectedRevision: v.revision, turn: v.turn, cardId });

// Minimal DOM double: assertions inspect actual mounted nodes/classes, not a markup regex.
function stage({ reducedMotion = false } = {}) {
  const doc = { createElement: () => new Element(), defaultView: { matchMedia: () => ({ matches: reducedMotion }) } };
  class Element {
    constructor() {
      this.children = []; this.attrs = {}; this.dataset = {}; this.isConnected = true; this.ownerDocument = doc;
      this.properties = new Map(); this.style = { setProperty: (k, v) => this.properties.set(k, v) };
      this.classes = new Set(); this.classList = { add: x => this.classes.add(x), remove: x => this.classes.delete(x) };
    }
    append(node) { node.parent = this; node.parentNode = this; this.children.push(node); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); }
    setAttribute(k, v) { this.attrs[k] = v; }
    getAttribute(k) { return this.attrs[k]; }
    querySelector(key) { return this.selectors?.[key] || null; }
    querySelectorAll(key) { return key === '[data-pp-select]' ? this.cards || [] : []; }
    getBoundingClientRect() { return this.box || { left: 0, top: 0, width: 390, height: 780 }; }
  }
  const root = new Element(); root.selectors = {};
  for (const key of ['[data-pp-score]', '[data-pp-budget]', '.pp-stage', '.pp-hand', '.pp-receipt', '.pp-character img', '.pp-character', '.pp-error', '.pp-decision', ...['focus', 'flow', 'shield', 'boost'].map(x => `[data-pp-buff="${x}"]`)]) {
    root.selectors[key] = new Element(); root.append(root.selectors[key]);
  }
  for (const selector of ['[data-pp-score]', '[data-pp-budget]']) { const node = root.selectors[selector], number = new Element(); number.textContent = 'saved'; node.selectors = { '[data-pp-number]': number }; node.append(number); }
  const card = new Element(), art = new Element(); card.dataset.ppSelect = 'basic'; card.box = { left: 15, top: 450, width: 110, height: 240 }; art.setAttribute('src', 'basic.webp'); art.complete = true; art.naturalWidth = 320; card.selectors = { img: art }; card.append(art); root.cards = [card]; root.append(card);
  root.selectors['.pp-character img'].setAttribute('src', 'happy.webp');
  const nodes = () => {
    const walk = node => [node, ...node.children.flatMap(walk)];
    return walk(root);
  };
  return { root, nodes, effects: () => nodes().filter(x => x.attrs['aria-hidden'] === 'true') };
}

test('feedback uses the exact saved score and net bounded buff changes without altering snapshots', () => {
  const { s, v } = fresh(); const result = choose(s, v, v.hand.find(x => x.id !== 'basic').id);
  const bytes = JSON.stringify({ s, v, result }); const f = acceptedFeedback(result, v);
  assert.equal(f.gain, result.view.score - v.score);
  for (const change of f.buffs) assert.equal(change.delta, result.view[change.key] - v[change.key]);
  assert.equal(JSON.stringify({ s, v, result }), bytes);
  assert.equal(acceptedFeedback(null, v), null);
  assert.equal(acceptedFeedback({ ...result, event: { ...result.event, score: result.event.score + 1 } }, v), null);
  assert.equal(acceptedFeedback(result, { ...v, sessionId: 'another-session' }), null);
  assert.equal(acceptedFeedback(result, result.view), null);
});

test('render/reload without a fresh success callback cannot emit feedback', () => {
  const { s, v } = fresh(); const result = choose(s, v), dom = stage(), bytes = JSON.stringify(s);
  mountPostPlanFeedback(s, dom.root, v.sessionId);
  mountPostPlanFeedback(s, dom.root, v.sessionId);
  panel.render(s, { postPlanSessionId: v.sessionId, postPlanEvent: result.event });
  assert.equal(dom.effects().length, 0); assert.equal(JSON.stringify(s), bytes);
  disposePostPlanFeedback(s);
});

test('success is consumed once, duplicate callbacks and replaced render trees never replay it', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { s, v } = fresh(), result = choose(s, v), first = stage(), second = stage();
  mountPostPlanFeedback(s, first.root, v.sessionId);
  assert(queuePostPlanFeedback(s, result, v));
  mountPostPlanFeedback(s, first.root, v.sessionId);
  assert(first.effects().some(x => x.textContent === `+${result.event.instant + result.event.tick}`));
  assert(first.effects().every(x => x.attrs['aria-hidden'] === 'true'));
  assert.equal(queuePostPlanFeedback(s, result, v), false);
  mountPostPlanFeedback(s, second.root, v.sessionId);
  assert.equal(first.effects().length, 0); assert.equal(second.effects().length, 0);
  t.mock.timers.runAll(); disposePostPlanFeedback(s);
});

test('close/dispose clears timers and pending effects; same session cannot replay on reopen', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { s, v } = fresh(), result = choose(s, v), dom = stage();
  mountPostPlanFeedback(s, dom.root, v.sessionId); queuePostPlanFeedback(s, result, v);
  mountPostPlanFeedback(s, dom.root, v.sessionId); assert(dom.effects().length);
  disposePostPlanFeedback(s); assert.equal(dom.effects().length, 0);
  assert(dom.nodes().every(x => x.classes.size === 0));
  mountPostPlanFeedback(s, dom.root, v.sessionId);
  assert.equal(queuePostPlanFeedback(s, result, v), false);
  t.mock.timers.runAll(); assert.equal(dom.effects().length, 0); disposePostPlanFeedback(s);
});

test('unmounted, detached and different-session results cannot queue feedback', () => {
  const { s, v } = fresh(), result = choose(s, v), dom = stage();
  assert.equal(queuePostPlanFeedback(s, result, v), false);
  mountPostPlanFeedback(s, dom.root, 'another-session'); assert.equal(queuePostPlanFeedback(s, result, v), false);
  mountPostPlanFeedback(s, dom.root, v.sessionId); dom.root.isConnected = false;
  assert.equal(queuePostPlanFeedback(s, result, v), false); disposePostPlanFeedback(s);
});

test('no score/effect is revealed while persistence is pending or rejected', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { s, v } = fresh(), dom = stage(), bytes = JSON.stringify(s);
  mountPostPlanFeedback(s, dom.root, v.sessionId);
  const action = { name: 'postPlan.choose', args: { sessionId: v.sessionId, expectedRevision: v.revision, turn: v.turn, cardId: 'basic' } };
  await assert.rejects(transactPostPlan(s, action, { persist: async () => ({ ok: false, reason: 'quota' }) }), /quota/);
  rejectPostPlanFeedback(s, v.sessionId); mountPostPlanFeedback(s, dom.root, v.sessionId);
  assert.equal(dom.effects().length, 0); assert(dom.root.querySelector('.pp-error').classes.has('pp-fx-rejected'));
  assert.equal(JSON.stringify(s), bytes);
  let release; const pending = new Promise(resolve => { release = resolve; });
  const work = transactPostPlan(s, action, { persist: () => pending }).then(result => { queuePostPlanFeedback(s, result, v); return result; });
  mountPostPlanFeedback(s, dom.root, v.sessionId); assert.equal(dom.effects().length, 0); assert.equal(JSON.stringify(s), bytes);
  release({ ok: true }); const result = await work;
  mountPostPlanFeedback(s, dom.root, v.sessionId); assert(dom.effects().length);
  assert.equal(E.postPlanView(s, v.sessionId).score, result.event.score); disposePostPlanFeedback(s);
});

test('effect completion removes all temporary DOM without changing game state', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { s, v } = fresh(), result = choose(s, v), dom = stage(), bytes = JSON.stringify(s);
  mountPostPlanFeedback(s, dom.root, v.sessionId); queuePostPlanFeedback(s, result, v); mountPostPlanFeedback(s, dom.root, v.sessionId);
  t.mock.timers.tick(POST_PLAN_MOTION_MS + 1);
  assert.equal(dom.effects().length, 0); assert(dom.nodes().every(x => x.classes.size === 0));
  assert.equal(JSON.stringify(s), bytes); disposePostPlanFeedback(s);
});

test('authorized auto callback receives the exact pre-commit view; feedback adds no second choice', async () => {
  const old = globalThis.localStorage, data = new Map();
  globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const { s, v } = fresh(), dom = stage(); let calls = 0;
  try {
    const before = command(s, 'postPlan.setControl', { sessionId: v.sessionId, expectedRevision: v.revision, mode: 'auto', scope: 'session' });
    mountPostPlanFeedback(s, dom.root, v.sessionId);
    await resumePostPlanAuto(s, v.sessionId, { onAccepted: (result, suppliedBefore) => {
      calls++; assert.deepEqual(suppliedBefore, before);
      const bytes = JSON.stringify(s); assert(queuePostPlanFeedback(s, result, suppliedBefore));
      mountPostPlanFeedback(s, dom.root, v.sessionId); assert(dom.effects().length);
      assert.equal(JSON.stringify(s), bytes); stopPostPlanController(s);
    }, onError: error => { throw error; } });
    assert.equal(calls, 1); assert.equal(E.postPlanView(s, v.sessionId).choiceRevision, 1);
  } finally {
    disposePostPlanFeedback(s); globalThis.localStorage = old; setState(null);
  }
});

test('unaffordable card is keyboard discoverable and only explains rejection, never submits', () => {
  const deck = ['basic', 'ptc_qwen_context_index', 'ptc_gemini_million_window', 'ptc_gpt_slow_answer'];
  const { s, v: initial } = fresh(deck); let v = initial;
  for (let i = 0; i < 4; i++) v = choose(s, v, v.hand.find(x => x.id !== 'basic' && x.affordable).id).view;
  const unavailable = v.hand.find(x => !x.affordable); assert(unavailable);
  const st = { postPlanSessionId: v.sessionId, postPlanSelected: { sessionId: v.sessionId, revision: v.revision, cardId: 'basic' } }, bytes = JSON.stringify(s);
  const html = panel.render(s, st);
  assert.match(html, new RegExp(`data-pp-select="${unavailable.id}" aria-pressed="false" aria-disabled="true"`));
  const button = { disabled: false, dataset: { ppSelect: unavailable.id }, hasAttribute: k => k === 'data-pp-select' };
  panel.click(s, { closest: () => button }, { st, draw() {} });
  assert.match(st.postPlanError, /预算不足.*未出牌、未扣费/); assert.equal(st.postPlanSelected, null);
  assert.equal(JSON.stringify(s), bytes); assert.match(panel.render(s, st), /本次操作未确认成功/);
});

test('effects are local, non-intercepting and reduced motion keeps static semantic feedback', () => {
  const css = fs.readFileSync(new URL('../../src/career/css/post_plan_feedback.css', import.meta.url), 'utf8');
  const source = fs.readFileSync(new URL('../../src/career/ui/post_plan_feedback.js', import.meta.url), 'utf8');
  assert.match(css, /pointer-events:none/); assert.match(css, /prefers-reduced-motion:reduce/); assert.match(css, /animation:none/);
  assert.doesNotMatch(css, /infinite|position:fixed|z-index:[3-9]/);
  assert.doesNotMatch(source, /from .*engine|localStorage|requestAnimationFrame|Math\.random|\.focus\(/);
});

test('accepted timeline captures the true hand origin, sequences direct score before chain, and never changes semantic final numbers', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { s, v } = fresh(), dom = stage();
  // Frozen accepted-shape fixture isolates timeline timing; no rule result is invented in production.
  const before = { ...v, score: 10, flow: 1 }, result = { view: { ...v, revision: v.revision + 1, score: 24, flow: 3, budget: 7 }, event: { sessionId: v.sessionId, revision: v.revision + 1, score: 24, instant: 8, tick: 6, cardId: 'basic', name: '时序测试', turn: 1 } };
  const bytes = JSON.stringify(s);
  mountPostPlanFeedback(s, dom.root, v.sessionId); assert(queuePostPlanFeedback(s, result, before));
  mountPostPlanFeedback(s, dom.root, v.sessionId);
  const ticket = dom.effects().find(x => x.className === 'pp-fx-card'); assert(ticket);
  assert.match(ticket.properties.get('--pp-from-y'), /^465px$/);
  assert(ticket.children.some(x => x.src === 'basic.webp'),'only already-loaded actual art is used in the flight');
  assert(!dom.effects().some(x => x.className === 'pp-fx-combo'));
  assert(!dom.root.querySelector('[data-pp-buff="flow"]').classes.has('pp-fx-buff-gain'));
  t.mock.timers.tick(469);
  assert(dom.root.querySelector('[data-pp-score]').classes.has('pp-fx-score-hit'));
  assert(!dom.root.querySelector('[data-pp-buff="flow"]').classes.has('pp-fx-buff-gain'));
  t.mock.timers.tick(1);
  assert(dom.root.querySelector('[data-pp-buff="flow"]').classes.has('pp-fx-buff-gain'));
  t.mock.timers.tick(379); assert(!dom.effects().some(x => x.className === 'pp-fx-combo'));
  t.mock.timers.tick(1); assert(dom.effects().some(x => x.textContent === '积累连锁 +6'));
  t.mock.timers.tick(400);
  assert(dom.effects().some(x => x.className === 'pp-fx-number' && x.textContent === '24'));
  assert.equal(dom.root.querySelector('[data-pp-score]').querySelector('[data-pp-number]').textContent, 'saved');
  t.mock.timers.tick(POST_PLAN_MOTION_MS); assert.equal(dom.effects().length, 0);
  assert.equal(JSON.stringify(s), bytes); disposePostPlanFeedback(s);
});

for (const at of [0, 250, 600, 950, 1300]) test(`cancelling at ${at}ms clears every later chain/counter/receipt callback`, t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { s, v } = fresh(), result = choose(s, v), dom = stage(), bytes = JSON.stringify(s);
  mountPostPlanFeedback(s, dom.root, v.sessionId); queuePostPlanFeedback(s, result, v); mountPostPlanFeedback(s, dom.root, v.sessionId);
  t.mock.timers.tick(at); disposePostPlanFeedback(s);
  assert.equal(dom.effects().length, 0); assert(dom.nodes().every(x => x.classes.size === 0));
  t.mock.timers.runAll(); assert.equal(dom.effects().length, 0); assert(dom.nodes().every(x => x.classes.size === 0));
  assert.equal(JSON.stringify(s), bytes);
});

test('a detached stage self-cancels before its next delayed effect, without requiring a later render', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { s, v } = fresh(), result = choose(s, v), dom = stage();
  mountPostPlanFeedback(s, dom.root, v.sessionId); queuePostPlanFeedback(s, result, v); mountPostPlanFeedback(s, dom.root, v.sessionId);
  dom.root.isConnected = false; t.mock.timers.tick(400);
  assert.equal(dom.effects().length, 0); assert(dom.nodes().every(x => x.classes.size === 0));
  t.mock.timers.runAll(); assert.equal(dom.effects().length, 0); disposePostPlanFeedback(s);
});

test('reduced motion keeps saved score and static gain labels, never flies cards/counts up or animates portrait', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { s, v } = fresh(), result = choose(s, v), dom = stage({ reducedMotion: true }), bytes = JSON.stringify(s);
  mountPostPlanFeedback(s, dom.root, v.sessionId); queuePostPlanFeedback(s, result, v); mountPostPlanFeedback(s, dom.root, v.sessionId);
  assert.equal(postPlanFeedbackDelay(dom.root), 900);
  assert(dom.effects().some(x => x.textContent === `+${result.event.instant + result.event.tick}`));
  assert(!dom.effects().some(x => ['pp-fx-card', 'pp-fx-number', 'pp-fx-portrait-before', 'pp-fx-impact'].includes(x.className)));
  assert(!dom.root.classes.has('pp-is-resolving'));
  t.mock.timers.tick(901); assert.equal(dom.effects().length, 0); assert.equal(JSON.stringify(s), bytes); disposePostPlanFeedback(s);
});

test('selection cancels a running presentation but cannot enqueue score, change a revision or consume budget', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { s, v } = fresh(), dom = stage(), bytes = JSON.stringify(s);
  mountPostPlanFeedback(s, dom.root, v.sessionId);
  assert(selectPostPlanFeedback(s, v.sessionId, 'basic')); mountPostPlanFeedback(s, dom.root, v.sessionId);
  assert(dom.root.cards[0].classes.has('pp-fx-selected')); assert.equal(dom.effects().length, 0);
  t.mock.timers.tick(321); assert.equal(dom.root.cards[0].classes.size, 0);
  assert.equal(JSON.stringify(s), bytes); disposePostPlanFeedback(s);
});

test('first-hand entrance is a one-shot durable-confirm cue, never a score reward or a reload animation', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { s, v } = fresh(), dom = stage(), bytes = JSON.stringify(s);
  mountPostPlanFeedback(s, dom.root, v.sessionId);
  assert(queuePostPlanDeal(s, v)); mountPostPlanFeedback(s, dom.root, v.sessionId);
  assert(dom.root.querySelector('.pp-hand').classes.has('pp-fx-first-hand'));
  assert.equal(dom.effects().length, 0); assert.equal(queuePostPlanDeal(s, v), false);
  t.mock.timers.tick(651); assert.equal(dom.root.querySelector('.pp-hand').classes.size, 0);
  mountPostPlanFeedback(s, dom.root, v.sessionId); assert.equal(dom.effects().length, 0);
  assert.equal(JSON.stringify(s), bytes); disposePostPlanFeedback(s);
});

test('synchronous dismissal inside the accepted redraw cannot leave a new auto pacing timer after disposal', async t => {
  const oldStore = globalThis.localStorage, data = new Map(), scheduled = [];
  globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const timeout = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (fn, ms, ...args) => { scheduled.push(ms); return timeout(fn, ms, ...args); });
  const { s, v } = fresh(), dom = stage();
  command(s, 'postPlan.setControl', { sessionId: v.sessionId, expectedRevision: v.revision, mode: 'auto', scope: 'session' });
  const el = { isConnected: true, querySelector: key => key === '.post-plan' ? dom.root : null };
  let draws = 0;
  try {
    panel.after(el, s, { postPlanSessionId: v.sessionId }, { draw() { draws++; el.isConnected = false; panel.dispose(s); } });
    await new Promise(setImmediate);
    assert.equal(draws, 1); assert.equal(E.postPlanView(s, v.sessionId).choiceRevision, 1);
    assert.deepEqual(scheduled, []); assert.equal(dom.effects().length, 0);
  } finally { panel.dispose(s); globalThis.localStorage = oldStore; }
});

for (const complete of [false, true]) test(`a ${complete ? 'failed' : 'pending'} card image flies as an honest stable frame, never a blank image request`, t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { s, v } = fresh(), result = choose(s, v), dom = stage(), bytes = JSON.stringify(s);
  const illustration = dom.root.cards[0].querySelector('img');
  illustration.complete = complete; illustration.naturalWidth = 0;
  mountPostPlanFeedback(s, dom.root, v.sessionId);
  assert(queuePostPlanFeedback(s, result, v)); mountPostPlanFeedback(s, dom.root, v.sessionId);
  const ticket = dom.effects().find(x => x.className === 'pp-fx-card');
  assert(ticket); assert(!ticket.children.some(x => x.src),'no undecoded or failed image may be cloned into the flight');
  assert(ticket.children.some(x => x.textContent === (complete ? '卡面未载入' : '卡面载入中')));
  assert(ticket.children.some(x => x.textContent === result.event.name));
  assert.equal(dom.root.querySelector('[data-pp-score]').querySelector('[data-pp-number]').textContent,'saved');
  assert(dom.effects().every(x => x.attrs['aria-hidden'] === 'true'));
  // Loading later cannot turn this detached presentation into an update callback.
  disposePostPlanFeedback(s); illustration.complete = true; illustration.naturalWidth = 320; t.mock.timers.runAll();
  assert.equal(dom.effects().length,0); assert.equal(JSON.stringify(s),bytes);
});

test('stable-root redraw cleans active effects without replay and preserves only an explicitly queued selection',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {s,v}=fresh(),result=choose(s,v),dom=stage();
 mountPostPlanFeedback(s,dom.root,v.sessionId);queuePostPlanFeedback(s,result,v);mountPostPlanFeedback(s,dom.root,v.sessionId);assert(dom.effects().length);
 preparePostPlanFeedbackRender(s);assert.equal(dom.effects().length,0);mountPostPlanFeedback(s,dom.root,v.sessionId);t.mock.timers.runAll();assert.equal(dom.effects().length,0);
 selectPostPlanFeedback(s,v.sessionId,'basic');preparePostPlanFeedbackRender(s);mountPostPlanFeedback(s,dom.root,v.sessionId);
 assert(dom.root.cards[0].classes.has('pp-fx-selected'));assert.equal(dom.effects().length,0);disposePostPlanFeedback(s);t.mock.timers.runAll();assert(dom.nodes().every(n=>n.classes.size===0));
});
