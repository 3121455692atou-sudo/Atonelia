// P3.T 第 6 批：rwkv、perplexity、novelai、jev 的史实树（规格 A5、A8、B6、C2、F2 的 P3.T 行）。
// 锁住四件事：四家文件过校验器（含 A4.7 播种检查）；4 个剧本的开局路线等于 B6；
// 每个授名都能在构造的满足状态下授出；y2023 的树规模（每家 6 个本家节点 + 通用树 + 主干）和可达性。
// 机器人统计（每个授名在史实日 ±6 个月内的命中率）跑得慢，放在临时脚本里，结论见交付报告。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import rwkv from '../../src/career/data/companies/rwkv.js';
import perplexity from '../../src/career/data/companies/perplexity.js';
import novelai from '../../src/career/data/companies/novelai.js';
import jev from '../../src/career/data/companies/jev.js';
import { resolveTree } from '../../src/career/data/companies/index.js';
import { validateCompanyFile, validateAllTrees, seedErrors, unreachableNodes } from '../../src/career/data/companies/_schema.js';
import { START_STANCE } from '../../src/career/data/routes.js';
import { resolvedTree, nodeOf, curBlock } from '../../src/career/sim/strategy.js';
import { cond } from '../../src/career/sim/cond.js';
import { nameGrantCheck, releaseNamePlan } from '../../src/career/sim/naming.js';
import { resolveAll } from '../helpers/career_bot.mjs';

const FILES = { rwkv, perplexity, novelai, jev };
const SCS = ['y2023', 'y2024', 'y2025', 'y2026'];
const fresh = (c, sc, seed = 1) => { const s = E.createGame(c, sc, seed); resolveAll(s); return s; };
const OWN = 6;
const FICTION = { rwkv: 2, perplexity: 2, novelai: 2, jev: 1 };
const NAMES = {
  rwkv: { hn_rwkv4_raven: 'RWKV-4 Raven 14B', hn_rwkv5_eagle: 'RWKV-5 Eagle 7B', hn_rwkv7_goose: 'RWKV-7 Goose' },
  perplexity: { hn_pplx_online: 'pplx-70b-online', hn_pplx_sonar: 'Sonar' },
  novelai: { hn_nai_clio: 'Clio', hn_nai_kayra: 'Kayra', hn_nai_erato: 'Erato', hn_nai_xialong: 'Xialong' },
  jev: { hn_jev: 'Jev', hn_jev_novel_2: 'JEVnovel 2' },
};
const DIMS = { knowledge: 99, code: 99, math: 99, writing: 99, safety: 99, agent: 99 };

describe('P3.T 第 6 批：树与文件', () => {
  it('四家都过校验器（含 A4.7 播种检查），每家 6 个本家节点、接 _generic_llm、有架空节点', () => {
    for (const [c, f] of Object.entries(FILES)) {
      assert.deepEqual(validateCompanyFile(f, c), [], c);
      assert.deepEqual(seedErrors(f, c), [], c);
      const all = validateAllTrees();
      assert.deepEqual(all.filter(e => e.startsWith(c) || e.startsWith(`${c} `)), [], `${c} 在 validateAllTrees 里的错误`);
      assert.equal(f.tree.nodes.length, OWN, `${c} 本家节点数`);
      assert.equal(f.tree.extends, '_generic_llm', c);
      assert.equal(resolveTree(f.tree).core, 'core_llm', c);
      assert.equal(resolveTree(f.tree).nodes.length, 15 + OWN + 12, `${c} 展开后的节点数（通用 15 + 本家 6 + 主干 12）`);
      assert.equal(f.tree.nodes.filter(n => n.fiction).length, FICTION[c], `${c} 的架空节点数`);
      assert.equal(f.startSpirits.length, 1, `${c} 的开局特质`);
    }
  });

  it('互斥两边都写、有绕过、有多路前置；没有走不到的节点；每个名都在树里且由节点授予', () => {
    for (const [c, f] of Object.entries(FILES)) {
      const t = resolveTree(f.tree);
      assert.deepEqual(unreachableNodes(t.nodes), [], c);
      const own = t.nodes.filter(n => f.tree.nodes.some(x => x.id === n.id));
      for (const n of own) for (const id of n.excludes || []) assert.ok(t.byId.get(id)?.excludes?.includes(n.id), `${c} ${n.id} ↔ ${id}`);
      assert.ok(own.some(n => n.excludes?.length), `${c} 要有互斥`);
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

  it('y2023 开局能排出的节点数（每家 33 个），开局没有一上来就做不成的节点', () => {
    for (const c of Object.keys(FILES)) {
      const s = fresh(c, 'y2023');
      const t = resolvedTree(s);
      assert.equal(t.id, FILES[c].tree.id, c);
      assert.equal(t.nodes.length, 33, c);
      assert.ok(t.nodes.length >= 22, `${c}：${t.nodes.length} 个节点`);
      for (const n of t.nodes) assert.notEqual(E.nodeStatus(s, n.id).state, 'blocked', `${c} ${n.id} y2023 开局就做不成`);
    }
  });
});

describe('P3.T 第 6 批：开局路线与播种（B6、A4.7）', () => {
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

describe('P3.T 第 6 批：每个授名都能授出', () => {
  // 造一个“条件全满足”的模型：只留要测的那条授权，其他授权删掉，免得 releaseNamePlan 自动挑到别的名字。
  function ready(c, hn) {
    // 小模型授名要有一款比在线旗舰弱的模型，才会按副线 / 小模型发布（releaseLine）。
    const sc = hn.role === 'small' ? 'y2024' : 'y2023';
    const s = fresh(c, sc);
    s.queue = [];
    s.strategy.rights = { [hn.id]: { day: s.day, until: '2027-01-01', used: null, void: null } };
    const total = hn.model.maxTotal && hn.model.maxTotal < 32 ? hn.model.maxTotal : (hn.model.minTotal || 7);
    const dims = hn.role === 'small' ? { ...DIMS, knowledge: 20, code: 20, math: 20, writing: 20, safety: 20, agent: 20 } : { ...DIMS };
    const m = { ...E.workingModel(s), id: `test_${hn.id}`, stage: 'post', role: hn.role, train: { minor: 0, severe: 0 },
      total, active: total, arch: 'dense', dims };
    return { s, m };
  }
  it('每个授名：nameGrantCheck 全 ✓，releaseNamePlan 拿到的就是这个授名和名字', () => {
    for (const [c, names] of Object.entries(NAMES)) {
      const byId = new Map(FILES[c].names.map(x => [x.id, x]));
      for (const [id, name] of Object.entries(names)) {
        const { s, m } = ready(c, byId.get(id));
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
