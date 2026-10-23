// 最终公式与常量（与修订稿 §1.3 data/balance.js 新增段一一对应）。
export const Q_W = {
  llm: { knowledge: .22, code: .22, math: .22, writing: .22, agent: .12 },
  image: { aesthetics: .25, adherence: .25, text: .25, realism: .25 }, music: { composition: .25, vocals: .25, lyrics: .25, fidelity: .25 },
  speech: { naturalness: .25, cloning: .25, multilingual: .25, expressive: .25 },
};
export const APPROACH = 0.3;
export const SOTA = { EPS: 0.1, FIELD: 2, FILL_LEAD: 3.0, HIST_SLACK: 1.0, HIST_LOOKAHEAD: 90, GHOST_CAP: 1.0, LOG_MAX: 40 };
export const CURVE = { W0: 1.5, F0: 0.5, B0: 1.0, A0: 0.3, A_MAX: 1.5, F_MAX: 0.85, RHO_MIN: 0.3, RHO_MAX: 2, DIM_SLACK: 3, DIM_STEEP: 2, BIRTH_GAP: 1.0 };
export const EFFORT = {
  COMP: [0.15, 1.2], DATA: [0.1, 1.25], KNOW: [0.3, 1.2], LEAD_STEP: 0.25, LEAD_MAX: 2,
  TRAIN_REF: { llm: { 2023: 1900, 2024: 11600, 2025: 30000, 2026: 73000, 2027: 146000 }, other: { 2023: 80, 2024: 170, 2025: 600, 2026: 1080, 2027: 2000 } },
  KNOW_REF: { llm: { 2023: 120, 2024: 156, 2025: 192, 2026: 228, 2027: 264 }, other: { 2023: 40, 2024: 52, 2025: 64, 2026: 76, 2027: 88 } },
};
export const SOTA_EASE = { maker: 0.6, kin: -0.3, rookie: -0.55, selfReliant: 0.2, selfBuilt: 0.1 };
export const DISTILL_MIX = { SPEED: 2.5, ZONE: 1.5 };
// 市场期待（D11，与修订稿 §1.3 一致）
export const EXPECT = { JUDGE_GAP: 60, CHAMP_LEAD: 1.0, NEAR_MISS: 1.0, CHAL_NEAR: 1.0, OPEN_NEAR: 2.0, CLOSE_BY: 2.0,
  BAND: { frontier: 2, bigtech: 4, major: 5, specialist: 4 }, SMALL_UP: 1.0, REGRESS: 0.1, OPEN_MARGIN: 0.1, COMM_MARGIN: 1.0, COMM_FIELD: 2,
  WORKS_LAG: 365, WORKS_SLACK: 2, WORKS_QUALITY: 1.6, WORKS_COOL: 365, COOL: 180 };
export const KCAP_OFFSET = { knowledge: 6, other: 14 };
export const knowledgeCap = (total, quality) => 52 + 11 * Math.log10(Math.max(total, 0.5)) + 4 * Math.log2(Math.max(quality, 0.5));

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerpYear = (tab, y) => { const i = clamp(Math.floor(y), 2023, 2026); return tab[i] + (tab[i + 1] - tab[i]) * clamp(y - i, 0, 1); };
export const levelMult = l => (l <= 0 ? 0.55 : l < 1 ? 0.8 : l < 2 ? 1.05 : 1.2);

// 储备 ρ：1 + modifier(s,'sotaEase')
export const rhoOf = ease => clamp(1 + ease, CURVE.RHO_MIN, CURVE.RHO_MAX);
export const EASE = { maker: SOTA_EASE.maker, neutral: 0, kin: SOTA_EASE.kin, rookie: SOTA_EASE.rookie };

// 冲顶力 A = fComp · fData · fKnow · fLead（四样同时到位才有用）
export function effort({ trainH100, dataQ, know, lead = 0, mod = 'llm', year, pretraining = false }) {
  const ref = mod === 'llm' ? 'llm' : 'other';
  const fComp = clamp(Math.sqrt(trainH100 * (pretraining ? 0.25 : 1) / lerpYear(EFFORT.TRAIN_REF[ref], year)), ...EFFORT.COMP);
  const fData = clamp(dataQ / 2, ...EFFORT.DATA);
  const fKnow = clamp(know / lerpYear(EFFORT.KNOW_REF[ref], year), ...EFFORT.KNOW);
  const fLead = 1 + EFFORT.LEAD_STEP * Math.min(EFFORT.LEAD_MAX, lead);
  return { A: Math.min(CURVE.A_MAX, fComp * fData * fKnow * fLead), fComp, fData, fKnow, fLead };
}
// 难度参数：F 贴线速度、b 越线衰减宽度、W 落后区宽度
export function hardness(A, rho) {
  const F = Math.min(CURVE.F_MAX, CURVE.F0 * rho * clamp((A - CURVE.A0) / (1 - CURVE.A0), 0, CURVE.A_MAX));
  return { F, b: CURVE.B0 * rho, W: CURVE.W0 / rho };
}
export function H(delta, { F, b, W }) {
  return delta <= 0 ? 1 - (1 - F) * Math.exp(delta / W) : F * Math.exp(-delta / b);
}
// 锚点（D6.2）：只看对手和史实，不含玩家快照。
//   W 对手最强（null = 没有可见对手）；HO 别家真实主线最强；OG 本公司真实主线（提前 HIST_LOOKAHEAD 天），只有 sotaMade 才给；
//   lead = 玩家正持标或没有可见对手：OG 全额；否则 OG 最多算到 W + GHOST_CAP。都没有时用临时锚 temp。
export function anchorOf({ W = null, HO = null, OG = null, made = false, lead = false, temp = null }) {
  const own = made && OG !== null ? (lead || W === null ? OG - SOTA.HIST_SLACK : Math.min(OG - SOTA.HIST_SLACK, W + SOTA.GHOST_CAP)) : -Infinity;
  const r = Math.max(W ?? -Infinity, HO !== null ? HO - SOTA.HIST_SLACK : -Infinity, own);
  return r > -Infinity ? r : temp;
}
// 蒸馏那一份的系数（不吃 H）：离 qCapD 最后 ZONE 分线性收口
export const distFade = (q, qCapD) => clamp((qCapD - q) / DISTILL_MIX.ZONE, 0, 1);
