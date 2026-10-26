import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installPracticeContext, practiceKind, practiceURL, exitPractice, bootWithPractice } from '../../src/career/ui/practice_context.js';
const base='https://game.example/index.html';
function host(search='?practice=basic') {
 const touches={localStorage:0,sessionStorage:0,indexedDB:0};
 const real={localStorage:new Map([['mrp.sim.v2','FORMAL'],['mrp.sim.hof.v2','HOF'],['mrp.chat.v1','ACCOUNT']]),sessionStorage:new Map([['mrp.world.leave.v1','1'],['mrp.chat.key','SECRET']]),indexedDB:{sentinel:'WORLD AND BACKUP'}};
 const g={location:{href:base+search,replace(url){this.replaced=url;}}};
 for(const key of Object.keys(touches))Object.defineProperty(g,key,{configurable:true,enumerable:true,get(){touches[key]++;throw Error('native access forbidden');}});
 return {g,touches,real};
}
test('before app load all properties are immutable memory replacements; native getters are untouched',async()=>{
 const {g,touches}=host();let loads=0;
 const result=await bootWithPractice({global:g,loadApp:async()=>{loads++;assert.equal(practiceKind(g),'basic');for(const key of ['localStorage','sessionStorage','indexedDB']){const d=Object.getOwnPropertyDescriptor(g,key);assert.equal(d.configurable,false);assert.equal(d.writable,false);}assert.equal(g.indexedDB,undefined);assert.equal(g.localStorage.length,0);assert.equal(g.sessionStorage.length,0);}});
 assert.equal(result,'basic');assert.equal(loads,1);assert.deepEqual(touches,{localStorage:0,sessionStorage:0,indexedDB:0});
});
test('memory Storage API coerces values, supports arbitrary keys, and keeps local/session independent',()=>{
 const {g}=host('?practice=advanced');installPracticeContext(g);const l=g.localStorage,s=g.sessionStorage;
 l.setItem('a',42);l.setItem('__proto__',null);l.setItem('getItem','ordinary key');
 assert.equal(l.length,3);assert.equal(l.getItem('a'),'42');assert.equal(l.getItem('__proto__'),'null');assert.equal(l.getItem('getItem'),'ordinary key');assert.equal(l.key(0),'a');assert.equal(l.key(3),null);assert.equal(l.getItem('absent'),null);
 l.setItem('a',false);assert.equal(l.length,3);assert.equal(l.getItem('a'),'false');s.setItem('a','session');assert.equal(l.getItem('a'),'false');l.removeItem('a');assert.equal(l.length,2);l.clear();assert.equal(l.length,0);assert.equal(s.getItem('a'),'session');
 assert.throws(()=>{g.localStorage={};},TypeError);assert.throws(()=>Object.defineProperty(g,'indexedDB',{value:{}}),TypeError);
});
test('ordinary URL preserves native descriptors without touching storage or installing a context',async()=>{
 const {g,touches}=host('');const before=Object.getOwnPropertyDescriptors(g);let loads=0;
 assert.equal(await bootWithPractice({global:g,loadApp:()=>{loads++;}}),null);assert.equal(loads,1);assert.equal(practiceKind(g),null);
 for(const k of ['localStorage','sessionStorage','indexedDB'])assert.deepEqual(Object.getOwnPropertyDescriptor(g,k),before[k]);
 assert.deepEqual(touches,{localStorage:0,sessionStorage:0,indexedDB:0});
});
test('unknown, empty or duplicate practice parameters fail closed before app import',async()=>{
 for(const query of ['?practice=','?practice=bogus','?practice=basic&practice=advanced','?practice=basic&practice=basic']){
  const {g,touches}=host(query);let loads=0;await assert.rejects(bootWithPractice({global:g,loadApp:()=>loads++}),/练习地址无效/);assert.equal(loads,0);assert.deepEqual(touches,{localStorage:0,sessionStorage:0,indexedDB:0});
 }
});
test('any non-configurable browser storage descriptor blocks app import without native reads',async()=>{
 for(const blocked of ['localStorage','sessionStorage','indexedDB']){
  const {g,touches}=host();Object.defineProperty(g,blocked,{configurable:false,get(){touches[blocked]++;throw Error('native getter');}});
  let loads=0;await assert.rejects(bootWithPractice({global:g,loadApp:()=>loads++}),/无法安全/);assert.equal(loads,0);assert.deepEqual(touches,{localStorage:0,sessionStorage:0,indexedDB:0});
 }
});
test('property-definition failure and failed readback never load the app',async()=>{
 for(const mode of ['define','read']){
  const {g,touches}=host();let loads=0;
  const broken=new Proxy(g,{defineProperty(target,key,desc){if(mode==='define'&&key==='sessionStorage')throw Error('browser denied');return Reflect.defineProperty(target,key,desc);},get(target,key,receiver){if(mode==='read'&&key==='sessionStorage'&&Object.hasOwn(Object.getOwnPropertyDescriptor(target,key)||{},'value'))throw Error('readback denied');return Reflect.get(target,key,receiver);}});
  await assert.rejects(bootWithPractice({global:broken,loadApp:()=>loads++}));assert.equal(loads,0);assert.equal(practiceKind(broken),null);assert.deepEqual(touches,{localStorage:0,sessionStorage:0,indexedDB:0});
 }
});
test('installation is idempotent only for the same document and kind; changing URL cannot unseal storage',()=>{
 const {g}=host();installPracticeContext(g);g.localStorage.setItem('progress','1');assert.equal(installPracticeContext(g),'basic');assert.equal(g.localStorage.getItem('progress'),'1');
 assert.throws(()=>installPracticeContext(g,base),/环境已改变/);assert.throws(()=>installPracticeContext(g,base+'?practice=advanced'),/环境已改变/);assert.equal(practiceKind(g),'basic');
});
test('navigation leaves old realm sealed: late async work and BFCache-like revival write only old memory',async()=>{
 const {g,touches,real}=host();const before=structuredClone(real);installPracticeContext(g);
 let finish;const deferred=new Promise(resolve=>finish=resolve);
 const late=(async()=>{await deferred;g.localStorage.setItem('mrp.sim.hof.v2','PRACTICE HOF');g.sessionStorage.setItem('mrp.chat.key','PRACTICE');})();
 exitPractice(g);assert.equal(g.location.replaced,base);finish();await late;
 assert.equal(g.localStorage.getItem('mrp.sim.hof.v2'),'PRACTICE HOF');assert.equal(g.indexedDB,undefined);assert.deepEqual(real,before);assert.deepEqual(touches,{localStorage:0,sessionStorage:0,indexedDB:0});
 // A retained document never restores native bindings when navigated away.
 assert.equal(Object.getOwnPropertyDescriptor(g,'localStorage').configurable,false);
});
test('fresh refresh has empty memory while previous document data and formal storage stay separate',()=>{
 const one=host(),two=host();installPracticeContext(one.g);one.g.localStorage.setItem('mrp.sim.v2','PRACTICE');installPracticeContext(two.g);
 assert.equal(two.g.localStorage.getItem('mrp.sim.v2'),null);assert.equal(one.g.localStorage.getItem('mrp.sim.v2'),'PRACTICE');assert.equal(two.real.localStorage.get('mrp.sim.v2'),'FORMAL');
});
test('practice navigation preserves path/other parameters, replaces mode, removes fragment; exit removes all practice values',()=>{
 assert.equal(practiceURL('advanced',base+'?x=1&practice=basic#old'),base+'?x=1&practice=advanced');assert.throws(()=>practiceURL('other',base));
 const {g}=host('?x=1&practice=basic&practice=advanced#old');exitPractice(g);assert.equal(g.location.replaced,base+'?x=1');
});
test('bootstrap has only pure context static import and canonical dynamic app import, never fallback app loading',()=>{
 const source=readFileSync(new URL('../../src/career/ui/bootstrap.js',import.meta.url),'utf8');
 assert.match(source,/import \{ bootWithPractice, exitPractice \} from '\.\/practice_context\.js'/);assert.match(source,/loadApp: async \(\) =>/);assert.match(source,/await import\('\.\/app\.js'\)/);assert.match(source,/await app\.bootReady/);
 assert.equal((source.match(/import\('\.\/app\.js'\)/g)||[]).length,1);assert.doesNotMatch(source,/from ['"].*(?:engine|app)\.js/);
});
