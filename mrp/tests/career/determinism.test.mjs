// 真实年代经营模式（v0.7）：存档与确定性。原来在 career.test.mjs 里，按 describe 拆成单独的文件。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { resolveAll } from '../helpers/career_bot.mjs';
import { clone } from '../helpers/career_util.mjs';
import * as L from '../helpers/legacy_jobs.mjs';

describe('存档与确定性', () => {
  it('同一种子、同样的操作得到完全相同的结果；存档读回后继续玩结果不变', () => {
    const steps = ['research', 'maintain', 'research', 'research'];
    const play = (s, list) => { for (const st of list) { resolveAll(s); if (s.status === 'playing') L.act(s, st); } };
    const a = E.createGame('deepseek', 'y2024', 99);
    const b = E.createGame('deepseek', 'y2024', 99);
    play(a, steps.slice(0, 2));
    const saved = clone(a);
    play(a, steps.slice(2));
    play(saved, steps.slice(2));
    play(b, steps);
    assert.deepEqual(clone(a), clone(saved));
    assert.deepEqual(clone(a), clone(b));
  });
});
