// v2: allocation only. No purchases, leases, repair or task-control side effects.
import { allocJobs } from './jobs.js';
import { inferGpuEq } from './model.js';
import { daysBetween } from './clock.js';
const clone = s => JSON.parse(JSON.stringify(s));
function actualLoad(s) {
  const need=s.service?.last?.needGpu;
  if(!Number.isFinite(need)||need<=0)return null;
  let cap=inferGpuEq(s);
  if(s.service.routing.startsWith('quant'))cap*=1.35;
  if(s.service.routing.startsWith('distill'))cap*=1.9;
  return cap>0?need/cap:Infinity;
}
export function allocationCandidate(s, advice) {
  const block=reason=>({candidate:null,reason});
  const m=s.automation?.modules?.computeAllocation,v=advice?.op?.value;
  if(![2,3,4,5,6].includes(s.automation?.version)||m?.mode!=='auto')return block('算力分配已手动接管或版本未接入');
  if(advice?.op?.type!=='infer'||!Number.isFinite(v)||v<.05||v>.9||v===s.inferShare)return block('没有合法的算力份额调整建议');
  if(m.lastSuccessDay && daysBetween(m.lastSuccessDay,s.day)<3)return block('算力分配冷却中：上次成功调整后等待 3 个游戏日');
  if((m.preset==='service_first'&&v<s.inferShare)||(m.preset==='training_first'&&v>s.inferShare))return block('本次调整方向不符合所选算力策略');
  if(!['balanced','service_first','training_first'].includes(m.preset))return block('不支持的算力策略');
  try {
    const before=clone(s),after=clone(s);after.inferShare=v;
    const old=allocJobs(before),next=allocJobs(after);
    if(old.items.some(x=>x.run&&!next.items.some(y=>y.job.id===x.job.id&&y.run)))return block('调整会使正在运行的作业失去最低算力，保留当前分配');
    // Exclude in-transit GPUs: future delivery must not excuse current service starvation.
    const load=actualLoad(after);
    if(v<s.inferShare&&(load===null||!Number.isFinite(load)||load>.8))return block('当前实际服务容量不足以安全下调，未把在途显卡当作已交付');
    return {candidate:{module:'computeAllocation',command:{name:'setInferShare',args:{v}},cost:0,
      reason:`${advice.detail||advice.label||'按公开顾问建议分配算力'} 推理比例 ${Math.round(s.inferShare*100)}%→${Math.round(v*100)}%；现有 ${old.items.filter(x=>x.run).length} 个运行作业仍满足最低算力。`},reason:null};
  } catch {return block('当前模态或资源状态无法完成合法算力预检，未调整');}
}
