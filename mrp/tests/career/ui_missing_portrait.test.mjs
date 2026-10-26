import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
globalThis.document ??= {baseURI:'http://localhost/'};
const {stagePortrait,face,art}=await import('../../src/career/ui/fmt.js');
test('虚构公司ID没有资源时明确占位，不输出空src或借用别家人物',()=>{
 for(const id of ['c_cgdvgk',null,undefined,'not-a-character']) {
  const html=stagePortrait(id,'青穹');
  assert.match(html,/角色立绘未配置/);assert.doesNotMatch(html,/<img|src=/);
  assert.match(face(id),/face--blank/);assert.doesNotMatch(face(id),/<img/);
 }
});
test('已配置真实人物仍用原立绘与差分，名称正确转义',()=>{
 const html=stagePortrait('deepseek','青穹<测试>','happy');
 assert.match(html,/deepseek-happy-stage.webp/);assert.match(html,/青穹&lt;测试&gt;/);assert.doesNotMatch(html,/未配置/);
 const src=art('deepseek','stage','happy');assert.equal(fs.existsSync(new URL('../../'+src,import.meta.url)),true);
});
test('同一缺失人物反复渲染稳定且不改变公司经营身份',()=>{
 const persona={artId:'c_cgdvgk',name:'青穹',label:'青穹智能'};const before=JSON.stringify(persona);
 assert.equal(stagePortrait(persona.artId,persona.name),stagePortrait(persona.artId,persona.name));
 assert.equal(JSON.stringify(persona),before);
});
