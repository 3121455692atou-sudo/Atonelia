// 四棵通用树（P3.1，规格 A5、A8、F2）：格式和词表过校验器；y2023 每棵树都能排出 22 个以上可完成节点（算上主干）；
// 没有走不到的节点；通用树不碰开源 / 闭源路线，也不带真实型号名。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { CORE_TREES, CORE_OF } from '../../src/career/data/strategy_core.js';
import { COMPANY_FILES, GENERIC_FILES, resolveTree } from '../../src/career/data/companies/index.js';
import { validateAllTrees, unreachableNodes } from '../../src/career/data/companies/_schema.js';
import { resolvedTree } from '../../src/career/sim/strategy.js';

const MODS = ['llm', 'image', 'music', 'speech'];
const SAMPLE = { llm: 'rwkv', image: 'image2', music: 'suno', speech: 'elevenlabs' };
// 节点标题 / 说明里不出现年份和真实型号名（通用树给任何公司用，包括从零开局的虚构公司）。
const OWN_MODEL = /GPT|Claude|Gemini|Llama|Mistral|Qwen|DeepSeek|Kimi|GLM|MiniMax|Grok|Suno|Udio|Midjourney|ElevenLabs|Stable Diffusion|FLUX|DALL|Sora|Vicuna|Alpaca/i;

// 通用树最多 15 个节点，互斥对只有几组；直接枚举所有子集，找一组满足前置和互斥的最大集合。
// 主干节点按“每个节点都能在某一局里排到”全量计（安全优先 / 快速迭代各自都是一项能完成的策略）。
function maxGenericSet(tree) {
  const t = resolveTree(tree);
  const coreIds = new Set(CORE_TREES[t.core].nodes.map(n => n.id));
  const nodes = t.nodes.filter(n => !coreIds.has(n.id));
  const at = new Map(nodes.map((n, i) => [n.id, i]));
  let best = 0;
  for (let mask = 0; mask < 1 << nodes.length; mask++) {
    let ok = true, count = 0;
    for (let i = 0; i < nodes.length && ok; i++) {
      if (!(mask & (1 << i))) continue;
      count++;
      for (const id of nodes[i].excludes || []) if ((mask & (1 << at.get(id))) !== 0) { ok = false; break; }
      for (const group of nodes[i].prereq || []) {
        if (!group.some(id => (mask & (1 << at.get(id))) !== 0)) { ok = false; break; }
      }
    }
    if (ok && count > best) best = count;
  }
  return { core: CORE_TREES[t.core].nodes.length, generic: best };
}

describe('通用树（P3.1）', () => {
  it('四棵树都过校验器（含 A4.7 播种检查）；各 15 个本家节点，接对应主干，gs_base_open 解锁续训', () => {
    assert.deepEqual(validateAllTrees(), []);
    for (const mod of MODS) {
      const f = GENERIC_FILES[mod];
      assert.equal(f.tree.id, `_generic_${mod}`);
      assert.equal(f.tree.extends, CORE_OF[mod]);
      assert.equal(f.tree.nodes.length, 15, `${mod} 本家节点`);
      const t = resolveTree(f.tree);
      assert.equal(t.core, CORE_OF[mod]);
      assert.ok(t.byId.has('g_sota'), mod);
      if (mod === 'llm') assert.ok(t.byId.has('gs_base_open'), mod);
    }
    assert.deepEqual(resolveTree(GENERIC_FILES.llm.tree).byId.get('gs_base_open').grants, { unlock: ['adopt_open_base'] });
  });

  it('没有走不到的节点；通用节点不写年份、不带真实型号名，也不改开源 / 闭源路线', () => {
    for (const mod of MODS) {
      const t = resolveTree(GENERIC_FILES[mod].tree);
      assert.deepEqual(unreachableNodes(t.nodes), [], mod);
      const coreIds = new Set(CORE_TREES[t.core].nodes.map(n => n.id));
      for (const n of t.nodes) {
        if (coreIds.has(n.id)) continue; // 主干节点不在这条里查
        assert.ok(!n.stance && !n.license && !n.from, `${mod} ${n.id}：通用树不改路线`);
        assert.ok(!n.hist, `${mod} ${n.id}：通用节点不写史实`);
        assert.doesNotMatch(`${n.title} ${n.desc}`, /\b(19|20)\d{2}\b/, `${mod} ${n.id}：不写年份`);
        assert.doesNotMatch(`${n.title} ${n.desc}`, OWN_MODEL, `${mod} ${n.id}：不出现真实型号名`);
      }
    }
  });

  it('每棵树至少有互斥、多路前置和绕过；互斥两边都写', () => {
    for (const mod of MODS) {
      const t = resolveTree(GENERIC_FILES[mod].tree);
      const coreIds = new Set(CORE_TREES[t.core].nodes.map(n => n.id));
      const own = t.nodes.filter(n => !coreIds.has(n.id));
      assert.ok(own.some(n => n.excludes?.length), `${mod}：要有互斥`);
      assert.ok(own.some(n => n.bypass), `${mod}：要有绕过`);
      assert.ok(own.some(n => (n.prereq || []).some(g => g.length > 1)), `${mod}：要有多路前置`);
      for (const n of own) for (const id of n.excludes || []) assert.ok(t.byId.get(id)?.excludes?.includes(n.id), `${mod} ${n.id} ↔ ${id}`);
    }
  });

  it('y2023 每棵树能排出至少 22 个可完成节点（含主干），而且开局没有一上来就做不成的节点', () => {
    for (const mod of MODS) {
      const { core, generic } = maxGenericSet(GENERIC_FILES[mod].tree);
      assert.ok(core + generic >= 22, `${mod}：主干 ${core} + 通用 ${generic} = ${core + generic}`);
      // SAMPLE 里的公司已经有本家史实树（P3.T）；这里临时把本家文件摘掉，让它们退回通用树再测。
      const keep = COMPANY_FILES[SAMPLE[mod]];
      COMPANY_FILES[SAMPLE[mod]] = null;
      try {
        const s = E.createGame(SAMPLE[mod], 'y2023', 1);
        const t = resolvedTree(s);
        assert.equal(t.id, `_generic_${mod}`, `${SAMPLE[mod]} 用的是通用树`);
        assert.ok(s.strategy.cur, `${SAMPLE[mod]} 开局在进行一项策略`);
        for (const n of t.nodes) assert.notEqual(E.nodeStatus(s, n.id).state, 'blocked', `${mod} ${n.id} y2023 开局就做不成`);
      } finally {
        COMPANY_FILES[SAMPLE[mod]] = keep;
      }
    }
  });
});
