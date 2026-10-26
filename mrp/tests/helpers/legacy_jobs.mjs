// 旧的“团队任务”和“训练项目”写法（P2.4a 以前：setFocus、setPush、startProject、startDistill、startFinetune、cancelProject、
// projectTick、dailyFocus，以及 decide 的 train / maintain / research / idle / pretrain / release），P4.1 从引擎里删了。
// 还用这套写法的老测试改调这里；里面全走新接口（训练作业，规格 T 章），语义和删掉前的兼容出口一样。
import * as E from '../../src/career/engine.js';
import { DIRECTIONS } from '../../src/career/data/core.js';
import { BENCH_BY_ID } from '../../src/career/data/benchmarks.js';

const jobsOf = s => s.jobs;
const log = (s, text) => { s.log.push({ date: s.day || s.date, text }); if (s.log.length > 200) s.log.shift(); };
const assertCanAct = s => {
  if (s.status !== 'playing') throw new Error('游戏已经结束');
  if (E.P().queueBlocks && s.queue.length) throw new Error('请先处理眼前的事件');
};

// ---------- 团队任务 ----------
export const FOCUS_LABEL = { train: '后训练', benchmax: '针对榜单训练', maintain: '集群维护', research: '学术交流与研究', idle: '待命' };
// 按作业表推出旧的“团队任务”：检修 → maintain；主线后训练在练（没暂停）→ train / benchmax；否则 research。
export function legacyFocus(s) {
  const J = jobsOf(s);
  const own = J.ownOnly ? { ownOnly: true } : {};
  if (J.repair) return { kind: 'maintain', ...own };
  const j = E.mainPostJob(s);
  if (j && !j.paused) {
    if (j.bench) return { kind: 'benchmax', bench: j.bench, since: j.since, ...own };
    const dir = j.dir === 'auto' ? j.autoDir || (E.postTarget(s, j) ? E.bestDir(s, E.postTarget(s, j)) : null) : j.dir;
    return { kind: 'train', ...(dir ? { dir } : {}), since: j.since, ...own };
  }
  return { kind: 'research', ...own };
}
// 唯一一项底座类作业的载荷（原 s.project）；没有是 null；多于一项时抛错。
export function legacyProject(s) {
  const list = jobsOf(s).list.filter(E.isBaseJob);
  if (list.length > 1) throw new Error('有多项底座类作业，改读作业表');
  return list[0]?.pj ?? null;
}
export const basePj = s => (E.baseJob(s, 'main') || E.baseJob(s, null))?.pj ?? null;
export const rushOn = s => !!(E.baseJob(s, 'main') || E.baseJob(s, null))?.rush;
export function focusLabel(s, f = legacyFocus(s)) {
  if (!f) return FOCUS_LABEL.idle;
  if (f.kind === 'train') return `后训练 · ${DIRECTIONS[s.mod].find(d => d.key === f.dir)?.label || f.dir || '自动'}`;
  if (f.kind === 'benchmax') return `针对 ${BENCH_BY_ID[f.bench]?.name || f.bench} 训练`;
  return FOCUS_LABEL[f.kind] || FOCUS_LABEL.idle;
}
// 主线后训练在排队（分不到最低卡）。
export function postWaiting(s) {
  const j = E.mainPostJob(s);
  if (!j || j.paused || jobsOf(s).repair) return false;
  return E.allocJobs(s).items.find(i => i.job === j)?.why === 'min';
}
// 旧的三种状态互相排斥：train / benchmax 先关检修、恢复“专心研究”暂停的后训练，主线后训练没有就建、有就改方向；
// research / idle 先关检修再专心研究；maintain 开检修；只改 ownOnly 时只调 setOwnOnly。返回旧格式 { kind: 'focus', … }。
export function setFocus(s, f) {
  if (!FOCUS_LABEL[f?.kind]) throw new Error('未知任务');
  const cur = legacyFocus(s);
  const sameKind = cur.kind === f.kind && (f.kind !== 'train' || !f.dir || cur.dir === f.dir) && (f.kind !== 'benchmax' || cur.bench === f.bench);
  let note;
  if (typeof f.ownOnly === 'boolean' && f.ownOnly !== !!jobsOf(s).ownOnly) note = E.setOwnOnly(s, f.ownOnly).note;
  // 显示为研究不等于玩家明确选择专心研究；首次选择仍须记录 focusPause。
  const explicitResearch = (f.kind === 'research' || f.kind === 'idle') && !Array.isArray(jobsOf(s).focusPause);
  if (sameKind && !explicitResearch && (f.kind === 'research' || f.kind === 'idle' || f.kind === 'maintain' || typeof f.ownOnly === 'boolean')) return { kind: 'focus', focus: legacyFocus(s), ...(note ? { note } : {}) };
  if (f.kind === 'train' || f.kind === 'benchmax') {
    const w = E.workingModel(s);
    if (!w || w.stage !== 'post') throw new Error('现在没有可以后训练的模型');
    if (f.kind === 'train' && !E.postPreview(s, f.dir, { model: w })) throw new Error('现在没有可以后训练的模型');
    if (f.kind === 'benchmax' && !E.benchmaxPreview(s, f.bench, w)) throw new Error('现在不能针对这个榜单训练');
    E.setRepair(s, false);
    if (Array.isArray(jobsOf(s).focusPause)) E.focusResearch(s, false);
    const j = E.mainPostJob(s);
    if (j) { j.paused = false; E.setPost(s, j.id, f.kind === 'benchmax' ? { bench: f.bench } : { dir: f.dir }); }
    else E.startJob(s, { kind: 'post', target: 'main', ...(f.kind === 'benchmax' ? { bench: f.bench } : { dir: f.dir }), until: 'none' });
  } else if (f.kind === 'maintain') E.setRepair(s, true);
  else { E.setRepair(s, false); E.focusResearch(s, true); }
  log(s, `团队改做：${focusLabel(s)}`);
  return { kind: 'focus', focus: legacyFocus(s), ...(note ? { note } : {}) };
}
// 给主线底座赶工。
export function setPush(s, on) {
  const j = E.baseJob(s, 'main') || E.baseJob(s, null);
  if (!j || j.kind !== 'pretrain') { if (on) throw new Error('没有进行中的训练项目'); return; }
  E.setRush(s, j.id, on);
}
export const dailyFocus = (s, out) => E.postTick(s, out);

// ---------- 训练项目 ----------
// 开工：立项日志由 startJob 写（主线底座、蒸馏、续训）；旧接口返回作业的载荷 pj。
export const startProject = (s, cfg) => E.startJob(s, { kind: 'pretrain', line: 'main', cfg }).pj;
export const startDistill = (s, cfg) => E.startJob(s, { kind: 'distill', cfg }).pj;
export const startFinetune = (s, cfg) => E.startJob(s, { kind: 'finetune', cfg }).pj;
// 中止训练项目 = 取消主线的底座类作业（没有就取消小模型线的第一项）。
export function cancelProject(s) {
  const job = E.baseJob(s, 'main') || E.baseJob(s, null);
  if (job) E.cancelJob(s, job.id);
}
export const projectTick = (s, report) => E.baseTick(s, report);

// ---------- decide 的旧动作 ----------
// train / maintain / research / idle → 团队任务；pretrain → 主线底座赶工；release → 送评并跳过（档 skip）。其余照旧交给引擎的 decide。
export function decide(s, action, arg = {}) {
  if (['train', 'maintain', 'research', 'idle', 'pretrain', 'release'].includes(action)) assertCanAct(s);
  if (action === 'train') return setFocus(s, arg.dir === 'benchmax' ? { kind: 'benchmax', bench: arg.bench } : { kind: 'train', dir: arg.dir });
  if (action === 'maintain') return setFocus(s, { kind: 'maintain' });
  if (action === 'research') return setFocus(s, { kind: 'research' });
  if (action === 'idle') return setFocus(s, { kind: 'idle' });
  if (action === 'pretrain') {
    const j = E.baseJob(s, 'main');
    if (!j || j.kind !== 'pretrain') throw new Error('没有进行中的训练项目');
    E.setRush(s, j.id, true);
    return { kind: 'pretrain' };
  }
  if (action === 'release') return doRelease(s, arg);
  return E.decide(s, action, arg);
}
// 送评并跳过（档 skip，有代价，T6.5）：role 为 small 时发待发布的小模型，否则发主线在练的模型。
export function doRelease(s, opts = {}) {
  const m = opts.role === 'small' ? (opts.modelId ? s.models.find(x => x.id === opts.modelId) : E.smallModels(s)[0]) : E.workingModel(s);
  if (opts.role === 'small' && !m) throw new Error('没有待发布的小模型');
  return E.submitEval(s, { modelId: m?.id ?? null, tier: 'skip', opts });
}

// ---------- 按月推进（E7：act、runMonth 只留给旧测试） ----------
// 让时间走到下个月 1 号；途中弹出事件就先停下。
export function runMonth(s) {
  const start = s.date;
  let report = null;
  for (let i = 0; i < 40 && s.status === 'playing' && !s.queue.length && s.date === start; i++) {
    const out = E.tickDay(s);
    if (out?.report) report = out.report;
  }
  return report || { date: start, notes: [], partial: true };
}
// 做决定，然后走到下个月 1 号。
export function act(s, action, arg = {}) {
  const result = decide(s, action, arg);
  return { result, report: runMonth(s) };
}
