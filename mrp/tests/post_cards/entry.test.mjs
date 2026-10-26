import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { HistoryProvider } from '../../src/career/sim/provider.js';
import { activatePostSessions } from '../../src/career/sim/post_plan_state.js';
import { newModel } from '../../src/career/sim/projects.js';
import { transactPostTraining, postPlanPending } from '../../src/career/ui/post_plan_transaction.js';
import { pendingPostTraining, usesPostTrainingCards, beginPostTraining } from '../../src/career/ui/post_training_entry.js';
import { safeLoadState } from '../../src/career/ui/storage.js';
import { setState, setWorld, setMp, clock } from '../../src/career/ui/state.js';
import { setRemote } from '../../src/career/ui/act.js';

globalThis.document ??= { baseURI: 'http://localhost/' };
const train = await import('../../src/career/ui/pages/train.js');
const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,String(v)), removeItem: k => storage.delete(k) };
const persist = async () => ({ ok: true });
const spec = { kind: 'post', target: 'main', dir: 'auto', until: 'none' };
const json = s => JSON.stringify(s);
function fresh() {
  E.setProvider(new HistoryProvider()); const s = E.createSinglePlayerGame('deepseek', 'y2025', 73);
  s.jobs.list = []; s.queue = []; s.jobs.repair = false; s.jobs.autoRepair = false; s.health = 90;
  setState(s); setWorld(null); setMp(null); setRemote(null); storage.clear(); return s;
}
const start = (s, cfg = spec, options = {}) => transactPostTraining(s, cfg, { persist, ...options });
function cmd(s, name, args = {}) { const r = E.applyCommand(s, { name, args }); assert(r.ok, r.err); return r.result; }
function confirm(s, v) { return cmd(s, 'postPlan.confirmDeck', { sessionId: v.sessionId, expectedRevision: v.revision, cardIds: v.deck, directionPolicy: v.directionPolicy }); }
function complete(s, v) { v = confirm(s, v); for (let i = 0; i < 6; i++) v = cmd(s, 'postPlan.choose', { sessionId: v.sessionId, expectedRevision: v.revision, turn: v.turn, cardId: v.hand.find(h=>h.affordable).id }).view; return v; }
const realValues = s => json({ day:s.day,date:s.date,rng:s.rng,cash:s.cash,models:s.models,data:s.data,health:s.health,mstat:s.mstat,postCards:s.postCards });
function button(attribute, value = '') { const b = { disabled:false, dataset:{ [attribute.replace(/^data-/, '').replace(/-([a-z])/g, (_,x)=>x.toUpperCase())]:value }, hasAttribute:k=>k===attribute, closest:selector=>selector.split(',').some(x=>x.trim()===`[${attribute}]`)?b:null }; return b; }
function ctx(st) { return { st, draw() {}, guard: fn => fn() }; }
async function idle(st) { for(let i=0;st.postPlanBusy&&i<20;i++) await new Promise(setImmediate); assert.equal(!!st.postPlanBusy,false); }
afterEach(() => { setWorld(null); setMp(null); setRemote(null); });

test('start transaction saves job and draft together; default manual and real values stay unchanged', async () => {
  const s=fresh(), before=realValues(s); let saved;
  const r=await start(s,spec,{persist:async draft=>{saved=structuredClone(draft);assert.equal(s.jobs.list.length,0);assert.equal(s.postPlanSessions.nextEpoch,0);return {ok:true};}});
  assert.equal(r.postPlan.status,'draft');assert.equal(r.postPlan.controlMode,'manual');assert.equal(r.postPlan.hand.length,0);
  assert.equal(saved.jobs.list.length,1);assert.equal(saved.postPlanSessions.nextEpoch,1);assert.equal(realValues(s),before);
  assert.equal(E.allocJobs(s).items[0].why,'sessionPending');assert.equal(E.allocJobs(s).items[0].cards,0);
});

test('failed storage, invalid job, stale model and queued event leave neither job nor session', async () => {
  const s=fresh();
  for(const [cfg,options,pattern] of [[spec,{persist:async()=>({ok:false,reason:'disk full'})},/disk full/],[{...spec,dir:'invalid'},{},/方向/],[spec,{modelId:'stale-model'},/目标/]]) {
    const before=json(s);await assert.rejects(start(s,cfg,options),pattern);assert.equal(json(s),before);assert.equal(postPlanPending(s),false);
  }
  s.queue.push({kind:'story',id:'pending'});const before=json(s);await assert.rejects(start(s),/事件/);assert.equal(json(s),before);
});

test('double click during write and retry after success never duplicate job, session or real charge', async () => {
  const s=fresh(), before=json(s);let release;
  const first=start(s,spec,{persist:()=>new Promise(r=>{release=r;})});
  assert(postPlanPending(s));await assert.rejects(start(s),/保存/);assert.equal(json(s),before);
  release({ok:true});const r=await first, stable=json(s),again=await start(s);
  assert.equal(again.job.id,r.job.id);assert.equal(again.postPlan.sessionId,r.postPlan.sessionId);assert.equal(json(s),stable);
});

test('cancel/restart, direction switch and exact reload reuse the same hand and six-turn plan', async () => {
  const s=fresh();let r=await start(s),v=confirm(s,r.postPlan);
  v=cmd(s,'postPlan.choose',{sessionId:v.sessionId,expectedRevision:v.revision,turn:v.turn,cardId:v.hand.find(h=>h.affordable).id}).view;
  const ledger=json(s.postPlanSessions),before=realValues(s);E.cancelJob(s,r.job.id);
  r=await start(s,{...spec,dir:'writing'});assert.equal(json(s.postPlanSessions),ledger);assert.equal(realValues(s),before);
  const loaded=safeLoadState(json(s));assert(loaded.ok,loaded.reason);
  const again=await start(loaded.s,{...spec,dir:'math'},{updateDirection:true});
  assert.equal(again.postPlan.sessionId,v.sessionId);assert.deepEqual(again.postPlan.hand,v.hand);assert.equal(again.postPlan.turn,2);assert.equal(loaded.s.postPlanSessions.nextEpoch,1);
});

test('completed plan is reused on retraining; no early payout or changed effective day', async () => {
  const s=fresh(),r=await start(s),done=complete(s,r.postPlan),ledger=json(s.postPlanSessions),before=realValues(s);
  assert.equal(done.log.length,6);assert.equal(done.status,'ready');assert.equal(done.effectiveFromDay,'2025-01-02');
  E.cancelJob(s,r.job.id);const again=await start(s);assert.equal(again.postPlan.sessionId,done.sessionId);assert.equal(json(s.postPlanSessions),ledger);assert.equal(realValues(s),before);
  const unpaid=json(s.models),rng=s.rng,cash=s.cash;E.postTick(s,{notes:[]});assert.equal(json(s.models),unpaid);assert.equal(s.rng,rng);assert.equal(s.cash,cash);assert.equal(s.mstat.train,0);
  s.day=done.effectiveFromDay;activatePostSessions(s);assert.equal(E.postPlanView(s,done.sessionId).status,'active');
  const days=E.workingModel(s).postDays||0;E.postTick(s,{notes:[]});assert.equal(E.workingModel(s).postDays,days+1);
  const paid=json(s);E.postTick(s,{notes:[]});assert.equal(json(s),paid);
});

test('persistent main job follows a new model but receives a fresh manual session only', async () => {
  const s=fresh(),first=await start(s),done=confirm(s,first.postPlan);
  cmd(s,'postPlan.setControl',{sessionId:done.sessionId,expectedRevision:done.revision,mode:'auto',scope:'session'});
  const old=json(s.postPlanSessions.sessions[done.sessionId]);const m=newModel(s,{total:7,active:7,arch:'dense'});s.models.push(m);s.working=m.id;
  const next=await start(s);assert.equal(next.job.id,first.job.id);assert.notEqual(next.postPlan.sessionId,done.sessionId);assert.equal(next.postPlan.controlMode,'manual');assert.equal(next.postPlan.status,'draft');assert.equal(s.jobs.list.length,1);assert.equal(json(s.postPlanSessions.sessions[done.sessionId]),old);
});

test('actual replan remains opt-in: a later start resumes it without extra epochs', async () => {
  const s=fresh();s.techs=s.techs.filter(id=>id!=='dpo');s.strategy.done={};const first=await start(s),done=complete(s,first.postPlan);
  s.techs.push('dpo');const reuse=await start(s);assert.equal(reuse.postPlan.sessionId,done.sessionId);assert.equal(s.postPlanSessions.nextEpoch,1);
  const replanned=cmd(s,'postPlan.replan',{sessionId:done.sessionId,expectedRevision:done.revision});const next=await start(s);
  assert.equal(next.postPlan.sessionId,replanned.sessionId);assert.equal(next.postPlan.controlMode,'manual');assert.equal(s.postPlanSessions.nextEpoch,2);
});

test('ordinary train view never starts work; auto-resume only accepts an existing unpaused job', async () => {
  const s=fresh(),st={page:'train',postPlanAutoEnter:true},el={isConnected:true,querySelector:()=>null};const before=json(s);
  train.after(el,s,st,ctx(st));assert.equal(json(s),before);assert.equal(pendingPostTraining(s),null);
  const j=E.startJob(s,spec);E.pauseJob(s,j.id,true);assert.equal(pendingPostTraining(s),null);E.pauseJob(s,j.id,false);
  st.postPlanAutoEnter=true;train.after(el,s,st,ctx(st));await idle(st);assert(st.postPlanSessionId);assert.equal(s.jobs.list.length,1);
  const stable=json(s);train.click(s,button('data-pp-back'),ctx(st));assert.equal(st.postPlanSessionId,null);train.after(el,s,st,ctx(st));assert.equal(json(s),stable);assert.equal(st.postPlanSessionId,null);
  E.cancelJob(s,j.id);await assert.rejects(start(s,spec,{existingOnly:true,jobId:j.id}),/作业/);assert.equal(s.jobs.list.length,0);
});

test('training start button and model direction shortcut enter the actual card view directly', async () => {
  const s=fresh(),st={page:'train',newJob:'post',post:{target:'main',dir:'auto',until:'d30'},opt:{}};
  await train.click(s,button('data-op','start-post'),ctx(st));assert(st.postPlanSessionId);assert.equal(st.newJob,null);assert.match(train.render(s,st),/pp-draft/);assert.equal(s.jobs.list[0].until.days,30);
  train.click(s,button('data-pp-back'),ctx(st));const session=Object.keys(s.postPlanSessions.sessions)[0];
  await train.click(s,button('data-post-main','writing'),ctx(st));assert.equal(st.postPlanSessionId,session);assert.equal(s.jobs.list.length,1);assert.equal(s.jobs.list[0].dir,'writing');
});

test('MP, remote mirror, legacy and benchmark continue to bypass card entry', async () => {
  const s=fresh();assert(usesPostTrainingCards(s,spec));assert.equal(usesPostTrainingCards(s,{...spec,bench:'mmlupro'}),false);
  setMp({});assert.equal(usesPostTrainingCards(s,spec),false);setMp(null);
  setRemote({});assert.equal(usesPostTrainingCards(s,spec),false);setRemote(null);
  setWorld({settings:{mp:true}});assert.equal(usesPostTrainingCards(s,spec),false);setWorld(null);
  assert.equal(usesPostTrainingCards({...s,postRandom:{version:1}},spec),false);assert.equal(usesPostTrainingCards({...s,postPlanSessions:undefined},spec),false);
  const before=json(s);await assert.rejects(start(s,spec,{world:{settings:{mp:true}}}),/联机/);assert.equal(json(s),before);
});

test('previous generation and pending small model bind separate jobs and sessions', async () => {
  const s=fresh(),old=E.workingModel(s),m=newModel(s,{total:7,active:7,arch:'dense'});
  s.models.push(m);s.working=m.id;s.prevWorking={id:old.id,until:'2025-02-01'};
  const prev=await start(s,{...spec,target:'prev'});assert.equal(prev.postPlan.modelId,old.id);assert.equal(prev.job.target,'prev');
  const small=newModel(s,{total:1,active:1,arch:'dense'});small.role='small';s.models.push(small);s.smallWorking=small.id;
  const side=await start(s,{...spec,target:`small:${small.id}`,until:{days:30}});
  assert.equal(side.postPlan.modelId,small.id);assert.notEqual(side.postPlan.sessionId,prev.postPlan.sessionId);assert.equal(s.jobs.list.length,2);
});

test('world start persists prospective job/session together and rejects failed writes atomically', async () => {
  const s=fresh(),world={settings:{you:s.charId},companies:{[s.charId]:{s}}},before=json(s);
  await assert.rejects(start(s,spec,{world,persist:async(draft,supplied,live)=>{
    assert.equal(supplied,world);assert.equal(live,s);assert.equal(world.companies[s.charId].s.jobs.list.length,0);
    assert.equal(draft.jobs.list.length,1);assert.equal(draft.postPlanSessions.nextEpoch,1);return {ok:false,reason:'world save denied'};
  }}),/world save denied/);assert.equal(json(s),before);
  await start(s,spec,{world});assert.equal(world.companies[s.charId].s,s);assert.equal(s.jobs.list.length,1);
});

test('stale explicit generation token and detached current state do not mutate or reveal a session', async () => {
  const s=fresh();await start(s);const before=json(s);await assert.rejects(start(s,spec,{modelToken:null}),/目标/);assert.equal(json(s),before);
  const n=fresh(),original=json(n);let writes=0;
  await assert.rejects(start(n,spec,{current:()=>false,persist:async()=>{writes++;return {ok:true};}}),/改变/);
  assert.equal(writes,0);assert.equal(json(n),original);
});

test('repeated real entry preserves the clock lock and one pause-resume does not resume other focused jobs', async () => {
  const s=fresh();clock.busy=false;
  const first=beginPostTraining(s,spec),second=beginPostTraining(s,spec);
  await assert.rejects(second,/保存/);const r=await first;assert.equal(clock.busy,false);assert.equal(s.jobs.list.length,1);
  const small=newModel(s,{total:1,active:1,arch:'dense'});small.role='small';s.models.push(small);s.smallWorking=small.id;
  const side=await start(s,{...spec,target:`small:${small.id}`});E.focusResearch(s,true);
  const main=s.jobs.list.find(j=>j.id===r.job.id);await start(s,main,{existingOnly:true,jobId:main.id,resume:true});
  assert.equal(s.jobs.list.find(j=>j.id===main.id).paused,false);assert.equal(s.jobs.list.find(j=>j.id===side.job.id).paused,true);
});
