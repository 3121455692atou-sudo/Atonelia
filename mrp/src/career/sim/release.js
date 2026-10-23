// 跑分与发布：现在能做什么、主线能不能送评、跑分记成绩、发布流程（评完发布和跳过评测都走 releaseNow）、附技术报告、灰度上线。
// 送评和评测期在 evals.js（规格 T6）。
import { PRODUCTS } from '../data/core.js';
import { noteBreakthrough } from './capital.js';
import { BENCH_BY_ID, lastRefresh } from '../data/benchmarks.js';
import { clamp, scaleBrand } from './util.js';
import { addDays, daysBetween } from './clock.js';
import { deployDays } from '../data/supply.js';
import { clsOf, workingModel, liveModel, smallLive, runBenchmark, suiteFor, myRank } from './model.js';
import { publishPapers } from './research.js';
import { log } from './log.js';
import { useGrant, namingTick, ensureNaming, normName } from './naming.js';
import { milestoneFire } from './queue.js';
import { setProduct } from './service.js';
import { labelOnRelease, qOf, relRole } from './sota.js';
import { judgeRelease } from './expect.js';
import { afterRelease as exclusiveAfterRelease } from './exclusive.js';
import { releaseOpen, flagshipReplaced } from './route.js';
import { applyEffects } from './effects.js';
import { EVAL } from '../data/balance.js';
import { hasBaseJob, smallModels, postJobs } from './jobs.js';
import { submitBlock } from './evals.js';
import { P } from './provider.js';

export function availableActions(s) {
  const w = workingModel(s);
  return {
    train: !!w && w.stage === 'post',
    pretrain: hasBaseJob(s, 'main'),
    data: true, maintain: true, research: true,
    eval: !!liveModel(s),
    // 发布改成送评（T6）：主线能不能送评；有没有能送评的小模型。
    release: !releaseBlock(s),
    releaseSmall: smallModels(s).length > 0,
  };
}
// 主线现在为什么不能送评（能送评返回空串）：后训练满两周（RELEASE_GAP 加特质的 releaseGapDays，不低于 0）、这一条线没有正在评测的候选。
// 不再查“上一个版本还在灰度”：评完那天还在灰度的，发布时顺延（T6.2）。
export function releaseBlock(s) {
  const w = workingModel(s);
  if (!w || w.stage !== 'post') return '没有在后训练的模型';
  return submitBlock(s, w, 'main');
}

export function dailyDeploy(s, out) {
  // 命名的每日检查（naming.js）：开发期存档换成新命名、作废过期或做不成了的授名。
  namingTick(s, out);
  if (!s.deploy.length) return;
  for (const d of s.deploy.filter(x => x.until <= s.day)) {
    if (d.role === 'small') s.smallLive = d.id;
    else {
      const prev = s.live, first = !prev;
      s.live = d.id;
      // 路线 delayed：被顶掉的闭源旗舰记下开放日（规格 B5）。
      if (prev && prev !== d.id) flagshipReplaced(s, prev);
      if (first) {
        for (const p of PRODUCTS[s.mod]) {
          if (p.id === 'gpu_lease' || p.need || p.from > s.date) continue;
          if (p.id === 'chat' && s.company.country === 'CN' && P().gate('cnFiling', s) && s.service.filing !== 'done') { setProduct(s, 'chat', { on: true }); continue; }
          s.products[p.id].on = true;
        }
        if (s.inferShare < 0.4) s.inferShare = 0.4;
      }
    }
    out.notes.push(`${d.name} 已经全量上线。`);
    log(s, `${d.name} 全量上线`);
  }
  s.deploy = s.deploy.filter(x => x.until > s.day);
}

export function doEval(s, benchId, opts = {}) {
  const m = opts.role === 'small' ? smallLive(s) : liveModel(s);
  const b = BENCH_BY_ID[benchId];
  if (!m || !b || s.date < b.from || b.mod !== s.mod) throw new Error('现在不能跑这个评测');
  const run = runBenchmark(s, benchId, m, opts);
  s.cash -= run.cost;
  publish(s, run, m);
  if (opts.arenaVariant) s.flags.arenaVariant = s.date;
  log(s, `跑分：${b.name} ${run.score}`);
  return { kind: 'eval', run, rank: myRank(s, benchId, null, m.role || 'flagship', m.id), classRank: myRank(s, benchId, clsOf(m), m.role || 'flagship', m.id) };
}
// 记成绩：每款模型自己留着换题后最好的一次（榜单上旧旗舰不会被新发的轻量款挤掉），s.published 记这个角色最近公开的那次。
export function recordRun(s, run, m) {
  const b = run.bench;
  const own = (m.benchmarks ||= {});
  const mine = own[run.benchId];
  if (!mine || mine.date < lastRefresh(b, run.date) || (b.kind === 'lower' ? run.score < mine.score : run.score > mine.score))
    own[run.benchId] = { benchId: run.benchId, score: run.score, model: m.name, modelId: m.id, role: m.role || 'flagship', cls: run.cls, date: run.date };
  const key = m.role === 'small' ? `${run.benchId}@small` : run.benchId;
  const prev = s.published[key];
  const better = !prev || prev.modelId !== m.id || prev.date < run.date || (b.kind === 'lower' ? run.score < prev.score : run.score > prev.score);
  if (better) s.published[key] = run;
}
export function publish(s, run, m) {
  recordRun(s, run, m);
  // 只有这一款自己独占第一才算“登顶”，并列第一不算；副线和小模型（发布角色 small，规格 D1）不算。
  const r = myRank(s, run.benchId, null, m.role || 'flagship', m.id);
  if (relRole(m) !== 'small' && r && r.rank === 1 && r.tied === 1 && !s.marks[`viral_${run.benchId}`] && ['arena', 'swebv', 'aime25', 'aime26', 'hle', 'imgarena', 'musicarena', 'ttsarena', 'gpqa', 'tbench'].includes(run.benchId)) {
    s.marks[`viral_${run.benchId}`] = s.day;
    s.queue.push({ kind: 'event', id: 'viral', params: { bench: run.bench.name } });
  }
}
// 要比的“在线旗舰”：在线旗舰和正在灰度、全量后就会成为在线旗舰的那几款里最强的一款（不算 m 自己）；都没有为 null。
function flagshipRef(s, m) {
  let best = liveModel(s);
  for (const d of s.deploy || []) {
    if (d.role === 'small' || d.id === m?.id) continue;
    const x = s.models.find(y => y.id === d.id);
    if (x && (!best || qOf(s.mod, x.dims) > qOf(s.mod, best.dims))) best = x;
  }
  return best;
}
// 这一版发布会不会顶替在线旗舰（规格 D1）→ 'main' | 'side'。没有在线旗舰、或不弱于在线旗舰（qOf 比较）就顶替；
// 弱于在线旗舰时默认作为副线发布，只有玩家勾了“顶替在线旗舰”（opts.replace）才顶替。顾问和机器人永远不传 replace。
// 有旗舰正在灰度时（小模型线发布可能碰上），和它们里较强的一款比：弱于正在灰度的那款，全量后也会被它顶掉，不能判成顶替。
export function releaseLine(s, m, opts = {}) {
  const live = flagshipRef(s, m);
  if (!live || live.id === m?.id || qOf(s.mod, m.dims) >= qOf(s.mod, live.dims)) return 'main';
  return opts.replace ? 'main' : 'side';
}
// 发布当天名字和别的发布重了（评测期间别的版本先用了这个名字）：按 C1 的旧写法加日期后缀（-YYMM，再重就接一个字母），提示一次。
function dedupeName(s, name, selfId) {
  const taken = n => (s.models || []).some(x => x.stage === 'released' && x.id !== selfId && typeof x.name === 'string' && normName(x.name) === normName(n));
  if (!taken(name)) return name;
  const tag = `${name}-${s.date.slice(2, 4)}${s.date.slice(5, 7)}`;
  for (const c of ['', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) if (!taken(tag + c)) return tag + c;
  return `${tag}-${s.day.slice(8, 10)}`;
}
// 发布流程本身（T6.2；评完发布和“跳过”都走它）：用送评时冻结的方案 ev.plan，不再重新校验名字和授名，也不查 RELEASE_GAP（送评时查过）。
// 顺序固定（规格 D10.3）：起名 → 建快照、公布成绩 → labelOnRelease（SOTA 标签，按发布当天的对手）→ 发布品牌 → judgeRelease（市场期待）
// → 灰度上线、技术报告 → afterRelease：里程碑（fire）、专属事件。快照写 evalTier。
// 槽位（D1）：顶替在线旗舰的（line = 'main'）进 deploy，全量上线那天 s.live 指向它；碰上还在灰度的旗舰，until 顺延到前一款之后（不抛错）。
// 训练线的副线不进 deploy、不占服务槽，成绩照常公布；小模型线的副线进 smallLive，碰上小模型灰度同样顺延。
export function releaseNow(s, { ev }) {
  // 自洽模式（规格 M.4 第 3 步）：标签和期待判定挪到收盘；这里只把发布建出来。
  const worldMode = P().labelMode === 'world';
  // 开发期存档读进来马上发布的，先换成新命名（naming.js）。
  ensureNaming(s);
  const plan = ev.plan || {};
  const tier = ev.tier;
  let note = '';
  if (ev.line === 'small') {
    const sw = s.models.find(x => x.id === ev.modelId);
    if (!sw) throw new Error('没有这个待发布的小模型');
    const line = releaseLine(s, sw, { replace: plan.replace });
    const { open, license } = releaseOpen(s, line, plan.open);
    const name = dedupeName(s, plan.name, sw.id);
    if (name !== plan.name) note = `「${plan.name}」这个名字评测期间被用掉了，发布时改叫「${name}」。`;
    sw.name = name;
    sw.stage = 'released';
    sw.released = s.date;
    sw.releasedDay = s.day;
    sw.techs = [...(ev.techs || s.techs || [])]; // 发布快照记送评那天用上的技术，模型条件的 techs、reasoning 读它（cond.js）
    sw.line = line;
    Object.assign(sw, { open, license });
    if (plan.terms && license === 'restrictive') sw.terms = { ...plan.terms };
    delete sw.evalId;
    sw.evalTier = tier;
    useGrant(s, sw, plan.grant);
    unshelve(s, sw);
    for (const j of postJobs(s).filter(x => x.target === `small:${sw.id}`)) s.jobs.list = s.jobs.list.filter(y => y !== j);
    const runs = suiteFor(s).map(b => runBenchmark(s, b.id, sw));
    for (const r of runs) publish(s, r, sw);
    const lab = worldMode ? { pending: true } : labelOnRelease(s, sw);
    if (lab.got) noteBreakthrough(s, 'sota');          // 规格 K4：拿到 SOTA 后 90 天内融资估值 ×1.4
    if (sw.open) scaleBrand(s, 1 + 0.06 * freshness(s, lastReleased(s, true, sw)));
    if (!worldMode) judgeRelease(s, sw, lab);
    // 顶替旗舰时如果还有旗舰在灰度，这一款不早于它全量；副线碰上小模型灰度也一样顺延（同一天的按进 deploy 的先后）。
    let until = addDays(s.day, deployDays(sw));
    for (const d of s.deploy) if ((line === 'main' ? d.role !== 'small' : d.role === 'small') && d.until > until) until = d.until;
    s.deploy.push({ id: sw.id, role: line === 'main' ? 'flagship' : 'small', until, name: sw.name });
    log(s, line === 'main' ? `发布小模型线的 ${sw.name}，它比在线旗舰强，灰度后顶替旗舰` : `发布小模型 ${sw.name}，开始灰度上线`);
    afterSkip(s, sw, tier);
    releasePapers(s, plan.papers);
    milestoneFire(s, { on: 'release', model: sw });
    exclusiveAfterRelease(s, sw, plan.grant ?? null);
    return { kind: 'release', model: sw, line, until, tier, ...(note ? { note } : {}), runs: runs.map(r => ({ ...r, rank: myRank(s, r.benchId, null, 'small', sw.id), classRank: myRank(s, r.benchId, clsOf(sw), 'small', sw.id) })) };
  }
  const line = releaseLine(s, ev.cand, { replace: plan.replace });
  const { open, license } = releaseOpen(s, line, plan.open);
  const name = dedupeName(s, plan.name, ev.cand.id);
  if (name !== plan.name) note = `「${plan.name}」这个名字评测期间被用掉了，发布时改叫「${name}」。`;
  // 快照 id 按这一款送评过几次往下编（C5）；名字发布后冻结。
  const snap = { ...ev.cand, stage: 'released', released: s.date, releasedDay: s.day, line, name, benchmarks: {} };
  snap.techs = [...(ev.techs || ev.cand.techs || [])]; // 同小模型线：送评那天用上的技术；在练模型 w.techs 仍是底座完成时的快照（D6.1）
  Object.assign(snap, { open, license, evalTier: tier });
  if (plan.terms && license === 'restrictive') snap.terms = { ...plan.terms };
  useGrant(s, snap, plan.grant);
  s.models.push(snap);
  const runs = suiteFor(s).map(b => runBenchmark(s, b.id, snap));
  for (const r of runs) publish(s, r, snap);
  const lab = worldMode ? { pending: true } : labelOnRelease(s, snap);
  if (lab.got) noteBreakthrough(s, 'sota');
  scaleBrand(s, 1 + 0.04 * freshness(s, lastReleased(s, false, snap)));
  if (!worldMode) judgeRelease(s, snap, lab);
  // 副线不上线服务、没有灰度：当天公布就算发完，until 记今天（返回值里 line 写明是副线）。顶替旗舰的碰上还在灰度的旗舰，顺延到它之后。
  let until = line === 'main' ? addDays(s.day, deployDays(snap)) : s.day;
  if (line === 'main') {
    for (const d of s.deploy) if (d.role !== 'small' && d.until > until) until = d.until;
    s.deploy.push({ id: snap.id, role: 'flagship', until, name: snap.name });
  }
  log(s, line === 'main' ? `发布 ${snap.name}，开始灰度上线` : `发布 ${snap.name}（副线：比在线旗舰弱，不替换在线服务）`);
  afterSkip(s, snap, tier);
  releasePapers(s, plan.papers);
  milestoneFire(s, { on: 'release', model: snap });
  exclusiveAfterRelease(s, snap, plan.grant ?? null);
  return { kind: 'release', model: snap, line, until, tier, ...(note ? { note } : {}), runs: runs.map(r => ({ ...r, rank: myRank(s, r.benchId, null, 'flagship', snap.id), classRank: myRank(s, r.benchId, clsOf(snap), 'flagship', snap.id) })) };
}
// 跳过评测的固定代价（T6.5）：口碑 −3、品牌 ×0.97，并进一条新闻。之后这个版本的风险按 min(62, 安全维) 算（riskSafety）。
function afterSkip(s, m, tier) {
  if (tier !== 'skip') return;
  applyEffects(s, EVAL.SKIP_FX, { source: 'release', id: m.id, model: m });
  s.news.unshift({ date: s.date, day: s.day, type: 'controversy', title: `${m.name} 没做安全评测就上线了`, detail: '媒体和安全研究者批评这次发布太草率。' });
}
// 发布出去的小模型从待发布的指针上摘掉：在 smallWorking 就让 smallShelf 的第一个顶上来。
function unshelve(s, m) {
  const shelf = Array.isArray(s.smallShelf) ? s.smallShelf : [];
  if (s.smallWorking === m.id) s.smallWorking = shelf.shift() ?? null;
  s.smallShelf = shelf.filter(id => id !== m.id);
}
// 发布时附上技术报告：把选中的自研首创技术公开。开不开、公开哪些，都由玩家定。
function releasePapers(s, ids) {
  if (!ids?.length) return;
  const done = publishPapers(s, ids);
  if (!done.length) return;
  log(s, `技术报告公开：${done.map(t => t.name).join('、')}`);
  milestoneFire(s, { on: 'paper', techs: done.map(t => t.id) });
}
// 隔了多久才发新版：三个月以上算一次完整的发布；频繁的小版本只带来一部分关注。
// 上一次同类发布那天（E7：不另存 flags.relDay、smallRelDay，读已发布快照的 releasedDay）：旗舰线算主线和副线，
// 小模型线只算开源的那几款；开局继承的型号（hist）不算，except 是这一次正在发的这款。
function lastReleased(s, small, except) {
  let last = null;
  for (const m of s.models) {
    if (m === except || m.hist || m.stage !== 'released' || !m.releasedDay) continue;
    if (small ? !(m.role === 'small' && m.open) : m.role === 'small') continue;
    if (!last || m.releasedDay > last) last = m.releasedDay;
  }
  return last;
}
const freshness = (s, last) => (last ? clamp(daysBetween(last, s.day) / 90, 0.25, 1) : 1);
