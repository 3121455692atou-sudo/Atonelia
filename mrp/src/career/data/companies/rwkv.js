// RWKV 社区 / 元始智能：通用树 + 本家风味（规格 A5、A8；文件结构见 A2）。P3.T 第 6 批填写。
// 继承 _generic_llm，只加循环架构这条线上的 6 个本家节点；不走 Transformer，推理便宜是这家最大的不同。
// 名表按时间线里的 Raven、Eagle、Goose 三款落地；专属事件按开源社区和 Goose 论文写。
// 文案不写年份，年份只出现在 hist.date（数据）。
export default {
  company: 'rwkv',
  tree: {
    id: 'rwkv',
    extends: '_generic_llm',
    branches: { arch: '循环架构', open: '社区与授权' },
    nodes: [
      // ---- 循环架构 ----
      { id: 'rw_raven', title: '循环架构先做出能聊天的版本', desc: '不用注意力，按时间步记住前面的内容，先把对话和知识问答跑通。',
        branch: 'arch', pos: [0, 6], days: 35, prereq: [['gs_niche_arch']],
        effects: { techBoost: { linear_attn: 0.4 }, data: { post: { knowledge: 0.4, chat: 0.3 } } },
        spirits: { add: [{ id: 'rw_linear' }] }, grants: { names: ['hn_rwkv4_raven'] },
        popup: 'card', hist: { date: '2023-04-01', text: 'RWKV-4 Raven 在 Pile 基座上做指令微调后开源，纯循环结构也能对话。' }, ai: { base: 24, historic: 100 } },
      { id: 'rw_world', title: '多语种的世界语料', desc: '把一百多种语言的文本配成训练集，让小模型也能读写非英语内容。',
        branch: 'arch', pos: [1, 6], days: 35, prereq: [['rw_raven']], bypass: { techs: ['linear_attn'] },
        effects: { data: { post: { knowledge: 0.5 } }, techBoost: { linear_attn: 0.3 } },
        spirits: { add: [{ id: 'rw_multilingual' }] }, grants: { events: ['ex_rwkv_world'] },
        popup: 'none', hist: { date: '2023-05-07', text: '用一百多种语言的世界语料训练的 RWKV-4 World 开始发布。' }, ai: { base: 18, historic: 92 } },
      { id: 'rw_eagle', title: '把循环模型推到七B', desc: '用更多 token 和多语种数据，证明循环架构不是只能做小玩具。',
        branch: 'arch', pos: [2, 6], days: 70, prereq: [['rw_world']],
        effects: { techBoost: { linear_attn: 0.4 }, data: { post: { knowledge: 0.3, code: 0.2 } } },
        spirits: { add: [{ id: 'rw_recipe' }] }, grants: { names: ['hn_rwkv5_eagle'] },
        popup: 'card', hist: { date: '2024-01-29', text: 'RWKV-5 Eagle 7B 用一万多亿 token、一百多种语言训练后发布。' }, ai: { base: 18, historic: 100 } },
      { id: 'rw_goose', title: '状态演化再换一版', desc: '让状态随输入变化，循环推理的显存和速度仍然不随长度涨。',
        branch: 'arch', pos: [3, 6], days: 70, prereq: [['rw_eagle', 'rw_world']],
        available: { any: [{ ms: { ms_reasoning: 'any' } }, { techs: ['reasoning'] }] },
        effects: { techBoost: { linear_attn: 0.5 }, data: { post: { math: 0.3, knowledge: 0.3 } } },
        spirits: { add: [{ id: 'rw_goose' }] }, grants: { names: ['hn_rwkv7_goose'], events: ['ex_rwkv_goose'] },
        popup: 'scene', scene: 'personal_rwkv_goose',
        hist: { date: '2025-03-18', text: 'RWKV-7 论文和 World3 权重公开，介绍新的状态演化形式。' }, ai: { base: 16, historic: 100 } },

      // ---- 社区与授权（架空分支） ----
      { id: 'rw_open_recipe', title: '训练配方全部公开', desc: '数据配比、训练脚本和权重一起放出去，谁都能从头复现。',
        branch: 'open', pos: [1, 7], days: 35, prereq: [['rw_world', 'rw_eagle']], excludes: ['rw_patent'], fiction: true,
        effects: { brand: 1.08, data: { post: { knowledge: 0.2 } } }, spirits: { add: [{ id: 'rw_open_recipe' }] },
        popup: 'none', ai: { base: 6, historic: 0 } },
      { id: 'rw_patent', title: '架构申请专利，转向授权收费', desc: '不再把新结构白送，靠授权和企业定制收钱。',
        branch: 'open', pos: [2, 7], days: 35, prereq: [['rw_world']], excludes: ['rw_open_recipe'], fiction: true,
        effects: { raise: 0.06, valuation: 1.06 }, spirits: { add: [{ id: 'rw_patent' }] },
        popup: 'none', ai: { base: 4, historic: 0 } },
    ],
  },

  // 本家特质（A2）。开局只带一个说明特质，具体加成在节点上。
  spirits: {
    rw_community: { title: '社区维护', desc: '权重和训练脚本都放在公开仓库，社区自己会接着改。', info: true },
    rw_linear: { title: '循环结构', desc: '推理时每个词的显存和时间恒定，长文本特别省。', mods: { infer: 1.12, train: 1.03 } },
    rw_multilingual: { title: '多语种语料', desc: '一百多种语言的文本一起训，非英语内容更顺。', mods: { routerDemand: 1.08, knowGain: 1.05 } },
    rw_recipe: { title: '训练配方', desc: '大 token 量的训练流程摸熟了，同样的卡能多跑一点。', mods: { research: 1.05, train: 1.03 } },
    rw_goose: { title: '状态演化', desc: '循环推理更省，长上下文也不掉速。', mods: { infer: 1.12, 'cap.knowledge': 2 } },
    rw_open_recipe: { title: '配方公开', desc: '谁都能复现，社区最认。', mods: { brandGain: 1.1, routerDemand: 1.12 } },
    rw_patent: { title: '架构授权', desc: '授权费稳，但社区热情会降一点。', mods: { valuation: 1.08, routerDemand: 0.95 } },
  },
  startSpirits: ['rw_community'],

  // 历史名（时间线里 RWKV 的三次代际发布）。
  names: [
    { id: 'hn_rwkv4_raven', name: 'RWKV-4 Raven 14B', role: 'flagship', node: 'rw_raven', real: '2023-04-01',
      model: { role: 'flagship', open: true, minTotal: 1.5, maxTotal: 32 }, world: null, clean: null, events: [] },
    { id: 'hn_rwkv5_eagle', name: 'RWKV-5 Eagle 7B', role: 'flagship', node: 'rw_eagle', real: '2024-01-29',
      model: { role: 'flagship', open: true, minTotal: 3, maxTotal: 70 }, world: null, clean: null, events: [] },
    { id: 'hn_rwkv7_goose', name: 'RWKV-7 Goose', role: 'flagship', node: 'rw_goose', real: '2025-03-18',
      model: { role: 'flagship', open: true, minTotal: 7, maxTotal: 1600 }, world: null, clean: null, events: ['ex_rwkv_goose'] },
  ],

  // 专属事件（C4）：社区把权重拿去微调、Goose 论文带来的关注。
  exclusives: [
    { id: 'ex_rwkv_world', title: '{company} 的权重被社区拿去微调',
      on: 'month', name: null, node: null, delay: [0, 0], within: 120,
      cond: { service: { apiOn: true } },
      supersedes: { milestone: [], event: [] }, scene: null,
      effects: { brand: 1.05, demand: { router: 1.1, days: 60 } }, choices: [],
      notice: false, hist: { date: '2023-05-07', text: 'World 权重放出后，社区开始在自己的语料上继续微调。' } },
    { id: 'ex_rwkv_goose', title: '{model}：循环架构追了上来',
      on: 'release', name: 'hn_rwkv7_goose', node: null, delay: [0, 0], within: 0,
      cond: { model: { arch: ['rnn', 'dense'] } },
      supersedes: { milestone: ['ms_rnn_catchup'], event: [] }, scene: 'personal_rwkv_goose',
      effects: { brand: 1.1, demand: { api: 1.15, router: 1.15, days: 90 } }, choices: [
        { id: 'share_recipe', label: '把状态演化的配方一起公开', hint: '社区照着复现，关注度更高。', effects: { papers: ['linear_attn'], know: 6, brand: 1.06 } },
        { id: 'keep_recipe', label: '只放权重，配方先留着', hint: '别人能跑，但不容易追上来。', effects: { brand: 1.03 } },
      ],
      notice: false, hist: { date: '2025-03-18', text: 'RWKV-7 论文与权重公开，循环架构在多语种上追近同级模型。' } },
  ],
};
