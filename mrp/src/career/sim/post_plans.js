import { postPlanSupported } from './post_card_profiles.js';
import { P } from './provider.js';
import { enablePostCards } from './post_exposure.js';
import { newPostPlanLedger, validatePostSessionSave } from './post_plan_state.js';
export { openPostSession, replanPostSession, updatePostDraft, confirmPostDeck, choosePostSession, controlPostSession } from './post_plan_state.js';

export function assertSoloPostPlans(s, ctx = {}) {
  if (ctx.multiplayer || ctx.world?.settings?.mp || P().world?.settings?.mp || P().mirror || P().world?.mirror) throw Error('联机后训练没有卡牌会话');
  if (s.postRandom !== undefined) throw Error('随机后训练和单机卡牌不能混用');
  if (ctx.companyId !== undefined && ctx.companyId !== s.charId) throw Error('后训练会话不属于当前公司');
}
export function enablePostPlanSessions(s) {
  assertSoloPostPlans(s);
  if (s.status !== 'playing' || !postPlanSupported(s)) throw Error('卡牌后训练只支持正在进行的受支持的单机局');
  if (s.postPlanSessions !== undefined) { validatePostSessionSave(s); return { enabled: true, format: s.postPlanSessions.format }; }
  // No migration from the internal-only experiment. New format/new sessions only.
  if (s.postCards !== undefined) throw Error('不支持旧版卡牌实验存档，请新开一局');
  if ((s.jobs?.list || []).some(j => j.kind === 'post' && (j.bench || j.dir === 'benchmax'))) throw Error('普通卡牌方案不支持刷榜，请先明确调整作业');
  enablePostCards(s);
  s.postPlanSessions = newPostPlanLedger(s);
  return { enabled: true, format: s.postPlanSessions.format };
}
