import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../../src/career/sim/automation.js',import.meta.url),'utf8');
const start=source.indexOf('function plannerV1(s, context) {'),end=source.indexOf('// 以下仅在世界',start);
const keys=['modulesFor','refreshPretrainHold','automationBudget','advise','P','evaluationDecision','companyStrategyCandidate','trialPreparationCandidate','pretrainingCandidate','automationCandidate','researchOptions','allocationCandidate','note','applyCommand','commitEvaluationReceipt','commitPretrainReceipt'];
const make=new Function(...keys,source.slice(start,end)+';return plannerV1;');
function fixture(modules,overrides={}){
 const reads=[],provider={queueBlocks:false},s={charId:'x',day:'2025-01-01',cash:100,automation:{version:6,rev:0,cursor:0,recent:[],modules:Object.fromEntries(modules.map(k=>[k,{mode:'auto'}]))}};
 const defs={modulesFor:()=>modules,refreshPretrainHold:x=>{x.hold=7;},automationBudget:()=>({allowance:50}),advise:x=>{reads.push({cash:x.cash,hold:x.hold,receipt:x.receipt,rev:x.automation.rev});return [{op:{type:'infer',value:.2},detail:`cash=${x.cash}`}];},P:()=>provider,evaluationDecision:()=>({candidate:null}),companyStrategyCandidate:()=>({candidate:null}),trialPreparationCandidate:()=>({candidate:null}),pretrainingCandidate:()=>({candidate:null}),automationCandidate:()=>null,researchOptions:()=>[],allocationCandidate:(x,a)=>({reason:a.detail}),note:(x,row)=>x.automation.recent.push(row),applyCommand:()=>({ok:true}),commitEvaluationReceipt:()=>{},commitPretrainReceipt:()=>{},...overrides};
 return {s,reads,provider,defs,run:context=>make(...keys.map(k=>defs[k]))(s,context)};
}
test('five waiting modules share advice, hold refresh precedes first read, and next invocation cannot reuse it',()=>{
 const f=fixture(['pretraining','evaluation','research','data','computeAllocation']);f.run();assert.equal(f.reads.length,1);assert.equal(f.reads[0].hold,7);assert.equal(f.s.automation.recent.length,5);f.s.cash=80;f.s.day='2025-01-02';f.run();assert.equal(f.reads.length,2);assert.equal(f.reads[1].cash,80);
});
for(const ok of [true,false])test(`real command boundary invalidates even ok=${ok}, following modules see mutation`,()=>{
 const f=fixture(['research','data','computeAllocation']);f.defs.automationCandidate=(s,a)=>({module:'data',command:{name:'buy'},reason:'buy'});f.defs.applyCommand=()=>{f.s.cash=70;return {ok,err:'blocked'};};f.run();assert.deepEqual(f.reads.map(x=>x.cash),[100,70]);
});
for(const module of ['evaluation','pretraining'])test(`${module} receipts/hold after command visible to next module`,()=>{
 const f=fixture([module,'research','computeAllocation']);const decision=()=>({candidate:{module,command:{name:'start'},reason:'start'}});f.defs[module==='evaluation'?'evaluationDecision':'trialPreparationCandidate']=decision;f.defs[module==='evaluation'?'commitEvaluationReceipt':'commitPretrainReceipt']=s=>{s.receipt=1;s.hold=20;};f.run({execute:()=>({ok:true})});assert.equal(f.reads.length,2);assert.equal(f.reads[1].receipt,1);assert.equal(f.reads[1].hold,20);
});
test('provider replacement and revision boundary never reuse previous proposals',()=>{
 const f=fixture(['research','data','computeAllocation']);let p=f.provider;f.defs.P=()=>p;f.defs.note=(s,row)=>{s.automation.recent.push(row);if(row.module==='research')p={queueBlocks:true};else s.automation.rev++;};f.run();assert.equal(f.reads.length,3);
});

test('real advisor and all planner candidate probes are pure; waiting journal does not enter advice',async()=>{
 const E=await import('../../src/career/engine.js'),{resolveAll}=await import('../helpers/career_bot.mjs');
 const {automationCandidate}=await import('../../src/career/sim/automation.js');
 const {companyStrategyCandidate}=await import('../../src/career/sim/automation_strategy.js');
 const {pretrainingCandidate}=await import('../../src/career/sim/automation_pretrain.js');
 const {trialPreparationCandidate}=await import('../../src/career/sim/automation_trial.js');
 const {evaluationDecision}=await import('../../src/career/sim/automation_evaluation.js');
 try{for(const [id,sc] of [['deepseek','y2025'],['image2','y2023'],['suno','y2025']]){
   E.setProvider();const s=E.createGame(id,sc,13);resolveAll(s);E.enableAutomation(s);
   const before=JSON.stringify(s),advice=E.advise(s);assert.equal(JSON.stringify(s),before,`${id}: advise pure`);
   companyStrategyCandidate(s,100);pretrainingCandidate(s,advice.find(x=>x.op?.type==='project'));trialPreparationCandidate(s,advice.find(x=>x.op?.type==='trial'));evaluationDecision(s,advice);advice.forEach(a=>automationCandidate(s,a));assert.equal(JSON.stringify(s),before,`${id}: all probes pure`);
   s.automation.recent.push({day:s.day,module:'research',kind:'waiting',reason:'test waiting journal',cost:0});assert.equal(JSON.stringify(E.advise(s)),JSON.stringify(advice),`${id}: journal irrelevant`);
 }}finally{E.setProvider();}
});
