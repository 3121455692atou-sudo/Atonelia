import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import {setState,setWorld,setMp} from '../../src/career/ui/state.js';
globalThis.document??={baseURI:'http://localhost/'};
const panel=await import('../../src/career/ui/panels/post_plan.js');
// Focused static CSS cascade, not browser layout: checks specificity and order.
function rules(text,conditions=[]){
 text=text.replace(/\/\*[\s\S]*?\*\//g,'');const out=[];let pos=0;
 while(pos<text.length){const open=text.indexOf('{',pos);if(open<0)break;const head=text.slice(pos,open).trim();let end=open+1,depth=1;while(end<text.length&&depth){if(text[end]==='{')depth++;if(text[end]==='}')depth--;end++;}const body=text.slice(open+1,end-1);pos=end;
  if(head.startsWith('@media'))out.push(...rules(body,[...conditions,head.slice(6).trim()]));
  else if(!head.startsWith('@'))for(const selector of head.split(','))out.push({selector:selector.trim(),body,conditions});
 }return out;
}
const css=['post_plan.css','responsive_fit.css'].flatMap(name=>rules(fs.readFileSync(new URL('../../src/career/css/'+name,import.meta.url),'utf8')));
function media(query,w,h){return query.split(',').some(part=>{if(/prefers-reduced-motion/.test(part))return false;const ranges=[...part.matchAll(/(min|max)-(width|height)\s*:\s*(\d+)px/g)];return ranges.length>0&&ranges.every(([,bound,axis,n])=>bound==='max'?(axis==='width'?w:h)<=+n:(axis==='width'?w:h)>=+n);});}
function style(target,status,w,h){const computed={},priority={};let order=0;for(const r of css){order++;if(!r.conditions.every(q=>media(q,w,h)))continue;const parts=r.selector.split(/\s+/);if(parts.at(-1)!=='.'+target||/[>+~:[\]]/.test(r.selector))continue;const ancestors=parts.slice(0,-1).join(' ');const classes=[...ancestors.matchAll(/\.([\w-]+)/g)].map(m=>m[1]);if(classes.some(c=>!['post-plan','pp-'+status].includes(c)))continue;const specificity=(r.selector.match(/\./g)||[]).length;for(const declaration of r.body.split(';')){const colon=declaration.indexOf(':');if(colon<0)continue;const name=declaration.slice(0,colon).trim(),value=declaration.slice(colon+1).trim();const entries=name==='overflow'?[['overflow-x',value.split(/\s+/)[0]],['overflow-y',value.split(/\s+/)[1]||value]]:[[name,value]];for(const [k,v] of entries){const p=priority[k];if(!p||specificity>p[0]||specificity===p[0]&&order>=p[1]){computed[k]=v;priority[k]=[specificity,order];}}}}return computed;}
for(const [w,h] of [[320,321],[390,321],[320,568],[390,700],[390,844],[844,390],[1188,360]])test(`CSS cascade keeps hand and confirmation on one bounded surface at ${w}x${h}`,()=>{
 for(const status of ['draft','playing']){const main=style('pp-main',status,w,h);assert.equal(main['overflow-y'],'hidden',status);assert.equal(main['overflow-x'],'hidden');assert.equal(main['min-height'],'0');}
 assert.equal(style('pp-play-scroll','playing',w,h)['overflow-y'],'hidden');
 assert.equal(style('pp-draft-scroll','draft',w,h)['overflow-y'],'auto');
 assert.equal(style('pp-hand','playing',w,h)['grid-template-columns'],'repeat(3,minmax(0,1fr))');
});
test('large tall desktop retains the bounded draft reader instead of competing scroll rails',()=>{assert.equal(style('pp-main','draft',1440,900)['overflow-y'],'hidden');assert.equal(style('pp-draft-scroll','draft',1440,900)['overflow-y'],'auto');});
function fixture(){E.setProvider();const s=E.createSinglePlayerGame('deepseek','y2025',17);setState(s);setWorld(null);setMp(null);const result=E.applyCommand(s,{name:'postPlan.open',args:{modelId:s.working,expectedModelToken:null}});assert(result.ok,result.err);return{s,id:result.result.sessionId};}
function root(readers){const article={isConnected:true,ownerDocument:{},querySelector:()=>null};return{isConnected:true,querySelector:k=>k==='.post-plan'?article:readers[k]||null,querySelectorAll:()=>[]};}
test('whole-surface and draft scroll survive opening/closing rules without writing game state',()=>{
 const{s,id}=fixture(),before=JSON.stringify(s),st={postPlanSessionId:id};const readers={'.pp-main':{scrollTop:451},'.pp-draft-scroll':{scrollTop:232}};
 const surface={querySelector:k=>readers[k]||null};const info={disabled:false,dataset:{},hasAttribute:k=>k==='data-pp-info',closest:k=>k==='.post-plan'?surface:null};
 panel.click(s,{closest:()=>info},{st,draw(){}});assert.equal(st.postPlanMainScroll,451);assert.equal(st.postPlanDraftScroll,232);assert.equal(st.postPlanInfo,true);
 panel.click(s,{closest:()=>({...info,closest:k=>k==='.pp-info'?{}:k==='.post-plan'?surface:null})},{st,draw(){}});
 const restored={'.pp-main':{scrollTop:0},'.pp-draft-scroll':{scrollTop:0}};panel.after(root(restored),s,st,{draw(){}});assert.equal(restored['.pp-main'].scrollTop,451);assert.equal(restored['.pp-draft-scroll'].scrollTop,232);assert.equal(JSON.stringify(s),before);panel.dispose(s);
});
test('scroll offsets from another session never apply to a fresh session',()=>{
 const{s,id}=fixture(),st={postPlanSessionId:id,postPlanScrollSession:'older',postPlanMainScroll:451,postPlanDraftScroll:232};const restored={'.pp-main':{scrollTop:0},'.pp-draft-scroll':{scrollTop:0}};panel.after(root(restored),s,st,{draw(){}});assert.equal(restored['.pp-main'].scrollTop,0);assert.equal(restored['.pp-draft-scroll'].scrollTop,0);panel.dispose(s);
});
test('durable card edits keep the main scroll through both pending and accepted redraws; browser clamps shorter content',async()=>{
 const old=globalThis.localStorage;const saved=new Map();globalThis.localStorage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,String(v)),removeItem:k=>saved.delete(k)};
 try{const{s,id}=fixture(),st={postPlanSessionId:id};let main={scrollTop:451},draft={scrollTop:0};
  const surface={querySelector:k=>k==='.pp-main'?main:k==='.pp-draft-scroll'?draft:null};const button={disabled:false,dataset:{ppDeck:'ptc_qwen_sample_tabs'},hasAttribute:k=>k==='data-pp-deck',closest:k=>k==='.post-plan'?surface:null};
  const observed=[];const draw=()=>{let top=0;main={get scrollTop(){return top;},set scrollTop(value){top=Math.max(0,Math.min(300,value));}};draft={scrollTop:0};panel.after(root({'.pp-main':main,'.pp-draft-scroll':draft}),s,st,{draw(){}});observed.push(main.scrollTop);};
  panel.click(s,{closest:()=>button},{st,draw});await new Promise(r=>setImmediate(r));assert.equal(st.postPlanBusy,false);assert.equal(E.postPlanView(s,id).deck.length,3);assert.ok(observed.length>=2);assert.ok(observed.every(x=>x===300));assert.equal(st.postPlanScrollSession,id);panel.dispose(s);
 }finally{globalThis.localStorage=old;}
});
