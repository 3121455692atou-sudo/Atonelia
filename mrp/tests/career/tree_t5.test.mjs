// P3.T 第 5 批：image2、midjourney、suno、elevenlabs 的史实树（规格 A5、A9、C3、C4、B6、F2 的 P3.T 行）。
// 锁住四件事：四家文件过校验器（含 A4.7 播种检查）；4 个剧本的开局路线等于 B6；
// 每个授名都能在构造的满足状态下授出；y2023 的树规模（image2 22 个节点、三棵轻量树各 32 个）和可达性。
// 机器人统计（每个授名在史实日 ±6 个月内的命中率）跑得慢，放在临时脚本里，结论见交付报告。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import image2 from '../../src/career/data/companies/image2.js';
import midjourney from '../../src/career/data/companies/midjourney.js';
import suno from '../../src/career/data/companies/suno.js';
import elevenlabs from '../../src/career/data/companies/elevenlabs.js';
import { COMPANY_FILES, resolveTree } from '../../src/career/data/companies/index.js';
import { validateCompanyFile, validateAllTrees, seedErrors, unreachableNodes } from '../../src/career/data/companies/_schema.js';
import { START_STANCE } from '../../src/career/data/routes.js';
import { resolvedTree, nodeOf, curBlock } from '../../src/career/sim/strategy.js';
import { cond } from '../../src/career/sim/cond.js';
import { nameGrantCheck, releaseNamePlan } from '../../src/career/sim/naming.js';
import { resolveAll } from '../helpers/career_bot.mjs';

const FILES = { image2, midjourney, suno, elevenlabs };
const SCS = ['y2023', 'y2024', 'y2025', 'y2026'];
const fresh = (c, sc, seed = 1) => { const s = E.createGame(c, sc, seed); resolveAll(s); return s; };
const OWN = { image2: 12, midjourney: 7, suno: 7, elevenlabs: 7 };
const BASE = { image2: 'core_image', midjourney: '_generic_image', suno: '_generic_music', elevenlabs: '_generic_speech' };
const NAMES = {
  image2: { hn_dalle3: 'DALL·E 3', hn_4o_image: 'GPT-4o 图像生成' },
  midjourney: { hn_mj_v6: 'Midjourney V6' },
  suno: { hn_suno_v3: 'Suno v3' },
  elevenlabs: { hn_eleven_v3: 'Eleven v3' },
};
const DIMS = { knowledge: 99, code: 99, math: 99, writing: 99, safety: 99, agent: 99,
  aesthetics: 99, adherence: 99, text: 99, realism: 99, composition: 99, vocals: 99, lyrics: 99, fidelity: 99,
  naturalness: 99, cloning: 99, multilingual: 99, expressive: 99 };

describe('P3.T 第 5 批：树与文件', () => {
  it('四家都过校验器（含 A4.7 播种检查），节点数照 A5，extends 对，image2 有 2 个以上 fiction', () => {
    for (const [c, f] of Object.entries(FILES)) {
      assert.deepEqual(validateCompanyFile(f, c), [], c);
      assert.deepEqual(seedErrors(f, c), [], c);
      const all = validateAllTrees();
      assert.deepEqual(all.filter(e => e.startsWith(c) || e.startsWith(`${c} `)), [], `${c} 在 validateAllTrees 里的错误`);
      assert.equal(f.tree.nodes.length, OWN[c], `${c} 本家节点数`);
      assert.equal(f.tree.extends, BASE[c], c);
      assert.equal(resolveTree(f.tree).core, { image2: 'core_image', midjourney: 'core_image', suno: 'core_music', elevenlabs: 'core_speech' }[c], c);
      if (c === 'image2') assert.ok(f.tree.nodes.filter(n => n.fiction).length >= 2, 'image2 至少 2 个 fiction');
    }
    // 轻量树继承通用树，展开以后是通用树 15 + 本家 + 主干。
    for (const c of ['midjourney', 'suno', 'elevenlabs']) {
      const t = resolveTree(FILES[c].tree);
      assert.equal(t.nodes.length, 15 + OWN[c] + 10, `${c} 展开后的节点数`);
    }
    assert.equal(resolveTree(image2.tree).nodes.length, OWN.image2 + 10, 'image2 展开后的节点数');
  });

  it('互斥两边都写、有绕过、有多路前置；没有走不到的节点；每个名都在树里且由节点授予', () => {
    for (const [c, f] of Object.entries(FILES)) {
      const t = resolveTree(f.tree);
      assert.deepEqual(unreachableNodes(t.nodes), [], c);
      const own = t.nodes.filter(n => f.tree.nodes.some(x => x.id === n.id));
      for (const n of own) for (const id of n.excludes || []) assert.ok(t.byId.get(id)?.excludes?.includes(n.id), `${c} ${n.id} ↔ ${id}`);
      assert.ok(own.some(n => (n.prereq || []).some(g => g.length > 1)), `${c} 要多路前置`);
      assert.ok(own.some(n => n.bypass), `${c} 要有绕过`);
      const names = f.names.map(x => x.id);
      assert.deepEqual(names, Object.keys(NAMES[c]), `${c} 名表`);
      for (const hn of f.names) {
        const n = nodeOf({ charId: c }, hn.node);
        assert.ok(n, `${c} ${hn.id} 的节点不在树里`);
        assert.ok(n.grants?.names?.includes(hn.id), `${c} ${hn.id} 没有授予`);
      }
    }
  });

  it('y2023 开局能排出的节点数：image2 22 个（12 本家 + 10 主干），三棵轻量树各 32 个（15 通用 + 7 本家 + 10 主干）；开局没有做不成的节点', () => {
    for (const c of Object.keys(FILES)) {
      const s = fresh(c, 'y2023');
      const t = resolvedTree(s);
      assert.equal(t.id, FILES[c].tree.id, c);
      assert.ok(t.nodes.length >= 22, `${c}：${t.nodes.length} 个节点`);
      assert.equal(t.nodes.length, c === 'image2' ? 22 : 32, c);
      for (const n of t.nodes) assert.notEqual(E.nodeStatus(s, n.id).state, 'blocked', `${c} ${n.id} y2023 开局就做不成`);
    }
  });
});

// （树的展开和 extends 在上面第一条里已经对过，这里不再另写包装。）

describe('P3.T 第 5 批：开局路线与播种（B6、A4.7）', () => {
  it('4 个剧本的开局路线等于 B6；播种出来的进行中策略第一天就能推进，available 和 from 都站得住', () => {
    for (const c of Object.keys(FILES)) for (const sc of SCS) {
      const s = fresh(c, sc);
      const want = START_STANCE[c][sc];
      assert.deepEqual([s.route.stance, s.route.license], [want.stance, want.license], `${c} ${sc} 路线`);
      assert.equal(s.strategy.tree, FILES[c].tree.id, `${c} ${sc} 树`);
      assert.ok(s.strategy.cur, `${c} ${sc} 开局有进行中的策略`);
      assert.equal(curBlock(s), '', `${c} ${sc}：${s.strategy.cur.id} 开局推进不了`);
      const n = nodeOf(s, s.strategy.cur.id);
      assert.ok(cond(s, n.available), `${c} ${sc}：${n.id} 的 available 不成立`);
      assert.ok(!n.from || n.from.includes(s.route.stance), `${c} ${sc}：${n.id} 的 from 不含当前路线`);
    }
  });
});

describe('P3.T 第 5 批：每个授名都能授出', () => {
  // 造一个“条件全满足”的模型：只留要测的那条授权，其他授权删掉，免得 releaseNamePlan 自动挑到别的名字。
  function ready(c, id) {
    const s = fresh(c, 'y2023');
    s.queue = [];
    s.strategy.rights = { [id]: { day: s.day, until: '2027-01-01', used: null, void: null } };
    const m = { ...E.workingModel(s), id: `test_${id}`, stage: 'post', role: 'flagship', train: { minor: 0, severe: 0 },
      dims: { ...DIMS } };
    return { s, m };
  }
  it('每个授名：nameGrantCheck 全 ✓，releaseNamePlan 拿到的就是这个授名和名字', () => {
    for (const [c, names] of Object.entries(NAMES)) {
      for (const [id, name] of Object.entries(names)) {
        const { s, m } = ready(c, id);
        const chk = nameGrantCheck(s, m, id);
        assert.ok(chk.ok, `${c} ${id}：${chk.lines.filter(l => !l.ok).map(l => `${l.text}（${l.now}）`).join('；')}`);
        assert.ok(chk.lines.every(l => l.ok), `${c} ${id}`);
        const plan = releaseNamePlan(s, m);
        assert.equal(plan.ok, true, `${c} ${id}：${plan.reason}`);
        assert.equal(plan.grant, id, `${c} ${id} 的授名`);
        assert.equal(plan.name, name, `${c} ${id} 的名字`);
      }
    }
  });
});
