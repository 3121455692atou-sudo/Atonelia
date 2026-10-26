import test from'node:test';import assert from'node:assert/strict';import * as E from'../../src/career/engine.js';import{resolveAll}from'../helpers/career_bot.mjs';import{persistentInputError}from'../../src/career/sim/util.js';import{startJob,setPost,setJobPrio,minCards}from'../../src/career/sim/jobs.js';
const fresh=()=>{const s=E.createGame('gpt','y2025',1);resolveAll(s);return s;};const cfg=()=>({total:1,active:1,arch:'dense',tokens:.01});function unchanged(s,fn){const b=structuredClone(s);fn();assert.deepEqual(structuredClone(s),b);}
test('persistent input walk rejects nested nonfinite/cycles/accessors/exotics without evaluation; shared/undefined preserved',()=>{
 for(const n of [Infinity,-Infinity,NaN])assert.ok(persistentInputError({x:[{y:n}]}));const cycle={};cycle.self=cycle;assert.ok(persistentInputError(cycle));let calls=0;const getter={get x(){calls++;return 1;}};assert.ok(persistentInputError(getter));assert.equal(calls,0);assert.ok(persistentInputError({x:new Date()}));assert.ok(persistentInputError({x:()=>0}));const shared={x:1};assert.equal(persistentInputError({a:shared,b:shared,optional:undefined}),null);const deep={};let p=deep;for(let i=0;i<260;i++)p=p.x={};assert.ok(persistentInputError(deep));const throwing=new Proxy({}, {ownKeys(){throw Error('proxy probe');}});assert.equal(persistentInputError(throwing),'参数无法检查');
});
test('command validation rejects raw JSON exponent overflow before handler for all nesting positions',()=>{
 const s=fresh();for(const raw of ['{"spec":{"kind":"pretrain","cfg":{"total":1,"active":1,"arch":"dense","tokens":0.01,"extra":1e999}}}','{"spec":{"kind":"pretrain","prio":{"x":1e999},"cfg":{"total":1,"active":1,"arch":"dense","tokens":0.01}}}'])unchanged(s,()=>{const r=E.applyCommand(s,{name:'startJob',args:JSON.parse(raw)});assert.equal(r.ok,false);assert.match(r.err,/非有限/);});
 let getterCalls=0;const spec={kind:'pretrain',get cfg(){getterCalls++;return cfg();}};unchanged(s,()=>assert.equal(E.applyCommand(s,{name:'startJob',args:{spec}}).ok,false));assert.equal(getterCalls,0);
});
test('direct persistent job APIs reject nonfinite, bad prio/architecture and below-min cap before writes',()=>{
 for(const spec of [{kind:'pretrain',cfg:{...cfg(),extra:Infinity}},...['constructor','__proto__',{}].map(prio=>({kind:'pretrain',prio,cfg:cfg()})),...['constructor','__proto__'].map(arch=>({kind:'pretrain',cfg:{...cfg(),arch}})),{kind:'pretrain',cfg:cfg(),cap:-1}]){const s=fresh();unchanged(s,()=>assert.throws(()=>startJob(s,spec)));}
 const s=fresh(),j=startJob(s,{kind:'post',target:'main',dir:'code'});for(const prio of ['constructor','__proto__',{}])unchanged(s,()=>assert.throws(()=>setJobPrio(s,j.id,prio)));for(const until of [{days:2,extra:Infinity},{days:2,to:Infinity},{dim:'constructor',to:1},{dim:'',to:1}])unchanged(s,()=>assert.throws(()=>setPost(s,j.id,{until})));
});
test('legal fractional days, finite extra/mixed fields, optional undefined, cap and priorities retain values',()=>{
 const s=fresh(),j=startJob(s,{kind:'post',target:'main',dir:'code',prio:'normal',cap:2048});const until={days:2.5,dim:'math',to:1,extra:'1e999'};setPost(s,j.id,{until});assert.deepEqual(j.until,until);setJobPrio(s,j.id,'high');assert.equal(j.prio,'high');assert.ok(j.cap>=minCards(s,j));setPost(s,j.id,{until:{dim:'math',to:80}});assert.deepEqual(j.until,{dim:'math',to:80});const r=E.applyCommand(s,{name:'setPost',args:{id:j.id,until:{days:3.5,extra:1},dir:undefined}});assert.equal(r.ok,true,r.err);assert.deepEqual(j.until,{days:3.5,extra:1});
});

test('direct advice and decide job routes reject overflow before any live-state write',()=>{
 for(const route of ['advice','decide']){const s=fresh(),spec={kind:'pretrain',cfg:{...cfg(),extra:Infinity}};unchanged(s,()=>assert.throws(()=>route==='advice'?E.applyAdvice(s,{nag:true,id:'project',op:{type:'project',cfg:spec.cfg}}):E.decide(s,'job',{op:'start',spec})));}
});

test('nonenumerable array values and serialization hooks cannot bypass persistent input checks',()=>{
 const array=[];Object.defineProperty(array,'0',{value:Infinity,enumerable:false});assert.ok(persistentInputError({array}));let calls=0;for(const desc of [{value:()=>{calls++;return null;}},{get(){calls++;return()=>null;}}]){const object={};Object.defineProperty(object,'toJSON',desc);assert.ok(persistentInputError(object));assert.equal(calls,0);}
 const spec={kind:'pretrain'};Object.defineProperty(spec,'cfg',{get(){calls++;return cfg();},enumerable:false});const s=fresh();unchanged(s,()=>assert.throws(()=>startJob(s,spec)));assert.equal(calls,0);
});

test('numeric diagnostics retain precise unambiguous paths and exact job-domain messages',()=>{
 assert.equal(persistentInputError({'cfg.tokens':Infinity}),'参数 $["cfg.tokens"]：不能包含非有限数');assert.equal(persistentInputError({cfg:{tokens:Infinity}}),'参数 $["cfg"]["tokens"]：不能包含非有限数');assert.equal(persistentInputError({array:[1,Infinity]}),'参数 $["array"][1]：不能包含非有限数');
 for(const key of ['tokens','total','active']){const s=fresh();unchanged(s,()=>assert.throws(()=>startJob(s,{kind:'pretrain',cfg:{...cfg(),[key]:NaN}}),e=>e.message.includes(`$["cfg"]["${key}"]`)&&(key==='tokens'?e.message.includes('token'):e.message.includes('0.5B'))));}
 const s=fresh();unchanged(s,()=>assert.throws(()=>startJob(s,{kind:'pretrain',cfg:cfg(),'cfg.tokens':Infinity}),e=>e.message==='参数 $["cfg.tokens"]：不能包含非有限数'));
});
