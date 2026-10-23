// 可选的浏览器烟测（npm run test:ui）：用无头 Chromium 真点界面，看 v0.9.3 合并收进来的几块在页面上能用。npm test 不依赖浏览器。
// Playwright 不随项目安装：本机能 import 到 playwright 才跑，没有就提示一句、以 0 退出。
// 先在另一个终端 npm start（或用 UI_BASE_URL 指到别的地址）。浏览器每次用全新的配置，不碰你自己浏览器里的存档。
// 环境变量：UI_BASE_URL（默认 http://127.0.0.1:8765）、UI_BROWSER_EXECUTABLE（指定 Chromium）、UI_QA_DIR（截图和报告放哪，默认系统临时目录）。
// 检查：桌面 1440 和手机 390 两种宽度下，开新局（2025 · DeepSeek）；服务页收入预估跟着价格变、不改上月报表（B5）；
// 算力页出租、推理、训练（按作业分色）、闲置四段卡加起来正好是总数（A2、T4.1）；榜单说明和对手页的家族最强（B2）；
// 训练页（T10.2）：主界面“训练 ›”打开、新作业表单和作业行的 ⋯ 都在原位展开、挂上后训练；
// 蒸馏在训练页立项、锁老师、读档不变、练完带老师来源（B3）；
// 存档重载不变、旧档（没有逐日账本、带改动包的超事件积压名单）能读（B8）；全程没有脚本异常、没有外网请求、没有横向溢出和裂图。
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch (e) {
  if (e?.code !== 'ERR_MODULE_NOT_FOUND') throw e;
  console.log('没找到 Playwright，跳过浏览器烟测（npm test 不受影响）；要跑就先在本机装好 playwright 和 Chromium。');
  process.exit(0);
}
const base = `${(process.env.UI_BASE_URL || 'http://127.0.0.1:8765').replace(/\/+$/, '')}/`;
try {
  const r = await fetch(base);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
} catch (e) {
  console.log(`连不上 ${base}（${e.message}）：先 npm start，或用 UI_BASE_URL 指到游戏地址。`);
  process.exit(1);
}
const output = process.env.UI_QA_DIR || join(tmpdir(), 'mrp-ui-smoke');
await mkdir(output, { recursive: true });

// 页面里拿到正在跑的那份 app.js 和引擎：入口不带查询串，按同一地址 import 拿到的是同一个模块。
const expose = page => page.evaluate(async () => {
  const at = p => new URL(p, document.baseURI).href;
  window.__qa = { app: await import(at('./src/career/ui/app.js')), E: await import(at('./src/career/engine.js')) };
});
const state = page => page.evaluate(() => JSON.stringify(window.__qa.app.getState()));
const shot = (page, name, width) => page.screenshot({ path: join(output, `${name}-${width}.png`), fullPage: true });

// 弹窗（剧情、事件、里程碑、跑分演出）一路点掉；后台和选择面板不算。
async function dismiss(page) {
  for (let n = 0; n < 60; n++) {
    const ov = page.locator('#overlay-root > .overlay:not(.overlay--office):not(.overlay--picker)');
    if (!await ov.count()) return;
    let hit = false;
    for (const sel of ['[data-done]', '[data-skip]', '[data-next]', '[data-choice]:not([disabled])']) {
      const b = ov.locator(sel);
      // 弹窗可能刚好换成下一个，点不到就下一轮再看。
      if (await b.count()) { await b.first().click({ timeout: 2000 }).catch(() => {}); hit = true; break; }
    }
    await page.waitForTimeout(hit ? 60 : 150);
  }
  throw new Error('弹窗点了 60 次还没处理完');
}
// 最快档让时间走，直到条件成立再暂停，并确认真的停住了（后面要存档、重载比对）。
// 弹窗没处理完时主界面的按钮不响应，所以每轮看一眼，没在走就再点一次。
async function advanceUntil(page, fn, limit = 400) {
  const running = page.locator('[data-act="speed-toggle"][aria-label="暂停"]');
  for (let i = 0; i < limit; i++) {
    await dismiss(page);
    if (await page.evaluate(fn)) {
      for (let k = 0; k < 20 && await running.count(); k++) {
        await running.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(100);
        await dismiss(page);
      }
      assert.equal(await running.count(), 0, '时间停不下来');
      return;
    }
    if (!await running.count()) await page.locator('[data-act="speed"][data-id="5"]').click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(150);
  }
  throw new Error('时间走了很久，还没到想要的状态');
}
async function layout(page) {
  await page.waitForFunction(() => [...document.images].filter(i => i.loading !== 'lazy').every(i => i.complete), null, { timeout: 5000 }).catch(() => {});
  const d = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    broken: [...document.images].filter(i => i.complete && !i.naturalWidth && i.getAttribute('src')).map(i => i.getAttribute('src')) }));
  assert.ok(d.scrollWidth <= d.width + 1, `横向溢出：${d.scrollWidth}/${d.width}`);
  assert.deepEqual(d.broken, [], `有图没加载出来：${d.broken.join('，')}`);
  return d;
}
async function office(page, id) {
  // 事件还在处理时主界面的按钮不响应，打不开就先把弹窗点掉再试。
  for (let i = 0; i < 10 && !await page.locator('.overlay--office').count(); i++) {
    await dismiss(page);
    await page.locator('[data-act="office"]').click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(100);
  }
  await page.locator(`.office-nav [data-page="${id}"]`).click();
  return page.locator('.office-body');
}
const closeOffice = page => page.locator('.office-close').click();
// 滑杆直接写值再发 change，和拖动后松手一样走后台的处理。
const setRange = (page, sel, v) => page.locator(sel).evaluate((el, x) => { el.value = String(x); el.dispatchEvent(new Event('change', { bubbles: true })); }, v);

async function servicePreview(page, width) {
  const body = await office(page, 'service');
  const card = () => body.locator('.card').filter({ hasText: '当前配置收入预估' });
  await card().waitFor();
  const last = () => page.evaluate(() => JSON.stringify(window.__qa.app.getState().service.last));
  const before = await last();
  assert.equal(await card().locator('tbody tr').count(), 3, '三档价格对比少了行');
  const tier = body.locator('select[data-tier="api"][data-key="tier"]');
  const orig = await tier.inputValue();
  const kpi0 = await card().locator('.mini-kpis').innerText();
  await tier.selectOption(orig === 'premium' ? 'budget' : 'premium');
  const kpi1 = await card().locator('.mini-kpis').innerText();
  if (await page.evaluate(() => window.__qa.app.getState().products.api?.on)) assert.notEqual(kpi1, kpi0, '改了 API 价格，收入预估没跟着变');
  assert.equal(await last(), before, '收入预估改写了上月报表');
  await layout(page);
  await shot(page, 'service', width);
  await tier.selectOption(orig);
  return { check: '服务页收入预估', width, kpi0, kpi1 };
}
async function computeSplit(page, width) {
  await office(page, 'compute');
  const s0 = await page.evaluate(() => { const s = window.__qa.app.getState(); return { infer: Math.round(s.inferShare * 100), lease: window.__qa.E.leaseGpus(s) }; });
  await setRange(page, '[data-lease]', Number(await page.locator('[data-lease]').getAttribute('max')));
  await setRange(page, '[data-infer]', 90);
  const v = await page.evaluate(() => {
    const s = window.__qa.app.getState();
    return { a: window.__qa.E.gpuAllocation(s), slider: Number(document.querySelector('[data-lease]').value),
      bars: [...document.querySelectorAll('.alloc i')].map(i => Number(i.style.flexGrow)), legend: document.querySelector('.alloc-legend')?.innerText || '' };
  });
  const { a } = v;
  assert.ok(a.leaseGpus > 0 && a.leaseGpus === v.slider, `出租滑杆 ${v.slider} 张，账上 ${a.leaseGpus} 张`);
  assert.ok(Math.abs(a.inferGpus - (a.total - a.leaseGpus) * 0.9) < 1e-6, '推理份额应按出租后剩下的自用卡算');
  assert.ok(Math.abs(a.leaseGpus + a.inferGpus + a.trainGpus - a.total) < 1e-6, '出租、推理、训练加起来不等于总卡数');
  assert.ok(Math.abs(v.bars.reduce((x, y) => x + y, 0) - a.total) < 1, '分配横条和总卡数对不上');
  assert.match(v.legend, /推理.*出租|出租.*推理/s);
  await layout(page);
  await shot(page, 'compute', width);
  await setRange(page, '[data-lease]', s0.lease);
  await setRange(page, '[data-infer]', s0.infer);
  return { check: '算力分配', width, alloc: a };
}
async function boards(page, width) {
  const body = await office(page, 'boards');
  const t = await body.innerText();
  assert.match(t, /单项第一不等于综合最强/);
  assert.doesNotMatch(t, /SOTA|量程下限/, '榜单说明里不该再写 SOTA、量程下限');
  await page.locator('.office-nav [data-page="rivals"]').click();
  const r = await body.innerText();
  // 2025 年初 Llama 家族：综合最强的是 3.1 405B，最新发布的是 3.3 70B（决定第 1 项）。
  assert.match(r, /Llama 3\.1 405B/);
  assert.match(r, /最新发布的是 Llama 3\.3 70B/);
  await layout(page);
  await shot(page, 'rivals', width);
  return { check: '榜单与对手页', width };
}
// 训练页（规格 T10.2）：主界面“进行中”卡的“训练 ›”打开它；新作业表单在按钮下方原位展开（不再弹一层）；挂一项后训练，作业行的 ⋯ 原位展开操作。
async function trainPage(page, width) {
  await dismiss(page);
  await page.locator('.now-card [data-act="open-train"]').first().click();
  const body = page.locator('.office-body');
  await body.locator('h2', { hasText: '训练' }).waitFor();
  const t = await body.innerText();
  assert.match(t, /作业位 \d\/\d（试验不占）/);
  assert.match(t, /卡怎么分/);
  await body.locator('[data-new="post"]').click();
  await body.locator('.newjob-form [data-op="start-post"]').waitFor();
  assert.equal(await page.locator('#overlay-root > .overlay').count(), 1, '新作业表单应该在原位展开，不弹新的一层');
  await layout(page);
  await shot(page, 'train-new', width);
  await body.locator('[data-op="start-post"]').click();
  assert.ok(await page.evaluate(() => !!window.__qa.E.mainPostJob(window.__qa.app.getState())), '没挂上后训练');
  const more = body.locator('.job-row [data-job-menu]').first();
  await more.click();
  await body.locator('.job-menu').first().waitFor();
  await layout(page);
  await shot(page, 'train', width);
  await closeOffice(page);
  return { check: '训练页', width };
}
async function distill(page, width) {
  const body = await office(page, 'train');
  if (!await body.locator('[data-dist="teacher"]').count()) await body.locator('[data-new="distill"]').click();
  const form = body.locator('.card').filter({ has: page.locator('[data-dist="teacher"]') });
  await form.waitFor();
  const t = await form.innerText();
  assert.match(t, /老师/);
  assert.match(t, /预计耗时/);
  assert.match(t, /约占 .+ 张卡|分不到训练卡/);
  assert.doesNotMatch(t, /H100·月/, '蒸馏表单不该再写 H100·月');
  // 工期只说一次（G4-12；P2.4b 第二轮审查修复：预计耗时、占卡和下面几行同一个立项检查，下面不再重复“按现在的分卡”）。
  assert.equal((t.match(/约 \d+ 天/g) || []).length, 1, `蒸馏表单的工期说了不止一次：${t}`);
  assert.doesNotMatch(t, /按现在的分卡|跑 \d+ 周/);
  const btn = form.locator('[data-op="start-distill"]');
  assert.equal(await btn.isDisabled(), false, `开始蒸馏按钮是灰的：${await form.locator('.bad').allInnerTexts()}`);
  await layout(page);
  await shot(page, 'distill-form', width);
  await btn.click();
  const started = await page.evaluate(() => { const p = window.__qa.E.baseJob(window.__qa.app.getState(), 'small').pj; return { type: p.type, teacher: p.preview?.teacher?.name, minDays: p.minDays }; });
  assert.equal(started.type, 'distill');
  assert.ok(started.teacher, '立项时没有冻结老师快照');
  assert.equal(started.minDays, 7);
  await closeOffice(page);
  await advanceUntil(page, () => (window.__qa.E.baseJob(window.__qa.app.getState(), 'small')?.pj?.elapsedDays || 0) >= 3);
  await page.evaluate(() => window.__qa.app.save());
  const pj = await page.evaluate(() => JSON.stringify(window.__qa.E.baseJob(window.__qa.app.getState(), 'small')?.pj));
  await page.reload({ waitUntil: 'networkidle' });
  await dismiss(page);
  await expose(page);
  assert.equal(await page.evaluate(() => JSON.stringify(window.__qa.E.baseJob(window.__qa.app.getState(), 'small')?.pj)), pj, '读档后蒸馏作业变了');
  assert.match(await (await office(page, 'train')).innerText(), new RegExp(`蒸馏 · .*（老师 ${started.teacher.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}）`));
  await closeOffice(page);
  await advanceUntil(page, () => !!window.__qa.E.smallWorking(window.__qa.app.getState()));
  const done = await page.evaluate(() => { const m = window.__qa.E.smallWorking(window.__qa.app.getState()); return { name: m.name, teacher: m.distillation?.teacher?.name }; });
  assert.equal(done.teacher, started.teacher, '练出来的小模型没带上立项时的老师');
  return { check: '蒸馏立项与读档', width, started, done };
}
async function saveAndLegacy(page, width) {
  await page.evaluate(() => window.__qa.app.save());
  const saved = await state(page);
  await page.reload({ waitUntil: 'networkidle' });
  await dismiss(page);
  await expose(page);
  assert.equal(await state(page), saved, '存档重载后不一样');
  // 旧档：没有逐日算力账本、带着改动包的超事件积压名单。开页前写进去，免得被页面隐藏时的自动保存盖掉。
  const legacy = JSON.parse(saved);
  delete legacy.computeLedger;
  legacy.flags.superEarned = { super_sota: { day: legacy.day } };
  await page.addInitScript(v => localStorage.setItem('mrp.sim.v2', v), JSON.stringify(legacy));
  await page.reload({ waitUntil: 'networkidle' });
  await dismiss(page);
  await expose(page);
  const got = await page.evaluate(() => { const s = window.__qa.app.getState(); return { day: s.day, superEarned: s.flags.superEarned ?? null }; });
  assert.deepEqual(got, { day: legacy.day, superEarned: null }, '旧档没读进来，或积压名单没丢掉');
  await advanceUntil(page, () => !!window.__qa.app.getState().computeLedger, 40);
  await layout(page);
  await shot(page, 'legacy', width);
  return { check: '存档重载与旧档', width };
}

// 装了 playwright 包却没下载浏览器（没跑过 npx playwright install）、或 UI_BROWSER_EXECUTABLE 指错了：和缺 Playwright 一样提示一句、以 0 退出。
// 浏览器找到了却启动失败，是真的出错，以 1 退出。
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.UI_BROWSER_EXECUTABLE || undefined });
} catch (e) {
  const msg = String(e?.message || e);
  if (/executable doesn't exist|playwright install|ENOENT/i.test(msg)) {
    console.log('找不到 Chromium，跳过浏览器烟测（npm test 不受影响）：先运行 npx playwright install chromium 装好浏览器，或用 UI_BROWSER_EXECUTABLE 指定 Chromium 的路径。');
    process.exit(0);
  }
  console.log(`Chromium 启动失败：${msg.split('\n')[0]}`);
  process.exit(1);
}
const reports = [];
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', q => { if (!q.url().startsWith(base) && !q.url().startsWith('data:')) external.push(q.url()); });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('[data-act="new"]').click();
    await page.locator('[data-act="scenario"][data-id="y2025"]').click();
    await page.locator('[data-act="pick"][data-id="deepseek"]').click();
    await page.locator('[data-act="start"][data-id="deepseek"]').click();
    await dismiss(page);
    await expose(page);
    await layout(page);
    await shot(page, 'home', viewport.width);
    reports.push(await servicePreview(page, viewport.width));
    reports.push(await computeSplit(page, viewport.width));
    reports.push(await boards(page, viewport.width));
    await closeOffice(page);
    reports.push(await trainPage(page, viewport.width));
    reports.push(await distill(page, viewport.width));
    reports.push(await saveAndLegacy(page, viewport.width));
    assert.deepEqual(errors, [], `页面脚本出错：${errors.join(' | ')}`);
    assert.deepEqual(external, [], `请求了外网资源：${external.join(' ')}`);
    await context.close();
  }
  await writeFile(join(output, 'report.json'), JSON.stringify(reports, null, 2));
  console.log(`浏览器烟测通过：${reports.length} 项检查（1440 和 390 两种宽度），截图和报告在 ${output}`);
} finally {
  await browser.close();
}
