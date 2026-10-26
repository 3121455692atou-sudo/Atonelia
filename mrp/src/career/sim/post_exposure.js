import { P } from './provider.js';
import { assertRandomWorld, validatePostRandom, POST_RANDOM_DEFAULT } from './post_random.js';
import { validateSavedPostCardPlans } from './post_cards.js';
// Versioned risk ledger. Actual m.post remains realized Q contribution.
export const riskPost = m => m?.postExposureVersion === 1 ? m.postExposure : m?.post;
const plain = p => p && typeof p === 'object' && !Array.isArray(p) && [Object.prototype, null].includes(Object.getPrototypeOf(p));
const valid = p => plain(p) && Number.isFinite(p.own) && p.own >= 0 && Number.isFinite(p.dist) && p.dist >= 0 && plain(p.teachers) && Object.values(p.teachers).every(x => Number.isFinite(x) && x >= 0);
export function initializeExposure(m) {
  if (!valid(m.post)) throw Error('后训练贡献账损坏');
  if (m.postExposureVersion !== undefined && m.postExposureVersion !== 1) throw Error('未知后训练暴露账版本');
  if (m.postExposureVersion === 1) { if (!valid(m.postExposure)) throw Error('后训练暴露账损坏'); return false; }
  m.postExposure = structuredClone(m.post); m.postExposureVersion = 1; return true;
}
function validatedDraft(s, allowEnable) {
  if (s.postCards === undefined && !allowEnable) {
    if (s.models.some(m => m.postExposureVersion !== undefined || m.postExposure !== undefined)) throw Error('暴露账缺少显式玩法版本');
    return null;
  }
  if (s.postCards !== undefined && s.postCards?.version !== 1) throw Error('未知后训练卡牌版本');
  if (s.postCards === undefined && s.models.some(m => m.postExposureVersion !== undefined || m.postExposure !== undefined)) throw Error('暴露账缺少显式玩法版本');
  const postCards = s.postCards === undefined ? { version: 1, plans: {}, lastDays: {} } : structuredClone(s.postCards);
  const models = s.models.map(m => { const x = structuredClone(m); initializeExposure(x); return x; });
  validateSavedPostCardPlans({ ...s, postCards, models });
  return { postCards, models };
}
function commitDraft(s, draft) {
  if (!draft) return;
  // Only commit once all ledgers, plans, references and versions have validated.
  s.postCards ??= draft.postCards;
  s.models.forEach((m,i) => { if (m.postExposureVersion !== 1) { m.postExposure=draft.models[i].postExposure; m.postExposureVersion=1; } });
}
// 校验既有账本，不把缺失字段转换为新账；启用新玩法仍走显式初始化。
export function validatePostState(s) {
 if (s.postCards !== undefined && s.postCards?.version !== 1) throw Error('未知后训练卡牌版本');
 if (s.postRandom !== undefined) validatePostRandom(s);
 else if (s.postCards !== undefined) validateSavedPostCardPlans(s);
 const enabled=s.postRandom !== undefined || s.postCards !== undefined;
 for(const m of s.models) {
   if(enabled && (m.postExposureVersion !== 1 || !valid(m.postExposure) || !valid(m.post))) throw Error('当前后训练缺少完整贡献/风险账；不兼容旧存档，请新开一局');
   if(!enabled && (m.postExposureVersion !== undefined || m.postExposure !== undefined)) throw Error('暴露账缺少显式玩法版本');
 }
}
// 内核显式启用入口；不是读档迁移，也不向网络开放。
export function enablePostCards(s) {
  if (s.postRandom !== undefined || P().world?.settings?.mp) throw Error('卡牌后训练仅限单机且不能与随机并存');
  if (s.status !== 'playing') throw Error('游戏已结束');
  commitDraft(s, validatedDraft(s, true));
}

export function inheritPostTeachers(s, m, teachers) {
  if (s.postCards?.version === 1 || s.postRandom?.version === 1) { initializeExposure(m); m.postExposure.teachers = { ...teachers }; }
  else m.post.teachers = { ...teachers };
}

// Internal experiment activation only; callers cannot supply coefficients or seed.
export function enablePostRandom(s) {
 if(s.status !== 'playing') throw Error('游戏已结束');
 const w=assertRandomWorld(s);
 if(s.postCards !== undefined) throw Error('卡牌和随机后训练不可并存');
 if(s.postRandom !== undefined) { validatePostRandom(s); for(const m of s.models){if(m.postExposureVersion!==1) throw Error('随机后训练缺少暴露账');initializeExposure(structuredClone(m));} return; }
 if(s.models.some(m=>m.postExposureVersion!==undefined || m.postExposure!==undefined)) throw Error('孤立暴露账');
 const postRandom={mode:'random',version:1,range:{...POST_RANDOM_DEFAULT},runSeed:w.postTrainingSeed ?? w.seed,companyId:s.charId,lastDays:{}};
 const models=s.models.map(m=>{const copy=structuredClone(m);initializeExposure(copy);return copy;});
 validatePostRandom({...s,postRandom,models});
 s.postRandom=postRandom;s.models.forEach((m,i)=>{m.postExposure=models[i].postExposure;m.postExposureVersion=1;});
}
