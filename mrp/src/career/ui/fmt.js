// 界面工具：转义、格式化、美术资源、图标。
import { characterById, MODALITIES, TECH_BY_ID, dimLabel, fmtDate, WEIGHT_CLASSES, ARCHS } from '../data/core.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const wait = ms => new Promise(r => setTimeout(r, ms));
// 型号名太长要截断时（榜单、散点图的标签）：按字符（不是 UTF-16 码元）数，超过 max 个就留前 max-1 个再加“…”。
// 括号一定成对：截的地方落在括号里面，就在那个括号前面截（“Claude 3.5 Sonnet（新版）”→“Claude 3.5 Sonnet…”）；
// 括号前面一个字都没有（名字以括号开头）时，不去掉括号，截完把括号补上（“（内测版很长……）”）。
const BRACKETS = { '（': '）', '(': ')', '【': '】', '[': ']', '「': '」', '『': '』', '《': '》', '〈': '〉', '{': '}' };
export function clipName(name, max) {
  const chars = Array.from(String(name ?? ''));
  if (chars.length <= max) return chars.join('');
  const head = chars.slice(0, Math.max(0, max - 1));
  const open = []; // 还没配上对的开括号：[在 head 里的位置, 要配的闭括号]
  head.forEach((c, i) => {
    if (BRACKETS[c]) open.push([i, BRACKETS[c]]);
    else if (open.length && open[open.length - 1][1] === c) open.pop();
  });
  if (!open.length) return `${head.join('').trimEnd()}…`;
  const before = head.slice(0, open[0][0]).join('').replace(/[\s\-–—·,，、/:：;；]+$/, '');
  return before ? `${before}…` : `${head.join('').trimEnd()}…${open.map(o => o[1]).reverse().join('')}`;
}
// 型号名拆成主名和括号后缀：“GPT-3.5（ChatGPT）”→ ['GPT-3.5', '（ChatGPT）']，两段拼回去就是原名（括号前的空格算在后缀里）。
// 条形榜靠 CSS 省略号截断，手机上只显示主名、藏起后缀，省略号就不会截在括号里。没有括号、或者名字以括号开头时不拆，后缀是空串。
export function splitName(name) {
  const chars = Array.from(String(name ?? ''));
  const i = chars.findIndex((c, k) => k > 0 && BRACKETS[c]);
  const before = i < 0 ? '' : chars.slice(0, i).join('');
  const main = before.trimEnd();
  if (!main) return [chars.join(''), ''];
  return [main, before.slice(main.length) + chars.slice(i).join('')];
}
export { fmtDate, dimLabel, WEIGHT_CLASSES, ARCHS };
// 还没开放的能力维度写什么（开没开放读 E.dimUnlocked，和模拟同一口径）：要先学会某项技术的写“学会「函数调用」后出现”，按日期开放的写“某月出现”。
export const dimLockText = d => (d?.needTech ? `学会「${TECH_BY_ID[d.needTech]?.name || d.needTech}」后出现` : d?.from ? `${fmtDate(d.from)} 出现` : '');

export function money(v) {
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1e8) return `${sign}${(a / 1e8).toFixed(a >= 1e10 ? 0 : 1)}亿`;
  if (a >= 1e4) return `${sign}${(a / 1e4).toFixed(a >= 1e6 ? 0 : 1)}万`;
  if (a > 0 && a < 100) return `${sign}${Number(a.toFixed(a < 1 ? 2 : 1))}`;
  return `${sign}${Math.round(a)}`;
}
export const usd = v => `$${money(v)}`;
export function count(v) {
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)}亿`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(v >= 1e6 ? 0 : 1)}万`;
  return String(Math.round(v));
}
export function tokens(v) {
  if (v >= 1e12) return `${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return String(Math.round(v));
}
export const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;
export const params = b => (b >= 1000 ? `${(b / 1000).toFixed(b % 1000 ? 1 : 0)}T` : `${b}B`);

// 显示用：把格式化好的数字拆成“前缀 | 数字 | 单位”三段（$9.0亿 → $ 9.0 亿），数字大、单位小。只改排版，不改数值。
export function numHtml(text) {
  const m = String(text).match(/^([^\d]*?)(-?[\d.,]+)(.*)$/);
  if (!m) return `<span class="nu"><span class="nu-n">${esc(text)}</span></span>`;
  return `<span class="nu">${m[1] ? `<span class="nu-p">${esc(m[1])}</span>` : ''}<span class="nu-n">${esc(m[2])}</span>${m[3] ? `<span class="nu-u">${esc(m[3])}</span>` : ''}</span>`;
}
// 能力维度的评级字母（育成游戏式显示）：只按 0–100 的维度值换算，纯显示，不参与任何计算。
const GRADES = [[95, 'S+'], [88, 'S'], [78, 'A'], [66, 'B'], [54, 'C'], [42, 'D'], [30, 'E'], [18, 'F'], [-Infinity, 'G']];
export function grade(v) {
  const g = GRADES.find(([min]) => v >= min)[1];
  return { g, cls: `g-${g === 'S+' ? 'ss' : g.toLowerCase()}` };
}

// 背景写进 CSS 变量时，相对地址会按样式表目录解析，所以转成绝对地址。
const abs = p => new URL(p, document.baseURI).href;
export const BG = {
  lab: abs('./assets/thumbs/bg-sunlit-atelier.webp'), arena: abs('./assets/thumbs/bg-career-arena.webp'),
  gala: abs('./assets/thumbs/bg-career-gala.webp'), outing: abs('./assets/thumbs/bg-career-outing.webp'), camp: abs('./assets/thumbs/bg-career-camp.webp'),
  court: abs('./assets/thumbs/bg-event-court.webp'), exchange: abs('./assets/thumbs/bg-event-exchange.webp'),
  datacenter: abs('./assets/thumbs/bg-event-datacenter.webp'), launch: abs('./assets/thumbs/bg-event-launch.webp'),
  night: abs('./assets/thumbs/bg-event-lab-night.webp'), port: abs('./assets/thumbs/bg-event-port.webp'), hearing: abs('./assets/thumbs/bg-event-hearing.webp'),
  // 公司策略完成卡沿用营地那张图，不新增图片文件（规格 A11：由 BG.camp 改名而来）。
  strategy: abs('./assets/thumbs/bg-career-camp.webp'),
};
// 事件配图：行业大事按类型，其余按事件。
const WORLD_BG = { lawsuit: 'court', ipo: 'exchange', funding: 'exchange', market: 'exchange', price: 'exchange', export: 'port', release: 'launch', paradigm: 'launch', controversy: 'launch', safety: 'datacenter', regulation: 'hearing', benchmark: 'arena', talent: 'night', other: 'gala' };
const EVENT_BG = { e429: 'datacenter', outage: 'datacenter', viral: 'datacenter', proxy: 'datacenter', export_ban: 'port', ipo_window: 'exchange', runway: 'exchange', budget: 'exchange', filing: 'hearing', lawsuit: 'court', exposed: 'launch', arena_scandal: 'arena', benchmax_exposed: 'arena', price_war: 'exchange', poach: 'night', distilled_by_others: 'night', distill_ban: 'night', small_ready: 'night', first_release_hint: 'night', open_question: 'night', reasoning_race: 'night', tavern: 'outing', integration: 'outing',
  big_customer: 'exchange', gov_contract: 'hearing', data_leak: 'datacenter', dc_fire: 'datacenter', whistleblower: 'night', media_interview: 'launch', license_fork: 'outing', talent_join: 'night', regulator_talk: 'hearing', smuggle_offer: 'port', smuggle_exposed: 'port' };
export function bgFor(v) {
  if (v.kind === 'strategy') return BG.strategy;
  const k = v.kind === 'super' ? v.bg || 'gala' : v.kind === 'world' ? WORLD_BG[v.wtype] : v.kind === 'history' ? 'night' : v.kind === 'goal' ? 'arena' : EVENT_BG[v.id];
  return BG[k] || (v.kind === 'world' ? BG.gala : BG.lab);
}
const thumb = (src, variant) => src.replace('/characters/', '/thumbs/').replace(/\.png$/, `-${variant}.webp`);
export function art(id, variant = 'card', emotion = 'neutral') {
  const c = characterById(id);
  if (!c) return '';
  const sp = c.sprites || {};
  return thumb(sp[emotion] || sp.neutral || c.src, variant);
}
// 虚构公司的身份不是美术角色 ID；缺立绘时明确占位，不借别家人物冒充或写回经营状态。
export function stagePortrait(id, name, emotion = 'neutral') {
  const src = art(id, 'stage', emotion);
  return src ? `<img src="${src}" alt="${esc(name)}" />` : '<span class="stage-placeholder" role="img" aria-label="角色立绘未配置"><span aria-hidden="true">◇</span><b>角色立绘未配置</b></span>';
}
export const face = (id, cls = '') => {
  const src = art(id, 'face');
  return src ? `<img class="face ${cls}" src="${src}" alt="" loading="lazy" />` : `<span class="face face--blank ${cls}"></span>`;
};
export function hasEmotion(id, e) { return !!characterById(id)?.sprites?.[e]; }

const ICONS = {
  train: '<path d="M6 5v14M18 5v14M3 9v6M21 9v6M6 12h12"/>',
  data: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  maintain: '<path d="M14.7 6.3a4 4 0 0 0 5 5L11 20a2.1 2.1 0 0 1-3-3l8.7-8.7a4 4 0 0 0-2-2Z"/>',
  research: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14Zm0 0A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  eval: '<path d="M4 20V10m6 10V4m6 16v-7m4 7H2"/>',
  release: '<path d="M12 2c3 3 5 7 5 11l-5 5-5-5c0-4 2-8 5-11Zm0 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM7 13l-3 2 1 4 3-1m9-5 3 2-1 4-3-1"/>',
  push: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  next: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  play: '<path d="M7 5v14l11-7-11-7Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  cash: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2m0 8v2"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/>',
  spark: '<path d="m12 2 2.6 6.9L22 12l-7.2 2.8L12 22l-2.6-7.2L2 12l7.4-3.1L12 2Z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8M15 7h6v6"/>',
  flag: '<path d="M5 21V4m0 0h12l-2.5 4L17 12H5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  scale: '<path d="M12 3v18M7 21h10M5 7h14M5 7l-3 6a3 3 0 0 0 6 0L5 7Zm14 0-3 6a3 3 0 0 0 6 0l-3-6Z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  news: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>',
  auto: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  sword: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/>',
};
export const icon = (name, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

export const MOD_LABEL = Object.fromEntries(Object.entries(MODALITIES).map(([k, v]) => [k, v.label]));
export const COUNTRY = { CN: '中国', US: '美国', EU: '欧洲' };
export const MORALE = { '-2': '低迷', '-1': '疲惫', 0: '平稳', 1: '良好', 2: '高涨' };
export const RIGHTS_TONE = { public: 'ok', permissive: 'ok', licensed: 'ok', consented: 'ok', unclear: 'warn', tos: 'bad', pirated: 'bad' };
export const benchUnit = b => (b.kind === 'elo' ? '' : b.kind === 'score10' ? '/10' : b.kind === 'score5' ? '/5' : '%');
export const fmtScore = (b, v) => (b.kind === 'elo' ? String(Math.round(v)) : `${v}${benchUnit(b)}`);
