import { PERSONAL_MODEL_EVENTS, PERSONAL_EVENT_BY_ID, PERSONAL_MODEL_PROFILES, MODEL_HISTORY_SOURCE_BY_ID } from '../data/catalog_personal_events.js';
import { HISTORIES } from '../data/catalog_core.js';
import { MODEL_CHARACTERS } from '../data/character_roles.js';
import { CAPABILITY_LABELS } from '../data/model_capabilities.js';
import { personalEventsForHistory, personalEventStatus, personalEventRecord, previewPersonalChoice } from '../engine/personal_events.js';

const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = value => Number(value||0).toFixed(1).replace(/\.0$/,'');
const date = value => value.replaceAll('-','.');
const character = event => MODEL_CHARACTERS.find(c=>c.id===event.character_id);

export function personalStatusLabel(status) {
  if(status.status==='resolved')return '已经历 · 可回看';
  if(status.status==='pending')return '这段回忆还没有写完';
  if(status.status==='ready')return '可以开启';
  if(status.status==='other_model')return '其他模型的回忆 · 可预览';
  if(status.reason==='turn')return `第 ${status.required} 回合开启`;
  if(status.reason==='training')return `完成 ${status.required} 次训练后开启`;
  if(status.reason==='previous_event')return '先完成前一段回忆';
  if(status.reason==='cooldown')return `第 ${status.required} 回合可继续`;
  if(status.reason==='pending_event')return '先完成待处理的回忆';
  return '可阅读史实';
}

function impactHtml(impact,planned=false) {
  if(!impact)return '';
  const stats=impact.stat_gains||impact.stats||{};
  const entries=Object.entries(stats).filter(([,v])=>v!==0).map(([k,v])=>`${CAPABILITY_LABELS[k]||k} +${number(v)}`);
  if(impact.readiness)entries.push(`就绪度 ${impact.readiness>0?'+':''}${number(impact.readiness)}`);
  if(impact.reputation)entries.push(`公司口碑 +${number(impact.reputation)}`);
  if(impact.trust)entries.push(`公司信任 +${number(impact.trust)}`);
  if(impact.cost_kc)entries.push(`研究支出 ${number(impact.cost_kc)} kc`);
  return `<div class="personal-effects" aria-label="${planned?'选择预计影响':'本次实际影响'}">${entries.map(t=>`<span>${esc(t)}</span>`).join('')||'<span>能力已达上限 · 心意留在回忆里</span>'}</div>`;
}

function sourcesHtml(event) {
  return event.source_ids.map(id=>{
    const s=MODEL_HISTORY_SOURCE_BY_ID[id];
    return `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.publisher)} · ${esc(s.title)} ↗</a>`;
  }).join('');
}

export function renderPersonalChronicle(state,selectedHistoryId=null) {
  const active=state.active_model.history_id,selected=selectedHistoryId||active;
  const events=personalEventsForHistory(selected),profile=PERSONAL_MODEL_PROFILES.find(p=>p.history_ids.includes(selected));
  const completed=events.filter(e=>personalEventStatus(state,e).status==='resolved').length;
  const options=HISTORIES.map(h=>{
    const id=h.history_id||h.id,p=PERSONAL_MODEL_PROFILES.find(p=>p.history_ids.includes(id));
    return `<option value="${esc(id)}" ${id===selected?'selected':''}>${esc(p?.name||h.family_name)} · ${esc(h.persona_name)}${id===active?'（当前育成）':''}</option>`;
  }).join('');
  return `<section class="personal-chronicle"><header class="personal-chronicle__heading"><span class="eyebrow">REAL MOMENTS, PERSONAL STORIES</span><h3>历史，也会成为她的回忆</h3><p>${PERSONAL_MODEL_EVENTS.length} 段个人事件，以真实的论文、发布和模型演变为起点。一起经历她的选择，也可以随时回看。</p></header><label class="field personal-history-picker"><span class="field-label">选择模型的个人事件线</span><select class="input" data-personal-history>${options}</select></label><div class="personal-progress"><strong>${esc(profile?.name||'等待补充史料')}</strong><span>已完成 ${completed} / ${events.length} 段</span></div>${selected!==active?'<p class="personal-hint">这里可以预览其他模型的故事。正式选择和成长奖励属于当前育成模型。</p>':''}${events.length?`<ol class="personal-memory-list">${events.map(e=>{
    const status=personalEventStatus(state,e),record=personalEventRecord(state,e.event_id);
    const action=status.status==='ready'?'一起经历':status.status==='pending'?'继续这段回忆':status.status==='resolved'?'回看这一页':'预览这段故事';
    return `<li class="personal-memory ${status.status==='resolved'?'is-complete':''}" data-personal-event-card="${e.event_id}"><div class="personal-memory__date"><span>${String(e.order).padStart(2,'0')}</span><time>${date(e.historical_date)}</time></div><h4>${esc(e.title)}</h4><small>${esc(e.historical_title)}</small><p>${esc(e.fact)}</p><blockquote>${esc(e.line)}</blockquote>${record?`<p class="personal-memory__choice">第 ${record.turn} 回合 · ${esc(record.label)}</p>`:''}<footer><span>${personalStatusLabel(status)}</span><button class="btn btn--small ${status.status==='ready'||status.status==='pending'?'btn--primary':'btn--ghost'}" data-action="personal-open" data-id="${e.event_id}">${action} ↗</button></footer></li>`;
  }).join('')}</ol>`:'<div class="personal-empty"><h4>这一页，先留给可靠的史料</h4><p>还未确认该角色对应的真实模型与官方发布史。确认出处后再写个人事件，角色仍可照常育成。</p></div>'}<p class="art-note">日期与史实取自官方公告、官方仓库或原作者论文。人物场景、对白、选择和成长奖励为游戏演绎；你的选择影响本局，不改写已经发生的历史。工具与设施 NPC 不进入模型育成事件线。</p></section>`;
}

export function renderPersonalEventBody(state,eventId) {
  const event=PERSONAL_EVENT_BY_ID[eventId];if(!event)return '';
  const status=personalEventStatus(state,event),record=personalEventRecord(state,eventId),c=character(event),interactive=status.status==='pending';
  return `<section class="personal-story" data-personal-story="${eventId}"><header class="personal-story__meta"><span>${esc(event.model_name)} · 个人事件 ${event.order}</span><time>${date(event.historical_date)}</time></header><div class="personal-story__scene">${c?`<div class="personal-story__portrait"><img src="${c.src}" alt="${esc(c.name)} · 个人事件"/></div>`:''}<div><span class="eyebrow">角色演绎</span><p>${esc(event.scene)}</p><blockquote><span>${esc(c?.label||event.model_name)}</span>${esc(event.line)}</blockquote></div></div><details class="personal-evidence" open><summary>真实历史 · ${esc(event.historical_title)}</summary><p>${esc(event.fact)}</p><small>${esc(event.subject)}${event.date_note?` · ${esc(event.date_note)}`:''}</small><div>${sourcesHtml(event)}</div></details>${record?`<div class="personal-result"><span class="eyebrow">第 ${record.turn} 回合留下的选择</span><h4>${esc(record.label)}</h4><p>${esc(record.result_text)}</p>${impactHtml(record.effects)}<small>回看只重读故事，奖励已在当时结算。</small></div>`:`<p class="personal-hint">${interactive?'接下来是你们这轮育成的选择。历史事实保留原样。':personalStatusLabel(status)+'。现在可以先阅读，选择和奖励按育成进度开启。'}</p><div class="personal-choices">${event.choices.map(choice=>{
    const preview=interactive?previewPersonalChoice(state,eventId,choice.choice_id):null;
    return `<button class="personal-choice" data-action="personal-choice" data-id="${eventId}" data-choice="${choice.choice_id}" ${!interactive||!preview?.ok?'disabled':''}><strong>${esc(choice.label)}</strong>${impactHtml(preview?.ok?preview:choice.effects,true)}${interactive&&!preview?.ok?'<small>研究资金不足，仍可选择不收费的路线。</small>':''}</button>`;
  }).join('')}</div>`}<p class="art-note">${esc(event.adaptation)}</p></section>`;
}

export function renderPersonalResult(result) {
  const {event,record}=result,c=character(event);
  return `<section class="personal-story personal-story--result"><span class="eyebrow">A PAGE TO REMEMBER</span><div class="personal-story__scene">${c?`<div class="personal-story__portrait"><img src="${c.sprites?.happy||c.src}" alt="${esc(c.name)} · 回忆"/></div>`:''}<div><h3>${esc(record.label)}</h3><p>${esc(record.result_text)}</p>${impactHtml(record.effects)}</div></div><p class="personal-hint">已收入个人事件簿。史实出处与这次的选择都可以回看。</p></section>`;
}
