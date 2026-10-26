// IPO 是独立决策，不是顾问代办。所有写操作仍由 act → 命令表 → 联机权威服务器执行。
import * as E from '../engine.js';
import { esc, usd, pct } from './fmt.js';
import { act } from './act.js';
import { getState, getMp, onRemoteState, openLayer, closeLayer, save, render, toast } from './state.js';

const signature = q => JSON.stringify([q.history, q.fraction, q.valuation, q.equityBefore, q.expectedDay, q.requirements.map(r => [r.id, r.ok, r.detail])]);
// 可独立回归的事务边界：预览/取消纯读取；双击去重；确认前检查最新条件与报价。
export function createIpoDecision(S, { getCurrent = () => S, execute = (s, f) => act(s, f === null ? 'startIpo' : 'startIpoIssue', f === null ? {} : { frac: f }), fixedFraction = false, onChange = () => {} } = {}) {
  const identity = [S.charId, S.start, E.P().mode].join('|');
  const d = { quote: E.ipoReview(S), fraction: 0.2, fixedFraction, pending: false, closed: false, error: '' };
  const current = () => {
    const s = getCurrent();
    if (!s || s !== S || s.status !== 'playing' || [s.charId, s.start, E.P().mode].join('|') !== identity) throw new Error('当前公司或对局已经变化，请重新打开上市决策');
    return s;
  };
  d.refresh = () => {
    if (d.closed || d.pending) return;
    try { d.quote = E.ipoReview(current(), d.fraction); } catch (err) { d.error = err.message; }
    onChange(d);
  };
  d.select = f => {
    if (d.closed || d.pending || d.fixedFraction || d.quote.history || ![0.1, 0.2, 0.3].includes(f)) return false;
    d.fraction = f; d.error = ''; d.refresh(); return true;
  };
  d.cancel = () => { if (d.closed || d.pending) return false; d.closed = true; return true; };
  d.confirm = async () => {
    if (d.closed || d.pending) return { confirmed: false };
    try {
      const s = current(), latest = E.ipoReview(s, d.fraction);
      if (!latest.ok) { d.quote = latest; d.error = latest.reason; onChange(d); return { confirmed: false }; }
      if (signature(latest) !== signature(d.quote)) {
        d.quote = latest; d.error = '条件或预计收益已经变化，请核对更新后的方案，再明确确认。'; onChange(d); return { confirmed: false };
      }
      d.pending = true; d.error = ''; onChange(d);
      const result = await execute(s, latest.fraction);
      d.closed = true;
      return { confirmed: true, result };
    } catch (err) {
      d.error = err?.message || String(err);
      return { confirmed: false };
    } finally { d.pending = false; if (!d.closed) onChange(d); }
  };
  return d;
}

export function ipoDecisionHtml(d, { event = false, multiplayer = false } = {}) {
  const q = d.quote;
  return `<div class="ev ipo-decision" aria-labelledby="ipo-decision-title">
    <div class="ev-head"><span class="ev-tag">重大资本决策 · ${q.history ? '史实模式' : '自洽交易所'}</span><h3 id="ipo-decision-title">审议 IPO 上市方案</h3></div>
    <p>启动上市后需经历 ${q.days} 天的上市审核与筹备期，预计于 ${esc(q.expectedDay)} 正式挂牌；上市流程启动后中途没有手动取消入口。</p>
    <div class="card"><div class="card-head"><b>当前上市条件</b><small>${q.ok ? '全部满足，仍由执行时重新校验' : '暂不满足'}</small></div>
      <ul class="kv">${q.requirements.map(r => `<li><span>${esc(r.label)}${r.detail ? `<small> · ${esc(r.detail)}</small>` : ''}</span><b class="${r.ok ? 'ok' : 'warn'}">${r.ok ? '满足' : esc(r.reason)}</b></li>`).join('')}</ul></div>
    <div class="card"><div class="card-head"><b>融资收益与持股变化</b><small>按当前估值 ${usd(q.valuation)} 估算</small></div>
      ${q.history ? '<p>史实规则：挂牌时按届时估值的 8% 到账融资款；不因 IPO 扣减创始团队持股。</p>' : `<p>发行价按挂牌时估值打 85 折。下列比例为公开发行的新增股本占比，创始团队股权按比例稀释。</p>${d.fixedFraction ? '<p>本次事件使用默认发行方案（20%）。如需比较 10% / 30% 方案，可先选「再等等」，后续在「资本」页审议。</p>' : `<div class="offers" role="group" aria-label="发行比例">${[0.1, 0.2, 0.3].map(f => `<button class="offer${q.fraction === f ? ' is-on' : ''}" data-ipo-frac="${f}" aria-pressed="${q.fraction === f}" ${d.pending ? 'disabled' : ''}><b>发行 ${pct(f)}</b><small>${q.fraction === f ? '当前方案' : '方案预览'}</small></button>`).join('')}</div>`}`}
      <ul class="kv"><li><span>预计募资（挂牌时到账）</span><b>${usd(q.proceeds)}</b></li><li><span>创始团队持股</span><b>${pct(q.equityBefore)} → ${pct(q.equityAfter)}</b></li></ul>
      <p class="muted">${q.history ? '预计募资 = 当前估值 × 8%。' : `预计募资 = 当前估值 × 85% × ${pct(q.fraction)} ÷ (1 − ${pct(q.fraction)})。`}最终募资金额将以挂牌当日实际估值为准。</p></div>
    <div class="card"><div class="card-head"><b>上市须知与风险</b></div><ul>
      <li>上市流程启动后没有手动取消入口，请确保公司日常现金充裕。</li>
      <li>挂牌前估值波动将直接影响募资金额；若遭遇市场泡沫破裂，未完成的 IPO 将被中止。</li>
      <li>${q.history ? '挂牌后股价按月随经营业绩与市场环境变动。' : '挂牌后股票进入公开市场交易，新增股份将按比例摊薄现有股权。'}</li>
      </ul><p class="muted">${multiplayer ? '联机模式下时间不会因打开此页暂停；最终结果以服务器为准。' : '上市筹备期间公司日常经营正常推进。'}</p></div>
    ${d.error ? `<p class="warn" role="alert">${esc(d.error)}</p>` : ''}
    <div class="menu-actions"><button class="btn" data-ipo-cancel ${d.pending ? 'disabled' : ''}>${event ? '返回事件，不启动' : '取消，暂不上市'}</button>
      <button class="btn btn--primary" data-ipo-confirm ${!q.ok || d.pending ? 'disabled' : ''}>${d.pending ? '等待权威确认…' : '确认启动 90 天上市流程'}</button></div>
  </div>`;
}

let active = null;
// event=true 只返回已确认的选择，仍由原事件 resolveEvent 命令执行；取消回原事件，不消费卡片。
export function openIpoDecision(S, { event = false, returnToCapital = false } = {}) {
  if (active) return active.promise;
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  const task = active = { promise };
  let root, observer, unsubscribe;
  const finish = async outcome => {
    if (active !== task) return;
    active = null;
    unsubscribe?.(); observer?.disconnect();
    const visible = root?.isConnected;
    if (visible) closeLayer();
    if (outcome.confirmed && !event && getState() === S) { save(); toast('已确认启动 IPO：90 天后按届时估值结算'); render(); }
    if (!outcome.confirmed && returnToCapital && visible && getState() === S) {
      const { openOffice } = await import('./office.js'); openOffice('capital');
    }
    resolve(outcome);
  };
  const paint = d => {
    if (root?.isConnected) root.querySelector('.sheet').innerHTML = ipoDecisionHtml(d, { event, multiplayer: !!getMp() });
  };
  const d = createIpoDecision(S, { getCurrent: () => getState(), fixedFraction: event, onChange: paint,
    ...(event ? { execute: () => ({ choice: 'start' }) } : {}) });
  root = openLayer(ipoDecisionHtml(d, { event, multiplayer: !!getMp() }), 'overlay--event overlay--ipo');
  root.addEventListener('click', async ev => {
    const t = ev.target;
    if (t.closest('[data-ipo-cancel]')) { if (d.cancel()) finish({ confirmed: false }); return; }
    const f = t.closest('[data-ipo-frac]');
    if (f) { d.select(Number(f.dataset.ipoFrac)); return; }
    if (t.closest('[data-ipo-confirm]')) { const out = await d.confirm(); if (out.confirmed) finish(out); else if (!root.isConnected && d.cancel()) finish({ ...out, dismissed: true }); }
  });
  unsubscribe = onRemoteState(() => d.refresh());
  if (typeof MutationObserver === 'function' && root.parentNode) {
    observer = new MutationObserver(() => { if (!root.isConnected && d.cancel()) finish({ confirmed: false, dismissed: true }); });
    observer.observe(root.parentNode, { childList: true });
  }
  return promise;
}
