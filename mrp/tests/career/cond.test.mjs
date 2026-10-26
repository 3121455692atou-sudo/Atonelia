// 统一的条件判断（P0.3a，规格 E2）：cond 每个叶子、ModelCond 每个子键都有正反用例；condWhy 的条目是中文；
// 新叶子（sotaMade、expectHot、model 的 sota 和 badge）读不到 s.sota、s.expect 时按不满足；validateCond 拦下不认识的键。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { cond, condWhy, condPermanent, condPermanentWhy, validateCond, COND_KEYS, MODEL_COND_KEYS } from '../../src/career/sim/cond.js';
import { worldSota, qOf } from '../../src/career/sim/sota.js';
import { techStatus } from '../../src/career/sim/research.js';
import { TECHS } from '../../src/career/data/core.js';
import { addDays } from '../../src/career/sim/clock.js';
import { setStance } from '../../src/career/sim/route.js';
import { resolveAll } from '../helpers/career_bot.mjs';
import { clone } from '../helpers/career_util.mjs';

const CJK = /[一-鿿]/;
const BASE = (() => { const s = E.createGame('deepseek', 'y2025', 7); resolveAll(s); return s; })();
const game = () => clone(BASE);
// 一条条件：成立时 cond 为真、why 每条都是中文且 ok 与 cond 一致（单叶子时）。
function yes(s, c, ctx) { assert.equal(cond(s, c, ctx), true, `应该成立：${JSON.stringify(c)}`); whyOk(s, c, ctx, true); }
function no(s, c, ctx) { assert.equal(cond(s, c, ctx), false, `不该成立：${JSON.stringify(c)}`); whyOk(s, c, ctx, false); }
function whyOk(s, c, ctx, expect) {
  const lines = condWhy(s, c, ctx);
  assert.ok(lines.length > 0, `没有清单：${JSON.stringify(c)}`);
  for (const l of lines) {
    assert.ok(CJK.test(l.text), `条目不是中文：${l.text}`);
    assert.ok(typeof l.now === 'string' && l.now.length > 0, `没有当前值：${JSON.stringify(l)}`);
    assert.ok(!/undefined|NaN|\[object/.test(`${l.text}${l.now}`), `条目里有坏值：${l.text}｜${l.now}`);
  }
  if (lines.length === 1) assert.equal(lines[0].ok, expect, `清单的 ✓/✗ 和 cond 不一致：${JSON.stringify(c)}`);
  else if (expect) assert.ok(lines.every(l => l.ok), JSON.stringify(lines));
  else assert.ok(lines.some(l => !l.ok), JSON.stringify(lines));
}

describe('cond：公司属性、技术、里程碑', () => {
  it('company、country、tier、kind、mod、scenario、strength', () => {
    const s = game();
    for (const [k, y, n] of [['company', 'deepseek', 'gpt'], ['country', 'CN', 'US'], ['tier', 'major', 'frontier'], ['kind', 'private', 'division'], ['mod', 'llm', 'image'], ['scenario', 'y2025', 'y2023'], ['strength', 'math', 'writing']]) {
      yes(s, { [k]: y }); no(s, { [k]: n });
      yes(s, { [k]: [n, y].slice(k === 'strength' ? 1 : 0) });
    }
  });
  it('era：只允许写在策略节点的 available 里', () => {
    const s = game();
    yes(s, { era: '2024-06' }); no(s, { era: '2026-01' });
    assert.throws(() => validateCond({ era: '2024-06' }), /era/);
    validateCond({ era: '2024-06' }, { allowEra: true });
    assert.throws(() => validateCond({ all: [{ country: 'CN' }, { era: '2024-06' }] }), /era/);
  });
  it('techs、anyTech、notTechs', () => {
    const s = game();
    yes(s, { techs: ['mla', 'grpo'] }); no(s, { techs: ['mla', 'engram'] });
    yes(s, { anyTech: ['engram', 'mla'] }); no(s, { anyTech: ['engram'] });
    yes(s, { notTechs: ['engram'] }); no(s, { notTechs: ['engram', 'mla'] });
  });
  it('firsts：n 或 { n, days }（只数这么多天内首创的）', () => {
    const s = game();
    s.firsts = { mla: s.day, fp8: addDays(s.day, -400) };
    yes(s, { firsts: 2 }); no(s, { firsts: 3 });
    yes(s, { firsts: { n: 1, days: 30 } }); no(s, { firsts: { n: 2, days: 30 } });
  });
  it('techSeen：世界公开程度至少到论文 / 开源', () => {
    const s = game();
    const open = TECHS.find(t => t.mod === 'llm' && techStatus(s, t).level === 'open');
    const secret = TECHS.find(t => t.mod === 'llm' && techStatus(s, t).level === 'secret');
    assert.ok(open && secret);
    yes(s, { techSeen: { [open.id]: 'paper' } }); yes(s, { techSeen: { [open.id]: 'open' } });
    no(s, { techSeen: { [secret.id]: 'paper' } });
  });
  it('ms：me / other / none / notOther / any', () => {
    const s = game();
    s.ms = { ms_gpt4: { who: 'gpt', day: s.day }, ms_mla: { who: 'me', day: s.day } };
    yes(s, { ms: { ms_gpt4: 'other' } }); no(s, { ms: { ms_gpt4: 'me' } });
    yes(s, { ms: { ms_mla: 'me' } }); no(s, { ms: { ms_mla: 'other' } });
    yes(s, { ms: { ms_fp8: 'none' } }); no(s, { ms: { ms_gpt4: 'none' } });
    yes(s, { ms: { ms_mla: 'notOther', ms_fp8: 'notOther' } }); no(s, { ms: { ms_gpt4: 'notOther' } });
    yes(s, { ms: { ms_gpt4: 'any' } }); no(s, { ms: { ms_fp8: 'any' } });
    assert.throws(() => validateCond({ ms: { ms_gpt4: 'mine' } }));
    assert.throws(() => validateCond({ ms: { ms_no_such: 'me' } }));
  });
});

describe('cond：策略、路线、授名、事件记账（还没有 s.strategy、s.route 时按不满足）', () => {
  it('node、notNode、spirit、ex、right、stance、seen', () => {
    const s = game();
    no(s, { node: 'ds_r1' }); yes(s, { notNode: 'ds_r1' }); no(s, { spirit: 'ds_mit' }); no(s, { ex: 'ex_r1_moment' });
    no(s, { right: { hn_ds_r1: 'held' } }); no(s, { stance: ['open'] }); no(s, { seen: 'e429' });
    s.strategy = { done: { ds_r1: { day: s.day, how: 'done' } }, spirits: { ds_mit: { since: s.day, until: null } }, ex: { ex_r1_moment: s.day },
      rights: { hn_ds_r1: { day: s.day, until: '2099-01-01', used: null, void: null }, hn_ds_v3: { day: s.day, until: '2099-01-01', used: 'm1', void: null }, hn_x: { day: s.day, until: '2099-01-01', used: null, void: '被抢先' } } };
    s.route = { stance: 'open', license: 'permissive', since: s.day, by: 'start' };
    s.seen.e429 = 1;
    yes(s, { node: 'ds_r1' }); no(s, { notNode: 'ds_r1' }); yes(s, { spirit: 'ds_mit' }); yes(s, { ex: 'ex_r1_moment' });
    yes(s, { right: { hn_ds_r1: 'held' } }); no(s, { right: { hn_ds_r1: 'used' } });
    yes(s, { right: { hn_ds_v3: 'used' } }); yes(s, { right: { hn_x: 'void' } });
    yes(s, { stance: ['open_restricted', 'open'] }); no(s, { stance: ['closed'] });
    yes(s, { seen: 'e429' }); no(s, { seen: 'exposed' });
    assert.throws(() => validateCond({ stance: ['wide_open'] }));
  });
});

describe('cond：模型（live、smallLive、working、model）和 ModelCond 的每个子键', () => {
  const strong = s => ({ id: 'tm', mod: 'llm', stage: 'released', role: 'flagship', line: 'main', open: true, license: 'permissive', arch: 'moe', total: 671, active: 37,
    dims: { knowledge: 99, code: 99, math: 99, writing: 99, safety: 80, agent: 99 }, techs: ['reasoning', 'mla'], tainted: false, teacher: 'self', origin: 'distill',
    badges: ['community'], sota: { from: s.day, until: null } });
  const weak = s => ({ ...strong(s), id: 'tw', role: 'small', line: 'small', open: false, license: undefined, arch: 'dense', total: 7, active: 7, dims: { knowledge: 10, code: 10, math: 10, writing: 10, safety: 10, agent: 10 },
    techs: ['mla'], tainted: true, teacher: 'gpt', origin: 'pretrain', badges: [], sota: { from: s.day, until: s.day } });
  it('live、smallLive、working、model 和 exists', () => {
    const s = game();
    yes(s, { live: { exists: true } }); yes(s, { smallLive: { exists: true } }); yes(s, { working: { exists: true } });
    no(s, { model: { exists: true } }, {}); yes(s, { model: { exists: true } }, { model: strong(s) });
    s.working = null;
    yes(s, { working: { exists: false } }); no(s, { working: { open: true } });
    yes(s, { live: { open: true } }); no(s, { live: { open: false } });
  });
  it('每个子键：正反两款模型', () => {
    const s = game(), ctx = { model: strong(s) }, wctx = { model: weak(s) };
    const ws = worldSota(s).q, q = qOf('llm', ctx.model.dims, s.date);
    const cases = {
      role: 'flagship', open: true, license: 'permissive', reasoning: true, arch: ['moe'], minTotal: 600, maxTotal: 700, maxActive: 40,
      techs: ['reasoning'], dims: { math: 90 }, dimLead: { math: 0 }, gap: 0, lead: 1, atLeast: { name: 'GPT-4', d: 0 }, rank: 1,
      tainted: false, teacher: 'self', codeOverPrev: 5, sota: true, badge: 'community', origin: 'distill',
    };
    assert.deepEqual(Object.keys(cases).sort(), MODEL_COND_KEYS.filter(k => k !== 'exists').sort(), '每个子键都要有用例');
    assert.ok(q > ws + 1, '强模型要领先世界最强');
    for (const [k, v] of Object.entries(cases)) {
      yes(s, { model: { [k]: v } }, ctx);
      // maxTotal、maxActive 反着来：小模型满足，大模型不满足。
      if (k === 'maxTotal' || k === 'maxActive') { no(s, { model: { [k]: v } }, { model: { ...ctx.model, total: 2000, active: 100 } }); continue; }
      no(s, { model: { [k]: v } }, wctx);
    }
    yes(s, { model: { lead: null } }, wctx);
  });
  it('role：live 恒为旗舰、smallLive 恒为小模型；working 按“现在发布会不会顶替在线旗舰”试算', () => {
    const s = game();
    yes(s, { live: { role: 'flagship' } }); yes(s, { smallLive: { role: 'small' } });
    const w = E.workingModel(s), live = E.liveModel(s);
    w.dims = { ...live.dims, math: live.dims.math + 5 };
    yes(s, { working: { role: 'flagship' } });
    w.dims = { ...live.dims, math: live.dims.math - 5 };
    yes(s, { working: { role: 'small' } });
  });
  it('open、license：working 和发布前试算按路线读（route.js 的 releaseOpen，和 doRelease 同一口径；G1 遗留 #21），不看在练模型身上残留的 open；已发布的读快照自己的', () => {
    const s = game();
    assert.deepEqual([s.route.stance, s.route.license], ['open_restricted', 'restrictive']);
    const w = E.workingModel(s), live = E.liveModel(s);
    const shift = d => Object.fromEntries(Object.entries(live.dims).map(([k, v]) => [k, k === 'safety' ? v : v + d]));
    assert.ok(!('open' in w), '在练模型不写 open');
    // 现在发布会顶替旗舰：旗舰按路线锁定开源、受限许可。旧档残留的 open:false 不起作用。
    w.dims = shift(5);
    Object.assign(w, { open: false, license: null });
    yes(s, { working: { open: true } }); yes(s, { working: { license: 'restrictive' } }); no(s, { working: { license: 'permissive' } });
    assert.match(condWhy(s, { working: { open: true } })[0].now, /发布时按路线/);
    yes(s, { model: { open: true, license: 'restrictive' } }, { model: w, preview: true, open: false });
    // 弱于在线旗舰、作为副线发布：开不开源自己选，试算按 ctx.open，不传按路线默认（受限许可开源档默认开源）；working 一律按默认。
    w.dims = shift(-5);
    yes(s, { model: { open: false } }, { model: w, preview: true, open: false });
    no(s, { model: { license: 'restrictive' } }, { model: w, preview: true, open: false });
    yes(s, { model: { open: true, license: 'restrictive' } }, { model: w, preview: true, open: true });
    yes(s, { model: { open: true } }, { model: w, preview: true });
    yes(s, { working: { open: true } });
    // 闭源档：旗舰闭源、没有许可。
    setStance(s, 'closed', { src: 'start' });
    w.dims = shift(5);
    w.open = true;
    yes(s, { working: { open: false } }); no(s, { working: { license: ['permissive', 'restrictive'] } });
    // 不是试算的 model 叶子（发布钩子里的快照）、live 读模型自己的开闭。
    yes(s, { model: { open: true } }, { model: { ...w, stage: 'released', line: 'main', open: true, license: 'permissive' } });
    yes(s, { live: { open: true, license: 'restrictive' } });
  });
  it('role：有旗舰正在灰度时，working 和发布前试算跟 doRelease 一样和灰度中较强的一款比（release.js 的 releaseLine）', () => {
    const s = game();
    const w = E.workingModel(s), live = E.liveModel(s);
    // 一款比在线旗舰强 5 分、正在灰度、全量后就会成为在线旗舰的快照。
    const gray = { ...clone(live), id: 'gray1', name: '灰度中的新旗舰', hist: false, line: 'main', released: s.date, releasedDay: s.day, dims: Object.fromEntries(Object.entries(live.dims).map(([k, v]) => [k, k === 'safety' ? v : v + 5])) };
    s.models.push(gray);
    s.deploy.push({ id: gray.id, role: 'flagship', until: addDays(s.day, 7), name: gray.name });
    // 在练模型比在线旗舰强、比灰度中的弱：现在发布只能作为副线。
    w.dims = Object.fromEntries(Object.entries(live.dims).map(([k, v]) => [k, k === 'safety' ? v : v + 2]));
    assert.equal(E.releaseLine(s, w), 'side');
    yes(s, { working: { role: 'small' } }); no(s, { working: { role: 'flagship' } });
    yes(s, { model: { role: 'small' } }, { model: w, preview: true });
    // 比灰度中的也强：顶替。
    w.dims = Object.fromEntries(Object.entries(live.dims).map(([k, v]) => [k, k === 'safety' ? v : v + 6]));
    assert.equal(E.releaseLine(s, w), 'main');
    yes(s, { working: { role: 'flagship' } });
  });
});

describe('cond：发布计数、经营状态、区间、服务、风险、对手', () => {
  it('released：只数开局后自己发布的快照，按发布角色和开闭', () => {
    const s = game();
    no(s, { released: { count: 1 } });
    assert.ok(s.models.some(m => m.stage === 'released'), '开局继承的型号已经是 released，但不算自己发布的');
    // 开局继承的型号记了 hist、line：照着它造一款自己发布的副线快照，要把这两项改掉。
    s.models.push({ ...E.liveModel(s), id: 'r1', name: '小肥鱼 测试版', stage: 'released', released: s.date, releasedDay: s.day, role: 'small', line: 'side', hist: false, open: true });
    yes(s, { released: { count: 1 } }); yes(s, { released: { role: 'small', open: true } });
    no(s, { released: { role: 'flagship' } }); no(s, { released: { count: 2 } });
  });
  it('users、revenue、cash、valuation、know、team、health、integrations：都是“不少于”', () => {
    const s = game();
    s.history.push({ users: 1e6, revenue: 2e6, costs: 3e6 });
    s.cash = 5e7; s.valuation = 1e9; s.know = 300; s.team = 120; s.health = 70; s.service.integrations.tools = ['cursor', 'cline'];
    const vals = { users: 1e6, revenue: 2e6, cash: 5e7, valuation: 1e9, know: 300, team: 120, health: 70, integrations: 2 };
    for (const [k, v] of Object.entries(vals)) { yes(s, { [k]: v }); no(s, { [k]: v * 1.5 + 1 }); }
  });
  it('runwayMonths、gpus、distillDep、ownData', () => {
    const s = game();
    s.history.push({ users: 0, revenue: 1e6, costs: 2e6 });
    s.cash = 1e7;
    yes(s, { runwayMonths: { min: 6 } }); no(s, { runwayMonths: { max: 9 } }); yes(s, { runwayMonths: { min: 6, max: 12 } });
    yes(s, { gpus: { min: 1 } }); no(s, { gpus: { max: 0 } });
    s.distillDep = 0.2;
    yes(s, { distillDep: { max: 0.5 } }); s.distillDep = 0.8; no(s, { distillDep: { max: 0.5 } });
    yes(s, { ownData: { level: 1, count: 3 } }); no(s, { ownData: { level: 2, count: 1 } });
  });
  it('service、risky', () => {
    const s = game();
    yes(s, { service: { chatOn: true, apiOn: true, apiTier: ['budget'] } }); no(s, { service: { apiTier: ['premium'] } });
    s.products.chat.on = false;
    no(s, { service: { chatOn: true } }); yes(s, { service: { chatOn: false } });
    no(s, { risky: 'tos' });
    s.data.risky = { tos_gpt: true, mu_scrape: true };
    yes(s, { risky: 'tos' }); yes(s, { risky: 'music_scrape' }); no(s, { risky: 'license' });
    assert.throws(() => validateCond({ risky: 'piracy' }));
  });
  it('exists / none：当前可见的对手发布', () => {
    const s = game();
    yes(s, { exists: { rival: { open: true } } }); no(s, { none: { rival: { open: true } } });
    no(s, { exists: { rival: { family: 'gpt', open: true } } }); yes(s, { none: { rival: { family: 'gpt', open: true } } });
    yes(s, { exists: { rival: { tag: 'C' } } });   // Gemini 1.5 Pro 起带 C（上下文 ≥1M）
    no(s, { exists: { rival: { tag: 'X' } } });    // 只有 Muse Wonder Full 带 X，2026-10 才出现
    yes(s, { exists: { rival: { gap: 0 } } });
    assert.throws(() => validateCond({ exists: { rival: { size: 'big' } } }));
  });
  it('exists / none 按发布日判断可见（E2“当前可见的发布”）：千问 2025-01-19 看不到 R1，01-20 才看到；同月的旧口径会提前看到', () => {
    const s = E.createGame('qwen', 'y2025', 1);
    const r1 = { exists: { rival: { family: 'deepseek_pro', open: true, tag: 'R' } } };
    s.day = '2025-01-19';
    no(s, r1); yes(s, { none: r1.exists });
    assert.equal(condPermanent(s, { none: r1.exists }), false);
    s.day = '2025-01-20';
    yes(s, r1); no(s, { none: r1.exists });
    assert.equal(condPermanent(s, { none: r1.exists }), true);
    assert.equal(condWhy(s, r1)[0].now, 'DeepSeek-R1', '清单里写的是最近的一款');
  });
  it('exists / none 的许可从 tags 取：LP 是宽松许可，LR、LN 是受限许可；闭源的没有许可', () => {
    const s = E.createGame('qwen', 'y2025', 1);
    s.day = '2025-01-19';
    no(s, { exists: { rival: { family: 'deepseek_pro', license: 'permissive' } } });
    yes(s, { exists: { rival: { family: 'deepseek_pro', license: 'restrictive' } } });   // DeepSeek-V3 等是 LR
    s.day = '2025-01-20';
    yes(s, { exists: { rival: { family: 'deepseek_pro', license: 'permissive' } } });    // R1 是 LP
    yes(s, { exists: { rival: { family: 'llama', license: ['restrictive'] } } });         // Llama 2、3 是 LR，LLaMA 65B 是 LN
    yes(s, { none: { rival: { family: 'llama', license: 'permissive' } } });
    no(s, { exists: { rival: { family: 'gpt', license: ['permissive', 'restrictive'] } } });   // 这时 GPT 全是闭源
  });
  it('exists / none 的 gap 按玩家看到的能力（跟随者钳制以后的 relDims）比：玩 OpenAI 时 Qwen-72B 被钳低 1.18，原始分够、钳制后不够就不算', () => {
    const s = E.createGame('gpt', 'y2023', 1);
    s.day = '2023-12-15';
    const qwen = E.familyBest(s, 'qwen', s.day);
    assert.equal(qwen.name, 'Qwen-72B');
    const raw = qOf('llm', qwen.dims), seen = qOf('llm', E.relDims(s, qwen)), ws = worldSota(s).q;
    assert.equal((raw - seen).toFixed(2), '1.18');
    const gap = ws - raw + 0.5;   // 原始分在线内 0.5，钳制后在线外 0.68
    no(s, { exists: { rival: { family: 'qwen', gap } } });
    yes(s, { exists: { rival: { family: 'qwen', gap: ws - seen + 1e-9 } } });
  });
});

describe('cond：新叶子（P0.3a 登记）读不到 s.sota、s.expect 时按不满足', () => {
  it('sotaMade：true / false / first', () => {
    const s = game();
    delete s.sota;   // P1.1 起开局就有 s.sota；这里测“读不到”的情形
    assert.equal(s.sota, undefined);
    no(s, { sotaMade: true }); yes(s, { sotaMade: false }); no(s, { sotaMade: 'first' });
    s.sota = { before: true, made: [] };
    yes(s, { sotaMade: true }); no(s, { sotaMade: 'first' });
    s.sota = { before: false, made: [{ modelId: 'm', day: s.day, q: 90, via: 'swap' }] };
    yes(s, { sotaMade: 'first' });
  });
  it('expectHot：s.expect.hot 在 45 天内', () => {
    const s = game();
    assert.ok(s.expect && s.expect.hot === null);
    no(s, { expectHot: true }); yes(s, { expectHot: false });
    s.expect.hot = addDays(s.day, -10);
    yes(s, { expectHot: true });
    s.expect.hot = addDays(s.day, -60);
    no(s, { expectHot: true });
  });
  it('canRaise：独立公司、没上市、没有进行中的融资、没有禁止融资的特质', () => {
    // 不用 game()：DeepSeek 的树在 P3.D 起会带上“不拿外部融资”（blocks funding），这里要的是一个没有该特质的独立公司。
    const s = E.createGame('kimi', 'y2025', 1);
    yes(s, { canRaise: true });
    s.capital.round = { left: 2 };
    no(s, { canRaise: true }); yes(s, { canRaise: false });
    const d = E.createGame('qwen', 'y2025', 1);
    no(d, { canRaise: true });
  });
  it('model 的 sota、badge：没有 s.sota 时发布前试算一律不满足；发布后读 snap.sota、snap.badges', () => {
    const s = game();
    delete s.sota;   // P1.1 起开局就有 s.sota；这里测“读不到”的情形
    const m = { ...E.workingModel(s), dims: { knowledge: 99, code: 99, math: 99, writing: 99, safety: 90, agent: 99 } };
    no(s, { model: { sota: true } }, { model: m, preview: true });
    no(s, { working: { sota: true } });
    no(s, { live: { sota: true } });
    no(s, { model: { sota: true } }, { model: m });
    no(s, { model: { badge: 'works' } }, { model: m });
    // 有了 s.sota、sotaWouldTake 返回 null（P1.1 之前的存根）时回退成 lead:0：领先世界最强就算。
    s.sota = { holder: null, made: [], before: false };
    yes(s, { model: { sota: true } }, { model: m, preview: true });
    yes(s, { working: { sota: false } });
    s.sota.holder = { by: 'me', id: E.liveModel(s).id };
    yes(s, { live: { sota: true } });
    no(s, { model: { badge: 'works' } }, { model: { ...m, badges: ['works'] }, preview: true });
    yes(s, { model: { badge: 'works' } }, { model: { ...m, badges: ['works'] } });
  });
});

describe('组合、永久失效、校验', () => {
  it('all / any / not，以及一个对象里写几个键等于 all', () => {
    const s = game();
    yes(s, { all: [{ country: 'CN' }, { mod: 'llm' }] }); no(s, { all: [{ country: 'CN' }, { mod: 'image' }] });
    yes(s, { any: [{ country: 'US' }, { mod: 'llm' }] }); no(s, { any: [{ country: 'US' }, { mod: 'image' }] });
    yes(s, { not: { country: 'US' } }); no(s, { not: { country: 'CN' } });
    yes(s, { country: 'CN', mod: 'llm' }); no(s, { country: 'CN', mod: 'image' });
    assert.equal(cond(s, null), true);
  });
  it('condPermanent：里程碑被别家拿走、互斥节点已完成、授权已用掉、不许出现的技术已学会、不许出现的对手已出现', () => {
    const s = game();
    s.ms = { ms_gpt4: { who: 'gpt' } };
    assert.equal(condPermanent(s, { ms: { ms_gpt4: 'notOther' } }), true);
    assert.equal(condPermanent(s, { ms: { ms_fp8: 'notOther' } }), false);
    assert.equal(condPermanent(s, { notTechs: ['mla'] }), true);
    assert.equal(condPermanent(s, { none: { rival: { open: true } } }), true);
    assert.equal(condPermanent(s, { all: [{ country: 'CN' }, { notTechs: ['mla'] }] }), true);
    assert.equal(condPermanent(s, { any: [{ users: 1e9 }, { notTechs: ['mla'] }] }), false);
    s.strategy = { done: { ds_x: {} }, rights: { hn_a: { used: 'm1' } } };
    assert.equal(condPermanent(s, { notNode: 'ds_x' }), true);
    assert.equal(condPermanent(s, { right: { hn_a: 'held' } }), true);
    assert.equal(condPermanent(s, { users: 1e9 }), false);
  });
  it('condPermanentWhy：永远做不成的那一条怎么说（策略作废的提示用），和 condPermanent 同一口径；没有永久失效时为 null', () => {
    const s = game();
    s.ms = { ms_gpt4: { who: 'gpt' }, ms_mla: { who: 'me' } };
    const W = c => condPermanentWhy(s, c);
    // notTechs：只点已经学会的那项，不再拼成“还没掌握 X，可 X”。
    assert.equal(W({ notTechs: ['engram', 'mla'] }), '已经掌握了「MLA 注意力」，这一项用不上了');
    assert.equal(W({ ms: { ms_gpt4: 'notOther' } }), '第一个 GPT-4 级模型这件事，OpenAI先做到了');
    assert.equal(W({ ms: { ms_mla: 'none' } }), '把 KV 缓存压到很小的注意力这件事，我们已经做到了');
    assert.match(W({ none: { rival: { open: true } } }), /^市面上已经有开源的对手模型了（[^）]+）$/);
    assert.equal(W({ all: [{ country: 'CN' }, { notTechs: ['mla'] }] }), '已经掌握了「MLA 注意力」，这一项用不上了');
    assert.equal(W({ any: [{ users: 1e9 }, { notTechs: ['mla'] }] }), null, 'any 里还有一条有希望');
    s.strategy = { done: { ds_x: {} }, rights: { hn_a: { used: 'm1' }, hn_b: { void: '被抢先' } } };
    assert.equal(W({ notNode: 'ds_x' }), '已经走过策略「ds_x」，这一项不能再做了');
    assert.equal(W({ right: { hn_a: 'held', hn_b: 'held' } }), '型号名「hn_a」的授权已经用过了；型号名「hn_b」的授权已经作废了');
    assert.equal(W({ any: [{ notNode: 'ds_x' }, { notTechs: ['mla'] }] }), '已经走过策略「ds_x」，这一项不能再做了；已经掌握了「MLA 注意力」，这一项用不上了');
    for (const c of [{ users: 1e9 }, { notTechs: ['engram'] }, { ms: { ms_fp8: 'notOther' } }, null]) assert.equal(W(c), null, JSON.stringify(c));
    // 和 condPermanent 同一口径；说法是中文、没有坏值、不带“，可”这种拼接。
    for (const c of [{ notTechs: ['mla'] }, { ms: { ms_gpt4: 'me' } }, { notNode: ['ds_x', 'ds_y'] }, { right: { hn_a: 'held' } }, { none: { rival: { open: false } } }, { all: [{ users: 1 }, { ms: { ms_mla: 'none' } }] }]) {
      assert.equal(!!W(c), condPermanent(s, c), JSON.stringify(c));
      if (W(c)) assert.ok(CJK.test(W(c)) && !/undefined|NaN|null|，可/.test(W(c)), W(c));
    }
  });
  it('validateCond：不认识的叶子、ModelCond 子键、写错的值都报错；词表含 E2 的新键', () => {
    for (const k of ['sotaMade', 'expectHot', 'canRaise', 'firsts', 'released', 'exists', 'none']) assert.ok(COND_KEYS.includes(k), k);
    for (const k of ['sota', 'badge', 'origin', 'role', 'codeOverPrev']) assert.ok(MODEL_COND_KEYS.includes(k), k);
    assert.throws(() => validateCond({ nope: 1 }), /不认识/);
    assert.throws(() => validateCond({ model: { frontier: true } }), /不认识/);
    assert.throws(() => validateCond({ model: { badge: 'gold' } }));
    assert.throws(() => validateCond({ model: { atLeast: { name: '没有这款', d: 1 } } }));
    assert.throws(() => validateCond({ firsts: { n: 1, weeks: 2 } }));
    assert.throws(() => validateCond({ sotaMade: 'yes' }));
    assert.throws(() => validateCond({ any: [] }));
    assert.throws(() => cond(game(), { nope: 1 }));
  });
});
