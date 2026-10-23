// 真实年代经营模式（v0.7）：同一家公司。原来在 career.test.mjs 里，按 describe 拆成单独的文件。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { resolveAll } from '../helpers/career_bot.mjs';
import * as L from '../helpers/legacy_jobs.mjs';

describe('同一家公司', () => {
  it('玩 Claude 时，同属 Anthropic 的 Fable 不会作为对手凭空出现；别家照常能看到', () => {
    // 对手按日可见（规格 D2）：日期和“今天”一起挪到 2026 年 7 月，Fable 5 已经发布。
    const s = E.createGame('claude', 'y2026', 1);
    Object.assign(s, { date: '2026-07', day: '2026-07-01' });
    assert.ok(!E.leaderboard(s, 'hle').rows.some(r => r.family === 'fable'));
    assert.ok(!E.rivalStandings(s).some(r => r.rel.family === 'fable'));
    const q = E.createGame('qwen', 'y2026', 1);
    Object.assign(q, { date: '2026-07', day: '2026-07-01' });
    assert.ok(E.leaderboard(q, 'hle').rows.some(r => r.family === 'fable'));
  });
  it('自家的编程工具不会来申请接入，而且上线后自动算已接入', () => {
    for (const [id, tool] of [['claude', 'claude_code'], ['gpt', 'codex'], ['gemini', 'antigravity']]) {
      const s = E.createGame(id, 'y2026', 2);
      resolveAll(s);
      for (let i = 0; i < 6 && s.status === 'playing'; i++) {
        s.service.integrations.asked = [];
        L.act(s, 'research');
        for (const q of s.queue.filter(x => x.id === 'integration')) assert.notEqual(q.params.tool, tool, `${id} 收到了自家 ${tool} 的接入申请`);
        resolveAll(s);
      }
    }
  });
});
