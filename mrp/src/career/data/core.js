// 核心设定：时间、模态、规模、硬件、技术、产品、公司。数值为游戏模拟，按真实量级校准。
import { CHARACTER_ROSTER } from './roster.js';
import { CLASS_EDGES } from './balance.js';

// 存档结构版本（规格 E8）。v4（P0.3b）：done 拆成 seen 和 marks、计时器改存到期日、董事会目标的队列项叫 board。
export const VERSION = 4;
export const END = '2026-10';

// ---------- 时间 ----------
export const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return ym(Math.floor(t / 12), (t % 12) + 1);
}
export function monthsBetween(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}
export const fmtDate = key => { const [y, m] = key.split('-').map(Number); return `${y} 年 ${m} 月`; };
export const yearOf = key => Number(key.slice(0, 4));

export const SCENARIOS = [
  { id: 'y2023', start: '2023-01', title: '2023 · 百模大战', short: '从零开始',
    desc: 'ChatGPT 上线刚两个月，市面上只有网页聊天和刚起步的 API。大多数团队还没有自己的模型，第一步是找数据、立项预训练。' },
  { id: 'y2024', start: '2024-01', title: '2024 · 长上下文与价格战', short: '已有上一代模型',
    desc: '各家都已有模型在线。MoE、长上下文和降价是这一年的关键词，下半年推理模型出现。' },
  { id: 'y2025', start: '2025-01', title: '2025 · 推理与 Agent', short: '冲刺赛段',
    desc: '推理模型成为标配，编程 Agent 和 Coding Plan 在年中出现，年末 Agent 真正普及。节奏最快的剧本。' },
  { id: 'y2026', start: '2026-01', title: '2026 · Agent 与上市潮', short: '最短赛段',
    desc: '编程 Agent 已经普及，国内 Coding Plan 卖到限购；智谱、MiniMax 在港股挂牌，带起一波上市潮；H200 二月起可以卖到中国，但要多付 25%；年中接连出现 Agent 越权闯祸的安全事故。只有 10 个月，比的是把手上的模型卖好、把公司做大。' },
];

// ---------- 模态与能力 ----------
export const MODALITIES = {
  llm: {
    label: '语言模型',
    dims: [
      { key: 'knowledge', label: '知识', desc: '事实与学科知识（MMLU、GPQA 等）' },
      { key: 'code', label: '代码', desc: '写代码、改 Bug（HumanEval、SWE-bench 等）' },
      { key: 'math', label: '数学推理', desc: '数学与多步推理（GSM8K、AIME 等）' },
      { key: 'writing', label: '写作对话', desc: '对话体验与写作质量（Arena、MT-Bench 等）' },
      { key: 'safety', label: '安全对齐', desc: '拒绝有害请求、抗越狱（HarmBench 等）' },
      { key: 'agent', label: 'Agent', desc: '调用工具、完成多步任务（τ-bench、Terminal-Bench 等）', needTech: 'func_call' },
    ],
  },
  image: {
    label: '图像生成',
    dims: [
      { key: 'aesthetics', label: '美学', desc: '构图、光影、风格完成度' },
      { key: 'adherence', label: '指令遵循', desc: '是否按提示词画对物体、数量、位置' },
      { key: 'text', label: '文字渲染', desc: '图中文字是否清晰正确' },
      { key: 'realism', label: '写实一致', desc: '人体结构、材质、多图一致性' },
      { key: 'safety', label: '内容安全', desc: '拦截深度伪造、侵权与不当内容' },
    ],
  },
  music: {
    label: '音乐生成',
    dims: [
      { key: 'composition', label: '编曲旋律', desc: '歌曲结构、和声与旋律' },
      { key: 'vocals', label: '人声', desc: '演唱自然度与咬字' },
      { key: 'lyrics', label: '歌词', desc: '歌词质量与和曲子的对齐' },
      { key: 'fidelity', label: '音质', desc: '采样率、底噪与混音' },
      { key: 'safety', label: '版权合规', desc: '避免复刻受版权保护的旋律与声线' },
    ],
  },
  speech: {
    label: '语音合成',
    dims: [
      { key: 'naturalness', label: '自然度', desc: '韵律、停顿与音色质量（MOS）' },
      { key: 'cloning', label: '音色克隆', desc: '几秒样本复刻声音的相似度' },
      { key: 'multilingual', label: '多语言', desc: '语种数量与发音准确度（WER）' },
      { key: 'expressive', label: '情感表现', desc: '语气、情绪与表演力' },
      { key: 'safety', label: '防伪安全', desc: '声音水印、冒用检测与授权校验' },
    ],
  },
};
export const dimsOf = modality => MODALITIES[modality].dims;
// 每种模态的维度键：computeCaps 之类一天要调几万次，算一次冻结起来复用（调用方都只读）。
const DIM_KEYS = {};
export const dimKeys = modality => DIM_KEYS[modality] || (DIM_KEYS[modality] = Object.freeze(MODALITIES[modality].dims.map(d => d.key)));
export const dimLabel = (modality, key) => MODALITIES[modality].dims.find(d => d.key === key)?.label || key;

// 后训练方向：每月训练时从中选一个。data 为需要的后训练数据类别。
export const DIRECTIONS = {
  llm: [
    { key: 'writing', label: '对话与写作', method: 'SFT + 偏好优化', main: 'writing', side: { knowledge: 0.25 }, data: 'chat', rl: false },
    { key: 'knowledge', label: '知识增强', method: '继续预训练 + 检索数据', main: 'knowledge', side: { writing: 0.15 }, data: 'knowledge', rl: false },
    { key: 'code', label: '代码', method: 'RL（单元测试奖励）', main: 'code', side: { agent: 0.3, math: 0.15 }, data: 'code', rl: true },
    { key: 'math', label: '数学推理', method: 'RL（可验证答案奖励）', main: 'math', side: { code: 0.2 }, data: 'math', rl: true },
    { key: 'safety', label: '安全对齐', method: '红队数据 + 偏好优化', main: 'safety', side: { writing: -0.08 }, data: 'safety', rl: false },
    { key: 'agent', label: 'Agent', method: 'RL（工具调用与多步环境）', main: 'agent', side: { code: 0.25 }, data: 'agent', rl: true, needTech: 'func_call' },
    { key: 'benchmax', label: '针对榜单训练', method: '用和评测题相近的数据专项训练', main: null, side: {}, data: null, special: true },
  ],
  image: [
    { key: 'aesthetics', label: '美学', method: '美学偏好微调', main: 'aesthetics', side: { realism: 0.2 }, data: 'aesthetic' },
    { key: 'adherence', label: '指令遵循', method: '重写描述 + 对齐训练', main: 'adherence', side: { text: 0.15 }, data: 'caption' },
    { key: 'text', label: '文字渲染', method: '合成文字数据专项', main: 'text', side: { adherence: 0.15 }, data: 'text' },
    { key: 'realism', label: '写实一致', method: '高分辨率与一致性训练', main: 'realism', side: { aesthetics: 0.15 }, data: 'photo' },
    { key: 'safety', label: '内容安全', method: '安全过滤 + 水印', main: 'safety', side: { aesthetics: -0.05 }, data: 'safety' },
  ],
  music: [
    { key: 'composition', label: '编曲旋律', method: '结构与和声训练', main: 'composition', side: { fidelity: 0.15 }, data: 'catalog' },
    { key: 'vocals', label: '人声', method: '演唱数据微调', main: 'vocals', side: { lyrics: 0.15 }, data: 'vocal' },
    { key: 'lyrics', label: '歌词', method: '歌词—旋律对齐', main: 'lyrics', side: { vocals: 0.15 }, data: 'lyrics' },
    { key: 'fidelity', label: '音质', method: '音频编解码器升级', main: 'fidelity', side: { composition: 0.1 }, data: 'catalog' },
    { key: 'safety', label: '版权合规', method: '旋律指纹与声线过滤', main: 'safety', side: {}, data: 'safety' },
  ],
  speech: [
    { key: 'naturalness', label: '自然度', method: '韵律与声学模型训练', main: 'naturalness', side: { expressive: 0.2 }, data: 'studio' },
    { key: 'cloning', label: '音色克隆', method: '零样本克隆训练', main: 'cloning', side: { naturalness: 0.1 }, data: 'speakers' },
    { key: 'multilingual', label: '多语言', method: '多语种数据扩展', main: 'multilingual', side: {}, data: 'multilingual' },
    { key: 'expressive', label: '情感表现', method: '表演录音与情绪标签', main: 'expressive', side: { naturalness: 0.15 }, data: 'acting' },
    { key: 'safety', label: '防伪安全', method: '声音水印与冒用检测', main: 'safety', side: {}, data: 'safety' },
  ],
};

// ---------- 规模 ----------
// total/active 单位为十亿参数；pretrainH100 为非语言模态的预训练算力需求（H100·月）。
export const SCALES = {
  llm: [
    { id: 'd1', label: '1.5B 稠密', total: 1.5, active: 1.5, from: '2022-01', cls: 'small' },
    { id: 'd7', label: '7B 稠密', total: 7, active: 7, from: '2022-01', cls: 'small' },
    { id: 'd14', label: '14B 稠密', total: 14, active: 14, from: '2022-01', cls: 'small' },
    { id: 'd32', label: '32B 稠密', total: 32, active: 32, from: '2022-01', cls: 'mid' },
    { id: 'd70', label: '70B 稠密', total: 70, active: 70, from: '2022-01', cls: 'mid' },
    { id: 'm30', label: 'MoE 30B（激活 3B）', total: 30, active: 3, from: '2023-12', cls: 'mid', moe: true },
    { id: 'm230', label: 'MoE 236B（激活 21B）', total: 236, active: 21, from: '2023-12', cls: 'large', moe: true },
    { id: 'd400', label: '405B 稠密', total: 405, active: 405, from: '2023-06', cls: 'large', tiers: ['frontier', 'bigtech'] },
    { id: 'm670', label: 'MoE 671B（激活 37B）', total: 671, active: 37, from: '2023-12', cls: 'large', moe: true, flagship: true },
    { id: 'm1t', label: 'MoE 1T（激活 32B）', total: 1000, active: 32, from: '2024-06', cls: 'large', moe: true, flagship: true },
    { id: 'f2t', label: '前沿 MoE 约 2T（激活约 200B）', total: 2000, active: 200, from: '2022-06', cls: 'frontier', moe: true, flagship: true, tiers: ['frontier'] },
  ],
  image: [
    { id: 'i1', label: '1B 扩散模型', total: 1, active: 1, pretrainH100: 30, base: 52, cls: 'small' },
    { id: 'i3', label: '3.5B 扩散模型', total: 3.5, active: 3.5, pretrainH100: 110, base: 62, cls: 'mid' },
    { id: 'i8', label: '8B DiT', total: 8, active: 8, pretrainH100: 350, base: 70, cls: 'mid', from: '2023-03' },
    { id: 'i12', label: '12B DiT（Flow）', total: 12, active: 12, pretrainH100: 650, base: 75, cls: 'large', from: '2024-03', flagship: true },
    { id: 'i20', label: '自回归多模态图像', total: 20, active: 20, pretrainH100: 380, base: 80, cls: 'large', from: '2025-03', flagship: true, tiers: ['frontier', 'bigtech'] },
  ],
  music: [
    { id: 'a1', label: '1B 音频模型', total: 1, active: 1, pretrainH100: 40, base: 48, cls: 'small' },
    { id: 'a3', label: '3B 音频模型', total: 3, active: 3, pretrainH100: 120, base: 60, cls: 'mid' },
    { id: 'a8', label: '8B 音频模型', total: 8, active: 8, pretrainH100: 1500, base: 70, cls: 'large', from: '2024-01', flagship: true },
  ],
  speech: [
    { id: 's05', label: '0.5B 语音模型', total: 0.5, active: 0.5, pretrainH100: 15, base: 55, cls: 'small' },
    { id: 's15', label: '1.5B 语音模型', total: 1.5, active: 1.5, pretrainH100: 50, base: 64, cls: 'mid' },
    { id: 's4', label: '4B 语音模型', total: 4, active: 4, pretrainH100: 180, base: 72, cls: 'large', from: '2024-01', flagship: true },
  ],
};
export const WEIGHT_CLASSES = { small: '轻量（≤15B）', mid: '中型（15–100B）', large: '大型（>100B）', frontier: '前沿（未公开）' };

// ---------- 硬件 ----------
// flops：每卡每月的有效训练算力（约 40% MFU）；infer：推理吞吐，相对 H100。rent 为每卡每月租金（美元）。
export const GPUS = {
  A100: { label: 'A100', from: '2020-06', flops: 3.2e20, infer: 0.45, price: 15000, rent: 1100, cnBan: '2022-10', photo: 'a100', photoNote: '图为外形相同的 H100 PCIe 卡' },
  A800: { label: 'A800（中国特供）', from: '2022-11', to: '2023-10', cnOnly: true, flops: 3.0e20, infer: 0.42, price: 17000, rent: 1200, photo: 'a100', photoNote: '图为外形相同的 H100 PCIe 卡' },
  H100: { label: 'H100', from: '2023-03', flops: 1.0e21, infer: 1, price: 30000, rent: 1800, cnBan: '2022-10', photo: 'h100' },
  H800: { label: 'H800（中国特供）', from: '2023-03', to: '2023-10', cnOnly: true, flops: 9.2e20, infer: 0.95, price: 32000, rent: 1900, photo: 'h100', photoNote: 'H800 是 H100 的中国特供版，外形相同' },
  H20: { label: 'H20（中国特供）', from: '2024-02', cnOnly: true, flops: 1.5e20, infer: 0.6, price: 13000, rent: 900, gaps: [['2025-04', '2025-07']], photo: 'h100_quad', photoNote: 'H20 是 Hopper 架构的中国特供版，图为 H100' },
  Ascend910B: { label: '昇腾 910B', from: '2023-10', cnOnly: true, flops: 5.5e20, infer: 0.5, price: 16000, rent: 1000, npc: 'ascend', photo: 'ascend910b', photoNote: '图为昇腾 384 超节点（WAIC 2025）' },
  H200: { label: 'H200', from: '2024-08', flops: 1.0e21, infer: 1.35, price: 34000, rent: 2100, cnBan: '2022-10', cnReopen: '2026-02', cnMarkup: 1.25, photo: 'h200', photoNote: '图为同为 Hopper 架构、外形相同的 H100' },
  B200: { label: 'B200', from: '2025-01', flops: 2.4e21, infer: 2.2, price: 45000, rent: 3500, cnBan: '2025-01', photo: 'b200' },
  Ascend910C: { label: '昇腾 910C', from: '2025-05', cnOnly: true, flops: 8.0e20, infer: 0.8, price: 21000, rent: 1350, npc: 'ascend', photo: 'ascend910b', photoNote: '图为基于 910C 的昇腾 384 超节点（WAIC 2025）' },
  B300: { label: 'B300', from: '2025-09', flops: 3.6e21, infer: 3.2, price: 55000, rent: 4300, cnBan: '2025-09', photo: 'gb200', photoNote: '图为 Blackwell 的 GB200 计算托盘' },
  Ascend950: { label: '昇腾 950PR', from: '2026-03', cnOnly: true, flops: 1.4e21, infer: 1.3, price: 28000, rent: 1800, npc: 'ascend', photo: 'ascend910b', photoNote: '图为上一代昇腾 384 超节点（WAIC 2025）' },
  Rubin: { label: 'Vera Rubin', from: '2026-06', flops: 7.5e21, infer: 7.5, price: 85000, rent: 6800, cnBan: '2026-06', photo: 'rubin', photoNote: '图为 GB200 NVL72 整柜，Vera Rubin 沿用同类整柜设计' },
};
// 灰色渠道：被禁运的卡经第三地转运流入国内。只对中国公司开放，而且只在官方渠道买不到的时候。
// 2025 年起美国多次起诉英伟达芯片走私，转运的 H100、B200 整机报价普遍比官方价高出一倍上下。
// mult：相对官方价的倍数；monthly：每月最多能拿到的张数（中间商手里就这么多货）。
export const SMUGGLE = {
  A100: { from: '2022-11', to: '2024-12', mult: 1.6, monthly: 512 },
  H100: { from: '2023-06', mult: 1.9, monthly: 512 },
  H200: { from: '2024-10', mult: 2.1, monthly: 256 },
  B200: { from: '2025-03', mult: 2.5, monthly: 256 },
  B300: { from: '2025-12', mult: 2.8, monthly: 128 },
};
// 租金随年份下降。
// 租卡价格的年份系数在 balance.js（P4.2 只调那一份）；这里转出给界面和老代码读。
export { RENT_FACTOR } from './balance.js';
export function gpuAvailable(id, date, country) {
  // 只认 GPUS 自己的键，原型上的 'toString' 之类不算一款卡。
  const g = Object.hasOwn(GPUS, id) ? GPUS[id] : null;
  if (!g || date < g.from || (g.to && date > g.to)) return false;
  if (g.cnOnly && country !== 'CN') return false;
  if (country === 'CN' && g.cnBan && date >= g.cnBan && !(g.cnReopen && date >= g.cnReopen)) return false;
  if (country === 'CN' && g.gaps?.some(([a, b]) => date >= a && date < b)) return false;
  return true;
}

// 解禁后的附加成本（如 H200 对华出口的 25% 关税分成）。
export function gpuMarkup(id, date, country) {
  const g = GPUS[id];
  return country === 'CN' && g?.cnReopen && date >= g.cnReopen ? g.cnMarkup || 1 : 1;
}
// 海外子公司只能租、不能买，而且贵 40%。
export function gpuRentable(id, date, country, overseas) {
  const g = GPUS[id];
  return gpuAvailable(id, date, country) || (!!overseas && country === 'CN' && g && !g.cnOnly && date >= g.from && !(g.to && date > g.to));
}

// ---------- 技术 ----------
// from：业界公开的时间；之后才能研究。cost：研究要花的技术积累。effects 见引擎 applyTech。
export const TECHS = [
  { id: 'rlhf', mod: 'llm', name: '指令微调与 RLHF', from: '2022-03', cost: 0, start: true, desc: 'InstructGPT 的做法：先监督微调，再用人类偏好训练奖励模型。', effects: { cap: { writing: 4, safety: 6 } } },
  { id: 'distill', mod: 'llm', name: '蒸馏与量化部署', from: '2023-03', cost: 12, desc: '用大模型的输出训练小模型，或把权重量化到 8/4 bit。高峰期可以把流量分给量化版。', effects: { infer: 1.15, unlock: ['route_quant'] } },
  { id: 'dpo', mod: 'llm', name: 'DPO 偏好优化', from: '2023-05', cost: 18, desc: '不训练奖励模型，直接用偏好对优化策略，便宜稳定。', effects: { post: { writing: 1.15, safety: 1.15 } } },
  { id: 'func_call', mod: 'llm', name: '函数调用', from: '2023-06', cost: 15, desc: '模型输出结构化的工具调用参数。是后来所有 Agent 的基础。', effects: { cap: { agent: 8 }, demand: { api: 1.05 } } },
  { id: 'long_ctx', mod: 'llm', name: '长上下文扩展', from: '2023-06', cost: 15, desc: '调整位置编码外推，把上下文从 4K 拉到 100K 以上。', effects: { cap: { knowledge: 2 }, demand: { chat: 1.04, api: 1.04 } } },
  { id: 'textbook', mod: 'llm', name: '教科书式合成数据', from: '2023-06', cost: 20, desc: 'Phi 系列的思路：用高质量合成教材训练，小模型也能有不错的推理。', effects: { dataQuality: 1.12, unlock: ['ds_synth_self'] } },
  { id: 'flash_attn', mod: 'llm', name: 'FlashAttention-2 / GQA', from: '2023-07', cost: 15, desc: '更省显存的注意力实现和分组查询注意力，训练和推理都更快。', effects: { train: 1.12, infer: 1.25 } },
  { id: 'spec_decode', mod: 'llm', name: '投机解码', from: '2023-09', cost: 15, desc: '小模型先猜、大模型验证，输出速度提升而结果不变。', effects: { infer: 1.25 } },
  { id: 'moe', mod: 'llm', name: 'MoE 稀疏专家', from: '2023-12', cost: 30, desc: 'Mixtral 带火的路线：总参数很大，每个 token 只激活少数专家。', effects: { unlock: ['scale_moe'] } },
  { id: 'grpo', mod: 'llm', name: 'GRPO', from: '2024-02', cost: 20, desc: 'DeepSeekMath 提出的强化学习算法，去掉价值模型，省显存。', effects: { post: { code: 1.12, math: 1.15 } } },
  { id: 'mla', mod: 'llm', name: 'MLA 注意力', from: '2024-05', cost: 30, desc: 'DeepSeek-V2 提出的多头潜在注意力，大幅压缩 KV 缓存，推理成本骤降。', effects: { infer: 1.8 } },
  { id: 'reasoning', mod: 'llm', name: '长思维链推理 RL', from: '2024-09', cost: 60, cheapFrom: '2025-01', cheapCost: 25, desc: 'o1 开启的路线：先长时间思考再作答。2025 年 1 月 R1 公开配方后成本大降。', effects: { cap: { math: 16, code: 8, knowledge: 2 }, unlock: ['bench_reasoning'] } },
  { id: 'computer_use', mod: 'llm', name: '电脑操作（GUI Agent）', from: '2024-10', cost: 30, desc: '看屏幕、点鼠标、敲键盘，在真实软件里完成任务。', effects: { cap: { agent: 8 } } },
  { id: 'mcp', mod: 'llm', name: 'MCP 工具协议', from: '2024-11', cost: 10, desc: '统一的工具接入协议，第三方应用接入变容易。', effects: { cap: { agent: 3 }, demand: { coding_plan: 1.1, api: 1.03 } } },
  { id: 'fp8', mod: 'llm', name: 'FP8 混合精度训练', from: '2024-12', cost: 30, desc: 'DeepSeek-V3 大规模验证的 FP8 训练，同样的卡训得更快。', effects: { train: 1.35 } },
  { id: 'mtp', mod: 'llm', name: '多 token 预测', from: '2024-12', cost: 20, desc: '一次预测多个 token，训练信号更密，推理时还能配合投机解码。', effects: { train: 1.08, infer: 1.15 } },
  { id: 'linear_attn', mod: 'llm', name: '混合 / 线性注意力', from: '2025-01', cost: 28, desc: 'Lightning Attention、RWKV 一类的线性复杂度方案，长文本推理便宜。', effects: { infer: 1.25, cap: { knowledge: 1 } } },
  { id: 'agentic_rl', mod: 'llm', name: 'Agent 强化学习', from: '2025-02', cost: 45, desc: '在代码仓库、终端、浏览器等真实环境里做多步 RL。', effects: { cap: { agent: 15, code: 4 } } },
  { id: 'const_cls', mod: 'llm', name: '宪法分类器', from: '2025-02', cost: 28, desc: '在输入输出两端加安全分类器，越狱成功率显著下降，代价是少量误拦。', effects: { cap: { safety: 6 }, legal: 0.7 } },
  { id: 'muon', mod: 'llm', name: 'Muon 优化器', from: '2025-07', cost: 22, desc: 'Kimi K2 用 MuonClip 在万亿参数上稳定训练，同样的 token 学得更多，也更不容易炼炸。', effects: { train: 1.1, stability: 0.8 } },
  { id: 'sparse_attn', mod: 'llm', name: '稀疏注意力', from: '2025-09', cost: 26, desc: 'DeepSeek-V3.2 的 DSA：每个 token 只看挑出来的一部分上下文，长文本推理成本大降。', effects: { infer: 1.35, demand: { api: 1.03 } } },
  { id: 'skills', mod: 'llm', name: 'Agent Skills', from: '2025-10', cost: 12, desc: '把指令、脚本和资料打包成文件夹，模型按需加载。编程工具和办公 Agent 都在用。', effects: { cap: { agent: 4 }, demand: { coding_plan: 1.08 } } },
  { id: 'engram', mod: 'llm', name: '条件记忆（Engram）', from: '2026-01', cost: 35, desc: '把一部分知识放进可查表的记忆参数，不占激活计算。总参数更大，推理不变贵。', effects: { cap: { knowledge: 3 }, infer: 1.05 } },
  { id: 'cot_monitor', mod: 'llm', name: '思维链监控', from: '2026-08', cost: 24, desc: '实时检查 Agent 的思考过程，发现越权行为就叫停。2026 年几起 Agent 失控事故后成为头部公司的标配。', effects: { cap: { safety: 5 }, legal: 0.85 } },
  // 图像
  { id: 'img_base', mod: 'image', name: '潜空间扩散', from: '2021-12', cost: 0, start: true, desc: 'Stable Diffusion 的基础做法。', effects: {} },
  { id: 'aesthetic_rl', mod: 'image', name: '美学偏好微调', from: '2023-03', cost: 15, desc: '用人类打分训练美学奖励，再微调生成器。', effects: { cap: { aesthetics: 5 } } },
  { id: 'dit', mod: 'image', name: 'DiT 架构', from: '2023-03', cost: 20, desc: '用 Transformer 替换 U-Net，规模扩展更顺。', effects: { unlock: ['scale_dit'], cap: { realism: 3 } } },
  { id: 'recaption', mod: 'image', name: '重写图片描述', from: '2023-10', cost: 18, desc: 'DALL·E 3 的做法：用模型重写训练图的描述，指令遵循大幅提升。', effects: { cap: { adherence: 8 } } },
  { id: 'flow', mod: 'image', name: 'Flow Matching / MMDiT', from: '2024-03', cost: 25, desc: 'SD3 与 FLUX 的路线，文字渲染和细节更好。', effects: { cap: { text: 10, realism: 3 } } },
  { id: 'c2pa', mod: 'image', name: '内容凭证与水印', from: '2024-02', cost: 12, desc: '给生成图加 C2PA 凭证和隐形水印，降低深度伪造风险。', effects: { cap: { safety: 8 }, legal: 0.75 } },
  { id: 'ar_image', mod: 'image', name: '原生多模态图像生成', from: '2025-03', cost: 50, desc: '语言模型直接生成图像，多轮修改和文字渲染大幅提升。', effects: { cap: { text: 12, adherence: 8 }, unlock: ['scale_ar'] } },
  { id: 'img_edit', mod: 'image', name: '对话式改图', from: '2025-08', cost: 26, desc: 'Nano Banana 一类的做法：上传照片用一句话改，人物和场景保持一致。', effects: { cap: { realism: 5, adherence: 4 }, demand: { subscription: 1.08 } } },
  // 音乐
  { id: 'mus_base', mod: 'music', name: '音频 token 化', from: '2022-10', cost: 0, start: true, desc: '把音频压成离散 token 再建模。', effects: {} },
  { id: 'codec', mod: 'music', name: '高保真音频编解码', from: '2023-06', cost: 18, desc: '更好的神经编解码器，音质明显提升。', effects: { cap: { fidelity: 8 } } },
  { id: 'lyric_align', mod: 'music', name: '歌词对齐', from: '2024-03', cost: 20, desc: '把歌词与音符时间对齐训练，咬字和断句更自然。', effects: { cap: { lyrics: 8, vocals: 3 } } },
  { id: 'audio_fp', mod: 'music', name: '旋律指纹过滤', from: '2024-06', cost: 15, desc: '生成后比对已知作品指纹，降低版权诉讼风险。', effects: { cap: { safety: 10 }, legal: 0.7 } },
  { id: 'stems', mod: 'music', name: '分轨与编辑', from: '2025-05', cost: 25, desc: '生成可单独编辑的人声与伴奏分轨。', effects: { cap: { composition: 5 }, demand: { subscription: 1.08 } } },
  { id: 'licensed', mod: 'music', name: '唱片公司授权训练', from: '2025-11', cost: 30, desc: '环球、华纳和 AI 音乐公司和解后的新模式：用授权曲库重训模型，按播放分成。', effects: { cap: { safety: 14 }, legal: 0.5 } },
  // 语音
  { id: 'tts_base', mod: 'speech', name: '神经语音合成', from: '2018-01', cost: 0, start: true, desc: '端到端声学模型加声码器。', effects: {} },
  { id: 'zero_shot', mod: 'speech', name: '零样本音色克隆', from: '2023-01', cost: 18, desc: 'VALL-E 一类做法：几秒样本复刻声音。', effects: { cap: { cloning: 10 } } },
  { id: 'flow_tts', mod: 'speech', name: 'Flow 语音合成', from: '2024-06', cost: 22, desc: 'CosyVoice、F5-TTS 一类的流匹配模型，自然度更高。', effects: { cap: { naturalness: 6 } } },
  { id: 'voice_wm', mod: 'speech', name: '声音水印与冒用检测', from: '2024-02', cost: 15, desc: '给合成语音加水印，克隆名人声音需要授权校验。', effects: { cap: { safety: 12 }, legal: 0.6 } },
  { id: 'audio_tags', mod: 'speech', name: '音频标签控制', from: '2025-06', cost: 22, desc: '用 [whispers] [sighs] 之类的标签控制语气。', effects: { cap: { expressive: 10 } } },
  { id: 's2s', mod: 'speech', name: '端到端实时语音', from: '2025-08', cost: 30, desc: '不经过文字中转，直接听、直接说，打断和语气都更自然。', effects: { cap: { expressive: 6, naturalness: 3 }, demand: { api: 1.08 } } },
];
export const TECH_BY_ID = Object.fromEntries(TECHS.map(t => [t.id, t]));

// ---------- 产品 ----------
export const PRODUCTS = {
  llm: [
    { id: 'chat', label: '对话产品（网页 / App）', kind: 'toc', from: '2022-11', desc: '免费 + 会员订阅。中国公司面向公众上线前需要完成备案。' },
    { id: 'api', label: 'API', kind: 'tob', from: '2022-11', desc: '按 token 计费。' },
    { id: 'coding_plan', label: 'Coding Plan', kind: 'toc', from: '2025-07', need: { code: 70, agent: 55 }, desc: '给编程工具用的包月额度。' },
    { id: 'gpu_lease', label: '算力出租', kind: 'tob', from: '2022-01', desc: '把闲置 GPU 按月租给企业。' },
  ],
  image: [
    { id: 'subscription', label: '会员订阅', kind: 'toc', from: '2022-01' },
    { id: 'api', label: 'API', kind: 'tob', from: '2022-01' },
    { id: 'gpu_lease', label: '算力出租', kind: 'tob', from: '2022-01' },
  ],
  music: [
    { id: 'subscription', label: '会员订阅', kind: 'toc', from: '2022-01' },
    { id: 'api', label: 'API', kind: 'tob', from: '2024-06' },
    { id: 'gpu_lease', label: '算力出租', kind: 'tob', from: '2022-01' },
  ],
  speech: [
    { id: 'subscription', label: '创作者订阅', kind: 'toc', from: '2022-01' },
    { id: 'api', label: 'API', kind: 'tob', from: '2022-01' },
    { id: 'gpu_lease', label: '算力出租', kind: 'tob', from: '2022-01' },
  ],
};
// 定价档位：普惠走量，旗舰走利润。
export const PRICE_TIERS = {
  budget: { label: '普惠', mult: 0.25, demand: 1.45, desc: '低价走量，适合抢用户，单位毛利薄' },
  standard: { label: '标准', mult: 1, demand: 1, desc: '跟随市场主流价格' },
  premium: { label: '旗舰', mult: 3, demand: 0.6, desc: '高价，只有能力领先时才卖得动' },
};

// ---------- 公司 ----------
export const TIERS = {
  frontier: { label: '前沿实验室', kind: 'private' },
  bigtech: { label: '大厂团队', kind: 'division' },
  major: { label: '头部创业公司', kind: 'private' },
  small: { label: '小型团队', kind: 'private' },
  specialist: { label: '垂直模型公司', kind: 'private' },
};
// 各剧本开局资源（现金美元；GPU 张数；团队人数；估值）。
// y2026 参考 2025 年末的真实数字：OpenAI 估值约 5000 亿、Anthropic 1830 亿；智谱、MiniMax 港股上市市值约 65–70 亿美元，
// 月之暗面约 43 亿、Mistral 约 137 亿；ElevenLabs 66 亿、Suno 24.5 亿。gpuCN 是中国公司的实际持卡（H800 存货、H20 和昇腾）。
export const START_RESOURCES = {
  frontier: { y2023: { cash: 2.5e9, gpu: { A100: 12000 }, team: 350, valuation: 2.9e10 }, y2024: { cash: 6e9, gpu: { A100: 10000, H100: 20000 }, team: 700, valuation: 8.6e10 }, y2025: { cash: 1.2e10, gpu: { H100: 60000 }, team: 1500, valuation: 1.6e11 },
    y2026: { cash: 2.5e10, gpu: { H100: 50000, B200: 40000 }, team: 2500, valuation: 3.5e11 } },
  bigtech: { y2023: { cash: 6e8, gpu: { A100: 6000 }, team: 220, valuation: 0 }, y2024: { cash: 1.2e9, gpu: { A100: 6000, H100: 8000 }, team: 400, valuation: 0 }, y2025: { cash: 2.5e9, gpu: { H100: 24000 }, team: 700, valuation: 0 },
    y2026: { cash: 4e9, gpu: { H100: 20000, B200: 12000 }, gpuCN: { H800: 12000, H20: 12000, Ascend910C: 6000 }, team: 900, valuation: 0 } },
  major: { y2023: { cash: 1.2e8, gpu: { A100: 1000 }, team: 80, valuation: 6e8 }, y2024: { cash: 4e8, gpu: { A100: 1500, H100: 1500 }, team: 160, valuation: 2.5e9 }, y2025: { cash: 9e8, gpu: { H100: 6000 }, team: 300, valuation: 6e9 },
    y2026: { cash: 1.5e9, gpu: { H100: 6000, B200: 3000 }, gpuCN: { H800: 3500, H20: 3000, Ascend910C: 1500 }, team: 400, valuation: 1e10 } },
  small: { y2023: { cash: 1.5e7, gpu: { A100: 96 }, team: 18, valuation: 8e7 }, y2024: { cash: 3e7, gpu: { A100: 128, H100: 64 }, team: 30, valuation: 2e8 }, y2025: { cash: 6e7, gpu: { H100: 384 }, team: 45, valuation: 5e8 },
    y2026: { cash: 1e8, gpu: { H100: 384, B200: 128 }, gpuCN: { H800: 300, H20: 200 }, team: 60, valuation: 1e9 } },
  specialist: { y2023: { cash: 6e7, gpu: { A100: 512 }, team: 35, valuation: 3e8 }, y2024: { cash: 1e8, gpu: { A100: 256, H100: 256 }, team: 70, valuation: 1.2e9 }, y2025: { cash: 2.5e8, gpu: { H100: 1200 }, team: 140, valuation: 3e9 },
    y2026: { cash: 4e8, gpu: { H100: 1200, B200: 400 }, team: 200, valuation: 6e9 } },
};
// 中国公司开局时把对应型号换成特供或国产卡。
export const CN_GPU_SWAP = { A100: 'A100', H100: 'H800' };

// 可玩公司。开源路线不在这里：开局路线见 data/routes.js 的 START_STANCE（规格 B6），局内只能由公司策略改。
export const COMPANIES = [
  { id: 'qwen', org: 'alibaba', company: '阿里巴巴 · 通义千问', country: 'CN', tier: 'bigtech', modality: 'llm', parent: 'BABA', strengths: ['code', 'knowledge'] },
  { id: 'deepseek', org: 'deepseek', company: '深度求索 DeepSeek', country: 'CN', tier: 'major', modality: 'llm', families: ['deepseek_pro', 'deepseek'], art: 'deepseek_pro', smallArt: 'deepseek', name: 'DeepSeek', label: '大肥鱼 · 小肥鱼', strengths: ['code', 'math'], note: '旗舰是 Pro（大肥鱼），蒸馏出的小模型是 Flash（小肥鱼）。' },
  { id: 'gemini', org: 'google', company: 'Google DeepMind', country: 'US', tier: 'frontier', modality: 'llm', parent: 'GOOGL', kind: 'division', families: ['gemini', 'gemma'], strengths: ['knowledge', 'math'] },
  { id: 'claude', org: 'anthropic', company: 'Anthropic', country: 'US', tier: 'frontier', modality: 'llm', strengths: ['code', 'safety'] },
  { id: 'gpt', org: 'openai', company: 'OpenAI', country: 'US', tier: 'frontier', modality: 'llm', strengths: ['math', 'writing'] },
  { id: 'kimi', org: 'kimi', company: '月之暗面 Moonshot AI', country: 'CN', tier: 'major', modality: 'llm', strengths: ['writing', 'knowledge'] },
  { id: 'glm', org: 'glm', company: '智谱 AI', country: 'CN', tier: 'major', modality: 'llm', strengths: ['code', 'agent'] },
  { id: 'grok', org: 'grok', company: 'xAI', country: 'US', tier: 'major', modality: 'llm', strengths: ['math', 'writing'] },
  { id: 'seed', org: 'bytedance', company: '字节跳动 Seed', country: 'CN', tier: 'bigtech', modality: 'llm', strengths: ['writing', 'math'] },
  { id: 'rwkv', org: 'rwkv', company: 'RWKV 社区 / 元始智能', country: 'CN', tier: 'small', modality: 'llm', arch: 'rnn', strengths: ['knowledge', 'writing'], note: '循环架构：推理成本低、长文本省显存，同等算力下能力略弱。' },
  { id: 'ernie', org: 'ernie', company: '百度 · 文心', country: 'CN', tier: 'bigtech', modality: 'llm', parent: 'BIDU', strengths: ['knowledge', 'writing'] },
  { id: 'mistral', org: 'mistral', company: 'Mistral AI', country: 'EU', tier: 'major', modality: 'llm', strengths: ['code', 'knowledge'] },
  { id: 'minimax', org: 'minimax', company: 'MiniMax 稀宇科技', country: 'CN', tier: 'major', modality: 'llm', strengths: ['writing', 'agent'] },
  { id: 'perplexity', org: 'perplexity', company: 'Perplexity AI', country: 'US', tier: 'small', modality: 'llm', strengths: ['knowledge', 'writing'], note: '搜索问答起家，模型规模受限，靠检索和产品取胜。' },
  { id: 'image2', org: 'openai', company: 'OpenAI · 图像', country: 'US', tier: 'frontier', modality: 'image', strengths: ['adherence', 'text'] },
  { id: 'llama', org: 'meta', company: 'Meta', country: 'US', tier: 'bigtech', modality: 'llm', parent: 'META', strengths: ['knowledge', 'writing'] },
  { id: 'hunyuan', org: 'tencent', company: '腾讯 · 混元', country: 'CN', tier: 'bigtech', modality: 'llm', parent: '0700.HK', strengths: ['knowledge', 'writing'] },
  { id: 'stepfun', org: 'stepfun', company: '阶跃星辰 StepFun', country: 'CN', tier: 'major', modality: 'llm', strengths: ['math', 'knowledge'] },
  { id: 'novelai', org: 'novelai', company: 'Anlatan · NovelAI', country: 'US', tier: 'small', modality: 'llm', strengths: ['writing'], note: '专做故事写作的小团队，用户多是写手和角色扮演玩家。' },
  { id: 'midjourney', org: 'midjourney', company: 'Midjourney', country: 'US', tier: 'specialist', modality: 'image', strengths: ['aesthetics', 'realism'] },
  { id: 'suno', org: 'suno', company: 'Suno', country: 'US', tier: 'specialist', modality: 'music', strengths: ['composition', 'vocals'] },
  { id: 'elevenlabs', org: 'elevenlabs', company: 'ElevenLabs', country: 'US', tier: 'specialist', modality: 'speech', strengths: ['naturalness', 'cloning'] },
  { id: 'fable', org: 'anthropic', company: 'Anthropic · Fable', country: 'US', tier: 'frontier', modality: 'llm', strengths: ['writing', 'safety'] },
  { id: 'jev', org: 'jev', company: 'TypeSafe AI', country: 'US', tier: 'small', modality: 'llm', strengths: ['safety', 'agent'], note: '做结构化决策的小模型：输入状态与问题，输出带概率的类型化判断。' },
];
for (const c of COMPANIES) c.families = c.families || [c.id];
export const COMPANY_BY_ID = Object.fromEntries(COMPANIES.map(c => [c.id, c]));
// 模型家族属于哪家可玩公司（DeepSeek 的 Pro 与 Flash 同属一家）。
export const OWNER_OF = Object.fromEntries(COMPANIES.flatMap(c => c.families.map(f => [f, c.id])));

const ROSTER_BY_ID = Object.fromEntries(CHARACTER_ROSTER.map(c => [c.id, c]));
export const characterById = id => ROSTER_BY_ID[id] || null;
export const PLAYABLE = COMPANIES.map(c => {
  const r = ROSTER_BY_ID[c.art || c.id];
  const small = c.smallArt ? ROSTER_BY_ID[c.smallArt] : null;
  return { ...c, ...pickArt(r), name: c.name || r?.name, label: c.label || r?.label, artId: r?.id, smallArtId: small?.id || null };
});
function pickArt(r) {
  if (!r) return {};
  return { name: r.name, label: r.label, quote: r.quote, credit: r.credit, source_url: r.source_url, sprites: Object.keys(r.sprites || {}).length ? r.sprites : { neutral: r.src } };
}
// 名牌上的名字和称号。名册里有些是后来才有的型号：V4-Pro、V4-Flash 和 GPT Image 2 是 2026-04，Fable 5 是 2026-06，
// GPT-6 Astra 是 2026-09，Gemini 4 Argon 是 2026-10。在那之前换成当年的叫法或不分年代的昵称。
// 每条是 [到这个月为止（不含）, 换成的名字或称号]，按时间先后排；日期用事件发生的月份。
const PLATE_BEFORE = {
  deepseek_pro: [['2026-04', { name: 'DeepSeek' }]],
  deepseek: [['2026-04', { name: '小肥鱼' }]],
  image2: [['2023-10', { name: 'DALL·E 2' }], ['2025-03', { name: 'DALL·E 3' }], ['2025-12', { name: 'GPT-4o 图像' }], ['2026-04', { name: 'GPT Image 1.5' }]],
  fable: [['2026-06', { name: 'Fable' }]],
  gpt: [['2026-09', { label: '' }]],
  gemini: [['2026-10', { label: '哈基米' }]],
};
export function plateAt(id, date) {
  const c = ROSTER_BY_ID[id];
  if (!c) return { name: id, label: '' };
  const era = (PLATE_BEFORE[id] || []).find(([until]) => date < until)?.[1] || {};
  return { name: era.name ?? c.name, label: era.label ?? c.label };
}
// 玩家扮演的角色（PLAYABLE 的一项或存档里的 persona）。公司自己定了名字或称号的（DeepSeek）就用公司的。
export function personaPlate(p, date) {
  const co = COMPANY_BY_ID[p.id];
  const r = plateAt(p.artId, date);
  return { name: co?.name ? p.name : r.name, label: co?.label ? p.label : r.label };
}

// ---------- 自定义模型结构（语言模型） ----------
// 总参数决定知识容量和显存需求；激活参数决定每个 token 的算力与推理成本；架构影响速度与稳定性。
export const PARAM_TOTALS = [0.5, 1.5, 3, 7, 14, 32, 70, 120, 236, 400, 671, 1000, 1600];
export const PARAM_ACTIVES = [0.5, 1.5, 3, 7, 14, 22, 32, 37, 50, 70, 100, 200];
export const ARCHS = {
  dense: { label: '稠密 Transformer', speed: 1, stable: 1, desc: '最成熟，调参经验最多。大尺寸时推理又慢又贵。' },
  moe: { label: 'MoE 稀疏专家', speed: 1.1, stable: 1.35, needTech: 'moe', desc: '总参数很大、激活参数很小：知识容量大、推理便宜，但路由不稳，更容易炼炸。' },
  hybrid: { label: '混合线性注意力', speed: 1.35, stable: 1.15, needTech: 'linear_attn', desc: '部分层换成线性注意力，长文本又快又省显存，能力略有折损。' },
  rnn: { label: 'RWKV 循环架构', speed: 1.7, stable: 0.9, only: ['rwkv'], desc: '推理时每个 token 的显存和时间恒定，非常便宜；同等算力下能力偏弱。' },
};
// LLM 按总参数分量级（规格 D1.1，界线在 balance.js 的 CLASS_EDGES）：≤15B 小，≤100B 中，再大是大；参数不公开的闭源旗舰另算“前沿”。
export function weightClass(total) { return total <= CLASS_EDGES.small ? 'small' : total <= CLASS_EDGES.mid ? 'mid' : 'large'; }

// 工具与设施角色是 NPC，出现在接入、算力等事件里，不能育成。
export const NPC_INFO = {
  opencode: { role: '开源终端编程 Agent' }, codex: { role: 'OpenAI 的编程 Agent' }, github_copilot: { role: 'GitHub 的代码助手' },
  microsoft_copilot: { role: '微软的办公助手' }, lobehub: { role: '开源的模型应用工作台' }, zcode: { role: '编程工具' },
  deepseek_harness: { role: '模型调用与评测工作流' }, kiro: { role: 'AWS 的规格驱动开发工具' }, cursor: { role: 'AI 代码编辑器' },
  antigravity: { role: 'Google 的 Agent 开发平台' }, pi: { role: '终端编程工具' }, claude_code: { role: 'Anthropic 的终端编程 Agent' },
  sillytavern: { role: '开源角色扮演前端（酒馆）' }, comfyui: { role: '开源图像工作流工具' }, huggingface: { role: '开源模型社区与托管平台' },
  ascend: { role: '华为昇腾，国产 AI 芯片' },
};
export const CODING_TOOLS = ['opencode', 'cursor', 'claude_code', 'codex', 'kiro', 'zcode', 'antigravity', 'pi', 'github_copilot', 'lobehub'];
// 编程工具归属：自家的工具不会来“申请接入”，从上线那个月起就算已经接入（Claude Code 2025 年 2 月预览、Codex CLI 4 月、Antigravity 11 月）。
export const TOOL_OWNER = {
  claude_code: { owners: ['claude', 'fable'], from: '2025-02' },
  codex: { owners: ['gpt'], from: '2025-04' },
  antigravity: { owners: ['gemini'], from: '2025-11' },
};
export const ownTools = (charId, date) => Object.entries(TOOL_OWNER).filter(([, t]) => t.owners.includes(charId) && date >= t.from).map(([id]) => id);
