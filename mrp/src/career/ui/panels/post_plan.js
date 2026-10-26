import { plateAt } from '../../data/core.js';
import { POST_CARD_ART } from '../../data/post_card_art.js';
// Real, single-player ordinary model session. Rendering never deals cards or grants training.
import * as E from '../../engine.js';
import { TRAIN_PACE } from '../../data/balance.js';
import { art, esc, count, pct, icon } from '../fmt.js';
import { act, isRemote } from '../act.js';
import { getState, getWorld, getMp, render as renderMain, toast } from '../state.js';
import { resumePostPlanAuto, stopPostPlanController } from '../post_plan_controller.js';
import { mountPostPlanFeedback, queuePostPlanFeedback, rejectPostPlanFeedback, disposePostPlanFeedback, selectPostPlanFeedback, postPlanFeedbackDelay, queuePostPlanDeal } from '../post_plan_feedback.js';
import { choiceProjection, CHOICE_METERS, CHOICE_TAG_NAMES, choiceRuleDescription } from '../post_plan_choices.js';

import { mountPostPlanArt, disposePostPlanArt } from '../post_plan_art.js';
import { mountPostPlanFocus, disposePostPlanFocus } from '../post_plan_focus.js';

const runtime = new WeakMap();
// A reused office state object is not a request identity. Reset/exit invalidates
// its token; stale completions may not unlock or repaint a newer screen.
const requests = new WeakMap();
const infoMounts = new WeakMap();
const STATUS = { draft: '准备组牌', playing: '演练进行中', ready: '方案已就绪', active: '方案生效中', superseded: '已被新方案替换', invalid: '方案已失效' };
export const available = S => E.postPlanSupported(S) && !getMp() && !isRemote() && !getWorld()?.settings?.mp && !getWorld()?.mirror && !E.P().world?.settings?.mp && !E.P().mirror && S.postRandom === undefined;
const models = S => (S.models || []).filter(m => E.trainablePostModel(S, m.id));
const tagNames = CHOICE_TAG_NAMES;
const disabled = value => value ? ' disabled' : '';
const characterLabel = (id,date) => { const p=plateAt(id,date);return p.label ? `${p.name} · ${p.label}` : p.name; };
const cardArt = (c,date,eager=false,slot=eager?'hand':'catalogue') => {
  const path = POST_CARD_ART[c.id];
  if (path) return `<span class="pp-card-art pp-art-pending" data-pp-key="art:${slot}:${esc(c.id)}"><span class="pp-art-loading" aria-hidden="true">卡面载入中</span><img data-pp-image-key="${slot}:${esc(c.id)}" src="${esc(new URL(path, document.baseURI).href)}" alt="${esc(c.name)} · Q版动作卡面" loading="${eager ? 'eager' : 'lazy'}" decoding="async"${eager ? ' fetchpriority="high"' : ''} data-pp-art="${esc(c.id)}" /></span>`;
  return `<span class="pp-card-art pp-art-missing" data-missing-card-art="${esc(c.id)}">${c.id === 'basic' ? '♡<small>免费保底规则</small>' : `<b>${esc(c.characterId ? characterLabel(c.characterId,date) : c.name)}</b><small>动作卡面制作中</small>`}</span>`;
};
const STAGE_THEME = { llm: 'language', image: 'image', music: 'music', speech: 'speech' };
const BUFF_DISPLAY = { focus: ['聚焦', 4, '◎'], flow: ['积累', 8, '↗'], shield: ['稳定', 4, '◇'], boost: ['校准', 2, '✦'] };
// 叠层显示：--n/--max 驱动图标外圈的进度环（纯显示），has-stack 让有层数的 buff 亮起，空的保持暗色。
// choice：当前选中、付得起的那张牌的公开预估（choiceProjection）。有就在叠层图标上标出“→新层数”，并把会新增/消耗的格子画成虚影；只是预览，不是结算。
const buffDisplay = (v, choice = null) => Object.entries(BUFF_DISPLAY).map(([key, [label, max, icon]]) => {
  const m = choice?.meters?.find(x => x.key === key), d = m ? m.after - v[key] : 0;
  const lo = Math.min(v[key], m?.after ?? v[key]), hi = Math.max(v[key], m?.after ?? v[key]);
  const pip = i => i < lo ? ' class="is-filled"' : i < hi ? (d > 0 ? ' class="is-preview-gain"' : ' class="is-filled is-preview-loss"') : '';
  return `<button type="button" data-pp-info data-pp-buff="${key}" class="${v[key] > 0 ? 'has-stack' : 'no-stack'}${v[key] >= max ? ' is-full' : ''}${d ? ` is-preview ${d > 0 ? 'is-preview-up' : 'is-preview-down'}` : ''}" style="--n:${v[key]};--max:${max}" title="${label} ${v[key]}/${max}" aria-label="${label} ${v[key]} 层，查看说明"><small aria-hidden="true">${icon}</small><b>${label} <em>${v[key]}</em><i>/${max}</i>${d ? `<span class="pp-preview pp-preview--${d > 0 ? 'up' : 'down'}" aria-hidden="true">→${m.after}</span>` : ''}</b><u class="pp-stack-track" aria-hidden="true">${Array.from({ length: max }, (_, i) => `<i${pip(i)}></i>`).join('')}</u></button>`;
}).join('');
// 选中的牌（同一会话、同一版本、付得起）才有预览。
function selectedChoice(view, st) {
  if (view.status !== 'playing') return null;
  const id = st.postPlanSelected?.sessionId === view.sessionId && st.postPlanSelected.revision === view.revision ? st.postPlanSelected.cardId : null;
  const chosen = id ? view.hand.find(p => p.id === id) : null;
  return chosen?.affordable ? choiceProjection(view, chosen) : null;
}
const canWrite = (S, st) => !st.readOnly && S.status === 'playing' && !st.postPlanBusy;

// Semantic feedback is derived from real state, never from reduced-motion or a
// different character's available sprites. Missing expressions fall back inside art().
export function presentation(S, m, view, st, event = null) {
  const characterId = (m?.role === 'small' ? S.persona?.smallArtId : null) || S.persona?.artId || S.charId;
  let mood = 'neutral', label = '准备组牌';
  if (st.postPlanError) { mood = 'worried'; label = '操作未保存，请检查提示'; }
  else if (['ready', 'active'].includes(view.status)) { mood = 'happy'; label = '方案已完成'; }
  else if (st.postPlanBusy) { mood = 'determined'; label = '正在保存本次操作'; }
  else if (event?.revision === view.revision && event.instant + event.tick >= 20 && st.postPlanSelected?.revision !== view.revision) { mood = 'happy'; label = '本回合演练取得进展'; }
  else if ((S.morale ?? 0) < 0) { mood = 'worried'; label = '团队当前疲惫'; }
  else if (view.status === 'playing' && view.budget <= 1) { mood = 'worried'; label = '演练预算紧张'; }
  else if (view.status === 'playing') { mood = 'determined'; label = '专注编排当前方案'; }
  return { characterId, mood, label, url: art(characterId, 'stage', mood) };
}

export function entry(S, st) {
  if (!available(S)) return '';
  const enabled = !!S.postPlanSessions, targets = models(S);
  return `<section class="card pp-entry"><div class="card-head"><b>后训练 · 策略编排</b><span class="pp-tag">单机后训练卡牌</span></div>
    <p class="muted">选好卡组，手动完成六手训练；也可以中途选择自动代打。</p>
    ${enabled ? `<div class="menu-actions">${targets.map(m => {
      const p = S.postPlanSessions.sessions[S.postPlanSessions.byModel[m.id]];
      if (!p) return ''; // New sessions start from the real post-training action, not a second minigame launcher.
      const label = p.status === 'draft' ? '继续选卡' : p.status === 'playing' ? p.controlMode === 'auto' ? '继续编排 · 自动中' : '继续出牌' : STATUS[p.status] || '查看方案';
      return `<button class="btn" data-pp-open="${esc(m.id)}"${disabled(st.postPlanBusy || (!p && (!canWrite(S, st) || !!m.evalId)))}>${esc(E.modelLabel(m))} · ${label}</button>`;
    }).join('')}</div>${!targets.length ? '<p class="muted">暂无可后训练的模型，需先完成底座预训练。</p>' : ''}` : '<p class="pp-warning">当前存档格式较旧，请新开一局以体验完整功能。</p>'}
    ${st.postPlanError ? `<p class="pp-error" role="alert">${esc(st.postPlanError)}</p>` : ''}</section>`;
}

function resourceLine(S, m) {
  const ga = E.gpuAllocation(S), job = E.postJobFor(S, m);
  const direction = job?.bench ? null : job?.dir === 'auto' ? job.autoDir || E.bestDir(S, m) : job?.dir || E.directionsFor(S).find(d => !d.special)?.key;
  const p = direction ? E.postPreview(S, direction, { model: m }) : null;
  const estimate = p ? (p.gains[p.dir.main] || 0) * TRAIN_PACE : null;
  return `<div class="pp-resources"><span>真实训练卡 <b>${count(ga.trainGpus)} 张</b></span><span>集群健康 <b>${Math.round(S.health ?? 0)}</b></span>
    <span>${esc(p?.dir?.label || '未选方向')}基础预估 <b>${estimate === null ? '暂不可用' : `${estimate >= 0 ? '+' : ''}${estimate.toFixed(2)} / 月`}</b></span></div>
    <p class="pp-fine">基于当前集群资源的预估月收益。实际每日收益受算力分配影响，不是卡牌结算承诺。</p>`;
}

function draftCards(S, view, st) {
  const deck=view.deck, packed=!!st.postPlanPackOpen, locked=view.readOnly||st.readOnly||st.postPlanBusy;
  const q={...st.postPlanQuery,availability:'unlocked',scope:'',excludeIds:deck}, page=E.postPlanCatalogue(S,q);
  const cards=packed?deck.map(id=>E.postPlanCard(S,id)):page.cards;
  const opt=(value,label,current)=>`<option value="${esc(value)}"${value===String(current||'')?' selected':''}>${esc(label)}</option>`;
  const tile=c=>`<article data-pp-key="catalogue:${esc(c.id)}" class="pp-library-card${packed?' is-packed':''}"><button class="pp-card pp-deck-card" data-pp-deck="${esc(c.id)}" aria-pressed="${packed}" aria-label="${esc(shortCardName(c))}，${c.id==='basic'?'免费保底牌':packed?'放回卡册':'收入卡包'}"${disabled(locked||c.id==='basic')}>${cardArt(c,S.date)}<span class="pp-card-top"><small aria-label="费用 ${c.cost}">${c.cost}<i>费</i></small></span><span class="pp-card-name">${esc(shortCardName(c))}</span><span class="pp-pack-mark" aria-hidden="true">${c.id==='basic'?'保底':packed?'−':'+'}</span></button><button class="btn pp-rules-link pp-card-info-icon" data-pp-card-info="${esc(c.id)}" aria-label="查看${esc(c.name)}详情">i</button></article>`;
  return `<div class="pp-deck-head"><h3>${packed?'卡包':'卡册'} <small>${packed?`${deck.length} 张`:page.total+' 张已解锁候选'}</small></h3><button class="btn pp-pack-switch" data-pp-pack aria-pressed="${packed}">${packed?'返回卡册':'查看卡包'}</button></div>
    ${packed?'':`<div class="pp-library-toolbar"><input data-pp-filter="search" aria-label="搜索卡牌" value="${esc(q.search||'')}" placeholder="搜索卡牌"/><details class="pp-filter-menu" data-pp-key="filters"><summary>筛选</summary><div class="pp-library-filters"><label>流派<select data-pp-filter="tag">${opt('','全部',q.tag)}${page.tags.map(x=>opt(x,tagNames[x]||x,q.tag)).join('')}</select></label><label>角色<select data-pp-filter="character">${opt('','所有角色',q.character)}${page.characters.map(x=>opt(x,characterLabel(x,S.date),q.character)).join('')}</select></label><label>费用<select data-pp-filter="cost">${opt('','全部',q.cost)}${[0,1,2,3].map(x=>opt(String(x),String(x),q.cost)).join('')}</select></label><button class="btn" data-pp-clear-filters>清除筛选</button></div></details></div>`}
    <div class="pp-draft-scroll" data-pp-key="draft-reader" aria-label="${packed?'卡包内的卡牌':'已解锁的后训练配牌候选'}"><div class="pp-library" aria-label="${packed?'点击卡牌放回卡册':'点击卡牌收入卡包'}">${cards.map(tile).join('')||'<p class="pp-empty">没有符合条件的卡牌。<button class="btn" data-pp-clear-filters>清除筛选</button></p>'}</div></div>
    ${packed?'':`<div class="pp-library-footer"><button class="btn" data-pp-page="${page.page-1}"${disabled(page.page===0)}>上一页</button><span>${page.page+1} / ${page.pages}</span><button class="btn" data-pp-page="${page.page+1}"${disabled(page.page+1>=page.pages)}>下一页</button></div>`}
    <div class="pp-pack-dock" data-pp-key="pack-dock"><button class="pp-pack" data-pp-pack aria-pressed="${packed}" aria-label="${packed?'收起卡包':'打开卡包'}，共 ${deck.length} 张"><span class="pp-pack-symbol" aria-hidden="true"><i></i><i></i><i></i><b>${icon('layers')}</b></span><span><b>卡包 <em>${deck.length}</em></b><small>${packed?'点卡放回卡册':'点卡收入卡包'}</small></span></button><button class="btn btn--primary" data-pp-confirm${disabled(deck.length<3||locked)}>${deck.length<3?`再收 ${3-deck.length} 张`:'开始六手训练'} ${icon('next')}</button></div>`;
}

// Compact action tiles expose the current public projection, never future draws.
const shortCardName = card => card.name.split('·').at(-1).trim();
function handCards(S, view, st) {
  const selected=st.postPlanSelected?.sessionId===view.sessionId&&st.postPlanSelected.revision===view.revision?st.postPlanSelected.cardId:null;
  const locked=view.readOnly||st.readOnly||st.postPlanBusy||view.controlMode!=='manual';
  return `<div class="pp-hand" data-pp-key="hand" aria-label="本回合三张手牌">${view.hand.map(p=>{
    const choice=choiceProjection(view,p);
    const change=choice.meters?.filter(m=>m.delta>0).map(m=>`${m.name}+${m.delta}`).join(' · ');
    const hint=p.affordable ? change || (p.id==='basic'?'免费基础练习':p.card.kind==='prepare'?'为下一手准备':'兑现叠层收益') : p.error||'预算不足';
    return `<article class="pp-hand-item" data-pp-key="hand:${esc(p.id)}" data-kind="${p.card.kind}"><button class="pp-card${p.id===selected?' is-selected':''}" data-pp-select="${esc(p.id)}" aria-pressed="${p.id===selected}"${disabled(locked)}${!p.affordable ? ' aria-disabled="true"' : ''} aria-label="${esc(shortCardName(p.card))}，${p.affordable?`预计加 ${p.total} 分，费用 ${p.paid}`:esc(hint)}，点选查看效果"><span class="pp-card-top"><b class="pp-card-score">${p.affordable?`+${p.total}`:'—'}<i>分</i></b><small aria-label="费用 ${p.paid}">${p.paid}<i>费</i></small></span>${cardArt(p.card,S.date,true)}<span class="pp-card-name">${esc(shortCardName(p.card))}</span><span class="pp-card-desc">${esc(hint)}</span></button><button class="btn pp-rules-link pp-card-info-icon" data-pp-card-info="${esc(p.id)}" aria-label="查看${esc(p.card.name)}详情" title="卡牌详情">i</button></article>`;
  }).join('')}</div>`;
}
function choiceInspector(view,st) {
  const selected=st.postPlanSelected?.sessionId===view.sessionId&&st.postPlanSelected.revision===view.revision?st.postPlanSelected.cardId:null;
  const p=view.hand.find(x=>x.id===selected);
  if(!p?.affordable) return '';
  const q=choiceProjection(view,p);
  return `<section class="pp-choice-inspector" data-pp-key="choice-inspector" aria-live="polite" aria-label="所选卡牌效果"><div class="pp-inspector-head"><b>${esc(shortCardName(p.card))}</b><span>${p.card.kind==='prepare'?'准备牌':'训练牌'} · 消耗 ${p.paid}</span></div><p>${esc(choiceRuleDescription(p.card.desc))}</p><div class="pp-inspector-outcome"><b>本手 +${p.total} 分</b><span>${esc(q.carry)}</span></div></section>`;
}
function handDecision(view, st) {
  const selected=st.postPlanSelected?.sessionId===view.sessionId&&st.postPlanSelected.revision===view.revision?st.postPlanSelected.cardId:null;
  const chosen=view.hand.find(p=>p.id===selected),locked=view.readOnly||st.readOnly||st.postPlanBusy||view.controlMode!=='manual';
  const choice=chosen?choiceProjection(view,chosen):null;
  return `<div class="pp-decision"><div aria-live="polite">${st.postPlanBusy?'<b>正在保存…</b>':chosen?`<b>${esc(shortCardName(chosen.card))}</b><span class="pp-decision-line">预算 ${view.budget} → ${choice.budgetAfter}</span>`:view.controlMode==='auto'?'<b>自动训练中</b><span class="pp-decision-line">可随时接管</span>':'<b>选择本回合的行动</b><span class="pp-decision-line">点选看效果，再确认出牌</span>'}</div><button class="btn btn--primary" data-pp-choose="${esc(selected||'')}"${disabled(locked||!chosen?.affordable)}>确认出牌 ${icon('next')}</button></div>`;
}
function stage(S,v,m,st,portrait,event,preview,done) {
  const remaining=Math.max(0,6-v.log.length);
  const speech=st.postPlanError?'先看看提示，我们再试一次。':done?'辛苦了！这次的训练方案已经保存。':v.status==='draft'?'先出准备牌积累状态，再用训练牌爆发得分。':event?`${event.name} · +${event.instant+event.tick} 分`:'选一张牌，试试我们的配合。';
  return `<div class="pp-stage" data-pp-key="stage"><div class="pp-character" data-pp-key="character" data-mood="${portrait.mood}"><span class="pp-stage-halo" aria-hidden="true"></span>${portrait.url?`<img data-pp-key="portrait-image" data-pp-image-key="portrait:${esc(portrait.characterId)}" data-image-identity="post:${esc(portrait.characterId)}" data-image-src="${esc(portrait.url)}" data-image-alt="当前模型娘 · ${esc(portrait.label)}" src="${esc(portrait.url)}" alt="当前模型娘 · ${esc(portrait.label)}" />`:''}<div class="pp-speech">${esc(speech)}</div></div><div class="pp-status" data-pp-key="status"><div class="pp-round"><span class="pp-round-title">${v.status==='draft'?'准备组牌':done?'方案已就绪':'剩余回合'}</span><strong>${v.status==='draft'?v.deck.length:done?'6':remaining}<small>${v.status==='draft'?'张卡':'/ 6'}</small></strong><div class="pp-turn-track" aria-label="已完成 ${v.log.length} / 6 手">${Array.from({length:6},(_,i)=>`<i class="${i<v.log.length?'is-complete':i===v.log.length?'is-current':''}" aria-hidden="true"></i>`).join('')}</div></div><div class="pp-meters"><span class="pp-meter pp-meter-score">演练分 <b data-pp-score><span data-pp-number>${v.score}</span></b>${preview?`<em class="pp-preview pp-preview--up" aria-hidden="true">+${preview.total}</em>`:''}</span><span class="pp-meter pp-meter-budget">预算 <b data-pp-budget><span data-pp-number>${v.budget}</span></b>${preview&&preview.budgetAfter!==v.budget?`<em class="pp-preview pp-preview--down" aria-hidden="true">→${preview.budgetAfter}</em>`:''}</span></div></div><div class="pp-buffs" aria-label="当前叠层，点击查看说明">${buffDisplay(v,preview)}</div><div class="pp-feedback" data-pp-key="feedback" role="status" aria-live="polite">${st.postPlanBusy?'正在保存…':st.postPlanError?'本次操作未确认成功，请查看提示':event?`第 ${event.turn} 手 · +${event.instant+event.tick} 分`:''}</div></div>`;
}
function information(S,m,v,st) {
  const c=st.postPlanDetail?E.postPlanCard(S,st.postPlanDetail):null;
  const h=c?v.hand.find(x=>x.id===c.id):null,q=h?.affordable?choiceProjection(v,h):null;
  return `<aside class="pp-info${c?' pp-info--card':''}" data-pp-key="info" role="dialog" aria-modal="true" aria-label="${c?'卡牌详情':'资源、规则与已保存记录'}"${st.postPlanInfo?'':' hidden'}><div class="pp-info-head"><b>${c?'卡牌详情':'训练说明'}</b><button class="btn" data-pp-info aria-label="关闭说明">${icon('close')}<span>关闭</span></button></div>${c?`<section class="pp-card-detail"><div class="pp-detail-hero">${cardArt(c,S.date,false,'detail')}<div><span class="pp-tag">${c.kind==='prepare'?'准备牌':'训练牌'} · 费用 ${c.cost}</span><h3>${esc(c.name)}</h3><p>${esc(choiceRuleDescription(c.desc))}</p></div></div>${h?`<div class="pp-detail-projection">${q?`<strong>+${h.total}<small>本手得分</small></strong><div><b>${esc(h.formula)} + 积累 ${h.tick}</b><p>预算 ${v.budget} → ${q.budgetAfter}</p><p>${esc(q.carry)}</p></div>`:`<p class="pp-warning">${esc(h.error||'当前预算不足')}</p>`}</div>`:''}<p class="pp-detail-unlock">${esc(c.requirement)}</p><p class="pp-fine">出牌时优先扣除稳定抵扣费用，再结算卡牌效果与状态判定。</p></section>`:''}<div class="pp-rules"${c?' hidden':''}><section><h3>先叠层，再得分</h3><p>准备牌积累增益状态，训练牌兑现大量演练分。卡包至少三张，数量不限；每回合从中发三张，选一张打出，共六回合。牌足够时会避开上一手；预算不足时补入免费牌。</p><dl class="pp-meter-guide">${Object.values(CHOICE_METERS).map(meta=>`<dt>${meta.name}</dt><dd>${meta.use}</dd>`).join('')}</dl></section><details><summary>实际训练资源</summary>${resourceLine(S,m)}<p>演练分越高，后训练方案在每日实际训练中的增益转化率越好。各项状态增益均有上限。</p></details><details><summary>结算顺序与自动训练</summary><p>回合流程：每回合开始先结算延期效果；出牌时优先扣除稳定抵扣费用，随后计算基础分与状态增益；回合结束时结算积累得分，并衰减校准与积累层数。</p><p>自动演练：开启后使用同一副已解锁卡组和相同规则自动出牌。演练分仅用于确定方案兑现率，不是模型能力本身。</p><p>点击卡牌预览资源变化，确认后打出。新轮次开始时默认手动。</p></details><details><summary>已保存的演练记录 · ${v.log.length} 步</summary><ol>${v.log.map(x=>`<li>第 ${x.turn} 回合 · ${esc(x.name)}：${esc(x.formula)} + 积累 ${x.tick}，累计 ${x.score} 演练分</li>`).join('')}</ol></details></div></aside>`;
}
export function render(S, st) {
  if (!available(S) || !st.postPlanSessionId) return '';
  const v=E.postPlanView(S,st.postPlanSessionId),m=S.models.find(x=>x.id===v.modelId);
  const event=st.postPlanEvent?.sessionId===v.sessionId?st.postPlanEvent:null;
  const portrait=presentation(S,m,v,st,event),preview=selectedChoice(v,st),done=['ready','active'].includes(v.status);
  const job=E.postJobFor(S,m);
  const jobNote=job&&!job.bench?job.paused?'已安排后训练作业（当前暂停），当前暂停；请返回训练页继续。':v.status==='active'?'作业已安排，方案已生效，无需再次启动。':'此模型后训练作业已安排，方案将在下一个训练日生效。':'仍需在训练页开启或继续此模型的普通后训练作业，此处没有发放能力。';
  return `<section class="post-plan pp-${v.status}" data-pp-session="${esc(v.sessionId)}" data-pp-theme="${STAGE_THEME[S.mod]||'language'}" aria-label="单机后训练卡牌方案" aria-busy="${!!st.postPlanBusy}"><div class="pp-scenery" data-pp-key="scenery" aria-hidden="true"><img data-pp-key="scene-image" data-pp-image-key="scene" src="./assets/posttraining/backgrounds/${STAGE_THEME[S.mod]||'language'}-stage.webp" alt="" /><i class="pp-scenery-light"></i></div><div class="pp-main" data-pp-key="main"${st.postPlanInfo?' inert':''}><header class="pp-header" data-pp-key="header"><button class="btn pp-back" data-pp-back${disabled(st.postPlanBusy)} aria-label="返回训练页">${icon('back')}<span>返回</span></button><div class="pp-heading"><span class="pp-tag">后训练 · 第 ${v.planEpoch} 轮</span><h2 data-pp-focus-entry tabindex="-1">${esc(E.modelLabel(m))}</h2></div><div class="pp-header-actions">${v.status==='playing'&&!v.readOnly&&!st.readOnly?`<button class="btn pp-auto" data-pp-control="${v.controlMode==='manual'?'auto':'manual'}"${disabled(st.postPlanBusy)}>${icon(v.controlMode==='manual'?'play':'pause')}<span>${v.controlMode==='manual'?'本次自动':'接管为手动'}</span></button>`:''}<button class="btn pp-help" data-pp-info aria-label="训练规则">${icon('menu')}<span>规则</span></button></div></header><div class="pp-play-scroll" data-pp-key="reader" data-pp-play-scroll>${stage(S,v,m,st,portrait,event,preview,done)}${st.postPlanError?`<p class="pp-error" role="alert">${esc(st.postPlanError)}</p>`:''}${v.status==='draft'?`<section class="pp-builder" data-pp-key="builder" aria-label="组建训练卡组">${v.activeSessionId&&v.activeSessionId!==v.sessionId?'<p class="pp-replacement-note">旧方案仍在真实训练日生效，新方案完成后将在下个训练日自动替换。</p>':''}${draftCards(S,v,st)}</section>`:v.status==='playing'?`${choiceInspector(v,st)}${handCards(S,v,st)}`:done?`<section class="pp-receipt" data-pp-key="receipt"><span class="pp-result-label">TRAINING COMPLETE</span><h3>本轮训练完成</h3><div class="pp-result-score"><strong>${v.score}</strong><span>演练分</span></div><b>${esc(v.preparation.scheme)} · 已存档</b><p>配方覆盖 ${pct(v.preparation.coverage,1)} · 演练达成率 ${pct(v.preparation.realization,1)}</p><p>最早生效日期：<b>${esc(v.effectiveFromDay)}</b></p><p>${esc(jobNote)}</p><button class="btn btn--primary" data-pp-back>返回训练 ${icon('next')}</button>${v.replan.available&&!st.readOnly?`<button class="btn" data-pp-replan${disabled(st.postPlanBusy)}>新解锁 ${v.replan.newCards.length} 张卡 · 重新组牌</button>`:''}<details><summary>收益与后续说明</summary><p>方案生效期间将持续提升模型的后训练成长效率。</p><p>${v.replan.available?v.replan.newCards.map(c=>esc(c.name)).join('、')+'；可使用新卡重新构筑方案。':'技术研究或公司策略新解锁卡牌后，可随时开启下一轮方案编排。'}</p></details></section>`:`<p class="pp-warning">${esc(v.invalidReason||'当前模型不能继续此方案')}</p>`}${v.readOnly&&v.status==='playing'?'<p class="pp-warning">此模型目前仅可回看，不能出牌。</p>':''}</div>${v.status==='playing'?handDecision(v,st):''}<footer class="pp-footnote">${STATUS[v.status]} · 离开与刷新保留当前方案进度。</footer></div>${information(S,m,v,st)}</section>`;
}

function disposeInfo(S) {
  const r = infoMounts.get(S);
  if (!r) return;
  r.active = false; r.info.removeEventListener?.('keydown', r.handler); infoMounts.delete(S);
}

export function dispose(S) {
  const request = S && requests.get(S);
  if (request) {
    request.alive = false; requests.delete(S);
    if (getState() === S && request.st.postPlanRequest === request) {
      delete request.st.postPlanRequest; request.st.postPlanBusy = false;
    }
  }
  disposePresentation(S);
}
function disposePresentation(S) {
  if (!S) return;
  disposeInfo(S);
  disposePostPlanFocus(S);
  stopPostPlanController(S);
  disposePostPlanFeedback(S);
  disposePostPlanArt(S);
  const r = runtime.get(S);
  if (r) { r.alive = false; clearTimeout(r.timer); r.release?.(); runtime.delete(S); }
}

// Mounted callbacks belong to one actual company/session, not to a detached overlay.
export function after(el, S, st, { draw }) {
  if (!available(S) || !st.postPlanSessionId || el?.isConnected === false || !el?.querySelector('.post-plan')) {
    dispose(S);
    if (st.postPlanTrainingFocus && getState() === S && el?.isConnected !== false) {
      const modelId = st.postPlanTrainingFocus.modelId; st.postPlanTrainingFocus = null;
      const entry = [...(el?.querySelectorAll?.('[data-pp-open]') || [])].find(node => node.dataset.ppOpen === modelId && !node.disabled);
      (entry || el?.querySelector?.('.office-nav [data-page="train"]') || el?.querySelector?.('[data-close]'))?.focus({preventScroll:true});
    }
    return;
  }
  if (st.postPlanInfo) {
    const info = el.querySelector('.pp-info'), mounted = infoMounts.get(S);
    if (mounted?.info === info && mounted.st === st && mounted.sessionId === st.postPlanSessionId) { mountPostPlanFocus(S,el.querySelector('.post-plan'),st.postPlanSessionId); return; }
    dispose(S); // Rules dialog pauses even an explicitly authorized auto session.
    mountPostPlanArt(S, el.querySelector('.post-plan'));
    if (info) {
      const record = { info, st, sessionId: st.postPlanSessionId, active: true, handler: null };
      record.handler = ev => {
        if (!record.active || infoMounts.get(S) !== record || el.isConnected === false || info.isConnected === false ||
            getState() !== S || !st.postPlanInfo || st.postPlanSessionId !== record.sessionId) return;
        if (ev.key === 'Escape') {
          ev.preventDefault(); ev.stopImmediatePropagation();
          st.postPlanInfo = false; st.postPlanDetail = null; st.postPlanRestoreFocus = true;
          disposeInfo(S); draw(); return;
        }
        if (ev.key !== 'Tab') return;
        const focusable = [...info.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]')].filter(node => !node.closest('[hidden],[inert]') && node.getClientRects().length > 0);
        const first = focusable[0], last = focusable.at(-1);
        if (!first) { ev.preventDefault(); return; }
        if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      };
      infoMounts.set(S, record); info.addEventListener('keydown', record.handler);
      info.querySelector('button')?.focus();
    }
    mountPostPlanFocus(S,el.querySelector('.post-plan'),st.postPlanSessionId);
    return;
  }
  disposeInfo(S);
  if (st.postPlanChoiceFocus) { const selector=st.postPlanChoiceFocus;st.postPlanChoiceFocus=null;el.querySelector(selector)?.focus(); }
  const playScroll = el.querySelector('.pp-play-scroll');
  if (playScroll && st.postPlanScrollSession === st.postPlanSessionId && Number.isFinite(st.postPlanScroll)) playScroll.scrollTop = st.postPlanScroll;
  for (const [selector, key] of [['.pp-main', 'postPlanMainScroll'], ['.pp-draft-scroll', 'postPlanDraftScroll']]) {
    const reader = el.querySelector(selector);
    if (reader && st.postPlanScrollSession === st.postPlanSessionId && Number.isFinite(st[key])) reader.scrollTop = st[key];
  }
  const handScroll = el.querySelector('.pp-hand');
  if (handScroll && st.postPlanScrollSession === st.postPlanSessionId && Number.isFinite(st.postPlanHandScroll)) handScroll.scrollTop = st.postPlanHandScroll;
  if (st.postPlanRestoreFocus) {
    const origin = st.postPlanInfoReturn; st.postPlanRestoreFocus = false; st.postPlanInfoReturn = null;
    const cards = origin?.sessionId === st.postPlanSessionId && origin.cardId
      ? [...(el.querySelectorAll?.('[data-pp-card-info]') || [])] : [];
    const trigger = cards.find(card => card.dataset.ppCardInfo === origin.cardId && !card.disabled) ||
      (origin?.sessionId === st.postPlanSessionId && Object.hasOwn(BUFF_DISPLAY, origin.buffKey || '')
        ? el.querySelector(`[data-pp-buff="${origin.buffKey}"]`) : null);
    (trigger || el.querySelector('.pp-header [data-pp-info]'))?.focus({ preventScroll: true });
  }
  if (st.postPlanCardFocus) {
    const id = st.postPlanCardFocus; st.postPlanCardFocus = null;
    const cards = [...(el.querySelectorAll?.('[data-pp-select]:not([disabled])') || [])];
    (cards.find(card => card.dataset.ppSelect === id) || cards[0])?.focus({ preventScroll: true });
  }
  let r = runtime.get(S);
  if (r && r.sessionId !== st.postPlanSessionId) { disposePresentation(S); r = null; }
  if (!r) { r = { alive: true, sessionId: st.postPlanSessionId, runner: null }; runtime.set(S, r); }
  const v = E.postPlanView(S, r.sessionId);
  mountPostPlanArt(S, el.querySelector('.post-plan'), v.deck);
  mountPostPlanFeedback(S, el.querySelector('.post-plan'), st.postPlanSessionId);
  mountPostPlanFocus(S, el.querySelector('.post-plan'), st.postPlanSessionId);
  if (st.readOnly || st.postPlanBusy || r.runner) return;
  if (v.status !== 'playing' || v.controlMode !== 'auto' || v.readOnly) return;
  const runner = {}; r.runner = runner;
  resumePostPlanAuto(S, r.sessionId, {
    onAccepted: async (result, before) => {
      if (!r.alive || el.isConnected === false || getState() !== S) { if (runtime.get(S) === r) dispose(S); return; }
      queuePostPlanFeedback(S, result, before);
      st.postPlanEvent = result.event; st.postPlanError = null; draw(); renderMain();
      // A render hook can dismiss/replace the overlay synchronously. Do not create
      // a new presentation timer after dispose has already cancelled this runner.
      if (!r.alive || el.isConnected === false || getState() !== S) { if (runtime.get(S) === r) dispose(S); return; }
      await new Promise(resolve => { r.release = resolve; r.timer = setTimeout(resolve, postPlanFeedbackDelay(el.querySelector('.post-plan'))); });
      r.release = null; r.timer = null;
    },
    onError: error => { if (r.alive) { rejectPostPlanFeedback(S, r.sessionId); st.postPlanError = error.message; draw(); } },
  }).finally(() => { if (r.runner === runner) r.runner = null; });
}

export function click(S, target, { st, draw }) {
  const button = target.closest('[data-pp-pack],[data-pp-clear-filters],[data-pp-find-tag],[data-pp-page],[data-pp-card-info],[data-pp-open],[data-pp-back],[data-pp-info],[data-pp-deck],[data-pp-select],[data-pp-confirm],[data-pp-replan],[data-pp-choose],[data-pp-control]');
  if (!button) return false;
  if (button.disabled || !available(S) || st.postPlanBusy) return true;
  const surface = button.closest?.('.post-plan');
  if (surface && !st.postPlanInfo) {
    for (const [selector, key] of [['.pp-main', 'postPlanMainScroll'], ['.pp-draft-scroll', 'postPlanDraftScroll']]) {
      const reader = surface.querySelector?.(selector);
      if (reader) st[key] = reader.scrollTop;
    }
    st.postPlanScrollSession = st.postPlanSessionId;
  }
  const playScroll = button.closest?.('.post-plan')?.querySelector?.('.pp-play-scroll');
  if (playScroll && !st.postPlanInfo) {
    st.postPlanScroll = playScroll.scrollTop; st.postPlanScrollSession = st.postPlanSessionId;
    st.postPlanHandScroll = button.closest?.('.post-plan')?.querySelector?.('.pp-hand')?.scrollTop || 0;
  }
  if (st.postPlanInfo && !button.closest('.pp-info')) return true; // Inert is not the authority boundary.
  if (button.hasAttribute('data-pp-pack')) { st.postPlanPackOpen=!st.postPlanPackOpen;st.postPlanDraftScroll=0;st.postPlanChoiceFocus='[data-pp-pack]';draw();return true; }
  if (button.hasAttribute('data-pp-clear-filters')) { st.postPlanQuery={};st.postPlanDraftScroll=0;st.postPlanChoiceFocus='[data-pp-filter="search"]';draw();return true; }
  if (button.hasAttribute('data-pp-find-tag')) { st.postPlanQuery={tag:button.dataset.ppFindTag,availability:'unlocked',page:0};st.postPlanRecipe=button.closest?.('.pp-blueprint')?.querySelector?.('[data-pp-recipe]')?.value || st.postPlanRecipe;if(document.activeElement===button)st.postPlanChoiceFocus='[data-pp-filter="tag"]';draw();return true; }
  if (button.hasAttribute('data-pp-card-info')) { dispose(S); st.postPlanInfoReturn={sessionId:st.postPlanSessionId,cardId:button.dataset.ppCardInfo};st.postPlanCardFocus=null;st.postPlanDetail=button.dataset.ppCardInfo;st.postPlanInfo=true;draw();return true; }
  if (button.hasAttribute('data-pp-page')) { st.postPlanQuery={...(st.postPlanQuery||{}),page:Number(button.dataset.ppPage)};st.postPlanDraftScroll=0;draw();return true; }
  if (button.hasAttribute('data-pp-info')) { dispose(S); if (!st.postPlanInfo) { st.postPlanInfoReturn={sessionId:st.postPlanSessionId,cardId:null,buffKey:button.dataset.ppBuff||null};st.postPlanCardFocus=null; } st.postPlanInfo = !st.postPlanInfo; st.postPlanDetail=null; st.postPlanRestoreFocus = !st.postPlanInfo; draw(); return true; }
  if (button.hasAttribute('data-pp-back')) { st.postPlanTrainingFocus={modelId:E.postPlanView(S,st.postPlanSessionId).modelId};dispose(S); st.postPlanSessionId = null; st.postPlanError = null; draw(); return true; }
  if (button.hasAttribute('data-pp-open') && S.postPlanSessions?.byModel[button.dataset.ppOpen]) {
    st.postPlanScroll = 0; st.postPlanSessionId = S.postPlanSessions.byModel[button.dataset.ppOpen]; st.postPlanEvent = null; st.postPlanError = null; draw(); return true;
  }
  if (!canWrite(S, st)) { toast('当前只能回看后训练方案'); return true; }
  if (button.hasAttribute('data-pp-select')) {
    const v = E.postPlanView(S, st.postPlanSessionId), cardId = button.dataset.ppSelect;
    const card = v.hand.find(p => p.id === cardId);
    if (v.status === 'playing' && !v.readOnly && v.controlMode === 'manual' && card) {
      if (card.affordable) { st.postPlanSelected = { sessionId: v.sessionId, revision: v.revision, cardId }; st.postPlanError = null; selectPostPlanFeedback(S, v.sessionId, cardId); }
      else { st.postPlanSelected = null; st.postPlanError = `${card.card.name}：${card.error || '预算不足'}。本次未出牌、未扣费，请选另一张可用的牌。`; rejectPostPlanFeedback(S, v.sessionId); }
      if (document.activeElement === button) st.postPlanCardFocus = cardId;
    }
    draw(); return true;
  }
  if (button.hasAttribute('data-pp-deck')) {
    const v = E.postPlanView(S, st.postPlanSessionId), id = button.dataset.ppDeck;
    if (v.status !== 'draft' || v.readOnly || id === 'basic' || !E.postPlanCard(S,id)?.unlocked) return true;
  }
  // Not office.guard: it is synchronous and would save/reveal before this transaction.
  const request = { alive: true, st, world: getWorld(), mp: getMp() };
  requests.set(S, request); st.postPlanRequest = request;
  const current = () => request.alive && requests.get(S) === request && st.postPlanRequest === request
    && getState() === S && getWorld() === request.world && getMp() === request.mp;
  void (async () => {
    st.postPlanBusy = true; st.postPlanError = null;
    try {
      let name, args, before;
      const restoreCardFocus = document.activeElement === button;
      if (button.hasAttribute('data-pp-open')) { const modelId = button.dataset.ppOpen; name = 'postPlan.open'; args = { modelId, expectedModelToken: E.postPlanModelToken(S, modelId) }; }
      else {
        const v = E.postPlanView(S, st.postPlanSessionId); before = v;
        args = { sessionId: v.sessionId, expectedRevision: v.revision };
        if (button.hasAttribute('data-pp-deck')) {
          const id = button.dataset.ppDeck;
          if (v.status !== 'draft' || v.readOnly || id === 'basic' || !E.postPlanCard(S,id)?.unlocked) return;
          const ids = [...v.deck], at = ids.indexOf(id);
          if (at >= 0) ids.splice(at, 1); else ids.push(id);
          if (restoreCardFocus) st.postPlanChoiceFocus='[data-pp-deck]:not([disabled])';
          name = 'postPlan.updateDraft'; args.cardIds = ids;
        }
        else if (button.hasAttribute('data-pp-confirm')) { name = 'postPlan.confirmDeck'; args.cardIds = v.deck; args.directionPolicy = v.directionPolicy; }
        else if (button.hasAttribute('data-pp-replan')) { name = 'postPlan.replan'; }
        else if (button.hasAttribute('data-pp-choose')) { name = 'postPlan.choose'; args.turn = v.turn; args.cardId = button.dataset.ppChoose; }
        else { disposePresentation(S); name = 'postPlan.setControl'; args.mode = button.dataset.ppControl; args.scope = 'session'; }
      }
      draw();
      if (!current()) return;
      const result = await act(S, name, args);
      if (!current()) return;
      if (name === 'postPlan.open' || name === 'postPlan.replan') { st.postPlanSessionId = result.sessionId; st.postPlanEvent = null; }
      if (name === 'postPlan.confirmDeck') queuePostPlanDeal(S, result);
      if (result?.event) {
        queuePostPlanFeedback(S, result, before); st.postPlanEvent = result.event;
        if (restoreCardFocus && name === 'postPlan.choose') st.postPlanCardFocus = args.cardId;
      }
    } catch (error) { if (current()) { rejectPostPlanFeedback(S, st.postPlanSessionId); st.postPlanError = error.message; } }
    finally {
      if (current()) {
        st.postPlanBusy = false;
        draw();
        // Rendering itself can close/reset the office or start a newer request.
        if (current()) { requests.delete(S); delete st.postPlanRequest; renderMain(); }
        else if (requests.get(S) === request) requests.delete(S);
      } else if (requests.get(S) === request) requests.delete(S);
    }
  })();
  return true;
}

export function change(S,target,{st,draw}) { const key=target.dataset?.ppFilter,recipe=target.hasAttribute?.('data-pp-recipe');if(!key&&!recipe)return false;if(!available(S)||st.postPlanInfo||st.postPlanBusy)return true;if(recipe){st.postPlanRecipe=target.value;st.postPlanChoiceFocus='[data-pp-recipe]';}else st.postPlanQuery={...(st.postPlanQuery||{}),[key]:target.value,page:0};st.postPlanDraftScroll=0;draw();return true; }
