// Suno：轻量史实树（规格 A5、A9；文件结构见 A2）。P3.T 第 5 批填写。
// 继承 _generic_music，在本家 7 个节点里写 Bark、网页版、v3、唱片公司诉讼、和解授权、Studio，另加一个“只做大众娱乐”的架空互斥项。
// 名表按 C3 的 hn_suno_v3 照抄；专属事件按 C4 的 ex_suno_riaa 落地。
// 文案大白话；标题和说明里不写年份，年份只出现在 hist.date（数据）。
export default {
  company: 'suno',
  tree: {
    id: 'suno',
    extends: '_generic_music',
    omit: [],
    branches: { base: '根基与资金', product: '模型与产品', legal: '版权与和解' },
    nodes: [
      // ---- 根基与资金 ----
      { id: 'su_bark', title: '先开源一个小模型试水', desc: '把文本转音频的模型放出去，让开发者先玩起来，主力音乐模型仍留在自家。',
        branch: 'base', pos: [1, 0], days: 35, prereq: [],
        effects: { brand: 1.04, rep: 2, techBoost: { codec: 0.5 } }, spirits: { add: [{ id: 'su_bark' }] },
        popup: 'none', hist: { date: '2023-04', text: 'Suno 开源文本生成音频模型 Bark，随后改为宽松许可、允许商用。' }, ai: { base: 28, historic: 95 } },

      // ---- 模型与产品 ----
      { id: 'su_chirp', title: '网页版和插件一起上', desc: '网页上直接写歌，再作为插件接进办公软件，借别人的渠道破圈。',
        branch: 'product', pos: [0, 1], days: 35, prereq: [['su_bark']],
        effects: { data: { post: { vocal: 0.7, catalog: 0.4 } }, demand: { sub: 1.08, days: 90 } },
        spirits: { add: [{ id: 'su_chirp' }] }, popup: 'none',
        hist: { date: '2023-12-20', text: 'Suno 网页版全面开放，并作为插件接入 Microsoft Copilot。' }, ai: { base: 14, historic: 95 } },
      { id: 'su_v3', title: '几分钟出一首能听的歌', desc: '编曲、人声和歌词一起过关，普通人也能做出一首完整的歌。',
        branch: 'product', pos: [1, 2], days: 35, prereq: [['su_chirp']],
        effects: { techBoost: { lyric_align: 0.6 }, data: { post: { catalog: 0.6, vocal: 0.6, lyrics: 0.6 } },
          dims: { lyrics: 3, composition: 3 } },
        spirits: { add: [{ id: 'su_v3' }] }, grants: { names: ['hn_suno_v3'], events: ['ex_suno_riaa'] },
        popup: 'card', hist: { date: '2024-03-21', text: 'Suno v3 向所有用户开放，几秒钟生成约两分钟的完整歌曲。' }, ai: { base: 16, historic: 100 } },
      { id: 'su_studio', title: '做成专业工具', desc: '多轨编辑、分轨变体和导出工程文件，让音乐人真正拿它干活。',
        branch: 'product', pos: [0, 3], days: 70, prereq: [['su_v3'], ['su_chirp', 'su_bark']], excludes: ['su_consumer'],
        effects: { techBoost: { stems: 0.6 }, demand: { sub: 1.08, days: 90 } }, spirits: { add: [{ id: 'su_studio' }] },
        popup: 'none', hist: { date: '2025-09-25', text: 'Suno Studio 发布，支持多轨编辑和 AI 生成分轨变体。' }, ai: { base: 12, historic: 90 } },
      { id: 'su_consumer', title: '只做大众娱乐', desc: '不碰专业工作站，把首页做得更简单，让更多人第一次就能写出歌。',
        branch: 'product', pos: [2, 3], days: 35, prereq: [['su_v3'], ['su_chirp', 'su_bark']], excludes: ['su_studio'], fiction: true,
        effects: { brand: 1.06, demand: { sub: 1.1, days: 90 } }, spirits: { add: [{ id: 'su_consumer' }] }, popup: 'none', ai: { base: 5 } },

      // ---- 版权与和解 ----
      { id: 'su_riaa', title: '先应诉，主张合理使用', desc: '唱片公司告上来，先在法庭上争“训练属于合理使用”，不急着谈钱。',
        branch: 'legal', pos: [1, 4], days: 35, prereq: [['su_v3']],
        effects: { cashOfStart: -0.02 }, spirits: { add: [{ id: 'su_fair_use' }] },
        popup: 'none', hist: { date: '2024-06-24', text: '三大唱片公司由 RIAA 牵头起诉 Suno 和 Udio。' }, ai: { base: 10, historic: 95 } },
      { id: 'su_settle', title: '和唱片公司和解，转授权', desc: '签授权、按播放分成，旧模型退役，新模型只用谈下来的曲库。',
        branch: 'legal', pos: [2, 5], days: 70, prereq: [['su_riaa']], bypass: { techs: ['licensed'] },
        effects: { techBoost: { licensed: 0.6 }, demand: { sub: 0.96, days: 60 } },
        spirits: { add: [{ id: 'su_licensed' }], remove: ['su_fair_use'] }, popup: 'none',
        hist: { date: '2025-10-30', text: '环球与 Udio 和解并签授权，唱片业转向和解加授权；Suno 随后也与华纳和解。' }, ai: { base: 10, historic: 90 } },
    ],
  },

  // 本家特质（A2）。mods 的键都在 E3 的词表里。
  spirits: {
    su_bark: { title: '开源试水', desc: '放出去一个小模型，开发者口碑和招聘都沾光。', mods: { brandGain: 1.06, integrationOdds: 1.1 } },
    su_chirp: { title: '借渠道破圈', desc: '网页加办公插件，用户来得快，平台也分走一部分。', mods: { subDemand: 1.1, brandGain: 1.04, 'cap.composition': 8, 'cap.vocals': 8, 'cap.lyrics': 16 } },
    su_v3: { title: '电台级音质', desc: '编曲、人声和歌词一起过关，普通人也能写完整首歌。', mods: { 'cap.composition': 2, 'cap.vocals': 2, 'cap.lyrics': 4, releaseGapDays: -14 } },
    su_studio: { title: '专业工作站', desc: '音乐人拿它干活，客单价和行业口碑都更高。', mods: { subDemand: 1.08, 'cap.composition': 2 } },
    su_consumer: { title: '大众娱乐', desc: '上手最简单，用户多，但付费意愿弱一些。', mods: { subDemand: 1.1, brandGain: 1.05 } },
    su_fair_use: { title: '合理使用抗辩', desc: '官司照打，曲库继续用，判决前风险一直在。', mods: { legal: 1.15, dataQuality: 1.05 } },
    su_licensed: { title: '授权曲库', desc: '曲库干净，官司少，但要按播放分成。', mods: { legal: 0.75, cost: 1.06, 'cap.safety': 3 } },
  },
  startSpirits: [],

  // 历史名（C3 的 Suno 行照抄）。
  names: [
    { id: 'hn_suno_v3', name: 'Suno v3', role: 'flagship', node: 'su_v3', real: '2024-03-21',
      model: { dims: { composition: 65, vocals: 60, lyrics: 58 } }, world: { ms: { ms_full_song: 'notOther' } },
      clean: null, events: ['ex_suno_riaa'] },
  ],

  // 专属事件（C4 的 ex_suno_riaa 照抄）。短剧素材只用 {company}、{model} 两个占位。
  exclusives: [
    { id: 'ex_suno_riaa', title: '唱片公司把 {company} 告了',
      on: 'month', name: 'hn_suno_v3', node: null, delay: [60, 120], within: 60,
      cond: { risky: 'music_scrape' },
      supersedes: { milestone: [], event: [] }, scene: null,
      effects: { case: { type: 'music', mult: 1.6 } }, choices: [],
      notice: false, hist: { date: '2024-06-24', text: '三大唱片公司起诉 Suno 和 Udio，指其未经授权用录音训练。' } },
  ],
};
