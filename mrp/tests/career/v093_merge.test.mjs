// v0.9.3 合并 M7 收尾：旧档迁移只带已收各组的段落（审查 B8），合并边界（C、D 组不进仓库），package.json 和可选浏览器烟测（B12、B13）。
// 外部改动包把旧档在途订单补成“生成任务”且进度从 0 算（G1-3），到货推迟 11–65 天；生成任务这次不收，这里锁住“按原到货日交付”。
// 审查遗留修复补了：服务页收入预估卡的归属和 B11 测试改名（按真实文件和规格文件树核对）；浏览器烟测找不到 Chromium 时中文提示、以 0 退出。
import { describe, it } from 'node:test';
import fs from 'node:fs';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { loadSave, asOldNaming } from '../helpers/career_util.mjs';
import { resolveAll, advance } from '../helpers/career_bot.mjs';
import { addDays } from '../../src/career/sim/clock.js';

const clone = v => JSON.parse(JSON.stringify(v));
const readSrc = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const exists = p => fs.existsSync(new URL(p, import.meta.url));
const key = o => `${o.placed}|${o.kind}|${o.ref}|${o.eta}`;

// 新开一局，用公开命令下买卡、租卡、预训练语料、后训练数据、开源蒸馏数据各一笔，再走几天。
function withOrders() {
  const s = E.createGame('mistral', 'y2024', 7);
  resolveAll(s);
  E.buyGpu(s, 'H100', 256);
  E.buyGpu(s, 'H100', 256, true);
  E.decide(s, 'data', { id: 'ds_pile' });
  E.decide(s, 'data', { id: 'ds_pref_human' });
  E.decide(s, 'data', { id: E.distillOptions(s).find(o => o.ok && o.open).id });
  advance(s, 3);
  return s;
}
// 改回 v0.9 存档的样子（结构版本 v3）：没有逐日算力账本、模型没有结构出处和各自的成绩、已公布成绩不带 modelId。
// P1.2 起开源蒸馏是生成订单（规格 D7）：改回 v0.9 的样子就是“下单两周到货”的 BASE 订单，下单时记 distillLoad 占推理卡。
function asV09(s) {
  const old = asOldNaming(clone(s));
  old.v = 3;
  for (const o of old.orders) {
    if (!o.gen) continue;
    for (const k of ['gen', 'id', 'teacherName', 'relId', 'license']) delete o[k];
    o.eta = addDays(o.placed, 14);
    old.flags.distillLoad = 300;
  }
  old.orders.sort((a, b) => a.eta.localeCompare(b.eta));
  delete old.computeLedger;
  for (const m of old.models) { delete m.structureSource; delete m.benchmarks; }
  for (const run of Object.values(old.published)) delete run.modelId;
  return old;
}

describe('v0.9.3 收尾：旧档迁移只带已收组的段落', () => {
  it('旧档在途的买卡、租卡、语料、后训练数据、开源蒸馏数据：读档不改订单，各按原来的到货日交付（G1-3 不复现）', () => {
    const old = asV09(withOrders());
    const kinds = old.orders.map(o => o.kind).sort();
    assert.deepEqual(kinds, ['data', 'data', 'distill', 'gpu', 'rent']);
    const s = loadSave(clone(old));
    assert.deepEqual(s.orders, old.orders, '迁移不碰在途订单，也不补生成进度');
    const pending = new Map(s.orders.map(o => [key(o), o]));
    const owned = s.gpus.owned.H100 || 0, rented = s.gpus.rented.H100 || 0;
    const tokens = s.data.pool.tokens, post = s.data.post.chat || 0, dist = clone(s.data.distill);
    for (let i = 0; i < 240 && pending.size; i++) {
      resolveAll(s);
      const out = E.tickDay(s);
      const left = new Set(s.orders.map(key));
      for (const [k, o] of [...pending]) {
        if (left.has(k)) { assert.ok(o.eta > out.day, `${o.kind} 过了到货日 ${o.eta} 还没到`); continue; }
        assert.equal(out.day, o.eta, `${o.kind} ${o.ref} 应在 ${o.eta} 到，实际 ${out.day}`);
        pending.delete(k);
        if (o.kind === 'gpu') assert.equal(s.gpus.owned.H100 - owned, o.n);
        if (o.kind === 'rent') assert.equal(s.gpus.rented.H100 - rented, o.n);
        if (o.ref === 'ds_pile') assert.ok(s.data.pool.tokens > tokens, '语料进了池子');
        if (o.ref === 'ds_pref_human') assert.ok((s.data.post.chat || 0) > post, '后训练数据到位');
        if (o.kind === 'distill') assert.notDeepEqual(s.data.distill, dist, '蒸馏数据到位');
      }
    }
    assert.equal(pending.size, 0, '五笔订单都到了');
  });

  it('迁移不带进不收组的字段：没有反应式竞争、生成进度、蒸馏账本；capTechs 按 P1.2 的 D6.1 补上；开源蒸馏占卡原样保留，超事件积压名单丢掉，读两遍结果一样', () => {
    const old = asV09(withOrders());
    old.flags.superEarned = { super_sota: { day: old.day } };
    const load = old.flags.distillLoad;
    assert.ok(load > 0, '下了开源蒸馏单，v0.9 的占卡标记在');
    const s = loadSave(clone(old));
    assert.equal(s.competition, undefined);
    assert.ok(s.orders.every(o => o.generation === undefined));
    assert.equal(s.data.teacherSources, undefined);
    assert.equal(s.data.teacherCapByCategory, undefined);
    assert.ok(s.models.every(m => Array.isArray(m.capTechs)), 'P1.2 做 D6.1：底座里已经含着上限效果的技术记在 capTechs');
    assert.equal(s.flags.distillLoad, load, '旧档带着的开源蒸馏占卡标记原样留着（P4.1 起月结不再读它）');
    assert.equal(s.flags.superEarned, undefined);
    assert.ok(s.models.every(m => m.structureSource), '已收的 B1：继承型号补上结构出处');
    assert.ok(Object.values(s.published).every(r => r.modelId), '已收的 B2：已公布成绩补上 modelId');
    assert.ok(E.validateGame(s));
    const once = clone(s);
    assert.deepEqual(loadSave(s), once);
  });
  it('P4.1（规格 F2）：createGame 不再写 data.teacherCap: {}，loop.js 的 monthClose 不再读写 flags.distillLoad（开源蒸馏早就不写它了）', () => {
    const s = E.createGame('deepseek', 'y2024', 3);
    assert.ok(!('teacherCap' in s.data), '新开局没有 data.teacherCap');
    resolveAll(s);
    for (let i = 0; i < 40 && s.status === 'playing'; i++) { resolveAll(s); E.tickDay(s); }
    assert.ok(!('distillLoad' in s.flags), '月结不再写 flags.distillLoad');
    const loop = fs.readFileSync(new URL('../../src/career/sim/loop.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!loop.includes('distillLoad'), 'loop.js 里没有 distillLoad 了');
  });
});

describe('v0.9.3 合并边界', () => {
  it('C、D 组的模块和标识不在 src/career 里（到 v1.0 做对应条目时改这一条）', () => {
    for (const p of ['sim/competition.js', 'sim/generation.js', 'data/market_customers.js', 'ui/orders.js'])
      assert.ok(!exists(`../../src/career/${p}`), `${p} 不该进仓库`);
    const dir = new URL('../../src/career/', import.meta.url);
    const files = fs.readdirSync(dir, { recursive: true }).filter(f => /\.(js|css)$/.test(f));
    // 只看代码，不看 // 注释（注释里可以提到没收的东西）。
    const all = files.map(f => fs.readFileSync(new URL(f, dir), 'utf8').replace(/\/\/.*$/gm, '')).join('\n');
    // capTechs 在 P1.2 做 D6.1 时按审查报告 C1 的建议收进来了（自己预训练的底座记 []），不再算没收的标识。
    for (const word of ['teacherSources', 'teacherCapByCategory', 'initCompetition', 'tickCompetition', 'competitionMode', 'makeGeneration', 'generationReady', 'generationGpus', 'MARKET_CUSTOMERS', 'willingnessToPay'])
      assert.ok(!all.includes(word), `src/career 里出现了 ${word}`);
    assert.equal(all.split('superEarned').length - 1, 1, 'superEarned 只在读档时删掉，不再用');
    assert.match(readSrc('../../src/career/ui/app.js'), /REAL TIMELINE/, '标题页小字不改');
  });

  it('npm test 是 node --test 加 tests/**/*.test.mjs，不接 test_all.mjs；浏览器烟测单独一条命令，不用 Codex 专用变量、不查缺图兜底', () => {
    const pkg = JSON.parse(readSrc('../../package.json'));
    assert.equal(pkg.scripts.test, 'node --test "tests/**/*.test.mjs"');
    assert.equal(pkg.scripts['test:ui'], 'node scripts/ui_smoke.mjs');
    assert.ok(!exists('../../scripts/test_all.mjs'));
    const ui = readSrc('../../scripts/ui_smoke.mjs');
    assert.ok(!ui.includes('CODEX_PRIMARY_RUNTIME_NODE_MODULES'));
    assert.ok(!ui.includes('art-fallback'));
    assert.match(ui, /process\.exit\(0\)/, '缺 Playwright 时提示一句、以 0 退出');
  });

  it('服务页收入预估卡：ui/pricing.js 已并进 ui/pages/service.js，规格 §1.1 文件树里有 service 页、没有 pricing；B11 的测试改名已随 P0.1 做完', () => {
    assert.ok(!exists('../../src/career/ui/pricing.js'));
    assert.match(readSrc('../../src/career/ui/pages/service.js'), /export function renderPricingPreview\(/);
    const spec = readSrc('../../docs/spec/v1.0-spec.md');
    const tree = spec.slice(spec.indexOf('### 1.1'), spec.indexOf('### 1.2'));
    assert.match(tree, /`pages\/`：[^\n]*`service`/);
    assert.doesNotMatch(tree, /pricing/);
    // B11：测试已经改名放进 tests/career/，tests/ 下不再有 test_*.mjs。
    assert.ok(exists('./v093_merge.test.mjs'));
    assert.deepEqual(fs.readdirSync(new URL('../', import.meta.url)).filter(f => /^test_.*\.mjs$/.test(f)), []);
  });

  it('浏览器烟测：装了 Playwright 却找不到 Chromium 时，提示一句中文、以 0 退出；找到了却启动失败才以 1 退出', async () => {
    // 不装任何东西：用解析钩子把 'playwright' 换成一个假的（launch 直接抛 Playwright 原样的英文错误），再起一个本地小服务让脚本走到启动浏览器那一步。
    const server = http.createServer((q, r) => r.end('ok'));
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const dir = fs.mkdtempSync(join(tmpdir(), 'mrp-ui-smoke-'));
    const js = code => `data:text/javascript,${encodeURIComponent(code)}`;
    const run = message => new Promise(resolve => {
      const fake = js(`export const chromium = { launch: async () => { throw new Error(${JSON.stringify(message)}); } };`);
      const hook = js(`import { registerHooks } from 'node:module';
        registerHooks({ resolve: (spec, ctx, next) => (spec === 'playwright' ? { url: ${JSON.stringify(fake)}, shortCircuit: true } : next(spec, ctx)) });`);
      const env = { ...process.env, UI_BASE_URL: `http://127.0.0.1:${server.address().port}`, UI_QA_DIR: dir };
      execFile(process.execPath, ['--import', hook, fileURLToPath(new URL('../../scripts/ui_smoke.mjs', import.meta.url))], { env },
        (err, stdout, stderr) => resolve({ code: err ? err.code : 0, out: `${stdout}${stderr}` }));
    });
    try {
      const missing = await run("browserType.launch: Executable doesn't exist at /nowhere/chrome-mac/Chromium\nPlease run the following command to download new browsers: npx playwright install");
      assert.equal(missing.code, 0, missing.out);
      assert.match(missing.out, /找不到 Chromium.*npx playwright install chromium.*UI_BROWSER_EXECUTABLE/);
      assert.doesNotMatch(missing.out, /Executable doesn't exist/, '不把英文报错原样甩给人');
      const broken = await run('browserType.launch: Target page, context or browser has been closed');
      assert.equal(broken.code, 1, broken.out);
      assert.match(broken.out, /^Chromium 启动失败：/m);
    } finally {
      server.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
