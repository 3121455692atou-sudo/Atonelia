// OpenAI · 图像：8–12 个节点的史实树（规格 A5、A9；文件结构见 A2）。P3.T 第 5 批填写。
// 本家 12 个节点接共享主干 core_image；主线是 DALL·E 3 重写描述、接进 ChatGPT、原生生图、吉卜力风潮、GPT Image 两代。
// 名表用 A9 标“可选”的 hn_dalle3、hn_4o_image；专属事件按 A9 的“吉卜力风潮”落一条。
// 文案照规格和调研素材改写；标题和说明里不写年份，年份只出现在 hist.date（数据）。
export default {
  company: 'image2',
  tree: {
    id: 'image2',
    extends: 'core_image',
    omit: [],
    branches: { base: '根基与资金', product: '模型与产品', market: '分发与生意', data: '数据与版权' },
    nodes: [
      // ---- 根基与资金 ----
      { id: 'img_dalle3', title: '先把图片描述重写一遍', desc: '训练前用模型把每张图的描述重写得更细，指令遵循一下子好很多。',
        branch: 'base', pos: [1, 0], days: 35, prereq: [], available: { era: '2023-09' },
        effects: { know: 20, techBoost: { recaption: 0.8 }, data: { post: { caption: 0.8, text: 0.4 } },
          dims: { adherence: 3, text: 3 } },
        spirits: { add: [{ id: 'i2_caption' }] }, grants: { names: ['hn_dalle3'] },
        popup: 'card', hist: { date: '2023-09-20', text: 'DALL·E 3 发布，用重写后的图片描述训练，并接进 ChatGPT。' }, ai: { base: 30, historic: 100 } },

      // ---- 模型与产品 ----
      { id: 'img_chatgpt', title: '放进对话框里画', desc: '不另开一个画图网站，用户聊着天就把图改出来。',
        branch: 'product', pos: [1, 1], days: 35, prereq: [['img_dalle3']], excludes: ['img_standalone'],
        effects: { brand: 1.06, demand: { sub: 1.12, days: 120 } }, spirits: { add: [{ id: 'i2_chatgpt' }] },
        popup: 'none', hist: { date: '2023-11-06', text: '首届开发者大会后，ChatGPT 的周活用户突破一亿，图像生成跟着进了主对话框。' }, ai: { base: 14, historic: 90 } },
      { id: 'img_standalone', title: '单独做一个画图产品', desc: '独立入口、独立订阅，不和聊天产品绑在一起。',
        branch: 'product', pos: [3, 1], days: 35, prereq: [['img_dalle3']], excludes: ['img_chatgpt'], fiction: true,
        effects: { brand: 1.08, demand: { sub: 1.06, days: 90 } }, spirits: { add: [{ id: 'i2_standalone' }] }, popup: 'none', ai: { base: 5 } },
      { id: 'img_native', title: '让语言模型直接画', desc: '不再先写提示再交给扩散模型，模型自己边想边画，图里的字也能写对。',
        branch: 'product', pos: [1, 2], days: 70, prereq: [['img_chatgpt']],
        effects: { techBoost: { ar_image: 0.5 }, data: { post: { text: 1, caption: 0.8 } },
          dims: { text: 3, adherence: 3 } },
        spirits: { add: [{ id: 'i2_native' }] }, grants: { names: ['hn_4o_image'], events: ['ex_image2_ghibli'] },
        popup: 'card', hist: { date: '2025-03-25', text: 'GPT-4o 原生图像生成上线，取代 DALL·E 3，掀起吉卜力风格热潮。' }, ai: { base: 16, historic: 100 } },
      { id: 'img_gpt_image', title: '把改图做得更准', desc: '生成和编辑合成一条线，改一处不动其他地方，出图也更快。',
        branch: 'product', pos: [1, 3], days: 70, prereq: [['img_native']],
        effects: { techBoost: { img_edit: 0.7 }, demand: { sub: 1.08, days: 90 }, dims: { realism: 3, aesthetics: 3 } },
        spirits: { add: [{ id: 'i2_edit' }] }, popup: 'none',
        hist: { date: '2025-12-16', text: 'GPT Image 1.5 向所有用户推出，编辑更精准、生成更快。' }, ai: { base: 12, historic: 95 } },
      { id: 'img_image2', title: '先想一遍再动笔', desc: '先生成再自检，必要时联网找资料，一次出好几张让人挑。',
        branch: 'product', pos: [1, 4], days: 70, prereq: [['img_gpt_image']], available: { techs: ['ar_image'] },
        effects: { brand: 1.08, data: { post: { text: 0.8 } } }, spirits: { add: [{ id: 'i2_thinking' }] },
        popup: 'none', hist: { date: '2026-04-21', text: 'GPT Image 2 引入生成前的思考，文字渲染和多图自检明显提升。' }, ai: { base: 12, historic: 95 } },

      // ---- 分发与生意 ----
      { id: 'img_api', title: '把画图能力做成接口', desc: '设计工具、广告公司和游戏团队都能接进来。',
        branch: 'market', pos: [3, 2], days: 35, prereq: [['img_native']], available: { released: { count: 1 } },
        effects: { demand: { api: 1.1, days: 120 }, cashOfStart: 0.02 }, spirits: { add: [{ id: 'i2_api' }] },
        popup: 'none', hist: { date: '2025-04-23', text: 'gpt-image-1 把 GPT-4o 的图像生成能力开放给 API。' }, ai: { base: 12, historic: 90 } },
      { id: 'img_enterprise', title: '给大客户做定制', desc: '品牌、出版和电商的单子单价高，但要派人对接。',
        branch: 'market', pos: [4, 3], days: 35, prereq: [['img_api']], fiction: true,
        effects: { cashOfStart: 0.04, valuation: 1.06 }, spirits: { add: [{ id: 'i2_enterprise' }] }, popup: 'none', ai: { base: 6 } },

      // ---- 数据与版权 ----
      { id: 'img_ip_shield', title: '给商用客户兜底版权', desc: '企业客户被起诉时公司出面承担，单子更好签，风险自己扛。',
        branch: 'data', pos: [1, 2], days: 35, prereq: [['img_dalle3']], excludes: ['img_scrape'],
        effects: { risk: { copyright: 0.9 }, demand: { api: 1.05, days: 90 } }, spirits: { add: [{ id: 'i2_ip_shield' }] },
        popup: 'none', hist: { date: '2023-11-06', text: '开发者大会上宣布为商用客户提供版权兜底。' }, ai: { base: 10, historic: 85 } },
      { id: 'img_scrape', title: '先抓一大批图再说', desc: '网上能抓的都抓来训练，风格学得快，官司也跟着来。',
        branch: 'data', pos: [3, 2], days: 35, prereq: [['img_dalle3']], excludes: ['img_ip_shield'], fiction: true,
        effects: { data: { post: { aesthetic: 0.6, photo: 0.5 } }, risk: { copyright: 1.3, image: 1.3 } },
        spirits: { add: [{ id: 'i2_scrape' }] }, popup: 'none', ai: { base: 4 } },
      { id: 'img_watermark', title: '每张图都带来源标记', desc: '生成时就写入内容凭证，谁做的、改过没有，一查就知道。',
        branch: 'data', pos: [2, 3], days: 35, prereq: [['img_ip_shield', 'img_scrape']], bypass: { techs: ['c2pa'] },
        effects: { techBoost: { c2pa: 0.7 }, risk: { image: 0.85 } }, spirits: { add: [{ id: 'i2_watermark' }] },
        popup: 'none', ai: { base: 9 } },

      // ---- 架空路线 ----
      { id: 'img_open_weights', title: '把图像权重也开放', desc: '旗舰照卖，上一代图像模型放出权重，让社区接着做风格和工具。',
        branch: 'route', pos: [0, 5], days: 35, prereq: [['img_gpt_image', 'img_image2']], stance: 'open_restricted', license: 'restrictive',
        from: ['closed'], fiction: true, effects: { brand: 1.08, rep: 3 }, spirits: { add: [{ id: 'i2_open_weights' }] }, popup: 'card', ai: { base: 3 } },
    ],
  },

  // 本家特质（A2）。mods 的键都在 E3 的词表里。
  spirits: {
    i2_caption: { title: '重写描述', desc: '训练图的描述写得细，指令遵循更好。', mods: { 'cap.adherence': 6, 'cap.text': 6, 'post.text': 1.06 } },
    i2_chatgpt: { title: '长在对话框里', desc: '用户聊着天就能画，订阅更稳。', mods: { subDemand: 1.12, brandGain: 1.05 } },
    i2_standalone: { title: '独立画图产品', desc: '入口独立，品牌更鲜明，但少了聊天的流量。', mods: { brandGain: 1.08, subDemand: 0.96 } },
    i2_native: { title: '原生生图', desc: '语言模型直接画，文字和指令遵循都更强。', mods: { 'cap.text': 8, 'cap.adherence': 6, 'cap.realism': 4 } },
    i2_edit: { title: '改图顺手', desc: '一句话改一处，别的地方不走样。', mods: { 'cap.realism': 2, 'cap.adherence': 2 } },
    i2_thinking: { title: '先想再画', desc: '生成前先自检，复杂提示更稳。', mods: { 'cap.text': 3, 'cap.adherence': 2 } },
    i2_api: { title: '图像 API', desc: '设计工具和游戏团队接进来，调用量稳定。', mods: { apiDemand: 1.15 } },
    i2_enterprise: { title: '企业定制', desc: '大客户稳定，散户少一些。', mods: { valuation: 1.08, apiDemand: 0.9 } },
    i2_ip_shield: { title: '版权兜底', desc: '商用客户被起诉时公司出面，单子好签，风险自担。', mods: { legal: 1.08, apiDemand: 1.06 } },
    i2_scrape: { title: '来路不明的图', desc: '图多、风格学得快，版权风险高。', mods: { dataQuality: 1.1, legal: 1.2 } },
    i2_watermark: { title: '内容凭证', desc: '每张图都带来源标记，伪造更难。', mods: { 'cap.safety': 3, legal: 0.88 } },
    i2_open_weights: { title: '图像权重开放', desc: '社区接着做风格和工具，口碑更好。', mods: { brandGain: 1.1, integrationOdds: 1.15 } },
  },
  startSpirits: [],

  // 历史名（A9 的“可选”）。真实发布日取自调研素材，模型条件按图像维度和当次发布的角色写。
  names: [
    { id: 'hn_dalle3', name: 'DALL·E 3', role: 'flagship', node: 'img_dalle3', real: '2023-09-20',
      model: { role: 'flagship', open: false, atLeast: { name: 'DALL·E 3', d: 3 } }, world: null, clean: 'base', events: [] },
    { id: 'hn_4o_image', name: 'GPT-4o 图像生成', role: 'flagship', node: 'img_native', real: '2025-03-25',
      model: { role: 'flagship', open: false, atLeast: { name: 'GPT-4o 图像生成', d: 7 } }, world: null, clean: 'base',
      events: ['ex_image2_ghibli'] },
  ],

  // 专属事件（A9 的“吉卜力风潮”）。短剧素材只用 {company}、{model} 两个占位。
  exclusives: [
    { id: 'ex_image2_ghibli', title: '{model}：整条时间线都在画画',
      on: 'release', name: 'hn_4o_image', node: null, delay: [0, 0], within: 0,
      cond: { users: 1e6 },
      supersedes: { milestone: [], event: [] }, scene: 'personal_image2_letters',
      effects: { brand: 1.15, demand: { sub: 1.25, days: 60 } },
      choices: [
        { id: 'lean_in', label: '放开玩，先把流量接住',
          hint: '什么风格都能画，用户高兴，版权方也会盯上。', effects: { brand: 1.1, risk: { image: 1.15 } } },
        { id: 'slow_down', label: '限流，先保住画质',
          hint: '排队慢一点，至少不会把服务器挤垮。', effects: { rep: 2, demand: { sub: 0.92, days: 30 } } },
      ],
      notice: false, hist: { date: '2025-03-25', text: '原生图像上线后，吉卜力风格图片刷屏，一度因算力不够限流。' } },
  ],
};
