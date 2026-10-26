import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../../src/career/sim/automation.js',import.meta.url),'utf8');
const start=source.indexOf('function plannerV1(s, context) {'),end=source.indexOf('// 以下仅在世界',start);assert(start>=0&&end>start);
const keys=['modulesFor','refreshPretrainHold','automationBudget','advise','P','evaluationDecision','companyStrategyCandidate','trialPreparationCandidate','pretrainingCandidate','automationCandidate','researchOptions','allocationCandidate','note','applyCommand','commitEvaluationReceipt','commitPretrainReceipt'];
const make=new Function(...keys,source.slice(start,end)+';return plannerV1;');
test('each module sees commands from earlier modules, but no-candidate allocation reuses its own pure advice',()=>{
 const rows=[],reads=[],s={charId:'x',day:'2025-01-01',cash:100,automation:{version:2,rev:0,cursor:0,modules:{data:{mode:'auto'},computeAllocation:{mode:'auto'}}}};
 const defs={modulesFor:()=>['data','computeAllocation'],refreshPretrainHold:()=>{},automationBudget:()=>({allowance:50}),advise:x=>{reads.push(x.cash);return [{op:{type:'data'}},{op:{type:'infer',value:.2},detail:`cash=${x.cash}`}];},P:()=>({queueBlocks:false}),evaluationDecision:()=>null,companyStrategyCandidate:()=>null,trialPreparationCandidate:()=>null,pretrainingCandidate:()=>null,automationCandidate:(x,a)=>a.op.type==='data'?{module:'data',command:{name:'data'},reason:'buy'}:null,researchOptions:()=>[],allocationCandidate:(x,a)=>({reason:a.detail}),note:(x,row)=>rows.push(row),applyCommand:()=>{s.cash-=10;return {ok:true};},commitEvaluationReceipt:()=>{},commitPretrainReceipt:()=>{}};
 const run=make(...keys.map(k=>defs[k]));run(s);
 assert.deepEqual(reads,[100,90],'do not cache across a real earlier-module command or redo same-module advice');
 assert.equal(rows.at(-1).reason,'cash=90');assert.equal(rows.at(-1).kind,'waiting');
 s.day='2025-01-02';run(s);assert.deepEqual(reads,[100,90,90,80],'no cache survives a later planner invocation');
});
