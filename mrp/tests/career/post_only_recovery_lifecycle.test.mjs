import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {setState,setWorld,clock} from '../../src/career/ui/state.js';
globalThis.document??={baseURI:'http://localhost/'};
const {resumePostOnlyFromHome}=await import('../../src/career/ui/post_only_recovery.js');
const {commitPostOnlyResume}=await import('../../src/career/ui/post_plan_transaction.js');
const fresh=()=>{E.setProvider();const s=E.createSinglePlayerGame('deepseek','y2025',911);E.enablePostOnly(s);return s;};
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('home recovery ignores stale rejection and cannot clear a newer busy owner',async()=>{
 let s=fresh();const u={screen:'home',busy:false},d=defer(),notices=[],opened=[];
 const deps={getState:()=>s,getWorld:()=>null,ui:u,commit:()=>d.promise,toast:x=>notices.push(x),openOffice:(...x)=>opened.push(x)};
 const pending=resumePostOnlyFromHome({},deps);assert.equal(u.busy,true);assert.equal(await resumePostOnlyFromHome({},deps),false);
 s=fresh();const newer={};u.postOnlyResumeToken=newer;u.busy=true;d.reject(Error('old write'));await pending;
 assert.deepEqual(notices,[]);assert.deepEqual(opened,[]);assert.equal(u.busy,true);assert.equal(u.postOnlyResumeToken,newer);
});
test('navigation/mode changes suppress old success panel; current success releases only its own token',async()=>{
 for(const transition of ['leave','mode','none']){
  const s=fresh(),u={screen:'home',busy:false},d=defer(),opened=[],notices=[];
  const p=resumePostOnlyFromHome({}, {getState:()=>s,getWorld:()=>null,ui:u,commit:()=>d.promise,toast:x=>notices.push(x),openOffice:(...x)=>opened.push(x)});
  if(transition==='leave')u.screen='title';if(transition==='mode')E.setPlayMode(s,'full');
  d.resolve({postPlan:{sessionId:'saved-session'}});await p;assert.equal(opened.length,transition==='none'?1:0);assert.deepEqual(notices,[]);assert.equal(u.busy,false);assert.equal(u.postOnlyResumeToken,null);
 }
});
test('durable recovery completion cannot release a newer game clock lock',async()=>{
 const s=fresh();E.postOnlyDay(s);const job=s.jobs.list.find(j=>j.kind==='post');E.pauseJob(s,job.id,true);const args=E.postOnlyBlockedTraining(s)[0];setState(s);setWorld(null);clock.busy=false;
 globalThis.localStorage={setItem(){},getItem(){return null;}};
 const pending=commitPostOnlyResume(s,args);const newerState=fresh(),newerToken={};setState(newerState);clock.postPlanToken=newerToken;clock.busy=true;
 await assert.rejects(()=>pending,/当前界面已切换|当前局面已改变/);assert.equal(clock.busy,true);assert.equal(clock.postPlanToken,newerToken);assert.equal(s.jobs.list.find(j=>j.id===job.id).paused,true);
 setState(null);clock.busy=false;clock.postPlanToken=null;delete globalThis.localStorage;
});
