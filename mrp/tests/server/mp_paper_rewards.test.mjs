import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';
import * as E from '../../src/career/engine.js';import{newModel}from'../../src/career/sim/projects.js';
import{readLog,listSnaps,readSnap,writeSnap,replayEntry}from'../../server/store.mjs';
import{tmpDir,startServer,stopServer,api,Client,waitFor,roomSettings}from'../helpers/mp_server.mjs';
test('real HTTP duplicate paper selection rewards once and restores from fixture baseline plus WAL',async t=>{
 const data=tmpDir();let srv=await startServer({data,args:['--tick-ms','10000']}),clients=[];t.after(async()=>{clients.forEach(c=>c.close());await stopServer(srv);});
 const made=await api(srv.base,'/api/rooms',{method:'POST',body:{settings:roomSettings({humans:2,bots:0,days:365})}});assert.equal(made.status,200,made.text);const room=made.json.room,dir=path.join(data,room);
 const join=await api(srv.base,`/api/r/${room}/join`,{method:'POST',body:{seat:1}});assert.equal(join.status,200,join.text);await stopServer(srv);
 // Explicit ready-model/first-tech snapshot fixture, not a claim of natural training.
 const snap=readSnap(dir,listSnaps(dir).at(-1)),w=E.migrateWorld(snap.text).world,c=Object.values(w.companies).find(x=>x.seat===0),s=c.s;
 const m={...newModel(s,{total:32,active:32,arch:'dense'}),id:'m_http_paper',stage:'post',postDays:30,relDays:0,releases:0,role:'flagship',dims:{knowledge:50,code:50,math:50,writing:50,agent:50,safety:50},name:null,techs:[]};s.models.push(m);s.working=m.id;s.queue=[];s.firsts={grpo:s.day,fp8:s.day};s.papers={};const baseline=E.serialize(w),baseN=snap.logN;writeSnap(dir,w,baseN,snap.runtime);
 const single=E.migrateWorld(baseline).world;assert.equal(E.applyNow(single,c.id,{name:'submitEval',args:{modelId:m.id,tier:'skip',papers:['grpo','fp8']}}).ok,true);const expected=E.serialize(single);
 srv=await startServer({data,args:['--tick-ms','10000']});const host=new Client(srv.base,room,made.cookie);clients=[host,new Client(srv.base,room,join.cookie)];for(const cl of clients)await cl.connect();await waitFor(()=>clients.every(cl=>cl.s));
 const before=(await api(srv.base,`/api/r/${room}/status`)).json.hash;
 for(const [seq,papers]of [[1,'grpo'],[2,['grpo',null]]]){const r=await host.cmd(seq,'submitEval',{modelId:m.id,tier:'skip',papers});assert.equal(r.status,400,r.text);assert.equal((await api(srv.base,`/api/r/${room}/status`)).json.hash,before);}
 const command={modelId:m.id,tier:'skip',papers:['grpo','grpo','fp8','grpo']};const r=await host.cmd(3,'submitEval',command);assert.equal(r.status,200,r.text);assert.equal(r.json.ok,true);await waitFor(()=>host.s.papers?.grpo&&host.s.papers?.fp8);
 assert.equal((await api(srv.base,`/api/r/${room}/status`)).json.hash,single.hash());assert.equal((await host.cmd(3,'submitEval',command)).json.ok,true);
 clients.forEach(cl=>cl.close());await stopServer(srv);const log=readLog(dir);assert.equal(log.filter(x=>x.t==='cmd').length,1);
 let replay=E.migrateWorld(baseline).world;for(const e of log.slice(baseN))replay=replayEntry(replay,e);assert.equal(E.serialize(replay),expected);assert.equal(readSnap(dir,listSnaps(dir).at(-1)).text,expected);
 srv=await startServer({data,args:['--tick-ms','10000']});assert.equal((await api(srv.base,`/api/r/${room}/status`)).json.hash,single.hash());
});
