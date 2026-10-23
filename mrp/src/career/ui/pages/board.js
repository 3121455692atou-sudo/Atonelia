// 后台 · 董事会目标：每一项的期限、要求和结果。失败规则和警告次数都从常量来。
import * as E from '../../engine.js';
import { BOARD_STRIKE_LIMIT } from '../../data/goals.js';
import { esc } from '../fmt.js';

// 同量级目标按做这个目标时的同量级对手数算名次要求（D1.1）。量级和检查时一样，取现在的在线 / 在练模型。
function rivalsAt(S, g) {
  if (g.check.type !== 'rank' || !g.check.classOnly) return null;
  const m = E.liveModel(S) || E.workingModel(S);
  const cls = m ? E.clsOf(m) : 'small';
  return E.leaderboard(S, g.check.bench, { date: g.date, cls }).rows.filter(r => !r.mine).length;
}

export function render(S) {
  const strikes = Math.max(0, S.strikes || 0);
  const items = S.goals.map(g => {
    const when = g.grace ? `${esc(g.due0 || '')} → ${esc(g.date)}` : esc(g.date);
    const grace = g.grace ? '<small class="goal-grace">宽限期：原定这个月检查，没有达成，往后挪了两个月</small>' : '';
    return `<li class="goal-${g.status}"><span>${when}</span><div><b>${esc(g.title)}${g.grace ? '（宽限期）' : ''}</b><p>${esc(E.goalNeed(g.check, rivalsAt(S, g)))}</p><small class="muted">${esc(g.desc)}</small>${grace}</div><em>${{ pending: '未到期', met: '达成', failed: '未达成' }[g.status] || '未到期'}</em></li>`;
  }).join('');
  return `<h2>董事会目标</h2>
    <div class="card"><p class="muted">董事会按月份检查这些目标。没达成时先给两个月宽限期；宽限期结束仍未达成，记一次警告。累计 ${BOARD_STRIKE_LIMIT} 次未达成会撤换管理层。每达成一个目标，可以抵掉一次警告。</p>
      <p class="muted">现在的警告：${strikes}/${BOARD_STRIKE_LIMIT}。宽限期最多算到游戏结束为止。</p></div>
    <ol class="goals">${items || '<li class="goal-pending"><span>—</span><div><b>还没有董事会目标</b></div><em>—</em></li>'}</ol>`;
}
