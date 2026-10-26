import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {resolveAll} from '../helpers/career_bot.mjs';
globalThis.document ??= {baseURI:'http://localhost/'};
const {jobView}=await import('../../src/career/ui/pages/train.js');
function fixture(modelDays,jobDays,{bench=false,until='none'}={}) {
 E.setProvider();const s=E.createGame('mistral','y2024',7);resolveAll(s);const m=E.workingModel(s);
 const j=E.startJob(s,{kind:'post',target:'main',dir:'auto',until,...bench?{bench:'arena'}:{}});
 m.postDays=modelDays;j.days=jobDays;const al=E.allocJobs(s),it=al.items.find(x=>x.job===j);assert(it.run);
 return {s,m,j,al,it};
}
function view(x){const before=JSON.stringify(x.s),allocation=JSON.stringify(x.al),eta=E.jobEta(x.s,x.j,x.it);const v=jobView(x.s,x.al,x.it);assert.equal(JSON.stringify(x.s),before);assert.equal(JSON.stringify(x.al),allocation);assert.equal(E.jobEta(x.s,x.j,x.it),eta);return v;}
test('same model/job age keeps existing text; a new job distinguishes prior model training',()=>{
 const same=view(fixture(5,5));assert.match(same.state,/^第 5 天/);assert.equal(same.short,'第 5 天');
 const prior=view(fixture(20,0));assert.match(prior.state,/本模型后训 20 天（本作业累计 0 天）/);assert.match(prior.short,/本模型后训 20 天/);
});
test('generation-spanning job displays model5/job97 without resetting training state or accumulated stop ETA',()=>{
 const x=fixture(5,97,{until:{days:100}}),v=view(x);
 assert.match(v.state,/本模型后训 5 天（本作业累计 97 天），还剩 3 天/);assert.equal(v.short,'本模型后训 5 天（本作业累计 97 天），还剩 3 天');assert.doesNotMatch(v.state,/第 97 天/);
 assert.equal(x.m.postDays,5);assert.equal(x.j.days,97);assert.equal(E.jobEta(x.s,x.j,x.it),3);
});
test('bench retains job age/ETA and never presents ordinary-model training age as bench days',()=>{
 const v=view(fixture(5,97,{bench:true,until:{days:100}}));assert.match(v.state,/^第 97 天，还剩 3 天/);assert.equal(v.short,'第 97 天，还剩 3 天');assert.doesNotMatch(v.state,/本模型后训/);
});
test('paused post job retains existing paused description with no day-account changes',()=>{
 const x=fixture(5,97);x.j.paused=true;x.al=E.allocJobs(x.s);x.it=x.al.items.find(i=>i.job===x.j);const v=view(x);assert.equal(v.short,'暂停中');assert.equal(x.m.postDays,5);assert.equal(x.j.days,97);
});
