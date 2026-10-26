import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {resolveAll} from '../../src/career/sim/bot_events.js';
import {transactPostOnlyResume} from '../../src/career/ui/post_plan_transaction.js';
import {postOnlyStatus} from '../../src/career/ui/post_only_status.js';
const command=(s,name,args)=>{const r=E.applyCommand(s,{name,args});assert.ok(r.ok,r.err);return r.result;};
const fixture=(kind)=>{E.setProvider();const s=E.createSinglePlayerGame('deepseek','y2025',901);resolveAll(s);const j=E.startJob(s,{kind:'post',target:'main',dir:'auto',until:'none',...(kind==='bench'?{bench:'arena'}:{})});if(kind==='paused')E.pauseJob(s,j.id,true);if(kind==='focus')E.focusResearch(s,true);E.enablePostOnly(s);E.postOnlyDay(s);return {s,j};};
const finish=(s,id)=>{let v=E.postPlanView(s,id);v=command(s,'postPlan.confirmDeck',{sessionId:id,expectedRevision:v.revision,cardIds:v.deck,directionPolicy:v.directionPolicy});for(let i=0;i<6;i++)v=command(s,'postPlan.choose',{sessionId:id,expectedRevision:v.revision,turn:v.turn,cardId:'basic'}).view;};
for(const kind of ['paused','focus','bench'])test(`explicit recovery of ${kind} preserves six hands; only requested target resumes`,async()=>{
 const {s,j}=fixture(kind),id=s.postPlanSessions.byModel[s.working];finish(s,id);E.tickDay(s);E.tickDay(s);
 assert.equal(E.allocJobs(s).items.find(x=>x.job.id===j.id).run,false,'reproduce six-hand active plan without actual training');assert.deepEqual(s.postCards.lastDays,{});
 assert.equal(postOnlyStatus(s).phase,'blocked');const b=E.postOnlyBlockedTraining(s)[0],cards=JSON.stringify(s.postPlanSessions),before=JSON.stringify(s);let writes=0;
 await assert.rejects(()=>transactPostOnlyResume(s,b,{persist:async()=>({ok:false,reason:'disk full'})}),/disk full/);assert.equal(JSON.stringify(s),before);
 await transactPostOnlyResume(s,b,{persist:async()=>{writes++;return {ok:true};}});assert.equal(writes,1);assert.equal(JSON.stringify(s.postPlanSessions),cards);
 assert.equal(s.jobs.list.find(x=>x.id===j.id).paused,false);assert.equal(s.jobs.list.find(x=>x.id===j.id).bench,undefined);assert.equal(E.postOnlyBlockedTraining(s).length,0);
 const once=JSON.stringify(s);await transactPostOnlyResume(s,b,{persist:async()=>({ok:true})});assert.equal(JSON.stringify(s),once,'repeat must not redraw or rewrite the job');
 E.tickDay(s);assert.ok(s.postCards.lastDays[s.working],'real daily training now settles');
 command(s,'setPlayMode',{mode:'full'});const exited=JSON.stringify(s);E.postOnlyDay(s);assert.equal(JSON.stringify(s),exited);
});
test('recovery serializes double clicks, rejects stale model/job and MP, preserves already played cards',async()=>{
 const {s}=fixture('paused'),b=E.postOnlyBlockedTraining(s)[0],before=JSON.stringify(s);let release;const wait=new Promise(r=>release=r);
 const first=transactPostOnlyResume(s,b,{persist:async()=>{await wait;return {ok:true};}});await assert.rejects(()=>transactPostOnlyResume(s,b,{persist:async()=>({ok:true})}),/正在保存/);assert.equal(JSON.stringify(s),before);release();await first;
 for(const args of [{...b,modelId:'different'},{...b,jobId:'different'},{...b,modelToken:'wrong'}]){const raw=JSON.stringify(s);await assert.rejects(()=>transactPostOnlyResume(s,args,{persist:async()=>({ok:true})}));assert.equal(JSON.stringify(s),raw);}
 const raw=JSON.stringify(s);await assert.rejects(()=>transactPostOnlyResume(s,b,{world:{settings:{mp:true}},persist:async()=>({ok:true})}),/联机/);assert.equal(JSON.stringify(s),raw);
});
test('pending selector is read-only and excludes paused, evaluating and newly archived targets until usable again',()=>{
 const {s,j}=fixture('paused'),id=s.postPlanSessions.byModel[s.working];const raw=JSON.stringify(s);assert.equal(E.pendingPostOnlySession(s),null);assert.equal(JSON.stringify(s),raw);
 E.pauseJob(s,j.id,false);assert.equal(E.pendingPostOnlySession(s),id);const m=E.workingModel(s);m.evalId='test-only-transition';assert.equal(E.pendingPostOnlySession(s),null);delete m.evalId;assert.equal(E.pendingPostOnlySession(s),id);
 const current=s.working;s.working=null;assert.equal(E.pendingPostOnlySession(s),null);s.working=current;assert.equal(E.pendingPostOnlySession(s),id);
});
test('new-game status distinguishes no first tick, pending cards, activation and real running without writing state',()=>{
 E.setProvider();const s=E.createSinglePlayerGame('deepseek','y2025',902);E.enablePostOnly(s);const raw=JSON.stringify(s);assert.equal(postOnlyStatus(s).phase,'not-started');assert.match(postOnlyStatus(s).text,/尚未推进首个/);assert.equal(JSON.stringify(s),raw);assert.doesNotMatch(E.startModel('deepseek','y2025').detail,/正在后训练/);
 E.tickDay(s);assert.equal(postOnlyStatus(s).phase,'cards');const id=E.pendingPostOnlySession(s);finish(s,id);assert.equal(postOnlyStatus(s).phase,'activation');E.tickDay(s);E.tickDay(s);assert.equal(postOnlyStatus(s).phase,'running');
});

test('an unavailable older pending session cannot hide a newer usable model session',()=>{
 const {s,j}=fixture('paused'),old=s.working;
 // Synthetic rollover boundary: only this unit fixture adds an already-valid
 // model shape; long-run matrix separately obtains all generations naturally.
 const m=structuredClone(E.workingModel(s));m.id+=':next-test';s.models.push(m);s.smallWorking=m.id;
 const v=command(s,'postPlan.open',{modelId:m.id,expectedModelToken:null});
 assert.equal(E.pendingPostOnlySession(s),v.sessionId);
 E.pauseJob(s,j.id,false);assert.equal(E.pendingPostOnlySession(s),s.postPlanSessions.byModel[old]);
 E.pauseJob(s,j.id,true);assert.equal(E.pendingPostOnlySession(s),v.sessionId);
});

test('explicit resume leaves another paused target and its direction untouched',async()=>{
 const {s,j}=fixture('paused');const m=structuredClone(E.workingModel(s));m.id+=':other-test';s.models.push(m);s.smallWorking=m.id;
 const other=E.startJob(s,{kind:'post',target:`small:${m.id}`,dir:'auto',until:'none'});E.pauseJob(s,other.id,true);
 const before=JSON.stringify(other),b=E.postOnlyBlockedTraining(s).find(x=>x.jobId===j.id);
 await transactPostOnlyResume(s,b,{persist:async()=>({ok:true})});assert.equal(JSON.stringify(s.jobs.list.find(x=>x.id===other.id)),before);
});
