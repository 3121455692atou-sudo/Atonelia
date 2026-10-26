// 当前 schema 只验证、不升级；每种旧版本和缺失当前结构都明确拒绝。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {COMPANIES,SCENARIOS} from '../../src/career/data/core.js';
const clone=x=>JSON.parse(JSON.stringify(x));
const fresh=()=>{E.setProvider();return E.createGame('deepseek','y2025',1);};
test('96公司×年份的新开局当前v5存档精确往返，不写迁移标记',()=>{
 for(const co of COMPANIES)for(const sc of SCENARIOS){E.setProvider();const s=E.createGame(co.id,sc.id,7),before=JSON.stringify(s),r=E.migrateGame(s);assert.equal(s.v,5);assert.equal(Object.hasOwn(s,'mig'),false);assert.equal(r.ok,true,`${co.id}/${sc.id}: ${r.reason}`);assert.equal(JSON.stringify(r.s),before);assert.equal(JSON.stringify(s),before);}
});
for(const v of [undefined,null,0,2,3,4,6,'5',true,NaN,Infinity])test(`不兼容版本 ${String(v)}，输入和Provider原样保留`,()=>{
 const s=fresh();if(v===undefined)delete s.v;else s.v=v;const before=structuredClone(s),provider=E.P();const r=E.migrateGame(s);assert.equal(r.ok,false);assert.match(r.reason,/请新开一局/);assert.deepEqual(s,before);assert.equal(E.P(),provider);assert.equal(r.s,undefined);
});
for(const field of ['jobs','route','sota','strategy','expect','ms','data','scheduled','evals'])test(`缺当前必需字段 ${field} 不补造`,()=>{
 const s=clone(fresh());delete s[field];const before=JSON.stringify(s),r=E.migrateGame(s);assert.equal(r.ok,false);assert.match(r.reason,/结构|旧|新开/);assert.equal(JSON.stringify(s),before);
});
test('当前版本也拒绝遗留迁移标记/旧结构字段，不能改版本号混过校验',()=>{
 for(const field of ['mig','project','focus','timers','teacherCap']){const s=clone(fresh());if(field==='teacherCap')s.data.teacherCap={knowledge:40};else s[field]={};const before=JSON.stringify(s),r=E.migrateGame(s);assert.equal(r.ok,false,field);assert.equal(JSON.stringify(s),before);}
});
test('坏数值和未知事件不归零、不丢弃，整份拒绝且不抛错',()=>{
 for(const corrupt of [s=>s.cash=NaN,s=>s.models[0].dims.knowledge=Infinity,s=>s.queue.push({kind:'nope'}),s=>s.scheduled.push({world:'no_such_world'})]){const s=clone(fresh());corrupt(s);const before=structuredClone(s);let r;assert.doesNotThrow(()=>r=E.migrateGame(s));assert.equal(r.ok,false);assert.deepEqual(s,before);}
});

test('当前schema核心嵌套结构损坏不得冒充可继续存档',()=>{
 const removals=[s=>delete s.service,s=>delete s.products,s=>delete s.market,s=>delete s.gpus,s=>delete s.legal,s=>delete s.deploy,s=>delete s.status,s=>delete s.data.pool,s=>delete s.data.acquired,s=>delete s.strategy.done,s=>delete s.strategy.rights,s=>delete s.models[0].dims,s=>delete s.computeLedger];
 for(const remove of removals){const s=clone(fresh());remove(s);const before=JSON.stringify(s),r=E.migrateGame(s);assert.equal(r.ok,false,String(remove));assert.equal(JSON.stringify(s),before);}
});

test('已发布模型必须有当前发布线；缺失或非法线拒绝且不写输入，未发布模型不强填线',()=>{
 for(const line of [undefined,null,'flagship','unknown',0]){
  const s=fresh(),m=s.models.find(m=>m.stage==='released');assert.ok(m);
  if(line===undefined)delete m.line;else m.line=line;
  const before=structuredClone(s),provider=E.P(),r=E.migrateGame(s);
  assert.equal(r.ok,false);assert.match(r.reason,/结构|请新开一局/);assert.deepEqual(s,before);assert.equal(E.P(),provider);
 }
 const s=fresh(),working=s.models.find(m=>m.stage!=='released');assert.ok(working);assert.equal(working.line,undefined);
 const r=E.migrateGame(s);assert.equal(r.ok,true,r.reason);assert.deepEqual(r.s,s);
});
