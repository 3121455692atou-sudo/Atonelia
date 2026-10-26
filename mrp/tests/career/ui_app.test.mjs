// 主流程 ui/app.js 在页面替身上跑一遍（P0.4）：启动读档、标题页（读档失败卡、旧 schema 拒绝、继续）、Esc、结算页回看后台。
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
  return { handlers, office: { innerHTML: '' }, get isConnected() { return overlayRoot.overlay === this; }, classList: { contains: c => classes.includes(c) }, addEventListener(t, fn) { (handlers[t] ||= []).push(fn); }, removeEventListener() {}, querySelector(sel) { return sel === '.office' ? this.office : null; }, querySelectorAll: () => [] };
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
globalThis.CSS ??= { escape: value => String(value) };
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); } };

const FIXTURES = new URL('../fixtures/saves/', import.meta.url);
const v3Files = fs.readdirSync(FIXTURES).filter(f => f.endsWith('.json') && !f.startsWith('._'));
const { getState, setState, ui, clock } = await import('../../src/career/ui/state.js');
const { SAVE_KEY } = await import('../../src/career/ui/storage.js');
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
  b.dataset.id = id;
  el.handlers.click.forEach(fn => fn({ target: { closest: sel => (sel === '[data-act]' ? b : null) } }));
};
const setupClick = (el, setupAction, setupValue) => {
  const b = {dataset:{act:'play-setup',setupAction,setupValue},disabled:false};
  el.handlers.click.forEach(fn=>fn({target:{closest:sel=>sel==='[data-act]'?b:null}}));
};

beforeEach(() => {
  toasts.length = 0; downloads.length = 0; mem.clear(); btns.clear(); overlayRoot.innerHTML = '';
  setState(null); ui.screen = 'title'; clock.speed = 0; clock.busy = false;
});

describe('公司介绍内直接设置并开局', () => {
  for (const [mode,preset] of [['post','auto'],['full','auto'],['full','manual']]) {
    it(`${mode}/${preset}：选公司后原地选玩法，直接开始，保存采用的设置`, async () => {
      const {el}=await startApp();
      click(el,'new');click(el,'pick','deepseek');
      const launch=el.innerHTML.slice(el.innerHTML.indexOf('<footer class="select-detail__launch">'));
      assert.match(launch,/data-setup-action="mode" data-setup-value="post"/);
      assert.match(launch,/data-setup-action="mode" data-setup-value="full"/);
      assert.match(launch,/data-act="start" data-id="deepseek" disabled/);
      // An unselected mode cannot accidentally overwrite the current save.
      click(el,'start','deepseek');
      assert.equal(getState(),null);assert.equal(mem.has(SAVE_KEY),false);
      setupClick(el,'mode',mode);
      if(mode==='full')setupClick(el,'preset',preset);
      assert.equal(ui.screen,'select');assert.equal(ui.pick,'deepseek');
      assert.doesNotMatch(el.innerHTML,/data-act="start"[^>]*disabled/);
      assert.equal(mem.has(SAVE_KEY),false);
      click(el,'start','deepseek');await tick();
      assert.equal(ui.screen,'home');assert.equal(getState().charId,'deepseek');
      assert.equal(E.isPostOnly(getState()),mode==='post');
      assert.ok(Object.values(getState().automation.modules).every(m=>m.mode===preset));
      assert.equal(JSON.parse(mem.get(SAVE_KEY)).charId,'deepseek');
    });
  }
  it('切换公司或剧本保留自动化选择，逐项设置只修改对应模块', async () => {
    const {el}=await startApp();click(el,'new');click(el,'pick','deepseek');
    setupClick(el,'mode','full');setupClick(el,'preset','manual');setupClick(el,'toggle','data');
    const settings=structuredClone(ui.playSetup.modes);
    click(el,'unpick');click(el,'scenario','y2025');click(el,'pick','qwen');
    assert.equal(ui.pick,'qwen');assert.equal(ui.scenario,'y2025');
    assert.deepEqual(ui.playSetup.modes,settings);
    assert.equal(settings.data,'auto');assert.equal(settings.research,'manual');
    assert.doesNotMatch(el.innerHTML,/data-act="start"[^>]*disabled/);
    click(el,'start','qwen');await tick();
    assert.equal(getState().charId,'qwen');assert.equal(getState().automation.modules.data.mode,'auto');
    assert.equal(getState().automation.modules.research.mode,'manual');
  });
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
    const S = E.createSinglePlayerGame('deepseek', 'y2024', 5); S.queue.length = 0;
    mem.set(SAVE_KEY, JSON.stringify(S));
    clock.speed = 4;
    const { el } = await startApp();
    assert.equal(ui.screen, 'home');
    assert.equal(getState().charId, 'deepseek');
    assert.deepEqual(getState().postPlanSessions, S.postPlanSessions);
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
    assert.equal(getState(), null);
    assert.equal(mem.get(SAVE_KEY), 'garbage<<<');
    assert.equal(mem.has('mrp.sim.v2.bak'), false);
  });

  it('v3 旧档：明确拒绝不支持的格式，不迁移、不覆盖原档或已有备份，仍可导出', async () => {
    const raw = JSON.parse(fs.readFileSync(new URL(v3Files[0], FIXTURES), 'utf8'));
    raw.queue = []; raw.scheduled = [];
    const text = JSON.stringify(raw);
    mem.set(SAVE_KEY, text);
    mem.set('mrp.sim.v2.bak', '原有备份');
    const { el } = await startApp();
    assert.equal(mem.get('mrp.sim.v2.bak'), '原有备份', '拒绝旧档不能覆盖已有备份');
    assert.equal(mem.get(SAVE_KEY), text, '拒绝旧档不能改原文');
    assert.equal(ui.screen, 'title');
    assert.equal(getState(), null, '不能偷偷迁移并安装旧档');
    assert.match(el.innerHTML, /不支持旧版.*请新开一局/);
    assert.doesNotMatch(el.innerHTML, /data-act="continue"/);
    click(el, 'save-export');
    assert.equal(downloads.length, 1);
    assert.equal(mem.get(SAVE_KEY), text);
  });

  it('当前格式存档：回标题把速度拨高，再点“继续”，时间归零且卡牌账本不变', async () => {
    const S = E.createSinglePlayerGame('deepseek', 'y2025', 7); S.queue.length = 0;
    const opened = E.applyCommand(S, { name: 'postPlan.open', args: { modelId: S.working, expectedModelToken: null } });
    assert.equal(opened.ok, true, opened.err);
    const text = JSON.stringify(S);
    mem.set(SAVE_KEY, text);
    const { app, el } = await startApp();
    assert.equal(ui.screen, 'home');
    ui.screen = 'title'; clock.speed = 5; overlayRoot.innerHTML = '';
    app.render();
    assert.match(el.innerHTML, /data-act="continue"/);
    click(el, 'continue');
    await tick();
    assert.equal(ui.screen, 'home');
    assert.equal(clock.speed, 0);
    assert.equal(getState().charId, S.charId);
    assert.deepEqual(getState().postPlanSessions, S.postPlanSessions);
    assert.equal(mem.get(SAVE_KEY), text);
    assert.equal(mem.has('mrp.sim.v2.bak'), false, '当前格式不能走旧档迁移备份');
  });

  it('旧版存储键不再扫描提示，也不写入已读标记；原有数据不动', async () => {
    mem.set('mrp.v0.1.0.save', '{"v":"0.1.0"}');
    mem.set('mrp.v0.1.0.byok', '{"key":"x"}');
    const before = new Map(mem);
    const { el, app } = await startApp();
    assert.equal(ui.screen, 'title');
    assert.doesNotMatch(el.innerHTML, /旧版（回合制）游戏的存档或设置|data-act="legacy-ok"/);
    assert.doesNotMatch(el.innerHTML, /data-act="continue"/);
    app.render();
    assert.deepEqual(mem, before);
    assert.equal(mem.has('mrp.sim.legacy-seen'), false);
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


describe('自洽开局输入错误恢复', () => {
  it('合法→非法→合法和空值会更新错误与开始按钮；忽略其他字段；输入不触发开局', async () => {
    const { el } = await startApp();
    const { defaultSolo, soloClick, renderSolo } = await import('../../src/career/ui/pages/solo_setup.js');
    ui.screen = 'solo'; ui.solo = defaultSolo(false,'post');
    const boxes = { name: {textContent:''}, brand: {textContent:''} };
    const start = { disabled:false };
    el.querySelector = sel => sel === '[data-act="solo-start"]' ? start : boxes[sel.match(/data-error="(name|brand)"/)?.[1]] || null;
    const input = (key, value, isComposing=false) => el.handlers.input.forEach(fn => fn({target:{dataset:{solo:key},value},isComposing}));
    for (const [key, valid, invalid] of [['brand','Aurora','Aurora 7'],['name','星河测试','A']]) {
      input(key,valid); assert.equal(boxes[key].textContent,''); assert.equal(start.disabled,false);
      input(key,invalid); assert.ok(boxes[key].textContent); assert.equal(start.disabled,true);
      input(key,valid); assert.equal(boxes[key].textContent,''); assert.equal(start.disabled,false);
      input(key,''); assert.ok(boxes[key].textContent); assert.equal(start.disabled,true);
      input(key,valid,true); assert.equal(boxes[key].textContent,''); assert.equal(start.disabled,false);
      assert.equal(ui.screen,'solo','合成输入只更新草稿，不自动开局');
    }
    const before=JSON.stringify(ui.solo); start.disabled=true; boxes.brand.textContent='保留提示';
    input('count','3'); assert.equal(JSON.stringify(ui.solo),before); assert.equal(start.disabled,true); assert.equal(boxes.brand.textContent,'保留提示');
    input('brand','Aurora');
    soloClick(ui.solo,{dataset:{act:'solo-set',key:'country',value:'US'}});
    const html=renderSolo(ui.solo);
    assert.match(html,/美国：市场最大/); assert.doesNotMatch(html,/data-act="solo-start" disabled/);
  });
});


it('自洽终局再来一局走标题离开路径，不裸刷新重入终局', async () => {
  const {el}=await startApp();
  const {setWorld}=await import('../../src/career/ui/state.js');
  const world={result:{kind:'world'},companies:{}};
  setWorld(world);ui.screen='result';
  try { click(el,'new'); assert.equal(ui.screen,'title'); }
  finally { setWorld(null); }
});
