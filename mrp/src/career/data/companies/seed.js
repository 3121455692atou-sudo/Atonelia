// 字节跳动 Seed：完整史实树（规格 A5、A9；文件结构见 A2）。P3.T 第 4 批填写。
// 接共享主干 core_llm，不 omit：推理押注和 Agent 押注在豆包这条线上都用得上。
// 主线照 A9：豆包免费 → Seed 团队 → Seed-Thinking → Seed-OSS；地板价、纯血数据和豆包手机走旁支。
// 本家路线节点 sd_oss（→ 小模型开源、旗舰闭源）。
// C3 没有 Seed 的固定行，A9 只写“可选”；这里加一个有把握的闭源旗舰 Doubao-1.5-pro。专属事件 C4 没有 Seed 的条目。
// 文案里不写年份，年份只出现在 hist.date（数据）。
export default {
  company: 'seed',
  tree: {
    id: 'seed',
    extends: 'core_llm',
    branches: { base: '根基与入场', app: '应用与分发', price: '价格与产品', open: '开源副线', think: '推理与多模态', chips: '算力' },
    nodes: [
      // ---- 根基与入场：豆包 App 上线没有进 timeline，只作为开局节点，不写史实 ----
      { id: 'sd_doubao', title: '后发入场：豆包 App 上线', desc: '先做一个能聊天的 App，把字节系的流量导进来，模型能力差一点也认。',
        branch: 'base', pos: [0, 0], days: 35, prereq: [], effects: { know: 10, demand: { chat: 1.2, days: 120 } },
        spirits: { add: [{ id: 'sd_traffic' }] }, popup: 'none', ai: { base: 30, historic: 0 } },
      { id: 'sd_seed_team', title: '成立 Seed：基础研究单独立一支队伍', desc: '把大模型研究从业务线里抽出来，分基础、前沿和工程三摊，论文和博客放开写。',
        branch: 'base', pos: [1, 0], days: 35, prereq: [['sd_doubao']], effects: { know: 15 },
        spirits: { add: [{ id: 'sd_seed_org' }] }, popup: 'none', ai: { base: 18, historic: 0 } },

      // ---- 应用与分发 ----
      { id: 'sd_doubao_app', title: '豆包做成国民级入口', desc: '把对话、搜索、写作和画图塞进一个 App，用短视频流量把它推成日活第一。',
        branch: 'app', pos: [0, 1], days: 35, prereq: [['sd_doubao']],
        effects: { demand: { chat: 1.3, sub: 1.05, days: 180 } }, spirits: { add: [{ id: 'sd_app' }] },
        popup: 'none', ai: { base: 14, historic: 0 } },
      { id: 'sd_doubao_15', title: '豆包 1.5：稀疏专家，宣称不用别家数据', desc: '换稀疏专家架构，公开说训练和后训练都没用别家模型的输出。',
        branch: 'app', pos: [1, 1], days: 70, prereq: [['sd_price_floor']], available: { era: '2024-11' },
        effects: { techBoost: { moe: 0.5 }, data: { post: { knowledge: 0.4 } }, brand: 1.05 },
        spirits: { add: [{ id: 'sd_1_5' }] }, grants: { names: ['hn_doubao_15'] }, popup: 'card',
        hist: { date: '2025-01-22', text: '豆包 1.5 Pro 采用稀疏 MoE，官方称训练和后训练都不使用别家模型的数据。' }, ai: { base: 20, historic: 100 } },
      { id: 'sd_doubao_18', title: 'Seed 1.8：能操作真实世界的 Agent', desc: '把搜索、代码执行、多步决策和操作图形界面放进同一个模型。',
        branch: 'app', pos: [2, 1], days: 70, prereq: [['sd_doubao_16']],
        effects: { techBoost: { agentic_rl: 0.5, computer_use: 0.3 }, data: { post: { agent: 0.4 } } },
        spirits: { add: [{ id: 'sd_agent_product' }] }, popup: 'none',
        hist: { date: '2025-12-18', text: '豆包 Seed 1.8 面向通用真实世界智能体，强化搜索、代码执行和图形界面操作。' }, ai: { base: 16, historic: 95 } },
      { id: 'sd_app_only', title: '只做 App，模型全靠外部接口', desc: '不自研底座，直接接别家的模型做产品，省下训练的钱和风险。',
        branch: 'app', pos: [3, 1], days: 35, prereq: [['sd_doubao_16']], excludes: ['sd_all_open'],
        effects: { demand: { chat: 1.2, days: 120 }, valuation: 1.05 }, spirits: { add: [{ id: 'sd_app_only' }] },
        popup: 'none', fiction: true, ai: { base: 3, historic: 0 } },

      // ---- 价格与产品 ----
      { id: 'sd_price_floor', title: '地板价：接口价格打到同行的零头', desc: '用规模摊薄成本，接口价格比同行低一个数量级，先把调用量抢过来。',
        branch: 'price', pos: [0, 2], days: 35, prereq: [],
        effects: { world: { priceWar: true }, brand: 1.04, demand: { api: 1.25, days: 120 } },
        spirits: { add: [{ id: 'sd_price_war' }] }, popup: 'none',
        hist: { date: '2024-05-15', text: '火山引擎发布豆包大模型家族，定价远低于同行，把国内接口价格战推向高潮。' }, ai: { base: 12, historic: 90 } },
      { id: 'sd_doubao_16', title: 'Seed 1.6：按输入长度分档定价', desc: '短输入保持地板价，长输入按长度加价，毛利回来一点。',
        branch: 'price', pos: [1, 2], days: 70, prereq: [['sd_doubao_15']],
        effects: { demand: { api: 1.1, days: 90 } }, spirits: { add: [{ id: 'sd_tiered_price' }] },
        popup: 'none', hist: { date: '2025-06-11', text: '豆包 Seed 1.6 支持自适应思考和图文输入，定价改为按输入长度分档。' }, ai: { base: 16, historic: 95 } },
      { id: 'sd_subscription', title: '结束全免费：三档订阅', desc: '保留免费基础版，往上加标准、加强和专业三档，先把推理成本压回来。',
        branch: 'price', pos: [2, 2], days: 35, prereq: [['sd_doubao_18']],
        effects: { demand: { sub: 1.2, chat: 0.95, days: 180 } }, spirits: { add: [{ id: 'sd_subscription' }] },
        popup: 'none', ai: { base: 8, historic: 0 } },

      // ---- 推理与多模态 ----
      { id: 'sd_pureblood', title: '纯血数据：外来蒸馏语料全部清掉', desc: '宁可多花数据钱，也要让能力天花板掌握在自己手里。',
        branch: 'think', pos: [0, 3], days: 35, prereq: [['sd_doubao_15']],
        effects: { data: { post: { knowledge: 0.3, math: 0.3 } } }, spirits: { add: [{ id: 'sd_pure_data' }] },
        popup: 'none', hist: { date: '2025-01-22', text: '豆包 1.5 Pro 把“不使用任何其他模型的数据”写进官方说明。' }, ai: { base: 14, historic: 95 } },
      { id: 'sd_seed_thinking', title: 'Seed-Thinking：只发报告，不开权重', desc: '用一个中等规模的稀疏模型把数理推理追到一线，训练方法全写进报告。',
        branch: 'think', pos: [1, 3], days: 70, prereq: [['sd_doubao_15']],
        effects: { techBoost: { reasoning: 0.5 }, papers: ['reasoning'] }, spirits: { add: [{ id: 'sd_reasoning' }] },
        popup: 'none', hist: { date: '2025-04-10', text: 'Seed 公开 Seed-Thinking 技术报告，用中等规模 MoE 把数理推理追到一线。' }, ai: { base: 20, historic: 100 } },
      { id: 'sd_doubao_20', title: '豆包 2.0：万亿参数挺过训练不稳定', desc: '把规模推到万亿级，炸炉以后降规模还是抢修，最后赶在春节前上线。',
        branch: 'think', pos: [2, 3], days: 105, prereq: [['sd_doubao_18']],
        effects: { techBoost: { mtp: 0.4 }, brand: 1.06, data: { post: { knowledge: 0.4 } } },
        spirits: { add: [{ id: 'sd_trillion' }] }, popup: 'none',
        hist: { date: '2026-02-14', text: '豆包大模型 2.0 发布，Seed 史上最大的模型挺过了训练不稳定。' }, ai: { base: 20, historic: 100 } },
      { id: 'sd_seed21', title: 'Seed 2.1：编码和电脑操作成主打', desc: '新一代不拼聊天，专攻写代码、改仓库和替人操作电脑。',
        branch: 'think', pos: [3, 3], days: 70, prereq: [['sd_doubao_20']],
        effects: { techBoost: { agentic_rl: 0.4 }, data: { post: { code: 0.4, agent: 0.3 } } },
        popup: 'none', hist: { date: '2026-06-23', text: 'Seed 2.1 强化编码、电脑操作等生产力任务。' }, ai: { base: 14, historic: 92 } },

      // ---- 开源副线 ----
      { id: 'sd_opensource_side', title: '研究副线：小模型先开源', desc: '代码、多模态和 Agent 的小模型先放权重，旗舰继续闭源，先攒开发者口碑。',
        branch: 'open', pos: [0, 4], days: 35, prereq: [['sd_seed_team']],
        effects: { brand: 1.05 }, spirits: { add: [{ id: 'sd_open_side' }] }, popup: 'none', ai: { base: 12, historic: 0 } },
      { id: 'sd_uitars', title: '开源 GUI Agent，让模型学着点屏幕', desc: '放出一个能看屏幕、点按钮的小 Agent，社区拿去接各种手机和电脑。',
        branch: 'open', pos: [1, 4], days: 35, prereq: [['sd_opensource_side']], bypass: { techs: ['computer_use'] },
        effects: { techBoost: { computer_use: 0.5 }, demand: { api: 1.05, days: 60 } },
        spirits: { add: [{ id: 'sd_agent' }] }, popup: 'none', ai: { base: 10, historic: 0 } },
      { id: 'sd_oss', title: 'Seed-OSS：第一个开源的通用语言模型', desc: '放出 36B 稠密模型和超长上下文，许可用最宽松的那种；旗舰仍然闭源。',
        branch: 'open', pos: [2, 4], days: 70, prereq: [['sd_pureblood', 'sd_seed_thinking']],
        stance: 'open_family', from: ['closed', 'open_restricted', 'delayed'],
        effects: { brand: 1.08, data: { post: { knowledge: 0.4 } } }, spirits: { add: [{ id: 'sd_oss' }] },
        popup: 'card', hist: { date: '2025-08-20', text: 'Seed 首次开源通用大语言模型 Seed-OSS-36B，36B 稠密、原生 512K 上下文。' }, ai: { base: 25, historic: 100 } },
      { id: 'sd_all_open', title: '全面开源：旗舰也放权重', desc: '把所有模型连同训练方法一起放出去，靠生态和云服务赚钱。',
        branch: 'open', pos: [3, 4], days: 70, prereq: [['sd_oss']], excludes: ['sd_app_only'],
        stance: 'open', license: 'permissive', from: ['closed', 'open_family', 'delayed', 'open_restricted'],
        effects: { brand: 1.1 }, spirits: { add: [{ id: 'sd_all_open' }] },
        popup: 'card', fiction: true, ai: { base: 3, historic: 0 } },

      // ---- 算力 ----
      { id: 'sd_scale', title: 'H200 配额与海外算力基地', desc: '一边等国内审批，一边在海外租机房，训练不再被一张卡卡住。',
        branch: 'chips', pos: [0, 5], days: 35, prereq: [['sd_doubao_20']],
        spirits: { add: [{ id: 'sd_h200' }] }, popup: 'none',
        hist: { date: '2026-01-28', text: '中国批准字节、阿里、腾讯合计采购超过 40 万颗 H200，附带条件仍在制定。' }, ai: { base: 10, historic: 90 } },
    ],
  },

  // 本家特质（A2）：mods 都在 E3 的词表里。
  spirits: {
    sd_traffic: { title: '字节系流量', desc: '短视频和资讯的入口就在自己手里。', mods: { chatDemand: 1.1 } },
    sd_seed_org: { title: 'Seed 研究体系', desc: '基础、前沿、工程分线，研究推进更快。', mods: { research: 1.08 } },
    sd_price_war: { title: '地板价', desc: '价格压到最低，调用量涨得快，毛利薄。', mods: { apiDemand: 1.12, cost: 1.03 } },
    sd_app: { title: '国民级入口', desc: '日活高，订阅和广告都好卖。', mods: { chatDemand: 1.12, subDemand: 1.05 } },
    sd_1_5: { title: '稀疏专家', desc: '同样的卡装下更大的总参数。', mods: { train: 1.03 } },
    sd_pure_data: { title: '纯血数据', desc: '训练数据自己造，知识方向后训练更有效。', mods: { 'post.knowledge': 1.06 } },
    sd_reasoning: { title: '推理小组', desc: '数理推理的强化学习练得更顺。', mods: { 'post.math': 1.06, 'post.code': 1.03 } },
    sd_agent_product: { title: 'Agent 产品组', desc: '搜索、代码和图形界面有人一起搭。', mods: { 'post.agent': 1.1 } },
    sd_trillion: { title: '万亿参数', desc: '大模型训练有经验，炸炉少一些。', mods: { train: 1.03, stability: 0.95 } },
    sd_open_side: { title: '研究开源副线', desc: '小模型先放权重，开发者愿意来试。', mods: { routerDemand: 1.1 } },
    sd_agent: { title: 'GUI Agent', desc: '操作屏幕的多步任务练得更实。', mods: { 'post.agent': 1.08 } },
    sd_oss: { title: '首个开源通用模型', desc: '旗舰闭源、中型开源，社区认这一套。', mods: { routerDemand: 1.15, brandGain: 1.03 } },
    sd_tiered_price: { title: '分档定价', desc: '短输入便宜、长输入加价，毛利回来一点。', mods: { apiDemand: 1.05, valuation: 1.03 } },
    sd_subscription: { title: '三档订阅', desc: '免费版拉新，付费版收钱。', mods: { subDemand: 1.18, chatDemand: 0.95 } },
    sd_all_open: { title: '全面开源', desc: '连旗舰都放权重，社区最认。', mods: { routerDemand: 1.2 } },
    sd_app_only: { title: '只做产品', desc: '不自研底座，省下训练的钱和风险。', mods: { chatDemand: 1.15, apiDemand: 0.85 } },
    sd_h200: { title: 'H200 与海外机房', desc: '买卡和租卡的额度都多了。', mods: { gpuQuota: 1.2, rentQuota: 1.3 } },
  },
  startSpirits: [],

  // 历史名（C3 没有 Seed 的固定行；A9 只写“可选”，这里加一个有把握的闭源旗舰 Doubao-1.5-pro）。
  names: [
    { id: 'hn_doubao_15', name: 'Doubao-1.5-pro', role: 'flagship', node: 'sd_doubao_15', real: '2025-01-22',
      model: { open: false, minTotal: 200 }, world: null, clean: 'base', events: [] },
  ],

  // C4 没有 Seed 的专属事件。
  exclusives: [],
};
