import test from 'node:test';
import assert from 'node:assert/strict';
import {jobCardCounts} from '../../src/career/ui/job_card_counts.js';
import * as E from '../../src/career/engine.js';
import {resolveAll} from '../helpers/career_bot.mjs';
globalThis.document ??= {baseURI:'http://localhost/'};
const {allocBar}=await import('../../src/career/ui/pages/train.js');
const item=(id,cards,extra={})=>({job:{id,prio:'normal'},cards,run:true,wantCards:cards,minCards:0,...extra});
function check(al) {
 const before=JSON.stringify(al),d=jobCardCounts(al);
 assert.equal(d.used,Math.round(al.items.reduce((sum,it)=>sum+(it.run?it.cards:0),0)));
 assert.equal(d.rows.reduce((sum,r)=>sum+r.got,0),d.used);assert.equal(d.used+d.idle,d.total);assert(d.used<=d.total);assert(d.idle>=0);
 assert.deepEqual(d.rows.map(r=>r.it),al.items,'priority/sequence order unchanged');
 for(const r of d.rows) {
  assert(Number.isInteger(r.got));assert(r.got>=0);
  if(!r.it.run)assert.equal(r.got,0);
  else {assert(r.got>=Math.floor(r.exact));assert(r.got<=Math.ceil(r.exact));assert(r.got>=r.it.minCards);if(r.want!==null)assert(r.got<=r.want);}
 }
 assert.equal(JSON.stringify(al),before,'only display changes, no allocation write');return d;
}
test('whole-card display reconciles 54.4+118.4=172.8 to 173, without exceeding rounded wants',()=>{
 const d=check({T:5376,items:[item('base',54.4),item('post',118.4)]});assert.equal(d.used,173);assert.deepEqual(d.rows.map(r=>r.got),[55,118]);assert.equal(d.rows[1].want,119);
});
test('largest remainder is stable; exact tie keeps allocation priority; queued/paused stay zero',()=>{
 const a=item('priority',1.4,{minCards:1}),b=item('normal',1.4,{minCards:1});
 const d=check({T:3,items:[a,b,item('queue',0,{run:false}),item('pause',0,{run:false})]});assert.deepEqual(d.rows.map(r=>r.got),[2,1,0,0]);
 check({T:3,items:[item('a',1.1),item('b',.95),item('c',.95)]});check({T:0,items:[]});check({T:10,items:[item('min',3-1e-13,{minCards:3,wantCards:3})]});
});
test('real allocations preserve numerical invariants across priorities/caps/pause/repair/fractional budget; bar geometry unchanged',()=>{
 for(const [id,sc] of [['deepseek','y2025'],['mistral','y2024'],['claude','y2025']])for(const share of [.3,.7,.9])for(const state of ['normal','cap','pause','repair']) {
  E.setProvider();const s=E.createGame(id,sc,7);resolveAll(s);
  const p=E.startJob(s,{kind:'post',target:'main',dir:'auto',until:'none'}),b=E.startJob(s,{kind:'pretrain',line:'main',cfg:{total:7,active:7,arch:'dense',tokens:1}});
  E.setInferShare(s,share);if(state==='cap')b.cap=Math.ceil(E.minCards(s,b));if(state==='pause')p.paused=true;if(state==='repair')E.setRepair(s,true);
  const before=JSON.stringify(s),al=E.allocJobs(s),d=check(al),html=allocBar(s),ga=E.gpuAllocation(s);
  assert.equal(JSON.stringify(s),before);assert.equal(d.rows[0].it.job,b,'high-priority base remains first');
  const widths=[...html.matchAll(/flex:([\d.e+-]+)/g)].map(m=>Number(m[1]));assert(Math.abs(widths.reduce((a,b)=>a+b,0)-ga.total)<1e-6);
  const legend=html.match(/class="alloc-legend">(.*?)<\/p>/s)[1];const labels=[...legend.matchAll(/<\/i>[^<]*? (\d+) 张/g)].map(m=>+m[1]);
  // Allocation counts stay explicit integers even above 10k; no independently rounded 万 labels.
  assert.equal(labels.reduce((a,b)=>a+b,0),ga.total,`${id}/${share}/${state}`);
  assert.match(html,/整卡近似/);
 }
});
