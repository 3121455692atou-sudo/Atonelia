// 机器人定价（P4.2 Meta 收入）：机器人以前一直停在开局时史实发布的价格档，
// 模型换代、对手变强以后既不提价也不降价，收入白白漏掉。现在每月按“收入 − 推理成本”逐档试算。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { PRICE_TIERS } from '../../src/career/data/core.js';
import { resolveAll, advance, botStep } from '../helpers/career_bot.mjs';

// 只跑前几周：定价每月算一次，三个月足够看清它有没有离开开局档位。
function run(id, sc, seed, weeks) {
  const s = E.createGame(id, sc, seed);
  resolveAll(s);
  const errors = [];
  for (let i = 0; i < weeks; i++) { botStep(s, errors); advance(s, 7); }
  return { s, errors };
}
// 和 freeOps 里同一把尺子：这一档带来的收入减掉全部推理成本（其他产品不变，所以只比档位差）。
function contribution(s, pid, tier) {
  const pv = E.previewService(s, { [pid]: { tier } });
  return (pv.revenue?.[pid] || 0) - (pv.serve || 0);
}

describe('机器人定价', () => {
  it('llama y2025：三个月后不再停在标准价，选的是贡献最高的一档', () => {
    const { s, errors } = run('llama', 'y2025', 1, 12);
    assert.deepEqual(errors, []);
    for (const pid of ['chat', 'api']) {
      const p = s.products[pid];
      assert.ok(p.on, `${pid} 应该已经上线`);
      const cur = contribution(s, pid, p.tier);
      for (const tier of Object.keys(PRICE_TIERS)) {
        assert.ok(cur >= contribution(s, pid, tier) - 1e-6, `${pid} 的 ${p.tier} 不是收入减推理成本最高的档位`);
      }
    }
    assert.notEqual(s.products.chat.tier, 'standard', '机器人还停在开局的标准价');
  });

  it('手里握着要求 API 普惠或标准档的授名（GPT-4o）时，API 只在这两档里挑；没有这条授权时照常按贡献定价', () => {
    const { s, errors } = run('gpt', 'y2023', 1, 12);
    assert.deepEqual(errors, []);
    const reprice = t => { t.flags.botPriceMonth = null; botStep(t, []); return t.products.api.tier; };
    // 没有授权：领先的 GPT 按贡献会定旗舰价（这条约束要起作用的前提）。
    const free = JSON.parse(JSON.stringify(s));
    assert.equal(reprice(free), 'premium');
    // 握着 GPT-4o 的授权（条件里要求 API 普惠或标准档）：只在这两档里挑。
    const held = JSON.parse(JSON.stringify(s));
    held.strategy.rights.hn_gpt4o = { day: held.day, until: '2027-01-01', used: null, void: null };
    assert.ok(['budget', 'standard'].includes(reprice(held)), `API 是 ${held.products.api.tier} 档`);
  });

  it('算力出租没有价格档：机器人不把它打开，也不改它的档位', () => {
    const { s } = run('llama', 'y2025', 1, 12);
    assert.equal(s.products.gpu_lease.on, false);
    assert.equal(s.products.gpu_lease.tier, 'standard');
  });
});
