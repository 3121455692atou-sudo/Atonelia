import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { startServer, stopServer, api, Client, waitFor, roomSettings, tmpDir } from '../helpers/mp_server.mjs';
import { currentStart } from '../helpers/mp_current_start.mjs';
import { appendLog, readLog, replayEntry, writeSnap, readSnap, listSnaps, rebuild } from '../../server/store.mjs';
import { SIMULATION_RULES_VERSION, validateSimulationRulesStart, rejectSimulationRulesInput } from '../../server/simulation_rules.mjs';
import { P, setProvider, HistoryProvider } from '../../src/career/sim/provider.js';
import * as E from '../../src/career/engine.js';

const runtime = () => ({initialMethodsVersion:1,simulationRulesVersion:SIMULATION_RULES_VERSION,clock:{clockRulesVersion:1,hostSpeed:0}});
const start = (settings=roomSettings({humans:1,bots:1,days:10})) => currentStart({settings,automationVersion:6,endVersion:1,autoPostVersion:1,postTraining:{mode:'random',version:1},postTrainingSeed:2389463});
const bytes = dir => Object.fromEntries(fs.readdirSync(dir).sort().map(f=>[f,fs.readFileSync(path.join(dir,f)).toString('base64')]));
const setVersion = (obj,value) => {if(value===undefined)delete obj.simulationRulesVersion;else obj.simulationRulesVersion=value;};
const ok = r => {assert.equal(r.status,200,r.text);assert.equal(r.json?.ok,true,r.text);return r.json;};
const invalid=[undefined,null,0,1,3,'2',true];

// This suite never opens / edits the old run003 archive. All files are disposable.
test('simulation rules are independent; direct start preflights even with an existing world or missing settings',()=>{
 assert.equal(SIMULATION_RULES_VERSION,2);
 const w=replayEntry(null,start());
 for(const v of invalid)for(const target of ['args','nested','runtime'])for(const world of [null,w]) {
  const e=start();setVersion(target==='args'?e.args:target==='nested'?e.args.settings:e.state,v);
  if(target==='nested'&&v===undefined)e.args.settings.simulationRulesVersion=null;
  const before=structuredClone(e),worldBefore=E.serialize(w),sentinel=new HistoryProvider();setProvider(sentinel);
  assert.throws(()=>replayEntry(world,e),/模拟/);assert.deepEqual(e,before);assert.equal(E.serialize(w),worldBefore);assert.equal(P(),sentinel);
 }
 for(const target of ['settings','state'])for(const value of [undefined,null]) {
  const e=start();if(value===undefined)delete (target==='settings'?e.args:e)[target];else (target==='settings'?e.args:e)[target]=value;
  const sentinel=new HistoryProvider();setProvider(sentinel);const before=E.serialize(w);
  assert.throws(()=>replayEntry(w,e),/模拟/);assert.equal(E.serialize(w),before);assert.equal(P(),sentinel);
 }
 for(const v of invalid) {
  setVersion(w.settings,v);const before=E.serialize(w),sentinel=new HistoryProvider();setProvider(sentinel);
  assert.throws(()=>replayEntry(w,start()),/模拟/);assert.equal(E.serialize(w),before);assert.equal(P(),sentinel);
 }
 w.settings.simulationRulesVersion=SIMULATION_RULES_VERSION;
 const e=start();e.args.settings.simulationRulesVersion=SIMULATION_RULES_VERSION;assert.doesNotThrow(()=>validateSimulationRulesStart(e.args));
 const raw=E.deserialize(E.serialize(w));assert.equal(raw.settings.simulationRulesVersion,SIMULATION_RULES_VERSION);assert.equal(raw.world.settings.simulationRulesVersion,SIMULATION_RULES_VERSION);
 assert.equal(w.settings.initialMethodsVersion,1);assert.equal(w.settings.automationVersion,6);
 for(const obj of [w.settings,raw.settings,raw.world.settings,start().args,runtime()])assert.equal(Object.hasOwn(obj,'releaseNamingVersion'),false);
});

test('every WAL start/runtime and both raw snapshot markers reject before tail repair or Provider mutation',()=>{
 const e=start(),raw=E.deserialize(E.serialize(replayEntry(null,e)));
 for(const v of invalid)for(const target of ['start','nested-start','snapshot-outer','snapshot-inner','snapshot-runtime','log-runtime','later-start','later-runtime'])for(const fromStart of [false,true]) {
  const dir=tmpDir(),entry=structuredClone(e),doc=structuredClone(raw),rt=runtime(),log=[entry];
  if(target==='start')setVersion(entry.args,v);
  if(target==='nested-start')entry.args.settings.simulationRulesVersion=v===undefined?null:v;
  if(target==='snapshot-outer')setVersion(doc.settings,v);
  if(target==='snapshot-inner')setVersion(doc.world.settings,v);
  if(target==='snapshot-runtime')setVersion(rt,v);
  if(target==='log-runtime')setVersion(entry.state,v);
  if(target==='later-start'){const bad=start();setVersion(bad.args,v);log.push(bad);}
  if(target==='later-runtime'){const bad={t:'sys',name:'seats',state:runtime()};setVersion(bad.state,v);log.push(bad);}
  // Snapshot already covers the bad early records. Preflight must still read all.
  fs.writeFileSync(path.join(dir,'log.ndjson'),log.map((x,i)=>JSON.stringify({...x,n:i+1})).join('\n')+'\n{"partial":');
  fs.writeFileSync(path.join(dir,`snap-${String(log.length).padStart(9,'0')}.json.gz`),zlib.gzipSync(JSON.stringify({logN:log.length,text:JSON.stringify(doc),runtime:rt})));
  fs.writeFileSync(path.join(dir,'meta.json'),' {"doNotTouch":true} \n');
  const before=bytes(dir),sentinel=new HistoryProvider();setProvider(sentinel);
  assert.throws(()=>rebuild(dir,{fromStart}),/模拟/,target+':'+v);assert.deepEqual(bytes(dir),before,target);assert.equal(P(),sentinel,target);
  fs.rmSync(dir,{recursive:true,force:true});
 }
});

test('legacy releaseNaming-only and dual-marker archives have no alias / upgrade path',()=>{
 const e=start(),raw=E.deserialize(E.serialize(replayEntry(null,e)));
 for(const old of [1,0,2,null,'1'])for(const current of [false,true])for(const target of ['start','nested','snapshot-outer','snapshot-inner','snapshot-runtime','log-runtime']) {
  const dir=tmpDir(),entry=structuredClone(e),doc=structuredClone(raw),rt=runtime();
  const obj=target==='start'?entry.args:target==='nested'?entry.args.settings:target==='snapshot-outer'?doc.settings:target==='snapshot-inner'?doc.world.settings:target==='snapshot-runtime'?rt:entry.state;
  if(!current)delete obj.simulationRulesVersion;
  obj.releaseNamingVersion=old;
  fs.writeFileSync(path.join(dir,'log.ndjson'),JSON.stringify({...entry,n:1})+'\n{"partial":');
  fs.writeFileSync(path.join(dir,'snap-000000001.json.gz'),zlib.gzipSync(JSON.stringify({logN:1,text:JSON.stringify(doc),runtime:rt})));
  fs.writeFileSync(path.join(dir,'meta.json'),' {"originalDeveloperArchive":true} \n');
  const before=bytes(dir),sentinel=new HistoryProvider();setProvider(sentinel);
  assert.throws(()=>rebuild(dir),/模拟规则/,target+':'+old+':'+current);assert.deepEqual(bytes(dir),before);assert.equal(P(),sentinel);
  fs.rmSync(dir,{recursive:true,force:true});
 }
 // CLI/direct entry also refuses old / mixed top-level and runtime markers.
 for(const current of [false,true])for(const target of ['args','state']) {
  const entry=start(),obj=entry[target];if(!current)delete obj.simulationRulesVersion;obj.releaseNamingVersion=1;
  const before=structuredClone(entry),sentinel=new HistoryProvider();setProvider(sentinel);
  assert.throws(()=>replayEntry(null,entry),/模拟规则/);assert.deepEqual(entry,before);assert.equal(P(),sentinel);
 }
});

test('clients cannot choose either current or obsolete rule marker, including version 1',()=>{
 for(const key of ['simulationRulesVersion','releaseNamingVersion'])for(const value of [undefined,null,0,1,2,'1',true]) {
  const input={[key]:value},before=structuredClone(input);
  assert.throws(()=>rejectSimulationRulesInput(input),/服务器决定/);assert.deepEqual(input,before);
 }
 assert.doesNotThrow(()=>rejectSimulationRulesInput({mode:'zero'}));
});

test('entire missing/null snapshot runtime and create/start state stay fail closed',()=>{
 const e=start(),text=E.serialize(replayEntry(null,e));
 for(const target of ['snapshot','start','create'])for(const value of [undefined,null]) {
  const dir=tmpDir(),entry=structuredClone(e),snap={logN:1,text,runtime:runtime()};
  const obj=target==='snapshot'?snap:entry,key=target==='snapshot'?'runtime':'state';
  if(value===undefined)delete obj[key];else obj[key]=value;
  if(target==='create'){entry.name='create';snap.text=null;}
  fs.writeFileSync(path.join(dir,'log.ndjson'),JSON.stringify({...entry,n:1})+'\n{"partial":');
  fs.writeFileSync(path.join(dir,'snap-000000001.json.gz'),zlib.gzipSync(JSON.stringify(snap)));
  const before=bytes(dir),sentinel=new HistoryProvider();setProvider(sentinel);
  assert.throws(()=>rebuild(dir),/初始研究|模拟/);assert.deepEqual(bytes(dir),before);assert.equal(P(),sentinel);
  fs.rmSync(dir,{recursive:true,force:true});
 }
});

test('unstarted lobby simulation marker is mandatory; valid partial tails repair without installing Provider',()=>{
 for(const version of [...invalid,SIMULATION_RULES_VERSION]) {
  const dir=tmpDir(),rt=runtime();setVersion(rt,version);
  fs.writeFileSync(path.join(dir,'log.ndjson'),JSON.stringify({t:'room',name:'create',state:rt,n:1})+'\n{"partial":');
  writeSnap(dir,null,1,rt);const before=bytes(dir),sentinel=new HistoryProvider();setProvider(sentinel);
  if(version===SIMULATION_RULES_VERSION){const got=rebuild(dir);assert.equal(got.world,null);assert.deepEqual(got.runtime,rt);assert.equal(readLog(dir).length,1);assert(!fs.readFileSync(path.join(dir,'log.ndjson'),'utf8').includes('partial'));}
  else {assert.throws(()=>rebuild(dir),/模拟/);assert.deepEqual(bytes(dir),before);}
  assert.equal(P(),sentinel);fs.rmSync(dir,{recursive:true,force:true});
 }
});

test('current snapshot and WAL-only replay match all JSON bytes after tail repair and subsequent append',()=>{
 for(const mode of ['snapshot','fromStart','wal-only']) {
  const dir=tmpDir(),e=start();let w=replayEntry(null,e),n=appendLog(dir,e,0);
  if(mode!=='wal-only')writeSnap(dir,w,n,runtime());
  for(let i=0;i<3;i++){const entry={t:'tick',day:w.day,state:runtime()};n=appendLog(dir,entry,n);w=replayEntry(w,entry);}
  const expected=E.serialize(w);fs.appendFileSync(path.join(dir,'log.ndjson'),' {"partial":');
  const restored=rebuild(dir,{fromStart:mode==='fromStart'});assert.equal(E.serialize(restored.world),expected);assert.deepEqual(restored.runtime,runtime());
  const next={t:'tick',day:w.day,state:runtime()};n=appendLog(dir,next,n);w=replayEntry(restored.world,next);
  let full=null;for(const entry of readLog(dir))full=replayEntry(full,entry);
  assert.equal(E.serialize(full),E.serialize(w));assert.equal(readLog(dir).length,n);assert.equal(E.serialize(rebuild(dir).world),E.serialize(full));
  fs.rmSync(dir,{recursive:true,force:true});
 }
});

test('real server owns direct and fork-lobby starts; client markers reject and new-format restore stays exact',async t=>{
 const data=tmpDir(),servers=[],clients=[];const open=async()=>{const s=await startServer({data,args:['--tick-ms','10000','--max-rooms','4']});servers.push(s);return s;};
 t.after(async()=>{clients.forEach(c=>c.close());for(const s of servers)await stopServer(s);});
 let srv=await open();
 for(const marker of ['simulationRulesVersion','releaseNamingVersion']) {
 for(const lobby of [false,true])for(const location of ['body','settings']) {
  const body={lobby,settings:lobby?{humans:2,bots:1}:roomSettings({humans:1,bots:0,days:3})};
  (location==='body'?body:body.settings)[marker]=marker==='simulationRulesVersion'?0:1;
  const r=await api(srv.base,'/api/rooms',{method:'POST',body});assert.equal(r.status,400,r.text);assert.match(r.text,/模拟/);
 }
 await new Promise(resolve=>setTimeout(resolve,1100));
 }
 const direct=await api(srv.base,'/api/rooms',{method:'POST',body:{settings:roomSettings({humans:1,bots:0,days:3})}}),dir=path.join(data,ok(direct).room);
 const ds=readLog(dir).find(e=>e.name==='start');assert.equal(ds.args.simulationRulesVersion,SIMULATION_RULES_VERSION);assert.equal(ds.state.simulationRulesVersion,SIMULATION_RULES_VERSION);assert.equal(ds.args.initialMethodsVersion,1);assert.equal(ds.args.clockRulesVersion,1);assert.equal(ds.args.automationVersion,6);
 const made=await api(srv.base,'/api/rooms',{method:'POST',body:{lobby:true,settings:{mode:'fork',start:'2025-01',humans:2,bots:0,keep:3,years:1,seed:11,speedMax:0}}}),room=ok(made).room,fdir=path.join(data,room);
 assert.equal(readLog(fdir)[0].state.simulationRulesVersion,SIMULATION_RULES_VERSION);assert.equal(readSnap(fdir,listSnaps(fdir).at(-1)).runtime.simulationRulesVersion,SIMULATION_RULES_VERSION);
 const host=new Client(srv.base,room,made.cookie);clients.push(host);await host.connect();
 for(const name of ['settings','start'])for(const args of [{simulationRulesVersion:0},{settings:{simulationRulesVersion:SIMULATION_RULES_VERSION}},{releaseNamingVersion:1},{settings:{releaseNamingVersion:0}}]) {
  const r=await host.roomCmd(name,args);assert.equal(r.status,400,r.text);assert.match(r.text,/模拟/);
 }
 // Rejected attempts intentionally still consume the real 10-command/s limiter.
 await new Promise(resolve=>setTimeout(resolve,1100));
 const joined=await api(srv.base,`/api/r/${room}/join`,{method:'POST',body:{seat:1}}),member=ok(joined).member;
 const peer=new Client(srv.base,room,joined.cookie);clients.push(peer);await peer.connect();ok(await host.roomCmd('approveSeat',{member,seat:1}));
 ok(await host.roomCmd('ready',{name:'深度求索',brand:'深度',country:'CN',pick:'deepseek',ready:true}));ok(await peer.roomCmd('ready',{name:'Claude',brand:'Claude',country:'US',pick:'claude',ready:true}));
 ok(await host.roomCmd('start'));await waitFor(()=>host.s&&peer.s,10000);ok(await host.roomCmd('save'));
 const first=readLog(fdir).find(e=>e.name==='start');assert.equal(first.args.simulationRulesVersion,SIMULATION_RULES_VERSION);assert.equal(first.state.simulationRulesVersion,SIMULATION_RULES_VERSION);
 const before=ok(await api(srv.base,`/api/r/${room}/status`));clients.forEach(c=>c.close());await stopServer(srv);
 for(const d of [dir,fdir]){let w=null;for(const e of readLog(d))w=replayEntry(w,e);const snap=readSnap(d,listSnaps(d).at(-1));assert.equal(E.serialize(w),snap.text);const raw=E.deserialize(snap.text);assert.equal(raw.settings.simulationRulesVersion,SIMULATION_RULES_VERSION);assert.equal(raw.world.settings.simulationRulesVersion,SIMULATION_RULES_VERSION);assert.equal(snap.runtime.simulationRulesVersion,SIMULATION_RULES_VERSION);fs.appendFileSync(path.join(d,'log.ndjson'),' {"partial":');}
 srv=await open();const after=ok(await api(srv.base,`/api/r/${room}/status`));assert.equal(after.hash,before.hash);assert.equal(after.day,before.day);
 const resumed=new Client(srv.base,room,made.cookie);clients.push(resumed);await resumed.connect();await waitFor(()=>resumed.s,10000);assert(resumed.s.techs.includes('fp8'));
});

test('real resume rejects old/null/unknown started and lobby archives without touching any bytes',async t=>{
 const data=tmpDir();let srv=await startServer({data,args:['--tick-ms','10000','--max-rooms','2']});t.after(async()=>{await stopServer(srv);});
 const direct=await api(srv.base,'/api/rooms',{method:'POST',body:{settings:roomSettings({humans:1,bots:0,days:3})}}),lobby=await api(srv.base,'/api/rooms',{method:'POST',body:{lobby:true,settings:{humans:2,bots:1}}});
 const rooms=[ok(direct).room,ok(lobby).room];await stopServer(srv);const originals=rooms.map(id=>bytes(path.join(data,id)));
 for(const version of [undefined,null,1,3,'dual']) {
  for(const [i,id] of rooms.entries()) {
   const dir=path.join(data,id);for(const f of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,f));for(const [f,b] of Object.entries(originals[i]))fs.writeFileSync(path.join(dir,f),Buffer.from(b,'base64'));
   const log=readLog(dir),targets=i===0?[log.find(e=>e.name==='start').args]:log.filter(e=>e.state).map(e=>e.state);
   for(const obj of targets){setVersion(obj,version==='dual'?SIMULATION_RULES_VERSION:version);if(version===undefined||version==='dual')obj.releaseNamingVersion=1;}
   fs.writeFileSync(path.join(dir,'log.ndjson'),log.map(e=>JSON.stringify(e)).join('\n')+'\n{"partial":');
  }
  const before=rooms.map(id=>bytes(path.join(data,id)));srv=await startServer({data,args:['--tick-ms','10000','--max-rooms','2']});
  await waitFor(()=>rooms.every(id=>srv.log().includes(`房间 ${id} 恢复失败`)),10000);assert.match(srv.log(),/模拟/);await stopServer(srv);
  rooms.forEach((id,i)=>assert.deepEqual(bytes(path.join(data,id)),before[i],id+':'+version));
 }
});
