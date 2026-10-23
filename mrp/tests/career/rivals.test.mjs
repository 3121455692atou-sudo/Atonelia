// 对手数据的不变量（规格 D4，P1.1）：跟随者不超过同期 SOTA、世界最强和家族旗舰按天单调、o1 与 R1、按日可见、推理只看 R 标签、
// 小模型的映射 MMLU、全库没有旧口径的函数名、开源行的量级和结构一致、离红线最近的行。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from '../../src/career/engine.js';
import { COMPANIES, SCENARIOS, weightClass } from '../../src/career/data/core.js';
import { FAMILIES, RELEASES } from '../../src/career/data/rivals.js';
import { BENCH_BY_ID } from '../../src/career/data/benchmarks.js';
import { structureForRelease } from '../../src/career/data/model_structure.js';
import { MILESTONES } from '../../src/career/data/milestones.js';
import { SOTA_HISTORY, visible } from '../../src/career/sim/sota.js';
import { isReasoningRelease } from '../../src/career/sim/milestones.js';
import { scoreFromX } from '../../src/career/sim/model.js';
import { addDays } from '../../src/career/sim/clock.js';
import { followerCheck, SOTA_EXCEPTIONS } from '../../scripts/sota_report.mjs';
import { advance } from '../helpers/career_bot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rel = name => RELEASES.find(r => r.name === name);
const q = r => E.qOf(r.mod, r.dims);
const MODS = ['llm', 'image', 'music', 'speech'];
// 不扮演任何公司的“全行业观察者”。
const observer = (mod, day) => ({ charId: '__observer__', mod, date: day.slice(0, 7), day, company: { company: '观察者', country: 'US', open: false }, models: [], published: {} });
const holderOn = (mod, day) => (SOTA_HISTORY[mod] || []).find(h => h.since <= day && (!h.until || day < h.until)) || null;
function* days(from, to, step = 1) { for (let d = from; d <= to; d = addDays(d, step)) yield d; }

describe('D4 第 1 条：跟随者不超过同期 SOTA', () => {
  it('四个模态按日逐条查：开源和非 pusher 的发布比此前（含同一天的闭源）最强低 1 分以上，开源 LLM 低 1.5 分；违规 0，白名单为空', () => {
    const { violations, skipped } = followerCheck();
    assert.deepEqual(violations.map(v => `${v.mod} ${v.day} ${v.name} ${v.margin.toFixed(2)}`), []);
    assert.deepEqual(SOTA_EXCEPTIONS, []);
    // 各模态第一条没有参照，跳过；跟随者里只有 Krake、Bark 两例，DALL·E 2、ElevenLabs Beta 是 pusher。
    assert.deepEqual(skipped.map(r => r.name).sort(), ['Bark', 'DALL·E 2', 'ElevenLabs Beta', 'Krake']);
    assert.deepEqual(skipped.filter(r => r.open || !FAMILIES[r.family].pusher).map(r => r.name).sort(), ['Bark', 'Krake']);
  });
  it('同一天的闭源发布对所有跟随者都算在前（不只是开源跟随者）：Yi-Large 和 GPT-4o 同一天，余量按 GPT-4o 算是 6.54', () => {
    const y = rel('Yi-Large');
    assert.deepEqual([y.day, y.open, rel('GPT-4o').day, rel('GPT-4o').open], ['2024-05-13', false, '2024-05-13', false]);
    const row = followerCheck().margins.find(x => x.name === 'Yi-Large');
    assert.equal(row.sota, q(rel('GPT-4o')));
    assert.equal(row.margin.toFixed(2), '6.54');
  });
});

describe('D4 第 2 条：世界最强和家族旗舰按天单调不减', () => {
  it('观察者和几家 pusher 公司的视角：worldSota 每天不降', () => {
    const states = [observer('llm', '2022-01-01'), E.createGame('gpt', 'y2023', 1), E.createGame('claude', 'y2024', 1), E.createGame('image2', 'y2023', 1)];
    for (const s of states) {
      let last = -Infinity;
      for (const d of days('2022-04-01', '2026-10-31')) {
        const w = E.worldSota(s, { day: d });
        if (!w) continue;
        assert.ok(w.q >= last - 1e-12, `${s.charId} ${d}：${w.q} < ${last}`);
        last = w.q;
      }
    }
  });
  it('每个家族的 familyBest 每天不降（按月底和发布日抽查）', () => {
    for (const f of Object.keys(FAMILIES)) {
      let last = -Infinity;
      const checkDays = [...new Set([...RELEASES.filter(r => r.family === f).map(r => r.day), ...[...days('2022-01-31', '2026-10-31', 30)]])].sort();
      for (const d of checkDays) {
        const r = E.familyBest(null, f, d);
        if (!r) continue;
        assert.ok(q(r) >= last, `${f} ${d}`);
        last = q(r);
      }
    }
  });
});

describe('D4 第 3、4 条：o1 与 R1、按日可见、开局阵容', () => {
  it('2024-12-31 的 SOTA 持有者是 o1；R1 比 o1 低 1 分以上', () => {
    assert.equal(holderOn('llm', '2024-12-31').name, 'o1');
    assert.ok(q(rel('DeepSeek-R1')) < q(rel('o1')) - 1);
    assert.equal(rel('o1').day, '2024-12-05');
  });
  it('DeepSeek y2025 开局在线的是 DeepSeek-V3（R1 在训）；Llama y2025 在线的是 3.1 405B', () => {
    const ds = E.createGame('deepseek', 'y2025', 1);
    assert.equal(E.liveModel(ds).name, 'DeepSeek-V3');
    assert.equal(E.workingModel(ds).hint?.realName, 'DeepSeek-R1');
    assert.equal(E.liveModel(E.createGame('llama', 'y2025', 1)).name, 'Llama 3.1 405B');
  });
  it('同分的家族旗舰取较晚的一款（构造夹具：一份能力重新放出，Grok-1 开放权重就是这种）', () => {
    const a = rel('Grok-1'), b = rel('Grok-1（开放权重）');
    assert.deepEqual(a.dims, b.dims, '两行能力完全一样');
    assert.ok(a.day < b.day);
    assert.equal(E.familyBest(null, 'grok', b.day).name, 'Grok-1（开放权重）');
    assert.equal(E.familyBest(null, 'grok', addDays(b.day, -1)).name, 'Grok-1');
  });
  it('2025-01-19 看不到 R1；不是 DeepSeek 的开局在 01-20 才看到，新闻也是那天', () => {
    const r1 = rel('DeepSeek-R1');
    assert.equal(r1.day, '2025-01-20');
    const s = E.createGame('qwen', 'y2025', 1);
    assert.ok(!visible(s, r1, '2025-01-19'));
    assert.ok(visible(s, r1, '2025-01-20'));
    assert.notEqual(E.worldSota(s, { day: '2025-01-19' }).rel.name, 'DeepSeek-R1');
    advance(s, 18);
    assert.equal(s.day, '2025-01-19');
    assert.ok(!s.news.some(n => n.title.includes('DeepSeek-R1')) && s.world.adj[r1.id] === undefined, '01-19 还没有 R1 的消息');
    advance(s, 1);
    assert.equal(s.day, '2025-01-20');
    assert.ok(s.news.some(n => n.day === '2025-01-20' && n.title.includes('发布 DeepSeek-R1')));
    assert.ok(s.world.adj[r1.id] !== undefined, '变为可见那天冻结了钳制量');
  });
});

describe('D4 第 5 条：只有带 R 标签的发布才算推理', () => {
  it('推理判定只看 R 标签', () => {
    for (const r of RELEASES) assert.equal(isReasoningRelease(r), r.tags.includes('R'), r.name);
  });
  it('D3 第二批 C 表补上的 R：HY 2.0 Think、MiniMax-M3.1-Flash 是 R,E，Muse Spark 1.2、1.3 是 R；名字里带 Think、Thinking、Reasoning 的、Muse Spark 和 Muse Wonder 全系都带 R', () => {
    const tags = n => rel(n).tags.join(',');
    assert.deepEqual(['Hunyuan HY 2.0 Think', 'MiniMax-M3.1-Flash', 'Muse Spark 1.2', 'Muse Spark 1.3'].map(tags), ['R,E', 'R,E', 'R', 'R']);
    for (const r of RELEASES.filter(x => x.mod === 'llm' && /think|reasoning|^muse (spark|wonder)/i.test(x.name))) assert.ok(isReasoningRelease(r), r.name);
  });
  it('没有玩家干预：推理模型第一款是 o1-preview，开源推理第一款是 QwQ-32B-Preview，开源推理追近前沿（差 ≤ 4）是 DeepSeek-R1；玩 DeepSeek 时是 Qwen3-235B-A22B（差 3.86）', () => {
    const llm = RELEASES.filter(r => r.mod === 'llm').sort((a, b) => a.day.localeCompare(b.day) || q(b) - q(a));
    assert.equal(llm.find(r => isReasoningRelease(r)).name, 'o1-preview');
    assert.equal(llm.find(r => isReasoningRelease(r) && r.open).name, 'QwQ-32B-Preview');
    const frontier = s => llm.find(r => isReasoningRelease(r) && r.open && !E.isMine(s, r.family) && E.qOf('llm', E.relDims(s, r)) >= E.worldSota(s, { day: r.day }).q - 4);
    assert.equal(frontier(observer('llm', '2022-01-01')).name, 'DeepSeek-R1');
    const ds = E.createGame('deepseek', 'y2024', 1);
    const qwen = frontier(ds);
    assert.equal(qwen.name, 'Qwen3-235B-A22B');
    assert.equal((E.worldSota(ds, { day: qwen.day }).q - q(qwen)).toFixed(2), '3.86');
    // 里程碑账本（开局前已经发生的，记在做到的那家名下）。
    const s = E.createGame('kimi', 'y2026', 1);
    assert.equal(s.ms.ms_reasoning.model, 'o1-preview');
    assert.equal(s.ms.ms_open_reasoning.model, 'QwQ-32B-Preview');
    assert.ok(MILESTONES.some(m => m.id === 'ms_reasoning' && m.rival?.reasoning));
  });
});

describe('D4 第 6 条：小模型的映射 MMLU 和真实值相差不超过 ±5', () => {
  it('ChatGLM2-6B、ChatGLM3-6B、Qwen-7B、Baichuan2-13B、LLaMA 65B', () => {
    const b = BENCH_BY_ID.mmlu;
    const mapped = r => scoreFromX(b, Object.entries(b.w).reduce((a, [k, w]) => a + w * (r.dims[k] || 0), 0));
    const real = { 'ChatGLM2-6B': 47.9, 'ChatGLM3-6B': 61.4, 'Qwen-7B': 58.2, 'Baichuan2-13B': 59.2, 'LLaMA 65B': 63.4 };
    for (const [name, v] of Object.entries(real)) assert.ok(Math.abs(mapped(rel(name)) - v) <= 5, `${name}：映射 ${mapped(rel(name))}，真实 ${v}`);
  });
});

describe('D4 第 7 条：全库搜不到旧口径的函数名', () => {
  it('src、tests、scripts、docs/spec/tools 里都没有', () => {
    const names = ['overall' + 'Q', 'latest' + 'Release', 'on' + 'Sale', 'start' + 'Release', 'top' + 'Rival', 'rival' + 'Qs'];
    const re = new RegExp(`\\b(${names.join('|')})\\b`);
    const bad = [];
    const walk = dir => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'fixtures') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(m?js|html)$/.test(e.name) && re.test(fs.readFileSync(p, 'utf8'))) bad.push(path.relative(ROOT, p));
      }
    };
    for (const d of ['src', 'tests', 'scripts', 'docs/spec/tools']) walk(path.join(ROOT, d));
    for (const f of ['index.html']) if (re.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))) bad.push(f);
    assert.deepEqual(bad, []);
  });
});

describe('D4 第 8 条：开源 LLM 行的量级和结构推算一致', () => {
  it('开源行的 cls 等于按 structureForRelease 总参数算出的量级；只有参数不公开的闭源行允许前沿', () => {
    for (const r of RELEASES.filter(x => x.mod === 'llm')) {
      const st = structureForRelease('llm', r);
      if (r.open) assert.equal(r.cls, weightClass(st.total), `${r.name}：${st.total}B`);
      if (r.cls === 'frontier') assert.ok(!r.open, `${r.name} 是开源却标前沿`);
    }
  });
});

describe('D4 第 9 条：离红线最近的行', () => {
  it('sota_report 列出离红线 ≤ 0.3 分的行：Muse Wonder Full 0.22、Qwen3-235B-2507 0.24，Qwen-Image、Qwen-Image-2.0、Stable Audio、Mureka V8、Mureka V9.5 各 0.25', () => {
    const near = followerCheck().near.map(x => `${x.name} ${x.margin.toFixed(2)}`);
    assert.deepEqual(near.sort(), ['Muse Wonder Full 0.22', 'Mureka V8 0.25', 'Mureka V9.5 0.25', 'Qwen-Image 0.25', 'Qwen-Image-2.0 0.25', 'Qwen3-235B-A22B-2507 0.24', 'Stable Audio 0.25'].sort());
  });
});

describe('D1：旗舰与“最强”只有一种口径', () => {
  it('旗舰看综合分，不看参数和先后：Kimi K3 参数最大但不如 GLM-5.3；Llama 2025-01 最新的是 3.3 70B，旗舰是 3.1 405B', () => {
    assert.ok(q(rel('Kimi K3')) < q(rel('GLM-5.3')));
    assert.equal(E.familyBest(null, 'llama', '2025-01-31').name, 'Llama 3.1 405B');
    assert.equal(E.familyBest(null, 'gpt', '2025-03-31').name, 'o1');
    assert.equal(E.familyBest(null, 'deepseek_pro', '2025-04-30').name, 'DeepSeek-R1');
  });
  it('orgBest 把同 org 的家族合起来：Anthropic 是 Claude 加 Fable，深度求索是 Pro 加 Flash', () => {
    assert.equal(E.orgBest(null, 'anthropic', 'llm', '2026-06-30').family, 'fable');
    assert.equal(E.orgBest(null, 'deepseek', 'llm', '2026-10-21').name, 'DeepSeek-V4.1-Flash-1017');
  });
  it('闭源 API 老师排除带 X 标签的行：Muse Wonder Full 只给订阅产品', () => {
    assert.equal(E.familyBest(null, 'llama', '2026-10-20').name, 'Muse Wonder Full');
    assert.equal(E.familyBest(null, 'llama', '2026-10-20', { open: false, api: true }).name, 'Muse Wonder');
  });
  it('rivalStandings 每个对手 org 一行、按综合分降序；worldRank 是 1 + 比它强的家数', () => {
    const s = E.createGame('qwen', 'y2026', 1);
    const st = E.rivalStandings(s);
    assert.ok(!st.some(x => x.org === 'alibaba'));
    assert.equal(new Set(st.map(x => x.org)).size, st.length);
    assert.ok(st.every((x, i) => !i || x.q <= st[i - 1].q));
    assert.equal(E.worldRank(s, st[2].q - 0.01), 4);
    assert.equal(E.worldRank(s, 999), 1);
  });
});

describe('开局阵容的开闭和 B6 表一致（b6.mjs 同口径；START_STANCE 本身的测试归 P1.3）', () => {
  it('24 × 4 开局在线旗舰的开闭 = 开局路线的 flagshipOpen；mistral y2024 是 open_family', () => {
    const FO = { closed: false, open_family: false, delayed: false, open_restricted: true, open: true };
    const B6 = { gpt: 'closed closed closed open_family', claude: 'closed closed closed closed', fable: 'closed closed closed closed', image2: 'closed closed closed closed',
      gemini: 'closed closed open_family open_family', llama: 'open_restricted open_restricted open_restricted open_restricted', grok: 'closed closed delayed delayed',
      mistral: 'open open_family open_restricted open', deepseek: 'open_restricted open_restricted open_restricted open', qwen: 'closed open_restricted open_restricted open_family',
      kimi: 'closed closed closed open', glm: 'open_family open_restricted open_family open', minimax: 'closed closed closed open', hunyuan: 'closed closed open_restricted open_family',
      stepfun: 'closed closed closed open', seed: 'closed closed closed open_family', ernie: 'closed closed closed delayed', rwkv: 'open open open open', perplexity: 'closed closed closed open_family',
      novelai: 'closed closed closed closed', jev: 'closed closed closed closed', midjourney: 'closed closed closed closed', suno: 'closed closed closed closed', elevenlabs: 'closed closed closed closed' };
    const bad = [];
    for (const c of COMPANIES) SCENARIOS.forEach((sc, i) => {
      const live = E.liveModel(E.createGame(c.id, sc.id, 1));
      const stance = B6[c.id].split(' ')[i];
      if (live && live.open !== FO[stance]) bad.push(`${c.id} ${sc.id} ${live.name} ${live.open ? '开源' : '闭源'} ${stance}`);
    });
    assert.deepEqual(bad, []);
    assert.equal(B6.mistral.split(' ')[1], 'open_family');
  });
});

describe('四个模态全部行在场时，标签链和“截至当天最强”一致', () => {
  it('每个模态的持有者都是当时最强的一款（差不到 EPS 的不换手除外）', () => {
    for (const mod of MODS) for (const h of SOTA_HISTORY[mod]) {
      const best = Math.max(...RELEASES.filter(r => r.mod === mod && r.day <= h.since).map(q));
      assert.ok(h.q >= best - 0.1 - 1e-9, `${mod} ${h.since} ${h.name} ${h.q} < ${best}`);
    }
  });
});
