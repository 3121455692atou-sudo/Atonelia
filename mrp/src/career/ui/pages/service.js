// 后台 · 服务：产品与定价、收入预估、负载（推理份额只在「算力」页调，这里放个链接，规格 T4.1）、高峰分流、内容策略、反代与防蒸馏、应用接入。
import * as E from '../../engine.js';
import { PRICE_TIERS, PRODUCTS, CODING_TOOLS, characterById, fmtDate } from '../../data/core.js';
import { esc, usd, pct, face } from '../fmt.js';
import { act } from '../act.js';
import { lineChart } from '../charts.js';

export function render(S) {
  const sv = S.service;
  const last = sv.last || {};
  const live = E.liveModel(S), small = E.smallLive(S);
  // 防蒸馏开关：有一款在线模型（旗舰或小模型）闭源就显示（规格 B3，和引擎 service.js 的 antiDistillShown 同一条规则）。
  const closedLive = [live, small].filter(m => m && !m.open);
  const prods = PRODUCTS[S.mod].filter(p => p.id !== 'gpu_lease');
  const tierSel = (id, key, val) => `<select data-tier="${id}" data-key="${key}">${Object.entries(PRICE_TIERS).map(([k, t]) => `<option value="${k}" ${k === val ? 'selected' : ''}>${t.label}</option>`).join('')}</select>`;
  const hist = S.history.slice(-24);
  return `<h2>服务</h2>
    <div class="card"><div class="card-head"><b>产品与定价</b><small>普惠走量，旗舰走利润</small></div>
      <table class="tbl"><thead><tr><th>产品</th><th>状态</th><th>定价</th><th>上月收入</th><th>份额</th></tr></thead><tbody>
      ${prods.map(p => { const pr = S.products[p.id]; const avail = p.from <= S.date; return `<tr><td>${esc(p.label)}${p.id === 'chat' && S.company.country === 'CN' ? `<small class="muted"> 备案：${{ none: '未提交', pending: '审核中', done: '已通过' }[sv.filing]}</small>${sv.filing === 'none' && pr.on && S.date >= '2023-08' ? ' <button class="btn btn--sm" data-op="filing" title="审核约 2 个月，安全对齐要不低于 50；没备案收不到国内对话的钱">提交备案</button>' : ''}` : ''}</td>
        <td>${avail ? `<label class="switch"><input type="checkbox" data-prod="${p.id}" ${pr.on ? 'checked' : ''} /><span></span></label>` : `<small class="muted">${fmtDate(p.from)} 出现</small>`}</td>
        <td>${avail ? tierSel(p.id, 'tier', pr.tier) : ''}</td><td>${usd(last.revenue?.[p.id] || 0)}</td><td>${last.share?.[p.id] !== undefined ? pct(last.share[p.id], 1) : '—'}</td></tr>`; }).join('')}
      ${small && S.products.api ? `<tr><td>API · 小模型 ${esc(small.name)}</td><td><label class="switch"><input type="checkbox" data-prod-small ${S.products.api.small !== false ? 'checked' : ''} /><span></span></label></td><td>${tierSel('api', 'smallTier', S.products.api.smallTier || 'budget')}</td><td></td><td>${last.share?.apiSmall !== undefined ? pct(last.share.apiSmall, 1) : '—'}</td></tr>` : ''}
      </tbody></table>
      ${S.company.country === 'CN' ? `<p class="muted">海外收入：${usd(last.overseas || 0)} / 月。性价比越高、实力越强，越能吃到海外市场。</p>` : ''}</div>
    ${renderPricingPreview(S)}
    <div class="card"><div class="card-head"><b>上月负载</b><small>推理需要 ${Math.round(last.needGpu || 0)} 张 H100 等效卡，可用 ${Math.round(last.capGpu || 0)}</small></div>
      ${lineChart([{ name: '负载率', points: hist.map(h => [h.date, Math.min(3, h.util || 0) * 100]) }, { name: '429 比例', points: hist.map(h => [h.date, (h.r429 || 0) * 100]), color: '#d9787a' }], { yFmt: v => `${Math.round(v)}%` })}
      <p class="muted">推理份额现在是自用卡的 ${Math.round(S.inferShare * 100)}%（出租的卡不算在内）。推理分得越多，训练越慢；负载超过 85% 就开始出现 429。月底结算按这个月每天的平均推理能力算。<button class="link-btn" data-goto="compute">推理份额去「算力」页调 ›</button></p></div>
    <div class="card"><div class="card-head"><b>高峰分流</b><small>${sv.routingUnlocked ? '' : '出现持续的 429 之后才会考虑这个方案'}</small></div>
      ${sv.routingUnlocked ? `<div class="radio">${[['full', '不分流'], ['quant_open', '量化版（公开说明）'], ['quant_secret', '量化版（不告知用户）'], ...(small ? [['distill_open', '小模型（公开说明）'], ['distill_secret', '小模型（不告知用户）']] : [])].map(([k, l]) => `<label><input type="radio" name="routing" value="${k}" data-routing ${sv.routing === k ? 'checked' : ''} /> ${l}</label>`).join('')}</div>
        <p class="muted">不告知用户的“降智路由”能多扛很多流量，但用户会自己测出来。${S.date >= '2025-08' ? 'GPT-5 路由风波之后，大家对这件事格外敏感。' : ''}</p>` : '<p class="muted">暂无。</p>'}</div>
    ${S.mod === 'llm' ? `<div class="card"><div class="card-head"><b>内容策略与社区</b><small>酒馆用户占比 ${pct(sv.tavern)}</small></div>
      <div class="radio">${[['strict', '严格'], ['standard', '标准'], ['lenient', '宽松']].map(([k, l]) => `<label><input type="radio" name="content" value="${k}" data-content ${sv.contentPolicy === k ? 'checked' : ''} /> ${l}</label>`).join('')}</div>
      <p class="muted">宽松能吸引角色扮演用户，调用量大，但未成年人和内容相关的官司也多。</p></div>
    <div class="card"><div class="card-head"><b>反代与防蒸馏</b><small>反代流量约 ${pct(sv.proxy, 1)}</small></div>
      ${sv.proxyUnlocked ? `<div class="radio">${[['none', '不管'], ['limit', '按账号限速'], ['ban', '封禁并轮换密钥'], ['reseller', '官方转售计划']].map(([k, l]) => `<label><input type="radio" name="proxy" value="${k}" data-proxy ${sv.proxyPolicy === k ? 'checked' : ''} /> ${l}</label>`).join('')}</div>` : '<p class="muted">风控还没发现成规模的反代。</p>'}
      ${closedLive.length ? `<label class="toggle"><input type="checkbox" data-anti ${sv.antiDistill === 'strict' ? 'checked' : ''} /> 严格防蒸馏（限速、封号、输出水印；每月约 30 万美元）</label>
        <p class="muted">保护的是还没开放权重的 ${closedLive.map(m => esc(m.name)).join('、')}。</p>` : `<p class="muted">${live || small ? '在线模型都开放了权重，蒸馏防不住，也不必防。' : '还没有在线模型。'}</p>`}</div>
    <div class="card"><div class="card-head"><b>应用接入</b><small>${{ none: '未开放', whitelist: '白名单', all: '对所有工具开放' }[sv.integrations.mode]}</small></div>
      <div class="tools">${CODING_TOOLS.map(t => `<span class="tool ${sv.integrations.tools.includes(t) || sv.integrations.mode === 'all' ? 'on' : ''}">${face(t)}${esc(characterById(t)?.name || t)}</span>`).join('')}</div>
      <p class="muted">${S.date < '2025-07' ? '编程 Agent 普及（2025 年中）之后，工具厂商才会来谈 Coding Plan 接入。' : '代码和 Agent 能力够强时，工具厂商会主动来谈。'}</p></div>` : ''}`;
}

// 服务页“当前配置收入预估”：按现在的配置估一整月，再把旗舰 API 换成三档价格各估一次。
// 只读：不写存档、不改上月报表、不动随机数（引擎 previewService）；挂在原来的定价和市场模型上。
export function renderPricingPreview(S) {
  const head = '<div class="card"><div class="card-head"><b>当前配置收入预估</b><small>改了定价、开关或推理份额，这里马上跟着变</small></div>';
  if (!E.liveModel(S)) return `${head}<p class="muted">还没有在线模型。模型发布上线后，这里会估算收入、负载，并对比 API 三档价格。</p></div>`;
  const now = E.previewService(S);
  const kpis = `<div class="mini-kpis"><span>月收入 <b>${usd(now.total)}</b></span><span>服务负载 <b>${pct(now.util, 1)}</b></span><span>被拒请求（429） <b>${pct(now.r429, 1)}</b></span></div>
    <p class="muted">按这个月的市场、现在的卡和配置估一整月：已扣掉过载被拒的请求，没扣成本；以后的发布、到货和对手的新动作都没算，月底结算可能不一样。</p>`;
  const api = S.products.api, def = PRODUCTS[S.mod].find(p => p.id === 'api');
  if (!api || !def) return `${head}${kpis}</div>`;
  if (def.from > S.date) return `${head}${kpis}<p class="muted">${fmtDate(def.from)} 之后才有 API，到时再对比三档价格。</p></div>`;
  const rows = Object.entries(PRICE_TIERS).map(([tier, t]) => {
    const f = E.previewService(S, { api: { on: true, tier } });
    const cur = api.on && api.tier === tier;
    return `<tr${cur ? ' class="is-on"' : ''}><td>${esc(t.label)}${cur ? ' · 现在' : ''}</td><td>${usd(f.revenue.api || 0)}</td><td>${pct(f.util, 1)}</td><td>${pct(f.r429, 1)}</td></tr>`;
  }).join('');
  const small = S.mod === 'llm' && E.smallLive(S) && api.small !== false ? '小模型的 API 收入也算在里面，它的价格不变。' : '';
  return `${head}${kpis}
    <div class="card-head"><b>旗舰 API 三档价格对比</b><small>${api.on ? '只换旗舰 API 的价格，其他产品照旧' : 'API 还没开，下表是开了以后的估算，不会替你打开'}</small></div>
    <table class="tbl"><thead><tr><th>定价</th><th>API 月收入</th><th>服务负载</th><th>被拒请求</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="muted">负载和被拒请求算的是全部服务。${small}这只是估算，涨价也可能把客户赶走。</p></div>`;
}

export function click(S, t, { st, draw, guard }) {
  const go = t.closest('[data-goto]');
  if (go) { st.page = go.dataset.goto; draw(); return; }
  if (t.closest('[data-op]')?.dataset.op === 'filing') guard(() => act(S, 'setProduct', { id: 'chat', patch: { on: true } }));
}
export function change(S, t, { guard }) {
  if (t.dataset.prod) return guard(() => act(S, 'setProduct', { id: t.dataset.prod, patch: { on: t.checked } }));
  if (t.dataset.prodSmall !== undefined) return guard(() => act(S, 'setSmallApi', { on: t.checked }));
  if (t.dataset.tier) return guard(() => act(S, 'setTier', { id: t.dataset.tier, tier: t.value, ...(t.dataset.key ? { key: t.dataset.key } : {}) }));
  // 推理份额的滑杆已经挪去「算力」页；这一行留着，外面直接发来的改动照样走 guard（只读时提示、不改）。
  if (t.dataset.infer !== undefined) return guard(() => act(S, 'setInferShare', { v: Number(t.value) / 100 }));
  if (t.dataset.routing !== undefined) return guard(() => act(S, 'setRouting', { mode: t.value }));
  if (t.dataset.content !== undefined) return guard(() => act(S, 'setPolicy', { key: 'contentPolicy', value: t.value }));
  if (t.dataset.proxy !== undefined) return guard(() => act(S, 'setPolicy', { key: 'proxyPolicy', value: t.value }));
  if (t.dataset.anti !== undefined) return guard(() => act(S, 'setPolicy', { key: 'antiDistill', value: t.checked ? 'strict' : 'standard' }));
}
