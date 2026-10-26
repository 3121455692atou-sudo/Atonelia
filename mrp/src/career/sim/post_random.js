// Experimental server-owned daily randomness. No client command exposes seed/rate.
import { P } from './provider.js';
// Deterministic uint32 hash with avalanche; no gameplay RNG consumption.
function random01(key) { let h=2166136261; for(let i=0;i<key.length;i++) {h^=key.charCodeAt(i);h=Math.imul(h,16777619);} h^=h>>>16;h=Math.imul(h,0x85ebca6b);h^=h>>>13;h=Math.imul(h,0xc2b2ae35);h^=h>>>16;return (h>>>0)/4294967296; }
export const POST_RANDOM_DEFAULT = Object.freeze({ min: .97, max: 1 });
const plain = x => x && typeof x === 'object' && !Array.isArray(x) && [Object.prototype,null].includes(Object.getPrototypeOf(x));
const dayOK = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0,10) === d;
export function validatePostRandom(s) {
 const r=s.postRandom;
 if (s.postCards !== undefined) throw Error('卡牌和随机后训练不可并存');
 if (!plain(r) || r.mode !== 'random' || r.version !== 1) throw Error('未知随机后训练格式');
 if (!plain(r.range) || !Number.isFinite(r.range.min) || !Number.isFinite(r.range.max) || r.range.min < .97 || r.range.max > 1 || r.range.min > r.range.max) throw Error('随机后训练范围无效');
 if (s.mod !== 'llm') throw Error('随机后训练暂仅支持LLM');
 if (!Number.isInteger(r.runSeed) || r.runSeed < 0 || r.runSeed > 0xffffffff || typeof r.companyId !== 'string' || r.companyId !== s.charId) throw Error('随机后训练身份不匹配');
 if (!plain(r.lastDays) || (r.lastTickDay !== undefined && (!dayOK(r.lastTickDay) || r.lastTickDay > s.day))) throw Error('随机后训练日账损坏');
 for (const [id,day] of Object.entries(r.lastDays)) if (!s.models.some(m=>m.id===id) || !dayOK(day) || day>s.day || !r.lastTickDay || day>r.lastTickDay) throw Error('随机后训练模型日账损坏');
 return r;
}
export function assertRandomWorld(s) {
 const w=P().world;
 if (!w?.settings?.mp || !Object.values(w.companies).some(c=>c.s===s)) throw Error('随机后训练只允许权威联机世界');
 if(s.postRandom !== undefined && s.postRandom.runSeed !== (w.postTrainingSeed ?? w.seed)) throw Error('随机后训练世界seed不匹配');
 return w;
}
export function dailyPostRandomRate(s,m) {
 const r=validatePostRandom(s);
 if (!s.models.includes(m)) throw Error('随机后训练目标不存在');
 const u=random01(JSON.stringify(['post-random',1,r.runSeed,r.companyId,m.id,m.gen,s.day]));
 return r.range.min+(r.range.max-r.range.min)*u;
}
