import {it,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {hallKey,recordHall} from '../../src/career/ui/hof.js';
const source=()=>({seed:1,charId:'c_test00',day:'2025-01-01',cash:10,rng:2,models:[{id:'m1',dims:{code:50,math:40}}],result:{reason:'complete',wealth:20}});
it('同一结束内容重排键和记账标志不改变身份；不修改输入',async()=>{
 const s=source(),before=JSON.stringify(s);const key=await hallKey(s);
 assert.equal(await hallKey({...s,hofSaved:true}),key);assert.equal(await hallKey(Object.fromEntries(Object.entries(s).reverse())),key);assert.equal(JSON.stringify(s),before);
});
it('同种子公司但不同结局、资产、模型或选择状态不会误合并',async()=>{
 const s=source(),key=await hallKey(s);
 for(const patch of [{cash:11},{rng:3},{day:'2025-01-02'},{result:{reason:'bankrupt',wealth:0}},{models:[{id:'m1',dims:{code:51,math:40}}]}])assert.notEqual(await hallKey({...s,...patch}),key);
});
it('不同世界配置/结算排名分开；版本升级元数据不污染结束身份',async()=>{
 const s=source(),w={seed:1,mode:'zero',start:'2024-01',end:'2024-12-30',settings:{days:365},result:{standings:[{id:'c_test00',place:1}]}};
 const k=await hallKey(s,w);assert.equal(await hallKey(s,{...w,endVersion:1,endUpgrade:{from:0}}),k);
 assert.notEqual(await hallKey(s,{...w,settings:{days:730}}),k);assert.notEqual(await hallKey(s,{...w,result:{standings:[{id:'c_test00',place:2}]}}),k);
});

afterEach(()=>{delete globalThis.localStorage;});

it('重复结束和旧档导入幂等，旧无键记录保留，写入失败可重试',async()=>{
 const mem=new Map();let fail=true;
 globalThis.localStorage={getItem:k=>mem.get(k)||null,setItem:(k,v)=>{if(fail)throw Error('quota');mem.set(k,v);}};
 const {HOF_KEY}=await import('../../src/career/ui/storage.js');mem.set(HOF_KEY,JSON.stringify([{company:'旧记录'}]));
 const s=source();assert.equal(await recordHall(s,null,{company:'本局'}),false);assert.equal(s.hofSaved,undefined);
 fail=false;await Promise.all([recordHall(s,null,{company:'本局'}),recordHall(s,null,{company:'本局'})]);
 assert.equal(s.hofSaved,true);assert.equal(JSON.parse(mem.get(HOF_KEY)).length,2);
 await recordHall(source(),null,{company:'同一原始档'});assert.equal(JSON.parse(mem.get(HOF_KEY)).length,2);
 await recordHall({...source(),cash:11},null,{company:'另一结局'});assert.equal(JSON.parse(mem.get(HOF_KEY)).length,3);assert.equal(JSON.parse(mem.get(HOF_KEY))[2].company,'旧记录');
});

it('数组按JSON语义保留未定义项、函数和孔洞为null；长度不会被吞',async()=>{
 const key=v=>hallKey({...source(),legacy:v});
 assert.equal(await key([undefined]),await key([null]));assert.equal(await key([()=>{}]),await key([null]));assert.equal(await key(new Array(1)),await key([null]));
 assert.notEqual(await key([]),await key([undefined]));assert.notEqual(await key(new Array(1)),await key(new Array(2)));
 assert.equal(await key({x:undefined,y:()=>{}}),await key({}));
});
it('旧名人堂含null条目不阻止记账且保留旧数据',async()=>{
 const {HOF_KEY}=await import('../../src/career/ui/storage.js');const mem=new Map([[HOF_KEY,JSON.stringify([null,{company:'旧档'}])]]);
 globalThis.localStorage={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v)};
 const s=source();assert.equal(await recordHall(s,null,{company:'新档'}),true);const rows=JSON.parse(mem.get(HOF_KEY));assert.equal(rows.length,3);assert.equal(rows[1],null);assert.equal(rows[2].company,'旧档');
});
