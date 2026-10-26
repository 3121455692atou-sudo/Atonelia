import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { HistoryProvider } from '../../src/career/sim/provider.js';
import { validatePostSessionSave } from '../../src/career/sim/post_plan_state.js';
import { transactPostPlan, postPlanPending } from '../../src/career/ui/post_plan_transaction.js';
import { safeLoadState, readSaved, preflightSoloPostPlanSave, SAVE_KEY } from '../../src/career/ui/storage.js';
import { setState, setWorld, setMp } from '../../src/career/ui/state.js';
globalThis.document ??= { baseURI:'http://localhost/' };
const panel=await import('../../src/career/ui/panels/post_plan.js');
const command=(s,name,args={})=>{const r=E.applyCommand(s,{name,args});assert.equal(r.ok,true,r.err);return r.result;};
function fresh(){E.setProvider(new HistoryProvider());const s=E.createSinglePlayerGame('deepseek','y2025',7);s.queue=[];s.jobs.list=[];setState(s);setWorld(null);setMp(null);return [s,command(s,'postPlan.open',{modelId:s.working,expectedModelToken:null})];}
const update=(v,cardIds)=>({name:'postPlan.updateDraft',args:{sessionId:v.sessionId,expectedRevision:v.revision,cardIds}});
const confirm=(v)=>({name:'postPlan.confirmDeck',args:{sessionId:v.sessionId,expectedRevision:v.revision,cardIds:v.deck,directionPolicy:v.directionPolicy}});
function memoryStorage(){const data=new Map();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};return data;}
function noDraw(s,v){const p=s.postPlanSessions.sessions[v.sessionId];assert.equal(v.status,'draft');assert.equal(v.turn,0);assert.deepEqual(v.hand,[]);assert.equal(p.drawTicket,null);assert.equal(p.confirmedDeck,null);assert.equal(p.unlockProof,null);assert.equal(p.replayProof,null);assert.deepEqual(p.choices,[]);assert.deepEqual(s.postPlanSessions.receipts,{});}

test('3-card and custom 4-card draft persist through real writer and strict load/export/reopen with no draw',async()=>{
 const old=globalThis.localStorage;memoryStorage();try{
  const [s,initial]=fresh();const removed=initial.deck.filter(id=>id!=='ptc_qwen_sample_tabs').slice(0,3);
  let v=await transactPostPlan(s,update(initial,removed));assert.equal(v.deck.length,3);noDraw(s,v);
  for(const ids of [removed,[...removed,'ptc_qwen_paired_preferences']]){
   v=await transactPostPlan(s,update(v,ids));validatePostSessionSave(s);noDraw(s,v);
   const raw=localStorage.getItem(SAVE_KEY),loaded=readSaved();assert.equal(loaded.ok,true,loaded.reason);assert.equal(localStorage.getItem(SAVE_KEY),raw);assert.equal(JSON.stringify(loaded.s),raw);
   assert.deepEqual(loaded.s.postPlanSessions,s.postPlanSessions);const reopened=command(loaded.s,'postPlan.open',{modelId:s.working,expectedModelToken:v.generationToken});assert.deepEqual(reopened.deck,ids);assert.equal(reopened.sessionId,initial.sessionId);
   const exported=JSON.stringify(loaded.s),imported=safeLoadState(exported);assert.equal(imported.ok,true,imported.reason);assert.deepEqual(imported.s.postPlanSessions,s.postPlanSessions);
   const html=panel.render(loaded.s,{postPlanSessionId:v.sessionId,postPlanDeck:{sessionId:v.sessionId,ids:initial.deck}});assert.match(html,new RegExp(`打开卡包，共 ${ids.length} 张`));assert.doesNotMatch(html,/data-pp-confirm disabled/);
  }
  const c=confirm(v), accepted=await transactPostPlan(s,c);assert.equal(accepted.turn,1);assert.equal(accepted.hand.length,3);const ticket=s.postPlanSessions.sessions[v.sessionId].drawTicket;
  await transactPostPlan(s,c);assert.equal(s.postPlanSessions.sessions[v.sessionId].drawTicket,ticket);validatePostSessionSave(s);
 }finally{globalThis.localStorage=old;}
});
test('draft write failure/throw rolls back; pending and stale operations reject before persist',async()=>{
 const [s,v]=fresh(),ids=v.deck.slice(0,3),before=JSON.stringify(s);let writes=0;
 for(const persist of [async()=>({ok:false,reason:'quota'}),async()=>{throw Error('disk failed')}]){await assert.rejects(transactPostPlan(s,update(v,ids),{persist}));assert.equal(JSON.stringify(s),before);assert.equal(postPlanPending(s),false);}
 let release;const wait=new Promise(r=>release=r),run=transactPostPlan(s,update(v,ids),{persist:async()=>wait});assert.equal(JSON.stringify(s),before);assert.equal(postPlanPending(s),true);
 await assert.rejects(transactPostPlan(s,update(v,ids),{persist:async()=>{writes++;return {ok:true}}}),/保存/);release({ok:true});const current=await run;assert.equal(current.revision,1);
 await assert.rejects(transactPostPlan(s,update(v,v.deck),{persist:async()=>{writes++;return {ok:true}}}),/过期/);assert.equal(writes,0);noDraw(s,current);
});
test('current v2 requires exact schema and legal draft selection; v1 and corrupt inputs remain byte-identical',()=>{
 const [s,v]=fresh();const mutations=[x=>x.postPlanSessions.format='solo-post-plan-catalog-v1',x=>delete x.postPlanSessions.sessions[v.sessionId].draftChanges,x=>x.postPlanSessions.sessions[v.sessionId].draftChanges=1,x=>x.postPlanSessions.sessions[v.sessionId].draftChanges=-1,x=>x.postPlanSessions.sessions[v.sessionId].unknown=true,x=>x.postPlanSessions.sessions[v.sessionId].draftDeck=['basic','missing'],x=>x.postPlanSessions.sessions[v.sessionId].draftDeck=['basic','basic'],x=>x.postPlanSessions.sessions[v.sessionId].draftDeck=[],x=>x.postPlanSessions.sessions[v.sessionId].controlMode='auto'];
 const old=globalThis.localStorage;const storage=memoryStorage();try{for(const mutate of mutations){const x=structuredClone(s);mutate(x);const raw=JSON.stringify(x);storage.set(SAVE_KEY,raw);const loaded=readSaved();assert.equal(loaded.ok,false);assert.equal(preflightSoloPostPlanSave(raw).ok,false);assert.equal(storage.get(SAVE_KEY),raw);assert.equal(JSON.stringify(x),raw);}
 const normal=E.createGame('deepseek','y2025',7);assert.equal(safeLoadState(normal).ok,true);assert.equal(preflightSoloPostPlanSave(normal).ok,false);
 }finally{globalThis.localStorage=old;}
 for(const ids of [[],['basic','basic'],['missing'],v.deck.concat(v.deck[1]),['basic','ptc_qwen_long_context_loom']]){const before=JSON.stringify(s);assert.equal(E.applyCommand(s,update(v,ids)).ok,false);assert.equal(JSON.stringify(s),before);}
});
test('real panel selection uses durable ledger, disables during save, and never confirms or falls back to UI-only deck',async()=>{
 const old=globalThis.localStorage;memoryStorage();try{const [s,v]=fresh(),st={postPlanSessionId:v.sessionId};const button={disabled:false,dataset:{ppDeck:'ptc_qwen_sample_tabs'},hasAttribute:k=>k==='data-pp-deck'};
 assert.equal(panel.click(s,{closest:()=>button},{st,draw(){}}),true);assert.equal(st.postPlanBusy,true);assert.equal(E.postPlanView(s,v.sessionId).deck.length,v.deck.length);
 const busy=panel.render(s,st);for(const match of busy.matchAll(/<button[^>]*data-pp-deck[^>]*>/g))assert.match(match[0],/disabled/);assert.match(busy,/data-pp-back disabled/);assert.match(busy,/正在保存/);
 panel.click(s,{closest:()=>button},{st,draw(){throw Error('second pending click must be disabled')}});
 const back={disabled:false,dataset:{},hasAttribute:k=>k==='data-pp-back'};panel.click(s,{closest:()=>back},{st,draw(){throw Error('pending back must be disabled')}});assert.equal(st.postPlanSessionId,v.sessionId);
 await new Promise(r=>setImmediate(r));assert.equal(st.postPlanBusy,false);assert.equal(st.postPlanError,null);const now=E.postPlanView(s,v.sessionId);assert.equal(now.deck.length,v.deck.length-1);noDraw(s,now);assert.equal(st.postPlanDeck,undefined);assert.equal(readSaved().s.postPlanSessions.sessions[v.sessionId].draftDeck.length,v.deck.length-1);
 const raw=localStorage.getItem(SAVE_KEY),before=JSON.stringify(s);localStorage.setItem=()=>{throw Error('quota')};panel.click(s,{closest:()=>button},{st,draw(){}});await new Promise(r=>setImmediate(r));assert.match(st.postPlanError,/未写入/);assert.equal(JSON.stringify(s),before);assert.equal(localStorage.getItem(SAVE_KEY),raw);
 }finally{globalThis.localStorage=old;}
});

test('draft validates order, minimum/maximum, actual locked cards, unknown args, stale confirmation and post-confirm immutability',()=>{
 const [s,initial]=fresh();let v=command(s,'postPlan.updateDraft',update(initial,['basic']).args);assert.deepEqual(v.deck,['basic']);noDraw(s,v);
 const ids=[...initial.deck].reverse();v=command(s,'postPlan.updateDraft',update(v,ids).args);assert.deepEqual(v.deck,ids);const revision=v.revision;
 v=command(s,'postPlan.updateDraft',update(v,ids).args);assert.equal(v.revision,revision);
 const locked=E.postPlanCatalogue(s,{availability:'locked'}).cards[0];assert.ok(locked);
 const bad=[update(v,['basic',locked.id]),{...update(v,ids),args:{...update(v,ids).args,seed:42}},confirm(initial)];
 for(const c of bad){const before=JSON.stringify(s);assert.equal(E.applyCommand(s,c).ok,false);assert.equal(JSON.stringify(s),before);}
 const accepted=command(s,'postPlan.confirmDeck',confirm(v).args),before=JSON.stringify(s);assert.equal(E.applyCommand(s,update(accepted,['basic'])).ok,false);assert.equal(JSON.stringify(s),before);validatePostSessionSave(s);
 const broken=structuredClone(s);broken.postPlanSessions.sessions[v.sessionId].extra='bad';const unchanged=JSON.stringify(broken);assert.equal(E.applyCommand(broken,update(accepted,['basic'])).ok,false);assert.equal(JSON.stringify(broken),unchanged);
});
