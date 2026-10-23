// v0.9.3 合并 M1：公开命令的输入校验、出租卡数钳制、走私卡记账、两处服务结算小修、文案与主屏布局。
// 断言参照外部 v0.9.2 改动包的测试（数值边界、算力下单、预训练立项、走私记账、出租计费），按我们的引擎改写。
// 审查遗留修复补了：原型上的键（'toString'、'__proto__'）不算型号、价格档和策略；手机断点里的新闻条间距真的生效。
import { describe, it } from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { loadSave } from '../helpers/career_util.mjs';
import { SCALES, gpuAvailable } from '../../src/career/data/core.js';
import { resolveAll, advanceMonth } from '../helpers/career_bot.mjs';
import { cssAt, cssTokens } from '../helpers/css.mjs';
import * as L from '../helpers/legacy_jobs.mjs';

const clone = v => JSON.parse(JSON.stringify(v));
const fresh = (char = 'gpt', scenario = 'y2025', seed = 71) => { const s = E.createGame(char, scenario, seed); resolveAll(s); return s; };
// 每个坏调用都要抛错，而且存档一个字都不能变。
function rejects(s, calls, pattern) {
  for (const run of calls) {
    const before = clone(s);
    assert.throws(run, pattern, String(run));
    assert.deepEqual(s, before, `${run} 失败后改动了存档`);
  }
}
const sellAll = s => {
  for (const [id, n] of Object.entries(s.gpus.owned)) E.releaseGpu(s, id, n, false);
  for (const [id, n] of Object.entries(s.gpus.rented)) E.releaseGpu(s, id, n, true);
};
const readSrc = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

describe('公开命令拒绝坏数值', () => {
  it('推理份额、产品配置、分流、服务策略、交易和退卡：坏值在写入前就被拒绝', () => {
    const s = fresh();
    const total = E.gpuCount(s);
    rejects(s, [
      () => E.setInferShare(s, NaN), () => E.setInferShare(s, Infinity), () => E.setInferShare(s, '0.5'), () => E.setInferShare(s, undefined),
      () => E.setProduct(s, 'api', { tier: 'missing' }), () => E.setProduct(s, 'api', { smallTier: 'missing' }), () => E.setProduct(s, 'api', { on: 'yes' }),
      () => E.setProduct(s, 'api', { unexpected: 1 }), () => E.setProduct(s, 'api', null), () => E.setProduct(s, 'api', { gpus: 64 }),
      () => E.setProduct(s, 'gpu_lease', { gpus: NaN }), () => E.setProduct(s, 'gpu_lease', { gpus: -1 }), () => E.setProduct(s, 'gpu_lease', { gpus: -1e6 }),
      () => E.setProduct(s, 'gpu_lease', { gpus: 1.5 }), () => E.setProduct(s, 'gpu_lease', { gpus: '64' }), () => E.setProduct(s, 'gpu_lease', { gpus: total + 1 }),
      () => E.setRouting(s, 'missing'), () => E.setPolicy(s, 'proxyPolicy', 'missing'), () => E.setPolicy(s, 'contentPolicy', undefined), () => E.setPolicy(s, 'cash', 1),
      () => E.trade(s, 'NVDA', NaN), () => E.trade(s, 'NVDA', Infinity), () => E.trade(s, 'NVDA', '100'), () => E.trade(s, 'NVDA', 0),
      () => E.releaseGpu(s, 'H100', -1, false), () => E.releaseGpu(s, 'H100', 0, false), () => E.releaseGpu(s, 'H100', 1.5, false), () => E.releaseGpu(s, 'nope', 8, false),
    ]);
    // 原型上的键（'toString'、'__proto__'、'constructor'）不是型号、价格档或策略：报中文原因，存档不变。
    // 以前退卡会把现金写成 NaN，价格档会让收入变 NaN，租卡会排进一张到期那天抛错的订单，策略报英文的 “is not a function”。
    for (const key of ['toString', '__proto__', 'constructor']) {
      assert.equal(gpuAvailable(key, s.date, 'US'), false, key);
      rejects(s, [
        () => E.releaseGpu(s, key, 1, false), () => E.releaseGpu(s, key, 1, true), () => E.buyGpu(s, key, 64), () => E.buyGpu(s, key, 64, true),
        () => E.setProduct(s, 'api', { tier: key }), () => E.setProduct(s, 'api', { smallTier: key }),
        () => E.setPolicy(s, key, 'strict'), () => E.setPolicy(s, 'contentPolicy', key),
      ], /显卡型号和数量无效|没有这款卡|未知的价格档位|没有这种服务策略/);
    }
    assert.ok(Number.isFinite(s.cash) && Number.isFinite(E.simulateService(s).total));
    // 手里没有的股票卖不出去，也不能留下 NaN 持仓。
    const before = clone(s);
    E.trade(s, 'NVDA', -100);
    assert.deepEqual(s, before, '无持仓卖出不改存档');
    // 正常的值照样能用。
    E.setInferShare(s, 0.5);
    assert.equal(s.inferShare, 0.5);
    E.setProduct(s, 'api', { tier: 'premium' });
    assert.equal(s.products.api.tier, 'premium');
    E.setPolicy(s, 'contentPolicy', 'strict');
    assert.equal(s.service.contentPolicy, 'strict');
    E.setRouting(s, 'full');
    E.trade(s, 'NVDA', 1e6);
    assert.ok(s.market.holdings.NVDA > 0);
    E.trade(s, 'NVDA', -1e15);
    assert.equal(s.market.holdings.NVDA, undefined, '全部卖出后清掉持仓');
  });

  it('setInferShare(NaN) 被拒以后，训练算力和推理算力仍是原来的有限数', () => {
    const s = fresh();
    const train = E.trainFlops(s), infer = E.inferGpuEq(s);
    assert.throws(() => E.setInferShare(s, NaN));
    assert.ok(Number.isFinite(E.trainFlops(s)) && E.trainFlops(s) === train);
    assert.equal(E.inferGpuEq(s), infer);
  });

  it('买卡、租卡、走私下单只收正整数张数，失败不扣钱、不占配额、不下单', () => {
    const s = fresh();
    for (const rent of [false, true]) rejects(s, [NaN, Infinity, -2, 0, 1.5, '64'].map(n => () => E.buyGpu(s, 'H100', n, rent)), /正整数/);
    const cn = fresh('deepseek', 'y2025', 3);
    assert.ok(E.smuggleOffers(cn).some(o => o.id === 'H100'));
    rejects(cn, [NaN, Infinity, -64, 0, 2.5, '64'].map(n => () => E.buySmuggled(cn, 'H100', n)), /正整数/);
  });

  it('预训练立项拒绝 NaN、无穷、非正数和字符串，失败不改存档；界面的检查给出原因', () => {
    const good = { total: 7, active: 7, arch: 'dense', tokens: 1, open: true };
    const bad = [
      { ...good, tokens: NaN }, { ...good, tokens: Infinity }, { ...good, tokens: 0 }, { ...good, tokens: -1 },
      { ...good, total: -7, active: -7 }, { ...good, total: 0, active: 0 },
      { ...good, total: NaN, active: NaN }, { ...good, total: Infinity, active: Infinity },
      { ...good, total: '7', active: '7' }, { ...good, tokens: '1' },
    ];
    const s = fresh('gpt', 'y2025', 88);
    assert.ok(E.projectCheck(s, good).ok, '正常配置能立项');
    for (const cfg of bad) {
      const c = E.projectCheck(s, cfg);
      assert.equal(c.ok, false, JSON.stringify(cfg));
      assert.match(c.reason, /token|0\.5B/);
    }
    rejects(s, bad.map(cfg => () => L.startProject(s, cfg)));
    // 非对话模态只看规模和 token。
    const img = fresh('midjourney', 'y2024', 5);
    const scaleId = SCALES.image.find(x => E.projectCheck(img, { scaleId: x.id, tokens: 1 }).ok).id;
    rejects(img, [NaN, 0, -1, '1'].map(tokens => () => L.startProject(img, { scaleId, tokens })), /token/);
  });

  it('蒸馏立项同样拒绝坏的参数量和 token', () => {
    const s = fresh('deepseek', 'y2025', 9);
    const good = { teacher: 'self', total: 14, active: 14, arch: 'dense', tokens: 1.5, open: true };
    assert.doesNotThrow(() => L.startDistill(clone(s), good), '正常配置能立项');
    rejects(s, [
      { ...good, tokens: NaN }, { ...good, tokens: Infinity }, { ...good, tokens: -1 }, { ...good, tokens: '1.5' },
      { ...good, total: NaN, active: NaN }, { ...good, total: '14', active: '14' }, { ...good, total: 0, active: 0 },
    ].map(cfg => () => L.startDistill(s, cfg)), /token|0\.5B/);
  });

  it('资金告急时“卖掉三成 GPU”：某种卡只剩一两张时跳过，不会因为卖 0 张而报错', () => {
    const s = fresh('qwen', 'y2024', 4);
    s.gpus.owned = { A100: 100, H800: 1 };
    s.queue = [{ kind: 'event', id: 'runway', params: {} }];
    assert.doesNotThrow(() => E.resolveEvent(s, 'sell_gpu'));
    assert.deepEqual(s.gpus.owned, { A100: 70, H800: 1 });
  });
});

describe('出租显卡按实有卡数算', () => {
  it('出租张数可以设到 0 到全部卡数之间', () => {
    const s = fresh();
    const total = E.gpuCount(s);
    for (const n of [0, 64, total]) {
      E.setProduct(s, 'gpu_lease', { gpus: n });
      assert.equal(E.leaseGpus(s), n);
    }
  });

  it('存档里写坏的出租张数（负数、超额、NaN）不会把训练算力放大，读档时归位', () => {
    const s = fresh();
    const train = E.trainFlops(s);
    s.products.gpu_lease.gpus = -1e6;
    assert.equal(E.leaseGpus(s), 0);
    assert.equal(E.trainFlops(s), train, '负数出租不放大训练算力');
    s.products.gpu_lease.gpus = 1e9;
    assert.equal(E.leaseGpus(s), E.gpuCount(s));
    assert.ok(Number.isFinite(E.trainFlops(s)) && E.trainFlops(s) <= train);
    const old = clone(s);
    old.v = 3;
    old.products.gpu_lease.gpus = -5;
    old.inferShare = null;
    const m = loadSave(old);
    assert.equal(m.products.gpu_lease.gpus, 0);
    assert.equal(m.inferShare, 0.3);
    assert.ok(Number.isFinite(E.trainFlops(m)));
  });

  it('卖掉显卡以后，超出的旧出租配置不再收租金；一张卡都没有就没有租金', () => {
    const s = fresh();
    const total = E.gpuCount(s);
    E.setProduct(s, 'gpu_lease', { gpus: total });
    const perCard = E.simulateService(s).revenue.gpu_lease / total;
    assert.ok(perCard > 0);
    E.releaseGpu(s, 'H100', total / 2, false);
    assert.equal(s.products.gpu_lease.gpus, total, '旧配置还在');
    assert.equal(E.leaseGpus(s), total / 2);
    const half = E.simulateService(s).revenue.gpu_lease;
    assert.ok(Math.abs(half - perCard * total / 2) < 1e-6 * half, '只按手里的卡收租');
    sellAll(s);
    assert.equal(E.gpuCount(s), 0);
    assert.equal(E.leaseGpus(s), 0);
    assert.equal(E.simulateService(s).revenue.gpu_lease || 0, 0);
    assert.equal(E.trainFlops(s), 0);
  });
});

describe('服务结算的两处小修', () => {
  it('还没发布模型的公司出租显卡，照样收租金，月结入账', () => {
    const s = fresh('qwen', 'y2023', 12);
    assert.equal(E.liveModel(s), null);
    E.setProduct(s, 'gpu_lease', { gpus: 64 });
    const out = E.simulateService(s);
    assert.ok(out.revenue.gpu_lease > 0);
    assert.equal(out.total, out.revenue.gpu_lease);
    assert.equal(out.revenue.api || 0, 0);
    advanceMonth(s);
    if (!E.liveModel(s)) assert.ok(s.history.at(-1).revenue > 0, '月报里有出租收入');
  });

  it('有需求但一张推理卡都没有：请求全部失败（429 取 1），API 收不到钱', () => {
    const s = fresh();
    assert.ok(E.liveModel(s) && s.products.api.on);
    sellAll(s);
    const out = E.simulateService(s);
    assert.ok(out.needGpu > 0);
    assert.equal(out.capGpu, 0);
    assert.equal(out.r429, 1);
    assert.equal(out.revenue.api || 0, 0);
  });
});

describe('走私卡记账', () => {
  // 一天天推进到这张订单到货或被扣（订单从 orders 里消失）；当天新冒出来的事件先不处理。
  const settle = (s, order) => {
    for (let i = 0; i < 90 && s.orders.includes(order); i++) { resolveAll(s); E.tickDay(s); }
    assert.ok(!s.orders.includes(order), '90 天内应当到货或被扣');
  };

  it('在途不算持有，到货只入库一次；途中被扣不留下虚假库存', () => {
    const outcomes = new Set();
    for (let seed = 1; seed <= 40 && outcomes.size < 2; seed++) {
      const s = fresh('deepseek', 'y2025', seed);
      const before = s.gpus.owned.H100 || 0;
      E.buySmuggled(s, 'H100', 64);
      const order = s.orders.find(o => o.kind === 'smuggle');
      assert.equal(s.gray.owned.H100 || 0, 0, '在路上的卡不算持有');
      settle(s, order);
      const arrived = (s.gpus.owned.H100 || 0) - before;
      assert.ok(arrived === 0 || arrived === 64, `到货 ${arrived}`);
      assert.equal(s.gray.owned.H100 || 0, arrived, '持有的走私卡就是实际到手的');
      outcomes.add(arrived);
    }
    assert.ok(outcomes.has(64), '有到货的局');
    assert.ok(outcomes.has(0), '有被扣的局');
  });

  it('旧档：下单时已记成持有的在途走私卡，读档时扣回来，到货后只记一次', () => {
    const s = fresh('deepseek', 'y2025', 2);
    E.buySmuggled(s, 'H100', 64);
    const old = clone(s);
    old.v = 3;
    // 旧版存档的样子（v3）：下单时就记进了持有，订单上没有 held 标记；另外已经到手 64 张。
    old.gray.owned.H100 = 128;
    old.gpus.owned.H100 = 64;
    delete old.orders.find(o => o.kind === 'smuggle').held;
    const m = loadSave(old);
    assert.equal(m.gray.owned.H100, 64, '在途的 64 张扣回去');
    assert.equal(m.orders.find(o => o.kind === 'smuggle').held, false);
    assert.equal(loadSave(clone(m)).gray.owned.H100, 64, '再读一次不会重复扣');
    settle(m, m.orders.find(o => o.kind === 'smuggle'));
    assert.ok([64, 128].includes(m.gray.owned.H100), `到货后 ${m.gray.owned.H100}（重复记账会是 192）`);
    assert.equal(m.gray.owned.H100, m.gpus.owned.H100, '持有的走私卡就是手里的这些');
  });

  it('机房失火烧掉的卡里有走私卡时，走私账跟着减少', () => {
    const s = fresh('deepseek', 'y2025', 2);
    s.gpus.owned = { H100: 100, H800: 50 };
    s.gray = { owned: { H100: 100 }, bought: {}, month: s.date, heat: 0, total: 100, spent: 0 };
    s.queue = [{ kind: 'event', id: 'dc_fire', params: { lost: 30 } }];
    E.resolveEvent(s, E.currentEvent(s).choices[0].id);
    assert.equal(s.gpus.owned.H100, 70);
    assert.equal(s.gray.owned.H100, 70);
  });
});

describe('文案与主屏', () => {
  it('备案提示里的安全门槛和实际门槛一致', () => {
    const s = fresh('qwen', 'y2024', 6);
    s.service.filing = 'none';
    s.products.chat.on = false;
    const r = E.setProduct(s, 'chat', { on: true });
    assert.equal(s.service.filing, 'pending');
    assert.match(r.note, new RegExp(`不低于 ${E.FILING_SAFETY}。`));
    assert.equal(E.FILING_SAFETY, 50);
  });

  it('董事会目标说明照实际规则写：宽限后记警告，三次才换人', () => {
    const flow = readSrc('../../src/career/ui/flow.js');
    assert.ok(!flow.includes('项目终止'));
    assert.match(flow, /宽限后还没达成，记一次警告。警告攒到三次，董事会就会更换管理层/);
  });

  it('主屏芯片条和新闻条顺着排；样式表版本号 v=4，背景图预加载还在', () => {
    const css = readSrc('../../src/career/css/home.css');
    const rule = sel => css.match(new RegExp(`^${sel.replace('.', '\\.')} \\{([^}]*)\\}`, 'm'))[1];
    for (const sel of ['.stage-chips', '.ticker']) {
      assert.match(rule(sel), /position: relative/, sel);
      assert.doesNotMatch(rule(sel), /absolute|top:/, sel);
    }
    const html = readSrc('../../index.html');
    // 样式拆成 src/career/css/ 下的几个文件，每个链接都带 v=4。
    const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]);
    assert.ok(sheets.length >= 9 && sheets.every(h => /^\.\/src\/career\/css\/[\w-]+\.css\?v=4$/.test(h)), sheets.join(' '));
    assert.match(html, /<link rel="preload" as="image" href="\.\/assets\/thumbs\/bg-sunlit-atelier\.webp" \/>/);
  });

  it('手机上新闻条和芯片条左边对齐：断点里的 .ticker 间距写在基础规则之后，真的生效', () => {
    // 样式拆在 src/career/css/ 里：按 index.html 的顺序接起来再算。
    const css = [...readSrc('../../index.html').matchAll(/href="\.\/(src\/career\/css\/[\w-]+\.css)/g)].map(m => readSrc(`../../${m[1]}`)).join('\n');
    // margin / padding 写成“上 左右 下”，第二项就是左右留白。
    const side = (sel, prop, width) => cssTokens(cssAt(css, sel, width)[prop])[1];
    assert.equal(cssAt(css, '.ticker', 1440).margin, '7px 12px 0');
    assert.equal(side('.stage-chips', 'padding', 1440), '12px');
    // 以前这条写在 480px 断点里、排在基础 .ticker 前面，被盖掉了：手机上芯片条 8px、新闻条还是 12px。
    assert.equal(cssAt(css, '.ticker', 390).margin, '5px 8px 0');
    assert.equal(side('.stage-chips', 'padding', 390), '8px');
    assert.equal(side('.ticker', 'margin', 390), side('.stage-chips', 'padding', 390), '两条左边对齐');
  });
});
