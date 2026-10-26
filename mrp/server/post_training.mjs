// Server-owned MP post-training schema; no card session or client reward arguments.
import { enablePostRandom, initializeExposure } from '../src/career/sim/post_exposure.js';
import { validatePostRandom } from '../src/career/sim/post_random.js';
export const MP_POST_TRAINING = Object.freeze({ mode: 'random', version: 1 });
export function validatePostTrainingRule(rule) {
 if(!rule || typeof rule!=='object' || Array.isArray(rule) || rule.mode!=='random' || rule.version!==1 || Object.keys(rule).some(k=>!['mode','version'].includes(k))) throw Error('不支持旧版或未知后训练联机规则；原存档保留');
}
export function validatePostTrainingStart(args) {
 validatePostTrainingRule(args?.postTraining);
 if(!Number.isInteger(args?.postTrainingSeed)||args.postTrainingSeed<0||args.postTrainingSeed>0xffffffff)throw Error('联机开局日志缺少服务器后训练种子');
}
export function enableWorldPostTraining(world, seed) {
 if(!Number.isInteger(seed) || seed<0 || seed>0xffffffff) throw Error('联机后训练缺少有效服务器随机种子');
 if(!world?.settings?.mp) throw Error('后训练联机规则需要联机世界');
 if(world.settings.postTraining !== undefined) throw Error('不能重复初始化联机后训练世界');
 world.postTrainingSeed=seed;
 // The world is newly created and has not been published/committed to a room yet.
 for(const c of Object.values(world.companies)) if(c.s) enablePostRandom(c.s);
 world.settings.postTraining={...MP_POST_TRAINING};
 validateWorldPostTraining(world);
 return world;
}
function validateCompany(s,seed,id) {
 if(s.postCards !== undefined) throw Error('联机存档禁止卡牌会话');
 validatePostRandom(s);
 if(s.charId!==id || s.postRandom.runSeed!==seed) throw Error('联机后训练公司或世界身份不匹配');
 for(const m of s.models){if(m.postExposureVersion!==1)throw Error('联机后训练缺少模型暴露账');initializeExposure(structuredClone(m));}
}
export function validateWorldPostTraining(world) {
 if(!world?.settings?.mp) throw Error('联机后训练存档不是联机世界');
 validatePostTrainingRule(world.settings.postTraining);
 if(!Number.isInteger(world.postTrainingSeed)||world.postTrainingSeed<0||world.postTrainingSeed>0xffffffff)throw Error('联机后训练缺少服务器随机种子');
 for(const [id,c] of Object.entries(world.companies)) if(c.s) validateCompany(c.s,world.postTrainingSeed,id);
}
// Runs before migrateWorld: old/unknown/corrupt files are rejected without repairing bytes.
export function validatePostTrainingSnapshot(raw) {
 if(!raw || raw.kind!=='world' || !raw.world || !Array.isArray(raw.companies)) throw Error('联机后训练快照格式无效');
 validatePostTrainingRule(raw.settings?.postTraining);validatePostTrainingRule(raw.world.settings?.postTraining);
 if(!Number.isInteger(raw.world.postTrainingSeed)||raw.world.postTrainingSeed<0||raw.world.postTrainingSeed>0xffffffff)throw Error('联机后训练快照缺少服务器随机种子');
 if(!raw.world.settings.mp || raw.seed!==raw.world.seed)throw Error('联机后训练快照世界身份不匹配');
 const seen=new Set();
 for(const row of raw.companies){const s=row.s,id=s?.charId;if(!raw.world.companies?.[id] || seen.has(id))throw Error('联机后训练快照公司表损坏');seen.add(id);validateCompany(s,raw.world.postTrainingSeed,id);}
 for(const [id,c] of Object.entries(raw.world.companies)) if(c.frozen!==true && !seen.has(id))throw Error('联机后训练快照缺少公司状态');
}
