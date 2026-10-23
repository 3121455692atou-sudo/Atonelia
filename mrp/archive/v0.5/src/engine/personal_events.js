import { PERSONAL_MODEL_EVENTS, PERSONAL_EVENT_BY_ID } from '../data/catalog_personal_events.js';
import { CAPABILITY_KEYS } from '../data/model_capabilities.js';
import { BALANCE_RULES } from '../data/catalog_core.js';
import { isNpcIdentity } from '../data/character_roles.js';

export const PERSONAL_EVENT_COOLDOWN = 3;
const bounded = (value,min,max) => Math.max(min,Math.min(max,value));
const finite = (value,fallback=0) => Number.isFinite(value)?value:fallback;
const round = value => Number(value.toFixed(4));
const turnOf = state => finite(state?.world?.turn_index,finite(state?.turn,1));
const pendingIds = state => Array.isArray(state?.story?.personal_events?.pending_ids)?state.story.personal_events.pending_ids:[];
const history = state => Array.isArray(state?.story?.history)?state.story.history:[];
const resolved = (state,id) => (Array.isArray(state?.story?.resolved_ids)&&state.story.resolved_ids.includes(id)) || history(state).some(r=>r?.kind==='model_history'&&r.event_id===id);
const lastPersonalTurn = state => Math.max(finite(state?.story?.personal_events?.last_started_turn),...history(state).filter(r=>r?.kind==='model_history').map(r=>finite(r.turn)));

export function personalEventsForHistory(historyId) {
  return PERSONAL_MODEL_EVENTS.filter(e=>e.history_ids.includes(historyId));
}

export function personalEventRecord(state,eventId) {
  return history(state).find(r=>r?.kind==='model_history'&&r.event_id===eventId)||null;
}

// Queries never initialize or mutate a save, including old saves without a personal-events field.
export function personalEventStatus(state,eventOrId) {
  const event=typeof eventOrId==='string'?PERSONAL_EVENT_BY_ID[eventOrId]:eventOrId;
  if(!event)return {status:'missing',reason:'event_not_found'};
  if(resolved(state,event.event_id))return {status:'resolved',record:personalEventRecord(state,event.event_id)};
  const model=state?.active_model;
  if(!model||isNpcIdentity(model.history_id)||!event.history_ids.includes(model.history_id))return {status:'other_model',reason:'model_mismatch'};
  if(pendingIds(state).includes(event.event_id))return {status:'pending'};
  if(turnOf(state)>(BALANCE_RULES.CAMPAIGN_TURNS||192))return {status:'locked',reason:'campaign_finished'};
  if(event.trigger.previous_event_id&&!resolved(state,event.trigger.previous_event_id))return {status:'locked',reason:'previous_event'};
  if(turnOf(state)<event.trigger.min_turn)return {status:'locked',reason:'turn',required:event.trigger.min_turn};
  if(finite(model.training_action_count)<event.trigger.min_training_actions)return {status:'locked',reason:'training',required:event.trigger.min_training_actions};
  const otherPending=pendingIds(state).find(id=>PERSONAL_EVENT_BY_ID[id]?.history_ids.includes(model.history_id));
  if(otherPending)return {status:'locked',reason:'pending_event',pending_id:otherPending};
  const last=lastPersonalTurn(state);
  if(last>0&&turnOf(state)-last<PERSONAL_EVENT_COOLDOWN)return {status:'locked',reason:'cooldown',required:last+PERSONAL_EVENT_COOLDOWN};
  return {status:'ready'};
}

export function nextPersonalEvent(state) {
  return personalEventsForHistory(state?.active_model?.history_id).find(e=>personalEventStatus(state,e).status==='ready')||null;
}

export function pendingPersonalEvent(state) {
  return pendingIds(state).map(id=>PERSONAL_EVENT_BY_ID[id]).find(e=>e?.history_ids.includes(state?.active_model?.history_id)&&!resolved(state,e.event_id))||null;
}

function writableStory(state) {
  if(!state.story||typeof state.story!=='object'||Array.isArray(state.story))state.story={};
  if(!Array.isArray(state.story.history))state.story.history=[];
  if(!Array.isArray(state.story.resolved_ids))state.story.resolved_ids=[];
  state.story.personal_events ||= {version:1,pending_ids:[],last_started_turn:0};
  return state.story;
}

export function beginPersonalEvent(state,eventId=null) {
  const event=eventId?PERSONAL_EVENT_BY_ID[eventId]:nextPersonalEvent(state);
  if(!event)return {ok:false,reason:'no_eligible_event'};
  const status=personalEventStatus(state,event);
  if(status.status==='pending')return {ok:true,event,resumed:true};
  if(status.status!=='ready')return {ok:false,reason:status.reason||status.status};
  const story=writableStory(state);
  story.personal_events.pending_ids.push(event.event_id);
  story.personal_events.last_started_turn=turnOf(state);
  return {ok:true,event,resumed:false};
}

export function previewPersonalChoice(state,eventId,choiceId) {
  const event=PERSONAL_EVENT_BY_ID[eventId],choice=event?.choices.find(c=>c.choice_id===choiceId);
  if(!choice)return {ok:false,reason:'choice_not_found'};
  const status=personalEventStatus(state,event);
  if(!['ready','pending'].includes(status.status))return {ok:false,reason:status.reason||status.status};
  const model=state.active_model,company=state.company;
  if(!company||!model?.stats)return {ok:false,reason:'invalid_state'};
  const e=choice.effects,cost=finite(e.cost_kc);
  if(!Number.isFinite(company.cash_kc)||company.cash_kc<cost)return {ok:false,reason:'insufficient_cash',cost_kc:cost};
  const gains={};
  for(const [key,delta] of Object.entries(e.stats)) {
    const before=finite(model.stats[key]),cap=bounded(finite(model.stat_caps?.[key],1000),0,1000);
    gains[key]=round(Math.max(before,Math.min(cap,before+delta))-before);
  }
  const readinessBefore=finite(company.cluster_readiness,finite(state.cluster_readiness));
  return {ok:true,event,choice,cost_kc:cost,stat_gains:gains,
    readiness:round(bounded(readinessBefore+e.readiness,0,100)-readinessBefore),
    reputation:round(bounded(finite(company.reputation)+e.reputation,0,100)-finite(company.reputation)),
    trust:round(bounded(finite(company.trust)+e.trust,0,100)-finite(company.trust))};
}

export function resolvePersonalEvent(state,eventId,choiceId) {
  const event=PERSONAL_EVENT_BY_ID[eventId];
  if(!event)return {ok:false,reason:'event_not_found'};
  if(resolved(state,eventId))return {ok:false,reason:'already_resolved'};
  if(!pendingIds(state).includes(eventId))return {ok:false,reason:'event_not_started'};
  const preview=previewPersonalChoice(state,eventId,choiceId);
  if(!preview.ok)return preview;
  const {choice,cost_kc,stat_gains,readiness,reputation,trust}=preview;
  // Affordability and all eligibility checks complete before the first mutation.
  const story=writableStory(state),company=state.company,model=state.active_model;
  company.cash_kc=round(company.cash_kc-cost_kc);
  company.quarter_paid_rnd_kc=round(finite(company.quarter_paid_rnd_kc)+cost_kc);
  for(const [key,delta] of Object.entries(stat_gains))model.stats[key]=round(model.stats[key]+delta);
  company.cluster_readiness=round(finite(company.cluster_readiness,finite(state.cluster_readiness))+readiness);
  if(Object.hasOwn(state,'cluster_readiness'))state.cluster_readiness=company.cluster_readiness;
  company.reputation=round(finite(company.reputation)+reputation);
  company.trust=round(finite(company.trust)+trust);
  if(Number.isFinite(company.public_trust))company.public_trust=round(bounded(company.public_trust+trust,0,100));
  const record={kind:'model_history',event_id:eventId,choice_id:choiceId,label:choice.label,result_text:choice.result_text,
    turn:turnOf(state),model_id:model.model_id||model.id,history_id:model.history_id,historical_date:event.historical_date,
    source_ids:[...event.source_ids],effects:{cost_kc,stat_gains,readiness,reputation,trust}};
  story.history.push(record);
  story.resolved_ids.push(eventId);
  story.resolved_events=finite(story.resolved_events)+1;
  story.personal_events.pending_ids=story.personal_events.pending_ids.filter(id=>id!==eventId);
  return {ok:true,event,record,text:choice.result_text};
}

export function validatePersonalHistory(state) {
  const errors=[],story=state?.story;
  if(!story)return errors;
  if(story.history!==undefined&&!Array.isArray(story.history))errors.push('story.history 必须是数组');
  if(story.resolved_ids!==undefined&&!Array.isArray(story.resolved_ids))errors.push('story.resolved_ids 必须是数组');
  const meta=story.personal_events;
  if(meta!==undefined) {
    if(!meta||typeof meta!=='object'||Array.isArray(meta))return ['story.personal_events 必须是对象'];
    if(meta.version!==1)errors.push('story.personal_events.version 无效');
    if(!Array.isArray(meta.pending_ids)||meta.pending_ids.some(id=>!PERSONAL_EVENT_BY_ID[id])||new Set(meta.pending_ids).size!==meta.pending_ids.length)errors.push('story.personal_events.pending_ids 含无效或重复事件');
    if(!Number.isInteger(meta.last_started_turn)||meta.last_started_turn<0||meta.last_started_turn>193)errors.push('story.personal_events.last_started_turn 无效');
  }
  const records=history(state).filter(r=>r?.kind==='model_history'),seen=new Set();
  for(const record of records) {
    const event=PERSONAL_EVENT_BY_ID[record.event_id];
    if(!event||!event.choices.some(c=>c.choice_id===record.choice_id)||!event.history_ids.includes(record.history_id)||seen.has(record.event_id))errors.push('story.history 含无效或重复的模型个人事件');
    seen.add(record.event_id);
    if(!Number.isInteger(record.turn)||record.turn<1||record.turn>193)errors.push('story.history 个人事件回合无效');
    const e=record.effects;
    if(!e||!Number.isFinite(e.cost_kc)||e.cost_kc<0||!e.stat_gains||typeof e.stat_gains!=='object'||Array.isArray(e.stat_gains)||Object.entries(e.stat_gains).some(([key,value])=>!CAPABILITY_KEYS.includes(key)||!Number.isFinite(value)||value<0||value>20))errors.push('story.history 个人事件收益无效');
    if(e&&['readiness','reputation','trust'].some(k=>!Number.isFinite(e[k])))errors.push('story.history 个人事件影响无效');
  }
  if(Array.isArray(meta?.pending_ids)&&meta.pending_ids.some(id=>resolved(state,id)))errors.push('story.personal_events 包含已经完成的待处理事件');
  return errors;
}
