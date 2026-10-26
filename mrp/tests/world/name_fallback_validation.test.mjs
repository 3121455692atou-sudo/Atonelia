import {it,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {newModel} from '../../src/career/sim/projects.js';
import {submitEval} from '../../src/career/sim/evals.js';
import {evaluationCandidate} from '../../src/career/sim/automation_evaluation.js';
import {restoreHistory} from '../helpers/world_provider.mjs';
afterEach(restoreHistory);
function ready(){
 const w=E.createWorld({seed:7,start:'2024-01',days:365,companies:[{name:'自有公司',brand:'自有',country:'EU',tier:'specialist',kind:'human'},{name:'外部公司',brand:'外部',country:'EU',tier:'specialist',kind:'bot'}]});
 const c=Object.values(w.companies).find(c=>c.brand==='自有'),s=c.s;
 const m={...newModel(s,{total:32,active:32,arch:'dense'}),id:'m_test',stage:'post',postDays:30,relDays:0,releases:0,role:'flagship',dims:{knowledge:50,code:50,math:50,writing:50,agent:50,safety:50},name:null,techs:[]};
 s.models.push(m);s.working=m.id;s.queue=[];E.enableAutomation(s);
 return {w,s,m};
}
it('正常建议、合法日期兜底仍使用原候选',()=>{
 const {s,m}=ready();assert.equal(E.releaseNamePlan(s,m).name,'自有 1');
 const p=E.P(),orig=p.nameTaken;p.nameTaken=(state,name,id)=>/^自有 \d+$/.test(name)?'已经被预订':orig.call(p,state,name,id);
 assert.deepEqual(E.releaseNamePlan(s,m),{ok:true,name:`自有 ${s.day}`,grant:null,reason:''});
});
it('非法品牌兜底失败，连续预检和送评均不改变任何资源或账本',()=>{
 const {w,s,m}=ready();s.company.name='外部';
 E.advise(s); // 初始化顾问原有的季度供给缓存，不属于送评资源扣除。
 const before=E.serialize(w);
 const v=E.validateModelName(s,E.suggestName(s,'flagship',m),{role:'flagship',modelId:m.id});
 const failed={ok:false,name:null,grant:null,reason:v.reason};assert.match(v.reason,/品牌/);
 const advice={op:{type:'act',action:'submit',arg:{modelId:m.id,tier:'quick'}}};
 for(let i=0;i<2;i++){
  assert.deepEqual(E.releaseNamePlan(s,m),failed);
  assert.throws(()=>submitEval(s,{modelId:m.id,tier:'quick'}),e=>e.message===v.reason);
  const c=evaluationCandidate(s,advice,()=>false);assert.equal(c.candidate,null);assert.equal(c.reason,v.reason);
  assert.equal(E.advise(s).some(a=>a.op?.type==='act'&&a.op.action==='submit'),false);
  assert.deepEqual(JSON.parse(E.serialize(w)),JSON.parse(before));
 }
});
it('全名重名兜底同样拒绝，不绕过原占名保护',()=>{
 const {w,s,m}=ready(),p=E.P();p.nameTaken=()=> '这个名字已经被别家预订了';
 const before=E.serialize(w),r=E.releaseNamePlan(s,m);
 assert.deepEqual(r,{ok:false,name:null,grant:null,reason:'这个名字已经被别家预订了'});
 assert.throws(()=>submitEval(s,{modelId:m.id,tier:'quick'}),/已经被别家预订/);
 assert.deepEqual(JSON.parse(E.serialize(w)),JSON.parse(before));
});
