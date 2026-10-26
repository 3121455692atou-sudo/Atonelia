// 加成统一读数（P0.3a，规格 E3）：modifier(s, key) 在 50 个随机状态上和旧的 techMult、techPost、techCapBonus 完全一致（连浮点都一样）；
// 三个旧函数 P0.3b 已从 model.js 删掉（消费方都改读 modifier），这里照原样抄一份做对照；
// 词表含 sotaEase、不含 frontierEdge；按天缓存在技术变化时立即失效；registerModSource 登记的新来源会被读到。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { modifier, registerModSource, MOD_KEYS, isModKey, modKind, invalidateMods } from '../../src/career/sim/modifiers.js';
import { COMPANIES, SCENARIOS, TECHS, TECH_BY_ID, MODALITIES } from '../../src/career/data/core.js';
import { SPIRITS } from '../../src/career/data/spirits.js';
import { companyFile } from '../../src/career/data/companies/index.js';
import { quotaFor, RENT_QUOTA } from '../../src/career/data/supply.js';
import { researchSlots, researchSpeed, researchCheck, researchOptions, knowTick } from '../../src/career/sim/research.js';
import { simulateService, monthlyCosts, updateValuation, accrueComputeDay } from '../../src/career/sim/economy.js';
import { conditionalEvents } from '../../src/career/sim/events.js';
import { addSpirit } from '../../src/career/sim/strategy.js';
import { daysInMonth } from '../../src/career/sim/clock.js';
import { clone } from '../helpers/career_util.mjs';
import * as L from '../helpers/legacy_jobs.mjs';
// 本家树会带数值特质；只测技术来源或公共特质时先摘掉本家的（P3.T 起 gpt、claude 有本家树）。
const stripHome = s => { const home = companyFile(s.charId)?.spirits || {}; for (const id of Object.keys(s.strategy?.spirits || {})) if (home[id]) delete s.strategy.spirits[id]; return s; };

// 确定性的随机数，测试每次都一样。
function rng(seed) { let t = seed >>> 0; return () => { t = (t + 0x6D2B79F5) >>> 0; let x = Math.imul(t ^ (t >>> 15), t | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
// 旧的 techMult、techCapBonus、techPost（原来在 model.js）：照原样抄一份做对照。
function techMult(s, key) { let m = 1; for (const id of s.techs) { const v = TECH_BY_ID[id]?.effects?.[key]; if (typeof v === 'number') m *= v; } return m; }
function techCapBonus(s) { const out = {}; for (const id of s.techs) for (const [k, v] of Object.entries(TECH_BY_ID[id]?.effects?.cap || {})) out[k] = (out[k] || 0) + v; return out; }
function techPost(s, dim) { let m = 1; for (const id of s.techs) { const v = TECH_BY_ID[id]?.effects?.post?.[dim]; if (v) m *= v; } return m; }

function randomStates(n) {
  const r = rng(20261021), out = [];
  for (let i = 0; i < n; i++) {
    const c = COMPANIES[Math.floor(r() * COMPANIES.length)], sc = SCENARIOS[Math.floor(r() * SCENARIOS.length)];
    const s = E.createGame(c.id, sc.id, i + 1);
    // 只比“技术来源”这一层：把本家树带来的数值特质摘掉（P3.D 起 DeepSeek 等树会带 train、post、gpuQuota 等加成），
    // 留下国家说明特质和 g_sota 的三档（info 或只有 sotaEase），口径和 P2.2 时一致。
    if (s.strategy?.spirits) for (const id of Object.keys(s.strategy.spirits)) {
      const sp = SPIRITS[id];
      if (!sp || (!sp.info && !id.startsWith('g_sota_'))) delete s.strategy.spirits[id];
    }
    // 随机挑一批本模态的技术，顺序也打乱（乘的顺序要和 s.techs 一致）。
    const pool = TECHS.filter(t => t.mod === s.mod).map(t => t.id).filter(() => r() < 0.6);
    for (let k = pool.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [pool[k], pool[j]] = [pool[j], pool[k]]; }
    s.techs = pool;
    out.push(s);
  }
  return out;
}

describe('modifier 和旧的 techMult 一致', () => {
  it('50 个随机状态：train、infer、stability、dataQuality、legal、post.<维度>、cap.<维度> 逐项相等', () => {
    const states = randomStates(50);
    let n = 0;
    for (const s of states) {
      for (const k of ['train', 'infer', 'stability', 'dataQuality', 'legal']) { assert.equal(modifier(s, k), techMult(s, k), `${s.charId} ${k}`); n++; }
      const cap = techCapBonus(s);
      for (const d of MODALITIES[s.mod].dims.map(x => x.key)) {
        assert.equal(modifier(s, `post.${d}`), techPost(s, d), `${s.charId} post.${d}`);
        assert.equal(modifier(s, `cap.${d}`), cap[d] || 0, `${s.charId} cap.${d}`);
        n += 2;
      }
      // 技术不提供的键：乘法默认 1，加法默认 0。开局的特质（P2.2）只有国家说明特质（不带数值）和 g_sota 的一档（只有 sotaEase）。
      assert.equal(modifier(s, 'apiDemand'), 1);
      assert.ok([0.6, -0.3, -0.55].includes(modifier(s, 'sotaEase')), `${s.charId} sotaEase ${modifier(s, 'sotaEase')}`);
    }
    assert.ok(n > 50 * 15, `只比了 ${n} 项`);
    assert.ok(states.some(s => modifier(s, 'infer') > 1.5) && states.some(s => modifier(s, 'train') > 1), '随机状态里要有真带加成的');
  });
  it('同一天里学会新技术，读数立刻变（缓存跟着技术签名失效）', () => {
    const s = stripHome(E.createGame('gpt', 'y2025', 3));
    s.techs = s.techs.filter(id => id !== 'fp8');
    const before = modifier(s, 'train');
    s.techs.push('fp8');
    assert.equal(modifier(s, 'train'), techMult(s, 'train'));
    assert.ok(modifier(s, 'train') > before);
    invalidateMods(s);
    assert.equal(modifier(s, 'train'), techMult(s, 'train'));
  });
});

describe('加成键词表', () => {
  it('sotaEase 登记为加法键；frontierEdge 删除；不认识的键报错', () => {
    assert.ok(MOD_KEYS.includes('sotaEase') && modKind('sotaEase') === 'add');
    for (const k of ['strategySpeed', 'slots', 'releaseGapDays', 'cap.safety']) assert.equal(modKind(k), 'add', k);
    for (const k of ['train', 'brandGain', 'apiBrand', 'overseasMult', 'post', 'post.agent', 'distillTime', 'integrationOdds']) assert.equal(modKind(k), 'mult', k);
    assert.ok(!isModKey('frontierEdge') && !MOD_KEYS.includes('frontierEdge'));
    assert.throws(() => modifier(E.createGame('gpt', 'y2023', 1), 'frontierEdge'), /未知的加成键/);
  });
  it('registerModSource：新来源按登记顺序叠上去；扁平写法和嵌套写法都认，post.<维度> 叠上整体的 post', () => {
    const s = E.createGame('deepseek', 'y2025', 5);
    const base = { train: modifier(s, 'train'), safety: modifier(s, 'cap.safety'), agent: modifier(s, 'post.agent'), ease: modifier(s, 'sotaEase') };
    let on = false;
    registerModSource(x => (on && x === s ? [{ train: 1.5, 'cap.safety': 3, post: 1.05, 'post.agent': 1.08, sotaEase: 0.6 }] : []), { id: 'test_spirits', sig: () => String(on) });
    assert.equal(modifier(s, 'train'), base.train);
    on = true;
    assert.equal(modifier(s, 'train'), base.train * 1.5);
    assert.equal(modifier(s, 'cap.safety'), base.safety + 3);
    assert.equal(modifier(s, 'post.agent'), base.agent * 1.05 * 1.08);
    assert.equal(modifier(s, 'sotaEase'), base.ease + 0.6);
    assert.throws(() => registerModSource(() => [], { id: 'test_spirits' }), /已经登记/);
  });
});

// ---------- E3 的读取点（G2 遗留修补 C，主会话决定 5） ----------
// 特质和限时加成写的键，每个都要有代码读到：研究槽、研究速度、技术积累、发布间隔、买卡和租卡配额、各项需求、成本、估值、接入概率。
// 限时加成（s.boosts）能带任何键，用它注入一个值；有现成特质的，再用特质本身验一遍描述里承诺的效果。
const FAR = '2099-12-31';
const withBoost = (s, mods) => { const t = clone(s); (t.boosts ??= []).push({ ...mods, until: FAR, src: 'test' }); return t; };
const withSpirit = (s, id) => { const t = clone(s); addSpirit(t, id); return t; };
const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${msg}：${a} ≠ ${b}`);

describe('E3 读取点：特质承诺的加成真的生效', () => {
  it('slots：研究槽数加上特质和限时加成的 slots，原来满了的现在还能再开一项；至少 1 个。推理攻坚组（g_rl_team）P2.4a 起改成作业位 +1（T8）', () => {
    const s = E.createGame('qwen', 'y2024', 1);
    const base = researchSlots(s);
    assert.equal(SPIRITS.g_rl_team.mods.jobSlots, 1);
    assert.equal(E.jobSlots(withSpirit(s, 'g_rl_team')), E.jobSlots(s) + 1);
    assert.equal(researchSlots(withSpirit(s, 'g_rl_team')), base, '不再加研究槽');
    const t = withBoost(s, { slots: 1 });
    assert.equal(researchSlots(t), base + 1);
    assert.equal(researchSlots(withBoost(s, { slots: -10 })), 1, '至少 1 个');
    const tech = researchOptions(s).find(x => x.check.ok)?.t;
    assert.ok(tech, '要有一项能开始研究的技术');
    const full = x => { x.research = Array.from({ length: base }, (_, i) => ({ id: `dummy${i}`, done: 0, need: 100, level: 'paper', since: x.day })); return x; };
    assert.match(researchCheck(full(clone(s)), tech).reason, /研究槽满了/);
    assert.equal(researchCheck(full(t), tech).ok, true);
  });
  it('research、knowGain：研究速度、技术积累的日增长乘上特质的值（自研底座 gs_self_built 研究 ×1.1）', () => {
    const s = E.createGame('deepseek', 'y2025', 1);
    L.setFocus(s, { kind: 'research' });
    near(researchSpeed(withSpirit(s, 'gs_self_built')), researchSpeed(s) * SPIRITS.gs_self_built.mods.research, 'gs_self_built');
    near(researchSpeed(withBoost(s, { research: 1.3 })), researchSpeed(s) * 1.3, 'research ×1.3');
    const a = clone(s), b = withBoost(s, { knowGain: 1.5 });
    const k0 = a.know;
    knowTick(a);
    knowTick(b);
    assert.ok(a.know > k0);
    near(b.know - k0, (a.know - k0) * 1.5, 'knowGain ×1.5');
  });
  it('releaseGapDays：两次发布的间隔是 14 天加特质的值；快速迭代（g_move_fast）少等 4 天；不低于 0', () => {
    const s = E.createGame('gpt', 'y2023', 1);
    s.deploy = [];
    const w = E.workingModel(s);
    Object.assign(w, { stage: 'post', postDays: 10, relDays: 0 });
    assert.equal(E.releaseBlock(s), '再后训练 4 天才能送评');
    assert.equal(SPIRITS.g_move_fast.mods.releaseGapDays, -4);
    const t = withSpirit(s, 'g_move_fast');
    assert.equal(E.releaseBlock(t), '');
    E.workingModel(t).postDays = 9;
    assert.equal(E.releaseBlock(t), '再后训练 1 天才能送评');
    const u = withBoost(s, { releaseGapDays: -30 });
    E.workingModel(u).postDays = 0;
    assert.equal(E.releaseBlock(u), '', '间隔不低于 0：刚开始后训练也能发');
    assert.equal(E.releaseBlock(withBoost(s, { releaseGapDays: 6 })), '再后训练 10 天才能送评');
  });
  it('gpuQuota、rentQuota：买卡配额（按 64 张取整）、每月租卡配额乘特质的值（自建集群 gs_own_cluster 买卡 ×1.5）；下单也按新配额', () => {
    const s = E.createGame('kimi', 'y2025', 1);
    // P3.T 起 kimi 有了本家特质（预完成的节点会带上买卡加成），这里只测通用特质，先把本家特质摘掉。
    s.strategy.spirits = {};
    s.quota = {};
    const id = 'H20';
    const base = quotaFor(s.company.tier, id, s.date);
    assert.equal(E.gpuOrderInfo(s, id).left, base);
    const t = withSpirit(s, 'gs_own_cluster');
    assert.equal(E.gpuOrderInfo(t, id).left, Math.round(base * 1.5 / 64) * 64);
    assert.ok(E.gpuOrderInfo(t, id).left > base);
    assert.equal(E.gpuOrderInfo(withBoost(s, { rentQuota: 1.6 }), id, true).left, Math.round(RENT_QUOTA[s.company.tier] * 1.6));
    assert.equal(E.gpuOrderInfo(s, id, true).left, RENT_QUOTA[s.company.tier]);
    t.cash = 1e12;
    assert.equal(E.buyGpu(t, id, 1e6).n, Math.round(base * 1.5 / 64) * 64, '下单最多买到新配额');
  });
  it('chatDemand、subDemand、apiDemand、codingDemand：simulateService 的对话用户、付费订阅、API、Coding Plan 跟着乘', () => {
    const s = E.createGame('claude', 'y2026', 1);
    const run = x => simulateService(x, { commit: false });
    const a = run(s);
    assert.ok(a.users > 0 && a.apiTokens > 0 && a.codingUsers > 0 && a.revenue.chat > 0);
    near(run(withBoost(s, { chatDemand: 1.2 })).users, a.users * 1.2, 'chatDemand');
    near(run(withBoost(s, { apiDemand: 1.3 })).apiTokens, a.apiTokens * 1.3, 'apiDemand');
    near(run(withBoost(s, { codingDemand: 1.25 })).codingUsers, a.codingUsers * 1.25, 'codingDemand');
    // 付费订阅只改收入，不改用户和用量，429 不变，对话收入正好乘上去。
    const sub = run(withBoost(s, { subDemand: 1.15 }));
    near(sub.users, a.users, 'subDemand 不改用户数');
    near(sub.revenue.chat, a.revenue.chat * 1.15, 'subDemand');
    // 开发者 API（gs_dev）、会员做得好（gs_subs）：特质本身。
    near(run(withSpirit(s, 'gs_dev')).apiTokens, a.apiTokens * SPIRITS.gs_dev.mods.apiDemand, 'gs_dev');
    const subs = run(withSpirit(s, 'gs_subs'));
    near(subs.users, a.users * SPIRITS.gs_subs.mods.chatDemand, 'gs_subs 对话');
    // 其他模态：会员订阅乘 subDemand（用户数跟着收入），API 乘 apiDemand（只开 API 时推理需求跟着收入）。
    const m = E.createGame('suno', 'y2026', 1);
    const b = run(m);
    assert.ok(b.users > 0);
    near(run(withBoost(m, { subDemand: 1.2 })).users, b.users * 1.2, '会员订阅');
    m.products.subscription.on = false;
    const c = run(m);
    assert.ok(c.needGpu > 0);
    near(run(withBoost(m, { apiDemand: 1.4 })).needGpu, c.needGpu * 1.4, '其他模态的 API');
  });
  it('cost：工资、自有卡运维、云上租金乘特质的值（精打细算 gs_lean ×0.9），官司费、防蒸馏风控费不打折；逐日账本跟着按新费率记', () => {
    const s = E.createGame('kimi', 'y2025', 1);
    s.gpus.rented = { H800: 256 };
    s.service.antiDistill = 'strict';
    s.legal.cases = [{ fighting: true, fee: 1e6 }];
    const a = monthlyCosts(s), t = withSpirit(s, 'gs_lean'), b = monthlyCosts(t);
    const f = SPIRITS.gs_lean.mods.cost;
    assert.ok(a.staff > 0 && a.owned > 0 && a.rented > 0);
    for (const k of ['staff', 'owned', 'rented']) near(b[k], a[k] * f, k);
    assert.equal(b.legal, a.legal);
    assert.equal(b.risk, a.risk);
    assert.equal(t.computeLedger.days,0,'新局已显式建立空账本');
    accrueComputeDay(t);
    near(t.computeLedger.owned / t.computeLedger.days, b.owned / daysInMonth(t.date), '账本的日费率');
  });
  it('valuation：估值目标的业务部分乘特质的值，现金部分不乘', () => {
    const s = E.createGame('kimi', 'y2025', 1);
    const v0 = s.valuation, rev = 2e8;
    const a = clone(s), b = withBoost(s, { valuation: 1.2 });
    updateValuation(a, rev);
    updateValuation(b, rev);
    const target = x => (x.valuation - 0.78 * v0) / 0.22 - s.cash * 0.6;
    assert.ok(a.valuation > s.valuationFloor && b.valuation > a.valuation);
    near(target(b), target(a) * 1.2, 'valuation ×1.2');
  });
  it('integrationOdds：编程工具找上门的概率乘特质的值（接入编程工具 gs_tools ×1.5）', () => {
    const s = stripHome(E.createGame('claude', 'y2026', 1));
    s.queue = [];
    const m = E.liveModel(s);
    assert.ok(m.dims.code >= 72 && m.dims.agent >= 55);
    let plain = 0, tools = 0;
    for (let i = 0; i < 200; i++) {
      const a = clone(s), b = withSpirit(s, 'gs_tools');
      a.rng = b.rng = 1000003 * i + 7;
      conditionalEvents(a, {}, { notes: [], costs: { total: 0 }, revenue: 0 });
      conditionalEvents(b, {}, { notes: [], costs: { total: 0 }, revenue: 0 });
      const ha = a.queue.some(q => q.id === 'integration'), hb = b.queue.some(q => q.id === 'integration');
      assert.ok(!ha || hb, `第 ${i} 个种子：没有特质时找上门，有特质时反而没有`);
      plain += ha; tools += hb;
    }
    assert.ok(plain >= 70 && plain <= 110, `没有特质 ${plain}/200（约 45%）`);
    assert.ok(tools >= 115 && tools <= 155, `有特质 ${tools}/200（约 67.5%）`);
  });
});
