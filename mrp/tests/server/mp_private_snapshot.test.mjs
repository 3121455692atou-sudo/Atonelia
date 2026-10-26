import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {stripPrivate,diffState,applyDiff} from '../../src/career/net/protocol.js';
// Exercise the actual room function, with only its worker globals supplied.
// No server test hook or alternate production implementation is introduced.
const source=fs.readFileSync(new URL('../../server/room.mjs',import.meta.url),'utf8');
const start=source.indexOf('function privateDiff(seat) {'),end=source.indexOf('\nfunction flushPrivate',start);
assert(start>=0&&end>start);
const make=new Function('world','rt','stripPrivate','diffState','prevPriv','clone',source.slice(start,end)+';return privateDiff;');
test('unchanged private view reuses its independent snapshot; changed views still clone and reconstruct exactly',()=>{
 const s={day:'2024-01-01',rng:7,seed:11,models:[{id:'m',dims:{math:10},post:{own:0,dist:0,teachers:{}}}],automation:{recent:[],receipts:[],lastDay:'2024-01-01'},postRandom:{version:1,runSeed:99,lastTickDay:'2024-01-01'}};
 const world={companies:{a:{s}}},rt={players:{0:{id:'a'}}},prevPriv=new Map([[0,structuredClone(stripPrivate(s))]]);let clones=0;
 const privateDiff=make(world,rt,stripPrivate,diffState,prevPriv,x=>{clones++;return structuredClone(x);});
 let client=structuredClone(prevPriv.get(0));const initial=prevPriv.get(0);
 for(let i=0;i<100;i++)assert.equal(privateDiff(0),null);assert.equal(clones,0);assert.equal(prevPriv.get(0),initial);
 s.rng++;s.seed++;s.postRandom.runSeed++;assert.equal(privateDiff(0),null);assert.equal(clones,0,'non-wire seed changes do not require snapshot copies');
 for(const change of [()=>s.models[0].dims.math++,()=>s.automation.recent.push({day:s.day,reason:'changed'}),()=>delete s.automation.receipts,()=>s.day='2024-01-02']){
  change();const count=clones,d=privateDiff(0);assert(d);assert.equal(clones,count+1);client=applyDiff(client,d);assert.equal(JSON.stringify(client),JSON.stringify(stripPrivate(s)));assert.notEqual(prevPriv.get(0).models,s.models);assert.equal(privateDiff(0),null);assert.equal(clones,count+1);
 }
});
