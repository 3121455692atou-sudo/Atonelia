// 历史型号的结构解析：开局继承、旧档迁移共用一套。总参数决定容量和量级，激活参数决定算力；
// 不能拿名字里最后一个“B”当总参数（Mixtral 8x7B 不是 7B，Qwen3-235B-A22B 每个 token 只算 22B）。
import { SCALES, weightClass } from './core.js';

// 非语言模型没有公开参数，按目录里的量级取预设规模。
const NON_LLM = { image: { small: 'i1', mid: 'i3', large: 'i12' }, music: { small: 'a1', mid: 'a3', large: 'a8' }, speech: { small: 's05', mid: 's15', large: 's4' } };
const KNOWN_SCALE = { 'GPT Image 1.5': 'i20', 'GPT Image 2': 'i20' };

// 公开过结构的型号：[总参数, 激活参数]，单位十亿，两个数相等就是稠密。没公开激活参数的按同代估算。
// 其余开源型号的公开值、“同家族沿用上一版结构”留给 P1.1 补。
export const KNOWN_STRUCTURE = {
  'Mixtral 8x7B': [46.7, 12.9], // 8 个专家共享注意力层，不是 8×7
  'Phi-2': [2.7, 2.7], 'Phi-3-medium': [14, 14], 'Phi-4': [14, 14], 'Phi-4-reasoning': [14, 14],
  'Command R+': [104, 104], 'Mistral Large 2': [123, 123],
  'DeepSeek-V2': [236, 21], 'DeepSeek-V2.5': [236, 21], 'DeepSeek-V2-Lite': [15.7, 2.4],
  'Hunyuan-Large': [389, 52], 'MiniMax-Text-01': [456, 45.9], 'MiniMax-M1': [456, 45.9], 'Kimi K2': [1000, 32], 'GLM-4.5': [355, 32],
  'gpt-oss-120b': [116.8, 5.1], // 对手表还没有这一行（规格 D3 新增），先登记，免得被读成 120B 稠密
  'DeepSeek-V3.2': [671, 37], 'DeepSeek-V4-Pro（预览）': [1600, 49], 'DeepSeek-V4-Flash（预览）': [284, 13],
  'Kimi K2 Thinking': [1000, 32], 'Kimi K2.5': [1000, 32], 'Kimi K2.6': [1000, 32],
  'GLM-4.6': [355, 32], 'GLM-4.7': [355, 32], 'GLM-5': [744, 40],
  'MiniMax-M2': [230, 10], 'MiniMax-M2.1': [230, 10], 'MiniMax-M2.5': [230, 10],
  'Mistral Large 3': [675, 41], 'Step 3': [321, 38], 'Step 3.5 Flash': [196, 11], 'Llama 4 Maverick': [400, 17],
  'Qwen3-Max': [1000, 50], 'Hunyuan-T1': [560, 56], '文心 5.0': [2400, 72],
  'Xialong': [355, 32], // NovelAI 在 GLM-4.6 上的微调
  // P1.1 数据提交补的对手结构（D3 第二批、已知缺口第 7 条）。出处是模型卡和 docs/research/timeline-2023-2026.json 的 params 栏；标“待核实”的是暂定值。
  'Grok-1（开放权重）': [314, 78.5], // 314B MoE，8 个专家选 2，约 25% 权重激活
  'DeepSeek-V3': [671, 37], 'DeepSeek-R1': [671, 37], 'DeepSeek-V3-0324': [671, 37], 'DeepSeek-R1-0528': [671, 37], 'DeepSeek-V3.1': [671, 37],
  'DeepSeek-V4-Pro-0813': [1600, 49], // 待核实：暂按预览版的 1.6T/49B
  'DeepSeek-V4-Flash-0731': [284, 13],
  'DeepSeek-V4.1-Flash': [552, 16], 'DeepSeek-V4.1-Flash-1017': [552, 16], // 骨干 552B、解码激活 16B；算 n_min 时要用含 Engram 的 763B（P1.2 另取），待核实
  'Command A': [111, 111], 'Command A Reasoning': [111, 111], 'Command A+': [218, 25],
  'Phi-3.5-MoE': [42, 6.6],
  'MiniMax-M2.7': [229, 10], 'MiniMax-M3': [428, 23],
  'GLM-5.1': [754, 40], 'GLM-5.2': [753, 40], 'GLM-5.3': [753, 40], // GLM-5.3 激活参数卡上没写，待核实：暂按 GLM-5 的 40B
  'Hy3-preview': [295, 21], 'Hy3': [295, 21], 'Hy4-preview': [770, 49],
  'Mistral Medium 3.5': [128, 128],
  'Step 3.7 Flash': [198, 11], 'Step 5 Preview': [600, 27],
  'Kimi K3': [2800, 104],
  'Muse Spark Open': [816, 42],
  'Qwen3.8-2.4T-A95B': [2400, 95], // 名字里的 2.4T-A95B 读不出来，必须登记
};

// 返回 { total, active, arch, cls, scaleId, source }。source：catalog 查表、model-name 读型号名、game-estimate 按量级估。
// 语言模型量级（2026-10-21 决定第 3 项）：≤15B 小、≤100B 中、>100B 大；参数不公开的闭源旗舰单列“前沿”，不按估算参数并进“大”。
export function structureForRelease(mod, rel) {
  if (!rel) return null;
  if (mod !== 'llm') {
    const id = KNOWN_SCALE[rel.name] || NON_LLM[mod]?.[rel.cls] || NON_LLM[mod]?.mid;
    const scale = SCALES[mod]?.find(x => x.id === id) || SCALES[mod]?.[0];
    if (!scale) return null;
    return { total: scale.total, active: scale.active, arch: scale.moe ? 'moe' : 'dense', cls: scale.cls, scaleId: scale.id, source: KNOWN_SCALE[rel.name] ? 'catalog' : 'game-estimate' };
  }
  const frontier = !rel.open && rel.cls === 'frontier';
  const rnn = rel.family === 'rwkv';
  const llm = (total, active, arch, source) => ({ total, active, arch, cls: frontier ? 'frontier' : weightClass(total), scaleId: null, source });
  const name = String(rel.name);
  const known = KNOWN_STRUCTURE[name];
  if (known) return llm(known[0], known[1], known[0] === known[1] ? (rnn ? 'rnn' : 'dense') : 'moe', 'catalog');
  const moe = name.match(/(\d+(?:\.\d+)?)B-A(\d+(?:\.\d+)?)B/i);
  if (moe) return llm(Number(moe[1]), Math.min(Number(moe[1]), Number(moe[2])), 'moe', 'model-name');
  // 没登记的“N×专家”名：每个 token 按 2 个专家估算，总参数按专家数乘（略偏大）。
  const experts = name.match(/(\d+)x(\d+(?:\.\d+)?)B/i);
  if (experts) { const n = Number(experts[1]), size = Number(experts[2]); return llm(n * size, Math.min(n, 2) * size, 'moe', 'game-estimate'); }
  const dense = name.match(/(\d+(?:\.\d+)?)B\b/i);
  if (dense) return llm(Number(dense[1]), Number(dense[1]), rnn ? 'rnn' : 'dense', 'model-name');
  if (rel.cls === 'frontier') return rel.date < '2024-01' ? llm(600, 60, 'moe', 'game-estimate') : llm(1600, 100, 'moe', 'game-estimate');
  if (rel.cls === 'large') return rel.date >= '2024-05' ? llm(671, 37, 'moe', 'game-estimate') : llm(236, 236, 'dense', 'game-estimate');
  if (rel.cls === 'mid') return llm(70, 70, 'dense', 'game-estimate');
  return llm(7, 7, rnn ? 'rnn' : 'dense', 'game-estimate');
}
