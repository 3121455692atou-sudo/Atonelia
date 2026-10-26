import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createGame} from '../../src/career/engine.js';
import {MILESTONES,MS_BY_ID} from '../../src/career/data/milestones.js';
import {MS_TEXT} from '../../src/career/data/milestones_gen.js';
import {histInfo} from '../../src/career/data/history.js';
import {playerMatch} from '../../src/career/sim/milestones.js';
import {milestoneView} from '../../src/career/sim/milestone_view.js';
import {describeEffects} from '../../src/career/sim/effects.js';
import {worldSota} from '../../src/career/sim/sota.js';
import {addDays} from '../../src/career/sim/clock.js';
const IDS=['ms_family','ms_family3','ms_fast_small','ms_flash_catchup','ms_decider'];
const dims=q=>({knowledge:q,code:q,math:q,writing:q,agent:q,safety:q});
function state(){const s=createGame('mistral','y2024',17);s.day='2026-09-01';s.date='2026-09';s.models=[];s.live=null;s.smallLive=null;return s;}
function model(s,q=80,extra={}){return{id:'role-copy',name:'Role-copy 1600B',mod:'llm',total:1600,active:200,arch:'moe',role:'flagship',line:'side',stage:'released',releasedDay:s.day,released:s.date,open:true,dims:dims(q),...extra};}
function releases(s,count,open=true){s.models=Array.from({length:count},(_,i)=>model(s,30,{id:`release-${i}`,name:`Release ${i}`,line:'main',open}));}
const match=(s,id,m,on='release')=>playerMatch(s,MS_BY_ID[id],{on,model:m});

test('all small-role milestones are enumerated; thresholds and hooks stay unchanged',()=>{
 assert.deepEqual(MILESTONES.filter(m=>JSON.stringify(m.player).includes('"role":"small"')).map(m=>m.id),['ms_family','ms_family3','ms_lite_moe','ms_fast_small','ms_flash_catchup','ms_decider']);
 assert.deepEqual(MS_BY_ID.ms_family.player,{on:'release',any:[{smallLive:{exists:true}},{model:{role:'small'}}],released:{open:true,count:2}});
 assert.deepEqual(MS_BY_ID.ms_family3.player,{on:'release',any:[{smallLive:{exists:true}},{model:{role:'small'}}],released:{count:3},model:{gap:5}});
 assert.deepEqual(MS_BY_ID.ms_fast_small.player,{on:'release',model:{role:'small',gap:10}});
 assert.deepEqual(MS_BY_ID.ms_flash_catchup.player,{on:'release',model:{role:'small'},beatLastYear:true});
 assert.deepEqual(MS_BY_ID.ms_decider.player,{on:'release',model:{role:'small',dims:{agent:70,safety:80}}});
});

test('fast-small means side + current frontier gap, with no size or architecture gate',()=>{
 const s=state(),top=worldSota(s).q;
 for(const [total,active,arch] of [[8,8,'dense'],[1600,200,'moe'],[1600,1600,'dense']])assert(match(s,'ms_fast_small',model(s,top-9,{total,active,arch})));
 assert.equal(match(s,'ms_fast_small',model(s,top-11)),false);
 assert.equal(match(s,'ms_fast_small',model(s,top,{line:'main'})),false);
 assert.equal(match(s,'ms_fast_small',model(s,top),'month'),false);
});

test('open family still requires two open releases plus side presence, not mixed parameter sizes',()=>{
 const s=state();releases(s,2);const m=model(s);
 assert(match(s,'ms_family',m)); // All fixtures have the same large total size.
 assert.equal(match(s,'ms_family',{...m,line:'main'}),false);
 s.models[0].line='side';s.smallLive=s.models[0].id;assert(match(s,'ms_family',{...m,line:'main'}));
 s.smallLive=null;s.models[0].open=false;assert.equal(match(s,'ms_family',m),false);
 releases(s,1);assert.equal(match(s,'ms_family',m),false);
});

test('family3 keeps three-release and frontier-gap requirements',()=>{
 const s=state();releases(s,3);const top=worldSota(s).q,m=model(s,top-4);
 assert(match(s,'ms_family3',m));assert.equal(match(s,'ms_family3',{...m,line:'main'}),false);
 assert.equal(match(s,'ms_family3',{...m,dims:dims(top-6)}),false);
 releases(s,2);assert.equal(match(s,'ms_family3',m),false);
});

test('last-year catchup compares capability against a year ago, not parameter or cost reduction',()=>{
 const s=state(),past=worldSota(s,{day:addDays(s.day,-365)}).q;
 assert(match(s,'ms_flash_catchup',model(s,past+.2)));
 assert.equal(match(s,'ms_flash_catchup',model(s,past-.2)),false);
 assert.equal(match(s,'ms_flash_catchup',model(s,past+.2,{line:'main'})),false);
});

test('decision side keeps Agent/safety gates, even for a large dense model',()=>{
 const s=state(),m=model(s,80,{arch:'dense',active:1600});m.dims.agent=70;
 assert(match(s,'ms_decider',m));assert.equal(match(s,'ms_decider',{...m,line:'main'}),false);
 assert.equal(match(s,'ms_decider',{...m,dims:{...m.dims,agent:69.9}}),false);
 assert.equal(match(s,'ms_decider',{...m,dims:{...m.dims,safety:79.9}}),false);
});

test('changed player copy preserves achievements without absolute small/fast/cheap hardware promises',()=>{
 const forbidden=/轻量|端侧|口袋设备|便携版|速度快|跑得快|低成本|低延迟|低廉|便宜|账单.*刺眼|显存.*喘|显存.*爆|参数.*(?:小得多|零头)|更少的卡|成本.*(?:往下|下降)|推理速度.*机关枪/;
 for(const id of IDS){
  const s=state(),m=model(s,90,{name:'Mistral fixture 1600B'});s.models.push(m);
  const view=milestoneView(s,{id,v:'mine',model:m.name});
  assert.doesNotMatch(JSON.stringify(MS_TEXT[id]),forbidden,id);
  assert.match(view.text,/Mistral|型号|模型/,id);
  const choices=histInfo(MS_BY_ID[id].hist,s.mod).choices;
  assert.deepEqual(view.choices.map(c=>c.id),choices.map(c=>c.id));
  for(const c of view.choices){const original=choices.find(x=>x.id===c.id);assert.equal(c.hint,original.hint??describeEffects(original.effects,s),id);}
 }
 assert.match(MS_TEXT.ms_fast_small.mine.body,/当前世界前沿/);
 assert.match(MS_TEXT.ms_flash_catchup.mine.body,/去年世界前沿/);
 assert.match(MS_TEXT.ms_family.mine.body,/开放权重/);
});

test('editable sources and targeted generation notes agree with runtime copy',()=>{
 const gen=fs.readFileSync(new URL('../../scripts/build_milestones.mjs',import.meta.url),'utf8');
 for(const id of IDS){const {by,...cache}=JSON.parse(fs.readFileSync(new URL(`../../content/milestones/${id}.json`,import.meta.url),'utf8'));assert.deepEqual(cache,MS_TEXT[id]);assert.match(by,/manual-role-copy-consistency/);assert.ok(gen.includes(`  ${id}: '`));}
 assert.match(gen,/ms_lite_moe: '玩家发布了采用 MoE 架构的副线模型/); // Prior fix retained.
});
