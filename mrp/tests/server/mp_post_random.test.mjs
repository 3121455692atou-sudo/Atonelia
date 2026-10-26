import { SIMULATION_RULES_VERSION } from '../../server/simulation_rules.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import { startServer,stopServer,api,Client,waitFor,roomSettings,tmpDir } from '../helpers/mp_server.mjs';
import { readLog,replayEntry,listSnaps,readSnap,writeSnap,rebuild,appendLog } from '../../server/store.mjs';
import { MP_POST_TRAINING,validatePostTrainingSnapshot,validateWorldPostTraining } from '../../server/post_training.mjs';
import * as E from '../../src/career/engine.js';
const start=settings=>({t:'room',name:'start',args:{settings,postTraining:{...MP_POST_TRAINING},postTrainingSeed:123456789,endVersion:1,autoPostVersion:1,automationVersion:1,clockRulesVersion:1,initialMethodsVersion:1,simulationRulesVersion:SIMULATION_RULES_VERSION},state:{initialMethodsVersion:1,simulationRulesVersion:SIMULATION_RULES_VERSION,clock:{clockRulesVersion:1,hostSpeed:1}}});
test('server start derives random mode for every company; preserves M2/end flags and refuses old schema',()=>{
 const w=replayEntry(null,start(roomSettings({humans:1,bots:1,days:5})));validateWorldPostTraining(w);assert.equal(w.endVersion,1);assert.equal(w.autoPostVersion,1);assert.equal(w.settings.automationVersion,1);
 for(const c of Object.values(w.companies))if(c.s){assert.equal(c.s.postRandom.mode,'random');assert.equal(c.s.postRandom.version,1);assert.equal(c.s.postCards,undefined);if(c.kind==='human')assert(c.s.automation);}
 for(const rule of [undefined,{mode:'cards',version:1},{mode:'random',version:0},{mode:'random',version:2},{mode:'random',version:1,rate:1}]){const e=start(roomSettings({humans:1,bots:1,days:5}));e.args.postTraining=rule;const before=structuredClone(e);assert.throws(()=>replayEntry(null,e));assert.deepEqual(e,before);}
});
test('fork frozen companies are not missing-state errors; active NPC takeover preserves random receipt',()=>{
 const w=replayEntry(null,start({mode:'fork',start:2025,seed:11,days:20,keep:3,seats:['deepseek'],mp:true}));validatePostTrainingSnapshot(E.deserialize(E.serialize(w)));
 const c=Object.values(w.companies).find(c=>c.kind==='bot'&&c.s);const before=structuredClone(c.s.postRandom);E.takeover(w,c.id);assert.deepEqual(c.s.postRandom,before);validateWorldPostTraining(w);
});
test('bad snapshot mode/cards/seed/missing model ledger refuses without mutating raw',()=>{
 const w=replayEntry(null,start({mode:'fork',start:2025,seed:11,days:20,keep:3,seats:['deepseek'],mp:true})),raw=E.deserialize(E.serialize(w));
 for(const change of [x=>delete x.world.settings.postTraining,x=>x.settings.postTraining.version=99,x=>x.companies[0].s.postCards={version:1},x=>x.companies[0].s.postRandom.runSeed++,x=>delete x.companies[0].s.models[0].postExposureVersion,x=>x.companies.pop()]){const bad=structuredClone(raw);change(bad);const before=structuredClone(bad);assert.throws(()=>validatePostTrainingSnapshot(bad));assert.deepEqual(bad,before);}
});
test('new room HTTP/SSE has no cards/pending/seed; WAL replays exactly and restart keeps mode',async t=>{
 const data=tmpDir();let srv=await startServer({data,args:['--tick-ms','20','--max-rooms','1']}),c;t.after(async()=>{c?.close();await stopServer(srv);});
 const made=await api(srv.base,'/api/rooms',{method:'POST',body:{postTraining:{mode:'cards',version:0},settings:roomSettings({humans:1,bots:1,days:10})}});assert.equal(made.status,200,made.text);const room=made.json.room,dir=path.join(data,room);
 c=new Client(srv.base,room,made.cookie);await c.connect();assert.equal((await c.roomCmd('start')).status,200);await waitFor(()=>c.s?.postRandom,10000);assert.equal(c.s.postRandom.mode,'random');assert.equal(c.s.postRandom.runSeed,undefined);assert.equal(c.s.postCards,undefined);assert(!JSON.stringify(c.pub).includes('postTrainingSeed'));
 await waitFor(()=>c.events.some(e=>e.type==='day'),10000);c.close();await stopServer(srv);
 const logs=readLog(dir),st=logs.find(e=>e.t==='room'&&e.name==='start');assert.deepEqual(st.args.postTraining,MP_POST_TRAINING);assert.equal(st.args.automationVersion,6);assert.equal(st.args.clockRulesVersion,1);
 let w=null;for(const e of logs)w=replayEntry(w,e);validateWorldPostTraining(w);assert.equal(E.serialize(w),readSnap(dir,listSnaps(dir).at(-1)).text);
 srv=await startServer({data,args:['--tick-ms','1000','--max-rooms','1']});c=new Client(srv.base,room,made.cookie);await c.connect();await waitFor(()=>c.s?.postRandom,10000);assert.equal(c.s.postRandom.mode,'random');assert.equal(c.s.postRandom.runSeed,undefined);
});
test('invalid new schema restore does not repair half WAL or change snapshot bytes',()=>{
 const dir=tmpDir(),w=replayEntry(null,start(roomSettings({humans:1,bots:1,days:5})));delete w.settings.postTraining;
 const name=writeSnap(dir,w,0,{initialMethodsVersion:1,simulationRulesVersion:SIMULATION_RULES_VERSION,clock:{clockRulesVersion:1,hostSpeed:1}});fs.writeFileSync(path.join(dir,'log.ndjson'),'{"partial":');
 const snap=fs.readFileSync(path.join(dir,name)),log=fs.readFileSync(path.join(dir,'log.ndjson'));
 assert.throws(()=>rebuild(dir,{repair:false}));assert.deepEqual(fs.readFileSync(path.join(dir,name)),snap);assert.deepEqual(fs.readFileSync(path.join(dir,'log.ndjson')),log);
});
test('snapshot and WAL seed disagreement rejects before even default tail repair',()=>{
 const dir=tmpDir(),e=start(roomSettings({humans:1,bots:1,days:5})),w=replayEntry(null,e);const n=appendLog(dir,e,0);w.postTrainingSeed++;for(const c of Object.values(w.companies))if(c.s)c.s.postRandom.runSeed=w.postTrainingSeed;writeSnap(dir,w,n,e.state);
 fs.appendFileSync(path.join(dir,'log.ndjson'),'{"partial":');const before=fs.readFileSync(path.join(dir,'log.ndjson'));assert.throws(()=>rebuild(dir),/种子不一致/);assert.deepEqual(fs.readFileSync(path.join(dir,'log.ndjson')),before);
});
test('terminal disclosure allows replay audit but cannot resume or mutate settled game',async t=>{
 const data=tmpDir(),srv=await startServer({data,args:['--tick-ms','5','--max-rooms','1']});let c;t.after(async()=>{c?.close();await stopServer(srv);});
 const made=await api(srv.base,'/api/rooms',{method:'POST',body:{settings:roomSettings({humans:1,bots:1,days:3})}});assert.equal(made.status,200,made.text);c=new Client(srv.base,made.json.room,made.cookie);await c.connect();await c.roomCmd('start');await waitFor(()=>c.events.some(e=>e.type==='end'),10000);
 const terminal=c.events.find(e=>e.type==='end').data;assert(terminal.companies.some(x=>Number.isInteger(x?.s?.postRandom?.runSeed)),'terminal full disclosure is intentional');
 const status=()=>api(srv.base,`/api/r/${made.json.room}/status`),before=(await status()).json;
 assert.equal(before.ended,true);assert.equal((await c.cmd(9001,'startJob',{kind:'post',target:'main',dir:'writing'})).status,400);assert.equal((await c.roomCmd('resume')).status,400);assert.equal((await c.roomCmd('start')).status,400);
 await new Promise(r=>setTimeout(r,50));const after=(await status()).json;assert.equal(after.hash,before.hash);assert.equal(after.day,before.day);assert.equal(after.ended,true);
});
