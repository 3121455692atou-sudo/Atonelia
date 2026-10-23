// P3.U3 的 BYOK 验收（规格 E10、F2）：
// 密钥不进状态和导出；地址只收 https 或本机 http；本地 mock 服务器检查请求格式；
// 超时、节流、离线回应、回复转义；图鉴三个子页在 24 家公司 × 4 个剧本下都能渲染。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import * as E from '../../src/career/engine.js';
import { PLAYABLE, SCENARIOS } from '../../src/career/data/core.js';
import { CHARACTER_ROSTER } from '../../src/career/data/roster.js';
import { resolveAll } from '../helpers/career_bot.mjs';

// fmt.js 在模块加载时读 document.baseURI；先给一个最小替身，再动态导入界面。
globalThis.document ??= { baseURI: 'http://localhost/' };
const chat = await import('../../src/career/ui/chat.js');
const archive = await import('../../src/career/ui/pages/archive.js');
const settings = await import('../../src/career/ui/pages/settings.js');

// 假密钥：故意写成一眼能看出不是真的（真实密钥不允许出现在代码、测试或日志里）。
const KEY = 'sk-test-not-real-000';
const quoteOf = id => CHARACTER_ROSTER.find(c => c.id === id).quote;

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
  get length() { return this.map.size; }
}

// 每个用例前换一份干净的浏览器存储，也清掉内存里可能留着的密钥和节流时间。
function freshStorage() {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true, writable: true });
  chat.clearChatKey();
  chat._resetThrottle();
  return { local, session };
}

async function mockServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

async function closeServer(server) {
  server.closeAllConnections?.();
  await new Promise(resolve => server.close(resolve));
}

const readBody = req => new Promise(resolve => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
});

describe('BYOK：密钥不进存档，也不进导出', () => {
  it('setChatKey 之后，游戏状态的 JSON 和设置页“导出存档”的内容里都没有密钥字符串或密钥字段', async () => {
    const { local, session } = freshStorage();
    chat.saveSettings({ base: 'https://api.example.com/v1', model: 'demo-model' });
    chat.setChatKey(KEY, true);
    assert.equal(chat.getChatKey(), KEY);
    assert.equal(session.getItem(chat.CHAT_SESSION_KEY), KEY);
    assert.equal(local.getItem(chat.CHAT_SESSION_KEY), null);
    assert.ok(!JSON.stringify(Object.fromEntries(local.map)).includes(KEY), 'localStorage 里出现了密钥');
    assert.ok(!JSON.stringify(chat.saveSettings({ key: KEY })).includes(KEY), 'saveSettings 收下了密钥字段');

    const s = E.createGame('deepseek', 'y2023', 7);
    resolveAll(s);
    const json = JSON.stringify(s);
    assert.ok(!json.includes(KEY), '序列化状态里出现了密钥字符串');
    assert.ok(!/"chatKey"|"apiKey"|"secret"/.test(json), '序列化状态里出现了密钥字段');

    // 走设置页真正的导出路径：downloadText 把 JSON.stringify(S) 交给浏览器下载。
    const blobs = [];
    const realCreate = URL.createObjectURL;
    const realRevoke = URL.revokeObjectURL;
    const realCreateElement = globalThis.document.createElement;
    const realSetTimeout = globalThis.setTimeout;
    URL.createObjectURL = blob => { blobs.push(blob); return 'blob:test'; };
    URL.revokeObjectURL = () => {};
    globalThis.document.createElement = () => ({ href: '', download: '', click() {} });
    globalThis.setTimeout = () => 0;
    try {
      settings.click(s, { closest: () => ({ dataset: { op: 'export' } }) }, { st: {}, draw() {} });
    } finally {
      globalThis.setTimeout = realSetTimeout;
      URL.createObjectURL = realCreate;
      URL.revokeObjectURL = realRevoke;
      globalThis.document.createElement = realCreateElement;
    }
    assert.equal(blobs.length, 1);
    const exported = await blobs[0].text();
    assert.ok(!exported.includes(KEY), '导出的存档里出现了密钥字符串');
    assert.ok(!/"chatKey"|"apiKey"|"secret"/.test(exported), '导出的存档里出现了密钥字段');
    assert.equal(exported, json);
  });
});

describe('BYOK：地址校验', () => {
  it('https 通过；本机 http 带端口也通过；外部明文 http、ftp、javascript 拒绝并给出中文原因', () => {
    for (const url of ['https://api.example.com/v1', 'https://api.example.com/v1/', 'http://localhost:8080', 'http://127.0.0.1', 'http://127.0.0.1:11434/v1']) {
      const r = chat.validateBaseUrl(url);
      assert.equal(r.ok, true, url);
      assert.ok(r.base && !r.base.endsWith('/'), `${url} 没有规整尾部斜杠：${r.base}`);
    }
    for (const url of ['http://example.com', 'http://localhost.evil.com', 'ftp://example.com', 'javascript:alert(1)', 'not a url']) {
      const r = chat.validateBaseUrl(url);
      assert.equal(r.ok, false, url);
      assert.match(r.reason, /https|localhost|127\.0\.0\.1|网址/, `${url} 的原因不是中文说明：${r.reason}`);
    }
  });
});

describe('BYOK：请求格式、清洗、节流、超时、离线', () => {
  it('POST /chat/completions，Authorization: Bearer 密钥，Content-Type: application/json，body 有 model 和 messages（第一条 system）；回复截到 400 字、emotion 在枚举里', async () => {
    freshStorage();
    const seen = [];
    const long = '字'.repeat(600);
    const { server, base } = await mockServer(async (req, res) => {
      const body = await readBody(req);
      seen.push({ method: req.method, url: req.url, headers: req.headers, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ text: long, emotion: 'happy' }) } }] }));
    });
    try {
      const r = await chat.askCharacter('qwen', '你好呀', { base, model: 'test-model', key: KEY, now: 0, fetchImpl: fetch });
      assert.equal(r.ok, true, JSON.stringify(r));
      assert.equal(seen.length, 1);
      assert.equal(seen[0].method, 'POST');
      assert.equal(seen[0].url, '/chat/completions');
      assert.equal(seen[0].headers.authorization, `Bearer ${KEY}`);
      assert.match(seen[0].headers['content-type'], /^application\/json/);
      const body = JSON.parse(seen[0].body);
      assert.equal(body.model, 'test-model');
      assert.equal(body.messages[0].role, 'system');
      assert.match(body.messages[0].content, /Qwen/);
      assert.equal(body.messages[1].role, 'user');
      assert.equal(body.messages[1].content, '你好呀');
      assert.equal(Array.from(r.text).length, chat.MAX_TEXT);
      assert.ok(chat.EMOTIONS.includes(r.emotion), r.emotion);
    } finally {
      await closeServer(server);
    }
  });

  it('服务器一直不回时，用缩短的超时停下，并给出中文原因', async () => {
    freshStorage();
    const { server, base } = await mockServer(() => { /* 故意不回 */ });
    try {
      const r = await chat.askCharacter('qwen', '在吗', { base, model: 'test-model', key: KEY, now: 0, timeoutMs: 60, fetchImpl: fetch });
      assert.equal(r.ok, false);
      assert.match(r.reason, /没有回复|等太久|超时|先不聊/);
    } finally {
      await closeServer(server);
    }
  });

  it('3 秒内连点两次只发一次请求', async () => {
    freshStorage();
    let count = 0;
    const { server, base } = await mockServer(async (req, res) => {
      count += 1;
      await readBody(req);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: '好呀。' } }] }));
    });
    try {
      const opts = { base, model: 'test-model', key: KEY, fetchImpl: fetch };
      const a = await chat.askCharacter('qwen', '第一句', { ...opts, now: 10000 });
      const b = await chat.askCharacter('qwen', '第二句', { ...opts, now: 10100 });
      assert.equal(a.ok, true, JSON.stringify(a));
      assert.equal(b.ok, false);
      assert.equal(b.throttled, true);
      assert.equal(count, 1);
    } finally {
      await closeServer(server);
    }
  });

  it('没填密钥（或没填地址）时，用名册里的 quote 作离线回应，不联网', async () => {
    freshStorage();
    let called = 0;
    const fetchImpl = async () => { called += 1; throw new Error('不该联网'); };
    chat.saveSettings({ base: 'https://api.example.com/v1', model: 'demo' });
    chat.clearChatKey();
    const noKey = await chat.askCharacter('kimi', '你好', { fetchImpl, now: 0 });
    assert.equal(noKey.ok, true);
    assert.equal(noKey.offline, true);
    assert.equal(noKey.text, quoteOf('kimi'));
    const noBase = await chat.askCharacter('qwen', '你好', { base: '', key: KEY, fetchImpl, now: 0 });
    assert.equal(noBase.offline, true);
    assert.equal(noBase.text, quoteOf('qwen'));
    assert.equal(called, 0);
  });
});

describe('BYOK：回复按纯文本转义显示', () => {
  it('回复里有 <script> 时，图鉴抽屉渲染出来的是转义后的文字，不会变成标签', () => {
    const s = E.createGame('qwen', 'y2023', 7);
    const raw = '<script>alert(1)</script>';
    assert.ok(chat.cleanReply(raw).text.includes('<script>'));
    const html = archive.render(s, {
      archiveTab: 'characters',
      archiveOpen: 'qwen',
      archiveChat: { qwen: [{ who: 'char', text: raw, emotion: 'neutral' }] },
    });
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), '没有转义成文字');
    assert.ok(!html.includes('<script>alert(1)</script>'), '原样输出了脚本标签');
  });
});

describe('图鉴三个子页', () => {
  it('24 家公司 × 4 个剧本都能渲染角色、美术与授权、对话设置，抽屉在原位展开', () => {
    let n = 0;
    for (const p of PLAYABLE) for (const sc of SCENARIOS) {
      const s = E.createGame(p.id, sc.id, 7);
      resolveAll(s);
      for (const tab of ['characters', 'art', 'chat']) {
        const html = archive.render(s, { archiveTab: tab });
        assert.equal(typeof html, 'string');
        assert.ok(html.trim().length > 0, `${p.id} ${sc.id} ${tab} 是空的`);
        assert.ok(!html.includes('<script>alert'), `${p.id} ${sc.id} ${tab} 有没转义的脚本`);
        n += 1;
      }
      const open = archive.render(s, { archiveTab: 'characters', archiveOpen: 'qwen' });
      assert.ok(open.includes('class="arch-drawer"'), `${p.id} ${sc.id} 抽屉没展开`);
      assert.ok(open.includes('data-chat-send="qwen"'), `${p.id} ${sc.id} 抽屉里没有发送按钮`);
    }
    assert.equal(n, PLAYABLE.length * SCENARIOS.length * 3);
  });
});
