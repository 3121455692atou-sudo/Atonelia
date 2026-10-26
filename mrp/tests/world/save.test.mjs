// 世界存档（E8）：serialize/deserialize/migrateWorld；读回一致；坏档返回中文原因且不抛错；之后史实局正常。
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { PLAYABLE } from '../../src/career/data/core.js';
import { RELEASES } from '../../src/career/data/rivals.js';
import { storage, WORLD_SAVE_VERSION } from '../../src/career/world/save.js';
import { restoreHistory } from '../helpers/world_provider.mjs';

after(() => restoreHistory());

const names = ['晨星', '北岭', '蓝鲸', '泰拉', '流光', '山巅'];
const companies = (n = 6) => names.slice(0, n).map((name, i) => ({
  name: `${name}智能`, brand: name, country: ['CN', 'US', 'EU'][i % 3], tier: 'specialist', kind: 'bot',
}));
function run(w, days) {
  for (let i = 0; i < days; i++) {
    const r = w.tick();
    assert.equal(r.paused, undefined);
  }
}

describe('世界存档（E8）', () => {
  it('从零局跑 90 天 → 存档读回 → 再跑 30 天，和不存档跑 120 天的世界哈希相同', () => {
    const base = E.createWorld({ seed: 11, start: '2024-01', days: 120, companies: companies(6) });
    run(base, 120);
    const w = E.createWorld({ seed: 11, start: '2024-01', days: 120, companies: companies(6) });
    run(w, 90);
    const raw = E.deserialize(E.serialize(w));
    const m = E.migrateWorld(raw);
    assert.equal(m.ok, true, m.reason);
    run(m.world, 30);
    assert.equal(m.world.hash(), base.hash());
  });

  it('分岔局跑 90 天 → 存档读回 → 再跑 30 天，哈希相同；同一份存档连读两次也一致', () => {
    const base = E.createWorld({ mode: 'fork', start: 2024, seed: 7, days: 120 });
    run(base, 120);
    const w = E.createWorld({ mode: 'fork', start: 2024, seed: 7, days: 120 });
    run(w, 90);
    const text = E.serialize(w);
    // P() 是模块单例，同一进程一次只能推进一个世界；两次读档分开推进，各自和不存档的那局比。
    const a = E.migrateWorld(E.deserialize(text));
    assert.equal(a.ok, true, a.reason);
    run(a.world, 30);
    assert.equal(a.world.hash(), base.hash());
    const b = E.migrateWorld(E.deserialize(text));
    assert.equal(b.ok, true, b.reason);
    assert.equal(b.world.hash(), w.hash(), '同一份存档连读两次不一致');
    run(b.world, 30);
    assert.equal(b.world.hash(), base.hash());
  });

  it('坏档：缺字段、同 id 不同 spec、rels 长度不对，都返回中文原因、不抛错；之后史实局完全正常', () => {
    const w = E.createWorld({ seed: 11, start: '2024-01', days: 10, companies: companies(3) });
    run(w, 10);
    const good = E.deserialize(E.serialize(w));
    const bad1 = JSON.parse(JSON.stringify(good)); delete bad1.world.rels;
    const bad2 = JSON.parse(JSON.stringify(good)); bad2.companies[0].spec = { ...bad2.companies[0].spec, name: '另一个名字' };
    const bad3 = JSON.parse(JSON.stringify(good)); bad3.world.ver = good.world.rels.length + 5;
    const bad4 = 'not json';
    for (const raw of [bad1, bad2, bad3, bad4]) {
      const r = E.migrateWorld(raw);
      assert.equal(r.ok, false);
      assert.match(r.reason, /[\u4e00-\u9fff]/, `原因应是中文：${r.reason}`);
      // 每次失败都应回到史实单例：没有自定义公司，发布表是原表。
      assert.equal(PLAYABLE.filter(x => x.id.startsWith('c_')).length, 0);
      assert.equal(E.P().mode, 'history');
    }
    const before = RELEASES.length;
    assert.ok(before > 300, 'RELEASES 应该是史实原表');
    const s = E.createGame('gpt', 'y2024', 1);
    for (let i = 0; i < 5 && s.status === 'playing'; i++) E.tickDay(s);
    assert.equal(s.status, 'playing');
    assert.equal(E.P().mode, 'history');
  });

  it('刷新页面以后直接读档：在一个从没开过世界的新进程里读回，学界行和自定义公司的发布行都认得出', async () => {
    // 浏览器里实测过的坑：学界家族和自定义公司只在开新世界时登记，刷新后直接读档时 setReleases 查不到家族就抛错。
    const w = E.createWorld({ seed: 5, start: '2024-01', days: 400, companies: companies(6) });
    let i = 0;
    while (i < 400 && !w.rels.some(r => r[0] !== 'academia')) { w.tick(); i++; }
    assert.ok(w.rels.some(r => r[0] !== 'academia'), '跑到有公司发布过模型');
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { execFileSync } = await import('node:child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mrp-world-'));
    const file = path.join(dir, 'world.json');
    fs.writeFileSync(file, E.serialize(w));
    const engine = new URL('../../src/career/engine.js', import.meta.url).href;
    const code = `const E = await import(${JSON.stringify(engine)}); const fs = await import('node:fs');
      const r = E.migrateWorld(fs.readFileSync(${JSON.stringify(file)}, 'utf8'));
      if (!r.ok) { console.log('FAIL ' + r.reason); process.exit(1); }
      r.world.tick(); console.log('OK ' + r.world.rels.length);`;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
    assert.match(out, /^OK \d+/, out);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('save.js 在 Node 里能导入；没有浏览器存储时 storage() 安静地退成 none', () => {
    assert.equal(WORLD_SAVE_VERSION, 2);
    assert.equal(typeof E.serialize, 'function');
    assert.equal(typeof E.deserialize, 'function');
    assert.equal(typeof E.migrateWorld, 'function');
    const st = storage();
    assert.equal(st.kind, 'none');
    assert.equal(typeof st.save, 'function');
  });

  it('存档里带着完整的 world.rels，版本号就是 rels 条数', () => {
    const w = E.createWorld({ seed: 3, start: '2024-01', days: 5, companies: companies(3) });
    run(w, 5);
    const raw = E.deserialize(E.serialize(w));
    assert.equal(raw.kind, 'world');
    assert.equal(raw.v, 2);
    assert.equal(raw.world.ver, raw.world.rels.length);
    assert.ok(raw.world.ver > 0);
    assert.equal(raw.companies.length, 3);
    assert.ok(raw.companies.every(x => x.s && x.spec && x.spec.custom === true));
  });
});
