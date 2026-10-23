// 选择面板：订数据（预训练语料、后训练数据、蒸馏更强的模型）。
import * as E from '../../engine.js';
import { RIGHTS } from '../../data/datasets.js';
import { dataLeadDays } from '../../data/supply.js';
import { daysBetween, inDays } from '../../engine.js';
import { esc, usd, pct, icon, RIGHTS_TONE } from '../fmt.js';
import { DISTILL_WATCH } from '../../data/exchange.js';

const SPREAD_COST = DISTILL_WATCH.SPREAD_COST;
const TERM_LABEL = { attrib: '要署名', royalty: '大户分成', noCompete: '禁止训练竞品' };
// 自洽和联机才有的读数：一包被查出的概率（风险条）、今年还能买几包、受限开源的条款（拿来蒸馏违约时标红）。
function extraMeta(o) {
  const out = [];
  if (o.risk !== undefined && o.risk !== null) {
    const r = Math.max(0, Math.min(1, o.risk));
    out.push(`<span class="risk-bar" title="一个 14 天的数据包被对方查出的概率"><i style="width:${Math.min(100, Math.round(r / 0.3 * 100))}%"></i></span><span class="${r >= 0.1 ? 'warn' : ''}">单包被查出约 ${pct(r)}</span>`);
  }
  if (o.packsLeft !== undefined && o.packsLeft !== null) out.push(`<span>今年还能买 ${o.packsLeft} 包</span>`);
  if (o.terms) {
    const on = Object.keys(TERM_LABEL).filter(k => o.terms[k]);
    out.push(on.length ? on.map(k => `<span class="lic-badge ${k === 'noCompete' ? 'bad' : ''}">${TERM_LABEL[k]}</span>`).join('') : '<span class="lic-badge">条款全不勾</span>');
  }
  return out.join('');
}

// 多久能到：生成订单（蒸馏、合成教材、API）按生成工期 genDays 写，推理卡放不下老师时直接说；其余按到货时间。
function leadText(o) {
  if (o.genDays === undefined) return `${inDays(dataLeadDays(o)).replace('后', '')}到`;
  return Number.isFinite(o.genDays) ? `约 ${o.genDays} 天到` : '推理卡放不下老师，下单后要等';
}
export function render(S) {
  const opts = E.dataOptions(S).filter(o => o.kind === 'pre' ? !S.data.acquired.includes(o.id) || o.ok : true);
  const pool = E.poolStats(S);
  const row = o => `<button class="pick-row ${o.ok ? '' : 'is-off'}" data-pick="${o.id}" ${o.ok && o.cost <= S.cash ? '' : 'disabled'}>
    <div><b>${esc(o.name)}</b><small>${esc(o.desc)}</small></div>
    <div class="meta">${o.kind === 'pre' ? `<span>${o.tokens}T token</span><span>质量 ${o.quality}</span>` : '<span>后训练数据</span>'}
      <span class="rights rights--${RIGHTS_TONE[o.rights]}">${esc(RIGHTS[o.rights]?.label || '')}</span><span>${o.cost ? usd(o.cost) : o.gpuMonths ? `占 ${o.gpuMonths} 张卡` : '免费'} · ${leadText(o)}</span>
      ${extraMeta(o)}
      ${o.ok ? '' : `<span class="bad">${esc(o.reason)}</span>`}</div></button>`;
  // 自洽和联机（M.5.2、M.5.3）：API 老师可以改用分散小号下单，多花 40%，被查出的概率减半，但查出按欺诈处理。
  const spread = o => ({ ...o, id: `${o.id}:spread`, name: `${o.name} · 分散小号`, cost: o.cost * SPREAD_COST, risk: o.riskSpread,
    desc: '把调用分散到一批小号上：多花 40%，被查出的概率减半；一旦被查出按欺诈处理，后果加倍。' });
  const pre = opts.filter(o => o.kind === 'pre' && o.ok);
  const post = opts.filter(o => o.kind === 'post' && !o.distill);
  const dist = opts.filter(o => o.distill).flatMap(o => (o.risk !== undefined && o.mode === 'api' ? [o, spread({ ...o, riskSpread: E.P().apiRisk(S, o.teacher, 'spread') })] : [o]));
  return `<div class="picker">
    <div class="picker-head"><h3>订数据</h3><button class="icon-btn" data-close aria-label="关闭">${icon('close')}</button></div>
    <p class="muted">下单当天付钱，整理、清洗、过审要一到三周，大型授权要几个月。语料池：${pool.tokens.toFixed(1)}T token · 平均质量 ${pool.quality.toFixed(2)}。预训练数据影响下一代底座，后训练数据影响后训练的效果。${S.orders.some(o => o.kind === 'data' || o.kind === 'distill') ? ` 在路上：${S.orders.filter(o => o.kind === 'data' || o.kind === 'distill').map(o => `${o.name}（${inDays(daysBetween(S.day, o.eta))}）`).join('、')}。` : ''}</p>
    ${pre.length ? `<h4>预训练语料</h4><div class="pick-list">${pre.map(row).join('')}</div>` : ''}
    <h4>后训练数据</h4><div class="pick-list">${post.map(row).join('')}</div>
    ${dist.length ? `<h4>蒸馏更强的模型</h4><p class="muted">数据见效快，但能力很难超过老师，团队的技术积累也会变慢（当前依赖度 ${pct(S.distillDep)}）。</p><div class="pick-list">${dist.map(row).join('')}</div>` : ''}
  </div>`;
}

export function pick(root, b) {
  return ['data', { id: b.dataset.pick }];
}
