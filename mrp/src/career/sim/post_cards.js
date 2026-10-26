import { recognizedPostPlanLedger } from './post_card_profiles.js';
// Internal-only versioned plan ledger. No network/UI arbitrary multiplier action exists.
import { start, choose, settle, validDeck } from './post_card_rules.js';
import { hash01 } from './util.js';
import { activePostSessionEfficiency } from './post_plan_state.js';
import { DIRECTIONS } from '../data/core.js';
const config = s => ({ techs: s.techs, strategy: { done: s.strategy?.done || {} } });
const planKey = m => `${m.id}:writing:0`;
const seedFor = (s,m) => Math.floor(hash01(`${s.seed}|${s.charId}|${m.id}|${m.gen ?? 0}|writing|epoch0|postcards-v1`)*4294967296)>>>0;
function binding(s,j,m) {
  if (s.postCards?.version !== 1 || s.mod !== 'llm' || s.status !== 'playing' || !s.jobs.list.includes(j) || !s.models.includes(m) || j.modelId !== m.id || j.kind !== 'post' || j.bench || j.dir !== 'writing') throw Error('卡牌计划目标或玩法不适用');
}
export function cardJobSupported(s, j) {
  if (j.kind !== 'post' || j.bench) return false;
  // Legacy internal numerical tests retain their writing-only schema. The public
  // v2 model-generation plan applies to every ordinary direction, including auto.
  if (recognizedPostPlanLedger(s)) return j.dir === 'auto' || DIRECTIONS[s.mod].some(d => !d.special && d.key === j.dir);
  return s.mod === 'llm' && j.dir === 'writing';
}
function replay(s,p,m) {
  if (!p || p.version!==1 || p.rulesVersion!==1 || p.epoch!==0 || p.generation!==m.id || p.modelId!==m.id || p.dir!=='writing' || p.seed!==seedFor(s,m) || !Array.isArray(p.choices) || p.choices.length>6 || p.revision!==p.choices.length || !validDeck(p.deck,config(s))) throw Error('后训练计划已失效');
  const session=start(p.seed,1,p.deck,config(s));
  for(const id of p.choices)if(!choose(session,id).ok)throw Error('后训练出牌记录非法');
  return session;
}
export function beginPostCardPlan(s,j,m,deck) {
  binding(s,j,m);const key=planKey(m),old=s.postCards.plans[key];
  if (old) { replay(s,old,m); j.postCardPlanRef=key; return old; }
  if (!validDeck(deck,config(s))) throw Error('卡组含未解锁或非法卡');
  const p={version:1,rulesVersion:1,epoch:0,generation:m.id,modelId:m.id,dir:'writing',seed:seedFor(s,m),deck:[...deck],choices:[],revision:0};
  s.postCards.plans[key]=p;j.postCardPlanRef=key;return p;
}
export function validatePostCardPlan(s,j,m) {
  if (j.postCardPlanRef!==planKey(m) || j.dir!=='writing' || j.modelId!==m.id) throw Error('后训练计划引用失效');
  return replay(s,s.postCards.plans[j.postCardPlanRef],m);
}
export function choosePostCard(s,j,m,id,revision) {
  binding(s,j,m);const session=validatePostCardPlan(s,j,m),p=s.postCards.plans[j.postCardPlanRef];
  if(revision!==p.revision)throw Error('重复或过期出牌');
  if(!choose(session,id).ok)throw Error('非法出牌');
  p.choices.push(id);p.revision++;return settle(session);
}
export function postCardEfficiency(s,j,m) {
  if (s.postCards?.version !== 1) return null;
  if (s.postPlanSessions !== undefined) {
    if (s.status !== 'playing' || !s.jobs.list.includes(j) || !s.models.includes(m) || j.modelId !== m.id || !cardJobSupported(s,j)) throw Error('普通后训练方案目标不适用');
    return activePostSessionEfficiency(s,m);
  }
  binding(s,j,m);const r=settle(validatePostCardPlan(s,j,m));
  if(!r)throw Error('请先完成后训练卡牌计划');
  return r.rate;
}
export function validateSavedPostCardPlans(s) {
  if(s.postCards?.version!==1)return;
  const plain = p => p && typeof p === 'object' && !Array.isArray(p) && [Object.prototype,null].includes(Object.getPrototypeOf(p));
  const validDay = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d+'T00:00:00Z')) && new Date(d+'T00:00:00Z').toISOString().slice(0,10) === d && d <= s.day;
  if(!plain(s.postCards) || !plain(s.postCards.plans) || !plain(s.postCards.lastDays))throw Error('卡牌计划账缺失或损坏');
  if(s.postCards.lastTickDay !== undefined && !validDay(s.postCards.lastTickDay))throw Error('卡牌日结标记损坏');
  for(const [id,day] of Object.entries(s.postCards.lastDays))if(!s.models.some(m=>m.id===id) || !validDay(day) || !s.postCards.lastTickDay || day>s.postCards.lastTickDay)throw Error('卡牌防重日账损坏');
  for(const [key,p] of Object.entries(s.postCards.plans)){
    if(!plain(p))throw Error('卡牌计划记录损坏');
    const m=s.models.find(x=>x.id===p.modelId);
    if(!plain(p) || !m || key!==planKey(m))throw Error('卡牌计划模型不存在');replay(s,p,m);
  }
  for(const j of s.jobs?.list||[])if(j.postCardPlanRef && (!s.postCards.plans[j.postCardPlanRef] || s.postCards.plans[j.postCardPlanRef].modelId!==j.modelId))throw Error('卡牌计划引用不存在或跨模型');
}
