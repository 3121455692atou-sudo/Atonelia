import * as E from '../engine.js';
import {esc,icon} from './fmt.js';
import {getState,openLayer,closeLayer} from './state.js';
import {openOffice} from './office.js';

export function homeTrainingActions() {
  return `<nav class="home-training" aria-label="模型训练"><button class="home-training-post" data-act="open-post-training">${icon('layers')}<b>后训练</b>${icon('next')}</button><button class="home-training-model" data-act="open-model-training">${icon('train')}<b>模型训练</b></button></nav>`;
}
export function homePostTargets(S) {
  const seen=new Set();
  return [[E.workingModel(S),'main'],[E.prevModel(S),'prev'],...E.smallModels(S).map(m=>[m,`small:${m.id}`])]
    .filter(([m])=>m&&m.stage==='post'&&!m.evalId&&!seen.has(m.id)&&seen.add(m.id))
    .map(([m,target])=>({id:m.id,target,label:E.modelLabel(m),job:E.postJobFor(S,m),session:S.postPlanSessions?.sessions[S.postPlanSessions.byModel[m.id]]}));
}
export function openHomePostTraining() {
  const S=getState();if(!S||S.status!=='playing')return;
  const targets=homePostTargets(S);
  const root=openLayer(`<section class="picker home-post-picker" aria-label="选择后训练模型"><div class="picker-head"><h3>后训练哪个模型？</h3><button class="icon-btn" data-close aria-label="返回主页">${icon('close')}</button></div><p>后训练会改进已有模型。先选模型，再安排训练。</p>
    <div class="home-post-models">${targets.map(t=>`<button class="pick-row" data-home-post-model="${esc(t.id)}"><span><b>${esc(t.label)}</b><small>${t.session&&['draft','playing'].includes(t.session.status)?'继续卡牌训练':t.job?'查看当前训练':'安排后训练'}</small></span>${icon('next')}</button>`).join('')||'<p class="muted">还没有可以后训练的模型。先完成一次预训练，再回来继续。</p>'}</div>
    <button class="btn" data-home-model-training>${targets.length?'其他模型训练':'开始预训练'}</button></section>`,'overlay--picker');
  root.addEventListener('click',event=>{
    if(event.target.closest('[data-close]')||event.target===root)return closeLayer();
    if(getState()!==S)return closeLayer();
    if(event.target.closest('[data-home-model-training]'))return openOffice('train',{trainingKind:targets.length?'overview':'pretrain'});
    const button=event.target.closest('[data-home-post-model]');if(!button)return;
    const target=homePostTargets(S).find(t=>t.id===button.dataset.homePostModel);if(!target)return;
    if(target.session)return openOffice('train',{postPlanSessionId:target.session.id});
    openOffice('train',target.job?{trainingKind:'overview'}:{post:target.target,trainingKind:'post'});
  });
}
