import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {finishJob} from '../../src/career/sim/projects.js';
import {restoreHistory} from '../helpers/world_provider.mjs';
const make=(autoPostVersion,mp=false)=>E.createWorld({seed:1,start:'2024-01',days:365,autoPostVersion,mp,companies:[{name:'版本实测',brand:'版本',country:'EU',tier:'specialist',kind:'human'}]});
function finish(w){const s=Object.values(w.companies)[0].s,j=E.startJob(s,{kind:'pretrain',line:'main',cfg:{total:7,active:7,arch:'dense',tokens:1}});Object.assign(j.pj.acc,{w:1,q:1.2,effectiveQ:1.2,repeat:1,mix:{knowledge:1},cn:0});j.pj.done=j.pj.need;finishJob(s,j,{notes:[]});return s.jobs.list.filter(j=>j.kind==='post'&&j.target==='main');}
afterEach(restoreHistory);
test('新世界默认v1首次完成自动后训练，规则纳入hash',()=>{const w=make();assert.equal(w.autoPostVersion,1);const h=w.hash();delete w.autoPostVersion;assert.notEqual(w.hash(),h);w.autoPostVersion=1;assert.equal(finish(w).length,1);});
test('当前单人规则存读后保留首次自动后训练，无升级标记',()=>{const w=make(1),saved=E.serialize(w),loaded=E.migrateWorld(saved);assert.equal(loaded.ok,true,loaded.reason);assert.equal(E.serialize(loaded.world),saved);assert.equal(loaded.world.autoPostVersion,1);assert.equal(loaded.world.autoPostUpgrade,undefined);assert.equal(finish(loaded.world).length,1);});
test('单人和联机旧规则一律拒绝，无自动升级入口',()=>{for(const mp of [false,true]){assert.throws(()=>make(0,mp),/不支持的规则版本/);for(const value of [undefined,0]){const raw=E.deserialize(E.serialize(make(1,mp)));if(value===undefined)delete raw.world.autoPostVersion;else raw.world.autoPostVersion=value;const before=structuredClone(raw),loaded=E.migrateWorld(raw);assert.equal(loaded.ok,false);assert.match(loaded.reason,/不支持的规则版本/);assert.deepEqual(raw,before);}}assert.equal(E.upgradeSoloAutoPost,undefined);});
