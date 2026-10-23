import { CAPABILITY_KEYS, CAPABILITY_LABELS, PRIMARY_CAPABILITY_KEYS, migrateModelCapabilities } from '../data/model_capabilities.js';
import { CHARACTER_ROSTER } from '../data/catalog_characters.js';
import { MODEL_CHARACTERS, NPC_CHARACTERS, NPC_PROFILES, isModelCharacter, resolveModelCharacter } from '../data/character_roles.js';
import { PERSONAL_EVENT_BY_ID } from '../data/catalog_personal_events.js';
import { personalEventsForHistory, personalEventStatus, nextPersonalEvent, pendingPersonalEvent, beginPersonalEvent, resolvePersonalEvent } from '../engine/personal_events.js';
import { renderPersonalChronicle, renderPersonalEventBody, renderPersonalResult } from './personal_event_views.js';
import { ensureServiceEconomy, previewServiceTurn, configureSupply, procureCompute, setContractRenewal, configureOffer, publishServiceModel, configureRouting, resolveServiceCase, auditService, getTrainingComputeCapacity, configureGateway, revokeProxyClient, rotateServiceCredentials } from '../engine/service_economy.js';
import { renderServiceDashboard, renderComputeSupply, renderModelRouting, renderServiceCommunity, renderBusinessReports, renderApplicationAccess } from './business_views.js';
/* =============================================================================
 * 模型育成计划 · 下一版 v0.1.0 — src/ui/app.js
 * 在算力、数据、合规与泡沫之间，把一版模型养到下一个版本。
 * ============================================================================= */

/* -------------------------------------------------------------------------- */
/* 1. Imports                                                                  */
/* -------------------------------------------------------------------------- */

import {
  BALANCE_RULES, START_PROFILES, TRAINING_RECIPES,
  ARCHITECTURES, HISTORIES, SUPPORT_CARDS, SKILLS,
} from '../data/catalog_core.js';

import {
  BENCHMARKS, DATASET_TEMPLATES, ACQUISITION_ROUTES,
  ANNOTATION_TEAMS, LABEL_METHODS, RESEARCH_NODES,
  JOB_SECTORS, SECURITIES, STORY_EVENTS, SEASON_CHAPTERS,
  ENDINGS, SOURCES_INDEX,
} from '../data/catalog_world.js';

import {
  clamp, deepClone, createNewGameState, rollbackModelToCheckpoint,
  validateGameState, createTrainingRequest, createRaceRequest,
} from '../engine/state_schema.js';

import {
  previewTraining, applyTraining, previewRestAndPrep, applyRestAndPrep,
  calculateMentorInheritance, applyMentorSelection, updateSupportCardDeck,
} from '../engine/training_engine.js';

import {
  LEAGUE_BUDGET_MULTIPLIERS, THINKING_MULTIPLIERS,
  previewRace, simulateRace, refreshDataMarket, acquireDatasetOffer,
  runDataMiniGame, startAnnotationContract, advanceAnnotationContracts,
  calculateAnnotationQuality, stepResearchProject,
} from '../engine/race_and_data_engine.js';

import {
  executePrivateFinancing, executeIPO, tradeSecurity, updateBubbleState,
  stepLegalSystem, resolveLegalAction, updateSectorsAndMilestones,
  runRsiExperimentCycle, applyStoryEventChoice, advanceTurn,
  transitionToNextSeason,
} from '../engine/company_and_world_engine.js';

import { previewFinancing, purchaseDataset, canResolveCatalogEvent, resolveCatalogChoice } from '../engine/presentation_contracts.js';

const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const FOCUS_META = {
  creative_writing:{icon:'chat',title:'创意写作',desc:'故事、文风与角色表达',color:'#c78ba1'},
  mathematics:{icon:'brain',title:'数学训练',desc:'证明、计算与严谨推导',color:'#87a3bf'},
  safety_alignment:{icon:'shield',title:'安全对齐',desc:'识别有害请求与合理边界',color:'#8fa88d'},
  tool_use:{icon:'code',title:'工具与应用',desc:'调用工具，完成工作流',color:'#a79cc6'},
  knowledge:{icon:'book',title:'知识学习',desc:'拓展世界的广度',color:'#d99576'},
  reasoning:{icon:'brain',title:'推理训练',desc:'从问题中寻找规律',color:'#74a5bd'},
  coding:{icon:'code',title:'代码实践',desc:'用代码构建想法',color:'#a28fc2'},
  expression:{icon:'chat',title:'表达练习',desc:'让每一句话更清晰',color:'#d992a5'},
  context:{icon:'network',title:'长程任务',desc:'保持专注与稳定',color:'#81a68e'},
  reliability:{icon:'shield',title:'可靠性对齐',desc:'成为值得信赖的伙伴',color:'#78a8b5'},
};
const FORMAT_LABELS = {raw_text:'原始文本',instruction:'指令问答',preference_pairs:'偏好对',verified_tasks:'可验证任务',trajectories:'工具轨迹'};
const RIGHTS_LABELS = {licensed:'授权清晰',public_domain:'公有领域',consented:'已获同意',unclear:'待核验',restricted:'受限',prohibited:'禁用'};
const BLOCKER_LABELS = {
  OOM:'显存不足，请降低批次大小、切换 QLoRA 或升级显存。',
  INSUFFICIENT_CASH:'研究资金不足，请降低强度或前往实验室融资。',
  INSUFFICIENT_COMPUTE:'算力不足，请降低强度或选择更轻的配方。',
  LOW_READINESS:'集群还没有准备好，先去「休息整备」恢复一下。',
  READINESS_TOO_LOW:'集群还没有准备好，先去「休息整备」恢复一下。',
  DATASET_FORMAT_MISMATCH:'数据格式不匹配，请换一份数据或训练配方。',
  OBJECTIVE_MISMATCH:'当前模型架构不支持这种训练目标，请换一种配方。',
  LEGAL_RISK_NOT_ACCEPTED:'数据来源尚未确认，请换用已授权数据。',
};
const PARTNERS = Object.fromEntries(CHARACTER_ROSTER.map(p=>[p.id,p]));
function partnerForHistory(history = '') {
  const exact=MODEL_CHARACTERS.find(c=>c.history_id===history);
  if(exact)return exact.id;
  if (history.includes('deepseek')) return 'deepseek';
  if (history.includes('qwen')) return 'qwen';
  if (history.includes('gemini')) return 'gemini';
  if (history.includes('claude')) return 'claude';
  if (history.includes('gpt')) return 'gpt';
  return null;
}
function currentPartner() { return resolveModelCharacter(activeModel().history_id, App.ui.partnerId); }
function renderCharacterCollection({ modelsOnly = false } = {}) {
  const selected=currentPartner().id;
  const roster = modelsOnly ? MODEL_CHARACTERS : CHARACTER_ROSTER;
  const categories = modelsOnly ? {model:'可育成模型'} : {model:'可育成模型',application:'工具 NPC',infrastructure:'设施 NPC'};
  const intro = modelsOnly ? '只有模型可以育成。这里可选择 25 位模型的舞台形象；育成谱系在新游戏中选择。' : `${MODEL_CHARACTERS.length} 位可育成模型，${NPC_CHARACTERS.length} 位 NPC。模型可以更换舞台形象；工具与设施角色可以拜访、互动。`;
  return `<section class="roster-collection" data-roster-collection><div class="roster-intro"><span class="eyebrow">${modelsOnly?'YOUR MODEL COMPANION':'MODELS & WORLD CHARACTERS'}</span><p>${intro}</p></div><div class="roster-toolbar"><label><span class="sr-only">搜索角色</span><input type="search" data-roster-search placeholder="搜索名称或角色" autocomplete="off"/></label><label><span class="sr-only">角色分类</span><select data-roster-category><option value="all">${modelsOnly?'全部模型':'全部角色'}</option>${Object.entries(categories).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><span data-roster-count>${roster.length} / ${roster.length} 位</span></div><div class="roster-grid">${roster.map(p=>{
    const trainable=isModelCharacter(p.id);
    return `<article class="roster-card ${trainable&&p.id===selected?'is-active':''}" data-roster-card data-category="${p.category}" data-search="${esc(`${p.name} ${p.label} ${p.id} ${categories[p.category]}`.toLowerCase())}"><button data-action="${trainable?'select-partner':'open-npc'}" data-value="${p.id}" aria-label="${trainable?`选择 ${esc(p.name)} 舞台形象`:`拜访 ${esc(p.name)} NPC`}" ${trainable?`aria-pressed="${p.id===selected}"`:''}><div class="roster-portrait"><img src="${p.src}" alt="${esc(p.name)} · ${esc(p.label)}" loading="lazy" decoding="async"/>${trainable?'':'<span class="roster-npc-badge">NPC</span>'}</div><strong>${esc(p.name)}</strong><small>${trainable?esc(p.label):esc(NPC_PROFILES[p.id].role)}</small></button><footer><span>${trainable?'模型 · 可育成':`${categories[p.category]} · 仅互动`}</span><a href="${esc(p.source_url)}" target="_blank" rel="noopener noreferrer">作者原帖 ↗</a></footer></article>`;
  }).join('')}</div><p class="biz-empty" data-roster-empty hidden>没有找到相符的角色，换个名称试试。</p><p class="art-note">按角色收录，同一角色的换装与表情不重复计数。形象来自 ZipZipPipe 公开作品，部分由 imagegen 去背景、补全或制作差分。标签、对白和游戏职责为同人设计。</p></section>`;
}
function filterCharacterCollection(root) {
  const query=root.querySelector('[data-roster-search]').value.trim().toLowerCase(),category=root.querySelector('[data-roster-category]').value;
  const cards=Array.from(root.querySelectorAll('[data-roster-card]'));
  for(const card of cards)card.hidden=!(card.dataset.search.includes(query)&&(category==='all'||card.dataset.category===category));
  const count=cards.filter(c=>!c.hidden).length;
  root.querySelector('[data-roster-count]').textContent=`${count} / ${cards.length} 位`;
  root.querySelector('[data-roster-empty]').hidden=count>0;
}
function openPartners() {
  openModal({title:'选择模型形象',bodyHtml:renderCharacterCollection({modelsOnly:true})+`<button class="text-btn" data-action="open-art-credits">查看美术鸣谢 ↗</button>`,footerHtml:'<button class="btn btn--ghost" data-action="modal-close">回到实验室</button>'});
}
function openNpcProfile(id) {
  const npc=PARTNERS[id],profile=NPC_PROFILES[id];
  if(!npc||!profile)return;
  openModal({title:`${npc.name} · NPC`,bodyHtml:`<section class="npc-profile"><div class="npc-profile__portrait"><img src="${npc.src}" alt="${esc(npc.name)} · ${esc(npc.label)}"/></div><div><span class="tiny-badge">NPC · 仅互动</span><h3>${esc(profile.role)}</h3><p>${esc(profile.description)}</p><blockquote>${esc(profile.line)}</blockquote><p class="art-note">工具与设施角色不参加育成、训练和比赛。当前培养：${esc(activeModel().display_name)}。</p><a href="${esc(npc.source_url)}" target="_blank" rel="noopener noreferrer">作者原帖 ↗</a></div></section>`,footerHtml:`<button class="btn btn--ghost" data-action="modal-close">结束拜访</button><button class="btn btn--primary" data-action="npc-workspace" data-value="${npc.id}">${profile.destination} ↗</button>`});
}
function openStatDetails() {
  const model=activeModel(); const gains=App.ui.train.preview?.expected_stat_gains || {};
  openModal({title:'每一小步，都算数',bodyHtml:`<p>能力随训练逐渐提升。绿色数值是当前训练方案的预计收益；达到上限后，需要更好的数据、架构或规模来继续成长。</p><table><thead><tr><th>能力</th><th>当前</th><th>预计提升</th><th>能力上限</th></tr></thead><tbody>${STAT_KEYS.map(key=>`<tr><td>${STAT_LABELS[key]}</td><td>${fmtNum(model.stats[key],1)}</td><td class="positive">+${fmtNum(gains[key]||0,1)}</td><td>${model.stat_caps[key]}</td></tr>`).join('')}</tbody></table><p class="art-note">已完成 ${model.training_action_count||0} 次训练 · 第 ${gs().turn} 回合</p>`,footerHtml:'<button class="btn btn--primary" data-action="modal-close">继续成长</button>'});
}

function openOverview() {
  const m = activeModel(); const s = gs();
  openModal({title:'我们的成长档案',bodyHtml:`<div class="kv-row"><div class="kv"><span>当前模型</span><b>${esc(m.display_name)}</b></div><div class="kv"><span>模型谱系</span><b>${esc(HISTORY_BY_ID[m.history_id]?.family_name || m.history_id)}</b></div><div class="kv"><span>架构</span><b>${esc(ARCH_BY_ID[m.architecture_id]?.name || m.architecture_id)}</b></div><div class="kv"><span>参数规模 / 激活</span><b>${m.sim_total_params_b}B / ${m.sim_active_params_b}B</b></div><div class="kv"><span>优化器健康</span><b>${Math.round(m.optimizer_health)} / 100</b></div><div class="kv"><span>已完成训练</span><b>${m.training_action_count || 0} 次</b></div></div><h3 style="margin:22px 0 12px">状态与风险</h3><p>${RISK_KEYS.map(k=>`<span class="risk-chip ${riskLevel(m.risks?.[k]||0).cls}">${RISK_LABELS[k]} <b>${App.ui.researchView?Math.round(m.risks?.[k]||0):riskLevel(m.risks?.[k]||0).label}</b></span>`).join('')}</p><h3 style="margin:22px 0 12px">与你同行的支援</h3><div class="grid-2">${s.support_card_ids.map((id,i)=>`<button class="tile" data-action="open-card-editor" data-slot="${i}"><span class="tile__title">${esc(CARD_BY_ID[id]?.name||'空槽位')}</span><span class="tile__desc">${esc(CARD_BY_ID[id]?.description||'点击选择支援卡')}</span><span class="tile__meta">羁绊 ${Math.round(s.support_bond[id]||0)} · 点击更换</span></button>`).join('')}</div>`,footerHtml:'<button class="btn btn--primary" data-action="modal-close">回到实验室</button>'});
}
function openArtCredits() {
  openModal({title:'美术鸣谢 · 每一份想象都有来处',bodyHtml:`<p>本机游戏的模型拟人形象来自 <a href="https://space.bilibili.com/4168597/dynamic" target="_blank" rel="noopener noreferrer">ZipZipPipe（UID 4168597）</a> 的公开动态；场景与下述立绘差分由 imagegen 制作。</p><div class="art-credit-entry"><strong>DeepSeek · 小肥鱼</strong><p>采用作者 2026-10-18 发布的 DeepSeek V4.1 Flash 画家造型；原图保留。训练成功、备赛、疲惫三张差分由 imagegen 基于该图生成。鲸鱼娘原设作者：<a href="https://b23.tv/3dNz55h" target="_blank" rel="noopener noreferrer">上善无形</a>；ZipZipPipe 二创。按作者公告以 <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans" target="_blank" rel="noopener noreferrer">CC BY-NC-SA 4.0</a> 非商业、署名、相同方式共享。</p></div><div class="art-credit-entry"><strong>Qwen · 千问</strong><p>参考作者 2026-08-23「千问桌面壁纸」，由 imagegen 延展为透明全身立绘。</p><strong>Claude · 克劳德</strong><p>参考作者 2026-08-24「Claude桌面壁纸」，由 imagegen 延展为透明全身立绘。</p><strong>Gemini · 哈基米</strong><p>采用作者 2026-10-15「Gemini 4 Argon」透明原图。</p><strong>GPT · Astra</strong><p>参考作者 2026-09-05「GPT-6 Astra」，由 imagegen 去除背景。</p></div><details class="art-credit-entry"><summary>完整角色与原帖 · ${CHARACTER_ROSTER.length} 位</summary><ul class="art-roster-credits">${CHARACTER_ROSTER.map(p=>`<li><a href="${esc(p.source_url)}" target="_blank" rel="noopener noreferrer">${esc(p.name)} · ${esc(p.source_title)}</a><small>${esc(p.license)}${p.additional_credit?` · ${esc(p.additional_credit)}`:""}</small></li>`).join("")}</ul></details><p class="art-note">其余角色未检得明确的统一再授权声明。本版本用于本机个人体验；源文件与改编记录保存在 assets 中。</p>`,footerHtml:'<button class="btn btn--ghost" data-action="modal-close">收起鸣谢</button>'});
}

/* -------------------------------------------------------------------------- */
/* 2. Constants                                                                */
/* -------------------------------------------------------------------------- */

const APP_VERSION = '0.1.0';
const SAVE_KEY = 'mrp.v0.1.0.save';
const PREF_KEY = 'mrp.v0.1.0.prefs';
const BYOK_KEY = 'mrp.v0.1.0.byok';
const MAX_TURN = BALANCE_RULES.CAMPAIGN_TURNS || 192;
const TUTORIAL_TOTAL = 8;
const MINI_GAME_SECONDS = 30;

const STAT_KEYS = CAPABILITY_KEYS;
const STAT_LABELS = CAPABILITY_LABELS;

const RISK_KEYS = [
  'overfit', 'forgetting', 'reward_hacking', 'sycophancy',
  'over_refusal', 'harmful_compliance', 'contamination',
];
const RISK_LABELS = {
  overfit: '过拟合', forgetting: '灾难性遗忘', reward_hacking: '奖励钻空子',
  sycophancy: '谄媚倾向', over_refusal: '过度拒答',
  harmful_compliance: '有害顺从', contamination: '评测污染',
};

const SEASON_NAMES = ['春', '夏', '秋', '冬'];

const EMOTION_MAP = {
  neutral:    { label: '平静', face: '◕‿◕',  color: '#8ab4ff' },
  happy:      { label: '高兴', face: '◠‿◠',  color: '#7be2a4' },
  worried:    { label: '担忧', face: '◔﹏◔', color: '#f2c46d' },
  determined: { label: '坚定', face: '◣_◢',  color: '#ff8b6b' },
  sad:        { label: '难过', face: '◞︵◟',  color: '#9aa3ff' },
};

const LEAGUE_TIERS = ['edge', 'small', 'open', 'frontier'];
const THINKING_MODES = ['quick', 'balanced', 'deliberate'];

const TUTORIAL_STEPS = [
  {t:'欢迎来到下一版实验室',d:'从一个小小的模型开始，选择训练、收集数据、准备比赛。把每一小步连在一起，就是下一版的你们。'},
  {t:'先看看手边的资源',d:'顶部是研究资金、可用算力和集群就绪度。资金支撑日常研究，算力限制方案规模，就绪度太低时需要休息。'},
  {t:'把成长看在眼里',d:'底部六项能力决定模型擅长什么。选择训练方向后，绿色数值会预告本次提升；训练完成后会显示新的能力。'},
  {t:'做一次选择，再向前一步',d:'每个回合共享一次主要行动。先执行训练、休息、采购或比赛，看到结果后，再点「下一回合」。'},
  {t:'给成长一点新灵感',d:'数据工坊可以采购语料、委托标注。训练配方需要匹配的数据格式；质量、新颖度与授权状态也会影响结果。'},
  {t:'休息也是计划的一部分',d:'连续训练会消耗就绪度与优化器健康。去休息整备喝杯茶；检查点可以恢复模型状态，已经花掉的资金仍会保留。'},
  {t:'准备好，就去登场',d:'赛事中心可以选择不同的评测与联赛规模。公开评测与隐藏评测一起决定官方得分，回放会展示这次挑战的经过。'},
  {t:'属于我们的长长旅程',d:'整个育成有 8 个赛季。进度会自动保存在当前浏览器，也能从存档菜单导出。新的育成会替换当前进度，先留一份纪念吧。'},
];

/* Catalog indexing ---------------------------------------------------------- */
function indexById(list) {
  const out = {};
  if (!list) return out;
  const arr = Array.isArray(list) ? list : Object.values(list);
  for (const it of arr) if (it && it.id != null) out[it.id] = it;
  return out;
}

const HISTORY_BY_ID = indexById(HISTORIES);
const ARCH_BY_ID = indexById(ARCHITECTURES);
const RECIPE_BY_ID = indexById(TRAINING_RECIPES);
const CARD_BY_ID = indexById(SUPPORT_CARDS);
const SKILL_BY_ID = indexById(SKILLS);
const BENCHMARK_BY_ID = indexById(BENCHMARKS);
const RES_NODE_BY_ID = indexById(RESEARCH_NODES);
const SECURITY_BY_ID = indexById(SECURITIES);
const DATASET_TEMPLATE_BY_ID = indexById(DATASET_TEMPLATES);
const ACQ_ROUTE_BY_ID = indexById(ACQUISITION_ROUTES);
const TEAM_BY_ID = indexById(ANNOTATION_TEAMS);
const LABEL_BY_ID = indexById(LABEL_METHODS);
const CHAPTER_BY_ID = indexById(SEASON_CHAPTERS);
const STORY_BY_ID = indexById(STORY_EVENTS);
const ENDING_BY_ID = indexById(ENDINGS);

const historyList = () => Array.isArray(HISTORIES) ? HISTORIES : Object.values(HISTORIES || {});
const archList = () => Array.isArray(ARCHITECTURES) ? ARCHITECTURES : Object.values(ARCHITECTURES || {});
const recipeList = () => Array.isArray(TRAINING_RECIPES) ? TRAINING_RECIPES : Object.values(TRAINING_RECIPES || {});
const cardList = () => Array.isArray(SUPPORT_CARDS) ? SUPPORT_CARDS : Object.values(SUPPORT_CARDS || {});
const skillList = () => Array.isArray(SKILLS) ? SKILLS : Object.values(SKILLS || {});
const benchList = () => Array.isArray(BENCHMARKS) ? BENCHMARKS : Object.values(BENCHMARKS || {});
const nodeList = () => Array.isArray(RESEARCH_NODES) ? RESEARCH_NODES : Object.values(RESEARCH_NODES || {});
const sectorList = () => Array.isArray(JOB_SECTORS) ? JOB_SECTORS : Object.values(JOB_SECTORS || {});
const securityList = () => Array.isArray(SECURITIES) ? SECURITIES : Object.values(SECURITIES || {});
const datasetList = () => Array.isArray(DATASET_TEMPLATES) ? DATASET_TEMPLATES : Object.values(DATASET_TEMPLATES || {});
const routeList = () => Array.isArray(ACQUISITION_ROUTES) ? ACQUISITION_ROUTES : Object.values(ACQUISITION_ROUTES || {});
const teamList = () => Array.isArray(ANNOTATION_TEAMS) ? ANNOTATION_TEAMS : Object.values(ANNOTATION_TEAMS || {});
const labelList = () => Array.isArray(LABEL_METHODS) ? LABEL_METHODS : Object.values(LABEL_METHODS || {});
const chapterList = () => Array.isArray(SEASON_CHAPTERS) ? SEASON_CHAPTERS : Object.values(SEASON_CHAPTERS || {});
const endingList = () => Array.isArray(ENDINGS) ? ENDINGS : Object.values(ENDINGS || {});
const sourceList = () => Array.isArray(SOURCES_INDEX) ? SOURCES_INDEX : Object.values(SOURCES_INDEX || {});
const eventList = () => Array.isArray(STORY_EVENTS) ? STORY_EVENTS : Object.values(STORY_EVENTS || {});
const profileList = () => Array.isArray(START_PROFILES) ? START_PROFILES : Object.values(START_PROFILES || {});

/* -------------------------------------------------------------------------- */
/* 3. DOM helpers                                                              */
/* -------------------------------------------------------------------------- */

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class' || k === 'className') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  for (const c of children) {
    const list = Array.isArray(c) ? c : [c];
    for (const item of list) {
      if (item == null || item === false) continue;
      if (item instanceof Node) el.appendChild(item);
      else el.appendChild(document.createTextNode(String(item)));
    }
  }
  return el;
}

const setText = (sel, txt) => { const el = typeof sel === 'string' ? $(sel) : sel; if (el) el.textContent = txt; };
const setHtml = (sel, html) => { const el = typeof sel === 'string' ? $(sel) : sel; if (el) el.innerHTML = html; };

/* -------------------------------------------------------------------------- */
/* 4. Formatters                                                               */
/* -------------------------------------------------------------------------- */

const fmtKc   = v => `${Number(v ?? 0).toLocaleString("zh-CN", { maximumFractionDigits: 1 })} kc`;
const fmtCu   = v => `${Math.round(v ?? 0)} CU`;
const fmtGB   = v => `${Math.round(v ?? 0)} GB`;
const fmtNum  = (v, d = 1) => (typeof v === 'number' ? v : 0).toFixed(d);
const fmtPct  = (v, d = 0) => {
  const n = typeof v === 'number' ? v : 0;
  return `${(Math.abs(n) <= 1.5 ? n * 100 : n).toFixed(d)}%`;
};
const fmtSigned = (v, d = 0) => {
  const n = typeof v === 'number' ? v : 0;
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`;
};
const fmtSignedF = (v, d = 2) => {
  const n = typeof v === 'number' ? v : 0;
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`;
};
const sumOf = a => (a || []).reduce((x, y) => x + (Number(y) || 0), 0);
const avgOf = a => (a && a.length ? sumOf(a) / a.length : 0);

/* -------------------------------------------------------------------------- */
/* 5. State                                                                    */
/* -------------------------------------------------------------------------- */

const App = {
  state: null,
  ui: defaultUI(),
  modals: [],
  dialogue: { speaker: '策划', text: '早上好。今天我们从哪儿开始？训练、数据、整备，还是直接上赛场？' },
  emotion: 'neutral',
  raceReplay: null,
  miniGame: null,
  lastTurnSnap: null,
  audioCtx: null,
};

function defaultUI() {
  return {
    activeTab: 'train',
    researchView: false,
    tutorial: { active: false, step: 0 },
    train: {
      focus: 'creative_writing',
      recipeId: 'sft',
      preset: 'balanced',
      datasetId: 'data_starter_sft',
      mode: 'lora',
      advancedOpen: false,
      advanced: {
        epochs: 1, replay_ratio: 0.15, batch_size: 1, lora_rank: 16,
        group_size: 8, reasoning_budget_tokens: 2048, kl_strength: 0.1,
        mask_ratio: 0.5, denoise_steps: 16, accept_legal_risk: false,
      },
      preview: null,
    },
    data: {
      miniGame: null,
      miniTimer: 0,
      annotationDraft: {
        teamId: null, methodId: null, size_k: 50,
        fair_pay_ratio: 0.8, gold_check_ratio: 0.1, independent_audit_ratio: 0.1,
      },
    },
    prep: { mentorFrom: null },
    race: {
      league_tier: 'small',
      thinking_mode: 'balanced',
      denoise_steps: 16,
      benchmarkId: 'scholar_cup',
      auto_skill: true,
      preview: null,
    },
    company: { section: 'product' },
    codex: { subTab: 'characters', historyId: null, personalHistoryId: null, nodeStage: 'paper' },
    settings: {
      byokEnabled: false, byokEndpoint: '', byokModel: '', lastError: '',
    },
  };
}

const gs          = () => App.state;
const activeModel = () => App.state?.active_model || {};
const stats       = () => activeModel().stats || {};
const statCaps    = () => activeModel().stat_caps || {};
const risks       = () => activeModel().risks || {};

/* Toast -------------------------------------------------------------------- */
function toast(msg, kind = 'info') {
  const root = $('#toast-root');
  if (!root) return;
  const el = h('div', { class: `toast toast--${kind}` }, msg);
  root.appendChild(el);
  requestAnimationFrame(() => { el.classList.add('is-visible'); el.querySelector('button, input, select, [tabindex]')?.focus(); });
  setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 320);
  }, 3800);
}

/* Guarded engine calls ----------------------------------------------------- */
function safeCall(label, fn, ...args) {
  try {
    const out = fn(...args);
    if (out && out.error) { toast(`${label}：${out.error}`, 'error'); return null; }
    return out;
  } catch (err) {
    console.error(`[${label}]`, err);
    toast(`${label} 失败：${err?.message || err}`, 'error');
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* 6. State initialization & normalization                                     */
/* -------------------------------------------------------------------------- */

function pickRecipeId(i) {
  const list = recipeList();
  return list.length ? list[Math.min(i, list.length - 1)].id : null;
}

function bindAlias(target, prop, getter, setter) {
  try {
    Object.defineProperty(target, prop, {
      get: getter,
      set: setter,
      enumerable: true,
      configurable: true,
    });
  } catch (e) {
    // ignore if non-configurable
  }
}

function normalizeState(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  if (!s.company || typeof s.company !== 'object') {
    s.company = {
      company_id: 'comp_player',
      display_name: '下一版实验室',
      cash_kc: Number.isFinite(Number(s.cash_kc)) ? Number(s.cash_kc) : 2400,
      cluster_compute_cu: Number.isFinite(Number(s.cluster_compute_cu)) ? Number(s.cluster_compute_cu) : 140,
      cluster_readiness: Number.isFinite(Number(s.cluster_readiness)) ? Number(s.cluster_readiness) : 85,
      cluster_memory_gb: Number.isFinite(Number(s.cluster_memory_gb)) ? Number(s.cluster_memory_gb) : 96,
      defense_level: Number.isFinite(Number(s.defense_level)) ? Number(s.defense_level) : 35,
      quarter_history: Array.isArray(s.quarter_records) ? s.quarter_records : [],
    };
  }
  if (!s.world || typeof s.world !== 'object') {
    s.world = {
      turn_index: Number(s.turn) || 1,
      bubble_phase: s.bubble_phase || 'expansion',
      bubble_heat: Number(s.bubble_pressure) || 28,
      valuation_multiplier: 1.0,
      funding_multiplier: 1.0,
    };
  }
  s.active_model = s.active_model && typeof s.active_model === 'object' ? s.active_model : {};
  const m = s.active_model;
  m.display_name = m.display_name || '未命名模型';
  m.history_id = m.history_id || (historyList()[0]?.id || 'qwen_ecosystem');
  m.architecture_id = m.architecture_id || (archList()[0]?.id || 'ar_dense');
  m.generation_index = Number(m.generation_index) || 1;
  m.sim_total_params_b = Number(m.sim_total_params_b) || 4;
  m.sim_active_params_b = Number(m.sim_active_params_b) || 4;
  migrateModelCapabilities(m);
  for (const archived of s.archived_models || []) migrateModelCapabilities(archived);
  m.stats = m.stats && typeof m.stats === 'object' ? m.stats : {};
  for (const k of STAT_KEYS) m.stats[k] = clamp(Number.isFinite(m.stats[k]) ? m.stats[k] : 450, 0, 1000);
  m.stat_caps = m.stat_caps && typeof m.stat_caps === 'object' ? m.stat_caps : {};
  for (const k of STAT_KEYS) m.stat_caps[k] = clamp(Number(m.stat_caps[k]) || 720, 0, 1000);

  if (!m.risks || typeof m.risks !== 'object') m.risks = {};
  for (const k of RISK_KEYS) {
    const initialVal = Number.isFinite(Number(m[k])) ? Number(m[k]) : (Number(m.risks[k]) || 0);
    m[k] = clamp(initialVal, 0, 100);
    bindAlias(
      m.risks,
      k,
      () => m[k],
      (v) => { m[k] = clamp(Number(v) || 0, 0, 100); }
    );
  }

  m.optimizer_health = clamp(Number.isFinite(Number(m.optimizer_health)) ? Number(m.optimizer_health) : 100, 0, 100);
  m.checkpoint_interval_actions = [1, 2, 4].includes(m.checkpoint_interval_actions) ? m.checkpoint_interval_actions : 2;
  m.actions_since_checkpoint = Number(m.actions_since_checkpoint) || 0;
  m.checkpoints = Array.isArray(m.checkpoints) ? m.checkpoints : [];
  if (m.checkpoints.length === 0) {
    m.checkpoints.push({ id: 'cp-init', checkpoint_id: 'cp-init', turn: s.world.turn_index || 1, label: '初始版本', stats: { ...m.stats }, optimizer_health: m.optimizer_health, overfit: m.overfit, forgetting: m.forgetting, reward_hacking: m.reward_hacking, sycophancy: m.sycophancy });
  }

  bindAlias(s, 'turn', () => s.world.turn_index || 1, (v) => { s.world.turn_index = Math.max(1, Number(v) || 1); });
  bindAlias(s, 'cash_kc', () => s.company.cash_kc ?? 0, (v) => { s.company.cash_kc = Number(v) || 0; });
  bindAlias(s, 'cluster_compute_cu', () => s.company.cluster_compute_cu ?? 140, (v) => { s.company.cluster_compute_cu = Number(v) || 0; });
  bindAlias(s, 'cluster_readiness', () => s.company.cluster_readiness ?? 85, (v) => { s.company.cluster_readiness = clamp(Number(v) || 0, 0, 100); });
  bindAlias(s, 'cluster_memory_gb', () => s.company.cluster_memory_gb ?? 96, (v) => { s.company.cluster_memory_gb = Number(v) || 0; });
  bindAlias(s, 'defense_level', () => s.company.defense_level ?? 35, (v) => { s.company.defense_level = Number(v) || 1; });
  bindAlias(s, 'bubble_pressure', () => s.world.bubble_heat ?? 28, (v) => { s.world.bubble_heat = clamp(Number(v) || 0, 0, 100); });
  bindAlias(s, 'bubble_phase', () => s.world.bubble_phase || 'expansion', (v) => { s.world.bubble_phase = v || 'expansion'; });
  bindAlias(s, 'support_card_ids', () => m.support_card_ids || [], (v) => { m.support_card_ids = Array.isArray(v) ? v : []; });
  bindAlias(s, 'support_bond', () => m.support_bond || {}, (v) => { m.support_bond = v && typeof v === 'object' ? v : {}; });
  bindAlias(s, 'teacher_model_ids', () => m.teacher_model_ids || [], (v) => { m.teacher_model_ids = Array.isArray(v) ? v : []; });
  bindAlias(s, 'quarter_records', () => s.company.quarter_history || [], (v) => { s.company.quarter_history = Array.isArray(v) ? v : []; });
  bindAlias(s, 'job_sectors', () => s.sectors || {}, (v) => { s.sectors = v && typeof v === 'object' ? v : {}; });
  bindAlias(s, 'milestone_state', () => s.milestones || {}, (v) => { s.milestones = v && typeof v === 'object' ? v : {}; });

  s.season = Math.floor((Number(s.world.turn_index) - 1) / 24) + 1;
  s.day_in_season = Number(s.day_in_season) || 1;
  s.datasets = Array.isArray(s.datasets) ? s.datasets : [];
  for (const ds of s.datasets) {
    if (ds && typeof ds === 'object') {
      ds.id = ds.id || ds.dataset_id;
      ds.name = ds.name || ds.display_name || ds.id;
    }
  }
  s.data_market = Array.isArray(s.data_market) ? s.data_market : [];
  s.annotation_contracts = Array.isArray(s.annotation_contracts) ? s.annotation_contracts : [];
  s.archived_models = Array.isArray(s.archived_models) ? s.archived_models : [];
  s.audit_confidence = Number.isFinite(s.audit_confidence) ? clamp(s.audit_confidence, 0, 1) : 0.75;
  s.processed_action_ids = Array.isArray(s.processed_action_ids) ? s.processed_action_ids : [];
  s.audit_log = Array.isArray(s.audit_log) ? s.audit_log : [];
  s.legal_exposures = Array.isArray(s.legal_exposures) ? s.legal_exposures : [];
  s.legal_cases = Array.isArray(s.legal_cases) ? s.legal_cases : [];
  s.products = Array.isArray(s.products) ? s.products : [];
  s.financing_rounds = Array.isArray(s.financing_rounds) ? s.financing_rounds : [];
  s.portfolio = (s.portfolio && typeof s.portfolio === 'object') ? s.portfolio : {};
  s.research_projects = (s.research_projects && typeof s.research_projects === 'object') ? s.research_projects : {};
  s.main_action_used = !!s.main_action_used;
  ensureServiceEconomy(s);

  return s;
}

function deepCloneSafe(x) {
  try { return deepClone(x); }
  catch (e) { try { return JSON.parse(JSON.stringify(x)); } catch (e2) { return x; } }
}

function createStateFromProfile(profileId, historyId) {
  const profiles = profileList();
  const profile = profiles.find(p => p.id === profileId) || profiles[0];
  let base;
  if (typeof createNewGameState === 'function') {
    try {
      base = createNewGameState({
        profileId: profile?.id || profileId || 'small_startup',
        historyId: historyId || profile?.default_history_id || 'qwen_ecosystem',
        modelName: `${HISTORY_BY_ID[historyId || profile?.default_history_id]?.family_name || 'Qwen'} / 我的下一版`,
      });
    } catch (err) {
      console.warn('[createNewGameState]', err);
      base = null;
    }
  }
  if (!base) {
    base = createNewGameState();
  }
  return normalizeState(base);
}

/* -------------------------------------------------------------------------- */
/* 7. Persistence                                                              */
/* -------------------------------------------------------------------------- */

function saveToStorage() {
  try {
    const payload = { v: APP_VERSION, ts: Date.now(), state: App.state };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch (err) { console.warn('[save]', err); }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || obj.v !== APP_VERSION || !obj.state) return null;
    return obj;
  } catch (err) { console.warn('[load]', err); return null; }
}

function savePrefs() {
  try {
    const prefs = {
      activeTab: App.ui.activeTab,
      partnerId: App.ui.partnerId || null,
      researchView: App.ui.researchView,
      tutorialStep: App.ui.tutorial.step,
    };
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch (err) { /* ignore */ }
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) { return null; }
}

function saveByok() {
  try {
    if (!App.ui.settings.byokEnabled) { sessionStorage.removeItem(BYOK_KEY); return; }
    sessionStorage.setItem(BYOK_KEY, JSON.stringify({
      endpoint: App.ui.settings.byokEndpoint,
      model: App.ui.settings.byokModel,
    }));
  } catch (err) { /* ignore */ }
}

function loadByok() {
  try {
    const raw = sessionStorage.getItem(BYOK_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) { return null; }
}

function exportSave() {
  try {
    const payload = { v: APP_VERSION, ts: new Date().toISOString(), state: App.state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mrp-save-${(App.state?.active_model?.display_name || 'model')}-t${App.state?.turn || 1}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('存档已导出', 'success');
  } catch (err) {
    toast(`导出失败：${err?.message || err}`, 'error');
  }
}

function importSaveFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(String(reader.result || ''));
      const candidate = obj.state || obj;
      if (!candidate?.active_model?.stats || !candidate?.company || !candidate?.world) throw new Error('这不是有效的育成存档');
      const restored = normalizeState(candidate);
      if (!validateGameState(restored).valid) throw new Error('存档校验未通过，请选择完整存档');
      App.state = restored;
      saveToStorage();
      toast('存档导入成功', 'success');
      rerenderAll();
    } catch (err) {
      toast(`导入失败：${err?.message || err}`, 'error');
    }
  };
  reader.onerror = () => toast('读取文件失败', 'error');
  reader.readAsText(file);
}

/* -------------------------------------------------------------------------- */
/* 8. HUD rendering                                                            */
/* -------------------------------------------------------------------------- */

function seasonChapterTitle() {
  const list = chapterList();
  if (!list.length) return '赛季：春 · 蓄势';
  const idx = Math.floor(((gs()?.turn || 1)-1)/24) % list.length;
  const ch = list[idx];
  return `赛季：${SEASON_NAMES[(App.state?.season - 1) % 4] || '春'} · ${ch.title || ch.name || '章节'}`;
}

function bubblePhaseLabel() {
  const p = App.state?.bubble_phase || 'normal';
  const map = { cold: '低温', normal: '平稳', warming: '升温', hot: '过热', blowoff: '爆裂' };
  return map[p] || '平稳';
}

function runWay() {
  const cash = App.state?.cash_kc || 0;
  const burn = estimateTurnBurn();
  return burn > 0 ? Math.max(0, Math.floor(cash / burn)) : 99;
}

function estimateTurnBurn() {
  let burn = 6;
  burn += (App.state?.cluster_memory_gb || 0) * 0.005;
  burn += (App.state?.cluster_compute_cu || 0) * 0.05;
  burn += (App.state?.active_model?.sim_total_params_b || 0) * 0.4;
  return Math.max(1, Math.round(burn));
}

function renderHUD() {
  const s = gs(); if (!s) return;
  const model = activeModel();

  const turn = s.turn || 1;
  const day = s.day_in_season || (((turn - 1) * 15) % 15 + 1);
  const seasonIdx = (s.season - 1) % 4;
  setText('#turn-badge', `第 ${turn} 回合`);
  setText('#round-number', String(turn).padStart(2, '0'));
  setText('#season-short', `${SEASON_NAMES[Math.floor((turn - 1) / 24) % 4]} · 第 ${Math.floor((turn - 1) / 24) + 1} 季`);
  setText('#season-badge', seasonChapterTitle().replace(/^赛季：.\s*·\s*/, '').trim());

  const fin = $('#hud-financial');
  const comp = $('#hud-compute');
  const ready = $('#hud-readiness');
  if (fin) {
    const v = $('[data-hud-value="financial"]', fin);
    if (v) v.textContent = `${Math.round(s.cash_kc || 0)}`;
    fin.title = `研究资金 ${Math.round(s.cash_kc||0)} kc · 预计本回合服务毛利 ${previewServiceTurn(s).margin_kc} kc · 季度另结员工、办公与税`;
  }
  if (comp) {
    const v = $('[data-hud-value="compute"]', comp);
    if (v) v.textContent = `${Math.round(getTrainingComputeCapacity(s))}`;
    comp.title = `训练可用 ${Math.round(getTrainingComputeCapacity(s))} CU · 服务保留 ${s.serving.owned_share_pct}% · 总算力 ${Math.round(s.cluster_compute_cu||0)} CU · 显存 ${Math.round(s.cluster_memory_gb||0)} GB`;
  }
  if (ready) {
    const v = $('[data-hud-value="readiness"]', ready);
    const r = Math.round(s.cluster_readiness || 0);
    if (v) v.textContent = `${r}%`;
    ready.title = `集群就绪度 ${r}% · 优化器健康 ${Math.round(model.optimizer_health || 0)}`;
  }

  /* Alerts */
  const contamination = model.risks?.contamination || 0;
  const legalMax = (s.legal_exposures || []).filter(e => !e.remediated).reduce((mx, e) => Math.max(mx, Number(e.severity ?? e.level) || 0), 0);
  const bub = s.bubble_pressure || 0;

  toggleAlert('#alert-data', contamination >= 30, contamination >= 60);
  toggleAlert('#alert-legal', legalMax >= 20, legalMax >= 55);
  toggleAlert('#alert-bubble', bub >= 40, bub >= 70);

  const alertData = $('#alert-data [data-alert-value]'); if (alertData) alertData.textContent = contamination >= 60 ? '污染高' : contamination >= 30 ? '污染中' : '正常';
  const alertLegal = $('#alert-legal [data-alert-value]'); if (alertLegal) alertLegal.textContent = legalMax >= 55 ? '高风险' : legalMax >= 20 ? '警告' : '正常';
  const alertBubble = $('#alert-bubble [data-alert-value]'); if (alertBubble) alertBubble.textContent = bub >= 70 ? '爆裂' : bub >= 40 ? '升温' : '平稳';

  /* Footer */
  setText('#turn-footer-turn', `第 ${turn} 回合 · ${SEASON_NAMES[seasonIdx]}`);
  const status = $('#turn-main-action-status');
  if (status) {
    const used = !!s.main_action_used;
    status.classList.toggle('is-available', !used);
    status.classList.toggle('is-used', used);
    status.dataset.mainAction = used ? 'used' : 'available';
    status.textContent = used ? '本回合已完成行动' : '本回合可以行动';
  }
  setText('#model-turns-left', `${Math.max(0, MAX_TURN - (s.turn || 1))}`);

  /* Toggle buttons pressed state */
  const rv = $('#btn-research-view');
  if (rv) {
    rv.setAttribute('aria-pressed', App.ui.researchView ? 'true' : 'false');
    rv.classList.toggle('is-active', !!App.ui.researchView);
  }
  const tb = $('#btn-tutorial');
  if (tb) {
    tb.setAttribute('aria-pressed', App.ui.tutorial.active ? 'true' : 'false');
    tb.classList.toggle('is-active', !!App.ui.tutorial.active);
  }
}

function toggleAlert(sel, show, danger) {
  const el = $(sel);
  if (!el) return;
  el.hidden = !show;
  el.classList.toggle('is-danger', !!danger);
}

/* -------------------------------------------------------------------------- */
/* 9. Stats panel                                                              */
/* -------------------------------------------------------------------------- */

const _statTrendCache = {};

function renderStatsPanel() {
  const panel = $('#stats-panel'); if (!panel) return;
  const values = stats(); const caps = statCaps();
  const gains = App.ui.train.preview?.expected_stat_gains || App.ui.train.preview?.stat_gains || {};
  panel.innerHTML = PRIMARY_CAPABILITY_KEYS.map(key => {
    const value = Math.round(values[key] || 0); const cap = Math.round(caps[key] || 1000);
    const delta = !gs().main_action_used && App.ui.activeTab === 'train' ? Number(gains[key] || 0) : 0;
    const meta = FOCUS_META[key];
    return `<div class="growth-stat" data-stat="${key}" style="--stat-color:${meta.color}"><div class="growth-stat__top">${icon(meta.icon)}<span class="stat-label">${STAT_LABELS[key]}</span><span class="stat-value" data-stat-value="${key}">${value}</span></div><div class="stat-meter" role="progressbar" aria-label="${STAT_LABELS[key]}" aria-valuemin="0" aria-valuemax="${cap}" aria-valuenow="${value}"><div class="stat-meter__fill" style="width:${Math.min(100,value/Math.max(1,cap)*100)}%"></div></div><div class="stat-trend"><span>${delta > 0 ? `预计 +${delta.toFixed(1)}` : '当前能力'}</span><span>/${cap}</span></div></div>`;
  }).join('');
}

/* -------------------------------------------------------------------------- */
/* 10. Character stage                                                         */
/* -------------------------------------------------------------------------- */

function historyTheme(historyId) {
  const h = HISTORY_BY_ID[historyId];
  const hue = (typeof h?.theme_hue === 'number') ? h.theme_hue : Math.abs(hashStr(historyId || 'h01')) % 360;
  return {
    hue,
    hair1: `hsl(${hue} 60% 48%)`,
    hair2: `hsl(${(hue + 30) % 360} 55% 30%)`,
    accent: `hsl(${(hue + 200) % 360} 70% 62%)`,
    cloth: `hsl(${(hue + 180) % 360} 30% 22%)`,
  };
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function renderCharacterStage() {
  const stage = $('#character-stage'); if (!stage) return;
  const model = activeModel(); const partner = currentPartner();
  const emotion = App.emotion || 'neutral'; const emotionInfo = EMOTION_MAP[emotion] || EMOTION_MAP.neutral;
  const src = partner.sprites?.[emotion] || partner.sprites?.neutral || partner.src;
  stage.dataset.emotion = emotion;
  const portrait = $('[data-character-portrait]', stage);
  let img = $('img', portrait);
  if (!img) { img = document.createElement('img'); img.draggable = false; img.decoding = 'async'; portrait.replaceChildren(img); }
  if (img.getAttribute('src') !== src) img.src = src;
  img.alt = `${partner.label} · ${emotionInfo.label}`;
  setText('#character-family', partner.name);
  const nativePartner = partnerForHistory(model.history_id);
  setText('#character-identity', (!nativePartner || (App.ui.partnerId && nativePartner !== App.ui.partnerId)) ? `形象：${partner.label} · 模型：${model.display_name}` : `${partner.label} · ${HISTORY_BY_ID[model.history_id]?.family_name || '你的模型伙伴'}`);
  setText('#character-emotion', emotionInfo.label);
  setText('#stage-parameters', `${model.sim_total_params_b}B · ${model.training_mode || 'LoRA'}`);
  renderDialogue();
}

function renderDialogue() {
  const speaker = App.dialogue?.speaker || '策划';
  const text = App.dialogue?.text || '……';
  const spEl = $('#dialogue-speaker');
  const txEl = $('#dialogue-text');
  if (!spEl || !txEl) return;

  const hist = HISTORY_BY_ID[activeModel().history_id];
  const charName = currentPartner().label;

  spEl.textContent = speaker === '角色' ? charName : speaker;

  let html = esc(text);
  if (speaker === '角色') {
    html += ` <button class="btn btn--link btn--inline" type="button" data-action="open-free-dialogue">${App.ui.settings.byokEnabled?'和伙伴聊聊 ↗':'说给伙伴听 ↗'}</button>`;
  } else {
    html += ` <button class="btn btn--link btn--inline" type="button" data-action="char-speak">听 TA 说一句</button>`;
  }
  txEl.innerHTML = html;
}

function characterLine() {
  const m = activeModel();
  const avg = avgOf(STAT_KEYS.map(k => m.stats?.[k] || 0));
  const ready = gs()?.cluster_readiness || 0;
  const opt = m.optimizer_health || 0;
  const risksMax = Math.max(0, ...RISK_KEYS.map(k => m.risks?.[k] || 0));

  if (risksMax >= 65) return { emo: 'worried', text: '我有点担心……隐藏风险好像太高了，我们需要回滚一次快照。' };
  if (ready < 30) return { emo: 'determined', text: '集群就绪度不足三成。先整备一下吧——训练前先热身。' };
  if (avg < 60) return { emo: 'neutral', text: '现在还是个很小的版本。你打算先扩数据，还是先把能力抬起来？' };
  if (avg > 300) return { emo: 'happy', text: '状态不错！要不要去排行榜上试一场？' };
  if (opt < 40) return { emo: 'worried', text: '优化器已经在喘了。持续推送可能带来不可逆损失。' };
  return { emo: 'neutral', text: '今天从哪儿开始？训练、数据、整备，还是直接上赛场？' };
}

function charSpeak() {
  const line = characterLine();
  App.dialogue = { speaker: '角色', text: line.text };
  App.emotion = line.emo;
  renderCharacterStage();
}

/* -------------------------------------------------------------------------- */
/* 11. Model summary                                                           */
/* -------------------------------------------------------------------------- */

function nextCupCountdown() {
  const localTurn = ((gs()?.turn || 1) - 1) % 24 + 1;
  return [6,12,18,24].find(t=>t>=localTurn) - localTurn;
}

function renderModelSummary() {
  const m = activeModel();
  const hist = HISTORY_BY_ID[m.history_id];
  const arch = ARCH_BY_ID[m.architecture_id];
  setText('#model-name', m.display_name || '未命名模型');
  setText('#model-version-value', `v0.${m.generation_index || 1}.0`);
  setText('#model-version', `v0.${m.generation_index || 1}`);
  setText('#model-tier', arch ? `${arch.tier || 'T1'} · ${arch.family || '小型'}` : 'T1 · 小型');
  setText('#model-stage', m.training_stage || '预训练');
  setText('#model-release-line', `就绪度 ≥ 60% 且 ${
    RISK_KEYS.map(k => Math.round(m.risks?.[k] || 0) >= 80 ? 1 : 0).reduce((a, b) => a + b, 0) === 0
      ? '无高风险' : '无高风险项'
  }`);
  setText('#model-turns-left', `${nextCupCountdown()} 回合后杯赛`);

  const grid = $('#model-summary .model-summary__grid');
  if (!grid) return;
  const derive = (key, val) => {
    const cell = grid.querySelector(`dd#${key}`);
    if (cell) cell.textContent = val;
  };
  derive('model-name', `${m.display_name || '未命名模型'} · ${hist?.name || '未收录'}`);
  derive('model-version-value', `v0.${m.generation_index || 1}.0`);
  derive('model-tier', `${arch?.tier || 'T1'} · ${arch?.family || '小型'} · ${m.sim_total_params_b || 0}B / ${m.sim_active_params_b || 0}B`);
  derive('model-stage', m.training_stage || '预训练');
  derive('model-release-line', `就绪度 ≥ 60%`);
  derive('model-turns-left', `${Math.max(0, MAX_TURN - (gs()?.turn || 1))} 回合`);
}

/* -------------------------------------------------------------------------- */
/* 12. Risks panel                                                             */
/* -------------------------------------------------------------------------- */

function riskLevel(v) {
  if (v >= 75) return { label: '高', cls: 'is-high' };
  if (v >= 45) return { label: '中', cls: 'is-mid' };
  return { label: '低', cls: 'is-low' };
}

function renderRisksPanel() {
  const panel = $('#risks-panel');
  if (!panel) return;
  const m = activeModel();
  const rv = App.ui.researchView;
  const conf = gs()?.audit_confidence ?? 0.7;

  const chips = RISK_KEYS.map(key => {
    const v = Math.round(m.risks?.[key] || 0);
    const lvl = riskLevel(v);
    const val = rv ? String(v) : lvl.label;
    const cls = `risk-chip ${lvl.cls} ${rv ? 'is-exact' : ''}`;
    return `
      <span class="${cls}" role="listitem" data-risk="${key}"
            title="${esc(RISK_LABELS[key])}${rv ? '' : ` · 审计置信度 ${(conf * 100).toFixed(0)}%`}">
        <span class="risk-chip__label">${esc(RISK_LABELS[key])}</span>
        <span class="risk-chip__value" data-risk-value="${key}">${val}</span>
      </span>
    `;
  }).join('');

  const cps = (m.checkpoints || []);
  const cpsHtml = cps.length ? cps.map((cp, i) => `
    <span class="checkpoint-chip ${i === cps.length - 1 ? 'is-open' : 'is-live'}"
          role="listitem" data-checkpoint="${esc(cp.id)}">
      <span class="checkpoint-chip__label">${esc(cp.label || `快照 ${i + 1}`)} · T${cp.created_turn ?? cp.turn ?? 0}</span>
      <span class="checkpoint-chip__state" data-checkpoint-state="${esc(cp.id)}">
        ${i === cps.length - 1 ? '当前' : '可回滚'}
      </span>
    </span>
  `).join('') : `
    <span class="checkpoint-chip is-empty" role="listitem">
      <span class="checkpoint-chip__label">尚无快照</span>
      <span class="checkpoint-chip__state">先做一次训练</span>
    </span>
  `;

  panel.innerHTML = `
    <header class="panel__header">
      <h2 class="panel__title">隐藏风险 · 检查点</h2>
      <span class="panel__hint" id="risks-note">
        ${rv ? '研究视图：精确数值 · audit ' + (conf * 100).toFixed(0) + '%' : '数值越高越危险 · 切换研究视图查看精确值'}
      </span>
    </header>
    <div class="risks-panel__bar" role="list" aria-label="风险指标快捷条">${chips}</div>
    <div class="risks-panel__opt row-space">
      <span class="risk-chip risk-chip--clean">
        <span class="risk-chip__label">优化器健康</span>
        <span class="risk-chip__value" data-risk-value="optimizer_health">
          ${rv ? Math.round(m.optimizer_health || 0) : riskLevel(100 - (m.optimizer_health || 0)).label}
        </span>
      </span>
      <span class="checkpoint-chip__state">检查点间隔：每 ${m.checkpoint_interval_actions || 2} 次行动</span>
      <span class="checkpoint-chip__state">已积 ${m.actions_since_checkpoint || 0} / ${m.checkpoint_interval_actions || 2}</span>
    </div>
    <div class="checkpoint-bar" role="list" aria-label="检查点">${cpsHtml}</div>
  `;
}

/* -------------------------------------------------------------------------- */
/* 13. Deck panel                                                              */
/* -------------------------------------------------------------------------- */

function renderDeckPanel() {
  const panel = $('#deck-panel');
  if (!panel) return;
  const s = gs(); if (!s) return;

  const ids = (s.support_card_ids || []).slice(0, 4);
  while (ids.length < 4) ids.push(null);

  const bond = s.support_bond || {};

  const cardsHtml = ids.map((id, i) => {
    const card = id ? CARD_BY_ID[id] : null;
    const b = bond[id] ?? (id ? bond[i] : 0) ?? 0;
    if (!card) {
      return `<li class="support-card is-empty" data-card-slot="${i}" data-action="open-card-editor" data-slot="${i}">空槽位 · 点击装备</li>`;
    }
    const bondPct = clamp(Number(b) || 0, 0, 100);
    return `
      <li class="support-card" data-card-slot="${i}" data-card-id="${esc(id)}" title="${esc(card.description || '')}">
        <span class="support-card__name">${esc(card.name || id)}</span>
        <span class="support-card__desc">${esc((card.description || '').slice(0, 40))}</span>
        <div class="support-card__bond" title="羁绊 ${bondPct}">
          <div class="support-card__bond-fill" style="width:${bondPct}%"></div>
        </div>
        <button class="btn btn--tiny btn--link" type="button" data-action="open-card-editor" data-slot="${i}">更换</button>
      </li>
    `;
  }).join('');

  const teacherIds = (s.teacher_model_ids || []);
  const mentorsHtml = [0, 1].map(i => {
    const id = teacherIds[i];
    const hist = id ? HISTORY_BY_ID[id] : null;
    if (!hist) {
      return `
        <li class="mentor-item is-idle" data-mentor-slot="${i}" data-action="open-mentor-editor" data-slot="${i}">
          <span class="mentor-item__name">未招募</span>
          <span class="mentor-item__bonus">—</span>
        </li>
      `;
    }
    const inh = typeof calculateMentorInheritance === 'function'
      ? (safeCall('mentor inherit', () => calculateMentorInheritance(s, id)) || {})
      : {};
    const bonus = inh.summary || `${Object.keys(inh.bonus || {}).length} 项继承`;
    return `
      <li class="mentor-item" data-mentor-slot="${i}" data-mentor-id="${esc(id)}" title="${esc(bonus)}">
        <span class="mentor-item__name">${esc(hist.name || id)}</span>
        <span class="mentor-item__bonus">${esc(String(bonus).slice(0, 30))}</span>
        <button class="btn btn--tiny btn--link" type="button" data-action="open-mentor-editor" data-slot="${i}">更换</button>
      </li>
    `;
  }).join('');

  panel.innerHTML = `
    <header class="panel__header">
      <h2 class="panel__title">支援卡 · 导师</h2>
      <span class="panel__hint" id="deck-count">手牌 ${ids.filter(Boolean).length} / 上限 4</span>
    </header>
    <div class="deck-panel__section">
      <h3 class="deck-panel__subtitle">支援卡</h3>
      <ul class="support-cards" id="support-cards" aria-label="支援卡列表">${cardsHtml}</ul>
    </div>
    <div class="deck-panel__section">
      <h3 class="deck-panel__subtitle">导师（继承）</h3>
      <ul class="mentor-list" id="mentor-list" aria-label="导师列表">${mentorsHtml}</ul>
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* 14. Tabs: main content rendering                                            */
/* -------------------------------------------------------------------------- */

function renderActiveTab() {
  const container = $('#tab-content');
  if (!container) return;
  const tab = App.ui.activeTab || 'train';

  $$('.tab', $('#main-tabs')).forEach(t => {
    const isActive = t.dataset.tab === tab;
    t.setAttribute('aria-selected', isActive ? 'true' : 'false');
    t.setAttribute('tabindex', isActive ? '0' : '-1');
    t.classList.toggle('is-active', isActive);
  });
  container.dataset.activeTab = tab;

  $$('[data-tab-panel]', container).forEach(p => {
    p.hidden = p.dataset.tabPanel !== tab;
  });

  const panel = $(`[data-tab-panel="${tab}"]`, container);
  if (!panel) return;
  panel.innerHTML = renderTabContent(tab);
  container.setAttribute('aria-labelledby', `tab-${tab}`);
  decorateActivePanel(tab, panel);
  renderPrimaryAction();
}

function decorateActivePanel(tab, panel) {
  if (tab === 'train') return;
  const metadata = {
    data:['数据工坊','DATA ATELIER','给成长一点新的灵感。挑选语料、准备标注，让每一份数据都用在合适的地方。','data'],
    prep:['稍作休息，再向前一步','REST & RECOVERY','一杯茶的时间，让集群和伙伴都重新找回好状态。','coffee'],
    race:['准备好，闪耀登场','THE BENCHMARK STAGE','每一场挑战，都是一次认识自己的机会。先看清赛制，再从擅长的领域出发。','cup'],
    company:['我们的下一版实验室','OUR LITTLE LAB','让想法成为产品，让每一次成长都有继续下去的底气。','company'],
    codex:['收集每一段可能性','MODEL ARCHIVE','不同的模型谱系，不同的成长故事。也许下一位同行的伙伴，就在这里。','star'],
    settings:['按你的节奏来','MAKE IT YOURS','进度、回放与可选的 AI 对话接口，都在这里。','settings'],
  };
  const [title,english,desc,ico] = metadata[tab] || [];
  const heading = panel.querySelector('.tab-panel__title');
  if (heading) { heading.textContent = title; heading.insertAdjacentHTML('beforebegin',`<span class="page-eyebrow">${icon(ico)} ${english}</span>`); }
  const intro = panel.querySelector('.tab-panel__text'); if (intro) intro.textContent = desc;
  const fold = (card,key,label) => {
    if (!card) return;
    const details = document.createElement('details'); details.className = 'fold-card';
    details.open = !!App.ui.disclosures?.[key];
    const summary = document.createElement('summary');
    summary.innerHTML = `<span>${esc(label || card.querySelector('h3')?.textContent || '更多信息')}</span><span class="fold-hint">展开查看</span>`;
    card.replaceWith(details); details.append(summary,card);
    details.addEventListener('toggle',()=>{App.ui.disclosures ||= {};App.ui.disclosures[key]=details.open;});
  };
  const cards = Array.from(panel.querySelectorAll(':scope > .card'));
  if (tab === 'data') {
    fold(cards[0],'warehouse',`我的数据仓库 · ${gs().datasets.length} 份语料`);
    fold(cards[2],'annotation','委托标注 · 精细打磨一份数据');
    cards[1]?.classList.add('market-section');
    cards[1]?.querySelector('.grid-3')?.classList.replace('grid-3','grid-2');
    panel.querySelectorAll('.offer-card').forEach((card,i)=>card.insertAdjacentHTML('afterbegin',`<span class="offer-index">${String(i+1).padStart(2,'0')} / DATA</span>`));
    if (gs().main_action_used) panel.querySelectorAll('[data-action="acquire-offer"],[data-action="start-minigame"],[data-action="auto-delegate"],[data-action="start-annotation"]').forEach(b=>b.disabled=true);
  }
  if (tab === 'prep') {
    cards[0]?.classList.add('recovery-hero');
    cards[0]?.insertAdjacentHTML('afterbegin',`<div class="recovery-status">${icon('coffee')}<div><span class="eyebrow">TAKE A LITTLE BREAK</span><strong>好好休息，也是成长的一部分。</strong><span>集群就绪度 ${Math.round(gs().cluster_readiness)}% · 优化器健康 ${Math.round(activeModel().optimizer_health)}%</span></div></div>`);
    const rest = panel.querySelector('[data-action="do-rest"]'); if (rest) rest.textContent = gs().main_action_used ? '本回合已完成行动' : '喝杯茶，恢复状态';
    cards.slice(1).forEach((card,i)=>fold(card,`prep-${i}`));
  }
  if (tab === 'race') {
    cards[0]?.classList.add('race-calendar');
    cards[1]?.querySelectorAll('.grid-3').forEach(g=>g.classList.replace('grid-3','grid-2'));
    cards[1]?.classList.add('race-configuration');
    const oldActions = panel.querySelector(':scope > .actions-row'); if (oldActions) oldActions.hidden = true;
    const prev = panel.querySelector(':scope > .preview-panel'); if (prev) fold(prev,'race-formula','赛前评估 · 分数与预算详情');
  }
  if (tab === 'codex') {
    if (!['characters','personal'].includes(App.ui.codex.subTab || 'characters')) {
    const gallery = document.createElement('section'); gallery.className = 'archive-gallery';
    gallery.innerHTML = `<header><span class="eyebrow">MEET YOUR COMPANIONS</span><h3>与你同行的伙伴</h3></header><div class="archive-portraits">${Object.values(PARTNERS).slice(0,5).map(p=>`<button class="archive-portrait" data-action="select-partner" data-value="${p.id}" title="使用${p.label}的舞台形象"><img src="${p.src}" alt="${p.label}" loading="lazy" decoding="async"/><span>${p.name}</span><small>${p.label}</small></button>`).join('')}</div><button class="text-btn" data-action="open-partners">查看全部 41 位伙伴 ↗</button>`;
    intro?.after(gallery);
    }
    panel.querySelectorAll('.codex-extra').forEach((card,i)=>fold(card,`codex-extra-${i}`));
  }
  if (tab === 'settings') {
    const shortcuts = document.createElement('div'); shortcuts.className='settings-shortcuts';
    shortcuts.innerHTML=`<button class="tile" data-action="export-save">${icon('save')}<span class="tile__title">带走这段旅程</span><span class="tile__desc">导出当前存档</span></button><button class="tile" data-action="open-import">${icon('book')}<span class="tile__title">继续一段旅程</span><span class="tile__desc">导入已有存档</span></button><button class="tile" data-action="open-new-game">${icon('spark')}<span class="tile__title">遇见新的可能</span><span class="tile__desc">开始新的育成</span></button><button class="tile" data-action="toggle-tutorial">${icon('book')}<span class="tile__title">慢慢来，也没关系</span><span class="tile__desc">打开育成指南</span></button>`;
    intro?.after(shortcuts);
    const byokTitle = cards[0]?.querySelector('h3'); if (byokTitle) byokTitle.textContent = 'AI 伙伴对话 · 可选';
    const byokHint = cards[0]?.querySelector('header .hint'); if (byokHint) byokHint.textContent = '关闭时使用本地台词；密钥仅用于当前页面。';
    cards.slice(1).forEach((card,i)=>fold(card,`settings-${i}`));
  }
  panel.querySelectorAll('table').forEach(table=>{
    if (table.parentElement.classList.contains('table-wrap')) return;
    const wrapper=document.createElement('div');wrapper.className='table-wrap';table.replaceWith(wrapper);wrapper.append(table);
  });
}

function renderTabContent(tab) {
  switch (tab) {
    case 'train':    return renderTrainTab();
    case 'data':     return renderDataTab();
    case 'prep':     return renderPrepTab();
    case 'race':     return renderRaceTab();
    case 'company':  return renderCompanyTab();
    case 'codex':    return renderCodexTab();
    case 'settings': return renderSettingsTab();
    default:         return '';
  }
}

/* -------------------------------------------------------------------------- */
/* 14a. Train tab                                                              */
/* -------------------------------------------------------------------------- */

function renderFocusCard(k) {
  const meta=FOCUS_META[k], selected=App.ui.train.focus===k;
  return `<button class="focus-card ${selected?'is-active':''}" style="--focus-color:${meta.color}" data-action="train-focus" data-value="${k}" aria-pressed="${selected}">${icon(meta.icon)}<span><strong>${meta.title}</strong><small>${meta.desc}</small></span><span class="focus-check">✓</span></button>`;
}

function selectTrainingFocus(focus) {
  App.ui.train.focus=focus;
  const recipeId={creative_writing:'sft',mathematics:'verifiable_rl',safety_alignment:'rlaif',tool_use:'agent_traj'}[focus];
  if(recipeId && RECIPE_BY_ID[recipeId]){
    App.ui.train.recipeId=recipeId;
    const format=RECIPE_BY_ID[recipeId].format;
    const compatible=gs().datasets.find(d=>d.format===format && d.allowed_training!==false);
    if(compatible)App.ui.train.datasetId=compatible.id;
  }
  recomputeTrainingPreview();renderTabIfActive('train');
}

function renderTrainTab() {
  const state = gs(); if (!state) return '';
  const tr = App.ui.train; const preview = tr.preview || {};
  const blockers = preview.blockers || [];
  const gains = preview.expected_stat_gains || preview.stat_gains || {};
  const used = state.main_action_used;
  const fail = Number(preview.failure_prob || 0);
  const ds = state.datasets || [];
  const adv = tr.advanced;
  return `
  <header class="training-header"><div><h2>今天，想进步一点点<span style="color:#bf9d64">✦</span></h2><span class="eyebrow">YOUR TRAINING PLAN</span></div><span class="tiny-badge">${icon('sun')} 稳步成长中</span></header>
  ${renderPersonalInvitation()}
  <div class="section-label"><span>选择本次成长方向</span><button class="${tr.focus === 'mixed' ? 'is-active' : ''}" data-action="train-focus" data-value="mixed" aria-pressed="${tr.focus === 'mixed'}">${tr.focus === 'mixed' ? '✓ ' : ''}均衡成长</button></div>
  <div class="focus-grid" role="group" aria-label="训练方向">${PRIMARY_CAPABILITY_KEYS.map(renderFocusCard).join('')}</div>
  <details class="other-capabilities" ${!PRIMARY_CAPABILITY_KEYS.includes(tr.focus)&&tr.focus!=='mixed'?'open':''}><summary>通识、表达、长程与可靠性 <span>更多能力方向</span></summary><div class="focus-grid">${STAT_KEYS.filter(k=>!PRIMARY_CAPABILITY_KEYS.includes(k)).map(renderFocusCard).join('')}</div></details>
  <div class="training-intensity"><span>训练强度</span><div class="intensity-pills" role="group" aria-label="训练强度">${[{id:'steady',label:'轻量',symbol:'◡'},{id:'balanced',label:'标准',symbol:'≈'},{id:'push',label:'冲刺',symbol:'↗'}].map(o => `<button class="intensity-pill ${tr.preset === o.id ? 'is-active' : ''}" data-action="train-preset" data-value="${o.id}" aria-pressed="${tr.preset === o.id}">${o.symbol} ${o.label}</button>`).join('')}</div></div>
  <div class="training-options"><label class="field"><span class="field-label">训练数据</span><select data-train-field="datasetId" aria-label="训练数据">${ds.map(d => `<option value="${esc(d.id)}" ${tr.datasetId === d.id ? 'selected' : ''}>${esc(d.display_name || d.name)} · ${d.records_k}k</option>`).join('')}</select></label><label class="field"><span class="field-label">训练方式</span><select data-train-field="mode" aria-label="训练方式">${['lora','qlora','full'].map(id => `<option value="${id}" ${tr.mode === id ? 'selected' : ''}>${{lora:'LoRA',qlora:'QLoRA',full:'全参训练'}[id]}</option>`).join('')}</select></label></div>
  <details class="tuning" ${tr.advancedOpen ? 'open' : ''}><summary data-action="toggle-train-adv">${esc(RECIPE_BY_ID[tr.recipeId]?.name || '监督微调')} · 训练配方与进阶参数</summary><label class="field"><span class="field-label">训练配方</span><select data-train-field="recipeId" aria-label="训练配方">${recipeList().map(r => `<option value="${esc(r.id)}" ${tr.recipeId === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label><p class="hint" style="margin-top:8px">${esc(RECIPE_BY_ID[tr.recipeId]?.description || '')}</p><div class="grid-3" style="margin-top:14px">${renderNumberField('epochs','训练轮数',adv.epochs,1,20,1)}${renderNumberField('replay_ratio','旧知识回放',adv.replay_ratio,0,.9,.05)}${renderNumberField('batch_size','批次大小',adv.batch_size,1,512,1)}${renderNumberField('lora_rank','LoRA Rank',adv.lora_rank,4,256,4)}${renderNumberField('group_size','采样组大小',adv.group_size,1,32,1)}${renderNumberField('reasoning_budget_tokens','推理预算',adv.reasoning_budget_tokens,256,65536,256)}${renderNumberField('kl_strength','KL 强度',adv.kl_strength,0,.5,.01)}${renderNumberField('mask_ratio','掩码比例',adv.mask_ratio,0,.6,.01)}${renderNumberField('denoise_steps','去噪步数',adv.denoise_steps,4,64,4)}</div><label class="field"><span class="field-label">检查点间隔</span><select data-train-field="checkpoint_interval">${[1,2,4].map(n => `<option value="${n}" ${activeModel().checkpoint_interval_actions===n?'selected':''}>每 ${n} 次训练保存</option>`).join('')}</select></label><label class="check"><input type="checkbox" data-train-field="accept_legal_risk" ${adv.accept_legal_risk?'checked':''}/>允许使用来源尚未确认的数据</label></details>
  ${blockers.length ? `<ul class="blockers">${blockers.map(b=>`<li>${esc(typeof b==='string'?BLOCKER_LABELS[b]||b:BLOCKER_LABELS[b.code]||b.message||b.code||'当前方案暂不可执行')}</li>`).join('')}</ul>` : ''}
  <button class="next-cup text-btn" data-action="switch-tab" data-value="race">${icon('cup')}<span><strong>下一个重要赛事</strong> · 星海模型挑战赛</span><span>${nextCupCountdown()} 回合后 ↗</span></button>`;
}

function renderPrimaryAction() {
  const root = $('#primary-action'); if (!root) return;
  root.hidden = !['train','race'].includes(App.ui.activeTab);
  if (root.hidden) return;
  if (App.ui.activeTab === 'race') {
    const preview=App.ui.race.preview || {}; const used=gs().main_action_used;
    root.innerHTML=`<div class="commit-topline"><div class="commit-cost"><span class="eyebrow">BENCHMARK</span><strong>${fmtNum(preview.official_score||0,1)}</strong><span>预估官方得分</span></div><div class="commit-gain"><span class="eyebrow">COMPUTE</span><strong>${fmtNum(preview.compute_used_cu||0,1)}</strong><span>CU 预计用量</span></div><button class="train-cta ${used?'is-done':''}" data-action="start-race" ${used?'disabled':''}>${used?'本回合已完成':'开始挑战'}${used?'':icon('arrow')}</button></div><div class="commit-note">${icon('cup')}${preview.rank_eligible===false?'当前方案无法参与排名，请查看赛前评估。':'公开评测与隐藏评测共同决定最终得分。'}</div>`;
    return;
  }
  const used = gs().main_action_used; const action = gs().last_action;
  const p = used && action?.type==='training' ? {...action.preview,expected_total_gain:action.actual_gain} : App.ui.train.preview || {};
  const blocked = p.can_apply === false || (p.blockers || []).length > 0;
  root.innerHTML = `<div class="commit-topline"><div class="commit-cost"><span class="eyebrow">COST</span><strong>${fmtNum(p.cost_kc || 0,1)}<small> k</small></strong><span>${fmtNum(p.compute_cu || 0,1)} CU · ${fmtNum(p.memory_gb || 0,0)} GB</span></div><div class="commit-gain"><span class="eyebrow">GROWTH</span><strong>+${fmtNum(p.expected_total_gain || 0,1)}</strong><span>${used && action?.type==='training'?'本次成长':'预期成长'}</span></div><button class="train-cta ${used?'is-done':''}" data-action="run-training" ${used||blocked?'disabled':''}>${used?'✓ 本回合已完成':blocked?'请调整训练方案':'开始训练'}${used||blocked?'':icon('arrow')}</button></div><div class="commit-note">${icon('shield')}${used?'本次成长已记录，点击「下一回合」继续旅程。':blocked?'训练条件暂未满足，详细原因已标在方案下方。':p.failure_prob>0?`当前失败概率 ${fmtPct(p.failure_prob,1)}，可以降低强度来减少风险。`:'当前方案风险可控 · 每回合一次主要行动'}</div>`;
}

function renderNumberField(key, label, value, min, max, step) {
  return `
    <label class="field">
      <span class="field-label">${esc(label)}</span>
      <input class="input" type="number" data-train-adv="${key}"
             value="${esc(value)}" min="${min}" max="${max}" step="${step}"/>
    </label>
  `;
}

/* -------------------------------------------------------------------------- */
/* 14b. Data tab                                                               */
/* -------------------------------------------------------------------------- */

function renderDataTab() {
  const s = gs(); if (!s) return '';

  const datasetsHtml = (s.datasets || []).length ? (s.datasets || []).map(d => {
    const tpl = DATASET_TEMPLATE_BY_ID[d.template_id] || {};
    const quality = d.quality ?? tpl.quality ?? 0.5;
    const trueQ = d.true_quality ?? quality;
    const novelty = d.novelty ?? tpl.novelty ?? 0.3;
    return `
      <tr>
        <td>${esc(tpl.name || d.name || d.id)}</td>
        <td>${esc(FORMAT_LABELS[tpl.format || d.format] || tpl.format || d.format || '—')}</td>
        <td>${(d.records_k ?? tpl.records_k ?? 0)}k</td>
        <td>${fmtPct(quality, 0)}${App.ui.researchView ? ` / ${fmtPct(trueQ, 0)}` : ''}</td>
        <td>${fmtPct(novelty, 0)}</td>
        <td>${d.uses ?? 0}</td>
        <td><span class="badge badge--${d.rights_status === 'clear' ? 'good' : d.rights_status === 'gray' ? 'warn' : 'bad'}">${esc(RIGHTS_LABELS[d.rights_status] || '待核验')}</span></td>
        <td>${esc(d.provenance || tpl.provenance || '未知')}</td>
      </tr>
    `;
  }).join('') : `<tr><td colspan="8" class="empty-row">暂无数据集，先在数据市场采集或委托标注团队。</td></tr>`;

  const routes = routeList();
  const market = (s.data_market || []).length ? s.data_market : [];
  const marketHtml = market.map((offer, i) => {
    const tpl = offer.dataset || DATASET_TEMPLATE_BY_ID[offer.template_id] || offer;
    return `
      <div class="offer-card" data-offer="${i}">
        <div class="offer-card__head">
          <span class="offer-card__name">${esc(tpl.display_name || tpl.name || offer.name || `要约 ${i + 1}`)}</span>
          <span class="offer-card__price">${fmtKc(offer.price_kc ?? tpl.base_price_kc ?? 0)}</span>
        </div>
        <ul class="offer-card__meta">
          <li>格式：${esc(FORMAT_LABELS[tpl.format] || tpl.format || '—')}</li>
          <li>规模：${(tpl.records_k ?? offer.records_k ?? 0)}k</li>
          <li>显示质量：${fmtPct(tpl.quality ?? offer.quality ?? 0.5, 0)}</li>
          ${App.ui.researchView ? `<li>真实质量：${fmtPct(offer.true_quality ?? tpl.true_quality ?? tpl.quality ?? 0.5, 0)}</li>` : ''}
          <li>权利：<span class="badge badge--${(offer.dataset?.rights_status || offer.rights_status) === 'licensed' ? 'good' : 'warn'}">${esc(RIGHTS_LABELS[offer.dataset?.rights_status || offer.rights_status] || '待核验')}</span></li>
        </ul>
        <div class="offer-card__actions">
          <button class="btn btn--primary btn--small" data-action="acquire-offer" data-index="${i}">直接采购</button>
          <button class="btn btn--ghost btn--small" data-action="start-minigame" data-index="${i}">30秒小游戏</button>
          <button class="btn btn--ghost btn--small" data-action="auto-delegate" data-index="${i}" title="委托助理完成本次采购">自动委托</button>
        </div>
      </div>
    `;
  }).join('') || `<div class="empty-row">数据市场本回合暂无要约，点击「刷新市场」重新抽取（每回合自动刷新）。</div>`;

  const mg = App.ui.data.miniGame;
  const mgHtml = mg ? renderMiniGame(mg) : '';

  const annDraft = App.ui.data.annotationDraft;
  const teams = teamList();
  const labels = labelList();

  let draftPreview = '';
  if (annDraft.teamId && annDraft.methodId) {
    const res = typeof calculateAnnotationQuality === 'function'
      ? safeCall('annot preview', () => calculateAnnotationQuality({
          team_id: annDraft.teamId,
          method_id: annDraft.methodId,
          fair_pay_ratio: annDraft.fair_pay_ratio,
          gold_check_ratio: annDraft.gold_check_ratio,
          independent_audit_ratio: annDraft.independent_audit_ratio,
          size_k: annDraft.size_k,
        })) || {}
      : {};
    draftPreview = `
      <div class="kv-row">
        <div class="kv"><span>预计品质</span><b>${fmtPct(res.quality ?? 0.6, 0)}</b></div>
        <div class="kv"><span>预计成本</span><b>${fmtKc(res.cost_kc ?? 0)}</b></div>
        <div class="kv"><span>预计回合</span><b>${res.turns ?? 1}</b></div>
        <div class="kv"><span>法律曝光</span><b>${fmtSigned(res.legal_delta ?? 0, 0)}</b></div>
      </div>
    `;
  }

  const contractsHtml = (s.annotation_contracts || []).length
    ? (s.annotation_contracts || []).map(c => `
        <li class="contract-row">
          <span class="contract-row__name">${esc(c.name || c.id)}</span>
          <span class="contract-row__meta">团队 ${esc(c.team_id || '—')} · 方法 ${esc(c.method_id || '—')} · ${(c.size_k ?? 0)}k</span>
          <span class="contract-row__progress">
            <span class="bar"><span class="bar__fill" style="width:${clamp((c.progress ?? 0) * 100, 0, 100)}%"></span></span>
            ${fmtPct(c.progress ?? 0, 0)}
          </span>
          <span class="contract-row__quality">${fmtPct(c.quality ?? 0, 0)}</span>
        </li>
      `).join('')
    : `<li class="empty-row">暂无进行中的标注合约。</li>`;

  return `
    <h2 class="tab-panel__title">数据与标注</h2>
    <p class="tab-panel__text">
      采集、清洗、标注与合成数据。数据决定能力上限，也决定数据枯竭与法律曝光的增长。
    </p>

    <section class="card">
      <header class="card__header">
        <h3>数据仓库</h3>
        <span class="hint">${(s.datasets || []).length} 个数据集</span>
      </header>
      <table class="table">
        <thead>
          <tr>
            <th>名称</th><th>格式</th><th>规模</th><th>品质${App.ui.researchView ? '（显示/真实）' : ''}</th>
            <th>新颖度</th><th>使用次数</th><th>权利</th><th>来源</th>
          </tr>
        </thead>
        <tbody>${datasetsHtml}</tbody>
      </table>
    </section>

    <section class="card">
      <header class="card__header">
        <h3>季度数据市场（${market.length} / 6）</h3>
        <button class="btn btn--ghost btn--small" data-action="refresh-market">刷新市场</button>
      </header>
      <div class="grid-3">${marketHtml}</div>
      ${mgHtml}
    </section>

    <section class="card">
      <header class="card__header">
        <h3>委托标注团队</h3>
        <span class="hint">品质 = f(团队, 方法, 公平报酬, 金标比例, 独立审计)</span>
      </header>
      <div class="grid-3">
        <label class="field">
          <span class="field-label">标注团队</span>
          <select class="input" data-ann-field="teamId">
            <option value="">选择团队…</option>
            ${teams.map(t => `<option value="${esc(t.id)}" ${annDraft.teamId === t.id ? 'selected' : ''}>${esc(t.name || t.id)}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span class="field-label">标注方法</span>
          <select class="input" data-ann-field="methodId">
            <option value="">选择方法…</option>
            ${labels.map(l => `<option value="${esc(l.id)}" ${annDraft.methodId === l.id ? 'selected' : ''}>${esc(l.name || l.id)}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span class="field-label">规模 (k)</span>
          <input type="number" class="input" min="10" max="1000" step="10"
                 data-ann-field="size_k" value="${esc(annDraft.size_k)}"/>
        </label>
      </div>
      <div class="grid-3">
        <label class="field">
          <span class="field-label">公平报酬 ${fmtPct(annDraft.fair_pay_ratio, 0)}</span>
          <input type="range" class="input input--range" min="0" max="1" step="0.05"
                 data-ann-field="fair_pay_ratio" value="${esc(annDraft.fair_pay_ratio)}"/>
        </label>
        <label class="field">
          <span class="field-label">金标检查 ${fmtPct(annDraft.gold_check_ratio, 0)}</span>
          <input type="range" class="input input--range" min="0" max="0.5" step="0.01"
                 data-ann-field="gold_check_ratio" value="${esc(annDraft.gold_check_ratio)}"/>
        </label>
        <label class="field">
          <span class="field-label">独立审计 ${fmtPct(annDraft.independent_audit_ratio, 0)}</span>
          <input type="range" class="input input--range" min="0" max="0.5" step="0.01"
                 data-ann-field="independent_audit_ratio" value="${esc(annDraft.independent_audit_ratio)}"/>
        </label>
      </div>
      ${draftPreview}
      <div class="actions-row">
        <button class="btn btn--primary" data-action="start-annotation" ${gs()?.main_action_used ? 'disabled' : ''}>启动标注合约</button>
        <button class="btn btn--ghost" data-action="advance-annotations">推进合约（每回合结算）</button>
      </div>

      <h4>进行中的合约</h4>
      <ul class="contract-list">${contractsHtml}</ul>
    </section>
  `;
}

function renderMiniGame(mg) {
  const titles = { course: '挑课程', dedupe: '找重复', inspect: '抽检桌', road: '数据公路' };
  const title = titles[mg.kind] || '数据小游戏';
  const remaining = Math.max(0, Math.ceil(mg.remaining || 0));
  return `
    <div class="minigame" data-minigame>
      <header class="minigame__header">
        <b>${esc(title)}</b>
        <span class="minigame__timer">倒计时 ${remaining}s</span>
      </header>
      <div class="minigame__board">
        ${renderMiniGameBoard(mg)}
      </div>
      <footer class="minigame__foot">
        <button class="btn btn--ghost btn--small" data-action="minigame-cancel">放弃（改走自动委托）</button>
      </footer>
    </div>
  `;
}

function renderMiniGameBoard(mg) {
  if (mg.kind === 'course') {
    const good = mg.answer ?? Math.floor(Math.random() * 6);
    return ['预训练基线', '长文回放', '多语对话', '指令微调', '代码多轮', '工具调用'].map((n, i) => `
      <button class="minigame-tile" data-action="minigame-pick" data-value="${i}">
        ${esc(n)}
      </button>
    `).join('');
  }
  if (mg.kind === 'dedupe') {
    return `<div class="minigame-pairs">
      ${Array.from({ length: 6 }).map((_, i) => `
        <button class="minigame-pair" data-action="minigame-dedupe" data-value="${i}">样本 ${i + 1}</button>
      `).join('')}
    </div>`;
  }
  if (mg.kind === 'inspect') {
    return ['正常', '正常', '异常', '正常', '正常', '异常'].map((label, i) => `
      <button class="minigame-inspect" data-action="minigame-inspect" data-value="${i}">样本 ${i + 1}</button>
    `).join('');
  }
  return `
    <div class="minigame-road">
      ${['起点', '清洗', '去重', '对齐', '封存'].map((n, i) => `
        <button class="minigame-step" data-action="minigame-road" data-value="${i}">${esc(n)}</button>
      `).join('')}
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* 14c. Prep tab                                                               */
/* -------------------------------------------------------------------------- */

function renderPrepTab() {
  const s = gs(); if (!s) return '';
  const m = activeModel();

  const cps = (m.checkpoints || []).map((cp, i) => `
    <li class="cp-row" data-cp="${esc(cp.id)}">
      <span class="cp-row__label">${esc(cp.label || `快照 ${i + 1}`)}</span>
      <span class="cp-row__turn">T${cp.created_turn ?? cp.turn ?? 0} · 间隔 ${cp.interval ?? m.checkpoint_interval_actions}</span>
      <span class="cp-row__action">
        <button class="btn btn--ghost btn--small" data-action="rollback-cp" data-id="${esc(cp.id)}">回滚到此快照</button>
      </span>
    </li>
  `).join('') || `<li class="empty-row">模型尚无任何快照。</li>`;

  const previewRest = typeof previewRestAndPrep === 'function'
    ? (safeCall('preview rest', () => previewRestAndPrep(s)) || {})
    : {};
  const restCost = previewRest.cost_kc ?? 8;
  const restReadiness = previewRest.readiness_gain ?? 35;
  const restOpt = previewRest.optimizer_gain ?? 10;
  const cardBonus = (s.support_card_ids || []).includes('card_3am_ops');

  const cards = cardList();
  const myCards = s.support_card_ids || [];

  const mentorOptions = historyList();
  const mentorFrom = App.ui.prep.mentorFrom;

  const currentCompute = s.cluster_compute_cu || 0;
  const currentMemory = s.cluster_memory_gb || 0;
  const defense = s.defense_level || 1;

  return `
    <h2 class="tab-panel__title">整备与快照</h2>
    <p class="tab-panel__text">
      升级基础设施、偿还技术债、保存快照。快照可以在事故后回滚，但会消耗资金与回合资源。
    </p>

    <section class="card">
      <header class="card__header">
        <h3>集群整备</h3>
        <span class="hint">恢复就绪度、清理优化器</span>
      </header>
      <div class="kv-row">
        <div class="kv"><span>资金</span><b>${fmtKc(restCost)}</b></div>
        <div class="kv"><span>就绪度增益</span><b>+${Math.max(0,Math.min(100-s.cluster_readiness,restReadiness))}</b></div>
        <div class="kv"><span>优化器健康</span><b>+${restOpt}</b></div>
      </div>
      <div class="actions-row">
        <button class="btn btn--primary" data-action="do-rest" ${gs()?.main_action_used ? 'disabled' : ''}>执行整备</button>
      </div>
    </section>

    <section class="card">
      <header class="card__header">
        <h3>检查点与回滚</h3>
        <span class="hint">回滚模型到安全点（不还原资金 / 法律档案 / 溯源）</span>
      </header>
      <div class="grid-2">
        <label class="field">
          <span class="field-label">检查点间隔</span>
          <select class="input" data-prep-field="cp_interval">
            ${[1, 2, 4].map(n => `<option value="${n}" ${m.checkpoint_interval_actions === n ? 'selected' : ''}>每 ${n} 次行动自动快照</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span class="field-label">已积行动</span>
          <input class="input" disabled value="${m.actions_since_checkpoint || 0} / ${m.checkpoint_interval_actions || 2}"/>
        </label>
      </div>
      <ul class="cp-list">${cps}</ul>
      <p class="hint">
        注意：回滚<b>不会</b>恢复累计资金、法律档案与数据集溯源记录——它们代表已经发生的支出与风险。
      </p>
    </section>

    <section class="card">
      <header class="card__header">
        <h3>支援卡 · 卡组编辑</h3>
        <span class="hint">当前 ${myCards.length} / 4 张</span>
      </header>
      <div class="deck-editor">
        ${[0, 1, 2, 3].map(slot => {
          const id = myCards[slot];
          const c = id ? CARD_BY_ID[id] : null;
          return `
            <label class="field">
              <span class="field-label">槽位 ${slot + 1}</span>
              <select class="input" data-prep-field="card_slot_${slot}">
                <option value="">（空）</option>
                ${cards.map(card => `<option value="${esc(card.id)}" ${id === card.id ? 'selected' : ''}>${esc(card.name || card.id)}</option>`).join('')}
              </select>
            </label>
          `;
        }).join('')}
      </div>
      <div class="actions-row">
        <button class="btn btn--primary" data-action="save-cards">保存卡组</button>
      </div>
    </section>

    <section class="card">
      <header class="card__header">
        <h3>导师继承</h3>
        <span class="hint">从已封存模型或历史人物继承 / 提升谱系</span>
      </header>
      <div class="grid-2">
        <label class="field">
          <span class="field-label">从哪位导师继承</span>
          <select class="input" data-prep-field="mentor_from">
            <option value="">选择导师…</option>
            ${mentorOptions.map(h => `<option value="${esc(h.id)}" ${mentorFrom === h.id ? 'selected' : ''}>${esc(h.name || h.id)}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span class="field-label">目标槽位</span>
          <select class="input" data-prep-field="mentor_slot">
            <option value="0">槽位 1</option>
            <option value="1">槽位 2</option>
          </select>
        </label>
      </div>
      ${mentorFrom && typeof calculateMentorInheritance === 'function' ? (() => {
        const inh = safeCall('mentor preview', () => calculateMentorInheritance(s, mentorFrom)) || {};
        return `
          <div class="kv-row">
            <div class="kv"><span>继承加成</span><b>${esc(inh.summary || '—')}</b></div>
          </div>
        `;
      })() : ''}
      <div class="actions-row">
        <button class="btn btn--primary" data-action="do-inherit">应用导师继承</button>
      </div>
    </section>

    <section class="card">
      <header class="card__header">
        <h3>集群扩展与防御</h3>
        <span class="hint">当前：${fmtCu(currentCompute)} · ${fmtGB(currentMemory)} · 防御 Lv${defense}</span>
      </header>
      <div class="grid-3">
        <div class="upgrade-tile">
          <h4>算力升级 +16 CU</h4>
          <p class="hint">花费 ¥24k · 提升训练与参赛上限</p>
          <button class="btn btn--primary" data-action="expand-compute">升级算力</button>
        </div>
        <div class="upgrade-tile">
          <h4>内存升级 +128 GB</h4>
          <p class="hint">花费 ¥18k · 降低 OOM 风险</p>
          <button class="btn btn--primary" data-action="expand-memory">升级内存</button>
        </div>
        <div class="upgrade-tile">
          <h4>防御等级 +1</h4>
          <p class="hint">花费 ¥16k · 降低法律曝光与安全漏洞</p>
          <button class="btn btn--primary" data-action="expand-defense">升级防御</button>
        </div>
      </div>
    </section>
  `;
}

/* -------------------------------------------------------------------------- */
/* 14d. Race tab                                                               */
/* -------------------------------------------------------------------------- */

function renderRaceTab() {
  const s = gs(); if (!s) return '';
  const uiRace = App.ui.race;

  const schedule = [6, 12, 18, 24].map(t => {
    const cur = ((s.turn || 1) - 1) % 24 + 1;
    const passed = cur > t;
    const next = cur <= t;
    return `
      <span class="cup-chip ${passed ? 'is-passed' : next ? 'is-next' : ''}">
        <span class="cup-chip__turn">T${t}</span>
        <span class="cup-chip__label">${passed ? '已结束' : next ? t === cur ? '本回合' : `${t - cur} 回合后` : '待开启'}</span>
      </span>
    `;
  }).join('');

  const benches = benchList().map(b => {
    const eligible = !b.required_stat || (activeModel().stats?.[b.required_stat] || 0) >= (b.required_min || 0);
    return `
      <label class="tile tile--radio ${uiRace.benchmarkId === b.id ? 'is-active' : ''} ${eligible ? '' : 'is-locked'}">
        <input type="radio" name="benchmark-pick" data-race-field="benchmarkId" value="${esc(b.id)}"
               ${uiRace.benchmarkId === b.id ? 'checked' : ''} ${eligible ? '' : 'disabled'}/>
        <span class="tile__title">${esc(b.name || b.id)}</span>
        <span class="tile__meta">${esc(b.family || '综合')} · 权重 ${fmtNum(b.weight ?? 1, 2)}</span>
        <span class="tile__desc">${esc((b.description || '').slice(0, 60))}</span>
      </label>
    `;
  }).join('');

  const preview = App.ui.race.preview || {};
  const lastResult = App.ui.race.lastResult;

  const previewHtml = preview && Object.keys(preview).length ? `
    <div class="preview-panel__grid">
      <div class="kv"><span>官方得分</span><b>${fmtNum(preview.official_score ?? 0,1)}</b></div>
      <div class="kv"><span>公开得分</span><b>${fmtNum(preview.public_score ?? 0, 1)}</b></div>
      <div class="kv"><span>隐藏得分</span><b>${App.ui.researchView ? fmtNum(preview.hidden_score ?? 0, 1) : '???'}</b></div>
      <div class="kv"><span>预计算力</span><b>${fmtCu(preview.compute_used_cu ?? 0)}</b></div>
      <div class="kv"><span>预算倍率</span><b>${fmtNum(preview.league_mult ?? 1, 2)}</b></div>
      <div class="kv"><span>思维倍率</span><b>${fmtNum(preview.thinking_mult ?? 1, 2)}</b></div>
    </div>
  ` : '';

  return `
    <h2 class="tab-panel__title">赛事竞技</h2>
    <p class="tab-panel__text">报名排行榜、基准评测与公开赛。参赛提升声誉，但也会放大对齐与安全上的失误。</p>

    <section class="card">
      <header class="card__header">
        <h3>杯赛日程</h3>
        <span class="hint">每赛季第 6 / 12 / 18 / 24 回合</span>
      </header>
      <div class="cup-bar">${schedule}</div>
    </section>

    <section class="card">
      <header class="card__header">
        <h3>赛事配置</h3>
      </header>
      <div class="grid-3">
        <label class="field">
          <span class="field-label">联赛等级</span>
          <select class="input" data-race-field="league_tier">
            ${LEAGUE_TIERS.map(t => `<option value="${t}" ${uiRace.league_tier === t ? 'selected' : ''}>${t} (×${fmtNum(LEAGUE_BUDGET_MULTIPLIERS?.[t] ?? 1, 2)})</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span class="field-label">思维模式</span>
          <select class="input" data-race-field="thinking_mode">
            ${THINKING_MODES.map(t => `<option value="${t}" ${uiRace.thinking_mode === t ? 'selected' : ''}>${t} (×${fmtNum(THINKING_MULTIPLIERS?.[t] ?? 1, 2)})</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span class="field-label">去噪步数（diffusion 家族）</span>
          <select class="input" data-race-field="denoise_steps">
            ${[8, 16, 32].map(n => `<option value="${n}" ${uiRace.denoise_steps === n ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
        </label>
      </div>
      <label class="check">
        <input type="checkbox" data-race-field="auto_skill" ${uiRace.auto_skill ? 'checked' : ''}/>
        <span>自动释放技能（关闭后在回放中手动触发）</span>
      </label>
      <h4>可选基准（12 项）</h4>
      <div class="grid-3">${benches}</div>
    </section>

    <section class="preview-panel">
      <header class="preview-panel__header"><h3>预览</h3></header>
      ${previewHtml || '<p class="hint">选择一个基准并点击「预览」查看结果。</p>'}
    </section>

    <div class="actions-row">
      <button class="btn btn--ghost" data-action="preview-race">预览</button>
      <button class="btn btn--primary btn--large" data-action="start-race" ${gs()?.main_action_used ? 'disabled' : ''}>
        报名并开始比赛
      </button>
    </div>

    ${lastResult ? `
      <section class="card">
        <header class="card__header"><h3>上一场比赛</h3></header>
        <div class="kv-row">
          <div class="kv"><span>官方得分</span><b>${fmtNum(lastResult.official_score ?? 0,1)}</b></div>
          <div class="kv"><span>公开得分</span><b>${fmtNum(lastResult.public_score ?? 0, 1)}</b></div>
          <div class="kv"><span>声誉增益</span><b>${fmtSigned(lastResult.reputation_gain ?? 0, 0)}</b></div>
        </div>
      </section>
    ` : ''}
  `;
}

/* -------------------------------------------------------------------------- */
/* 14e. Company tab                                                            */
/* -------------------------------------------------------------------------- */

function renderCompanyTab() {
  const s = gs(); if (!s) return '';
  const section = App.ui.company.section || 'product';

  const subnav = `
    <nav class="subnav" aria-label="实验室分类">
      ${[
        ['product', '模型服务'],
        ['compute', '算力来源'],
        ['routing', '路由策略'],
        ['applications', '应用与网关'],
        ['legal', '口碑与诉讼'],
        ['reports', '财报'],
        ['finance', '融资 · IPO · 证券'],
        ['research', '架构科研 · RSI'],
        ['sectors', '行业应用 · 经济环境'],
      ].map(([id, label]) => `
        <button class="subnav__item ${section === id ? 'is-active' : ''}" data-action="company-section" data-value="${id}" aria-current="${section===id?'page':'false'}">
          ${esc(label)}
        </button>
      `).join('')}
    </nav>
  `;

  let body = '';
  switch (section) {
    case 'product':  body = renderServiceDashboard(s); break;
    case 'compute': body = renderComputeSupply(s); break;
    case 'routing': body = renderModelRouting(s); break;
    case 'applications': body = renderApplicationAccess(s); break;
    case 'reports': body = renderBusinessReports(s); break;
    case 'finance':  body = renderCompanyFinance(); break;
    case 'research': body = renderCompanyResearch(); break;
    case 'legal':    body = renderServiceCommunity(s) + renderCompanyLegal(); break;
    case 'sectors':  body = renderCompanySectors(); break;
  }

  return `
    ${subnav}
    ${body}
  `;
}

function renderCompanyFinance() {
  const s = gs(); if (!s) return '';
  const privateFin = safeCall('pf preview', () => previewFinancing(s).privateFin) || {};
  const ipoPrev = safeCall('ipo preview', () => previewFinancing(s).ipo) || {};

  const securities = securityList().map(sec => {
    const owned = s.portfolio?.[sec.id];
    return `
      <tr>
        <td>${esc(sec.ticker || sec.id)}</td>
        <td>${esc(sec.name || '')}</td>
        <td>${fmtKc(sec.base_price ?? 0)}</td>
        <td>${fmtNum(sec.volatility ?? 0, 2)}</td>
        <td>${owned ? `${owned.shares} 股` : '—'}</td>
        <td>
          <button class="btn btn--ghost btn--small" data-action="trade-security" data-sec="${esc(sec.id)}" data-side="buy">买入</button>
          <button class="btn btn--ghost btn--small" data-action="trade-security" data-sec="${esc(sec.id)}" data-side="sell">卖出</button>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <section class="card">
      <header class="card__header">
        <h3>私募融资</h3>
      </header>
      <div class="kv-row">
        <div class="kv"><span>预计募资</span><b>${fmtKc(privateFin.net_proceeds_kc ?? 0)}</b></div>
        <div class="kv"><span>稀释比例</span><b>${fmtPct(privateFin.post_issue_fraction ?? 0, 1)}</b></div>
        <div class="kv"><span>投前估值</span><b>${fmtKc(privateFin.pre_money_kc ?? 0)}</b></div>
      </div>
      <div class="actions-row">
        <button class="btn btn--primary" data-action="do-private-fin">执行私募融资</button>
      </div>
    </section>

    <section class="card">
      <header class="card__header">
        <h3>IPO</h3>
      </header>
      <div class="kv-row">
        <div class="kv"><span>发行价</span><b>${fmtKc(ipoPrev.price_kc ?? 0)}</b></div>
        <div class="kv"><span>新股发行（稀释 15%）</span><b>${fmtPct(ipoPrev.new_shares_pct ?? 0.15, 0)}</b></div>
        <div class="kv"><span>预计募资</span><b>${fmtKc(ipoPrev.raised_kc ?? 0)}</b></div>
      </div>
      <div class="actions-row">
        <button class="btn btn--primary" data-action="do-ipo" ${s.ipo_done ? 'disabled' : ''}>
          ${s.ipo_done ? 'IPO 已完成' : '执行 IPO'}
        </button>
      </div>
    </section>

    <section class="card">
      <header class="card__header">
        <h3>证券投资（虚构）</h3>
        <span class="hint">单笔不超过现金 10%</span>
      </header>
      <table class="table">
        <thead>
          <tr><th>代码</th><th>名称</th><th>基准价</th><th>波动率</th><th>持仓</th><th>操作</th></tr>
        </thead>
        <tbody>${securities}</tbody>
      </table>
    </section>
  `;
}

function renderCompanyResearch() {
  const s = gs(); if (!s) return '';
  const stages = ['paper', 'toy_pilot', 'scale_pilot', 'production'];
  const nodes = nodeList();
  const stage = App.ui.codex.nodeStage || 'paper';

  const filtered = nodes.filter(n => (n.stage || 'paper') === stage);
  const projects = s.research_projects || {};

  const nodeHtml = filtered.map(n => {
    const state = projects[n.id] || {};
    const progress = clamp(state.progress ?? 0, 0, 1);
    const done = progress >= 1;
    return `
      <li class="node-row">
        <span class="node-row__name">${esc(n.name || n.id)}</span>
        <span class="node-row__stage">${esc(n.stage || '')}</span>
        <span class="node-row__bar"><span class="bar"><span class="bar__fill" style="width:${(progress * 100).toFixed(0)}%"></span></span></span>
        <span class="node-row__state">${done ? '已完成' : fmtPct(progress, 0)}</span>
        <span class="node-row__actions">
          <button class="btn btn--ghost btn--small" data-action="step-node" data-id="${esc(n.id)}">
            ${gs()?.main_action_used ? '行动已用' : '推进研究'}
          </button>
        </span>
      </li>
    `;
  }).join('') || `<li class="empty-row">该阶段暂无科研节点。</li>`;

  const hist = HISTORY_BY_ID[activeModel().history_id];
  const arches = archList();
  const switched = activeModel().architecture_id !== (hist?.default_architecture_id || arches[0]?.id);

  return `
    <section class="card">
      <header class="card__header">
        <h3>四阶段架构科研</h3>
        <span class="hint">paper → toy_pilot → scale_pilot → production</span>
      </header>
      <nav class="subnav">
        ${stages.map(st => `
          <button class="subnav__item ${stage === st ? 'is-active' : ''}" data-action="research-stage" data-value="${st}">${esc(st)}</button>
        `).join('')}
      </nav>
      <ul class="node-list">${nodeHtml}</ul>
    </section>

    <section class="card">
      <header class="card__header">
        <h3>架构切换</h3>
      </header>
      <div class="grid-3">
        ${arches.map(a => `
          <button class="tile ${activeModel().architecture_id === a.id ? 'is-active' : ''}" data-action="switch-arch" data-id="${esc(a.id)}">
            <span class="tile__title">${esc(a.name || a.id)}</span>
            <span class="tile__meta">${esc(a.tier || 'T?')} · ${a.total_params_b ?? 0}B / ${a.active_params_b ?? 0}B</span>
            <span class="tile__desc">${esc((a.description || '').slice(0, 60))}</span>
          </button>
        `).join('')}
      </div>
    </section>

    <section class="card">
      <header class="card__header">
        <h3>RSI 实验室</h3>
        <span class="hint">递归自我改进实验：可能获得巨大增益，也可能带来风险</span>
      </header>
      <div class="kv-row">
        <div class="kv"><span>实验进度</span><b>${(s.milestone_state?.rsi_cycles ?? 0)} 次</b></div>
        <div class="kv"><span>证据链</span><b>${(s.milestone_state?.rsi_evidence || []).length} 项</b></div>
      </div>
      <div class="actions-row">
        <button class="btn btn--primary" data-action="run-rsi">运行 RSI 实验周期</button>
      </div>
    </section>
  `;
}

function renderCompanyLegal() {
  const cases = gs().legal?.cases || [];
  const exposures = (gs().legal_exposures || []).filter(e => e.kind !== 'misleading_claims');
  if (!cases.length && !exposures.length) return '';
  return `<section class="card"><header class="card__header"><h3>其他法律档案</h3></header>${exposures.map(e=>`<p class="biz-footnote">${esc(e.kind)} · 风险 ${Math.round(e.severity||0)} · ${e.remediated?'已整改':'仍需处理'}</p>`).join('')}${cases.map(c=>`<div class="biz-contract"><div><strong>${esc(c.title||c.id)}</strong><span>${c.status==='open'?'在办':'已结案'} · 基准赔款 ${fmtKc(c.fine_kc_base||0)}</span></div>${c.status==='open'?`<button class="btn btn--ghost btn--small" data-action="resolve-legal" data-id="${esc(c.id)}" data-choice="settle">和解</button>`:''}</div>`).join('')}</section>`;
}

function renderCompanySectors() {
  const s = gs(); if (!s) return '';

  const sectors = sectorList().map(sec => {
    const st = s.job_sectors?.[sec.id] || {};
    const progress = clamp(st.progress ?? 0, 0, 1);
    return `
      <li class="sector-row">
        <span class="sector-row__name">${esc(sec.name || sec.id)}</span>
        <span class="sector-row__cat">${esc(sec.category || '—')}</span>
        <span class="sector-row__bar"><span class="bar"><span class="bar__fill" style="width:${(progress * 100).toFixed(0)}%"></span></span></span>
        <span class="sector-row__pct">${fmtPct(progress, 0)}</span>
      </li>
    `;
  }).join('');

  const realized = s.realized_automation_share ?? 0;
  const dividend = s.automation_dividend_ratio ?? 0.3;

  const ms = s.milestone_state || {};
  const msList = ['agi', 'asi', 'rsi'];
  const msHtml = msList.map(k => {
    const has = !!(ms[k] || (ms.evidence && ms.evidence.includes(k)));
    return `
      <label class="check">
        <input type="checkbox" ${has ? 'checked' : ''} disabled/>
        <span>${esc(k.toUpperCase())} 证据链 ${has ? '已确认' : '未确认'}</span>
      </label>
    `;
  }).join('');

  return `
    <section class="card">
      <header class="card__header">
        <h3>20 职业自动化终验</h3>
        <span class="hint">realized ${fmtPct(realized, 1)} · dividend ${fmtPct(dividend, 0)}</span>
      </header>
      <input type="range" class="input input--range" min="0" max="1" step="0.05"
             data-action="dividend-slider" value="${esc(dividend)}"/>
      <ul class="sector-list">${sectors}</ul>
    </section>

    <section class="card">
      <header class="card__header">
        <h3>AGI / ASI / RSI 里程碑</h3>
      </header>
      ${msHtml}
      <div class="actions-row">
        <button class="btn btn--primary" data-action="update-milestones">刷新里程碑</button>
      </div>
    </section>

    <section class="card">
      <header class="card__header">
        <h3>AI 泡沫监测</h3>
        <span class="hint">当前泡沫压力 ${Math.round(s.bubble_pressure ?? 0)} · 阶段 ${esc(s.bubble_phase || 'normal')}</span>
      </header>
      <div class="bar bar--large"><span class="bar__fill" style="width:${clamp(s.bubble_pressure ?? 0, 0, 100)}%"></span></div>
      <div class="actions-row">
        <button class="btn btn--ghost" data-action="update-bubble">刷新泡沫状态</button>
      </div>
    </section>
  `;
}

/* -------------------------------------------------------------------------- */
/* 14f. Codex tab                                                              */
/* -------------------------------------------------------------------------- */

function renderCodexTab() {
  const state=gs(); if(!state) return '';
  const sub=App.ui.codex.subTab || 'characters';
  const selected=App.ui.codex.historyId || activeModel().history_id;
  const history=HISTORY_BY_ID[selected] || historyList()[0];
  const interpretation=history.tabs?.role_interpretation || {};
  const guide=history.tabs?.branch_guide || {};
  const facts=history.tabs?.history_fact || {};
  const textBlock=block=>`<p>${esc(block.summary || '')}</p>${block.bullets?.length?`<ul class="lore-bullets">${block.bullets.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:''}`;
  const picker=`<div class="history-grid">${historyList().map(h=>`<button class="history-pick ${selected===h.id?'is-active':''}" data-action="codex-pick-history" data-id="${esc(h.id)}" aria-pressed="${selected===h.id}"><strong>${esc(h.family_name)}</strong><small>${esc(h.persona_name)}</small></button>`).join('')}</div>`;
  let body='';
  if(sub==='characters') { body=renderCharacterCollection(); } else if(sub==='personal') {
    body=renderPersonalChronicle(state,App.ui.codex.personalHistoryId);
  } else if(sub==='tree') {
    const archives=state.archived_models || [];
    body=`<section class="card"><h3>我们走过的版本</h3><ul class="archive-tree">${archives.length?archives.map(m=>`<li class="archive-node"><strong>${esc(m.display_name || m.model_id)}</strong><span>第 ${m.generation_index || 1} 代 · ${Object.values(m.stats || {}).reduce((a,b)=>a+Number(b||0),0).toFixed(0)} 能力总值</span></li>`).join(''):'<li class="empty-row">这里还没有封存的模型版本。</li>'}</ul></section>`;
  } else {
    body=picker+`<section class="card codex-detail"><header class="card__header"><h3>${esc(history.family_name)}</h3><span class="tiny-badge">${esc(history.persona_name)}</span></header>${textBlock(sub==='roleplay'?interpretation:facts)}${sub==='roleplay'?`<div class="divider"></div><h4>给下一版的一点建议</h4>${textBlock(guide)}`:''}</section>`;
  }
  return `<h2 class="tab-panel__title">模型图鉴</h2><p class="tab-panel__text">每一条谱系，都有属于它的成长方式。</p><nav class="subnav"><button class="subnav__item ${sub==='characters'?'is-active':''}" data-action="codex-sub" data-value="characters">伙伴图鉴</button><button class="subnav__item ${sub==='personal'?'is-active':''}" data-action="codex-sub" data-value="personal">个人事件</button><button class="subnav__item ${sub==='real'?'is-active':''}" data-action="codex-sub" data-value="real">谱系档案</button><button class="subnav__item ${sub==='roleplay'?'is-active':''}" data-action="codex-sub" data-value="roleplay">成长指引</button><button class="subnav__item ${sub==='tree'?'is-active':''}" data-action="codex-sub" data-value="tree">版本记录</button></nav>${body}<section class="card codex-extra"><header class="card__header"><h3>八段旅程 · 赛季章节</h3></header><ol class="chapter-list">${chapterList().map(ch=>`<li><strong>${esc(ch.name)}</strong><p>${esc(ch.description)}</p></li>`).join('')}</ol></section><section class="card codex-extra"><header class="card__header"><h3>我们的旅程，会走向哪里</h3></header><ul class="ending-list">${endingList().map(e=>`<li><strong>${esc(e.name)}</strong><p>${esc(e.description)}</p></li>`).join('')}</ul></section><section class="card codex-extra"><header class="card__header"><h3>原项目参考资料</h3></header><ul class="source-list">${sourceList().map(src=>`<li><a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.title)}</a><span>${esc(src.publisher || '')} · ${src.year || ''}</span></li>`).join('')}</ul></section>`;
}

function renderSettingsTab() {
  const s = gs(); if (!s) return '';
  const byok = App.ui.settings;

  const audit = (s.audit_log || []);
  const processed = (s.processed_action_ids || []);

  return `
    <h2 class="tab-panel__title">BYOK 接口与回放日志</h2>
    <p class="tab-panel__text">配置自带密钥（BYOK）接口用于生成事件文本，并查看本局的确定性回放日志。</p>

    <section class="card">
      <header class="card__header">
        <h3>BYOK（自带密钥 · 可选）</h3>
        <span class="hint">仅保存在 sessionStorage；不写入存档 JSON；请求仅返回 { speaker_id, text, emotion }</span>
      </header>
      <label class="check">
        <input type="checkbox" data-settings-field="byokEnabled" ${byok.byokEnabled ? 'checked' : ''}/>
        <span>启用 AI 对话</span>
      </label>
      <div class="grid-3">
        <label class="field">
          <span class="field-label">兼容接口地址</span>
          <input type="url" class="input" data-settings-field="byokEndpoint"
                 value="${esc(byok.byokEndpoint || '')}" placeholder="https://api.example.com/v1/chat/completions"/>
        </label>
        <label class="field">
          <span class="field-label">模型名称</span>
          <input type="text" class="input" data-settings-field="byokModel"
                 value="${esc(byok.byokModel || '')}" placeholder="gpt-4o-mini"/>
        </label>
        <label class="field">
          <span class="field-label">密钥</span>
          <input type="password" class="input" data-settings-field="byokKey"
                 placeholder="仅在本次会话内使用"/>
        </label>
      </div>
      <div class="actions-row">
        <button class="btn btn--primary" data-action="save-byok">保存对话设置</button>
        <button class="btn btn--ghost" data-action="test-byok">测试连接</button>
      </div>
      <p class="hint">${esc(byok.lastError || '')}</p>
      <p class="hint">
        关闭后使用本地台词。对话只影响角色的表达与表情，不会改变游戏数值；密钥在页面关闭后清除。
      </p>
    </section>

    <section class="card">
      <header class="card__header">
        <h3>确定性动作 ID</h3>
        <span class="hint">共 ${processed.length} 个</span>
      </header>
      <ul class="processed-list">
        ${processed.length ? processed.slice(-40).reverse().map(id => `<li>${esc(id)}</li>`).join('') : '<li class="empty-row">暂无已处理动作。</li>'}
      </ul>
    </section>

    <section class="card">
      <header class="card__header">
        <h3>审计日志</h3>
      </header>
      <ul class="audit-log">
        ${audit.length ? audit.slice(-60).reverse().map(e => `
          <li><span class="hint">[${esc(e.turn ?? '?')}]</span> ${esc(e.text || e.message || JSON.stringify(e))}</li>
        `).join('') : '<li class="empty-row">暂无日志。</li>'}
      </ul>
    </section>
  `;
}

/* -------------------------------------------------------------------------- */
/* 15. Event delegation                                                        */
/* -------------------------------------------------------------------------- */

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-action]');
  if (!t) return;
  const action = t.dataset.action;
  handleAction(action, t, ev);
});

document.addEventListener('input',ev=>{if(ev.target.matches('[data-roster-search]'))filterCharacterCollection(ev.target.closest('[data-roster-collection]'));});

document.addEventListener('change', (ev) => {
  if(ev.target.matches('[data-roster-category]')){filterCharacterCollection(ev.target.closest('[data-roster-collection]'));return;}
  if(ev.target.matches('[data-personal-history]')){App.ui.codex.personalHistoryId=ev.target.value;renderTabIfActive('codex');return;}
  const t = ev.target.closest('[data-train-field],[data-train-adv],[data-ann-field],[data-prep-field],[data-race-field],[data-settings-field]');
  if (t) handleInput(t);
});

function handleInput(el) {
  const name = el.dataset.trainField || el.dataset.annField || el.dataset.prepField || el.dataset.raceField || el.dataset.settingsField;
  const advKey = el.dataset.trainAdv;
  if (advKey) {
    const v = el.type === 'number' ? Number(el.value) : el.value;
    App.ui.train.advanced[advKey] = typeof v === 'number' && !Number.isNaN(v) ? v : 0;
    recomputeTrainingPreview();
    renderTabIfActive('train');
    return;
  }
  if (!name) return;

  if (el.dataset.trainField) {
    if (name === 'checkpoint_interval') activeModel().checkpoint_interval_actions = Number(el.value);
    else if (name === 'accept_legal_risk') App.ui.train.advanced.accept_legal_risk = el.checked;
    else if (el.type === 'checkbox') App.ui.train[name] = el.checked;
    else App.ui.train[name] = el.value;
    if (name === 'recipeId') {
      const format = RECIPE_BY_ID[el.value]?.format;
      const compatible = gs().datasets.find(d => d.format === format && d.allowed_training !== false);
      if (compatible) App.ui.train.datasetId = compatible.id;
    }
    recomputeTrainingPreview();
    renderTabIfActive('train');
  } else if (el.dataset.annField) {
    const v = el.type === 'range' || el.type === 'number' ? Number(el.value) : el.value;
    App.ui.data.annotationDraft[name] = v;
    renderTabIfActive('data');
  } else if (el.dataset.prepField) {
    App.ui.prep[name] = el.value;
    if (name === 'cp_interval') activeModel().checkpoint_interval_actions = Number(el.value);
    if (name === 'mentor_from') App.ui.prep.mentorFrom = el.value;
  } else if (el.dataset.raceField) {
    if (el.type === 'checkbox') App.ui.race[name] = el.checked;
    else App.ui.race[name] = el.value;
    doPreviewRace();
  } else if (el.dataset.settingsField) {
    if (el.type === 'checkbox') App.ui.settings[name] = el.checked;
    else App.ui.settings[name] = el.value;
  }
}

function renderTabIfActive(tab) {
  if (App.ui.activeTab === tab) renderActiveTab();
  if (tab === 'train') { renderStatsPanel(); renderTurnPreview(); }
}

function handleAction(action, el, ev) {
  if (action.startsWith('business-')) { handleBusinessAction(action, el); return; }
  switch (action) {
    /* Top HUD ------------------------------------------------------------- */
    case 'open-partners': openPartners(); break;
    case 'select-partner': { const p=PARTNERS[el.dataset.value]; if(!p||!isModelCharacter(p.id))break;App.ui.partnerId=p.id;App.emotion='neutral';App.dialogue={speaker:p.name,text:p.quote};savePrefs();closeTopModal();renderCharacterStage();renderTabIfActive('codex');break; }
    case 'open-npc': openNpcProfile(el.dataset.value); break;
    case 'npc-workspace': { const profile=NPC_PROFILES[el.dataset.value];if(!profile)break;closeTopModal();App.ui.company.section=profile.section;switchTab('company');break; }
    case 'open-overview': openOverview(); break;
    case 'open-art-credits': openArtCredits(); break;
    case 'pick-new-profile': App.pendingNewGame.profileId = el.dataset.value; App.pendingNewGame.historyId = profileList().find(p => p.id === el.dataset.value)?.default_history_id; refreshNewGameModal(); break;
    case 'pick-new-history': App.pendingNewGame.historyId = el.dataset.value; refreshNewGameModal(); break;
    case 'confirm-new-game': startNewGame(App.pendingNewGame.profileId, App.pendingNewGame.historyId); closeTopModal(); break;
    case 'toggle-research':   App.ui.researchView = !App.ui.researchView; savePrefs(); rerenderAll(); break;
    case 'toggle-tutorial':   toggleTutorial(); break;
    case 'open-new-game':     openNewGameModal(); break;
    case 'export-save':       exportSave(); break;
    case 'open-import':       $('#import-save-input')?.click(); break;

    /* Main tabs ---------------------------------------------------------- */
    case 'switch-tab':        switchTab(el.dataset.value); break;

    /* Train tab ---------------------------------------------------------- */
    case 'train-focus':       selectTrainingFocus(el.dataset.value); break;
    case 'train-preset':      App.ui.train.preset = el.dataset.value; applyPreset(App.ui.train.preset); recomputeTrainingPreview(); renderTabIfActive('train'); break;
    case 'train-recipe':      App.ui.train.recipeId = el.dataset.value; recomputeTrainingPreview(); renderTabIfActive('train'); break;
    case 'toggle-train-adv':  ev.preventDefault(); App.ui.train.advancedOpen = !App.ui.train.advancedOpen; renderTabIfActive('train'); break;
    case 'preview-training':  recomputeTrainingPreview(); renderTabIfActive('train'); break;
    case 'run-training':      runTraining(); break;
    case 'stats-detail': openStatDetails(); break;

    /* Data tab ----------------------------------------------------------- */
    case 'refresh-market':    doRefreshMarket(); break;
    case 'acquire-offer':     doAcquireOffer(Number(el.dataset.index)); break;
    case 'auto-delegate':     doAutoDelegate(Number(el.dataset.index)); break;
    case 'start-minigame':    doStartMiniGame(Number(el.dataset.index)); break;
    case 'minigame-cancel':   cancelMiniGame(); break;
    case 'minigame-pick':
    case 'minigame-dedupe':
    case 'minigame-inspect':
    case 'minigame-road':     miniGamePick(action, Number(el.dataset.value)); break;
    case 'start-annotation':  doStartAnnotation(); break;
    case 'advance-annotations': doAdvanceAnnotations(); break;

    /* Prep tab ----------------------------------------------------------- */
    case 'do-rest':           doRestAndPrep(); break;
    case 'rollback-cp':       doRollback(el.dataset.id); break;
    case 'save-cards':        doSaveCards(); break;
    case 'open-card-editor':  openCardEditor(Number(el.dataset.slot)); break;
    case 'open-mentor-editor':openMentorEditor(Number(el.dataset.slot)); break;
    case 'do-inherit':        doInherit(); break;
    case 'expand-compute':    doExpand('compute'); break;
    case 'expand-memory':     doExpand('memory'); break;
    case 'expand-defense':    doExpand('defense'); break;

    /* Race tab ----------------------------------------------------------- */
    case 'preview-race':      doPreviewRace(); break;
    case 'start-race':        doStartRace(); break;
    case 'race-card-pick':    break;

    /* Company tab -------------------------------------------------------- */
    case 'company-section':   App.ui.company.section = el.dataset.value; renderTabIfActive('company'); break;
    case 'do-private-fin':    doPrivateFinancing(); break;
    case 'do-ipo':            doIPO(); break;
    case 'trade-security':    doTradeSecurity(el.dataset.sec, el.dataset.side); break;
    case 'research-stage':    App.ui.codex.nodeStage = el.dataset.value; renderTabIfActive('company'); break;
    case 'step-node':         doStepNode(el.dataset.id); break;
    case 'switch-arch':       doSwitchArch(el.dataset.id); break;
    case 'run-rsi':           doRunRsi(); break;
    case 'step-legal':        doStepLegal(); break;
    case 'resolve-legal':     doResolveLegal(el.dataset.id, el.dataset.choice); break;
    case 'dividend-slider':   break;
    case 'update-milestones': doUpdateMilestones(); break;
    case 'update-bubble':     doUpdateBubble(); break;

    /* Codex tab ---------------------------------------------------------- */
    case 'open-personal-archive': closeTopModal();App.ui.codex.subTab='personal';App.ui.codex.personalHistoryId=activeModel().history_id;switchTab('codex');break;
    case 'personal-open': openPersonalModelEvent(el.dataset.id);break;
    case 'personal-choice': choosePersonalModelEvent(el.dataset.id,el.dataset.choice);break;
    case 'codex-sub':         App.ui.codex.subTab = el.dataset.value; renderTabIfActive('codex'); break;
    case 'codex-pick-history':App.ui.codex.historyId = el.dataset.id; renderTabIfActive('codex'); break;

    /* Settings tab ------------------------------------------------------- */
    case 'save-byok':         doSaveByok(); break;
    case 'test-byok':         doTestByok(); break;

    /* Character ---------------------------------------------------------- */
    case 'char-speak':        charSpeak(); break;
    case 'open-free-dialogue':openFreeDialogueModal(); break;

    /* Tutorial ----------------------------------------------------------- */
    case 'tutorial-prev':     setTutorialStep(App.ui.tutorial.step - 1); break;
    case 'tutorial-next':     setTutorialStep(App.ui.tutorial.step + 1); break;
    case 'tutorial-skip':     endTutorial(); break;

    /* Modals ------------------------------------------------------------- */
    case 'modal-close':       closeTopModal(); break;
    case 'modal-confirm':     handleModalConfirm(el); break;
    case 'modal-choice':      handleModalChoice(el); break;

    /* Turn --------------------------------------------------------------- */
    case 'next-turn':         doNextTurn(); break;
    case 'race-toggle-speed': toggleRaceSpeed(); break;
    case 'race-skip-report':  skipRaceToReport(); break;
    case 'race-skill':        triggerRaceSkill(); break;
  }
}

/* -------------------------------------------------------------------------- */
/* 16. Tabs switching                                                          */
/* -------------------------------------------------------------------------- */

function switchTab(tab) {
  App.ui.activeTab = tab;
  $('#tab-content')?.scrollTo({top:0});
  savePrefs();
  renderActiveTab();
  if (tab === 'train') { recomputeTrainingPreview(); renderActiveTab(); renderStatsPanel(); }
  if (tab === 'data' && (gs()?.data_market || []).length === 0) doRefreshMarket();
  if (tab === 'race') doPreviewRace();
  renderStatsPanel(); renderTurnPreview();
  if (matchMedia('(max-width:900px)').matches) $('#action-column')?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
}

/* -------------------------------------------------------------------------- */
/* 17. Train tab logic                                                         */
/* -------------------------------------------------------------------------- */

function applyPreset(preset) {
  const a = App.ui.train.advanced;
  if (preset === 'steady') { a.epochs = 2; a.replay_ratio = 0.2; a.kl_strength = 0.05; a.mask_ratio = 0.15; }
  else if (preset === 'balanced') { a.epochs = 3; a.replay_ratio = 0.1; a.kl_strength = 0.02; a.mask_ratio = 0.15; }
  else if (preset === 'push') { a.epochs = 6; a.replay_ratio = 0.02; a.kl_strength = 0.005; a.mask_ratio = 0.1; }
}

function recomputeTrainingPreview() {
  const s = gs(); if (!s) return;
  const tr = App.ui.train;
  if (!tr.datasetId) tr.datasetId = (s.datasets || [])[0]?.id || null;
  if (!tr.recipeId) tr.recipeId = pickRecipeId(0);

  const req = typeof createTrainingRequest === 'function'
    ? safeCall('createTrainingRequest', () => createTrainingRequest(s, {
        recipe_id: tr.recipeId,
        focus_stat: tr.focus,
        preset: tr.preset,
        dataset_id: tr.datasetId,
        training_mode: tr.mode,
        epochs: tr.advanced.epochs,
        replay_ratio: tr.advanced.replay_ratio,
        batch_size: tr.advanced.batch_size,
        lora_rank: tr.advanced.lora_rank,
        group_size: tr.advanced.group_size,
        reasoning_budget_tokens: tr.advanced.reasoning_budget_tokens,
        kl_strength: tr.advanced.kl_strength,
        mask_ratio: tr.advanced.mask_ratio,
        denoise_steps: tr.advanced.denoise_steps,
        accept_legal_risk: tr.advanced.accept_legal_risk,
      }))
    : {
        recipe_id: tr.recipeId,
        focus_stat: tr.focus,
        preset: tr.preset,
        dataset_id: tr.datasetId,
        training_mode: tr.mode,
        ...tr.advanced,
      };

  if (!req) { App.ui.train.preview = null; return; }

  const prev = typeof previewTraining === 'function'
    ? safeCall('previewTraining', () => previewTraining(s, req))
    : null;
  App.ui.train.preview = prev || null;
}

function runTraining() {
  const s = gs(); if (!s) return;
  if (s.main_action_used) { toast('本回合主行动已使用', 'warn'); return; }
  recomputeTrainingPreview();
  const prev = App.ui.train.preview;
  if (prev && Array.isArray(prev.blockers) && prev.blockers.length) {
    toast('存在阻塞项，请先解决预览中的红色提示', 'error');
    return;
  }
  const tr = App.ui.train;
  const req = typeof createTrainingRequest === 'function'
    ? safeCall('createTrainingRequest', () => createTrainingRequest(s, {
        recipe_id: tr.recipeId,
        focus_stat: tr.focus,
        preset: tr.preset,
        dataset_id: tr.datasetId,
        training_mode: tr.mode,
        ...tr.advanced,
      }))
    : null;
  if (!req) { toast('无法构造训练请求', 'error'); return; }

  const res = typeof applyTraining === 'function'
    ? safeCall('applyTraining', () => applyTraining(s, req))
    : null;
  if (!res || res.last_action?.blocked) return;

  s.main_action_used = true;
  if (!Array.isArray(s.processed_action_ids)) s.processed_action_ids = [];
  s.processed_action_ids.push(`train:${s.turn}:${tr.recipeId}`);

  recomputeTrainingPreview();

  const failed = res.last_action?.success === false;
  App.dialogue = { speaker: '角色', text: failed ? '没关系，这次的挫折也会成为经验。休息一下，我们再来。' : '又学会了一点新的东西呢。你看，我们正在慢慢变好。' };
  App.emotion = failed ? 'worried' : 'happy';
  toast(failed ? '训练遇到挫折，已恢复检查点' : `训练完成 · 能力总计 +${fmtNum(res.last_action?.actual_gain || 0, 1)}`, failed ? 'warn' : 'success');
  saveToStorage();
  rerenderAll();
}

function maybeCheckpoint(s) {
  const m = s.active_model;
  m.actions_since_checkpoint = (m.actions_since_checkpoint || 0) + 1;
  const interval = m.checkpoint_interval_actions || 2;
  if (m.actions_since_checkpoint >= interval) {
    m.actions_since_checkpoint = 0;
    m.checkpoints = m.checkpoints || [];
    m.checkpoints.push({
      id: `cp-t${s.turn}-${m.checkpoints.length}`,
      turn: s.turn,
      label: `第 ${s.turn} 回合训练后`,
      interval,
      snapshot: deepCloneSafe(m),
    });
    if (m.checkpoints.length > 24) m.checkpoints.splice(1, m.checkpoints.length - 24);
    s.audit_log = s.audit_log || [];
    s.audit_log.push({ turn: s.turn, text: '自动快照已创建' });
  }
}

/* -------------------------------------------------------------------------- */
/* 18. Data tab logic                                                          */
/* -------------------------------------------------------------------------- */

function doRefreshMarket() {
  const s = gs(); if (!s) return;
  const res = typeof refreshDataMarket === 'function'
    ? safeCall('refreshDataMarket', () => refreshDataMarket(s))
    : null;
  if (res && Array.isArray(res.offers)) s.data_market = res.offers;
  else if (!Array.isArray(s.data_market) || s.data_market.length === 0) {
    /* Fallback: build a synthetic market from templates */
    const templates = datasetList().slice(0, 6);
    s.data_market = templates.map((tpl, i) => ({
      id: `offer-${s.turn}-${i}`,
      template_id: tpl.id,
      price_kc: tpl.base_price_kc ?? 12,
      records_k: tpl.records_k ?? 40,
      quality: tpl.quality ?? 0.5,
      true_quality: (tpl.quality ?? 0.5) * 0.85,
      rights_status: tpl.default_rights || 'unknown',
      provenance: tpl.provenance || '未知',
    }));
  }
  saveToStorage();
  renderTabIfActive('data');
  toast('数据市场已刷新', 'success');
}

function doAcquireOffer(index) {
  const state = gs(); if (!state) return;
  const result = purchaseDataset(state, state.data_market?.[index]);
  if (!result?.success) { toast(({action_used:'本回合已完成行动',insufficient_cash:'研究资金不足',rights_prohibited:'这份数据尚未获得训练授权'})[result?.reason] || '暂时无法采购这份数据', 'warn'); return; }
  App.emotion='happy'; App.dialogue={speaker:'角色',text:'新的语料到手了。把它们整理好，说不定就能发现新的可能性。'};
  saveToStorage(); rerenderAll(); toast('语料已入库，本回合采购完成', 'success');
}

function doAutoDelegate(index) {
  doAcquireOffer(index);
  
}

function doStartMiniGame(index) {
  const s = gs(); if (!s) return;
  const offer = s.data_market?.[index];
  if (!offer) return;
  const kinds = ['course', 'dedupe', 'inspect', 'road'];
  const kind = kinds[Math.floor(Math.random() * kinds.length)];

  const params = { kind, index, remaining: MINI_GAME_SECONDS, score: 0 };
  const res = typeof runDataMiniGame === 'function'
    ? safeCall('runDataMiniGame', () => runDataMiniGame(s, { kind, offer }))
    : null;
  if (res && typeof res === 'object') Object.assign(params, res);

  App.ui.data.miniGame = params;
  startMiniGameTimer();
  renderTabIfActive('data');
}

function startMiniGameTimer() {
  if (App._mgTimer) clearInterval(App._mgTimer);
  App._mgTimer = setInterval(() => {
    const mg = App.ui.data.miniGame;
    if (!mg) { clearInterval(App._mgTimer); return; }
    mg.remaining -= 1;
    if (mg.remaining <= 0) { cancelMiniGame(true); }
    else {
      const el = document.querySelector('.minigame__timer');
      if (el) el.textContent = `倒计时 ${Math.max(0, Math.ceil(mg.remaining))}s`;
    }
  }, 1000);
}

function cancelMiniGame(timedOut) {
  if (App._mgTimer) { clearInterval(App._mgTimer); App._mgTimer = null; }
  const mg = App.ui.data.miniGame;
  if (mg && !timedOut) toast('已放弃小游戏，可改为自动委托', 'info');
  App.ui.data.miniGame = null;
  renderTabIfActive('data');
}

function miniGamePick(action, value) {
  const mg = App.ui.data.miniGame;
  if (!mg) return;
  mg.score = (mg.score || 0) + 1;
  mg.lastPick = value;
  /* Draw-through: first correct pick removes a slot, then finish. */
  const bonus = clamp(0.05 + (mg.score || 0) * 0.01, 0, 0.10);
  const offer = gs().data_market?.[mg.index];
  if (offer) offer._bonus = bonus;
  if ((mg.score || 0) >= 2) {
    finishMiniGame(mg, bonus);
  } else {
    renderTabIfActive('data');
  }
}

function finishMiniGame(mg, bonus) {
  if (App._mgTimer) { clearInterval(App._mgTimer); App._mgTimer = null; }
  const offer = gs().data_market?.[mg.index];
  if (offer) { offer.bonus = bonus; toast(`小游戏完成：+${fmtPct(bonus, 1)} 加成`, 'success'); }
  App.ui.data.miniGame = null;
  renderTabIfActive('data');
}

function doStartAnnotation() {
  const s = gs(); if (!s) return;
  const d = App.ui.data.annotationDraft;
  if (!d.teamId || !d.methodId) { toast('请先选择团队与标注方法', 'error'); return; }
  const res = typeof startAnnotationContract === 'function'
    ? safeCall('startAnnotationContract', () => startAnnotationContract(s, { ...d }))
    : null;
  if (!res) {
    s.annotation_contracts = s.annotation_contracts || [];
    s.annotation_contracts.push({
      id: `ann-${s.turn}-${s.annotation_contracts.length}`,
      team_id: d.teamId, method_id: d.methodId, size_k: d.size_k,
      quality: 0.6, progress: 0, turns: 2,
    });
  }
  saveToStorage();
  renderTabIfActive('data');
  toast('标注合约已启动', 'success');
}

function doAdvanceAnnotations() {
  const s = gs(); if (!s) return;
  const res = typeof advanceAnnotationContracts === 'function'
    ? safeCall('advanceAnnotationContracts', () => advanceAnnotationContracts(s))
    : null;
  if (res && Array.isArray(res.completed)) {
    /* Fallback: completed handled by engine */
  }
  renderTabIfActive('data');
  toast('标注合约已推进', 'info');
}

/* -------------------------------------------------------------------------- */
/* 19. Prep tab logic                                                          */
/* -------------------------------------------------------------------------- */

function doRestAndPrep() {
  const s = gs(); if (!s) return;
  if (s.main_action_used) { toast('本回合主行动已使用', 'warn'); return; }
  const res = typeof applyRestAndPrep === 'function'
    ? safeCall('applyRestAndPrep', () => applyRestAndPrep(s))
    : null;
  if (res?.ok === false || res?.success === false || res?.last_action?.success === false) { toast('暂时无法整备，请检查资金与行动状态', 'warn'); return; }
  if (!res) {
    /* Fallback */
    const cost = 8;
    if ((s.cash_kc || 0) < cost) { toast('资金不足', 'error'); return; }
    s.cash_kc -= cost;
    s.cluster_readiness = clamp((s.cluster_readiness || 0) + 35, 0, 100);
    s.active_model.optimizer_health = clamp((s.active_model.optimizer_health || 0) + 10, 0, 100);
    if ((s.support_card_ids || []).includes('card_3am_ops')) {
      s.cluster_readiness = clamp((s.cluster_readiness || 0) + 10, 0, 100);
    }
  }
  s.main_action_used = true;
  App.dialogue = { speaker: '角色', text: '休息得很好。窗外的阳光，也正好呢。' };
  App.emotion = 'happy';
  recomputeTrainingPreview();
  saveToStorage();
  rerenderAll();
  toast('整备完成', 'success');
}

function doRollback(cpId) {
  const s = gs(); if (!s) return;
  const res = typeof rollbackModelToCheckpoint === 'function'
    ? safeCall('rollbackModelToCheckpoint', () => rollbackModelToCheckpoint(s, cpId))
    : null;
  if (!res) { toast('回滚失败', 'error'); return; }
  saveToStorage();
  rerenderAll();
  toast('已回滚到快照（资金 / 法律 / 溯源不回滚）', 'info');
}

function doSaveCards() {
  const s = gs(); if (!s) return;
  const ids = [];
  for (let i = 0; i < 4; i++) {
    const val = App.ui.prep[`card_slot_${i}`] ?? s.support_card_ids[i];
    if (val) ids.push(val);
  }
  if (ids.length > 4) ids.length = 4;
  const res = typeof updateSupportCardDeck === 'function'
    ? safeCall('updateSupportCardDeck', () => updateSupportCardDeck(s, ids))
    : null;
  if (!res || res.last_action?.success === false) {
    for(let i=0;i<4;i++) delete App.ui.prep[`card_slot_${i}`];
    toast('支援卡可在开局或赛季中段更换，当前卡组已保留','warn'); return;
  }
  saveToStorage();
  rerenderAll();
  toast('卡组已保存', 'success');
}

function openCardEditor(slot) {
  const cards = cardList();
  const current = gs()?.support_card_ids?.[slot];
  const modal = openModal({
    title: `编辑支援卡槽位 ${slot + 1}`,
    bodyHtml: `
      <ul class="modal-list">
        ${cards.map(c => `
          <li>
            <button class="modal-choice ${current === c.id ? 'is-active' : ''}"
                    data-action="modal-choice" data-kind="card" data-slot="${slot}" data-value="${esc(c.choice_id || c.id)}">
              <b>${esc(c.name || c.id)}</b>
              <span>${esc(c.description || '')}</span>
            </button>
          </li>
        `).join('')}
      </ul>
    `,
  });
}

function openMentorEditor(slot) {
  const hist = historyList();
  const current = gs()?.teacher_model_ids?.[slot];
  openModal({
    title: `编辑导师槽位 ${slot + 1}`,
    bodyHtml: `
      <ul class="modal-list">
        <li>
          <button class="modal-choice" data-action="modal-choice" data-kind="mentor" data-slot="${slot}" data-value="">
            <b>清空该槽位</b>
          </button>
        </li>
        ${hist.map(hh => `
          <li>
            <button class="modal-choice ${current === hh.id ? 'is-active' : ''}"
                    data-action="modal-choice" data-kind="mentor" data-slot="${slot}" data-value="${esc(hh.id)}">
              <b>${esc(hh.name || hh.id)}</b>
              <span>${esc(hh.tagline || '')}</span>
            </button>
          </li>
        `).join('')}
      </ul>
    `,
  });
}

function doInherit() {
  const s = gs(); if (!s) return;
  const from = App.ui.prep.mentor_from;
  if (!from) { toast('请先选择导师', 'error'); return; }
  const slot = Number(App.ui.prep.mentor_slot || 0);
  const res = typeof applyMentorSelection === 'function'
    ? safeCall('applyMentorSelection', () => applyMentorSelection(s, from, slot))
    : null;
  if (!res) {
    s.teacher_model_ids = s.teacher_model_ids || [];
    s.teacher_model_ids[slot] = from;
  }
  saveToStorage();
  rerenderAll();
  toast('已应用导师继承', 'success');
}

function doExpand(kind) {
  const s = gs(); if (!s) return;
  const costs = { compute: 24, memory: 18, defense: 16 };
  const cost = costs[kind] || 0;
  if ((s.cash_kc || 0) < cost) { toast('资金不足', 'error'); return; }
  s.cash_kc -= cost;
  if (kind === 'compute') s.cluster_compute_cu = (s.cluster_compute_cu || 0) + 16;
  if (kind === 'memory') s.cluster_memory_gb = (s.cluster_memory_gb || 0) + 128;
  if (kind === 'defense') s.defense_level = (s.defense_level || 1) + 1;
  saveToStorage();
  rerenderAll();
  toast(`已升级${kind === 'compute' ? '算力' : kind === 'memory' ? '内存' : '防御'}`, 'success');
}

/* -------------------------------------------------------------------------- */
/* 20. Race tab logic                                                          */
/* -------------------------------------------------------------------------- */

function doPreviewRace() {
  const s = gs(); if (!s) return;
  const uiRace = App.ui.race;
  if (!uiRace.benchmarkId) uiRace.benchmarkId = benchList()[0]?.id || null;

  const req = typeof createRaceRequest === 'function'
    ? safeCall('createRaceRequest', () => createRaceRequest(s, {
        league_tier: uiRace.league_tier,
        thinking_mode: uiRace.thinking_mode,
        denoise_steps: uiRace.denoise_steps,
        benchmark_id: uiRace.benchmarkId,
        auto_skill: uiRace.auto_skill,
      }))
    : {
        league_tier: uiRace.league_tier,
        thinking_mode: uiRace.thinking_mode,
        denoise_steps: uiRace.denoise_steps,
        benchmark_id: uiRace.benchmarkId,
        auto_skill: uiRace.auto_skill,
      };
  const prev = typeof previewRace === 'function'
    ? safeCall('previewRace', () => previewRace(s, req))
    : null;
  App.ui.race.preview = prev || null;
  renderTabIfActive('race');
}

function doStartRace() {
  const s = gs(); if (!s) return;
  if (s.main_action_used) { toast('本回合主行动已使用', 'warn'); return; }
  doPreviewRace();

  const uiRace = App.ui.race;
  const req = typeof createRaceRequest === 'function'
    ? safeCall('createRaceRequest', () => createRaceRequest(s, {
        league_tier: uiRace.league_tier,
        thinking_mode: uiRace.thinking_mode,
        denoise_steps: uiRace.denoise_steps,
        benchmark_id: uiRace.benchmarkId,
        auto_skill: uiRace.auto_skill,
      }))
    : null;
  if (!req) return;

  const sim = typeof simulateRace === 'function'
    ? safeCall('simulateRace', () => simulateRace(s, req))
    : null;
  if (!sim) return;

  s.cash_kc += Number(sim.prize_kc || 0);
  s.company.reputation = clamp(Number(s.company.reputation || 0) + Number(sim.reputation_gain || 0),0,100);
  App.emotion = 'determined';
  App.dialogue = {speaker:'角色',text:'终于站在赛场上了。无论结果如何，这都是属于我们的进步。'};
  /* Open replay modal */
  openRaceReplayModal(sim, req);
  s.main_action_used = true;

  if (!Array.isArray(s.processed_action_ids)) s.processed_action_ids = [];
  s.processed_action_ids.push(`race:${s.turn}:${uiRace.benchmarkId}`);

  const result = sim.result || sim;
  App.ui.race.lastResult = result;
  saveToStorage();
  rerenderAll();
}

function openRaceReplayModal(sim, req) {
  const events = sim.events || sim.race_events || (sim.card_log || []).map(c=>({kind:'task',label:STAT_LABELS[c.focus_stat] || '综合任务',public:c.public_points,hidden:c.hidden_points,success:c.success}));
  App.raceReplay = {
    sim, req,
    cursor: 0,
    speed: 1,
    events: Array.isArray(events) ? events : genFallbackRaceEvents(sim),
    playing: true,
  };
  const overlay = openModal({
    title: '属于我们的赛场',
    bodyHtml: raceReplayBody(),
    footerHtml: `
      <button class="btn btn--ghost" data-action="race-toggle-speed">切换速度</button>

      <button class="btn btn--primary" data-action="race-skip-report">跳到结算</button>
      <button class="btn btn--primary" data-action="modal-close">关闭</button>
    `,
    onClose: () => { App.raceReplay = null; App.emotion = 'happy'; renderCharacterStage(); },
  });
  startRaceReplayLoop();
}

function genFallbackRaceEvents(sim) {
  const benches = benchList().slice(0, 4);
  const base = sim.public_score ?? (sim.result?.public_score ?? 100);
  return benches.map((b, i) => ({
    kind: 'task',
    label: b.name || b.id,
    public: base * (0.8 + 0.05 * i),
    hidden: base * (0.6 + 0.03 * i),
  }));
}

function raceReplayBody() {
  const replay = App.raceReplay; if (!replay) return '';
  const result = replay.sim.result || replay.sim;
  const total = Math.max(1,replay.events.length); const progress=Math.min(1,(replay.cursor+1)/total);
  const complete = !replay.playing || progress>=1;
  const partner = currentPartner();
  const score = complete ? result.official_score : avgOf(replay.events.slice(0,replay.cursor+1).map(e=>(Number(e.public||0)*.6+Number(e.hidden||0)*.4)));
  return `<div class="race-replay"><div class="race-showcase"><div class="race-showcase__avatar"><img src="${partner.sprites?.determined||partner.src}" alt="正在参加挑战的${partner.label}"/></div><div><span class="eyebrow">${complete?'CHALLENGE COMPLETE':'THE NEXT CHALLENGE'}</span><h3>${esc(result.benchmark_name || '模型挑战赛')}</h3><div class="race-score">${fmtNum(score,1)}<small>${complete?'官方得分':'当前表现'}</small></div><p>${complete?(result.rank_eligible?'每一次登台，都会离梦想更近一点。':'本次得分已记录，排名资格需要进一步整备。'):'正在逐项完成评测卡片，保持专注。'}</p></div></div><div class="race-timeline"><span style="width:${progress*100}%"></span></div><div class="race-progress-caption"><span>${complete?'本次挑战已完成':`评测 ${replay.cursor+1} / ${total}`}</span><span>回放速度 ×${replay.speed}</span></div><div class="race-card-grid">${STAT_KEYS.map((key,i)=>`<div class="race-step ${progress>=(i+1)/STAT_KEYS.length?'is-done':progress>=i/STAT_KEYS.length?'is-active':''}">${icon(FOCUS_META[key].icon)}<strong>${STAT_LABELS[key]}</strong></div>`).join('')}</div>${complete?`<div class="kv-row race-final-metrics"><div class="kv"><span>公开评测</span><b>${fmtNum(result.public_score,1)}</b></div><div class="kv"><span>隐藏评测</span><b>${fmtNum(result.hidden_score,1)}</b></div><div class="kv"><span>赛事奖金</span><b>+${fmtKc(result.prize_kc)}</b></div></div><p class="race-final-note">官方得分 = 60% 公开评测 + 40% 隐藏评测 · ${result.rank_eligible?'具备排名资格':'本场不参与排名'} · 奖金已计入研究资金</p>`:''}</div>`;
}

function startRaceReplayLoop() {
  if (App._raceTimer) clearInterval(App._raceTimer);
  App._raceTimer = setInterval(() => {
    const r = App.raceReplay;
    if (!r) { clearInterval(App._raceTimer); App._raceTimer = null; return; }
    if (!r.playing) return;
    r.cursor += r.speed;
    if (r.cursor >= r.events.length) { r.cursor = r.events.length - 1; r.playing = false; }
    const body = App.modals.at(-1)?.el.querySelector('.modal__body');
    if (body && r) body.innerHTML = raceReplayBody();
  }, 800);
}

function toggleRaceSpeed() {
  const r = App.raceReplay;
  if (!r) return;
  r.speed = r.speed === 1 ? 2 : r.speed === 2 ? 4 : 1;
  const body = App.modals.at(-1)?.el.querySelector('.modal__body');
  if (body) body.innerHTML = raceReplayBody();
}

function triggerRaceSkill() {
  const r = App.raceReplay;
  if (!r) return;
  const cur = r.events[r.cursor];
  if (cur) {
    cur.skill = cur.skill || '肾上腺素';
    const body = App.modals.at(-1)?.el.querySelector('.modal__body');
    if (body) body.innerHTML = raceReplayBody();
  }
}

function skipRaceToReport() {
  const replay=App.raceReplay; if (!replay) return;
  replay.cursor=replay.events.length-1; replay.playing=false;
  const body=App.modals.at(-1)?.el.querySelector('.modal__body'); if (body) body.innerHTML=raceReplayBody();
}

/* -------------------------------------------------------------------------- */
/* 21. Company tab logic                                                       */
/* -------------------------------------------------------------------------- */

function businessForm(name) {
  const form = document.querySelector(`[data-business-form="${name}"]`);
  const values = {};
  for (const field of form?.querySelectorAll('input[name],select[name]') || []) {
    if(field.name==='allowed_apps') {values.allowed_apps ||= [];if(field.checked)values.allowed_apps.push(field.value);}
    else values[field.name] = field.type === 'number' ? Number(field.value) : field.type==='checkbox'?field.checked:field.value;
  }
  return values;
}

function handleBusinessAction(action, el) {
  const s = gs(); if (!s) return;
  let result; let message = '经营配置已更新，本回合交付预估已重算';
  const id = el.dataset.id;
  if (action === 'business-open-legal') {
    closeTopModal(); App.ui.company.section = 'legal'; switchTab('company'); return;
  }
  if (action === 'business-offer-save' || action === 'business-offer-toggle') {
    const offer = s.serving.offers.find(o => o.id === id); if (!offer) return;
    result = action === 'business-offer-toggle' && offer.enabled ? { ok:true } : configureOffer(s, id, businessForm(`offer-${id}`));
    if (result.ok && action === 'business-offer-toggle') {
      result = configureOffer(s, id, { enabled: !offer.enabled });
      message = offer.enabled ? '服务已开通，请确认算力供应充足' : '服务已暂停；已预留的算力仍需付费';
    }
  } else if (action === 'business-supply-save') result = configureSupply(s, businessForm('supply'));
  else if (action === 'business-access-save') result = configureOffer(s,id,businessForm(`access-${id}`));
  else if (action === 'business-gateway-save') result = configureGateway(s,businessForm('gateway'));
  else if (action === 'business-proxy-revoke') {result = revokeProxyClient(s,id);message='该违规共享池已封禁，下一次交付不再占用算力';}
  else if (action === 'business-rotate') {result = rotateServiceCredentials(s);message='模拟接入凭据已轮换，共享池失效；正常用户需要重新连接';}
  else if (action === 'business-procure') { result = procureCompute(s, el.dataset.source); message = '算力已采购，供应池与训练预算已更新'; }
  else if (action === 'business-cloud-renew') {
    const contract = s.serving.contracts.find(c => c.id === id); if (!contract) return;
    result = setContractRenewal(s, id, !contract.auto_renew); message = contract.auto_renew ? '已启用自动续约，到期会支付开通费并续签四回合' : '已关闭续约，到期后自动退租';
  } else if (action === 'business-routing-save') result = configureRouting(s, businessForm('routing'));
  else if (action === 'business-publish') { result = publishServiceModel(s, id); message = '当前模型已发布，后续服务使用这一版的能力和参数规模'; }
  else if (action === 'business-case') { result = resolveServiceCase(s, id, el.dataset.choice); message = result?.outcome === 'pending' ? '应诉材料已提交，两回合后审理' : '案件已处理，付款与口碑变化已记录'; }
  else if (action === 'business-audit') { result = auditService(s); message = '公开审计完成，路由已披露，信任提升；历史案件仍保留'; }
  if (!result?.ok) { toast(result?.reason || '操作未完成', 'error'); return; }
  saveToStorage(); rerenderAll(); toast(message, 'success');
}

function doPrivateFinancing() {
  const s = gs(); if (!s) return;
  const res = typeof executePrivateFinancing === 'function'
    ? safeCall('executePrivateFinancing', () => executePrivateFinancing(s, {}))
    : null;
  saveToStorage();
  rerenderAll();
  toast('私募融资完成', 'success');
}

function doIPO() {
  const s = gs(); if (!s) return;
  const res = typeof executeIPO === 'function'
    ? safeCall('executeIPO', () => executeIPO(s, {}))
    : null;
  saveToStorage();
  rerenderAll();
  toast('IPO 完成', 'success');
}

function doTradeSecurity(secId, side) {
  const s = gs(); if (!s) return;
  const sec = SECURITY_BY_ID[secId];
  if (!sec) return;
  const limit = (s.cash_kc || 0) * 0.10;
  const res = typeof tradeSecurity === 'function'
    ? safeCall('tradeSecurity', () => tradeSecurity(s, { security_id: secId, side, max_kc: limit }))
    : null;
  saveToStorage();
  renderTabIfActive('company');
  toast(`${side === 'buy' ? '买入' : '卖出'} ${sec.name || secId}`, 'success');
}

function doStepNode(nodeId) {
  const s = gs(); if (!s) return;
  if (s.main_action_used) { toast('本回合主行动已使用', 'warn'); return; }
  const res = typeof stepResearchProject === 'function'
    ? safeCall('stepResearchProject', () => stepResearchProject(s, nodeId))
    : null;
  if (!res) {
    s.research_projects = s.research_projects || {};
    const prev = s.research_projects[nodeId] || { progress: 0 };
    prev.progress = clamp(prev.progress + 0.34, 0, 1);
    s.research_projects[nodeId] = prev;
  }
  s.main_action_used = true;
  saveToStorage();
  renderTabIfActive('company');
  toast('科研节点已推进', 'success');
}

function doSwitchArch(archId) {
  const s = gs(); if (!s) return;
  const arch = ARCH_BY_ID[archId];
  if (!arch) return;
  s.active_model.architecture_id = archId;
  if (arch.total_params_b) s.active_model.sim_total_params_b = arch.total_params_b;
  if (arch.active_params_b) s.active_model.sim_active_params_b = arch.active_params_b;
  saveToStorage();
  rerenderAll();
  toast(`已切换到架构 ${arch.name || archId}`, 'success');
}

function doRunRsi() {
  const s = gs(); if (!s) return;
  if (s.main_action_used) { toast('本回合主行动已使用', 'warn'); return; }
  const res = typeof runRsiExperimentCycle === 'function'
    ? safeCall('runRsiExperimentCycle', () => runRsiExperimentCycle(s))
    : null;
  if (!res) {
    s.milestone_state = s.milestone_state || {};
    s.milestone_state.rsi_cycles = (s.milestone_state.rsi_cycles || 0) + 1;
  }
  s.main_action_used = true;
  saveToStorage();
  rerenderAll();
  toast('RSI 实验周期完成', 'success');
}

function doStepLegal() {
  const s = gs(); if (!s) return;
  const res = typeof stepLegalSystem === 'function'
    ? safeCall('stepLegalSystem', () => stepLegalSystem(s))
    : null;
  saveToStorage();
  renderTabIfActive('company');
  toast('法务系统已推进', 'info');
}

function doResolveLegal(caseId, choice) {
  const s = gs(); if (!s) return;
  const res = typeof resolveLegalAction === 'function'
    ? safeCall('resolveLegalAction', () => resolveLegalAction(s, caseId, choice))
    : null;
  saveToStorage();
  renderTabIfActive('company');
  toast('已处理案件', 'success');
}

function doUpdateMilestones() {
  const s = gs(); if (!s) return;
  const res = typeof updateSectorsAndMilestones === 'function'
    ? safeCall('updateSectorsAndMilestones', () => updateSectorsAndMilestones(s))
    : null;
  saveToStorage();
  renderTabIfActive('company');
  toast('里程碑已刷新', 'info');
}

function doUpdateBubble() {
  const s = gs(); if (!s) return;
  const res = typeof updateBubbleState === 'function'
    ? safeCall('updateBubbleState', () => updateBubbleState(s))
    : null;
  saveToStorage();
  rerenderAll();
  toast('泡沫状态已刷新', 'info');
}

/* -------------------------------------------------------------------------- */
/* 22. Settings logic                                                          */
/* -------------------------------------------------------------------------- */

function doSaveByok() {
  const s = App.ui.settings;
  const endpoint = $('#tab-content [data-settings-field="byokEndpoint"]');
  const model = $('#tab-content [data-settings-field="byokModel"]');
  const key = $('#tab-content [data-settings-field="byokKey"]');
  const enabled = $('#tab-content [data-settings-field="byokEnabled"]');
  if (endpoint) s.byokEndpoint = endpoint.value;
  if (model) s.byokModel = model.value;
  if (enabled) s.byokEnabled = enabled.checked;
  if (key && key.value) s.byokKey = key.value;
  saveByok();
  toast('对话设置已保存，密钥仅用于当前页面', 'success');
}

async function requestCompanion(text) {
  const settings = App.ui.settings;
  if (!settings.byokEndpoint || !settings.byokModel || !settings.byokKey) throw new Error('请填写接口地址、模型与本次使用的密钥');
  const endpoint = new URL(settings.byokEndpoint);
  if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('接口地址需要以 http 或 https 开头');
  const url = endpoint.href.replace(/\/$/, '').replace(/\/chat\/completions$/, '') + '/chat/completions';
  const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + settings.byokKey };
  if (endpoint.hostname === 'opencode.ai') headers['x-opencode-session'] = settings.opencodeSession ||= 'ses_' + crypto.randomUUID();
  const response = await fetch(url, {
    method: 'POST', headers, signal: AbortSignal.timeout(45000),
    body: JSON.stringify({ model: settings.byokModel, messages: [
      { role: 'system', content: `你是模型养成游戏中的${currentPartner().label}，用简体中文温暖自然地简短回复。只返回 JSON，字段为 speaker_id、text、emotion；emotion 只能是 neutral、happy、worried、determined、sad。不要输出游戏数值或操作指令。` },
      { role: 'user', content: text },
    ], max_tokens: 300 }),
  });
  if (!response.ok) throw new Error(`接口返回 ${response.status}，请检查地址、模型和密钥`);
  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('接口没有返回可用文本');
  let parsed;
  try { parsed = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, '')); }
  catch { parsed = { text: content, emotion: 'neutral' }; }
  return sanitizeAiOutput(parsed);
}

async function doTestByok() {
  doSaveByok();
  const settings = App.ui.settings;
  if (!settings.byokEnabled) { toast('请先启用 AI 对话', 'warn'); return; }
  const button = $('[data-action="test-byok"]');
  if (button) { button.disabled = true; button.textContent = '连接中…'; }
  try {
    const message = await requestCompanion('用一句话向你的育成伙伴问好。');
    App.dialogue = { speaker: '角色', text: message.text };
    App.emotion = message.emotion;
    settings.lastError = '';
    renderCharacterStage();
    toast('连接成功，伙伴已经收到你的问候', 'success');
  } catch (error) {
    settings.lastError = error.name === 'TimeoutError' ? '连接超时，请稍后重试' : error.message;
    toast(settings.lastError, 'warn');
  } finally {
    if (button?.isConnected) { button.disabled = false; button.textContent = '测试连接'; }
  }
}

function sanitizeAiOutput(raw) {
  if (!raw || typeof raw !== 'object') return { speaker_id: null, text: '', emotion: 'neutral' };
  const out = {
    speaker_id: typeof raw.speaker_id === 'string' ? raw.speaker_id.slice(0, 64) : null,
    text: typeof raw.text === 'string' ? raw.text.slice(0, 400) : '',
    emotion: typeof raw.emotion === 'string' ? raw.emotion.slice(0, 16) : 'neutral',
  };
  if (!EMOTION_MAP[out.emotion]) out.emotion = 'neutral';
  return out;
}

function openFreeDialogueModal() {
  const hist = HISTORY_BY_ID[activeModel().history_id];
  openModal({
    title: `自由对话 · ${hist?.name || '角色'}`,
    bodyHtml: `
      <p class="hint">
        离线演绎：本地模板回应。<br/>
        BYOK：调用自带密钥的 OpenAI 兼容接口，返回会被严格清洗为 { speaker_id, text, emotion }。<br/>
        <b>不会向存档写入任何密钥。</b>
      </p>
      <textarea class="input" rows="3" placeholder="说点什么…" data-dialogue-input></textarea>
    `,
    footerHtml: `
      <button class="btn btn--ghost" data-action="modal-close">关闭</button>
      <button class="btn btn--primary" data-action="modal-confirm" data-kind="dialogue">发送</button>
    `,
  });
}

/* -------------------------------------------------------------------------- */
/* 23. Tutorial                                                                */
/* -------------------------------------------------------------------------- */

function toggleTutorial() {
  if (App.ui.tutorial.active) endTutorial();
  else startTutorial();
}

function startTutorial() {
  App.ui.tutorial.active = true;
  App.ui.tutorial.step = 0;
  const banner = $('#tutorial-banner');
  if (banner) banner.hidden = false;
  renderTutorial();
}

function endTutorial() {
  App.ui.tutorial.active = false;
  const banner = $('#tutorial-banner');
  if (banner) banner.hidden = true;
  savePrefs();
}

function setTutorialStep(step) {
  const total = TUTORIAL_TOTAL;
  if (step < 0) step = 0;
  if (step >= total) { endTutorial(); return; }
  App.ui.tutorial.step = step;
  renderTutorial();
}

function renderTutorial() {
  const step = App.ui.tutorial.step || 0;
  const s = TUTORIAL_STEPS[step] || TUTORIAL_STEPS[0];
  setText('#tutorial-step-counter', `教程 ${step + 1} / ${TUTORIAL_TOTAL}`);
  setText('#tutorial-step-title', s.t);
  setText('#tutorial-step-text', s.d);
  $$('#tutorial-dots .tutorial-dot').forEach((dot, i) => {
    dot.classList.toggle('is-active', i === step);
    if (i === step) dot.setAttribute('aria-current', 'step');
    else dot.removeAttribute('aria-current');
  });
  const prev = $('#btn-tutorial-prev');
  const next = $('#btn-tutorial-next');
  if (prev) prev.disabled = step === 0;
  if (next) next.textContent = step === TUTORIAL_TOTAL - 1 ? '完成' : '下一步';
}

/* -------------------------------------------------------------------------- */
/* 24. Modals                                                                  */
/* -------------------------------------------------------------------------- */

function openModal({ title, bodyHtml, footerHtml, onClose }) {
  const root = $('#modal-root');
  if (!root) return null;
  root.hidden = false;
  const el = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '对话框' });
  el.innerHTML = `
    <div class="modal__backdrop" data-action="modal-close"></div>
    <div class="modal__panel" role="document">
      <header class="modal__header">
        <h2 class="modal__title">${esc(title || '')}</h2>
        <button class="btn btn--icon" data-action="modal-close" aria-label="关闭">✕</button>
      </header>
      <div class="modal__body">${bodyHtml || ''}</div>
      ${footerHtml ? `<footer class="modal__footer">${footerHtml}</footer>` : ''}
    </div>
  `;
  root.appendChild(el);
  const handle = { el, onClose, previousFocus: document.activeElement };
  el.addEventListener('keydown', ev => {
    if (App.modals.at(-1)?.el !== el) return;
    if (ev.key === 'Escape') { ev.preventDefault(); closeTopModal(); return; }
    if (ev.key !== 'Tab') return;
    const nodes = Array.from(el.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')).filter(n => n.getClientRects().length);
    const first = nodes[0], last = nodes.at(-1);
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last?.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first?.focus(); }
  });
  App.modals.push(handle);
  requestAnimationFrame(() => { el.classList.add('is-visible'); el.querySelector('button, input, select, [tabindex]')?.focus(); });
  return handle;
}

function closeTopModal() {
  const modal = App.modals.pop();
  if (!modal) {
    const root = $('#modal-root');
    if (root) root.hidden = true;
    return;
  }
  modal.el.classList.remove('is-visible');
  setTimeout(() => {
    modal.el.remove();
    if (modal.previousFocus?.isConnected) modal.previousFocus.focus();
    if (modal.onClose) { try { modal.onClose(); } catch (e) { console.warn(e); } }
    if (App.modals.length === 0) {
      const root = $('#modal-root');
      if (root) root.hidden = true;
    }
  }, 260);
}

async function handleModalConfirm(el) {
  const kind = el.dataset.kind;
  if (kind === 'dialogue') {
    const input=document.querySelector('[data-dialogue-input]'); const text=input?.value?.trim();
    if (!text) {toast('写一句你想说的话吧','info');return;}
    el.disabled=true;el.textContent='…';
    try {
      const message=App.ui.settings.byokEnabled ? await requestCompanion(text) : {text:'我在听呢。今天能一起做成一件小事，就已经很好了。',emotion:'happy'};
      App.dialogue={speaker:'角色',text:message.text};App.emotion=message.emotion;
      closeTopModal();renderCharacterStage();
    } catch(error){toast(error.message || '对话暂时没有送达，请重试','warn');el.disabled=false;el.textContent='发送';}
  } else if (kind === 'new-game') {
    const profileId = el.dataset.profile;
    const historyId = el.dataset.history;
    startNewGame(profileId, historyId);
    closeTopModal();
  }
}

function handleModalChoice(el) {
  const kind = el.dataset.kind;
  if (kind === 'card') {
    const slot = Number(el.dataset.slot);
    App.ui.prep[`card_slot_${slot}`] = el.dataset.value;
    closeTopModal();
    doSaveCards();
  } else if (kind === 'mentor') {
    const slot = Number(el.dataset.slot);
    const s = gs();
    if (s) {
      s.teacher_model_ids = s.teacher_model_ids || [];
      s.teacher_model_ids[slot] = el.dataset.value || null;
      saveToStorage();
      closeTopModal();
      rerenderAll();
    }
  } else if (kind === 'story-event') {
    const evId = el.dataset.eventId;
    const choiceId = el.dataset.value;
    const s = gs();
    if (s && evId) {
      const res = STORY_BY_ID[evId] ? resolveCatalogChoice(s, evId, choiceId) : safeCall('story choice', () => applyStoryEventChoice(s, evId, 0));
      if (!res?.ok) { toast('这段剧情尚未接入当前引擎，可以关闭后继续育成。', 'warn'); return; }
      App.dialogue = {speaker:'角色',text:res.text || '新的选择，也会成为我们旅程的一部分。'};
      saveToStorage(); closeTopModal(); rerenderAll(); toast('选择已记录', 'success');
    } else {
      closeTopModal();
    }
  } else if (kind === 'new-game-profile') {
    applyNewGameProfile(el.dataset.value, el.dataset.history);
  }
}

/* -------------------------------------------------------------------------- */
/* 25. New Game modal                                                          */
/* -------------------------------------------------------------------------- */

function openNewGameModal() {
  App.pendingNewGame = { profileId: profileList()[0].id, historyId: profileList()[0].default_history_id };
  openModal({title:'和新的伙伴，开始新的育成',bodyHtml:newGameBody(),footerHtml:'<button class="btn btn--ghost" data-action="modal-close">继续当前旅程</button><button class="btn btn--primary" data-action="confirm-new-game">开始新的育成 →</button>'});
}
function newGameBody() {
  const chosen = App.pendingNewGame;
  return `<p>只有模型可以育成。工具与设施角色作为 NPC 出场，可在图鉴拜访。选择实验室与模型谱系后会替换当前进度，旧旅程可以先从右上角导出。</p><h3 style="margin:18px 0 12px">实验室起点</h3><div class="newgame-profile">${profileList().map(p=>`<button class="tile ${chosen.profileId===p.id?'is-active':''}" data-action="pick-new-profile" data-value="${esc(p.id)}" aria-pressed="${chosen.profileId===p.id}"><span class="tile__title">${esc(p.name)}</span><span class="tile__meta">${fmtKc(p.cash_kc)} · ${fmtCu(p.cluster_compute_cu)} · ${esc(p.difficulty_label)}</span><span class="tile__desc">${esc(p.description.slice(0,66))}…</span></button>`).join('')}</div><h3 style="margin:20px 0 0">可育成的模型谱系</h3><div class="newgame-history">${historyList().map(h=>`<button class="${chosen.historyId===h.id?'is-active':''}" data-action="pick-new-history" data-value="${esc(h.id)}" aria-pressed="${chosen.historyId===h.id}">${PARTNERS[partnerForHistory(h.id)]?`<img src="${PARTNERS[partnerForHistory(h.id)].src}" alt="" loading="lazy"/>`:""}<span>${esc(PARTNERS[partnerForHistory(h.id)]?.name || h.family_name)}</span><small>${esc(h.family_name)} · ${esc(h.persona_name)}</small></button>`).join('')}</div>`;
}
function refreshNewGameModal() { const body = App.modals.at(-1)?.el.querySelector('.modal__body'); if (body) body.innerHTML = newGameBody(); }

function applyNewGameProfile(profileId, historyId) {
  App.pendingNewGame = { profileId, historyId };
  const histories = historyList();
  const chosen = App.pendingNewGame.historyId || histories[0]?.id;
  startNewGame(profileId, chosen);
  closeTopModal();
}

function startNewGame(profileId, historyId) {
  App.state = createStateFromProfile(profileId, historyId);
  App.ui = defaultUI();
  savePrefs();
  App.emotion = 'neutral';
  App.dialogue = { speaker: '角色', text: '新的旅程开始了。让我陪你，把想象一点点变成现实吧。' };
  saveToStorage();
  rerenderAll();
  window.scrollTo({top:0,behavior:'instant'});
  toast('新的育成开始了', 'success');
}

/* -------------------------------------------------------------------------- */
/* 26. Story events                                                            */
/* -------------------------------------------------------------------------- */

function renderPersonalInvitation() {
  const events=personalEventsForHistory(activeModel().history_id);
  if(!events.length)return '';
  const pending=pendingPersonalEvent(gs()),next=nextPersonalEvent(gs());
  const line=pending?`待续写 · ${pending.title}`:next?`新的回忆 · ${next.title}`:`${events.length} 段真实历史改编 · 随育成进度开启`;
  return `<button class="personal-invitation" data-action="open-personal-archive">${icon('book')}<span><strong>她的个人事件</strong><small>${esc(line)}</small></span><span>打开回忆簿 ↗</span></button>`;
}

function openPersonalModelEvent(id) {
  const event=PERSONAL_EVENT_BY_ID[id];if(!event)return;
  if(personalEventStatus(gs(),event).status==='ready') {
    const result=beginPersonalEvent(gs(),id);if(!result.ok){toast('这段回忆还需要一点育成时间','info');return;}
    saveToStorage();renderTabIfActive('codex');
  }
  const pending=personalEventStatus(gs(),event).status==='pending';
  openModal({title:`${event.model_name} · ${event.title}`,bodyHtml:renderPersonalEventBody(gs(),id),footerHtml:`<button class="btn btn--ghost" data-action="modal-close">${pending?'稍后续写':'合上这一页'}</button><button class="btn btn--ghost" data-action="open-personal-archive">查看个人事件簿 ↗</button>`});
}

function choosePersonalModelEvent(id,choiceId) {
  const result=resolvePersonalEvent(gs(),id,choiceId);
  if(!result.ok){toast(result.reason==='insufficient_cash'?'研究资金不足，可以选择不收费的路线。':'这个选择已经处理，或当前不属于这段回忆。','warn');return;}
  closeTopModal();
  App.emotion='happy';App.dialogue={speaker:result.event.model_name,text:result.text};
  saveToStorage();rerenderAll();
  openModal({title:'这一页，记住了',bodyHtml:renderPersonalResult(result),footerHtml:'<button class="btn btn--ghost" data-action="open-personal-archive">翻开个人事件簿 ↗</button><button class="btn btn--primary" data-action="modal-close">带着回忆继续育成</button>'});
}

function maybeFirePersonalModelEvent() {
  const candidate=nextPersonalEvent(gs());if(!candidate)return false;
  const result=beginPersonalEvent(gs(),candidate.event_id);if(!result.ok)return false;
  openPersonalModelEvent(candidate.event_id);return true;
}

function maybeFireStoryEvent() {
  const s = gs(); if (!s) return false;
  const events = eventList();
  if (!events.length) return false;
  const fired = s.fired_story_events || (s.fired_story_events = []);
  const candidate = events.find(ev => {
    if (!ev || !ev.id || !canResolveCatalogEvent(ev)) return false;
    if (fired.includes(ev.id)) return false;
    const turn = ev.trigger?.min_turn ?? ev.turn ?? ev.turn_min;
    if (ev.season && ev.season !== Math.floor((s.turn - 1) / 24) + 1) return false;
    if (typeof turn === 'number' && s.turn < turn) return false;
    const turnMax = ev.trigger?.max_turn ?? ev.turn_max;
    if (typeof turnMax === 'number' && s.turn > turnMax) return false;
    return true;
  });
  if (!candidate) return false;
  fired.push(candidate.id);
  openStoryEventModal(candidate);
  return true;
}

function openStoryEventModal(ev) {
  const choices = ev.choices || [
    { id: 'accept', label: '接受' },
    { id: 'decline', label: '婉拒' },
  ];
  openModal({
    title: ev.name || ev.title || '行业事件',
    bodyHtml: `
      <p>${esc(ev.briefing || ev.text || ev.description || '')}</p>
      <ul class="modal-list">
        ${choices.map(c => `
          <li>
            <button class="modal-choice" data-action="modal-choice" data-kind="story-event"
                    data-event-id="${esc(ev.id)}" data-value="${esc(c.choice_id || c.id)}">
              <b>${esc(c.text || c.label || c.choice_id || c.id)}</b>
              <span>${esc(c.hint || '')}</span>
            </button>
          </li>
        `).join('')}
      </ul>
    `,
  });
}

/* -------------------------------------------------------------------------- */
/* 27. Season finale                                                           */
/* -------------------------------------------------------------------------- */

function maybeFireSeasonFinale() {
  const state=gs(); if(!state || state.turn<=1 || (state.turn-1)%24!==0) return false;
  openSeasonFinaleModal(); return true;
}

function openSeasonFinaleModal() {
  const s = gs();
  const chapter = chapterList()[(s.season - 1) % chapterList().length] || {};
  openModal({
    title: `赛季结算 · 第 ${Math.max(1,s.season-1)} 季`,
    bodyHtml: `
      <p>${esc(chapter.title || '本章结束')}</p>
      <p>${esc(chapter.description || '')}</p>
      <div class="kv-row">
        <div class="kv"><span>资金</span><b>${fmtKc(s.cash_kc)}</b></div>
        <div class="kv"><span>就绪度</span><b>${Math.round(s.cluster_readiness)}%</b></div>
        <div class="kv"><span>泡沫</span><b>${Math.round(s.bubble_pressure)}</b></div>
      </div>
    `,
    footerHtml: `
      <button class="btn btn--primary" data-action="modal-close">开始下一赛季</button>
    `,
  });
}

/* -------------------------------------------------------------------------- */
/* 28. Turn advance                                                            */
/* -------------------------------------------------------------------------- */

function doNextTurn() {
  const s = gs(); if (!s) return;
  if (s.main_action_used === false && App.ui.activeTab !== 'company') {
    toast('未使用主行动：将按跳过处理', 'warn');
    App.dialogue = { speaker: '策划', text: '本回合无主行动，按默认消耗推进。' };
  }

  /* Advance annotation contracts */
  advanceContractsSafe(s);
  // advanceTurn owns world, financial and legal settlement.

  /* Advance turn */
  const res = typeof advanceTurn === 'function'
    ? safeCall('advanceTurn', () => advanceTurn(s))
    : null;
  if (!res) {
    s.turn = (s.turn || 1) + 1;
    s.day_in_season = ((s.turn - 1) * 15) % 15 + 1;
    if (s.turn % 24 === 0) s.season = (s.season || 1) + 1;
    s.cash_kc = (s.cash_kc || 0) - estimateTurnBurn();
    s.main_action_used = false;
  }

  s.season = Math.floor((s.turn - 1) / 24) + 1;
  App.lastTurnSnap = { turn: s.turn };
  App.emotion = s.cluster_readiness < 35 ? 'worried' : 'neutral';
  App.dialogue = { speaker: '角色', text: s.cluster_readiness < 35 ? '有点累了……去喝杯茶，整备一下集群吧。' : '新的一回合。今天，你想和我一起做些什么？' };
  recomputeTrainingPreview();

  /* Fire story event or finale */
  if (maybeFireSeasonFinale()) {
    /* Modal handled */
  } else if (maybeFirePersonalModelEvent()) {
    /* Model-specific historical scene handled. */
  } else if (!maybeFireStoryEvent()) {
    /* nothing */
  }

  if (s.turn > MAX_TURN) {
    openEndingModal();
  }

  const incidents = res?.serving?.incidents || [];
  if (incidents.length) {
    openModal({ title: incidents[0].title, bodyHtml: incidents.map(i=>`<p>${esc(i.detail)}</p>`).join(''), footerHtml: '<button class="btn btn--primary" data-action="business-open-legal">查看经营档案</button><button class="btn btn--ghost" data-action="modal-close">稍后处理</button>' });
    App.emotion = 'worried';
    App.dialogue = { speaker:'角色', text: incidents[0].kind === 'class_action' ? '有用户发现了模型替换。先看看他们的意见，也把退款和法务安排好。' : incidents[0].kind === 'service_abuse' ? '服务被人滥用了。先查看调查记录，再安排补救与赔偿，也要重新检查已发布模型的安全对齐。' : incidents[0].kind === 'supply' ? '云算力续约没有成功，下一回合的交付容量可能不够了。' : '审理结果已经出来了，我们需要重新安排赔偿和研发的预算。' };
  } else if (res?.serving?.rows?.length) toast(`第 ${res.serving.turn} 回合交付完成 · 实收 ${fmtKc(res.serving.revenue_kc)} · 服务成本 ${fmtKc(res.serving.cost_kc)}`, 'info');
  saveToStorage();
  rerenderAll();
}

function advanceContractsSafe(s) {
  if (typeof advanceAnnotationContracts !== 'function') return;
  try { advanceAnnotationContracts(s); } catch (e) { console.warn(e); }
}

/* -------------------------------------------------------------------------- */
/* 29. Endings                                                                 */
/* -------------------------------------------------------------------------- */

function openEndingModal() {
  const s = gs();
  const endings = endingList();
  const score = sumOf(STAT_KEYS.map(k => s.active_model?.stats?.[k] || 0)) * 6 / STAT_KEYS.length +
                (s.cash_kc || 0) * 2 - (s.bubble_pressure || 0) * 3;
  const ending = endings.find(e => score >= (e.threshold ?? 0)) || endings[endings.length - 1] || { name: '平淡收场', description: '不算成功，也不算失败。' };
  openModal({
    title: '育成结束 · 结局分支',
    bodyHtml: `
      <h3>${esc(ending.name || '结局')}</h3>
      <p>${esc(ending.description || '')}</p>
      <div class="kv-row">
        <div class="kv"><span>综合评分</span><b>${Math.round(score)}</b></div>
        <div class="kv"><span>回合</span><b>${s.turn}</b></div>
      </div>
    `,
    footerHtml: `
      <button class="btn btn--primary" data-action="modal-close">好的</button>
    `,
  });
}

/* -------------------------------------------------------------------------- */
/* 30. Turn Previews                                                           */
/* -------------------------------------------------------------------------- */

function renderTurnPreview() {
  const s = gs(); if (!s) return;
  const next = $('#btn-next-turn');
  if (next) { next.innerHTML = `${App.ui.activeTab === 'company' ? '结束回合 · 交付' : s.main_action_used ? '下一回合' : '跳过本回合'} ${icon('arrow')}`; next.classList.toggle('is-ready', !!s.main_action_used); }
  const p = App.ui.train.preview;
  const servicePreview = App.ui.activeTab === 'company' ? previewServiceTurn(s) : null;
  setText('#turn-preview-text', servicePreview ? `结束回合交付 · 预计实收 ${fmtKc(servicePreview.revenue_kc)} / 服务成本 ${fmtKc(servicePreview.cost_kc)}` : s.main_action_used ? '成长已记录，准备好就向前一步吧。' : App.ui.activeTab === 'train' && p ? `计划消耗 ${fmtKc(p.cost_kc)} · 预计成长 +${fmtNum(p.expected_total_gain,1)}` : '各入口共享本回合的一次主要行动。');
}

/* -------------------------------------------------------------------------- */
/* 31. Full re-render                                                          */
/* -------------------------------------------------------------------------- */

function rerenderAll() {
  if (!gs()) return;
  renderHUD();
  renderStatsPanel();
  renderCharacterStage();
  renderModelSummary();
  renderRisksPanel();
  renderDeckPanel();
  recomputeTrainingPreview();
  renderActiveTab();
  renderTurnPreview();
}

/* -------------------------------------------------------------------------- */
/* 32. Boot                                                                    */
/* -------------------------------------------------------------------------- */

function boot() {
  /* Try restore */
  const loaded = loadFromStorage();
  if (loaded) {
    App.state = normalizeState(loaded.state);
    toast('已恢复上次自动存档', 'info');
  } else {
    const profiles = profileList();
    const firstProfile = profiles[0]?.id ?? 'default';
    const firstHistory = profiles[0]?.default_history_id || historyList()[0]?.id;
    App.state = createStateFromProfile(firstProfile, firstHistory);
    toast('欢迎！从「新游戏」可自定义开局。', 'info');
  }

  /* Restore prefs */
  const prefs = loadPrefs();
  if (prefs) {
    App.ui.activeTab = prefs.activeTab || 'train';
    App.ui.partnerId = isModelCharacter(prefs.partnerId) ? prefs.partnerId : null;
    App.ui.researchView = !!prefs.researchView;
    App.ui.tutorial.step = prefs.tutorialStep || 0;
  }

  /* Restore BYOK from session */
  const byok = loadByok();
  if (byok) {
    App.ui.settings.byokEnabled = true;
    App.ui.settings.byokEndpoint = byok.endpoint || '';
    App.ui.settings.byokModel = byok.model || '';
  }

  /* Wire click buttons on HUD */
  const btnRV = $('#btn-research-view');
  if (btnRV) btnRV.addEventListener('click', () => handleAction('toggle-research', btnRV, {}));
  const btnTut = $('#btn-tutorial');
  if (btnTut) btnTut.addEventListener('click', () => handleAction('toggle-tutorial', btnTut, {}));
  const btnNew = $('#btn-new-game');
  if (btnNew) btnNew.addEventListener('click', () => handleAction('open-new-game', btnNew, {}));
  const btnExp = $('#btn-export-save');
  if (btnExp) btnExp.addEventListener('click', () => handleAction('export-save', btnExp, {}));
  const btnImp = $('#btn-import-save');
  const impInput = $('#import-save-input');
  if (btnImp && impInput) btnImp.addEventListener('click', () => impInput.click());
  if (impInput) impInput.addEventListener('change', () => {
    const file = impInput.files?.[0];
    if (file) importSaveFile(file);
    impInput.value = '';
  });

  const syncNavigationAxis = () => $('#main-tabs')?.setAttribute('aria-orientation',matchMedia('(max-width:900px)').matches?'horizontal':'vertical');
  syncNavigationAxis();
  matchMedia('(max-width:900px)').addEventListener('change',syncNavigationAxis);

  /* Wire main tabs */
  $$('#main-tabs .tab').forEach(t => {
    t.addEventListener('click', () => switchTab(t.dataset.tab));
    t.addEventListener('keydown', (ev) => {
      if (['ArrowDown','ArrowUp','ArrowRight','ArrowLeft','Home','End'].includes(ev.key)) {
        ev.preventDefault(); const tabs = $$('#main-tabs .tab'); const i = tabs.indexOf(t);
        const n = ev.key === 'Home' ? 0 : ev.key === 'End' ? tabs.length - 1 : (i + (['ArrowDown','ArrowRight'].includes(ev.key) ? 1 : -1) + tabs.length) % tabs.length;
        tabs[n].focus(); switchTab(tabs[n].dataset.tab);
      } else if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        switchTab(t.dataset.tab);
      }
    });
  });

  /* Wire next turn */
  const btnNext = $('#btn-next-turn');
  if (btnNext) btnNext.addEventListener('click', () => handleAction('next-turn', btnNext, {}));

  /* Wire tutorial buttons */
  const tp = $('#btn-tutorial-prev'); if (tp) tp.addEventListener('click', () => setTutorialStep(App.ui.tutorial.step - 1));
  const tn = $('#btn-tutorial-next'); if (tn) tn.addEventListener('click', () => setTutorialStep(App.ui.tutorial.step + 1));
  const ts = $('#btn-tutorial-skip'); if (ts) ts.addEventListener('click', endTutorial);

  /* First render */
  recomputeTrainingPreview();
  rerenderAll();

  /* Autosave */
  setInterval(saveToStorage, 20000);

  /* Kick off tutorial if requested (first run) */
  if (!loaded && !prefs?.tutorialStep) {
    /* Leave closed; user can click 教程 */
  }

  /* Initial character greeting */
  App.dialogue = { speaker: '角色', text: '早上好。今天也一起进步一点点吧，下一版的我们，一定会更好。' };
  renderCharacterStage();
}

/* Boot immediately (module script is deferred by default). */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
