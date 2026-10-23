// 读档特性步骤「jobs」（规格 T11.3、E8，P2.4a）：要求幂等。只对 P2.4a 之前的存档执行（新开局在 createGame 里记成执行过）。
// - s.project → 一项底座类作业：pj 是原对象原样；蒸馏进小模型线，其余进主线；优先；rush = flags.push；
//   legacyMin = 迁移当天按旧规则分到的卡数（团队在后训练时 0.75 × 训练卡，否则整个训练卡），防止“读档就排队”。
// - s.focus：train / benchmax → 主线后训练作业（方向、榜单、since 照搬，一直练，legacyMin = 有项目时 0.25 × 训练卡、否则整个训练卡）；
//   maintain → 检修；research / idle → 不建作业（focusPause = []）；ownOnly → s.jobs.ownOnly。研究、维护、待命的 since 不再保留。
// - 删掉 s.project、s.focus、flags.push、flags.postPaused；补 s.evals、s.prevWorking、s.smallShelf；
//   所有已发布的版本补 evalTier = 'legacy'（不罚旧存档）；蒸馏出身的模型补 m.distillation.gap。
import { initJobs } from '../jobs.js';
import { gpuAllocation, workingModel, studentGap } from '../model.js';

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const own = (s, k) => (Object.getOwnPropertyDescriptor(s, k)?.enumerable ? s[k] : undefined);

export function run(s) {
  if (!isObj(s) || !Array.isArray(s.models) || typeof s.day !== 'string') return;
  if (!isObj(s.jobs) || !Array.isArray(s.jobs.list)) s.jobs = initJobs();
  const J = s.jobs;
  for (const [k, v] of Object.entries(initJobs())) if (J[k] === undefined) J[k] = v;
  const flags = isObj(s.flags) ? s.flags : (s.flags = {});
  const pj = isObj(own(s, 'project')) ? s.project : null;
  const f = isObj(own(s, 'focus')) ? s.focus : null;
  let T = 0;
  try { T = gpuAllocation(s).trainGpus; } catch { T = 0; }
  if (!Number.isFinite(T)) T = 0;
  const w = (() => { try { return workingModel(s); } catch { return null; } })();
  const postOn = !!f && (f.kind === 'train' || f.kind === 'benchmax');
  const add = fields => { J.seq = (Number.isInteger(J.seq) ? J.seq : 0) + 1; J.list.push({ id: `j${J.seq}`, seq: J.seq, ...fields, cap: null, paused: false, queuedDays: 0 }); };
  if (pj && !J.list.some(j => ['pretrain', 'distill', 'finetune'].includes(j?.kind))) {
    const kind = pj.type === 'distill' || pj.type === 'finetune' ? pj.type : 'pretrain';
    const share = postOn && w?.stage === 'post' ? 0.75 : 1;
    add({ kind, line: kind === 'distill' ? 'small' : 'main', prio: 'high', since: s.day, pj, rush: !!flags.push, need0: pj.need, lab: null, legacyMin: Math.round(share * T) });
  }
  if (postOn && !J.list.some(j => j?.kind === 'post')) {
    add({ kind: 'post', line: null, prio: 'normal', since: typeof f.since === 'string' ? f.since : s.day, target: 'main',
      ...(f.kind === 'benchmax' ? { bench: f.bench } : { dir: f.dir || 'auto' }), until: 'none', days: 0, stall: 0, legacyMin: Math.round((pj ? 0.25 : 1) * T) });
  }
  if (f?.kind === 'maintain') J.repair = true;
  if (f && (f.kind === 'research' || f.kind === 'idle') && !Array.isArray(J.focusPause)) J.focusPause = [];
  if (f?.ownOnly) J.ownOnly = true;
  delete s.project;
  delete s.focus;
  delete flags.push;
  delete flags.postPaused;
  if (!Array.isArray(s.evals)) s.evals = [];
  if (s.prevWorking === undefined || (s.prevWorking !== null && !isObj(s.prevWorking))) s.prevWorking = null;
  if (!Array.isArray(s.smallShelf)) s.smallShelf = [];
  for (const m of s.models) {
    if (!isObj(m)) continue;
    // m.sota 挪到评测档后面：sota 特性步骤（排在前面）再跑一遍会删掉重写 m.sota，键的顺序这样才不变（同 route 步骤补许可的做法）。
    if (m.stage === 'released' && !m.evalTier) { m.evalTier = 'legacy'; if ('sota' in m) { const x = m.sota; delete m.sota; m.sota = x; } }
    const d = m.distillation;
    if (isObj(d) && !Number.isFinite(d.gap) && Number.isFinite(m.total)) d.gap = studentGap(m.total, Number.isFinite(m.active) ? m.active : m.total, Number.isFinite(d.tokens) ? d.tokens : 1.5);
  }
}
