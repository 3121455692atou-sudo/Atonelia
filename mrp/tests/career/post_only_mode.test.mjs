import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {restoreHistory} from '../helpers/world_provider.mjs';
const command=(s,name,args,ctx)=>E.applyCommand(s,{name,args},ctx);
test('explicit mode switching persists, restores prior module choices, and stops event consumption without rewinding cards/jobs',()=>{
 restoreHistory();const s=E.createSinglePlayerGame('deepseek','y2025',71);E.enableAutomation(s);
 E.configureAutomationBatch(s,{modules:['data','research'],mode:'manual',expectedRev:0,requestId:'manual'});
 assert.ok(command(s,'setPlayMode',{mode:'post'}).ok);assert.equal(E.isPostOnly(s),true);
 assert.ok(Object.values(s.automation.modules).every(m=>m.mode==='auto'));
 const protectedState=JSON.stringify(s);assert.equal(command(s,'configureAutomationBatch',{modules:['data'],mode:'manual',expectedRev:s.automation.rev,requestId:'blocked'}).ok,false);assert.equal(JSON.stringify(s),protectedState);
 E.postOnlyDay(s);const cards=JSON.stringify(s.postPlanSessions),jobs=JSON.stringify(s.jobs),cash=s.cash;
 const loaded=E.migrateGame(JSON.parse(JSON.stringify(s)));assert.equal(loaded.ok,true,loaded.reason);assert.deepEqual(loaded.s.flags.postOnly,s.flags.postOnly);
 assert.ok(command(s,'setPlayMode',{mode:'full'}).ok);assert.equal(E.isPostOnly(s),false);assert.equal(s.automation.modules.data.mode,'manual');assert.equal(s.automation.modules.research.mode,'manual');
 assert.equal(JSON.stringify(s.postPlanSessions),cards);assert.equal(JSON.stringify(s.jobs),jobs);assert.equal(s.cash,cash);
 const untouched=JSON.stringify(s);E.postOnlyEvents(s);E.postOnlyDay(s);assert.equal(JSON.stringify(s),untouched);
 assert.ok(command(s,'setPlayMode',{mode:'full'}).ok);assert.equal(JSON.stringify(s),untouched);
 assert.ok(command(s,'setPlayMode',{mode:'post'}).ok);E.postOnlyDay(s);assert.equal(JSON.stringify(s.postPlanSessions),cards,'reenabling cannot mint a new session');
});
test('mode rejects multiplayer and damaged/unknown persisted policy without migration',()=>{
 restoreHistory();const s=E.createSinglePlayerGame('deepseek','y2025',72),before=JSON.stringify(s);
 assert.equal(command(s,'setPlayMode',{mode:'post'},{multiplayer:true}).ok,false);assert.equal(JSON.stringify(s),before);
 E.enablePostOnly(s);
 for(const mutate of [x=>x.flags.postOnly.version=0,x=>delete x.flags.postOnly.previousModes,x=>x.flags.postOnly.extra=true,x=>x.flags.postOnly.lastDay='2099-01-01',x=>x.flags.postOnly.lastDay='2024-02-30',x=>x.flags.postOnly.lastDay='2024-13-01',x=>x.flags.postOnly.lastDay='2024-00-00']){
  const bad=structuredClone(s);mutate(bad);const raw=JSON.stringify(bad);assert.equal(E.migrateGame(bad).ok,false);assert.equal(JSON.stringify(bad),raw);
 }
});
test('manual plan receives no extra rewards or replan when economic driver is called repeatedly the same day',()=>{
 restoreHistory();const s=E.createSinglePlayerGame('deepseek','y2025',73);E.enablePostOnly(s);E.postOnlyDay(s);
 const once=JSON.stringify(s);for(let i=0;i<10;i++)E.postOnlyDay(s);assert.equal(JSON.stringify(s),once);
});
