// M1b-2 名字账本与打榜（M.5.4）：三样查重、送评占名/撤回释放、已发布提示、真实型号名、品牌词、系列词、近似名异议、打榜。
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { claimName, releaseName, nameTakenMessage, registerSeries, seriesWords, objectionTick, noteRelease, scoreRelease, normName } from '../../src/career/world/names.js';
import { submitEval, cancelEval } from '../../src/career/sim/evals.js';
import { restoreHistory } from '../helpers/world_provider.mjs';

const names = ['晨星', '北岭', '蓝鲸', '泰拉', '流光', '山巅'];
const companies = (n = 3) => names.slice(0, n).map((name, i) => ({
  name: `${name}智能`, brand: name, country: ['CN', 'US', 'EU'][i % 3], tier: 'specialist', kind: 'bot',
}));
const worldOf = (n = 3) => E.createWorld({ seed: 1, start: '2024-01', days: 730, companies: companies(n) });
const dims = q => ({ knowledge: q, code: q, math: q, writing: q, agent: q, safety: q });
const ids = world => Object.keys(world.companies).sort();

after(() => restoreHistory());

describe('名字账本（M.5.4）', () => {
  it('三样查重：normName、relId、原样名字都查；Beta(1) 和 Beta1 撞 relId', () => {
    const world = worldOf();
    const [a, b] = ids(world);
    assert.equal(claimName(world, a, 'Beta(1)', { evalId: 'e1', modelId: 'm1' }), null);
    assert.equal(nameTakenMessage(world, b, 'Beta1'), '这个名字已经被别家预订了');
    assert.equal(nameTakenMessage(world, b, 'Beta(1)'), '这个名字已经被别家预订了');
    assert.equal(nameTakenMessage(world, b, 'beta（1）'), '这个名字已经被别家预订了');
    assert.equal(nameTakenMessage(world, b, 'Gamma 9'), null, '不相关的名字被误判成重名');
  });

  it('送评时登记、评测期间占着、撤回时释放；同一天第二家被拒且不泄露是谁', () => {
    const world = worldOf();
    const [a, b] = ids(world);
    const s = world.companies[a].s;
    s.models.push({ id: 'm1', stage: 'post', postDays: 30, relDays: 0, releases: 0, role: 'flagship', dims: dims(50), name: null, techs: [] });
    s.working = 'm1';
    const r = submitEval(s, { modelId: 'm1', tier: 'quick', opts: { name: 'Zeta Prime' } });
    assert.ok(world.names[normName('Zeta Prime')]?.evalId, '送评没有登记名字');
    const why = nameTakenMessage(world, b, 'Zeta Prime');
    assert.equal(why, '这个名字已经被别家预订了');
    assert.ok(!why.includes(world.companies[a].name), '提示泄露了别家的名字');
    cancelEval(s, r.eval.id);
    assert.equal(world.names[normName('Zeta Prime')], undefined, '撤回送评没有释放名字');
  });

  it('两家的模型 id 碰巧相同（分岔局都从 m1_… 起）：别家占着的名字不算自己的，建议名会跳到下一个', () => {
    // M1c 分岔 20 家实测：Fable 和 Claude 的在练模型 id 都是 m1_2024-01w，Claude 先占了 “Claude 2.2”，
    // 账本按 modelId 把它当成 Fable 自己的，Fable 的建议名还是 “Claude 2.2”，送评时被拒。
    const world = worldOf();
    const [a, b] = ids(world);
    const sa = world.companies[a].s;
    sa.models.push({ id: 'm1_same', stage: 'post', postDays: 30, relDays: 0, releases: 0, role: 'flagship', dims: dims(50), name: null, techs: [] });
    sa.working = 'm1_same';
    submitEval(sa, { modelId: 'm1_same', tier: 'quick', opts: { name: 'Zeta Prime' } });
    assert.equal(nameTakenMessage(world, b, 'Zeta Prime', 'm1_same'), '这个名字已经被别家预订了');
    assert.equal(nameTakenMessage(world, a, 'Zeta Prime', 'm1_same'), null, '自己同一个模型的登记不算撞名');
  });

  it('已发布的名字提示是谁的；真实型号名永远保留', () => {
    const world = worldOf();
    const [a, b] = ids(world);
    const row = { family: a, org: a, modelId: 'm1', date: '2024-01', day: '2024-01-10', name: 'Beta Prime', cls: 'mid', open: false, price: 'standard', dims: dims(50), q: 50, kin: [] };
    const { meta } = E.appendRelease(world, row);
    noteRelease(world, a, 'Beta Prime');
    scoreRelease(world, meta);
    const why = nameTakenMessage(world, b, 'Beta Prime');
    assert.ok(why.includes(world.companies[a].name) && why.includes('Beta Prime'), why);
    assert.match(claimName(world, b, 'GPT-4') || '', /现实里的型号名/);
  });

  it('不能以别家的品牌词开头；系列词每家最多 2 个，黑名单和太短的词不登记', () => {
    const world = worldOf();
    const [a, b] = ids(world);
    const why = claimName(world, b, `${world.companies[a].brand} 1`);
    assert.match(why || '', /品牌词/);
    assert.match(claimName(world, b, 'Claude Nova') || '', /品牌词/, '真实公司的品牌词没有拦住');
    assert.equal(claimName(world, a, `${world.companies[a].brand} 1`), null, '自家品牌词也起不了名');
    assert.equal(registerSeries(world, a, 'Alpha 1'), 'Alpha');
    assert.equal(registerSeries(world, a, 'Beta 2'), 'Beta');
    assert.equal(registerSeries(world, a, 'Gamma 3'), null);
    assert.deepEqual(seriesWords(world, a), ['Alpha', 'Beta']);
    assert.equal(registerSeries(world, a, 'AI 4'), null, '黑名单里的词登记成了系列词');
    assert.equal(registerSeries(world, a, 'Ai 5'), null);
  });

  it('近似名可以起；品牌词所有者 30 天内只能异议一次，电脑公司按现金流选和解', () => {
    const world = E.createWorld({
      seed: 2, start: '2024-01', days: 730,
      companies: [{ name: 'Beta 实验室', brand: 'Beta', country: 'US', tier: 'specialist', kind: 'bot' },
        { name: 'Gamma 实验室', brand: 'Gamma', country: 'US', tier: 'specialist', kind: 'bot' }],
    });
    const [owner, other] = ids(world);
    assert.equal(claimName(world, other, 'Bota', { evalId: 'e1', modelId: 'm1' }), null);
    const entry = world.names[normName('Bota')];
    assert.equal(entry.similar.owner, owner, '没有记下近似名的品牌词所有者');
    const s = world.companies[other].s;
    s.cash = 1e7;
    s.history.push({ date: '2024-01', revenue: 1e7 });
    objectionTick(world, '2024-01-02');
    assert.equal(entry.similar.filed, true, '没有提异议');
    assert.equal(entry.objected, true);
    assert.equal(s.cash, 9e6, '没有按月收入的 10% 和解');
    // 同一个名字只能被异议一次。
    objectionTick(world, '2024-01-03');
    assert.equal(s.cash, 9e6);
  });

  it('打榜：每个已上线基准都有分，所有公司看到同一个数；刷榜只改发布行，不改 SOTA', () => {
    const world = worldOf();
    const [a] = ids(world);
    const row = { family: a, org: a, modelId: 'm1', date: '2024-01', day: '2024-01-10', name: 'Score One', cls: 'mid', open: false, price: 'standard', dims: dims(50), q: 50, kin: [] };
    const { meta } = E.appendRelease(world, row);
    const first = scoreRelease(world, meta);
    assert.ok(Object.keys(first).length >= 5, `只打了几项：${Object.keys(first).length}`);
    assert.ok(Object.keys(first).every(id => Number.isFinite(first[id])));
    const again = scoreRelease(world, meta);
    assert.deepEqual(again, first, '同一款两次打出来的分不一样');
    const noBoost = first.arena;
    world.label.holder = { org: a, q: 50 };
    scoreRelease(world, meta, { boost: { arena: { since: '2024-01', pts: 10 } } });
    assert.ok(meta.bench.arena > noBoost, '刷榜增益没有写进发布行');
    assert.equal(world.label.holder.q, 50, '刷榜改变了 SOTA');
  });
});
