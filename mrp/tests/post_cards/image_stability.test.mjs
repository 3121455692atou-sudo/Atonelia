import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IMAGE_REUSE_LIMIT,rememberImage,rememberImages,releaseImages,reuseImagesIn,reusableImage,renderWithImageReuse,settleImageSwaps} from '../../src/career/ui/image_reuse.js';
import {patchPostPlanNode,patchPostPlanOffice} from '../../src/career/ui/post_plan_render.js';
import {mountPostPlanArt,disposePostPlanArt} from '../../src/career/ui/post_plan_art.js';
// Mutable node/event fixture: tests execute the production DOM algorithm. Actual
// browser screenshots/complete/naturalWidth measurements are separately retained.
class N {
 constructor(doc,tag,attrs={},children=[]){this.ownerDocument=doc;this.tagName=tag.toUpperCase();this.nodeType=tag==='#text'?3:1;this.data=attrs.text||'';this.a={};this.childNodes=[];this.listeners=new Map();this.srcWrites=0;this.complete=false;this.naturalWidth=0;this.scrollTop=0;this.value='';this.checked=false;Object.entries(attrs).filter(([k])=>k!=='text').forEach(([k,v])=>this.setAttribute(k,v));children.forEach(n=>this.insertBefore(n,null));}
 get attributes(){return Object.entries(this.a).map(([name,value])=>({name,value}));}get parentElement(){return this.parentNode;}get firstChild(){return this.childNodes[0]||null;}get nextSibling(){const xs=this.parentNode?.childNodes||[];return xs[xs.indexOf(this)+1]||null;}get isConnected(){return this===this.ownerDocument.body||!!this.parentNode?.isConnected;}
 get classList(){return {contains:k=>(this.a.class||'').split(/\s+/).includes(k),add:k=>{if(!this.classList.contains(k))this.a.class=((this.a.class||'')+' '+k).trim();},remove:k=>{this.a.class=(this.a.class||'').split(/\s+/).filter(x=>x!==k).join(' ');}};}
 getAttribute(k){return this.a[k]??null;}hasAttribute(k){return k in this.a;}setAttribute(k,v){this.a[k]=String(v);if(k==='src'){this.srcWrites++;this.complete=false;this.naturalWidth=0;}}removeAttribute(k){delete this.a[k];}get src(){return this.getAttribute('src');}set src(v){this.setAttribute('src',v);}
 matches(selector){return selector.split(',').some(s=>{s=s.trim();if(s.startsWith('.'))return this.classList.contains(s.slice(1));const a=s.match(/^([a-z]+)?\[([^=\]]+)(?:="([^"]*)")?\]$/);if(a)return (!a[1]||this.tagName===a[1].toUpperCase())&&this.hasAttribute(a[2])&&(a[3]===undefined||this.getAttribute(a[2])===a[3]);return this.tagName===s.toUpperCase();});}
 querySelectorAll(s){return this.childNodes.flatMap(n=>[...(n.matches(s)?[n]:[]),...n.querySelectorAll(s)]);}querySelector(s){return this.querySelectorAll(s)[0]||null;}contains(n){return this===n||this.childNodes.some(c=>c.contains(n));}
 insertBefore(n,b){if(n===b)return;n.remove();if(n.ownerDocument!==this.ownerDocument)adopt(n,this.ownerDocument);const i=b?this.childNodes.indexOf(b):this.childNodes.length;assert(i>=0);this.childNodes.splice(i,0,n);n.parentNode=this;}append(...ns){ns.forEach(n=>this.insertBefore(n,null));}remove(){if(this.parentNode){const p=this.parentNode;this.parentNode=null;p.childNodes=p.childNodes.filter(n=>n!==this);}}replaceWith(n){const p=this.parentNode;if(p){p.insertBefore(n,this);this.remove();}}replaceChildren(...ns){this.childNodes.forEach(n=>n.parentNode=null);this.childNodes=[];for(const n of ns)if(n.tagName==='FRAGMENT')for(const c of [...n.childNodes])this.append(c);else this.append(n);}
 cloneNode(deep=false){const n=new N(this.ownerDocument,this.nodeType===3?'#text':this.tagName,{...this.a,text:this.data});if(deep)this.childNodes.forEach(c=>n.append(c.cloneNode(true)));n.value=this.value;n.checked=this.checked;return n;}
 addEventListener(k,fn){let set=this.listeners.get(k);if(!set)this.listeners.set(k,set=new Set());set.add(fn);}removeEventListener(k,fn){this.listeners.get(k)?.delete(fn);}emit(k){for(const fn of [...(this.listeners.get(k)||[])])fn();}load(){this.complete=true;this.naturalWidth=480;this.emit('load');}
}
function adopt(node,owner){if(node.ownerDocument!==owner){node.ownerDocument=owner;node.documentMoves=(node.documentMoves||0)+1;}for(const child of node.childNodes)adopt(child,owner);return node;}
function doc(){const d={baseURI:'https://local.invalid/game/',templates:new Map(),probes:[]},inert={baseURI:'about:blank'};d.body=new N(d,'body');d.adoptNode=node=>adopt(node,d);d.createElement=tag=>{if(tag==='template')return {content:new N(inert,'fragment'),set innerHTML(value){this.content=adopt(d.templates.get(value).cloneNode(true),inert);}};return new N(d,tag);};d.defaultView={Image:class extends N{constructor(){super(d,'img');d.probes.push(this);}decode(){return new Promise((resolve,reject)=>{this.resolve=()=>{this.load();resolve();};this.reject=reject;});}}};return d;}
const make=(d,tag,a={},children=[])=>new N(d,tag,a,children);
function panel(d,{ids=['a','b'],selected='',wrap=true,info=false}={}){
 const image=(src,a={})=>make(d,'img',{src,...a});
 const scene=image('scene.webp',{'data-pp-key':'scene-image','data-pp-image-key':'scene'}),portrait=image('neutral.webp',{'data-pp-key':'portrait-image','data-pp-image-key':'portrait:p','data-image-identity':'post:p','data-image-src':'neutral.webp'});
 const stage=make(d,'div',{'data-pp-key':'stage',class:'pp-stage'},[portrait]);
 const cards=ids.map(id=>make(d,'article',{'data-pp-key':'hand:'+id},[make(d,'button',{'data-pp-select':id,class:id===selected?'selected':''},[make(d,'span',{'data-pp-key':'art:'+id,class:'pp-card-art pp-art-pending'},[make(d,'span',{class:'pp-art-loading'}),image(id+'.webp',{'data-pp-art':id,'data-pp-image-key':'hand:'+id})])])]));
 const hand=make(d,'div',{'data-pp-key':'hand'},cards),content=wrap?[make(d,'div',{'data-pp-key':'reader'},[stage,hand])]:[stage,hand];
 const root=make(d,'section',{'data-pp-session':'one',class:'post-plan'},[scene,make(d,'div',{'data-pp-key':'main',...(info?{inert:''}:{})},content),make(d,'aside',{'data-pp-key':'info',...(info?{}:{hidden:''})})]);
 return {root,scene,portrait,stage,hand,cards};
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};

test('repeated selection/rules redraw keeps background, portrait, cards and ready states without any src write',()=>{
 const d=doc(),p=panel(d),state={};d.body.append(p.root);p.root.querySelectorAll('img').forEach(i=>i.load());mountPostPlanArt(state,p.root,[]);
 const before=p.root.querySelectorAll('img'),writes=before.map(i=>i.srcWrites);p.hand.scrollTop=91;
 for(let i=0;i<30;i++){const next=panel(d,{selected:i%2?'a':'b',info:i%3===0});patchPostPlanNode(p.root,next.root);mountPostPlanArt(state,p.root,[]);assert.deepEqual(p.root.querySelectorAll('img'),before);assert(before.every(im=>im.complete&&im.naturalWidth));assert(p.root.querySelectorAll('.pp-card-art').every(frame=>frame.classList.contains('pp-art-ready')));}
 assert.deepEqual(before.map(i=>i.srcWrites),writes);assert.equal(p.hand.scrollTop,91);assert.equal(d.probes.length,0);disposePostPlanArt(state);
});

test('keyed hand reorder and wrapper transition keep the true same-card/stage nodes, never substitute another card',()=>{
 const d=doc(),p=panel(d,{wrap:false});d.body.append(p.root);p.root.querySelectorAll('img').forEach(i=>i.load());rememberImages(p.root);
 const a=p.root.querySelector('img[data-pp-art="a"]'),b=p.root.querySelector('img[data-pp-art="b"]');
 patchPostPlanNode(p.root,panel(d,{ids:['b','c'],wrap:true}).root);
 assert.equal(p.root.querySelector('img[data-pp-art="b"]'),b);assert.equal(p.root.querySelector('[data-pp-key="stage"]'),p.stage);assert.equal(p.root.querySelector('[data-pp-key="portrait-image"]'),p.portrait);
 assert.equal(p.root.querySelector('img[data-pp-art="c"]').getAttribute('src'),'c.webp');assert.equal(a.parentNode,null);
 patchPostPlanNode(p.root,panel(d,{ids:['a','b']}).root);assert.equal(p.root.querySelector('img[data-pp-art="a"]'),a);assert(a.complete);
});

test('return to training, close office, then reopen reuses the same already-loaded images rather than HTTP cache guesses',()=>{
 const d=doc(),host=make(d,'div'),p=panel(d);d.body.append(host);host.append(p.root);p.root.querySelectorAll('img').forEach(i=>i.load());const old=p.root.querySelectorAll('img');
 d.templates.set('train',make(d,'fragment',{},[make(d,'div')]));renderWithImageReuse(host,'train');assert(old.every(i=>i.parentNode===null));
 d.templates.set('cards',make(d,'fragment',{},[panel(d).root]));renderWithImageReuse(host,'cards');assert.deepEqual(host.querySelectorAll('img'),old);assert(old.every(i=>i.complete&&i.naturalWidth));
 releaseImages(host);host.replaceChildren();renderWithImageReuse(host,'cards');assert.deepEqual(host.querySelectorAll('img'),old);assert(old.every(i=>i.srcWrites===1));
});

test('shared office/home cache never steals a connected image from another visible surface and stays bounded',()=>{
 const d=doc(),home=make(d,'div'),office=make(d,'div');d.body.append(home,office);const active=make(d,'img',{src:'same.webp'});active.load();home.append(active);rememberImage(active);
 const fresh=make(d,'img',{src:'same.webp'}),next=make(d,'fragment',{},[fresh]);reuseImagesIn(office,next);assert.equal(home.firstChild,active);assert.equal(next.firstChild,fresh);
 const oldest=make(d,'img',{src:'old.webp'});oldest.load();rememberImage(oldest);
 for(let i=0;i<IMAGE_REUSE_LIMIT;i++){const im=make(d,'img',{src:`${i}.webp`});im.load();rememberImage(im);}
 assert.notEqual(reusableImage(make(d,'img',{src:'old.webp'})),oldest);
});

test('real expression change holds previous pixels until decode, installs the decoded node once, and cannot replay opacity effects',async()=>{
 const d=doc(),p=panel(d);d.body.append(p.root);p.portrait.load();rememberImages(p.root);p.portrait.setAttribute('class','pp-fx-portrait-enter');const writes=p.portrait.srcWrites;
 const next=panel(d);next.portrait.setAttribute('src','happy.webp');next.portrait.setAttribute('data-image-src','happy.webp');next.portrait.setAttribute('data-image-alt','happy');patchPostPlanNode(p.root,next.root);
 assert.equal(p.portrait.getAttribute('src'),'neutral.webp');assert(p.portrait.complete);await flush();assert.equal(d.probes.length,1);
 settleImageSwaps(p.root);assert.equal(d.probes.length,1);d.probes[0].resolve();await flush();
 const shown=p.root.querySelector('[data-pp-key="portrait-image"]');assert.equal(shown,d.probes[0]);assert.equal(shown.src,'happy.webp');assert(shown.complete);assert.equal(p.portrait.srcWrites,writes);assert(!shown.classList.contains('pp-fx-portrait-enter'));
});

test('failed or stale decode cannot erase current pixels or update a closed/replaced view; different identities are never reused',async()=>{
 const d=doc(),p=panel(d);d.body.append(p.root);p.portrait.load();rememberImage(p.portrait);
 p.portrait.setAttribute('data-image-src','happy.webp');settleImageSwaps(p.root);await flush();d.probes[0].reject(Error('network'));await flush();assert.equal(p.portrait.src,'neutral.webp');assert(p.portrait.complete);
 p.portrait.setAttribute('data-image-src','worried.webp');settleImageSwaps(p.root);await flush();releaseImages(p.root);d.probes[1].resolve();await flush();assert.equal(p.root.querySelectorAll('img').length,0);assert.equal(p.portrait.src,'neutral.webp');
 const other=make(d,'img',{src:'another.webp','data-image-identity':'post:other'});assert.equal(reusableImage(other),other);
 const failed=make(d,'img',{src:'broken.webp'});failed.complete=true;rememberImage(failed);const retry=make(d,'img',{src:'broken.webp'});assert.equal(reusableImage(retry),retry,'reopening may retry an old failed resource instead of caching failure forever');
});

test('stable root image listeners are reconciled once, removed on filtering/dispose, and late load cannot mutate removed frames',()=>{
 const d=doc(),p=panel(d),state={};d.body.append(p.root);const a=p.root.querySelector('img[data-pp-art="a"]');
 mountPostPlanArt(state,p.root,[]);mountPostPlanArt(state,p.root,[]);assert.equal(a.listeners.get('load').size,1);const late=[...a.listeners.get('load')][0],frame=a.parentNode;
 a.remove();mountPostPlanArt(state,p.root,[]);assert.equal(a.listeners.get('load').size,0);a.complete=true;a.naturalWidth=480;late();assert(frame.classList.contains('pp-art-pending'));
 const b=p.root.querySelector('img[data-pp-art="b"]');b.load();assert(b.parentNode.classList.contains('pp-art-ready'));assert.equal(b.listeners.get('load').size,0);disposePostPlanArt(state);assert.equal(b.listeners.get('error').size,0);
});

test('a changed action is never morphed into the same button, while unchanged controls and their focus survive',()=>{
 const d=doc(),old=make(d,'section',{'data-pp-key':'main'},[make(d,'button',{'data-pp-choose':'a'}),make(d,'input',{'data-pp-filter':'search',value:'a'})]);d.body.append(old);
 const submit=old.firstChild,input=old.childNodes[1];input.value='a';d.activeElement=input;
 const next=make(d,'section',{'data-pp-key':'main'},[make(d,'button',{'data-pp-replan':''}),make(d,'input',{'data-pp-filter':'search',value:'a'})]);next.childNodes[1].value='a';patchPostPlanNode(old,next);
 assert.notEqual(old.firstChild,submit);assert.equal(submit.parentNode,null);assert.equal(old.childNodes[1],input);assert.equal(d.activeElement,input);
});


test('real template inert-document boundary is adopted before reuse, never moves decoded images across documents, and handles an invalid URL base safely',()=>{
 const d=doc(),host=make(d,'div'),p=panel(d);d.body.append(host);host.append(p.root);p.root.querySelectorAll('img').forEach(i=>i.load());const old=p.root.querySelectorAll('img');
 d.templates.set('cards data-pp-session=',make(d,'fragment',{},[panel(d).root]));
 assert(patchPostPlanOffice(host,'cards data-pp-session=',{}));
 assert.deepEqual(host.querySelectorAll('img'),old);
 renderWithImageReuse(host,'cards data-pp-session=');
 assert.deepEqual(host.querySelectorAll('img'),old);
 assert(old.every(i=>i.ownerDocument===d&&!i.documentMoves&&i.complete&&i.srcWrites===1));
 const inert={baseURI:'about:blank'},unsafe=make(inert,'img',{src:'relative.webp'});
 assert.doesNotThrow(()=>rememberImage(unsafe));assert.equal(reusableImage(make(inert,'img',{src:'other.webp'})).src,'other.webp');
});
