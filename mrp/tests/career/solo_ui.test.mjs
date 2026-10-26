// 单人 · 自洽世界的界面（M1d，规格 M.2、M.7、E8 末尾）：开局设置页、世界时钟、存档分发、
// 同场公司、新闻双标签、算力报价、手机版面。史实模式的同一批页面在改动前后逐字一致。
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import * as E from '../../src/career/engine.js';
import { COMPANIES } from '../../src/career/data/core.js';
import { cssAt } from '../helpers/css.mjs';
import { restoreHistory } from '../helpers/world_provider.mjs';
import { P } from '../../src/career/sim/provider.js';

// fmt.js 在模块加载时就要读 document.baseURI，界面模块必须等替身装好再动态加载。
globalThis.document ??= { baseURI: 'http://localhost/' };
const solo = await import('../../src/career/ui/pages/solo_setup.js');
const { PAGE, PAGES, pageVisible } = await import('../../src/career/ui/office.js');
const state = await import('../../src/career/ui/state.js');
const { saveKind } = await import('../../src/career/ui/storage.js');

const freshSt = (x = {}) => ({ page: 'model', bench: null, cls: '', board: 'bench', ticker: 'NVDA', newsTab: 'me', ...x });
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const BAD = /undefined|NaN|\[object|(?<![\w-])null(?![\w-])|Infinity/;
const HIST_PAGES = ['rivals', 'news', 'compute', 'market'];
const HIST_CASES = [['deepseek', 'y2024'], ['gpt', 'y2023'], ['suno', 'y2025']];

// 先在 Provider 还是史实的时候拍一份渲染结果；自洽世界跑完以后再拍一次，逐字比较。
function historySnap() {
  return HIST_CASES.map(([id, sc]) => {
    const s = E.createGame(id, sc, 7);
    const out = {};
    for (const p of HIST_PAGES) out[p] = PAGE[p].render(s, freshSt({ page: p }));
    return { id, sc, out };
  });
}
const HIST_BEFORE = historySnap();

let world = null;
let player = null;

describe('开局设置页（规格 M.2.1–M.2.3）', () => {
  it('从零、分岔两种都能渲染，单列整页滚动，不出现 undefined / NaN', () => {
    const zero = solo.renderSolo(solo.defaultSolo(false));
    const forkDraft = { ...solo.defaultSolo(false), mode: 'fork' };
    const fork = solo.renderSolo(forkDraft);
    for (const html of [zero, fork]) {
      assert.equal(typeof html, 'string');
      assert.ok(html.length > 2000, `只渲染了 ${html.length} 个字符`);
      assert.doesNotMatch(text(html), BAD);
    }
    assert.match(zero, /我的公司/);
    assert.match(zero, /学界起点/);
    assert.match(fork, /接手哪一家/);
    assert.match(zero, /class="solo-screen"/);
    assert.doesNotMatch(fork, /我的公司/);
  });

  it('品牌词和公司名：长度、通用词、真实品牌、真实型号、电脑公司重名，各有中文原因', () => {
    assert.match(solo.companyError('A'), /2 到 16 个字/);
    assert.match(solo.companyError('OpenAI'), /现实里的公司重名/);
    assert.match(solo.companyError('青穹智能'), /电脑公司/);
    assert.match(solo.brandError('ab'), /至少 3 个字母/);
    assert.match(solo.brandError('晨'), /至少 2 个字/);
    assert.match(solo.brandError('pro'), /通用词/);
    assert.match(solo.brandError('Claude'), /真实公司的品牌词/);
    assert.match(solo.brandError('Mixtral'), /真实公司的品牌词/);
    assert.match(solo.brandError('青穹'), /电脑公司/);
    assert.equal(solo.brandError('晨光'), null);
    assert.equal(solo.companyError('晨光智能'), null);
    // 设置页把原因写在输入框下面，按钮同时置灰。
    const bad = { ...solo.defaultSolo(false), brand: 'pro', name: 'A' };
    const html = solo.renderSolo(bad);
    assert.match(html, /data-error="brand">[^<]*通用词/);
    assert.match(html, /data-error="name">[^<]*2 到 16 个字/);
    assert.match(html, /data-act="solo-start" disabled/);
  });

  it('分岔列表只列 LLM：没有 image2、midjourney、suno、elevenlabs', () => {
    const html = solo.renderSolo({ ...solo.defaultSolo(false), mode: 'fork' });
    for (const id of ['image2', 'midjourney', 'suno', 'elevenlabs']) assert.ok(!html.includes(`data-value="${id}"`), id);
    const llm = COMPANIES.filter(c => c.modality === 'llm').length;
    assert.equal((html.match(/class="solo-fork /g) || []).length, llm);
  });

  it('时长超过 2026-10 时当场写明截到哪个月', () => {
    const info = solo.endInfo('2024', 3);
    assert.equal(info.endMonth, '2026-10');
    assert.equal(info.capped, true);
    assert.match(info.text, /2026 年 10 月/);
    assert.match(solo.renderSolo({ ...solo.defaultSolo(false), year: '2024', years: 3 }), /2026 年 10 月/);
    // 不超的照实写。
    const short = solo.endInfo('2025', 1);
    assert.equal(short.endMonth, '2025-12');
    assert.equal(short.capped, false);
  });
});

describe('从设置页到 createWorld（规格 M.2、M.4）', () => {
  it('用设置页的参数真的开一局，跑 10 天，getState() 返回玩家那家的 s', () => {
    const d = { ...solo.defaultSolo(false,'post'), count: 3, years: 1 };
    const r = solo.startSolo(d, 7);
    world = r.world;
    player = r.s;
    assert.equal(world.mode, 'zero');
    assert.equal(Object.keys(world.companies).length, 3);
    assert.equal(world.settings.you, r.playerId);
    assert.equal(player.company.company, '晨光智能');
    assert.equal(player.persona.artId, d.art);
    state.setWorld(world);
    state.setState(player);
    for (let i = 0; i < 10; i++) {
      let out = world.tick();
      for (let guard = 0; out?.paused && guard < 40; guard++) {
        while (player.queue.length) {
          const ev = E.currentEvent(player);
          const pick = ev.choices.find(x => !x.disabled) || ev.choices[0];
          E.resolveEvent(player, pick.id);
        }
        out = world.tick();
      }
    }
    assert.equal(world.day, '2024-01-11');
    assert.equal(player.day, '2024-01-11');
    assert.equal(state.getState(), player, 'getState() 不是世界里玩家那家的 s');
    assert.equal(world.publicView().companies.some(c => c.kind === 'human'), true);
  });
});

describe('自洽后台（规格 M.7）', () => {
  before(() => {
    state.setWorld(world);
    state.setState(player);
  });

  it('后台各页都能渲染、不抛错', () => {
    for (const [id, name] of PAGES) {
      const html = PAGE[id].render(player, freshSt({ page: id }));
      assert.equal(typeof html, 'string', name);
      assert.ok(html.trim().length > 0, `${name} 是空的`);
      assert.doesNotMatch(text(html), BAD, name);
    }
  });

  it('M2 之前股市页不在导航里；同场公司页改名，且搜不到别家的现金和在练模型', () => {
    assert.equal(pageVisible('market'), false);
    assert.equal(pageVisible('rivals'), true);
    assert.equal(PAGE.market.hidden, undefined, '不能把股市页全局标成 hidden，史实模式还要用');
    const html = PAGE.rivals.render(player, freshSt({ page: 'rivals' }));
    assert.match(html, /<h2>同场公司<\/h2>/);
    assert.match(html, /真人/);
    assert.match(html, /电脑 · 普通/);
    assert.doesNotMatch(html, /现金/);
    assert.doesNotMatch(html, /在练/);
    assert.doesNotMatch(html, /作业|送评候选|候选/);
    for (const c of Object.values(world.companies)) if (c.s) assert.ok(!html.includes(JSON.stringify(c.s.cash)), '漏出了别家的现金');
  });

  it('新闻页有“世界”和“与我有关”两个标签，点了就换', () => {
    const st = freshSt({ page: 'news' });
    const me = PAGE.news.render(player, st);
    assert.match(me, /data-news-tab="world"[^>]*>世界/);
    assert.match(me, /data-news-tab="me"[^>]*>与我有关/);
    assert.match(me, /只和你们公司有关的消息/);
    st.newsTab = 'world';
    assert.match(PAGE.news.render(player, st), /整个世界的公开消息/);
    let drawn = 0;
    PAGE.news.click(player, { closest: sel => (sel === '[data-news-tab]' ? { dataset: { newsTab: 'world' } } : null) }, { st, draw: () => { drawn++; } });
    assert.equal(st.newsTab, 'world');
    assert.equal(drawn, 1);
  });

  it('算力页经 P() 读季末统一价、租卡现货价和出口管制状态', () => {
    const html = PAGE.compute.render(player, freshSt({ page: 'compute' }));
    assert.match(html, /这个世界的算力价/);
    assert.match(html, /季末统一价/);
    assert.match(html, /租卡现货价/);
    assert.match(html, /出口管制/);
    assert.doesNotMatch(text(html), BAD);
  });
});

describe('存档分发与报错（规格 E8 末尾）', () => {
  it('世界存档 serialize 后能被分发函数认成 world；史实局认成 history；坏文字认成 broken', () => {
    const text = E.serialize(world);
    assert.equal(saveKind(text), 'world');
    assert.equal(saveKind(E.createGame('deepseek', 'y2024', 1)), 'history');
    assert.equal(saveKind('{'), 'broken');
    assert.equal(saveKind('{}'), 'unknown');
  });

  it('缺版本世界存档明确拒绝，不抛错且不替换当前 Provider', () => {
    const provider = P(), raw = { kind: 'world' }, before = structuredClone(raw);
    let r;
    assert.doesNotThrow(() => { r = E.migrateWorld(raw); });
    assert.equal(r.ok, false);
    assert.equal(typeof r.reason, 'string');
    assert.match(r.reason, /不支持旧版或未知世界存档.*请新开一局/);
    assert.equal(P(), provider);
    assert.deepEqual(raw, before);
    // 切回史实由显式测试清理完成，不再借读档失败的副作用。
    restoreHistory();
    const s = E.createGame('qwen', 'y2025', 3);
    assert.equal(s.charId, 'qwen');
    assert.ok(s.models.length > 0);
  });

  it('自洽存档写失败（localStorage 满了）返回中文原因，不静默吞掉', async () => {
    const old = globalThis.localStorage;
    globalThis.localStorage = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem() {} };
    try {
      const storage = await import('../../src/career/ui/storage.js');
      const r = await storage.saveWorld(world);
      assert.equal(r.ok, false);
      assert.match(r.reason, /自洽世界存档没有写成/);
    } finally {
      if (old === undefined) delete globalThis.localStorage; else globalThis.localStorage = old;
    }
  });
});

describe('史实模式一个像素都不变（挑 3 家公司 × 2 个剧本）', () => {
  after(() => { state.setWorld(null); state.setState(null); });
  it('同一批页面（对手、新闻、算力、股市）的 HTML 和改动前逐字一致；不出现“同场公司”和世界标签', () => {
    // 世界跑过以后把 Provider、发布表换回史实，再拍一次。
    restoreHistory();
    state.setWorld(null);
    state.setState(null);
    const after = historySnap();
    assert.deepEqual(after, HIST_BEFORE);
    for (const { out } of after) {
      for (const [p, html] of Object.entries(out)) {
        assert.doesNotMatch(html, /同场公司/, `${p} 漏进了自洽模式的标题`);
        if (p === 'news') assert.doesNotMatch(html, /data-news-tab/, 'news 漏进了世界标签');
        if (p === 'market') assert.ok(html.length > 100);
      }
    }
  });
});

describe('375px 版面（F2 M1 ⑤）', () => {
  it('solo.css 在 520px 以下单列、所有格子都能缩，index.html 引用了它', () => {
    const css = fs.readFileSync(new URL('../../src/career/css/solo.css', import.meta.url), 'utf8');
    assert.match(css, /@media \(max-width: 520px\)/);
    const bodyAt375 = cssAt(css, ['.solo-body'], 375);
    assert.equal(bodyAt375.width, '100%');
    assert.equal(bodyAt375['max-width'], '100vw');
    for (const sel of ['.solo-field', '.solo-card', '.solo-input', '.solo-art-grid', '.solo-fork-list', '.solo-price-grid', '.solo-rival-facts']) {
      assert.equal(cssAt(css, [sel], 375)['min-width'], '0', sel);
    }
    assert.match(cssAt(css, ['.solo-art-grid'], 375)['grid-template-columns'], /repeat\(3, minmax\(0, 1fr\)\)/);
    assert.equal(cssAt(css, ['.solo-rivals'], 375)['grid-template-columns'], 'minmax(0, 1fr)');
    const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    assert.match(html, /href="\.\/src\/career\/css\/solo\.css\?v=8-hud"/);
  });
});
