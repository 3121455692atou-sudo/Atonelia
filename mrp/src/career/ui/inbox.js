// 联机的收件箱（规格 M.6.4、M.7）：卡片不挡时间，有卡时出现在主界面最上面，每张写明期限和默认选项。
// 期限取较长的那个：10 个游戏日，或 45 秒现实时间；到期服务器按默认项处理（sys.autoResolve）。
// 点开一张：照单人的演出方式放（views/），选了以后发 resolveEvent（带下标）给服务器，回来的结果再显示。
import * as E from '../engine.js';
import { esc } from './fmt.js';
import { viewFor } from './views/index.js';
import { act } from './act.js';
import { getState, getMp, render, toast, openLayer, closeLayer, waitFor } from './state.js';
import { goalHtml, goalResultHtml } from './flow.js';
import { cardLeft } from './net.js';

// 默认项：服务器到期时选的那个（第一个能选、不是“激化”的；规则在 world/index.js 的 autoResolve）。
function defaultChoice(view) {
  const opts = (view?.choices || []).filter(c => !c.disabled);
  return opts[0]?.label ?? '默认处理';
}
const leftText = l => (l.days > 0 ? `还剩 ${l.days} 个游戏日` : l.secs > 0 ? `${l.secs} 秒后` : '马上') + '按默认项处理';

export function inboxHtml(S) {
  const m = getMp();
  if (!m || !S?.queue?.length) return '';
  const rows = S.queue.map((q, at) => {
    let view = null;
    try { view = E.currentEvent(S, at); } catch { view = null; }
    const card = m.inbox.cards?.find(c => c.at === at);
    const l = card ? cardLeft(m, card) : null;
    const urgent = l && l.days === 0 && l.secs <= 15;
    return `<li class="mp-card${card?.major ? ' is-major' : ''}${urgent ? ' is-urgent' : ''}">
      <div><span class="ev-tag">${esc(view?.tag || '事件')}</span><b>${esc(view?.title || '一张卡')}</b>
      <small>${l ? esc(leftText(l)) : '期限算出来以前不会自动处理'}：「${esc(defaultChoice(view))}」${card?.major ? ' · 重大：全场暂时放慢' : ''}</small></div>
      <button class="btn btn--primary btn--sm" data-act="mp-card" data-id="${at}">处理</button></li>`;
  }).join('');
  return `<section class="mp-inbox" aria-label="收件箱"><header><b>收件箱</b><small>${S.queue.length} 张 · 时间不停，到期按默认项处理</small></header><ol>${rows}</ol></section>`;
}

let playing = false;
// 打开第 at 张卡。播的是本地镜像里的视图；结果以服务器为准。
export async function openCard(at) {
  const S = getState();
  if (playing || !S?.queue?.[at]) return;
  playing = true;
  try {
    const view = E.currentEvent(S, at);
    const key = JSON.stringify(S.queue[at]);
    if (view.kind === 'goal') {
      const root = openLayer(goalHtml(view), 'overlay--event');
      await waitFor(root, '[data-choice]');
      if (JSON.stringify(getState().queue[at] ?? null) !== key) { closeLayer(); toast('这张卡已经按默认项处理过了'); return; }
      const res = await act(S, 'resolveEvent', { choiceId: 'check', at });
      if (res?.goal) {
        const r2 = openLayer(goalResultHtml(res), 'overlay--event');
        await waitFor(r2, '[data-next]');
      }
      closeLayer();
      return;
    }
    const choice = await viewFor(view.kind)(S, view);
    // 看卡的这会儿可能已经到期、被服务器按默认项处理了：下标对不上就不发。
    if (JSON.stringify(getState().queue[at] ?? null) !== key) { closeLayer(); toast('这张卡已经按默认项处理过了'); return; }
    const res = await act(S, 'resolveEvent', { choiceId: choice, at });
    if (res?.text) {
      const root = openLayer(`<div class="ev ev--result"><div class="ev-head"><span class="ev-tag">${esc(view.tag)}</span><h3>${esc(res.title)}</h3></div><p class="ev-pick">你选择了：<b>${esc(res.choice)}</b></p><p class="ev-result">${esc(res.text)}</p><button class="btn btn--primary btn--xl" data-next>继续</button></div>`, 'overlay--event');
      await waitFor(root, '[data-next]');
    }
    closeLayer();
  } catch (e) {
    closeLayer();
    toast(e?.message || String(e));
  } finally {
    playing = false;
    render();
  }
}
