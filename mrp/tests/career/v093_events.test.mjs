// v0.9.3 合并 M6：服务页“当前配置收入预估”（审查 B5，先修 G4-11）和超事件真实操作（审查 B6，规格 F6 的 A6）。
// 前 9 条迁自外部 v0.9.2 改动包 test_event_actions.mjs，按我们的引擎改写：禁用原因按我们的文案匹配；
// “调拨算力”那条按 G5-9 补上训练算力下降的断言；加租那条补上“开通后负载回到 85% 以下”（按负载定张数）。
// 改动包里“算力下单拒绝非整数”那条已由 M1 的 test_v093_fixes.mjs 覆盖，不重复迁。
// 其余按先修补写：不积压补演、旧档丢弃 superEarned、预估只读、预估卡格式。
// 审查遗留修复补了三条：加租按实际能多出的推理和在途订单定张数、候选卡租不到时换卡、命令白名单读规格的 SUPER_ACTIONS。
// 复核时改了一处：在途订单只扣这批开通前就到的，交货期几个月的买卡不扣。
import { describe, it } from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { loadSave } from '../helpers/career_util.mjs';
import { SUPER_EVENTS } from '../../src/career/data/super.js';
import { RENT_LEAD } from '../../src/career/data/supply.js';
import { addDays } from '../../src/career/sim/clock.js';
import { gpuRentable } from '../../src/career/data/core.js';
import { resolveAll, advanceMonth } from '../helpers/career_bot.mjs';

const clone = v => JSON.parse(JSON.stringify(v));
const readSrc = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
// 开局后直接把一个超事件排到队首（不走触发条件，只测选项）。
const eventGame = (id, char = 'deepseek', scenario = 'y2025') => {
  const s = E.createGame(char, scenario, 71);
  s.queue = [{ kind: 'super', id, params: {} }];
  return s;
};
const option = (s, id) => E.currentEvent(s).choices.find(c => c.id === id);
function freeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const x of Object.values(v)) freeze(x); }
  return v;
}

describe('超事件选项是真实操作（审查 B6）', () => {
  it('加租：按现在的负载下租卡订单，开通前不加算力、不收虚构的扩容费；开通后负载回到 85% 以下', () => {
    const s = eventGame('super_router', 'perplexity', 'y2024');
    const cash = s.cash, gpus = clone(s.gpus), rent = E.monthlyCosts(s).rented;
    assert.ok(E.previewService(s).util > 1, '这个开局一上来就过载');
    const hint = option(s, 'scale').hint;
    const text = E.resolveEvent(s, 'scale').text;
    const order = s.orders.at(-1);
    assert.equal(order.kind, 'rent');
    assert.ok(order.n > 0 && order.n % 64 === 0);
    assert.equal(order.eta, addDays(s.day, RENT_LEAD));
    assert.match(hint, new RegExp(`租 ${order.n} 张`));
    assert.equal(s.cash, cash);
    assert.deepEqual(s.gpus, gpus);
    assert.equal(E.monthlyCosts(s).rented, rent);
    assert.match(text, /开通前算力不变/);
    assert.match(text, new RegExp(String(order.n)));
    // 直接跳到开通那天，避开中间的随机事件（同一个月里，不跨月结）。
    s.queue = []; s.scheduled = []; s.day = order.eta;
    E.tickDay(s);
    assert.equal(s.gpus.rented[order.ref], (gpus.rented[order.ref] || 0) + order.n);
    assert.ok(E.monthlyCosts(s).rented > rent);
    assert.ok(!s.orders.includes(order));
    const after = E.previewService(s);
    assert.ok(after.util <= 0.85 && after.r429 === 0, `开通后负载 ${after.util}`);
  });

  it('加租按多租的卡实际能多出多少推理定张数：健康度、量化或蒸馏分流、出租划走的卡都算进去，租完负载正好压到八成以下', () => {
    // 以前单卡按“推理能力 × 推理份额”算：量化分流时多租（负载只剩六成），健康度 30 时少租（开通后还有 87%、被拒 3%）。
    const cases = {
      原样: () => {}, 量化分流: s => { s.service.routing = 'quant_open'; }, 蒸馏分流: s => { s.service.routing = 'distill_open'; s.inferShare /= 2; },
      健康度30: s => { s.health = 30; }, 出租两成卡: s => { E.setProduct(s, 'gpu_lease', { gpus: Math.floor(E.gpuCount(s) * 0.2) }); },
    };
    for (const [name, setup] of Object.entries(cases)) {
      const s = eventGame('super_router', 'perplexity', 'y2024');
      setup(s);
      const before = clone(s);
      E.resolveEvent(s, 'scale');
      const { ref, n } = s.orders.at(-1);
      // 在下单前的局面上假装多了 k 张这款卡，看负载。
      const utilWith = k => { const t = clone(before); t.gpus.rented[ref] = (t.gpus.rented[ref] || 0) + k; return E.previewService(t).util; };
      assert.ok(E.previewService(before).util > 0.8, `${name}：一上来就过载`);
      assert.ok(utilWith(n) <= 0.8, `${name}：租 ${n} 张后负载 ${utilWith(n)}`);
      if (n > 64) assert.ok(utilWith(n - 64) > 0.8, `${name}：少租 64 张也够，说明租多了`);
    }
    // 卖过卡、出租张数还停在原来的数：新租的卡全被划去出租，推理能力不涨，就不让借剧情租，免得把配额租满。
    const s = eventGame('super_router', 'perplexity', 'y2024');
    s.products.gpu_lease.gpus = E.gpuCount(s) + 10000;
    assert.match(option(s, 'scale').disabled, /划去出租/);
    assert.throws(() => E.resolveEvent(s, 'scale'), /划去出租/);
  });

  it('这批开通前就到的租卡、买卡先扣掉：同一个月常规事件刚加租过，超事件不按同一个缺口再租一遍；更晚才到的买卡不扣，提示里说一句', () => {
    const base = eventGame('super_router', 'perplexity', 'y2024');
    const plain = clone(base);
    E.resolveEvent(plain, 'scale');
    const full = plain.orders.at(-1).n;
    assert.ok(full > 64);
    // 常规事件 e429 先租了一批（同一个月、同一个缺口），超事件再看：已经够了，只按最少的 64 张下单，提示可以先观望。
    const s = clone(base);
    s.queue = [{ kind: 'event', id: 'e429', params: { r429: 20 } }, ...s.queue];
    E.resolveEvent(s, 'rent');
    const first = s.orders.at(-1);
    assert.equal(first.kind, 'rent');
    const hint = option(s, 'scale').hint;
    assert.match(hint, new RegExp(`已有 ${first.n} 张在路上，这批开通前就到，算上它们负载不到八成`));
    E.resolveEvent(s, 'scale');
    assert.equal(s.orders.at(-1).n, 64);
    // 只在路上一部分、开通前就到：张数扣掉这些（租的、买的都算），提示说已经扣掉了。
    const opens = addDays(base.day, RENT_LEAD);
    for (const rent of [true, false]) {
      const t = clone(base);
      E.buyGpu(t, 'H100', 64, rent);
      // 买卡正常要等几个月；这里假装这批货下周就到。
      if (!rent) t.orders.find(o => o.kind === 'gpu').eta = addDays(base.day, RENT_LEAD - 3);
      assert.match(option(t, 'scale').hint, /已有 64 张在路上，这批开通前就到，张数已经扣掉了这些/);
      assert.doesNotMatch(option(t, 'scale').hint, /另有/);
      E.resolveEvent(t, 'scale');
      assert.equal(t.orders.filter(o => o.kind === 'rent').at(-1).n, full - 64, rent ? '在路上的租卡' : '开通前就到的买卡');
    }
    // 买卡要等几个月才到（这里是 H100，2024 年初交货期半年）：帮不上眼下这一阵，张数照满额算，提示里说一句“没算进去”。
    // 以前连这种也扣掉，过载的服务会被劝“先观望”，在交货前一直拒请求。
    const t = clone(base);
    E.buyGpu(t, 'H100', 64);
    assert.ok(t.orders.find(o => o.kind === 'gpu').eta > opens);
    const late = option(t, 'scale').hint;
    assert.match(late, /另有 64 张要等这批开通以后才到，没算进去/);
    assert.doesNotMatch(late, /已有|先观望/);
    E.resolveEvent(t, 'scale');
    assert.equal(t.orders.filter(o => o.kind === 'rent').at(-1).n, full, '更晚才到的买卡不扣');
    // 没有在路上的卡就不提。
    assert.doesNotMatch(option(clone(base), 'scale').hint, /在路上|另有/);
  });

  it('加急候选表里的卡租不到时，加租退回到手动租得到、推理最强的一款：中国公司 2023 年中租 H800，美国公司 2023 年初租 A100', () => {
    const cn = eventGame('super_router', 'qwen', 'y2023');
    cn.date = '2023-07'; cn.day = '2023-07-05';
    const us = eventGame('super_router', 'claude', 'y2023');
    for (const [s, want] of [[cn, 'H800'], [us, 'A100']]) {
      assert.ok(!gpuRentable(E.bestRentGpu(s), s.date, s.company.country, s.flags.overseasRent), '候选表里的卡这时候租不到');
      assert.doesNotThrow(() => E.buyGpu(clone(s), want, 64, true), `手动能租 ${want}`);
      assert.equal(option(s, 'scale').disabled, '', '不再写“现在租不到卡”');
      assert.match(option(s, 'scale').hint, new RegExp(`租 64 张 ${want}`));
      E.resolveEvent(s, 'scale');
      assert.deepEqual([s.orders.at(-1).kind, s.orders.at(-1).ref], ['rent', want]);
    }
  });

  it('提价：旗舰 API 真的上调一档，客户按新价格重算需求；不送估值，也不改上月报表', () => {
    const s = eventGame('super_router');
    s.products.api.on = true; s.products.api.tier = 'budget';
    const valuation = s.valuation, cash = s.cash, brand = s.brand, last = clone(s.service.last);
    const before = E.previewService(s);
    const text = E.resolveEvent(s, 'price').text;
    assert.equal(s.products.api.tier, 'standard');
    assert.equal(s.valuation, valuation);
    assert.equal(s.cash, cash);
    assert.ok(Math.abs(s.brand - brand * 0.97) < 1e-9);
    assert.deepEqual(clone(s.service.last), last);
    const after = E.previewService(s);
    assert.ok(after.needGpu < before.needGpu, '涨价后请求变少，负载应当下降');
    assert.notEqual(after.revenue.api, before.revenue.api);
    assert.match(text, /普惠.*标准/);
  });

  it('已是最高价、租卡配额用完时选项置灰并写原因，失败不改存档；不花钱的观望照样能走', () => {
    const s = eventGame('super_router');
    s.products.api.tier = 'premium';
    s.quota[`rent|${s.date}`] = 1e9;
    assert.match(option(s, 'price').disabled, /最高/);
    assert.match(option(s, 'scale').disabled, /配额/);
    const snapshot = clone(s);
    assert.throws(() => E.resolveEvent(s, 'scale'), /配额/);
    assert.deepEqual(clone(s), snapshot);
    assert.throws(() => E.resolveEvent(s, 'price'), /最高/);
    assert.deepEqual(clone(s), snapshot);
    assert.equal(option(s, 'hold').disabled, '');
    E.resolveEvent(s, 'hold');
    assert.equal(s.queue.length, 0);
    assert.equal(s.cash, snapshot.cash);
  });

  it('没开 API 时不能借剧情提价', () => {
    const s = eventGame('super_router');
    s.products.api.on = false;
    assert.match(option(s, 'price').disabled, /还没开通 API/);
    assert.throws(() => E.resolveEvent(s, 'price'), /还没开通 API/);
  });

  it('保障服务：自用算力中的服务占比加 10 个百分点，推理容量上升、训练算力下降（G5-9）；最多到 90%', () => {
    const s = eventGame('super_soldout');
    s.inferShare = 0.5;
    const cap = E.inferGpuEq(s), train = E.trainFlops(s);
    const text = E.resolveEvent(s, 'limit').text;
    assert.equal(s.inferShare, 0.6);
    assert.ok(E.inferGpuEq(s) > cap);
    assert.ok(E.trainFlops(s) < train, '调给服务的卡要从训练里出');
    assert.match(text, /自用算力中的服务占比/);
    // 不足 10 个点时只加到 90%；到了 90% 就不能再调，观望照样能选。
    s.queue = [{ kind: 'super', id: 'super_soldout' }];
    s.inferShare = 0.85;
    E.resolveEvent(s, 'limit');
    assert.equal(s.inferShare, 0.9);
    s.queue = [{ kind: 'super', id: 'super_soldout' }];
    assert.match(option(s, 'limit').disabled, /90%/);
    assert.equal(option(s, 'hold').disabled, '');
  });

  it('扩容和手动租卡共用每月租卡配额与在途订单', () => {
    const s = eventGame('super_soldout', 'rwkv');
    s.quota[`rent|${s.date}`] = 250;
    E.resolveEvent(s, 'expand');
    const order = s.orders.at(-1);
    assert.equal(order.kind, 'rent');
    assert.equal(order.n, 6);
    assert.equal(order.eta, addDays(s.day, RENT_LEAD));
    assert.equal(s.quota[`rent|${s.date}`], 256);
    assert.throws(() => E.buyGpu(s, order.ref, 64, true), /租不到更多卡/);
  });

  it('十倍估值采购：最多花一成现金，真的扣款、占季度配额，到货前不加卡，也不加技术积累', () => {
    const s = eventGame('super_tenx');
    const cash = s.cash, gpus = clone(s.gpus), know = s.know;
    E.resolveEvent(s, 'compute');
    const order = s.orders.at(-1);
    assert.equal(order.kind, 'gpu');
    assert.ok(order.cost > 0 && order.cost <= cash * 0.1);
    assert.equal(s.cash, cash - order.cost);
    assert.deepEqual(s.gpus, gpus);
    assert.equal(s.know, know, '采购不再凭空增加技术积累');
    assert.ok(order.eta > s.day);
    assert.equal(Object.entries(s.quota).find(([k]) => k.endsWith(`|${order.ref}`))?.[1], order.n);
  });

  it('现金不足时采购和广告都置灰，留着现金照样能走', () => {
    const s = eventGame('super_tenx');
    s.cash = 1;
    assert.match(option(s, 'compute').disabled, /现金不足/);
    assert.match(option(s, 'brand').disabled, /现金不足/);
    E.resolveEvent(s, 'hold');
    assert.equal(s.cash, 1);
    assert.equal(s.queue.length, 0);
  });

  it('反复查看超事件选项不扣钱、不占配额、不改存档', () => {
    for (const id of ['super_router', 'super_soldout', 'super_tenx']) {
      const s = eventGame(id), before = JSON.stringify(s);
      E.currentEvent(s); E.currentEvent(s);
      assert.equal(JSON.stringify(s), before, id);
    }
  });

  it('真实操作只用规格里登记过的命令（SUPER_ACTIONS）；这些事件都有不花钱的观望，选项不再凭空加估值、加技术积累', () => {
    // 白名单以规格 §1.3 的 balance.js 为准（P0.3a 的词表测试读它）；决定记录里的同一行要一致，super.js 实际用到的命令都得登记。
    const listed = file => JSON.parse(readSrc(file).match(/export const SUPER_ACTIONS = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
    const CMDS = listed('../../docs/spec/v1.0-spec.md');
    assert.deepEqual(listed('../../docs/spec/decisions-2026-10-21.md'), CMDS);
    const used = [...new Set(SUPER_EVENTS.flatMap(e => e.choices.filter(c => c.action).map(c => c.action.cmd)))];
    assert.deepEqual([...used].sort(), [...CMDS].sort(), '登记的命令就是 super.js 用到的这些');
    assert.match(readSrc('../../docs/spec/v1.0-spec.md'), new RegExp(`\\| \`SUPER_ACTIONS\` \\| ${CMDS.map(c => `\`${c}\``).join('、')} \\|`), '新常量一览表也要列全');
    const withAction = SUPER_EVENTS.filter(e => e.choices.some(c => c.action));
    assert.deepEqual(withAction.map(e => e.id), ['super_router', 'super_soldout', 'super_tenx']);
    for (const e of withAction) {
      for (const c of e.choices) {
        if (c.action) assert.ok(CMDS.includes(c.action.cmd), `${e.id}.${c.id}`);
        assert.ok(!('valuation' in (c.effects || {})) && !('rp' in (c.effects || {})), `${e.id}.${c.id} 还在凭空加估值或技术积累`);
      }
      const hold = e.choices.find(c => c.id === 'hold');
      assert.ok(hold && !hold.action && !hold.effects, `${e.id} 缺不花钱的观望`);
    }
  });
});

describe('超事件不积压补演（先修）', () => {
  it('读档丢掉 v0.9.2 的 superEarned；冷却期里达成的不记账，过后条件不成立也不补演', () => {
    let s = E.createGame('deepseek', 'y2025', 71);
    resolveAll(s);
    s.flags.superEarned = { super_tenx: { day: s.day, model: 'x', pop: 0 } };
    s.v = 3;   // v0.9.2 的存档结构版本是 v3
    s = loadSave(s);
    assert.equal(s.flags.superEarned, undefined);
    // 开局首月不触发超事件（P1.4，规格 E4）：当作已经过了第一个月。
    s.monthsPlayed = 1;
    // 让“绝境翻盘”的条件这个月成立；别的超事件当作已经演过，免得它们先占了这个月的名额。
    assert.notEqual(s.company.kind, 'division');
    for (const e of SUPER_EVENTS) if (e.id !== 'super_comeback') s.marks[`super:${e.id}`] = s.day;
    s.seen.runway = 1;
    s.flags.minVal = 1;
    const fired = (x = s) => !!x.marks['super:super_comeback']
      || [...x.queue, ...x.scheduled.map(q => q.item)].some(q => q?.id === 'super_comeback');
    // 对照：不在冷却期就会演。
    const control = clone(s);
    advanceMonth(control);
    assert.ok(fired(control), '对照局里绝境翻盘应当触发');
    // 还在两个月的冷却期里：不演，也不记下来留着以后补。
    s.flags.superLast = s.day;
    advanceMonth(s);
    assert.ok(!fired());
    assert.equal(s.flags.superEarned, undefined);
    // 冷却过了，条件已经不成立：不补演。
    delete s.seen.runway;
    s.flags.superLast = '2000-01-01';
    advanceMonth(s);
    assert.ok(!fired());
  });
});

describe('服务页收入预估只读（审查 B5）', () => {
  it('previewService 不写存档、不改上月报表、不动随机数：冻结的存档上也能算，调用前后存档 JSON 一致', () => {
    const s = E.createGame('deepseek', 'y2025', 71);
    resolveAll(s);
    s.service.last = { revenue: { api: 123 }, r429: 0.17, users: 10 };
    const before = JSON.stringify(s);
    const a = E.previewService(s), b = E.previewService(s, { api: { tier: 'premium' } });
    assert.equal(JSON.stringify(s), before);
    assert.ok(a.total > 0 && Number.isFinite(b.total));
    const frozen = freeze(clone(s));
    assert.deepEqual(E.previewService(frozen), a);
    assert.deepEqual(E.previewService(frozen, { api: { tier: 'premium' } }), b);
    assert.equal(JSON.stringify(frozen), before);
  });

  it('预估和月结是同一套定价和市场模型：临时改价等于在副本上真改价；月结入口照旧写上月报表', () => {
    const s = E.createGame('deepseek', 'y2025', 71);
    const c = clone(s);
    c.products.api.tier = 'premium';
    assert.deepEqual(E.previewService(s, { api: { tier: 'premium' } }), E.previewService(c));
    const out = E.simulateService(c);
    assert.equal(c.service.last, out);
    assert.deepEqual(out, E.previewService(s, { api: { tier: 'premium' } }));
  });

  it('服务页预估卡：金额用全站同一套格式（G4-11），三档对比只读；没在线模型时直接说明', async () => {
    // fmt.js 加载时要用 document.baseURI 拼美术地址；测试里给一个最小的替身。
    globalThis.document ??= { baseURI: 'http://localhost/' };
    const { renderPricingPreview } = await import('../../src/career/ui/pages/service.js');
    const { usd } = await import('../../src/career/ui/fmt.js');
    const s = E.createGame('deepseek', 'y2025', 71);
    s.products.api.on = false;
    const before = JSON.stringify(s);
    const html = renderPricingPreview(freeze(clone(s)));
    assert.ok(html.includes(usd(E.previewService(s).total)));
    for (const label of ['普惠', '标准', '旗舰']) assert.match(html, new RegExp(label));
    assert.match(html, /不会替你打开/);
    assert.match(html, /mini-kpis/);
    assert.doesNotMatch(html, /NaN|Infinity|undefined/);
    assert.doesNotMatch(html, /\$[\d.]+ [万亿]/, '金额不能再有“$2987.8 万”这种写法');
    assert.equal(JSON.stringify(s), before);
    const blank = renderPricingPreview(E.createGame('stepfun', 'y2024', 71));
    assert.match(blank, /还没有在线模型/);
    assert.doesNotMatch(blank, /NaN|Infinity|undefined/);
    // 不再自带一套格式化；.mini-kpis 有样式。
    assert.doesNotMatch(readSrc('../../src/career/ui/pages/service.js'), /const (money|esc|pct|finite) =/);
    assert.match(readSrc('../../src/career/css/office.css'), /\.mini-kpis \{/);
  });
});
