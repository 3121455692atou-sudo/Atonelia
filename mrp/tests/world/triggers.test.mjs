// M1b-2 行业大事触发器（M.3.9）：每件大事构造条件 → 触发 → 后果；冷却期；公司少于 6 家不触发新管制；价格战不点玩家自家。
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { addDays } from '../../src/career/sim/clock.js';
import { checkTriggers } from '../../src/career/world/triggers.js';
import { apiPriceOf } from '../../src/career/world/market.js';
import { restoreHistory } from '../helpers/world_provider.mjs';

const names = ['晨星', '北岭', '蓝鲸', '泰拉', '流光', '山巅'];
const companies = (n = 6) => names.slice(0, n).map((name, i) => ({
  name: `${name}智能`, brand: name, country: ['CN', 'US', 'EU'][i % 3], tier: 'specialist', kind: 'bot',
}));
const worldOf = (n = 6, seed = 1) => E.createWorld({ seed, start: '2024-01', days: 730, companies: companies(n) });
const dims = q => ({ knowledge: q, code: q, math: q, writing: q, agent: q, safety: q });
const ids = world => Object.keys(world.companies).sort();
function addLive(world, org, q) {
  const s = world.companies[org].s;
  const m = { id: `m_${org}`, stage: 'released', role: 'flagship', name: `模型 ${org}`, dims: dims(q), open: false, released: '2024-01', releasedDay: '2024-01-01' };
  s.models.push(m);
  s.live = m.id;
  s.products.api.on = true;
  s.products.api.tier = 'budget';
  return m;
}
function row(world, org, name, q, { open = false, price = 'standard', day = '2024-01-01' } = {}) {
  const id = `r_${name}`;
  world.relMeta[id] = { org, relId: id, name, q, dims: dims(q), day, date: day.slice(0, 7), open, price, kin: [], techs: [], cls: 'mid' };
  return id;
}
const priceNews = (s) => (s.news || []).find(x => x.type === 'price');

after(() => restoreHistory());

describe('行业大事触发器（M.3.9）', () => {
  it('价格战：榜单前三有普惠旗舰时触发，写入地区标记和 180 天冷却；玩家自家的新闻不点自家的名', () => {
    const world = worldOf();
    const [a] = ids(world);
    addLive(world, a, 48);
    world.label.holder = { org: 'x', q: 50 };
    const day = '2024-01-20';
    // 先把 API 参考价记两次，免得 priceDrop 分支干扰。
    checkTriggers(world, day);
    const fired = world.flags.triggerLog.at(-1);
    assert.deepEqual(fired.kinds, ['pricewar']);
    assert.equal(Object.keys(world.flags.priceWar).length, 1, '没有写价格战地区');
    assert.ok(priceNews(world.companies[a].s), '玩家自家没有收到价格战新闻');
    const news = priceNews(world.companies[a].s);
    assert.ok(!news.title.includes(world.companies[a].name) && !news.detail.includes(world.companies[a].name), '价格战新闻点了玩家自家的名');
    // 冷却期内不再触发。
    const n = world.flags.triggerLog.length;
    checkTriggers(world, addDays(day, 10));
    assert.equal(world.flags.triggerLog.length, n, '冷却期内又触发了价格战');
  });

  it('开源冲击：算力指数 −10% 到 −17%、API 参考价 −10%，90 天恢复；同模态 180 天内只一次', () => {
    const world = worldOf();
    const [a, b] = ids(world);
    row(world, a, '闭源旗舰', 60);
    row(world, b, '开放权重', 59, { open: true });
    world.label.holder = { org: a, q: 60 };
    const day = '2024-02-01';
    const before = apiPriceOf(world, 'global', day);
    checkTriggers(world, day);
    assert.ok(world.flags.chipShock <= -0.10 && world.flags.chipShock >= -0.17, `冲击 ${world.flags.chipShock} 不在 −10% 到 −17%`);
    assert.equal(world.flags.apiShocks.length, 1);
    assert.ok(Math.abs(apiPriceOf(world, 'global', day) / before - 0.9) < 1e-9, 'API 参考价没有降一成');
    checkTriggers(world, addDays(day, 100));
    assert.equal(world.flags.chipShocks.length, 1, '180 天冷却内又触发了一次开源冲击');
    // 90 天后线性恢复到 0。
    checkTriggers(world, addDays(day, 90));
    assert.ok(Math.abs(world.flags.chipShock) < 1e-9, `90 天后冲击还剩 ${world.flags.chipShock}`);
  });

  it('出口管制：6 家、中国公司连续 60 天在前三且离榜首不到 3 分才触发；管制满 365 天且安静 180 天后放宽', () => {
    const world = worldOf(6);
    // 2024 年开局本来就有前人留下的管制；先清掉，看触发器自己会不会重新扩大。
    world.flags.export = false;
    world.flags.exportSince = null;
    const cn = ids(world).find(id => world.companies[id].s.company.country === 'CN');
    const us = ids(world).find(id => world.companies[id].s.company.country === 'US');
    row(world, cn, '中国旗舰', 70);
    row(world, us, '美国旗舰', 69);
    world.label.holder = { org: us, q: 69 };
    let day = '2024-01-01';
    for (let i = 0; i < 65; i++) { checkTriggers(world, day); day = addDays(day, 1); }
    assert.equal(world.flags.export, true, '连续 60 天后没有扩大管制');
    assert.ok(world.flags.exportSince);
    // 满 365 天、最近 180 天没有中国公司逼近榜首 → 放宽。
    world.flags.exportSince = '2023-01-01';
    world.flags.cnThreatDay = '2023-06-01';
    world.label.holder = { org: us, q: 100 };
    checkTriggers(world, '2024-08-01');
    assert.equal(world.flags.export, false, '该放宽时没有放宽');
  });

  it('公司少于 6 家不触发新的出口管制', () => {
    const world = worldOf(3);
    world.flags.export = false;
    world.flags.exportSince = null;
    const cn = ids(world).find(id => world.companies[id].s.company.country === 'CN');
    const us = ids(world).find(id => world.companies[id].s.company.country === 'US');
    row(world, cn, '中国旗舰', 70);
    row(world, us, '美国旗舰', 69);
    world.label.holder = { org: us, q: 69 };
    let day = '2024-01-01';
    for (let i = 0; i < 90; i++) { checkTriggers(world, day); day = addDays(day, 1); }
    assert.equal(world.flags.export, false, '3 家也触发了出口管制');
  });

  it('反垄断：3 家在卖 API、份额过半 90 天，给那家排一张二选一的卡；选罚款扣 3 倍月收入', () => {
    const world = worldOf(6);
    const orgs = ids(world).slice(0, 3);
    const s = world.companies[orgs[0]].s;
    s.history.push({ date: '2024-01', revenue: 1e7 });
    world.market.table = {
      'api|global': {
        product: 'api', region: 'global', day: '2024-01-31',
        rows: [{ org: orgs[0], share: 0.6 }, { org: orgs[1], share: 0.2 }, { org: orgs[2], share: 0.2 }],
        outside: { share: 0 },
      },
    };
    let day = '2024-01-01';
    for (let i = 0; i < 91; i++) { checkTriggers(world, day); day = addDays(day, 1); }
    const at = s.queue.findIndex(q => q.kind === 'antitrust');
    assert.ok(at >= 0, '没有排反垄断卡');
    assert.equal(E.currentEvent(s, at).choices.length, 2, '反垄断不是二选一');
    const before = s.cash;
    E.resolveEvent(s, 'fine', at);
    assert.equal(s.cash, before - 3e7, '罚款不是月收入的 3 倍');
  });

  it('版权官司：月收入超过 5000 万美元而且语料有 pirated / unclear 时立案；365 天内只一次', () => {
    const world = worldOf(1);
    const [org] = ids(world);
    const s = world.companies[org].s;
    s.history.push({ date: '2024-01', revenue: 6e7 });
    s.data.risky = { ds_books3: true };
    checkTriggers(world, '2024-02-01');
    assert.ok(s.queue.some(q => q.kind === 'event' && q.id === 'lawsuit'), '没有排版权官司卡');
    assert.ok(s.legal.cases.length === 0 && s.queue.some(q => q.params?.type === 'books'));
    // 撤掉队列再试一次：还没过 365 天，不该再立案。
    s.queue = s.queue.filter(q => q.id !== 'lawsuit');
    checkTriggers(world, addDays('2024-02-01', 100));
    assert.ok(!s.queue.some(q => q.id === 'lawsuit'), '365 天冷却内又立案了');
  });
});
