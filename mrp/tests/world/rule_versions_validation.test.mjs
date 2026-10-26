import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {companiesSnapshot} from '../../src/career/sim/provider.js';
import {RELEASES} from '../../src/career/data/rivals.js';
import {restoreHistory} from '../helpers/world_provider.mjs';
after(restoreHistory);
const base={seed:11,start:'2024-01',days:2,companies:[{name:'版本实测',brand:'版本',country:'EU',tier:'specialist',kind:'bot'}]};
const keys=['endVersion','autoPostVersion'];
const invalid=[0,2,-1,'1',null,{},[],true,NaN,Infinity,1.5];
const snapshot=()=>({p:E.P(),c:companiesSnapshot(),r:JSON.stringify(RELEASES)});
const unchanged=x=>{assert.equal(E.P(),x.p);assert.deepEqual(companiesSnapshot(),x.c);assert.equal(JSON.stringify(RELEASES),x.r);};
for(const key of keys) for(const [i,value] of invalid.entries()) test(`${key} invalid case ${i}: creation, load and finalizer fail closed`,()=>{
 const active=E.createWorld(base),state=snapshot(),activeBytes=E.serialize(active);
 for(const mode of ['zero','fork']) {
  const settings={...base,mode,[key]:value},before=structuredClone(settings);
  assert.throws(()=>E.createWorld(settings),/不支持的规则版本/);assert.deepEqual(settings,before);unchanged(state);
 }
 for(const loc of ['world','settings','worldSettings']) {
  const doc=E.deserialize(E.serialize(active));(loc==='world'?doc.world:loc==='settings'?doc.settings:doc.world.settings)[key]=value;
  const before=structuredClone(doc),r=E.migrateWorld(doc);assert.equal(r.ok,false);assert.match(r.reason,/不支持的规则版本/);assert.deepEqual(doc,before);unchanged(state);
 }
 const world=E.deserialize(activeBytes).world;world[key]=value;
 const before=structuredClone(world);assert.throws(()=>E.finishWorld(world),/不支持的规则版本/);assert.deepEqual(world,before);unchanged(state);
 assert.equal(E.serialize(active),activeBytes);
});
test('new-game defaults initialize current rules, but persisted missing rules are never synthesized',()=>{
 for(const explicit of [false,true]) {
  const w=E.createWorld({...base,...(explicit?{endVersion:1,autoPostVersion:1}:{})});
  assert.equal(w.endVersion,1);assert.equal(w.autoPostVersion,1);
  const saved=E.serialize(w),r=E.migrateWorld(saved);assert.equal(r.ok,true,r.reason);assert.equal(E.serialize(r.world),saved);
  for(const key of keys) {
   const doc=E.deserialize(saved);delete doc.world[key];const before=structuredClone(doc),state=snapshot();
   const loaded=E.migrateWorld(doc);assert.equal(loaded.ok,false);assert.match(loaded.reason,/不支持的规则版本/);assert.deepEqual(doc,before);unchanged(state);
   assert.throws(()=>E.finishWorld(doc.world),/不支持的规则版本/);assert.deepEqual(doc,before);
  }
 }
 assert.equal(E.upgradeSoloWorldEnd,undefined);assert.equal(E.upgradeSoloAutoPost,undefined);
});
