// 单人 · 自洽世界的开局设置页（规格 M.2.1–M.2.3、M.7）。
// 单列、整页滚动；所有选项都在原位展开，不弹窗。这里只收集设置，真正的世界由 startSolo 交给 createWorld。
import * as E from '../../engine.js';
import {defaultPlaySetup,playSetupReady,renderPlaySetup,applyPlaySetup,validatePlaySetup} from '../panels/play_setup.js';
import { COMPANIES, MODALITIES, TIERS, characterById } from '../../data/core.js';
import { STANCE } from '../../data/routes.js';
import { CHARACTER_ROSTER } from '../../data/roster.js';
import { BRAND_BLACKLIST, BOT_COMPANIES } from '../../data/selfplay.js';
import { ACAD_START } from '../../data/academia.js';
import { RELEASES } from '../../data/rivals.js';
import { esc, art, icon } from '../fmt.js';

export const SOLO_TIERS = [
  { id: 'small', label: '小作坊', desc: '钱少、卡少，靠一个方向活下去' },
  { id: 'specialist', label: '初创', desc: '默认档：一支像样的团队和一批训练卡' },
  { id: 'major', label: '大厂', desc: '资源最多，起步就有一批卡和团队' },
];
export const SOLO_ROUTES = ['closed', 'open_family', 'delayed', 'open_restricted', 'open'];
export const SOLO_BOTS = { easy: '简单', normal: '普通', hard: '困难' };
export const SOLO_COUNTRIES = [['CN', '中国'], ['US', '美国'], ['EU', '欧洲']];
const ART_POOL = CHARACTER_ROSTER.filter(c => c.category === 'model');
const STRENGTHS = MODALITIES.llm.dims.slice(0, 6);
const DAY_MS = 86400000;

const norm = s => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[\s\-_·.]/g, '');
const LATIN = /^[A-Za-z]+$/;
const CJK_WORD = /^[\u3400-\u9fff]+$/;
const firstWord = s => String(s ?? '').trim().split(/[\s\-_·.]+/).filter(Boolean)[0] || '';
const REAL_COMPANY_NAMES = new Set(COMPANIES.flatMap(c => [c.company, ...String(c.company).split(' · ')]).map(norm));
const REAL_BRANDS = new Set(Object.values(E.ORG_BRANDS).flat().map(norm));
const REAL_MODEL_NAMES = new Set(RELEASES.flatMap(r => [r.name, firstWord(r.name)]).map(norm));
const BLACK = new Set(BRAND_BLACKLIST.map(x => String(x).toLowerCase()));

export function isPhoneWidth() {
  try { return typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(max-width: 760px)').matches; } catch { return false; }
}
export function defaultSolo(phone = isPhoneWidth(), playMode = null) {
  const keep = phone ? 8 : 12;
  return {
    playSetup:defaultPlaySetup(playMode), mode: 'zero', year: '2024', years: 2, count: keep, tier: 'specialist', bot: 'normal',
    name: '晨光智能', brand: '晨光', country: 'CN', strengths: ['code', 'math'], route: 'open_restricted',
    art: 'qwen', fork: 'deepseek', forkKeep: keep, showAcad: true,
  };
}

// 时长的实际结束月：不晚于 2026-10；当场把截到的月份写出来。
export function endInfo(year, years) {
  const start = Date.UTC(Number(year), 0, 1);
  const want = new Date(start + (Number(years) * 365 - 1) * DAY_MS);
  const cap = Date.UTC(2026, 9, 31);
  const end = want.getTime() > cap ? new Date(cap) : want;
  const endMonth = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}`;
  return {
    endMonth,
    capped: want.getTime() > cap,
    text: `实际到 ${end.getUTCFullYear()} 年 ${end.getUTCMonth() + 1} 月结束${want.getTime() > cap ? '（超过 2026 年 10 月的部分截掉）' : ''}`,
  };
}

// 公司名：2–16 个字、不能和 24 家真实公司或电脑公司重名。
export function companyError(name) {
  const n = String(name ?? '').trim();
  if ([...n].length < 2 || [...n].length > 16) return '公司名要 2 到 16 个字';
  if (REAL_COMPANY_NAMES.has(norm(n))) return `「${n}」和现实里的公司重名了，换一个吧`;
  if (BOT_COMPANIES.some(x => norm(x.name) === norm(n))) return '这个名字已经给电脑公司用了，换一个吧';
  return null;
}

// 品牌词：长度、通用词黑名单、真实品牌词、真实型号名、电脑公司。
export function brandError(brand) {
  const b = String(brand ?? '').trim();
  if (!b) return '品牌词不能是空的';
  if (LATIN.test(b)) {
    if (b.length < 3) return '英文品牌词至少 3 个字母';
  } else if (CJK_WORD.test(b)) {
    if ([...b].length < 2) return '中文品牌词至少 2 个字';
  } else {
    return '品牌词只能是一段英文单词或汉字，不要混数字和符号';
  }
  const low = b.toLowerCase();
  if (BLACK.has(low)) return `「${b}」是通用词，不能当品牌词`;
  if (REAL_BRANDS.has(norm(b))) return `「${b}」是真实公司的品牌词，换一个吧`;
  if (REAL_MODEL_NAMES.has(norm(b))) return `「${b}」是现实里的型号名，换一个吧`;
  if (BOT_COMPANIES.some(x => norm(x.brand) === norm(b))) return '这个品牌词已经给电脑公司用了，换一个吧';
  return null;
}

export function validDraft(d) {
  if (d.mode === 'fork') return !!(d.fork && d.forkKeep && d.year && d.years);
  return !companyError(d.name) && !brandError(d.brand) && d.strengths?.length === 2;
}

function chip(act, key, value, on, label, extra = '') {
  return `<button class="solo-chip ${on ? 'is-on' : ''}" data-act="${act}" data-key="${key}" data-value="${esc(value)}"${extra}>${esc(label)}</button>`;
}
function field(title, hint, body) {
  return `<div class="solo-field"><div class="solo-field-head"><b>${esc(title)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</div>${body}</div>`;
}
function inputRow(label, key, value, error, attrs = '') {
  return `<label class="solo-input"><span>${esc(label)}</span><input type="text" data-solo="${key}" value="${esc(value)}" ${attrs} />${error ? `<em class="solo-error" data-error="${key}">${esc(error)}</em>` : `<em class="solo-error" data-error="${key}"></em>`}</label>`;
}

// 国家的取舍（开局特质见 data/spirits.js）。中国公司明显更难：自洽局校准里，照大按钮玩的中国公司 0/6 进前一半，美国、欧洲各 5/6（M1e）。
const COUNTRY_NOTE = {
  CN: '中国：本土市场小，开局卡少、先进的卡买不到（出口管制），对话产品上线要先备案；好处是官司少、更容易打赢。难度最高。',
  US: '美国：市场最大，买卡最方便；版权和安全官司多，训练数据的来路要小心。',
  EU: '欧洲：市场和买卡都不受限；打官司的规则和美国一样。',
};
// 从零局里的电脑公司：同一开局档，按国家轮换。
export function botCompanies(count, tier) {
  return BOT_COMPANIES.slice(0, Math.max(0, count - 1)).map((x, i) => ({
    name: x.name, brand: x.brand, country: SOLO_COUNTRIES[i % SOLO_COUNTRIES.length][0], tier, kind: 'bot',
  }));
}

// 设置页 → createWorld 的参数。seed 由调用方给，测试里可以固定。
export function buildSettings(d, seed = 11) {
  const start = `${d.year}-01`;
  const days = Number(d.years) * 365;
  if (d.mode === 'fork') {
    return { automationVersion:6, mode: 'fork', seed, start, days, keep: Number(d.forkKeep), seats: [{ id: d.fork, kind: 'human' }], bot: d.bot };
  }
  const player = {
    name: String(d.name).trim(), brand: String(d.brand).trim(), country: d.country, tier: d.tier,
    kind: 'human', stance: d.route, bot: d.bot,
  };
  return { automationVersion:6, mode: 'zero', seed, start, days, companies: [player, ...botCompanies(Number(d.count), d.tier)] };
}

// 真的开一局：createWorld，再把玩家那家的立绘和两项擅长补上（createWorld 的 spec 不带这两项）。
export function startSolo(d, seed) {
  validatePlaySetup(d.playSetup);
  if (!validDraft(d)) throw new Error(companyError(d.name) || brandError(d.brand) || '还有没选好的地方');
  const settings = buildSettings(d, seed ?? ((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0));
  const world = E.createWorld(settings);
  const player = Object.values(world.companies).find(c => c.kind === 'human' && c.s);
  if (!player) throw new Error('开局时没找到你经营的那家公司');
  world.settings ??= {};
  world.settings.you = player.id;
  const s = player.s;
  if (d.mode === 'zero') {
    const r = characterById(d.art) || ART_POOL[0];
    // 立绘只写进 persona：s.company 会被当成自定义公司的 spec 存进世界存档，多写一项会让同一份档再读回来对不上。
    s.company.strengths = [...d.strengths];
    s.persona = { id: player.id, name: r.name, label: r.label, artId: r.id, smallArtId: null };
    const meta = (world.settings.companies || []).find(x => x.id === player.id);
    if (meta) { meta.art = r.id; meta.strengths = [...d.strengths]; }
  }
  E.initializeSoloPostPlans(world, player.id);
  applyPlaySetup(s,d.playSetup);
  return { world, s, playerId: player.id };
}

// ---------- 渲染 ----------
export function renderSolo(d) {
  const zero = d.mode === 'zero';
  const info = endInfo(d.year, d.years);
  const acad = ACAD_START[d.year]?.[d.tier];
  const cErr = companyError(d.name);
  const bErr = brandError(d.brand);
  const ok = validDraft(d) && playSetupReady(d.playSetup);
  return `<section class="solo-screen">
    <header class="solo-head">
      <button class="icon-btn" data-act="solo-back" aria-label="返回">${icon('back')}</button>
      <div><span class="eyebrow">SOLO · SELF-CONTAINED</span><h2>单人 · 自洽世界</h2>
        <p class="muted">你经营一家公司，其余公司由电脑经营。所有人同一套规则，从开局一路走到结束。</p></div>
    </header>
    <div class="solo-body">
      ${renderPlaySetup(d.playSetup,{prefix:'solo-play-setup'})}
      ${field('开局方式', '从零是自己起一家新公司；分岔是接手一家现实里的语言模型公司', `<div class="solo-chips">
        ${chip('solo-set', 'mode', 'zero', zero, '从零开局')}${chip('solo-set', 'mode', 'fork', !zero, '分岔开局')}
      </div>`)}
      ${field('开局年', '', `<div class="solo-chips">${['2023', '2024', '2025'].map(y => chip('solo-set', 'year', y, d.year === y, `${y} 年`)).join('')}</div>`)}
      ${field('时长', info.text, `<div class="solo-chips">${[[1, '1 年'], [2, '2 年（默认）'], [3, '3 年']].map(([n, label]) => chip('solo-set', 'years', n, Number(d.years) === n, label)).join('')}</div>
        <p class="solo-note ${info.capped ? 'is-warn' : ''}">${esc(info.text)}</p>`)}

      ${zero ? `
        ${field('公司总数', '包括你自己，电脑公司自动补位', `<div class="solo-range"><input type="range" min="3" max="12" step="1" value="${Number(d.count)}" data-solo="count" aria-label="公司总数" /><b>${Number(d.count)} 家</b></div>
          <small class="muted">电脑上默认 12 家；手机上默认 8 家，卡的话会在游戏里自动减少电脑公司。</small>`)}
        ${field('开局档', '所有公司同一档，资源按开局年发', `<div class="solo-chips">${SOLO_TIERS.map(t => chip('solo-set', 'tier', t.id, d.tier === t.id, t.label)).join('')}</div>
          <p class="solo-note">${esc(SOLO_TIERS.find(t => t.id === d.tier)?.desc || '')}</p>`)}
        ${field('电脑难度', '只改电脑多久想一次、想得多细，不加资源', `<div class="solo-chips">${Object.entries(SOLO_BOTS).map(([k, label]) => chip('solo-set', 'bot', k, d.bot === k, label)).join('')}</div>`)}
        ${field('学界起点', '开局时学界和开源社区最强的一款', `<p class="solo-acad">${Number.isFinite(acad) ? `q ${acad.toFixed(1)} · 社区开源基线 ${d.year}-01` : '这一档没有学界起点数据'}</p>`)}
        <div class="solo-card solo-mine">
          <div class="solo-card-head"><b>我的公司</b><small>名字和品牌词当场检查</small></div>
          ${inputRow('公司名', 'name', d.name, cErr, 'maxlength="16" placeholder="2 到 16 个字"')}
          ${inputRow('品牌词', 'brand', d.brand, bErr, 'maxlength="16" placeholder="英文至少 3 个字母，中文至少 2 个字"')}
          <div class="solo-field"><div class="solo-field-head"><b>国家</b></div><div class="solo-chips">${SOLO_COUNTRIES.map(([k, label]) => chip('solo-set', 'country', k, d.country === k, label)).join('')}</div><p class="solo-hint">${esc(COUNTRY_NOTE[d.country] || '')}</p></div>
          <div class="solo-field"><div class="solo-field-head"><b>两项擅长</b><small>选两项，给公司的经营风格用</small></div><div class="solo-chips">
            ${STRENGTHS.map(x => chip('solo-set', 'strength', x.key, d.strengths.includes(x.key), x.label)).join('')}
          </div></div>
          <div class="solo-field"><div class="solo-field-head"><b>开局路线</b><small>之后只能在公司策略里改</small></div><div class="solo-chips">
            ${SOLO_ROUTES.map(k => chip('solo-set', 'route', k, d.route === k, STANCE[k].label)).join('')}
          </div></div>
          <div class="solo-field"><div class="solo-field-head"><b>模型角色立绘</b><small>只有模型角色是拟人化的</small></div>
            <div class="solo-art-grid">${ART_POOL.map(c => `<button class="solo-art ${d.art === c.id ? 'is-on' : ''}" data-act="solo-set" data-key="art" data-value="${c.id}" title="${esc(c.name)}">
              <img src="${art(c.id, 'card')}" alt="" loading="lazy" /><span>${esc(c.name)}</span></button>`).join('')}</div>
          </div>
        </div>` : `
        ${field('接手哪一家', '只列语言模型公司；图像、音乐、语音那 4 家不进', `<div class="solo-fork-list">${COMPANIES.filter(c => c.modality === 'llm').map(c => `<button class="solo-fork ${d.fork === c.id ? 'is-on' : ''}" data-act="solo-set" data-key="fork" data-value="${c.id}">
          <b>${esc(c.company)}</b><small>${esc(TIERS[c.tier]?.label || c.tier)} · ${esc(c.country === 'CN' ? '中国' : c.country === 'EU' ? '欧洲' : '美国')}</small></button>`).join('')}</div>`)}
        ${field('在场家数', '其余公司冻结成只读的前人遗产，开局前的发布照旧可见', `<div class="solo-range"><input type="range" min="3" max="20" step="1" value="${Number(d.forkKeep)}" data-solo="forkKeep" aria-label="在场家数" /><b>${Number(d.forkKeep)} 家</b></div>
          <small class="muted">电脑上默认 12 家；手机上默认 8 家，卡的话会在游戏里自动减少电脑公司。</small>`)}
        ${field('电脑难度', '只改电脑多久想一次、想得多细，不加资源', `<div class="solo-chips">${Object.entries(SOLO_BOTS).map(([k, label]) => chip('solo-set', 'bot', k, d.bot === k, label)).join('')}</div>`)}
      `}

      <div class="solo-start">
        <p class="muted">${zero ? '开局后你就是这家公司的老板。先起名字，再看一眼开局资源。' : '开局后你接手这家公司，其余在场公司由电脑经营。'}</p>
        <button class="btn btn--primary btn--xl" data-act="solo-start" ${ok ? '' : 'disabled'}>开始</button>
      </div>
    </div>
  </section>`;
}

// 设置页的点击：改选项、换立绘、开始。start 由 app.js 处理（它要拿 world 和 s 去换屏幕）。
export function soloClick(d, el) {
  const act = el.dataset.act;
  if (act === 'solo-back') return { back: true };
  if (act === 'solo-start') return { start: true };
  if (act !== 'solo-set') return null;
  const key = el.dataset.key;
  const value = el.dataset.value;
  if (key === 'strength') {
    if (d.strengths.includes(value)) d.strengths = d.strengths.filter(x => x !== value);
    else {
      if (d.strengths.length >= 2) d.strengths.shift();
      d.strengths.push(value);
    }
    return { changed: true };
  }
  if (key === 'years') d.years = Number(value);
  else if (key === 'count') d.count = Number(value);
  else if (key === 'forkKeep') d.forkKeep = Number(value);
  else if (['mode', 'year', 'tier', 'bot', 'country', 'route', 'art', 'fork'].includes(key)) d[key] = value;
  return { changed: true };
}

// 输入框（公司名、品牌词）：边打边写回草稿；非目标字段返回 null，
// 合法输入返回空串以清除旧错误，非法输入返回中文原因。
export function soloInput(d, t) {
  const key = t.dataset.solo;
  if (key !== 'name' && key !== 'brand') return null;
  d[key] = t.value;
  return (key === 'name' ? companyError(d.name) : brandError(d.brand)) || '';
}

// 滑块（公司总数、在场家数）。
export function soloChange(d, t) {
  const key = t.dataset.solo;
  if (key !== 'count' && key !== 'forkKeep') return false;
  d[key] = Number(t.value);
  return true;
}
