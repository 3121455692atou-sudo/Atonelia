// 真实年代经营模式（v0.7）：超事件。原来在 career.test.mjs 里，按 describe 拆成单独的文件。
import { describe, it } from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { playGame, resolveAll, advance, advanceMonth } from '../helpers/career_bot.mjs';
import { SUPER_EVENTS } from '../../src/career/data/super.js';
import * as L from '../helpers/legacy_jobs.mjs';

describe('超事件', () => {
  it('做到少见的事才触发，只触发一次；选项有效果', () => {
    const s = E.createGame('claude', 'y2026', 3);
    resolveAll(s);
    // P1.4（规格 E4）：开局首月不触发超事件；“新王登基”按 SOTA 标签判定——开局后发布的旗舰持有算数标签满 30 天、领先世界最强 1 分以上。
    // 所以先过第一个月，再发一款远超对手的旗舰，持标满 30 天后的月结才触发。别的超事件当作已经演过，免得它们先占了两个月的间隔。
    advanceMonth(s);
    for (const e of SUPER_EVENTS) if (e.id !== 'super_sota') s.marks[`super:${e.id}`] = s.day;
    const w = E.workingModel(s);
    for (const k of Object.keys(w.dims)) w.dims[k] = 99;
    w.postDays = (w.postDays || 0) + 40;
    s.queue = [];
    L.decide(s, 'release', {});
    advanceMonth(s);
    advanceMonth(s);
    const all = () => [...s.queue, ...s.scheduled.map(x => x.item).filter(Boolean)];
    assert.ok(s.marks['super:super_sota'] || all().some(q => q.id === 'super_sota'), '综合登顶却没有超事件');
    // 出过的超事件记在 s.marks['super:<id>']；数一数这张卡实际弹了几次。
    let shown = 0;
    const pick = (ev, opts) => (ev.id === 'super_sota' ? (shown += 1, opts.find(o => o.id === 'quiet')) : null);
    advance(s, 25, pick);
    assert.equal(shown, 1);
    assert.ok(s.marks['super:super_sota']);
    advanceMonth(s, pick);
    advance(s, 25, pick);
    assert.equal(shown, 1, '只能出现一次');
  });
  it('平常经营不会三天两头出超事件', () => {
    let n = 0;
    for (const [id, sc] of [['qwen', 'y2024'], ['ernie', 'y2025'], ['mistral', 'y2025'], ['stepfun', 'y2026']]) {
      const { s } = playGame(id, sc, 11);
      n += Object.keys(s.marks).filter(k => k.startsWith('super:')).length;
    }
    assert.ok(n <= 6, `4 局里出了 ${n} 个超事件`);
  });
  it('P4.1（规格 F2、E1）：超事件选项的提示由 superActionPlan 的计划提示加 describeEffects 生成，data/super.js 里没有手写的 hint；没有效果的选项用统一文案', () => {
    const src = fs.readFileSync(new URL('../../src/career/data/super.js', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /\bhint\s*:/, 'data/super.js 里不再手写 hint');
    const s = E.createGame('qwen', 'y2025', 7);
    resolveAll(s);
    let seen = 0;
    for (const def of SUPER_EVENTS) {
      s.queue.unshift({ kind: 'super', id: def.id, params: {} });
      let v;
      try { v = E.currentEvent(s, 0); } catch { s.queue.shift(); continue; }
      s.queue.shift();
      for (const c of v.choices) {
        const raw = def.choices.find(x => x.id === c.id);
        const fx = E.describeEffects(raw.effects, s);
        assert.ok(c.hint.length > 0, `${def.id}/${c.id} 没有提示`);
        if (!raw.action && !fx) assert.equal(c.hint, '不花钱，什么都不变', `${def.id}/${c.id}`);
        else if (fx) assert.ok(c.hint.endsWith(fx), `${def.id}/${c.id}：${c.hint} 不以效果描述「${fx}」结尾`);
        seen += 1;
      }
    }
    assert.ok(seen >= 9, `只看到了 ${seen} 个选项`);
  });
});
