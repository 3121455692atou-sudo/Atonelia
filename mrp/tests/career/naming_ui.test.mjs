// 命名界面（P3.U2，规格 C1、C2、C7、D1、D11.9、D11.10）：送评表单里的名字和实时校验、史实型号名的条件清单、
// 顶替在线旗舰的勾选和它交出去的参数、期待预告的两种状态、发布结果卡的“市场反应”两种状态、训练页两个表单的代号输入。
// 全部在 Node 里渲染（和 ui_render、strategy_ui 同一个写法），不碰浏览器。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import { COMPANY_FILES } from '../../src/career/data/companies/index.js';
import { resolveAll } from '../helpers/career_bot.mjs';
import { cssAt } from '../helpers/css.mjs';

globalThis.document ??= { baseURI: 'http://localhost/' };
const releasePanel = await import('../../src/career/ui/panels/release.js');
const releaseName = await import('../../src/career/ui/panels/release_name.js');
const projectForm = await import('../../src/career/ui/pages/project_form.js');
const distillForm = await import('../../src/career/ui/pages/distill_form.js');
const { marketLine } = await import('../../src/career/ui/bench.js');

const game = (c = 'deepseek', sc = 'y2025', seed = 7) => { const s = E.createGame(c, sc, seed); resolveAll(s); return s; };
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
// 能送评：后训练满两周、没有在评测的、没有正在灰度的旗舰。
function ready(s, { weak = false } = {}) {
  const w = E.workingModel(s);
  w.postDays = Math.max(w.postDays || 0, 30);
  w.relDays = 0;
  s.deploy = [];
  s.queue = [];
  if (weak) w.dims = Object.fromEntries(Object.keys(w.dims).map(k => [k, 1]));
  else w.dims = Object.fromEntries(Object.keys(w.dims).map(k => [k, 99]));
  return w;
}
// 临时给某家公司装上历史名表（内容包落地以前公司文件都是 null，和 naming.test 同一个办法）。
function withNames(company, names, fn) {
  const was = COMPANY_FILES[company];
  COMPANY_FILES[company] = { company, tree: null, spirits: {}, startSpirits: [], names, exclusives: [] };
  try { return fn(); } finally { COMPANY_FILES[company] = was; }
}
const hn = (id, name, extra = {}) => ({ id, name, series: null, role: 'flagship', node: 'test_node', real: '2025-01-20', model: null, world: null, clean: null, events: [], ...extra });
function grantRight(s, id) {
  s.strategy = { ...(s.strategy || {}), rights: { ...(s.strategy?.rights || {}), [id]: { day: s.day, until: '2027-01-01', used: null, void: null } } };
}
// pick 读的最小替身：只认 querySelector / querySelectorAll，和 ui_render 的写法一样；多一个外层 .release-opt 的 dataset。
function boxOf(vals, line = 'main') {
  return {
    dataset: { line },
    querySelector: sel => (sel in vals ? vals[sel] : null),
    querySelectorAll: sel => (sel === '.rel-paper:checked' ? vals.papers || [] : []),
  };
}
const btn = (dataset, box) => ({ dataset, closest: sel => (sel === '.release-opt' ? box : null) });

describe('名字：输入、实时校验、送评时交出去', () => {
  it('合法名能过；空名字、和已有发布重名、用了别家的品牌，提示都用引擎的原文', () => {
    const s = game();
    const w = ready(s);
    const good = releaseName.checkName(s, w, '星河 1.0');
    assert.equal(good.ok, true, good.reason);
    assert.equal(good.name, '星河 1.0');

    const empty = releaseName.checkName(s, w, '');
    assert.equal(empty.ok, false);
    assert.equal(empty.reason, E.validateModelName(s, '', { role: 'flagship', modelId: w.id }).reason);
    assert.match(empty.reason, /名字不能是空的/);

    const released = s.models.find(m => m.stage === 'released' && typeof m.name === 'string');
    assert.ok(released, '开局要有一款已发布的模型');
    const dup = releaseName.checkName(s, w, released.name);
    assert.equal(dup.reason, E.validateModelName(s, released.name, { role: 'flagship', modelId: w.id }).reason);
    assert.match(dup.reason, /已经有一款叫/);

    const brand = '文心大模型 9';
    const other = releaseName.checkName(s, w, brand);
    assert.equal(other.reason, E.validateModelName(s, brand, { role: 'flagship', modelId: w.id }).reason);
    assert.match(other.reason, /品牌/);

    // 渲染出来的错误行和按钮状态跟同一个校验走：不合法时写着原因、按钮置灰。
    const badHtml = releaseName.render(s, w, 'flagship', { name: '', grant: null });
    assert.match(badHtml, /data-name-err[^>]*>名字不能是空的/);
    assert.match(badHtml, /data-ok="0"/);
    const okHtml = releaseName.render(s, w, 'flagship', { name: '星河 1.0', grant: null });
    assert.match(okHtml, /data-ok="1"/);
    assert.match(okHtml, /data-name-err hidden/);
  });
});

describe('史实型号名：列出来、逐条 ✓/✗ 和当前值、条件不满足不能勾', () => {
  it('有两个能争取的名字时逐个列出，条件行带 ✓/✗ 和现在是多少；不合格的勾选框 disabled', () => {
    const s = game();
    const w = ready(s);
    w.train = { severe: 3, minor: 0 };
    withNames('deepseek', [hn('hn_good', '星河一号'), hn('hn_bad', '星河二号', { clean: 'base' })], () => {
      grantRight(s, 'hn_good');
      grantRight(s, 'hn_bad');
      const html = releaseName.render(s, w, 'flagship');
      assert.match(html, /使用史实型号名/);
      assert.match(html, /星河一号/);
      assert.match(html, /星河二号/);
      // 干净训练那一条不满足：✗ 和“现在”一起写出来。
      assert.match(text(html), /✗ 底座练得干净/);
      assert.match(text(html), /现在：严重炸炉 3 次，小故障 0 次/);
      // 拿到授权的 ✓ 和有效期也写出来。
      assert.match(text(html), /✓ 持有型号名「星河一号」的授权/);
      assert.match(text(html), /现在：持有，2027-01-01 前有效/);
      // 条件不满足的那一个勾不了。
      assert.match(html, /data-grant="hn_bad"  disabled/);
      assert.doesNotMatch(html, /data-grant="hn_good"  disabled/);
      // 默认预填的是能用的那个授名（C1 的预填顺序：可用的授名 → 建议名），名字框锁定成它。
      assert.match(html, /value="星河一号"[^>]*readonly/);
    });
  });

  it('没有任何能争取的型号名时，整块“使用史实型号名”不出现', () => {
    const s = game();
    const w = ready(s);
    withNames('deepseek', [], () => {
      const html = releaseName.render(s, w, 'flagship');
      assert.doesNotMatch(html, /使用史实型号名/);
      assert.doesNotMatch(html, /data-grant=/);
    });
  });

  it('勾了授名以后，名字框锁定为型号名；有 series 的可以改成它的变体，按引擎规则校验', () => {
    const s = game();
    const w = ready(s);
    withNames('deepseek', [hn('hn_series', '星河三号', { series: '星河三号-' })], () => {
      grantRight(s, 'hn_series');
      const locked = releaseName.render(s, w, 'flagship', { grant: 'hn_series' });
      assert.match(locked, /value="星河三号"/);
      assert.doesNotMatch(locked, /value="星河三号"[^>]*readonly/);
      assert.match(locked, /以「星河三号-」开头/);
      const variant = releaseName.checkName(s, w, '星河三号-7B', { grant: 'hn_series' });
      assert.equal(variant.ok, true, variant.reason);
      const wrong = releaseName.checkName(s, w, '星河四号', { grant: 'hn_series' });
      assert.equal(wrong.ok, false);
      assert.match(wrong.reason, /要么以「星河三号-」开头/);
    });
  });
});

describe('顶替在线旗舰：只对弱款出现、默认不勾，勾上交出 replace: true', () => {
  it('强于在线旗舰的没有勾选；弱款有勾选，默认不勾，两句说明都在', () => {
    const strong = game();
    const sw = ready(strong);
    const strongHtml = releasePanel.form(strong, sw, 'main');
    assert.doesNotMatch(strongHtml, /data-replace/);

    const weak = game();
    const ww = ready(weak, { weak: true });
    assert.equal(E.releaseLine(weak, ww), 'side');
    const weakHtml = releasePanel.form(weak, ww, 'main');
    assert.match(weakHtml, /data-replace/);
    assert.doesNotMatch(weakHtml, /data-replace checked/);
    assert.match(text(weakHtml), /作为副线发布：不上线服务、不按旗舰评期待/);
    // 小模型那一块没有这个勾选。
    const smallHtml = releasePanel.form(weak, ww, 'small');
    assert.doesNotMatch(smallHtml, /data-replace/);
  });

  it('pick 在勾上顶替时交出 replace: true；交出的参数真的进 submitEval 的候选方案', () => {
    const s = game();
    const w = ready(s, { weak: true });
    const box = boxOf({
      'input[data-tier]:checked': { value: 'standard' },
      '#rel-open': { checked: false },
      '[data-rel-name]': { value: '星河 1.0' },
      '[data-replace]': { checked: true },
    });
    const [action, arg] = releasePanel.pick({}, btn({ pick: 'flagship', model: w.id }, box));
    assert.equal(action, 'submit');
    assert.equal(arg.replace, true);
    assert.equal(arg.name, '星河 1.0');
    const r = E.submitEval(s, { modelId: w.id, tier: arg.tier, opts: arg });
    assert.equal(r.kind, 'submit');
    const plan = s.evals.at(-1).plan;
    assert.equal(plan.name, '星河 1.0');
    assert.equal(plan.replace, true);
  });
});

describe('名字和授名从 pick 一路进 submitEval', () => {
  it('pick 交出 name 和 grant；候选方案里的 plan.name、plan.grant 对得上', () => {
    const s = game();
    const w = ready(s);
    withNames('deepseek', [hn('hn_pick', '星河五号')], () => {
      grantRight(s, 'hn_pick');
      const box = boxOf({
        'input[data-tier]:checked': { value: 'standard' },
        '#rel-open': { checked: false },
        '[data-rel-name]': { value: '星河五号' },
        '[data-grant]:checked': { dataset: { grant: 'hn_pick' } },
      });
      const [action, arg] = releasePanel.pick({}, btn({ pick: 'flagship', model: w.id }, box));
      assert.equal(action, 'submit');
      assert.equal(arg.name, '星河五号');
      assert.equal(arg.grant, 'hn_pick');
      const r = E.submitEval(s, { modelId: w.id, tier: arg.tier, opts: arg });
      assert.equal(r.kind, 'submit');
      const plan = s.evals.at(-1).plan;
      assert.equal(plan.name, '星河五号');
      assert.equal(plan.grant, 'hn_pick');
      assert.equal(s.strategy.rights.hn_pick.used, s.evals.at(-1).cand.id);
    });
  });
});

describe('期待预告和发布结果卡：有、无两种情况都能渲染', () => {
  it('有预告：写引擎的 text、档位和徽章中文名；没有模型（返回 null）时整行不出现', () => {
    const s = game();
    const w = ready(s);
    const p = E.expectPreview(s, w);
    assert.ok(p && typeof p.text === 'string');
    const html = releasePanel.preview(s, w);
    assert.ok(html.includes(p.text), html);
    assert.match(text(html), /期待预告/);
    assert.doesNotMatch(text(html), /champion|challenger|open_top|community/);
    assert.equal(E.expectPreview(s, null), null);
    assert.equal(releasePanel.preview(s, null), '');
  });

  it('结果卡：有 market 反应时写结果和徽章中文名；旧快照没有这两个字段时整行不出现', () => {
    const over = marketLine({ expect: { tier: 'challenger', result: 'over' }, badges: ['open_top', 'works'] });
    assert.match(text(over), /市场反应/);
    assert.match(text(over), /超出预期/);
    assert.match(text(over), /开源最强、能干活/);
    assert.equal(marketLine({}), '');
    assert.equal(marketLine({ expect: null, badges: [] }), '');
    assert.equal(marketLine({ expect: { result: null } }), '');
  });
});

describe('训练页的代号输入：底座和蒸馏各一个，非法代号当场提示', () => {
  it('底座表单和蒸馏表单都有“代号（选填）”；非法代号写引擎的原因', () => {
    const s = game();
    const st = {};
    const pf = projectForm.render(s, st);
    assert.match(pf, /data-draft="proj"/);
    assert.match(text(pf), /代号（选填）/);

    const sd = {};
    const df = distillForm.render(s, sd);
    assert.match(df, /data-draft="distill"/);

    st.proj.draftName = '训练中';
    assert.match(text(projectForm.render(s, st)), /代号里不能有“训练中”/);
    sd.distill.draftName = '坏#代号';
    assert.match(text(distillForm.render(s, sd)), /代号只能用字母、数字、汉字/);
  });
});

describe('窄屏：新样式都在本包里，输入框和条件列表能缩成一列、原位展开', () => {
  it('375px：输入框按格子宽、条件列表用 minmax(0, 1fr)，没有 fixed 弹层', () => {
    const css = fs.readFileSync(new URL('../../src/career/css/naming.css', import.meta.url), 'utf8');
    const at = sel => cssAt(css, sel, 375);
    assert.equal(at('.rel-name-field input').width, '100%');
    assert.equal(at('.rel-grants')['min-width'], '0');
    assert.equal(at('.grant-lines')['min-width'], '0');
    assert.match(at('.grant-lines').display || '', /grid/);
    assert.match(at('.grant-lines li')['grid-template-columns'] || '', /minmax\(0, 1fr\)/);
    assert.match(at('.market-line')['flex-wrap'] || '', /wrap/);
    assert.doesNotMatch(css, /position:\s*fixed/);
    // 由 index.html 引入（样式表的顺序在 strategy.css 之后）。
    const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    assert.match(html, /css\/naming\.css/);
  });
});
