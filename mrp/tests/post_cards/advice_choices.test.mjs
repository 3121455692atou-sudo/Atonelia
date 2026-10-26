import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { newModel } from '../../src/career/sim/projects.js';
import { setState, setWorld, setMp, ui, clock } from '../../src/career/ui/state.js';
globalThis.document ??= {baseURI:'http://localhost/'};
const {renderHome}=await import('../../src/career/ui/home.js');
const isPost=a=>a.kind==='jobs'&&a.op?.type==='job'&&a.op.op==='post';
function fresh(){E.setProvider();const s=E.createSinglePlayerGame('suno','y2025',7);s.queue=[];s.jobs.list=[];setState(s);setWorld(null);setMp(null);ui.skip.clear();clock.speed=0;return s;}
function html(s){const before=JSON.stringify(s),app={};renderHome(app);assert.equal(JSON.stringify(s),before);return app.innerHTML;}
function group(s){const match=html(s).match(/<div class="next-choice-row"[^>]*>([\s\S]*?)<\/div>/);assert(match);return match[1];}

test('Suno secondary post-training suggestion has an honest action label and the same read-only alternative',()=>{
  const s=fresh(),advice=E.advise(s);assert(!isPost(advice[0]));assert(advice.some(isPost));
  const row=group(s);
  assert.match(row,/按此建议开始后训练 · 进入选卡/);assert.doesNotMatch(row,/>训练安排</);
  assert.match(row,/data-act="advice"/);assert.match(row,/data-act="open-train"/);
  assert.match(row,/自己安排方向与期限/);assert.match(row,/先看训练页，不执行建议/);
  assert.equal((row.match(/<button/g)||[]).length,2);assert.match(row,/<\/button>\s*<button/,'alternative must not be nested in command button');
});

test('moving the same post recommendation to the main CTA does not remove either choice',()=>{
  const s=fresh(),advice=E.advise(s),post=advice.find(isPost);const secondary=group(s);
  for(const a of advice)if(a.id!==post.id)ui.skip.add(`${s.date}|${a.id}`);
  const main=html(s);assert.match(main,/按此建议开始后训练 · 进入选卡/);assert.match(main,/自己安排方向与期限/);
  assert(secondary.includes('按此建议开始后训练 · 进入选卡'));ui.skip.clear();
});

test('secondary pending-main suggestion says resume and cannot advertise a read-only route that auto-resumes',()=>{
  const s=fresh(),post=E.advise(s).find(isPost);
  E.startJob(s,{kind:'post',target:'main',dir:post.op.dir,until:'none'});
  const row=group(s);assert.match(row,/采用建议方向 · 继续选卡/);assert.doesNotMatch(row,/next-own-plan/);
});

test('secondary route also respects a different pending small model',()=>{
  const s=fresh(),small=newModel(s,{total:1,active:1,arch:'dense'});small.role='small';s.models.push(small);s.smallWorking=small.id;
  E.startJob(s,{kind:'post',target:`small:${small.id}`,dir:'auto',until:'none'});
  assert.doesNotMatch(group(s),/next-own-plan/);
});

test('legacy/non-card secondary suggestion does not promise a card screen and makes immediate action explicit',()=>{
  const s=fresh();delete s.postPlanSessions;delete s.postCards;
  const row=group(s);assert.match(row,/按建议安排后训练 · 点击即生效/);assert.doesNotMatch(row,/进入选卡/);
});
