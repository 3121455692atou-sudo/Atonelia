import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
globalThis.document ??= {baseURI:'http://localhost/'};
const {render,click,change}=await import('../../src/career/ui/pages/automation.js');
const {setMp}=await import('../../src/career/ui/state.js');
const fresh=()=>{E.setProvider();setMp(null);return E.createGame('deepseek','y2025',3);};
test('UI exposes explicit opt-in and real controls only for implemented modules',()=>{const s=fresh();assert.match(render(s),/明确启用/);click(s,{closest:selector=>selector==='[data-auto-enable]'?{}:null},{guard:f=>f()});assert.equal(s.automation.version,6);const html=render(s);assert.match(html,/自动 6 \/ 6 项/);assert.match(html,/data-auto-module="data"/);assert.match(html,/data-auto-module="research"/);assert.doesNotMatch(html,/data-auto-module="compute"/);change(s,{dataset:{autoModule:'data',autoKey:'mode'},value:'manual'},{guard:f=>f()});assert.equal(s.automation.modules.data.mode,'manual');});
test('read-only and multiplayer page offer no enable action',()=>{const s=fresh();assert.doesNotMatch(render(s,{readOnly:true}),/data-auto-enable/);setMp({room:'test'});assert.match(render(s),/不支持当前托管版本/);assert.doesNotMatch(render(s),/data-auto-enable/);setMp(null);});
test('audit explanations escape HTML',()=>{const s=fresh();E.enableAutomation(s);s.automation.recent.push({day:s.day,module:'data',kind:'waiting',reason:'<script>bad</script>',cost:0});assert.doesNotMatch(render(s),/<script>/);assert.match(render(s),/&lt;script&gt;/);});

test('multiplayer page exposes three module controls, not card selection or manual card wait',()=>{const s=fresh();E.enableAutomation(s);setMp({pub:{settings:{automationVersion:5}}});const html=render(s);assert.match(html,/data-auto-module="data"/);assert.match(html,/服务器结算/);assert.doesNotMatch(html,/卡牌默认手动|等待其他玩家暂停|data-auto-enable/);setMp(null);});
test('multiplayer mode change waits for server acknowledgement without local mutation',async()=>{const s=fresh();E.enableAutomation(s);setMp({pub:{settings:{automationVersion:5}}});const {setRemote}=await import('../../src/career/ui/act.js');let resolve;setRemote({localOk:()=>false,send:()=>new Promise(r=>{resolve=r;})});const st={},before=JSON.stringify(s);let draws=0;change(s,{dataset:{autoModule:'data',autoKey:'mode'},value:'manual'},{guard:()=>{throw new Error('no optimistic local guard');},draw:()=>draws++,st});assert.equal(st.autoPending,true);assert.equal(JSON.stringify(s),before);resolve(1);await new Promise(r=>setImmediate(r));assert.equal(st.autoPending,false);assert.ok(draws>=2);setRemote(null);setMp(null);});

test('allocation UI submits only legal control args and shows truthful scope',()=>{const s=fresh();E.enableAutomation(s);const html=render(s);assert.match(html,/data-auto-module="computeAllocation"/);assert.match(html,/不含购卡、租卡与检修/);assert.match(html,/service_first/);assert.match(html,/training_first/);change(s,{dataset:{autoModule:'computeAllocation',autoKey:'preset'},value:'service_first'},{guard:f=>f()});assert.equal(s.automation.modules.computeAllocation.preset,'service_first');assert.equal(s.automation.modules.computeAllocation.lastSuccessDay,null);});

test('compact automation exposes real controls before optional explanations',()=>{
 const s=fresh();E.enableAutomation(s);const html=render(s);
 assert.ok(html.indexOf('data-auto-master="manual"')<html.indexOf('托管规则与预算说明'));
 assert.equal((html.match(/data-auto-key="mode"/g)||[]).length,6);
 assert.equal((html.match(/data-auto-key="preset"/g)||[]).length,6);
 assert.equal((html.match(/data-auto-select=/g)||[]).length,6);
 assert.match(html,/<details class="automation-extra"><summary>托管规则与预算说明<\/summary><p>只停止未来决策/);
 assert.doesNotMatch(html,/已接入 6 项/);
 s.automation.recent.push({day:s.day,module:'data',kind:'blocked',reason:'预算不足',cost:0});
 assert.match(render(s),/data-auto-status="data">当前：自动 · 未执行/);
 assert.match(render(s),/data-auto-reason="data">预算不足/);
});
const masterTarget=mode=>({closest:selector=>selector==='[data-auto-master]'?{dataset:{autoMaster:mode}}:null});
test('master uses actual batch transaction without changing presets or selection scope',()=>{
 const s=fresh();E.enableAutomation(s);const presets=Object.fromEntries(Object.entries(s.automation.modules).map(([k,v])=>[k,v.preset]));
 const st={autoSelected:['data']};click(s,masterTarget('manual'),{guard:f=>f(),st});
 assert.ok(Object.values(s.automation.modules).every(m=>m.mode==='manual'));assert.deepEqual(st.autoSelected,[]);
 click(s,masterTarget('auto'),{guard:f=>f(),st});assert.ok(Object.values(s.automation.modules).every(m=>m.mode==='auto'));
 assert.deepEqual(Object.fromEntries(Object.entries(s.automation.modules).map(([k,v])=>[k,v.preset])),presets);
});
test('master respects readonly, pending and rejects invalid mode without mutation',()=>{
 const s=fresh();E.enableAutomation(s);const before=JSON.stringify(s);
 for(const st of [{readOnly:true},{autoPending:true}]){click(s,masterTarget('manual'),{guard:()=>assert.fail('disabled control'),st});assert.match(render(s,st),/data-auto-master="manual" disabled/);}
 click(s,masterTarget('bogus'),{guard:()=>assert.fail('invalid mode')});assert.equal(JSON.stringify(s),before);
});
test('multiplayer master waits for ack and suppresses repeated click',async()=>{
 const s=fresh();E.enableAutomation(s);setMp({pub:{settings:{automationVersion:6}}});
 const {setRemote}=await import('../../src/career/ui/act.js');let resolve,calls=0;
 setRemote({localOk:()=>false,send:()=>{calls++;return new Promise(r=>resolve=r);}});
 try {const before=JSON.stringify(s),st={};const ctx={guard:()=>assert.fail('no optimistic mutation'),draw:()=>{},st};
 click(s,masterTarget('manual'),ctx);click(s,masterTarget('manual'),ctx);assert.equal(calls,1);assert.equal(st.autoPending,true);assert.equal(JSON.stringify(s),before);
 resolve(1);await new Promise(r=>setImmediate(r));assert.equal(st.autoPending,false);
 }finally{setRemote(null);setMp(null);}
});
