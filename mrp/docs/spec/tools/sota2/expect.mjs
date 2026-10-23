// 表 10–12：市场期待（D11）。node expect.mjs [-v]
//   表 10：真实发布按 D11 逐条判定（史实夹具，F4 期待目标的参照分布）
//   表 11：机器人（表 6 同设定，730 天）被评旗舰的结果分布，有无 A10“发布时机”规则（冠军期待永不过期，全部按冠军档判）
//   表 12：小团队“能干活”门槛与小模型上限
import { REL, CHAINS, SOTA_PRE, orgOf, COMPANIES, toDay, frontLine, ownLine, tempLine, S_RULE } from './data.mjs';
import { EXPECT as E, SOTA, KCAP_OFFSET, knowledgeCap } from './curve.mjs';
import { run } from './sim.mjs';
import { ARCH } from './arch.mjs';
const verbose = process.argv.includes('-v');
const ORDER = { under: 0, under_half: 1, flat: 2, meet: 3, over: 4 };
const wc = c => (c === 'frontier' ? 'large' : c);
const fmt = d => new Date(d * 864e5).toISOString().slice(0, 10);

// ---------- 表 10：史实夹具 ----------
const holderAt = (mod, d) => { const ch = CHAINS[mod]; let h = null; for (const x of ch) if (x.since <= d) h = x; else break; return h; };
const counted = (org, mod, d) => [...SOTA_PRE.filter(h => h.org === org && h.mod === mod), ...CHAINS[mod].filter(h => h.org === org && h.counted && h.countedAt <= d)].length > 0;
function badges(r, c, mod) {
  const b = [];
  const opensBefore = REL.filter(y => y.mod === mod && y.open && y.d <= r.d && y !== r);
  if (r.open && r.q > Math.max(-Infinity, ...opensBefore.map(y => y.q)) + E.OPEN_MARGIN) b.push('open_top');
  if (r.open && ['small', 'mid'].includes(r.cls)) {
    const same = opensBefore.filter(y => wc(y.cls) === wc(r.cls));
    if (same.filter(y => y.org !== orgOf(c.families[0])).length >= E.COMM_FIELD && r.q >= Math.max(...same.map(y => y.q)) + E.COMM_MARGIN) b.push('community');
  }
  if (mod !== 'llm' || r.d >= toDay('2023-06-15')) {                      // LLM 要有 func_call（2023-06 起）
    const ks = c.strengths.filter(k => k !== 'safety').slice(0, 2); for (const k of ['code', 'agent']) if (ks.length < 2 && !ks.includes(k)) ks.push(k);
    const env = REL.filter(y => y.mod === mod && y.d <= r.d - E.WORKS_LAG && wc(y.cls) === wc(r.cls) && y.org !== orgOf(c.families[0]));
    if (env.length && ks.every(k => r.dims[k] >= Math.max(...env.map(y => y.dims[k] ?? 0)) - E.WORKS_SLACK)) b.push('works');
  }
  return b;
}
function judgeHistory(mod) {
  const out = {}, rows = [];
  const add = (tier, res) => { (out[tier] ??= {})[res] = (out[tier][res] || 0) + 1; };
  for (const c of COMPANIES.filter(c => c.modality === mod)) {
    const fam = c.families[0], org = orgOf(fam);
    // 新规则：被评的“旗舰发布”= 顶替在线旗舰的那一次，即发布时成为本 org 本模态最强（r.main），不看 S、不看是哪个家族
    const mine = S_RULE === 'old' ? REL.filter(r => r.family === fam && !r.side && r.d >= toDay('2023-01-01'))
      : REL.filter(r => c.families.includes(r.family) && r.main && !r.rerelease && r.d >= toDay('2023-01-01'));
    let last = null, prev = null, nJudged = 0, worksDay = -Infinity, pending = null;
    const judge = (r, atD) => {
      const made = counted(org, mod, r.d - 1), hb = holderAt(mod, r.d - 1), holdingBefore = hb && hb.org === org;
      const tier = made ? 'champion' : (c.tier === 'small' || (c.tier === 'specialist' && !made)) ? 'small' : 'challenger';   // 冠军期待永不过期
      const rivals = REL.filter(y => y.mod === mod && !y.side && y.org !== org && y.d <= atD);
      if (!rivals.length) return null;
      const W = Math.max(...rivals.map(y => y.q)), x = r.q - W;
      const ha = holderAt(mod, atD), holdingAfter = ha && ha.org === org, label = holdingAfter && ha.name === r.name;
      const ownHolderQ = holdingBefore ? hb.q : -Infinity, regress = prev !== null && r.q < prev - E.REGRESS;
      const bd = badges(r, c, mod);
      let res;
      if (tier === 'champion') {
        if (holdingAfter && (label || r.q >= ownHolderQ - E.REGRESS)) res = label && r.q - Math.max(W, ownHolderQ) >= E.CHAMP_LEAD ? 'over' : 'meet';
        else res = regress ? 'under' : x >= -E.NEAR_MISS ? 'under_half' : 'under';
      } else if (tier === 'challenger') {
        const ot = bd.includes('open_top');
        if (label || (ot && x >= -E.OPEN_NEAR) || x >= -E.CHAL_NEAR) res = 'over';
        else if (x >= -E.BAND[c.tier] || ot || (last && x - last.x >= E.CLOSE_BY)) res = 'meet';
        else res = nJudged === 0 ? 'flat' : 'under';
        if (regress) res = 'under';
      } else {
        const works = bd.includes('works') && r.d - worksDay >= E.WORKS_COOL;
        if (label || bd.includes('open_top') || bd.includes('community') || works) res = 'over';
        else if (nJudged === 0 || (prev !== null && r.q >= prev + E.SMALL_UP)) res = 'meet';
        else if (regress) res = 'under'; else res = 'flat';
        if (works && res === 'over' && !label && !bd.includes('open_top') && !bd.includes('community')) worksDay = r.d;
      }
      return { tier, res, x, label, bd };
    };
    const firstRival = REL.find(y => y.mod === mod && !y.side && y.org !== org)?.d ?? Infinity;
    const flushPending = upto => {                                                     // 场地凑满那天补评推迟的那一款（不罚）
      if (!pending || firstRival > upto) return;
      const j = judge(pending, firstRival);
      if (j) { const res = j.res === 'under' || j.res === 'under_half' ? 'flat' : j.res; add(j.tier, res); nJudged++; rows.push(`${fmt(firstRival)} ${c.id.padEnd(10)} ${j.tier.padEnd(10)} （推迟到场地凑满）${pending.name} x=${j.x.toFixed(2)}${j.label ? ' 拿标' : ''} → ${res}`); last = { d: firstRival, x: j.x, res }; }
      pending = null;
    };
    for (const r of mine) {
      flushPending(r.d);
      const W0 = REL.some(y => y.mod === mod && !y.side && y.org !== org && y.d <= r.d);
      if (!W0) { pending = r; prev = r.q; continue; }                                 // 没有可比对象：推迟到场地凑满
      const j = judge(r, r.d); if (!j) { prev = r.q; continue; }
      const within = last && r.d - last.d < E.JUDGE_GAP;
      if (within && ORDER[j.res] <= ORDER[last.res]) { rows.push(`${r.day} ${c.id.padEnd(10)} ${j.tier.padEnd(10)} ${r.name.padEnd(30)} x=${j.x.toFixed(2)} → （60 天内，试算 ${j.res} 不比上次好，不评）`); prev = r.q; continue; }
      add(j.tier, j.res); nJudged++;
      rows.push(`${r.day} ${c.id.padEnd(10)} ${j.tier.padEnd(10)} ${r.name.padEnd(30)} q=${r.q.toFixed(2)} x=${j.x.toFixed(2)}${j.label ? ' 拿标' : ''}${j.bd.length ? ' ' + j.bd.join('/') : ''} → ${j.res}${within ? '（60 天内加评）' : ''}`);
      last = { d: r.d, x: j.x, res: j.res }; prev = r.q;
    }
    flushPending(Infinity);
  }
  return { out, rows };
}
const TIERN = { champion: '冠军', challenger: '挑战者', small: '小团队' };
const RESN = { over: '超出', meet: '符合', flat: '平淡', under_half: '略低', under: '不及' };
console.log('## 表10 史实夹具：真实主线发布按 D11 逐条判定（D3 修订后的数据；徽章按史料口径近似，见说明）');
console.log('| 模态 | 档 | 被评 | 超出 | 符合 | 平淡 | 略低 | 不及 |\n|---|---|---|---|---|---|---|---|');
const total = {};
for (const mod of ['llm', 'image', 'music', 'speech']) {
  const { out, rows } = judgeHistory(mod);
  if (verbose) console.log(rows.join('\n'));
  for (const [t, o] of Object.entries(out)) {
    const n = Object.values(o).reduce((a, b) => a + b, 0); for (const [k, v] of Object.entries(o)) { (total[t] ??= {})[k] = (total[t][k] || 0) + v; }
    console.log(`| ${mod} | ${TIERN[t]} | ${n} | ${['over', 'meet', 'flat', 'under_half', 'under'].map(k => o[k] ? `${o[k]}（${(o[k] / n * 100).toFixed(0)}%）` : '0').join(' | ')} |`);
  }
}
for (const [t, o] of Object.entries(total)) { const n = Object.values(o).reduce((a, b) => a + b, 0);
  console.log(`| 合计 | ${TIERN[t]} | ${n} | ${['over', 'meet', 'flat', 'under_half', 'under'].map(k => o[k] ? `${(o[k] / n * 100).toFixed(0)}%` : '0%').join(' | ')} |`); }

// ---------- 表 11：机器人期待分布 ----------
console.log('\n## 表11 机器人被评旗舰的期待结果（表 6 同设定：前沿·炼出过，Anthropic 视角，开局日 2024-01 到 2025-10 每 20 天，×3 种子，每局 730 天）');
console.log('| 机器人 | 发布时机规则 | 被评 | 冠军：超出 | 符合 | 略低 | 不及 |\n|---|---|---|---|---|---|---|');
const starts = []; for (let d = toDay('2024-01-01'); d <= toDay('2025-10-15'); d += 20) starts.push(d);
const botFrontier = { capOff: 12, preEvery: 330, preDays: 150, baseOff: -4, newCapRel: 10, capDrift: 3, startVsR: -1.5 };
function stepChain(seed, v, days, base = 85) {
  let a = seed * 7919 + 13; const rng = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pts = [[0, base]]; let t = 0, q = base;
  while (t < days) { const dt = 45 + rng() * 105; t += dt; q += v * dt / 30 * (0.6 + 0.8 * rng()); pts.push([Math.round(t), q]); }
  return x => { let r = pts[0][1]; for (const [d, val] of pts) if (d <= x) r = val; return r; };
}
const realRuns = c => (holdRule) => starts.flatMap(d0 => [1, 2, 3].map(seed => { const org = 'anthropic', R = frontLine('llm', { excludeOrg: org, t0: d0 });
  return run(c, { seed, days: 730, R, histOther: R, own: ownLine('llm', { org, lookahead: SOTA.HIST_LOOKAHEAD, t0: d0 }), temp: tempLine('llm', { t0: d0 }), year0: 1970 + d0 / 365.2425, trace: true, traceEvery: 1, holdRule }); }));
const stepRuns = c => (holdRule) => Array.from({ length: 60 }, (_, i) => run({ ...c, capDrift: 4.8, preEvery: Infinity }, { seed: i + 1, days: 730, R: stepChain(i + 1, 0.4, 800), year0: 2025.5, trace: true, traceEvery: 1, holdRule }));
for (const [name, c, mk] of [['A≈0.9，真实线', { ...ARCH.maker_bot, ...botFrontier }, realRuns], ['A≈0.6，真实线', { ...ARCH.maker_bot_lo, ...botFrontier }, realRuns], ['补数据 A≈1.06，真实线', { ...ARCH.maker_bot_top, ...botFrontier }, realRuns], ['A≈0.9，台阶前沿（每月 +0.4）', { ...ARCH.maker_bot, ...botFrontier }, stepRuns]]) for (const holdRule of [false, true]) {
  const tally = { champion: {} }; let n = 0;
  for (const r of mk(c)(holdRule)) {
    let last = null, prevRel = r.trace[0].rel;
    for (let t = 0; t + 1 < r.trace.length; t++) {
      const a = r.trace[t], b = r.trace[t + 1];
      if (b.rel === a.rel) continue;                                   // 第 t 天发布
      const q = b.rel, x = q - a.R, label = b.hold === 1, regress = q < prevRel - E.REGRESS; prevRel = q;
      const tier = 'champion';                                         // 冠军期待永不过期
      let res;
      res = label ? (q - Math.max(a.R, a.hold ? a.rel : -Infinity) >= E.CHAMP_LEAD ? 'over' : 'meet') : regress ? 'under' : x >= -E.NEAR_MISS ? 'under_half' : 'under';
      if (last && t - last.t < E.JUDGE_GAP && ORDER[res] <= ORDER[last.res]) continue;
      tally[tier][res] = (tally[tier][res] || 0) + 1; n++; last = { t, x, res };
    }
  }
  const pc = (t, k) => { const m = Object.values(tally[t]).reduce((a, b) => a + b, 0); return m ? `${((tally[t][k] || 0) / m * 100).toFixed(0)}%` : '—'; };
  console.log(`| 前沿·炼出过（${name}） | ${holdRule ? '有' : '无'} | ${n} | ${pc('champion', 'over')} | ${pc('champion', 'meet')} | ${pc('champion', 'under_half')} | ${pc('champion', 'under')} |`);
}

// ---------- 表 12：小团队“能干活”门槛 ----------
console.log('\n## 表12 “能干活”门槛（主业两维 ≥ min(一年前同量级可见发布最高, knowledgeCap(总参, 1.6) + KCAP_OFFSET) − 2）与上限');
console.log('| 日期 | 公司 | 主业两维 | 7B 门槛 / 上限（数据质量 1.6） | 14B | 32B | 70B |\n|---|---|---|---|---|---|---|');
const L = REL.filter(r => r.mod === 'llm'), clsOfTotal = t => (t <= 15 ? 'small' : t <= 100 ? 'mid' : 'large');
for (const day of ['2023-07-01', '2024-01-01', '2024-07-01', '2025-01-01', '2025-07-01', '2026-01-01', '2026-07-01']) for (const c of COMPANIES.filter(c => c.tier === 'small')) {
  const ks = c.strengths.filter(k => k !== 'safety').slice(0, 2); for (const k of ['code', 'agent']) if (ks.length < 2 && !ks.includes(k)) ks.push(k);
  const cell = tot => {
    const env = L.filter(r => r.d <= toDay(day) - E.WORKS_LAG && wc(r.cls) === clsOfTotal(tot) && r.org !== c.id);
    if (!env.length) return '无同量级发布，不发';
    return ks.map(k => { const cap = knowledgeCap(tot, E.WORKS_QUALITY) + (k === 'knowledge' ? KCAP_OFFSET.knowledge : KCAP_OFFSET.other);
      return `${Math.min(Math.max(...env.map(r => r.dims[k] ?? 0)), cap) - E.WORKS_SLACK | 0}/${cap | 0}`; }).join('，');
  };
  console.log(`| ${day} | ${c.id} | ${ks.join('、')} | ${cell(7)} | ${cell(14)} | ${cell(32)} | ${cell(70)} |`);
}
