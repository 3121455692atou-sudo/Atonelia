import {postOnlyStateValid} from './post_only.js';
// 当前存档的只读校验入口。接口名称沿用调用点，但不再迁移、补字段或清理旧内容。
// 旧版/缺失版本必须新开局；成功只深拷贝并验证同一 schema，输入对象永不改变。
import { VERSION, COMPANY_BY_ID } from '../data/core.js';
import { automationStateError } from './automation.js';
import { validatePostState } from './post_exposure.js';
import { validatePostSessionSave } from './post_plan_state.js';
import { knownQueueItem } from './queue.js';
import { guardOldFields, ensureJobs } from './jobs.js';
import { P, companyKnown, specError } from './provider.js';
import { JOBS, LAB } from '../data/balance.js';
import { ensureRoute } from './route.js';
import { ensureSota } from './sota.js';
import { ensureStrategy } from './strategy.js';
import { ensureNaming } from './naming.js';
import { ensureExpect } from './expect.js';
import { normalizeDistill } from './data_ops.js';
import { MS_VER } from './milestones.js';

export const SAVE_VERSION = VERSION;
const plain = x => !!x && typeof x === 'object' && !Array.isArray(x);
const oldFields = ['mig', 'done', 'timers', 'cooldowns', 'riskMods', 'lastAction', 'lastReport', 'grace', 'project', 'focus', 'verNext'];
const arrays = ['queue','models','orders','scheduled','research','techs','goals','evals','history','news','log','smallShelf','deploy'];
const objects = ['company','data','capital','jobs','expect','strategy','sota','route','ms','flags','due','cool','seen','marks','risk','service','products','market','gpus','legal','computeLedger'];
const finiteTree = (x, seen = new WeakSet()) => {
  if (typeof x === 'number') return Number.isFinite(x);
  if (!x || typeof x !== 'object') return true;
  if (seen.has(x)) return false;
  seen.add(x);
  const ok = Object.values(x).every(v => finiteTree(v, seen));
  seen.delete(x);
  return ok;
};
const isoDay = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0,10) === x;
const JOB_KINDS = new Set(['pretrain', 'distill', 'finetune', 'post', 'trial']);
function jobsOk(s) {
  const J = s.jobs;
  if (!plain(J) || !Array.isArray(J.list) || !J.list.every(j => plain(j) && JOB_KINDS.has(j.kind) && !Object.hasOwn(j,'legacyMin'))) return false;
  const base = J.list.filter(j => ['pretrain','distill','finetune'].includes(j.kind));
  const pending = [s.smallWorking,...s.smallShelf].filter(Boolean).length;
  return base.filter(j => j.line !== 'small').length <= 1 && base.filter(j => j.line === 'small').length + pending <= JOBS.SMALL_LINE
    && J.list.filter(j => j.kind === 'trial').length <= LAB.PARALLEL;
}
export function validateGame(s) {
  try {
    return !!(plain(s) && s.v === SAVE_VERSION && companyKnown(s.charId,s.company)
      && !Object.keys(s).some(k=>oldFields.includes(k)) && arrays.every(k=>Array.isArray(s[k])) && objects.every(k=>plain(s[k]))
      && typeof s.date === 'string' && /^\d{4}-\d{2}$/.test(s.date) && isoDay(s.day)
      && ['playing','ended','crashed','frozen'].includes(s.status) && ['llm','image','music','speech'].includes(s.mod) && s.company.modality===s.mod
      && ['cash','team','health','morale','know','equity','valuation'].every(k=>Number.isFinite(s[k]))
      && plain(s.data.pool) && plain(s.data.pool.mix) && plain(s.data.post) && plain(s.data.distill) && plain(s.data.risky) && Array.isArray(s.data.acquired)
      && plain(s.strategy.done) && plain(s.strategy.rights) && Array.isArray(s.legal.cases)
      && s.models.every(m=>plain(m) && typeof m.id==='string' && plain(m.dims) && plain(m.base) && plain(m.post)
        && (m.stage !== 'released' || ['main','side','small'].includes(m.line)))
      && typeof s.computeLedger.month==='string' && /^\d{4}-\d{2}$/.test(s.computeLedger.month)
      && ['days','owned','rented','leaseRevenue','inferCapSum'].every(k=>Number.isFinite(s.computeLedger[k]) && s.computeLedger[k]>=0)
      && (s.computeLedger.lastDay===null || isoDay(s.computeLedger.lastDay)) && !Object.hasOwn(s.computeLedger,'estimatedDays')
      && s.msVer === MS_VER && !Object.hasOwn(s.data,'teacherCap') && !Object.values(s.data.distill||{}).some(x=>typeof x==='number')
      && jobsOk(s) && postOnlyStateValid(s) && finiteTree(s));
  } catch { return false; }
}
function queueError(s) {
  if (!s.queue.every(q=>knownQueueItem(s,q))) return '存档含未知事件，不能静默删除，请新开一局';
  for (const x of s.scheduled) {
    if (!plain(x) || (x.item && !knownQueueItem(s,x.item)) || (x.world && !P().worldEvent(x.world))) return '存档含未知或损坏的排期，不能静默修补，请新开一局';
  }
  return null;
}
export function migrateGame(raw) {
  const fail = reason => ({ok:false,notes:[],reason});
  try {
    if (!plain(raw)) return fail('存档不是一个对象');
    if (!Number.isInteger(raw.v) || raw.v !== SAVE_VERSION) return fail(`不支持旧版或未知存档（v${String(raw.v)}）；当前只接受 v${SAVE_VERSION}，请新开一局，原档未修改`);
    const ae = automationStateError(raw); if (ae) return fail(ae);
    if (!Object.hasOwn(COMPANY_BY_ID,raw.charId)) {
      if (raw.company?.custom !== true) return fail('存档里的公司认不出来');
      const why=specError(raw.company); if(why)return fail(`存档里的自定义公司 spec 不合法：${why}`);
    }
    if (!validateGame(raw)) return fail('当前存档未通过结构/数值检查，不修补旧字段；请新开一局，原档未修改');
    const s=JSON.parse(JSON.stringify(raw));
    const before=JSON.stringify(s);
    for(const check of [ensureJobs,ensureRoute,ensureSota,ensureStrategy,ensureNaming,ensureExpect,normalizeDistill]) check(s);
    validatePostState(s);
    validatePostSessionSave(s);
    const qe=queueError(s);if(qe)return fail(qe);
    if(JSON.stringify(s)!==before)return fail('存档需要结构修补；本版本不兼容旧档，请新开一局');
    guardOldFields(s);
    return {ok:true,s,notes:[]};
  } catch(e) { return fail(`读档时出错：${e?.message||e}`); }
}
