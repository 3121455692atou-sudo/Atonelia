import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
globalThis.document??={baseURI:'http://localhost/'};
const ui=await import('../../src/career/ui/pages/strategy.js');
const {setRemote}=await import('../../src/career/ui/act.js');
afterEach(()=>setRemote(null));
const target=(op,id)=>({closest:s=>s==='[data-strategy-op]'?{dataset:{strategyOp:op,id}}:null});
test('strategy remote start sends once, never writes its mirror, settles errors and permits retry',async()=>{
 const s=E.createGame('qwen','y2026',3);s.queue=[];s.strategy.cur=null;
 const id=E.strategyOptions(s).find(o=>o.state==='available'&&!o.node.auto).id,st={},before=JSON.stringify(s);let calls=0,reject,draws=0;
 const create=document.createElement,lookup=document.getElementById;const messages=[];
 document.createElement=()=>({classList:{add(){}},remove(){},set textContent(v){messages.push(v);}});document.getElementById=()=>({append(){}});
 try{
  setRemote({localOk:()=>false,send(){calls++;return new Promise((_,r)=>reject=r);}});
  const ctx={st,draw(){draws++;},guard:()=>assert.fail('remote must not use local guard')};
  const pending=ui.click(s,target('start',id),ctx);assert.equal(st.strategyPending,true);ui.click(s,target('start',id),ctx);assert.equal(calls,1);assert.equal(JSON.stringify(s),before);
  assert.match(ui.render(s,{...st,strategySel:id}),/data-strategy-op="start"[^>]*disabled/);
  reject(new Error('服务器拒绝'));await pending;assert.equal(st.strategyPending,false);assert(messages.includes('服务器拒绝'));assert.equal(JSON.stringify(s),before);
  const retry=ui.click(s,target('start',id),ctx);assert.equal(calls,2);reject(new Error('测试结束'));await retry;assert(draws>=4);
 }finally{document.createElement=create;document.getElementById=lookup;}
});
test('read-only strategy rejects remote writes before sending',()=>{
 const s=E.createGame('qwen','y2026',3);setRemote({localOk:()=>false,send:()=>assert.fail('read-only sent command')});
 ui.click(s,target('shelve','anything'),{st:{readOnly:true},guard:()=>assert.fail('read-only invoked guard')});
});
test('late strategy success/rejection cannot clear a new game confirmation, toast, or settle its request',async()=>{
 const {setState}=await import('../../src/career/ui/state.js');const s=E.createGame('qwen','y2026',3);s.queue=[];s.strategy.cur=null;setState(s);
 const id=E.strategyOptions(s).find(o=>o.state==='available'&&!o.node.auto).id;
 const create=document.createElement,lookup=document.getElementById,messages=[];document.createElement=()=>({classList:{add(){}},remove(){},set textContent(v){messages.push(v);}});document.getElementById=()=>({append(){}});
 try{for(const failure of [false,true]){
  setState(s);const st={page:'strategy',strategyConfirm:'old'},ctx={st,draw(){},guard:()=>assert.fail()};let resolve,reject;
  setRemote({localOk:()=>false,send:()=>new Promise((r,j)=>{resolve=r;reject=j;})});const pending=ui.click(s,target('start',id),ctx);
  ui.dispose(s);for(const key of Object.keys(st))delete st[key];Object.assign(st,{page:'strategy',strategyConfirm:'new-company-choice',strategyPending:true,strategyRequest:{new:true}});const expected={...st};setState(E.createGame('glm','y2026',7));
  if(failure)reject(new Error('旧房间拒绝'));else resolve({});await pending;assert.deepEqual(st,expected);assert.deepEqual(messages,[]);
 }}finally{document.createElement=create;document.getElementById=lookup;setState(null);}
});
test('leave-and-return keeps one pending strategy command; settlement while away is quiet and does not redraw another page',async()=>{
 const {setState}=await import('../../src/career/ui/state.js');const s=E.createGame('qwen','y2026',3);s.queue=[];s.strategy.cur=null;setState(s);const id=E.strategyOptions(s).find(o=>o.state==='available'&&!o.node.auto).id;
 const create=document.createElement,lookup=document.getElementById,messages=[];document.createElement=()=>({classList:{add(){}},remove(){},set textContent(v){messages.push(v);}});document.getElementById=()=>({append(){}});
 try{for(const returnBefore of [false,true]){
  const st={page:'strategy'},ctx={st,draw(){draws++;},guard:()=>assert.fail()};let calls=0,resolve,draws=0;setRemote({localOk:()=>false,send:()=>{calls++;return new Promise(r=>resolve=r);}});const pending=ui.click(s,target('start',id),ctx);
  ui.dispose(s);st.page='tech';const before=draws;
  if(returnBefore){st.page='strategy';ui.after({querySelector:()=>null,querySelectorAll:()=>[]},s,st);ui.click(s,target('start',id),ctx);assert.equal(calls,1);}
  resolve({});await pending;assert.equal(st.strategyPending,false);assert.equal(st.strategyRequest,undefined);
  if(!returnBefore){assert.equal(draws,before);assert.equal(messages.length,0);}else assert.equal(messages.length,1);
 }}finally{document.createElement=create;document.getElementById=lookup;setState(null);}
});
