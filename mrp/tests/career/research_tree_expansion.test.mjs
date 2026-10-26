import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {TECHS,TECH_BY_ID,COMPANIES,SCENARIOS} from '../../src/career/data/core.js';
import {PREREQ} from '../../src/career/data/techsrc.js';
import {RESEARCH_PRACTICES,PRACTICE_DATASETS} from '../../src/career/data/research_practices.js';
import {historicalStartTechs} from '../../src/career/data/start_methods.js';
import {datasetAvailable,doAcquire} from '../../src/career/sim/data_ops.js';
import {dailyOrders,cancelGen,pauseGen,resumeGen} from '../../src/career/sim/orders.js';
import {researchTick,startResearch,stopResearch} from '../../src/career/sim/research.js';
import {modifier} from '../../src/career/sim/modifiers.js';
import {postPlanIdentity,POST_PLAN_RULES} from '../../src/career/sim/post_card_profiles.js';
import {CATALOG_CARDS,catalogueUnlocked} from '../../src/career/sim/post_catalog.js';
import {automationCandidate} from '../../src/career/sim/automation.js';
import {addDays} from '../../src/career/sim/clock.js';
import {restoreHistory} from '../helpers/world_provider.mjs';
afterEach(restoreHistory);
const company={llm:'qwen',image:'image2',music:'suno',speech:'elevenlabs'};
function fresh(mod='llm',sc='y2026'){restoreHistory();const s=E.createGame(company[mod],sc,73);s.queue=[];return s;}
const cfg=s=>({...postPlanIdentity(s),rulesVersion:POST_PLAN_RULES,techs:s.techs,strategy:{done:s.strategy.done}});
const cards=s=>CATALOG_CARDS.filter(c=>catalogueUnlocked(c.id,cfg(s))).map(c=>c.id);
const command=(s,name,args)=>E.applyCommand(s,{name,args});

test('56 complete nodes; 12 unique internal practices with real, distinct resource endpoints',()=>{
 assert.equal(TECHS.length,56);assert.equal(RESEARCH_PRACTICES.length,12);assert.equal(PRACTICE_DATASETS.length,12);assert.equal(new Set(TECHS.map(t=>t.id)).size,56);
 assert.deepEqual(Object.fromEntries(['llm','image','music','speech'].map(m=>[m,TECHS.filter(t=>t.mod===m).length])),{llm:27,image:11,music:9,speech:9});
 assert.equal(PRACTICE_DATASETS.filter(d=>d.gen==='synth').length,4);assert.equal(PRACTICE_DATASETS.filter(d=>d.kind==='post').length,4);assert.equal(PRACTICE_DATASETS.filter(d=>d.kind==='pre'&&!d.gen).length,4);
 for(const t of RESEARCH_PRACTICES){const ds=PRACTICE_DATASETS.find(d=>d.needTech===t.id);assert.deepEqual(t.effects,{unlock:[ds.id]});assert(ds.mod===t.mod);assert(PREREQ[t.id].every(id=>TECH_BY_ID[id].mod===t.mod));assert(E.researchOutcomes(t).datasets.some(d=>d.id===ds.id));}
});
test('all 96 history cells retain old ownership and never receive internal practice by calendar',()=>{
 for(const co of COMPANIES)for(const sc of SCENARIOS){const s=E.createGame(co.id,sc.id,1);assert.deepEqual(s.techs,historicalStartTechs(s));assert(s.techs.every(id=>!TECH_BY_ID[id].internalPractice));}
 for(const mod of Object.keys(company)){const s=fresh(mod),tree=E.researchTree(s);assert.equal(tree.filter(x=>x.t.internalPractice&&x.state==='ready').length,3);}
});
test('complete future tree is read-only, current-domain only, and never bypasses ahead/prerequisite checks',()=>{
 const s=fresh('llm','y2023'),before=JSON.stringify(s),tree=E.researchTree(s);assert.equal(tree.length,27);assert(tree.every(x=>x.t.mod===s.mod));const future=tree.find(x=>x.t.id==='repository_audit');assert.equal(future.state,'future');assert(future.prereqs.length===2);assert(future.datasets.length===1);assert(!E.researchOptions(s).some(x=>x.t.id===future.t.id));assert.equal(JSON.stringify(s),before);
 assert.equal(command(s,'researchTech',{id:future.t.id}).ok,false);assert.equal(JSON.stringify(s),before);
 s.date='2026-01';s.day='2026-01-01';assert.match(E.researchCheck(s,TECH_BY_ID.repository_audit).reason,/先掌握/);
});
test('research start/pause/restart/progress produces only owned method; original cards/caps unchanged',()=>{
 const s=fresh(),t=TECH_BY_ID.verifier_curriculum,beforeCards=cards(s),cash=s.cash,modKeys=['train','infer','stability','dataQuality','legal','cap.math','cap.code'],before=modKeys.map(k=>modifier(s,k));
 startResearch(s,t.id);assert(!s.techs.includes(t.id));assert.equal(datasetAvailable(s,PRACTICE_DATASETS.find(d=>d.needTech===t.id)).ok,false);
 researchTick(s,5);const done=s.research[0].done;stopResearch(s,t.id);startResearch(s,t.id);assert.equal(s.research[0].done,done);
 const snap=JSON.stringify(s);assert.throws(()=>startResearch(s,t.id),/正在研究/);assert.equal(JSON.stringify(s),snap);
 researchTick(s,10000);assert(s.techs.includes(t.id));assert.equal(s.cash,cash);assert.deepEqual(modKeys.map(k=>modifier(s,k)),before);assert.deepEqual(cards(s),beforeCards);assert.equal(CATALOG_CARDS.length,167);
});
for(const ds of PRACTICE_DATASETS){
 test(`${ds.id}: exact unlock, price, duplicate guard and normal delivery`,()=>{
  const s=fresh(ds.mod);assert.equal(datasetAvailable(s,ds).ok,false);assert.throws(()=>doAcquire(s,ds.id),/需要技术/);s.techs.push(ds.needTech);
  assert(datasetAvailable(s,ds).ok);if(ds.cost){const cash=s.cash;s.cash=ds.cost-1;const before=JSON.stringify(s);assert.throws(()=>doAcquire(s,ds.id),/现金不足/);assert.equal(JSON.stringify(s),before);s.cash=cash;}
  const poolBefore=E.poolStats(s).tokens,postBefore={...s.data.post},cash=s.cash;const result=doAcquire(s,ds.id);assert.equal(s.cash,cash-ds.cost);assert.equal(E.poolStats(s).tokens,poolBefore);assert.deepEqual(s.data.post,postBefore);const snap=JSON.stringify(s);assert.throws(()=>doAcquire(s,ds.id),/拥有|路上/);assert.equal(JSON.stringify(s),snap);
  if(ds.gen){const o=result.order;assert(o.gen.need>0&&o.gen.nMin>0);s.gpus.owned={};s.gpus.rented={};s.inferShare=0;const done=o.gen.done;dailyOrders(s,{notes:[]});assert.equal(o.gen.done,done);assert.equal(E.poolStats(s).tokens,poolBefore);pauseGen(s,o.id);dailyOrders(s,{notes:[]});assert.equal(o.gen.done,done);resumeGen(s,o.id);o.gen.done=o.gen.need;o.gen.cleanup=3;o.gen.elapsed=7;dailyOrders(s,{notes:[]});}
  else{s.day=s.orders.find(o=>o.ref===ds.id).eta;s.date=s.day.slice(0,7);dailyOrders(s,{notes:[]});}
  assert(!s.orders.some(o=>o.ref===ds.id));if(ds.kind==='pre')assert(Math.abs(E.poolStats(s).tokens-(poolBefore+ds.tokens))<1e-8);else for(const[k,v]of Object.entries(ds.posts))assert.equal(s.data.post[k],Math.min(2.5,(postBefore[k]||0)+v));
 });
}
test('four synthesis routes require a published model, discard/partial cancel correctly, cannot replay rewards',()=>{
 for(const ds of PRACTICE_DATASETS.filter(d=>d.gen)){const s=fresh(ds.mod);s.techs.push(ds.needTech);const live=s.live;s.live=null;assert.match(datasetAvailable(s,ds).reason,/发布/);s.live=live;
  const before=E.poolStats(s).tokens;const a=doAcquire(s,ds.id).order;assert.equal(cancelGen(s,a.id).kept,0);assert(datasetAvailable(s,ds).ok);assert.equal(E.poolStats(s).tokens,before);
  const b=doAcquire(s,ds.id).order;b.gen.done=b.gen.need*.6;b.gen.elapsed=9;const kept=cancelGen(s,b.id).kept;assert(kept>=.5&&kept<1);assert(Math.abs(E.poolStats(s).tokens-before-ds.tokens*kept)<1e-8);assert.equal(datasetAvailable(s,ds).ok,false);assert.throws(()=>cancelGen(s,b.id),/没有/);
 }
});
test('automatic proposals respect method locks, budget, generation opt-in and existing research setting',()=>{
 for(const ds of PRACTICE_DATASETS){const s=fresh(ds.mod);E.enableAutomation(s);const advice={op:{type:'act',action:'data',arg:{id:ds.id}}};assert.equal(automationCandidate(s,advice),null);s.techs.push(ds.needTech);s.cash=1e9;
  const c=automationCandidate(s,advice);assert.equal(!!c,!ds.gen);s.cash=100;assert.equal(automationCandidate(s,advice),null);
 }
 const s=fresh();E.enableAutomation(s);const c=automationCandidate(s,{op:{type:'tech',id:'repository_audit'}});assert.equal(c.command.name,'researchTech');const before=JSON.stringify(s);E.researchTree(s);assert.equal(JSON.stringify(s),before);
 E.configureAutomation(s,{module:'research',mode:'manual',preset:'balanced',expectedRev:0,requestId:'manual'});assert.equal(automationCandidate(s,{op:{type:'tech',id:'repository_audit'}}),null);
});
test('authoritative MP commands reject wrong modality / locked purchase, and successful research is deterministic',()=>{
 const make=()=>E.createWorld({mode:'fork',start:'2025-01',keep:1,seats:['qwen'],mp:true,seed:73,days:5});
 const run=()=>{const w=make(),s=w.companies.qwen.s;s.queue=[];const before=JSON.stringify(s);assert.equal(command(s,'researchTech',{id:'phoneme_curriculum'}).ok,false);assert.equal(command(s,'decide',{action:'data',id:'rp_repository'}).ok,false);assert.equal(JSON.stringify(s),before);assert(command(s,'researchTech',{id:'repository_audit'}).ok);const snap=JSON.stringify(s);assert.equal(command(s,'researchTech',{id:'repository_audit'}).ok,false);assert.equal(JSON.stringify(s),snap);return snap;};
 assert.equal(run(),run());
});
