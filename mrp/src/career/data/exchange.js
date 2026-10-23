// 自洽和联机的股市常数（规格 §1.3a，M2）。只有自洽和联机读，史实模式不读。校准时只在注释写明的区间内调。
// M2a 用 EXCHANGE；M2b 用 TRANSFER、DISTILL_WATCH、LICENSE_TERMS、POACH、NEWBIE、TRADEMARK。
export const EXCHANGE = {
  FEE: 0.003, DAY_CAP: 0.05, LIMIT: 0.20, PULL: 0.10,               // DAY_CAP：每家每天对同一只股票的累计成交额 ≤ 池中现金的 5%
  IPO: { days: 90, discount: 0.85, issue: [0.1, 0.2, 0.3], poolPart: 0.5, lock: 180, minVal: 3e9, quarters: 2 },
  OWN: { buybackFreezeDays: 60 },                                    // 回购价 max(池价, V/股)，增发价 min(池价, V/股)，都受 DAY_CAP；终局前 60 天禁回购
  HOLD: { cap: 0.25, disclose: 0.05, step: 0.01, report: 0.10 },
  SHORT: { lendPart: 0.5, im: 1.5, mm: 1.3, cap: 0.15, dropBan: 0.10, fee: [0.01, 0.6, 1.5], afterListing: 180 },
  RESTRUCTURE: { negDays: 60, max: 1, gpuSale: 0.5, issueAt: 0.5, keepEquity: 0.3, team: 0.7, months: 3, freeze: 180 },
};
export const DISTILL_WATCH = { BASE: 0.005, TOK: 1e9, FOCUS: 1.6, BIG: 1.5, SPREAD: 0.5, SPREAD_COST: 1.4, STRICT: 2.5,
  EVID_FRAC: 0.25,                                                   // 抽取不到 0.25 个包算证据不足（= GEN.cancelKeep）
  FX: { shock: -0.08, unlisted: -0.05, rep: -3, ban: 180, sue: 3, license: 3, backlash: -2 } };   // BASE 区间 0.002–0.008；M2b 用困难电脑校准为 0.005（默认 6 家每局查出 1.0 次）
export const LICENSE_TERMS = { brandStep: 1.01, brandCap: 1.10, minShare: 0.005, royalty: 0.05, bigShare: 0.15 };
export const POACH = { share: 0.03, cost: 2, gap: 180, slow: 0.8, days: 60, gain: 0.5 };
export const TRADEMARK = { dist: 2, days: 30, settle: 0.1, oncePerName: true };
// 公司之间的钱（M.5.9）：付方付 100%，收方只入账 60%；同一对公司每个游戏年最多 2 个 API 数据包（对方限流）。
export const TRANSFER = { BOOK: 0.6, API_PACKS: 2 };
// 新手保护（M.5.7）：进场 120 天内不能被做空、被挖人；违规照样检测、照样记账，保护期一过就能追究。
export const NEWBIE = { days: 120 };
