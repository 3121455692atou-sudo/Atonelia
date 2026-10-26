import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { setState, setWorld, setMp, bind } from '../../src/career/ui/state.js';
globalThis.document ??= {baseURI:'http://localhost/'};
const panel=await import('../../src/career/ui/panels/post_plan.js');
const tick=()=>new Promise(r=>setImmediate(r));
function game(company='deepseek') { E.setProvider();const s=E.createSinglePlayerGame(company,'y2025',7);s.queue=[];s.jobs.list=[];const r=E.applyCommand(s,{name:'postPlan.open',args:{modelId:s.working,expectedModelToken:null}});assert(r.ok,r.err);return {s,v:r.result}; }
const button={disabled:false,dataset:{ppDeck:'ptc_qwen_sample_tabs'},hasAttribute:k=>k==='data-pp-deck'};
const target={closest:()=>button};
for(const result of ['resolve','reject'])for(const transition of ['same-state-reset','leave-and-return','new-game'])test(`${result} after ${transition}: old request cannot change reused busy/error/focus or redraw`,async()=>{
 const original=globalThis.localStorage;let fail=result==='reject';globalThis.localStorage={setItem(){if(fail)throw Error('quota')},getItem(){return null}};
 let globalDraws=0;bind({render(){globalDraws++}});
 try {
  const {s,v}=game();setState(s);setWorld(null);setMp(null);const st={postPlanSessionId:v.sessionId};let oldDraws=0;
  panel.click(s,target,{st,draw(){oldDraws++}});assert.equal(st.postPlanBusy,true);assert.equal(oldDraws,1);
  if(transition==='leave-and-return')panel.dispose(s);
  if(transition==='new-game')setState(game('qwen').s);
  // resetOffice reuses this exact object; a newer UI/request now owns these fields.
  for(const k of Object.keys(st))delete st[k];
  const newer={alive:true};Object.assign(st,{postPlanRequest:newer,postPlanSessionId:transition==='new-game'?'new-session':v.sessionId,postPlanBusy:true,postPlanError:'new-error',postPlanCardFocus:'new-focus',postPlanEvent:{new:true}});
  await tick();assert.equal(st.postPlanRequest,newer);assert.equal(st.postPlanBusy,true);assert.equal(st.postPlanError,'new-error');assert.equal(st.postPlanCardFocus,'new-focus');assert.deepEqual(st.postPlanEvent,{new:true});assert.equal(oldDraws,1);assert.equal(globalDraws,0);
 }finally{globalThis.localStorage=original;bind({render(){}});}
});
test('successful current request clears only its own busy token and repaints; dispose invalidates a pending request before same-page return',async()=>{
 const original=globalThis.localStorage;globalThis.localStorage={setItem(){},getItem(){return null}};
 try {const {s,v}=game();setState(s);setWorld(null);setMp(null);const st={postPlanSessionId:v.sessionId};let draws=0;
 panel.click(s,target,{st,draw(){draws++}});await tick();assert.equal(st.postPlanBusy,false);assert.equal(st.postPlanRequest,undefined);assert.equal(draws,2);assert.equal(E.postPlanView(s,v.sessionId).deck.length,3);
 panel.click(s,target,{st,draw(){draws++}});assert.equal(st.postPlanBusy,true);panel.dispose(s);assert.equal(st.postPlanBusy,false);assert.equal(st.postPlanRequest,undefined);const afterLeave=draws;await tick();assert.equal(draws,afterLeave);assert.equal(st.postPlanError,null);
 // Explicitly reopened view reads the accepted ledger, not stale feedback.
 assert.equal(E.postPlanView(s,v.sessionId).deck.length,4);assert.match(panel.render(s,{postPlanSessionId:v.sessionId}),/已选 4\/4/);
 }finally{globalThis.localStorage=original;}
});
test('completion draw that resets office cannot trigger a second stale global repaint',async()=>{
 const original=globalThis.localStorage;globalThis.localStorage={setItem(){},getItem(){return null}};let globalDraws=0;bind({render(){globalDraws++}});
 try {const {s,v}=game();setState(s);setWorld(null);setMp(null);const st={postPlanSessionId:v.sessionId};let draws=0;
 panel.click(s,target,{st,draw(){if(++draws===2){panel.dispose(s);for(const key of Object.keys(st))delete st[key];st.postPlanError='replacement';st.postPlanBusy=true;}}});await tick();assert.equal(globalDraws,0);assert.equal(st.postPlanError,'replacement');assert.equal(st.postPlanBusy,true);
 }finally{globalThis.localStorage=original;bind({render(){}});}
});
for(const failure of [false,true])test(`real new-game request owns reused state while old ${failure?'rejection':'completion'} arrives`,async()=>{
 const original=globalThis.localStorage;let fail=failure;globalThis.localStorage={setItem(){if(fail)throw Error('old quota')},getItem(){return null}};
 try {const old=game();setState(old.s);setWorld(null);setMp(null);let track=false,clears=0;const st=new Proxy({postPlanSessionId:old.v.sessionId},{set(o,k,v){if(track&&k==='postPlanBusy'&&v===false)clears++;o[k]=v;return true;}});let oldDraws=0,newDraws=0;
 panel.click(old.s,target,{st,draw(){oldDraws++}});
 const next=game('qwen');setState(next.s);for(const k of Object.keys(st))delete st[k];st.postPlanSessionId=next.v.sessionId;fail=false;track=true;
 panel.click(next.s,target,{st,draw(){newDraws++}});assert.equal(st.postPlanBusy,true);await tick();assert.equal(clears,1);assert.equal(oldDraws,1);assert.equal(newDraws,2);assert.equal(st.postPlanBusy,false);assert.equal(st.postPlanError,null);assert.equal(st.postPlanSessionId,next.v.sessionId);assert.equal(E.postPlanView(next.s,next.v.sessionId).deck.length,3);
 }finally{globalThis.localStorage=original;}
});
