import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {AUTOMATION_MODULES,defaultAutomationModes,validateAutomationModes} from '../../src/career/data/automation_controls.js';
import {restoreHistory} from '../helpers/world_provider.mjs';
globalThis.document??={baseURI:'http://localhost/'};
const {defaultPlaySetup,playSetupReady,playSetupAction,applyPlaySetup,renderPlaySetup}=await import('../../src/career/ui/panels/play_setup.js');
const {defaultSolo,startSolo,renderSolo}=await import('../../src/career/ui/pages/solo_setup.js');
const {click,change,render}=await import('../../src/career/ui/pages/automation.js');
const {setMp}=await import('../../src/career/ui/state.js');
const {setRemote}=await import('../../src/career/ui/act.js');
const keys=Object.keys(AUTOMATION_MODULES);
const fresh=()=>{restoreHistory();setMp(null);const s=E.createSinglePlayerGame('deepseek','y2025',47);E.enableAutomation(s);return s;};
afterEach(()=>{restoreHistory();setMp(null);setRemote(null);});
const command=(s,modules,mode='manual',extra={})=>E.applyCommand(s,{name:'configureAutomationBatch',args:{modules,mode,expectedRev:s.automation.rev,requestId:`test:${s.automation.rev}`,...extra}});
test('batch is atomic, preserves presets/jobs/cards, persists, and deduplicates reordered selections',()=>{
 const s=fresh();s.automation.modules.data.preset='save_cash';const untouched=JSON.stringify({jobs:s.jobs,cards:s.postPlanSessions,queue:s.queue});
 const args={modules:['research','data'],mode:'manual',expectedRev:0,requestId:'same'};
 assert.equal(E.applyCommand(s,{name:'configureAutomationBatch',args}).ok,true);assert.equal(s.automation.rev,1);
 assert.equal(s.automation.modules.data.mode,'manual');assert.equal(s.automation.modules.data.preset,'save_cash');assert.equal(s.automation.modules.evaluation.mode,'auto');
 const once=JSON.stringify(s);assert.equal(E.applyCommand(s,{name:'configureAutomationBatch',args:{...args,modules:['data','research']}}).ok,true);assert.equal(JSON.stringify(s),once);
 assert.equal(E.applyCommand(s,{name:'configureAutomationBatch',args:{...args,mode:'auto'}}).ok,false);assert.equal(JSON.stringify(s),once);
 assert.equal(JSON.stringify({jobs:s.jobs,cards:s.postPlanSessions,queue:s.queue}),untouched);
 const loaded=E.migrateGame(JSON.parse(JSON.stringify(s)));assert.equal(loaded.ok,true,loaded.reason);assert.deepEqual(loaded.s.automation,s.automation);
});
test('empty/duplicate/unknown/card/stale/bad mode and unknown command args reject without partial mutation',()=>{
 const s=fresh();for(const [modules,mode,extra] of [[[], 'auto',{}],[['data','data'],'auto',{}],[['data','financing'],'manual',{}],[['postTraining'],'auto',{}],[keys,'bad',{}],[keys,'manual',{expectedRev:10}],[keys,'manual',{companyId:'other'}]]){
  const before=JSON.stringify(s);assert.equal(command(s,modules,mode,extra).ok,false);assert.equal(JSON.stringify(s),before);
 }
 assert.equal(command(s,keys).ok,true);assert.ok(Object.values(s.automation.modules).every(m=>m.mode==='manual'));
 assert.equal(command(s,keys,'auto').ok,true);assert.ok(Object.values(s.automation.modules).every(m=>m.mode==='auto'));
});
test('startup requires choice; full keeps auto defaults and selected batch is draft-only, cancellable',()=>{
 const d=defaultPlaySetup(),s=fresh(),before=JSON.stringify(s);assert.equal(playSetupReady(d),false);assert.throws(()=>applyPlaySetup(s,d),/请先选择/);
 playSetupAction(d,'mode','full');assert.ok(Object.values(d.modes).every(m=>m==='auto'));
 playSetupAction(d,'all');playSetupAction(d,'clear');assert.ok(Object.values(d.modes).every(m=>m==='auto'));assert.equal(JSON.stringify(s),before);
 playSetupAction(d,'select','data');playSetupAction(d,'select','research');playSetupAction(d,'batch','manual');assert.deepEqual(d.selected,[]);assert.equal(JSON.stringify(s),before);
 applyPlaySetup(s,d);assert.equal(s.automation.modules.data.mode,'manual');assert.equal(s.automation.modules.evaluation.mode,'auto');assert.equal(s.automation.cardDefault,'manual');
 playSetupAction(d,'mode','post');assert.ok(Object.values(d.modes).every(m=>m==='auto'));assert.equal(playSetupAction(d,'batch','manual'),false);
 playSetupAction(d,'mode','full');assert.equal(d.modes.data,'manual');
 assert.match(renderPlaySetup(d),/重大公司决策仍需你确认/);assert.match(renderPlaySetup(d),/后训练卡牌：默认手动/);
});
test('solo zero and fork apply explicit startup modes and survive current save roundtrip',()=>{
 for(const mode of ['zero','fork']){restoreHistory();const d=defaultSolo(false);d.mode=mode;d.count=3;d.forkKeep=3;
  assert.match(renderSolo(d),/data-act="solo-start" disabled/);assert.throws(()=>startSolo(d,14),/请先选择/);
  playSetupAction(d.playSetup,'mode','full');playSetupAction(d.playSetup,'all');playSetupAction(d.playSetup,'batch','manual');
  const r=startSolo(d,14);assert.ok(Object.values(r.s.automation.modules).every(m=>m.mode==='manual'));assert.equal(r.s.automation.cardDefault,'manual');
  const text=E.serialize(r.world),load=E.migrateWorld(E.deserialize(text));assert.equal(load.ok,true,load.reason);assert.equal(E.serialize(load.world),text);
 }
});
test('UI selection/cancel is nonmutating; readOnly blocks batch; repeated MP clicks send once and wait for ACK',async()=>{
 const s=fresh(),st={},before=JSON.stringify(s),ctx={st,guard:f=>f(),draw(){}};
 change(s,{dataset:{autoSelect:'data'},checked:true},ctx);assert.deepEqual(st.autoSelected,['data']);assert.equal(JSON.stringify(s),before);
 const target=selector=>({closest:s=>s===selector?{dataset:{autoBatch:'manual'}}:null});
 click(s,target('[data-auto-clear]'),ctx);assert.deepEqual(st.autoSelected,[]);assert.equal(JSON.stringify(s),before);
 click(s,target('[data-auto-all]'),ctx);st.readOnly=true;click(s,target('[data-auto-batch]'),ctx);assert.equal(JSON.stringify(s),before);st.readOnly=false;
 setMp({pub:{settings:{automationVersion:6}}});let resolve,sends=0;setRemote({localOk:()=>false,send:()=>{sends++;return new Promise(r=>resolve=r);}});
 click(s,target('[data-auto-batch]'),ctx);click(s,target('[data-auto-batch]'),ctx);assert.equal(sends,1);assert.equal(st.autoPending,true);assert.equal(JSON.stringify(s),before);
 resolve(1);await new Promise(r=>setImmediate(r));assert.equal(st.autoPending,false);assert.deepEqual(st.autoSelected,[]);assert.match(render(s,st),/当前：自动/);
});
test('preset map rejects malformed maps rather than dropping unknown modules or filling fields',()=>{
 for(const v of [null,[],{}, {...defaultAutomationModes(),finance:'auto'}, {...defaultAutomationModes(),data:'AUTO'}])assert.throws(()=>validateAutomationModes(v));
 assert.deepEqual(validateAutomationModes(defaultAutomationModes()),defaultAutomationModes());
});
test('compact startup presets and per-module switches affect only the draft and preserve full-mode choices',()=>{
 const d=defaultPlaySetup(),s=fresh(),before=JSON.stringify(s);
 assert.equal(playSetupAction(d,'preset','manual'),false);
 playSetupAction(d,'mode','full');playSetupAction(d,'preset','manual');
 assert.ok(Object.values(d.modes).every(v=>v==='manual'));
 playSetupAction(d,'toggle','data');assert.equal(d.modes.data,'auto');assert.equal(d.modes.research,'manual');
 const mixed=structuredClone(d.modes);playSetupAction(d,'mode','post');
 assert.equal(playSetupAction(d,'toggle','research'),false);
 playSetupAction(d,'mode','full');assert.deepEqual(d.modes,mixed);
 const snapshot=JSON.stringify(d);
 assert.equal(playSetupAction(d,'toggle','unknown'),false);assert.equal(playSetupAction(d,'preset','bad'),false);
 assert.equal(JSON.stringify(d),snapshot);assert.equal(JSON.stringify(s),before);
 const html=renderPlaySetup(d,{compact:true});
 assert.match(html,/role="switch" aria-checked="true" aria-label="数据收集自动化"/);
 assert.match(html,/role="switch" aria-checked="false" aria-label="技术研究自动化"/);
 assert.equal((html.match(/role="switch"/g)||[]).length,6);
 assert.doesNotMatch(html,/data-setup-action="select"|data-setup-action="batch"/);
});
