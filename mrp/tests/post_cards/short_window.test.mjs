import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import { setState, setWorld, setMp } from '../../src/career/ui/state.js';
globalThis.document ??= { baseURI: 'http://localhost/' };
const panel = await import('../../src/career/ui/panels/post_plan.js');
function fresh() {
 E.setProvider(); const s=E.createSinglePlayerGame('deepseek','y2025',7);s.queue=[];s.jobs.list=[];setState(s);setWorld(null);setMp(null);
 const cmd=(name,args)=>{const r=E.applyCommand(s,{name,args});assert(r.ok,r.err);return r.result;};let v=cmd('postPlan.open',{modelId:s.working,expectedModelToken:null});v=cmd('postPlan.confirmDeck',{sessionId:v.sessionId,expectedRevision:v.revision,cardIds:v.deck,directionPolicy:'model-general'});return {s,v};
}
test('playing layout keeps confirmation outside bounded arena with three cards across',()=>{
 const {s,v}=fresh(),html=panel.render(s,{postPlanSessionId:v.sessionId}),css=fs.readFileSync(new URL('../../src/career/css/responsive_fit.css',import.meta.url),'utf8');
 const start=html.indexOf('data-pp-play-scroll'),hand=html.indexOf('class="pp-hand"'),decision=html.indexOf('class="pp-decision"');
 assert(start>0&&hand>start&&decision>hand);assert.match(html.slice(hand,decision),/<\/div>\s*<\/div><div $/);
 assert.match(css,/@container \(max-height:320px\)/);
 assert.match(css,/\.pp-play-scroll[^}]*overflow:hidden/);
 assert.match(css,/\.post-plan \.pp-decision \{ position:static;flex:none;/);
 assert.match(css,/\.pp-hand \.pp-card-desc[^}]*font-size:13px;/);
 assert.doesNotMatch(css,/!important|\bzoom:|font-size:(?:[0-9]|10)px/);
});
test('selecting a card and restoring its short-window scroll changes no state or hand',()=>{
 const {s,v}=fresh(),bytes=JSON.stringify(s),st={postPlanSessionId:v.sessionId};const scroller={scrollTop:143};
 const container={querySelector:()=>scroller};const button={disabled:false,dataset:{ppSelect:'basic'},hasAttribute:k=>k==='data-pp-select',closest:()=>container};
 panel.click(s,{closest:()=>button},{st,draw(){}});assert.equal(st.postPlanScroll,143);assert.equal(JSON.stringify(s),bytes);
 const restored={scrollTop:0},root={isConnected:true,ownerDocument:{},querySelector:()=>null};
 panel.after({isConnected:true,querySelector:k=>k==='.post-plan'?root:k==='.pp-play-scroll'?restored:null},s,st,{draw(){}});
 assert.equal(restored.scrollTop,143);assert.equal(JSON.stringify(s),bytes);panel.dispose(s);
});

test('desktop choice ledger scroll survives selection and keyboard focus restoration',()=>{
 const {s,v}=fresh(),bytes=JSON.stringify(s),st={postPlanSessionId:v.sessionId},reader={scrollTop:0},hand={scrollTop:94};
 const container={querySelector:k=>k==='.pp-hand'?hand:reader};
 const button={disabled:false,dataset:{ppSelect:'basic'},hasAttribute:k=>k==='data-pp-select',closest:()=>container};document.activeElement=button;
 panel.click(s,{closest:()=>button},{st,draw(){}});assert.equal(st.postPlanHandScroll,94);
 const nextHand={scrollTop:0},root={isConnected:true,ownerDocument:{},querySelector:()=>null};let focused;
 const nextCard={dataset:{ppSelect:'basic'},focus:options=>{focused=options;}};
 panel.after({isConnected:true,querySelector:k=>k==='.post-plan'?root:k==='.pp-hand'?nextHand:k==='.pp-play-scroll'?reader:null,querySelectorAll:()=>[nextCard]},s,st,{draw(){}});
 assert.equal(nextHand.scrollTop,94);assert.deepEqual(focused,{preventScroll:true});assert.equal(JSON.stringify(s),bytes);panel.dispose(s);delete document.activeElement;
});
