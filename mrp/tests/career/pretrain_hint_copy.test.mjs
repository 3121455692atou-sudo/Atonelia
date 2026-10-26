import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { EVENTS } from '../../src/career/data/events.js';
import { SCALES } from '../../src/career/data/core.js';
import { noticeOf, fill } from '../../src/career/sim/queue.js';
import { finishJob } from '../../src/career/sim/projects.js';

const cases = [
  ['llm', 'gpt', /指令遵循、任务能力/, /画面质量|作曲|语音自然度/],
  ['image', 'midjourney', /画面质量、提示词遵循/, /指令遵循|作曲|语音自然度/],
  ['music', 'suno', /作曲、演唱、音质/, /指令遵循|画面质量|语音自然度/],
  ['speech', 'elevenlabs', /语音自然度、声音表现、多语言能力/, /指令遵循|画面质量|作曲/],
];
const fresh = company => {
  const s = E.createGame(company, 'y2026', 31);
  s.queue = []; s.news = [];
  return s;
};
const badCopy = /只会续写|不会好好对话|只会接着别人的话|几个月|\d+\s*(?:天|日|周|个月)/;
const assertCopy = (text, expected, irrelevant) => {
  assert.match(text, expected);
  assert.doesNotMatch(text, irrelevant);
  assert.doesNotMatch(text, badCopy);
  assert.match(text, /训练安排以所选计划为准/);
  assert.match(text, /是否可送评请查看送评面板/);
};
for (const [mod, company, expected, irrelevant] of cases) {
  test(`${mod}: notice selects appropriate training copy without a fixed duration or state mutation`, () => {
    const s = fresh(company);
    assert.equal(s.mod, mod);
    const before = structuredClone(s), definitions = structuredClone(EVENTS);
    const notice = noticeOf(s, 'first_release_hint', { model: '测试代号' });
    assert.equal(notice.kind, 'notice');
    assert.equal(notice.title, '预训练完成');
    assert.ok(notice.text.startsWith('测试代号 的底座训练完了。'));
    assertCopy(notice.text, expected, irrelevant);
    assert.deepEqual(s, before);
    assert.deepEqual(EVENTS, definitions, 'one modality must not overwrite shared templates');
    s.queue.push(notice);
    const view = E.currentEvent(s);
    assert.equal(view.text, notice.text);
    assert.deepEqual(view.choices, [{ id: 'ok', label: '知道了', hint: '' }]);
    const beforeDismiss = structuredClone(s);
    E.resolveEvent(s, 'ok');
    beforeDismiss.queue.shift();
    assert.deepEqual(s, beforeDismiss, 'dismissing the tutorial must not start training or change resources');
  });
  test(`${mod}: the legacy event path uses the same body and neutral dialogue`, () => {
    const s = fresh(company);
    s.queue = [{ kind: 'event', id: 'first_release_hint', params: { model: '测试代号' } }];
    const before = structuredClone(s);
    const view = E.currentEvent(s);
    assertCopy(view.text, expected, irrelevant);
    assert.equal(view.text, noticeOf(s, 'first_release_hint', { model: '测试代号' }).text);
    assert.equal(view.lines[0].text, '底座练好了，接下来按计划继续打磨！');
    assert.doesNotMatch(view.lines.map(l => l.text).join(''), badCopy);
    assert.deepEqual(s, before);
  });
  test(`${mod}: real completion hook freezes the correct first notice and subsequent news`, () => {
    const s = fresh(company);
    const cfg = mod === 'llm' ? { total: 7, active: 7, arch: 'dense', tokens: 1 } : { scaleId: SCALES[mod][0].id, tokens: 1 };
    const complete = () => {
      const job = E.startJob(s, { kind: 'pretrain', line: 'main', cfg });
      assert.ok(job);
      finishJob(s, job, { notes: [], costs: { total: 0 }, revenue: 0 });
    };
    complete();
    const card = s.queue.find(q => q.kind === 'notice' && q.title === '预训练完成');
    assert.ok(card);
    assert.ok(card.text.startsWith('新一代的底座训练完了。'));
    assertCopy(card.text, expected, irrelevant);
    assert.equal(E.workingModel(s).stage, 'post');
    s.queue = [];
    complete();
    assert.equal(s.queue.filter(q => q.kind === 'notice' && q.title === '预训练完成').length, 0);
    const news = s.news.find(n => n.title === '预训练完成');
    assert.ok(news);
    assertCopy(news.detail, expected, irrelevant);
    assert.equal(news.detail, card.text);
  });
}
for (const mod of [undefined, null, 'future-modality', '__proto__']) {
  test(`missing/unknown modality ${String(mod)} uses the neutral fallback`, () => {
    const s = fresh('gpt');
    if (mod === undefined) delete s.mod; else s.mod = mod;
    const before = structuredClone(s);
    const notice = noticeOf(s, 'first_release_hint', { model: '新底座' });
    assert.equal(notice.text, fill(EVENTS.first_release_hint.text, s, { model: '新底座' }));
    assert.match(notice.text, /完善模型能力与安全表现/);
    assert.doesNotMatch(notice.text, /指令遵循|画面质量|作曲|语音自然度|undefined|\[object/);
    assert.doesNotMatch(notice.text, badCopy);
    assert.deepEqual(s, before);
  });
}
test('other shared completion tutorials retain their existing text and parameters', () => {
  for (const [, company] of cases) {
    const s = fresh(company);
    const params = { small: '小底座', total: 1, active: 1, costRatio: '5%' };
    assert.equal(noticeOf(s, 'small_ready', params).text, fill(EVENTS.small_ready.text, s, params));
  }
});
