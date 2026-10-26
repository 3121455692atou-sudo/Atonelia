import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { COMPANIES, SCENARIOS, TECHS, TECH_BY_ID, addMonths } from '../../src/career/data/core.js';
import { LEADER_START_METHODS, diffusedStartTechs, historicalStartTechs } from '../../src/career/data/start_methods.js';
import { HistoryProvider, setProvider } from '../../src/career/sim/provider.js';
import { SimProvider } from '../../src/career/world/sim_provider.js';
import { startTechs as zeroFilter } from '../../src/career/world/tech.js';
import { computeCaps, riskEnv, projectRisk, genMinCards } from '../../src/career/sim/model.js';
import { modifier } from '../../src/career/sim/modifiers.js';
import { researchCheck, startResearch, techStatus } from '../../src/career/sim/research.js';
import { CATALOG_CARDS, catalogueUnlocked } from '../../src/career/sim/post_catalog.js';
import { postPlanIdentity, POST_PLAN_RULES } from '../../src/career/sim/post_card_profiles.js';
import { restoreHistory } from '../helpers/world_provider.mjs';
afterEach(restoreHistory);
class BaselineProvider extends HistoryProvider { startTechs(s) { return diffusedStartTechs(s); } }
const simple=(id,scenario)=>{const c=COMPANIES.find(c=>c.id===id),sc=SCENARIOS.find(x=>x.id===scenario);return {charId:id,scenario,start:sc.start,mod:c.modality};};
const cfg=s=>({...postPlanIdentity(s),rulesVersion:POST_PLAN_RULES,techs:[...s.techs],strategy:{done:{...s.strategy.done}}});
const shared=s=>CATALOG_CARDS.filter(c=>c.id!=='basic'&&c.unlock.all.every(g=>g.type==='completedTech')&&catalogueUnlocked(c.id,cfg(s))).map(c=>c.id).sort();
const close=(a,b)=>assert(Math.abs(a-b)<1e-10,`${a} != ${b}`);
function pair(row){restoreHistory();setProvider(new BaselineProvider());const before=E.createGame(row.companyId,row.scenarioId,20261023);setProvider(new HistoryProvider());const after=E.createGame(row.companyId,row.scenarioId,20261023);return {before,after};}

test('only 3 of 96 exact company/scenario cells change; industry diffusion unchanged',()=>{
 let changed=0;
 for(const co of COMPANIES)for(const sc of SCENARIOS){const s=simple(co.id,sc.id),snapshot=JSON.stringify(s),original=TECHS.filter(t=>t.mod===s.mod&&!t.internalPractice&&(t.start||t.from<=addMonths(s.start,-3))).map(t=>t.id);
  assert.deepEqual(diffusedStartTechs(s),original);const row=LEADER_START_METHODS.find(x=>x.companyId===co.id&&x.scenarioId===sc.id);
  assert.deepEqual(historicalStartTechs(s),row?[...new Set([...original,...row.techIds])]:original);if(row)changed++;assert.equal(JSON.stringify(s),snapshot);
 }assert.equal(changed,3);assert.equal(LEADER_START_METHODS.flatMap(r=>r.techIds).length,4);
});
test('wrong dates/modalities/art IDs and sibling companies cannot inherit a row',()=>{
 const s=simple('deepseek','y2025');for(const alter of [{start:'2025-02'},{scenario:'y2024'},{charId:'deepseek_pro'},{charId:'deepseek_harness'},{charId:'qwen'},{charId:'fable'},{mod:'image'}]){const x={...s,...alter};assert.deepEqual(historicalStartTechs(x),diffusedStartTechs(x));}
 assert(Object.isFrozen(LEADER_START_METHODS));assert(Object.isFrozen(LEADER_START_METHODS[0].techIds));
});
for(const row of LEADER_START_METHODS){
 test(`${row.companyId}/${row.scenarioId}: methods before models; caps/cards/strategies exact`,()=>{
  const {before,after}=pair(row);assert.deepEqual(after.techs,[...new Set([...before.techs,...row.techIds])]);assert.deepEqual(after.strategy.done,before.strategy.done);assert(after.strategy.done[row.basisStrategyId]);
  for(const k of ['cash','team','know','gpus','products','live','working','smallLive','smallWorking'])assert.deepEqual(after[k],before[k],k);
  assert.equal(after.models.length,before.models.length);assert(after.models.length>0);
  for(let n=0;n<after.models.length;n++){const a=after.models[n],b=before.models[n];for(const k of ['dims','base','kcap','total','active','arch','cls','scaleId','structureSource','stage','role','name'])assert.deepEqual(a[k],b[k],`${a.id}/${k}`);assert.deepEqual(a.techs,after.techs);assert.deepEqual(a.capTechs,after.techs);assert.deepEqual(computeCaps(after,a),computeCaps(before,b),'initial caps cannot double gain');}
  for(const id of row.techIds){const snapshot=JSON.stringify(after);assert.deepEqual(researchCheck(after,TECH_BY_ID[id]),{ok:false,reason:'已经掌握'});assert.throws(()=>startResearch(after,id),/已经掌握/);assert.equal(JSON.stringify(after),snapshot);}
  const b=shared(before),a=shared(after),gained=a.filter(id=>!b.includes(id));const expected={deepseek:['ptc_deepseek_pro_precision_cleanup','ptc_glm_multi_token_check'],claude:['ptc_claude_code_permission_checkpoint','ptc_claude_tool_contract','ptc_lobehub_workflow_slots'],mistral:['ptc_gemini_expert_quorum','ptc_gemini_window_vote','ptc_ernie_expert_catalog','ptc_ernie_two_pass_index','ptc_mistral_expert_rotation','ptc_mistral_rotating_review','ptc_hunyuan_sparse_router']}[row.companyId].sort();assert.deepEqual(gained,expected);assert(b.every(id=>a.includes(id)));
  const exclusive=s=>CATALOG_CARDS.filter(c=>c.unlock.all.some(g=>g.type==='completedStrategy')&&catalogueUnlocked(c.id,cfg(s))).map(c=>c.id).sort();assert.deepEqual(exclusive(after),exclusive(before));assert.equal(after.postPlanSessions,undefined);
 });
 test(`${row.companyId}: previous-year company cannot inherit future methods`,()=>{const sc=`y${Number(row.scenarioId.slice(1))-1}`;restoreHistory();const s=E.createGame(row.companyId,sc,9);assert.deepEqual(s.techs,diffusedStartTechs(s));for(const id of row.techIds)assert(!s.techs.includes(id));});
}
test('DeepSeek real train/infer increase, FP8 risk and memory behavior retained',()=>{
 const {before,after}=pair(LEADER_START_METHODS[0]);close(modifier(after,'train')/modifier(before,'train'),1.458);close(modifier(after,'infer')/modifier(before,'infer'),1.15);
 assert.equal(techStatus(after,TECH_BY_ID.fp8).level,'secret');assert.equal(riskEnv(before).fp8,0);assert.equal(riskEnv(after).fp8,0.01);const st=after.models[0];assert(projectRisk(after,st)>=projectRisk(before,st));
 const ah=structuredClone(after),bh=structuredClone(before);ah.gpus={owned:{H100:100},rented:{}};bh.gpus={owned:{H100:100},rented:{}};assert(genMinCards(ah,1000)<genMinCards(bh,1000));ah.gpus={owned:{A100:100},rented:{}};bh.gpus={owned:{A100:100},rented:{}};assert.equal(genMinCards(ah,1000),genMinCards(bh,1000));
});
test('Claude scratch agent cap +3; declared demand is not applied by current engine',()=>{
 const {before,after}=pair(LEADER_START_METHODS[1]);const b={...before.models[0],capTechs:[],kcap:null,base:{...before.models[0].base,agent:10}};close(computeCaps(after,b).agent-computeCaps(before,b).agent,3);close(modifier(after,'train')/modifier(before,'train'),1);close(modifier(after,'infer')/modifier(before,'infer'),1);assert.deepEqual(TECH_BY_ID.mcp.effects.demand,{coding_plan:1.1,api:1.03});close(modifier(after,'codingDemand')/modifier(before,'codingDemand'),1);close(modifier(after,'apiDemand')/modifier(before,'apiDemand'),1);assert.deepEqual(E.previewService(after),E.previewService(before));
});
test('Mistral MoE opens scale_moe without direct numerical multiplier/cap',()=>{const {before,after}=pair(LEADER_START_METHODS[2]);assert.deepEqual(TECH_BY_ID.moe.effects,{unlock:['scale_moe']});close(modifier(after,'train')/modifier(before,'train'),1);close(modifier(after,'infer')/modifier(before,'infer'),1);});
test('fork inherits, zero never gets leader additions even when all methods are public',()=>{
 for(const row of LEADER_START_METHODS){const s=simple(row.companyId,row.scenarioId),world={mode:'zero',day:s.start+'-01',settings:{},tech:Object.fromEntries(TECHS.map(t=>[t.id,{level:'open',since:'2000-01-01'}])),techSrc:{},techHasSource:{}};const expected=zeroFilter(world,diffusedStartTechs(s),s.start);assert.deepEqual(new SimProvider(world).startTechs(s),expected);for(const id of row.techIds)assert(!expected.includes(id));assert(zeroFilter(world,historicalStartTechs(s),s.start).some(id=>row.techIds.includes(id)),'old super+filter would leak');world.mode='fork';assert.deepEqual(new SimProvider(world).startTechs(s),historicalStartTechs(s));world.settings.mp=true;assert.deepEqual(new SimProvider(world).startTechs(s),historicalStartTechs(s));world.mode='zero';assert.deepEqual(new SimProvider(world).startTechs(s),expected);}
});
test('minimal real MP fork inherits methods, not card state/commands',()=>{
 restoreHistory();const world=E.createWorld({mode:'fork',start:'2025-01',keep:1,seats:['deepseek'],mp:true,seed:7,days:1}),s=world.companies.deepseek.s;assert(s.techs.includes('fp8')&&s.techs.includes('mtp'));assert.equal(s.postCards,undefined);assert.equal(s.postPlanSessions,undefined);const snapshot=JSON.stringify(s),res=E.applyCommand(s,{name:'postPlan.enable',args:{}},{world,companyId:'deepseek'});assert.equal(res.ok,false);assert.match(res.err,/联机|单机/);assert.equal(JSON.stringify(s),snapshot);
});

test('minimal real zero world uses its own public methods and has no history/card inheritance',()=>{
 restoreHistory();const world=E.createWorld({start:'2025-01',seed:8,days:1,companies:[{name:'独立从零实验室',brand:'从零',country:'US',tier:'specialist',kind:'human',stance:'closed'}]});
 assert.equal(world.mode,'zero');const c=Object.values(world.companies).find(c=>c.s),s=c.s;
 assert.deepEqual(s.techs,zeroFilter(world,diffusedStartTechs(s),s.start));
 for(const id of ['fp8','mtp','mcp','moe'])assert(!s.techs.includes(id));
 assert.equal(s.postCards,undefined);assert.equal(s.postPlanSessions,undefined);
});
