import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {COMMANDS} from '../../src/career/sim/commands.js';
import {EVAL} from '../../src/career/data/balance.js';
import {newModel} from '../../src/career/sim/projects.js';
function ready(){const w=E.createWorld({seed:7,start:'2024-01',days:365,companies:[{name:'评测公司',brand:'测试',country:'EU',tier:'specialist',kind:'human'}]});const c=Object.values(w.companies)[0],s=c.s;const m={...newModel(s,{total:32,active:32,arch:'dense'}),id:'m_eval',stage:'post',postDays:30,relDays:0,releases:0,role:'flagship',dims:{knowledge:50,code:50,math:50,writing:50,agent:50,safety:50},name:null,techs:[]};s.models.push(m);s.working=m.id;s.queue=[];return {w,c,s,m};}
test('canonical送评枚举与引擎公开四档一致',()=>assert.deepEqual(COMMANDS.submitEval.args.tier.values,Object.keys(EVAL.TIERS).filter(k=>k!=='legacy')));
for(const tier of ['full','standard','quick','skip'])test(`世界命令可送评 ${tier}`,()=>{const {w,c,s,m}=ready();const r=E.applyNow(w,c.id,{name:'submitEval',args:{modelId:m.id,tier}});assert.equal(r.ok,true,r.err);if(tier==='full'){assert.equal(s.evals[0].tier,'full');assert.equal(s.evals[0].days,42);}});
for(const tier of ['strict','turbo','legacy'])test(`非法档 ${tier} 不改变世界也不别名降档`,()=>{const {w,c,m}=ready(),before=E.serialize(w);const r=E.applyNow(w,c.id,{name:'submitEval',args:{modelId:m.id,tier}});assert.equal(r.ok,false);assert.equal(E.serialize(w),before);});
