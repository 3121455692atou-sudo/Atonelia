// TypeSafe AI：通用树 + 本家风味（规格 A5、A8；文件结构见 A2）。P3.T 第 6 批填写。
// 继承 _generic_llm，只加结构化决策这条线上的 6 个本家节点（5 个史实 + 1 个架空）。
// 名表照时间线里的 Jev 和 JEVnovel 2 落地；专属事件照接入 AI Gateway 和小说判别模型写。
// 文案不写年份，年份只出现在 hist.date（数据）。
export default {
  company: 'jev',
  tree: {
    id: 'jev',
    extends: '_generic_llm',
    branches: { decide: '决策模型', product: '产品与接入' },
    nodes: [
      // ---- 决策模型 ----
      { id: 'jev_define', title: '不写文章，只给判断', desc: '输入状态和几个选项，输出带概率的选择、评分和是非判断。',
        branch: 'decide', pos: [0, 6], days: 35, prereq: [['gs_niche_decide']],
        available: { era: '2026-07' },
        effects: { data: { post: { safety: 0.4, agent: 0.3 } } }, spirits: { add: [{ id: 'jev_system_one' }] },
        grants: { names: ['hn_jev'] }, popup: 'scene', scene: 'personal_jev_decision',
        hist: { date: '2026-09-15', text: 'TypeSafe AI 发布决策模型 Jev 的早期访问。' }, ai: { base: 30, historic: 100 } },
      { id: 'jev_gateway', title: '接进 AI 网关', desc: '让应用把它当成一个只做决策的接口，重试和人工复核都由调用方接。',
        branch: 'product', pos: [1, 6], days: 35, prereq: [['jev_define']],
        effects: { demand: { api: 1.15, days: 90 } }, spirits: { add: [{ id: 'jev_gateway' }] },
        grants: { events: ['ex_jev_gateway'] }, popup: 'none',
        hist: { date: '2026-09-18', text: 'Jev 上线 AI Gateway 后，付费团队当天就大量接入。' }, ai: { base: 20, historic: 100 } },
      { id: 'jev_novel2', title: '拿它判别小说里的坏句子', desc: '用一个模型给中文小说逐句打分，标出哪里写得像机器。',
        branch: 'product', pos: [2, 6], days: 14, prereq: [['jev_gateway', 'jev_define']],
        effects: { data: { post: { chat: 0.4, safety: 0.3 } } }, spirits: { add: [{ id: 'jev_novel' }] },
        grants: { names: ['hn_jev_novel_2'], events: ['ex_jev_novel'] }, popup: 'card',
        hist: { date: '2026-09-30', text: 'TypeSafe AI 发布 JEVnovel 2，单次前向输出坏句概率。' }, ai: { base: 20, historic: 100 } },
      { id: 'jev_dual', title: '双头结构，片段级检查', desc: '一个头判整句，另一个头标出写坏的片段，给出删改建议。',
        branch: 'decide', pos: [3, 6], days: 35, prereq: [['jev_novel2']], excludes: ['jev_chat'],
        effects: { techBoost: { agentic_rl: 0.3 }, data: { post: { safety: 0.3 } } },
        spirits: { add: [{ id: 'jev_dual' }] }, popup: 'none',
        hist: { date: '2026-10-06', text: 'JEVnovel 2.5 改用双头结构。' }, ai: { base: 14, historic: 96 } },
      { id: 'jev_api', title: '开放决策接口', desc: '把选择、评分、是非判断打包成一个接口，按调用量收费。',
        branch: 'product', pos: [3, 7], days: 35, prereq: [['jev_gateway']], bypass: { integrations: 2 },
        effects: { valuation: 1.05, demand: { api: 1.1, days: 90 } }, spirits: { add: [{ id: 'jev_api' }] },
        popup: 'none', hist: { date: '2026-10-01', text: 'Decisions API 上线，把决策模型做成标准接口。' }, ai: { base: 16, historic: 96 } },

      // ---- 产品与接入（架空分支） ----
      { id: 'jev_chat', title: '改做通用聊天助手', desc: '放弃只输出判断的定位，转去卷通用对话。',
        branch: 'product', pos: [4, 6], days: 35, prereq: [['jev_gateway']], excludes: ['jev_dual'], fiction: true,
        effects: { demand: { chat: 1.2, days: 120 } }, spirits: { add: [{ id: 'jev_chat' }] },
        popup: 'none', ai: { base: 4, historic: 0 } },
    ],
  },

  // 本家特质（A2）。开局只带一个说明特质，具体加成在节点上。
  spirits: {
    jev_typed: { title: '类型化输出', desc: '只返回预先定义好的选项和概率，调用方不用解析长文本。', info: true },
    jev_system_one: { title: 'System One 决策', desc: '不写文章，直接给判断，安全和工具方向更吃香。', mods: { 'post.safety': 1.08, 'post.agent': 1.08 } },
    jev_gateway: { title: '接进网关', desc: '应用把它当成标准接口，接入机会多。', mods: { apiDemand: 1.12, integrationOdds: 1.2 } },
    jev_novel: { title: '小说判别', desc: '中文写作工具会来买这种逐句打分的能力。', mods: { 'post.writing': 1.1 } },
    jev_dual: { title: '双头结构', desc: '整句和片段一起判，反馈更细。', mods: { 'post.safety': 1.06, research: 1.04 } },
    jev_api: { title: '决策接口', desc: '按调用量收费，收入更稳。', mods: { apiDemand: 1.08, valuation: 1.04 } },
    jev_chat: { title: '转向通用对话', desc: '用户面更广，但和决策定位冲突。', mods: { chatDemand: 1.15, apiDemand: 0.9 } },
  },
  startSpirits: ['jev_typed'],

  // 历史名（时间线里的 Jev 与 JEVnovel 2）。
  names: [
    { id: 'hn_jev', name: 'Jev', role: 'flagship', node: 'jev_define', real: '2026-09-15',
      model: { role: 'flagship', open: false, minTotal: 1.5, maxTotal: 1600 }, world: null, clean: null, events: [] },
    { id: 'hn_jev_novel_2', name: 'JEVnovel 2', role: 'flagship', node: 'jev_novel2', real: '2026-09-30',
      model: { role: 'flagship', open: false, minTotal: 1.5, maxTotal: 1600 }, world: null, clean: null, events: ['ex_jev_novel'] },
  ],

  // 专属事件（C4）：接入网关后的采用、小说判别模型的上线。
  exclusives: [
    { id: 'ex_jev_gateway', title: '{model} 上线后接进的团队很多',
      on: 'month', name: 'hn_jev', node: null, delay: [0, 0], within: 60,
      cond: { integrations: 2 },
      supersedes: { milestone: ['ms_gateway'], event: [] }, scene: 'personal_jev_gateway',
      effects: { demand: { api: 1.2, days: 90 } }, choices: [],
      notice: false, hist: { date: '2026-09-18', text: 'Jev 接入网关后，首日付费团队采用数超过此前模型发布。' } },
    { id: 'ex_jev_novel', title: '{model}：给中文小说挑坏句子',
      on: 'release', name: 'hn_jev_novel_2', node: null, delay: [0, 0], within: 0,
      cond: { model: { open: false } },
      supersedes: { milestone: [], event: [] }, scene: null,
      effects: { brand: 1.08, demand: { api: 1.12, days: 60 } }, choices: [],
      notice: false, hist: { date: '2026-09-30', text: 'JEVnovel 2 面向中文小说的 AI 腔判别，单次前向输出坏句概率。' } },
  ],
};
