// 联机房间的规则开关（规格 M.6.9）：关做空、关闭源 API 蒸馏、改新手保护天数。
// 只记和默认不同的：默认房间、单人局的世界设置一字不变。
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { NEWBIE } from '../../src/career/data/exchange.js';
import { listCompany, short } from '../../src/career/world/exchange.js';
import { apiBlock } from '../../src/career/world/distill_watch.js';
import { newbieDays } from '../../src/career/world/transfer.js';
import { addDays } from '../../src/career/sim/clock.js';
import { restoreHistory } from '../helpers/world_provider.mjs';

after(() => restoreHistory());

const companies = [
  { name: '甲辰智能', brand: '甲辰', country: 'CN', tier: 'specialist', kind: 'bot' },
  { name: '乙巳智能', brand: '乙巳', country: 'US', tier: 'specialist', kind: 'bot' },
  { name: '丙午智能', brand: '丙午', country: 'EU', tier: 'specialist', kind: 'bot' },
];
const make = (extra = {}) => E.createWorld({ seed: 4, start: '2024-01', days: 365, companies, ...extra });

describe('房间规则开关（M.6.9）', () => {
  it('默认房间的世界设置里没有规则字段；新手保护 120 天', () => {
    const w = make({ short: true, distill: true, protect: NEWBIE.days });
    for (const k of ['short', 'distill', 'protect']) assert.ok(!(k in w.settings), k);
    assert.equal(newbieDays(w), NEWBIE.days);
  });

  it('关做空：开空单被拒，原因写明是房主关的', () => {
    const w = make({ short: false });
    assert.equal(w.settings.short, false);
    w.tick();
    const [a, b] = Object.keys(w.companies).sort();
    const sa = w.companies[a].s, sb = w.companies[b].s;
    sa.valuation = 5e9; sb.cash = 1e9;
    const L = listCompany(w, sa, 0.2);
    L.listedDay = addDays(w.day, -200);
    w.companies[a].joined = addDays(w.day, -200);
    assert.throws(() => short(w, sb, a, 1e5), /房主关了做空/);
  });

  it('关闭源 API 蒸馏：订 API 数据包被拒；改新手保护天数后各处都按新天数', () => {
    const w = make({ distill: false, protect: 30 });
    w.tick();
    const [a, b] = Object.keys(w.companies).sort();
    assert.match(apiBlock(w, w.companies[b].s, a), /房主关了闭源 API 蒸馏/);
    assert.equal(newbieDays(w), 30);
    const fork = E.createWorld({ mode: 'fork', start: '2024-06', days: 200, keep: 6, seats: ['deepseek'], seed: 3, protect: 30, short: false });
    assert.equal(fork.settings.protect, 30);
    assert.equal(fork.settings.short, false);
  });
});
