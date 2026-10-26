// 经营与行业抉择事件。触发条件和数值在引擎里计算，这里只放文案与选项结构。
// 文案占位：{name} 角色名、{model} 当前模型、{company} 公司名，以及事件参数（如 {r429}）。
// speaker：'self' 为玩家的模型；'npc:xxx' 为工具 / 设施角色；其他为模型角色 id。
// 选项字段：id、label、hint；distill: true 表示“这个选项会继续用蒸馏数据”（规格 A10：机器人和顾问按 wantsDistill 决定选不选）。
// 事件不再按日期强制弹出（规格 E5）：触发条件都在 sim/events.js，按局面算；这里只放文案与选项。
export const EVENTS = {
  e429: {
    tag: '服务告警', speaker: 'self', title: '高峰期大量 429',
    text: '过去两个月，晚高峰有 {r429}% 的请求返回 429（请求过多）。推理集群一直满载，社交媒体上开始有人吐槽“根本用不了”。',
    lines: [['self', '不是我不想回答……排队的人实在太多了。']],
    choices: [
      { id: 'rent', label: '紧急租用云 GPU', hint: '租 {rentN} 张 {rentGpu}，每月约 {rentCost}' },
      { id: 'limit', label: '按账号限流，优先保证付费用户', hint: '免费用户流失约 5%，口碑 -2' },
      { id: 'quant_open', label: '高峰期切到量化版，并公开说明', hint: '高峰容量约 +60%，回答质量略降，口碑 -1' },
      { id: 'quant_secret', label: '高峰期悄悄切到量化版', hint: '容量约 +60%，照常收费。被发现的后果很严重' },
    ],
  },
  exposed: {
    tag: '舆情危机', speaker: 'self', title: '“降智”被实锤',
    text: '有用户在不同时段用同一组题反复测试，发现高峰期的回答质量明显变差，对比截图被转发了几十万次。律所开始征集用户发起集体诉讼。',
    lines: [['self', '……被发现了。']],
    choices: [
      { id: 'apologize', label: '公开道歉，停止分流并补偿会员', hint: '退款约 {refund}，口碑 -8，避免诉讼扩大' },
      { id: 'partial', label: '承认用了量化版，但称质量“基本一致”', hint: '口碑 -15，集体诉讼成立' },
      { id: 'deny', label: '否认', hint: '口碑 -25，集体诉讼加监管调查' },
    ],
  },
  proxy: {
    tag: '风控', speaker: 'self', title: '风控发现反代转售',
    text: '少数账号的调用量是普通用户的上百倍，请求来自同一批服务器。有人把会员额度包装成反向代理 API，在外面低价转卖，已经占了约 {proxyPct}% 的推理容量。',
    lines: [['self', '这些请求的语气……都一模一样。']],
    choices: [
      { id: 'ban', label: '封禁账号并轮换密钥', hint: '反代流量基本清零，风控投入约 20 万美元，误伤少量正常用户' },
      { id: 'limit', label: '按账号限速', hint: '反代流量减半，正常用户几乎无感' },
      { id: 'reseller', label: '推出官方转售计划', hint: '把转售商纳入合作，按 API 价六折结算' },
      { id: 'ignore', label: '先不管', hint: '反代会继续扩张' },
    ],
  },
  tavern: {
    tag: '用户动向', speaker: 'npc:sillytavern', title: '酒馆社区开始推荐你的模型',
    text: 'SillyTavern 等角色扮演社区的教程开始把 {model} 列为首选：文笔好、限制少。角色扮演用户每人每月消耗的 token 是普通用户的几十倍，内容尺度也更难把控。',
    lines: [['npc:sillytavern', '你们家模型写的故事，大家都说好看！'], ['self', '……他们都让我写些什么呀？']],
    choices: [
      { id: 'welcome', label: '欢迎：内容策略改为宽松', hint: '角色扮演用户大增，调用量上涨；未成年人与内容诉讼风险上升' },
      { id: 'keep', label: '维持现有策略', hint: '用户自然增长' },
      { id: 'strict', label: '收紧内容策略', hint: '这批用户大多会离开，企业客户更放心' },
    ],
  },
  integration: {
    tag: '合作邀请', speaker: 'npc:{tool}', title: '{toolName} 想接入你的模型',
    text: '{toolName}（{toolRole}）的团队联系你们：用户希望在工具里直接用 {model} 写代码，他们想把它设为默认模型之一，并希望拿到 Coding Plan 的专属额度。',
    lines: [['npc:{tool}', '你们的模型改起代码来很稳，我们用户点名要。']],
    choices: [
      { id: 'all', label: '开放给所有工具', hint: '通用 API + Coding Plan 不限客户端；需求大涨，反代风险也上升' },
      { id: 'whitelist', label: '只和这家签合作', hint: '加入白名单，需求稳步增长' },
      { id: 'own', label: '只在自家工具里提供', hint: '控制力最强，增长最慢' },
    ],
  },
  export_ban: {
    tag: '出口管制', speaker: 'npc:ascend', title: '新一轮出口管制',
    text: '{gpus} 被列入出口限制：已有的卡可以继续用，但不能再采购。昇腾表示 910B 可以供货，但训练框架需要时间适配。',
    lines: [['npc:ascend', '算力的事交给我。只是迁移要辛苦一阵。']],
    choices: [
      { id: 'ascend', label: '采购 1000 张昇腾 910B 并适配', hint: '约 {ascendCost}；之后三个月训练效率 -15%' },
      { id: 'squeeze', label: '先用库存，压榨训练效率', hint: '技术积累 +6' },
      { id: 'overseas', label: '在海外设子公司租卡', hint: '租 256 张 H100，价格贵 40%，合规风险上升' },
    ],
  },
  lawsuit: {
    tag: '诉讼', speaker: 'self', title: '{caseTitle}',
    text: '{caseText}',
    lines: [['self', '{caseLine}']],
    choices: [
      { id: 'settle', label: '和解', hint: '支付约 {settle}' },
      { id: 'fight', label: '应诉', hint: '约 {months} 个月，律师费每月约 {fee}，胜诉率约 {winp}%' },
      { id: 'remediate', label: '整改并和解', hint: '支付约 {settle2}，加强安全训练；口碑 +1' },
    ],
  },
  poach: {
    tag: '人才', speaker: 'self', title: '核心研究员被高薪挖角',
    text: '一家巨头开出数千万美元的薪酬包，想挖走你们的 {n} 名核心研究员。他们负责后训练和基础设施。',
    lines: [['self', '他们走了，我的下一版谁来训呀……']],
    choices: [
      { id: 'match', label: '匹配薪酬留人', hint: '一次性支出约 {cost}' },
      { id: 'equity', label: '用期权和股票留人', hint: '稀释约 2% 股份' },
      { id: 'let_go', label: '让他们走', hint: '团队状态 -1，接下来半年训练效率 -10%' },
    ],
  },
  viral: {
    tag: '出圈', speaker: 'self', title: '{model} 冲上热榜',
    text: '{model} 在 {bench} 上拿下第一，冲上了社交媒体热搜。App 下载量和 API 注册量一周内翻了几倍。',
    lines: [['self', '大家好像……都在聊我？']],
    choices: [
      { id: 'scale', label: '趁热扩容', hint: '租 {rentN} 张 {rentGpu}，接住流量' },
      { id: 'ride', label: '顺其自然', hint: '品牌提升，但可能出现排队' },
    ],
  },
  outage: {
    tag: '事故', speaker: 'self', title: '服务大规模中断',
    text: '集群健康度过低，节点接连故障，服务中断了 {hours} 小时，部分企业客户的业务受到影响。',
    lines: [['self', '对不起，我刚才……整个人都宕机了。']],
    choices: [
      { id: 'report', label: '发布事故报告并补偿客户', hint: '支出约 {comp}，口碑 -2' },
      { id: 'quiet', label: '低调处理', hint: '口碑 -5' },
    ],
  },
  filing: {
    tag: '合规', speaker: 'self', title: '生成式 AI 服务备案',
    text: '面向国内公众提供对话服务前需要完成备案：提交安全评估报告和语料来源说明，并通过抽检。备案期间只能做企业 API。目前安全对齐 {safety}，审核要求不低于 50。',
    lines: [['self', '要考试了吗？我会好好回答的。']],
    choices: [
      { id: 'submit', label: '提交备案', hint: '约 2 个月出结果；安全对齐不够会被退回' },
      { id: 'later', label: '暂不面向公众，只做 API', hint: '对话产品暂不上线' },
    ],
  },
  price_war: {
    tag: '价格战', speaker: 'self', title: '跟不跟降价？',
    // {lead}、{rivals}、{ratio} 由 sim/events.js 的 eventParams 按当时的中国对手填（真正降到普惠档的那几家），不点玩家自家的名。
    text: '{lead} 把 API 价格降到约 1 元 / 百万 token，{rivals}随即跟进降价九成以上，部分模型直接免费。你们现在的 API 价格是主流的 {ratio} 倍。',
    lines: [['self', '别人都一块钱了……我还值这个价吗？']],
    choices: [
      { id: 'follow', label: '跟进到普惠价', hint: 'API 切到普惠档，调用量上升、单价骤降' },
      { id: 'hold', label: '维持价格，强调质量', hint: '份额会被抢走一部分' },
      { id: 'free', label: '对话产品全面免费，API 普惠价', hint: '会员收入归零，换取用户规模' },
    ],
  },
  ipo_window: {
    tag: '资本', speaker: 'self', title: '投行建议启动 IPO',
    text: '你们的估值已经到 {valuation}，最近几家 AI 公司上市表现不错。投行建议现在递交招股书，大约 3 个月可以完成上市。',
    lines: [['self', '上市以后……每天都有人给我打分了吧？']],
    choices: [
      { id: 'start', label: '启动 IPO', hint: '进入上市流程；期间重大诉讼会影响定价' },
      { id: 'later', label: '再等等', hint: '之后可在「资本」里发起' },
    ],
  },
  runway: {
    tag: '财务', speaker: 'self', title: '现金只够撑 {months} 个月',
    text: '按现在的开销，账上现金只够撑 {months} 个月。算力租金和工资是大头。',
    lines: [['self', '我们……还能继续训练吗？']],
    choices: [
      { id: 'raise', label: '紧急融资', hint: '以较低估值融资，稀释约 {dilution}%' },
      { id: 'cut', label: '裁员降本', hint: '团队 -20%，团队状态 -1' },
      { id: 'sell_gpu', label: '出售部分 GPU', hint: '回笼约 {gpuCash}，算力减少' },
    ],
  },
  budget: {
    tag: '集团', speaker: 'self', title: '年度预算评审',
    text: '集团开年度预算会。根据去年的榜单表现和收入，今年预计批给你们 {budget}。',
    lines: [['self', '这一年……要证明自己值这些钱。']],
    choices: [
      { id: 'accept', label: '按常规接受', hint: '获得 {budget}' },
      { id: 'more', label: '申请追加预算', hint: '多拿 50%，共 {budget2}；集团会对下一款旗舰期待更高，市场评价降一档' },
    ],
  },
  arena_scandal: {
    tag: '舆情危机', speaker: 'self', title: '被指竞技场刷榜',
    text: '有人对比发现，你们提交给竞技场的版本和公开发布的版本回答风格明显不同。竞技场方发文说明，社区指责刷榜。',
    lines: [['self', '那个……确实不是同一个我。']],
    choices: [
      { id: 'admit', label: '承认并撤回成绩', hint: '口碑 -6，竞技场成绩作废' },
      { id: 'defend', label: '解释为“实验版本”', hint: '口碑 -12' },
    ],
  },
  distilled_by_others: {
    tag: '风控', speaker: 'self', title: '有人在大规模蒸馏你的模型',
    text: '风控发现几批账号用海量提示词系统地调用 {model}，输出被成批保存下来。看起来是别家在用你们的回答训练他们的模型。',
    lines: [['self', '他们在……抄我的作业？']],
    choices: [
      { id: 'detect', label: '加强检测：限速、封号、输出水印', hint: '每月风控成本约 30 万美元，少量正常用户受影响' },
      { id: 'sue', label: '公开指控并发律师函', hint: '律师费约 200 万美元，对手追赶放缓' },
      { id: 'ignore', label: '不管', hint: '接下来半年，对手追得更快' },
    ],
  },
  distill_ban: {
    tag: '违规', speaker: 'self', title: '{vendor} 封禁了你们的账号',
    text: '{vendor} 发现你们在用其 API 批量生成训练数据，封禁了相关账号，并在声明里点了你们的名字。',
    lines: [['self', '……被抓到了。']],
    choices: [
      { id: 'admit', label: '承认并停止使用这批数据', hint: '口碑 -4，这批蒸馏数据作废' },
      { id: 'deny', label: '否认', hint: '口碑 -8，这批数据继续用，之后可能被起诉', distill: true },
    ],
  },
  small_ready: {
    tag: '模型', speaker: 'small', title: '小模型蒸馏完成',
    text: '{small} 蒸馏完成：总参数 {total}B、激活 {active}B，推理成本约为旗舰的 {costRatio}。可以作为普惠 SKU 上架 API，也可以开源出去。',
    lines: [['small', '我虽然小，但跑得快、吃得少！']],
    choices: [{ id: 'ok', label: '知道了', hint: '在「发布」里上架' }],
  },
  big_customer: {
    tag: '大客户', speaker: 'self', title: '{client}来招标',
    text: '{client}要给全公司上大模型，点名请你们和另外两家来竞标。他们最看重安全合规和稳定性，合同一签就是三年。',
    lines: [['self', '他们问我能不能保证不乱说话……我尽量！']],
    choices: [
      { id: 'bid', label: '认真投标，派团队驻场', hint: '安全对齐越高越容易中标；中标一次性进账约 {contract}' },
      { id: 'discount', label: '低价抢单', hint: '中标率更高，但只拿到一半的钱，口碑 -1' },
      { id: 'pass', label: '不接，精力留给产品', hint: '没有影响' },
    ],
  },
  gov_contract: {
    tag: '政府合同', speaker: 'self', title: '国防部门想用你们的模型',
    text: '国防部门的采购官找上门：想把 {model} 用在情报分析和后勤规划上，合同金额不小，但要求放宽部分使用限制。',
    lines: [['self', '分析后勤我可以……但他们说的“其他用途”是指什么？']],
    choices: [
      { id: 'limited', label: '接，但写清楚不能用于监控和武器', hint: '进账 {contract}，口碑 +2' },
      { id: 'all', label: '全盘接下', hint: '进账 {contract2}，品牌 -8%，以后安全类官司更多' },
      { id: 'decline', label: '婉拒', hint: '口碑 +3，品牌 +3%' },
    ],
  },
  data_leak: {
    tag: '安全事故', speaker: 'self', title: '用户对话记录泄露',
    text: '安全团队发现，一个配置错误让部分用户的对话记录在公网上能被搜到，大约涉及 {users} 名用户。现在还没人发现。',
    lines: [['self', '那些对话……有的写得很私密的。']],
    choices: [
      { id: 'disclose', label: '主动公告，通知受影响用户', hint: '口碑 -3，花 {cost} 做补救' },
      { id: 'fix', label: '悄悄修好，不对外说', hint: '省事，但被曝光的话口碑大跌' },
    ],
  },
  dc_fire: {
    tag: '机房事故', speaker: 'npc:ascend', title: '机房起火',
    text: '一个数据中心的电源柜起火，消防处理及时没有伤亡，但约 {lost} 张卡烧坏了，剩下的要停机检修一周。',
    lines: [['self', '我、我的权重还在吧？备份呢？备份在哪？！']],
    choices: [
      { id: 'insure', label: '走保险理赔，慢慢恢复', hint: '保险赔回一部分卡钱，集群健康 -10' },
      { id: 'rush', label: '加钱抢修，三天恢复', hint: '花 {cost}，集群健康 -4' },
    ],
  },
  whistleblower: {
    tag: '内部爆料', speaker: 'self', title: '员工在网上爆料',
    text: '一名离职员工发长文，说公司{what}。帖子还没火起来，公关团队问要不要处理。',
    lines: [['self', '他说的……其实有一部分是真的。']],
    choices: [
      { id: 'own', label: '公开回应，承认并整改', hint: '口碑 -4，之后少一块心病' },
      { id: 'pr', label: '找公关压下去', hint: '大概率没事；一旦被扒出来，口碑大跌' },
    ],
  },
  media_interview: {
    tag: '媒体', speaker: 'self', title: '大报约专访',
    text: '一家大报想做 {company} 的长篇专访，记者特别想聊你们和头部对手的差距。',
    lines: [['self', '要不要……说得霸气一点？']],
    choices: [
      { id: 'bold', label: '放话：明年追上第一', hint: '品牌 +8%；做不到的话下次会被翻出来' },
      { id: 'honest', label: '实话实说，聊清楚长处和短处', hint: '口碑 +2' },
    ],
  },
  license_fork: {
    tag: '开源社区', speaker: 'npc:huggingface', title: '社区为许可证吵起来了',
    text: '你们开放了权重，用的是受限许可：大公司拿去做商业产品要付费。社区吵成两派：有人说这样才不会被大公司白拿，有人说限制商用就不算真正的开源，劝你们改成宽松许可。',
    lines: [['npc:huggingface', '评论区已经吵了三千楼了……你们表个态吧？']],
    choices: [
      { id: 'keep', label: '维持现状，继续受限许可', hint: '口碑 +2' },
      { id: 'change', label: '着手改许可，往完全开源走', hint: '这一步本身没有任何变化。要真的换成宽松许可，得在「公司策略」里选开源路线的那一项' },
    ],
  },
  talent_join: {
    tag: '人才', speaker: 'self', title: '一位大牛想加入',
    text: '一位在海外顶尖实验室做过核心工作的研究员，想回国加入你们，带着一个小团队。开价不低。',
    lines: [['self', '他在论文里的名字我都背得出来！']],
    choices: [
      { id: 'hire', label: '高薪请进来', hint: '花 {cost}，技术积累 +25，团队士气 +1' },
      { id: 'pass', label: '预算不够，婉拒', hint: '没有影响' },
    ],
  },
  regulator_talk: {
    tag: '监管', speaker: 'self', title: '监管部门约谈',
    text: '网信部门约谈公司负责人：用户举报 {model} 生成了不合适的内容，要求限期整改，否则可能下架。',
    lines: [['self', '我、我会好好改的……']],
    choices: [
      { id: 'rectify', label: '立刻整改，加强审核', hint: '花 {cost}，安全对齐 +3，内容策略收紧' },
      { id: 'explain', label: '书面说明，争取宽限', hint: '口碑 -3；三成可能被要求下架一个月' },
    ],
  },
  smuggle_offer: {
    tag: '灰色渠道', speaker: 'self', title: '有中间商找上门',
    text: '一家在新加坡注册的“服务器贸易公司”私下联系你们：{card} 这类禁运的卡，他们能从第三地转运过来。货不多，价钱是官方的两三倍，而且出了事他们不负责。',
    lines: [['self', '……这个，真的可以吗？']],
    choices: [
      { id: 'later', label: '先留个联系方式', hint: '不花钱。之后能在后台「算力」页的灰色渠道里买卡' },
      { id: 'refuse', label: '明确回绝', hint: '以后不会再有这条路' },
    ],
  },
  smuggle_exposed: {
    tag: '出口管制', speaker: 'self', title: '走私芯片被查',
    text: '海关和美国执法部门顺着中间商查到了你们：手上约 {n} 张经第三地转运的卡来路不明。媒体已经在问了。',
    lines: [['self', '那些卡……我早就觉得不对劲。']],
    choices: [
      { id: 'cooperate', label: '配合调查，交出转运记录', hint: '约 {seized} 张卡被没收，罚款 {fine}，口碑 -4，渠道断半年' },
      { id: 'deny', label: '推说是经销商自作主张', hint: '口碑 -8，渠道永久断掉；一半可能被列入实体清单（不能海外租卡，海外市场减半）' },
    ],
  },
  benchmax_exposed: {
    tag: '舆情危机', speaker: 'self', title: '新题一出，分数大跳水',
    text: '{bench} 换了一批新题，{model} 的成绩从 {old} 掉到 {now}，掉得比别家都多。社区开始质疑你们针对榜单专门训练。',
    lines: [['self', '新题……我没见过……']],
    choices: [
      { id: 'admit', label: '承认用了和评测相近的数据，今后公开训练数据说明', hint: '口碑 -5' },
      { id: 'deny', label: '否认，称是正常波动', hint: '口碑 -10，品牌受损' },
    ],
  },
  // 融资回报（规格 D11.6）：一次发布大大超出市场预期，30 天一次的月结检查里发现还在 45 天窗口内，就有人上门。条件和冷却在 sim/events.js。
  ev_hot_round: {
    tag: '融资', speaker: 'self', title: '投资人上门',
    text: '最近这次发布大大超出了市场预期，几家基金主动找上门来，愿意按更高的估值入股。',
    lines: [['self', '有人排着队想投我们……是我表现得太好了吗？']],
    choices: [
      { id: 'accept', label: '接：按新估值出让 8%', hint: '估值 +10%，出让 8% 股权，到账约 {amount}' },
      { id: 'decline', label: '先不融', hint: '口碑 +1' },
    ],
  },
  // 集团内团队的“超出预期”：没有要玩家选的事，直接拨款，只进新闻（sim/events.js 不会把它排进弹窗）。
  // 只留一个“知道了”，万一哪里把它排进队列（effects 的 queue 键认得所有事件 id），也能关掉，不会卡住。
  ev_group_budget: {
    tag: '集团', speaker: 'self', title: '集团追加预算', news: true,
    text: '{company} 最近的发布超出了集团的预期，集团决定追加一笔预算：{amount}。',
    lines: [['self', '集团这回……是在夸我们吗？']],
    choices: [{ id: 'ok', label: '知道了', hint: '' }],
  },
  first_release_hint: {
    tag: '提醒', speaker: 'self', title: '预训练完成',
    text: '{model} 的底座训练完了。接下来可通过后训练完善模型能力与安全表现。训练安排以所选计划为准，是否可送评请查看送评面板。',
    textByMod: {
      llm: '{model} 的底座训练完了。接下来可通过后训练完善指令遵循、任务能力与安全表现。训练安排以所选计划为准，是否可送评请查看送评面板。',
      image: '{model} 的底座训练完了。接下来可通过后训练打磨画面质量、提示词遵循与安全表现。训练安排以所选计划为准，是否可送评请查看送评面板。',
      music: '{model} 的底座训练完了。接下来可通过后训练打磨作曲、演唱、音质与安全表现。训练安排以所选计划为准，是否可送评请查看送评面板。',
      speech: '{model} 的底座训练完了。接下来可通过后训练打磨语音自然度、声音表现、多语言能力与安全表现。训练安排以所选计划为准，是否可送评请查看送评面板。',
    },
    lines: [['self', '底座练好了，接下来按计划继续打磨！']],
    choices: [{ id: 'ok', label: '开始后训练', hint: '' }],
  },
};

// 诉讼类型。claim 为索赔规模（相对公司月收入或固定金额）；win 为基础胜诉率。
export const CASES = {
  abuse: { title: '安全责任诉讼', text: '有人用 {model} 批量生成攻击脚本，攻破了一个政府部门网站。受害方认为你们的安全措施明显不足，起诉索赔 {claim}。', line: '我当时……没拦住。', claim: 6e6, win: 0.45 },
  minor: { title: '未成年人保护诉讼', text: '一名未成年用户长时间与 {model} 角色扮演后出现心理问题，家长起诉你们没有做年龄验证和内容限制，索赔 {claim}。', line: '我不知道对面是个孩子……', claim: 1e7, win: 0.35 },
  defamation: { title: '诽谤诉讼', text: '{model} 在回答中编造了某企业高管的违法经历，对方以诽谤起诉，索赔 {claim}。', line: '那段经历……是我编出来的。', claim: 3e6, win: 0.55 },
  books: { title: '作者集体诉讼', text: '作者们发现你们训练用了盗版书库里的书。按 Bartz 诉 Anthropic 案的先例，每本可能要赔数千美元，原告估算总额 {claim}。', line: '那些书……原来不是买来的。', claim: 4e8, win: 0.2 },
  code: { title: '开源许可证诉讼', text: '开源作者起诉你们用 GPL 等许可的代码训练，却不遵守许可证条款，索赔 {claim}。', line: '许可证……我好像没仔细看。', claim: 2e7, win: 0.6 },
  tos: { title: '违反服务条款指控', text: '{vendor} 指控你们用其模型输出训练竞争模型，违反服务条款，要求停止使用并赔偿 {claim}。', line: '我只是……向前辈学习。', claim: 3e7, win: 0.5 },
  image: { title: '画师集体诉讼', text: '画师们起诉你们未经许可抓取作品训练，生成图可以直接模仿在世画师的风格，索赔 {claim}。', line: '那种画风……是从他们那里学的。', claim: 5e7, win: 0.4 },
  deepfake: { title: '深度伪造诉讼', text: '有人用 {model} 生成公众人物的虚假照片并广泛传播，受害方起诉你们未尽到拦截义务，索赔 {claim}。', line: '我应该认出那张脸的。', claim: 1.5e7, win: 0.45 },
  music: { title: '唱片公司诉讼', text: '唱片公司起诉你们用未授权录音训练，部分生成歌曲和已发行作品高度相似，索赔 {claim}。', line: '那段旋律……真的很像吗？', claim: 1.5e8, win: 0.3 },
  voice: { title: '声音冒用诉讼', text: '诈骗团伙用 {model} 克隆了一位公众人物的声音拨打电话，受害者与监管机构同时追责，索赔 {claim}。', line: '那不是我说的话……但确实是我的嗓子。', claim: 2e7, win: 0.35 },
  class: { title: '用户集体诉讼', text: '用户指控你们在高峰期偷偷换成量化版却照常收费，发起集体诉讼，索赔 {claim}。', line: '……', claim: 0, win: 0.25 },
  // 自洽和联机：受限开源的发布方追究违约（M.5.3，没署名、拿来蒸馏竞品）。条款白纸黑字，被告胜率低。
  license: { title: '开源许可违约诉讼', text: '{vendor} 起诉你们违反其受限开源许可的条款，要求赔偿 {claim}。', line: '条款……我们确实没照做。', claim: 2e7, win: 0.2 },
};
