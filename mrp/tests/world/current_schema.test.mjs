import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {companiesSnapshot} from '../../src/career/sim/provider.js';
import {RELEASES} from '../../src/career/data/rivals.js';
import {restoreHistory} from '../helpers/world_provider.mjs';
afterEach(restoreHistory);
const fresh=()=>E.createWorld({seed:212,start:'2025-01',days:30,companies:[{name:'当前存档',brand:'当前',country:'EU',tier:'specialist',kind:'human'}]});
test('世界v2/公司v5同版往返完全一致，加载不改输入对象',()=>{const w=fresh(),raw=E.deserialize(E.serialize(w)),before=JSON.stringify(raw),r=E.migrateWorld(raw);assert.equal(raw.v,2);assert.equal(raw.world.v,2);assert.equal(raw.companies[0].s.v,5);assert.equal(r.ok,true,r.reason);assert.equal(E.serialize(r.world),before);assert.equal(JSON.stringify(raw),before);});
for(const mutate of [d=>delete d.v,d=>d.v=1,d=>d.v='2',d=>d.v=3,d=>delete d.world.v,d=>d.world.v=1,d=>d.companies[0].s.v=4,d=>delete d.companies[0].s.v,d=>d.world.mig={},d=>delete d.world.companies[d.companies[0].s.charId]])test(`旧/混合schema拒绝，Provider登记表与输入不变: ${String(mutate)}`,()=>{
 const w=fresh(),raw=E.deserialize(E.serialize(w));mutate(raw);const before=JSON.stringify(raw),p=E.P(),companies=companiesSnapshot(),rels=JSON.stringify(RELEASES),r=E.migrateWorld(raw);assert.equal(r.ok,false);assert.match(r.reason,/请新开一局/);assert.equal(JSON.stringify(raw),before);assert.equal(E.P(),p);assert.deepEqual(companiesSnapshot(),companies);assert.equal(JSON.stringify(RELEASES),rels);
});
