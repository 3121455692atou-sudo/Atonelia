// P3.T 第 2 批：gemini、llama、mistral、grok 的史实树（规格 A5、A9、B6、C3、C4、F2 的 P3.T 行）。
// 锁住五件事：
//   1. 四个文件过校验器（含 A4.7 播种检查），本家节点数在 A5 的 15–20 之间，至少 2 个架空节点，分支、互斥、绕过齐全；
//   2. 4 个剧本开局：路线复现 B6，播种出来的进行中策略第一天就能推进，预完成和进度等于播种表；
//   3. 每个历史名都能按 C3 的条件授出：构造满足的状态 → nameGrantCheck 全 ✓，releaseNamePlan 拿到的就是这个名字；
//   4. y2023 算上主干能排出 22 个以上可完成节点，没有走不到的节点，每个授名的节点都可达；
//   5. A9 点名的本家路线节点存在，stance 和 from 对得上。
// 机器人统计（每个授名在史实日 ±6 个月内发生的种子比例）跑得慢，放在 /Volumes/ESD-EPA/atonelia-scratch/ds-tmp/p3t2/，结论见交付报告。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import gemini from '../../src/career/data/companies/gemini.js';
import llama from '../../src/career/data/companies/llama.js';
import mistral from '../../src/career/data/companies/mistral.js';
import grok from '../../src/career/data/companies/grok.js';
import { resolveTree } from '../../src/career/data/companies/index.js';
import { validateCompanyFile, validateAllTrees, seedErrors, unreachableNodes } from '../../src/career/data/companies/_schema.js';
import { START_STANCE } from '../../src/career/data/routes.js';
import { resolvedTree, nodeOf, curBlock, histDay } from '../../src/career/sim/strategy.js';
import { cond, condPermanent } from '../../src/career/sim/cond.js';
import { nameGrantCheck, releaseNamePlan } from '../../src/career/sim/naming.js';
import { setStance } from '../../src/career/sim/route.js';

const SCS = ['y2023', 'y2024', 'y2025', 'y2026'];
const FILES = { gemini, llama, mistral, grok };
const CODES = Object.keys(FILES);
const COUNT = { gemini: 19, llama: 20, mistral: 20, grok: 20 };

// 播种表：每个剧本预完成的本家节点、进行中的节点和进度（种子 1；策略不读随机数）。
const SEED = {
  gemini: {
    y2023: { done: [], cur: ['gg_bard', 0] },
    y2024: { done: ['gg_bard', 'gg_brain_merge', 'gg_native_mm', 'gg_tpu'], cur: ['gg_moe_switch', 0] },
    y2025: { done: ['gg_bard', 'gg_brain_merge', 'gg_native_mm', 'gg_tpu', 'gg_moe_switch', 'gg_million_ctx', 'gg_gemma', 'gg_search_ai'],
      cur: ['gg_25_thinking', 0] },
    y2026: { done: ['gg_bard', 'gg_brain_merge', 'gg_native_mm', 'gg_tpu', 'gg_moe_switch', 'gg_million_ctx', 'gg_gemma', 'gg_search_ai',
      'gg_25_thinking', 'gg_ultra_sub', 'gg_deep_think', 'gg_nano_banana', 'gg_tpu_sell', 'gg_gemini3'], cur: ['gg_apple_siri', 24] },
  },
  llama: {
    y2023: { done: [], cur: ['mt_llama_research', 0] },
    y2024: { done: ['mt_llama_research', 'mt_llama2_commercial', 'mt_code_llama', 'mt_meta_ai'], cur: ['mt_gpu_350k', 56] },
    y2025: { done: ['mt_llama_research', 'mt_llama2_commercial', 'mt_code_llama', 'mt_meta_ai', 'mt_gpu_350k', 'mt_llama3', 'mt_herd_405b',
      'mt_open_manifesto', 'mt_llama32', 'mt_gov_defense'], cur: ['mt_frontier_framework', 0] },
    y2026: { done: ['mt_llama_research', 'mt_llama2_commercial', 'mt_code_llama', 'mt_meta_ai', 'mt_gpu_350k', 'mt_llama3', 'mt_herd_405b',
      'mt_open_manifesto', 'mt_llama32', 'mt_gov_defense', 'mt_frontier_framework', 'mt_llama4', 'mt_api_app', 'mt_scale_ai', 'mt_msl'],
      cur: ['mt_compute_org', 24] },
  },
  mistral: {
    y2023: { done: [], cur: ['mi_found', 0] },
    y2024: { done: ['mi_found', 'mi_seven', 'mi_eu_lobby', 'mi_unicorn', 'mi_mixtral', 'mi_medium_closed'], cur: ['mi_msft', 0] },
    y2025: { done: ['mi_found', 'mi_seven', 'mi_eu_lobby', 'mi_unicorn', 'mi_mixtral', 'mi_medium_closed', 'mi_msft', 'mi_large', 'mi_research_license'],
      cur: ['mi_small3_apache', 6] },
    y2026: { done: ['mi_found', 'mi_seven', 'mi_eu_lobby', 'mi_unicorn', 'mi_mixtral', 'mi_medium_closed', 'mi_msft', 'mi_large', 'mi_research_license',
      'mi_small3_apache', 'mi_lechat', 'mi_defense', 'mi_magistral', 'mi_compute', 'mi_large3_apache', 'mi_devstral'], cur: ['mi_datacenter', 25] },
  },
  grok: {
    y2023: { done: [], cur: ['xa_found', 0] },
    y2024: { done: ['xa_found', 'xa_grok1', 'xa_x_platform'], cur: ['xa_grok1_open', 0] },
    y2025: { done: ['xa_found', 'xa_grok1', 'xa_x_platform', 'xa_lawsuit', 'xa_grok1_open', 'xa_grok2', 'xa_uncensored', 'xa_colossus', 'xa_api_app'],
      cur: ['xa_grok3', 23] },
    y2026: { done: ['xa_found', 'xa_grok1', 'xa_x_platform', 'xa_lawsuit', 'xa_grok1_open', 'xa_grok2', 'xa_uncensored', 'xa_colossus', 'xa_api_app',
      'xa_grok3', 'xa_grok4', 'xa_gov', 'xa_grok25_open', 'xa_cheap'], cur: ['xa_gigafactory', 56] },
  },
};
const ownNodes = t => t.nodes.filter(n => !n.id.startsWith('g_'));

describe('P3.T 第 2 批：四家史实树的文件与校验器', () => {
  it('四个文件都过校验器（含 A4.7 播种检查），这几家 0 条错误', () => {
    for (const c of CODES) {
      assert.deepEqual(validateCompanyFile(FILES[c], c), [], c);
      assert.deepEqual(seedErrors(FILES[c], c), [], c);
    }
    assert.deepEqual(validateAllTrees().filter(e => CODES.some(c => e.startsWith(c))), []);
  });

  it('本家节点数照 A5（15–20），接 core_llm，至少 2 个架空节点；分支、互斥、前置、绕过齐全', () => {
    for (const c of CODES) {
      const f = FILES[c], t = resolveTree(f.tree), own = f.tree.nodes;
      assert.equal(own.length, COUNT[c], c);
      assert.ok(own.length >= 15 && own.length <= 20, c);
      assert.equal(f.tree.extends, 'core_llm', c);
      assert.equal(t.core, 'core_llm', c);
      assert.equal(f.company, c, c);
      assert.equal(f.tree.id, c, c);
      assert.equal(own.filter(n => n.fiction).length >= 2, true, `${c} 至少两个架空节点`);
      for (const b of Object.keys(f.tree.branches)) assert.ok(own.some(n => n.branch === b), `${c} 分支 ${b} 没有节点`);
      for (const n of own) for (const id of n.excludes || []) assert.ok(nodeOf({ charId: c }, id)?.excludes?.includes(n.id), `${c} ${n.id} ↔ ${id}`);
      assert.ok(own.some(n => (n.prereq || []).some(g => g.length > 1)), `${c} 多路前置`);
      assert.ok(own.some(n => n.bypass), `${c} 绕过`);
      // 所有史实节点都能拿到日期；架空节点不写史实。
      for (const n of own) if (n.fiction) assert.ok(!n.hist, `${c} ${n.id} 架空节点不写史实`);
    }
  });

  it('A9 点名的本家路线节点都在，stance 和 from 对得上', () => {
    const want = {
      gemini: [['gg_gemma', 'open_family', ['closed', 'delayed', 'open_restricted']]],
      llama: [['mt_muse_closed', 'open_family', ['open_restricted', 'delayed', 'open']],
        ['mt_muse_open', 'open_restricted', ['open_family', 'open']]],
      mistral: [['mi_medium_closed', 'open_family', ['closed', 'open']],
        ['mi_research_license', 'open_restricted', ['open_family', 'delayed']],
        ['mi_large3_apache', 'open', ['open_restricted', 'delayed', 'open_family']]],
      grok: [['xa_grok1_open', 'delayed', ['closed', 'open_family']]],
    };
    for (const c of CODES) for (const [id, stance, from] of want[c]) {
      const n = FILES[c].tree.nodes.find(x => x.id === id);
      assert.ok(n, `${c} 缺路线节点 ${id}`);
      assert.equal(n.stance, stance, `${c} ${id} 的 stance`);
      assert.deepEqual(n.from, from, `${c} ${id} 的 from`);
      if (id === 'xa_grok1_open') assert.equal(n.license, 'permissive', 'Grok-1 开放用宽松许可');
    }
  });
});

describe('P3.T 第 2 批：四个剧本的开局路线与播种', () => {
  it('4 家 × 4 剧本：开局路线等于 B6；进行中的策略第一天就能推进；预完成和进度等于播种表', () => {
    for (const c of CODES) for (const sc of SCS) {
      const s = E.createGame(c, sc, 1), at = `${c} ${sc}`;
      assert.equal(s.strategy.tree, c, at);
      assert.deepEqual([s.route.stance, s.route.license ?? null], [START_STANCE[c][sc].stance, START_STANCE[c][sc].license ?? null], `${at} 路线`);
      assert.equal(curBlock(s), '', `${at}：${s.strategy.cur?.id} 推进不了`);
      const want = SEED[c][sc];
      const own = new Set(FILES[c].tree.nodes.map(n => n.id));
      const done = Object.keys(s.strategy.done).filter(id => own.has(id)).sort();
      assert.deepEqual(done, [...want.done].sort(), `${at} 预完成`);
      for (const id of done) assert.equal(s.strategy.done[id].how, 'start', `${at} ${id} 的完成方式`);
      assert.deepEqual([s.strategy.cur.id, s.strategy.cur.days], want.cur, `${at} 进行中`);
      const n = nodeOf(s, s.strategy.cur.id);
      assert.ok(!n.auto && cond(s, n.available), `${at}：${n.id} 的 available 不成立`);
      assert.ok(!n.from || n.from.includes(s.route.stance), `${at}：当前路线不在 ${n.id} 的 from 里`);
    }
  });

  it('已经预完成的路线节点按日期顺序重放以后，路线等于 B6 那一档', () => {
    for (const c of CODES) for (const sc of SCS) {
      const s = E.createGame(c, sc, 1);
      const routes = Object.entries(s.strategy.done).filter(([id]) => nodeOf(s, id)?.stance)
        .sort((a, b) => (a[1].day < b[1].day ? -1 : a[1].day > b[1].day ? 1 : 0));
      for (const [id] of routes) {
        const n = nodeOf(s, id);
        setStance(s, n.stance, { src: 'start', by: id, license: n.license ?? null });
      }
      assert.equal(s.route.stance, START_STANCE[c][sc].stance, `${c} ${sc}：重放 ${routes.map(x => x[0]).join('→') || '（没有本家路线节点）'}`);
    }
  });

  it('B6 表里的“(→X)”开局确实播下了路线节点：grok y2024 进行中的是 xa_grok1_open，完成后转到 delayed', () => {
    const s = E.createGame('grok', 'y2024', 1);
    assert.equal(s.strategy.cur?.id, 'xa_grok1_open');
    const n = nodeOf(s, 'xa_grok1_open');
    assert.equal(n.stance, 'delayed');
    setStance(s, n.stance, { src: 'start', by: n.id, license: n.license ?? null });
    assert.deepEqual([s.route.stance, s.route.license], ['delayed', 'permissive']);
  });
});

describe('P3.T 第 2 批：历史名授予（每个授名构造满足的状态）', () => {
  const DIMS = { knowledge: 99, code: 99, math: 99, writing: 99, safety: 90, agent: 99 };
  // 造一个条件全满足的状态：路线开到需要的档，技术齐全，世界里程碑记成我们做到的。
  function base(c, sc, stance) {
    const s = E.createGame(c, sc, 1);
    s.queue = [];
    setStance(s, stance, { src: 'start' });
    s.techs = [...new Set([...s.techs, 'moe', 'long_ctx', 'reasoning', 'func_call', 'agentic_rl'])];
    return s;
  }
  // 每个授名：公司、剧本、路线、要发布模型的样子（其余取在练模型）、要记成“我们做到”的里程碑。
  const CASES = {
    hn_gemini15_pro: { c: 'gemini', sc: 'y2023', stance: 'open', ms: ['ms_million_ctx'],
      model: { arch: 'moe', total: 600, active: 40, train: { minor: 0, severe: 0 } } },
    hn_llama2: { c: 'llama', sc: 'y2023', stance: 'open', ms: ['ms_open_commercial'],
      model: { arch: 'dense', total: 70, active: 70, train: { minor: 0, severe: 0 } } },
    hn_llama31_405b: { c: 'llama', sc: 'y2023', stance: 'open', ms: ['ms_open_frontier'],
      model: { arch: 'dense', total: 405, active: 405, train: { minor: 0, severe: 0 } } },
    hn_mistral7b: { c: 'mistral', sc: 'y2023', stance: 'open', ms: ['ms_small_strong'],
      model: { arch: 'dense', total: 7, active: 7, train: { minor: 0, severe: 0 } } },
    hn_mixtral: { c: 'mistral', sc: 'y2023', stance: 'open', ms: ['ms_moe_open'],
      model: { arch: 'moe', total: 47, active: 13, train: { minor: 0, severe: 0 } } },
    hn_grok3: { c: 'grok', sc: 'y2023', stance: 'closed', ms: [],
      model: { arch: 'moe', total: 600, active: 70, reasoning: true, train: { minor: 0, severe: 0 } } },
  };

  it('逐个构造：nameGrantCheck 全 ✓，releaseNamePlan 拿到的就是这个名字', () => {
    for (const c of CODES) {
      const defs = new Map(FILES[c].names.map(h => [h.id, h]));
      for (const [id, def] of defs) {
        const kase = CASES[id];
        assert.ok(kase, `${id} 没有构造用例`);
        assert.equal(kase.c, c);
        const s = base(c, kase.sc, kase.stance);
        for (const ms of kase.ms) s.ms[ms] = { who: 'me' };
        s.strategy.rights[id] = { day: s.day, until: '2027-12-31', used: null, void: null };
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

  it('条件不满足时拿不到：缺技术、不开源、规模不对、许可不对、闭源条件反着来', () => {
    // Gemini 1.5 Pro：有 MoE 但没长上下文和 MoE 技术。
    {
      const s = base('gemini', 'y2023', 'open');
      s.ms.ms_million_ctx = { who: 'me' };
      s.techs = s.techs.filter(x => x !== 'long_ctx' && x !== 'moe');
      s.strategy.rights.hn_gemini15_pro = { day: s.day, until: '2027-12-31', used: null, void: null };
      const m = { ...E.workingModel(s), id: 'neg_gemini', stage: 'post', dims: { ...DIMS }, arch: 'moe', total: 600, active: 40, train: { minor: 0, severe: 0 } };
      assert.equal(nameGrantCheck(s, m, 'hn_gemini15_pro').ok, false);
    }
    // Llama 2：不开源就拿不到。
    {
      const s = base('llama', 'y2023', 'closed');
      s.ms.ms_open_commercial = { who: 'me' };
      s.strategy.rights.hn_llama2 = { day: s.day, until: '2027-12-31', used: null, void: null };
      const m = { ...E.workingModel(s), id: 'neg_llama2', stage: 'post', dims: { ...DIMS }, arch: 'dense', total: 70, active: 70, train: { minor: 0, severe: 0 } };
      assert.equal(nameGrantCheck(s, m, 'hn_llama2').ok, false);
    }
    // Mistral 7B：规模超出上限。
    {
      const s = base('mistral', 'y2023', 'open');
      s.ms.ms_small_strong = { who: 'me' };
      s.strategy.rights.hn_mistral7b = { day: s.day, until: '2027-12-31', used: null, void: null };
      const m = { ...E.workingModel(s), id: 'neg_mi7', stage: 'post', dims: { ...DIMS }, arch: 'dense', total: 70, active: 70, train: { minor: 0, severe: 0 } };
      assert.equal(nameGrantCheck(s, m, 'hn_mistral7b').ok, false);
    }
    // Mixtral：激活参数超出上限。
    {
      const s = base('mistral', 'y2023', 'open');
      s.ms.ms_moe_open = { who: 'me' };
      s.strategy.rights.hn_mixtral = { day: s.day, until: '2027-12-31', used: null, void: null };
      const m = { ...E.workingModel(s), id: 'neg_mix', stage: 'post', dims: { ...DIMS }, arch: 'moe', total: 47, active: 40, train: { minor: 0, severe: 0 } };
      assert.equal(nameGrantCheck(s, m, 'hn_mixtral').ok, false);
    }
    // Llama 3.1 405B：不是稠密架构。
    {
      const s = base('llama', 'y2023', 'open');
      s.ms.ms_open_frontier = { who: 'me' };
      s.strategy.rights.hn_llama31_405b = { day: s.day, until: '2027-12-31', used: null, void: null };
      const m = { ...E.workingModel(s), id: 'neg_405b', stage: 'post', dims: { ...DIMS }, arch: 'moe', total: 405, active: 40, train: { minor: 0, severe: 0 } };
      assert.equal(nameGrantCheck(s, m, 'hn_llama31_405b').ok, false);
    }
    // Grok 3：闭源条件，开源了就拿不到。
    {
      const s = base('grok', 'y2023', 'open');
      s.strategy.rights.hn_grok3 = { day: s.day, until: '2027-12-31', used: null, void: null };
      const m = { ...E.workingModel(s), id: 'neg_grok3', stage: 'post', dims: { ...DIMS }, arch: 'moe', total: 600, active: 70, reasoning: true, train: { minor: 0, severe: 0 } };
      assert.equal(nameGrantCheck(s, m, 'hn_grok3').ok, false);
    }
  });
});

describe('P3.T 第 2 批：y2023 的可完成节点与授名可达性', () => {
  it('4 家 y2023：算上主干能排出 22 个以上可完成节点，没有走不到的节点，每个授名的节点可达', () => {
    for (const c of CODES) {
      const s = E.createGame(c, 'y2023', 1), t = resolvedTree(s), at = c;
      const playable = t.nodes.filter(n => !n.auto);
      assert.ok(playable.length >= 22, `${at}：只有 ${playable.length} 个可完成节点`);
      assert.deepEqual(unreachableNodes(t.nodes), [], `${at} 有走不到的节点`);
      for (const n of t.nodes.filter(n => n.available)) assert.equal(condPermanent(s, n.available), false, `${at}：${n.id} 开局就永久挡住了`);
      for (const h of FILES[c].names) {
        const n = t.byId.get(h.node);
        assert.ok(n, `${at}：${h.id} 的节点 ${h.node} 不在树里`);
        assert.ok(!unreachableNodes(t.nodes).includes(h.node), `${at}：${h.id} 的节点走不到`);
        assert.ok(!n.auto && !n.fiction, `${at}：${h.id} 的节点不能是自动或架空节点`);
        assert.ok(n.grants?.names?.includes(h.id), `${at}：${h.node} 没有授予 ${h.id}`);
        assert.ok(histDay(n), `${at}：${h.node} 要有史实日期`);
      }
    }
  });

  it('名表与 C3 的节点、现实发布日一致', () => {
    const want = {
      hn_gemini15_pro: ['gemini', 'gg_million_ctx', '2024-02-15'],
      hn_llama2: ['llama', 'mt_llama2_commercial', '2023-07-18'],
      hn_llama31_405b: ['llama', 'mt_herd_405b', '2024-07-23'],
      hn_mistral7b: ['mistral', 'mi_seven', '2023-09-27'],
      hn_mixtral: ['mistral', 'mi_mixtral', '2023-12-11'],
      hn_grok3: ['grok', 'xa_grok3', '2025-02-17'],
    };
    for (const c of CODES) for (const h of FILES[c].names) {
      assert.deepEqual([h.node, h.real], [want[h.id][1], want[h.id][2]], h.id);
      assert.equal(want[h.id][0], c, h.id);
    }
  });
});
