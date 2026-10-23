import { classTop } from '../data/goals.js';

// 自洽世界的董事会目标检查（规格 M.3.11）：相对目标里的 share、valMult、topFrac 三个新判定放在这里。
// 模板本身在 data/goals.js 的 SELF_GOALS；board.js 生成目标时读 P().goals(s)，判定时调这里的函数。
// 自洽模板的阈值都是“相对自己”的：份额对平均份额、估值对开局估值、名次对在场公司数，所以不写死年份和金额。

// 竞技场“世界前一半”：topFrac 是在场公司数的比例，向上取整（6 家要前 3）。学界不计名次。
// 没有 topFrac 时照旧：同量级榜按 classTop(对手数)，总榜按 check.top。
export function rankTopOf(check, of) {
  const n = Math.max(1, Math.floor(Number(of) || 0));
  if (Number.isFinite(check?.topFrac) && check.topFrac > 0) return Math.max(1, Math.ceil(n * check.topFrac));
  if (check?.classOnly) return classTop(n - 1);
  return Number.isFinite(check?.top) ? check.top : n;
}

// API 份额与平均份额（含“不用 AI”）。数据由 world/market.js 的 apiShareOf 在每天开盘镜像进 s.world。
export function apiShareSnapshot(s) {
  const share = Number(s?.world?.apiShare || 0);
  const avg = Number(s?.world?.apiAvg || 0);
  return { share, avg };
}
export function checkShareGoal(s, check = {}) {
  const { share, avg } = apiShareSnapshot(s);
  const minFrac = Number.isFinite(check.minFrac) ? check.minFrac : 0.5;
  const pass = avg > 0 && share >= avg * minFrac;
  const p = x => `${Math.round(x * 1000) / 10}%`;
  return {
    pass,
    detail: avg > 0 ? `API 份额 ${p(share)}（平均 ${p(avg)}，要求不低于平均的一半）` : '还没有 API 月结数据',
  };
}

// 估值三倍：V 达到开局估值的 mult 倍（默认 3）。
export function valMultiple(s) {
  const base = Math.max(Number(s?.valuationStart) || 0, 1);
  return (Number(s?.valuation) || 0) / base;
}
export function checkValMultGoal(s, check = {}) {
  const mult = Number.isFinite(check.mult) ? check.mult : 3;
  const got = valMultiple(s);
  return { pass: got >= mult, detail: `估值是开局的 ${Math.round(got * 100) / 100} 倍（要求 ${mult} 倍）` };
}
