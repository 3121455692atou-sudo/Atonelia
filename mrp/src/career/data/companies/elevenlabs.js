// ElevenLabs：轻量史实树（规格 A5、A9；文件结构见 A2）。P3.T 第 5 批填写。
// 继承 _generic_speech，在本家 7 个节点里写公测、多语言 v2、声音市场、低延迟 Flash、v3、Eleven Music，另加一个“只做消费级 App”的架空互斥项。
// 名表按 C3 的 hn_eleven_v3 照抄；专属事件按 C4 的 ex_eleven_tags 落地。
// 文案大白话；标题和说明里不写年份，年份只出现在 hist.date（数据）。
export default {
  company: 'elevenlabs',
  tree: {
    id: 'elevenlabs',
    extends: '_generic_speech',
    omit: [],
    branches: { base: '根基与资金', product: '模型与产品', market: '分发与生意' },
    nodes: [
      // ---- 根基与资金 ----
      { id: 'el_beta', title: '先把英文念得像真人', desc: '公测只做英文配音，声音自然、几秒样本就能复制，先把口碑打出去。',
        branch: 'base', pos: [1, 0], days: 35, prereq: [],
        effects: { brand: 1.04, techBoost: { zero_shot: 0.5 } }, spirits: { add: [{ id: 'el_beta' }] },
        popup: 'none', hist: { date: '2023-01', text: 'ElevenLabs 开放公测，以高拟真英文语音合成和声音克隆出圈。' }, ai: { base: 30, historic: 95 } },
      { id: 'el_multilingual', title: '一种声音说几十种语言', desc: '同一把声音换语言不换人，配音和有声书客户一下就来了。',
        branch: 'base', pos: [1, 1], days: 70, prereq: [['el_beta']],
        effects: { data: { post: { multilingual: 0.8, studio: 0.3 } }, demand: { sub: 1.08, days: 90 } },
        spirits: { add: [{ id: 'el_multilingual' }] }, popup: 'none',
        hist: { date: '2023-08-22', text: 'Eleven Multilingual v2 支持 29 种语言，长期作为主力语音模型。' }, ai: { base: 14, historic: 100 } },

      // ---- 模型与产品 ----
      { id: 'el_v3', title: '会叹气、会耳语的声音', desc: '在台词里直接标情绪和动作，多人对话也能分开演。',
        branch: 'product', pos: [1, 2], days: 35, prereq: [['el_multilingual']],
        effects: { techBoost: { audio_tags: 0.8 }, data: { post: { acting: 0.8, multilingual: 0.3 } },
          dims: { expressive: 3, safety: 3 } },
        spirits: { add: [{ id: 'el_v3' }] }, grants: { names: ['hn_eleven_v3'], events: ['ex_eleven_tags'] },
        popup: 'card', hist: { date: '2025-06-03', text: 'Eleven v3 以研究预览发布，支持 70 多种语言和内联音频标签。' }, ai: { base: 16, historic: 100 } },
      { id: 'el_music', title: '从配音跨到音乐', desc: '先谈好授权曲库再训练，生成的歌可以直接商用。',
        branch: 'product', pos: [3, 3], days: 70, prereq: [['el_v3']], bypass: { released: { count: 2 } },
        effects: { techBoost: { licensed: 0.5 }, risk: { music: 0.85 }, demand: { sub: 1.05, days: 90 } },
        spirits: { add: [{ id: 'el_music' }] }, popup: 'none',
        hist: { date: '2025-08-05', text: 'Eleven Music 上线，官方称训练已获授权、可用于商业用途。' }, ai: { base: 12, historic: 90 } },

      // ---- 分发与生意 ----
      { id: 'el_market', title: '让声音也能收租', desc: '用户上架自己的声音，别人用一次就分一次钱，素材越攒越多。',
        branch: 'market', pos: [0, 2], days: 35, prereq: [['el_multilingual']],
        effects: { brand: 1.05, demand: { sub: 1.08, days: 90 } }, spirits: { add: [{ id: 'el_market' }] },
        popup: 'none', ai: { base: 12 } },
      { id: 'el_flash', title: '把延迟压到几十毫秒', desc: '电话客服等不了几秒钟的合成，先把响应时间打到能对话的水平。',
        branch: 'market', pos: [1, 4], days: 70, prereq: [['el_market', 'el_v3']], excludes: ['el_consumer'],
        effects: { techBoost: { flow_tts: 0.6 }, demand: { api: 1.1, days: 120 }, cashOfStart: 0.02 }, spirits: { add: [{ id: 'el_flash' }] },
        popup: 'none', hist: { date: '2024-12-18', text: 'Eleven Flash v2.5 推出，生成延迟约 75 毫秒。' }, ai: { base: 12, historic: 90 } },
      { id: 'el_consumer', title: '只做消费级 App', desc: '不接企业单，把配音 App 做得更简单，靠订阅走量。',
        branch: 'market', pos: [3, 4], days: 35, prereq: [['el_market', 'el_v3']], excludes: ['el_flash'], fiction: true,
        effects: { brand: 1.06, demand: { sub: 1.1, days: 90 } }, spirits: { add: [{ id: 'el_consumer' }] }, popup: 'none', ai: { base: 5 } },
    ],
  },

  // 本家特质（A2）。mods 的键都在 E3 的词表里。
  spirits: {
    el_beta: { title: '先做英文配音', desc: '自然度和克隆都早一步，口碑先立住。', mods: { 'cap.naturalness': 3, 'cap.cloning': 3 } },
    el_multilingual: { title: '多语言主力', desc: '同一把声音说几十种语言，配音和有声书都认。', mods: { 'cap.multilingual': 3, 'cap.expressive': 20, subDemand: 1.08 } },
    el_v3: { title: '有表演的声音', desc: '会叹气、会耳语，情绪跟着台词走。', mods: { 'cap.expressive': 4, 'cap.safety': 6 } },
    el_music: { title: '授权先行', desc: '进新模态先把授权谈好，官司少。', mods: { legal: 0.85, 'cap.safety': 2, subDemand: 1.05 } },
    el_market: { title: '声音市场', desc: '创作者愿意上架声音，素材越攒越多。', mods: { integrationOdds: 1.15, brandGain: 1.06 } },
    el_flash: { title: '低延迟', desc: '几十毫秒就能开口，客服和 Agent 接得住。', mods: { apiDemand: 1.15, infer: 1.08 } },
    el_consumer: { title: '消费级 App', desc: '上手简单，用户多，企业单少。', mods: { subDemand: 1.1, apiDemand: 0.92 } },
  },
  startSpirits: [],

  // 历史名（C3 的 ElevenLabs 行照抄；real 写 C3 的日期，节点 hist 写 timeline 的日期）。
  names: [
    { id: 'hn_eleven_v3', name: 'Eleven v3', role: 'flagship', node: 'el_v3', real: '2025-06-05',
      model: { dimLead: { expressive: 0 }, dims: { safety: 60 } }, world: null, clean: null, events: ['ex_eleven_tags'] },
  ],

  // 专属事件（C4 的 ex_eleven_tags 照抄）。
  exclusives: [
    { id: 'ex_eleven_tags', title: '{model}：配音客户排到了下个月',
      on: 'release', name: 'hn_eleven_v3', node: null, delay: [0, 0], within: 0,
      cond: { released: { count: 1 } },
      supersedes: { milestone: [], event: [] }, scene: null,
      effects: { demand: { sub: 1.2, days: 60 } }, choices: [],
      notice: false, hist: { date: '2025-06-03', text: 'v3 支持内联音频标签和多人对话，有声剧与游戏配音客户涌入。' } },
  ],
};
