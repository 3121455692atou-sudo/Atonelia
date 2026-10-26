import { postPlanSupported } from './post_card_profiles.js';
// Product-only new single-player entry. Raw engine constructors remain shared
// by simulations, bot companies and MP and must never implicitly enable cards.
import { createGame } from './game.js';
import { P } from './provider.js';
import { assertSoloPostPlans, enablePostPlanSessions } from './post_plans.js';

export function createSinglePlayerGame(charId, scenarioId, seed) {
  if (P().world || P().mirror) throw Error('请先离开当前世界，再开始新的史实单机局');
  const s = createGame(charId, scenarioId, seed);
  if (postPlanSupported(s)) enablePostPlanSessions(s);
  return s;
}

export function initializeSoloPostPlans(world, playerId) {
  if (!world || P().world !== world || world.settings?.mp || world.mirror || P().mirror) throw Error('只能在真实单机世界初始化后训练卡牌');
  const c = world.companies?.[playerId], s = c?.s;
  if (world.settings?.you !== playerId || c?.kind !== 'human' || s?.charId !== playerId) throw Error('后训练卡牌只能初始化当前玩家公司');
  if (world.tickNo !== 0 || s.day !== world.startDay) throw Error('后训练卡牌只能随新局初始化，不迁移旧局');
  assertSoloPostPlans(s, { world, companyId: playerId });
  if (postPlanSupported(s)) enablePostPlanSessions(s);
  return s;
}
