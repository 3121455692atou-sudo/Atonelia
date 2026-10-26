// 公司策略界面（P3.U1，规格 A11）：24 家公司 × 4 个剧本的每个节点都能在后台渲染；
// 节点各种状态、手机原位展开、顶栏芯片和“警告 n/3”、主界面那一行策略、导航分组、375px 版面。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// fmt.js 在加载时就会算背景图的绝对地址，先把最小替身放好。
globalThis.document ??= { baseURI: 'http://localhost/' };

import * as E from '../../src/career/engine.js';
import { PLAYABLE, SCENARIOS } from '../../src/career/data/core.js';
import { resolveAll } from '../helpers/career_bot.mjs';
import { addDays } from '../../src/career/sim/clock.js';
import { cssAt } from '../helpers/css.mjs';

const { PAGE, NAV_GROUPS } = await import('../../src/career/ui/office.js');
const { topBar } = await import('../../src/career/ui/topbar.js');
const { renderHome } = await import('../../src/career/ui/home.js');
const { setState } = await import('../../src/career/ui/state.js');
const { BG, bgFor } = await import('../../src/career/ui/fmt.js');
const { viewFor } = await import('../../src/career/ui/views/index.js');
const { playEvent } = await import('../../src/career/ui/vn.js');

const strategy = PAGE.strategy;
const freshSt = (x = {}) => ({ page: 'strategy', strategyOpen: null, strategyConfirm: null, ...x });
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const BAD = /undefined|NaN|\[object|(?<![\w-])null(?![\w-])|Infinity/;
const game = (id = 'perplexity', sc = 'y2025') => { const s = E.createGame(id, sc, 7); resolveAll(s); return s; };
// 桌面树上的紧凑节点（图标 + 标题 + 天数）；条件、效果、按钮都在右侧详情栏（A11）。
const nodeTag = (html, id) => (html.match(new RegExp(`<button[^>]*data-strategy-node="${id}"[^>]*>[\\s\\S]*?</button>`)) || [])[0] || '';
const panel = html => (html.match(/<aside class="strategy-detail"[\s\S]*?<\/aside>/) || [])[0] || '';
const stateOf = (s, id) => E.nodeStatus(s, id).state;

describe('公司策略界面（P3.U1）：24 家公司 × 4 个剧本的整棵树', () => {
  it('每个节点都在桌面网格和手机列表里出现，不抛错、不出现 undefined / NaN / null / Infinity', () => {
    let games = 0, nodes = 0;
    for (const p of PLAYABLE) for (const sc of SCENARIOS) {
      const s = E.createGame(p.id, sc.id, 7);
      resolveAll(s);
      const opts = E.strategyOptions(s);
      assert.ok(opts.length >= 20, `${p.id} ${sc.id} 只有 ${opts.length} 个节点`);
      const html = strategy.render(s, freshSt());
      assert.ok(html.trim().length > 0);
      assert.doesNotMatch(text(html), BAD, `${p.id} ${sc.id}`);
      for (const o of opts) {
        assert.ok(html.includes(`data-strategy-node="${o.id}"`), `${p.id} ${sc.id} 桌面少了 ${o.id}`);
        assert.ok(html.includes(`data-mobile-node="${o.id}"`), `${p.id} ${sc.id} 手机少了 ${o.id}`);
        // 可见文字里不能露出节点 id、效果键这些内部写法。
        assert.ok(!text(html).includes(o.id), `${p.id} ${sc.id} 页面文字出现了节点 id ${o.id}`);
        nodes++;
      }
      assert.equal((html.match(/data-strategy-node=/g) || []).length, opts.length);
      assert.equal((html.match(/data-mobile-node=/g) || []).length, opts.length);
      assert.doesNotMatch(text(html), /techBoost|cashOfStart|shelvedDays|govern|notTechs|sotaMade/);
      games++;
    }
    assert.equal(games, 96);
    assert.ok(nodes > 96 * 20, `只数到 ${nodes} 个节点`);
  });

  it('四棵通用树各拿一个开局，把每个节点逐个在手机原位展开，详情都能渲染', () => {
    const picks = [['rwkv', 'y2023'], ['midjourney', 'y2023'], ['suno', 'y2024'], ['elevenlabs', 'y2023']];
    for (const [id, sc] of picks) {
      const s = game(id, sc);
      for (const o of E.strategyOptions(s)) {
        const html = strategy.render(s, freshSt({ strategyOpen: o.id }));
        assert.match(html, new RegExp(`data-strategy-detail="${o.id}"`));
        assert.match(html, new RegExp(`data-strategy-open="${o.id}" aria-expanded="true"`));
        assert.doesNotMatch(text(html), BAD, `${id} ${sc} ${o.id}`);
      }
    }
  });
});

describe('公司策略界面（P3.U1）：节点状态和按钮', () => {
  it('可开始 / 进行中 / 暂停 / 已完成 / 自动完成 / 搁置 / 互斥失效 / 做不成了 / 冷却中 / 锁定都写对', () => {
    // 可开始、进行中：开局就有一项在推，另找一项能开始的。
    let s = game();
    const cur = s.strategy.cur.id;
    let html = strategy.render(s, freshSt());
    assert.match(nodeTag(html, cur), /data-state="active"/);
    assert.match(text(html), /当前策略/);
    const avail = E.strategyOptions(s).find(o => o.state === 'available' && o.id !== cur);
    assert.ok(avail, '开局没有可开始的节点');
    assert.match(nodeTag(html, avail.id), /data-state="available"/);
    // 暂停。
    s = game();
    s.strategy.cur.paused = '现金不够';
    html = strategy.render(s, freshSt());
    assert.match(nodeTag(html, s.strategy.cur.id), /data-state="paused"/);
    assert.match(text(html), /暂停/);
    // 已完成。
    s = game();
    const doneId = s.strategy.cur.id;
    s.strategy.cur = null;
    s.strategy.done[doneId] = { day: s.day, how: 'done' };
    html = strategy.render(s, freshSt());
    assert.match(nodeTag(html, doneId), /data-state="done"/);
    // 自动完成（绕过）。
    s = game();
    s.strategy.done.g_sota = { day: s.day, how: 'bypass' };
    assert.equal(stateOf(s, 'g_sota'), 'bypassed');
    html = strategy.render(s, freshSt());
    assert.match(nodeTag(html, 'g_sota'), /data-state="bypassed"/);
    // 搁置：引擎状态仍是可开始，但界面要写“搁置”，并说明进度还能留几天。
    s = game();
    const shId = s.strategy.cur.id;
    s.strategy.cur = null;
    s.strategy.shelved[shId] = { days: 6, until: addDays(s.day, 12) };
    html = strategy.render(s, freshSt({ strategySel: shId }));
    assert.match(nodeTag(html, shId), /data-state="shelved"/);
    assert.match(text(html), /搁置/);
    assert.match(text(panel(html)), /已做 6 天，进度还能留 12 天/);
    // 互斥失效。
    s = game();
    s.strategy.done.gs_niche_search = { day: s.day, how: 'done' };
    assert.equal(stateOf(s, 'gs_niche_story'), 'excluded');
    html = strategy.render(s, freshSt());
    assert.match(nodeTag(html, 'gs_niche_story'), /data-state="excluded"/);
    assert.match(text(html), /互斥失效/);
    // 做不成了：押注期间已经掌握了押注的技术。
    s = game();
    s.techs.push('reasoning');
    assert.equal(stateOf(s, 'g_reasoning_bet'), 'blocked');
    html = strategy.render(s, freshSt());
    assert.match(nodeTag(html, 'g_reasoning_bet'), /data-state="blocked"/);
    assert.match(text(html), /做不成了/);
    // 冷却中。
    s = game();
    s.strategy.done.g_route_open = { day: s.day, how: 'done' };
    assert.equal(stateOf(s, 'g_route_open'), 'cooldown');
    html = strategy.render(s, freshSt());
    assert.match(nodeTag(html, 'g_route_open'), /data-state="cooldown"/);
    assert.match(text(html), /冷却中/);
    // 锁定。
    s = game();
    assert.equal(stateOf(s, 'g_beyond'), 'locked');
    html = strategy.render(s, freshSt());
    assert.match(nodeTag(html, 'g_beyond'), /data-state="locked"/);
    assert.match(text(html), /锁定/);
  });

  it('点树上的节点，在附近打开详情；按钮在详情栏里：可开始写“开始这项策略”，有进行中的写“换成这项”，第一次点只进确认态', () => {
    const s = game();
    const cur = s.strategy.cur.id;
    const avail = E.strategyOptions(s).find(o => o.state === 'available' && o.id !== cur && !o.node.stance);
    assert.ok(avail);
    // 默认选中进行中的那一项；节点本身不放按钮。
    let html = strategy.render(s, freshSt());
    assert.equal(panel(html), '', 'Details are closed until a node is selected');
    html = strategy.render(s, freshSt({strategySel:cur}));
    assert.match(panel(html), new RegExp(`data-strategy-detail-panel="${cur}"`));
    assert.doesNotMatch(nodeTag(html, avail.id), /data-strategy-op=/);
    const pickSt = freshSt();
    const pick = { dataset: { strategyPick: avail.id }, closest: sel => (sel === '[data-strategy-pick]' ? pick : null) };
    strategy.click(s, pick, { st: pickSt, draw: () => {}, guard: fn => fn() });
    assert.equal(pickSt.strategySel, avail.id);
    html = strategy.render(s, pickSt);
    assert.match(panel(html), new RegExp(`data-strategy-op="switch" data-id="${avail.id}"`));
    assert.match(panel(html), /换成这项/);
    assert.match(nodeTag(html, avail.id), /aria-pressed="true"/);
    // 第一次点击只记下确认，不动引擎。
    const st = freshSt({ strategySel: avail.id });
    const target = dataset => ({ dataset, closest: sel => (sel === '[data-strategy-op]' && 'strategyOp' in dataset ? t : null) });
    const t = target({ strategyOp: 'switch', id: avail.id });
    let drew = 0;
    strategy.click(s, t, { st, draw: () => { drew++; }, guard: fn => fn() });
    assert.equal(s.strategy.cur.id, cur, '第一次点击不能换');
    assert.equal(st.strategyConfirm, avail.id);
    assert.equal(drew, 1);
    html = strategy.render(s, st);
    assert.ok(text(html).includes('再点一次'), text(html).slice(0, 200));
    assert.match(text(html), /已经做了 \d+ 天，这 \d+ 天会保留 30 天；30 天内换回来还能接着做/);
    // 第二次才真的换，旧的那项进搁置。
    const notes = [];
    strategy.click(s, t, { st, draw: () => {}, guard: fn => { const r = fn(); if (r?.note) notes.push(r.note); } });
    assert.equal(s.strategy.cur.id, avail.id);
    assert.ok(s.strategy.shelved[cur]);
    assert.match(notes.at(-1), new RegExp(`开始了「${avail.node.title}」`));
    // 没有进行中的那一项时，按钮写“开始这项策略”，点一次就开始。
    s.strategy.cur = null;
    delete s.strategy.shelved[avail.id];
    assert.equal(stateOf(s, avail.id), 'available');
    html = strategy.render(s, freshSt({ strategySel: avail.id }));
    assert.match(panel(html), new RegExp(`data-strategy-op="start" data-id="${avail.id}"`));
    strategy.click(s, target({ strategyOp: 'start', id: avail.id }), { st: freshSt(), draw: () => {}, guard: fn => fn() });
    assert.equal(s.strategy.cur.id, avail.id);
  });

  it('进行中那一项的详情栏里有“先搁置”，点了把进度保留 30 天；自动完成的节点没有开始按钮', () => {
    const s = game();
    const cur = s.strategy.cur.id;
    const html = strategy.render(s, freshSt({strategySel:cur}));
    assert.match(panel(html), /data-strategy-op="shelve"/);
    const sota = panel(strategy.render(s, freshSt({ strategySel: 'g_sota' })));
    assert.match(sota, /自动完成，不占策略槽/);
    assert.doesNotMatch(sota, /data-strategy-op=/);
    const t = { dataset: { strategyOp: 'shelve', id: cur }, closest: sel => (sel === '[data-strategy-op]' ? t : null) };
    const notes = [];
    strategy.click(s, t, { st: freshSt(), draw: () => {}, guard: fn => { const r = fn(); if (r?.note) notes.push(r.note); } });
    assert.equal(s.strategy.cur, null);
    assert.ok(s.strategy.shelved[cur]?.until >= s.day);
    assert.match(notes.at(-1), /保留 30 天/);
  });
});

describe('公司策略界面（P3.U1）：手机原位展开和分支默认状态', () => {
  it('点节点只改后台状态，详情在那一行下面展开；有可开始 / 进行中节点的分支默认展开，全做完的分支默认折叠', () => {
    const s = game();
    const cur = s.strategy.cur.id;
    let st = freshSt();
    let html = strategy.render(s, st);
    assert.ok(html.includes('data-mobile-branch="niche" open>'), '进行中的分支出在 niche，应该默认展开');
    assert.ok(!html.includes(`data-strategy-detail="${cur}"`));
    const t = { dataset: { strategyOpen: cur }, closest: sel => (sel === '[data-strategy-open]' ? t : null) };
    let drew = 0;
    strategy.click(s, t, { st, draw: () => { drew++; }, guard: fn => fn() });
    assert.equal(st.strategyOpen, cur);
    assert.equal(drew, 1);
    html = strategy.render(s, st);
    assert.ok(html.includes(`data-strategy-detail="${cur}"`));
    assert.match(html, new RegExp(`data-strategy-open="${cur}" aria-expanded="true"`));
    // 再点一次收起。
    strategy.click(s, t, { st, draw: () => {}, guard: fn => fn() });
    assert.equal(st.strategyOpen, null);
    assert.ok(!strategy.render(s, st).includes(`data-strategy-detail="${cur}"`));
    // niche 分支全部标成已完成：默认折叠。
    const s2 = game();
    s2.strategy.cur = null;
    for (const o of E.strategyOptions(s2).filter(x => x.node.branch === 'niche')) s2.strategy.done[o.id] = { day: s2.day, how: 'done' };
    const h2 = strategy.render(s2, freshSt());
    assert.match(h2, /data-mobile-branch="niche"\s*>/, '全做完的分支不该默认展开');
    assert.doesNotMatch(h2, /data-mobile-branch="niche"\s+open>/);
  });
});

describe('公司策略界面（P3.U1）：顶栏芯片、警告和主界面那一行', () => {
  it('顶栏芯片写当前策略和还剩几天，点它去策略页；空闲时写“策略空闲”；有警告时写“警告 n/3”', () => {
    const s = game();
    const cur = s.strategy.cur;
    const title = E.strategyOptions(s).find(o => o.id === cur.id).node.title;
    const left = Math.max(0, Math.ceil(cur.need - cur.days));
    let html = topBar(s);
    assert.match(html, /class="strategy-chip[^"]*" data-act="quick" data-id="strategy"/);
    assert.ok(text(html).includes(title));
    assert.match(html, new RegExp(`还剩 ${left} 天`));
    // 有警告才显示，0 次不写。
    s.strikes = 2;
    html = topBar(s);
    assert.match(text(html), /警告 2\/3/);
    s.strikes = 0;
    assert.doesNotMatch(text(topBar(s)), /警告 0\/3/);
    // 空闲高亮。
    s.strategy.cur = null;
    html = topBar(s);
    assert.match(html, /strategy-chip is-idle/);
    assert.match(text(html), /策略空闲/);
  });

  it('主界面“进行中”卡第一行是策略状态，不加新的操作按钮；暂停时写暂停中', () => {
    const s = game();
    const cur = s.strategy.cur;
    const title = E.strategyOptions(s).find(o => o.id === cur.id).node.title;
    const app = { className: '', innerHTML: '' };
    setState(s);
    renderHome(app);
    const now = app.innerHTML.slice(app.innerHTML.indexOf('<div class="card now-card">'));
    const cut = now.indexOf('<div class="meter');
    const card = now.slice(0, cut);
    assert.equal((card.match(/class="now-row now-strategy/g) || []).length, 1);
    assert.ok(text(card).includes(title));
    assert.match(text(card), /还剩 \d+ 天/);
    assert.doesNotMatch(card, /data-strategy-op|data-op="change"|>换</);
    s.strategy.cur.paused = '条件不成立';
    renderHome(app);
    const paused = app.innerHTML.slice(app.innerHTML.indexOf('<div class="card now-card">'));
    assert.match(text(paused.slice(0, paused.indexOf('<div class="meter'))), /暂停中/);
  });
});

describe('公司策略界面（P3.U1）：导航、背景和视图登记', () => {
  it('后台按 A11 分四组：公司组第一项是公司策略，模型组第一项是训练；策略页不再是存根', () => {
    assert.deepEqual(NAV_GROUPS[0][1].slice(0, 1), ['strategy']);
    assert.deepEqual(NAV_GROUPS[1][1].slice(0, 1), ['train']);
    assert.equal(strategy.hidden, undefined);
    assert.equal(viewFor('strategy') === playEvent, false, '完成卡应该用自己的视图');
    assert.match(BG.strategy, /bg-career-camp\.webp$/);
    assert.equal(bgFor({ kind: 'strategy', id: 'x' }), BG.strategy);
  });

  it('375px：同一棵可滚动树可见，分支列表可选，路线和长标题不溢出', () => {
    const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const css = [...html.matchAll(/href="\.\/(src\/career\/css\/[\w-]+\.css)/g)].map(m => fs.readFileSync(new URL(`../../${m[1]}`, import.meta.url), 'utf8')).join('\n');
    const own = fs.readFileSync(new URL('../../src/career/css/strategy.css', import.meta.url), 'utf8');
    for (const w of [375, 390, 768]) {
      assert.equal(cssAt(css, '.strategy-tree-card', w).display, 'block', `${w}px：窄屏同样显示可滚动树图`);
      assert.equal(cssAt(css, '.strategy-mobile', w).display, 'block', `${w}px：手机列表要显示`);
      assert.equal(cssAt(css, '.strategy-page', w)['grid-column'], '1 / -1', `${w}px：策略页占满后台一列`);
      assert.equal(cssAt(css, '.strategy-m-main', w)['min-width'], '0', `${w}px：长标题要能缩`);
    }
    assert.equal(cssAt(css, '.strategy-grid', 1440).display, 'block');
    assert.equal(cssAt(css, '.strategy-mobile', 1440).display, 'block');
    assert.equal(cssAt(css, '.strategy-route-line', 375)['flex-wrap'], 'wrap');
    assert.equal(cssAt(css, '.strategy-spirit-row', 375)['overflow-x'], 'auto');
    assert.doesNotMatch(own, /position:\s*fixed/, '策略页不加悬浮按钮、不用底部弹层');
    // 只有桌面右侧的详情栏跟着页面停在视口里（sticky）；手机上整棵桌面树（含详情栏）都藏起来。
    for (const m of own.matchAll(/([^{}\n]+)\{[^}]*position:\s*sticky/g)) assert.equal(m[1].trim(), '.strategy-detail');
  });
});
