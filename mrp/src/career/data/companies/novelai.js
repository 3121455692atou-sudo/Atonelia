// Anlatan · NovelAI：通用树 + 本家风味（规格 A5、A8；文件结构见 A2）。P3.T 第 6 批填写。
// 继承 _generic_llm，只加小说模型这条线上的 6 个本家节点（4 个史实 + 2 个架空）。
// 名表照时间线里的 Clio、Kayra、Erato、Xialong 落地；Erato 按 A8 的例子挂 unlock adopt_open_base。
// 文案不写年份，年份只出现在 hist.date（数据）。
export default {
  company: 'novelai',
  tree: {
    id: 'novelai',
    extends: '_generic_llm',
    branches: { model: '小说模型', product: '订阅产品' },
    nodes: [
      // ---- 小说模型 ----
      { id: 'nai_clio', title: '从零训一个小说模型', desc: '不用现成底座，用自家整理的叙事文本从零练，上下文放得下整章。',
        branch: 'model', pos: [0, 6], days: 35, prereq: [['gs_niche_story']],
        effects: { data: { post: { chat: 0.5 } } }, spirits: { add: [{ id: 'nai_own_model' }] },
        grants: { names: ['hn_nai_clio'], events: ['ex_nai_clio'] }, popup: 'scene', scene: 'personal_novelai_clio',
        hist: { date: '2023-05-23', text: 'NovelAI 推出从头训练的小说模型 Clio，约三十亿参数。' }, ai: { base: 24, historic: 100 } },
      { id: 'nai_kayra', title: '十三B 的写作主力', desc: '参数翻几倍，人物和情节更连贯，成为订阅用户的主力模型。',
        branch: 'model', pos: [1, 6], days: 35, prereq: [['nai_clio']],
        effects: { data: { post: { chat: 0.5 } } }, spirits: { add: [{ id: 'nai_writer' }] },
        grants: { names: ['hn_nai_kayra'] }, popup: 'scene', scene: 'personal_novelai_kayra',
        hist: { date: '2023-07-28', text: 'NovelAI 的 Kayra 上线，成为主力文本模型。' }, ai: { base: 20, historic: 100 } },
      { id: 'nai_erato', title: '在开源大底座上续训', desc: '拿开源的大模型当底座，再用自家故事数据继续练，写作再上一个台阶。',
        branch: 'model', pos: [2, 6], days: 35, prereq: [['nai_kayra']],
        available: { ms: { ms_open_frontier: 'any' } },
        effects: { data: { post: { chat: 0.6 } }, techBoost: { long_ctx: 0.3 } },
        spirits: { add: [{ id: 'nai_erato' }] }, grants: { unlock: ['adopt_open_base'], names: ['hn_nai_erato'], events: ['ex_nai_erato'] },
        popup: 'scene', scene: 'personal_novelai_erato',
        hist: { date: '2024-09-23', text: 'NovelAI 在 Llama 3 70B 上继续训练出 Erato。' }, ai: { base: 20, historic: 100 } },
      { id: 'nai_xialong', title: '自家数据加强化学习', desc: '在开源底座上用自己的小说数据做强化学习，练出迄今最大的写作模型。',
        branch: 'model', pos: [3, 6], days: 105, prereq: [['nai_erato', 'nai_kayra']],
        available: { ms: { ms_trillion_open: 'any' } },
        effects: { data: { post: { chat: 0.5, safety: 0.2 } }, techBoost: { agentic_rl: 0.3 } },
        spirits: { add: [{ id: 'nai_rl' }] }, grants: { names: ['hn_nai_xialong'] },
        popup: 'card', hist: { date: '2026-03-31', text: 'NovelAI 用自家小说数据强化学习微调出最大的模型 Xialong。' }, ai: { base: 16, historic: 100 } },

      // ---- 订阅产品（架空分支） ----
      { id: 'nai_roleplay', title: '只服务角色扮演', desc: '砍掉通用写作工具，把所有资源押在陪聊和角色卡上。',
        branch: 'product', pos: [2, 7], days: 35, prereq: [['nai_kayra']], excludes: ['nai_enterprise'], fiction: true,
        effects: { demand: { chat: 1.2, days: 120 } }, spirits: { add: [{ id: 'nai_roleplay' }] },
        popup: 'none', ai: { base: 5, historic: 0 } },
      { id: 'nai_enterprise', title: '转向企业写作定制', desc: '给出版社和游戏公司做定制模型，单价高，散户变少。',
        branch: 'product', pos: [3, 7], days: 35, prereq: [['nai_erato']], excludes: ['nai_roleplay'], fiction: true,
        bypass: { integrations: 3 },
        effects: { raise: 0.05, valuation: 1.06 }, spirits: { add: [{ id: 'nai_enterprise' }] },
        popup: 'none', ai: { base: 4, historic: 0 } },
    ],
  },

  // 本家特质（A2）。开局只带一个说明特质，具体加成在节点上。
  spirits: {
    nai_story_first: { title: '故事优先', desc: '所有功能都围着长篇小说和角色扮演转。', info: true },
    nai_own_model: { title: '从零训练', desc: '底座是自己的，叙事风格完全可控。', mods: { research: 1.06, 'post.writing': 1.08 } },
    nai_writer: { title: '写作主力', desc: '订阅用户拿它写长篇，留存更高。', mods: { 'cap.writing': 2, subDemand: 1.08 } },
    nai_erato: { title: '开源底座续训', desc: '借开源大模型的底子，写作再上一层。', mods: { 'post.writing': 1.1, distillTime: 0.9 } },
    nai_rl: { title: '自家数据强化学习', desc: '用自家故事数据做后训练，文风更贴用户。', mods: { 'post.writing': 1.08, 'post.safety': 1.05 } },
    nai_roleplay: { title: '只做角色扮演', desc: '陪聊用户黏性高，企业单子不接。', mods: { chatDemand: 1.15, apiDemand: 0.9 } },
    nai_enterprise: { title: '企业定制', desc: '定制单单价高，但散户变少。', mods: { valuation: 1.08, subDemand: 1.1 } },
  },
  startSpirits: ['nai_story_first'],

  // 历史名（时间线里的四款写作模型）。
  names: [
    { id: 'hn_nai_clio', name: 'Clio', role: 'small', node: 'nai_clio', real: '2023-05-23',
      model: { role: 'small', open: false, minTotal: 1.5, maxTotal: 15 }, world: null, clean: null, events: [] },
    { id: 'hn_nai_kayra', name: 'Kayra', role: 'flagship', node: 'nai_kayra', real: '2023-07-28',
      model: { role: 'flagship', open: false, minTotal: 7, maxTotal: 120 }, world: null, clean: null, events: [] },
    { id: 'hn_nai_erato', name: 'Erato', role: 'flagship', node: 'nai_erato', real: '2024-09-23',
      model: { open: false, minTotal: 7, maxTotal: 1600 }, world: null, clean: null, events: ['ex_nai_erato'] },
    { id: 'hn_nai_xialong', name: 'Xialong', role: 'flagship', node: 'nai_xialong', real: '2026-03-31',
      model: { open: false, minTotal: 7, maxTotal: 1600 }, world: null, clean: null, events: [] },
  ],

  // 专属事件（C4）：Clio 从零训出来、Erato 借开源底座的争议。
  exclusives: [
    { id: 'ex_nai_clio', title: '{model}：小团队从零训出来的小说模型',
      on: 'release', name: 'hn_nai_clio', node: null, delay: [0, 0], within: 0,
      cond: { model: { maxTotal: 15 } },
      supersedes: { milestone: ['ms_from_scratch'], event: [] }, scene: 'personal_novelai_clio',
      effects: { brand: 1.1, demand: { sub: 1.15, days: 90 } }, choices: [],
      notice: false, hist: { date: '2023-05-23', text: 'Clio 是 NovelAI 从头训练的小说模型，约三十亿参数。' } },
    { id: 'ex_nai_erato', title: '{model} 借开源底座的争议',
      on: 'release', name: 'hn_nai_erato', node: null, delay: [0, 0], within: 0,
      cond: { model: { open: false } },
      supersedes: { milestone: ['ms_writer_top'], event: [] }, scene: 'personal_novelai_erato',
      effects: { brand: 1.1, demand: { sub: 1.15, days: 90 } }, choices: [
        { id: 'explain_base', label: '公开说明底座和续训过程', hint: '把用了什么、怎么练的说清楚。', effects: { rep: 2, brand: 1.05 } },
        { id: 'say_nothing', label: '不解释，让作品说话', hint: '省事，但开源社区会追问。', effects: { risk: { tos: 1.1 } } },
      ],
      notice: false, hist: { date: '2024-09-23', text: 'Erato 基于 Llama 3 70B 继续训练，是 NovelAI 写作能力的又一次提升。' } },
  ],
};
