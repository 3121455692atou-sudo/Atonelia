// 主界面顶栏：日期、时间流速、下一个董事会目标、现金估值和技术积累、后台按钮。
import * as E from '../engine.js';
import { esc, usd, icon } from './fmt.js';
import { daysBetween, inDays } from '../engine.js';
import { clock, getWorld, getMp } from './state.js';

export function speedControls() {
  return `<div class="speed" role="group" aria-label="时间流速">
    <button class="speed-play ${clock.speed ? 'is-on' : ''}" data-act="speed-toggle" title="空格键" aria-label="${clock.speed ? '暂停' : '让时间走起来'}">${icon(clock.speed ? 'pause' : 'play')}<span>${clock.speed ? '暂停' : '继续'}</span></button>
    <span class="speed-pips">${[1, 2, 3, 4, 5].map(n => `<button class="pip ${n <= (clock.speed || clock.last) ? 'is-on' : ''} ${clock.speed ? '' : 'is-idle'}" data-act="speed" data-id="${n}" aria-label="速度 ${n}" title="速度 ${n}（数字键 ${n}）"></button>`).join('')}</span>
  </div>`;
}

// 联机的速度块（M.7）：四档，亮的是实际档位，带圈的是我的票；点一下就是投票。暂停写还剩几次，停着时写为什么停。
const MP_SPEED = ['3 秒一天', '2 秒一天', '1 秒一天', '半秒一天'];
const MP_WHY = { waiting: '等房主开始', recovery: '服务器刚恢复，等房主继续', offline: '大家都掉线了', drop: '有人掉线，等他回来', pause: '暂停中', end: '这一局结束了' };
export function mpControls(m) {
  const c = m.clock || {};
  const me = c.players?.find(p => p.seat === m.seat) || {};
  const limit = m.lobby?.settings?.pauses ?? 3;
  const isHost = m.lobby?.host === m.member;
  const left = isHost ? '不限' : `剩 ${Math.max(0, limit - (me.pauseUses || 0))} 次`;
  const why = c.paused ? (MP_WHY[c.reason] || '暂停中') : c.slow ? '有人在处理重大卡，全场放慢' : '';
  const dots = (c.players || []).map(p => `<i class="mp-dot${p.online ? ' is-on' : ''}${p.hosted ? ' is-hosted' : ''}" title="座位 ${p.seat + 1}${p.online ? ' 在线' : p.hosted ? ' 托管中' : ' 掉线'}"></i>`).join('');
  const n = getStateQueue();
  return `<div class="speed mp-speed" role="group" aria-label="联机时间">
    <button class="speed-play ${c.paused ? '' : 'is-on'}" data-act="${c.paused ? 'mp-resume' : 'mp-pause'}" title="${esc(why || '暂停（空格键）')}">${icon(c.paused ? 'play' : 'pause')}<span>${c.paused ? '继续' : `暂停 · ${left}`}</span></button>
    <span class="speed-pips">${MP_SPEED.map((l, i) => `<button class="pip ${i <= (c.speed ?? 1) && !c.paused ? 'is-on' : ''} ${me.vote === i ? 'is-vote' : ''} ${i > (c.speedMax ?? 3) ? 'is-capped' : ''}" data-act="mp-vote" data-id="${i}" title="投票：${l}${i > (c.speedMax ?? 3) ? '（超过房主的上限）' : ''}"></button>`).join('')}</span>
    <span class="mp-dots" title="在线">${dots}</span>
    ${why ? `<small class="mp-why">${esc(why)}</small>` : ''}
    <button class="mp-badge${n ? ' is-on' : ''}" data-act="mp-inbox" title="收件箱">${icon('mail')}<b>${n}</b></button>
    <button class="mp-badge${m.unread ? ' is-on' : ''}" data-act="mp-chat-toggle" title="聊天">${icon('chat')}<b>${m.unread || ''}</b></button>
  </div>`;
}
let queueOf = () => 0;
const getStateQueue = () => queueOf();

// 顶栏的策略芯片：进行中写标题和还剩几天；空闲时高亮“策略空闲”。点一下直接进后台的策略页（走 quick 动作）。
function strategyChip(S) {
  const cur = S.strategy?.cur;
  if (!cur) return `<button class="strategy-chip is-idle" data-act="quick" data-id="strategy" title="公司策略空闲，点开挑一项"><span class="strategy-chip-tag">${icon('flag')}<span>策略</span></span><b>策略空闲</b><small>去挑一项</small></button>`;
  const opt = E.strategyOptions(S).find(x => x.id === cur.id);
  const title = opt?.node?.title || '进行中的策略';
  const left = Math.max(0, Math.ceil(cur.need - cur.days));
  const paused = !!cur.paused;
  return `<button class="strategy-chip${paused ? ' is-paused' : ''}" data-act="quick" data-id="strategy" title="公司策略：${esc(title)}${paused ? `（暂停，还剩 ${left} 天）` : `，还剩 ${left} 天`}"><span class="strategy-chip-tag">${icon('flag')}<span>策略</span></span><b>${esc(title)}</b><small>${paused ? `暂停 ${left} 天` : `还剩 ${left} 天`}</small></button>`;
}

export function topBar(S) {
  queueOf = () => S.queue?.length || 0;
  const mp = getMp();
  const goal = S.goals.find(g => g.status === 'pending' && g.check.type !== 'final');
  const left = goal ? daysBetween(S.day, `${goal.date}-01`) : null;
  const solo = !!getWorld();
  const L = solo ? null : S.capital.listed;
  const warns = Math.max(0, Math.min(3, S.strikes || 0));
  const warn = warns > 0 ? ` · 警告 ${warns}/3` : '';
  return `
  <header class="topbar">
    <div class="date-block"><b>${S.day.slice(0, 4)}</b><span>年 ${Number(S.day.slice(5, 7))} 月 ${Number(S.day.slice(8, 10))} 日</span><small>${esc(S.company.company)}${mp ? ` · 联机 ${esc(mp.room)}` : solo ? ' · 自洽世界' : ''}</small></div>
    ${mp ? mpControls(mp) : speedControls()}
    ${goal ? `<div class="goal-card ${left <= 0 ? 'is-now' : left <= 60 ? 'is-soon' : ''}"><span class="goal-tag">董事会目标</span><div><strong>${esc(goal.title)}</strong><small>${esc(E.goalNeed(goal.check))} · ${left <= 0 ? '这个月检查' : `${inDays(left)}检查`}${warn}</small></div></div>` : `<div class="goal-card"><div><strong>走到 2026 年 10 月</strong><small>年度评审${warn}</small></div></div>`}
    <div class="res-block">
      ${strategyChip(S)}
      <span class="res" title="现金">${icon('cash')}<b>${usd(S.cash)}</b><small>现金</small></span>
      <span class="res" title="${L ? '股价' : S.company.kind === 'division' ? '月收入' : '估值'}">${icon('trend')}<b>${L ? `$${L.price.toFixed(2)}` : S.company.kind === 'division' ? usd(S.history.at(-1)?.revenue || 0) : usd(S.valuation)}</b><small>${L ? L.ticker : S.company.kind === 'division' ? '月收入' : '估值'}</small></span>
      <button class="res res--btn" data-act="quick" data-id="tech" title="技术积累：研究更快、预训练更稳更快、后训练更有效。点开看研究槽">${icon('spark')}<b>${Math.round(S.know)}</b><small>技术积累 · 研究 ${S.research.length}/${E.researchSlots(S)}</small></button>
      <button class="btn btn--office" data-act="office">${icon('menu')}<span>后台</span></button>
    </div>
  </header>`;
}
