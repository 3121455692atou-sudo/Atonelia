import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readLog} from '../../server/store.mjs';
import {tmpDir,startServer,stopServer,api,Client,waitFor,replayHash,roomSettings} from '../helpers/mp_server.mjs';
const serverRoot=process.env.MRP_TEST_ROOT;
const replay=(dir,opts={})=>replayHash(dir,{...opts,...(serverRoot?{root:serverRoot}:{})});
const ok=r=>{assert.equal(r.status,200,r.text);assert.equal(r.json.ok,true,r.text);return r.json;};
test('real HTTP refused advice/plan preserves world, WAL and restart hash; successful command persists',async t=>{
 const data=tmpDir();let srv=await startServer({data,...(serverRoot?{root:serverRoot}:{}),args:['--tick-ms','10000']}),clients=[];
 t.after(async()=>{clients.forEach(c=>c.close());await stopServer(srv);});
 const made=await api(srv.base,'/api/rooms',{method:'POST',body:{settings:roomSettings({humans:2,bots:1})}}),room=ok(made).room;
 const peer=await api(srv.base,`/api/r/${room}/join`,{method:'POST',body:{seat:1}});ok(peer);
 const host=new Client(srv.base,room,made.cookie);clients=[host,new Client(srv.base,room,peer.cookie)];for(const c of clients)await c.connect();await waitFor(()=>clients.every(c=>c.s));
 ok(await host.roomCmd('start'));ok(await host.roomCmd('pause'));const dir=path.join(data,room);
 const before=(await api(srv.base,`/api/r/${room}/status`)).json,cmdCount=()=>readLog(dir).filter(e=>e.t==='cmd').length,oldCount=cmdCount();
 const rejects=[['applyAdvice',{advice:{nag:true,id:'qualification_probe',op:{type:'unsupported_probe'}}}],['applyAdvice',{advice:{nag:true,id:'post',op:{type:'job',op:'post',dir:'invalid_probe'}}}],['applyAdvice',{advice:{nag:true,id:'trial',op:{type:'trial',plan:{total:7,active:7,arch:'dense',tokens:1},spec:{kind:'invalid_probe'}}}}],...['constructor','__proto__'].map(arch=>['setPlan',{cfg:{total:1,active:1,tokens:1,arch}}]),['setPlan',{cfg:{total:'1e999',active:'1e999',tokens:1}}]];
 let seq=1;for(const [name,args]of rejects){const r=await host.cmd(seq++,name,args);assert.equal(r.status,400,r.text);assert.equal(r.json.ok,false,r.text);assert.equal((await api(srv.base,`/api/r/${room}/status`)).json.hash,before.hash,`${name}: rejected world changed`);assert.equal(cmdCount(),oldCount);}
 assert.equal(replay(dir).split(' ')[1],before.hash,'WAL matches live rejected state');
 const success=await host.cmd(seq++,'setPlan',{cfg:{total:'7',active:'14',arch:'dense',tokens:1}});ok(success);await waitFor(()=>host.s.jobs.plan?.total===7);const after=(await api(srv.base,`/api/r/${room}/status`)).json;assert.notEqual(after.hash,before.hash);assert.equal(cmdCount(),oldCount+1);assert.equal(replay(dir).split(' ')[1],after.hash);
 ok(await host.roomCmd('save'));assert.equal(replay(dir,{fromStart:false}).split(' ')[1],after.hash);
 clients.forEach(c=>c.close());await stopServer(srv);srv=await startServer({data,...(serverRoot?{root:serverRoot}:{}),args:['--tick-ms','10000']});const restored=ok(await api(srv.base,`/api/r/${room}/status`));assert.equal(restored.hash,after.hash);
});
