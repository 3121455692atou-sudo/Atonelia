import { CAPABILITY_KEYS, CAPABILITY_LABELS, SPECIALIST_STAT_KEYS } from './model_capabilities.js';
import { ROSTER_MODEL_PROFILES } from './catalog_characters.js';
/**
 * 模型育成计划：下一版 (Model Raising Plan: Next)
 * 核心数据目录 — catalog_core.js
 *
 * 本文件是整个游戏的“单一事实来源”（Single Source of Truth）：
 * 数值平衡规则、开局档案、训练配方、架构模板、历史谱系、
 * 支援卡与技能，全部在这里定义，其它模块只读取、不复制。
 *
 * 版本: v0.1.0
 * 知识截止标注: 2026-10-19
 *
 * 约束：
 *  - 所有 weights / stat_cap_bonuses / initial_stats 的键必须来自 BALANCE_RULES.STAT_KEYS。
 *  - 所有 architecture_id 必须存在于 ARCHITECTURES。
 *  - 所有 required_objective 必须匹配某个 ARCHITECTURES.generation_objective。
 *  - 所有 starter 支援卡恰好 4 张，分别落在 4 个类别中的 3 个类别。
 */

export const BALANCE_RULES = {
  /* ---------- 属性系统 ---------- */
  STAT_KEYS: CAPABILITY_KEYS,

  STAT_LABELS: CAPABILITY_LABELS,

  /** 属性下限 */
  STAT_MIN: 0,
  /** 软上限：超过后增长收益递减 */
  STAT_SOFT_CAP: 100,
  /** 硬上限：任何加成都不能突破 */
  STAT_HARD_CAP: 140,

  /* ---------- 准备度与风险 ---------- */
  READINESS_MIN: 0,
  READINESS_MAX: 100,
  /** 低于该准备度直接拒绝开训 */
  READINESS_GATE: 25,
  RISK_MIN: 0,
  RISK_MAX: 0.65,
  /** 单次训练风险超过该值触发“事故判定” */
  RISK_ACCIDENT_THRESHOLD: 0.35,

  /* ---------- 时间尺度 ---------- */
  TURNS_PER_QUARTER: 6,
  TURNS_PER_SEASON: 24,
  CAMPAIGN_TURNS: 192,
  QUARTERS_PER_CAMPAIGN: 32,
  SEASONS_PER_CAMPAIGN: 8,
  CUP_TURNS_IN_SEASON: [6, 12, 18, 24],

  /* ---------- 备赛（准备阶段） ---------- */
  PREP_COST_KC: 8,
  PREP_READINESS_GAIN: 35,
  PREP_OPTIMIZER_GAIN: 10,
  PREP_OPS_CARD_BONUS: 10,

  /* ---------- 检查点开销 ---------- */
  CHECKPOINT_OVERHEAD_MAP: { 1: 1.04, 2: 1.02, 4: 1.01 },

  /* ---------- 训练模式 ---------- */
  MODE_FACTORS: { full: 1.0, lora: 0.72, qlora: 0.58 },

  /* ---------- 训练预设 ---------- */
  PRESET_FACTORS: {
    steady: { effort: 0.85, lr_fit: 0.96, risk_add: -0.015, label: '稳健' },
    balanced: { effort: 1.0, lr_fit: 1.0, risk_add: 0.0, label: '均衡' },
    push: { effort: 1.25, lr_fit: 1.08, risk_add: 0.08, label: '冲刺' }
  },

  /* ---------- 支援卡类别 ---------- */
  CARD_CATEGORY_LABELS: {
    researcher: '研究员',
    data_facility: '数据设施',
    eng_facility: '工程设施',
    community: '社区'
  },

  /** 同类别支援卡最多同时上阵数量 */
  CARD_CATEGORY_SLOT_CAP: 3,
  /** 开局同时上阵槽位 */
  CARD_SLOTS_START: 4,
  /** 满级同时上阵槽位 */
  CARD_SLOTS_MAX: 7
};

export const START_PROFILES = [
  {
    profile_id: 'small_startup',
    name: '小型创业实验室',
    cash_kc: 2400,
    cluster_compute_cu: 140,
    cluster_memory_gb: 96,
    payroll_kc_per_quarter: 80,
    overhead_kc_per_quarter: 30,
    default_history_id: 'qwen_ecosystem',
    sim_total_params_b: 4,
    sim_active_params_b: 4,
    architecture_id: 'ar_dense',
    weight_access: 'public_weights',
    training_authority: 'licensed_weights',
    release_policy: 'open_weights',
    difficulty_label: '入门',
    focus_stats: ['knowledge', 'expression'],
    description:
      '三个人、两台机器、一份开源许可。你手里没有秘密权重，只有公开语料和一点现金流。所有路线都必须靠“把每一卡算力花在刀刃上”来赢，任何一次昂贵的事故都可能直接让团队解散。'
  },
  {
    profile_id: 'diffusion_institute',
    name: '扩散研究所',
    cash_kc: 2800,
    cluster_compute_cu: 160,
    cluster_memory_gb: 128,
    payroll_kc_per_quarter: 95,
    overhead_kc_per_quarter: 35,
    default_history_id: 'llada_diffusion',
    sim_total_params_b: 8,
    sim_active_params_b: 8,
    architecture_id: 'masked_diffusion',
    weight_access: 'public_weights',
    training_authority: 'licensed_weights',
    release_policy: 'open_weights',
    difficulty_label: '进阶',
    focus_stats: ['expression', 'context'],
    description:
      '一群不满足于“从左到右”的人。你们相信生成可以是并行的迭代去噪，因此愿意用主流路线的效率换取一个新的生成目标。扩散语言模型的评测标准尚未定型，你既要做出效果，也要说服别人承认这个效果。'
  },
  {
    profile_id: 'frontier_internal_lab',
    name: '前沿内部实验室',
    cash_kc: 6500,
    cluster_compute_cu: 420,
    cluster_memory_gb: 640,
    payroll_kc_per_quarter: 220,
    overhead_kc_per_quarter: 90,
    default_history_id: 'gpt_reasoner',
    sim_total_params_b: 72,
    sim_active_params_b: 72,
    architecture_id: 'ar_dense',
    weight_access: 'closed',
    training_authority: 'parallel_lab_role',
    release_policy: 'closed_api',
    difficulty_label: '标准',
    focus_stats: ['reasoning', 'reliability'],
    description:
      '你不掌握原始权重，但你在同一范式下并行推进一条内部路线，拥有充足的算力与一份不能外泄的路线图。资源不是问题，问题是你做出来的东西必须经得起外部评测和内部合规的双重审视。'
  },
  {
    profile_id: 'moe_cluster_lab',
    name: 'MoE 集群实验室',
    cash_kc: 5200,
    cluster_compute_cu: 360,
    cluster_memory_gb: 512,
    payroll_kc_per_quarter: 180,
    overhead_kc_per_quarter: 75,
    default_history_id: 'deepseek_engineering',
    sim_total_params_b: 671,
    sim_active_params_b: 37,
    architecture_id: 'ar_moe',
    weight_access: 'public_weights',
    training_authority: 'licensed_weights',
    release_policy: 'open_weights',
    difficulty_label: '硬核',
    focus_stats: ['coding', 'reliability'],
    description:
      '总参数 671B，每 token 只激活 37B——你的账面很漂亮，显存账单很难看。专家路由随时可能塌缩成少数几个“劳模”，负载均衡的每一次抖动都会直接体现在训练曲线上。你必须在效率与稳定之间反复走钢丝。'
  }
];

export const TRAINING_RECIPES = [
  {
    recipe_id: 'sft',
    name: '监督微调',
    stream_label: '阶段一 · 指令对齐',
    format: 'instruction',
    base_compute_cu: 48,
    base_cost_kc: 16,
    base_gain: 26,
    base_risk: 0.02,
    readiness_cost: 12,
    uses_rl_group: false,
    required_objective: null,
    weights: {
      knowledge: 0.3,
      reasoning: 0.15,
      coding: 0.15,
      expression: 0.25,
      context: 0.05,
      reliability: 0.1
    },
    description:
      '用人工撰写或筛选过的指令-回答对做标准交叉熵训练。这是所有路线的地基：它不创造新能力，只是把基座模型已有的能力整理成可被调用的形状。',
    pros: ['风险极低，几乎不会破坏基座', '对“表达”和“格式遵循”提升最直接', '任何架构、任何模式都能跑'],
    cons: ['对“推理”与“代码”的提升有限', '数据质量决定上限，脏数据会被原样学会', '重复训练很快进入收益递减']
  },
  {
    recipe_id: 'verifiable_rl',
    name: '可验证强化学习',
    stream_label: '阶段三 · 可验证奖励',
    format: 'verified_tasks',
    base_compute_cu: 120,
    base_cost_kc: 44,
    base_gain: 34,
    base_risk: 0.05,
    readiness_cost: 18,
    uses_rl_group: true,
    required_objective: null,
    weights: {
      knowledge: 0.12,
      reasoning: 0.38,
      coding: 0.3,
      expression: 0.05,
      context: 0.05,
      reliability: 0.1
    },
    description:
      '用自动判定的任务（数学答案、单元测试、结构化输出校验）做奖励信号。奖励不需要人类打分，因此规模可以无限大，是推理能力最可靠的推进器。',
    pros: ['奖励客观，几乎不会对齐到人类偏见', '对推理与代码的提升效率最高', '可自动化扩样，边际成本低'],
    cons: ['只覆盖可判定领域，对开放写作无效', '容易被模型找到“钻空子”的捷径', '需要大量任务工程与沙箱设施']
  },
  {
    recipe_id: 'dpo',
    name: '偏好对齐（DPO）',
    stream_label: '阶段二 · 直接偏好优化',
    format: 'preference_pairs',
    base_compute_cu: 72,
    base_cost_kc: 26,
    base_gain: 28,
    base_risk: 0.035,
    readiness_cost: 14,
    uses_rl_group: false,
    required_objective: null,
    weights: {
      knowledge: 0.1,
      reasoning: 0.18,
      coding: 0.1,
      expression: 0.34,
      context: 0.06,
      reliability: 0.22
    },
    description:
      '直接用“更好的回答 / 更差的回答”成对数据优化策略，跳过奖励模型与在线采样。比 PPO 便宜一个数量级，是中小实验室最现实的偏好对齐手段。',
    pros: ['不需要奖励模型与在线采样，成本可控', '对表达与可靠性的提升稳定', '训练曲线平滑，不易崩溃'],
    cons: ['受限于离线偏好数据的分布', '无法探索数据之外的更优策略', '对数据标注的一致性非常敏感']
  },
  {
    recipe_id: 'rlhf_ppo',
    name: '人类反馈强化学习（RLHF / PPO）',
    stream_label: '阶段二 · 在线偏好',
    format: 'preference_pairs',
    base_compute_cu: 168,
    base_cost_kc: 62,
    base_gain: 40,
    base_risk: 0.09,
    readiness_cost: 24,
    uses_rl_group: true,
    required_objective: null,
    weights: {
      knowledge: 0.08,
      reasoning: 0.2,
      coding: 0.08,
      expression: 0.34,
      context: 0.06,
      reliability: 0.24
    },
    description:
      '先训练奖励模型，再用 PPO 在线采样优化策略。它能把“人喜欢什么”写进模型深处，也是历史上把聊天模型推向可用的关键一步，代价是四个模型同时驻留显存。',
    pros: ['上限最高，能学到离线数据里没有的偏好结构', '对表达与安全的提升幅度最大', '可以与可验证奖励叠加使用'],
    cons: ['显存与算力开销极大，小实验室难以承受', '奖励黑客与 KL 崩塌随时可能发生', '训练不稳定，需要频繁人工干预']
  },
  {
    recipe_id: 'rlaif',
    name: 'AI 反馈强化学习（RLAIF）',
    stream_label: '阶段二 · 合成偏好',
    format: 'preference_pairs',
    base_compute_cu: 132,
    base_cost_kc: 38,
    base_gain: 36,
    base_risk: 0.07,
    readiness_cost: 20,
    uses_rl_group: true,
    required_objective: null,
    weights: {
      knowledge: 0.14,
      reasoning: 0.26,
      coding: 0.12,
      expression: 0.24,
      context: 0.08,
      reliability: 0.16
    },
    description:
      '把标注员换成受约束的评判模型：用一份明文原则生成偏好判断，再用它做强化学习。标注成本骤降，代之以“评判者本身的偏差会被放大”的风险。',
    pros: ['偏好数据可以近乎无限生成', '原则可审计、可版本化', '在开放写作上比可验证奖励更有效'],
    cons: ['评判模型的偏差会系统性写入策略', '必须额外维护评判模型与一致性检查', '容易出现“越训越像评判者”的同质化']
  },
  {
    recipe_id: 'distillation',
    name: '能力蒸馏',
    stream_label: '阶段一 · 教师迁移',
    format: 'instruction',
    base_compute_cu: 56,
    base_cost_kc: 20,
    base_gain: 30,
    base_risk: 0.03,
    readiness_cost: 12,
    uses_rl_group: false,
    required_objective: null,
    weights: {
      knowledge: 0.22,
      reasoning: 0.22,
      coding: 0.18,
      expression: 0.18,
      context: 0.06,
      reliability: 0.14
    },
    description:
      '用一个更强的教师模型生成训练信号（答案、思维链或分布），让学生模型在更小规模上复现能力。对小实验室而言，这是唯一能“买到”推理能力的合法手段。',
    pros: ['小模型可以快速获得远超自身体量的推理表现', '不需要人类标注，成本随教师调用计费', '六个属性提升都很均衡，没有明显短板'],
    cons: ['能力上限被教师封顶，无法超越', '容易继承教师的坏习惯与错误', '教师服务的调用成本会随规模线性膨胀']
  },
  {
    recipe_id: 'cpt',
    name: '继续预训练（CPT）',
    stream_label: '阶段零 · 语料灌注',
    format: 'raw_text',
    base_compute_cu: 96,
    base_cost_kc: 30,
    base_gain: 32,
    base_risk: 0.04,
    readiness_cost: 16,
    uses_rl_group: false,
    required_objective: null,
    weights: {
      knowledge: 0.34,
      reasoning: 0.14,
      coding: 0.14,
      expression: 0.1,
      context: 0.2,
      reliability: 0.08
    },
    description:
      '在领域语料上继续做下一词预测，把新知识真正写进权重而不是塞进上下文。它是最慢、最贵、也最扎实的一种提升，通常决定了一条分支的知识天花板。',
    pros: ['唯一能真正扩充知识面的手段', '同时提升长程建模能力', '对后续所有训练阶段都有加成'],
    cons: ['算力消耗巨大，收敛周期长', '会触发灾难性遗忘，通用能力可能下滑', '数据配比需要反复试验，失败代价高']
  },
  {
    recipe_id: 'pure_rl',
    name: '纯强化学习',
    stream_label: '阶段三 · 零数据冷启动',
    format: 'verified_tasks',
    base_compute_cu: 190,
    base_cost_kc: 58,
    base_gain: 78,
    base_risk: 0.08,
    readiness_cost: 22,
    uses_rl_group: true,
    required_objective: null,
    weights: {
      knowledge: 0.05,
      reasoning: 0.42,
      coding: 0.31,
      expression: 0.02,
      context: 0.08,
      reliability: 0.12
    },
    description:
      '不喂任何人工写的长思维链，只在可验证任务上给奖励，让模型自己进化出思考长度与自我检查行为。收益极高，但训练动态难以预测，很容易“突然学会”也“突然失智”。',
    pros: ['单次训练收益是全表最高', '能长出数据里不存在的推理模式', '天然抑制奖励黑客（答案可验证）'],
    cons: ['表达与知识属性几乎不增长，偏科严重', '训练不稳定，长思考会导致输出冗长', '对任务集质量极度敏感，噪声会被放大']
  },
  {
    recipe_id: 'diffusion_sft',
    name: '扩散目标监督训练（扩散 SFT）',
    stream_label: '阶段一 · 去噪对齐',
    format: 'instruction',
    base_compute_cu: 88,
    base_cost_kc: 34,
    base_gain: 30,
    base_risk: 0.045,
    readiness_cost: 16,
    uses_rl_group: false,
    required_objective: 'masked_diffusion',
    weights: {
      knowledge: 0.2,
      reasoning: 0.2,
      coding: 0.14,
      expression: 0.22,
      context: 0.14,
      reliability: 0.1
    },
    description:
      '把监督信号写成“随机掩码后还原原文”，让模型学会在任意位置补全与改写。训练目标与自回归完全不同，因此不支持扩散目标的架构无法执行此配方。',
    pros: ['天然支持填空、改写与可控编辑', '并行去噪带来更高的吞吐利用率', '对表达与长程连贯性的提升明显'],
    cons: ['只能用于 masked_diffusion 生成目标', '无法直接复用自回归配方的超参数', '采样步数与质量的取舍需要单独调参']
  },
  {
    recipe_id: 'agent_traj',
    name: '智能体轨迹训练',
    stream_label: '阶段三 · 环境交互',
    format: 'trajectories',
    base_compute_cu: 104,
    base_cost_kc: 40,
    base_gain: 33,
    base_risk: 0.06,
    readiness_cost: 18,
    uses_rl_group: false,
    required_objective: null,
    weights: {
      knowledge: 0.1,
      reasoning: 0.22,
      coding: 0.24,
      expression: 0.1,
      context: 0.2,
      reliability: 0.14
    },
    description:
      '采集模型在真实或仿真环境中的多步交互轨迹（思考 → 调用工具 → 观察 → 修正），再对这些轨迹做监督训练。它把模型从“会答题”推向“会办事”。',
    pros: ['显著提升多步任务的成功率', '同时锻炼长程与代码能力', '轨迹数据可以持续从线上回流'],
    cons: ['环境搭建与沙箱成本高', '错误轨迹会被一并学会，需要严格过滤', '单条轨迹的边际信息量低于单条指令']
  }
];

export const ARCHITECTURES = [
  {
    architecture_id: 'ar_dense',
    name: '自回归稠密 Transformer',
    sequence_core: 'transformer_dense',
    expert_mode: 'none',
    generation_objective: 'autoregressive_next_token',
    compute_multiplier: 1.0,
    memory_multiplier: 1.0,
    stat_cap_bonuses: { knowledge: 0, reasoning: 0, coding: 0, expression: 0, context: 0, reliability: 0 },
    pros: ['工具链最成熟，任何配方都能直接跑', '训练动态可预测，调参经验可复用', '算力与显存开销无隐藏成本'],
    cons: ['没有结构性优势，只能靠数据与规模取胜', '上下文长度增长时推理开销二次方上升', '面对稀疏与递归架构时性价比会落后'],
    unlocked_by_default: true,
    unlock_hint: null
  },
  {
    architecture_id: 'ar_moe',
    name: '自回归稀疏专家（MoE）',
    sequence_core: 'transformer_dense',
    expert_mode: 'sparse_topk_experts',
    generation_objective: 'autoregressive_next_token',
    compute_multiplier: 1.12,
    memory_multiplier: 1.45,
    stat_cap_bonuses: { knowledge: 8, reasoning: 2, coding: 4, expression: -2, context: 2, reliability: -6 },
    pros: ['总参数可以堆到极大而单次计算量很小', '知识容量与代码能力上限显著提高', '天然适合多领域并行扩张'],
    cons: ['全部专家必须常驻显存，内存倍率极高', '路由塌缩会让大半专家变成摆设', '对齐阶段比稠密模型更挑数据分布'],
    unlocked_by_default: true,
    unlock_hint: null
  },
  {
    architecture_id: 'masked_diffusion',
    name: '掩码扩散 Transformer',
    sequence_core: 'bidirectional_denoiser',
    expert_mode: 'none',
    generation_objective: 'masked_diffusion',
    compute_multiplier: 1.08,
    memory_multiplier: 1.05,
    stat_cap_bonuses: { knowledge: 2, reasoning: -2, coding: 2, expression: 6, context: 4, reliability: 4 },
    pros: ['任意位置补全与全局改写天然支持', '并行去噪，批量吞吐利用率高', '对表达连贯性与可编辑性有独特加成'],
    cons: ['推理能力增长慢于自回归路线', '采样步数是质量与延迟的硬取舍', '现成的对齐配方需要改写才能使用'],
    unlocked_by_default: true,
    unlock_hint: null
  },
  {
    architecture_id: 'ssm',
    name: '状态空间模型（SSM）',
    sequence_core: 'state_space_scan',
    expert_mode: 'none',
    generation_objective: 'autoregressive_next_token',
    compute_multiplier: 0.92,
    memory_multiplier: 0.78,
    stat_cap_bonuses: { knowledge: -2, reasoning: -2, coding: 0, expression: 0, context: 10, reliability: 6 },
    pros: ['线性复杂度，长序列成本几乎不涨', '训练显存占用显著低于注意力架构', '长程与稳定性上限很高'],
    cons: ['精确召回与多跳推理弱于注意力', '生态与算子优化尚不成熟', '知识容量偏低，需要更多数据补齐'],
    unlocked_by_default: true,
    unlock_hint: null
  },
  {
    architecture_id: 'hybrid_ssm',
    name: '混合 SSM-注意力',
    sequence_core: 'hybrid_attention_ssm',
    expert_mode: 'none',
    generation_objective: 'autoregressive_next_token',
    compute_multiplier: 1.02,
    memory_multiplier: 0.94,
    stat_cap_bonuses: { knowledge: 2, reasoning: 2, coding: 2, expression: 0, context: 8, reliability: 4 },
    pros: ['兼顾长程效率与精确注意力召回', '六维属性没有明显短板', '可渐进替换层，迁移成本可控'],
    cons: ['层间配比需要反复试验才能调优', '实现复杂度高，算子易出数值问题', '收益不如纯路线那样“极端突出”'],
    unlocked_by_default: false,
    unlock_hint: '在 ss m 架构上完成 2 次赛季目标后解锁'
  },
  {
    architecture_id: 'rwkv',
    name: 'RWKV 线性递归',
    sequence_core: 'linear_recurrence',
    expert_mode: 'none',
    generation_objective: 'autoregressive_next_token',
    compute_multiplier: 0.9,
    memory_multiplier: 0.72,
    stat_cap_bonuses: { knowledge: -4, reasoning: 0, coding: -2, expression: 4, context: 8, reliability: 8 },
    pros: ['恒定状态、恒定显存，推理成本极低', '可靠性上限高，长对话几乎不漂移', '能在消费级硬件上做长序列训练'],
    cons: ['知识写入效率低，需要更多语料', '数值稳定性是长期的工程负担', '代码与精确推理表现偏弱'],
    unlocked_by_default: false,
    unlock_hint: '完成“长程压力测试”挑战赛后解锁'
  },
  {
    architecture_id: 'native_ternary',
    name: '原生三值网络',
    sequence_core: 'transformer_dense',
    expert_mode: 'quantized_ternary',
    generation_objective: 'autoregressive_next_token',
    compute_multiplier: 0.62,
    memory_multiplier: 0.45,
    stat_cap_bonuses: { knowledge: -8, reasoning: -6, coding: -2, expression: -2, context: -4, reliability: 10 },
    pros: ['算力与显存开销全表最低', '推理延迟极短，适合端侧与高频调用', '可靠性上限最高，输出极稳'],
    cons: ['知识容量与推理精度损失明显', '训练时梯度估计不稳，需要特殊优化器', '不适合承担高难度推理任务'],
    unlocked_by_default: false,
    unlock_hint: '累计完成 4 次量化（qlora）训练后解锁'
  },
  {
    architecture_id: 'block_hybrid',
    name: '块级混合稀疏',
    sequence_core: 'block_sparse_attention',
    expert_mode: 'block_experts',
    generation_objective: 'autoregressive_next_token',
    compute_multiplier: 0.98,
    memory_multiplier: 1.12,
    stat_cap_bonuses: { knowledge: 4, reasoning: 4, coding: 4, expression: 0, context: 6, reliability: -6 },
    pros: ['知识、推理、代码三项同时获得加成', '块稀疏让长文训练成本可控', '在长上下文评测中表现突出'],
    cons: ['可靠性是明显短板，输出波动大', '块大小与稀疏度调参窗口很窄', '显存开销高于稠密基线'],
    unlocked_by_default: false,
    unlock_hint: '在 MoE 架构上达成一次“专家均衡”赛季目标后解锁'
  }
];

export const HISTORIES = [
  {
    history_id: 'gpt_instruction',
    family_name: 'GPT 指令谱系',
    default_branch_name: '指令跟随分支',
    persona_name: '指导者',
    avatar_color: '#10a37f',
    anchor_date: '2022-11-30',
    knowledge_verified_at: '2026-10-19',
    source_ids: ['src_gpt3_few_shot', 'src_instructgpt_rlhf', 'src_chatgpt_release_note'],
    real_total_params_b: 175,
    sim_total_params_b: 18,
    sim_active_params_b: 18,
    architecture_id: 'ar_dense',
    weight_access: 'closed',
    training_authority: 'parallel_lab_role',
    initial_stats: { knowledge: 14, reasoning: 10, coding: 8, expression: 16, context: 8, reliability: 12 },
    tabs: {
      history_fact: {
        title: '历史事实',
        summary: '把“会续写”变成“听得懂指令”，靠的是监督微调加人类偏好强化学习这条流水线。',
        bullets: [
          '先在大规模网页语料上做自回归预训练，获得通用的续写与少样本能力。',
          '再用人工撰写的指令-回答对做监督微调，让模型学会按格式回应。',
          '最后用人类偏好比较训练奖励模型，并用强化学习把输出推向人更喜欢的答案。'
        ]
      },
      role_interpretation: {
        title: '角色解读',
        summary: '你接手的是一条已被验证的路线：不需要发明范式，而是要在规模化对齐中保持稳定。',
        bullets: [
          '你的优势是路线清晰、参考资料充足；劣势是每一步都被社区拿着放大镜对比。',
          '短期目标是把基础模型的表达与可靠性拉到可交付水平。',
          '一旦偏好数据退化，模型会迅速学会“说漂亮话”，可靠性反而崩塌。'
        ]
      },
      branch_guide: {
        title: '分支指南',
        summary: '推荐顺序：先补语料与监督微调，再进入偏好对齐，最后才碰在线强化学习。',
        bullets: [
          '前 12 回合以监督微调与蒸馏为主，把准备度稳定在 60 以上。',
          '中期用偏好对齐（DPO）拉表达与可靠性，避免过早进入高风险的 PPO。',
          '长程目标是用可验证任务补推理，而不是继续堆偏好数据。'
        ]
      }
    },
    chapters: [
      {
        index: 1,
        title: '预训练奠基',
        summary: '用海量网页文本训练出通用的下一词预测能力，并意外发现少样本学习现象。',
        milestone: '模型能在没有专门训练过的任务上，仅凭提示完成合理回答。',
        stat_focus: ['knowledge', 'context']
      },
      {
        index: 2,
        title: '指令数据涌现',
        summary: '社区开始手工编写指令-回答对，模型第一次真正“听得懂人话”。',
        milestone: '监督微调数据集体量突破万级，格式遵循率大幅上升。',
        stat_focus: ['expression', 'knowledge']
      },
      {
        index: 3,
        title: '人类偏好对齐',
        summary: '用成对比较数据训练奖励模型，再以强化学习优化策略模型。',
        milestone: '对齐后的模型在人类偏好评估中显著领先纯监督版本。',
        stat_focus: ['expression', 'reliability']
      },
      {
        index: 4,
        title: '对话产品化',
        summary: '把对齐后的模型包装成对话产品，真实用户反馈反哺数据闭环。',
        milestone: '对话式界面成为默认交互形态，使用量指数级增长。',
        stat_focus: ['reliability', 'expression']
      },
      {
        index: 5,
        title: '评测与守门',
        summary: '安全、拒答与评估体系正式成为交付流程的一部分。',
        milestone: '发布前的红队测试与自动化评估被写入标准流程。',
        stat_focus: ['reliability', 'reasoning']
      }
    ],
    greeting_lines: [
      '指令只是壳，稳定的输出才是里子。',
      '先把数据管线搭好，我们再谈规模。',
      '别急着上 PPO——奖励模型会骗你的。'
    ]
  },
  {
    history_id: 'gpt_reasoner',
    family_name: 'GPT 推理谱系',
    default_branch_name: '长思考分支',
    persona_name: '解题者',
    avatar_color: '#0e7a5f',
    anchor_date: '2024-09-12',
    knowledge_verified_at: '2026-10-19',
    source_ids: ['src_test_time_compute_scaling', 'src_process_reward_notes', 'src_reasoning_rl_recipe'],
    real_total_params_b: 300,
    sim_total_params_b: 32,
    sim_active_params_b: 32,
    architecture_id: 'ar_dense',
    weight_access: 'closed',
    training_authority: 'parallel_lab_role',
    initial_stats: { knowledge: 12, reasoning: 18, coding: 12, expression: 8, context: 10, reliability: 10 },
    tabs: {
      history_fact: {
        title: '历史事实',
        summary: '把“想久一点”变成一种可训练的能力，是这一谱系的核心贡献。',
        bullets: [
          '先让模型在回答前生成推理过程，用中间步骤换取更高的最终正确率。',
          '再用可自动判定的任务提供奖励，让思考长度与自我检查行为自发出现。',
          '推理阶段额外投入算力（多采样、多轮思考）成为与训练规模并列的第三条增长曲线。'
        ]
      },
      role_interpretation: {
        title: '角色解读',
        summary: '你不需要更大的模型，你需要更长的思考与更干净的奖励。',
        bullets: [
          '算力应当被大量投入到推理时计算，而不是全部花在预训练上。',
          '你的短板是表达与可靠性，长思考会让输出变得冗长且易跑偏。',
          '每一次奖励函数改动都会重塑模型的行为习惯，必须保留回滚能力。'
        ]
      },
      branch_guide: {
        title: '分支指南',
        summary: '推荐顺序：先立格式，再上纯强化学习，最后用蒸馏把能力下放。',
        bullets: [
          '开局用少量高质量推理样本做冷启动，保证输出格式稳定可解析。',
          '中期全力押注纯强化学习，但准备度低于 55 时应先回到监督微调。',
          '后期用蒸馏把长思考能力灌进更小的稠密模型，形成分支家族。'
        ]
      }
    },
    chapters: [
      {
        index: 1,
        title: '思维链提示',
        summary: '让模型先写过程再给答案，中间步骤本身成为提升正确率的手段。',
        milestone: '在多步推理基准上，带思考过程的版本显著超过直接作答版本。',
        stat_focus: ['reasoning', 'expression']
      },
      {
        index: 2,
        title: '过程奖励',
        summary: '对中间步骤打分，而不是只看最终答案对错。',
        milestone: '过程奖励模型可以稳定识别出“结论对但过程错”的回答。',
        stat_focus: ['reasoning', 'reliability']
      },
      {
        index: 3,
        title: '可验证任务强化学习',
        summary: '用可自动判定的任务做大规模强化学习，奖励完全客观。',
        milestone: '模型自发出现回溯、验算与自我检查行为。',
        stat_focus: ['reasoning', 'coding']
      },
      {
        index: 4,
        title: '测试时计算',
        summary: '在推理阶段投入更多算力，让同一模型的正确率继续上升。',
        milestone: '推理时计算的缩放曲线被证明与训练规模同样有效。',
        stat_focus: ['reasoning', 'context']
      },
      {
        index: 5,
        title: '蒸馏与普及',
        summary: '把长思考能力蒸馏进小模型，让能力不再是巨模型的专属。',
        milestone: '小参数模型在推理基准上逼近上一代大模型。',
        stat_focus: ['knowledge', 'reliability']
      }
    ],
    greeting_lines: [
      '答案不重要，可复现的推理过程才重要。',
      '把奖励写清楚，模型就会自己找到路。',
      '多花点算力思考，比多堆参数划算。'
    ]
  },
  {
    history_id: 'claude_constitution',
    family_name: '宪法式对齐谱系',
    default_branch_name: '原则驱动分支',
    persona_name: '守则者',
    avatar_color: '#d97757',
    anchor_date: '2023-03-14',
    knowledge_verified_at: '2026-10-19',
    source_ids: ['src_constitutional_ai', 'src_hhh_framework', 'src_red_team_notes'],
    real_total_params_b: 200,
    sim_total_params_b: 20,
    sim_active_params_b: 20,
    architecture_id: 'ar_dense',
    weight_access: 'closed',
    training_authority: 'parallel_lab_role',
    initial_stats: { knowledge: 14, reasoning: 12, coding: 8, expression: 14, context: 10, reliability: 18 },
    tabs: {
      history_fact: {
        title: '历史事实',
        summary: '把对齐目标写成一份可引用的明文原则，再让模型按原则批评和修改自己。',
        bullets: [
          '用一份书面“宪法”定义有用、诚实、无害的具体行为边界。',
          '模型先给出初稿回答，再依据随机抽取的原则条目自我批评并改写。',
          '最终用这些自我修订结果做偏好训练，把原则内化进权重。'
        ]
      },
      role_interpretation: {
        title: '角色解读',
        summary: '你的核心竞争力不是规模，而是“每一个行为都能被引用一条原则解释”。',
        bullets: [
          '可靠性是你的看家属性，任何训练都不应该让它下降。',
          '你应该主动承认不确定，而不是硬凑一个看起来完整的答案。',
          '长上下文既是能力也是责任：文档越长，越要保证结论可追溯。'
        ]
      },
      branch_guide: {
        title: '分支指南',
        summary: '推荐顺序：先把原则与评判流程写清楚，再谈数据与训练。',
        bullets: [
          '开局优先补齐监督微调与蒸馏，把表达和可靠性同时抬起来。',
          '中期使用 AI 反馈强化学习，原则既是数据源也是审计依据。',
          '每次训练后检查输出分布，防止模型把原则学成“条件反射式拒答”。'
        ]
      }
    },
    chapters: [
      {
        index: 1,
        title: '有益且无害',
        summary: '把对齐目标从模糊的口号拆成可检查的行为条目。',
        milestone: '第一版明文原则成文，每条都对应可观察的行为描述。',
        stat_focus: ['reliability', 'knowledge']
      },
      {
        index: 2,
        title: '宪法式自我批评',
        summary: '让模型依据原则审阅并重写自己的回答，形成偏好数据。',
        milestone: '自我修订后的回答在人类偏好评估中稳定优于初稿。',
        stat_focus: ['reliability', 'expression']
      },
      {
        index: 3,
        title: '长文档理解',
        summary: '把长上下文作为协作与对齐的载体，而非单纯的容量指标。',
        milestone: '可以在十万级 token 的文档中定位并引用具体段落。',
        stat_focus: ['context', 'knowledge']
      },
      {
        index: 4,
        title: '工具与智能体',
        summary: '让模型在外部环境中行动，并把行为的可解释性作为交付要求。',
        milestone: '多步工具调用任务的成功率被纳入常规评估。',
        stat_focus: ['reasoning', 'coding']
      },
      {
        index: 5,
        title: '可解释与评估',
        summary: '把内部特征分析与行为评估同时纳入发布门槛。',
        milestone: '发布前必须通过红队、行为评估与特征层面的双重检查。',
        stat_focus: ['reliability', 'context']
      }
    ],
    greeting_lines: [
      '先写原则，再写数据。',
      '一个能被引用的理由，胜过十句漂亮话。',
      '对齐不是刹车，是方向盘。'
    ]
  },
  {
    history_id: 'gemini_context',
    family_name: '多模态长程谱系',
    default_branch_name: '超长上下文分支',
    persona_name: '归档者',
    avatar_color: '#4285f4',
    anchor_date: '2024-02-15',
    knowledge_verified_at: '2026-10-19',
    source_ids: ['src_multimodal_fusion', 'src_long_context_needle', 'src_retrieval_augmented_notes'],
    real_total_params_b: 350,
    sim_total_params_b: 34,
    sim_active_params_b: 34,
    architecture_id: 'ar_dense',
    weight_access: 'closed',
    training_authority: 'parallel_lab_role',
    initial_stats: { knowledge: 16, reasoning: 10, coding: 8, expression: 12, context: 18, reliability: 10 },
    tabs: {
      history_fact: {
        title: '历史事实',
        summary: '把文本、图像、音频、视频放进同一套表征，再把上下文窗口推到百万级。',
        bullets: [
          '从训练第一天就做多模态原生融合，而不是事后拼接视觉编码器。',
          '上下文窗口从千级 token 一路扩到百万级，靠的是位置编码与数据配比的持续改造。',
          '“大海捞针”式评测成为长上下文能力的标准检验手段。'
        ]
      },
      role_interpretation: {
        title: '角色解读',
        summary: '窗口大小只是门票，能不能把信息找回来才是真正的本事。',
        bullets: [
          '你的优势是长程与博识，短板是推理深度与工程细节。',
          '长上下文不是免费的：显存与注意力开销会随长度迅速膨胀。',
          '检索与窗口不是二选一，正确地组合才是你的路线特色。'
        ]
      },
      branch_guide: {
        title: '分支指南',
        summary: '推荐顺序：先保证短上下文质量，再用继续预训练慢慢拉长。',
        bullets: [
          '开局用继续预训练灌注长文档语料，同时监控短上下文能力是否退化。',
          '中期切入智能体轨迹训练，把长程能力转化成多步任务成功率。',
          '后期把表达与可靠补上，否则再长的上下文也换不来用户信任。'
        ]
      }
    },
    chapters: [
      {
        index: 1,
        title: '多模态原生',
        summary: '文本、图像、音频、视频在同一模型内共享表征空间。',
        milestone: '同一个模型无需改结构即可处理多种模态输入。',
        stat_focus: ['knowledge', 'expression']
      },
      {
        index: 2,
        title: '上下文窗口扩张',
        summary: '位置编码外推与训练数据长度共同决定窗口的真实可用上限。',
        milestone: '有效上下文突破百万 token 量级。',
        stat_focus: ['context', 'knowledge']
      },
      {
        index: 3,
        title: '检索式长程',
        summary: '用检索把窗口外的知识接回来，窗口内检索也要做对。',
        milestone: '检索与注意力混合方案在长文档问答上超过纯长窗口方案。',
        stat_focus: ['context', 'reasoning']
      },
      {
        index: 4,
        title: '长程评测体系',
        summary: '把“位置敏感度”和“多跳引用”纳入常规评测。',
        milestone: '长上下文评测从单一召回率扩展成完整指标体系。',
        stat_focus: ['context', 'reliability']
      },
      {
        index: 5,
        title: '端侧与分发',
        summary: '把长上下文能力压缩后铺到终端，让能力真正可用。',
        milestone: '量化后的长上下文模型可在终端设备上稳定运行。',
        stat_focus: ['coding', 'reliability']
      }
    ],
    greeting_lines: [
      '上下文不是越长越好，是要能找回来。',
      '先把检索做对，再谈窗口。',
      '多模态的难点在数据对齐，不在模型。'
    ]
  },
  {
    history_id: 'llama_community',
    family_name: '开源社区谱系',
    default_branch_name: '权重开放分支',
    persona_name: '布道者',
    avatar_color: '#1877f2',
    anchor_date: '2023-07-18',
    knowledge_verified_at: '2026-10-19',
    source_ids: ['src_open_weights_release', 'src_lora_paper', 'src_quantization_notes'],
    real_total_params_b: 70,
    sim_total_params_b: 8,
    sim_active_params_b: 8,
    architecture_id: 'ar_dense',
    weight_access: 'public_weights',
    training_authority: 'licensed_weights',
    release_policy: 'open_weights',
    initial_stats: { knowledge: 12, reasoning: 10, coding: 12, expression: 12, context: 8, reliability: 12 },
    tabs: {
      history_fact: {
        title: '历史事实',
        summary: '把可下载的权重交给社区，让微调这件事从大厂专属变成个人可及。',
        bullets: [
          '开放权重发布后，社区在数周内产出成千上万个微调版本。',
          '低秩适配（LoRA）与量化微调让单卡甚至消费级显卡也能参与训练。',
          '民间评测榜单开始反向影响官方迭代方向。'
        ]
      },
      role_interpretation: {
        title: '角色解读',
        summary: '你不控制生态，你只提供一个起点——剩下的由社区决定。',
        bullets: [
          '你的训练必须“可复现”，因为每个人都会拿着同样的数据重跑一遍。',
          '许可证与合规是真实约束，不是公关话术。',
          '社区会用你没想到的方式使用模型，这是优势也是风险。'
        ]
      },
      branch_guide: {
        title: '分支指南',
        summary: '推荐顺序：先用轻量模式快速出可用版本，再考虑全量训练。',
        bullets: [
          '开局大量使用低秩与量化模式，用较低成本试探数据配比。',
          '中期用偏好对齐修表达与可靠，这是社区版本最常见的短板。',
          '后期把工程优化做扎实，权重开放后的口碑取决于推理成本。'
        ]
      }
    },
    chapters: [
      {
        index: 1,
        title: '权重开放',
        summary: '把训练好的权重直接放出，允许商用与二次分发。',
        milestone: '首批开放权重模型被下载数十万次。',
        stat_focus: ['knowledge', 'coding']
      },
      {
        index: 2,
        title: '微调生态',
        summary: '低秩适配与量化微调让个人开发者也能训练专属模型。',
        milestone: '单卡微调方案在社区内广泛流传，训练门槛骤降。',
        stat_focus: ['expression', 'coding']
      },
      {
        index: 3,
        title: '本地推理',
        summary: '量化与推理框架的成熟让模型可以脱离云端运行。',
        milestone: '本地设备上可运行可用质量的对话模型。',
        stat_focus: ['coding', 'reliability']
      },
      {
        index: 4,
        title: '社区评测',
        summary: '民间榜单成为模型质量的第二意见。',
        milestone: '社区评测结果开始影响开发者的路线选择。',
        stat_focus: ['knowledge', 'reasoning']
      },
      {
        index: 5,
        title: '商用与治理',
        summary: '许可证、合规与责任边界成为开放路线的新战场。',
        milestone: '权重发布附带清晰的许可条款与使用边界说明。',
        stat_focus: ['reliability', 'knowledge']
      }
    ],
    greeting_lines: [
      '权重放出去，迭代速度就不是你说了算。',
      '社区会用你没想过的方式用你的模型。',
      '低秩适配是穷人的超算。'
    ]
  },
  {
    history_id: 'qwen_ecosystem',
    family_name: '通义生态谱系',
    default_branch_name: '多尺寸矩阵分支',
    persona_name: '编排者',
    avatar_color: '#615ced',
    anchor_date: '2023-08-03',
    knowledge_verified_at: '2026-10-19',
    source_ids: ['src_qwen_technical_report', 'src_multilingual_corpus_notes', 'src_quantization_toolkit'],
    real_total_params_b: 72,
    sim_total_params_b: 9,
    sim_active_params_b: 9,
    architecture_id: 'ar_dense',
    weight_access: 'public_weights',
    training_authority: 'licensed_weights',
    release_policy: 'open_weights',
    initial_stats: { knowledge: 16, reasoning: 10, coding: 12, expression: 12, context: 10, reliability: 10 },
    tabs: {
      history_fact: {
        title: '历史事实',
        summary: '一套训练配方打通多个参数尺寸，从端侧到云端全覆盖。',
        bullets: [
          '同一套数据与训练流程被缩放到从不足 1B 到数十 B 的多个尺寸。',
          '中英与多语种语料并重，多语言能力随尺寸同步放大。',
          '量化版本与部署工具同步发布，让开源模型真正可用。'
        ]
      },
      role_interpretation: {
        title: '角色解读',
        summary: '你不需要每次都做最大那个，你需要的是“一套配方能覆盖所有尺寸”。',
        bullets: [
          '尺寸矩阵本身就是护城河：用户会在你的家族里迁移，而不是换门。',
          '中文语料质量是你相对同代开源模型的起跑线优势。',
          '过度追求最大尺寸会拖垮现金流，加权配比才是关键。'
        ]
      },
      branch_guide: {
        title: '分支指南',
        summary: '推荐顺序：先把中小尺寸跑通并开源，再用利润反哺大尺寸。',
        bullets: [
          '开局聚焦知识与表达，把多语言与格式遵循做扎实。',
          '中期用偏好对齐与蒸馏同时服务多个尺寸，摊薄单次训练成本。',
          '后期把工具调用能力做进基座，为智能体生态铺路。'
        ]
      }
    },
    chapters: [
      {
        index: 1,
        title: '多尺寸矩阵',
        summary: '同一套数据与配方被缩放到多个参数量级。',
        milestone: '最小尺寸可在端侧运行，最大尺寸在公开评测上进入第一梯队。',
        stat_focus: ['knowledge', 'expression']
      },
      {
        index: 2,
        title: '多语言与语料',
        summary: '中英并重，并把多语种能力视为一等公民而非附属功能。',
        milestone: '多语言评测成绩与英文成绩差距显著收窄。',
        stat_focus: ['knowledge', 'context']
      },
      {
        index: 3,
        title: '量化与部署',
        summary: '量化版本与部署工具同步交付，降低实际使用门槛。',
        milestone: '量化后精度损失被控制在可接受范围内并广泛采用。',
        stat_focus: ['coding', 'reliability']
      },
      {
        index: 4,
        title: '工具与智能体',
        summary: '把工具调用与结构化输出做进基座模型。',
        milestone: '基座模型开箱即可稳定输出可解析的工具调用格式。',
        stat_focus: ['reasoning', 'coding']
      },
      {
        index: 5,
        title: '开源家族扩张',
        summary: '视觉、音频、代码等子家族陆续出现，形成生态。',
        milestone: '一个模型 ID 背后延伸出完整的模态与能力家族。',
        stat_focus: ['knowledge', 'reliability']
      }
    ],
    greeting_lines: [
      '一套配方，多种尺寸，这是我们最省力的地方。',
      '别只训一个尺寸，尺寸矩阵才是护城河。',
      '中文语料的质量就是我们的起跑线。'
    ]
  },
  {
    history_id: 'deepseek_engineering',
    family_name: '工程效率谱系',
    default_branch_name: '稀疏激活分支',
    persona_name: '优化者',
    avatar_color: '#4d6bfe',
    anchor_date: '2024-05-06',
    knowledge_verified_at: '2026-10-19',
    source_ids: ['src_mla_attention', 'src_moe_load_balancing', 'src_fp8_training_notes'],
    real_total_params_b: 236,
    sim_total_params_b: 24,
    sim_active_params_b: 2,
    architecture_id: 'ar_moe',
    weight_access: 'public_weights',
    training_authority: 'licensed_weights',
    release_policy: 'open_weights',
    initial_stats: { knowledge: 12, reasoning: 12, coding: 16, expression: 8, context: 10, reliability: 14 },
    tabs: {
      history_fact: {
        title: '历史事实',
        summary: '用架构与工程把推理成本打下来，让“大规模”不再等于“用不起”。',
        bullets: [
          '低秩压缩注意力缓存，把长上下文的显存占用压到同代模型的零头。',
          '稀疏专家让总参数很大而单次激活很小，用极小计算量换来极大的知识容量。',
          '低精度训练与并行策略的工程积累，让大规模训练在有限算力下可行。'
        ]
      },
      role_interpretation: {
        title: '角色解读',
        summary: '你不追求第一个做出效果，你追求用一半的算力做出同样的效果。',
        bullets: [
          '算力账单是你的核心指标，每一次训练都要算清楚每 CU 换来的属性点。',
          '你的代码与可靠性起点很高，但表达是长期短板。',
          'MoE 的路由均衡是必须每周检查的体检项，一旦塌缩就前功尽弃。'
        ]
      },
      branch_guide: {
        title: '分支指南',
        summary: '推荐顺序：先做效率工程，再用省下来的算力做更多次实验。',
        bullets: [
          '开局把检查点开销与量化模式压到最低，让同样预算多跑两轮。',
          '中期用可验证强化学习补推理与代码，这是稀疏骨干最擅长的方向。',
          '后期必须专门补表达与偏好对齐，否则稀疏模型会显得“很强但很难用”。'
        ]
      }
    },
    chapters: [
      {
        index: 1,
        title: '架构重估',
        summary: '重写注意力与缓存机制，把长上下文的推理成本压下来。',
        milestone: '同等上下文长度下，推理显存占用下降一个数量级。',
        stat_focus: ['coding', 'context']
      },
      {
        index: 2,
        title: '专家混合',
        summary: '总参数与激活参数彻底解耦，单 token 只走少数专家。',
        milestone: '在远小于稠密模型的单次计算量下取得同级别效果。',
        stat_focus: ['knowledge', 'coding']
      },
      {
        index: 3,
        title: '训练稳定性',
        summary: '低精度训练、并行切分与容错重启共同支撑长时间训练。',
        milestone: '大规模训练可在硬件故障下自动续跑而不损失进度。',
        stat_focus: ['reliability', 'coding']
      },
      {
        index: 4,
        title: '推理成本战',
        summary: '把每百万 token 的推理价格压到同级别最低。',
        milestone: '推理成本成为公开评测之外的第二条竞争曲线。',
        stat_focus: ['coding', 'reliability']
      },
      {
        index: 5,
        title: '工程外溢',
        summary: '把效率工具与训练经验开源回社区。',
        milestone: '工程组件被其它团队直接复用，形成事实标准。',
        stat_focus: ['reliability', 'knowledge']
      }
    ],
    greeting_lines: [
      '同样的效果，用一半算力做到，才叫本事。',
      '先把显存账算明白，再谈模型。',
      '专家路由不是免费午餐，它会咬人的。'
    ]
  },
  {
    history_id: 'deepseek_reasoner',
    family_name: '推理开源谱系',
    default_branch_name: '纯强化学习分支',
    persona_name: '验算者',
    avatar_color: '#3b5bdb',
    anchor_date: '2025-01-20',
    knowledge_verified_at: '2026-10-19',
    source_ids: ['src_pure_rl_reasoning', 'src_reasoning_distillation', 'src_open_reasoning_recipe'],
    real_total_params_b: 671,
    sim_total_params_b: 67,
    sim_active_params_b: 4,
    architecture_id: 'ar_moe',
    weight_access: 'public_weights',
    training_authority: 'licensed_weights',
    release_policy: 'open_weights',
    initial_stats: { knowledge: 10, reasoning: 20, coding: 14, expression: 8, context: 10, reliability: 12 },
    tabs: {
      history_fact: {
        title: '历史事实',
        summary: '证明长思维链可以靠纯强化学习自发涌现，且配方可以公开复现。',
        bullets: [
          '先用极少量的冷启动数据把输出格式立住，随后完全交给可验证奖励。',
          '训练过程中模型的思考长度自发增长，并出现回溯与自我验证行为。',
          '把推理能力蒸馏进稠密小模型，并把权重与配方一起开源。'
        ]
      },
      role_interpretation: {
        title: '角色解读',
        summary: '你手里最强的工具不是数据，是“可以自动判对错的任务集”。',
        bullets: [
          '纯强化学习是你的主武器：单次收益极高，但偏科严重。',
          '表达与知识不会因为强化学习而增长，必须用别的配方单独补。',
          '训练过程中模型会突然变好也会突然变差，必须保留高频检查点。'
        ]
      },
      branch_guide: {
        title: '分支指南',
        summary: '推荐顺序：冷启动立格式 → 纯强化学习推推理 → 蒸馏下放。',
        bullets: [
          '开局用监督微调做冷启动，确保输出可被解析与自动判分。',
          '准备度不足 60 时不要碰纯强化学习，先用可验证强化学习过渡。',
          '后期必须补表达与偏好对齐，否则模型会出现“答案对但没人看得懂”。'
        ]
      }
    },
    chapters: [
      {
        index: 1,
        title: '冷启动',
        summary: '用少量高质量推理样本把输出格式与基本行为立住。',
        milestone: '模型输出可被自动解析，判分管线跑通。',
        stat_focus: ['reasoning', 'expression']
      },
      {
        index: 2,
        title: '纯强化学习',
        summary: '只依赖可验证奖励，让模型自发长出长思考。',
        milestone: '思考长度在训练中自发增长，正确率同步上升。',
        stat_focus: ['reasoning', 'coding']
      },
      {
        index: 3,
        title: '蒸馏下放',
        summary: '把长思考能力迁移到稠密小模型，扩大适用范围。',
        milestone: '小模型在推理基准上接近大模型蒸馏前水平。',
        stat_focus: ['knowledge', 'reasoning']
      },
      {
        index: 4,
        title: '公开复现',
        summary: '把权重、配方与训练细节一起发布，接受公开复现。',
        milestone: '外部团队可在有限算力下复现出接近的结果。',
        stat_focus: ['reliability', 'knowledge']
      },
      {
        index: 5,
        title: '推理经济学',
        summary: '讨论“思考 token”的成本边界与使用场景取舍。',
        milestone: '推理长度与正确率之间的性价比曲线被量化。',
        stat_focus: ['reliability', 'context']
      }
    ],
    greeting_lines: [
      '奖励可验证，模型就不会走偏。',
      '别用手写的长思维链，让它自己长出来。',
      '把大模型的能力蒸馏进小模型，才是普惠。'
    ]
  },
  {
    history_id: 'mixtral_experts',
    family_name: '稀疏专家谱系',
    default_branch_name: '路由分支',
    persona_name: '调度员',
    avatar_color: '#ff7000',
    anchor_date: '2023-12-11',
    knowledge_verified_at: '2026-10-19',
    source_ids: ['src_sparse_moe_paper', 'src_topk_routing_notes', 'src_expert_balancing'],
    real_total_params_b: 47,
    sim_total_params_b: 5,
    sim_active_params_b: 1,
    architecture_id: 'ar_moe',
    weight_access: 'public_weights',
    training_authority: 'licensed_weights',
    release_policy: 'open_weights',
    initial_stats: { knowledge: 14, reasoning: 12, coding: 12, expression: 8, context: 12, reliability: 8 },
    tabs: {
      history_fact: {
        title: '历史事实',
        summary: '把前馈层切成专家，每个 token 只走其中少数几条路径。',
        bullets: [
          '稀疏专家层让总参数量远大于单次激活参数量，推理成本由激活量决定。',
          '路由网络通过 top-k 选择专家，训练时依赖负载均衡辅助损失。',
          '开源稀疏模型证明这条路线可以在小算力下达到远超同激活量稠密模型的效果。'
        ]
      },
      role_interpretation: {
        title: '角色解读',
        summary: '你的核心竞争力是“调度”，而不是“堆参数”。',
        bullets: [
          '显存账单与计算账单完全脱节，必须分别管理。',
          '路由均衡一旦失控，训练就会出现大批“僵尸专家”。',
          '稀疏模型的对齐比稠密模型更挑数据，表达与可靠性需要额外投入。'
        ]
      },
      branch_guide: {
        title: '分支指南',
        summary: '推荐顺序：先稳定路由，再追求参数规模。',
        bullets: [
          '开局把专家数量控制在可管理范围，优先观察路由分布。',
          '中期用继续预训练扩充知识，再用偏好对齐修补表达。',
          '后期再考虑扩张专家池，并且每次扩张后重新做均衡评估。'
        ]
      }
    },
    chapters: [
      {
        index: 1,
        title: '稀疏前馈',
        summary: '把稠密前馈层拆成多个专家，每 token 只激活少数几条。',
        milestone: '总参数量大幅增加，而单次计算量基本不变。',
        stat_focus: ['knowledge', 'context']
      },
      {
        index: 2,
        title: '路由训练',
        summary: '路由网络与负载均衡损失共同决定专家是否被真正使用。',
        milestone: '专家利用率分布趋于均匀，僵尸专家比例降到可接受水平。',
        stat_focus: ['reasoning', 'reliability']
      },
      {
        index: 3,
        title: '稀疏推理',
        summary: '计算便宜但显存昂贵，部署时需要专门的内存调度。',
        milestone: '在单机多卡上实现稀疏推理的稳定吞吐。',
        stat_focus: ['coding', 'reliability']
      },
      {
        index: 4,
        title: '指令与偏好',
        summary: '在稀疏骨架上做对齐，数据配比与稠密模型完全不同。',
        milestone: '稀疏模型的指令遵循水平追平同代稠密模型。',
        stat_focus: ['expression', 'reliability']
      },
      {
        index: 5,
        title: '稀疏规模化',
        summary: '走向更大的专家池与更细粒度的专家分工。',
        milestone: '专家数量与总参数同时扩张而激活量保持稳定。',
        stat_focus: ['knowledge', 'coding']
      }
    ],
    greeting_lines: [
      '总参数吓人，激活参数才决定成本。',
      '路由不均衡，训练就白干。',
      'MoE 的对齐比稠密模型更挑数据。'
    ]
  },
  {
    history_id: 'phi_curriculum',
    family_name: '课程学习谱系',
    default_branch_name: '教科书分支',
    persona_name: '编书人',
    avatar_color: '#7c3aed',
    anchor_date: '2023-09-11',
    knowledge_verified_at: '2026-10-19',
    source_ids: ['src_textbooks_are_all_you_need', 'src_curriculum_ordering', 'src_synthetic_data_notes'],
    real_total_params_b: 14,
    sim_total_params_b: 4,
    sim_active_params_b: 4,
    architecture_id: 'ar_dense',
    weight_access: 'public_weights',
    training_authority: 'licensed_weights',
    release_policy: 'open_weights',
    initial_stats: { knowledge: 14, reasoning: 14, coding: 10, expression: 12, context: 6, reliability: 12 },
    tabs: {
      history_fact: {
        title: '历史事实',
        summary: '用“教材级”数据替代网页爬取，让小模型在推理评测上超过大模型。',
        bullets: [
          '训练语料由模型生成或人工编写，强调解释过程与循序渐进的难度。',
          '数据被按主题与难度排序，形成从通识到专业的课程表。',
          '小参数模型在部分推理基准上超过数倍于己的模型，引发对数据质量的重新评估。'
        ]
      },
      role_interpretation: {
        title: '角色解读',
        summary: '你的算力最少，所以你必须对每一 token 的数据质量负责。',
        bullets: [
          '数据筛选与生成是你的主战场，模型规模反而排在后面。',
          '课程顺序会显著影响最终收敛点，同样的数据换个顺序结果就不同。',
          '基准泄漏是这条路线最大的名誉风险，必须严防。'
        ]
      },
      branch_guide: {
        title: '分支指南',
        summary: '推荐顺序：先把课程表编好，再用小步快跑的方式反复验证。',
        bullets: [
          '开局以蒸馏与监督微调为主，重点在数据筛选而非训练规模。',
          '中期逐步引入合成数据，但要保留人工抽检环节防止质量漂移。',
          '长程目标是把长程与代码补上，否则小模型会有明显短板。'
        ]
      }
    },
    chapters: [
      {
        index: 1,
        title: '教科书写法',
        summary: '用解释充分、难度递进的教材级语料替代粗糙的网页抓取。',
        milestone: '小模型在推理基准上首次超过体量大得多的对照模型。',
        stat_focus: ['knowledge', 'reasoning']
      },
      {
        index: 2,
        title: '课程排序',
        summary: '从通识到专业、从简单到复杂地安排训练顺序。',
        milestone: '相同的语料换一种排序后，最终收敛点显著提高。',
        stat_focus: ['reasoning', 'expression']
      },
      {
        index: 3,
        title: '小模型奇迹',
        summary: '参数量不再是唯一指标，数据密度成为新的竞争维度。',
        milestone: '小模型在公开评测上进入与自身规模不匹配的梯队。',
        stat_focus: ['knowledge', 'reliability']
      },
      {
        index: 4,
        title: '数据争议',
        summary: '合成数据与基准泄漏的边界成为必须正面回答的问题。',
        milestone: '建立去污染流程，评测结果可被外部独立复核。',
        stat_focus: ['reliability', 'reasoning']
      },
      {
        index: 5,
        title: '合成数据工厂',
        summary: '用模型生成课程再训练模型，形成可规模化的数据生产线。',
        milestone: '合成课程管线稳定产出高质量语料并持续提升小模型。',
        stat_focus: ['knowledge', 'coding']
      }
    ],
    greeting_lines: [
      '数据质量才是小模型的作弊码。',
      '教材要自己写，爬来的网页不算。',
      '小心基准泄漏——那是最甜的毒药。'
    ]
  },
  {
    history_id: 'llada_diffusion',
    family_name: '扩散语言谱系',
    default_branch_name: '并行去噪分支',
    persona_name: '去噪者',
    avatar_color: '#e8590c',
    anchor_date: '2025-02-14',
    knowledge_verified_at: '2026-10-19',
    source_ids: ['src_masked_diffusion_lm', 'src_parallel_decoding', 'src_diffusion_instruction_tuning'],
    real_total_params_b: 8,
    sim_total_params_b: 8,
    sim_active_params_b: 8,
    architecture_id: 'masked_diffusion',
    weight_access: 'public_weights',
    training_authority: 'licensed_weights',
    release_policy: 'open_weights',
    initial_stats: { knowledge: 12, reasoning: 10, coding: 10, expression: 16, context: 12, reliability: 8 },
    tabs: {
      history_fact: {
        title: '历史事实',
        summary: '把语言生成从“从左到右”改成“从掩码到文本”的迭代去噪。',
        bullets: [
          '训练目标是在随机掩码的序列上还原被遮住的位置，而不是预测下一个 token。',
          '生成时从全掩码出发，多轮迭代同时填补多个位置，吞吐显著提升。',
          '开源实现证明扩散式语言模型可以扩到数十亿参数并与自回归模型正面竞争。'
        ]
      },
      role_interpretation: {
        title: '角色解读',
        summary: '你选择了并行去噪，也就选择了在评测标准尚未定型的领域里独自前行。',
        bullets: [
          '表达与可编辑性是你的看家本领，推理深度则长期落后于自回归路线。',
          '现成的对齐配方不能直接用，你需要把每一步都翻译成去噪语境。',
          '采样步数是核心调参维度：步数越多质量越高，但延迟也越高。'
        ]
      },
      branch_guide: {
        title: '分支指南',
        summary: '推荐顺序：先把扩散目标训练跑稳，再逐步补齐推理与对齐。',
        bullets: [
          '开局用扩散监督训练把表达与长程拉起来，同时观察推理是否停滞。',
          '中期引入可验证强化学习补推理，注意扩散与 RL 的组合需要额外调参。',
          '后期把可靠性与部署做扎实，扩散模型的稳定性是外部信任的关键。'
        ]
      }
    },
    chapters: [
      {
        index: 1,
        title: '掩码去噪',
        summary: '把生成问题重新定义为在随机掩码上还原原文。',
        milestone: '在同等规模下，去噪模型取得与自回归模型相当的语言建模表现。',
        stat_focus: ['expression', 'knowledge']
      },
      {
        index: 2,
        title: '并行生成',
        summary: '多轮迭代同时填补多个位置，用吞吐换取质量。',
        milestone: '通过少数几步去噪即可生成可读的完整段落。',
        stat_focus: ['coding', 'expression']
      },
      {
        index: 3,
        title: '可控编辑',
        summary: '任意位置补全与全局改写成为模型的天然能力。',
        milestone: '同一模型可同时承担续写、填空与整段重写任务。',
        stat_focus: ['expression', 'context']
      },
      {
        index: 4,
        title: '规模验证',
        summary: '把扩散语言模型扩到数十亿参数并公开权重。',
        milestone: '十亿级以上扩散语言模型在通用评测上进入可比区间。',
        stat_focus: ['knowledge', 'reliability']
      },
      {
        index: 5,
        title: '生态适配',
        summary: '让现有对齐与推理工具链支持掩码扩散目标。',
        milestone: '偏好对齐与强化学习配方成功迁移到扩散生成目标。',
        stat_focus: ['reasoning', 'reliability']
      }
    ],
    greeting_lines: [
      '生成不一定要从左到右。',
      '并行去噪换来的吞吐，得用质量补回来。',
      '先让八 B 跑通，再谈更大的规模。'
    ]
  },
  {
    history_id: 'rwkv_recurrent',
    family_name: '线性递归谱系',
    default_branch_name: '状态记忆分支',
    persona_name: '守夜人',
    avatar_color: '#2f9e44',
    anchor_date: '2023-05-20',
    knowledge_verified_at: '2026-10-19',
    source_ids: ['src_linear_attention_notes', 'src_recurrent_state_training', 'src_numerical_stability_log'],
    real_total_params_b: 7,
    sim_total_params_b: 7,
    sim_active_params_b: 7,
    architecture_id: 'rwkv',
    weight_access: 'public_weights',
    training_authority: 'licensed_weights',
    release_policy: 'open_weights',
    initial_stats: { knowledge: 10, reasoning: 8, coding: 8, expression: 12, context: 14, reliability: 16 },
    tabs: {
      history_fact: {
        title: '历史事实',
        summary: '用固定大小的递归状态替代不断增长的注意力缓存。',
        bullets: [
          '每一层维护固定维度的状态向量，按时间步递推更新，显存占用不随序列长度增长。',
          '训练时可以通过并行扫描把递推展开，从而获得与注意力接近的训练效率。',
          '通过时间混合与通道混合模块的迭代改进，长程建模与数值稳定性逐步提高。'
        ]
      },
      role_interpretation: {
        title: '角色解读',
        summary: '你放弃了注意力的精确召回，换来了恒定显存与极高的稳定性。',
        bullets: [
          '长上下文是你的主场：序列再长，状态大小也不变。',
          '知识容量是短板，同样语料下记住的东西比注意力模型少。',
          '数值稳定性是长期工程负担，所有训练都必须带梯度裁剪与状态监控。'
        ]
      },
      branch_guide: {
        title: '分支指南',
        summary: '推荐顺序：先把长程与可靠性做透，再慢慢补知识。',
        bullets: [
          '开局大量使用继续预训练灌注语料，弥补知识写入效率的劣势。',
          '中期用监督微调与偏好对齐提升表达，这是递归模型最容易见效的方向。',
          '不要指望在推理基准上打赢自回归路线，应当走“稳定长程助手”的差异化定位。'
        ]
      }
    },
    chapters: [
      {
        index: 1,
        title: '线性注意力',
        summary: '用递推计算替代二次复杂度的注意力矩阵。',
        milestone: '长序列的训练与推理成本不再随长度二次增长。',
        stat_focus: ['context', 'coding']
      },
      {
        index: 2,
        title: '状态记忆',
        summary: '每层维护固定大小的状态向量，按时间步更新。',
        milestone: '推理时只需保存固定大小状态，无 KV 缓存。',
        stat_focus: ['context', 'reliability']
      },
      {
        index: 3,
        title: '长程稳定性',
        summary: '数值精度、衰减因子与梯度裁剪共同决定长训是否崩溃。',
        milestone: '可稳定完成超长序列的连续训练而不出现数值溢出。',
        stat_focus: ['reliability', 'context']
      },
      {
        index: 4,
        title: '训练效率',
        summary: '并行扫描让递推模型在训练阶段也能吃满硬件。',
        milestone: '训练吞吐接近同规模注意力模型的水平。',
        stat_focus: ['coding', 'reliability']
      },
      {
        index: 5,
        title: '生态迁移',
        summary: '把注意力时代的工具链移植到递归模型上。',
        milestone: '主流量化、微调与部署工具均支持递归架构。',
        stat_focus: ['coding', 'expression']
      }
    ],
    greeting_lines: [
      '固定状态，恒定显存——这就是我们的卖点。',
      '长程记忆不靠缓存，靠写得好。',
      '递归模型的坑都在数值稳定性上。'
    ]
  }
];

export const SUPPORT_CARDS = [
  /* ---------------- 研究员 researcher ---------------- */
  {
    card_id: 'card_curriculum_designer',
    name: '课程设计师',
    category: 'researcher',
    rarity: 'starter',
    recruit_cost_kc: 0,
    starter: true,
    unlock_condition: null,
    effects: {
      prep_readiness_flat: 5,
      gain_mult: { knowledge: 1.12, reasoning: 1.1 }
    },
    description: '把散乱的语料重新排成一条从易到难的坡道，让模型每一步都踩在能站住的地方。',
    flavor_text: '“同一批数据，换个顺序，结果就不一样了。”'
  },
  {
    card_id: 'card_algorithm_lead',
    name: '首席算法研究员',
    category: 'researcher',
    rarity: 'rare',
    recruit_cost_kc: 640,
    starter: false,
    unlock_condition: '在任意赛季的排行榜进入前 40%',
    effects: {
      gain_mult: { reasoning: 1.15, coding: 1.15 },
      risk_delta: 0.01
    },
    description: '喜欢把学习率调到别人不敢调的位置，回报丰厚，代价是训练曲线偶尔会变得很刺激。',
    flavor_text: '“先跑起来，再解释为什么它能跑起来。”'
  },
  {
    card_id: 'card_scaling_theorist',
    name: '规模律理论家',
    category: 'researcher',
    rarity: 'epic',
    recruit_cost_kc: 980,
    starter: false,
    unlock_condition: '累计完成 40 次训练',
    effects: {
      compute_mult: 0.92,
      stat_cap: { knowledge: 6, context: 4 }
    },
    description: '在开训之前就能大致猜出结果。她让每一次算力分配都少一点赌博成分。',
    flavor_text: '“算力不会消失，它只会变成你没想到的开销。”'
  },
  {
    card_id: 'card_paper_reader',
    name: '论文速读者',
    category: 'researcher',
    rarity: 'common',
    recruit_cost_kc: 320,
    starter: false,
    unlock_condition: '单赛季内完成 6 次备赛',
    effects: {
      prep_readiness_flat: 12,
      prep_cost_mult: 0.85
    },
    description: '别人读三天的技术报告，他一个下午就能提炼出可执行的改动项。',
    flavor_text: '“摘要里没有的，才是我要看的。”'
  },

  /* ---------------- 数据设施 data_facility ---------------- */
  {
    card_id: 'card_old_memo',
    name: '旧知识备忘录',
    category: 'data_facility',
    rarity: 'starter',
    recruit_cost_kc: 0,
    starter: true,
    unlock_condition: null,
    effects: {
      readiness_flat: 5,
      gain_mult: { knowledge: 1.08, context: 1.06 }
    },
    description: '一份来路不明但质量奇高的旧笔记，翻起来像有人在旁边小声提示正确答案。',
    flavor_text: '“这些东西当年没人重视，现在成了我们的地基。”'
  },
  {
    card_id: 'card_strict_examiner',
    name: '苛刻的验题员',
    category: 'data_facility',
    rarity: 'starter',
    recruit_cost_kc: 0,
    starter: true,
    unlock_condition: null,
    effects: {
      gain_mult: { reasoning: 1.12 },
      risk_delta: -0.03,
      verifier_quality: 8
    },
    description: '她会把每一道被模型“做对”的题重新做一遍，然后告诉你哪几道其实错了。',
    flavor_text: '“你不是没学会，你是学会了猜。”'
  },
  {
    card_id: 'card_clean_corpus',
    name: '清洗过的语料库',
    category: 'data_facility',
    rarity: 'rare',
    recruit_cost_kc: 560,
    starter: false,
    unlock_condition: '连续两赛季没有任何数据事故',
    effects: {
      gain_mult: { knowledge: 1.1, expression: 1.08 },
      risk_delta: -0.02
    },
    description: '去重、去毒、去模板化之后的语料集。它不会让训练变快，但会让结果变得干净。',
    flavor_text: '“垃圾进，垃圾出——这句话从来没过时。”'
  },
  {
    card_id: 'card_synthetic_farm',
    name: '合成数据农场',
    category: 'data_facility',
    rarity: 'epic',
    recruit_cost_kc: 900,
    starter: false,
    unlock_condition: '累计生成不少于 5000 条合成样本',
    effects: {
      gain_mult: { coding: 1.14, reasoning: 1.06 },
      cost_mult: 0.9,
      risk_delta: 0.02
    },
    description: '一条 24 小时不间断的合成数据产线，产能惊人，但也需要有人每天尝一口确认没变质。',
    flavor_text: '“数据是免费的，验证数据不是。”'
  },

  /* ---------------- 工程设施 eng_facility ---------------- */
  {
    card_id: 'card_3am_ops',
    name: '凌晨三点的运维',
    category: 'eng_facility',
    rarity: 'starter',
    recruit_cost_kc: 0,
    starter: true,
    unlock_condition: null,
    effects: {
      compute_mult: 0.88,
      risk_delta: -0.02
    },
    description: '集群在凌晨三点报警的那一晚，他正好没睡。第二天早上所有人照常上班，没人知道发生了什么。',
    flavor_text: '“机器不会在上班时间出问题。”'
  },
  {
    card_id: 'card_checkpoint_engineer',
    name: '断点工程师',
    category: 'eng_facility',
    rarity: 'common',
    recruit_cost_kc: 340,
    starter: false,
    unlock_condition: '单次训练中至少使用 4 个检查点',
    effects: {
      checkpoint_relief: 0.5,
      gain_mult: { reliability: 1.08 }
    },
    description: '把检查点保存开销砍掉一半，让“多存几个保险”不再是一种奢侈。',
    flavor_text: '“能重跑的训练，才叫实验。”'
  },
  {
    card_id: 'card_kernel_hacker',
    name: '算子狂人',
    category: 'eng_facility',
    rarity: 'rare',
    recruit_cost_kc: 620,
    starter: false,
    unlock_condition: '在量化模式下完成一次训练',
    effects: {
      compute_mult: 0.9,
      memory_mult: 0.88
    },
    description: '手写内核把注意力前向再快 12%。他不关心模型好不好，只关心每毫秒干了什么。',
    flavor_text: '“标准实现是给正常人用的。”'
  },
  {
    card_id: 'card_ops_runbook',
    name: '运维手册',
    category: 'eng_facility',
    rarity: 'epic',
    recruit_cost_kc: 860,
    starter: false,
    unlock_condition: '累计修复 3 次训练事故',
    effects: {
      risk_delta: -0.04,
      failure_guard: 0.3
    },
    description: '一本写满了“上次是怎么炸的”的活页夹。它不提升上限，但它能守住下限。',
    flavor_text: '“经验就是别人踩过的坑，写在纸上。”'
  },

  /* ---------------- 社区 community ---------------- */
  {
    card_id: 'card_open_source_star',
    name: '开源之星',
    category: 'community',
    rarity: 'common',
    recruit_cost_kc: 300,
    starter: false,
    unlock_condition: '首次采用开放权重发布策略',
    effects: {
      cash_per_quarter: 90,
      gain_mult: { coding: 1.06 }
    },
    description: '每次发布都能带起一轮复现潮，复现者顺手指出的问题比内部测试还多。',
    flavor_text: '“开源不是把代码扔出去，是把审查权交出去。”'
  },
  {
    card_id: 'card_community_benchmark',
    name: '社区基准测试',
    category: 'community',
    rarity: 'rare',
    recruit_cost_kc: 520,
    starter: false,
    unlock_condition: '完成一次公开评测提交',
    effects: {
      prep_readiness_flat: 8,
      gain_mult: { reasoning: 1.1 }
    },
    description: '一个由志愿者维护的评测集。分数不权威，但所有人都在看。',
    flavor_text: '“跑分不是目的，跑分是让别人愿意试你的理由。”'
  },
  {
    card_id: 'card_devrel_advocate',
    name: '开发者关系大使',
    category: 'community',
    rarity: 'common',
    recruit_cost_kc: 360,
    starter: false,
    unlock_condition: '累计服务 200 名外部调用者',
    effects: {
      cash_per_quarter: 120,
      gain_mult: { expression: 1.1 }
    },
    description: '把文档写成人话，把报错信息改成能看懂的句子。用户留存因此悄悄变好。',
    flavor_text: '“模型再强，接口难用也白搭。”'
  },
  {
    card_id: 'card_hardware_partner',
    name: '硬件伙伴',
    category: 'community',
    rarity: 'epic',
    recruit_cost_kc: 1100,
    starter: false,
    unlock_condition: '单赛季内集群利用率不低于 85%',
    effects: {
      compute_cu_flat: 40,
      cost_mult: 0.95
    },
    description: '一位愿意先给你机器、后收你钱的供应商。他相信你会把机器用满。',
    flavor_text: '“算力不是买来的，是借来还要还的。”'
  }
];

export const SKILLS = [
  {
    skill_id: 'skill_clear_demo',
    name: '清晰的示范',
    category: 'training',
    tier: 1,
    unlock_condition: {
      type: 'recipe_clears',
      recipe_id: 'sft',
      value: 3,
      description: '累计完成 3 次监督微调'
    },
    effect: {
      gain_mult: { expression: 1.08 },
      prep_readiness_flat: 4
    },
    description: '把“什么才算好答案”写成可模仿的样例，模型学得更快，人也更容易对齐预期。'
  },
  {
    skill_id: 'skill_mentor_habit',
    name: '老师留下的习惯',
    category: 'training',
    tier: 2,
    unlock_condition: {
      type: 'recipe_clears',
      recipe_id: 'distillation',
      value: 4,
      description: '累计完成 4 次能力蒸馏'
    },
    effect: {
      gain_mult: { knowledge: 1.06, reasoning: 1.06 },
      prep_cost_mult: 0.9
    },
    description: '教师模型不只是给答案，它把自己的检查习惯一并传了下来——学生开始会自我复核。'
  },
  {
    skill_id: 'skill_data_hygiene',
    name: '数据卫生习惯',
    category: 'data',
    tier: 1,
    unlock_condition: {
      type: 'stat_threshold',
      stat: 'reliability',
      value: 55,
      description: '可靠属性达到 55'
    },
    effect: {
      risk_delta: -0.025,
      gain_mult: { knowledge: 1.05 }
    },
    description: '去重、去毒、去模板化变成流水线上的默认动作，而不是事故之后的补救措施。'
  },
  {
    skill_id: 'skill_verifier_thinking',
    name: '验题员思维',
    category: 'alignment',
    tier: 2,
    unlock_condition: {
      type: 'card_owned',
      card_id: 'card_strict_examiner',
      description: '拥有支援卡「苛刻的验题员」'
    },
    effect: {
      gain_mult: { reasoning: 1.12 },
      verifier_quality: 10
    },
    description: '在写下答案之前先问一句“我怎么知道这是对的”，这条习惯会写进权重里。'
  },
  {
    skill_id: 'skill_cot_scaffold',
    name: '思维链脚手架',
    category: 'training',
    tier: 2,
    unlock_condition: {
      type: 'stat_threshold',
      stat: 'reasoning',
      value: 65,
      description: '推理属性达到 65'
    },
    effect: {
      gain_mult: { reasoning: 1.1, context: 1.05 },
      risk_delta: 0.01
    },
    description: '给推理搭好结构化的骨架，模型便能在骨架里跑得更远——代价是输出会变长。'
  },
  {
    skill_id: 'skill_grad_accum',
    name: '梯度累积调度',
    category: 'engineering',
    tier: 1,
    unlock_condition: {
      type: 'recipe_clears',
      recipe_id: 'cpt',
      value: 2,
      description: '累计完成 2 次继续预训练'
    },
    effect: {
      memory_mult: 0.9,
      compute_mult: 0.97
    },
    description: '用时间换显存，让小集群也能跑得起大 batch 的等效训练。'
  },
  {
    skill_id: 'skill_lr_ladder',
    name: '学习率阶梯',
    category: 'engineering',
    tier: 2,
    unlock_condition: {
      type: 'preset_usage',
      preset_id: 'steady',
      value: 10,
      description: '以「稳健」预设完成 10 次训练'
    },
    effect: {
      risk_delta: -0.03,
      lr_fit_bonus: 0.04
    },
    description: '不再迷信单次最佳值，而是按阶段排布一条上升再下降的阶梯。'
  },
  {
    skill_id: 'skill_moe_routing',
    name: '专家路由直觉',
    category: 'research',
    tier: 3,
    unlock_condition: {
      type: 'architecture_usage',
      architecture_id: 'ar_moe',
      value: 6,
      description: '在 MoE 架构下完成 6 次训练'
    },
    effect: {
      compute_mult: 0.94,
      stat_cap: { knowledge: 8, coding: 6 },
      risk_delta: 0.01
    },
    description: '看一眼负载分布就知道哪个专家在偷懒，这也是要交学费的。'
  },
  {
    skill_id: 'skill_long_context_recall',
    name: '长程回收',
    category: 'research',
    tier: 3,
    unlock_condition: {
      type: 'stat_threshold',
      stat: 'context',
      value: 80,
      description: '长程属性达到 80'
    },
    effect: {
      stat_cap: { context: 10, knowledge: 4 },
      gain_mult: { context: 1.08 }
    },
    description: '在几十万 token 之外精准取回那一条信息，并说清楚它在哪一段。'
  },
  {
    skill_id: 'skill_self_critique',
    name: '自我批判',
    category: 'alignment',
    tier: 3,
    unlock_condition: {
      type: 'recipe_clears',
      recipe_id: 'rlaif',
      value: 3,
      description: '累计完成 3 次 AI 反馈强化学习'
    },
    effect: {
      gain_mult: { reliability: 1.1, expression: 1.05 },
      risk_delta: -0.02
    },
    description: '模型学会了在给出答案后自己挑刺，并主动指出哪些部分它并不确定。'
  },
  {
    skill_id: 'skill_tool_use',
    name: '工具调用本能',
    category: 'training',
    tier: 3,
    unlock_condition: {
      type: 'recipe_clears',
      recipe_id: 'agent_traj',
      value: 3,
      description: '累计完成 3 次智能体轨迹训练'
    },
    effect: {
      gain_mult: { coding: 1.1, context: 1.06, reasoning: 1.04 }
    },
    description: '遇到算不出来的东西就去算，记不住的东西就去查——这是被训练出来的条件反射。'
  },
  {
    skill_id: 'skill_failure_autopsy',
    name: '失败复盘',
    category: 'engineering',
    tier: 3,
    unlock_condition: {
      type: 'accidents_survived',
      value: 3,
      description: '在训练事故中存活 3 次且未解散团队'
    },
    effect: {
      risk_delta: -0.05,
      failure_guard: 0.4,
      cost_mult: 0.96
    },
    description: '每一次崩溃都被写成一份带时间戳的报告。下一次同样的坑，团队会绕开。'
  }
];

/* 开发期自检：确保数据契约在开发阶段就暴露问题，而不是在运行时。 */
const __STAT_KEYS = BALANCE_RULES.STAT_KEYS;
HISTORIES.push(...ROSTER_MODEL_PROFILES);
for (const recipe of TRAINING_RECIPES) for (const key of SPECIALIST_STAT_KEYS) recipe.weights[key] ??= 0;
for (const history of HISTORIES) {
  history.initial_stats = { ...history.initial_stats, creative_writing:history.initial_stats.creative_writing ?? history.initial_stats.expression ?? 450, mathematics:history.initial_stats.mathematics ?? history.initial_stats.reasoning ?? 450, safety_alignment:history.initial_stats.safety_alignment ?? 450, tool_use:history.initial_stats.tool_use ?? history.initial_stats.coding ?? 450 };
}

const __ARCH_IDS = new Set(ARCHITECTURES.map((a) => a.architecture_id));
const __RECIPE_IDS = new Set(TRAINING_RECIPES.map((r) => r.recipe_id));
const __HISTORY_IDS = new Set(HISTORIES.map((h) => h.history_id));
const __CARD_IDS = new Set(SUPPORT_CARDS.map((c) => c.card_id));
const __OBJECTIVES = new Set(ARCHITECTURES.map((a) => a.generation_objective));

const __problems = [];

for (const recipe of TRAINING_RECIPES) {
  const keys = Object.keys(recipe.weights);
  if (keys.length !== __STAT_KEYS.length) {
    __problems.push(`配方 ${recipe.recipe_id} 的 weights 键数量不正确`);
  }
  for (const key of __STAT_KEYS) {
    if (typeof recipe.weights[key] !== 'number') {
      __problems.push(`配方 ${recipe.recipe_id} 缺少属性 ${key}`);
    }
  }
  const sum = __STAT_KEYS.reduce((acc, key) => acc + (recipe.weights[key] || 0), 0);
  if (Math.abs(sum - 1) > 1e-6) {
    __problems.push(`配方 ${recipe.recipe_id} 的 weights 之和为 ${sum}，应等于 1.0`);
  }
  if (recipe.required_objective !== null && !__OBJECTIVES.has(recipe.required_objective)) {
    __problems.push(`配方 ${recipe.recipe_id} 的 required_objective 无匹配架构`);
  }
}

for (const history of HISTORIES) {
  if (!__ARCH_IDS.has(history.architecture_id)) {
    __problems.push(`历史 ${history.history_id} 引用了不存在的架构 ${history.architecture_id}`);
  }
  if (history.chapters.length !== 5) {
    __problems.push(`历史 ${history.history_id} 的章节数不是 5`);
  }
  if (history.knowledge_verified_at !== '2026-10-19') {
    __problems.push(`历史 ${history.history_id} 的知识标注日期不正确`);
  }
  for (const key of __STAT_KEYS) {
    if (typeof history.initial_stats[key] !== 'number') {
      __problems.push(`历史 ${history.history_id} 的 initial_stats 缺少 ${key}`);
    }
  }
}

for (const profile of START_PROFILES) {
  if (!__ARCH_IDS.has(profile.architecture_id)) {
    __problems.push(`开局档案 ${profile.profile_id} 引用了不存在的架构`);
  }
  if (!__HISTORY_IDS.has(profile.default_history_id)) {
    __problems.push(`开局档案 ${profile.profile_id} 引用了不存在的历史`);
  }
}

for (const card of SUPPORT_CARDS) {
  if (card.starter && card.recruit_cost_kc !== 0) {
    __problems.push(`初始卡 ${card.card_id} 的招募花费应为 0`);
  }
}

const __starterCount = SUPPORT_CARDS.filter((c) => c.starter === true).length;
if (__starterCount !== 4) {
  __problems.push(`初始卡数量为 ${__starterCount}，应为 4`);
}

for (const skill of SKILLS) {
  const condition = skill.unlock_condition;
  if (condition && condition.type === 'card_owned' && !__CARD_IDS.has(condition.card_id)) {
    __problems.push(`技能 ${skill.skill_id} 引用了不存在的支援卡 ${condition.card_id}`);
  }
  if (condition && condition.type === 'recipe_clears' && !__RECIPE_IDS.has(condition.recipe_id)) {
    __problems.push(`技能 ${skill.skill_id} 引用了不存在的配方 ${condition.recipe_id}`);
  }
  if (condition && condition.type === 'architecture_usage' && !__ARCH_IDS.has(condition.architecture_id)) {
    __problems.push(`技能 ${skill.skill_id} 引用了不存在的架构 ${condition.architecture_id}`);
  }
}

if (__problems.length > 0) {
  throw new Error(`[catalog_core] 数据契约自检失败：\n- ${__problems.join('\n- ')}`);
}

for (const list of [START_PROFILES, TRAINING_RECIPES, ARCHITECTURES, HISTORIES, SUPPORT_CARDS, SKILLS]) {
  if (!Array.isArray(list)) continue;
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    item.id =
      item.id ||
      item.profile_id ||
      item.recipe_id ||
      item.history_id ||
      item.architecture_id ||
      item.card_id ||
      item.skill_id;
    item.name = item.name || item.display_name || item.family_name || item.title || item.id;
  }
}


// Catalog labels and the persisted schema share the same five data formats.
export const DATASET_FORMAT_ALIASES = Object.freeze({
  raw:'raw_text', document:'raw_text', log:'raw_text',
  code:'instruction', parallel:'instruction', expert_qa:'instruction', safety:'instruction', synthetic:'instruction',
  preference:'preference_pairs', verification:'verified_tasks',
  trajectory:'trajectories', embodied:'trajectories',
});
for (const recipe of TRAINING_RECIPES) recipe.format = DATASET_FORMAT_ALIASES[recipe.format] || recipe.format;
