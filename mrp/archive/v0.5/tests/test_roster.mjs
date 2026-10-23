import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {CHARACTER_ROSTER,ROSTER_MODEL_PROFILES} from '../src/data/catalog_characters.js';
import {HISTORIES} from '../src/data/catalog_core.js';
import {CAPABILITY_KEYS} from '../src/data/model_capabilities.js';
import {MODEL_CHARACTERS,NPC_CHARACTERS,NPC_PROFILES,isModelCharacter,isNpcIdentity,resolveModelCharacter} from '../src/data/character_roles.js';
import {createNewGameState,validateGameState} from '../src/engine/state_schema.js';
const root=fileURLToPath(new URL('../',import.meta.url));

describe('Source-backed character roster and playable histories',()=>{
 it('keeps all tools and facilities as NPCs without cultivation routes',()=>{
  assert.equal(MODEL_CHARACTERS.length,25);assert.equal(NPC_CHARACTERS.length,16);
  for(const npc of NPC_CHARACTERS){
   assert.equal(isModelCharacter(npc.id),false,npc.id);assert.equal(npc.history_id,null,npc.id);
   assert.equal('focus' in npc,false,npc.id);assert.equal('stats' in npc,false,npc.id);
   assert.ok(isNpcIdentity(npc.id));assert.ok(isNpcIdentity('roster_'+npc.id));
   assert.equal(HISTORIES.some(h=>[npc.id,'roster_'+npc.id].includes(h.history_id)),false,npc.id);
   assert.ok(NPC_PROFILES[npc.id].role);assert.ok(['applications','compute','product'].includes(NPC_PROFILES[npc.id].section));
  }
 });
 it('ignores old NPC avatar preferences and keeps a model on the cultivation stage',()=>{
  for(const npc of NPC_CHARACTERS)assert.equal(resolveModelCharacter('roster_kimi',npc.id).id,'kimi',npc.id);
  assert.equal(resolveModelCharacter('roster_kimi','qwen').id,'qwen');
  assert.equal(resolveModelCharacter('gpt_instruction','codex').id,'gpt');
  assert.equal(resolveModelCharacter(null,'opencode').category,'model');
 });
 it('refuses to create a cultivation campaign for every NPC identity',()=>{
  for(const npc of NPC_CHARACTERS){
   for(const id of [npc.id,'roster_'+npc.id])assert.throws(()=>createNewGameState({historyId:id}),/NPC_CANNOT_BE_TRAINED/,id);
  }
 });
 it('rejects saves that try to substitute an NPC into the active model',()=>{
  for(const npc of NPC_CHARACTERS){
   const s=createNewGameState({profileId:'small_startup',historyId:'roster_kimi'});
   s.active_model.history_id=npc.id;
   const result=validateGameState(s);assert.equal(result.valid,false,npc.id);
   assert.ok(result.errors.some(e=>e.includes('NPC_CANNOT_BE_TRAINED')),npc.id);
  }
 });
 it('includes the 25 verified model identities without merging DeepSeek Pro, Flash, Fable or JEV',()=>{const expected=['qwen','deepseek','gemini','claude','gpt','deepseek_pro','kimi','glm','grok','seed','rwkv','ernie','mistral','minimax','perplexity','image2','llama','hunyuan','stepfun','novelai','midjourney','suno','elevenlabs','fable','jev'];const models=CHARACTER_ROSTER.filter(c=>c.category==='model');assert.deepEqual(models.map(c=>c.id).sort(),expected.sort());assert.equal(new Set(CHARACTER_ROSTER.map(c=>c.id)).size,41);});
 it('every model has a selectable history and every new route creates a valid, balanced save',()=>{for(const c of CHARACTER_ROSTER.filter(c=>c.category==='model'))assert.ok(HISTORIES.some(h=>h.id===c.history_id),c.name);for(const h of ROSTER_MODEL_PROFILES){const s=createNewGameState({profileId:'small_startup',historyId:h.history_id});assert.equal(s.active_model.history_id,h.history_id);assert.equal(validateGameState(s).valid,true);assert.deepEqual(Object.keys(s.active_model.stats).sort(),[...CAPABILITY_KEYS].sort());assert.equal(Object.values(s.active_model.stats).reduce((a,b)=>a+b,0),4500);assert.equal(s.company.cash_kc,2400);assert.match(h.tabs.history_fact.summary,/虚构平衡/);}});
 it('every selectable sprite and emotion variant exists as a real PNG tracked by a matching art hash',()=>{const m=JSON.parse(fs.readFileSync(path.join(root,'docs/art-manifest.json'),'utf8')),assets=new Map(m.assets.map(a=>[a.file,a]));for(const c of CHARACTER_ROSTER){for(const uri of [c.src,...Object.values(c.sprites||{})]){const relative=uri.replace(/^\.\//,'');assert.ok(assets.has(relative),relative);const bytes=fs.readFileSync(path.join(root,relative));assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),assets.get(relative).sha256);}}});
 it('every gallery entry links to its creator source and retains explicit rights information',()=>{for(const c of CHARACTER_ROSTER){const u=new URL(c.source_url);assert.ok(['www.bilibili.com','space.bilibili.com'].includes(u.hostname));assert.equal(c.credit,'ZipZipPipe');assert.ok(c.reference_id);assert.ok(c.license);assert.match(c.interpretation,/同人设计/);}for(const id of ['deepseek','deepseek_pro','deepseek_harness'])assert.match(CHARACTER_ROSTER.find(c=>c.id===id).license,/CC BY-NC-SA 4.0/);});
 it('the editable library rebuild contains a distinct source-backed record for every companion',()=>{const records=fs.readFileSync(path.join(root,'docs/character-library/index/records.jsonl'),'utf8').trim().split('\n').map(JSON.parse);assert.equal(records.length,41);for(const c of CHARACTER_ROSTER){const r=records.find(r=>r.id==='character-'+c.id);assert.ok(r,c.name);assert.equal(r.realm,'reference');assert.ok(r.evidence[0].locator);assert.ok(r.evidence[0].source_sha256);assert.ok(fs.existsSync(path.join(root,'docs/character-library/records',r.id+'.md')));}});
});
