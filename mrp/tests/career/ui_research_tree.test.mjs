import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {COMPANIES,SCENARIOS,TECHS} from '../../src/career/data/core.js';
globalThis.document??={baseURI:'http://localhost/'};
const ui=await import('../../src/career/ui/pages/tech.js');
const {setResearchRecommendation}=await import('../../src/career/ui/advice_navigation.js');
const {setMp}=await import('../../src/career/ui/state.js');
const {setRemote}=await import('../../src/career/ui/act.js');
afterEach(()=>{setMp(null);setRemote(null);E.setProvider();});
const fresh=()=>{E.setProvider();setMp(null);const s=E.createGame('qwen','y2026',3);s.queue=[];return s;};
const button=(selector,dataset={})=>({closest:s=>s===selector?{dataset}:null});
const count=h=>(h.match(/data-tech-node=/g)||[]).length;
test('every company/year renders its full domain tree, locked reasons and actual outcomes without state mutation',()=>{
 for(const c of COMPANIES)for(const sc of SCENARIOS){E.setProvider();const s=E.createGame(c.id,sc.id,1),before=JSON.stringify(s),html=ui.render(s);assert.equal(count(html),TECHS.filter(t=>t.mod===s.mod).length);assert.equal(JSON.stringify(s),before);assert.match(html,/前置/);assert.match(html,/不按开局年份赠送/);assert.match(html,/不直接加能力/);assert.match(html,/采购|推理卡/);}
});
test('recommendation, filters and prerequisite jump mutate UI only; focus target survives filtered-out view',()=>{
 const s=fresh();E.enableAutomation(s);setResearchRecommendation(s,'repository_audit');const before=JSON.stringify(s),st={};assert.match(ui.render(s,st),/顾问推荐：仓库许可证与依赖审计/);assert.match(ui.render(s,st),/尚未开始研究/);assert.match(ui.render(s,st),/自动选题：开启/);
 let draws=0;ui.change(s,{matches:q=>q==='[data-tech-filter]',value:'ready'},{st,draw:()=>draws++});assert.equal(count(ui.render(s,st)),5);
 ui.click(s,button('[data-tech-jump]',{techJump:'long_ctx'}),{st,draw:()=>draws++});assert.equal(st.techFilter,'all');assert.equal(count(ui.render(s,st)),27);let focus=0,scroll=0;ui.after({querySelectorAll:()=>[{dataset:{techNode:'long_ctx'},focus:()=>focus++,scrollIntoView:()=>scroll++}]},s,st);assert.equal(focus,1);assert.equal(scroll,1);assert.equal(st.techFocus,undefined);assert.equal(JSON.stringify(s),before);
});
test('explicit takeover preserves existing research and is blocked in read-only view',()=>{
 const s=fresh();E.enableAutomation(s);E.researchTech(s,'repository_audit');const projects=JSON.stringify(s.research);const t=button('[data-tech-manual]');ui.click(s,t,{st:{readOnly:true},guard:f=>f()});assert.equal(s.automation.modules.research.mode,'auto');ui.click(s,t,{st:{},guard:f=>f()});assert.equal(s.automation.modules.research.mode,'manual');assert.equal(JSON.stringify(s.research),projects);
});
test('start/pause commands are explicit; duplicate and read-only do not invent successful work',()=>{
 const s=fresh(),st={},ctx={st,guard:f=>f()},t=button('[data-tech]',{tech:'repository_audit'});ui.click(s,t,ctx);assert.equal(s.research.length,1);assert.throws(()=>ui.click(s,t,ctx),/正在研究/);const before=JSON.stringify(s);ui.click(s,button('[data-tech]',{tech:'retrieval_grounding'}),{...ctx,st:{readOnly:true}});assert.equal(JSON.stringify(s),before);ui.click(s,button('[data-tech-stop]',{techStop:'repository_audit'}),ctx);assert.equal(s.research.length,0);
});
test('remote request has no optimistic ownership; repeated clicks blocked until authority settles',async()=>{
 const s=fresh();setMp({room:'research-test'});let resolve,calls=0;setRemote({localOk:()=>false,send:()=>{calls++;return new Promise(r=>resolve=r);}});const st={},ctx={st,draw:()=>{},guard:()=>assert.fail('remote does not use optimistic guard')};const before=JSON.stringify(s),t=button('[data-tech]',{tech:'repository_audit'});ui.click(s,t,ctx);assert(st.techPending);ui.click(s,t,ctx);assert.equal(calls,1);assert.equal(JSON.stringify(s),before);
 // A terminal reply with no note avoids toast DOM requirements in this isolated unit test.
 const original=document.createElement,lookup=document.getElementById;document.createElement=()=>({classList:{add(){}},remove(){}});document.getElementById=()=>({append(){}});resolve({name:'仓库许可证与依赖审计'});await new Promise(r=>setImmediate(r));document.createElement=original;document.getElementById=lookup;assert.equal(st.techPending,false);assert.equal(JSON.stringify(s),before);
});
