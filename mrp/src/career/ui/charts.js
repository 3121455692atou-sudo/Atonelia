// 轻量 SVG 图表：不同榜单用不同的图表样式。
import { esc, clipName, splitName } from './fmt.js';

const pal = ['#3c7fab', '#d9787a', '#8a78b8', '#c09a55', '#5f9c82', '#d08a3a', '#6d8fbf', '#b5739d'];

// 条形榜、调用量榜的名字：主名和括号后缀分两段。手机上（≤480px）后缀不显示，CSS 的省略号只截主名，不会截在括号里；完整名字在 title 里。
const nameSpans = name => { const [main, sfx] = splitName(name); return `${esc(main)}${sfx ? `<span class="nm-sfx">${esc(sfx)}</span>` : ''}`; };

// 横向条形榜：百分比类榜单。mine 行高亮，lower 表示越低越好。
export function barBoard(rows, { unit = '%', max = null, lower = false, limit = 12, fmt = v => v } = {}) {
  const list = rows.slice(0, limit);
  const mineIdx = rows.findIndex(r => r.mine);
  if (mineIdx >= limit) list.push({ ...rows[mineIdx], gap: true });
  const hi = max ?? Math.max(...rows.map(r => r.score), 1);
  return `<ol class="bars">${list.map(r => {
    const w = Math.max(2, Math.min(100, (r.score / hi) * 100));
    return `<li class="${r.mine ? 'mine' : ''} ${r.gap ? 'gap' : ''}"><span class="rk">${r.rank}</span><span class="nm" title="${esc(r.name)}${r.company ? ` · ${esc(r.company)}` : ''}">${nameSpans(r.name)}${r.open ? '<i class="tag-open">开源</i>' : ''}</span>
      <span class="track"><i style="width:${w}%;${lower ? 'background:var(--bar-lower)' : ''}"></i></span><b>${fmt(r.score)}${unit}</b></li>`;
  }).join('')}</ol>`;
}

// Elo 榜：点 + 置信区间，竞技场风格。
export function eloBoard(rows, { limit = 14 } = {}) {
  const list = rows.slice(0, limit);
  const mineIdx = rows.findIndex(r => r.mine);
  if (mineIdx >= limit) list.push(rows[mineIdx]);
  const lo = Math.min(...list.map(r => r.score)) - 30;
  const hi = Math.max(...list.map(r => r.score)) + 30;
  const W = 600, rowH = 26, H = list.length * rowH + 24;
  const x = v => 170 + (v - lo) / (hi - lo) * (W - 220);
  const ticks = [];
  for (let t = Math.ceil(lo / 50) * 50; t <= hi; t += 50) ticks.push(t);
  return `<svg class="chart elo" viewBox="0 0 ${W} ${H}" role="img" aria-label="Elo 排名">
    ${ticks.map(t => `<line x1="${x(t)}" x2="${x(t)}" y1="0" y2="${H - 18}" class="grid"/><text x="${x(t)}" y="${H - 4}" class="tick" text-anchor="middle">${t}</text>`).join('')}
    ${list.map((r, i) => {
      const y = i * rowH + 14;
      const ci = 6 + 14 / Math.sqrt(1 + (r.votes || 3000) / 2000);
      return `<g class="${r.mine ? 'mine' : ''}"><text x="4" y="${y + 4}" class="lbl">${r.rank}. ${esc(clipName(r.name, 18))}</text>
        <line x1="${x(r.score - ci)}" x2="${x(r.score + ci)}" y1="${y}" y2="${y}" class="ci"/><circle cx="${x(r.score)}" cy="${y}" r="${r.mine ? 6 : 4.5}" class="dot"/>
        <text x="${x(r.score + ci) + 6}" y="${y + 4}" class="val">${Math.round(r.score)}</text></g>`;
    }).join('')}
  </svg>`;
}

// 散点：价格（对数）对能力，Artificial Analysis 风格的性价比图。
// 散点：横轴价格（对数），纵轴能力。标签依次试右、左、上、下，和别的标签或圆点重叠就不画（悬停圆点能看到名字）。
export function scatter(points, { xLabel = '', yLabel = '', logX = true, w = 760, h = 420 } = {}) {
  if (!points.length) return '';
  const lx = v => (logX ? Math.log10(Math.max(v, 1e-3)) : v);
  const xs = points.map(p => lx(p.x));
  const ys = points.map(p => p.y);
  const x0 = Math.min(...xs) - 0.12, x1 = Math.max(...xs) + 0.12;
  const y0 = Math.min(...ys) - 3, y1 = Math.max(...ys) + 3;
  const L = 52, R = 14, T = 16, B = 42;
  const X = v => L + (lx(v) - x0) / (x1 - x0 || 1) * (w - L - R);
  const Y = v => h - B - (v - y0) / (y1 - y0 || 1) * (h - T - B);
  const ticks = [];
  for (let e = Math.floor(x0); e <= Math.ceil(x1); e++) for (const m of [1, 2, 5]) { const v = m * 10 ** e; if (lx(v) >= x0 && lx(v) <= x1) ticks.push(v); }
  const money = v => `$${v >= 1 ? v : v.toFixed(v < 0.1 ? 2 : 1)}`;
  const textW = s => [...s].reduce((a, c) => a + (c.charCodeAt(0) < 256 ? 6.3 : 11), 0);
  const boxes = points.map(p => ({ x: X(p.x) - 5, y: Y(p.y) - 5, w: 10, h: 10 }));
  const hit = b => boxes.some(o => b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h && o.y < b.y + b.h);
  const labels = new Array(points.length).fill(null);
  const order = points.map((_, i) => i).sort((a, b) => Number(!!points[b].mine) - Number(!!points[a].mine) || points[b].y - points[a].y);
  for (const i of order) {
    const p = points[i];
    const text = clipName(p.label, 22);
    const tw = textW(text);
    const cx = X(p.x), cy = Y(p.y);
    // 自己的标签一定要画：只避开边界，不避让别人的圆点。
    for (const [dx, dy, anchor] of [[9, 4, 'start'], [-9, 4, 'end'], [0, -10, 'middle'], [0, 17, 'middle']]) {
      let bx = anchor === 'start' ? cx + dx : anchor === 'end' ? cx + dx - tw : cx - tw / 2;
      if (anchor === 'middle') bx = Math.min(Math.max(bx, L + 1), w - R - tw - 1);
      const box = { x: bx - 1, y: cy + dy - 11, w: tw + 2, h: 14 };
      if (box.x < L || box.x + box.w > w - R + 2 || box.y < 2 || box.y + box.h > h - B + 2 || (!p.mine && hit(box))) continue;
      boxes.push(box);
      labels[i] = anchor === 'middle' ? { x: bx, y: cy + dy, anchor: 'start', text } : { x: cx + dx, y: cy + dy, anchor, text };
      break;
    }
  }
  return `<svg class="chart scatter" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(yLabel)} 对 ${esc(xLabel)}">
    ${ticks.map(v => `<line class="grid" x1="${X(v)}" x2="${X(v)}" y1="${T}" y2="${h - B}"/><text class="tick" x="${X(v)}" y="${h - B + 16}" text-anchor="middle">${money(v)}</text>`).join('')}
    ${[0, 0.5, 1].map(f => { const v = y0 + 3 + (y1 - y0 - 6) * f; return `<text class="tick" x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`; }).join('')}
    <text class="axis" x="${(L + w - R) / 2}" y="${h - 6}" text-anchor="middle">${esc(xLabel)}</text>
    <text class="axis" x="12" y="${(T + h - B) / 2}" transform="rotate(-90 12 ${(T + h - B) / 2})" text-anchor="middle">${esc(yLabel)}</text>
    <rect class="sweet" x="${L}" y="${T}" width="${(w - L - R) * 0.45}" height="${(h - T - B) * 0.45}" rx="6"/><text class="sweet-t" x="${L + 6}" y="${T + 14}">性价比区</text>
    ${points.map((p, i) => `<g class="${p.mine ? 'mine' : ''}"><circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${p.mine ? 6.5 : 4.5}" class="dot" style="${p.color ? `fill:${p.color}` : ''}"><title>${esc(p.label)} · ${money(Math.round(p.x * 100) / 100)} · ${esc(String(p.y))}</title></circle>
      ${labels[i] ? `<text x="${labels[i].x}" y="${labels[i].y}" text-anchor="${labels[i].anchor}" class="lbl">${esc(labels[i].text)}</text>` : ''}</g>`).join('')}
  </svg>`;
}

// 折线：财务、股价、能力进展。
// 折线：财务、股价、能力走势。点的值可以是 null（这段时间还没有数据），线会断开；图例按宽度自动换行。
export function lineChart(series, { w = 600, h = 220, yFmt = v => v, xLabels = true, zero = false } = {}) {
  const all = series.flatMap(s => s.points.map(p => p[1])).filter(v => v !== null && v !== undefined);
  if (!all.length) return '<p class="muted">暂无数据</p>';
  let lo = Math.min(...all), hi = Math.max(...all);
  if (zero) lo = Math.min(0, lo);
  if (hi === lo) hi = lo + 1;
  // 图例：每项约按字宽估算，放不下就换行。
  const tw = s => 14 + [...s].reduce((a, c) => a + (c.charCodeAt(0) < 256 ? 6 : 10.5), 0);
  const legend = [];
  let lx = 46, ly = 12;
  series.forEach((s, si) => {
    const wv = tw(s.name) + 14;
    if (lx + wv > w - 6 && lx > 46) { lx = 46; ly += 15; }
    legend.push({ x: lx, y: ly, s, si });
    lx += wv;
  });
  const top = ly + 10;
  const n = Math.max(...series.map(s => s.points.length));
  const X = i => 46 + i / Math.max(1, n - 1) * (w - 60);
  const Y = v => h - 26 - (v - lo) / (hi - lo) * (h - 26 - top);
  const keys = series[0].points.map(p => p[0]);
  const step = Math.max(1, Math.ceil(n / 6));
  const segs = s => {
    const out = [];
    let cur = [];
    s.points.forEach((p, i) => { if (p[1] === null || p[1] === undefined) { if (cur.length) out.push(cur); cur = []; } else cur.push(`${X(i)},${Y(p[1])}`); });
    if (cur.length) out.push(cur);
    return out;
  };
  return `<svg class="chart line" viewBox="0 0 ${w} ${h}" role="img">
    ${[0, 0.5, 1].map(t => { const v = lo + (hi - lo) * t; return `<line class="grid" x1="46" x2="${w - 10}" y1="${Y(v)}" y2="${Y(v)}"/><text class="tick" x="42" y="${Y(v) + 4}" text-anchor="end">${esc(yFmt(v))}</text>`; }).join('')}
    ${zero && lo < 0 ? `<line class="zero" x1="46" x2="${w - 10}" y1="${Y(0)}" y2="${Y(0)}"/>` : ''}
    ${xLabels ? keys.map((k, i) => (i % step === 0 || i === n - 1 ? `<text class="tick" x="${X(i)}" y="${h - 8}" text-anchor="middle">${esc(String(k).slice(2))}</text>` : '')).join('') : ''}
    ${series.map((s, si) => segs(s).map(pts => (pts.length > 1 ? `<polyline class="ln${s.bold ? ' ln--bold' : ''}" style="stroke:${s.color || pal[si % pal.length]}" points="${pts.join(' ')}"/>` : `<circle cx="${pts[0].split(',')[0]}" cy="${pts[0].split(',')[1]}" r="3" style="fill:${s.color || pal[si % pal.length]}"/>`)).join('')).join('')}
    ${legend.map(({ x, y, s, si }) => `<text class="legend" x="${x}" y="${y}" style="fill:${s.color || pal[si % pal.length]}${s.bold ? ';font-weight:700' : ''}">● ${esc(s.name)}</text>`).join('')}
  </svg>`;
}

// 堆叠柱：每月收入按产品、支出按类别叠起来；可以再压一条折线（比如总支出）。
// rows: [{ date, parts: { key: value } }]，keys: [{ key, name, color? }]
export function stackBars(rows, keys, { w = 600, h = 220, yFmt = v => v, line = null } = {}) {
  if (!rows.length) return '<p class="muted">暂无数据</p>';
  const sums = rows.map(r => keys.reduce((a, k) => a + Math.max(0, r.parts[k.key] || 0), 0));
  const hi = Math.max(1, ...sums, ...(line ? line.values.filter(v => v !== null && v !== undefined) : []));
  const items = [...keys.map((k, i) => ({ name: k.name, color: k.color || pal[i % pal.length] })), ...(line ? [{ name: line.name, color: line.color || '#d9787a', line: true }] : [])];
  const tw = s => 14 + [...s].reduce((a, c) => a + (c.charCodeAt(0) < 256 ? 6 : 10.5), 0);
  const legend = [];
  let lx = 46, ly = 12;
  for (const it of items) {
    const wv = tw(it.name) + 14;
    if (lx + wv > w - 6 && lx > 46) { lx = 46; ly += 15; }
    legend.push({ x: lx, y: ly, it });
    lx += wv;
  }
  const top = ly + 10;
  const n = rows.length;
  const slot = (w - 56) / n;
  const bw = Math.max(3, Math.min(26, slot * 0.68));
  const X = i => 46 + slot * (i + 0.5);
  const Y = v => h - 26 - v / hi * (h - 26 - top);
  const step = Math.max(1, Math.ceil(n / 6));
  const bars = rows.map((r, i) => {
    let acc = 0;
    return keys.map((k, ki) => {
      const v = Math.max(0, r.parts[k.key] || 0);
      if (!v) return '';
      const y1 = Y(acc), y2 = Y(acc + v);
      acc += v;
      return `<rect x="${X(i) - bw / 2}" y="${y2}" width="${bw}" height="${Math.max(0.5, y1 - y2)}" rx="1.5" style="fill:${k.color || pal[ki % pal.length]}"><title>${esc(r.date)} ${esc(k.name)} ${esc(yFmt(v))}</title></rect>`;
    }).join('');
  }).join('');
  const lpts = line ? line.values.map((v, i) => (v === null || v === undefined ? null : `${X(i)},${Y(v)}`)).filter(Boolean) : [];
  return `<svg class="chart line stack" viewBox="0 0 ${w} ${h}" role="img">
    ${[0, 0.5, 1].map(t => `<line class="grid" x1="46" x2="${w - 10}" y1="${Y(hi * t)}" y2="${Y(hi * t)}"/><text class="tick" x="42" y="${Y(hi * t) + 4}" text-anchor="end">${esc(yFmt(hi * t))}</text>`).join('')}
    ${rows.map((r, i) => (i % step === 0 || i === n - 1 ? `<text class="tick" x="${X(i)}" y="${h - 8}" text-anchor="middle">${esc(String(r.date).slice(2))}</text>` : '')).join('')}
    ${bars}
    ${lpts.length > 1 ? `<polyline class="ln" style="stroke:${line.color || '#d9787a'};stroke-dasharray:5 3" points="${lpts.join(' ')}"/>` : ''}
    ${legend.map(({ x, y, it }) => `<text class="legend" x="${x}" y="${y}" style="fill:${it.color}">${it.line ? '┄' : '■'} ${esc(it.name)}</text>`).join('')}
  </svg>`;
}

// invert：数值往上走是坏事（负载、429），颜色反过来。
export function sparkline(values, { w = 90, h = 26, color = '', invert = false } = {}) {
  if (!values.length) return '';
  const lo = Math.min(...values), hi = Math.max(...values);
  const X = i => i / Math.max(1, values.length - 1) * (w - 2) + 1;
  const Y = v => h - 2 - (hi === lo ? 0.5 : (v - lo) / (hi - lo)) * (h - 4);
  const up = (values.at(-1) >= values[0]) !== invert;
  return `<svg class="spark ${up ? 'up' : 'down'}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><polyline points="${values.map((v, i) => `${X(i)},${Y(v)}`).join(' ')}" style="${color ? `stroke:${color}` : ''}"/></svg>`;
}

// 雷达图：模型各维能力，虚线为后训练上限。
export function radar(dims, { caps = null, size = 220 } = {}) {
  const n = dims.length;
  const c = size / 2, r = size / 2 - 34;
  const pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [c + Math.cos(a) * r * v / 100, c + Math.sin(a) * r * v / 100]; };
  const poly = vals => vals.map((v, i) => pt(i, v).join(',')).join(' ');
  return `<svg class="chart radar" viewBox="0 0 ${size} ${size}" role="img">
    ${[25, 50, 75, 100].map(v => `<polygon class="ring" points="${poly(dims.map(() => v))}"/>`).join('')}
    ${dims.map((d, i) => { const [x, y] = pt(i, 118); return `<text class="lbl" x="${x}" y="${y + 4}" text-anchor="middle">${esc(d.label)}</text>`; }).join('')}
    ${caps ? `<polygon class="cap" points="${poly(dims.map(d => caps[d.key] ?? 0))}"/>` : ''}
    <polygon class="val" points="${poly(dims.map(d => d.value))}"/>
  </svg>`;
}

// 堆叠条：调用量榜里的份额。
export function shareBars(rows, { limit = 10, fmt = v => v } = {}) {
  const total = rows.reduce((a, r) => a + r.value, 0) || 1;
  const top = rows.slice(0, limit);
  const mine = rows.find(r => r.mine);
  if (mine && !top.includes(mine)) top.push(mine);
  return `<div class="sharebar">${top.map((r, i) => `<i style="width:${r.value / total * 100}%;background:${r.mine ? 'var(--accent)' : pal[i % pal.length]}" title="${esc(r.name)}"></i>`).join('')}</div>
  <ol class="bars usage">${top.map(r => `<li class="${r.mine ? 'mine' : ''}"><span class="rk">${r.rank}</span><span class="nm" title="${esc(r.name)}">${nameSpans(r.name)}</span>
    <span class="track"><i style="width:${Math.max(2, r.value / rows[0].value * 100)}%"></i></span><b>${fmt(r.value)}</b></li>`).join('')}</ol>`;
}
