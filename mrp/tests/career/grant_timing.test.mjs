// P3.D2 授名时机（规格 A10、F2 的 P3.D2 行）：grantWindow、grantGap、机器人送评 / 顾问文案 / 立项结构。
// 夹具都用 DeepSeek 的名表，不改公司文件；没有授权的公司（kimi、rwkv）只验证这两个函数恒为 null。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { setStance } from '../../src/career/sim/route.js';
import { resolveAll } from '../helpers/career_bot.mjs';

const DIMS = { knowledge: 99, code: 99, math: 99, writing: 99, safety: 90, agent: 99 };
const fresh = (charId = 'deepseek', sc = 'y2023', seed = 1) => { const s = E.createGame(charId, sc, seed); resolveAll(s); s.queue = []; return s; };
const openRoute = s => setStance(s, 'open', { src: 'start' });
const right = (s, id, extra = {}) => { s.strategy.rights[id] = { day: s.day, until: '2027-01-01', used: null, void: null, ...extra }; };

// 一个满足 V2 结构条件的在练模型（MoE、236B/21B、底座干净）。和开局有没有在练模型无关。
const v2Model = () => ({ id: 'test_v2', stage: 'post', role: 'flagship', arch: 'moe', total: 236, active: 21, dims: { ...DIMS }, train: { minor: 0, severe: 0 } });

describe('P3.D2 授名时机：grantWindow', () => {
  it('条件全部成立时返回授名、条件和到期日', () => {
    const s = fresh();
    openRoute(s);
    s.techs = [...new Set([...s.techs, 'moe', 'mla'])];
    right(s, 'hn_ds_v2');
    const w = v2Model(s);
    const g = E.grantWindow(s, w);
    assert.ok(g, 'V2 的条件全部成立，应该给出授名');
    assert.equal(g.id, 'hn_ds_v2');
    assert.equal(g.name, 'DeepSeek-V2');
    assert.equal(g.until, '2027-01-01');
    assert.ok(g.lines.length > 0 && g.lines.every(l => l.ok), g.lines.map(l => `${l.text}（${l.now}）`).join('；'));
  });

  it('差一条（激活参数超过上限）返回 null', () => {
    const s = fresh();
    openRoute(s);
    s.techs = [...new Set([...s.techs, 'moe', 'mla'])];
    right(s, 'hn_ds_v2');
    const w = { ...v2Model(s), active: 30 };
    assert.equal(E.grantWindow(s, w), null);
  });

  it('授权用掉、作废、过期都返回 null', () => {
    for (const extra of [{ used: 'cand_1' }, { void: '现实里这一步叫 DeepSeek-V2，但这一回别家先做到了' }, { until: '2020-01-01' }]) {
      const s = fresh();
      openRoute(s);
      s.techs = [...new Set([...s.techs, 'moe', 'mla'])];
      right(s, 'hn_ds_v2', extra);
      assert.equal(E.grantWindow(s, v2Model(s)), null, JSON.stringify(extra));
    }
  });
});

describe('P3.D2 授名时机：grantGap', () => {
  it('只差单科时返回差值和授名', () => {
    const s = fresh();
    s.techs = [...new Set([...s.techs, 'reasoning'])];
    right(s, 'hn_ds_v31');
    const w = { ...v2Model(), id: 'gap_agent', arch: 'dense', total: 70, active: 70, dims: { ...DIMS, agent: 60 } };
    const g = E.grantGap(s, w);
    assert.ok(g, '只差 Agent 5 分，应该给出补差方向');
    assert.equal(g.id, 'hn_ds_v31');
    assert.deepEqual(g.dims, { agent: 5 });
  });

  it('差结构时返回 null', () => {
    const s = fresh();
    openRoute(s);
    s.techs = [...new Set([...s.techs, 'moe', 'mla'])];
    right(s, 'hn_ds_v2');
    // V2 要 MoE：换成稠密以后不是“只差单科”，grantGap 不接这种活（交给 chooseBase 立项）。
    const w = { ...v2Model(s), arch: 'dense', active: 236 };
    assert.equal(E.grantGap(s, w), null);
  });
});

describe('P3.D2 授名时机：机器人和顾问', () => {
  // 走到授名条件第一次成立的那个周末，返回当时的局面（不推进那一天）。
  function untilWindow(sc = 'y2025', seed = 1) {
    const s = E.createGame('deepseek', sc, seed);
    const errors = [];
    resolveAll(s);
    for (let i = 0; i < 80 && s.status === 'playing'; i++) {
      const w = E.workingModel(s);
      if (w && E.grantWindow(s, w)) return { s, errors };
      E.botStep(s, errors);
      for (let d = 0; d < 7 && s.status === 'playing'; d++) { resolveAll(s); E.tickDay(s); }
    }
    return { s, errors };
  }

  it('DeepSeek y2025：授名成立的那一周，botStep 送评，候选 plan.grant 是 R1', () => {
    const { s, errors } = untilWindow();
    const w = E.workingModel(s);
    const g = E.grantWindow(s, w);
    assert.ok(g, '应该走到 R1 的授名窗口');
    assert.equal(g.id, 'hn_ds_r1');
    E.botStep(s, errors);
    const ev = (s.evals || []).find(e => e.line === 'main');
    assert.ok(ev, `应该送评（${errors.join('；')}）`);
    assert.equal(ev.plan.grant, 'hn_ds_r1');
    assert.equal(ev.plan.name, 'DeepSeek-R1');
  });

  it('同一天 advise() 的第一条作业建议是“趁「DeepSeek-R1」的条件还成立送评”', () => {
    const { s } = untilWindow();
    resolveAll(s);
    const list = E.advise(s);
    const firstJob = list.find(a => a.kind === 'jobs' || String(a.id).startsWith('jobs:'));
    assert.ok(firstJob, '应该有一条作业建议');
    assert.equal(firstJob.id, 'jobs:submit:grant');
    assert.equal(firstJob.label, '趁「DeepSeek-R1」的条件还成立送评');
    assert.match(firstJob.detail, /DeepSeek-R1/);
    assert.match(firstJob.detail, /还剩 \d+ 天/);
  });
});

describe('P3.D2 授名时机：立项结构', () => {
  it('手里有 V2 授权时，挑出的结构满足 V2 的 model 条件', () => {
    const s = fresh();
    s.techs = [...new Set([...s.techs, 'moe', 'mla'])];
    right(s, 'hn_ds_v2');
    const pick = E.chooseBase(s);
    assert.ok(pick, '应该挑得出来');
    assert.equal(pick.cfg.arch, 'moe');
    assert.ok(pick.cfg.total >= 200, `总参 ${pick.cfg.total}B`);
    assert.ok(pick.cfg.active <= 25, `激活 ${pick.cfg.active}B`);
    assert.ok(s.techs.includes('mla'));
  });

  it('挑不出时照原规则立项（没有 MoE 技术，V2 要的 MoE 结构做不了）', () => {
    const a = fresh(), b = fresh();
    for (const s of [a, b]) {
      s.techs = s.techs.filter(t => t !== 'moe');
      s.techs = [...new Set([...s.techs, 'mla'])];
    }
    right(a, 'hn_ds_v2');
    const withRight = E.chooseBase(a), without = E.chooseBase(b);
    assert.deepEqual(withRight?.cfg, without?.cfg);
    assert.ok(withRight);
  });
});

describe('P3.D2 授名时机：没有授权的公司', () => {
  it('kimi、rwkv 的 grantWindow / grantGap 恒为 null，机器人的立项不受影响', () => {
    for (const id of ['kimi', 'rwkv']) {
      const s = fresh(id, 'y2025');
      for (let i = 0; i < 6; i++) {
        const w = E.workingModel(s);
        if (w) {
          assert.equal(E.grantWindow(s, w), null, `${id} 不应该有授名窗口`);
          assert.equal(E.grantGap(s, w), null, `${id} 不应该有补差授名`);
        }
        for (let d = 0; d < 7 && s.status === 'playing'; d++) { resolveAll(s); E.tickDay(s); }
      }
    }
  });
});
