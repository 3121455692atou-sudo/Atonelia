import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {setState,setWorld,setMp} from '../../src/career/ui/state.js';
import {postOnlyStatus} from '../../src/career/ui/post_only_status.js';
globalThis.document??={baseURI:'https://local.invalid/'};
const panel=await import('../../src/career/ui/panels/post_plan.js');
const home=await import('../../src/career/ui/home.js');
const command=(s,name,args)=>{const r=E.applyCommand(s,{name,args});assert(r.ok,r.err);return r.result;};
function fixture(){E.setProvider();const s=E.createSinglePlayerGame('deepseek','y2025',7);s.queue=[];s.jobs.list=[];setState(s);setWorld(null);setMp(null);return s;}
test('actual hand renderer has three compact cards, separate detail actions, and no ledger walls',()=>{
 const s=fixture();let v=command(s,'postPlan.open',{modelId:s.working,expectedModelToken:null});v=command(s,'postPlan.confirmDeck',{sessionId:v.sessionId,expectedRevision:v.revision,cardIds:v.deck,directionPolicy:v.directionPolicy});
 const before=JSON.stringify(s),html=panel.render(s,{postPlanSessionId:v.sessionId}),hand=html.slice(html.indexOf('<div class="pp-hand"'),html.indexOf('<div class="pp-decision"'));
 assert.equal((hand.match(/data-pp-select=/g)||[]).length,3);assert.equal((hand.match(/data-pp-card-info=/g)||[]).length,3);
 assert.doesNotMatch(hand,/pp-choice-ledger|本手末叠层|点击比较|规则与效果/);assert.match(hand,/费用 0/);assert.match(hand,/聚焦\+1/);assert.match(html,/data-pp-choose="" disabled/);assert.equal(JSON.stringify(s),before);
});
test('draft selection count and selected cards are outside catalogue scroll; confirmation follows it',()=>{
 const s=fixture(),v=command(s,'postPlan.open',{modelId:s.working,expectedModelToken:null}),html=panel.render(s,{postPlanSessionId:v.sessionId});
 assert(html.indexOf('class="pp-deck-head"')<html.indexOf('class="pp-draft-scroll"'));
 assert(html.indexOf('class="pp-selected-deck"')<html.indexOf('class="pp-draft-scroll"'));
 assert(html.indexOf('data-pp-confirm')>html.indexOf('class="pp-library"'));
});
test('post-only home has a human one-line state and directly reachable actions before optional overview',()=>{
 const s=fixture();E.enablePostOnly(s);s.research=[{id:'distill',done:5,need:100},{id:'func_call',done:2,need:100}];
 const before=JSON.stringify(s),app={};home.renderHome(app);
 const status=app.innerHTML.slice(app.innerHTML.indexOf('<section class="post-only-status"'),app.innerHTML.indexOf('<main class="home"'));
 assert.doesNotMatch(status,/真实底座|distill|func_call|资源与风险照常结算|购租算力/);
 assert.match(status,/data-act="speed"/);assert(postOnlyStatus(s).text.length<45);
 assert(app.innerHTML.indexOf('aria-label="训练相关操作"')<app.innerHTML.indexOf('class="home-overview"'));
 assert.equal(JSON.stringify(s),before);
});
test('a trial ETA describes the trial, never promises that cards become available at completion',()=>{
 E.setProvider();const s=E.createSinglePlayerGame('deepseek','y2023',47);E.enablePostOnly(s);
 let found=false;
 for(let i=0;i<20;i++){E.tickDay(s);const st=postOnlyStatus(s);if(st.text.includes('调参试训')){found=true;assert.doesNotMatch(st.text,/天后可选牌/);assert.match(st.text,/约剩/);break;}}
 assert(found,'fixture must observe an actual running trial');
});
