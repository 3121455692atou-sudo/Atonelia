import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {monthsBetween} from '../../src/career/data/core.js';
import {withModelReadSnapshot,hardness} from '../../src/career/sim/model.js';
import {restoreHistory} from '../helpers/world_provider.mjs';
import {P,setProvider,HistoryProvider} from '../../src/career/sim/provider.js';
import {resolveAll} from '../../src/career/sim/bot.js';
const original=(a,b)=>{const [ya,ma]=a.split('-').map(Number),[yb,mb]=b.split('-').map(Number);return (yb-ya)*12+(mb-ma);};
test('bounded month parsing preserves original values, coercion and arithmetic',()=>{
 const keys=['2024-01','2024-02-29','2026-12','bad','','1.5-2.25','-1-01','2024-13'];
 for(let n=0;n<700;n++) keys.push(`${1900+n}-03`);
 for(const a of keys) for(const b of ['2025-05','bad','1.1-2.2'])assert.ok(Object.is(monthsBetween(a,b),original(a,b)));
 let calls=0;const mutable={split(){calls++;return [String(calls),'1'];}};
 assert.equal(monthsBetween(mutable,'2024-01'),(2024-1)*12);
 assert.equal(monthsBetween(mutable,'2024-01'),(2024-2)*12);
 assert.throws(()=>monthsBetween(null,'2024-01'),TypeError);
});
test('read scope matches uncached curve and discards same-day data changes',()=>{
 restoreHistory();const s=E.createGame('deepseek','y2025',91),other=E.createGame('qwen','y2025',92);
 const raw=JSON.stringify(s),a=hardness(s),b=hardness(other);
 withModelReadSnapshot(s,()=>{assert.deepEqual(hardness(s),a);withModelReadSnapshot(other,()=>assert.deepEqual(hardness(other),b));assert.deepEqual(hardness(s),a);});
 assert.equal(JSON.stringify(s),raw);
 s.know+=500;const changed=hardness(s);assert.deepEqual(withModelReadSnapshot(s,()=>hardness(s)),changed);
 assert.throws(()=>withModelReadSnapshot(s,()=>{hardness(s);throw Error('stop');}),/stop/);
 s.know+=500;assert.deepEqual(withModelReadSnapshot(s,()=>hardness(s)),hardness(s));
});
test('nested reads invalidate the enclosing snapshot and async continuation keeps no scope',async()=>{
 restoreHistory();const s=E.createGame('deepseek','y2025',93),other=E.createGame('qwen','y2025',94);
 const nestedResult=withModelReadSnapshot(s,()=>{
  hardness(s);
  withModelReadSnapshot(other,()=>{s.know+=100;hardness(other);});
  return hardness(s);
 });
 assert.deepEqual(nestedResult,hardness(s));
 let resume;const wait=new Promise(resolve=>{resume=resolve;});
 const pending=withModelReadSnapshot(s,async()=>{hardness(s);await wait;return hardness(s);});
 s.know+=300;const expected=hardness(s);resume();assert.deepEqual(await pending,expected);
});
test('nested provider switches cannot revive an old company curve',()=>{
 restoreHistory();const s=E.createGame('qwen','y2025',95),previous=P();
 class ChangedReference extends HistoryProvider { effortRef(...args){return super.effortRef(...args)*100;} }
 try {
  const before=hardness(s);
  const changed=withModelReadSnapshot(s,()=>{
   hardness(s);
   withModelReadSnapshot(s,()=>setProvider(new ChangedReference()));
   return hardness(s);
  });
  assert.deepEqual(changed,hardness(s));assert.notEqual(changed.fComp,before.fComp);
 } finally {setProvider(previous);}
});
test('actual advisor pipeline is read-only across companies and same-day edits',()=>{
 restoreHistory();
 for(const id of ['qwen','deepseek','gpt']) {
  const s=E.createGame(id,'y2025',96);resolveAll(s);
  for(let day=0;day<10 && s.status==='playing';day++) {
   resolveAll(s);
   for(const edit of [()=>{},()=>{s.know+=1;},()=>{s.cash+=1;}]) {
    edit();const raw=JSON.stringify(s);const advice=E.advise(s);
    assert.equal(JSON.stringify(s),raw);assert.deepEqual(E.advise(s),advice);
   }
   E.tickDay(s);
  }
 }
});
