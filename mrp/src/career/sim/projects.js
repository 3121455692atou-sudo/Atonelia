// 训练项目：预训练、蒸馏和续训的立项检查、载荷（作业的 pj）、炼完出模型、中止和取消。按天推进在 jobs.js（规格 T 章）。
import { TECH_BY_ID, ARCHS, dimKeys, fmtDate } from '../data/core.js';
import { FAMILIES } from '../data/rivals.js';
import { structureForRelease } from '../data/model_structure.js';
import { SYNTH_TAINT, DISTILL_GAP, JOBS } from '../data/balance.js';
import { clamp, round1 } from './util.js';
import { scaleById, clsOf, poolStats, llmBase, nonLlmBase, previewDistill, distillTeachers, DISTILL_MIN_DAYS, pretrainRepeat, pretrainCredit, MAX_EPOCHS, liveModel, workingModel, gpuCount, costPerMillion, knowledgeCap, birthClamp, licenseOf, taintCaps, lowerQTo, studentGap } from './model.js';
import { qOf, isMine, relDims } from './sota.js';
import { recordTeacher } from './data_ops.js';
import { log } from './log.js';
import { draftNameOf, draftNameError } from './naming.js';
import { P } from './provider.js';
import { noticeOf } from './queue.js';
import { addDays } from './clock.js';
import { ensureJobs, hasBaseJob, smallLineCount, jobsLog } from './jobs.js';
import { refModel, applyLabDims } from './lab.js';

// 深拷贝：模型和快照里只有能存进 JSON 的数据。开局、发布、蒸馏立项都用它。
export const structuredCloneSafe = x => JSON.parse(JSON.stringify(x));

export function newModel(s, st, extra = {}) {
  // 编号按模型表长度取；读档时清掉过孤儿副本的存档，表变短了，顺延到没人用过的编号。
  let n = s.models.length + 1;
  while (s.models.some(m => m.id === `m${n}_${s.date}`)) n += 1;
  const stage = extra.stage || 'post';
  return {
    // 名字只在发布时起（C1）：没发布的模型 name = null，界面显示代号 draftName 或“第 N 代底座”（naming.js 的 displayName）。
    id: `m${n}_${s.date}`, name: extra.name ?? null, ...(extra.draftName ? { draftName: extra.draftName } : {}), mod: s.mod, role: extra.role || 'flagship',
    // 出身（规格 D1）：预训练（含续训）出来的记 pretrain，蒸馏出来的小模型记 distill；role 只表示它在哪条流水线上。
    origin: extra.origin || (extra.role === 'small' ? 'distill' : 'pretrain'),
    total: st.total, active: st.active, arch: st.arch || 'dense', cls: clsOf({ mod: s.mod, total: st.total, active: st.active, cls: st.cls, scaleId: st.scaleId }), scaleId: st.scaleId || null,
    // 开不开源只在发布时定（B7 第 5 条：按路线和发布角色，release.js 的 beforeRelease 写进快照）：没发布的模型不写 open。
    ...(stage === 'released' ? { open: extra.open ?? false } : {}), base: {}, dims: {}, kcap: null, cn: 0, stage, released: null, postMonths: 0, gen: s.gen, boost: {},
    structureSource: st.source || 'player-design', // 继承的历史型号记结构出处；旧档没有这个字段，读档时按型号重新解析
    ...(extra.teacher ? { teacher: extra.teacher } : {}), // 蒸馏出来的小模型记老师：'self' 或别家的家族 id（里程碑“从零训练”“站在开源模型的肩膀上”看它）
    // 规格 D7 / C2 的几项记录：底座完成时的技术快照 techs；底座里已经体现了上限效果的技术 capTechs（自己预训练的底座在 finishPretrain 改成 []）；
    // 炸炉次数 train；各方向连续干净训练的天数 cleanStreak；按 Q 加权累计的涨幅 post（自有 / 蒸馏 / 各位老师）；污染 tainted。
    techs: [...(s.techs || [])], capTechs: [...(s.techs || [])], train: { minor: 0, severe: 0 }, cleanStreak: {}, post: { own: 0, dist: 0, teachers: {} }, tainted: false,
  };
}

// 立项时记下的配置不带 open：开闭在发布时按路线定（B7 第 5 条），立项表单、顾问传进来的 open 一律不留（和读档迁移 migrations/route.js 一样删掉）。
// 代号（cfg.draftName，选填，C1）记在项目上，练完写进模型的 draftName。
const planCfg = ({ open, draftName, ...cfg }) => cfg;
const withDraft = (pj, cfg) => { const d = draftNameOf(cfg?.draftName); if (d) pj.draftName = d; return pj; };

// 参数量必须是像样的有限数（字符串、NaN、负数都不行），再看架构、年代和显存。env.gpus：算好的 gpuCount(s)。
function structureCheck(s, cfg, env) {
  if (!Number.isFinite(cfg.total) || !Number.isFinite(cfg.active) || cfg.total < 0.5 || cfg.active < 0.5) return { ok: false, reason: '总参数和激活参数必须是至少 0.5B 的数' };
  const arch = ARCHS[cfg.arch];
  if (!arch) return { ok: false, reason: '未知架构' };
  if (arch.only && !arch.only.includes(s.charId)) return { ok: false, reason: '这是 RWKV 的专属架构' };
  if (arch.needTech && !s.techs.includes(arch.needTech)) return { ok: false, reason: `需要先研究：${TECH_BY_ID[arch.needTech].name}` };
  if (cfg.arch !== 'moe' && cfg.active !== cfg.total) return { ok: false, reason: '非 MoE 架构的激活参数等于总参数' };
  if (cfg.arch === 'moe' && cfg.active > cfg.total / 3) return { ok: false, reason: 'MoE 的激活参数一般不超过总参数的三分之一' };
  if (cfg.total > 700 && !P().gate('trillion', s)) return { ok: false, reason: '万亿参数要到 2024 年中以后才有人做' };
  if (cfg.total > 120 && cfg.arch === 'dense' && !P().gate('bigDense', s)) return { ok: false, reason: '这么大的稠密模型现在还没人训练得动' };
  const minGpus = Math.ceil(cfg.total * 16 / 80);
  if ((env?.gpus ?? gpuCount(s)) < minGpus) return { ok: false, reason: `显存不够：至少需要 ${minGpus} 张卡` };
  return { ok: true };
}
// 预训练立项检查（规格 T2.3、T3）：主线同一时间只有一项底座类作业（预训练或续训）；之后是代号、token、规模、结构、年代、显存和数据量。
// env（可不传）：同一份状态里连着查很多个配置时，传算好的 { gpus: gpuCount(s), pool: poolStats(s) }（顾问枚举候选底座用）。
export function projectCheck(s, cfg, env) {
  if (hasBaseJob(s, 'main')) return { ok: false, reason: '主线已经有一项底座在练（同一时间只练一个旗舰底座）：先等它练完或取消' };
  if (draftNameError(cfg?.draftName)) return { ok: false, reason: draftNameError(cfg.draftName) };
  if (!cfg || !Number.isFinite(cfg.tokens) || cfg.tokens <= 0) return { ok: false, reason: '训练 token 必须是大于 0 的数' };
  if (s.mod !== 'llm') {
    const scale = scaleById(s.mod, cfg.scaleId);
    if (!scale) return { ok: false, reason: '未知规模' };
    if (scale.from && s.date < scale.from) return { ok: false, reason: `${fmtDate(scale.from)} 之后才有这种路线` };
    if (scale.id === 'i8' && !s.techs.includes('dit')) return { ok: false, reason: '需要先研究 DiT' };
    if (scale.id === 'i20' && !s.techs.includes('ar_image')) return { ok: false, reason: '需要原生多模态图像生成技术' };
    if (scale.tiers && !scale.tiers.includes(s.company.tier)) return { ok: false, reason: '公司体量不够' };
    return { ok: true };
  }
  const st = structureCheck(s, cfg, env);
  if (!st.ok) return st;
  if (cfg.tokens > Math.max(1, (env?.pool ?? poolStats(s)).tokens * MAX_EPOCHS)) return { ok: false, reason: `数据不够：最多重复 ${MAX_EPOCHS} 轮` };
  return { ok: true };
}
// 小模型线从零练的小底座（T2.3）：只有语言模型有；总参 ≤ min(120B, 参照底座总参 × 0.2)，参照底座是主线在练模型，没有就用在线旗舰。
export function smallBaseCheck(s, cfg) {
  if (s.mod !== 'llm') return { ok: false, reason: '只有语言模型有小模型线' };
  if (smallLineCount(s) >= JOBS.SMALL_LINE) return { ok: false, reason: `小模型线已满（${JOBS.SMALL_LINE} 个）：先发布或取消一个` };
  const ref = refModel(s);
  if (!ref) return { ok: false, reason: '还没有自己的旗舰：小底座按旗舰的规模定上限，先练出一代旗舰' };
  const max = Math.min(JOBS.SMALL_MAX_TOTAL, ref.total * JOBS.SMALL_FRAC);
  if (Number.isFinite(cfg?.total) && cfg.total > max + 1e-9) return { ok: false, reason: `小底座最大 min(120B, 主线的 1/5)，现在是 ${Math.floor(max * 10) / 10}B` };
  const c = projectCheck({ ...s, jobs: { ...ensureJobs(s), list: [] } }, cfg);
  return c.ok ? { ok: true } : c;
}
// 预训练的载荷 pj（原 s.project 对象，字段和键的顺序都不变）：need 是用掉试验结论以后的算力。
export function makePretrainPj(s, cfg, pv, need = pv.need) {
  return withDraft({ type: 'pretrain', cfg: planCfg(cfg), structure: pv.structure, tokens: cfg.tokens, need, done: 0, start: s.date,
    acc: { w: 0, q: 0, effectiveQ: 0, repeat: 0, mix: {}, cn: 0 } }, cfg);
}
// 兼容出口（旧界面、顾问、测试）：立项 = 开一项主线底座作业，返回它的 pj。
// 开工后写进公司日志的那一行（startJob 调）：主线底座、蒸馏、续训三种；小模型线、后训练、试验只有作业表自己的“开工”。
export function startedLog(s, job) {
  const cfg = job.pj?.cfg || {};
  if (job.kind === 'pretrain' && job.line === 'main') {
    const pv = job.pj.structure;
    log(s, `立项：${s.mod === 'llm' ? `${pv.total}B / 激活 ${pv.active}B · ${ARCHS[pv.arch].label}` : scaleById(s.mod, cfg.scaleId).label}，${cfg.tokens}T token`);
  } else if (job.kind === 'distill') log(s, `蒸馏立项：老师 ${job.pj.preview.teacher.name}，学生 ${job.pj.structure.total}B`);
  else if (job.kind === 'finetune') log(s, `立项：在 ${job.pj.relName} 上续训，约 ${job.pj.need} 天`);
}
// 蒸馏能不能立项；不能时给出原因，界面直接显示。小模型线最多 3 个（T2.3）。
export function distillCheck(s, cfg) {
  if (draftNameError(cfg?.draftName)) return { ok: false, reason: draftNameError(cfg.draftName) };
  if (s.mod !== 'llm') return { ok: false, reason: '只有语言模型能蒸馏小模型' };
  if (smallLineCount(s) >= JOBS.SMALL_LINE) return { ok: false, reason: `小模型线已满（${JOBS.SMALL_LINE} 个）：先发布或取消一个` };
  if (!cfg || !Number.isFinite(cfg.total) || !Number.isFinite(cfg.active) || cfg.total < 0.5 || cfg.active < 0.5) return { ok: false, reason: '总参数和激活参数必须是至少 0.5B 的数' };
  if (cfg.tokens !== undefined && !(Number.isFinite(cfg.tokens) && cfg.tokens > 0)) return { ok: false, reason: '蒸馏 token 必须是大于 0 的数' };
  const st = structureCheck(s, { ...cfg, arch: cfg.arch || (cfg.active < cfg.total ? 'moe' : 'dense') });
  if (!st.ok) return st;
  const t = distillTeachers(s).find(x => x.id === cfg.teacher);
  if (!t) return { ok: false, reason: '没有这个老师：只能选自家在线旗舰，或综合最强的几款开源模型' };
  if (cfg.total >= t.total) return { ok: false, reason: `学生要比老师小：${t.name} 总共 ${t.total}B` };
  // MoE 学生太稀疏（解码激活 ÷ 总参 < 1/50）：等效参数撑不起来，规格 D7 直接拒绝。
  const arch = cfg.arch || (cfg.active < cfg.total ? 'moe' : 'dense');
  if (arch === 'moe' && cfg.active / cfg.total < DISTILL_GAP.minActiveRatio) return { ok: false, reason: `MoE 学生太稀疏：激活参数至少要总参数的 1/${Math.round(1 / DISTILL_GAP.minActiveRatio)}` };
  return { ok: true, reason: '', warn: distillWarn(s, cfg, t) };
}
// 老师被污染（自蒸馏，D7）：学生同样被污染，拿不到同类徽章，后训练也超不过老师们和当前最强里低的那个减 0.3。能立项，只是提示。
function distillWarn(s, cfg, t) {
  if (!t.own || !t.tainted) return '';
  const pv = previewDistill(s, cfg);
  const x = pv?.capQ;
  return `老师已被污染，学生同样被污染：这一代拿不到同类徽章，也超不过 ${Number.isFinite(x) ? (Math.round(x * 10) / 10).toFixed(1) : '老师和当前最强'}。`;
}
// 立项时冻结的快照：老师（哪一款、能力、总/激活参数、结构，自家老师还带着干不干净）和成品预估。工期、占卡这些随集群变的不存。
export const distillSnapshot = pv => structuredCloneSafe({ structure: pv.structure, dims: pv.dims, kcap: pv.kcap, gap: pv.gap, teacher: pv.teacher, tokens: pv.tokens });
// 蒸馏的载荷 pj：老师和成品预估在立项时冻结，之后老师更新或掉出名单，都不改这个项目（规格 D7）。
export function makeDistillPj(s, cfg) {
  const pv = previewDistill(s, cfg);
  if (!pv || !Number.isFinite(pv.need) || pv.need <= 0) return null;
  return withDraft({ type: 'distill', cfg: planCfg(cfg), structure: pv.structure, tokens: pv.tokens, need: pv.need, done: 0, start: s.date, teacher: cfg.teacher,
    preview: distillSnapshot(pv), minDays: DISTILL_MIN_DAYS, elapsedDays: 0 }, cfg);
}

// 预训练分段记账：每天按当天的语料池记一笔（原始质量、折算重复后的质量、重复利用率、配比），权重是这一天完成的工作量。
// 晚到的数据只改善之后的训练，不会把前面已经练过的部分改写成新数据。
export function rescaleTrainingAcc(acc, factor) {
  for (const k of ['w', 'q', 'effectiveQ', 'repeat', 'cn']) acc[k] *= factor;
  for (const k of Object.keys(acc.mix)) acc.mix[k] *= factor;
}
// 旧档的项目没有分段的重复记录：已练的部分按读档时的池子估一次，权重对齐到实际进度；之后的新工作照常分段记。
export function upgradeTrainingAcc(s, pj) {
  if (pj?.type !== 'pretrain' || !pj.acc || Number.isFinite(pj.acc.effectiveQ)) return;
  const repeat = pretrainRepeat(s, poolStats(s).tokens, pj.tokens);
  pj.acc.effectiveQ = pj.acc.q * repeat;
  pj.acc.repeat = pj.acc.w * repeat;
  if (pj.acc.w > 0) rescaleTrainingAcc(pj.acc, clamp(pj.done / pj.need, 0, 1) / pj.acc.w);
}
// 炼完：按作业的种类和线出模型（作业从作业表里摘掉）。
export function finishJob(s, job, report) {
  ensureJobs(s).list = s.jobs.list.filter(j => j !== job);
  if (job.kind === 'distill') return finishDistill(s, job, report);
  if (job.kind === 'finetune') return finishFinetune(s, job, report);
  if (job.line === 'small') return finishSmallBase(s, job, report);
  return finishPretrain(s, job, report);
}
const blowupsOf = pj => ({ minor: pj.blowups?.minor || 0, severe: pj.blowups?.severe || 0 });
// 出生即被污染的新底座（合成数据洗白，D7）：出生护栏只看锚点，锚点高过当前最强时（炼出过的公司按自家史线算）还会越过污染上限。
// 再按污染上限钳一遍：各维不超过 taintCaps 的 cap_k，整体压到 qCap 以下（F4 硬不变量、D9.1：q ≤ min(老师, 当前最强) − APPROACH）。
// 只往下钳，base、kcap 不动。
function taintBirthClamp(s, m) {
  const tc = taintCaps(s, m);
  if (!tc) return;
  for (const [k, c] of Object.entries(tc.caps)) if (m.dims[k] !== undefined && Number.isFinite(c)) m.dims[k] = Math.max(0, Math.min(m.dims[k], c));
  if (tc.qCap < Infinity) lowerQTo(m.mod ?? s.mod, m.dims, tc.qCap - 1e-9);
}
// 预训练出底座：语料按分段记账算质量，研发经验按立项时打折前的 need0 记（试验省下的是时间和卡，不是经验）。
function buildBase(s, pj, extra) {
  const w = Math.max(pj.acc.w, 1e-6);
  const quality = pj.acc.q / w;                 // 语料本身的质量：决定容量（kcap）和安全底子
  const effectiveQuality = pj.acc.effectiveQ / w; // 折算重复以后的训练信号质量
  const repeat = pj.acc.repeat / w;
  const mix = Object.fromEntries(Object.entries(pj.acc.mix).map(([k, v]) => [k, v / w]));
  const m = newModel(s, pj.structure, { draftName: pj.draftName, ...extra });
  m.gen = s.gen;
  if (s.mod === 'llm') { const r = llmBase(pj.structure, pj.tokens, effectiveQuality, mix, quality); m.base = r.base; m.kcap = r.kcap; m.cn = pj.acc.cn / w; }
  else m.base = nonLlmBase(s.mod, scaleById(s.mod, pj.cfg.scaleId), effectiveQuality, mix).base;
  const recipe = JSON.stringify([s.mod, pj.structure.arch, pj.structure.total, pj.structure.active, pj.cfg.scaleId || null, pj.tokens,
    Math.round(quality * 100) / 100, Object.entries(mix).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, Math.round(v * 1000) / 1000]), [...s.techs].sort()]);
  for (const k of Object.keys(m.base)) m.base[k] = round1(clamp(m.base[k], 0, 95));
  m.dims = {};
  for (const k of dimKeys(s.mod)) m.dims[k] = round1(clamp(m.base[k] + (k === 'safety' ? 18 : 2), 0, 95));
  // 自己按缩放律练出来的底座不含技术的上限效果，已经掌握的技术照常加上限（D6.1，见 model.js 的 computeCaps）。
  m.capTechs = [];
  m.train = blowupsOf(pj);
  return { m, quality, effectiveQuality, repeat, mix, recipe };
}
function experience(s, pj, need0, total, recipe, repeat) {
  const previous = new Set(s.models.filter(x => x.pretraining?.recipe === recipe).map(x => x.pretraining.projectId || x.id)).size;
  const effectiveFlops = need0 * repeat;
  return { ...pretrainCredit(total || 7, effectiveFlops, previous), effectiveFlops, previous };
}
// 合成数据洗白（D7）：语料池里由被污染的模型生成的教材占到 SYNTH_TAINT，新底座出生即被污染，继承那些教材的老师。
function synthTaint(s, m) {
  const pool = s.data.pool;
  if (pool.tokens > 0 && (pool.taintW || 0) / pool.tokens >= SYNTH_TAINT) {
    m.tainted = true;
    const from = Object.keys(pool.taintTeachers || {}).length ? pool.taintTeachers : liveModel(s)?.post?.teachers || {};
    m.post.teachers = { ...from };
  }
}
// 主线底座练完（T7）：新模型成为在练模型，s.gen + 1；旧在练模型还有没发布的进步、或者有候选在评测，就进“上一代收尾”60 天；原来的上一代归档。
function finishPretrain(s, job, report) {
  const pj = job.pj;
  const need0 = job.need0 ?? pj.need;
  const { m, quality, effectiveQuality, repeat, mix, recipe } = buildBase(s, pj, { role: 'flagship' });
  // 研发经验按有效训练工作给（规格 F6）；同一配方再练一遍，收获递减。
  const { credit, workFactor, novelty, effectiveFlops, previous } = experience(s, pj, need0, pj.structure.total, recipe, repeat);
  s.know = (s.know || 0) + credit;
  m.pretraining = { tokens: pj.tokens, quality: effectiveQuality, capacityQuality: quality, repeat, mix: { ...mix }, started: pj.start, completed: s.day,
    projectId: m.id, recipe, experience: { credit, effectiveFlops, workFactor, novelty, previous }, ...(job.lab ? { lab: { save: job.lab.save, risk: job.lab.risk, dims: { ...job.lab.dims } } } : {}) };
  // 数据配比的试验结论：那一维出生加分，之后照常过出生护栏（T5.5）。
  if (job.lab?.dims) applyLabDims(m, job.lab.dims);
  synthTaint(s, m);
  s.models.push(m);
  const old = workingModel(s);
  if (old && old !== m) handOver(s, old, report);
  s.working = m.id;
  s.gen += 1;
  // 出生护栏（D6.5）：新底座出生在最强之下 BIRTH_GAP 处，单科不超过世界包络 + DIM_SLACK。base、kcap 不动。
  birthClamp(s, m);
  if (m.tainted) taintBirthClamp(s, m);
  report.notes.push('底座训练完成，进入后训练。');
  pushDraftNotice(s, 'first_release_hint', 'model', m.draftName, '新一代');
}
// 旧在练模型交班（T7）：还有没发布的进步（postDays > relDays），或者有候选在评测，就进上一代收尾；原来已有的上一代直接归档。
function handOver(s, old, report) {
  const pending = (old.postDays || 0) > (old.relDays || 0) || (s.evals || []).some(e => e.modelId === old.id);
  const pw = s.prevWorking;
  if (pw && pw.id !== old.id) {
    const pm = s.models.find(x => x.id === pw.id);
    for (const j of ensureJobs(s).list.filter(x => x.kind === 'post' && x.target === 'prev')) s.jobs.list = s.jobs.list.filter(y => y !== j);
    if (pm && (pm.postDays || 0) > (pm.relDays || 0)) log(s, `${pm.name || pm.draftName || '上一代'} 没发布就归档了`);
    s.prevWorking = null;
  }
  if (!pending) return;
  // 旧在练模型还在评测中的候选归到上一代这条线（主线腾出来给新的在练模型送评）。
  for (const e of s.evals || []) if (e.modelId === old.id && e.line === 'main') e.line = 'prev';
  s.prevWorking = { id: old.id, until: addDays(s.day, JOBS.PREV_DAYS) };
  jobsLog(s, `上一代收尾：还有 ${JOBS.PREV_DAYS} 天可以送评发布`);
  report?.notes?.push(`上一代还有没发布的进步，进入 ${JOBS.PREV_DAYS} 天收尾期：可以接着后训练、送评，作为副线发布。`);
}
// 小模型线的小底座练完（T2.3）：不动 s.gen，不动 s.working；成品是待发布的小模型（role small，origin pretrain）。
// 研发经验：每一代主线（按 s.gen）只有第一个练完的小底座给，乘 min(1, 小底座总参 ÷ 参照底座总参)。
function finishSmallBase(s, job, report) {
  const pj = job.pj;
  const ref = refModel(s);
  const { m, quality, effectiveQuality, repeat, mix, recipe } = buildBase(s, pj, { role: 'small', origin: 'pretrain' });
  const J = ensureJobs(s);
  let credit = 0, info = null;
  if (!J.smallCredit[s.gen]) {
    info = experience(s, pj, job.need0 ?? pj.need, pj.structure.total, recipe, repeat);
    credit = info.credit * Math.min(1, pj.structure.total / Math.max(1, ref?.total || pj.structure.total));
    J.smallCredit[s.gen] = true;
    s.know = (s.know || 0) + credit;
  }
  m.pretraining = { tokens: pj.tokens, quality: effectiveQuality, capacityQuality: quality, repeat, mix: { ...mix }, started: pj.start, completed: s.day,
    projectId: m.id, recipe, small: true, experience: { credit, effectiveFlops: info?.effectiveFlops ?? 0, workFactor: info?.workFactor ?? 0, novelty: info?.novelty ?? 0, previous: info?.previous ?? 0 } };
  synthTaint(s, m);
  s.models.push(m);
  shelveSmall(s, m);
  birthClamp(s, m);
  if (m.tainted) taintBirthClamp(s, m);
  report.notes.push(`小底座${m.draftName ? `「${m.draftName}」` : ''}练完了，可以接着后训练，再送评。`);
  jobsLog(s, `小底座练完：${pj.structure.total}B`);
}
// 待发布的小模型：smallWorking 空就放那里，否则排进 smallShelf。
function shelveSmall(s, m) {
  if (!s.smallWorking) s.smallWorking = m.id;
  else (s.smallShelf = Array.isArray(s.smallShelf) ? s.smallShelf : []).push(m.id);
}
function finishDistill(s, job, report) {
  const pj = job.pj;
  // 成品按立项时冻结的快照出，老师中途更新或掉出名单都不影响（修掉 v0.9 练出空能力的问题）。旧档读档时已经补好快照。
  const pv = pj.preview || previewDistill(s, pj.cfg);
  if (!pv) { cancelDistill(s, report, job); return; }
  const small = newModel(s, pj.structure, { role: 'small', stage: 'post', teacher: pj.teacher, draftName: pj.draftName });
  small.dims = { ...pv.dims };
  small.base = { ...pv.dims };
  small.kcap = pv.kcap;
  // 学生差距 gapQ（D7）：蒸馏出身的模型后训练上限按它钳（T2.4）。
  small.distillation = { teacher: structuredCloneSafe(pv.teacher), tokens: pv.tokens, gap: Number.isFinite(pv.gap) ? pv.gap : studentGap(pj.structure.total, pj.structure.active, pv.tokens) };
  small.postMonths = 1;
  small.train = blowupsOf(pj);
  // 污染（D7）：别家老师蒸出来的学生被污染；自蒸馏看老师干不干净，被污染的老师（含续训来的）把污染和老师们一起传下去；
  // 老师带续训谱系的，学生带上同一个谱系（拿不到“开源最强”，D11.2）。
  const t = pv.teacher || {};
  if (pj.teacher === 'self' || t.own) {
    if (t.tainted) { small.tainted = true; small.post.teachers = { ...(t.teachers || {}) }; }
    if (t.lineage?.kind === 'finetune') small.lineage = { ...t.lineage };
  } else {
    small.tainted = true;
    small.post.teachers = { [pj.teacher]: 1 };
    recordTeacher(s, pj.teacher, { relId: t.relId ?? null, name: t.name, day: s.day, dims: { ...(t.dims || {}) }, q: qOf(s.mod, t.dims || {}), kind: 'weights', license: t.license ?? null });
    if (t.license === 'LR' || t.license === 'LN') s.data.risky[`license_${pj.teacher}`] = true;
  }
  s.models.push(small);
  shelveSmall(s, small);
  if (pj.teacher !== 'self') s.distillDep = clamp(s.distillDep + 0.1, 0, 0.8);
  const flag = liveModel(s);
  const ratio = flag ? `${Math.round(costPerMillion(s, small) / costPerMillion(s, flag) * 100)}%` : '—';
  report.notes.push(`小模型${small.draftName ? `「${small.draftName}」` : ''}蒸馏完成。`);
  pushDraftNotice(s, 'small_ready', 'small', small.draftName, '新的小模型', { total: small.total, active: small.active, costRatio: ratio });
}
// 练完的提示（“预训练完成”“小模型蒸馏完成”）：有代号写代号；没有代号写个中文叫法，文案里给英文名留的空格去掉
// （“新一代的底座训练完了”“新的小模型蒸馏完成”，不拼成“第 N 代 的底座”“新的小模型 蒸馏完成”）。
function draftNotice(s, id, key, draft, word, params = {}) {
  const n = noticeOf(s, id, { ...params, [key]: draft || word });
  if (!draft) n.text = n.text.replace(`${word} `, word);
  return n;
}
// 完成类提示每局只弹第一次卡片（规格 E4）：底座练完、小模型蒸完，第二张起还是同一句话“去后训练、去上架”，
// 同样的状态在训练页和发布页都看得见，再挡一次时间只多一次没有信息量的点击。后面的照样发一条新闻，正文不变。
const ONCE_NOTICES = new Set(['first_release_hint', 'small_ready']);
function pushDraftNotice(s, id, key, draft, word, params = {}) {
  const n = draftNotice(s, id, key, draft, word, params);
  if (!ONCE_NOTICES.has(id)) { s.queue.push(n); return; }
  s.flags ??= {};
  const seen = (s.flags.noticeSeen ??= {});
  if (seen[id]) { s.news.unshift({ date: s.date, day: s.day, type: 'notice', title: n.title, detail: n.text }); return; }
  seen[id] = s.day;
  s.queue.push(n);
}

// 找不到老师快照的蒸馏项目只能取消：提示写明“已取消”和作废了多少进度，已有模型不受影响。
// job 给了就摘掉这项作业；读 v3 旧档打补丁时（还没有作业表）传 null，清掉原始存档里的 project。
export function cancelDistill(s, report = null, job = null) {
  const pj = job ? job.pj : s.project;
  const who = pj.teacher === 'self' ? '自家在线旗舰' : `${FAMILIES[pj.teacher]?.company || pj.teacher} 的开源模型`;
  const pct = Math.round(clamp(pj.done / pj.need, 0, 1) * 100);
  if (job) { if (s.jobs?.list) s.jobs.list = s.jobs.list.filter(j => j !== job); }
  else { s.project = null; if (s.flags) s.flags.push = false; }
  log(s, `蒸馏项目已取消：找不到老师（${who}），${pct}% 进度作废`);
  report?.notes.push(`蒸馏项目已取消：找不到老师（${who}）。`);
  s.queue.push({ kind: 'notice', title: '蒸馏项目已取消', text: `这个蒸馏项目没有记下老师是哪一款，历史目录里也找不到${who}，只能取消，已经跑完的 ${pct}% 作废。已有的模型不受影响，可以重新选老师立项。` });
}

// ---------- 在开源底座上续训（规格 D7，需要公司策略的解锁项 adopt_open_base） ----------
// 只能选已经发布、看得到的别家开源权重，许可是 LP 或 LR；耗时 20–40 天（越大越久），按日历天推进，分不到最低卡的日子停着。
export function finetuneCheck(s, cfg) {
  if (hasBaseJob(s, 'main')) return { ok: false, reason: '主线已经有一项底座在练：先等它练完或取消' };
  if (draftNameError(cfg?.draftName)) return { ok: false, reason: draftNameError(cfg.draftName) };
  if (!s.strategy?.unlocks?.adopt_open_base) return { ok: false, reason: '要先完成解锁“在开源底座上续训”的公司策略' };
  const r = P().relById(cfg?.relId);
  if (!r || r.mod !== s.mod || !r.open || !(r.day <= s.day) || isMine(s, r.family)) return { ok: false, reason: '只能选已经发布的别家开源模型' };
  const lic = licenseOf(r);
  if (lic !== 'LP' && lic !== 'LR') return { ok: false, reason: '只能选宽松许可或受限但可商用的开源权重（不可商用的不行）' };
  const st = structureForRelease(s.mod, r);
  const minGpus = s.mod === 'llm' ? Math.ceil(st.total * 16 / 80) : 8;
  if (gpuCount(s) < minGpus) return { ok: false, reason: `显存不够：至少需要 ${minGpus} 张卡` };
  return { ok: true, reason: '', days: finetuneDays(st) };
}
const finetuneDays = st => Math.round(clamp(20 + 10 * Math.log10(Math.max(1, (st.total || 7) / 7)), 20, 40));
export function makeFinetunePj(s, cfg, days) {
  const r = P().relById(cfg.relId);
  const st = structureForRelease(s.mod, r);
  return withDraft({ type: 'finetune', cfg: { relId: r.id }, relId: r.id, fam: r.family, relName: r.name, structure: { ...st }, license: licenseOf(r),
    need: days, done: 0, start: s.date }, cfg);
}
// 续训完成：base = 底座能力 − 6，dims = 底座能力 − 2，结构取自 structureForRelease；带续训谱系，出生即被污染（老师就是这个底座）。
function finishFinetune(s, job, report) {
  const pj = job.pj;
  const r = P().relById(pj.relId);
  const src = r ? relDims(s, r) : {};
  const m = newModel(s, pj.structure, { role: 'flagship', origin: 'pretrain', draftName: pj.draftName });
  m.gen = s.gen;
  m.base = {};
  m.dims = {};
  for (const k of dimKeys(s.mod)) { const v = src[k] ?? 0; m.base[k] = round1(clamp(v - 6, 0, 95)); m.dims[k] = round1(clamp(v - 2, 0, 95)); }
  m.kcap = s.mod === 'llm' ? Math.max((src.knowledge ?? 0) + 4, knowledgeCap(m.total, 1.2)) : null;
  m.lineage = { kind: 'finetune', relId: pj.relId, fam: pj.fam };
  m.tainted = true;
  m.post.teachers = { [pj.fam]: 1 };
  m.train = blowupsOf(pj);
  recordTeacher(s, pj.fam, { relId: pj.relId, name: pj.relName, day: s.day, dims: { ...src }, q: qOf(s.mod, src), kind: 'weights', license: pj.license ?? null });
  if (pj.license === 'LR') s.data.risky[`license_${pj.fam}`] = true;
  s.models.push(m);
  const old = workingModel(s);
  if (old && old !== m) handOver(s, old, report);
  s.working = m.id;
  s.gen += 1;
  birthClamp(s, m);
  report.notes.push(`在 ${pj.relName} 上续训完成，进入后训练。`);
  log(s, `续训完成：${pj.relName}`);
}
