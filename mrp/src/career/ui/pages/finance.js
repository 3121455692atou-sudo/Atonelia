// 后台 · 财务：每月收入和支出、现金走势、上月收入和本月支出明细。
// 规格 K2：经营利润（含推理成本、研发和自有卡折旧）和现金变化分开写；折旧不扣现金（买卡时已经付过）。
import * as E from '../../engine.js';
import { usd } from '../fmt.js';
import { lineChart, stackBars } from '../charts.js';

export function render(S) {
  const h = S.history.slice(-18);
  const last = S.service.last || {};
  const c = E.monthlyCosts(S);
  const serve = last.serve || 0;
  const dep = E.monthlyDepreciation(S);
  const burn = c.total + serve - (last.total || 0);
  const profit = (last.total || 0) - c.total - serve - dep;
  const lastRow = S.history.at(-1);
  const REV = { chat: '对话会员', api: 'API', coding_plan: 'Coding Plan', reseller: '转售分成', subscription: '订阅', gpu_lease: '算力出租' };
  const OLD = { key: 'total', name: '未分项', color: '#c3ccd5' };
  // 收入按产品叠起来（老存档里没有分项的月份算“未分项”），虚线是当月总支出。
  const revKeys = [...new Set(h.flatMap(x => Object.keys(x.rev || {})))].filter(k => h.some(x => (x.rev?.[k] || 0) > 0));
  const keys = [...revKeys.map(k => ({ key: k, name: REV[k] || k })), ...(h.some(x => !x.rev) ? [OLD] : [])];
  const revRows = h.map(x => ({ date: x.date, parts: x.rev || { total: x.revenue } }));
  const COST = [{ key: 'serve', name: '推理成本', color: '#5f93b8' }, { key: 'rd', name: '研发开支', color: '#4f9474' }, { key: 'staff', name: '人工', color: '#8a78b8' }, { key: 'owned', name: '自有卡运维', color: '#c09a55' }, { key: 'rented', name: '租卡', color: '#d08a3a' }, { key: 'other', name: '律师费等', color: '#b5739d' }, ...(h.some(x => !x.cost) ? [OLD] : [])];
  const costRows = h.map(x => ({ date: x.date, parts: x.cost || { total: x.costs } }));
  const sz = { w: 440, h: 210 };
  return `<h2>财务</h2>
    <div class="grid2 grid2--wide">
      <div class="card"><div class="card-head"><b>每月收入</b><small>按产品叠起来，虚线是支出</small></div>${stackBars(revRows, keys, { ...sz, yFmt: v => usd(v), line: { name: '支出', values: h.map(x => x.costs) } })}</div>
      <div class="card"><div class="card-head"><b>每月支出</b><small>${usd(c.total)} / 月</small></div>${stackBars(costRows, COST, { ...sz, yFmt: v => usd(v) })}</div>
      <div class="card"><div class="card-head"><b>现金</b><small>${usd(S.cash)}</small></div>
        ${lineChart([{ name: '现金', points: h.map(x => [x.date, x.cash]) }], { ...sz, yFmt: v => usd(v), zero: true })}</div>
      <div class="card"><div class="card-head"><b>上月收入</b><small>${usd(last.total || 0)}</small></div>
        <ul class="kv">${Object.entries(last.revenue || {}).map(([k, v]) => `<li><span>${REV[k] || k}</span><b>${usd(v)}</b></li>`).join('') || '<li><span>暂无</span></li>'}</ul>
        <div class="card-head"><b>本月支出</b><small>${usd(c.total + serve)}</small></div>
        <ul class="kv"><li><span>推理成本（按服务掉的 token）</span><b>${usd(serve)}</b></li><li><span>研发开支（实验、数据、标注）</span><b>${usd(c.rd)}</b></li>
          <li><span>人工（${S.team} 人，含股权激励）</span><b>${usd(c.staff)}</b></li><li><span>自有 GPU 电费运维</span><b>${usd(c.owned)}</b></li><li><span>租用 GPU</span><b>${usd(c.rented)}</b></li><li><span>律师费</span><b>${usd(c.legal)}</b></li>${c.risk ? `<li><span>防蒸馏风控</span><b>${usd(c.risk)}</b></li>` : ''}
          <li><span>月度现金流</span><b class="${burn > 0 ? 'bad' : 'ok'}">${burn > 0 ? '-' : '+'}${usd(Math.abs(burn))}</b></li>${burn > 0 ? `<li><span>现金还能撑</span><b>${Math.floor(S.cash / burn)} 个月</b></li>` : ''}
          <li><span>自有卡折旧（不扣现金）</span><b>${usd(dep)}</b></li>
          <li><span>经营利润（含折旧）</span><b class="${profit < 0 ? 'bad' : 'ok'}">${profit < 0 ? '-' : '+'}${usd(Math.abs(profit))}</b></li>
          ${lastRow?.profit !== undefined && lastRow.revenue > 0 ? `<li><span>上月经营利润率</span><b class="${lastRow.profit < 0 ? 'bad' : 'ok'}">${Math.round(lastRow.profit / lastRow.revenue * 100)}%</b></li>` : ''}</ul>
        <p class="muted">AI 公司很少赚钱：推理、研发和抢人都在烧钱，主要靠融资撑着。</p></div>
    </div>`;
}
