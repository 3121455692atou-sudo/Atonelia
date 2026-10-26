import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { finalWealth } from '../../src/career/world/exchange.js';
import { initComputeLedger } from '../../src/career/sim/economy.js';
import { restoreHistory } from '../helpers/world_provider.mjs';
after(() => restoreHistory());
const make = (extra = {}) => E.createWorld({ seed: 11, start: '2024-01', days: 2,
  companies: ['晨星', '北岭', '蓝鲸'].map(name => ({ name: name+'智能', brand: name, country:'CN', tier:'specialist', kind:'bot' })), ...extra });
const restored = w => { const r=E.migrateWorld(E.deserialize(E.serialize(w))); assert.equal(r.ok,true,r.reason); return r.world; };
test('inclusive final-day close, wealth standings, all playing companies end; repeated tick/commands immutable', () => {
  const w=make(); assert.equal(w.end,'2024-01-02');
  assert.equal(w.tick().ended,undefined); assert.equal(w.day,'2024-01-02');
  assert.equal(w.tick().ended,true); assert.equal(w.day,'2024-01-03'); assert.equal(w.tickNo,2);
  assert.equal(w.result.settledThrough,w.end); assert.equal(w.result.overdue,false);
  for(const c of Object.values(w.companies)) { assert.equal(c.s.status,'ended'); assert.equal(c.s.result.wealth,finalWealth(w,c.s)); assert.equal(c.s.result.kind,'world'); }
  const before=E.serialize(w); for(let i=0;i<3;i++) assert.equal(w.tick().ended,true);
  const id=Object.keys(w.companies)[0]; assert.equal(w.command(id,{name:'noop'}),0); assert.equal(E.applyNow(w,id,{name:'noop'}).ok,false);
  assert.equal(E.serialize(w),before); assert.deepEqual(w.publicView().result,w.result);
});
test('finalized current save round trip and repeated tick remain identical', () => {
 const w=make(); w.tick(); const r=restored(w); r.tick(); const loaded=restored(r);
 const before=E.serialize(loaded); loaded.tick(); assert.equal(E.serialize(loaded),before); assert.deepEqual(loaded.result,r.result);
});
test('multiplayer humans and bots finalize without pending inbox blocking final day', () => {
 const w=make({mp:true,days:1}); const c=Object.values(w.companies)[0]; c.kind='human'; c.s.queue.push({kind:'notice',title:'test'});
 w.tick(); assert.equal(w.result.settledThrough,'2024-01-01'); assert.ok(Object.values(w.companies).every(c=>c.s.status==='ended'));
});
test('overdue current world preserves date/assets/tickNo and prior failure, settles only once', () => {
 const w=make(); w.day='2025-04-03'; const cs=Object.values(w.companies);
 cs[0].s.status='ended'; cs[0].s.result={reason:'bankrupt',rank:'G',total:0};
 cs[1].s.status='crashed'; const oldFailure=JSON.stringify(cs[0].s); const oldCrash=JSON.stringify(cs[1].s);
 const cash=cs[2].s.cash; const count=w.tickNo; w.commands.push({at:w.day,id:cs[2].id,cmd:{name:'noop'}});
 w.tick(); assert.equal(w.day,'2025-04-03'); assert.equal(w.tickNo,count); assert.equal(cs[2].s.cash,cash);
 assert.equal(w.result.overdue,true); assert.equal(w.result.settledThrough,'2025-04-02');
 assert.equal(JSON.stringify(cs[0].s),oldFailure); assert.equal(JSON.stringify(cs[1].s),oldCrash);
 const before=E.serialize(w); w.tick(); assert.equal(E.serialize(w),before);
});
test('finalizer before boundary is no-op; single human event still pauses within duration', () => {
 const w=make(); const c=Object.values(w.companies)[0]; c.kind='human'; c.s.queue.push({kind:'notice'});
 const before=E.serialize(w); assert.equal(E.finishWorld(w),null); assert.equal(w.tick().paused,true); assert.equal(E.serialize(w),before);
});
test('global END also uses world wealth rather than historical letter grade', () => {
 const w=make({days:1095}); w.day='2026-10-31';
 // This fixture begins on the last day; it does not invent charges for skipped days.
 for(const c of Object.values(w.companies)){ c.s.day=w.day; c.s.date='2026-10'; c.s.computeLedger=initComputeLedger(c.s.date); }
 w.tick(); assert.equal(w.end,'2026-10-31'); assert.equal(w.day,'2026-11-01');
 assert.ok(Object.values(w.companies).every(c=>c.s.result?.kind==='world')); assert.equal(w.result.overdue,false);
});
test('wealth uses authoritative listed/unlisted/liquidation values and stable ID tie break', () => {
 const w=make(); w.day='2024-01-03'; const cs=Object.values(w.companies);
 for(const c of cs) { c.s.valuation=100; c.s.equity=0.5; }
 w.exchange.listings ??= {};
 w.exchange.listings[cs[1].id]={org:cs[1].id};
 w.ix.restr[cs[2].id]={liquidated:true,liqValue:10};
 E.finishWorld(w); assert.deepEqual(w.result.standings.map(r=>r.wealth),[50,40,5]);
 const tie=make();tie.day='2024-01-03'; for(const c of Object.values(tie.companies)) {c.s.valuation=100;c.s.equity=.5;}
 E.finishWorld(tie);assert.deepEqual(tie.result.standings.map(r=>r.id),Object.keys(tie.companies).sort());
});
test('last-day transfer settles before finalization, pending inbox retained and event commands rejected', () => {
 const w=make({mp:true,days:1}); const cs=Object.values(w.companies); const c=cs[0];c.kind='human';
 c.s.queue.push({kind:'notice',title:'终局未决事件'});
 w.ix.pending.push({day:w.day,from:cs[1].id,to:c.id,usd:100,kind:'test'});
 w.tick(); assert.equal(w.ix.pending.length,0);
 assert.ok(w.ix.recent.some(t=>t.to===c.id&&t.booked===60),'final closeDay must settle transfer while recipient still playing');
 assert.ok(c.s.queue.some(q=>q.title==='终局未决事件'));assert.ok(c.s.result.pendingEvents>0);
 const before=E.serialize(w); assert.equal(E.applyNow(w,c.id,{name:'resolveEvent',args:{choiceId:'ok',at:0}}).ok,false);
 assert.equal(E.applyCommand(c.s,{name:'resolveEvent',args:{choiceId:'ok',at:0}}).ok,false);assert.equal(E.autoResolve(w,c.id),null);
 assert.equal(E.serialize(w),before);
});
test('single-player final-day existing card cannot be skipped', () => {
 const w=make({days:1}); const c=Object.values(w.companies)[0];c.kind='human';c.s.queue=[{kind:'notice',title:'截止前先处理'}];
 assert.equal(w.tick().paused,true);assert.equal(w.result,undefined);assert.equal(w.tickNo,0);
 assert.equal(E.applyNow(w,c.id,{name:'resolveEvent',args:{choiceId:'ok',at:0}}).ok,true);
 w.tick();assert.equal(w.result.settledThrough,'2024-01-01');assert.equal(w.tickNo,1);
});
test('old and missing end rules reject without finalizing or upgrading a world', () => {
 for(const mp of [false,true]) {
  assert.throws(()=>make({mp,endVersion:0}),/不支持的规则版本/);
  for(const value of [undefined,0]) {
   const w=make({mp,days:1});w.day='2024-01-03';
   if(value===undefined)delete w.endVersion;else w.endVersion=value;
   const before=E.serialize(w);assert.throws(()=>E.finishWorld(w),/不支持的规则版本/);assert.equal(E.serialize(w),before);
   const loaded=E.migrateWorld(before);assert.equal(loaded.ok,false);assert.match(loaded.reason,/不支持的规则版本/);
  }
 }
 assert.equal(E.upgradeSoloWorldEnd,undefined);
});
test('terminal result survives public/private protocol diffs and replay uses authoritative ranking', async () => {
 const { diffState,applyDiff }=await import('../../src/career/net/protocol.js');
 globalThis.document ??= {baseURI:'http://localhost/'};
 const { renderReplay }=await import('../../src/career/ui/pages/replay.js');
 const w=make({days:1,mp:true});const id=Object.keys(w.companies)[0];const pub0=w.publicView(), priv0=w.privateView(id);
 w.tick(); const pub=w.publicView(),priv=w.privateView(id);
 assert.deepEqual(applyDiff(pub0,diffState(pub0,pub)),pub);assert.deepEqual(applyDiff(priv0,diffState(priv0,priv)),priv);
 const end={day:w.day,companies:Object.keys(w.companies).map(id=>w.privateView(id)),lineage:[]};
 const html=renderReplay({pub,end});
 const table=html.slice(html.indexOf('<tbody>'),html.indexOf('</tbody>'));
 const positions=w.result.standings.map(row=>table.indexOf(row.name));
 assert.ok(positions.every((p,i)=>p>=0 && (i===0||p>positions[i-1])));
 // An in-progress replay without terminal metadata can still be rendered.
 delete pub.result;for(const c of end.companies) delete c.s.result;
 assert.ok(renderReplay({pub,end}).includes('终局'));
});
test('historical global END still produces historical score', () => {
 restoreHistory();const s=E.createGame('qwen','y2024',11);s.day='2026-10-31';s.date='2026-10';s.computeLedger=initComputeLedger(s.date);s.queue=[];
 E.tickDay(s);assert.equal(s.status,'ended');assert.equal(s.result.reason,'complete');assert.ok(s.result.rank);assert.equal(typeof s.result.total,'number');assert.equal(s.result.kind,undefined);
});
