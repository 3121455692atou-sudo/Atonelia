import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
globalThis.document ??= { baseURI: 'http://localhost/' };
const { mpControls } = await import('../../src/career/ui/topbar.js');
import { roomCmd, isHost } from '../../src/career/ui/net.js';
import { setMp, ui } from '../../src/career/ui/state.js';
const { renderLobby, defaultDraft, draftSettings } = await import('../../src/career/ui/pages/lobby.js');
const originalFetch = globalThis.fetch;
afterEach(() => { setMp(null); globalThis.fetch = originalFetch; ui.mpDraft = null; });
const state = member => ({ room: 'a1b2c3', member, seat: member === 'host' ? 0 : 1, chat: [], online: true,
  lobby: { host: 'host', phase: 'playing', settings: { humans: 2 }, members: [{ member: 'host', approved: true, seat: 0 }, { member: 'peer', approved: true, seat: 1 }, { member: 'new', approved: false }],
    seats: [{ id: 'bot1', kind: 'bot', status: 'playing', name: '经营中的电脑' }, { id: 'human1', kind: 'human', status: 'playing', hosted: true, name: '掉线真人' },
      { id: 'bot-ended', kind: 'bot', status: 'ended', name: '已结束电脑' }, { id: 'bot-unknown', kind: 'bot', name: '状态未知电脑' }] },
  clock: { speed: 0, hostSpeed: 3, slow: true, paused: false, players: [] }, S: {} });

test('普通成员与等待审批成员只有只读时钟，没有暂停、继续、调速或投票按钮', () => {
  for (const who of ['peer', 'new', null]) {
    const html = mpControls(state(who));
    assert.doesNotMatch(html, /data-act="mp-(?:pause|resume|speed|vote)"/);
    assert.match(html, /房主控时/);
    assert.match(html, /实际：3 秒一天/);
    assert.match(html, /data-act="mp"/);
  }
});
test('房主选择档位与系统暂时放慢的实际速度分别展示', () => {
  const m = state('host');
  let html = mpControls(m);
  assert.match(html, /data-act="mp-pause"/);
  assert.equal((html.match(/data-act="mp-speed"/g) || []).length, 4);
  assert.match(html, /data-id="3"[^>]*aria-pressed="true"/);
  assert.match(html, /实际：3 秒一天/);
  assert.doesNotMatch(html, /mp-vote|投票|剩.*次/);
  m.clock.paused = true;
  html = mpControls(m);
  assert.match(html, /data-act="mp-resume"/);
  assert.doesNotMatch(html, /data-act="mp-pause"/);
});
test('身份未恢复时不能因两个空值相等误认房主', () => {
  assert.equal(isHost({ member: null, lobby: { host: null } }), false);
  assert.equal(isHost({ lobby: {} }), false);
});
test('普通成员快捷键或残留控件发来的时间命令在请求前被拒绝', async () => {
  setMp(state('peer'));
  let sent = 0; globalThis.fetch = async () => { sent++; throw new Error('不应发送'); };
  for (const name of ['pause', 'resume', 'speed']) await assert.rejects(roomCmd(name, { speed: 3 }), /只有房主/);
  await assert.rejects(roomCmd('vote', { speed: 3 }), /不再使用速度投票/);
  assert.equal(sent, 0);
});
test('房主直接发送暂停、恢复、实际速度；仍不发送旧投票', async () => {
  setMp(state('host')); const sent = [];
  globalThis.fetch = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return { json: async () => ({ ok: true }) }; };
  await roomCmd('pause'); await roomCmd('resume'); await roomCmd('speed', { speed: 2 });
  assert.deepEqual(sent.map(x => x.body), [{ name: 'pause', args: {} }, { name: 'resume', args: {} }, { name: 'speed', args: { speed: 2 } }]);
  await assert.rejects(roomCmd('vote', { speed: 1 }), /不再使用/);
  assert.equal(sent.length, 3);
});
test('房主中途大厅只提供真实电脑审批，不抢掉线托管真人，并可返回公司', () => {
  setMp(state('host')); const html = renderLobby();
  assert.match(html, /data-company="bot1"/);
  assert.doesNotMatch(html, /data-company="human1"/);
  assert.doesNotMatch(html, /data-company="bot-ended"|data-company="bot-unknown"/);
  assert.match(html, /批准接管 经营中的电脑/);
  assert.match(html, /data-act="mp-home"/);
  assert.match(html, /不会暂停世界/);
});
test('中途申请明确等待批准和保留经营进度，普通人看不到批准按钮', () => {
  setMp(state('new')); const html = renderLobby();
  assert.match(html, /已申请接管经营中的电脑公司/);
  assert.match(html, /不会重建公司或重置经营进度/);
  assert.doesNotMatch(html, /data-mp="approve"/);
});
test('新房默认实际速度仍是第二档，不残留每人暂停额度或投票上限设置', () => {
  setMp(null); ui.mpDraft = defaultDraft();
  assert.equal(draftSettings(ui.mpDraft).speedMax, 1);
  const html = renderLobby();
  assert.doesNotMatch(html, /每人每年暂停|速度上限/);
  assert.match(html, /申请加入 \/ 接管电脑公司/);
});
