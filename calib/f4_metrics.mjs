// P2.4 门禁（照 G2 的脚本；生成订单那条改读作业表，另加训练作业几组统计：评测档、送评、检修、试验、原地打转）：在 calibrate 同一批对局上（每家公司 × 每个剧本 × 种子 1..N，种子值 seed*7919，和 scripts/calibrate.mjs 一样）
// 逐天量 F4 里现在已经能算的指标。只读仓库，不写仓库。
// 机器人源码从仓库读出来，只插三处钩子（每天推进后、每处理一张卡片前、每次 advise 计时），其余一字不动，所以对局和 calibrate 逐局相同。
// 用法：node f4_metrics.mjs --mode bot|adv [--seeds 4] [--only a,b] [--out file.jsonl]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.REPO || new URL('../mrp', import.meta.url).pathname;
const u = p => pathToFileURL(path.join(REPO, p)).href;
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const MODE = opt('mode', 'bot');
const SEEDS = Number(opt('seeds', 4));
const ONLY = opt('only', '') ? opt('only', '').split(',') : null;
const OUT = opt('out', path.join(HERE, `f4_${MODE}.jsonl`));

function loadBot() {
  const rel = 'src/career/sim/bot.js';
  const srcDir = path.dirname(path.join(REPO, rel));
  let src = fs.readFileSync(path.join(REPO, rel), 'utf8');
  src = src.replace(/(from\s+)(['"])(\.\.?\/[^'"]+)\2/g, (_, f, q, p) => f + q + pathToFileURL(path.join(srcDir, p)).href + q);
  const subs = [
    ['    E.resolveEvent(s, c.id);', '    globalThis.__G1?.card?.(s, ev); E.resolveEvent(s, c.id);'],
    ['{ resolveAll(s, pick); E.tickDay(s); }', '{ resolveAll(s, pick); E.tickDay(s); globalThis.__G1?.day?.(s); }'],
    ['    const out = E.tickDay(s);', '    const out = E.tickDay(s); globalThis.__G1?.day?.(s);'],
    ['      const [a] = E.advise(s);', '      const __t0 = performance.now(); const [a] = E.advise(s); globalThis.__G1?.adv?.(performance.now() - __t0);'],
  ];
  for (const [a, b] of subs) {
    if (src.split(a).length < 2) throw new Error(`bot.js 里找不到：${a}`);
    src = src.split(a).join(b);   // advance 和 advanceMonth 写法一样，两处都插（advanceMonth 校准用不到）
  }
  const dir = path.join(HERE, '.cache');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `bot_hooked_${process.pid}.mjs`);
  fs.writeFileSync(file, src);
  return import(pathToFileURL(file).href);
}

const bot = await loadBot();
const { COMPANIES, SCENARIOS } = await import(u('src/career/data/core.js'));
const { RELEASES, FAMILIES } = await import(u('src/career/data/rivals.js'));
const { APPROACH } = await import(u('src/career/data/balance.js'));
const SO = await import(u('src/career/sim/sota.js'));
const { isTainted } = await import(u('src/career/sim/model.js'));
const { daysBetween } = await import(u('src/career/sim/clock.js'));
const ST = await import(u('src/career/sim/strategy.js'));
const EJ = await import(u('src/career/engine.js'));

// 本 org 本模态真实发布截至某天的最强 q（原始 dims，不做钳制，不往后看）。
const ownIdx = new Map();
function ownReal(org, mod, day) {
  const k = `${org}|${mod}`;
  if (!ownIdx.has(k)) ownIdx.set(k, RELEASES.filter(r => r.mod === mod && FAMILIES[r.family]?.org === org).map(r => ({ day: r.day, q: SO.qOf(mod, r.dims) })).sort((a, b) => a.day.localeCompare(b.day)));
  let best = null;
  for (const r of ownIdx.get(k)) { if (r.day > day) break; best = best === null ? r.q : Math.max(best, r.q); }
  return best;
}
function badNumbers(x, at = 's', seen = new WeakSet(), out = []) {
  if (typeof x === 'number') { if (!Number.isFinite(x)) out.push(at); } else if (x && typeof x === 'object') {
    if (seen.has(x)) return out;
    seen.add(x);
    for (const [k, v] of Object.entries(x)) { badNumbers(v, `${at}.${k}`, seen, out); if (out.length >= 5) break; }
  }
  return out;
}
const FIRE_KINDS = new Set(['milestone', 'super', 'strategy', 'exclusive']);

let G = null;
globalThis.__G1 = {
  day(s) {
    const g = G;
    if (s.day === g.lastDay) return;
    g.lastDay = s.day;
    g.days++;
    if (!g.route0) g.route0 = s.route?.stance ?? null;
    if (s.route?.stance && !g.routes.includes(s.route.stance)) g.routes.push(s.route.stance);
    // 策略：没有进行中的一项就算空闲（策略树还没建好也算）。
    if (!s.strategy?.cur) g.idle++;
    // 蒸馏：新出现的蒸馏单、新记下的老师；炼出过 SOTA 以后还下单的另记。
    for (const o of s.orders || []) if (o?.kind === 'distill' && !g.distSeen.has(o.id)) { g.distSeen.add(o.id); g.distBuys++; if (SO.sotaMade(s)) { g.distAfterMade++; if (!g.distEx) g.distEx = `${s.day} ${o.name}`; } }
    for (const [f, t] of Object.entries(s.data?.teachers || {})) { const k = `${f}@${t?.day}`; if (!g.teachSeen.has(k)) { g.teachSeen.add(k); if (t?.day === s.day) { g.teachNew++; if (SO.sotaMade(s)) { g.teachAfterMade++; if (!g.distEx) g.distEx = `${s.day} 老师 ${f}`; } } } }
    if (s.date !== g.lastMonth) {
      g.lastMonth = s.date;
      const b = badNumbers(s);
      if (b.length && !g.nan) g.nan = `${s.day} ${b.join(',')}`;
    }
    const ws = SO.worldSota(s);
    const org = SO.orgOf(s);
    let bestRel = -Infinity, bestAll = -Infinity, anyTaint = false;
    for (const m of s.models) {
      if (!m?.dims || m.stage === 'pretrain') continue;
      const q = SO.qOf(s.mod, m.dims);
      if (!Number.isFinite(q)) continue;
      bestAll = Math.max(bestAll, q);
      if (m.stage === 'released' && (m.releasedDay ?? '') <= s.day) bestRel = Math.max(bestRel, q);
      if (isTainted(m)) {
        anyTaint = true;
        if (ws) {
          g.taintCheckDays++;
          if (q > ws.q - APPROACH + 1e-9) { g.taintOverCap++; if (!g.taintEx) g.taintEx = `${s.day} ${m.name} q=${q.toFixed(3)} ws=${ws.q.toFixed(3)}`; }
          if (q > ws.q + 1e-9) g.taintOverSota++;
        }
      }
      if (m.origin === 'distill' && ws) {
        const ext = typeof m.teacher === 'string' && m.teacher !== 'self';
        if (q >= ws.q) { if (ext) g.distExtGE++; else g.distSelfGE++; }
      }
    }
    if (anyTaint) g.taintedDays++;
    const h = s.sota?.holder;
    if (h?.by === 'me') {
      const m = s.models.find(x => x.id === h.id);
      if (m && isTainted(m) && !g.taintLabel.includes(m.id)) g.taintLabel.push(m.id);
    }
    if (ws) {
      const own = ownReal(org, s.mod, s.day);
      const other = SO.histOther(s);
      const histLead = own !== null && other !== null && own - other >= 3;
      if (bestRel > -Infinity && bestRel - ws.q >= 3) { g.lead3++; if (!histLead) g.lead3net++; }
      const ref = Math.max(other ?? -Infinity, own ?? -Infinity);
      if (ref > -Infinity && bestAll - ref > 3) g.guard3++;
      g.wsDays++;
    }
    // F4（T 章改写）：没有后训练作业在跑（排队的不算在跑；和 advisor.js 的 postRunning 同口径）、生成订单却暂停 ≥ 30 天。
    const al = EJ.allocJobs(s);
    const postRun = al.items.some(i => i.run && i.job.kind === 'post');
    g.jobDays++;
    if (s.jobs?.repair) g.repairDays++;
    g.trainCards += al.T;
    g.trialCards += al.items.filter(i => i.job.kind === 'trial').reduce((a, i) => a + i.cards, 0);
    if (al.items.reduce((a, i) => a + i.cards, 0) > al.T + 1e-6) g.overDays++;
    if (al.items.some(i => i.run && i.cards + 1e-6 < i.minCards)) g.underDays++;
    for (const e of s.evals || []) if (!g.evalSeen.has(e.id)) { g.evalSeen.add(e.id); g.evalTierN[e.tier] = (g.evalTierN[e.tier] || 0) + 1; }
    for (const o of s.orders || []) {
      if (!o.gen) continue;
      if (o.gen.paused && !postRun) { g.genStreak[o.id] = (g.genStreak[o.id] || 0) + 1; if (g.genStreak[o.id] >= 30) g.genPaused30 = true; } else g.genStreak[o.id] = 0;
      g.genOrders.add(o.id);
    }
  },
  card(s, ev) {
    const g = G;
    const q = s.queue[0];
    const kind = q?.kind ?? 'event';
    g.cards++;
    g.cardKinds[kind] = (g.cardKinds[kind] || 0) + 1;
    g.perDay[s.day] = (g.perDay[s.day] || 0) + 1;
    if (FIRE_KINDS.has(kind)) g.firePerDay[s.day] = (g.firePerDay[s.day] || 0) + 1;
  },
  adv(ms) { const g = G; g.advN++; g.advSum += ms; g.advMax = Math.max(g.advMax, ms); if (ms >= 2) g.adv2++; },
};

const play = MODE === 'adv' ? bot.playAdvised : bot.playGame;
fs.writeFileSync(OUT, '');
const t0 = Date.now();
for (const c of COMPANIES.filter(x => !ONLY || ONLY.includes(x.id))) {
  for (const sc of SCENARIOS) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      G = { lastDay: null, lastMonth: null, days: 0, route0: null, routes: [], nan: null, taintCheckDays: 0, taintOverCap: 0, taintOverSota: 0, taintEx: null, taintedDays: 0,
        distExtGE: 0, distSelfGE: 0, taintLabel: [], lead3: 0, lead3net: 0, guard3: 0, wsDays: 0, genStreak: {}, genPaused30: false, genOrders: new Set(),
        cards: 0, cardKinds: {}, perDay: {}, firePerDay: {}, advN: 0, advSum: 0, advMax: 0, adv2: 0,
        idle: 0, distSeen: new Set(), distBuys: 0, distAfterMade: 0, teachSeen: new Set(), teachNew: 0, teachAfterMade: 0, distEx: null,
        jobDays: 0, repairDays: 0, trainCards: 0, trialCards: 0, overDays: 0, underDays: 0, evalSeen: new Set(), evalTierN: {} };
      const g0 = Date.now();
      let s, errors, thrown = null;
      try { ({ s, errors } = play(c.id, sc.id, seed * 7919)); } catch (e) { thrown = e.stack.split('\n').slice(0, 3).join(' | '); }
      const g = G;
      const rec = { id: c.id, sc: sc.id, tier: c.tier, mod: c.modality, seed, ms: Date.now() - g0, thrown };
      if (s) {
        const nanEnd = badNumbers(s);
        const relSmall = s.models.filter(m => m.stage === 'released' && m.role === 'small' && !m.hist).length;
        const myRel = s.models.filter(m => m.stage === 'released' && !m.hist);
        const openReason = myRel.some(m => m.open && (m.techs || []).includes('reasoning') && (m.releasedDay ?? '') < '2024-11-28');
        Object.assign(rec, {
          rank: s.result?.rank ?? '?', reason: s.result?.reason ?? s.status, revenue: s.result?.revenue ?? 0, errors: errors.length, errSample: errors.slice(0, 2),
          nan: g.nan || (nanEnd.length ? `end ${nanEnd.join(',')}` : null), days: g.days, months: s.monthsPlayed,
          seedTag: s.sota?.seed, made: s.sota?.made?.length ?? 0, madeFirstDay: s.sota?.made?.[0]?.day ?? null, before: !!s.sota?.before, kin: s.sota?.kin ?? null,
          everTainted: s.models.filter(m => m.tainted).length, untainted: s.models.filter(m => m.untainted).length, beyondTrial: s.models.filter(m => m.beyondTrial).length,
          taintCheckDays: g.taintCheckDays, taintOverCap: g.taintOverCap, taintOverSota: g.taintOverSota, taintEx: g.taintEx, taintedDays: g.taintedDays,
          taintLabel: g.taintLabel.length, taintMade: (s.sota?.made || []).filter(x => isTainted(s.models.find(m => m.id === x.modelId))).length,
          distExtGE: g.distExtGE, distSelfGE: g.distSelfGE, distModels: s.models.filter(m => m.origin === 'distill' && !m.hist).length,
          lead3: g.lead3, lead3net: g.lead3net, guard3: g.guard3, wsDays: g.wsDays,
          genOrders: g.genOrders.size, genPaused30: g.genPaused30,
          cards: g.cards, cardKinds: g.cardKinds, maxCardsDay: Math.max(0, ...Object.values(g.perDay)), maxFireDay: Math.max(0, ...Object.values(g.firePerDay)),
          daysFire2: Object.values(g.firePerDay).filter(x => x >= 2).length,
          advN: g.advN, advMean: g.advN ? g.advSum / g.advN : 0, advMax: g.advMax, adv2: g.adv2,
          route0: g.route0, routes: g.routes, routeEnd: s.route?.stance ?? null,
          relSmall, released: myRel.length,
          stDone: Object.values(s.strategy?.done || {}).filter(d => d.how !== 'start').length,
          stDoneHow: Object.values(s.strategy?.done || {}).reduce((a, d) => { a[d.how] = (a[d.how] || 0) + 1; return a; }, {}),
          stNodes: Object.keys(s.strategy?.done || {}).filter(k => s.strategy.done[k].how !== 'start'),
          stTree: s.strategy?.tree ?? null, idle: g.idle, beyond: !!s.strategy?.done?.g_beyond, gsota: s.strategy?.done?.g_sota?.how ?? null,
          spirits: Object.keys(s.strategy?.spirits || {}),
          rights: Object.keys(s.strategy?.rights || {}).length, rightsUsed: Object.values(s.strategy?.rights || {}).filter(x => x?.used).length, rightsVoid: Object.values(s.strategy?.rights || {}).filter(x => x?.void).length,
          grants: s.models.filter(m => m.stage === 'released' && m.grant).length,
          stLogFull: (s.strategy?.log || []).length >= 80,
          training: (JSON.stringify(s).match(/训练中/g) || []).length,
          noName: s.models.filter(m => m.stage === 'released' && (typeof m.name !== 'string' || !m.name.trim())).length,
          namedWorking: s.models.filter(m => m.stage !== 'released' && m.name != null && !m.hist).length,
          dupNames: (() => { const n = s.models.filter(m => m.stage === 'released' && !m.hist).map(m => m.name); return n.length - new Set(n).size; })(),
          distBuys: g.distBuys, distAfterMade: g.distAfterMade, teachNew: g.teachNew, teachAfterMade: g.teachAfterMade, distEx: g.distEx,
          loopErr: errors.filter(e => /原地打转/.test(e)).length, tooMany: errors.filter(e => /建议太多/.test(e)).length, noAdvice: errors.filter(e => /没有建议/.test(e)).length,
          evalTiers: myRel.reduce((a, m) => { const k = m.evalTier ?? 'none'; a[k] = (a[k] || 0) + 1; return a; }, {}),
          skipped: myRel.filter(m => m.evalTier === 'skip').length, submitted: g.evalSeen.size, submitTiers: g.evalTierN,
          relFlag: myRel.filter(m => m.role !== 'small').length,
          repairShare: g.jobDays ? g.repairDays / g.jobDays : 0, trialShare: g.trainCards ? g.trialCards / g.trainCards : 0,
          overDays: g.overDays, underDays: g.underDays,
          msOpenReasoning: s.ms?.ms_open_reasoning ? { who: s.ms.ms_open_reasoning.who, model: s.ms.ms_open_reasoning.model } : null, openReasonBefore: openReason,
        });
      }
      fs.appendFileSync(OUT, JSON.stringify(rec) + '\n');
    }
  }
}
console.log(`${MODE} 完成，${((Date.now() - t0) / 1000).toFixed(1)} 秒 → ${OUT}`);
