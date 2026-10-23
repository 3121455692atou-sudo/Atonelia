// 读样式表文本的小工具：按出现顺序，算几个类选择器在某个窗口宽度下最后生效的声明。
// 只认 max-width / min-width 媒体查询（prefers-reduced-motion 之类当作不生效），跳过 @keyframes。
// 只看选择器列表里和给定选择器一字不差的那一项，按“同优先级、后写的赢”叠起来；够测断点里的覆盖有没有被后面的基础规则盖掉。

// 把样式表拆成 [{ media, selectors, body }]，顺序和文件里一样；@media 里的规则带上它的条件。
export function cssRules(css, media = null) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    let depth = 1, j = open + 1;
    for (; j < text.length && depth; j++) depth += text[j] === '{' ? 1 : text[j] === '}' ? -1 : 0;
    const head = text.slice(i, open).trim().replace(/\s+/g, ' ');
    const body = text.slice(open + 1, j - 1);
    if (head.startsWith('@media')) out.push(...cssRules(body, head));
    else if (!head.startsWith('@')) out.push({ media, selectors: head.split(',').map(x => x.trim()), body });
    i = j;
  }
  return out;
}

function mediaMatches(media, width) {
  if (!media) return true;
  const conds = [...media.matchAll(/\(([^)]*)\)/g)].map(m => m[1].split(':').map(x => x.trim()));
  return conds.length > 0 && conds.every(([k, v]) => (k === 'max-width' ? width <= parseFloat(v) : k === 'min-width' ? width >= parseFloat(v) : false));
}

// cssAt(css, ['.now-row', '.now-row--bar'], 390) → { 'grid-template-columns': '…', … }
export function cssAt(css, selectors, width) {
  const want = [].concat(selectors);
  const decl = {};
  for (const r of cssRules(css)) {
    if (!r.selectors.some(x => want.includes(x)) || !mediaMatches(r.media, width)) continue;
    for (const d of r.body.split(';')) {
      const k = d.indexOf(':');
      if (k > 0) decl[d.slice(0, k).trim()] = d.slice(k + 1).trim();
    }
  }
  return decl;
}

// 按空白拆值，括号里的不拆：'44px minmax(0, 1fr) auto' → 3 项。
export const cssTokens = v => (v || '').match(/(?:[^\s(]+\([^)]*\)[^\s(]*|[^\s(]+)/g) || [];
