// 结构步骤 v3 → v4（规格 E8，P0.3b）。migrate.js 按 while (s.v < SAVE_VERSION) STEPS[s.v](s) 调用，跑完 s.v 记成 4。
// 每一项只认看得懂的旧字段：缺了、坏了都当空的处理，不抛错；同一份存档跑两遍结果相同（幂等）。
//   - done 拆成 seen（经营事件 → 处理过几次）和 marks（viral_*、ban_*、super:*）；旧的 flags['super:*'] 也搬进 marks；
//   - 按月计数的 timers、cooldowns，以及融资、上市的剩余月数，换成到期日（今天 + 30 × 剩余月数），存进 s.due、s.cool；
//   - 队列和排期里：goal 改名 board；first_release_hint、small_ready 改成 notice；旧版历史时刻（history）删掉；
//   - 清掉开局留下的孤儿 work 副本（没人引用、还没发布的 `<id>w`）；
//   - 删除 lastAction、lastReport、grace、data.pending、flags.superEarned；riskMods 并进 risk（compliance 删除）；
//   - 董事会目标补 g.due0（原定的检查月份；宽限过的往回推两个月）。
// 末尾补市场期待的状态 s.expect（旧发布不补评）。
import { addMonths } from '../../data/core.js';
import { EVENTS } from '../../data/events.js';
import { SUPER_BY_ID } from '../../data/super.js';
import { addDays } from '../clock.js';
import { initExpect } from '../expect.js';
import { noticeOf } from '../queue.js';

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const num = v => typeof v === 'number' && Number.isFinite(v);
const MONTH = 30;
const NOTICES = ['first_release_hint', 'small_ready'];

export function toV4(s) {
  const later = n => addDays(s.day, MONTH * Math.max(0, n));
  const flags = isObj(s.flags) ? s.flags : (s.flags = {});

  // 1) done → seen、marks。超事件出的时候就写了 flags['super:<id>']（值是那一天），先搬它，日期更准。
  const seen = isObj(s.seen) ? s.seen : {};
  const marks = isObj(s.marks) ? s.marks : {};
  for (const k of Object.keys(flags)) if (k.startsWith('super:')) { marks[k] ??= flags[k]; delete flags[k]; }
  for (const id of Array.isArray(s.done) ? s.done : []) {
    if (typeof id !== 'string') continue;
    if (/^(viral|ban)_/.test(id)) marks[id] ??= s.day;
    else if (SUPER_BY_ID[id]) marks[`super:${id}`] ??= s.day;
    else if (Object.hasOwn(EVENTS, id)) seen[id] = (num(seen[id]) ? seen[id] : 0) + 1;
    // 其余是里程碑（本来就记在 s.ms）和旧版历史时刻（已删除），不用搬。
  }
  delete s.done;
  s.seen = seen;
  s.marks = marks;

  // 2) 计时器 → 到期日。0 和坏值当作已经到期，丢掉。
  const due = isObj(s.due) ? s.due : {};
  const cool = isObj(s.cool) ? s.cool : {};
  for (const [k, n] of Object.entries(isObj(s.timers) ? s.timers : {})) if (num(n) && n > 0) due[k] ??= later(n);
  for (const [k, n] of Object.entries(isObj(s.cooldowns) ? s.cooldowns : {})) if (num(n) && n > 0) cool[k] ??= later(n);
  delete s.timers;
  delete s.cooldowns;
  const cap = isObj(s.capital) ? s.capital : null;
  for (const [key, k] of [['round', 'funding'], ['ipo', 'ipo']]) {
    const p = cap?.[key];
    if (!isObj(p)) continue;
    if (p.left !== undefined) due[k] ??= later(num(p.left) ? p.left : 0);
    delete p.left;
  }
  s.due = due;
  s.cool = cool;

  // 3) 队列和排期。
  const fix = q => {
    if (!isObj(q)) return q;                       // 坏项留给 migrate.js 的 sanitizeQueue 丢
    if (q.kind === 'history') return null;
    if (q.kind === 'goal') return { ...q, kind: 'board' };
    if ((q.kind ?? 'event') === 'event' && NOTICES.includes(q.id)) {
      try { return noticeOf(s, q.id, isObj(q.params) ? q.params : {}); } catch { return null; }
    }
    return q;
  };
  if (Array.isArray(s.queue)) s.queue = s.queue.map(fix).filter(q => q !== null);
  if (Array.isArray(s.scheduled)) s.scheduled = s.scheduled.flatMap(x => {
    if (!isObj(x) || x.item === undefined) return [x];
    const item = fix(x.item);
    return item === null ? [] : [{ ...x, item }];
  });

  // 4) 孤儿 work 副本：开局同时有在线型号和下一代时，复制出来的 `<id>w` 马上被下一代顶掉，没人引用。
  if (Array.isArray(s.models)) {
    const used = new Set([s.working, s.smallWorking, s.live, s.smallLive].filter(x => typeof x === 'string'));
    s.models = s.models.filter(m => !(isObj(m) && typeof m.id === 'string' && m.id.endsWith('w') && m.stage !== 'released' && !used.has(m.id)));
  }

  // 5) 死状态。
  delete s.lastAction;
  delete s.lastReport;
  delete s.grace;
  if (isObj(s.data)) delete s.data.pending;
  // v0.9.2 改动包的超事件积压补演不收（错过不补演），它记下的待演名单丢掉（规格 F6）。
  delete flags.superEarned;

  // 6) riskMods 并进 risk（乘子相乘；compliance 已删除）。
  const risk = isObj(s.risk) ? s.risk : {};
  for (const [k, v] of Object.entries(isObj(s.riskMods) ? s.riskMods : {})) if (k !== 'compliance' && num(v) && v > 0) risk[k] = (num(risk[k]) ? risk[k] : 1) * v;
  delete s.riskMods;
  s.risk = risk;

  // 7) 董事会目标补 g.due0。
  for (const g of Array.isArray(s.goals) ? s.goals : []) {
    if (!isObj(g) || g.due0 !== undefined || !/^\d{4}-\d{2}$/.test(g.date ?? '')) continue;
    g.due0 = g.grace ? addMonths(g.date, -2) : g.date;
  }

  // 结构步骤末尾：市场期待的状态（旧发布不补评）。
  s.expect ??= initExpect();
}
