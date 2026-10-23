// Midjourney：轻量史实树（规格 A5、A9；文件结构见 A2）。P3.T 第 5 批填写。
// 继承 _generic_image，在本家 7 个节点里写 V5、V6、网页版、V7、视频、迪士尼诉讼，另加一个“守着聊天室”的架空互斥项。
// 名表按 C3 的 hn_mj_v6 照抄；专属事件按 C4 的 ex_mj_photoreal 和 A9 的迪士尼诉讼落地。
// 文案大白话；标题和说明里不写年份，年份只出现在 hist.date（数据）。
export default {
  company: 'midjourney',
  tree: {
    id: 'midjourney',
    extends: '_generic_image',
    omit: [],
    branches: { base: '根基与资金', product: '模型与产品', market: '分发与生意', legal: '版权与诉讼' },
    nodes: [
      // ---- 根基与资金 ----
      { id: 'mj_v5', title: '把写实和手画对', desc: '先解决手、脸和材质，让生成图第一次能当成照片用。',
        branch: 'base', pos: [1, 0], days: 35, prereq: [],
        effects: { techBoost: { aesthetic_rl: 0.7 }, data: { post: { aesthetic: 0.8, photo: 0.4 } } },
        spirits: { add: [{ id: 'mj_aesthetic' }, { id: 'mj_bootstrapped' }] },
        popup: 'none', hist: { date: '2023-03-15', text: 'Midjourney V5 alpha 上线，写实度和手部细节大幅提升。' }, ai: { base: 30, historic: 100 } },

      // ---- 模型与产品 ----
      { id: 'mj_v6', title: '把图里的字画对', desc: '提示理解更准，招牌、海报上的字第一次能看清。',
        branch: 'product', pos: [1, 1], days: 70, prereq: [['mj_v5']],
        effects: { techBoost: { recaption: 0.5, flow: 0.5 }, data: { post: { text: 0.8, caption: 0.5 } },
          dims: { aesthetics: 3, text: 3 } },
        spirits: { add: [{ id: 'mj_text' }] }, grants: { names: ['hn_mj_v6'], events: ['ex_mj_photoreal'] },
        popup: 'card', hist: { date: '2023-12-21', text: 'V6 alpha 上线，提示理解更准，首次能较好地渲染图中文字。' }, ai: { base: 16, historic: 100 } },
      { id: 'mj_v7', title: '先懂你的口味', desc: '默认记住每个人喜欢的风格，再给一个半价、快得多的草稿模式。',
        branch: 'product', pos: [1, 3], days: 70, prereq: [['mj_web', 'mj_discord']],
        effects: { techBoost: { aesthetic_rl: 0.5 }, data: { post: { aesthetic: 0.6 } } },
        spirits: { add: [{ id: 'mj_personal' }] }, popup: 'none',
        hist: { date: '2025-04-04', text: 'V7 alpha 默认开启个性化，并加入 Draft 草稿模式。' }, ai: { base: 14, historic: 95 } },
      { id: 'mj_video', title: '让图动起来', desc: '一张图生成几段小视频，先只做图生视频，价格压到同行以下。',
        branch: 'product', pos: [3, 3], days: 70, prereq: [['mj_v7']], bypass: { released: { count: 3 } },
        effects: { techBoost: { img_edit: 0.6 }, demand: { sub: 1.1, days: 90 } },
        spirits: { add: [{ id: 'mj_video' }] }, popup: 'none',
        hist: { date: '2025-06-18', text: '发布首个视频模型，只支持图生视频。' }, ai: { base: 12, historic: 90 } },

      // ---- 分发与生意 ----
      { id: 'mj_web', title: '从聊天室搬到网页', desc: '生成、挑图、改图都在网页上完成，不再只靠聊天命令。',
        branch: 'market', pos: [2, 2], days: 35, prereq: [['mj_v6']], excludes: ['mj_discord'],
        effects: { brand: 1.06, demand: { sub: 1.12, days: 120 }, dims: { aesthetics: 3, adherence: 3 } }, spirits: { add: [{ id: 'mj_web' }] },
        popup: 'none', hist: { date: '2024-07-30', text: 'V6.1 发布，统一的网页编辑器同期上线。' }, ai: { base: 12, historic: 90 } },
      { id: 'mj_discord', title: '继续守着聊天室', desc: '不加网页，把社区和机器人做到最顺，老用户一个都不走。',
        branch: 'market', pos: [3, 2], days: 35, prereq: [['mj_v6']], excludes: ['mj_web'], fiction: true,
        effects: { rep: 2, demand: { sub: 1.05, days: 90 } }, spirits: { add: [{ id: 'mj_discord' }] }, popup: 'none', ai: { base: 4 } },

      // ---- 版权与诉讼 ----
      { id: 'mj_lawsuit', title: '应诉，不和解', desc: '坚持用公开图片训练属于合理使用，先在法庭上把话说清楚。',
        branch: 'legal', pos: [2, 4], days: 35, prereq: [['mj_v6']],
        effects: { cashOfStart: -0.02, risk: { image: 1.2 } }, spirits: { add: [{ id: 'mj_defend' }] },
        grants: { events: ['ex_mj_disney'] }, popup: 'none',
        hist: { date: '2025-06-11', text: '迪士尼和环球起诉 Midjourney，指其能随意生成版权角色。' }, ai: { base: 8, historic: 90 } },
    ],
  },

  // 本家特质（A2）。mods 的键都在 E3 的词表里。
  spirits: {
    mj_aesthetic: { title: '美学优先', desc: '构图、光影和手部细节练得深，用户一眼认得出。', mods: { 'cap.aesthetics': 14, 'cap.realism': 4 } },
    mj_bootstrapped: { title: '不拿风投', desc: '靠订阅自己养自己，花钱更省，估值更稳。', mods: { cost: 0.95, valuation: 1.05 } },
    mj_text: { title: '字画对了', desc: '招牌和海报上的字能看清，设计和广告客户愿意来。', mods: { 'cap.text': 4, 'cap.adherence': 2 } },
    mj_personal: { title: '懂你的口味', desc: '默认记住用户喜欢的风格，留存更高。', mods: { subDemand: 1.1, 'cap.aesthetics': 3 } },
    mj_video: { title: '会动的画', desc: '图生视频打开了新场景，也分走一部分算力。', mods: { subDemand: 1.08, gpuQuota: 0.96 } },
    mj_web: { title: '自有网页', desc: '不用再被聊天平台的规则卡住，转化和留存更好。', mods: { subDemand: 1.12, brandGain: 1.05 } },
    mj_discord: { title: '聊天室社区', desc: '老用户黏性高，社区氛围好，但新用户上手慢。', mods: { brandGain: 1.06, subDemand: 0.97 } },
    mj_defend: { title: '合理使用抗辩', desc: '官司照打，数据继续用，判决前风险一直在。', mods: { legal: 1.15, dataQuality: 1.05 } },
  },
  startSpirits: [],

  // 历史名（C3 的 Midjourney 行照抄）。
  names: [
    { id: 'hn_mj_v6', name: 'Midjourney V6', role: 'flagship', node: 'mj_v6', real: '2023-12-21',
      model: { dimLead: { aesthetics: 0 }, atLeast: { name: 'Midjourney V6', d: 1.5 } }, world: null, clean: 'base', events: ['ex_mj_photoreal'] },
  ],

  // 专属事件（C4 的 ex_mj_photoreal；A9 的迪士尼诉讼另起一条）。
  exclusives: [
    { id: 'ex_mj_photoreal', title: '{model}：写实图卖爆了',
      on: 'release', name: 'hn_mj_v6', node: null, delay: [0, 0], within: 0,
      cond: { released: { count: 1 } },
      supersedes: { milestone: [], event: [] }, scene: null,
      effects: { demand: { sub: 1.2, days: 60 } }, choices: [],
      notice: false, hist: { date: '2023-12-21', text: 'V6 写实度更高，订阅用户明显增长。' } },
    { id: 'ex_mj_disney', title: '好莱坞把 {company} 告了',
      on: 'node', name: null, node: 'mj_lawsuit', delay: [0, 0], within: 0,
      cond: { users: 1e6 },
      supersedes: { milestone: [], event: [] }, scene: null, effects: null,
      choices: [
        { id: 'defend', label: '法庭上见，主张合理使用',
          hint: '继续用公开图片训练，赢了就没事，输了赔得多。', effects: { rep: 2, brand: 1.05, risk: { image: 1.1 } } },
        { id: 'settle', label: '谈和解，先止血',
          hint: '付一笔钱，部分角色和风格以后不再生成。', effects: { cashOfStart: -0.04, risk: { image: 0.75 }, demand: { sub: 0.95, days: 60 } } },
      ],
      notice: false, hist: { date: '2025-06-11', text: '迪士尼和环球起诉 Midjourney，称其是“无底的剽窃深渊”。' } },
  ],
};
