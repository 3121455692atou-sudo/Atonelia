// 后台 · 算力：在途订单、集群、算力分配（出租｜推理｜训练按作业分色｜闲置，规格 T4.1）、各型号显卡（买、租、退、卖）、灰色渠道。
import * as E from '../../engine.js';
import { GPUS, RENT_FACTOR, gpuAvailable, gpuRentable, gpuMarkup, fmtDate } from '../../data/core.js';
import { RENT_LEAD } from '../../data/supply.js';
import { HW_CREDITS } from '../../data/hardware_gen.js';
import { inDays, daysBetween } from '../../engine.js';
import { esc, usd, count } from '../fmt.js';
import { act, after } from '../act.js';
import { getWorld } from '../state.js';
import { allocBar } from './train.js';

// 自洽特有的算力价：都经 P() 的口子读，不直接碰世界对象。M2 之前没有交易所，这里只报价和管制。
function soloPrices(S) {
  const P = E.P();
  const probe = S.date >= '2025-01' ? 'B200' : 'H100';
  const cnOk = P.gpuAvailable(probe, S.date, 'CN');
  const usOk = P.gpuAvailable(probe, S.date, 'US');
  const exportOn = !cnOk && usOk;
  const month = Number(S.date.slice(5, 7));
  const q = `Q${Math.ceil(month / 3)}`;
  const ids = ['H100', 'H200', 'B200'].filter(id => GPUS[id]);
  return `<div class="card solo-compute"><div class="card-head"><b>全球算力市场价格</b><small>${esc(S.day.slice(0, 4))} 年 ${q} · 季末统一结算</small></div>
    <p class="muted">全球算力市场统一撮合：每季度末根据全行业订单统一分配并结算价格。头部采购会推高现货价格。此处展示 ${GPUS[probe]?.label || probe} 等主流芯片的基准参考价。</p>
    <ul class="kv solo-price-list">
      <li><span>季末统一定价 · ${esc(GPUS[probe]?.label || probe)}</span><b>${usd(P.gpuPrice(S, probe))}</b></li>
      <li><span>云端租用现货价 · ${esc(GPUS[probe]?.label || probe)}</span><b>${usd(P.rentPrice(S, probe))}/月</b></li>
      <li><span>持仓显卡平均月租</span><b>${usd(P.averageRent(S))}/月</b></li>
    </ul>
    <p class="${exportOn ? 'warn solo-export' : 'muted'}">出口管制：${exportOn ? `生效中。受限地区企业无法直接采购 ${esc(GPUS[probe]?.label || probe)} 等先进制程显卡，需通过合规特批或替代方案解决。` : '当前无限制措施。'}</p>
    <div class="solo-price-grid">${ids.map(id => `<div><span>${esc(GPUS[id].label)}</span><b>买 ${usd(P.gpuPrice(S, id))}</b><small>租 ${usd(P.rentPrice(S, id))}/月</small></div>`).join('')}</div>
  </div>`;
}

export function render(S) {
  const gpus = E.clusterGpus(S);
  const types = Object.keys(GPUS).filter(g => gpuAvailable(g, S.date, S.company.country));
  const rentable = Object.keys(GPUS).filter(g => gpuRentable(g, S.date, S.company.country, S.flags.overseasRent));
  const f = RENT_FACTOR[Math.min(2026, Math.max(2023, Number(S.date.slice(0, 4))))];
  const shown = Object.keys(GPUS).filter(k => gpus[k] || rentable.includes(k));
  const total = Object.values(gpus).reduce((a, n) => a + n, 0);
  const coming = {};
  for (const o of S.orders) if (o.ref && GPUS[o.ref]) coming[o.ref] = (coming[o.ref] || 0) + o.n;
  const inflight = S.orders.filter(o => o.kind === 'gpu' || o.kind === 'rent' || o.kind === 'smuggle');
  return `<h2>算力</h2>
    <p class="muted">硬件交付周期：先进制程芯片供不应求，新品上市初期排期与配额最为紧张；云端租用约 ${RENT_LEAD} 天交付开通，每月配额受供应上限约束。</p>
    ${getWorld() ? soloPrices(S) : ''}
    ${inflight.length ? `<div class="card wide"><div class="card-head"><b>在途订单</b><small>${inflight.length} 笔</small></div><ul class="kv">${inflight.map(o => `<li><span>${{ gpu: '采购', rent: '租用', smuggle: '转运' }[o.kind]} ${count(o.n)} 张 ${esc(GPUS[o.ref].label.replace(/（.*?）/, ''))}</span><b>${o.eta.slice(5).replace('-', '/')}（${inDays(daysBetween(S.day, o.eta))}）</b></li>`).join('')}</ul></div>` : ''}
    <div class="card hw-cluster" style="--bg:url('${hwPhoto('rack')}')"><div class="hw-cluster-text"><b>集群规模</b><span>${count(total)} 张卡 · 健康度 ${Math.round(S.health)} · 训练算力 ${(E.trainFlops(S) / 1e21).toFixed(0)} H100·月 / 月</span></div>${credit('rack')}</div>
    <div class="card"><div class="card-head"><b>算力分配</b><small>${count(total)} 张卡</small></div>
      ${allocBar(S)}
      <label class="slider">自用算力中的推理份额 <input type="range" min="5" max="90" value="${Math.round(S.inferShare * 100)}" data-infer /> <b>${Math.round(S.inferShare * 100)}%</b></label>
      <label class="slider">对外出租（ToB 算力供应） <input type="range" min="0" max="${Math.round(Object.values(gpus).reduce((a, b) => a + b, 0) * 0.5)}" step="64" value="${E.leaseGpus(S)}" data-lease /> <b>${count(E.leaseGpus(S))} 张</b></label>
      <p class="muted">对外出租的显卡将从集群可用算力中扣减，按市场价约 85 折及实际出租天数结算收入，不参与自用训练与推理。剩余算力按上方比例分配给在线推理与训练。</p>
      <p class="muted">训练卡在各项作业之间按优先级自动分配，未分配的计为闲置算力。<button class="link-btn" data-goto="train">训练卡怎么分去「训练」页 ›</button></p></div>
    <div class="hw-grid">${shown.map(k => {
      const g = GPUS[k];
      const can = types.includes(k);
      const canRent = rentable.includes(k);
      const mk = gpuMarkup(k, S.date, S.company.country) * (can ? 1 : 1.4);
      const tag = can ? (mk > 1 ? '<span class="pill warn">含 25% 关税</span>' : '<span class="pill ok">可采购</span>') : canRent ? '<span class="pill warn">仅海外租用 +40%</span>' : '<span class="pill bad">买不到</span>';
      return `<article class="hw-card${can || canRent ? '' : ' is-off'}">
        <figure><img src="${hwPhoto(g.photo)}" alt="${esc(g.label)}" loading="lazy" />${g.photoNote ? `<figcaption>${esc(g.photoNote)}</figcaption>` : ''}</figure>
        <div class="hw-body"><div class="hw-title"><b>${esc(g.label)}</b>${tag}</div>
          <ul class="hw-spec"><li><span>训练</span><b>${(g.flops / 1e21).toFixed(2)}× H100</b></li><li><span>推理</span><b>${g.infer.toFixed(2)}× H100</b></li><li><span>单价</span><b>${usd(g.price * mk)}</b></li><li><span>租金</span><b>${usd(g.rent * f * mk)}/月</b></li></ul>
          <p class="hw-own">自有 <b>${count(S.gpus.owned[k] || 0)}</b> · 租用 <b>${count(S.gpus.rented[k] || 0)}</b>${coming[k] ? ` · 在路上 <b>${count(coming[k])}</b>` : ''}</p>
          ${can ? `<p class="hw-lead">下单后约 ${E.gpuOrderInfo(S, k).lead} 天交货 · 本季度还能订 ${count(E.gpuOrderInfo(S, k).left)} 张</p>` : ''}${canRent ? `<p class="hw-lead">云上租用约 ${RENT_LEAD} 天开通 · 本月还能租 ${count(E.gpuOrderInfo(S, k, true).left)} 张</p>` : ''}
          <div class="ops">${can ? `<button class="btn btn--sm" data-gpu="buy" data-id="${k}" ${E.gpuOrderInfo(S, k).left ? '' : 'disabled'}>订 256（${usd(g.price * mk * 256)}）</button>` : ''}${canRent ? `<button class="btn btn--sm" data-gpu="rent" data-id="${k}" ${E.gpuOrderInfo(S, k, true).left ? '' : 'disabled'}>租 256</button>` : ''}${S.gpus.rented[k] ? `<button class="btn btn--sm" data-gpu="return" data-id="${k}">退租 256</button>` : ''}${S.gpus.owned[k] ? `<button class="btn btn--sm" data-gpu="sell" data-id="${k}">卖 256</button>` : ''}</div>
          ${credit(g.photo)}</div></article>`;
    }).join('')}</div>
    ${S.company.country === 'CN' ? '<p class="muted">出口管制：A100/H100 等不能再买，H800/A800 在 2023 年 10 月后也被禁，H20 在 2025 年 4 月到 7 月间暂停供货；2026 年起 H200 可以逐案审批进口，但要多付约 25%。B 系列和 Rubin 一直禁售。国产替代是昇腾 910B、910C 和 950。</p>' : ''}
    ${grayCard(S)}`;
}

// 灰色渠道：中间商找上门以后才出现。
function grayCard(S) {
  if (S.company.country !== 'CN' || !(S.seen?.smuggle_offer > 0 || S.gray)) return '';
  const g = S.gray || { total: 0 };
  const offers = E.smuggleOffers(S);
  const heat = ['平静', '有人在打听', '很紧'][E.grayHeatLevel(S)];
  const state = g.closed ? '渠道已经断了。' : g.closedUntil && S.date < g.closedUntil ? `渠道暂停到 ${fmtDate(g.closedUntil)}。` : !offers.length ? '现在官方渠道都买得到，没必要走这条路。' : '';
  return `<div class="card gray-card"><div class="card-head"><b>灰色渠道</b><span class="pill ${E.grayHeatLevel(S) ? 'bad' : 'warn'}">风声：${heat}</span></div>
    <p class="muted">通过第三方转运规避出口管制：货源极其有限，采购成本为官方定价的 1.5 至 3 倍。采购量过大将推高监管调查风险，可能面临罚没甚至列入实体清单。${g.total ? `累计转运购入 ${count(g.total)} 张。` : ''}</p>
    ${state ? `<p>${state}</p>` : `<ul class="gray-list">${offers.map(o => `<li><div><b>${esc(o.label)}</b><small>每张 ${usd(o.price)}（官方价的 ${o.mult} 倍）· 本月还剩 ${count(o.left)} 张</small></div>
      <div class="ops">${o.left ? `<button class="btn btn--sm" data-smuggle="${o.id}" data-n="64">买 64（${usd(o.price * 64)}）</button>${o.left > 64 ? `<button class="btn btn--sm" data-smuggle="${o.id}" data-n="${o.left}">买 ${count(o.left)}（${usd(o.price * o.left)}）</button>` : ''}` : '<span class="muted">本月没货了</span>'}</div></li>`).join('')}</ul>`}</div>`;
}

// 硬件照片与署名（Wikimedia Commons，按许可署名）。
const hwPhoto = id => new URL(`./assets/thumbs/hw-${id}.webp`, document.baseURI).href;
function credit(id) {
  const c = HW_CREDITS[id];
  return c ? `<small class="photo-credit">照片：<a href="${esc(c.source_url)}" target="_blank" rel="noopener">${esc(c.author)}</a> · <a href="${esc(c.license_url)}" target="_blank" rel="noopener">${esc(c.license)}</a></small>` : '';
}

export function click(S, t, { st, draw, guard }) {
  const go = t.closest('[data-goto]');
  if (go) { st.page = go.dataset.goto; draw(); return; }
  const gpu = t.closest('[data-gpu]');
  if (gpu) return guard(() => {
    const k = gpu.dataset.id;
    const a = gpu.dataset.gpu;
    if (a === 'buy' || a === 'rent') return after(act(S, 'buyGpu', { id: k, n: 256, rent: a === 'rent' }), r => ({ note: `${a === 'rent' ? '已租' : '已订'} ${r.n} 张，${inDays(daysBetween(S.day, r.eta))}${a === 'rent' ? '开通' : '到货'}` }));
    if (a === 'return') act(S, 'releaseGpu', { id: k, n: 256, rented: true });
    if (a === 'sell') act(S, 'releaseGpu', { id: k, n: 256, rented: false });
    return null;
  });
  const sm = t.closest('[data-smuggle]');
  if (sm) return guard(() => after(act(S, 'buySmuggled', { id: sm.dataset.smuggle, n: Number(sm.dataset.n) }), r => ({ note: `买到 ${r.n} 张，花了 ${usd(r.cost)}` })));
}
export function change(S, t, { guard }) {
  if (t.dataset.infer !== undefined) return guard(() => act(S, 'setInferShare', { v: Number(t.value) / 100 }));
  if (t.dataset.lease !== undefined) return guard(() => act(S, 'setLease', { n: Math.max(0, Math.round(Number(t.value)) || 0) }));
}
