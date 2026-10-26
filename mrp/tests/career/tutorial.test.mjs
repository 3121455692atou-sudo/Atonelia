import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTutorial, tutorialView, actTutorial, closeTutorial, TUTORIAL_CHAPTERS } from '../../src/career/sim/tutorial.js';
import { createGame } from '../../src/career/sim/game.js';
import { P, setProvider } from '../../src/career/sim/provider.js';
import { applyCommand } from '../../src/career/sim/commands.js';
import { choose, settle } from '../../src/career/sim/post_catalog_rules.js';
globalThis.document = { baseURI: 'http://tutorial.test/' };
const { renderTutorial } = await import('../../src/career/ui/pages/tutorial.js');
delete globalThis.document;
const act = (t, type, id) => actTutorial(t, {type,id}, t.revision);

test('basic: original 108 guided paths still finish six hands, exactly matching production effects and settlement', () => {
  let count = 0;
  function walk(t) {
    const v=tutorialView(t);
    if(v.status==='complete') {count++;assert.equal(t.run.log.length,6);assert.deepEqual(v.result,settle(t.run));assert.ok(v.result.actual<=1);assert.match(renderTutorial(v),/data-tutorial-complete/);return;}
    const choices=v.cards.filter(c=>c.allowed && (v.run.turn<=2 ? c.kind==='prepare' : v.run.turn===3 ? c.kind==='train' : true));assert.ok(choices.length,'no teaching deadlock');
    for(const c of choices){const next=structuredClone(t), production=structuredClone(t.run);assert.equal(choose(production,c.id,production.revision).ok,true);act(next,'card',c.id);assert.deepEqual(next.run,production);walk(next);}
  }
  const t=createTutorial();act(t,'start');walk(t);assert.equal(count,108);
});
test('guards reject stale, skipped, unknown and finished actions without mutation; restart/close destroy session', () => {
  const t=createTutorial();assert.throws(()=>act(t,'card','basic'));act(t,'start');let before=structuredClone(t);
  assert.throws(()=>actTutorial(t,{type:'card',id:'basic'},0),/已处理/);assert.deepEqual(t,before);
  const freeChoice=structuredClone(t);act(freeChoice,'card','basic');assert.equal(freeChoice.run.log.length,1,'legal training card is no longer forbidden by a teaching goal');
  const poor=structuredClone(t);poor.run.budget=0;const unavailable=tutorialView(poor).cards.find(c=>!c.allowed);assert.ok(unavailable);const poorBefore=structuredClone(poor);assert.throws(()=>act(poor,'card',unavailable.id),/预算/);assert.deepEqual(poor,poorBefore);
  assert.throws(()=>act(t,'card','not-a-card'));assert.deepEqual(t,before);
  act(t,'card',tutorialView(t).cards.find(c=>c.allowed).id);const revision=t.revision;act(t,'restart');assert.equal(t.status,'intro');assert.equal(t.run,null);assert.equal(t.revision,revision+1);
  closeTutorial(t);assert.equal(t.status,'closed');assert.throws(()=>act(t,'start'),/已退出/);
});
test('advanced: every offered branch completes with observable real engine state changes', () => {
  for(const chapter of TUTORIAL_CHAPTERS){
    const seed=createTutorial('advanced');act(seed,'chapter',chapter.id);const choices=tutorialView(seed).options.filter(o=>!o.disabled);assert.ok(choices.length,chapter.id);
    for(const first of choices){const t=structuredClone(seed);let v=act(t,'operate',first.id);
      if(chapter.id==='research')assert.equal(t.game.research.length,1);
      if(chapter.id==='strategy')assert.equal(t.game.strategy.cur.id,first.id);
      if(chapter.id==='data')assert.equal(t.game.orders.length,1);
      if(chapter.id==='compute')assert.equal(t.game.inferShare,Number(first.id));
      if(chapter.id==='service')assert.equal(t.game.products.api.tier,first.id);
      if(chapter.id==='finance'){assert.ok(t.game.capital.round);assert.equal(t.game.cash,seed.game.cash);}
      if(chapter.id==='evaluation'){const submitted=structuredClone(seed.game);assert.equal(applyCommand(submitted,{name:'submitEval',args:{modelId:submitted.working,tier:first.id,name:'教学试作一号'}}).ok,true);assert.equal(submitted.evals.length,1);}
      while(v.options.length){const o=v.options.find(o=>!o.disabled);assert.ok(o,chapter.id);v=act(t,'operate',o.id);if(chapter.id==='project'&&t.stage===2)assert.equal(t.game.jobs.list[0].paused,true);}
      assert.equal(v.status,'chapterDone');assert.deepEqual(v.completed,[chapter.id]);
      if(chapter.id==='evaluation'){assert.equal(t.game.evals.length,0);assert.ok(t.game.models.some(m=>m.name==='教学试作一号'&&m.stage==='released'));}
      if(chapter.id==='project')assert.equal(t.game.jobs.list.length,0);
      if(chapter.id==='research')assert.equal(t.game.research.length,0);
      if(chapter.id==='automation')assert.equal(t.game.automation.modules.research.mode,'manual');
      act(t,'chapters');assert.equal(t.game,null);act(t,'chapter',chapter.id);assert.deepEqual(t.game,seed.game,'chapter replay is fresh');
    }
  }
});
test('tutorial isolation: formal game, provider, returned views and chapters cannot leak mutable state', () => {
  const real=createGame('gpt','y2025',7), before=structuredClone(real), provider=P();
  const t=createTutorial('advanced');for(const c of TUTORIAL_CHAPTERS){act(t,'chapter',c.id);let v=tutorialView(t);while(v.status==='chapter')v=act(t,'operate',v.options.find(o=>!o.disabled).id);}
  assert.deepEqual(real,before);assert.equal(P(),provider);const view=tutorialView(t);view.completed.length=0;assert.equal(t.completed.length,9);closeTutorial(t);assert.equal(t.game,null);
  const fake={mode:'world',world:{unchanged:true}};setProvider(fake);try{const s=createTutorial('advanced');assert.throws(()=>act(s,'chapter','research'),/退出当前世界/);assert.equal(s.game,null);assert.equal(P(),fake);}finally{setProvider(provider);}
});
test('render/entry contract: no save side effects, styles linked, explicit two-phase play and game entry', () => {
  const root=new URL('../../',import.meta.url);const ui=readFileSync(new URL('src/career/ui/pages/tutorial.js',root),'utf8');const sim=readFileSync(new URL('src/career/sim/tutorial.js',root),'utf8');
  assert.doesNotMatch(ui+sim,/localStorage|sessionStorage|setInterval|setTimeout|from .*storage/);
  assert.match(readFileSync(new URL('index.html',root),'utf8'),/css\/practice_coach.css/);
  const app=readFileSync(new URL('src/career/ui/app.js',root),'utf8');assert.match(app,/data-act="tutorial-basic"/);assert.match(app,/data-act="tutorial-advanced"/);assert.match(app,/location.assign\(practiceURL/);assert.doesNotMatch(app,/from ['"]\.\/pages\/tutorial\.js/);
  const t=createTutorial();act(t,'start');const v=tutorialView(t);assert.match(renderTutorial(v),/先选一张牌/);assert.match(renderTutorial(v,v.cards.find(c=>c.allowed).id),/打出这张牌/);assert.doesNotMatch(renderTutorial(v,'basic'),/data-tutorial-action="card"[^>]*disabled/);
});
