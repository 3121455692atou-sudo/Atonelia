import test,{after} from 'node:test';import assert from 'node:assert/strict';import * as E from '../../src/career/engine.js';import {hardness} from '../../src/career/sim/model.js';import {techUp} from '../../src/career/world/tech.js';import {restoreHistory} from '../helpers/world_provider.mjs';after(restoreHistory);
test('same-month public technology removes cached private lead; hot/cold hardness exactly equal',()=>{
 const w=E.createWorld({seed:32,start:'2024-06',days:20,companies:[{name:'北岸',brand:'北岸',country:'CN',tier:'major',kind:'human'},{name:'南岸',brand:'南岸',country:'US',tier:'major',kind:'human'}]});const [a,b]=E.companyList(w);if(!a.s.techs.includes('grpo'))a.s.techs.push('grpo');
 a.s.date=b.s.date='2024-06';a.s.day=b.s.day=w.day;const month=a.s.date,techs=JSON.stringify(a.s.techs),read=JSON.stringify(a.s.techRead);assert(hardness(a.s).leads.includes('grpo'));
 techUp(w,'grpo','paper',b.id,'另一公司正常公开');assert.equal(a.s.date,month);assert.equal(JSON.stringify(a.s.techs),techs);assert.equal(JSON.stringify(a.s.techRead),read);
 const hot=hardness(a.s);assert(!hot.leads.includes('grpo'),'public tech must not retain stale exclusive gain');const loaded=E.migrateWorld(E.serialize(w));assert(loaded.ok,loaded.reason);const cold=hardness(loaded.world.companies[a.id].s);assert.deepEqual(hot,cold);
});
