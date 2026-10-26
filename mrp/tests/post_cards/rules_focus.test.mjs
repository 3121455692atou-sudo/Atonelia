import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { CATALOG_CARDS } from '../../src/career/sim/post_catalog.js';
import { describeEffects } from '../../src/career/sim/post_card_dsl.js';
import { CHOICE_TAG_NAMES, choiceMethodName, choiceRuleDescription } from '../../src/career/ui/post_plan_choices.js';
import { setState, setWorld, setMp } from '../../src/career/ui/state.js';
globalThis.document ??= {baseURI:'http://localhost/'};
const {esc} = await import('../../src/career/ui/fmt.js');
const panel = await import('../../src/career/ui/panels/post_plan.js');
const CARD = 'ptc_glm_task_tiles';
function fresh() {
  E.setProvider(); const s=E.createSinglePlayerGame('deepseek','y2025',7);s.queue=[];s.jobs.list=[];
  setState(s);setWorld(null);setMp(null);
  const call=(name,args)=>{const r=E.applyCommand(s,{name,args});assert(r.ok,r.err);return r.result;};
  let v=call('postPlan.open',{modelId:s.working,expectedModelToken:null});
  v=call('postPlan.confirmDeck',{sessionId:v.sessionId,expectedRevision:v.revision,cardIds:v.deck,directionPolicy:v.directionPolicy});
  return {s,v,st:{postPlanSessionId:v.sessionId}};
}
function surface(cardIds=[CARD]) {
  const root={isConnected:true,ownerDocument:{},querySelector:()=>null,querySelectorAll:()=>[]};
  const reader={scrollTop:92},hand={scrollTop:48},listeners=new Map(); let adds=0,removes=0;
  const info={isConnected:true,addEventListener:(key,fn)=>{adds++;listeners.set(key,fn);},removeEventListener:(key,fn)=>{if(listeners.get(key)===fn){removes++;listeners.delete(key);}},querySelector:()=>close,querySelectorAll:()=>[close]};
  const scope={querySelector:selector=>selector==='.pp-hand'?hand:reader};
  function button(attribute,value,inInfo=false) {
    const key=attribute.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
    return {disabled:false,dataset:{[key]:value},focusCount:0,focus(options){this.focusCount++;this.focusOptions=options;document.activeElement=this;},hasAttribute:key=>key===attribute,
      closest:selector=>selector==='.post-plan'?scope:selector==='.pp-info'&&inInfo?info:null};
  }
  const close=button('data-pp-info','',true),header=button('data-pp-info',''),rules=cardIds.map(id=>button('data-pp-card-info',id));
  const el={isConnected:true,querySelector:selector=>selector==='.post-plan'?root:selector==='.pp-info'?info:selector==='.pp-header [data-pp-info]'?header:selector==='.pp-play-scroll'?reader:selector==='.pp-hand'?hand:null,
    querySelectorAll:selector=>selector==='[data-pp-card-info]'?rules:[]};
  return {el,root,info,close,header,rules,reader,hand,listeners,get adds(){return adds;},get removes(){return removes;}};
}
const click=(s,st,button,draw=()=>{})=>panel.click(s,{closest:()=>button},{st,draw});
const escape=handler=>handler({key:'Escape',preventDefault(){},stopImmediatePropagation(){}});

test('GLM rule prose uses the shared Chinese method name while catalogue and save stay byte-identical',()=>{
 const {s,st}=fresh(),before=JSON.stringify(s),raw=E.postPlanCard(s,CARD).desc;
 assert.match(raw,/若上手方法含 curriculum/);
 const html=panel.render(s,{...st,postPlanInfo:true,postPlanDetail:CARD});
 assert.match(html,/若上手方法含 课程：聚焦 \+2，演练稳定 \+1/);assert.doesNotMatch(html,/上手方法含 curriculum/);
 assert.equal(E.postPlanCard(s,CARD).desc,raw);assert.equal(JSON.stringify(s),before);
});

test('all current method conditions share labels, with exact-token unknown/prototype-safe fallback and escaped text',()=>{
 for(const [id,label] of Object.entries(CHOICE_TAG_NAMES)) assert.equal(choiceRuleDescription(`若上手方法含 ${id}；已用 ${id} 次数 ≥ 1`),`若上手方法含 ${label}；已用 ${label} 次数 ≥ 1`);
 assert.equal(choiceRuleDescription('若上手方法含 train；已用 prepare 次数 = 1'),'若上手方法含 训练；已用 准备 次数 = 1');
 for(const value of ['future_method','constructor','__proto__','curriculum_more'])assert.equal(choiceMethodName(value),value);
 assert.equal(choiceRuleDescription('若上手方法含 curriculum_more；已用 future_method 次数 ≥ 1'),'若上手方法含 curriculum_more；已用 future_method 次数 ≥ 1');
 assert.equal(choiceRuleDescription('curriculum is an unrelated literal'),'curriculum is an unrelated literal');
 assert.doesNotMatch(esc(choiceRuleDescription('若上手方法含 future_method<script>')),/<script>/);
 const raw=JSON.stringify(CATALOG_CARDS);
 for(const card of CATALOG_CARDS)assert.doesNotMatch(choiceRuleDescription(describeEffects(card.effects)),/(?:上手方法含|已用) [a-z_]+/);
 assert.equal(JSON.stringify(CATALOG_CARDS),raw);
});

test('Enter-opened card rules return Escape focus to the recreated same-card trigger without scrolling or submitting',()=>{
 const {s,st}=fresh(),before=JSON.stringify(s),first=surface();document.activeElement=first.rules[0];
 click(s,st,first.rules[0]);assert(st.postPlanInfo);
 const dialog=surface();panel.after(dialog.el,s,st,{draw(){}});assert.equal(document.activeElement,dialog.close);
 escape(dialog.listeners.get('keydown'));assert.equal(st.postPlanInfo,false);assert.equal(dialog.listeners.size,0);
 const next=surface();next.reader.scrollTop=0;next.hand.scrollTop=0;panel.after(next.el,s,st,{draw(){}});
 assert.equal(document.activeElement,next.rules[0]);assert.deepEqual(next.rules[0].focusOptions,{preventScroll:true});
 assert.equal(next.reader.scrollTop,92);assert.equal(next.hand.scrollTop,48);assert.equal(st.postPlanInfoReturn,null);
 assert.equal(JSON.stringify(s),before);panel.dispose(s);
});

test('mouse close also restores card trigger; ordinary resources still restore their own header button',()=>{
 const {s,st}=fresh(),before=JSON.stringify(s);
 for(const card of [true,false]) {
  const first=surface();click(s,st,card?first.rules[0]:first.header);
  const dialog=surface();panel.after(dialog.el,s,st,{draw(){}});click(s,st,dialog.close);
  const next=surface();panel.after(next.el,s,st,{draw(){}});
  assert.equal(document.activeElement,card?next.rules[0]:next.header);assert.equal(dialog.listeners.size,0);
 }
 assert.equal(JSON.stringify(s),before);panel.dispose(s);
});

test('missing or different-session card triggers safely fall back to the resource header',()=>{
 const {s,st}=fresh();
 for(const mismatch of [false,true]) {
  st.postPlanInfoReturn={sessionId:mismatch?'another-session':st.postPlanSessionId,cardId:CARD};st.postPlanRestoreFocus=true;
  const next=surface(mismatch?[CARD]:[]);panel.after(next.el,s,st,{draw(){}});assert.equal(document.activeElement,next.header);
 }
 panel.dispose(s);
});

test('dialog relayout does not refocus, redraw detaches old handler, and late old events cannot close the replacement',()=>{
 const {s,st}=fresh(),before=JSON.stringify(s),first=surface();let draws=0;
 click(s,st,first.rules[0]);const a=surface();panel.after(a.el,s,st,{draw(){draws++;}});const old=a.listeners.get('keydown');
 panel.after(a.el,s,st,{draw(){draws++;}});assert.equal(a.adds,1);assert.equal(a.close.focusCount,1);
 const b=surface();panel.after(b.el,s,st,{draw(){draws++;}});assert.equal(a.listeners.size,0);assert.equal(a.removes,1);
 escape(old);assert(st.postPlanInfo);assert.equal(draws,0);assert.equal(document.activeElement,b.close);
 escape(b.listeners.get('keydown'));assert.equal(draws,1);assert.equal(st.postPlanInfo,false);
 assert.equal(JSON.stringify(s),before);panel.dispose(s);
});

test('leaving or detaching rules removes listeners and stale Escape cannot mutate UI or steal newer focus',()=>{
 for(const detached of [false,true]) {
  const {s,st}=fresh(),before=JSON.stringify(s);click(s,st,surface().rules[0]);const d=surface();let draws=0;
  panel.after(d.el,s,st,{draw(){draws++;}});const late=d.listeners.get('keydown');
  if(detached){d.el.isConnected=false;escape(late);assert.equal(draws,0);panel.after(d.el,s,st,{draw(){draws++;}});}
  else panel.dispose(s);
  const other={};document.activeElement=other;const ui=JSON.stringify(st);escape(late);
  assert.equal(d.listeners.size,0);assert.equal(JSON.stringify(st),ui);assert.equal(draws,0);assert.equal(document.activeElement,other);assert.equal(JSON.stringify(s),before);
 }
});

test('ordinary resource dialog Escape returns to its own header rather than a previously opened card',()=>{
 const {s,st}=fresh();st.postPlanInfoReturn={sessionId:st.postPlanSessionId,cardId:CARD};
 const first=surface();click(s,st,first.header);const d=surface();panel.after(d.el,s,st,{draw(){}});
 escape(d.listeners.get('keydown'));const next=surface();panel.after(next.el,s,st,{draw(){}});
 assert.equal(document.activeElement,next.header);assert.deepEqual(next.header.focusOptions,{preventScroll:true});panel.dispose(s);
});

test('a replaced company or session cannot be affected by an old dialog key handler',()=>{
 for(const replacedCompany of [true,false]) {
  const {s,st}=fresh();click(s,st,surface().rules[0]);const d=surface();let draws=0;
  panel.after(d.el,s,st,{draw(){draws++;}});const late=d.listeners.get('keydown');
  if(replacedCompany)setState({});else st.postPlanSessionId='new-session';
  const ui=JSON.stringify(st),before=JSON.stringify(s);escape(late);
  assert.equal(JSON.stringify(st),ui);assert.equal(JSON.stringify(s),before);assert.equal(draws,0);panel.dispose(s);assert.equal(d.listeners.size,0);
 }
});
