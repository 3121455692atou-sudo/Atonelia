// 算力供给：下单到交货要多久、每个季度能拿到多少。缺卡的不只是中国公司：
// 2023 年 H100 交期普遍 36–52 周，2024 年缩到 8–12 周；2025 年上半年 GB200 整柜交付很慢，下半年才放量；
// 新一代卡刚上市的头两个季度，英伟达按大客户分配，小公司排在后面。云上租卡一般几天到两周能开通。
import { GPUS, monthsBetween } from './core.js';

// 交期（天）：[上市后的月数, 天数] 分段，越往后越好买。
export const LEAD = {
  A100: [[0, 90], [12, 45], [24, 30]],
  A800: [[0, 60]],
  H100: [[0, 270], [6, 180], [12, 90], [24, 45]],
  H800: [[0, 120], [6, 75]],
  H20: [[0, 60], [12, 40]],
  H200: [[0, 150], [6, 90], [12, 50]],
  B200: [[0, 210], [6, 120], [12, 60]],
  B300: [[0, 180], [6, 90]],
  Rubin: [[0, 240], [6, 150]],
  Ascend910B: [[0, 90], [12, 60]],
  Ascend910C: [[0, 120], [6, 75]],
  Ascend950: [[0, 150], [6, 90]],
};
// 每季度能买到的张数（按公司体量）。新卡上市头两个季度减半；中国公司进口 H200 另有许可上限。
export const QUOTA = { frontier: 30000, bigtech: 15000, major: 4000, specialist: 1500, small: 512 };
// 每月能在云上新租到的张数。
export const RENT_QUOTA = { frontier: 20000, bigtech: 10000, major: 3000, specialist: 1000, small: 256 };
export const RENT_LEAD = 10;
// 灰色渠道：转运要一到两个月，路上可能被扣。
export const SMUGGLE_LEAD = [30, 60];
export const SMUGGLE_SEIZE = 0.1;

export function leadDays(id, date) {
  const steps = LEAD[id] || [[0, 60]];
  const age = Math.max(0, monthsBetween(GPUS[id].from, date));
  let d = steps[0][1];
  for (const [m, v] of steps) if (age >= m) d = v;
  return d;
}
export function quarterOf(date) { return `${date.slice(0, 4)}Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`; }
export function quotaFor(tier, id, date) {
  const fresh = monthsBetween(GPUS[id].from, date) < 6 ? 0.5 : 1;
  return Math.round((QUOTA[tier] || 512) * fresh / 64) * 64;
}

// 数据交付（天）：原来按月的大型授权照旧，现成的数据也要一到三周整理、清洗、过审。
export const dataLeadDays = ds => (ds.months > 0 ? ds.months * 30 : ds.kind === 'pre' ? 21 : 10);
// 新版本灰度上线：越大的模型部署越慢；同一条线两次发布至少隔两周。
export const deployDays = model => Math.round(Math.min(14, Math.max(3, 3 + (model.active || 7) / 12)));
export const RELEASE_GAP = 14;
