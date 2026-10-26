// P3.T 第 1 批：gpt、claude、fable 的史实树（规格 A5、A9、C3、C4、B6、F2 的 P3.T 行）。
// 锁住四件事：三家文件过校验器（含 A4.7 播种检查）、4 个剧本开局路线复现 B6、每个历史名都能按条件授出、
// y2023 能排出 ≥22 个可完成节点（算上主干）且没有走不到的节点、每个授名都有可达的节点。
// 机器人统计（每个授名在史实日 ±6 个月内的比例）跑得慢，放在 /Volumes/ESD-EPA/atonelia-scratch/ds-tmp/p3t1/，结论见交付报告。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { COMPANY_FILES, resolveTree } from '../../src/career/data/companies/index.js';
import { validateCompanyFile, validateAllTrees, seedErrors, unreachableNodes } from '../../src/career/data/companies/_schema.js';
import { START_STANCE } from '../../src/career/data/routes.js';
import { resolvedTree, curBlock, nodeOf, histDay } from '../../src/career/sim/strategy.js';
import { setStance } from '../../src/career/sim/route.js';
import { nameGrantCheck, releaseNamePlan } from '../../src/career/sim/naming.js';
import { resolveAll } from '../helpers/career_bot.mjs';

const SCS = ['y2023', 'y2024', 'y2025', 'y2026'];
const IDS = ['gpt', 'claude', 'fable'];
const fresh = (id, sc, seed = 1) => { const s = E.createGame(id, sc, seed); resolveAll(s); return s; };
const file = id => COMPANY_FILES[id];

// A5 的本家节点数：gpt、claude 是完整史实树 15–20；fable 是史实树 8–12。
const COUNT = { gpt: 20, claude: 20, fable: 11 };

describe('P3.T 第 1 批：三家文件与树', () => {
  it('全部树过校验器（含 A4.7 播种检查），这三家 0 条错误', () => {
    const errs = validateAllTrees();
    assert.deepEqual(errs.filter(e => IDS.some(id => e.startsWith(id))), []);
    assert.deepEqual(errs, []);
    for (const id of IDS) {
      assert.deepEqual(validateCompanyFile(file(id), id), [], id);
      assert.deepEqual(seedErrors(file(id), id), [], id);
    }
  });

  it('节点数照 A5；都接 core_llm；有 base 分支；至少 2 个 fiction；互斥两边对称；至少一个多路前置和一个绕过', () => {
    for (const id of IDS) {
      const f = file(id), t = resolveTree(f.tree), own = f.tree.nodes;
      assert.equal(own.length, COUNT[id], id);
      assert.equal(f.tree.extends, 'core_llm', id);
      assert.equal(t.core, 'core_llm', id);
      assert.equal(t.byId.get('g_sota')?.branch, 'base', id);
      assert.equal(own.filter(n => n.fiction).length >= 2, true, `${id} 至少 2 个 fiction`);
      if (id === 'gpt') assert.ok(own.some(n => n.id === 'gpt_oss' && n.stance === 'open_family'));
      if (id === 'claude') assert.ok(own.some(n => n.id === 'cl_open_safety' && n.fiction && n.stance === 'open_family'));
      if (id === 'fable') assert.equal(own.filter(n => n.stance).length, 0, 'fable 没有本家路线节点');
      for (const b of Object.keys(f.tree.branches)) assert.ok(own.some(n => n.branch === b), `${id} 分支 ${b} 没有节点`);
      for (const n of own) for (const x of n.excludes || []) assert.ok(own.find(y => y.id === x)?.excludes?.includes(n.id), `${id} ${n.id} ↔ ${x}`);
      assert.ok(own.some(n => (n.prereq || []).some(g => g.length > 1)), `${id} 多路前置`);
      assert.ok(own.some(n => n.bypass), `${id} 绕过`);
      // 所有 hist 日期都来自 timeline JSON（同一天或同一个月在时间线里出现过）。
      for (const n of own) if (n.hist) assert.ok(!n.fiction, `${id} ${n.id} 架空节点不写史实`);
    }
  });

  it('gpt 的本家路线节点 gpt_oss 转 open_family', () => {
    const n = file('gpt').tree.nodes.find(x => x.id === 'gpt_oss');
    assert.equal(n.stance, 'open_family');
    assert.deepEqual(n.from, ['closed']);
    assert.equal(n.hist.date, '2025-08-05');
  });

  it('claude 与 fable 共用三个 an_ 节点：Fable 复制定义、改 id 前缀', () => {
    const cl = file('claude').tree.nodes;
    const shared = cl.filter(n => n.id.startsWith('an_'));
    assert.deepEqual(shared.map(n => n.id).sort(), ['an_constitution', 'an_evals', 'an_rsp']);
    const fb = file('fable').tree.nodes;
    for (const n of shared) {
      const copy = fb.find(x => x.id === n.id.replace(/^an_/, 'fb_'));
      assert.ok(copy, `fable 缺 ${n.id} 的复制`);
      for (const k of ['title', 'desc', 'days', 'hist']) assert.deepEqual(copy[k], n[k], `${n.id} 的 ${k}`);
    }
  });
});

describe('P3.T 第 1 批：4 个剧本开局', () => {
  it('开局路线复现 B6；播种出来的进行中策略第一天就能推进', () => {
    for (const id of IDS) for (const sc of SCS) {
      const s = fresh(id, sc);
      assert.equal(s.strategy.tree, file(id).tree.id, `${id} ${sc} 用的是本家树`);
      assert.equal(s.route.stance, START_STANCE[id][sc].stance, `${id} ${sc} 路线`);
      assert.equal(s.route.license, START_STANCE[id][sc].license, `${id} ${sc} 许可`);
      const why = curBlock(s);
      assert.equal(why, '', `${id} ${sc}：${s.strategy.cur?.id} 开局就推进不了（${why}）`);
    }
  });

  it('已预完成的路线节点按日期顺序施加后，结果等于 B6 的表', () => {
    for (const id of IDS) for (const sc of SCS) {
      const s = fresh(id, sc);
      const routes = Object.entries(s.strategy.done)
        .filter(([nid]) => nodeOf(s, nid)?.stance)
        .sort((a, b) => (a[1].day < b[1].day ? -1 : a[1].day > b[1].day ? 1 : 0));
      for (const [nid] of routes) setStance(s, nodeOf(s, nid).stance, { src: 'start', by: nid, license: nodeOf(s, nid).license ?? null });
      assert.equal(s.route.stance, START_STANCE[id][sc].stance, `${id} ${sc} 路线节点复现`);
    }
  });

  it('y2023 能排出 ≥22 个可完成节点（算上主干），没有走不到的节点；每个授名都有可达的节点', () => {
    for (const id of IDS) {
      const f = file(id), t = resolveTree(f.tree);
      const own = f.tree.nodes;
      assert.ok(t.nodes.length >= 22, `${id} 只有 ${t.nodes.length} 个节点`);
      const lost = unreachableNodes(t.nodes.filter(n => Array.isArray(n.prereq ?? [])));
      assert.deepEqual(lost, [], `${id} 走不到的节点`);
      const before = own.filter(n => histDay(n) && !n.fiction && histDay(n) < '2023-01-01');
      const cur = fresh(id, 'y2023').strategy.cur;
      assert.ok(cur, `${id} y2023 应该有进行中的策略`);
      assert.ok(t.byId.has(cur.id), `${id} 进行中的策略在树里`);
      for (const hn of f.names) assert.ok(t.byId.has(hn.node) && !lost.includes(hn.node), `${id} 授名 ${hn.id} 的节点 ${hn.node} 不可达`);
    }
  });
});

describe('P3.T 第 1 批：每个授名都能按条件授出', () => {
  const DIMS = { knowledge: 99, code: 99, math: 99, writing: 99, safety: 99, agent: 99 };
  const clean = { train: { minor: 0, severe: 0 } };
  // 造一个条件全满足的状态：路线闭源、授权在手、模型能力拉满。
  function base(id, sc) {
    const s = fresh(id, sc);
    s.queue = [];
    setStance(s, 'closed', { src: 'start' });
    s.techs = [...new Set([...s.techs, 'agentic_rl', 'reasoning'])];
    s.products.chat = { ...(s.products.chat || {}), on: true };
    s.products.api = { ...(s.products.api || {}), on: true, tier: 'standard' };
    // 授名的 world 条件里有“已经有小模型在卖”：放一个在线小模型。
    s.models.push({ id: 'sm_test', stage: 'released', role: 'small', line: 'small', dims: { ...DIMS } });
    s.smallLive = 'sm_test';
    return s;
  }
  const CASES = {
    hn_gpt4: { sc: 'y2023', model: { total: 600, ...clean } },
    hn_gpt4o: { sc: 'y2023', model: { total: 671, ...clean } },
    hn_o1: { sc: 'y2023', model: { reasoning: true, cleanStreak: { math: 21 }, ...clean } },
    hn_claude3_opus: { sc: 'y2024', model: { ...clean } },
    hn_claude35_sonnet: { sc: 'y2024', model: { code: 99, ...clean } },
    hn_claude_opus4: { sc: 'y2024', model: { ...clean } },
    hn_fable5: { sc: 'y2026', model: { total: 800, writing: 80, ...clean } },
  };

  it('逐家逐个构造满足的状态：nameGrantCheck 全 ✓，releaseNamePlan 拿到的就是这个授名', () => {
    for (const id of IDS) {
      const defs = new Map(file(id).names.map(h => [h.id, h]));
      for (const [hid, def] of defs) {
        const { sc, model } = CASES[hid];
        const s = base(id, sc);
        s.strategy.rights[hid] = { day: s.day, until: '2027-12-31', used: null, void: null };
        // 世界条件：自家的里程碑记成“我们做到了”。
        s.ms.ms_gpt4 = { who: 'me' };
        s.ms.ms_reasoning = { who: 'me' };
        const m = { ...E.workingModel(s), id: `test_${hid}`, stage: 'post', role: 'flagship', dims: { ...DIMS }, ...model };
        const c = nameGrantCheck(s, m, hid);
        assert.ok(c.ok, `${hid}：${c.lines.filter(l => !l.ok).map(l => `${l.text}（${l.now}）`).join('；')}`);
        assert.ok(c.lines.every(l => l.ok), hid);
        const p = releaseNamePlan(s, m);
        assert.equal(p.ok, true, `${hid}：${p.reason}`);
        assert.equal(p.grant, hid, hid);
        assert.equal(p.name, def.name, hid);
      }
    }
  });
});
