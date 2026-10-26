// 当前 schema 只读存取：拒绝旧版、缺失/未知版本，不迁移、不写备份。
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import { clone } from '../helpers/career_util.mjs';
import { safeLoadState, readSaved, SAVE_KEY } from '../../src/career/ui/storage.js';

const FIXTURES = new URL('../fixtures/saves/', import.meta.url);
const v3Files = fs.readdirSync(FIXTURES).filter(f => f.endsWith('.json') && !f.startsWith('._'));
const v3Raw = f => fs.readFileSync(new URL(f, FIXTURES), 'utf8');
let mem, writes, reads, failWrites;
beforeEach(() => {
  mem = new Map(); writes = []; reads = []; failWrites = false;
  globalThis.localStorage = {
    getItem: k => { reads.push(k); return mem.get(k) ?? null; },
    setItem: (k, v) => { if (failWrites) throw new Error('QuotaExceededError'); mem.set(k, String(v)); writes.push(k); },
    removeItem: k => mem.delete(k),
  };
});
const failed = (r, what) => {
  assert.equal(r.ok, false, what);
  assert.equal(typeof r.reason, 'string', what);
  assert.ok(r.reason.length > 0, `${what} 没有原因`);
  assert.ok(Array.isArray(r.notes), what);
};
const noMigrationMetadata = r => {
  assert.equal(Object.hasOwn(r, 'migrated'), false);
  assert.equal(Object.hasOwn(r, 'backup'), false);
};

describe('safeLoadState：当前 schema 校验，任何输入均不抛错', () => {
  it('垃圾数据返回可读原因，不抛异常', () => {
    const junk = ['{', 'not json', '[]', '{}', '42', '"x"', 'true', '[1,2,3]', '{"a":1}', '{"charId":"nope"}', ' ', '\u0000',
      {}, [], 0, 7, NaN, true, false, { v: E.SAVE_VERSION }, { charId: 123 }, { charId: {}, date: [], day: 5 }, { __proto__: null }, () => 1, Symbol('s')];
    junk.forEach((x, i) => failed(safeLoadState(x), `垃圾输入 ${i}`));
  });
  it('无存档与有存档但读不了分开处理', () => {
    for (const x of [undefined, null, '']) { const r = safeLoadState(x); failed(r); assert.equal(r.empty, true); }
    for (const x of ['{', '{}', '[]']) assert.notEqual(safeLoadState(x).empty, true);
  });
  it('缺失、旧版、未来、字符串及非整数版本均要求新开局，原文/对象不改', () => {
    const g = E.createSinglePlayerGame('deepseek', 'y2024', 3);
    for (const v of [undefined, null, -3, 0, 1, 2, 3, 4, E.SAVE_VERSION + 1, String(E.SAVE_VERSION), 1.5]) {
      assert.notEqual(v, E.SAVE_VERSION, '测试必须覆盖非当前版本');
      const obj = { ...clone(g), v }, before = JSON.stringify(obj);
      for (const value of [obj, before]) {
        const r = safeLoadState(value); failed(r, `v=${v}`);
        assert.match(r.reason, /不支持.*当前.*请新开一局/); noMigrationMetadata(r);
      }
      assert.equal(JSON.stringify(obj), before);
    }
    for (const obj of [{ v: '0.1.0', state: { turn: 12 } }, { v: 1, charId: 'deepseek', date: '2023-05' }]) {
      const r = safeLoadState(obj); failed(r); assert.match(r.reason, /请新开一局/);
    }
  });
  it('同版存档字符串和对象都通过，不补字段或改输入，JSON 完全相同', () => {
    const json = JSON.stringify(E.createSinglePlayerGame('qwen', 'y2025', 9));
    for (const input of [json, JSON.parse(json)]) {
      const r = safeLoadState(input); assert.equal(r.ok, true, r.reason);
      noMigrationMetadata(r); assert.equal(JSON.stringify(r.s), json);
      assert.equal(typeof input === 'string' ? input : JSON.stringify(input), json);
      assert.ok(E.validateGame(r.s)); assert.deepEqual(r.notes, []);
    }
  });
  it(`${v3Files.length} 份真实 v3 夹具全部明确拒绝，不转换旧 schema`, () => {
    assert.equal(v3Files.length, 6);
    for (const f of v3Files) {
      const text = v3Raw(f), obj = JSON.parse(text), before = JSON.stringify(obj);
      for (const input of [text, obj]) { const r = safeLoadState(input); failed(r, f); assert.match(r.reason, /请新开一局/); noMigrationMetadata(r); }
      assert.equal(JSON.stringify(obj), before); assert.deepEqual(writes, []);
    }
  });
  it('当前版本也不能静默修补损坏数值、缺字段或未知事件', () => {
    const base = E.createSinglePlayerGame('deepseek', 'y2025', 11);
    for (const mutate of [s => { s.cash = NaN; }, s => { s.team = Infinity; }, s => { delete s.jobs; }, s => s.queue.push({ kind: 'unknown' })]) {
      const s = structuredClone(base); mutate(s); const before = structuredClone(s);
      failed(safeLoadState(s)); assert.deepEqual(s, before); assert.deepEqual(writes, []);
    }
  });
  it('1000 个随机变异输入不抛错；成功者同样通过验证且不被修补', () => {
    let seed = 20261021;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const pick = a => a[Math.floor(rnd() * a.length)];
    const bases = [clone(E.createGame('gpt', 'y2023', 1)), clone(E.createGame('suno', 'y2025', 2)), ...v3Files.map(f => JSON.parse(v3Raw(f)))];
    const weird = [null, undefined, 'x', -1, 1e308, NaN, [], {}, true, [null], { a: { b: [] } }, '', 0];
    const keys = o => (o && typeof o === 'object' ? Object.keys(o) : []);
    let okN = 0, failN = 0;
    for (let i = 0; i < 1000; i++) {
      const s = clone(pick(bases));
      for (let m = 0, n = 1 + Math.floor(rnd() * 3); m < n; m++) {
        let node = s;
        for (let d = 0, depth = Math.floor(rnd() * 4); d < depth; d++) { const k = keys(node); if (!k.length) break; const next = node[pick(k)]; if (!next || typeof next !== 'object') break; node = next; }
        const k = keys(node); if (!k.length) continue;
        const key = pick(k); if (rnd() < 0.35) delete node[key]; else node[key] = pick(weird);
      }
      const text = JSON.stringify(s) ?? 'null'; let r;
      assert.doesNotThrow(() => { r = safeLoadState(text); }, `变异 ${i}`);
      if (r.ok) { okN++; assert.ok(E.validateGame(r.s)); assert.equal(JSON.stringify(r.s), text); }
      else { failN++; failed(r, `变异 ${i}`); }
    }
    assert.ok(okN > 0 && failN > 50, `接受 ${okN}，拒绝 ${failN}`);
  });
});

describe('readSaved：只读浏览器当前存档', () => {
  it('无存档不写入任何东西', () => {
    const r = readSaved(); failed(r); assert.equal(r.empty, true); assert.equal(r.raw, null); noMigrationMetadata(r); assert.deepEqual(writes, []);
  });
  it('坏档保留原文且不备份', () => {
    const text = '{"status":"playing"'; mem.set(SAVE_KEY, text);
    const r = readSaved(); failed(r); assert.notEqual(r.empty, true); assert.equal(r.raw, text);
    assert.equal(mem.get(SAVE_KEY), text); noMigrationMetadata(r); assert.deepEqual(writes, []);
  });
  it('旧版实际夹具和当前形状旧版本反复读取均拒绝，已有备份不碰', () => {
    const current = E.createSinglePlayerGame('claude', 'y2024', 4);
    for (const text of [v3Raw(v3Files[0]), JSON.stringify({ ...current, v: E.SAVE_VERSION - 1 })]) {
      mem.set(SAVE_KEY, text); mem.set('mrp.sim.v2.bak', '原有数据');
      for (let i = 0; i < 2; i++) {
        const r = readSaved(); failed(r); assert.match(r.reason, /请新开一局/); noMigrationMetadata(r);
        assert.equal(mem.get(SAVE_KEY), text); assert.equal(mem.get('mrp.sim.v2.bak'), '原有数据'); assert.deepEqual(writes, []);
      }
    }
  });
  it('当前卡牌存档正常读取，无迁移元数据、不备份，存储只读也能加载', () => {
    const text = JSON.stringify(E.createSinglePlayerGame('claude', 'y2024', 4)); mem.set(SAVE_KEY, text);
    for (const readOnly of [false, true]) {
      failWrites = readOnly; const r = readSaved(); assert.equal(r.ok, true, r.reason);
      assert.equal(JSON.stringify(r.s), text); noMigrationMetadata(r); assert.deepEqual(writes, []);
    }
  });
  it('存储不可用当作无存档，不抛异常', () => {
    globalThis.localStorage = { getItem() { throw Error('denied'); } };
    const r = readSaved(); failed(r); assert.equal(r.empty, true);
  });
  it('不扫描、不提示标记、不改写旧版存储键', () => {
    const keys = ['mrp.v0.1.0.save', 'mrp.v0.1.0.prefs', 'mrp.v0.1.0.byok', 'mrp.sim.legacy-seen', 'mrp.sim.v2.bak'];
    keys.forEach(k => mem.set(k, '原有数据'));
    assert.equal(readSaved().empty, true); assert.deepEqual(reads, [SAVE_KEY]); assert.deepEqual(writes, []);
    keys.forEach(k => assert.equal(mem.get(k), '原有数据'));
  });
});
