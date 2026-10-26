import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {restoreHistory} from '../helpers/world_provider.mjs';
globalThis.document??={baseURI:'http://localhost/'};
const {defaultSolo,startSolo}=await import('../../src/career/ui/pages/solo_setup.js');
afterEach(()=>restoreHistory());
const command=(s,name,args)=>{const r=E.applyCommand(s,{name,args});assert.equal(r.ok,true,`${name}: ${r.err}`);return r.result;};
function playerCompletesCards(s,p) {
 let v=E.postPlanView(s,p.id);
 assert.equal(v.controlMode,'manual');
 if(v.status==='draft')v=command(s,'postPlan.confirmDeck',{sessionId:v.sessionId,expectedRevision:v.revision,cardIds:v.deck,directionPolicy:v.directionPolicy});
 while(v.status==='playing')v=command(s,'postPlan.choose',{sessionId:v.sessionId,expectedRevision:v.revision,turn:v.turn,cardId:v.hand.find(h=>h.affordable).id}).view;
 assert.equal(v.status,'ready');assert.equal(s.postPlanSessions.sessions[p.id].choices.length,6);
 return v;
}
function assertRealAllocation(s) {
 const al=E.allocJobs(s),ga=E.gpuAllocation(s);
 const total=ga.leaseGpus+ga.inferGpus+al.items.reduce((n,x)=>n+x.cards,0)+al.free*al.T;
 assert.ok(Math.abs(total-ga.total)<1e-6,`GPU conservation ${s.day}: ${total}/${ga.total}`);
 for(const i of al.items){
  assert.ok(Number.isFinite(i.cards)&&i.cards>=0);
  if(i.run)assert.ok(i.cards+1e-6>=i.minCards);
  else assert.equal(i.cards,0);
 }
 assert.ok(Number.isFinite(s.cash));
 for(const m of s.models)for(const value of Object.values(m.dims||{}))assert.ok(Number.isFinite(value));
}
function driveCardsOnly(s,tick,label,maxDays=240) {
 const completed=[],initialTechs=new Set(s.techs),initialModels=new Set(s.models.map(m=>m.id));
 let days=0;
 for(let i=0;i<maxDays&&s.status==='playing';i++){
  // The only simulated player commands are deck confirmation and six card choices.
  // No botStep, resolveAll, financing, GPU purchases, job starts or research commands.
  for(const p of Object.values(s.postPlanSessions.sessions))if(['draft','playing'].includes(p.status)&&s.postPlanSessions.byModel[p.modelId]===p.id){
   playerCompletesCards(s,p);completed.push({id:p.id,modelId:p.modelId,day:s.day,grant:p.grant});
  }
  const before=s.day;tick();
  assert.notEqual(s.day,before,`${label}: non-card event blocked normal time on ${before}`);days++;
  assertRealAllocation(s);
  assert.ok(Object.values(s.postPlanSessions.sessions).every(p=>p.controlMode==='manual'),'automation must not take card control');
  if(completed.length>=2&&days>=90)break;
 }
 if(completed.length<2)console.log('POST_ONLY_BLOCKER',JSON.stringify({label,day:s.day,completed,techs:s.techs,research:s.research,jobs:s.jobs,models:s.models.map(m=>({id:m.id,stage:m.stage,postDays:m.postDays})),auto:s.automation.recent,mode:s.flags.postOnly}));
 assert.ok(completed.length>=2,`${label}: only ${completed.length} sessions in ${days} days; status ${s.status}; ${JSON.stringify(s.flags.postOnly)}`);
 assert.ok(s.techs.some(id=>!initialTechs.has(id))||s.models.some(m=>!initialModels.has(m.id)),'second session follows actual research/unlock or a real new model');
 for(const p of Object.values(s.postPlanSessions.sessions))if(p.grant)assert.ok(p.grant.cardIds.length>0,'replans require a real unlock grant');
 assert.ok(s.models.some(m=>(m.postDays||0)>0),'completed card plans must actually train under real daily accounting');
 E.assertPostPlanSaveBoundary(s);
 console.log('POST_ONLY_FLOW',JSON.stringify({label,days,day:s.day,completed:completed.map(x=>({id:x.id,day:x.day,model:x.modelId,unlockGrant:!!x.grant})),cash:s.cash,models:s.models.length,techs:s.techs.length}));
 return completed;
}
test('post-only history: 90+ real days and multiple manual sessions without any player economic actions',()=>{
 restoreHistory();const s=E.createSinglePlayerGame('deepseek','y2025',47);
 E.enablePostOnly(s);driveCardsOnly(s,()=>E.tickDay(s),'history-deepseek-2025');
 const raw=JSON.stringify(s),loaded=E.migrateGame(JSON.parse(raw));assert.equal(loaded.ok,true,loaded.reason);assert.equal(JSON.stringify(loaded.s),raw,'current save is exact, not a migration');
});
test('post-only self-consistent world: economic events do not stop the solo world clock; manual cards repeat naturally',()=>{
 restoreHistory();const r=startSolo({...defaultSolo(false,'full'),count:2,years:1,year:'2025'},48);
 E.enablePostOnly(r.s);driveCardsOnly(r.s,()=>r.world.tick(),'solo-zero-2025');
 const raw=E.serialize(r.world),loaded=E.migrateWorld(E.deserialize(raw));assert.equal(loaded.ok,true,loaded.reason);assert.equal(E.serialize(loaded.world),raw);
});
test('post-only never spends a manual hand or advances a draft while the player is absent',()=>{
 restoreHistory();const s=E.createSinglePlayerGame('deepseek','y2025',49);E.enablePostOnly(s);E.postOnlyDay(s);
 const p=Object.values(s.postPlanSessions.sessions).find(p=>p.status==='draft');assert.ok(p,'post-only should present a draft without asking for a job-management action');
 for(let i=0;i<8;i++)E.tickDay(s);
 const same=s.postPlanSessions.sessions[p.id];assert.equal(same.status,'draft');assert.deepEqual(same.choices,[]);assert.equal(same.controlMode,'manual');assert.equal(same.drawTicket,null);
 let v=command(s,'postPlan.confirmDeck',{sessionId:p.id,expectedRevision:0,cardIds:E.postPlanView(s,p.id).deck,directionPolicy:p.directionPolicy});
 const before=JSON.stringify(s.postPlanSessions.sessions[p.id]);for(let i=0;i<8;i++)E.tickDay(s);
 assert.equal(JSON.stringify(s.postPlanSessions.sessions[p.id]),before,'economic autopilot must not choose, redraw or revise a live manual hand');
 assert.equal(E.postPlanView(s,v.sessionId).turn,1);
});
for(const [tier,seed] of [['small',50],['major',51]])test(`post-only zero start ${tier}: legitimate resource limits still allow repeated manual cards without economics`,()=>{
 restoreHistory();const r=startSolo({...defaultSolo(false,'full'),count:2,years:2,year:'2025',tier},seed);
 E.enablePostOnly(r.s);driveCardsOnly(r.s,()=>r.world.tick(),`solo-zero-2025-${tier}`,600);
});
