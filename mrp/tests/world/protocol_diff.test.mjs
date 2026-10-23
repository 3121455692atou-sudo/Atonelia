// 二级差分（规格 M.6.1）的往返：真世界逐日算公开视图的差分，客户端按差分把前一天的视图补成当天的，必须和服务器的逐项相等。
// P4.2 起股市（exchange）按股票再拆一层，价格历史只发新追加的几天；满 400 条以后带“前面截掉几条”。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { diffState, applyDiff } from '../../src/career/net/protocol.js';
import { roomSettings } from '../helpers/mp_server.mjs';

const clone = x => JSON.parse(JSON.stringify(x));

describe('二级差分往返（公开视图）', () => {
  it('8 家联机世界走 500 天：每天按差分补出来的公开视图等于服务器的；股市每天的差分远小于整块', () => {
    const world = E.createWorld({ ...roomSettings({ days: 730 }), mp: true });
    let server = clone(E.publicView(world));
    let client = clone(server);
    let exDiff = 0, exWhole = 0, listedDays = 0;
    for (let day = 0; day < 500; day++) {
      world.tick();
      const cur = clone(E.publicView(world));
      const d = diffState(server, cur);
      client = applyDiff(client, clone(d));
      assert.deepEqual(client, cur, `第 ${day + 1} 天补出来的视图和服务器的不一样`);
      if (d?.exchange && Object.keys(cur.exchange?.listings || {}).length) {
        listedDays++;
        assert.ok(d.exchange.ex, '股市走分层差分，不整块发');
        exDiff += JSON.stringify(d.exchange).length;
        exWhole += JSON.stringify(cur.exchange).length;
      }
      server = cur;
    }
    assert.ok(listedDays > 30, `500 天里有股票挂牌的日子只有 ${listedDays} 天，测不到股市差分`);
    assert.ok(exDiff < exWhole * 0.2, `股市差分 ${exDiff} 字节，整块 ${exWhole} 字节`);
  });

  it('有上限的追加列表：满了以后尾部加、头部截，差分只带新条目和截掉的条数', () => {
    const prev = { exchange: { listings: { a: { org: 'x', hist: Array.from({ length: 400 }, (_, i) => [i, i]) } } } };
    const cur = clone(prev);
    cur.exchange.listings.a.hist.push([400, 400]);
    cur.exchange.listings.a.hist.splice(0, 1);
    const d = diffState(prev, cur);
    assert.deepEqual(d.exchange.ex.listings.upd.a.hist, { back: [[400, 400]], drop: 1 });
    assert.deepEqual(applyDiff(clone(prev), clone(d)), cur);
    // 新上市、退市、别的子键变化。
    const cur2 = clone(cur);
    cur2.exchange.listings.b = { org: 'y', hist: [[1, 2]] };
    delete cur2.exchange.listings.a;
    cur2.exchange.sector = { llm: 1 };
    const d2 = diffState(cur, cur2);
    assert.deepEqual(d2.exchange.ex.listings.del, ['a']);
    assert.deepEqual(d2.exchange.ex.listings.add.b, { org: 'y', hist: [[1, 2]] });
    assert.deepEqual(d2.exchange.ex.sub.sector, { llm: 1 });
    assert.deepEqual(applyDiff(clone(cur), clone(d2)), cur2);
  });
});
