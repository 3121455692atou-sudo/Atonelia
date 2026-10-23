// 公司策略完成卡（kind strategy，规格 A11 的“完成卡片”）：标题、效果清单（引擎给的白话）、路线变化前后、
// 可以争取的型号名和“现实中：……”。背景用 BG.strategy（沿用营地那张图）。没有选项时点“好”继续。
import * as E from '../../engine.js';
import { esc, bgFor } from '../fmt.js';
import { openLayer, waitFor } from '../state.js';

export async function play(S, view) {
  const lines = String(view.text ?? '').split('\n').map(x => x.trim()).filter(Boolean);
  const node = E.strategyOptions(S).find(x => x.id === view.id)?.node ?? null;
  const choices = view.choices?.length ? view.choices : [{ id: 'ok', label: '好', hint: '' }];
  const root = openLayer(`<div class="ev ev--strategy">
    <div class="ev-art" style="--bg:url('${bgFor({ ...view, kind: 'strategy' })}')"></div>
    <div class="ev-head"><span class="ev-tag">${esc(view.tag || '公司策略')}</span><h3>${esc(view.title || node?.title || '公司策略完成')}</h3></div>
    ${lines.map(x => `<p class="ev-text ev-strategy-line">${esc(x)}</p>`).join('')}
    <div class="ev-choices">${choices.map(c => `<button class="choice" data-choice="${esc(c.id)}"><b>${esc(c.label)}</b>${c.hint ? `<small>${esc(c.hint)}</small>` : ''}</button>`).join('')}</div>
  </div>`, 'overlay--event overlay--strategy');
  const b = await waitFor(root, '[data-choice]');
  return b.dataset.choice;
}
