import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { capitalProcesses } from '../../src/career/sim/capital.js';
import { restoreHistory } from '../helpers/world_provider.mjs';
import { setRemote } from '../../src/career/ui/act.js';
import { manualAdvice, setResearchRecommendation, researchRecommendation } from '../../src/career/ui/advice_navigation.js';
globalThis.document ??= { baseURI: 'http://localhost/' };
const { createIpoDecision, ipoDecisionHtml } = await import('../../src/career/ui/ipo_decision.js');
const { render: capitalHtml } = await import('../../src/career/ui/pages/capital.js');
const fresh = () => { restoreHistory(); const s = E.createGame('deepseek', 'y2025', 4); s.queue = []; s.valuation = 6e9; s.equity = 0.8; return s; };
afterEach(() => { setRemote(null); restoreHistory(); });

test('研究建议只改变手动展示与推荐标记，不改变原顾问命令、研究或托管模式', () => {
  const s = fresh(); E.enableAutomation(s); const before = JSON.stringify(s);
  const a = E.advise(s).find(x => x.op.type === 'tech'); assert.ok(a);
  const copy = JSON.stringify(a), v = manualAdvice(a); setResearchRecommendation(s, a.op.id);
  assert.equal(v.kind, 'page'); assert.match(v.detail, /不会立即开始/); assert.equal(v.op, a.op);
  assert.equal(researchRecommendation(s), a.op.id); assert.equal(researchRecommendation(fresh()), null);
  assert.equal(JSON.stringify(a), copy); assert.equal(JSON.stringify(s), before);
});
test('IPO手动建议不再误用史实8%宣传自洽收益，普通建议不变', () => {
  const a = { kind: 'page', label: '启动上市', detail: '估值8%', op: { type: 'ipo' } };
  const v = manualAdvice(a); assert.match(v.label, /审议/); assert.doesNotMatch(v.detail, /8%/); assert.equal(v.op, a.op);
  const other = { op: { type: 'fund' } }; assert.equal(manualAdvice(other), other);
});
test('史实IPO预览只读，8%收益与不稀释准确对应90天后现有结算', () => {
  const s = fresh(), before = JSON.stringify(s), q = E.ipoReview(s);
  assert.ok(q.ok); assert.equal(q.history, true); assert.equal(q.fraction, null);
  assert.equal(q.proceeds, 480e6); assert.equal(q.equityAfter, 0.8); assert.equal(q.expectedDay, '2025-04-01');
  assert.equal(JSON.stringify(s), before);
  const cash = s.cash; E.startIpo(s); s.day = s.due.ipo; capitalProcesses(s, { notes: [] });
  assert.equal(s.cash - cash, q.proceeds); assert.equal(s.equity, q.equityAfter); assert.ok(s.capital.listed);
});
test('完整条件与引擎校验同源，拒绝原因与顺序保留', () => {
  const cases = [
    [s => { s.company.kind = 'division'; }, 'independent'], [s => { s.capital.listed = {}; }, 'unlisted'],
    [s => { s.capital.ipo = {}; }, 'idle'], [s => { s.bubble = { day: s.day, until: '2025-07-01', averted: false }; }, 'bubble'],
    [s => { s.date = '2023-01'; }, 'window'], [s => { s.valuation = 2e9; }, 'valuation'], [s => { s.legal.cases.push({ type: 'class' }); }, 'legal'],
  ];
  for (const [change, id] of cases) {
    const s = fresh(); change(s); const before = JSON.stringify(s), q = E.ipoReview(s);
    assert.equal(q.ok, false); assert.equal(q.requirements.find(r => !r.ok).id, id);
    assert.equal(q.reason, E.ipoCheck(s).reason); assert.equal(JSON.stringify(s), before);
  }
});
test('独立决策页展示真实条件、收益、风险；资本入口只写审议', () => {
  const s = fresh(), html = ipoDecisionHtml(createIpoDecision(s));
  for (const value of ['审议 IPO', '当前上市条件', '90 天', '8%', '不因 IPO 扣减', '没有手动取消', '泡沫破裂', 'data-ipo-cancel', 'data-ipo-confirm']) assert.ok(html.includes(value), value);
  assert.doesNotMatch(html, /data-ipo-frac/); assert.match(capitalHtml(s), /审议上市方案（不立即执行）/);
});
test('打开、取消、重入、重复取消完全不写游戏或发命令', async () => {
  const s = fresh(), before = JSON.stringify(s); let calls = 0; const execute = () => { calls++; };
  for (let i = 0; i < 3; i++) { const d = createIpoDecision(s, { execute }); assert.equal(d.cancel(), true); assert.equal(d.cancel(), false); assert.equal((await d.confirm()).confirmed, false); }
  assert.equal(calls, 0); assert.equal(JSON.stringify(s), before);
});
test('只有明确确认才启动；重复确认不二次执行，启动不提前到账或稀释', async () => {
  const s = fresh(), cash = s.cash, equity = s.equity, d = createIpoDecision(s);
  assert.equal(s.capital.ipo, null); const out = await d.confirm(); assert.equal(out.confirmed, true);
  assert.deepEqual(s.capital.ipo, {}); assert.equal(s.due.ipo, '2025-04-01'); assert.equal(s.cash, cash); assert.equal(s.equity, equity);
  const before = JSON.stringify(s); assert.equal((await d.confirm()).confirmed, false); assert.equal(JSON.stringify(s), before);
});
test('确认前估值变化必须再次展示并确认，不能静默按旧方案执行', async () => {
  const s = fresh(), d = createIpoDecision(s); s.valuation = 8e9;
  assert.equal((await d.confirm()).confirmed, false); assert.equal(s.capital.ipo, null); assert.match(d.error, /已经变化/); assert.equal(d.quote.proceeds, 640e6);
  assert.equal((await d.confirm()).confirmed, true); assert.deepEqual(s.capital.ipo, {});
});
test('确认前新诉讼、公司切换、终局均阻止执行', async () => {
  const s = fresh(), d = createIpoDecision(s); s.legal.cases.push({ type: 'books' });
  const before = JSON.stringify(s); assert.equal((await d.confirm()).confirmed, false); assert.match(d.error, /未决诉讼/); assert.equal(JSON.stringify(s), before);
  let latest = fresh(); const stale = createIpoDecision(latest, { getCurrent: () => latest }); latest = { ...latest, charId: 'other' };
  assert.equal((await stale.confirm()).confirmed, false); assert.match(stale.error, /对局已经变化/);
  latest = fresh(); const ended = createIpoDecision(latest); latest.status = 'ended'; assert.equal((await ended.confirm()).confirmed, false);
});
test('MP确认双击只提交一次权威命令，等待时取消不可假装撤销；不乐观改本地', async () => {
  const s = fresh(), before = JSON.stringify(s); let calls = 0, complete;
  setRemote({ localOk: () => false, send: (name, args) => { calls++; assert.equal(name, 'startIpo'); assert.deepEqual(args, {}); return new Promise(r => { complete = r; }); } });
  const d = createIpoDecision(s), pending = d.confirm(); assert.equal(d.pending, true);
  assert.equal((await d.confirm()).confirmed, false); assert.equal(d.cancel(), false); assert.equal(calls, 1); assert.equal(JSON.stringify(s), before);
  complete({ accepted: true }); assert.equal((await pending).confirmed, true); assert.equal(JSON.stringify(s), before);
});
test('MP拒绝保留决策页与错误，之后仅玩家再次确认重试', async () => {
  const s = fresh(), before = JSON.stringify(s); let calls = 0;
  setRemote({ localOk: () => false, send: () => { calls++; return calls === 1 ? Promise.reject(new Error('服务端拒绝：窗口关闭')) : Promise.resolve({ accepted: true }); } });
  const d = createIpoDecision(s); assert.equal((await d.confirm()).confirmed, false); assert.match(d.error, /窗口关闭/); assert.equal(d.closed, false); assert.equal(d.pending, false);
  assert.equal(JSON.stringify(s), before); assert.equal(calls, 1); assert.equal((await d.confirm()).confirmed, true); assert.equal(calls, 2);
});
test('事件确认只返回明确选择；取消和变更比例不消费事件也不启动上市', async () => {
  const s = fresh(); s.queue = [{ kind: 'event', id: 'ipo_window' }]; const before = JSON.stringify(s);
  const d = createIpoDecision(s, { fixedFraction: true, execute: () => ({ choice: 'start' }) });
  assert.equal(d.select(0.3), false); assert.equal((await d.confirm()).result.choice, 'start'); assert.equal(JSON.stringify(s), before);
});

test('同公司同剧本新对象也不能复用旧确认（防读档/新局串用）', async () => {
  let s = fresh(); const d = createIpoDecision(s, { getCurrent: () => s }); s = JSON.parse(JSON.stringify(s));
  const before = JSON.stringify(s); assert.equal((await d.confirm()).confirmed, false); assert.match(d.error, /对局已经变化/); assert.equal(JSON.stringify(s), before);
});
