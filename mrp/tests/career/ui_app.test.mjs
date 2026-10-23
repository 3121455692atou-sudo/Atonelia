// 主流程 ui/app.js 在页面替身上跑一遍（P0.4）：启动读档、标题页（读档失败卡、旧版键提示、继续）、Esc、结算页回看后台。
// app.js 一导入就会启动，所以每个场景用不同的查询串导入一份新的 app.js（状态、弹层模块是共用的那一份）。
// 浏览器里的真实点击、版面和 375px 宽度由主会话在浏览器里复核。
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import { playGame } from '../helpers/career_bot.mjs';

// ---------- 页面替身 ----------
const toasts = [];
const tick = () => new Promise(r => setImmediate(r));
function fakeEl() {
  return { className: '', textContent: '', innerHTML: '', dataset: {}, classList: { add() {}, contains: () => false }, append(c) { toasts.push(c.textContent); }, remove() {}, click() { this.clicked = true; }, querySelector: () => null };
}
function makeOverlay(html) {
  const handlers = {};
  const classes = (html.match(/class="overlay ([^"]*)"/)?.[1] || '').split(/\s+/);
  return { handlers, office: { innerHTML: '' }, classList: { contains: c => classes.includes(c) }, addEventListener(t, fn) { (handlers[t] ||= []).push(fn); }, removeEventListener() {}, querySelector(sel) { return sel === '.office' ? this.office : null; }, querySelectorAll: () => [] };
}
const overlayRoot = {
  _html: '', overlay: null,
  get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; this.overlay = v ? makeOverlay(v) : null; },
  get firstElementChild() { return this.overlay; },
};
let appEl = null;
const docHandlers = [];
const downloads = [];
globalThis.document = {
  baseURI: 'http://localhost/', hidden: false,
  createElement: tag => { const e = fakeEl(); if (tag === 'a') e.click = () => downloads.push({ name: e.download, href: e.href }); return e; },
  getElementById: id => (id === 'app' ? (appEl = Object.assign(fakeEl(), { handlers: {}, addEventListener(t, fn) { (this.handlers[t] ||= []).push(fn); } })) : id === 'overlay-root' ? overlayRoot : id === 'toast-root' ? fakeEl() : null),
  addEventListener: (t, fn) => docHandlers.push([t, fn]),
};
globalThis.window = { scrollTo() {} };
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); } };

const FIXTURES = new URL('../fixtures/saves/', import.meta.url);
const v3Files = fs.readdirSync(FIXTURES).filter(f => f.endsWith('.json') && !f.startsWith('._'));
const { getState, setState, ui, clock } = await import('../../src/career/ui/state.js');
const { SAVE_KEY, BAK_KEY, LEGACY_SEEN_KEY } = await import('../../src/career/ui/storage.js');
let n = 0;
async function startApp() {
  docHandlers.length = 0;
  const app = await import(`../../src/career/ui/app.js?run=${++n}`);
  await tick();
  return { app, el: appEl };
}
const press = (key, extra = {}) => docHandlers.filter(([t]) => t === 'keydown').forEach(([, fn]) => fn({ key, code: key, target: {}, defaultPrevented: false, preventDefault() {}, ...extra }));
// 点一个 data-act 按钮；同一个 act 在一个场景里是同一个按钮对象（“再点一次确认”要靠它记住第一次点过）。
const btns = new Map();
const click = (el, act, id) => {
  if (!btns.has(act)) btns.set(act, { dataset: { act, id }, disabled: false, textContent: '', innerHTML: '', parentElement: { open: false } });
  const b = btns.get(act);
  el.handlers.click.forEach(fn => fn({ target: { closest: sel => (sel === '[data-act]' ? b : null) } }));
};

beforeEach(() => {
  toasts.length = 0; downloads.length = 0; mem.clear(); btns.clear(); overlayRoot.innerHTML = '';
  setState(null); ui.screen = 'title'; clock.speed = 0; clock.busy = false;
});

describe('启动和标题页', () => {
  it('没有存档：标题页，没有“继续”；没有读档失败卡', async () => {
    const { el } = await startApp();
    assert.equal(ui.screen, 'title');
    assert.match(el.innerHTML, /开始新的一局/);
    assert.doesNotMatch(el.innerHTML, /data-act="continue"/);
    assert.doesNotMatch(el.innerHTML, /读不了/);
  });

  it('有可玩的存档：启动直接进主界面，时间是暂停的', async () => {
    const S = E.createGame('deepseek', 'y2024', 5); S.queue.length = 0;
    mem.set(SAVE_KEY, JSON.stringify(S));
    clock.speed = 4;
    const { el } = await startApp();
    assert.equal(ui.screen, 'home');
    assert.equal(getState().charId, 'deepseek');
    assert.equal(clock.speed, 0);
    assert.match(el.className, /app--home/);
  });

  it('存档读不了：回到标题页，说原因，给「导出原始存档」和「丢弃」；存档原文不动，丢弃要点两次', async () => {
    mem.set(SAVE_KEY, '{"status":"playing"}');
    const { el } = await startApp();
    assert.equal(ui.screen, 'title');
    assert.equal(getState(), null);
    assert.match(el.innerHTML, /读不了/);
    assert.match(el.innerHTML, /data-act="save-export"/);
    assert.match(el.innerHTML, /data-act="save-drop"/);
    assert.doesNotMatch(el.innerHTML, /data-act="continue"/);
    assert.equal(mem.get(SAVE_KEY), '{"status":"playing"}');
    click(el, 'save-export');
    assert.equal(downloads.length, 1);
    assert.match(downloads[0].name, /^model-raising-unreadable-\d+\.json$/);
    click(el, 'save-drop');
    assert.equal(mem.has(SAVE_KEY), true, '第一下只是要求确认');
    click(el, 'save-drop');
    assert.equal(mem.has(SAVE_KEY), false);
    assert.doesNotMatch(el.innerHTML, /读不了/);
  });

  it('垃圾存档（不是 JSON）：同样回标题页，不抛错', async () => {
    mem.set(SAVE_KEY, 'garbage<<<');
    const { el } = await startApp();
    assert.equal(ui.screen, 'title');
    assert.match(el.innerHTML, /不是有效的 JSON/);
  });

  it('v3 旧档：启动时读进来并备份原文到 mrp.sim.v2.bak；回标题把速度拨高，再点“继续”，时间归零回主界面', async () => {
    const raw = JSON.parse(fs.readFileSync(new URL(v3Files[0], FIXTURES), 'utf8'));
    raw.queue = []; raw.scheduled = [];
    const text = JSON.stringify(raw);
    mem.set(SAVE_KEY, text);
    const { app, el } = await startApp();
    assert.equal(mem.get(BAK_KEY), text, '迁移前没备份原文');
    assert.equal(mem.get(SAVE_KEY), text, '读档不该改存档');
    assert.equal(ui.screen, 'home');
    assert.equal(getState().v, E.SAVE_VERSION);
    ui.screen = 'title'; clock.speed = 5; overlayRoot.innerHTML = '';
    app.render();
    assert.match(el.innerHTML, /data-act="continue"/);
    click(el, 'continue');
    await tick();
    assert.equal(ui.screen, 'home');
    assert.equal(clock.speed, 0);
    assert.equal(getState().charId, raw.charId);
  });

  it('旧版存档键：标题页提示一次，点“知道了”以后不再出；旧版数据不动', async () => {
    mem.set('mrp.v0.1.0.save', '{"v":"0.1.0"}');
    mem.set('mrp.v0.1.0.byok', '{"key":"x"}');
    const { el, app } = await startApp();
    assert.match(el.innerHTML, /旧版（回合制）游戏的存档或设置/);
    assert.match(el.innerHTML, /data-act="legacy-ok"/);
    click(el, 'legacy-ok');
    assert.doesNotMatch(el.innerHTML, /旧版（回合制）游戏的存档或设置/);
    assert.equal(mem.get(LEGACY_SEEN_KEY), '1');
    app.render();
    assert.doesNotMatch(el.innerHTML, /旧版（回合制）游戏的存档或设置/);
    assert.equal(mem.get('mrp.v0.1.0.save'), '{"v":"0.1.0"}');
    assert.equal(mem.get('mrp.v0.1.0.byok'), '{"key":"x"}');
  });
});

describe('Esc 和结算页回看后台', () => {
  it('Esc 只关后台和选择面板；事件、跑分这类正等着玩家选的弹层不响应', async () => {
    const S = E.createGame('gpt', 'y2023', 2); S.queue.length = 0;
    await startApp();
    setState(S); ui.screen = 'home';
    const { openLayer } = await import('../../src/career/ui/state.js');
    openLayer('<div class="office"></div>', 'overlay--office');
    press('Escape');
    assert.equal(overlayRoot.innerHTML, '', 'Esc 没关掉后台');
    openLayer('<div class="picker"></div>', 'overlay--picker');
    press('Escape');
    assert.equal(overlayRoot.innerHTML, '', 'Esc 没关掉选择面板');
    for (const cls of ['overlay--event', 'overlay--bench', 'overlay--vn']) {
      openLayer('<div class="ev"></div>', cls);
      press('Escape');
      assert.notEqual(overlayRoot.innerHTML, '', `${cls} 不该被 Esc 关掉`);
      overlayRoot.innerHTML = '';
    }
    press('Escape');
    assert.equal(overlayRoot.innerHTML, '');
  });

  it('结算页的“回看后台”是只读的：打开后台带只读标记，改动不生效、不存档', async () => {
    const { s: ended } = playGame('deepseek', 'y2024', 3);
    assert.equal(ended.status, 'ended');
    const { app, el } = await startApp();
    setState(ended); ui.screen = 'result';
    app.render();
    assert.match(el.innerHTML, /data-act="office"/);
    click(el, 'office');
    const ov = overlayRoot.overlay;
    assert.ok(ov && ov.classList.contains('overlay--office'));
    assert.match(ov.office.innerHTML, /这一局已经结束，只能看/);
    mem.delete(SAVE_KEY);
    const before = JSON.stringify(ended);
    ov.handlers.click.forEach(fn => fn({ target: { closest: s => (s === '[data-page]' ? { dataset: { page: 'service' } } : null) } }));
    ov.handlers.change.forEach(fn => fn({ target: { dataset: { prod: 'chat' }, checked: false } }));
    assert.equal(JSON.stringify(ended), before);
    assert.equal(mem.has(SAVE_KEY), false, '只读的后台不该存档');
    press('Escape');
    assert.equal(overlayRoot.innerHTML, '');
    assert.equal(ui.screen, 'result');
  });
});
