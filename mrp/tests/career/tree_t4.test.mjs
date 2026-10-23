// P3.T 第 4 批：seed、ernie、hunyuan、stepfun 的完整史实树（规格 A5、A9、C3、C4、B6、F2 的 P3.T 行）。
// 锁住四件事：
//   1. 四家文件过校验器（含 A4.7 播种检查），本家节点数照 A5，每棵都有 2 个 fiction、互斥、多路前置和绕过；
//   2. 4 个剧本的开局路线复现 B6，已预完成的路线节点按日期顺序施加后也等于 B6；
//   3. 每个授名都能按条件授出：构造满足的状态 → nameGrantCheck 全 ✓，releaseNamePlan 拿到的就是这个名字；
//   4. y2023 开局算上主干能排出 22 个以上节点，没有走不到的节点，每个授名的节点都可达。
// 机器人统计（每个授名在史实日 ±6 个月内的比例）跑得慢，放在 /Volumes/ESD-EPA/atonelia-scratch/ds-tmp/p3t4/，结论见交付报告。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { COMPANY_FILES, resolveTree } from '../../src/career/data/companies/index.js';
import { validateCompanyFile, validateAllTrees, seedErrors, unreachableNodes } from '../../src/career/data/companies/_schema.js';
import { START_STANCE } from '../../src/career/data/routes.js';
import { resolvedTree, nodeOf, curBlock } from '../../src/career/sim/strategy.js';
import { setStance } from '../../src/career/sim/route.js';
import { nameGrantCheck, releaseNamePlan } from '../../src/career/sim/naming.js';
import { resolveAll } from '../helpers/career_bot.mjs';

const SCS = ['y2023', 'y2024', 'y2025', 'y2026'];
const IDS = ['seed', 'ernie', 'hunyuan', 'stepfun'];
const file = id => COMPANY_FILES[id];
const fresh = (id, sc, seed = 1) => { const s = E.createGame(id, sc, seed); resolveAll(s); return s; };

// A5 的本家节点数（完整史实树 15–20）。
const COUNT = { seed: 18, ernie: 20, hunyuan: 20, stepfun: 18 };
// A9 的本家路线节点：id → [stance, license]。
const ROUTE_NODES = {
  seed: { sd_oss: ['open_family', null] },
  ernie: { er_open45: ['delayed', 'permissive'] },
  hunyuan: { hy_large_open: ['open_restricted', 'restrictive'], hy_t1_closed: ['open_family', null], hy_hy3_open: ['open_restricted', 'restrictive'] },
  stepfun: { st_step3_open: ['open', 'permissive'] },
};
// 播种出来的进行中策略（种子 1；策略不读随机数）。y2023 / y2024 里没有落在 90 天窗口的史实节点时由顾问挑一项。
const SEED_CUR = {
  seed: { y2023: 'sd_doubao', y2024: 'sd_doubao', y2025: 'sd_doubao_15', y2026: 'sd_doubao_20' },
  ernie: { y2023: 'er_yiyan', y2024: 'er_turbo', y2025: 'er_45_x1', y2026: 'er_51' },
  hunyuan: { y2023: 'hy_base', y2024: 'hy_large_release', y2025: 'hy_turbos', y2026: 'hy_h200' },
  stepfun: { y2023: 'st_step1', y2024: 'st_step1', y2025: 'st_video', y2026: 'st_ace15' },
};

describe('P3.T 第 4 批：四家的树与文件', () => {
  it('全部树过校验器（含 A4.7 播种检查），这四家 0 条错误', () => {
    const errs = validateAllTrees();
    assert.deepEqual(errs.filter(e => IDS.some(id => e.startsWith(id))), []);
    assert.deepEqual(errs, []);
    for (const id of IDS) {
      assert.deepEqual(validateCompanyFile(file(id), id), [], id);
      assert.deepEqual(seedErrors(file(id), id), [], id);
    }
  });

  it('本家节点数照 A5；都接 core_llm；至少 2 个 fiction；分支、互斥、多路前置、绕过齐全', () => {
    for (const id of IDS) {
      const f = file(id), t = resolveTree(f.tree), own = f.tree.nodes;
      assert.equal(own.length, COUNT[id], id);
      assert.equal(f.tree.extends, 'core_llm', id);
      assert.equal(t.core, 'core_llm', id);
      assert.equal(t.byId.get('g_sota')?.branch, 'base', id);
      assert.ok(own.filter(n => n.fiction).length >= 2, `${id} 至少 2 个 fiction`);
      for (const b of Object.keys(f.tree.branches)) assert.ok(own.some(n => n.branch === b), `${id} 分支 ${b} 没有节点`);
      for (const n of own) for (const x of n.excludes || []) assert.ok(own.find(y => y.id === x)?.excludes?.includes(n.id), `${id} ${n.id} ↔ ${x}`);
      assert.ok(own.some(n => (n.prereq || []).some(g => g.length > 1)), `${id} 多路前置`);
      assert.ok(own.some(n => n.bypass), `${id} 绕过`);
      // 架空节点不写史实；史实节点都落在 2024–2026 的开局和主线窗口里。
      for (const n of own) if (n.hist) assert.ok(!n.fiction, `${id} ${n.id} 架空节点不写史实`);
    }
  });

  it('A9 列出的本家路线节点都在，stance / license / from 对', () => {
    for (const [id, nodes] of Object.entries(ROUTE_NODES)) {
      for (const [nid, [stance, license]] of Object.entries(nodes)) {
        const n = file(id).tree.nodes.find(x => x.id === nid);
        assert.ok(n, `${id} 缺路线节点 ${nid}`);
        assert.equal(n.stance, stance, `${id} ${nid} 的路线`);
        assert.equal(n.license ?? null, license, `${id} ${nid} 的许可`);
        assert.ok(Array.isArray(n.from) && n.from.length > 0 && !n.from.includes(stance), `${id} ${nid} 的 from`);
        assert.equal(n.popup, 'card', `${id} ${nid} 要弹卡`);
      }
    }
    // 名表：C3 没有这四家的固定行（A9 只写“可选”），每家各加一个有把握的名字。
    assert.deepEqual(file('seed').names.map(n => n.id), ['hn_doubao_15']);
    assert.deepEqual(file('ernie').names.map(n => n.id), ['hn_ernie_x1']);
    assert.deepEqual(file('hunyuan').names.map(n => n.id), ['hn_hunyuan_large']);
    assert.deepEqual(file('stepfun').names.map(n => n.id), ['hn_step3']);
    // C4 没有这四家的专属事件。
    for (const id of IDS) assert.deepEqual(file(id).exclusives, [], id);
  });
});

describe('P3.T 第 4 批：4 个剧本开局与播种', () => {
  it('开局路线复现 B6；播种出来的进行中策略第一天就能推进', () => {
    for (const id of IDS) for (const sc of SCS) {
      const s = fresh(id, sc);
      const want = START_STANCE[id][sc];
      assert.deepEqual([s.route.stance, s.route.license], [want.stance, want.license], `${id} ${sc} 路线`);
      assert.equal(s.strategy.tree, file(id).tree.id, `${id} ${sc} 树`);
      assert.equal(s.strategy.cur?.id, SEED_CUR[id][sc], `${id} ${sc} 进行中的策略`);
      const why = curBlock(s);
      assert.equal(why, '', `${id} ${sc}：${s.strategy.cur.id} 开局就推进不了（${why}）`);
    }
  });

  it('已预完成的路线节点按日期顺序施加后，结果等于 B6', () => {
    for (const id of IDS) for (const sc of SCS) {
      const s = fresh(id, sc);
      const routes = Object.entries(s.strategy.done)
        .filter(([nid]) => nodeOf(s, nid)?.stance)
        .sort((a, b) => (a[1].day < b[1].day ? -1 : a[1].day > b[1].day ? 1 : 0));
      for (const [nid] of routes) setStance(s, nodeOf(s, nid).stance, { src: 'start', by: nid, license: nodeOf(s, nid).license ?? null });
      assert.equal(s.route.stance, START_STANCE[id][sc].stance, `${id} ${sc} 路线节点复现`);
      assert.equal(s.route.license, START_STANCE[id][sc].license, `${id} ${sc} 许可复现`);
    }
  });

  it('史实路线节点在对应剧本里已经预完成：seed y2026、ernie y2026、hunyuan y2025/y2026、stepfun y2026', () => {
    const done = (id, sc, nid) => !!fresh(id, sc).strategy.done[nid];
    assert.ok(done('seed', 'y2026', 'sd_oss'));
    assert.ok(done('ernie', 'y2026', 'er_open45'));
    assert.ok(done('hunyuan', 'y2025', 'hy_large_open'));
    assert.ok(done('hunyuan', 'y2026', 'hy_t1_closed'));
    assert.ok(done('stepfun', 'y2026', 'st_step3_open'));
  });

  it('y2023 开局算上主干能排出 22 个以上节点，没有走不到的节点，每个授名的节点都可达', () => {
    for (const id of IDS) {
      const f = file(id), t = resolveTree(f.tree);
      assert.ok(t.nodes.length >= 22, `${id} 只有 ${t.nodes.length} 个节点`);
      const lost = unreachableNodes(t.nodes.filter(n => Array.isArray(n.prereq ?? [])));
      assert.deepEqual(lost, [], `${id} 走不到的节点`);
      const s = fresh(id, 'y2023');
      assert.equal(resolvedTree(s).id, f.tree.id, id);
      for (const n of t.nodes) assert.notEqual(E.nodeStatus(s, n.id).state, 'blocked', `${id} ${n.id} y2023 开局就做不成`);
      for (const hn of f.names) assert.ok(t.byId.has(hn.node) && !lost.includes(hn.node), `${id} 授名 ${hn.id} 的节点 ${hn.node} 不可达`);
    }
  });
});

describe('P3.T 第 4 批：每个授名都能按条件授出', () => {
  const DIMS = { knowledge: 99, code: 99, math: 99, writing: 99, safety: 99, agent: 99 };
  // 授名的世界条件为空；各自还差路线开闭和结构条件，这里按授名的条件搭。
  function ready(id, sc, stance, techs) {
    const s = fresh(id, sc);
    s.queue = [];
    s.strategy.rights = {};
    setStance(s, stance, { src: 'start' });
    s.techs = [...new Set([...s.techs, ...techs])];
    return s;
  }
  const CASES = {
    hn_doubao_15: { c: 'seed', sc: 'y2023', stance: 'closed', techs: ['moe'], model: { total: 236 } },
    hn_ernie_x1: { c: 'ernie', sc: 'y2023', stance: 'closed', techs: ['reasoning'], model: { reasoning: true } },
    hn_hunyuan_large: { c: 'hunyuan', sc: 'y2023', stance: 'open_restricted', techs: ['moe'], model: { arch: 'moe', total: 236, active: 32 } },
    hn_step3: { c: 'stepfun', sc: 'y2023', stance: 'open', techs: ['moe'], model: { arch: 'moe', total: 236, active: 32 } },
  };

  it('逐家逐个构造满足的状态：nameGrantCheck 全 ✓，releaseNamePlan 拿到的就是这个授名和名字', () => {
    for (const id of ['seed', 'ernie', 'hunyuan', 'stepfun']) {
      const defs = new Map(file(id).names.map(h => [h.id, h]));
      assert.equal(defs.size, 1, id);
      for (const [hid, def] of defs) {
        const { c, sc, stance, techs, model } = CASES[hid];
        const s = ready(c, sc, stance, techs);
        s.strategy.rights[hid] = { day: s.day, until: '2027-12-31', used: null, void: null };
        const m = { ...E.workingModel(s), id: `test_${hid}`, stage: 'post', role: 'flagship', train: { minor: 0, severe: 0 }, dims: { ...DIMS }, ...model };
        const chk = nameGrantCheck(s, m, hid);
        assert.ok(chk.ok, `${hid}：${chk.lines.filter(l => !l.ok).map(l => `${l.text}（${l.now}）`).join('；')}`);
        assert.ok(chk.lines.every(l => l.ok), hid);
        const plan = releaseNamePlan(s, m);
        assert.equal(plan.ok, true, `${hid}：${plan.reason}`);
        assert.equal(plan.grant, hid, hid);
        assert.equal(plan.name, def.name, hid);
      }
    }
  });
});
