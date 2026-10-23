// 真实年代经营模式（v0.7）：下一步建议。原来在 career.test.mjs 里，按 describe 拆成单独的文件。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { deployDays, quarterOf } from '../../src/career/data/supply.js';
import { playAdvised, resolveAll, advance, advanceMonth } from '../helpers/career_bot.mjs';
import * as L from '../helpers/legacy_jobs.mjs';

describe('下一步建议', () => {
  it('照着大按钮一路玩下去，每条建议都能执行，不会原地打转', () => {
    for (const [id, sc, seed] of [['qwen', 'y2023', 1], ['deepseek', 'y2024', 2], ['claude', 'y2025', 3], ['glm', 'y2026', 4], ['suno', 'y2025', 5], ['jev', 'y2026', 6]]) {
      const { s, errors } = playAdvised(id, sc, seed);
      assert.deepEqual(errors, [], `${id}/${sc}`);
      assert.notEqual(s.status, 'playing', `${id}/${sc} 没打完`);
    }
  });
  it('同一个状态连续调用两次 advise，结果完全相同（加成缓存不能把结果弄错）', () => {
    const s = E.createGame('deepseek', 'y2025', 3);
    resolveAll(s);
    advance(s, 120);
    assert.equal(s.status, 'playing');
    const a = E.advise(s);
    const b = E.advise(s);
    assert.deepEqual(b, a);
    assert.equal(JSON.stringify(b), JSON.stringify(a));
  });
  it('买卡建议看这个季度还剩多少配额：用完了就不建议，只剩一部分时按剩下的写，照着做不报错', () => {
    // G1 门禁：Midjourney y2023 大按钮（校准种子 3、4）在超事件“十倍估值”里选了采购，把 2024Q3 的 H100 配额一次用完，
    // 之后四周的“采购 8192 张 H100”都执行失败（这个季度的配额已经用完）。
    const s = E.createGame('midjourney', 'y2024', 1);
    resolveAll(s);
    const buy = () => E.advise(s).find(a => a.id === 'buy');
    const b = buy();
    assert.ok(b, '开局账上有余钱，会建议买卡');
    const key = `${quarterOf(s.date)}|${b.op.gpu}`;
    const left = E.gpuOrderInfo(s, b.op.gpu).left;
    assert.ok(b.op.n <= left && b.label.includes(`${b.op.n} 张`), b.label);
    s.quota[key] = (s.quota[key] || 0) + left;
    assert.equal(buy(), undefined, '配额用完时不建议买卡');
    s.quota[key] -= 300;
    const b2 = buy();
    assert.equal(b2.op.n, 300);
    assert.match(b2.label, /采购 300 张/);
    assert.match(b2.detail, /配额只剩这么多/);
    E.applyAdvice(s, b2);
    assert.equal(E.gpuOrderInfo(s, b2.op.gpu).left, 0);
  });
  it('建议里没有灰色做法；有事件时先处理事件；最后一条是作业建议（kind jobs，T9.2）', () => {
    const s = E.createGame('qwen', 'y2023', 7);
    assert.equal(E.advise(s)[0].kind, 'event');
    resolveAll(s);
    for (let i = 0; i < 8 && s.status === 'playing'; i++) {
      const list = E.advise(s);
      assert.equal(list.at(-1).kind, 'jobs');
      for (const a of list) {
        assert.ok(a.label && a.detail, a.id);
        // 蒸馏只建议许可宽松（LP）的开源权重（规格 A10 的 wantsDistill），不建议调闭源 API（违反服务条款）。
        const did = String(a.op.arg?.id || '');
        assert.ok(a.op.arg?.dir !== 'benchmax' && !did.endsWith(':api') && a.op.type !== 'smuggle', a.label);
        if (did.startsWith('distill:')) assert.equal(E.dataOptions(s).find(o => o.id === did)?.license, 'LP', a.label);
      }
      E.applyAdvice(s, list.at(-1));
      advanceMonth(s);
    }
  });
  it('备案制度之前就上线的国内对话产品，没备案时会提醒去备案；集群快撑不住时先维护', () => {
    // 模拟 2023 剧本里 8 月以前就上线、一直没备案的千问（2024 剧本开局时手上就有在线模型）。
    const s = E.createGame('qwen', 'y2024', 1);
    resolveAll(s);
    s.products.chat.on = true;
    s.service.filing = 'none';
    E.liveModel(s).dims.safety = 60;
    const list = E.advise(s);
    assert.ok(list.some(a => a.id === 'filing'), list.map(a => a.label).join(' / '));
    E.applyAdvice(s, list.find(a => a.id === 'filing'));
    assert.equal(s.service.filing, 'pending');
    // 自动检修关着、健康 < 25 而且不在检修：“开检修”排最前（T9.2；自动检修开着时由它每天检查，不用顾问提醒）。
    s.health = 10;
    s.jobs.autoRepair = false;
    L.decide(s, 'research');
    const top = E.advise(s)[0];
    assert.deepEqual([top.op.type, top.op.op, top.op.on], ['job', 'repair', true], top.label);
  });
  it('后训练数据会主动补上，而且只订来源干净的数据', () => {
    const { s } = playAdvised('qwen', 'y2023', 1);
    // 风险记录为空：顾问自己下的数据单都干净（没有 tos_*、没有来路不明的数据集）；里程碑弹窗里的“下载权重做蒸馏”只在 wantsDistill 时选，
    // 老师只用许可宽松（LP）的开源权重，不会记 license_*（规格 A10，P2.2）。
    assert.deepEqual(Object.keys(s.data.risky), []);
    for (const k of ['math', 'code', 'agent']) assert.ok((s.data.post[k] || 0) >= 1, `${k} 数据只有 ${s.data.post[k] || 0} 档`);
  });
  it('这一代底座练满也够不着 12 个月内的目标时，提前建议换更大的底座', () => {
    const s = E.createGame('glm', 'y2023', 1);
    resolveAll(s);
    // P2.4a 起立项前先给下一代计划调一次参（T9.2 第 5 条），建议的理由照写。
    const pj = E.advise(s).find(a => a.id === 'project' || a.id === 'trial:tune');
    assert.ok(pj && pj.detail.includes('得换更大的底座'), pj?.detail);
  });
  it('按检查日掐发布时间：训练中的版本达标就先发；再晚就赶不上灰度时，把更好的版本发出去', () => {
    // 把千问 2025 的推理里程碑挪到 3 月 1 日检查（P2.4a 起发布前还要评测，提前量比原来的 2 月长），离检查还剩 days 天；在线版数学 60，训练中的版本数学 work。
    const setup = (days, work) => {
      const s = E.createGame('qwen', 'y2025', 1);
      resolveAll(s);
      s.goals.find(g => g.id === 'g_reasoning').date = '2025-03';
      advance(s, 59 - days);
      const w = E.workingModel(s);
      w.postDays = (w.relDays || 0) + 20;
      E.liveModel(s).dims.math = 60;
      w.dims.math = work;
      return s;
    };
    const release = s => E.advise(s).find(a => a.id === 'jobs:submit');
    assert.equal(release(setup(59, 65)), undefined, '离检查还早、也没达标，不急着发');
    assert.match(release(setup(59, 85)).detail, /稳了/);
    // Qwen3-235B-A22B 按 22B 激活算以后灰度从 14 天缩到 5 天；P2.4a 起发布前还要评测（大厂按标准档 21 天）。
    // 按真实的评测加灰度天数构造“再晚就赶不上”的最后一周。
    const s0 = setup(59, 65);
    const remaining = deployDays(E.workingModel(s0)) + E.evalDaysFor(s0, E.defaultTier(s0), 'main') + 7;
    const s = setup(remaining, 65);
    const a = release(s);
    assert.match(a.detail, /赶不上/);
    E.applyAdvice(s, a);
    advance(s, remaining - 1);
    assert.equal(s.date, '2025-02');
    assert.equal(E.liveModel(s).dims.math, 65, '检查前新版本已经全量上线');
  });
  it('照着大按钮玩 2023 剧本的千问和混元（校准种子），推理里程碑按时达成，不会被撤换', () => {
    // 种子：P1.1 改了对手可见日、综合分和开局阵容，整局的随机数路径跟着变。12 个种子里推理目标达成的仍是千问 11 个、混元 12 个，
    // 和改之前一样，只是没达成的那一个从种子 7 换成了 7919，所以这里换用两边都达成的种子 1。
    for (const id of ['qwen', 'hunyuan']) {
      const { s } = playAdvised(id, 'y2023', 1);
      assert.equal(s.goals.find(g => g.id === 'g_reasoning').status, 'met', id);
      assert.equal(s.result.reason, 'complete', id);
    }
  });
});
