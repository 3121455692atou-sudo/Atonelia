import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {mountPostPlanFocus,disposePostPlanFocus} from '../../src/career/ui/post_plan_focus.js';
import {setState,setWorld,setMp} from '../../src/career/ui/state.js';
// Executable node-tree/event fixture, not a browser claim. Live DOM QA is separate.
class Element extends EventTarget {
 constructor(doc,tag,attrs={}){super();this.ownerDocument=doc;this.tagName=tag.toUpperCase();this.attrs={};this.children=[];this.focusCalls=0;Object.entries(attrs).forEach(([k,v])=>this.setAttribute(k,v));}
 setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}hasAttribute(k){return k in this.attrs;}removeAttribute(k){delete this.attrs[k];}
 get dataset(){return Object.fromEntries(Object.entries(this.attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v]));}
 get disabled(){return this.hasAttribute('disabled');}get tabIndex(){return this.hasAttribute('tabindex')?Number(this.attrs.tabindex):['BUTTON','INPUT','SELECT','TEXTAREA','SUMMARY','A'].includes(this.tagName)?0:-1;}
 get isConnected(){return this===this.ownerDocument.body||!!this.parentElement?.isConnected;}
 append(...nodes){for(const n of nodes){n.remove();n.parentElement=this;this.children.push(n);}}remove(){if(this.parentElement){this.parentElement.children=this.parentElement.children.filter(n=>n!==this);this.parentElement=null;}}
 contains(node){return this===node||this.children.some(n=>n.contains(node));}
 matches(selector){return selector.split(',').some(part=>{let s=part.trim();const neg=s.match(/:not\(\[([^\]]+)\]\)/);if(neg){if(this.hasAttribute(neg[1]))return false;s=s.replace(neg[0],'');}if(s.includes(' ')){const at=s.lastIndexOf(' ');return this.matches(s.slice(at+1))&&!!this.parentElement?.closest(s.slice(0,at));}if(s.startsWith('.'))return (this.attrs.class||'').split(' ').includes(s.slice(1));const attr=s.match(/^([a-z]+)?\[([^=\]]+)(?:="([^"]*)")?\]$/);if(attr)return (!attr[1]||this.tagName===attr[1].toUpperCase())&&this.hasAttribute(attr[2])&&(attr[3]===undefined||this.getAttribute(attr[2])===attr[3]);return this.tagName===s.toUpperCase();});}
 closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}
 querySelectorAll(selector){return this.children.flatMap(n=>[...(n.matches(selector)?[n]:[]),...n.querySelectorAll(selector)]);}querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 getClientRects(){return this.isConnected&&!this.closest('[hidden],[inert]')?[{}]:[];}
 focus(options){this.focusCalls++;this.focusOptions=options;this.ownerDocument.activeElement=this;this.ownerDocument.emit('focusin',this);}
}
class Document extends EventTarget {
 constructor(){super();this.baseURI='https://local.invalid/';this.defaultView={};this.body=new Element(this,'body');this.activeElement=this.body;this.bound=new Map();}
 addEventListener(type,fn,capture){super.addEventListener(type,fn,capture);let list=this.bound.get(type);if(!list)this.bound.set(type,list=new Set());list.add(fn);}
 removeEventListener(type,fn,capture){super.removeEventListener(type,fn,capture);this.bound.get(type)?.delete(fn);}
 emit(type,target,extra={}){const ev=new Event(type,{cancelable:true});Object.defineProperty(ev,'target',{value:target});Object.assign(ev,extra);let stopped=false;const stop=ev.stopImmediatePropagation.bind(ev);ev.stopImmediatePropagation=()=>{stopped=true;stop();};this.dispatchEvent(ev);if(type==='keydown')for(let node=target;node&&!stopped;node=node.parentElement)node.dispatchEvent(ev);return ev;}
 key(key,shiftKey=false){const target=this.activeElement,ev=this.emit('keydown',target,{key,code:key===' '?'Space':key,shiftKey});if(!ev.defaultPrevented&&key==='Tab'){const list=this.body.querySelectorAll('button,input,select,textarea,a[href],summary,[tabindex]').filter(n=>!n.disabled&&n.tabIndex>=0&&n.getClientRects().length);const at=list.indexOf(target);list[(at+(shiftKey?-1:1)+list.length)%list.length]?.focus();}if(!ev.defaultPrevented&&key==='Enter')target.nativeActivate?.();return ev;}
}
function surface(doc=new Document()){
 const make=(tag,a)=>new Element(doc,tag,a),root=make('section',{class:'post-plan'}),main=make('div',{class:'pp-main'}),header=make('div',{class:'pp-header'});
 const title=make('h2',{'data-pp-focus-entry':'',tabindex:'-1'}),resource=make('button',{'data-pp-info':''}),back=make('button',{'data-pp-back':''}),card=make('button',{'data-pp-select':'basic'}),rules=make('button',{'data-pp-card-info':'basic'}),confirm=make('button',{'data-pp-choose':'',disabled:''});
 const reader=make('div',{class:'pp-play-scroll'}),hand=make('div',{class:'pp-hand'});reader.scrollTop=0;hand.scrollTop=0;
 header.append(title,resource,back);hand.append(card,rules);reader.append(hand);main.append(header,reader,confirm);
 const info=make('aside',{class:'pp-info',hidden:''}),close=make('button',{'data-pp-info':''});info.append(close);root.append(main,info);
 const el=make('div',{class:'office'});el.append(root);doc.body.append(el);
 return {doc,el,root,main,title,resource,back,card,rules,confirm,info,close,reader,hand};
}
function fresh(){E.setProvider();const s=E.createSinglePlayerGame('deepseek','y2025',7);s.queue=[];s.jobs.list=[];setState(s);setWorld(null);setMp(null);const call=(name,args)=>{const r=E.applyCommand(s,{name,args});assert(r.ok,r.err);return r.result;};let v=call('postPlan.open',{modelId:s.working,expectedModelToken:null});v=call('postPlan.confirmDeck',{sessionId:v.sessionId,expectedRevision:v.revision,cardIds:v.deck,directionPolicy:v.directionPolicy});return {s,v,st:{postPlanSessionId:v.sessionId}};}
globalThis.document??={baseURI:'http://localhost/'};
const panel=await import('../../src/career/ui/panels/post_plan.js');

test('initial direct entry focuses a non-submitting heading; first Tab cannot hit the covered home clock',()=>{
 const d=new Document(),clock=new Element(d,'button',{'data-act':'speed-toggle'});d.body.append(clock);let starts=0;clock.nativeActivate=()=>starts++;
 const dom=surface(d),state={};mountPostPlanFocus(state,dom.root,'one');assert.equal(d.activeElement,dom.title);
 d.key('Enter');assert.equal(starts,0);d.key('Tab');assert.equal(d.activeElement,dom.resource);disposePostPlanFocus(state);
});

test('Tab/ShiftTab cycle only through visible enabled card-panel controls, without selecting a card',()=>{
 const dom=surface(),state={},background=new Element(dom.doc,'button');dom.doc.body.append(background);mountPostPlanFocus(state,dom.root,'one');
 const visited=[];for(let i=0;i<18;i++){dom.doc.key('Tab');visited.push(dom.doc.activeElement);}assert(visited.every(n=>dom.root.contains(n)));assert(!visited.includes(dom.confirm));assert(!visited.includes(dom.close));
 dom.resource.focus();dom.doc.key('Tab',true);assert.equal(dom.doc.activeElement,dom.rules);assert.deepEqual(dom.rules.focusOptions,{preventScroll:false});dom.rules.focus();dom.doc.key('Tab');assert.equal(dom.doc.activeElement,dom.resource);disposePostPlanFocus(state);
});

test('background programmatic focus is contained and stale Enter cannot activate the clock before recovery',()=>{
 const dom=surface(),state={},background=new Element(dom.doc,'button');dom.doc.body.append(background);let starts=0;background.nativeActivate=()=>starts++;
 mountPostPlanFocus(state,dom.root,'one');background.focus();assert.equal(dom.doc.activeElement,dom.title);
 dom.doc.activeElement=background;const ev=dom.doc.key('Enter');assert(ev.defaultPrevented);assert.equal(starts,0);assert.equal(dom.doc.activeElement,dom.title);disposePostPlanFocus(state);
});

test('relayout never steals legal focus; redraw restores the same logical control once and not its removed node',()=>{
 const first=surface(),state={};mountPostPlanFocus(state,first.root,'one');first.rules.focus();const count=first.rules.focusCalls;
 mountPostPlanFocus(state,first.root,'one');assert.equal(first.rules.focusCalls,count);
 first.el.remove();first.doc.activeElement=first.doc.body;const next=surface(first.doc);mountPostPlanFocus(state,next.root,'one');
 assert.equal(first.doc.activeElement,next.rules);assert.deepEqual(next.rules.focusOptions,{preventScroll:true});assert.equal(first.rules.focusCalls,count);disposePostPlanFocus(state);
});

test('nested rules keep their own Escape/Tab handler and cannot focus the inert hand',()=>{
 const {s,st}=fresh(),dom=surface();globalThis.document=dom.doc;panel.after(dom.el,s,st,{draw(){}});
 panel.click(s,dom.rules,{st,draw(){}});dom.info.removeAttribute('hidden');dom.main.setAttribute('inert','');panel.after(dom.el,s,st,{draw(){}});
 assert.equal(dom.doc.activeElement,dom.close);dom.doc.key('Tab');assert.equal(dom.doc.activeElement,dom.close);dom.doc.key('Tab',true);assert.equal(dom.doc.activeElement,dom.close);
 dom.card.focus();assert.equal(dom.doc.activeElement,dom.close);dom.doc.key('Escape');assert.equal(st.postPlanInfo,false);
 dom.info.setAttribute('hidden','');dom.main.removeAttribute('inert');panel.after(dom.el,s,st,{draw(){}});assert.equal(dom.doc.activeElement,dom.rules);panel.dispose(s);
});

test('new sessions do not inherit a previous card focus; disposal and detached events leave no document listeners',()=>{
 const dom=surface(),state={};mountPostPlanFocus(state,dom.root,'one');dom.rules.focus();const oldKey=[...dom.doc.bound.get('keydown')][0];
 dom.doc.activeElement=dom.doc.body;mountPostPlanFocus(state,dom.root,'two');assert.equal(dom.doc.activeElement,dom.title);assert.equal(dom.doc.bound.get('keydown').size,1);
 disposePostPlanFocus(state);assert.equal(dom.doc.bound.get('keydown').size,0);assert.equal(dom.doc.bound.get('focusin').size,0);
 dom.doc.activeElement=dom.doc.body;oldKey({key:'Tab',preventDefault(){assert.fail('stale listener');}});assert.equal(dom.doc.activeElement,dom.doc.body);
 mountPostPlanFocus(state,dom.root,'three');dom.el.remove();dom.doc.activeElement=dom.doc.body;dom.doc.key('Tab');assert.equal(dom.doc.bound.get('keydown').size,0);assert.equal(dom.doc.bound.get('focusin').size,0);
});

test('actual panel direct mount and Back restore the same-model training entry without any game mutation',()=>{
 const {s,v,st}=fresh(),before=JSON.stringify(s),dom=surface();globalThis.document=dom.doc;
 panel.after(dom.el,s,st,{draw(){}});assert.equal(dom.doc.activeElement,dom.title);assert.equal(st.postPlanSelected,undefined);
 panel.click(s,dom.back,{st,draw(){}});assert.equal(st.postPlanSessionId,null);dom.root.remove();
 const entry=new Element(dom.doc,'button',{'data-pp-open':v.modelId});dom.el.append(entry);panel.after(dom.el,s,st,{draw(){}});
 assert.equal(dom.doc.activeElement,entry);assert.deepEqual(entry.focusOptions,{preventScroll:true});assert.equal(JSON.stringify(s),before);assert.equal(dom.doc.bound.get('keydown').size,0);panel.dispose(s);
});

test('missing training entry falls back to its visible navigation button, never to the covered homepage',()=>{
 const {s,st}=fresh(),dom=surface();globalThis.document=dom.doc;st.postPlanTrainingFocus={modelId:'removed'};st.postPlanSessionId=null;dom.root.remove();
 const nav=new Element(dom.doc,'nav',{class:'office-nav'}),button=new Element(dom.doc,'button',{'data-page':'train'});nav.append(button);dom.el.append(nav);
 panel.after(dom.el,s,st,{draw(){}});assert.equal(dom.doc.activeElement,button);assert.equal(st.postPlanTrainingFocus,null);panel.dispose(s);
});

test('replacement companies have one document focus owner; disposing the old company cannot release the new trap',()=>{
 const first=surface(),a={},b={};mountPostPlanFocus(a,first.root,'one');const late=[...first.doc.bound.get('keydown')][0];
 const next=surface(first.doc);mountPostPlanFocus(b,next.root,'two');assert.equal(first.doc.activeElement,next.title);
 assert.equal(first.doc.bound.get('keydown').size,1);assert.equal(first.doc.bound.get('focusin').size,1);
 disposePostPlanFocus(a);late({key:'Tab',preventDefault(){assert.fail('old owner');}});
 next.rules.focus();first.doc.key('Tab');assert.equal(first.doc.activeElement,next.resource);disposePostPlanFocus(b);
 assert.equal(first.doc.bound.get('keydown').size,0);assert.equal(first.doc.bound.get('focusin').size,0);
});
