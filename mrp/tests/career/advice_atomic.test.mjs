import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {resolveAll} from '../helpers/career_bot.mjs';
import {setPlan,setPost,focusResearch,startJob} from '../../src/career/sim/jobs.js';
const fresh=()=>{const s=E.createGame('gpt','y2025',1);resolveAll(s);return s;};
function unchanged(s,fn){const before=JSON.stringify(s);assert.throws(fn);assert.equal(JSON.stringify(s),before);}
test('rejected advice never records nag or resets idle, including malformed nag id',()=>{
 for(const advice of [
  {id:'jobs:idle',nag:true,op:{type:'unsupported_probe'}},
  {id:'buy',nag:true,op:{type:'buy',gpu:'invalid_probe',n:1}},
  {id:{toString:'not a function'},nag:true,op:{type:'infer',value:.5}},
  {id:'__proto__',nag:true,op:{type:'infer',value:.5}},
 ]){const s=fresh();s.jobs.idle={since:s.day};unchanged(s,()=>E.applyAdvice(s,advice));}
});
test('refused existing and new post advice preserve pause flags, focus list and logs',()=>{
 for(const existing of [true,false]){const s=fresh();if(existing)startJob(s,{kind:'post',target:'main',dir:'code',until:'none'});focusResearch(s,true);unchanged(s,()=>E.applyAdvice(s,{nag:true,id:'post',op:{type:'job',op:'post',dir:'invalid_probe'}}));}
});
test('trial failure restores exact prior plan property and leaves all state unchanged',()=>{
 for(const kind of ['value','absent','undefined']){const s=fresh();if(kind==='value')setPlan(s,{total:3,active:3,tokens:1});if(kind==='absent')delete s.jobs.plan;if(kind==='undefined')s.jobs.plan=undefined;const before=Object.getOwnPropertyDescriptor(s.jobs,'plan');const ref=s.jobs.plan;
 unchanged(s,()=>E.applyAdvice(s,{nag:true,id:'trial',op:{type:'trial',plan:{total:7,active:7,arch:'dense',tokens:1},spec:{kind:'invalid_probe'}}}));assert.deepEqual(Object.getOwnPropertyDescriptor(s.jobs,'plan'),before);assert.equal(s.jobs.plan,ref);}
});
test('setPost rejects invalid until before changing direction or bench fields',()=>{
 const s=fresh(),j=startJob(s,{kind:'post',target:'main',dir:'code',until:'none'});unchanged(s,()=>setPost(s,j.id,{dir:'writing',until:'invalid_probe'}));
});
test('plan rejects non-finite normalized numbers and inherited architecture names without writes',()=>{
 for(const cfg of [{total:'1e999',active:'1e999',tokens:1},{total:Infinity,active:1,tokens:1},{total:1,active:Infinity,tokens:1},{total:NaN,active:1,tokens:1},...['constructor','__proto__','toString'].map(arch=>({total:1,active:1,tokens:1,arch}))]){const s=fresh();unchanged(s,()=>setPlan(s,cfg));}
});
test('legal plan normalization, page and successful nag/idle behavior remain',()=>{
 const s=fresh();setPlan(s,{total:'7',active:'14',arch:'dense',tokens:1});assert.deepEqual(s.jobs.plan,{total:7,active:7,arch:'dense',tokens:1});s.jobs.idle={since:s.day};assert.equal(E.applyAdvice(s,{nag:true,id:'jobs:idle',op:{type:'page'}}),null);assert.equal(s.jobs.nag['jobs:idle'],s.day);assert.deepEqual(s.jobs.idle,{since:null});
});
