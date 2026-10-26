import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
globalThis.document??={baseURI:'http://localhost/'};
const {trainingIdentity,click,sync,render}=await import('../../src/career/ui/pages/train.js');
import {setRemote} from '../../src/career/ui/act.js';
const {multiplayerEventView}=await import('../../src/career/ui/inbox.js');
const fresh=()=>{E.setProvider();return E.createGame('deepseek','y2025',4);};
afterEach(()=>setRemote(null));
test('进度和分数变化不误判目标；工作模型身份改变需要再次确认',()=>{
 const s=fresh(),id=trainingIdentity(s);s.day='2025-01-03';s.cash-=1;s.jobs.list.push({id:'测试作业',kind:'post',target:'main'});assert.equal(trainingIdentity(s),id);s.working='新模型';assert.notEqual(trainingIdentity(s),id);
});
test('过期表单不能提交，也不能偷偷将主线映射到新模型',()=>{
 const s=fresh(),st={trainStale:true,post:{target:'main'}},before=JSON.stringify(s);let calls=0;
 const t={closest:sel=>sel.includes('[data-op]')?{}:null};
 click(s,t,{st,guard:fn=>{calls++;assert.throws(fn,/目标已经变化/);},draw:()=>assert.fail('不应重画')});assert.equal(calls,1);assert.equal(JSON.stringify(s),before);assert.equal(st.post.target,'main');
});
test('明确刷新目标后保留配置，解除旧目标标记',()=>{
 const s=fresh(),post={target:'main',dir:'math',until:'d30'},st={trainIdentity:'旧',trainStale:true,post};let draws=0;
 click(s,{closest:sel=>sel==='[data-train-refresh]'?{}:null},{st,draw:()=>draws++});assert.equal(st.trainStale,false);assert.equal(st.trainIdentity,trainingIdentity(s));assert.equal(st.post,post);assert.equal(draws,1);
});
test('非训练页同步不读取或改写其他表单',()=>{assert.equal(sync(fresh(),{querySelector:()=>null},{}),false);});
test('重画仍保留目标变化警告，不隐藏已有阻塞',()=>{const html=render(fresh(),{trainStale:true});assert.match(html,/data-train-stale >训练目标已经变化/);});
test('联机教程仅替换视图，保留权威内容和选项',()=>{
 const old={kind:'notice',title:'时间怎么走',text:'原单机文案',choices:[{id:'ok'}]},copy=JSON.stringify(old),v=multiplayerEventView(old);
 assert.equal(JSON.stringify(old),copy);assert.match(v.text,/数字 1–4/);assert.match(v.text,/普通玩家不能暂停/);assert.match(v.text,/不会暂停或放慢/);assert.equal(v.choices,old.choices);const other={title:'别的事件'};assert.equal(multiplayerEventView(other),other);
});
test('后训练服务器拒绝时保留原草稿，不提前报告成功或清空',async()=>{
 const s=fresh(),post={target:'main',dir:'math',until:'d30'},st={post,newJob:'post',opt:{}};
 setRemote({localOk:()=>false,send:()=>Promise.reject(new Error('服务端拒绝'))});
 let pending;click(s,{closest:sel=>sel==='[data-op]'?{dataset:{op:'start-post'}}:null},{st,guard:fn=>pending=fn(),draw:()=>{}});
 await assert.rejects(pending,/服务端拒绝/);assert.equal(st.post,post);assert.equal(st.newJob,'post');
});
test('底座立项等待远程成功才清草稿，并将Promise交回后台pending守卫',async()=>{
 const s=fresh(),st={newJob:'small',small:{total:7,active:7,arch:'dense',tokens:1},opt:{}};
 let done;setRemote({localOk:()=>false,send:()=>new Promise(r=>done=r)});
 let pending;click(s,{closest:sel=>sel==='[data-op]'?{dataset:{op:'start-small'}}:null},{st,guard:fn=>pending=fn(),draw:()=>{}});
 assert.equal(typeof pending?.then,'function');assert.equal(st.newJob,'small');done({id:'真实服务器作业'});const r=await pending;assert.match(r.note,/开始预训练/);assert.equal(st.newJob,null);
});
const {patchTrainingNode}=await import('../../src/career/ui/train_sync.js');
// 同步器契约的小DOM替身；真实浏览器证据另存evidence。
class N {
 constructor(tag,a={},children=[]){this.nodeType=tag==='#text'?3:1;this.tagName=tag.toUpperCase();this.a={...a};this.data=a.text||'';this.childNodes=[];children.forEach(n=>this.insertBefore(n,null));}
 get attributes(){return Object.entries(this.a).map(([name,value])=>({name,value}));} get firstChild(){return this.childNodes[0]||null;} get nextSibling(){const xs=this.parentNode?.childNodes||[];return xs[xs.indexOf(this)+1]||null;}
 getAttribute(k){return this.a[k]??null;} hasAttribute(k){return k in this.a;} setAttribute(k,v){this.a[k]=v;} removeAttribute(k){delete this.a[k];}
 matches(s){return s.split(',').some(x=>{x=x.trim();if(x.startsWith('.'))return (this.a.class||'').split(' ').includes(x.slice(1));if(x==='input[type=checkbox]')return this.tagName==='INPUT'&&this.a.type==='checkbox';return x.toUpperCase()===this.tagName;});}
 insertBefore(n,b){n.remove();const i=b?this.childNodes.indexOf(b):this.childNodes.length;assert.ok(i>=0);this.childNodes.splice(i,0,n);n.parentNode=this;}
 remove(){if(this.parentNode){const xs=this.parentNode.childNodes;xs.splice(xs.indexOf(this),1);this.parentNode=null;}}
 cloneNode(){return new N(this.tagName,this.a,this.childNodes.map(x=>x.cloneNode()));}
}
test('局部同步保留数字草稿节点和焦点，同时更新作业按钮文本',()=>{
 const input=new N('input',{value:'',type:'number'});input.value='999';document.activeElement=input;
 const b=new N('button',{'data-on':'0'},[new N('#text',{text:'继续'})]),row=new N('div',{},[input,b]);
 patchTrainingNode(row,new N('div',{},[new N('input',{value:'100',type:'number'}),new N('button',{'data-on':'1'},[new N('#text',{text:'暂停'})])]));
 assert.equal(row.firstChild,input);assert.equal(input.value,'999');assert.equal(document.activeElement,input);assert.equal(b.getAttribute('data-on'),'1');assert.equal(b.firstChild.data,'暂停');delete document.activeElement;
});
test('稳定作业键重排不冒用节点，完成作业移除，送评草稿仍保留',()=>{
 const a=new N('div',{'data-train-key':'job:a'}),b=new N('div',{'data-train-key':'job:b'}),form=new N('div',{class:'submit-box'}),row=new N('div',{},[a,b,form]);
 patchTrainingNode(row,new N('div',{},[new N('div',{'data-train-key':'job:b'}),new N('div',{'data-train-key':'job:c'})]));
 assert.equal(row.firstChild,b);assert.equal(a.parentNode,null);assert.equal(form.parentNode,row);assert.equal(row.childNodes[1].getAttribute('data-train-key'),'job:c');
});
test('即时提交的开关遵循权威值，更新checked不移走焦点',()=>{
 const a=new N('input',{type:'checkbox'}),b=new N('input',{type:'checkbox'});a.checked=false;b.checked=true;document.activeElement=a;patchTrainingNode(a,b);assert.equal(a.checked,true);assert.equal(document.activeElement,a);delete document.activeElement;
});
