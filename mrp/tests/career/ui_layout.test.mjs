// 后台“模型”页的版面（G1 界面修补）：三四张模型卡并排时，每张卡右边的信息栏不能被挤成竖排（“671B / 激活 37B”一个字一行）。
// 浏览器由主会话看；这里在 Node 里锁两样：样式表里模型卡的写法（窄了就换成雷达图在上、信息在下，信息栏有最小宽度），
// 以及按样式表里的数字（抽屉宽度、导航栏、内边距、卡片最小宽度）算出来的每张卡里信息栏实际多宽，从 320 到 1920 扫一遍。
// 列下限使用 min(100%, 300px)：320px 起也不能比正文宽。此处是 CSS 数值模型，不是浏览器像素验收。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import { cssAt, cssTokens } from '../helpers/css.mjs';

globalThis.document ??= { baseURI: 'http://localhost/' };
const { PAGE } = await import('../../src/career/ui/office.js');

const readSrc = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
// 样式按 index.html 里的顺序接起来再算（后面的盖前面的）。
const css = [...readSrc('../../index.html').matchAll(/href="\.\/(src\/career\/css\/[\w-]+\.css)/g)].map(m => readSrc(`../../${m[1]}`)).join('\n');

const MIN_INFO = 160; // 信息栏再窄就放不下“结构 671B / 激活 37B”这一行了
const SCROLLBAR = 15; // 经典滚动条占的宽度，按最坏的算

// 长度：px、vw、百分比（只用于抽屉宽度，相对窗口）、min(a, b)。
function len(v, vw) {
  const m = v.trim().match(/^min\((.+),(.+)\)$/);
  if (m) return Math.min(len(m[1], vw), len(m[2], vw));
  return /(vw|%)$/.test(v.trim()) ? vw * parseFloat(v) / 100 : parseFloat(v);
}

// 某个窗口宽度下，样式表给出的几个数（同一个宽度只算一次）。
const sheetCss = new Map();
function cssNumbers(vw) {
  if (sheetCss.has(vw)) return sheetCss.get(vw);
  const g2 = cssAt(css, '.grid2', vw), body = cssAt(css, '.mcard-body', vw), office = cssAt(css, '.office', vw)['grid-template-columns'];
  const min2 = Number(g2['grid-template-columns'].match(/^repeat\(auto-fit,\s*minmax\(min\(100%,\s*(\d+)px\),\s*1fr\)\)$/)?.[1]);
  assert.ok(min2 > 0, `.grid2 的列写法变了：${g2['grid-template-columns']}`);
  const min = Number(body['grid-template-columns'].match(/^repeat\(auto-fit, minmax\(min\(100%, (\d+)px\), 1fr\)\)$/)?.[1]);
  assert.ok(min > 0, `.mcard-body 的列写法变了：${body['grid-template-columns']}`);
  const r = {
    sheet: len(cssAt(css, '.overlay--office .sheet', vw).width, vw),
    nav: /^\d+px/.test(office) ? parseFloat(office) : 0,
    bodyPad: parseFloat(cssTokens(cssAt(css, '.office-body', vw).padding)[1]),
    gap2: parseFloat(g2.gap), min2, cardPad: parseFloat(cssTokens(cssAt(css, '.card', vw).padding)[1]),
    min, gap: parseFloat(body.gap),
  };
  sheetCss.set(vw, r);
  return r;
}

// 窗口宽度 vw、页面上有 cards 张模型卡时，一张卡里雷达图和信息栏各多宽（两栏并排还是上下叠）。
// 卡里只有两个格子（雷达图、信息栏），auto-fit 会把空的列收掉，所以最多两栏。
function modelCard(vw, cards) {
  const c = cssNumbers(vw);
  const bodyW = c.sheet - c.nav - 2 * c.bodyPad - SCROLLBAR;
  const perRow = Math.min(cards, Math.max(1, Math.floor((bodyW + c.gap2) / (c.min2 + c.gap2))));
  // min(100%, min2) allows a single card to fit a narrow content surface.
  const cardW = Math.max(Math.min(bodyW,c.min2), (bodyW - (perRow - 1) * c.gap2) / perRow);
  const inner = cardW - 2 * c.cardPad - 2;
  const trackMin = Math.min(inner, c.min);
  const cols = Math.min(2, Math.max(1, Math.floor((inner + c.gap) / (trackMin + c.gap))));
  const col = (inner - (cols - 1) * c.gap) / cols;
  return { vw, cards, perRow, cardW, inner, cols, radarW: Math.min(col, 240), infoW: col, bodyW };
}

describe('后台“模型”页：模型卡的版面', () => {
  it('样式表：卡里的网格是 auto-fit + minmax（信息栏有最小宽度），在任何窗口宽度下都是同一条，手机断点里没有再盖掉它', () => {
    for (const w of [320, 375, 480, 600, 768, 860, 980, 1280, 1920]) {
      const cols = cssAt(css, '.mcard-body', w)['grid-template-columns'];
      const m = cols.match(/^repeat\(auto-fit, minmax\(min\(100%, (\d+)px\), 1fr\)\)$/);
      assert.ok(m, `${w}px：${cols}`);
      assert.ok(Number(m[1]) >= MIN_INFO, `${w}px：信息栏最小宽度 ${m[1]}px 太窄`);
    }
    // 信息栏里的行：放不下就整个值换到下一行，标签不拆字。
    assert.equal(cssAt(css, '.mcard .kv li', 1280)['flex-wrap'], 'wrap');
    assert.equal(cssAt(css, '.mcard .kv li span', 1280)['white-space'], 'nowrap');
    // 雷达图有最大宽度、居中（叠在上面时不撑满整张卡）。
    assert.equal(cssAt(css, '.mcard-body .radar', 1280)['max-width'], '240px');
  });

  it('按样式表里的数字算：1280px 宽、三张卡并排时每张卡都换成雷达图在上、信息在下，信息栏不窄于 160px（原来只剩 64px）', () => {
    const three = modelCard(1280, 3);
    assert.equal(three.perRow, 3, '三张卡还是一行三张');
    assert.equal(three.cols, 1, `卡里 ${Math.round(three.inner)}px 放不下两栏，该上下叠：${JSON.stringify(three)}`);
    assert.ok(three.infoW >= MIN_INFO, JSON.stringify(three));
    // 同样的宽度下只有一张卡时，仍然是雷达图在左、信息在右。
    const one = modelCard(1280, 1);
    assert.equal(one.cols, 2);
    assert.ok(one.infoW >= MIN_INFO, JSON.stringify(one));
    // 四张卡（有在练的、小模型、待发布小模型）：一行两张或三张，都放得下。
    for (const n of [2, 3, 4]) assert.ok(modelCard(1280, n).infoW >= MIN_INFO, `${n} 张卡`);
  });

  it('从 320 到 1920 扫一遍窗口宽度、1 到 4 张卡：信息栏任何时候不窄于 160px；320px 起卡不比页面宽', () => {
    let n = 0, stacked = 0, side = 0;
    for (let vw = 320; vw <= 1920; vw += 5) {
      for (let cards = 1; cards <= 4; cards++) {
        const r = modelCard(vw, cards);
        assert.ok(r.infoW >= MIN_INFO, JSON.stringify(r));
        assert.ok(r.bodyW <= vw, JSON.stringify(r));
        assert.ok(r.cardW <= r.bodyW + 1e-6, JSON.stringify(r));
        assert.ok(r.radarW <= r.inner + 1e-6, JSON.stringify(r));
        n++;
        if (r.cols === 1) stacked++; else side++;
      }
    }
    assert.ok(stacked > 100 && side > 100, `上下叠 ${stacked} 种、并排 ${side} 种：两种版面都要出现过`);
    const phone = modelCard(375, 4);
    assert.equal(phone.perRow, 1);
    assert.equal(phone.cols, 1, '手机上雷达图在上、信息在下');
    assert.ok(phone.cardW < 375);
    assert.ok(n > 1000);
  });

  it('渲染：三张模型卡（在线旗舰、训练中、在线小模型）都有雷达图在前、信息栏在后；“671B / 激活 37B”在一行里', () => {
    const S = E.createGame('deepseek', 'y2025', 1);
    assert.ok(E.liveModel(S) && E.workingModel(S) && E.smallLive(S), '这个开局正好有三张卡');
    const html = PAGE.model.render(S, { page: 'model' });
    const cards = html.split('<div class="card mcard">').slice(1);
    assert.equal(cards.length, 3);
    for (const c of cards) {
      const body = c.slice(c.indexOf('<div class="mcard-body">'));
      assert.ok(body.indexOf('<svg class="chart radar"') >= 0 && body.indexOf('<svg class="chart radar"') < body.indexOf('<ul class="kv">'), '雷达图先于信息栏');
      assert.match(body, /<li><span>结构<\/span><b>[^<]+<\/b><\/li>/);
    }
    assert.match(html, /<span>结构<\/span><b>671B \/ 激活 37B<\/b>/);
    assert.match(html, /<div class="grid2">(<div class="card mcard">[\s\S]*){3}/);
  });
});
