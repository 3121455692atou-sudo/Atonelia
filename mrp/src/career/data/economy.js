// 经济（规格 K 章）：推理成本、人才溢价、自有卡运维和折旧、泡沫检查点。史实、自洽、联机共用；校准只在注释写明的区间内调。
// 推理成本：服务掉的 token × 单价；单价 = 当月该地区 API 参考价 × K × (激活参数 ÷ 37B)^0.8 ÷ 架构速度 ÷ 推理加成。
// 标准价档、37B 激活的模型 API 毛利 = 1 − K。K 区间 0.45–0.75（现实毛利 30%–50%）。
export const SERVE = { K: 0.6, BASE_ACTIVE: 37, EXP: 0.8 };
// 人才溢价（含股权激励）：人工 = 团队 × 国家月薪 × 档位溢价 × 年份系数。区间：前沿 3–6，年份 2026 年 1.3–2.0。
export const TALENT = {
  tier: { frontier: 3.0, bigtech: 2.2, major: 2.2, specialist: 1.5, small: 1.0 },
  year: [['2023-01', 1.0], ['2025-01', 1.3], ['2026-06', 1.6]],
};
// 自有卡：每月运维（电、机房、网络）= 买价 × OPEX，不低于 OPEX_MIN；折旧 = 买价 ÷ DEP_MONTHS，从这款卡上市起算，满了就不再折。
export const GPU_COST = { OPEX: 0.015, OPEX_MIN: 200, DEP_MONTHS: 48 };
// 前沿研发开支（K3 第 5 条）：游戏里的机群只有现实的几分之一，机群以外的大规模实验、失败重跑、合成数据和人工标注每月扣两项：
//   机群（自有加租用）按买价的价值 × 月比例 × 档位系数（区间：2026 年 0.03–0.15）；
//   上个月客户收入 × 再投入比例（收入越多，签的算力合同越大；区间：前沿 0.3–0.6）。
export const RD = {
  rate: [['2023-01', 0.012], ['2024-06', 0.025], ['2025-06', 0.045], ['2026-06', 0.055]],
  tier: { frontier: 1.0, bigtech: 0.8, major: 0.8, specialist: 0.3, small: 0.3 },
  reinvest: { frontier: 0.6, bigtech: 0.35, major: 0.45, specialist: 0.1, small: 0.05 },
};
// 上市以后照样能增发（史实模式；自洽和联机走交易所的 stockIssue）：按估值出让的比例。
export const FOLLOW_ON = [0.05, 0.1, 0.15];
// AI 泡沫破裂（规格 K5，虚构剧情）。史实局的检查点在真实的 2026-07“AI 芯片热退潮”之前；自洽和联机在开局后 75% 处。
// 检查点之前连续 PROFIT_MONTHS 个月经营利润为正的大公司能躲过（史实看玩家自己，自洽和联机任何一家就够）。
export const BUBBLE = {
  HIST_DAY: '2026-06-01', WORLD_FRAC: 0.75, PROFIT_MONTHS: 3, BIG: ['frontier', 'bigtech', 'major'],
  DAYS: 180, VAL: 0.5, HYPE: 0.6, GPU_RESALE: 0.6, RENT: 0.7,
  DEMAND: { api: 0.8, chat: 0.9, sub: 0.9, coding: 0.85 },
  AVERT: { brand: 1.1, valuation: 1.2 },
  // 结算加分（finish.js）：熬过寒冬、扭亏为盈（隐藏成就）。P4.2：史实局的泡沫对所有人都判、几乎没人躲得过，
  // “熬过寒冬”成了人人都有的加分，而“活下去”目标已经算进目标分，所以设 0，只留扭亏为盈。
  SCORE: { winter: 0, profit: 8 },
};
// 融资渠道（规格 K4）。COOLDOWN：两轮之间至少隔多少天（含增发、战略投资）。
// BOOST：重大成果之后的融资估值倍数和成功率加成（拿到 SOTA 90 天 ×1.4；千禧年难题 180 天 ×2.5），取最大的那一项，不叠加。
// STRATEGIC：大公司（前沿、大厂、主要，估值 ≥ 100 亿）每年一次的战略投资：出让 10%，之后一年租卡 85 折。
// LOAN：显卡抵押贷款，借款上限 = 自有卡回收价 × LTV，年息 RATE，按月付息；回收价跌到借款以下就追加（先扣现金，不够卖卡）。
// MILLENNIUM：虚构的“千禧年难题”：在线旗舰会推理（掌握推理技术）、数学 ≥ 95 时，每月按（公司、月份）散列 3% 触发；全局只发生一次。
export const FUNDING = {
  COOLDOWN: 180,
  BOOST: { sota: 1.4, sotaDays: 90, millennium: 2.5, millenniumDays: 180, p: 0.15 },
  STRATEGIC: { frac: 0.1, every: 365, rentMult: 0.85, days: 365, tiers: ['frontier', 'bigtech', 'major'], minVal: 1e10 },
  LOAN: { ltv: 0.5, rate: 0.12 },
  MILLENNIUM: { tech: 'reasoning', math: 95, p: 0.03, brand: 1.15 },
};
