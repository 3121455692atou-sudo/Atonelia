// 世界原型（M0 的脚本，M1a 起改走正式的 world/index.js）：三家从零开局，跑在同一个世界里。
// 两段式日结、世界账本、技术账本、学界都在 src/career/world/；这里只负责开局、推进和打印。
// 运行：node scripts/world_proto.mjs [--days 730] [--seed 11]
import * as E from '../src/career/engine.js';
import { addDays, daysBetween } from '../src/career/sim/clock.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const DAYS = Math.max(1, Number(arg('--days', 730)));
const SEED = Number(arg('--seed', 11));
const START = '2023-01';
const r1 = x => Math.round(x * 10) / 10;
const money = v => (Math.abs(v) >= 1e8 ? `${r1(v / 1e8)}亿` : `${Math.round(v / 1e4)}万`);

const SPECS = [
  { name: '晨星智能', brand: '晨星', country: 'CN', tier: 'specialist', kind: 'bot' },
  { name: '北岭实验室', brand: '北岭', country: 'US', tier: 'specialist', kind: 'bot' },
  { name: '蓝鲸 AI', brand: '蓝鲸', country: 'EU', tier: 'specialist', kind: 'bot' },
];
const world = E.createWorld({ seed: SEED, start: START, days: DAYS, companies: SPECS });
const out = [];
const say = (...a) => out.push(a.join(' '));
let finished = false;
let errors = 0;

try {
  const startBest = world.acad.start;
  let worldBestSeen = -Infinity, lastUp = null, stallMax = 0, stallFrom = null;
  let firstRelease = null, firstQ = null;
  const monthly = [];
  let curMonth = world.day.slice(0, 7);
  const relLog = [];

  for (let i = 0; i < DAYS; i++) {
    const D = world.day;
    const res = E.tick(world);
    if (res.paused) { say(`${D} 真人的卡片没处理完，世界暂停。`); break; }
    for (const x of res.fresh || []) {
      firstRelease ??= D;
      firstQ ??= x.meta.q;
      relLog.push(`${D} ${x.c.id} 发布 ${x.m.name} q=${r1(x.meta.q)} ${x.m.open ? '开源' : '闭源'}${x.meta.kin.length ? ` 血统含 ${x.meta.kin.join(',')}` : ''}${x.lab?.result ? ` → 标签:${x.lab.result}` : ''}`);
    }
    const best = E.worldBest(world, D);
    if (Number.isFinite(best)) {
      if (best > worldBestSeen + 1e-9) { worldBestSeen = best; lastUp = D; }
      const stall = lastUp ? daysBetween(lastUp, D) : 0;
      if (stall > stallMax) { stallMax = stall; stallFrom = lastUp; }
    }
    if (world.day.slice(0, 7) !== curMonth) {
      const h = world.label.holder;
      monthly.push(`${curMonth} | ${h ? `${h.name}(${h.org}) ${r1(h.q)}${h.counted ? ' 算数' : ' 未算数'}` : '无'} | 公司最强 ${Number.isFinite(best) ? r1(best) : '—'} 学界 ${r1(world.acad.q)} | ${Object.values(world.companies).map(c => `${c.brand} ${money(c.s.cash)}`).join(' | ')}`);
      curMonth = world.day.slice(0, 7);
    }
  }
  finished = true;

  const lastDay = addDays(world.day, -1);
  const endBest = E.worldBest(world, lastDay);
  const cs = Object.values(world.companies);
  errors = cs.reduce((a, c) => a + c.errors.length, 0) + world.errors.length;
  const years = Math.max(1, daysBetween(`${START}-01`, lastDay) + 1) / 365;
  const annual = Number.isFinite(endBest) ? (endBest - startBest) / years : 0;
  const swaps = world.label.log.filter(x => x.via === 'swap').length;
  const steady = world.label.log.filter(x => x.via === 'steady').length;
  const made = Object.fromEntries(Object.entries(world.label.made).map(([k, v]) => [k, v.length]));

  say(`=== world_proto：一个世界、${cs.length} 家公司（种子 ${SEED}，2023-01 从零开局，初创档，${DAYS} 天到 ${lastDay}）`);
  say(`Provider：SimProvider（mode=sim，labelMode=world，scheduleRivals=false，followerClamp=false，techSelf=true）`);
  say(`公司：${cs.map(c => `${c.id}=${c.name}（${c.country}，${c.s.route?.stance ?? '—'}）`).join('；')}`);
  say(`${world.day.slice(0, 4)}-01-01 起点 q=${r1(world.acad.start)}（世界账本初始化：${Object.keys(world.tech).length} 项技术有公开等级）`);
  say('\n--- 每月：日期 | SOTA 持有者 | 公司最强 / 学界 | 各家现金');
  for (const l of monthly) say(l);
  say('\n--- 发布流水（世界账本，同一天按 q 从高到低）');
  for (const l of relLog.slice(0, 40)) say(l);
  if (relLog.length > 40) say(`……共 ${relLog.length} 条`);
  say('\n--- 学界与开源社区');
  for (const l of world.acad.log) say(l);
  say('\n--- 技术账本（开局初始化之后真正发生的升档）');
  for (const l of world.techLog.slice(0, 20)) say(l);
  if (world.techLog.length > 20) say(`……共 ${world.techLog.length} 条`);
  say('\n--- 汇总');
  say(`SOTA 换手（换成别家）：${swaps} 次；稳坐算炼出 ${steady} 次；炼出过：${JSON.stringify(made)}`);
  say(`世界最强连续不涨最长：${stallMax} 天（从 ${stallFrom ?? '—'} 起）`);
  say(`进步速度：学界起点 ${r1(startBest)} → 期末 ${Number.isFinite(endBest) ? r1(endBest) : '—'}；每年 ${r1(annual)} 分`);
  say(`第一款公司发布：${firstRelease ?? '—'}${firstQ ? `（q=${r1(firstQ)}）` : ''}；SOTA 第一次挂上：${world.label.holder?.since ?? '—'}`);
  say(`技术账本事件：${world.techLog.length} 次升档，技术扩散 ${world.acad.gains.length} 项`);
  say(`报错：${errors} 次（0 报错 = 全部公司 errors 为空）`);
  for (const c of cs) {
    const live = E.liveModel(c.s);
    say(`${c.id} ${c.s.status} 现金 ${money(c.s.cash)} 在线 ${live?.name ?? '—'} ${live ? r1(E.qOf('llm', live.dims)) : ''} 发布 ${c.s.models.filter(m => m.stage === 'released' && !m.hist).length} 款 报错 ${c.errors.length}${c.errors.length ? ` 例：${c.errors[0]}` : ''}`);
  }
  if (errors) process.exitCode = 1;
} finally {
  E.setProvider();
}
console.log(out.join('\n'));
if (!finished) process.exitCode = 1;
