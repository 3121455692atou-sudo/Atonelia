import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame } from '../../src/career/engine.js';
import { MS_BY_ID } from '../../src/career/data/milestones.js';
import { MS_TEXT } from '../../src/career/data/milestones_gen.js';
import { histInfo } from '../../src/career/data/history.js';
import { playerMatch } from '../../src/career/sim/milestones.js';
import { milestoneView } from '../../src/career/sim/milestone_view.js';
import { clsOf, genMinCards } from '../../src/career/sim/model.js';
import { describeEffects } from '../../src/career/sim/effects.js';
const ms = MS_BY_ID.ms_lite_moe;
const state = () => createGame('mistral', 'y2024', 17);
const model = (total, active, extra = {}) => ({ id:'moe-copy-fixture', name:'Mistral Medium 2.12', mod:'llm', stage:'released', role:'flagship', line:'side', arch:'moe', total, active, ...extra });
const badPromise = /轻量|消费级|普通电脑|轻薄本|不爆显存|只要激活|激活参数仅有|激活参数这么小|超级省资源/;

test('event identity, trigger and inherited reward source stay fixed', () => {
  assert.equal(ms.id, 'ms_lite_moe'); assert.equal(ms.mod, 'llm'); assert.equal(ms.type, 'self');
  assert.equal(ms.hist, 'personal_deepseek_lite');
  assert.deepEqual(ms.player, { on:'release', model:{ role:'small', arch:['moe'] } });
  assert.equal(ms.tech, undefined); assert.equal(ms.choices, undefined);
});

test('small and large MoE side releases both remain eligible; release role is not weight class', () => {
  const s = state();
  for (const m of [model(16, 2.4, {role:'small'}), model(1600,200)]) {
    assert.equal(playerMatch(s,ms,{on:'release',model:m}),true);
  }
  assert.equal(clsOf(model(1600,200)),'large');
  assert.equal(clsOf(model(16,2.4)),'mid');
});

test('main releases, non-MoE architectures and unrelated hooks remain ineligible', () => {
  const s = state();
  for (const m of [model(1600,200,{line:'main'}),model(16,2.4,{role:'small',line:'main'}),model(8,8,{arch:'dense'}),model(16,4,{arch:'hybrid'})]) {
    assert.equal(playerMatch(s,ms,{on:'release',model:m}),false);
  }
  for (const on of ['month','reopen','tech']) assert.equal(playerMatch(s,ms,{on,model:model(1600,200)}),false);
});

test('dynamic 1600B / 200B copy describes sparse computation without consumer-device promises', () => {
  const s = state(), m = model(1600,200);s.models.push(m);
  const view = milestoneView(s,{id:ms.id,v:'mine',model:m.name});
  const copy = [view.title,view.text,...view.lines.map(x=>x.text),...(view.scene||[]).map(x=>x.text),...view.choices.map(x=>x.label)].join('\n');
  assert.match(copy,/总参数 1600B/);assert.match(copy,/激活 200B/);
  assert.match(copy,/完整权重.*内存/);assert.match(view.title,/副线/);
  assert.doesNotMatch(copy,badPromise);assert.doesNotMatch(copy,/\{(?:total|active)\}/);
  assert.deepEqual(view.choices.map(c=>c.id),['c0','c1','skip']);
  const originalChoices=histInfo(ms.hist,s.mod).choices;
  for(const choice of view.choices) {
    const original=originalChoices.find(x=>x.id===choice.id);
    assert.equal(choice.hint,original.hint??describeEffects(original.effects,s));
  }
  // Existing in-game teacher-generation memory rule uses TOTAL weights, not active count.
  assert.equal(genMinCards(s,1600),52);
});

test('small-parameter rendering also uses the same qualified copy, without a new size gate', () => {
  const s = state(),m=model(16,2.4,{role:'small'});s.models.push(m);
  const view=milestoneView(s,{id:ms.id,v:'mine',model:m.name});
  assert.match(view.lines[0].text,/总参数 16B，激活 2.4B/);
  assert.doesNotMatch(JSON.stringify(MS_TEXT.ms_lite_moe),badPromise);
});

test('editable generation cache matches shipped text; generation note records role/size distinction', () => {
  const cache=JSON.parse(fs.readFileSync(new URL('../../content/milestones/ms_lite_moe.json',import.meta.url),'utf8'));
  const {by,...text}=cache;assert.deepEqual(text,MS_TEXT.ms_lite_moe);
  assert.match(by,/manual-copy-consistency/);
  const generator=fs.readFileSync(new URL('../../scripts/build_milestones.mjs',import.meta.url),'utf8');
  assert.match(generator,/ms_lite_moe: '玩家发布了采用 MoE 架构的副线模型/);
  assert.match(generator,/role small 表示副线或子系列，不表示参数轻量/);
  // Do not execute this external generation script in the offline test.
});
