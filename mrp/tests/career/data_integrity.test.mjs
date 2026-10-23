// 数据完整性：史实库（data/history_facts.js）和角色名册（data/roster.js）。
// 这些断言原来在 v0.5 的 test_personal_events 和 test_roster 里（现已归档到 archive/v0.5/tests/），
// 其余只保护 v0.5 引擎的断言随归档移走；这里只留 career 用得到的数据断言。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HISTORY_FACTS, HISTORY_FACT_BY_ID, HISTORY_SOURCES, HISTORY_SOURCE_BY_ID } from '../../src/career/data/history_facts.js';
import { CHARACTER_ROSTER } from '../../src/career/data/roster.js';
import { histInfo } from '../../src/career/data/history.js';
import { GEN_HISTORY } from '../../src/career/data/history_gen.js';
import { FAMILIES } from '../../src/career/data/rivals.js';
import { COMPANY_BY_ID, OWNER_OF } from '../../src/career/data/core.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CHECKED_AT = '2026-10-19'; // 史实和名册的核对日

describe('史实库', () => {
  it('67 条史实：id 不重复，每条有两个选项、事实、型号名和出处，日期格式正确且不晚于核对日', () => {
    assert.equal(HISTORY_FACTS.length, 67);
    assert.equal(new Set(HISTORY_FACTS.map(f => f.id)).size, 67);
    for (const f of HISTORY_FACTS) {
      assert.ok(f.title && f.fact && f.model, f.id);
      assert.match(f.date, /^\d{4}-\d{2}(-\d{2})?$/, f.id);
      assert.ok(f.date <= CHECKED_AT, `${f.id} 的日期晚于核对日`);
      assert.ok(f.sources.length > 0, `${f.id} 没有出处`);
      assert.equal(f.choices.length, 2, f.id);
      for (const c of f.choices) {
        assert.ok(c.label, f.id);
        for (const [k, v] of Object.entries(c.effects.stats || {})) assert.ok(v > 0 && v <= 8, `${f.id} 的效果 ${k}=${v}`);
        assert.ok((c.effects.cost_kc || 0) >= 0 && (c.effects.cost_kc || 0) <= 10, f.id);
      }
      assert.ok(f.choices.some(c => !c.effects.cost_kc), `${f.id} 至少要有一个不花钱的选项`);
    }
  });

  it('出处：编号不重复，每条史实引用的出处都存在，地址是 https，有出版方', () => {
    assert.equal(new Set(HISTORY_SOURCES.map(s => s.id)).size, HISTORY_SOURCES.length);
    for (const f of HISTORY_FACTS) for (const id of f.sources) assert.ok(HISTORY_SOURCE_BY_ID[id], `${f.id} 引用了不存在的出处 ${id}`);
    for (const s of HISTORY_SOURCES) {
      assert.equal(new URL(s.url).protocol, 'https:', s.id);
      assert.ok(s.publisher && s.title, s.id);
    }
  });

  it('归属：64 条讲给名册角色听，Phi 和 LLaDA 的 3 条是研究线；realFam 都是 FAMILIES 里的家族或 null', () => {
    const roster = new Set(CHARACTER_ROSTER.map(c => c.id));
    const research = HISTORY_FACTS.filter(f => !f.character);
    assert.deepEqual(research.map(f => f.id).sort(), ['personal_llada_masks', 'personal_phi_onefive', 'personal_phi_textbooks']);
    assert.ok(research.every(f => f.realFam === null));
    // 旧版按日期弹的“历史时刻”已删除（E7），64 段个人短剧的文案留作专属事件素材：每条讲给可玩公司角色的史实各有一段。
    assert.equal(HISTORY_FACTS.filter(f => f.character).length, 64, '讲给可玩公司角色的史实 64 条');
    assert.deepEqual(GEN_HISTORY.map(x => x.id).sort(), HISTORY_FACTS.filter(f => f.character).map(f => f.id).sort(), '64 段个人短剧文案一条不少');
    for (const f of HISTORY_FACTS.filter(x => x.character)) {
      assert.ok(roster.has(f.character), `${f.id} 的角色 ${f.character} 不在名册里`);
      assert.ok(COMPANY_BY_ID[OWNER_OF[f.character] || f.character], `${f.id} 的角色不属于任何可玩公司`);
      assert.ok(FAMILIES[f.realFam], `${f.id} 的 realFam ${f.realFam} 不是已知家族`);
      if (f.id !== 'personal_deepseek_r1') assert.equal(f.realFam, f.character, f.id);
    }
  });

  it('DeepSeek-R1 的史实：现实里是 Pro 线（realFam 是 deepseek_pro），型号名 DeepSeek-R1；故事仍由 Flash 角色讲', () => {
    const r1 = HISTORY_FACT_BY_ID.personal_deepseek_r1;
    assert.equal(r1.realFam, 'deepseek_pro');
    assert.equal(r1.model, 'DeepSeek-R1');
    assert.equal(r1.character, 'deepseek');
    const info = histInfo('personal_deepseek_r1', 'llm');
    assert.equal(info.realFam, 'deepseek_pro');
    assert.equal(info.realModel, 'DeepSeek-R1');
    assert.equal(OWNER_OF[info.realFam], OWNER_OF.deepseek, 'Pro 和 Flash 同属一家公司');
  });
});

describe('角色名册', () => {
  it('id 唯一：名册、史实、出处的 id 都不重复', () => {
    assert.equal(new Set(CHARACTER_ROSTER.map(c => c.id)).size, CHARACTER_ROSTER.length);
    assert.equal(new Set(HISTORY_FACTS.map(f => f.id)).size, HISTORY_FACTS.length);
    assert.equal(new Set(HISTORY_SOURCES.map(s => s.id)).size, HISTORY_SOURCES.length);
  });

  it('名册条目数：41 条 = 25 个可育成的模型 + 14 个工具 + 2 个设施（后两类是 NPC）', () => {
    assert.equal(CHARACTER_ROSTER.length, 41);
    const by = cat => CHARACTER_ROSTER.filter(c => c.category === cat);
    assert.equal(by('model').length, 25);
    assert.equal(by('application').length, 14);
    assert.equal(by('infrastructure').length, 2);
    const expected = ['qwen', 'deepseek', 'gemini', 'claude', 'gpt', 'deepseek_pro', 'kimi', 'glm', 'grok', 'seed', 'rwkv', 'ernie', 'mistral', 'minimax', 'perplexity', 'image2',
      'llama', 'hunyuan', 'stepfun', 'novelai', 'midjourney', 'suno', 'elevenlabs', 'fable', 'jev'];
    assert.deepEqual(by('model').map(c => c.id).sort(), expected.sort(), 'DeepSeek 的 Pro 和 Flash、Fable、JEV 各是一条，没有合并');
    for (const c of CHARACTER_ROSTER) assert.ok(c.name && c.label !== undefined && c.quote, c.id);
  });

  it('PNG 哈希：每个立绘文件都存在、是真 PNG，sha256 和 docs/art-manifest.json 登记的一致', () => {
    const manifest = JSON.parse(read('docs/art-manifest.json'));
    const assets = new Map(manifest.assets.map(a => [a.file, a]));
    let n = 0;
    for (const c of CHARACTER_ROSTER) {
      for (const uri of [c.src, ...Object.values(c.sprites || {})]) {
        const rel = uri.replace(/^\.\//, '');
        assert.ok(assets.has(rel), `${rel} 没登记在 art-manifest.json`);
        const bytes = fs.readFileSync(path.join(ROOT, rel));
        assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${rel} 不是 PNG`);
        assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), assets.get(rel).sha256, `${rel} 的哈希对不上`);
        n++;
      }
    }
    assert.ok(n >= 41, '至少每条名册一张图');
  });

  it('授权字段：每条都有作者署名 ZipZipPipe 和 B 站原帖链接；CC BY-NC-SA 4.0 与上善无形的署名说明保留在美术鸣谢里', () => {
    for (const c of CHARACTER_ROSTER) {
      assert.equal(c.credit, 'ZipZipPipe', c.id);
      const u = new URL(c.source_url);
      assert.equal(u.protocol, 'https:', c.id);
      assert.ok(['www.bilibili.com', 'space.bilibili.com'].includes(u.hostname), `${c.id} 的原帖不是 B 站：${u.hostname}`);
    }
    // 名册里只留 credit 和 source_url；授权条款的文字在鸣谢文件里，下面几处要一直在。
    const credits = read('docs/ART_CREDITS.txt');
    assert.match(credits, /CC BY-NC-SA 4\.0/);
    assert.match(credits, /上善无形/);
    assert.match(credits, /未检得统一再授权声明/, '其他角色没有统一授权，这句说明不能丢');
    const notes = JSON.parse(read('docs/art-manifest.json')).license_notes.join('\n');
    assert.match(notes, /CC BY-NC-SA 4\.0/);
    assert.match(notes, /不代表取得商业再授权/);
  });
});
