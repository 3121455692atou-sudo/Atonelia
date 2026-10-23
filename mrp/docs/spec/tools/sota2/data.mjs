// 只读：按 D3 两批修订（第一批同 docs/spec/tools/sota_check.mjs --fix；第二批 = 2026-10-21 决定记录的对手数据修订表 A–D）载入全部真实发布，按日排序。
// 给出：SOTA_HISTORY 标签链（EPS、FIELD 规则）、各 org 的“史实前沿”、可见对手线（排除某 org）、开源最强线、开局播种表。
// 规格口径（默认）：S 只作描述，不把发布排除在“最强”和 SOTA 标签之外；“主线”= 发布时成为本 org 本模态最强（D10.1）。
// 对照：DATA=old 只套第一批；SRULE=old 沿用“带 S 的不争标签”。
import { RAW_RELEASES, FAMILIES } from '/Users/mac/model-raising-plan/src/career/data/rivals.js';
import { dimKeys, COMPANIES } from '/Users/mac/model-raising-plan/src/career/data/core.js';
import { RELEASE_DAYS_GEN } from '/Users/mac/model-raising-plan/src/career/data/release_days_gen.js';
import { RELEASE_DAYS_OVERRIDES } from '/Users/mac/model-raising-plan/src/career/data/release_days_overrides.js';
import fs from 'fs';
import { SOTA, Q_W } from './curve.mjs';

const TL = JSON.parse(fs.readFileSync('/Users/mac/model-raising-plan/docs/research/timeline-2023-2026.json', 'utf8')).releases;
const norm = s => String(s).normalize('NFKC').toLowerCase().replace(/（.*?）|\(.*?\)/g, '').replace(/[\s\-_·.]/g, '');
const tlByName = {};
for (const r of TL) { const k = norm(r.model); if (r.date.length === 10 && !tlByName[k]) tlByName[k] = r.date; }
const FIX = {
  'o1': [86, 82, 87, 80, 80, 42], 'DeepSeek-R1': [85, 81, 86, 78, 60, 36], 'GLM-4': [77, 64, 56, 73, 65, 22], 'Qwen3-235B-A22B-2507': [87, 87, 89, 80, 72, 72],
  'ChatGLM2-6B': [50, 33, 33, 56, 55, 0], 'ChatGLM3-6B': [55, 38, 40, 56, 58, 6], 'Qwen-7B': [53, 34, 32, 55, 55, 2], 'Baichuan2-13B': [54, 30, 32, 56, 58, 2], 'LLaMA 65B': [59, 36, 30, 55, 35, 0],
  'Qwen-Image-2.0': [88, 90, 91, 88, 78], 'SD3 Medium': [72, 70, 55, 69, 58], 'FLUX.1 [dev]': [84, 78, 58, 86, 60], 'Qwen-Image': [83, 85, 87, 83, 76], 'FLUX.2 [dev]': [89, 87, 79, 91, 64], 'HunyuanImage 3.0': [85, 85, 79, 86, 78],
};
const ADDS = [
  ['qwen', '2024-11-28', 'QwQ-32B-Preview', 'mid', 1, [72, 70, 80, 66, 55, 15]], ['deepseek_pro', '2024-11-20', 'DeepSeek-R1-Lite-Preview', 'large', 0, [80, 76, 82, 72, 58, 25]],
  ['gemini', '2024-12-19', 'Gemini 2.0 Flash Thinking', 'frontier', 0, [82, 76, 84, 78, 66, 40]], ['ernie', '2025-06-30', 'ERNIE-4.5-300B-A47B', 'large', 1, [82, 76, 74, 80, 66, 45]],
  ['gpt', '2025-08-05', 'gpt-oss-120b', 'mid', 1, [82, 80, 88, 74, 74, 60]], ['grok', '2025-08-23', 'Grok 2.5（开放权重）', 'large', 1, [82, 72, 64, 78, 55, 28]],
  ['seed', '2025-08-20', 'Seed-OSS-36B', 'mid', 1, [78, 76, 80, 72, 62, 55]], ['grok', '2024-03-17', 'Grok-1（开放权重）', 'large', 1, [70, 50, 42, 66, 45, 4]],
  ['flux', '2024-08-01', 'FLUX.1 [pro]', 'large', 0, [87, 80, 62, 89, 62]],
];
const DAYS = { 'FLUX.1 [dev]': '2024-08-01', 'QwQ-32B-Preview': '2024-11-28', 'DeepSeek-R1': '2025-01-20', 'o1': '2024-12-05', 'Qwen3-235B-A22B-2507': '2025-07-21', 'GLM-4': '2024-01-16', 'Claude Opus 4': '2025-05-22', 'Grok 4': '2025-07-09', 'Kimi K2': '2025-07-11', 'GLM-4.5': '2025-07-28' };
// ---- 2026-10-21 待定项决定：对手数据修订表 A–D（DATA=old 时不套用），S 规则（SRULE=old 时沿用“S 不争标签”）----
export const DATA_MODE = process.env.DATA || 'new', S_RULE = process.env.SRULE || 'new';
const FIX2 = {
  'Muse Spark Open': [92, 91, 93, 87, 82, 89], 'DeepSeek-V3-0324': [85, 76, 80, 78, 64, 45], 'DeepSeek-V4-Flash-0731': [92, 95, 94, 82, 67, 93],
  'DeepSeek-V4-Pro-0813': [93, 93, 94, 86, 72, 91], 'DeepSeek-V4.1-Flash': [92, 94, 95, 85, 69, 95], 'Qwen3.8-Max': [93, 94, 95, 86, 76, 92],
  'GPT-Realtime-2': [83, 12, 80, 78, 86],
};
const DATE2 = { 'GPT-3.5（ChatGPT）': '2022-11-30', 'Muse Spark Open': '2026-10-15', 'Muse Spark 1.1': '2026-07-09', 'Sonar Reasoning Pro': '2025-03-07', 'pplx-70b-online': '2023-11-29',
  'Phi-3-medium': '2024-05-21', 'RWKV-6 Finch 14B': '2024-07-21', 'FLUX1.1 [pro]': '2024-10-02', 'DeepSeek-V3.2': '2025-12-01',
  'DeepSeek-V4.1-Flash': '2026-09-10', 'Qwen3.8-Max': '2026-08-03', 'GPT-Realtime-2': '2026-05-07',
  'FLUX.2 [pro]': '2025-11-25', 'FLUX.2 [dev]': '2025-11-25' };   // timeline 是合并条目“FLUX.2 [pro] / [flex] / [dev]”，按名字匹配不上（https://bfl.ai/blog/flux-2 ）
const CLS2 = { 'gpt-oss-120b': 'large' };
const ADDS2 = [
  ['llama', '2026-08-05', 'Muse Spark 1.2', 'frontier', 0, [93, 92, 95, 88, 83, 91], 'R'],
  ['llama', '2026-09-02', 'Muse Spark 1.3', 'frontier', 0, [94, 94, 96, 89, 83, 94], 'R'],
  ['llama', '2026-10-12', 'Muse Wonder', 'frontier', 0, [96, 95, 96, 91, 83, 96], 'R,C'],
  ['llama', '2026-10-12', 'Muse Wonder Full', 'frontier', 0, [96, 97, 97, 92, 84, 97], 'R,C,X'],
  ['cohere', '2025-03-13', 'Command A', 'large', 1, [79, 68, 62, 76, 66, 38], 'LN'],
  ['cohere', '2025-08-21', 'Command A Reasoning', 'large', 1, [81, 72, 82, 74, 66, 48], 'R,LN'],
  ['cohere', '2026-05-20', 'Command A+', 'large', 1, [84, 82, 84, 76, 68, 66], 'R,E,LP'],
  ['perplexity', '2024-08-14', 'Llama 3.1 Sonar Huge 405B Online', 'large', 0, [80, 65, 58, 77, 68, 28], ''],
  ['gemini', '2024-09-24', 'Gemini 1.5 Pro-002', 'frontier', 0, [83, 70, 70, 80, 74, 30], 'C'],
  ['mistral', '2023-12-11', 'Mistral Medium（原型）', 'mid', 0, [73, 54, 46, 68, 58, 8], ''],
  ['mistral', '2025-08-13', 'Mistral Medium 3.1', 'mid', 0, [84, 77, 69, 80, 70, 52], ''],
  ['novelai', '2022-04-29', 'Krake', 'mid', 0, [44, 12, 12, 58, 18, 0], ''],
  ['phi', '2024-08-20', 'Phi-3.5-MoE', 'mid', 1, [76, 64, 64, 60, 64, 10], 'E,LP'],
  ['qwen', '2025-03-06', 'QwQ-32B', 'mid', 1, [80, 79, 86, 78, 58, 40], 'R,S,LP'],
  ['deepseek', '2026-10-17', 'DeepSeek-V4.1-Flash-1017', 'large', 1, [93, 95, 96, 85, 70, 96], 'R,E'],
  ['qwen', '2026-08-12', 'Qwen3.8-2.4T-A95B', 'large', 1, [93, 94, 94, 86, 74, 92], 'R,E,T,LR'],
  ['qwen', '2026-09-02', 'Qwen3.8-Max-0902', 'frontier', 0, [95, 95, 96, 88, 76, 95], 'R'],
  ['minimax', '2026-10-19', 'MiniMax-M3.1-Flash', 'large', 0, [93, 95, 95, 84, 68, 95], 'R,E'],
  ['yi', '2024-10-16', 'Yi-Lightning', 'large', 0, [78, 66, 64, 82, 64, 15], ''],
  ['glm', '2024-08-28', 'GLM-4-Plus', 'large', 0, [81, 68, 62, 78, 66, 26], ''],
  ['baichuan', '2024-05-22', 'Baichuan 4', 'large', 0, [80, 64, 62, 76, 64, 12], ''],
  ['hunyuan', '2025-12-05', 'Hunyuan HY 2.0 Think', 'large', 0, [86, 84, 89, 80, 70, 72], 'R,E'],
  ['flux', '2025-11-25', 'FLUX.2 [pro]', 'large', 0, [90, 88, 80, 92, 64], ''],
  ['flux', '2026-10-01', 'FLUX 3 Image', 'large', 0, [93, 94, 89, 94, 66], ''],
  ['seedream', '2025-12-03', 'Seedream 4.5', 'large', 0, [90, 91, 85, 91, 80], ''],
  ['qwen_image', '2026-04-22', 'Qwen-Image-2.0 Pro', 'large', 0, [89, 91, 92, 89, 78], ''],
  ['qwen_image', '2026-07-21', 'Qwen-Image-3.0', 'large', 0, [90, 92, 93, 91, 78], ''],
  ['qwen_image', '2026-09-20', 'Qwen-Image-2.1', 'mid', 1, [89, 91, 92, 90, 78], 'S,LN'],
  ['hunyuan_image', '2026-01-26', 'HunyuanImage 3.0 Instruct', 'large', 1, [86, 87, 80, 87, 78], 'LR'],
  ['imagen', '2023-12-13', 'Imagen 2', 'large', 0, [76, 66, 35, 76, 82], ''],
  ['mureka', '2026-01-28', 'Mureka V8', 'mid', 0, [88, 86, 79, 78, 55], ''],
  ['mureka', '2026-04-09', 'Mureka V9', 'mid', 0, [89, 87, 81, 81, 58], ''],
  ['mureka', '2026-08-18', 'Mureka V9.5', 'mid', 0, [90, 88, 81, 80, 60], ''],
  ['lyria', '2026-03-25', 'Lyria 3 Pro', 'large', 0, [86, 80, 74, 89, 82], ''],
  ['stable_audio', '2025-09-10', 'Stable Audio 2.5', 'mid', 0, [66, 8, 8, 72, 72], ''],
  ['stable_audio', '2026-05-20', 'Stable Audio 3 Large', 'mid', 0, [72, 8, 8, 80, 76], ''],
  ['cartesia', '2025-10-15', 'Sonic 3', 'mid', 0, [84, 80, 82, 72, 60], ''],
  ['cartesia', '2026-05-15', 'Sonic 3.5', 'mid', 0, [90, 85, 88, 86, 62], ''],
  ['cartesia', '2026-08-27', 'Sonic 3.6', 'mid', 0, [92, 87, 90, 87, 64], ''],
  ['gemini_tts', '2026-09-23', 'Gemini 3.8 Flash TTS', 'large', 0, [92, 75, 90, 90, 85], ''],
  ['cosyvoice', '2026-07-21', 'Qwen-Audio-3.0-TTS-Plus', 'mid', 0, [89, 84, 88, 85, 60], ''],
  ['cosyvoice', '2026-09-22', 'Qwen-Audio-3.1-TTS-Plus', 'mid', 0, [91, 85, 90, 86, 60], ''],
  ['minimax_speech', '2025-10-15', 'Speech 2.6', 'mid', 0, [89, 86, 86, 84, 61], ''],
];
const S_TAG = new Set(['QwQ-32B', 'Qwen-Image-2.1', 'Bark', 'QwQ-32B-Preview', 'DeepSeek-R1-Lite-Preview', 'Gemini 2.0 Flash Thinking', 'ERNIE-4.5-300B-A47B', 'gpt-oss-120b', 'Grok 2.5（开放权重）', 'Seed-OSS-36B', 'Grok-1（开放权重）']);
const ORG = { gpt: 'openai', image2: 'openai', openai_tts: 'openai', claude: 'anthropic', fable: 'anthropic', gemini: 'google', gemma: 'google', imagen: 'google', lyria: 'google', gemini_tts: 'google',
  llama: 'meta', musicgen: 'meta', qwen: 'alibaba', qwen_image: 'alibaba', cosyvoice: 'alibaba', seed: 'bytedance', seedream: 'bytedance', seed_tts: 'bytedance', hunyuan: 'tencent', hunyuan_image: 'tencent',
  minimax: 'minimax', minimax_speech: 'minimax', elevenlabs: 'elevenlabs', eleven_music: 'elevenlabs', deepseek_pro: 'deepseek', deepseek: 'deepseek' };
export const orgOf = f => ORG[f] || f;
export const toDay = d => Math.round(Date.parse(d) / 864e5);
export const qOf = (mod, dims) => Object.entries(Q_W[mod]).reduce((a, [k, w]) => a + w * (dims[k] || 0), 0);

// 2026-10-21 P1.1 数据提交以后，两批修订已经并进 rivals.js：下面的 FIX / ADDS / ADDS2 / DATE2 只补 rivals.js 里还没有的行，已有的按名字跳过（幂等），
// 日期优先读 release_days_overrides.js 和 release_days_gen.js。DATA=old 需要旧版 rivals.js，在新数据上不再有意义。
const HAVE = new Set(RAW_RELEASES.map(r => r[2]));
const BASE_ROWS = [...RAW_RELEASES.map(r => [...r]), ...ADDS.filter(r => !HAVE.has(r[2]))];
const ROWS = DATA_MODE === 'old' ? BASE_ROWS.filter(r => !['QwQ-32B'].includes(r[2])) : [...BASE_ROWS, ...ADDS2.filter(r => !HAVE.has(r[2])).map(r => r.slice(0, 6))];
export const REL = ROWS.map(([family, date, name, cls, open, vals]) => {
  if (FIX[name]) vals = FIX[name];
  if (DATA_MODE !== 'old' && FIX2[name]) vals = FIX2[name];
  if (DATA_MODE !== 'old' && CLS2[name]) cls = CLS2[name];
  const mod = FAMILIES[family].mod, keys = dimKeys(mod);
  const dims = Object.fromEntries(keys.map((k, i) => [k, vals[i] ?? 0]));
  let day = date.length === 10 ? date : (DAYS[name] || tlByName[norm(name)]);
  if (!day || day.slice(0, 7) !== date.slice(0, 7)) day = date.slice(0, 7) + '-15';
  if (DATA_MODE !== 'old' && DATE2[name]) day = DATE2[name];
  const rd = RELEASE_DAYS_OVERRIDES[name]?.day || RELEASE_DAYS_GEN[name];   // 现在以 release_days 为准
  if (rd && rd.slice(0, 7) === date.slice(0, 7)) day = rd;
  const S = S_TAG.has(name);
  const side = S_RULE === 'old' ? S : false;   // 新规则：S 只作描述，不把发布排除在标签和“最强”之外
  return { family, org: orgOf(family), name, mod, open: !!open, cls, day, d: toDay(day), dims, q: qOf(mod, dims), S, side };
}).sort((a, b) => a.d - b.d || b.q - a.q);
// 主线（新规则用来认定“挑战”）：发布那一刻 q 不低于本 org 本模态此前的最强（即成为新的 orgBest）
{ const best = {}; for (const r of REL) { const k = r.org + '|' + r.mod, b = best[k];
    r.main = !b || r.q >= b.q;
    r.rerelease = !!b && r.main && JSON.stringify(r.dims) === JSON.stringify(b.dims);   // 同一快照重新放出（如 Grok-1 开放权重）：D11.3“同一快照只评一次”
    if (r.main) best[k] = r; } }
// 数据起点之前的持有者（只用于播种和公司历程；见规格 D10.4）
// 修订二补进 Krake（2022-04-29）后，LLM 场地在 GPT-3.5 发布当天（2022-11-30）就凑满，GPT-3.5 领先 20.28 直接算数，SOTA_PRE 不再需要条目
export const SOTA_PRE = DATA_MODE === 'old' ? [{ org: 'openai', mod: 'llm', name: 'ChatGPT（GPT-3.5）', day: '2022-11-30', d: toDay('2022-11-30') }] : [];

// SOTA_HISTORY：D10.2 的规则作用在全部真实发布上（含各家自家线、不做可见性过滤）。
// via：'fill' 场地凑满时挂上；'swap' 高出现任 EPS 换手；'self' 同 org 新主线 q ≥ 自家现任，自家换代。
// counted：这枚标签算不算“炼出”。换手一定算；fill 要比当时别家任何发布最强高 FILL_LEAD，
//          否则要等它在持标期间挡住一款别家主线（对方没能高出 EPS）才算（countedAt = 那天）；self 继承现任的 counted。
export function labelChain(mod, rel = REL.filter(r => r.mod === mod)) {
  const orgs = new Set(), chain = []; let holder = null, best = null;
  const seen = [];
  for (const r of rel) {                        // 已按日、同日按 q 降序
    orgs.add(r.org); seen.push(r);              // 场地人数：任何发布都算（含 S 副线）
    if (r.side) continue;                       // 旧规则：带 S 的不争标签；新规则 side 恒为 false，全部发布都争
    if (!best || r.q > best.q) best = r;        // 场上最强主线（不计 EPS），用于场地刚满 2 家时挂第一枚
    if (orgs.size < SOTA.FIELD) continue;
    if (!holder) {
      const other = Math.max(-Infinity, ...seen.filter(x => x.org !== best.org).map(x => x.q));
      const counted = best.q - other >= SOTA.FILL_LEAD;
      holder = { ...best, since: r.d, sinceDay: r.day, via: 'fill', counted, countedAt: counted ? r.d : null, lead: best.q - other };
      chain.push(holder); continue;
    }
    if (r.org === holder.org) {
      if (r.q >= holder.q && r.name !== holder.name) { holder = { ...r, since: r.d, sinceDay: r.day, via: 'self', counted: holder.counted, countedAt: holder.countedAt }; chain.push(holder); }
      continue;
    }
    if (r.q > holder.q + SOTA.EPS) { holder = { ...r, since: r.d, sinceDay: r.day, via: 'swap', counted: true, countedAt: r.d }; chain.push(holder); }
    else if (!holder.counted && (S_RULE === 'old' || r.main)) { holder.counted = true; holder.countedAt = r.d; holder.defendedBy = r.name; }
  }
  chain.forEach((h, i) => { h.until = chain[i + 1]?.since ?? Infinity; });
  return chain;
}
export const CHAINS = Object.fromEntries(['llm', 'image', 'music', 'speech'].map(m => [m, labelChain(m)]));

// 阶梯函数：给定 (day → q) 点列，返回 t（距 t0 天数）→ q
function stepFn(pts, t0) { return t => { let v = 0; for (const [d, q] of pts) { if (d - t0 <= t) v = q; else break; } return v; }; }
// 截至当天“场上最强 q”（可选排除某 org、只看开源）
export function frontLine(mod, { excludeOrg = null, open = null, t0 }) {
  const pts = []; let best = -Infinity;
  for (const r of REL) if (r.mod === mod && r.org !== excludeOrg && (open === null ? !r.side : r.open === open) && r.q > best) { best = r.q; pts.push([r.d, r.q]); }
  return stepFn(pts, t0);
}
// 史实前沿（难度锚点的地板）：全部主线真实发布截至当天的最强 q；本 org 的发布提前 lookahead 天计入
export function histLine(mod, { org = null, lookahead = 0, t0 }) {
  const pts = REL.filter(r => r.mod === mod && !r.side).map(r => [r.org === org ? r.d - lookahead : r.d, r.q]).sort((a, b) => a[0] - b[0]);
  const out = []; let best = -Infinity; for (const [d, q] of pts) if (q > best) { best = q; out.push([d, q]); }
  return stepFn(out, t0);
}
// 本公司真实主线（提前 lookahead 天计入）：D6.2 的 OG
export function ownLine(mod, { org, lookahead = 0, t0 }) {
  const pts = REL.filter(r => r.mod === mod && !r.side && r.org === org).map(r => [r.d - lookahead, r.q]).sort((a, b) => a[0] - b[0]);
  const out = []; let best = -Infinity; for (const [d, q] of pts) if (q > best) { best = q; out.push([d, q]); }
  return stepFn(out, t0);
}
// 临时锚（D6.2 空值约定）：本模态全部真实发布（含本公司、含 S）截至当天最强；一条都还没有时取第一条真实发布
export function tempLine(mod, { t0 }) {
  const all = REL.filter(r => r.mod === mod); const first = all[0]?.q ?? 0;
  const f = stepFn((() => { const o = []; let b = -Infinity; for (const r of all) if (r.q > b) { b = r.q; o.push([r.d, r.q]); } return o; })(), t0);
  return t => f(t) || first;
}
// 播种：★ 同 org 同模态开局前有过一枚“算数”的标签；○ 同 org 别的模态有过；— 其余。
// histLast：开局前本 org 本模态最后一段持标区间的结束日（开局时仍在持标则取开局日）。
export const SCEN = { y2023: '2023-01-01', y2024: '2024-01-01', y2025: '2025-01-01', y2026: '2026-01-01' };
export const holdsOf = (org, m) => [...SOTA_PRE.filter(h => h.mod === m && h.org === org).map(h => ({ ...h, since: h.d, sinceDay: h.day, counted: true, countedAt: h.d, until: CHAINS[m][0]?.since ?? Infinity })),
  ...CHAINS[m].filter(h => h.org === org)];
export function seedCell(company, start) {
  const org = orgOf(company.families[0]), mod = company.modality, st = toDay(start);
  const counted = m => holdsOf(org, m).filter(h => h.counted && h.countedAt < st);
  const held = holdsOf(org, mod).filter(h => h.since < st);
  const histLast = held.length ? Math.min(st, Math.max(...held.map(h => h.until))) : null;
  if (counted(mod).length) return { mark: '★', first: counted(mod)[0], histLast };
  for (const m of Object.keys(CHAINS)) if (m !== mod && counted(m).length) return { mark: '○', first: counted(m)[0], histLast };
  return { mark: '—', histLast };
}
// 任务代码地图里给出的“真实 SOTA 表”（sota-timeline.json，★ 本模态 / ○ 同集团别模态 / — 无；☆ 记为 —）
export const REAL_SEED = {
  gpt: '★★★★', claude: '——★★', fable: '——○○', gemini: '———★', grok: '———★', deepseek: '————', image2: '○★★★', midjourney: '★★★★', suno: '—★★★', elevenlabs: '—★★★',
  llama: '—○○○', seed: '———○', minimax: '———○',
};
export { COMPANIES };
