import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
globalThis.document??={baseURI:'http://localhost/'};
const ui=await import('../../src/career/ui/pages/tech.js');
const count=h=>(h.match(/data-tech-node=/g)||[]).length;
function harness(st){let search,html,draws=0,focuses=0;const s=E.createGame('qwen','y2023',4);const before=JSON.stringify(s);
 const draw=()=>{draws++;html=ui.render(s,st);const handlers={};search={value:st.techSearch||'',selectionStart:0,selectionEnd:0,selectionDirection:'none',addEventListener:(k,fn)=>handlers[k]=fn,focus(){focuses++;},setSelectionRange(start,end,direction){this.selectionStart=start;this.selectionEnd=end;this.selectionDirection=direction;},emit(k,e={}){handlers[k]?.(e);}};ui.after({querySelector:q=>q==='[data-tech-search]'?search:null},s,st,{draw});};draw();
 return {draw,get search(){return search;},get html(){return html;},get draws(){return draws;},get focuses(){return focuses;},assertPure(){assert.equal(JSON.stringify(s),before);}};
}
test('research search updates on each input, preserves caret, and clears results without an unrelated click',()=>{
 const st={techFilter:'future',techGroup:'agents'},h=harness(st);const initial=count(h.html);assert(initial>0);
 h.search.value='MCP';h.search.selectionStart=1;h.search.selectionEnd=2;h.search.selectionDirection='backward';h.search.emit('input');
 assert(count(h.html)<initial);assert.equal(h.search.value,'MCP');assert.equal(h.search.selectionStart,1);assert.equal(h.search.selectionEnd,2);assert.equal(h.search.selectionDirection,'backward');assert(h.focuses>0);
 h.search.value='zzzz_nonexistent';h.search.emit('input');assert.equal(count(h.html),0);
 h.search.value='';h.search.emit('input');assert.equal(count(h.html),initial);h.assertPure();
});
test('IME does not redraw mid-composition; composition end and explicit Enter apply the query',()=>{
 const h=harness({});const before=h.draws;h.search.value='工具';h.search.emit('input',{isComposing:true});assert.equal(h.draws,before);
 h.search.emit('compositionend');assert.equal(h.draws,before+1);
 h.search.value='zzzz_nonexistent';let prevented=0;h.search.emit('keydown',{key:'Enter',preventDefault(){prevented++;}});assert.equal(prevented,1);assert.equal(count(h.html),0);h.assertPure();
});
test('compositionend followed by input and office delegated blur/change applies only once',()=>{
 const st={},h=harness(st);let delegatedDraws=0;
 h.search.value='MCP';h.search.selectionStart=3;h.search.selectionEnd=3;const old=h.search;
 old.emit('compositionend');const rendered=h.draws,focused=h.focuses;
 // Browsers emit a final input after compositionend. An old-node change may
 // also be delivered during focus transfer; office delegates it to change().
 old.emit('input');
 ui.change(null,{matches:q=>q==='[data-tech-search]',value:'MCP'},{st,draw(){delegatedDraws++;}});
 assert.equal(h.draws,rendered);assert.equal(h.focuses,focused);assert.equal(delegatedDraws,0);
 h.search.emit('keydown',{key:'Enter',preventDefault(){}});assert.equal(h.draws,rendered);
});
