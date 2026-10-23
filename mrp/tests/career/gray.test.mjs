// 真实年代经营模式（v0.7）：灰色渠道。原来在 career.test.mjs 里，按 describe 拆成单独的文件。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { GPUS } from '../../src/career/data/core.js';
import { resolveAll } from '../helpers/career_bot.mjs';
import { jumpTo } from '../helpers/career_util.mjs';

describe('灰色渠道', () => {
  it('只有中国公司、只在官方买不到时才有；每月限量，价格翻倍，一两个月后才到', () => {
    const us = E.createGame('gpt', 'y2025', 1);
    assert.deepEqual(E.smuggleOffers(us), []);
    const s = E.createGame('deepseek', 'y2025', 1);
    resolveAll(s);
    jumpTo(s, '2025-06');
    const offers = E.smuggleOffers(s);
    assert.ok(offers.find(o => o.id === 'H100') && offers.find(o => o.id === 'B200'));
    assert.ok(!offers.find(o => o.id === 'B300'), 'B300 2025 年底才有货');
    const b200 = offers.find(o => o.id === 'B200');
    assert.ok(b200.price >= GPUS.B200.price * 2);
    const r = E.buySmuggled(s, 'B200', 10000);
    assert.equal(r.n, b200.left);
    assert.ok(s.orders.some(o => o.kind === 'smuggle' && o.n === r.n), '下单后在路上');
    assert.ok(r.eta >= '2025-07-01' && r.eta <= '2025-08-01', `到货日 ${r.eta}`);
    assert.throws(() => E.buySmuggled(s, 'B200', 64), /抢完/);
    jumpTo(s, '2026-03');
    assert.ok(!E.smuggleOffers(s).find(o => o.id === 'H200'), 'H200 放行以后就不用走私了');
  });
  it('买得越多越容易被查；配合调查会被没收一部分卡并罚款', () => {
    let caught = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = E.createGame('kimi', 'y2025', seed);
      resolveAll(s);
      jumpTo(s, '2025-06');
      s.cash = 1e10;
      for (let i = 0; i < 6 && s.status === 'playing'; i++) {
        for (const o of E.smuggleOffers(s)) if (o.left) E.buySmuggled(s, o.id, o.left);
        let hit = false;
        for (let d = 0; d < 31 && s.status === 'playing' && !hit; d++) {
          hit = s.queue[0]?.id === 'smuggle_exposed';
          if (!hit) { resolveAll(s, (ev, opts) => (ev.id === 'smuggle_exposed' ? null : null)); E.tickDay(s); }
        }
        if (hit) {
          caught += 1;
          const grayHeld = () => Object.keys(s.gray.owned).reduce((a, id) => a + (s.gpus.owned[id] || 0), 0);
          const held = grayHeld();
          const cash = s.cash;
          E.resolveEvent(s, 'cooperate');
          assert.ok(grayHeld() < held && s.cash < cash, `${held} → ${grayHeld()}`);
          assert.deepEqual(E.smuggleOffers(s), [], '渠道要断半年');
          break;
        }
      }
    }
    assert.ok(caught >= 4, `12 局里只被查到 ${caught} 次`);
  });
});
