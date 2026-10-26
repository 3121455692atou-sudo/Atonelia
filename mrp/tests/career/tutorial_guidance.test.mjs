import test from 'node:test';
import assert from 'node:assert/strict';
import {createTutorial,actTutorial,tutorialView,TUTORIAL_CHAPTERS} from '../../src/career/sim/tutorial.js';
import {createGame} from '../../src/career/sim/game.js';
const act=(t,type,id)=>actTutorial(t,{type,id},t.revision);
// A minimal event/DOM double exercises the real click handlers, not browser layout.
let dialog, focusCount=0, scrolls=0;
const previous={isConnected:true,focus(){focusCount++;}};
class Dialog {
 constructor(){this.handlers=new Map();this.innerHTML='';this.isConnected=true;}
 setAttribute(){} showModal(){} close(){}
 addEventListener(n,f){this.handlers.set(n,f);}
 removeEventListener(n,f){if(this.handlers.get(n)===f)this.handlers.delete(n);}
 remove(){this.isConnected=false;}
 contains(){return true;}
 querySelector(selector){if(selector==='[data-tutorial-preview]')return{scrollIntoView(){scrolls++;}};return{focus(){}};}
 click(type,rev,extra={}){const b={disabled:false,dataset:{tutorialAction:type,revision:String(rev),...extra},closest(){return this;}};this.handlers.get('click')?.({target:b});}
}
globalThis.document={baseURI:'http://tutorial.test/',activeElement:previous,createElement(){dialog=new Dialog();return dialog;},body:{append(){}},querySelector(){return previous;}};
const {startTutorial,renderTutorial}=await import('../../src/career/ui/pages/tutorial.js');

test('ordinary click: six-hand tutorial confirms near instructions, completes and restores on exit/re-entry',()=>{
 const formal=createGame('gpt','y2025',99),before=structuredClone(formal);
 let exits=0,completions=0;
 for(let repeat=0;repeat<2;repeat++){
  const ctl=startTutorial('basic',{onExit(){exits++;},onComplete(){completions++;}});
  assert.equal(ctl.view().status,'intro');dialog.click('start',ctl.view().revision);
  while(ctl.view().status==='playing'){
   const v=ctl.view(),card=v.cards.find(c=>c.allowed);assert.ok(card);
   const html=renderTutorial(v,card.id);
   assert.ok(html.indexOf('data-tutorial-preview')<html.indexOf('class="tutorial-hand"'));
   assert.match(html,/data-tutorial-next/);
   const original=structuredClone(ctl.view().run);
   dialog.click('select-card',v.revision,{cardId:card.id});
   assert.deepEqual(ctl.view().run,original,'select does not play');
   dialog.click('card',v.revision,{cardId:card.id});
   assert.equal(ctl.view().run.log.length,original.log.length+1);
   dialog.click('card',v.revision,{cardId:card.id});
   assert.equal(ctl.view().run.log.length,original.log.length+1,'double click not played twice');
  }
  assert.equal(ctl.view().status,'complete');
  dialog.click(repeat?'complete':'exit',ctl.view().revision);
  assert.equal(dialog.isConnected,false);assert.equal(dialog.handlers.size,0);
  assert.deepEqual(formal,before);
 }
 assert.equal(exits,1);assert.equal(completions,1);assert.ok(focusCount>0);assert.equal(scrolls,12);
});
test('every chapter starts ready, displays a named ordinary action, and can exit/re-enter at every stage',()=>{
 for(const c of TUTORIAL_CHAPTERS){
  const seed=createTutorial('advanced');act(seed,'chapter',c.id);const initial=structuredClone(seed.game);
  let t=structuredClone(seed);
  while(t.status==='chapter'){
   const v=tutorialView(t),o=v.options.find(o=>!o.disabled);assert.ok(o,c.id);
   const html=renderTutorial(v);assert.ok(html.includes(`下一步：点「${o.label}」`));assert.match(html,/不用先做其他准备/);
   const interrupted=structuredClone(t);act(interrupted,'chapters');assert.equal(interrupted.game,null);
   act(interrupted,'chapter',c.id);assert.deepEqual(interrupted.game,initial);
   act(t,'operate',o.id);
  }
  assert.equal(t.status,'chapterDone');
 }
});
test('exit and replacement destroy a partially played session without advancing the real game',()=>{
 let exits=0;const old=startTutorial('basic',{onExit(){exits++;}}),oldDialog=dialog;
 dialog.click('start',old.view().revision);dialog.click('card',old.view().revision,{cardId:old.view().cards.find(c=>c.allowed).id});
 const next=startTutorial('advanced',{onExit(){exits++;}});
 assert.equal(oldDialog.isConnected,false);assert.equal(oldDialog.handlers.size,0);assert.equal(old.view().run,null);
 dialog.click('chapter',next.view().revision,{chapterId:'project'});dialog.click('exit',next.view().revision);
 assert.equal(next.view().status,'closed');assert.equal(next.view().summary.length,0);assert.equal(exits,1);
});

test('all affordable basic choices are normal production choices; every sequence finishes without a score gate',async(ctx)=>{
 const {choose,settle}=await import('../../src/career/sim/post_catalog_rules.js');
 let completed=0;
 function walk(t){const v=tutorialView(t);if(v.status==='complete'){completed++;assert.equal(t.run.log.length,6);assert.deepEqual(v.result,settle(t.run));return;}
  const choices=v.cards.filter(c=>c.allowed);assert.ok(choices.length);
  for(const c of v.cards)assert.equal(c.allowed,c.preview.affordable,'teaching preference cannot disable a legal card');
  for(const c of choices){const next=structuredClone(t),production=structuredClone(t.run);assert.equal(choose(production,c.id,production.revision).ok,true);act(next,'card',c.id);assert.deepEqual(next.run,production);walk(next);}
 }
 const t=createTutorial();act(t,'start');walk(t);assert.ok(completed>108,`all ${completed} paths include original guided 108`);ctx.diagnostic(`${completed} complete legal paths, all matched production`);
});
test('main actions complete immediately; stopping/cancelling/taking over remain optional real commands',()=>{
 for(const id of ['research','strategy','project','automation']){
  const t=createTutorial('advanced');act(t,'chapter',id);
  if(id==='strategy'){assert.equal(t.game.strategy.cur,null);assert.deepEqual(t.game.strategy.shelved,{});}
  act(t,'operate',tutorialView(t).options.find(o=>!o.disabled).id);
  assert.equal(t.status,'chapterDone');assert.deepEqual(t.completed,[id]);assert.ok(tutorialView(t).options.length);
  assert.match(renderTutorial(tutorialView(t)),/再练一个操作（可选，不影响完成）/);
  while(tutorialView(t).options.length){act(t,'operate',tutorialView(t).options[0].id);assert.equal(t.status,'chapterDone');}
  if(id==='research')assert.equal(t.game.research.length,0);
  if(id==='strategy')assert.equal(t.game.strategy.cur,null);
  if(id==='project')assert.equal(t.game.jobs.list.length,0);
  if(id==='automation')assert.equal(t.game.automation.modules.research.mode,'manual');
 }
});
test('evaluation automatically uses full daily settlement, matches engine state exactly, and changes no shared registry',async()=>{
 const {applyCommand}=await import('../../src/career/sim/commands.js');
 const {tickDay}=await import('../../src/career/sim/game.js');
 const {resolveAll}=await import('../../src/career/sim/bot_events.js');
 const {COMPANY_BY_ID,PLAYABLE}=await import('../../src/career/data/core.js');
 const {FAMILIES,RELEASES}=await import('../../src/career/data/rivals.js');
 const {START_STANCE}=await import('../../src/career/data/routes.js');
 const registries=()=>JSON.stringify({COMPANY_BY_ID,PLAYABLE,FAMILIES,RELEASES,START_STANCE});
 const before=registries();
 for(const tier of ['quick','standard','full']){
  const t=createTutorial('advanced');act(t,'chapter','evaluation');const expected=structuredClone(t.game),ledger=structuredClone(expected.computeLedger);
  assert.equal(applyCommand(expected,{name:'submitEval',args:{modelId:expected.working,tier,name:'教学试作一号'}}).ok,true);assert.equal(expected.evals.length,1);
  let days=0;while(expected.evals.length&&days<60){resolveAll(expected);tickDay(expected);days++;}
  assert.equal(expected.evals.length,0);assert.ok(days<60);assert.notDeepEqual(expected.computeLedger,ledger,'business settlement occurred too');assert.ok(expected.computeLedger.days>0);assert.ok(expected.computeLedger.owned>0,'normal compute costs accrue even before monthly cash settlement');
  act(t,'operate',tier);assert.deepEqual(t.game,expected);assert.equal(t.status,'chapterDone');assert.equal(tutorialView(t).options.length,0);
  assert.match(t.feedback.message,new RegExp(`${days} 个正常日结`));assert.doesNotMatch(renderTutorial(tutorialView(t)),/推进演示评测时钟/);
 }
 assert.equal(registries(),before);
});
test('ordinary UI clicks complete all nine chapters before optional practice; storage stays untouched',()=>{
 let storageTouches=0;const originalStorage=globalThis.localStorage;
 globalThis.localStorage=new Proxy({}, {get(){storageTouches++;throw Error('tutorial must not access formal storage');}});
 try{
  for(const c of TUTORIAL_CHAPTERS){
   const ctl=startTutorial('advanced');dialog.click('chapter',ctl.view().revision,{chapterId:c.id});
   dialog.click('operate',ctl.view().revision,{optionId:ctl.view().options.find(o=>!o.disabled).id});
   assert.equal(ctl.view().status,'chapterDone');assert.deepEqual(ctl.view().completed,[c.id]);
   while(ctl.view().options.length){dialog.click('operate',ctl.view().revision,{optionId:ctl.view().options[0].id});assert.equal(ctl.view().status,'chapterDone');}
   dialog.click('exit',ctl.view().revision);assert.equal(ctl.view().summary.length,0);
   const fresh=startTutorial('advanced');assert.equal(fresh.view().status,'chapters');assert.deepEqual(fresh.view().completed,[]);fresh.close();
  }
  assert.equal(storageTouches,0);
 }finally{if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage;}
});
test('evaluation reports the actual candidate release and rollout, never queue-empty or an unrelated name',async()=>{
 const {tutorialEvaluationOutcome}=await import('../../src/career/sim/tutorial.js');
 for(const tier of ['quick','standard','full']){
  const t=createTutorial('advanced');act(t,'chapter','evaluation');act(t,'operate',tier);
  const out=t.feedback.evaluation;assert.equal(out.published,true);
  const model=t.game.models.find(m=>m.id===out.candidateId);assert.equal(model.stage,'released');
  const rollout=t.game.deploy.find(d=>d.id===out.candidateId);assert.equal(out.rolloutUntil,rollout?.until||null);
  assert.match(out.message,/已发布/);if(rollout)assert.match(out.message,/正在灰度上线/);
 }
 const game={models:[{id:'other',name:'教学试作一号',stage:'released'}],deploy:[],evals:[]};
 const missing=tutorialEvaluationOutcome(game,'target');assert.equal(missing.published,false);assert.match(missing.message,/没有确认该候选已发布/);assert.match(missing.message,/不用重刷/);
 game.models.push({id:'target',name:'教学试作一号',stage:'working'});assert.equal(tutorialEvaluationOutcome(game,'target').published,false);
 game.models[1].stage='released';assert.equal(tutorialEvaluationOutcome(game,'target').published,true);
});
test('intro offers one visible start immediately after the one-step explanation, before optional deck details',()=>{
 const html=renderTutorial(tutorialView(createTutorial()));
 const start=html.indexOf('data-tutorial-action="start"'),instruction=html.indexOf('只练一件事：选一张牌，再点确认。');
 const details=html.indexOf('<details class="tutorial-rules" data-tutorial-intro-details>'),deck=html.indexOf('class="tutorial-deck"');
 assert.equal((html.match(/data-tutorial-action="start"/g)||[]).length,1);
 assert.ok(instruction<start&&start<details&&details<deck);
 const buttonTag=html.slice(html.lastIndexOf('<button',start),html.indexOf('</button>',start));
 assert.doesNotMatch(buttonTag,/disabled|hidden|aria-hidden/);
 assert.equal(html.slice(0,start).includes('<details'),false,'start cannot sit in closed details');
 assert.match(html.slice(start,details),/data-tutorial-isolation>独立练习，不会覆盖正式存档/);
 assert.doesNotMatch(html.slice(details,html.indexOf('>',details)),/\bopen\b/,'deck is optional and initially closed');
});
