import { nativeCardUnlocked, nativeCardRequirement } from './post_card_profiles.js';
export const CARDS = [
 {id:'filter',name:'星星样本筛选',icon:'✦',cost:1,base:1,focus:2,desc:'聚焦 +2。小小样本，点亮后续每次训练。',kind:'prepare'},
 {id:'verify',name:'双重验证',icon:'◇',cost:1,base:1,shield:3,flow:2,desc:'稳定 +3，积累 +2。先照顾好训练预算。',kind:'prepare'},
 {id:'curriculum',name:'软糖课程',icon:'▧',cost:1,base:1,flow:5,desc:'积累 +5；回合末按层数持续得分。',kind:'prepare'},
 {id:'align',name:'梯度对齐',icon:'✧',cost:2,base:1,boost:2,desc:'校准 2 回合，训练得分 ×2（含本回合）。',kind:'prepare'},
 {id:'replay',name:'难例小回放',icon:'↻',cost:2,base:3,focus:1,desc:'基础 3 分，聚焦和校准放大；得分后聚焦 +1。',kind:'train'},
 {id:'contrast',name:'对照实验',icon:'◈',cost:1,base:2,desc:'基础 2 分；稳定仍在时基础 +2。',kind:'train'},
 {id:'finish',name:'成果收束',icon:'✺',cost:3,base:4,desc:'基础 4 分，积累每层另加 2 基础分；随后清空积累。',kind:'train'},
 {id:'basic',name:'轻轻练一下',icon:'♡',cost:0,base:1,desc:'基础 1 分，聚焦和校准也有效。免费保底。',kind:'train'}
];
export const CAPS={focus:4,flow:8,shield:4,boost:2};
export const DEMO_PROFILES={basic:{label:'初创 · 基础研究',techs:['rlhf'],strategy:{done:{}}},research:{label:'进阶 · DPO / GRPO已完成（演示）',techs:['rlhf','dpo','grpo'],strategy:{done:{}}},company:{label:'策略齐备 · DeepSeek（演示）',techs:['rlhf','dpo','grpo'],strategy:{done:{ds_found:true,ds_grpo:true}}}};
export const REQUIREMENTS={basic:'基础卡',filter:'基础卡',verify:'基础卡',curriculum:'研究：指令微调与RLHF',contrast:'研究：DPO偏好优化',align:'研究：GRPO',replay:'公司策略：从幻方分拆，只做AGI（ds_found）',finish:'公司策略：数学模型与GRPO（ds_grpo）＋研究GRPO'};
export function unlocked(id,config=DEMO_PROFILES.basic){if(config.profileId !== undefined || config.modality !== undefined || config.companyId !== undefined)return nativeCardUnlocked(id,config);const has=t=>config.techs?.includes(t);return ['basic','filter','verify'].includes(id)||id==='curriculum'&&has('rlhf')||id==='contrast'&&has('dpo')||id==='align'&&has('grpo')||id==='replay'&&!!config.strategy?.done?.ds_found||id==='finish'&&has('grpo')&&!!config.strategy?.done?.ds_grpo;}
export function validDeck(deck,config){return Array.isArray(deck)&&deck.length===4&&new Set(deck).size===4&&deck.includes('basic')&&deck.every(id=>unlocked(id,config));}
function bounded(s){for(const [k,max] of Object.entries(CAPS))s[k]=Math.max(0,Math.min(max,Number.isFinite(s[k])?s[k]:0));}
const card=id=>CARDS.find(c=>c.id===id);
function random(s){s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;return s.rng/4294967296;}
function draw(s){const deck=s.deck.filter(id=>id!=='basic'); s.hand=[];for(let i=0;i<2;i++)s.hand.push(deck.splice(Math.floor(random(s)*deck.length),1)[0]);s.hand.push('basic');}
export function start(seed=20261023,limit=.4,deck=['basic','filter','verify','curriculum'],config=DEMO_PROFILES.basic){if(!validDeck(deck,config))throw new Error('卡组须含免费基础卡与三张已解锁不同卡');const s={deck:[...deck],config:JSON.parse(JSON.stringify(config)),version:2,rng:seed>>>0,turn:1,maxTurns:6,budget:8,focus:0,flow:0,shield:0,boost:0,score:0,goal:90,limit:Math.max(0,Number.isFinite(limit)?limit:0),hand:[],status:'playing',log:[],revision:0};draw(s);return s;}
export function preview(state,id){const s={...state};bounded(s);const c=card(id);if(!c||!s.hand.includes(id)||s.status!=='playing')return null;const paid=Math.max(0,c.cost-s.shield);let base=c.base+(id==='contrast'&&s.shield>0?2:0)+(id==='finish'?s.flow*2:0);const instant=c.kind==='train'?base*(1+s.focus)*(s.boost>0?2:1):base;const flow=Math.min(CAPS.flow,(id==='finish'?0:s.flow)+(c.flow||0));return {paid,affordable:paid<=s.budget,instant,tick:flow*3,total:instant+flow*3,formula:c.kind==='train'?`${base} × ${1+s.focus} × ${s.boost>0?2:1}`:`${base}`,card:c};}
export function choose(s,id,revision=s.revision){if(revision!==s.revision)return {ok:false,error:'旧操作已失效'};const p=preview(s,id);if(!p?.affordable)return {ok:false,error:'预算不足或无效卡牌'};bounded(s);const c=p.card;s.budget-=p.paid;s.shield=Math.max(0,s.shield-c.cost)+(c.shield||0);s.focus+=c.focus||0;s.flow=Math.max(0,Math.min(CAPS.flow,(id==='finish'?0:s.flow)+(c.flow||0))-1);s.boost=Math.max(0,(c.boost||s.boost)-1);bounded(s);s.score+=p.total;s.log.push({turn:s.turn,name:c.name,instant:p.instant,tick:p.tick,formula:p.formula,score:s.score});s.revision++;if(s.turn===s.maxTurns){s.status='done';s.mode='manual';s.hand=[];}else{s.turn++;draw(s);}return {ok:true,event:s.log.at(-1)};}
export function deckEffect(deck){const has=id=>deck.includes(id);const pairs=[{ok:has('contrast')&&has('verify'),a:1,name:'偏好对照＋稳定验证'},{ok:has('finish')&&has('curriculum'),a:1,name:'积累课程＋成果收束'},{ok:has('replay')&&has('filter'),a:.6,name:'难例回放＋样本筛选'}].filter(x=>x.ok).sort((a,b)=>b.a-a.a);const best=pairs[0];return {efficiency:.90+.10*(best?.a||0),coverage:best?.a||0,scheme:best?.name||'基础训练方案'};}
export function settle(s){if(s.status!=='done')return null;const prepared=deckEffect(s.deck),executionRate=.97+.03*Math.min(1,s.score/s.goal),rate=prepared.efficiency*executionRate;return {rate,deckEfficiency:prepared.efficiency,executionRate,scheme:prepared.scheme,actual:s.limit*rate,limit:s.limit,score:s.score};}
export function automatic(s,mode='auto'){if(s.status!=='playing')return false;while(s.status==='playing'){const choices=s.hand.map(id=>({id,p:preview(s,id)})).filter(x=>x.p.affordable);choices.sort((a,b)=>(b.p.total+(b.p.card.focus||0)*(7-s.turn)*4+(b.p.card.flow||0)*(7-s.turn)*2)-(a.p.total+(a.p.card.focus||0)*(7-s.turn)*4+(a.p.card.flow||0)*(7-s.turn)*2));choose(s,choices[0].id);}s.mode=mode;return true;}

export const cardRequirement = (id, config) => config?.profileId !== undefined ? nativeCardRequirement(id, config) : REQUIREMENTS[id];
