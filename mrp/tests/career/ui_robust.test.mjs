// 界面健壮性（P0.4，规格 E9）：在 Node 里用一个最小的页面替身，验证 flow.js、office.js 和几个页面的容错和只读。
// 事件队列里的坏项不卡死、后台一页画不出来有错误卡、换局清掉后台草稿、结算页回看后台只读不存档、
// 回标题先存档、快捷入口禁用的真禁用、服务命令走引擎接口、榜单先截断再转义、新闻日期带年份。
// 浏览器里的部分（Esc 关后台、标题页读档失败卡、设置页导入）由主会话在浏览器里复核。
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import { registerKind } from '../../src/career/sim/queue.js';
import * as L from '../helpers/legacy_jobs.mjs';

// ---------- 页面替身 ----------
const toasts = [];
let writes = [];
const tick = () => new Promise(r => setImmediate(r));
function fakeEl() {
  return { className: '', textContent: '', innerHTML: '', classList: { add() {}, contains: () => false }, append(c) { toasts.push(c.textContent); }, remove() {} };
}
function makeOverlay(html) {
  const handlers = {};
  const office = { innerHTML: '' };
  const classes = (html.match(/class="overlay ([^"]*)"/)?.[1] || '').split(/\s+/);
  return {
    handlers, office,
    classList: { contains: c => classes.includes(c), add() {} },
    addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
    removeEventListener(type, fn) { handlers[type] = (handlers[type] || []).filter(f => f !== fn); },
    querySelector: sel => (sel === '.office' ? office : null),
    querySelectorAll: () => [],
  };
}
const overlayRoot = {
  _html: '', overlay: null,
  get innerHTML() { return this._html; },
  set innerHTML(v) { this._html = v; this.overlay = v ? makeOverlay(v) : null; },
  get firstElementChild() { return this.overlay; },
};
const toastRoot = fakeEl();
globalThis.document = { baseURI: 'http://localhost/', createElement: fakeEl, getElementById: id => (id === 'overlay-root' ? overlayRoot : id === 'toast-root' ? toastRoot : null) };
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); writes.push(k); }, removeItem: k => { mem.delete(k); } };

const ui = p => import(`../../src/career/ui/${p}`);
const { setState, getState, ui: U, clock } = await ui('state.js');
const { drainQueue, enterGame, backToTitle, releaseToast } = await ui('flow.js');
const { openOffice, resetOffice, PAGE } = await ui('office.js');
const { renderHome } = await ui('home.js');
const { eloBoard, scatter, barBoard, shareBars } = await ui('charts.js');
const { clipName, splitName } = await ui('fmt.js');
const { RELEASES } = await import('../../src/career/data/rivals.js');
const { SAVE_KEY } = await ui('storage.js');

// 括号成对：圆括号、方括号、花括号和各种中文括号，按栈配。
const PAIRS = { '（': '）', '(': ')', '【': '】', '[': ']', '「': '」', '『': '』', '《': '》', '〈': '〉', '{': '}' };
const bracketsBalanced = s => { const st = []; for (const c of s) { if (PAIRS[c]) st.push(PAIRS[c]); else if (Object.values(PAIRS).includes(c) && st.pop() !== c) return false; } return st.length === 0; };
const clickOn = (overlay, target) => overlay.handlers.click.forEach(f => f({ target }));
const changeOn = (overlay, target) => overlay.handlers.change.forEach(f => f({ target }));
const targetFor = (sel, dataset = {}) => ({ closest: s => (s === sel ? { dataset } : null) });
const game = (id = 'deepseek', sc = 'y2024', seed = 5) => { const s = E.createGame(id, sc, seed); s.queue.length = 0; return s; };
const saved = () => writes.includes(SAVE_KEY);

beforeEach(() => { toasts.length = 0; writes = []; mem.clear(); overlayRoot.innerHTML = ''; resetOffice(); });

describe('事件队列：放不出来的项丢掉，不卡住时间', () => {
  it('认不出的事件 id、认不出的行业大事、空项都被跳过：写公司日志、提示一声；中间好的那条照常放完', async () => {
    const S = game();
    S.queue.push({ kind: 'event', id: '__nope__' }, { kind: 'notice', title: '好的', text: '一条正常提示' }, { kind: 'world', id: '__nope2__' }, null);
    setState(S);
    const err = console.error; console.error = () => {};
    try {
      const done = drainQueue();
      await tick();
      // 第一条坏项已经被跳过，眼前是那条正常提示。
      assert.ok(overlayRoot.overlay, '正常提示没有弹出来');
      assert.match(overlayRoot.innerHTML, /一条正常提示/);
      clickOn(overlayRoot.overlay, targetFor('[data-choice]', { choice: 'ok' }));
      await done;
    } finally { console.error = err; }
    assert.equal(S.queue.length, 0);
    assert.equal(S.log.filter(l => l.text.includes('跳过了一条无法显示的事件')).length, 3);
    assert.ok(S.log.some(l => l.text.includes('__nope__')) && S.log.some(l => l.text.includes('__nope2__')));
    assert.equal(toasts.filter(t => t === '跳过了一条无法显示的事件').length, 3);
    assert.equal(overlayRoot.innerHTML, '', '放完以后弹层要关掉');
    assert.ok(saved());
  });

  it('出错在出队之后（结果卡渲染失败）：已经出队的不再删，下一条不会被误删', async () => {
    registerKind('zz_robust', {
      view: () => ({ kind: 'zz_robust', tag: '测试', title: '测试事件', text: '正文', lines: [], choices: [{ id: 'a', label: '选 A', hint: '' }] }),
      resolve: () => ({ toString() { throw new Error('结果文字渲染失败'); } }),
    });
    const S = game();
    S.queue.push({ kind: 'zz_robust' }, { kind: 'notice', title: '后面的', text: '后面那条不能丢' });
    setState(S);
    const err = console.error; console.error = () => {};
    try {
      const done = drainQueue();
      await tick();
      clickOn(overlayRoot.overlay, targetFor('[data-choice]', { choice: 'a' }));
      await tick();
      assert.match(overlayRoot.innerHTML, /后面那条不能丢/, '下一条被误删了');
      clickOn(overlayRoot.overlay, targetFor('[data-choice]', { choice: 'ok' }));
      await done;
    } finally { console.error = err; }
    assert.equal(S.queue.length, 0);
    assert.equal(S.log.filter(l => l.text.includes('跳过了一条无法显示的事件')).length, 1);
  });

  it('队列里全是坏项也会很快放完，不会死循环', async () => {
    const S = game();
    for (let i = 0; i < 50; i++) S.queue.push(i % 2 ? { kind: 'event', id: `bad${i}` } : { kind: `nokind${i}` });
    setState(S);
    const err = console.error; console.error = () => {};
    try { await drainQueue(); } finally { console.error = err; }
    assert.equal(S.queue.length, 0);
    assert.equal(S.log.length, 50);
  });
});

describe('后台：一页画不出来、换局、只读', () => {
  const withPage = (id, page, fn) => { const orig = PAGE[id]; PAGE[id] = page; try { return fn(); } finally { PAGE[id] = orig; } };
  const boom = { render() { throw new Error('页面炸了'); } };

  it('某一页 render 抛错：这页换成错误卡（带原因和「返回」），导航还在；返回回到上一个好页', () => {
    setState(game());
    const err = console.error; console.error = () => {};
    try {
      withPage('news', boom, () => {
        openOffice('model');
        const overlay = overlayRoot.overlay;
        const office = overlay.office;
        assert.doesNotMatch(office.innerHTML, /这一页没能显示出来/);
        clickOn(overlay, targetFor('[data-page]', { page: 'news' }));
        assert.match(office.innerHTML, /这一页没能显示出来/);
        assert.match(office.innerHTML, /页面炸了/);
        assert.match(office.innerHTML, /data-back/);
        assert.match(office.innerHTML, /data-page="settings"/, '导航不能跟着丢');
        clickOn(overlay, targetFor('[data-back]'));
        assert.doesNotMatch(office.innerHTML, /这一页没能显示出来/);
        assert.match(office.innerHTML, /<h2>模型<\/h2>|class="is-on" data-page="model"/);
      });
    } finally { console.error = err; }
  });

  it('一打开就是画不出来的页：「返回」没有上一页可回，就关掉后台', () => {
    setState(game());
    const err = console.error; console.error = () => {};
    try {
      withPage('news', boom, () => {
        openOffice('news');
        assert.match(overlayRoot.overlay.office.innerHTML, /这一页没能显示出来/);
        clickOn(overlayRoot.overlay, targetFor('[data-back]'));
        assert.equal(overlayRoot.innerHTML, '');
      });
    } finally { console.error = err; }
  });

  it('resetOffice / 换局：当前页、立项和蒸馏草稿、榜单和股票选择都回到初始', async () => {
    let st = null;
    const S = game();
    setState(S);
    withPage('model', { render: (_S, s) => { st = s; return '<p>m</p>'; } }, () => {
      openOffice('model', { proj: { total: 70, arch: 'dense' }, distill: { teacher: 'self' } });
      assert.deepEqual(st.proj, { total: 70, arch: 'dense' });
      st.page = 'boards'; st.bench = 'mmlu'; st.cls = 'small'; st.board = 'usage'; st.ticker = 'AAPL';
    });
    const S2 = game('suno', 'y2025', 3);
    await enterGame(S2);
    assert.equal(st.page, 'model');
    assert.equal(st.proj, null);
    assert.equal(st.distill, null);
    assert.equal(st.bench, null);
    assert.equal(st.cls, '');
    assert.equal(st.board, 'bench');
    assert.equal(st.ticker, 'NVDA');
    assert.equal(st.readOnly, false);
  });

  it('只读（结算页回看）：改动一律不做、不存档，提示一声；不只读时同样的操作生效并存档', () => {
    const S = game();
    setState(S);
    openOffice('service', { readOnly: true });
    assert.match(overlayRoot.overlay.office.innerHTML, /只能看/);
    const before = JSON.stringify(S);
    changeOn(overlayRoot.overlay, { dataset: { prod: 'chat' }, checked: false });
    changeOn(overlayRoot.overlay, { dataset: { infer: '' }, value: '55' });
    assert.equal(JSON.stringify(S), before, '只读时状态被改了');
    assert.equal(saved(), false, '只读时不能存档');
    assert.equal(toasts.filter(t => t.includes('只能看')).length, 2);
    // 同样的操作不只读时生效。
    openOffice('service', { readOnly: false });
    changeOn(overlayRoot.overlay, { dataset: { prod: 'chat' }, checked: false });
    assert.equal(S.products.chat.on, false);
    assert.equal(saved(), true);
  });

  it('设置页：只读时只留「导出存档」和「回到标题」，没有放弃和导入', () => {
    const S = game();
    const rw = PAGE.settings.render(S, {});
    const ro = PAGE.settings.render(S, { readOnly: true });
    for (const op of ['export', 'import', 'title', 'abandon']) assert.match(rw, new RegExp(`data-op="${op}"`));
    for (const op of ['export', 'title']) assert.match(ro, new RegExp(`data-op="${op}"`));
    for (const op of ['import', 'abandon']) assert.doesNotMatch(ro, new RegExp(`data-op="${op}"`));
    // 就算有人硬发事件，只读时放弃和导入也不起作用。
    setState(S);
    openOffice('settings', { readOnly: true });
    clickOn(overlayRoot.overlay, targetFor('[data-op]', { op: 'abandon' }));
    clickOn(overlayRoot.overlay, targetFor('[data-op]', { op: 'import-confirm' }));
    assert.equal(getState(), S);
  });

  it('设置页导入：先走 safeLoadState，读不了提示原因；读得了先让玩家确认，确认后换局并存档；打完的局不让导入', async () => {
    const S = game();
    setState(S);
    openOffice('settings');
    const input = text => ({ dataset: { import: '' }, value: 'x', files: [{ text: async () => text }] });
    // 垃圾文件。
    changeOn(overlayRoot.overlay, input('{'));
    await tick();
    assert.ok(toasts.some(t => t.startsWith('导入失败：')), toasts.join('|'));
    assert.doesNotMatch(overlayRoot.overlay.office.innerHTML, /data-op="import-confirm"/);
    // 打完的局。
    const ended = game('qwen', 'y2025', 8); ended.status = 'ended';
    changeOn(overlayRoot.overlay, input(JSON.stringify(ended)));
    await tick();
    assert.ok(toasts.some(t => t.includes('已经打完')));
    // 好存档：出确认，还没换。
    const other = game('claude', 'y2024', 11);
    changeOn(overlayRoot.overlay, input(JSON.stringify(other)));
    await tick();
    assert.match(overlayRoot.overlay.office.innerHTML, /data-op="import-confirm"/);
    assert.equal(getState(), S);
    assert.equal(saved(), false);
    clickOn(overlayRoot.overlay, targetFor('[data-op]', { op: 'import-confirm' }));
    await tick();
    assert.equal(getState().charId, 'claude');
    assert.equal(U.screen, 'home');
    assert.equal(saved(), true);
    assert.equal(JSON.parse(mem.get(SAVE_KEY)).charId, 'claude');
  });
});

describe('换局、回标题', () => {
  it('enterGame：时间归零，台词、月报卡、跳过的建议清掉，回主界面，可选马上存档', async () => {
    setState(game());
    clock.speed = 3; U.skip.add('2024-03|x'); U.report = { until: 1, html: 'x' }; U.lineIdx = 7; U.emotion = 'happy'; U.moreOpen = true; U.screen = 'title';
    const S2 = game('gpt', 'y2023', 2);
    await enterGame(S2, { persist: true });
    assert.equal(getState(), S2);
    assert.equal(clock.speed, 0);
    assert.equal(U.skip.size, 0);
    assert.equal(U.report, null);
    assert.equal(U.lineIdx, 0);
    assert.equal(U.emotion, 'neutral');
    assert.equal(U.moreOpen, false);
    assert.equal(U.screen, 'home');
    assert.ok(saved());
    writes = [];
    await enterGame(game('gpt', 'y2024', 2));
    assert.equal(saved(), false, '不要求存档时不写存储');
  });

  it('backToTitle：进行中的局先存档再回标题；打完的局不重存', () => {
    const S = game();
    setState(S); U.screen = 'home';
    backToTitle();
    assert.equal(U.screen, 'title');
    assert.ok(saved());
    writes = [];
    S.status = 'ended';
    backToTitle();
    assert.equal(saved(), false);
  });
});

describe('主界面和图表小修', () => {
  it('快捷入口：用不了的真禁用（带 disabled），能用的不带', () => {
    const S = E.createGame('deepseek', 'y2023', 1);
    assert.equal(E.availableActions(S).eval, false);
    assert.equal(E.availableActions(S).release, false);
    setState(S);
    const app = { className: '', innerHTML: '' };
    renderHome(app);
    const btn = id => app.innerHTML.match(new RegExp(`<button class="quick-btn[^"]*" data-act="quick" data-id="${id}"[^>]*>`))?.[0];
    for (const id of ['eval', 'release']) { assert.match(btn(id), /is-off/, id); assert.match(btn(id), /\sdisabled/, id); }
    for (const id of ['data', 'compute', 'news']) { assert.ok(btn(id), id); assert.doesNotMatch(btn(id), /disabled|is-off/, id); }
  });

  it('“下一步”每次渲染都重算 advise()，源码里没有手拼的缓存键', () => {
    const src = fs.readFileSync(new URL('../../src/career/ui/home.js', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /adviceCache/);
    assert.doesNotMatch(src, /JSON\.stringify\(S\.focus\)/);
  });

  it('榜单名字先截断再转义：不会把 &amp; 这样的转义切成半截；截断的名字末尾带省略号，总共不超过 18 个字', () => {
    const rows = [{ rank: 1, name: '&'.repeat(30), score: 1300, votes: 5000 }, { rank: 2, name: '<b>x</b>'.repeat(5), score: 1250 }, { rank: 3, name: '模型'.repeat(12), score: 1200 }];
    const svg = eloBoard(rows);
    const labels = [...svg.matchAll(/class="lbl">(\d+)\. ([^<]*)<\/text>/g)].map(m => m[2]);
    assert.equal(labels.length, 3);
    assert.equal(labels[0], `${'&amp;'.repeat(17)}…`);
    assert.match(labels[1], /^(&lt;b&gt;x&lt;\/b&gt;)+(&lt;b&gt;x)?/);
    assert.doesNotMatch(labels[1], /&(l|g|lt|gt|am|amp)?(?![a-z]*;)/, '转义被切断了');
    assert.equal(labels[2], `${'模型'.repeat(8)}模…`);
    assert.doesNotMatch(svg, /<b>/, '名字没转义');
  });

  it('榜单截断名字不留半个括号：截在括号里的，退到括号前面截并加省略号（“Claude 3.5 Sonnet（新版）”→“Claude 3.5 Sonnet…”）', () => {
    const labelsOf = names => [...eloBoard(names.map((name, i) => ({ rank: i + 1, name, score: 1300 - i * 10, votes: 4000 }))).matchAll(/class="lbl">\d+\. ([^<]*)<\/text>/g)].map(m => m[1]);
    const got = labelsOf(['Claude 3.5 Sonnet（新版）', 'Claude 3.7 Sonnet（训练中）', 'Llama 3.1 405B (instruct preview)', 'GPT-4（旧）Turbo Preview Long', 'DeepSeek-V3（0324）', 'o1']);
    assert.deepEqual(got, ['Claude 3.5 Sonnet…', 'Claude 3.7 Sonnet…', 'Llama 3.1 405B…', 'GPT-4（旧）Turbo Pre…', 'DeepSeek-V3（0324）', 'o1']);
    for (const g of got) assert.ok(bracketsBalanced(g), g);
    // 名字不超长就一个字不动，括号在不在里面都一样。
    assert.deepEqual(labelsOf(['GPT-4（测试版）', 'Qwen3（思考）']), ['GPT-4（测试版）', 'Qwen3（思考）']);
  });

  it('clipName：任何名字、任何长度都不留不成对的括号；超长的必带省略号；不超长的一个字不动；按字符数算，不劈开表情', () => {
    const names = [...new Set([...RELEASES.map(r => r.name), 'a（b（c）d）e（f）g', '【Beta】Model（preview long name）', 'X 【Beta】 Preview 2025 Edition', '😀'.repeat(30), '《某某》（试验）'.repeat(3)])];
    assert.ok(names.length > 200, `${names.length} 个名字`);
    const len = s => Array.from(s).length;
    let cut = 0;
    for (const name of names) {
      assert.ok(bracketsBalanced(name), `测试用的名字本身要成对：${name}`);
      for (let max = 2; max <= 30; max++) {
        const out = clipName(name, max);
        if (len(name) <= max) { assert.equal(out, name); continue; }
        cut++;
        assert.match(out, /…[）)】\]」』》〉}]*$/, `${name} @${max} → ${out}`);
        assert.ok(bracketsBalanced(out), `${name} @${max} → ${out}：括号不成对`);
        if (!/^[（(【\[「『《〈{]/.test(out)) assert.ok(len(out) <= max, `${name} @${max} → ${out}：超长了`);
      }
    }
    assert.ok(cut > 1000, `${cut} 次截断`);
    assert.equal(clipName('😀'.repeat(30), 5), `${'😀'.repeat(4)}…`);
    // 括号前面一个字都没有：保留括号，补上右括号，仍然成对。
    assert.equal(clipName('（内测版很长很长很长很长很长很长很长）', 8), '（内测版很长很…）');
    assert.equal(clipName(undefined, 5), '');
  });

  it('条形榜、调用量榜：名字拆成主名和括号后缀，手机上（≤480px）后缀不显示，省略号只截主名；完整名字在 title 里', () => {
    const names = ['GPT-3.5（ChatGPT）', 'Gemini 2.5 Pro（正式版）', 'Mistral Medium（2505）', 'Grok-1（开放权重）', 'Llama 3.1 405B (instruct preview)', 'GPT-4（旧）Turbo Preview Long', '（内测版）', 'o1', 'A&B（<x>）'];
    const unesc = t => t.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');
    const rows = names.map((name, i) => ({ rank: i + 1, name, company: '某公司', score: 90 - i, value: 100 - i, open: i === 1 }));
    for (const html of [barBoard(rows), shareBars(rows)]) {
      const items = [...html.matchAll(/<span class="nm" title="([^"]*)">(.*?)<\/span>\s*<span class="track">/g)];
      assert.equal(items.length, names.length);
      items.forEach(([, title, inner], i) => {
        const name = names[i];
        assert.ok(unesc(title).startsWith(name), `title 里要有完整名字：${title}`);
        const sfx = inner.match(/<span class="nm-sfx">([^<]*)<\/span>/)?.[1] ?? '';
        const main = inner.replace(/<span class="nm-sfx">[^<]*<\/span>/, '').replace(/<i class="tag-open">[^<]*<\/i>/, '');
        // 电脑上两段拼起来就是原名；手机上只剩主名：主名里没有括号（截在哪儿都不会留半个括号），名字以括号开头的不拆。
        assert.equal(unesc(main + sfx), name);
        if (/^[（(【\[「『《〈{]/.test(name)) assert.equal(sfx, '', name);
        else assert.ok(!/[（(【\[「『《〈{）)】\]」』》〉}]/.test(unesc(main)), `主名里还有括号：${main}`);
      });
    }
    assert.deepEqual(splitName('GPT-3.5（ChatGPT）'), ['GPT-3.5', '（ChatGPT）']);
    assert.deepEqual(splitName('Llama 3.1 405B (instruct preview)'), ['Llama 3.1 405B', ' (instruct preview)']);
    assert.deepEqual(splitName('o1'), ['o1', '']);
    assert.deepEqual(splitName('（内测版）'), ['（内测版）', '']);
    for (const r of RELEASES) { const [a, b] = splitName(r.name); assert.equal(a + b, r.name); assert.ok(bracketsBalanced(a), r.name); }
    // 样式表：≤480px 的断点里藏起后缀；名字一栏仍然是一行加省略号。
    const mobile = fs.readFileSync(new URL('../../src/career/css/mobile.css', import.meta.url), 'utf8');
    const phone = [...mobile.matchAll(/@media \(max-width: 480px\) \{([\s\S]*?)\n\}/g)].map(m => m[1]).join('\n');
    assert.match(phone, /\.bars \.nm-sfx \{ display: none; \}/);
    const base = fs.readFileSync(new URL('../../src/career/css/base.css', import.meta.url), 'utf8');
    assert.match(base, /\.bars \.nm \{ white-space: nowrap; overflow: hidden; text-overflow: ellipsis; \}/);
  });

  it('散点图标签（超过 22 个字时截断）也不留半个括号', () => {
    const pts = [{ x: 1, y: 70, label: 'Claude 3.5 Sonnet（新版 Long Context Preview）', mine: true }, { x: 5, y: 80, label: 'Llama 3.1 405B (instruct preview) extra long', mine: true }, { x: 9, y: 85, label: 'o1', mine: true }];
    const labels = [...scatter(pts).matchAll(/class="lbl">([^<]*)<\/text>/g)].map(m => m[1]);
    assert.deepEqual(labels, ['Claude 3.5 Sonnet…', 'Llama 3.1 405B…', 'o1']);
  });

  it('新闻日期带年份：有具体日子的是「年 / 月/日」，只有月份的本来就带年', () => {
    const S = game();
    S.news = [{ date: '2024-03', day: '2024-03-05', type: 'release', title: '甲', detail: '' }, { date: '2023-11', type: 'event', title: '乙', detail: '' }];
    const html = PAGE.news.render(S, {});
    assert.match(html, /<span>2024<br>3\/5<\/span>/);
    assert.match(html, /<span>2023-11<\/span>/);
  });
});

describe('服务页、算力页走引擎接口', () => {
  const run = f => f();
  it('出租张数：按实际卡数钳制（超过的只租手里有的，负数当 0）', () => {
    const S = game();
    const n = E.gpuCount(S);
    PAGE.compute.change(S, { dataset: { lease: '' }, value: String(n + 99999) }, { guard: run });
    assert.equal(S.products.gpu_lease.gpus, n);
    PAGE.compute.change(S, { dataset: { lease: '' }, value: '-64' }, { guard: run });
    assert.equal(S.products.gpu_lease.gpus, 0);
    PAGE.compute.change(S, { dataset: { lease: '' }, value: '640' }, { guard: run });
    assert.equal(S.products.gpu_lease.gpus, 640);
  });
  it('价格档和小模型 API 开关：合法的生效，未知的档位由引擎拒绝', () => {
    const S = game();
    PAGE.service.change(S, { dataset: { tier: 'api', key: 'tier' }, value: 'premium' }, { guard: run });
    PAGE.service.change(S, { dataset: { tier: 'api', key: 'smallTier' }, value: 'standard' }, { guard: run });
    assert.equal(S.products.api.tier, 'premium');
    assert.equal(S.products.api.smallTier, 'standard');
    // 不认识的档位：先被命令参数表拦下（M4 起界面写操作走命令表），引擎那一道也还在。
    assert.throws(() => PAGE.service.change(S, { dataset: { tier: 'api', key: 'tier' }, value: 'free' }, { guard: run }), /未知的价格档位|参数「tier」/);
    assert.throws(() => PAGE.service.change(S, { dataset: { tier: 'chat', key: 'smallTier' }, value: 'budget' }, { guard: run }), /未知的价格设置/);
    PAGE.service.change(S, { dataset: { prodSmall: '' }, checked: false }, { guard: run });
    assert.equal(S.products.api.small, false);
    PAGE.service.change(S, { dataset: { prodSmall: '' }, checked: true }, { guard: run });
    assert.equal(S.products.api.small, true);
  });
  it('两个页面的源码里不再直接写 S.products', () => {
    for (const f of ['service.js', 'compute.js']) {
      const src = fs.readFileSync(new URL(`../../src/career/ui/pages/${f}`, import.meta.url), 'utf8');
      assert.doesNotMatch(src, /S\.products[\w.[\]'"]*\s*=[^=]/, f);
    }
  });
});

describe('发布后的提示', () => {
  // 训练线的副线（比在线旗舰弱、没勾“顶替”）不上线服务，提示不能写“今天全量”（G1 遗留 #9）。
  const release = weaker => {
    const S = game('gpt', 'y2024', 5);
    const live = E.liveModel(S), w = E.workingModel(S);
    for (const k of Object.keys(w.dims)) w.dims[k] = weaker ? Math.max(0, (live.dims[k] ?? 0) - 8) : 99;
    w.postDays = (w.postDays || 0) + 40;
    return [S, L.decide(S, 'release', {})];
  };
  it('训练线的副线：写“作为副线发布”，不写灰度和全量', () => {
    const [S, r] = release(true);
    assert.equal(r.line, 'side');
    const msg = releaseToast(S, r);
    assert.match(msg, /作为副线发布：成绩已公布，不替换在线服务/);
    assert.doesNotMatch(msg, /灰度|全量/);
  });
  it('顶替在线旗舰的：照旧写几天后全量', () => {
    const [S, r] = release(false);
    assert.equal(r.line, 'main');
    assert.match(releaseToast(S, r), /开始灰度上线，.+全量/);
    assert.doesNotMatch(releaseToast(S, r), /副线/);
  });
  it('小模型线比在线旗舰弱也照样灰度上线：写几天后全量', () => {
    const S = game('deepseek', 'y2026', 1);
    assert.ok(E.smallWorking(S), '开局要有待发布的小模型');
    const r = L.decide(S, 'release', { role: 'small' });
    assert.equal(r.line, 'side');
    assert.match(releaseToast(S, r), /开始灰度上线，.+全量/);
  });
});
