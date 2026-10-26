import {postOnlyStatus} from './post_only_status.js';
import {homeTrainingActions} from './home_training.js';
import {renderWithImageReuse} from './image_reuse.js';
// 育成大厅：角色优先，主行动与常用入口集中在行动坞；经营详情按需展开。
import * as E from '../engine.js';
import { jobCardCounts } from './job_card_counts.js';
import { MODALITIES, ARCHS, GPUS, TECH_BY_ID, fmtDate, monthsBetween, personaPlate } from '../data/core.js';
import { BENCH_BY_ID } from '../data/benchmarks.js';
import { esc, usd, count, pct, params, art, stagePortrait, icon, BG, MORALE, fmtScore, hasEmotion, dimLockText, numHtml, grade } from './fmt.js';
import { sparkline } from './charts.js';
import { daysBetween, inDays, fmtShortDay } from '../engine.js';
import { getState, getMp, ui, clock, save, render, toast, setSpeed } from './state.js';
import { topBar } from './topbar.js';
import { openOffice } from './office.js';
import { manualAdvice, setResearchRecommendation } from './advice_navigation.js';
import { openIpoDecision } from './ipo_decision.js';
import { runQueue, finishGame, doDecision, onEnterGame } from './flow.js';
import { act } from './act.js';
import { pendingPostTraining, usesPostTrainingCards } from './post_training_entry.js';
import { inboxHtml } from './inbox.js';
import { chatHtml } from './pages/lobby.js';
import { jobView, jobName, repairText } from './pages/train.js';

// 月度结算的小卡片：贴在舞台上几秒，不打断时间。
export function monthReport(r) {
  const net = (r.revenue || 0) - (r.costs?.total || 0);
  ui.report = { until: Date.now() + 6000, html: `<div class="report report--month" role="status"><b>${fmtDate(r.date)}结算</b>
    <div class="report-money"><span>收入 ${usd(r.revenue || 0)}</span><span>支出 ${usd(r.costs?.total || 0)}</span><span class="${net < 0 ? 'bad' : 'ok'}">${net >= 0 ? '+' : ''}${usd(net)}</span></div>
    ${(r.notes || []).slice(0, 4).map(n => `<p>${esc(n)}</p>`).join('')}</div>` };
}

export function homeLine(S) {
  const lines = [];
  const sv = S.service.last || {};
  const goal = S.goals.find(g => g.status === 'pending' && g.check.type !== 'final');
  const a = E.availableActions(S);
  const al = E.allocJobs(S);
  const base = al.items.find(i => E.isBaseJob(i.job) && i.job.line === 'main');
  const mainPost = al.items.find(i => i.job.kind === 'post' && i.job.target === 'main');
  const w = E.workingModel(S);
  if (S.health < 45) lines.push(S.jobs?.repair ? '集群检修中：后训练暂停，健康度逐日恢复。' : '集群健康度偏低：继续满载训练，节点故障与 loss spike 风险上升。');
  if (sv.r429 > 0.04) lines.push(`高峰期 ${pct(sv.r429)} 的请求返回 429（限流）：推理容量不足。`);
  if (goal && monthsBetween(S.date, goal.date) <= 2) lines.push(`董事会目标「${goal.title}」${monthsBetween(S.date, goal.date) <= 0 ? '本月检查' : `${monthsBetween(S.date, goal.date)} 个月后检查`}：${E.goalNeed(goal.check)}。`);
  if (a.release) lines.push('当前 checkpoint 已满足送评条件，可提交评测。');
  for (const ev of (S.evals || []).slice(0, 1)) lines.push(`「${ev.plan?.name}」安全评测中，${Math.max(0, daysBetween(S.day, ev.until))} 天后完成并发布。`);
  if (base) {
    const eta = E.jobEta(S, base.job, base);
    const p = Math.round(E.projectProgress(base.job.pj) * 100);
    const what = base.job.kind === 'distill' ? '小模型蒸馏' : '预训练';
    // 暂停的不参加分卡（why 是 paused），不是在排队。
    if (base.why === 'paused') lines.push(`${what}已暂停 · 进度 ${p}%（checkpoint 已保存），可在「训练」恢复。`);
    else lines.push(`${what}进度 ${p}% · ${base.run && Number.isFinite(eta) ? `预计 ${Math.max(1, Math.round(eta))} 天完成` : '无可用训练卡，排队等待算力'}。`);
  }
  if (mainPost && mainPost.why === 'min') lines.push('后训练排队中：暂无可分配的训练卡。');
  if (!E.liveModel(S) && !E.hasBaseJob(S) && !w) lines.push('暂无可用模型：需在「训练」立项预训练 Base Model。');
  if (w && w.stage === 'post' && !mainPost && !S.jobs?.repair) lines.push('主线模型还没开始后训练。点击「后训练」，选择模型并安排训练。');
  const news = S.news[0];
  if (news && news.date === S.date && news.type === 'release') lines.push(`竞品动态：${news.title}。`);
  lines.push(clock.speed ? '模拟运行中 · 有事件需要决策时自动暂停。' : '已暂停 · 点击 ▶ 或按空格继续推进。');
  return lines[ui.lineIdx % lines.length];
}

function dimRows(S, model) {
  if (!model) return `<p class="muted">${E.hasBaseJob(S, 'main') ? 'Base Model 预训练中，完成后显示能力数据。' : '尚无模型：在「训练」立项预训练 Base Model。'}</p>`;
  const caps = E.computeCaps(S, model);
  return `<div class="dims">${MODALITIES[S.mod].dims.map(d => {
    const locked = !E.dimUnlocked(S, S.mod, d.key);
    const v = model.dims[d.key] || 0;
    const est = locked ? '' : estimateFor(S, d.key, model);
    // 解锁的维度前面加评级字母（纯显示）；锁住的照旧只有名称、空条和解锁条件。
    const gr = locked ? null : grade(v);
    // 舞台上画成弧形仪表：--v 是当前值、--cap 是上限（金色刻度），都写在 dim-bar 上；估计分数在悬停提示里。
    return `<div class="dim ${locked ? 'locked' : ''}" data-dim="${d.key}">${gr ? `<i class="grade ${gr.cls}">${gr.g}</i>` : ''}<span class="dim-l" title="${esc(d.label)}">${esc(({math:'数学',writing:'写作',safety:'安全',knowledge:'知识',code:'代码',agent:'Agent'})[d.key] || d.label)}</span><span class="dim-bar"${locked ? '' : ` style="--v:${v.toFixed(1)};--cap:${caps[d.key]}"${est ? ` title="${esc(est)}"` : ''}`}>${locked ? '' : `<i style="width:${v}%"></i><em style="left:${caps[d.key]}%"></em>`}</span><b>${locked ? '—' : v.toFixed(1)}</b><small>${esc(locked ? dimLockText(d) : est)}</small></div>`;
  }).join('')}</div>`;
}
// 每个维度对应一个当前最常引用的评测，给出估计分数。
const DIM_BENCH = { knowledge: ['mmlupro', 'mmlu'], code: ['swebv', 'humaneval'], math: ['aime26', 'aime25', 'aime24', 'math', 'gsm8k'], writing: ['arena'], safety: ['harmbench'], agent: ['tbench', 'taubench'],
  aesthetics: ['imgarena'], adherence: ['geneval'], text: ['imgtext'], realism: ['dpg'], composition: ['musiccaps'], vocals: ['musicarena'], lyrics: ['lyricwer'], fidelity: ['musiccaps'],
  naturalness: ['mos'], cloning: ['seedtts'], multilingual: ['fleurs'], expressive: ['ttsarena'] };
function estimateFor(S, dim, model) {
  for (const id of DIM_BENCH[dim] || []) {
    const b = BENCH_BY_ID[id];
    if (!b || S.date < b.from) continue;
    const r = E.runBenchmark({ ...S, rng: 1 }, id, model);
    return `${b.name} ≈ ${fmtScore(b, r.score)}`;
  }
  return '';
}

// “下一步”大按钮：系统现在最推荐做的事。马上能做的点了就生效；立项、融资、上市先打开后台确认；最后一条是后训练怎么安排（kind 'jobs'）。
// 团队已经在做推荐的事时（same），按钮变成“让时间走起来”。
const ADVICE_TAG = { event: '先处理', free: '马上做', page: '去后台确认', jobs: '训练安排' };
// 团队现在在忙什么（按作业表）：检修、主线后训练练什么、只有别的后训练、都没有就是专心研究。
function teamDoing(S) {
  if (S.jobs?.repair) return '检修集群';
  const main = E.mainPostJob(S);
  if (main && !main.paused) return jobName(S, main).replace(/^[^·]+ · /, '后训练 · ');
  if ((S.jobs?.list || []).some(j => j.kind === 'post' && !j.paused)) return '后训练';
  return '专心研究';
}
// 每次渲染都重算 advise()（实测约 10 毫秒）：手拼的缓存键总会漏掉某些状态，按钮就会显示过期的建议。
// 联机里卡片在收件箱里，“先处理眼前的事件”这条建议不出（它说处理完时间才走，联机里时间不停）。
const currentAdvice = S => E.advise(S).filter(a => !ui.skip.has(`${S.date}|${a.id}`) && !(getMp() && a.op?.type === 'queue')).map(manualAdvice);
// 时间在不在走：联机看服务器的时钟，单人看本地速度。
const running = () => { const m = getMp(); return m ? !m.clock?.paused : !!clock.speed; };
const isPostAdvice = a => a.kind === 'jobs' && a.op?.type === 'job' && a.op.op === 'post';
// Both the main CTA and "other suggestions" are commands, not settings links.
// Offer the same read-only alternative without changing the command/auto path.
const arrangePostAlternative = (S,a) => isPostAdvice(a) && !pendingPostTraining(S)
  ? '<button class="btn next-own-plan" data-act="open-train">自己安排方向与期限 <span>先看训练页，不执行建议</span></button>' : '';
function postAdviceTag(S,a) {
  const pending=pendingPostTraining(S,'main');
  if(a.same&&!pending)return running()?'沿用当前训练 · 时间正在推进':'沿用当前训练 · 让时间继续';
  if(usesPostTrainingCards(S,{kind:'post'}))return pending?'采用建议方向 · 继续选卡':'按此建议开始后训练 · 进入选卡';
  return '按建议安排后训练 · 点击即生效';
}
function nextStep(S, optionsOpen = false) {
  const list = currentAdvice(S);
  if (!list.length) return '';
  const [a, ...rest] = list;
  const trainingAdvice = isPostAdvice(a);
  const pending = a.kind === 'jobs' && a.op?.type === 'job' && a.op.op === 'post' && pendingPostTraining(S, 'main');
  const keep = a.kind === 'jobs' && a.same && !pending;
  const go = running();
  const label = pending ? '继续后训练 · 完成卡组方案' : keep ? (go ? `团队正在：${teamDoing(S)}` : '让时间走起来') : a.label;
  const tag = keep ? (go ? '一切按计划' : `团队在做：${teamDoing(S)}`) : trainingAdvice ? postAdviceTag(S,a) : `下一步 · ${ADVICE_TAG[a.kind] || '马上做'}`;
  const alternative = arrangePostAlternative(S,a);
  const hasOptions = !!alternative || rest.length > 0 || ['free','page'].includes(a.kind);
  return `<div class="next-step">
    <button class="next-btn next-btn--${keep ? 'keep' : a.kind === 'jobs' ? 'focus' : a.kind}" data-act="advice" data-id="${esc(a.id)}" title="${esc(a.detail)}"><span class="next-tag">${esc(tag)}</span><b>${esc(label)}</b><small>${esc(a.detail)}</small>${icon(keep && !go ? 'play' : 'next')}</button>
    ${hasOptions ? `<details class="home-advice-options"${optionsOpen ? ' open' : ''}><summary>其他操作</summary>
    ${alternative}
    <div class="next-foot">${a.kind === 'free' || a.kind === 'page' ? `<button class="next-skip" data-act="advice-skip" data-id="${esc(a.id)}">这个月先不做这条</button>` : '<span></span>'}
      ${rest.length ? `<details class="next-more" ${ui.moreOpen ? 'open' : ''}><summary data-act="more-toggle">其他建议 ${rest.length}</summary>${rest.map(x => { const post=isPostAdvice(x),row=`<button class="next-row" data-act="advice" data-id="${esc(x.id)}"><span class="next-tag">${esc(post?postAdviceTag(S,x):ADVICE_TAG[x.kind] || '马上做')}</span><b>${esc(x.label)}</b><small>${esc(x.detail)}</small></button>`;return post?`<div class="next-choice-row" role="group" aria-label="后训练建议与自行安排">${row}${arrangePostAlternative(S,x)}</div>`:row; }).join('')}</details>` : ''}</div></details>` : ''}
  </div>`;
}
export async function followAdvice(id) {
  const S = getState();
  if (ui.busy) return;
  const a = E.advise(S).find(x => x.id === id);
  if (!a) return render();
  const op = a.op;
  if (op.type === 'queue') { await runQueue(); return S.status === 'ended' ? finishGame() : render(); }
  if (op.type === 'job' && op.op === 'post') {
    const spec = { kind: 'post', target: 'main', dir: op.dir, until: 'none' };
    if (usesPostTrainingCards(S, spec) && (!a.same || pendingPostTraining(S, 'main'))) return doDecision('job', { op: 'start', spec, updateDirection: true });
  }
  if (a.kind === 'jobs' && a.same) { if (!getMp() && !clock.speed) setSpeed(clock.last); render(); return; }
  // 立项、蒸馏：打开训练页，对应的新作业表单直接展开，带着推荐配置，玩家确认后再开。
  if (op.type === 'project') return openOffice('train', { proj: { ...op.cfg } });
  if (op.type === 'distill') return openOffice('train', { distill: { ...op.cfg } });
  if (op.type === 'page') return openOffice(op.page === 'model' ? 'train' : op.page);
  if (op.type === 'tech') { setResearchRecommendation(S, op.id); return openOffice('tech'); }
  if (op.type === 'ipo') return openIpoDecision(S);
  if (op.type === 'fund') return openOffice('capital');
  if (op.type === 'act') return doDecision(op.action, op.arg);
  try { const r = await act(S, 'applyAdvice', { advice: a }); save(); toast(r?.note || `已完成：${a.label}`); } catch (err) { toast(err.message || String(err)); }
  render();
}

// 进行中（规格 T10.1）：作业最多 3 行（优先在前、评测最后），多出来的写“还有 N 项”；末尾“训练卡 a/b 在用 [训练 ›]”。
// 排队的那一行写“排队：缺 N 张卡”（警告色），一张训练卡都没有时写“等待算力”；检修中单独一行。不加按钮：点一行在原位展开两三个最常用的操作。
// 下面照旧是研究、灰度上线和在途订单。
const ORDER_TAG = { gpu: '到货', rent: '开通', smuggle: '转运', data: '数据', distill: '蒸馏' };
const orderLabel = o => (o.kind === 'data' || o.kind === 'distill' ? o.name : `${count(o.n)} 张 ${GPUS[o.ref].label.replace(/（.*?）/, '')}`);
// 主界面上哪一行展开着（作业 id 或评测 id）；换一局时清掉。
const nowOpen = { id: null };
export function toggleNowRow(id) { nowOpen.id = nowOpen.id === id ? null : id; }
onEnterGame(() => { nowOpen.id = null; });
function nowOps(S, job) {
  if (!job) return '<div class="now-ops"><button class="btn btn--sm" data-act="open-train">去训练页</button></div>';
  return `<div class="now-ops">${job.paused ? `<button class="btn btn--sm" data-act="job" data-op="pause" data-id="${job.id}" data-on="0">继续</button>` : `<button class="btn btn--sm" data-act="job" data-op="pause" data-id="${job.id}" data-on="1">暂停</button>`}
    <button class="btn btn--sm" data-act="job" data-op="prio" data-id="${job.id}" data-prio="${job.prio === 'high' ? 'normal' : 'high'}">${job.prio === 'high' ? '改成正常' : '改成优先'}</button>
    <button class="btn btn--sm" data-act="open-train">去训练页</button></div>`;
}
function nowJobRows(S) {
  const al = E.allocJobs(S);
  const rows = [];
  for (const it of al.items) {
    const v = jobView(S, al, it);
    rows.push({ id: it.job.id, job: it.job, html: `<span class="now-tag">${esc(v.tag)}</span><b>${esc(v.name)}</b><small${v.queued ? ' class="warn"' : ''}>${v.prog !== null && !v.queued ? `<i class="mini-prog"><i style="width:${Math.round(v.prog * 100)}%"></i></i>` : ''}${esc(v.short)}</small>` });
  }
  for (const ev of S.evals || []) {
    const what = ev.line === 'small' ? `${ev.plan?.name || ''}（小模型）` : `${ev.plan?.name || ''} 候选`;
    rows.push({ id: ev.id, job: null, html: `<span class="now-tag now-tag--go">评测</span><b>${esc(what)} · ${E.TIER_LABEL[ev.tier]}</b><small>还剩 ${Math.max(0, daysBetween(S.day, ev.until))} 天</small>` });
  }
  const display = jobCardCounts(al);
  return { rows, used: display.used, T: display.total };
}
// “进行中”卡第一行：当前公司策略。只显示状态，不加操作按钮；点这一行进后台的策略页。
function nowStrategy(S) {
  const cur = S.strategy?.cur;
  if (!cur) return `<button class="now-row now-strategy is-idle" data-act="quick" data-id="strategy"><span class="now-tag now-tag--strategy">策略</span><b>现在没有进行中的策略</b><small>去后台挑一项</small></button>`;
  const opt = E.strategyOptions(S).find(x => x.id === cur.id);
  const title = opt?.node?.title || '进行中的策略';
  const left = Math.max(0, Math.ceil(cur.need - cur.days));
  const p = Math.max(0, Math.min(100, cur.need > 0 ? cur.days / cur.need * 100 : 0));
  const paused = !!cur.paused;
  return `<button class="now-row now-strategy${paused ? ' is-paused' : ''}" data-act="quick" data-id="strategy"><span class="now-tag now-tag--strategy">策略</span><b>${esc(title)}</b><small>${paused ? '暂停中' : `<i class="strategy-mini"><i style="width:${p}%"></i></i>${Math.floor(cur.days)}/${cur.need} 天 · 还剩 ${left} 天`}</small></button>`;
}
function nowCard(S) {
  const { rows, used, T } = nowJobRows(S);
  const out = [nowStrategy(S)];
  if (S.jobs?.repair) out.push(`<div class="now-row"><span class="now-tag now-tag--order">检修</span><b>${esc(repairText(S))}</b><small></small></div>`);
  for (const r of rows.slice(0, 3)) {
    const open = nowOpen.id === r.id;
    out.push(`<button class="now-row now-job${open ? ' is-open' : ''}" data-act="now-row" data-id="${esc(r.id)}" aria-expanded="${open}">${r.html}</button>${open ? nowOps(S, r.job) : ''}`);
  }
  const more = rows.length > 3 ? `还有 ${rows.length - 3} 项 · ` : '';
  out.push(`<div class="now-row now-sum"><small>${rows.length ? '' : '没有作业 · '}${more}${T > 0 ? `训练卡 ${used}/${T} 在用` : '等待算力：现在没有训练卡'}</small><button class="btn btn--sm" data-act="open-train">训练 ›</button></div>`);
  for (const r of S.research) {
    const p = Math.min(100, r.done / r.need * 100);
    out.push(`<div class="now-row now-row--bar"><span class="now-tag now-tag--lab">研究</span><button class="now-link" data-act="quick" data-id="tech">${esc(TECH_BY_ID[r.id].name)}</button><div class="progress"><i style="width:${p}%"></i></div><small>${Math.round(p)}% · 约 ${E.daysLeft(S, r)} 天</small></div>`);
  }
  const free = E.researchSlots(S) - S.research.length;
  if (free > 0 && E.researchOptions(S).some(x => x.check.ok)) out.push(`<div class="now-row"><span class="now-tag now-tag--lab">研究</span><b class="muted">还有 ${free} 个研究槽空着</b><button class="btn btn--sm" data-act="quick" data-id="tech">排研究</button></div>`);
  for (const d of S.deploy) out.push(`<div class="now-row"><span class="now-tag now-tag--go">上线</span><b>${esc(d.name)}</b><small>灰度中，${inDays(daysBetween(S.day, d.until))}全量</small></div>`);
  for (const o of S.orders.slice(0, 4)) out.push(`<div class="now-row"><span class="now-tag now-tag--order">${ORDER_TAG[o.kind]}</span><b>${esc(orderLabel(o))}</b><small>${inDays(daysBetween(S.day, o.eta))}</small></div>`);
  if (S.orders.length > 4) out.push(`<small class="muted">还有 ${S.orders.length - 4} 笔在路上</small>`);
  return `<div class="card now-card">
    <div class="card-head"><b>进行中</b><small>团队状态 ${MORALE[S.morale]}</small></div>${out.join('')}
    <div class="meter ${S.health >= 60 ? 'hi' : S.health >= 35 ? 'mid' : 'lo'}"><span>集群健康度</span><div class="bar"><i style="width:${S.health}%"></i></div><b>${Math.round(S.health)}</b></div>
  </div>`;
}
// ---------- 模型阵列（主界面最显眼的一块） ----------
// 列出手上的每个模型：主线在练、在线旗舰、上一代收尾、小模型。点一个就选中它：舞台上的能力仪表换成它的，
// 能挂后训练的直接给“发起后训练”（打开训练页、后训练表单预选这个模型，玩家确认后才开始）。
// 预训练不在这里操作，只在卡片底部挂一行后台进度。
const homeSel = { id: null };
export function selectHomeModel(id) { homeSel.id = homeSel.id === id ? homeSel.id : id; }
onEnterGame(() => { homeSel.id = null; });
function rosterOf(S) {
  const w = E.workingModel(S), live = E.liveModel(S), prev = E.prevModel(S), sl = E.smallLive(S);
  const list = [];
  const add = (m, role, target) => { if (m && !list.some(x => x.m === m)) list.push({ m, role, target }); };
  add(w, '主线', w?.stage === 'post' ? 'main' : null);
  add(live, '在线旗舰', null);
  add(prev, '上一代', prev?.stage === 'post' ? 'prev' : null);
  for (const m of E.smallModels(S)) add(m, '小模型', `small:${m.id}`);
  add(sl, '在线小模型', null);
  return list;
}
const homeModel = (S, list) => list.find(x => x.m.id === homeSel.id) || list[0] || null;
// 阶段标签：已发布 / 后训练中 / Base（底座练完、还没挂后训练）。
function stageTag(S, m) {
  if (m.stage === 'released') return ['RELEASED', '已发布', 'live'];
  return E.postJobFor(S, m) ? ['POST-TRAIN', '后训练中', 'post'] : ['BASE', 'Base · 待后训练', 'base'];
}
function rosterCard(S, al) {
  const list = rosterOf(S);
  const base = al.items.find(i => E.isBaseJob(i.job));
  const bg = base ? (() => { const v = jobView(S, al, base); return `<div class="mdl-bg"><span class="mdl-bg-tag">后台预训练</span><b>${esc(v.name)}</b>${v.prog !== null ? `<i class="mini-prog"><i style="width:${Math.round(v.prog * 100)}%"></i></i>` : ''}<small${v.queued ? ' class="warn"' : ''}>${esc(v.short)}</small></div>`; })() : '';
  if (!list.length) return `<div class="card model-card roster is-empty"><div class="card-head"><b>模型阵列</b><small>暂无可用模型</small></div>
    <p class="muted">${E.hasBaseJob(S, 'main') ? '首个 Base Model 预训练中，完成后出现在这里。' : '尚无 Base Model：需在「训练」立项预训练。'}</p>${bg}
    ${E.hasBaseJob(S, 'main') ? '' : '<button class="btn mdl-go" data-act="open-train">立项预训练</button>'}</div>`;
  const cur = homeModel(S, list);
  const tiles = list.map(x => {
    const [, stateLabel, tone] = stageTag(S, x.m), q = E.qOf(S.mod, x.m.dims), g = grade(q);
    return `<button class="mdl${x === cur ? ' is-on' : ''}" data-act="pick-model" data-id="${esc(x.m.id)}" aria-pressed="${x === cur}">
      <i class="grade ${g.cls}">${g.g}</i><span class="mdl-main"><b>${esc(x.m.name || E.modelLabel(x.m))}</b><small>${esc(x.role)} · ${params(x.m.total)}${x.m.active < x.m.total ? ` / ${params(x.m.active)} 激活` : ''}</small></span><span class="mdl-tag mdl-tag--${tone}">${esc(stateLabel.replace('Base · ', ''))}</span></button>`;
  }).join('');
  const m = cur.m, job = E.postJobFor(S, m), [, stageText] = stageTag(S, m);
  const it = job && al.items.find(i => i.job === job), v = it ? jobView(S, al, it) : null;
  const pending = job && pendingPostTraining(S, cur.target === 'main' ? 'main' : undefined);
  const q = E.qOf(S.mod, m.dims);
  const action = job
    ? `<div class="mdl-job"><span class="now-tag">${esc(v?.tag || '后训练')}</span><b>${esc(v?.name || '后训练')}</b>${v?.prog !== null && v?.prog !== undefined ? `<i class="mini-prog"><i style="width:${Math.round(v.prog * 100)}%"></i></i>` : ''}<small${v?.queued ? ' class="warn"' : ''}>${esc(v?.short || '')}</small></div>
       <button class="btn mdl-go mdl-go--alt" data-act="open-train">${pending ? '继续后训练选卡' : '后训练控制台'}</button>`
    : cur.target ? `<button class="btn mdl-go" data-act="post-model" data-id="${esc(cur.target)}">${icon('play')}<span>发起后训练</span><small>${esc(m.name || E.modelLabel(m))} · SFT / RL</small></button>`
    : `<button class="btn mdl-go mdl-go--alt" data-act="quick" data-id="model">模型详情</button>`;
  return `<div class="card model-card roster"><div class="card-head"><b>模型阵列</b><small>${list.length} 个模型 · 点选查看能力</small></div>
    <div class="mdl-list">${tiles}</div>
    <div class="mdl-detail"><div class="mdl-kv"><span>阶段<b>${esc(stageText)}</b></span><span>综合<b>${q.toFixed(1)}</b></span><span>架构<b>${esc(ARCHS[m.arch]?.label || '—')}</b></span>${m.stage === 'post' ? `<span>后训练<b>${Math.max(0, (m.postDays || 0) - (m.relDays || 0))} 天</b></span>` : ''}</div>${action}</div>
    ${bg}</div>`;
}

// 常用入口：点开是选择面板或后台对应的页，不用翻菜单。
// 按对训练的重要程度分两级：二级是直接影响训练的操作（数据、算力、研究、送评、评测、模型库），带实时状态；
// 三级是经营与信息（产品、资本、对手、榜单、新闻、更多），只放一行小链接。
const QUICK = [['data', '数据集', 'data'], ['compute', '算力集群', 'chip'], ['tech', '技术研究', 'spark'], ['release', '送评', 'release'], ['eval', '基准评测', 'eval'], ['model', '模型库', 'layers'],
  ['service', '产品', 'users'], ['capital', '资本', 'trend'], ['rivals', '对手', 'sword'], ['boards', '榜单', 'eval'], ['news', '新闻', 'news'], ['more', '更多', 'menu']];
const TIER2 = new Set(['data', 'compute', 'tech', 'release', 'eval', 'model']);
function quickStatus(S, k) {
  if (k === 'data') { const n = S.orders.filter(o => o.kind === 'data').length; return n ? `${n} 笔在途` : '采购数据'; }
  if (k === 'compute') return `${count(E.gpuCount(S))} 卡`;
  if (k === 'tech') return `${S.research.length}/${E.researchSlots(S)} 槽`;
  if (k === 'model') return `${(S.models || []).length} 个`;
  return '';
}
// 送评：主线能送评、有能送评的小模型，或者上一代收尾能送评，就亮。
function quickNav(S) {
  const a = E.availableActions(S);
  const why = E.releaseBlock(S);
  const prev = E.prevModel(S);
  const prevOk = !!prev && prev.stage === 'post' && !E.submitBlock(S, prev, 'prev');
  const btn = ([k, label, ic]) => {
    const off = (k === 'release' && !a.release && !a.releaseSmall && !prevOk) || (k === 'eval' && !a.eval);
    const hint = k === 'release' && off ? why : k === 'eval' && off ? '还没有上线的模型' : '';
    const badge = k === 'release' && !off ? '<i class="dot"></i>' : '';
    const t2 = TIER2.has(k), sub = t2 ? (k === 'release' ? (off ? '暂不可送评' : '可送评') : k === 'eval' ? (off ? '无在线模型' : '跑基准') : quickStatus(S, k)) : '';
    return `<button class="quick-btn ${t2 ? 'quick-btn--t2' : 'quick-btn--t3'}${off ? ' is-off' : ''}" data-act="quick" data-id="${k}" title="${esc(hint || label)}" ${off ? 'disabled' : ''}>${icon(ic)}<span>${({data:'数据',compute:'算力',tech:'研究',eval:'跑分',model:'模型'})[k] || label}</span>${sub ? `<small>${esc(sub)}</small>` : ''}${badge}</button>`;
  };
  return `<nav class="quick" aria-label="训练相关操作">${QUICK.filter(([k]) => TIER2.has(k)).map(btn).join('')}</nav>
    <nav class="quick-links" aria-label="经营与信息"><button class="btn home-more" data-act="quick" data-id="more">${icon('menu')} 更多功能</button></nav>`;
}
function newsTicker(S) {
  const list = S.news.slice(0, 3);
  if (!list.length) return '';
  return `<button class="ticker" data-act="quick" data-id="news" aria-label="查看公司新闻">${list.map(n => `<span><em>${n.day ? fmtShortDay(n.day) : `${Number(n.date.slice(5))} 月`}</em>${esc(n.title)}</span>`).join('')}</button>`;
}

// 联机的聊天（M.7）：平时收起，来新消息时角标加一；展开以后在底部。
function mpChatDock() {
  const m = getMp();
  if (!m || !m.chatOpen) return '';
  return `<aside class="mp-dock"><header><b>聊天</b><button class="icon-btn" data-act="mp-chat-toggle" aria-label="收起">${icon('close')}</button></header>${chatHtml(m, { compact: true })}</aside>`;
}
function postOnlyRecovery(S) {
  return E.postOnlyBlockedTraining(S).map(b=>`<div class="post-only-recovery"><span>${esc(E.modelLabel(S.models.find(m=>m.id===b.modelId)))} · ${b.bench?'刷榜中':'已暂停'}</span><button class="btn" data-act="post-only-resume" data-id="${esc(b.modelId)}" data-job="${esc(b.jobId)}" data-model-token="${esc(b.modelToken||'')}">${b.bench?'停止刷榜，恢复训练':'恢复训练'}</button></div>`).join('');
}

export function renderHome(app) {
  const S = getState();
  const live = E.liveModel(S);
  const w = E.workingModel(S);
  const small = E.smallLive(S) || E.smallWorking(S);
  const sv = S.service.last || {};
  // 经营数字下面的小走势线：最近一年的月度数据。
  const trend = (k, invert = false) => { const v = S.history.slice(-12).map(x => x[k] || 0); return v.length > 1 ? sparkline(v, { w: 64, h: 16, invert }) : ''; };
  // 较前月的变化：收入、用户按比例，负载和 429 按百分点，口碑按分；越低越好的指标涨了标红。
  const delta = (k, mode = 'rel', invert = false) => {
    const h = S.history; if (h.length < 2) return '';
    const a = h.at(-2)[k] || 0, b = h.at(-1)[k] || 0, d = mode === 'rel' ? (a ? (b - a) / Math.abs(a) : 0) : b - a;
    if (Math.abs(d) < (mode === 'abs' ? 0.5 : 0.0005)) return '<em class="kpi-d is-flat">持平</em>';
    const txt = mode === 'rel' ? `${Math.abs(d * 100).toFixed(Math.abs(d) < 0.1 ? 1 : 0)}%` : mode === 'pt' ? `${Math.abs(d * 100).toFixed(1)}pt` : `${Math.abs(Math.round(d))}`;
    return `<em class="kpi-d ${(invert ? d < 0 : d > 0) ? 'is-up' : 'is-down'}">${d > 0 ? '▲' : '▼'} ${txt}</em>`;
  };
  const emotion = hasEmotion(S.persona.artId, ui.emotion) ? ui.emotion : 'neutral';
  const al0 = E.allocJobs(S);
  const roster = rosterOf(S), picked = homeModel(S, roster);
  const shown = picked?.m || w || live;
  const plate = personaPlate(S.persona, S.date);
  const smallSrc = small && S.persona.smallArtId ? art(S.persona.smallArtId, 'stage') : '';
  const report = ui.report && ui.report.until > Date.now() ? ui.report.html : '';
  const overviewOpen = !!app.querySelector?.('.home-overview')?.open;
  const adviceOptionsOpen = !!app.querySelector?.('.home-advice-options')?.open;
  const panelScroll = app.querySelector?.('.home .panel')?.scrollTop || 0;
  app.className = `app app--home${E.isPostOnly(S)?' app--post-only':''}`;
  renderWithImageReuse(app, `
  ${topBar(S)}
  ${inboxHtml(S)}
  ${E.isPostOnly(S)?`<section class="post-only-status"><p>${esc(postOnlyStatus(S).text)}</p>${E.pendingPostOnlySession(S)?'<button class="btn btn--primary" data-act="post-only-cards">继续选牌</button>':`<button class="btn btn--primary" data-act="speed" data-id="5">${running()?'加速准备':'推进时间'}</button>`}${postOnlyRecovery(S)}${S.flags.postOnly.lastIssue?`<details><summary>托管提醒</summary><p role="status">${esc(S.flags.postOnly.lastIssue)}</p></details>`:''}</section>`:''}
  <main class="home">
    <section class="stage" style="--bg:url('${BG.lab}')" aria-label="模型娘与当前能力">
      <div class="stage-chips">
        ${live ? `<span class="chip">在线：${esc(live.name)}</span>` : ''}
        ${small ? `<span class="chip chip--small">小模型：${esc(small.name ? `${small.name}${E.smallWorking(S) ? '（待发布）' : ''}` : small.draftName ? `${small.draftName}（待发布）` : '待发布')}</span>` : ''}
        ${S.service.routing !== 'full' ? `<span class="chip chip--warn">高峰分流：${S.service.routing.endsWith('secret') ? '未告知用户' : '已公开'}</span>` : ''}
        ${S.legal.cases.length ? `<span class="chip chip--warn">诉讼中 ${S.legal.cases.length} 起</span>` : ''}
      </div>
      ${newsTicker(S)}
      <button class="stage-figure" data-act="talk" aria-label="和${esc(plate.name)}说话">${stagePortrait(S.persona.artId, plate.name, emotion).replace('<img ', `<img data-image-identity="home:${esc(S.persona.artId)}" data-image-src="${esc(art(S.persona.artId, 'stage', emotion))}" data-image-alt="${esc(plate.name)}" `)}</button>
      ${smallSrc ? `<img class="stage-second" src="${smallSrc}" alt="" />` : ''}
      ${shown ? `<div class="stage-params" aria-label="模型能力">${dimRows(S, shown)}</div>` : ''}
      <div class="nameplate"><b>${esc(plate.name)}</b>${plate.label ? `<span>${esc(plate.label)}</span>` : ''}</div>
      <button class="bubble" data-act="talk" aria-label="听下一句"><span>${esc(homeLine(S))}</span>${icon('next')}</button>
      <div class="stage-fx" id="stage-fx" data-act="dismiss-report">${report}</div>
    </section>
    <section class="panel" aria-label="育成行动与经营概况">
      ${homeTrainingActions()}
      ${E.isPostOnly(S)?'':nextStep(S, adviceOptionsOpen)}
      ${quickNav(S)}
      <details class="home-overview"${overviewOpen ? ' open' : ''}><summary>模型与经营概况</summary>
      ${nowCard(S)}
      ${rosterCard(S, al0)}
      <div class="card ops-card" data-act="quick" data-id="finance" title="近一年走势，点开看财务">
        <div><span>上月收入</span><b>${numHtml(usd(sv.total || 0))}</b>${delta('revenue')}${trend('revenue')}</div>
        <div><span>${S.mod === 'llm' ? '月活' : '付费用户'}</span><b>${numHtml(count(sv.users || 0))}</b>${delta('users')}${trend('users')}</div>
        <div><span>负载</span><b class="${sv.util > 1 ? 'bad' : sv.util > 0.85 ? 'warn' : ''}">${numHtml(pct(Math.min(sv.util || 0, 9)))}</b>${delta('util', 'pt', true)}${trend('util', true)}</div>
        <div><span>429</span><b class="${sv.r429 > 0.04 ? 'bad' : ''}">${numHtml(pct(sv.r429 || 0, 1))}</b>${delta('r429', 'pt', true)}${trend('r429', true)}</div>
        <div><span>口碑</span><b>${numHtml(String(Math.round(S.rep)))}</b>${delta('rep', 'abs')}${trend('rep')}</div>
      </div>
      </details>
    </section>
  </main>
  ${mpChatDock()}`);
  const panelNode = app.querySelector?.('.home .panel');
  if (panelNode) panelNode.scrollTop = panelScroll;
}
