// 真实年代经营模式（v0.7）：整局流程。原来在 career.test.mjs 里，按 describe 拆成单独的文件。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { playGame } from '../helpers/career_bot.mjs';

describe('整局流程', () => {
  const runs = [['qwen', 'y2023', 1], ['deepseek', 'y2024', 2], ['claude', 'y2025', 3], ['suno', 'y2024', 4], ['elevenlabs', 'y2025', 5], ['midjourney', 'y2023', 6], ['rwkv', 'y2024', 7], ['gemini', 'y2025', 8],
    ['glm', 'y2026', 9], ['fable', 'y2026', 10], ['image2', 'y2026', 11]];
  for (const [id, sc, seed] of runs) {
    it(`${id} · ${sc} 能完整打完，没有非法操作`, () => {
      const { s, errors } = playGame(id, sc, seed);
      assert.deepEqual(errors, []);
      assert.notEqual(s.status, 'playing');
      assert.ok(s.result && s.result.rank, `${id} 没有结算`);
    });
  }
});
