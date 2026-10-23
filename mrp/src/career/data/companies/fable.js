// Anthropic · Fable：史实树（规格 A5、A9；文件结构见 A2）。P3.T-fable 填写。
// 本家 11 个节点接共享主干 core_llm，以架空节点为主；其中 3 个是对 Claude 的 an_ 节点（宪法、负责任扩展政策、安全评测）的复制，
// id 改成 fb_ 前缀，定义和效果保持一致（A5）。A9 的可选历史名 hn_fable5 有把握，一并落地。
// 名表按 A9 的“内容包可选”落地；本家没有 C4 专属事件，exclusives 为空。
export default {
  company: 'fable',
  tree: {
    id: 'fable',
    extends: 'core_llm',
    omit: [],
    branches: { base: '安全根基', safety: '安全与评测', writing: '写作主线', brand: '品牌与社区' },
    nodes: [
      // ---- 和 Claude 共用的三个节点（复制定义，id 改前缀） ----
      { id: 'fb_constitution', title: '宪法 AI', desc: '让模型按一组原则自己批评和修改回答，再用 AI 反馈训练偏好，少靠人工标注。',
        branch: 'base', pos: [0, 0], days: 35, prereq: [],
        effects: { know: 10 }, spirits: { add: [{ id: 'fb_constitution' }] },
        popup: 'none', hist: { date: '2023-03', text: '发表宪法 AI：模型按原则自我批评、修订回答，再用 AI 反馈训练偏好模型。' }, ai: { base: 25, historic: 95 } },
      { id: 'fb_rsp', title: '负责任扩展政策', desc: '按能力分安全等级，越往上要求越严；扩展速度超过安全措施时就先停下来。',
        branch: 'safety', pos: [1, 1], days: 35, prereq: [['fb_constitution']],
        effects: { know: 8 }, spirits: { add: [{ id: 'fb_rsp' }] },
        popup: 'none', hist: { date: '2023-09', text: '发布负责任扩展政策，按安全等级决定训练和部署的门槛。' }, ai: { base: 15, historic: 90 } },
      { id: 'fb_evals', title: '安全分级与红队评测', desc: '每次要上更强的模型，先做红队评测，按能力高低加不同档的防护。',
        branch: 'safety', pos: [1, 2], days: 35, prereq: [['fb_rsp']], bypass: { techSeen: { const_cls: 'paper' } },
        effects: { techRead: ['const_cls'], techBoost: { const_cls: 0.5 }, know: 6 }, spirits: { add: [{ id: 'fb_evals' }] },
        popup: 'none', hist: { date: '2024-10-22', text: '新一代模型首次按安全等级加防护部署，公布红队评测和分级门槛。' }, ai: { base: 12, historic: 90 } },

      // ---- 写作主线 ----
      { id: 'fb_story', title: '写作分支：先把文写好', desc: '把长文改写、角色口吻和对话节奏做到最好，不和别人拼通用榜单。',
        branch: 'writing', pos: [2, 3], days: 35, prereq: [['fb_rsp']], available: { era: '2026-01' },
        effects: { data: { post: { chat: 0.6 } }, demand: { chat: 1.15, days: 90 } }, spirits: { add: [{ id: 'fb_writer' }] },
        popup: 'none', hist: { date: '2026-06-09', text: '面向公众的写作型旗舰发布，和受限的旗舰共用同一底层模型。' }, ai: { base: 8, historic: 100 } },
      { id: 'fb_fable', title: '防护最严的旗舰', desc: '把最强的一代加满防护再公开发布；高风险请求转给更稳的模型处理。',
        branch: 'writing', pos: [3, 4], days: 35, prereq: [['fb_story']], available: { era: '2026-01' }, grants: { names: ['hn_fable5'] },
        effects: { techRead: ['const_cls'], techBoost: { const_cls: 0.4 }, brand: 1.1 }, spirits: { add: [{ id: 'fb_fable' }] },
        popup: 'card', hist: { date: '2026-06-09', text: '面向公众的旗舰与受限版本同日发布，同一底层模型、不同防护强度。' }, ai: { base: 8, historic: 100 } },
      { id: 'fb_boundaries', title: '公开安全边界', desc: '把网络安全防护和越狱严重性怎么分级写成公开文档，请外面一起挑毛病。',
        branch: 'safety', pos: [4, 3], days: 35, prereq: [['fb_fable']], available: { era: '2026-01' },
        effects: { rep: 3, know: 5 }, spirits: { add: [{ id: 'fb_boundaries' }] },
        popup: 'none', hist: { date: '2026-07', text: '公布网络安全防护与越狱严重性分级框架草案。' }, ai: { base: 8, historic: 95 } },
      { id: 'fb_kids', title: '全年龄写作平台', desc: '按年龄分档的内容尺度，家长能管，学校和图书馆也敢用。',
        branch: 'writing', pos: [0, 3], days: 35, prereq: [['fb_rsp']],
        effects: { demand: { chat: 1.15, sub: 1.1, days: 120 } }, spirits: { add: [{ id: 'fb_kids' }] },
        popup: 'none', fiction: true, ai: { base: 4, historic: 0 } },

      // ---- 品牌与社区 ----
      { id: 'fb_indie', title: '独立品牌', desc: '不挂母公司的主品牌，单独做一个写作向的牌子，用户认人不认集团。',
        branch: 'brand', pos: [2, 4], days: 35, prereq: [['fb_rsp', 'fb_evals']], excludes: ['fb_ip'],
        effects: { brand: 1.15, valuation: 1.05 }, spirits: { add: [{ id: 'fb_indie' }] },
        popup: 'none', fiction: true, ai: { base: 4, historic: 0 } },
      { id: 'fb_ip', title: '小说与剧本授权', desc: '和出版方、编剧工作室签正版授权，用他们的稿子训练，再分成。',
        branch: 'brand', pos: [3, 5], days: 35, prereq: [['fb_story']], excludes: ['fb_indie'],
        effects: { data: { post: { chat: 0.5 } }, risk: { copyright: 0.8 } }, spirits: { add: [{ id: 'fb_ip' }] },
        popup: 'none', fiction: true, ai: { base: 3, historic: 0 } },
      { id: 'fb_community', title: '创作者社区', desc: '把写手、画手和角色扮演玩家聚在一起，作品和提示词互相流通。',
        branch: 'brand', pos: [4, 5], days: 35, prereq: [['fb_story']],
        effects: { brand: 1.1, rep: 2 }, spirits: { add: [{ id: 'fb_community' }] },
        popup: 'none', fiction: true, ai: { base: 3, historic: 0 } },
      { id: 'fb_open', title: '开放写作模型权重', desc: '把写作向的小模型放出权重，让社区自己微调，主线旗舰仍然闭源。',
        branch: 'brand', pos: [5, 4], days: 35, prereq: [['fb_story']],
        effects: { brand: 1.1, demand: { router: 1.15, days: 90 } }, spirits: { add: [{ id: 'fb_open' }] },
        popup: 'none', fiction: true, ai: { base: 3, historic: 0 } },
    ],
  },

  // 本家特质（A2）。三个共用节点给的特质和 Claude 那边同义，id 改前缀。
  spirits: {
    fb_voice: { title: '写作口碑', desc: '文风和长文改写是招牌，写东西的人愿意先试。', mods: { 'post.writing': 1.1, 'cap.writing': 2, chatDemand: 1.05 } },
    fb_constitution: { title: '宪法 AI', desc: '对齐训练省人工，安全底子好。', mods: { 'post.safety': 1.15, 'cap.safety': 2 } },
    fb_rsp: { title: '负责任扩展', desc: '发布前多一道安全门槛，官司少一些。', mods: { legal: 0.85, 'cap.safety': 2 } },
    fb_evals: { title: '安全分级', desc: '红队评测和分级防护成了惯例，出事少一些。', mods: { legal: 0.85, 'cap.safety': 3 } },
    fb_writer: { title: '写作主线', desc: '长文和角色口吻练得更细。', mods: { 'post.writing': 1.25, 'cap.writing': 3 } },
    fb_fable: { title: '防护最严的旗舰', desc: '最强的一代也敢公开发，品牌更硬。', mods: { brandGain: 1.15, 'cap.safety': 4 } },
    fb_boundaries: { title: '公开安全边界', desc: '安全做法写成公开文档，监管和客户都更信。', mods: { legal: 0.8, brandGain: 1.05 } },
    fb_kids: { title: '全年龄平台', desc: '家长和学校敢用，订阅更稳。', mods: { chatDemand: 1.15, subDemand: 1.1 } },
    fb_indie: { title: '独立品牌', desc: '用户认这个牌子，不认集团。', mods: { brandGain: 1.2, valuation: 1.05 } },
    fb_ip: { title: '正版授权', desc: '出版方和编剧工作室愿意合作。', mods: { dataQuality: 1.05, chatDemand: 1.05 } },
    fb_community: { title: '创作者社区', desc: '作品和提示词在社区里互相流通。', mods: { brandGain: 1.1, integrationOdds: 1.2 } },
    fb_open: { title: '开放写作权重', desc: '社区能自己微调，开发者愿意接。', mods: { brandGain: 1.15, routerDemand: 1.15 } },
  },
  startSpirits: ['fb_voice'],

  // 历史名（A9 的内容包可选：hn_fable5）。条件只看这一版写得够不够好，不抢别人。
  names: [
    { id: 'hn_fable5', name: 'Claude Fable 5', role: 'flagship', node: 'fb_fable', real: '2026-06-09',
      model: { role: 'flagship', open: false, minTotal: 400, dims: { writing: 80 } }, world: null, clean: 'base', events: [] },
  ],

  // C4 没有 Fable 的专属事件。
  exclusives: [],
};
