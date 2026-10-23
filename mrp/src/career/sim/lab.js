// 试验（试水，规格 T5，P2.4a）：给“下一代计划”做小规模的调参、架构验证、数据配比。
// 结果用哈希定（不碰 rand），成功的结论留到下一个匹配的底座立项时用掉：省算力、少炸炉、某一维出生加分；
// 架构验证还能让还在研究的那项技术少做一截（每项技术只有一次机会）。防刷：加成按实际用量打折，技术积累每代封顶。
import { TECH_BY_ID, SCALES, ARCHS, dimLabel } from '../data/core.js';
import { LAB } from '../data/balance.js';
import { clamp, hash01 } from './util.js';
import { daysBetween } from './clock.js';
import { previewProject, workingModel, liveModel, scaleById } from './model.js';
import { techStatus } from './research.js';
import { Q_W } from './sota.js';
import { log } from './log.js';

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
export const TRIAL_LABEL = { tune: '调参', arch: '架构验证', mix: '数据配比' };
export const SIZE_LABEL = { small: '小档', mid: '中档' };

// ---------- 参照底座与计划（T5.1） ----------
// 参照底座：主线在练模型；没有就用在线旗舰；都没有（开局还没有自己的模型）就没有参照。
export function refModel(s) {
  const w = workingModel(s);
  if (w && w.stage === 'post') return w;
  return liveModel(s);
}
// 计划写成立项表单的配置：语言模型 { total, active, arch, tokens }，其余 { scaleId, tokens }。
export function planOk(s, cfg) {
  if (!isObj(cfg)) return '还没定下一代计划';
  if (!(Number.isFinite(cfg.tokens) && cfg.tokens > 0)) return '计划的训练 token 必须是大于 0 的数';
  if (s.mod !== 'llm') return scaleById(s.mod, cfg.scaleId) ? '' : '计划的规模不认识';
  if (!(Number.isFinite(cfg.total) && Number.isFinite(cfg.active) && cfg.total >= 0.5 && cfg.active >= 0.5 && cfg.active <= cfg.total)) return '计划的参数量不对';
  return '';
}
const planArch = cfg => cfg.arch || (cfg.active < cfg.total ? 'moe' : 'dense');
const scaleIndex = (mod, id) => SCALES[mod].findIndex(x => x.id === id);
// 计划的下限（T5.1）：语言模型总参 ≥ 参照底座的 1/4；非语言模型不低于参照底座的档位减一档。没有参照底座时不设下限。
export function planFloor(s, cfg) {
  const r = refModel(s);
  if (!r) return '';
  if (s.mod === 'llm') {
    const min = r.total * LAB.PLAN_MIN;
    return cfg.total < min ? `计划太小：至少要参照底座（${r.total}B）的四分之一，也就是 ${Math.ceil(min * 10) / 10}B` : '';
  }
  const ri = scaleIndex(s.mod, r.scaleId), pi = scaleIndex(s.mod, cfg.scaleId);
  return ri >= 0 && pi >= 0 && pi < ri - 1 ? '计划太小：最多比参照底座低一档' : '';
}
const planNeed = (s, cfg) => previewProject(s, s.mod === 'llm' ? { total: cfg.total, active: cfg.active, arch: planArch(cfg), tokens: cfg.tokens } : { scaleId: cfg.scaleId, tokens: cfg.tokens }).need;
// 参照算力（T5.6）= max(参照底座按今天的技术重算的 need, 本模态最小底座的 need)。开局继承的模型没有训练记录时 token 按每个激活参数 20 个估。
export function refNeed(s) {
  const r = refModel(s);
  const floor = s.mod === 'llm' ? LAB.REF_MIN_LLM : (() => { const sc = SCALES[s.mod].find(x => x.cls === 'small') || SCALES[s.mod][0]; return sc.pretrainH100 * 1e21 * 0.6; })();
  if (!r) return floor;
  const tokens = r.pretraining?.tokens ?? (s.mod === 'llm' ? Math.max(0.1, Math.round(20 * (r.active || r.total || 7) / 100) / 10) : 1);
  const need = s.mod === 'llm'
    ? previewProject(s, { total: r.total, active: Math.min(r.active || r.total, r.total), arch: ARCHS[r.arch] ? r.arch : 'dense', tokens }).need
    : (r.scaleId && scaleById(s.mod, r.scaleId) ? previewProject(s, { scaleId: r.scaleId, tokens }).need : floor);
  return Math.max(Number.isFinite(need) ? need : 0, floor);
}
// 研究缩短和技术积累的系数 p_ref = min(1, 试验成本 ÷ (档位比例 × 参照算力))。
export const pRef = (s, cost, size) => Math.min(1, cost / (LAB.SHARE[size] * refNeed(s)));

// ---------- 成功率与收益（T5.2、T5.3） ----------
const pubAdj = (s, tech) => LAB.PUB[techStatus(s, TECH_BY_ID[tech]).level] ?? 0;
export function trialOdds(s, type, size, tech) {
  let o = LAB.ODDS[type][size] + Math.min(LAB.ODDS_KNOW_MAX, Math.max(0, s.know || 0) / LAB.ODDS_KNOW);
  if (type === 'arch' && tech) o += pubAdj(s, tech);
  return clamp(o, ...LAB.ODDS_RANGE);
}
// 架构验证能选的技术：配得上计划架构；已掌握的，或正在研究槽里的。
const archTable = s => LAB.ARCH_TECHS[s.mod] || {};
export function archFits(s, tech, cfg) {
  const want = archTable(s)[tech];
  if (!want) return false;
  return want === '*' || (s.mod === 'llm' && want === planArch(cfg));
}
export function archChoices(s, cfg) {
  return Object.keys(archTable(s)).filter(t => archFits(s, t, cfg) && ((s.techs || []).includes(t) || (s.research || []).some(r => r.id === t)));
}
const mixDims = s => Object.keys(Q_W[s.mod] || {});

// 试验的预估 → { ok, reason, cost, days, odds, gains: 文案, pRef, plan, inResearch }。spec：{ type, size, tech?, dim?, plan? }，plan 不给就用 s.jobs.plan。
export function trialPreview(s, spec = {}) {
  const no = reason => ({ ok: false, reason });
  const plan = spec.plan ?? s.jobs?.plan ?? null;
  const bad = planOk(s, plan);
  if (bad) return no(bad === '还没定下一代计划' ? '先定下一代计划：试验都是给下一代底座做的' : bad);
  const { type, size } = spec;
  if (!LAB.ODDS[type]) return no('没有这种试验');
  if (!LAB.SHARE[size]) return no('试验只有小档和中档');
  if (type === 'arch' && !archFits(s, spec.tech, plan)) return no(archTable(s)[spec.tech] ? '这项技术配不上计划的架构' : '这项技术不能做架构验证');
  if (type === 'arch' && !(s.techs || []).includes(spec.tech) && !(s.research || []).some(r => r.id === spec.tech)) return no('只能验证已经掌握、或正在研究的技术');
  if (type === 'mix' && !mixDims(s).includes(spec.dim)) return no('数据配比要选一个计入综合分的维度');
  const floor = planFloor(s, plan);
  if (floor) return no(floor);
  const need = planNeed(s, plan);
  if (!(Number.isFinite(need) && need > 0)) return no('计划的算力需求算不出来');
  const cost = LAB.SHARE[size] * need;
  const odds = trialOdds(s, type, size, spec.tech);
  const g = LAB.GAIN[type][size];
  const lo = LAB.GAIN_MIN, pct = v => `${Math.round(v * 100)}%`;
  const gains = type === 'mix' ? `那一维出生 +${(g.dim * lo).toFixed(1)}–${g.dim.toFixed(1)}`
    : `省算力 ${pct(g.save * lo)}–${pct(g.save)}，炸炉 ×${(1 - (1 - g.risk) * lo).toFixed(2)}–${g.risk.toFixed(2)}${g.cut ? `；技术还在研究时，剩余工作量少 ${pct(g.cut * lo)}–${pct(g.cut)}（每项技术一次）` : ''}`;
  const inResearch = type === 'arch' && !(s.techs || []).includes(spec.tech);
  return { ok: true, reason: '', cost, days: LAB.DAYS[size], odds, gains, pRef: pRef(s, cost, size), plan: { ...plan }, inResearch, need };
}
export function trialCheck(s, spec) {
  const p = trialPreview(s, spec);
  if (!p.ok) return p;
  const n = (s.jobs?.list || []).filter(j => j.kind === 'trial').length;
  if (n >= LAB.PARALLEL) return { ok: false, reason: `同时最多 ${LAB.PARALLEL} 项试验：先等一项做完` };
  return p;
}

// ---------- 结果（T5.3、T5.4、T5.6） ----------
export function trialOutcome(s, job) {
  return { ok: hash01(`${s.seed}|${job.id}|ok`) < job.odds, g: LAB.GAIN_MIN + (1 - LAB.GAIN_MIN) * hash01(`${s.seed}|${job.id}|gain`) };
}
const findingScore = f => f.save + (1 - f.risk) + f.dimBonus;
const sameKind = (a, b) => a.type === b.type && (a.tech ?? null) === (b.tech ?? null) && (a.dim ?? null) === (b.dim ?? null);
// 做完一项试验：成功的结论进 findings（同种只留最好的一条）；架构验证第一次做完就记进 techCut，成功又在研究的才缩短；技术积累按每代封顶。
export function finishTrial(s, job, out = null) {
  const J = s.jobs;
  J.list = J.list.filter(j => j !== job);
  const { ok, g } = trialOutcome(s, job);
  const gain = LAB.GAIN[job.type][job.size];
  const p = pRef(s, job.cost, job.size);
  const dim = job.dim ? dimLabel(s.mod, job.dim) : '';
  const name = `试验 · ${TRIAL_LABEL[job.type]}${SIZE_LABEL[job.size]}${job.tech ? `（${TECH_BY_ID[job.tech]?.name || job.tech}）` : ''}${job.dim ? `（${dim}）` : ''}`;
  let text;
  if (ok) {
    const f = { id: job.id, type: job.type, size: job.size, ...(job.tech ? { tech: job.tech } : {}), ...(job.dim ? { dim: job.dim } : {}), target: { ...job.target }, cost: job.cost,
      save: (gain.save || 0) * g, risk: gain.risk ? 1 - (1 - gain.risk) * g : 1, dimBonus: (gain.dim || 0) * g, day: s.day };
    const i = J.findings.findIndex(x => sameKind(x, f));
    if (i < 0) J.findings.push(f); else if (findingScore(f) > findingScore(J.findings[i])) J.findings[i] = f;
    text = job.type === 'mix' ? `${name}成功：下一代底座的${dim}出生 +${f.dimBonus.toFixed(1)}` : `${name}成功：下一代底座省算力 ${(f.save * 100).toFixed(1)}%，炸炉 ×${f.risk.toFixed(2)}`;
  } else text = `${name}没成：${job.size === 'mid' ? '小规模有效，放大以后不稳' : '没看出差别'}`;
  // 研究缩短：每项技术只有一次机会（第一次做完就记上，失败也算）。
  if (job.type === 'arch' && job.tech && !J.techCut[job.tech]) {
    J.techCut[job.tech] = true;
    const r = (s.research || []).find(x => x.id === job.tech);
    if (ok && r && !(s.techs || []).includes(job.tech)) {
      const cut = gain.cut * g * p * Math.max(0, r.need - r.done);
      if (cut > 0) { r.done += cut; text += `；「${TECH_BY_ID[job.tech]?.name || job.tech}」的研究少做了 ${Math.round(cut)} 人天`; }
    }
  }
  // 技术积累：每一代主线（s.gen）合计最多 LAB.KNOW.perGen。
  const k = (ok ? 1 : LAB.KNOW.fail) * LAB.KNOW[job.size] * p;
  const used = J.trialKnow[s.gen] || 0;
  const add = Math.max(0, Math.min(k, LAB.KNOW.perGen - used));
  if (add > 0) { J.trialKnow[s.gen] = used + add; s.know = (s.know || 0) + add; }
  out?.notes?.push(`${text}。`);
  log(s, text);
  return { ok, g };
}

// ---------- 用掉结论（T5.5） ----------
// 匹配：同架构、总参在计划的 1/4 到 4 倍之间（非语言模型同一档或相邻档）；不超过一年；架构验证还要立项时已经掌握那项技术。
export function matchFindings(s, cfg) {
  return (s.jobs?.findings || []).filter(f => {
    if (daysBetween(f.day, s.day) > LAB.EXPIRE) return false;
    if (f.type === 'arch' && !(s.techs || []).includes(f.tech)) return false;
    if (s.mod !== 'llm') { const a = scaleIndex(s.mod, f.target.scaleId), b = scaleIndex(s.mod, cfg.scaleId); return a >= 0 && b >= 0 && Math.abs(a - b) <= 1; }
    return planArch(f.target) === planArch(cfg) && cfg.total >= f.target.total / LAB.MATCH && cfg.total <= f.target.total * LAB.MATCH;
  });
}
// 用掉匹配的结论：按实际立项底座打折前的 need0 打折，省算力合计 ≤ 13%，炸炉倍率 ≥ 0.5；数据配比按维相加。
// apply = false 只算不删（立项表单的预览）。返回 { save, risk, dims, used: [结论 id], back: [结论原件] }。
export function consumeFindings(s, cfg, need0, apply = true) {
  const list = matchFindings(s, cfg);
  let keep = 1, risk = 1;
  const dims = {};
  for (const f of list) {
    const p = Math.min(1, f.cost / (LAB.SHARE[f.size] * need0));
    keep *= 1 - f.save * p;
    risk *= 1 - (1 - f.risk) * p;
    if (f.dimBonus > 0 && f.dim) dims[f.dim] = (dims[f.dim] || 0) + f.dimBonus * p;
  }
  if (apply && list.length) s.jobs.findings = s.jobs.findings.filter(f => !list.includes(f));
  return { save: Math.min(LAB.SAVE_CAP, 1 - keep), risk: Math.max(LAB.RISK_FLOOR, risk), dims, used: list.map(f => f.id), back: list.map(f => ({ ...f })) };
}
// 取消底座：用掉的结论退回 findings（同种只留最好的一条）。
export function returnFindings(s, lab) {
  for (const f of lab?.back || []) {
    const i = s.jobs.findings.findIndex(x => sameKind(x, f));
    if (i < 0) s.jobs.findings.push(f); else if (findingScore(f) > findingScore(s.jobs.findings[i])) s.jobs.findings[i] = f;
  }
}
// 数据配比的出生加分只加在 Q 计入的维度上（base 和 dims 一起加，之后照常过出生护栏）。
export function applyLabDims(m, dims) {
  for (const [k, v] of Object.entries(dims || {})) {
    if (!(v > 0) || m.dims[k] === undefined) continue;
    m.base[k] = (m.base[k] ?? 0) + v;
    m.dims[k] = Math.round((m.dims[k] + v) * 10) / 10;
  }
}
