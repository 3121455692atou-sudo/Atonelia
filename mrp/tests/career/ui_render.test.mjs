// 页面渲染冒烟（P0.2b 拆分 ui）：在 Node 里构造游戏状态，调用后台每一页、训练页的新作业表单、主界面每个选择面板和主界面本身的渲染，
// 不抛错、返回非空。界面模块之间共用的状态和弹层都在 ui/state.js，模块加载时不碰页面，所以能在 Node 里直接导入；
// 只有 fmt.js 拼美术地址要 document.baseURI，给一个最小的替身。另外静态检查：没有模块从 ui/app.js 导入。
// 训练作业的界面（P2.4b，规格 T10）在文件后半：24 家公司在八种状态下训练页、首页、模型页、送评面板都能渲染，各种状态的文案，
// 训练页和“进行中”卡的操作，送评面板，评完自动发布的结果卡，手机版面的样式锁定。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import { companyFile } from '../../src/career/data/companies/index.js';
import { loadSave } from '../helpers/career_util.mjs';
import { PLAYABLE, SCENARIOS } from '../../src/career/data/core.js';
import { resolveAll, playGame } from '../helpers/career_bot.mjs';
import { EVAL } from '../../src/career/data/balance.js';
const STD = EVAL.TIERS.standard.days;   // 标准档评测天数（P4.2 调过，测试不写死）
import * as L from '../helpers/legacy_jobs.mjs';
// 本家树会带数值特质；这里只测面板文案，先把本家的摘掉（P3.T 起 gpt 有本家树）。
const stripHome = s => { const home = companyFile(s.charId)?.spirits || {}; for (const id of Object.keys(s.strategy?.spirits || {})) if (home[id]) delete s.strategy.spirits[id]; return s; };

globalThis.document ??= { baseURI: 'http://localhost/' };
const ui = p => import(`../../src/career/ui/${p}`);
const { PAGES, PAGE, NAV_GROUPS } = await ui('office.js');
const projectForm = await ui('pages/project_form.js');
const distillForm = await ui('pages/distill_form.js');
const { renderHome, homeLine } = await ui('home.js');
const { setState, ui: uiState } = await ui('state.js');
const PANELS = Object.fromEntries(await Promise.all(['data', 'eval', 'release', 'release_name', 'release_open'].map(async k => [k, await ui(`panels/${k}.js`)])));
const trainPage = await ui('pages/train.js');

const UI_DIR = new URL('../../src/career/ui/', import.meta.url);
const uiFiles = fs.readdirSync(UI_DIR, { recursive: true }).filter(f => f.endsWith('.js') && !f.split(/[\\/]/).pop().startsWith('._'));
// 后台自己的状态（office.js 里的 st），每次渲染用一份新的。
const freshSt = () => ({ page: 'model', bench: null, cls: '', board: 'bench', proj: null, distill: null, ticker: 'NVDA', newJob: null, small: null, post: null, trial: null, ft: null, plan: null, opt: {}, jobMenu: null, modelOpen: null, submit: null, planEdit: false });
const clone = v => JSON.parse(JSON.stringify(v));
const label = s => `${s.charId} ${s.scenario} ${s.day}（${s.status}）`;
const nonEmpty = (html, what) => { assert.equal(typeof html, 'string', what); assert.ok(html.trim().length > 0, `${what} 是空的`); return html; };

// 渲染一份状态下的全部页面和面板；返回渲染了几次。
function renderAll(s) {
  const at = label(s);
  let n = 0;
  for (const [id, name] of PAGES) {
    nonEmpty(PAGE[id].render(s, freshSt()), `${at} 后台「${name}」`);
    n++;
  }
  // 榜单页的三个标签和量级筛选。
  for (const st of [{ board: 'usage' }, { board: 'value' }, { board: 'bench', cls: 'small' }, { board: 'bench', cls: 'frontier' }]) {
    nonEmpty(PAGE.boards.render(s, { ...freshSt(), ...st }), `${at} 榜单 ${JSON.stringify(st)}`);
    n++;
  }
  // 训练页的新作业表单逐个展开；底座、蒸馏两张表单单独再渲染一次。蒸馏表单只给有在线模型的语言模型公司。
  for (const k of ['pretrain', 'post', 'distill', 'small', 'trial', 'finetune']) { nonEmpty(PAGE.train.render(s, { ...freshSt(), page: 'train', newJob: k }), `${at} 训练页新作业 ${k}`); n++; }
  nonEmpty(PAGE.train.render(s, { ...freshSt(), page: 'train', jobMenu: s.jobs?.list?.[0]?.id ?? null, modelOpen: 'main', planEdit: true }), `${at} 训练页展开`);
  n++;
  nonEmpty(projectForm.render(s, freshSt()), `${at} 立项表单`);
  n++;
  if (s.mod === 'llm' && E.liveModel(s)) { nonEmpty(distillForm.render(s, freshSt()), `${at} 蒸馏表单`); n++; }
  for (const k of ['data', 'eval', 'release']) { nonEmpty(PANELS[k].render(s), `${at} 面板 ${k}`); n++; }
  // 子面板：名字那一行（P3.U2）跟着模型渲染；开源那一行按路线显示（P1.3），有模型可发时不为空。
  const w = E.workingModel(s) || E.liveModel(s);
  if (w) nonEmpty(PANELS.release_name.render(s, w, 'flagship'), `${at} 子面板 release_name`);
  else assert.equal(PANELS.release_name.render(s, w, 'flagship'), '', `${at} 子面板 release_name`);
  n++;
  if (w) { nonEmpty(PANELS.release_open.render(s, w, 'flagship'), `${at} 子面板 release_open`); n++; }
  if (s.status === 'playing') {
    // 主界面从 state.js 取当前存档。
    const app = { className: '', innerHTML: '' };
    setState(s);
    renderHome(app);
    assert.equal(app.className, 'app app--home');
    nonEmpty(app.innerHTML, `${at} 主界面`);
    n++;
  }
  return n;
}

describe('界面模块不从 app.js 导入', () => {
  it('ui/ 下所有模块（含 pages/、panels/）都不导入 app.js；state.js 只导入 storage.js', () => {
    assert.ok(uiFiles.length >= 30, `ui/ 下只有 ${uiFiles.length} 个模块`);
    for (const f of uiFiles) {
      const src = fs.readFileSync(new URL(f, UI_DIR), 'utf8');
      const deps = [...src.matchAll(/(?:from\s+|import\(\s*)'([^']+)'/g)].map(m => m[1]);
      assert.ok(!deps.some(d => /(^|\/)app\.js$/.test(d)), `${f} 从 app.js 导入：${deps.join(', ')}`);
      if (f === 'state.js') assert.deepEqual(deps, ['./storage.js']);
    }
  });
  it('后台登记 18 页（按 A11 分四组：公司策略在“公司”组第一项，“模型”组第一项是训练；公司历程已上线，显示 18 页），每页都有 render；主界面有三个选择面板和两个空子面板，旧的团队任务面板删了', () => {
    assert.equal(PAGES.length, 19);
    assert.deepEqual(NAV_GROUPS.map(([g, ids]) => [g, ids]), [['公司', ['strategy', 'goals', 'history', 'capital', 'finance', 'legal']], ['模型', ['train', 'model', 'data', 'tech', 'boards']], ['市场', ['service', 'compute', 'rivals', 'market', 'exchange', 'news']], ['其他', ['archive', 'settings']]]);
    assert.deepEqual(NAV_GROUPS[1][1].slice(0, 2), ['train', 'model']);
    assert.deepEqual(PAGES.filter(([id]) => PAGE[id].hidden).map(([id]) => id), []);
    assert.equal(PAGES.filter(([id]) => !PAGE[id].hidden).length, 19);
    assert.deepEqual(Object.keys(PAGE).sort(), PAGES.map(([id]) => id).sort());
    for (const [id] of PAGES) assert.equal(typeof PAGE[id].render, 'function', id);
    for (const k of ['data', 'eval', 'release']) assert.equal(typeof PANELS[k].pick, 'function', k);
    assert.ok(!fs.existsSync(new URL('panels/train.js', UI_DIR)), '旧训练面板（panels/train.js）应该删掉');
    assert.ok(!uiFiles.some(f => /panels[\\/]train\.js$/.test(f)));
    const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    assert.match(html, /<link rel="stylesheet" href="\.\/src\/career\/css\/train\.css\?v=4" \/>/);
  });
});

describe('页面渲染冒烟', () => {
  it('24 家公司 × 4 个剧本的开局：后台每一页、两张表单、四个面板和主界面都能渲染', () => {
    let n = 0;
    for (const p of PLAYABLE) for (const sc of SCENARIOS) {
      const s = E.createGame(p.id, sc.id, 7);
      resolveAll(s);
      n += renderAll(s);
    }
    assert.ok(n > 96 * 25, `只渲染了 ${n} 次`);
  });

  it('机器人整局里每 13 周的状态和终局：在练的项目、在途订单、上市、集团团队、结算后都走到', () => {
    const picks = [['deepseek', 'y2023'], ['qwen', 'y2024'], ['gpt', 'y2023'], ['glm', 'y2025'], ['claude', 'y2024'], ['mistral', 'y2023'], ['image2', 'y2024'], ['suno', 'y2023'], ['elevenlabs', 'y2025'], ['kimi', 'y2026'], ['gemini', 'y2023'], ['seed', 'y2024']];
    let snaps = 0, week = 0;
    const seen = { project: 0, orders: 0, listed: 0, division: 0, ended: 0 };
    for (const [id, sc] of picks) {
      const { s } = playGame(id, sc, 3, { onWeek: x => { if (++week % 13 === 0) { const c = clone(x); renderAll(c); snaps++; seen.project += E.hasBaseJob(c); seen.orders += c.orders.length > 0; seen.listed += !!c.capital.listed; seen.division += c.company.kind === 'division'; } } });
      renderAll(s);
      seen.ended += s.status === 'ended';
    }
    assert.ok(snaps >= 60, `只取了 ${snaps} 个中途状态`);
    for (const [k, v] of Object.entries(seen)) assert.ok(v > 0, `没走到「${k}」的状态：${JSON.stringify(seen)}`);
  });

  it('机器人碰不到的分支：打官司中、有诉讼记录、灰色渠道找上门', () => {
    // 机器人遇到诉讼总是整改和解、也不走私，这里在中局存档上直接放进去（字段照引擎 openCaseNow、grayTick 的写法）。
    let c = null;
    playGame('deepseek', 'y2024', 3, { onWeek: x => { if (!c && x.day >= '2025-03-01') c = clone(x); } });
    assert.ok(c && c.status === 'playing');
    c.legal.cases.push({ type: 'books', title: '作家集体诉讼', claim: 3e7, winp: 0.4, left: 5, fee: 3e5, opened: c.date, fighting: true });
    c.legal.history.push({ type: 'tos', title: '服务条款纠纷', claim: 1e6, winp: 0.5, left: 0, fee: 1e4, opened: '2024-06', outcome: '和解' });
    c.gray = { owned: {}, bought: {}, month: c.date, heat: 0, total: 512, spent: 1e7 };
    renderAll(c);
    const law = PAGE.legal.render(c, freshSt());
    assert.match(law, /作家集体诉讼/);
    assert.match(law, /服务条款纠纷（2024-06）/);
    assert.match(PAGE.compute.render(c, freshSt()), /灰色渠道/);
  });

  it('6 份 v3 旧档读进来后也都能渲染', () => {
    const dir = new URL('../fixtures/saves/', import.meta.url);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('._'));
    assert.equal(files.length, 6);
    for (const f of files) {
      const s = loadSave(JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')));
      assert.ok(s && E.validateGame(s), f);
      renderAll(s);
    }
  });
});

describe('选择面板：点了哪一项就下哪个决定（和拆分前 openPicker 的写法一致）', () => {
  // 面板关掉之前要读的勾选框：最小的替身，只认 querySelector / querySelectorAll。
  const root = (checked = {}, papers = []) => ({ querySelector: sel => (sel in checked ? { checked: checked[sel] } : null), querySelectorAll: () => papers.map(value => ({ value })) });
  const btn = dataset => ({ dataset });
  it('订数据、跑分（小模型、竞技场特调版只对竞技场有效）、送评（评测档、开源勾选、技术报告、发哪一个小模型）', () => {
    assert.deepEqual(PANELS.data.pick(root(), btn({ pick: 'web' })), ['data', { id: 'web' }]);
    assert.deepEqual(PANELS.eval.pick(root({ '#eval-small': true, '#eval-variant': true }), btn({ pick: 'arena' })), ['eval', { bench: 'arena', role: 'small', arenaVariant: true }]);
    assert.deepEqual(PANELS.eval.pick(root({ '#eval-variant': true }), btn({ pick: 'mmlu' })), ['eval', { bench: 'mmlu', role: 'flagship', arenaVariant: false }]);
    assert.deepEqual(PANELS.eval.pick(root(), btn({ pick: 'mmlu' })), ['eval', { bench: 'mmlu', role: 'flagship', arenaVariant: undefined }]);
    // 送评面板（T10.3）：发 'submit'，带上这一块里选的评测档；没选到评测档时不带（引擎按默认档）。
    const tierRoot = (tier, checked = {}, papers = [], extra = {}) => ({ querySelector: sel => (sel === 'input[data-tier]:checked' ? (tier ? { value: tier } : null) : sel in extra ? extra[sel] : sel in checked ? { checked: checked[sel] } : null), querySelectorAll: () => papers.map(value => ({ value })) });
    assert.deepEqual(PANELS.release.pick(root({ '#rel-open': true, '#rel-small-open': false }, ['moe']), btn({ pick: 'flagship' })), ['submit', { open: true, papers: ['moe'] }]);
    assert.deepEqual(PANELS.release.pick(tierRoot('standard', { '#rel-open': true }, ['moe']), btn({ pick: 'flagship' })), ['submit', { tier: 'standard', open: true, papers: ['moe'] }]);
    assert.deepEqual(PANELS.release.pick(tierRoot('skip', { '#rel-open': false }), btn({ pick: 'prev', model: 'm3_2025-01' })), ['submit', { modelId: 'm3_2025-01', tier: 'skip', open: false, papers: [] }]);
    assert.deepEqual(PANELS.release.pick(root({ '#rel-open': true, '#rel-small-open': false }), btn({ pick: 'small', model: 'm9_2025-01' })), ['submit', { role: 'small', modelId: 'm9_2025-01', open: false, papers: [] }]);
    // 小模型有好几个时，“发哪一个”下拉选的那个优先。
    assert.deepEqual(PANELS.release.pick(tierRoot('quick', {}, [], { '#rel-small-pick': { value: 'm12_2025-03' } }), btn({ pick: 'small', model: 'm9_2025-01' })), ['submit', { role: 'small', modelId: 'm12_2025-03', tier: 'quick', open: undefined, papers: [] }]);
  });
});

describe('G1 遗留 B：界面上看得到的文案和模拟同一口径', () => {
  const homeHtml = s => { const app = { className: '', innerHTML: '' }; setState(s); renderHome(app); return app.innerHTML; };
  it('#8 Agent 开没开放按 E.dimUnlocked：没学会「函数调用」时主界面、模型页、立项表单都写“学会「函数调用」后出现”，学会以后正常显示', () => {
    const LOCK = '学会「函数调用」后出现';
    const s = E.createGame('glm', 'y2023', 7);
    resolveAll(s);
    assert.ok(E.workingModel(s) && !s.techs.includes('func_call'));
    assert.equal(E.dimUnlocked(s, 'llm', 'agent'), false);
    const home = homeHtml(s);
    assert.match(home, /<div class="dim locked" data-dim="agent"><span class="dim-l">Agent<\/span><span class="dim-bar"><\/span><b>—<\/b><small>学会「函数调用」后出现<\/small>/);
    assert.ok(PAGE.model.render(s, freshSt()).includes(`Agent <small>${LOCK}</small>`));
    assert.ok(projectForm.render(s, freshSt()).includes(`Agent <small>${LOCK}</small>`));
    s.techs.push('func_call');
    assert.equal(E.dimUnlocked(s, 'llm', 'agent'), true);
    assert.match(homeHtml(s), /<div class="dim " data-dim="agent">/);
    for (const html of [homeHtml(s), PAGE.model.render(s, freshSt()), projectForm.render(s, freshSt())]) assert.ok(!html.includes(LOCK));
  });

  it('#17 数据页的生成订单：排在后面的写“排在前一张后面，等它跑完”，预算放不下才写“推理卡放不下老师”；暂停写“已暂停 N 天”', () => {
    const s = E.createGame('rwkv', 'y2025', 1);
    resolveAll(s);
    s.inferShare = 0.6;
    for (const o of E.distillOptions(s).filter(x => x.ok && x.open).slice(0, 2)) E.decide(s, 'data', { id: o.id });
    const [a, b] = s.orders.filter(o => o.gen);
    const rowOf = (html, o) => html.slice(html.indexOf(`<b>${o.name}</b>`), html.indexOf('</li>', html.indexOf(`<b>${o.name}</b>`)));
    let html = PAGE.data.render(s, freshSt());
    assert.ok(rowOf(html, b).includes('排在前一张后面，等它跑完'), rowOf(html, b));
    assert.ok(!html.includes('推理卡放不下老师'));
    s.inferShare = 0.05;
    html = PAGE.data.render(s, freshSt());
    for (const o of [a, b]) assert.match(rowOf(html, o), /推理卡放不下老师（至少要 \d+ 张 H100 的显存）/);
    s.inferShare = 0.6;
    E.decide(s, 'data', { id: `gen:pause:${a.id}` });
    assert.ok(rowOf(PAGE.data.render(s, freshSt()), a).includes('今天刚暂停'));
    for (let i = 0; i < 3; i++) { E.tickDay(s); s.queue = []; }
    html = PAGE.data.render(s, freshSt());
    assert.ok(rowOf(html, a).includes('已暂停 3 天'), rowOf(html, a));
    assert.ok(!/暂停中|明天了|今天了/.test(html));
  });

  it('#19 订数据面板和里程碑弹窗的蒸馏工期读生成工期 genDays（合成教材也是），不再写“约 2 周”“约两周”', () => {
    const s = E.createGame('rwkv', 'y2025', 7);
    resolveAll(s);
    if (!s.techs.includes('textbook')) s.techs.push('textbook');
    s.inferShare = 0.6;
    const panel = PANELS.data.render(s);
    assert.ok(!panel.includes('约 2 周'));
    const opts = E.dataOptions(s);
    const synth = opts.find(o => o.id === 'ds_synth_self');
    const dist = opts.filter(o => o.distill && o.open);
    assert.ok(synth && Number.isFinite(synth.genDays) && dist.length > 0);
    const rowOf = o => panel.slice(panel.indexOf(`data-pick="${o.id}"`), panel.indexOf('</button>', panel.indexOf(`data-pick="${o.id}"`)));
    for (const o of [synth, ...dist]) assert.ok(rowOf(o).includes(Number.isFinite(o.genDays) ? `约 ${o.genDays} 天到` : '推理卡放不下老师'), rowOf(o));
    // 推理份额压到放不下任何老师：直接说放不下，不写“约 Infinity …”。
    s.inferShare = 0.05;
    const tight = PANELS.data.render(s);
    assert.ok(tight.includes('推理卡放不下老师，下单后要等') && !/Infinity|NaN/.test(tight));
    // 别家发布开源新款的里程碑：“下载权重做蒸馏”的提示写这一单的生成工期。
    s.inferShare = 0.6;
    const opt = E.distillOptions(s).find(o => o.teacher === 'llama');
    s.queue.unshift({ kind: 'milestone', id: 'ms_open_commercial', v: 'rival', fam: 'llama', rel: 'Llama 3.3 70B' });
    const choice = E.currentEvent(s).choices.find(c => c.id === 'distill');
    assert.ok(choice.hint.includes(`用自己的推理卡跑约 ${opt.genDays} 天，拿到蒸馏数据`), choice.hint);
    assert.ok(!choice.hint.includes('两周'));
  });

  it('#21 模型页对没发布的模型写发布时的开闭规则（不读 m.open）；蒸馏表单没有“开源”勾选', () => {
    const weight = html => (html.match(/<li><span>权重<\/span><b>([^<]*)<\/b>/g) || []).map(x => x.replace(/<[^>]+>/g, '').replace('权重', ''));
    // llama（受限许可开源）：在线旗舰照实写开源；在练的这一版现在发布会顶替旗舰，按路线开源。
    const l = E.createGame('llama', 'y2024', 7);
    resolveAll(l);
    assert.deepEqual(weight(PAGE.model.render(l, freshSt())), ['开源', '发布时按路线：开源']);
    // 弱于在线旗舰、会作为副线发布：开不开源自己选，写路线的默认。
    const w = E.workingModel(l);
    w.dims = Object.fromEntries(Object.entries(E.liveModel(l).dims).map(([k, v]) => [k, v - 5]));
    assert.deepEqual(weight(PAGE.model.render(l, freshSt())), ['开源', '发布时自己选（路线默认开源）']);
    // gpt（闭源）。
    const g = E.createGame('gpt', 'y2024', 7);
    resolveAll(g);
    assert.deepEqual(weight(PAGE.model.render(g, freshSt())), ['闭源', '发布时按路线：闭源']);
    const form = distillForm.render(g, freshSt());
    assert.ok(!form.includes('data-dist="open"') && form.includes('开不开源到发布时再定。路线：闭源'), form);
  });
});

// ---------------- 训练作业的界面（P2.4b，规格 T10） ----------------
// 八种状态（F2 P2.4b 的验收）：没有作业、底座加后训练、排队、检修、评测中、上一代收尾、小模型线满、小模型评测中。
// 造法照引擎的出口来（startJob、decide、baseTick），只有“练满一项作业”“攒够送评天数”这两步直接改字段（和 jobs.test、naming.test 同一个写法）。
const SMALL_TOTALS = [7, 3, 1];
const fillUp = j => { j.pj.done = j.pj.need; if (j.pj.acc) Object.assign(j.pj.acc, { w: 1, q: 1.2, effectiveQ: 1.2, repeat: 1 }); if (j.pj.minDays) j.pj.elapsedDays = j.pj.minDays; };
// 能立项的最小底座配置（语言模型 7B；其余取第一档立得了项的规模）。
function smallBase(s) {
  if (s.mod === 'llm') return { total: 7, active: 7, arch: 'dense', tokens: 1 };
  return SCALES_OF(s).map(x => ({ scaleId: x.id, tokens: 1 })).find(cfg => E.projectCheck(s, cfg).ok) || null;
}
const { SCALES } = await import('../../src/career/data/core.js');
const SCALES_OF = s => SCALES[s.mod] || [];
const distillCfg = s => SMALL_TOTALS.map(t => ({ teacher: 'self', total: t, active: t, arch: 'dense', tokens: 1.5 })).find(cfg => E.jobCheck(s, { kind: 'distill', cfg }).ok) || null;
function trainStates(id, sc) {
  const fresh = () => { const s = E.createGame(id, sc, 7); resolveAll(s); return s; };
  const mainPost = (s, until = 'none') => { const w = E.workingModel(s); if (w?.stage === 'post' && !E.mainPostJob(s)) E.startJob(s, { kind: 'post', target: 'main', dir: 'auto', until }); };
  const base = s => { const cfg = smallBase(s); return cfg && E.jobCheck(s, { kind: 'pretrain', line: 'main', cfg }).ok ? E.startJob(s, { kind: 'pretrain', line: 'main', cfg }) : null; };
  const out = { 没有作业: fresh() };
  { const s = fresh(); mainPost(s); base(s); out.底座加后训练 = s; }
  // 排队：训练卡正好比所有作业的最低卡加起来少一张，排在最后的那项放不下。
  { const s = fresh(); mainPost(s); base(s);
    const need = E.allocJobs(s).items.reduce((a, i) => a + i.minCards, 0) - 1;
    if (need > 0) { s.inferShare = 0.5; E.setLease(s, E.gpuCount(s) - 2 * need); }
    if (E.allocJobs(s).items.some(i => i.why === 'min')) out.排队 = s; }
  { const s = fresh(); mainPost(s, { days: 30 }); E.decide(s, 'job', { op: 'repair', on: true }); s.health = 52; out.检修 = s; }
  { const s = fresh(); const w = E.workingModel(s);
    if (w?.stage === 'post') { w.postDays = (w.relDays || 0) + 30; s.deploy = []; E.decide(s, 'submit', { tier: 'standard' }); mainPost(s); out.评测中 = s; } }
  { const s = fresh(); const w = E.workingModel(s);
    if (w?.stage === 'post') { w.postDays = (w.relDays || 0) + 20; const j = base(s); if (j) { fillUp(j); E.baseTick(s, { notes: [] }); s.queue = []; if (s.prevWorking) out.上一代收尾 = s; } } }
  if (E.createGame(id, sc, 7).mod === 'llm') {
    const s = fresh();
    for (let i = 0; i < 3; i++) { const cfg = distillCfg(s); if (cfg) L.startDistill(s, cfg); }
    if (E.smallLineCount(s) === 3) out.小模型线满 = s;
    const t = fresh();
    const cfg = distillCfg(t);
    if (cfg) {
      const j = E.startJob(t, { kind: 'distill', cfg });
      fillUp(j); E.baseTick(t, { notes: [] }); t.queue = [];
      const m = E.smallModels(t)[0];
      if (m) { E.decide(t, 'submit', { role: 'small', modelId: m.id, tier: 'quick' }); out.小模型评测中 = t; }
    }
  }
  return out;
}
const homeOf = s => { const app = { className: '', innerHTML: '' }; setState(s); renderHome(app); return app.innerHTML; };
const nowCardOf = s => { const h = homeOf(s), i = h.indexOf('<div class="card now-card">'); return h.slice(i, h.indexOf('<div class="meter', i)); };
const trainOf = (s, extra = {}) => PAGE.train.render(s, { ...freshSt(), page: 'train', ...extra });
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const BAD = /undefined|NaN|\[object|(?<![\w-])null(?![\w-])|Infinity/;

describe('训练界面（P2.4b）：24 家公司在八种状态下都能渲染', () => {
  it('训练页（含每张新作业表单、⋯ 菜单、模型展开、原位送评）、首页、模型页、送评面板、算力页都不抛错，看得见的字里没有 undefined / NaN / null / Infinity', () => {
    const seen = {};
    let n = 0;
    for (const p of PLAYABLE) for (const sc of SCENARIOS) {
      for (const [k, s] of Object.entries(trainStates(p.id, sc.id))) {
        const at = `${p.id} ${sc.id} ${k}`;
        seen[k] = (seen[k] || 0) + 1;
        const w = E.workingModel(s);
        const views = [
          trainOf(s, { jobMenu: s.jobs.list[0]?.id ?? null, modelOpen: 'main', planEdit: true }),
          trainOf(s, { newJob: ['pretrain', 'post', 'distill', 'small', 'trial', 'finetune'][n % 6], submit: w?.stage === 'post' ? w.id : E.smallModels(s)[0]?.id ?? null }),
          homeOf(s), PAGE.model.render(s, freshSt()), PANELS.release.render(s), PAGE.compute.render(s, freshSt()),
        ];
        for (const html of views) { nonEmpty(html, at); assert.doesNotMatch(text(html), BAD, `${at}：${text(html).match(BAD)?.index}`); n++; }
      }
    }
    // 每种状态都在足够多的开局上走到（没有在练模型、没有在线模型的开局造不出评测、上一代、小模型那几种）。
    for (const k of ['没有作业', '底座加后训练', '排队', '检修', '评测中', '上一代收尾', '小模型线满', '小模型评测中']) assert.ok((seen[k] || 0) >= 12, `「${k}」只走到 ${seen[k] || 0} 个开局：${JSON.stringify(seen)}`);
    assert.ok(n > 96 * 6 * 6, `只渲染了 ${n} 次`);
  });
});

describe('训练界面（P2.4b）：各种状态的文案（规格 T10.1、T10.2、T10.4）', () => {
  const st = trainStates('deepseek', 'y2025');
  it('没有作业：训练页写“现在没有作业”，在练模型没挂后训练时提示去挂；首页“进行中”写“没有作业 · 训练卡 0/N 在用”和“训练 ›”，没有“换任务”“全力推进”', () => {
    const s = st.没有作业;
    const t = text(trainOf(s));
    assert.match(t, /作业位 0\/\d（试验不占）· 训练卡 \d+ 张/);
    assert.match(t, /现在没有作业。在练的模型没人练：从下面挂一项后训练/);
    const card = nowCardOf(s);
    assert.match(text(card), /没有作业 · 训练卡 0\/\d+ 在用 训练 ›/);
    assert.doesNotMatch(card, /换任务|全力推进|data-act="push"/);
    // 主界面底部入口：“发布”改叫“送评”。
    assert.match(homeOf(s), /data-id="release"[^>]*>.*?<span>送评<\/span>/s);
  });
  it('底座加后训练：训练页按“优先在前”排 ①②，各有优先级标签、拿到/想要张数、进度；首页两行作业，末尾写训练卡 a/b 在用', () => {
    const s = st.底座加后训练;
    const html = trainOf(s);
    const rows = [...html.matchAll(/<span class="job-n">([^<]+)<\/span>\s*<b class="job-name">([^<]+)<\/b>\s*<button class="job-prio[^"]*"[^>]*>([^<]+)<\/button>\s*<span class="job-cards">(\d+)\/(\d+) 张/g)].map(m => [m[1], m[2].split(' · ')[0], m[3], Number(m[4]), Number(m[5])]);
    assert.deepEqual(rows.map(r => r.slice(0, 3)), [['①', '底座', '优先'], ['②', '后训练', '正常']]);
    for (const r of rows) assert.ok(r[3] > 0 && r[3] <= r[4], JSON.stringify(r));
    assert.match(text(html), /底座 · 7B 1T .*\d+% · 约 \d+ 天/);
    assert.match(text(html), /后训练 · 第 \d 代底座 · 自动（[^）]+） .*第 0 天 · 一个月约 \+\d/);
    const card = nowCardOf(s);
    assert.equal((card.match(/class="now-row now-job/g) || []).length, 2);
    const used = Number(text(card).match(/训练卡 (\d+)\/(\d+) 在用/)[1]);
    assert.equal(used, rows.reduce((a, r) => a + r[3], 0));
    // 分卡条四段：出租（没有就不画）｜推理｜训练按作业分色｜闲置；横条加起来正好是总卡数。
    const bar = PAGE.compute.render(s, freshSt());
    const flex = [...bar.slice(bar.indexOf('<div class="alloc">')).matchAll(/flex:([\d.e+-]+)/g)].map(m => Number(m[1]));
    assert.ok(Math.abs(flex.reduce((a, b) => a + b, 0) - E.gpuCount(s)) < 1e-6);
    assert.match(text(bar), /推理 \d+ 张 底座 \d+ 张 后训练 \d+ 张 训练卡闲置 \d+ 张/);
    // 闲置说的是“训练卡里闲着的比例”，图例写清楚，别让玩家以为全部卡都闲着。
    assert.match(text(bar), /训练卡闲置 \d+ 张（\d+%）/);
    assert.match(bar, /data-goto="train">训练卡怎么分去「训练」页 ›/);
  });
  it('排队：训练页写“排队：要 N 张，现在只剩 M 张”，首页那一行写“排队：缺 K 张卡”（警告色）', () => {
    const s = st.排队;
    const al = E.allocJobs(s);
    const q = al.items.find(i => i.why === 'min');
    const t = text(trainOf(s));
    const m = t.match(/排队：要 (\d+) 张，现在只剩 (\d+) 张/);
    assert.ok(m, t);
    assert.equal(Number(m[1]), q.minCards);
    assert.ok(Number(m[2]) < q.minCards);
    assert.match(nowCardOf(s), new RegExp(`<small class="warn">排队：缺 ${q.minCards - Number(m[2])} 张卡</small>`));
  });
  it('检修：训练页和首页都写“检修中 · 健康 52 → 75，约 15 天”；后训练那一行写“检修中：后训练先停着”，张数写“—”', () => {
    const s = st.检修;
    const t = text(trainOf(s));
    assert.match(t, /检修中 · 健康 52 → 75，约 15 天/);
    assert.match(t, /— 张 检修中：后训练先停着/);
    assert.match(t, /结束检修/);
    assert.match(text(nowCardOf(s)), /检修中 · 健康 52 → 75，约 15 天/);
    assert.match(text(nowCardOf(s)), /检修中，先停着/);
  });
  it('评测中：训练页有评测行（候选 · 标准 · 还剩 N 天，评测期间在练模型接着练）和“撤回”；首页评测排在作业后面；模型页有“候选·评测中”卡；送评面板写这一条线已经有候选在评测', () => {
    const s = st.评测中;
    const ev = s.evals[0];
    const html = trainOf(s);
    assert.match(text(html), new RegExp(`评测 ${ev.plan.name} 候选 · 标准 还剩 ${STD} 天（评测期间 第 \\d 代底座 接着练）`));
    assert.match(html, new RegExp(`data-cancel-eval="${ev.id}"`));
    const card = text(nowCardOf(s));
    assert.ok(card.indexOf('后训练') < card.indexOf('评测'), card);
    assert.match(card, new RegExp(`评测 ${ev.plan.name} 候选 · 标准 还剩 ${STD} 天`));
    assert.match(PAGE.model.render(s, freshSt()), new RegExp(`<span class="ev-tag">候选·评测中</span><b>${ev.plan.name}</b><small class="stage-pill">标准 · 还剩 ${STD} 天</small>`));
    assert.match(PAGE.model.render(s, freshSt()), /<span class="ev-tag">训练中<\/span><b>[^<]+<\/b><small class="stage-pill">后训练中 · 候选评测中<\/small>/);
    assert.match(text(PANELS.release.render(s)), /这一条线已经有候选在评测/);
  });
  it('上一代收尾：训练页写“还有 60 天归档 · 有 20 天没发布的进步”，有“送评”“后训练”；模型页有“上一代收尾”卡；送评面板多一块“上一代”', () => {
    const s = st.上一代收尾;
    const html = trainOf(s);
    assert.match(text(html), /上一代收尾 第 \d 代底座 还有 60 天归档 · 有 20 天没发布的进步/);
    assert.match(html, new RegExp(`data-submit="${s.prevWorking.id}" data-line="prev"`));
    assert.match(html, /data-new-post="prev"/);
    assert.match(PAGE.model.render(s, freshSt()), /<span class="ev-tag">上一代收尾<\/span>/);
    const panel = PANELS.release.render(s);
    assert.match(panel, /<b>上一代：[^<]+<\/b>/);
    assert.match(panel, new RegExp(`data-pick="prev" data-model="${s.prevWorking.id}"`));
  });
  it('小模型线满：模型区写“小模型线 3/3 满了”；蒸馏和小底座表单的按钮置灰，写“小模型线已满（3 个）”', () => {
    const s = st.小模型线满;
    assert.match(text(trainOf(s)), /小模型线 3\/3 满了/);
    for (const k of ['distill', 'small']) {
      const form = trainOf(s, { newJob: k });
      assert.match(form, /data-op="start-(distill|small)" disabled>[^<]*<\/button><span class="bad"> 小模型线已满（3 个）/, k);
    }
  });
  it('小模型评测中：评测行写“（小模型，已冻结）”；模型区写“评测中，还剩 N 天（已冻结）”，没有送评和后训练按钮；模型页是“评测中小模型”', () => {
    const s = st.小模型评测中;
    const m = s.models.find(x => x.evalId);
    const html = trainOf(s);
    assert.match(text(html), /（小模型，已冻结） · 快速 还剩 4 天/);
    assert.match(text(html), /评测中，还剩 4 天（已冻结）/);
    assert.doesNotMatch(html, new RegExp(`data-submit="${m.id}"|data-new-post="small:${m.id}"`));
    assert.match(PAGE.model.render(s, freshSt()), /<span class="ev-tag">评测中小模型<\/span><b>[^<]+<\/b><small class="stage-pill">已冻结<\/small>/);
  });
  it('非语言模型（Suno y2024）：没有小模型线；蒸馏、小底座按钮置灰写明原因；八种状态里能造的都能渲染', () => {
    const all = trainStates('suno', 'y2024');
    assert.ok(Object.keys(all).length >= 5, Object.keys(all).join('、'));
    const html = trainOf(all.没有作业);
    assert.match(html, /data-new="distill" disabled[^>]*>蒸馏小模型<small>（只有语言模型有小模型线）<\/small>/);
    assert.doesNotMatch(text(html), /小模型线 \d/);
  });
});

describe('训练界面（P2.4b）：多项作业、试验成功和失败、下一代计划', () => {
  it('试验：结果当场定，成功的结论进“下一代计划”卡，失败的写在“最近做完的试验”；底座表单写“试验省下 x%”', () => {
    const s = E.createGame('deepseek', 'y2025', 7);
    resolveAll(s);
    const plan = { total: 671, active: 37, arch: 'moe', tokens: 15 };
    E.decide(s, 'job', { op: 'plan', plan });
    // 没定计划时试验表单先让定计划；定了以后显示成功率、收益、占卡。
    assert.match(trainOf(s, { newJob: 'trial' }), /成功率/);
    const got = { ok: 0, fail: 0 };
    for (let i = 0; i < 40 && !(got.ok && got.fail); i++) {
      const j = E.startJob(s, { kind: 'trial', type: 'tune', size: 'small' });
      j.done = j.cost; j.elapsed = j.minDays - 1;
      const before = s.jobs.findings.length + s.log.length;
      E.baseTick(s, { notes: [] });
      assert.ok(!s.jobs.list.includes(j), '试验做完就移出作业表');
      assert.ok(s.jobs.findings.length + s.log.length > before);
      if (/成功/.test(s.log.at(-1).text)) got.ok++; else got.fail++;
    }
    assert.ok(got.ok && got.fail, JSON.stringify(got));
    const t = text(trainOf(s));
    assert.match(t, /下一代计划 .*671B\/37B MoE 稀疏专家 · 15T token/);
    assert.match(t, /调参小档成功：省算力 \d+\.\d%，炸炉 ×0\.\d\d/);
    assert.match(t, /最近做完的试验： .*试验 · 调参小档(成功|没成)/);
    assert.match(t, /架构验证：还没做 数据配比：还没做/);
    // 底座表单按计划立项：用掉调参结论，写“试验省下 x%”。
    assert.match(text(projectForm.render(s, { ...freshSt(), proj: { ...plan } })), /试验省下 \d+%/);
  });
  it('多项作业：训练页按优先在前编号 ①–④；首页最多 3 行，第 4 项写“还有 1 项”；作业位写“3/6（试验不占）”', () => {
    const s = E.createGame('deepseek', 'y2025', 7);
    resolveAll(s);
    E.decide(s, 'job', { op: 'plan', plan: { total: 671, active: 37, arch: 'moe', tokens: 15 } });
    E.startJob(s, { kind: 'post', target: 'main', dir: 'code', until: { days: 30 } });
    E.startJob(s, { kind: 'pretrain', line: 'main', cfg: { total: 7, active: 7, arch: 'dense', tokens: 1 } });
    E.startJob(s, { kind: 'trial', type: 'tune', size: 'mid' });
    L.startDistill(s, distillCfg(s));
    const html = trainOf(s);
    assert.deepEqual([...html.matchAll(/<span class="job-n">([^<]+)<\/span>/g)].map(m => m[1]), ['①', '②', '③', '④']);
    assert.match(text(html), /作业位 3\/\d（试验不占）/);
    assert.match(text(html), /后训练 · 第 \d 代底座 · 代码 .*第 0 天，还剩 30 天/);
    assert.match(text(html), /试验 · 调参中档 .*成功率 \d+%/);
    const card = nowCardOf(s);
    assert.equal((card.match(/class="now-row now-job/g) || []).length, 3);
    assert.match(text(card), /还有 1 项 · 训练卡 \d+\/\d+ 在用 训练 ›/);
  });
});

describe('训练界面（P2.4b）：操作（训练页的点击和改动、首页原位展开）', () => {
  // 后台的 ctx：guard 照 office.js 的写法（出错记下原因，结果带 note 就记下提示）。
  const ctxOf = st => { const notes = [], errors = []; return { st, notes, errors, draw() {}, guard(fn) { try { const r = fn(); if (r?.note) notes.push(r.note); } catch (e) { errors.push(e.message); } } }; };
  // 点击和改动的目标：只认 [data-xxx] 这种选择器（按 dataset 里有没有这个键）；box 是外面那层送评块。
  const camel = a => a.replace(/^data-/, '').replace(/-([a-z])/g, (m, c) => c.toUpperCase());
  const target = (dataset, extra = {}) => {
    const t = { dataset, textContent: '', value: extra.value ?? '', checked: extra.checked ?? false };
    t.closest = sel => {
      if (sel === '[data-submit-box] [data-pick]') return extra.box && 'pick' in dataset ? t : null;
      if (sel === '[data-submit-box]') return extra.box || null;
      const m = sel.match(/^\[([\w-]+)\]$/);
      return m && camel(m[1]) in dataset ? t : null;
    };
    return t;
  };
  const game = () => { const s = E.createGame('deepseek', 'y2025', 7); resolveAll(s); return s; };

  it('新作业按钮在原位展开表单、再点收起；开后训练（默认 30 天）、改优先级、设“最多 N 张”（比最低卡少时报原因）、暂停 / 继续、取消要点两次', () => {
    const s = game();
    const st = { ...freshSt(), page: 'train' };
    const c = ctxOf(st);
    PAGE.train.click(s, target({ new: 'post' }), c);
    assert.equal(st.newJob, 'post');
    // 表单的草稿在渲染时放进 st（和后台一样，同一个 st 先画再点）。
    assert.match(PAGE.train.render(s, st), /data-op="start-post"/);
    PAGE.train.click(s, target({ op: 'start-post' }), c);
    const j = E.mainPostJob(s);
    assert.ok(j && j.dir === 'auto' && j.until.days === 30, JSON.stringify(j));
    assert.equal(st.newJob, null);
    PAGE.train.click(s, target({ new: 'post' }), c);
    PAGE.train.click(s, target({ new: 'post' }), c);
    assert.equal(st.newJob, null, '再点一次收起');
    PAGE.train.click(s, target({ jobOp: 'prio', id: j.id, prio: 'high' }), c);
    assert.equal(j.prio, 'high');
    PAGE.train.change(s, target({ jobCap: j.id }, { value: '1' }), c);
    assert.match(c.errors.at(-1), /最多张数不能比最低卡少（\d+ 张）/);
    PAGE.train.change(s, target({ jobCap: j.id }, { value: '100' }), c);
    assert.equal(j.cap, 100);
    PAGE.train.change(s, target({ jobCap: j.id }, { value: '' }), c);
    assert.equal(j.cap, null);
    PAGE.train.click(s, target({ jobOp: 'pause', id: j.id, on: '1' }), c);
    assert.equal(j.paused, true);
    PAGE.train.click(s, target({ jobOp: 'pause', id: j.id, on: '0' }), c);
    assert.equal(j.paused, false);
    // ⋯ 菜单在原位展开：改方向、改结束条件。
    PAGE.train.click(s, target({ jobMenu: j.id }), c);
    assert.equal(st.jobMenu, j.id);
    assert.match(PAGE.train.render(s, st), new RegExp(`data-post-dir="${j.id}"`));
    PAGE.train.change(s, target({ postDir: j.id }, { value: 'code' }), c);
    PAGE.train.change(s, target({ postUntil: j.id }, { value: 'stall' }), c);
    assert.deepEqual([j.dir, j.until], ['code', 'stall']);
    PAGE.train.change(s, target({ postUntil: j.id }, { value: 'dim' }), c);
    assert.equal(j.until.dim, 'code');
    PAGE.train.change(s, target({ postTo: j.id }, { value: '90' }), c);
    assert.deepEqual(j.until, { dim: 'code', to: 90 });
    const cancel = target({ jobOp: 'cancel', id: j.id });
    PAGE.train.click(s, cancel, c);
    assert.ok(E.mainPostJob(s), '第一次只改按钮文字');
    assert.equal(cancel.textContent, '再点一次确认取消');
    PAGE.train.click(s, cancel, c);
    assert.equal(E.mainPostJob(s), null);
    assert.deepEqual(c.errors.slice(1), []);
  });

  it('检修、自动检修、专心研究、只用自有数据；链接跳去算力页；下一代计划保存；在练模型展开区点一个方向就改练它', () => {
    const s = game();
    const st = { ...freshSt(), page: 'train' };
    const c = ctxOf(st);
    PAGE.train.click(s, target({ postMain: 'math' }), c);
    assert.equal(E.mainPostJob(s).dir, 'math');
    PAGE.train.click(s, target({ jobOp: 'repair', on: '1' }), c);
    assert.equal(s.jobs.repair, true);
    PAGE.train.click(s, target({ jobOp: 'repair', on: '0' }), c);
    assert.equal(s.jobs.repair, false);
    PAGE.train.change(s, target({ autoRepair: '' }, { checked: false }), c);
    assert.equal(s.jobs.autoRepair, false);
    PAGE.train.click(s, target({ jobOp: 'focus', on: '1' }), c);
    assert.ok(Array.isArray(s.jobs.focusPause) && E.mainPostJob(s).paused);
    assert.match(trainOf(s), /恢复后训练/);
    assert.match(text(trainOf(s)), /暂停中（专心研究）/);
    PAGE.train.click(s, target({ jobOp: 'focus', on: '0' }), c);
    assert.equal(E.mainPostJob(s).paused, false);
    PAGE.train.change(s, target({ ownOnly: '' }, { checked: true }), c);
    assert.equal(s.jobs.ownOnly, true);
    PAGE.train.click(s, target({ planEdit: '1' }), c);
    assert.match(PAGE.train.render(s, st), /data-op="save-plan"/);
    PAGE.train.change(s, target({ plan: 'total' }, { value: '236' }), c);
    PAGE.train.click(s, target({ op: 'save-plan' }), c);
    assert.equal(s.jobs.plan.total, 236);
    PAGE.train.click(s, target({ goto: 'compute' }), c);
    assert.equal(st.page, 'compute');
    assert.deepEqual(c.errors, []);
  });

  it('开底座（带优先级和“最多 N 张”）、开试验；在练模型行点“送评”在原位展开送评表单，选标准档送评后收起；评测行“撤回”要点两次', () => {
    const s = game();
    const st = { ...freshSt(), page: 'train' };
    const c = ctxOf(st);
    PAGE.train.click(s, target({ new: 'pretrain' }), c);
    PAGE.train.render(s, st);
    PAGE.train.change(s, target({ opt: 'prio', kind: 'pretrain' }, { value: 'normal' }), c);
    PAGE.train.change(s, target({ opt: 'cap', kind: 'pretrain' }, { value: '500' }), c);
    PAGE.train.click(s, target({ op: 'start-project' }), c);
    const b = E.baseJob(s, 'main');
    assert.ok(b, c.errors.join(' | '));
    assert.deepEqual([b.prio, b.cap], ['normal', 500]);
    assert.equal(c.notes.at(-1), '立项成功，底座开始预训练');
    E.decide(s, 'job', { op: 'plan', plan: { total: 671, active: 37, arch: 'moe', tokens: 15 } });
    PAGE.train.click(s, target({ new: 'trial' }), c);
    PAGE.train.render(s, st);
    PAGE.train.change(s, target({ trial: 'size' }, { value: 'small' }), c);
    PAGE.train.click(s, target({ op: 'start-trial' }), c);
    assert.ok(s.jobs.list.some(j => j.kind === 'trial' && j.size === 'small'), c.errors.join(' | '));
    // 送评：攒够天数，点“送评”展开，选标准档。
    const w = E.workingModel(s);
    w.postDays = (w.relDays || 0) + 30;
    PAGE.train.click(s, target({ submit: w.id }), c);
    assert.equal(st.submit, w.id);
    const html = PAGE.train.render(s, st);
    assert.match(html, /<div class="submit-box" data-submit-box><div class="release-opt" data-line="main">/);
    assert.match(html, new RegExp(`name="rel-tier-main" value="${E.defaultTier(s)}" data-tier checked`));
    const box = { querySelector: sel => (sel === 'input[data-tier]:checked' ? { value: 'standard' } : null), querySelectorAll: () => [] };
    PAGE.train.click(s, target({ pick: 'flagship', model: w.id }, { box }), c);
    assert.equal(st.submit, null);
    assert.equal(s.evals.length, 1);
    assert.equal(s.evals[0].tier, 'standard');
    assert.match(c.notes.at(-1), new RegExp(`^已送评「[^」]+」，${STD} 天后评完自动发布$`));
    const undo = target({ cancelEval: s.evals[0].id });
    PAGE.train.click(s, undo, c);
    assert.equal(s.evals.length, 1);
    PAGE.train.click(s, undo, c);
    assert.equal(s.evals.length, 0);
    assert.deepEqual(c.errors, []);
  });

  it('新作业表单的“最多 N 张”比最低卡少（审查修复）：输入框最小值是最低卡、旁边写“最少 N 张”，按钮置灰写原因；硬点“开始”只报错，作业表不变', () => {
    const s = game();
    const st = { ...freshSt(), page: 'train' };
    const c = ctxOf(st);
    E.decide(s, 'job', { op: 'plan', plan: { total: 671, active: 37, arch: 'moe', tokens: 15 } });
    const before = JSON.stringify(s.jobs.list);
    const lineN = E.smallLineCount(s);
    const mins = {};
    for (const [k, op] of [['pretrain', 'start-project'], ['small', 'start-small'], ['distill', 'start-distill'], ['post', 'start-post'], ['trial', 'start-trial']]) {
      PAGE.train.click(s, target({ new: k }), c);
      assert.equal(st.newJob, k);
      // 先按不限画一遍：按钮可点，输入框最小值和“最少 N 张”是这项的最低卡。
      const ok = PAGE.train.render(s, st);
      const m = ok.match(new RegExp(`min="(\\d+)" step="1" value="" placeholder="不限" data-opt="cap" data-kind="${k}" /><small>最少 (\\d+) 张，不填就是不限</small>`));
      assert.ok(m, `${k}：${text(ok).slice(0, 300)}`);
      assert.equal(m[1], m[2]);
      const min = mins[k] = Number(m[1]);
      assert.ok(min > 1, `${k} 的最低卡 ${min}`);
      assert.match(ok, new RegExp(`data-op="${op}" >`), `${k} 不限时按钮应该能点`);
      // 填 1 张：按钮置灰，写原因。
      PAGE.train.change(s, target({ opt: 'cap', kind: k }, { value: '1' }), c);
      const bad = PAGE.train.render(s, st);
      assert.match(bad, new RegExp(`data-op="${op}" disabled>`), k);
      assert.match(text(bad), new RegExp(`最多张数不能比最低卡少（${min} 张）`), k);
      // 硬点两次“开始”：两次都报同一个原因，作业表、小模型线、表单都不变。
      const n = c.errors.length;
      PAGE.train.click(s, target({ op }), c);
      PAGE.train.click(s, target({ op }), c);
      assert.deepEqual(c.errors.slice(n), [`最多张数不能比最低卡少（${min} 张）`, `最多张数不能比最低卡少（${min} 张）`], k);
      assert.equal(JSON.stringify(s.jobs.list), before, `${k}：作业表变了`);
      assert.equal(E.smallLineCount(s), lineN, k);
      assert.equal(st.newJob, k, `${k}：表单不该收起`);
    }
    // 设成正好等于最低卡就能开，优先级和上限在开的那一刻一起定下（不再开完再改）。
    st.newJob = 'distill';
    PAGE.train.change(s, target({ opt: 'cap', kind: 'distill' }, { value: String(mins.distill) }), c);
    PAGE.train.change(s, target({ opt: 'prio', kind: 'distill' }, { value: 'normal' }), c);
    PAGE.train.render(s, st);
    PAGE.train.click(s, target({ op: 'start-distill' }), c);
    const d = s.jobs.list.find(j => j.kind === 'distill');
    assert.ok(d, c.errors.join(' | '));
    assert.deepEqual([d.prio, d.cap], ['normal', mins.distill]);
    assert.equal(s.jobs.list.length, JSON.parse(before).length + 1);
    assert.equal(st.newJob, null);
  });

  it('检修和暂停的文案（审查修复）：关掉自动检修以后手动检修，训练页和首页不写“→ 75”，写要手动结束；主线底座暂停时主界面台词写“暂停中”，不写排队', () => {
    const s = game();
    const st = { ...freshSt(), page: 'train' };
    const c = ctxOf(st);
    PAGE.train.change(s, target({ autoRepair: '' }, { checked: false }), c);
    PAGE.train.click(s, target({ jobOp: 'repair', on: '1' }), c);
    s.health = 50;
    for (const t of [text(trainOf(s)), text(nowCardOf(s))]) {
      assert.match(t, /检修中 · 健康 50（自动检修关着，要手动点“结束检修”）/);
      assert.doesNotMatch(t, /→ 75/);
    }
    // 自动检修开着：照旧写“→ 75，约 N 天”。
    PAGE.train.change(s, target({ autoRepair: '' }, { checked: true }), c);
    assert.match(text(trainOf(s)), /检修中 · 健康 50 → 75，约 16 天/);
    PAGE.train.click(s, target({ jobOp: 'repair', on: '0' }), c);
    PAGE.train.click(s, target({ new: 'pretrain' }), c);
    PAGE.train.render(s, st);
    PAGE.train.click(s, target({ op: 'start-project' }), c);
    const b = E.baseJob(s, 'main');
    assert.ok(b, c.errors.join(' | '));
    const lines = () => { const out = new Set(); for (let i = 0; i < 24; i++) { uiState.lineIdx = i; out.add(homeLine(s)); } uiState.lineIdx = 0; return [...out]; };
    assert.ok(lines().some(l => /^底座预训练进度 \d+%，大概还要 \d+ 天。$/.test(l)), lines().join(' | '));
    PAGE.train.click(s, target({ jobOp: 'pause', id: b.id, on: '1' }), c);
    const paused = lines();
    assert.ok(paused.some(l => /^底座预训练暂停中，进度 \d+% 保留着。想接着练，就去「训练」里点“继续”。$/.test(l)), paused.join(' | '));
    assert.ok(!paused.some(l => /排队等算力/.test(l)), paused.join(' | '));
    assert.deepEqual(c.errors, []);
  });

  it('首页“进行中”：点一行在原位展开“暂停 / 继续、优先 / 正常、去训练页”，再点收起；评测行只有“去训练页”', async () => {
    const { toggleNowRow } = await ui('home.js');
    const s = game();
    const j = E.startJob(s, { kind: 'post', target: 'main', dir: 'auto', until: 'none' });
    let card = nowCardOf(s);
    assert.match(card, new RegExp(`<button class="now-row now-job" data-act="now-row" data-id="${j.id}" aria-expanded="false">`));
    assert.doesNotMatch(card, /class="now-ops"/);
    toggleNowRow(j.id);
    card = nowCardOf(s);
    assert.match(card, new RegExp(`aria-expanded="true">.*?</button><div class="now-ops"><button class="btn btn--sm" data-act="job" data-op="pause" data-id="${j.id}" data-on="1">暂停</button>`, 's'));
    assert.match(card, new RegExp(`data-act="job" data-op="prio" data-id="${j.id}" data-prio="high">改成优先`));
    assert.match(card, /<div class="now-ops">[\s\S]*data-act="open-train">去训练页<\/button><\/div>/);
    toggleNowRow(j.id);
    assert.doesNotMatch(nowCardOf(s), /class="now-ops"/);
    // app.js 接这两个动作：now-row 切换展开，job 转成 decide('job')；“训练 ›”打开后台训练页。
    const app = fs.readFileSync(new URL('app.js', UI_DIR), 'utf8');
    assert.match(app, /case 'now-row': toggleNowRow\(id\)/);
    assert.match(app, /case 'job': doDecision\('job', \{ op: el\.dataset\.op, id/);
    assert.match(app, /case 'open-train': openOffice\('train'\)/);
  });
});

describe('训练界面（P2.4b）：送评面板（规格 T10.3）', () => {
  it('四档评测各带一句后果，默认档按公司（frontier、bigtech 标准，其余快速，备案没过的标准）；跳过写口碑 −3、品牌 −3%、最多按 62 算', () => {
    for (const [id, sc, def, filing] of [['gpt', 'y2025', 'standard'], ['mistral', 'y2025', 'quick'], ['kimi', 'y2025', 'quick'], ['kimi', 'y2025', 'standard', 'none']]) {
      const s = stripHome(E.createGame(id, sc, 7));
      resolveAll(s);
      if (filing) s.service.filing = filing;
      const w = E.workingModel(s);
      w.postDays = (w.relDays || 0) + 30;
      assert.equal(E.defaultTier(s), def, `${id} ${sc}`);
      const html = PANELS.release.render(s);
      assert.match(html, new RegExp(`value="${def}" data-tier checked`), `${id} ${sc}`);
      const t = text(html);
      assert.match(t, /从严 42 天 42 天后自动发布。之后出事、打官司按安全 \+\d+ 算/);
      assert.match(t, /快速 7 天 7 天后自动发布。之后出事、打官司按安全原值算，最多算到 80/);
      assert.match(t, /跳过 今天就发布。口碑 −3、品牌 −3%，出事和官司按安全最多 62 算/);
      assert.match(t, /评测期间 第 \d 代底座 照常后训练。发布那天按当天的对手评标签和市场期待；路线变了，顶替旗舰的按那天的路线开闭。/);
      assert.match(t, /送评：第 \d 代底座 → 候选「[^」]+」（按今天的能力冻结）/);
      assert.equal(/可以拿去备案|不能拿它备案/.test(t), s.company.country === 'CN', `${id}：备案只对国内的语言模型说`);
    }
  });
  it('小模型：多一个“发哪一个”下拉（有两个以上时），写“送评以后这个小模型就冻结了”，评测天数减半；不写“两次送评隔两周”', () => {
    const s = E.createGame('deepseek', 'y2025', 7);
    resolveAll(s);
    for (let i = 0; i < 2; i++) { const j = E.startJob(s, { kind: 'distill', cfg: distillCfg(s) }); fillUp(j); E.baseTick(s, { notes: [] }); s.queue = []; }
    assert.equal(E.smallModels(s).length, 2);
    const html = PANELS.release.render(s);
    const small = html.slice(html.indexOf('data-line="small"'));
    assert.match(small, /<select id="rel-small-pick">(<option [^>]+>[^<]+<\/option>){2}<\/select>/);
    assert.match(text(small), /送评以后这个小模型就冻结了，评测期间不能后训练/);
    assert.match(text(small), /快速 4 天/);
    assert.doesNotMatch(text(small), /两次送评|隔两周|再练满/);
  });
  it('旗舰还不能送评时写原因（再后训练 N 天，同一条线自上次送评以来要再练满 14 天），按钮置灰、不给评测档', () => {
    const s = E.createGame('deepseek', 'y2025', 7);
    resolveAll(s);
    const html = PANELS.release.render(s);
    assert.match(text(html), /再后训练 14 天才能送评（同一条线自上次送评以来要再练满 14 天）/);
    assert.match(html, /data-pick="flagship" data-model="[^"]+" disabled>送评旗舰/);
    assert.doesNotMatch(html.slice(html.indexOf('data-line="main"')), /data-tier/);
  });
});

describe('训练界面（P2.4b）：评完自动发布，时钟循环播发布结果卡', () => {
  it('评完那天 tickDay 的 out.releases 交给 playReleases：一项项播发布评测（同点“发布”），播完提示上线安排；app.js 的时钟循环拿到它就停下来播', async () => {
    // 弹层和提示的最小替身：发布评测的“跳过”“继续”一挂上就点掉。
    const layers = [], toasts = [];
    const fakeLi = () => ({ classList: { add() {}, remove() {} }, querySelector: () => ({ style: {}, textContent: '', innerHTML: '' }) });
    const root = { _html: '', get firstElementChild() { return this._html ? layerEl : null; } };
    const layerEl = {
      querySelectorAll: () => Array.from({ length: 12 }, fakeLi),
      querySelector: sel => (sel === '[data-skip]' ? { addEventListener: (t, fn) => fn() } : { innerHTML: '' }),
      addEventListener: (t, fn) => fn({ target: { closest: () => ({ disabled: false }) } }), removeEventListener() {},
    };
    Object.defineProperty(root, 'innerHTML', { get() { return this._html; }, set(v) { this._html = v; if (v) layers.push(v); } });
    const doc = globalThis.document;
    const was = { getElementById: doc.getElementById, createElement: doc.createElement };
    doc.getElementById = id => (id === 'overlay-root' ? root : id === 'toast-root' ? { append: el => toasts.push(el.textContent) } : null);
    doc.createElement = () => ({ textContent: '', classList: { add() {} }, remove() {} });
    try {
      const { playReleases } = await ui('flow.js');
      const s = E.createGame('deepseek', 'y2025', 7);
      resolveAll(s);
      const w = E.workingModel(s);
      w.postDays = (w.relDays || 0) + 30;
      s.deploy = [];
      const ev = E.decide(s, 'submit', { tier: 'quick' }).eval;
      let out = null;
      for (let i = 0; i < 12 && !out?.releases; i++) { resolveAll(s); out = E.tickDay(s); }
      assert.equal(out.releases.length, 1);
      assert.equal(out.releases[0].model.name, ev.plan.name);
      setState(s);
      await playReleases(out.releases);
      assert.equal(layers.length, 1);
      assert.match(layers[0], new RegExp(`<span class="ev-tag">发布评测</span><h3>${ev.plan.name}</h3>`));
      assert.equal(root.innerHTML, '', '播完关掉弹层');
      assert.match(toasts.at(-1), new RegExp(`^${ev.plan.name} (开始灰度上线|作为副线发布)`));
    } finally {
      doc.getElementById = was.getElementById;
      doc.createElement = was.createElement;
    }
    const app = fs.readFileSync(new URL('app.js', UI_DIR), 'utf8');
    const step = app.slice(app.indexOf('async function stepDay()'), app.indexOf('function startGame('));
    assert.match(step, /if \(out\?\.releases\?\.length\) \{[\s\S]*clock\.busy = true;[\s\S]*await playReleases\(out\.releases\);[\s\S]*clock\.busy = false;/);
    assert.ok(step.indexOf('playReleases') < step.indexOf('runQueue'), '先播发布结果，再放事件');
  });
});

describe('训练界面（P2.4b）：其他页（规格 T4.1、T10.4）和手机版面', () => {
  it('服务页没有推理滑杆，换成“推理份额去「算力」页调 ›”；研究页写重活口径；模型页没有立项和蒸馏表单，有“全部模型”', () => {
    const s = E.createGame('deepseek', 'y2025', 7);
    resolveAll(s);
    const sv = PAGE.service.render(s, freshSt());
    assert.doesNotMatch(sv, /data-infer/);
    assert.match(sv, /data-goto="compute">推理份额去「算力」页调 ›/);
    assert.match(text(PAGE.tech.render(s, freshSt())), /团队有重活（后训练、检修）时研究速度 ×0\.4，没有时 ×1\.7/);
    const mp = PAGE.model.render(s, freshSt());
    assert.doesNotMatch(mp, /data-proj=|data-dist=|start-project|start-distill/);
    assert.match(text(mp), /全部模型 .*模型 状态 发布 评测 综合/);
    // 开局继承来的版本没走过送评：表里评测一栏写“—”，不写“旧档”（第二轮审查修复）。
    assert.match(text(mp), /DeepSeek-V3 在线旗舰 2024 年 12 月 — /);
    assert.doesNotMatch(text(mp), /旧档/);
  });
  it('手机（< 860px）：作业行两行排（编号｜名字｜⋯，下面优先级｜张数｜状态），格子都能缩；没有悬浮按钮和底部弹层；表单输入不超过一行宽', async () => {
    const { cssAt, cssTokens } = await import('../helpers/css.mjs');
    const css = [...fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8').matchAll(/href="\.\/(src\/career\/css\/[\w-]+\.css)/g)].map(m => fs.readFileSync(new URL(`../../${m[1]}`, import.meta.url), 'utf8')).join('\n');
    const train = fs.readFileSync(new URL('../../src/career/css/train.css', import.meta.url), 'utf8');
    for (const w of [375, 390, 768]) {
      const g = cssAt(css, '.job-main', w);
      const areas = g['grid-template-areas'].match(/"[^"]+"/g);
      assert.ok(areas.length >= 2, `${w}px：作业行要两行以上`);
      const tracks = cssTokens(g['grid-template-columns']);
      const fixed = tracks.filter(x => /^\d+px$/.test(x)).reduce((a, x) => a + parseFloat(x), 0);
      assert.ok(fixed <= 70, `${w}px：定宽的列一共 ${fixed}px`);
      assert.ok(tracks.every(x => /^\d+px$|^auto$|^minmax\(0,/.test(x)), `${w}px：${tracks.join(' ')}`);
      assert.equal(cssAt(css, '.office-body', w)['grid-template-columns'], '1fr', `${w}px：后台整页一列往下滚`);
    }
    const desk = cssAt(css, '.job-main', 1440)['grid-template-areas'].match(/"[^"]+"/g);
    assert.equal(desk.length, 1, '桌面一行排开');
    for (const sel of ['.job-name', '.job-state']) assert.equal(cssAt(css, sel, 375)['min-width'], '0', sel);
    assert.equal(cssAt(css, '.newjob-tabs', 375)['flex-wrap'], 'wrap');
    assert.match(cssAt(css, '.job-cap input', 375)['max-width'], /100%/);
    // 下拉框的选项文字很长：表单格子和下拉框都允许缩到一列宽（不然格子按最长的选项撑开，页面横向溢出）。
    for (const sel of ['.newjob-form .form select', '.job-post select', '.train-plan .form select']) assert.deepEqual([cssAt(css, sel, 375).width, cssAt(css, sel, 375)['min-width']], ['100%', '0'], sel);
    for (const sel of ['.newjob-form .form label', '.job-post label']) assert.equal(cssAt(css, sel, 375)['min-width'], '0', sel);
    assert.equal(cssAt(css, '.job-cards', 375)['white-space'], 'normal');
    assert.doesNotMatch(train, /position:\s*(fixed|sticky)/, '训练界面不加悬浮按钮、不用底部弹层');
  });
});

describe('训练界面（P2.4b 第二轮审查修复）：工期口径、叫法、原位展开、送评面板换小模型', () => {
  const game = (id = 'deepseek', sc = 'y2025') => { const s = E.createGame(id, sc, 7); resolveAll(s); return s; };
  // st 是整份后台状态时原样传进去（表单的草稿要留在它上面），否则补成一份新的。
  const formOf = (s, st) => { const h = PAGE.train.render(s, 'page' in st ? st : { ...freshSt(), page: 'train', ...st }); const i = h.indexOf('newjob-form'); return h.slice(i, h.indexOf('train-models', i)); };
  const days = t => [...text(t).matchAll(/约 (\d+) 天/g)].map(m => Number(m[1]));
  // 用掉一条调参中档的成功结论（和 p3 复现同一个造法：直接把试验练满，当场定结果）。
  const withFinding = s => {
    E.decide(s, 'job', { op: 'plan', plan: { total: 671, active: 37, arch: 'moe', tokens: 15 } });
    for (let k = 0; k < 30 && !s.jobs.findings.length; k++) { const j = E.startJob(s, { kind: 'trial', type: 'tune', size: 'mid' }); j.done = j.cost; j.elapsed = j.minDays - 1; E.baseTick(s, { notes: [] }); }
    assert.ok(s.jobs.findings.length, '没造出试验结论');
    s.queue = [];
    return s;
  };

  it('蒸馏表单：工期只说一次，和“最多 N 张”、优先级、占卡同一个立项检查；按天向上取整，不再写“按现在的分卡”和“跑 N 周”', () => {
    for (const [id, sc] of [['deepseek', 'y2025'], ['kimi', 'y2025'], ['rwkv', 'y2025']]) {
      const s = game(id, sc);
      if (E.workingModel(s)?.stage === 'post') E.startJob(s, { kind: 'post', target: 'main', dir: 'auto', until: 'none' });
      for (const total of [7, 32]) {
        const cfg = { teacher: 'self', total, active: total, arch: 'dense', tokens: 1.5 };
        for (const o of [{ prio: 'high', cap: '' }, { prio: 'normal', cap: '' }, { prio: 'normal', cap: '100' }, { prio: 'high', cap: '300' }]) {
          const at = `${id} ${sc} ${total}B ${JSON.stringify(o)}`;
          const cap = o.cap ? Number(o.cap) : null;
          const c = E.jobCheck(s, { kind: 'distill', cfg, prio: o.prio, cap });
          const f = formOf(s, { newJob: 'distill', distill: { ...cfg }, opt: { distill: { ...o } } });
          assert.doesNotMatch(text(f), /按现在的分卡|\d+ 周/, at);
          if (!c.ok) continue;
          const d = days(f);
          assert.equal(d.length, 1, `${at}：${text(f)}`);
          const floor = c.eta <= c.job.pj.minDays + 1e-9;
          assert.equal(d[0], floor ? c.job.pj.minDays : Math.ceil(c.eta), at);
          assert.match(text(f), new RegExp(`预计耗时 约 ${d[0]} 天${floor ? '（整理数据、评测最少也要这么久）' : ' '}`), at);
          assert.match(text(f), new RegExp(`算力 约占 ${c.cards.got} 张卡（最低 ${c.cards.min}、想要 ${c.cards.want}）`), at);
          if (cap) assert.ok(c.cards.want === cap && c.cards.got <= cap, at);
        }
      }
    }
    // 第一轮复现：deepseek y2025 填“最多 100 张”、选“正常”，上面不再写“约 8 天、约占 1013 张卡”，只有一个按上限估的天数。
    const s = game();
    E.startJob(s, { kind: 'post', target: 'main', dir: 'auto', until: 'none' });
    const t = text(formOf(s, { newJob: 'distill', opt: { distill: { prio: 'normal', cap: '100' } } }));
    assert.match(t, /预计耗时 约 \d{2,} 天 /);
    assert.match(t, /算力 约占 100 张卡（最低 \d+、想要 100）/);
    assert.equal(days(t).length, 1, t);
  });

  it('底座表单：“试验省下 x%：约 A → B 天”的 A 按同一个优先级和“最多 N 张”、只是不扣省下的算力来估，A ≥ B，B 就是预计工期', () => {
    const s = withFinding(game());
    const plan = { total: 671, active: 37, arch: 'moe', tokens: 15 };
    let arrows = 0;
    for (const o of [{ prio: 'high', cap: '' }, { prio: 'normal', cap: '' }, { prio: 'high', cap: '1500' }, { prio: 'normal', cap: '800' }]) {
      const at = JSON.stringify(o);
      const t = text(projectForm.render(s, { ...freshSt(), proj: { ...plan }, opt: { pretrain: { ...o } } }));
      const eta = Number(t.match(/预计工期 约 (\d+) 天/)?.[1]);
      assert.ok(eta > 0, `${at}：${t}`);
      assert.match(t, new RegExp(`按现在的分卡约 ${eta} 天`), at);
      const m = t.match(/试验省下 (\d+)%：约 (\d+) → (\d+) 天/);
      if (m) {
        arrows++;
        assert.ok(Number(m[2]) > Number(m[3]), `${at}：${m[0]}`);
        assert.equal(Number(m[3]), eta, at);
        // A 和“同一份草稿、不扣省下的算力”时的工期一致。
        const c = E.jobCheck(s, { kind: 'pretrain', line: 'main', cfg: plan, prio: o.prio, cap: o.cap ? Number(o.cap) : null });
        assert.equal(Number(m[2]), Math.max(1, Math.round(projectForm.etaNoLab(s, c))), at);
      } else assert.match(t, /试验省下 \d+% 的算力：工期(已经卡在最快天数|差不到 1 天)/, `${at}：${t}`);
    }
    // 设了上限（1500、800 张）以后底座练得比最快天数慢，省下的算力就是省下的天数。
    assert.ok(arrows >= 2, `只有 ${arrows} 种设置写了箭头`);
  });

  it('评测中的小模型：训练页、模型页卡片、“全部模型”表都叫送评时定下的名字；表里不再写“在练的小模型”', () => {
    const s = trainStates('deepseek', 'y2025').小模型评测中;
    const m = s.models.find(x => x.evalId);
    const name = s.evals.find(e => e.id === m.evalId).plan.name;
    assert.match(text(trainOf(s)), new RegExp(`${name}（小模型，已冻结）`));
    const mp = PAGE.model.render(s, freshSt());
    assert.match(mp, new RegExp(`<span class="ev-tag">评测中小模型</span><b>${name}</b><small class="stage-pill">已冻结</small>`));
    assert.match(mp, new RegExp(`<tr><td>${name}</td><td>评测中小模型</td>`));
    assert.doesNotMatch(mp, /在练的小模型|新的小模型/);
  });

  it('开局继承来的版本不写“旧档”；从没送评过的在练模型写“这一版练了 N 天”；上一代收尾的“送评”置灰时把原因写出来', () => {
    const s0 = game();
    const mp = PAGE.model.render(s0, freshSt());
    assert.doesNotMatch(mp, /旧档/);
    assert.match(text(mp), /发布 2024 年 12 月 · 开局前已发布/);
    const st = trainStates('deepseek', 'y2025');
    // 上一代收尾：在练的是刚练完的新底座，一次都没送评过。
    const s = st.上一代收尾;
    assert.equal(E.workingModel(s).releases || 0, 0);
    assert.match(text(trainOf(s)), /（主线）· 这一版练了 0 天/);
    assert.doesNotMatch(text(trainOf(s)), /送评以后又练了/);
    // 送评过的照旧写“送评以后又练了”。
    assert.match(text(trainOf(st.评测中)), /（主线）· 送评以后又练了 0 天/);
    // 上一代只练了 5 天：按钮置灰，下面单独一行写原因（手机上看不到 title）。
    const p = E.prevModel(s);
    p.postDays = (p.relDays || 0) + 5;
    const html = trainOf(s);
    assert.match(html, new RegExp(`data-submit="${p.id}" data-line="prev" disabled`));
    const row = text(html.slice(html.indexOf('上一代收尾</span>'), html.indexOf('小模型线</span>')));
    assert.match(row, /送评：再后训练 9 天才能送评。/);
  });

  it('没定下一代计划时，试验表单里直接展开计划表单（原位），存好以后同一个地方换成试验的选项', () => {
    const s = game();
    assert.equal(s.jobs.plan, null);
    const st = { ...freshSt(), page: 'train', newJob: 'trial' };
    const f = formOf(s, st);
    assert.match(f, /data-plan="total"/);
    assert.match(f, /data-op="save-plan"/);
    assert.doesNotMatch(f, /data-plan-edit/);
    const c = { st, draw() {}, guard(fn) { fn(); } };
    const tg = (dataset, value = '') => ({ dataset, value, closest: sel => { const k = sel.match(/^\[data-([\w-]+)\]$/)?.[1]?.replace(/-([a-z])/g, (x, y) => y.toUpperCase()); return k && k in dataset ? tg(dataset, value) : null; } });
    PAGE.train.change(s, tg({ plan: 'total' }, '236'), c);
    PAGE.train.click(s, tg({ op: 'save-plan' }), c);
    assert.equal(s.jobs.plan?.total, 236);
    assert.equal(st.newJob, 'trial', '试验表单不收起');
    const g = formOf(s, st);
    assert.match(g, /data-trial="type"/);
    assert.match(text(g), /成功率/);
  });

  it('送评面板：“发哪一个”换了小模型，只重画小模型那一块，标题、参数和推理成本跟着选中的走；主界面的选择面板把 change 转给它', () => {
    const s = game();
    for (const total of [7, 1]) { const j = E.startJob(s, { kind: 'distill', cfg: { teacher: 'self', total, active: total, arch: 'dense', tokens: 1.5 } }); fillUp(j); E.baseTick(s, { notes: [] }); s.queue = []; }
    const [a, b] = E.smallModels(s);
    assert.ok(a && b && a.total !== b.total);
    const html = PANELS.release.render(s);
    const nameOf = m => E.releaseNamePlan(s, m, { role: 'small' }).name;
    assert.match(html, new RegExp(`<b>小模型：${nameOf(a)}</b><small>${a.total}B`));
    const box = { outerHTML: '' };
    const t = { id: 'rel-small-pick', value: b.id, closest: sel => (sel === '.release-opt' ? box : null) };
    assert.equal(PANELS.release.change({}, t, s), true);
    assert.match(box.outerHTML, /^<div class="release-opt" data-line="small">/);
    assert.match(box.outerHTML, new RegExp(`<b>小模型：${nameOf(b)}</b><small>${b.total}B`));
    assert.match(box.outerHTML, new RegExp(`<option value="${b.id}" selected>`));
    assert.match(box.outerHTML, new RegExp(`data-pick="small" data-model="${b.id}"`));
    // 别的下拉、别的输入不管。
    assert.equal(PANELS.release.change({}, { id: 'rel-open', value: '', closest: () => box }, s), false);
    const flow = fs.readFileSync(new URL('../../src/career/ui/flow.js', import.meta.url), 'utf8');
    assert.match(flow, /if \(panel\.change\) root\.addEventListener\('change', ev => panel\.change\(root, ev\.target, getState\(\)\)\);/);
  });
});
