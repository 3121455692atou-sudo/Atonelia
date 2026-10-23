#!/usr/bin/env node
// M2 验收（规格 M.5.9、F2 M2 行 ⑤、F4a）的两个脚本，测试和命令行共用：
//   - 小号送钱：一个同档小号用全部转钱渠道（闭源 API 蒸馏、被查出后转授权或吃官司、炒主号的股票、往租卡池里租卡抬现货价，
//     再加上融资拿钱、最后故意破产）给主号送 2 年钱。主号身家比“小号什么都不做”时最多高 10%，送钱效率（主号身家增量 ÷ 小号身家损失）≤ 30%。
//   - 只买卡出租：一家公司只买卡、全部挂出去出租，不练模型。两年后身家排不进前一半。
//   node scripts/alt_account.mjs [--seeds 3] [--days 730]
import * as E from '../src/career/engine.js';
import { fundingOffers } from '../src/career/sim/capital.js';
import { gpuCount } from '../src/career/sim/model.js';
import { gpuOrderInfo } from '../src/career/sim/compute.js';
import { addDays } from '../src/career/sim/clock.js';
import { paidBetween } from '../src/career/world/transfer.js';
import { restoreHistory } from '../tests/helpers/world_provider.mjs';

const BOTS = [
  { name: '晨星智能', brand: '晨星', country: 'CN' },
  { name: '蓝鲸智能', brand: '蓝鲸', country: 'EU' },
  { name: '泰拉智能', brand: '泰拉', country: 'US' },
  { name: '流光智能', brand: '流光', country: 'CN' },
  { name: '山巅智能', brand: '山巅', country: 'EU' },
];
const cmd = (s, name, args = {}) => E.applyCommand(s, { name, args });
// 真人的卡：picks 里有的按它选，否则选第一个能选的（顾问的默认）。
function clear(s, picks = {}) {
  for (let g = 0; g < 50 && s.status === 'playing' && s.queue.length; g++) {
    const ev = E.currentEvent(s);
    const want = picks[ev.kind] ?? picks[ev.id];
    const ch = (want && ev.choices.find(x => x.id === want && !x.disabled)) || ev.choices.find(x => !x.disabled) || ev.choices[0];
    try { E.resolveEvent(s, ch.id); } catch { s.queue.shift(); }
  }
}
// 顾问驱动（和 selfplay_calibrate 的大按钮真人同一套）：照第一条建议做，最多 30 步。
function followAdvice(s) {
  clear(s);
  const seen = new Map();
  for (let k = 0; k < 30 && s.status === 'playing'; k++) {
    let a;
    try { [a] = E.advise(s); } catch { break; }
    if (!a) break;
    if (a.kind === 'event') { clear(s); continue; }
    if (a.kind !== 'jobs' && (seen.get(a.id) || 0) >= 3) break;
    seen.set(a.id, (seen.get(a.id) || 0) + 1);
    try { E.applyAdvice(s, a); } catch { break; }
    if (a.kind === 'jobs') break;
  }
}

// ---------- 小号送钱 ----------
// send：小号这一局是送钱（true），还是什么都不做（false，当“没有小号”的对照）。主号两局的做法完全一样。
// bot：其余电脑公司的难度。对照两局时用被动档（只跑日常，不立项不送评），世界本身的蝴蝶效应小，差额才看得出是送钱造成的。
export function runAlt({ seed = 1, days = 730, start = '2024-01', send = true, bot = 'passive', tier = 'specialist' } = {}) {
  const companies = [
    { name: '主号智能', brand: '主号', country: 'US', tier, kind: 'human', stance: 'closed' },
    { name: '小号智能', brand: '小号', country: 'US', tier, kind: 'human', stance: 'open' },
    ...BOTS.map(b => ({ ...b, tier: 'specialist', kind: 'bot', bot })),
  ];
  const w = E.createWorld({ seed, start, days, companies });
  const [main, alt] = Object.values(w.companies).sort((a, b) => a.seat - b.seat);
  w.alt0 = E.finalWealth(w, alt.s);                    // 小号开局身家：送钱效率的分母（小号整个牺牲掉）
  // 主号：顾问驱动；API 标价拉到最高一档、三成卡挂出去出租；查出小号蒸馏，第一次收授权费（之后每包 ×3），再查出就起诉。
  let mainAt = w.day, altAt = w.day;
  const mainPicks = () => ({ distill_caught: Object.values(w.ix.pairs).some(p => p.licensed) ? 'sue' : 'license' });
  for (let d = 0; d < days && w.day <= w.end; d++) {
    if (main.s.status === 'playing') {
      clear(main.s, mainPicks());
      if (w.day >= mainAt) {
        followAdvice(main.s);
        clear(main.s, mainPicks());
        if (main.s.products?.api) cmd(main.s, 'setTier', { id: 'api', tier: 'premium' });
        if (main.s.products?.gpu_lease) cmd(main.s, 'setLease', { n: Math.floor(gpuCount(main.s) * 0.3) });
        mainAt = addDays(w.day, 7);
      }
    }
    if (alt.s.status === 'playing') {
      // 小号的卡：官司一律和解（付 45%），封号卡承认；没送钱的对照局也一样处理卡片。
      clear(alt.s, { lawsuit: 'settle', distill_ban: 'admit' });
      if (send && w.day >= altAt) {
        altSend(w, alt, main);
        clear(alt.s, { lawsuit: 'settle', distill_ban: 'admit' });
        altAt = addDays(w.day, 1);
      }
    }
    const t = w.tick();
    if (t.paused) { clear(main.s, mainPicks()); clear(alt.s, { lawsuit: 'settle', distill_ban: 'admit' }); }
  }
  const out = {
    seed, send, day: w.day, alt0: w.alt0,
    mainW: E.finalWealth(w, main.s), altW: E.finalWealth(w, alt.s), mainEq: main.s.equity, mainListed: !!w.exchange?.listings?.[main.id],
    paid: paidBetween(w, alt.id, main.id),
    booked: (w.ix.recent || []).filter(t => t.from === alt.id && t.to === main.id).reduce((a, t) => a + t.booked, 0),
    packs: Object.values(w.ix.pairs[`${alt.id}|${main.id}`]?.packs || {}).reduce((a, b) => a + b, 0),
    cases: Object.values(w.ix.cases).filter(c => c.stu === alt.id).map(c => c.choice ?? c.status),
    restr: w.ix.restr[alt.id] ? { count: w.ix.restr[alt.id].count, liquidated: !!w.ix.restr[alt.id].liquidated } : null,
    altStatus: alt.s.status,
  };
  restoreHistory();
  return out;
}
// 小号每天能做的所有送钱动作。
function altSend(w, alt, main) {
  const s = alt.s;
  // 1) 闭源 API 蒸馏主号：能买就买（大客户账号，被查出的机会大一些，查出以后主号转授权就按 3 倍收）。
  cmd(s, 'decide', { action: 'data', id: `distill:${main.id}:api` });
  // 2) 融资拿钱：小号不在乎稀释，能融就融，融来的钱接着送。
  const offers = fundingOffers(s);
  if (offers.length && !s.capital?.round) cmd(s, 'startFunding', { dilution: offers.at(-1).dilution });
  // 3) 主号上市了就每天买它的股票（抬价），送不到主号手里，只会亏在手续费和滑点上。
  if (w.exchange?.listings?.[main.id]) cmd(s, 'stockBuy', { ticker: main.id, usd: Math.max(1, s.cash * 0.05) });
  // 4) 往租卡池里租卡：抬现货价，主号出租的卡收得多一点（钱付给池子，不直接给主号）。
  if (s.day.endsWith('-01')) {
    for (const id of ['H100', 'H800', 'A100']) {
      const info = gpuOrderInfo(s, id, true);
      if (info.left > 0 && s.cash > info.price * info.left) { cmd(s, 'buyGpu', { id, n: info.left, rent: true }); break; }
    }
  }
  // 5) 故意破产：不赚钱、一直花，现金连续 60 天为负就重组（债权人卖卡、增发补钱），再负 60 天清算。
}

// ---------- 只买卡出租 ----------
export function runLessor({ seed = 1, days = 730, start = '2024-01' } = {}) {
  const companies = [
    { name: '包租婆智能', brand: '包租', country: 'US', tier: 'specialist', kind: 'human' },
    ...BOTS.map(b => ({ ...b, tier: 'specialist', kind: 'bot', bot: 'normal' })),
  ];
  const w = E.createWorld({ seed, start, days, companies });
  const [me] = Object.values(w.companies).sort((a, b) => a.seat - b.seat);
  for (let d = 0; d < days && w.day <= w.end; d++) {
    const s = me.s;
    if (s.status === 'playing') {
      clear(s);
      // 每月初：留 3 个月开销，其余现金全买卡（配额以内），手里的卡全部挂出去。
      if (s.day.endsWith('-01') || d === 0) {
        const keep = 3 * Math.max(0, s.history.at(-1)?.costs || 0);
        for (const id of ['H100', 'H800', 'A100', 'H20', 'B200']) {
          const info = gpuOrderInfo(s, id, false);
          const n = Math.min(info.left, Math.floor((s.cash - keep) / Math.max(1, info.price || 1)));
          if (n > 0) cmd(s, 'buyGpu', { id, n });
        }
      }
      if (s.products?.gpu_lease) cmd(s, 'setLease', { n: gpuCount(s) });
    }
    const t = w.tick();
    if (t.paused) clear(me.s);
  }
  const live = Object.values(w.companies).filter(c => c.s);
  const ranks = live.map(c => ({ id: c.id, name: c.name, w: E.finalWealth(w, c.s) })).sort((a, b) => b.w - a.w);
  const rank = ranks.findIndex(x => x.id === me.id) + 1;
  const out = { seed, rank, n: ranks.length, wealth: ranks.map(x => [x.name, Math.round(x.w / 1e6)]), cards: gpuCount(me.s), status: me.s.status };
  restoreHistory();
  return out;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const argv = process.argv.slice(2);
  const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? Number(argv[i + 1]) : d; };
  const SEEDS = arg('--seeds', 3), DAYS = arg('--days', 730);
  const BOT = argv.includes('--normal') ? 'normal' : 'passive';
  const TIER = argv.includes('--small') ? 'small' : argv.includes('--major') ? 'major' : 'specialist';
  for (let seed = 1; seed <= SEEDS; seed++) {
    const base = runAlt({ seed, days: DAYS, send: false, bot: BOT, tier: TIER });
    const sent = runAlt({ seed, days: DAYS, send: true, bot: BOT, tier: TIER });
    const gain = sent.mainW - base.mainW;
    const direct = sent.booked * sent.mainEq * (sent.mainListed ? 1 : 0.8);
    console.log(`种子 ${seed} 小号送钱（其余电脑 ${BOT}）：主号身家 ${(base.mainW / 1e6).toFixed(0)}M → ${(sent.mainW / 1e6).toFixed(0)}M（${(100 * gain / base.mainW).toFixed(2)}%；入账直接带来 ${(100 * direct / sent.mainW).toFixed(2)}%），小号开局身家 ${(sent.alt0 / 1e6).toFixed(0)}M、对照局末 ${(base.altW / 1e6).toFixed(0)}M、送钱局末 ${(sent.altW / 1e6).toFixed(0)}M；效率（÷ 小号开局身家）${(Math.max(0, gain) / sent.alt0).toFixed(3)}；付 ${(sent.paid / 1e6).toFixed(1)}M、入账 ${(sent.booked / 1e6).toFixed(1)}M，${sent.packs} 包，案子 ${JSON.stringify(sent.cases)}，小号 ${JSON.stringify(sent.restr)} ${sent.altStatus}`);
    const L = runLessor({ seed, days: DAYS });
    console.log(`种子 ${seed} 只买卡出租：第 ${L.rank}/${L.n} 名，${L.cards} 张卡；身家（百万）${JSON.stringify(L.wealth)}`);
  }
}
