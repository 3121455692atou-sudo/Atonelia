// 事件播放：有剧本的先演一段视觉小说式对话，再给出平实的事件说明和选项。
import { characterById } from '../data/core.js';
import { esc, art, face, bgFor, icon, hasEmotion } from './fmt.js';
import { openLayer, waitFor } from './state.js';

const EMO = { 开心: 'happy', 得意: 'happy', 兴奋: 'happy', 慌张: 'worried', 哭: 'worried', 无语: 'worried', 委屈: 'worried', 心虚: 'worried', 认真: 'determined', 生气: 'determined', 震惊: 'worried', 平静: 'neutral' };

// 立绘用哪张图。名牌上的名字由引擎按事件月份写在每句台词的 name 里（game.js 的 speaker）。
function resolveSpeaker(S, who) {
  if (who === 'narr') return { id: null };
  if (who === 'self') return { id: S.persona.artId };
  if (who === 'small') return { id: S.persona.smallArtId || S.persona.artId };
  return { id: characterById(who)?.id || null };
}

export async function playEvent(S, view) {
  if (view.scene?.length) await playScene(S, view);
  const root = openLayer(cardHtml(S, view), `overlay--event overlay--${view.kind}`);
  const b = await waitFor(root, '[data-choice]');
  return b.dataset.choice;
}

function cardHtml(S, v) {
  return `<div class="ev ev--${v.kind}"><div class="ev-art" style="--bg:url('${bgFor(v)}')"></div>
    <div class="ev-head"><span class="ev-tag">${esc(v.tag)}</span>${v.date ? `<small class="muted">${esc(v.date)}</small>` : ''}<h3>${esc(v.title)}</h3></div>
    <p class="ev-text">${esc(v.text)}</p>
    ${v.lines?.length ? v.lines.map(l => `<div class="ev-line">${face(l.id)}<div><b>${esc(l.name)}</b><p>「${esc(l.text)}」</p></div></div>`).join('') : ''}
    ${v.fact ? `<details class="ev-fact"><summary>史实 · ${esc(v.fact.date)} · ${esc(v.fact.title)}</summary><p>${esc(v.fact.text)}</p>${v.fact.sources?.length ? `<p class="srcs">${v.fact.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)} ↗</a>`).join('')}</p>` : ''}<p class="muted">对话与选择为游戏演绎，不改写历史。</p></details>` : ''}
    <div class="ev-choices">${v.choices.map(c => `<button class="choice" data-choice="${esc(c.id)}" ${c.disabled ? 'disabled' : ''}><b>${esc(c.label)}</b>${c.hint || c.disabled ? `<small>${esc(c.hint || '')}${c.disabled ? `${c.hint ? ' · ' : ''}${esc(c.disabled)}` : ''}</small>` : ''}</button>`).join('')}</div>
  </div>`;
}

// 视觉小说：底部对话框，说话的人站到前排，点击推进，可跳过。
function playScene(S, v) {
  return new Promise(resolve => {
    const lines = v.scene;
    const cast = [...new Set(lines.map(l => l.who).filter(w => w !== 'narr'))].slice(0, 4);
    const bg = bgFor(v);
    const root = openLayer(`<div class="vn" style="--bg:url('${bg}')">
      <div class="vn-top"><span class="ev-tag">${esc(v.tag)}</span><b>${esc(v.title)}</b><button class="btn btn--ghost btn--sm" data-skip>跳过</button></div>
      <div class="vn-cast">${cast.map((w, i) => { const sp = resolveSpeaker(S, w); return sp.id ? `<img class="vn-char" data-who="${esc(w)}" src="${art(sp.id, 'stage')}" alt="" style="--i:${i};--n:${cast.length}" />` : ''; }).join('')}</div>
      <div class="vn-box" data-next><div class="vn-name"></div><p class="vn-text"></p><small class="vn-hint">点击继续 ▸</small></div>
    </div>`, 'overlay--vn');
    let i = 0;
    let typing = null;
    const nameEl = root.querySelector('.vn-name');
    const textEl = root.querySelector('.vn-text');
    function show() {
      const l = lines[i];
      const sp = resolveSpeaker(S, l.who);
      nameEl.textContent = l.name || '';
      nameEl.hidden = !nameEl.textContent;
      root.querySelector('.vn-box').classList.toggle('is-narr', l.who === 'narr');
      for (const img of root.querySelectorAll('.vn-char')) {
        const on = img.dataset.who === l.who;
        img.classList.toggle('is-on', on);
        if (on && l.emo && EMO[l.emo] && hasEmotion(sp.id, EMO[l.emo])) img.src = art(sp.id, 'stage', EMO[l.emo]);
      }
      const full = (l.emo && !EMO[l.emo] ? `（${l.emo}）` : '') + l.text;
      let k = 0;
      clearInterval(typing);
      textEl.textContent = '';
      typing = setInterval(() => { k += 2; textEl.textContent = full.slice(0, k); if (k >= full.length) { clearInterval(typing); typing = null; } }, 24);
      textEl.dataset.full = full;
    }
    function next() {
      if (typing) { clearInterval(typing); typing = null; textEl.textContent = textEl.dataset.full; return; }
      i += 1;
      if (i >= lines.length) return done();
      show();
    }
    function done() { clearInterval(typing); root.removeEventListener('click', onClick); resolve(); }
    function onClick(ev) {
      if (ev.target.closest('[data-skip]')) return done();
      if (ev.target.closest('[data-next]') || ev.target.closest('.vn')) next();
    }
    root.addEventListener('click', onClick);
    show();
  });
}
export { icon };
