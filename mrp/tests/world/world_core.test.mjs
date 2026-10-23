// M1a 世界核心：6 家从零 2024 跑 365 天，逐日检查 F4a 的几条硬不变量、镜像和确定性。
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { SOTA } from '../../src/career/data/balance.js';
import { restoreHistory } from '../helpers/world_provider.mjs';

const r6 = ['晨星', '北岭', '蓝鲸', '泰拉', '流光', '山巅'];
const companies = (n = 6, tier = 'specialist') => r6.slice(0, n).map((name, i) => ({
  name: `${name}智能`, brand: name, country: ['CN', 'US', 'EU'][i % 3], tier, kind: 'bot',
}));
const EPS = SOTA.EPS + 1e-6;

function badNumbers(x, at = 'w', seen = new WeakSet(), out = []) {
  if (typeof x === 'number') { if (!Number.isFinite(x)) out.push(at); }
  else if (x && typeof x === 'object') {
    if (seen.has(x)) return out;
    seen.add(x);
    for (const [k, v] of Object.entries(x)) badNumbers(v, `${at}.${k}`, seen, out);
  }
  return out;
}

after(() => restoreHistory());

describe('世界核心（M.3、M.4、F4a）', () => {
  it('6 家从零 2024 跑 365 天：0 抛错、0 个非有限数，逐日硬不变量成立', () => {
    const world = E.createWorld({ seed: 11, start: '2024-01', days: 365, companies: companies(6) });
    let firstQ = null;
    let days = 0;
    for (let i = 0; i < 365; i++) {
      const res = world.tick();
      assert.equal(res.paused, undefined, `第 ${i} 天不应暂停`);
      days += 1;
      const day = res.day;
      const best = E.worldBest(world, day);
      const visible = Math.max(best, E.acadBest(world));
      const h = world.label.holder;
      // 持标那款 ≥ 世界可见最强（含学界）− EPS。
      if (h) assert.ok(h.q >= visible - EPS, `${day} 持标 ${h.q} < 可见最强 ${visible} - EPS`);
      // 有公司超过学界以后，学界最强 ≤ 公司已发最强 − 1。
      if (Number.isFinite(best) && best >= world.acad.start + 1) {
        assert.ok(E.acadBest(world) <= best - 1 + 1e-6, `${day} 学界 ${E.acadBest(world)} > 公司最强 ${best} - 1`);
      }
      for (const [id, c] of Object.entries(world.companies)) {
        const so = c.s.sota;
        assert.ok(so, `${id} 没有 s.sota 镜像`);
        if (h) {
          assert.equal(so.holder?.org, h.org, `${day} ${id} 镜像持有者 org`);
          assert.equal(so.holder?.q, h.q, `${day} ${id} 镜像持有者 q`);
          assert.equal(so.holder?.by, h.org === id ? 'me' : h.org, `${day} ${id} 镜像 by`);
          assert.equal(so.holder?.id, h.org === id ? h.modelId : h.relId, `${day} ${id} 镜像 id`);
        } else assert.equal(so.holder, null, `${day} ${id} 镜像应为空`);
        assert.deepEqual(so.field, world.label.field, `${day} ${id} 镜像 field`);
        assert.equal(so.made.length, (world.label.made[id] || []).length, `${day} ${id} 镜像 made`);
        // 同一款模型在所有公司的榜单上分数相同：发布行的 q 只有一个来源。
        if (so.holder && so.holder.by !== 'me') {
          const meta = world.relMeta[so.holder.id];
          assert.ok(meta, `${day} ${id} 镜像 id 找不到发布行`);
          assert.equal(so.holder.q, meta.q, `${day} ${id} 同一款模型分数不同`);
        }
      }
      for (const x of res.fresh || []) {
        if (x.m.role === 'small' || x.m.line === 'side') continue;
        if (firstQ === null) firstQ = x.meta.q;
        assert.ok(x.meta.q > world.acad.start, `第一款公司发布 ${x.meta.q} 没有高过学界起点 ${world.acad.start}`);
      }
    }
    assert.equal(days, 365);
    assert.ok(firstQ !== null, '365 天里至少该有一家发布');
    const errs = Object.values(world.companies).reduce((a, c) => a + c.errors.length, 0) + world.errors.length;
    assert.equal(errs, 0, Object.values(world.companies).flatMap(c => c.errors).join('\n'));
    assert.deepEqual(badNumbers({ companies: Object.values(world.companies).map(c => c.s), world }), []);
  });

  it('推进顺序倒过来，世界哈希不变；同种子两次一致，不同种子不同', () => {
    const run = (seed, reverse = false) => {
      const w = E.createWorld({ seed, start: '2024-01', days: 90, companies: companies(4) });
      for (let i = 0; i < 90; i++) {
        const res = w.tick({ reverse });
        assert.equal(res.paused, undefined);
      }
      return w.hash();
    };
    const a = run(11);
    const b = run(11);
    const rev = run(11, true);
    const other = run(12);
    assert.equal(a, b, '同种子两次哈希不一致');
    assert.equal(a, rev, '倒序推进改变了世界哈希');
    assert.notEqual(a, other, '不同种子哈希相同');
  });
});
