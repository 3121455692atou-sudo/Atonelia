import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import {setState,setWorld,setMp} from '../../src/career/ui/state.js';
globalThis.document??={baseURI:'https://local.invalid/'};
const panel=await import('../../src/career/ui/panels/post_plan.js');
const home=await import('../../src/career/ui/home.js');
function fresh(){E.setProvider();const s=E.createSinglePlayerGame('deepseek','y2025',7);s.queue=[];s.jobs.list=[];setState(s);setWorld(null);setMp(null);return s;}
const cmd=(s,name,args)=>{const r=E.applyCommand(s,{name,args});assert(r.ok,r.err);return r.result;};
test('actual hand uses three ordinary sibling information buttons, never nested buttons or full detail bars',()=>{
 const s=fresh();let v=cmd(s,'postPlan.open',{modelId:s.working,expectedModelToken:null});v=cmd(s,'postPlan.confirmDeck',{sessionId:v.sessionId,expectedRevision:v.revision,cardIds:v.deck,directionPolicy:v.directionPolicy});
 const before=JSON.stringify(s),html=panel.render(s,{postPlanSessionId:v.sessionId}),hand=html.slice(html.indexOf('<div class="pp-hand"'),html.indexOf('<div class="pp-decision"'));
 assert.equal((hand.match(/pp-card-info-icon/g)||[]).length,3);assert.equal((hand.match(/data-pp-select=/g)||[]).length,3);
 assert.equal((hand.match(/<\/button><button class="btn pp-rules-link pp-card-info-icon"/g)||[]).length,3);
 assert.doesNotMatch(hand,/>详情<\/button>/);assert.equal(JSON.stringify(s),before);
});
test('home short labels retain full label titles and secondary navigation uses the existing more command',()=>{
 const s=fresh(),app={};home.renderHome(app);const html=app.innerHTML;
 assert.match(html,/title="数学推理">数学/);assert.match(html,/title="写作对话">写作/);assert.match(html,/title="安全对齐">安全/);
 assert.match(html,/class="btn home-more" data-act="quick" data-id="more"/);
 const links=html.slice(html.indexOf('<nav class="quick-links"'),html.indexOf('</nav>',html.indexOf('<nav class="quick-links"')));
 assert.equal((links.match(/<button/g)||[]).length,1);assert.doesNotMatch(links,/quick-btn--t3/);
});
test('real 500px case receives a fixed HUD budget rather than an arbitrarily shrinkable stage',()=>{
 const css=fs.readFileSync(new URL('../../src/career/css/responsive_fit.css',import.meta.url),'utf8'),last=css.slice(css.indexOf('/* v24:'));
 assert.match(last,/@container \(max-height:540px\)/);assert.match(last,/height:72px;min-height:72px/);
 assert.match(last,/\.home \.panel > \.home-overview \{ order:3/);
 assert.match(last,/\.home \.stage-params \.dim \.dim-l[^}]*white-space:nowrap/);
 assert.doesNotMatch(last,/zoom:|font-size:(?:[0-9]|10)px|!important/);
});
test('ordinary detail tap opens rules without selecting or spending a card',()=>{
 const s=fresh();let v=cmd(s,'postPlan.open',{modelId:s.working,expectedModelToken:null});v=cmd(s,'postPlan.confirmDeck',{sessionId:v.sessionId,expectedRevision:v.revision,cardIds:v.deck,directionPolicy:v.directionPolicy});
 const before=JSON.stringify(s),st={postPlanSessionId:v.sessionId},b={disabled:false,dataset:{ppCardInfo:v.hand[0].id},hasAttribute:k=>k==='data-pp-card-info',closest:()=>null};
 assert(panel.click(s,{closest:()=>b},{st,draw(){}}));assert.equal(st.postPlanInfo,true);assert.equal(st.postPlanSelected,undefined);assert.equal(JSON.stringify(s),before);
});
test('coach and normal arena use one height contract and short HUD keeps every meter',()=>{
 const css=fs.readFileSync(new URL('../../src/career/css/responsive_fit.css',import.meta.url),'utf8'),last=css.slice(css.indexOf('/* v24:'));
 assert.match(last,/\.office:has\(\.post-plan\)[^{]*\{ height:var\(--game-available-height,100dvh\)/);
 assert.match(last,/@container \(max-height:400px\)/);assert.match(last,/\.post-plan \.pp-buffs \{ display:flex;/);
 assert.doesNotMatch(last,/\.pp-buffs[^}]*display:none/);assert.match(last,/width:44px;height:44px;min-height:44px/);
});
