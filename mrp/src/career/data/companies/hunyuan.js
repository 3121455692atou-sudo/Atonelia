// 腾讯 · 混元 Hunyuan：完整史实树（规格 A5、A9；文件结构见 A2）。P3.T 第 4 批填写。
// 接共享主干 core_llm，不 omit：T1 这条推理线用得上。
// 主线照 A9：混元 → 元宝 → Hunyuan-Large 开源 → T1 闭源 → Hy3 开源；视频、生图、3D 和 H200 走旁支。
// 本家路线节点三个：hy_large_open（→ 受限许可开源）、hy_t1_closed（→ 旗舰闭源小模型开源）、hy_hy3_open（→ 受限许可开源）。
// 名表只加 A9 点名的 hn_hunyuan_large（389B/52B 的 MoE，A9 写“可选”）。
// 专属事件 C4 没有混元的条目。文案里不写年份，年份只出现在 hist.date（数据）。
export default {
  company: 'hunyuan',
  tree: {
    id: 'hunyuan',
    extends: 'core_llm',
    branches: { base: '根基与渠道', model: '旗舰主线', open: '开源路线', multi: '多模态与 3D', app: '产品与分发', compute: '算力' },
    nodes: [
      // ---- 根基与渠道 ----
      { id: 'hy_base', title: '晚入场：混元先走腾讯云 ToB', desc: '不抢首发，先把模型卖给企业，再慢慢接进自家产品。',
        branch: 'base', pos: [0, 0], days: 35, prereq: [],
        effects: { know: 12, brand: 1.04, demand: { api: 1.1, days: 120 } }, spirits: { add: [{ id: 'hy_late_but_rich' }] },
        popup: 'none', hist: { date: '2023-09-07', text: '腾讯发布自研通用大模型混元，先通过腾讯云向企业开放。' }, ai: { base: 30, historic: 100 } },
      { id: 'hy_internal', title: '接进一百八十多个内部产品', desc: '会议、文档、广告、搜索一起接上，用渠道把调用量堆起来。',
        branch: 'base', pos: [1, 0], days: 35, prereq: [['hy_base']], bypass: { techs: ['func_call'] },
        effects: { demand: { chat: 1.15, api: 1.1, days: 120 } }, spirits: { add: [{ id: 'hy_internal' }] },
        popup: 'none', ai: { base: 16, historic: 0 } },
      { id: 'hy_org', title: '模型与应用分家，请来首席科学家', desc: '应用线和模型线分开管，新设基础设施、数据和训练平台几个部门。',
        branch: 'base', pos: [2, 0], days: 35, prereq: [['hy_yuanbao']],
        effects: { know: 12 }, spirits: { add: [{ id: 'hy_talent' }] }, popup: 'none', ai: { base: 10, historic: 0 } },

      // ---- 产品与分发 ----
      { id: 'hy_yuanbao', title: '元宝 App：自有 C 端入口', desc: '把混元装进一个独立 App，长文精读、联网搜索都做进去。',
        branch: 'app', pos: [0, 1], days: 35, prereq: [['hy_base']],
        effects: { demand: { chat: 1.2, days: 120 } }, spirits: { add: [{ id: 'hy_yuanbao' }] }, popup: 'none', ai: { base: 14, historic: 0 } },
      { id: 'hy_wechat', title: '元宝接入开源对手，借微信生态推广', desc: '把别家的开源推理模型接进元宝，先在下载榜上冲一波。',
        branch: 'app', pos: [1, 1], days: 35, prereq: [['hy_yuanbao']], excludes: ['hy_self_only'],
        effects: { demand: { chat: 1.35, days: 90 }, rep: -1 }, spirits: { add: [{ id: 'hy_borrow' }] },
        popup: 'none', ai: { base: 10, historic: 0 } },
      { id: 'hy_self_only', title: '只用自研，不接外部模型', desc: '不借别家的模型，宁可体验差一点，也要把自研声望立住。',
        branch: 'app', pos: [2, 1], days: 35, prereq: [['hy_yuanbao']], excludes: ['hy_wechat', 'hy_all_open'],
        effects: { rep: 2 }, spirits: { add: [{ id: 'hy_self_only' }] }, popup: 'none', fiction: true, ai: { base: 3, historic: 0 } },

      // ---- 旗舰主线 ----
      { id: 'hy_turbos', title: 'Mamba 混合：快思考模型 TurboS', desc: '一半层换成状态空间模型，输出速度和首字延迟都压一档。',
        branch: 'model', pos: [0, 2], days: 70, prereq: [['hy_base']],
        effects: { techBoost: { linear_attn: 0.4 }, demand: { api: 1.08, days: 90 } },
        spirits: { add: [{ id: 'hy_mamba' }] }, popup: 'none',
        hist: { date: '2025-02-27', text: '混元发布快思考模型 TurboS，采用 Hybrid-Mamba-Transformer MoE。' }, ai: { base: 20, historic: 100 } },
      { id: 'hy_t1_closed', title: 'T1：后训练算力几乎全给强化学习', desc: '在混合架构底座上把强化学习拉满，只走接口，不放权重。',
        branch: 'model', pos: [1, 2], days: 70, prereq: [['hy_turbos']],
        stance: 'open_family', from: ['closed', 'open_restricted', 'delayed', 'open'],
        effects: { techBoost: { reasoning: 0.5 }, data: { post: { math: 0.4, agent: 0.3 } } },
        spirits: { add: [{ id: 'hy_rl_allin' }] }, popup: 'card',
        hist: { date: '2025-03-21', text: '混元发布深度思考模型 T1 正式版，后训练算力绝大部分投入强化学习，权重不开放。' }, ai: { base: 24, historic: 100 } },
      { id: 'hy_hy3_open', title: 'Hy3 预览版：旗舰第一次开源', desc: '新基础设施上练出的第一代旗舰，先用社区许可放权重。',
        branch: 'model', pos: [2, 2], days: 105, prereq: [['hy_t1_closed', 'hy_a13b']],
        stance: 'open_restricted', license: 'restrictive', from: ['closed', 'open_family', 'delayed', 'open'],
        effects: { brand: 1.08, data: { post: { knowledge: 0.4 } } }, spirits: { add: [{ id: 'hy_hy3' }] }, popup: 'card',
        hist: { date: '2026-04-23', text: '腾讯开源 Hy3 预览版，295B 总参数、21B 激活，使用带限制的社区许可。' }, ai: { base: 22, historic: 100 } },
      { id: 'hy_hy3', title: 'Hy3 正式版：许可换成 Apache', desc: '架构和规模不动，把地区排除和月活门槛全部取消。',
        branch: 'model', pos: [3, 2], days: 35, prereq: [['hy_hy3_open']],
        effects: { brand: 1.05 }, spirits: { add: [{ id: 'hy_apache' }] }, popup: 'none',
        hist: { date: '2026-07', text: 'Hy3 正式版改用 Apache 2.0，取消地区排除和月活门槛。' }, ai: { base: 14, historic: 90 } },
      { id: 'hy_hy4', title: 'Hy4-preview：七百七十亿参数冲开源前沿', desc: '总参数和上下文一起翻倍，和编程工具协同设计。',
        branch: 'model', pos: [4, 2], days: 105, prereq: [['hy_hy3']],
        effects: { brand: 1.08, techBoost: { sparse_attn: 0.5 } }, spirits: { add: [{ id: 'hy_hy4' }] }, popup: 'none',
        hist: { date: '2026-08-28', text: '腾讯开源 Hy4-preview，770B 总参数、49B 激活，1M 上下文。' }, ai: { base: 16, historic: 95 } },

      // ---- 开源路线 ----
      { id: 'hy_large_release', title: 'Hunyuan-Large：语言模型第一次开源', desc: '三百多亿总参数、五十多亿激活的 MoE，先备好权重和技术报告。',
        branch: 'open', pos: [0, 3], days: 14, prereq: [['hy_base']],
        effects: { brand: 1.06, data: { post: { knowledge: 0.4 } } }, spirits: { add: [{ id: 'hy_large' }] },
        grants: { names: ['hn_hunyuan_large'] }, popup: 'card',
        hist: { date: '2024-11-05', text: '腾讯准备开源 389B 总参数、52B 激活的 Hunyuan-Large。' }, ai: { base: 30, historic: 100 } },
      { id: 'hy_large_open', title: 'Large 开权重：社区许可带限制', desc: '把权重放出去，但许可排除部分地区，月活过亿要另行申请。',
        branch: 'open', pos: [1, 3], days: 14, prereq: [['hy_large_release']],
        stance: 'open_restricted', license: 'restrictive', from: ['closed', 'open_family', 'delayed'],
        effects: { brand: 1.02 }, popup: 'card',
        hist: { date: '2024-11-05', text: '腾讯开源 Hunyuan-Large，许可带地区排除、月活门槛和禁止改进其他模型条款。' }, ai: { base: 30, historic: 100 } },
      { id: 'hy_a13b', title: 'A13B：小激活的混合推理模型', desc: '总参数八十亿、激活十三亿，快答和慢想可以切。',
        branch: 'open', pos: [2, 3], days: 70, prereq: [['hy_large_release', 'hy_t1_closed']],
        effects: { techBoost: { func_call: 0.3 }, data: { post: { math: 0.3 } } }, spirits: { add: [{ id: 'hy_a13b' }] }, popup: 'none',
        hist: { date: '2025-06-27', text: '腾讯开源 Hunyuan-A13B，80B 总参数、13B 激活，支持快慢思考切换。' }, ai: { base: 18, historic: 95 } },
      { id: 'hy_all_open', title: '全面开源：所有限制都取消', desc: '不只语言模型，连最赚钱的旗舰和多模态也按宽松许可放出去。',
        branch: 'open', pos: [3, 3], days: 70, prereq: [['hy_large_release']], excludes: ['hy_self_only'],
        stance: 'open', license: 'permissive', from: ['closed', 'open_family', 'delayed', 'open_restricted'],
        effects: { brand: 1.1 }, spirits: { add: [{ id: 'hy_all_open' }] }, popup: 'card', fiction: true, ai: { base: 3, historic: 0 } },

      // ---- 多模态与 3D ----
      { id: 'hy_video', title: 'HunyuanVideo：当时最大的开源视频模型', desc: '一百三十亿参数以上，放到消费级显卡也能跑，许可再加地区排除。',
        branch: 'multi', pos: [0, 4], days: 70, prereq: [['hy_large_release']],
        effects: { brand: 1.06, demand: { api: 1.05, days: 60 } }, spirits: { add: [{ id: 'hy_video' }] }, popup: 'none',
        hist: { date: '2024-12-03', text: '腾讯开源 13B 以上的 HunyuanVideo，并公开数据整理、架构和训练扩展报告。' }, ai: { base: 18, historic: 95 } },
      { id: 'hy_image', title: 'HunyuanImage 3.0：开源生图登顶', desc: '原生多模态自回归生图，八十亿总参数、十三亿激活，先在国内刷榜。',
        branch: 'multi', pos: [1, 4], days: 70, prereq: [['hy_a13b', 'hy_video'], ['hy_large_release']],
        effects: { brand: 1.07, demand: { router: 1.08, days: 90 } }, spirits: { add: [{ id: 'hy_image' }] }, popup: 'none',
        hist: { date: '2025-09-28', text: '腾讯开源 HunyuanImage 3.0，80B 总参数、13B 激活的 64 专家 MoE。' }, ai: { base: 16, historic: 95 } },
      { id: 'hy_3d', title: '3D 与世界模型：和游戏业务联动', desc: '把 3D 生成和可仿真世界模型接进游戏和内容管线。',
        branch: 'multi', pos: [2, 4], days: 70, prereq: [['hy_video']],
        effects: { brand: 1.05 }, spirits: { add: [{ id: 'hy_3d' }] }, popup: 'none', ai: { base: 8, historic: 0 } },

      // ---- 算力 ----
      { id: 'hy_h800', title: '囤特供卡：H800 打底', desc: '先把能买到的对华特供卡囤够，互联带宽差一点也先用着。',
        branch: 'compute', pos: [0, 5], days: 35, prereq: [['hy_base']],
        spirits: { add: [{ id: 'hy_h800' }] }, popup: 'none', ai: { base: 8, historic: 0 } },
      { id: 'hy_h200', title: 'H200 配额：训练算力终于松一点', desc: '等了很久的审批下来一批，买卡和租卡的额度都往上抬。',
        branch: 'compute', pos: [1, 5], days: 35, prereq: [['hy_base']],
        spirits: { add: [{ id: 'hy_h200' }] }, popup: 'none',
        hist: { date: '2026-01-28', text: '中国批准腾讯等公司采购 H200，合计超过 40 万颗，附带条件仍在制定。' }, ai: { base: 8, historic: 90 } },
    ],
  },

  // 本家特质（A2）。
  spirits: {
    hy_late_but_rich: { title: '晚到的大厂', desc: '渠道和钱都不缺，首发慢半拍。', mods: { cost: 0.96, brandGain: 0.97 } },
    hy_internal: { title: '内部产品接入', desc: '会议、文档、广告都用自己的模型。', mods: { apiDemand: 1.12, chatDemand: 1.05 } },
    hy_talent: { title: '首席科学家', desc: '基础设施和训练平台有人重搭，研究更顺。', mods: { research: 1.08, 'post.agent': 1.04 } },
    hy_yuanbao: { title: '元宝', desc: '自有 C 端入口，用户涨得快。', mods: { chatDemand: 1.1 } },
    hy_borrow: { title: '借船出海', desc: '先用别家的强模型把用户拉过来。', mods: { chatDemand: 1.15, brandGain: 0.98 } },
    hy_self_only: { title: '只用自研', desc: '不接外部模型，自研声望稳。', mods: { chatDemand: 0.92, brandGain: 1.04 } },
    hy_mamba: { title: 'Mamba 混合', desc: '推理快、成本低，早期也更容易炸。', mods: { infer: 1.15, stability: 1.05 } },
    hy_rl_allin: { title: 'RL 全押', desc: '后训练几乎全给强化学习。', mods: { 'post.math': 1.08, 'post.agent': 1.05 } },
    hy_hy3: { title: 'Hy3 社区许可', desc: '旗舰第一次开源，但带地区和使用限制。', mods: { routerDemand: 1.12, overseasMult: 0.9 } },
    hy_apache: { title: 'Apache 宽松许可', desc: '地区排除和月活门槛全部取消。', mods: { routerDemand: 1.15, overseasMult: 1.05 } },
    hy_hy4: { title: '开源前沿', desc: '参数和上下文都冲到开源头部。', mods: { routerDemand: 1.12, brandGain: 1.03 } },
    hy_large: { title: '社区许可', desc: '语言模型开源，但许可带限制。', mods: { routerDemand: 1.12, overseasMult: 0.92 } },
    hy_a13b: { title: '小激活推理', desc: '部署便宜，快慢思考能切。', mods: { infer: 1.08, routerDemand: 1.06 } },
    hy_all_open: { title: '全面开源', desc: '所有模型都放权重，社区最认。', mods: { routerDemand: 1.2, brandGain: 1.04 } },
    hy_video: { title: '开源视频模型', desc: '视频生成和二次创作的人多。', mods: { routerDemand: 1.08, subDemand: 1.04 } },
    hy_image: { title: '开源生图 MoE', desc: '原生多模态生图，社区拿来接工具。', mods: { routerDemand: 1.1 } },
    hy_3d: { title: '3D 与世界模型', desc: '和游戏、内容管线绑在一起。', mods: { subDemand: 1.06, integrationOdds: 1.1 } },
    hy_h800: { title: '特供卡库存', desc: '互联带宽差一点，但卡是现成的。', mods: { gpuQuota: 1.1, train: 0.98 } },
    hy_h200: { title: 'H200 配额', desc: '买卡和租卡的额度都抬了一档。', mods: { gpuQuota: 1.15, rentQuota: 1.15 } },
  },
  startSpirits: [],

  // 历史名（A9 写“可选：hn_hunyuan_large”）。
  names: [
    { id: 'hn_hunyuan_large', name: 'Hunyuan-Large', role: 'flagship', node: 'hy_large_release', real: '2024-11-05',
      model: { open: true, license: 'restrictive', arch: ['moe'], minTotal: 236, maxActive: 70 },
      world: null, clean: 'base', events: [] },
  ],

  // C4 没有混元的专属事件。
  exclusives: [],
};
