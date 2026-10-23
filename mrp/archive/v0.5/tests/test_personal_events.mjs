import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {PERSONAL_MODEL_EVENTS,PERSONAL_MODEL_PROFILES,MODEL_HISTORY_SOURCES,MODEL_HISTORY_SOURCE_BY_ID,MODEL_HISTORY_RESEARCH} from '../src/data/catalog_personal_events.js';
import {CAPABILITY_KEYS} from '../src/data/model_capabilities.js';
import {NPC_CHARACTERS} from '../src/data/character_roles.js';
import {HISTORIES} from '../src/data/catalog_core.js';
import {createNewGameState,validateGameState} from '../src/engine/state_schema.js';
import {personalEventsForHistory,personalEventStatus,nextPersonalEvent,pendingPersonalEvent,beginPersonalEvent,previewPersonalChoice,resolvePersonalEvent,validatePersonalHistory} from '../src/engine/personal_events.js';
import {configureOffer} from '../src/engine/service_economy.js';
import {advanceTurn,closeQuarter,transitionToNextSeason} from '../src/engine/company_and_world_engine.js';
import {renderPersonalChronicle,renderPersonalEventBody} from '../src/ui/personal_event_views.js';

const clone = value=>JSON.parse(JSON.stringify(value));
const first=PERSONAL_MODEL_EVENTS.find(e=>e.model_key==='qwen');
const game=(id='qwen_ecosystem')=>createNewGameState({profileId:'small_startup',historyId:id});
const free=e=>e.choices.find(c=>c.effects.cost_kc===0);
const at=(s,turn)=>{s.world.turn_index=turn;};
const near=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} != ${b}`);
function prepare(event) {
  const s=game(event.history_ids[0]);s.active_model.training_action_count=3;
  for(const e of personalEventsForHistory(s.active_model.history_id)) {
    at(s,Math.max(e.trigger.min_turn,s.world.turn_index+3));
    assert.equal(beginPersonalEvent(s,e.event_id).ok,true,e.event_id);
    if(e.event_id===event.event_id)return s;
    assert.equal(resolvePersonalEvent(s,e.event_id,free(e).choice_id).ok,true);
  }
  throw new Error('fixture target missing');
}

describe('Verified model-history content and ownership',()=>{
  it('provides sixty-seven distinct episodes with two authored choices each and explicit provenance',()=>{
    assert.equal(PERSONAL_MODEL_EVENTS.length,67);assert.equal(PERSONAL_MODEL_PROFILES.length,27);
    assert.equal(new Set(PERSONAL_MODEL_EVENTS.map(e=>e.event_id)).size,67);
    assert.equal(new Set(MODEL_HISTORY_SOURCES.map(s=>s.id)).size,MODEL_HISTORY_SOURCES.length);
    for(const event of PERSONAL_MODEL_EVENTS) {
      assert.equal(event.choices.length,2,event.event_id);assert.ok(event.scene&&event.line&&event.fact);
      assert.ok(event.historical_date<='2026-10-19');assert.match(event.historical_date,/^\d{4}-\d{2}(-\d{2})?$/);
      assert.match(event.adaptation,/同人演绎/);assert.match(event.adaptation,/不改写历史/);
      for(const id of event.source_ids){const s=MODEL_HISTORY_SOURCE_BY_ID[id];assert.ok(s,id);assert.equal(new URL(s.url).protocol,'https:');assert.ok(s.publisher);}
      assert.ok(free(event),event.event_id);
      for(const choice of event.choices){assert.ok(choice.label&&choice.result_text);assert.ok(choice.effects.cost_kc>=0&&choice.effects.cost_kc<=10);for(const [key,value] of Object.entries(choice.effects.stats)){assert.ok(CAPABILITY_KEYS.includes(key),key);assert.ok(value>0&&value<=8);}}
    }
  });
  it('maps every episode only to real cultivation routes and excludes all NPCs',()=>{
    for(const event of PERSONAL_MODEL_EVENTS)for(const id of event.history_ids)assert.ok(HISTORIES.some(h=>h.history_id===id),id);
    for(const npc of NPC_CHARACTERS){assert.equal(personalEventsForHistory(npc.id).length,0);assert.equal(personalEventsForHistory('roster_'+npc.id).length,0);}
    assert.deepEqual(MODEL_HISTORY_RESEARCH.unresolved_character_ids,[]);
    assert.equal(personalEventsForHistory('roster_fable').length,4);assert.equal(personalEventsForHistory('roster_jev').length,2);
  });
  it('keeps each model chain chronological and ties later scenes to the previous choice',()=>{
    for(const profile of PERSONAL_MODEL_PROFILES){const events=personalEventsForHistory(profile.history_ids[0]);assert.ok(events.length);for(let i=0;i<events.length;i++){assert.equal(events[i].order,i+1);assert.equal(events[i].trigger.previous_event_id,events[i-1]?.event_id||null);if(i)assert.ok(events[i].historical_date>=events[i-1].historical_date);}}
  });
  it('does not mutate legacy saves when querying or previewing any model history',()=>{
    const s=game(),before=JSON.stringify(s);
    nextPersonalEvent(s);pendingPersonalEvent(s);renderPersonalChronicle(s);
    for(const e of PERSONAL_MODEL_EVENTS){personalEventStatus(s,e);renderPersonalEventBody(s,e.event_id);for(const c of e.choices)previewPersonalChoice(s,e.event_id,c.choice_id);}
    assert.equal(JSON.stringify(s),before);assert.equal(s.story.personal_events,undefined);
  });
});

describe('Personal event lifecycle and one-time rewards',()=>{
  it('requires the correct turn, model and started event before a choice can pay rewards',()=>{
    const s=game(),before=JSON.stringify(s);
    assert.equal(beginPersonalEvent(s,first.event_id).reason,'turn');
    assert.equal(resolvePersonalEvent(s,first.event_id,'letters').reason,'event_not_started');
    assert.equal(JSON.stringify(s),before);
    at(s,2);const other=PERSONAL_MODEL_EVENTS.find(e=>e.model_key==='kimi');const snap=JSON.stringify(s);
    assert.equal(beginPersonalEvent(s,other.event_id).reason,'model_mismatch');assert.equal(JSON.stringify(s),snap);
  });
  it('persists an unfinished event across save/reload and resumes it without duplication',()=>{
    const s=game();at(s,2);assert.equal(beginPersonalEvent(s,first.event_id).ok,true);
    const restored=clone(s),before=JSON.stringify(restored);
    assert.equal(pendingPersonalEvent(restored).event_id,first.event_id);
    assert.equal(beginPersonalEvent(restored,first.event_id).resumed,true);
    assert.equal(JSON.stringify(restored),before);assert.equal(nextPersonalEvent(restored),null);
    assert.equal(validateGameState(restored).valid,true);
  });
  it('settles all 134 authored choices once, with valid saves and actual clamped effects',()=>{
    for(const event of PERSONAL_MODEL_EVENTS)for(const choice of event.choices){
      const s=prepare(event),cash=s.company.cash_kc,paid=s.company.quarter_paid_rnd_kc,stats=clone(s.active_model.stats),count=s.active_model.training_action_count,used=s.main_action_used;
      const preview=previewPersonalChoice(s,event.event_id,choice.choice_id);assert.equal(preview.ok,true);
      const result=resolvePersonalEvent(s,event.event_id,choice.choice_id);assert.equal(result.ok,true,event.event_id);
      near(s.company.cash_kc,cash-choice.effects.cost_kc);near(s.company.quarter_paid_rnd_kc,paid+choice.effects.cost_kc);
      for(const key of CAPABILITY_KEYS)near(s.active_model.stats[key]-stats[key],preview.stat_gains[key]||0);
      assert.equal(s.active_model.training_action_count,count);assert.equal(s.main_action_used,used);
      assert.equal(personalEventStatus(s,event).status,'resolved');assert.equal(pendingPersonalEvent(s),null);
      assert.equal(validateGameState(s).valid,true,JSON.stringify(validateGameState(s).errors));
      const after=JSON.stringify(s);assert.equal(resolvePersonalEvent(s,event.event_id,choice.choice_id).reason,'already_resolved');assert.equal(JSON.stringify(s),after);
      const saved=clone(s),snapshot=JSON.stringify(saved);assert.equal(resolvePersonalEvent(saved,event.event_id,choice.choice_id).reason,'already_resolved');assert.equal(JSON.stringify(saved),snapshot);
    }
  });
  it('keeps an unaffordable choice atomic and leaves the free branch available',()=>{
    const s=prepare(first);s.company.cash_kc=0;const before=JSON.stringify(s);
    assert.equal(resolvePersonalEvent(s,first.event_id,'evaluation').reason,'insufficient_cash');assert.equal(JSON.stringify(s),before);
    assert.equal(personalEventStatus(s,first).status,'pending');assert.equal(resolvePersonalEvent(s,first.event_id,'letters').ok,true);assert.equal(s.company.cash_kc,0);
  });
  it('does not reward an invalid choice or allow a pending event to follow another model',()=>{
    const s=prepare(first),before=JSON.stringify(s);
    assert.equal(resolvePersonalEvent(s,first.event_id,'unknown').reason,'choice_not_found');assert.equal(JSON.stringify(s),before);
    s.active_model.history_id='roster_kimi';const snapshot=JSON.stringify(s);
    assert.equal(resolvePersonalEvent(s,first.event_id,'letters').reason,'model_mismatch');assert.equal(JSON.stringify(s),snapshot);
  });
  it('enforces training requirements, chapter order and a cooldown after completion',()=>{
    const s=game(),events=personalEventsForHistory(s.active_model.history_id);at(s,2);beginPersonalEvent(s,first.event_id);resolvePersonalEvent(s,first.event_id,'letters');
    at(s,6);assert.equal(personalEventStatus(s,events[1]).reason,'training');s.active_model.training_action_count=1;
    assert.equal(beginPersonalEvent(s,events[1].event_id).ok,true);assert.equal(resolvePersonalEvent(s,events[1].event_id,free(events[1]).choice_id).ok,true);
    s.active_model.training_action_count=2;at(s,10);assert.equal(beginPersonalEvent(s,events[2].event_id).ok,true);
    at(s,20);resolvePersonalEvent(s,events[2].event_id,free(events[2]).choice_id);
    const other=PERSONAL_MODEL_EVENTS.find(e=>e.model_key==='kimi');s.active_model.history_id='roster_kimi';
    assert.equal(personalEventStatus(s,other).reason,'cooldown');at(s,23);assert.equal(personalEventStatus(s,other).status,'ready');
  });
  it('respects zero and full stat caps without reducing an already over-cap value',()=>{
    const s=prepare(first);s.active_model.stats.knowledge=719;s.active_model.stat_caps.knowledge=720;s.active_model.stats.expression=0;s.active_model.stat_caps.expression=0;
    const res=resolvePersonalEvent(s,first.event_id,'letters');assert.equal(res.record.effects.stat_gains.knowledge,1);assert.equal(res.record.effects.stat_gains.expression,0);assert.equal(s.active_model.stats.expression,0);
    const t=prepare(first);t.active_model.stats.reliability=730;t.active_model.stat_caps.reliability=720;resolvePersonalEvent(t,first.event_id,'evaluation');assert.equal(t.active_model.stats.reliability,730);
  });
  it('does not silently upgrade an already-published service snapshot',()=>{
    const s=prepare(first);assert.equal(configureOffer(s,'api',{enabled:true}).ok,true);const offer=s.serving.offers.find(o=>o.id==='api');assert.equal(offer.published_model.capabilities.knowledge,450);const published=JSON.stringify(offer.published_model);
    resolvePersonalEvent(s,first.event_id,'letters');assert.equal(JSON.stringify(offer.published_model),published);assert.ok(s.active_model.stats.knowledge>450);
  });
  it('books paid story research at choice time and does not deduct it again at quarter close',()=>{
    const s=game();let last=advanceTurn(s),margin=last.serving.margin_kc;
    assert.equal(beginPersonalEvent(s,first.event_id).ok,true);resolvePersonalEvent(s,first.event_id,'evaluation');
    while(s.world.turn_index<7){last=advanceTurn(s);margin+=last.serving.margin_kc;}
    const q=last.quarter_closed;assert.equal(q.paid_rnd_kc,8);near(s.company.cash_kc,2400+margin-8-110-q.tax_kc);near(q.cash_delta_from_close_kc,-110-q.tax_kc);
    const before=s.company.cash_kc;assert.equal(closeQuarter(s).already_closed,true);assert.equal(s.company.cash_kc,before);
  });
  it('retains completed personal memories when continuing a season',()=>{
    const s=prepare(first);resolvePersonalEvent(s,first.event_id,'letters');const record=clone(s.story.history.find(r=>r.event_id===first.event_id));
    transitionToNextSeason(s,'continue');assert.deepEqual(s.story.history.find(r=>r.event_id===first.event_id),record);assert.equal(personalEventStatus(s,first).status,'resolved');
  });
  it('does not unlock new reward scenes after the campaign ends',()=>{
    const s=game();at(s,193);assert.equal(personalEventStatus(s,first).reason,'campaign_finished');assert.equal(nextPersonalEvent(s),null);
  });
  it('rejects corrupt pending IDs, duplicate records and invalid reward records at import validation',()=>{
    const s=prepare(first);resolvePersonalEvent(s,first.event_id,'letters');
    const bad=clone(s);bad.story.personal_events.pending_ids=['unknown'];assert.equal(validateGameState(bad).valid,false);
    const duplicate=clone(s);duplicate.story.history.push(clone(duplicate.story.history.at(-1)));assert.equal(validateGameState(duplicate).valid,false);
    const invalid=clone(s);invalid.story.history.at(-1).effects.stat_gains.coding=Infinity;assert.ok(validatePersonalHistory(invalid).length);
    const replayPending=clone(s);replayPending.story.personal_events.pending_ids=[first.event_id];assert.equal(validateGameState(replayPending).valid,false);
  });
});
