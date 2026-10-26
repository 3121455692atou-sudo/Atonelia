import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {restoreHistory} from '../helpers/world_provider.mjs';
globalThis.document??={baseURI:'http://localhost/'};
const {homePostTargets,homeTrainingActions}=await import('../../src/career/ui/home_training.js');
const {practiceGuide}=await import('../../src/career/ui/practice_tutorial.js');
const {renderHome}=await import('../../src/career/ui/home.js');
const {setState,setWorld,setMp}=await import('../../src/career/ui/state.js');
afterEach(()=>{setState(null);setWorld(null);setMp(null);restoreHistory();});
const command=(s,name,args={})=>{const r=E.applyCommand(s,{name,args});assert.equal(r.ok,true,r.err);return r.result;};
const element=(dataset={})=>({dataset,disabled:false,hidden:false,getAttribute(){return null;},getClientRects(){return [{}];}});
const doc=(selectors={})=>({querySelectorAll:s=>selectors[s]?[selectors[s]]:[],querySelector:()=>null});
test('intro starts with exactly the ordinary DeepSeek 2024 game, at home with no prepared jobs or cards',()=>{
 restoreHistory();const actual=E.createOnboardingGame(),expected=E.createSinglePlayerGame('deepseek','y2024',261026);
 assert.deepEqual(actual.game,expected);assert.equal(actual.sessionId,null);
 assert.equal(actual.game.jobs.list.length,0);assert.deepEqual(actual.game.postPlanSessions.sessions,{});
 assert.equal(actual.baseline.day,'2024-01-01');assert.ok(actual.game.queue.length);
});
test('home gives both visible training entries before secondary navigation; model selection does not mutate state',()=>{
 restoreHistory();const {game}=E.createOnboardingGame();setState(game);
 const before=JSON.stringify(game),app={className:'',innerHTML:''};renderHome(app);
 assert.ok(app.innerHTML.includes(homeTrainingActions()));
 assert.ok(app.innerHTML.indexOf('data-act="open-post-training"')<app.innerHTML.indexOf('aria-label="训练相关操作"'));
 const targets=homePostTargets(game);assert.equal(targets[0].id,game.working);assert.equal(targets[0].target,'main');
 assert.equal(JSON.stringify(game),before);
});
test('intro explains each real transition from home to model selection, configuration, cards, and the next day',()=>{
 restoreHistory();const {game}=E.createOnboardingGame();game.queue=[];
 const button=element();
 let guide=practiceGuide(doc(),game,'basic',null,0);assert.equal(guide.advance,true);assert.match(guide.text,/主页|接手/);
 guide=practiceGuide(doc({'[data-act="open-model-training"]':button}),game,'basic',null,1);assert.equal(guide.element,button);
 guide=practiceGuide(doc({'.overlay [data-close]':button}),game,'basic',null,2);assert.match(guide.text,/预训练.*后训练/);
 guide=practiceGuide(doc({'[data-act="open-post-training"]':button}),game,'basic',null,3);assert.equal(guide.element,button);
 guide=practiceGuide(doc({[`[data-home-post-model="${game.working}"]`]:button}),game,'basic',null,3);assert.match(guide.text,/已有的模型/);
 guide=practiceGuide(doc({'[data-op="start-post"]':button}),game,'basic',null,3);assert.match(guide.text,/方向和时长/);
 command(game,'startJob',{spec:{kind:'post',target:'main',dir:'auto',until:'none'}});
 let v=command(game,'postPlan.open',{modelId:game.working,expectedModelToken:null});
 const before=JSON.stringify(game);
 guide=practiceGuide(doc({'[data-pp-pack]':button}),game,'basic',null,3);assert.equal(guide.advance,true);assert.match(guide.text,/每回合.*三张/);
 guide=practiceGuide(doc({'[data-pp-confirm]':button}),game,'basic',null,4);assert.equal(guide.element,button);assert.equal(JSON.stringify(game),before);
 v=command(game,'postPlan.confirmDeck',{sessionId:v.sessionId,expectedRevision:v.revision,cardIds:v.deck,directionPolicy:v.directionPolicy});
 while(v.status==='playing'){
  const picked=v.hand.find(x=>x.affordable);
  guide=practiceGuide(doc({'[data-pp-choose]':button,'[data-pp-select][aria-pressed="true"]':element({ppSelect:picked.id})}),game,'basic',null,4);
  assert.match(guide.text,new RegExp(`得 ${picked.total} 分`));assert.match(guide.text,new RegExp(`消耗 ${picked.paid}`));
  v=command(game,'postPlan.choose',{sessionId:v.sessionId,expectedRevision:v.revision,turn:v.turn,cardId:picked.id}).view;
 }
 guide=practiceGuide(doc({'[data-act="speed-toggle"]':button}),game,'basic',null,4);assert.equal(guide.element,button);assert.match(guide.text,/日期前进/);
 E.tickDay(game);guide=practiceGuide(doc(),game,'basic',null,4);assert.equal(guide.done,true);assert.equal(guide.advance,true);
 E.assertPostPlanSaveBoundary(game);
});
