// 分岔局的血统按世界公司 id 记（2026-10-23 修）：家族 gpt 的公司 id 是 gpt（OWNER_OF），不是真实 org openai。
// 原来记成 openai，“挡住挑战”（defendOk）和“锚点跳过自家血统”（anchorSkip）拿世界 id 去比，永远对不上。
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { kinOf } from '../../src/career/world/label.js';
import { restoreHistory } from '../helpers/world_provider.mjs';

after(() => restoreHistory());

describe('分岔局血统', () => {
  it('蒸馏了 GPT 的模型，血统里写 gpt（世界公司 id）；defendOk 认得出 GPT 自家血统的挑战者', () => {
    const w = E.createWorld({ mode: 'fork', start: '2024-01', seed: 3, keep: 8, days: 30 });
    assert.ok(w.companies.gpt && w.companies.claude, '分岔局里有 gpt 和 claude');
    const kin = kinOf(w, 'claude', { post: { teachers: { gpt: 1 } } });
    assert.ok(kin.includes('gpt'), JSON.stringify(kin));
    assert.ok(!kin.includes('openai'));
    assert.equal(E.P().defendOk({ org: 'gpt' }, { kin }), false, '挑战者血统里有持有者，挡不住');
  });
  it('从零局不受影响：家族就是公司 id', () => {
    const w = E.createWorld({ seed: 2, start: '2024-01', days: 30, companies: [
      { name: '甲智能', brand: '甲甲', country: 'US', tier: 'specialist', kind: 'bot' },
      { name: '乙智能', brand: '乙乙', country: 'US', tier: 'specialist', kind: 'bot' },
    ] });
    const [a, b] = Object.keys(w.companies);
    assert.deepEqual(kinOf(w, b, { post: { teachers: { [a]: 1 } } }), [a]);
  });
});
