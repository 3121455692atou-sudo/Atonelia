import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import { CATALOG_CARDS, catalogueDeckEffect, cardSummary, CATALOG_FINGERPRINT } from '../../src/career/sim/post_catalog.js';
import { choiceProjection, deckBlueprint } from '../../src/career/ui/post_plan_choices.js';
import { setState, setWorld, setMp, ui } from '../../src/career/ui/state.js';
import { newModel } from '../../src/career/sim/projects.js';
globalThis.document ??= {baseURI:'http://localhost/'};
const panel=await import('../../src/career/ui/panels/post_plan.js');
const home=await import('../../src/career/ui/home.js');
const cmd=(s,name,args)=>{const r=E.applyCommand(s,{name,args});assert(r.ok,r.err);return r.result;};
function fresh() {E.setProvider();const s=E.createSinglePlayerGame('deepseek','y2025',7);s.queue=[];s.jobs.list=[];setState(s);setWorld(null);setMp(null);return s;}
const open=s=>cmd(s,'postPlan.open',{modelId:s.working,expectedModelToken:null});
const confirm=(s,v)=>cmd(s,'postPlan.confirmDeck',{sessionId:v.sessionId,expectedRevision:v.revision,cardIds:v.deck,directionPolicy:v.directionPolicy});
const json=x=>JSON.stringify(x);

test('real starter first hand has equal scores but materially different focus, stability and budget',()=>{
  const s=fresh(),v=confirm(s,open(s)),before=json(s),publicBefore=json(v);
  const p=v.hand.map(h=>choiceProjection(v,h));
  assert.deepEqual(p.map(x=>x.total),[1,1,1]);
  assert.equal(p[0].carry,'聚焦 0→1 · 稳定 0→2');
  assert.equal(p[1].carry,'聚焦 0→2');
  assert.equal(p[2].budgetAfter,8);assert.equal(p[0].budgetAfter,7);
  assert(p.every(x=>x.remaining===5));
  const html=panel.render(s,{postPlanSessionId:v.sessionId});
  assert.match(html,/聚焦\+1 · 稳定\+2/);assert.match(html,/聚焦\+2/);
  assert.match(html,/aria-label="费用 1"/);assert.match(html,/aria-label="费用 0"/);
  assert.match(html,/data-pp-choose="" disabled/);
  assert.doesNotMatch(html,/futureValue|drawTicket|rng|seed/);
  assert.equal(json(s),before);assert.equal(json(v),publicBefore);
});

test('UI projection ignores arbitrary automatic heuristic, does not forecast future draws and distinguishes final-hand carry',()=>{
  const s=fresh(),v=confirm(s,open(s)),h=v.hand[0];
  assert.deepEqual(choiceProjection(v,h),choiceProjection(v,{...h,futureValue:999999}));
  const final=choiceProjection({...v,turn:6},h);
  assert.equal(final.remaining,0);assert.match(final.carry,/不再有后续收益/);
  const blocked=choiceProjection(v,{...h,affordable:false,error:'待办已满'});
  assert.equal(blocked.budgetAfter,null);assert.deepEqual(blocked.meters,[]);assert.equal(blocked.error,'待办已满');
  const publicOnly=new Proxy(v,{get(target,key){if(['rng','deck','cards','log'].includes(key))throw Error('hidden/unneeded');return target[key];}});
  assert.doesNotThrow(()=>choiceProjection(publicOnly,h));
});

test('blueprint matches authoritative distinct-card, max-coverage and tie ordering without changing cards',()=>{
  const cfg={catalogFingerprint:CATALOG_FINGERPRINT,rulesVersion:'bounded-dsl-v1',modality:'llm',companyId:'deepseek',techs:[],strategy:{done:{}}};
  const ids=CATALOG_CARDS.filter(c=>c.id!=='basic'&&!c.unlock.all.length).map(c=>c.id);
  for(let i=0;i<ids.length;i++) {
    const deck=['basic',ids[i],ids[(i+1)%ids.length],ids[(i+7)%ids.length]],effect=catalogueDeckEffect(deck);
    const cards=deck.map(id=>cardSummary(CATALOG_CARDS.find(c=>c.id===id),cfg)),before=json(cards),b=deckBlueprint(cards);
    assert.equal(b.best.count,effect.matchedRoles);assert.equal(b.best.id,effect.recipeId);
    assert.equal(new Set(b.best.roles.filter(r=>r.card).map(r=>r.card.id)).size,b.best.count);assert.equal(json(cards),before);
  }
  const repeated=cardSummary(CATALOG_CARDS.find(c=>c.id===ids[0]),cfg);
  assert(deckBlueprint([repeated,repeated,repeated]).best.count<=1);
  assert.equal(deckBlueprint([]).best.id,catalogueDeckEffect([]).recipeId);
});

test('actual final-turn reservation preview never promises a later payoff or changes save bytes',()=>{
  const s=fresh();let v=open(s);
  v=cmd(s,'postPlan.confirmDeck',{sessionId:v.sessionId,expectedRevision:v.revision,directionPolicy:v.directionPolicy,cardIds:['basic','ptc_qwen_context_index','ptc_gemini_million_window','ptc_qwen_sample_tabs']});
  while(v.turn<6)v=cmd(s,'postPlan.choose',{sessionId:v.sessionId,expectedRevision:v.revision,turn:v.turn,cardId:'basic'}).view;
  const delayed=v.hand.find(h=>h.card.tags.includes('reserve'));assert(delayed,'two reserved cards in three ensure one public choice');
  const before=json(s),p=choiceProjection(v,delayed),html=panel.render(s,{postPlanSessionId:v.sessionId,postPlanSelected:{sessionId:v.sessionId,revision:v.revision,cardId:delayed.id}});
  assert.equal(p.remaining,0);assert.equal(p.addedPending,0);assert.match(p.timing,/末回合后的预约不再兑现/);
  assert.match(html,/最后一手/);assert.doesNotMatch(html,/项新预约/);assert.equal(json(s),before);
});

test('three-card arena has no hand reader and keeps one external confirmation row',()=>{
  const css=fs.readFileSync(new URL('../../src/career/css/responsive_fit.css',import.meta.url),'utf8');
  assert.match(css,/\.pp-play-scroll[^}]*overflow:hidden/);
  assert.match(css,/\.post-plan \.pp-hand \{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/\.post-plan \.pp-decision \{ position:static;flex:none;/);
  assert.doesNotMatch(css,/\.pp-hand \{[^}]*grid-template-columns:minmax\(0,1fr\)/);
});

test('recipe and method filtering are local-only, retain deck and reveal no hand or save',()=>{
  const s=fresh(),v=open(s),st={postPlanSessionId:v.sessionId},before=json(s);let draws=0;
  assert(panel.change(s,{dataset:{},value:'prep_delayed_window',hasAttribute:k=>k==='data-pp-recipe'},{st,draw:()=>draws++}));
  assert.equal(st.postPlanRecipe,'prep_delayed_window');
  const b={disabled:false,dataset:{ppFindTag:'reserve'},hasAttribute:k=>k==='data-pp-find-tag',closest:()=>null};
  panel.click(s,{closest:()=>b},{st,draw:()=>draws++});
  assert.deepEqual(st.postPlanQuery,{tag:'reserve',availability:'unlocked',page:0});
  assert.equal(draws,2);assert.equal(json(s),before);assert.equal(st.postPlanDeck,undefined);
  const html=panel.render(s,st);assert.match(html,/三个位置要由不同卡承担/);assert.match(html,/不会替你换牌/);
  assert.doesNotMatch(html,/data-pp-select=/);assert.equal(json(s),before);
});

test('training advice retains direct entry and exposes a separate non-executing arrange path',()=>{
  const s=fresh();ui.skip.clear();
  const suggestions=E.advise(s),training=suggestions.find(a=>a.kind==='jobs'&&a.op?.type==='job'&&a.op.op==='post');
  assert(training);for(const a of suggestions)if(a.id!==training.id)ui.skip.add(`${s.date}|${a.id}`);
  const before=json(s),app={};home.renderHome(app);
  assert.match(app.innerHTML,/自己安排方向与期限/);assert.match(app.innerHTML,/先看训练页，不执行建议/);
  assert.match(app.innerHTML,/class="btn next-own-plan" data-act="open-train"/);
  assert.match(app.innerHTML,/按此建议开始后训练 · 进入选卡/);assert.equal(json(s),before);ui.skip.clear();
  const source=fs.readFileSync(new URL('../../src/career/ui/home.js',import.meta.url),'utf8');
  assert.match(source,/return doDecision\('job', \{ op: 'start', spec, updateDirection: true \}\)/);
});

test('non-executing arrange shortcut is not shown when entering train would resume another pending model',()=>{
  const s=fresh(),small=newModel(s,{total:1,active:1,arch:'dense'});small.role='small';s.models.push(small);s.smallWorking=small.id;
  E.startJob(s,{kind:'post',target:`small:${small.id}`,dir:'auto',until:'none'});
  const suggestions=E.advise(s),training=suggestions.find(a=>a.kind==='jobs'&&a.op?.type==='job'&&a.op.op==='post');assert(training);
  ui.skip.clear();for(const a of suggestions)if(a.id!==training.id)ui.skip.add(`${s.date}|${a.id}`);
  const before=json(s),app={};home.renderHome(app);assert.doesNotMatch(app.innerHTML,/next-own-plan/);assert.equal(json(s),before);ui.skip.clear();
});
