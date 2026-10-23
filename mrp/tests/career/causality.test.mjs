// 真实年代经营模式（v0.7）：因果链。原来在 career.test.mjs 里，按 describe 拆成单独的文件。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { resolveAll, advance, advanceMonth } from '../helpers/career_bot.mjs';
import { pendingEvents, jumpTo } from '../helpers/career_util.mjs';
import * as L from '../helpers/legacy_jobs.mjs';

describe('因果链', () => {
  it('没出现过 429 之前没有降智分流选项；持续 429 才会触发事件并解锁', () => {
    const s = E.createGame('deepseek', 'y2024', 5);
    resolveAll(s);
    assert.equal(s.service.routingUnlocked, false);
    assert.throws(() => E.setRouting(s, 'quant_open'));
    s.gpus.owned = {};
    s.gpus.rented = {};
    s.inferShare = 0.05;
    let saw = false;
    for (let i = 0; i < 8 && s.status === 'playing' && !saw; i++) {
      L.decide(s, 'research');
      advanceMonth(s, (ev, opts) => (ev.id === 'e429' ? opts.find(o => o.id === 'limit') : null));
      saw = s.seen.e429 > 0 || pendingEvents(s).some(q => q.id === 'e429');
      advance(s, 25, (ev, opts) => (ev.id === 'e429' ? opts.find(o => o.id === 'limit') : null));
      saw = saw || s.seen.e429 > 0;
    }
    assert.ok(saw, '服务过载却没有出现 429 事件');
    assert.equal(s.service.routingUnlocked, true);
  });
  it('安全对齐越差，越容易吃安全类官司；同样的模型放在中国压力小得多', () => {
    const count = (safety, country) => {
      let n = 0;
      for (let seed = 1; seed <= 25; seed++) {
        const s = E.createGame('gpt', 'y2025', seed);
        resolveAll(s);
        s.company = { ...s.company, country };
        for (let i = 0; i < 4 && s.status === 'playing'; i++) {
          E.liveModel(s).dims.safety = safety;
          s.legal.cases = [];
          const start = s.date;
          for (let d = 0; d < 40 && s.date === start && s.status === 'playing'; d++) { s.queue = []; E.tickDay(s); }
          n += pendingEvents(s).filter(q => q.id === 'lawsuit' && q.params.type === 'abuse').length;
          s.queue = [];
          s.scheduled = s.scheduled.filter(x => !x.item);
        }
      }
      return n;
    };
    const low = count(35, 'US');
    const high = count(92, 'US');
    const cn = count(35, 'CN');
    assert.ok(low > high, `低安全 ${low} 次，高安全 ${high} 次`);
    assert.ok(low > cn, `美国 ${low} 次，中国 ${cn} 次`);
  });
  it('关于玩家自己公司的真实新闻不会播报，别人能看到', () => {
    const run = id => {
      const s = E.createGame(id, 'y2025', 2);
      resolveAll(s);
      jumpTo(s, '2026-08');
      s.goals = [];
      advance(s, 60);
      return s.news.some(n => n.title.includes('GPT-6'));
    };
    assert.equal(run('gpt'), false);
    assert.equal(run('qwen'), true);
  });
});
