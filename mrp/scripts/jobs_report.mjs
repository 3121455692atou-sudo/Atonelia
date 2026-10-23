#!/usr/bin/env node
// 训练作业（规格 T 章）的实测报告：读真实引擎，让机器人整局玩下来，量 F4 里“训练作业”那几条指标，并出附录表 T1–T4 的同口径版本。
// 用法（仓库根目录）：
//   node scripts/jobs_report.mjs --baseline [--seeds 4] [--json 文件]   量现状（P2.4 之前也能跑）：旗舰发布间隔、研究完成数、评级分布、维护占比
//   node scripts/jobs_report.mjs [--seeds 4] [--base 文件] [--json 文件]  P2.4a 以后：上面四样加 F4 训练作业指标、表 T1–T4；--base 给开工前存的 JSON，逐条比
//   --only gpt,qwen 只跑这几家；--sc y2025 只跑这个剧本；--no-tables 不出表 T1–T4；--t2-seeds 5 表 T2 的种子数。种子和 calibrate 一样取 seed × 7919。
// 基线口径只读两边都有的字段：s.models 的发布日、s.techs、终局评级；维护占比读 s.jobs?.repair ?? s.focus?.kind === 'maintain'（每周看一次）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = p => pathToFileURL(path.join(ROOT, p)).href;
const bot = await import(url('tests/helpers/career_bot.mjs'));
const E = await import(url('src/career/engine.js'));
const BAL = await import(url('src/career/data/balance.js'));
const M = await import(url('src/career/sim/model.js'));
const { COMPANIES, SCENARIOS } = await import(url('src/career/data/core.js'));
const { daysBetween } = await import(url('src/career/sim/clock.js'));

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SEEDS = Number(opt('--seeds', 4));
const ONLY = opt('--only', null)?.split(',') ?? null;
const SC = opt('--sc', null);
const BASELINE = argv.includes('--baseline');
// 作业引擎的新行为（P2.4a 提交 2：送评、评测）在了，才量 F4 的训练作业指标；提交 1 只有外壳，只量现状四样。
const NEW = !BASELINE && typeof E.submitEval === 'function';
const LABJS = NEW ? await import(url('src/career/sim/lab.js')) : null;
const TIERS = ['small', 'specialist', 'major', 'bigtech', 'frontier'];
const RANKS = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];

const med = a => { const b = [...a].filter(Number.isFinite).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN; };
const avg = a => { const b = a.filter(Number.isFinite); return b.length ? b.reduce((x, y) => x + y, 0) / b.length : NaN; };
const pct = v => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—');
const f1 = v => (Number.isFinite(v) ? v.toFixed(1) : '—');
const f2 = v => (Number.isFinite(v) ? v.toFixed(2) : '—');
const n0 = v => (Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : '—');

// 旧代码的 s.focus（P2.4a 提交 2 以后它是不可枚举的取值器，读它返回 undefined，这里干脆不读）。
const legacyFocusKind = s => (Object.getOwnPropertyDescriptor(s, 'focus')?.enumerable ? s.focus?.kind ?? null : null);
// 自己练出来的模型（不是继承的、不是发布快照、不是开局复制出来的工作副本）：m<编号>_<年-月>。
const trainedId = id => /^m\d+_\d{4}-\d{2}$/.test(id);

// ---------- 一局 ----------
function playOne(company, scenario, seed) {
  const st = { weeks: 0, repairWeeks: 0, techs0: null, start: null, models0: null };
  const daily = NEW ? newDaily(st) : null;
  const t0 = performance.now();
  const { s, errors } = bot.playGame(company.id, scenario.id, seed, {
    onWeek: x => {
      if (st.techs0 === null) { st.techs0 = x.techs.length; st.start = x.day; st.models0 = new Set(x.models.map(m => m.id)); }
      st.weeks += 1;
      if (x.jobs?.repair ?? legacyFocusKind(x) === 'maintain') st.repairWeeks += 1;
    },
    onDay: daily ? (x, out) => daily.day(x, out) : undefined,
  });
  const ms = performance.now() - t0;
  const flag = s.models.filter(m => m.stage === 'released' && m.role !== 'small' && !m.hist && m.releasedDay).sort((a, b) => a.releasedDay.localeCompare(b.releasedDay));
  const gaps = list => list.slice(1).map((m, i) => daysBetween(list[i].releasedDay, m.releasedDay));
  const main = flag.filter(m => m.line === 'main');
  return {
    id: company.id, sc: scenario.id, tier: company.tier, seed, ms, errors: errors.length,
    rank: s.result?.rank ?? '?', reason: s.result?.reason ?? '?',
    research: s.techs.length - (st.techs0 ?? s.techs.length),
    mainGaps: gaps(main), allGaps: gaps(flag), mainN: main.length, allN: flag.length,
    repairShare: st.weeks ? st.repairWeeks / st.weeks : 0,
    ...(daily ? daily.done(s) : {}),
  };
}

// ---------- P2.4a 以后：逐日的作业统计（量的时候另调 allocJobs，只读） ----------
function newDaily(st) {
  const d = { days: 0, overDays: 0, underDays: 0, repairDays: 0, trialCards: 0, trainCards: 0, idle: [], runBase: [], queuePostMax: 0, queueRun: {}, bases: {}, health: [], healthMin: 100, firstSeen: {} };
  return {
    day(s) {
      if (s.status !== 'playing') return;
      const al = E.allocJobs(s);
      d.days += 1;
      if (al.items.reduce((a, it) => a + it.cards, 0) > al.T + 1e-6) d.overDays += 1;
      if (al.items.some(it => it.run && it.cards + 1e-6 < it.minCards)) d.underDays += 1;
      if (s.jobs.repair) d.repairDays += 1;
      d.trainCards += al.T;
      d.trialCards += al.items.filter(it => it.job.kind === 'trial').reduce((a, it) => a + it.cards, 0);
      d.idle.push(al.T > 0 ? al.free : 0);
      const run = al.items.filter(it => it.run).length;
      if (al.items.some(it => it.run && E.isBaseJob(it.job) && it.job.line === 'main')) d.runBase.push(run);
      for (const it of al.items) {
        const j = it.job;
        if (j.kind === 'post') {
          d.queueRun[j.id] = it.why === 'min' ? (d.queueRun[j.id] || 0) + 1 : 0;
          d.queuePostMax = Math.max(d.queuePostMax, d.queueRun[j.id]);
        }
        if (j.kind === 'pretrain' && j.line === 'main') (d.bases[j.id] ??= { first: s.day, last: s.day }).last = s.day;
      }
      d.healthMin = Math.min(d.healthMin, s.health);
      d.health.push(s.health);
      if (st.start && daysBetween(st.start, s.day) < 365) for (const m of s.models) if (trainedId(m.id) && !st.models0?.has(m.id)) d.firstSeen[m.id] ??= s.day;
    },
    done(s) {
      const ended = Object.entries(d.bases).filter(([id]) => !s.jobs.list.some(j => j.id === id)).map(([, b]) => daysBetween(b.first, b.last) + 1);
      return {
        days: d.days, overDays: d.overDays, underDays: d.underDays, repairDayShare: d.days ? d.repairDays / d.days : 0,
        trialShare: d.trainCards ? d.trialCards / d.trainCards : 0, idle: avg(d.idle), runBaseMed: med(d.runBase),
        baseDays: ended, queuePostMax: d.queuePostMax,
        skipped: s.models.filter(m => m.evalTier === 'skip').length, healthMin: d.healthMin, healthAvg: avg(d.health),
        yearModels: Object.keys(d.firstSeen).length,
      };
    },
  };
}

// ---------- 汇总 ----------
function summarize(games) {
  const by = pred => games.filter(pred);
  const out = { n: games.length, tiers: {}, scTier: {}, ranks: {}, ms: { avg: avg(games.map(g => g.ms)), max: Math.max(...games.map(g => g.ms)) }, errors: games.reduce((a, g) => a + g.errors, 0) };
  for (const r of RANKS) out.ranks[r] = games.filter(g => g.rank === r).length / games.length;
  out.mainGapMed = med(games.flatMap(g => g.mainGaps));
  out.allGapMed = med(games.flatMap(g => g.allGaps));
  out.repairShare = avg(games.map(g => g.repairShare));
  for (const t of TIERS) {
    const gs = by(g => g.tier === t);
    if (!gs.length) continue;
    out.tiers[t] = { n: gs.length, mainGapMed: med(gs.flatMap(g => g.mainGaps)), allGapMed: med(gs.flatMap(g => g.allGaps)), research: avg(gs.map(g => g.research)), repairShare: avg(gs.map(g => g.repairShare)),
      mainN: avg(gs.map(g => g.mainN)), allN: avg(gs.map(g => g.allN)) };
  }
  for (const sc of SCENARIOS) for (const t of TIERS) {
    const gs = by(g => g.sc === sc.id && g.tier === t);
    if (gs.length) out.scTier[`${sc.id}/${t}`] = { n: gs.length, research: avg(gs.map(g => g.research)) };
  }
  if (NEW) {
    out.f4 = {
      overDays: games.reduce((a, g) => a + g.overDays, 0), underDays: games.reduce((a, g) => a + g.underDays, 0),
      baseDaysMed: med(games.flatMap(g => g.baseDays)), skipped: games.reduce((a, g) => a + g.skipped, 0),
      queue30: games.filter(g => g.queuePostMax > 30).length / games.length,
      repairDayShare: avg(games.map(g => g.repairDayShare)),
      tiers: Object.fromEntries(TIERS.map(t => { const gs = by(g => g.tier === t); return [t, gs.length ? {
        runBaseMed: med(gs.map(g => g.runBaseMed)), trialShare: avg(gs.map(g => g.trialShare)), idle: avg(gs.map(g => g.idle)), baseDaysMed: med(gs.flatMap(g => g.baseDays)),
        yearModels: avg(gs.filter(g => g.sc !== 'y2026').map(g => g.yearModels)), repairDayShare: avg(gs.map(g => g.repairDayShare)),
        healthMin: Math.min(...gs.map(g => g.healthMin)), healthAvg: avg(gs.map(g => g.healthAvg)),
      } : null]; })),
    };
  }
  return out;
}

function printBase(sum, base) {
  const cmp = (now, was, fmt = f1) => (base && Number.isFinite(was) ? `${fmt(now)}（之前 ${fmt(was)}）` : fmt(now));
  console.log(`\n### 现状四样（机器人 playGame，${sum.n} 局，种子 × ${SEEDS}）\n`);
  console.log(`- 旗舰发布间隔中位：主线（顶替在线旗舰）${cmp(sum.mainGapMed, base?.mainGapMed)} 天；旗舰线全部 ${cmp(sum.allGapMed, base?.allGapMed)} 天`);
  if (base && Number.isFinite(base.mainGapMed)) console.log(`  - 和之前的比：主线 ×${(sum.mainGapMed / base.mainGapMed).toFixed(2)}，旗舰线全部 ×${(sum.allGapMed / base.allGapMed).toFixed(2)}（F4 线 ≤ 1.2 倍）`);
  console.log(`- 维护（检修）占比（每周看一次）：${cmp(sum.repairShare, base?.repairShare, pct)}`);
  console.log(`- 评级分布：${RANKS.map(r => `${r} ${pct(sum.ranks[r])}`).join('、')}`);
  if (base) console.log(`  - 每档相差（百分点，F4 线 ≤ 5）：${RANKS.map(r => `${r} ${((sum.ranks[r] - (base.ranks[r] || 0)) * 100).toFixed(1)}`).join('、')}`);
  console.log(`- 性能：一局平均 ${sum.ms.avg.toFixed(0)} ms，最长 ${sum.ms.max.toFixed(0)} ms；操作失败 ${sum.errors} 次`);
  console.log('\n| 量级 | 局数 | 主线发布间隔中位（天） | 旗舰线全部间隔中位 | 每局主线发布次数 | 研究完成数（每局平均） | 维护占比 |');
  console.log('|---|---|---|---|---|---|---|');
  for (const [t, v] of Object.entries(sum.tiers)) {
    const b = base?.tiers?.[t];
    console.log(`| ${t} | ${v.n} | ${cmp(v.mainGapMed, b?.mainGapMed)} | ${cmp(v.allGapMed, b?.allGapMed)} | ${cmp(v.mainN, b?.mainN)} | ${cmp(v.research, b?.research)} | ${cmp(v.repairShare, b?.repairShare, pct)} |`);
  }
  console.log('\n研究完成数，按剧本 × 量级平均（F4 线：和之前相差 ≤ 10%）：\n');
  console.log(`| 剧本 / 量级 | 局数 | 研究完成数 |${base ? ' 之前 | 相差 |' : ''}`);
  console.log(`|---|---|---|${base ? '---|---|' : ''}`);
  let worst = 0, worstK = '';
  for (const [k, v] of Object.entries(sum.scTier)) {
    const b = base?.scTier?.[k]?.research;
    const d = Number.isFinite(b) && b > 0 ? v.research / b - 1 : NaN;
    if (Number.isFinite(d) && !k.startsWith('y2026') && Math.abs(d) > Math.abs(worst)) { worst = d; worstK = k; }
    console.log(`| ${k} | ${v.n} | ${f1(v.research)} |${base ? ` ${f1(b)} | ${Number.isFinite(d) ? `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}%` : '—'} |` : ''}`);
  }
  if (base) {
    const all = Object.values(sum.scTier).reduce((a, v) => a + v.research * v.n, 0) / Object.values(sum.scTier).reduce((a, v) => a + v.n, 0);
    const was = Object.values(base.scTier).reduce((a, v) => a + v.research * v.n, 0) / Object.values(base.scTier).reduce((a, v) => a + v.n, 0);
    console.log(`\n全部局平均 ${f2(all)}（之前 ${f2(was)}，${((all / was - 1) * 100).toFixed(1)}%）；y2023–y2025 里相差最大的一格：${worstK} ${(worst * 100).toFixed(1)}%（y2026 每局不到 1 项，只看绝对数）`);
  }
}

function printF4(sum) {
  const f = sum.f4;
  console.log('\n### F4 训练作业指标（真引擎）\n');
  console.log('| 指标 | 目标 | 实测 |');
  console.log('|---|---|---|');
  console.log(`| 作业实得卡之和超过训练卡的天数；在跑的作业低于最低卡的天数 | 0 | ${f.overDays}；${f.underDays} |`);
  console.log(`| 主线底座工期中位 | 45–180 天 | ${f1(f.baseDaysMed)} 天（${TIERS.map(t => `${t} ${f1(f.tiers[t]?.baseDaysMed)}`).join('；')}） |`);
  console.log(`| 底座练着的日子里同时在跑的作业中位 | small、specialist ≤ 2；major 及以上 ≥ 2 | ${TIERS.map(t => `${t} ${f.tiers[t]?.runBaseMed ?? '—'}`).join('；')} |`);
  console.log(`| bigtech、frontier 开局一年练出的模型（y2023–y2025） | ≥ 4 | ${['bigtech', 'frontier'].map(t => `${t} ${f1(f.tiers[t]?.yearModels)}`).join('；')}（其余 ${['small', 'specialist', 'major'].map(t => `${t} ${f1(f.tiers[t]?.yearModels)}`).join('；')}） |`);
  console.log(`| 试验占训练卡·天 | major 及以上 1–10%；small ≤ 3% | ${TIERS.map(t => `${t} ${pct(f.tiers[t]?.trialShare)}`).join('；')} |`);
  console.log(`| 机器人跳过评测 | 0 次 | ${f.skipped} |`);
  console.log(`| 后训练排队超过 30 天的局 | ≤ 5% | ${pct(f.queue30)} |`);
  console.log(`| 机器人检修天数占比 | 8–25% | ${pct(f.repairDayShare)}（${TIERS.map(t => `${t} ${pct(f.tiers[t]?.repairDayShare)}`).join('；')}） |`);
  console.log(`| 闲置训练卡平均（不设目标） | — | ${TIERS.map(t => `${t} ${pct(f.tiers[t]?.idle)}`).join('；')} |`);
  console.log(`| 健康 最低 / 平均 | — | ${TIERS.map(t => `${t} ${f1(f.tiers[t]?.healthMin)} / ${f1(f.tiers[t]?.healthAvg)}`).join('；')} |`);
  console.log(`| 性能：一局机器人 | ≤ 400 ms | 平均 ${sum.ms.avg.toFixed(0)} ms，最长 ${sum.ms.max.toFixed(0)} ms |`);
}

// ---------- 附录表 T1–T4 的同口径版本 ----------
const REF = [['rwkv', 'y2023', '小公司 2023'], ['perplexity', 'y2025', '小公司 2025'], ['suno', 'y2024', '专精非 LLM 2024'], ['qwen', 'y2024', '大厂 2024'], ['deepseek', 'y2025', '中厂 2025'], ['gpt', 'y2025', '前沿 2025'], ['gpt', 'y2026', '前沿 2026']];
const fresh = (id, sc, seed = 1) => { const s = E.createGame(id, sc, seed); bot.resolveAll(s); return s; };
const rlDir = s => E.directionsFor(s).find(d => d.rl) || E.directionsFor(s)[0];
const cfgText = (s, c) => (s.mod === 'llm' ? `${c.total}B/${c.active}B ${c.arch === 'moe' ? 'MoE' : '稠密'} ${c.tokens}T` : `${c.scaleId} 档`);
const yearOf = s => Number(s.day.slice(0, 4)) + (Number(s.day.slice(5, 7)) - 1) / 12;
const refTrain = (ref, y) => { const tab = BAL.EFFORT.TRAIN_REF[ref]; const i = Math.max(2023, Math.min(2026, Math.floor(y))); return tab[i] + (tab[i + 1] - tab[i]) * Math.max(0, Math.min(1, y - i)); };

function tableT1() {
  console.log('\n### 表 T1 同口径：开局分卡与底座工期（种子 1，开局状态，推理份额取开局默认，在练模型挂一项强化学习后训练）\n');
  console.log('| 公司 | 总卡 / 训练卡 | 每张训练卡 H100·月/月 | 团队 / 作业位（按人、按卡 → 取大） | 机器人挑的底座 | 最低 / 想要 / 实得卡 | 新工期（天） | 旧规则工期（天） | 最快天数 | 后训练 最低 / 想要 / 实得卡 | 后训练 computeMult 新 / 旧 | 冲顶力 fComp 新 / 旧 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [id, sc, label] of REF) {
    const s = fresh(id, sc);
    const ga = E.gpuAllocation(s), T = ga.trainGpus;
    const w = E.workingModel(s);
    const dir = rlDir(s);
    if (w) E.startJob(s, { kind: 'post', target: 'main', dir: dir.key, until: 'none' });
    const pick = bot.chooseBase(s);
    let row = `| ${label}（${id}） | ${n0(ga.total)} / ${n0(T)} | ${f2(E.trainFlops(s) / Math.max(1, T) / 1e21)} | ${s.team} / ${E.slotsByTeam(s)}、${E.slotsByCards(s)} → ${E.jobSlots(s)} | `;
    if (!pick) { console.log(`${row}（150 天内挑不出） | — | — | — | — | — | — | — |`); continue; }
    const kp = 1 + E.knowFx(s).pretrain;
    const oldDays = pick.pv.need / (E.trainFlops(s) * (w ? 0.75 : 1) * kp) * 30;
    const job = E.startJob(s, { kind: 'pretrain', line: 'main', cfg: pick.cfg });
    const al = E.allocJobs(s);
    const bi = al.items.find(i => i.job === job), pi = al.items.find(i => i.job.kind === 'post');
    const p = w ? E.postPreview(s, dir.key) : null;
    const need = w ? 6 * (w.active || 3) * 1e9 * (dir.rl ? 4e11 : 6e10) * (s.mod === 'llm' ? 1 : 0.02) : 1;
    const cmOld = w ? Math.min(1.2, Math.sqrt(E.trainFlops(s) * 0.25 / need)) : NaN;
    const fOld = Math.min(1.2, Math.max(0.15, Math.sqrt(E.trainFlops(s) * 0.25 / (refTrain(s.mod === 'llm' ? 'llm' : 'other', yearOf(s)) * 1e21))));
    row += `${cfgText(s, pick.cfg)} | ${n0(bi.minCards)} / ${n0(bi.wantCards)} / ${n0(bi.cards)} | ${f1(E.jobEta(s, job))} | ${f1(oldDays)} | ${f1(E.fastestDays(s, pick.pv.structure))} | ${pi ? `${n0(pi.minCards)} / ${n0(pi.wantCards)} / ${n0(pi.cards)}` : '—'} | ${p ? `${f2(p.computeMult)} / ${f2(cmOld)}` : '—'} | ${f2(M.hardness(s, w || undefined).fComp)} / ${f2(fOld)} |`;
    console.log(row);
  }
}

function tableT2(seeds) {
  console.log(`\n### 表 T2 同口径：开局一年（机器人整局玩、只统计开局后 365 天，${seeds} 个种子取中位；卡数、研究、送评都是真引擎）\n`);
  console.log('| 公司 | 同时在跑的作业 中位 / 最多 | 底座在练的日子里 中位 | ≥3 项作业的天数 | 排队作业·天 | 闲置训练卡平均 | 主线底座：开了几个 / 工期中位（天）/ 试验省算力中位 | 小底座个数 | 试验占训练卡·天 | 送评次数 / 评测天数 | 旗舰发布 / 小模型发布 | 一年练出的模型 | 试验 | 健康 最低 / 平均 | 检修天数（占比） | 重活天数占比 | 炸炉 轻 / 重 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [id, sc, label] of REF) {
    const rows = [];
    for (let k = 1; k <= seeds; k++) {
      let start = null, models0 = null;
      const r = { run: [], runBase: [], three: 0, queued: 0, idle: [], bases: {}, small: new Set(), trialCards: 0, trainCards: 0, evals: new Set(), evalDays: 0, rel: 0, relSmall: 0, trained: new Set(),
        trials: new Set(), hMin: 100, h: [], repair: 0, heavy: 0, days: 0, minor: 0, severe: 0 };
      bot.playGame(id, sc, k * 7919, {
        onWeek: x => { if (!start) { start = x.day; models0 = new Set(x.models.map(m => m.id)); } },
        onDay: (x, out) => {
          if (!start || daysBetween(start, x.day) >= 365 || x.status !== 'playing') return;
          r.days += 1;
          const al = E.allocJobs(x);
          const run = al.items.filter(i => i.run).length;
          r.run.push(run);
          if (run >= 3) r.three += 1;
          r.queued += al.items.filter(i => i.why === 'min').length;
          if (al.items.some(i => i.run && E.isBaseJob(i.job) && i.job.line === 'main')) r.runBase.push(run);
          r.idle.push(al.free);
          r.trainCards += al.T;
          for (const i of al.items) {
            if (i.job.kind === 'trial') { r.trialCards += i.cards; r.trials.add(i.job.id); }
            if (i.job.kind === 'pretrain' && i.job.line === 'main') (r.bases[i.job.id] ??= { first: x.day, last: x.day, save: i.job.lab?.save || 0 }).last = x.day;
            if (i.job.kind === 'pretrain' && i.job.line === 'small') r.small.add(i.job.id);
          }
          for (const e of x.evals) if (!r.evals.has(e.id)) { r.evals.add(e.id); r.evalDays += e.days; }
          for (const rel of out?.releases || []) { if (rel.model.role === 'small') r.relSmall += 1; else r.rel += 1; }
          for (const m of x.models) if (trainedId(m.id) && !models0.has(m.id)) r.trained.add(m.id);
          r.hMin = Math.min(r.hMin, x.health); r.h.push(x.health);
          if (x.jobs.repair) r.repair += 1;
          if (E.heavyWork(x).kind !== 'none') r.heavy += 1;
          if (out?.blowup === 'minor') r.minor += 1;
          if (out?.blowup === 'severe') r.severe += 1;
        },
      });
      const ended = Object.values(r.bases).map(b => daysBetween(b.first, b.last) + 1);
      rows.push({ runMed: med(r.run), runMax: Math.max(0, ...r.run), runBase: med(r.runBase), three: r.three / Math.max(1, r.days), queued: r.queued, idle: avg(r.idle), bases: Object.keys(r.bases).length, baseDays: med(ended),
        save: med(Object.values(r.bases).map(b => b.save)), small: r.small.size, trial: r.trialCards / Math.max(1, r.trainCards), evals: r.evals.size, evalDays: r.evalDays, rel: r.rel, relSmall: r.relSmall,
        trained: r.trained.size, trials: r.trials.size, hMin: r.hMin, hAvg: avg(r.h), repair: r.repair, repairShare: r.repair / Math.max(1, r.days), heavy: r.heavy / Math.max(1, r.days), minor: r.minor, severe: r.severe });
    }
    const m = k => med(rows.map(x => x[k]));
    console.log(`| ${label}（${id}） | ${m('runMed')} / ${m('runMax')} | ${f1(m('runBase'))} | ${pct(m('three'))} | ${n0(m('queued'))} | ${pct(m('idle'))} | ${m('bases')} / ${f1(m('baseDays'))} / ${pct(m('save'))} | ${m('small')} | ${pct(m('trial'))} | ${m('evals')} / ${m('evalDays')} | ${m('rel')} / ${m('relSmall')} | ${m('trained')} | ${m('trials')} | ${f1(m('hMin'))} / ${f1(m('hAvg'))} | ${m('repair')}（${pct(m('repairShare'))}） | ${pct(m('heavy'))} | ${m('minor')} / ${m('severe')} |`);
  }
}

function tableT3() {
  console.log('\n### 表 T3 同口径：试验收益（开局状态；计划是机器人挑的下一代底座；2000 个作业 id 抽样）\n');
  console.log('| 公司 | 试验 | 成功率（公式 / 抽样） | 成功时收益（均值） | 成本（H100·月） | 想要卡 / 最低卡 / 天数 | 期望省算力 | 折成底座工期 | p_ref |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const [id, sc, label] of REF) {
    const s = fresh(id, sc);
    const pick = bot.chooseBase(s);
    if (!pick) { console.log(`| ${label} | （150 天内挑不出下一代底座） |  |  |  |  |  |  |  |`); continue; }
    E.setPlan(s, pick.cfg);
    const arch = E.archChoices(s, pick.cfg).filter(t => s.techs.includes(t))[0];
    const kinds = [['tune', 'small'], ['tune', 'mid'], ...(arch ? [['arch', 'mid', arch]] : []), ...(s.mod === 'llm' ? [['mix', 'mid']] : [])];
    for (const [type, size, tech] of kinds) {
      const spec = { type, size, ...(tech ? { tech } : {}), ...(type === 'mix' ? { dim: 'code' } : {}) };
      const name = `${{ tune: '调参', arch: `架构验证（${tech}）`, mix: '数据配比' }[type]}${size === 'mid' ? '中档' : '小档'}`;
      const p = E.trialPreview(s, spec);
      if (!p.ok) { console.log(`| ${label} | ${name} | —（${p.reason}） |  |  |  |  |  |  |`); continue; }
      let ok = 0, gsum = 0;
      for (let i = 0; i < 2000; i++) { const o = LABJS.trialOutcome(s, { id: `t${i}`, odds: p.odds }); if (o.ok) { ok++; gsum += o.g; } }
      const g = ok ? gsum / ok : 0;
      const gain = BAL.LAB.GAIN[type][size];
      const save = (gain.save || 0) * g, risk = gain.risk ? 1 - (1 - gain.risk) * g : 1;
      const c = E.jobCheck(s, { kind: 'trial', ...spec });
      const expSave = save * ok / 2000;
      const benefit = type === 'mix' ? `该维出生 +${f2((gain.dim || 0) * g)}` : `省算力 ${pct(save)}，炸炉 ×${f2(risk)}${gain.cut ? `；技术在研时研究缩短 ${pct(gain.cut * g)}` : ''}`;
      console.log(`| ${label} | ${name} | ${pct(p.odds)} / ${pct(ok / 2000)} | ${benefit} | ${f1(p.cost / 1e21)} | ${c.ok ? `${n0(c.cards.want)} / ${n0(c.cards.min)} / ${f1(c.eta)}` : `—（${c.reason}）`} | ${type === 'mix' ? '—' : pct(expSave)} | ${type === 'mix' ? '—' : `少约 ${f1(pick.pv.days * expSave)} 天（${f1(pick.pv.days)} 天的底座）`} | ${f2(p.pRef)} |`);
    }
  }
}

function tableT4() {
  console.log('\n### 表 T4 同口径：训练与推理的取舍（开局状态；底座用推理 50% 时机器人挑的那个；收入按 simulateService 现算）\n');
  console.log('| 公司 | 推理份额 | 训练卡 | 底座工期（天） | 后训练 computeMult | 冲顶力 fComp | 闲置训练卡 | 月收入 | 推理负载 | 429 比例 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const [id, sc, label] of REF) {
    const s0 = fresh(id, sc);
    s0.inferShare = 0.5;
    const pick = bot.chooseBase(s0);
    for (const share of [0.3, 0.5, 0.7]) {
      const s = fresh(id, sc);
      s.inferShare = share;
      const w = E.workingModel(s);
      const dir = rlDir(s);
      if (w) E.startJob(s, { kind: 'post', target: 'main', dir: dir.key, until: 'none' });
      let days = '—';
      if (pick) {
        const pv = E.previewProject(s, pick.cfg);
        days = Number.isFinite(pv.days) ? f1(pv.days) : '排队（卡不够最低）';
        if (E.jobCheck(s, { kind: 'pretrain', line: 'main', cfg: pick.cfg }).ok) E.startJob(s, { kind: 'pretrain', line: 'main', cfg: pick.cfg });
      }
      const al = E.allocJobs(s);
      const p = w ? E.postPreview(s, dir.key) : null;
      const sv = E.simulateService(s);
      console.log(`| ${label} | ${pct(share)} | ${n0(al.T)} | ${days} | ${p ? f2(p.computeMult) : '—'} | ${f2(M.hardness(s, w || undefined).fComp)} | ${pct(al.free)} | ${f1((sv.total || 0) / 1e6)}M | ${f2(sv.util)} | ${pct(sv.r429)} |`);
    }
  }
}

// ---------- 入口 ----------
const games = [];
for (const c of COMPANIES.filter(x => !ONLY || ONLY.includes(x.id))) {
  for (const sc of SCENARIOS.filter(x => !SC || x.id === SC)) {
    for (let seed = 1; seed <= SEEDS; seed++) games.push(playOne(c, sc, seed * 7919));
  }
}
const sum = summarize(games);
const base = opt('--base', null) ? JSON.parse(fs.readFileSync(opt('--base', null), 'utf8')) : null;
printBase(sum, base);
if (NEW) {
  printF4(sum);
  if (!ONLY && !SC && !argv.includes('--no-tables')) {
    const seeds = Number(opt('--t2-seeds', 5));
    tableT1();
    tableT2(seeds);
    tableT3();
    tableT4();
  }
}
if (opt('--json', null)) fs.writeFileSync(opt('--json', null), JSON.stringify(sum, null, 1));
