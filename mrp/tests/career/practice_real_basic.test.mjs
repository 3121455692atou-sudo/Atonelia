import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installPracticeContext} from '../../src/career/ui/practice_context.js';
let nativeTouches=0;const durable=new Map([['mrp.sim.v2','formal-save'],['mrp.sim.hof.v2','formal-hof'],['mrp.world.meta.v1','formal-world'],['mrp.chat.settings','formal-settings']]);
for(const name of ['localStorage','sessionStorage','indexedDB'])Object.defineProperty(globalThis,name,{configurable:true,get(){nativeTouches++;throw Error('native storage touched');}});
installPracticeContext(globalThis,'https://game.example/?practice=basic');
globalThis.document={baseURI:'https://game.example/',activeElement:null};
const E=await import('../../src/career/engine.js');
const {createPracticeGame}=await import('../../src/career/sim/practice.js');
const panel=await import('../../src/career/ui/panels/post_plan.js');
const train=await import('../../src/career/ui/pages/train.js');
const {setState,setWorld,setMp}=await import('../../src/career/ui/state.js');
function selectState(s){setState(s);setWorld(null);setMp(null);}
function button(attr,value=''){return{disabled:false,dataset:{[attr.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]:value},hasAttribute:k=>k===attr,closest:()=>null};}
async function click(s,st,attr,value=''){
 const b=button(attr,value);assert.equal(panel.click(s,{closest:()=>b},{st,draw(){}}),true);
 for(let i=0;i<30&&st.postPlanBusy;i++)await Promise.resolve();
 assert.equal(!!st.postPlanBusy,false);assert.equal(st.postPlanError,null);
}
const command=(s,name,args)=>{const r=E.applyCommand(s,{name,args});assert.equal(r.ok,true,r.err);return r.result;};
test('basic uses the actual train renderer and original confirm/select/choose handlers, all 729 normal paths',async(ctx)=>{
 const {game,sessionId}=createPracticeGame('basic');selectState(game);
 const st={postPlanSessionId:sessionId};const v=E.postPlanView(game,sessionId);
 assert.equal(v.deck.length,10);assert.ok(E.postJobFor(game,E.workingModel(game)));
 assert.match(train.render(game,st),/data-pp-confirm/);assert.doesNotMatch(train.render(game,st),/data-tutorial-action/);
 const expected=structuredClone(game);command(expected,'postPlan.confirmDeck',{sessionId,expectedRevision:v.revision,cardIds:v.deck,directionPolicy:v.directionPolicy});
 await click(game,st,'data-pp-confirm');assert.deepEqual(game,expected);
 let count=0;
 async function walk(s){const view=E.postPlanView(s,sessionId);if(view.status==='ready'){count++;assert.equal(view.log.length,6);assert.ok(view.receiptId);return;}
  assert.equal(view.status,'playing');const choices=view.hand.filter(c=>c.affordable);assert.ok(choices.length);
  for(const card of choices){const next=structuredClone(s),expected=structuredClone(s),local={postPlanSessionId:sessionId};selectState(next);
   const html=train.render(next,local);assert.ok(html.includes(`data-pp-select="${card.id}"`));assert.match(html,/data-pp-choose/);
   const before=structuredClone(next);await click(next,local,'data-pp-select',card.id);assert.deepEqual(next,before,'select is not play');
   command(expected,'postPlan.choose',{sessionId,expectedRevision:view.revision,turn:view.turn,cardId:card.id});
   await click(next,local,'data-pp-choose',card.id);assert.deepEqual(next,expected,'real click path must equal production command');
   await walk(next);
  }
 }
 await walk(game);assert.equal(count,729);ctx.diagnostic(`${count} complete real-UI-handler paths; no artificial preparation-card or score gate`);
 assert.equal(nativeTouches,0);assert.deepEqual([...durable],[['mrp.sim.v2','formal-save'],['mrp.sim.hof.v2','formal-hof'],['mrp.world.meta.v1','formal-world'],['mrp.chat.settings','formal-settings']]);
});
test('practice app entry replaces old separate tutorial, bootstraps before app, and coach creates no gameplay buttons',()=>{
 const root=new URL('../../',import.meta.url),read=f=>readFileSync(new URL(f,root),'utf8');
 const app=read('src/career/ui/app.js'),index=read('index.html'),coach=read('src/career/ui/practice_tutorial.js');
 assert.doesNotMatch(app,/from ['"]\.\/pages\/tutorial\.js/);assert.match(app,/location.assign\(practiceURL/);
 assert.match(index,/<script type="module" src="\.\/src\/career\/ui\/bootstrap.js"><\/script>/);assert.doesNotMatch(index,/<script[^>]+src="\.\/src\/career\/ui\/app.js"/);
 assert.equal((coach.match(/createElement\('button'\)/g)||[]).length,2,'exit and explanation advance only, no fake game actions');
 assert.doesNotMatch(coach,/applyCommand|actTutorial|renderTutorial|innerHTML|TUTORIAL_CHAPTERS/);
 assert.match(coach,/data-pp-confirm/);assert.match(coach,/data-pp-select/);assert.match(coach,/data-pp-choose/);
 assert.match(read('src/career/ui/state.js'),/v === 'title' && practiceKind\(\).*exitPractice/);
});
test('network entry points reject practice before fetch or EventSource',async()=>{
 let requests=0;globalThis.fetch=()=>{requests++;throw Error('network');};globalThis.EventSource=class{constructor(){requests++;throw Error('network');}};
 const net=await import('../../src/career/ui/net.js'),chat=await import('../../src/career/ui/chat.js');
 await assert.rejects(net.createRoom(),/练习中/);await assert.rejects(net.joinRoom('abcdef'),/练习中/);assert.throws(()=>net.rejoin('abcdef'),/练习中/);
 const r=await chat.requestChat({base:'https://example.com',model:'test',key:'not-a-real-key',messages:[],fetchImpl:globalThis.fetch});assert.equal(r.ok,false);assert.match(r.reason,/练习中/);assert.equal(requests,0);
});
test('real autosave, world fallback and delayed HOF/post writes stay in old memory even after exit',async()=>{
 const state=await import('../../src/career/ui/state.js'),store=await import('../../src/career/ui/storage.js');
 const {exitPractice}=await import('../../src/career/ui/practice_context.js');
 const {recordHall}=await import('../../src/career/ui/hof.js');
 const {transactPostPlan,persistPostPlanDraft}=await import('../../src/career/ui/post_plan_transaction.js');
 const {storage}=await import('../../src/career/world/save.js');
 const {game,sessionId}=createPracticeGame('basic');selectState(game);await state.save();assert.equal(JSON.parse(localStorage.getItem(store.SAVE_KEY)).charId,'gpt');
 const ws=storage();assert.equal(ws.kind,'localstorage');await ws.save('practice-world');assert.equal(await ws.load(),'practice-world');await ws.remove();
 let digestRelease,writeRelease;const digest=new Promise(r=>digestRelease=r),write=new Promise(r=>writeRelease=r);const originalCrypto=globalThis.crypto;
 Object.defineProperty(globalThis,'crypto',{value:{subtle:{digest:()=>digest}},configurable:true});
 const hall=recordHall(game,null,{name:'practice'});const v=E.postPlanView(game,sessionId);
 const post=transactPostPlan(game,{name:'postPlan.confirmDeck',args:{sessionId,expectedRevision:v.revision,cardIds:v.deck,directionPolicy:v.directionPolicy}},{persist:async(...args)=>{await write;return persistPostPlanDraft(...args);}});
 let destination;globalThis.location={href:'https://game.example/?practice=basic',replace(url){destination=url;}};exitPractice();assert.equal(destination,'https://game.example/');
 assert.equal(Object.getOwnPropertyDescriptor(globalThis,'localStorage').configurable,false);
 digestRelease(new Uint8Array(32).buffer);writeRelease();assert.equal(await hall,true);await post;
 assert.equal(JSON.parse(localStorage.getItem(store.HOF_KEY))[0].name,'practice');assert.equal(E.postPlanView(game,sessionId).status,'playing');
 assert.equal(nativeTouches,0);assert.equal(durable.get(store.SAVE_KEY),'formal-save');assert.equal(durable.get(store.HOF_KEY),'formal-hof');
 Object.defineProperty(globalThis,'crypto',{value:originalCrypto,configurable:true});
});
test('coach points at real controls and has a one-sentence progression, not its own play actions',async()=>{
 const {practiceGuide}=await import('../../src/career/ui/practice_tutorial.js');
 const {game,sessionId}=createPracticeGame('basic');selectState(game);
 const el={disabled:false,hidden:false,getAttribute(){return null;},getClientRects(){return [{}];}};
 const doc=selector=>({querySelectorAll:s=>s===selector?[el]:[],querySelector:()=>null});
 let h=practiceGuide(doc('[data-act="office"]'),game,'basic',sessionId,0);assert.equal(h.element,el);assert.equal(h.text,'点右上角菜单。');
 h=practiceGuide(doc('[data-pp-confirm]'),game,'basic',sessionId,0);assert.equal(h.element,el);assert.equal(h.text,'牌已配好，点这里开始。');
 const v=E.postPlanView(game,sessionId);command(game,'postPlan.confirmDeck',{sessionId,expectedRevision:v.revision,cardIds:v.deck,directionPolicy:v.directionPolicy});
 h=practiceGuide(doc('[data-pp-select]'),game,'basic',sessionId,0);assert.equal(h.text,'点一张想用的牌。');
 h=practiceGuide(doc('[data-pp-choose]'),game,'basic',sessionId,0);assert.equal(h.text,'点「确认出牌」。');
 h=practiceGuide(doc('.pp-info:not([hidden]) [data-pp-info]'),game,'basic',sessionId,0);assert.equal(h.text,'点「关闭说明」，回到手牌。');
 h=practiceGuide({querySelectorAll:()=>[],querySelector:selector=>selector.includes('aria-busy')?{}:null},game,'basic',sessionId,0);assert.equal(h.text,'正在确认，稍等一下。');assert.equal(h.element,undefined);
});

test('practice reserves one viewport slice and never auto-scrolls the card stage',()=>{
 const css=readFileSync(new URL('../../src/career/css/practice_coach.css',import.meta.url),'utf8');
 const coach=readFileSync(new URL('../../src/career/ui/practice_tutorial.js',import.meta.url),'utf8');
 assert.match(css,/body\.is-practice\s*\{[^}]*--game-available-height:calc\(100dvh - var\(--practice-coach-height,52px\)\)[^}]*padding:0;overflow:hidden/);
 assert.doesNotMatch(css,/padding-top:/);
 assert.match(css,/\.is-practice #app\s*\{[^}]*position:fixed;inset:var\(--practice-coach-height,52px\) 0 0;height:var\(--game-available-height\)/);
 assert.match(css,/\.is-practice \.topbar\s*\{ top:0;/);
 assert.match(css,/\.is-practice \.overlay--office \.sheet, \.is-practice \.overlay--office \.office\s*\{ height:var\(--game-available-height\)/);
 assert.match(coach,/target!==leave&&!target\?\.closest\?\.\('\.post-plan'\)/);
 assert.doesNotMatch(coach,/block:'center'/);
});

test('coach prefers original direct home actions and never points through an overlay',async()=>{
 const {practiceGuide}=await import('../../src/career/ui/practice_tutorial.js');
 const {game,sessionId}=createPracticeGame('basic');selectState(game);
 const el=()=>({disabled:false,hidden:false,getAttribute(){return null;},getClientRects(){return [{}];}});
 const menu=el(),train=el(),cards=el(),quick=el(),tab=el(),close=el();
 const root=map=>({querySelectorAll:s=>map[s]||[],querySelector:()=>null});
 let doc=root({'[data-act="office"]':[menu],'[data-act="open-train"]':[train]});
 assert.equal(practiceGuide(doc,game,'basic',sessionId,0).element,train);
 doc=root({'[data-act="office"]':[menu],'[data-act="open-train"]':[train],'[data-act="post-only-cards"]':[cards]});
 assert.equal(practiceGuide(doc,game,'basic',sessionId,0).element,cards);
 doc=root({'[data-act="office"]':[menu],'[data-act="quick"][data-id="tech"]':[quick]});
 assert.equal(practiceGuide(doc,game,'advanced',null,0).element,quick);
 const overlay=Object.assign(el(),root({'[data-page="train"]':[tab],'.overlay [data-close]':[close]}));
 doc=root({'.overlay':[overlay],'[data-act="open-train"]':[train]});
 assert.equal(practiceGuide(doc,game,'basic',sessionId,0).element,tab);
 overlay.querySelectorAll=s=>s==='.overlay [data-close]'?[close]:[];
 assert.equal(practiceGuide(doc,game,'basic',sessionId,0).element,close);
 overlay.querySelectorAll=()=>[];
 assert.equal(practiceGuide(doc,game,'basic',sessionId,0),null,'no visible modal action means no background target');
});

test('basic uses normal post-only mode and actual home exposes the original continue-cards CTA',async()=>{
 const {renderHome}=await import('../../src/career/ui/home.js');
 const {game,sessionId}=createPracticeGame('basic');selectState(game);
 assert.equal(E.isPostOnly(game),true);assert.equal(E.pendingPostOnlySession(game),sessionId);
 const app={className:'',innerHTML:''};renderHome(app);
 assert.match(app.className,/app--post-only/);
 assert.match(app.innerHTML,/<button[^>]*data-act="post-only-cards"[^>]*>继续选牌<\/button>/);
 assert.ok(app.innerHTML.indexOf('data-act="post-only-cards"')<app.innerHTML.indexOf('<main class="home">'));
 const advanced=createPracticeGame('advanced');assert.equal(E.isPostOnly(advanced.game),false);assert.equal(!!advanced.game.automation,false);
});

test('coach availability rejects closed details, offscreen, clipped and covered targets despite layout boxes',async()=>{
 const {practiceTargetAvailable:visible,practiceGuide}=await import('../../src/career/ui/practice_tutorial.js');
 const style={visibility:'visible',display:'block',opacity:'1',pointerEvents:'auto',overflowX:'visible',overflowY:'visible'};
 const rect=(left,top,right,bottom)=>({left,top,right,bottom,width:right-left,height:bottom-top});
 let hit,box=rect(10,100,100,140),parent=null;
 const doc={defaultView:{innerWidth:320,innerHeight:321,getComputedStyle:n=>n.style||style},querySelector:s=>s==='.practice-coach'?{getBoundingClientRect:()=>rect(0,0,320,52)}:null,elementFromPoint:()=>hit};
 const el={ownerDocument:doc,disabled:false,hidden:false,closest(){return null;},getAttribute(){return null;},getClientRects(){return [box];},getBoundingClientRect:()=>box,contains:n=>n===el,get parentElement(){return parent;}};
 hit=el;assert.equal(visible(el),true);
 parent={tagName:'DETAILS',open:false,querySelector:()=>({contains:()=>false})};assert.equal(visible(el),false);
 parent=null;box=rect(10,400,100,440);assert.equal(visible(el),false);
 box=rect(10,0,100,40);assert.equal(visible(el),false,'coach-covered top slice');
 box=rect(10,100,100,140);hit={};assert.equal(visible(el),false,'another element covers the target');
 hit=el;parent={style:{...style,overflowY:'hidden'},getBoundingClientRect:()=>rect(0,0,320,80)};assert.equal(visible(el),false,'clipped by scroll container');
 parent=null;box=rect(10,400,100,440);
 const menu={...el,getBoundingClientRect:()=>rect(260,70,308,110),contains:n=>n===menu};hit=menu;
 doc.querySelectorAll=s=>s==='[data-act="open-train"]'?[el]:s==='[data-act="office"]'?[menu]:[];
 const {game,sessionId}=createPracticeGame('basic');selectState(game);
 assert.equal(practiceGuide(doc,game,'basic',sessionId,0).element,menu,'offscreen train must fall back to visible real menu');
});
