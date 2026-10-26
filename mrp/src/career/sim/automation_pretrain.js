// v4 pretraining: only an existing public project proposal -> normal startJob.
import {jobCheck,allocJobs,jobEta} from './jobs.js';
import {projectRisk} from './model.js';
import {monthlyCosts,previewService} from './economy.js';
import {withOrders} from './compute.js';
import {FUNDING} from '../data/economy.js';
const clone=s=>JSON.parse(JSON.stringify(s));
export const PRETRAIN_POLICIES=Object.freeze({
  save_cost:{label:'省成本',maxDays:90,maxRisk:.08,keep:.9,buffer:6},
  balanced:{label:'均衡',maxDays:150,maxRisk:.12,keep:.75,buffer:3},
  ceiling:{label:'冲上限',maxDays:150,maxRisk:.18,keep:0,buffer:2},
});
export const pretrainGeneration=s=>`${s.charId}:main:${s.gen}`;
export function pretrainCfgKey(s,c) {return JSON.stringify(s.mod==='llm'?[c?.total,c?.active,c?.arch||((c?.active<c?.total)?'moe':'dense'),c?.tokens]:[c?.scaleId,c?.tokens]);}
export function pretrainLedgerValid(s) {
  const l=s.automation?.pretraining;
  if(!l||!Array.isArray(l.receipts)||l.receipts.some(r=>!r||typeof r.generation!=='string'||typeof r.cfg!=='string'||typeof r.jobId!=='string'||typeof r.day!=='string'))return false;
  if(new Set(l.receipts.map(r=>r.generation)).size!==l.receipts.length)return false;
  if(s.automation.version>=5&&(!Array.isArray(l.trials)||l.trials.some(t=>!t||typeof t.jobId!=='string'||typeof t.generation!=='string'||typeof t.cfg!=='string'||typeof t.day!=='string'||!['running','succeeded','failed','cancelled'].includes(t.status)||(t.status!=='running'&&typeof t.finishedDay!=='string'))))return false;
  if(s.automation.version>=5){
    const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d&&d<=s.day;
    if(new Set(l.trials.map(t=>t.jobId)).size!==l.trials.length||l.trials.some(t=>!validDay(t.day)||(t.status!=='running'&&(!validDay(t.finishedDay)||t.finishedDay<t.day))))return false;
    for(const g of new Set(l.trials.map(t=>t.generation)))if(l.trials.filter(t=>t.generation===g).length>2)return false;
  }
  const h=l.hold;
  return h===null || !!(h&&typeof h.jobId==='string'&&typeof h.generation==='string'&&Number.isFinite(h.amount)&&h.amount>=0&&Number.isFinite(h.monthly)&&h.monthly>=0&&Number.isSafeInteger(h.buffer)&&h.buffer>=2&&h.buffer<=6&&[...l.receipts,...(l.trials||[])].some(r=>r.jobId===h.jobId&&r.generation===h.generation)&&(h.extraDays===undefined||(Number.isFinite(h.extraDays)&&h.extraDays>=0&&h.extraDays<=365)));
}
// Monthly quote is gross cash expenditure, never forecast income or depreciation.
export function pretrainMonthlyQuote(s) {
  const principal=s.capital?.loan?.principal??0,last=s.history?.at(-1)?.costs??0;
  if([principal,last].some(x=>!Number.isFinite(x)||x<0))return null;
  const q=clone(s),committed=withOrders(q,(q.orders||[]).filter(o=>['rent','gpu'].includes(o.kind)));
  const cost=Math.max(monthlyCosts(q).total,monthlyCosts(committed).total),serve=previewService(q).serve??0;
  if([cost,serve,principal,last].some(x=>!Number.isFinite(x)||x<0))return null;
  const actual=cost+serve+principal*FUNDING.LOAN.rate/12;
  return Math.max(actual,last)*1.25;
}
export function pretrainReserve(s) {return [4,5,6].includes(s.automation?.version)?s.automation.pretraining.hold?.amount||0:0;}
export function refreshPretrainHold(s) {
  const l=s.automation?.pretraining,h=l?.hold;if(!h)return;
  const j=s.jobs?.list?.find(x=>x.id===h.jobId);
  if(!j){l.hold=null;return;} // real completion/cancel; permit remains consumed
  try {
    const q=clone(s),job=q.jobs.list.find(x=>x.id===h.jobId),al=allocJobs(q),item=al.items.find(x=>x.job.id===job.id);
    const eta=jobEta(q,job,item),monthly=pretrainMonthlyQuote(s);
    if(monthly===null||!Number.isFinite(eta)||eta<0)return; // paused/unknown: never erase existing protection
    h.monthly=monthly;h.amount=monthly*(Math.ceil((eta+(h.extraDays||0))/30)+h.buffer);
  }catch{/* unavailable quote retains the last explicit protection, not free spending */}
}
export function pretrainingCandidate(s,advice) {
  const block=reason=>({candidate:null,reason});
  const m=s.automation?.modules?.pretraining,p=PRETRAIN_POLICIES[m?.preset];
  if(![4,5,6].includes(s.automation?.version)||m?.mode!=='auto'||!p)return block('预训练筹备由玩家接管或策略不支持');
  if((s.jobs?.list||[]).some(j=>['pretrain','distill','finetune'].includes(j.kind)&&j.line==='main'))return block('已有主线训练（包括手动暂停），不会取消、换项或恢复暂停');
  const gen=pretrainGeneration(s);
  if(s.automation.pretraining.receipts.some(r=>r.generation===gen))return block('本代已自动启动过训练；取消后不自动重开，请手动安排新计划');
  if(advice?.op?.type!=='project')return block('当前无公开的预训练 project 建议；试验/购卡筹备尚未接入');
  const src=advice.op.cfg;
  if(!src||typeof src!=='object')return block('公开项目配置无效');
  const cfg=s.mod==='llm'?{total:src.total,active:src.active,arch:src.arch,tokens:src.tokens}:{scaleId:src.scaleId,tokens:src.tokens};
  if(s.jobs?.plan&&pretrainCfgKey(s,s.jobs.plan)!==pretrainCfgKey(s,cfg))return block('顾问候选与你保存的计划不同，保留你的计划，不自动覆盖');
  try {
    const q=clone(s),spec={kind:'pretrain',line:'main',cfg},check=jobCheck(q,spec);
    if(!check.ok)return block(check.reason);
    if(!Number.isFinite(check.eta)||check.eta<=0||check.eta>p.maxDays)return block(`${p.label}策略只自动接受 ${p.maxDays} 天内的项目；当前约 ${Math.ceil(check.eta)} 天`);
    const before=allocJobs(q),after=allocJobs(q,check.job),extra=after.extra;
    if(!extra?.run||!(extra.cards>0)||extra.cards+1e-7<extra.minCards)return block('当前实际算力不足以立即运行，不自动排队占位');
    for(const old of before.items.filter(x=>x.run)){
      const next=after.items.find(x=>x.job.id===old.job.id);
      if(!next?.run||next.cards+1e-7<Math.max(old.minCards,old.cards*p.keep))return block(`${p.label}策略保护已有运行任务，本项目会挤占其保留算力`);
    }
    const risk=projectRisk(q,check.job.pj.structure);
    if(!Number.isFinite(risk)||risk>p.maxRisk)return block(`${p.label}策略月失败风险上限 ${p.maxRisk*100}%，当前约 ${Math.round(risk*100)}%`);
    const monthly=pretrainMonthlyQuote(s);
    if(monthly===null)return block('无法得到合法持续费用报价，不自动开工');
    const amount=monthly*(Math.ceil(check.eta/30)+p.buffer);
    const last=s.history?.at(-1),burn=Math.max(0,(last?.costs||0)-(last?.revenue||0));
    const floor=Math.max(amount,burn*12);
    if(!Number.isFinite(floor)||!Number.isFinite(s.cash)||s.cash<floor)return block(`运行资金不足：当前成本压力报价需要保护 ${Math.ceil(floor)}，不依赖未来收入或融资`);
    return {candidate:{module:'pretraining',command:{name:'startJob',args:{spec}},cost:0,
      training:{generation:gen,cfg:pretrainCfgKey(s,cfg),amount,monthly,buffer:p.buffer},
      reason:`${p.label}：按公开建议启动预训练，约 ${Math.ceil(check.eta)} 天，月失败风险 ${Math.round(risk*100)}%；启动即时费为0，持续费用照常，保护运行资金 ${Math.ceil(amount)}。`},reason:null};
  }catch{return block('当前模态或资源状态未通过合法预训练预检，不自动开工');}
}
export function commitPretrainReceipt(s,c,result) {
  const job=result?.result;
  if(!job?.id||job.kind!==(c.trial?'trial':'pretrain'))throw new Error('预训练成功命令未返回真实作业，不能记成功');
  const l=s.automation.pretraining,t=c.training;
  if(c.trial)l.trials.push({generation:t.generation,cfg:t.cfg,jobId:job.id,day:s.day,status:'running'});
  else l.receipts.push({generation:t.generation,cfg:t.cfg,jobId:job.id,day:s.day});
  l.hold={generation:t.generation,jobId:job.id,amount:t.amount,monthly:t.monthly,buffer:t.buffer,...(c.trial?{extraDays:t.extraDays}:{})};
}
