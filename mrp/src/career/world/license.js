// 受限开源条款（规格 M.5.3）：open_restricted 路线（以及 delayed、open_family 放出来的受限许可旧模型）发布开源权重时勾的条款，默认全勾。
// - 署名：衍生模型的名字以发布方的品牌词开头（命名 C1 第 5 条对它放行）。每出一款 API 份额 ≥ 0.5% 的署名衍生，发布方品牌 ×1.01，每家累计最多 ×1.10；
//   真实发生的署名衍生给发布方发新闻（取代史实模式里 license_fork 那个随机替身）。
// - 大户分成：衍生方的 API 份额达到 15% 以后，每月把客户收入的 5% 付给发布方（共用月结之后转账，入账六成，公开可查）。
// - 禁止训练竞品：拿它做蒸馏就算违约。
// 违约（没署名、拿来蒸馏）在衍生模型发布那天由发布方发现，发布方可以打许可官司（CASES.license，被告胜率低）。
import { LICENSE_TERMS as T } from '../data/exchange.js';
import { FAMILIES } from '../data/rivals.js';
import { fmtMoney } from '../sim/util.js';
import { applyEffects } from '../sim/effects.js';
import { openCase } from '../sim/legal.js';
import { registerKind } from '../sim/queue.js';
import { log } from '../sim/log.js';
import { P } from '../sim/provider.js';
import { ensureIx, orgOfFam, moneyFrozen, queueTransfer } from './transfer.js';
import { apiShareOf } from './market.js';

export const DEFAULT_TERMS = Object.freeze({ attrib: true, royalty: true, noCompete: true });
const KEYS = Object.keys(DEFAULT_TERMS);
const nameOf = (world, org) => world.companies?.[org]?.name || FAMILIES[org]?.company || org;
const brandOf = (world, org) => world.companies?.[org]?.brand || '';

// 条款只认这三项布尔值；缺的按默认（全勾）。
export function normTerms(x) {
  if (x !== undefined && (x === null || typeof x !== 'object' || Array.isArray(x))) throw new Error('许可条款要是 { attrib, royalty, noCompete } 这样的对象');
  const out = { ...DEFAULT_TERMS };
  for (const [k, v] of Object.entries(x || {})) {
    if (!KEYS.includes(k)) throw new Error(`许可条款只有 署名（attrib）、大户分成（royalty）、禁止训练竞品（noCompete）：${k}`);
    if (typeof v !== 'boolean') throw new Error(`许可条款 ${k} 只能是 true 或 false`);
    out[k] = v;
  }
  return out;
}
// 命令 setLicenseTerms：之后发布的受限开源模型用这套条款（已经发出去的不变）。
export function setLicenseTerms(s, terms) {
  s.licenseTerms = normTerms(terms);
  const on = KEYS.filter(k => s.licenseTerms[k]).map(k => ({ attrib: '署名', royalty: '大户分成', noCompete: '禁止训练竞品' })[k]);
  log(s, `受限开源条款改为：${on.length ? on.join('、') : '一条都不勾'}`);
  return { kind: 'terms', terms: { ...s.licenseTerms } };
}

// 一款模型和受限开源老师的关系：续训（拿权重接着练）或者蒸馏（数据、小模型蒸馏）。只看受限许可（LR）的老师。
// → [{ fam, pub, relId, kind: 'finetune' | 'distill' }]
export function lrLinks(world, s, m) {
  if (!m) return [];
  const out = [];
  const seen = new Set();
  const add = (fam, kind, relId) => {
    if (!fam || fam === 'self' || seen.has(fam)) return;
    const rec = s.data?.teachers?.[fam];
    const lic = kind === 'finetune' && m.lineage?.relId ? (P().relById(m.lineage.relId)?.tags || []).find(t => t === 'LR') ?? rec?.license : rec?.license;
    if (lic !== 'LR') return;
    const pub = orgOfFam(world, fam);
    if (!pub || pub === s.charId) return;
    seen.add(fam);
    out.push({ fam, pub, relId: relId ?? rec?.relId ?? null, kind });
  };
  if (m.lineage?.kind === 'finetune') add(m.lineage.fam, 'finetune', m.lineage.relId);
  for (const [fam, x] of Object.entries(m.post?.teachers || {})) if (x > 0) add(fam, 'distill');
  if (m.distillation?.teacher?.id) add(m.distillation.teacher.id, 'distill', m.distillation.teacher.relId);
  return out;
}
const termsOf = (world, relId) => world.ix?.terms?.[relId] ?? DEFAULT_TERMS;
// 命名放行（C1 第 5 条）：这一款是哪几家的署名衍生，就可以用那几家的品牌词开头。
export function derivOrgs(world, s, modelId) {
  const m = (s?.models || []).find(x => x.id === modelId);
  return new Set(lrLinks(world, s, m).filter(l => termsOf(world, l.relId).attrib).map(l => l.pub));
}
const startsWithBrand = (name, brand) => !!brand && String(name).trim().toLowerCase().startsWith(String(brand).trim().toLowerCase());

// ---------- 收盘：当天的发布 ----------
// fresh：closeDay 的当天发布 [{ c, m, meta }]。受限开源发布记下条款；衍生发布检查违约、登记署名衍生。
export function licenseClose(world, day, fresh) {
  const ix = ensureIx(world);
  const out = [];
  for (const x of fresh) {
    const s = x.c.s;
    if (x.meta.license === 'restrictive' || (x.m.open && x.m.license === 'restrictive')) {
      ix.terms[x.meta.relId] = { ...normTerms(s.licenseTerms ?? undefined), ...(x.m.terms ? normTerms(x.m.terms) : {}), org: x.c.id };
    }
    for (const l of lrLinks(world, s, x.m)) {
      const terms = termsOf(world, l.relId);
      const why = [];
      if (l.kind === 'distill' && terms.noCompete) why.push('noCompete');
      const named = startsWithBrand(x.m.name, brandOf(world, l.pub));
      if (terms.attrib && !named) why.push('attrib');
      if (named || !terms.attrib) {
        // 署名衍生（或者不要求署名的衍生）：登记，月底按 API 份额给发布方加品牌、按大户分成收钱。
        (ix.derivs[l.pub] ??= {})[x.meta.relId] = { org: x.c.id, modelId: x.m.id, day, royalty: !!terms.royalty, credited: false, attributed: named };
        x.meta.basedOn = l.pub;
        if (named) world.news.unshift({ date: day.slice(0, 7), day, type: 'release', family: l.pub, title: `${x.c.name} 发布署名衍生 ${x.m.name}`, detail: `基于 ${nameOf(world, l.pub)} 的受限开源模型。` });
      }
      if (why.length) out.push(violation(world, x, l, why, day));
    }
  }
  return out;
}
function violation(world, x, l, why, day) {
  const pubC = world.companies[l.pub];
  const v = { day, pub: l.pub, org: x.c.id, relId: x.meta.relId, name: x.m.name, why };
  if (!pubC?.s || pubC.s.status !== 'playing') return v;
  if (pubC.kind === 'bot') {
    v.choice = botSue(world, pubC, x.c) ? 'sue' : 'pass';
    applyViolation(world, v, v.choice);
  } else {
    pubC.s.queue.push({ kind: 'license_breach', id: `lb_${x.meta.relId}`, params: v });
  }
  return v;
}
// 电脑发布方：困难档一律起诉；普通档对方比自己值钱的一半以上才起诉；其余放过。
function botSue(world, pubC, stuC) {
  if (pubC.bot === 'hard') return true;
  if (pubC.bot === 'normal') return (stuC.s?.valuation || 0) >= 0.5 * (pubC.s.valuation || 0);
  return false;
}
const WHY_TEXT = { noCompete: '拿受限开源模型做蒸馏（条款禁止训练竞品）', attrib: '衍生模型没有以发布方的品牌词开头' };
function applyViolation(world, v, choice) {
  const st = world.companies[v.org]?.s;
  if (choice !== 'sue' || !st || st.status !== 'playing') return '这次先不追究。';
  const pubName = nameOf(world, v.pub);
  const rev = Math.max(0, (st.history?.at(-1)?.revenue || 0) * 6);
  const claim = Math.max(5e6, Math.round(rev));
  const ok = openCase(st, 'license', { vendor: pubName, vendorOrg: v.pub, claim });
  return ok ? `起诉了：${v.why.map(k => WHY_TEXT[k]).join('；')}，索赔 ${fmtMoney(claim)}。` : '对方手上已经有一起同类官司，这次没能立案。';
}

// ---------- 月底：署名加品牌、大户分成 ----------
// 在共用月结之后跑（收盘那一步），读各家刚结完的这个月。
export function licenseMonth(world, day) {
  const ix = ensureIx(world);
  ix.brandGain ??= {};
  const out = [];
  for (const pub of Object.keys(ix.derivs).sort()) {
    const pubC = world.companies[pub];
    for (const [relId, d] of Object.entries(ix.derivs[pub]).sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const stC = world.companies[d.org];
      if (!stC?.s || stC.s.status !== 'playing') continue;
      const share = apiShareOf(world, d.org, day).share || 0;
      const live = isLive(stC.s, d.modelId);
      // 署名：份额够 0.5% 才算一款，给发布方品牌 ×1.01，累计封顶 ×1.10。
      if (d.attributed && !d.credited && live && share >= T.minShare && pubC?.s) {
        d.credited = true;
        const g = ix.brandGain[pub] ?? 1;
        const f = Math.min(T.brandStep, T.brandCap / g);
        if (f > 1 + 1e-9) {
          applyEffects(pubC.s, { brand: f }, { source: 'world', id: 'license_attrib' });
          ix.brandGain[pub] = g * f;
        }
      }
      // 大户分成：衍生方份额 ≥ 15%，按上个月的客户收入付 5%。
      if (d.royalty && live && share >= T.bigShare && !moneyFrozen(world, d.org, day)) {
        const month = monthCustomer(stC.s);
        const amt = Math.round(month * T.royalty);
        if (amt > 0) {
          stC.s.cash -= amt;
          queueTransfer(world, d.org, pub, amt, 'royalty');
          ix.public.push({ day, type: 'royalty', from: d.org, to: pub, usd: amt, relId });
          if (ix.public.length > 300) ix.public.splice(0, ix.public.length - 300);
          log(stC.s, `受限开源分成：付给 ${nameOf(world, pub)} ${fmtMoney(amt)}`);
          out.push({ from: d.org, to: pub, usd: amt });
        }
      }
    }
  }
  return out;
}
// 衍生模型还在线上（在线旗舰或在线小模型）。
const isLive = (s, modelId) => s.live === modelId || s.smallLive === modelId;
// 刚结完的这个月的客户收入（对话、订阅、API、Coding Plan）。
function monthCustomer(s) {
  const row = s.history?.at(-1);
  if (!row) return 0;
  return ['chat', 'subscription', 'api', 'coding_plan'].reduce((a, k) => a + (row.rev?.[k] || 0), 0);
}

// ---------- 发布方收到的违约卡 ----------
registerKind('license_breach', {
  view(s, q) {
    const world = P().world;
    const v = q.params || {};
    const who = world ? nameOf(world, v.org) : v.org;
    return {
      kind: 'license_breach', tag: '许可', title: `${who} 违反了你们的开源许可`,
      text: `${who} 发布的「${v.name}」用了你们受限开源的模型：${(v.why || []).map(k => WHY_TEXT[k]).join('；')}。可以打许可官司（条款白纸黑字，对方胜算不大，赔款入账六成），也可以先不追究。`,
      lines: [],
      choices: [
        { id: 'sue', label: '起诉', hint: '按对方近半年的收入索赔，赔款入账六成。' },
        { id: 'pass', label: '先不追究', hint: '不花律师费，也不得罪人。' },
      ],
    };
  },
  resolve(s, q, choiceId) {
    return applyViolation(P().world, q.params || {}, choiceId);
  },
});
