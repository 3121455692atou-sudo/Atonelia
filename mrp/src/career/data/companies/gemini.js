// Google DeepMind：完整史实树（规格 A5、A9；文件结构见 A2）。P3.T 第 2 批填写。
// 接共享主干 core_llm，保留全部主干节点（推理押注对这家也成立，不 omit）。
// 主线照 A9：两个实验室合并 → 原生多模态 → Gemma 开放 → 百万上下文 → TPU 自研 → 2.5 思考。
// 名表按 C3 的 Google 行，专属事件按 C4 的 ex_gemini_haystack。文案里不写年份，年份只在 hist.date。
export default {
  company: 'gemini',
  tree: {
    id: 'gemini',
    extends: 'core_llm',
    branches: { base: '根基与组织', arch: '模型与架构', product: '产品与分发', compute: '算力与芯片', market: '市场', open: '开源副线', alt: '架空' },
    nodes: [
      // ---- 根基与组织 ----
      { id: 'gg_bard', title: '先把对话入口摆出来', desc: '把现成的语言模型做成对话服务，先给受信测试者，边用边改。',
        branch: 'base', pos: [0, 0], days: 35, prereq: [], effects: { know: 10, brand: 1.04 },
        spirits: { add: [{ id: 'gg_search_moat' }] },
        popup: 'none', hist: { date: '2023-02-06', text: '宣布对话式 AI 服务，由轻量版语言模型驱动，先交给受信测试者。' }, ai: { base: 30, historic: 100 } },
      { id: 'gg_brain_merge', title: '两个实验室合并', desc: '把两个研究团队并成一个，研究队列和算力统一调度，少吵架。',
        branch: 'base', pos: [1, 0], days: 35, prereq: [['gg_bard']], effects: { know: 12, morale: 1 },
        spirits: { add: [{ id: 'gg_research_merge' }] },
        popup: 'none', hist: { date: '2023-04', text: '两个实验室合并成一家，由原 DeepMind 负责人统一领导。' }, ai: { base: 25, historic: 95 } },

      // ---- 模型与架构 ----
      { id: 'gg_native_mm', title: '原生多模态', desc: '文字、图像、音频从训练第一天就放在一起，不分几个模型拼起来。',
        branch: 'arch', pos: [2, 1], days: 70, prereq: [['gg_brain_merge']],
        effects: { techRead: ['ar_image'], techBoost: { ar_image: 0.4 }, data: { post: { knowledge: 0.4 } } },
        spirits: { add: [{ id: 'gg_multimodal' }] },
        popup: 'none', hist: { date: '2023-12-06', text: '首代原生多模态模型发布，同时给出从手机到旗舰的三档尺寸。' }, ai: { base: 20, historic: 95 } },
      { id: 'gg_moe_switch', title: '换用稀疏专家', desc: '把稠密模型换成稀疏专家，同样的算力能喂更多数据。',
        branch: 'arch', pos: [2, 2], days: 35, prereq: [['gg_native_mm']], bypass: { techs: ['moe'] },
        effects: { techRead: ['moe'], techBoost: { moe: 0.4 } }, popup: 'none',
        hist: { date: '2024-02-15', text: '新一代模型改用 MoE，把长上下文和稀疏专家一起放出来。' }, ai: { base: 16, historic: 92 } },
      { id: 'gg_million_ctx', title: '百万上下文', desc: '把上下文拉到百万字级别，整本书、整个代码库一次塞进去。',
        branch: 'arch', pos: [3, 2], days: 35, prereq: [['gg_moe_switch']],
        effects: { techRead: ['long_ctx'], techBoost: { long_ctx: 0.5 }, data: { post: { knowledge: 0.5 } } },
        spirits: { add: [{ id: 'gg_long_ctx' }] }, grants: { names: ['hn_gemini15_pro'], events: ['ex_gemini_haystack'] },
        popup: 'card', hist: { date: '2024-02-15', text: '把一百万 token 的长上下文开放给开发者私测，长上下文竞赛进入百万级。' }, ai: { base: 15, historic: 100 } },
      { id: 'gg_25_thinking', title: '会先想再答的旗舰', desc: '让旗舰在回答前先做一段思考，数学、科学和代码一起往上抬。',
        branch: 'arch', pos: [4, 2], days: 70, prereq: [['gg_million_ctx']],
        effects: { techRead: ['reasoning'], techBoost: { reasoning: 0.5 }, data: { post: { math: 0.4, code: 0.3 } } },
        spirits: { add: [{ id: 'gg_thinking' }] }, popup: 'none',
        hist: { date: '2025-03-25', text: '思考型旗舰以实验版发布，首发就登上人类偏好榜首位。' }, ai: { base: 20, historic: 100 } },
      { id: 'gg_gemini3', title: '把榜单再抬一档', desc: '新一代旗舰在推理、多模态和编程上一起加码，顺手把编程工具也推出来。',
        branch: 'arch', pos: [5, 2], days: 70, prereq: [['gg_25_thinking', 'gg_deep_think']],
        effects: { brand: 1.08, techBoost: { agentic_rl: 0.4 }, data: { post: { agent: 0.4 } } },
        spirits: { add: [{ id: 'gg_frontier' }] }, popup: 'none',
        hist: { date: '2025-11-18', text: '新一代旗舰发布，成为首个在人类偏好榜突破一千五百分的模型。' }, ai: { base: 15, historic: 95 } },

      // ---- 产品与分发 ----
      { id: 'gg_search_ai', title: '搜索里直接给答案', desc: '把模型接到搜索框，先给一段整理过的答案，再附上原来的链接。',
        branch: 'product', pos: [2, 3], days: 35, prereq: [['gg_brain_merge']],
        effects: { demand: { chat: 1.2, api: 1.08, days: 120 } }, spirits: { add: [{ id: 'gg_search_ai' }] },
        popup: 'none', hist: { date: '2024-05', text: '搜索开始向所有用户直接给 AI 摘要，随后修补了离谱回答。' }, ai: { base: 15, historic: 90 } },
      { id: 'gg_nano_banana', title: '能改图的小模型', desc: '在便宜快的档位里直接生成和改图，人物前后保持一致，一下把手机用户带进来。',
        branch: 'product', pos: [3, 3], days: 35, prereq: [['gg_native_mm']],
        effects: { brand: 1.1, demand: { chat: 1.3, days: 90 } }, spirits: { add: [{ id: 'gg_image_fun' }] },
        popup: 'none', hist: { date: '2025-08-26', text: '图像生成功能上线，人物一致性和对话式改图带动应用新增用户暴涨。' }, ai: { base: 12, historic: 92 } },
      { id: 'gg_deep_think', title: '并行思考冲奥赛', desc: '让模型同时开几条思路互相检查，先把数学竞赛题做稳。',
        branch: 'product', pos: [4, 3], days: 70, prereq: [['gg_25_thinking']],
        effects: { techBoost: { reasoning: 0.3 }, data: { post: { math: 0.5 } } }, spirits: { add: [{ id: 'gg_deep_think' }] },
        popup: 'none', hist: { date: '2025-08-01', text: '并行思考模式向高价订阅用户开放，高级版在国际数学奥赛拿到官方认证的金牌水平。' }, ai: { base: 12, historic: 92 } },

      // ---- 算力与芯片 ----
      { id: 'gg_tpu', title: '自研训练芯片', desc: '训练主要用自家芯片，从单机架到上万颗连成一片，买卡不再全看别人脸色。',
        branch: 'compute', pos: [1, 1], days: 70, prereq: [['gg_brain_merge']],
        effects: { techBoost: { fp8: 0.3 } }, spirits: { add: [{ id: 'gg_tpu_stack' }] },
        popup: 'none', hist: { date: '2023-12-06', text: '新一代自研训练芯片随模型一起发布，单个集群可连到近九千颗。' }, ai: { base: 15, historic: 90 } },
      { id: 'gg_tpu_sell', title: '芯片也对外卖', desc: '把闲置的自研算力租给别家，换回云收入和长期合同。',
        branch: 'compute', pos: [2, 1], days: 35, prereq: [['gg_tpu']],
        effects: { raise: 0.08, demand: { api: 1.05, days: 90 } }, spirits: { add: [{ id: 'gg_tpu_sell' }] },
        popup: 'none', hist: { date: '2025-10', text: '自研芯片开始成规模对外供应，和一家大模型公司签下百万颗级合同。' }, ai: { base: 10, historic: 88 } },

      // ---- 市场 ----
      { id: 'gg_ultra_sub', title: '高价订阅档', desc: '把最强思考和视频功能放进最贵的一档，愿意付钱的人先用到。',
        branch: 'market', pos: [4, 4], days: 35, prereq: [['gg_25_thinking']],
        effects: { demand: { sub: 1.25, days: 120 } }, spirits: { add: [{ id: 'gg_ultra' }] },
        popup: 'none', hist: { date: '2025-05-20', text: '推出每月两百多美元的高价订阅，最强思考、视频和智能体功能先给这一档。' }, ai: { base: 10, historic: 88 } },
      { id: 'gg_apple_siri', title: '拿下手机助手', desc: '让新一代手机助手用自家模型做底座，入口直接铺到十几亿台设备上。',
        branch: 'market', pos: [6, 4], days: 35, prereq: [['gg_gemini3']],
        effects: { brand: 1.08, demand: { chat: 1.2, days: 120 } }, spirits: { add: [{ id: 'gg_oem' }] },
        popup: 'none', hist: { date: '2026-01-12', text: '和手机厂商达成多年合作，自家模型成为新一代系统助手的底座。' }, ai: { base: 10, historic: 90 } },

      // ---- 开源副线 ----
      { id: 'gg_gemma', title: '开放小模型：Gemma', desc: '旗舰继续闭源，另开一条开放权重的小模型线，先把开发者拉过来。',
        branch: 'open', pos: [3, 1], days: 35, prereq: [['gg_native_mm']], stance: 'open_family',
        from: ['closed', 'delayed', 'open_restricted'], excludes: ['gg_open_all'],
        effects: { brand: 1.06, demand: { router: 1.12, days: 90 } }, spirits: { add: [{ id: 'gg_gemma_line' }] },
        popup: 'card', hist: { date: '2024-02-21', text: '发布首个开放权重模型系列，技术源自旗舰，旗舰本身仍然闭源。' }, ai: { base: 8, historic: 95 } },
      { id: 'gg_gemma4', title: '开放线换宽松许可', desc: '把开放小模型的许可换成最宽松的那种，商用和再分发都不用再问。',
        branch: 'open', pos: [6, 1], days: 35, prereq: [['gg_gemma']], excludes: ['gg_open_all'],
        effects: { brand: 1.06, demand: { router: 1.15, days: 120 } }, spirits: { add: [{ id: 'gg_gemma_apache' }] },
        popup: 'none', hist: { date: '2026-04-02', text: '新一带开放模型首次改用宽松许可，进入开源榜前三。' }, ai: { base: 8, historic: 88 } },

      // ---- 架空 ----
      { id: 'gg_open_all', title: '旗舰也全部开源', desc: '不再分开放小模型和闭源旗舰，最强的一档也把权重放出去。',
        branch: 'alt', pos: [7, 1], days: 70, prereq: [['gg_gemini3']], stance: 'open', license: 'permissive',
        from: ['closed', 'open_family', 'delayed', 'open_restricted'], excludes: ['gg_lockdown', 'gg_gemma', 'gg_gemma4'],
        effects: { brand: 1.12, demand: { router: 1.2, days: 120 }, valuation: 0.94 },
        spirits: { add: [{ id: 'gg_open_all' }] }, popup: 'card', fiction: true, ai: { base: 3, historic: 0 } },
      { id: 'gg_lockdown', title: '最强的永远不放', desc: '把闭源写死，连开放小模型线也收掉，只靠接口和订阅赚钱。',
        branch: 'alt', pos: [7, 2], days: 35, prereq: [['gg_gemini3']], stance: 'closed',
        from: ['open_family', 'delayed', 'open_restricted', 'open'], excludes: ['gg_open_all'],
        effects: { valuation: 1.1, brand: 0.94, demand: { api: 1.1, days: 90 } },
        spirits: { add: [{ id: 'gg_lockdown' }] }, popup: 'card', fiction: true, ai: { base: 2, historic: 0 } },

      // ---- 安全 ----
      { id: 'gg_fairwind', title: '最强的先给防守方', desc: '网络攻防能力太强的新旗舰不直接公开，先交给受信的安全团队用几周。',
        branch: 'product', pos: [7, 3], days: 35, prereq: [['gg_gemini3']],
        effects: { brand: 1.08, risk: { abuse: 0.85 } }, spirits: { add: [{ id: 'gg_fairwind' }] },
        popup: 'none', hist: { date: '2026-09-30', text: '新一代旗舰先只给受信的网络防御方和内部使用，两周后才全面开放。' }, ai: { base: 8, historic: 85 } },
    ],
  },

  // 本家特质（A2）：mods 的键都在 E3 的词表里。
  spirits: {
    gg_search_moat: { title: '搜索入口', desc: '搜索和浏览器每天带来海量用户，推新功能不用从零获客。', mods: { chatDemand: 1.12, brandGain: 1.04 } },
    gg_research_merge: { title: '两个实验室合并', desc: '研究队列并成一条，算力和人都不再重复。', mods: { research: 1.1 } },
    gg_multimodal: { title: '原生多模态', desc: '文字、图像和音频一起训，Agent 方向更好带。', mods: { 'post.knowledge': 1.06, 'cap.agent': 2 } },
    gg_long_ctx: { title: '百万上下文', desc: '整本书、整个仓库一次读进去，长文档场景占优。', mods: { 'post.knowledge': 1.1, 'cap.knowledge': 2 } },
    gg_thinking: { title: '会先想再答', desc: '思考和对话在同一条线上，数学和代码练得更顺。', mods: { 'post.math': 1.1, 'post.code': 1.05 } },
    gg_frontier: { title: '前沿旗舰', desc: '榜单和开发者都盯着这一代。', mods: { brandGain: 1.06, apiDemand: 1.05 } },
    gg_search_ai: { title: '搜索直接给答案', desc: '答案出现在搜索框里，触达不用靠应用下载。', mods: { chatDemand: 1.15, integrationOdds: 1.1 } },
    gg_image_fun: { title: '图像出圈', desc: '改图和人物一致性带来大量新用户。', mods: { chatDemand: 1.08, subDemand: 1.05 } },
    gg_deep_think: { title: '并行思考', desc: '几条思路互相检查，难题更稳。', mods: { 'post.math': 1.12, 'cap.math': 3 } },
    gg_tpu_stack: { title: '自研芯片', desc: '训练主要用自己的芯片，买卡配额更宽，训练也更稳。', mods: { gpuQuota: 1.2, train: 1.03 } },
    gg_tpu_sell: { title: '芯片外供', desc: '把富余算力租出去，换回云收入和长期合同。', mods: { rentQuota: 1.3, valuation: 1.04 } },
    gg_ultra: { title: '高价订阅', desc: '最强功能先给最贵的一档，客单价高。', mods: { subDemand: 1.18 } },
    gg_oem: { title: '手机助手底座', desc: '系统级入口带来的用户不用买量。', mods: { chatDemand: 1.15, brandGain: 1.05 } },
    gg_gemma_line: { title: '开放小模型线', desc: '旗舰闭源，小模型开放，开发者两头都能接。', mods: { routerDemand: 1.12 } },
    gg_gemma_apache: { title: '宽松许可', desc: '商用和再分发都不用问，社区最认。', mods: { routerDemand: 1.15, brandGain: 1.03 } },
    gg_open_all: { title: '旗舰全开源', desc: '社区声望最高，但旗舰接口的溢价没了。', mods: { brandGain: 1.18, routerDemand: 1.2, apiDemand: 0.85 } },
    gg_lockdown: { title: '永远闭源', desc: '最强的只卖接口，收入稳，开发者离心。', mods: { apiDemand: 1.12, routerDemand: 0.82 } },
    gg_fairwind: { title: '受控发布', desc: '最强的先给防守方，政府和企业更信任。', mods: { legal: 0.85, brandGain: 1.05 } },
  },
  startSpirits: ['gg_tpu_stack'],

  // 历史名（C3 的 Google 行）。world 里放发布当天的世界状态。
  names: [
    { id: 'hn_gemini15_pro', name: 'Gemini 1.5 Pro', role: 'flagship', node: 'gg_million_ctx', real: '2024-02-15',
      model: { arch: ['moe'], techs: ['long_ctx', 'moe'], gap: 1.5 },
      world: { ms: { ms_million_ctx: 'notOther' } }, clean: 'base', events: ['ex_gemini_haystack'] },
  ],

  // 专属事件（C4）。短剧素材只用 {company}、{model} 两个占位。
  exclusives: [
    { id: 'ex_gemini_haystack', title: '{model}：长文档一下变得能用了',
      on: 'release', name: 'hn_gemini15_pro', node: null, delay: [0, 0], within: 0,
      cond: { company: 'gemini' }, supersedes: { milestone: [], event: [] }, scene: null,
      effects: { demand: { api: 1.2, days: 60 } }, choices: [],
      notice: false, hist: { date: '2024-02-15', text: '百万上下文开放私测，长文档问答和整库代码阅读成了卖点。' } },
  ],
};
