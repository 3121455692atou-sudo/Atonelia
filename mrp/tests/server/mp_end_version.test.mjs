import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {startServer,stopServer,api,Client,waitFor,roomSettings,tmpDir} from '../helpers/mp_server.mjs';
import {readLog,replayEntry,listSnaps,readSnap} from '../../server/store.mjs';
import * as E from '../../src/career/engine.js';
test('旧规则直建房明确拒绝；当前房间终局v1且完整日志与权威快照逐字一致',async t=>{
 const data=tmpDir(),srv=await startServer({data,args:['--tick-ms','5','--max-rooms','1']});let c;
 t.after(async()=>{c?.close();await stopServer(srv);});
 const rejected=await api(srv.base,'/api/rooms',{method:'POST',body:{endVersion:0,autoPostVersion:0,settings:{...roomSettings({humans:1,bots:0,days:3}),endVersion:0,autoPostVersion:0}}});
 assert.equal(rejected.status,400,rejected.text);
 const r=await api(srv.base,'/api/rooms',{method:'POST',body:{settings:roomSettings({humans:1,bots:0,days:3})}});
 assert.equal(r.status,200,r.text);const room=r.json.room,dir=path.join(data,room);c=new Client(srv.base,room,r.cookie);await c.connect();assert.equal((await c.roomCmd('start')).status,200);
 await waitFor(async()=> (await api(srv.base,`/api/r/${room}/status`)).json?.ended,10000);
 c.close();await stopServer(srv);
 const log=readLog(dir),start=log.find(e=>e.t==='room'&&e.name==='start');assert.equal(start.args.endVersion,1);assert.equal(start.args.autoPostVersion,1);
 let world=null;for(const e of log)world=replayEntry(world,e);assert.equal(world.endVersion,1);assert.equal(world.autoPostVersion,1);assert.ok(world.result);
 const text=readSnap(dir,listSnaps(dir).at(-1)).text;assert.equal(E.serialize(world),text);
});
test('无新版后训练标记的旧start日志明确拒绝，不兼容旧档',()=>{
 const settings={...roomSettings({humans:1,bots:0,days:3}),endVersion:1};
 assert.throws(()=>replayEntry(null,{t:'room',name:'start',args:{settings}}),/后训练/);
});
test('真实大厅start也强制v1标记，日志可重放',async t=>{
 const data=tmpDir(),srv=await startServer({data,args:['--tick-ms','10000','--max-rooms','1']}),clients=[];
 t.after(async()=>{clients.forEach(c=>c.close());await stopServer(srv);});
 const made=await api(srv.base,'/api/rooms',{method:'POST',body:{lobby:true,endVersion:0,autoPostVersion:0,settings:{humans:2,bots:1,years:1,endVersion:0,autoPostVersion:0}}});assert.equal(made.status,200,made.text);
 const room=made.json.room,host=new Client(srv.base,room,made.cookie);clients.push(host);await host.connect();
 const joined=await api(srv.base,`/api/r/${room}/join`,{method:'POST',body:{seat:1}});assert.equal(joined.status,200,joined.text);
 const peer=new Client(srv.base,room,joined.cookie);clients.push(peer);await peer.connect();assert.equal((await host.roomCmd('approveSeat',{member:joined.json.member,seat:1})).status,200);
 for(const [i,c] of clients.entries())assert.equal((await c.roomCmd('ready',{name:`公司${i}`,brand:`品牌${i}`,country:'CN',ready:true})).status,200);
 assert.equal((await host.roomCmd('start')).status,200);clients.forEach(c=>c.close());await stopServer(srv);
 const dir=path.join(data,room),logs=readLog(dir),start=logs.find(e=>e.t==='room'&&e.name==='start');assert.equal(start.args.endVersion,1);assert.equal(start.args.autoPostVersion,1);
 let world=null;for(const e of logs)world=replayEntry(world,e);assert.equal(world.endVersion,1);assert.equal(world.autoPostVersion,1);assert.equal(E.serialize(world),readSnap(dir,listSnaps(dir).at(-1)).text);
});
