// 存档夹具：tests/fixtures/saves/ 里是 6 份结构版本 v3 的旧存档（scripts/make_fixtures.mjs 用 v3 代码生成，不再重生成）。
// 每份都要：迁移成功、通过检查，之后连续推进 120 天不抛错、状态里没有非有限数、推进后的存档还能再读回。
// 另外检查每份夹具“名副其实”（比如“选过开源”的那份 s.company.open 真是 true），防止以后不小心换成别的存档。
// 读档那一步集中在 loadSave：P0.3 之后 migrateGame 返回 { ok, s, notes }，P0.4 之后读档走 safeLoadState，到时只改这里。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from '../../src/career/engine.js';
import { daysBetween } from '../../src/career/sim/clock.js';
import { advance } from '../helpers/career_bot.mjs';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/saves');

function loadSave(json) {
  const r = E.migrateGame(JSON.parse(json));
  const s = r && typeof r === 'object' && 'ok' in r ? (r.ok ? r.s : null) : r;
  return s && (typeof E.validateGame !== 'function' || E.validateGame(s)) ? s : null;
}
function badNumbers(x, at = 's', seen = new WeakSet(), out = []) {
  if (typeof x === 'number') { if (!Number.isFinite(x)) out.push(at); } else if (x && typeof x === 'object' && !seen.has(x)) {
    seen.add(x);
    for (const [k, v] of Object.entries(x)) { badNumbers(v, `${at}.${k}`, seen, out); if (out.length >= 5) break; }
  }
  return out;
}

// 文件名（不含 .json）、公司、剧本、这份夹具该有的特征（拿原始存档 JSON 来看）。
const FIXTURES = [
  ['gpt_y2023_open', 'gpt', 'y2023', raw => { assert.equal(raw.company.open, true, '选过开源：s.company.open 为 true'); }],
  ['deepseek_y2025_mid', 'deepseek', 'y2025', raw => { assert.ok(raw.project && raw.orders.length > 0, '中局：有在练的项目和在途订单'); }],
  ['history_queue_claude', 'claude', 'y2024', raw => { assert.ok(raw.queue.some(q => q.kind === 'history'), '队列里有 history 项'); }],
  ['teachercap_rwkv', 'rwkv', 'y2023', raw => { assert.ok(Object.keys(raw.data.teacherCap).length > 0, '带 teacherCap'); }],
  ['kimi_y2026', 'kimi', 'y2026', raw => { assert.ok(raw.day >= '2026-05' && raw.status === 'playing', '2026 年中局，还在打'); }],
  ['listed_glm_y2026', 'glm', 'y2026', raw => { assert.ok(raw.capital.listed?.ticker, '已上市：s.capital.listed 有值'); }],
];

test('夹具目录里恰好是这 6 份', () => {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && !f.startsWith('._')).sort();
  assert.deepEqual(files, FIXTURES.map(f => `${f[0]}.json`).sort());
});

for (const [name, company, scenario, feature] of FIXTURES) {
  test(`夹具 ${name}：迁移成功，之后推进 120 天不抛错`, () => {
    const json = fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8');
    const raw = JSON.parse(json);
    assert.equal(raw.v, 3, '夹具是 v3 存档');
    assert.equal(raw.charId, company);
    assert.equal(raw.scenario, scenario);
    feature(raw);

    const s = loadSave(json);
    assert.ok(s, '迁移成功并通过检查');
    assert.deepEqual(badNumbers(s), [], '读档后没有非有限数');
    const day0 = s.day;
    advance(s, 120);
    assert.deepEqual(badNumbers(s), [], '推进后没有非有限数');
    assert.ok(s.status !== 'playing' || daysBetween(day0, s.day) >= 120, `时间推进满 120 天（${day0} → ${s.day}）`);
    assert.ok(loadSave(JSON.stringify(s)), '推进后的存档还能再读回');
  });
}
