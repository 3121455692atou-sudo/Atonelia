import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {bestDir} from '../../src/career/sim/jobs.js';
import {BENCH_BY_ID} from '../../src/career/data/benchmarks.js';
import {COMPANIES} from '../../src/career/data/core.js';
import {restoreHistory} from '../helpers/world_provider.mjs';
function originalBestDir(s,m){
 const [g,g2]=(s.goals||[]).filter(x=>x.status==='pending'&&(x.check?.type==='bench'||x.check?.type==='rank')).sort((a,b)=>a.date.localeCompare(b.date));
 let w=null;
 if(g&&BENCH_BY_ID[g.check.bench]){
  const months=Number(g.date.slice(0,4))*12+Number(g.date.slice(5,7))-(Number(s.date.slice(0,4))*12+Number(s.date.slice(5,7)));
  if(months<=12){w={...BENCH_BY_ID[g.check.bench].w};if(g2&&BENCH_BY_ID[g2.check.bench])for(const [k,v] of Object.entries(BENCH_BY_ID[g2.check.bench].w))w[k]=(w[k]||0)+.5*v;}
 }
 let best=null,bv=-1;
 for(const d of E.directionsFor(s)){
  const p=E.postPreview(s,d.key,{model:m});if(!p)continue;
  const v=Object.entries(p.gains).reduce((x,[k,y])=>x+y*(w?(.3+4*(w[k]||0)):1),0)*(1-p.fail/200);
  if(v>bv){bv=v;best=d.key;}
 }
 return best;
}
test('direction enumeration matches eager original and cannot mutate live jobs/models',()=>{
 restoreHistory();let checked=0;
 const ids=[...new Set(['qwen','gemini','gpt',...['image','music','speech'].map(mod=>COMPANIES.find(c=>c.modality===mod)?.id).filter(Boolean)])];
 for(const id of ids){
  const s=E.createGame(id,'y2025',410),m=E.workingModel(s);if(!m)continue;
  for(const edit of [()=>{},()=>{s.inferShare=.8;},()=>{s.health=35;},()=>{s.jobs.repair=true;},()=>{s.jobs.repair=false;s.jobs.ownOnly=true;},()=>{s.goals=[];},()=>{s.know+=100;}]){
   edit();const before=structuredClone(s),expected=originalBestDir(s,m);assert.equal(bestDir(s,m),expected,`${id}/${checked}`);assert.deepEqual(structuredClone(s),before);checked++;
  }
 }
 assert.ok(checked>=21);
});
