// 后台 · 图鉴（规格 E10）：角色、美术与授权、对话设置三个子页。
// 子页用页内小标签切换，不弹窗；角色卡的“聊聊”在原位展开抽屉，抽屉里就是对话框，桌面和手机都整页纵向滚动。
// 对话设置也在这里：接口地址和模型名存 localStorage，密钥默认只在内存，勾了“本次会话记住”才进 sessionStorage。
import { CHARACTER_ROSTER } from '../../data/roster.js';
import { CREDITS } from '../../data/credits.js';
import { fmtDate } from '../../data/core.js';
import * as E from '../../engine.js';
import { esc, art } from '../fmt.js';
import {
  loadSettings, saveSettings, validateBaseUrl, getChatKey, setChatKey, clearChatKey, keyRemembered,
  askCharacter, TIMEOUT_MS, THROTTLE_MS, MAX_TEXT, EMOTIONS,
} from '../chat.js';

const TABS = [['characters', '角色'], ['art', '美术与授权'], ['chat', '对话设置']];
const CATEGORY = { model: '可育成模型', application: '工具 NPC', infrastructure: '设施 NPC' };
const KIND_LABEL = { legacy: '旧版署名', character: '角色立绘', background: '育成场景', 'event-background': '事件背景', hardware: '硬件照片' };
const tabOf = st => (TABS.some(([id]) => id === st?.archiveTab) ? st.archiveTab : 'characters');

// ---------- 角色 ----------
function cardHtml(c) {
  return `<article class="arch-card">
    <img class="arch-thumb" src="${art(c.id, 'card')}" alt="" loading="lazy" />
    <div class="arch-meta"><b>${esc(c.name)}</b><small>${esc(c.label)}</small></div>
    <small class="arch-belong">所属：${esc(CATEGORY[c.category] || 'NPC')}</small>
    <p class="arch-quote">「${esc(c.quote)}」</p>
    <button class="btn btn--sm" data-chat-open="${esc(c.id)}">聊聊</button>
  </article>`;
}

function messageHtml(m, c) {
  if (m.who === 'user') return `<div class="chat-msg chat-msg--me"><b>你</b><p>${esc(m.text)}</p></div>`;
  if (m.who === 'err') return `<div class="chat-msg chat-msg--err"><b>提示</b><p>${esc(m.text)}</p></div>`;
  const emo = EMOTIONS.includes(m.emotion) ? m.emotion : 'neutral';
  return `<div class="chat-msg chat-msg--char"><img class="chat-face" src="${art(c.id, 'face', emo)}" alt="" loading="lazy" /><div><b>${esc(c.name)}${m.offline ? '<small>（离线回应）</small>' : ''}</b><p>${esc(m.text)}</p></div></div>`;
}

function drawerHtml(S, st, c) {
  const cfg = loadSettings();
  const openai = !!cfg.base && !!getChatKey();
  const list = st.archiveChat?.[c.id] || [];
  const busy = st.chatBusy === c.id;
  return `<div class="arch-drawer" data-chat-id="${esc(c.id)}">
    <div class="arch-drawer-head"><b>和 ${esc(c.name)} 聊聊</b><button class="btn btn--ghost btn--sm" data-chat-close>收起</button></div>
    <p class="muted chat-note">${openai ? `会发到 ${esc(cfg.base)}，模型 ${esc(cfg.model || '（还没填）')}；${TIMEOUT_MS / 1000} 秒没有回复就停下。` : `还没开 BYOK，现在只用${esc(c.name)}自己的那句话回应。`}
      <button class="btn btn--ghost btn--sm" data-archive-tab="chat">${openai ? '改对话设置' : '去填对话设置'}</button></p>
    <div class="chat-log">${list.length ? list.map(m => messageHtml(m, c)).join('') : '<p class="muted chat-empty">还没有聊过。说一句话试试。</p>'}</div>
    ${busy ? '<p class="chat-note" role="status">正在等回复…</p>' : ''}
    <div class="chat-send"><textarea rows="2" data-chat-input placeholder="说点什么…" ${busy ? 'disabled' : ''}></textarea>
      <button class="btn btn--primary" data-chat-send="${esc(c.id)}" ${busy ? 'disabled' : ''}>发送</button></div>
    <p class="muted chat-note">对话只在这里显示，不改动游戏里的任何东西。</p>
  </div>`;
}

function charactersHtml(S, st) {
  const open = st.archiveOpen;
  const bits = [];
  for (const c of CHARACTER_ROSTER) {
    bits.push(cardHtml(c));
    if (open === c.id) bits.push(drawerHtml(S, st, c));
  }
  return `<p class="muted">名册里的角色按类别排在一起。点「聊聊」会在卡片下面原位展开抽屉，不弹出新窗口。</p>
    <div class="arch-grid">${bits.join('')}</div>`;
}

// ---------- 美术与授权 ----------
function creditHtml(c) {
  const link = c.url
    ? `<a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">来源 ↗</a>`
    : '<small class="muted">没有可核对的链接</small>';
  const lic = c.license_url
    ? ` <a href="${esc(c.license_url)}" target="_blank" rel="noopener noreferrer">许可原文 ↗</a>`
    : '';
  return `<li class="credit-row">
    <div class="credit-who"><b>${esc(c.who)}</b><small>${esc(c.what)}</small><span class="pill">${esc(KIND_LABEL[c.kind] || '鸣谢')}</span></div>
    <div class="credit-license"><span>${esc(c.license)}</span>${lic}${link}</div>
  </li>`;
}

function artHtml() {
  const count = CREDITS.length;
  return `<p class="muted">这里列出图鉴和界面里用到的美术、照片和它们的授权说法，一共 ${count} 条。找不到来源的条目会直接写“没有可核对的链接”。</p>
    <ul class="credit-list">${CREDITS.map(creditHtml).join('')}</ul>`;
}

// ---------- 对话设置 ----------
function chatSettingsHtml(st) {
  const cfg = loadSettings();
  const hasKey = !!getChatKey();
  return `<section class="chat-settings">
    <p class="muted">填一个 OpenAI 兼容的接口，就能和图鉴里的角色聊天。地址只收 https，或者本机的 http://localhost、http://127.0.0.1（带端口也行）。</p>
    <label class="chat-field"><span>接口地址</span><input type="url" inputmode="url" data-chat-field="base" value="${esc(cfg.base)}" placeholder="https://api.example.com/v1" autocomplete="off" spellcheck="false" /></label>
    <label class="chat-field"><span>模型名</span><input type="text" data-chat-field="model" value="${esc(cfg.model)}" placeholder="例如 gpt-4o-mini" autocomplete="off" spellcheck="false" /></label>
    <label class="chat-field"><span>密钥</span><input type="password" data-chat-field="key" value="" placeholder="${hasKey ? '已经填了，不显示' : 'sk-…'}" autocomplete="off" spellcheck="false" /></label>
    <label class="chat-check"><input type="checkbox" data-chat-remember ${keyRemembered() ? 'checked' : ''} /> <span>本次会话记住密钥</span></label>
    <label class="chat-check"><input type="checkbox" data-chat-context ${cfg.includeContext ? 'checked' : ''} /> <span>聊天时附带当前公司、日期和在线模型名</span></label>
    <p class="chat-warning">密钥只在你点「发送」时发给你填的地址，不进存档、不进导出。</p>
    <p class="muted">地址和模型名存在这个浏览器里；密钥默认只放在这次打开的内存里，勾了“本次会话记住”才放进这个标签页的会话存储，关掉标签页就没了。${hasKey ? '现在这次会话里已经有一把密钥。' : '现在还没有填密钥。'}</p>
    <div class="menu-actions"><button class="btn" data-chat-forget ${hasKey ? '' : 'disabled'}>忘掉密钥</button></div>
    <p class="muted">回复最多显示 ${MAX_TEXT} 字；两次发送至少隔 ${THROTTLE_MS / 1000} 秒，只在点「发送」时联网。角色能用的表情：${EMOTIONS.join('、')}。</p>
    ${st.archiveNotice ? `<p class="chat-notice" role="status">${esc(st.archiveNotice)}</p>` : ''}
  </section>`;
}

export function render(S, st = {}) {
  const tab = tabOf(st);
  return `<h2>图鉴</h2>
    <p class="muted">角色形象来自原作者的模型拟人作品；工具与设施角色是 NPC，不能育成。美术和授权在这里一并写清。</p>
    <div class="archive-tabs" role="tablist">${TABS.map(([id, label]) => `<button class="archive-tab ${tab === id ? 'is-on' : ''}" role="tab" aria-selected="${tab === id}" data-archive-tab="${id}">${label}</button>`).join('')}</div>
    ${tab === 'characters' ? charactersHtml(S, st) : tab === 'art' ? artHtml() : chatSettingsHtml(st)}`;
}

// 当前局面只给聊天当背景，不进游戏状态。
function contextOf(S) {
  const models = [];
  const live = E.liveModel(S);
  const small = E.smallLive(S);
  if (live?.name) models.push(live.name);
  if (small?.name && small.id !== live?.id) models.push(small.name);
  return { company: S.company?.company, date: fmtDate(S.date), models };
}

function sendReply(S, id, t, st, draw) {
  if (st.chatBusy) return;
  const drawer = t.closest('.arch-drawer');
  const text = String(drawer?.querySelector('[data-chat-input]')?.value || '').trim();
  if (!text) return;
  st.archiveChat ??= {};
  const list = (st.archiveChat[id] ??= []);
  list.push({ who: 'user', text });
  st.chatBusy = id;
  draw();
  askCharacter(id, text, { context: contextOf(S) })
    .then(r => {
      if (r.ok) list.push({ who: 'char', text: r.text, emotion: r.emotion, offline: !!r.offline });
      else list.push({ who: 'err', text: r.reason || '这次没聊成。' });
    })
    .catch(e => list.push({ who: 'err', text: `出了点问题：${e?.message || e}` }))
    .finally(() => { st.chatBusy = null; draw(); });
}

export function click(S, t, { st, draw } = {}) {
  if (!st || typeof draw !== 'function') return;
  const tab = t.closest('[data-archive-tab]');
  if (tab) { st.archiveTab = tab.dataset.archiveTab; st.archiveOpen = null; st.archiveNotice = ''; return draw(); }
  const open = t.closest('[data-chat-open]');
  if (open) {
    const id = open.dataset.chatOpen;
    st.archiveOpen = st.archiveOpen === id ? null : id;
    st.archiveChat ??= {};
    return draw();
  }
  if (t.closest('[data-chat-close]')) { st.archiveOpen = null; return draw(); }
  const send = t.closest('[data-chat-send]');
  if (send) return sendReply(S, send.dataset.chatSend, t, st, draw);
  if (t.closest('[data-chat-forget]')) {
    clearChatKey();
    st.archiveNotice = '这次会话里的密钥已经忘掉了。';
    return draw();
  }
}

// 输入框的 change 会在按钮的 click 之前触发；同步重画会把玩家刚点的按钮换掉，所以等这一轮事件走完再画。
const redrawSoon = draw => { try { setTimeout(draw, 0); } catch { draw(); } };

export function change(S, t, { st, draw } = {}) {
  if (!st || typeof draw !== 'function' || !t?.dataset) return;
  const field = t.dataset.chatField;
  if (field === 'base') {
    const raw = t.value.trim();
    if (raw) {
      const v = validateBaseUrl(raw);
      if (!v.ok) { st.archiveNotice = v.reason; return redrawSoon(draw); }
    }
    saveSettings({ base: raw });
    st.archiveNotice = raw ? '接口地址已经保存。' : '接口地址已经清空，之后会先用离线回应。';
    return redrawSoon(draw);
  }
  if (field === 'model') {
    saveSettings({ model: t.value.trim() });
    st.archiveNotice = '模型名已经保存。';
    return redrawSoon(draw);
  }
  if (field === 'key') {
    const key = String(t.value || '');
    const remember = !!t.closest('.chat-settings')?.querySelector('[data-chat-remember]')?.checked;
    if (key) setChatKey(key, remember);
    else clearChatKey();
    st.archiveNotice = key ? (remember ? '密钥已经放在这次会话里，关掉标签页就没了。' : '密钥只放在这次打开的内存里。') : '密钥已经清空。';
    return redrawSoon(draw);
  }
  if ('chatRemember' in t.dataset) {
    setChatKey(getChatKey(), !!t.checked);
    st.archiveNotice = t.checked ? '这次会话会记住密钥，关掉标签页就没了。' : '不再把密钥放进会话存储。';
    return redrawSoon(draw);
  }
  if ('chatContext' in t.dataset) {
    saveSettings({ includeContext: !!t.checked });
    st.archiveNotice = t.checked ? '聊天时会附带当前局面。' : '聊天时不再附带当前局面。';
    return redrawSoon(draw);
  }
}
