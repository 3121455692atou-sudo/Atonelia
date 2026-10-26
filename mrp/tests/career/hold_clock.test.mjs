import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {holdTick,shouldHold} from '../../src/career/sim/strategy_ai.js';
import {expectPreview} from '../../src/career/sim/expect.js';
import {qOf,worldSota} from '../../src/career/sim/sota.js';
import {addDays} from '../../src/career/sim/clock.js';
function fresh(){
 const s=E.createGame('gpt','y2024',1),w=E.workingModel(s),live=E.liveModel(s);
 s.goals=[];s.evals=[];s.sota.holder={by:'other',q:worldSota(s).q};
 for(const k in live.dims)live.dims[k]=1;
 for(const k in w.dims)w.dims[k]=worldSota(s).q-4;
 w.postDays=90;w.relDays=0;w.postMonths=3;w.stage='post';
 delete s.strategy.hold;
 prime(s);assert.equal(expectPreview(s,w).tier,'champion');assert.ok(['under','under_half'].includes(expectPreview(s,w).result));assert.equal(E.submitBlock(s,w,'main'),'');return {s,w};
}
function prime(s){const w=E.workingModel(s);s.strategy.trail={id:w.id,pts:[[addDays(s.day,-28),qOf(s.mod,w.dims)-1]]};}
function step(s,blocked=false){s.day=addDays(s.day,1);s.date=s.day.slice(0,7);s.evals=blocked?[{line:'main',modelId:E.workingModel(s).id}]:[];prime(s);holdTick(s);}
test('cannot start the hold clock while a main candidate is being evaluated',()=>{const {s,w}=fresh();s.evals=[{line:'main',modelId:w.id}];holdTick(s);assert.equal(s.strategy.hold,undefined);});
test('cannot start while required post-training days are still missing',()=>{const {s,w}=fresh();w.postDays=0;holdTick(s);assert.equal(s.strategy.hold,undefined);});
test('an existing clock keeps the original calendar cap even when later blocked',()=>{const {s}=fresh();holdTick(s);const since=s.strategy.hold.since;for(let i=0;i<20;i++)step(s);assert.equal(shouldHold(s),true);for(let i=0;i<25;i++)step(s,true);assert.equal(s.strategy.hold.since,since);assert.equal(shouldHold(s),false);s.evals=[];prime(s);holdTick(s);assert.equal(shouldHold(s),false);});
test('same-day repeated ticks do not consume or return hold time',()=>{const {s}=fresh();holdTick(s);step(s);const h=structuredClone(s.strategy.hold);holdTick(s);holdTick(s);assert.deepEqual(s.strategy.hold,h);});
test('legacy hold preserves elapsed days rather than granting a fresh window',()=>{const {s,w}=fresh();s.strategy.hold={key:`${w.id}#${w.releases||0}`,since:addDays(s.day,-45)};holdTick(s);assert.equal(shouldHold(s),false);});
test('a newly submitted round waits for evaluation before starting a new clock',()=>{const {s,w}=fresh();holdTick(s);step(s);w.releases=(w.releases||0)+1;s.evals=[{line:'main',modelId:w.id}];holdTick(s);assert.equal(s.strategy.hold,undefined);s.evals=[];prime(s);holdTick(s);assert.equal(s.strategy.hold.since,s.day);assert.equal(shouldHold(s),true);});
