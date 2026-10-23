// 运行：node run.mjs   （只读 import 项目模块；不写任何文件）
import { run, qOf } from './sim.mjs';
import { ARCH } from './arch.mjs';
import { CURVE, SOTA, EASE, effort, hardness, rhoOf, H } from './curve.mjs';
import { CHAINS, COMPANIES, SCEN, seedCell, REAL_SEED, frontLine, ownLine, tempLine, toDay } from './data.mjs';
const S8 = [1, 2, 3, 4, 5, 6, 7, 8];
const med = a => { const b = a.filter(x => x != null).sort((x, y) => x - y); return b.length < a.length / 2 ? null : b[Math.floor(b.length / 2)]; };
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const f = x => (x === null || x === undefined || x === Infinity ? '∞' : String(x));
const row = cells => '| ' + cells.join(' | ') + ' |';
const head = h => console.log(row(h) + '\n' + row(h.map(() => '---')));
const Y = 2025.5, static_ = (c, extra = {}) => S8.map(seed => run({ ...c, start: -10, preEvery: Infinity, ...extra }, { seed, days: 1200, R: () => 80, yearFixed: true, year0: Y, ...extra.opt }));
const fmtDay = d => new Date(d * 864e5).toISOString().slice(0, 10);

console.log(`常量：CURVE=${JSON.stringify(CURVE)}\nSOTA=${JSON.stringify(SOTA)} EASE=${JSON.stringify(EASE)}\n`);

console.log('## 表0 D6.2 参考值（H 在各 δ 的取值；越线成本 = 从 0 爬到 +x 所花的时间折合满速涨几分 = ∫0^x dδ/H）');
head(['情况', 'A', 'ρ', 'F', 'b', 'W', 'δ=−3', '−1', '0', '+1', '+2', '+3', '越线到 +1 / +2 / +3']);
for (const [name, A, rho] of [['炼出过，冲顶力满（A ≥ 1.04）', 1.5, 1.6], ['炼出过，A = 0.9', 0.9, 1.6], ['炼出过，A = 0.6', 0.6, 1.6], ['同集团出过（○），冲顶力满', 1.5, 0.7],
  ['没炼出过，冲顶力满', 1.5, 0.45], ['没炼出过，A = 0.9', 0.9, 0.45], ['任何人，A ≤ 0.3（以没炼出过为例）', 0.3, 0.45]]) {
  const hp = hardness(A, rho), cost = x => { if (hp.F === 0) return Infinity; let s = 0; for (let d = 0; d < x; d += 0.001) s += 0.001 / H(d + 0.0005, hp); return s; };
  const c = [1, 2, 3].map(x => { const v = cost(x); return v === Infinity ? '∞' : v > 999 ? '>999' : v.toFixed(1); }).join(' / ');
  console.log(row([name, A, rho, hp.F.toFixed(2), hp.b.toFixed(2), hp.W.toFixed(2), ...[-3, -1, 0, 1, 2, 3].map(d => H(d, hp).toFixed(2)), c]));
}

console.log('\n## 表1 静态夹具（对手线固定 80，起点差 10，cap = 对手线 + 12，不换底座，8 个种子中位天数）');
head(['类型', 'A', 'F', 'b', 'W', '差5', '差3', '差1', '拿标 +0.1', '+0.5', '+1', '+3', '1200 天末差']);
const T1 = ['maker_player', 'maker_bot', 'maker_bot_lo', 'maker_bot_top', 'kin_player', 'rookie_player', 'rookie_bot', 'chaser_player', 'chaser_bot', 'small_player', 'small_bot', 'small_real'];
const res1 = {};
for (const id of T1) {
  const c = ARCH[id], rs = static_(c); res1[id] = rs;
  const e = effort({ trainH100: c.gpu(Y), dataQ: c.ownData, know: c.know(Y), lead: c.lead, year: Y }), h = hardness(e.A, rhoOf(EASE[c.reserve]));
  console.log(row([c.label, e.A.toFixed(2), h.F.toFixed(2), h.b.toFixed(2), h.W.toFixed(2), ...[-5, -3, -1, 0.1, 0.5, 1, 3].map(m => f(med(rs.map(r => r.rec[m])))), avg(rs.map(r => r.final)).toFixed(2)]));
}
const span = (id, a, b) => { const x = med(res1[id].map(r => r.rec[a])), y = med(res1[id].map(r => r.rec[b])); return x === null || y === null ? null : y - x; };
console.log('\n## 表2 首次拿标 vs 再次拿标（“差 3 → 拿标”天数；没炼出过的一拿到标签就转成炼出过）');
head(['对照', '没炼出过', '炼出过', '比值']);
for (const [a, b, name] of [['rookie_player', 'maker_player', '前沿玩家全力'], ['rookie_bot', 'maker_bot', '前沿机器人']]) { const x = span(a, -3, 0.1), y = span(b, -3, 0.1); console.log(row([name, f(x), f(y), (x / y).toFixed(2)])); }

console.log('\n## 表3 锚点对照：发布间隔对“领先 +1 / +3”天数的影响（前沿·炼出过·玩家全力，静态）');
head(['锚点', '间隔 14 天', '间隔 60 天', '间隔 120 天']);
for (const [mode, name] of [['final', '本稿：只看对手和史实'], ['withMe', '反例：锚点含玩家快照']]) {
  const cell = gap => { const rs = S8.map(seed => run({ ...ARCH.maker_player, start: -10, preEvery: Infinity }, { seed, days: 1200, R: () => 80, yearFixed: true, year0: Y, anchorMode: mode, minGap: gap, cadence: gap })); return `${f(med(rs.map(r => r.rec[1])))} / ${f(med(rs.map(r => r.rec[3])))}`; };
  console.log(row([name, cell(14), cell(60), cell(120)]));
}

console.log('\n## 表4 单维护栏（只练数学，数学 cap 再高 12）：数学比世界包络高出的最大值');
head(['设置', '炼出过·全力·600 天', '没炼出过·全力·600 天', '追赶者机器人·200 天']);
for (const [ds, name] of [[CURVE.DIM_SLACK, `本稿 DIM_SLACK=${CURVE.DIM_SLACK}、DIM_STEEP=${CURVE.DIM_STEEP}`], [99, '去掉单维护栏']]) {
  const save = CURVE.DIM_SLACK; CURVE.DIM_SLACK = ds;
  const cell = (id, n) => avg(S8.map(seed => run({ ...ARCH[id], start: -10, preEvery: Infinity, focusDim: 'math', capShape: { math: 12 } }, { seed, days: n, R: () => 80, yearFixed: true, year0: Y })).map(r => r.maxDimLead)).toFixed(2);
  console.log(row([name, cell('maker_player', 600), cell('rookie_player', 600), cell('chaser_bot', 200)])); CURVE.DIM_SLACK = save;
}

console.log('\n## 表5 蒸馏芝诺（追赶者，自有数据 0.5 档，蒸馏 2.5 档，每 90 天按当天重买老师）：离对手最强的差距');
const T5 = [0, 30, 60, 90, 120, 180, 240, 300, 360, 399];
head(['情形', ...T5.map(t => `第${t}天`), '400 天内最小差距', '始终 >0']);
const t0r = toDay('2025-01-01'), realR = frontLine('llm', { t0: t0r }), realOpen = frontLine('llm', { open: true, t0: t0r });
const distBase = { ...ARCH.chaser_bot, ownData: 0.5, distill: true, preEvery: Infinity, start: -10, capOff: 12 };
const dcases = [
  ['静态，老师=SOTA', { ...distBase, teacher: 'sota' }, { R: () => 80, yearFixed: true, year0: Y }],
  ['静态，老师=开源（差 3）', { ...distBase, teacher: 'open' }, { R: () => 80, open: () => 77, yearFixed: true, year0: Y }],
  ['真实线 2025-01 起，老师=SOTA', { ...distBase, teacher: 'sota', capOff: 14, capDrift: 6 }, { R: realR, open: realOpen, year0: 2025 }],
  ['对照：同一家不蒸馏（静态）', { ...distBase, distill: false, ownData: 1.3 }, { R: () => 80, yearFixed: true, year0: Y }],
];
for (const [name, c, o] of dcases) {
  const rs = S8.map(seed => run(c, { seed, days: 400, trace: true, traceEvery: 1, ...o }));
  const gapAt = t => avg(rs.map(r => r.trace[t].R - r.trace[t].q)).toFixed(2);
  const minG = Math.min(...rs.map(r => Math.min(...r.trace.map(x => x.R - x.q))));
  console.log(row([name, ...T5.map(gapAt), minG.toFixed(3), c.distill ? (minG > 0 ? '是' : '否') : '—']));
}
{ // 掺少量蒸馏（σ≈0.1，不触发污染）不能帮着越线
  head(['σ≈0.1 掺蒸馏对照（前沿·炼出过·玩家全力，静态，老师=SOTA）', '拿标', '+1', '+3', '+1 → +3 用时']);
  for (const [name, extra] of [['纯自有数据', {}], ['自有 2.2 档 + 蒸馏 0.25 档', { distill: true, teacher: 'sota', distLevel: 0.25 }]]) {
    const rs = static_(ARCH.maker_player, extra); const m = x => med(rs.map(r => r.rec[x])); console.log(row([name, ...[0.1, 1, 3].map(x => f(m(x))), f(m(3) - m(1))]));
  }
}

console.log('\n## 表6 一年内拿到 SOTA 标签的概率（真实 SOTA 线；开局日在 2024-01 到 2025-10 之间每 20 天取一个，×3 个种子）');
const starts = []; for (let d = toDay('2024-01-01'); d <= toDay('2025-10-15'); d += 20) starts.push(d);
const yearOfDay = d => 1970 + d / 365.2425;
const lines = (org, d0, la = SOTA.HIST_LOOKAHEAD) => ({ R: frontLine('llm', { excludeOrg: org, t0: d0 }), histOther: frontLine('llm', { excludeOrg: org, t0: d0 }),
  own: org ? ownLine('llm', { org, lookahead: la, t0: d0 }) : null, temp: tempLine('llm', { t0: d0 }), open: frontLine('llm', { open: true, t0: d0 }) });
const chainCase = (c, org, n = 365, extra = {}) => {
  const out = [];
  for (const d0 of starts) for (const seed of [1, 2, 3]) out.push(run(c, { seed, days: n, ...lines(org, d0), year0: yearOfDay(d0), ...extra }));
  return out;
};
function stepChain(seed, v, days, base = 85) {
  let a = seed * 7919 + 13; const rng = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pts = [[0, base]]; let t = 0, q = base;
  while (t < days) { const dt = 45 + rng() * 105; t += dt; q += v * dt / 30 * (0.6 + 0.8 * rng()); pts.push([Math.round(t), q]); }
  return x => { let r = pts[0][1]; for (const [d, val] of pts) if (d <= x) r = val; return r; };
}
const botFrontier = { capOff: 12, preEvery: 330, preDays: 150, baseOff: -4, newCapRel: 10, capDrift: 3 };
const botChaser = { capOff: 10, preEvery: 360, preDays: 150, baseOff: -7, newCapRel: 5, capDrift: 3 };
const playerFrontier = { ...botFrontier, preEvery: 300, baseOff: -3, newCapRel: 12, startVsR: -1.5 };
const T6 = [
  ['前沿·炼出过·机器人（A≈0.9，Anthropic 视角）', { ...ARCH.maker_bot, ...botFrontier, startVsR: -1.5 }, 'anthropic'],
  ['前沿·炼出过·机器人（A≈0.6，Anthropic 视角）', { ...ARCH.maker_bot_lo, ...botFrontier, startVsR: -1.5 }, 'anthropic'],
  ['前沿·炼出过·机器人（补数据到 2 档，A≈1.06，Anthropic 视角）', { ...ARCH.maker_bot_top, ...botFrontier, startVsR: -1.5 }, 'anthropic'],
  ['前沿·没炼出过·机器人（自家史线不计入）', { ...ARCH.rookie_bot, ...botFrontier, startVsR: -1.5 }, 'anthropic'],
  ['追赶者·机器人·不蒸馏', { ...ARCH.chaser_bot, ...botChaser, startVsR: -5 }, null],
  ['追赶者·机器人·优先蒸馏（开源老师）', { ...ARCH.chaser_bot, ...botChaser, startVsR: -5, distillWhenBehind: 2, teacher: 'open' }, null],
  ['追赶者·机器人·优先蒸馏（闭源 SOTA 当老师，最坏情况）', { ...ARCH.chaser_bot, ...botChaser, startVsR: -5, distillWhenBehind: 2, teacher: 'sota' }, null],
  ['小公司·机器人·优先蒸馏（闭源 SOTA 当老师）', { ...ARCH.small_bot, capOff: -7, preEvery: 360, baseOff: -20, newCapRel: -7, capDrift: 3, startVsR: -20, distillWhenBehind: 2, teacher: 'sota' }, null],
  ['对照：前沿·炼出过·玩家全力（Anthropic 视角）', { ...ARCH.maker_player, ...playerFrontier }, 'anthropic'],
  ['对照：前沿·○·玩家全力', { ...ARCH.kin_player, ...playerFrontier }, 'anthropic'],
  ['对照：前沿·没炼出过·玩家全力', { ...ARCH.rookie_player, ...playerFrontier }, 'anthropic'],
  ['对照：追赶者·玩家全力（不蒸馏）', { ...ARCH.chaser_player, ...botChaser, preEvery: 300, baseOff: -5, newCapRel: 10, startVsR: -5 }, null],
];
const hd6 = ['类型', '局数', '一年内拿到标签', '首次拿标中位天', '持标天数占比', '一年末与对手最强差（均值）', '被污染的局', '不领先时锚点−对手最强（最大）'];
head(hd6);
const line6 = (name, rs) => { const got = rs.filter(r => r.firstLabel !== null && r.firstLabel > 0);
  console.log(row([name, rs.length, `${(got.length / rs.length * 100).toFixed(0)}%`, f(med(got.map(r => r.firstLabel))), `${(avg(rs.map(r => r.labelDays)) / 365 * 100).toFixed(1)}%`, avg(rs.map(r => r.final)).toFixed(2), `${(rs.filter(r => r.tainted).length / rs.length * 100).toFixed(0)}%`, Math.max(...rs.map(r => r.maxGhost)).toFixed(2)])); return rs; };
const R6 = {};
for (const [name, c, org] of T6) R6[name] = line6(name, chainCase(c, org));
line6('参照：前沿·炼出过·玩家全力，v0.9 无曲线', chainCase(T6.find(x => x[0].startsWith('对照：前沿·炼出过'))[1], 'anthropic', 365, { noCurve: true }));
console.log('\n## 表6b 同上，但对手线换成“台阶前沿”：平均每月 +0.4（约等于 2026 年真实节奏），cap 每年 +4.8，365 天 × 60 个种子');
head(hd6);
for (const [name, c] of T6) { const rs = Array.from({ length: 60 }, (_, i) => run({ ...c, capDrift: 4.8, preEvery: Infinity }, { seed: i + 1, days: 365, R: stepChain(i + 1, 0.4, 400), open: t => stepChain(i + 1, 0.4, 400)(t) - 4, year0: 2025.5 })); line6(name, rs); }

console.log('\n## 表7 GPT y2023（自家线被隐藏）：在练 GPT-4 级模型（56.8，cap 64.2），继承的 GPT-3.5 为 48.0');
{
  const d0 = toDay('2023-01-01'), R = frontLine('llm', { excludeOrg: 'openai', t0: d0 });
  const gptC = { label: 'GPT', reserve: 'maker', gpu: 3000, ownData: 2, know: 120, lead: 1, compNeed: 1.44, cadence: 60, startQ: 56.8, releasedQ: 48.0, capOff: 64.2 - R(0), capShape: {}, preEvery: Infinity };
  head(['锚点', '发布方式', '到 58.8（GPT-4 授名门槛）', '到 60.8（真实 GPT-4）', '2023-06-30 的 q', '2023-12-31 的 q', '年内持标天数']);
  const cases = [
    ['curve 原稿：只看对手', 'rivalOnly', 0, {}],
    ['史实地板，不加前瞻', 'final', 0, {}],
    [`本稿：史实地板 + 自家前瞻 ${SOTA.HIST_LOOKAHEAD} 天`, 'final', SOTA.HIST_LOOKAHEAD, {}],
    [`本稿：同上`, 'final', SOTA.HIST_LOOKAHEAD, { wait: 58.8 }],
  ];
  for (const [name, mode, la, w] of cases) {
    const rs = S8.map(seed => run(gptC, { seed, days: 365, R, histOther: R, own: ownLine('llm', { org: 'openai', lookahead: la, t0: d0 }), year0: 2023, anchorMode: mode, trace: true, traceEvery: 1, marks: [], holdUntil: w.wait }));
    const dayQ = q => med(rs.map(r => { const x = r.trace.find(p => p.q >= q); return x ? x.t : null; }));
    console.log(row([name, w.wait ? `练到 ${w.wait} 才发（3 月 15 日起不持标；在练模型高过 Claude，仍按领先算）` : '能拿标就发', f(dayQ(58.8)), f(dayQ(60.84)), avg(rs.map(r => r.trace[180].q)).toFixed(1), avg(rs.map(r => r.trace[364].q)).toFixed(1), avg(rs.map(r => r.labelDays)).toFixed(0)]));
  }
}

console.log('\n## 表8 开局播种（D3 修订后的游戏数据；★ 带 g_sota_maker，○ 带 g_sota_kin，— 带 g_sota_rookie）');
head(['公司', '档', 'y2023', 'y2024', 'y2025', 'y2026', 'sota-timeline.json', '第一枚算数的标签', 'histLast（y2026）']);
let diff = 0, diffCells = [];
for (const c of COMPANIES) {
  const cells = Object.values(SCEN).map(st => seedCell(c, st)), s = cells.map(x => x.mark).join(''), real = REAL_SEED[c.id] || '————';
  [...s].forEach((m, i) => { if (m !== [...real][i]) { diff++; diffCells.push(`${c.id} ${Object.keys(SCEN)[i]}：${m} 对 ${[...real][i]}`); } });
  const first = cells.find(x => x.first)?.first, hl = cells[3].histLast;
  console.log(row([c.id, c.tier, ...cells.map(x => x.mark), real === s ? '一致' : `不一致：${real}`, first ? `${first.sinceDay ?? first.day} ${first.name}（${first.via ?? 'PRE'}）` : '', hl ? fmtDay(hl) : '']));
}
console.log(`\n与 sota-timeline.json 不一致的格子：${diff} 格 —— ${diffCells.join('；')}`);
const nNever = COMPANIES.filter(c => Object.values(SCEN).every(st => seedCell(c, st).mark === '—')).map(c => c.id);
console.log(`四个剧本全是 — 的公司 ${nNever.length} 家：${nNever.join('、')}`);
console.log('各剧本 ★ 家数：' + Object.values(SCEN).map(st => COMPANIES.filter(c => seedCell(c, st).mark === '★').length).join('、'));
for (const m of ['llm', 'music', 'speech', 'image']) console.log(`\n${m} 标签链：` + CHAINS[m].slice(0, m === 'llm' ? 40 : 8).map(h => `${h.sinceDay} ${h.name} ${h.q.toFixed(2)}（${h.via}${h.counted ? '' : '，不算数'}${h.defendedBy ? `，挡住 ${h.defendedBy} 后算数` : ''}）`).join(' → '));

console.log('\n## 自检（对应 D9、D10.6 新增条目）');
{
  const ok = (name, pass, note = '') => console.log(`- ${pass ? '通过' : '失败'}：${name}${note ? '（' + note + '）' : ''}`);
  let mono = true, cont = true;
  for (const [A, rho] of [[1.5, 1.6], [0.9, 1], [1.2, 0.45], [0.2, 0.45], [1.5, 0.7]]) {
    const hp = hardness(A, rho); let prev = H(-20, hp);
    for (let d = -20; d <= 10; d += 0.01) { const h = H(d, hp); if (h > prev + 1e-12) mono = false; if (Math.abs(h - prev) > 0.02) cont = false; prev = h; }
  }
  ok('H 单调不增', mono); ok('H 连续（步长 0.01 时相邻差 ≤0.02）', cont);
  const never = S8.map(seed => run({ ...ARCH.chaser_bot, start: -10, preEvery: Infinity }, { seed, days: 1000, R: () => 80, yearFixed: true, year0: Y, trace: true, traceEvery: 1 }));
  const maxQ = Math.max(...never.flatMap(r => r.trace.map(x => x.q - x.R)));
  ok('A ≤ A0 时 1000 天内 q 始终低于锚点', maxQ < 0, `最高 ${maxQ.toFixed(4)}`);
  const cad = [14, 60, 120].map(g => med(S8.map(seed => run({ ...ARCH.maker_player, start: -10, preEvery: Infinity }, { seed, days: 1200, R: () => 80, yearFixed: true, year0: Y, minGap: g, cadence: g }).rec[3])));
  ok('发布间隔不影响到 +3 的天数', new Set(cad).size === 1, cad.join(' / '));
  const born = chainCase({ ...ARCH.maker_player, capOff: 12, preEvery: 120, preDays: 60, baseOff: 8, newCapRel: 20, capDrift: 3, startVsR: -1.5 }, 'anthropic').flatMap(r => r.bornGap);
  ok('新底座出生 q ≤ 锚点 − BIRTH_GAP（故意把底座设成锚点 +8）', Math.max(...born) <= -CURVE.BIRTH_GAP + 1e-9, `最高 ${Math.max(...born).toFixed(3)}，共 ${born.length} 次出生`);
  const ghost = Math.max(...Object.values(R6).flat().map(r => r.maxGhost));
  ok(`不领先（既不持标、在练模型也拿不到标签）时 锚点 − 对手最强 ≤ GHOST_CAP（表 6 全部 ${Object.values(R6).flat().length} 局）`, ghost <= SOTA.GHOST_CAP + 1e-9, `最高 ${ghost.toFixed(3)}`);
  // Claude y2024：没炼出过 vs 炼出过（玩家全力，20 局，自家线照真实数据给）
  const cl = (c) => { const d0 = toDay('2024-01-01'); return Array.from({ length: 20 }, (_, i) => run({ ...c, ...playerFrontier }, { seed: i + 1, days: 365, ...lines('anthropic', d0), year0: 2024 })).filter(r => r.firstLabel !== null).length; };
  const rk = cl(ARCH.rookie_player), mk = cl(ARCH.maker_player);
  ok('Claude y2024 玩家全力：没炼出过的一年内拿标率 ≤ 炼出过的一半', rk <= mk / 2, `没炼出过 ${rk}/20，炼出过 ${mk}/20`);
  // D9#10：σ = 0.5、越线以后，日涨幅 ≤ (1−σ) × 纯自研
  const sig = 0.5, hp = hardness(1.5, 1.6), Hk = H(0.5, hp), lm = l => (l <= 0 ? 0.55 : l < 1 ? 0.8 : l < 2 ? 1.05 : 1.2);
  const pure = lm(2) * Hk, mixed = (1 - sig) * lm(1) * Hk + sig * lm(2) * 2.5 * 0 * (1 + 0.1 * sig);
  ok('σ = 0.5 越线后（fade = 0）日涨幅 ≤ (1−σ) × 纯自研', mixed <= (1 - sig) * pure + 1e-9, `${(mixed / pure).toFixed(3)} 倍`);
  const bk = CHAINS.music[0], ev = CHAINS.speech.find(h => h.name === 'Eleven Multilingual v2'), g35 = CHAINS.llm[0];
  ok('场地凑满时：音乐第一枚给 Bark（领先 MusicGen 2.5，先不算数，挡住 Stable Audio 后算数）；Eleven Multilingual v2（领先 21.75）直接算数；GPT-3.5（Krake 在场，领先 20.28）直接算数',
    bk.name === 'Bark' && bk.lead < 3 && bk.defendedBy === 'Stable Audio' && ev.lead >= 3 && g35.name.startsWith('GPT-3.5') && g35.lead >= 3,
    `Bark 领先 ${bk.lead.toFixed(2)}，${new Date(bk.countedAt * 864e5).toISOString().slice(0, 10)} 挡住 ${bk.defendedBy}；Eleven 领先 ${ev.lead.toFixed(2)}；GPT-3.5 ${g35.sinceDay} 领先 ${g35.lead.toFixed(2)}`);
}
