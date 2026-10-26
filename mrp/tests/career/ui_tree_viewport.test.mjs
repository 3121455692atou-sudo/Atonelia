import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindTreeViewport} from '../../src/career/ui/tree_viewport.js';
function fixture(){
 const events=new Map(),listeners=(name)=>{const map=new Map();events.set(name,map);return {addEventListener(k,fn){const list=map.get(k)||[];list.push(fn);map.set(k,list);},emit(k,e={}){for(const fn of map.get(k)||[])fn(e);}};};
 const v={...listeners('viewport'),scrollLeft:0,scrollTop:0,clientWidth:500,clientHeight:400,style:{},getBoundingClientRect:()=>({left:0,top:0,right:500,bottom:400}),setPointerCapture(){}},stage={style:{}},canvas={dataset:{width:'1200',height:'1000'},style:{},querySelector:()=>null};
 const controls=['in','out','reset','fit'].map(op=>({...listeners(op),dataset:{treeZoom:op}})),scale={};
 const root={...listeners('root'),querySelector:s=>({'[data-tree-viewport]':v,'[data-tree-stage]':stage,'[data-tree-canvas]':canvas}[s]||null),querySelectorAll:s=>s==='[data-tree-zoom]'?controls:[scale]};
 return {root,v,stage,canvas,controls,scale,events};
}
test('camera binds once across repeated layout; zoom and pan stay UI-only and survive redraw',()=>{
 const f=fixture(),st={};bindTreeViewport(f.root,st,'map');bindTreeViewport(f.root,st,'map');
 assert.equal(f.events.get('viewport').get('scroll').length,1);
 f.controls[0].emit('click');assert.equal(st.map.zoom,1.15);assert.equal(f.stage.style.width,'1380px');assert.equal(f.scale.textContent,'115%');
 f.v.scrollLeft=240;f.v.scrollTop=120;f.v.emit('scroll');assert.equal(st.map.left,240);
 const next=fixture();bindTreeViewport(next.root,st,'map');assert.equal(next.v.scrollLeft,240);assert.equal(next.v.scrollTop,120);assert.equal(next.canvas.style.transform,'scale(1.15)');
 next.controls[3].emit('click');assert.equal(st.map.zoom,.4);next.controls[2].emit('click');assert.equal(st.map.zoom,1);
});
test('native scroll is not hijacked; ctrl-wheel and keyboard zoom are bounded',()=>{
 const f=fixture(),st={};bindTreeViewport(f.root,st,'map');
 f.v.emit('wheel',{ctrlKey:false,preventDefault:()=>assert.fail('ordinary scroll stays native')});
 let prevented=0;for(let i=0;i<30;i++)f.v.emit('wheel',{ctrlKey:true,deltaY:1,preventDefault:()=>prevented++});assert.equal(st.map.zoom,.01);assert.equal(prevented,30);
 for(let i=0;i<30;i++)f.v.emit('keydown',{target:f.v,key:'+',preventDefault(){}});assert.equal(st.map.zoom,1.6);
});
test('new inspector receives focus and consumes Escape without closing its office',()=>{
 const f=fixture(),st={};let focused=0,closed=0,stopped=0,prevented=0;
 const close={focus(){focused++;},click(){closed++;}};
 const pop={hidden:false,offsetWidth:200,offsetHeight:150,style:{},offsetParent:{getBoundingClientRect:()=>({left:0,top:0})},querySelector:()=>close};
 f.canvas.querySelector=()=>({getBoundingClientRect:()=>({left:20,right:190,top:30,bottom:130})});
 const lookup=f.root.querySelector;f.root.querySelector=s=>s==='[data-tree-popover]'?pop:lookup(s);
 bindTreeViewport(f.root,st,'map');assert.equal(focused,1);
 f.root.emit('keydown',{key:'Escape',stopPropagation(){stopped++;},preventDefault(){prevented++;}});
 assert.equal(closed,1);assert.equal(stopped,1);assert.equal(prevented,1);
 bindTreeViewport(f.root,st,'map');assert.equal(focused,1,'resize must not steal focus');
});
test('646×643 screen clips the map intersection, keeps inspector actions internally scrollable, and hides offscreen selection',()=>{
 const f=fixture();let focused=0;
 f.v.ownerDocument={defaultView:{innerWidth:646,innerHeight:643,getComputedStyle:()=>({maxHeight:'360px'})}};
 f.v.getBoundingClientRect=()=>({left:100,right:600,top:480,bottom:880});
 let anchor={left:110,right:280,top:504.66,bottom:604.66};
 f.canvas.querySelector=()=>({getBoundingClientRect:()=>anchor});
 const pop={hidden:false,style:{},offsetWidth:280,get offsetHeight(){return Math.min(280,parseFloat(this.style.maxHeight)||280);},offsetParent:{getBoundingClientRect:()=>({left:0,top:0})},querySelector:()=>({focus(){focused++;}})};
 const lookup=f.root.querySelector;f.root.querySelector=s=>s==='[data-tree-popover]'?pop:lookup(s);
 bindTreeViewport(f.root,{},'map');assert.equal(pop.hidden,false);assert.equal(pop.style.maxHeight,'147px');assert.equal(pop.style.overflowY,'auto');assert.equal(focused,1);
 assert(parseFloat(pop.style.top)>=488);assert(parseFloat(pop.style.top)+pop.offsetHeight<=635);
 anchor={...anchor,top:650,bottom:750};f.v.emit('scroll');assert.equal(pop.hidden,true,'a node below the screen cannot summon a popup');
 anchor={left:110,right:280,top:504,bottom:550};f.v.ownerDocument.defaultView.visualViewport={offsetLeft:20,offsetTop:50,width:400,height:520};f.v.emit('scroll');
 assert.equal(pop.hidden,false);assert.equal(pop.style.maxHeight,'74px');assert.equal(pop.style.maxWidth,'304px');assert(parseFloat(pop.style.top)+pop.offsetHeight<=562);
});
test('320/390 narrow viewports can fit the complete wide tree instead of clamping to 35 percent',()=>{
 for(const width of [320,390]){const f=fixture(),st={};f.v.clientWidth=width-48;f.v.clientHeight=330;f.canvas.dataset.width='2400';f.canvas.dataset.height='1800';bindTreeViewport(f.root,st,'map');f.controls[3].emit('click');
 assert(st.map.zoom<.35);assert(parseFloat(f.stage.style.width)<=f.v.clientWidth+.001);assert(parseFloat(f.stage.style.height)<=f.v.clientHeight+.001);assert.equal(f.stage.style.overflow,'hidden');
 const fit=st.map.zoom;f.controls[1].emit('click');assert(st.map.zoom<fit);const out=st.map.zoom;f.controls[0].emit('click');assert(st.map.zoom>out);f.controls[2].emit('click');assert.equal(st.map.zoom,1);
 }
});
test('fit followed by wheel-out stays monotonic, and malformed geometry/cameras never create invalid CSS',()=>{
 const f=fixture(),st={map:{zoom:NaN,left:Infinity,top:-3}};f.v.clientWidth=272;f.canvas.dataset.width='2400';bindTreeViewport(f.root,st,'map');assert.equal(st.map.zoom,1);assert.equal(st.map.left,0);assert.equal(st.map.top,0);
 f.controls[3].emit('click');const fitted=st.map.zoom;f.v.emit('wheel',{ctrlKey:true,deltaY:1,preventDefault(){}});assert(st.map.zoom<fitted);f.controls[2].emit('click');assert.equal(st.map.zoom,1);
 for(const bad of ['0','-1','NaN','Infinity']){const x=fixture(),state={};x.canvas.dataset.width=bad;assert.doesNotThrow(()=>bindTreeViewport(x.root,state));assert.equal(x.stage.style.width,undefined);assert.equal(x.events.get('viewport').size,0);}
});
test('an unusually tiny fit is never enlarged by zoom-out or a downward control wheel',()=>{
 const f=fixture(),st={};f.canvas.dataset.width='100000';f.v.clientWidth=272;bindTreeViewport(f.root,st,'map');f.controls[3].emit('click');const z=st.map.zoom;assert(z<.01);f.controls[1].emit('click');assert(st.map.zoom<=z);f.v.emit('wheel',{ctrlKey:true,deltaY:1,preventDefault(){}});assert(st.map.zoom<=z);f.controls[0].emit('click');assert(st.map.zoom>z);
});
test('fit with nonfinite or collapsed visible dimensions is a no-op',()=>{
 for(const dimension of [0,-1,NaN,Infinity]){const f=fixture(),st={};bindTreeViewport(f.root,st,'map');f.v.clientWidth=dimension;f.controls[3].emit('click');assert.equal(st.map.zoom,1);}
});
