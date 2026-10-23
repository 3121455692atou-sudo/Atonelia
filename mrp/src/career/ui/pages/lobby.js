// 联机大厅（规格 M.6.9、M.7）：单列，整页滚动。没进房间时是“建房 / 加入”；进了房间从上往下是
// 房间码、座位表（真人、电脑、空位、待批准、是否就绪；同一 IP 多座位的提示只给房主看）、设置卡（只有房主能改）、我的公司卡、聊天。
// 开局以后（收到 init）换成主界面；中途申请接管电脑公司的人在这里等房主批准。名字和聊天一律当纯文本显示（esc）。
import { COMPANIES } from '../../data/core.js';
import { esc, icon } from '../fmt.js';
import { getMp, ui, render, toast } from '../state.js';
import { createRoom, joinRoom, rejoin, lastRoom, roomCmd, isHost, myMember } from '../net.js';

const COUNTRIES = [['CN', '中国'], ['US', '美国'], ['EU', '欧洲']];
const TIERS = [['small', '小作坊'], ['specialist', '初创'], ['major', '大厂']];
const BOTS = [['easy', '简单'], ['normal', '普通'], ['hard', '困难']];
const SPEEDS = ['3 秒一天', '2 秒一天', '1 秒一天', '半秒一天'];
const FORK_PICKS = COMPANIES.filter(c => c.modality === 'llm').map(c => [c.id, c.company]);
const FORK_MONTHS = ['2023-06', '2024-01', '2024-06', '2025-01', '2025-06'];

export const defaultDraft = () => ({
  mode: 'zero', start: '2024', forkStart: '2024-06', years: 2, humans: 2, bots: 4, keep: 12, tier: 'specialist', bot: 'normal',
  short: true, distill: true, poach: false, protectionDays: 120, speedMax: 3, pauses: 3, password: '', code: '', joinPassword: '',
});
// 草稿 → 服务器的房间设置（M.6.9）。
export function draftSettings(d) {
  return {
    mode: d.mode, start: d.mode === 'fork' ? d.forkStart : d.start, years: Number(d.years), humans: Number(d.humans),
    bots: d.mode === 'fork' ? 0 : Number(d.bots), keep: Number(d.keep), tier: d.tier, bot: d.bot,
    speedMax: Number(d.speedMax), pauses: Number(d.pauses),
    rules: { short: !!d.short, distill: !!d.distill, poach: !!d.poach, protectionDays: Number(d.protectionDays) },
  };
}
const fromSettings = s => ({
  ...defaultDraft(), mode: s.mode || 'zero', start: String(s.start || '2024').slice(0, 4), forkStart: String(s.start || '2024-06').slice(0, 7),
  years: s.years ?? 2, humans: s.humans ?? 2, bots: s.bots ?? 4, keep: s.keep ?? 12, tier: s.tier || 'specialist', bot: s.bot || 'normal',
  short: s.rules?.short !== false, distill: s.rules?.distill !== false, poach: !!s.rules?.poach, protectionDays: s.rules?.protectionDays ?? 120,
  speedMax: s.speedMax ?? 3, pauses: s.pauses ?? 3,
});

const opt = (list, cur) => list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('');
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => [a + i, String(a + i)]);
const field = (label, body, hint = '') => `<label class="mp-field"><span>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span>${body}</label>`;
const sel = (key, list, cur, dis = false) => `<select data-mp-set="${key}" ${dis ? 'disabled' : ''}>${opt(list, cur)}</select>`;
const check = (key, label, on, dis = false) => `<label class="mp-check"><input type="checkbox" data-mp-set="${key}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''} /> ${esc(label)}</label>`;

// 设置表单（建房时、房主在大厅里改设置时共用；别人看到的是只读的）。
function settingsForm(d, dis = false) {
  const zero = d.mode === 'zero';
  const total = Number(d.humans) + Number(d.bots);
  return `<div class="mp-grid">
    ${field('开局', sel('mode', [['zero', '从零'], ['fork', '分岔（接手真实公司）']], d.mode, dis))}
    ${zero ? field('开局年份', sel('start', [['2023', '2023'], ['2024', '2024'], ['2025', '2025']], d.start, dis)) : field('分岔月份', sel('forkStart', FORK_MONTHS.map(x => [x, x]), d.forkStart, dis))}
    ${field('时长', sel('years', [[1, '1 年'], [2, '2 年'], [3, '3 年']], d.years, dis))}
    ${field('真人', sel('humans', range(2, 8), d.humans, dis))}
    ${zero ? field('电脑公司', sel('bots', range(Math.max(0, 3 - d.humans), 12 - d.humans), d.bots, dis), `一共 ${total} 家`) : field('在场家数', sel('keep', range(Math.max(6, Number(d.humans)), 12), d.keep, dis))}
    ${field('电脑难度', sel('bot', BOTS, d.bot, dis))}
    ${zero ? field('开局档', sel('tier', TIERS, d.tier, dis), '人人同档') : ''}
    ${field('速度上限', sel('speedMax', SPEEDS.map((l, i) => [i, l]), d.speedMax, dis))}
    ${field('每人每年暂停', sel('pauses', range(0, 6), d.pauses, dis))}
    ${field('新手保护', sel('protectionDays', [[0, '不保护'], [60, '60 天'], [120, '120 天'], [180, '180 天']], d.protectionDays, dis), '进场后多少天内不能被做空、被挖人')}
  </div>
  <div class="mp-checks">${check('short', '允许做空', d.short, dis)}${check('distill', '允许闭源 API 蒸馏', d.distill, dis)}${check('poach', '允许挖人', d.poach, dis)}</div>`;
}

// ---------- 没进房间：建房 / 加入 ----------
function entryHtml() {
  const d = ui.mpDraft || (ui.mpDraft = defaultDraft());
  const last = lastRoom();
  return `<section class="solo-screen mp-screen">
    <header class="solo-head"><button class="icon-btn" data-act="mp-back" aria-label="返回">${icon('back')}</button>
      <div><span class="eyebrow">MULTIPLAYER</span><h2>联机</h2><p class="muted">2–8 个人同场经营，电脑公司补位。房主建房拿到 6 位房间码，别人凭码申请入座，房主批准。</p></div></header>
    <div class="mp-body">
      ${last ? `<div class="solo-card"><div class="solo-card-head"><b>回到房间 ${esc(last)}</b><small>这个浏览器上次在这间房里</small></div><button class="btn btn--primary" data-mp="rejoin" data-room="${esc(last)}">回到房间</button></div>` : ''}
      <div class="solo-card"><div class="solo-card-head"><b>加入房间</b><small>输入房主给的房间码</small></div>
        <div class="mp-grid">${field('房间码', `<input type="text" maxlength="6" data-mp-set="code" value="${esc(d.code)}" placeholder="例如 a1b2c3" autocomplete="off" />`)}
          ${field('密码', `<input type="password" data-mp-set="joinPassword" value="${esc(d.joinPassword)}" placeholder="没有就空着" />`)}</div>
        <button class="btn btn--primary" data-mp="join">申请入座</button></div>
      <div class="solo-card"><div class="solo-card-head"><b>建一间房</b><small>开局前还能在大厅里改</small></div>
        ${settingsForm(d)}
        ${field('房间密码', `<input type="password" data-mp-set="password" value="${esc(d.password)}" placeholder="不设就空着" />`)}
        <button class="btn btn--primary btn--xl" data-mp="create">建房</button></div>
    </div></section>`;
}

// ---------- 进了房间：大厅 ----------
function seatRows(m, host) {
  const L = m.lobby;
  const s = L.settings || {};
  const members = L.members || [];
  const rows = [];
  const started = L.phase !== 'lobby';
  if (!started) {
    for (let i = 0; i < (s.humans || 2); i++) {
      const x = members.find(y => y.approved && y.seat === i);
      if (!x) { rows.push(`<li class="mp-seat is-empty"><span class="mp-dot"></span><b>座位 ${i + 1}</b><small>空位</small></li>`); continue; }
      const me = x.member === m.member;
      rows.push(`<li class="mp-seat${me ? ' is-me' : ''}"><span class="mp-dot${x.online ? ' is-on' : ''}" title="${x.online ? '在线' : '不在线'}"></span>
        <b>${esc(x.company?.name || '未命名公司')}${x.member === L.host ? ' · 房主' : ''}${me ? '（你）' : ''}</b>
        <small>${esc(x.company?.brand || '')}${x.company?.pick ? ` · 接手 ${esc(FORK_PICKS.find(p => p[0] === x.company.pick)?.[1] || x.company.pick)}` : ''}</small>
        <span class="chip ${x.ready ? 'chip--small' : 'chip--warn'}">${x.ready ? '准备好了' : '还没准备'}</span>
        ${host && !me ? `<button class="chip-btn" data-mp="kick" data-member="${esc(x.member)}">请出去</button>` : ''}</li>`);
    }
    if (s.mode !== 'fork') rows.push(`<li class="mp-seat is-bot"><span class="mp-dot is-bot"></span><b>电脑公司 × ${s.bots ?? 0}</b><small>${esc(BOTS.find(b => b[0] === s.bot)?.[1] || '普通')}</small></li>`);
  } else {
    for (const c of L.seats || []) {
      const x = c.kind === 'human' ? members.find(y => y.approved && y.seat === c.seat) : null;
      rows.push(`<li class="mp-seat${x?.member === m.member ? ' is-me' : ''}${c.kind === 'bot' ? ' is-bot' : ''}"><span class="mp-dot${x?.online ? ' is-on' : c.kind === 'bot' ? ' is-bot' : ''}"></span>
        <b>${esc(c.name)}</b><small>${c.kind === 'bot' ? '电脑' : c.hosted ? '真人 · 托管中' : '真人'}</small></li>`);
    }
  }
  const pending = members.filter(x => !x.approved);
  const bots = (L.seats || []).filter(c => c.kind === 'bot');
  const pend = pending.map(x => `<li class="mp-seat is-pending"><span class="mp-dot${x.online ? ' is-on' : ''}"></span><b>${esc(x.company?.name || '有人')}${x.member === m.member ? '（你）' : ''}</b><small>等房主批准</small>
    ${host ? (started ? bots.map(b => `<button class="chip-btn" data-mp="approve" data-member="${esc(x.member)}" data-company="${esc(b.id)}">接管 ${esc(b.name)}</button>`).join('') : `<button class="chip-btn" data-mp="approve" data-member="${esc(x.member)}">批准入座</button>`)
      + `<button class="chip-btn" data-mp="kick" data-member="${esc(x.member)}">拒绝</button>` : ''}</li>`).join('');
  const same = host && (L.sameIp || []).length ? `<p class="warn mp-note">有 ${L.sameIp.length} 组座位来自同一个网络（可能是一家人共用一个网，也可能是一人多号）。只提示，不拦。</p>` : '';
  return `<ul class="mp-seats">${rows.join('')}${pend}</ul>${same}`;
}
function companyCard(m) {
  const me = myMember(m);
  if (!me?.approved) return '';
  const fork = m.lobby.settings?.mode === 'fork';
  const c = ui.mpCompany || (ui.mpCompany = { name: me.company?.name || '', brand: me.company?.brand || '', country: me.company?.country || 'CN', pick: me.company?.pick || '' });
  return `<div class="solo-card"><div class="solo-card-head"><b>我的公司</b><small>${fork ? '分岔局：挑一家真实公司接手' : '名字和品牌词别和别人重复'}</small></div>
    <div class="mp-grid">
      ${field('公司名', `<input type="text" maxlength="16" data-mp-co="name" value="${esc(c.name)}" />`)}
      ${field('品牌词', `<input type="text" maxlength="16" data-mp-co="brand" value="${esc(c.brand)}" />`, '模型名的开头')}
      ${field('国家', `<select data-mp-co="country">${opt(COUNTRIES, c.country)}</select>`)}
      ${fork ? field('接手哪一家', `<select data-mp-co="pick"><option value="">选一家</option>${opt(FORK_PICKS, c.pick)}</select>`) : ''}
    </div>
    ${dupNote(m, c)}
    <div class="mp-row"><button class="btn ${me.ready ? 'btn--ghost' : 'btn--primary'}" data-mp="ready" data-on="${me.ready ? '0' : '1'}">${me.ready ? '取消准备' : '准备好了'}</button>
      ${me.ready ? '<small class="muted">改资料会取消准备</small>' : ''}</div></div>`;
}
// 名字、品牌词和别人重复时当场提示（服务器开局时还会再查一遍）。
function dupNote(m, c) {
  const others = (m.lobby.members || []).filter(x => x.approved && x.member !== m.member).map(x => x.company || {});
  const n = s => String(s || '').trim().toLowerCase();
  if (c.name && others.some(o => n(o.name) === n(c.name))) return '<p class="warn mp-note">公司名和别人重复了</p>';
  if (c.brand && others.some(o => n(o.brand) === n(c.brand))) return '<p class="warn mp-note">品牌词和别人重复了</p>';
  if (c.pick && others.some(o => o.pick === c.pick)) return '<p class="warn mp-note">这家公司别人已经挑了</p>';
  return '';
}
export function chatHtml(m, { compact = false } = {}) {
  const list = m.chat.slice(compact ? -30 : -80);
  return `<div class="mp-chat${compact ? ' is-compact' : ''}">
    <ol class="mp-chat-list">${list.map(x => `<li class="${x.member === m.member ? 'is-me' : ''}"><b>${esc(x.name || '有人')}</b><span>${esc(x.text)}</span></li>`).join('') || '<li class="muted">还没有人说话。</li>'}</ol>
    <div class="mp-chat-input"><input type="text" maxlength="200" data-mp-chat placeholder="说点什么（回车发送）" /><button class="chip-btn" data-mp="chat">发送</button></div></div>`;
}
function roomHtml(m) {
  const L = m.lobby;
  if (!L) {
    return `<section class="solo-screen mp-screen"><div class="mp-body"><div class="solo-card"><b>正在连接房间 ${esc(m.room)}…</b><p class="muted">${m.online ? '已连上，等大厅消息' : '连接中；如果一直连不上，可能是房间不存在或已经过期'}</p>
    <button class="btn btn--ghost" data-mp="leave">离开</button></div></div></section>`;
  }
  const host = isHost(m);
  const me = myMember(m);
  const s = L.settings || {};
  const started = L.phase !== 'lobby';
  const people = (L.members || []).filter(x => x.approved);
  const canStart = host && !started && people.length === s.humans && people.every(x => x.ready);
  const d = host && !started ? (ui.mpSettings || (ui.mpSettings = fromSettings(s))) : fromSettings(s);
  return `<section class="solo-screen mp-screen">
    <header class="solo-head"><button class="icon-btn" data-mp="leave" aria-label="离开房间">${icon('back')}</button>
      <div><span class="eyebrow">ROOM</span><h2 class="mp-code">${esc(m.room)}</h2>
      <p class="muted">${started ? (L.phase === 'ended' ? '这一局已经结束了' : '这一局已经开始了') : '把房间码发给朋友；人齐、都准备好以后房主开局'}${L.password ? ' · 有密码' : ''}${m.online ? '' : ' · 连接断了，正在重连'}</p></div></header>
    <div class="mp-body">
      ${me && !me.approved ? `<div class="solo-card"><b>${started ? '已申请接管一家电脑公司' : '已申请入座'}</b><p class="muted">等房主批准。</p></div>` : ''}
      <div class="solo-card"><div class="solo-card-head"><b>座位</b><small>${people.length}/${s.humans ?? '?'} 个真人</small></div>${seatRows(m, host)}</div>
      ${!started ? `<div class="solo-card"><div class="solo-card-head"><b>设置</b><small>${host ? '只有房主能改；改了以后大家要重新准备' : '房主定的'}</small></div>
        ${settingsForm(d, !host)}
        ${host ? '<div class="mp-row"><button class="btn btn--ghost" data-mp="settings">保存设置</button></div>' : ''}</div>` : ''}
      ${!started ? companyCard(m) : ''}
      ${host && !started ? `<button class="btn btn--primary btn--xl" data-mp="start" ${canStart ? '' : 'disabled'}>开局</button>${canStart ? '' : '<p class="muted mp-note">真人座位坐满、每个人都点了“准备好了”才能开局。</p>'}` : ''}
      <div class="solo-card"><div class="solo-card-head"><b>聊天</b></div>${chatHtml(m)}</div>
    </div></section>`;
}

export function renderLobby() {
  const m = getMp();
  return m ? roomHtml(m) : entryHtml();
}

// ---------- 交互 ----------
const busy = { on: false };
async function run(fn) {
  if (busy.on) return;
  busy.on = true;
  try { await fn(); } catch (e) { toast(e?.message || String(e)); } finally { busy.on = false; render(); }
}
export function lobbyClick(el, root) {
  const op = el.dataset.mp;
  const m = getMp();
  if (op === 'create') return run(() => createRoom({ settings: draftSettings(ui.mpDraft), password: ui.mpDraft.password || undefined }));
  if (op === 'join') return run(() => joinRoom(ui.mpDraft.code, { ...(ui.mpDraft.joinPassword ? { password: ui.mpDraft.joinPassword } : {}) }));
  if (op === 'rejoin') return run(() => rejoin(el.dataset.room));
  if (op === 'leave') { ui.screen = 'title'; if (!m) render(); return; }
  if (!m) return;
  if (op === 'approve') return run(() => roomCmd('approveSeat', { member: el.dataset.member, ...(el.dataset.company ? { companyId: el.dataset.company } : {}) }));
  if (op === 'kick') return run(() => roomCmd('kick', { member: el.dataset.member }));
  if (op === 'settings') return run(async () => { await roomCmd('settings', { settings: draftSettings(ui.mpSettings) }); ui.mpSettings = null; toast('设置改好了，大家要重新点“准备好了”'); });
  if (op === 'ready') {
    const c = ui.mpCompany || {};
    const on = el.dataset.on === '1';
    // 空着的名字、品牌词不发（服务器沿用原来的）；分岔局带上要接手的公司。
    const pickIf = (k, v) => (String(v || '').trim() ? { [k]: String(v).trim() } : {});
    return run(() => roomCmd('ready', { ...pickIf('name', c.name), ...pickIf('brand', c.brand), country: c.country || 'CN', ...pickIf('pick', c.pick), ready: on }));
  }
  if (op === 'start') return run(() => roomCmd('start'));
  if (op === 'chat') {
    const input = root?.querySelector?.('[data-mp-chat]');
    const text = String(input?.value || '').trim();
    if (!text) return;
    return run(async () => { await roomCmd('chat', { text }); if (input) input.value = ''; });
  }
}
// 表单改动：建房草稿、房主的设置草稿、我的公司草稿。只改草稿，按按钮才发。
export function lobbyChange(t) {
  const m = getMp();
  if (t.dataset.mpCo) {
    ui.mpCompany ??= {};
    ui.mpCompany[t.dataset.mpCo] = t.value;
    return true;
  }
  const key = t.dataset.mpSet;
  if (!key) return false;
  const d = m ? (ui.mpSettings || (ui.mpSettings = fromSettings(m.lobby?.settings || {}))) : (ui.mpDraft || (ui.mpDraft = defaultDraft()));
  d[key] = t.type === 'checkbox' ? t.checked : t.value;
  // 真人数变了，电脑数跟着钳到总数 3–12。
  if (key === 'humans' || key === 'mode') d.bots = Math.max(Math.max(0, 3 - d.humans), Math.min(12 - d.humans, Number(d.bots)));
  return true;
}
