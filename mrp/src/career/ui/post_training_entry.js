// UI entry only: no card scoring, dealing, automatic control or daily settlement.
import * as E from '../engine.js';
import { isRemote } from './act.js';
import { getWorld, getMp } from './state.js';
import { commitPostTraining } from './post_plan_transaction.js';

export const postTrainingAvailable = S => !!S?.postPlanSessions && E.postPlanSupported(S) && !getMp() && !isRemote()
  && !getWorld()?.settings?.mp && !getWorld()?.mirror && !E.P().world?.settings?.mp && !E.P().mirror && S.postRandom === undefined;
export const usesPostTrainingCards = (S, spec) => postTrainingAvailable(S) && spec?.kind === 'post' && !spec.bench;

export function pendingPostTraining(S, target = null) {
  if (!postTrainingAvailable(S)) return null;
  return (S.jobs?.list || []).find(job => {
    if (job.kind !== 'post' || job.bench || job.paused || (target && job.target !== target)) return false;
    const model = E.postTarget(S, job);
    if (!model || !E.trainablePostModel(S, model.id)) return false;
    const session = S.postPlanSessions.sessions[S.postPlanSessions.byModel[model.id]];
    return !session || ['draft', 'playing'].includes(session.status);
  }) || null;
}

export function beginPostTraining(S, spec, options = {}) {
  if (!usesPostTrainingCards(S, spec)) throw Error('当前后训练不使用单机卡牌入口');
  return commitPostTraining(S, spec, options);
}

export function showPostTraining(st, result) {
  st.postPlanSessionId = result.postPlan.sessionId;
  st.postPlanEvent = null;
  st.postPlanError = null;
  st.postPlanInfo = false;
  st.postPlanSelected = null;
  st.newJob = null;
  st.post = null;
  st.postPlanAutoEnter = false;
  return { note: ['ready', 'active'].includes(result.postPlan.status)
    ? '后训练已安排，继续使用已完成方案' : '后训练已安排：先完成卡组与六手演练，默认手动' };
}
