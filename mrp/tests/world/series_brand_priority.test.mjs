import {it, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {claimName, registerSeries, normName} from '../../src/career/world/names.js';
import {restoreHistory} from '../helpers/world_provider.mjs';
afterEach(restoreHistory);
function fixture(brands=['耐久1','耐久5','外部']) {
 const w=E.createWorld({seed:19,start:'2024-01',days:365,companies:brands.map(brand=>({name:brand+'公司',brand,country:'CN',tier:'specialist',kind:'human'}))});
 return {w, ids:brands.map(b=>Object.values(w.companies).find(c=>c.brand===b).id)};
}
it('自动泛化系列不得夺走已登记兄弟品牌，预告与占名一致',()=>{
 const {w,ids:[a,b,c]}=fixture(); registerSeries(w,a,'耐久1 1');
 assert.equal(E.validateModelName(w.companies[b].s,'耐久5 1').ok,true);
 assert.equal(claimName(w,b,'耐久5 1',{modelId:'same'}),null);
 assert.match(claimName(w,b,'耐久5 1',{modelId:'other'}),/已经/);
 assert.match(claimName(w,c,'耐久5 1',{modelId:'same'}),/已经/);
 assert.equal(w.names[normName('耐久5 1')].org,b);
});
it('泛化词仍保护第三方，兄弟不能冒用系列或别家显式品牌',()=>{
 const {w,ids:[a,b,c]}=fixture(); registerSeries(w,a,'耐久1 1');
 for(const [id,name] of [[c,'耐久99 1'],[b,'耐久 2'],[b,'耐久1 2'],[b,'Claude Nova']]) assert.match(claimName(w,id,name)||'',/品牌词/);
});
it('更晚登记显式品牌不获追溯优先权',()=>{
 const {w,ids:[a,b]}=fixture(); const own=w.brandWords.find(x=>x.org===b);
 w.brandWords=w.brandWords.filter(x=>x!==own);registerSeries(w,a,'耐久1 1');w.brandWords.push(own);
 assert.match(claimName(w,b,'耐久5 1')||'',/品牌词/);
});
it('显式品牌没有series标志不得被优先权绕过',()=>{
 const {w,ids:[a,b]}=fixture(); w.brandWords.push({org:a,text:'耐久'});
 assert.match(claimName(w,b,'耐久5 1')||'',/品牌词/);
});
it('自有series不冒充显式品牌优先权',()=>{
 const {w,ids:[a,b]}=fixture();w.brandWords.find(x=>x.org===b).series=true;registerSeries(w,a,'耐久1 1');
 assert.match(claimName(w,b,'耐久5 1')||'',/品牌词/);
});
it('英文数字和多词品牌遵循原匹配边界',()=>{
 const {w,ids:[a,b,c]}=fixture(['Aurora1','Aurora5 Labs','外部']); registerSeries(w,a,'Aurora1 1');
 assert.equal(claimName(w,b,'Aurora5 Labs 1'),null);
 assert.match(claimName(w,b,'Aurora5 Other 1')||'',/品牌词/);
 assert.match(claimName(w,c,'Aurora5 Labs 2')||'',/品牌词/);
});
it('公司对象遍历顺序和兄弟series发布先后不影响显式品牌可用性',()=>{
 for(const reverse of [false,true]) {
  const {w,ids:[a,b,c]}=fixture();if(reverse)w.companies=Object.fromEntries(Object.entries(w.companies).reverse());
  for(const id of reverse?[b,a]:[a,b]) registerSeries(w,id,w.companies[id].brand+' 1');
  for(const id of [a,b]) assert.equal(claimName(w,id,w.companies[id].brand+' 2'),null);
  assert.match(claimName(w,c,'耐久99 2')||'',/品牌词/);
 }
});
it('原先真实型号保留名仍优先拒绝',()=>{
 const {w,ids:[a]}=fixture();assert.match(claimName(w,a,'GPT-4')||'',/现实里的型号名/);
});
