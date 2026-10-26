import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import * as E from '../../src/career/engine.js';
import {newModel} from '../../src/career/sim/projects.js';
import {readLog,listSnaps,readSnap,writeSnap,replayEntry} from '../../server/store.mjs';
import {tmpDir,startServer,stopServer,api,Client,waitFor,roomSettings} from '../helpers/mp_server.mjs';
test('真实HTTP/SSE full42天，跨席及非法tier拒绝不进成功日志，同seq去重及重放',async t=>{
 const data=tmpDir();let srv=await startServer({data,args:['--tick-ms','10000']}),clients=[];
 t.after(async()=>{clients.forEach(c=>c.close());await stopServer(srv);});
 const made=await api(srv.base,'/api/rooms',{method:'POST',body:{settings:roomSettings({humans:2,bots:0,days:365})}});assert.equal(made.status,200,made.text);const room=made.json.room,dir=path.join(data,room);
 const joined=await api(srv.base,`/api/r/${room}/join`,{method:'POST',body:{seat:1}});assert.equal(joined.status,200,joined.text);await stopServer(srv);
 // 可复现的就绪候选存档fixture，不假称真实训练；之后全部请求走真实HTTP/worker/SSE。
 const snap=readSnap(dir,listSnaps(dir).at(-1)),w=E.migrateWorld(snap.text).world,c=Object.values(w.companies).find(c=>c.seat===0),s=c.s;
 const m={...newModel(s,{total:32,active:32,arch:'dense'}),id:'m_http_eval',stage:'post',postDays:30,relDays:0,releases:0,role:'flagship',dims:{knowledge:50,code:50,math:50,writing:50,agent:50,safety:50},name:null,techs:[]};s.models.push(m);s.working=m.id;s.queue=[];const baseline=E.serialize(w),baseN=snap.logN;writeSnap(dir,w,baseN,snap.runtime);
 srv=await startServer({data,args:['--tick-ms','10000']});const host=new Client(srv.base,room,made.cookie),peer=new Client(srv.base,room,joined.cookie);clients=[host,peer];for(const client of clients)await client.connect();await waitFor(()=>host.s&&peer.s);
 const before=await api(srv.base,`/api/r/${room}/status`);
 const other=await peer.cmd(1,'submitEval',{modelId:m.id,tier:'full'});assert.equal(other.json.ok,false);
 for(const [i,tier] of ['strict','turbo','legacy'].entries())assert.equal((await host.cmd(i+2,'submitEval',{modelId:m.id,tier})).json.ok,false);
 assert.equal((await api(srv.base,`/api/r/${room}/status`)).json.hash,before.json.hash);
 const ok=await host.cmd(10,'submitEval',{modelId:m.id,tier:'full'});assert.equal(ok.json.ok,true,ok.text);await waitFor(()=>host.s.evals?.some(e=>e.modelId===m.id));assert.equal(host.s.evals[0].tier,'full');assert.equal(host.s.evals[0].days,42);assert.equal(peer.s.evals?.some(e=>e.modelId===m.id),false);
 assert.equal((await host.cmd(10,'submitEval',{modelId:m.id,tier:'full'})).json.ok,true);clients.forEach(c=>c.close());await stopServer(srv);
 const log=readLog(dir),cmds=log.filter(e=>e.t==='cmd');assert.equal(cmds.length,1);assert.equal(cmds[0].args.tier,'full');
 let replay=E.migrateWorld(baseline).world;for(const e of log.slice(baseN))replay=replayEntry(replay,e);assert.equal(E.serialize(replay),readSnap(dir,listSnaps(dir).at(-1)).text);
});
