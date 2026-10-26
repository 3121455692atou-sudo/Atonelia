// 历史时刻改成“里程碑”：不再到了真实日期就弹，也不绑定某一家公司。
// - first：行业第一次（第一个推理模型、第一个开源推理模型……）。谁先做到算谁的：可能是玩家，也可能是按真实时间线发布的别家。
//   玩家先做到，弹“你们做到了”；别家先做到，弹“某某做到了”，玩家可以选择照着学、蒸馏或者先不跟。
// - self：自家的里程碑（第一次开源、第一个代码模型……），只有玩家自己做到时才出现，早做早出现，没做到就一直不出现。
// hist：对应的真实史实（history_facts.js），用来展示“现实里是谁、什么时候做到的”和选项效果。
// real：现实对照和 hist 不是同一件事时另写（{ fam, model, date, title, text, src }）；写 false 表示不放“现实中”那一行。
// world：同一件事的行业大事；别家做到时用那段短剧，行业大事本身不再单独弹窗。
// mods：对所有模态都有效的里程碑（ms_first_sota）写全四个模态；mod 只是史实换算选项效果时用的那个。
// choices：自己写死的选项（不用史实的选项），效果走 applyEffects。subject: 'sota' 表示卡片上的 {model} 是第一枚算数标签的那款。
//
// 条件写成数据，由 sim/milestones.js 判断（规格 E2）：
//   player = { on, ...cond }：on 是钩子（release 发布、tech 研究完成、paper 公开技术报告、month 月结、rival 对手发布、
//     reopen 按路线开放旧代权重那天（B5），可以写成数组；看开放权重的里程碑都挂上 reopen）；
//     其余的键就是统一条件 cond（sim/cond.js），本次发布的模型写在 model 里（{ model: { open: true, gap: 4 } }）。
//     只属于某个钩子的键：tech、first（on: 'tech'，研究完成的是哪项、是不是首创）；papers（on: 'paper'，公开的技术里有其中一项）。
//     里程碑自己的两个键（cond 里没有）：beatLastYear（这一版不弱于一年前的世界最强）、lenient（对话产品在线、内容尺度宽松）。
//   rival：别家发布满足什么条件算做到，按发布变为可见的那一天判断：
//     open、cls、tag（都要有）、anyTag（有一个就行）、reasoning（带 R 标签）、atLeast { name, d }（原始综合分不低于这款真实型号 − d）、
//     gap（离当天世界最强不超过几分）、dims（各维不低于）、closeToTop（离当天最好的闭源不超过几分）。
//   rivalTech：别家公开了这项技术（论文或开源）算做到。
//   after：只在那个“行业第一次”被别家抢先之后才出现；needMine：要先自己拿下那个里程碑。
// 门槛一律写成相对的（atLeast 真实型号、gap 离世界最强、rank 世界排名）或看对手的标签（C 百万上下文、T 万亿参数、E MoE、R 推理、LP/LR 可商用许可），
// 不写绝对的综合分，也不写日期：没有玩家干预时，每个“行业第一次”都归现实里做到的那家（tests/career/milestones.test.mjs）。
export const MILESTONES = [
  // ---------- 所有模态（排在最前：同一次满足的自家里程碑里先弹它）----------
  // 开局以后第一次炼出 SOTA（规格 E4、D10）：拿到第一枚算数标签的那天（发布、挡住挑战的对手发布日）弹，被同一钩子里更要紧的卡挤掉时下个月结补弹。
  // 开局就是 ★ 的公司（开局前炼出过）永远不弹。这是自家的事，不放“现实中”那一行；hist 只给文案生成当参考。
  { id: 'ms_first_sota', mod: 'llm', mods: ['llm', 'image', 'music', 'speech'], type: 'self', hist: 'personal_gpt_four', real: false, subject: 'sota', title: '第一次炼出 SOTA',
    player: { on: ['release', 'month', 'rival'], sotaMade: 'first' },
    choices: [{ id: 'ok', label: '把今天记下来，接着干', effects: { know: 20 } }] },
  // ---------- 语言模型 · 行业第一次 ----------
  { id: 'ms_open_research', mod: 'llm', type: 'first', hist: 'personal_llama_research', title: '开放研究权重的大模型',
    player: { on: ['release', 'reopen'], model: { open: true, minTotal: 30, atLeast: { name: 'LLaMA 65B', d: 0.5 } } },
    rival: { open: true, cls: ['mid', 'large', 'frontier'], atLeast: { name: 'LLaMA 65B', d: 0.5 } } },
  { id: 'ms_gpt4', mod: 'llm', type: 'first', hist: 'personal_gpt_four', world: 'w_gpt4', title: '第一个 GPT-4 级模型',
    player: { on: 'release', model: { role: 'flagship', atLeast: { name: 'GPT-4', d: 0.5 } } }, rival: { atLeast: { name: 'GPT-4', d: 0.5 } } },
  { id: 'ms_open_commercial', mod: 'llm', type: 'first', hist: 'personal_llama_two', world: 'w_llama2', title: '第一个可商用的强开源模型',
    player: { on: ['release', 'reopen'], model: { open: true, atLeast: { name: 'Llama 2 70B', d: 0.5 } } },
    rival: { open: true, anyTag: ['LP', 'LR'], atLeast: { name: 'Llama 2 70B', d: 0.5 } } },
  { id: 'ms_textbook', mod: 'llm', type: 'first', hist: 'personal_phi_textbooks', tech: 'textbook', title: '教科书级合成数据',
    player: { on: 'tech', tech: 'textbook', first: true }, rivalTech: 'textbook' },
  { id: 'ms_small_strong', mod: 'llm', type: 'first', hist: 'personal_mistral_seven', title: '小而强的开源模型',
    player: { on: ['release', 'reopen'], model: { open: true, maxTotal: 15, atLeast: { name: 'Mistral 7B', d: 0.5 } } },
    rival: { open: true, cls: ['small'], atLeast: { name: 'Mistral 7B', d: 0.5 } } },
  { id: 'ms_moe_open', mod: 'llm', type: 'first', hist: 'personal_mistral_experts', tech: 'moe', title: '开源稀疏专家模型',
    player: { on: ['release', 'reopen'], model: { open: true, arch: ['moe'] } }, rival: { open: true, tag: 'E' } },
  { id: 'ms_grpo', mod: 'llm', type: 'first', hist: 'personal_deepseek_math', tech: 'grpo', title: '省显存的强化学习算法',
    player: { on: 'tech', tech: 'grpo', first: true }, rivalTech: 'grpo' },
  { id: 'ms_million_ctx', mod: 'llm', type: 'first', hist: 'personal_gemini_context', tech: 'long_ctx', title: '第一个百万 token 上下文模型',
    player: { on: 'release', model: { role: 'flagship', techs: ['long_ctx'], gap: 3 } }, rival: { tag: 'C' } },
  { id: 'ms_mla', mod: 'llm', type: 'first', hist: 'personal_deepseek_pro_v2', tech: 'mla', title: '把 KV 缓存压到很小的注意力',
    player: { on: 'tech', tech: 'mla', first: true }, rivalTech: 'mla' },
  { id: 'ms_open_frontier', mod: 'llm', type: 'first', hist: 'personal_llama_herd', title: '开源模型追近闭源前沿',
    player: { on: ['release', 'reopen'], model: { open: true, atLeast: { name: 'Llama 3.1 405B', d: 0.5 } } },
    rival: { open: true, atLeast: { name: 'Llama 3.1 405B', d: 0.5 } } },
  { id: 'ms_reasoning', mod: 'llm', type: 'first', hist: 'personal_gpt_o1', world: 'w_o1', tech: 'reasoning', title: '第一个推理模型',
    player: { on: 'release', model: { reasoning: true, dims: { math: 80 } } }, rival: { reasoning: true } },
  { id: 'ms_computer', mod: 'llm', type: 'first', hist: 'personal_claude_computer', world: 'w_computer_use', tech: 'computer_use', title: '第一个会操作电脑的模型',
    player: { on: 'release', model: { techs: ['computer_use'], dims: { agent: 50 } } }, rival: { dims: { agent: 55 } } },
  { id: 'ms_fp8', mod: 'llm', type: 'first', hist: 'personal_deepseek_pro_v3', tech: 'fp8', title: '大规模 FP8 训练',
    player: { on: 'tech', tech: 'fp8', first: true }, rivalTech: 'fp8' },
  // 第一个开源推理模型：现实里是 QwQ-32B-Preview（规格 0.2 第 5 条）。选项沿用 R1 那段史实的（都是给推理模型的练法），现实对照另写。
  { id: 'ms_open_reasoning', mod: 'llm', type: 'first', hist: 'personal_deepseek_r1', tech: 'reasoning', title: '第一个开源推理模型',
    real: { fam: 'qwen', model: 'QwQ-32B-Preview', date: '2024-11-28', title: 'QwQ-32B-Preview 开放权重',
      text: '千问团队开放 QwQ-32B-Preview 的权重：一个会先长篇思考、再给答案的 32B 模型，数学和代码题明显变强，是第一个开放权重的推理模型。',
      src: { title: 'QwQ: Reflect Deeply on the Boundaries of the Unknown', url: 'https://qwenlm.github.io/blog/qwq-32b-preview/' } },
    player: { on: ['release', 'reopen'], model: { open: true, reasoning: true, dims: { math: 80 } } }, rival: { open: true, reasoning: true } },
  // 开源推理模型追近前沿（离世界最强不超过 4 分）：现实里是 DeepSeek-R1；R1 的授名和专属事件只看这一条（规格 0.2 第 5 条、C3、C4）。
  { id: 'ms_open_reasoning_frontier', mod: 'llm', type: 'first', hist: 'personal_deepseek_r1', world: 'w_r1', tech: 'reasoning', title: '开源推理模型追近前沿',
    player: { on: ['release', 'reopen'], model: { open: true, reasoning: true, gap: 4 } }, rival: { open: true, reasoning: true, gap: 4 } },
  { id: 'ms_linear', mod: 'llm', type: 'first', hist: 'personal_minimax_long', tech: 'linear_attn', title: '线性注意力进了大模型',
    player: { on: 'tech', tech: 'linear_attn', first: true }, rivalTech: 'linear_attn' },
  { id: 'ms_trillion_open', mod: 'llm', type: 'first', hist: 'personal_kimi_k2', title: '第一个开源万亿参数模型',
    player: { on: ['release', 'reopen'], model: { open: true, minTotal: 1000 } }, rival: { open: true, tag: 'T' } },
  // ---------- 语言模型 · 别人先做到以后，自己第一次做到 ----------
  { id: 'ms_reasoning_follow', mod: 'llm', type: 'self', after: 'ms_reasoning', hist: 'personal_seed_thinking', title: '我们的第一个推理模型',
    player: { on: 'release', model: { reasoning: true, dims: { math: 80 } } } },
  { id: 'ms_reasoning_paper', mod: 'llm', type: 'self', hist: 'personal_kimi_k15', title: '公开推理模型的训练方法',
    player: { on: 'paper', papers: ['reasoning', 'grpo'] } },
  { id: 'ms_computer_follow', mod: 'llm', type: 'self', after: 'ms_computer', hist: 'personal_seed_vision', title: '让模型看懂屏幕',
    player: { on: 'release', model: { techs: ['computer_use'], dims: { agent: 50 } } } },
  // ---------- 语言模型 · 自家里程碑 ----------
  { id: 'ms_staged_open', mod: 'llm', type: 'self', hist: 'personal_gpt_staged', title: '第一次开源权重',
    player: { on: ['release', 'reopen'], model: { open: true } } },
  { id: 'ms_local', mod: 'llm', type: 'self', hist: 'personal_glm_desktop', title: '能在家用显卡上跑的模型',
    player: { on: ['release', 'reopen'], model: { open: true, maxTotal: 10 } } },
  { id: 'ms_family', mod: 'llm', type: 'self', hist: 'personal_qwen_family', title: '一整个开源模型家族',
    player: { on: 'release', any: [{ smallLive: { exists: true } }, { model: { role: 'small' } }], released: { open: true, count: 2 } } },
  { id: 'ms_family3', mod: 'llm', type: 'self', hist: 'personal_claude_trio', title: '主副线模型阵容',
    player: { on: 'release', any: [{ smallLive: { exists: true } }, { model: { role: 'small' } }], released: { count: 3 }, model: { gap: 5 } } },
  { id: 'ms_top3', mod: 'llm', type: 'self', hist: 'personal_gemini_debut', title: '冲进第一梯队',
    player: { on: 'release', model: { role: 'flagship', rank: 3 } } },
  { id: 'ms_lite_moe', mod: 'llm', type: 'self', hist: 'personal_deepseek_lite', title: '副线稀疏专家模型',
    player: { on: 'release', model: { role: 'small', arch: ['moe'] } } },
  { id: 'ms_fast_small', mod: 'llm', type: 'self', hist: 'personal_gemini_flash', title: '副线模型接近前沿',
    player: { on: 'release', model: { role: 'small', gap: 10 } } },
  { id: 'ms_flash_catchup', mod: 'llm', type: 'self', hist: 'personal_deepseek_flash', title: '副线追上去年前沿',
    player: { on: 'release', model: { role: 'small' }, beatLastYear: true } },
  { id: 'ms_coder', mod: 'llm', type: 'self', hist: 'personal_qwen_coder', title: '专门的代码模型',
    player: { on: 'release', model: { dims: { code: 78 } } } },
  { id: 'ms_editor', mod: 'llm', type: 'self', hist: 'personal_mistral_code', title: '代码补全进了编辑器',
    player: { on: 'month', integrations: 1, live: { dims: { code: 70 } } } },
  { id: 'ms_multilingual', mod: 'llm', type: 'self', hist: 'personal_qwen_languages', title: '多语言大更新',
    player: { on: ['release', 'reopen'], model: { open: true, dims: { knowledge: 80 } } } },
  { id: 'ms_arc', mod: 'llm', type: 'self', hist: 'personal_glm_arc', title: '推理、代码、Agent 全能型',
    player: { on: 'release', model: { dims: { code: 85, math: 85, agent: 75 } } } },
  { id: 'ms_tools_join', mod: 'llm', type: 'self', hist: 'personal_deepseek_pro_ga', title: '编程工具都来接入',
    player: { on: 'month', integrations: 3, live: { dims: { agent: 75 } } } },
  { id: 'ms_safety', mod: 'llm', type: 'self', hist: 'personal_claude_principles', title: '把原则写进训练',
    player: { on: 'release', model: { dims: { safety: 88 } } } },
  { id: 'ms_chat_hit', mod: 'llm', type: 'self', hist: 'personal_gpt_chat', title: '对话产品破圈',
    player: { on: 'month', users: 1e7 } },
  { id: 'ms_chat_100m', mod: 'llm', type: 'self', hist: 'personal_gpt_omni', title: '对话产品月活破亿',
    player: { on: 'month', users: 1e8 } },
  { id: 'ms_personality', mod: 'llm', type: 'self', hist: 'personal_grok_wit', title: '有个性的对话产品',
    player: { on: 'month', lenient: true, users: 1e6 } },
  { id: 'ms_big_base', mod: 'llm', type: 'self', hist: 'personal_grok_open', title: '开放超大基座权重',
    player: { on: ['release', 'reopen'], model: { open: true, minTotal: 300 } } },
  { id: 'ms_open_moe_large', mod: 'llm', type: 'self', hist: 'personal_hunyuan_large', title: '开源大型 MoE',
    player: { on: ['release', 'reopen'], model: { open: true, arch: ['moe'], minTotal: 200 } } },
  { id: 'ms_rnn', mod: 'llm', type: 'self', hist: 'personal_rwkv_rnn', title: '不用 Transformer 的大模型',
    player: { on: 'release', model: { arch: ['rnn'] } } },
  { id: 'ms_rnn_catchup', mod: 'llm', type: 'self', hist: 'personal_rwkv_goose', title: '循环架构追上来了',
    player: { on: 'release', model: { arch: ['rnn'], atLeast: { name: 'GPT-3.5（ChatGPT）', d: 0 } } } },
  { id: 'ms_knowledge', mod: 'llm', type: 'self', hist: 'personal_ernie_entities', title: '知识最扎实的模型',
    player: { on: 'release', model: { dims: { knowledge: 86 } } } },
  { id: 'ms_closed_to_open', mod: 'llm', type: 'self', hist: 'personal_ernie_open45', title: '闭源转开源',
    player: { on: ['release', 'reopen'], model: { open: true }, released: { open: false, count: 2 } } },
  { id: 'ms_long_reasoning_open', mod: 'llm', type: 'self', hist: 'personal_minimax_m1', title: '开源长上下文推理模型',
    player: { on: ['release', 'reopen'], model: { open: true, techs: ['reasoning', 'linear_attn'] } } },
  { id: 'ms_on_shoulders', mod: 'llm', type: 'self', hist: 'personal_perplexity_sonar', title: '站在开源模型的肩膀上',
    player: { on: 'release', model: { teacher: true }, not: { model: { teacher: 'self' } } } },
  { id: 'ms_deep_research', mod: 'llm', type: 'self', hist: 'personal_perplexity_research', title: '深度研究产品',
    player: { on: 'month', users: 1e6, live: { dims: { agent: 70 } }, techs: ['func_call'] } },
  { id: 'ms_from_scratch', mod: 'llm', type: 'self', hist: 'personal_novelai_clio', title: '从零训练的小模型',
    player: { on: 'release', model: { maxTotal: 15, teacher: false, dims: { writing: 55 } } } },
  { id: 'ms_writer', mod: 'llm', type: 'self', hist: 'personal_novelai_kayra', title: '写作最好的模型',
    player: { on: 'release', model: { dims: { writing: 82 } } } },
  { id: 'ms_writer_top', mod: 'llm', type: 'self', hist: 'personal_novelai_erato', title: '写作再上一个台阶',
    player: { on: 'release', model: { dims: { writing: 88 } } } },
  { id: 'ms_small_reasoner', mod: 'llm', type: 'self', hist: 'personal_phi_onefive', title: '小模型也会推理',
    player: { on: 'release', model: { maxTotal: 15, techs: ['textbook'], dims: { math: 60 } } } },
  { id: 'ms_strong_safe', mod: 'llm', type: 'self', hist: 'personal_fable_debut', title: '能力最强、防护最严',
    player: { on: 'release', model: { rank: 1, dims: { safety: 92 } } } },
  { id: 'ms_safeguards', mod: 'llm', type: 'self', hist: 'personal_fable_boundaries', title: '公开安全防护框架',
    player: { on: 'release', model: { dims: { safety: 90, agent: 88 } } } },
  { id: 'ms_frontier_point', mod: 'llm', type: 'self', needMine: 'ms_strong_safe', hist: 'personal_fable_one', title: '旗舰小版本迭代',
    player: { on: 'release', model: { role: 'flagship', rank: 1 } } },
  { id: 'ms_decider', mod: 'llm', type: 'self', hist: 'personal_jev_decision', title: '只输出决策的副线模型',
    player: { on: 'release', model: { role: 'small', dims: { agent: 70, safety: 80 } } } },
  { id: 'ms_gateway', mod: 'llm', type: 'self', hist: 'personal_jev_gateway', title: '上线第一天就被大量接入',
    player: { on: 'month', integrations: 2, smallLive: { exists: true } } },
  { id: 'ms_open_suite', mod: 'llm', type: 'self', hist: 'personal_stepfun_audio', title: '开源一整套周边模型',
    player: { on: 'release', released: { open: true, count: 3 } } },
  // ---------- 图像 ----------
  { id: 'ms_first_image', mod: 'image', type: 'self', hist: 'personal_image2_latents', title: '第一个能用的生图模型',
    player: { on: 'release', model: { atLeast: { name: 'Midjourney V4', d: 0 } } } },
  { id: 'ms_text_image', mod: 'image', type: 'first', hist: 'personal_image2_letters', tech: 'ar_image', title: '会写字的生图模型',
    player: { on: 'release', model: { dims: { text: 85 } } }, rival: { dims: { text: 85 } } },
  { id: 'ms_long_prompt', mod: 'image', type: 'self', hist: 'personal_midjourney_six', title: '长提示词也能画对',
    player: { on: 'release', model: { dims: { adherence: 66 } } } },
  { id: 'ms_aesthetics', mod: 'image', type: 'self', hist: 'personal_midjourney_seven', title: '审美封顶',
    player: { on: 'release', model: { dims: { aesthetics: 92 } } } },
  // ---------- 音乐 ----------
  { id: 'ms_full_song', mod: 'music', type: 'first', hist: 'personal_suno_v3', title: '第一首完整的 AI 歌曲',
    player: { on: 'release', model: { dims: { composition: 65, vocals: 60 } } }, rival: { dims: { composition: 65, vocals: 60 } } },
  { id: 'ms_studio', mod: 'music', type: 'self', hist: 'personal_suno_v4', title: '音质追上录音棚',
    player: { on: 'release', model: { dims: { fidelity: 75 } } } },
  // ---------- 语音 ----------
  { id: 'ms_many_langs', mod: 'speech', type: 'self', hist: 'personal_elevenlabs_languages', title: '一个声音说几十种语言',
    player: { on: 'release', model: { dims: { multilingual: 75 } } } },
  { id: 'ms_emotion', mod: 'speech', type: 'self', hist: 'personal_elevenlabs_emotion', title: '会叹气会耳语的声音',
    player: { on: 'release', model: { dims: { expressive: 85 } } } },
];
export const MS_BY_ID = Object.fromEntries(MILESTONES.map(m => [m.id, m]));
// 这个里程碑对哪些模态有效。
export const msMods = ms => ms.mods || [ms.mod];
