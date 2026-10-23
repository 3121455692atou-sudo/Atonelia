// 对手数据（P1.1 数据提交，规格 D2、D3 及第二批修订）：编号、发布日、tags、org / pusher、修订后的数值与“跟随者不超过同期 SOTA”。
// 只测数据本身；D4 的运行时不变量（familyBest 单调、开局阵容等）在 P1.1 后半的 rivals.test.mjs、sota.test.mjs。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FAMILIES, RELEASES, RAW_RELEASES, setReleases, relId } from '../../src/career/data/rivals.js';
import { RELEASE_DAYS_GEN } from '../../src/career/data/release_days_gen.js';
import { RELEASE_DAYS_OVERRIDES } from '../../src/career/data/release_days_overrides.js';
import { COMPANIES, MODALITIES, DIRECTIONS, TECHS } from '../../src/career/data/core.js';
import { structureForRelease } from '../../src/career/data/model_structure.js';
import { dayInMonth } from '../../src/career/sim/clock.js';
import { matchDays, renderGen, gaps } from '../../scripts/build_release_days.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const W = { llm: { knowledge: .22, code: .22, math: .22, writing: .22, agent: .12 }, image: { aesthetics: .25, adherence: .25, text: .25, realism: .25 }, music: { composition: .25, vocals: .25, lyrics: .25, fidelity: .25 }, speech: { naturalness: .25, cloning: .25, multilingual: .25, expressive: .25 } };
const q = r => Object.entries(W[r.mod]).reduce((a, [k, w]) => a + w * (r.dims[k] || 0), 0);
const by = name => RELEASES.find(r => r.name === name);
const LICENSES = ['LP', 'LR', 'LN'];
const TAGS = new Set(['R', 'S', 'X', 'C', 'E', 'T', ...LICENSES]);

describe('对手数据：编号与发布日（D2）', () => {
  it('每条发布都有唯一的 id、YYYY-MM-DD 的 day（落在 RAW 的月份里）、dayExact、tags 数组', () => {
    const ids = new Set();
    for (const r of RELEASES) {
      assert.ok(!ids.has(r.id), `id 撞了：${r.name}`);
      ids.add(r.id);
      assert.equal(r.id, relId(r.name));
      assert.match(r.day, /^\d{4}-\d{2}-\d{2}$/, r.name);
      assert.equal(r.day.slice(0, 7), r.date, `${r.name} 的 day ${r.day} 不在 ${r.date}`);
      assert.equal(typeof r.dayExact, 'boolean');
      assert.ok(Array.isArray(r.tags), r.name);
    }
    assert.equal(RELEASES.length, RAW_RELEASES.length);
  });

  it('所有 LLM 行、所有开源行、所有 pusher 家族的行都 dayExact；approx 条目放行，但必须写出处', () => {
    const loose = RELEASES.filter(r => (r.mod === 'llm' || r.open || FAMILIES[r.family].pusher) && !r.dayExact);
    for (const r of loose) assert.ok(RELEASE_DAYS_OVERRIDES[r.name]?.approx, `${r.name} 既没有精确日期也没有标 approx`);
    for (const [name, e] of Object.entries(RELEASE_DAYS_OVERRIDES)) {
      assert.ok(e.src && e.src.length > 5, `${name} 没写出处`);
      assert.match(e.day, /^\d{4}-\d{2}-\d{2}$/, name);
      assert.ok(RAW_RELEASES.some(r => r[2] === name), `${name} 对不上任何 RAW 行`);
    }
    // approx 的行就是 D2 清单上的 20 条：原来 11 条里 Muse Spark 1.3 在 timeline 里补出了精确日，留下 10 条；P1.1 数据提交时新增 10 条（sota_report 全部列出）。
    const approx = Object.entries(RELEASE_DAYS_OVERRIDES).filter(([, e]) => e.approx).map(([n]) => n);
    assert.deepEqual(approx.sort(), [
      'Llama 3.1 Sonar Huge 405B Online', 'Sonar Reasoning Pro', 'Mistral Medium 3.1', 'Phi-3-medium', 'Phi-3.5-MoE', 'Mureka V9', 'Sonic 3', 'Sonic 3.5', 'Speech 2.6', 'Bark',
      'Chirp v2', 'abab5.5', '豆包（云雀）', 'RWKV-4 Raven 14B', 'RWKV-7 G1 7B', 'Step 3.5 Flash', 'Step 3.7 Flash', 'Grok 4.3', 'MiniMax-M3', 'Hy3',
    ].sort());
    assert.ok(!RELEASE_DAYS_OVERRIDES['Muse Spark 1.3']?.approx && by('Muse Spark 1.3').dayExact, 'Muse Spark 1.3 已有精确日');
  });

  it('release_days_gen.js 是最新的，LLM / 开源 / pusher 行没有缺口，手写日期都在对的月份里', () => {
    const { gen } = matchDays();
    assert.deepEqual(RELEASE_DAYS_GEN, gen);
    assert.deepEqual(gaps(gen), { missing: [], badMonth: [], unused: [] });
    assert.ok(renderGen(gen).includes("'GPT-4': '2023-03-14'") || Object.keys(gen).length > 150);
  });

  it('规格点名的日期：GPT-3.5、FLUX.2 两款、o1、R1、QwQ-Preview、Muse Spark Open', () => {
    const d = n => by(n).day;
    assert.deepEqual([d('GPT-3.5（ChatGPT）'), d('FLUX.2 [pro]'), d('FLUX.2 [dev]')], ['2022-11-30', '2025-11-25', '2025-11-25']);
    assert.deepEqual([d('o1'), d('DeepSeek-R1'), d('QwQ-32B-Preview'), d('Muse Spark Open'), d('Muse Spark 1.1'), d('DeepSeek-V3.2')], ['2024-12-05', '2025-01-20', '2024-11-28', '2026-10-15', '2026-07-09', '2025-12-01']);
  });

  it('没有日期的行用 dayInMonth 哈希兜底，和 sim/clock.js 的算法一致', () => {
    const keep = RAW_RELEASES;
    try {
      setReleases([['gpt', '2024-03', 'Fallback Test A', 'large', 0, [1, 1, 1, 1, 1, 1], 'budget'], ['suno', '2024-02', 'Fallback Test B', 'mid', 0, [1, 1, 1, 1, 1], 'budget']]);
      for (const r of RELEASES) { assert.equal(r.day, dayInMonth(r.date, r.id)); assert.equal(r.dayExact, false); assert.deepEqual(r.tags, []); }
    } finally { setReleases(keep); }
  });
});

describe('对手数据：tags、org、pusher（D3）', () => {
  it('tags 只用登记的词；开源行恰好一个许可；闭源行没有许可；X 只给闭源', () => {
    for (const r of RELEASES) {
      for (const t of r.tags) assert.ok(TAGS.has(t), `${r.name} 的 tag ${t} 没登记`);
      assert.equal(new Set(r.tags).size, r.tags.length, r.name);
      const lic = r.tags.filter(t => LICENSES.includes(t));
      assert.equal(lic.length, r.open ? 1 : 0, `${r.name}：许可 ${lic}`);
      if (r.tags.includes('X')) assert.ok(!r.open, r.name);
      if (r.mod !== 'llm') for (const t of ['R', 'X', 'C', 'E', 'T']) assert.ok(!r.tags.includes(t), `${r.name} 不是语言模型，不该带 ${t}`);
    }
    assert.deepEqual(RELEASES.filter(r => r.tags.includes('X')).map(r => r.name), ['Muse Wonder Full']);
  });

  it('规格点名的 tags', () => {
    const t = n => by(n).tags;
    assert.deepEqual(t('QwQ-32B-Preview'), ['R', 'S', 'LP']);
    assert.deepEqual(t('gpt-oss-120b'), ['R', 'S', 'E', 'LP']);
    assert.deepEqual(t('Grok 2.5（开放权重）'), ['S', 'LR']);
    assert.deepEqual(t('Qwen3.8-2.4T-A95B'), ['R', 'E', 'T', 'LR']);
    assert.deepEqual(t('Muse Wonder Full'), ['R', 'C', 'X']);
    assert.deepEqual(t('Command A+'), ['R', 'E', 'LP']);
    assert.deepEqual(t('Bark'), ['S', 'LP']);
    assert.deepEqual(t('Qwen-Image-2.1'), ['S', 'LN']);
    assert.deepEqual(t('FLUX.1 [dev]'), ['LN']);
    assert.deepEqual(t('MusicGen'), ['LN']);
    assert.deepEqual(t('Command R+'), ['LN']);
    assert.deepEqual(t('Gemini 1.5 Pro-002'), ['C']);
    assert.deepEqual(RELEASES.filter(r => r.tags.includes('S')).map(r => r.name).sort(), ['Bark', 'DeepSeek-R1-Lite-Preview', 'ERNIE-4.5-300B-A47B', 'Gemini 2.0 Flash Thinking', 'Grok 2.5（开放权重）', 'Grok-1（开放权重）', 'QwQ-32B', 'QwQ-32B-Preview', 'Qwen-Image-2.1', 'Seed-OSS-36B', 'gpt-oss-120b']);
  });

  it('R 标签：第一个推理模型是 o1-preview，第一个开源的是 QwQ-32B-Preview，R1 带 R，V3-0324 不带', () => {
    const rs = RELEASES.filter(r => r.mod === 'llm' && r.tags.includes('R'));
    assert.equal(rs[0].name, 'o1-preview');
    assert.equal(rs.find(r => r.open).name, 'QwQ-32B-Preview');
    for (const n of ['DeepSeek-R1', 'Qwen3-235B-A22B', 'o1', 'o3', 'QwQ-32B']) assert.ok(by(n).tags.includes('R'), n);
    for (const n of ['DeepSeek-V3-0324', 'DeepSeek-V3', 'Claude 3.7 Sonnet', 'GPT-4.5']) assert.ok(!by(n).tags.includes('R'), n);
  });

  it('C / E / T：百万上下文从 Gemini 1.5 Pro 起；第一个开源万亿参数是 Kimi K2；开源行的 E、T 和结构一致', () => {
    const llm = RELEASES.filter(r => r.mod === 'llm');
    assert.equal(llm.find(r => r.tags.includes('C')).name, 'Gemini 1.5 Pro');
    assert.equal(llm.find(r => r.open && r.tags.includes('T')).name, 'Kimi K2');
    for (const r of llm.filter(x => x.open)) {
      const st = structureForRelease('llm', r);
      if (st.source !== 'game-estimate') {   // 结构没公开、只是按量级估的（Grok 2.5）不拿来对 E、T
        assert.equal(r.tags.includes('E'), st.active < st.total, `${r.name}：E 标签和结构 ${st.total}/${st.active} 不一致`);
        assert.equal(r.tags.includes('T'), st.total >= 1000, `${r.name}：T 标签和总参数 ${st.total} 不一致`);
      }
      assert.equal(st.cls, r.cls, `${r.name}：表里是 ${r.cls}，按 ${st.total}B 算是 ${st.cls}`);
    }
  });

  it('org 和 pusher 照规格 D3', () => {
    const orgs = {};
    for (const [f, x] of Object.entries(FAMILIES)) { assert.ok(x.org, f); (orgs[x.org] ||= []).push(f); }
    const multi = Object.fromEntries(Object.entries(orgs).filter(([, v]) => v.length > 1).map(([k, v]) => [k, v.sort()]));
    assert.deepEqual(multi, Object.fromEntries(Object.entries({
      openai: ['gpt', 'image2', 'openai_tts'], anthropic: ['claude', 'fable'], google: ['gemini', 'gemma', 'imagen', 'lyria', 'gemini_tts'], meta: ['llama', 'musicgen'],
      alibaba: ['qwen', 'qwen_image', 'cosyvoice'], bytedance: ['seed', 'seedream', 'seed_tts'], tencent: ['hunyuan', 'hunyuan_image'], minimax: ['minimax', 'minimax_speech'],
      elevenlabs: ['elevenlabs', 'eleven_music'], deepseek: ['deepseek_pro', 'deepseek'],
    }).map(([k, v]) => [k, v.sort()])));
    const pushers = Object.entries(FAMILIES).filter(([, x]) => x.pusher).map(([f]) => f).sort();
    assert.deepEqual(pushers, ['gpt', 'claude', 'fable', 'gemini', 'grok', 'image2', 'midjourney', 'imagen', 'flux', 'seedream', 'ideogram', 'suno', 'udio', 'lyria', 'eleven_music', 'elevenlabs', 'openai_tts', 'minimax_speech', 'seed_tts', 'gemini_tts', 'cartesia'].sort());
  });

  it('COMPANIES 带 org，和第一个家族的 org 一致；Gemini 的家族是 gemini 加 gemma；Anthropic 的两家同 org', () => {
    for (const c of COMPANIES) assert.equal(c.org, FAMILIES[c.families[0]].org, c.id);
    assert.deepEqual(COMPANIES.find(c => c.id === 'gemini').families, ['gemini', 'gemma']);
    assert.equal(COMPANIES.find(c => c.id === 'claude').org, COMPANIES.find(c => c.id === 'fable').org);
  });

  it('agent 维度带 needTech: func_call（读取点由 SOTA 那一步从 from 改读 needTech），这项技术存在', () => {
    assert.equal(MODALITIES.llm.dims.find(d => d.key === 'agent').needTech, 'func_call');
    assert.equal(DIRECTIONS.llm.find(d => d.key === 'agent').needTech, 'func_call');
    assert.ok(TECHS.some(t => t.id === 'func_call' && t.mod === 'llm'));
  });
});

describe('对手数据：修订后的数值（D3 及第二批）', () => {
  it('规格给出的 qOf', () => {
    const expect = { o1: 78.74, 'DeepSeek-R1': 76.92, 'Muse Spark Open': 90.54, 'Muse Wonder Full': 95.68, 'Muse Wonder': 94.68, 'DeepSeek-V3-0324': 75.58, 'DeepSeek-V4-Flash-0731': 91.02, 'DeepSeek-V4-Pro-0813': 91.44,
      'DeepSeek-V4.1-Flash': 91.92, 'Qwen3.8-Max': 92.0, 'GPT-Realtime-2': 63.25, 'Muse Spark 1.1': 91.32, 'Krake': 27.72, 'QwQ-32B': 75.86, 'gpt-oss-120b': 78.48, 'FLUX 3 Image': 92.5, 'Mureka V8': 82.75, 'Mureka V9.5': 84.75, 'Command A+': 79.64 };
    for (const [n, v] of Object.entries(expect)) assert.ok(Math.abs(q(by(n)) - v) < 0.006, `${n}：${q(by(n)).toFixed(2)} ≠ ${v}`);
  });

  it('o1 是 2024-12-31 的 LLM 最强；R1 比 o1 低 1.82；gpt-oss-120b 是大档；Mistral Medium（原型）取代 Mixtral', () => {
    const before = RELEASES.filter(r => r.mod === 'llm' && r.day <= '2024-12-31');
    assert.equal(before.reduce((a, r) => (q(r) > q(a) ? r : a)).name, 'o1');
    assert.ok(q(by('DeepSeek-R1')) < q(by('o1')) - 1);
    assert.equal(by('gpt-oss-120b').cls, 'large');
    assert.ok(q(by('Mistral Medium（原型）')) > q(by('Mixtral 8x7B')));
  });

  it('第二批 B：几条日期和月份的修订', () => {
    assert.deepEqual([by('Sonar Reasoning Pro').date, by('pplx-70b-online').date, by('Phi-3-medium').date, by('RWKV-6 Finch 14B').date, by('FLUX1.1 [pro]').date], ['2025-03', '2023-11', '2024-05', '2024-07', '2024-10']);
  });

  it('D4 第 1 条：四个模态全部行在场时，跟随者都低于同期 SOTA（闭源 1.0、开源 LLM 1.5），违规 0；模态第一条（Bark、Krake 等）跳过', () => {
    const out = execFileSync(process.execPath, [ROOT + 'docs/spec/tools/sota_check.mjs'], { encoding: 'utf8' });
    assert.match(out, /violations 0 /);
    for (const n of ['Krake', 'DALL·E 2', 'Bark', 'ElevenLabs Beta']) assert.match(out, new RegExp(`first-of-modality skipped:[\\s\\S]*${n.replace(/[.·]/g, '.')}`), n);
  });
});
