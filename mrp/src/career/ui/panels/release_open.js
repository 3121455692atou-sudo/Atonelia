// 发布面板里“开源”那一行：按开源路线只读或可选（规格 B2）。
// 开闭看这一版的发布角色（relRole）：顶替在线旗舰的按路线锁定，只显示一句说明；副线和小模型自己选，勾选框默认取路线的 smallDefault。
// m 是要发布的模型，role 是它所在的流水线（'flagship' 训练线、'small' 小模型线），只用来给勾选框起 id（panels/release.js 的 pick 按 id 读）。
// opts.replace：发布面板勾了“顶替在线旗舰”（P3.U2 加）时传 true，按顶替后的角色判。
import * as E from '../../engine.js';
import { LICENSES } from '../../data/routes.js';
import { esc } from '../fmt.js';

export function render(S, m, role, opts = {}) {
  if (!m) return '';
  const line = E.releaseLine(S, m, { replace: !!opts.replace });
  const rule = E.releaseOpenRule(S, E.relRole({ line }));
  if (rule.open !== 'choice') return `<p class="muted">${esc(rule.why)}。</p>`;
  const id = role === 'small' ? 'rel-small-open' : 'rel-open';
  const checked = typeof opts.open === 'boolean' ? opts.open : rule.default;
  const side = role !== 'small' && line === 'side' ? '这一版比在线旗舰弱，作为副线发布。' : '';
  return `<label class="toggle"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''} /> 开源权重（${esc(LICENSES[rule.license] || '宽松许可')}）</label>
      <p class="muted">${side}${esc(rule.why)}。</p>`;
}
