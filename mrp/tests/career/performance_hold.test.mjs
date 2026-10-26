import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {holdTick,shouldHold,recentGain} from '../../src/career/sim/strategy_ai.js';
import {expectPreview} from '../../src/career/sim/expect.js';
import {qOf} from '../../src/career/sim/sota.js';
import {BOT} from '../../src/career/data/balance.js';
import {addDays,daysBetween} from '../../src/career/sim/clock.js';
import {restoreHistory} from '../helpers/world_provider.mjs';
const key=w=>`${w.id}#${w.releases||0}`;
function originalHoldTick(s){
 const S=s.strategy,w=E.workingModel(s);
 if(!S||!w||w.stage!=='post'){if(S?.trail)delete S.trail;if(S?.hold)delete S.hold;return;}
 if(S.trail?.id!==w.id)S.trail={id:w.id,pts:[]};
 const pts=S.trail.pts;
 if(!pts.length||daysBetween(pts.at(-1)[0],s.day)>=7)pts.push([s.day,Math.round(qOf(s.mod,w.dims)*100)/100]);
 while(pts.length>1&&daysBetween(pts[0][0],s.day)>33)pts.shift();
 const p=expectPreview(s,w);
 const board=(s.goals||[]).some(g=>g.status==='pending'&&typeof g.date==='string'&&/^\d{4}-\d{2}$/.test(g.date)&&daysBetween(s.day,`${g.date}-01`)<=BOT.HOLD_MAX_DAYS);
 if(p&&p.tier==='champion'&&['under','under_half'].includes(p.result)&&recentGain(s,w)>=.3&&!board){
  if(S.hold?.key!==key(w)){if(!E.submitBlock(s,w,'main'))S.hold={key:key(w),since:s.day};else if(S.hold)delete S.hold;}
 }else if(S.hold)delete S.hold;
}
test('short-circuit hold tick exactly matches original eager rule across board/gain/round fixtures',()=>{
 restoreHistory();
 for(const id of ['qwen','gpt','gemini'])for(let i=0;i<12;i++){
  const s=E.createGame(id,'y2025',301+i),w=E.workingModel(s);w.stage='post';
  s.goals=i%3===0?[]:s.goals;
  s.strategy.trail={id:w.id,pts:[[addDays(s.day,-28),qOf(s.mod,w.dims)-(i%4)*.2]]};
  if(i%2)s.strategy.hold={key:key(w),since:addDays(s.day,-i*5)};
  const expected=structuredClone(s);originalHoldTick(expected);holdTick(s);assert.deepEqual(structuredClone(s),expected,`${id}/${i}`);
 }
});
test('explicit preview callback retains its invocation semantics despite failing gain gate',()=>{
 restoreHistory();const s=E.createGame('gpt','y2025',320),w=E.workingModel(s);w.stage='post';delete s.strategy.trail;let n=0;
 assert.equal(shouldHold(s,{preview:()=>{n++;return {tier:'champion',result:'under'};}}),false);assert.equal(n,1);
});

test('fast rejection still rejects malformed expectation ledgers',()=>{
 restoreHistory();const s=E.createGame('gpt','y2025',321);E.workingModel(s).stage='post';delete s.strategy.trail;s.expect={};
 assert.throws(()=>shouldHold(s),/市场期待字段/);assert.throws(()=>holdTick(s),/市场期待字段/);
});
