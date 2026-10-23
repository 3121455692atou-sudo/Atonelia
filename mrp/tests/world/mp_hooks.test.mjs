// 联机的系统命令在世界侧的钩子（规格 M.6.3、M.6.4、M.6.8）：收件箱、到期自动处理、托管和交还、中途接管电脑公司。
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { inboxOf, autoResolve, setHosted, takeover, MAJOR_KINDS } from '../../src/career/world/index.js';
import { restoreHistory } from '../helpers/world_provider.mjs';

after(() => restoreHistory());
const companies = [
  { name: '甲智能', brand: '甲甲', country: 'US', tier: 'specialist', kind: 'human' },
  { name: '乙智能', brand: '乙乙', country: 'US', tier: 'specialist', kind: 'human' },
  { name: '丙智能', brand: '丙丙', country: 'CN', tier: 'specialist', kind: 'bot' },
];
const mk = () => {
  const w = E.createWorld({ seed: 4, start: '2024-01', days: 120, companies, mp: true });
  const [A, B, C] = Object.values(w.companies).sort((a, b) => a.seat - b.seat);
  return { w, A, B, C };
};

describe('联机钩子（M.6.3、M.6.4、M.6.8）', () => {
  it('卡片不挡时间，进收件箱并记下进来的日子；到期自动处理选第一个不回避的选项', () => {
    const { w, A } = mk();
    for (let d = 0; d < 5; d++) w.tick();
    const box = inboxOf(w, A.id);
    assert.ok(box.length > 0, '开局提示卡留在收件箱里');
    assert.ok(box.every(x => typeof x.since === 'string'));
    const n = A.s.queue.length;
    const r = autoResolve(w, A.id, 0);
    assert.ok(r && r.choice);
    assert.equal(A.s.queue.length, n - 1);
    assert.equal(autoResolve(w, A.id, 99), null, '下标不对就什么都不做');
    assert.ok(MAJOR_KINDS.has('distill_caught'));
  });

  it('托管：按被动档跑、卡片当场处理；交还以后卡又留在收件箱', () => {
    const { w, A } = mk();
    setHosted(w, A.id, true);
    for (let d = 0; d < 5; d++) w.tick();
    assert.equal(A.s.queue.length, 0, '托管时卡片当场处理');
    assert.equal(E.P().botParams(A.s).MODE, 'passive');
    setHosted(w, A.id, false);
    assert.equal(A.hosted, undefined);
    assert.throws(() => setHosted(w, Object.values(w.companies).find(c => c.kind === 'bot').id, true), /只有真人/);
  });

  it('中途接管电脑公司：变成真人、排在最后一个座位；只能接管电脑', () => {
    const { w, A, C } = mk();
    const seat = takeover(w, C.id);
    assert.equal(C.kind, 'human');
    assert.equal(seat, 2);
    assert.throws(() => takeover(w, A.id), /只能接管/);
  });

  it('同样的系统命令顺序重放，哈希一致', () => {
    const run = () => {
      const { w, A, C } = mk();
      for (let d = 0; d < 10; d++) w.tick();
      setHosted(w, A.id, true);
      for (let d = 0; d < 10; d++) w.tick();
      setHosted(w, A.id, false);
      takeover(w, C.id);
      for (let d = 0; d < 10; d++) w.tick();
      autoResolve(w, A.id, 0);
      return w.hash();
    };
    assert.equal(run(), run());
  });
});

describe('联机里卡片不挡时间（M.6.4 回归）', () => {
  it('真人公司收件箱有卡，自家的 s 照样跟着世界每天推进；单人自洽照旧有卡就停', () => {
    const cs = [
      { name: '甲辰智能', brand: '甲辰', country: 'CN', tier: 'specialist', kind: 'human' },
      { name: '乙巳智能', brand: '乙巳', country: 'US', tier: 'specialist', kind: 'bot' },
      { name: '丙午智能', brand: '丙午', country: 'EU', tier: 'specialist', kind: 'bot' },
    ];
    const w = E.createWorld({ seed: 3, start: '2024-01', days: 200, mp: true, companies: cs });
    assert.equal(E.P().queueBlocks, false);
    for (let i = 0; i < 40; i++) w.tick();
    const human = Object.values(w.companies).find(c => c.kind === 'human');
    assert.ok(human.s.queue.length > 0, '开局的提示卡没人处理，应该还在收件箱里');
    assert.equal(human.s.day, w.day, '真人公司的日期跟着世界走');
    E.createWorld({ seed: 3, start: '2024-01', days: 200, companies: cs });
    assert.equal(E.P().queueBlocks, true, '单人自洽：有卡就停');
  });
});
