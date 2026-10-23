// 规格 T 章（训练作业）在 data/balance.js 里追加的四组常量（第 2 版，按两位评审的意见修订）。模拟脚本和规格 §1.3 用同一份数值（P4.2 只在注释写的区间内调；check/same.mjs 核对）。
export const JOBS = {
  SLOTS: { base: 2, team: 30, cards: 256, min: 2, max: 6 }, // 作业位 = max(按人 clamp(2 + ⌊log2(团队/30)⌋, 2, 6)，按卡 clamp(2 + ⌊log2(自用卡/256)⌋, 2, 6)) + round(jobSlots)；试验不占作业位
  WEIGHT: { high: 3, normal: 1 },                           // 优先 / 正常 的分卡权重；都没封顶时 3:1 正好是旧的 75/25
  MEM: { pretrain: 16, post: 4, card: 80 },                 // 最低卡：预训练 ⌈16 × 总参(B) / 80⌉（和 structureCheck 同一条显存规则）；后训练 ⌈4 × 总参 / 80⌉（只放权重加 LoRA 一类的省显存做法）
  NONLLM_MIN: 8,                                            // 非语言模型底座的最低卡（一台机器，和 previewProject 的 minGpus 一致）
  FAST: { base: 20, perDecade: 14, max: 60, nonLlm: 20 },   // 预训练最快天数 = clamp(20 + 14·log10(总参/7), 20, 60)；base 区间 14–30
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
    full: { days: 42, range: [30, 56], adj: 4, cap: 99, filing: true }, standard: { days: 21, range: [14, 28], adj: 2, cap: 99, filing: true },
    quick: { days: 7, range: [4, 10], adj: 0, cap: 80, filing: true }, skip: { days: 0, adj: 0, cap: 62, filing: false },
    legacy: { days: 0, adj: 0, cap: 99, filing: true },     // 只由存档迁移和开局继承的已发布模型写入
  },
  SMALL: 0.5, MIN_DAYS: 4, SKIP_FX: { rep: -3, brand: 0.97 },   // 小模型评测减半；从严、标准、快速至少 4 天
};
