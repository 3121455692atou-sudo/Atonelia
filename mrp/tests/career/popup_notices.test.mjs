// 弹窗预算（P4.2“弹窗”，规格 E4）：完成类提示每局只弹第一次卡片，之后只进新闻；
// 挂牌（资本页的“上市了”）没有选项，直接进新闻。两种玩法（机器人、大按钮）走的是同一套规则。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { finishJob } from '../../src/career/sim/projects.js';
import { capitalProcesses } from '../../src/career/sim/capital.js';
import { playGame, resolveAll } from '../helpers/career_bot.mjs';

const report = () => ({ notes: [], costs: { total: 0 }, revenue: 0 });
const fresh = (c = 'gpt', sc = 'y2023') => { const s = E.createGame(c, sc, 1); resolveAll(s); s.queue = []; s.news = []; return s; };
// 开工以后直接结算：测的是“练完时入队”的那一步，不花时间跑完整个工期。
const finish = (s, spec) => { const j = E.startJob(s, spec); assert.ok(j, '作业没能开工'); finishJob(s, j, report()); };
const cardN = (s, title) => s.queue.filter(q => q.kind === 'notice' && q.title === title).length;
const newsN = (s, title) => s.news.filter(n => n.title === title).length;
const BASE = { kind: 'pretrain', line: 'main', cfg: { total: 7, active: 7, arch: 'dense', tokens: 1 } };
const SMALL = { kind: 'distill', cfg: { teacher: 'self', total: 7, active: 7, arch: 'dense', tokens: 1.5 } };

describe('E4 弹窗预算：完成类提示每局只弹第一次', () => {
  it('预训练完成：第一款底座弹一张卡片，之后只发新闻；新闻正文和卡片一样，照样写型号和下一步', () => {
    const s = fresh();
    finish(s, BASE);
    assert.equal(cardN(s, '预训练完成'), 1);
    assert.equal(newsN(s, '预训练完成'), 0);
    assert.equal(s.flags.noticeSeen.first_release_hint, s.day, '记下这一局已经弹过');
    const first = s.queue.find(q => q.kind === 'notice');
    E.resolveEvent(s, 'ok');
    finish(s, BASE);
    assert.equal(cardN(s, '预训练完成'), 0, '第二款不再占弹窗');
    assert.equal(newsN(s, '预训练完成'), 1);
    assert.match(s.news.find(n => n.title === '预训练完成').detail, /底座训练完了/);
    assert.match(first.text, /底座训练完了/);
  });
  it('小模型蒸馏完成：同样只弹第一次', () => {
    const s = fresh();
    finish(s, SMALL);
    assert.equal(cardN(s, '小模型蒸馏完成'), 1);
    E.resolveEvent(s, 'ok');
    finish(s, SMALL);
    finish(s, SMALL);
    assert.equal(cardN(s, '小模型蒸馏完成'), 0);
    assert.equal(newsN(s, '小模型蒸馏完成'), 2);
    assert.equal(s.flags.noticeSeen.small_ready, s.day);
  });
  it('两种提示各记各的：第一款小模型不会因为预训练弹过就省掉', () => {
    const s = fresh();
    finish(s, BASE);
    finish(s, SMALL);
    assert.equal(cardN(s, '预训练完成'), 1);
    assert.equal(cardN(s, '小模型蒸馏完成'), 1);
  });
  it('机器人整局：完成类提示每局最多各出现一张（换了好几代底座也一样）', () => {
    for (const [c, sc] of [['gpt', 'y2023'], ['deepseek', 'y2024'], ['suno', 'y2024']]) {
      const seen = {};
      playGame(c, sc, 1, {
        pick: ev => {
          if (ev.kind === 'notice' && ['预训练完成', '小模型蒸馏完成'].includes(ev.title)) seen[ev.title] = (seen[ev.title] || 0) + 1;
          return null;
        },
      });
      for (const [title, n] of Object.entries(seen)) assert.ok(n <= 1, `${c} ${sc}「${title}」弹了 ${n} 张`);
    }
  });
});

describe('E4 弹窗预算：挂牌只进新闻，不占卡片', () => {
  it('上市到期：队列里没有“上市了”卡片，新闻里有一条 type=ipo', () => {
    const s = fresh('glm', 'y2026');
    // 直接把挂牌排到今天：测的是 capitalProcesses 结算挂牌时往哪里写，不测上市资格。
    s.capital.ipo = { ticker: '2513.HK' };
    s.due.ipo = s.day;
    capitalProcesses(s, { notes: [] });
    assert.equal(cardN(s, '上市了'), 0);
    const n = s.news.find(x => x.title === '上市了');
    assert.ok(n, '新闻里有挂牌');
    assert.equal(n.type, 'ipo');
    assert.ok(s.capital.listed || s.capital.ipo === null);
  });
});
