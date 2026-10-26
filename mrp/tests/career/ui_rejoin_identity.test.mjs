import {PROTOCOL_V} from '../../src/career/net/protocol.js';
import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {onEvent,isHost,myMember} from '../../src/career/ui/net.js';
import {setMp} from '../../src/career/ui/state.js';
afterEach(()=>setMp(null));
const members=[{member:'host',seat:0,approved:true},{member:'peer',seat:1,approved:true},{member:'pending',seat:null,approved:false}];
for(const phase of ['lobby','playing']) for(const who of ['host','peer','pending']) test(`${phase}刷新私有快照恢复${who}身份，广播不覆盖`,()=>{
 const m={member:null};setMp(m);
 onEvent(m,'lobby',{v:PROTOCOL_V,phase,host:'host',members,self:who});
 assert.equal(m.member,who);assert.equal(isHost(m),who==='host');assert.equal(myMember(m).member,who);assert.equal(m.pending,who==='pending');
 onEvent(m,'lobby',{v:PROTOCOL_V,phase,host:'host',members});assert.equal(m.member,who);assert.equal(isHost(m),who==='host');
});
test('无私有身份或未知self不猜房主',()=>{
 const m={member:null};setMp(m);onEvent(m,'lobby',{v:PROTOCOL_V,host:'host',members});assert.equal(isHost(m),false);
 onEvent(m,'lobby',{v:PROTOCOL_V,host:'host',members,self:'unknown'});assert.equal(m.member,null);assert.equal(isHost(m),false);
});

test('旧协议大厅/init在修改镜像前被拒绝并关闭连接',()=>{
 let closed=0;const m={member:null,online:true,es:{close(){closed++;}}};setMp(m);
 for(const type of ['lobby','init']){assert.throws(()=>onEvent(m,type,{v:2,host:'other',members:[],s:{secret:1},pub:{}}),/版本/);assert.equal(m.base,undefined);assert.equal(m.lobby,undefined);}
 assert.equal(closed,2);assert.equal(m.online,false);
});

test('真实onEvent先验证整帧，旧private差分不允许先改变public镜像',()=>{
 for(const type of ['day','cmd']){let closed=0;const m={online:true,pub:{x:0},base:{x:0},es:{close(){closed++;}}};setMp(m);
 const before=JSON.stringify({pub:m.pub,base:m.base});assert.throws(()=>onEvent(m,type,{pub:{$v:PROTOCOL_V,x:{set:1}},me:{$v:2,x:{set:1}}}),/版本/);
 assert.equal(JSON.stringify({pub:m.pub,base:m.base}),before);assert.equal(closed,1);assert.equal(m.online,false);assert.match(m.syncError,/同步已停止/);}
});
