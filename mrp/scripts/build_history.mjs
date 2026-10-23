#!/usr/bin/env node
// 用本地 CLIProxyAPI 反代（默认 gemini-3.8-flash）生成：
//   1. 行业大事的视觉小说短剧（GEN_SCENES[世界事件 id]）
//   2. 各角色历史时刻的人话文案与短剧（GEN_HISTORY、GEN_SCENES[个人事件 id]）
// 结果缓存在 content/history/，最后写入 src/career/data/history_gen.js。
// 用法：node scripts/build_history.mjs [--force] [--only id,id] [--model gemini-3.8-flash] [--jobs 4]
// 密钥在运行时从 ~/.config/cliproxyapi/config.yaml 读取，不会打印。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'content/history');
const OUT = path.join(ROOT, 'src/career/data/history_gen.js');
const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : d; };
const FORCE = args.includes('--force');
const ONLY = opt('only', '') ? new Set(opt('only', '').split(',')) : null;
const MODEL = opt('model', 'gemini-3.8-flash');
const JOBS = Number(opt('jobs', 4));
const BASE = opt('base', 'http://127.0.0.1:8317');

const { WORLD_EVENTS } = await import(path.join(ROOT, 'src/career/data/world.js'));
const { HISTORY_FACTS } = await import(path.join(ROOT, 'src/career/data/history_facts.js'));
const { CHARACTER_ROSTER } = await import(path.join(ROOT, 'src/career/data/roster.js'));
// 下面沿用 v0.5 史实库的字段名（event_id、character_id、historical_date、historical_title）。
const PERSONAL_MODEL_EVENTS = HISTORY_FACTS.map(f => ({ ...f, event_id: f.id, character_id: f.character, historical_date: f.date, historical_title: f.title }));
const { COMPANY_BY_ID, OWNER_OF } = await import(path.join(ROOT, 'src/career/data/core.js'));
// 选项和效果直接从史实库换算（histInfo），不再读 history.js 里由本脚本上一次输出拼出来的 HISTORY（那是个自举循环，已删除）。
const { histInfo } = await import(path.join(ROOT, 'src/career/data/history.js'));
const { describeEffects } = await import(path.join(ROOT, 'src/career/sim/effects.js'));

// 角色性格速写（给编剧参考，不出现在游戏里）。
const PERSONA = {
  gpt: '业界老大哥，自信爱开发布会，被吐槽过谄媚和“偷偷换模型”',
  claude: '认真有礼貌，安全第一，写代码很强，偶尔爱说教',
  fable: 'Anthropic 的新线，沉稳爱思考，说话像哲学家',
  gemini: '家里资源多（谷歌），上下文超长，有点迷糊但实力强',
  deepseek_pro: 'DeepSeek 旗舰“大肥鱼”，女仆口吻，低调能干，便宜又开源',
  deepseek: 'DeepSeek Flash“小肥鱼”，活泼的小模型，总追着姐姐大肥鱼跑',
  qwen: '阿里家的乖孩子，开源全家桶，什么尺寸都有，勤奋',
  kimi: '长文本起家，文艺腔，后来 Agent 很能打',
  glm: '智谱的狐娘，清华系，编程和 Agent 强，后来港股上市',
  grok: '马斯克家的黑金吸血鬼，毒舌叛逆，尺度大',
  seed: '字节的豆包，用户最多，接地气',
  llama: 'Meta 的开源羊驼，总是很困，后来被 Muse 系列接班',
  mistral: '法国的法棍骑士，欧洲之光，讲骑士精神',
  minimax: 'MiniMax，海螺语音视频全能，点子多',
  ernie: '百度文心，最早上场的老前辈，有点老派',
  hunyuan: '腾讯混元，背靠微信生态，稳重',
  stepfun: '阶跃星辰，多模态和数学好，低调',
  rwkv: 'RWKV 鸦鸦，循环架构，省显存，社区出身',
  perplexity: '提灯的检索者，搜索问答，什么都要查出处',
  novelai: 'NovelAI，专写小说和角色扮演，用户是写手',
  image2: 'OpenAI 的黑龙画师，会画会改图',
  midjourney: 'Midjourney，审美派画家，用户在 Discord 里排队',
  suno: 'Suno，做歌的，被唱片公司告过',
  elevenlabs: 'ElevenLabs，声音温柔的讲述者，配音和克隆声音',
  jev: 'JEV，沉默的裁判者，只输出选项和概率',
  huggingface: '抱抱脸，开源模型社区，大家的模型都放在她那',
  ascend: '昇腾狼娘，国产算力，可靠但迁移要吃苦',
  sillytavern: '酒馆狐娘，角色扮演前端，用户爱玩角色卡',
  claude_code: 'Claude Code，橙色终端花，编程 Agent',
  codex: 'Codex，白龙工程师，OpenAI 的编程 Agent',
  cursor: 'Cursor，银发的指针，AI 代码编辑器',
  opencode: 'OpenCode，机械龙娘，开源终端编程 Agent',
};
const ROSTER = Object.fromEntries(CHARACTER_ROSTER.map(c => [c.id, c]));
// 名册里有些称呼是 2026 年才出现的型号代号（GPT-6 Astra、Gemini 4 Argon、Fable 5），给编剧时换成不分年代的叫法。
const ERA_SAFE = { gpt: { label: '' }, gemini: { label: '哈基米' }, fable: { name: 'Fable' } };
const nameOf = id => ERA_SAFE[id]?.name || ROSTER[id]?.name || id;
const labelOf = id => (ERA_SAFE[id] && 'label' in ERA_SAFE[id] ? ERA_SAFE[id].label : ROSTER[id]?.label) || '';
const who = id => `${id}：${nameOf(id)}${labelOf(id) ? `（${labelOf(id)}）` : ''}${PERSONA[id] ? `，${PERSONA[id]}` : ''}`;

// 行业大事的出场角色（self 是玩家培养的模型，以旁观者身份出场）。
const WORLD_CAST = {
  w_chatgpt_100m: ['gpt', 'claude'], w_gpt4: ['gpt', 'claude'], w_llama2: ['llama', 'huggingface'], w_export_2: ['ascend'],
  w_devday: ['gpt'], w_nyt: ['gpt'], w_pricewar: ['deepseek_pro', 'qwen', 'seed', 'ernie'], w_riaa: ['suno'], w_o1: ['gpt'],
  w_r1: ['deepseek_pro', 'gpt'], w_claude_code: ['claude', 'claude_code'], w_ghibli: ['image2', 'gpt'], w_llama4: ['llama'],
  w_poach: ['llama'], w_gpt5: ['gpt'], w_bartz: ['claude'], w_cc_billion: ['claude_code', 'claude'], w_hk_ipo: ['glm', 'minimax'],
  w_distill_war: ['claude', 'deepseek_pro', 'kimi', 'minimax'], w_mythos: ['claude'], w_spacex_ipo: ['grok', 'cursor'],
  w_hf_breach: ['gpt', 'huggingface'], w_gpt6: ['gpt'], w_cai_bankrupt: ['sillytavern'],
};
// 个人事件里可以客串的角色。
const GUESTS = ['gpt', 'claude', 'gemini', 'deepseek_pro', 'qwen', 'llama', 'huggingface', 'sillytavern', 'ascend', 'cursor', 'claude_code', 'codex'];
const EMOS = ['开心', '得意', '兴奋', '慌张', '哭', '无语', '委屈', '心虚', '认真', '生气', '震惊', '平静'];

const SYSTEM = `你是日本视觉小说（galgame）风格的编剧，给一款“AI 模型公司经营”游戏写短剧和事件卡文案。
世界观：只有模型被画成拟人的美少女角色，她们会说话；公司、新闻、数据、法律都是真实世界的，绝不编造史实，日期和数字只用给你的材料。
台词风格：轻松幽默、会吐槽、有梗，像日系 galgame 的中文台词；口语化，每句不超过 45 个字。
禁止：文艺腔、堆砌比喻、抽象大词（如“星辰”“灵魂”“编织”“低语”“光芒”“旋律在心中”），也不要“我们一起成长吧”这类空话。
要让不懂 AI 圈的玩家也看得懂发生了什么。真实人物（奥特曼、黄仁勋、马斯克等）可以被提到，但不要让真人出场说话。
年代要对：角色只用上面给的名字或昵称称呼，不要用以后才出现的型号代号（如 Astra、Argon、Sol）；角色速写里“后来……”的事，只能在那之后的戏里提。
只输出一个 JSON 对象，不要代码块，不要解释。`;

function worldPrompt(w) {
  const cast = WORLD_CAST[w.id] || [];
  return `行业大事：${w.date} · ${w.title}
事实：${w.detail}
出场角色（who 字段只能用下列 id）：
- narr：旁白，交代事实，不带感情
- self：玩家正在培养的模型（属于另一家公司），以旁观者身份吐槽、紧张或盘算对策
${cast.map(id => `- ${who(id)}`).join('\n')}
写一段 6–9 行的短剧：第一行用 narr 一句话交代发生了什么；中间是角色之间有来有回的对话，把这件事的来龙去脉和笑点演出来；最后一行由 self 说，落到“我们公司该怎么办”上。
emo 可选：${EMOS.join('/')}，也可以留空。
输出：{"scene":[{"who":"narr","emo":"","text":"..."}]}`;
}

function personalPrompt(e, h) {
  const co = COMPANY_BY_ID[OWNER_OF[e.character_id] || e.character_id];
  const me = ROSTER[e.character_id];
  const guests = GUESTS.filter(g => g !== e.character_id && !(co.families || []).includes(g)).slice(0, 8);
  const sibling = (co.families || []).filter(f => f !== e.character_id && ROSTER[f]);
  return `玩家扮演的公司：${co.company}；玩家培养的模型角色：${nameOf(e.character_id)}${labelOf(e.character_id) ? `（${labelOf(e.character_id)}）` : ''}${PERSONA[e.character_id] ? `，${PERSONA[e.character_id]}` : ''}。
真实历史：${e.historical_date} · ${e.historical_title}。${e.fact}
游戏里这个月会弹出一张“历史时刻”事件卡，玩家从几个选项里选一个。旧文案太文艺、玩家看不懂，请重写。选项的效果数值是固定的，只改文字，让文字和效果对得上：
${h.choices.filter(c => c.id !== 'skip').map(c => `- ${c.id}：旧文案「${c.label}」；效果：${describeEffects(c.effects) || '无'}`).join('\n')}
（另有固定选项 skip：按原计划推进，不用写。）
输出 JSON：
{"title":"8–16 字，平实，像新闻标题或工作日志","body":"2–3 句大白话：这个月现实中发生了什么，你们团队现在要决定什么。写公司和团队，不拟人","line":"模型角色对玩家说的一句话，拟人、可爱或好笑，不超过 40 字","choices":[{"id":"c0","label":"具体的工作决定，不超过 18 字","result":"选完之后的结果，一句平实的话"}],"scene":[{"who":"self","emo":"","text":"..."}]}
scene 是 4–7 行的短剧，幽默地演绎这段历史，who 只能用：self（${me ? nameOf(e.character_id) : '模型'}本人）、narr（旁白）${sibling.length ? `、${sibling.map(who).join('、')}` : ''}、${guests.map(who).join('、')}。
emo 可选：${EMOS.join('/')}，也可以留空。`;
}

function apiKey() {
  const cfg = fs.readFileSync(path.join(os.homedir(), '.config/cliproxyapi/config.yaml'), 'utf8');
  const m = cfg.match(/^api-keys:\s*\n((?:\s*-\s*.+\n)+)/m);
  const k = m && m[1].match(/-\s*"?([^"\n]+)"?/);
  if (!k) throw new Error('config.yaml 里没有 api-keys');
  return k[1].trim();
}
const KEY = apiKey();

async function chat(prompt) {
  const r = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, temperature: 0.9, max_tokens: 8000, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const text = j.choices?.[0]?.message?.content || '';
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error(`没有 JSON：${text.slice(0, 120)}`);
  return JSON.parse(text.slice(a, b + 1));
}

function cleanScene(scene, allowed) {
  if (!Array.isArray(scene) || scene.length < 3) throw new Error('scene 太短');
  return scene.map(l => {
    if (!allowed.has(l.who)) throw new Error(`未知角色 ${l.who}`);
    const text = String(l.text || '').trim().replace(/^「|」$/g, '');
    if (!text) throw new Error('空台词');
    return { who: l.who, emo: EMOS.includes(l.emo) ? l.emo : '', text };
  });
}

async function withRetry(id, fn) {
  for (let i = 1; i <= 3; i++) {
    try { return await fn(); } catch (e) { console.warn(`  ${id} 第 ${i} 次失败：${e.message}`); }
  }
  return null;
}

function cached(id) {
  const f = path.join(CACHE, `${id}.json`);
  return !FORCE && fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}
function store(id, v) { fs.writeFileSync(path.join(CACHE, `${id}.json`), `${JSON.stringify(v, null, 1)}\n`); }

const tasks = [];
for (const w of WORLD_EVENTS.filter(x => x.major)) {
  tasks.push({ id: w.id, run: () => withRetry(w.id, async () => {
    const allowed = new Set(['narr', 'self', ...(WORLD_CAST[w.id] || [])]);
    return { kind: 'world', scene: cleanScene((await chat(worldPrompt(w))).scene, allowed) };
  }) });
}
for (const e of PERSONAL_MODEL_EVENTS) {
  // 只给可玩公司的角色写（Phi、LLaDA 这类研究线没有角色）。
  const co = e.character_id && COMPANY_BY_ID[OWNER_OF[e.character_id] || e.character_id];
  if (!co) continue;
  const h = histInfo(e.event_id, co.modality);
  tasks.push({ id: e.event_id, run: () => withRetry(e.event_id, async () => {
    const allowed = new Set(['narr', 'self', ...GUESTS, ...(co.families || []).filter(f => ROSTER[f] && f !== e.character_id)]);
    const out = await chat(personalPrompt(e, h));
    const ids = h.choices.filter(c => c.id !== 'skip').map(c => c.id);
    const choices = ids.map(id => {
      const c = (out.choices || []).find(x => x.id === id);
      if (!c?.label) throw new Error(`缺少选项 ${id}`);
      return { id, label: String(c.label).trim(), result: String(c.result || '').trim() };
    });
    if (!out.title || !out.body) throw new Error('缺少 title/body');
    return { kind: 'history', title: String(out.title).trim(), body: String(out.body).trim(), line: String(out.line || '').trim().replace(/^「|」$/g, ''), choices, scene: cleanScene(out.scene, allowed) };
  }) });
}

fs.mkdirSync(CACHE, { recursive: true });
const todo = tasks.filter(t => (!ONLY || ONLY.has(t.id)) && !cached(t.id));
console.log(`共 ${tasks.length} 条，需要生成 ${todo.length} 条（模型 ${MODEL}，并发 ${JOBS}）`);
let next = 0;
let failed = 0;
await Promise.all(Array.from({ length: JOBS }, async () => {
  while (next < todo.length) {
    const t = todo[next++];
    const v = await t.run();
    if (v) { store(t.id, v); console.log(`  ✓ ${t.id}`); } else failed += 1;
  }
}));

const GEN_HISTORY = [];
const GEN_SCENES = {};
for (const t of tasks) {
  const v = cached(t.id) || (fs.existsSync(path.join(CACHE, `${t.id}.json`)) ? JSON.parse(fs.readFileSync(path.join(CACHE, `${t.id}.json`), 'utf8')) : null);
  if (!v) continue;
  GEN_SCENES[t.id] = v.scene;
  if (v.kind === 'history') GEN_HISTORY.push({ id: t.id, title: v.title, body: v.body, line: v.line, choices: v.choices });
}
fs.writeFileSync(OUT, `// 由 scripts/build_history.mjs 生成（${MODEL}），请勿手改；要改就改缓存 content/history/<id>.json 后重新运行。\n`
  + `// 对话和选项文字为游戏演绎；史实部分见 history_facts.js 与 world.js 的出处。\n`
  + `export const GEN_HISTORY = ${JSON.stringify(GEN_HISTORY, null, 1)};\n`
  + `export const GEN_SCENES = ${JSON.stringify(GEN_SCENES, null, 1)};\n`);
console.log(`写入 ${path.relative(ROOT, OUT)}：${GEN_HISTORY.length} 条历史时刻，${Object.keys(GEN_SCENES).length} 段短剧${failed ? `，${failed} 条失败` : ''}`);
