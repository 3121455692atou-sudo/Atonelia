// 后台 · 新闻。行业大事带短剧（n.scene）：点「看当时的短剧」就地展开，不弹层，也不离开新闻页。
// 自洽模式下分两个标签：世界（world.news）和与我有关（s.news）。
import { characterById } from '../../data/core.js';
import { esc, face } from '../fmt.js';
import { getWorld } from '../state.js';

// 这句台词配哪张头像：self 是玩家的角色，small 是小模型，旁白没有头像。
function faceOf(S, who) {
  if (who === 'narr') return null;
  if (who === 'self') return S.persona?.artId ?? null;
  if (who === 'small') return S.persona?.smallArtId || S.persona?.artId || null;
  return characterById(who)?.id ?? null;
}
function sceneHtml(S, scene) {
  const lines = Array.isArray(scene) ? scene.filter(l => l && typeof l.text === 'string') : [];
  if (!lines.length) return '';
  const body = lines.map(l => (l.who === 'narr'
    ? `<p class="muted">${esc(l.text)}</p>`
    : `<div class="ev-line">${face(faceOf(S, l.who))}<div><b>${esc(l.name || '')}</b><p>「${esc(l.text)}」</p></div></div>`)).join('');
  return `<details class="ev-fact news-scene"><summary>看当时的短剧</summary><div style="display:grid;gap:6px;margin-top:8px">${body}</div></details>`;
}

function listHtml(S, list) {
  return `<ul class="news">${list.map(n => `<li class="news-${n.type}"><span>${n.day ? `${n.day.slice(0, 4)}<br>${Number(n.day.slice(5, 7))}/${Number(n.day.slice(8, 10))}` : n.date}</span><div><b>${esc(n.title)}</b><p>${esc(n.detail || '')}</p>${sceneHtml(S, n.scene)}</div></li>`).join('') || '<li class="muted">暂无。</li>'}</ul>`;
}

export function render(S, st = {}) {
  const W = getWorld();
  if (!W) return `<h2>新闻</h2>${listHtml(S, S.news)}`;
  const tab = st.newsTab === 'world' ? 'world' : 'me';
  const list = tab === 'world' ? (W.news || []) : (S.news || []);
  return `<h2>新闻</h2>
    <div class="news-tabs" role="tablist">
      <button class="${tab === 'world' ? 'is-on' : ''}" data-news-tab="world" role="tab" aria-selected="${tab === 'world'}">世界</button>
      <button class="${tab === 'me' ? 'is-on' : ''}" data-news-tab="me" role="tab" aria-selected="${tab === 'me'}">与我有关</button>
    </div>
    <p class="muted">${tab === 'world' ? '整个世界的公开消息：别家发布、学界跟进、行业大事。' : '只和你们公司有关的消息。'}</p>
    ${listHtml(S, list)}`;
}

export function click(S, t, { st, draw }) {
  if (!getWorld()) return;
  const tab = t.closest('[data-news-tab]');
  if (!tab) return;
  st.newsTab = tab.dataset.newsTab;
  draw();
}
