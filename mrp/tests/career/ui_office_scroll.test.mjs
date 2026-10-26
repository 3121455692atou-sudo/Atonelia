import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
globalThis.document??={baseURI:'http://localhost/'};
const {retainOfficeScroll}=await import('../../src/career/ui/office.js');
test('same-page tree redraw retains body and short-landscape sheet offsets before measuring details',()=>{
 let nodes={'.office-body':{scrollTop:520,scrollLeft:12},'.sheet':{scrollTop:210,scrollLeft:7}};
 const layer={querySelector:s=>nodes[s]};const restore=retainOfficeScroll(layer,true);
 nodes={'.office-body':{scrollTop:0,scrollLeft:0},'.sheet':{scrollTop:0,scrollLeft:0}};
 restore();assert.deepEqual(nodes,{'.office-body':{scrollTop:520,scrollLeft:12},'.sheet':{scrollTop:210,scrollLeft:7}});
 const source=readFileSync(new URL('../../src/career/ui/office.js',import.meta.url),'utf8');
 const draw=source.slice(source.indexOf('function draw() {'),source.indexOf('function refresh()'));
 assert(draw.indexOf('retainOfficeScroll(')<draw.indexOf('renderWithImageReuse('));
 assert(draw.indexOf('markLongNotes(el)')<draw.indexOf('restoreScroll()'));
 assert(draw.indexOf('restoreScroll()')<draw.indexOf('afterDraw(el, S)'));
 assert.match(draw,/mountedPage===st.page&&mountedState===S/);assert.match(draw,/data-close aria-label="回到主界面"/);
});
test('explicit page changes reset both scroll containers; absent containers are safe',()=>{
 const body={scrollTop:520,scrollLeft:12},sheet={scrollTop:210,scrollLeft:7};
 retainOfficeScroll({querySelector:s=>s==='.sheet'?sheet:body},false)();
 assert.deepEqual(body,{scrollTop:0,scrollLeft:0});assert.deepEqual(sheet,{scrollTop:0,scrollLeft:0});assert.doesNotThrow(()=>retainOfficeScroll(null,true)());
});
