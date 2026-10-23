// P3.D：DeepSeek 史实树（规格 A7、C3、C4、B6、F2 的 P3.D 行）。
// 锁住四件事：树和文件过校验器（含 A4.7 播种检查）、A7 的播种表逐项成立、七个历史名都能按条件授出、
// 健康度长期低下时干净训练条件失守而拿不到授名、Qwen 先拿到“开源推理追近前沿”时 DeepSeek 的授名作废。
// 机器人统计（≥60% 在 1–3 月发出 DeepSeek-R1、y2024 授名比例）跑得慢，放在 scripts 之外的临时脚本里，结论见交付报告。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import deepseek from '../../src/career/data/companies/deepseek.js';
import { companyFile, resolveTree } from '../../src/career/data/companies/index.js';
import { validateCompanyFile, seedErrors } from '../../src/career/data/companies/_schema.js';
import { START_STANCE } from '../../src/career/data/routes.js';
import { resolvedTree, nodeOf, histDay, curBlock, completeNode } from '../../src/career/sim/strategy.js';
import { cond } from '../../src/career/sim/cond.js';
import { nameGrantCheck, releaseNamePlan, historicNames, namingTick } from '../../src/career/sim/naming.js';
import { setStance } from '../../src/career/sim/route.js';
import { setAutoRepair, startJob, postTick } from '../../src/career/sim/jobs.js';
import { addDays } from '../../src/career/sim/clock.js';
import { resolveAll } from '../helpers/career_bot.mjs';

const SCS = ['y2023', 'y2024', 'y2025', 'y2026'];
const fresh = (sc, seed = 1) => { const s = E.createGame('deepseek', sc, seed); resolveAll(s); return s; };

// A7 的播种表：预完成的本家节点、进行中的节点和进度。
const SEED_TABLE = {
  y2023: {
    done: [],
    cur: ['ds_found', 0],
  },
  y2024: {
    done: ['ds_found', 'ds_coder'],
    cur: ['ds_moe', 60],
  },
  y2025: {
    done: ['ds_found', 'ds_coder', 'ds_moe', 'ds_grpo', 'ds_mla', 'ds_price_butcher', 'ds_self_funded', 'ds_r1_lite', 'ds_v3'],
    cur: ['ds_r1', 16],
    excluded: ['ds_enterprise', 'ds_vc'],
  },
  y2026: {
    done: ['ds_found', 'ds_coder', 'ds_moe', 'ds_grpo', 'ds_mla', 'ds_price_butcher', 'ds_self_funded', 'ds_r1_lite', 'ds_v3',
      'ds_r1', 'ds_distill_family', 'ds_busy_research', 'ds_open_week', 'ds_hybrid', 'ds_cn_chips'],
    cur: ['ds_v4', 0],
  },
};

describe('P3.D DeepSeek：树与文件', () => {
  it('文件过校验器（含 A4.7 播种检查）；本家 20 个节点接 core_llm，omit 掉 g_reasoning_bet', () => {
    assert.deepEqual(validateCompanyFile(deepseek, 'deepseek'), []);
    assert.deepEqual(seedErrors(deepseek, 'deepseek'), []);
    assert.equal(deepseek.tree.extends, 'core_llm');
    assert.deepEqual(deepseek.tree.omit, ['g_reasoning_bet']);
    assert.equal(deepseek.tree.nodes.length, 20);
    const t = resolveTree(deepseek.tree);
    assert.equal(t.core, 'core_llm');
    assert.equal(t.nodes.length, 20 + 12 - 1, '20 个本家节点 + 主干 12 个，omit 掉 1 个');
    assert.ok(!t.byId.has('g_reasoning_bet') && t.byId.has('g_sota') && t.byId.has('g_beyond'));
    assert.deepEqual(Object.keys(deepseek.tree.branches), ['base', 'arch', 'reason', 'market', 'chips']);
    assert.equal(deepseek.startSpirits.length, 1);
    assert.equal(deepseek.startSpirits[0], 'ds_quant_backing');
    assert.equal(deepseek.names.length, 7);
    assert.equal(deepseek.exclusives.length, 5);
    // 分支、互斥、前置的大致形状：每条分支都有节点，互斥两边对称，至少一个多路前置和一个绕过。
    const own = t.nodes.filter(n => n.id.startsWith('ds_'));
    for (const b of Object.keys(deepseek.tree.branches)) assert.ok(own.some(n => n.branch === b), b);
    for (const n of own) for (const id of n.excludes || []) assert.ok(nodeOf({ charId: 'deepseek' }, id)?.excludes?.includes(n.id), `${n.id} ↔ ${id}`);
    assert.ok(own.some(n => (n.prereq || []).some(g => g.length > 1)), '多路前置');
    assert.ok(own.some(n => n.bypass), '绕过');
  });

  it('四个剧本开局：播种出来的进行中策略 available 成立、路线在它的 from 里，开局第一天就能推进', () => {
    for (const sc of SCS) {
      const s = fresh(sc);
      assert.equal(s.strategy.tree, 'deepseek', sc);
      const why = curBlock(s);
      assert.equal(why, '', `${sc}：${s.strategy.cur?.id} 开局就推进不了（${why}）`);
      const n = nodeOf(s, s.strategy.cur.id);
      assert.ok(cond(s, n.available), `${sc}：${n.id} 的 available 不成立`);
      assert.ok(!n.from || n.from.includes(s.route.stance), `${sc}：当前路线 ${s.route.stance} 不在 ${n.id} 的 from 里`);
    }
  });

  it('A7 播种表逐项成立：预完成、cur 和进度、y2025 的互斥排除、y2026 的过期特质', () => {
    for (const sc of SCS) {
      const s = fresh(sc), want = SEED_TABLE[sc];
      const at = `${sc}`;
      assert.equal(s.strategy.tree, 'deepseek', at);
      const done = Object.keys(s.strategy.done).filter(id => id.startsWith('ds_')).sort();
      assert.deepEqual(done, [...want.done].sort(), `${at} 预完成`);
      for (const id of done) {
        assert.equal(s.strategy.done[id].how, 'start', `${at} ${id} 的完成方式`);
        assert.equal(s.strategy.done[id].day, histDay(nodeOf(s, id)), `${at} ${id} 的完成日`);
      }
      assert.deepEqual([s.strategy.cur.id, s.strategy.cur.days], want.cur, `${at} 进行中`);
      // 路线不经过播种：等于 B6 的表（y2025 的 ds_r1 完成以后才转到 open）。
      assert.deepEqual([s.route.stance, s.route.license], [START_STANCE.deepseek[sc].stance, START_STANCE.deepseek[sc].license], `${at} 路线`);
      for (const id of want.excluded || []) assert.equal(E.nodeStatus(s, id).state, 'excluded', `${at} ${id} 应该被互斥排除`);
      if (sc === 'y2025') assert.ok(s.world.priceWar, '价格屠夫开局前已完成，世界标记写上');
      if (sc === 'y2026') {
        // ds_distill_push 只有 120 天，开局前早就过期，不会加到身上。
        assert.ok(!s.strategy.spirits.ds_distill_push, 'y2026 不带 ds_distill_push');
        assert.ok(s.strategy.spirits.ds_mit, 'R1 的 MIT 开源还在');
        // 预完成的路线节点按日期顺序施加，最后一次是 ds_r1，得到的路线和 B6 一致。
        const routes = Object.entries(s.strategy.done).filter(([id]) => nodeOf(s, id)?.stance)
          .sort((a, b) => (a[1].day < b[1].day ? -1 : a[1].day > b[1].day ? 1 : 0));
        assert.equal(routes.at(-1)[0], 'ds_r1');
        assert.equal(nodeOf(s, routes.at(-1)[0]).stance, START_STANCE.deepseek.y2026.stance);
      }
    }
  });
});

describe('P3.D DeepSeek：历史名授予', () => {
  // 造一个“条件全满足”的模型：路线完全开源，技术齐全，一局里没有同名的在线型号。
  function base(sc) {
    const s = fresh(sc);
    s.queue = [];
    setStance(s, 'open', { src: 'start' });
    s.techs = [...new Set([...s.techs, 'mla', 'fp8', 'grpo', 'reasoning'])];
    return s;
  }
  const DIMS = { knowledge: 99, code: 99, math: 99, writing: 99, safety: 90, agent: 99 };
  const CASES = {
    hn_ds_v2: { sc: 'y2023', model: { role: 'flagship', arch: 'moe', total: 236, active: 21, train: { minor: 0, severe: 0 } } },
    hn_ds_v3: { sc: 'y2023', model: { role: 'flagship', arch: 'moe', total: 671, active: 37, train: { minor: 0, severe: 0 } } },
    hn_ds_r1: { sc: 'y2023', model: { role: 'flagship', reasoning: true, cleanStreak: { math: 12, code: 9 }, train: { minor: 0, severe: 0 } } },
    // 小模型线：要比在线旗舰弱，才会按副线 / 小模型发布（发布角色按 releaseLine 算）。
    hn_ds_r1_distill: { sc: 'y2024', model: { role: 'small', teacher: 'self', total: 32, active: 32, reasoning: true, cleanStreak: { math: 12, code: 9 },
      train: { minor: 0, severe: 0 }, dims: { knowledge: 40, code: 40, math: 40, writing: 40, safety: 40, agent: 40 } } },
    hn_ds_v31: { sc: 'y2023', model: { role: 'flagship', reasoning: true, train: { minor: 0, severe: 0 } } },
    hn_ds_v4_pro: { sc: 'y2023', model: { role: 'flagship', total: 1000, active: 100, train: { minor: 0, severe: 0 } } },
    hn_ds_v4_flash: { sc: 'y2023', model: { role: 'flagship', origin: 'distill', teacher: 'self', train: { minor: 0, severe: 0 } } },
  };

  it('七个历史名逐个构造满足的状态：nameGrantCheck 全 ✓，releaseNamePlan 拿到的就是这个名字', () => {
    const defs = new Map(deepseek.names.map(h => [h.id, h]));
    assert.deepEqual([...defs.keys()], ['hn_ds_v2', 'hn_ds_v3', 'hn_ds_r1', 'hn_ds_r1_distill', 'hn_ds_v31', 'hn_ds_v4_pro', 'hn_ds_v4_flash']);
    for (const [id, { sc, model }] of Object.entries(CASES)) {
      const s = base(sc), def = defs.get(id);
      s.strategy.rights[id] = { day: s.day, until: '2027-01-01', used: null, void: null };
      // 蒸馏小模型另需“R1 的授名已经用掉”（C3）。
      if (id === 'hn_ds_r1_distill') s.strategy.rights.hn_ds_r1 = { day: s.day, until: '2027-01-01', used: 'cand_r1', void: null };
      const m = { ...E.workingModel(s), id: `test_${id}`, stage: 'post', dims: { ...DIMS }, ...model };
      const c = nameGrantCheck(s, m, id);
      assert.ok(c.ok, `${id}：${c.lines.filter(l => !l.ok).map(l => `${l.text}（${l.now}）`).join('；')}`);
      assert.ok(c.lines.every(l => l.ok), id);
      const p = releaseNamePlan(s, m);
      assert.equal(p.ok, true, `${id}：${p.reason}`);
      assert.equal(p.grant, id, id);
      assert.equal(p.name, def.name, id);
    }
  });
});

describe('P3.D DeepSeek：健康度长期低于 40 与授名', () => {
  // C2 / C3 没有“健康度低于 40 就不授名”的直接条件；健康度只通过两条干净训练条件起作用：
  //   'base' 要求没有严重炸炉、小故障不超过 1 次；RL 要求数学 / 代码方向干净训练满 21 天。
  // 这个夹具把健康度长期压在 25，跑真实的底座 / 后训练，等一次 loss spike 把 cleanStreak 清零，
  // 再用 nameGrantCheck 证明 R1 的授名拿不到；同样条件下健康 90 的对照能拿到。
  function lowHealthRun(health, days) {
    const s = fresh('y2025');
    s.queue = [];
    s.health = health;
    setAutoRepair(s, false);   // 不让“低于 40 自动检修”把健康拉回来
    setStance(s, 'open', { src: 'start' });
    s.strategy.rights.hn_ds_r1 = { day: s.day, until: '2027-01-01', used: null, void: null };
    const w = E.workingModel(s);
    // 除了干净训练以外的条件先全部满足，让夹具只测健康度这一条因果链。
    w.dims = { ...w.dims, knowledge: 90, code: 90, math: 90, writing: 90, agent: 70, safety: 70 };
    w.cleanStreak = {};
    startJob(s, { kind: 'post', target: 'main', dir: 'math', until: 'none' });
    let spike = null;
    for (let i = 0; i < days && s.status === 'playing' && !spike; i++) {
      s.day = addDays(s.day, 1);
      const out = { notes: [] };
      postTick(s, out);
      if (out.notes.some(x => /spike/.test(x))) spike = s.day;
    }
    return { s, w, spike };
  }

  it('长期低于 40：确定性夹具里出了 loss spike，干净训练清零，R1 的授名拿不到；健康 90 的对照能拿到', () => {
    const bad = lowHealthRun(25, 220);
    assert.ok(bad.spike, '低健康度下 220 天内应该出一次 loss spike');
    assert.equal(bad.s.health < 40, true, `夹具里的健康度应该长期低于 40（现在 ${bad.s.health}）`);
    assert.equal(bad.w.cleanStreak.math || 0, 0, 'spike 把数学方向的干净训练清零');
    const c = nameGrantCheck(bad.s, bad.w, 'hn_ds_r1');
    assert.equal(c.ok, false);
    assert.ok(c.lines.some(l => !l.ok && /干净训练满 21 天/.test(l.text)), c.lines.map(l => l.text).join('；'));
    assert.equal(releaseNamePlan(bad.s, bad.w).grant, null);

    const good = lowHealthRun(90, 30);
    assert.equal(good.spike, null, '健康 90 的对照里 30 天不出 spike');
    const c2 = nameGrantCheck(good.s, good.w, 'hn_ds_r1');
    assert.ok(c2.ok, c2.lines.filter(l => !l.ok).map(l => `${l.text}（${l.now}）`).join('；'));
    assert.equal(releaseNamePlan(good.s, good.w).grant, 'hn_ds_r1');
  });
});

describe('P3.D DeepSeek：Qwen 先做到开源推理追近前沿', () => {
  it('Qwen 拿不到任何 DeepSeek 的名字和专属事件；DeepSeek 的 hn_ds_r1 授权作废', () => {
    // DeepSeek 先做完 R1、拿到授权。
    const ds = fresh('y2025');
    ds.queue = [];
    completeNode(ds, 'ds_r1', 'done');
    assert.ok(ds.strategy.rights.hn_ds_r1 && !ds.strategy.rights.hn_ds_r1.void);
    // 这一回 Qwen 先拿到“开源推理模型追近前沿”。
    ds.ms.ms_open_reasoning_frontier = { who: 'qwen', day: ds.day };
    namingTick(ds, {});
    assert.ok(ds.strategy.rights.hn_ds_r1.void, 'DeepSeek 的 R1 授名应该作废');
    assert.match(ds.strategy.rights.hn_ds_r1.void, /阿里巴巴/);

    // 玩 Qwen：P3.T 起有自己的名表和专属事件，但都没有 DeepSeek 的东西。
    const qw = E.createGame('qwen', 'y2025', 1);
    const f = companyFile('qwen');
    assert.ok(f.names.length > 0, 'Qwen 有自己的名表');
    assert.ok(!historicNames(qw).some(h => h.id.startsWith('hn_ds_')));
    assert.ok(!(f.exclusives || []).some(x => /^ex_(r1|ds)_/.test(x.id)));
    // 就算给 Qwen 一个能发布的好模型，releaseNamePlan 也不会给出 DeepSeek 的名字。
    const w = E.workingModel(qw);
    const plan = releaseNamePlan(qw, w);
    assert.equal(plan.grant, null);
    assert.ok(!/^DeepSeek-/.test(plan.name || ''), plan.name);
  });
});
