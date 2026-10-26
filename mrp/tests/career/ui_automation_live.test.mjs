import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {diffState} from '../../src/career/net/protocol.js';
import {setMp,onRemoteState,notifyRemoteState} from '../../src/career/ui/state.js';
import {onEvent} from '../../src/career/ui/net.js';
globalThis.document??={baseURI:'http://localhost/'};
const {sync}=await import('../../src/career/ui/pages/automation.js');
afterEach(()=>{setMp(null);delete document.activeElement;delete document.body;});
const fresh=()=>{E.setProvider();const s=E.createGame('deepseek','y2025',3);E.enableAutomation(s);return s;};
function surface(){
 const controls=['data','research','computeAllocation'].flatMap(module=>['mode','preset'].map(key=>({dataset:{autoModule:module,autoKey:key},value:'',disabled:false,isConnected:true,focus(){document.activeElement=this;}})));
 const nodes=Object.fromEntries(['[data-auto-budget]','[data-auto-log]','[data-auto-reason="data"]','[data-auto-reason="research"]','[data-auto-reason="computeAllocation"]'].map(k=>[k,{textContent:'',innerHTML:''}]));
 return {controls,nodes,scrollTop:79,detailsOpen:true,querySelector:s=>nodes[s],querySelectorAll:()=>controls};
}
test('同日权威ack更新托管值和理由，不替换控件、焦点、展开状态或滚动',()=>{
 const s=fresh(),root=surface(),st={};document.body={};document.activeElement=root.controls[0];const ref=root.controls[0];
 s.automation.modules.data.mode='manual';s.automation.recent.push({module:'data',kind:'control',day:s.day,reason:'已接管'});
 const before=JSON.stringify(s);assert.equal(sync(s,root,st),true);assert.equal(root.controls[0],ref);assert.equal(document.activeElement,ref);assert.equal(ref.value,'manual');assert.equal(root.scrollTop,79);assert.equal(root.detailsOpen,true);assert.equal(root.nodes['[data-auto-reason="data"]'].textContent,'已接管');assert.equal(JSON.stringify(s),before);
});
test('次日更新预算与执行记录，HTML理由安全转义，pending不被更新解除',()=>{
 const s=fresh(),root=surface(),st={autoPending:true};s.cash=1e6;s.automation.recent.push({module:'data',kind:'executed',day:'2025-01-02',reason:'<script>不执行</script>',cost:50});
 sync(s,root,st);assert.ok(root.controls.every(x=>x.disabled));assert.equal(st.autoPending,true);assert.match(root.nodes['[data-auto-log]'].innerHTML,/2025-01-02/);assert.doesNotMatch(root.nodes['[data-auto-log]'].innerHTML,/<script>/);assert.match(root.nodes['[data-auto-log]'].innerHTML,/&lt;script&gt;/);assert.match(root.nodes['[data-auto-budget]'].textContent,/可用预算 .*保留现金/);
});
test('pending完成恢复原控件焦点，但不抢走玩家新选择的焦点',()=>{
 const s=fresh(),root=surface(),st={autoPending:true};document.body={};document.activeElement=root.controls[0];sync(s,root,st);document.activeElement=document.body;st.autoPending=false;sync(s,root,st);assert.equal(document.activeElement,root.controls[0]);
 st.autoPending=true;sync(s,root,st);const other={};document.activeElement=other;st.autoPending=false;sync(s,root,st);assert.equal(document.activeElement,other);
});
test('服务器同日cmd应答后通知面板，关闭取消订阅后不再刷新',()=>{
 const old={automation:{rev:0}},next={automation:{rev:1}},m={base:old,S:structuredClone(old)};setMp(m);let calls=[];
 const stop=onRemoteState(t=>calls.push([t,m.S.automation.rev]));onEvent(m,'cmd',{me:diffState(old,next)});assert.deepEqual(calls,[['cmd',1]]);
 stop();stop();notifyRemoteState('day');assert.equal(calls.length,1);
});
test('不在托管页时同步不触及其他表单',()=>{const s=fresh();assert.equal(sync(s,{querySelector:()=>null,querySelectorAll:()=>{throw new Error('不得读取其他表单');}}),false);});

test('第三模块同步保训练策略和日志，保留v2模块而非退回两模块',()=>{const s=fresh(),root=surface();s.automation.modules.computeAllocation.preset='training_first';s.automation.recent.push({module:'computeAllocation',kind:'control',day:s.day,reason:'保训练'});sync(s,root,{});assert.equal(root.controls.find(x=>x.dataset.autoModule==='computeAllocation'&&x.dataset.autoKey==='preset').value,'training_first');assert.equal(root.nodes['[data-auto-reason="computeAllocation"]'].textContent,'保训练');assert.match(root.nodes['[data-auto-log]'].innerHTML,/算力分配（不含购卡、租卡与检修）/);});

test('compact master, status and budget sync preserve details while pending disables global controls',()=>{
 const s=fresh();const master={dataset:{autoMaster:'manual'},disabled:false};
 const nodes=Object.fromEntries(['[data-auto-budget]','[data-auto-log]','[data-auto-summary]','[data-auto-note]','[data-auto-status="data"]'].map(k=>[k,{textContent:'',innerHTML:''}]));
 const root={querySelector:k=>nodes[k],querySelectorAll:k=>k.includes('[data-auto-master]')?[master]:[]};
 const before=JSON.stringify(s);sync(s,root,{autoPending:true});assert.equal(master.disabled,true);assert.match(nodes['[data-auto-summary]'].textContent,/自动 6 \/ 6/);assert.match(nodes['[data-auto-note]'].textContent,/等待服务器/);assert.equal(JSON.stringify(s),before);
 s.automation.modules.data.mode='manual';sync(s,root,{});assert.equal(master.disabled,false);assert.match(nodes['[data-auto-summary]'].textContent,/自动 5 \/ 6/);assert.match(nodes['[data-auto-status="data"]'].textContent,/当前：手动/);
 sync(s,root,{readOnly:true});assert.equal(master.disabled,true);assert.match(nodes['[data-auto-note]'].textContent,/只读/);
});
