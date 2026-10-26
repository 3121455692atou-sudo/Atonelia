import { POST_CARD_CATALOG } from '../data/post_card_catalog.js';
import { CATALOG_FINGERPRINT, CATALOG_RULES } from './post_catalog.js';
export const POST_PLAN_FORMAT = 'solo-post-plan-catalog-v2';
export const POST_PLAN_RULES = CATALOG_RULES;
const profile = (modality, starter, contrast, align, replay, finish, finishTech) => Object.freeze({ modality, starter, contrast, align, replay, finish, finishTech });
export const NATIVE_CARD_PROFILES = Object.freeze({
  image2: profile('image', 'img_base', 'aesthetic_rl', 'flow', 'img_dalle3', 'img_watermark', 'c2pa'),
  midjourney: profile('image', 'img_base', 'aesthetic_rl', 'flow', 'mj_v5', 'mj_v6', 'recaption'),
  suno: profile('music', 'mus_base', 'codec', 'lyric_align', 'su_bark', 'su_v3', 'lyric_align'),
  elevenlabs: profile('speech', 'tts_base', 'zero_shot', 'flow_tts', 'el_beta', 'el_multilingual', 'flow_tts'),
});
export function nativeCardProfile(s) {
  const p = NATIVE_CARD_PROFILES[s?.charId];
  return p && p.modality === s?.mod ? { ...p, id: `native-${s.charId}-v1`, companyId: s.charId } : null;
}
export function postPlanSchema(s) {
  if (!s || !['llm','image','music','speech'].includes(s.mod) || (s.company && s.company.modality !== s.mod) || typeof s.charId !== 'string') return null;
  if (s.mod !== 'llm' && !nativeCardProfile(s)) return null;
  return {format:POST_PLAN_FORMAT,rules:POST_PLAN_RULES,policy:'model-general',profileId:'catalog-v1',catalogVersion:POST_CARD_CATALOG.version,catalogFingerprint:CATALOG_FINGERPRINT,modality:s.mod,companyId:s.charId};
}
export const postPlanSupported = s => !!postPlanSchema(s);
export function postPlanIdentity(s) { const schema=postPlanSchema(s);return schema ? {profileId:schema.profileId,catalogVersion:schema.catalogVersion,catalogFingerprint:schema.catalogFingerprint,modality:schema.modality,companyId:schema.companyId} : {}; }
export function validPostPlanIdentity(s,value) { const schema=postPlanSchema(s);return !!schema && !!value && Object.entries(postPlanIdentity(s)).every(([k,v])=>value[k]===v); }
export function recognizedPostPlanLedger(s) { return s?.postPlanSessions?.format===POST_PLAN_FORMAT && validPostPlanIdentity(s,s.postPlanSessions); }
// Old native mapping below is retained only for the eight-card numerical fixture.
export function nativeProfileForConfig(config) {
  const p = nativeCardProfile({ charId: config?.companyId, mod: config?.modality });
  return p && config.profileId === p.id ? p : null;
}
export function nativeCardUnlocked(id, config) {
  const p = nativeProfileForConfig(config);
  if (!p) return false;
  const has = t => config.techs?.includes(t), done = n => !!config.strategy?.done?.[n];
  return ['basic', 'filter', 'verify'].includes(id) || id === 'curriculum' && has(p.starter)
    || id === 'contrast' && has(p.contrast) || id === 'align' && has(p.align)
    || id === 'replay' && done(p.replay) || id === 'finish' && done(p.finish) && has(p.finishTech);
}
export function nativeCardRequirement(id, config) {
  const p = nativeProfileForConfig(config);
  if (!p) return '不支持的模态解锁规则';
  if (['basic', 'filter', 'verify'].includes(id)) return '基础卡';
  const key = { curriculum: p.starter, contrast: p.contrast, align: p.align }[id];
  return key ? `本模态研究：${key}` : id === 'replay' ? `公司策略：${p.replay}` : `公司策略：${p.finish} ＋ 本模态研究：${p.finishTech}`;
}
