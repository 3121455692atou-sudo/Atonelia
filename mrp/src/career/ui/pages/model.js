// 后台 · 模型（规格 T10.4）：模型列表，每个模型带工序标签——在线旗舰、训练中（在练，后训练中 / 排队 / 暂停）、候选·评测中、上一代收尾、
// 在线小模型、待发布小模型、评测中小模型，下面是全部模型（在线、已发布、已归档）。立项和蒸馏搬去了「训练」页。
// P3.U4 在卡片上加角标和徽章。
import * as E from '../../engine.js';
import { MODALITIES, ARCHS, SCALES, fmtDate } from '../../data/core.js';
import { esc, usd, params, dimLockText } from '../fmt.js';
import { radar } from '../charts.js';

// ---------- SOTA 角标和徽章（规格 D10、D11）：判定只读引擎，界面不自己算 ----------
const BADGE_NAME = { open_top: '开源最强', community: '社区之选', works: '能干活' };
const ym = d => String(d || '').slice(0, 7);
const isTainted = m => !!m?.tainted && !m?.untainted;
function badgeList(S, m) {
  if (!m || isTainted(m)) return [];
  const list = Array.isArray(m.badges) ? m.badges : (m.stage === 'released' ? E.badgesFor(S, m) : []);
  return list.filter(b => BADGE_NAME[b]);
}
function badgesHtml(S, m) {
  const list = badgeList(S, m);
  return list.length ? `<span class="model-badges">${list.map(b => `<span class="model-badge model-badge--${b}">${BADGE_NAME[b]}</span>`).join('')}</span>` : '';
}
// 现在持标：金色；已经交出去：灰色“曾为 SOTA”。场地凑满、还没挡住挑战的那一枚，悬停说明“还没经过挑战”。
function sotaHtml(S, m) {
  const t = m?.sota;
  if (!t?.from) return '';
  const h = S.sota?.holder;
  const past = (S.sota?.log || []).find(x => x.id === m.id && x.from === t.from);
  const counted = t.until ? !!past?.counted : (h?.id === m.id ? !!h.counted : true);
  if (!t.until) return `<span class="sota-badge sota-badge--now" title="${counted ? '世界第一' : '还没经过挑战'}">SOTA</span>`;
  return `<span class="sota-badge sota-badge--past" title="${counted ? '曾经是世界第一' : '还没经过挑战'}">曾为 SOTA（${ym(t.from)} 至 ${ym(t.until)}）</span>`;
}

// 权重那一行：发布出去的快照照实写；没发布的还没定开不开源，按现在发布会是什么角色写路线的规则（和发布面板的开源一行同一口径，B2、B7 第 5 条）。
function openText(S, m) {
  if (m.stage === 'released') return m.open ? '开源' : '闭源';
  const rule = E.releaseOpenRule(S, E.relRole({ line: E.releaseLine(S, m) }));
  return rule.open === 'choice' ? `发布时自己选（路线默认${rule.default ? '开源' : '闭源'}）` : `发布时按路线：${rule.open ? '开源' : '闭源'}`;
}
// 在练模型的工序：后训练中（排队、等待算力、暂停、检修时写明）、没挂后训练；有候选在评测时加一句。
function workingStage(S, w) {
  const job = E.postJobFor(S, w);
  const it = job ? E.allocJobs(S).items.find(i => i.job === job) : null;
  // 一张训练卡都没有（卡全租出去了）时写“等待算力”，和训练页、主界面同一个说法。
  const queued = it?.why === 'min' ? (E.gpuAllocation(S).trainGpus > 0 ? '后训练排队' : '后训练等待算力') : '';
  const post = !job ? '没挂后训练' : job.paused ? '后训练暂停' : it?.why === 'repair' ? '检修中' : queued || '后训练中';
  const ev = (S.evals || []).find(e => e.modelId === w.id);
  return ev ? `${post} · 候选评测中` : post;
}
// 评测档的叫法：开局继承来的、旧存档迁移来的版本（legacy）没有走过送评，不写“旧档”这种玩家看不懂的词（表里写“—”，卡片上开局前的写“开局前已发布”）。
const tierText = m => (m.evalTier && m.evalTier !== 'legacy' ? E.TIER_LABEL[m.evalTier] || m.evalTier : null);
// 没发布的模型怎么称呼：评测中的小模型用送评时定下的名字（和训练页的评测行、小模型行同一个说法），待发布的小模型写代号或“新的小模型”。
function nameOf(S, m) {
  if (m.stage === 'released') return m.name;
  const ev = m.evalId ? (S.evals || []).find(e => e.id === m.evalId) : null;
  if (ev?.plan?.name) return ev.plan.name;
  if (m.evalId || m.id === S.smallWorking || (S.smallShelf || []).includes(m.id)) return m.name || m.draftName || '新的小模型';
  return E.modelLabel(m);
}
// 全部模型那张表里的状态。
function statusOf(S, m) {
  if (m.id === S.live) return '在线旗舰';
  if (m.id === S.smallLive) return '在线小模型';
  if ((S.deploy || []).some(d => d.id === m.id)) return '灰度上线中';
  if (m.stage === 'released') return m.line === 'side' ? '已发布 · 副线' : '已发布';
  if (m.id === S.working) return '在练';
  if (S.prevWorking?.id === m.id) return '上一代收尾';
  if (m.evalId) return '评测中小模型';
  if (m.id === S.smallWorking || (S.smallShelf || []).includes(m.id)) return '待发布小模型';
  return '已归档';
}
export function render(S, st) {
  const live = E.liveModel(S), w = E.workingModel(S), sl = E.smallLive(S);
  const prev = E.prevModel(S);
  const pending = [S.smallWorking, ...(S.smallShelf || [])].map(id => (S.models || []).find(m => m.id === id)).filter(Boolean);
  // 开没开放和模拟同一口径（E.dimUnlocked）：Agent 要先学会「函数调用」。没开放的不进雷达，在数字那一行写什么时候出现。
  const dims = MODALITIES[S.mod].dims.filter(d => E.dimUnlocked(S, S.mod, d.key));
  const lockedDims = MODALITIES[S.mod].dims.filter(d => !E.dimUnlocked(S, S.mod, d.key));
  // 标题：标签已经写了状态（训练中、待发布），标题不再带“（训练中）”。在练旗舰写代号或“第 N 代底座”；
  // 待发布的小模型已经蒸馏完、只等发布，写代号或“新的小模型”（和主界面的小模型芯片同一个说法）；评测中的写送评时定下的名字（nameOf）。stage 是工序标签（后训练中、评测中……）。
  const card = (m, tag, title = E.displayName(m), stage = '') => {
    if (!m) return '';
    const caps = E.computeCaps(S, m);
    return `<div class="card mcard"><div class="card-head"><span class="ev-tag">${tag}</span><b>${esc(title)}</b>${stage ? `<small class="stage-pill">${esc(stage)}</small>` : ''}${sotaHtml(S, m)}${badgesHtml(S, m)}</div>
      <div class="mcard-body">${radar(dims.map(d => ({ key: d.key, label: d.label, value: m.dims[d.key] || 0 })), { caps })}
      <ul class="kv">
        <li><span>结构</span><b>${S.mod === 'llm' ? `${params(m.total)}${m.active < m.total ? ` / 激活 ${params(m.active)}` : ''}` : esc(SCALES[S.mod].find(x => x.id === m.scaleId)?.label || '')}</b></li>
        <li><span>架构</span><b>${esc(ARCHS[m.arch]?.label || '扩散 / 自回归')}</b></li>
        <li><span>量级</span><b>${esc({ small: '轻量', mid: '中型', large: '大型', frontier: '前沿' }[E.clsOf(m)])}</b></li>
        ${S.mod === 'llm' ? `<li><span>生成速度</span><b>${E.modelSpeed(S, m)} token/s</b></li><li><span>推理成本</span><b>${usd(E.costPerMillion(S, m))} / 百万 token</b></li>` : ''}
        <li><span>权重</span><b>${esc(openText(S, m))}</b></li>
        ${m.distillation ? `<li><span>蒸馏自</span><b>${esc(m.distillation.teacher.name)}${m.teacher === 'self' ? '（自家）' : ''} · ${m.distillation.tokens}T token</b></li>` : ''}
        ${m.released ? `<li><span>发布</span><b>${fmtDate(m.released)}${tierText(m) ? ` · 评测 ${esc(tierText(m))}` : m.evalTier === 'legacy' && m.hist ? ' · 开局前已发布' : ''}</b></li>` : ''}
      </ul></div>
      <div class="dims-mini">${dims.map(d => `<span>${esc(d.label)} <b>${(m.dims[d.key] || 0).toFixed(1)}</b><small>/ ${caps[d.key].toFixed(0)}</small></span>`).join('')}${lockedDims.map(d => `<span class="muted">${esc(d.label)} <small>${esc(dimLockText(d))}</small></span>`).join('')}</div></div>`;
  };
  const evalsMain = (S.evals || []).filter(e => e.line !== 'small' && e.cand);
  const cards = [
    card(live, '在线旗舰'),
    w && w !== live ? card(w, '训练中', E.modelLabel(w), w.stage === 'post' ? workingStage(S, w) : '') : '',
    ...evalsMain.map(e => card(e.cand, '候选·评测中', e.plan?.name || e.cand.name || '候选', `${E.TIER_LABEL[e.tier]} · 还剩 ${Math.max(0, E.daysBetween(S.day, e.until))} 天`)),
    prev && prev !== w ? card(prev, '上一代收尾', E.modelLabel(prev), `还有 ${Math.max(0, E.daysBetween(S.day, S.prevWorking.until))} 天归档`) : '',
    card(sl, '在线小模型'),
    ...pending.map(m => card(m, m.evalId ? '评测中小模型' : '待发布小模型', nameOf(S, m), m.evalId ? '已冻结' : E.postJobFor(S, m) ? '后训练中' : '')),
  ].join('');
  // 全部模型：最近的在前（发布了的按发布日，没发布的按编号里的开练月份）。
  const when = m => String(m.releasedDay || m.released || m.id?.match(/_(\d{4}-\d{2})/)?.[1] || '');
  const all = [...(S.models || [])].sort((a, b) => when(b).localeCompare(when(a))).slice(0, 40);
  const rows = all.map(m => `<tr><td>${esc(nameOf(S, m))}</td><td>${esc(statusOf(S, m))}</td><td>${m.released ? fmtDate(m.released) : '—'}</td><td>${m.stage === 'released' && tierText(m) ? esc(tierText(m)) : '—'}</td><td>${E.qOf(S.mod, m.dims).toFixed(1)}</td><td>${sotaHtml(S, m)}${badgesHtml(S, m)}</td></tr>`).join('');
  return `<h2>模型</h2>
    <p class="muted">虚线是这一代底座做后训练能达到的上限。想突破上限，就要换更大的底座、更好的数据或新技术。立项底座、蒸馏小模型、后训练和送评都在「训练」页。</p>
    <div class="grid2">${cards}</div>
    <div class="card wide"><div class="card-head"><b>全部模型</b><button class="link-btn" data-goto="train">训练、送评去「训练」页 ›</button></div>
      <table class="tbl"><thead><tr><th>模型</th><th>状态</th><th>发布</th><th>评测</th><th>综合</th><th>标记</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="muted">还没有模型。</td></tr>'}</tbody></table></div>`;
}

export function click(S, t, { st, draw }) {
  const go = t.closest('[data-goto]');
  if (go) { st.page = go.dataset.goto; draw(); }
}
