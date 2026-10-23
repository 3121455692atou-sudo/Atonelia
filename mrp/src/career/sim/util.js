export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const sigmoid = x => 1 / (1 + Math.exp(-x));
export const round1 = v => Math.round(v * 10) / 10;
// 品牌是乘数，统一夹在 0.02–12。效果词表的 brand 键，和发布、论文这类直接改品牌的地方都走这里。返回实际乘上去的倍数。
export function scaleBrand(s, f) { const b = s.brand; s.brand = clamp(b * f, 0.02, 12); return b > 0 ? s.brand / b : 1; }

// 状态内的种子随机数（mulberry32），存档后可复现。
export function rand(s) {
  let t = (s.rng = (s.rng + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const pick = (s, list) => list[Math.floor(rand(s) * list.length)];

// 与状态无关的确定性哈希噪声，用于对手模型跑分的固定偏差。
export function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

export function fmtMoney(v) {
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1e8) return `${sign}${(a / 1e8).toFixed(a >= 1e10 ? 0 : 1)} 亿美元`;
  if (a >= 1e4) return `${sign}${(a / 1e4).toFixed(a >= 1e6 ? 0 : 1)} 万美元`;
  return `${sign}${Math.round(a)} 美元`;
}
export function fmtCount(v) {
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)} 亿`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(v >= 1e6 ? 0 : 1)} 万`;
  return String(Math.round(v));
}
