// Safe tune only: one existing normal startJob(trial,...plan), no setPlan and no future RNG peek.
import {jobCheck,allocJobs} from './jobs.js';
import {PRETRAIN_POLICIES,pretrainMonthlyQuote,pretrainGeneration,pretrainCfgKey} from './automation_pretrain.js';
import {daysBetween} from './clock.js';
export function trialPreparationCandidate(s,advice) {
  const block=reason=>({candidate:null,reason});
  const m=s.automation?.modules?.pretraining,p=PRETRAIN_POLICIES[m?.preset],l=s.automation?.pretraining;
  if(![5,6].includes(s.automation?.version)||m?.mode!=='auto'||!p)return block('自动调参试训未启用');
  const generation=pretrainGeneration(s);
  if(l.receipts.some(x=>x.generation===generation))return block('本代已经启动预训练，不用取消重开来刷试训');
  if((s.jobs?.list||[]).some(j=>j.kind==='trial'||(['pretrain','distill','finetune'].includes(j.kind)&&j.line==='main')))return block('已有试训或主线训练（包括暂停），保留原任务与控制权');
  const trials=l.trials.filter(x=>x.generation===generation);
  if(trials.some(x=>x.status!=='failed'))return block('本代已有成功、取消或未确认结束的试训，不自动重复抽取结果');
  if(trials.length>=2)return block('本代两次自动调参尝试已用完，不无限试训');
  const last=trials.at(-1);if(last&&daysBetween(last.finishedDay,s.day)<7)return block('上次试训失败后等待 7 个游戏日再进行一次有限重试');
  const op=advice?.op;
  if(op?.type!=='trial'||op.spec?.kind!=='trial'||op.spec.type!=='tune'||!['small','mid'].includes(op.spec.size)||!op.plan)return block('当前没有合法公开的调参试训建议，不自行安排其它试验');
  if(op.spec.plan&&pretrainCfgKey(s,op.spec.plan)!==pretrainCfgKey(s,op.plan))return block('公开试训配置与目标计划不一致');
  if(s.jobs?.plan&&pretrainCfgKey(s,s.jobs.plan)!==pretrainCfgKey(s,op.plan))return block('试训建议与你保存的计划不同，不自动覆盖');
  try {
    const q=JSON.parse(JSON.stringify(s));
    const src=op.plan,plan=s.mod==='llm'?{total:src.total,active:src.active,arch:src.arch,tokens:src.tokens}:{scaleId:src.scaleId,tokens:src.tokens};
    const spec={kind:'trial',type:'tune',size:op.spec.size,plan};
    const check=jobCheck(q,spec);if(!check.ok)return block(check.reason);
    if(!Number.isFinite(check.eta)||check.eta<=0||check.eta>30)return block('当前试训无法在 30 天内实际运行完成，不自动占坑');
    const old=allocJobs(q),after=allocJobs(q,check.job);
    if(!after.extra?.run||after.extra.cards+1e-7<after.extra.minCards)return block('试训没有足够的已交付算力');
    for(const x of old.items.filter(x=>x.run)){
      const y=after.items.find(y=>y.job.id===x.job.id);
      if(!y?.run||y.cards+1e-7<Math.max(x.minCards,x.cards*p.keep))return block('试训会挤占现有任务的策略保留算力，不调整原任务');
    }
    const project=jobCheck(q,{kind:'pretrain',line:'main',cfg:plan});
    if(!project.ok||!Number.isFinite(project.eta)||project.eta>p.maxDays)return block('该试训目标在当前资源下尚不满足预训练工期保护，不先投入试训');
    const monthly=pretrainMonthlyQuote(s);if(monthly===null)return block('没有合法持续现金成本报价，不自动试训');
    const amount=monthly*(Math.ceil((check.eta+project.eta)/30)+p.buffer);
    const prev=s.history?.at(-1),floor=Math.max(amount,Math.max(0,(prev?.costs||0)-(prev?.revenue||0))*12);
    if(!Number.isFinite(floor)||!Number.isFinite(s.cash)||s.cash<floor)return block(`试训与后续项目运行资金不足，需保护 ${Math.ceil(floor)}，不依赖未来营收`);
    return {candidate:{module:'pretraining',command:{name:'startJob',args:{spec}},cost:0,trial:true,
      training:{generation,cfg:pretrainCfgKey(s,plan),amount,monthly,buffer:p.buffer,extraDays:project.eta},
      reason:`${p.label}：真实${op.spec.size==='mid'?'中档':'小档'}调参试训，约 ${Math.ceil(check.eta)} 天，公开成功率 ${Math.round(check.job.odds*100)}%；保留试训及后续项目运行资金 ${Math.ceil(amount)}。按原规则实际完成后才使用结论。`},reason:null};
  }catch{return block('当前资源或模态未通过合法试训预检');}
}
