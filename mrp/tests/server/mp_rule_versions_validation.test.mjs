import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { roomSettings, tmpDir } from '../helpers/mp_server.mjs';
import { currentStart } from '../helpers/mp_current_start.mjs';
import { replayEntry, rebuild } from '../../server/store.mjs';
import { P, setProvider, HistoryProvider } from '../../src/career/sim/provider.js';
import * as E from '../../src/career/engine.js';

const start=()=>currentStart({settings:roomSettings({humans:1,bots:1,days:3}),endVersion:1,autoPostVersion:1,automationVersion:6,postTraining:{mode:'random',version:1},postTrainingSeed:41});
const bytes=dir=>Object.fromEntries(fs.readdirSync(dir).sort().map(f=>[f,fs.readFileSync(path.join(dir,f)).toString('base64')]));
const set=(obj,key,value)=>{if(value===undefined)delete obj[key];else obj[key]=value;};
const invalid={endVersion:[undefined,0,null,2,'1'],autoPostVersion:[undefined,0,null,2,'1'],automationVersion:[undefined,null,7,'6']};

test('WAL start rules are mandatory before direct replay even with an existing world',()=>{
 const active=replayEntry(null,start()),activeBytes=E.serialize(active);
 for(const [key,values] of Object.entries(invalid))for(const value of values)for(const world of [null,active]) {
  const entry=start();set(entry.args,key,value);const before=structuredClone(entry),sentinel=new HistoryProvider();setProvider(sentinel);
  assert.throws(()=>replayEntry(world,entry),/规则版本|托管版本/);assert.deepEqual(entry,before);assert.equal(P(),sentinel);assert.equal(E.serialize(active),activeBytes);
 }
});

test('snapshot-covered old starts fail preflight without repairing a partial WAL or installing Provider',()=>{
 const good=start(),raw=E.deserialize(E.serialize(replayEntry(null,good)));
 for(const [key,values] of Object.entries(invalid))for(const value of values)for(const fromStart of [false,true]) {
  const dir=tmpDir();try {
   const entry=structuredClone(good);set(entry.args,key,value);
   fs.writeFileSync(path.join(dir,'log.ndjson'),JSON.stringify({...entry,n:1})+'\n{"partial":');
   fs.writeFileSync(path.join(dir,'snap-000000001.json.gz'),zlib.gzipSync(JSON.stringify({logN:1,text:JSON.stringify(raw),runtime:good.state})));
   fs.writeFileSync(path.join(dir,'meta.json'),' {"retain":true} \n');
   const before=bytes(dir),sentinel=new HistoryProvider();setProvider(sentinel);
   assert.throws(()=>rebuild(dir,{fromStart}),/规则版本|托管版本/);assert.deepEqual(bytes(dir),before);assert.equal(P(),sentinel);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
 }
});

test('raw snapshots with old or missing world rules are rejected before provider mutation',()=>{
 const entry=start(),raw=E.deserialize(E.serialize(replayEntry(null,entry)));
 for(const key of ['endVersion','autoPostVersion'])for(const value of [undefined,0,2,null]) {
  const dir=tmpDir();try {
   const doc=structuredClone(raw);set(doc.world,key,value);
   fs.writeFileSync(path.join(dir,'log.ndjson'),JSON.stringify({...entry,n:1})+'\n{"partial":');
   fs.writeFileSync(path.join(dir,'snap-000000001.json.gz'),zlib.gzipSync(JSON.stringify({logN:1,text:JSON.stringify(doc),runtime:entry.state})));
   const before=bytes(dir),sentinel=new HistoryProvider();setProvider(sentinel);
   assert.throws(()=>rebuild(dir),/不支持的规则版本/);assert.deepEqual(bytes(dir),before);assert.equal(P(),sentinel);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
 }
});

test('explicit automation selection remains a current interface, never a missing-version default',()=>{
 for(const version of [0,1,2,3,4,5,6]) {
  const entry=start();entry.args.automationVersion=version;
  const world=replayEntry(null,entry);assert.equal(world.endVersion,1);assert.equal(world.autoPostVersion,1);
  assert.equal(world.settings.automationVersion,version||undefined);
  const loaded=E.migrateWorld(E.serialize(world));assert.equal(loaded.ok,true,loaded.reason);assert.equal(E.serialize(loaded.world),E.serialize(world));
 }
 const entry=start();entry.args.settings.automationVersion=1;const before=structuredClone(entry),sentinel=new HistoryProvider();setProvider(sentinel);
 assert.throws(()=>replayEntry(null,entry),/托管规则版本不一致/);assert.deepEqual(entry,before);assert.equal(P(),sentinel);
});
