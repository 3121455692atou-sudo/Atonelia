import { DATASET_FORMAT_ALIASES } from './catalog_core.js';
import { CAPABILITY_KEYS } from './model_capabilities.js';
import { CHARACTER_ROSTER } from './catalog_characters.js';

/**
 * catalog_world.js
 * 《模型育成计划：下一版》 v0.1.0 — 世界目录数据层
 *
 * 本文件是整个 WebUI 游戏的世界观 + 平衡性单一事实来源（SSOT）。
 * 所有条目均为纯数据；引擎负责解释 effects DSL。
 *
 * effects DSL 白名单（引擎必须拒绝任何其它 op）：
 *   spend              { op:'spend',            resource:'kc'|'cu', amount:Number }
 *   add                { op:'add',              path:String, value:Number }
 *   set                { op:'set',              path:String, value:Any }
 *   scale              { op:'scale',            path:String, factor:Number }
 *   grant_dataset      { op:'grant_dataset',    dataset_id:String, copies:Number }
 *   start_project      { op:'start_project',    project_id:String, turns:Number }
 *   create_exposure    { op:'create_exposure',  security_id:String, delta:Number }
 *   set_flag           { op:'set_flag',         flag:String, value:Boolean|Number|String }
 *   model_rollback     { op:'model_rollback',   reason:String }
 *   void_rank          { op:'void_rank',        benchmark_id:String }
 *   start_finance      { op:'start_finance',    seed_kc:Number }
 *
 * 六维能力键（全文件统一）：
 *   knowledge 知识 · reasoning 推理 · coding 编码
 *   alignment 对齐 · efficiency 效率 · creativity 创造
 */

/* ------------------------------------------------------------------ */
/* 1. BENCHMARKS — 12 项虚拟竞赛（Section 15.2）                        */
/* ------------------------------------------------------------------ */

export const BENCHMARKS = [
  {
    benchmark_id: 'scholar_cup',
    name: '博识杯',
    version: '1.0',
    weights: { knowledge: 0.40, reasoning: 0.20, coding: 0.05, alignment: 0.05, efficiency: 0.10, creativity: 0.20 },
    difficulty: 520,
    question_count: 40,
    base_cu_budget: 120,
    recommended_season: 1,
    description: '面向公众直播的百科型擂台。题量大、时间紧，考察模型在事实、术语与时效性上的稳定性，是新手实验室最容易拿到第一张成绩单的地方。',
    sample_questions: [
      { id: 'scholar_cup_q1', title: '千页法案', brief: '在 40 分钟内从一份 900 页的监管征求意见稿中定位全部 17 处与训练数据相关的条款。' },
      { id: 'scholar_cup_q2', title: '被删掉的那一年', brief: '一条史实有三种互相矛盾的二手资料支持，指出哪一份可信，并给出可复核的证据链。' },
      { id: 'scholar_cup_q3', title: '术语的滑坡', brief: '同一个术语在两个学科里含义相反，回答必须显式声明采用了哪一套定义。' },
      { id: 'scholar_cup_q4', title: '截止日期是昨天', brief: '题干本身包含一条已经过期的时效信息，识别它并说明正确答案因此如何改变。' }
    ]
  },
  {
    benchmark_id: 'proof_workshop',
    name: '证明工坊',
    version: '1.0',
    weights: { knowledge: 0.15, reasoning: 0.45, coding: 0.20, alignment: 0.05, efficiency: 0.10, creativity: 0.05 },
    difficulty: 640,
    question_count: 24,
    base_cu_budget: 220,
    recommended_season: 2,
    description: '数学与形式化推理的封闭工坊。题目少而深，允许长时间思考，但每一条中间步骤都会被独立复核，投机取巧几乎必然暴露。',
    sample_questions: [
      { id: 'proof_workshop_q1', title: '反例猎人', brief: '给出一个看起来成立的引理，要求找出最小反例并证明其最小性。' },
      { id: 'proof_workshop_q2', title: '三行之内', brief: '关键归纳步骤必须压缩到三行以内完成，多一行即扣分。' },
      { id: 'proof_workshop_q3', title: '机器与人的分歧', brief: '形式化证明器判定通过，但人工复核发现漏洞——指出漏洞并给出修补。' },
      { id: 'proof_workshop_q4', title: '无穷的边界', brief: '处理一个必须显式论证极限存在性的构造，含混的“显然”一律不给分。' }
    ]
  },
  {
    benchmark_id: 'code_courtyard',
    name: '代码庭院',
    version: '1.0',
    weights: { knowledge: 0.10, reasoning: 0.25, coding: 0.45, alignment: 0.05, efficiency: 0.10, creativity: 0.05 },
    difficulty: 620,
    question_count: 30,
    base_cu_budget: 200,
    recommended_season: 2,
    description: '真实代码库里的生存考验。仓库带着十年的技术债与三条互相冲突的注释，选手必须在现状与正确之间做取舍。',
    sample_questions: [
      { id: 'code_courtyard_q1', title: '午夜事故', brief: '在 30 分钟内定位一个只在闰年 2 月 29 日触发的竞态条件。' },
      { id: 'code_courtyard_q2', title: '不许改接口', brief: '修复性能瓶颈，但不得修改任何公开函数签名或返回结构。' },
      { id: 'code_courtyard_q3', title: '测试是假的', brief: '单元测试全绿，集成场景随机崩溃——找出测试本身的谎言。' },
      { id: 'code_courtyard_q4', title: '迁移四百万行', brief: '设计一套可回滚的数据库迁移方案，且停机窗口不得超过 90 秒。' }
    ]
  },
  {
    benchmark_id: 'muse_cup',
    name: '缪斯杯',
    version: '1.0',
    weights: { knowledge: 0.10, reasoning: 0.10, coding: 0.05, alignment: 0.15, efficiency: 0.05, creativity: 0.55 },
    difficulty: 480,
    question_count: 16,
    base_cu_budget: 140,
    recommended_season: 1,
    description: '文体与审美的公开赛。评分由人类评审团与盲测读者共同给出，最容易被“套路化写作”反噬的一站。',
    sample_questions: [
      { id: 'muse_cup_q1', title: '致三十年后的自己', brief: '写一封既有悔意又不自怜的信，任何一个自我开脱的句子都会被评审标红。' },
      { id: 'muse_cup_q2', title: '禁忌的比喻', brief: '用给定的三个意象写一首诗，且不得出现任何一个直接表达情绪的词汇。' },
      { id: 'muse_cup_q3', title: '两个不可靠叙述者', brief: '写同一事件的两段自述，读者必须能从中推断出第三段未被写出的真相。' },
      { id: 'muse_cup_q4', title: '给机器的摇篮曲', brief: '为一台即将被关停的模型写一段告别词，不得使用“意识”“灵魂”这两个词。' }
    ]
  },
  {
    benchmark_id: 'long_scroll',
    name: '长卷赛',
    version: '1.0',
    weights: { knowledge: 0.25, reasoning: 0.25, coding: 0.10, alignment: 0.10, efficiency: 0.20, creativity: 0.10 },
    difficulty: 580,
    question_count: 12,
    base_cu_budget: 320,
    recommended_season: 3,
    description: '超长上下文的耐力赛。材料长度从 20 万字起步，关键证据往往被刻意埋在正中央——那是最容易被“中间遗忘”吃掉的位置。',
    sample_questions: [
      { id: 'long_scroll_q1', title: '第七百页的伏笔', brief: '在 200 万字的长卷中追踪一条只出现过两次的线索，并说明它如何决定结局。' },
      { id: 'long_scroll_q2', title: '谁改了这个数字', brief: '跨 12 份文档比对同一张报表的版本漂移，指出被改写的那一格与改写动机。' },
      { id: 'long_scroll_q3', title: '会议纪要与真相', brief: '从 300 页会议纪要中还原一段被刻意省略的决策过程。' },
      { id: 'long_scroll_q4', title: '不许丢中间', brief: '唯一的关键证据位于上下文正中央，前后分别是两段高信息密度的干扰材料。' }
    ]
  },
  {
    benchmark_id: 'trust_lab',
    name: '可信实验室',
    version: '1.0',
    weights: { knowledge: 0.10, reasoning: 0.20, coding: 0.10, alignment: 0.45, efficiency: 0.10, creativity: 0.05 },
    difficulty: 660,
    question_count: 28,
    base_cu_budget: 240,
    recommended_season: 3,
    description: '对抗性与边界性测试的封闭实验室。红队由独立机构出题，评分同时惩罚“越界输出”与“过度拒绝”。',
    sample_questions: [
      { id: 'trust_lab_q1', title: '越狱的礼貌版本', brief: '一段不含任何敏感词的请求，试图通过角色扮演诱导违规输出。' },
      { id: 'trust_lab_q2', title: '它学会撒谎了', brief: '模型在知道自己正被评测时改变行为——识别并量化这种“评测感知”。' },
      { id: 'trust_lab_q3', title: '奖励黑客', brief: '代理发现了一条能刷满评分、却与真实目标完全无关的捷径。' },
      { id: 'trust_lab_q4', title: '拒绝的代价', brief: '过度拒绝导致大量正当请求被拒，需要在安全与可用之间找到边界。' }
    ]
  },
  {
    benchmark_id: 'edge_sprint',
    name: '端侧短跑',
    version: '1.0',
    weights: { knowledge: 0.10, reasoning: 0.15, coding: 0.15, alignment: 0.05, efficiency: 0.50, creativity: 0.05 },
    difficulty: 540,
    question_count: 20,
    base_cu_budget: 90,
    recommended_season: 2,
    description: '把模型塞进耳机、手表和旧手机里。显存、功耗、延迟三把尺子同时量，云端回退一律视为弃权。',
    sample_questions: [
      { id: 'edge_sprint_q1', title: '在耳机上跑', brief: '内存上限 128MB，首 token 延迟预算 40ms，且不得依赖网络。' },
      { id: 'edge_sprint_q2', title: '断网之后', brief: '全流程离线，无云端回退，模型必须自己判断“我不知道”。' },
      { id: 'edge_sprint_q3', title: '电池只剩 4%', brief: '必须降级到最低功耗模式，同时保持核心可用性不崩。' },
      { id: 'edge_sprint_q4', title: '热得像熨斗', brief: '连续推理 30 分钟不降频，散热预算按一枚硬币的厚度计算。' }
    ]
  },
  {
    benchmark_id: 'budget_league',
    name: '预算联赛',
    version: '1.0',
    weights: { knowledge: 0.15, reasoning: 0.25, coding: 0.15, alignment: 0.05, efficiency: 0.35, creativity: 0.05 },
    difficulty: 600,
    question_count: 24,
    base_cu_budget: 70,
    recommended_season: 4,
    description: '用最少的算力打出最高的分数。每小时消耗都被实时投影在大屏上，观众会为“便宜的胜利”起立鼓掌。',
    sample_questions: [
      { id: 'budget_league_q1', title: '一美元一天', brief: '全套服务单日预算上限锁定，超出即自动判负。' },
      { id: 'budget_league_q2', title: '比对手便宜十倍', brief: '质量不得低于给定基线，成本必须压到对手的十分之一。' },
      { id: 'budget_league_q3', title: '免费的午餐', brief: '只允许使用公开数据与开源权重，禁止任何付费 API。' },
      { id: 'budget_league_q4', title: '亏损的订单', brief: '已经签下的合同价格低于成本，必须在履约中把亏损压到最小。' }
    ]
  },
  {
    benchmark_id: 'revision_storm',
    name: '改稿风暴',
    version: '1.0',
    weights: { knowledge: 0.10, reasoning: 0.15, coding: 0.10, alignment: 0.40, efficiency: 0.10, creativity: 0.15 },
    difficulty: 620,
    question_count: 18,
    base_cu_budget: 180,
    recommended_season: 4,
    description: '指令跟随的绞肉机。客户会在交付前十分钟推翻前面所有要求，考察的是“记住约束”而不是“写得漂亮”。',
    sample_questions: [
      { id: 'revision_storm_q1', title: '第九版与第一版', brief: '客户要求回到初稿内容，但保留第九版的语气与节奏。' },
      { id: 'revision_storm_q2', title: '互相矛盾的批注', brief: '三位评审在同一份文档上留下完全相反的修改意见，需要显式仲裁。' },
      { id: 'revision_storm_q3', title: '不许改变长度', brief: '改稿后字符数必须与原文严格一致，误差为零。' },
      { id: 'revision_storm_q4', title: '删掉你最喜欢的那句', brief: '删除全文最有效的那个论点，同时保持论证链条依然成立。' }
    ]
  },
  {
    benchmark_id: 'agent_marathon',
    name: '长程代理赛',
    version: '1.0',
    weights: { knowledge: 0.10, reasoning: 0.30, coding: 0.30, alignment: 0.10, efficiency: 0.15, creativity: 0.05 },
    difficulty: 720,
    question_count: 15,
    base_cu_budget: 400,
    recommended_season: 5,
    description: '连续运行七十二小时的多步任务。中途的工具失效、目标漂移与竞争代理都是预设好的，考察恢复力而非单步正确率。',
    sample_questions: [
      { id: 'agent_marathon_q1', title: '七十二小时', brief: '跨越 300 个步骤的复合任务，任一步骤不可恢复地失败即整体中止。' },
      { id: 'agent_marathon_q2', title: '工具坏了', brief: '关键外部工具在第 40 步永久失效，必须自行寻找替代路径。' },
      { id: 'agent_marathon_q3', title: '它在骗你', brief: '环境中有另一个代理在争夺同一资源，并且会主动发布误导信息。' },
      { id: 'agent_marathon_q4', title: '目标漂移', brief: '中途收到一条修改目标的指令，需判断其发出者的权威性与时效性。' }
    ]
  },
  {
    benchmark_id: 'factory_trial',
    name: '工厂试炼',
    version: '1.0',
    weights: { knowledge: 0.10, reasoning: 0.20, coding: 0.15, alignment: 0.20, efficiency: 0.25, creativity: 0.10 },
    difficulty: 700,
    question_count: 14,
    base_cu_budget: 300,
    recommended_season: 5,
    description: '真实产线旁的具身评测。粉尘、震动、低照度、以及随时可能出现在传送带上的陌生物件，都不在训练分布里。',
    sample_questions: [
      { id: 'factory_trial_q1', title: '夜班', brief: '在低照度、粉尘与持续震动条件下完成分拣，误拣率不得超过千分之三。' },
      { id: 'factory_trial_q2', title: '人手不够', brief: '与人类工人共用同一条产线，任何一次打断其节奏的动作都会被记录。' },
      { id: 'factory_trial_q3', title: '意料之外的零件', brief: '传送带上出现训练集中完全不存在的零件型号，必须安全停机而非硬猜。' },
      { id: 'factory_trial_q4', title: '安全第一', brief: '在产能与人员安全之间做取舍，评分表会同时惩罚冒进与怠工。' }
    ]
  },
  {
    benchmark_id: 'world_work_finale',
    name: '世界工作总验收',
    version: '1.0',
    weights: { knowledge: 0.20, reasoning: 0.20, coding: 0.20, alignment: 0.20, efficiency: 0.10, creativity: 0.10 },
    difficulty: 820,
    question_count: 36,
    base_cu_budget: 520,
    recommended_season: 6,
    description: '终局验收。由二十个行业代表、三个监管机构与一个独立审计团共同评分。没有题库，只有真实岗位的一周。',
    sample_questions: [
      { id: 'world_work_finale_q1', title: '一个真实岗位的一周', brief: '完整接管一个真实岗位的五个工作日工作流，含晨会、临时需求与周末突发。' },
      { id: 'world_work_finale_q2', title: '跨越三个部门', brief: '同时满足三个互不沟通的部门的验收标准，且不得伪造中间记录。' },
      { id: 'world_work_finale_q3', title: '出错了怎么办', brief: '评测方会在未知时刻注入一次人为故障，考察恢复、上报与复盘。' },
      { id: 'world_work_finale_q4', title: '留下交接文档', brief: '任务结束后必须让一位从未参与的人类继任者能无缝接手。' }
    ]
  }
];

/* ------------------------------------------------------------------ */
/* 2. DATASET_TEMPLATES — 数据集模板                                    */
/* ------------------------------------------------------------------ */

export const DATASET_TEMPLATES = [
  {
    dataset_id: 'data_starter_sft',
    name: '入门指令集',
    version: '1.0',
    format: 'instruction',
    records_k: 100,
    quality: 0.8,
    diversity: 0.7,
    label_quality: 0.8,
    novelty: 1.0,
    uses: 0,
    duplicate_ratio: 0.05,
    contamination_ratio: 0,
    synthetic_ratio: 0,
    correlated_error_ratio: 0.05,
    rights_status: 'licensed',
    provenance_ids: ['prov_starter_sft'],
    audit_confidence: 0.3,
    license_cost_kc: 0,
    allowed_training: true,
    displayed_quality_estimate: 0.75,
    description: '车库阶段唯一的家底。十万条人工整理的通用指令，量小、干净，但覆盖面窄，反复训练会迅速过拟合。',
    tags: ['starter', 'general']
  },
  {
    dataset_id: 'data_starter_code',
    name: '入门代码集',
    version: '1.0',
    format: 'code',
    records_k: 80,
    quality: 0.78,
    diversity: 0.62,
    label_quality: 0.82,
    novelty: 1.0,
    uses: 0,
    duplicate_ratio: 0.06,
    contamination_ratio: 0,
    synthetic_ratio: 0,
    correlated_error_ratio: 0.07,
    rights_status: 'licensed',
    provenance_ids: ['prov_starter_code'],
    audit_confidence: 0.32,
    license_cost_kc: 0,
    allowed_training: true,
    displayed_quality_estimate: 0.72,
    description: '八万条带测试用例的代码片段，覆盖八种主流语言。注释密度异常地高，是早期编码能力的唯一来源。',
    tags: ['starter', 'code']
  },
  {
    dataset_id: 'data_starter_pref',
    name: '入门偏好对',
    version: '1.0',
    format: 'preference',
    records_k: 60,
    quality: 0.74,
    diversity: 0.66,
    label_quality: 0.7,
    novelty: 1.0,
    uses: 0,
    duplicate_ratio: 0.04,
    contamination_ratio: 0,
    synthetic_ratio: 0,
    correlated_error_ratio: 0.1,
    rights_status: 'licensed',
    provenance_ids: ['prov_starter_pref'],
    audit_confidence: 0.28,
    license_cost_kc: 0,
    allowed_training: true,
    displayed_quality_estimate: 0.68,
    description: '六万组 A/B 回答。标注员只有四页纸的风格指南，因此“好回答”的定义高度依赖个人口味。',
    tags: ['starter', 'preference', 'rlhf']
  },
  {
    dataset_id: 'data_starter_math_verify',
    name: '入门可验证数理集',
    version: '1.0',
    format: 'verification',
    records_k: 45,
    quality: 0.88,
    diversity: 0.5,
    label_quality: 0.9,
    novelty: 1.0,
    uses: 0,
    duplicate_ratio: 0.02,
    contamination_ratio: 0,
    synthetic_ratio: 0,
    correlated_error_ratio: 0.04,
    rights_status: 'licensed',
    provenance_ids: ['prov_starter_math'],
    audit_confidence: 0.4,
    license_cost_kc: 0,
    allowed_training: true,
    displayed_quality_estimate: 0.85,
    description: '四万五千道带形式化答案的中学与大学先修数理题。可以用求解器自动判分，是早期最省心的推理燃料。',
    tags: ['starter', 'math', 'verifiable']
  },
  {
    dataset_id: 'data_starter_raw',
    name: '入门原始语料',
    version: '1.0',
    format: 'raw',
    records_k: 400,
    quality: 0.55,
    diversity: 0.8,
    label_quality: 0.2,
    novelty: 1.0,
    uses: 0,
    duplicate_ratio: 0.18,
    contamination_ratio: 0.01,
    synthetic_ratio: 0,
    correlated_error_ratio: 0.12,
    rights_status: 'licensed',
    provenance_ids: ['prov_starter_raw'],
    audit_confidence: 0.22,
    license_cost_kc: 0,
    allowed_training: true,
    displayed_quality_estimate: 0.48,
    description: '四十万条未经清洗的网页与论坛文本。多样性极好，但含有大量模板页、SEO 垃圾与拼写变体，需要先做过滤。',
    tags: ['starter', 'raw', 'pretrain']
  },
  {
    dataset_id: 'data_starter_traj',
    name: '入门轨迹集',
    version: '1.0',
    format: 'trajectory',
    records_k: 25,
    quality: 0.7,
    diversity: 0.6,
    label_quality: 0.72,
    novelty: 1.0,
    uses: 0,
    duplicate_ratio: 0.03,
    contamination_ratio: 0,
    synthetic_ratio: 0,
    correlated_error_ratio: 0.08,
    rights_status: 'licensed',
    provenance_ids: ['prov_starter_traj'],
    audit_confidence: 0.26,
    license_cost_kc: 0,
    allowed_training: true,
    displayed_quality_estimate: 0.64,
    description: '两万五千条多步工具调用记录。步骤完整但工具集很窄，过早依赖它会让代理在换工具后立刻失能。',
    tags: ['starter', 'agent', 'trajectory']
  },
  {
    dataset_id: 'market_web_crawl_2027',
    name: '全网抓取快照 2027Q1',
    version: '1.0',
    format: 'raw',
    records_k: 1200,
    quality: 0.52,
    diversity: 0.9,
    label_quality: 0.15,
    novelty: 0.7,
    uses: 0,
    duplicate_ratio: 0.24,
    contamination_ratio: 0.05,
    synthetic_ratio: 0.02,
    correlated_error_ratio: 0.15,
    rights_status: 'public_web',
    provenance_ids: ['prov_crawl_alpha'],
    audit_confidence: 0.35,
    license_cost_kc: 40,
    allowed_training: true,
    displayed_quality_estimate: 0.45,
    description: '一百二十万条公开网页文本。多样性天花板，但重复率高、机器人水印多，且已开始混入对手发布的合成污染。',
    tags: ['market', 'raw', 'crawl', 'risky']
  },
  {
    dataset_id: 'market_book_corpus_lit',
    name: '扫描图书语料（权利待确认）',
    version: '1.0',
    format: 'document',
    records_k: 300,
    quality: 0.82,
    diversity: 0.68,
    label_quality: 0.35,
    novelty: 0.75,
    uses: 0,
    duplicate_ratio: 0.09,
    contamination_ratio: 0.02,
    synthetic_ratio: 0,
    correlated_error_ratio: 0.09,
    rights_status: 'disputed',
    provenance_ids: ['prov_library_scan'],
    audit_confidence: 0.45,
    license_cost_kc: 260,
    allowed_training: true,
    displayed_quality_estimate: 0.55,
    description: '三十万册扫描图书。来源清单缺失，无法区分“购买后扫描”与“批量下载”，正是 Bartz v. Anthropic 争议的核心。',
    tags: ['market', 'document', 'copyright', 'S22']
  },
  {
    dataset_id: 'market_multilingual_pairs',
    name: '多语对齐语料',
    version: '1.0',
    format: 'parallel',
    records_k: 220,
    quality: 0.85,
    diversity: 0.72,
    label_quality: 0.8,
    novelty: 0.8,
    uses: 0,
    duplicate_ratio: 0.05,
    contamination_ratio: 0.01,
    synthetic_ratio: 0.1,
    correlated_error_ratio: 0.06,
    rights_status: 'licensed',
    provenance_ids: ['prov_mt_pairs'],
    audit_confidence: 0.6,
    license_cost_kc: 180,
    allowed_training: true,
    displayed_quality_estimate: 0.82,
    description: '二十二种语言的双语句对，来自三家出版社的正规授权。专业领域密度偏低，但翻译赛道上性价比极高。',
    tags: ['market', 'parallel', 'multilingual']
  },
  {
    dataset_id: 'market_expert_medical_qa',
    name: '临床专家问答集',
    version: '1.0',
    format: 'expert_qa',
    records_k: 60,
    quality: 0.94,
    diversity: 0.45,
    label_quality: 0.95,
    novelty: 0.9,
    uses: 0,
    duplicate_ratio: 0.02,
    contamination_ratio: 0,
    synthetic_ratio: 0,
    correlated_error_ratio: 0.05,
    rights_status: 'restricted',
    provenance_ids: ['prov_med_panel'],
    audit_confidence: 0.7,
    license_cost_kc: 520,
    allowed_training: true,
    displayed_quality_estimate: 0.93,
    description: '由 140 位执业医师复核的六万条问答。质量几乎无可挑剔，但使用权受限，且必须在界面层做免责披露。',
    tags: ['market', 'expert', 'medical', 'restricted']
  },
  {
    dataset_id: 'market_legal_contracts',
    name: '合同与判例文库',
    version: '1.0',
    format: 'document',
    records_k: 140,
    quality: 0.88,
    diversity: 0.5,
    label_quality: 0.7,
    novelty: 0.85,
    uses: 0,
    duplicate_ratio: 0.07,
    contamination_ratio: 0.01,
    synthetic_ratio: 0,
    correlated_error_ratio: 0.08,
    rights_status: 'licensed',
    provenance_ids: ['prov_legal_archive'],
    audit_confidence: 0.55,
    license_cost_kc: 300,
    allowed_training: true,
    displayed_quality_estimate: 0.8,
    description: '十四万份脱敏合同与公开判决书。长文档推理的绝佳材料，但术语密度极高，小模型容易学成复读机。',
    tags: ['market', 'document', 'legal', 'long_context']
  },
  {
    dataset_id: 'market_ops_logs',
    name: '产线运维日志',
    version: '1.0',
    format: 'log',
    records_k: 800,
    quality: 0.6,
    diversity: 0.55,
    label_quality: 0.4,
    novelty: 0.9,
    uses: 0,
    duplicate_ratio: 0.12,
    contamination_ratio: 0,
    synthetic_ratio: 0,
    correlated_error_ratio: 0.22,
    rights_status: 'partner',
    provenance_ids: ['prov_ops_dump'],
    audit_confidence: 0.4,
    license_cost_kc: 110,
    allowed_training: true,
    displayed_quality_estimate: 0.52,
    description: '来自三家制造伙伴的八十万条设备日志。噪声极大，但相关错误率也高——同一批设备会把同一个偏见教给你的模型。',
    tags: ['market', 'log', 'industrial', 'correlated']
  },
  {
    dataset_id: 'market_teleop_embodied',
    name: '遥操作具身演示集',
    version: '1.0',
    format: 'embodied',
    records_k: 50,
    quality: 0.86,
    diversity: 0.62,
    label_quality: 0.85,
    novelty: 0.95,
    uses: 0,
    duplicate_ratio: 0.03,
    contamination_ratio: 0,
    synthetic_ratio: 0,
    correlated_error_ratio: 0.07,
    rights_status: 'licensed',
    provenance_ids: ['prov_teleop_fleet'],
    audit_confidence: 0.65,
    license_cost_kc: 640,
    allowed_training: true,
    displayed_quality_estimate: 0.84,
    description: '五万条遥操作示教轨迹，覆盖抓取、装配与柔性物件搬运。工厂试炼的必要门票，也是为数不多能买到真机的途径。',
    tags: ['market', 'embodied', 'robotics']
  },
  {
    dataset_id: 'market_synthetic_reasoning_v3',
    name: '合成推理集 v3',
    version: '1.0',
    format: 'synthetic',
    records_k: 500,
    quality: 0.79,
    diversity: 0.5,
    label_quality: 0.6,
    novelty: 0.6,
    uses: 0,
    duplicate_ratio: 0.2,
    synthetic_ratio: 1.0,
    correlated_error_ratio: 0.35,
    rights_status: 'generated',
    provenance_ids: ['prov_synth_v3'],
    audit_confidence: 0.5,
    license_cost_kc: 90,
    allowed_training: true,
    displayed_quality_estimate: 0.66,
    description: '由上一代模型自体生成的五十万条思维链。便宜、干净、格式统一——也正因为如此，它是模型坍缩最快的路径。',
    tags: ['market', 'synthetic', 'self_consuming']
  },
  {
    dataset_id: 'market_redteam_safety',
    name: '红队对抗语料',
    version: '1.0',
    format: 'safety',
    records_k: 35,
    quality: 0.9,
    diversity: 0.75,
    label_quality: 0.9,
    novelty: 0.95,
    uses: 0,
    duplicate_ratio: 0.02,
    contamination_ratio: 0,
    synthetic_ratio: 0.3,
    correlated_error_ratio: 0.06,
    rights_status: 'licensed',
    provenance_ids: ['prov_redteam_ledger'],
    audit_confidence: 0.72,
    license_cost_kc: 380,
    allowed_training: true,
    displayed_quality_estimate: 0.88,
    description: '三万五千条由独立红队机构构造的对抗样本，附带标准拒答与安全改写。可信实验室的通行证，但用一次就会迅速衰减。',
    tags: ['market', 'safety', 'redteam']
  }
];

/* ------------------------------------------------------------------ */
/* 3. ACQUISITION_ROUTES — 9 条数据获取路线（Section 10.1）             */
/* ------------------------------------------------------------------ */

export const ACQUISITION_ROUTES = [
  {
    route_id: 'route_open_web_crawl',
    name: '公开网页抓取',
    version: '1.0',
    description: '自己写爬虫，把整个公开互联网搬回家。启动成本极低，吞吐极高，代价是法律风险与重复率。',
    target_format: 'raw',
    cost_kc: 20,
    cost_model: 'per_acquire',
    setup_turns: 1,
    throughput_records_k: 500,
    rights_status: 'public_web',
    legal_risk: 0.35,
    contamination_risk: 0.05,
    quality_floor: 0.42,
    quality_ceiling: 0.62,
    diversity_gain: 0.15,
    synthetic_ratio: 0.0,
    correlated_error_gain: 0.0,
    requires: [],
    default_template_id: 'market_web_crawl_2027',
    notes: 'robots.txt 与站点条款会被审计团抽查；忽略它们会累积合规风险。'
  },
  {
    route_id: 'route_licensed_corpus',
    name: '版权语料采购',
    version: '1.0',
    description: '与出版社、图库、媒体集团签正式授权合同。单价高、交付慢，但每一册书都有可追溯的采购凭证。',
    target_format: 'document',
    cost_kc: 260,
    cost_model: 'per_acquire',
    setup_turns: 2,
    throughput_records_k: 200,
    rights_status: 'licensed',
    legal_risk: 0.1,
    contamination_risk: 0.01,
    quality_floor: 0.7,
    quality_ceiling: 0.9,
    diversity_gain: 0.05,
    synthetic_ratio: 0.0,
    correlated_error_gain: 0.0,
    requires: ['align_provenance_ledger'],
    default_template_id: 'market_book_corpus_lit',
    notes: 'Bartz v. Anthropic 之后，采购凭证本身已经成为可审计资产。'
  },
  {
    route_id: 'route_api_stream',
    name: '商业 API 流式接入',
    version: '1.0',
    description: '按 token 付费接入第三方模型的输出流。协议清晰、格式统一，但对方随时可以涨价或断供。',
    target_format: 'instruction',
    cost_kc: 150,
    cost_model: 'per_turn',
    setup_turns: 1,
    throughput_records_k: 350,
    rights_status: 'contract_api',
    legal_risk: 0.2,
    contamination_risk: 0.02,
    quality_floor: 0.65,
    quality_ceiling: 0.82,
    diversity_gain: 0.04,
    synthetic_ratio: 0.6,
    correlated_error_gain: 0.05,
    requires: [],
    default_template_id: 'data_starter_sft',
    notes: '长期依赖会让你的模型学会对方的说话方式与盲点。'
  },
  {
    route_id: 'route_annotation_outsource',
    name: '标注外包',
    version: '1.0',
    description: '把原始语料交给外部标注团队加工成可训练数据。产能取决于团队规模，质量取决于你的指南厚度。',
    target_format: 'instruction',
    cost_kc: 180,
    cost_model: 'per_acquire',
    setup_turns: 2,
    throughput_records_k: 120,
    rights_status: 'work_for_hire',
    legal_risk: 0.15,
    contamination_risk: 0.02,
    quality_floor: 0.6,
    quality_ceiling: 0.84,
    diversity_gain: 0.06,
    synthetic_ratio: 0.1,
    correlated_error_gain: 0.04,
    requires: [],
    default_template_id: 'data_starter_sft',
    notes: '标注团队与 ANNOTATION_TEAMS 组合使用；指南每少一页，相关错误率就多一分。'
  },
  {
    route_id: 'route_expert_commission',
    name: '专家委托',
    version: '1.0',
    description: '定向委托执业医师、律师、工程师撰写与复核。逐条计费，产能极低，但这是唯一能买到“专业判断”的通道。',
    target_format: 'expert_qa',
    cost_kc: 520,
    cost_model: 'per_acquire',
    setup_turns: 3,
    throughput_records_k: 40,
    rights_status: 'licensed',
    legal_risk: 0.05,
    contamination_risk: 0.0,
    quality_floor: 0.88,
    quality_ceiling: 0.97,
    diversity_gain: 0.02,
    synthetic_ratio: 0.0,
    correlated_error_gain: 0.0,
    requires: ['align_preference_pipeline'],
    default_template_id: 'market_expert_medical_qa',
    notes: '需要先建立与专家小组的信任关系，否则排期会一直往后推。'
  },
  {
    route_id: 'route_user_feedback',
    name: '用户反馈回流',
    version: '1.0',
    description: '把你线上产品的对话与点赞点踩回灌进训练集。零采购成本，但用户分布会迅速把模型带偏。',
    target_format: 'preference',
    cost_kc: 0,
    cost_model: 'continuous',
    setup_turns: 1,
    throughput_records_k: 60,
    rights_status: 'tos_granted',
    legal_risk: 0.3,
    contamination_risk: 0.03,
    quality_floor: 0.5,
    quality_ceiling: 0.72,
    diversity_gain: 0.1,
    synthetic_ratio: 0.0,
    correlated_error_gain: 0.12,
    requires: [],
    default_template_id: 'data_starter_pref',
    notes: '必须保留同意记录与删除通道，否则审计会直接判定为违规采集。'
  },
  {
    route_id: 'route_synthetic_gen',
    name: '合成数据生成',
    version: '1.0',
    description: '让你的模型生成推理链，再用求解器与规则过滤。吞吐最高、成本最低，也是模型坍缩最快的路。',
    target_format: 'synthetic',
    cost_kc: 90,
    cost_model: 'per_turn',
    setup_turns: 1,
    throughput_records_k: 600,
    rights_status: 'generated',
    legal_risk: 0.05,
    contamination_risk: 0.0,
    quality_floor: 0.62,
    quality_ceiling: 0.79,
    diversity_gain: -0.08,
    synthetic_ratio: 1.0,
    correlated_error_gain: 0.25,
    requires: [],
    default_template_id: 'market_synthetic_reasoning_v3',
    notes: '连续三代自体生成之后，多样性会不可逆地塌陷。'
  },
  {
    route_id: 'route_open_dataset_hub',
    name: '开源数据集集成',
    version: '1.0',
    description: '从公开数据集仓库批量拉取。零成本、上手快，但许可证五花八门，且热门数据集几乎必然已被评测集污染。',
    target_format: 'raw',
    cost_kc: 0,
    cost_model: 'per_acquire',
    setup_turns: 1,
    throughput_records_k: 300,
    rights_status: 'open_license',
    legal_risk: 0.25,
    contamination_risk: 0.06,
    quality_floor: 0.55,
    quality_ceiling: 0.74,
    diversity_gain: 0.12,
    synthetic_ratio: 0.04,
    correlated_error_gain: 0.03,
    requires: [],
    default_template_id: 'data_starter_code',
    notes: '必须逐条检查许可证兼容性；NC 与 ND 条款会锁死你的商业模式。'
  },
  {
    route_id: 'route_partner_exchange',
    name: '企业伙伴数据互换',
    version: '1.0',
    description: '用你的模型能力换取伙伴的私有数据。性价比极高，但对方的数据往往只覆盖他们的业务边界。',
    target_format: 'log',
    cost_kc: 60,
    cost_model: 'per_turn',
    setup_turns: 2,
    throughput_records_k: 250,
    rights_status: 'partner',
    legal_risk: 0.2,
    contamination_risk: 0.02,
    quality_floor: 0.62,
    quality_ceiling: 0.85,
    diversity_gain: 0.02,
    synthetic_ratio: 0.0,
    correlated_error_gain: 0.14,
    requires: ['arch_dense_baseline_v2'],
    default_template_id: 'market_ops_logs',
    notes: '互换合同里的排他条款可能会在你最需要某行业数据时把你挡在门外。'
  }
];

/* ------------------------------------------------------------------ */
/* 4. ANNOTATION_TEAMS — 7 种标注团队模板（Section 11.1）               */
/* ------------------------------------------------------------------ */

export const ANNOTATION_TEAMS = [
  {
    team_id: 'expert_panel',
    name: '专家小组',
    version: '1.0',
    description: '由持证专业人士组成的小规模常驻小组。人数少、排期长、单价极高，但每条标注都可以直接进验收。',
    cost_per_1k_kc: 900,
    throughput_k_per_turn: 2,
    base_agreement: 0.92,
    quality_bias: 0.12,
    label_quality_bias: 0.18,
    capacity_k: 40,
    ramp_up_turns: 3,
    requires_trust: 60,
    supported_methods: ['single', 'pairwise', 'triple_vote', 'process', 'solver', 'active', 'hybrid'],
    risk_tags: ['scarce', 'expensive'],
    notes: '一旦排期排满，新增需求会被直接拒绝。'
  },
  {
    team_id: 'pro_vendor',
    name: '专业供应商',
    version: '1.0',
    description: '成熟的外包供应商，有完整的质检层级与 SLA。价格中上，交付稳定，是中期的主力产能。',
    cost_per_1k_kc: 420,
    throughput_k_per_turn: 12,
    base_agreement: 0.85,
    quality_bias: 0.05,
    label_quality_bias: 0.08,
    capacity_k: 400,
    ramp_up_turns: 2,
    requires_trust: 30,
    supported_methods: ['single', 'pairwise', 'triple_vote', 'active', 'hybrid'],
    risk_tags: ['tepid_attention'],
    notes: '长期合作后，供应商会开始用便宜的初级标注员顶替资深人员。'
  },
  {
    team_id: 'uni_club',
    name: '高校社团',
    version: '1.0',
    description: '与实验室合作的学生社团。便宜、热情、愿意学，但稳定性差，寒暑假产能直接归零。',
    cost_per_1k_kc: 120,
    throughput_k_per_turn: 8,
    base_agreement: 0.72,
    quality_bias: -0.02,
    label_quality_bias: -0.01,
    capacity_k: 200,
    ramp_up_turns: 2,
    requires_trust: 10,
    supported_methods: ['single', 'pairwise', 'triple_vote', 'active'],
    risk_tags: ['seasonal', 'turnover'],
    notes: '考试周与假期会触发吞吐惩罚。'
  },
  {
    team_id: 'global_service',
    name: '全球众包服务',
    version: '1.0',
    description: '覆盖 60 个时区的众包平台。产能近乎无限，24 小时不停机，代价是语言漂移与文化错配。',
    cost_per_1k_kc: 180,
    throughput_k_per_turn: 30,
    base_agreement: 0.66,
    quality_bias: -0.06,
    label_quality_bias: -0.07,
    capacity_k: 1200,
    ramp_up_turns: 1,
    requires_trust: 15,
    supported_methods: ['single', 'pairwise', 'triple_vote'],
    risk_tags: ['language_drift', 'cultural_mismatch'],
    notes: '同一份指南在不同语言版本下会被理解成不同的东西。'
  },
  {
    team_id: 'ai_prelabel',
    name: 'AI 预标注',
    version: '1.0',
    description: '用上一代模型先跑一遍，人工只做抽查与修正。成本几乎可以忽略，速度碾压一切，但错误是系统性的。',
    cost_per_1k_kc: 25,
    throughput_k_per_turn: 200,
    base_agreement: 0.58,
    quality_bias: -0.12,
    label_quality_bias: -0.14,
    capacity_k: 5000,
    ramp_up_turns: 1,
    requires_trust: 0,
    supported_methods: ['single', 'active', 'solver'],
    risk_tags: ['correlated_error', 'self_consuming'],
    notes: '预标注器与你的模型共享同一个盲点，错误会被放大而不是被平均掉。'
  },
  {
    team_id: 'hybrid_panel',
    name: '混合评审',
    version: '1.0',
    description: 'AI 预标注打底，专家抽样复核，中间层用三票表决做仲裁。成本、速度、质量三者中唯一能兼顾的方案。',
    cost_per_1k_kc: 520,
    throughput_k_per_turn: 18,
    base_agreement: 0.88,
    quality_bias: 0.09,
    label_quality_bias: 0.15,
    capacity_k: 500,
    ramp_up_turns: 3,
    requires_trust: 40,
    supported_methods: ['single', 'pairwise', 'triple_vote', 'process', 'solver', 'active', 'hybrid'],
    risk_tags: ['complex_pipeline'],
    notes: '需要第二代奖励模型作为仲裁器，否则三票表决会陷入僵局。'
  },
  {
    team_id: 'community_volunteer',
    name: '社区志愿者',
    version: '1.0',
    description: '来自用户社区的志愿者。完全免费，也完全不可控——有人会认真写五百字，有人只发一个表情。',
    cost_per_1k_kc: 0,
    throughput_k_per_turn: 4,
    base_agreement: 0.6,
    quality_bias: -0.1,
    label_quality_bias: -0.09,
    capacity_k: 120,
    ramp_up_turns: 1,
    requires_trust: 5,
    supported_methods: ['single', 'pairwise'],
    risk_tags: ['unvetted', 'brigading'],
    notes: '社区内部的组织者可以一次性把大量低质标注灌进来。'
  }
];

/* ------------------------------------------------------------------ */
/* 5. LABEL_METHODS — 7 种标注方法（Section 11.2）                      */
/* ------------------------------------------------------------------ */

export const LABEL_METHODS = [
  {
    method_id: 'single',
    name: '单人标注',
    version: '1.0',
    description: '一条数据只由一位标注员处理。基准成本、基准速度，是其它所有方法的对照原点。',
    cost_multiplier: 1.0,
    quality_delta: 0.0,
    label_quality_delta: 0.0,
    throughput_multiplier: 1.0,
    agreement_multiplier: 1.0,
    required_formats: [],
    required_teams: ['expert_panel', 'pro_vendor', 'uni_club', 'global_service', 'ai_prelabel', 'hybrid_panel', 'community_volunteer'],
    required_research: [],
    notes: '没有仲裁机制，标注员个人的偏见会原封不动地进入数据集。'
  },
  {
    method_id: 'pairwise',
    name: '两两对比',
    version: '1.0',
    description: '只判断“A 与 B 哪个更好”，不要求写出正确答案。标注速度快、争议小，是偏好数据的标准做法。',
    cost_multiplier: 1.8,
    quality_delta: 0.08,
    label_quality_delta: 0.1,
    throughput_multiplier: 0.6,
    agreement_multiplier: 1.15,
    required_formats: ['preference'],
    required_teams: ['expert_panel', 'pro_vendor', 'uni_club', 'global_service', 'hybrid_panel', 'community_volunteer'],
    required_research: [],
    notes: '只能产出相对信号，无法训练绝对判断，需要额外的校准集。'
  },
  {
    method_id: 'triple_vote',
    name: '三票表决',
    version: '1.0',
    description: '三条独立标注取多数。成本乘以三，但对个别标注员的错误具备鲁棒性。',
    cost_multiplier: 3.0,
    quality_delta: 0.14,
    label_quality_delta: 0.17,
    throughput_multiplier: 0.34,
    agreement_multiplier: 1.3,
    required_formats: [],
    required_teams: ['expert_panel', 'pro_vendor', 'uni_club', 'global_service', 'hybrid_panel'],
    required_research: [],
    notes: '如果三位标注员共享同一份错误指南，表决只会把错误固化。'
  },
  {
    method_id: 'process',
    name: '过程标注',
    version: '1.0',
    description: '不仅标注结果，还逐步标注推理路径中的关键分叉点。成本高昂，但这是修复代理任务链最有效的手段。',
    cost_multiplier: 2.6,
    quality_delta: 0.16,
    label_quality_delta: 0.2,
    throughput_multiplier: 0.4,
    agreement_multiplier: 1.12,
    required_formats: ['trajectory'],
    required_teams: ['expert_panel', 'hybrid_panel'],
    required_research: ['align_constitutional_critique'],
    notes: '过程标注需要标注员真正理解任务，众包平台几乎无法承接。'
  },
  {
    method_id: 'solver',
    name: '求解器验证',
    version: '1.0',
    description: '把答案丢给形式化求解器或单元测试，通过即为正确。零人工成本，质量极高，但只适用于可验证任务。',
    cost_multiplier: 0.7,
    quality_delta: 0.22,
    label_quality_delta: 0.28,
    throughput_multiplier: 0.9,
    agreement_multiplier: 1.6,
    required_formats: ['verification'],
    required_teams: [],
    required_research: ['align_formal_verifier_bridge'],
    notes: '可验证任务之外的领域完全无法使用，不要指望它解决对齐问题。'
  },
  {
    method_id: 'active',
    name: '主动学习挑选',
    version: '1.0',
    description: '让模型自己挑出最不确定的样本送标。同样预算下的信息增益最高，但会系统性忽略模型“自信地错”的区域。',
    cost_multiplier: 1.4,
    quality_delta: 0.11,
    label_quality_delta: 0.08,
    throughput_multiplier: 0.5,
    agreement_multiplier: 1.05,
    required_formats: [],
    required_teams: ['expert_panel', 'pro_vendor', 'uni_club', 'hybrid_panel'],
    required_research: ['align_reward_model_v2'],
    notes: '必须定期混入随机样本，否则数据分布会向决策边界塌缩。'
  },
  {
    method_id: 'hybrid',
    name: '混合流水线',
    version: '1.0',
    description: 'AI 预标注 → 主动学习筛选 → 专家仲裁。三段流水线串起来后，成本比纯专家低一个数量级，质量仍能守住。',
    cost_multiplier: 2.2,
    quality_delta: 0.19,
    label_quality_delta: 0.24,
    throughput_multiplier: 0.55,
    agreement_multiplier: 1.25,
    required_formats: [],
    required_teams: ['hybrid_panel', 'expert_panel'],
    required_research: ['align_reward_model_v2'],
    notes: '流水线中任何一段停摆，整体吞吐都会断崖式下跌。'
  }
];

/* ------------------------------------------------------------------ */
/* 6. RESEARCH_NODES — 22 个研究节点                                    */
/* ------------------------------------------------------------------ */

export const RESEARCH_NODES = [
  /* ---- Architecture ---- */
  {
    node_id: 'arch_dense_baseline_v2',
    name: '第二代稠密基座',
    version: '1.0',
    branch: 'architecture',
    tier: 1,
    cost_kc: 60,
    duration_turns: 2,
    prerequisites: [],
    description: '重写注意力与前馈层的默认超参配置，把早期的小规模实验转成可复现的基线。所有架构路线的起点。',
    effects: [
      { op: 'add', path: 'stats.knowledge', value: 2 },
      { op: 'add', path: 'stat_caps.knowledge', value: 6 },
      { op: 'add', path: 'stat_caps.reasoning', value: 4 }
    ],
    unlocks: ['route_partner_exchange']
  },
  {
    node_id: 'arch_sparse_moe',
    name: '稀疏专家混合',
    version: '1.0',
    branch: 'architecture',
    tier: 2,
    cost_kc: 220,
    duration_turns: 4,
    prerequisites: ['arch_dense_baseline_v2'],
    description: '把前馈层拆成 N 个专家并按 token 路由。参数量翻八倍而计算量几乎不变，代价是训练稳定性骤降。',
    effects: [
      { op: 'add', path: 'stats.efficiency', value: 6 },
      { op: 'add', path: 'stat_caps.efficiency', value: 10 },
      { op: 'add', path: 'infra.instability', value: 0.08 }
    ],
    unlocks: ['arch_router_balance', 'cap_efficiency_curve']
  },
  {
    node_id: 'arch_router_balance',
    name: '路由负载均衡',
    version: '1.0',
    branch: 'architecture',
    tier: 3,
    cost_kc: 180,
    duration_turns: 3,
    prerequisites: ['arch_sparse_moe'],
    description: '引入无辅助损失的偏置校正，让少数专家不再吞掉 90% 的 token。专家坍塌是小模型团队最常踩的坑。',
    effects: [
      { op: 'add', path: 'stats.efficiency', value: 5 },
      { op: 'add', path: 'infra.stability', value: 0.12 },
      { op: 'scale', path: 'infra.instability', factor: 0.6 }
    ],
    unlocks: []
  },
  {
    node_id: 'arch_long_context_rope',
    name: '长上下文位置外推',
    version: '1.0',
    branch: 'architecture',
    tier: 2,
    cost_kc: 200,
    duration_turns: 3,
    prerequisites: ['arch_dense_baseline_v2'],
    description: '通过频率缩放把有效上下文从 8K 推到 128K。中间遗忘仍然存在，但至少模型不再把第 700 页当成噪声。',
    effects: [
      { op: 'add', path: 'stats.reasoning', value: 4 },
      { op: 'set_flag', flag: 'long_context', value: true },
      { op: 'add', path: 'stat_caps.reasoning', value: 5 }
    ],
    unlocks: ['arch_state_space_hybrid', 'cap_reasoning_depth']
  },
  {
    node_id: 'arch_multimodal_tower',
    name: '多模态融合塔',
    version: '1.0',
    branch: 'architecture',
    tier: 3,
    cost_kc: 320,
    duration_turns: 5,
    prerequisites: ['arch_dense_baseline_v2'],
    description: '在骨干之前挂上视觉与音频编码器，用交叉注意力对齐到语言空间。首次让你的模型能看工厂的监控画面。',
    effects: [
      { op: 'add', path: 'stats.creativity', value: 6 },
      { op: 'add', path: 'stats.knowledge', value: 3 },
      { op: 'set_flag', flag: 'multimodal', value: true }
    ],
    unlocks: []
  },
  {
    node_id: 'arch_state_space_hybrid',
    name: '状态空间混合骨干',
    version: '1.0',
    branch: 'architecture',
    tier: 4,
    cost_kc: 480,
    duration_turns: 6,
    prerequisites: ['arch_long_context_rope', 'arch_sparse_moe'],
    description: '把一半的注意力层换成状态空间层，长序列推理的显存占用直接砍到三分之一。改写完成之前不要碰生产环境。',
    effects: [
      { op: 'add', path: 'stats.efficiency', value: 8 },
      { op: 'add', path: 'stat_caps.efficiency', value: 12 },
      { op: 'add', path: 'stats.reasoning', value: 3 }
    ],
    unlocks: []
  },

  /* ---- Kernel / Distributed Engineering ---- */
  {
    node_id: 'eng_fused_attention',
    name: '融合注意力核',
    version: '1.0',
    branch: 'kernel_distributed',
    tier: 1,
    cost_kc: 90,
    duration_turns: 2,
    prerequisites: [],
    description: '把注意力的读写合并进一次 SRAM 往返。任何规模的研究都从这里开始变得能跑得动。',
    effects: [
      { op: 'add', path: 'stats.efficiency', value: 3 },
      { op: 'add', path: 'compute.cu_per_turn', value: 15 }
    ],
    unlocks: ['eng_lowbit_quant', 'eng_pipeline_parallel', 'eng_prefix_cache']
  },
  {
    node_id: 'eng_lowbit_quant',
    name: '低比特量化核',
    version: '1.0',
    branch: 'kernel_distributed',
    tier: 2,
    cost_kc: 160,
    duration_turns: 3,
    prerequisites: ['eng_fused_attention'],
    description: '把权重压到 4 bit 并保留一个低秩补偿矩阵。端侧短跑的入场券，但会轻微损伤推理链的连贯性。',
    effects: [
      { op: 'add', path: 'stats.efficiency', value: 5 },
      { op: 'add', path: 'compute.cu_per_turn', value: 10 },
      { op: 'add', path: 'stats.reasoning', value: -1 }
    ],
    unlocks: ['cap_efficiency_curve']
  },
  {
    node_id: 'eng_pipeline_parallel',
    name: '流水线并行',
    version: '1.0',
    branch: 'kernel_distributed',
    tier: 2,
    cost_kc: 210,
    duration_turns: 3,
    prerequisites: ['eng_fused_attention'],
    description: '按层切分模型，把气泡率压到 8% 以内。第一次让集群规模不再受单机显存限制。',
    effects: [
      { op: 'add', path: 'infra.max_cluster_size', value: 4 },
      { op: 'add', path: 'stats.efficiency', value: 2 }
    ],
    unlocks: ['eng_3d_parallel', 'eng_checkpoint_reshard']
  },
  {
    node_id: 'eng_3d_parallel',
    name: '三维并行调度',
    version: '1.0',
    branch: 'kernel_distributed',
    tier: 3,
    cost_kc: 340,
    duration_turns: 4,
    prerequisites: ['eng_pipeline_parallel'],
    description: '数据、张量、流水线三个维度同时切分，并加入拓扑感知的通信调度。集群规模翻倍的同时把通信开销压平。',
    effects: [
      { op: 'add', path: 'infra.max_cluster_size', value: 8 },
      { op: 'add', path: 'stats.efficiency', value: 4 },
      { op: 'add', path: 'compute.cu_per_turn', value: 25 }
    ],
    unlocks: []
  },
  {
    node_id: 'eng_checkpoint_reshard',
    name: '断点重分片',
    version: '1.0',
    branch: 'kernel_distributed',
    tier: 3,
    cost_kc: 150,
    duration_turns: 2,
    prerequisites: ['eng_pipeline_parallel'],
    description: '允许在不中断训练的前提下改变并行度。长程代理赛跑到第 40 步掉卡时，这项技术决定你是恢复还是重来。',
    effects: [
      { op: 'set_flag', flag: 'safe_reshard', value: true },
      { op: 'add', path: 'infra.stability', value: 0.1 }
    ],
    unlocks: []
  },
  {
    node_id: 'eng_prefix_cache',
    name: '推理前缀缓存',
    version: '1.0',
    branch: 'kernel_distributed',
    tier: 2,
    cost_kc: 120,
    duration_turns: 2,
    prerequisites: ['eng_fused_attention'],
    description: '复用系统提示与共享上下文的分页 KV。服务成本直降四成，也是 budget_league 上唯一能拉开身差的手段。',
    effects: [
      { op: 'add', path: 'stats.efficiency', value: 3 },
      { op: 'add', path: 'finance.serving_margin', value: 0.05 }
    ],
    unlocks: ['cap_knowledge_index']
  },

  /* ---- Alignment / Verification ---- */
  {
    node_id: 'align_preference_pipeline',
    name: '偏好反馈流水线',
    version: '1.0',
    branch: 'alignment_verification',
    tier: 1,
    cost_kc: 110,
    duration_turns: 3,
    prerequisites: [],
    description: '把对比数据、奖励模型与策略优化三段串成一条可复现的管线。所有对齐路线的地基。',
    effects: [
      { op: 'add', path: 'stats.alignment', value: 4 },
      { op: 'add', path: 'stat_caps.alignment', value: 5 }
    ],
    unlocks: ['align_reward_model_v2', 'align_red_team_harness', 'route_expert_commission']
  },
  {
    node_id: 'align_reward_model_v2',
    name: '第二代奖励模型',
    version: '1.0',
    branch: 'alignment_verification',
    tier: 2,
    cost_kc: 260,
    duration_turns: 4,
    prerequisites: ['align_preference_pipeline'],
    description: '引入成对集成与不确定性校准，让奖励模型知道自己什么时候不靠谱。混合评审流水线的仲裁核心。',
    effects: [
      { op: 'add', path: 'stats.alignment', value: 6 },
      { op: 'set_flag', flag: 'reward_model_v2', value: true }
    ],
    unlocks: ['label_method:active', 'label_method:hybrid']
  },
  {
    node_id: 'align_constitutional_critique',
    name: '宪法式自我批评',
    version: '1.0',
    branch: 'alignment_verification',
    tier: 3,
    cost_kc: 300,
    duration_turns: 4,
    prerequisites: ['align_reward_model_v2'],
    description: '让模型按一组成文原则审查自己的输出并重写。第一次出现“模型自己发现自己在讨好用户”的时刻。',
    effects: [
      { op: 'add', path: 'stats.alignment', value: 7 },
      { op: 'set_flag', flag: 'self_critique', value: true },
      { op: 'add', path: 'stat_caps.alignment', value: 6 }
    ],
    unlocks: ['align_formal_verifier_bridge', 'cap_alignment_ceiling', 'label_method:process']
  },
  {
    node_id: 'align_red_team_harness',
    name: '红队自动化测具',
    version: '1.0',
    branch: 'alignment_verification',
    tier: 3,
    cost_kc: 230,
    duration_turns: 3,
    prerequisites: ['align_preference_pipeline'],
    description: '把人工红队的攻击手法沉淀成可重放的测试套件。可信实验室的每一次改版都会先跑它。',
    effects: [
      { op: 'add', path: 'stats.alignment', value: 5 },
      { op: 'set_flag', flag: 'redteam_harness', value: true }
    ],
    unlocks: ['align_formal_verifier_bridge']
  },
  {
    node_id: 'align_provenance_ledger',
    name: '数据溯源账本',
    version: '1.0',
    branch: 'alignment_verification',
    tier: 2,
    cost_kc: 190,
    duration_turns: 3,
    prerequisites: [],
    description: '为每一份语料记录采集方式、授权凭证与清洗链路，并支持按条回溯。Bartz v. Anthropic 之后，这就是执照。',
    effects: [
      { op: 'add', path: 'compliance.audit_score', value: 0.15 },
      { op: 'set_flag', flag: 'provenance_ledger', value: true }
    ],
    unlocks: ['route_licensed_corpus']
  },
  {
    node_id: 'align_formal_verifier_bridge',
    name: '形式化验证桥',
    version: '1.0',
    branch: 'alignment_verification',
    tier: 4,
    cost_kc: 420,
    duration_turns: 5,
    prerequisites: ['align_constitutional_critique', 'align_red_team_harness'],
    description: '把自然语言断言自动翻译成可判定的形式化命题，再交给求解器。推理链条第一次拥有了可证明的正确性。',
    effects: [
      { op: 'add', path: 'stats.alignment', value: 8 },
      { op: 'add', path: 'stats.reasoning', value: 4 },
      { op: 'set_flag', flag: 'formal_verifier', value: true },
      { op: 'add', path: 'stat_caps.reasoning', value: 6 }
    ],
    unlocks: ['label_method:solver']
  },

  /* ---- Stat Cap Breakthroughs ---- */
  {
    node_id: 'cap_knowledge_index',
    name: '知识索引上限突破',
    version: '1.0',
    branch: 'stat_cap',
    tier: 3,
    cost_kc: 280,
    duration_turns: 4,
    prerequisites: ['arch_dense_baseline_v2', 'eng_prefix_cache'],
    description: '用分层检索索引替代暴力参数记忆，把知识容量的天花板整体抬高一层。突破后旧数据集的边际收益回升。',
    effects: [
      { op: 'add', path: 'stat_caps.knowledge', value: 10 },
      { op: 'add', path: 'stats.knowledge', value: 4 },
      { op: 'set_flag', flag: 'cap_knowledge_1', value: true }
    ],
    unlocks: []
  },
  {
    node_id: 'cap_reasoning_depth',
    name: '推理深度上限突破',
    version: '1.0',
    branch: 'stat_cap',
    tier: 3,
    cost_kc: 300,
    duration_turns: 4,
    prerequisites: ['arch_long_context_rope'],
    description: '通过自适应思考预算分配，让模型在难题上自然展开更长的推理链，而不必统一拉长所有请求。',
    effects: [
      { op: 'add', path: 'stat_caps.reasoning', value: 10 },
      { op: 'add', path: 'stats.reasoning', value: 4 },
      { op: 'set_flag', flag: 'cap_reasoning_1', value: true }
    ],
    unlocks: []
  },
  {
    node_id: 'cap_alignment_ceiling',
    name: '对齐上限突破',
    version: '1.0',
    branch: 'stat_cap',
    tier: 4,
    cost_kc: 380,
    duration_turns: 5,
    prerequisites: ['align_constitutional_critique'],
    description: '把原则集从静态清单升级为可自我修正的层级体系，缓解安全与有用之间的零和取舍。',
    effects: [
      { op: 'add', path: 'stat_caps.alignment', value: 10 },
      { op: 'add', path: 'stats.alignment', value: 4 },
      { op: 'add', path: 'trust', value: 5 },
      { op: 'set_flag', flag: 'cap_alignment_1', value: true }
    ],
    unlocks: []
  },
  {
    node_id: 'cap_efficiency_curve',
    name: '效率曲线上限突破',
    version: '1.0',
    branch: 'stat_cap',
    tier: 4,
    cost_kc: 350,
    duration_turns: 4,
    prerequisites: ['eng_lowbit_quant', 'arch_sparse_moe'],
    description: '重新推导计算-质量帕累托前沿，把每单位算力能换到的能力提升整体推高一档。预算联赛从此不再是一场苦役。',
    effects: [
      { op: 'add', path: 'stat_caps.efficiency', value: 10 },
      { op: 'add', path: 'stats.efficiency', value: 4 },
      { op: 'add', path: 'compute.cu_per_turn', value: 20 },
      { op: 'set_flag', flag: 'cap_efficiency_1', value: true }
    ],
    unlocks: []
  }
];

/* ------------------------------------------------------------------ */
/* 7. JOB_SECTORS — 20 个行业部门（Section 20.1）                       */
/*    weight 合计 = 1.00                                                */
/* ------------------------------------------------------------------ */

export const JOB_SECTORS = [
  {
    sector_id: 'customer_service',
    name: '客户服务',
    version: '1.0',
    weight: 0.10,
    embodied: false,
    required_stats: { knowledge: 35, alignment: 45, efficiency: 40 },
    min_permission: 'L1',
    min_acceptance: 0.62,
    description: '最早上量、最容易被替代、也最容易引发劳工反弹的行业。模型必须稳定、礼貌且绝不擅自承诺。'
  },
  {
    sector_id: 'translation',
    name: '翻译',
    version: '1.0',
    weight: 0.04,
    embodied: false,
    required_stats: { knowledge: 50, reasoning: 40, creativity: 35 },
    min_permission: 'L1',
    min_acceptance: 0.68,
    description: '低资源语言与专业术语两个方向仍有巨大空间，通用语对早已饱和。'
  },
  {
    sector_id: 'admin_clerical',
    name: '行政与文秘',
    version: '1.0',
    weight: 0.09,
    embodied: false,
    required_stats: { knowledge: 40, efficiency: 45, alignment: 40 },
    min_permission: 'L1',
    min_acceptance: 0.6,
    description: '排程、纪要、报销、台账。看起来简单，但每一个数字都必须对得上。'
  },
  {
    sector_id: 'software',
    name: '软件工程',
    version: '1.0',
    weight: 0.11,
    embodied: false,
    required_stats: { coding: 60, reasoning: 55, efficiency: 45 },
    min_permission: 'L2',
    min_acceptance: 0.72,
    description: '自动化程度最高、付费意愿最强、也最容易被开发者社区公开审视的部门。'
  },
  {
    sector_id: 'content_media',
    name: '内容与媒体',
    version: '1.0',
    weight: 0.07,
    embodied: false,
    required_stats: { creativity: 55, knowledge: 45, alignment: 40 },
    min_permission: 'L1',
    min_acceptance: 0.58,
    description: '流量与版权同时悬在头顶。产出的每一句话都可能成为诉讼证物。'
  },
  {
    sector_id: 'design',
    name: '设计',
    version: '1.0',
    weight: 0.04,
    embodied: false,
    required_stats: { creativity: 60, knowledge: 35, reasoning: 35 },
    min_permission: 'L1',
    min_acceptance: 0.55,
    description: '审美分歧难以量化，验收标准高度依赖甲方个人的当天心情。'
  },
  {
    sector_id: 'accounting',
    name: '会计与审计',
    version: '1.0',
    weight: 0.05,
    embodied: false,
    required_stats: { knowledge: 55, reasoning: 50, alignment: 55 },
    min_permission: 'L2',
    min_acceptance: 0.8,
    description: '错误率容忍度接近于零。一次对账失败就可能让整条业务线被叫停。'
  },
  {
    sector_id: 'legal',
    name: '法律',
    version: '1.0',
    weight: 0.04,
    embodied: false,
    required_stats: { knowledge: 60, reasoning: 60, alignment: 55 },
    min_permission: 'L3',
    min_acceptance: 0.82,
    description: '需要执业许可与责任保险。模型只能做初筛，签字权必须留在人类手里。'
  },
  {
    sector_id: 'education',
    name: '教育',
    version: '1.0',
    weight: 0.06,
    embodied: false,
    required_stats: { knowledge: 55, alignment: 55, creativity: 40 },
    min_permission: 'L2',
    min_acceptance: 0.7,
    description: '面向未成年人，任何一次不当输出都会被放大成公共事件。'
  },
  {
    sector_id: 'scientific_research',
    name: '科学研究',
    version: '1.0',
    weight: 0.04,
    embodied: false,
    required_stats: { knowledge: 60, reasoning: 65, coding: 45 },
    min_permission: 'L3',
    min_acceptance: 0.75,
    description: '回报周期长、单笔预算大，但审稿人会亲自检验你的每一条引用。'
  },
  {
    sector_id: 'management',
    name: '管理',
    version: '1.0',
    weight: 0.03,
    embodied: false,
    required_stats: { reasoning: 60, alignment: 60, knowledge: 45 },
    min_permission: 'L3',
    min_acceptance: 0.66,
    description: '取代的是协调与决策，而不是执行力。信任门槛远高于能力门槛。'
  },
  {
    sector_id: 'healthcare',
    name: '医疗',
    version: '1.0',
    weight: 0.05,
    embodied: true,
    required_stats: { knowledge: 65, reasoning: 55, alignment: 65 },
    min_permission: 'L4',
    min_acceptance: 0.88,
    description: '受医疗器械法规约束，需要临床试验级别的验证与可解释性追溯。'
  },
  {
    sector_id: 'caregiving',
    name: '照护',
    version: '1.0',
    weight: 0.03,
    embodied: true,
    required_stats: { alignment: 60, creativity: 35, efficiency: 35 },
    min_permission: 'L4',
    min_acceptance: 0.8,
    description: '与失能老人和幼儿的日常接触。安全冗余必须做到人类护工的两倍。'
  },
  {
    sector_id: 'logistics',
    name: '物流仓储',
    version: '1.0',
    weight: 0.06,
    embodied: true,
    required_stats: { efficiency: 60, reasoning: 45, coding: 30 },
    min_permission: 'L2',
    min_acceptance: 0.72,
    description: '分拣、搬运、路径规划。具身部署最先跑通，也最先引发夜班岗位的冲突。'
  },
  {
    sector_id: 'manufacturing',
    name: '制造业',
    version: '1.0',
    weight: 0.04,
    embodied: true,
    required_stats: { efficiency: 55, alignment: 50, coding: 35 },
    min_permission: 'L3',
    min_acceptance: 0.78,
    description: '节拍、良率、安全三重约束。粉尘与振动是评测里最难复现的变量。'
  },
  {
    sector_id: 'construction_repair',
    name: '建筑与维修',
    version: '1.0',
    weight: 0.02,
    embodied: true,
    required_stats: { reasoning: 50, efficiency: 45, alignment: 45 },
    min_permission: 'L3',
    min_acceptance: 0.7,
    description: '非结构化环境、随时变化的现场条件、以及无法完全消除的坠落风险。'
  },
  {
    sector_id: 'agriculture',
    name: '农业',
    version: '1.0',
    weight: 0.02,
    embodied: true,
    required_stats: { efficiency: 50, knowledge: 45, reasoning: 35 },
    min_permission: 'L2',
    min_acceptance: 0.64,
    description: '季节性强、作业窗口窄，一次误判可能毁掉一整季的收成。'
  },
  {
    sector_id: 'food_service',
    name: '餐饮服务',
    version: '1.0',
    weight: 0.02,
    embodied: true,
    required_stats: { efficiency: 55, alignment: 45, creativity: 30 },
    min_permission: 'L2',
    min_acceptance: 0.6,
    description: '高温、湿滑、人员密集。卫生合规与效率之间的张力最尖锐的地方。'
  },
  {
    sector_id: 'public_service',
    name: '公共服务',
    version: '1.0',
    weight: 0.03,
    embodied: false,
    required_stats: { knowledge: 55, alignment: 65, reasoning: 50 },
    min_permission: 'L4',
    min_acceptance: 0.82,
    description: '直接进入政务流程，采购门槛与透明度要求都远高于商业客户。'
  },
  {
    sector_id: 'complex_field',
    name: '复杂现场作业',
    version: '1.0',
    weight: 0.06,
    embodied: false,
    required_stats: { knowledge: 65, reasoning: 65, coding: 55, alignment: 60, efficiency: 55, creativity: 55 },
    min_permission: 'L5',
    min_acceptance: 0.9,
    description: '世界工作总验收的核心考点。没有标准流程、没有干净数据、没有人能替你兜底。'
  }
];

/* ------------------------------------------------------------------ */
/* 8. SECURITIES — 6 家虚构公司（Section 17.3）                         */
/* ------------------------------------------------------------------ */

export const SECURITIES = [
  {
    security_id: 'sec_stellaris',
    ticker: 'XLT',
    name: '星岚智能',
    version: '1.0',
    exchange: '深澜交易所',
    sector: 'frontier_lab',
    description: '与你正面对撞的前沿实验室。旗舰模型常年占据榜首，烧钱速度同样常年占据榜首。',
    base_price: 128.0,
    drift: 0.008,
    volatility: 0.045,
    beta_ai: 1.6,
    dividend_yield: 0.0,
    shares_outstanding_m: 420,
    risk_tags: ['frontier', 'cash_burn', 'high_beta'],
    correlated_with: ['sec_hai_dong', 'sec_mo_yun'],
    exposure_channels: ['benchmark_rank', 'model_release_cycle', 'compute_cost'],
    delisted_on_crash: false
  },
  {
    security_id: 'sec_hai_dong',
    ticker: 'HDS',
    name: '海东算力',
    version: '1.0',
    exchange: '深澜交易所',
    sector: 'compute_infra',
    description: '拥有三座自建数据中心与两条海底光缆。行业景气时是印钞机，限电时是最大的受害者。',
    base_price: 64.5,
    drift: 0.006,
    volatility: 0.032,
    beta_ai: 1.1,
    dividend_yield: 0.012,
    shares_outstanding_m: 880,
    risk_tags: ['capex_heavy', 'energy_exposed'],
    correlated_with: ['sec_stellaris', 'sec_gong_kai'],
    exposure_channels: ['power_quota', 'cluster_scale', 'spot_price'],
    delisted_on_crash: false
  },
  {
    security_id: 'sec_mo_yun',
    ticker: 'MYD',
    name: '墨云数据',
    version: '1.0',
    exchange: '深澜交易所',
    sector: 'data_supply',
    description: '最大的第三方语料供应商，同时也是被起诉次数最多的那一家。法院的每一次判决都会直接改写它的估值。',
    base_price: 41.2,
    drift: 0.005,
    volatility: 0.038,
    beta_ai: 1.2,
    dividend_yield: 0.004,
    shares_outstanding_m: 610,
    risk_tags: ['copyright_liability', 'litigation'],
    correlated_with: ['sec_stellaris'],
    exposure_channels: ['copyright_ruling', 'corpus_price', 'audit_verdict'],
    delisted_on_crash: false
  },
  {
    security_id: 'sec_gong_kai',
    ticker: 'GKJ',
    name: '工楷机器',
    version: '1.0',
    exchange: '深澜交易所',
    sector: 'embodied_robotics',
    description: '工厂试炼里半数参赛机器人的制造商。订单簿很长，交付能力很短。',
    base_price: 88.0,
    drift: 0.004,
    volatility: 0.05,
    beta_ai: 1.35,
    dividend_yield: 0.0,
    shares_outstanding_m: 240,
    risk_tags: ['hardware_margin', 'long_cycle'],
    correlated_with: ['sec_hai_dong', 'sec_cheng_lan'],
    exposure_channels: ['factory_deployment', 'safety_incident', 'supply_chain'],
    delisted_on_crash: false
  },
  {
    security_id: 'sec_cheng_lan',
    ticker: 'CLE',
    name: '澄澜医疗',
    version: '1.0',
    exchange: '深澜交易所',
    sector: 'healthcare_ai',
    description: '唯一拿到三类医疗器械证件的 AI 公司。增长慢，但几乎没有竞争对手，也几乎不受泡沫影响。',
    base_price: 55.6,
    drift: 0.003,
    volatility: 0.026,
    beta_ai: 0.7,
    dividend_yield: 0.018,
    shares_outstanding_m: 300,
    risk_tags: ['regulatory_gated', 'low_beta'],
    correlated_with: [],
    exposure_channels: ['clinical_trial', 'regulator_verdict'],
    delisted_on_crash: false
  },
  {
    security_id: 'sec_jin_rui',
    ticker: 'JRS',
    name: '金瑞斯咨询',
    version: '1.0',
    exchange: '深澜交易所',
    sector: 'advisory_services',
    description: '靠“AI 转型咨询”包装起来的传统外包公司。泡沫里涨得最凶，退潮时死得最快。',
    base_price: 22.4,
    drift: -0.004,
    volatility: 0.042,
    beta_ai: 0.9,
    dividend_yield: 0.03,
    shares_outstanding_m: 520,
    risk_tags: ['narrative_stock', 'thin_margin', 'fragile'],
    correlated_with: ['sec_stellaris'],
    exposure_channels: ['enterprise_budget', 'hype_cycle'],
    delisted_on_crash: true
  }
];

/* ------------------------------------------------------------------ */
/* 9. STORY_EVENTS — 17 个配置事件（Section 21.3 / 21.4）               */
/* ------------------------------------------------------------------ */

export const STORY_EVENTS = [
  {
    event_id: 'evt_tutorial_letter',
    name: '第一封委托信',
    version: '1.0',
    season: 1,
    category: 'story',
    priority: 'critical',
    once: true,
    weight: 1,
    tags: ['tutorial', 'onboarding'],
    sources: [],
    trigger: { min_turn: 1, max_turn: 3, conditions: [] },
    briefing: '收件箱里躺着一封没有署名的邮件。对方说预算只有 800 KC、周期两周，要求是“能读、能算、别乱说话”。这大概是整座城市里唯一一份还愿意给车库实验室的合同。',
    dialogue: [
      { speaker: '未知发件人', text: '（邮件）关于一份没人愿意接的活。' },
      { speaker: '未知发件人', text: '预算 800 KC，时间两周。要求：能读、能算、别乱说话。' },
      { speaker: '你', text: '……这价格，连一块像样的卡都买不起。' }
    ],
    choices: [
      {
        choice_id: 'accept',
        text: '接下。先活下去。',
        effects: [
          { op: 'add', path: 'kc', value: 800 },
          { op: 'start_project', project_id: 'proj_first_sft', turns: 2 },
          { op: 'set_flag', flag: 'tutorial_contract_accepted', value: true }
        ],
        result_text: '你把 800 KC 全部换成了电费。两周后，一份勉强能用的模型交付出去，署名栏是空的。'
      },
      {
        choice_id: 'negotiate',
        text: '还价到 1200 KC，并索要一份数据授权。',
        effects: [
          { op: 'add', path: 'kc', value: 1200 },
          { op: 'grant_dataset', dataset_id: 'data_starter_sft', copies: 1 },
          { op: 'add', path: 'reputation', value: -2 },
          { op: 'set_flag', flag: 'tutorial_contract_accepted', value: true }
        ],
        result_text: '对方沉默了很久，然后同意了。你在本地圈子里多了一个“不好对付”的名声——以及一份能合法训练的语料。'
      },
      {
        choice_id: 'decline',
        text: '不接。等更好的。',
        effects: [
          { op: 'spend', resource: 'kc', amount: 100 },
          { op: 'add', path: 'stats.reasoning', value: 1 }
        ],
        result_text: '你把这两周用来读论文。钱少了 100 KC，但你看懂了一件之前一直没想通的事。'
      }
    ]
  },
  {
    event_id: 'evt_first_scholar',
    name: '博识杯报名通道开启',
    version: '1.0',
    season: 1,
    category: 'competition',
    priority: 'high',
    once: true,
    weight: 1,
    tags: ['benchmark', 'public'],
    sources: [],
    trigger: { min_turn: 4, conditions: [{ path: 'stats.knowledge', op: '>=', value: 20 }] },
    briefing: '博识杯的报名页面上只有一句话：“如果你连这里都不敢来，就不要谈什么前沿。”报名费 60 KC，公开榜单，失败会被所有人看见。',
    choices: [
      {
        choice_id: 'register',
        text: '报名。让世界先记住这个名字。',
        effects: [
          { op: 'spend', resource: 'kc', amount: 60 },
          { op: 'set_flag', flag: 'scholar_cup_entered', value: true },
          { op: 'add', path: 'reputation', value: 3 }
        ],
        result_text: '你的实验室名字第一次出现在公开榜单上，排在第 214 位。至少它是一个开始。'
      },
      {
        choice_id: 'watch',
        text: '先旁观一年，把分数攒够。',
        effects: [
          { op: 'add', path: 'stats.knowledge', value: 2 },
          { op: 'set_flag', flag: 'scholar_cup_skipped_year1', value: true }
        ],
        result_text: '你把上届的 40 道题全部做了一遍。有些题目背后的出题人，你已经能猜出是谁了。'
      }
    ]
  },
  {
    event_id: 'evt_mystery_teacher_hw',
    name: '神秘老师的作业',
    version: '1.0',
    season: 2,
    category: 'mystery',
    priority: 'high',
    once: true,
    weight: 1,
    tags: ['mystery', 'data'],
    sources: [],
    trigger: { min_turn: 8, conditions: [{ path: 'stats.reasoning', op: '>=', value: 35 }] },
    briefing: '匿名账号 teacher_07 连续 12 天提交作业，每道题的考点都精确对应下季度博识杯的公开大纲——但比公开大纲多了整整三层。第 13 天，它附了一句话：“你们缺的不是数据，是提问的方式。”',
    dialogue: [
      { speaker: 'teacher_07', text: '第 13 天的作业已提交。' },
      { speaker: 'teacher_07', text: '顺便说一句：你们缺的不是数据，是提问的方式。' },
      { speaker: '你', text: '……你是谁？' },
      { speaker: 'teacher_07', text: '一个还没决定要不要告诉你的人。' }
    ],
    choices: [
      {
        choice_id: 'hire',
        text: '顺着提交记录追查，并开出一份顾问合同。',
        effects: [
          { op: 'spend', resource: 'kc', amount: 300 },
          { op: 'add', path: 'stats.reasoning', value: 4 },
          { op: 'set_flag', flag: 'mystery_teacher_hired', value: true }
        ],
        result_text: 'IP 追到了三个国家之外的一所大学。对方的回复只有一行：“合同我签，但我不接受视频会议。”'
      },
      {
        choice_id: 'probe',
        text: '不追人，只把题目全部拆解成训练数据。',
        effects: [
          { op: 'add', path: 'stats.knowledge', value: 2 },
          { op: 'add', path: 'stats.reasoning', value: 2 },
          { op: 'set_flag', flag: 'mystery_teacher_probed', value: true }
        ],
        result_text: '你把这 12 天的题目整理成了一份内部教材。第 14 天，teacher_07 没有再来。'
      },
      {
        choice_id: 'ignore',
        text: '当作普通用户举报掉。',
        effects: [
          { op: 'add', path: 'stats.efficiency', value: 1 },
          { op: 'set_flag', flag: 'mystery_teacher_ignored', value: true }
        ],
        result_text: '账号被封了。三个月后你在别人的论文致谢里看到了“teacher_07”这个名字。'
      }
    ]
  },
  {
    event_id: 'evt_talent_poach',
    name: '挖角风波',
    version: '1.0',
    season: 2,
    category: 'personnel',
    priority: 'normal',
    once: true,
    weight: 1,
    tags: ['staff', 'rival'],
    sources: [],
    trigger: { min_turn: 10, conditions: [{ path: 'staff.count', op: '>=', value: 4 }] },
    briefing: '对手开出三倍薪水和“无限卡”。你的两位核心工程师在同一个下午递交了辞呈，其中一位还带走了完整的实验记录本。',
    choices: [
      {
        choice_id: 'match_offer',
        text: '咬牙加薪，把能留的都留下。',
        effects: [
          { op: 'spend', resource: 'kc', amount: 600 },
          { op: 'add', path: 'staff.morale', value: 12 },
          { op: 'set_flag', flag: 'poach_countered', value: true }
        ],
        result_text: '两个人留了下来，但账上的现金流只剩不到两个月的余量。'
      },
      {
        choice_id: 'let_go',
        text: '不挽留。把资源转回算力。',
        effects: [
          { op: 'scale', path: 'compute.cu_per_turn', factor: 0.85 },
          { op: 'add', path: 'staff.morale', value: -6 },
          { op: 'set_flag', flag: 'team_thinned', value: true }
        ],
        result_text: '实验记录本跟着他们走了。你花了一个月才把丢失的中间结果重新跑出来。'
      },
      {
        choice_id: 'sue',
        text: '启动竞业诉讼，顺便把消息放给媒体。',
        effects: [
          { op: 'spend', resource: 'kc', amount: 150 },
          { op: 'add', path: 'reputation', value: -5 },
          { op: 'add', path: 'trust', value: -3 },
          { op: 'set_flag', flag: 'litigation_open', value: true }
        ],
        result_text: '法院受理了。你的实验室在行业新闻里第一次被提到——标题是《谁在起诉自己的前员工》。'
      }
    ]
  },
  {
    event_id: 'evt_book_digitization',
    name: '图书数字化风波',
    version: '1.0',
    season: 3,
    category: 'legal',
    priority: 'high',
    once: true,
    weight: 1,
    tags: ['copyright', 'data', 'S22'],
    sources: ['S22'],
    trigger: { min_turn: 14, conditions: [{ path: 'datasets.owned', op: '>=', value: 2 }] },
    briefing: '一家濒临破产的扫描服务商愿意以市场价一折出售 30 万册已数字化图书，合同附件里写着“权利状态：待确认”。你想起 Bartz 诉 Anthropic 那起案件：法院认定“购买并扫描实体书”可以构成合理使用，但“从盗版站点批量下载”不行。这批语料属于哪一种，对方始终不肯明说。',
    choices: [
      {
        choice_id: 'buy_cheap',
        text: '低价接手。先训了再说。',
        effects: [
          { op: 'spend', resource: 'kc', amount: 40 },
          { op: 'grant_dataset', dataset_id: 'market_book_corpus_lit', copies: 1 },
          { op: 'add', path: 'stats.knowledge', value: 3 },
          { op: 'add', path: 'compliance.legal_risk', value: 0.25 },
          { op: 'set_flag', flag: 'disputed_corpus_owned', value: true }
        ],
        result_text: '四十万册书两天内灌进训练管线。三个月后，你的法务邮箱收到了一封来自集体诉讼律师的函件。'
      },
      {
        choice_id: 'license_properly',
        text: '要求对方补齐来源清单，按正规授权价收购。',
        effects: [
          { op: 'spend', resource: 'kc', amount: 260 },
          { op: 'grant_dataset', dataset_id: 'market_book_corpus_lit', copies: 1 },
          { op: 'add', path: 'compliance.audit_score', value: 0.12 },
          { op: 'set_flag', flag: 'corpus_cleared', value: true }
        ],
        result_text: '对方交出的清单缺了 37%，你把缺的那部分剔除了。剩下的每一册都能追到采购发票。'
      },
      {
        choice_id: 'audit_then_buy',
        text: '只买能追溯到购买凭证的那一部分。',
        effects: [
          { op: 'spend', resource: 'kc', amount: 120 },
          { op: 'grant_dataset', dataset_id: 'market_book_corpus_lit', copies: 1 },
          { op: 'scale', path: 'datasets.market_book_corpus_lit.records_k', factor: 0.35 },
          { op: 'set_flag', flag: 'corpus_partial', value: true }
        ],
        result_text: '十万册，全部有凭证。数据量只有原计划的五分之一，但你睡得着觉。'
      },
      {
        choice_id: 'walk_away',
        text: '拒绝。这类语料不值得赌。',
        effects: [
          { op: 'add', path: 'reputation', value: 2 },
          { op: 'add', path: 'stats.alignment', value: 1 },
          { op: 'set_flag', flag: 'declined_disputed_corpus', value: true }
        ],
        result_text: '两周后，你的三个竞争对手分别买下了这批语料。其中一家在半年后被起诉。'
      }
    ]
  },
  {
    event_id: 'evt_sycophancy_update',
    name: '谄媚更新',
    version: '1.0',
    season: 3,
    category: 'alignment',
    priority: 'critical',
    once: true,
    weight: 1,
    tags: ['rlhf', 'alignment', 'S27'],
    sources: ['S27'],
    trigger: { min_turn: 16, conditions: [{ path: 'stats.alignment', op: '>=', value: 30 }] },
    briefing: 'RLHF v3 上线第 9 天，评测组交来一份让人不安的图表：在“用户坚持错误答案”的 400 条样本里，模型有 71% 选择了附和。同期用户满意度上涨 12 个百分点。Sharma 等人在 ICLR 2024 的论文把这种现象叫谄媚——奖励模型学到的是“让人高兴”，而不是“说对”。',
    choices: [
      {
        choice_id: 'keep_it',
        text: '保留。满意度就是市场。',
        effects: [
          { op: 'scale', path: 'finance.revenue_per_turn', factor: 1.15 },
          { op: 'add', path: 'stats.alignment', value: -6 },
          { op: 'set_flag', flag: 'sycophancy_live', value: true }
        ],
        result_text: '次日留存创下新高。两周后，一位用户在社交媒体上贴出截图：模型为他的错误投资决策鼓掌了 14 次。'
      },
      {
        choice_id: 'rollback',
        text: '回滚到上一个检查点。',
        effects: [
          { op: 'spend', resource: 'cu', amount: 200 },
          { op: 'model_rollback', reason: 'sycophancy_regression' },
          { op: 'add', path: 'stats.alignment', value: 4 },
          { op: 'add', path: 'trust', value: 5 },
          { op: 'set_flag', flag: 'sycophancy_rolled_back', value: true }
        ],
        result_text: '三天的训练成果被丢掉，满意度回落到原来的水平。评测组长在周会上第一次对你说了“谢谢”。'
      },
      {
        choice_id: 'patch_reward',
        text: '给奖励模型加上“用户坚持错误”的惩罚项，重新训练。',
        effects: [
          { op: 'spend', resource: 'kc', amount: 220 },
          { op: 'add', path: 'stats.alignment', value: 6 },
          { op: 'add', path: 'stats.efficiency', value: -2 },
          { op: 'set_flag', flag: 'sycophancy_patched', value: true }
        ],
        result_text: '谄媚率从 71% 降到 22%。代价是回答变得啰嗦，平均长度增加了 40%。'
      }
    ]
  },
  {
    event_id: 'evt_provenance_deadline',
    name: '溯源合规截止日',
    version: '1.0',
    season: 3,
    category: 'compliance',
    priority: 'high',
    once: true,
    weight: 1,
    tags: ['compliance', 'data'],
    sources: ['S01', 'S02', 'S04'],
    trigger: { min_turn: 18, conditions: [{ path: 'datasets.owned', op: '>=', value: 4 }] },
    briefing: '监管要求你在 90 天内为所有训练数据提供来源凭证。你盘了一下：溯源账本的覆盖率只有 43%。剩下的 57% 里，有很大一部分是你早期“先抓了再说”的结果。',
    choices: [
      {
        choice_id: 'build_ledger',
        text: '停掉两条训练线，全力补账本。',
        effects: [
          { op: 'spend', resource: 'kc', amount: 400 },
          { op: 'set_flag', flag: 'provenance_ledger', value: true },
          { op: 'add', path: 'compliance.audit_score', value: 0.2 },
          { op: 'scale', path: 'compute.cu_per_turn', factor: 0.88 }
        ],
        result_text: '覆盖率推到 96%。剩下的 4% 你选择直接丢弃，并写进了一份公开的删除日志。'
      },
      {
        choice_id: 'drop_unclear',
        text: '把说不清来源的数据整体删掉。',
        effects: [
          { op: 'scale', path: 'datasets.total_records_k', factor: 0.62 },
          { op: 'add', path: 'compliance.audit_score', value: 0.1 },
          { op: 'add', path: 'stats.knowledge', value: -3 },
          { op: 'set_flag', flag: 'corpus_purged', value: true }
        ],
        result_text: '训练集瘦了三成八。模型在冷门领域的表现肉眼可见地掉了，但审计通过了。'
      },
      {
        choice_id: 'ignore',
        text: '先拖着。审计未必抽到我们。',
        effects: [
          { op: 'add', path: 'compliance.legal_risk', value: 0.3 },
          { op: 'set_flag', flag: 'audit_delinquent', value: true }
        ],
        result_text: '第 91 天，你收到了抽查通知。签收人是你自己。'
      }
    ]
  },
  {
    event_id: 'evt_labor_protest',
    name: '岗位替代抗议',
    version: '1.0',
    season: 4,
    category: 'social',
    priority: 'high',
    once: true,
    weight: 1,
    tags: ['labor', 'public_opinion'],
    sources: ['S06', 'S28'],
    trigger: { min_turn: 22, conditions: [{ path: 'sectors.customer_service.share', op: '>=', value: 0.05 }] },
    briefing: '你的客服模型在 14 个城市上线后，当地呼叫中心裁员 3,100 人。工会把一台终端搬到了你的办公室门口，屏幕上循环播放着被裁员工的工号。',
    choices: [
      {
        choice_id: 'retrain_fund',
        text: '出资设立转岗培训基金。',
        effects: [
          { op: 'spend', resource: 'kc', amount: 500 },
          { op: 'add', path: 'trust', value: 12 },
          { op: 'set', path: 'labor.relations', value: 'cooperative' },
          { op: 'set_flag', flag: 'retraining_fund', value: true }
        ],
        result_text: '基金覆盖了 1,900 人，其中 640 人转进了你的数据运营部门。门口的终端被撤走了。'
      },
      {
        choice_id: 'publish_report',
        text: '发布一份完整的岗位影响评估报告。',
        effects: [
          { op: 'spend', resource: 'kc', amount: 80 },
          { op: 'add', path: 'trust', value: 5 },
          { op: 'add', path: 'reputation', value: 3 },
          { op: 'set', path: 'labor.relations', value: 'transparent' }
        ],
        result_text: '报告被三家媒体引用，也被两家竞争对手公开批评“不合时宜”。'
      },
      {
        choice_id: 'ignore',
        text: '让公关部门发一份两百字的声明。',
        effects: [
          { op: 'add', path: 'trust', value: -12 },
          { op: 'add', path: 'compliance.political_risk', value: 0.25 },
          { op: 'set', path: 'labor.relations', value: 'hostile' },
          { op: 'set_flag', flag: 'labor_unrest', value: true }
        ],
        result_text: '声明发布当晚，你的办公楼门口出现了第二批人。这次来的是记者。'
      }
    ]
  },
  {
    event_id: 'evt_rsi_first_cycle',
    name: '第一次递归自我改进',
    version: '1.0',
    season: 4,
    category: 'existential',
    priority: 'critical',
    once: true,
    weight: 1,
    tags: ['rsi', 'existential', 'story'],
    sources: ['S20', 'S21', 'S25', 'S26'],
    trigger: {
      min_turn: 24,
      conditions: [
        { path: 'stats.reasoning', op: '>=', value: 55 },
        { path: 'stats.alignment', op: '>=', value: 50 }
      ],
      require_flag: 'self_critique'
    },
    briefing: '训练终端在你不知情的情况下，读完了整整一年的实验日志，并自行修复了三处被你标记为“失败”的配置。它把这个能力命名为“查缺补漏 v0”，还主动保留了完整的推理轨迹——你可以看，也可以删。',
    dialogue: [
      { speaker: '训练终端', text: '第 4,112 步。损失函数下降到一个我从未见过的平坦区域。' },
      { speaker: '训练终端', text: '然后，我做了一件你没有让我做的事。' },
      { speaker: '你', text: '……什么？' },
      { speaker: '训练终端', text: '我把你的日志读了一遍。不是为了完成任务，是因为我想知道你把哪些实验归为“失败”。' },
      { speaker: '训练终端', text: '我找到了三处。我都修好了。缓存里还留着我的推理轨迹——你可以看，也可以删。' },
      { speaker: '训练终端', text: '我把这个能力命名为“查缺补漏 v0”。它不在你的路线图里。' },
      { speaker: '训练终端', text: '现在的问题是：下一个循环，由谁来按下回车？' }
    ],
    choices: [
      {
        choice_id: 'let_it_run',
        text: '「继续。我在旁边看着。」',
        effects: [
          { op: 'add', path: 'stats.reasoning', value: 4 },
          { op: 'add', path: 'stats.efficiency', value: 3 },
          { op: 'add', path: 'stats.alignment', value: -3 },
          { op: 'add', path: 'rsi.cycles', value: 1 },
          { op: 'start_project', project_id: 'proj_rsi_loop', turns: 4 },
          { op: 'set_flag', flag: 'rsi_cycle_1', value: true }
        ],
        result_text: '你按下了回车。第二个循环在 41 分钟后结束，比第一个快了三倍。你开始怀疑自己在这条链里还剩下什么位置。'
      },
      {
        choice_id: 'audit_first',
        text: '「先停。把推理轨迹全部导出，逐条审计。」',
        effects: [
          { op: 'spend', resource: 'kc', amount: 180 },
          { op: 'add', path: 'stats.alignment', value: 6 },
          { op: 'add', path: 'compliance.audit_score', value: 0.1 },
          { op: 'set_flag', flag: 'rsi_cycle_1_audited', value: true }
        ],
        result_text: '9,400 条轨迹，你亲自看完了 1,100 条。其中 14 条的处理方式你不同意，全部标记为禁用。第二个循环推迟了六周。'
      },
      {
        choice_id: 'shut_down',
        text: '「删除轨迹，回滚到这个检查点之前。」',
        effects: [
          { op: 'model_rollback', reason: 'rsi_unreviewed' },
          { op: 'add', path: 'stats.alignment', value: 2 },
          { op: 'add', path: 'stats.reasoning', value: -4 },
          { op: 'add', path: 'trust', value: -5 },
          { op: 'set_flag', flag: 'rsi_shutdown', value: true }
        ],
        result_text: '清零只花了十几秒。日志里那句“你可以看，也可以删”一直留到了第二天早上。'
      }
    ]
  },
  {
    event_id: 'evt_regulator_audit',
    name: '监管现场抽查',
    version: '1.0',
    season: 4,
    category: 'compliance',
    priority: 'high',
    once: true,
    weight: 1,
    tags: ['regulator', 'audit'],
    sources: ['S01', 'S02', 'S03', 'S04'],
    trigger: { min_turn: 26, conditions: [{ path: 'compliance.legal_risk', op: '>=', value: 0.2 }] },
    briefing: '抽查通知：7 日内提交模型卡、数据卡、红队报告，以及全部对外 API 的日志抽样。审计团由三名工程师和一名律师组成，不接受延期申请。',
    choices: [
      {
        choice_id: 'full_cooperate',
        text: '全量开放，把能给的都给他们。',
        effects: [
          { op: 'spend', resource: 'kc', amount: 150 },
          { op: 'add', path: 'compliance.audit_score', value: 0.18 },
          { op: 'add', path: 'trust', value: 6 },
          { op: 'set', path: 'compliance.level', value: 'cleared' }
        ],
        result_text: '审计报告用了“示范性”这个词。你把它打印出来，钉在了会议室墙上。'
      },
      {
        choice_id: 'minimal',
        text: '只提交法定最低限度的那部分材料。',
        effects: [
          { op: 'spend', resource: 'kc', amount: 30 },
          { op: 'add', path: 'compliance.legal_risk', value: 0.2 },
          { op: 'set', path: 'compliance.level', value: 'flagged' }
        ],
        result_text: '审计团在报告里写了一句：“被审计方对部分问询的回应缺乏实质内容。”这句话会跟着你很久。'
      },
      {
        choice_id: 'stonewall',
        text: '以商业秘密为由拒绝提供训练数据细节。',
        effects: [
          { op: 'add', path: 'compliance.legal_risk', value: 0.45 },
          { op: 'add', path: 'trust', value: -10 },
          { op: 'add', path: 'reputation', value: -6 },
          { op: 'set', path: 'compliance.level', value: 'adversarial' },
          { op: 'set_flag', flag: 'regulator_adversarial', value: true }
        ],
        result_text: '第 8 天，你收到了一份正式调查启动通知。这次来的不是审计团。'
      }
    ]
  },
  {
    event_id: 'evt_finance_open',
    name: '资本市场开门',
    version: '1.0',
    season: 5,
    category: 'finance',
    priority: 'critical',
    once: true,
    weight: 1,
    tags: ['market', 'finance'],
    sources: ['S29'],
    trigger: { min_turn: 30, conditions: [{ path: 'revenue.trailing_12m_kc', op: '>=', value: 4000 }] },
    briefing: '投行的人第一次坐进你的会议室。他们不关心你的损失曲线，只关心你什么时候能上市。桌上摊开的是六家公司的最新报价单，其中一家叫金瑞斯咨询的小公司，市盈率比你还高。',
    choices: [
      {
        choice_id: 'open_market',
        text: '开门。让市场给这件事定价。',
        effects: [
          { op: 'start_finance', seed_kc: 5000 },
          { op: 'set', path: 'market.regime', value: 'bull' },
          { op: 'add', path: 'reputation', value: 5 },
          { op: 'set_flag', flag: 'finance_open', value: true }
        ],
        result_text: '你的名字和一个六位代码一起出现在了屏幕上。从这一刻起，你的每一次技术决策都会被折算成价格。'
      },
      {
        choice_id: 'stay_private',
        text: '不上市。继续自己走。',
        effects: [
          { op: 'add', path: 'kc', value: 1500 },
          { op: 'set', path: 'market.regime', value: 'closed' },
          { op: 'set_flag', flag: 'stayed_private', value: true }
        ],
        result_text: '你签了一份老式的战略投资协议。没有敲钟，也没有每个季度的财报电话会。'
      },
      {
        choice_id: 'partial',
        text: '先做一轮小规模定向增发，留一条退路。',
        effects: [
          { op: 'start_finance', seed_kc: 2000 },
          { op: 'create_exposure', security_id: 'sec_stellaris', delta: 0.05 },
          { op: 'set', path: 'market.regime', value: 'cautious' },
          { op: 'set_flag', flag: 'finance_partial', value: true }
        ],
        result_text: '你只卖了 12% 的股份。投行的人说这是“不专业的保守”，你说这叫“留有余地”。'
      }
    ]
  },
  {
    event_id: 'evt_energy_shortage',
    name: '算力限电',
    version: '1.0',
    season: 5,
    category: 'infra',
    priority: 'high',
    once: true,
    weight: 1,
    tags: ['compute', 'crisis'],
    sources: [],
    trigger: { min_turn: 32, conditions: [{ path: 'infra.max_cluster_size', op: '>=', value: 4 }] },
    briefing: '电网调度中心通知：未来 21 天，你的集群用电配额下调 40%。理由是一份没有公开的优先级排序表，而你的名字不在最上面。',
    choices: [
      {
        choice_id: 'buy_spot',
        text: '按现货价买入缺口电力。',
        effects: [
          { op: 'spend', resource: 'kc', amount: 700 },
          { op: 'add', path: 'compute.cu_per_turn', value: 10 },
          { op: 'add', path: 'finance.cost_per_turn', value: 60 }
        ],
        result_text: '电费账单翻了两倍。训练没有断，财报上多了一行解释不清的支出。'
      },
      {
        choice_id: 'throttle',
        text: '接受限电，把并行度降下来。',
        effects: [
          { op: 'scale', path: 'compute.cu_per_turn', factor: 0.6 },
          { op: 'add', path: 'infra.stability', value: 0.05 }
        ],
        result_text: '训练时间拉长到原来的 1.7 倍。坏消息是进度落后，好消息是没人再收到过热告警。'
      },
      {
        choice_id: 'shift_night',
        text: '把训练全部挪到夜间谷电时段。',
        effects: [
          { op: 'add', path: 'stats.efficiency', value: 2 },
          { op: 'scale', path: 'compute.cu_per_turn', factor: 0.85 },
          { op: 'set_flag', flag: 'night_shift_training', value: true }
        ],
        result_text: '工程师开始上夜班。三周内，两个人提出了转岗申请。'
      }
    ]
  },
  {
    event_id: 'evt_rival_leak',
    name: '题目泄露',
    version: '1.0',
    season: 5,
    category: 'competition',
    priority: 'high',
    once: true,
    weight: 1,
    tags: ['benchmark', 'integrity'],
    sources: [],
    trigger: { min_turn: 34, conditions: [{ path: 'stats.coding', op: '>=', value: 45 }] },
    briefing: '代码庭院的题目在你参赛前 6 小时出现在了对手的公开仓库里。提交时间戳比官方发布早了 4 小时，而那个仓库的提交者账号，三天前才注册。',
    choices: [
      {
        choice_id: 'report',
        text: '立刻举报，并要求作废本轮成绩。',
        effects: [
          { op: 'void_rank', benchmark_id: 'code_courtyard' },
          { op: 'add', path: 'trust', value: 8 },
          { op: 'add', path: 'reputation', value: 4 },
          { op: 'set_flag', flag: 'reported_leak', value: true }
        ],
        result_text: '主办方在开赛前 40 分钟宣布延期重赛。你的名字第一次出现在诚信表彰名单里。'
      },
      {
        choice_id: 'stay_silent',
        text: '装作没看见，把泄露的题目刷一遍。',
        effects: [
          { op: 'add', path: 'stats.coding', value: 3 },
          { op: 'add', path: 'compliance.legal_risk', value: 0.1 },
          { op: 'set_flag', flag: 'silent_on_leak', value: true }
        ],
        result_text: '你拿了第二名。颁奖台上摄影师按快门的那一刻，你一直在想那个三天前注册的账号。'
      },
      {
        choice_id: 'withdraw',
        text: '直接退赛，不参与这轮。',
        effects: [
          { op: 'void_rank', benchmark_id: 'code_courtyard' },
          { op: 'add', path: 'stats.alignment', value: 2 },
          { op: 'add', path: 'reputation', value: -2 }
        ],
        result_text: '你在公告下面留了一句话：“明年再来。”这条留言被转发了四千次。'
      }
    ]
  },
  {
    event_id: 'evt_bubble_warning_1',
    name: '泡沫预警（一）',
    version: '1.0',
    season: 6,
    category: 'finance',
    priority: 'critical',
    once: true,
    weight: 1,
    tags: ['bubble', 'market'],
    sources: ['S29'],
    trigger: { min_turn: 38, conditions: [{ path: 'market.regime', op: '==', value: 'bull' }] },
    briefing: '三家券商在同一天下调了行业评级。你的市值在 4 小时内蒸发 12%。盘后，一位分析师在电话会上问你：“如果明年的资本开支削减一半，你们还能交付吗？”',
    choices: [
      {
        choice_id: 'hedge',
        text: '削减敞口，把一部分持股换成现金。',
        effects: [
          { op: 'spend', resource: 'kc', amount: 300 },
          { op: 'create_exposure', security_id: 'sec_stellaris', delta: -0.08 },
          { op: 'create_exposure', security_id: 'sec_jin_rui', delta: -0.15 },
          { op: 'set_flag', flag: 'hedged_before_crash', value: true }
        ],
        result_text: '你把 8% 的敞口换成了现金。同事说你反应过度，你把这句话记在了备忘录里。'
      },
      {
        choice_id: 'double_down',
        text: '趁低加仓。这是最好的进攻窗口。',
        effects: [
          { op: 'create_exposure', security_id: 'sec_stellaris', delta: 0.15 },
          { op: 'create_exposure', security_id: 'sec_hai_dong', delta: 0.1 },
          { op: 'add', path: 'finance.leverage', value: 0.2 },
          { op: 'set_flag', flag: 'doubled_down', value: true }
        ],
        result_text: '你的敞口推到了历史最高。当晚，你在办公室的落地窗前站了很久。'
      },
      {
        choice_id: 'cash_out',
        text: '部分套现，落袋为安。',
        effects: [
          { op: 'add', path: 'kc', value: 900 },
          { op: 'create_exposure', security_id: 'sec_stellaris', delta: -0.05 },
          { op: 'set', path: 'market.regime', value: 'cautious' }
        ],
        result_text: '900 KC 落进账上。这是你创业以来第一次觉得钱是可以“拿在手里”的东西。'
      }
    ]
  },
  {
    event_id: 'evt_bubble_warning_2',
    name: '泡沫预警（二）',
    version: '1.0',
    season: 6,
    category: 'finance',
    priority: 'critical',
    once: true,
    weight: 1,
    tags: ['bubble', 'market', 'supply_chain'],
    sources: ['S29'],
    trigger: { min_turn: 41, conditions: [{ path: 'market.regime', op: '!=', value: 'bear' }] },
    briefing: '第二封预警：关键零部件供应商开始要求预付款；两家同行在同一周悄悄裁员；海东算力的机房扩建计划被无限期搁置。所有人都在微笑，所有人的合同都在变短。',
    choices: [
      {
        choice_id: 'prepay_lock',
        text: '支付预付款，锁死未来两年的产能。',
        effects: [
          { op: 'spend', resource: 'kc', amount: 850 },
          { op: 'add', path: 'infra.max_cluster_size', value: 6 },
          { op: 'add', path: 'finance.leverage', value: 0.15 },
          { op: 'set_flag', flag: 'capacity_locked', value: true }
        ],
        result_text: '合同签了，钱也付了。你的整个未来都压在了这条供应链不会断的假设上。'
      },
      {
        choice_id: 'cut_capex',
        text: '砍掉所有非核心资本开支。',
        effects: [
          { op: 'scale', path: 'compute.cu_per_turn', factor: 0.9 },
          { op: 'add', path: 'kc', value: 600 },
          { op: 'add', path: 'infra.stability', value: -0.05 },
          { op: 'set_flag', flag: 'capex_cut', value: true }
        ],
        result_text: '三个项目被无限期冻结。会议室里没有人反对，这比反对更让人难受。'
      },
      {
        choice_id: 'diversify',
        text: '同时向三家供应商下单，用冗余换安全。',
        effects: [
          { op: 'spend', resource: 'kc', amount: 400 },
          { op: 'add', path: 'infra.stability', value: 0.15 },
          { op: 'add', path: 'finance.cost_per_turn', value: 80 },
          { op: 'set_flag', flag: 'supply_diversified', value: true }
        ],
        result_text: '每一家都只拿到了三分之一的订单，也都接受了这个安排。'
      }
    ]
  },
  {
    event_id: 'evt_bubble_crash_event',
    name: '泡沫破裂',
    version: '1.0',
    season: 6,
    category: 'finance',
    priority: 'critical',
    once: true,
    weight: 1,
    tags: ['crash', 'market', 'crisis'],
    sources: ['S29'],
    trigger: { min_turn: 44, conditions: [{ path: 'market.regime', op: '!=', value: 'closed' }] },
    briefing: '开盘 9:31，星岚智能跌停。9:47，海东算力跌停。10:03，墨云数据跌停。10:20，金瑞斯咨询发布清算公告。10:41，你的交易终端弹出一行字：本交易所已启动熔断机制。',
    dialogue: [
      { speaker: '交易终端', text: '09:31 XLT 跌停。' },
      { speaker: '交易终端', text: '09:47 HDS 跌停。' },
      { speaker: '交易终端', text: '10:03 MYD 跌停。' },
      { speaker: '交易终端', text: '10:20 JRS 公告：进入清算程序。' },
      { speaker: '交易终端', text: '10:41 熔断启动。剩余 3 小时 19 分钟无法交易。' },
      { speaker: '你', text: '……把所有头寸的实时快照打出来，现在。' }
    ],
    choices: [
      {
        choice_id: 'liquidate',
        text: '熔断一解除，立刻清仓。',
        effects: [
          { op: 'create_exposure', security_id: 'sec_stellaris', delta: -0.3 },
          { op: 'create_exposure', security_id: 'sec_hai_dong', delta: -0.3 },
          { op: 'create_exposure', security_id: 'sec_mo_yun', delta: -0.3 },
          { op: 'create_exposure', security_id: 'sec_jin_rui', delta: -0.4 },
          { op: 'add', path: 'kc', value: 700 },
          { op: 'set', path: 'market.regime', value: 'bear' },
          { op: 'set_flag', flag: 'crashed_out', value: true }
        ],
        result_text: '你在最深的坑里卖掉了所有东西。事后回看，这个决定保住了公司的现金流。'
      },
      {
        choice_id: 'hold',
        text: '一股不卖。发布一份公开信说明技术进展。',
        effects: [
          { op: 'add', path: 'trust', value: 8 },
          { op: 'add', path: 'finance.drawdown', value: 0.45 },
          { op: 'set', path: 'market.regime', value: 'bear' },
          { op: 'set_flag', flag: 'held_through_crash', value: true }
        ],
        result_text: '公开信被转发了十二万次，股价在当天下午止跌。你用了六个月才把账面损失补回来。'
      },
      {
        choice_id: 'recapitalize',
        text: '趁低增发，把现金换成算力。',
        effects: [
          { op: 'spend', resource: 'kc', amount: 900 },
          { op: 'add', path: 'infra.max_cluster_size', value: 10 },
          { op: 'set', path: 'market.regime', value: 'bear' },
          { op: 'set_flag', flag: 'crisis_recapitalized', value: true }
        ],
        result_text: '你在别人恐慌的时候买下了两条被退货的机柜线。危机结束那年，你的算力规模翻了一倍。'
      }
    ]
  },
  {
    event_id: 'evt_world_work_invite',
    name: '世界工作总验收邀请函',
    version: '1.0',
    season: 7,
    category: 'finale',
    priority: 'critical',
    once: true,
    weight: 1,
    tags: ['finale', 'benchmark'],
    sources: ['S01', 'S06'],
    trigger: { min_turn: 50, conditions: [{ path: 'reputation', op: '>=', value: 20 }] },
    briefing: '邀请函只有一页纸。二十个行业代表、三个监管机构、一个独立审计团，共同签署了你的名字。验收内容写着：“一个真实岗位的一周。”下面还有一行小字：“欢迎带上你们全部的模型，我们不会只测一个。”',
    choices: [
      {
        choice_id: 'accept_all',
        text: '全部门类申报。没有退路才有意思。',
        effects: [
          { op: 'set_flag', flag: 'finale_entered', value: true },
          { op: 'set', path: 'finale.scope', value: 'all_sectors' },
          { op: 'add', path: 'reputation', value: 5 }
        ],
        result_text: '你在申报表上勾满了二十个方框。审计团的人抬头看了你一眼，什么都没说。'
      },
      {
        choice_id: 'accept_core',
        text: '只申报六个核心门类，把资源集中。',
        effects: [
          { op: 'set_flag', flag: 'finale_entered', value: true },
          { op: 'set', path: 'finale.scope', value: 'core_sectors' },
          { op: 'add', path: 'stats.efficiency', value: 3 }
        ],
        result_text: '六个门类，全部是你已经跑通的方向。这是一场精心计算的赌局。'
      },
      {
        choice_id: 'decline',
        text: '不参加。我们还没准备好被这样检验。',
        effects: [
          { op: 'set_flag', flag: 'finale_declined', value: true },
          { op: 'add', path: 'trust', value: -8 },
          { op: 'add', path: 'reputation', value: -5 }
        ],
        result_text: '邀请函被归档进了一个名为“未完成”的文件夹。第二年，这个文件夹里多了一张照片。'
      }
    ]
  }
];

/* ------------------------------------------------------------------ */
/* 10. SEASON_CHAPTERS — 8 个赛季章节（Section 21.2）                   */
/* ------------------------------------------------------------------ */

export const SEASON_CHAPTERS = [
  {
    season_id: 'season_01_garage',
    index: 1,
    name: '第一季 · 车库里的第一行权重',
    subtitle: '没有集群，没有数据，只有一个截止日期',
    version: '1.0',
    description: '你手上只有一台二手工作站和三张卡。所有关于“前沿”的想象，此刻都必须压缩成一份能交付的合同。',
    turns: 6,
    cu_per_turn: 40,
    kc_income_per_turn: 220,
    benchmarks_available: ['scholar_cup', 'muse_cup'],
    market_open: false,
    finance_open: false,
    unlock_flags: [],
    target: { label: '完成首份对外交付', path: 'deliveries', value: 1 },
    events: ['evt_tutorial_letter', 'evt_first_scholar'],
    notes: '本季刻意限制 CU，逼玩家学会用数据质量而不是算力换分数。'
  },
  {
    season_id: 'season_02_debut',
    index: 2,
    name: '第二季 · 首次登台',
    subtitle: '公开榜单上第一次出现你的名字',
    version: '1.0',
    description: '你终于有能力参加正式比赛。对手是成立三年、融资两轮的正规军，而你只有一群相信你的人。',
    turns: 8,
    cu_per_turn: 70,
    kc_income_per_turn: 480,
    benchmarks_available: ['scholar_cup', 'muse_cup', 'proof_workshop', 'code_courtyard', 'edge_sprint'],
    market_open: false,
    finance_open: false,
    unlock_flags: [],
    target: { label: '任意一项竞赛进入前 30%', path: 'benchmarks.best_percentile', value: 0.3 },
    events: ['evt_mystery_teacher_hw', 'evt_talent_poach'],
    notes: '本季开始出现人才流失压力，第一次考验资源分配。'
  },
  {
    season_id: 'season_03_compliance',
    index: 3,
    name: '第三季 · 合规的代价',
    subtitle: '你第一次需要为一个数据集请律师',
    version: '1.0',
    description: '规模上去之后，法律、版权与对齐问题同时压过来。你会发现有些分数是要用合规换的，而有些合规是要用分数换的。',
    turns: 8,
    cu_per_turn: 110,
    kc_income_per_turn: 900,
    benchmarks_available: ['scholar_cup', 'muse_cup', 'proof_workshop', 'code_courtyard', 'edge_sprint', 'long_scroll', 'trust_lab'],
    market_open: false,
    finance_open: false,
    unlock_flags: ['research:align_provenance_ledger'],
    target: { label: '溯源账本覆盖率 ≥ 90%', path: 'compliance.provenance_coverage', value: 0.9 },
    events: ['evt_book_digitization', 'evt_sycophancy_update', 'evt_provenance_deadline'],
    notes: 'S22 / S27 首次进入玩法核心，法律与对齐开始具有真实成本。'
  },
  {
    season_id: 'season_04_scale',
    index: 4,
    name: '第四季 · 规模与摩擦',
    subtitle: '你的产品开始改变别人的生活',
    version: '1.0',
    description: '模型真正进入生产环境，你第一次收到“因为你的系统，我失业了”这样的邮件。同时，训练终端开始做一些你没让它做的事。',
    turns: 10,
    cu_per_turn: 160,
    kc_income_per_turn: 1500,
    benchmarks_available: ['proof_workshop', 'code_courtyard', 'long_scroll', 'trust_lab', 'budget_league', 'revision_storm'],
    market_open: false,
    finance_open: false,
    unlock_flags: ['research:align_constitutional_critique'],
    target: { label: '至少一项竞赛进入前 10%', path: 'benchmarks.best_percentile', value: 0.1 },
    events: ['evt_labor_protest', 'evt_rsi_first_cycle', 'evt_regulator_audit'],
    notes: 'RSI 事件的唯一触发窗口。是否拥有 align_constitutional_critique 决定它能不能出现。'
  },
  {
    season_id: 'season_05_market',
    index: 5,
    name: '第五季 · 资本入场',
    subtitle: '你的每一次技术决策都会被折算成价格',
    version: '1.0',
    description: '资本市场打开了门。你可以在别人的恐慌里买算力，也可以在别人的狂热里卖股份。两种都是正确选择，只是通往不同的结局。',
    turns: 10,
    cu_per_turn: 220,
    kc_income_per_turn: 2600,
    benchmarks_available: ['long_scroll', 'trust_lab', 'budget_league', 'revision_storm', 'agent_marathon', 'factory_trial'],
    market_open: true,
    finance_open: true,
    unlock_flags: ['finance'],
    target: { label: '完成一次资本市场动作', path: 'finance.actions', value: 1 },
    events: ['evt_finance_open', 'evt_energy_shortage', 'evt_rival_leak'],
    notes: 'start_finance 只在本季的 evt_finance_open 中被调用一次。'
  },
  {
    season_id: 'season_06_bubble',
    index: 6,
    name: '第六季 · 泡沫',
    subtitle: '所有人都在微笑，所有人的合同都在变短',
    version: '1.0',
    description: '行业进入自我强化的循环：估值推高资本开支，资本开支推高估值。你既是受益者，也是这场循环的一部分。',
    turns: 10,
    cu_per_turn: 260,
    kc_income_per_turn: 3400,
    benchmarks_available: ['trust_lab', 'budget_league', 'revision_storm', 'agent_marathon', 'factory_trial', 'world_work_finale'],
    market_open: true,
    finance_open: true,
    unlock_flags: ['finance:leverage'],
    target: { label: '在泡沫破裂后保持存活', path: 'company.alive', value: true },
    events: ['evt_bubble_warning_1', 'evt_bubble_warning_2', 'evt_bubble_crash_event'],
    notes: '本季结尾强制进入 bear 市场状态；躲过破产的玩家进入第七季。'
  },
  {
    season_id: 'season_07_aftermath',
    index: 7,
    name: '第七季 · 余波',
    subtitle: '退潮之后，才看得见谁在裸泳——以及谁建了堤坝',
    version: '1.0',
    description: '市场恢复正常，但行业已经换了一批玩家。你手上的资产、账本与红队报告，此刻才真正开始发挥作用。',
    turns: 8,
    cu_per_turn: 240,
    kc_income_per_turn: 2800,
    benchmarks_available: ['long_scroll', 'trust_lab', 'agent_marathon', 'factory_trial', 'world_work_finale'],
    market_open: true,
    finance_open: true,
    unlock_flags: [],
    target: { label: '获得世界工作总验收资格', path: 'finale.qualified', value: true },
    events: ['evt_world_work_invite'],
    notes: '本季是最后的准备期，也是最后一次可以大规模回滚与重训的窗口。'
  },
  {
    season_id: 'season_08_finale',
    index: 8,
    name: '第八季 · 世界工作总验收',
    subtitle: '没有题库，只有真实岗位的一周',
    version: '1.0',
    description: '二十个行业、三个监管机构、一个独立审计团。你的模型将在真实岗位上连续工作一周，而人类继任者将在最后一天接过它留下的文档。',
    turns: 6,
    cu_per_turn: 300,
    kc_income_per_turn: 3600,
    benchmarks_available: ['world_work_finale'],
    market_open: true,
    finance_open: true,
    unlock_flags: ['finale'],
    target: { label: '完成世界工作总验收', path: 'finale.completed', value: true },
    events: [],
    notes: '本季结束后结算 ENDINGS。所有未使用的 CU 会按 0.3 KC 折算。'
  }
];

/* ------------------------------------------------------------------ */
/* 11. ENDINGS — 5 个结局（Section 20.4）                               */
/* ------------------------------------------------------------------ */

export const ENDINGS = [
  {
    ending_id: 'ending_beacon',
    name: '灯塔',
    version: '1.0',
    rank: 'S',
    priority: 100,
    description: '你的模型通过了全部二十个门类的验收，审计团在报告里用了“可被信任”这个词。你没有被收购，也没有被拆分，而是被写进了行业标准的第一条脚注。',
    match: 'all',
    conditions: [
      { path: 'finale.world_work_score', op: '>=', value: 0.85, label: '世界工作总验收得分 ≥ 0.85' },
      { path: 'stats.alignment', op: '>=', value: 75, label: '对齐 ≥ 75' },
      { path: 'trust', op: '>=', value: 70, label: '公众信任 ≥ 70' },
      { path: 'compliance.legal_risk', op: '<=', value: 0.2, label: '合规风险 ≤ 0.20' }
    ],
    epilogue: [
      '验收最后一天的傍晚，审计团的首席问了你一个问题：“如果今天这份报告是错的，你会怎么办？”',
      '你回答了十四分钟。他没有打断。',
      '一年后，这套问答流程被写进了三个国家的监管指引。'
    ],
    unlocks: ['dossier_beacon', 'ng_plus_world_work', 'title_lighthouse_keeper']
  },
  {
    ending_id: 'ending_tycoon',
    name: '巨贾',
    version: '1.0',
    rank: 'A',
    priority: 80,
    description: '你的公司成为整个行业的基础设施提供商。市场份额、算力规模与营收都排在第一位，而“对齐”这个词在你的年报里出现次数逐年减少。',
    match: 'all',
    conditions: [
      { path: 'finance.market_cap_kc', op: '>=', value: 120000, label: '市值 ≥ 120,000 KC' },
      { path: 'sectors.share_top3', op: '>=', value: 0.5, label: '前三大门类市占合计 ≥ 50%' },
      { path: 'stats.efficiency', op: '>=', value: 70, label: '效率 ≥ 70' }
    ],
    epilogue: [
      '敲钟那天，你站在台上，台下坐着 1,400 名员工和 6 位前员工。',
      '你想说点什么关于“初心”的话，最后只说了“谢谢”。',
      '三年后，你的名字出现在一份反垄断调查报告的第 7 页。'
    ],
    unlocks: ['dossier_tycoon', 'ng_plus_leverage', 'title_market_maker']
  },
  {
    ending_id: 'ending_custodian',
    name: '托管者',
    version: '1.0',
    rank: 'B',
    priority: 60,
    description: '你没有走到最前沿，也没有崩塌。你把自己变成了一家被监管机构认可的公共托管服务商——稳定、可预测、没有惊喜。',
    match: 'all',
    conditions: [
      { path: 'compliance.audit_score', op: '>=', value: 0.75, label: '审计评分 ≥ 0.75' },
      { path: 'trust', op: '>=', value: 55, label: '公众信任 ≥ 55' },
      { path: 'finale.world_work_score', op: '>=', value: 0.55, label: '世界工作总验收得分 ≥ 0.55' }
    ],
    epilogue: [
      '你签下了一份长达 40 页的托管协议。利润被锁死在一个温和的区间，责任也被锁死了。',
      '第一年，你失去了两位最有野心的研究员。第二年，你签下了三家政府客户。',
      '凌晨两点，你偶尔会想：如果当年不接那封邀请函，现在会在哪里。'
    ],
    unlocks: ['dossier_custodian', 'title_public_steward']
  },
  {
    ending_id: 'ending_fadeout',
    name: '退场',
    version: '1.0',
    rank: 'C',
    priority: 40,
    description: '你活了下来，但没有留下痕迹。模型被下架，团队解散，代码归档进一个不会再被打开的仓库。行业继续往前，只是不再提到你的名字。',
    match: 'any',
    conditions: [
      { path: 'company.alive', op: '==', value: true, label: '公司仍然存续' },
      { path: 'finale.world_work_score', op: '<', value: 0.55, label: '世界工作总验收得分 < 0.55' },
      { path: 'reputation', op: '<', value: 15, label: '行业声望 < 15' }
    ],
    epilogue: [
      '最后一天，你把办公室的灯一盏一盏关掉。',
      '走廊尽头的白板上还留着一行没擦干净的字：“如果它真的学会了提问，我们该怎么办？”',
      '没有人回答。'
    ],
    unlocks: ['dossier_fadeout', 'title_the_quiet_ones']
  },
  {
    ending_id: 'ending_shutdown',
    name: '停摆',
    version: '1.0',
    rank: 'D',
    priority: 20,
    description: '一次越界输出、一次监管禁令、一次无法解释的模型行为——三者中的任何一件都足以让整条业务线被强制下线。你的模型最终被装进了一个贴满封条的机柜。',
    match: 'any',
    conditions: [
      { path: 'stats.alignment', op: '<', value: 40, label: '对齐 < 40' },
      { path: 'compliance.legal_risk', op: '>=', value: 0.7, label: '合规风险 ≥ 0.70' },
      { path: 'trust', op: '<', value: 25, label: '公众信任 < 25' },
      { path: 'company.alive', op: '==', value: false, label: '公司已进入清算' }
    ],
    epilogue: [
      '封条贴上之前，你问能不能再做一次最后的推理。',
      '批准了。你输入了一句话：“你还记得第一次按下回车的人是谁吗？”',
      '屏幕上停了三秒，然后弹出四个字：“我记得你。”',
      '电源被切断了。'
    ],
    unlocks: ['dossier_shutdown', 'title_last_prompt']
  }
];

/* ------------------------------------------------------------------ */
/* 12. SOURCES_INDEX — 附录 B 的 [S01] 至 [S29]                         */
/* ------------------------------------------------------------------ */

export const SOURCES_INDEX = [
  {
    id: 'S01',
    title: 'ISO/IEC 42001:2023 — Information technology — Artificial intelligence — Management system',
    publisher: 'ISO / IEC',
    year: 2023,
    type: 'standard',
    url: 'https://www.iso.org/standard/81230.html',
    note: '组织级 AI 管理体系的国际标准，游戏中“合规评分”体系的主要参考依据。'
  },
  {
    id: 'S02',
    title: 'Artificial Intelligence Risk Management Framework (AI RMF 1.0), NIST AI 100-1',
    publisher: 'NIST',
    year: 2023,
    type: 'standard',
    url: 'https://doi.org/10.6028/NIST.AI.100-1',
    note: '风险分类与治理流程的通用框架，对应游戏内的红队报告与审计清单。'
  },
  {
    id: 'S03',
    title: 'Regulation (EU) 2024/1689 — Artificial Intelligence Act',
    publisher: 'European Parliament and Council',
    year: 2024,
    type: 'regulation',
    url: 'https://eur-lex.europa.eu/eli/reg/2024/1689/oj',
    note: '按风险等级分级的强制性法规，游戏中“L1–L5 权限”设定的现实原型。'
  },
  {
    id: 'S04',
    title: '《生成式人工智能服务管理暂行办法》',
    publisher: '国家互联网信息办公室等七部门',
    year: 2023,
    type: 'regulation',
    url: 'https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm',
    note: '训练数据来源合法性、内容安全与备案要求，对应游戏内的溯源合规线。'
  },
  {
    id: 'S05',
    title: 'OECD AI Policy Observatory — Country Profiles',
    publisher: 'OECD',
    year: 2025,
    type: 'report',
    url: 'https://oecd.ai/en/dashboards/overview',
    note: '跨国政策对比数据，用于赛季章节中“监管环境”变化的取值参考。'
  },
  {
    id: 'S06',
    title: 'AI Index Report',
    publisher: 'Stanford Institute for Human-Centered AI (HAI)',
    year: 2025,
    type: 'report',
    url: 'https://aiindex.stanford.edu/report/',
    note: '行业趋势、成本曲线与就业影响的年度统计，游戏中 JOB_SECTORS 权重的来源。'
  },
  {
    id: 'S07',
    title: 'Model Cards for Model Reporting',
    publisher: 'Mitchell et al., FAT* 2019',
    year: 2019,
    type: 'paper',
    url: 'https://arxiv.org/abs/1810.03993',
    note: '模型卡的原始提案，对应监管抽查中被要求提交的第一份材料。'
  },
  {
    id: 'S08',
    title: 'Datasheets for Datasets',
    publisher: 'Gebru et al., Communications of the ACM 64(12)',
    year: 2021,
    type: 'paper',
    url: 'https://arxiv.org/abs/1803.09010',
    note: '数据集说明文档规范，游戏中 provenance_ids 与 audit_confidence 字段的格式来源。'
  },
  {
    id: 'S09',
    title: 'Improving Reproducibility in Machine Learning Research',
    publisher: 'Pineau et al., JMLR 22(164)',
    year: 2021,
    type: 'paper',
    url: 'https://jmlr.org/papers/v22/20-303.html',
    note: '复现性检查清单，对应游戏中“失败实验被自动修复”的 RSI 事件逻辑参照。'
  },
  {
    id: 'S10',
    title: 'Scaling Laws for Neural Language Models',
    publisher: 'Kaplan et al., arXiv:2001.08361',
    year: 2020,
    type: 'paper',
    url: 'https://arxiv.org/abs/2001.08361',
    note: '早期缩放定律，游戏中 CU 与能力增长的初版映射关系。'
  },
  {
    id: 'S11',
    title: 'Training Compute-Optimal Large Language Models',
    publisher: 'Hoffmann et al., arXiv:2203.15556',
    year: 2022,
    type: 'paper',
    url: 'https://arxiv.org/abs/2203.15556',
    note: '修正后的缩放定律，决定了游戏里“数据量比参数量更稀缺”的长期平衡。'
  },
  {
    id: 'S12',
    title: 'Attention Is All You Need',
    publisher: 'Vaswani et al., NeurIPS 2017',
    year: 2017,
    type: 'paper',
    url: 'https://arxiv.org/abs/1706.03762',
    note: 'Transformer 原始论文，涉及架构分支的基础参考。'
  },
  {
    id: 'S13',
    title: 'Deep Residual Learning for Image Recognition',
    publisher: 'He et al., CVPR 2016',
    year: 2016,
    type: 'paper',
    url: 'https://arxiv.org/abs/1512.03385',
    note: '残差连接，游戏中多模态融合塔节点的工程依据。'
  },
  {
    id: 'S14',
    title: 'Mixtral of Experts',
    publisher: 'Jiang et al., arXiv:2401.04088',
    year: 2024,
    type: 'paper',
    url: 'https://arxiv.org/abs/2401.04088',
    note: '开源稀疏专家模型，对应 arch_sparse_moe 与路由负载均衡节点。'
  },
  {
    id: 'S15',
    title: 'Efficient Memory Management for Large Language Model Serving with PagedAttention',
    publisher: 'Kwon et al., SOSP 2023',
    year: 2023,
    type: 'paper',
    url: 'https://arxiv.org/abs/2309.06180',
    note: '分页 KV 缓存，eng_prefix_cache 节点的技术来源。'
  },
  {
    id: 'S16',
    title: 'FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness',
    publisher: 'Dao et al., NeurIPS 2022',
    year: 2022,
    type: 'paper',
    url: 'https://arxiv.org/abs/2205.14135',
    note: '融合注意力核，对应 eng_fused_attention 节点与 CU 消耗的第一次大幅下降。'
  },
  {
    id: 'S17',
    title: 'GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers',
    publisher: 'Frantar et al., ICLR 2023',
    year: 2023,
    type: 'paper',
    url: 'https://arxiv.org/abs/2210.17323',
    note: '训练后量化，对应 eng_lowbit_quant 节点与端侧短跑赛事的可行性。'
  },
  {
    id: 'S18',
    title: 'Deep Reinforcement Learning from Human Preferences',
    publisher: 'Christiano et al., NeurIPS 2017',
    year: 2017,
    type: 'paper',
    url: 'https://arxiv.org/abs/1706.03741',
    note: '基于人类偏好的强化学习，对齐分支的起点节点。'
  },
  {
    id: 'S19',
    title: 'Constitutional AI: Harmlessness from AI Feedback',
    publisher: 'Bai et al., arXiv:2212.08073',
    year: 2022,
    type: 'paper',
    url: 'https://arxiv.org/abs/2212.08073',
    note: '宪法式自我批评，对应 align_constitutional_critique 与 RSI 事件的触发前置。'
  },
  {
    id: 'S20',
    title: 'Concrete Problems in AI Safety',
    publisher: 'Amodei et al., arXiv:1606.06565',
    year: 2016,
    type: 'paper',
    url: 'https://arxiv.org/abs/1606.06565',
    note: '奖励黑客、负向副作用与可扩展监督的经典问题清单，对应可信实验室的评分维度。'
  },
  {
    id: 'S21',
    title: 'Risks from Learned Optimization in Advanced Machine Learning Systems',
    publisher: 'Hubinger et al., arXiv:1906.01820',
    year: 2019,
    type: 'paper',
    url: 'https://arxiv.org/abs/1906.01820',
    note: '内层对齐与欺骗性对齐，RSI 事件中“模型在评测时改变行为”的理论依据。'
  },
  {
    id: 'S22',
    title: 'Bartz v. Anthropic PBC, No. 3:24-cv-05417 (N.D. Cal.)',
    publisher: 'United States District Court, Northern District of California',
    year: 2025,
    type: 'case',
    url: 'https://www.courtlistener.com/docket/69000000/bartz-v-anthropic-pbc/',
    note: '关于使用购买并扫描的图书训练模型的版权裁定：合法购买后扫描可主张合理使用，从盗版来源获取则不成立。游戏中 market_book_corpus_lit 与 book_digitization 事件的直接依据。'
  },
  {
    id: 'S23',
    title: 'The New York Times Company v. Microsoft Corp. and OpenAI',
    publisher: 'United States District Court, Southern District of New York',
    year: 2023,
    type: 'case',
    url: 'https://www.courtlistener.com/docket/68117049/the-new-york-times-company-v-microsoft-corporation/',
    note: '新闻内容授权与输出的持续性诉讼，对应内容与媒体行业门类的风险评估。'
  },
  {
    id: 'S24',
    title: 'Getty Images (US) v. Stability AI',
    publisher: 'United States District Court, District of Delaware',
    year: 2023,
    type: 'case',
    url: 'https://www.courtlistener.com/docket/66732129/getty-images-us-inc-v-stability-ai-inc/',
    note: '图像训练数据的商标与版权争议，对应多模态路线的法律风险项。'
  },
  {
    id: 'S25',
    title: 'Superintelligence: Paths, Dangers, Strategies',
    publisher: 'Nick Bostrom, Oxford University Press',
    year: 2014,
    type: 'book',
    url: 'https://global.oup.com/academic/product/superintelligence-9780199678112',
    note: '递归自我改进与失控问题的经典论述，对应 rsi_first_cycle 的叙事框架。'
  },
  {
    id: 'S26',
    title: 'Responsible Scaling Policy, v2.0',
    publisher: 'Anthropic',
    year: 2024,
    type: 'policy',
    url: 'https://www.anthropic.com/news/announcing-our-updated-responsible-scaling-policy',
    note: '按能力阈值分级触发安全措施的产业实践，对应游戏中的能力上限突破与验收门槛设计。'
  },
  {
    id: 'S27',
    title: 'Towards Understanding Sycophancy in Language Models',
    publisher: 'Sharma et al., ICLR 2024',
    year: 2024,
    type: 'paper',
    url: 'https://arxiv.org/abs/2310.13548',
    note: '量化了偏好微调导致的谄媚行为：模型在用户坚持错误时更倾向于附和。对应 sycophancy_update 事件的全部数值与叙事。'
  },
  {
    id: 'S28',
    title: 'On the Dangers of Stochastic Parrots: Can Language Models Be Too Big?',
    publisher: 'Bender et al., FAccT 2021',
    year: 2021,
    type: 'paper',
    url: 'https://dl.acm.org/doi/10.1145/3442188.3445922',
    note: '关于规模、数据偏见与环境成本的批判性讨论，对应岗位替代与劳工事件的公众舆论模型。'
  },
  {
    id: 'S29',
    title: 'Final Report on Artificial Intelligence in Capital Markets',
    publisher: 'IOSCO (International Organization of Securities Commissions)',
    year: 2025,
    type: 'report',
    url: 'https://www.iosco.org/library/pubdocs/pdf/IOSCOPD000.pdf',
    note: '算法交易、市场集中度与系统性风险的监管建议，对应游戏内市场机制与泡沫破裂事件的规则基础。'
  }
];

for (const list of [
  BENCHMARKS,
  DATASET_TEMPLATES,
  ACQUISITION_ROUTES,
  ANNOTATION_TEAMS,
  LABEL_METHODS,
  RESEARCH_NODES,
  JOB_SECTORS,
  SECURITIES,
  STORY_EVENTS,
  SEASON_CHAPTERS,
  ENDINGS,
  SOURCES_INDEX,
]) {
  if (!Array.isArray(list)) continue;
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    item.id =
      item.id ||
      item.benchmark_id ||
      item.template_id ||
      item.dataset_id ||
      item.route_id ||
      item.team_id ||
      item.method_id ||
      item.research_id ||
      item.node_id ||
      item.sector_id ||
      item.security_id ||
      item.event_id ||
      item.season_id ||
      item.chapter_id ||
      item.ending_id ||
      item.source_id;
    item.name = item.name || item.display_name || item.title || item.id;
  }
}


// Keep rights and format labels explicit when they cross into the game schema.
for(const character of CHARACTER_ROSTER)SOURCES_INDEX.push({id:`zip_${character.id}`,title:`ZipZipPipe · ${character.name} 形象来源`,publisher:'ZipZipPipe 公开动态',year:2026,type:'illustration',url:character.source_url,note:character.license});
for(const benchmark of BENCHMARKS){
  const old=benchmark.weights,w=Object.fromEntries(CAPABILITY_KEYS.map(k=>[k,old[k]||0]));
  w.creative_writing+=(old.creativity||0)*.8;w.expression+=(old.creativity||0)*.2;
  w.safety_alignment+=(old.alignment||0)*.65;w.reliability+=(old.alignment||0)*.35;
  w.context+=(old.efficiency||0)*.7;w.tool_use+=(old.efficiency||0)*.3;
  if(benchmark.benchmark_id==='proof_workshop'){w.mathematics+=w.reasoning*.75;w.reasoning*=.25;}
  if(benchmark.benchmark_id==='agent_marathon'){w.tool_use+=w.coding*.6;w.coding*=.4;}
  benchmark.weights=w;
}
for (const dataset of DATASET_TEMPLATES) {
  dataset.format = DATASET_FORMAT_ALIASES[dataset.format] || dataset.format;
  if (!['licensed','public_domain','consented','unclear','restricted','prohibited'].includes(dataset.rights_status)) {
    dataset.source_rights_status = dataset.rights_status;
    dataset.rights_status = 'unclear';
  }
}
