// 阶跃星辰 StepFun：完整史实树（规格 A5、A9；文件结构见 A2）。P3.T 第 4 批填写。
// 接共享主干 core_llm，不 omit：Step 3 这条推理和多模态线用得上。
// 主线照 A9：万亿 Step-2 → 多模态 → Step-Video 开源 → Step 3 Apache；
// 语音、音乐、Flash 系列和车企合作各走一支。
// 本家路线节点 st_step3_open 按 A9 转“完全开源（宽松许可）”。
// C3 没有阶跃的固定行，A9 只写“可选”；这里加一个有把握的 Step 3（321B/38B 的 MoE）。
// 专属事件 C4 没有阶跃的条目。文案里不写年份，年份只出现在 hist.date（数据）。
export default {
  company: 'stepfun',
  tree: {
    id: 'stepfun',
    extends: 'core_llm',
    branches: { base: '根基与融资', model: '模型主线', multi: '多模态与语音', open: '开源路线', auto: '车企合作', market: '应用与终端' },
    nodes: [
      // ---- 根基与融资 ----
      { id: 'st_found', title: '创业团队：先做基座，不接定制', desc: '几个做算法的人凑在一起，先练通用底座，不接行业定制单。',
        branch: 'base', pos: [0, 0], days: 35, prereq: [], effects: { know: 10 },
        spirits: { add: [{ id: 'st_focus' }] }, popup: 'none', ai: { base: 20, historic: 0 } },
      { id: 'st_step1', title: '首次亮相：千亿 Step-1 与多模态 Step-1V', desc: '一次拿出语言、视觉和万亿 MoE 的预告，先把技术招牌挂出去。',
        branch: 'base', pos: [1, 0], days: 35, prereq: [],
        effects: { know: 12, brand: 1.06 }, spirits: { add: [{ id: 'st_step1' }] }, popup: 'none',
        hist: { date: '2024-03-23', text: '阶跃星辰首次公开亮相，发布千亿参数 Step-1、多模态 Step-1V，并预告万亿 MoE。' }, ai: { base: 30, historic: 100 } },
      { id: 'st_step2', title: '万亿参数 Step-2 正式上线', desc: '把万亿级 MoE 真正跑起来，先证明创业公司也训得动大模型。',
        branch: 'base', pos: [2, 0], days: 105, prereq: [['st_step1']],
        effects: { techBoost: { moe: 0.4 }, brand: 1.06 }, spirits: { add: [{ id: 'st_trillion' }] }, popup: 'none',
        hist: { date: '2024-07', text: '万亿参数 Step-2 正式上线，同期推出多模态理解 Step-1.5V 与图像生成 Step-1X。' }, ai: { base: 24, historic: 100 } },

      // ---- 模型主线 ----
      { id: 'st_step3_open', title: 'Step 3：多模态推理，Apache 开源', desc: '用低解码成本的注意力和解耦部署，把多模态推理模型整包放权重。',
        branch: 'model', pos: [0, 1], days: 14, prereq: [['st_step2', 'st_multi']],
        stance: 'open', license: 'permissive', from: ['closed', 'open_family', 'delayed', 'open_restricted'],
        excludes: ['st_all_closed'], effects: { brand: 1.08, techBoost: { reasoning: 0.5 }, data: { post: { math: 0.4 } } },
        grants: { names: ['hn_step3'] }, popup: 'card',
        hist: { date: '2025-07-25', text: '阶跃发布多模态推理模型 Step 3，321B 总参数、38B 激活，随后以 Apache 2.0 开源。' }, ai: { base: 28, historic: 100 } },
      { id: 'st_step35', title: 'Step 3.5 Flash：小激活打智能体和编码', desc: '总参数一百多亿、激活十一亿，主打速度和工具调用。',
        branch: 'model', pos: [1, 1], days: 70, prereq: [['st_step3_open']],
        effects: { techBoost: { agentic_rl: 0.4 }, data: { post: { code: 0.3, agent: 0.3 } } },
        spirits: { add: [{ id: 'st_flash' }] }, popup: 'none',
        hist: { date: '2026-02', text: '阶跃开源 Step 3.5 Flash，196B 总参数、11B 激活，主打高速智能体与编码。' }, ai: { base: 18, historic: 95 } },
      { id: 'st_step37', title: 'Step 3.7 Flash：加上视觉编码器', desc: '在 Flash 底座上补图像输入，工具调用和长任务更稳。',
        branch: 'model', pos: [2, 1], days: 35, prereq: [['st_step35']],
        effects: { techBoost: { computer_use: 0.3 } }, spirits: { add: [{ id: 'st_vision' }] }, popup: 'none',
        hist: { date: '2026-05', text: 'Step 3.7 Flash 加入视觉编码器，支持图像输入并强化工具调用。' }, ai: { base: 14, historic: 90 } },
      { id: 'st_step5', title: 'Step 5 Preview：六千亿参数、百万上下文', desc: '新一代旗舰基座预览，图文输入和超长上下文一起上。',
        branch: 'model', pos: [3, 1], days: 105, prereq: [['st_step37']],
        effects: { brand: 1.08, techBoost: { long_ctx: 0.3 } }, spirits: { add: [{ id: 'st_step5' }] }, popup: 'none',
        hist: { date: '2026-09-20', text: '阶跃发布 Step 5 Preview，600B 总参数、27B 激活、1M 上下文，权重按附加商用条件的许可发布。' }, ai: { base: 18, historic: 95 } },

      // ---- 多模态与语音 ----
      { id: 'st_multi', title: '多模态三件套：理解、生图、视频预告', desc: '视觉理解、图像生成和视频生成一起做，先给企业客户看演示。',
        branch: 'multi', pos: [0, 2], days: 70, prereq: [['st_step1']],
        effects: { brand: 1.05, demand: { api: 1.06, days: 60 } }, spirits: { add: [{ id: 'st_multi' }] }, popup: 'none',
        hist: { date: '2024-07', text: '阶跃同期推出多模态理解模型 Step-1.5V 与图像生成模型 Step-1X。' }, ai: { base: 18, historic: 92 } },
      { id: 'st_video', title: 'Step-Video：开源文生视频', desc: '三百亿参数，最长生成两百多帧，许可用 MIT。',
        branch: 'multi', pos: [1, 2], days: 70, prereq: [['st_step2']],
        effects: { brand: 1.06, demand: { router: 1.08, days: 90 } }, spirits: { add: [{ id: 'st_video' }] }, popup: 'none',
        hist: { date: '2025-02-17', text: '阶跃开源 300 亿参数文生视频模型 Step-Video-T2V。' }, ai: { base: 20, historic: 100 } },
      { id: 'st_audio', title: 'Step-Audio：开源端到端语音', desc: '识别、理解、对话、音色克隆和合成放进一个模型。',
        branch: 'multi', pos: [2, 2], days: 70, prereq: [['st_step2']],
        effects: { brand: 1.05, demand: { api: 1.06, days: 60 } }, spirits: { add: [{ id: 'st_audio' }] }, popup: 'none',
        hist: { date: '2025-02-17', text: '阶跃开源 1300 亿参数语音交互模型 Step-Audio，覆盖识别、对话与音色克隆。' }, ai: { base: 18, historic: 100 } },
      { id: 'st_ace', title: 'ACE-Step：和音乐团队一起开源', desc: '几分钟生成一首完整歌曲，歌词编辑和局部重绘都能做。',
        branch: 'multi', pos: [3, 2], days: 70, prereq: [['st_video']],
        effects: { brand: 1.05, demand: { sub: 1.06, days: 90 } }, spirits: { add: [{ id: 'st_ace' }] }, popup: 'none',
        hist: { date: '2025-05-06', text: '阶跃与 ACE Studio 联合开源音乐基础模型 ACE-Step。' }, ai: { base: 14, historic: 92 } },
      { id: 'st_audio2', title: 'Step-Audio 2：端到端语音换代', desc: '听完直接说，能插话、有语气，同时放出小尺寸版本。',
        branch: 'multi', pos: [4, 2], days: 70, prereq: [['st_audio']],
        effects: { techBoost: { s2s: 0.5 } }, spirits: { add: [{ id: 'st_audio2' }] }, popup: 'none',
        hist: { date: '2025-08-29', text: '阶跃发布端到端语音大模型 Step-Audio 2，并开源小尺寸版本。' }, ai: { base: 14, historic: 92 } },
      { id: 'st_ace15', title: 'ACE-Step 1.5：消费级显卡能跑', desc: '音乐模型压到四吉显存，歌词支持几十种语言。',
        branch: 'multi', pos: [5, 2], days: 35, prereq: [['st_ace']],
        effects: { brand: 1.04 }, spirits: { add: [{ id: 'st_ace15' }] }, popup: 'none',
        hist: { date: '2026-01-28', text: 'ACE-Step 1.5 开源，4GB 显存可本地运行，歌词支持五十多种语言。' }, ai: { base: 10, historic: 90 } },

      // ---- 开源路线 ----
      { id: 'st_open_small', title: '开源小模型，先把开发者圈住', desc: '把能本地跑的小尺寸放出去，代码和 Agent 场景先有人用。',
        branch: 'open', pos: [0, 3], days: 35, prereq: [['st_step2']], excludes: ['st_all_closed'],
        effects: { brand: 1.04 }, spirits: { add: [{ id: 'st_open_small' }] }, popup: 'none', ai: { base: 10, historic: 0 } },
      { id: 'st_all_closed', title: '闭源到底：权重一个不放', desc: '把开源路线收回去，所有模型只走接口和企业定制。',
        branch: 'open', pos: [1, 3], days: 35, prereq: [['st_step2']],
        stance: 'closed', from: ['open', 'open_family', 'delayed', 'open_restricted'],
        excludes: ['st_step3_open', 'st_open_small'], effects: { valuation: 1.12, brand: 0.94 },
        spirits: { add: [{ id: 'st_all_closed' }] }, popup: 'card', fiction: true, ai: { base: 3, historic: 0 } },

      // ---- 车企合作 ----
      { id: 'st_car', title: '车企合作：把模型装进座舱', desc: '不卖通用 App，专给车厂做座舱语音和车控 Agent。',
        branch: 'auto', pos: [0, 4], days: 35, prereq: [['st_multi']],
        effects: { demand: { api: 1.15, days: 120 } }, spirits: { add: [{ id: 'st_car' }] }, popup: 'none', fiction: true, ai: { base: 3, historic: 0 } },

      // ---- 应用与终端 ----
      { id: 'st_agent', title: '终端智能体：手机和车机都能点', desc: '把操作屏幕、调用工具的多步任务做成产品，不只是一个聊天框。',
        branch: 'market', pos: [0, 5], days: 70, prereq: [['st_step35', 'st_step37']],
        effects: { demand: { coding: 1.1, api: 1.08, days: 120 } }, spirits: { add: [{ id: 'st_agent' }] }, popup: 'none', ai: { base: 10, historic: 0 } },
      { id: 'st_enterprise', title: '只做接口和企业定制', desc: '不做大众 App，按项目给银行、运营商和车厂交付。',
        branch: 'market', pos: [1, 5], days: 35, prereq: [['st_step2']], bypass: { techs: ['mcp'] },
        effects: { demand: { api: 1.12, days: 120 } }, spirits: { add: [{ id: 'st_enterprise' }] }, popup: 'none', ai: { base: 8, historic: 0 } },
    ],
  },

  // 本家特质（A2）。
  spirits: {
    st_focus: { title: '只做基座', desc: '不接定制单，研究更专注。', mods: { research: 1.06 } },
    st_step1: { title: '技术招牌', desc: '千亿参数和多模态一起拿出来，招聘和品牌都沾光。', mods: { brandGain: 1.05 } },
    st_trillion: { title: '万亿参数', desc: '大模型训练有经验，炸炉少一点。', mods: { train: 1.03, stability: 0.96 } },
    st_flash: { title: 'Flash 系列', desc: '小激活、高速度，推理和 Agent 都便宜。', mods: { infer: 1.12, 'post.agent': 1.06 } },
    st_vision: { title: '视觉编码器', desc: '图文输入和操作屏幕的任务更稳。', mods: { 'post.agent': 1.05 } },
    st_step5: { title: '百万上下文', desc: '长文档和整仓代码一次读完。', mods: { 'cap.knowledge': 2, infer: 1.05 } },
    st_multi: { title: '多模态三件套', desc: '理解、生图、视频一起做。', mods: { subDemand: 1.06, routerDemand: 1.05 } },
    st_video: { title: '开源视频', desc: '视频生成和二次创作的人多。', mods: { routerDemand: 1.08 } },
    st_audio: { title: '端到端语音', desc: '语音交互和音色克隆都能做。', mods: { apiDemand: 1.06 } },
    st_audio2: { title: '语音换代', desc: '能插话、有语气，端到端延迟低。', mods: { apiDemand: 1.08, infer: 1.04 } },
    st_ace: { title: '开源音乐', desc: '和音乐团队一起做，创作社区愿意试。', mods: { subDemand: 1.08 } },
    st_ace15: { title: '消费级音乐模型', desc: '普通显卡能跑，本地创作者多。', mods: { subDemand: 1.05 } },
    st_open_small: { title: '小模型开源', desc: '本地部署和微调的人多。', mods: { routerDemand: 1.1 } },
    st_all_closed: { title: '闭源到底', desc: '只做接口和企业单，估值好看，开发者少。', mods: { valuation: 1.1, routerDemand: 0.82 } },
    st_car: { title: '车企合作', desc: '座舱语音和车控 Agent 有稳定订单。', mods: { apiDemand: 1.12, integrationOdds: 1.1 } },
    st_agent: { title: '终端智能体', desc: '手机和车机上的多步任务。', mods: { 'post.agent': 1.1, codingDemand: 1.06 } },
    st_enterprise: { title: '企业定制', desc: '银行、运营商和车厂的单子稳。', mods: { apiDemand: 1.12, chatDemand: 0.9 } },
  },
  startSpirits: [],

  // 历史名（C3 没有阶跃的固定行；A9 只写“可选”，这里加一个有把握的 Step 3）。
  names: [
    { id: 'hn_step3', name: 'Step 3', role: 'flagship', node: 'st_step3_open', real: '2025-07-25',
      model: { open: true, license: 'permissive', arch: ['moe'], minTotal: 236, maxActive: 70 },
      world: null, clean: 'base', events: [] },
  ],

  // C4 没有阶跃的专属事件。
  exclusives: [],
};
