import test from 'node:test';import assert from 'node:assert/strict';
import {diffState,applyDiff,PROTOCOL_V} from '../../src/career/net/protocol.js';
const clone=x=>JSON.parse(JSON.stringify(x));
test('v3 automation bounded recent/receipt arrays round-trip every update without resending unchanged policy',()=>{
 let server={automation:{version:6,modules:{research:{mode:'auto'}},pretraining:{why:'unchanged'.repeat(1000)},recent:[],receipts:[],lastDay:0}},client=clone(server),sent=0,whole=0;
 for(let day=1;day<=180;day++){
  const cur=clone(server);cur.automation.lastDay=day;
  for(let i=0;i<6;i++)cur.automation.recent.push({day,module:i,reason:'waiting '.repeat(8)});
  cur.automation.recent=cur.automation.recent.slice(-40);
  cur.automation.receipts.push({id:day,result:{ok:true}});cur.automation.receipts=cur.automation.receipts.slice(-16);
  if(day===40)cur.automation.modules.research.mode='manual';
  if(day===80)delete cur.automation.pretraining;
  if(day===100)cur.automation.extra={flag:true};
  if(day===120)cur.automation.recent=[];
  const d=diffState(server,cur);assert.equal(d.$v,PROTOCOL_V);assert.ok(d.automation.object);
  sent+=Buffer.byteLength(JSON.stringify(d));whole+=Buffer.byteLength(JSON.stringify(cur));
  client=applyDiff(client,clone(d));assert.equal(JSON.stringify(client),JSON.stringify(cur),`day ${day}`);server=cur;
 }
 assert.ok(sent<whole*.25,`${sent}/${whole}`);
 assert.equal(diffState(server,server),null);
 assert.deepEqual(applyDiff({},diffState(null,server)),server);
});
test('v2/missing/unknown and nested wrong-version deltas reject atomically instead of silent reinterpretation',()=>{
 for(const d of [{x:{set:1}},{$v:2,x:{set:1}},{$v:99,x:{set:1}},{$v:PROTOCOL_V,x:{set:1},automation:{object:{$v:2,lastDay:{set:2}}}}]){
  const s={x:0,automation:{lastDay:1}},before=JSON.stringify(s);assert.throws(()=>applyDiff(s,d),/版本/);assert.equal(JSON.stringify(s),before);
 }
});

test('automation absent/null/full/object/deleted transitions preserve exact JSON',()=>{
 const states=[{}, {automation:null}, {automation:{recent:[],receipts:[],modules:{}}}, {automation:{recent:[1],receipts:[2]}}, {automation:null}, {}, {automation:{recent:[]}}];
 let actual=clone(states[0]);for(let i=1;i<states.length;i++){actual=applyDiff(actual,diffState(states[i-1],states[i]));assert.equal(JSON.stringify(actual),JSON.stringify(states[i]));}
});
test('prototype keys in ordinary, nested and full payloads reject before any mutation',()=>{
 for(const fragment of ['{"__proto__":{"polluted":true}}','{"constructor":{"prototype":{"polluted":true}}}','{"prototype":{"polluted":true}}']){
  for(const d of [{$v:PROTOCOL_V,harmless:{set:1},x:{set:JSON.parse(fragment)}},{$v:PROTOCOL_V,full:JSON.parse(fragment)}]){
   const s={harmless:0},before=JSON.stringify(s);assert.throws(()=>applyDiff(s,d),/不安全/);assert.equal(JSON.stringify(s),before);assert.equal({}.polluted,undefined);
  }
 }
});
