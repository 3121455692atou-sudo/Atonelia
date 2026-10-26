import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
globalThis.document = {baseURI:'http://127.0.0.1:8765/'};
const { change, click } = await import('../../src/career/ui/pages/settings.js');
import { setWorld, setState, getWorld, getState } from '../../src/career/ui/state.js';
import { createSinglePlayerGame } from '../../src/career/engine.js';
import { SAVE_KEY, WORLD_LEAVE_KEY } from '../../src/career/ui/storage.js';

afterEach(() => { setWorld(null); setState(null); delete globalThis.location; delete globalThis.localStorage; delete globalThis.sessionStorage; delete globalThis.document; });
function setup(fail = false) {
  const s = createSinglePlayerGame('deepseek', 'y2025', 1);
  const mem = new Map([[SAVE_KEY, '原史实档']]); let reloads = 0; const notices=[];
  globalThis.localStorage = { getItem:k=>mem.get(k)??null, setItem:(k,v)=>{if(fail) throw Error('quota');mem.set(k,v);},removeItem:k=>mem.delete(k)};
  globalThis.sessionStorage = {setItem:(k,v)=>mem.set(k,v)};
  globalThis.location = { reload:()=>reloads++ };
  globalThis.document = {createElement:()=>({classList:{add(){}},remove(){}}),getElementById:()=>({append:e=>notices.push(e.textContent)})};
  const world = { marker:'当前世界' }; setWorld(world); setState(s);
  const st={}; const ctx={st,draw(){}}; const target={dataset:{import:''},value:'file',files:[{text:async()=>JSON.stringify(s)}]};
  const action=op=>({closest:()=>({dataset:{op}})});
  return {s,mem,st,ctx,target,action,world,notices,reloads:()=>reloads,allowWrites:()=>{fail=false;}};
}
test('自洽局选史实存档先预览，取消不覆盖、不刷新', async()=>{
  const a=setup(); await change(a.s,a.target,a.ctx);
  assert.equal(a.mem.get(SAVE_KEY),'原史实档'); assert.equal(a.reloads(),0); assert.ok(a.st.importing?.s);
  click(a.s,a.action('import-cancel'),a.ctx);
  assert.equal(a.mem.get(SAVE_KEY),'原史实档'); assert.equal(a.reloads(),0); assert.equal(getWorld(),a.world);
  assert.equal(getState(),a.s); assert.equal(a.st.importing,null);
});
test('自洽转史实只有确认后持久化并刷新',async()=>{
  const a=setup(); await change(a.s,a.target,a.ctx); click(a.s,a.action('import-confirm'),a.ctx);
  assert.equal(JSON.parse(a.mem.get(SAVE_KEY)).charId,'deepseek'); assert.equal(a.reloads(),1); assert.equal(a.mem.get(WORLD_LEAVE_KEY),'1');
  assert.deepEqual(JSON.parse(a.mem.get(SAVE_KEY)).postPlanSessions,a.s.postPlanSessions);
});
test('确认时存储失败保留当前世界、原主档与重试机会',async()=>{
  const a=setup(true); await change(a.s,a.target,a.ctx); click(a.s,a.action('import-confirm'),a.ctx);
  assert.equal(a.mem.get(SAVE_KEY),'原史实档'); assert.equal(a.reloads(),0); assert.equal(getWorld(),a.world); assert.ok(a.st.importing); assert.ok(a.notices.some(x=>x.includes('没有写成')));
  assert.equal(getState(),a.s);
  a.allowWrites(); click(a.s,a.action('import-confirm'),a.ctx);
  assert.equal(a.reloads(),1); assert.equal(a.mem.get(WORLD_LEAVE_KEY),'1');
  assert.deepEqual(JSON.parse(a.mem.get(SAVE_KEY)).postPlanSessions,a.s.postPlanSessions);
});
