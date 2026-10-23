// 型号命名（规格 C1、C2、C5、C6）：玩家起名的规则和校验、建议名、历史名授予、开局继承的提示，以及开发期存档的兜底。
// 名字只是显示用的副本：模型、快照、成绩、里程碑账本、灰度、名人堂一律按 id 认（C1“主键一律用 modelId”）。
// 没发布的模型没有名字（name = null）：界面用 displayName 显示代号（draftName）或“第 N 代底座”，后面跟“（训练中）”；这几个字不进存档。
// 发布时的名字只有一个出处：releaseNamePlan。发布面板预告的名字和 doRelease 实际用的名字都从它来，所以两边一致。
import { FAMILIES } from '../data/rivals.js';
import { COMPANY_BY_ID, dimLabel } from '../data/core.js';
import { COMPANY_FILES, GENERIC_FILES, companyFile } from '../data/companies/index.js';
import { condWhy, condPermanent } from './cond.js';
import { workingModel, smallWorking } from './model.js';
import { releaseLine } from './release.js';
import { run as migrateNaming } from './migrations/naming.js';
import { fmtDay } from './clock.js';
import { P } from './provider.js';

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

// ---------- 显示 ----------
// 规范化（比较重名用）：全角半角统一、不分大小写、去掉括号里的说明、去掉空格和 - _ · . 这几个分隔符。
export const normName = n => String(n ?? '').normalize('NFKC').toLowerCase().replace(/（.*?）|\(.*?\)/g, '').replace(/[\s\-_·.]/g, '');
// 没发布的模型怎么称呼：玩家立项时填的代号；没填就是“第 N 代底座”或“在练的小模型”。
export const draftLabel = m => m?.draftName || (m?.role === 'small' ? '在练的小模型' : `第 ${m?.gen ?? 1} 代底座`);
// 界面上显示的名字：发布了用名字，没发布的写代号加“（训练中）”。
export const displayName = m => m?.name ?? `${draftLabel(m)}（训练中）`;
// 不带“（训练中）”的叫法：写进日志、新闻、提示（会存进存档）的地方用它。
export const modelLabel = m => m?.name ?? draftLabel(m);

// ---------- 品牌词（规则 5） ----------
// 按 org 列：别家的品牌词不能放在名字开头，自家的可以。名字按空格和 - _ · . 切成词，开头的词等于品牌词（不分大小写）才算；
// 开头的词末尾带数字的也算（Qwen3、GPT4、Step2 都是冒用）。品牌词本身带分隔符的（DALL·E、Nano Banana）按开头几个词比。
// 中文品牌没有空格可切，按名字开头比（“文心大模型”算冒用“文心”）。
export const ORG_BRANDS = {
  openai: ['OpenAI', 'GPT', 'ChatGPT', 'o1', 'o3', 'o4', 'DALL·E', 'Sora', 'Whisper'],
  anthropic: ['Anthropic', 'Claude'],
  google: ['Google', 'DeepMind', 'Gemini', 'Gemma', 'Imagen', 'Bard', 'PaLM', 'Lyria', 'Veo', 'Nano Banana'],
  meta: ['Meta', 'Llama', 'Muse', 'MusicGen'],
  grok: ['xAI', 'Grok'],
  mistral: ['Mistral', 'Mixtral', 'Magistral', 'Codestral', 'Pixtral', 'Ministral'],
  perplexity: ['Perplexity', 'Sonar', 'pplx'],
  novelai: ['NovelAI', 'Kayra', 'Clio', 'Krake', 'Erato', 'Xialong'],
  jev: ['Jev'],
  deepseek: ['DeepSeek'],
  alibaba: ['Qwen', 'QwQ', '通义', 'CosyVoice'],
  kimi: ['Kimi', 'Moonshot', '月之暗面'],
  glm: ['GLM', 'ChatGLM', 'CogView', '智谱'],
  minimax: ['MiniMax', 'abab', 'Hailuo', '海螺'],
  bytedance: ['Doubao', '豆包', 'Seed', 'Seedream'],
  tencent: ['Hunyuan', 'HunyuanImage', 'Hy', '混元'],
  ernie: ['ERNIE', '文心'],
  stepfun: ['Step', 'StepFun', '阶跃'],
  rwkv: ['RWKV'],
  phi: ['Phi'],
  yi: ['Yi'],
  baichuan: ['Baichuan', '百川'],
  cohere: ['Cohere', 'Command'],
  midjourney: ['Midjourney', 'Niji'],
  sd: ['Stability', 'Stable Diffusion', 'SDXL', 'SD'],
  flux: ['FLUX'],
  ideogram: ['Ideogram'],
  suno: ['Suno', 'Chirp'],
  udio: ['Udio'],
  stable_audio: ['Stable Audio'],
  mureka: ['Mureka'],
  elevenlabs: ['ElevenLabs', 'Eleven'],
  cartesia: ['Cartesia', 'Sonic'],
};
// 各 org 的公司名（拒绝原因里用）：取这个 org 第一个家族的公司名。
const ORG_COMPANY = Object.fromEntries(Object.values(FAMILIES).map(f => [f.org, f.company]).reverse());
const CJK = /[\u3400-\u9fff]/;
const SEP = /[\s\-_·.]+/;
const words = n => String(n).trim().split(SEP).filter(Boolean).map(w => w.toLowerCase());
// 品牌词预先切好：{ org, text, cjk, norm, words }。
const BRANDS = Object.entries(ORG_BRANDS).flatMap(([org, list]) => list.map(text => ({ org, text, cjk: CJK.test(text), norm: normName(text), words: words(text) })));
// 名字（已切好的词 w、规范化 n）是不是以这个品牌词开头。
function brandHit(w, n, b) {
  if (b.cjk) return n.startsWith(b.norm);
  if (w.length < b.words.length) return false;
  for (let i = 0; i < b.words.length - 1; i++) if (w[i] !== b.words[i]) return false;
  const last = w[b.words.length - 1], want = b.words[b.words.length - 1];
  return last === want || last.replace(/\d+$/, '') === want;
}
const orgOfGame = s => s.company?.org ?? COMPANY_BY_ID[s.charId]?.org ?? null;

// ---------- 保留名（规则 3、4） ----------
// 所有公司文件和通用树里的历史名。按各文件 names 数组的身份缓存（内容包落地、测试临时换表时自动重建）。
const nameFiles = () => [...Object.values(COMPANY_FILES), ...Object.values(GENERIC_FILES)];
let RESERVED = null;
function tables() {
  const files = nameFiles();
  const key = files.map(f => f?.names);
  if (RESERVED && RESERVED.ver === P().version() && RESERVED.key.length === key.length && RESERVED.key.every((x, i) => x === key[i])) return RESERVED;
  const hns = key.flatMap(x => (Array.isArray(x) ? x.filter(isObj) : []));
  const real = P().reservedNames();
  const hist = new Map();
  for (const h of hns) if (typeof h.name === 'string') hist.set(normName(h.name), h);
  const series = hns.filter(h => typeof h.series === 'string' && h.series.trim()).map(h => ({ pre: canon(h.series), text: h.series, hn: h }));
  const all = new Set([...real.keys(), ...hist.keys(), ...series.map(x => normName(x.text))]);
  RESERVED = { ver: P().version(), key, real, hist, series, all };
  return RESERVED;
}
// series 前缀按“统一分隔符”比：空格、-、_ 都当成一个空格，点号留着（“Llama 2 ”管得到“Llama 2 70B”，管不到“Llama 2.5”）。
function canon(n) { return String(n ?? '').normalize('NFKC').toLowerCase().replace(/[\s\-_]+/g, ' ').replace(/^ /, ''); }
const seriesHit = (name, x) => canon(name).startsWith(x.pre) && canon(name).length > x.pre.length;
// 名字是不是这个授名本身，或者它的 series 变体（用授名时名字只能是这两种，C2 第 2、3 步）。
export const grantFits = (hn, name) => !!hn && (normName(hn.name) === normName(name) || (typeof hn.series === 'string' && !!hn.series.trim() && seriesHit(name, { pre: canon(hn.series) })));
// 规格 C1：所有 RELEASES 名的规范化形式，加上所有历史名（含 series 前缀）。
export function reservedNames(s) { return tables().all; }

// ---------- 历史名与授权 ----------
// 这家公司的历史名表（公司文件为 null 时用模态的通用树）。
export const historicNames = s => (Array.isArray(companyFile(s?.charId)?.names) ? companyFile(s.charId).names.filter(isObj) : []);
export const hnById = (s, id) => historicNames(s).find(h => h.id === id) ?? null;
// 某个真实型号名对应的本家历史名 id（开局在练的下一代“现实里这一代叫 X”，C6）。
export const hnFor = (s, name) => historicNames(s).find(h => normName(h.name) === normName(name))?.id ?? null;
// 授权状态（只读 s.strategy.rights，按 F3 容错）：held | used | void | expired | null（还没拿到）。
const rightsOf = s => s?.strategy?.rights ?? {};
function rightState(s, id) {
  const r = rightsOf(s)[id];
  if (!isObj(r)) return null;
  if (r.void) return 'void';
  if (r.used) return 'used';
  if (r.until && r.until < s.day) return 'expired';
  return 'held';
}
const nodeTitle = (s, id) => (companyFile(s.charId)?.tree?.nodes || []).find(n => n.id === id)?.title || id;
// 能用在这条流水线上的授名（role：'flagship' 训练线、'small' 小模型线）：持有、没用过、没作废、没过期，按名表顺序。
export function grantsFor(s, role) {
  return historicNames(s).filter(h => (!h.role || h.role === role) && rightState(s, h.id) === 'held');
}

// ---------- 规则校验（C1） ----------
const NAME_CHARS = /^[\p{L}\p{N} ._\-+·()（）]+$/u;
// → { ok, name, reason }。按顺序检查；带着有效授权、名字正是授名（或授名的 series 前缀开头）的，跳过第 3–5 条。
// role：'flagship' | 'small'（只在用授名时核对）；modelId：自己（不算重名）；grant：要用的授名 id。
export function validateModelName(s, raw, { role, modelId, grant } = {}) {
  const name = String(raw ?? '').trim();
  const no = reason => ({ ok: false, name, reason });
  // 1. 长度、字符集、至少一个字母或汉字、不能含“训练中”。
  const len = [...name].length;
  if (!len) return no('名字不能是空的');
  if (len > 32) return no(`名字最长 32 个字，现在 ${len} 个`);
  if (!NAME_CHARS.test(name)) return no('名字只能用字母、数字、汉字、空格和 . _ - + · ( ) （ ）');
  if (!/\p{L}/u.test(name)) return no('名字里至少要有一个字母或汉字');
  if (name.includes('训练中')) return no('名字里不能有“训练中”');
  const n = normName(name);
  if (!n) return no('括号外面也要有字');
  // 2. 本局已发布的模型不能重名（自己除外）；评测中的候选也不能用。
  const taken = P().nameTaken(s, name, modelId);
  if (taken) return no(taken);
  // 带着有效授权用授名：跳过 3–5。
  if (grant) {
    const hn = hnById(s, grant);
    if (grantFits(hn, name) && rightState(s, grant) === 'held' && (!role || !hn.role || hn.role === role)) return { ok: true, name, reason: '' };
  }
  const t = tables();
  // 3. 不能等于任何真实型号名（自家线的也算，不分年代）。
  if (t.real.has(n)) return no(`「${t.real.get(n)}」是现实里的型号名，换一个吧`);
  // 4. 不能等于历史名，也不能以 series 前缀开头（要先拿到授权）。
  const h = t.hist.get(n);
  if (h) return no(`「${h.name}」是留给史实成就的型号名，要先拿到授权`);
  const sx = t.series.find(x => seriesHit(name, x));
  if (sx) return no(`以「${sx.text.trim()}」开头的名字是留给史实成就的，要先拿到授权`);
  // 5. 不能以别家的品牌词开头。
  const mine = orgOfGame(s), w = words(name);
  const b = P().brandOwner(w, n, mine, BRANDS, brandHit, { s, modelId });
  if (b) return no(`「${b.text}」是${ORG_COMPANY[b.org] || b.org}的品牌，不能放在名字开头`);
  return { ok: true, name, reason: '' };
}

// 立项时填的代号（选填，C1）：不填没关系；填了要像个名字（长度、字符集同上，不能含“训练中”）。不进保留名的检查，代号只给自己看。
export function draftNameError(raw) {
  const d = String(raw ?? '').trim();
  if (!d) return '';
  const len = [...d].length;
  if (len > 32) return `代号最长 32 个字，现在 ${len} 个`;
  if (!NAME_CHARS.test(d)) return '代号只能用字母、数字、汉字、空格和 . _ - + · ( ) （ ）';
  if (d.includes('训练中')) return '代号里不能有“训练中”';
  return '';
}
export const draftNameOf = raw => (draftNameError(raw) ? null : String(raw ?? '').trim() || null);

// ---------- 建议名（C1） ----------
// 品牌名：角色名去掉末尾的版本号（Fable 5 → Fable，Image 2 → Image）。
const brandOf = s => String(s.persona?.name || s.company?.company || '模型').replace(/\s*\d+(?:\.\d+)?$/, '').trim() || '模型';
// 名字里最后一个版本号：数字后面紧跟字母的不算（70B、A22B、8x7B、4o），末尾的日期代号（-0324、-2507）和括号里的说明先去掉。
// 旧命名去重时会在日期代号后面再接一个字母（读旧档留下的 GPT-5-2309b），连字母一起去掉，建议名不再带着这条尾巴。
function versionSpot(name) {
  const core = String(name).replace(/（.*?）|\(.*?\)/g, '').trim().replace(/[-\s]\d{4}[a-h]?$/, '');
  let hit = null;
  for (const mt of core.matchAll(/(\d+)(?:\.(\d+))?/g)) {
    const end = mt.index + mt[0].length;
    if (/[A-Za-z]/.test(core[end] ?? '')) continue;
    hit = { at: mt.index, end, major: Number(mt[1]), minor: mt[2] === undefined ? null : Number(mt[2]) };
  }
  return { core, hit };
}
// 候选名：major 为真时主版本 + k（suggestName 只取 k = 1），否则小版本 + k（k 从 1 起）；解析不出版本号的按“1”算：
// 主版本接“ 2”，小版本接“ 1.1”起（Kimi Chat → Kimi Chat 2、Kimi Chat 1.1）。
function bumped(prev, major, k) {
  const { core, hit } = versionSpot(prev);
  if (!hit) return major ? `${core} ${1 + k}` : `${core} 1.${k}`;
  const head = core.slice(0, hit.at), tail = core.slice(hit.end);
  return major ? `${head}${hit.major + k}${tail}` : `${head}${hit.major}.${(hit.minor ?? 0) + k}${tail}`;
}
// 只是建议：取同一条流水线（role）上一次发布的名字，新底座主版本 +1，同一个底座再发布小版本 +1。
// 不跳到未来的号：主版本 +1 不能用（是保留名，例如 GPT y2023 时的 GPT-4、GPT-5 都是真实型号名；或者本局已经用过）时，
// 不再往更大的主版本找，改在当前主版本上加小版本（GPT-3.5 → GPT-3.6、GPT-3.7……），每家公司都一样。小版本碰到保留名、已用名就继续往上加。
// 没发布过时，用品牌名加“ 1”（小模型加“ Mini 1”）。m 是要发布的那一款（默认取这条流水线上待发布的模型）。
export function suggestName(s, role, m = role === 'small' ? smallWorking(s) : workingModel(s)) {
  // 评测中的候选也算“上一次”（送评时名字就定了，C7）：按它往下编，免得两个候选起同一个名字。
  const pending = (Array.isArray(s.evals) ? s.evals : []).filter(e => isObj(e) && typeof e.plan?.name === 'string' && (e.line === 'small' ? 'small' : 'flagship') === role && e.modelId !== m?.id)
    .map(e => ({ id: e.cand?.id ?? e.modelId, name: e.plan.name }));
  const prev = pending.at(-1) || (s.models || []).filter(x => isObj(x) && x.stage === 'released' && (x.role || 'flagship') === role && typeof x.name === 'string' && x !== m).at(-1) || null;
  const ok = c => validateModelName(s, c, { role, modelId: m?.id }).ok;
  if (prev) {
    // 同一个底座：上一版是从这一款发出去的快照（<id>rN），或者这一款是开局时从在线旗舰复制出来接着练的（<在线旗舰 id>w）。
    const same = !!m && (String(prev.id).startsWith(`${m.id}r`) || `${prev.id}w` === m.id);
    if (!same) { const c = bumped(prev.name, true, 1); if (ok(c)) return c; }
    for (let k = 1; k <= 200; k++) { const c = bumped(prev.name, false, k); if (ok(c)) return c; }
  }
  const head = role === 'small' ? `${brandOf(s)} Mini` : brandOf(s);
  for (let k = 1; k <= 999; k++) { const c = `${head} ${k}`; if (ok(c)) return c; }
  return `${head} ${s.day}`;
}

// ---------- 授名条件（C2） ----------
const DIR_LABEL = { chat: '对话', knowledge: '知识', code: '代码', math: '数学', writing: '写作', safety: '安全', agent: 'Agent', reasoning: '推理' };
function cleanLines(s, m, clean) {
  if (!clean) return [];
  if (clean === 'base') {
    const t = m?.train || {};
    const severe = t.severe || 0, minor = t.minor || 0;
    return [{ text: '底座练得干净（没有严重炸炉，小故障不超过 1 次）', ok: severe === 0 && minor <= 1, now: `严重炸炉 ${severe} 次，小故障 ${minor} 次` }];
  }
  if (isObj(clean.rl)) {
    const dirs = Array.isArray(clean.rl.dirs) ? clean.rl.dirs : [];
    const need = clean.rl.days || 0;
    const have = dirs.reduce((a, d) => a + (Number(m?.cleanStreak?.[d]) || 0), 0);
    const label = dirs.map(d => DIR_LABEL[d] || dimLabel(s.mod, d) || d).join('/');
    return [{ text: `干净训练满 ${need} 天（${label}方向，出 loss spike 会清零）`, ok: have >= need, now: `${have}/${need} 天` }];
  }
  return [];
}
function rightLine(s, id, hn) {
  const st = rightState(s, id);
  const r = rightsOf(s)[id];
  const now = { held: `持有${r?.until ? `，${r.until} 前有效` : ''}`, used: '已经用过了', void: `已作废：${r?.void}`, expired: '已经过期' }[st]
    || `还没拿到${hn.node ? `（要完成策略「${nodeTitle(s, hn.node)}」）` : ''}`;
  return { text: `持有型号名「${hn.name}」的授权`, ok: st === 'held', now };
}
// 发布面板（打开时）和 doRelease（起名前）共用：→ { ok, lines: [{ text, ok, now }] }，逐条 ✓/✗ 加当前值。
// ctx：{ role, open }，role 是这一版发布后的发布角色（顶替在线旗舰的算 flagship，副线和小模型算 small，见 cond.js 的 ModelCond role），
// open 是面板对副线、小模型勾的开不开源。模型条件按“还没发布”试算（sota 按 sotaWouldTake，E2）。
export function nameGrantCheck(s, model, hnId, ctx = {}) {
  const hn = hnById(s, hnId);
  if (!hn) return { ok: false, lines: [{ text: '使用史实型号名', ok: false, now: '这家公司没有这个型号名' }] };
  const lines = [rightLine(s, hnId, hn)];
  if (hn.role) lines.push({ text: hn.role === 'small' ? '用在小模型上' : '用在旗舰上', ok: (model?.role || 'flagship') === hn.role, now: model?.role === 'small' ? '这是小模型' : '这是旗舰' });
  if (hn.model) lines.push(...(model ? condWhy(s, { model: hn.model }, { ...ctx, model, preview: true }) : [{ text: '要发布的模型满足条件', ok: false, now: '没有要发布的模型' }]));
  if (hn.world) lines.push(...condWhy(s, hn.world, {}));
  lines.push(...cleanLines(s, model, hn.clean));
  return { ok: lines.every(l => l.ok), lines };
}

// ---------- 发布时的名字（发布面板预告和 doRelease 共用） ----------
// opts：{ name, grant, line, replace, open }。
//   grant：用这个授名（条件不满足就报错）；name 可以是授名的 series 变体，不写就用授名本身。
//   grant 为 null：不用授名；name：玩家起的名字（不合法就报错）。
//   都不写：先用能用的授名（条件全部满足的第一个），没有就用 suggestName（发布面板的预填顺序）。
// → { ok, name, grant, reason }。line 不传时按 releaseLine 算（和 doRelease 同一个判定）。
export function releaseNamePlan(s, m, opts = {}) {
  if (!m) return { ok: false, name: null, grant: null, reason: '没有要发布的模型' };
  const role = m.role === 'small' ? 'small' : 'flagship';
  const line = opts.line ?? releaseLine(s, m, opts);
  const ctx = { role: line === 'main' ? 'flagship' : 'small', open: opts.open };
  const given = typeof opts.name === 'string' && opts.name.trim() !== '';
  if (opts.grant) {
    const hn = hnById(s, opts.grant);
    const c = nameGrantCheck(s, m, opts.grant, ctx);
    if (!hn || !c.ok) {
      const bad = c.lines.find(l => !l.ok);
      return { ok: false, name: null, grant: null, reason: `不能用型号名「${hn?.name ?? opts.grant}」：${bad ? `${bad.text}（${bad.now}）` : '条件不满足'}` };
    }
    // 用授名时名字锁定为授名本身（有 series 的可以是它的变体），填了别的名字就报错，授权不动。
    if (given && !grantFits(hn, opts.name)) {
      const series = typeof hn.series === 'string' && hn.series.trim() ? hn.series : null;
      return { ok: false, name: null, grant: null, reason: `用型号名「${hn.name}」时名字${series ? `要么就是「${hn.name}」，要么以「${series.trim()}」开头` : `就是「${hn.name}」`}` };
    }
    const v = validateModelName(s, given ? opts.name : hn.name, { role, modelId: m.id, grant: opts.grant });
    return v.ok ? { ok: true, name: v.name, grant: opts.grant, reason: '' } : { ok: false, name: null, grant: null, reason: v.reason };
  }
  if (given) {
    const v = validateModelName(s, opts.name, { role, modelId: m.id });
    return v.ok ? { ok: true, name: v.name, grant: null, reason: '' } : { ok: false, name: null, grant: null, reason: v.reason };
  }
  if (opts.grant === undefined) {
    for (const hn of grantsFor(s, role)) {
      if (!nameGrantCheck(s, m, hn.id, ctx).ok) continue;
      const v = validateModelName(s, hn.name, { role, modelId: m.id, grant: hn.id });
      if (v.ok) return { ok: true, name: v.name, grant: hn.id, reason: '' };
    }
  }
  return { ok: true, name: suggestName(s, role, m), grant: null, reason: '' };
}
// doRelease 建好快照以后记账：snap.grant、rights[id].used = snap.id（C2 时机第 3 步）。
// 送评时预留授名（C7、T6.2）：rights[hn].used 记成候选 id，评测期间授名到期也照常使用（voidRights 跳过已用的）；撤回送评时清掉预留。
// 评完发布时 used 等于本候选 id，照常 useGrant 记账。
export function reserveGrant(s, id, candId) {
  const r = rightsOf(s)[id];
  if (id && isObj(r)) r.used = candId;
}
export function unreserveGrant(s, id, candId) {
  const r = rightsOf(s)[id];
  if (id && isObj(r) && r.used === candId) delete r.used;
}
export function useGrant(s, snap, id) {
  if (!id) return;
  snap.grant = id;
  const r = rightsOf(s)[id];
  if (isObj(r)) r.used = snap.id;
}

// ---------- 开局继承（C6） ----------
// createGame 的开局钩子（D10.3 的 initNaming）：开局在练的下一代没有名字，只带 m.hint = { realName, hn }（game.js 写 realName），
// 这里补上它对应的本家历史名（没有为 null）。
export function initNaming(s) {
  for (const m of s.models || []) if (isObj(m.hint) && m.hint.hn === undefined) m.hint.hn = hnFor(s, m.hint.realName);
}
// 选人界面的“下一代在练”：有对应的历史名时写候选名和要完成的策略，不剧透真实型号名。
export function nextHintText(charId, realName) {
  const s = { charId };
  const hn = historicNames(s).find(h => normName(h.name) === normName(realName));
  return hn ? `下一代在练（候选史实名：${hn.name}，需要完成「${nodeTitle(s, hn.node)}」）` : '下一代在练';
}

// ---------- 每天（release.js 的 dailyDeploy 调用） ----------
// 1. 开发期存档兜底：G1 以后、P2.1 以前新开的存档 mig.naming 已经记成执行过，可那时还是旧命名（在练模型名字带“（训练中）”、
//    s.verNext、m.minor、m.realName……），读档不会再跑特性步骤。还带着旧字段的，按读旧档的办法补跑一次（migrations/naming.js，幂等）。
// 2. 授权作废（C2）：world 条件永久失效、或者过了期限的授权写上 void 原因，入队一条提示。
export function namingTick(s, out) {
  ensureNaming(s);
  voidRights(s);
}
const oldNaming = s => s.verNext !== undefined
  || (s.models || []).some(m => isObj(m) && ('minor' in m || 'ver' in m || 'realName' in m || typeof m.lineage === 'string' || (typeof m.name === 'string' && m.name.includes('（训练中）'))));
export function ensureNaming(s) {
  if (s?.mig?.naming && Array.isArray(s.models) && oldNaming(s)) migrateNaming(s);
}
// world 条件里让授权永久失效的那条里程碑是谁做到的（文案用）。
function takenBy(s, c) {
  if (!isObj(c)) return null;
  for (const [k, v] of Object.entries(c)) {
    if (k === 'all' || k === 'any') { for (const x of v || []) { const w = takenBy(s, x); if (w) return w; } continue; }
    if (k === 'ms' && isObj(v)) for (const id of Object.keys(v)) { const x = s.ms?.[id]; if (x && x.who !== 'me') return FAMILIES[x.who]?.company || COMPANY_BY_ID[x.who]?.company || (x.who === 'academia' ? '学界' : '别家'); }
  }
  return null;
}
export function voidRights(s) {
  const rights = s.strategy?.rights;
  if (!isObj(rights)) return;
  for (const [id, r] of Object.entries(rights)) {
    if (!isObj(r) || r.used || r.void) continue;
    const hn = hnById(s, id);
    const expired = !!r.until && r.until < s.day;
    if (!expired && !(hn?.world && condPermanent(s, hn.world))) continue;
    const name = hn?.name || id;
    r.void = expired ? '这个名字的时代已经过去' : `现实里这一步叫 ${name}，但这一回${takenBy(s, hn.world) || '别家'}先做到了`;
    s.queue.push({ kind: 'notice', title: `型号名「${name}」用不上了`, text: expired ? `${r.void}：授权到 ${fmtDay(r.until)} 为止，一直没有用它发布。` : `${r.void}。` });
  }
}
