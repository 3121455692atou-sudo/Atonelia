// 共享主干 core_*（规格 A6）：路线节点、押注节点、安全优先 / 快速迭代、炼出 SOTA（g_sota），语言模型还有青出于蓝（g_beyond，D8）。
// 每棵主干的结构和公司树一样：{ id, branches, nodes: [StrategyNode] }（节点 schema 见 A2 和 companies/_schema.js）。
// 公司树和通用树用 extends 接上主干；g_sota 不能 omit，固定放在 base 分支顶端。
//
// 路线节点：六个，四棵主干都有，都可以重复（repeatable），共用 ROUTE_COOLDOWN 天的冷却，完成时一定弹卡片。
// 只有当前路线在 from 里时能开始；条件里的 released:{role} 按发布角色算（D1 的 relRole）。顾问和机器人永远不选主干的路线节点（A10）。
// 语言模型的条件照 A6 写；图像、音乐、语音没有“可商用的强开源模型”“开源追近闭源前沿”这两个里程碑（只记语言模型），
// 改看这个模态里有没有开源对手（离最强 3 分以内的算追近前沿），意思相同。
import { ROUTE_COOLDOWN } from './balance.js';

const BRANCHES = { base: '根基与资金', route: '开源路线', core: '通用方向' };
// 两个“开源走到哪一步了”的条件：语言模型看里程碑，别的模态看对手。
const OPEN_COMMERCIAL = { llm: { ms: { ms_open_commercial: 'any' } }, other: { exists: { rival: { open: true } } } };
const OPEN_FRONTIER = { llm: { ms: { ms_open_frontier: 'any' } }, other: { exists: { rival: { open: true, gap: 3 } } } };

function routeNodes(mod) {
  const k = mod === 'llm' ? 'llm' : 'other';
  const route = (id, x, n) => ({ id, branch: 'route', pos: [n, 0], days: 35, prereq: [], repeatable: true, cooldownDays: ROUTE_COOLDOWN, popup: 'card', ai: { base: 0 }, ...x });
  return [
    route('g_route_open_family', { title: '小模型开源，旗舰闭源', desc: '小模型放出权重攒口碑，最强的旗舰继续只卖 API。',
      stance: 'open_family', from: ['closed'], available: { any: [{ released: { role: 'small', count: 1 } }, OPEN_COMMERCIAL[k]] } }, 0),
    route('g_route_delayed', { title: '开放上一代旗舰', desc: '新旗舰上线一段时间以后，把被它取代的上一代放出权重。',
      stance: 'delayed', from: ['closed', 'open_family'], available: { released: { role: 'flagship', count: 2 } } }, 1),
    route('g_route_open_restricted', { title: '以受限许可开放旗舰', desc: '旗舰也放出权重，但许可里限制商用规模和用途。',
      stance: 'open_restricted', license: 'restrictive', from: ['closed', 'open_family', 'delayed'], available: OPEN_COMMERCIAL[k] }, 2),
    route('g_route_open', { title: '完全开源（宽松许可）', desc: '旗舰按宽松许可开源，随便商用、随便蒸馏，社区最认。',
      stance: 'open', license: 'permissive', from: ['open_restricted', 'delayed', 'open_family'], available: { any: [{ stance: 'open_restricted' }, OPEN_FRONTIER[k]] } }, 3),
    route('g_route_close_top', { title: '最强一档收回闭源', desc: '小模型照旧开源，最强的旗舰改回只卖 API。',
      stance: 'open_family', from: ['open', 'open_restricted', 'delayed'], available: { any: [{ live: { gap: 3 } }, { runwayMonths: { max: 9 } }] } }, 4),
    route('g_route_close_all', { title: '全面闭源', desc: '旗舰不放权重，小模型默认也不放（发布时仍可自己选）。',
      stance: 'closed', from: ['open_family', 'delayed'], available: null }, 5),
  ];
}

// 炼出 SOTA：自动完成（auto），不能手动开始，也不占策略槽；真的发布过一款拿到算数标签的模型（或开局前就有），次日由每天推进里的自动绕过完成。
// 庆祝卡由里程碑 ms_first_sota 负责（E4），这里不弹卡。
const G_SOTA = {
  id: 'g_sota', title: '炼出 SOTA', desc: '发布一款拿到 SOTA 标签的模型。自动完成，不占策略槽。',
  branch: 'base', pos: [0, 0], days: 14, prereq: [], auto: true, available: { sotaMade: true }, bypass: { sotaMade: true },
  spirits: { add: [{ id: 'g_sota_maker' }], remove: ['g_sota_rookie', 'g_sota_kin'] }, popup: 'none', ai: { base: 0, never: true },
};
const SAFETY = [
  { id: 'g_safety_first', title: '安全优先', desc: '发布前多做一轮红队测试，宁可慢一点，也不出大事。',
    branch: 'core', pos: [0, 2], days: 35, prereq: [], excludes: ['g_move_fast'], spirits: { add: [{ id: 'g_safety_first' }] }, popup: 'none', ai: { base: 6 } },
  { id: 'g_move_fast', title: '快速迭代', desc: '小步快跑，发布间隔缩短，出点问题也认。',
    branch: 'core', pos: [1, 2], days: 35, prereq: [], excludes: ['g_safety_first'], spirits: { add: [{ id: 'g_move_fast' }] }, popup: 'none', ai: { base: 2 } },
];
const LLM_BETS = [
  // 取代原来按日期弹出的“推理竞赛”抉择（E5）：别家做出了推理模型，或者自己已经学会 GRPO，而且还没掌握长思维链推理。
  { id: 'g_reasoning_bet', title: '押注推理模型', desc: '抽一支团队专攻长思维链强化学习，先垫一笔钱。',
    branch: 'core', pos: [0, 1], days: 35, prereq: [],
    available: { all: [{ any: [{ ms: { ms_reasoning: 'other' } }, { techs: ['grpo'] }] }, { notTechs: ['reasoning'] }] },
    upfront: { cashOfStart: -0.03 }, effects: { techBoost: { reasoning: 0.7 } }, spirits: { add: [{ id: 'g_rl_team', days: 120 }] }, popup: 'card', ai: { base: 10 } },
  { id: 'g_agent_bet', title: '押注编程 Agent', desc: '让模型学会自己调工具、改代码、操作电脑。',
    branch: 'core', pos: [1, 1], days: 35, prereq: [],
    available: { all: [{ techs: ['func_call'] }, { any: [{ ms: { ms_computer: 'other' } }, { techSeen: { agentic_rl: 'paper' } }] }] },
    effects: { techBoost: { agentic_rl: 0.7, computer_use: 0.7 } }, spirits: { add: [{ id: 'g_agent_team' }] }, popup: 'card', ai: { base: 10 } },
  // 被污染模型唯一的翻身路（D8）：门槛全满足才能开始；“在线旗舰已经练到蒸馏上限”这一条没有对应的条件叶子，由 sim/strategy.js 另查。
  { id: 'g_beyond', title: '青出于蓝：自研范式突破', desc: '只用自己的数据从头再练一轮，甩掉蒸馏带来的天花板。',
    branch: 'core', pos: [0, 3], days: 105, prereq: [],
    available: { all: [{ live: { tainted: true } }, { know: 350 }, { ownData: { level: 2, count: 3 } }, { firsts: { n: 1, days: 365 } }, { distillDep: { max: 0.1 } }, { team: 150 }, { working: { exists: true } }] },
    effects: { beyondTrial: true }, popup: 'card', ai: { base: 0, never: true } },
];
// 各模态的押注节点（A6）。条件只要求还没掌握那项技术（已经会了，减研究工作量就没用了）。
const modalBet = (id, title, desc, tech, x = {}) => ({ id, title, desc, branch: 'core', pos: [0, 1], days: 35, prereq: [], available: { notTechs: [tech] },
  effects: { techBoost: { [tech]: 0.6 } }, popup: 'card', ai: { base: 10 }, ...x });

const core = (id, mod, extra) => ({ id, branches: { ...BRANCHES }, nodes: [G_SOTA, ...routeNodes(mod), ...SAFETY, ...extra] });
export const CORE_TREES = {
  core_llm: core('core_llm', 'llm', LLM_BETS),
  core_image: core('core_image', 'image', [modalBet('gi_ar_bet', '押注原生多模态生图', '让语言模型直接画图，听得懂长提示，图里也能写对字。', 'ar_image')]),
  core_music: core('core_music', 'music', [modalBet('gm_licensed_bet', '和唱片公司谈授权', '拿正版曲库训练，版权官司少一些。', 'licensed', { spirits: { add: [{ id: 'gm_licensed' }] } })]),
  core_speech: core('core_speech', 'speech', [modalBet('gv_s2s_bet', '押注端到端实时语音', '不再先转文字，听完直接说，能插话、有语气。', 's2s')]),
};
// 公司模态 → 主干 id。
export const CORE_OF = { llm: 'core_llm', image: 'core_image', music: 'core_music', speech: 'core_speech' };
// 主干里的全部节点 id（主干节点以 g_、gi_、gm_、gv_ 开头；顾问和机器人认“主干的路线节点”用它）。
export const CORE_NODE_IDS = new Set(Object.values(CORE_TREES).flatMap(t => t.nodes.map(n => n.id)));
