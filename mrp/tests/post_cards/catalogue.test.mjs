import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { CATALOG_CARDS, CATALOG_FINGERPRINT, validateCatalog, catalogueDeckEffect, queryCatalogue } from '../../src/career/sim/post_catalog.js';
import { POST_CARD_CATALOG, POST_CARD_RECIPES } from '../../src/career/data/post_card_catalog.js';
import { DSL_CAPS, validateEffects, evaluateCard, startCardTurn } from '../../src/career/sim/post_card_dsl.js';
import * as R from '../../src/career/sim/post_catalog_rules.js';
import { postPlanIdentity } from '../../src/career/sim/post_card_profiles.js';
import { TECHS, SCENARIOS } from '../../src/career/data/core.js';
import { restoreHistory } from '../helpers/world_provider.mjs';
import { transactPostPlan } from '../../src/career/ui/post_plan_transaction.js';
import { safeLoadState } from '../../src/career/ui/storage.js';
afterEach(restoreHistory);
const state = (extra={}) => ({status:'playing',turn:1,budget:8,focus:0,flow:0,shield:0,boost:0,score:0,pending:[],nextEventId:1,history:[],log:[],...extra});
const card = effects => ({id:'test',name:'test',cost:1,kind:'train',archetypeTags:['verify'],effects});
const op = (meter,amount) => ({op:'meters',delta:{[meter]:amount}});
const schedule = (afterTurns,delta) => ({op:'scheduleOnce',afterTurns,payload:[{op:'meters',delta}],onOverflow:'reject_before_cost',ifAfterFinalTurn:'expire_no_reward'});
function fresh(id='deepseek',scenario='y2025') { restoreHistory(); const s=E.createSinglePlayerGame(id,scenario,19);s.jobs.list=[];s.queue=[];s.jobs.autoRepair=false;return s; }
function cmd(s,name,args={}) {const r=E.applyCommand(s,{name,args});assert(r.ok,r.err);return r.result;}
const cfg = s => ({...postPlanIdentity(s),rulesVersion:'bounded-dsl-v1',techs:[...s.techs],strategy:{done:{...s.strategy.done}}});
const baseDeck=['basic','ptc_mistral_neat_batch','ptc_qwen_sample_tabs','ptc_glm_task_tiles'];
function confirmed(s,deck=baseDeck){let v=cmd(s,'postPlan.open',{modelId:s.working,expectedModelToken:null});return cmd(s,'postPlan.confirmDeck',{sessionId:v.sessionId,expectedRevision:0,cardIds:deck,directionPolicy:'model-general'});}

test('frozen catalogue has 166 distinct mechanics + separate fallback and immutable validated definitions',()=>{
  assert.equal(CATALOG_CARDS.length,167);assert.equal(validateCatalog(),true);
  assert.equal(new Set(POST_CARD_CATALOG.cards.map(c=>c.mechanicalSignature)).size,166);
  assert(Object.isFrozen(POST_CARD_CATALOG.cards[0].effects));assert.equal(new Set(CATALOG_CARDS.map(c=>c.characterId).filter(Boolean)).size,41);
  assert.equal(POST_CARD_CATALOG.version,'166-card-draft-3');assert.equal(CATALOG_FINGERPRINT.length,64);
});
test('AST schema rejects unknown mutation, dynamic fields, nonfinite values, deep/large trees and recursive schedules',()=>{
  for(const effects of [[{op:'refund',amount:1}],[{op:'scoreBase',amount:NaN}],[{op:'scoreBase',amount:Infinity}],[{op:'meters',delta:{cash:1}}],[{op:'branch',condition:{field:'company.cash',op:'gte',value:0},then:[],else:[]}],[{...schedule(1,{flow:1}),payload:[schedule(1,{flow:1})]}],[{op:'scoreBase',amount:1,assetUrl:'https://bad.invalid'}],Array.from({length:13},()=>({op:'scoreBase',amount:1}))])assert.throws(()=>validateEffects(effects));
  let effects=[op('focus',1)];for(let i=0;i<6;i++)effects=[{op:'branch',condition:{field:'turn',op:'gte',value:1},then:effects,else:[]}];assert.throws(()=>validateEffects(effects));
  for(const mutate of [c=>c.cards[0].effects.push({op:'realGain',amount:1}),c=>c.cards[0].id=c.cards[1].id,c=>c.cards[0].extra=1,c=>c.cards[0].unlock.all=[{type:'completedTech',id:'fake_tech'}],c=>c.caps.pendingEvents=12,c=>c.cards[0].cost=NaN]){const c=structuredClone(POST_CARD_CATALOG);mutate(c);assert.throws(()=>validateCatalog(c,POST_CARD_RECIPES));}
});
test('payment snapshot, sequential clamp, frozen focus and current boost have exact contract semantics',()=>{
  const s=state({focus:2,shield:4}), c=card([{op:'scoreBase',amount:1},op('focus',2),{op:'branch',condition:{field:'focus',op:'eq',value:2},then:[{op:'scoreBase',amount:2}],else:[]},{op:'setMeter',meter:'boost',value:2},op('flow',5)]);c.cost=3;
  const before=JSON.stringify(s),r=evaluateCard(s,c);assert(r.ok);assert.equal(JSON.stringify(s),before);assert.equal(r.snapshot.shield,1);assert.equal(r.snapshot.paid,0);assert.equal(r.instant,18);assert.equal(r.tick,15);assert.equal(r.work.focus,4);assert.equal(r.work.flow,4);assert.equal(r.work.boost,1);
  const paid=evaluateCard(state({shield:1}),{...c,cost:3});assert.equal(paid.snapshot.budget,6);assert.equal(paid.snapshot.shield,0);
});
test('scheduled meters execute once before payment, final-turn effects expire and overflow rejects without mutation',()=>{
  const r=evaluateCard(state(),card([schedule(1,{shield:4,boost:2})]));assert(r.ok);const s=r.work;s.turn=2;
  assert.deepEqual(startCardTurn(s),[1]);assert.deepEqual(startCardTurn(s),[]);assert.equal(s.pending.length,0);
  const next=evaluateCard(s,card([{op:'scoreBase',amount:3}]));assert.equal(next.paid,0);assert.equal(next.instant,6);assert.equal(next.work.boost,1);
  const late=evaluateCard(state({turn:6}),card([schedule(1,{flow:8})]));assert.equal(late.work.pending.length,0);assert.deepEqual(late.event.expired,[1]);assert.equal(late.tick,0);
  const pending=Array.from({length:4},(_,i)=>({id:i+1,dueTurn:3,payload:[op('flow',1)]})), full=state({pending,nextEventId:5}), before=JSON.stringify(full);
  assert.equal(evaluateCard(full,card([schedule(1,{flow:1})])).ok,false);assert.equal(JSON.stringify(full),before);
});
test('history summaries exclude current card and kind tags, but previous includes kind and free card counts',()=>{
  const s=state({history:[{cardId:'basic',kind:'train',tags:[]},{cardId:'a',kind:'prepare',tags:['verify','sequence']}],turn:3});
  const c=card([{op:'branch',condition:{all:[{field:'history.distinctCards',op:'eq',value:2},{field:'history.distinctTags',op:'eq',value:2},{field:'history.tagCounts.verify',op:'eq',value:1},{field:'previous.tags',op:'contains',value:'prepare'}]},then:[{op:'scoreBase',amount:7}],else:[]}]);
  const r=evaluateCard(s,c);assert.equal(r.instant,7);assert.equal(r.work.history.length,3);assert.equal(r.snapshot.history.tagCounts.verify,1);
});
for(const c of POST_CARD_CATALOG.cards)test(`catalogue bounded AST ${c.id}`,()=>{
  for(let turn=1;turn<=6;turn++)for(let variant=0;variant<5;variant++){
    const history=Array.from({length:turn-1},(_,i)=>({cardId:i===0?'basic':`c${variant+i}`,kind:i%2?'prepare':'train',tags:i===0?[]:[['filter','verify'],['curriculum','reserve'],['stability','sequence'],['contrast','distill'],['finish','calibration']][variant]}));
    const s=state({turn,focus:variant,flow:variant*2,shield:variant,boost:variant%3,budget:variant===0?0:8,history}),before=JSON.stringify(s),r=evaluateCard(s,c);
    assert.equal(JSON.stringify(s),before);if(!r.ok)continue;
    assert(r.work.budget<=s.budget&&r.work.budget>=0);assert(r.total>=0&&r.total<=144);assert(r.work.pending.length<=4);
    for(const [m,cap]of Object.entries(DSL_CAPS))assert(Number.isFinite(r.work[m])&&r.work[m]>=0&&r.work[m]<=cap,m);
    assert.equal(r.work.history.length,turn);assert.equal(r.work.log.length,1);
  }
});
test('recipe matching uses different card IDs and best only; all four native modalities have multiple free full routes',()=>{
  assert.equal(catalogueDeckEffect(baseDeck).efficiency,1);
  assert(catalogueDeckEffect(['basic','ptc_jev_decision_schema','ptc_jev_decision_schema','ptc_jev_decision_schema']).coverage<1);
  for(const id of ['deepseek','image2','midjourney','suno','elevenlabs']){
    const s=fresh(id,'y2023'),config=cfg(s),free=CATALOG_CARDS.filter(c=>c.id!=='basic'&&!c.unlock.all.length&&R.unlocked(c.id,config));
    let full=0;const intersection=new Set(free.map(c=>c.id));
    for(let a=0;a<free.length;a++)for(let b=a+1;b<free.length;b++)for(let d=b+1;d<free.length;d++){const deck=['basic',free[a].id,free[b].id,free[d].id];if(catalogueDeckEffect(deck).efficiency===1){full++;for(const x of intersection)if(!deck.includes(x))intersection.delete(x);}}
    assert(full>1);assert.equal(intersection.size,0);assert(R.validDeck(baseDeck,config));
  }
});
test('catalogue query is readonly, pages <=24, cross-company common cards work and company prereqs never borrow art identity',()=>{
  const s=fresh('deepseek'),before=JSON.stringify(s),page=E.postPlanCatalogue(s);assert.equal(page.pageSize,24);assert(page.cards.length<=24);assert.equal(JSON.stringify(s),before);
  assert(E.postPlanCard(s,'ptc_qwen_sample_tabs').unlocked);assert.equal(E.postPlanCard(s,'ptc_qwen_open_ecosystem')?.unlocked??false,false);
  const filtered=E.postPlanCatalogue(s,{character:'qwen',scope:'all',search:'千问'});assert(filtered.cards.length>0);assert(filtered.cards.every(c=>c.characterId==='qwen'));
  assert.equal(E.postPlanCatalogue(s,{search:'<script>no card</script>'}).cards.length,0);
  assert(!page.cards.some(c=>['filter','verify','curriculum'].includes(c.id)));
});
test('current catalogue save proves history/queue, rejects injected definition/URL/version and transaction failures preserve seed/receipt',async()=>{
  const s=fresh(),v=confirmed(s),sid=v.sessionId,before=JSON.stringify(s),command={name:'postPlan.choose',args:{sessionId:sid,expectedRevision:v.revision,turn:v.turn,cardId:v.hand.find(h=>h.affordable).id}};
  await assert.rejects(transactPostPlan(s,command,{persist:async()=>({ok:false,reason:'catalogue write denied'})}),/catalogue write denied/);assert.equal(JSON.stringify(s),before);
  const result=await transactPostPlan(s,command,{persist:async()=>({ok:true})});assert.equal(result.view.choiceRevision,1);
  const raw=JSON.stringify(s),loaded=safeLoadState(raw);assert(loaded.ok,loaded.reason);assert.deepEqual(loaded.s.postPlanSessions,s.postPlanSessions);
  for(const damage of [x=>x.postPlanSessions.format='solo-post-plan-v2',x=>x.postPlanSessions.catalogFingerprint='other',x=>x.postPlanSessions.sessions[sid].effects=[{op:'realGain'}],x=>x.postPlanSessions.sessions[sid].assetUrl='https://bad.invalid',x=>x.postPlanSessions.sessions[sid].replayProof.pending.push({id:99,dueTurn:3,payload:[op('flow',8)]}),x=>x.postPlanSessions.sessions[sid].replayProof.history[0].tags=['finish']]){const x=structuredClone(s);damage(x);const unchanged=JSON.stringify(x),provider=E.P();assert.equal(safeLoadState(x).ok,false);assert.equal(JSON.stringify(x),unchanged);assert.equal(E.P(),provider);}
});

test('actual revealed delayed cards survive reload/control and failed commits without double-paying scheduled work',async()=>{
  const s=fresh(), deck=['basic','ptc_qwen_context_index','ptc_gemini_million_window'];
  assert(s.techs.includes('long_ctx'),'historical constructor owns the real method; no synthetic grant');
  let v=confirmed(s,deck), chosen=v.hand.find(h=>['ptc_qwen_context_index','ptc_gemini_million_window'].includes(h.id));
  assert(chosen,'two distinct real draws from three include a delayed card');
  const action={name:'postPlan.choose',args:{sessionId:v.sessionId,expectedRevision:v.revision,turn:v.turn,cardId:chosen.id}},before=JSON.stringify(s);
  await assert.rejects(transactPostPlan(s,action,{persist:async()=>{throw Error('delayed write denied');}}),/delayed write denied/);assert.equal(JSON.stringify(s),before);
  v=(await transactPostPlan(s,action,{persist:async()=>({ok:true})})).view;
  const proof=structuredClone(s.postPlanSessions.sessions[v.sessionId].replayProof);assert.equal(proof.pending.length,1);assert.equal(proof.pending[0].dueTurn,3);
  const loaded=safeLoadState(JSON.stringify(s));assert(loaded.ok,loaded.reason);assert.deepEqual(loaded.s.postPlanSessions.sessions[v.sessionId].replayProof,proof);
  for(const mode of ['auto','manual'])v=cmd(loaded.s,'postPlan.setControl',{sessionId:v.sessionId,expectedRevision:v.revision,mode,scope:'session'});
  assert.deepEqual(loaded.s.postPlanSessions.sessions[v.sessionId].replayProof,proof);
  v=cmd(loaded.s,'postPlan.choose',{sessionId:v.sessionId,expectedRevision:v.revision,turn:v.turn,cardId:'basic'}).view;
  assert.equal(v.turn,3);assert.equal(v.pending.length,0);assert(v.focus>proof.focus);
  while(v.status==='playing')v=cmd(loaded.s,'postPlan.choose',{sessionId:v.sessionId,expectedRevision:v.revision,turn:v.turn,cardId:'basic'}).view;
  assert.equal(Object.keys(loaded.s.postPlanSessions.receipts).length,1);assert.equal(v.log.length,6);assert.equal(v.pending.length,0);
  const reloaded=safeLoadState(JSON.stringify(loaded.s));assert(reloaded.ok,reloaded.reason);assert.deepEqual(reloaded.s.postPlanSessions,loaded.s.postPlanSessions);
  assert.equal(loaded.s.postPlanSessions.catalogVersion,POST_CARD_CATALOG.version);
});

test('strict current catalogue rejects missing version and payloads hidden in draft or receipt without touching Provider/state',()=>{
 const s=fresh(),v=cmd(s,'postPlan.open',{modelId:s.working,expectedModelToken:null});
 for(const damage of [x=>delete x.postPlanSessions.catalogVersion,x=>x.postPlanSessions.catalogVersion='old',x=>x.postPlanSessions.sessions[v.sessionId].unlockProof={effects:[]},x=>x.postPlanSessions.sessions[v.sessionId].readyAtDay=x.day,x=>x.postPlanSessions.sessions[v.sessionId].invalidReason={assetUrl:'bad'}]){
   const x=structuredClone(s);damage(x);const raw=JSON.stringify(x),provider=E.P();assert.equal(safeLoadState(x).ok,false);assert.equal(JSON.stringify(x),raw);assert.equal(E.P(),provider);
 }
});
