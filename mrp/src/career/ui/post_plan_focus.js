// Ephemeral focus containment for the card panel only. No rules, saves or timers.
const mounts = new WeakMap();
const documentOwners = new WeakMap();
const KEYS = ['data-pp-pack','data-pp-focus-entry','data-pp-card-info','data-pp-select','data-pp-deck','data-pp-filter','data-pp-recipe','data-pp-find-tag','data-pp-page','data-pp-confirm','data-pp-choose','data-pp-control','data-pp-back','data-pp-buff','data-pp-info'];
const candidates = root => [...root.querySelectorAll('button,input,select,textarea,a[href],summary,[tabindex]')].filter(node =>
  !node.disabled && node.tabIndex >= 0 && !node.closest('[hidden],[inert]') && (!node.getClientRects || node.getClientRects().length > 0));
const dialog = root => root.querySelector('.pp-info:not([hidden])');
const preferred = scope => scope.querySelector('[data-pp-focus-entry]') || candidates(scope)[0] || scope;
const focus = (node,preventScroll = true) => node?.focus?.({preventScroll});
function keyOf(node) {
  const attr = KEYS.find(key => node?.hasAttribute?.(key));
  return attr ? {attr,value:node.getAttribute(attr)} : null;
}
function byKey(scope,key) {
  if (!key) return null;
  return [...scope.querySelectorAll(`[${key.attr}]`)].find(node => node.getAttribute(key.attr) === key.value &&
    !node.disabled && !node.closest('[hidden],[inert]') && (!node.getClientRects || node.getClientRects().length > 0));
}
export function disposePostPlanFocus(state) {
  const r = mounts.get(state); if (!r) return;
  r.active = false;
  r.doc.removeEventListener('keydown',r.keydown,true); r.doc.removeEventListener('focusin',r.focusin,true);
  if (documentOwners.get(r.doc) === r) documentOwners.delete(r.doc);
  mounts.delete(state);
}
export function mountPostPlanFocus(state,root,sessionId) {
  const doc = root?.ownerDocument;
  if (!root || root.isConnected === false) { disposePostPlanFocus(state); return; }
  // Headless presentation callers may not supply a live DOM. Do not invent one.
  if (typeof root.contains !== 'function' || typeof doc?.addEventListener !== 'function') return;
  const owner = documentOwners.get(doc);
  if (owner && owner.state !== state) disposePostPlanFocus(owner.state);
  let r = mounts.get(state);
  if (r && (r.doc !== doc || r.sessionId !== sessionId)) { disposePostPlanFocus(state); r = null; }
  if (!r) {
    r = {state,doc,root,sessionId,active:true,key:null}; mounts.set(state,r); documentOwners.set(doc,r);
    const live = () => {
      if (!r.active || mounts.get(state) !== r || documentOwners.get(doc) !== r) return false;
      if (r.root.isConnected === false) { disposePostPlanFocus(state); return false; }
      return true;
    };
    r.focusin = ev => {
      if (!live()) return;
      const scope = dialog(r.root) || r.root;
      if (!scope.contains(ev.target)) { focus(preferred(scope)); return; }
      r.key = keyOf(ev.target);
    };
    r.keydown = ev => {
      if (!live()) return;
      const info = dialog(r.root), scope = info || r.root;
      // The child rules dialog retains its own Tab/Escape handling.
      if (info?.contains(ev.target)) return;
      if (ev.key === 'Tab') {
        const items = candidates(scope), at = items.indexOf(doc.activeElement);
        if (at < 0 || (ev.shiftKey ? at === 0 : at === items.length - 1)) {
          // Keyboard navigation must reveal an offscreen target in the interior
          // reader; only redraw/restoration suppresses scrolling.
          ev.preventDefault(); focus((ev.shiftKey ? items.at(-1) : items[0]) || preferred(scope),false);
        }
      } else if ((ev.key === 'Enter' || ev.key === ' ' || ev.code === 'Space') && !scope.contains(doc.activeElement)) {
        // A removed focused node can leave BODY active between DOM replacements.
        // Never let a stale Enter activate the covered home clock.
        ev.preventDefault(); ev.stopImmediatePropagation(); focus(preferred(scope));
      }
    };
    doc.addEventListener('keydown',r.keydown,true); doc.addEventListener('focusin',r.focusin,true);
  }
  r.root = root;
  const scope = dialog(root) || root;
  if (scope.contains(doc.activeElement)) { r.key = keyOf(doc.activeElement); return; }
  // Initial entry is a non-submitting heading; redraw restores only a logical
  // control identity, never a stale DOM reference or a default card selection.
  focus(byKey(scope,r.key) || preferred(scope));
}
