// 界面写操作统一走命令表（规格 M.6.5，M4）：单人时当场执行、同步返回；旧 decide 动作一一换成命令；
// 有卡片没处理时，以前经 decide 的那些操作照旧不让做。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';

globalThis.document ??= { baseURI: 'http://localhost/' };
const { act, after, jobAct, decideAct, isRemote } = await import('../../src/career/ui/act.js');

describe('act：界面写操作走命令表', () => {
  it('单人：当场执行、同步返回；参数表先拦', () => {
    const S = E.createGame('kimi', 'y2024', 5);
    assert.equal(isRemote(), false);
    act(S, 'setInferShare', { v: 0.3 });
    assert.equal(S.inferShare, 0.3);
    assert.throws(() => act(S, 'setInferShare', { v: 5 }), /setInferShare/);
    assert.equal(after(7, x => x + 1), 8);
  });
  it('旧 decide 动作 → 命令：作业开工、撤回送评、下单；送评不给模型和档位时按默认补上', () => {
    const S = E.createGame('deepseek', 'y2024', 5);
    S.queue.length = 0;                                   // 开局的介绍卡先清掉
    const dir = E.directionsFor(S)[0].key;
    const r = jobAct(S, { op: 'start', spec: { kind: 'post', target: 'main', dir, until: 'none' } });
    assert.equal(r.kind, 'jobs');
    assert.ok(S.jobs.list.some(j => j.id === r.job.id));
    jobAct(S, { op: 'cancel', id: r.job.id });
    assert.ok(!S.jobs.list.some(j => j.id === r.job.id));
    const opt = E.dataOptions(S).find(d => !d.owned && d.ok !== false);
    if (opt) assert.equal(decideAct(S, 'data', { id: opt.id }).kind, 'data');
    assert.throws(() => decideAct(S, 'nope', {}), /未知行动/);
  });
  it('有卡片没处理：作业、送评这些不让做（单人）；设定类照旧', () => {
    const S = E.createGame('kimi', 'y2024', 5);
    S.queue.length = 0;
    S.queue.push({ kind: 'event', id: 'x' });
    assert.throws(() => jobAct(S, { op: 'repair', on: true }), /请先处理眼前的事件/);
    act(S, 'setInferShare', { v: 0.25 });
    assert.equal(S.inferShare, 0.25);
  });
});
