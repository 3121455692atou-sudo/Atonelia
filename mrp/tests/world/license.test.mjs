// M2b 受限开源条款（规格 M.5.3、M.5.4 C1 第 5 条、M.5.9）：条款的格式和命令、发布时登记条款、
// 拿来蒸馏算违约（电脑发布方起诉、真人收到卡）、署名衍生可以用发布方品牌词开头、署名加品牌（封顶 1.10）、大户分成入账六成。
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { LICENSE_TERMS as T, TRANSFER } from '../../src/career/data/exchange.js';
import { appendRelease } from '../../src/career/world/release.js';
import { normTerms, licenseClose, licenseMonth, lrLinks, DEFAULT_TERMS } from '../../src/career/world/license.js';
import { settleTransfers } from '../../src/career/world/transfer.js';
import { validateModelName } from '../../src/career/sim/naming.js';
import { restoreHistory } from '../helpers/world_provider.mjs';

after(() => restoreHistory());

const DIMS = { knowledge: 70, reasoning: 70, coding: 70, writing: 70, math: 70, agent: 50, safety: 70 };
function setup({ pubBot = null } = {}) {
  const companies = [
    { name: '甲智能', brand: 'Jiaa', country: 'US', tier: 'specialist', kind: pubBot ? 'bot' : 'human', bot: pubBot ?? 'normal', stance: 'open_restricted' },
    { name: '乙智能', brand: 'Yiii', country: 'US', tier: 'specialist', kind: 'human' },
    { name: '丙智能', brand: 'Bing', country: 'CN', tier: 'specialist', kind: 'bot' },
  ];
  const w = E.createWorld({ seed: 9, start: '2024-01', days: 800, companies });
  const [A, B] = Object.values(w.companies).sort((a, b) => a.seat - b.seat);
  const { meta } = appendRelease(w, { family: A.id, org: A.id, modelId: 'pub1', date: w.day.slice(0, 7), day: w.day, name: 'Jiaa Open 1', cls: 'large', open: true, license: 'restrictive', price: 'standard', dims: DIMS, q: 70 });
  return { w, A, B, relId: meta.relId };
}
// 乙的一款模型：kind = 'finetune'（在甲的权重上续训）或 'distill'（掺了甲的蒸馏数据）。
function studentModel(env, kind, name) {
  const { B, A, relId } = env;
  const m = { id: `stu_${kind}`, name, stage: 'released', open: false, dims: { ...DIMS }, post: { own: 0, dist: 1, teachers: {} }, techs: [] };
  if (kind === 'finetune') { m.lineage = { kind: 'finetune', relId, fam: A.id }; m.post.teachers[A.id] = 1; }
  else m.post.teachers[A.id] = 1;
  (B.s.data.teachers ??= {})[A.id] = { relId, name: 'Jiaa Open 1', day: env.w.day, dims: { ...DIMS }, q: 70, kind: 'weights', license: 'LR' };
  B.s.models.push(m);
  return m;
}
const freshOf = (env, c, m, relName = m.name) => {
  const { meta } = appendRelease(env.w, { family: c.id, org: c.id, modelId: m.id, date: env.w.day.slice(0, 7), day: env.w.day, name: relName, cls: 'large', open: false, dims: m.dims, q: 70 });
  return [{ c, m, meta }];
};
// 世界市场表里塞一行 API 份额（月底读它）。
const setShare = (env, org, share) => {
  env.w.market.table.test = { product: 'api', region: 'global', day: env.w.day, rows: [{ org, share }, { org: 'x', share: 1 - share }] };
};

describe('受限开源条款（M.5.3）', () => {
  it('条款只认三项布尔值，缺的按默认全勾；setLicenseTerms 只在自洽世界里有', () => {
    assert.deepEqual(normTerms(undefined), DEFAULT_TERMS);
    assert.deepEqual(normTerms({ royalty: false }), { attrib: true, royalty: false, noCompete: true });
    assert.throws(() => normTerms({ royalty: 'no' }), /只能是 true 或 false/);
    assert.throws(() => normTerms({ evil: true }), /只有/);
    const env = setup();
    const r = E.applyCommand(env.A.s, { name: 'setLicenseTerms', args: { terms: { noCompete: false } } });
    assert.ok(r.ok, r.err);
    assert.equal(env.A.s.licenseTerms.noCompete, false);
    const bad = E.applyCommand(env.A.s, { name: 'setLicenseTerms', args: { terms: { noCompete: 1 } } });
    assert.equal(bad.ok, false);
    assert.equal(env.A.s.licenseTerms.noCompete, false, '被拒的命令不改状态');
    restoreHistory();
    const h = E.createGame('qwen', 'y2024');
    const hr = E.applyCommand(h, { name: 'setLicenseTerms', args: { terms: {} } });
    assert.equal(hr.ok, false);
    assert.match(hr.err, /只有自洽世界/);
  });

  it('受限开源发布那天登记条款（用发布方当时的设置）', () => {
    const env = setup();
    env.A.s.licenseTerms = normTerms({ royalty: false });
    const m = { id: 'pub2', name: 'Jiaa Open 2', open: true, license: 'restrictive', dims: { ...DIMS } };
    const fresh = freshOf(env, env.A, m);
    fresh[0].meta.license = 'restrictive';
    licenseClose(env.w, env.w.day, fresh);
    assert.deepEqual(env.w.ix.terms[fresh[0].meta.relId], { attrib: true, royalty: false, noCompete: true, org: env.A.id });
  });

  it('拿受限开源模型做蒸馏算违约：困难电脑发布方当场起诉，原告是发布方公司', () => {
    const env = setup({ pubBot: 'hard' });
    const m = studentModel(env, 'distill', 'Jiaa Mini');
    assert.deepEqual(lrLinks(env.w, env.B.s, m).map(l => l.kind), ['distill']);
    const out = licenseClose(env.w, env.w.day, freshOf(env, env.B, m));
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].why, ['noCompete']);
    assert.equal(out[0].choice, 'sue');
    const card = env.B.s.queue.find(q => q.id === 'lawsuit' && q.params.type === 'license');
    assert.ok(card, '学生收到许可官司');
    assert.equal(card.params.vendorOrg, env.A.id);
  });

  it('真人发布方收到违约卡；没署名的续训衍生也算违约', () => {
    const env = setup();
    const m = studentModel(env, 'finetune', 'Yiii Pro');
    const out = licenseClose(env.w, env.w.day, freshOf(env, env.B, m));
    assert.deepEqual(out[0].why, ['attrib']);
    const card = env.A.s.queue.find(q => q.kind === 'license_breach');
    assert.ok(card);
    const view = E.currentEvent(env.A.s, env.A.s.queue.indexOf(card));
    assert.deepEqual(view.choices.map(c => c.id), ['sue', 'pass']);
  });

  it('署名衍生：命名放行发布方品牌词开头，别人不行；登记成衍生，不算违约', () => {
    const env = setup();
    const m = studentModel(env, 'finetune', 'Jiaa Remix');
    assert.ok(validateModelName(env.B.s, 'Jiaa Remix', { modelId: m.id }).ok, '衍生可以用发布方品牌词开头');
    const other = { id: 'plain', name: 'x', stage: 'training', dims: { ...DIMS }, post: { teachers: {} } };
    env.B.s.models.push(other);
    assert.equal(validateModelName(env.B.s, 'Jiaa Other', { modelId: other.id }).ok, false, '不是衍生就不能用');
    const fresh = freshOf(env, env.B, m);
    const out = licenseClose(env.w, env.w.day, fresh);
    assert.equal(out.length, 0);
    assert.ok(env.w.ix.derivs[env.A.id][fresh[0].meta.relId]);
    assert.equal(fresh[0].meta.basedOn, env.A.id);
    assert.ok(env.w.news.some(n => n.title.includes('署名衍生')));
  });

  it('月底：署名衍生份额 ≥ 0.5% 给发布方品牌 ×1.01，每家累计封顶 ×1.10；份额 ≥ 15% 付 5% 客户收入，入账六成', () => {
    const env = setup();
    const { w, A, B } = env;
    const m = studentModel(env, 'finetune', 'Jiaa Remix');
    licenseClose(w, w.day, freshOf(env, B, m));
    B.s.live = m.id;
    B.s.history.push({ date: w.day.slice(0, 7), revenue: 2e7, costs: 1e7, rev: { api: 1.5e7, chat: 5e6 } });
    setShare(env, B.id, 0.2);
    const brand0 = A.s.brand, cashA = A.s.cash, cashB = B.s.cash;
    const out = licenseMonth(w, w.day);
    assert.ok(Math.abs(A.s.brand / brand0 - T.brandStep) < 1e-9, `品牌 ×${A.s.brand / brand0}`);
    assert.equal(out.length, 1);
    assert.equal(out[0].usd, 2e7 * T.royalty);
    assert.equal(cashB - B.s.cash, 2e7 * T.royalty);
    settleTransfers(w, w.day);
    assert.ok(Math.abs(A.s.cash - cashA - 2e7 * T.royalty * TRANSFER.BOOK) < 1e-6);
    assert.ok(w.ix.public.some(x => x.type === 'royalty' && x.from === B.id && x.to === A.id), '公开可查');
    // 同一款只加一次品牌；再登记 15 款衍生，累计不超过 ×1.10。
    for (let i = 0; i < 15; i++) {
      const mm = { ...m, id: `stu_f${i}`, name: `Jiaa Remix ${i + 2}` };
      B.s.models.push(mm);
      licenseClose(w, w.day, freshOf(env, B, mm));
      B.s.live = mm.id;
      licenseMonth(w, w.day);
    }
    assert.ok(A.s.brand / brand0 <= T.brandCap + 1e-9, `累计 ×${A.s.brand / brand0}`);
    assert.ok(A.s.brand / brand0 > T.brandCap - 1e-6);
  });

  it('份额不够就不加品牌、不分成；不要求分成的条款不收钱', () => {
    const env = setup();
    const { w, A, B } = env;
    const m = studentModel(env, 'finetune', 'Jiaa Remix');
    licenseClose(w, w.day, freshOf(env, B, m));
    B.s.live = m.id;
    B.s.history.push({ date: w.day.slice(0, 7), revenue: 2e7, costs: 1e7, rev: { api: 2e7 } });
    setShare(env, B.id, 0.001);
    const brand0 = A.s.brand;
    assert.equal(licenseMonth(w, w.day).length, 0);
    assert.equal(A.s.brand, brand0);
  });
});
