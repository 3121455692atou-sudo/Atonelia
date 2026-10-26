// 存档夹具：tests/fixtures/saves/ 里是 6 份结构版本 v3 的旧存档（scripts/make_fixtures.mjs 用 v3 代码生成，不再重生成）。
// 每份旧档明确拒绝；对应公司新局连续推进120天不抛错，再验证当前存档精确往返。
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
  test(`旧夹具 ${name} 明确不支持；相同公司新局可推进120天并同版往返`, () => {
    E.setProvider();
    const json=fs.readFileSync(path.join(DIR,`${name}.json`),'utf8'),raw=JSON.parse(json);feature(raw);
    assert.equal(raw.v,3);assert.equal(raw.charId,company);assert.equal(raw.scenario,scenario);
    const before=JSON.stringify(raw),out=E.migrateGame(raw);assert.equal(out.ok,false);assert.match(out.reason,/请新开一局/);assert.equal(JSON.stringify(raw),before);
    const s=E.createGame(company,scenario,1),day0=s.day;advance(s,120);
    assert.deepEqual(badNumbers(s),[]);assert.ok(s.status!=='playing'||daysBetween(day0,s.day)>=120);
    const current=E.migrateGame(s);assert.equal(current.ok,true,current.reason);assert.equal(JSON.stringify(current.s),JSON.stringify(s));
  });
}
