import { it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { newModel } from '../../src/career/sim/projects.js';
import { submitEval } from '../../src/career/sim/evals.js';
import { restoreHistory } from '../helpers/world_provider.mjs';
globalThis.document ??= {baseURI:'http://localhost/'};
const {render}=await import('../../src/career/ui/panels/release_name.js');
afterEach(restoreHistory);
function ready(brand, country='EU') {
  const w=E.createWorld({seed:7,start:'2024-01',days:365,companies:[{name:'独立公司',brand,country,tier:'specialist',kind:'human'}]});
  const s=Object.values(w.companies)[0].s;
  s.persona={...s.persona,name:'Qwen'};
  const m={...newModel(s,{total:32,active:32,arch:'dense'}),id:'m_brand',stage:'post',postDays:30,relDays:0,releases:0,role:'flagship',dims:{knowledge:50,code:50,math:50,writing:50,agent:50,safety:50},name:null,techs:[]};
  s.models.push(m);s.working=m.id;s.queue=[];
  return {w,s,m};
}
for(const country of ['CN','US','EU']) it(`${country}: 自定义品牌不受头像影响，普通表单与顾问送评一致`,()=>{
 const {s,m}=ready('欧陆',country);
 assert.equal(E.suggestName(s,'flagship',m),'欧陆 1');
 assert.equal(E.validateModelName(s,'Qwen 1').ok,false,'仍然禁止冒用别家品牌');
 assert.match(render(s,m,'flagship'),/value="欧陆 1"/);
 const a=E.advise(s).find(a=>a.op?.type==='act'&&a.op.action==='submit');
 assert.ok(a,'存在首次送评建议');assert.match(a.label,/欧陆 1/);
 E.applyAdvice(s,a);assert.equal(s.evals[0].plan.name,'欧陆 1');
});
it('普通默认送评和小模型建议保留品牌末尾数字',()=>{
 const {s,m}=ready('Aurora 7');
 assert.equal(E.suggestName(s,'small',{...m,id:'small',role:'small'}),'Aurora 7 Mini 1');
 submitEval(s,{modelId:m.id,tier:'quick',opts:{}});
 assert.equal(s.evals[0].plan.name,'Aurora 7 1');
});
it('史实下一版本命名不变',()=>{
 restoreHistory();const s=E.createGame('deepseek','y2025',1);
 assert.equal(E.suggestName(s,'flagship'),'DeepSeek-V4');
});
