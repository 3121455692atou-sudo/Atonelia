// Read-only status: a trainable base is not proof that a training job is running.
import * as E from '../engine.js';
export function postOnlyStatus(s) {
  if(!E.isPostOnly(s))return {phase:'off',text:''};
  if(s.status!=='playing')return {phase:'ended',text:'本局已经结束，训练不再推进。'};
  const blocked=E.postOnlyBlockedTraining(s);
  if(blocked.length)return {phase:'blocked',text:'训练已暂停，请选择要继续的模型。'};
  if(E.pendingPostOnlySession(s))return {phase:'cards',text:'轮到你选牌了。'};
  const al=E.allocJobs(s),eligible=s.models.filter(m=>E.trainablePostModel(s,m.id));
  if(eligible.some(m=>s.postPlanSessions.sessions[s.postPlanSessions.byModel[m.id]]?.status==='ready'))return {phase:'activation',text:'训练方案已就绪，下一天开始生效。'};
  const actual=al.items.filter(x=>x.job.kind==='post'&&x.run&&!x.job.bench);
  if(actual.length) {
    const active=actual.filter(x=>{const m=E.postTarget(s,x.job),id=m&&s.postPlanSessions.activeByModel[m.id],p=id&&s.postPlanSessions.sessions[id];return p?.status==='active'&&p.effectiveFromDay<=s.day;}).length;
    return {phase:active?'running':'running-without-plan',text:`${actual.length} 项训练进行中${active?` · ${active} 项方案已生效`:''}。`};
  }
  if(s.flags.postOnly.lastDay===null)return {phase:'not-started',text:'尚未推进首个游戏日，点击开始准备模型。'};
  const post=al.items.filter(x=>x.job.kind==='post');
  if(post.length)return {phase:'waiting',text:post.some(x=>x.why==='repair')?'设备检修中，修好后继续训练。':'训练排队中，等待设备空闲。'};
  const first=al.items.find(x=>x.job.kind!=='post'&&x.run);
  const eta=first?E.jobEta(s,first.job,first):null;
  return {phase:eligible.length?'pending-job':'preparing',text:eligible.length?'模型已准备好，正在安排训练。':Number.isFinite(eta)?`${{pretrain:'底座训练',trial:'调参试训',distill:'蒸馏',finetune:'续训'}[first.job.kind]||'模型准备'}中 · 约剩 ${Math.max(1,Math.ceil(eta))} 天`:'模型准备中，完成后会提醒你选牌。'};
}
