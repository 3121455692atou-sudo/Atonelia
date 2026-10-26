import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import {setState,setWorld,setMp} from '../../src/career/ui/state.js';
globalThis.document ??= {baseURI:'https://local.invalid/'};
const panel=await import('../../src/career/ui/panels/post_plan.js');
function fresh(company='qwen',scenario='y2025') {
 E.setProvider();const s=E.createSinglePlayerGame(company,scenario,7);s.jobs.list=[];s.queue=[];
 setState(s);setWorld(null);setMp(null);const r=E.applyCommand(s,{name:'postPlan.open',args:{modelId:s.working,expectedModelToken:null}});assert(r.ok,r.err);return {s,v:r.result};
}
const listed=html=>[...html.matchAll(/data-pp-key="catalogue:([^"]+)"/g)].map(m=>m[1]);
for(const company of ['glm','image2','suno','elevenlabs'])for(const year of ['y2023','y2025'])test(`${company}/${year}: every deck-builder page contains only real unlocked choices and leaves saved state untouched`,()=>{
 const {s,v}=fresh(company,year),before=JSON.stringify(s),seen=[];
 const catalogue=E.postPlanCatalogue(s,{availability:'unlocked'});
 for(let page=0;page<catalogue.pages;page++){
  const st={postPlanSessionId:v.sessionId,postPlanQuery:{page,availability:'locked',scope:'all'}};
  const html=panel.render(s,st),ids=listed(html),expected=E.postPlanCatalogue(s,{page,availability:'unlocked'}).cards.map(c=>c.id);
  assert.deepEqual(ids,expected);assert(ids.every(id=>E.postPlanCard(s,id).unlocked));seen.push(...ids);
  assert.doesNotMatch(html,/data-pp-filter="(?:availability|scope)"|目录166张/);
  assert.deepEqual(st.postPlanQuery,{page,availability:'locked',scope:'all'},'render never rewrites remembered UI query');
 }
 assert.equal(seen.length,catalogue.total);assert.equal(new Set(seen).size,seen.length);assert.equal(JSON.stringify(s),before);
});
test('empty search has an explicit non-submitting reset and preserves local draft selection and the saved session',()=>{
 const {s,v}=fresh(),st={postPlanSessionId:v.sessionId,postPlanQuery:{search:'no-such-card',page:999},postPlanDeck:{sessionId:v.sessionId,ids:v.deck.slice(0,3)}},before=JSON.stringify(s),deck=structuredClone(st.postPlanDeck);
 assert.match(panel.render(s,st),/当前筛选没有已解锁卡牌/);assert.deepEqual(listed(panel.render(s,st)),[]);
 let draws=0;const button={disabled:false,hasAttribute:k=>k==='data-pp-clear-filters',closest:()=>null};
 const target={closest:selector=>selector.includes('[data-pp-clear-filters]')?button:null};
 assert(panel.click(s,target,{st,draw(){draws++;}}));assert.equal(draws,1);assert.deepEqual(st.postPlanQuery,{});assert.deepEqual(st.postPlanDeck,deck);assert.equal(JSON.stringify(s),before);assert(listed(panel.render(s,st)).length>0);
});
test('hiding locked choices never weakens click or command validation; existing legal deck survives every filter',()=>{
 const {s,v}=fresh(),st={postPlanSessionId:v.sessionId},locked=E.postPlanCatalogue(s,{availability:'locked'}).cards[0];assert(locked&&!locked.unlocked);
 const before=JSON.stringify(s),button={disabled:false,dataset:{ppDeck:locked.id},hasAttribute:k=>k==='data-pp-deck',closest:()=>null};
 panel.click(s,{closest:()=>button},{st,draw(){throw Error('locked click must not redraw');}});assert.equal(st.postPlanDeck,undefined);
 const r=E.applyCommand(s,{name:'postPlan.confirmDeck',args:{sessionId:v.sessionId,expectedRevision:v.revision,cardIds:['basic',...v.deck.filter(id=>id!=='basic').slice(0,2),locked.id],directionPolicy:'model-general'}});assert.equal(r.ok,false);assert.equal(JSON.stringify(s),before);
 for(const query of [{search:'missing'}, {cost:'3'}, {character:locked.characterId}, {tag:'reserve'}]){
  const html=panel.render(s,{...st,postPlanQuery:query});for(const id of v.deck)assert(html.includes(`data-pp-deck="${id}"`));
 }
 assert.equal(JSON.stringify(s),before);
});
test('draft reader closes before confirmation; responsive CSS preserves returned HUD design without touching image lifecycle',()=>{
 const {s,v}=fresh(),html=panel.render(s,{postPlanSessionId:v.sessionId});
 const reader=html.indexOf('class="pp-draft-scroll"'),confirm=html.indexOf('data-pp-confirm');assert(reader>0&&confirm>reader);assert.match(html.slice(reader,confirm),/<\/div>\s*<button[^>]*$/);
 const css=fs.readFileSync(new URL('../../src/career/css/responsive_fit.css',import.meta.url),'utf8');
 assert.match(css,/\.pp-draft-scroll[^}]*overflow-y:auto/);assert.match(css,/\.pp-main > \[data-pp-confirm\] \{ position:static;flex:none/);
 assert.match(css,/max-width:380px/);assert.match(css,/max-height:480px/);assert.match(css,/prefers-reduced-motion/);
 assert.doesNotMatch(css,/!important|\bzoom:|\.pp-scenery[^}]*opacity:0|\.stage-figure\s*\{[^}]*display:none/);
});

test('responsive overrides are loaded after every base stylesheet (not an orphaned CSS file)',()=>{
 const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
 const sheets=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m=>m[1]);
 assert.match(sheets.at(-1),/responsive_fit\.css/);
 for(const href of sheets)assert(fs.existsSync(new URL('../../'+href.split('?')[0],import.meta.url)),href);
});

test('HUD units cannot compress their labels and training is highlighted only when current',()=>{
 const css=fs.readFileSync(new URL('../../src/career/css/responsive_fit.css',import.meta.url),'utf8');
 const office=fs.readFileSync(new URL('../../src/career/css/office.css',import.meta.url),'utf8');
 assert.match(css,/\.topbar \.btn--office, \.topbar \.res \{ flex:none;/);
 assert.match(css,/\.topbar \.res \{ height:auto;min-height:46px;/);
 assert.match(office,/\[data-page="train"\]\.is-on \{[^}]*linear-gradient/);
 assert.doesNotMatch(office,/\[data-page="train"\] \{[^}]*linear-gradient/);
});
