// v1.0 之前的读档补丁（原来在 game.js 和 migrate.js，由 migrateGame 调用）：只对结构版本 ≤ 3 的存档执行（patchV3），
// 在结构步骤（v3 → v4）之前。继承型号重算结构、进行中的蒸馏补老师快照、已公布成绩补 modelId，以及更早的研究、走私、坏数值归位。
import { COMPANY_BY_ID } from '../../data/core.js';
import { structureForRelease } from '../../data/model_structure.js';
import { RELEASES } from '../../data/rivals.js';
import { daysBetween } from '../clock.js';
import { clsOf, previewDistill, distillTeachers, historyTeacher, DISTILL_MIN_DAYS } from '../model.js';
import { cancelDistill, distillSnapshot, upgradeTrainingAcc } from '../projects.js';
import { startKnow } from '../research.js';
import { initMilestones } from '../milestones.js';

// 读旧存档（研究还是攒点数、历史时刻还按日期弹的版本）：补上研究槽、技术积累和里程碑。
// 存档所在月份之前已经发生的“行业第一次”和玩家已发布的模型，都悄悄记账，不补弹窗。
// v0.9.3 合并只带已收各组的迁移段：走私记账和坏数值归位（A1）、进行中的预训练补分段记账（B4）、
// 继承型号重算结构（B1）、进行中的蒸馏补老师快照（B3）、已公布成绩补 modelId（B2）。超事件积压名单（B6）在紧接着的 v3→v4 结构步骤里丢掉。
// 逐日算力账本（A2）不在这里补，读档后第一天自己建。不收的生成任务、反应式竞争、蒸馏账本、技术上限去重没有迁移段：
// 在途订单原样保留，按原来的到货日交付。每一段都幂等：新版存档再读一遍不会有任何变化。
export function patchV3(s) {
  if (s.know === undefined) {
    const company = COMPANY_BY_ID[s.charId];
    s.know = Math.round((s.rp || 0) * 0.6 + startKnow(company?.tier, s.start || s.date));
    delete s.rp;
  }
  for (const k of ['researchDone', 'techRead', 'techBoost', 'firsts', 'papers']) s[k] = s[k] || {};
  s.research = s.research || [];
  // 旧版下单时就把走私卡记成持有、到货又记一次：在路上的扣回来，等到货再记；持有的走私卡不会比手里的卡多。
  const g = s.gray;
  if (g?.owned) {
    for (const o of s.orders || []) if (o.kind === 'smuggle' && o.held === undefined) { g.owned[o.ref] = Math.max(0, (g.owned[o.ref] || 0) - o.n); o.held = false; }
    for (const id of Object.keys(g.owned)) g.owned[id] = Math.min(g.owned[id], s.gpus?.owned?.[id] || 0);
  }
  // 公开命令现在会拒绝坏数值；旧档里已经写进去的，读档时归位。
  if (!Number.isFinite(s.inferShare)) s.inferShare = 0.3;
  const lease = s.products?.gpu_lease;
  if (lease && !(Number.isFinite(lease.gpus) && lease.gpus >= 0)) lease.gpus = 0;
  // 进行中的预训练补上分段记账的字段（逐日算力账本不用补：读档后第一天自己建，已过的天数按当时配置估）。
  upgradeTrainingAcc(s, s.project);
  migrateStructures(s);
  migrateDistillProject(s);
  linkPublished(s);
  if (!s.ms) { s.ms = {}; initMilestones(s, s.date); }
  // 还在排队的旧版“历史时刻”不再按日期弹出。
  if (Array.isArray(s.scheduled)) s.scheduled = s.scheduled.filter(x => x.item?.kind !== 'history');
}

// 旧档里继承的历史型号按统一的结构解析重算：v0.9 把 Mixtral 8x7B 当 7B 稠密、RWKV 当稠密、前沿闭源算进“大”，2023 年的在训模型 Agent 是 −3。
// 量级变了，已公布成绩里记的量级也跟着改，否则旧的 Mixtral 会留在“小”量级榜上排第一。
// 自研的（带 ver）不动：自研的“文心 5.0”可能和史实那款同名，结构却是玩家自己定的。
export function migrateStructures(s) {
  const plain = n => String(n || '').replace(/（.*?）/g, '').trim();
  const moved = new Map();
  for (const m of s.models || []) {
    if (m.structureSource || m.ver) continue;
    // 先按型号名、真实型号名找；工作副本和它发布的版本只记了产品线（去掉了括号），取开局前这条线最新的一款。
    const rel = RELEASES.find(r => r.mod === m.mod && (r.name === m.name || r.name === m.realName))
      || (m.lineage ? RELEASES.filter(r => r.mod === m.mod && r.date <= (s.start || s.date) && plain(r.name) === plain(m.lineage)).sort((a, b) => a.date.localeCompare(b.date)).pop() : null);
    if (!rel) continue;
    const st = structureForRelease(m.mod, rel);
    Object.assign(m, { total: st.total, active: st.active, arch: st.arch, scaleId: st.scaleId, structureSource: st.source });
    m.cls = clsOf({ mod: m.mod, total: st.total, cls: st.cls });
    for (const k of Object.keys(m.dims || {})) if (m.dims[k] < 0) m.dims[k] = 0;
    moved.set(m.name, m);
  }
  for (const run of Object.values(s.published || {})) {
    const m = run && moved.get(run.model);
    if (m) run.cls = clsOf(m);
  }
  for (const m of moved.values()) for (const run of Object.values(m.benchmarks || {})) run.cls = clsOf(m);
}
// 旧档里进行中的蒸馏项目没有老师快照（v0.9 完工时才按当天的名单找老师，老师掉出名单就练出空能力）。读档时补上（G1-4）：
// 自家老师取在线旗舰；别家按老师家族从历史目录取立项那个月综合最强的开源一款，不受名单前六名限制。
// 已练的进度和算力需求原样保留；7 天流程下限从立项那个月 1 号算起。实在找不到老师才取消，提示写“已取消”。
export function migrateDistillProject(s) {
  const pj = s.project;
  if (pj?.type !== 'distill' || pj.preview) return;
  const start = /^\d{4}-\d{2}$/.test(pj.start || '') ? pj.start : s.date;
  const t = pj.teacher === 'self' ? distillTeachers(s).find(x => x.own) : historyTeacher(pj.teacher, start) || historyTeacher(pj.teacher, s.date);
  const pv = t ? previewDistill(s, pj.cfg || {}, t) : null;
  if (!pv) { cancelDistill(s); return; }
  pj.preview = distillSnapshot(pv);
  pj.minDays = DISTILL_MIN_DAYS;
  pj.elapsedDays = Math.max(0, daysBetween(`${start}-01`, s.day || `${s.date}-01`));
}
// 旧档的已公布成绩只记了型号名：按名字找到那款已发布的模型，补上 modelId（榜单按 modelId 找模型，不按名字）。
export function linkPublished(s) {
  for (const run of Object.values(s.published || {})) {
    if (!run || run.modelId) continue;
    const m = (s.models || []).filter(x => x.stage === 'released' && x.name === run.model && (x.role || 'flagship') === (run.role || 'flagship')).pop();
    if (m) run.modelId = m.id;
  }
}
