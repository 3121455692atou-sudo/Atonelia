// 通用公司特质（规格 A2 的 Spirit；本家特质写在各自的公司文件里）：国家说明特质、g_sota 的三档、主干节点给的特质、通用树（A8）的特质。
// 结构：{ [id]: { id, title, desc, mods: { MOD_KEYS 里的键: 值 }, blocks: ['funding'] | [], info: false } }
// info 为 true 的只说明已有的硬规则，不带 mods（防止重复惩罚）。sotaEase 的取值统一读 balance.js 的 SOTA_EASE（D6.2 的 ρ = 1 + sotaEase）。
import { SOTA_EASE } from './balance.js';

const DEFS = {
  // 国家说明特质（开局按公司所在地自动加上，A4.7）。
  cn_compute_limited: { title: '算力受限', desc: '开局卡少，先进的卡买不到，只能用特供卡或走灰色渠道。', info: true },
  cn_filing: { title: '上线要备案', desc: '对话产品面向公众之前要先备案，审核要等一阵。', info: true },
  cn_light_liability: { title: '官司少', desc: '国内的版权和安全官司比海外少得多。', info: true },
  us_litigation: { title: '官司多', desc: '版权和安全诉讼多，训练数据的来路要格外小心。', info: true },

  // 炼出 SOTA（A6 的 g_sota、D6.2 的技术储备 ρ）。开局按 D10.4 播种三档之一；局内拿到第一枚算数的标签后换成“炼出过”。
  g_sota_maker: { title: '炼出过 SOTA', desc: '做出过世界最强的模型，最后几步怎么走心里有数。再冲会顺一些，但仍然不容易。', mods: { sotaEase: SOTA_EASE.maker } },
  g_sota_kin: { title: '集团出过 SOTA', desc: '集团在别的领域做出过世界最强，经验能借一点，这个领域还得自己摸索。', mods: { sotaEase: SOTA_EASE.kin } },
  g_sota_rookie: { title: '技术储备不足', desc: '还没做出过世界最强的模型。离最强还差一截时训练就开始吃力，最后几步特别难。', mods: { sotaEase: SOTA_EASE.rookie } },
  // g_beyond 的试炼练满（D8）。
  g_self_reliant: { title: '青出于蓝', desc: '甩掉了蒸馏带来的天花板，底子是自己的了。再往上冲会顺一些。', mods: { sotaEase: SOTA_EASE.selfReliant } },

  // 主干节点给的特质（A6）。
  g_rl_team: { title: '推理攻坚组', desc: '专门抽出一支团队做强化学习，训练多开一条线（作业位 +1）。', mods: { jobSlots: 1 } },
  g_agent_team: { title: 'Agent 团队', desc: '有人专门搭工具环境，Agent 方向的后训练更有效。', mods: { 'post.agent': 1.08 } },
  g_safety_first: { title: '安全优先', desc: '宁可慢一点，发布前多做一轮红队测试。官司少一些，安全对齐能练得更高，评测过的版本风险再低一档。', mods: { legal: 0.8, 'cap.safety': 3, evalAdj: 2 } },
  g_move_fast: { title: '快速迭代', desc: '小步快跑，两次发布之间不用等那么久，安全评测压缩到四分之三，但官司也多一些。', mods: { legal: 1.25, releaseGapDays: -4, evalDays: 0.75 } },
  gm_licensed: { title: '正版曲库', desc: '和唱片公司谈好了授权，版权官司少一些。', mods: { legal: 0.85 } },

  // 通用树的特质（A8；节点由 P3.1 写进 companies/_generic_*.js）。
  gs_search: { title: '答案引擎', desc: '每个回答都带出处，查资料的人最爱用。', mods: { chatDemand: 1.15, 'cap.knowledge': 2 } },
  gs_story: { title: '写作与角色扮演', desc: '只服务写手和角色扮演玩家，文笔练得更好。', mods: { chatDemand: 1.2, 'cap.writing': 3 } },
  gs_decide: { title: '结构化决策', desc: '只输出带概率的判断，企业接起来最省事。', mods: { apiDemand: 1.1, 'cap.agent': 3, 'cap.safety': 3 } },
  gs_arch: { title: '新架构', desc: '不用 Transformer，推理便宜得多，训练也快一点。', mods: { infer: 1.2, train: 1.05 } },
  gs_self_built: { title: '自研底座', desc: '坚持从零训练，底座是自己的。研究更快，冲最强也顺一点。', mods: { research: 1.1, sotaEase: SOTA_EASE.selfBuilt } },
  gs_subs: { title: '会员做得好', desc: '订阅档位清楚，独享模型留得住人。', mods: { chatDemand: 1.1, subDemand: 1.15 } },
  gs_dev: { title: '开发者 API', desc: '有免费额度，开发者先用起来。', mods: { apiDemand: 1.2 } },
  gs_tools: { title: '接入编程工具', desc: '上架了编程工具和聚合平台，被接入的机会多得多。', mods: { integrationOdds: 1.5 } },
  gs_lean: { title: '精打细算', desc: '不融资，靠订阅活下去，每一分钱都花在刀刃上。', mods: { cost: 0.9 } },
  gs_own_cluster: { title: '自建集群', desc: '自己的机房，买卡配额更多，训练更稳。', mods: { gpuQuota: 1.5, stability: 0.9 } },
  gs_two_sizes: { title: '一大一小', desc: '大小两档一起做，蒸馏小模型更快。', mods: { distillTime: 0.7 } },
};

export const SPIRITS = Object.fromEntries(Object.entries(DEFS).map(([id, sp]) => [id, { id, ...sp }]));
