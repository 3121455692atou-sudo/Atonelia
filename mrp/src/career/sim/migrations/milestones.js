// 读档特性步骤「milestones」（规格 E8，P1.4）：只在结构版本到 4 以后执行（见 migrate.js）。要求幂等：同一份存档跑两遍结果相同。
//   1. 并进 super_sota 的“东方登顶”（super_cn_first）出过的，记成 super_sota 出过（v0.9.2 改动包的超事件积压补演字段由 v3→v4 结构步骤丢弃，F6）；
//      队列和排期里还没演的那张改写成 super_sota 的 cn 变体照常弹（删掉的 super_open_crown、super_reasoning_pioneer 照旧在读档清理时丢掉）；
//   2. 里程碑账本里已经删掉的里程碑（ms_export_resume）拿掉；
//   3. 用存档日期跑 initMilestones：新里程碑 ms_open_reasoning_frontier 在存档日之前（含当天）已经发生的，静默记在做到的那家名下；
//      “开局以后第一次炼出 SOTA”已经成立的（cond 的 sotaMade: 'first'），静默记下 ms_first_sota，不弹卡。已经记过的里程碑不动。
import { MS_BY_ID } from '../../data/milestones.js';
import { initMilestones } from '../milestones.js';
import { addDays } from '../clock.js';

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

// 改写成 super_sota 的 cn 变体（改的是原对象，跑第二遍时已经不是 super_cn_first，什么都不做）。
const cnFirst = q => isObj(q) && q.kind === 'super' && q.id === 'super_cn_first';
const toCnSota = q => Object.assign(q, { id: 'super_sota', v: 'cn', params: isObj(q.params) ? q.params : {} });

export function run(s) {
  if (isObj(s.marks) && s.marks['super:super_cn_first']) s.marks['super:super_sota'] ??= s.marks['super:super_cn_first'];
  for (const q of Array.isArray(s.queue) ? s.queue : []) if (cnFirst(q)) toCnSota(q);
  for (const x of Array.isArray(s.scheduled) ? s.scheduled : []) if (cnFirst(x?.item)) toCnSota(x.item);
  if (!isObj(s.ms)) s.ms = {};
  for (const id of Object.keys(s.ms)) if (!MS_BY_ID[id] || !isObj(s.ms[id])) delete s.ms[id];
  if (typeof s.day === 'string') initMilestones(s, addDays(s.day, 1));
}
