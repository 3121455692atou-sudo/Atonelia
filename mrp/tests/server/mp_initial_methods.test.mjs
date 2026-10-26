import { SIMULATION_RULES_VERSION } from '../../server/simulation_rules.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { startServer, stopServer, api, Client, waitFor, roomSettings, tmpDir } from '../helpers/mp_server.mjs';
import { appendLog, readLog, replayEntry, writeSnap, readSnap, listSnaps, rebuild } from '../../server/store.mjs';
import { INITIAL_METHODS_VERSION, validateInitialMethodsStart } from '../../server/initial_methods.mjs';
import { P, setProvider, HistoryProvider } from '../../src/career/sim/provider.js';
import * as E from '../../src/career/engine.js';

const runtime = () => ({initialMethodsVersion:1,simulationRulesVersion:SIMULATION_RULES_VERSION,clock:{clockRulesVersion:1,hostSpeed:0}});
const start = (settings=roomSettings({humans:1,bots:1,days:10})) => ({t:'room',name:'start',args:{settings,initialMethodsVersion:1,simulationRulesVersion:SIMULATION_RULES_VERSION,clockRulesVersion:1,automationVersion:6,endVersion:1,autoPostVersion:1,postTraining:{mode:'random',version:1},postTrainingSeed:2389463},state:runtime()});
const bytes = dir => Object.fromEntries(fs.readdirSync(dir).sort().map(f=>[f,fs.readFileSync(path.join(dir,f)).toString('base64')]));
const setVersion = (obj,value) => {if(value===undefined)delete obj.initialMethodsVersion;else obj.initialMethodsVersion=value;};
const ok = r => {assert.equal(r.status,200,r.text);assert.equal(r.json?.ok,true,r.text);return r.json;};

test('initial ownership has an independent exact version; unsupported replay cannot install a Provider',()=>{
 assert.equal(INITIAL_METHODS_VERSION,1);
 const sentinel=new HistoryProvider();setProvider(sentinel);
 for(const v of [undefined,0,2,'1',true,null]) {
  const e=start();setVersion(e.args,v);const before=structuredClone(e);
  assert.throws(()=>replayEntry(null,e),/初始研究/);assert.deepEqual(e,before);assert.equal(P(),sentinel);
 }
 const nested=start();nested.args.settings.initialMethodsVersion=0;
 assert.throws(()=>validateInitialMethodsStart(nested.args),/初始研究/);
});

test('all three leader cells replay under version 1; zero does not get a historical exception',()=>{
 for(const [year,id,techs] of [[2025,'deepseek',['fp8','mtp']],[2025,'claude',['mcp']],[2024,'mistral',['moe']]]) {
  const e=start({mode:'fork',start:year,seed:11,days:10,keep:3,seats:[id]});
  const w=replayEntry(null,e);assert.equal(w.settings.initialMethodsVersion,1);assert.equal(w.settings.automationVersion,6);
  for(const tech of techs)assert(w.companies[id].s.techs.includes(tech),id+':'+tech);
  const raw=E.deserialize(E.serialize(w));assert.equal(raw.settings.initialMethodsVersion,1);assert.equal(raw.world.settings.initialMethodsVersion,1);
 }
 const w=replayEntry(null,start({...roomSettings({humans:1,bots:1,days:10}),start:'2025-01'}));
 for(const c of Object.values(w.companies))if(c.s)for(const id of ['fp8','mtp','mcp'])assert(!c.s.techs.includes(id),'zero did not inherit '+id);
});

test('old/unknown WAL, both snapshot settings, and runtime reject before default repair or Provider mutation',()=>{
 const e=start(),w=replayEntry(null,e),raw=E.deserialize(E.serialize(w));
 for(const v of [undefined,0,2])for(const target of ['start','nested-start','snapshot-outer','snapshot-inner','snapshot-runtime','log-runtime']) {
  const dir=tmpDir(),entry=structuredClone(e),doc=structuredClone(raw),rt=runtime();
  if(target==='start')setVersion(entry.args,v);
  if(target==='nested-start') {entry.args.settings.initialMethodsVersion=v===undefined?null:v;}
  if(target==='snapshot-outer')setVersion(doc.settings,v);
  if(target==='snapshot-inner')setVersion(doc.world.settings,v);
  if(target==='snapshot-runtime')setVersion(rt,v);
  if(target==='log-runtime')setVersion(entry.state,v);
  fs.writeFileSync(path.join(dir,'log.ndjson'),JSON.stringify({...entry,n:1})+'\n{"partial":');
  fs.writeFileSync(path.join(dir,'snap-000000001.json.gz'),zlib.gzipSync(JSON.stringify({logN:1,text:JSON.stringify(doc),runtime:rt})));
  fs.writeFileSync(path.join(dir,'meta.json'),' {"doNotTouch":true} \n');
  const before=bytes(dir),sentinel=new HistoryProvider();setProvider(sentinel);
  assert.throws(()=>rebuild(dir),/初始研究/,target+':'+v);assert.deepEqual(bytes(dir),before,target);assert.equal(P(),sentinel,target);
 }
});

test('entire missing/null snapshot runtime and room create/start state fail before Provider installation',()=>{
 const e=start(),w=replayEntry(null,e),text=E.serialize(w);
 for(const target of ['snapshot-missing','snapshot-null','start-missing','start-null','create-missing','create-null']) {
  const dir=tmpDir(),entry=structuredClone(e),snap={logN:1,text,runtime:runtime()};
  if(target.startsWith('snapshot')) {if(target.endsWith('missing'))delete snap.runtime;else snap.runtime=null;}
  else {if(target.startsWith('create')){entry.name='create';snap.text=null;}if(target.endsWith('missing'))delete entry.state;else entry.state=null;}
  fs.writeFileSync(path.join(dir,'log.ndjson'),JSON.stringify({...entry,n:1})+'\n{"partial":');
  fs.writeFileSync(path.join(dir,'snap-000000001.json.gz'),zlib.gzipSync(JSON.stringify(snap)));
  const before=bytes(dir),sentinel=new HistoryProvider();setProvider(sentinel);
  assert.throws(()=>rebuild(dir),/初始研究/,target);assert.equal(P(),sentinel,target);assert.deepEqual(bytes(dir),before,target);
 }
});

test('unstarted lobby old runtime rejects unchanged, current runtime repairs only the incomplete tail',()=>{
 for(const version of [undefined,0,2,1]) {
  const dir=tmpDir(),rt=runtime();setVersion(rt,version);
  fs.writeFileSync(path.join(dir,'log.ndjson'),JSON.stringify({t:'room',name:'create',state:rt,n:1})+'\n{"partial":');
  writeSnap(dir,null,1,rt);const before=bytes(dir),sentinel=new HistoryProvider();setProvider(sentinel);
  if(version===1){const got=rebuild(dir);assert.equal(got.world,null);assert.deepEqual(got.runtime,rt);assert.equal(readLog(dir).length,1);assert(!fs.readFileSync(path.join(dir,'log.ndjson'),'utf8').includes('partial'));}
  else {assert.throws(()=>rebuild(dir),/初始研究/);assert.deepEqual(bytes(dir),before);}
  assert.equal(P(),sentinel);
 }
});

test('current snapshot and full WAL remain exact after tail repair and subsequent append',()=>{
 const dir=tmpDir(),e=start(),w0=replayEntry(null,e);let n=appendLog(dir,e,0),w=w0;writeSnap(dir,w,n,runtime());
 for(let i=0;i<3;i++){const entry={t:'tick',day:w.day,state:runtime()};n=appendLog(dir,entry,n);w=replayEntry(w,entry);}
 const expected=E.serialize(w);fs.appendFileSync(path.join(dir,'log.ndjson'),'{"partial":');
 const restored=rebuild(dir);assert.equal(E.serialize(restored.world),expected);assert.equal(restored.runtime.initialMethodsVersion,1);
 const next={t:'tick',day:w.day,state:runtime()};n=appendLog(dir,next,n);w=replayEntry(restored.world,next);
 let full=null;for(const entry of readLog(dir))full=replayEntry(full,entry);assert.equal(E.serialize(full),E.serialize(w));assert.equal(readLog(dir).length,n);
 assert.equal(E.serialize(rebuild(dir).world),E.serialize(full));
});

test('real server owns both direct and fork-lobby starts; client downgrade is rejected and valid restore is exact',async t=>{
 const data=tmpDir(),servers=[],clients=[];const open=async()=>{const s=await startServer({data,args:['--tick-ms','10000','--max-rooms','4']});servers.push(s);return s;};
 t.after(async()=>{clients.forEach(c=>c.close());for(const s of servers)await stopServer(s);});
 let srv=await open();
 for(const lobby of [false,true])assert.equal((await api(srv.base,'/api/rooms',{method:'POST',body:{lobby,settings:lobby?{humans:2,bots:1,initialMethodsVersion:0}:{...roomSettings({humans:1,bots:0,days:3}),initialMethodsVersion:0}}})).status,400);
 const direct=await api(srv.base,'/api/rooms',{method:'POST',body:{initialMethodsVersion:0,settings:roomSettings({humans:1,bots:0,days:3})}});const d=ok(direct),dir=path.join(data,d.room);
 const ds=readLog(dir).find(e=>e.name==='start');assert.equal(ds.args.initialMethodsVersion,1);assert.equal(ds.state.initialMethodsVersion,1);assert.equal(ds.args.clockRulesVersion,1);assert.equal(ds.args.automationVersion,6);
 const made=await api(srv.base,'/api/rooms',{method:'POST',body:{lobby:true,initialMethodsVersion:0,settings:{mode:'fork',start:'2025-01',humans:2,bots:0,keep:3,years:1,seed:11,speedMax:0}}});const room=ok(made).room;
 const host=new Client(srv.base,room,made.cookie);clients.push(host);await host.connect();assert.equal((await host.roomCmd('settings',{initialMethodsVersion:0})).status,400);
 const joined=await api(srv.base,`/api/r/${room}/join`,{method:'POST',body:{seat:1}});const member=ok(joined).member;const peer=new Client(srv.base,room,joined.cookie);clients.push(peer);await peer.connect();ok(await host.roomCmd('approveSeat',{member,seat:1}));
 ok(await host.roomCmd('ready',{name:'深度求索',brand:'深度',country:'CN',pick:'deepseek',ready:true}));ok(await peer.roomCmd('ready',{name:'Claude',brand:'Claude',country:'US',pick:'claude',ready:true}));
 ok(await host.roomCmd('start',{initialMethodsVersion:0}));await waitFor(()=>host.s&&peer.s,10000);
 assert(host.s.techs.includes('fp8'));assert(host.s.techs.includes('mtp'));assert(peer.s.techs.includes('mcp'));assert.equal(host.s.postCards,undefined);
 ok(await host.roomCmd('save'));const fdir=path.join(data,room);const first=readLog(fdir).find(e=>e.name==='start');assert.equal(first.args.initialMethodsVersion,1);
 const before=ok(await api(srv.base,`/api/r/${room}/status`));clients.forEach(c=>c.close());await stopServer(srv);
 for(const p of [dir,fdir]){let w=null;for(const e of readLog(p))w=replayEntry(w,e);assert.equal(E.serialize(w),readSnap(p,listSnaps(p).at(-1)).text);}
 srv=await open();const after=ok(await api(srv.base,`/api/r/${room}/status`));assert.equal(after.hash,before.hash);assert.equal(after.day,before.day);
 const resumed=new Client(srv.base,room,made.cookie);clients.push(resumed);await resumed.connect();await waitFor(()=>resumed.s,10000);assert(resumed.s.techs.includes('fp8'));assert(resumed.s.techs.includes('mtp'));
});

test('real server rejects old/unknown started and unstarted archives before touching any archived bytes',async t=>{
 const data=tmpDir();let srv=await startServer({data,args:['--tick-ms','10000','--max-rooms','2']});t.after(async()=>{await stopServer(srv);});
 const direct=await api(srv.base,'/api/rooms',{method:'POST',body:{settings:roomSettings({humans:1,bots:0,days:3})}}),lobby=await api(srv.base,'/api/rooms',{method:'POST',body:{lobby:true,settings:{humans:2,bots:1}}});
 const rooms=[ok(direct).room,ok(lobby).room];await stopServer(srv);const originals=rooms.map(id=>bytes(path.join(data,id)));
 for(const version of [undefined,2]) {
  for(const [i,id] of rooms.entries()) {
   const dir=path.join(data,id);for(const f of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,f));for(const [f,b] of Object.entries(originals[i]))fs.writeFileSync(path.join(dir,f),Buffer.from(b,'base64'));
   const log=readLog(dir);if(i===0)setVersion(log.find(e=>e.name==='start').args,version);else for(const e of log)if(e.state)setVersion(e.state,version);
   fs.writeFileSync(path.join(dir,'log.ndjson'),log.map(e=>JSON.stringify(e)).join('\n')+'\n{"partial":');
  }
  const before=rooms.map(id=>bytes(path.join(data,id)));srv=await startServer({data,args:['--tick-ms','10000','--max-rooms','2']});
  await waitFor(()=>rooms.every(id=>srv.log().includes(`房间 ${id} 恢复失败`)),10000);assert.match(srv.log(),/初始研究/);await stopServer(srv);
  rooms.forEach((id,i)=>assert.deepEqual(bytes(path.join(data,id)),before[i],id+':'+version));
 }
});
