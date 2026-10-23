// 超事件：玩家做到少见的事时出现的虚构大事件（不改写史实，只演绎“你的公司”这条历史线）。
// 每个只出现一次，月度结算时检查（只认开局之后的变化：开局第一次月结时已经成立的，算开局前就做到了，悄悄记下、不弹），落到下个月的某一天全屏演出。
// “谁先做到”只由里程碑负责（规格 E4）：和里程碑重复的“推理先行者”“开源之王”已删除，“东方登顶”并进“新王登基”，是中国公司的文案变体（cn）。
// when(s, c)：c 是引擎算好的局面（c.q 在线旗舰综合分、c.rank 在全部对手里的名次、c.router OpenRouter 名次、c.sv 上月服务数据、
//   c.sota 玩家持有的 SOTA 标签 { holder, model, days, lead, rivals }，见 sim/super.js）。
// 文案占位：{company} 公司名、{model} 在线模型、{name} 角色名、{date} 当月，以及 params 里的数字。
// effects：走统一的 applyEffects（规格 E1）；不凭空加估值、加技术积累。cn：中国公司的文案变体（标题、正文、短剧、选项文字）。
// action：真实操作，和手动操作走同一套命令和限制（引擎 superActionPlan）。做不到时选项置灰并写原因；具体张数、价钱由引擎补进提示。
//   { cmd: 'rentGpus' }                      按现在的负载租卡（在途订单、共享的每月租卡配额）
//   { cmd: 'setTier', product, dir }         产品价格调一档，客户按新价格重新选
//   { cmd: 'setInferShare', add, max }       自用算力中的服务占比加 add，最多到 max
//   { cmd: 'buyGpus', cashShare }            拿不超过 cashShare 的现金买现在买得到的卡（占季度配额，到货前不加算力）
// 每个超事件都有一个不花钱的选项（带 action 的另有一个什么都不动的“观望”）。
export const SUPER_EVENTS = [
  {
    id: 'super_sota', bg: 'launch', title: '新王登基',
    // 规格 E4：玩家的旗舰持有算数的 SOTA 标签满 30 天、领先世界最强 1.0 以上、这款是开局之后发布的、这个模态至少有 3 家对手发布过。
    when: (s, c) => !!c.sota && c.sota.days >= 30 && c.sota.lead >= 1 && c.sota.rivals >= 3,
    text: '{model} 拿到最强的名头已经一个月了，而且领先得不止一点。各家评测平台同时更新，你们的名字挂在第一行。',
    scene: [
      { who: 'narr', text: '{date}，几个主流评测平台几乎同时刷新：综合第一那一行，写的是{company}。' },
      { who: 'self', emo: '震惊', text: '等一下……是我？不是榜单抓错数据了吧？' },
      { who: 'narr', text: '投资人的电话从早上打到半夜，对手的工程师在社交媒体上发了一句“恭喜”。' },
      { who: 'self', emo: '得意', text: '嘿嘿，第一名的位置坐起来还挺舒服的嘛。' },
      { who: 'self', emo: '认真', text: '不过大家接下来都会盯着我打。下一版得更稳才行。' },
    ],
    choices: [
      { id: 'gala', label: '开一场发布会，趁热打铁', effects: { brand: 1.15, cash: -3e6 }, result: '发布会的直播回放一周就破了千万播放。' },
      { id: 'quiet', label: '低调，继续干活', effects: { morale: 1 }, result: '团队只开了一瓶香槟，第二天照常上班。' },
    ],
    cn: {
      title: '东方登顶',
      text: '一家中国公司的模型稳稳坐上了全球综合第一，而且领先得不止一点。海外媒体连夜改标题，国内的朋友圈被 {model} 刷屏。',
      scene: [
        { who: 'narr', text: '{date}，全球综合榜更新。排在第一的，是一家中国公司：{company}。' },
        { who: 'self', emo: '兴奋', text: '我们……我们登顶了！卡那么少，居然真的做到了！' },
        { who: 'narr', text: '有人翻出你们几年前在论坛里抱怨“没卡用”的帖子，配上了今天的榜单截图。' },
        { who: 'self', emo: '委屈', text: '那个帖子能不能别再转了，好丢人的……' },
        { who: 'self', emo: '认真', text: '算了，丢人也值。接下来出口管制只会更紧，得早点想好下一步。' },
      ],
      choices: [
        { id: 'gala', label: '借势出海，开一场海外发布会', effects: { brand: 1.15, cash: -3e6 }, result: '海外开发者社区开始讨论怎么接入你们的 API。' },
        { id: 'quiet', label: '先稳住国内，继续干活', effects: { rep: 2, morale: 1 }, result: '国内用户觉得你们没飘，口碑更好了。' },
      ],
    },
  },
  {
    id: 'super_small_giant', bg: 'gala', title: '以小博大',
    when: (s, c) => s.company.tier === 'small' && c.q !== null && c.rank <= 5,
    text: '几十个人的小团队，做出了能排进全球前五的模型。媒体开始用“以小博大”形容你们。',
    scene: [
      { who: 'narr', text: '{date}，综合榜前五里出现了一个陌生的名字：{model}。' },
      { who: 'self', emo: '开心', text: '前五！我们公司的人加起来还没人家一个组多欸。' },
      { who: 'narr', text: '好几家大厂的招聘负责人同时给你们的工程师发了私信。' },
      { who: 'self', emo: '慌张', text: '等等，别挖人啊！我们好不容易才凑齐这几个人！' },
    ],
    choices: [
      { id: 'raise', label: '趁热融资，给团队发期权', effects: { raise: 0.1, morale: 1 }, result: '新一轮投资人排着队进场，期权让大家安心留下。' },
      { id: 'focus', label: '不理会，专心做下一版', effects: { morale: 1 }, result: '团队闷头干活，下一版的想法越来越清楚。' },
    ],
  },
  {
    id: 'super_router', bg: 'datacenter', title: '全网都在调用',
    when: (s, c) => c.router === 1,
    text: '你们的模型登上了 OpenRouter 周调用量第一。开发者在社交媒体上晒账单：“又便宜又好用，换不回去了。”',
    scene: [
      { who: 'narr', text: '{date}，OpenRouter 的周调用量榜单上，第一名换成了 {model}。' },
      { who: 'self', emo: '兴奋', text: '一周几万亿 token！这些都是大家在实打实地用我！' },
      { who: 'narr', text: '运维群里的告警从下午开始就没停过。' },
      { who: 'self', emo: '慌张', text: '等、等等，推理集群的负载曲线怎么竖起来了……' },
    ],
    choices: [
      { id: 'scale', label: '下单加租推理卡', action: { cmd: 'rentGpus' }, effects: { rep: 3 } },
      { id: 'price', label: '旗舰 API 提一档价格，挡一挡流量', action: { cmd: 'setTier', product: 'api', dir: 1 }, effects: { brand: 0.97 } },
      { id: 'hold', label: '价格和算力都先不动，看看负载', result: '团队盯着负载曲线，定价和算力都没动。' },
    ],
  },
  {
    id: 'super_ipo_pop', bg: 'exchange', title: '敲钟',
    when: s => !!s.capital.listed && (s.capital.listed.pop || 0) >= 1.25,
    text: '{company} 上市首日股价大涨，收盘市值比发行价高出 {pop}%。交易所大厅的屏幕上，你们的代码一整天都是红的。',
    scene: [
      { who: 'narr', text: '{date}，交易所大厅。钟声响起的那一刻，股价直接跳了上去。' },
      { who: 'self', emo: '震惊', text: '涨、涨了这么多？大家是不是把我当成别家了？' },
      { who: 'narr', text: '早期员工的手机一直在震，有人已经开始算能换几套房了。' },
      { who: 'self', emo: '认真', text: '股价高是好事，可接下来每个季度都要交成绩单了。' },
    ],
    choices: [
      { id: 'hire', label: '用募来的钱大举招人', effects: { team: 1.2 }, result: '招聘页挂出了上百个岗位，简历多到 HR 看不过来。' },
      { id: 'buyback', label: '稳一点，留着钱过冬', effects: { rep: 3 }, result: '分析师觉得你们很克制，给了个“买入”评级。' },
    ],
  },
  {
    id: 'super_comeback', bg: 'exchange', title: '绝境翻盘',
    when: s => s.seen?.runway > 0 && s.company.kind !== 'division' && (s.flags.minVal || Infinity) > 0 && s.valuation >= 4 * (s.flags.minVal || Infinity),
    text: '一年前账上的钱只够撑几个月，现在 {company} 的估值翻了好几倍。媒体把你们写成了“最惊险的翻盘”。',
    scene: [
      { who: 'narr', text: '{date}，财经媒体的专题标题是：《从差点发不出工资，到估值翻几倍》。' },
      { who: 'self', emo: '哭', text: '那段时间我每天都在算还能活几个月……' },
      { who: 'self', emo: '开心', text: '现在终于可以说一句：我们挺过来了！' },
      { who: 'narr', text: '当初拒绝过你们的投资人，这周发来了三封邮件。' },
    ],
    choices: [
      { id: 'thank', label: '给老员工发一笔奖金', effects: { cash: -2e6, morale: 2 }, result: '大家收到奖金的时候，好几个人哭了。' },
      { id: 'grow', label: '扩招研究团队，准备下一代模型', effects: { team: 1.1 }, result: '下一代模型的立项会开到了深夜，招聘页也挂了出来。' },
      { id: 'hold', label: '先不花钱，把现金流养稳', effects: { morale: 1 }, result: '账上的钱先留着，团队心里踏实了不少。' },
    ],
  },
  {
    id: 'super_soldout', bg: 'datacenter', title: '卖断货',
    when: (s, c) => !!s.products.coding_plan?.on && (c.sv.r429 || 0) > 0.25 && (c.sv.codingUsers || 0) > 4e5,
    text: '{model} 的 Coding Plan 火到算力跟不上，新用户要排队，二手平台上甚至有人倒卖账号。',
    scene: [
      { who: 'narr', text: '{date}，你们的 Coding Plan 订阅页上，“暂时售罄”挂了整整三天。' },
      { who: 'self', emo: '慌张', text: '又满了？我们不是刚加过一批卡吗！' },
      { who: 'narr', text: '有人在二手平台上挂出“代抢名额”，价格是原价的三倍。' },
      { who: 'self', emo: '生气', text: '这个就过分了吧！' },
    ],
    choices: [
      { id: 'limit', label: '从训练那边调卡，先保服务', action: { cmd: 'setInferShare', add: 0.1, max: 0.9 }, effects: { rep: 3 } },
      { id: 'expand', label: '咬牙扩容，下单租卡', action: { cmd: 'rentGpus' }, effects: { brand: 1.08 } },
      { id: 'hold', label: '先不扩，等手上的订单到', result: '配置没动，团队继续盯着服务压力。' },
    ],
  },
  {
    id: 'super_tenx', bg: 'exchange', title: '十倍估值',
    when: s => s.company.kind !== 'division' && s.valuationStart > 0 && s.valuation >= 10 * s.valuationStart && s.valuation >= 1e10,
    text: '{company} 的估值涨到了开局时的十倍以上。你们第一次被拿来和“前沿实验室”放在一起比较。',
    scene: [
      { who: 'narr', text: '{date}，一份行业报告把{company}和几家前沿实验室列在了同一页。' },
      { who: 'self', emo: '震惊', text: '十倍？我还记得刚开始的时候，连买卡都要算半天。' },
      { who: 'self', emo: '认真', text: '估值涨得快，跌起来也快。得赶紧把它变成真本事。' },
    ],
    choices: [
      { id: 'compute', label: '拿出最多一成现金订购显卡', action: { cmd: 'buyGpus', cashShare: 0.1 }, effects: { morale: 1 } },
      { id: 'brand', label: '打一轮品牌广告', effects: { brand: 1.12, cash: -5e6 }, result: '地铁站里挂满了你们的广告。' },
      { id: 'hold', label: '留着现金，先不扩张', result: '董事会决定先把现有业务做好，暂不加采购和广告。' },
    ],
  },
  {
    id: 'super_billion', bg: 'gala', title: '月入十亿',
    when: (s, c) => (c.sv.total || 0) >= 1e9,
    text: '{company} 单月收入突破 10 亿美元。财报会上，分析师的问题从“能不能赚钱”变成了“还能涨多快”。',
    scene: [
      { who: 'narr', text: '{date}，财务部把月报发到群里，后面跟了一排感叹号。' },
      { who: 'self', emo: '兴奋', text: '十亿！一个月！这是多少杯奶茶啊！' },
      { who: 'narr', text: 'CFO 默默在群里回了一句：先别激动，电费账单也到了。' },
      { who: 'self', emo: '无语', text: '……能不能让我多高兴一会儿。' },
    ],
    choices: [
      { id: 'dividend', label: '给全员加薪', effects: { morale: 2, cash: -1e7 }, result: '全员邮件发出去十分钟，办公室里一片欢呼。' },
      { id: 'reinvest', label: '扩招，全部投进下一代', effects: { team: 1.2 }, result: '新一代模型的预算一次批了下来，研究团队开始扩招。' },
      { id: 'hold', label: '先把钱留着', effects: { rep: 1 }, result: '财报会上，分析师夸你们花钱很克制。' },
    ],
  },
];
export const SUPER_BY_ID = Object.fromEntries(SUPER_EVENTS.map(e => [e.id, e]));
