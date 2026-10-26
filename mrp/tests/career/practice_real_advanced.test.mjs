// Real page renderers and their click/change handlers, driven with DOM doubles.
// This does not claim browser layout, touch, or visual verification. The data
// picker uses its real pick() + decideAct contract; no fake teaching commands.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {createPracticeGame,practiceStepComplete,PRACTICE_STEPS} from '../../src/career/sim/practice.js';
import {setState,setWorld,setMp} from '../../src/career/ui/state.js';
import {setRemote,decideAct} from '../../src/career/ui/act.js';
globalThis.document={baseURI:'http://practice.test/',addEventListener(){},getElementById(){return {append(){}};},createElement(){return {classList:{add(){}},remove(){}};}};
const tech=await import('../../src/career/ui/pages/tech.js');
const strategy=await import('../../src/career/ui/pages/strategy.js');
const data=await import('../../src/career/ui/panels/data.js');
const compute=await import('../../src/career/ui/pages/compute.js');
const train=await import('../../src/career/ui/pages/train.js');
const project=await import('../../src/career/ui/pages/project_form.js');
const release=await import('../../src/career/ui/panels/release.js');
const service=await import('../../src/career/ui/pages/service.js');
const capital=await import('../../src/career/ui/pages/capital.js');
const automation=await import('../../src/career/ui/pages/automation.js');
const ctx=st=>({st,draw(){},guard:fn=>fn()});
const target=(selectors,dataset={},extra={})=>{
 const keys=Array.isArray(selectors)?selectors:[selectors];
 const node={dataset,disabled:false,...extra,closest(selector){return keys.includes(selector)||selector.split(',').some(s=>keys.includes(s.trim()))?node:extra.parents?.[selector]||null;}};
 return node;
};
function enabled(html,attr){
 const tags=html.match(/<(?:button|input|select)\b[^>]*>/g)||[];
 const found=tags.find(tag=>tag.includes(attr));assert.ok(found,`renderer contains ${attr}`);assert.doesNotMatch(found,/\sdisabled(?:\s|>|=)/);return found;
}
function fresh(){E.setProvider();setWorld(null);setMp(null);setRemote(null);const p=createPracticeGame('advanced');setState(p.game);return p;}

for(const inference of Array.from({length:86},(_,i)=>String(i+5)).filter(v=>v!=='50'))test(`one prepared game completes all nine real UI purposes at inference ${inference}%, without prerequisite detours`,async()=>{
 const {game,baseline}=fresh(),formal=E.createGame('gpt','y2025',73),before=structuredClone(formal),provider=E.P();
 for(const step of PRACTICE_STEPS)assert.equal(practiceStepComplete(game,step.id,baseline),false,`${step.id} not pre-completed`);
 const verify=id=>{assert.equal(practiceStepComplete(game,id,baseline),true,id);assert.deepEqual(formal,before);assert.equal(E.P(),provider);};
 // Research: normal node selection opens the actual panel, then start.
 const researchId=E.researchOptions(game).find(x=>x.check.ok).t.id,rs={};
 enabled(tech.render(game,rs),`data-tech-pick="${researchId}"`);
 await tech.click(game,target('[data-tech-pick]',{techPick:researchId}),ctx(rs));
 assert.equal(rs.techSel,researchId);enabled(tech.render(game,rs),`data-tech="${researchId}"`);
 await tech.click(game,target('[data-tech]',{tech:researchId}),ctx(rs));
 assert.ok(game.research.some(r=>r.id===researchId));verify('research');
 // Strategy: ordinary tree node then start, with no initial strategy to cancel.
 assert.equal(game.strategy.cur,null);assert.deepEqual(game.strategy.shelved,{});
 const strategyId=E.strategyOptions(game).find(x=>x.state==='available'&&!x.node.auto).id,ss={};
 enabled(strategy.render(game,ss),`data-strategy-pick="${strategyId}"`);
 await strategy.click(game,target('[data-strategy-pick]',{strategyPick:strategyId}),ctx(ss));
 assert.equal(ss.strategySel,strategyId);enabled(strategy.render(game,ss),'data-strategy-op="start"');
 await strategy.click(game,target('[data-strategy-op]',{strategyOp:'start',id:strategyId}),ctx(ss));
 assert.equal(game.strategy.cur.id,strategyId);assert.deepEqual(game.strategy.shelved,{});verify('strategy');
 // Data lives in the real main-screen picker, not the inventory office page.
 const dataId=E.dataOptions(game).find(x=>x.ok&&!x.gen).id;
 enabled(data.render(game),`data-pick="${dataId}"`);
 const [action,arg]=data.pick(null,target('[data-pick]',{pick:dataId}));
 await decideAct(game,action,arg);assert.ok(game.orders.some(o=>o.kind==='data'&&o.ref===dataId));verify('data');
 // Slider and price use genuine change handlers; no tutorial command facade.
 enabled(compute.render(game,{}),'data-infer');
 await compute.change(game,target('[data-infer]',{infer:''},{value:inference}),ctx({}));
 assert.equal(game.inferShare,Number(inference)/100);verify('compute');
 // Open the normal pretrain form; its existing defaults prepare the valid job.
 const ts={opt:{}};enabled(train.render(game,ts),'data-new="pretrain"');
 await train.click(game,target('[data-new]',{new:'pretrain'}),ctx(ts));assert.equal(ts.newJob,'pretrain');
 const form=project.render(game,ts);enabled(form,'data-op="start-project"');
 assert.deepEqual({total:ts.proj.total,active:ts.proj.active,arch:ts.proj.arch,tokens:ts.proj.tokens},{total:70,active:70,arch:'dense',tokens:2});
 assert.equal(project.formCheck(game,{kind:'pretrain',line:'main',cfg:ts.proj,...project.optOf(ts,'pretrain','high')}).ok,true);
 await train.click(game,target('[data-op]',{op:'start-project'}),ctx(ts));
 assert.ok(game.jobs.list.some(j=>j.kind==='pretrain'));verify('project');
 // Open the real submit form, keep its ordinary default name/tier, submit.
 enabled(train.render(game,ts),`data-submit="${game.working}"`);
 await train.click(game,target('[data-submit]',{submit:game.working}),ctx(ts));assert.equal(ts.submit,game.working);
 const model=E.workingModel(game);enabled(release.form(game,model,'main',{choose:false}),'data-pick="flagship"');
 const box={dataset:{line:'main'},querySelector(sel){if(sel==='input[data-tier]:checked')return {value:E.defaultTier(game)};return null;},querySelectorAll(){return [];}};
 const submit=target('[data-submit-box] [data-pick]',{pick:'flagship',model:game.working},{parents:{'[data-submit-box]':box,'.release-opt':box}});
 const picked=release.pick(box,submit);assert.equal(picked[0],'submit');
 await train.click(game,submit,ctx(ts));assert.equal(ts.submit,null);assert.equal(game.evals.length,1);assert.equal(game.evals[0].modelId,game.working);verify('evaluation');
 enabled(service.render(game,{}),'data-tier="api"');
 await service.change(game,target('[data-tier]',{tier:'api',key:'tier'},{value:'standard'}),ctx({}));
 assert.equal(game.products.api.tier,'standard');verify('service');
 const offer=E.fundingOffers(game)[0];assert.ok(offer);enabled(capital.render(game,{}),`data-fund="${offer.dilution}"`);
 await capital.click(game,target('[data-fund]',{fund:String(offer.dilution)}),ctx({}));
 assert.equal(game.capital.round.dilution,offer.dilution);verify('finance');
 enabled(automation.render(game,{}),'data-auto-enable');
 await automation.click(game,target('[data-auto-enable]',{}),ctx({}));assert.ok(game.automation);verify('automation');
 assert.ok(PRACTICE_STEPS.every(step=>practiceStepComplete(game,step.id,baseline)));
 setState(null);
});

test('any different legal inference share or API tier completes its purpose through ordinary change, without a fixed answer',async()=>{
 for(const value of ['5','30','51','90']){
  const {game,baseline}=fresh();assert.equal(practiceStepComplete(game,'compute',baseline),false);
  await compute.change(game,target('[data-infer]',{infer:''},{value}),ctx({}));
  assert.equal(game.inferShare,Number(value)/100);assert.equal(practiceStepComplete(game,'compute',baseline),true);
 }
 for(const value of ['budget','standard']){
  const {game,baseline}=fresh();assert.notEqual(value,baseline.tier);
  await service.change(game,target('[data-tier]',{tier:'api',key:'tier'},{value}),ctx({}));
  assert.equal(game.products.api.tier,value);assert.equal(practiceStepComplete(game,'service',baseline),true);
 }
 setState(null);
});

test('advanced data guide names the actual compact home button and retains its original target',async()=>{
 const {practiceGuide}=await import('../../src/career/ui/practice_tutorial.js');
 const {renderHome}=await import('../../src/career/ui/home.js');
 const {game}=fresh(),before=JSON.stringify(game),app={};renderHome(app);
 const button=app.innerHTML.match(/<button[^>]*data-act="quick" data-id="data"[^>]*>[\s\S]*?<\/button>/)?.[0];
 assert.ok(button,'ordinary home exposes the original data quick command');
 const label=button.match(/<span>([^<]+)<\/span>/)?.[1];assert.equal(label,'数据');
 const dataButton={disabled:false,hidden:false,getAttribute(){return null;},getClientRects(){return [{}];}};
 const doc={querySelectorAll:selector=>selector==='[data-act="quick"][data-id="data"]'?[dataButton]:[]};
 const guide=practiceGuide(doc,game,'advanced',null,PRACTICE_STEPS.findIndex(step=>step.id==='data'));
 assert.equal(guide.element,dataButton);assert.equal(guide.text,`点「${label}」。`);assert.equal(JSON.stringify(game),before);
 setState(null);
});
