// P3.T 第 3 批：qwen、kimi、glm、minimax 的史实树（规格 A5、A9、B6、C3、C4、F2 的 P3.T 行）。
// 每家公司锁住四件事：
//   1. 文件过校验器（含 A4.7 播种检查），树接 core_llm，本家节点 20 个，分支、互斥、绕过齐全；
//   2. 四个剧本开局：路线复现 B6，播种出来的进行中策略第一天就能推进（curBlock 为空）；
//   3. 每个历史名都能按 C3 的条件授出：构造满足的状态 → nameGrantCheck 全 ✓，releaseNamePlan 拿到的就是这个名字；
//   4. y2023 开局算上主干能排出 22 个以上可完成节点，没有走不到的节点，每个授名的节点都可达。
// 机器人统计（每个授名在史实日 ±6 个月内发生的种子比例）跑得慢，放在 /Volumes/ESD-EPA/atonelia-scratch/ds-tmp/p3t3/，结论见交付报告。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import qwen from '../../src/career/data/companies/qwen.js';
import kimi from '../../src/career/data/companies/kimi.js';
import glm from '../../src/career/data/companies/glm.js';
import minimax from '../../src/career/data/companies/minimax.js';
import { resolveTree } from '../../src/career/data/companies/index.js';
import { validateCompanyFile, seedErrors, unreachableNodes } from '../../src/career/data/companies/_schema.js';
import { START_STANCE } from '../../src/career/data/routes.js';
import { resolvedTree, nodeOf, curBlock } from '../../src/career/sim/strategy.js';
import { cond, condPermanent } from '../../src/career/sim/cond.js';
import { nameGrantCheck, releaseNamePlan } from '../../src/career/sim/naming.js';
import { setStance } from '../../src/career/sim/route.js';

const SCS = ['y2023', 'y2024', 'y2025', 'y2026'];
const FILES = { qwen, kimi, glm, minimax };
const CODES = Object.keys(FILES);

// 播种表：每个剧本预完成的本家节点、进行中的节点和进度（种子 1；策略不读随机数）。
const SEED = {
  qwen: {
    y2023: { done: [], cur: ['qw_public_launch', 0] },
    y2024: { done: ['qw_public_launch', 'qw_open_7b', 'qw_public_open', 'qw_full_sizes'], cur: ['qw_apache_turn', 0] },
    y2025: { done: ['qw_public_launch', 'qw_open_7b', 'qw_public_open', 'qw_full_sizes', 'qw_apache_turn', 'qw_family_apache', 'qw_qwq_preview'], cur: ['qw_max_dual', 8] },
    y2026: { done: ['qw_public_launch', 'qw_open_7b', 'qw_public_open', 'qw_full_sizes', 'qw_apache_turn', 'qw_family_apache', 'qw_qwq_preview',
      'qw_max_dual', 'qw_qwen3', 'qw_thinking_split', 'qw_coder', 'qw_image_opensource', 'qw_next_arch'], cur: ['qw_multimodal_agent', 24] },
  },
  kimi: {
    y2023: { done: [], cur: ['km_long_context', 0] },
    y2024: { done: ['km_long_context'], cur: ['km_alibaba_round', 0] },
    y2025: { done: ['km_long_context', 'km_alibaba_round', 'km_two_million'], cur: ['km_k1_5', 51] },
    y2026: { done: ['km_long_context', 'km_alibaba_round', 'km_two_million', 'km_k1_5', 'km_k2_open', 'km_k2_thinking'], cur: ['km_k25', 44] },
  },
  glm: {
    y2023: { done: [], cur: ['gl_chatglm_open', 0] },
    y2024: { done: ['gl_chatglm_open', 'gl_chatglm2', 'gl_chatglm3'], cur: ['gl_glm4_closed', 20] },
    y2025: { done: ['gl_chatglm_open', 'gl_chatglm2', 'gl_chatglm3', 'gl_glm4_closed', 'gl_glm4_plus'], cur: ['gl_open_year', 0] },
    y2026: { done: ['gl_chatglm_open', 'gl_chatglm2', 'gl_chatglm3', 'gl_glm4_closed', 'gl_glm4_plus', 'gl_open_year', 'gl_open_flagship', 'gl_coding_plan'],
      cur: ['gl_ipo', 63] },
  },
  minimax: {
    y2023: { done: [], cur: ['mm_founded', 0] },
    y2024: { done: [], cur: ['mm_alibaba_round', 0] },
    y2025: { done: ['mm_alibaba_round', 'mm_abab_moe', 'mm_video'], cur: ['mm_linear', 56] },
    y2026: { done: ['mm_alibaba_round', 'mm_abab_moe', 'mm_video', 'mm_linear', 'mm_speech', 'mm_m1', 'mm_m2'], cur: ['mm_ipo', 62] },
  },
};
const ownNodes = t => t.nodes.filter(n => !n.id.startsWith('g_'));

describe('P3.T 第 3 批：四家史实树的文件与校验器', () => {
  it('四个文件都过校验器（含 A4.7 播种检查），本家各 20 个节点，接 core_llm，至少 2 个架空节点', () => {
    for (const c of CODES) {
      const f = FILES[c], at = `${c}`;
      assert.deepEqual(validateCompanyFile(f, c), [], at);
      assert.deepEqual(seedErrors(f, c), [], at);
      assert.equal(f.company, c, at);
      assert.equal(f.tree.id, c, at);
      assert.equal(f.tree.extends, 'core_llm', at);
      assert.equal(f.tree.nodes.length, 20, at);
      const own = ownNodes(resolveTree(f.tree));
      assert.equal(own.filter(n => n.fiction).length >= 2, true, `${at} 至少两个架空节点`);
      for (const b of Object.values(f.tree.branches)) assert.ok(own.some(n => b && f.tree.branches[n.branch] === b), `${at} 分支 ${b} 没有节点`);
      // 互斥两边对称、至少一个多路前置和一个绕过、至少一个改路线的节点。
      for (const n of own) for (const id of n.excludes || []) assert.ok(nodeOf({ charId: c }, id)?.excludes?.includes(n.id), `${at} ${n.id} ↔ ${id}`);
      assert.ok(own.some(n => (n.prereq || []).some(g => g.length > 1)), `${at} 多路前置`);
      assert.ok(own.some(n => n.bypass), `${at} 绕过`);
      assert.ok(own.some(n => n.stance), `${at} 路线节点`);
      // A9 点名的本家路线节点。
      const routeId = { qwen: ['qw_open_7b', 'qw_max_dual'], kimi: ['km_k2_open'], glm: ['gl_glm4_closed', 'gl_open_flagship'], minimax: ['mm_linear', 'mm_m1'] }[c];
      for (const id of routeId) assert.ok(own.find(n => n.id === id)?.stance, `${at} 路线节点 ${id}`);
    }
  });
});

describe('P3.T 第 3 批：四个剧本的开局路线与播种', () => {
  it('4 家 × 4 剧本：路线等于 B6；进行中的策略第一天就能推进；预完成的节点和进度等于播种表', () => {
    for (const c of CODES) for (const sc of SCS) {
      const s = E.createGame(c, sc, 1), at = `${c} ${sc}`;
      assert.equal(s.strategy.tree, c, at);
      assert.deepEqual([s.route.stance, s.route.license ?? null], [START_STANCE[c][sc].stance, START_STANCE[c][sc].license ?? null], `${at} 路线`);
      assert.equal(curBlock(s), '', `${at}：${s.strategy.cur?.id} 推进不了`);
      const want = SEED[c][sc];
      const done = Object.keys(s.strategy.done).filter(id => nodeOf(s, id)).sort();
      assert.deepEqual(done, [...want.done].sort(), `${at} 预完成`);
      for (const id of done) assert.equal(s.strategy.done[id].how, 'start', `${at} ${id} 的完成方式`);
      assert.deepEqual([s.strategy.cur.id, s.strategy.cur.days], want.cur, `${at} 进行中`);
      const n = nodeOf(s, s.strategy.cur.id);
      assert.ok(!n.auto && cond(s, n.available), `${at}：${n.id} 的 available 不成立`);
      assert.ok(!n.from || n.from.includes(s.route.stance), `${at}：当前路线不在 ${n.id} 的 from 里`);
    }
  });
  it('B6 表里的“(→X)”本家路线节点都能把路线转到表里写的那一档', () => {
    // 已预完成的路线节点按日期顺序重放，最后落在 B6 那一格（qwen y2025/2026、glm y2024～2026、minimax y2025/2026）。
    for (const c of CODES) for (const sc of SCS) {
      const s = E.createGame(c, sc, 1);
      const route = Object.entries(s.strategy.done).filter(([id]) => nodeOf(s, id)?.stance)
        .sort((a, b) => (a[1].day < b[1].day ? -1 : a[1].day > b[1].day ? 1 : 0));
      if (!route.length) continue;
      const last = nodeOf(s, route.at(-1)[0]);
      assert.equal(last.stance, START_STANCE[c][sc].stance, `${c} ${sc}：重放 ${route.map(x => x[0]).join('→')}`);
    }
  });
});

describe('P3.T 第 3 批：历史名授予（每个授名构造满足的状态）', () => {
  // 造一个条件全满足的状态：路线完全开源（旗舰必须开放权重、宽松许可），技术齐全，没有同名在线型号。
  function base(c) {
    const s = E.createGame(c, 'y2023', 1);
    s.queue = [];
    setStance(s, 'open', { src: 'start' });
    s.techs = [...new Set([...s.techs, 'muon', 'reasoning', 'moe', 'linear_attn', 'func_call'])];
    return s;
  }
  const DIMS = { knowledge: 99, code: 99, math: 99, writing: 99, safety: 90, agent: 99 };
  // 每个授名：公司、要发布的模型的样子（其余取在练模型）。
  const CASES = {
    hn_qwen25: { c: 'qwen', model: { role: 'flagship', arch: 'moe', total: 236, active: 21, train: { minor: 0, severe: 0 } } },
    hn_kimi_k2: { c: 'kimi', model: { role: 'flagship', arch: 'moe', total: 1000, active: 32, train: { minor: 0, severe: 0 } } },
    hn_glm45: { c: 'glm', model: { role: 'flagship', arch: 'moe', total: 355, active: 32, train: { minor: 0, severe: 0 } } },
    hn_minimax01: { c: 'minimax', model: { role: 'flagship', arch: 'hybrid', total: 456, active: 45, train: { minor: 0, severe: 0 } } },
  };

  it('四个授名逐个构造：nameGrantCheck 全 ✓，releaseNamePlan 拿到的就是这个名字', () => {
    for (const c of CODES) {
      const defs = new Map(FILES[c].names.map(h => [h.id, h]));
      for (const [id, def] of defs) {
        const kase = CASES[id];
        assert.ok(kase, `${id} 没有构造用例`);
        assert.equal(kase.c, c);
        const s = base(c);
        s.strategy.rights[id] = { day: s.day, until: '2027-01-01', used: null, void: null };
        // Qwen2.5 另需“已经开源发布过两款”（C3 的 world 条件）。
        if (id === 'hn_qwen25') {
          s.models.push(
            { id: 'test_open_a', name: '测试开源一', stage: 'released', releasedDay: s.day, day: s.day, line: 'side', open: true, dims: { ...DIMS } },
            { id: 'test_open_b', name: '测试开源二', stage: 'released', releasedDay: s.day, day: s.day, line: 'side', open: true, dims: { ...DIMS } });
        }
        const m = { ...E.workingModel(s), id: `test_${id}`, stage: 'post', dims: { ...DIMS }, ...kase.model };
        const chk = nameGrantCheck(s, m, id);
        assert.ok(chk.ok, `${id}：${chk.lines.filter(l => !l.ok).map(l => `${l.text}（${l.now}）`).join('；')}`);
        assert.ok(chk.lines.every(l => l.ok), id);
        const plan = releaseNamePlan(s, m);
        assert.equal(plan.ok, true, `${id}：${plan.reason}`);
        assert.equal(plan.grant, id, id);
        assert.equal(plan.name, def.name, id);
      }
    }
  });
  it('条件不满足时拿不到：Qwen2.5 只开源过一款、Kimi K2 总参数不够、GLM-4.5 不开源、MiniMax-01 不是混合架构', () => {
    const s1 = base('qwen');
    s1.strategy.rights.hn_qwen25 = { day: s1.day, until: '2027-01-01', used: null, void: null };
    s1.models.push({ id: 'test_open_a', name: '测试开源一', stage: 'released', releasedDay: s1.day, day: s1.day, line: 'side', open: true, dims: { ...DIMS } });
    const m1 = { ...E.workingModel(s1), id: 'test_a', stage: 'post', dims: { ...DIMS }, arch: 'moe', total: 236, active: 21, train: { minor: 0, severe: 0 } };
    assert.equal(nameGrantCheck(s1, m1, 'hn_qwen25').ok, false);

    const s2 = base('kimi');
    s2.strategy.rights.hn_kimi_k2 = { day: s2.day, until: '2027-01-01', used: null, void: null };
    const m2 = { ...E.workingModel(s2), id: 'test_b', stage: 'post', dims: { ...DIMS }, arch: 'moe', total: 671, active: 37, train: { minor: 0, severe: 0 } };
    assert.equal(nameGrantCheck(s2, m2, 'hn_kimi_k2').ok, false);

    const s3 = base('glm');
    setStance(s3, 'closed', { src: 'start' });
    s3.strategy.rights.hn_glm45 = { day: s3.day, until: '2027-01-01', used: null, void: null };
    const m3 = { ...E.workingModel(s3), id: 'test_c', stage: 'post', dims: { ...DIMS }, arch: 'moe', total: 355, active: 32, train: { minor: 0, severe: 0 } };
    assert.equal(nameGrantCheck(s3, m3, 'hn_glm45').ok, false);

    const s4 = base('minimax');
    s4.strategy.rights.hn_minimax01 = { day: s4.day, until: '2027-01-01', used: null, void: null };
    const m4 = { ...E.workingModel(s4), id: 'test_d', stage: 'post', dims: { ...DIMS }, arch: 'moe', total: 456, active: 45, train: { minor: 0, severe: 0 } };
    assert.equal(nameGrantCheck(s4, m4, 'hn_minimax01').ok, false);
  });
});

describe('P3.T 第 3 批：y2023 的可完成节点与授名可达性', () => {
  it('4 家 y2023：算上主干能排出 22 个以上可完成节点，没有走不到的节点，每个授名的节点可达', () => {
    for (const c of CODES) {
      const s = E.createGame(c, 'y2023', 1), t = resolvedTree(s), at = c;
      // 可完成的节点：主干里的自动节点（g_sota）不占策略槽，其余都算。
      const playable = t.nodes.filter(n => !n.auto);
      assert.ok(playable.length >= 22, `${at}：只有 ${playable.length} 个可完成节点`);
      assert.deepEqual(unreachableNodes(t.nodes), [], `${at} 有走不到的节点`);
      // 开局时没有任何节点的条件已经永远成立不了（不然它在这一局里就是死的）。
      for (const n of t.nodes.filter(n => n.available)) assert.equal(condPermanent(s, n.available), false, `${at}：${n.id} 开局就永久挡住了`);
      // 每个授名的节点都在树里、可达、不是自动节点。
      for (const h of FILES[c].names) {
        const n = t.byId.get(h.node);
        assert.ok(n, `${at}：${h.id} 的节点 ${h.node} 不在树里`);
        assert.ok(!unreachableNodes(t.nodes).includes(h.node), `${at}：${h.id} 的节点走不到`);
        assert.ok(!n.auto && !n.fiction, `${at}：${h.id} 的节点不能是自动或架空节点`);
        assert.ok(n.grants?.names?.includes(h.id), `${at}：${h.node} 没有授予 ${h.id}`);
      }
    }
  });
});
