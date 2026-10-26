// DOM替身验证实际入口、关闭与重入；不声称真实浏览器视觉验收。
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { setState, setWorld, setMp, ui, clock } from '../../src/career/ui/state.js';
import { setRemote } from '../../src/career/ui/act.js';
class Overlay {
  constructor(html) { this.html = html; this.isConnected = true; this.handlers = new Map(); this.sheet = { innerHTML: html }; this.office = { innerHTML: '' }; }
  querySelector(s) { return s === '.sheet' ? this.sheet : s === '.office' ? this.office : null; }
  addEventListener(name, fn) { const list = this.handlers.get(name) || []; list.push(fn); this.handlers.set(name, list); }
  removeEventListener(name, fn) { this.handlers.set(name, (this.handlers.get(name) || []).filter(x => x !== fn)); }
  async click(selector, dataset = {}) {
    const target = { dataset, disabled: false, closest: s => s === selector ? target : null };
    await Promise.all((this.handlers.get('click') || []).map(fn => fn({ target })));
  }
}
const observers = new Set();
globalThis.MutationObserver = class { constructor(fn) { this.fn = fn; } observe() { observers.add(this); } disconnect() { observers.delete(this); } };
let current = null;
const overlay = { set innerHTML(html) { if (current) current.isConnected = false; current = html ? new Overlay(html) : null; if (current) current.parentNode = overlay; for (const o of observers) queueMicrotask(() => observers.has(o) && o.fn()); }, get firstElementChild() { return current; } };
const notices = [];
globalThis.document = { baseURI: 'http://localhost/', getElementById: id => id === 'overlay-root' ? overlay : { append: x => notices.push(x.textContent) }, createElement: () => ({ classList: { add() {} }, remove() {} }) };
const { followAdvice } = await import('../../src/career/ui/home.js');
const { resetOffice } = await import('../../src/career/ui/office.js');
const { openIpoDecision } = await import('../../src/career/ui/ipo_decision.js');
const { click: capitalClick } = await import('../../src/career/ui/pages/capital.js');
const { viewFor } = await import('../../src/career/ui/views/index.js');
const fresh = () => { E.setProvider(); const s = E.createGame('deepseek', 'y2025', 4); s.queue = []; s.valuation = 6e9; setState(s); setWorld(null); setMp(null); ui.busy = false; clock.busy = false; return s; };
afterEach(() => { resetOffice(); setRemote(null); setState(null); setWorld(null); setMp(null); overlay.innerHTML = ''; });
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
test('真实followAdvice研究分支只打开研究页；关闭与重复进入不自动开研', async () => {
  const s = fresh(); E.enableAutomation(s); const a = E.advise(s).find(x => x.op.type === 'tech'), before = JSON.stringify(s);
  for (let i = 0; i < 2; i++) {
    await followAdvice(a.id); assert.match(current.office.innerHTML, /<h2>研究(?: · 完整路线)?<\/h2>/); assert.equal(JSON.stringify(s), before);
    await current.click('[data-close]'); assert.equal(current, null); assert.equal(JSON.stringify(s), before);
  }
});
test('真实followAdvice IPO入口先展示专页，取消后无修改且可以重入', async () => {
  const s = fresh(), before = JSON.stringify(s);
  assert.ok(E.advise(s).some(a => a.id === 'ipo'));
  for (let i = 0; i < 2; i++) {
    const task = followAdvice('ipo'); await flush(); assert.match(current.sheet.innerHTML, /审议 IPO/); assert.equal(JSON.stringify(s), before);
    await current.click('[data-ipo-cancel]'); await task; assert.equal(current, null); assert.equal(JSON.stringify(s), before);
  }
});
test('资本入口先审议；取消回到资本页，不触发guard执行或保存', async () => {
  const s = fresh(), before = JSON.stringify(s); let guards = 0;
  const task = capitalClick(s, { closest: s => s === '[data-op]' ? { dataset: { op: 'ipo' } } : null }, { guard: () => guards++ });
  assert.match(current.sheet.innerHTML, /审议 IPO/); assert.equal(JSON.stringify(s), before);
  await current.click('[data-ipo-cancel]'); await task; assert.match(current.office.innerHTML, /<h2>资本<\/h2>/);
  assert.equal(guards, 0); assert.equal(JSON.stringify(s), before);
});
test('事件查看方案与返回不消费原事件，只有确认才返回start供原事件命令执行', async () => {
  const s = fresh(); s.queue = [{ kind: 'event', id: 'ipo_window' }]; const before = JSON.stringify(s), view = E.currentEvent(s);
  const task = viewFor(view.kind)(s, view); assert.match(current.sheet.innerHTML, /查看上市决策/);
  await current.click('[data-choice]', { choice: 'start' }); await flush(); assert.match(current.sheet.innerHTML, /审议 IPO/);
  await current.click('[data-ipo-cancel]'); await flush(); assert.match(current.sheet.innerHTML, /查看上市决策/); assert.equal(JSON.stringify(s), before);
  await current.click('[data-choice]', { choice: 'start' }); await flush(); await current.click('[data-ipo-confirm]');
  assert.equal(await task, 'start'); assert.equal(JSON.stringify(s), before);
  const r = E.applyCommand(s, { name: 'resolveEvent', args: { choiceId: 'start' } }); assert.equal(r.ok, true); assert.ok(s.capital.ipo);
});
test('真实MP弹层确认连点只发一次，拒绝后保持专页错误且可取消', async () => {
  const s = fresh(), before = JSON.stringify(s); let calls = 0, reject;
  setRemote({ localOk: () => false, send: () => { calls++; return new Promise((_, r) => { reject = r; }); } });
  const task = openIpoDecision(s), r = current, click1 = r.click('[data-ipo-confirm]'); await flush();
  await r.click('[data-ipo-confirm]'); assert.equal(calls, 1); assert.match(r.sheet.innerHTML, /等待权威确认/);
  reject(Error('权威服务器拒绝')); await click1; assert.match(r.sheet.innerHTML, /权威服务器拒绝/); assert.equal(JSON.stringify(s), before);
  await r.click('[data-ipo-cancel]'); assert.equal((await task).confirmed, false); assert.equal(current, null); assert.equal(JSON.stringify(s), before);
});

test('普通经营事件仍保持原对话选项，未扩大IPO确认到其他事件', async () => {
  const s = fresh(), before = JSON.stringify(s);
  const view = { kind: 'event', id: 'other_event', tag: '原事件', title: '普通事件', text: '原文', choices: [{ id: 'keep', label: '原选择' }] };
  const task = viewFor('event')(s, view); assert.match(current.sheet.innerHTML, /普通事件/); assert.doesNotMatch(current.sheet.innerHTML, /ipo-decision/);
  await current.click('[data-choice]', { choice: 'keep' }); assert.equal(await task, 'keep'); assert.equal(JSON.stringify(s), before);
});

test('较新导航替换IPO事件决策后不重开旧卡片、不消费事件或覆盖新弹层', async () => {
  const s = fresh(); s.queue = [{ kind: 'event', id: 'ipo_window' }]; const before = JSON.stringify(s);
  const task = viewFor('event')(s, E.currentEvent(s)); await current.click('[data-choice]', { choice: 'start' }); await flush();
  overlay.innerHTML = '新导航的弹层'; const newer = current; await flush();
  assert.equal(await task, null); assert.equal(current, newer); assert.equal(current.html, '新导航的弹层'); assert.equal(JSON.stringify(s), before);
});
