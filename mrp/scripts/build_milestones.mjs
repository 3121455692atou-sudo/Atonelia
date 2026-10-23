#!/usr/bin/env node
// 用本地 CLIProxyAPI 反代（默认 gemini-3.8-flash）给每个里程碑写文案和短剧：
//   mine：玩家做到了（谁都可能是玩家，所以不点具体公司名，用 {model}、{company} 占位）
//   rival：别家先做到了（行业第一次才有；抢先的是谁不一定，用 {who}、{model} 占位，出场角色用 who）
// 里程碑可能在任何时间触发，所以文案里不写具体年月，现实对照由游戏自动补上。
// 结果缓存在 content/milestones/，最后写入 src/career/data/milestones_gen.js。
// 用法：node scripts/build_milestones.mjs [--force] [--only id,id] [--model gemini-3.8-flash] [--jobs 4] [--no-ocg]
// 主通道是本地反代的 gemini-3.8-flash；它限流（429 冷却）时，改用酒馆里 ocg 配置的 DeepSeek v4.1 flash（必须带 opencode 客户端标识）。
// 密钥在运行时从 ~/.config/cliproxyapi/config.yaml 和 ~/SillyTavern 的配置读取，不会打印。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'content/milestones');
const OUT = path.join(ROOT, 'src/career/data/milestones_gen.js');
const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : d; };
const FORCE = args.includes('--force');
const ONLY = opt('only', '') ? new Set(opt('only', '').split(',')) : null;
const MODEL = opt('model', 'gemini-3.8-flash');
const JOBS = Number(opt('jobs', 4));
const BASE = opt('base', 'http://127.0.0.1:8317');

const { MILESTONES } = await import(path.join(ROOT, 'src/career/data/milestones.js'));
const { histInfo } = await import(path.join(ROOT, 'src/career/data/history.js'));
const { describeEffects } = await import(path.join(ROOT, 'src/career/sim/effects.js'));
const { TECH_BY_ID } = await import(path.join(ROOT, 'src/career/data/core.js'));
const { FAMILIES } = await import(path.join(ROOT, 'src/career/data/rivals.js'));

// 客串的只用工具和设施角色：它们不会是玩家，也不会是抢先的那家公司。
const GUESTS = {
  huggingface: '抱抱脸，开源模型社区，大家的模型都放在她那，消息最灵通',
  sillytavern: '酒馆狐娘，角色扮演前端，用户爱玩角色卡，嘴快',
  cursor: '银发的指针，AI 代码编辑器，挑剔模型的代码能力',
  opencode: '机械龙娘，开源终端编程 Agent，爱折腾开源模型',
  ascend: '昇腾狼娘，国产算力，可靠但迁移要吃苦',
};
const EMOS = ['开心', '得意', '兴奋', '慌张', '哭', '无语', '委屈', '心虚', '认真', '生气', '震惊', '平静'];
const realWho = fam => (!fam ? '微软 Phi 团队' : FAMILIES[fam]?.company || fam);
// 现实参考：里程碑另写了 real 的用它（第一个开源推理模型是 QwQ-32B-Preview），否则用史实；real: false 是玩家自家的事，只给史实当写作参考。
function realRef(ms) {
  const h = histInfo(ms.hist, ms.mod);
  if (ms.real) return `${ms.real.date}，${realWho(ms.real.fam)}，${ms.real.title}。${ms.real.text}`;
  return `${h.fact.date}，${realWho(h.realFam)}，${h.fact.title}。${h.fact.text}${ms.real === false ? '（这是玩家自家的事，游戏里不放现实对照；这段只帮你理解气氛）' : ''}`;
}
// “你们做到了”的选项：里程碑自己写了 choices 的用它，否则用史实的选项（skip 不用写）。
const mineChoiceList = (ms, h) => (ms.choices || h.choices).filter(c => c.id !== 'skip');
// 个别里程碑的触发方式要多说一句。
const NOTES = {
  ms_first_sota: '玩家的模型第一次被公认为这个领域最强（拿到 SOTA 标签）：可能是刚发布那天，也可能是挡住了对手的一次挑战以后才坐实。可用 {field} 指这个领域（语言模型、图像生成、音乐生成、语音合成）。',
  ms_open_reasoning_frontier: '玩家发布的开放权重推理模型，综合能力离世界最强不到 4 分。',
};

const SYSTEM = `你是日本视觉小说（galgame）风格的编剧，给一款“AI 模型公司经营”游戏写里程碑事件的文案和短剧。
世界观：只有模型被画成拟人的美少女角色，她们会说话；公司、新闻、数据、法律都是真实世界的。
关键规则：
1. 这个里程碑可能在游戏里任何时间触发，做到的可能是任何一家公司。所以文案里不写具体年份月份，不写“现实中是某某公司”，这些由游戏自动补。
2. 玩家扮演哪家公司不固定。写玩家时只用占位符：{company}（玩家公司名）、{model}（这次的型号名）、{name}（玩家的模型角色名），或者“我们”“你们”。不要写成 DeepSeek、OpenAI 这类具体公司。
3. 别家抢先时，用 {who} 指那家公司、{model} 指那家的型号，不要写具体公司名。
4. 开不开源、公不公开论文，由玩家自己决定。正文和台词不要替玩家说“我们决定开源”“已经公开论文”，选项会让玩家选。
5. 正文用大白话写清楚发生了什么、为什么重要，写公司和团队，不拟人；台词才拟人。
6. 只写触发条件里有的事。不要替玩家编细节：不写模型会看图、听声音、原生多模态，不写具体参数、语言数量、训练数据来源、公开了技术报告这类条件里没有的东西。要提玩家模型的参数时只用占位符 {total}（总参数，单位 B）和 {active}（激活参数，单位 B），只能写在 mine 里。
7. 月底结算时才发现的里程碑（经营做到了某个程度），不写“首日”“刚上线”“今天一上线”这类具体时间点。
8. 人称统一：正文用 {company} 或“你们”指玩家公司，不用“我们”；台词里玩家的模型角色说“我们”指自己的公司。
台词风格：轻松幽默、会吐槽、有梗，像日系 galgame 的中文台词；口语化，每句不超过 45 个字。
禁止：文艺腔、堆砌比喻、抽象大词（如“星辰”“灵魂”“编织”“低语”“光芒”），也不要“我们一起成长吧”这类空话。
只输出一个 JSON 对象，不要代码块，不要解释。`;

const DONE_WHAT = {
  release: '玩家发布了一个满足条件的模型',
  tech: '玩家自己研究出了这项技术，业界还没人公开过',
  paper: '玩家在技术报告里公开了相关训练方法',
  month: '玩家的产品经营做到了这个程度（月底结算时发现的，不是某个具体的“首日”）',
  rival: '对手发布新模型那天',
  reopen: '按开源路线，旧一代模型的权重到期开放了',
};
const doneWhat = ms => NOTES[ms.id] || [].concat(ms.player.on).map(x => DONE_WHAT[x]).join('；或者');

function prompt(ms) {
  const h = histInfo(ms.hist, ms.mod);
  const tech = ms.tech ? TECH_BY_ID[ms.tech] : null;
  const isTech = ms.player.on === 'tech';
  const mineChoices = isTech
    ? '- paper：把方法写成论文公开（口碑、品牌和技术积累上升；以后别家也能照着学）\n- secret：先不公开，自己用（领先保持得更久；以后发布新版本时也能写进技术报告）'
    : mineChoiceList(ms, h).map(c => `- ${c.id}：旧文案「${c.label}」；效果：${describeEffects(c.effects) || '无'}`).join('\n');
  const rivalPart = ms.type === 'first' ? `
另外写“别家先做到”的版本 rival：{who} 抢先做到了这件事，玩家是旁观者。选项（效果固定，只写文字）：
- study：${tech ? `照着论文和开源代码学「${tech.name}」（研究时间缩短）` : '组织团队研究对方的做法（技术积累小幅上升）'}
- distill：如果对方开源了权重，下载下来做蒸馏（拿到训练数据，但会依赖蒸馏、技术积累变慢；对方闭源时不显示这个选项）
- skip：先不跟，按自己的节奏来
rival 的 scene 用 who 代表抢先的那家公司的模型角色（性格按普通的竞争对手写，不要写成具体某个角色），self 是玩家的模型在旁边看。` : '';
  return `里程碑：${ms.title}（${ms.type === 'first' ? '行业第一次：谁先做到算谁的' : '自家里程碑：玩家自己做到时才出现'}）
${tech ? `相关技术：${tech.name}——${tech.desc}\n` : ''}触发方式：${doneWhat(ms)}。
现实参考（只供你理解，不要写进文案）：${realRef(ms)}

写“玩家做到了”的版本 mine。选项的效果是固定的，只改文字，让文字和效果对得上：
${mineChoices}
${rivalPart}
可用占位符：{company}、{model}、{name}、{total}、{active}${ms.type === 'first' ? '、{who}' : ''}${tech ? '、{tech}' : ''}${ms.mods ? '、{field}' : ''}。
客串角色（who 字段可用，选 0–2 个）：${Object.entries(GUESTS).map(([k, v]) => `${k}（${v}）`).join('；')}。
emo 可选：${EMOS.join('/')}，也可以留空。
输出 JSON：
{"mine":{"title":"8–16 字，平实，像新闻标题","body":"两句大白话","line":"玩家的模型角色对玩家说的一句话，不超过 40 字","choices":{${isTech ? '"paper":{"label":"不超过 16 字","result":"选完的结果，一句"},"secret":{"label":"...","result":"..."}' : mineChoiceList(ms, h).map(c => `"${c.id}":{"label":"不超过 18 字的具体决定","result":"选完的结果，一句"}`).join(',')}},"scene":[{"who":"self","emo":"","text":"..."}]}${ms.type === 'first' ? ',\n "rival":{"title":"8–18 字，可带 {who}","body":"两句大白话：发生了什么、对玩家公司意味着什么","choices":{"study":{"label":"...","result":"..."},"distill":{"label":"...","result":"..."},"skip":{"label":"...","result":"..."}},"scene":[{"who":"who","emo":"","text":"..."}]}' : ''}}
mine 的 scene 4–6 行，who 只能用 self、narr 和客串角色；${ms.type === 'first' ? 'rival 的 scene 4–6 行，who 只能用 who、self、narr 和客串角色；' : ''}第一行用 narr 交代发生了什么。`;
}

function apiKey() {
  const cfg = fs.readFileSync(path.join(os.homedir(), '.config/cliproxyapi/config.yaml'), 'utf8');
  const m = cfg.match(/^api-keys:\s*\n((?:\s*-\s*.+\n)+)/m);
  const k = m && m[1].match(/-\s*"?([^"\n]+)"?/);
  if (!k) throw new Error('config.yaml 里没有 api-keys');
  return k[1].trim();
}
const KEY = apiKey();
// 酒馆里名为 ocg 的连接（OpenCode Go）：地址和密钥。
function ocgProfile() {
  try {
    const ST = path.join(os.homedir(), 'SillyTavern/data/default-user');
    const st = JSON.parse(fs.readFileSync(path.join(ST, 'settings.json'), 'utf8'));
    const p = st.extension_settings.connectionManager.profiles.find(x => x.name === 'ocg');
    const sec = JSON.parse(fs.readFileSync(path.join(ST, 'secrets.json'), 'utf8'));
    let key = null;
    for (const v of Object.values(sec)) if (Array.isArray(v)) for (const e of v) if (e?.id === p['secret-id']) key = e.value;
    return p && key ? { base: p['api-url'].replace(/\/$/, ''), key } : null;
  } catch { return null; }
}
const OCG = args.includes('--no-ocg') ? null : ocgProfile();
const OCG_SESSION = crypto.randomUUID();

async function post(url, headers, body, ms = 120000) {
  let r;
  try { r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) }); } catch (e) { throw new Error(`HTTP 408: ${e.name === 'TimeoutError' ? '超时' : e.message}`); }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
// 先走 3.8 flash；被限流就换 OCG 的 DeepSeek（OpenCode Go 只接受带 opencode 客户端标识的请求）。
async function chat(p) {
  const messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content: p }];
  let j;
  try {
    j = await post(`${BASE}/v1/chat/completions`, { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, { model: MODEL, temperature: 0.9, max_tokens: 8000, messages });
    j.by = MODEL;
  } catch (e) {
    if (!OCG || !/HTTP 429|HTTP 408|cooling/.test(e.message)) throw e;
    j = await post(`${OCG.base}/chat/completions`, {
      Authorization: `Bearer ${OCG.key}`, 'Content-Type': 'application/json',
      'User-Agent': 'opencode/1.0.0', 'x-opencode-session': OCG_SESSION, 'x-opencode-client': 'cli',
    }, { model: 'deepseek-v4.1-flash', temperature: 0.9, max_tokens: 16000, messages }, 300000);
    j.by = 'deepseek-v4.1-flash';
  }
  const text = j.choices?.[0]?.message?.content || '';
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error(`没有 JSON：${text.slice(0, 120)}`);
  return { ...JSON.parse(text.slice(a, b + 1)), by: j.by };
}

const BAD = /DeepSeek|OpenAI|Anthropic|Google|谷歌|Meta|阿里|千问|月之暗面|智谱|字节|豆包|百度|文心|腾讯|混元|xAI|Mistral|MiniMax|阶跃|NovelAI|Midjourney|Suno|ElevenLabs|20[12]\d 年/;
function clean(text) {
  const t = String(text || '').trim().replace(/^「|」$/g, '');
  if (!t) throw new Error('空文案');
  if (BAD.test(t)) throw new Error(`写了具体公司或年份：${t.slice(0, 40)}`);
  return t;
}
function cleanScene(scene, allowed) {
  if (!Array.isArray(scene) || scene.length < 3) throw new Error('scene 太短');
  return scene.map(l => {
    if (!allowed.has(l.who)) throw new Error(`未知角色 ${l.who}`);
    return { who: l.who, emo: EMOS.includes(l.emo) ? l.emo : '', text: clean(l.text) };
  });
}
function cleanChoices(c, ids) {
  return Object.fromEntries(ids.map(id => {
    if (!c?.[id]?.label) throw new Error(`缺少选项 ${id}`);
    return [id, { label: clean(c[id].label), result: clean(c[id].result || '') }];
  }));
}

async function gen(ms) {
  const h = histInfo(ms.hist, ms.mod);
  const out = await chat(prompt(ms));
  const ids = ms.player.on === 'tech' ? ['paper', 'secret'] : mineChoiceList(ms, h).map(c => c.id);
  const g = Object.keys(GUESTS);
  const res = { by: out.by, mine: {
    title: clean(out.mine?.title), body: clean(out.mine?.body), line: clean(out.mine?.line),
    choices: cleanChoices(out.mine?.choices, ids), scene: cleanScene(out.mine?.scene, new Set(['self', 'narr', ...g])),
  } };
  if (ms.type === 'first') res.rival = {
    title: clean(out.rival?.title), body: clean(out.rival?.body),
    choices: cleanChoices(out.rival?.choices, ['study', 'distill', 'skip']), scene: cleanScene(out.rival?.scene, new Set(['who', 'self', 'narr', ...g])),
  };
  return res;
}

function writeOut() {
  const all = {};
  for (const ms of MILESTONES) if (fs.existsSync(cachePath(ms.id))) { const v = JSON.parse(fs.readFileSync(cachePath(ms.id), 'utf8')); delete v.by; all[ms.id] = v; }
  fs.writeFileSync(OUT, `// 由 scripts/build_milestones.mjs 生成（主要是 ${MODEL}，限流时用 DeepSeek v4.1 flash），请勿手改；要改就改缓存 content/milestones/<id>.json 后重新运行。\n`
    + `// 占位符：{company}{model}{name} 指玩家，{who}{model} 指抢先的别家，{tech} 是相关技术；现实对照由游戏自动补上。\n`
    + `export const MS_TEXT = ${JSON.stringify(all, null, 1)};\n`);
  return Object.keys(all).length;
}
const cachePath = id => path.join(CACHE, `${id}.json`);
const cached = id => (!FORCE && fs.existsSync(cachePath(id)) ? JSON.parse(fs.readFileSync(cachePath(id), 'utf8')) : null);
fs.mkdirSync(CACHE, { recursive: true });
const todo = MILESTONES.filter(ms => (!ONLY || ONLY.has(ms.id)) && !cached(ms.id));
console.log(`共 ${MILESTONES.length} 个里程碑，需要生成 ${todo.length} 个（模型 ${MODEL}，并发 ${JOBS}）`);
let next = 0;
let failed = 0;
await Promise.all(Array.from({ length: JOBS }, async () => {
  while (next < todo.length) {
    const ms = todo[next++];
    let v = null;
    for (let i = 1; i <= 8 && !v; i++) {
      try { v = await gen(ms); } catch (e) {
        console.warn(`  ${ms.id} 第 ${i} 次失败：${e.message.slice(0, 80)}`);
        // 反代限流时等一会儿再试，越往后等得越久。
        if (/HTTP 429|HTTP 408|cooling/.test(e.message)) await new Promise(r => setTimeout(r, (5 + 5 * i + Math.random() * 5) * 1000));
      }
    }
    if (v) { fs.writeFileSync(cachePath(ms.id), `${JSON.stringify(v, null, 1)}\n`); console.log(`  ✓ ${ms.id}（${v.by}）`); writeOut(); } else failed += 1;
  }
}));
const n = writeOut();
console.log(`写入 ${path.relative(ROOT, OUT)}：${n} 个里程碑${failed ? `，${failed} 个失败` : ''}`);
