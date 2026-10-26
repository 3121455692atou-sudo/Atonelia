import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {RELEASES} from '../../src/career/data/rivals.js';
import {companiesSnapshot} from '../../src/career/sim/provider.js';
import {setWorld,setState,getWorld,getState} from '../../src/career/ui/state.js';
globalThis.document={baseURI:'http://localhost/'};
const {change,click}=await import('../../src/career/ui/pages/settings.js');
const {startSolo,defaultSolo}=await import('../../src/career/ui/pages/solo_setup.js');
const notes=[];
const make=(prefix,seed)=>startSolo({...defaultSolo(false,'post'),name:prefix+'智能',brand:prefix,count:3,year:'2024',years:1},seed).world;
beforeEach(()=>{notes.length=0;globalThis.document={baseURI:'http://localhost/',createElement:()=>({classList:{add(){}},remove(){}}),getElementById:()=>({append:e=>notes.push(e.textContent)})};});
afterEach(()=>{setWorld(null);setState(null);E.migrateWorld({});delete globalThis.document;});
for(const kind of ['valid','bad','no-player','multiplayer']) test(`世界预览${kind}不替换正在玩的Provider/登记表/状态`,async()=>{
 const candidate=make('候选',22); const raw=JSON.parse(E.serialize(candidate));
 if(kind==='bad')delete raw.world.rels;
 if(kind==='multiplayer'){raw.settings.mp=true;raw.world.settings.mp=true;}
 if(kind==='no-player'){delete raw.world.settings.you;for(const c of Object.values(raw.world.companies))c.kind='bot';}
 const w=make('当前',11);const pid=Object.values(w.companies).find(c=>c.kind==='human').id;w.settings.you=pid;
 setWorld(w);setState(w.companies[pid].s);const provider=E.P(),rows=JSON.stringify(RELEASES),companies=companiesSnapshot(),before=E.serialize(w);
 const st={};await change(getState(),{dataset:{import:''},files:[{text:async()=>JSON.stringify(raw)}],value:''},{st,draw(){}});
 assert.equal(E.P(),provider,'预览/失败不能换掉活跃Provider');assert.equal(JSON.stringify(RELEASES),rows);assert.deepEqual(companiesSnapshot(),companies);assert.equal(getWorld(),w);assert.equal(E.serialize(w),before);
 if(kind==='valid') {assert.ok(st.importing?.world);click(getState(),{closest:()=>({dataset:{op:'import-cancel'}})},{st,draw(){}});assert.equal(E.P(),provider);assert.equal(getWorld(),w);assert.equal(st.importing,null);}
 else assert.equal(st.importing,undefined);
 if(kind==='multiplayer') assert.ok(notes.some(x=>x.includes('联机存档不能作为单人局继续或导入')));
});
test('史实局预览世界后发布表逐字段不变（含同分裁定行序ord）',async()=>{
 const text=E.serialize(make('候选',22));E.migrateWorld({});
 const s=E.createSinglePlayerGame('deepseek','y2025',1);setState(s);setWorld(null);
 const before=JSON.stringify(RELEASES),provider=E.P();const st={};
 await change(s,{dataset:{import:''},files:[{text:async()=>text}],value:''},{st,draw(){}});
 assert.ok(st.importing?.world,notes.join('|'));assert.equal(notes.length,0);
 assert.equal(JSON.stringify(RELEASES),before);assert.equal(E.P(),provider);assert.equal(getState(),s);assert.equal(getWorld(),null);
});
