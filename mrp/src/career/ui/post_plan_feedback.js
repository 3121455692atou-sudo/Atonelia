// Ephemeral presentation only. Commands, random draws and saves do not belong here.
// Every timeline owns its nodes/timers and is cancelled on redraw, dismissal or replacement.
const mounts = new WeakMap();
const seen = new WeakMap();
const BUFFS = ['focus', 'flow', 'shield', 'boost'];
const BUFF_LABEL = { focus: '聚焦', flow: '积累', shield: '稳定', boost: '校准' };
const finite = x => typeof x === 'number' && Number.isFinite(x);
export const POST_PLAN_MOTION_MS = 1640;
const reduced = root => !!root?.ownerDocument?.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const postPlanFeedbackDelay = root => reduced(root) ? 900 : POST_PLAN_MOTION_MS;

export function acceptedFeedback(result, before) {
  const { view, event } = result || {};
  if (!view || !event || !before || event.sessionId !== before.sessionId || event.sessionId !== view.sessionId ||
      event.revision !== view.revision || view.revision <= before.revision || event.score !== view.score ||
      ![event.instant, event.tick, before.score, view.score].every(finite) ||
      event.instant < 0 || event.tick < 0 || view.score - before.score !== event.instant + event.tick) return null;
  return {
    kind: 'accepted', sessionId: view.sessionId, revision: view.revision,
    cardId: event.cardId, name: event.name, gain: event.instant + event.tick,
    instant: event.instant, tick: event.tick, scoreBefore: before.score, scoreAfter: view.score,
    budgetBefore: before.budget, budgetAfter: view.budget, turn: event.turn,
    done: ['ready', 'active'].includes(view.status),
    buffs: BUFFS.filter(key => finite(view[key]) && finite(before[key]) && view[key] !== before[key])
      .map(key => ({ key, before: before[key], after: view[key], delta: view[key] - before[key] })),
  };
}
function cancel(r) { r.cancel?.(); r.cancel = null; }
function cardAt(root, id) { return [...(root.querySelectorAll?.('[data-pp-select]') || [])].find(el => el.dataset.ppSelect === id); }
function rect(node, root) {
  const a = node?.getBoundingClientRect?.(), b = root?.getBoundingClientRect?.();
  return a && b ? { x: a.left - b.left, y: a.top - b.top, width: a.width, height: a.height } : null;
}
export function selectPostPlanFeedback(state, sessionId, cardId) {
  const r = mounts.get(state);
  if (!r || r.root.isConnected === false || r.sessionId !== sessionId) return false;
  cancel(r); r.pending = { kind: 'selected', sessionId, cardId }; return true;
}
// The first hand also enters only after deck persistence accepts, not on opening/reload.
export function queuePostPlanDeal(state, view) {
  const r = mounts.get(state);
  if (!r || r.root.isConnected === false || r.sessionId !== view?.sessionId || view.status !== 'playing' || view.turn !== 1 || !Number.isInteger(view.revision)) return false;
  let revisions = seen.get(state);
  if (!revisions) { revisions = new Map(); seen.set(state, revisions); }
  if ((revisions.get(view.sessionId) ?? -1) >= view.revision) return false;
  revisions.set(view.sessionId, view.revision);
  cancel(r); r.pending = { kind: 'dealt', sessionId: view.sessionId }; return true;
}
// Queue only after durable acceptance. A render/log/reloaded save never enqueues a reward.
export function queuePostPlanFeedback(state, result, before) {
  const f = acceptedFeedback(result, before), r = mounts.get(state);
  if (!f || !r || r.root.isConnected === false || r.sessionId !== f.sessionId) return false;
  let revisions = seen.get(state);
  if (!revisions) { revisions = new Map(); seen.set(state, revisions); }
  if ((revisions.get(f.sessionId) ?? -1) >= f.revision) return false;
  revisions.set(f.sessionId, f.revision);
  const card = cardAt(r.root, f.cardId);
  const illustration = card?.querySelector('img');
  // A source URL is not evidence that pixels arrived. Keep cold/error flights
  // truthful and stable without waiting for network or installing new listeners.
  const artReady = illustration?.complete === true && illustration.naturalWidth > 0;
  f.art = artReady ? illustration.getAttribute('src') : null;
  f.artFallback = illustration && !artReady ? illustration.complete ? '卡面未载入' : '卡面载入中' : null;
  f.origin = rect(card, r.root);
  f.portrait = r.root.querySelector('.pp-character img')?.getAttribute('src') || null;
  cancel(r); r.pending = f; return true;
}
export function rejectPostPlanFeedback(state, sessionId) {
  const r = mounts.get(state);
  if (!r || r.root.isConnected === false || r.sessionId !== sessionId) return false;
  cancel(r); r.pending = { kind: 'rejected', sessionId }; return true;
}
export function preparePostPlanFeedbackRender(state) { const r=mounts.get(state);if(r)cancel(r); }
export function disposePostPlanFeedback(state) {
  const r = mounts.get(state);
  if (r) { cancel(r); r.pending = null; mounts.delete(state); }
  // Keep only a weak presentation watermark: reopening must not replay rewards.
}

function play(root, f) {
  const nodes = [], classes = [], timers = [];
  const doc = root.ownerDocument;
  if (!doc?.createElement) return () => {};
  const quiet = reduced(root);
  let alive = true;
  const finish = () => {
    if (!alive) return; alive = false;
    for (const timer of timers) clearTimeout(timer);
    for (const [node, name] of classes) node.classList.remove(name);
    for (const node of nodes) node.remove();
  };
  const later = (ms, fn) => timers.push(setTimeout(() => {
    if (!alive) return;
    if (root.isConnected === false) { finish(); return; }
    fn();
  }, ms));
  const mark = (selector, name) => {
    const node = typeof selector === 'string' ? root.querySelector(selector) : selector;
    if (node) { node.classList.add(name); classes.push([node, name]); }
    return node;
  };
  const add = (parent, className, text, tag = 'span') => {
    if (!parent) return null;
    const node = doc.createElement(tag);
    node.className = className; node.setAttribute('aria-hidden', 'true');
    if (text !== undefined) node.textContent = text;
    parent.append(node); nodes.push(node); return node;
  };
  const animate = (node, name) => { if (!quiet) mark(node, name); };
  const counter = (selector, from, to, start, duration) => {
    const node = root.querySelector(selector);
    if (!node || !finite(from) || !finite(to) || quiet || from === to) return;
    const original = node.querySelector?.('[data-pp-number]');
    if (!original) return;
    // The real final number stays in the accessibility tree throughout the count-up.
    mark(original, 'pp-number-underlay');
    const number = add(node, 'pp-fx-number', from);
    // 步数多一些，数字滚动更顺（只用 setTimeout，取消时随时间线一起清掉）。
    const steps = Math.max(10, Math.min(24, Math.round(duration / 16)));
    for (let i = 1; i <= steps; i++) later(start + duration * i / steps, () => {
      number.textContent = String(Math.round(from + (to - from) * (1 - (1 - i / steps) ** 3)));
    });
  };
  if (f.kind === 'dealt') {
    animate(root.querySelector('.pp-hand'), 'pp-fx-first-hand');
    later(650, finish); return finish;
  }
  if (f.kind === 'selected') {
    animate(cardAt(root, f.cardId), 'pp-fx-selected');
    later(320, finish); return finish;
  }
  if (f.kind === 'rejected') {
    mark('.pp-error', 'pp-fx-rejected'); mark('.pp-decision', 'pp-fx-rejected');
    later(700, finish); return finish;
  }

  const stage = root.querySelector('.pp-stage'), portrait = root.querySelector('.pp-character');
  const score = root.querySelector('[data-pp-score]');
  const layer = add(root, 'pp-fx-layer');
  const caption = add(layer, 'pp-fx-caption', quiet ? `${f.name} · 本手 +${f.gain} · 已保存` : `${f.name} · 已保存`);
  const total = add(score, 'pp-fx-score', `+${quiet ? f.gain : f.instant}`);
  total?.style?.setProperty('--pp-delay', quiet ? '0ms' : '340ms');
  if (!quiet) {
    mark(root, 'pp-is-resolving'); animate(stage, 'pp-fx-stage');
    // Re-deal is visual only; choosing early cancels this timeline without replaying it.
    animate(root.querySelector('.pp-hand'), 'pp-fx-hand-dealt');
    const target = rect(portrait || stage, root), fallback = { x: 10, y: 100, width: 84, height: 112 };
    const from = f.origin || fallback;
    const width = Math.min(126, Math.max(72, from.width * .68));
    const x = from.x + (from.width - width) / 2, y = from.y + 15;
    const tx = target ? target.x + target.width * .7 - width / 2 : 80;
    let ty = target ? target.y + Math.max(10, target.height * .25) : 30;
    // The portrait can be scrolled above a short-window hand. Keep the effect
    // landing inside the visible reading viewport rather than behind the header.
    const viewport = rect(root.querySelector('.pp-play-scroll'), root);
    if (viewport?.height > 0 && viewport.width > 0) ty = Math.max(viewport.y + 12, Math.min(ty, viewport.y + viewport.height - width * 4 / 3 - 12));
    const ticket = add(layer, 'pp-fx-card');
    ticket?.style?.setProperty('--pp-from-x', `${x}px`); ticket?.style?.setProperty('--pp-from-y', `${y}px`);
    ticket?.style?.setProperty('--pp-to-x', `${tx}px`); ticket?.style?.setProperty('--pp-to-y', `${ty}px`);
    ticket?.style?.setProperty('--pp-card-width', `${width}px`);
    if (f.art) { const img = add(ticket, '', undefined, 'img'); img.src = f.art; img.alt = ''; }
    else {
      add(ticket, 'pp-fx-card-symbol', '◇');
      if (f.artFallback) add(ticket, 'pp-fx-card-loading', f.artFallback);
    }
    add(ticket, 'pp-fx-card-name', f.name);
    // A real previous expression crossfades to the current model's actual sprite.
    const image = root.querySelector('.pp-character img');
    if (f.portrait && image && f.portrait !== image.getAttribute('src')) {
      const previous = add(portrait, 'pp-fx-portrait-before', undefined, 'img');
      previous.src = f.portrait; previous.alt = '';
      animate(image, 'pp-fx-portrait-enter');
    }
    later(340, () => {
      animate(image, 'pp-fx-portrait'); add(portrait, 'pp-fx-impact'); add(portrait, 'pp-fx-impact pp-fx-impact-2');
      // 落点的一圈光点：角度按序号排开，不用随机数。
      for (let i = 0; i < 10; i++) add(portrait, 'pp-fx-spark')?.style?.setProperty('--pp-spark', `${i * 36 + (i % 2) * 14}deg`);
    });
    counter('[data-pp-score]', f.scoreBefore, f.scoreBefore + f.instant, 340, 330);
    counter('[data-pp-budget]', f.budgetBefore, f.budgetAfter, 220, 220);
    if (f.tick) later(850, () => {
      // Replace the decorative direct-score counter, never the saved number.
      for (const node of nodes) if (node.className === 'pp-fx-number' && node.parentNode === score) node.remove();
      counter('[data-pp-score]', f.scoreBefore + f.instant, f.scoreAfter, 0, 300);
    });
  }
  const buffStart = quiet ? 0 : 470;
  f.buffs.forEach(({ key, delta, before, after }, i) => {
    const hit = () => {
      const node = mark(`[data-pp-buff="${key}"]`, delta > 0 ? 'pp-fx-buff-gain' : 'pp-fx-buff-used');
      add(node, 'pp-fx-stack', `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`);
      // 叠层一格一格地亮（新增的格子依次弹出）或熄（消耗的格子闪一下再暗）；层数数字跳一下。
      if (!quiet && node) {
        const pips = [...(node.querySelectorAll?.('.pp-stack-track i') || [])];
        const lo = Math.max(0, Math.min(before, after)), hi = Math.min(pips.length, Math.max(before, after));
        for (let k = lo; k < hi; k++) {
          const pip = mark(pips[k], delta > 0 ? 'pp-fx-pip-new' : 'pp-fx-pip-used');
          pip?.style?.setProperty('--pp-pip', String(delta > 0 ? k - lo : hi - 1 - k));
        }
        mark(node.querySelector?.('em'), 'pp-fx-count-pop');
      }
      if (caption) caption.textContent = `${BUFF_LABEL[key]} ${delta > 0 ? '+' : '−'}${Math.abs(delta)} · ${delta > 0 ? '增层' : '消耗'}`;
    };
    if (quiet) hit(); else later(buffStart + i * 95, hit);
  });
  const direct = () => { animate(score, 'pp-fx-score-hit'); if (caption && !f.buffs.length) caption.textContent = `卡牌结算 +${f.instant} 演练分`; };
  if (quiet) direct(); else later(380, direct);
  if (f.tick) {
    const tick = () => {
      mark('[data-pp-buff="flow"]', 'pp-fx-chain-source');
      add(portrait, 'pp-fx-combo', `积累连锁 +${f.tick}`);
      if (caption) caption.textContent = `积累连锁 +${f.tick} → 本手 +${f.gain}`;
      if (!quiet) {
        const sum = add(score, 'pp-fx-score pp-fx-score-total', `本手 +${f.gain}`);
        sum?.style?.setProperty('--pp-delay', '260ms');
      }
    };
    if (quiet) tick(); else later(850, tick);
  }
  if (!quiet && !f.tick) later(950, () => { if (caption) caption.textContent = `本手 +${f.gain} 演练分 · 已保存`; });
  if (f.done) {
    const settle = () => {
      mark('.pp-receipt', 'pp-fx-settled');
      add(portrait, 'pp-fx-settlement', '六手完成 · 方案已存档');
      if (caption) caption.textContent = '方案准备完成 · 等待实际训练日兑现';
    };
    if (quiet) settle(); else later(1180, settle);
  }
  later(quiet ? 900 : POST_PLAN_MOTION_MS, finish);
  return finish;
}

export function mountPostPlanFeedback(state, root, sessionId) {
  if (!root || root.isConnected === false) { disposePostPlanFeedback(state); return; }
  let r = mounts.get(state);
  if (r?.sessionId !== sessionId) { disposePostPlanFeedback(state); r = null; }
  if (!r) { r = { root, sessionId, pending: null, cancel: null }; mounts.set(state, r); }
  if (r.root !== root) { cancel(r); r.root = root; }
  const f = r.pending; r.pending = null;
  if (f) { cancel(r); r.cancel = play(root, f); }
}
