// Authoritative catalogue registry. The art identity does not grant company or
// technology ownership. Runtime predicates read only a validated proof config.
import { POST_CARD_CATALOG, CATALOG_FINGERPRINT, POST_CARD_RECIPES } from '../data/post_card_catalog.js';
import { TECH_BY_ID, COMPANY_BY_ID } from '../data/core.js';
import { resolveTree, treeFor } from '../data/companies/index.js';
import { validateEffects, describeEffects, DSL_CAPS } from './post_card_dsl.js';
export { CATALOG_FINGERPRINT } from '../data/post_card_catalog.js';
export const CATALOG_RULES = 'bounded-dsl-v1';
const MODES = ['llm','image','music','speech'];
const TAGS = ['filter','curriculum','stability','contrast','economy','transfer','reserve','calibration','verify','finish','breadth','sequence','distill'];
const freeze = x => { if (x && typeof x === 'object' && !Object.isFrozen(x)) { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const list = x => Array.isArray(x) && new Set(x).size === x.length;
const exact = (x,fields) => x && typeof x==='object' && !Array.isArray(x) && Object.keys(x).length===fields.length && fields.every(k=>Object.hasOwn(x,k));
const string = (v,max=2000) => typeof v==='string' && v.length<=max;
const nullableString = v => v===null || string(v);
function finiteJson(v,depth=0) {
  if(depth>10) return false;
  if(v===null || typeof v==='boolean' || typeof v==='string') return true;
  if(typeof v==='number') return Number.isFinite(v);
  if(Array.isArray(v)) return v.length<=200 && v.every(x=>finiteJson(x,depth+1));
  return v && typeof v==='object' && Object.keys(v).length<=32 && Object.values(v).every(x=>finiteJson(x,depth+1));
}
const fail = message => { throw Error(`卡牌目录损坏：${message}`); };
function node(company, id) { return resolveTree(treeFor(company))?.byId.get(id); }
export function validateCatalog(catalog = POST_CARD_CATALOG, recipes = POST_CARD_RECIPES) {
  if (!exact(catalog,['schema','status','version','cards','fallback','sourceRules','caps','policy'])) fail('未知目录字段');
  if (!finiteJson(catalog.caps) || !same(catalog.caps,POST_CARD_CATALOG.caps) || !same(catalog.fallback,POST_CARD_CATALOG.fallback) || !same(catalog.policy,POST_CARD_CATALOG.policy) || catalog.version !== POST_CARD_CATALOG.version || catalog.status !== POST_CARD_CATALOG.status || catalog.sourceRules !== POST_CARD_CATALOG.sourceRules) fail('目录元数据/规则版本');
  if (catalog.schema !== 'mrp-post-card-catalog-v1' || !Array.isArray(catalog.cards) || catalog.cards.length !== 166) fail('版本或数量');
  if (!same(Object.fromEntries(Object.keys(DSL_CAPS).map(k => [k,catalog.caps[k]])), DSL_CAPS) || catalog.caps.pendingEvents !== 4 || catalog.caps.turns !== 6 || catalog.caps.budgetInitial !== 8 || catalog.caps.scoreBasePerPlay !== 12) fail('有限状态上限');
  const ids = new Set(['basic']);
  for (const c of catalog.cards) {
    if (!exact(c,['archetypeTags','art','balanceStatus','characterCategory','characterId','characterNameDisplayPolicy','comboPartners','cost','effects','historyTags','id','implementationStatus','kind','mechanicalIntent','mechanicalSignature','modalities','name','rarityMultiplier','realAbilityEffect','rulesText','tier','timing','unlock','unlockEvidence'])) fail('未知卡牌字段');
    if (typeof c.name!=='string'||c.name.length>120||typeof c.characterId!=='string'||!['model','application','infrastructure'].includes(c.characterCategory)||c.rarityMultiplier!==null||c.realAbilityEffect!=='none_direct; shared_capped_settlement_only') fail('描述或真实收益字段');
    if (!/^ptc_[a-z0-9_]{1,36}$/.test(c.id) || ids.has(c.id)) fail('重复或非法 ID'); ids.add(c.id);
    if (!Number.isInteger(c.cost) || c.cost < 0 || c.cost > 3 || !['prepare','train'].includes(c.kind)) fail(c.id + ' 费用/类别');
    if (!list(c.modalities) || !c.modalities.length || c.modalities.some(m => !MODES.includes(m)) || !list(c.archetypeTags) || c.archetypeTags.some(t => !TAGS.includes(t))) fail(c.id + ' 模态/标签');
    if (!c.unlock || Object.keys(c.unlock).join() !== 'all' || !Array.isArray(c.unlock.all) || c.unlock.all.length > 6) fail(c.id + ' 解锁结构');
    for (const u of c.unlock.all) {
      if (u.type === 'completedTech') { const t = TECH_BY_ID[u.id]; if (Object.keys(u).sort().join() !== 'id,type' || !t || !c.modalities.includes(t.mod)) fail(c.id + ' 研究前置'); }
      else if (u.type === 'company') { if (Object.keys(u).sort().join() !== 'id,type' || !COMPANY_BY_ID[u.id]) fail(c.id + ' 公司前置'); }
      else if (u.type === 'completedStrategy') { if (Object.keys(u).sort().join() !== 'companyId,id,type' || !node(u.companyId,u.id) || !c.unlock.all.some(x => x.type === 'company' && x.id === u.companyId)) fail(c.id + ' 策略前置'); }
      else fail(c.id + ' 未知前置');
    }
    if (!['foundation','research','company','combo','support'].includes(c.tier) || !same(c.historyTags,[...c.archetypeTags,c.kind]) || !Array.isArray(c.comboPartners) || c.comboPartners.length || !/^[a-f0-9]{64}$/.test(c.mechanicalSignature) || !string(c.mechanicalIntent) || !string(c.rulesText) || !string(c.timing) || !string(c.characterNameDisplayPolicy) || !string(c.implementationStatus) || !string(c.balanceStatus)) fail(c.id+' 描述/历史标签');
    const a=c.art;
    if (!exact(a,['status','format','referenceCharacterId','referenceAsset','referenceRecord','identityAnchors','brief','originalCredit','source_url','licenseNote','derivativeCredit','sourceEvidence','composition']) || !finiteJson(a) || a.referenceCharacterId!==c.characterId || !['status','format','referenceAsset','referenceRecord','identityAnchors','brief','originalCredit','licenseNote'].every(k=>string(a[k])) || !nullableString(a.source_url) || !nullableString(a.derivativeCredit)) fail(c.id+' 美术元数据');
    if (!exact(a.composition,['aspectRatio','centralFullChibiAction','noBakedText','topQuietAreaFraction','bottomQuietAreaFraction']) || a.composition.aspectRatio!=='3:4' || a.composition.centralFullChibiAction!==true || a.composition.noBakedText!==true || ![a.composition.topQuietAreaFraction,a.composition.bottomQuietAreaFraction].every(v=>Number.isFinite(v)&&v>=0&&v<=1) || !Array.isArray(a.sourceEvidence) || a.sourceEvidence.length>8 || !a.sourceEvidence.every(e=>exact(e,['locator','observation','source_sha256','unit_id']) && Object.values(e).every(v=>string(v)) && /^[a-f0-9]{64}$/.test(e.source_sha256))) fail(c.id+' 美术来源结构');
    const u=c.unlockEvidence;
    if ((!exact(u,['kind','source','techNames','note']) && !exact(u,['kind','source','nodeTitle','hist','fiction','note'])) || !finiteJson(u) || !string(u.kind) || !string(u.source) || !string(u.note) || ('techNames' in u && (!Array.isArray(u.techNames)||u.techNames.length>6||!u.techNames.every(x=>string(x))))) fail(c.id+' 解锁证据结构');
    validateEffects(c.effects);
  }
  if (!exact(recipes,['schema','status','deckSize','mandatoryFallbackId','distinctCardsPerRole','maxActiveRecipes','aggregation','matchedRoleCoverage','efficiencyFormula','roleMatching','recipes']) || !Array.isArray(recipes.recipes) || recipes.recipes.length>32 || !finiteJson(recipes)) fail('配方字段或大小');
  if (recipes.schema !== 'mrp-post-preparation-recipes-v1' || recipes.deckSize !== 4 || recipes.mandatoryFallbackId !== 'basic' || recipes.distinctCardsPerRole !== true || recipes.maxActiveRecipes !== 1 || !same(recipes.matchedRoleCoverage,[0,.35,.7,1])) fail('配方版本');
  const rids = new Set();
  for (const r of recipes.recipes) {
    if (!exact(r,['id','name','roles']) || !string(r.id,80) || !string(r.name,80) || rids.has(r.id) || !Array.isArray(r.roles) || r.roles.length !== 3) fail('配方角色'); rids.add(r.id);
    for (const role of r.roles) if ((!exact(role,['tags']) && !exact(role,['tags','kind'])) || !list(role.tags) || !role.tags.length || role.tags.some(t => !TAGS.includes(t)) || (role.kind !== undefined && !['train','prepare'].includes(role.kind))) fail('配方条件');
  }
  return true;
}
validateCatalog(); freeze(POST_CARD_CATALOG); freeze(POST_CARD_RECIPES);
const basic = freeze({ id:'basic', name:'轻轻练一下', cost:0, kind:'train', archetypeTags:[], modalities:MODES, unlock:{all:[]}, effects:[{op:'scoreBase',amount:1}], tier:'fallback', characterId:null, art:{status:'rule_fallback_no_character_art'} });
export const CATALOG_CARDS = freeze([basic, ...POST_CARD_CATALOG.cards]);
const INDEX = new Map(CATALOG_CARDS.map(c => [c.id,c]));
export const catalogueCard = id => INDEX.get(id) || null;
export function unlockMissing(id, config) {
  const c = catalogueCard(id); if (!c) return ['未知卡牌'];
  const out = [];
  if (!config || config.catalogFingerprint !== CATALOG_FINGERPRINT || config.rulesVersion !== CATALOG_RULES || !MODES.includes(config.modality)) return ['不支持的解锁证明'];
  if (!c.modalities.includes(config.modality)) out.push('不适用于当前模态');
  for (const u of c.unlock.all) {
    if (u.type === 'completedTech' && (TECH_BY_ID[u.id].mod !== config.modality || !config.techs.includes(u.id))) out.push(`研究：${TECH_BY_ID[u.id].name}`);
    if (u.type === 'company' && config.companyId !== u.id) out.push(`限定公司：${COMPANY_BY_ID[u.id].company || COMPANY_BY_ID[u.id].name || u.id}`);
    if (u.type === 'completedStrategy' && (config.companyId !== u.companyId || !node(config.companyId,u.id) || !config.strategy.done[u.id])) out.push(`公司策略：${node(u.companyId,u.id).title}`);
  }
  return out;
}
export const catalogueUnlocked = (id, config) => unlockMissing(id, config).length === 0;
export function cardSummary(c, config) {
  const missing = unlockMissing(c.id, config);
  return { id:c.id,name:c.name,cost:c.cost,kind:c.kind,characterId:c.characterId,tier:c.tier,tags:[...c.archetypeTags],modalities:[...c.modalities],desc:describeEffects(c.effects),unlocked:!missing.length,requirement:missing.length ? missing.join('；') : '已满足真实前置',missing,
    art:{ status:c.art.status, characterId:c.characterId, cardAsset:c.art.cardAsset || null, originalCredit:c.art.originalCredit || null, source_url:c.art.source_url || null, derivativeCredit:c.art.derivativeCredit || null } };
}
export function queryCatalogue(config, query = {}) {
  const search = String(query.search || '').trim().toLowerCase().slice(0,80), pageSize = 24;
  let cards = CATALOG_CARDS.filter(c => c.id !== 'basic');
  if (query.scope !== 'all') cards = cards.filter(c => c.modalities.includes(config.modality));
  if (search) cards = cards.filter(c => `${c.name} ${c.characterId} ${c.id}`.toLowerCase().includes(search));
  if (query.tag && TAGS.includes(query.tag)) cards = cards.filter(c => c.archetypeTags.includes(query.tag));
  if (query.character) cards = cards.filter(c => c.characterId === query.character);
  if (query.cost !== undefined && query.cost !== '') cards = cards.filter(c => c.cost === Number(query.cost));
  if (query.tier) cards = cards.filter(c => c.tier === query.tier);
  if (query.availability === 'unlocked') cards = cards.filter(c => catalogueUnlocked(c.id,config));
  if (query.availability === 'locked') cards = cards.filter(c => !catalogueUnlocked(c.id,config));
  if (Array.isArray(query.excludeIds)) { const excluded=new Set(query.excludeIds);cards=cards.filter(c=>!excluded.has(c.id)); }
  const pages = Math.max(1,Math.ceil(cards.length/pageSize)), page = Math.max(0,Math.min(pages-1,Number.isSafeInteger(query.page)?query.page:0));
  return { catalogFingerprint:CATALOG_FINGERPRINT,total:cards.length,page,pages,pageSize,cards:cards.slice(page*pageSize,(page+1)*pageSize).map(c => cardSummary(c,config)),tags:[...TAGS],characters:[...new Set(POST_CARD_CATALOG.cards.map(c => c.characterId))] };
}
export function catalogueDeckEffect(deck) {
  const cards = [...new Set(deck)].filter(id => id !== 'basic').map(catalogueCard).filter(Boolean);
  let best = { count:0,id:'',name:'基础训练方案' };
  for (const r of [...POST_CARD_RECIPES.recipes].sort((a,b) => a.id.localeCompare(b.id))) {
    const visit = (i, used) => {
      if(i===r.roles.length)return 0;
      let best=0;
      for(const [j,c] of cards.entries())if(!used.has(j)&&(!r.roles[i].kind||c.kind===r.roles[i].kind)&&r.roles[i].tags.some(t=>c.archetypeTags.includes(t))){
        best=Math.max(best,1+visit(i+1,new Set([...used,j])));
        if(best===r.roles.length-i)return best;
      }
      return Math.max(best,visit(i+1,used));
    };
    const count = visit(0,new Set()); if (count > best.count) best = {count,id:r.id,name:r.name};
  }
  const coverage = [0,.35,.7,1][best.count];
  return { efficiency:.90+.10*coverage,coverage,scheme:best.name,recipeId:best.id,matchedRoles:best.count };
}
