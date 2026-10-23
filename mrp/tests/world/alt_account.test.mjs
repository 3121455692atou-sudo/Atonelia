// M2 验收 ⑤（规格 M.5.9、F2 M2 行、F4a）：“小号送钱”和“只买卡出租”两个脚本（scripts/alt_account.mjs）。
// 小号送钱按账本算：主号从小号那里入账的钱折成身家（× 持股 × 未上市 0.8），不超过主号身家的 10%；
// 送钱效率 = 这笔 ÷ 小号开局身家（小号整个牺牲掉），不超过 30%。两局对比（有小号 / 小号什么都不做）的差额
// 被世界本身的分叉淹没（实测 ±2%–20%，送到的钱只占 0.04%–0.2%），只在命令行里报数，不做断言。
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { runAlt, runLessor } from '../../scripts/alt_account.mjs';
import { TRANSFER } from '../../src/career/data/exchange.js';
import { restoreHistory } from '../helpers/world_provider.mjs';

after(() => restoreHistory());

describe('M2 验收 ⑤：小号送钱、只买卡出租', () => {
  it('小号送钱 2 年（普通电脑陪跑）：主号入账折成身家 ≤ 主号身家 10%，送钱效率 ≤ 30%；每年最多 2 个包', () => {
    const r = runAlt({ seed: 1, days: 730, send: true, bot: 'normal' });
    assert.ok(r.paid > 0, '小号确实送了钱');
    assert.ok(Math.abs(r.booked - r.paid * TRANSFER.BOOK) / r.paid < 0.01, `入账 ${r.booked} / 付 ${r.paid}`);
    assert.ok(r.packs <= 2 * 3, `两年最多 2×(跨的游戏年数) 个包：${r.packs}`);
    const direct = r.booked * r.mainEq * (r.mainListed ? 1 : 0.8);
    assert.ok(direct <= 0.10 * r.mainW, `主号增量 ${(100 * direct / r.mainW).toFixed(2)}%`);
    assert.ok(direct / r.alt0 <= 0.30, `送钱效率 ${(direct / r.alt0).toFixed(3)}`);
  });

  it('只买卡出租、不练模型：两年后身家排不进前一半', () => {
    const r = runLessor({ seed: 1, days: 730 });
    assert.ok(r.cards > 1000, `买了 ${r.cards} 张卡`);
    assert.ok(r.rank > Math.ceil(r.n / 2), `第 ${r.rank}/${r.n} 名：${JSON.stringify(r.wealth)}`);
  });
});
