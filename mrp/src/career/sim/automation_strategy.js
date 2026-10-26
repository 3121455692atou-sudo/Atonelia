// Public company-strategy options only. Never cancels, shelves, completes or repairs idle metrics.
import {strategyOptions,canStart,resolvedTree,spiritDef} from './strategy.js';
import {scoreNode} from './strategy_ai.js';
import {START_RESOURCES} from '../data/core.js';
const SAFE_EFFECTS=new Set(['cash','cashOfStart','brand','rep','morale','health','know','team','techRead','techBoost','data','dims','papers','demand']);
export function strategyPresets(s) {
  const rows=[{id:'balanced',label:'均衡发展（不自动改路线或融资）'}];
  for(const [id,label] of Object.entries(resolvedTree(s)?.branches||{}))if(!['route'].includes(id))rows.push({id:`branch:${id}`,label:`方向：${label}`});
  // Frozen card-rules v1 adapter: these are real DeepSeek nodes, not generic company unlocks.
  if(s.automation?.cardDefault==='manual'&&s.charId==='deepseek'&&s.mod==='llm')rows.push({id:'post_cards',label:'后训练卡牌前置优先（DeepSeek）'});
  return rows;
}
export function strategyUpfront(s,n) {
  const e=n.upfront||{};
  if(Object.keys(e).some(k=>!['cash','cashOfStart'].includes(k)))return null;
  if(Object.values(e).some(v=>!Number.isFinite(v)))return null;
  const base=START_RESOURCES[s.company?.tier]?.[s.scenario]?.cash;
  if(e.cashOfStart!==undefined&&(!Number.isFinite(base)||Math.abs(e.cashOfStart)>1))return null;
  const sh=s.strategy?.shelved?.[n.id];
  if(sh&&sh.until>=s.day)return 0;
  return Math.max(0,-(e.cash||0))+Math.max(0,-(e.cashOfStart||0)*(base||0));
}
function safeNode(s,n) {
  if(n.auto||n.ai?.never||n.repeatable||n.stance||n.license||n.excludes?.length)return false;
  if(Object.keys(n.effects||{}).some(k=>!SAFE_EFFECTS.has(k)))return false;
  if((n.effects?.cash||0)<0||(n.effects?.cashOfStart||0)<0)return false; // no deferred uncapped commitment
  const defs=(n.spirits?.add||[]).map(x=>spiritDef(s,typeof x==='string'?x:x.id));
  if(defs.some(d=>!d||d.blocks?.length))return false;
  // Removing an existing trait can change financing/ownership rights; keep it outside this slice.
  if(n.spirits?.remove?.length)return false;
  return true;
}
function related(s,preset,t) {
  if(preset==='balanced')return null;
  const goals=preset==='post_cards'?['ds_found','ds_grpo'].filter(id=>!s.strategy.done[id]):t.nodes.filter(n=>n.branch===preset.slice(7)&&!s.strategy.done[n.id]).map(n=>n.id);
  const ids=new Set();
  function visit(id){if(ids.has(id)||s.strategy.done[id])return;const n=t.byId.get(id);if(!n)return;ids.add(id);for(const group of n.prereq||[])if(!group.some(x=>s.strategy.done[x]))for(const x of group)visit(x);}
  goals.forEach(visit);return ids;
}
export function companyStrategyCandidate(s,remaining) {
  const block=reason=>({candidate:null,reason});
  const m=s.automation?.modules?.companyStrategy;
  if(m?.mode!=='auto')return block('公司策略研究已由玩家接管');
  if(!strategyPresets(s).some(x=>x.id===m.preset))return block('当前公司不支持该策略方向');
  if(s.strategy?.cur)return block(s.strategy.cur.paused?`已有策略因条件暂停：${s.strategy.cur.paused}；保留进度，不自动换项`:'已有公司策略正在推进，不自动搁置或换项');
  if(s.queue?.length)return block('请按正常流程处理当前事件，再安排公司策略');
  const t=s.strategy?.tree?resolvedTree(s):null;if(!t)return block('当前公司尚无可用策略树');
  const relevant=related(s,m.preset,t);let budgetBlocked=false;
  const candidates=[];
  for(const x of strategyOptions(s)) {
    const n=x.node;
    if(x.state!=='available'||!canStart(s,n)||!safeNode(s,n)||(relevant&&!relevant.has(n.id)))continue;
    const score=scoreNode(s,n,'adaptive');if(!(score>0))continue;
    const cost=strategyUpfront(s,n);if(cost===null)continue;
    if(!Number.isFinite(remaining)||cost>remaining){budgetBlocked=true;continue;}
    candidates.push({n,cost,score});
  }
  candidates.sort((a,b)=>b.score-a.score||(a.n.id<b.n.id?-1:1));
  const best=candidates[0];if(!best)return block(budgetBlocked?'符合方向的公司策略超出共享预算，保留现金储备':'当前没有符合方向、公开条件与安全边界的可开策略');
  return {candidate:{module:'companyStrategy',command:{name:'startStrategy',args:{id:best.n.id}},cost:best.cost,reason:`${strategyPresets(s).find(x=>x.id===m.preset).label}：开始「${best.n.title}」，按原规则约 ${best.n.days} 天；预付 ${best.cost}。不改变前置、门槛与完成收益。`},reason:null};
}
