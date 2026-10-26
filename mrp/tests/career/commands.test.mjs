// M0 世界接缝：命令表（规格 M.6.5）、自定义公司开局（M.3.1）、事件下标（M.6.4）、自定义公司的存档读回（E8）。
// 每条命令一个正例和一个反例；反例一律是参数表校验失败，要求状态一字不改。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { applyCommand, COMMANDS } from '../../src/career/sim/commands.js';
import { resolveAll, advance, botStep } from '../helpers/career_bot.mjs';
import { clone } from '../helpers/career_util.mjs';
import { withSimProvider, customSpec } from '../helpers/min_provider.mjs';

const spec = customSpec();

// 新开局（deepseek y2025）：队列先清掉，研究槽空着，资本和策略都还没动。
function fresh() {
  const s = E.createGame('deepseek', 'y2025', 1);
  resolveAll(s);
  return s;
}
// 走到中期：至少同时有一项后训练和一项预训练作业（约 2025-10）。一次跑好，后面每个用例拷一份。
const MID = (() => {
  const s = E.createGame('deepseek', 'y2025', 1);
  const errors = [];
  resolveAll(s);
  for (let i = 0; i < 200 && s.status === 'playing'; i++) {
    if (s.jobs.list.some(j => j.kind === 'pretrain') && s.jobs.list.some(j => j.kind === 'post')) break;
    botStep(s, errors);
    advance(s, 7);
  }
  return s;
})();
const mid = () => clone(MID);
const postOf = s => s.jobs.list.find(j => j.kind === 'post');
const preOf = s => s.jobs.list.find(j => j.kind === 'pretrain');
// 送评能通过时的局面：先开一项主线后训练（机器人开局也会开），再等到后训练满 RELEASE_GAP。
function readyToSubmit() {
  const s = fresh();
  const dir = E.directionsFor(s).find(d => !d.special).key;
  E.startJob(s, { kind: 'post', target: 'main', dir, until: 'none' });
  const w = () => E.workingModel(s);
  for (let i = 0; i < 60 && E.submitBlock(s, w(), 'main'); i++) advance(s, 1);
  assert.equal(E.submitBlock(s, w(), 'main'), '', '准备局面：主线应该能送评');
  return s;
}

// 每条命令的正例：返回 { s, args }。s 都是拷出来的，用例之间不互相影响。
const POSITIVE = {
  'postPlan.replan': () => {
    const s = fresh(); s.jobs.list = []; s.techs = s.techs.filter(t => t !== 'dpo');
    assert(E.applyCommand(s, { name: 'postPlan.enable' }).ok);
    let r = E.applyCommand(s, { name: 'postPlan.open', args: { modelId: s.working, expectedModelToken: null } }); assert(r.ok, r.err);
    let v = r.result;
    r = E.applyCommand(s, { name: 'postPlan.confirmDeck', args: { sessionId: v.sessionId, expectedRevision: v.revision, cardIds: ['basic', 'ptc_qwen_sample_tabs', 'ptc_deepseek_pro_tidy_tray', 'ptc_kimi_bookmark_chain'], directionPolicy: 'model-general' } }); assert(r.ok, r.err); v = r.result;
    for (let i = 0; i < 6; i++) { r = E.applyCommand(s, { name: 'postPlan.choose', args: { sessionId: v.sessionId, expectedRevision: v.revision, turn: v.turn, cardId: 'basic' } }); assert(r.ok, r.err); v = r.result.view; }
    s.techs.push('dpo');
    return { s, args: { sessionId: v.sessionId, expectedRevision: v.revision } };
  },
  'postPlan.enable': () => { const s = fresh(); s.jobs.list = []; return { s, args: {} }; },
  'postPlan.open': () => {
    const s = fresh(); s.jobs.list = []; assert(E.applyCommand(s, { name: 'postPlan.enable' }).ok);
    return { s, args: { modelId: s.working, expectedModelToken: null } };
  },
  'postPlan.updateDraft': () => {
    const { s, args } = POSITIVE['postPlan.open']();
    const r = applyCommand(s, { name: 'postPlan.open', args }); assert(r.ok, r.err);
    const v = r.result;
    // Real incomplete draft: keep the required free card, remove one chosen card.
    return { s, args: { sessionId: v.sessionId, expectedRevision: v.revision,
      cardIds: v.deck.filter(id => id !== 'ptc_qwen_sample_tabs') } };
  },
  'postPlan.confirmDeck': () => {
    const { s, args } = POSITIVE['postPlan.open']();
    const r = E.applyCommand(s, { name: 'postPlan.open', args }); assert(r.ok, r.err);
    return { s, args: { sessionId: r.result.sessionId, expectedRevision: 0, cardIds: r.result.deck, directionPolicy: 'model-general' } };
  },
  'postPlan.choose': () => {
    const { s, args } = POSITIVE['postPlan.confirmDeck']();
    const r = E.applyCommand(s, { name: 'postPlan.confirmDeck', args }); assert(r.ok, r.err);
    return { s, args: { sessionId: r.result.sessionId, expectedRevision: r.result.revision, turn: 1, cardId: 'basic' } };
  },
  'postPlan.setControl': () => {
    const { s, args } = POSITIVE['postPlan.choose']();
    return { s, args: { sessionId: args.sessionId, expectedRevision: args.expectedRevision, mode: 'auto', scope: 'session' } };
  },
  setPlayMode: () => ({s:E.createSinglePlayerGame('deepseek','y2025',1),args:{mode:'post'}}),
  enableAutomation: () => ({s:fresh(),args:{}}),
  configureAutomationBatch: () => {const s=fresh();E.enableAutomation(s);return {s,args:{modules:['data','research'],mode:'manual',expectedRev:0,requestId:'batch-test'}};},
  configureAutomation: () => {const s=fresh();E.enableAutomation(s);return {s,args:{module:'data',mode:'manual',preset:'balanced',expectedRev:0,requestId:'test'}};},
  startJob: () => {
    const s = mid();
    const spec = [
      { kind: 'trial', type: 'tune', size: 'small' },
      { kind: 'trial', type: 'mix', size: 'small' },
      { kind: 'trial', type: 'arch', size: 'small', tech: 'moe' },
    ].find(x => E.jobCheck(s, x).ok);
    assert.ok(spec, '准备局面：中期应该还能开一项试验');
    return { s, args: { spec } };
  },
  cancelJob: () => { const s = mid(); return { s, args: { id: postOf(s).id } }; },
  pauseJob: () => { const s = mid(); return { s, args: { id: postOf(s).id, on: true } }; },
  setJobPrio: () => { const s = mid(); return { s, args: { id: postOf(s).id, prio: 'high' } }; },
  setJobCap: () => { const s = mid(); const j = postOf(s); return { s, args: { id: j.id, cards: Math.ceil(E.minCards(s, j)) } }; },
  setPost: () => {
    const s = mid();
    const dir = E.directionsFor(s).find(d => !d.special).key;
    return { s, args: { id: postOf(s).id, dir } };
  },
  setRush: () => { const s = mid(); return { s, args: { id: preOf(s).id, on: true } }; },
  setRepair: () => ({ s: mid(), args: { on: true } }),
  setAutoRepair: () => ({ s: mid(), args: { on: true } }),
  setOwnOnly: () => ({ s: mid(), args: { on: true } }),
  setPlan: () => ({ s: mid(), args: { cfg: { total: 7, active: 7, arch: 'dense', tokens: 1 } } }),
  focusResearch: () => ({ s: mid(), args: { on: true } }),
  submitEval: () => { const s = readyToSubmit(); return { s, args: { modelId: E.workingModel(s).id, tier: 'quick' } }; },
  cancelEval: () => {
    const s = readyToSubmit();
    const r = E.applyCommand(s, { name: 'submitEval', args: { modelId: E.workingModel(s).id, tier: 'quick' } });
    assert.equal(r.ok, true, `准备局面：送评应该成功（${r.err}）`);
    return { s, args: { id: r.result.eval.id } };
  },
  decide: () => {
    const s = fresh();
    const ds = E.dataOptions(s).find(o => !s.data.acquired.includes(o.id));
    assert.ok(ds, '准备局面：应该有能买的数据');
    return { s, args: { action: 'data', id: ds.id } };
  },
  researchTech: () => {
    const s = fresh();
    const opt = E.researchOptions(s).find(x => x.check.ok);
    assert.ok(opt, '准备局面：应该有能研究的技术');
    return { s, args: { id: opt.t.id } };
  },
  stopTech: () => {
    const s = fresh();
    const opt = E.researchOptions(s).find(x => x.check.ok);
    E.researchTech(s, opt.t.id);
    return { s, args: { id: opt.t.id } };
  },
  buyGpu: () => {
    const s = fresh();
    // 按配额和当天的供给找一款买得到的卡（H100 在中国买不到，H800 在 2025 年以后也停了）。
    const id = ['H800', 'H20', 'Ascend910C', 'A100', 'H100', 'H200', 'B200'].find(g => applyCommand(clone(s), { name: 'buyGpu', args: { id: g, n: 64 } }).ok);
    assert.ok(id, '准备局面：应该有能买的卡');
    return { s, args: { id, n: 64 } };
  },
  buySmuggled: () => {
    const s = fresh();
    const o = E.smuggleOffers(s)[0];
    assert.ok(o, '准备局面：应该有灰色渠道');
    return { s, args: { id: o.id, n: 1 } };
  },
  releaseGpu: () => {
    const s = fresh();
    const [id] = Object.entries(s.gpus.owned).find(([, n]) => n > 0);
    return { s, args: { id, n: 1, rented: false } };
  },
  setInferShare: () => ({ s: fresh(), args: { v: 0.5 } }),
  setLease: () => ({ s: fresh(), args: { n: 0 } }),
  setProduct: () => ({ s: fresh(), args: { id: 'api', patch: { tier: 'budget' } } }),
  setTier: () => ({ s: fresh(), args: { id: 'api', tier: 'premium' } }),
  setSmallApi: () => ({ s: fresh(), args: { on: false } }),
  setRouting: () => ({ s: fresh(), args: { mode: 'full' } }),
  setPolicy: () => ({ s: fresh(), args: { key: 'contentPolicy', value: 'strict' } }),
  trade: () => ({ s: fresh(), args: { ticker: 'NVDA', usd: 1000 } }),
  startFunding: () => {
    const s = fresh();
    const offer = E.fundingOffers(s)[0];
    assert.ok(offer, '准备局面：应该能融资');
    return { s, args: { dilution: offer.dilution } };
  },
  startIpo: () => ({ s: fresh(), args: {} }),
  startStrategy: () => {
    const s = fresh();
    const opt = E.strategyOptions(s).find(x => x.state === 'available');
    assert.ok(opt, '准备局面：应该有一项可以开始的策略');
    return { s, args: { id: opt.id } };
  },
  cancelStrategy: () => {
    const s = fresh();
    const opt = E.strategyOptions(s).find(x => x.state === 'available');
    E.startStrategy(s, opt.id);
    return { s, args: {} };
  },
  resolveEvent: () => {
    // 队列里第一张是“时间怎么走”这类提示，选“知道了”。
    const s = E.createGame('deepseek', 'y2025', 1);
    return { s, args: { choiceId: 'ok' } };
  },
  applyAdvice: () => {
    const s = fresh();
    const advice = E.advise(s).find(a => applyCommand(clone(s), { name: 'applyAdvice', args: { advice: a } }).ok);
    assert.ok(advice, '准备局面：应该有一条能照做的建议');
    return { s, args: { advice } };
  },
  // 显卡抵押贷款（规格 K4）：开局手里就有卡，可以借；还款前先借一笔。
  borrow: () => ({ s: fresh(), args: { usd: 1e6 } }),
  repay: () => {
    const s = fresh();
    E.borrow(s, 1e6);
    return { s, args: { usd: 5e5 } };
  },
};

// 每条命令的反例：参数表校验一定失败（类型、范围、取值、缺参数、多参数）。
const NEGATIVE = {
  'postPlan.replan': { sessionId: 'x', expectedRevision: -1, unlocked: ['ptc_qwen_paired_preferences'] },
  'postPlan.enable': { rate: 1 },
  'postPlan.open': { modelId: 7, expectedModelToken: null },
  'postPlan.updateDraft': { sessionId: 'x', expectedRevision: 0, cardIds: [] },
  'postPlan.confirmDeck': { sessionId: 'x', expectedRevision: -1, cardIds: [], directionPolicy: 'model-general' },
  'postPlan.choose': { sessionId: 'x', expectedRevision: 0, turn: 7, cardId: 'basic' },
  'postPlan.setControl': { sessionId: 'x', expectedRevision: 0, mode: 'skip', scope: 'session' },
  enableAutomation: {unexpected:true},
  setPlayMode: {mode:'bad'},
  configureAutomation: {module:'capital'},
  configureAutomationBatch: {modules:['capital'],mode:'manual',expectedRev:0,requestId:'bad-batch'},
  startJob: { spec: { kind: 'nope' } },
  cancelJob: { id: 5 },
  pauseJob: { id: 'j1', on: 'yes' },
  setJobPrio: { id: 'j1', prio: 'urgent' },
  setJobCap: { id: 'j1', cards: 0 },
  setPost: { id: 'j1', until: 'forever' },
  setRush: { id: 'j1' },
  setRepair: { on: 1 },
  setAutoRepair: {},
  setOwnOnly: { on: 'off' },
  setPlan: { cfg: 'next' },
  focusResearch: { on: null },
  submitEval: { modelId: 'm1', tier: 'turbo' },
  cancelEval: { id: '' },
  decide: { action: 'data' },
  researchTech: {},
  stopTech: { id: 1 },
  buyGpu: { id: 'H100', n: 0 },
  buySmuggled: { id: 'x', n: 1.5 },
  releaseGpu: { id: 'H100', n: 0 },
  setInferShare: { v: 2 },
  setLease: { n: -1 },
  setProduct: { id: 'api', patch: [] },
  setTier: { id: 'api', tier: 'free' },
  setSmallApi: { on: 'x' },
  setRouting: { mode: 'nope' },
  setPolicy: { key: 'nope', value: 'x' },
  trade: { ticker: 'NVDA', usd: 0 },
  startFunding: { dilution: 'x' },
  startIpo: { nope: 1 },
  startStrategy: { id: 1 },
  cancelStrategy: { nope: 1 },
  resolveEvent: { choiceId: 'ok', at: -1 },
  applyAdvice: { advice: 'x' },
};

// M2 追加的命令（史实模式下一律拒绝，正例在自洽世界里测）：M2a 的股市命令，M2b 的互动命令
// （distillReply 在 tests/world/distill_watch.test.mjs，setLicenseTerms 在 license.test.mjs，poach 在 interact.test.mjs）。
const M2_STOCK = ['stockBuy', 'stockSell', 'stockShort', 'stockCover', 'stockBuyback', 'stockIssue', 'startIpoIssue', 'distillReply', 'setLicenseTerms', 'poach'];

describe('COMMANDS 命令表', () => {
  it('参数表覆盖 M.6.5 的全部引擎命令，每条都有 fn、args、readOnly', () => {
    // 规格 M.6.5 的命令清单（互动命令 M2 再追加，房间命令不进引擎）。
    const M65 = [
      'postPlan.enable', 'postPlan.open', 'postPlan.updateDraft', 'postPlan.confirmDeck', 'postPlan.choose', 'postPlan.setControl', 'postPlan.replan',
      'setPlayMode', 'enableAutomation', 'configureAutomation', 'configureAutomationBatch', // 单机显式托管试用，联机权限仍由引擎拒绝

      'startJob', 'cancelJob', 'pauseJob', 'setJobPrio', 'setJobCap', 'setPost', 'setRush', 'setRepair', 'setAutoRepair', 'setOwnOnly', 'setPlan', 'focusResearch', 'submitEval', 'cancelEval',
      'decide', 'researchTech', 'stopTech', 'buyGpu', 'buySmuggled', 'releaseGpu', 'setInferShare', 'setLease', 'setProduct', 'setTier', 'setSmallApi', 'setRouting', 'setPolicy',
      'trade', 'startFunding', 'startIpo', 'startStrategy', 'cancelStrategy', 'resolveEvent', 'applyAdvice',
      // K 包在末尾追加的显卡抵押贷款（规格 K4），史实模式里也能用。
      'borrow', 'repay',
    ].sort();
    // M2a 在末尾追加的股市命令：只有自洽世界和联机里有，正例在 tests/world/exchange.test.mjs 里跑。
    assert.deepEqual(M2_STOCK.filter(n => !Object.hasOwn(COMMANDS, n)), [], '股市命令都要在参数表里');
    const names = Object.keys(COMMANDS).filter(n => !M2_STOCK.includes(n)).sort();
    assert.deepEqual(names, M65);
    assert.deepEqual(Object.keys(POSITIVE).sort(), M65);
    for (const [name, def] of Object.entries(COMMANDS)) {
      assert.equal(typeof def.fn, 'function', `${name} 要有 fn`);
      assert.equal(typeof def.args, 'object', `${name} 要有参数表`);
      assert.equal(def.readOnly, false, `${name} 会改局面，只读回看里不能放行`);
    }
  });

  for (const name of Object.keys(COMMANDS)) {
    if (!M2_STOCK.includes(name)) it(`${name}：正例能执行`, () => {
      const { s, args } = POSITIVE[name]();
      const r = applyCommand(s, { name, args });
      assert.equal(r.ok, true, `${name} 应该成功：${r.err}`);
    });

    it(`${name}：反例返回中文原因，状态不变`, () => {
      const s = fresh();
      const before = JSON.stringify(s);
      const r = applyCommand(s, { name, args: NEGATIVE[name] });
      assert.equal(r.ok, false, `${name} 的反例应该被拒绝`);
      assert.equal(typeof r.err, 'string');
      assert.ok(r.err.length > 0);
      assert.equal(JSON.stringify(s), before, `${name} 校验失败以后状态不能变`);
    });
  }

  it('updateDraft 真实保存三张草稿、不确认不抽牌；只读局拒绝同一合法命令', () => {
    const { s, args } = POSITIVE['postPlan.updateDraft']();
    assert.equal(args.cardIds.length, 3);
    const readOnly = clone(s); readOnly.status = 'finished';
    const beforeReadOnly = JSON.stringify(readOnly);
    const rejected = applyCommand(readOnly, { name: 'postPlan.updateDraft', args });
    assert.equal(rejected.ok, false); assert.match(rejected.err, /只能回看/);
    assert.equal(JSON.stringify(readOnly), beforeReadOnly);
    const r = applyCommand(s, { name: 'postPlan.updateDraft', args });
    assert.equal(r.ok, true, r.err); assert.deepEqual(r.result.deck, args.cardIds);
    assert.equal(r.result.status, 'draft'); assert.equal(r.result.confirmed, false);
    assert.deepEqual(r.result.hand, []); assert.equal(r.result.turn, 0);
    const p = s.postPlanSessions.sessions[args.sessionId];
    assert.equal(p.drawTicket, null); assert.equal(p.confirmedDeck, null);
    assert.equal(p.draftChanges, 1); assert.equal(p.revision, args.expectedRevision + 1);
  });

  it('updateDraft 参数表拒绝空/过量/非数组/负版本/额外字段，真实草稿不变', () => {
    const { s, args } = POSITIVE['postPlan.updateDraft']();
    const cases = [
      { ...args, cardIds: [] }, { ...args, cardIds: [...args.cardIds, 'basic', 'basic'] },
      { ...args, cardIds: 'basic' }, { ...args, expectedRevision: -1 },
      { ...args, cardIds: ['basic', 7] }, { ...args, drawTicket: 123 },
    ];
    for (const invalid of cases) {
      const before = JSON.stringify(s);
      const r = applyCommand(s, { name: 'postPlan.updateDraft', args: invalid });
      assert.equal(r.ok, false); assert.equal(typeof r.err, 'string'); assert.ok(r.err.length);
      assert.equal(JSON.stringify(s), before);
    }
  });

  it('不认识的命令、不是对象的命令都拒绝', () => {
    const s = fresh();
    assert.equal(applyCommand(s, { name: 'nope', args: {} }).ok, false);
    assert.equal(applyCommand(s, 'startIpo').ok, false);
    assert.equal(applyCommand(s, null).ok, false);
  });

  it('游戏结束后的只读回看里，引擎命令一律不执行', () => {
    const s = fresh();
    s.status = 'finished';
    const before = JSON.stringify(s);
    const r = applyCommand(s, { name: 'setInferShare', args: { v: 0.5 } });
    assert.equal(r.ok, false);
    assert.match(r.err, /只能回看/);
    assert.equal(JSON.stringify(s), before);
  });

  it('引擎拒绝时原话回给调用方', () => {
    const s = fresh();
    const r = applyCommand(s, { name: 'buyGpu', args: { id: 'H100', n: 999999 } });
    assert.equal(r.ok, false);
    assert.ok(r.err.length > 0 && r.err !== '');
  });
});

describe('createGameFor 和公司登记', () => {
  it('createGameFor 先登记公司，开局后的 s.company 带完整 spec 和 custom: true', () => {
    withSimProvider(() => {
      const s = E.createGameFor(spec, 'y2023', 7);
      assert.equal(s.charId, spec.id);
      assert.equal(s.company.custom, true);
      assert.equal(s.company.company, spec.company);
      assert.equal(s.company.tier, spec.tier);
      assert.equal(s.company.org, spec.id);
      assert.equal(s.status, 'playing');
    });
  });

  it('同一个 id、同一份 spec 再登记一次什么都不做', () => {
    withSimProvider(() => {
      const s1 = E.createGameFor(spec, 'y2023', 7);
      const s2 = E.createGameFor(spec, 'y2023', 7);
      assert.equal(s2.charId, s1.charId);
      assert.equal(s2.company.company, s1.company.company);
      assert.equal(JSON.stringify(s2.company), JSON.stringify(s1.company));
    });
  });

  it('同一个 id、不同的 spec 报“存档损坏”', () => {
    withSimProvider(() => {
      E.createGameFor(spec, 'y2023', 7);
      assert.throws(() => E.registerCompany({ ...spec, company: '换了个名字' }), /存档损坏/);
    });
  });

  it('史实模式里 registerCompany 抛错（规格 M.3.2 的表）', () => {
    assert.throws(() => E.registerCompany(customSpec({ id: 'c_zzz999' })), /史实模式不能注册新公司/);
  });

  it('id 格式不对、缺档位或模态都不登记', () => {
    withSimProvider(() => {
      assert.throws(() => E.registerCompany(customSpec({ id: 'abc123' })), /c_ 加 6 位/);
      assert.throws(() => E.registerCompany(customSpec({ id: 'c_abc999', tier: 'mega' })), /档位/);
      assert.throws(() => E.registerCompany(customSpec({ id: 'c_abc998', modality: 'video' })), /模态/);
    });
  });

  it('自定义公司的存档：存了再读，能读回来', () => {
    withSimProvider(() => {
      const s = E.createGameFor(customSpec({ id: 'c_save01' }), 'y2023', 11);
      for (let i = 0; i < 10; i++) E.tickDay(s);
      const raw = JSON.parse(JSON.stringify(s));
      const r = E.migrateGame(raw);
      assert.equal(r.ok, true, `读档应该成功：${r.reason}`);
      assert.equal(r.s.charId, 'c_save01');
      assert.equal(r.s.company.custom, true);
      assert.equal(JSON.stringify(r.s), JSON.stringify(raw), '读回后内容不该变');
      assert.equal(E.validateGame(r.s), true);
    });
  });
});

describe('事件下标（M.6.4）', () => {
  it('默认下标仍是队首；带下标时处理的是第 2 张卡', () => {
    const s = E.createGame('deepseek', 'y2025', 1);
    // 造出两张提示：第 1 张插在队首，原来的提示顺延，第 2 张是测试用的。
    s.queue.unshift({ kind: 'notice', title: '第一张', text: '一张测试用的提示。' });
    s.queue.splice(1, 0, { kind: 'notice', title: '第二张', text: '另一张测试用的提示。' });
    const first = s.queue[0];
    assert.equal(E.currentEvent(s, 1).title, '第二张', 'currentEvent(s, 1) 看的是第 2 张');
    const r = E.resolveEvent(s, 'ok', 1);
    assert.equal(r.title, '第二张');
    assert.equal(s.queue[0], first, '第 1 张还在队首');
    assert.equal(s.queue.filter(q => q.title === '第二张').length, 0, '第 2 张已经出队');
    // 默认下标行为不变：处理的是现在的队首。
    const r0 = E.resolveEvent(s, 'ok');
    assert.equal(r0.title, '第一张');
    assert.notEqual(s.queue[0], first);
  });
});
