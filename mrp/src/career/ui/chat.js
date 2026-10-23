// 图鉴里的 BYOK 对话（规格 E10）。只做三件事：把名册里的人设拼成 system prompt、按 OpenAI 兼容格式发一次请求、
// 把回复清洗成 { text, emotion }。不读写游戏状态，不调用引擎的写操作，也不碰存档。
//
// 存储：接口地址、模型名和“附带当前局面”的勾选存在 localStorage 的 mrp.chat.v1；
// 密钥默认只在模块内存里，勾了“本次会话记住密钥”才写 sessionStorage。密钥永远不写 localStorage，
// 也不放进游戏状态，所以存档和导出里都不会出现。
import { CHARACTER_ROSTER } from '../data/roster.js';

export const CHAT_SETTINGS_KEY = 'mrp.chat.v1';
export const CHAT_SESSION_KEY = 'mrp.chat.v1.key';
export const TIMEOUT_MS = 45000;
export const THROTTLE_MS = 3000;
export const MAX_TEXT = 400;

// 立绘表情枚举：名册里 sprites 用到的键（neutral / happy / worried / determined），neutral 永远可用。
const SPRITE_KEYS = new Set(['neutral']);
for (const c of CHARACTER_ROSTER) for (const k of Object.keys(c.sprites || {})) SPRITE_KEYS.add(k);
export const EMOTIONS = ['neutral', ...['happy', 'worried', 'determined'].filter(k => SPRITE_KEYS.has(k))];
export const DEFAULT_EMOTION = 'neutral';

const rosterById = new Map(CHARACTER_ROSTER.map(c => [c.id, c]));

const safeStorage = kind => {
  try {
    // Node 里也有一个会报警告的 localStorage 取值器；先看自有属性，没有真的存储对象就当不存在。
    const d = Object.getOwnPropertyDescriptor(globalThis, kind);
    const s = d && 'value' in d ? d.value : typeof window !== 'undefined' ? window[kind] : null;
    return s && typeof s.getItem === 'function' ? s : null;
  } catch {
    return null;
  }
};
const getItem = (kind, key) => { try { return safeStorage(kind)?.getItem(key) ?? null; } catch { return null; } };
const setItem = (kind, key, value) => { try { safeStorage(kind)?.setItem(key, value); return true; } catch { return false; } };
const removeItem = (kind, key) => { try { safeStorage(kind)?.removeItem(key); return true; } catch { return false; } };

// ---------- 设置 ----------
const DEFAULTS = { base: '', model: '', includeContext: true };

export function loadSettings() {
  const raw = getItem('localStorage', CHAT_SETTINGS_KEY);
  if (!raw) return { ...DEFAULTS };
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { ...DEFAULTS };
    return {
      base: typeof v.base === 'string' ? v.base : '',
      model: typeof v.model === 'string' ? v.model : '',
      includeContext: v.includeContext !== false,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

// 只写地址、模型名和勾选。就算调用方传了密钥字段也故意丢掉（密钥有自己的入口）。
export function saveSettings(patch = {}) {
  const cur = loadSettings();
  const next = {
    base: typeof patch.base === 'string' ? patch.base : cur.base,
    model: typeof patch.model === 'string' ? patch.model : cur.model,
    includeContext: typeof patch.includeContext === 'boolean' ? patch.includeContext : cur.includeContext,
  };
  setItem('localStorage', CHAT_SETTINGS_KEY, JSON.stringify(next));
  return next;
}

// ---------- 密钥 ----------
let memoryKey = '';
let sessionKeyLoaded = false;

export function getChatKey() {
  if (!memoryKey && !sessionKeyLoaded) {
    sessionKeyLoaded = true;
    memoryKey = getItem('sessionStorage', CHAT_SESSION_KEY) || '';
  }
  return memoryKey;
}

export function setChatKey(key, remember = false) {
  memoryKey = String(key ?? '');
  sessionKeyLoaded = true;
  if (memoryKey && remember) setItem('sessionStorage', CHAT_SESSION_KEY, memoryKey);
  else removeItem('sessionStorage', CHAT_SESSION_KEY);
}

export function clearChatKey() { memoryKey = ''; sessionKeyLoaded = true; removeItem('sessionStorage', CHAT_SESSION_KEY); }
export const keyRemembered = () => !!getItem('sessionStorage', CHAT_SESSION_KEY);

// ---------- 地址 ----------
// 只认 https，或者本机的 http://localhost、http://127.0.0.1（带端口也行）；别的协议和外部明文 http 都拒绝。
export function validateBaseUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return { ok: false, reason: '还没有填接口地址。' };
  let u;
  try { u = new URL(raw); } catch { return { ok: false, reason: '接口地址不是完整的网址。' }; }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol === 'https:' || (u.protocol === 'http:' && local)) {
    if (!u.hostname) return { ok: false, reason: '接口地址里没有主机名。' };
    return { ok: true, base: u.href.replace(/\/+$/, '') };
  }
  return { ok: false, reason: '接口地址必须是 https，或者本机的 http://localhost、http://127.0.0.1。' };
}

export const chatEndpoint = base => `${String(base).replace(/\/+$/, '')}/chat/completions`;

// ---------- 人设与清洗 ----------
const CN_EMOTION = { 平静: 'neutral', 普通: 'neutral', 开心: 'happy', 高兴: 'happy', 得意: 'happy', 兴奋: 'happy', 担心: 'worried', 慌张: 'worried', 难过: 'worried', 委屈: 'worried', 认真: 'determined', 坚定: 'determined', 生气: 'determined' };

export function buildSystemPrompt(characterId, context = {}) {
  const c = rosterById.get(characterId);
  if (!c) return '';
  const lines = [
    `你是「${c.name}」（${c.label}），网页游戏《模型育成计划》里的角色。`,
    c.quote ? `你平时会这样说：「${c.quote}」` : '',
    '和玩家说话时保持这个口吻，用简体中文和日常口语，回答简短，最多 400 字。',
    '不要替玩家操作游戏，也不要编造游戏里的数值。',
    `如果你愿意，可以用 JSON 回复：{"text":"要说的话","emotion":"${EMOTIONS.join('|')}"}；不想用 JSON 就直接说。`,
  ].filter(Boolean);
  const bits = [];
  if (context.company) bits.push(`当前公司是「${context.company}」`);
  if (context.date) bits.push(`今天是 ${context.date}`);
  if (Array.isArray(context.models)) bits.push(context.models.length ? `在线模型有：${context.models.join('、')}` : '现在还没有在线模型');
  if (bits.length) lines.push(`可以顺带知道的局面：${bits.join('；')}。`);
  return lines.join('\n');
}

function truncateText(text) {
  const chars = Array.from(String(text ?? ''));
  return chars.length <= MAX_TEXT ? chars.join('') : chars.slice(0, MAX_TEXT).join('');
}

function parseMaybeJson(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : t;
  try {
    const v = JSON.parse(body);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

const normalEmotion = e => {
  const v = String(e ?? '').trim();
  if (EMOTIONS.includes(v)) return v;
  return CN_EMOTION[v] || DEFAULT_EMOTION;
};

// 能解析出 JSON 就取 text / emotion；不能就把整段当 text。text 按字符截到 400，emotion 不在枚举里就用默认。
export function cleanReply(raw) {
  const whole = String(raw ?? '');
  const obj = parseMaybeJson(whole);
  if (obj && typeof obj.text === 'string') {
    return { text: truncateText(obj.text), emotion: normalEmotion(obj.emotion) };
  }
  return { text: truncateText(whole), emotion: DEFAULT_EMOTION };
}

// OpenAI 兼容回复里的 content 可能是字符串，也可能是分块数组；取不到就返回 null。
function contentOf(data) {
  const c = data?.choices?.[0]?.message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(x => (typeof x === 'string' ? x : x?.text || '')).join('');
  return null;
}

// ---------- 请求 ----------
let lastSentAt = -Infinity;
export const _resetThrottle = () => { lastSentAt = -Infinity; };

// 只发一次 POST {base}/chat/completions。超时用 AbortController；网络错误、超时、非 2xx 都变成中文原因，不往外抛。
export async function requestChat({ base, model, key, messages, timeoutMs = TIMEOUT_MS, fetchImpl } = {}) {
  const v = validateBaseUrl(base);
  if (!v.ok) return v;
  const f = fetchImpl || globalThis.fetch;
  if (typeof f !== 'function') return { ok: false, reason: '这个浏览器不支持联网对话。' };
  if (!key) return { ok: false, reason: '还没有填密钥。' };
  if (!model) return { ok: false, reason: '还没有填模型名。' };

  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), Math.max(1, timeoutMs)) : null;
  let res;
  try {
    res = await f(chatEndpoint(v.base), {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages }),
      signal: ctrl?.signal,
    });
  } catch {
    if (ctrl?.signal?.aborted) {
      return { ok: false, reason: `等了 ${Math.max(1, Math.round(timeoutMs / 1000))} 秒还没有回复，这次先不聊了。` };
    }
    return { ok: false, reason: '连不上你填的地址，可能是网络不通，也可能是地址写错了。' };
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!res?.ok) return { ok: false, reason: `服务器回了 ${res?.status ?? '一个错误'}，这次没聊成。` };
  let data;
  try { data = await res.json(); } catch { return { ok: false, reason: '服务器回的不是能读的 JSON。' }; }
  const content = contentOf(data);
  if (content === null) return { ok: false, reason: '服务器没有回话。' };
  return { ok: true, ...cleanReply(content) };
}

// 角色对玩家说一句。没填地址或没填密钥时用名册里的 quote 做离线回应；网络请求 3 秒内只发一次。
export async function askCharacter(characterId, userText, opts = {}) {
  const c = rosterById.get(characterId);
  if (!c) return { ok: false, reason: '名册里没有这个角色。' };
  const saved = loadSettings();
  const base = 'base' in opts ? opts.base : saved.base;
  const model = 'model' in opts ? opts.model : saved.model;
  const key = 'key' in opts ? opts.key : getChatKey();
  if (!base || !key) return { ok: true, offline: true, text: c.quote, emotion: DEFAULT_EMOTION };

  const v = validateBaseUrl(base);
  if (!v.ok) return { ok: false, reason: v.reason };
  if (!model) return { ok: false, reason: '还没有填模型名。' };

  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  if (now - lastSentAt < THROTTLE_MS) return { ok: false, throttled: true, reason: '刚刚发过一条了，等 3 秒再试。' };
  lastSentAt = now;

  const includeContext = 'includeContext' in opts ? !!opts.includeContext : saved.includeContext;
  const context = includeContext ? opts.context || {} : {};
  const messages = [
    { role: 'system', content: buildSystemPrompt(characterId, context) },
    { role: 'user', content: String(userText ?? '') },
  ];
  return requestChat({ base, model, key, messages, timeoutMs: opts.timeoutMs, fetchImpl: opts.fetchImpl });
}
