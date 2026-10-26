// 训练页只读区域的小范围对齐：不替换编辑区，不读写引擎，不触发输入事件。
const KEEP = '.submit-box, .model-detail';
const key = n => n.nodeType === 1 ? n.getAttribute('data-train-key') : null;
export function patchTrainingNode(old, next) {
  if (old.nodeType === 3 && next.nodeType === 3) { if(old.data !== next.data) old.data=next.data; return; }
  if (old.nodeType !== 1 || next.nodeType !== 1) return;
  if (old.matches(KEEP)) return;
  const editing = old.matches('input,select,textarea');
  for (const a of [...old.attributes]) if (!next.hasAttribute(a.name) && !(editing && ['value','checked','selected'].includes(a.name))) old.removeAttribute(a.name);
  for (const a of [...next.attributes]) if (!(editing && ['value','checked','selected'].includes(a.name)) && old.getAttribute(a.name)!==a.value) old.setAttribute(a.name,a.value);
  if(editing) { if(old.matches('input[type=checkbox]')) old.checked=next.checked; return; }
  const pool=[...old.childNodes]; let cursor=old.firstChild;
  for(const fresh of [...next.childNodes]) {
    const k=key(fresh);
    let live=k ? pool.find(x=>key(x)===k) : pool.find(x=>!key(x)&&x.nodeType===fresh.nodeType&&(x.nodeType!==1||x.tagName===fresh.tagName));
    if(live) { pool.splice(pool.indexOf(live),1); if(live!==cursor) old.insertBefore(live,cursor); patchTrainingNode(live,fresh); }
    else { live=fresh.cloneNode(true); old.insertBefore(live,cursor); }
    cursor=live.nextSibling;
  }
  for(const extra of pool) if(!(extra.nodeType===1 && extra.matches(KEEP))) extra.remove();
}
