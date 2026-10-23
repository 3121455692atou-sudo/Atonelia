// 存档迁移（规格 E8）：migrateGame(raw) → { ok, s?, notes: string[], reason? }，永不抛错；validateGame 是读档后的结构检查。
// 步骤：1 形状检查 → 2 深拷贝（原档不动）→ 3 结构步骤（v3 先打旧补丁，再逐版升级），末尾补 s.expect → 4 特性步骤（s.mig）
//      → 5 清理队列里认不出的项 → 6 结构检查。
// 结构版本跟着 data/core.js 的 VERSION 走：P0.3b 起是 4。v3 存档先打旧补丁（migrations/legacy.js），再跑 v3→v4 结构步骤
// （migrations/v4_structure.js），然后执行全部特性步骤；新开局的存档在 createGame 里记成特性步骤都执行过。
// 存档键 mrp.sim.v2 是存储位置，s.v 是结构版本，两回事；第一次迁移前备份原文（mrp.sim.v2.bak）是界面的事（ui/storage.js）：
// 读到的原文 v 小于 SAVE_VERSION（没写 v 的按 3）时，先把原文存进 mrp.sim.v2.bak，再调 migrateGame。
import { VERSION, COMPANY_BY_ID } from '../data/core.js';
import { FEATURES, FEATURE_STEPS } from './migrations/index.js';
import { patchV3 } from './migrations/legacy.js';
import { toV4 } from './migrations/v4_structure.js';
import { ensureExpect } from './expect.js';
import { ensureStrategy } from './strategy.js';
import { knownQueueItem } from './queue.js';
import { guardOldFields } from './jobs.js';
import { P, companyKnown, specError } from './provider.js';
import { JOBS, LAB } from '../data/balance.js';

export { FEATURES };
export const SAVE_VERSION = VERSION;
// 结构步骤：STEPS[n] 把 v = n 的存档升到 n + 1。
const STEPS = { 3: toV4 };
const OLDEST = 3;
// 特性步骤从这个结构版本起执行（新开局的存档在 createGame 里由 stampFeatures 记成全部执行过）。
const FEATURES_FROM = 4;

export function migrateGame(raw) {
  const notes = [];
  const fail = reason => ({ ok: false, notes, reason });
  try {
    // 1) 形状检查。
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('存档不是一个对象');
    if (!Object.hasOwn(COMPANY_BY_ID, raw.charId)) {
      // 自定义公司（规格 M.3.1）：不要求在 24 家里，但 s.company 里的 spec 必须合法。
      if (raw.company?.custom === true) {
        const why = specError(raw.company);
        if (why) return fail(`存档里的自定义公司 spec 不合法：${why}`);
      } else return fail(raw.charId == null ? '存档里没有记着是哪家公司' : `存档里的公司认不出来：${String(raw.charId)}`);
    }
    if (typeof raw.date !== 'string' || typeof raw.day !== 'string') return fail('存档里没有日期');
    if (!Array.isArray(raw.models) || !Array.isArray(raw.queue)) return fail('存档里没有模型表或事件队列');
    // 2) 深拷贝；没有版本号的按 v3。
    const s = JSON.parse(JSON.stringify(raw));
    s.v = Number.isInteger(raw.v) ? raw.v : 3;
    if (s.v > SAVE_VERSION) return fail(`存档是新版本（v${s.v}）存的，这一版游戏只认到 v${SAVE_VERSION}`);
    if (s.v < OLDEST) return fail(`存档版本太旧（v${s.v}），读不了`);
    // 3) 结构步骤。v3 先打 v1.0 之前的旧补丁。
    if (s.v === 3) patchV3(s);
    while (s.v < SAVE_VERSION) {
      const step = STEPS[s.v];
      if (!step) return fail(`升级到 v${s.v + 1} 失败：没有这一步`);
      try { step(s); } catch (e) { return fail(`升级到 v${s.v + 1} 失败：${e.message}`); }
      s.v += 1;
    }
    // 结构步骤末尾，每份存档都执行：补市场期待的状态（旧发布不补评）。
    ensureExpect(s);
    // 4) 特性步骤：按 FEATURES 的顺序，没执行过的执行一次（要求幂等），记进 s.mig。
    if (SAVE_VERSION >= FEATURES_FROM) {
      s.mig ??= {};
      for (const key of FEATURES) {
        if (s.mig[key]) continue;
        try { FEATURE_STEPS[key](s); } catch (e) { return fail(`迁移「${key}」失败：${e.message}`); }
        s.mig[key] = true;
      }
      // 4b) 开发期存档兜底：mig 已经记成执行过、策略树却没有补上的（G1 以后、P2.2 以前新开的存档，那时
      // initStrategy 还是空存根），读档时就补，不用等推进第一天。ensureStrategy 自己幂等，内部先调 ensureSota。
      try { ensureStrategy(s); } catch (e) {
        return fail(`补开发期存档的策略树失败：${e.message}`);
      }
    }
    // 5) 队列和排期里认不出的项（种类或 id 不认识）丢掉，写进 notes。
    sanitizeQueue(s, notes);
    // 6) 结构检查。
    if (!validateGame(s)) return fail('读进来的存档没通过结构检查');
    // s.project、s.focus 已删除（P2.4a）：装上读旧字段报错的取值器（不可枚举，不进存档）。
    guardOldFields(s);
    return { ok: true, s, notes };
  } catch (e) {
    return fail(`读档时出错：${e?.message || e}`);
  }
}

// 新开局：结构版本到 4 以后，把全部特性步骤记成执行过（新存档不需要迁移）。v3 时什么都不写。
export function stampFeatures(s) {
  if (SAVE_VERSION >= FEATURES_FROM) s.mig = Object.fromEntries(FEATURES.map(k => [k, true]));
}

function sanitizeQueue(s, notes) {
  const what = q => `${q?.kind ?? 'event'}${q?.id !== undefined ? ` ${q.id}` : ''}`;
  s.queue = s.queue.filter(q => knownQueueItem(s, q) || (notes.push(`丢掉了一条认不出的事件：${what(q)}`), false));
  if (!Array.isArray(s.scheduled)) return;
  s.scheduled = s.scheduled.filter(x => {
    if (!x || typeof x !== 'object') { notes.push('丢掉了一条坏的排期'); return false; }
    if (x.item && !knownQueueItem(s, x.item)) { notes.push(`丢掉了一条认不出的排期事件：${what(x.item)}`); return false; }
    if (x.world && !P().worldEvent(x.world)) { notes.push(`丢掉了一条认不出的行业大事：${x.world}`); return false; }
    return true;
  });
}

const JOB_KINDS = new Set(['pretrain', 'distill', 'finetune', 'post', 'trial']);
// 训练作业（T11.3）：作业表是数组、每项种类合法；主线底座类作业不超过 1 项，小模型线不超过 3 个，试验不超过 2 项。
// 不查作业位：裁员、把卡租出去以后作业位变少，已有的作业照跑，只是不能再开新的。
function jobsOk(s) {
  const J = s.jobs;
  if (!J || typeof J !== 'object' || !Array.isArray(J.list)) return false;
  if (!J.list.every(j => j && typeof j === 'object' && JOB_KINDS.has(j.kind))) return false;
  const base = J.list.filter(j => ['pretrain', 'distill', 'finetune'].includes(j.kind));
  const pending = [s.smallWorking, ...(Array.isArray(s.smallShelf) ? s.smallShelf : [])].filter(Boolean).length;
  return base.filter(j => j.line !== 'small').length <= 1 && base.filter(j => j.line === 'small').length + pending <= JOBS.SMALL_LINE
    && J.list.filter(j => j.kind === 'trial').length <= LAB.PARALLEL && Array.isArray(s.evals);
}
export function validateGame(s) {
  return !!(s && s.v === SAVE_VERSION && companyKnown(s.charId, s.company) && typeof s.date === 'string' && typeof s.day === 'string'
    && Array.isArray(s.queue) && Array.isArray(s.models) && Array.isArray(s.orders)
    && (SAVE_VERSION < FEATURES_FROM || FEATURES.every(k => s.mig?.[k] === true)) && jobsOk(s));
}
