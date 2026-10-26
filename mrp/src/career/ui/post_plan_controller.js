import { postPlanView, recommendPostSessionCard } from '../engine.js';
import { commitPostPlanCommand } from './post_plan_transaction.js';
import { getState, getMp } from './state.js';

// One controller per company; animation never runs rules or resubmits an event.
const controllers = new WeakMap();
export function stopPostPlanController(state) {
  const old = controllers.get(state);
  if (old) old.stopped = true;
  controllers.delete(state);
}
export async function resumePostPlanAuto(state, sessionId, { onAccepted = () => {}, onError = () => {} } = {}) {
  stopPostPlanController(state);
  const token = { stopped: false }; controllers.set(state, token);
  try {
    while (!token.stopped && getState() === state && !getMp()) {
      const view = postPlanView(state, sessionId);
      if (view.status !== 'playing' || view.controlMode !== 'auto') break;
      const cardId = recommendPostSessionCard(state, sessionId);
      if (!cardId) throw Error('当前没有可用手牌');
      const result = await commitPostPlanCommand(state, 'postPlan.choose', { sessionId, expectedRevision: view.revision, turn: view.turn, cardId }, { actor: 'auto' });
      if (!token.stopped && getState() === state) await onAccepted(result, view);
      // A dismissed/replaced callback must not leave even a zero-delay continuation.
      if (token.stopped || getState() !== state || getMp()) break;
      // Yield between accepted actions so manual takeover can cancel the next action.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } catch (error) { if (!token.stopped) onError(error); }
  finally { if (controllers.get(state) === token) controllers.delete(state); }
}
