import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {Worker} from 'node:worker_threads';
import {roomSettings} from '../helpers/mp_server.mjs';
import {PROTOCOL_V} from '../../src/career/net/protocol.js';
import {createCommandSequence,nextCommandSequence} from '../../src/career/ui/sequence.js';
import {readLog} from '../../server/store.mjs';
globalThis.document={baseURI:'http://localhost/'};
globalThis.EventSource=class{addEventListener(){}close(){}};
globalThis.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
const net=await import('../../src/career/ui/net.js');
const E=await import('../../src/career/engine.js');
const {act,setRemote}=await import('../../src/career/ui/act.js');
const {getMp,setMp}=await import('../../src/career/ui/state.js');
test('sequence entropy is required; 52-bit range and safe-integer exhaustion never overflow',()=>{
 assert.throws(()=>createCommandSequence(null),/安全随机数/);assert.throws(()=>createCommandSequence({getRandomValues(){throw Error('failure');}}),/安全随机数/);
 assert.equal(createCommandSequence({getRandomValues(a){a.fill(0xffffffff);}}),2**52-1);
 const m={seq:Number.MAX_SAFE_INTEGER-1};assert.equal(nextCommandSequence(m),Number.MAX_SAFE_INTEGER);assert.throws(()=>nextCommandSequence(m),/编号已用尽/);assert.equal(m.seq,Number.MAX_SAFE_INTEGER);
 for(const seq of [NaN,Infinity,-1,.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>nextCommandSequence({seq}),/编号/);
});
test('real net plus room: same-millisecond connections execute independently, original retries and seat isolation remain intact',{timeout:15000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mrp-client-seq-'));
 const meta={id:'receipt',created:new Date().toISOString(),v:PROTOCOL_V,lobby:false,phase:'playing',settings:roomSettings({humans:2,bots:1}),host:'a',tokens:{},members:{a:{id:'a',seat:0,approved:true,ready:true,company:{}},b:{id:'b',seat:1,approved:true,ready:true,company:{}}}};meta.settings.companies[0].country='US';
 const worker=new Worker(new URL('../../server/room.mjs',import.meta.url),{workerData:{dir,mode:'new',meta,tickMs:100000}});
 let next=0;const pending=new Map();await new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.t==='ready')resolve();if(m.t==='res'){pending.get(m.id)?.(m.res);pending.delete(m.id);}});worker.once('error',reject);});
 const call=payload=>new Promise(resolve=>{const id=++next;pending.set(id,resolve);worker.postMessage({...payload,id});});
 const now=Date.now,fetch=globalThis.fetch,random=globalThis.crypto.getRandomValues,requests=[];let nonce=0;
 try{
  Date.now=()=>1792949844123;globalThis.crypto.getRandomValues=a=>{a[0]=0;a[1]=++nonce*1000;return a;};
  for(const actor of ['a','b'])assert.equal((await call({t:'presence',actor,online:true})).ok,true);
  globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options.body);requests.push(body);const json=await call({t:'cmd',actor:'a',body});return {status:200,json:async()=>json};};
  const one=net.rejoin('abcdef');await act(null,'buyGpu',{id:'A100',n:1});const first=await call({t:'status'});
  const two=net.rejoin('abcdef');await act(null,'buyGpu',{id:'A100',n:2});const second=await call({t:'status'});
  assert.notEqual(one.seq,two.seq);assert.notEqual(first.hash,second.hash);assert.deepEqual(requests.map(x=>x.seq),[1001,2001]);assert.equal(readLog(dir).filter(e=>e.t==='cmd').length,2);
  // Replay the ORIGINAL payload with the ORIGINAL seq: never debit again.
  const replay=await call({t:'cmd',actor:'a',body:requests[0]});assert.equal(replay.ok,true);assert.equal((await call({t:'status'})).hash,second.hash);
  // Existing changed-payload identity semantics stay unchanged too.
  const conflicting=await call({t:'cmd',actor:'a',body:{...requests[0],args:{id:'A100',n:99}}});assert.deepEqual(conflicting,replay);assert.equal((await call({t:'status'})).hash,second.hash);
  const other=await call({t:'cmd',actor:'b',body:{...requests[0],name:'setInferShare',args:{v:.3}}});assert.equal(other.ok,true);assert.equal(other.result,undefined);assert.notEqual((await call({t:'status'})).hash,second.hash);
  two.seq=Number.MAX_SAFE_INTEGER;const sent=requests.length;await assert.rejects(act(null,'buyGpu',{id:'A100',n:1}),/编号/);assert.equal(requests.length,sent);
  const local=E.createGame('deepseek','y2025',3),beforeLocal=JSON.stringify(local);await assert.rejects(act(local,'setInferShare',{v:.25}),/编号/);assert.equal(JSON.stringify(local),beforeLocal,'exhausted sequence cannot optimistically mutate the mirror');
  await assert.rejects(act(null,'setProduct',{id:'chat',patch:{on:true}}),/编号/);assert.equal(two.productRequests.size,0);assert.equal(requests.length,sent);
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');Object.defineProperty(globalThis,'crypto',{value:undefined,configurable:true});try{assert.throws(()=>net.rejoin('abcdef'),/安全随机数/);assert.equal(getMp(),two,'failed initialization does not replace active connection');}finally{Object.defineProperty(globalThis,'crypto',descriptor);}
 }finally{Date.now=now;globalThis.fetch=fetch;globalThis.crypto.getRandomValues=random;setRemote(null);setMp(null);await worker.terminate();fs.rmSync(dir,{recursive:true,force:true});}
});
