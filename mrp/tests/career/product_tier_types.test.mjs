import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {setProduct,setTier} from '../../src/career/sim/service.js';
import {PRICE_TIERS} from '../../src/career/data/core.js';
import {resolveAll} from '../helpers/career_bot.mjs';
const fresh=()=>{const s=E.createGame('gpt','y2025',1);resolveAll(s);return s;};
const unchanged=(s,fn)=>{const before=structuredClone(s);fn();assert.deepEqual(structuredClone(s),before);};
test('product price fields and direct tier setter reject non-string/coercible and inherited names before writes',()=>{
 for(const tier of [['standard'],new String('standard'),[],{},null,1,true,'constructor','__proto__','toString','invalid_tier'])for(const key of ['tier','smallTier']){
  let s=fresh();unchanged(s,()=>assert.throws(()=>setProduct(s,'api',{[key]:tier}),/价格档位/));
  s=fresh();unchanged(s,()=>assert.throws(()=>setTier(s,'api',tier,key),/价格档位/));
 }
 let calls=0;const tier={toString(){calls++;return'standard';},[Symbol.toPrimitive](){calls++;return'standard';}};
 for(const key of ['tier','smallTier']){const s=fresh();unchanged(s,()=>assert.throws(()=>setProduct(s,'api',{[key]:tier}),/价格档位/));unchanged(s,()=>assert.throws(()=>setTier(s,'api',tier,key),/价格档位/));}assert.equal(calls,0);
});
test('engine commands reject array price fields atomically while valid string enums remain accepted',()=>{
 for(const key of ['tier','smallTier'])for(const tier of [['standard'],['budget'],['premium'],[],'constructor','__proto__']){const s=fresh();unchanged(s,()=>assert.equal(E.applyCommand(s,{name:'setProduct',args:{id:'api',patch:{[key]:tier}}}).ok,false));}
 for(const key of ['tier','smallTier'])for(const tier of Object.keys(PRICE_TIERS))for(const name of ['setProduct','setTier']){const s=fresh();const args=name==='setProduct'?{id:'api',patch:{[key]:tier}}:{id:'api',tier,key};const r=E.applyCommand(s,{name,args});assert.equal(r.ok,true,r.err);assert.equal(s.products.api[key],tier);}
});
