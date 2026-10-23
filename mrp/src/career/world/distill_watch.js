// 闭源 API 蒸馏：限流、付费、检测、指控（规格 M.5.1、M.5.2）。只有自洽和联机读，史实模式不碰。
// 学生这边（白天）经 SimProvider 调：能不能买（封号、每年 2 个包、重组冻结）、一包多少钱、下单记包数、每天付钱时记抽取量。
// 老师那边（收盘）：按“学生—老师—订单”逐对掷检测，查出来就给老师一张四选一的卡（电脑公司当场按难度选）。
// 只有真的做了 API 蒸馏才可能被查出：检测只看当天真实的抽取记录，没有任何替身事件。
import { DISTILL_WATCH as W, TRANSFER } from '../data/exchange.js';
import { GEN } from '../data/balance.js';
import { PRICE_TIERS } from '../data/core.js';
import { FAMILIES } from '../data/rivals.js';
import { VALUE_SELF } from '../data/selfplay.js';
import { clamp, hash01, fmtMoney } from '../sim/util.js';
import { addDays, daysBetween } from '../sim/clock.js';
import { applyEffects } from '../sim/effects.js';
import { openCase } from '../sim/legal.js';
import { registerKind } from '../sim/queue.js';
import { log } from '../sim/log.js';
import { P } from '../sim/provider.js';
import { qOf } from '../sim/sota.js';
import { ensureIx, orgOfFam, moneyFrozen, queueTransfer, newbieDays } from './transfer.js';
import { isListed, newsShock } from './exchange.js';

const PACK_TOK = GEN.packGTok * 1e9;
export const CHOICES = ['ban', 'accuse', 'sue', 'license'];
const nameOf = (world, org) => world.companies?.[org]?.name || FAMILIES[org]?.company || org;
const yearOf = day => day.slice(0, 4);

export function pairOf(world, stu, tea) {
  const ix = ensureIx(world);
  return (ix.pairs[`${stu}|${tea}`] ??= { packs: {}, tok: 0, paid: 0, orders: {}, ban: null, licensed: false, caught: 0 });
}
const peekPair = (world, stu, tea) => world.ix?.pairs?.[`${stu}|${tea}`] ?? null;

// ---------- 学生这边（白天） ----------
// 现在能不能从这家买 API 数据包。返回中文原因，能买时为 null。
export function apiBlock(world, s, fam) {
  const stu = s.charId;
  const tea = orgOfFam(world, fam);
  if (!tea) return '这家公司不在场，没有能调用的 API';
  if (world.settings?.distill === false) return '这一局房主关了闭源 API 蒸馏';
  const mine = moneyFrozen(world, stu, s.day);
  if (mine) return mine;
  if (moneyFrozen(world, tea, s.day)) return '对方在重组冻结期，不对外卖 API';
  const p = peekPair(world, stu, tea);
  if (p?.ban && daysBetween(s.day, p.ban) > 0) return `对方封了你们的号（到 ${p.ban}）`;
  if ((p?.packs?.[yearOf(s.day)] || 0) >= TRANSFER.API_PACKS) return `对方限流：今年已经买了 ${TRANSFER.API_PACKS} 个包`;
  return null;
}
export const apiBanned = (world, s, fam) => {
  const tea = orgOfFam(world, fam);
  const p = tea ? peekPair(world, s.charId, tea) : null;
  return !!(p?.ban && daysBetween(s.day, p.ban) > 0);
};
// 一包的价钱：按老师现在的 API 价格档；转成正规授权后按标准价的 3 倍（谈出来的固定价，不再叠价格档）；分散小号多花 40%。
export function apiPackCost(world, s, fam, base, acct = 'big') {
  const tea = orgOfFam(world, fam);
  const t = tea ? world.companies[tea]?.s : null;
  const tier = t?.products?.api?.tier || 'standard';
  const p = tea ? peekPair(world, s.charId, tea) : null;
  const price = p?.licensed ? base * W.FX.license : base * (PRICE_TIERS[tier]?.mult ?? 1);
  return price * (acct === 'spread' ? W.SPREAD_COST : 1);
}
// 界面读数：一个包（14 天）被查出的概率；今年还能从这家买几包。
export function apiRisk(world, s, fam, acct = 'big') {
  const tea = orgOfFam(world, fam);
  const t = tea ? world.companies[tea]?.s : null;
  const p = detectP(PACK_TOK / GEN.apiDays, acct, t?.service?.antiDistill === 'strict');
  return 1 - (1 - p) ** GEN.apiDays;
}
export function apiPacksLeft(world, s, fam) {
  const tea = orgOfFam(world, fam);
  if (!tea) return 0;
  return Math.max(0, TRANSFER.API_PACKS - (peekPair(world, s.charId, tea)?.packs?.[yearOf(s.day)] || 0));
}
// 下单：记这一对今年的包数，订单上记老师公司、账号方式、是否正规授权。
export function apiOrderPlaced(world, s, o, acct = 'big') {
  const tea = orgOfFam(world, o.teacher);
  if (!tea) return;
  const p = pairOf(world, s.charId, tea);
  const y = yearOf(s.day);
  p.packs[y] = (p.packs[y] || 0) + 1;
  o.teacherOrg = tea;
  o.acct = acct === 'spread' ? 'spread' : 'big';
  if (p.licensed) o.licensed = true;
}
// 每天付钱（orders.js genTick 的 API 分支）：付给老师（收盘入账六成），记抽取量；没授权、没被查出的才进当天的检测名单。
export function apiDistillDay(world, s, o, pay) {
  const tea = o.teacherOrg || orgOfFam(world, o.teacher);
  if (!tea || !(pay > 0)) return;
  queueTransfer(world, s.charId, tea, pay, o.licensed ? 'license' : 'api');
  const ix = ensureIx(world);
  const p = pairOf(world, s.charId, tea);
  // 抽取量按天算：一个包 GEN.apiDays 天抽完（转成授权后价钱变了，抽的速度不变）。
  const tok = PACK_TOK / Math.max(1, o.gen.days || GEN.apiDays);
  const rec = (p.orders[o.id] ??= { tok: 0, paid: 0 });
  rec.tok += tok; rec.paid += pay;
  p.tok += tok; p.paid += pay;
  if (!o.licensed && !o.gen.caught) (ix.today ??= []).push({ stu: s.charId, tea, oid: o.id, tok, acct: o.acct || 'big' });
}

// ---------- 检测（收盘） ----------
// p(当天) = BASE × √(当天抽取 token ÷ 10 亿) × 集中度 × 账号 × 对方防蒸馏档。
export function detectP(tok, acct, strict) {
  return W.BASE * Math.sqrt(Math.max(0, tok) / W.TOK) * W.FOCUS * (acct === 'spread' ? W.SPREAD : W.BIG) * (strict ? W.STRICT : 1);
}
export function watchClose(world, day = world.day) {
  const ix = ensureIx(world);
  const today = (ix.today || []).sort((a, b) => (a.stu + a.tea + a.oid < b.stu + b.tea + b.oid ? -1 : 1));
  ix.today = [];
  const out = [];
  for (const e of today) {
    const t = world.companies[e.tea]?.s;
    const stu = world.companies[e.stu]?.s;
    if (!t || !stu) continue;
    const o = (stu.orders || []).find(x => x.id === e.oid);
    if (o?.gen?.caught) continue;
    const p = detectP(e.tok, e.acct, t.service?.antiDistill === 'strict');
    if (!(hash01(`${world.seed}|watch|${day}|${e.stu}|${e.tea}|${e.oid}`) < p)) continue;
    out.push(openWatchCase(world, e, day, o));
  }
  // 新手保护期满的案子，今天交给老师。
  for (const c of Object.values(ix.cases)) if (c.status === 'held' && day >= c.hold) deliver(world, c, day);
  return out;
}

function openWatchCase(world, e, day, o) {
  const ix = ensureIx(world);
  const id = `dc${++ix.caseSeq}`;
  const stuC = world.companies[e.stu];
  // 新手保护（M.5.7）：检测照常、记账照常，学生进场满 120 天后才交给老师处置。
  const hold = addDays(stuC.joined || world.startDay, newbieDays(world));
  const c = { id, day, stu: e.stu, tea: e.tea, oid: e.oid, fam: o?.teacher ?? null, acct: e.acct, status: day < hold ? 'held' : 'open', hold, choice: null, decided: null, ratio: null };
  ix.cases[id] = c;
  if (o?.gen) o.gen.caught = id;
  pairOf(world, e.stu, e.tea).caught += 1;
  if (c.status === 'open') deliver(world, c, day);
  return c;
}
function deliver(world, c, day) {
  c.status = 'open';
  const teaC = world.companies[c.tea];
  if (!teaC?.s || teaC.s.status !== 'playing') { c.status = 'dropped'; return; }
  if (teaC.kind === 'bot') return resolveCase(world, c.id, botChoice(world, c));
  teaC.s.queue.push({ kind: 'distill_caught', id: c.id, params: { case: c.id, stu: c.stu, stuName: nameOf(world, c.stu), day } });
  return null;
}

// 抽取比例 = 这一单抽走的 token ÷ 一个整包（封顶 1）。
export function caseRatio(world, c) {
  const rec = peekPair(world, c.stu, c.tea)?.orders?.[c.oid];
  return clamp((rec?.tok || 0) / PACK_TOK, 0, 1);
}
const casePaid = (world, c) => peekPair(world, c.stu, c.tea)?.orders?.[c.oid]?.paid || 0;

// 电脑老师怎么选（确定性，规格 M.3.12 的难度表）：简单、普通、被动档封号不声张；证据不足一律封号；
// 困难档在对方已经抽满一个数据包（这一对累计）、而且在线旗舰离自己 5 分以内时公开指控，否则收授权费。
export const RIVAL_GAP = 5;
export function botChoice(world, c) {
  const t = world.companies[c.tea], st = world.companies[c.stu]?.s;
  const weak = caseRatio(world, c) < W.EVID_FRAC;
  if (weak || !t?.s || !st || t.bot !== 'hard') return 'ban';
  const full = (peekPair(world, c.stu, c.tea)?.tok || 0) >= PACK_TOK - 1;
  const qt = liveQ(t.s), qs = liveQ(st);
  return full && qt !== null && qs !== null && Math.abs(qt - qs) <= RIVAL_GAP ? 'accuse' : 'license';
}
const liveQ = s => { const m = (s.models || []).find(x => x.id === s.live); return m ? qOf('llm', m.dims) : null; };

// 老师的选择（M.5.2 的四个分支）。效果按抽取比例；分散小号按欺诈处理，后果加倍。
// 封号、指控、起诉都会掐掉这家在老师那里的 API（订单作废、已付的不退、180 天内不能再买）；收授权费是唯一能接着用的。
export function resolveCase(world, caseId, choice) {
  const ix = ensureIx(world);
  const c = ix.cases[caseId];
  if (!c) throw new Error('没有这起蒸馏案子');
  if (c.status !== 'open') throw new Error('这起案子已经处理过了');
  if (!CHOICES.includes(choice)) throw new Error(`只能选 ${CHOICES.join('、')}`);
  const stuC = world.companies[c.stu], teaC = world.companies[c.tea];
  const st = stuC?.s, t = teaC?.s;
  const day = world.day;
  const ratio = caseRatio(world, c);
  const weak = ratio < W.EVID_FRAC;
  const mult = c.acct === 'spread' ? 2 : 1;
  const pair = pairOf(world, c.stu, c.tea);
  c.status = 'done'; c.choice = choice; c.decided = day; c.ratio = Math.round(ratio * 1000) / 1000;
  const stuName = nameOf(world, c.stu), teaName = nameOf(world, c.tea);
  const out = { choice, ratio, weak, note: '' };
  if (!st || st.status !== 'playing') { out.note = `${stuName} 已经不在场了。`; return out; }

  if (choice === 'license') {
    // 转成正规授权：接着用，价格 ×3，从此不算违约（仍受每年 2 个包的上限）。
    pair.licensed = true;
    for (const o of st.orders || []) {
      if (o.kind !== 'distill' || o.gen?.mode !== 'api' || o.teacherOrg !== c.tea || o.licensed) continue;
      o.licensed = true;
      o.gen.cost = o.gen.paid + (o.gen.cost - o.gen.paid) * W.FX.license;
    }
    if (c.fam) delete st.data.risky[`tos_${c.fam}`];
    st.queue.push({ kind: 'notice', title: `${teaName} 要求转成正规授权`, text: `${teaName} 发现你们在用他们的 API 批量生成训练数据。对方没有声张，改成正规授权：可以接着用，价格是原来的 ${W.FX.license} 倍，每年仍然最多 ${TRANSFER.API_PACKS} 个包。` });
    log(st, `${teaName} 把 API 蒸馏转成正规授权，价格 ×${W.FX.license}`);
    out.note = `${stuName} 接受了正规授权，之后的数据包按 ${W.FX.license} 倍收费。`;
    return out;
  }

  // 其余三种：先掐断 API。
  cutOff(world, st, c, pair, day);
  if (choice === 'ban') {
    out.note = `${stuName} 在你们这里的 API 订单作废，${W.FX.ban} 天内不能再买。`;
  } else if (choice === 'accuse') {
    if (weak) {
      // 证据不足：抽取不到 0.25 个包，指控方反被说小题大做。
      if (t) applyEffects(t, { rep: W.FX.backlash }, { source: 'world', id: 'distill_accuse' });
      out.note = `证据不足（只抽走了一个包的 ${Math.round(ratio * 100)}%），舆论觉得你们小题大做，口碑 ${W.FX.backlash}。`;
    } else {
      const k = ratio * mult;
      applyEffects(st, { rep: W.FX.rep * k }, { source: 'world', id: 'distill_accused' });
      // 上市的当场砸股价，未上市的记期待减项（都按比例）；两种都把 V 往下压一点，免得价值资金几天就把股价拉回去。
      if (isListed(world, c.stu)) newsShock(world, c.stu, Math.max(-0.5, W.FX.shock * k));
      vShock(st, day, Math.max(-0.5, W.FX.unlisted * k));
      markAccused(world, c);
      ix.public.push({ day, type: 'accuse', from: c.tea, to: c.stu, ratio: c.ratio, fraud: mult > 1 });
      world.news.unshift({ date: day.slice(0, 7), day, type: 'controversy', title: `${teaName} 公开指控 ${stuName} 蒸馏其模型`, detail: `${teaName} 公布了调用记录：对方${mult > 1 ? '用大量分散的小号' : '用大客户账号'}批量生成训练数据，约合一个数据包的 ${Math.round(ratio * 100)}%。` });
      out.note = `公开指控发出去了：${stuName} 口碑 ${Math.round(W.FX.rep * k * 10) / 10}，${isListed(world, c.stu) ? '股价' : '估值'}受挫。`;
    }
  } else if (choice === 'sue') {
    // 走现有的官司：索赔已付 API 费的 3 倍（欺诈再翻倍），赔款按 M.5.9 入账；证据不足时被告胜率高。
    const claim = Math.max(1e6, Math.round(casePaid(world, c) * W.FX.sue * mult));
    const ok = openCase(st, 'tos', { vendor: teaName, vendorOrg: c.tea, claim, ...(weak ? { winp: 0.8 } : {}) });
    out.note = ok ? `起诉书发出去了，索赔 ${fmtMoney(claim)}。` : `${stuName} 手上已经有一起同类官司，这次只封了号。`;
  }
  // 学生收到现有的封号卡：承认就丢掉这位老师的数据（D7 原样）。
  if (c.fam) st.queue.push({ kind: 'event', id: 'distill_ban', params: { vendor: teaName, family: c.fam } });
  return out;
}

function cutOff(world, st, c, pair, day) {
  st.orders = (st.orders || []).filter(o => !(o.kind === 'distill' && o.gen?.mode === 'api' && o.teacherOrg === c.tea && !o.licensed));
  pair.ban = addDays(day, W.FX.ban);
}
// 期待减项（规格 M.5.2）：折成估值池权重里的对数项，90 天线性衰减；除以 W_EXP，这样池子那一部分正好少这么多。
function vShock(s, day, pct) {
  (s.vShocks ??= []).push({ day, log: Math.log(1 + pct) / VALUE_SELF.W_EXP });
  s.vShocks = s.vShocks.filter(x => daysBetween(x.day, day) < VALUE_SELF.EXP_DAYS);
}
// 被指控的模型在榜单上挂标记：学生已经发布、血统里有这位老师的那几款；以后再发的也挂（收盘时 license.js 读 pair.accused）。
function markAccused(world, c) {
  const pair = pairOf(world, c.stu, c.tea);
  pair.accused = world.day;
  for (const m of Object.values(world.relMeta || {})) if (m.org === c.stu && (m.kin || []).some(k => k === c.tea || orgOfFam(world, k) === c.tea)) m.accused = c.tea;
}

// ---------- 老师收到的卡 ----------
registerKind('distill_caught', {
  known: (s, q) => !!P().world?.ix?.cases?.[q.id],
  view(s, q) {
    const world = P().world;
    const c = world?.ix?.cases?.[q.id];
    const ratio = c ? caseRatio(world, c) : 0;
    const weak = ratio < W.EVID_FRAC;
    const fraud = c?.acct === 'spread';
    const stu = q.params?.stuName || '一家公司';
    const pct = Math.round(ratio * 100);
    const paid = c ? casePaid(world, c) : 0;
    return {
      kind: 'distill_caught', tag: '蒸馏', title: `${stu} 在蒸馏你们的模型`,
      text: `风控查到 ${stu} ${fraud ? '用一批分散的小号' : '用大客户账号'}在批量调用你们的 API 生成训练数据，到现在约合一个数据包的 ${pct}%（付了 ${fmtMoney(paid)}）。${weak ? '抽走的量还不到四分之一个包，证据偏弱。' : ''}${fraud ? '用小号属于欺诈，追究起来后果加倍。' : ''}`,
      lines: [],
      choices: [
        { id: 'ban', label: '封号不声张', hint: `对方的订单作废、已付的钱不退，${W.FX.ban} 天内不能再买。` },
        { id: 'accuse', label: '公开指控', hint: weak ? '证据不足，指控方口碑 −2。' : `对方口碑和股价受挫（按抽取比例${fraud ? '，欺诈加倍' : ''}），它的模型在榜单上挂标记。` },
        { id: 'sue', label: '起诉', hint: `索赔已付 API 费的 ${W.FX.sue} 倍${fraud ? '再翻倍' : ''}，赔款入账六成。${weak ? '证据偏弱，胜算不大。' : ''}` },
        { id: 'license', label: '收授权费', hint: `转成正规授权：对方接着用，价格 ×${W.FX.license}，钱入账六成。` },
      ],
    };
  },
  resolve(s, q, choiceId) {
    const r = resolveCase(P().world, q.id, choiceId);
    return r.note;
  },
});
