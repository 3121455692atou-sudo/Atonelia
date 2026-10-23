// 后台 · 训练（规格 T10.2，P2.4b）：分卡条、进行中的作业和评测、新作业（表单在按钮下方原位展开）、模型（在练、上一代收尾、小模型；送评在原位展开）、
// 下一代计划和试验结论、集群健康（检修、自动检修、专心研究、只用自有数据）、作业日志。
// 训练卡在作业之间按“优先 / 正常”自动分（allocJobs，每次现算）；这里只显示分到多少、改优先级和“最多 N 张”，不做拖拽。
// 手机（< 860px）整页纵向滚动，从上到下：分配条 → 进行中 → 新作业 → 模型 → 下一代计划 → 健康；作业行点 ⋯ 在原位展开操作，不弹窗、不加悬浮按钮。
import * as E from '../../engine.js';
import { MODALITIES, ARCHS, SCALES, PARAM_TOTALS, PARAM_ACTIVES, TECH_BY_ID, dimLabel } from '../../data/core.js';
import { BENCHMARKS } from '../../data/benchmarks.js';
import { JOBS, REPAIR, LAB, EFFORT, CURVE, TRAIN_PACE } from '../../data/balance.js';
import { RELEASES } from '../../data/rivals.js';
import { esc, pct, count, params } from '../fmt.js';
import { act, after, jobAct, decideAct } from '../act.js';
import { closeLayer, render as renderMain } from '../state.js';
import { doDecision } from '../flow.js';
import * as projectForm from './project_form.js';
import { optFields, optOf, optChange, checkLines, formCheck, startNew } from './project_form.js';
import * as distillForm from './distill_form.js';
import * as releasePanel from '../panels/release.js';

const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
const f2 = v => (Math.round(v * 100) / 100).toFixed(2);
const days = d => Math.max(1, Math.round(d));

// ---------- 后训练的状态行和冲顶力（规格 D6.6，原训练面板） ----------
// 一行话说清楚现在离最强有多远、涨分速度打几折（R 是难度锚点：对手最强，或真实历史里这时的前沿）。
export function curveLine(c) {
  if (!c) return '';
  const speed = `涨分速度 ×${f2(c.Hq)}`;
  if (c.src === 'temp') return `这个领域还没有对手，按真实历史这时的水平约在 ${f1(c.R)}。${c.delta < 0 ? `还差 ${f1(-c.delta)} 分，${speed}` : `已经超过 ${f1(c.delta)} 分，${speed}`}。`;
  const hist = c.src === 'hist' ? `按真实历史，这时的前沿约在 ${f1(c.R)}。` : '';
  if (c.delta < 0) return `离最强对手还差 ${f1(-c.delta)} 分，${speed}。${hist}`;
  const lead = c.ws !== null ? c.q - c.ws : c.delta;
  return `领先第二名 ${f1(lead)} 分，再往上每多 ${f1(c.b)} 分，涨得再慢一大截。${hist}`;
}
// 模型行上的短说法：离最强还差多少、涨分打几折。
const curveShort = c => (!c ? '' : c.delta < 0 ? `离最强还差 ${f1(-c.delta)}，涨分 ×${f2(c.Hq)}` : `领先 ${f1(c.ws !== null ? c.q - c.ws : c.delta)}，涨分 ×${f2(c.Hq)}`);
// 冲顶力四根条：每根按自己的夹逼范围画满格。
export function effortBars(c) {
  if (!c) return '';
  const bar = (label, v, [lo, hi], tip) => `<li title="${esc(tip)}"><span class="rk"></span><span class="nm">${label}</span><span class="track"><i style="width:${Math.round(Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * 100)}%"></i></span><b>×${f2(v)}</b></li>`;
  const leadMax = 1 + EFFORT.LEAD_STEP * EFFORT.LEAD_MAX;
  return `<ul class="bars">
      ${bar('算力', c.fComp, EFFORT.COMP, '训练卡越多越高；底座占着大部分训练卡时，后训练的冲顶力按四分之一算')}
      ${bar('自有数据', c.fData, EFFORT.DATA, '只算自己的后训练数据，蒸馏数据不算')}
      ${bar('技术积累', c.fKnow, EFFORT.KNOW, '按同年头部公司的技术积累折算')}
      ${bar('独门技术', c.fLead, [1, leadMax], '掌握了、但业界还没公开的技术，每项 +25%，最多算两项')}
    </ul>
    <p class="muted">冲顶力 ${f2(c.A)}（四样相乘）。四样相乘不到 ${CURVE.A0}，就只能无限接近，过不去。技术储备 ×${f2(c.rho)}：${c.rho >= 1.3 ? '炼出过最强，冲顶更轻松' : c.rho >= 0.6 ? '同一集团别的领域出过最强' : '还没炼出过最强，最后几步特别难'}。</p>`;
}

// ---------- 作业行（训练页和主界面“进行中”卡共用） ----------
const KIND_TAG = { pretrain: '底座', distill: '蒸馏', finetune: '续训', post: '后训练', trial: '试验' };
export const jobTag = job => (job.kind === 'pretrain' && job.line === 'small' ? '小底座' : KIND_TAG[job.kind] || '作业');
// jobLabel 是“底座 · 下一代 1600B MoE 14T”这样的写法；行首已经有标签时去掉第一段。
export const jobName = (S, job) => E.jobLabel(S, job).replace(/^[^·]+ · /, '');
const ROUND = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
// 排在它前面、已经发了最低卡的作业占掉以后还剩几张（分卡第 1 步按顺序发最低卡，前面的排队不挡后面的）。
function leftFor(al, it) {
  let left = al.T * al.cap;
  for (const x of al.items) { if (x === it) break; if (x.run) left -= x.minCards; }
  return Math.max(0, Math.floor(left + 1e-9));
}
const UNTIL_TEXT = (S, u) => (!u || u === 'none' ? '一直练' : u === 'stall' ? '练到涨不动' : Number.isFinite(u?.days) ? `练 ${u.days} 天` : u?.dim ? `练到${dimLabel(S.mod, u.dim)} ${u.to}` : '一直练');
// 后训练作业的方向（自动方向还没选时取顾问会选的那个）。
const postDir = (S, job, m) => (job.bench ? null : job.dir === 'auto' ? job.autoDir || (m ? E.bestDir(S, m) : null) : job.dir);
// 后训练一个月大约涨多少（主维），按这项作业当场分到的算力算。
function postGain(S, job, it) {
  const m = E.postTarget(S, job);
  if (!m) return null;
  if (job.bench) { const p = E.benchmaxPreview(S, job.bench, m, E.trainFlops(S) * (it?.share || 0)); return p ? { text: `刷榜 +${p.gain}`, v: p.gain } : null; }
  const dir = postDir(S, job, m);
  const p = dir ? E.postPreview(S, dir, { model: m, avail: E.trainFlops(S) * (it?.share || 0) }) : null;
  if (!p) return null;
  const v = (p.gains[p.dir.main] || 0) * TRAIN_PACE;
  return { text: `一个月约 ${v >= 0 ? '+' : ''}${f1(v)}`, v, p };
}
// 一项作业现在的样子：{ tag, name, state（长）, short（主界面用）, tone, prog（0–1 或 null）}。
export function jobView(S, al, it) {
  const job = it.job;
  const tag = jobTag(job);
  // 后训练的名字后面带结束条件（“· 一直练”“· 练 30 天”……，T10.2）。
  const name = job.kind === 'post' ? `${jobName(S, job)} · ${UNTIL_TEXT(S, job.until)}` : jobName(S, job);
  const paused = it.why === 'paused';
  if (paused) { const fp = Array.isArray(S.jobs.focusPause) && S.jobs.focusPause.includes(job.id); return { tag, name, state: fp ? '暂停中（专心研究）' : '暂停中', short: '暂停中', tone: 'muted', prog: progOf(job) }; }
  if (it.why === 'repair') return { tag, name, state: '检修中：后训练先停着', short: '检修中，先停着', tone: 'warn', prog: null };
  if (it.why === 'target') return { tag, name, state: '没有能接着训练的模型', short: '没有模型可练', tone: 'warn', prog: null };
  if (it.why === 'min') {
    if (!(al.T > 0)) return { tag, name, state: '等待算力：现在没有训练卡（少出租一些，或者添卡）', short: '等待算力', tone: 'warn', prog: progOf(job), queued: true };
    const left = leftFor(al, it);
    return { tag, name, state: `排队：要 ${count(it.minCards)} 张，现在只剩 ${count(left)} 张${job.queuedDays > 1 ? `（排了 ${job.queuedDays} 天）` : ''}`, short: `排队：缺 ${count(Math.max(1, Math.ceil(it.minCards - left)))} 张卡`, tone: 'warn', prog: progOf(job), queued: true };
  }
  const eta = E.jobEta(S, job, it);
  if (job.kind === 'post') {
    const g = postGain(S, job, it);
    const left = Number.isFinite(eta) && eta !== null ? `，还剩 ${Math.max(0, Math.round(eta))} 天` : '';
    const text = `第 ${job.days || 0} 天${left}${g ? ` · ${g.text}` : ''}`;
    return { tag, name, state: text, short: `第 ${job.days || 0} 天${left}`, tone: '', prog: null };
  }
  const p = progOf(job);
  const when = Number.isFinite(eta) ? `约 ${days(eta)} 天` : '等待算力';
  if (job.kind === 'trial') return { tag, name, state: `${Math.round(p * 100)}% · ${when} · 成功率 ${pct(job.odds || 0)}`, short: `${Math.round(p * 100)}% · ${when}`, tone: '', prog: p };
  const lab = job.lab?.save > 0 ? `（试验省下 ${Math.round(job.lab.save * 100)}%）` : '';
  const rush = job.rush ? ' · 赶工' : '';
  return { tag, name, state: `${Math.round(p * 100)}% · ${when}${lab}${rush}`, short: `${Math.round(p * 100)}% · ${when}`, tone: '', prog: p };
}
function progOf(job) {
  if (job.kind === 'trial') return Math.min(1, job.cost > 0 ? (job.done || 0) / job.cost : 0, job.minDays ? (job.elapsed || 0) / job.minDays : 1);
  if (job.kind === 'post') return null;
  if (job.kind === 'finetune') return Math.min(1, (job.pj.done || 0) / Math.max(1, job.pj.need));
  return E.projectProgress(job.pj);
}
// 拿到 / 想要几张；排队时写 0 / 最低卡；暂停、检修、没有模型时不参加分卡，写“—”。
const cardsText = it => (it.run ? `${count(it.cards)}/${Number.isFinite(it.wantCards) ? count(it.wantCards) : '—'} 张` : it.why === 'min' ? `0/${count(it.minCards)} 张` : '— 张');

// ---------- 分配条：出租｜推理（含生成）｜训练（按作业分色）｜闲置（含检修留出的那份） ----------
const COLOR = { lease: '#c09a55', infer: 'var(--accent)', idle: '#d5dbe0', pretrain: '#4f9474', distill: '#79b394', finetune: '#3f7a60', post: '#8a73c4', trial: '#d49a45' };
const kindColor = job => (job.kind === 'pretrain' && job.line === 'small' ? '#6aa98a' : COLOR[job.kind] || '#5f9c82');
export function allocBar(S) {
  const ga = E.gpuAllocation(S);
  if (!ga.total) return '<p class="muted">还没有卡。</p>';
  const al = E.allocJobs(S);
  const segs = [['出租', ga.leaseGpus, COLOR.lease, ''], ['推理', ga.inferGpus, COLOR.infer, '']];
  for (const it of al.items) if (it.run && it.cards > 0) segs.push([jobTag(it.job), it.cards, kindColor(it.job), jobName(S, it.job)]);
  const idle = al.free * al.T;
  segs.push(['闲置', idle, COLOR.idle, '']);
  const bar = segs.filter(s => s[1] > 0).map(([l, n, c, t]) => `<i style="flex:${n};background:${c}" title="${esc(`${l}${t ? ` · ${t}` : ''} ${count(n)} 张`)}"></i>`).join('');
  // 图例按种类合并（同一种作业几项加在一起）。
  const sum = {};
  for (const it of al.items) if (it.run && it.cards > 0) { const k = jobTag(it.job); sum[k] = sum[k] || [0, kindColor(it.job)]; sum[k][0] += it.cards; }
  const gen = ga.genGpus > 0.5 ? `（含生成 ${count(ga.genGpus)} 张）` : '';
  const repair = S.jobs?.repair ? `，含检修留出 ${count(al.T * REPAIR.share)} 张` : '';
  const legend = [['出租', ga.leaseGpus, COLOR.lease, ''], ['推理', ga.inferGpus, COLOR.infer, gen], ...Object.entries(sum).map(([k, [n, c]]) => [k, n, c, '']),
    ['训练卡闲置', idle, COLOR.idle, al.T > 0 ? `（${pct(al.free)}${repair}）` : '']].filter(x => x[1] > 0.5);
  return `<div class="alloc">${bar}</div>
    <p class="alloc-legend">${legend.map(([l, n, c, x]) => `<span><i style="background:${c}"></i>${l} ${count(n)} 张${x}</span>`).join('')}</p>`;
}

// ---------- 进行中 ----------
function jobRow(S, al, it, i, st) {
  const job = it.job;
  const v = jobView(S, al, it);
  const open = st.jobMenu === job.id;
  const prioBtn = `<button class="job-prio ${job.prio === 'high' ? 'is-high' : ''}" data-job-op="prio" data-id="${job.id}" data-prio="${job.prio === 'high' ? 'normal' : 'high'}" title="点一下在优先和正常之间切换">${job.prio === 'high' ? '优先' : '正常'}</button>`;
  return `<div class="job-row${v.queued ? ' is-queued' : ''}${it.why === 'paused' ? ' is-paused' : ''}">
    <div class="job-main">
      <span class="job-n">${ROUND[i] || i + 1}</span>
      <b class="job-name">${esc(v.tag)} · ${esc(v.name)}</b>
      ${prioBtn}
      <span class="job-cards">${cardsText(it)}${Number.isFinite(job.cap) ? `<small>（最多 ${count(job.cap)}）</small>` : ''}</span>
      <span class="job-state ${v.tone}">${v.prog !== null ? `<i class="mini-prog"><i style="width:${Math.round(v.prog * 100)}%"></i></i>` : ''}${esc(v.state)}</span>
      <button class="job-more" data-job-menu="${job.id}" aria-expanded="${open}" title="更多操作">⋯</button>
    </div>
    ${open ? jobMenu(S, it, st) : ''}
  </div>`;
}
function jobMenu(S, it, st) {
  const job = it.job;
  const id = job.id;
  const ops = [];
  ops.push(job.paused ? `<button class="btn btn--sm" data-job-op="pause" data-id="${id}" data-on="0">继续</button>` : `<button class="btn btn--sm" data-job-op="pause" data-id="${id}" data-on="1">暂停</button>`);
  ops.push(`<button class="btn btn--sm" data-job-op="prio" data-id="${id}" data-prio="${job.prio === 'high' ? 'normal' : 'high'}">${job.prio === 'high' ? '改成正常' : '改成优先'}</button>`);
  const min = Math.ceil(it.minCards || E.minCards(S, job));
  const capRow = `<label class="job-cap">最多 <input type="number" inputmode="numeric" min="${min}" step="1" value="${Number.isFinite(job.cap) ? job.cap : ''}" placeholder="不限" data-job-cap="${id}" /> 张 <small>（最少 ${count(min)}，清空就是不限）</small></label>`;
  let extra = '';
  if (job.kind === 'pretrain') {
    const fast = Math.round(E.fastestDays(S, job.pj.structure));
    const atFast = it.run && it.cards >= (it.wantRaw ?? Infinity) - 0.5;
    const why = atFast
      ? `已经按最快天数（${fast} 天的节奏）在练：赶工不会更快，只是少占一些卡，集群每月照样多掉 ${JOBS.WEAR.rush}。`
      : `赶工：进度 ×${JOBS.RUSH}，但快不过最快天数（${fast} 天的节奏）；集群每月多掉 ${JOBS.WEAR.rush}，更容易炸。`;
    extra += `<p class="muted">${why}</p>`;
    ops.push(`<button class="btn btn--sm ${job.rush ? 'is-on' : ''}" data-job-op="rush" data-id="${id}" data-on="${job.rush ? 0 : 1}">${job.rush ? '赶工中（点一下恢复）' : '赶工'}</button>`);
  }
  if (job.kind === 'post') extra += postEdit(S, job);
  const cancel = job.kind === 'pretrain' && job.lab?.used?.length ? '取消（用掉的试验结论退回）' : '取消';
  ops.push(`<button class="btn btn--sm btn--danger" data-job-op="cancel" data-id="${id}">${cancel}</button>`);
  return `<div class="job-menu"><div class="ops">${ops.join('')}</div>${capRow}${extra}</div>`;
}
// 后训练：改方向（含自动、刷榜）和结束条件。
function dirOptions(S, m, cur) {
  const dirs = E.directionsFor(S).map(d => [d.key, d.label]);
  const benches = m ? BENCHMARKS.filter(b => b.mod === S.mod && S.date >= b.from && E.benchmaxPreview(S, b.id, m)).slice(0, 12) : [];
  return [['auto', '自动（每 7 天换到涨得最多的方向）'], ...dirs, ...benches.map(b => [`bench:${b.id}`, `刷榜：${b.name}`])]
    .map(([k, l]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(l)}</option>`).join('');
}
const untilKey = u => (!u || u === 'none' ? 'none' : u === 'stall' ? 'stall' : Number.isFinite(u?.days) ? `d${u.days}` : u?.dim ? 'dim' : 'none');
// “自动方向 + 练到涨不动”：自动方向看所有方向（含安全对齐，它的预估涨幅一直不低），多半停不下来，照实提醒一句。
const STALL_AUTO = '自动方向要所有方向都涨不动才算停，安全对齐一般一直还有得涨，所以多半停不下来；想练到涨不动，最好选一个具体方向。';
function untilOptions(cur) {
  return [['none', '一直练'], ['d7', '练 7 天'], ['d14', '练 14 天'], ['d30', '练 30 天'], ['d60', '练 60 天'], ['dim', '练到主维多少分'], ['stall', '练到涨不动']]
    .map(([k, l]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${l}</option>`).join('');
}
function postEdit(S, job) {
  const m = E.postTarget(S, job);
  const cur = job.bench ? `bench:${job.bench}` : job.dir || 'auto';
  const uk = untilKey(job.until);
  const dim = job.until?.dim;
  return `<div class="form job-post">
    <label>方向<select data-post-dir="${job.id}">${dirOptions(S, m, cur)}</select></label>
    <label>什么时候停<select data-post-until="${job.id}">${untilOptions(uk)}</select></label>
    ${uk === 'dim' ? `<label>练到<select data-post-dim="${job.id}">${MODALITIES[S.mod].dims.map(d => `<option value="${d.key}" ${d.key === dim ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}</select></label>
      <label>分数<input type="number" min="1" max="100" step="0.5" value="${job.until.to}" data-post-to="${job.id}" /></label>` : ''}
  </div>${uk === 'stall' && job.dir === 'auto' && !job.bench ? `<p class="muted">${STALL_AUTO}</p>` : ''}`;
}
// 评测中的候选（不占卡、不占作业位）。
function evalRows(S) {
  const w = E.workingModel(S);
  return (S.evals || []).map(ev => {
    const left = Math.max(0, E.daysBetween(S.day, ev.until));
    const what = ev.line === 'small' ? `${ev.plan?.name || ''}（小模型，已冻结）` : `${ev.plan?.name || ''} 候选${ev.line === 'prev' ? '（上一代）' : ''}`;
    const along = ev.line === 'main' && w ? `（评测期间 ${E.modelLabel(w)} 接着练）` : '';
    const later = ev.line !== 'small' ? (S.deploy || []).filter(d => d.role !== 'small' && d.until > ev.until).map(d => d.name)[0] : null;
    return `<div class="job-row eval-row"><div class="job-main">
      <span class="job-n now-tag--go">评测</span>
      <b class="job-name">${esc(what)} · ${E.TIER_LABEL[ev.tier]}</b>
      <span class="job-state">还剩 ${left} 天${esc(along)}${later ? `，评完排在 ${esc(later)} 之后上线` : ''}</span>
      <button class="btn btn--sm" data-cancel-eval="${esc(ev.id)}">撤回</button></div></div>`;
  }).join('');
}
// 检修那一行的字（训练页和首页共用）：自动检修开着才会到 75 自动结束；关着时一直检修，要手动点“结束检修”。
export function repairText(S) {
  const h = Math.round(S.health);
  if (!S.jobs?.autoRepair) return `检修中 · 健康 ${h}（自动检修关着，要手动点“结束检修”）`;
  return `检修中 · 健康 ${h} → ${REPAIR.until}，约 ${Math.max(1, Math.ceil((REPAIR.until - S.health) / REPAIR.rate))} 天`;
}
function repairRow(S) {
  const J = S.jobs;
  if (!J.repair) return '';
  return `<div class="job-row repair-row"><div class="job-main"><span class="job-n">检修</span>
    <b class="job-name">${esc(repairText(S))}</b>
    <span class="job-state muted">后训练先停下，训练卡留出四分之一；底座和试验照常用剩下的</span>
    <button class="btn btn--sm" data-job-op="repair" data-on="0">结束检修</button></div></div>`;
}
function runningCard(S, al, st) {
  const rows = al.items.map((it, i) => jobRow(S, al, it, i, st)).join('');
  const evals = evalRows(S);
  const empty = !al.items.length && !evals ? `<p class="muted">现在没有作业。${E.workingModel(S)?.stage === 'post' ? '在练的模型没人练：从下面挂一项后训练，或者在「模型」那一栏点“后训练”。' : '底座练完会自动挂上后训练；也可以从下面开新作业。'}团队没有重活时研究最快（×${JOBS.RESEARCH.free}）。</p>` : '';
  return `<div class="card wide train-jobs"><div class="card-head"><b>进行中</b><small>先发最低卡，剩下的按 优先 3 : 正常 1 分；吃饱了的多出来的卡回给别的作业</small></div>
    ${repairRow(S)}${rows}${evals}${empty}</div>`;
}

// ---------- 新作业（表单在按钮下方原位展开） ----------
const NEW_KINDS = [['pretrain', '底座'], ['post', '后训练'], ['distill', '蒸馏小模型'], ['small', '小底座'], ['trial', '试验'], ['finetune', '续训']];
function newJobCard(S, st) {
  const slots = E.jobSlots(S), used = E.slotsUsed(S);
  const locked = { finetune: !S.strategy?.unlocks?.adopt_open_base ? '未解锁：需要“在开源底座上续训”' : '' };
  if (S.mod !== 'llm') { locked.distill = '只有语言模型有小模型线'; locked.small = '只有语言模型有小模型线'; }
  const btns = NEW_KINDS.map(([k, l]) => `<button class="chip-btn ${st.newJob === k ? 'is-on' : ''}" data-new="${k}" ${locked[k] ? 'disabled' : ''} aria-expanded="${st.newJob === k}">${l}${locked[k] ? `<small>（${esc(locked[k])}）</small>` : ''}</button>`).join('');
  const full = used >= slots ? `<p class="warn">作业位已满（${used}/${slots}）：底座、后训练要先结束或取消一项；试验不占作业位。</p>` : '';
  return `<div class="card wide train-new"><div class="card-head"><b>新作业</b><small>作业位 ${used}/${slots}（试验不占）</small></div>
    <div class="newjob-tabs">${btns}</div>${st.newJob ? `${full}<div class="newjob-form">${newForm(S, st)}</div>` : ''}</div>`;
}
function newForm(S, st) {
  switch (st.newJob) {
    case 'pretrain': return projectForm.render(S, st);
    case 'small': return projectForm.render(S, st, { line: 'small' });
    case 'distill': return E.liveModel(S) || E.distillTeachers(S).length ? distillForm.render(S, st) : '<p class="muted">还没有能当老师的模型。</p>';
    case 'post': return postForm(S, st);
    case 'trial': return trialForm(S, st);
    case 'finetune': return finetuneForm(S, st);
    default: return '';
  }
}
// 后训练表单：模型（主线在练、上一代、没在评测中的小模型）、方向（含自动、刷榜）、结束条件。
function postTargets(S) {
  const out = [];
  const w = E.workingModel(S);
  if (w && w.stage === 'post' && !E.postJobFor(S, w)) out.push(['main', `在练 ${E.modelLabel(w)}（主线）`, w]);
  const p = E.prevModel(S);
  if (p && p.stage === 'post' && !E.postJobFor(S, p)) out.push(['prev', `上一代 ${E.modelLabel(p)}`, p]);
  for (const m of E.smallModels(S)) if (!E.postJobFor(S, m)) out.push([`small:${m.id}`, `小模型 ${m.name || m.draftName || `${params(m.total)}`}`, m]);
  return out;
}
function postForm(S, st) {
  const targets = postTargets(S);
  if (!targets.length) return '<p class="muted">没有能挂后训练的模型：每个模型同一时间只挂一项后训练，在练的、上一代收尾的和待发布的小模型才能练。</p>';
  const d = st.post ||= { target: targets[0][0], dir: 'auto', until: 'd30', dim: null, to: null };
  if (!targets.some(t => t[0] === d.target)) d.target = targets[0][0];
  const m = targets.find(t => t[0] === d.target)[2];
  const spec = postSpec(S, st, m);
  const c = formCheck(S, spec);
  const dir = d.dir.startsWith('bench:') ? null : d.dir === 'auto' ? E.bestDir(S, m) : d.dir;
  const p = dir ? E.postPreview(S, dir, { model: m, avail: c.ok ? E.trainFlops(S) * (c.cards?.got || 0) / Math.max(1, E.gpuAllocation(S).trainGpus) : null }) : null;
  const gains = p ? Object.entries(p.gains).filter(([, v]) => Math.abs(v) >= 0.05).map(([k, v]) => `<span class="gain ${v < 0 ? 'neg' : ''}">${esc(dimLabel(S.mod, k))} ${v > 0 ? '+' : ''}${f1(v * TRAIN_PACE)}</span>`).join('') : '';
  return `<div class="form">
      <label>模型<select data-post="target">${targets.map(([k, l]) => `<option value="${k}" ${k === d.target ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <label>方向<select data-post="dir">${dirOptions(S, m, d.dir)}</select></label>
      <label>什么时候停<select data-post="until">${untilOptions(d.until)}</select></label>
      ${d.until === 'dim' ? `<label>练到<select data-post="dim">${MODALITIES[S.mod].dims.map(x => `<option value="${x.key}" ${x.key === (d.dim || dir || MODALITIES[S.mod].dims[0].key) ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
        <label>分数<input type="number" min="1" max="100" step="0.5" value="${d.to ?? defaultTo(S, m, d.dim || dir)}" data-post="to" /></label>` : ''}
      ${optFields(st, 'post', 'normal', c.minCards)}
    </div>
    ${p ? `<div class="gains">${gains || '<span class="muted">这个方向现在涨不动了</span>'}</div><p class="muted">${esc(curveLine(p.curve))}一个月大约能涨这么多；越接近上限、越接近当前最强，涨得越慢。失败率 ${p.fail}%。</p>` : d.dir.startsWith('bench:') ? '<p class="muted">刷榜：分数会涨，真实能力几乎不变。榜单换新题后加成作废，还可能被质疑。</p>' : ''}
    ${d.until === 'stall' && d.dir === 'auto' ? `<p class="muted">${STALL_AUTO}</p>` : ''}${checkLines(c)}
    <button class="btn btn--primary" data-op="start-post" ${c.ok ? '' : 'disabled'}>开始后训练</button>${c.ok ? '' : `<span class="bad"> ${esc(c.reason)}</span>`}`;
}
const defaultTo = (S, m, k) => (m && k ? Math.min(99, Math.round((m.dims[k] || 0) + 3)) : 60);
function untilOf(d, S, m, dirKey) {
  if (d.until === 'none' || d.until === 'stall') return d.until;
  if (d.until === 'dim') { const k = d.dim || dirKey || MODALITIES[S.mod].dims[0].key; return { dim: k, to: Number(d.to ?? defaultTo(S, m, k)) }; }
  return { days: Number(String(d.until).slice(1)) || 30 };
}
function postSpec(S, st, m) {
  const d = st.post;
  const o = optOf(st, 'post', 'normal');
  const bench = d.dir.startsWith('bench:') ? d.dir.slice(6) : null;
  const dirKey = bench ? null : d.dir === 'auto' ? E.bestDir(S, m) : d.dir;
  return { kind: 'post', target: d.target, ...(bench ? { bench } : { dir: d.dir }), until: untilOf(d, S, m, dirKey), prio: o.prio, ...(o.cap ? { cap: o.cap } : {}) };
}
// 试验表单：种类、档位、技术或维度；显示成本（占卡、天数）、成功率、成功时的收益区间。
const TRIALS = [['tune', '调参'], ['arch', '架构验证'], ['mix', '数据配比']];
const mixDims = S => MODALITIES[S.mod].dims.filter(d => d.key !== 'safety');
// 试验表单的 spec（表单检查和“开始试验”用同一份）。
function trialSpec(st) {
  const d = st.trial;
  const o = optOf(st, 'trial', 'normal');
  return { kind: 'trial', type: d.type, size: d.size, ...(d.type === 'arch' && d.tech ? { tech: d.tech } : {}), ...(d.type === 'mix' && d.dim ? { dim: d.dim } : {}), prio: o.prio, ...(o.cap ? { cap: o.cap } : {}) };
}
function trialForm(S, st) {
  const plan = S.jobs?.plan;
  // 还没定计划：计划表单就在这里原位展开（保存按钮和「下一代计划」卡里的是同一个），存好以后这里换成试验的选项。
  if (!plan) return `<p class="muted">试验都是给下一代底座做的：先定好下一代要练多大的底座，存好以后在这里挑试验。</p>${planForm(S, st)}`;
  const d = st.trial ||= { type: 'tune', size: 'mid', tech: null, dim: null };
  const techs = E.archChoices(S, plan);
  if (d.type === 'arch' && !techs.includes(d.tech)) d.tech = techs[0] || null;
  if (d.type === 'mix' && !mixDims(S).some(x => x.key === d.dim)) d.dim = mixDims(S)[0]?.key || null;
  const spec = trialSpec(st);
  const pv = E.trialPreview(S, spec);
  const c = formCheck(S, spec);
  return `<div class="form">
      <label>种类<select data-trial="type">${TRIALS.map(([k, l]) => `<option value="${k}" ${k === d.type ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>档位<select data-trial="size"><option value="small" ${d.size === 'small' ? 'selected' : ''}>小档（计划底座算力的 ${LAB.SHARE.small * 100}%）</option><option value="mid" ${d.size === 'mid' ? 'selected' : ''}>中档（${LAB.SHARE.mid * 100}%）</option></select></label>
      ${d.type === 'arch' ? `<label>验证哪项技术<select data-trial="tech">${techs.length ? techs.map(t => `<option value="${t}" ${t === d.tech ? 'selected' : ''}>${esc(TECH_BY_ID[t]?.name || t)}${S.techs.includes(t) ? '' : '（研究中）'}</option>`).join('') : '<option value="">没有配得上计划架构的技术</option>'}</select></label>` : ''}
      ${d.type === 'mix' ? `<label>哪一维<select data-trial="dim">${mixDims(S).map(x => `<option value="${x.key}" ${x.key === d.dim ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>` : ''}
      ${optFields(st, 'trial', 'normal', c.minCards)}
    </div>
    ${pv.ok ? `<ul class="kv"><li><span>流程</span><b>至少 ${pv.days} 天</b></li><li><span>成功率</span><b>${pct(pv.odds)}</b></li><li><span>成功时</span><b>${esc(pv.gains)}</b></li>${saveDays(S, plan, d)}</ul>
      ${pv.pRef < 0.999 ? `<p class="warn">计划比参照底座小很多：研究缩短和技术积累只按 ${pct(pv.pRef)} 算。</p>` : ''}
      <p class="muted">结果当场就定了，可能失败；同一种结论只留最好的一条，用在下一个匹配的底座上（同架构、规模在计划的 1/4 到 4 倍之间、一年内）。试验不占作业位，同时最多 ${LAB.PARALLEL} 项。</p>` : ''}
    ${pv.ok ? checkLines(c) : ''}
    <button class="btn btn--primary" data-op="start-trial" ${pv.ok && c.ok ? '' : 'disabled'}>开始试验</button>${pv.ok && c.ok ? '' : `<span class="bad"> ${esc(pv.ok ? c.reason : pv.reason)}</span>`}`;
}
// 成功时下一代底座大约少几天：工期按算力省，但快不过最快天数（已经卡在最快天数上的，省下的是卡）。
function saveDays(S, plan, d) {
  if (d.type === 'mix') return '';
  const pv = E.previewProject(S, plan);
  const g = LAB.GAIN[d.type][d.size];
  if (!Number.isFinite(pv.days) || !g.save) return '';
  const fast = E.fastestDays(S, pv.structure);
  const cut = save => Math.max(0, pv.days - Math.max(fast, pv.days * (1 - save)));
  const lo = cut(g.save * LAB.GAIN_MIN), hi = cut(g.save);
  return `<li><span>下一代底座</span><b>${hi < 0.5 ? `已经卡在最快天数，省下的是卡（约 ${Math.round(pv.days)} 天）` : `约少 ${Math.round(lo)}–${Math.round(hi)} 天（现在约 ${Math.round(pv.days)} 天）`}</b></li>`;
}
// 续训表单：在别家的开源权重上接着练（要先完成解锁它的策略）。
function finetuneForm(S, st) {
  if (!S.strategy?.unlocks?.adopt_open_base) return '<p class="muted">要先完成能解锁“在开源底座上续训”的公司策略。</p>';
  const list = RELEASES.filter(r => r.mod === S.mod && r.open && r.day <= S.day).filter(r => E.finetuneCheck(S, { relId: r.id }).ok).slice(-12).reverse();
  if (!list.length) return '<p class="muted">现在没有能续训的开源权重（只能用宽松许可或可商用的、已经发布的别家模型）。</p>';
  const d = st.ft ||= { relId: list[0].id };
  if (!list.some(r => r.id === d.relId)) d.relId = list[0].id;
  const c = formCheck(S, { kind: 'finetune', cfg: { relId: d.relId } });
  const fc = E.finetuneCheck(S, { relId: d.relId });
  return `<div class="form"><label>底座<select data-ft="relId">${list.map(r => `<option value="${r.id}" ${r.id === d.relId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label></div>
    <p class="muted">约 ${fc.days || '—'} 天练完。续训出来的模型带着别家的谱系，出生即被污染：后训练超不过这个底座和当前最强里低的那个。</p>
    ${checkLines(c)}
    <button class="btn btn--primary" data-op="start-finetune" ${c.ok ? '' : 'disabled'}>开始续训</button>${c.ok ? '' : `<span class="bad"> ${esc(c.reason)}</span>`}`;
}

// ---------- 模型（在练、上一代收尾、小模型） ----------
function modelCard(S, st) {
  const rows = [];
  const w = E.workingModel(S);
  if (w && w.stage === 'post') rows.push(mainRow(S, st, w));
  else rows.push(`<div class="model-row"><div class="model-head"><span class="ev-tag">在练</span><b>${E.hasBaseJob(S, 'main') ? '主线底座还在预训练，练完会出现在这里' : '主线还没有在练的模型：从上面开一个底座'}</b></div></div>`);
  const p = E.prevModel(S);
  if (p && p.stage === 'post') rows.push(prevRow(S, st, p));
  if (S.mod === 'llm') rows.push(smallRows(S, st));
  return `<div class="card wide train-models"><div class="card-head"><b>模型</b><small>送评时按当天的样子冻结候选，评测期间在练模型接着练</small></div>${rows.join('')}</div>`;
}
const submitBtn = (S, m, line) => { const why = E.submitBlock(S, m, line); return `<button class="btn btn--sm btn--primary" data-submit="${m.id}" data-line="${line}" ${why ? `disabled title="${esc(why)}"` : ''}>送评</button>`; };
const submitBox = (S, st, m, line) => (st.submit === m.id ? `<div class="submit-box" data-submit-box>${releasePanel.form(S, m, line, { choose: false })}</div>` : '');
function mainRow(S, st, w) {
  const job = E.postJobFor(S, w);
  const since = Math.max(0, (w.postDays || 0) - (w.relDays || 0));
  const dir = job ? postDir(S, job, w) : E.bestDir(S, w);
  const p = dir ? E.postPreview(S, dir, { model: w }) : null;
  const ev = (S.evals || []).find(e => e.line === 'main');
  const open = st.modelOpen === 'main';
  const why = E.submitBlock(S, w, 'main');
  // 送评过的写“送评以后又练了 N 天”；从没送评过的（比如刚练完的新底座）写“这一版练了 N 天”，和主界面模型卡同一个说法。
  const facts = [(w.releases || 0) > 0 ? `送评以后又练了 ${since} 天` : `这一版练了 ${since} 天`, curveShort(p?.curve), job ? '' : '没挂后训练', ev ? `${ev.plan?.name} 候选评测中` : ''].filter(Boolean);
  return `<div class="model-row">
    <div class="model-head"><span class="ev-tag">在练</span><button class="model-name" data-model-open="main" aria-expanded="${open}"><b>${esc(E.modelLabel(w))}</b><small>（主线）· ${esc(facts.join(' · '))}</small><em>${open ? '收起' : '冲顶力 ▸'}</em></button>
      <span class="ops">${submitBtn(S, w, 'main')}${job ? '' : '<button class="btn btn--sm" data-new-post="main">后训练</button>'}</span></div>
    ${why && !ev ? `<p class="muted">送评：${esc(why)}。</p>` : ''}
    ${submitBox(S, st, w, 'main')}
    ${open ? mainDetail(S, w, job) : ''}
  </div>`;
}
// 在练模型展开区：D6.6 的状态行、冲顶力四根条、各方向一个月大约涨多少（点一下改练这个方向）、弱老师提示、C2 的干净训练。
function mainDetail(S, w, job) {
  let curve = null;
  const held = new Set();
  const cur = job && !job.bench && !job.paused ? postDir(S, job, w) : null;
  const items = E.directionsFor(S).map(d => {
    const p = E.postPreview(S, d.key, { model: w });
    if (!p) return '';
    curve = curve || p.curve;
    for (const f of p.held || []) held.add(f);
    const gains = Object.entries(p.gains).filter(([, v]) => Math.abs(v) >= 0.05).map(([k, v]) => `<span class="gain ${v < 0 ? 'neg' : ''}">${esc(dimLabel(S.mod, k))} ${v > 0 ? '+' : ''}${f1(v * TRAIN_PACE)}</span>`).join('');
    const h = p.curve?.H?.[d.main];
    const near = Number.isFinite(h) && h < 0.995 ? `<span class="${h < 0.3 ? 'bad' : ''}">接近最强 ×${f2(h)}</span>` : '';
    const capped = Number.isFinite(p.qCap) ? `<span class="bad">被老师卡在 ${f1(p.qCap)} 以下</span>` : '';
    return `<button class="pick-row ${cur === d.key ? 'is-on' : ''}" data-post-main="${d.key}"><div><b>${esc(d.label)}</b><small>${esc(d.method)}</small></div><div class="gains">${gains}</div>
      <div class="meta"><span>数据 ${p.useDistill ? `蒸馏占 ${pct(p.sigma)}` : p.dataLevel >= 2 ? '充足' : p.dataLevel >= 1 ? '一般' : p.dataLevel > 0 ? '偏少' : '缺乏'}</span><span>算力 ${pct(Math.min(1.2, p.computeMult))}</span><span class="${p.fail >= 20 ? 'bad' : ''}">失败率 ${p.fail}%</span>${near}${capped}</div></button>`;
  }).join('');
  const heldText = held.size ? ` ${[...held].map(f => S.data.teachers?.[f]?.name || f).join('、')} 比这一代弱，数据先放着不用（后台「数据」页可以确认）。` : '';
  const clean = E.grantsFor(S, 'flagship').flatMap(h => E.nameGrantCheck(S, w, h.id).lines.filter(l => /干净/.test(l.text)).map(l => `${l.ok ? '✓' : '✗'} 授名「${h.name}」：${l.text.replace('干净训练满 ', '干净训练 ')}，现在 ${l.now}`));
  return `<div class="model-detail">
    ${curve ? `<p class="muted">${esc(curveLine(curve))}${S.jobs.ownOnly ? ' 现在只用自有数据（下面可以改）。' : ''}${esc(heldText)}</p><details class="curve" open><summary>冲顶力</summary>${effortBars(curve)}</details>` : ''}
    ${clean.length ? `<ul class="check-lines">${clean.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${items ? `<p class="muted">一个月大约能涨多少（按主线后训练能分到的卡算）；点一下改练这个方向${job ? '' : '，没挂后训练的会挂上一项，一直练'}。</p><div class="pick-list">${items}</div>` : '<p class="muted">现在没有能练的方向。</p>'}
  </div>`;
}
function prevRow(S, st, p) {
  const left = Math.max(0, E.daysBetween(S.day, S.prevWorking.until));
  const unrel = Math.max(0, (p.postDays || 0) - (p.relDays || 0));
  const job = E.postJobFor(S, p);
  const ev = (S.evals || []).find(e => e.line === 'prev');
  // 送评按钮置灰时把原因写出来（title 在手机上看不到），和主线那一行一样。
  const why = E.submitBlock(S, p, 'prev');
  return `<div class="model-row">
    <div class="model-head"><span class="ev-tag">上一代收尾</span><span class="model-name"><b>${esc(E.modelLabel(p))}</b><small>还有 ${left} 天归档 · 有 ${unrel} 天没发布的进步${ev ? ` · ${esc(ev.plan?.name)} 候选评测中` : ''}；弱于在线旗舰时默认作为副线发布</small></span>
      <span class="ops">${submitBtn(S, p, 'prev')}${job ? '' : '<button class="btn btn--sm" data-new-post="prev">后训练</button>'}</span></div>
    ${why && !ev ? `<p class="muted">送评：${esc(why)}。</p>` : ''}
    ${submitBox(S, st, p, 'prev')}
  </div>`;
}
function smallRows(S, st) {
  const pending = [S.smallWorking, ...(S.smallShelf || [])].map(id => (S.models || []).find(m => m.id === id)).filter(Boolean);
  const building = (S.jobs?.list || []).filter(j => (j.kind === 'distill' || j.kind === 'pretrain') && j.line === 'small');
  const n = pending.length + building.length;
  const head = `<div class="model-head"><span class="ev-tag">小模型线</span><span class="model-name"><b>${n}/${JOBS.SMALL_LINE}</b><small>${n >= JOBS.SMALL_LINE ? '满了：先送评发布一个，才能再蒸馏或练小底座' : '蒸馏或从零练小底座，练完待发布'}</small></span></div>`;
  const rows = pending.map(m => {
    const ev = m.evalId ? (S.evals || []).find(e => e.id === m.evalId) : null;
    const name = ev?.plan?.name || m.name || m.draftName || '新的小模型';
    const state = ev ? `评测中，还剩 ${Math.max(0, E.daysBetween(S.day, ev.until))} 天（已冻结）` : E.postJobFor(S, m) ? '待发布 · 后训练中' : '待发布';
    return `<div class="model-sub"><span><b>${esc(name)}</b> <small>${params(m.total)} · ${state}</small></span>
      <span class="ops">${ev ? '' : `${submitBtn(S, m, 'small')}${E.postJobFor(S, m) ? '' : `<button class="btn btn--sm" data-new-post="small:${m.id}">后训练</button>`}`}</span></div>${ev ? '' : submitBox(S, st, m, 'small')}`;
  }).join('');
  const jobs = building.map(j => `<div class="model-sub"><span><b>${esc(jobName(S, j))}</b> <small>${j.kind === 'distill' ? '蒸馏' : '小底座'}练着 ${Math.round(E.projectProgress(j.pj) * 100)}%</small></span></div>`).join('');
  return `<div class="model-row">${head}${rows}${jobs}</div>`;
}

// ---------- 下一代计划和试验结论 ----------
function planText(S, plan) {
  if (!plan) return '还没定';
  if (S.mod !== 'llm') return `${SCALES[S.mod].find(x => x.id === plan.scaleId)?.label || plan.scaleId} · ${plan.tokens}T`;
  return `${params(plan.total)}${plan.active < plan.total ? `/${params(plan.active)}` : ''} ${ARCHS[plan.arch]?.label || ''} · ${plan.tokens}T token`;
}
const FIND_TEXT = (S, f) => (f.type === 'mix' ? `数据配比（${dimLabel(S.mod, f.dim)}）成功：那一维出生 +${f1(f.dimBonus)}`
  : `${f.type === 'tune' ? '调参' : `架构验证（${TECH_BY_ID[f.tech]?.name || f.tech}）`}${f.size === 'mid' ? '中档' : '小档'}成功：省算力 ${f1(f.save * 100)}%，炸炉 ×${f2(f.risk)}`);
function planCard(S, st) {
  const plan = S.jobs?.plan;
  const finds = S.jobs?.findings || [];
  const match = plan ? E.matchFindings(S, plan) : [];
  const running = (S.jobs?.list || []).filter(j => j.kind === 'trial');
  const lines = TRIALS.map(([k, l]) => {
    const fs = finds.filter(f => f.type === k);
    const run = running.filter(j => j.type === k);
    if (!fs.length) return `${l}：${run.length ? '在做' : '还没做'}`;
    return fs.map(f => `${FIND_TEXT(S, f)}${match.includes(f) ? '' : '（和计划对不上，用不上）'}`).join('；');
  });
  // 最近做完的试验（成功、失败都有；公司日志里的原话，维度写成中文）。
  const keys = new Map(MODALITIES[S.mod].dims.map(d => [d.key, d.label]));
  const done = (S.log || []).filter(x => typeof x?.text === 'string' && x.text.startsWith('试验 · ')).slice(-3).reverse()
    .map(x => x.text.replace(/（([a-z_]+)）/g, (m, k) => (keys.has(k) ? `（${keys.get(k)}）` : m)));
  return `<div class="card train-plan"><div class="card-head"><b>下一代计划</b><small>试验都给它做，底座立项时用掉对得上的结论</small></div>
    <p class="plan-line"><b>${esc(planText(S, plan))}</b> <button class="btn btn--sm" data-plan-edit="${st.planEdit ? 0 : 1}">${st.planEdit ? '收起' : plan ? '改' : '定计划'}</button></p>
    ${st.planEdit ? planForm(S, st) : ''}
    <ul class="check-lines">${lines.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    ${done.length ? `<p class="muted">最近做完的试验：</p><ul class="check-lines">${done.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`;
}
// 计划的草稿：已有计划；没有就用顾问会挑的下一代底座、或立项表单里的配置。
function planDraft(S, st) {
  if (st.plan) return st.plan;
  const adv = E.advise(S).find(a => a.op?.type === 'project' || a.op?.type === 'trial');
  st.plan = { ...(S.jobs?.plan || adv?.op?.cfg || adv?.op?.plan || st.proj || (S.mod === 'llm' ? { total: 70, active: 70, arch: 'dense', tokens: 2 } : { scaleId: SCALES[S.mod][1].id, tokens: 1 })) };
  return st.plan;
}
function planForm(S, st) {
  const c = planDraft(S, st);
  let body;
  if (S.mod === 'llm') {
    if (!ARCHS[c.arch]) c.arch = c.active < c.total ? 'moe' : 'dense';
    const actives = c.arch === 'moe' ? PARAM_ACTIVES.filter(a => a <= c.total / 3) : [c.total];
    if (!actives.includes(c.active)) c.active = actives.at(-1) || c.total;
    body = `<label>总参数<select data-plan="total">${PARAM_TOTALS.map(t => `<option value="${t}" ${t === c.total ? 'selected' : ''}>${params(t)}</option>`).join('')}</select></label>
      <label>架构<select data-plan="arch">${Object.entries(ARCHS).filter(([, a]) => !a.only || a.only.includes(S.charId)).map(([k, a]) => `<option value="${k}" ${k === c.arch ? 'selected' : ''}>${a.label}</option>`).join('')}</select></label>
      <label>激活参数<select data-plan="active" ${c.arch === 'moe' ? '' : 'disabled'}>${actives.map(a => `<option value="${a}" ${a === c.active ? 'selected' : ''}>${params(a)}</option>`).join('')}</select></label>`;
  } else body = `<label>规模<select data-plan="scaleId">${SCALES[S.mod].map(x => `<option value="${x.id}" ${x.id === c.scaleId ? 'selected' : ''}>${x.label}</option>`).join('')}</select></label>`;
  body += `<label>训练 token<select data-plan="tokens">${[0.3, 0.5, 1, 2, 4, 8, 12, 15, 20, 30].map(t => `<option value="${t}" ${t === c.tokens ? 'selected' : ''}>${t}T</option>`).join('')}</select></label>`;
  return `<div class="form">${body}</div><p class="muted">只设下限：语言模型不小于参照底座的四分之一，其余不低于参照底座一档；计划越大，试验越贵。</p>
    <button class="btn btn--primary btn--sm" data-op="save-plan">保存计划</button>`;
}

// ---------- 集群健康、检修、专心研究、只用自有数据 ----------
function healthCard(S) {
  const J = S.jobs;
  const posts = (J.list || []).filter(j => j.kind === 'post');
  const focus = Array.isArray(J.focusPause);
  const hw = E.heavyWork(S);
  return `<div class="card train-health"><div class="card-head"><b>集群健康 ${Math.round(S.health)}</b><small>研究速度 ×${hw.busy}${hw.kind === 'none' ? '（没有重活）' : '（有重活）'}</small></div>
    <div class="meter ${S.health >= 60 ? 'hi' : S.health >= 35 ? 'mid' : 'lo'}"><span>健康度</span><div class="bar"><i style="width:${S.health}%"></i></div><b>${Math.round(S.health)}</b></div>
    <label class="toggle"><input type="checkbox" data-auto-repair ${J.autoRepair ? 'checked' : ''} /> 自动检修（低于 ${REPAIR.start} 自动检修，到 ${REPAIR.until} 结束）</label>
    <div class="ops">${J.repair ? '<button class="btn btn--sm" data-job-op="repair" data-on="0">结束检修</button>' : '<button class="btn btn--sm" data-job-op="repair" data-on="1">现在检修</button>'}
      ${focus ? '<button class="btn btn--sm is-on" data-job-op="focus" data-on="0">恢复后训练</button>' : posts.some(j => !j.paused) ? '<button class="btn btn--sm" data-job-op="focus" data-on="1">专心研究</button>' : ''}</div>
    <p class="muted">检修：后训练全部停下，训练卡留出四分之一，健康每天回升约 ${REPAIR.rate}；底座和试验照常用剩下的四分之三。团队有重活（后训练、检修）时研究速度 ×${JOBS.RESEARCH.busy}，没有时 ×${JOBS.RESEARCH.free}；专心研究就是暂停全部后训练，恢复时一起恢复。</p>
    <label class="toggle"><input type="checkbox" data-own-only ${J.ownOnly ? 'checked' : ''} /> 只用自有数据（后训练不再用蒸馏数据；以后想解除老师的天花板，就得这样练）</label></div>`;
}
function logCard(S) {
  const log = S.jobs?.log || [];
  if (!log.length) return '';
  return `<div class="card train-log"><details><summary>作业日志 · 最近 ${Math.min(12, log.length)} 条</summary><ul class="kv">${log.slice(0, 12).map(x => `<li><span>${esc(x.text)}</span><b>${esc((x.day || '').slice(5))}</b></li>`).join('')}</ul></details></div>`;
}

export function render(S, st) {
  const al = E.allocJobs(S);
  const ga = E.gpuAllocation(S);
  return `<h2>训练</h2>
    <p class="train-sub">作业位 ${E.slotsUsed(S)}/${E.jobSlots(S)}（试验不占）· 训练卡 ${count(ga.trainGpus)} 张${S.jobs?.repair ? ' · 检修中' : ''}</p>
    <div class="card wide train-alloc"><div class="card-head"><b>卡怎么分</b><button class="link-btn" data-goto="compute">推理份额、出租去「算力」页调 ›</button></div>${allocBar(S)}</div>
    ${runningCard(S, al, st)}
    ${newJobCard(S, st)}
    ${modelCard(S, st)}
    ${planCard(S, st)}
    ${healthCard(S)}
    ${logCard(S)}`;
}

// ---------- 交互 ----------
const confirmOnce = (b, text) => { if (b.dataset.confirm) return true; b.dataset.confirm = '1'; b.textContent = text; return false; };
const job = (S, arg) => jobAct(S, arg);
export function click(S, t, ctx) {
  const { st, guard, draw } = ctx;
  const go = t.closest('[data-goto]');
  if (go) { st.page = go.dataset.goto; draw(); return; }
  const nb = t.closest('[data-new]');
  if (nb) { st.newJob = st.newJob === nb.dataset.new ? null : nb.dataset.new; draw(); return; }
  const np = t.closest('[data-new-post]');
  if (np) { st.newJob = 'post'; st.post = { target: np.dataset.newPost, dir: 'auto', until: np.dataset.newPost === 'main' ? 'none' : 'd30' }; draw(); return; }
  const menu = t.closest('[data-job-menu]');
  if (menu) { st.jobMenu = st.jobMenu === menu.dataset.jobMenu ? null : menu.dataset.jobMenu; draw(); return; }
  const mo = t.closest('[data-model-open]');
  if (mo) { st.modelOpen = st.modelOpen === mo.dataset.modelOpen ? null : mo.dataset.modelOpen; draw(); return; }
  const pe = t.closest('[data-plan-edit]');
  if (pe) { st.planEdit = pe.dataset.planEdit === '1'; st.plan = null; draw(); return; }
  const sb = t.closest('[data-submit]');
  if (sb) { st.submit = st.submit === sb.dataset.submit ? null : sb.dataset.submit; draw(); return; }
  const op = t.closest('[data-job-op]');
  if (op) {
    const k = op.dataset.jobOp, id = op.dataset.id, on = op.dataset.on === '1';
    if (k === 'cancel' && !confirmOnce(op, '再点一次确认取消')) return;
    return guard(() => {
      if (k === 'pause') return job(S, { op: 'pause', id, on });
      if (k === 'prio') return job(S, { op: 'prio', id, prio: op.dataset.prio });
      if (k === 'rush') return job(S, { op: 'rush', id, on });
      if (k === 'repair') return { ...job(S, { op: 'repair', on }), note: on ? '开始检修：后训练先停下，健康每天回升约 1.6' : '检修结束，后训练接着练' };
      if (k === 'focus') return { ...job(S, { op: 'focusResearch', on }), note: on ? '专心研究：后训练全部先暂停' : '后训练恢复了' };
      if (k === 'cancel') { if (st.jobMenu === id) st.jobMenu = null; return job(S, { op: 'cancel', id }); }
      return null;
    });
  }
  const ce = t.closest('[data-cancel-eval]');
  if (ce) {
    if (!confirmOnce(ce, '再点一次确认撤回')) return;
    return guard(() => after(decideAct(S, 'cancelEval', { id: ce.dataset.cancelEval }), () => ({ note: '撤回了送评：这一版回到在练模型上，以后可以再送评' })));
  }
  const pm = t.closest('[data-post-main]');
  if (pm) return guard(() => postMain(S, pm.dataset.postMain));
  const pick = t.closest('[data-submit-box] [data-pick]');
  if (pick) {
    const box = pick.closest('[data-submit-box]');
    const [action, arg] = releasePanel.pick(box, pick);
    // 跳过评测当天就发布：关掉后台，在主界面播发布结果（和点“发布”一样）。
    if (arg.tier === 'skip' && !st.readOnly) { st.submit = null; closeLayer(); renderMain(); doDecision(action, arg); return; }
    return guard(() => after(decideAct(S, action, arg), r => { st.submit = null; return r?.kind === 'submit' ? { note: `已送评「${r.name}」，${r.days} 天后评完自动发布` } : null; }));
  }
  const o = t.closest('[data-op]')?.dataset.op;
  if (o === 'start-post') return guard(() => { const w = postTargets(S).find(x => x[0] === st.post.target)?.[2]; startNew(S, postSpec(S, st, w)); st.newJob = null; st.post = null; return { note: '后训练开始了' }; });
  if (o === 'start-trial') return guard(() => { startNew(S, trialSpec(st)); st.newJob = null; return { note: '试验开始了：结果做完才知道' }; });
  if (o === 'start-finetune') return guard(() => { startNew(S, { kind: 'finetune', cfg: { relId: st.ft.relId } }); st.newJob = null; return { note: '续训开始了' }; });
  if (o === 'save-plan') return guard(() => { job(S, { op: 'plan', plan: st.plan }); st.planEdit = false; st.plan = null; return { note: '下一代计划定好了' }; });
  projectForm.click(S, t, ctx);
  distillForm.click(S, t, ctx);
}
// 在练模型展开区点了一个方向：主线后训练改练它（被“专心研究”暂停的一起恢复）；没挂后训练就挂一项，一直练。
function postMain(S, dir) {
  if (Array.isArray(S.jobs.focusPause)) act(S, 'focusResearch', { on: false });
  const j = E.mainPostJob(S);
  if (j) { if (j.paused) act(S, 'pauseJob', { id: j.id, on: false }); act(S, 'setPost', { id: j.id, dir }); return { note: `主线后训练改练：${E.directionsFor(S).find(d => d.key === dir)?.label || dir}` }; }
  jobAct(S, { op: 'start', spec: { kind: 'post', target: 'main', dir, until: 'none' } });
  return { note: '主线挂上了后训练' };
}
export function change(S, t, ctx) {
  const { st, guard, draw } = ctx;
  const ds = t.dataset;
  if (optChange(st, t, draw)) return;
  if (ds.post) { const d = st.post; d[ds.post] = t.value; if (ds.post === 'until' && t.value === 'dim') { d.dim = null; d.to = null; } draw(); return; }
  if (ds.trial) { st.trial[ds.trial] = t.value; draw(); return; }
  if (ds.ft) { st.ft[ds.ft] = t.value; draw(); return; }
  if (ds.plan) {
    const c = st.plan, k = ds.plan;
    c[k] = k === 'arch' || k === 'scaleId' ? t.value : Number(t.value);
    if (k === 'arch' || k === 'total') c.active = c.arch === 'moe' ? Math.min(c.active, c.total / 3) : c.total;
    draw(); return;
  }
  if (ds.jobCap) return guard(() => job(S, { op: 'cap', id: ds.jobCap, cards: t.value === '' ? null : Number(t.value) }));
  if (ds.postDir) return guard(() => (t.value.startsWith('bench:') ? job(S, { op: 'post', id: ds.postDir, bench: t.value.slice(6) }) : job(S, { op: 'post', id: ds.postDir, dir: t.value })));
  if (ds.postUntil) {
    return guard(() => {
      const jb = (S.jobs.list || []).find(j => j.id === ds.postUntil);
      const m = jb ? E.postTarget(S, jb) : null;
      const k = jb ? postDir(S, jb, m) || MODALITIES[S.mod].dims[0].key : MODALITIES[S.mod].dims[0].key;
      const v = t.value;
      const until = v === 'none' || v === 'stall' ? v : v === 'dim' ? { dim: k, to: defaultTo(S, m, k) } : { days: Number(v.slice(1)) };
      return job(S, { op: 'post', id: ds.postUntil, until });
    });
  }
  if (ds.postDim || ds.postTo) {
    const id = ds.postDim || ds.postTo;
    return guard(() => {
      const jb = (S.jobs.list || []).find(j => j.id === id);
      const u = jb?.until?.dim ? { ...jb.until } : { dim: MODALITIES[S.mod].dims[0].key, to: 60 };
      if (ds.postDim) u.dim = t.value; else u.to = Number(t.value);
      return job(S, { op: 'post', id, until: u });
    });
  }
  if (ds.autoRepair !== undefined) return guard(() => job(S, { op: 'autoRepair', on: !!t.checked }));
  if (ds.ownOnly !== undefined) return guard(() => act(S, 'setOwnOnly', { on: !!t.checked }));
  projectForm.change(S, t, ctx);
  distillForm.change(S, t, ctx);
}
