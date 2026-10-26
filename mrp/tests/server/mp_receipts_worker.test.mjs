import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {roomSettings} from '../helpers/mp_server.mjs';
import {PROTOCOL_V} from '../../src/career/net/protocol.js';
import {readLog,rebuild} from '../../server/store.mjs';

async function start(dir, mode='new') {
 const meta={id:'receipt',created:new Date().toISOString(),v:PROTOCOL_V,lobby:false,phase:'playing',settings:roomSettings({humans:2,bots:1}),host:'a',tokens:{},members:{a:{id:'a',seat:0,approved:true,ready:true,company:{}},b:{id:'b',seat:1,approved:true,ready:true,company:{}}}};
 meta.settings.companies[0].country='US';
 const worker=new Worker(new URL('../../server/room.mjs',import.meta.url),{workerData:{dir,mode,meta,tickMs:100000}});
 let next=0;const pending=new Map();
 const ready=new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.t==='ready')resolve();if(m.t==='res'){pending.get(m.id)?.(m.res);pending.delete(m.id);}});worker.once('error',reject);worker.once('exit',code=>{if(code)reject(Error('worker exit '+code));});});
 await ready;
 return {worker,call(payload){return new Promise(resolve=>{const id=++next;pending.set(id,resolve);worker.postMessage({...payload,id});});}};
}
test('successful receipts survive 256-cache eviction, changed-payload retries and worker restart without repeating purchase',{timeout:30000},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mrp-receipts-'));let w=await start(dir);t.after(async()=>{await w.worker.terminate();fs.rmSync(dir,{recursive:true,force:true});});
 for(const actor of ['a','b'])assert.equal((await w.call({t:'presence',actor,online:true})).ok,true);
 const cmd=(seq,name,args,actor='a')=>w.call({t:'cmd',actor,body:{v:PROTOCOL_V,seq,name,args}});
 const first=await cmd(1,'buyGpu',{id:'A100',n:1});assert.equal(first.ok,true,JSON.stringify(first));assert.ok(first.result);
 for(let seq=2;seq<=260;seq++)assert.equal((await cmd(seq,'setInferShare',{v:.2})).ok,true);
 const before=await w.call({t:'status'});
 const retries=await Promise.all([cmd(1,'buyGpu',{id:'A100',n:2}),cmd(1,'buyGpu',{id:'A100',n:3})]);
 retries.forEach(r=>assert.deepEqual(r,first));
 assert.deepEqual(await cmd(1,'buyGpu',{id:'A100',n:2}),first,'same seq returns original receipt even for different payload');
 assert.equal((await w.call({t:'status'})).hash,before.hash,'no second purchase');
 const other=await cmd(1,'setInferShare',{v:.3},'b');assert.equal(other.ok,true);assert.equal(other.result,undefined,'seat-scoped receipt must not disclose another player result');
 assert.equal((await cmd(Number.MAX_SAFE_INTEGER+1,'setInferShare',{v:.4})).ok,false);
 // Reconnecting the same identity retains its receipt. Kicking a player
 // does not free that company's seat for a new identity.
 await w.call({t:'presence',actor:'a',online:false});
 await w.call({t:'presence',actor:'a',online:true});
 assert.deepEqual(await cmd(1,'buyGpu',{id:'A100',n:9}),first);
 assert.equal((await w.call({t:'room',actor:'a',name:'kick',args:{member:'b'}})).ok,true);
 assert.equal((await cmd(1,'setInferShare',{v:.4},'b')).ok,false,'kicked identity cannot obtain any receipt');
 assert.equal((await w.call({t:'join',memberId:'c',tokenHash:'new-c',body:{seat:1}})).ok,false,'kicked seat cannot be recycled');
 const bot=Object.values(rebuild(dir,{fromStart:true,repair:false}).world.companies).find(c=>c.kind==='bot');
 assert.equal((await w.call({t:'join',memberId:'c',tokenHash:'new-c',body:{companyId:bot.id}})).ok,true);
 const takeover=await w.call({t:'room',actor:'a',name:'approveSeat',args:{member:'c',companyId:bot.id}});
 assert.equal(takeover.ok,true);assert.equal(takeover.seat,2,'takeover appends a distinct seat');
 await w.call({t:'presence',actor:'c',online:true});
 const takeoverCmd=await cmd(1,'setInferShare',{v:.4},'c');assert.equal(takeoverCmd.ok,true);assert.equal(takeoverCmd.result,undefined);
 const state=await w.call({t:'status'});await w.worker.terminate();w=await start(dir,'resume');
 assert.deepEqual(await cmd(1,'buyGpu',{id:'A100',n:3}),first,'restart preserves original result');
 assert.equal((await w.call({t:'status'})).hash,state.hash);
 assert.equal(rebuild(dir,{fromStart:true,repair:false}).world.hash(),state.hash,'full WAL replay agrees with live world');
 assert.equal(rebuild(dir,{fromStart:false,repair:false}).world.hash(),state.hash,'snapshot replay agrees with live world');
 assert.equal(readLog(dir).filter(e=>e.t==='cmd'&&e.seat===0&&e.cseq===1).length,1);
 // A current-format log from before receipt capture remains deduplicated;
 // missing historical result data is not fabricated or migrated.
 await w.worker.terminate();
 const log=readLog(dir);for(const e of log)delete e.receipt;
 fs.writeFileSync(path.join(dir,'log.ndjson'),log.map(e=>JSON.stringify(e)).join('\n')+'\n');
 w=await start(dir,'resume');
 assert.deepEqual(await cmd(1,'buyGpu',{id:'A100',n:4}),{ok:true,seq:1,day:first.day});
 assert.equal((await w.call({t:'status'})).hash,state.hash);
 assert.equal(readLog(dir).filter(e=>e.t==='cmd'&&e.seat===0&&e.cseq===1).length,1);
});
