// v0.9.3 合并 M2：算力分配与逐日账单（审查 A2）、预训练记账（审查 B4 的“修正确”部分）、规格 F6 的研发经验和重复语料公式，
// 以及两处先修（没算力时工期显示“等待算力”、后训练暂停只在停下和恢复那天提示）。
// 前两组断言迁自外部 v0.9.2 改动包的 test_compute_accounting.mjs、test_training_accounting.mjs（去掉了生成任务和 capTechs），
// 按我们的引擎和 F6 的公式改写；F6 两张算例表逐格核对。
// 审查遗留修复补了：“进行中”卡等待算力时的排版和颜色、顾问挑 token 档读 MAX_EPOCHS。
import { describe, it } from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { loadSave, baseJob } from '../helpers/career_util.mjs';
import { COMPANIES, SCENARIOS, GPUS, TECH_BY_ID } from '../../src/career/data/core.js';
import { monthlyCosts } from '../../src/career/sim/economy.js';
import { daysInMonth, inDays, daysBetween } from '../../src/career/sim/clock.js';
import { llmBase, knowledgeCap, postPreview } from '../../src/career/sim/model.js';
import { resolveAll, advance } from '../helpers/career_bot.mjs';
import { cssAt, cssTokens } from '../helpers/css.mjs';
import * as L from '../helpers/legacy_jobs.mjs';

const close = (a, b, label = '') => assert.ok(Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(b)), `${label}: ${a} != ${b}`);
const near = (a, b, label = '') => assert.ok(Math.abs(a - b) < 1e-9, `${label}: ${a} vs ${b}`);
const clone = v => JSON.parse(JSON.stringify(v));
const readSrc = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
function fresh(company = 'gpt', scenario = 'y2025', seed = 71) {
  const s = E.createGame(company, scenario, seed);
  resolveAll(s);
  return s;
}
// 一天天推进到月结，返回月报。
function closeMonth(s) {
  const month = s.date;
  let report;
  for (let i = 0; i < 40 && s.date === month && s.status === 'playing'; i++) {
    resolveAll(s);
    const out = E.tickDay(s);
    if (out?.report) report = out.report;
  }
  assert.ok(report, '实际推进到月结');
  return report;
}
const productsOff = s => { for (const id of Object.keys(s.products)) if (id !== 'gpu_lease') E.setProduct(s, id, { on: false }); };
const sellAll = s => {
  for (const [id, n] of Object.entries(s.gpus.owned)) if (n > 0) E.releaseGpu(s, id, n, false);
  for (const [id, n] of Object.entries(s.gpus.rented)) if (n > 0) E.releaseGpu(s, id, n, true);
};

describe('物理算力与逐日账单', () => {
  it('全公司、全剧本：出租、推理、训练三份加起来正好是手里的卡', () => {
    for (const c of COMPANIES) for (const scenario of SCENARIOS) {
      const s = fresh(c.id, scenario.id), total = E.gpuCount(s);
      for (const fraction of [0, 0.25, 0.5, 1]) for (const infer of [0.05, 0.5, 0.9]) {
        E.setProduct(s, 'gpu_lease', { gpus: Math.floor(total * fraction) });
        E.setInferShare(s, infer);
        const a = E.gpuAllocation(s);
        const parts = [a.leaseGpus, a.inferGpus, a.trainGpus];
        assert.ok(parts.every(n => Number.isFinite(n) && n >= 0), `${c.id}/${scenario.id}`);
        close(parts.reduce((x, y) => x + y, 0), total, `${c.id}/${scenario.id}`);
        assert.equal(a.generationGpus, undefined, '生成任务这次不收，没有“数据生成”这一桶');
        // 推理滑杆分的是剩下的自用卡。
        close(a.inferGpus, (total - a.leaseGpus) * infer, `${c.id}/${scenario.id} 推理`);
      }
    }
  });

  it('出租一半卡，训练和推理同比少一半；全部出租就没有保底算力，服务全部 429，只收租金', () => {
    const s = fresh(), total = E.gpuCount(s);
    const train = E.trainFlops(s), infer = E.inferGpuEq(s);
    E.setProduct(s, 'gpu_lease', { gpus: total / 2 });
    close(E.trainFlops(s), train / 2);
    close(E.inferGpuEq(s), infer / 2);
    E.setProduct(s, 'gpu_lease', { gpus: total });
    assert.equal(E.trainFlops(s), 0);
    assert.equal(E.inferGpuEq(s), 0);
    const service = E.simulateService(s);
    assert.equal(service.r429, 1);
    assert.equal(service.revenue.api || 0, 0, '没有卡，API 请求一个也接不了');
    assert.ok(service.revenue.gpu_lease > 0);
  });

  it('推理份额 0.9、再出租 80%：出租的卡不会同时算进推理（审查里 BASE 算出 19312，正确值约 3862）', () => {
    const s = fresh('qwen', 'y2025');
    const total = E.gpuCount(s);
    E.setInferShare(s, 0.9);
    const full = E.inferGpuEq(s);
    E.setProduct(s, 'gpu_lease', { gpus: Math.floor(total * 0.8) });
    close(E.inferGpuEq(s), full * (total - Math.floor(total * 0.8)) / total, '推理只用剩下的自用卡');
  });

  it('卖光卡以后，旧的出租配置不再分卡：出租、训练、推理都是 0', () => {
    const s = fresh();
    E.setProduct(s, 'gpu_lease', { gpus: E.gpuCount(s) });
    sellAll(s);
    assert.equal(E.gpuCount(s), 0);
    const a = E.gpuAllocation(s);
    assert.deepEqual([a.leaseGpus, a.inferGpus, a.trainGpus], [0, 0, 0]);
    assert.equal(E.simulateService(s).revenue.gpu_lease || 0, 0);
    assert.equal(E.trainFlops(s), 0);
    assert.equal(E.inferGpuEq(s), 0);
  });

  it('月中租到卡，用五天后退租：月底照付五天租金；存读档不丢账', () => {
    const s = fresh();
    productsOff(s);
    E.buyGpu(s, 'H100', 256, true);
    for (let i = 0; i < 20 && !s.gpus.rented.H100; i++) advance(s, 1);
    assert.equal(s.gpus.rented.H100, 256);
    const rate = monthlyCosts(s).rented, monthDays = daysInMonth(s.date);
    advance(s, 5);
    E.releaseGpu(s, 'H100', 256, true);
    assert.equal(monthlyCosts(s).rented, 0, '即时报价是 0，已经发生的账单不是 0');
    const restored = loadSave(clone(s));
    const report = closeMonth(s), restoredReport = closeMonth(restored);
    close(report.costs.rented, rate * 5 / monthDays);
    assert.ok(report.costs.rented > 0);
    assert.deepEqual(restoredReport, report);
    assert.deepEqual(restored, s);
  });

  it('月底最后一天才出租只收一天租金；月底把推理拉满，改不了整月的平均推理能力', () => {
    const s = fresh();
    productsOff(s);
    E.setInferShare(s, 0.05);
    const days = daysInMonth(s.date);
    for (let i = 0; i < days - 1; i++) advance(s, 1);
    const sumBefore = s.computeLedger.inferCapSum;
    E.setInferShare(s, 0.9);
    E.setProduct(s, 'gpu_lease', { gpus: E.gpuCount(s) / 2 });
    const quote = E.simulateService(s), cap = E.inferGpuEq(s);
    const report = closeMonth(s);
    close(report.service.revenue.gpu_lease, quote.revenue.gpu_lease / days);
    close(report.service.capGpu, (sumBefore + cap) / days);
    assert.ok(report.service.capGpu < cap);
  });

  it('月底最后一天退租不免单：自有卡运维、云上租金都按持有的天数算', () => {
    const s = fresh();
    productsOff(s);
    E.buyGpu(s, 'H100', 256, true);
    for (let i = 0; i < 40 && !s.gpus.rented.H100; i++) advance(s, 1);
    // 走到下个月 1 号：这个月从头到尾都租着，最后一天才退。
    const month = s.date;
    for (let i = 0; i < 40 && s.date === month; i++) advance(s, 1);
    const days = daysInMonth(s.date);
    const rates = monthlyCosts(s);
    for (let i = 0; i < days - 1; i++) advance(s, 1);
    assert.equal(s.gpus.rented.H100, 256);
    E.releaseGpu(s, 'H100', 256, true);
    const report = closeMonth(s);
    assert.ok(rates.rented > 0);
    close(report.costs.rented, rates.rented * (days - 1) / days, '退租前那些天照付');
    close(report.costs.owned, rates.owned, '自有卡一整月都在');
  });

  it('旧档没有逐日账本：读进来那个月已经过去的天数按当时配置估，之后逐日记', () => {
    const s = fresh();
    advance(s, 9);
    const day = Number(s.day.slice(8, 10));
    delete s.computeLedger;
    const old = loadSave({ ...clone(s), v: 3 });
    resolveAll(old);
    const rates = monthlyCosts(old), n = daysInMonth(old.date);
    E.tickDay(old);
    assert.equal(old.computeLedger.estimatedDays, day - 1);
    assert.equal(old.computeLedger.days, day);
    close(old.computeLedger.owned, rates.owned * day / n);
  });

  it('开源蒸馏占推理卡的旧规则在 P4.1 删了：旧档带着 flags.distillLoad，月结也不再按它压低平均推理能力', () => {
    const s = fresh();
    const days = daysInMonth(s.date);
    for (let i = 0; i < days - 1; i++) advance(s, 1);
    s.flags.distillLoad = 300;
    const sumBefore = s.computeLedger.inferCapSum, cap = E.inferGpuEq(s) * (s.service.routing.startsWith('quant') ? 1.35 : s.service.routing.startsWith('distill') ? 1.9 : 1);
    const report = closeMonth(s);
    close(report.service.capGpu, (sumBefore + cap) / days);
    assert.equal(s.flags.distillLoad, 300, '月结不碰这个旧标记');
  });
});

describe('训练算力为 0：不推进、不攒发布天数、不扣健康', () => {
  it('卖光卡后后训练停着：能力、发布天数、健康都不动；只在停下和恢复那天各提示一次', () => {
    const s = fresh('qwen', 'y2025');
    const dir = E.directionsFor(s)[0].key;
    L.decide(s, 'train', { dir });
    const w = E.workingModel(s);
    assert.ok(w && w.stage === 'post');
    const gpus = clone(s.gpus);
    E.setProduct(s, 'gpu_lease', { gpus: E.gpuCount(s) });
    assert.equal(E.trainFlops(s), 0);
    const p = postPreview(s, dir);
    assert.ok(p.paused && p.computeMult === 0, '没有 0.35 的保底');
    assert.ok(Object.values(p.gains).every(v => v === 0));
    assert.ok(L.postWaiting(s), '“进行中”卡显示等待算力');
    const before = { dims: { ...w.dims }, postDays: w.postDays || 0, health: s.health };
    const notes = [];
    for (let i = 0; i < 20; i++) {
      resolveAll(s);
      const out = E.tickDay(s);
      if (out) notes.push(...out.notes.filter(n => n.includes('后训练')));
    }
    assert.deepEqual(w.dims, before.dims);
    assert.equal(w.postDays || 0, before.postDays, '不攒发布天数');
    assert.ok(s.health >= before.health, '停着不累集群');
    assert.equal(notes.length, 1, `20 天里只提示一次：${notes.join(' | ')}`);
    assert.match(notes[0], /停下/);
    // 收回出租的卡，后训练接着练，提示一次恢复。
    E.setProduct(s, 'gpu_lease', { gpus: 0 });
    assert.deepEqual(s.gpus, gpus);
    assert.ok(!L.postWaiting(s));
    resolveAll(s);
    const out = E.tickDay(s);
    assert.ok(out.notes.some(n => n.includes('接着练')), out.notes.join(' | '));
    assert.equal(w.postDays, before.postDays + 1);
    resolveAll(s);
    assert.ok(!E.tickDay(s).notes.some(n => n.includes('后训练')), '恢复以后不再每天提示');
  });

  it('“进行中”卡（规格 T10.1，P2.4b 改版）：作业行、评测行和末尾“训练 ›”每行的格数不超过网格列数；没有训练卡时那一行写“等待算力”，是警告色；不再有“换任务”“全力推进”', async () => {
    // fmt.js 加载时要用 document.baseURI 拼美术地址；测试里给一个最小的替身。
    globalThis.document ??= { baseURI: 'http://localhost/' };
    const { renderHome } = await import('../../src/career/ui/home.js');
    const { setState } = await import('../../src/career/ui/state.js');
    // 样式拆在 src/career/css/ 里：按 index.html 的顺序接起来，层叠和拆分前的 career.css 一样。
    const css = [...readSrc('../../index.html').matchAll(/href="\.\/(src\/career\/css\/[\w-]+\.css)/g)].map(m => readSrc(`../../${m[1]}`)).join('\n');
    // 主界面渲染一遍，取出“进行中”卡（到健康度那一条为止）。
    const card = S => { const app = { className: '', innerHTML: '' }; setState(S); renderHome(app); const h = app.innerHTML, i = h.indexOf('<div class="card now-card">'); return h.slice(i, h.indexOf('<div class="meter', i)); };
    // 每个 now-row（作业行是按钮，点了原位展开）的直接子元素个数，和它在这个宽度下的网格列数。
    const rows = (html, width) => [...html.matchAll(/<(?:div|button) class="(now-row[^"]*)"[^>]*>/g)].map(m => {
      let depth = 0, kids = 0;
      for (const t of html.slice(m.index + m[0].length).matchAll(/<(\/?)[a-z]+[^>]*>/g)) {
        if (t[1]) { if (depth === 0) break; depth--; } else { if (depth === 0) kids++; depth++; }
      }
      const cols = cssTokens(cssAt(css, m[1].split(' ').map(c => `.${c}`), width)['grid-template-columns']).length;
      return { cls: m[1], kids, cols, job: m[1].includes('now-job') };
    });
    const s = fresh('qwen', 'y2025');
    L.decide(s, 'train', { dir: E.directionsFor(s)[0].key });
    L.startProject(s, { total: 7, active: 7, arch: 'dense', tokens: 1 });
    // 先把卡全部租出去（等待算力），再收回来（正常）：两种状态下每一行的格数都不超过列数。
    for (const lease of [E.gpuCount(s), 0]) {
      E.setProduct(s, 'gpu_lease', { gpus: lease });
      const waiting = lease > 0, html = card(s);
      assert.equal(L.postWaiting(s), waiting);
      assert.equal(html.includes('等待算力'), waiting);
      for (const width of [1440, 390]) {
        const list = rows(html, width);
        assert.equal(list.filter(r => r.job).length, 2, html);
        for (const r of list) assert.ok(r.kids <= r.cols, `${width}px「${r.cls}」有 ${r.kids} 格，网格只有 ${r.cols} 列`);
      }
      assert.match(html, /data-act="open-train">训练 ›<\/button>/);
      assert.doesNotMatch(html, /换任务|全力推进|data-act="push"/);
      if (!waiting) continue;
      // .warn 的优先级比 .now-row small 低，得单写一条，不然“等待算力”是灰色。
      assert.match(html, /<small class="warn"[^>]*>等待算力<\/small>/);
      for (const width of [1440, 390]) assert.equal(cssAt(css, '.now-row small.warn', width).color, 'var(--warn)');
    }
  });

  it('刷榜同样停着；换成研究就清掉暂停标记', () => {
    const s = fresh('qwen', 'y2025');
    const bench = E.suiteFor(s).find(b => E.benchmaxPreview(s, b.id))?.id;
    assert.ok(bench);
    L.decide(s, 'train', { dir: 'benchmax', bench });
    E.setProduct(s, 'gpu_lease', { gpus: E.gpuCount(s) });
    const w = E.workingModel(s);
    const boost = clone(w.boost || {}), postDays = w.postDays || 0;
    assert.ok(E.benchmaxPreview(s, bench).paused);
    advance(s, 3);
    assert.deepEqual(w.boost || {}, boost);
    assert.equal(w.postDays || 0, postDays);
    // 分不到卡的后训练作业在排队（T3）；换成研究以后它被“专心研究”暂停，不再算排队。
    assert.equal(E.mainPostJob(s).why, 'min');
    assert.ok(L.postWaiting(s));
    L.decide(s, 'research');
    advance(s, 1);
    assert.equal(E.mainPostJob(s).why, 'paused');
    assert.ok(!L.postWaiting(s));
  });

  it('项目没有算力就停着：不推进、不炸炉、不扣健康；工期是 Infinity，界面显示“等待算力”', () => {
    const s = fresh();
    L.decide(s, 'maintain');
    L.startProject(s, { total: 70, active: 70, arch: 'dense', tokens: 2 });
    E.setProduct(s, 'gpu_lease', { gpus: E.gpuCount(s) });
    assert.equal(E.projectEta(s), Infinity);
    assert.equal(E.previewProject(s, { total: 7, active: 7, arch: 'dense', tokens: 1 }).months, Infinity);
    const pj = baseJob(s).pj, health = s.health;
    resolveAll(s);
    const out = E.tickDay(s);
    assert.equal(pj.done, 0);
    assert.equal(pj.acc.w, 0);
    assert.ok(out.project?.paused);
    assert.equal(out.blowup, undefined);
    assert.ok(s.health >= health);
    for (const f of ['../../src/career/ui/home.js', '../../src/career/ui/pages/model.js']) assert.match(readSrc(f), /等待算力/, f);
  });

  it('训练卡按 3:1 水位分（T4.2）：只有底座时底座用整个训练卡；检修时留出四分之一；和后训练一起时按优先 3、正常 1 分，吃饱的多出来的回给另一项', () => {
    const s = fresh('perplexity', 'y2025');
    const dir = E.directionsFor(s).find(d => d.rl).key;
    L.decide(s, 'research');
    L.startProject(s, { total: 70, active: 70, arch: 'dense', tokens: 3 });
    const share = kind => E.allocJobs(s).items.find(i => i.job.kind === kind);
    assert.equal(share('pretrain').share, Math.min(1, share('pretrain').upper));
    L.decide(s, 'maintain');
    assert.ok(share('pretrain').share <= 0.75 + 1e-12, '检修时留出 25%');
    L.decide(s, 'train', { dir });
    const al = E.allocJobs(s);
    const b = al.items.find(i => i.job.kind === 'pretrain'), p = al.items.find(i => i.job.kind === 'post');
    // 水位：两项都没顶到上下限，份额之比是 3:1。
    assert.ok(b.share > b.min + 1e-12 && b.share < b.upper - 1e-12, '底座在上下限之间');
    assert.ok(p.share > p.min + 1e-12 && p.share < p.upper - 1e-12, '后训练在上下限之间');
    close(b.share / p.share, 3, '3:1');
    assert.ok(Math.abs(b.share + p.share - Math.min(1, b.upper + p.upper)) < 1e-9, '训练卡分完或者都吃饱');
    // 后训练的 computeMult 按它实得的份额算；工期按底座实得的份额和最快天数算。
    const needPerMonth = 6 * (E.workingModel(s).active || 3) * 1e9 * (E.directionsFor(s).find(d => d.key === dir).rl ? 4e11 : 6e10);
    close(postPreview(s, dir).computeMult, Math.min(1.2, Math.sqrt(E.trainFlops(s) * p.share / needPerMonth)));
    const pj = baseJob(s).pj;
    const eta = (rush = 1) => (pj.need - pj.done) / Math.min(E.trainFlops(s) * b.share * (1 + E.knowFx(s).pretrain) * rush / 30, pj.need / E.fastestDays(s, pj.structure)) / 30;
    close(E.projectEta(s), eta());
    L.decide(s, 'pretrain');
    const b2 = E.allocJobs(s).items.find(i => i.job.kind === 'pretrain');
    close(E.projectEta(s), (pj.need - pj.done) / Math.min(E.trainFlops(s) * b2.share * (1 + E.knowFx(s).pretrain) * 1.25 / 30, pj.need / E.fastestDays(s, pj.structure)) / 30);
  });
});

// 外部包 scripts/audit_training_edges.mjs 的三个复现，挪到这里当测试辅助。
const safe = (event, choices) => choices.find(c => !['rent', 'scale', 'ascend', 'overseas', 'buy'].includes(c.id));
const day = s => advance(s, 1, safe);
const freshSafe = (company = 'gpt', scenario = 'y2024', seed = 89) => { const s = E.createGame(company, scenario, seed); resolveAll(s, safe); return s; };
const april = () => {
  const s = freshSafe(); L.decide(s, 'maintain');
  while (s.day < '2024-04-01' && s.status === 'playing') day(s);
  return s;
};
// 练到最后不到一个月时才下单一份大语料，它在项目 97% 以后到货。
function lateData() {
  const s = april();
  L.startProject(s, { total: 400, active: 400, arch: 'dense', tokens: 15 });
  while (E.hasBaseJob(s) && E.projectEta(s) * 30 > 24 && s.status === 'playing') day(s);
  const control = structuredClone(s), late = structuredClone(s);
  L.decide(late, 'data', { id: 'ds_fineweb' });
  let arrival;
  for (let i = 0; i < 180 && E.hasBaseJob(late) && late.status === 'playing'; i++) {
    day(late);
    if (!arrival && E.poolStats(late).tokens > 10) arrival = { day: late.day, done: E.hasBaseJob(late) ? baseJob(late).pj.done / baseJob(late).pj.need : 1 };
  }
  for (let i = 0; i < 180 && E.hasBaseJob(control) && control.status === 'playing'; i++) day(control);
  const summarize = g => { const m = E.workingModel(g); return { pretraining: m.pretraining, base: m.base, q: E.qOf('llm', m.dims) }; };
  return { arrival, control: summarize(control), late: summarize(late) };
}
// 一个月左右练完的项目（预训练有最快天数，P2.4a 起练不到两天）：开工后新语料到货，之前练的部分按旧语料、之后的按新语料记；
// 最后一天把推理调到最低、算力多出好几倍，只记剩下的工作量（数据权重正好到 1）。
function finalDayWeight() {
  const s = april();
  E.setInferShare(s, 0.9);
  let cfg;
  outer: for (const total of [3, 7, 14, 32, 70, 120]) for (const tokens of [0.3, 0.5, 1, 2, 4]) {
    const c = { total, active: total, arch: 'dense', tokens };
    const p = E.previewProject(s, c);
    if (p.days > 24 && p.days < 40) { cfg = c; break outer; }
  }
  assert.ok(cfg, '找不到一个月左右练完的项目，检查算力设定');
  L.startProject(s, cfg);
  const old = E.poolStats(s);
  L.decide(s, 'data', { id: 'ds_fineweb' });
  let before = null;
  for (let i = 0; i < 60 && E.hasBaseJob(s); i++) {
    if (!before && E.poolStats(s).tokens > old.tokens) before = { done: baseJob(s).pj.done / baseJob(s).pj.need, weight: baseJob(s).pj.acc.w };
    if (E.projectEta(s) * 30 <= 1.5) E.setInferShare(s, 0.05);
    day(s);
  }
  const received = { quality: E.poolStats(s).quality };
  return { oldQuality: old.quality, newQuality: received.quality, before,
    expectedCapacityQuality: old.quality * before.done + received.quality * (1 - before.done), actual: E.workingModel(s).pretraining };
}
// 连着立 0.5B / 0.3T 的玩具底座刷经验，对照组同样 30 天只做研究。
function shortProjectKnowledge() {
  return ['research', 'farm'].map(mode => {
    const s = freshSafe('rwkv', 'y2023');
    let projects = 0;
    L.decide(s, 'research');
    for (let i = 0; i < 60 && s.status === 'playing'; i++) {
      if (mode === 'farm' && !E.hasBaseJob(s)) { L.startProject(s, { total: 0.5, active: 0.5, arch: 'rnn', tokens: 0.3 }); projects++; }
      day(s);
    }
    return { mode, know: s.know, projects };
  });
}

describe('预训练分段记账与研发经验', () => {
  const freshMaintain = () => { const s = E.createGame('gpt', 'y2025', 89); resolveAll(s); L.decide(s, 'maintain'); return s; };
  const complete = (s, cfg) => {
    L.startProject(s, cfg);
    const project = baseJob(s).pj;
    for (let i = 0; i < 90 && E.hasBaseJob(s) && s.status === 'playing'; i++) advance(s, 1);
    assert.equal(E.hasBaseJob(s), false);
    near(project.acc.w, 1, '最终数据权重');
    return E.workingModel(s);
  };

  it('项目 97% 以后才到的新语料只改善剩下的工作，不会把前面的重复折扣洗掉', () => {
    const r = lateData();
    assert.ok(r.arrival && r.arrival.done > 0.97, `到货时进度 ${r.arrival?.done}`);
    const base = r.control.pretraining, late = r.late.pretraining;
    assert.ok(base.repeat < 1, '对照组确实练了重复语料');
    // 新语料到了以后不再重复，剩下那一小段的利用率是 1。
    near(late.repeat, base.repeat * r.arrival.done + (1 - r.arrival.done), '按实际训练份额算重复利用率');
    assert.ok(1 - late.repeat > 0.9 * (1 - base.repeat), '折扣只追回最后不到一成');
    assert.ok(late.capacityQuality > base.capacityQuality, '晚到的好语料仍然算数');
    assert.ok(late.quality < late.capacityQuality, '训练信号和容量质量分开记，重复只折训练信号');
    for (const k of Object.keys(r.control.base)) assert.ok(r.late.base[k] - r.control.base[k] < 0.5, `${k} 不能因最后补数据多出好几分`);
  });

  it('最后一天添算力只记剩下的工作量，数据质量不会因为多出来的算力多拿权重', () => {
    const r = finalDayWeight();
    assert.ok(r.before && r.before.done > 0.05 && r.before.done < 0.95, `新语料到货时的进度 ${r.before?.done}`);
    near(r.actual.capacityQuality, r.expectedCapacityQuality, '原始质量按已完成工作加权');
    near(r.actual.quality, r.expectedCapacityQuality, '这个例子没有重复，不再二次折扣');
  });

  it('0.3T 玩具底座反复练完，不再每次固定送 3 点经验', () => {
    const [research, farm] = shortProjectKnowledge();
    // 预训练有最快天数（T2.2，至少 20 天），60 天只练得完两三个玩具底座；照样不能白拿经验。
    assert.ok(farm.projects >= 2, `60 天立了 ${farm.projects} 个`);
    assert.ok(farm.know > research.know, '真练过还是有一点经验');
    assert.ok(farm.know - research.know < 1, `${farm.projects} 个玩具底座不能白拿 ${farm.projects * 3} 点：实际多了 ${(farm.know - research.know).toFixed(2)}`);
  });

  it('正常的小、大模型按有效训练工作给经验；同一配方再练一遍收获按 1/√2 递减', () => {
    const rows = [];
    for (const [total, tokens] of [[0.5, 0.3], [7, 2], [70, 2]]) {
      const s = freshMaintain();
      const cfg = { total, active: total, arch: 'dense', tokens };
      const first = complete(s, cfg);
      const e1 = first.pretraining.experience;
      assert.equal(e1.previous, 0);
      close(e1.credit, E.pretrainCredit(total, e1.effectiveFlops, 0).credit, '按 F6 公式');
      close(e1.effectiveFlops, 6 * total * 1e9 * tokens * 1e12 * first.pretraining.repeat, '有效算力 = 需求 × 重复利用率');
      const second = complete(s, cfg);
      const e2 = second.pretraining.experience;
      assert.equal(e2.previous, 1);
      near(e2.credit, e1.credit / Math.sqrt(2), '同配方边际经验');
      rows.push(e1.credit);
    }
    // 语料够多不重复时，正好落在 F6 算例表上：0.5B/0.3T 拿不到 0.1，7B/2T 1.90，70B/2T 9.64。
    assert.ok(rows[0] < 0.1);
    assert.equal(rows[1].toFixed(2), '1.90');
    assert.equal(rows[2].toFixed(2), '9.64');
  });

  it('严重炸炉同时回滚进度和对应的数据权重', () => {
    let saw = false;
    for (let seed = 1; seed <= 30 && !saw; seed++) {
      const s = E.createGame('gpt', 'y2024', seed);
      resolveAll(s); L.decide(s, 'maintain');
      L.startProject(s, { total: 400, active: 400, arch: 'dense', tokens: 15 });
      for (let i = 0; i < 40 && E.hasBaseJob(s); i++) {
        resolveAll(s);
        const old = structuredClone(baseJob(s).pj.acc), done = baseJob(s).pj.done;
        const out = E.tickDay(s);
        if (out?.blowup !== 'severe' || !E.hasBaseJob(s)) continue;
        saw = true;
        // P2.4a 起严重炸炉回退 5 天的进度，最多回退已完成部分的 25%（T2.2，回退的精确值见 jobs.test 第 9 条）。
        const f = baseJob(s).pj.done / done;
        assert.ok(f >= 0.75 - 1e-9 && f < 1, `回滚比例 ${f}`);
        for (const k of ['w', 'q', 'effectiveQ', 'repeat', 'cn']) near(baseJob(s).pj.acc[k], old[k] * f, k);
        for (const k of Object.keys(old.mix)) near(baseJob(s).pj.acc.mix[k], old.mix[k] * f, `mix.${k}`);
        near(baseJob(s).pj.acc.w, baseJob(s).pj.done / baseJob(s).pj.need, '留下的数据权重对应留下的进度');
        break;
      }
    }
    assert.ok(saw, '前 30 个种子里应当有一次严重炸炉');
  });

  it('中止不发经验，重新立项从零开始；存读档不多算数据权重和经验', () => {
    const s = freshMaintain(); E.setInferShare(s, 0.9);
    const cfg = { total: 70, active: 70, arch: 'dense', tokens: 12 };
    L.startProject(s, cfg); advance(s, 2);
    assert.ok(E.hasBaseJob(s) && baseJob(s).pj.done > 0);
    const know = s.know;
    L.cancelProject(s);
    assert.equal(s.know, know);
    L.startProject(s, cfg);
    assert.equal(baseJob(s).pj.done, 0);
    assert.equal(baseJob(s).pj.acc.w, 0);
    const loaded = loadSave(loadSave(clone(s)));
    assert.deepEqual(baseJob(loaded).pj, baseJob(s).pj);
    assert.equal(loaded.know, s.know);
  });

  it('旧档里练到一半的预训练：补上分段字段，权重对齐实际进度，接着练完不出 NaN', () => {
    const s = freshMaintain(); E.setInferShare(s, 0.9);
    L.startProject(s, { total: 70, active: 70, arch: 'dense', tokens: 12 });
    advance(s, 3);
    // 造一份 v3 旧档：项目还在 s.project 里（P2.4a 之前的写法），没有作业表。
    const old = JSON.parse(JSON.stringify(s));
    old.v = 3;
    old.project = JSON.parse(JSON.stringify(baseJob(s).pj));
    old.focus = { kind: 'maintain', since: s.day };
    for (const k of ['jobs', 'evals', 'prevWorking', 'smallShelf']) delete old[k];
    delete old.mig.jobs;
    // 旧版记账（v3 存档）：没有 effectiveQ / repeat；炸炉回滚过，权重比实际进度多。
    delete old.project.acc.effectiveQ; delete old.project.acc.repeat;
    old.project.acc.w *= 1.3; old.project.acc.q *= 1.3;
    const m = loadSave(old);
    const pj = baseJob(m).pj, acc = pj.acc;
    near(acc.w, pj.done / pj.need, '权重对齐进度');
    assert.ok(Number.isFinite(acc.effectiveQ) && Number.isFinite(acc.repeat));
    near(acc.effectiveQ / acc.w, acc.q / acc.w * acc.repeat / acc.w, '已练部分按读档时的池子估一次');
    for (let i = 0; i < 90 && E.hasBaseJob(m); i++) advance(m, 1);
    const p = E.workingModel(m).pretraining;
    assert.ok([p.quality, p.capacityQuality, p.repeat, p.experience.credit].every(Number.isFinite));
  });
});

describe('规格 F6 的两个公式', () => {
  it('重复语料：等效遍数和利用率逐格对上算例表（R* = 10）', () => {
    const table = [[1, '1.00', 100], [2, '1.95', 98], [4, '3.59', 90], [8, '6.03', 75], [16, '8.77', 55]];
    for (const [E_, eff, util] of table) {
      assert.equal(E.effectiveEpochs(E_).toFixed(2), eff, `${E_} 遍`);
      assert.equal(Math.round(E.repeatEfficiency(1, E_) * 100), util, `${E_} 遍的利用率`);
    }
    assert.equal(E.REPEAT_RSTAR, 10);
    assert.equal(E.MAX_EPOCHS, 4);
    assert.equal(E.repeatEfficiency(4, 3), 1, '不到一遍不折算');
    assert.equal(E.repeatEfficiency(0, 1), 0.3, '没语料时兜底 0.3');
    // R* 在 7.5–15 之间时，4 遍的等效遍数只在 3.47–3.72 之间（不敏感）。
    const at = r => 1 + r * (1 - Math.exp(-3 / r));
    assert.ok(at(7.5) > 3.46 && at(15) < 3.73);
  });

  it('重复语料只用于 LLM：其他模态保持旧公式', () => {
    const img = fresh('midjourney', 'y2024');
    for (const [pool, tok] of [[1, 2], [1, 4], [2, 1]]) close(E.pretrainRepeat(img, pool, tok), Math.min(1, Math.pow(pool / tok, 0.35)));
    assert.equal(E.pretrainRepeat(img, 0, 1), 0.3);
    const llm = fresh();
    close(E.pretrainRepeat(llm, 1, 4), E.repeatEfficiency(1, 4));
  });

  it('重复只削弱训练信号：容量（kcap）和安全底子用语料原始质量', () => {
    const cfg = { total: 7, active: 7, arch: 'dense' }, mix = { sci: 0.1, books: 0.1 };
    const r = llmBase(cfg, 16, 1.2 * E.repeatEfficiency(4, 16), mix, 1.2);
    const fresh_ = llmBase(cfg, 16, 1.2, mix);
    assert.equal(r.kcap, knowledgeCap(7, 1.2));
    assert.equal(r.base.safety, fresh_.base.safety);
    // 规格表“对游戏的影响”：池 4T、质量 1.2、练 4 遍的知识分。
    for (const [total, f, old, now] of [[7, '62.4', '59.7', '61.9'], [70, '73.5', '70.9', '73.4']]) {
      const c = { total, active: total, arch: 'dense' };
      assert.equal(llmBase(c, 16, 1.2, mix).base.knowledge.toFixed(1), f);
      assert.equal(llmBase(c, 16, 1.2 * Math.pow(4 / 16, 0.35), mix).base.knowledge.toFixed(1), old);
      assert.equal(llmBase(c, 16, 1.2 * E.repeatEfficiency(4, 16), mix, 1.2).base.knowledge.toFixed(1), now);
    }
  });

  it('研发经验：算例表十行逐格对上', () => {
    const llm = (total, active, tokens) => 6 * active * 1e9 * tokens * 1e12;   // 有效训练 FLOPs（不重复）
    const table = [
      [1.5, llm(1.5, 1.5, 0.03), '0.02'], [1.5, llm(1.5, 1.5, 0.3), '0.24'], [7, llm(7, 7, 1), '1.80'], [7, llm(7, 7, 2), '1.90'],
      [14, llm(14, 14, 2), '4.32'], [30, llm(30, 3, 4), '4.32'], [70, llm(70, 70, 2), '9.64'], [671, llm(671, 37, 15), '16.17'],
      [0.5, 15e21, '1.35'], [1, 30e21, '1.80'],   // 语音 0.5B 15 H100·月、图像 1B 30 H100·月
    ];
    for (const [total, F, want] of table) assert.equal(E.pretrainCredit(total, F).credit.toFixed(2), want, `${total}B / ${F / 1e21} H100·月`);
    assert.deepEqual(E.KNOW_PRETRAIN, { base: 3, perDoubling: 2, refFlops: 8.4e22, floor: 0.6, floorFlops: 2e22 });
    // 下限只给像样的训练：2e22 以下线性降到 0，没有跳变。
    close(E.pretrainCredit(7, 1e22).workFactor, 0.3);
    assert.equal(E.pretrainCredit(7, 0).credit, 0);
    close(E.pretrainCredit(70, 8.4e23, 3).credit, E.pretrainCredit(70, 8.4e23).credit / 2, '做过 3 次同配方：1/√4');
  });

  it('立项最多重复 4 遍；界面写“相当于 N.N 遍新数据”，不再写“质量打折”', () => {
    const s = fresh();
    const pool = E.poolStats(s).tokens;
    assert.ok(!E.projectCheck(s, { total: 7, active: 7, arch: 'dense', tokens: pool * 4 + 1 }).ok);
    assert.match(E.projectCheck(s, { total: 7, active: 7, arch: 'dense', tokens: pool * 4 + 1 }).reason, /4 轮/);
    const pv = E.previewProject(s, { total: 7, active: 7, arch: 'dense', tokens: pool * 2 });
    close(pv.epochs, 2);
    close(pv.freshEpochs, E.effectiveEpochs(2));
    const form = readSrc('../../src/career/ui/pages/project_form.js');
    assert.doesNotMatch(form, /质量打折/);
    assert.match(form, /相当于 \$\{pv\.freshEpochs\.toFixed\(1\)\} 遍新数据/);
  });

  it('重复遍数上限只有 MAX_EPOCHS 一处：顾问挑 token 档、电脑挑底座、立项检查、后台立项表单都读它，不写死 4', () => {
    // 立项检查 projectCheck 在拆分后的 sim/projects.js 里；后台立项表单在 ui/pages/project_form.js 里。
    const advisor = readSrc('../../src/career/sim/advisor.js'), form = readSrc('../../src/career/ui/pages/project_form.js'), projects = readSrc('../../src/career/sim/projects.js');
    assert.match(advisor, /import \{[^}]*\bMAX_EPOCHS\b[^}]*\} from '\.\/model\.js'/);
    assert.match(advisor, /TOKEN_STEPS\.filter\(t => t <= Math\.max\(1, env\.pool\.tokens \* MAX_EPOCHS\)\)/);
    assert.match(form, /pool\.tokens \* E\.MAX_EPOCHS/);
    assert.match(projects, /\(env\?\.pool \?\? poolStats\(s\)\)\.tokens \* MAX_EPOCHS/);
    // 电脑挑底座（sim/bot.js 的 chooseBase）：P4.2 前写死“语料池 × 2”，改读 MAX_EPOCHS。
    const bot = readSrc('../../src/career/sim/bot.js');
    assert.match(bot, /Math\.min\(pool \* MAX_EPOCHS, /);
    assert.doesNotMatch(bot, /pool \* 2\b/);
    for (const [f, src] of [['advisor.js', advisor], ['project_form.js', form], ['projects.js', projects], ['bot.js', bot]]) assert.doesNotMatch(src, /(pool|tokens)\S* \* 4\b/, f);
    // 顾问建议的立项都过得了 projectCheck，token 不超过语料池 × MAX_EPOCHS。
    for (const [id, sc] of [['qwen', 'y2023'], ['mistral', 'y2023']]) {
      const s = fresh(id, sc);
      // P2.4a 起立项前先给下一代计划调一次参（T9.2 第 5 条）：建议可能是“先调参”，计划就是要立项的配置。
      const a = E.advise(s).find(x => x.id === 'project' || x.id === 'trial:tune');
      assert.ok(a, `${id} ${sc} 有立项建议`);
      const cfg = a.op.cfg ?? a.op.plan;
      assert.ok(cfg.tokens <= Math.max(1, E.poolStats(s).tokens * E.MAX_EPOCHS) && E.projectCheck(s, cfg).ok);
    }
  });
});
