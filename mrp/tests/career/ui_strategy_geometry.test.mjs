import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {PLAYABLE,SCENARIOS} from '../../src/career/data/core.js';
import {layoutTree,segmentHitsRect} from '../../src/career/ui/tree_layout.js';
globalThis.document??={baseURI:'http://localhost/'};
const ui=await import('../../src/career/ui/pages/strategy.js');
test('all 96 company/year layouts preserve every prerequisite and avoid unrelated nodes',()=>{
  for(const company of PLAYABLE)for(const scenario of SCENARIOS){
    const s=E.createGame(company.id,scenario.id,9),before=JSON.stringify(s),opts=E.strategyOptions(s),g=ui.strategyGeometry(E.resolvedTree(s),opts);
    assert.equal(g.rects.size,opts.length);
    for(const o of opts)for(const group of o.node.prereq||[])for(const parent of group)assert(g.edges.some(e=>e.from===parent&&e.to===o.id));
    for(const [id,r]of g.rects)for(const [other,b]of g.rects)if(id!==other)assert(!(r.x<b.x+b.w&&r.x+r.w>b.x&&r.y<b.y+b.h&&r.y+r.h>b.y),`${id} overlaps ${other}`);
    for(const e of g.edges)for(let i=1;i<e.points.length;i++)for(const [id,r]of g.rects)if(id!==e.from&&id!==e.to)assert(!segmentHitsRect(e.points[i-1],e.points[i],r),`${company.id}: ${e.from} → ${e.to} crosses ${id}`);
    assert.equal(JSON.stringify(s),before);
  }
});
test('repeatable route cycles can be mapped without altering the prerequisite graph',()=>{
  const nodes=[{id:'a',group:'route'},{id:'b',group:'route'},{id:'c',group:'route'}],edges=[{from:'a',to:'b'},{from:'b',to:'a'},{from:'b',to:'c'}];
  const g=layoutTree(nodes,edges,[{id:'route',label:'路线'}]);assert.equal(g.edges.length,3);assert(g.rects.get('c').rank>g.rects.get('a').rank);
});
test('inspector starts closed; selection, close, and read-only commands are UI safe',()=>{
  const s=E.createGame('qwen','y2026',1);s.queue=[];const st={},before=JSON.stringify(s),id=E.strategyOptions(s)[0].id;
  const button=(selector,dataset={})=>({closest:q=>q===selector?{dataset}:null});
  assert.doesNotMatch(ui.render(s,st),/data-tree-popover/);
  ui.click(s,button('[data-strategy-pick]',{strategyPick:id}),{st,draw(){}});assert.match(ui.render(s,st),/data-tree-popover/);
  ui.click(s,button('[data-strategy-close]'),{st,draw(){}});assert.equal(st.strategySel,null);assert.doesNotMatch(ui.render(s,st),/data-tree-popover/);
  ui.click(s,button('[data-strategy-op]',{strategyOp:'start',id}),{st:{readOnly:true},guard:()=>assert.fail('Read-only cannot execute')});
  assert.equal(JSON.stringify(s),before);
});
test('optional branch list and manually opened branches stay open through node/action redraws',()=>{
 const s=E.createGame('qwen','y2026',1),st={},opts=E.strategyOptions(s),o=opts.at(-1),branch=o.node.branch;
 const wrapper={open:true},branchEl={open:true,dataset:{mobileBranch:branch}};
 const root={querySelector:q=>q==='.strategy-list-mode'?wrapper:null,querySelectorAll:()=>[branchEl]};
 ui.after(root,s,st);wrapper.ontoggle();branchEl.ontoggle();assert.equal(st.strategyListOpen,true);assert.equal(st.strategyBranches[branch],true);
 const t={closest:q=>q==='[data-strategy-open]'?{dataset:{strategyOpen:o.id}}:null};ui.click(s,t,{st,draw(){}});
 let html=ui.render(s,st);assert.match(html,/<details class="strategy-list-mode" open>/);assert(html.includes(`data-mobile-branch="${branch}" open>`));assert(html.includes(`data-strategy-detail="${o.id}"`));
 wrapper.open=false;wrapper.ontoggle();assert.equal(st.strategyListOpen,false);assert.doesNotMatch(ui.render(s,st),/<details class="strategy-list-mode" open>/);
});
test('closing strategy inspector restores focus to the originating node after redraw',()=>{
 const s=E.createGame('qwen','y2026',1),id=E.strategyOptions(s)[0].id,st={strategySel:id};let focused=0;
 ui.click(s,{closest:q=>q==='[data-strategy-close]'?{}:null},{st,draw(){}});
 ui.after({querySelector:()=>null,querySelectorAll:q=>q==='[data-strategy-node]'?[{dataset:{strategyNode:id},focus(){focused++;}}]:[]},s,st);
 assert.equal(focused,1);assert.equal(st.strategySel,null);assert.equal(st.strategyReturnFocus,undefined);
});
test('keyboard branch-list expansion closes stale map inspector and restores its own row focus',()=>{
 const s=E.createGame('qwen','y2026',1),id=E.strategyOptions(s)[0].id,st={strategySel:id};let focused=0;
 ui.click(s,{closest:q=>q==='[data-strategy-open]'?{dataset:{strategyOpen:id}}:null},{st,draw(){}});
 assert.equal(st.strategySel,null);assert.equal(st.strategyListOpen,true);
 ui.after({querySelector:()=>null,querySelectorAll:q=>q==='[data-strategy-open]'?[{dataset:{strategyOpen:id},focus(){focused++;}}]:[]},s,st);
 assert.equal(focused,1);assert.equal(st.strategyListFocus,undefined);
});
