import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { capitalProcesses } from '../../src/career/sim/capital.js';
import { botThink } from '../../src/career/world/bots.js';
import { restoreHistory } from '../helpers/world_provider.mjs';
globalThis.document ??= { baseURI: 'http://localhost/' };
const { createIpoDecision, ipoDecisionHtml } = await import('../../src/career/ui/ipo_decision.js');
const { inboxHtml } = await import('../../src/career/ui/inbox.js');
const { setMp } = await import('../../src/career/ui/state.js');
const mk = () => {
  const w = E.createWorld({ seed: 4, start: '2025-01', days: 730, mp: true, companies: [
    { name: '甲智能', brand: '甲甲', country: 'US', tier: 'specialist', kind: 'human' },
    { name: '乙智能', brand: '乙乙', country: 'US', tier: 'specialist', kind: 'human' },
    { name: '丙智能', brand: '丙丙', country: 'US', tier: 'specialist', kind: 'bot' },
  ] });
  w.index.noShock = 1000;
  const all = Object.values(w.companies), human = all.find(c => c.kind === 'human'), bot = all.find(c => c.kind === 'bot');
  for (const c of all) { const s = c.s; s.queue = []; s.valuation = 6e9; s.equity = 0.8; s.history = [{ date: '2024-07', rev: { api: 1e6 } }, { date: '2024-10', rev: { api: 2e6 } }]; }
  return { w, human, bot };
};
afterEach(() => { setMp(null); restoreHistory(); });
test('自洽10/20/30%方案预览与实际挂牌金额、稀释逐一一致', () => {
  for (const frac of [0.1, 0.2, 0.3]) {
    const { w, human } = mk(), s = human.s, before = JSON.stringify(s), q = E.ipoReview(s, frac);
    assert.equal(q.ok, true); assert.equal(q.history, false); assert.equal(q.fraction, frac);
    assert.equal(q.proceeds, 6e9 * .85 * frac / (1 - frac)); assert.equal(q.equityAfter, .8 * (1 - frac));
    assert.equal(JSON.stringify(s), before); const cash = s.cash; E.startIpo(s, frac); s.day = s.due.ipo; w.day = s.day;
    capitalProcesses(s, { notes: [] }); assert.ok(Math.abs(s.cash - cash - q.proceeds) < 1e-6); assert.equal(s.equity, q.equityAfter);
  }
});
test('自洽条件区分市场窗口与两季度客户收入；非客户收入不计入', () => {
  const { w, human } = mk(), s = human.s; w.index.noShock = 0;
  let q = E.ipoReview(s); assert.equal(q.requirements.find(r => !r.ok).id, 'window'); assert.doesNotMatch(q.reason, /2024/);
  w.index.noShock = 1000; s.history[0].rev = { gpu_lease: 1e9 }; q = E.ipoReview(s); assert.equal(q.requirements.find(r => !r.ok).id, 'revenue');
  assert.equal(q.reason, E.ipoCheck(s).reason);
});
test('自洽决策能比较发行比例且不写状态；明确确认才发既有startIpoIssue命令', async () => {
  const { human } = mk(), s = human.s, before = JSON.stringify(s), d = createIpoDecision(s);
  assert.equal(d.select(.3), true); assert.equal(d.quote.fraction, .3); assert.equal(JSON.stringify(s), before);
  const html = ipoDecisionHtml(d, { multiplayer: true }); assert.match(html, /data-ipo-frac="0.3"/); assert.match(html, /时间不会因打开此页暂停/); assert.doesNotMatch(html, /8%/);
  assert.equal((await d.confirm()).confirmed, true); assert.equal(s.capital.ipo.frac, .3);
});
test('真人IPO事件超时只暂缓，NPC既有默认启动不变', () => {
  const { w, human, bot } = mk(); for (const c of [human, bot]) c.s.queue.push({ kind: 'event', id: 'ipo_window' });
  const cash = human.s.cash, eq = human.s.equity;
  assert.equal(E.autoResolve(w, human.id).choice, 'later'); assert.equal(human.s.capital.ipo, null); assert.equal(human.s.cash, cash); assert.equal(human.s.equity, eq);
  assert.equal(E.autoResolve(w, bot.id).choice, 'start'); assert.deepEqual(bot.s.capital.ipo, {});
});
test('掉线真人事件超时也只暂缓；被动bot日常不能绕过决定替其上市', () => {
  const { w, human, bot } = mk(); E.setHosted(w, human.id, true);
  human.s.queue.push({ kind: 'event', id: 'ipo_window' }); assert.equal(E.autoResolve(w, human.id).choice, 'later');
  assert.equal(E.ipoCheck(human.s).ok, true); botThink(w, human); assert.equal(human.s.capital.ipo, null);
  botThink(w, bot); assert.ok(bot.s.capital.ipo, 'NPC自动上市仍保留');
});
test('旧房间掉线真人runCommands/resolveAll处理IPO卡仍不得启动', () => {
  const { w, human } = mk(); E.setHosted(w, human.id, true); human.s.queue.push({ kind: 'event', id: 'ipo_window' });
  w.tick(); assert.equal(human.s.capital.ipo, null); assert.ok(!human.s.log.some(x => /启动 IPO/.test(x.text)));
});
test('收件箱向真人准确显示IPO默认再等等，而不是启动IPO', () => {
  const { human } = mk(); human.s.queue.push({ kind: 'event', id: 'ipo_window' }); setMp({ inbox: { cards: [] } });
  const html = inboxHtml(human.s); assert.match(html, /「再等等」/); assert.doesNotMatch(html, /「启动 IPO」/);
});
test('真人仍可通过权威命令明确启动；非法发行比例仍被命令表拒绝', () => {
  const { w, human } = mk(), s = human.s, ctx = { world: w, companyId: human.id, multiplayer: true };
  const before = JSON.stringify(s); assert.equal(E.applyCommand(s, { name: 'startIpoIssue', args: { frac: .25 } }, ctx).ok, false); assert.equal(JSON.stringify(s), before);
  assert.equal(E.applyCommand(s, { name: 'startIpoIssue', args: { frac: .1 } }, ctx).ok, true); assert.equal(s.capital.ipo.frac, .1);
});
