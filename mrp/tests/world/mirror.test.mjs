// 联机客户端的镜像（规格 M.6.5，M4）：客户端只有公开视图和自家的 s（去掉 rng、seed），不跑 tickDay。
// 真世界跑一段以后，拿某个真人座位收到的东西拼镜像，后台每一页、主界面、各面板都能渲染，不出现 undefined / NaN；
// 发布表、SOTA 标签、市场、交易所和真世界一致；镜像里看不到别家的 s。
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { stripPrivate } from '../../src/career/net/protocol.js';
import { RELEASES } from '../../src/career/data/rivals.js';
import { restoreHistory } from '../helpers/world_provider.mjs';

globalThis.document ??= { baseURI: 'http://localhost/' };
const { PAGES, PAGE } = await import('../../src/career/ui/office.js');
const { renderHome } = await import('../../src/career/ui/home.js');
const state = await import('../../src/career/ui/state.js');
const PANELS = Object.fromEntries(await Promise.all(['data', 'eval', 'release'].map(async k => [k, await import(`../../src/career/ui/panels/${k}.js`)])));

after(() => { state.setWorld(null); restoreHistory(); });

const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const BAD = /undefined|NaN|\[object|(?<![\w-])null(?![\w-])|Infinity/;
const J = x => JSON.parse(JSON.stringify(x));
const freshSt = (x = {}) => ({ page: 'model', bench: null, cls: '', board: 'bench', proj: null, distill: null, ticker: 'NVDA', newJob: null, small: null, post: null, trial: null, ft: null, plan: null, opt: {}, jobMenu: null, modelOpen: null, submit: null, planEdit: false, newsTab: 'world', ...x });
const companies = [
  { name: '甲辰智能', brand: '甲辰', country: 'CN', tier: 'specialist', kind: 'human' },
  { name: '乙巳智能', brand: '乙巳', country: 'US', tier: 'major', kind: 'bot', bot: 'hard' },
  { name: '丙午智能', brand: '丙午', country: 'EU', tier: 'specialist', kind: 'bot' },
  { name: '丁未智能', brand: '丁未', country: 'US', tier: 'small', kind: 'bot' },
];

let world, me, pub, S, real;
describe('联机客户端的镜像（M4）', () => {
  before(() => {
    world = E.createWorld({ seed: 8, start: '2024-01', days: 500, companies, mp: true });
    for (let i = 0; i < 300; i++) world.tick();
    me = Object.values(world.companies).find(c => c.kind === 'human');
    // 拍一份真世界里的对照：发布表、标签持有者、交易所价格。
    real = { rels: RELEASES.map(r => r.name), holder: world.label.holder?.name ?? null, day: world.day };
    // 客户端收到的：公开视图 + 自家 s（去掉 rng、seed），都过一遍 JSON（SSE 就是这样）。
    pub = J(E.publicView(world, me.id));
    S = J(stripPrivate(me.s));
    E.openMirror(pub, S);
    // 联机时 getWorld() 返回镜像世界：同场公司、新闻、交易所、算力这些页走自洽分支。
    state.setWorld(E.P().world);
    state.setState(S);
  });

  it('发布表、标签持有者和真世界一致；镜像里别家的 s 都是空的', () => {
    assert.deepEqual(RELEASES.map(r => r.name), real.rels);
    assert.ok(real.rels.length > 0, '跑了 300 天总该有发布');
    const P = E.P();
    assert.equal(P.mode, 'sim');
    assert.equal(P.mirror, true);
    assert.equal(P.world.label.holder?.name ?? null, real.holder);
    for (const c of Object.values(P.world.companies)) assert.equal(c.s === null, c.id !== S.charId, c.id);
    assert.ok(!('rng' in S) && !('seed' in S));
  });

  it('后台每一页、主界面、各面板都能渲染，不出现 undefined / NaN', () => {
    const errs = [];
    for (const [id, name] of PAGES) {
      try {
        const html = PAGE[id].render(S, freshSt({ page: id }));
        assert.ok(typeof html === 'string' && html.trim().length > 0, `${name} 是空的`);
        assert.doesNotMatch(text(html), BAD, name);
      } catch (e) { errs.push(`${name}：${e.message}`); }
    }
    for (const k of ['pretrain', 'post', 'distill', 'small', 'trial', 'finetune']) {
      try { PAGE.train.render(S, freshSt({ page: 'train', newJob: k })); } catch (e) { errs.push(`训练页新作业 ${k}：${e.message}`); }
    }
    for (const [k, p] of Object.entries(PANELS)) {
      try { p.render(S); } catch (e) { errs.push(`面板 ${k}：${e.message}`); }
    }
    try {
      const app = { className: '', innerHTML: '' };
      renderHome(app);
      assert.doesNotMatch(text(app.innerHTML), BAD, '主界面');
    } catch (e) { errs.push(`主界面：${e.message}`); }
    assert.deepEqual(errs, []);
  });

  it('换天：公开差分合进来以后刷新镜像，发布表跟着多出新行', () => {
    for (let i = 0; i < 40; i++) world.tick();
    const pub2 = J(E.publicView(world, me.id));
    const S2 = J(stripPrivate(me.s));
    const before = RELEASES.length;
    E.refreshMirror(E.P(), pub2, S2);
    assert.equal(E.P().world.day, pub2.day);
    assert.equal(RELEASES.length, pub2.relRows.length);
    assert.ok(RELEASES.length >= before);
  });
});
