// 真实年代经营模式（v0.7）：行情。原来在 career.test.mjs 里，按 describe 拆成单独的文件。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { TICKERS } from '../../src/career/data/world.js';
import { months } from '../helpers/career_util.mjs';

describe('行情', () => {
  it('新股上市前不能交易，上市后有价格；港股、A 股按汇率折算', () => {
    assert.equal(E.tickerPrice('2513.HK', '2025-12'), 0);
    assert.ok(E.tickerPrice('2513.HK', '2026-01') > 0);
    assert.equal(E.tickerSeries('0100.HK', '2025-06', '2026-03')[0][0], '2026-01');
    assert.ok(Math.abs(E.tickerPrice('NVDA', '2023-01') - 19.5) < 1);
    assert.ok(E.fx('0700.HK') < 0.2 && E.fx('688795.SS') < 0.2 && E.fx('NVDA') === 1);
  });
  it('每只股票都有完整的月度收盘价', () => {
    for (const t of TICKERS) {
      for (const d of months(t.listed || '2023-01', '2026-09')) assert.ok(t.monthly[d] > 0, `${t.id} ${d}`);
    }
  });
  it('玩家扮演的公司自己的股票不出现在股市里', () => {
    const s = E.createGame('glm', 'y2025', 1);
    assert.ok(E.isMine(s, TICKERS.find(x => x.id === '2513.HK').family));
  });
});
