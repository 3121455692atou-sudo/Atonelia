// 主界面：舞台上的角色和台词、“下一步”按钮、进行中、模型卡、经营数字、常用入口。顶栏在 topbar.js。
import * as E from '../engine.js';
import { MODALITIES, ARCHS, GPUS, TECH_BY_ID, fmtDate, monthsBetween, personaPlate } from '../data/core.js';
import { BENCH_BY_ID } from '../data/benchmarks.js';
import { esc, usd, count, pct, params, art, icon, BG, MORALE, fmtScore, hasEmotion, dimLockText } from './fmt.js';
import { sparkline } from './charts.js';
import { daysBetween, inDays, fmtShortDay } from '../engine.js';
import { getState, getMp, ui, clock, save, render, toast, setSpeed } from './state.js';
import { topBar } from './topbar.js';
import { openOffice } from './office.js';
import { runQueue, finishGame, doDecision, onEnterGame } from './flow.js';
import { act } from './act.js';
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
  if (S.health < 45) lines.push(S.jobs?.repair ? '集群在检修，后训练先停一停，健康每天回升一点。' : '集群健康度有点低……再这样跑下去，训练随时会炸。');
  if (sv.r429 > 0.04) lines.push(`高峰期有 ${pct(sv.r429)} 的请求被 429 拦在门外，好多人在排队。`);
  if (goal && monthsBetween(S.date, goal.date) <= 2) lines.push(`「${goal.title}」${monthsBetween(S.date, goal.date) <= 0 ? '就在这个月' : `还有 ${monthsBetween(S.date, goal.date)} 个月`}：${E.goalNeed(goal.check)}。`);
  if (a.release) lines.push('这一版已经练了一阵子，随时可以送评。');
  for (const ev of (S.evals || []).slice(0, 1)) lines.push(`「${ev.plan?.name}」在做安全评测，还有 ${Math.max(0, daysBetween(S.day, ev.until))} 天评完发布。`);
  if (base) {
    const eta = E.jobEta(S, base.job, base);
    const p = Math.round(E.projectProgress(base.job.pj) * 100);
    const what = base.job.kind === 'distill' ? '小模型蒸馏' : '底座预训练';
    // 暂停的不参加分卡（why 是 paused），不是在排队。
    if (base.why === 'paused') lines.push(`${what}暂停中，进度 ${p}% 保留着。想接着练，就去「训练」里点“继续”。`);
    else lines.push(`${what}进度 ${p}%，${base.run && Number.isFinite(eta) ? `大概还要 ${Math.max(1, Math.round(eta))} 天` : '现在分不到训练卡，在排队等算力'}。`);
  }
  if (mainPost && mainPost.why === 'min') lines.push('现在分不到训练卡，后训练在排队等算力。');
  if (!E.liveModel(S) && !E.hasBaseJob(S) && !w) lines.push('我们还没有模型……先去「训练」里立项一个底座吧。');
  if (w && w.stage === 'post' && !mainPost && !S.jobs?.repair) lines.push('在练的模型现在没人练，团队在专心做研究。想接着练，就去「训练」里挂一项后训练。');
  const news = S.news[0];
  if (news && news.date === S.date && news.type === 'release') lines.push(`${news.title}。我们也得加把劲了。`);
  lines.push(clock.speed ? '时间在走……有事我会叫你。' : '暂停中。想好了就点上面的 ▶，让时间走起来。');
  return lines[ui.lineIdx % lines.length];
}

function dimRows(S, model) {
  if (!model) return `<p class="muted">${E.hasBaseJob(S, 'main') ? '底座正在预训练，练完会出现在这里。' : '先在「训练」里立项预训练一个底座，练完会出现在这里。'}</p>`;
  const caps = E.computeCaps(S, model);
  return `<div class="dims">${MODALITIES[S.mod].dims.map(d => {
    const locked = !E.dimUnlocked(S, S.mod, d.key);
    const v = model.dims[d.key] || 0;
    const est = locked ? '' : estimateFor(S, d.key, model);
    return `<div class="dim ${locked ? 'locked' : ''}" data-dim="${d.key}"><span class="dim-l">${esc(d.label)}</span><span class="dim-bar">${locked ? '' : `<i style="width:${v}%"></i><em style="left:${caps[d.key]}%"></em>`}</span><b>${locked ? '—' : v.toFixed(1)}</b><small>${esc(locked ? dimLockText(d) : est)}</small></div>`;
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
const currentAdvice = S => E.advise(S).filter(a => !ui.skip.has(`${S.date}|${a.id}`) && !(getMp() && a.op?.type === 'queue'));
// 时间在不在走：联机看服务器的时钟，单人看本地速度。
const running = () => { const m = getMp(); return m ? !m.clock?.paused : !!clock.speed; };
function nextStep(S) {
  const list = currentAdvice(S);
  if (!list.length) return '';
  const [a, ...rest] = list;
  const keep = a.kind === 'jobs' && a.same;
  const go = running();
  const label = keep ? (go ? `团队正在：${teamDoing(S)}` : '让时间走起来') : a.label;
  const tag = keep ? (go ? '一切按计划' : `团队在做：${teamDoing(S)}`) : `下一步 · ${ADVICE_TAG[a.kind] || '马上做'}`;
  return `<div class="next-step">
    <button class="next-btn next-btn--${keep ? 'keep' : a.kind === 'jobs' ? 'focus' : a.kind}" data-act="advice" data-id="${esc(a.id)}"><span class="next-tag">${esc(tag)}</span><b>${esc(label)}</b><small>${esc(a.detail)}</small>${icon(keep && !go ? 'play' : 'next')}</button>
    <div class="next-foot">${a.kind === 'free' || a.kind === 'page' ? `<button class="next-skip" data-act="advice-skip" data-id="${esc(a.id)}">这个月先不做这条</button>` : '<span></span>'}
      ${rest.length ? `<details class="next-more" ${ui.moreOpen ? 'open' : ''}><summary data-act="more-toggle">其他建议 ${rest.length}</summary>${rest.map(x => `<button class="next-row" data-act="advice" data-id="${esc(x.id)}"><span class="next-tag">${ADVICE_TAG[x.kind] || '马上做'}</span><b>${esc(x.label)}</b><small>${esc(x.detail)}</small></button>`).join('')}</details>` : ''}</div>
  </div>`;
}
export async function followAdvice(id) {
  const S = getState();
  if (ui.busy) return;
  const a = E.advise(S).find(x => x.id === id);
  if (!a) return render();
  const op = a.op;
  if (op.type === 'queue') { await runQueue(); return S.status === 'ended' ? finishGame() : render(); }
  if (a.kind === 'jobs' && a.same) { if (!getMp() && !clock.speed) setSpeed(clock.last); render(); return; }
  // 立项、蒸馏：打开训练页，对应的新作业表单直接展开，带着推荐配置，玩家确认后再开。
  if (op.type === 'project') return openOffice('train', { proj: { ...op.cfg } });
  if (op.type === 'distill') return openOffice('train', { distill: { ...op.cfg } });
  if (op.type === 'page') return openOffice(op.page === 'model' ? 'train' : op.page);
  if (op.type === 'fund' || op.type === 'ipo') return openOffice('capital');
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
  const used = al.items.reduce((x, i) => x + (i.run ? i.cards : 0), 0);
  return { rows, used, T: al.T };
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
  out.push(`<div class="now-row now-sum"><small>${rows.length ? '' : '没有作业 · '}${more}${T > 0 ? `训练卡 ${count(used)}/${count(T)} 在用` : '等待算力：现在没有训练卡'}</small><button class="btn btn--sm" data-act="open-train">训练 ›</button></div>`);
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
// 常用入口：点开是选择面板或后台对应的页，不用翻菜单。
const QUICK = [['data', '订数据', 'data'], ['release', '送评', 'release'], ['eval', '跑分', 'eval'], ['compute', '算力', 'chip'], ['service', '产品', 'users'], ['tech', '研究', 'spark'],
  ['model', '模型', 'train'], ['capital', '资本', 'trend'], ['rivals', '对手', 'flag'], ['boards', '榜单', 'eval'], ['news', '新闻', 'research'], ['more', '更多', 'menu']];
// 送评：主线能送评、有能送评的小模型，或者上一代收尾能送评，就亮。
function quickNav(S) {
  const a = E.availableActions(S);
  const why = E.releaseBlock(S);
  const prev = E.prevModel(S);
  const prevOk = !!prev && prev.stage === 'post' && !E.submitBlock(S, prev, 'prev');
  return `<nav class="quick" aria-label="常用">${QUICK.map(([k, label, ic]) => {
    const off = (k === 'release' && !a.release && !a.releaseSmall && !prevOk) || (k === 'eval' && !a.eval);
    const hint = k === 'release' && off ? why : k === 'eval' && off ? '还没有上线的模型' : '';
    const badge = k === 'release' && !off ? '<i class="dot"></i>' : '';
    return `<button class="quick-btn ${off ? 'is-off' : ''}" data-act="quick" data-id="${k}" title="${esc(hint || label)}" ${off ? 'disabled' : ''}>${icon(ic)}<span>${label}</span>${badge}</button>`;
  }).join('')}</nav>`;
}
function newsTicker(S) {
  const list = S.news.slice(0, 3);
  if (!list.length) return '';
  return `<div class="ticker" data-act="quick" data-id="news">${list.map(n => `<span><em>${n.day ? fmtShortDay(n.day) : `${Number(n.date.slice(5))} 月`}</em>${esc(n.title)}</span>`).join('')}</div>`;
}

// 联机的聊天（M.7）：平时收起，来新消息时角标加一；展开以后在底部。
function mpChatDock() {
  const m = getMp();
  if (!m || !m.chatOpen) return '';
  return `<aside class="mp-dock"><header><b>聊天</b><button class="icon-btn" data-act="mp-chat-toggle" aria-label="收起">${icon('close')}</button></header>${chatHtml(m, { compact: true })}</aside>`;
}
export function renderHome(app) {
  const S = getState();
  const live = E.liveModel(S);
  const w = E.workingModel(S);
  const small = E.smallLive(S) || E.smallWorking(S);
  const sv = S.service.last || {};
  // 经营数字下面的小走势线：最近一年的月度数据。
  const trend = (k, invert = false) => { const v = S.history.slice(-12).map(x => x[k] || 0); return v.length > 1 ? sparkline(v, { w: 64, h: 16, invert }) : ''; };
  const emotion = hasEmotion(S.persona.artId, ui.emotion) ? ui.emotion : 'neutral';
  const shown = w || live;
  const plate = personaPlate(S.persona, S.date);
  const report = ui.report && ui.report.until > Date.now() ? ui.report.html : '';
  app.className = 'app app--home';
  app.innerHTML = `
  ${topBar(S)}
  ${inboxHtml(S)}
  <main class="home">
    <section class="stage" style="--bg:url('${BG.lab}')">
      <div class="stage-chips">
        ${live ? `<span class="chip">在线：${esc(live.name)}</span>` : ''}
        ${small ? `<span class="chip chip--small">小模型：${esc(small.name ? `${small.name}${E.smallWorking(S) ? '（待发布）' : ''}` : small.draftName ? `${small.draftName}（待发布）` : '待发布')}</span>` : ''}
        ${S.service.routing !== 'full' ? `<span class="chip chip--warn">高峰分流：${S.service.routing.endsWith('secret') ? '未告知用户' : '已公开'}</span>` : ''}
        ${S.legal.cases.length ? `<span class="chip chip--warn">诉讼中 ${S.legal.cases.length} 起</span>` : ''}
      </div>
      ${newsTicker(S)}
      <button class="stage-figure" data-act="talk" aria-label="说话"><img src="${art(S.persona.artId, 'stage', emotion)}" alt="${esc(plate.name)}" /></button>
      ${S.persona.smallArtId && small ? `<img class="stage-second" src="${art(S.persona.smallArtId, 'stage')}" alt="" />` : ''}
      <div class="nameplate"><b>${esc(plate.name)}</b>${plate.label ? `<span>${esc(plate.label)}</span>` : ''}</div>
      <div class="bubble" data-act="talk"><p>${esc(homeLine(S))}</p></div>
      <div class="stage-fx" id="stage-fx" data-act="dismiss-report">${report}</div>
    </section>
    <section class="panel">
      ${nextStep(S)}
      ${nowCard(S)}
      <div class="card model-card">
        <div class="card-head"><b>${shown ? esc(shown.name) : '还没有模型'}</b>${shown ? `<small>${params(shown.total)}${shown.active < shown.total ? ` / 激活 ${params(shown.active)}` : ''} · ${esc(ARCHS[shown.arch]?.label || '')}${w && w.stage === 'post' ? ` · 这一版练了 ${Math.max(0, (w.postDays || 0) - (w.relDays || 0))} 天` : ''}</small>` : ''}</div>
        ${dimRows(S, shown)}
      </div>
      <div class="card ops-card" data-act="quick" data-id="finance" title="近一年走势，点开看财务">
        <div><span>上月收入</span><b>${usd(sv.total || 0)}</b>${trend('revenue')}</div>
        <div><span>${S.mod === 'llm' ? '月活' : '付费用户'}</span><b>${count(sv.users || 0)}</b>${trend('users')}</div>
        <div><span>负载</span><b class="${sv.util > 1 ? 'bad' : sv.util > 0.85 ? 'warn' : ''}">${pct(Math.min(sv.util || 0, 9))}</b>${trend('util', true)}</div>
        <div><span>429</span><b class="${sv.r429 > 0.04 ? 'bad' : ''}">${pct(sv.r429 || 0, 1)}</b>${trend('r429', true)}</div>
        <div><span>口碑</span><b>${Math.round(S.rep)}</b>${trend('rep')}</div>
      </div>
      ${quickNav(S)}
    </section>
  </main>
  ${mpChatDock()}`;
}
