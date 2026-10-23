// 公司策略文件的登记表（规格 A2、A5）：24 家公司各一个文件，加四棵通用树。P0.3a 一次登记全；
// 各内容包（P3.D、P3.T-*、P3.1）只填自己的文件，不改这里（P2.2 可以在这里加解析和缓存）。
// 公司文件为 null（内容包完成前）时，退回这家公司模态的通用树：语言模型退回 _generic_llm，其余按模态。
import { COMPANY_BY_ID } from '../core.js';
import { CORE_TREES } from '../strategy_core.js';
import qwen from './qwen.js';
import deepseek from './deepseek.js';
import gemini from './gemini.js';
import claude from './claude.js';
import gpt from './gpt.js';
import kimi from './kimi.js';
import glm from './glm.js';
import grok from './grok.js';
import seed from './seed.js';
import rwkv from './rwkv.js';
import ernie from './ernie.js';
import mistral from './mistral.js';
import minimax from './minimax.js';
import perplexity from './perplexity.js';
import image2 from './image2.js';
import llama from './llama.js';
import hunyuan from './hunyuan.js';
import stepfun from './stepfun.js';
import novelai from './novelai.js';
import midjourney from './midjourney.js';
import suno from './suno.js';
import elevenlabs from './elevenlabs.js';
import fable from './fable.js';
import jev from './jev.js';
import genericLlm from './_generic_llm.js';
import genericImage from './_generic_image.js';
import genericMusic from './_generic_music.js';
import genericSpeech from './_generic_speech.js';

export const COMPANY_FILES = { qwen, deepseek, gemini, claude, gpt, kimi, glm, grok, seed, rwkv, ernie, mistral, minimax, perplexity, image2, llama, hunyuan, stepfun, novelai, midjourney, suno, elevenlabs, fable, jev };
export const GENERIC_FILES = { llm: genericLlm, image: genericImage, music: genericMusic, speech: genericSpeech };

// 这家公司实际用的文件：自己的；自己的还是 null 时，用模态的通用树。
export function companyFile(company) {
  const own = COMPANY_FILES[company];
  if (own) return own;
  return GENERIC_FILES[COMPANY_BY_ID[company]?.modality] ?? null;
}
// 这家公司的树（还没展开 extends 和 omit；展开见下面的 resolveTree，sim/strategy.js 的 resolvedTree 读它）。
export const treeFor = company => companyFile(company)?.tree ?? null;

// extends 能接的树：四棵主干（core_*）和四棵通用树（_generic_*）。
export function baseTree(id) {
  if (CORE_TREES[id]) return CORE_TREES[id];
  return Object.values(GENERIC_FILES).find(f => f?.tree?.id === id)?.tree ?? null;
}
// 展开一棵树：先展开 extends（通用树再接主干），去掉 omit 里的节点，再接上本家节点；分支名本家的盖过继承来的。
// → { id, core（最底下那棵主干的 id）, branches, nodes, byId } | null。按树对象缓存（内容包换了文件就是新对象）。
// 只展开，不校验（重名、写错的 id 由 _schema.js 的校验器报）；extends 写错或成环时按没有继承处理。
const RESOLVED = new WeakMap();
export function resolveTree(tree, seen = new Set()) {
  if (!tree || typeof tree !== 'object') return null;
  if (RESOLVED.has(tree)) return RESOLVED.get(tree);
  seen.add(tree);
  const parent = tree.extends ? baseTree(tree.extends) : null;
  const up = parent && !seen.has(parent) ? resolveTree(parent, seen) : null;
  const omit = new Set(tree.omit || []);
  const nodes = [...(up?.nodes || []).filter(n => !omit.has(n.id)), ...(tree.nodes || [])];
  const out = { id: tree.id, core: up?.core ?? (CORE_TREES[tree.id] === tree ? tree.id : null), branches: { ...(up?.branches || {}), ...(tree.branches || {}) }, nodes, byId: new Map(nodes.map(n => [n.id, n])) };
  RESOLVED.set(tree, out);
  return out;
}
