import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {COMPANIES,SCENARIOS} from '../../src/career/data/core.js';
import {segmentHitsRect} from '../../src/career/ui/tree_layout.js';
globalThis.document??={baseURI:'http://localhost/'};
const {researchGeometry,render,click}=await import('../../src/career/ui/pages/tech.js');
test('all company domains place every prerequisite below its parents and route around unrelated nodes',()=>{
 for(const c of COMPANIES){const S=E.createGame(c.id,SCENARIOS[0].id,9),tree=E.researchTree(S),g=researchGeometry(tree);assert.equal(g.rects.size,tree.length);
  for(const e of g.edges){const from=g.rects.get(e.from),to=g.rects.get(e.to);assert(to.y>from.y+from.h,`${e.from} -> ${e.to} layered`);for(const [id,r] of g.rects){if(id===e.from||id===e.to)continue;for(let i=1;i<e.points.length;i++)assert(!segmentHitsRect(e.points[i-1],e.points[i],r),`${e.from} -> ${e.to} hits ${id}`);}}
  for(const [id,a] of g.rects)for(const [other,b] of g.rects)if(id!==other)assert(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,`${id} overlaps ${other}`);
 }
});
test('selection opens only the nearby inspector; closing and filters never change the simulation',()=>{
 const s=E.createGame('qwen','y2026',3),before=JSON.stringify(s),st={},button=(q,d={})=>({closest:k=>k===q?{dataset:d}:null}),ctx={st,draw(){}};
 let h=render(s,st);assert(!h.includes('data-tree-popover'));assert.match(h,/data-tree-viewport/);assert.match(h,/tech-tree-links/);
 click(s,button('[data-tech-pick]',{techPick:'repository_audit'}),ctx);h=render(s,st);assert.equal((h.match(/data-tree-popover/g)||[]).length,1);assert.match(h,/data-tree-selected/);
 click(s,button('[data-tech-close]'),ctx);assert(!render(s,st).includes('data-tree-popover'));assert.equal(JSON.stringify(s),before);
});
test('closing research inspector restores focus to the originating technology',async()=>{
 const {after}=await import('../../src/career/ui/pages/tech.js');const s=E.createGame('qwen','y2026',1),st={techSel:'repository_audit'};let focused=0;
 click(s,{closest:q=>q==='[data-tech-close]'?{}:null},{st,draw(){}});
 after({querySelector:()=>null,querySelectorAll:()=>[{dataset:{techNode:'repository_audit'},focus(){focused++;}}]},s,st);
 assert.equal(focused,1);assert.equal(st.techSel,null);assert.equal(st.techReturnFocus,undefined);
});
