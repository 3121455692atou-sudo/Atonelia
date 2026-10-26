import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {MOD_KEYS,modifier,registerModSource,invalidateMods,capMods} from '../../src/career/sim/modifiers.js';
import {addSpirit,removeSpirit} from '../../src/career/sim/strategy.js';
import {restoreHistory} from '../helpers/world_provider.mjs';
const values=s=>Object.fromEntries(MOD_KEYS.map(key=>[key,modifier(s,key)]));
test('signed source lists are reused only inside the same valid bucket',()=>{
 restoreHistory();const s=E.createGame('qwen','y2025',201);let calls=0;
 registerModSource(state=>{if(state!==s)return [];calls++;return [{train:state.flags.factor,infer:state.flags.factor}];},{id:'perf_signed',sig:state=>String(state.flags.factor),quick:state=>state.flags.factor});
 s.flags.factor=1;const before=values(s);assert.equal(calls,1);
 s.flags.factor=2;const after=values(s);assert.equal(calls,2);assert.equal(after.train,before.train*2);assert.equal(after.infer,before.infer*2);
});
test('every built-in source invalidates on legal same-day mutations and expiry',()=>{
 restoreHistory();const s=E.createGame('deepseek','y2025',202);s.techs=s.techs.filter(x=>x!=='fp8');values(s);
 const edits=[
  ()=>s.techs.push('fp8'),
  ()=>{s.techs=s.techs.filter(x=>x!=='fp8');},
  ()=>{s.route.stance='open';},
  ()=>{s.route.stance='closed';},
  ()=>addSpirit(s,'g_rl_team'),
  ()=>removeSpirit(s,'g_rl_team'),
  ()=>{(s.boosts??=[]).push({train:1.25,post:1.1,'post.agent':1.05,'cap.agent':2,until:'2025-02-01',src:'perf'});},
  ()=>{(s.boosts??=[]).push({infer:1.2,until:'2025-01-03',src:'perf2'});},
  ()=>{s.day='2025-01-03';},
  ()=>{s.boosts=s.boosts.filter(x=>x.until>s.day);},
  ()=>{s.day='2025-02-01';s.date='2025-02';},
  ()=>{s.sota.kin=true;},
  ()=>{s.techRead={...s.techRead,fp8:s.day};},
 ];
 for(const edit of edits){edit();const cached=values(s);invalidateMods(s);assert.deepEqual(cached,values(s));}
});
test('unsigned extensions retain uncached per-key source evaluation',()=>{
 restoreHistory();const s=E.createGame('qwen','y2025',203);let calls=0;
 registerModSource(state=>{if(state!==s)return [];calls++;return [{'cap.agent':calls,'cap.code':calls}];},{id:'perf_unsigned'});
 capMods(s,['agent','code']);assert.equal(calls,2);
 modifier(s,'train');assert.equal(calls,3);modifier(s,'train');assert.equal(calls,4);
});
