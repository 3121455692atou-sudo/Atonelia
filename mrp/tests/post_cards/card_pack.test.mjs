import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import * as R from '../../src/career/sim/post_catalog_rules.js';
import {HistoryProvider} from '../../src/career/sim/provider.js';
import {validatePostSessionSave} from '../../src/career/sim/post_plan_state.js';
import {safeLoadState} from '../../src/career/ui/storage.js';
import {transactPostPlan} from '../../src/career/ui/post_plan_transaction.js';
import {setState,setWorld,setMp} from '../../src/career/ui/state.js';
globalThis.document ??= {baseURI:'http://localhost/'};
const panel=await import('../../src/career/ui/panels/post_plan.js');
const cmd=(s,name,args={})=>{const r=E.applyCommand(s,{name,args});assert(r.ok,r.err);return r.result;};
function fresh(company='deepseek',seed=17){E.setProvider(new HistoryProvider());const s=E.createSinglePlayerGame(company,'y2025',seed);setState(s);setWorld(null);setMp(null);const v=cmd(s,'postPlan.open',{modelId:s.working,expectedModelToken:null});return {s,v};}
const confirm=(s,v)=>cmd(s,'postPlan.confirmDeck',{sessionId:v.sessionId,expectedRevision:v.revision,cardIds:v.deck,directionPolicy:v.directionPolicy});
const use=(s,v)=>cmd(s,'postPlan.choose',{sessionId:v.sessionId,expectedRevision:v.revision,turn:v.turn,cardId:v.hand.find(h=>h.affordable).id}).view;
const update=(s,v,cardIds)=>cmd(s,'postPlan.updateDraft',{sessionId:v.sessionId,expectedRevision:v.revision,cardIds});

for(const company of ['deepseek','image2','midjourney','suno','elevenlabs'])test(`${company}: varied bag completes six legal turns, reloads each turn and retains bounded settlement`,()=>{
 const {s,v:draft}=fresh(company);assert(draft.deck.length>=6);let v=confirm(s,draft);const seen=new Set();
 while(v.status==='playing'){
  assert.equal(v.hand.length,3);assert.equal(new Set(v.hand.map(h=>h.id)).size,3);assert(v.hand.some(h=>h.affordable));v.hand.forEach(h=>seen.add(h.id));
  const loaded=safeLoadState(JSON.stringify(s));assert(loaded.ok,loaded.reason);assert.deepEqual(E.postPlanView(loaded.s,v.sessionId),v);
  v=use(s,v);validatePostSessionSave(s);
 }
 assert(seen.size>=6);assert.equal(v.log.length,6);assert(v.preparation.coverage<=1&&v.preparation.realization<=1);assert.equal(Object.keys(s.postPlanSessions.receipts).length,1);
 const ready=safeLoadState(JSON.stringify(s));assert(ready.ok,ready.reason);
});

test('card pack accepts all actual unlocked cards, and a three-card pack; rejects duplicates and locked cards without writes',()=>{
 const {s,v:initial}=fresh();let v=initial,ids=['basic'];
 for(let page=0;;page++){const q=E.postPlanCatalogue(s,{availability:'unlocked',page});ids.push(...q.cards.map(c=>c.id));if(page+1===q.pages)break;}
 assert(ids.length>24);v=update(s,v,ids);assert.equal(v.deck.length,ids.length);validatePostSessionSave(s);
 const locked=E.postPlanCatalogue(s,{availability:'locked'}).cards[0];
 for(const bad of [[],[...ids,ids[1]],['basic','missing'],['basic',locked.id]]){const before=JSON.stringify(s);const r=E.applyCommand(s,{name:'postPlan.updateDraft',args:{sessionId:v.sessionId,expectedRevision:v.revision,cardIds:bad}});assert.equal(r.ok,false);assert.equal(JSON.stringify(s),before);}
 v=update(s,v,ids.slice(0,3));v=confirm(s,v);assert.equal(v.hand.length,3);
});

test('six or more cards avoid adjacent hand repeats when affordable; shuffle remains deterministic over many seeds and sizes',()=>{
 const {s,v}=fresh();const cfg=s.postPlanSessions.sessions[v.sessionId].openUnlockProof.config;
 const all=R.CARDS.filter(c=>R.unlocked(c.id,cfg)).map(c=>c.id);
 for(const size of [3,4,5,6,7,10,all.length])for(let seed=0;seed<32;seed++){
  const a=R.start(seed,1,all.slice(0,size),cfg),b=R.start(seed,1,all.slice(0,size),cfg);
  while(a.status==='playing'){
   assert.deepEqual(R.replayProof(a),R.replayProof(b));assert.equal(new Set(a.hand).size,3);assert(a.hand.every(id=>a.deck.includes(id)));
   const prev=[...a.hand],id=a.hand.find(id=>R.preview(a,id).affordable);assert(id);
   // Keep this draw-only fixture affordable so fallback does not mask repeat checks.
   a.budget=b.budget=8;assert(R.choose(a,id).ok);assert(R.choose(b,id).ok);
   if(a.status==='playing')assert(a.hand.filter(id=>prev.includes(id)).length<=Math.max(0,6-size));
  }
 }
});

test('a zero-budget bag still offers exactly three distinct cards with a payable fallback',()=>{
 const {s,v}=fresh();const cfg=s.postPlanSessions.sessions[v.sessionId].openUnlockProof.config;
 const paid=R.CARDS.filter(c=>c.cost>0&&R.unlocked(c.id,cfg)).slice(0,12).map(c=>c.id);
 for(let seed=0;seed<40;seed++){
  const r=R.start(seed,1,['basic',...paid],cfg);r.hand=['basic',...paid.slice(0,2)];r.budget=0;r.shield=0;
  assert(R.choose(r,'basic').ok);assert.equal(new Set(r.hand).size,3);assert(r.hand.some(id=>R.preview(r,id).affordable));assert(r.hand.includes('basic'));
 }
});

test('versionless pre-change playing and completed saves retain their exact hands, receipts and RNG proofs',()=>{
 const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/legacy_pack_session.json',import.meta.url)));
 for(const phase of ['playing','ready']){
  const {s}=fresh();s.postPlanSessions=structuredClone(fixture[phase]);const raw=JSON.stringify(s);const loaded=safeLoadState(raw);assert(loaded.ok,loaded.reason);assert.deepEqual(loaded.s.postPlanSessions,fixture[phase]);
  let v=E.postPlanView(loaded.s,Object.keys(fixture[phase].sessions)[0]);if(phase==='playing'){assert(v.hand.some(h=>h.id==='basic'));while(v.status==='playing')v=cmd(loaded.s,'postPlan.choose',{sessionId:v.sessionId,expectedRevision:v.revision,turn:v.turn,cardId:'basic'}).view;}
  validatePostSessionSave(loaded.s);assert.equal(v.status,'ready');
 }
});

test('draw pile tampering or an unknown draw version fails strict loading without touching the input',()=>{
 const {s,v}=fresh();confirm(s,v);
 for(const change of [p=>p.drawRulesVersion=77,p=>p.drawPile.push('missing'),p=>p.drawPile.reverse(),p=>delete p.drawRulesVersion]){
  const raw=structuredClone(s);change(raw.postPlanSessions.sessions[v.sessionId].replayProof);const before=JSON.stringify(raw);assert.equal(safeLoadState(raw).ok,false);assert.equal(JSON.stringify(raw),before);
 }
});

test('bag changes and first deal remain atomic across rejected persistence and idempotent confirmation',async()=>{
 const {s,v}=fresh();const ids=[...v.deck,E.postPlanCatalogue(s,{availability:'unlocked',excludeIds:v.deck}).cards[0].id];
 const update={name:'postPlan.updateDraft',args:{sessionId:v.sessionId,expectedRevision:v.revision,cardIds:ids}};const before=JSON.stringify(s);
 await assert.rejects(transactPostPlan(s,update,{persist:async()=>({ok:false,reason:'quota'})}),/quota/);assert.equal(JSON.stringify(s),before);
 const draft=await transactPostPlan(s,update,{persist:async()=>({ok:true})});
 const command={name:'postPlan.confirmDeck',args:{sessionId:draft.sessionId,expectedRevision:draft.revision,cardIds:draft.deck,directionPolicy:draft.directionPolicy}};const saved=JSON.stringify(s);
 await assert.rejects(transactPostPlan(s,command,{persist:async()=>({ok:false,reason:'quota'})}),/quota/);assert.equal(JSON.stringify(s),saved);
 const first=await transactPostPlan(s,command,{persist:async()=>({ok:true})}),proof=JSON.stringify(s.postPlanSessions);
 assert.deepEqual(await transactPostPlan(s,command,{persist:async()=>({ok:true})}),first);assert.equal(JSON.stringify(s.postPlanSessions),proof);
});

test('real panel moves cards from album to pack and back; opening the pack changes no game state',async()=>{
 const previous=globalThis.localStorage;const data=new Map();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
 try{
  const {s,v}=fresh(),st={postPlanSessionId:v.sessionId},card=E.postPlanCatalogue(s,{availability:'unlocked',excludeIds:v.deck}).cards[0];
  const click=(attr,value)=>panel.click(s,{closest:()=>({disabled:false,dataset:{[attr]:value},hasAttribute:k=>k===attr.replace(/[A-Z]/g,m=>'-'+m.toLowerCase()).replace(/^pp-/,'data-pp-')})},{st,draw(){}});
  assert.match(panel.render(s,st),new RegExp(`data-pp-deck="${card.id}"`));click('ppDeck',card.id);await new Promise(r=>setImmediate(r));
  assert.equal(st.postPlanError,null);assert(E.postPlanView(s,v.sessionId).deck.includes(card.id));assert.doesNotMatch(panel.render(s,st),new RegExp(`data-pp-deck="${card.id}"`));
  const bytes=JSON.stringify(s);click('ppPack','');assert.equal(st.postPlanPackOpen,true);assert.equal(JSON.stringify(s),bytes);assert.match(panel.render(s,st),new RegExp(`data-pp-deck="${card.id}"`));
  click('ppDeck',card.id);await new Promise(r=>setImmediate(r));assert(!E.postPlanView(s,v.sessionId).deck.includes(card.id));click('ppPack','');assert.match(panel.render(s,st),new RegExp(`data-pp-deck="${card.id}"`));
 }finally{globalThis.localStorage=previous;}
});
