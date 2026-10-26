// 后台 · 资本：估值或股价、融资、IPO；集团内的团队只看母公司股价。
import * as E from '../../engine.js';
import { esc, usd, pct } from '../fmt.js';
import { act, after } from '../act.js';
import { lineChart } from '../charts.js';
import { openIpoDecision } from '../ipo_decision.js';

export function render(S) {
  if (S.company.kind === 'division') {
    const parent = S.company.parent;
    const ser = parent ? E.tickerSeries(parent, S.start, S.date) : [];
    return `<h2>资本</h2><div class="card"><p>你们是 ${esc(S.company.company.split('·')[0])} 内部的团队，不能单独融资或上市。每年一月集团会根据表现批预算。</p>
      ${parent ? `<div class="card-head"><b>母公司股价 · ${esc(parent)}</b></div>${lineChart([{ name: parent, points: ser }], { yFmt: v => v.toFixed(0) })}` : ''}</div>`;
  }
  const L = S.capital.listed;
  const h = S.history.slice(-30);
  const offers = E.fundingOffers(S);
  const block = E.fundingBlock(S);
  const boost = E.fundBoost(S);
  const ipo = E.ipoCheck(S);
  const loan = E.loanOf(S), limit = E.borrowLimit(S), coll = E.collateralValue(S);
  // 融资、上市出结果的日子存在 S.due（到期日）。
  const when = k => (S.due?.[k] ? E.inDays(E.daysBetween(S.day, S.due[k])) : '近期');
  const offerLabel = o => (o.strategic ? `战略投资 · 出让 ${pct(o.dilution)}` : o.followOn ? `增发 · 出让 ${pct(o.dilution)}` : `出让 ${pct(o.dilution)}`);
  const roundHead = S.capital.round ? `正在谈：${offerLabel(S.capital.round)}，${when('funding')}出结果` : block ? esc(block) : '大约 2 个月出结果，能不能谈成看技术领先性、增长和热度';
  return `<h2>资本</h2>
    <p class="muted">前沿人工智能研发投入巨大，涵盖算力集群、高质语料与核心研发团队。股权融资是关键资金通道，两轮融资通常间隔半年以上；模型登顶 SOTA 或实现关键技术突破时，融资估值显著提升。</p>
    <div class="card"><div class="card-head"><b>${L ? `${esc(L.market)} · ${esc(L.ticker)}` : '估值'}</b><small>${L ? `股价 $${L.price.toFixed(2)} · 市值 ${usd(L.price * L.shares)}` : usd(S.valuation)} · 创始团队持股 ${pct(S.equity)}</small></div>
      ${L ? lineChart([{ name: L.ticker, points: L.history }], { yFmt: v => `$${v.toFixed(1)}` }) : lineChart([{ name: '估值', points: h.map(x => [x.date, x.valuation]) }], { yFmt: v => usd(v) })}</div>
    <div class="card"><div class="card-head"><b>${L ? '增发' : '融资'}</b><small>${roundHead}</small></div>
      ${boost ? `<p class="ok">${esc(boost.why)}：到 ${esc(boost.until)} 之前融资估值按 ${boost.mult} 倍谈，成功率也高一些。</p>` : ''}
      ${offers.length ? `<div class="offers">${offers.map(o => `<button class="offer${o.strategic ? ' offer--strategic' : ''}" data-fund="${o.dilution}"><b>${offerLabel(o)}</b><span>融资 ${usd(o.amount)}</span><small>${o.strategic ? '云厂商入股：之后一年租卡 85 折' : `投前 ${usd(o.pre)}`}</small></button>`).join('')}</div>` : ''}
      ${S.capital.rounds.length ? `<ul class="kv">${S.capital.rounds.map(r => `<li><span>${r.date}</span><b>${usd(r.amount)} · 投后 ${usd(r.post)}</b></li>`).join('')}</ul>` : ''}</div>
    <div class="card"><div class="card-head"><b>显卡抵押贷款</b><small>${loan > 0 ? `欠款 ${usd(loan)} · 每月利息 ${usd(loan * 0.12 / 12)}` : '年息 12%，按月付息'}</small></div>
      <p class="muted">以企业自有显卡作为资产抵押，贷款上限为评估回收价值的 50%（当前抵押物估值 ${usd(coll)}，尚可借入 ${usd(limit)}）。若显卡贬值触发追保，需追加保证金或处置抵押卡。</p>
      <div class="offers">${[0.25, 0.5, 1].map(f => `<button class="offer" data-borrow="${Math.floor(limit * f)}" ${limit * f >= 1 ? '' : 'disabled'}><b>借 ${usd(limit * f)}</b><small>${f === 1 ? '借满' : `额度的 ${pct(f)}`}</small></button>`).join('')}
        ${loan > 0 ? `<button class="offer" data-repay="${Math.ceil(Math.min(loan, Math.max(0, S.cash)))}" ${S.cash >= 1 ? '' : 'disabled'}><b>还 ${usd(Math.min(loan, Math.max(0, S.cash)))}</b><small>${S.cash >= loan ? '全部还清' : '能还多少还多少'}</small></button>` : ''}</div></div>
    ${!L ? `<div class="card"><div class="card-head"><b>IPO</b><small>${S.capital.ipo ? `上市流程中，${when('ipo')}挂牌` : ipo.ok ? '条件已满足' : esc(ipo.reason)}</small></div>
      <p class="muted">${S.company.country === 'CN' ? '国内 AI 公司常走港交所第 18C 章（特专科技公司）。' : '美国公司一般选纳斯达克。'}上市后股价随产品发布、行业跑分榜单、财务营收与法律风险综合波动，后续可通过定增筹集发展资金。</p>
      <button class="btn btn--primary" data-op="ipo" ${ipo.ok ? '' : 'disabled'}>审议上市方案（不立即执行）</button></div>` : ''}`;
}

export function click(S, t, { guard, st = {} }) {
  if (t.closest('[data-op]')?.dataset.op === 'ipo') {
    if (st.readOnly) return guard(() => { throw new Error('这一局已经结束了，后台只能看，不能改'); });
    return openIpoDecision(S, { returnToCapital: true });
  }
  const fund = t.closest('[data-fund]');
  if (fund) return guard(() => act(S, 'startFunding', { dilution: Number(fund.dataset.fund) }));
  const b = t.closest('[data-borrow]');
  if (b) return guard(() => after(act(S, 'borrow', { usd: Number(b.dataset.borrow) }), r => ({ note: `借到 ${usd(r.amount)}，年息 12%` })));
  const r = t.closest('[data-repay]');
  if (r) return guard(() => after(act(S, 'repay', { usd: Number(r.dataset.repay) }), x => ({ note: `还了 ${usd(x.amount)}${x.principal > 0 ? `，还欠 ${usd(x.principal)}` : '，贷款还清了'}` })));
}
