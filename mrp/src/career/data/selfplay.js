// 自洽与联机专用的默认值（规格 §1.3a、M.1、M.2）。史实模式不读这个文件。
// M1a 只写世界核心要用的最小一份；价格、算力、估值、交易所的常数由 M1b、M2 补全。
export const SELF = {
  TIERS: ['small', 'specialist', 'major'], TIER: 'specialist',      // 从零局可选的开局档；默认人人“初创”
  SIZE: { min: 3, max: 12, def: 6 },                                 // 从零局公司总数（真人加电脑）
  FORK_KEEP: { desktop: 12, phone: 8 },                              // 分岔局在场家数上限，其余冻结成前人遗产
  LENGTH: { short: 365, std: 730, long: 1095 }, DEF_LENGTH: 'std',   // 结束日一律不晚于 END
  ID: /^c_[a-z0-9]{6}$/,
  DEFEND_NEAR: 1.0,                                                  // 挑战要算数：挑战者 q ≥ 持有者 − 1（区间 0.5–2）
  STEADY_DAYS: 30,                                                   // 领先 ≥ FILL_LEAD 连续多少天也算炼出（区间 30–90）
  EFFORT_REF: { T: 0.85, K: 0.9 },                                   // 冲顶力参照 = 在场公司中位数 × 这个倍数（区间 0.7–2）；T 调低一点，领先者的后训练不会长期停住
  EFFORT_FLOOR: { T: 0.02, K: 0.1 },                                 // 参照不低于日历值的这个比例（区间 T 0.01–0.1，K 0.05–0.3）
  NEWBIE_DAYS: 120,                                                  // 新手保护（区间 60–180）
  TECH_AUTO: { proofToPaper: 365, paperToOpen: 180 },                // 没人主动公开时，学界反推、复现的天数
  BOT_HORIZON: 120,                                                  // 电脑立项工期上限（天），取代 T9.1 的 150；缩短换代间隔，“前沿停滞”先调它（区间 120–300）
  BOT_EVERY: { easy: 14, normal: 7, hard: 3, passive: 1 },          // 电脑公司多久想一次（M.3.12）；难度差异 M1c 再接
};

// 客户市场（M.3.8 第 1、2 条）：“不用 AI”的权重、d* 市场的 90 天平滑、领先真实历史时的封顶倍数。
export const MARKET_SELF = {
  OUTSIDE: { chat: 0.5, subscription: 0.8, api: 0.3, coding_plan: 0.6 },   // 区间 ×0.5–×2
  SMOOTH: 90,
  AHEAD_CAP: 1.3,
};
// 算力池（M.3.8 第 3 条）：世界总供给 = Σ 开局档配额 × MULT；季末统一价、租金都按需求/供给的幂次。
export const SUPPLY_SELF = { MULT: 2, PRICE_EXP: 0.5, RENT_EXP: 0.5, RENT_FLOOR: 0.5 };
// 基本面估值（M.3.8 第 4 条）。
export const VALUE_SELF = {
  MULT: 15, W_REV: 0.6, W_Q: 0.25, W_EXP: 0.3, EXP_DAYS: 90, UNLISTED: 0.8,
  GPU_RESALE: 0.55, SENT: [0.7, 1.2],                                      // MULT 区间 8–30
};
// 指数（M.3.8 第 6 条）：算力指数 = 100 × (本季买卡数 ÷ 开局季度)^0.3 × (1 + 冲击项)。
export const INDEX = { CHIP_EXP: 0.3, SHOCK_DAYS: 90, IPO_MIN: 0.8 };

export const BRAND_BLACKLIST = ['ai', 'gpt', 'llm', 'lm', 'chat', 'model', 'pro', 'max', 'mini', 'open', 'lab', '大模型', '智能', '模型'];

export const ACAD = {
  REAL_GAP: 4, PROBE_GAP: 3, PROBE_MONTHS: 4,                        // 起点 = min(开局前真实开源最强 − 4, 最弱档 4 个月内最好底座 − 3)
  OPEN_LAG: 90, OPEN_GAP: 2, TECH_GAIN: 0.4, BELOW_TOP: 1.0, STEP: 0.5, BRAND: 0.08,
};

// 从零局电脑公司的开局路线，按种子轮流取（M.3.12）。
export const ROUTE_MIX = ['open', 'open_restricted', 'closed'];

export const TIER_LABEL = { small: '小作坊', specialist: '初创', major: '大厂' };

// 从零局电脑公司的名字和品牌（单人设置页、联机大厅共用）：真人先占座位，其余按顺序补到总数，和真人重名的跳过。
export const BOT_COMPANIES = [
  { name: '青穹智能', brand: '青穹' }, { name: '远望智能', brand: '远望' }, { name: '星环实验室', brand: '星环' },
  { name: '赤道模型', brand: '赤道' }, { name: '白泽智能', brand: '白泽' }, { name: '风眼科技', brand: '风眼' },
  { name: '北岭实验室', brand: '北岭' }, { name: '蓝鲸智能', brand: '蓝鲸' }, { name: '泰拉模型', brand: '泰拉' },
  { name: '流光智能', brand: '流光' }, { name: '山巅科技', brand: '山巅' }, { name: '极光智能', brand: '极光' },
];

// 默认的六家公司（M.2.3）。大厅以后可以逐家改名字、国家、开局档；M1a 只支持这一份。
export const DEFAULT_COMPANIES = [
  { name: '极光智能', brand: '极光', country: 'CN', tier: 'specialist', kind: 'bot' },
  { name: '北岭实验室', brand: '北岭', country: 'US', tier: 'specialist', kind: 'bot' },
  { name: '蓝鲸智能', brand: '蓝鲸', country: 'EU', tier: 'specialist', kind: 'bot' },
  { name: '泰拉模型', brand: '泰拉', country: 'US', tier: 'specialist', kind: 'bot' },
  { name: '流光智能', brand: '流光', country: 'CN', tier: 'specialist', kind: 'bot' },
  { name: '山巅科技', brand: '山巅', country: 'EU', tier: 'specialist', kind: 'bot' },
];
