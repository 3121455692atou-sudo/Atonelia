// Perplexity AI：通用树 + 本家风味（规格 A5、A8；文件结构见 A2）。P3.T 第 6 批填写。
// 继承 _generic_llm，只加联网搜索、后训练搜索模型、深度研究和 Computer 这条线上的 6 个本家节点。
// 两个名额从时间线里的 pplx-70b-online 和 Sonar 落地；专属事件照“答案带出处”和 Deep Research 写。
// 文案不写年份，年份只出现在 hist.date（数据）。
export default {
  company: 'perplexity',
  tree: {
    id: 'perplexity',
    extends: '_generic_llm',
    branches: { search: '联网搜索', product: '研究产品' },
    nodes: [
      // ---- 联网搜索 ----
      { id: 'pplx_online', title: '第一批联网模型', desc: '一边查网页一边回答，答案后面列出用到的来源。',
        branch: 'search', pos: [0, 6], days: 35, prereq: [['gs_niche_search']],
        effects: { data: { post: { knowledge: 0.5 } }, brand: 1.05 },
        spirits: { add: [{ id: 'pplx_citations' }] }, grants: { names: ['hn_pplx_online'] },
        popup: 'card', hist: { date: '2023-11-29', text: 'Perplexity 上线首批联网在线模型，基于开源底座做后训练。' }, ai: { base: 24, historic: 100 } },
      { id: 'pplx_sonar', title: '自己的搜索模型', desc: '在开源底座上继续训练，回答更看重事实和可读性。',
        branch: 'search', pos: [1, 6], days: 70, prereq: [['pplx_online']], excludes: ['pplx_own_base'],
        available: { ms: { ms_open_frontier: 'any' } },
        effects: { data: { post: { knowledge: 0.4, chat: 0.3 } }, techBoost: { long_ctx: 0.3 } },
        spirits: { add: [{ id: 'pplx_sonar' }] }, grants: { names: ['hn_pplx_sonar'], events: ['ex_pplx_sonar'] },
        popup: 'card', hist: { date: '2025-02-11', text: '基于 Llama 3.3 70B 继续训练的新 Sonar 成为默认搜索模型。' }, ai: { base: 20, historic: 100 } },
      { id: 'pplx_own_base', title: '不再站在开源底座上', desc: '自己从头训一个搜索模型，慢，但回答风格和数据都归自己。',
        branch: 'search', pos: [2, 6], days: 105, prereq: [['pplx_online']], excludes: ['pplx_sonar'], fiction: true,
        effects: { techBoost: { long_ctx: 0.4 }, data: { post: { knowledge: 0.3 } } },
        spirits: { add: [{ id: 'pplx_own_base' }] }, popup: 'none', ai: { base: 6, historic: 0 } },

      // ---- 研究产品 ----
      { id: 'pplx_deep_research', title: '深度研究：多轮检索再写报告', desc: '自己拆问题、读几十个来源，最后给一份带引用的报告。',
        branch: 'product', pos: [1, 7], days: 35, prereq: [['pplx_sonar']],
        effects: { data: { post: { agent: 0.3 } }, demand: { chat: 1.1, api: 1.1, days: 90 } },
        spirits: { add: [{ id: 'pplx_research' }] }, grants: { events: ['ex_pplx_research'] },
        popup: 'none', hist: { date: '2025-02-14', text: 'Perplexity 推出 Deep Research，多轮检索后生成研究报告。' }, ai: { base: 20, historic: 100 } },
      { id: 'pplx_computer', title: '把浏览器和子代理串起来', desc: '接到浏览器里，自己拆任务、开页面、调多个子代理把事情做完。',
        branch: 'product', pos: [2, 7], days: 70, prereq: [['pplx_deep_research', 'pplx_sonar']],
        bypass: { techs: ['computer_use'] }, excludes: ['pplx_answer_only'],
        effects: { techBoost: { agentic_rl: 0.4, computer_use: 0.4 }, data: { post: { agent: 0.3 } } },
        spirits: { add: [{ id: 'pplx_comet' }] }, popup: 'none',
        hist: { date: '2026-02-25', text: 'Perplexity Computer 发布，拆解任务后调度多个子代理执行。' }, ai: { base: 16, historic: 100 } },
      { id: 'pplx_answer_only', title: '只做搜索问答，不碰 Agent', desc: '把浏览器和自动化都砍掉，专注把答案写准、写快。',
        branch: 'product', pos: [3, 7], days: 35, prereq: [['pplx_deep_research']], excludes: ['pplx_computer'], fiction: true,
        effects: { demand: { chat: 1.15, days: 120 } }, spirits: { add: [{ id: 'pplx_answer_only' }] },
        popup: 'none', ai: { base: 5, historic: 0 } },
    ],
  },

  // 本家特质（A2）。开局只带一个说明特质，具体加成在节点上。
  spirits: {
    pplx_answer_first: { title: '答案优先', desc: '用户要的是结论和出处，不是一段聊天。', info: true },
    pplx_citations: { title: '每条答案带出处', desc: '查资料的人更信得过，知识问答更吃香。', mods: { 'cap.knowledge': 2, chatDemand: 1.08 } },
    pplx_sonar: { title: '搜索后训练', desc: '在开源底座上把事实性和可读性练出来。', mods: { routerDemand: 1.08, apiDemand: 1.08 } },
    pplx_research: { title: '深度研究', desc: '多轮检索和长报告是招牌，企业用户愿意付钱。', mods: { 'post.agent': 1.08, apiDemand: 1.06 } },
    pplx_comet: { title: '浏览器入口', desc: '把模型放进浏览器，用户打开就能用。', mods: { chatDemand: 1.1 } },
    pplx_own_base: { title: '自研搜索底座', desc: '底座是自己的，研究更自由。', mods: { research: 1.06, 'cap.knowledge': 2 } },
    pplx_answer_only: { title: '只做答案', desc: '产品简单，订阅更稳，但不接企业自动化。', mods: { subDemand: 1.1, apiDemand: 0.92 } },
  },
  startSpirits: ['pplx_answer_first'],

  // 历史名（时间线里的两款搜索模型；后一款沿用 Sonar 这个系列名）。
  names: [
    { id: 'hn_pplx_online', name: 'pplx-70b-online', role: 'flagship', node: 'pplx_online', real: '2023-11-29',
      model: { role: 'flagship', open: false, minTotal: 7, maxTotal: 120 }, world: null, clean: null, events: [] },
    { id: 'hn_pplx_sonar', name: 'Sonar', role: 'flagship', node: 'pplx_sonar', real: '2025-02-11',
      model: { open: false, minTotal: 1.5, maxTotal: 1600 }, world: null, clean: null, events: ['ex_pplx_sonar'] },
  ],

  // 专属事件（C4）：Sonar 发布后主打“带出处的答案”，Deep Research 把研究需求带起来。
  exclusives: [
    { id: 'ex_pplx_sonar', title: '{model}：每个答案都给出处',
      on: 'release', name: 'hn_pplx_sonar', node: null, delay: [0, 0], within: 0,
      cond: { model: { open: false } },
      supersedes: { milestone: ['ms_on_shoulders'], event: [] }, scene: 'personal_perplexity_sonar',
      effects: { brand: 1.1, demand: { chat: 1.2, api: 1.15, days: 90 } }, choices: [
        { id: 'cite_all', label: '每个结论都标来源', hint: '查得慢一点，但用户更信。', effects: { rep: 2, brand: 1.05 } },
        { id: 'answer_fast', label: '先给结论，来源放折叠里', hint: '回答更快，出处没那么显眼。', effects: { demand: { chat: 1.1, days: 30 } } },
      ],
      notice: false, hist: { date: '2025-02-11', text: '新版 Sonar 成为默认搜索模型，主打事实性与可读性。' } },
    { id: 'ex_pplx_research', title: '{company} 把研究报告做成了产品',
      on: 'month', name: null, node: null, delay: [0, 0], within: 120,
      cond: { service: { chatOn: true } },
      supersedes: { milestone: ['ms_deep_research'], event: [] }, scene: 'personal_perplexity_research',
      effects: { demand: { chat: 1.12, api: 1.08, days: 90 } }, choices: [],
      notice: false, hist: { date: '2025-02-14', text: 'Deep Research 免费开放，几分钟内检索数百个来源。' } },
  ],
};
