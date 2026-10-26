import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {PROTOCOL_V,stripPrivate} from '../../src/career/net/protocol.js';
import {rebuild} from '../../server/store.mjs';
import {tmpDir,startServer,stopServer,api,Client,waitFor,roomSettings} from '../helpers/mp_server.mjs';
const ok=r=>{assert.equal(r.status,200,r.text);assert.equal(r.json.ok,true,r.text);return r.json;};
const hashes=dir=>Object.fromEntries(fs.readdirSync(dir).filter(n=>fs.statSync(path.join(dir,n)).isFile()).map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,n))).digest('hex')]));
test('v3 real HTTP/SSE automation deltas, strict old-client handshake and old-room non-mutating refusal',async t=>{
 const data=tmpDir();let srv=await startServer({data,args:['--tick-ms','5']}),clients=[];t.after(async()=>{clients.forEach(c=>c.close());await stopServer(srv);});
 const made=await api(srv.base,'/api/rooms',{method:'POST',body:{settings:roomSettings({humans:2,bots:1,days:90})}}),room=ok(made).room,dir=path.join(data,room);
 for(const suffix of ['', '?v=2','?v=99'])assert.equal((await api(srv.base,`/api/r/${room}/events${suffix}`,{cookie:made.cookie})).status,409);
 assert.equal((await api(srv.base,`/api/r/${room}/cmd`,{method:'POST',cookie:made.cookie,body:{v:2,seq:1,name:'setInferShare',args:{v:.2}}})).json.ok,false);
 const joined=await api(srv.base,`/api/r/${room}/join`,{method:'POST',body:{seat:1}});ok(joined);
 const host=new Client(srv.base,room,made.cookie),peer=new Client(srv.base,room,joined.cookie);clients=[host,peer];for(const c of clients)await c.connect();
 await waitFor(()=>host.s&&peer.s);assert.equal(host.events.find(e=>e.type==='init').data.v,PROTOCOL_V);
 ok(await host.roomCmd('start'));await waitFor(()=>host.day>'2024-02-15'&&peer.day>'2024-02-15',15000);ok(await host.roomCmd('pause'));ok(await host.roomCmd('save'));
 const w=rebuild(dir,{fromStart:true,repair:false}).world;
 for(let seat=0;seat<2;seat++){
  const c=clients[seat],s=Object.values(w.companies).find(c=>c.seat===seat).s;
  await waitFor(()=>JSON.stringify(c.s)===JSON.stringify(stripPrivate(s)),3000);
  assert(c.events.some(e=>e.data?.me?.automation?.object),'actual SSE carried nested automation delta');
 }
 for(const c of clients)c.close();await stopServer(srv);
 const meta=JSON.parse(fs.readFileSync(path.join(dir,'meta.json'),'utf8'));meta.v=2;fs.writeFileSync(path.join(dir,'meta.json'),JSON.stringify(meta));
 fs.appendFileSync(path.join(dir,'log.ndjson'),'{"incomplete":');const before=hashes(dir);
 srv=await startServer({data});assert.equal((await api(srv.base,`/api/r/${room}/status`)).status,404);assert.deepEqual(hashes(dir),before,'old protocol room and incomplete tail retained byte-for-byte');
});
