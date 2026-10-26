import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {finishJob} from '../../src/career/sim/projects.js';
import {postTick} from '../../src/career/sim/jobs.js';
import {restoreHistory} from '../helpers/world_provider.mjs';
const cfg={total:7,active:7,arch:'dense',tokens:1};
const out=()=>({notes:[]});
const fresh=()=>E.createGame('deepseek','y2023',1);
function ready(s,line='main') {
 const j=E.startJob(s,{kind:'pretrain',line,cfg});
 Object.assign(j.pj.acc,{w:1,q:1.2,effectiveQ:1.2,repeat:1,mix:{knowledge:1},cn:0});
 j.pj.done=j.pj.need;return j;
}
function finish(s,j=ready(s)){const o=out();finishJob(s,j,o);return o;}
const main=s=>s.jobs.list.filter(j=>j.kind==='post'&&j.target==='main');
afterEach(()=>restoreHistory());
test('首个史实底座完成自动创建一项auto/none后训练，下一天推进且不立即送评',()=>{
 const s=fresh();finish(s);const [p]=main(s);assert.ok(p);assert.equal(main(s).length,1);assert.equal(p.dir,'auto');assert.equal(p.until,'none');assert.equal(p.paused,false);
 assert.equal(E.workingModel(s).postDays||0,0);postTick(s,out());assert.equal(E.workingModel(s).postDays,1);
});
test('EU自洽首次底座使用相同默认转换',()=>{
 const w=E.createWorld({seed:1,start:'2024-01',days:365,companies:[{name:'欧陆实测',brand:'欧陆',country:'EU',tier:'specialist',kind:'human'},{name:'对照公司',brand:'对照',country:'US',tier:'specialist',kind:'bot'}]});
 const s=Object.values(w.companies).find(c=>c.kind==='human').s;assert.equal(s.working,null);finish(s);assert.equal(main(s).length,1);postTick(s,out());assert.equal(E.workingModel(s).postDays,1);
});
test('继承已有模型且主动没有后训练时，换代不重新开工',()=>{
 const s=E.createGame('deepseek','y2025',1);const before=E.workingModel(s).id;finish(s);assert.notEqual(E.workingModel(s).id,before);assert.equal(main(s).length,0);
});
test('已有主线后训练跨代不重复，保留暂停/方向/结束条件',()=>{
 const s=E.createGame('deepseek','y2025',1);const p=E.startJob(s,{kind:'post',target:'main',dir:'code',until:{days:30}});E.pauseJob(s,p.id,true);finish(s);
 assert.equal(main(s).length,1);assert.equal(main(s)[0],p);assert.equal(p.paused,true);assert.equal(p.dir,'code');assert.deepEqual(p.until,{days:30});
});
test('首次完成期间明确专心研究，不擅自恢复后训练',()=>{
 const s=fresh();const j=ready(s);E.focusResearch(s,true);finish(s,j);assert.equal(main(s).length,0);assert.deepEqual(s.jobs.focusPause,[]);
});
test('缺卡/检修/负现金不让转换抛错，也不凭空推进后训练',()=>{
 const s=fresh();const j=ready(s);s.gpus.owned={};s.gpus.rented={};s.cash=-1;s.jobs.repair=true;finish(s,j);assert.equal(main(s).length,1);postTick(s,out());assert.equal(E.workingModel(s).postDays||0,0);assert.equal(main(s).length,1);
});
test('取消默认作业后不每tick重新补，存读档保留取消',()=>{
 const s=fresh();finish(s);E.cancelJob(s,main(s)[0].id);postTick(s,out());assert.equal(main(s).length,0);const r=E.migrateGame(JSON.parse(JSON.stringify(s)));assert.equal(r.ok,true,r.reason);postTick(r.s,out());assert.equal(main(r.s).length,0);
});
test('预训练中存读档，完成后默认作业只创建一次',()=>{
 const s=fresh();ready(s);const r=E.migrateGame(JSON.parse(JSON.stringify(s)));assert.equal(r.ok,true,r.reason);const j=r.s.jobs.list.find(j=>j.kind==='pretrain');finish(r.s,j);assert.equal(main(r.s).length,1);const rr=E.migrateGame(JSON.parse(JSON.stringify(r.s)));assert.equal(rr.ok,true,rr.reason);postTick(rr.s,out());assert.equal(main(rr.s).length,1);
});
test('小模型底座完成不替主线创建后训练',()=>{
 const s=E.createGame('deepseek','y2025',1);finish(s,ready(s,'small'));assert.equal(main(s).length,0);assert.ok(s.smallWorking);
});
test('作业位缩减占满时不越过限制，明确说明未自动开工',()=>{
 const s=fresh();const j=ready(s);s.jobs.list.push(...Array.from({length:6},(_,i)=>({id:'busy'+i,seq:20+i,kind:'post',target:'prev',paused:true,dir:'auto',until:'none'})));const o=finish(s,j);assert.equal(main(s).length,0);assert.ok(o.notes.some(x=>x.includes('作业位已满')));
});
test('首个主线由开源续训得到，同样接默认后训练',async()=>{
 const {RELEASES}=await import('../../src/career/data/rivals.js');
 const s=fresh();s.date='2024-01';s.day='2024-01-01';s.strategy.unlocks.adopt_open_base=true;
 const r=RELEASES.find(r=>E.finetuneCheck(s,{relId:r.id}).ok);assert.ok(r);
 const j=E.startJob(s,{kind:'finetune',cfg:{relId:r.id}});finish(s,j);
 assert.equal(main(s).length,1);assert.equal(E.workingModel(s).lineage.kind,'finetune');
});
test('没有完成的底座被取消不创建默认后训练',()=>{
 const s=fresh();const j=ready(s);E.cancelJob(s,j.id);postTick(s,out());assert.equal(main(s).length,0);assert.equal(s.working,null);
});
