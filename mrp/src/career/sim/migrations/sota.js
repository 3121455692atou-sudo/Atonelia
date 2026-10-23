// 读档特性步骤「sota」（规格 E8，P1.1）：只在结构版本到 4 以后执行（见 migrate.js）。要求幂等：同一份存档跑两遍结果相同。
//   1. 已发布模型补 releasedDay（缺的用月份 + 15 日，不晚于存档日；开局继承的史实型号用真实发布日），开局继承的记 m.hist；
//      所有模型按 role 补 origin（flagship → pretrain，small → distill）；已发布快照补 line（旧版每次旗舰发布都顶替在线旗舰：flagship → main，small → side）；
//   2. 里程碑账本里玩家的条目补 modelId；
//   3. 本月对手发布改按真实发布日排期（旧档按月内散列日排的）：还没到日子的按 r.day 重排，已经到日子、新闻还没放出来的补发新闻；
//      新闻已经放过的只排 rel（到日子过标签规则，不再发新闻）。排法和 startOfMonth 一样：同一天按综合分从高到低（标签逐条处理，D10.2），
//      排在同一天的行业大事前面（挂在这条发布上的行业大事要并进它的新闻）；
//   4. 按存档日期回放出 s.sota（holder、log、made、before、seed、kin）和各快照的 m.sota，并冻结已可见跟随者的钳制量 s.world.adj（D5、D10）。
import { RELEASES } from '../../data/rivals.js';
import { COMPANY_BY_ID } from '../../data/core.js';
import { rebuildSota, isMine, qOf } from '../sota.js';
import { releaseEntry } from '../loop.js';

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

export function run(s) {
  if (isObj(s.company) && !s.company.org) s.company.org = COMPANY_BY_ID[s.charId]?.org;
  const models = Array.isArray(s.models) ? s.models : [];
  for (const m of models) {
    if (!isObj(m)) continue;
    m.origin ??= m.role === 'small' ? 'distill' : 'pretrain';
    if (m.stage !== 'released') continue;
    // 开局继承的型号：带真实型号名、没有发布日、不是自研（自研的带 ver）。
    const real = !m.ver && RELEASES.find(r => r.mod === m.mod && r.name === m.name && r.date <= (s.start || s.date));
    if (m.hist === undefined && !m.releasedDay && real) m.hist = true;
    if (!m.releasedDay) {
      const month = typeof m.released === 'string' && /^\d{4}-\d{2}$/.test(m.released) ? m.released : s.date;
      const guess = m.hist && real && real.date === month ? real.day : `${month}-15`;
      m.releasedDay = guess < s.day ? guess : s.day;
    }
    m.line ??= m.role === 'small' ? 'side' : 'main';
  }
  for (const e of Object.values(isObj(s.ms) ? s.ms : {})) {
    if (!isObj(e) || e.who !== 'me' || !e.model || e.modelId) continue;
    const m = models.filter(x => x.stage === 'released' && x.name === e.model).pop();
    if (m) e.modelId = m.id;
  }
  if (Array.isArray(s.scheduled)) {
    // 新闻还没放出来的：排期里带着新闻的条目（只带 rel 的是本步骤上一遍排的、新闻已经放过的，不算），
    // 或者旧档从没排过、s.news 里也没有这条（数据新加的行、原来按 sibling 挡掉的同公司别的模态）。
    const pending = new Set();
    s.scheduled = s.scheduled.filter(x => { if (!x?.rel) return true; if (x.news) pending.add(x.rel); return false; });
    const told = new Set((Array.isArray(s.news) ? s.news : []).filter(n => n?.type === 'release' && typeof n.title === 'string').map(n => n.title));
    const due = RELEASES.filter(r => r.date === s.date && !isMine(s, r.family)).sort((a, b) => a.day.localeCompare(b.day) || qOf(b.mod, b.dims) - qOf(a.mod, a.dims) || a.ord - b.ord);
    const later = [];
    for (const r of due) {
      const e = releaseEntry(r);
      const unsent = pending.has(r.name) || !told.has(e.news.title);
      if (r.day > s.day) later.push(unsent ? { at: r.day, ...e } : { at: r.day, rel: e.rel });
      else if (unsent) (s.news ??= []).unshift(e.news);
    }
    s.scheduled.unshift(...later);
  }
  rebuildSota(s);
}
