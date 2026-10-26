import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { setRemote } from '../../src/career/ui/act.js';
globalThis.document ??= {baseURI:'http://localhost/'};
const { change } = await import('../../src/career/ui/pages/service.js');
afterEach(() => setRemote(null));
const fresh = (char='claude',era='y2023') => { E.setProvider(); return E.createGame(char,era,4); };
test('无在线模型开启产品被拒绝：复选框恢复权威关闭且不修改游戏', () => {
 const s=fresh(), before=JSON.stringify(s), t={dataset:{prod:'chat'},checked:true};
 let error;
 change(s,t,{guard:fn=>{try{fn();}catch(e){error=e;}}});
 assert.match(error.message,/还没有发布的模型/); assert.equal(t.checked,false); assert.equal(JSON.stringify(s),before);
});
test('连续重复开启失败仍恢复关闭，每次都保留拒绝提示', () => {
 const s=fresh(), t={dataset:{prod:'chat'},checked:false}; let errors=0;
 for(let i=0;i<3;i++){t.checked=true;change(s,t,{guard:fn=>{try{fn();}catch(e){assert.match(e.message,/还没有发布的模型/);errors++;}}});assert.equal(t.checked,false);}
 assert.equal(errors,3);assert.equal(s.products.chat.on,false);
});
test('在线模型产品成功开启关闭与重复同值提交均保持一致', () => {
 const s=fresh('deepseek','y2025'),t={dataset:{prod:'api'},checked:false};
 assert.ok(E.liveModel(s));
 for(const on of [true,true,false,false,true]) { t.checked=on;change(s,t,{guard:fn=>fn()});assert.equal(s.products.api.on,on);assert.equal(t.checked,on); }
});
