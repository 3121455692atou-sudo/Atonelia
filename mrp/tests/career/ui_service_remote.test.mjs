import {PROTOCOL_V} from '../../src/career/net/protocol.js';
import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {stripPrivate} from '../../src/career/net/protocol.js';
globalThis.document={baseURI:'http://localhost/',createElement:()=>({classList:{add(){}},remove(){}}),getElementById:()=>({append(){}})};
const state=await import('../../src/career/ui/state.js');
const net=await import('../../src/career/ui/net.js');
const {act,setRemote}=await import('../../src/career/ui/act.js');
const J=x=>JSON.parse(JSON.stringify(x));
let requests=[],sources=[];
class ES {constructor(){this.handlers={};sources.push(this);}addEventListener(k,v){this.handlers[k]=v;}close(){this.closed=true;}}
globalThis.EventSource=ES;
globalThis.fetch=(_url,opts)=>new Promise((resolve,reject)=>requests.push({body:JSON.parse(opts.body),resolve:r=>resolve({status:200,json:async()=>r}),reject}));
async function flush(){await Promise.resolve();await Promise.resolve();await Promise.resolve();}
function fresh(){
 E.setProvider();requests=[];sources=[];
 const w=E.createWorld({mode:'fork',seed:8,start:'2025-01',days:365,mp:true,keep:6,seats:['deepseek']});
 const c=Object.values(w.companies).find(x=>x.kind==='human'),s=J(stripPrivate(c.s)),pub=J(E.publicView(w,c.id));
 s.products.chat.on=false;
 const m=net.rejoin('123abc');net.onEvent(m,'init',{v:PROTOCOL_V,s,pub,company:c.id,seat:0,seats:[],clock:{}});return {m,s,pub,c};
}
function cmd(m,seq,on){net.onEvent(m,'cmd',{seq,me:{$v:PROTOCOL_V,products:{set:{...J(m.base.products),chat:{...m.base.products.chat,on}}}}});}
afterEach(()=>{state.setMp(null);state.setWorld(null);setRemote(null);E.setProvider();});
test('真实net产品开关HTTP先到仍等待对应权威SSE，不乐观改镜像',async()=>{
 const {m}=fresh();let done=false;const result=act(m.S,'setProduct',{id:'chat',patch:{on:true}});
 assert.equal(m.S.products.chat.on,false,'HTTP尚未回应，不得提前显示产品开启');const p=Promise.resolve(result).then(()=>done=true);requests[0].resolve({ok:true});await flush();assert.equal(done,false);
 cmd(m,requests[0].body.seq,true);await p;assert.equal(m.S.products.chat.on,true);assert.equal(m.productRequests.size,0);
});
test('SSE先到必须再等HTTP确认；无差异成功不等待不存在的SSE',async()=>{
 const {m}=fresh();let done=false;const p=act(m.S,'setProduct',{id:'chat',patch:{on:true}}).then(()=>done=true);
 cmd(m,requests[0].body.seq,true);await flush();assert.equal(done,false);requests[0].resolve({ok:true});await p;
 const p2=act(m.S,'setProduct',{id:'chat',patch:{on:true}});requests[1].resolve({ok:true});await p2;assert.equal(m.productRequests.size,0);
});
test('明确服务端拒绝恢复权威；重复请求不多发，旧seq不能确认新请求',async()=>{
 const {m}=fresh();const p=act(m.S,'setProduct',{id:'chat',patch:{on:true}});const old=requests[0].body.seq;
 await assert.rejects(act(m.S,'setProduct',{id:'chat',patch:{on:true}}),/等待/);assert.equal(requests.length,1);
 requests[0].resolve({ok:false,err:'测试权限拒绝'});await assert.rejects(p,/测试权限拒绝/);assert.equal(m.S.products.chat.on,false);
 let done=false;const p2=act(m.S,'setProduct',{id:'chat',patch:{on:true}}).then(()=>done=true);requests[1].resolve({ok:true});await flush();cmd(m,old,false);await flush();assert.equal(done,false);cmd(m,requests[1].body.seq,true);await p2;
});
test('断网未知不重发，完整init恢复实际状态并解除等待',async()=>{
 const {m,s,pub,c}=fresh();const p=act(m.S,'setProduct',{id:'chat',patch:{on:true}});requests[0].reject(new Error('断网'));await flush();
 assert.equal(requests.length,1);assert.equal(m.productRequests.size,1);assert.equal(sources.length,2);
 const latest=J(s);latest.products.chat.on=true;net.onEvent(m,'init',{v:PROTOCOL_V,s:latest,pub,company:c.id,seat:0,seats:[],clock:{}});
 await assert.rejects(p,/已重新同步/);assert.equal(m.S.products.chat.on,true);assert.equal(m.productRequests.size,0);assert.equal(requests.length,1);
});
test('HTTP已确认但SSE断线，重连init解除等待并展示最终权威而非旧意图',async()=>{
 const {m,s,pub,c}=fresh();const p=act(m.S,'setProduct',{id:'chat',patch:{on:true}});requests[0].resolve({ok:true});await flush();
 assert.equal(m.productRequests.size,1);
 net.onEvent(m,'init',{v:PROTOCOL_V,s:J(s),pub,company:c.id,seat:0,seats:[],clock:{}});await p;assert.equal(m.S.products.chat.on,false);assert.equal(m.productRequests.size,0);
});
const service=await import('../../src/career/ui/pages/service.js');
test('关闭重开面板只同步本产品，保留别的草稿及焦点；等待时再次点击不多发',async()=>{
 const {m}=fresh();const t={dataset:{prod:'chat'},checked:true,disabled:false};let p;
 service.change(m.S,t,{guard:fn=>p=fn()});assert.equal(t.checked,false);assert.equal(t.disabled,true);
 t.checked=true;service.change(m.S,t,{guard:fn=>fn()});assert.equal(requests.length,1);
 const reopened={dataset:{prod:'chat'},checked:true},draft={value:'未提交价格'},root={querySelectorAll:sel=>{assert.equal(sel,'input[data-prod]');return [reopened];}};
 service.after(root,m.S);assert.equal(reopened.checked,false);assert.equal(reopened.disabled,true);assert.equal(draft.value,'未提交价格');
 cmd(m,requests[0].body.seq,true);requests[0].resolve({ok:true});await p;service.sync(m.S,root);assert.equal(reopened.checked,true);assert.equal(reopened.disabled,false);assert.equal(draft.value,'未提交价格');
});
