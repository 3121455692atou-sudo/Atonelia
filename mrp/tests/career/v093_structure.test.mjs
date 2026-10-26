// v0.9.3 合并 M3：模型结构统一解析（审查 B1），开局继承使用 data/model_structure.js；旧档不再迁移。
// 前两条迁自外部 v0.9.2 改动包：test_rank_integrity.mjs 的“Mixtral 不再把单个专家当总参数”、test_scaling_balance.mjs 的“开局能力有限且非负”
// （去掉了“上限不低于已学能力”：开局继承模型的知识上限比已学能力低 1，是审查 C1 的知识余量问题，留给 D6）。
// 其余按审查 B1 的先修（G1-5）、G2-7 点名的结构和 2026-10-21 决定第 3 项（前沿单列、大档 >100B）补写。
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { loadSave, asOldNaming } from '../helpers/career_util.mjs';
import { COMPANIES, SCENARIOS, dimKeys, weightClass } from '../../src/career/data/core.js';
import { RELEASES } from '../../src/career/data/rivals.js';
import { deployDays } from '../../src/career/data/supply.js';
import { structureForRelease } from '../../src/career/data/model_structure.js';
import { resolveAll } from '../helpers/career_bot.mjs';

const clone = v => JSON.parse(JSON.stringify(v));
const byName = name => RELEASES.find(r => r.name === name);
const shape = st => [st.total, st.active, st.arch, st.cls];
// sim/ 下所有的 .js（含子目录）。
const simFiles = (dir = fileURLToPath(new URL('../../src/career/sim/', import.meta.url))) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? simFiles(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []));
const fresh = (char, scenario, seed = 7) => { const s = E.createGame(char, scenario, seed); resolveAll(s); return s; };
const mineIn = (s, cls) => E.leaderboard(s, 'mmlu', { cls }).rows.find(r => r.mine) || null;
// 把新开的一局改回 v0.9 存档的样子：没有结构出处，继承模型的结构、量级和已公布成绩按 v0.9 的读法写。
// v0.9 的成绩只记在 s.published 里，不带 modelId，模型身上也没有各自的成绩（M4 才有）。结构版本是 v3。
function asV09(s, fix = () => ({}), cls = null) {
  const old = asOldNaming(clone(s));
  old.v = 3;
  for (const m of old.models) { delete m.structureSource; delete m.benchmarks; Object.assign(m, fix(m)); }
  for (const run of Object.values(old.published)) delete run.modelId;
  if (cls) for (const run of Object.values(old.published)) run.cls = cls;
  return clone(old);
}

describe('统一结构解析', () => {
  it('真实开局中的 Mixtral 不再把单个专家 7B 当总参数；A22B 按激活参数算；284B 总参的 V4-Flash 预览不因激活 13B 归小', () => {
    // 2024 年开局的在线模型从 Mixtral 8x7B 变成同月更强的 Mistral Medium（原型，D3 第二批）；Mixtral 的结构直接从表里解析。
    assert.equal(E.liveModel(E.createGame('mistral', 'y2024', 23)).name, 'Mistral Medium（原型）');
    assert.deepEqual(shape(structureForRelease('llm', byName('Mixtral 8x7B'))), [46.7, 12.9, 'moe', 'mid']);
    assert.deepEqual(shape(structureForRelease('llm', byName('Qwen3-235B-A22B'))), [235, 22, 'moe', 'large']);
    assert.deepEqual(shape(structureForRelease('llm', byName('DeepSeek-V4-Flash（预览）'))), [284, 13, 'moe', 'large']);
  });

  it('所有正常开局的已学能力有限且在 0–99、上限有限；2023 年在训模型的 Agent 不再是 −3', () => {
    for (const c of COMPANIES) for (const sc of SCENARIOS) {
      const s = E.createGame(c.id, sc.id, 71);
      for (const m of s.models) {
        const caps = E.computeCaps(s, m);
        for (const k of dimKeys(m.mod)) {
          assert.ok(Number.isFinite(m.dims[k]) && m.dims[k] >= 0 && m.dims[k] <= 99, `${c.id}/${sc.id}/${m.name}/${k}: ${m.dims[k]}`);
          assert.ok(Number.isFinite(caps[k]) && caps[k] >= 0 && caps[k] <= 99, `${c.id}/${sc.id}/${m.name}/${k}: 上限 ${caps[k]}`);
        }
      }
    }
    // 开局阵容按日、按 org（规格 D2，附录表 13）：RWKV 2023 开局没有在训模型，NovelAI 在线的是 Krake、窗口里没有更强的下一代，这两家不再列。
    for (const id of ['glm', 'ernie', 'llama']) assert.equal(E.workingModel(E.createGame(id, 'y2023', 1)).dims.agent, 0, id);
  });

  it('千问 2025 在训的 Qwen3-235B-A22B 按 22B 激活部署：灰度从 14 天缩到 5 天', () => {
    // 开局窗口里多了 QwQ-32B（2025-03），在训的不再是 Qwen3-235B-A22B（开局阵容改按日、按 orgBest 是 P1.1 后半的事），所以直接按这一行的结构测。
    const w = structureForRelease('llm', byName('Qwen3-235B-A22B'));
    assert.deepEqual([w.total, w.active, w.arch], [235, 22, 'moe']);
    assert.equal(deployDays(w), 5);
  });

  it('RWKV 各剧本开局的模型都是循环架构，不再当稠密', () => {
    for (const sc of SCENARIOS) for (const m of E.createGame('rwkv', sc.id, 1).models) assert.equal(m.arch, 'rnn', `${sc.id} ${m.name}`);
  });

  it('审查点名的开源型号按公开结构：DeepSeek-V2 236B/21B、Mistral Large 2 是 123B 稠密、Phi-4 是 14B 等', () => {
    const expect = {
      'DeepSeek-V2': [236, 21, 'moe', 'large'], 'DeepSeek-V2.5': [236, 21, 'moe', 'large'], 'DeepSeek-V2-Lite': [15.7, 2.4, 'moe', 'mid'],
      'Mistral Large 2': [123, 123, 'dense', 'large'], 'Command R+': [104, 104, 'dense', 'large'],
      'Hunyuan-Large': [389, 52, 'moe', 'large'], 'MiniMax-Text-01': [456, 45.9, 'moe', 'large'], 'MiniMax-M1': [456, 45.9, 'moe', 'large'],
      'Kimi K2': [1000, 32, 'moe', 'large'], 'GLM-4.5': [355, 32, 'moe', 'large'],
      'Phi-2': [2.7, 2.7, 'dense', 'small'], 'Phi-3-medium': [14, 14, 'dense', 'small'], 'Phi-4': [14, 14, 'dense', 'small'],
    };
    for (const [name, want] of Object.entries(expect)) {
      const st = structureForRelease('llm', byName(name));
      assert.deepEqual(shape(st), want, name);
      assert.equal(st.source, 'catalog', name);
    }
    // 开局时用到的几处：Mistral 2025 的在线旗舰、DeepSeek 2025 在训的 R1（按日开局以后，2024 的窗口里没有 V2）、MiniMax 2025 在训的和混元 2025 在线的旗舰。
    assert.deepEqual([E.liveModel(E.createGame('mistral', 'y2025', 1))].map(m => [m.total, m.active, m.arch])[0], [123, 123, 'dense']);
    assert.deepEqual([E.workingModel(E.createGame('deepseek', 'y2025', 1))].map(m => [m.hint?.realName, m.total, m.active])[0], ['DeepSeek-R1', 671, 37]);
    assert.equal(E.workingModel(E.createGame('minimax', 'y2025', 1)).total, 456);   // MiniMax-Text-01 是 01-14 发布的，按日开局时是在训模型
    assert.equal(E.liveModel(E.createGame('hunyuan', 'y2025', 1)).total, 389);
  });

  it('前沿闭源单列一档：76 款参数不公开的闭源旗舰都还是前沿，开源行的量级和结构推算一致', () => {
    let frontier = 0;
    for (const r of RELEASES.filter(x => x.mod === 'llm')) {
      const st = structureForRelease('llm', r);
      if (r.cls === 'frontier') { assert.ok(!r.open, `${r.name} 是开源却标前沿`); assert.equal(st.cls, 'frontier', r.name); frontier++; }
      else assert.equal(st.cls, r.cls, `${r.name}：表里是 ${r.cls}，按 ${st.total}B 算是 ${st.cls}`);
    }
    assert.equal(frontier, 76);   // 原 69 款，加 D3 新增的 7 款闭源前沿行（Gemini 2.0 Flash Thinking、Gemini 1.5 Pro-002、Muse Spark 1.2/1.3、Muse Wonder 两款、Qwen3.8-Max-0902）
  });

  it('大档下限是 >100B：100B 还是中，104B 的 Command R+ 是大；gpt-oss-120b 按 117B/5.1B MoE 归大，不按名字读成 120B 稠密', () => {
    assert.deepEqual([weightClass(15), weightClass(15.7), weightClass(100), weightClass(104)], ['small', 'mid', 'mid', 'large']);
    const oss = structureForRelease('llm', { family: 'gpt', date: '2025-08', name: 'gpt-oss-120b', cls: 'large', open: 1 });
    assert.deepEqual(shape(oss), [116.8, 5.1, 'moe', 'large']);
  });

  it('继承前沿闭源旗舰的玩家模型也在前沿档：GPT 2023 的成绩上前沿榜，不进“大”榜', () => {
    const s = E.createGame('gpt', 'y2023', 1);
    for (const m of s.models) assert.equal(E.clsOf(m), 'frontier', m.name);
    assert.ok(Object.values(s.published).every(r => r.cls === 'frontier'));
    assert.ok(mineIn(s, 'frontier'));
    assert.equal(mineIn(s, 'large'), null);
    // 自己从零练的底座仍按总参数分档（例如 1600B 是大）。
    assert.equal(E.clsOf({ mod: 'llm', total: 1600, cls: 'large' }), 'large');
  });

  it('结构只在 data/model_structure.js 解析一次；开局模型都记了结构出处', () => {
    // game.js 拆分后，开局继承分在 sim/ 的几个文件里：整个 sim/ 都不该有自己的一份。
    for (const f of simFiles()) {
      const src = fs.readFileSync(f, 'utf8');
      assert.ok(!src.includes('KNOWN_STRUCTURE') && !/B-A\(/.test(src), `${path.basename(f)} 里不该再有自己的一份结构表或型号名正则`);
    }
    for (const c of COMPANIES) for (const sc of SCENARIOS) for (const m of E.createGame(c.id, sc.id, 1).models)
      assert.ok(['catalog', 'model-name', 'game-estimate'].includes(m.structureSource), `${c.id}/${sc.id}/${m.name}: ${m.structureSource}`);
  });
});

describe('结构存档边界：旧版拒绝，当前结构原样保留', () => {
  const rejectedUnchanged = old => {
    const before = clone(old), result = E.migrateGame(old);
    assert.equal(result.ok, false);
    assert.match(result.reason, /不支持旧版或未知存档/);
    assert.deepEqual(old, before, '旧档结构、量级及成绩不能被重算');
  };

  it('v0.9 Mistral 小型结构旧档拒绝；当前 Mixtral 是 46.7B/12.9B MoE 中型', () => {
    const s = fresh('mistral', 'y2024');
    const old = asV09(s, m => (m.name === 'Mixtral 8x7B' ? { total: 7, active: 7, arch: 'dense', cls: 'small' } : {}), 'small');
    rejectedUnchanged(old);
    assert.deepEqual(shape(structureForRelease('llm', byName('Mixtral 8x7B'))), [46.7, 12.9, 'moe', 'mid']);
    const current = loadSave(clone(s));
    assert.deepEqual(clone(current), clone(s));
    assert.equal(mineIn(current, 'small'), null);
    assert.equal(mineIn(current, 'mid')?.rank, mineIn(s, 'mid')?.rank);
    assert.ok(E.validateGame(current));
  });

  it('v0.9 GPT 大型量级旧档拒绝；当前继承模型和成绩始终是前沿', () => {
    const s = fresh('gpt', 'y2023');
    rejectedUnchanged(asV09(s, () => ({ cls: 'large' }), 'large'));
    const current = loadSave(clone(s));
    for (const m of current.models) assert.equal(E.clsOf(m), 'frontier', m.name);
    assert.ok(Object.values(current.published).every(r => r.cls === 'frontier'));
    assert.deepEqual(clone(current), clone(s));
    assert.deepEqual(clone(loadSave(clone(current))), clone(current));
  });

  it('旧版负能力和错误架构不修补；新局能力、RWKV 架构与 A22B 结构正确', () => {
    const glm = E.createGame('glm', 'y2023', 1);
    rejectedUnchanged(asV09(glm, m => ({ dims: { ...m.dims, agent: -3 } })));
    assert.equal(E.workingModel(glm).dims.agent, 0);
    const rwkv = fresh('rwkv', 'y2024');
    rejectedUnchanged(asV09(rwkv, () => ({ arch: 'dense' })));
    assert.ok(rwkv.models.every(m => m.arch === 'rnn'));
    const qwen = fresh('qwen', 'y2025');
    rejectedUnchanged(asV09(qwen, () => ({ total: 235, active: 235, arch: 'dense' })));
    const structure = structureForRelease('llm', byName('Qwen3-235B-A22B'));
    assert.deepEqual([structure.total, structure.active, structure.arch], [235, 22, 'moe']);
    for (const current of [glm, rwkv, qwen]) assert.deepEqual(clone(loadSave(clone(current))), clone(current));
  });

  it('同名自研模型旧档仍拒绝；当前自研文心 5.0 保留玩家结构与成绩量级', () => {
    const s = fresh('ernie', 'y2025');
    const own = { ...clone(E.liveModel(s)), id: 'own50', name: '文心 5.0', gen: 5, hist: false, total: 70, active: 70, arch: 'dense', cls: 'mid', stage: 'released' };
    delete own.lineage; delete own.realName; delete own.structureSource;
    s.models.push(own);
    s.published.mmlu = { ...s.published.mmlu, model: '文心 5.0', modelId: own.id, cls: 'mid' };
    rejectedUnchanged(asV09(s));
    const current = loadSave(clone(s));
    const m = current.models.find(x => x.id === 'own50');
    assert.deepEqual([m.total, m.active, m.arch, E.clsOf(m), m.structureSource], [70, 70, 'dense', 'mid', undefined]);
    assert.equal(current.published.mmlu.cls, 'mid');
    assert.deepEqual(clone(current), clone(s));
  });
});
