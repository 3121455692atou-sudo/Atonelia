// Explicit single-player gameplay policy. Never calls the full bot planner:
// card decks, hands and controlMode remain exclusively player-controlled.
import {enableAutomation,configureAutomationBatch} from './automation.js';
import {setAutoRepair,postJobFor,jobCheck} from './jobs.js';
import {trainablePostModel,postPlanView,postPlanModelToken} from './post_plan_state.js';
import {applyCommand} from './commands.js';
import {economicOps} from './bot_economy.js';
import {resolveAll} from './bot_events.js';
import { P } from './provider.js';
import { automationBudget } from './automation.js';
const local = s => !P().world?.settings?.mp && !P().mirror && s?.postRandom === undefined;
export const isPostOnly = s => s?.flags?.postOnly?.version === 1 && local(s);
export function postOnlyStateValid(s) {
  const p=s?.flags?.postOnly;
  if(p===undefined)return true;
  return p && typeof p==='object' && !Array.isArray(p) && Object.keys(p).length===4 && p.version===1
    && (p.lastDay===null || (typeof p.lastDay==='string' && /^\d{4}-\d{2}-\d{2}$/.test(p.lastDay) && Number.isFinite(Date.parse(p.lastDay)) && new Date(p.lastDay).toISOString().slice(0,10)===p.lastDay && p.lastDay<=s.day))
    && p.previousModes && Object.keys(p.previousModes).length===6 && Object.keys(s.automation?.modules||{}).every(k=>['manual','auto'].includes(p.previousModes[k]))
    && Object.values(s.automation?.modules||{}).every(m=>m.mode==='auto')
    && typeof p.lastIssue==='string' && p.lastIssue.length<=300 && local(s) && !!s.postPlanSessions && !!s.automation;
}
export function enablePostOnly(s) {
  if(!local(s)||!s?.postPlanSessions)throw Error('只后训练仅用于本版本新建单机卡牌局');
  enableAutomation(s);
  if(s.flags.postOnly!==undefined) {if(!postOnlyStateValid(s))throw Error('只后训练策略损坏');return;}
  const previousModes=Object.fromEntries(Object.entries(s.automation.modules).map(([k,m])=>[k,m.mode]));
  const modules=Object.keys(previousModes).filter(k=>previousModes[k]!=='auto');
  if(modules.length)configureAutomationBatch(s,{modules,mode:'auto',expectedRev:s.automation.rev,requestId:`post-only:on:${s.automation.rev}`});
  s.flags.postOnly={version:1,lastDay:null,lastIssue:'',previousModes};
}
export function postOnlyEvents(s) {
  if(!isPostOnly(s)||s.status!=='playing')return;
  if(!postOnlyStateValid(s))throw Error('只后训练策略损坏');
  // These are ordinary world/company events, not postPlan card sessions.
  try {resolveAll(s);}catch(e){s.flags.postOnly.lastIssue=String(e.message).slice(0,300);}
}
export function postOnlyBlockedTraining(s) {
  if(!isPostOnly(s)||s.status!=='playing')return [];
  return s.models.filter(m=>trainablePostModel(s,m.id)&&!m.evalId).flatMap(m=>{
    const job=postJobFor(s,m);
    return job&&(job.paused||job.bench)?[{modelId:m.id,jobId:job.id,modelToken:postPlanModelToken(s,m.id),paused:!!job.paused,bench:job.bench||null,focus:!!s.jobs.focusPause?.includes(job.id)}]:[];
  });
}
export function pendingPostOnlySession(s) {
  if(!isPostOnly(s))return null;
  return Object.values(s.postPlanSessions.sessions).find(p=>{
    const m=s.models.find(m=>m.id===p.modelId),job=m&&postJobFor(s,m);
    return s.postPlanSessions.byModel[p.modelId]===p.id && ['draft','playing'].includes(p.status) && trainablePostModel(s,p.modelId) && !m.evalId && !job?.paused && !job?.bench;
  })?.id ?? null;
}
export function postOnlyDay(s) {
  if(!isPostOnly(s)||s.status!=='playing')return;
  postOnlyEvents(s);
  const p=s.flags.postOnly;
  if(s.queue.length||p.lastDay===s.day)return;
  p.lastDay=s.day;p.lastIssue='';
  const a=s.automation;
  if(a.window?.day!==s.day)a.window={day:s.day,allowance:automationBudget(s).allowance,spent:0};
  try {
    economicOps(s,{budget:automationBudget(s).remaining,allowIpo:true,onSpend:n=>{if(s.automation.window?.day===s.day)s.automation.window.spent+=n;}});
    setAutoRepair(s,true);
  } catch(e){p.lastIssue=String(e.message).slice(0,300);}
  // Only real trainable models. Existing session/replan checks enforce generation,
  // actual unlocks, no rerolls and no extra card rewards or model resources.
  for(const m of s.models.filter(m=>trainablePostModel(s,m.id)&&!m.evalId)) {
    try {
      const id=s.postPlanSessions.byModel[m.id];
      let v=id?postPlanView(s,id):null;
      if(v?.status==='active'&&v.replan.available) {
        const r=applyCommand(s,{name:'postPlan.replan',args:{sessionId:id,expectedRevision:v.revision}});
        if(r.ok)v=r.result;
      }
      let job=postJobFor(s,m);
      if(!job) {
        const target=m.id===s.working?'main':m.id===s.prevWorking?.id?'prev':`small:${m.id}`;
        const spec={kind:'post',target,dir:'auto',until:'none'};
        if(!jobCheck(s,spec).ok)continue;
        const r=applyCommand(s,{name:'startJob',args:{spec}});if(!r.ok)continue;
      }
      if(!v)applyCommand(s,{name:'postPlan.open',args:{modelId:m.id,expectedModelToken:postPlanModelToken(s,m.id)}});
    }catch(e){p.lastIssue=String(e.message).slice(0,300);}
  }
}

export function setPlayMode(s,mode) {
  if(!local(s)||!s?.postPlanSessions)throw Error('仅本版本单机卡牌局可切换玩法');
  if(mode==='post'){enablePostOnly(s);return {note:'已切换只后训练，下一游戏日起自动经营；后训练选牌仍由你操作'};}
  if(mode!=='full')throw Error('未知玩法');
  if(!s.flags.postOnly)return {note:'当前已是完整玩法'};
  if(!postOnlyStateValid(s))throw Error('只后训练策略损坏');
  const previous=s.flags.postOnly.previousModes;delete s.flags.postOnly;
  for(const mode of ['auto','manual']) {
    const modules=Object.keys(previous).filter(k=>previous[k]===mode&&s.automation.modules[k].mode!==mode);
    if(modules.length)configureAutomationBatch(s,{modules,mode,expectedRev:s.automation.rev,requestId:`post-only:off:${s.automation.rev}`});
  }
  return {note:'已切回完整玩法并恢复原六项托管；已有订单、融资、训练与手动牌局不撤销'};
}
