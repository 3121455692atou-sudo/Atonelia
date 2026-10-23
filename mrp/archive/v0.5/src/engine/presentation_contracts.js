/** UI adapters keep previews read-only and let the engine own each mutation once. */
import { executePrivateFinancing, executeIPO } from './company_and_world_engine.js';
import { acquireDatasetOffer } from './race_and_data_engine.js';
import { STORY_EVENTS, DATASET_TEMPLATES } from '../data/catalog_world.js';
import { createDataset } from './state_schema.js';
const clone = value => JSON.parse(JSON.stringify(value));

export function previewFinancing(state) {
  return { privateFin: executePrivateFinancing(clone(state), {}), ipo: executeIPO(clone(state), {}) };
}

export function purchaseDataset(state, offer) {
  if (state.main_action_used) return {success:false, reason:'action_used'};
  if (!offer) return {success:false, reason:'offer_not_found'};
  const price = Math.max(0, Number(offer.price_kc || 0));
  if (state.company.cash_kc < price) return {success:false, reason:'insufficient_cash'};
  const before = state.company.cash_kc;
  const result = acquireDatasetOffer(state, offer);
  if (!result?.success) return result || {success:false,reason:'purchase_failed'};
  // The generic engine also supports legacy credit-only callers. The game uses company cash.
  if (state.company.cash_kc === before) state.company.cash_kc = Number((before - result.spent_kc).toFixed(4));
  state.company.quarter_paid_rnd_kc = Number(((state.company.quarter_paid_rnd_kc || 0) + result.spent_kc).toFixed(4));
  if (Array.isArray(state.data_market)) state.data_market = state.data_market.filter(o => o.offer_id !== offer.offer_id && o !== offer);
  for (const d of state.datasets) { d.id ||= d.dataset_id; d.name ||= d.display_name || d.id; }
  state.main_action_used = true;
  state.last_action = {type:'data_purchase',success:true,cost_kc:result.spent_kc,dataset_id:result.dataset_id};
  return result;
}

// Catalog narrative uses declarative instructions; unsupported later-game instructions
// are left to their owning engines instead of reporting a successful no-op.
const directPaths = {
  kc:['company','cash_kc'], reputation:['company','reputation'], trust:['company','trust'],
  'stats.knowledge':['active_model','stats','knowledge'], 'stats.reasoning':['active_model','stats','reasoning'],
  'stats.coding':['active_model','stats','coding'], 'stats.expression':['active_model','stats','expression'],
  'stats.context':['active_model','stats','context'], 'stats.reliability':['active_model','stats','reliability'],
};
const supported = effect => ['set_flag','start_project'].includes(effect.op) ||
  (effect.op==='grant_dataset' && DATASET_TEMPLATES.some(d=>d.dataset_id===effect.dataset_id)) ||
  (effect.op==='spend' && effect.resource==='kc') ||
  (['add','set','scale'].includes(effect.op) && Object.hasOwn(directPaths,effect.path));
export function canResolveCatalogEvent(event) {
  return !!event?.choices?.length && event.choices.every(c=>Array.isArray(c.effects) && c.effects.every(supported));
}
export function resolveCatalogChoice(state,eventId,choiceId) {
  const event = STORY_EVENTS.find(e=>e.event_id===eventId);
  const choice = event?.choices.find(c=>(c.choice_id||c.id)===choiceId);
  if (!choice || !choice.effects.every(supported)) return {ok:false,reason:'unsupported_event'};
  state.story ||= {history:[],flags:[],pending_events:[],resolved_ids:[]};
  const story = state.story;
  story.history ||= []; story.flags ||= []; story.resolved_ids ||= [];
  if (story.resolved_ids.includes(eventId)) return {ok:false,reason:'already_resolved'};
  for (const effect of choice.effects) {
    if (effect.op==='set_flag') {
      if (Array.isArray(story.flags)) { if (effect.value && !story.flags.includes(effect.flag)) story.flags.push(effect.flag); }
      else story.flags[effect.flag] = effect.value;
    } else if (effect.op==='start_project') {
      state.research_projects ||= {};
      state.research_projects[effect.project_id] ||= {project_id:effect.project_id,remaining_turns:effect.turns,progress:0,source:'story'};
    } else if (effect.op==='grant_dataset') {
      const template = DATASET_TEMPLATES.find(d=>d.dataset_id===effect.dataset_id);
      if (!state.datasets.some(d=>d.dataset_id===effect.dataset_id)) state.datasets.push(createDataset(template));
    } else if (effect.op==='spend') {
      state.company.cash_kc -= Number(effect.amount || 0);
    } else {
      const parts = directPaths[effect.path]; const key = parts.at(-1);
      const target = parts.slice(0,-1).reduce((obj,k)=>obj[k],state);
      target[key] = effect.op==='set' ? effect.value : effect.op==='scale' ? Number(target[key]||0)*Number(effect.value) : Number(target[key]||0)+Number(effect.value);
    }
  }
  story.resolved_ids.push(eventId);
  story.history.push({event_id:eventId,choice_id:choiceId,turn:state.world.turn_index,label:choice.text});
  story.resolved_events = (story.resolved_events || 0) + 1;
  return {ok:true,text:choice.result_text};
}
