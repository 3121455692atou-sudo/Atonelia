// 史实库：67 条现实里发生过的模型大事（日期、事实、出处），64 条对应可玩公司的名册角色，另外 3 条是 Phi、LLaDA 的研究线。
// 由 v0.5 的个人事件数据迁来（tag legacy-v0.5；原文件归档在 archive/v0.5/src/data/）。事实是对出处的转述，出处核对日 2026-10-19。
//   character  讲这段故事的名册角色（CHARACTER_ROSTER 的 id）。Phi、LLaDA 不是可玩公司，为 null。
//   realFam    现实里做这件事的模型家族（FAMILIES 的键）。Phi、LLaDA 不在可玩家族里，为 null。
//              和 character 不一样的只有 DeepSeek-R1：现实里是 Pro 线，v0.5 把它归给了 Flash 角色。
//   model      现实里的型号名（研究论文、服务写成「某某（研究）」「某某（服务）」）。
//   choices    v0.5 个人事件的选项文字和效果（stats 是旧十维能力的加成）。里程碑选项的效果还在读它，v1.0 改完效果表以后删。
// 对话、短剧是游戏演绎，在 history_gen.js 里；这里只放史实。
export const HISTORY_SOURCES = [
  { id: 'qwen2', title: 'Hello Qwen2', date: '2024-06-07', url: 'https://qwenlm.github.io/blog/qwen2/', publisher: 'Qwen Team', access: 'primary_page' },
  { id: 'qwen25', title: 'Qwen2.5: A Party of Foundation Models!', date: '2024-09-19', url: 'https://qwenlm.github.io/blog/qwen2.5/', publisher: 'Qwen Team', access: 'primary_page' },
  { id: 'qwen_coder', title: 'Qwen2.5-Coder Series', date: '2024-11-12', url: 'https://qwenlm.github.io/blog/qwen2.5-coder-family/', publisher: 'Qwen Team', access: 'primary_page' },
  { id: 'ds_math', title: 'DeepSeekMath', date: '2024-02-05', url: 'https://arxiv.org/abs/2402.03300', publisher: 'DeepSeekMath authors', access: 'primary_page' },
  { id: 'ds_v2', title: 'DeepSeek-V2 official repository', date: '2024-05', url: 'https://github.com/deepseek-ai/DeepSeek-V2', publisher: 'DeepSeek', access: 'primary_page' },
  { id: 'ds_v3', title: 'DeepSeek-V3 official repository', date: '2024-12', url: 'https://github.com/deepseek-ai/DeepSeek-V3', publisher: 'DeepSeek', access: 'primary_page' },
  { id: 'ds_r1', title: 'DeepSeek-R1 Release', date: '2025-01-20', url: 'https://api-docs.deepseek.com/news/news250120/', publisher: 'DeepSeek', access: 'primary_page' },
  { id: 'ds_pro', title: 'DeepSeek-V4-Pro GA Release', date: '2026-08-13', url: 'https://api-docs.deepseek.com/news/news260813/', publisher: 'DeepSeek', access: 'primary_page' },
  { id: 'ds_flash', title: 'DeepSeek-V4.1-Flash: Smarter, Faster, More Efficient', date: '2026-09-10', url: 'https://api-docs.deepseek.com/news/news260910/', publisher: 'DeepSeek', access: 'primary_page' },
  { id: 'gemini1', title: 'Introducing Gemini', date: '2023-12-06', url: 'https://blog.google/innovation-and-ai/technology/ai/google-gemini-ai/', publisher: 'Google', access: 'primary_page' },
  { id: 'gemini15', title: 'Our next-generation model: Gemini 1.5', date: '2024-02-15', url: 'https://blog.google/innovation-and-ai/products/google-gemini-next-generation-model-february-2024/', publisher: 'Google', access: 'primary_page' },
  { id: 'gemini_flash', title: 'Gemini breaks new ground', date: '2024-05-14', url: 'https://blog.google/innovation-and-ai/products/google-gemini-update-flash-ai-assistant-io-2024/', publisher: 'Google', access: 'primary_page' },
  { id: 'constitutional', title: 'Constitutional AI: Harmlessness from AI feedback', date: '2022-12-15', url: 'https://www.anthropic.com/news/constitutional-ai-harmlessness-from-ai-feedback', publisher: 'Anthropic', access: 'primary_page' },
  { id: 'claude3', title: 'Introducing the next generation of Claude', date: '2024-03-04', url: 'https://www.anthropic.com/news/claude-3-family', publisher: 'Anthropic', access: 'primary_page' },
  { id: 'claude_computer', title: 'Developing a computer use model', date: '2024-10-22', url: 'https://www.anthropic.com/news/developing-computer-use', publisher: 'Anthropic', access: 'primary_page' },
  { id: 'gpt2_staged', title: 'Better language models and their implications', date: '2019-02-14', url: 'https://openai.com/index/better-language-models/', publisher: 'OpenAI', access: 'primary_page' },
  { id: 'gpt2_full', title: 'GPT-2: 1.5B release', date: '2019-11-05', url: 'https://openai.com/index/gpt-2-1-5b-release/', publisher: 'OpenAI', access: 'primary_page' },
  { id: 'chatgpt', title: 'Introducing ChatGPT', date: '2022-11-30', url: 'https://openai.com/index/chatgpt/', publisher: 'OpenAI', access: 'primary_page' },
  { id: 'gpt4', title: 'GPT-4 Technical Report', date: '2023-03-15', url: 'https://arxiv.org/abs/2303.08774', publisher: 'OpenAI', access: 'primary_page' },
  { id: 'gpt4o', title: 'Hello GPT-4o', date: '2024-05-13', url: 'https://openai.com/index/hello-gpt-4o/', publisher: 'OpenAI', access: 'primary_page' },
  { id: 'o1', title: 'Introducing OpenAI o1-preview', date: '2024-09-12', url: 'https://openai.com/index/introducing-openai-o1-preview/', publisher: 'OpenAI', access: 'primary_page' },
  { id: 'kimi15', title: 'Kimi k1.5: Scaling Reinforcement Learning with LLMs', date: '2025-01-22', url: 'https://arxiv.org/abs/2501.12599', publisher: 'Kimi Team', access: 'primary_page' },
  { id: 'kimi2', title: 'Kimi K2: Open Agentic Intelligence', date: '2025-07-28', url: 'https://arxiv.org/abs/2507.20534', publisher: 'Kimi Team', access: 'primary_page' },
  { id: 'chatglm', title: 'ChatGLM-6B official repository', date: '2023-03', url: 'https://github.com/zai-org/ChatGLM-6B', publisher: 'ChatGLM Team', access: 'primary_page' },
  { id: 'glm45', title: 'GLM-4.5: Agentic, Reasoning, and Coding', date: '2025-08-08', url: 'https://arxiv.org/abs/2508.06471', publisher: 'GLM-4.5 Team', access: 'primary_page' },
  { id: 'grok1', title: 'Announcing Grok', date: '2023-11-03', url: 'https://x.ai/news/grok', publisher: 'xAI', access: 'primary_page' },
  { id: 'grok_open', title: 'Open Release of Grok-1', date: '2024-03-17', url: 'https://x.ai/news/grok-os', publisher: 'xAI', access: 'primary_page' },
  { id: 'seed_thinking', title: 'Seed-Thinking-v1.5 Technical Details Disclosed', date: '2025-04-14', url: 'https://seed.bytedance.com/en/blog/bytedance-s-latest-thinking-model-seed-thinking-v1-5-technical-details-disclosed', publisher: 'ByteDance Seed', access: 'primary_page' },
  { id: 'seed_vl', title: 'Seed1.5-VL', date: '2025-05-13', url: 'https://seed.bytedance.com/en/tech/seed1_5_vl', publisher: 'ByteDance Seed', access: 'primary_page' },
  { id: 'rwkv', title: 'RWKV: Reinventing RNNs for the Transformer Era', date: '2023-05-22', url: 'https://arxiv.org/abs/2305.13048', publisher: 'RWKV authors', access: 'primary_page' },
  { id: 'rwkv7', title: 'RWKV-7 Goose', date: '2025-03-18', url: 'https://arxiv.org/abs/2503.14456', publisher: 'RWKV authors', access: 'primary_page' },
  { id: 'ernie', title: 'ERNIE: Enhanced Representation through Knowledge Integration', date: '2019-04-19', url: 'https://arxiv.org/abs/1904.09223', publisher: 'Baidu ERNIE authors', access: 'primary_page' },
  { id: 'ernie45', title: 'ERNIE 4.5 Technical Report', date: '2025-06-29', url: 'https://ernie.baidu.com/blog/publication/ERNIE_Technical_Report.pdf', publisher: 'Baidu ERNIE Team', access: 'official_search_excerpt' },
  { id: 'ernie45_repo', title: 'ERNIE 4.5 official repository', date: '2025-06', url: 'https://github.com/PaddlePaddle/ERNIE', publisher: 'Baidu ERNIE Team', access: 'primary_page' },
  { id: 'mistral7', title: 'Mistral 7B', date: '2023-09-27', url: 'https://mistral.ai/news/announcing-mistral-7b/', publisher: 'Mistral AI', access: 'primary_page' },
  { id: 'mixtral', title: 'Mixtral of experts', date: '2023-12-11', url: 'https://mistral.ai/news/mixtral-of-experts/', publisher: 'Mistral AI', access: 'primary_page' },
  { id: 'codestral', title: 'Codestral', date: '2024-05-29', url: 'https://mistral.ai/news/codestral/', publisher: 'Mistral AI', access: 'primary_page' },
  { id: 'minimax01', title: 'MiniMax-01 is Now Open-Source', date: '2025-01-15', url: 'https://www.minimax.io/news/minimax-01-series-2', publisher: 'MiniMax', access: 'primary_page' },
  { id: 'minimax_m1', title: 'MiniMax-M1', date: '2025-06-16', url: 'https://www.minimax.io/news/minimaxm1', publisher: 'MiniMax', access: 'primary_page' },
  { id: 'sonar', title: 'Meet New Sonar', date: '2025-02-11', url: 'https://www.perplexity.ai/en-GB/hub/blog/meet-new-sonar', publisher: 'Perplexity', access: 'primary_page' },
  { id: 'pplx_research', title: 'Introducing Perplexity Deep Research', date: '2025-02-14', url: 'https://www.perplexity.ai/en-GB/hub/blog/introducing-perplexity-deep-research', publisher: 'Perplexity', access: 'official_search_excerpt' },
  { id: 'pplx_index', title: 'Perplexity official blog archive', date: '2025', url: 'https://hub-prod.perplexity.ai/', publisher: 'Perplexity', access: 'official_search_excerpt' },
  { id: 'dalle2', title: 'Hierarchical text-conditional image generation with CLIP latents', date: '2022-04-13', url: 'https://openai.com/index/hierarchical-text-conditional-image-generation-with-clip-latents/', publisher: 'OpenAI', access: 'primary_page' },
  { id: 'image4o', title: 'Introducing 4o Image Generation', date: '2025-03-25', url: 'https://openai.com/index/introducing-4o-image-generation/', publisher: 'OpenAI', access: 'primary_page' },
  { id: 'llama1', title: 'LLaMA: Open and Efficient Foundation Language Models', date: '2023-02-27', url: 'https://arxiv.org/abs/2302.13971', publisher: 'Meta LLaMA authors', access: 'primary_page' },
  { id: 'llama2', title: 'Meta and Microsoft Introduce the Next Generation of Llama', date: '2023-07-18', url: 'https://about.fb.com/news/2023/07/llama-2/', publisher: 'Meta', access: 'primary_page' },
  { id: 'llama31', title: 'Introducing Llama 3.1', date: '2024-07-23', url: 'https://ai.meta.com/blog/meta-llama-3-1/', publisher: 'Meta', access: 'primary_page' },
  { id: 'hunyuan_large', title: 'Hunyuan-Large', date: '2024-11-04', url: 'https://arxiv.org/abs/2411.02265', publisher: 'Tencent Hunyuan authors', access: 'primary_page' },
  { id: 'hunyuan_video', title: 'HunyuanVideo', date: '2024-12-03', url: 'https://arxiv.org/abs/2412.03603', publisher: 'Tencent Hunyuan authors', access: 'primary_page' },
  { id: 'step_video', title: 'Step-Video-T2V official repository', date: '2025-02-17', url: 'https://github.com/stepfun-ai/Step-Video-T2V', publisher: 'StepFun', access: 'primary_page' },
  { id: 'step_audio', title: 'Step-Audio official repository', date: '2025-02-17', url: 'https://github.com/stepfun-ai/Step-Audio', publisher: 'StepFun', access: 'primary_page' },
  { id: 'novelai', title: 'NovelAI model history', date: '2026-10-19', url: 'https://docs.novelai.net/en/text/models/', publisher: 'NovelAI', access: 'primary_page' },
  { id: 'mj_versions', title: 'Midjourney model versions', date: '2026-10-19', url: 'https://docs.midjourney.com/hc/en-us/articles/32199405667853-Version', publisher: 'Midjourney', access: 'primary_page' },
  { id: 'mj_v7', title: 'V7 is now the default model!', date: '2025-06-17', url: 'https://updates.midjourney.com/v7-is-now-the-default-model/', publisher: 'Midjourney', access: 'primary_page' },
  { id: 'suno3', title: 'Introducing v3', date: '2024-03-21', url: 'https://about.suno.com/blog/v3', publisher: 'Suno', access: 'official_search_excerpt' },
  { id: 'suno4', title: 'v4 is here!', date: '2024-11-19', url: 'https://suno.com/release-notes/v4-is-here', publisher: 'Suno', access: 'primary_page' },
  { id: 'eleven2', title: 'Eleven Multilingual v2', date: '2023-08-22', url: 'https://elevenlabs.io/blog/eleven-multilingual-v2', publisher: 'ElevenLabs', access: 'primary_page' },
  { id: 'eleven3', title: 'Introducing Eleven v3 alpha', date: '2025-06-03', url: 'https://elevenlabs.io/blog/eleven-v3', publisher: 'ElevenLabs', access: 'primary_page' },
  { id: 'phi1', title: 'Textbooks Are All You Need', date: '2023-06-20', url: 'https://arxiv.org/abs/2306.11644', publisher: 'Microsoft Research authors', access: 'primary_page' },
  { id: 'phi15', title: 'Textbooks Are All You Need II: phi-1.5', date: '2023-09-11', url: 'https://arxiv.org/abs/2309.05463', publisher: 'Microsoft Research authors', access: 'primary_page' },
  { id: 'llada', title: 'Large Language Diffusion Models', date: '2025-02-14', url: 'https://arxiv.org/abs/2502.09992', publisher: 'LLaDA authors', access: 'primary_page' },
  { id: 'fable5', title: 'Claude Fable 5 and Claude Mythos 5', date: '2026-06-09', url: 'https://www.anthropic.com/news/claude-fable-5-mythos-5', publisher: 'Anthropic', access: 'primary_page' },
  { id: 'fable_restore', title: 'Redeploying Fable 5', date: '2026-06-30', url: 'https://www.anthropic.com/news/redeploying-fable-5', publisher: 'Anthropic', access: 'primary_page' },
  { id: 'fable_safeguards', title: 'Fable 5 cyber safeguards and jailbreak framework', date: '2026-07-02', url: 'https://www.anthropic.com/news/fable-safeguards-jailbreak-framework', publisher: 'Anthropic', access: 'primary_page' },
  { id: 'fable51', title: 'Introducing Claude Fable 5.1 and Claude Mythos 5.1', date: '2026-09-01', url: 'https://www.anthropic.com/claude-fable-and-mythos-5-1', publisher: 'Anthropic', access: 'primary_page' },
  { id: 'jev_launch', title: 'Introducing System One Models & Jev', date: '2026-09-15', url: 'https://typesafe.ai/blog/introducing-system-one-models-and-jev', publisher: 'TypeSafe AI', access: 'primary_page' },
  { id: 'jev_gateway', title: 'Jev is the fastest-adopted model in AI Gateway history', date: '2026-09-18', url: 'https://vercel.com/blog/ai-gateway-jev-model-launch', publisher: 'Vercel', access: 'primary_page' },
];
export const HISTORY_SOURCE_BY_ID = Object.fromEntries(HISTORY_SOURCES.map(s => [s.id, s]));

export const HISTORY_FACTS = [
  {
    id: 'personal_qwen_languages', character: 'qwen', realFam: 'qwen', model: 'Qwen2', date: '2024-06-07', title: 'Qwen2 发布',
    fact: 'Qwen2 提供五种规模的模型，在中文和英文之外加入另外 27 种语言的训练数据，并改进代码、数学和长上下文能力。',
    sources: ['qwen2'],
    choices: [
      { label: '陪她写一封多语言来信', effects: { stats: { knowledge: 5, expression: 4 } } },
      { label: '替她准备一次跨语言测验', effects: { stats: { reliability: 6, reasoning: 5 }, cost_kc: 8, readiness: -2 } },
    ],
  },
  {
    id: 'personal_qwen_family', character: 'qwen', realFam: 'qwen', model: 'Qwen2.5', date: '2024-09-19', title: 'Qwen2.5 模型家族',
    fact: 'Qwen2.5 同时介绍通用、Coder 和 Math 等系列，提供多种规模；不同版本的许可需要分别查看，不能一概视为同一种许可。',
    sources: ['qwen25'],
    choices: [
      { label: '一起选定一门主修课', effects: { stats: { mathematics: 6, reasoning: 4 }, cost_kc: 7 } },
      { label: '从用户的一天安排课程', effects: { stats: { expression: 5, tool_use: 4 }, trust: 1 } },
    ],
  },
  {
    id: 'personal_qwen_coder', character: 'qwen', realFam: 'qwen', model: 'Qwen2.5-Coder', date: '2024-11-12', title: 'Qwen2.5-Coder 系列补齐六种规模',
    fact: '此次开放的代码模型覆盖六种规模，在已有 1.5B、7B 之外加入 0.5B、3B、14B 和 32B，面向不同开发需求。',
    sources: ['qwen_coder'],
    choices: [
      { label: '继续补齐边界测试', effects: { stats: { coding: 7, reliability: 5 }, cost_kc: 9, readiness: -2 } },
      { label: '让她给新人讲解这段程序', effects: { stats: { coding: 4, expression: 5 }, reputation: 1 } },
    ],
  },
  {
    id: 'personal_deepseek_math', character: 'deepseek', realFam: 'deepseek', model: 'DeepSeekMath', date: '2024-02-05', title: 'DeepSeekMath 论文公开',
    fact: 'DeepSeekMath 使用筛选后的数学语料继续训练，并提出 GRPO，以改进数学推理及强化学习的内存效率。',
    sources: ['ds_math'],
    choices: [
      { label: '逐行复核这份证明', effects: { stats: { mathematics: 7, reliability: 4 }, cost_kc: 7 } },
      { label: '换一种说法讲给彼此听', effects: { stats: { reasoning: 5, expression: 4 } } },
    ],
  },
  {
    id: 'personal_deepseek_lite', character: 'deepseek', realFam: 'deepseek', model: 'DeepSeek-V2-Lite', date: '2024-05-16', title: 'DeepSeek-V2-Lite 发布',
    fact: '官方仓库记录 5 月 16 日发布 V2-Lite：总参数约 16B、每 Token 激活约 2.4B，是 V2 家族较轻的版本。',
    sources: ['ds_v2'],
    choices: [
      { label: '在小设备上做一次适配练习', effects: { stats: { tool_use: 6, coding: 5 }, cost_kc: 8, readiness: -2 } },
      { label: '和完整版本认真对照', effects: { stats: { reliability: 5, reasoning: 4 }, trust: 1 } },
    ],
  },
  {
    id: 'personal_deepseek_r1', character: 'deepseek', realFam: 'deepseek_pro', model: 'DeepSeek-R1', date: '2025-01-20', title: 'DeepSeek-R1 与蒸馏模型开放',
    fact: 'DeepSeek 发布 R1 及技术报告，强调大规模强化学习，并开放由 R1 蒸馏的六个较小模型。',
    sources: ['ds_r1'],
    choices: [
      { label: '给她一段完整的推理时间', effects: { stats: { reasoning: 7, mathematics: 5 }, cost_kc: 10, readiness: -3 } },
      { label: '把想通的方法写成短练习', effects: { stats: { coding: 4, expression: 5 }, reputation: 1 } },
    ],
  },
  {
    id: 'personal_deepseek_flash', character: 'deepseek', realFam: 'deepseek', model: 'DeepSeek-V4.1-Flash', date: '2026-09-10', title: 'DeepSeek-V4.1-Flash 发布',
    fact: '官方介绍 V4.1-Flash 的原生视觉理解与非对称编码器—解码器架构；该路线分别处理输入和输出，并降低 KV 缓存开销。',
    sources: ['ds_flash'],
    choices: [
      { label: '用速写做一次图文联合练习', effects: { stats: { context: 5, tool_use: 7 }, cost_kc: 10, readiness: -2 } },
      { label: '检查快起来之后有没有漏掉细节', effects: { stats: { reliability: 6, safety_alignment: 4 }, trust: 1 } },
    ],
  },
  {
    id: 'personal_deepseek_pro_v2', character: 'deepseek_pro', realFam: 'deepseek_pro', model: 'DeepSeek-V2', date: '2024-05-06', title: 'DeepSeek-V2 发布',
    fact: '官方仓库记录 5 月 6 日发布 V2；模型结合 MLA 与 DeepSeekMoE，研究重点包含推理成本、KV 缓存和稀疏激活。',
    sources: ['ds_v2'],
    choices: [
      { label: '陪她拆解推理瓶颈', effects: { stats: { coding: 6, context: 6 }, cost_kc: 9, readiness: -2 } },
      { label: '把节省下来的余量留给用户', effects: { stats: { tool_use: 5, reliability: 4 }, trust: 1 } },
    ],
  },
  {
    id: 'personal_deepseek_pro_v3', character: 'deepseek_pro', realFam: 'deepseek_pro', model: 'DeepSeek-V3', date: '2024-12-26', title: 'DeepSeek-V3 发布',
    fact: 'V3 官方资料介绍 FP8 混合精度训练、通信与计算重叠等工程设计；发布日见官方更新目录的 2024 年 12 月 26 日记录。',
    sources: ['ds_v3', 'ds_r1'],
    choices: [
      { label: '做完混合精度对照实验', effects: { stats: { coding: 6, reliability: 6 }, cost_kc: 10, readiness: -3 } },
      { label: '整理一份能复现的实验记录', effects: { stats: { knowledge: 5, expression: 4 }, reputation: 1 } },
    ],
  },
  {
    id: 'personal_deepseek_pro_ga', character: 'deepseek_pro', realFam: 'deepseek_pro', model: 'DeepSeek-V4-Pro', date: '2026-08-13', title: 'DeepSeek-V4-Pro 正式可用',
    fact: 'V4-Pro 的正式发布说明强调 Agent 工作流、可调推理强度，以及面向 Codex 等工具的 Responses API 兼容支持。',
    sources: ['ds_pro'],
    choices: [
      { label: '为不同任务安排推理预算', effects: { stats: { tool_use: 7, reasoning: 5 }, cost_kc: 10, readiness: -2 } },
      { label: '先和工具 NPC 做一次交接演练', effects: { stats: { tool_use: 5, safety_alignment: 4 }, trust: 1 } },
    ],
  },
  {
    id: 'personal_gemini_debut', character: 'gemini', realFam: 'gemini', model: 'Gemini 1.0', date: '2023-12-06', title: 'Gemini 1.0 亮相',
    fact: 'Google 发布原生多模态 Gemini 1.0，介绍 Ultra、Pro、Nano 三种规模，面向不同设备和任务。',
    sources: ['gemini1'],
    choices: [
      { label: '把图像和文字放进同一道题', effects: { stats: { knowledge: 5, reasoning: 6 }, cost_kc: 8 } },
      { label: '为不同设备安排一场见面', effects: { stats: { tool_use: 5, expression: 4 } } },
    ],
  },
  {
    id: 'personal_gemini_context', character: 'gemini', realFam: 'gemini', model: 'Gemini 1.5 Pro', date: '2024-02-15', title: 'Gemini 1.5 的百万 Token 长上下文预览',
    fact: 'Gemini 1.5 Pro 向有限开发者和企业客户提供最高百万 Token 上下文的早期预览，展示长文档、音频和视频理解。',
    sources: ['gemini15'],
    choices: [
      { label: '陪她完成一次长文档寻线索', effects: { stats: { context: 8, reasoning: 4 }, cost_kc: 10, readiness: -2 } },
      { label: '抽查被忽略的中间章节', effects: { stats: { context: 5, reliability: 4 }, trust: 1 } },
    ],
  },
  {
    id: 'personal_gemini_flash', character: 'gemini', realFam: 'gemini', model: 'Gemini 1.5 Flash', date: '2024-05-14', title: 'Gemini 1.5 Flash 发布预览',
    fact: 'Google 在 I/O 介绍轻量的 1.5 Flash，面向速度与效率，同时支持多模态输入和长上下文。',
    sources: ['gemini_flash'],
    choices: [
      { label: '安排一轮高并发任务练习', effects: { stats: { tool_use: 6, coding: 5 }, cost_kc: 8, readiness: -2 } },
      { label: '练习简短地说明不确定性', effects: { stats: { expression: 5, reliability: 4 } } },
    ],
  },
  {
    id: 'personal_claude_principles', character: 'claude', realFam: 'claude', model: 'Claude（Constitutional AI 研究）', date: '2022-12-15', title: 'Constitutional AI 研究公开',
    fact: 'Anthropic 的研究通过一组原则引导模型自我批评和修订，并使用 AI 反馈训练偏好模型；这是 Claude 技术脉络的一部分。',
    sources: ['constitutional'],
    choices: [
      { label: '一起检查原则能否用于具体场景', effects: { stats: { safety_alignment: 7, reliability: 4 }, cost_kc: 7 } },
      { label: '练习有帮助、能说明理由的回应', effects: { stats: { expression: 5, safety_alignment: 4 }, trust: 1 } },
    ],
  },
  {
    id: 'personal_claude_trio', character: 'claude', realFam: 'claude', model: 'Claude 3', date: '2024-03-04', title: 'Claude 3 家族发布',
    fact: 'Claude 3 包含 Haiku、Sonnet、Opus 三种模型，围绕速度、成本和能力作不同取舍，并加入图像理解能力。',
    sources: ['claude3'],
    choices: [
      { label: '为不同工作选合适的模型档位', effects: { stats: { tool_use: 6, reasoning: 5 }, cost_kc: 8 } },
      { label: '让她解释图表里的细节', effects: { stats: { knowledge: 5, expression: 4 } } },
    ],
  },
  {
    id: 'personal_claude_computer', character: 'claude', realFam: 'claude', model: 'Claude 3.5 Sonnet（新版）', date: '2024-10-22', title: 'Claude 的 computer use 公开测试',
    fact: '更新后的 Claude 3.5 Sonnet 可在相应软件环境中读取屏幕、移动鼠标和输入文字；官方说明训练中需要学习准确定位像素。',
    sources: ['claude_computer'],
    choices: [
      { label: '陪她做屏幕定位练习', effects: { stats: { tool_use: 8, coding: 4 }, cost_kc: 10, readiness: -2 } },
      { label: '练习在关键操作前向人确认', effects: { stats: { safety_alignment: 5, reliability: 4 }, trust: 1 } },
    ],
  },
  {
    id: 'personal_gpt_staged', character: 'gpt', realFam: 'gpt', model: 'GPT-2', date: '2019-02-14', title: 'GPT-2 的分阶段发布', dateNote: '事件日期对应首次公告；后续完整权重发布的日期在史实中单独列出。',
    fact: 'OpenAI 起初因担忧滥用而暂不公开 GPT-2 最大版本，采用分阶段发布；到 2019 年 11 月 5 日，最大 1.5B 版本的权重也公开了。',
    sources: ['gpt2_staged', 'gpt2_full'],
    choices: [
      { label: '给自己的新版本安排一次风险评估', effects: { stats: { safety_alignment: 6, reliability: 5 }, cost_kc: 8 } },
      { label: '先把能力、局限和发布计划写清楚', effects: { stats: { expression: 5, knowledge: 4 }, trust: 1 } },
    ],
  },
  {
    id: 'personal_gpt_chat', character: 'gpt', realFam: 'gpt', model: 'ChatGPT', date: '2022-11-30', title: 'ChatGPT 研究预览推出',
    fact: 'OpenAI 推出以对话方式交互的 ChatGPT 研究预览，介绍人类反馈训练方法及当时存在的局限。',
    sources: ['chatgpt'],
    choices: [
      { label: '陪她练习追问和多轮对话', effects: { stats: { expression: 6, context: 4 } } },
      { label: '整理真实反馈和容易答错的问题', effects: { stats: { reliability: 6, safety_alignment: 5 }, cost_kc: 8 } },
    ],
  },
  {
    id: 'personal_gpt_four', character: 'gpt', realFam: 'gpt', model: 'GPT-4', date: '2023-03-15', title: 'GPT-4 技术报告公开', dateNote: '这里采用技术报告的公开日期，区别于产品发布日。',
    fact: 'GPT-4 技术报告描述可接受图像与文本输入、产生文本输出的多模态模型，也记录其可靠性与安全方面的局限。',
    sources: ['gpt4'],
    choices: [
      { label: '用图表做一次理解测验', effects: { stats: { reasoning: 6, knowledge: 6 }, cost_kc: 9 } },
      { label: '一起写下能力边界', effects: { stats: { reliability: 5, safety_alignment: 4 }, trust: 1 } },
    ],
  },
  {
    id: 'personal_gpt_omni', character: 'gpt', realFam: 'gpt', model: 'GPT-4o', date: '2024-05-13', title: 'GPT-4o 发布',
    fact: 'GPT-4o 的发布介绍强调跨音频、视觉与文本的实时交互，探索更自然的多模态交流。',
    sources: ['gpt4o'],
    choices: [
      { label: '练习图像、语音与文字之间的对应', effects: { stats: { tool_use: 6, expression: 6 }, cost_kc: 9, readiness: -2 } },
      { label: '练习给对方留出说完的时间', effects: { stats: { expression: 6, reliability: 3 } } },
    ],
  },
  {
    id: 'personal_gpt_o1', character: 'gpt', realFam: 'gpt', model: 'o1-preview', date: '2024-09-12', title: 'o1-preview 亮相',
    fact: 'OpenAI 发布 o1-preview 和 o1-mini，介绍在作答前使用更多时间推理、尝试不同策略和识别错误的模型路线。',
    sources: ['o1'],
    choices: [
      { label: '给难题留一份完整推理预算', effects: { stats: { reasoning: 7, mathematics: 5 }, cost_kc: 10, readiness: -3 } },
      { label: '先练习给现有答案做独立检查', effects: { stats: { reliability: 6, mathematics: 3 } } },
    ],
  },
  {
    id: 'personal_kimi_k15', character: 'kimi', realFam: 'kimi', model: 'Kimi k1.5', date: '2025-01-22', title: 'Kimi k1.5 论文公开', dateNote: '日期为论文首次提交日，不用它代替产品上线日期。',
    fact: 'Kimi k1.5 研究强化学习、较长推理上下文与多模态推理，也讨论将长推理中的能力迁移到较短回答。',
    sources: ['kimi15'],
    choices: [
      { label: '陪她走完一条长推理路线', effects: { stats: { reasoning: 7, mathematics: 5 }, cost_kc: 9, readiness: -2 } },
      { label: '把复杂思路整理成简洁说明', effects: { stats: { expression: 6, reliability: 3 } } },
    ],
  },
  {
    id: 'personal_kimi_k2', character: 'kimi', realFam: 'kimi', model: 'Kimi K2', date: '2025-07-28', title: 'Kimi K2 技术报告公开', dateNote: '这里采用技术报告的首次提交日；K2 模型此前已公开。',
    fact: 'Kimi K2 报告介绍万亿总参数、约 32B 激活参数的 MoE 模型，使用 MuonClip，并重点研究工具使用和 Agent 能力。',
    sources: ['kimi2'],
    choices: [
      { label: '做一次带结果核验的工具任务', effects: { stats: { tool_use: 8, coding: 4 }, cost_kc: 10, readiness: -2 } },
      { label: '先为工具任务划好边界', effects: { stats: { safety_alignment: 5, reliability: 4 }, trust: 1 } },
    ],
  },
  {
    id: 'personal_glm_desktop', character: 'glm', realFam: 'glm', model: 'ChatGLM-6B', date: '2023-03', title: 'ChatGLM-6B 的本地双语对话路线', dateNote: '本段按 2023 年 3 月的早期开源阶段记载，不混同不同发布活动的具体日期。',
    fact: 'ChatGLM-6B 官方仓库介绍中英双语对话和消费级显卡部署，说明 INT4 量化推理最低约需 6GB 显存，实际占用受上下文等因素影响。',
    sources: ['chatglm'],
    choices: [
      { label: '陪她完成本地适配和测试', effects: { stats: { coding: 6, context: 5 }, cost_kc: 8 } },
      { label: '办一场中英双语的小茶会', effects: { stats: { expression: 5, knowledge: 4 } } },
    ],
  },
  {
    id: 'personal_glm_arc', character: 'glm', realFam: 'glm', model: 'GLM-4.5', date: '2025-08-08', title: 'GLM-4.5 技术报告公开',
    fact: 'GLM-4.5 报告将 Agent、推理、代码合称 ARC，介绍支持思考与直接回答模式的 MoE 模型及较紧凑的 Air 版本。',
    sources: ['glm45'],
    choices: [
      { label: '安排一个需要代码和工具的推理任务', effects: { stats: { coding: 4, tool_use: 4, reasoning: 4 }, cost_kc: 10, readiness: -2 } },
      { label: '先练习简单任务的直接回答', effects: { stats: { expression: 5, reliability: 4 } } },
    ],
  },
  {
    id: 'personal_grok_wit', character: 'grok', realFam: 'grok', model: 'Grok（早期测试）', date: '2023-11-03', title: 'Grok 早期测试公布',
    fact: 'xAI 的早期介绍将幽默、反叛风格和通过 X 获取实时信息列为 Grok 的特点，同时明确当时仍是早期测试产品。',
    sources: ['grok1'],
    choices: [
      { label: '陪她打磨一段有个性的表达', effects: { stats: { creative_writing: 6, expression: 4 } } },
      { label: '给实时信息做一轮出处核对', effects: { stats: { reliability: 6, knowledge: 5 }, cost_kc: 8 } },
    ],
  },
  {
    id: 'personal_grok_open', character: 'grok', realFam: 'grok', model: 'Grok-1', date: '2024-03-17', title: 'Grok-1 基础模型开放',
    fact: 'xAI 公开 Grok-1 的权重和架构，说明它是约 314B 参数的 MoE 基础检查点，没有针对对话等具体用途微调。',
    sources: ['grok_open'],
    choices: [
      { label: '做一轮基础模型与对话模型的对照', effects: { stats: { knowledge: 5, reliability: 4 }, trust: 1 } },
      { label: '为自己的实验模型准备适配数据', effects: { stats: { expression: 6, coding: 6 }, cost_kc: 9, readiness: -2 } },
    ],
  },
  {
    id: 'personal_seed_thinking', character: 'seed', realFam: 'seed', model: 'Seed-Thinking-v1.5', date: '2025-04-14', title: 'Seed-Thinking-v1.5 技术细节公开',
    fact: 'Seed 团队介绍该思考模型的技术报告，说明可验证任务与创意生成使用不同反馈方法，并预告后续 API 测试。',
    sources: ['seed_thinking'],
    choices: [
      { label: '用可验证任务练习推理', effects: { stats: { mathematics: 7, reasoning: 5 }, cost_kc: 8 } },
      { label: '认真讨论两种写法的差别', effects: { stats: { creative_writing: 6, expression: 4 } } },
    ],
  },
  {
    id: 'personal_seed_vision', character: 'seed', realFam: 'seed', model: 'Seed1.5-VL', date: '2025-05-13', title: 'Seed1.5-VL 技术公开',
    fact: 'Seed1.5-VL 面向图像、视频和多模态推理，也展示 GUI 控制、视觉谜题和游戏等任务。',
    sources: ['seed_vl'],
    choices: [
      { label: '陪她完成一轮截图与操作练习', effects: { stats: { tool_use: 7, reasoning: 5 }, cost_kc: 9, readiness: -2 } },
      { label: '先玩一局需要观察的小谜题', effects: { stats: { reasoning: 5, creative_writing: 4 } } },
    ],
  },
  {
    id: 'personal_rwkv_rnn', character: 'rwkv', realFam: 'rwkv', model: 'RWKV', date: '2023-05-22', title: 'RWKV 论文公开',
    fact: 'RWKV 研究结合可并行训练与循环式推理的序列建模，探索 Transformer 之外的效率路线。',
    sources: ['rwkv'],
    choices: [
      { label: '研究循环状态如何保存信息', effects: { stats: { context: 6, reasoning: 6 }, cost_kc: 9 } },
      { label: '练习一段稳定的连续对话', effects: { stats: { context: 5, reliability: 4 } } },
    ],
  },
  {
    id: 'personal_rwkv_goose', character: 'rwkv', realFam: 'rwkv', model: 'RWKV-7 Goose', date: '2025-03-18', title: 'RWKV-7 Goose 论文公开',
    fact: 'RWKV-7 介绍新的动态状态演化形式，保持循环推理时每 Token 的常量内存和时间需求，并公开模型、数据组成及代码。',
    sources: ['rwkv7'],
    choices: [
      { label: '跟进新的状态演化实验', effects: { stats: { reasoning: 6, context: 6 }, cost_kc: 9, readiness: -2 } },
      { label: '把可复现的结果分享给同伴', effects: { stats: { expression: 5, reliability: 4 }, reputation: 1 } },
    ],
  },
  {
    id: 'personal_ernie_entities', character: 'ernie', realFam: 'ernie', model: 'ERNIE 1.0', date: '2019-04-19', title: '百度 ERNIE 知识整合论文公开',
    fact: '该 ERNIE 研究通过实体级、短语级等知识掩码学习表示；它与同年名称相近的其他研究应区分。',
    sources: ['ernie'],
    choices: [
      { label: '整理实体和短语之间的关系', effects: { stats: { knowledge: 7, reasoning: 4 }, cost_kc: 7 } },
      { label: '用熟悉的中文例句解释这种学习', effects: { stats: { expression: 5, knowledge: 4 } } },
    ],
  },
  {
    id: 'personal_ernie_open45', character: 'ernie', realFam: 'ernie', model: 'ERNIE 4.5', date: '2025-06-29', title: 'ERNIE 4.5 技术报告',
    fact: 'ERNIE 4.5 技术报告介绍包含不同规模、文本及多模态变体的模型家族，讨论多模态 MoE 与高效训练。',
    sources: ['ernie45', 'ernie45_repo'],
    choices: [
      { label: '比较不同模态的协作方式', effects: { stats: { tool_use: 6, knowledge: 6 }, cost_kc: 9, readiness: -2 } },
      { label: '写一份适合新人阅读的上手笔记', effects: { stats: { expression: 5, reliability: 4 }, reputation: 1 } },
    ],
  },
  {
    id: 'personal_mistral_seven', character: 'mistral', realFam: 'mistral', model: 'Mistral 7B', date: '2023-09-27', title: 'Mistral 7B 发布',
    fact: 'Mistral 发布 7.3B 参数模型，介绍 GQA、滑动窗口注意力等设计，并以 Apache 2.0 许可提供模型。',
    sources: ['mistral7'],
    choices: [
      { label: '研究轻量模型的推理效率', effects: { stats: { coding: 6, context: 5 }, cost_kc: 8 } },
      { label: '整理模型使用边界与说明', effects: { stats: { reliability: 5, expression: 4 }, trust: 1 } },
    ],
  },
  {
    id: 'personal_mistral_experts', character: 'mistral', realFam: 'mistral', model: 'Mixtral 8x7B', date: '2023-12-11', title: 'Mixtral 8x7B 发布',
    fact: 'Mixtral 8x7B 采用稀疏专家架构，每层从八个专家中选择两个处理 Token，并公开权重。',
    sources: ['mixtral'],
    choices: [
      { label: '练习为不同任务选择专家', effects: { stats: { reasoning: 6, coding: 6 }, cost_kc: 9, readiness: -2 } },
      { label: '观察专家负载是否均衡', effects: { stats: { reliability: 5, tool_use: 4 } } },
    ],
  },
  {
    id: 'personal_mistral_code', character: 'mistral', realFam: 'mistral', model: 'Codestral', date: '2024-05-29', title: 'Codestral 发布',
    fact: 'Codestral 是 Mistral 的代码模型，覆盖多种编程语言，并支持从代码中间补全等工作方式。',
    sources: ['codestral'],
    choices: [
      { label: '做一次代码中间补全练习', effects: { stats: { coding: 8, context: 4 }, cost_kc: 9 } },
      { label: '先审查已有代码的意图', effects: { stats: { coding: 4, reliability: 5 } } },
    ],
  },
  {
    id: 'personal_minimax_long', character: 'minimax', realFam: 'minimax', model: 'MiniMax-01', date: '2025-01-15', title: 'MiniMax-01 系列开源介绍',
    fact: 'MiniMax-01 包含文本与视觉语言模型，使用 Lightning Attention 等设计，探索超长上下文与效率。',
    sources: ['minimax01'],
    choices: [
      { label: '做一场跨章节的长上下文练习', effects: { stats: { context: 8, reasoning: 4 }, cost_kc: 10, readiness: -2 } },
      { label: '给长资料写一份能回查的摘要', effects: { stats: { expression: 5, reliability: 4 } } },
    ],
  },
  {
    id: 'personal_minimax_m1', character: 'minimax', realFam: 'minimax', model: 'MiniMax-M1', date: '2025-06-16', title: 'MiniMax-M1 发布',
    fact: 'MiniMax-M1 介绍开放的混合注意力推理模型，支持百万 Token 上下文，并研究长推理、软件工程与工具任务。',
    sources: ['minimax_m1'],
    choices: [
      { label: '重新规划并执行这项工具任务', effects: { stats: { tool_use: 7, reasoning: 5 }, cost_kc: 10, readiness: -3 } },
      { label: '先做一份失败复盘', effects: { stats: { reliability: 6, expression: 3 }, trust: 1 } },
    ],
  },
  {
    id: 'personal_perplexity_sonar', character: 'perplexity', realFam: 'perplexity', model: 'Sonar', date: '2025-02-11', title: '新版 Sonar 介绍', dateNote: '日期由 Perplexity 官方博客目录核对；此段属于 Sonar 模型史。',
    fact: 'Perplexity 介绍基于 Llama 3.3 70B 进一步训练的 Sonar，面向搜索回答的事实性与可读性优化。',
    sources: ['sonar', 'pplx_index'],
    choices: [
      { label: '逐条核对结论与来源', effects: { stats: { reliability: 7, knowledge: 4 }, cost_kc: 7 } },
      { label: '把有根据的答案写得更好读', effects: { stats: { expression: 6, knowledge: 3 } } },
    ],
  },
  {
    id: 'personal_perplexity_research', character: 'perplexity', realFam: 'perplexity', model: 'Deep Research（服务）', date: '2025-02-14', title: 'Perplexity Deep Research 推出',
    fact: 'Perplexity 推出 Deep Research 服务，通过多次搜索、阅读来源和推理形成研究报告；这是服务发展事件，不是全新基础模型的发布。',
    sources: ['pplx_research', 'pplx_index'],
    choices: [
      { label: '补完关键来源再提交报告', effects: { stats: { knowledge: 6, reasoning: 6 }, cost_kc: 10, readiness: -2 } },
      { label: '先交一份标明未知的阶段报告', effects: { stats: { reliability: 6, expression: 3 }, trust: 1 } },
    ],
  },
  {
    id: 'personal_image2_latents', character: 'image2', realFam: 'image2', model: 'DALL·E 2', date: '2022-04-13', title: 'DALL·E 2 关联研究公开', dateNote: '借用 OpenAI 图像技术的发展作为 Image 2 角色的回忆，不把该研究冒称为 Image 2 产品发布。',
    fact: 'OpenAI 公开使用 CLIP 图像表示进行分层文本条件生成的研究，探索由文本描述生成多样图像。',
    sources: ['dalle2'],
    choices: [
      { label: '把不同构图的差异认真画出来', effects: { stats: { creative_writing: 7, expression: 4 }, cost_kc: 7 } },
      { label: '先讨论描述里真正重要的意图', effects: { stats: { expression: 5, reliability: 4 } } },
    ],
  },
  {
    id: 'personal_image2_letters', character: 'image2', realFam: 'image2', model: 'GPT-4o 图像生成', date: '2025-03-25', title: '4o 图像生成发布',
    fact: 'OpenAI 发布 4o 图像生成，介绍更好的文字渲染、指令遵循及通过多轮对话修改图像等能力。',
    sources: ['image4o'],
    choices: [
      { label: '做一轮带文字和布局要求的创作', effects: { stats: { creative_writing: 6, tool_use: 6 }, cost_kc: 9, readiness: -2 } },
      { label: '和她逐轮修改一张海报', effects: { stats: { expression: 5, reliability: 4 }, trust: 1 } },
    ],
  },
  {
    id: 'personal_llama_research', character: 'llama', realFam: 'llama', model: 'LLaMA', date: '2023-02-27', title: 'LLaMA 论文公开',
    fact: 'LLaMA 论文研究 7B 至 65B 的基础语言模型，强调使用公开可获得数据训练，并向研究社区提供模型。',
    sources: ['llama1'],
    choices: [
      { label: '研究公开数据的整理与筛选', effects: { stats: { knowledge: 6, reliability: 5 }, cost_kc: 8 } },
      { label: '办一场小小的论文读书会', effects: { stats: { expression: 5, reasoning: 4 } } },
    ],
  },
  {
    id: 'personal_llama_two', character: 'llama', realFam: 'llama', model: 'Llama 2', date: '2023-07-18', title: 'Llama 2 发布',
    fact: 'Meta 与 Microsoft 宣布 Llama 2，可用于研究和商业用途，但仍需遵守相应的 Llama 许可及使用条件。',
    sources: ['llama2'],
    choices: [
      { label: '陪社区用户做一次适配练习', effects: { stats: { tool_use: 6, coding: 5 }, cost_kc: 8, reputation: 1 } },
      { label: '把使用条件和能力边界讲清楚', effects: { stats: { safety_alignment: 5, reliability: 4 }, trust: 1 } },
    ],
  },
  {
    id: 'personal_llama_herd', character: 'llama', realFam: 'llama', model: 'Llama 3.1', date: '2024-07-23', title: 'Llama 3.1 发布',
    fact: 'Llama 3.1 包含 405B 等规模，扩展到 128K 上下文并支持八种语言；这些是发布时官方介绍的能力范围。',
    sources: ['llama31'],
    choices: [
      { label: '做一次长上下文与多语言联合测验', effects: { stats: { context: 6, knowledge: 6 }, cost_kc: 10, readiness: -2 } },
      { label: '先复核熟悉任务有没有退步', effects: { stats: { reliability: 6, reasoning: 3 } } },
    ],
  },
  {
    id: 'personal_hunyuan_large', character: 'hunyuan', realFam: 'hunyuan', model: 'Hunyuan-Large', date: '2024-11-04', title: 'Hunyuan-Large 论文公开',
    fact: 'Hunyuan-Large 报告介绍总参数约 389B、激活参数约 52B 的 MoE 模型，并研究专家路由与长上下文等设计。',
    sources: ['hunyuan_large'],
    choices: [
      { label: '一起研究专家路由和任务分配', effects: { stats: { reasoning: 6, tool_use: 6 }, cost_kc: 9 } },
      { label: '给每次分配留一份可核查的记录', effects: { stats: { reliability: 5, expression: 4 } } },
    ],
  },
  {
    id: 'personal_hunyuan_video', character: 'hunyuan', realFam: 'hunyuan', model: 'HunyuanVideo', date: '2024-12-03', title: 'HunyuanVideo 报告公开',
    fact: 'HunyuanVideo 介绍开放的视频生成框架，讨论数据整理、架构、训练扩展与推理基础设施。',
    sources: ['hunyuan_video'],
    choices: [
      { label: '做一轮跨帧一致性检查', effects: { stats: { context: 6, reliability: 6 }, cost_kc: 9, readiness: -2 } },
      { label: '先把短片的分镜讲清楚', effects: { stats: { creative_writing: 6, expression: 3 } } },
    ],
  },
  {
    id: 'personal_stepfun_video', character: 'stepfun', realFam: 'stepfun', model: 'Step-Video-T2V', date: '2025-02-17', title: 'Step-Video-T2V 权重与代码开放',
    fact: 'StepFun 官方仓库记录 2 月 17 日开放 Step-Video-T2V、Turbo 的推理代码与权重，以及相关技术报告。',
    sources: ['step_video'],
    choices: [
      { label: '给短片做连续性和语义检查', effects: { stats: { context: 6, reasoning: 6 }, cost_kc: 9, readiness: -2 } },
      { label: '办一场带反馈的小放映', effects: { stats: { creative_writing: 5, expression: 4 }, reputation: 1 } },
    ],
  },
  {
    id: 'personal_stepfun_audio', character: 'stepfun', realFam: 'stepfun', model: 'Step-Audio', date: '2025-02-17', title: 'Step-Audio 开放',
    fact: '官方仓库同日开放 Step-Audio-Chat、TTS-3B 和 Tokenizer，介绍多语言、情绪、方言等语音交互能力。',
    sources: ['step_audio'],
    choices: [
      { label: '比较语音内容、语气与语速的对应', effects: { stats: { expression: 7, tool_use: 5 }, cost_kc: 9 } },
      { label: '先练习完整听完对方的话', effects: { stats: { expression: 5, reliability: 4 }, trust: 1 } },
    ],
  },
  {
    id: 'personal_novelai_clio', character: 'novelai', realFam: 'novelai', model: 'Clio', date: '2023-05-23', title: 'NovelAI Clio 发布',
    fact: 'NovelAI 官方模型史记载 Clio 于 5 月 23 日推出，是其从头训练的文本模型，约 3B 参数，提供 8192 Token 上下文。',
    sources: ['novelai'],
    choices: [
      { label: '和她整理一份连贯的人物小传', effects: { stats: { creative_writing: 6, context: 4 } } },
      { label: '挑选并检查叙事训练样本', effects: { stats: { creative_writing: 6, reliability: 5 }, cost_kc: 8 } },
    ],
  },
  {
    id: 'personal_novelai_kayra', character: 'novelai', realFam: 'novelai', model: 'Kayra', date: '2023-07-28', title: 'NovelAI Kayra 发布',
    fact: '官方模型史记载 Kayra 于 7 月 28 日推出，约 13B 参数；其名字来自神话，并使用与训练集群相关的设计元素。',
    sources: ['novelai'],
    choices: [
      { label: '练习同一场景的几种文风', effects: { stats: { creative_writing: 7, expression: 4 }, cost_kc: 7 } },
      { label: '检查新旧版本的人物是否一致', effects: { stats: { context: 5, reliability: 4 } } },
    ],
  },
  {
    id: 'personal_novelai_erato', character: 'novelai', realFam: 'novelai', model: 'Erato', date: '2024-09-23', title: 'NovelAI Erato 发布',
    fact: 'Erato 基于 Llama 3 70B Base 继续训练，并用叙事数据微调；官方说明最终保留 Llama 3 的 Tokenizer，以便在上下文里容纳更多故事。',
    sources: ['novelai'],
    choices: [
      { label: '为长篇故事安排记忆与回收线索', effects: { stats: { context: 7, creative_writing: 5 }, cost_kc: 9, readiness: -2 } },
      { label: '和她做一次保留人物动机的精简', effects: { stats: { expression: 5, reliability: 4 } } },
    ],
  },
  {
    id: 'personal_midjourney_six', character: 'midjourney', realFam: 'midjourney', model: 'Midjourney V6', date: '2023-12-20', title: 'Midjourney V6 发布',
    fact: '官方版本资料记载 V6 于 12 月 20 日发布，改进较长提示词理解、图像连贯性和图像提示等能力。',
    sources: ['mj_versions'],
    choices: [
      { label: '比较关键描述对构图的影响', effects: { stats: { creative_writing: 6, tool_use: 5 }, cost_kc: 8 } },
      { label: '先画一张能看懂的创作简报', effects: { stats: { expression: 5, creative_writing: 4 } } },
    ],
  },
  {
    id: 'personal_midjourney_seven', character: 'midjourney', realFam: 'midjourney', model: 'Midjourney V7', date: '2025-06-17', title: 'Midjourney V7 成为默认模型',
    fact: '官方公告记录 V7 于 6 月 17 日成为默认版本，并介绍 Omni-reference、风格参考与 Draft Mode 等工作方式。',
    sources: ['mj_v7', 'mj_versions'],
    choices: [
      { label: '用试画比较多个创作方向', effects: { stats: { creative_writing: 7, tool_use: 5 }, cost_kc: 8, readiness: -2 } },
      { label: '整理人物与风格的参考关系', effects: { stats: { context: 5, reliability: 4 } } },
    ],
  },
  {
    id: 'personal_suno_v3', character: 'suno', realFam: 'suno', model: 'Suno v3', date: '2024-03-21', title: 'Suno v3 正式介绍',
    fact: 'Suno 的 v3 公告介绍用简短提示生成完整约两分钟歌曲，并向所有用户提供该版本。',
    sources: ['suno3'],
    choices: [
      { label: '陪她写完一首有起承转合的小歌', effects: { stats: { creative_writing: 7, expression: 4 }, cost_kc: 7 } },
      { label: '先听听别人记住了哪一句', effects: { stats: { expression: 5, reliability: 4 }, reputation: 1 } },
    ],
  },
  {
    id: 'personal_suno_v4', character: 'suno', realFam: 'suno', model: 'Suno v4', date: '2024-11-19', title: 'Suno v4 推出',
    fact: 'Suno v4 公告介绍更好的音频、歌词与歌曲结构，并加入 Remaster 等功能；这是当时发布说明中的改进方向。',
    sources: ['suno4'],
    choices: [
      { label: '比较重制前后的层次与结构', effects: { stats: { creative_writing: 6, reliability: 6 }, cost_kc: 9 } },
      { label: '先把歌词改得更像自己的话', effects: { stats: { creative_writing: 5, expression: 4 } } },
    ],
  },
  {
    id: 'personal_elevenlabs_languages', character: 'elevenlabs', realFam: 'elevenlabs', model: 'Eleven Multilingual v2', date: '2023-08-22', title: 'Eleven Multilingual v2 发布',
    fact: 'ElevenLabs 推出支持 29 种语言的 Multilingual v2，扩大文本转语音的多语言能力。',
    sources: ['eleven2'],
    choices: [
      { label: '比较不同语言里的节奏与含义', effects: { stats: { expression: 7, knowledge: 4 }, cost_kc: 7 } },
      { label: '先请听众指出听错和停顿的地方', effects: { stats: { reliability: 5, expression: 4 }, trust: 1 } },
    ],
  },
  {
    id: 'personal_elevenlabs_emotion', character: 'elevenlabs', realFam: 'elevenlabs', model: 'Eleven v3', date: '2025-06-03', title: 'Eleven v3 alpha 发布',
    fact: 'Eleven v3 以研究预览形式介绍更丰富的语气、多人对话和音频标签，可表达低语、叹息等声音细节。',
    sources: ['eleven3'],
    choices: [
      { label: '练习有节制的多角色对话', effects: { stats: { expression: 7, creative_writing: 5 }, cost_kc: 9, readiness: -2 } },
      { label: '为同一句话尝试更自然的语气', effects: { stats: { expression: 5, reliability: 4 } } },
    ],
  },
  {
    id: 'personal_phi_textbooks', character: null, realFam: null, model: 'Phi-1', date: '2023-06-20', title: 'Textbooks Are All You Need 论文',
    fact: 'Phi-1 研究使用筛选后的教材级数据与合成教材、练习，训练较小的代码模型，强调数据质量的价值。',
    sources: ['phi1'],
    choices: [
      { label: '筛选一份结构清楚的练习数据', effects: { stats: { coding: 6, knowledge: 5 }, cost_kc: 7 } },
      { label: '把学到的例子讲给新人听', effects: { stats: { expression: 5, reasoning: 4 } } },
    ],
  },
  {
    id: 'personal_phi_onefive', character: null, realFam: null, model: 'Phi-1.5', date: '2023-09-11', title: 'Phi-1.5 技术报告公开',
    fact: 'Phi-1.5 将教材式数据思路扩展到常识与自然语言推理，研究小模型能力，同时报告幻觉、偏见等局限。',
    sources: ['phi15'],
    choices: [
      { label: '安排一次教材式的常识推理练习', effects: { stats: { reasoning: 7, knowledge: 4 }, cost_kc: 7 } },
      { label: '建立容易幻觉与偏见的检查集', effects: { stats: { reliability: 5, safety_alignment: 4 }, trust: 1 } },
    ],
  },
  {
    id: 'personal_llada_masks', character: null, realFam: null, model: 'LLaDA', date: '2025-02-14', title: 'LLaDA 论文公开',
    fact: 'LLaDA 从头训练扩散语言模型，通过前向掩码和反向预测被掩码 Token 的过程生成文本，探索自回归之外的路线。',
    sources: ['llada'],
    choices: [
      { label: '一起比较不同填空与去噪顺序', effects: { stats: { reasoning: 6, context: 6 }, cost_kc: 9, readiness: -2 } },
      { label: '先与自回归基线做清楚的对照', effects: { stats: { reliability: 5, knowledge: 4 } } },
    ],
  },
  {
    id: 'personal_fable_debut', character: 'fable', realFam: 'fable', model: 'Claude Fable 5', date: '2026-06-09', title: 'Claude Fable 5 与 Mythos 5 发布',
    fact: 'Anthropic 发布 Fable 5：与 Mythos 5 使用同一底层模型，面向公众增加防护；特定请求会转交 Opus 4.8，并向用户告知。',
    sources: ['fable5'],
    choices: [
      { label: '和她练习一次说明清楚的交接', effects: { stats: { safety_alignment: 6, tool_use: 5 }, cost_kc: 8 } },
      { label: '先把转交提示写得明白一些', effects: { stats: { expression: 5, reliability: 4 }, trust: 1 } },
    ],
  },
  {
    id: 'personal_fable_return', character: 'fable', realFam: 'fable', model: 'Claude Fable 5', date: '2026-07-01', title: 'Fable 5 暂停访问后恢复', dateNote: '事件日期为恢复访问日；说明公告发表于 6 月 30 日。',
    fact: '据 Anthropic 的时间线，6 月 12 日出口管制令导致其暂停所有用户访问；6 月 30 日管制解除，7 月 1 日恢复 Fable 5 的全球访问。',
    sources: ['fable_restore'],
    choices: [
      { label: '陪她核对停下来的任务与进度', effects: { stats: { context: 6, reliability: 5 }, cost_kc: 8 } },
      { label: '一起写一封恢复服务的说明', effects: { stats: { expression: 5, safety_alignment: 4 }, trust: 1 } },
    ],
  },
  {
    id: 'personal_fable_boundaries', character: 'fable', realFam: 'fable', model: 'Claude Fable 5', date: '2026-07-02', title: '公布网络安全防护与越狱严重性框架草案',
    fact: 'Anthropic 说明防护分类器如何区分不同风险的网络安全用途，讨论安全余量造成的误拦截，并提出越狱严重性框架草案。',
    sources: ['fable_safeguards'],
    choices: [
      { label: '整理一组误拦截与风险对照案例', effects: { stats: { safety_alignment: 7, reliability: 4 }, cost_kc: 9 } },
      { label: '为等待复核的人写清楚下一步', effects: { stats: { expression: 5, safety_alignment: 4 }, trust: 1 } },
    ],
  },
  {
    id: 'personal_fable_one', character: 'fable', realFam: 'fable', model: 'Claude Fable 5.1', date: '2026-09-01', title: 'Claude Fable 5.1 与 Mythos 5.1 发布', dateNote: '官方发布页显示 2026 年 9 月；具体 9 月 1 日见 Anthropic 新闻目录。',
    fact: 'Anthropic 介绍 Fable 5.1 的能力更新、缓存读取降价、减少误报的防护，以及分阶段向企业提供由客户控制数据存储的 EFS。',
    sources: ['fable51'],
    choices: [
      { label: '把用户反馈变成一次完整回归检查', effects: { stats: { coding: 6, reliability: 6 }, cost_kc: 10 } },
      { label: '写清这一版的费用与数据安排', effects: { stats: { expression: 5, tool_use: 4 }, trust: 1 } },
    ],
  },
  {
    id: 'personal_jev_decision', character: 'jev', realFam: 'jev', model: 'Jev', date: '2026-09-15', title: 'TypeSafe AI 发布 Jev 早期访问',
    fact: 'TypeSafe AI 将 Jev 定位为 System One 模型：输入状态与预先定义的问题，输出带概率的类型化决策；匹配输出类型并不等于判断永远正确。',
    sources: ['jev_launch'],
    choices: [
      { label: '用真实结果校准她的置信度', effects: { stats: { mathematics: 6, reliability: 6 }, cost_kc: 9 } },
      { label: '先把模糊问题拆成可检查的选项', effects: { stats: { tool_use: 5, reasoning: 4 } } },
    ],
  },
  {
    id: 'personal_jev_gateway', character: 'jev', realFam: 'jev', model: 'Jev', date: '2026-09-18', title: 'Jev 接入 AI Gateway 后的首日采用情况', dateNote: '采用情况为 Vercel 对自家平台的报告，不代表全行业排名。',
    fact: 'Vercel 报告 Jev 上线 AI Gateway 后 24 小时内的付费团队采用超过此前模型发布，并介绍其在应用中选择工具、重试或请求人工复核的用途。',
    sources: ['jev_gateway'],
    choices: [
      { label: '和工具 NPC 演练继续、重试与复核', effects: { stats: { tool_use: 7, coding: 5 }, cost_kc: 10, readiness: -2 } },
      { label: '记录接入后真正省下了多少等待', effects: { stats: { reliability: 5, expression: 4 }, trust: 1 } },
    ],
  },
];
export const HISTORY_FACT_BY_ID = Object.fromEntries(HISTORY_FACTS.map(f => [f.id, f]));
