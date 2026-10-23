// 平衡常量（规格 §1.3）。P0.3a 一次写全，P4.2 之前任何包都不改；P4.2 校准只调这里的数值。
// 纯数据模块：只导出常量和一个取偏移的小函数，不导入任何东西（界面也可以直接读）。
// 原来散在别处的几项（model.js 的 KNOW_PRETRAIN、REPEAT_RSTAR、MAX_EPOCHS、DISTILL_MIN_DAYS，core.js 和 provider.js 的 RENT_FACTOR，
// 旧 focus.js 的 TRAIN_PACE）都只留这里一份（E7）。
export const DIM_MAX = 99, TRAIN_PACE = 0.8;
export const KCAP_OFFSET = { knowledge: 6, other: 14 };            // 统一 computeCaps 与 previewDistill（P0.3b）；蒸馏小模型沿用现有的 kcap 钳制，只把偏移统一成这个值
export const kcapOffset = k => (k === 'knowledge' ? KCAP_OFFSET.knowledge : KCAP_OFFSET.other);   // 正文一律写 kcapOffset(k)
export const RENT_FACTOR = { 2023: 1.25, 2024: 1, 2025: 0.75, 2026: 0.6 };
// SOTA / 上限 / 蒸馏
export const FOLLOW_GAP = 1.0, OPEN_GAP_LLM = 1.5, APPROACH = 0.3, OWN_EDGE = 1.5;
export const DISTILL_HEAVY = 0.15, TAINT_MIN_DIST = 0.5, SYNTH_TAINT = 0.25;
export const BEYOND = { know: 350, ownCats: 3, ownLevel: 2, distillDep: 0.1, team: 150, trialDays: 60 };
// SOTA 标签（D10）与难度锚点（D6.2）
export const SOTA = { EPS: 0.1, FIELD: 2, FILL_LEAD: 3.0, HIST_SLACK: 1.0, HIST_LOOKAHEAD: 90, GHOST_CAP: 1.0, LOG_MAX: 40 };
// 难度曲线（D6）
export const CURVE = { W0: 1.5, F0: 0.5, B0: 1.0, A0: 0.3, A_MAX: 1.5, F_MAX: 0.85, RHO_MIN: 0.3, RHO_MAX: 2,
                       DIM_SLACK: 3, DIM_STEEP: 2, BIRTH_GAP: 1.0, GAIN_STEP: 0.1 };
export const EFFORT = {
  COMP: [0.15, 1.2], DATA: [0.1, 1.25], KNOW: [0.3, 1.2], LEAD_STEP: 0.25, LEAD_MAX: 2,
  TRAIN_REF: { llm:   { 2023: 1900, 2024: 11600, 2025: 30000, 2026: 73000, 2027: 146000 },   // H100 当量，frontier 档开局卡数的一半
               other: { 2023: 80,   2024: 170,   2025: 600,   2026: 1080,  2027: 2000 } },   // H100 当量，specialist 档开局卡数的一半
  KNOW_REF:  { llm:   { 2023: 120, 2024: 156, 2025: 192, 2026: 228, 2027: 264 },              // frontier 档开局技术积累
               other: { 2023: 40,  2024: 52,  2025: 64,  2026: 76,  2027: 88 } },             // specialist 档开局技术积累
};
export const SOTA_EASE = { maker: 0.6, kin: -0.3, rookie: -0.55, selfReliant: 0.2, selfBuilt: 0.1 };   // 特质 mods.sotaEase 的取值
export const DISTILL_MIX = { SPEED: 2.5, ZONE: 1.5 };
// 市场期待（D11）
export const EXPECT = {
  JUDGE_GAP: 60, CHAMP_LEAD: 1.0, NEAR_MISS: 1.0,                 // 没有冠军过期常量：冠军期待永不过期（D11.1）
  CHAL_NEAR: 1.0, OPEN_NEAR: 2.0, CLOSE_BY: 2.0, BAND: { frontier: 2, bigtech: 4, major: 5, specialist: 4 },   // specialist 预留：按 D11.1 它不会落到挑战者档
  SMALL_UP: 1.0, REGRESS: 0.1,
  OPEN_MARGIN: 0.1, COMM_MARGIN: 1.0, COMM_FIELD: 2, COMM_MAX_TOTAL: 100,
  BASE_MARGIN: 1.0, BASE_TOKENS: 15, BASE_QUALITY: 1.0,
  WORKS_LAG: 365, WORKS_SLACK: 2, WORKS_QUALITY: 1.6, WORKS_COOL: 365,
  COOL: 180, HOT_WINDOW: 45, ROUND_COOL: 365, LOG_MAX: 40,
};
// 机器人与顾问（A10）
// BASE_EVERY_MONTHS：这一代底座开工满几个月，顾问就建议准备下一代（和 bot.js planJobs 里的 since ≥ 9 同一口径，M1e 补）。
export const BOT = { DISTILL_GAP: 2, TEACHER_MIN: 0.5, DISTILL_EVERY: 90, HOLD_MAX_DAYS: 45, MAKER_DATA: 2.0, BASE_EVERY_MONTHS: 9 };
// 策略与路线
export const STRATEGY_DAYS = [14, 35, 70, 105], SHELF_DAYS = 30, SEED_WINDOW = 90, SEED_MIN_LEFT = 7;
export const ROUTE_COOLDOWN = 120, DELAY_DAYS = 180, SPIRIT_SHOW = 6;
export const RIGHT_TAIL = { afterReal: 365, afterDone: 180 };
// 弹窗
export const POPUP_PER_HOOK = 1, SUPER_GAP_DAYS = 60, IDLE_ADVICE_EVERY = 14;
// 2026-10-21 待定项决定（P4.2 只在注释写的区间内调）
export const BOARD_WINDOW_DAYS = 730;                  // 量级榜只收 24 个月内发布的（设计取值）
export const CLASS_EDGES = { small: 15, mid: 100 };    // LLM 总参数（B）：≤15 小，≤100 中，>100 大；参数不公开的闭源旗舰和玩家 f2t 为 frontier
export const CLASS_GOAL_MAX = 3;                        // 同量级目标 N = max(1, min(3, floor(对手数 / 2)))
export const KNOW_PRETRAIN = { base: 3, perDoubling: 2, refFlops: 8.4e22, floor: 0.6, floorFlops: 2e22 };   // floor 区间 0.4–0.8
export const REPEAT_RSTAR = 10, MAX_EPOCHS = 4;         // R* 区间 7.5–15；只用于 LLM
export const GEN = { hPerGTok: 5.6, rho: { plain: 1, filtered: 3 }, packGTok: 4.3, maxShare: 0.3, keepInfer: 0.05,
                     memOverhead: 1.3, cleanupDays: 3, minDays: 7, apiDays: 14, cancelKeep: 0.25, nagDays: 30 };
export const DISTILL_MIN_DAYS = 7;
export const DISTILL_GAP = { k: 25, exp: -0.55, refT: 36, dataExp: -0.2, floor: 2.5, activeW: 0.3, capMult: 10, minActiveRatio: 1 / 50,
                             dimMul: { knowledge: 1.8, code: 0.6, math: 0.55, writing: 1, agent: 1 } };
export const SUPER_ACTIONS = ['rentGpus', 'setTier', 'setInferShare', 'buyGpus'];   // 超事件选项允许调用的公开命令；action 的形状以 data/super.js 为准
// 训练作业（T 章，P2.4a；P4.2 只在注释写的区间内调）
export const JOBS = {
  SLOTS: { base: 2, team: 30, cards: 256, min: 2, max: 6 }, // 作业位 = max(按人 clamp(2 + ⌊log2(团队/30)⌋, 2, 6)，按卡 clamp(2 + ⌊log2(自用卡/256)⌋, 2, 6)) + round(jobSlots)；试验不占作业位
  WEIGHT: { high: 3, normal: 1 },                           // 优先 / 正常 的分卡权重；都没封顶时 3:1 正好是旧的 75/25
  MEM: { pretrain: 16, post: 4, card: 80 },                 // 最低卡：预训练 ⌈16 × 总参(B) / 80⌉（和 structureCheck 同一条显存规则）；后训练 ⌈4 × 总参 / 80⌉（只放权重加 LoRA 一类的省显存做法）
  NONLLM_MIN: 8,                                            // 非语言模型底座的最低卡（一台机器，和 previewProject 的 minGpus 一致）
  FAST: { base: 20, perDecade: 14, max: 60, nonLlm: 20 },   // 预训练最快天数 = clamp(20 + 14·log10(总参/7), 20, 60)；区间 base 14–30
  POST_SAT: 1.44,                                           // 后训练“想要卡”：月算力到需求的 1.44 倍时 computeMult 到顶 1.2（1.2² = 1.44）
  STALL: { gain: 0.3, days: 7 },                            // “练到涨不动”：主维预估月涨幅 < 0.3 连续 7 天
  SMALL_LINE: 3, SMALL_MAX_TOTAL: 120, SMALL_FRAC: 0.2,     // 小模型线（只有语言模型有）同时最多 3 个；从零练的小底座总参 ≤ min(120B, 参照底座总参 × 0.2)
  PREV_DAYS: 60,                                            // 上一代收尾期；区间 30–90
  WEAR: { base: 5, rush: 8, rl: 15, sft: 11, benchmax: 8 }, // 每月集群损耗：底座类（含试验）、后训练类各取最重一项，不按作业数叠加
  ROLLBACK_DAYS: 5, ROLLBACK_MAX: 0.25,                     // 严重炸炉回退 5 天的进度，最多回退已完成部分的 25%；区间 3–10 天
  RUSH: 1.25,                                               // 赶工：进度 ×1.25，集群每月多掉 8；不突破最快天数
  WARN_DAYS: 270, MAX_DAYS: 365,                            // 预估工期超过 270 天标黄，超过 365 天不让立
  QUEUE_NAG: 7, IDLE_NAG: { share: 0.2, days: 7 }, NAG_GAP: 7, // 排队 ≥ 7 天、闲置训练卡 ≥ 20% 连续 7 天时顾问提醒；同一条作业类提醒执行以后 7 天内不再出
  RESEARCH: { free: 1.7, busy: 0.4 },                       // 研究倍率：有“重活”（后训练、检修）时 0.4，没有时 1.7（和旧的 train / research 两档相同）
  KNOW: { free: 0.3, post: 0.08, light: 0.03 },             // knowTick 按顺序取：检修中 0.03 → 有非刷榜的后训练 0.08 → 只有刷榜 0.03 → 都没有 0.3
};
export const REPAIR = { rate: 1.6, share: 0.25, start: 40, until: 75 };   // 检修：后训练全部暂停、留出 25% 训练卡，健康每天 +1.6；自动检修在 < 40 时打开，到 75 结束（每天检查）
export const LAB = {
  SHARE: { small: 0.005, mid: 0.02 }, DAYS: { small: 3, mid: 7 }, MIN_CARDS: 8, MIN_FRAC: 0.25, PARALLEL: 2,   // 成本是计划底座算力的比例；流程天数；同时最多 2 项试验（不占作业位）
  ODDS: { tune: { small: 0.8, mid: 0.88 }, arch: { small: 0.55, mid: 0.65 }, mix: { small: 0.7, mid: 0.8 } },
  ODDS_KNOW: 1000, ODDS_KNOW_MAX: 0.15, ODDS_RANGE: [0.2, 0.95],
  PUB: { open: 0.1, paper: 0, proof: -0.1, secret: -0.2 },  // 架构验证的公开程度修正
  GAIN: {                                                   // 成功时拿到表值的 50%–100%；save 是省下的底座算力比例，区间 ±50%
    tune: { small: { save: 0.04, risk: 0.8 }, mid: { save: 0.08, risk: 0.6 } },
    arch: { small: { save: 0.02, risk: 0.7, cut: 0.15 }, mid: { save: 0.04, risk: 0.5, cut: 0.3 } },
    mix: { small: { dim: 1 }, mid: { dim: 2 } },
  },
  GAIN_MIN: 0.5, SAVE_CAP: 0.13, RISK_FLOOR: 0.5, MATCH: 4, EXPIRE: 365,   // 省算力合计 ≤ 13%（≈ 有效算力 ×1.15）；炸炉倍率 ≥ 0.5
  PLAN_MIN: 0.25, REF_MIN_LLM: 4.2e22,                      // 下一代计划总参 ≥ 参照底座的 1/4；参照算力至少 7B × 1T（非语言模型取本模态 small 档）
  KNOW: { small: 1, mid: 2.5, fail: 0.5, perGen: 5 },
  ARCH_TECHS: {                                             // 能做架构验证的技术；值是它配的计划架构（'*' 都配）
    llm: { moe: 'moe', linear_attn: 'hybrid', mla: '*', mtp: '*', fp8: '*', muon: '*', sparse_attn: '*', engram: '*' },
    image: { dit: '*', flow: '*', ar_image: '*' }, music: { codec: '*' }, speech: { flow_tts: '*', s2s: '*' },
  },
};
export const EVAL = {
  TIERS: {                                                  // range 是 P4.2 可调的天数区间
    full: { days: 42, range: [30, 56], adj: 4, cap: 99, filing: true }, standard: { days: 14, range: [14, 28], adj: 2, cap: 99, filing: true },
    quick: { days: 7, range: [4, 10], adj: 0, cap: 80, filing: true }, skip: { days: 0, adj: 0, cap: 62, filing: false },
    legacy: { days: 0, adj: 0, cap: 99, filing: true },     // 只由存档迁移和开局继承的已发布模型写入
  },
  SMALL: 0.5, MIN_DAYS: 4, SKIP_FX: { rep: -3, brand: 0.97 },   // 小模型评测减半；从严、标准、快速至少 4 天
};
