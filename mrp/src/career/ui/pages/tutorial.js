import { createTutorial, tutorialView, actTutorial, closeTutorial } from '../../engine.js';
import { POST_CARD_ART } from '../../data/post_card_art.js';
import { esc } from '../fmt.js';

let active = null;
const pct = n => `${(n * 100).toFixed(1)}%`;
const button = (action, label, revision, more = '') => `<button class="btn" data-tutorial-action="${action}" data-revision="${revision}" ${more}>${label}</button>`;
const LESSON = {
  prepare: ['01 / 准备牌', '选一张牌，再点「打出这张牌」。', '准备牌用于积累增益，为后续打出训练牌做准备。'],
  stack: ['02 / 叠加增益', '再选一张牌，然后确认打出。', '继续打出准备牌可进一步叠加聚焦或积累层数。'],
  train: ['03 / 训练牌', '选一张训练牌，确认打出。', '训练牌会消耗前序积累的增益，直接获得大量得分。'],
  practice: ['04 / 自由出牌', '根据剩余预算打出卡牌。', '打完所有 6 个回合后即可结算出方案兑现率。'],
};
function feedback(view) {
  const f = view.feedback;
  if (!f) return '';
  if (f.message) return `<section class="tutorial-feedback" role="status" data-tutorial-feedback>${esc(f.message)}</section>`;
  const names = { budget: '预算', focus: '聚焦', flow: '积累', shield: '稳定', boost: '校准' };
  return `<section class="tutorial-feedback" role="status" data-tutorial-feedback>
    <strong>已打出：${esc(f.event.name)}</strong><details><summary>查看本回合变化</summary><p>实付 ${f.event.paid} · 即时得分 ${f.event.instant} · 积累得分 ${f.event.tick} · 本回合总分 ${f.event.instant + f.event.tick}</p>
    <p>${Object.entries(names).map(([k, label]) => `${label} ${f.before[k]} → ${f.after[k]}`).join('　')}</p>
    <small>上方为结算后的实际数值（已计入衰减）。</small></details></section>`;
}
function meters(view) {
  const r = view.run;
  return `<section class="tutorial-meters" aria-label="当前演练资源">
    ${[['预算', r.budget, '/ 8'], ['聚焦', r.focus, '/ 4'], ['积累', r.flow, '/ 8'], ['稳定', r.shield, '/ 4'], ['校准', r.boost, '/ 2'], ['演练分', r.score, '']].map(([l, n, cap]) => `<div><span>${l}</span><strong>${n} <small>${cap}</small></strong></div>`).join('')}
    </section>`;
}
function cardArt(id) { return POST_CARD_ART[id] ? `<img src="${esc(POST_CARD_ART[id])}" alt="" loading="lazy" decoding="async">` : '<span class="tutorial-basic-icon" aria-hidden="true">✦</span>'; }
function basic(view, selected) {
  const rev = view.revision;
  if (view.status === 'intro') return `<section class="tutorial-intro"><span class="tutorial-kicker">BASIC / 六手短游戏</span><h2 tabindex="-1" data-tutorial-heading>体验后训练演练</h2>
    <p>只练一件事：选一张牌，再点确认。重复六手就完成，没有分数要求。</p>
    ${button('start', '开始六手演练', rev)}
    <p class="tutorial-note" data-tutorial-isolation>独立练习，不会覆盖正式存档；退出即丢弃练习进度。</p>
    <details class="tutorial-rules" data-tutorial-intro-details><summary>查看教学牌组与规则（可选）</summary>
    <p>后训练演练用于验证模型调优策略。打出 6 回合卡牌后将生成执行方案，兑现率越高，模型调优提升越快。</p>
    <div class="tutorial-deck">${view.deck.map(c => `<article>${cardArt(c.id)}<div><strong>${esc(c.name)}</strong><small>${c.kind === 'prepare' ? '准备' : '训练'} · 标价 ${c.cost}</small></div></article>`).join('')}</div>
    <p>牌组和预算已为您配置好，无需额外前置。打完即可完成教程。</p></details></section>`;
  if (view.status === 'complete') return `<section class="tutorial-complete"><span class="tutorial-kicker">BASIC / 已完成</span><h2 tabindex="-1" data-tutorial-heading>六手演练已完成</h2>
    <p>演练已顺利结算，总得分：${view.result.score} 分。</p>${meters(view)}${feedback(view)}
    <section class="tutorial-receipt" data-tutorial-settlement><h3>方案结算预览</h3>
      <p>准备效率 ${pct(view.result.deckEfficiency)} × 执行率 ${pct(view.result.executionRate)} = <strong>${pct(view.result.rate)} 方案兑现率</strong></p>
      <p>在正式游戏中，此方案将在下一个训练周期生效，加速模型对齐与收敛。</p>
    </section><p class="tutorial-note">教程已结束，点击下方按钮开始正式游戏。</p>
    ${button('complete', '完成，进入正式新局', rev, 'data-tutorial-complete')}</section>`;
  const lesson = LESSON[view.stage], chosen = view.cards.find(c => c.id === selected), suggested = view.cards.find(c => c.recommended) || view.cards.find(c => c.allowed);
  return `<div class="tutorial-lesson"><span class="tutorial-kicker">${lesson[0]} · 第 ${view.run.turn} / 6 手 · 还可出 ${view.run.remaining} 手</span>
    <h2 tabindex="-1" data-tutorial-heading>${lesson[1]}</h2><p>${lesson[2]}</p>${feedback(view)}
    <p class="tutorial-next" data-tutorial-next>下一步：${chosen ? `点下方「打出这张牌」${chosen.allowed ? `，确认后进入${view.run.remaining === 1 ? '结算' : '下一手'}。` : '前，请改选一张本步可用的牌。'}` : `先选一张牌，例如「${esc((view.cards.find(c => c.recommended) || view.cards.find(c => c.allowed))?.name || '免费牌')}」，随后会显示确认按钮。`}</p>
    <section class="tutorial-preview" data-tutorial-preview aria-live="polite">${chosen ? `<h3>已选：${esc(chosen.name)}</h3>
      <p>${chosen.preview.affordable ? `消耗 ${chosen.preview.paid} 预算（当前剩余 ${view.run.budget}）。` : '预算不足，可改选免费牌。'}</p>
      ${chosen.reason ? `<p>${esc(chosen.reason)}</p>` : ''}${button('card', '打出这张牌', rev, `data-card-id="${esc(chosen.id)}" ${chosen.allowed ? '' : 'disabled'}`)}
      <details class="tutorial-rules"><summary>查看得分预览</summary><p>预算 ${view.run.budget} → ${view.run.budget - chosen.preview.paid}；${chosen.preview.affordable ? `即时得分 ${chosen.preview.instant}，积累得分 ${chosen.preview.tick}，本回合总分 ${chosen.preview.total}。` : '无法支付。'}</p>
      ${chosen.preview.projected ? `<p>本手结算后：聚焦 ${chosen.preview.projected.focus} · 积累 ${chosen.preview.projected.flow} · 稳定 ${chosen.preview.projected.shield} · 校准 ${chosen.preview.projected.boost}</p>` : ''}</details>` : '<p>先选一张牌，再确认打出。</p>'}</section>
    <div class="tutorial-hand" aria-label="当前真实手牌">${view.cards.map(c => `<button class="tutorial-card ${selected === c.id ? 'is-selected' : c.id === suggested?.id ? 'is-suggested' : ''}" data-tutorial-action="select-card" data-card-id="${esc(c.id)}" data-revision="${rev}" aria-pressed="${selected === c.id}">
      ${cardArt(c.id)}<span class="tutorial-card-copy"><strong>${esc(c.name)}${c.id === suggested?.id ? ' · 推荐出牌' : ''}</strong><span>${c.kind === 'prepare' ? '准备牌' : '训练牌'} · 标价 ${c.cost} / 实付 ${c.preview.paid}</span><small>${esc(c.desc)}</small>${c.reason ? `<small class="tutorial-reason">${esc(c.reason)}</small>` : ''}</span>
      <span class="tutorial-card-label">${selected === c.id ? '已选中，可确认打出' : '点击查看'}</span></button>`).join('')}</div>
    <details class="tutorial-rules"><summary>查看全部资源数值</summary>${meters(view)}</details>
    <details class="tutorial-rules"><summary>卡牌资源机制说明</summary><p>聚焦：增加训练牌得分倍率（上限 4）。积累：每回合获得得分（每层 3 分）并衰减 1 层（上限 8）。稳定：优先抵扣出牌预算（上限 4）。校准：本回合训练得分翻倍，每回合衰减 1 点（上限 2）。</p></details></div>`;
}
const CHAPTER_HELP = {
  research: ['研究团队与可选技术已就绪。', '研究将加入进行中列表，按日推进进度。'],
  strategy: ['公司策略模块已就绪。', '策略将按日推进，完成后获得长期增益。'],
  data: ['语料库已就绪。', '已生成数据采购订单，交付后入库。'],
  compute: ['算力集群已就绪。', '已调整推理与训练的算力配比。'],
  project: ['底座训练参数与算力已就绪。', '训练作业已创建并开始计算。'],
  evaluation: ['待评测模型已就绪。', '已提交评测榜单，等待跑分结果。'],
  service: ['API 服务已就绪。', '已更新 API 调用定价档位。'],
  finance: ['投资意向已就绪。', '已提交融资意向，等待交割。'],
  automation: ['公司管理模块已就绪。', '已开启日常事务自动托管。'],
};
function operationButton(o, rev) {
  return `<button data-tutorial-action="operate" data-option-id="${esc(o.id)}" data-revision="${rev}" ${o.disabled ? 'disabled' : ''}><strong>${esc(o.label)}</strong><span>${esc(o.detail)}</span>${o.reason ? `<small>${esc(o.reason)}</small>` : ''}<b>执行这项操作 →</b></button>`;
}
function advanced(view) {
  const rev = view.revision;
  if (view.status === 'chapters') return `<section><span class="tutorial-kicker">ADVANCED / 进阶章节</span><h2 tabindex="-1" data-tutorial-heading>选择要了解的经营模块</h2>
    <p>每个章节对应一个核心模块的实际操作，可自由选择体验，随时返回。</p>
    <div class="tutorial-chapters">${view.chapters.map(c => `<button data-tutorial-action="chapter" data-chapter-id="${c.id}" data-revision="${rev}"><strong>${esc(c.title)}${view.completed.includes(c.id) ? ' · 已完成' : ''}</strong><small>${esc(c.route)}</small><span>${esc(c.text)}</span></button>`).join('')}</div></section>`;
  const c = view.chapters.find(c => c.id === view.chapter), primary = view.options.find(o => !o.disabled), others = view.options.filter(o => o !== primary);
  return `<section><span class="tutorial-kicker">ADVANCED / ${esc(c.route)}</span><h2 tabindex="-1" data-tutorial-heading>${esc(c.title)}${view.status === 'chapterDone' ? ' · 已完成' : ` · 操作 ${view.chapterStage + 1}`}</h2>
    <p class="tutorial-note">${esc(CHAPTER_HELP[c.id][0])}不用先做其他准备。此处为独立模拟环境。</p>
    ${primary ? `<p class="tutorial-next" data-tutorial-next>${view.status === 'chapterDone' ? '本章已完成。如果需要，也可以点击' : '下一步：点'}「${esc(primary.label)}」。${view.chapterStage === 0 ? esc(CHAPTER_HELP[c.id][1]) : esc(primary.detail)}</p>` : ''}
    ${feedback(view)}<details class="tutorial-rules"><summary>查看当前状态与说明</summary><p>${esc(c.text)}</p><ul class="tutorial-summary" data-tutorial-sandbox-summary>${view.summary.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>
    ${view.status === 'chapterDone' ? `<p>本章核心操作已完成。</p><div class="tutorial-actions">${button('chapters', '返回章节列表', rev)}${button('chapter', '重新体验', rev, `data-chapter-id="${c.id}"`)}</div>${primary ? `<details class="tutorial-rules"><summary>再练一个操作（可选，不影响完成）</summary><div class="tutorial-options tutorial-primary">${operationButton(primary, rev)}</div></details>` : ''}`
      : `<div class="tutorial-options tutorial-primary">${primary ? operationButton(primary, rev) : ''}</div>${others.length ? `<details class="tutorial-rules"><summary>其他可选操作</summary><div class="tutorial-options">${others.map(o => operationButton(o, rev)).join('')}</div></details>` : ''}${button('chapters', '返回章节列表', rev)}`}</section>`;
}
export function renderTutorial(view, selected = null, error = '') {
  return `<div class="tutorial-shell" data-tutorial-kind="${view.kind}" data-tutorial-step="${view.kind === 'basic' ? view.stage : `${view.chapter || 'chapters'}-${view.chapterStage}`}">
    <header class="tutorial-header"><div><strong>独立教程</strong><small>不会覆盖正式存档</small></div><nav aria-label="教程操作">${button('restart', '重玩教程', view.revision)}${button('exit', '跳过 / 退出教程', view.revision)}</nav></header>
    <main class="tutorial-content">${error ? `<p class="tutorial-error" role="alert">${esc(error)}</p>` : ''}${view.kind === 'basic' ? basic(view, selected) : advanced(view)}</main>
    <footer class="tutorial-footer">随时点上方「跳过 / 退出教程」返回；也支持 Esc。刷新后从头开始。</footer></div>`;
}
// Native modal containment plus explicit keyboard fallback. No game clock,
// promises, card auto-player, storage writes, or delayed commands are installed.
export function startTutorial(kind = 'basic', { onComplete = () => {}, onExit = () => {} } = {}) {
  active?.dispose(false);
  const state = createTutorial(kind), doc = document, previous = doc.activeElement;
  const dialog = doc.createElement('dialog');
  dialog.className = 'tutorial-game'; dialog.setAttribute('aria-label', kind === 'basic' ? '基础教程短游戏' : '进阶教程章节');
  dialog.setAttribute('aria-modal', 'true');
  let selected = null, disposed = false;
  const render = (error = '', moveFocus = true) => {
    dialog.innerHTML = renderTutorial(tutorialView(state), selected, error);
    if (moveFocus) dialog.querySelector('[data-tutorial-heading]')?.focus();
  };
  function dispose(notify = true, completed = false) {
    if (disposed) return;
    disposed = true; closeTutorial(state);
    dialog.removeEventListener('click', click); dialog.removeEventListener('keydown', keydown); dialog.removeEventListener('cancel', cancel); dialog.removeEventListener('close', nativeClose); dialog.removeEventListener('error', artError, true);
    dialog.close?.(); dialog.remove();
    if (active?.dialog === dialog) active = null;
    if (notify) (completed ? onComplete : onExit)();
    const target = previous?.isConnected ? previous : doc.querySelector(`[data-act="tutorial-${kind}"]`);
    if (!completed) target?.focus();
  }
  function click(event) {
    const b = event.target.closest?.('[data-tutorial-action]');
    if (!b || !dialog.contains(b) || b.disabled || disposed) return;
    const action = b.dataset.tutorialAction;
    if (action === 'exit') return dispose(true);
    if (action === 'complete') { if (state.kind === 'basic' && state.status === 'complete') dispose(true, true); return; }
    if (action === 'select-card') { selected = b.dataset.cardId; render('', false); const preview = dialog.querySelector('[data-tutorial-preview]'); preview?.scrollIntoView?.({ block: 'nearest' }); dialog.querySelector('[data-tutorial-action="card"]:not([disabled])')?.focus({ preventScroll: true }); return; }
    try {
      actTutorial(state, { type: action, id: b.dataset.cardId || b.dataset.chapterId || b.dataset.optionId }, Number(b.dataset.revision));
      selected = null; render();
    } catch (error) { render(error.message); }
  }
  function keydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dispose(true); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not(:disabled), summary, [tabindex="0"]')].filter(el => !el.closest('details:not([open])') || el === el.closest('details:not([open])').querySelector('summary'));
    const first = focusable[0], last = focusable.at(-1);
    if (!first) return;
    if (event.shiftKey && (doc.activeElement === first || !focusable.includes(doc.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (doc.activeElement === last || !dialog.contains(doc.activeElement))) { event.preventDefault(); first.focus(); }
  }
  function cancel(event) { event.preventDefault(); dispose(true); }
  function nativeClose() { dispose(true); }
  function artError(event) { if (event.target.tagName === 'IMG') event.target.hidden = true; }
  dialog.addEventListener('click', click); dialog.addEventListener('keydown', keydown); dialog.addEventListener('cancel', cancel); dialog.addEventListener('close', nativeClose); dialog.addEventListener('error', artError, true);
  doc.body.append(dialog); render('', false);
  if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  dialog.querySelector('[data-tutorial-heading]')?.focus();
  active = { dialog, dispose };
  return { close: () => dispose(true), view: () => tutorialView(state) };
}
