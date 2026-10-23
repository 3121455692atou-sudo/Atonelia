// 读档特性步骤「strategy」（规格 E8）：只在结构版本到 4 以后执行（见 migrate.js）。要求幂等：同一份存档跑两遍结果相同。
//   1. initStrategy 按存档日播种：开局特质、国家说明特质、A4.7 第 0 步（按 s.sota.seed 加“炼出过 / 集团出过 / 技术储备不足”），
//      史实日期早于存档日的史实节点记为开局前完成（how 'start'）；不播种进行中的策略（cur 为空，玩家自己挑）；
//   2. 局内已经“集团出过 SOTA”（s.sota.kin 有值）、还带着“技术储备不足”的，换成“集团出过”；
//   3. 已经炼出过 SOTA（sotaMade）、g_sota 还没完成的，以绕过完成（加“炼出过”，去掉另外两档）；
//   4. 入队一条提示“公司策略上线了”：读档时先记 s.strategy.intro，读进来以后第一天推进时（strategyTick）入队，
//      读档本身不往队列里加东西（读档清理队列、比对队列的地方照旧）。
// 已经有策略树的存档（新开局、或者这一步跑过）什么都不做。开发期存档里只有特质、没有策略树的（P1.2 的 g_beyond 试炼会写特质），特质保留。
// G1 以后、P2.2 以前新开的存档记了 mig.strategy 却没有策略树，读档不再跑这一步，由 strategy.js 的 ensureStrategy 在推进第一天时调用它补上。
import { initStrategy, completeNode, hasSpirit, addSpirit, removeSpirit } from '../strategy.js';
import { sotaMade } from '../sota.js';

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

export function run(s) {
  if (!isObj(s) || !Array.isArray(s.models) || typeof s.day !== 'string' || s.strategy?.tree) return;
  if (s.strategy !== undefined && !isObj(s.strategy)) delete s.strategy;
  if (!initStrategy(s, { asOf: s.day })) return;
  if (s.sota?.kin && hasSpirit(s, 'g_sota_rookie') && !sotaMade(s)) { removeSpirit(s, 'g_sota_rookie'); addSpirit(s, 'g_sota_kin'); }
  if (sotaMade(s) && !s.strategy.done.g_sota) completeNode(s, 'g_sota', 'bypass');
  s.strategy.intro = true;
}
