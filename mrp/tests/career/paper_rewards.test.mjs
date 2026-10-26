import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {publishPapers} from '../../src/career/sim/research.js';
import {resolveAll} from '../helpers/career_bot.mjs';
const fresh=()=>{const s=E.createGame('deepseek','y2025',7);resolveAll(s);s.firsts={fp8:s.day,grpo:s.day,rope:s.day};s.papers={};return s;};
const copy=s=>structuredClone(s);
test('each fresh paper rewards once in first-occurrence order; complete state equals unique input',()=>{
 const a=fresh(),b=copy(a);const one=publishPapers(a,['grpo','fp8']),many=publishPapers(b,['grpo','grpo','fp8','grpo','fp8']);
 assert.deepEqual(many.map(x=>x.id),['grpo','fp8']);assert.deepEqual(many,one);assert.deepEqual(b,a);
 const once=copy(b);assert.deepEqual(publishPapers(b,['fp8','grpo','grpo']),[]);assert.deepEqual(b,once);
});
test('mixed old/unknown/non-string/inherited IDs are ignored without duplicate rewards',()=>{
 const a=fresh();a.papers.fp8=a.day;const b=copy(a);
 assert.deepEqual(publishPapers(a,['grpo']).map(x=>x.id),['grpo']);
 assert.deepEqual(publishPapers(b,['fp8','missing','grpo',null,7,{},'constructor','__proto__','grpo']).map(x=>x.id),['grpo']);assert.deepEqual(b,a);
});
test('empty selection is a no-op and malformed non-array rejects before any write',()=>{
 const s=fresh(),before=copy(s);assert.deepEqual(publishPapers(s,[]),[]);assert.deepEqual(s,before);
 for(const input of [null,undefined,7,'fp8',{}]){delete s.papers;const snap=copy(s);assert.throws(()=>publishPapers(s,input),/列表必须是数组/);assert.deepEqual(s,snap);}
});
test('submitEval skip duplicates match unique complete state and result; unknown elements do not introduce late throws',()=>{
 const base=fresh();const m=E.workingModel(base);m.postDays=Math.max(m.postDays||0,(m.relDays||0)+30);
 const a=copy(base),b=copy(base),c=copy(base);
 const one=E.submitEval(a,{modelId:m.id,tier:'skip',opts:{papers:['grpo','fp8']}});
 const many=E.submitEval(b,{modelId:m.id,tier:'skip',opts:{papers:['grpo','grpo','fp8','grpo']}});
 const invalid=E.submitEval(c,{modelId:m.id,tier:'skip',opts:{papers:['grpo',null,{},'missing','fp8']}});
 assert.deepEqual(many,one);assert.deepEqual(invalid,one);assert.deepEqual(b,a);assert.deepEqual(c,a);
});
