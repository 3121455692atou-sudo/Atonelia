// 选择面板：跑分（可选用小模型跑、竞技场提交特调版）。
import * as E from '../../engine.js';
import { BENCHMARKS } from '../../data/benchmarks.js';
import { esc, icon, fmtScore } from '../fmt.js';

export function render(S) {
  const list = BENCHMARKS.filter(b => b.mod === S.mod && S.date >= b.from && (!b.cnOnly || S.company.country === 'CN'));
  const small = E.smallLive(S);
  return `<div class="picker">
    <div class="picker-head"><h3>跑分</h3><button class="icon-btn" data-close aria-label="关闭">${icon('close')}</button></div>
    <p class="muted">用在线模型跑一次评测并公开成绩。新榜单更能反映真实能力，老榜单很多模型都“见过题”。</p>
    ${small ? `<label class="toggle"><input type="checkbox" id="eval-small" /> 用小模型 ${esc(small.name)} 跑</label>` : ''}
    ${S.date >= '2023-05' && S.mod === 'llm' ? '<label class="toggle"><input type="checkbox" id="eval-variant" /> 竞技场提交对话风格特调版（分数更高，有被指刷榜的风险）</label>' : ''}
    <div class="pick-list">${list.map(b => {
      const pub = S.published[b.id];
      return `<button class="pick-row" data-pick="${b.id}"><div><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div>
        <div class="meta"><span>${b.kind === 'elo' ? `${b.items} 场对战` : `${b.items} 题`}</span>${pub ? `<span>上次 ${fmtScore(b, pub.score)} · ${pub.date}</span>` : '<span>未提交</span>'}</div></button>`;
    }).join('')}</div>
  </div>`;
}

// 勾选框要在面板关掉之前读。
export function pick(root, b) {
  const id = b.dataset.pick;
  const small = root.querySelector('#eval-small')?.checked;
  const variant = root.querySelector('#eval-variant')?.checked;
  return ['eval', { bench: id, role: small ? 'small' : 'flagship', arenaVariant: variant && id === 'arena' }];
}
