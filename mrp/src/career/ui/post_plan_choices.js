// Presentation only. Inputs are the current public view/card summaries, never a
// session ledger, draw ticket or RNG. Do not call choose/settle or use the auto
// player's heuristic futureValue as a promised reward.
import { POST_CARD_RECIPES } from '../data/post_card_catalog.js';

export const CHOICE_TAG_NAMES = Object.freeze({filter:'筛选',curriculum:'课程',stability:'稳定',contrast:'对照',economy:'节省',transfer:'转化',reserve:'预约',calibration:'校准',verify:'验证',finish:'收束',breadth:'多路',sequence:'分步',distill:'蒸馏'});
const METHOD_NAMES = Object.freeze({...CHOICE_TAG_NAMES,train:'训练',prepare:'准备'});
export const choiceMethodName = value => Object.hasOwn(METHOD_NAMES,value) ? METHOD_NAMES[value] : String(value ?? '');
// Translate only the method slots in public prose. Never edit the catalogue/DSL,
// conditions, or unknown tokens; callers still escape the complete displayed text.
export const choiceRuleDescription = value => String(value ?? '').replace(/(上手方法含\s+|已用\s+)([\w-]+)/g,
  (_,prefix,method) => prefix + choiceMethodName(method));
export const CHOICE_METERS = Object.freeze({
  focus: Object.freeze({name:'聚焦',use:'提升训练牌基础得分：训练得分 × (1 + 聚焦)（上限 4）'}),
  flow: Object.freeze({name:'积累',use:'每回合按层数额外得分（每层 3 分），随后衰减 1 层（上限 8）'}),
  shield: Object.freeze({name:'稳定',use:'出牌时优先抵扣费用（上限 4）'}),
  boost: Object.freeze({name:'校准',use:'本回合训练得分翻倍，每回合衰减 1 点（上限 2）'}),
});
const n = value => Number.isFinite(value) ? value : 0;

export function choiceProjection(view, preview) {
  const remaining = Math.max(0, 6 - n(view.turn));
  const out = { id:preview.id,remaining,affordable:!!preview.affordable,paid:n(preview.paid),
    role:preview.id === 'basic' ? '基础练习 · 0 费保底' : preview.card.kind === 'prepare' ? '准备牌 · 状态积累' : '训练牌 · 结算得分' };
  if (!preview.affordable) return {...out,error:preview.error || '预算不足',budgetAfter:null,meters:[]};
  const meters = Object.entries(CHOICE_METERS).map(([key,meta]) => ({key,...meta,before:n(view[key]),after:n(preview.projected?.[key]),delta:n(preview.projected?.[key])-n(view[key])}));
  const useful = meters.filter(m => m.after > 0 || m.delta !== 0);
  const carry = remaining === 0 ? '最后一回合' : useful.length ? useful.map(m=>`${m.name} ${m.before}→${m.after}`).join(' · ') : '无状态变动';
  const addedPending = Math.max(0,n(preview.projected?.pendingCount) - (view.pending || []).length);
  return {...out,instant:n(preview.instant),tick:n(preview.tick),total:n(preview.total),budgetAfter:n(view.budget)-n(preview.paid),
    discount:Math.max(0,n(preview.card.cost)-n(preview.paid)),meters,carry,addedPending,
    timing:remaining ? `还剩 ${remaining} 回合` : '最后一回合',
    // Due turns are already public. Payloads, later draws and future scores are
    // intentionally absent from this projection.
    knownPending:(view.pending || []).map(({dueTurn})=>({dueTurn})),
  };
}

function matchRecipe(cards, recipe) {
  let best = {count:-1,roles:[]};
  function visit(i, used, roles) {
    if(best.count===recipe.roles.length)return;
    if (i === recipe.roles.length) { const count=roles.filter(Boolean).length;if(count>best.count)best={count,roles};return; }
    const role=recipe.roles[i];
    for(const card of cards) if(!used.has(card.id) && (!role.kind || card.kind===role.kind) && role.tags.some(t=>card.tags.includes(t)))
      visit(i+1,new Set([...used,card.id]),[...roles,card]);
    visit(i+1,used,[...roles,null]);
  }
  visit(0,new Set(),[]);
  return {id:recipe.id,name:recipe.name,count:best.count,roles:recipe.roles.map((role,i)=>({
    tags:[...role.tags],kind:role.kind || null,label:`${role.tags.map(t=>CHOICE_TAG_NAMES[t]).join(' / ')}${role.kind === 'prepare' ? ' · 准备' : role.kind === 'train' ? ' · 训练' : ''}`,
    card:best.roles[i] ? {id:best.roles[i].id,name:best.roles[i].name} : null,
  }))};
}

export function deckBlueprint(cards, recipeId = null) {
  const unique=[...new Map(cards.filter(c=>c && c.id!=='basic').map(c=>[c.id,c])).values()];
  const recipes=[...POST_CARD_RECIPES.recipes].sort((a,b)=>a.id.localeCompare(b.id)).map(r=>matchRecipe(unique,r));
  const match=recipes.reduce((a,b)=>b.count>a.count?b:a,recipes[0]);
  const best=match.count ? match : {id:'',name:'基础训练方案',count:0,roles:[]};
  const selected=recipes.find(r=>r.id===recipeId) || (match.count ? match : recipes[0]);
  return {recipes,best,selected,prepare:unique.filter(c=>c.kind==='prepare').length,train:unique.filter(c=>c.kind==='train').length};
}
