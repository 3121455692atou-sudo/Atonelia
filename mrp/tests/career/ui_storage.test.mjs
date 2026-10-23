// 读档入口 safeLoadState（P0.4，规格 E9）：纯函数，什么输入都不抛错，读不了就说明原因；
// readSaved 在浏览器存储上的包装：第一次迁移前把原文备份到 mrp.sim.v2.bak，旧版存档键只提示一次。
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import { clone } from '../helpers/career_util.mjs';
import {
  safeLoadState, readSaved, legacyKeysFound, markLegacySeen, SAVE_KEY, BAK_KEY, LEGACY_KEYS, LEGACY_SEEN_KEY,
} from '../../src/career/ui/storage.js';

const FIXTURES = new URL('../fixtures/saves/', import.meta.url);
const v3Files = fs.readdirSync(FIXTURES).filter(f => f.endsWith('.json') && !f.startsWith('._'));
const v3Raw = f => fs.readFileSync(new URL(f, FIXTURES), 'utf8');

// 浏览器存储的替身：记下每次写入，可以让写入失败（空间不够）。
let mem, writes, failWrites;
beforeEach(() => {
  mem = new Map(); writes = []; failWrites = false;
  globalThis.localStorage = {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { if (failWrites) throw new Error('QuotaExceededError'); mem.set(k, String(v)); writes.push(k); },
    removeItem: k => { mem.delete(k); },
  };
});

const failed = (r, what) => {
  assert.equal(r.ok, false, what);
  assert.equal(typeof r.reason, 'string', what);
  assert.ok(r.reason.length > 0, `${what} 没有原因`);
  assert.ok(Array.isArray(r.notes), what);
};

describe('safeLoadState：什么输入都不抛错，读不了就说明原因', () => {
  it('垃圾数据：不是 JSON、不是对象、对象但认不出，都返回 ok:false 和原因', () => {
    const junk = ['{', 'not json', '[]', '{}', '42', '"x"', 'true', '[1,2,3]', '{"a":1}', '{"charId":"nope"}', ' ', '\u0000', '{"v":4}',
      '{"charId":"deepseek"}', '{"charId":"deepseek","date":"2024-01","day":"2024-01-01"}',
      '{"charId":"deepseek","date":"2024-01","day":"2024-01-01","models":{},"queue":{}}',
      {}, [], 0, 7, NaN, true, false, { v: 4 }, { charId: 123 }, { charId: {}, date: [], day: 5 }, { __proto__: null }, () => 1, Symbol('s')];
    junk.forEach((x, i) => failed(safeLoadState(x), `第 ${i} 个垃圾输入（${typeof x}）`));
  });

  it('没有存档（undefined、null、空串）和“有存档但读不了”分得开：前者 empty:true', () => {
    for (const x of [undefined, null, '']) {
      const r = safeLoadState(x);
      failed(r, String(x));
      assert.equal(r.empty, true);
    }
    for (const x of ['{', '{}', '[]']) assert.notEqual(safeLoadState(x).empty, true, x);
  });

  it('{status:"playing"} 这种只有一个字段的“存档”不抛错，原因里说认不出', () => {
    const r = safeLoadState('{"status":"playing"}');
    failed(r, '{status:playing}');
    assert.match(r.reason, /公司|认不出/);
    assert.doesNotMatch(r.reason, /undefined|null/, '原因里不能直接露出 undefined');
    failed(safeLoadState({ status: 'playing' }), '对象形式');
  });

  it('类 v1 存档：回合制旧版的外壳、按月推进的旧版、带 v:1 的整份存档、比现在新的版本，都给人话原因', () => {
    // 回合制旧版（archive/v0.5）存的是 { v: '0.1.0', ts, state }。
    const turn = safeLoadState(JSON.stringify({ v: '0.1.0', ts: 1700000000000, state: { turn: 12, stats: { reasoning: 480 }, cash: 100 } }));
    failed(turn, '回合制');
    assert.match(turn.reason, /旧版/);
    // 按月推进的旧版：有公司和月份，没有“今天”。
    const monthly = safeLoadState({ v: 1, status: 'playing', charId: 'deepseek', scenario: 'y2023', date: '2023-05', models: [], queue: [] });
    failed(monthly, '按月');
    assert.match(monthly.reason, /按月推进/);
    // 一份真存档，版本号改成 1 / 0 / 2 / -3：太旧，读不了，不抛错。
    const g = E.createGame('deepseek', 'y2024', 3);
    for (const v of [1, 0, 2, -3]) {
      const r = safeLoadState({ ...clone(g), v });
      failed(r, `v=${v}`);
      assert.match(r.reason, /太旧/);
    }
    // 比现在新的版本。
    const newer = safeLoadState({ ...clone(g), v: E.SAVE_VERSION + 5 });
    failed(newer, '更新的版本');
    assert.match(newer.reason, /新版本/);
  });

  it('正常存档：字符串和已解析的对象都能读；新档不算迁移；不改输入；读回的 JSON 一模一样', () => {
    const g = E.createGame('qwen', 'y2025', 9);
    const json = JSON.stringify(g);
    const r1 = safeLoadState(json);
    assert.equal(r1.ok, true);
    assert.equal(r1.migrated, false);
    assert.equal(JSON.stringify(r1.s), json);
    const obj = JSON.parse(json);
    const r2 = safeLoadState(obj);
    assert.equal(r2.ok, true);
    assert.equal(JSON.stringify(obj), json, '输入对象被改了');
    assert.ok(E.validateGame(r2.s));
    assert.equal(r2.s.status, 'playing');
  });

  it(`${v3Files.length} 份 v3 夹具：读得进来，算迁移，原文不动，读出来通过 validateGame`, () => {
    assert.equal(v3Files.length, 6);
    for (const f of v3Files) {
      const text = v3Raw(f);
      const before = text;
      const r = safeLoadState(text);
      assert.equal(r.ok, true, `${f}：${r.reason}`);
      assert.equal(r.migrated, true, f);
      assert.ok(E.validateGame(r.s), f);
      assert.equal(text, before);
    }
  });

  it('模糊：在好存档上随意删字段、改类型、塞怪值，读档永不抛错；读得进来的都通过 validateGame', () => {
    let seed = 20261021;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const pick = a => a[Math.floor(rnd() * a.length)];
    const bases = [clone(E.createGame('gpt', 'y2023', 1)), clone(E.createGame('suno', 'y2025', 2)), ...v3Files.map(f => JSON.parse(v3Raw(f)))];
    const weird = [null, undefined, 'x', -1, 1e308, NaN, [], {}, true, [null], { a: { b: [] } }, '', 0];
    const keys = o => (o && typeof o === 'object' ? Object.keys(o) : []);
    let okN = 0, failN = 0;
    // 读不进的大约占 8–11%：600 例时读不进的只在 50 上下，存档多一个字段、随机路径一变就可能掉到 50 以下，所以跑 1000 例。
    for (let i = 0; i < 1000; i++) {
      const s = clone(pick(bases));
      for (let m = 0, n = 1 + Math.floor(rnd() * 3); m < n; m++) {
        let node = s;
        for (let d = 0, depth = Math.floor(rnd() * 4); d < depth; d++) { const k = keys(node); if (!k.length) break; const next = node[pick(k)]; if (!next || typeof next !== 'object') break; node = next; }
        const k = keys(node);
        if (!k.length) continue;
        const key = pick(k);
        if (rnd() < 0.35) delete node[key]; else node[key] = pick(weird);
      }
      let r;
      assert.doesNotThrow(() => { r = safeLoadState(JSON.stringify(s) ?? 'null'); }, `第 ${i} 例`);
      if (r.ok) { okN++; assert.ok(E.validateGame(r.s)); } else { failN++; failed(r, `第 ${i} 例`); }
    }
    assert.ok(okN > 50 && failN > 50, `读得进 ${okN}，读不进 ${failN}：变异没有覆盖到两边`);
  });
});

describe('readSaved：浏览器存储上的包装', () => {
  it('没有存档：empty，不写任何东西', () => {
    const r = readSaved();
    assert.equal(r.ok, false);
    assert.equal(r.empty, true);
    assert.equal(r.raw, null);
    assert.deepEqual(writes, []);
  });

  it('读不了的存档：带原因，原文原样留着，不写备份', () => {
    mem.set(SAVE_KEY, '{"status":"playing"');
    const r = readSaved();
    failed(r, '截断的存档');
    assert.notEqual(r.empty, true);
    assert.equal(r.raw, '{"status":"playing"');
    assert.equal(mem.get(SAVE_KEY), '{"status":"playing"');
    assert.equal(mem.has(BAK_KEY), false);
  });

  it('v3 旧档：第一次读备份原文到 mrp.sim.v2.bak，存档本身不动；再读不重复写备份', () => {
    const text = v3Raw(v3Files[0]);
    mem.set(SAVE_KEY, text);
    const r = readSaved();
    assert.equal(r.ok, true);
    assert.equal(r.migrated, true);
    assert.equal(r.backup, 'ok');
    assert.equal(mem.get(BAK_KEY), text);
    assert.equal(mem.get(SAVE_KEY), text, '读档不该改存档');
    assert.equal(BAK_KEY, 'mrp.sim.v2.bak');
    const n = writes.length;
    assert.equal(readSaved().backup, 'ok');
    assert.equal(writes.length, n, '同一份原文不重复写备份');
  });

  it('当前版本的存档：不迁移，不备份', () => {
    mem.set(SAVE_KEY, JSON.stringify(E.createGame('claude', 'y2024', 4)));
    const r = readSaved();
    assert.equal(r.ok, true);
    assert.equal(r.migrated, false);
    assert.equal(r.backup, 'none');
    assert.equal(mem.has(BAK_KEY), false);
  });

  it('备份写不进去（空间不够）：照样读得进来，只是 backup 报 failed', () => {
    mem.set(SAVE_KEY, v3Raw(v3Files[1]));
    failWrites = true;
    const r = readSaved();
    assert.equal(r.ok, true);
    assert.equal(r.backup, 'failed');
  });

  it('浏览器存储整个不可用（访问就抛错）：当作没有存档，不抛错', () => {
    globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
    const r = readSaved();
    assert.equal(r.ok, false);
    assert.equal(r.empty, true);
    assert.deepEqual(legacyKeysFound(), []);
  });
});

describe('旧版存档键提示', () => {
  it('留着 mrp.v0.1.0.save / prefs / byok 任何一个就提示；点过“知道了”以后不再提示', () => {
    assert.deepEqual(LEGACY_KEYS, ['mrp.v0.1.0.save', 'mrp.v0.1.0.prefs', 'mrp.v0.1.0.byok']);
    assert.deepEqual(legacyKeysFound(), []);
    mem.set('mrp.v0.1.0.byok', '{}');
    assert.deepEqual(legacyKeysFound(), ['mrp.v0.1.0.byok']);
    mem.set('mrp.v0.1.0.save', '{}');
    assert.deepEqual(legacyKeysFound(), ['mrp.v0.1.0.save', 'mrp.v0.1.0.byok']);
    assert.equal(markLegacySeen(), true);
    assert.equal(mem.get(LEGACY_SEEN_KEY), '1');
    assert.deepEqual(legacyKeysFound(), []);
    for (const k of ['mrp.v0.1.0.save', 'mrp.v0.1.0.byok']) assert.equal(mem.get(k), '{}', '旧版的数据不能被动');
  });
});
