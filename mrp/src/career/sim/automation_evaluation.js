// v6: one public submitEval; original evalTick publishes on its normal due date.
import {evalLine,submitBlock,evalDaysFor,defaultTier} from './evals.js';
import {releaseLine} from './release.js';
import {releaseNamePlan} from './naming.js';
import {releaseOpenRule} from './route.js';
import {postJobs,postTarget} from './jobs.js';
import {P} from './provider.js';
import {END} from '../data/core.js';
import {addDays,daysInMonth} from './clock.js';
import {postPlanBlocksAutomaticEval,postPlanView} from './post_plan_state.js';
export const EVALUATION_POLICIES=Object.freeze({balanced:{label:'沿现有路线'},cautious:{label:'谨慎发布（从严评测）'}});
const clone=s=>JSON.parse(JSON.stringify(s));
import {evaluationContent} from './automation_evaluation_ledger.js';
export {evaluationContent} from './automation_evaluation_ledger.js';
export function evaluationLedgerValid(s){
  const r=s.automation?.evaluation?.receipts;
  const date=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d&&d<=s.day;
  return Array.isArray(r)&&r.every(x=>x&&typeof x.content==='string'&&x.content.length>0&&typeof x.modelId==='string'&&typeof x.evalId==='string'&&date(x.day))&&new Set(r.map(x=>x.content)).size===r.length;
}
// pendingPlan is supplied by the real single-player card-session integration.
// It must be read-only and return a boolean, not start/confirm/choose a card plan.
export function evaluationCandidate(s,advice,pendingPlan=postPlanBlocksAutomaticEval){
  const block=reason=>({candidate:null,reason}),a=s.automation,m=a?.modules?.evaluation;
  if(a?.version!==6||m?.mode!=='auto'||!EVALUATION_POLICIES[m.preset])return block('评测与发布由玩家接管或版本不支持');
  const raw=advice?.op,op=raw?.arg;if(raw?.type!=='act'||raw.action!=='submit'||typeof op?.modelId!=='string')return block('当前没有合法公开的送评建议');
  try{
    const q=clone(s),model=q.models.find(x=>x.id===op.modelId),line=evalLine(q,model);
    const why=submitBlock(q,model,line);if(why)return block(why);
    if(!model.dims||!Object.values(model.dims).every(Number.isFinite))return block('模型能力数据无效');
    if(!P().world?.settings?.mp){if(typeof pendingPlan!=='function')return block('单机卡牌状态保护接口尚未接入');const pending=pendingPlan(s,model.id);if(pending!==false)return block('该模型的单机后训练方案尚未完成并生效，等待玩家当前方案，不抢先送评');}
    const sessionId=s.postPlanSessions?.byModel?.[model.id];
    if(s.flags?.postOnly?.version===1 && sessionId && postPlanView(s,sessionId).replan.available)return block('真实新卡已解锁，先交给玩家重编后训练，不抢先送评');
    if(line==='small'&&postJobs(q).some(j=>postTarget(q,j)?.id===model.id))return block('小模型仍有后训练任务（含暂停），不借送评移除玩家作业');
    const content=evaluationContent(model);if(a.evaluation.receipts.some(x=>x.content===content))return block('这份模型内容已送评或被主动撤回，切策略不会自动重送；等待真实能力或模型版本变化');
    const rel=releaseLine(q,model);
    if(m.preset==='cautious'&&rel!=='main')return block('谨慎策略不主动发布弱于在线旗舰的副线');
    let tier=m.preset==='cautious'?'full':op.tier;
    if(!['full','standard','quick'].includes(tier))return block('自动送评不跳过安全评测');
    if(defaultTier(q)==='standard'&&tier==='quick')tier='standard'; // automatic policy floor, not a new engine legality gate
    const rule=releaseOpenRule(q,rel==='main'?'flagship':'small'),open=rule.open==='choice'?rule.default:rule.open;
    if(typeof open!=='boolean')return block('现有开闭源路线不明确，不自动决定');
    const named=releaseNamePlan(q,model,{line:rel,open});if(!named.ok)return block(named.reason);
    const days=evalDaysFor(q,tier,line);
    const deadline=P().mode==='sim'?P().world?.end:`${END}-${String(daysInMonth(END)).padStart(2,'0')}`;
    if(typeof deadline!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(deadline)||addDays(s.day,days)>deadline)return block(`临近已知终局 ${deadline||'未知'}：所选评测需要 ${days} 天，无法在截止前完成，不自动送评或跳过评测`);
    return {candidate:{module:'evaluation',cost:0,evaluation:{content,modelId:model.id},
      command:{name:'submitEval',args:{modelId:model.id,tier,open}},
      reason:`${EVALUATION_POLICIES[m.preset].label}：送评「${named.name}」，${days} 天后依原规则自动公开发布；${open?'开放权重':'不开放权重'}，沿现有路线，不发表技术报告、不强行替换较强旗舰。送评即时费用为0，现有运营费用照常。`},reason:null};
  }catch{return block('当前模型未通过合法送评预检');}
}
export function commitEvaluationReceipt(s,c,result){
  const ev=result?.result?.eval;
  if(!ev?.id||ev.modelId!==c.evaluation.modelId)throw Error('送评成功未返回实际评测，不记虚假回执');
  s.automation.evaluation.receipts.push({...c.evaluation,evalId:ev.id,day:s.day});
}

export function evaluationDecision(s,proposals){
  let first=null;
  for(const advice of proposals.filter(x=>x.op?.type==='act'&&x.op.action==='submit')){
    const result=evaluationCandidate(s,advice);if(result.candidate)return result;first??=result;
  }
  return first||{candidate:null,reason:'当前没有合法公开的送评建议'};
}
