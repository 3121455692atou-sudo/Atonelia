import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import { HistoryProvider } from '../../src/career/sim/provider.js';
globalThis.document ??= { baseURI: 'http://localhost/' };
const panel = await import('../../src/career/ui/panels/post_plan.js');
const train = await import('../../src/career/ui/pages/train.js');
const { setState, setWorld, setMp } = await import('../../src/career/ui/state.js');
const { art } = await import('../../src/career/ui/fmt.js');
function fresh(company = 'deepseek') {
  E.setProvider(new HistoryProvider());
  const s = E.createSinglePlayerGame(company, 'y2025', 7); s.jobs.list = []; s.queue = [];
  setState(s); setWorld(null); setMp(null); return s;
}
function cmd(s, name, args = {}) { const r = E.applyCommand(s, { name, args }); assert(r.ok, r.err); return r.result; }
function open(s) {
  cmd(s, 'postPlan.enable');
  return cmd(s, 'postPlan.open', { modelId: s.working, expectedModelToken: null });
}
function confirm(s, v) { return cmd(s, 'postPlan.confirmDeck', { sessionId: v.sessionId, expectedRevision: v.revision, cardIds: v.deck, directionPolicy: 'model-general' }); }

test('new product entry is default manual, supported ordinary modalities and hidden from multiplayer/identity mismatch', () => {
  const s = fresh(), html = panel.entry(s, {});
  assert.match(html, /手动/); assert.match(html, /后训练/);
  assert.doesNotMatch(html, /data-pp-enable|开启单机|启用实验|data-pp-open/); assert.match(html, /选好卡组，手动完成六手训练/);
  open(s); assert.match(panel.entry(s, {}), /data-pp-open/); assert.match(panel.entry(s, {}), /继续选卡/);
  setWorld({ settings: { mp: true } }); assert.equal(panel.entry(s, {}), '');
  setWorld(null); assert.equal(panel.entry({ ...s, mod: 'image' }, {}), '');
  assert.equal(panel.entry({ ...s, postRandom: { version: 1 } }, {}), '');
});

test('draft uses actual research/strategy locks and current company portrait, no demo controls', () => {
  const s = fresh('qwen'); s.techs = ['rlhf']; s.strategy.done = {};
  const v = open(s), st = { postPlanSessionId: v.sessionId }, before = JSON.stringify(s);
  const html = train.render(s, st);
  assert.match(html, /已解锁的后训练配牌候选/); assert.match(html, /data-pp-filter="tag"/);
  assert.doesNotMatch(html, /研究：DPO|data-pp-filter="availability"/); // Locked cards are no longer deck choices.
  assert.match(html, /data-pp-confirm/); assert.match(html, /开始六手训练/);
  assert(html.includes(art(s.persona.artId, 'stage', 'neutral')));
  assert.match(html,/data-pp-art="ptc_qwen_sample_tabs"/); assert.doesNotMatch(html,/posttraining-modelgirls-atlas/);
  assert.match(html, /真实训练卡/); assert.match(html, /不是卡牌结算承诺/);
  assert.doesNotMatch(html, /data-pp-choose|data-reset|DEMO_PROFILES|策略齐备/);
  assert.equal(JSON.stringify(s), before);
});

test('accepted hands show rule previews, manual default and explicit auto authorization', () => {
  const s = fresh(), v = confirm(s, open(s));
  const html = panel.render(s, { postPlanSessionId: v.sessionId });
  assert.equal((html.match(/data-pp-select=/g) || []).length, 3);
  assert.match(html, /data-pp-choose="" disabled/); assert.match(html, /确认出牌/);
  assert.match(html, /本次自动/); assert.match(html, /同一副已解锁卡组和相同规则/);
  assert.match(html, /演练分/); assert.match(html, /不是模型能力/);
  assert.doesNotMatch(html, /drawTicket|seed|rng/);
  const busy = panel.render(s, { postPlanSessionId: v.sessionId, postPlanBusy: true });
  assert.match(busy, /aria-busy="true"/); assert.match(busy, /正在保存/);
  assert.equal((busy.match(/data-pp-select="[^"]+" aria-pressed="false" disabled/g) || []).length, 3);
});

test('receipt explains future actual training without instant payout or reroll affordance', () => {
  const s = fresh(); let v = confirm(s, open(s)); const dims = structuredClone(E.workingModel(s).dims);
  for (let i = 0; i < 6; i++) v = cmd(s, 'postPlan.choose', { sessionId: v.sessionId, expectedRevision: v.revision, turn: v.turn, cardId: 'basic' }).view;
  const html = panel.render(s, { postPlanSessionId: v.sessionId });
  assert.match(html, /最早生效日期/); assert(html.includes(v.effectiveFromDay));
  assert.match(html, /仍需在训练页开启或继续/); assert.match(html, /此处没有发放能力/);
  assert.doesNotMatch(html, /data-pp-confirm|data-pp-choose|data-pp-control|data-reset/);
  assert.deepEqual(E.workingModel(s).dims, dims);
});

test('read-only deck cannot submit or mutate simulation', () => {
  const s = fresh(), v = open(s), st = { postPlanSessionId: v.sessionId, readOnly: true }, before = JSON.stringify(s);
  const button = { disabled: true, dataset: { ppDeck: 'ptc_mistral_neat_batch' }, hasAttribute: k => k === 'data-pp-deck' };
  assert(panel.click(s, { closest: () => button }, { st, draw() {} }));
  assert.equal(st.postPlanDeck, undefined); assert.equal(JSON.stringify(s), before);
  const html = panel.render(s, { ...st, readOnly: true });
  assert.match(html, /data-pp-confirm disabled/);
  assert.equal(JSON.stringify(s), before);
});

test('panel assets and lifecycle are local, scoped and preserve atlas attribution', () => {
  const css = fs.readFileSync(new URL('../../src/career/css/post_plan.css', import.meta.url), 'utf8');
  const office = fs.readFileSync(new URL('../../src/career/ui/office.js', import.meta.url), 'utf8');
  const source = fs.readFileSync(new URL('../../src/career/ui/panels/post_plan.js', import.meta.url), 'utf8');
  const provenance = JSON.parse(fs.readFileSync(new URL('../../assets/posttraining/posttraining-modelgirls-atlas.provenance.json', import.meta.url), 'utf8'));
  assert.equal(provenance.columns, 3); assert.equal(provenance.rows, 2);
  assert(fs.existsSync(new URL('../../assets/posttraining/posttraining-modelgirls-atlas.png', import.meta.url)));
  assert.match(css, /prefers-reduced-motion/); assert.doesNotMatch(css, /(^|\n)body\s*\{/);
  assert.match(office, /PAGE\[mountedPage\]\?\.dispose/);
  assert.match(source, /await act\(S, name, args\)/); assert.match(source, /stopPostPlanController/);
  assert.doesNotMatch(source, /DEMO_PROFILES|postCards\.plans|drawTicket|Math\.random/);
});

test('selecting a hand card is preview-only; confirmation is a separate action on the current revision', () => {
  const s = fresh(), v = confirm(s, open(s)), st = { postPlanSessionId: v.sessionId }, before = JSON.stringify(s);
  const button = { disabled: false, dataset: { ppSelect: 'basic' }, hasAttribute: k => k === 'data-pp-select' };
  assert(panel.click(s, { closest: () => button }, { st, draw() {} }));
  assert.equal(JSON.stringify(s), before); assert.equal(st.postPlanSelected.cardId, 'basic');
  const html = panel.render(s, st); assert.match(html, /data-pp-choose="basic">确认出牌/);
  assert.match(html, /pp-info[^>]+hidden/); assert.match(html, /pp-playing/);
});

test('information dialog makes background inert, guards synthetic actions, traps Tab and handles Escape locally', () => {
  const s = fresh(), v = confirm(s, open(s)), st = { postPlanSessionId: v.sessionId, postPlanInfo: true }, before = JSON.stringify(s);
  const html = panel.render(s, st); assert.match(html, /class="pp-main"[^>]* inert/); assert.match(html, /aria-modal="true"/);
  const background = { disabled: false, dataset: { ppChoose: 'basic' }, hasAttribute: k => k === 'data-pp-choose', closest: () => null };
  assert(panel.click(s, { closest: () => background }, { st, draw() {} })); assert.equal(JSON.stringify(s), before);
  let handler, prevented = 0, stopped = 0, drawn = 0;
  const button = { focus() { document.activeElement = button; } };
  const info = { addEventListener(type, fn) { assert.equal(type, 'keydown'); handler = fn; }, querySelector: () => button, querySelectorAll: () => [button] };
  const el = { isConnected: true, querySelector: selector => selector === '.pp-info' ? info : {} };
  panel.after(el, s, st, { draw() { drawn++; } }); assert.equal(document.activeElement, button);
  handler({ key: 'Tab', shiftKey: true, preventDefault() { prevented++; } }); assert.equal(prevented, 1); assert.equal(document.activeElement, button);
  handler({ key: 'Escape', preventDefault() { prevented++; }, stopImmediatePropagation() { stopped++; } });
  assert.equal(st.postPlanInfo, false); assert.equal(st.postPlanSessionId, v.sessionId); assert.equal(stopped, 1); assert.equal(drawn, 1); assert.equal(JSON.stringify(s), before);
});

test('new actual unlock exposes one replan entry; replacement draft explains that old active remains', async () => {
  const { activatePostSessions } = await import('../../src/career/sim/post_plan_state.js');
  const s = fresh(); s.techs = ['rlhf']; s.strategy.done = {};
  let v = confirm(s, open(s));
  for (let i = 0; i < 6; i++) v = cmd(s, 'postPlan.choose', { sessionId: v.sessionId, expectedRevision: v.revision, turn: v.turn, cardId: 'basic' }).view;
  s.day = v.effectiveFromDay; activatePostSessions(s);
  assert.doesNotMatch(panel.render(s, { postPlanSessionId: v.sessionId }), /data-pp-replan/);
  s.techs.push('dpo'); assert.match(panel.render(s, { postPlanSessionId: v.sessionId }), /新解锁 8 张卡 · 重新组牌/);
  v = cmd(s, 'postPlan.replan', { sessionId: v.sessionId, expectedRevision: v.revision });
  const html = panel.render(s, { postPlanSessionId: v.sessionId });
  assert.match(html, /旧方案仍在真实训练日生效/); assert.doesNotMatch(html, /data-pp-replan/);
});


test('catalogue is paged and filter-only, preserves chosen deck and uses only dedicated action card art',()=>{
  const s=fresh(),v=open(s),st={postPlanSessionId:v.sessionId},before=JSON.stringify(s);
  let html=panel.render(s,st);assert((html.match(/class="pp-library-card/g)||[]).length<=24);assert.match(html,/张已解锁候选/);assert.match(html,/data-pp-art="ptc_qwen_sample_tabs"/);assert.doesNotMatch(html,/posttraining-modelgirls-atlas/);
  const firstDeck=[...v.deck];panel.change(s,{dataset:{ppFilter:'character'},value:'qwen'},{st,draw(){}});html=panel.render(s,st);
  assert.equal(JSON.stringify(s),before);assert.deepEqual(E.postPlanView(s,v.sessionId).deck,firstDeck);assert.match(html,/ptc_qwen_sample_tabs-card.webp/);
  assert.doesNotMatch(html,/posttraining-modelgirls-atlas/);assert.match(html,/data-pp-card-info/);
  const css=fs.readFileSync(new URL('../../src/career/css/post_plan.css',import.meta.url),'utf8');assert.match(css,/\.pp-card-art img[^}]*object-fit:contain/);
});


test('missing-art display uses an explicit empty-map fixture even after the real catalogue gains more images',async()=>{
  const file=new URL('../../src/career/ui/panels/post_plan.js',import.meta.url);
  const original=fs.readFileSync(file,'utf8');
  const source=original.replace("import { POST_CARD_ART } from '../../data/post_card_art.js';",'const POST_CARD_ART = Object.freeze({});')
    .replace(/from ([\'"])(\.[^\'"]+)\1/g,(_,quote,relative)=>`from ${quote}${new URL(relative,file).href}${quote}`);
  assert.notEqual(source,original);
  // Only the presentation asset map differs. Real catalogue, locks, session,
  // renderer and escaping remain the actual modules; no save/definition edit.
  const withoutArt=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const s=fresh(),v=open(s),st={postPlanSessionId:v.sessionId,postPlanQuery:{character:'qwen'}},before=JSON.stringify(s);
  const real=panel.render(s,st),missing=withoutArt.render(s,st);
  assert.match(real,/data-pp-art="ptc_qwen_sample_tabs"/);
  assert.match(missing,/data-missing-card-art="ptc_qwen_sample_tabs"/);
  assert.match(missing,/动作卡面制作中/);assert.doesNotMatch(missing,/posttraining-modelgirls-atlas/);
  assert.equal(JSON.stringify(s),before);
});

test('four ordinary modalities use four real local scene assets without changing session state', () => {
  for (const [company, theme] of [['deepseek', 'language'], ['midjourney', 'image'], ['suno', 'music'], ['elevenlabs', 'speech']]) {
    const s = fresh(company), v = open(s), bytes = JSON.stringify(s), html = panel.render(s, { postPlanSessionId: v.sessionId });
    assert.match(html, new RegExp(`data-pp-theme="${theme}"`));
    assert.match(html, new RegExp(`assets/posttraining/backgrounds/${theme}-stage\\.webp`));
    assert(fs.statSync(new URL(`../../assets/posttraining/backgrounds/${theme}-stage.webp`, import.meta.url)).size > 100000);
    assert.equal(JSON.stringify(s), bytes);
  }
});

test('completed ready job clearly waits for the next actual training day; active job does not ask to complete cards again', async () => {
  const { activatePostSessions } = await import('../../src/career/sim/post_plan_state.js');
  const s = fresh(), j = E.startJob(s, { kind: 'post', target: 'main', dir: 'writing', until: 'none' });
  const jobLabel = () => { const al = E.allocJobs(s); return train.jobView(s, al, al.items.find(x => x.job.id === j.id)); };
  assert.match(jobLabel().state, /等待完成后训练卡组方案/);
  let v = confirm(s, open(s));
  for (let i = 0; i < 6; i++) v = cmd(s, 'postPlan.choose', { sessionId: v.sessionId, expectedRevision: v.revision, turn: v.turn, cardId: 'basic' }).view;
  const bytes = JSON.stringify(s), ready = jobLabel();
  assert.match(ready.state, /方案已完成，等待下一训练日生效/); assert.equal(ready.short, '等待下一训练日生效');
  const html = panel.render(s, { postPlanSessionId: v.sessionId });
  assert.match(html, /无需再次启动/); assert.doesNotMatch(html, /仍需在训练页开启或继续/); assert.equal(JSON.stringify(s), bytes);
  s.day = v.effectiveFromDay; activatePostSessions(s);
  const after = JSON.stringify(s), active = jobLabel();
  assert.doesNotMatch(active.state, /等待完成后训练卡组方案|等待下一训练日生效/);
  assert.match(panel.render(s, { postPlanSessionId: v.sessionId }), /作业已安排，方案已生效/);
  assert.equal(JSON.stringify(s), after);
  E.pauseJob(s, j.id, true);
  assert.match(panel.render(s, { postPlanSessionId: v.sessionId }), /当前暂停；请返回训练页继续/);
});
