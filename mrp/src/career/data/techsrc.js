// 每项技术在现实里是怎么传开的：[月份, 来源, 公开程度, 说明, 关联发布?]。
// 关联发布（第 5 列，规格 D2）：这次公开就是随某款发布一起来的（同月），新闻挂到发布那天，并进那条发布新闻。
// 来源是模型家族（玩家扮演的那一家不算数：那条线走的是另一条历史）或 'academia'（学界、社区，永远算数）。
// 公开程度：proof 有人做出来了但没公开方法（闭源产品）；paper 方法发了论文；open 连权重或代码都开源了。
// 一项技术谁都没公开过时只能自研，最慢；有人做出来、发了论文、开了源，照着学会越来越快。
export const TECH_SRC = {
  // 语言模型
  distill: [['2023-03', 'academia', 'open', 'Alpaca、Vicuna 等用大模型输出做指令微调']],
  dpo: [['2023-05', 'academia', 'paper', '斯坦福的 DPO 论文']],
  func_call: [['2023-06', 'gpt', 'proof', 'OpenAI API 上线函数调用'], ['2023-08', 'academia', 'open', 'Gorilla、ToolLLM 等开源工具调用数据']],
  long_ctx: [['2023-06', 'academia', 'paper', 'NTK 外推、位置插值等论文'], ['2023-09', 'academia', 'open', 'YaRN、LongLoRA 开源']],
  textbook: [['2023-06', 'phi', 'paper', 'Phi-1 论文《Textbooks Are All You Need》'], ['2023-12', 'phi', 'open', 'Phi-2 开放权重', 'Phi-2']],
  flash_attn: [['2023-07', 'academia', 'open', 'FlashAttention-2 开源'], ['2023-09', 'mistral', 'open', 'Mistral 7B 用上 GQA 和滑动窗口', 'Mistral 7B']],
  spec_decode: [['2023-09', 'academia', 'paper', '投机解码与 Medusa 等论文'], ['2024-01', 'academia', 'open', '推理框架内置投机解码']],
  moe: [['2023-12', 'mistral', 'open', 'Mixtral 8x7B 开源', 'Mixtral 8x7B'], ['2024-01', 'deepseek_pro', 'paper', 'DeepSeekMoE 论文'], ['2024-03', 'grok', 'open', 'Grok-1 开放 314B MoE 权重', 'Grok-1（开放权重）']],
  grpo: [['2024-02', 'deepseek', 'paper', 'DeepSeekMath 论文提出 GRPO'], ['2025-01', 'deepseek_pro', 'open', 'R1 报告与开源复现', 'DeepSeek-R1'], ['2025-03', 'academia', 'open', 'TRL、OpenRLHF 等框架内置 GRPO']],
  mla: [['2024-05', 'deepseek_pro', 'open', 'DeepSeek-V2 开源，论文介绍 MLA', 'DeepSeek-V2'], ['2025-07', 'kimi', 'open', 'Kimi K2 沿用 MLA 并开源', 'Kimi K2']],
  reasoning: [['2024-09', 'gpt', 'proof', 'o1-preview 展示长思维链推理', 'o1-preview'], ['2025-01', 'deepseek_pro', 'open', 'DeepSeek-R1 开源权重和训练方法', 'DeepSeek-R1'], ['2025-01', 'kimi', 'paper', 'Kimi k1.5 论文', 'Kimi k1.5'], ['2025-04', 'qwen', 'open', 'Qwen3 开源混合思考模型', 'Qwen3-235B-A22B']],
  computer_use: [['2024-10', 'claude', 'proof', 'Claude computer use 公测', 'Claude 3.5 Sonnet（新版）'], ['2025-01', 'gpt', 'proof', 'OpenAI Operator'], ['2025-04', 'academia', 'open', 'UI-TARS 等开源 GUI Agent']],
  mcp: [['2024-11', 'claude', 'open', 'MCP 协议开源'], ['2025-03', 'gpt', 'open', 'OpenAI 宣布支持 MCP']],
  fp8: [['2024-12', 'deepseek_pro', 'open', 'DeepSeek-V3 技术报告与 FP8 训练代码', 'DeepSeek-V3'], ['2025-06', 'academia', 'open', '主流训练框架支持 FP8']],
  mtp: [['2024-12', 'deepseek_pro', 'open', 'DeepSeek-V3 的多 token 预测', 'DeepSeek-V3'], ['2025-07', 'glm', 'open', 'GLM-4.5 采用 MTP', 'GLM-4.5']],
  linear_attn: [['2025-01', 'minimax', 'open', 'MiniMax-01 开源 Lightning Attention', 'MiniMax-Text-01'], ['2025-09', 'qwen', 'open', 'Qwen3-Next 混合注意力开源']],
  agentic_rl: [['2025-02', 'claude', 'proof', 'Claude 3.7 Sonnet 与 Claude Code', 'Claude 3.7 Sonnet'], ['2025-07', 'kimi', 'open', 'Kimi K2 技术报告', 'Kimi K2'], ['2025-08', 'glm', 'open', 'GLM-4.5 报告']],
  const_cls: [['2025-02', 'claude', 'paper', '宪法分类器论文'], ['2025-09', 'academia', 'open', '开源安全分类器']],
  muon: [['2025-02', 'kimi', 'paper', 'Moonlight 论文验证 Muon 可以放大'], ['2025-07', 'kimi', 'open', 'Kimi K2 的 MuonClip', 'Kimi K2'], ['2025-10', 'academia', 'open', '训练框架内置 Muon']],
  sparse_attn: [['2025-09', 'deepseek_pro', 'open', 'DeepSeek-V3.2 的 DSA 稀疏注意力'], ['2026-03', 'academia', 'open', '社区复现稀疏注意力内核']],
  skills: [['2025-10', 'claude', 'open', 'Agent Skills 开放规范'], ['2025-12', 'gpt', 'open', 'Codex 支持 Skills']],
  engram: [['2026-01', 'deepseek_pro', 'paper', 'Engram 条件记忆论文'], ['2026-09', 'deepseek', 'open', 'V4.1-Flash 开源带 Engram 的权重', 'DeepSeek-V4.1-Flash']],
  cot_monitor: [['2026-08', 'gpt', 'paper', 'OpenAI 事故报告与思维链监控方案'], ['2026-10', 'claude', 'paper', 'Anthropic 公布 Agent 监控做法']],
  // 图像
  aesthetic_rl: [['2023-03', 'academia', 'paper', '美学评分与偏好微调论文']],
  dit: [['2023-03', 'academia', 'paper', 'DiT 论文'], ['2024-02', 'academia', 'open', 'PixArt 等开源 DiT']],
  recaption: [['2023-10', 'image2', 'paper', 'DALL·E 3 论文介绍重写描述', 'DALL·E 3']],
  c2pa: [['2024-02', 'academia', 'open', 'C2PA 内容凭证标准']],
  flow: [['2024-03', 'sd', 'paper', 'Stable Diffusion 3 论文'], ['2024-08', 'flux', 'open', 'FLUX.1 开源', 'FLUX.1 [dev]']],
  ar_image: [['2025-03', 'image2', 'proof', 'GPT-4o 原生图像生成', 'GPT-4o 图像生成'], ['2025-08', 'qwen_image', 'open', 'Qwen-Image 开源', 'Qwen-Image']],
  img_edit: [['2025-08', 'imagen', 'proof', 'Nano Banana 对话式改图', 'Nano Banana'], ['2025-08', 'qwen_image', 'open', 'Qwen-Image-Edit 开源']],
  // 音乐
  codec: [['2023-06', 'academia', 'open', 'EnCodec、DAC 等开源编解码器']],
  lyric_align: [['2024-03', 'suno', 'proof', 'Suno v3 生成完整歌曲', 'Suno v3'], ['2025-01', 'academia', 'open', 'YuE 等开源歌曲生成']],
  audio_fp: [['2024-06', 'academia', 'paper', '旋律指纹比对与记忆检测论文']],
  stems: [['2025-05', 'suno', 'proof', 'Suno 分轨编辑'], ['2025-09', 'academia', 'open', '开源分轨分离与编辑模型']],
  licensed: [['2025-11', 'udio', 'proof', '环球与 Udio 和解并授权训练']],
  // 语音
  zero_shot: [['2023-01', 'academia', 'paper', 'VALL-E 论文']],
  voice_wm: [['2024-02', 'academia', 'paper', '语音水印论文']],
  flow_tts: [['2024-06', 'academia', 'paper', 'F5-TTS 等流匹配语音论文'], ['2024-07', 'cosyvoice', 'open', 'CosyVoice 开源', 'CosyVoice']],
  audio_tags: [['2025-06', 'elevenlabs', 'proof', 'Eleven v3 音频标签', 'Eleven v3']],
  s2s: [['2025-08', 'openai_tts', 'proof', 'gpt-realtime 端到端语音'], ['2026-01', 'academia', 'open', '开源端到端语音模型']],
};
// 公开程度对研究时间的倍率：没人公开过只能自研，最慢。
export const LEVEL_MULT = { secret: 2.6, proof: 1.7, paper: 1, open: 0.6 };
export const LEVEL_LABEL = { secret: '没人公开过，只能自研', proof: '有人做出来了，方法没公开', paper: '论文已公开', open: '已开源，可以照着学' };
// 最多能比现实早多少个月开始自研；每早一个月，自研多花三成时间。
export const AHEAD_MONTHS = 12;
export const AHEAD_PENALTY = 0.3;
// 前置技术：没掌握前面的，后面的无从下手（推理 RL 要先会 GRPO 一类的 RL 算法，Agent RL 要先有推理和工具调用……）。
export const PREREQ = {
  grpo: ['dpo'], mla: ['flash_attn'], reasoning: ['grpo'], computer_use: ['func_call'], mcp: ['func_call'], fp8: ['moe'], mtp: ['spec_decode'],
  linear_attn: ['long_ctx'], agentic_rl: ['reasoning', 'func_call'], const_cls: ['dpo'], sparse_attn: ['mla'], skills: ['mcp'], engram: ['moe'], cot_monitor: ['reasoning'],
  flow: ['dit'], ar_image: ['flow', 'recaption'], img_edit: ['flow'],
  lyric_align: ['codec'], stems: ['codec'], licensed: ['audio_fp'],
  flow_tts: ['zero_shot'], audio_tags: ['flow_tts'], s2s: ['flow_tts'],
};
