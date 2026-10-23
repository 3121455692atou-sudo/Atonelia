// 后台 · 法务：进行中的诉讼、风险、历史记录。
import * as E from '../../engine.js';
import { esc, usd, pct } from '../fmt.js';

export function render(S) {
  const m = E.liveModel(S);
  return `<h2>法务</h2>
    <div class="card"><div class="card-head"><b>进行中的诉讼</b></div>${S.legal.cases.length ? `<ul class="kv">${S.legal.cases.map(c => `<li><span>${esc(c.title)} · 索赔 ${usd(c.claim)}</span><b>还有 ${c.left} 个月 · 胜诉率约 ${pct(c.winp)}</b></li>`).join('')}</ul>` : '<p class="muted">没有。</p>'}</div>
    <div class="card"><div class="card-head"><b>风险</b></div><ul class="kv">
      <li><span>安全对齐</span><b class="${(m?.dims.safety || 0) < 65 ? 'warn' : ''}">${m ? m.dims.safety.toFixed(1) : '—'}</b></li>
      <li><span>所在地</span><b>${S.company.country === 'CN' ? '中国：安全诉讼压力较小，但面向公众需要备案' : '美国 / 欧洲：越出名，安全不过关的官司越多'}</b></li>
      <li><span>数据来源</span><b>${Object.keys(S.data.risky).length ? `${Object.keys(S.data.risky).length} 项有争议` : '干净'}</b></li>
      <li><span>高峰分流</span><b>${S.service.routing.endsWith('secret') ? '正在偷偷降智，随时可能被测出来' : '无隐瞒'}</b></li></ul></div>
    <div class="card"><div class="card-head"><b>历史记录</b></div>${S.legal.history.length ? `<ul class="kv">${S.legal.history.map(c => `<li><span>${esc(c.title)}（${c.opened}）</span><b>${esc(c.outcome)}</b></li>`).join('')}</ul>` : '<p class="muted">没有。</p>'}</div>`;
}
