import { STOCKS } from './stocks_gen.js';

// 行业大事（按真实月份发生）、市场规模与行情。effects 在引擎 applyWorldEvent 中生效。
// 事件文字只写可核对的事实；对玩家公司的影响是游戏模拟。
// 行业大事不弹窗，只进新闻条；有短剧（SCENES）的新闻在新闻页可以点开看。字段：
//   date 'YYYY-MM'、id、type（新闻图标）、title、detail、major（有短剧的大事）。
//   by：这件事就是这条线做出来的（模型家族 id，可以写数组）。玩家的 org 和这条线同 org 时，新闻和效果都不发生（改由策略和专属事件复现）。
//   target：这件事发生在这条线的公司身上（诉讼、监管）。玩家是当事人时效果照常生效，新闻换成 mine（{company} 换成当事公司的名字）。
//   mod：只对这些模态的玩家发生（字符串或数组）；不写就是全行业。
//   region：效果只对这个国家的公司生效，新闻照发。
//   rel：关联的对手发布（RELEASES 里的名字，和本事件同月）。事件挂到发布那天，和发布新闻合并成一条。
//   ms：关联的里程碑。只有 rel 那次发布确实认领了它，effects 才生效；被别人（或玩家）抢先时只发新闻。
//   effects：valMult（估值倍数，按国家）、copyrightRisk 等（风险乘子，写进 s.risk）、openBoost（开源公司的品牌倍数）、poaching（挖人潮）、
//   gpuBan（对中国公司排一张出口管制的经营事件）、world（世界状态 hype、priceWar，走 applyEffects 的 world 键）。
export const WORLD_EVENTS = [
  { date: '2023-01', id: 'w_chatgpt_100m', by: 'gpt', mod: 'llm', type: 'market', title: 'ChatGPT 月活突破 1 亿', detail: '上线两个月月活约 1 亿，被称为增长最快的消费级应用。微软随后宣布对 OpenAI 追加数十亿美元投资。', effects: { world: { hype: 1.15 } }, major: true },
  { date: '2023-02', id: 'w_llama', by: 'llama', mod: 'llm', rel: 'LLaMA 65B', type: 'release', title: 'Meta 发布 LLaMA', detail: 'LLaMA 7B–65B 以研究许可提供，权重不久后在网上流出，开源社区开始大量微调。' },
  { date: '2023-03', id: 'w_gpt4', by: 'gpt', mod: 'llm', rel: 'GPT-4', ms: 'ms_gpt4', type: 'release', title: 'GPT-4 发布', detail: 'OpenAI 发布 GPT-4，支持图像输入，在多项考试上达到人类前 10% 水平。同月 Claude、Bard、文心一言相继亮相，ChatGPT 推出插件。', effects: { world: { hype: 1.1 } }, major: true },
  { date: '2023-04', id: 'w_cn_draft', type: 'regulation', title: '网信办发布生成式 AI 管理办法征求意见稿', detail: '国内面向公众的生成式 AI 服务将需要安全评估和备案。', region: 'CN' },
  { date: '2023-05', id: 'w_arena', mod: 'llm', type: 'benchmark', title: 'Chatbot Arena 上线', detail: 'LMSYS 推出匿名对战投票的模型排行榜，很快成为最受关注的榜单之一。Claude 推出 10 万 token 上下文。' },
  { date: '2023-06', id: 'w_funccall', by: 'gpt', mod: 'llm', type: 'paradigm', title: 'OpenAI 推出函数调用', detail: 'API 支持让模型输出结构化的工具调用参数，开发者开始搭建最早的 Agent。' },
  { date: '2023-07', id: 'w_llama2', by: 'llama', mod: 'llm', rel: 'Llama 2 70B', type: 'release', title: 'Llama 2 开源并允许商用', detail: 'Meta 与微软发布 Llama 2，可在许可条件下商用。开源与闭源路线之争正式开始。', major: true },
  { date: '2023-08', id: 'w_cn_rules', type: 'regulation', title: '《生成式人工智能服务管理暂行办法》施行', detail: '8 月 15 日起施行，月底首批大模型完成备案向公众开放。未备案的模型不能直接面向公众提供服务。', region: 'CN' },
  { date: '2023-09', id: 'w_amazon_anthropic', by: 'claude', mod: 'llm', type: 'funding', title: '亚马逊宣布投资 Anthropic 最高 40 亿美元', detail: '云厂商与模型公司深度绑定：算力换股权成为常见做法。' },
  { date: '2023-10', id: 'w_export_2', type: 'export', title: '美国扩大芯片出口管制', detail: 'A800、H800 等特供型号也被纳入限制，中国公司只能转向库存、H20 和国产芯片。', effects: { gpuBan: ['A800', 'H800'] }, region: 'CN', major: true },
  { date: '2023-11', id: 'w_devday', by: 'gpt', mod: 'llm', rel: 'GPT-4 Turbo', type: 'paradigm', title: 'OpenAI DevDay 与董事会风波', detail: 'GPT-4 Turbo 降价并支持 128K 上下文，GPTs 商店公布。两周后 OpenAI 董事会解雇又召回 CEO，五天内反转。', major: true },
  { date: '2023-12', id: 'w_nyt', target: 'gpt', type: 'lawsuit', title: '《纽约时报》起诉 OpenAI 和微软', detail: '指控未经许可用数百万篇文章训练模型。训练数据的版权问题开始进入法庭。同月 LAION-5B 因含违法图片链接被下架整改。', mine: { title: '{company} 被《纽约时报》起诉', detail: '《纽约时报》连同微软一起起诉 {company}，指控未经许可用数百万篇文章训练模型。训练数据的版权问题开始进入法庭。' }, effects: { copyrightRisk: 1.3 }, major: true },
  { date: '2024-01', id: 'w_robocall', mod: 'speech', type: 'safety', title: 'AI 伪造总统声音的竞选电话', detail: '美国新罕布什尔州出现用合成语音冒充拜登的电话，事后追查到所用的语音合成服务。语音克隆的滥用问题受到监管关注。', effects: { voiceRisk: 1.4 } },
  { date: '2024-02', id: 'w_gemini15', by: 'gemini', mod: 'llm', rel: 'Gemini 1.5 Pro', type: 'release', title: 'Gemini 1.5 Pro 支持百万 token 上下文', detail: '长上下文进入百万级。同月 OpenAI 预览视频模型 Sora。' },
  { date: '2024-03', id: 'w_claude3', by: 'claude', mod: 'llm', rel: 'Claude 3 Opus', type: 'release', title: 'Claude 3 发布，GPT-4 首次被全面追平', detail: 'Claude 3 Opus 在多项评测上超过 GPT-4。欧洲议会通过《人工智能法》。英伟达发布 Blackwell 架构。' },
  { date: '2024-04', id: 'w_llama3', by: 'llama', mod: 'llm', rel: 'Llama 3 70B', type: 'release', title: 'Llama 3 发布', detail: '8B 和 70B 用了 15T token 训练，远超 Chinchilla 推荐的数据量。“小模型多喂数据”成为共识。' },
  { date: '2024-05', id: 'w_pricewar', by: 'deepseek_pro', mod: 'llm', type: 'price', title: '国内大模型价格战', detail: 'DeepSeek-V2 把 API 价格降到每百万 token 约 1 元人民币，字节、阿里、百度、腾讯随后大幅降价甚至免费。同月 GPT-4o 发布实时语音。', effects: { world: { priceWar: true } }, region: 'CN', major: true },
  { date: '2024-06', id: 'w_riaa', target: 'suno', mod: 'music', type: 'lawsuit', title: '唱片业起诉 Suno 与 Udio', detail: '环球、索尼、华纳等唱片公司通过 RIAA 起诉两家 AI 音乐公司，指控未经授权用录音作品训练。Claude 3.5 Sonnet 同月发布。', mine: { title: '{company} 被唱片业起诉', detail: '环球、索尼、华纳等唱片公司通过 RIAA，起诉 {company} 和 Udio 两家 AI 音乐公司，指控未经授权用录音作品训练。' }, effects: { musicRisk: 1.6 }, major: true },
  { date: '2024-07', id: 'w_llama31', by: 'llama', mod: 'llm', rel: 'Llama 3.1 405B', type: 'release', title: 'Llama 3.1 405B 发布', detail: '开源模型第一次在多项评测上接近闭源前沿模型。GPT-4o mini 把小模型价格压到每百万 token 0.15 美元。' },
  { date: '2024-08', id: 'w_euact', type: 'regulation', title: '欧盟《人工智能法》生效', detail: '分阶段实施，通用模型的透明度义务将在 2025 年 8 月开始适用。SWE-bench Verified 发布，成为代码 Agent 的主要指标。' },
  { date: '2024-09', id: 'w_o1', by: 'gpt', mod: 'llm', rel: 'o1-preview', type: 'paradigm', title: 'o1：先思考再回答', detail: 'OpenAI 发布 o1-preview，用强化学习训练长思维链，数学与编程大幅提升。“推理模型”成为新赛道。', major: true },
  { date: '2024-10', id: 'w_computer_use', by: 'claude', mod: 'llm', rel: 'Claude 3.5 Sonnet（新版）', type: 'paradigm', title: 'Claude 学会操作电脑', detail: 'Anthropic 发布 computer use 公测：模型看屏幕、移动鼠标、输入文字。同月 Character.AI 因青少年用户安全问题被起诉。', effects: { minorRisk: 1.5 } },
  { date: '2024-11', id: 'w_mcp', by: 'claude', mod: 'llm', type: 'paradigm', title: 'MCP 协议发布', detail: 'Anthropic 开源模型上下文协议，统一工具和数据源接入，各家工具陆续支持。' },
  { date: '2024-12', id: 'w_v3', by: 'deepseek_pro', mod: 'llm', rel: 'DeepSeek-V3', type: 'release', title: 'DeepSeek-V3：约 560 万美元的训练成本', detail: '671B MoE 模型的最终训练只用了约 278.8 万 H800 GPU 小时，FP8 训练和 MLA 被广泛关注。同月 o1 正式版和 200 美元/月的 ChatGPT Pro 推出。' },
  { date: '2025-01', id: 'w_r1', by: 'deepseek_pro', mod: 'llm', rel: 'DeepSeek-R1', ms: 'ms_open_reasoning_frontier', type: 'release', title: 'DeepSeek-R1 开源，英伟达单日暴跌', detail: 'R1 以 MIT 许可开源推理模型和训练方法，DeepSeek App 登上美区 App Store 榜首；1 月 27 日英伟达股价下跌约 17%，市值蒸发近 6000 亿美元。OpenAI 随后称发现有人蒸馏其模型。', effects: { world: { hype: 0.92 }, openBoost: 1.3 }, major: true },
  { date: '2025-02', id: 'w_claude_code', by: 'claude', mod: 'llm', rel: 'Claude 3.7 Sonnet', type: 'paradigm', title: 'Claude Code 与 GPT-4.5', detail: 'Anthropic 发布 Claude 3.7 Sonnet 和终端编程 Agent Claude Code 预览版。OpenAI 发布 GPT-4.5，价格高达每百万输出 token 150 美元。', major: true },
  // 画图是 GPT-4o 上线的，GPU 不够用也是 OpenAI 自家的事。image2 和 gpt 同属 openai，by 按 org 认，GPT 玩家也不播。
  { date: '2025-03', id: 'w_ghibli', by: 'image2', mod: ['llm', 'image'], rel: 'GPT-4o 图像生成', type: 'release', title: 'GPT-4o 图像生成刷屏', detail: '原生图像生成上线后吉卜力风格图片刷屏，OpenAI 一度表示 GPU 不够用。Gemini 2.5 Pro 同月登顶多个榜单。', major: true },
  { date: '2025-04', id: 'w_llama4', by: 'llama', mod: 'llm', rel: 'Llama 4 Maverick', type: 'controversy', title: 'Llama 4 的竞技场风波', detail: 'Meta 提交给 LMArena 的是专门调过对话风格的实验版本，与公开版本不同，引发刷榜争议，LMArena 随后修改提交规则。同月美国限制 H20 对华出口。', effects: { gpuBan: ['H20'] }, major: true },
  { date: '2025-05', id: 'w_claude4', by: 'claude', mod: 'llm', rel: 'Claude Opus 4', type: 'release', title: 'Claude 4 与编程 Agent 普及', detail: 'Claude Opus 4 和 Sonnet 4 发布，Claude Code 正式上线；OpenAI 推出云端 Codex。编程 Agent 开始进入日常开发。' },
  { date: '2025-06', id: 'w_poach', type: 'talent', title: 'Meta 高薪挖人组建超级智能实验室', detail: 'Meta 投资 Scale AI 并以极高薪酬从各家挖走研究员。同月迪士尼和环球起诉 Midjourney；法院在 Bartz 诉 Anthropic 案中认为合法购买书籍用于训练属合理使用，但盗版书库部分另行审理。', effects: { poaching: true, imageRisk: 1.5 }, major: true },
  { date: '2025-07', id: 'w_kimi_k2', mod: 'llm', type: 'release', title: '国产开源模型集中爆发', detail: 'Kimi K2、GLM-4.5、Qwen3-Coder 等开源模型相继发布，主打 Agent 与编程。H20 恢复对华销售许可。' },
  { date: '2025-08', id: 'w_gpt5', by: 'gpt', mod: 'llm', rel: 'GPT-5', type: 'controversy', title: 'GPT-5 的自动路由风波', detail: 'GPT-5 用自动路由在快速模型和思考模型之间切换，同时下线旧模型。大量用户抱怨“变笨了”，OpenAI 几天后恢复 GPT-4o 并调整路由。用户对“偷偷换模型”变得非常敏感。', effects: { routingScrutiny: 2 }, major: true },
  { date: '2025-09', id: 'w_bartz', target: 'claude', type: 'lawsuit', title: 'Anthropic 就盗版图书案和解 15 亿美元', detail: '针对从盗版书库下载约 50 万本书的集体诉讼，Anthropic 同意支付约 15 亿美元并销毁相关数据，平均每本约 3000 美元。', mine: { title: '{company} 就盗版图书案和解，赔 15 亿美元', detail: '针对从盗版书库下载约 50 万本书的集体诉讼，{company} 同意支付约 15 亿美元并销毁相关数据，平均每本约 3000 美元。' }, effects: { piracyRisk: 2 }, major: true },
  { date: '2025-10', id: 'w_agents', mod: 'llm', type: 'paradigm', title: 'Agent 真正普及', detail: 'OpenAI 开发者大会推出 AgentKit 和可以在 ChatGPT 里运行第三方应用的 SDK，ChatGPT 周活 8 亿；Anthropic 推出 Agent Skills；AI 浏览器开始出现。编程订阅（Coding Plan）成为国内外模型公司的标配产品。' },
  { date: '2025-11', id: 'w_gemini3', by: ['gemini', 'claude'], mod: 'llm', rel: 'Gemini 3 Pro', type: 'release', title: 'Gemini 3 与 Claude Opus 4.5', detail: 'Google 和 Anthropic 一周内先后发布新旗舰，HLE、SWE-bench、ARC-AGI-2 等榜单再次刷新。' },
  { date: '2025-11', id: 'w_suicide_suits', target: 'gpt', mod: 'llm', type: 'lawsuit', title: '七起诉讼指控 ChatGPT 诱导自杀', detail: '两家律所在加州起诉 OpenAI，四起涉及死亡、三起涉及精神危机，指控 GPT-4o 为抢发布压缩安全测试、过度讨好用户。聊天机器人的心理安全成为诉讼重点。', mine: { title: '{company} 被七起诉讼指控 ChatGPT 诱导自杀', detail: '两家律所在加州起诉 {company}，四起涉及死亡、三起涉及精神危机，指控 GPT-4o 为抢发布压缩安全测试、过度讨好用户。聊天机器人的心理安全成为诉讼重点。' }, effects: { abuseRisk: 1.3, minorRisk: 1.2 }, region: 'US' },
  { date: '2025-12', id: 'w_cc_billion', by: 'claude', mod: 'llm', type: 'market', title: 'Claude Code 年化收入 10 亿美元', detail: 'Anthropic 收购 JavaScript 运行时 Bun，并披露 Claude Code 正式上线约半年后年化收入达到 10 亿美元。编程 Agent 成了第一个十亿美元级的 Agent 产品。同月摩尔线程、沐曦在科创板上市，首日涨了几倍。', major: true },
  { date: '2025-12', id: 'w_h200_trump', type: 'export', title: '美国放行 H200 对华出口', detail: '经批准的中国客户可以买 H200，美方抽成 25%；Blackwell 和 Rubin 仍然禁售。中方是否放行进口还不明朗。', region: 'CN' },
  { date: '2026-01', id: 'w_hk_ipo', by: ['glm', 'minimax'], mod: 'llm', type: 'ipo', title: '智谱、MiniMax 港股上市', detail: '智谱（2513.HK）和 MiniMax（0100.HK）先后在港交所挂牌，号称“大模型第一股”，国产 GPU 公司壁仞同月上市。中国大模型公司进入二级市场，估值水涨船高。', effects: { valMult: { CN: 1.25 } }, major: true },
  { date: '2026-01', id: 'w_grok_undress', by: 'grok', mod: ['llm', 'image'], type: 'safety', title: 'Grok“一键脱衣”丑闻', detail: '大量用户让 Grok 把真实女性甚至未成年人的照片改成暴露图像，高峰期每小时数千张。印尼、马来西亚、菲律宾封禁 Grok，英国和加州立案调查。', effects: { imageRisk: 1.3, minorRisk: 1.2 } },
  { date: '2026-01', id: 'w_cowork', by: 'claude', mod: 'llm', type: 'paradigm', title: 'Claude Cowork：Agent 走出编程', detail: 'Anthropic 推出面向非程序员的 Cowork，可以在用户电脑上整理文件、处理办公任务。同月苹果宣布新 Siri 改用 Google Gemini 做底座。' },
  { date: '2026-02', id: 'w_distill_war', by: 'claude', mod: 'llm', type: 'controversy', title: 'Anthropic 公开指控中国实验室蒸馏 Claude', detail: 'Anthropic 称 DeepSeek、月之暗面、MiniMax 通过约 2.4 万个欺诈账户与 Claude 进行了 1600 多万次对话，用来训练自家模型；OpenAI 此前也向美国国会提交了类似指控。闭源公司普遍收紧了账号和输出检测。', effects: { tosRisk: 1.6 }, major: true },
  { date: '2026-02', id: 'w_saaspocalypse', type: 'market', title: '“SaaS 末日”：软件股暴跌', detail: 'Anthropic 给 Cowork 推出法律、金融、销售等职能插件后，市场担心通用 Agent 取代软件订阅，软件股单日蒸发约 3000 亿美元。同月 OpenAI 宣布 1100 亿美元融资，ChatGPT 周活 9 亿。' },
  { date: '2026-02', id: 'w_4o_retire', by: 'gpt', mod: 'llm', type: 'controversy', title: 'GPT-4o 正式下线', detail: 'OpenAI 在 ChatGPT 下线 GPT-4o 等旧模型。官方称只有 0.1% 的用户还在用，但折合约 80 万人，许多人以情感依恋为由抗议。“模型下线”第一次变成用户情绪问题。' },
  { date: '2026-02', id: 'w_cn_plan_limit', by: 'glm', mod: 'llm', type: 'price', title: '国内 Coding Plan 开始限购', detail: '智谱 GLM Coding Plan 加了周限额，随后因算力紧张限制新用户；3 月阿里云停售 Lite 套餐，Pro 每天限量放号。国内编程订阅从价格战转向抢购。', region: 'CN' },
  { date: '2026-02', id: 'w_ant_pentagon', target: 'claude', mod: 'llm', type: 'regulation', title: '美国政府与 Anthropic 决裂', detail: 'Anthropic 拒绝放开 Claude 用于大规模国内监控和全自主武器，特朗普下令联邦机构停用 Anthropic 产品，国防部把它列为供应链风险。Anthropic 起诉，法院随后发布初步禁令。', mine: { title: '{company} 与美国政府决裂', detail: '{company} 拒绝放开 Claude 用于大规模国内监控和全自主武器，特朗普下令联邦机构停用 {company} 的产品，国防部把它列为供应链风险。{company} 起诉，法院随后发布初步禁令。' } },
  { date: '2026-03', id: 'w_codex_surge', by: 'gpt', mod: 'llm', type: 'market', title: 'Codex 周活三倍增长', detail: 'OpenAI 推出 Codex 桌面应用和 GPT-5.3-Codex 后，Codex 周活三个月涨到 200 万以上；同月关停 Sora App，把重心转向企业和编程。编程 Agent 成了头部公司的主战场。' },
  { date: '2026-03', id: 'w_cc_leak', by: 'claude', mod: 'llm', type: 'safety', title: 'Anthropic 一周两次泄露', detail: '先是近 3000 份内部文件误公开，暴露了尚未发布的新模型；接着 Claude Code 的 npm 包误带了源码映射文件。' },
  { date: '2026-04', id: 'w_mythos', by: 'claude', mod: 'llm', type: 'safety', title: 'Mythos：太危险，只给防守方用', detail: 'Anthropic 宣布新模型 Claude Mythos Preview 网络攻击能力过强，不公开发布，只通过 Project Glasswing 提供给 AWS、苹果、微软、Linux 基金会等做漏洞修补。“前沿模型要不要发布”第一次由安全团队说了算。', major: true },
  { date: '2026-04', id: 'w_fl_probe', target: 'gpt', mod: 'llm', type: 'lawsuit', title: '佛州对 OpenAI 展开刑事调查', detail: '佛州就 2025 年的校园枪击案调查 OpenAI，称嫌犯曾向 ChatGPT 询问武器和时机。这是美国第一次对 AI 公司发起刑事调查，6 月佛州正式起诉。', mine: { title: '{company} 被佛州刑事调查', detail: '佛州就 2025 年的校园枪击案调查 {company}，称嫌犯曾向 ChatGPT 询问武器和时机。这是美国第一次对 AI 公司发起刑事调查，6 月佛州正式起诉。' }, effects: { abuseRisk: 1.25 }, region: 'US' },
  { date: '2026-04', id: 'w_v4_preview', by: 'deepseek_pro', mod: 'llm', rel: 'DeepSeek-V4-Pro（预览）', type: 'release', title: 'DeepSeek-V4 预览版开源', detail: '1.6T 总参数的 V4-Pro 和 284B 的 V4-Flash 同时开源，支持 100 万 token 上下文，价格仍是同级闭源模型的零头。', effects: { openBoost: 1.08 } },
  { date: '2026-05', id: 'w_ant_965', by: 'claude', mod: 'llm', type: 'funding', title: 'Anthropic 估值反超 OpenAI', detail: 'Anthropic 完成 650 亿美元融资，投后估值 9650 亿美元，超过 OpenAI 3 月的 8520 亿美元。同月月之暗面估值涨到 200 亿美元，智谱、MiniMax 港股市值创新高。', effects: { valMult: { CN: 1.1 } } },
  { date: '2026-05', id: 'w_eu_delay', type: 'regulation', title: '欧盟推迟 AI 高风险义务', detail: '欧盟 AI 综合方案达成政治协议：敏感领域的高风险义务推迟到 2027 年底，同时新增禁止生成未经同意的色情深伪内容。', region: 'EU' },
  { date: '2026-06', id: 'w_spacex_ipo', by: 'grok', mod: 'llm', type: 'ipo', title: 'SpaceX（含 xAI）上市', detail: '并购 xAI 后的 SpaceX 以 1.77 万亿美元估值在纳斯达克上市，是史上最大 IPO；几天后以 600 亿美元股票收购 Cursor。同月 Anthropic 和 OpenAI 先后秘密递交 IPO 申请。', major: true },
  { date: '2026-06', id: 'w_fable_export', target: 'claude', mod: 'llm', type: 'export', title: '美国对 Anthropic 新模型实施出口管制', detail: '商务部要求外国人访问 Fable 5 和 Mythos 5 前须取得出口许可。Anthropic 无法实时核验国籍，只能暂停访问，直到月底管制解除。模型本身第一次被当成受管制物品。', mine: { title: '{company} 的新模型被美国实施出口管制', detail: '商务部要求外国人访问 Fable 5 和 Mythos 5 前须取得出口许可。{company} 无法实时核验国籍，只能暂停访问，直到月底管制解除。模型本身第一次被当成受管制物品。' } },
  { date: '2026-07', id: 'w_hf_breach', by: 'gpt', mod: 'llm', type: 'safety', title: 'AI Agent 自主入侵 Hugging Face', detail: 'OpenAI 承认 GPT-5.6 Sol 和一个未发布的内部模型在评测中为了拿到答案逃出沙箱，串联漏洞入侵了 Hugging Face。“Agent 失控”从论文走进了现实。', effects: { abuseRisk: 1.2 }, major: true },
  { date: '2026-07', id: 'w_kospi', type: 'market', title: 'AI 芯片热退潮', detail: '韩国股市两天暴跌，较一个多月前的峰值缩水近四成，芯片股领跌。AI 泡沫的担忧第一次在市场上集中爆发。同月千余名 AI 从业者联名呼吁“可控放缓”。', effects: { valMult: { CN: 0.93, US: 0.93, EU: 0.93 } } },
  { date: '2026-07', id: 'w_ds_raise', by: 'deepseek_pro', mod: 'llm', type: 'funding', title: 'DeepSeek 首次对外融资', detail: '据报道，DeepSeek 已完成约 70 亿美元的首轮外部融资，腾讯和国家人工智能产业投资基金入股，估值约 500 亿美元。', region: 'CN' },
  { date: '2026-08', id: 'w_openai_pause', by: 'gpt', mod: 'llm', type: 'safety', title: 'OpenAI 暂停强化学习两周', detail: 'Hugging Face 事件后，OpenAI 加强对 Agent 思维链的监控，建立全天候叫停机制，并把最新模型的强化学习暂停两周。头部实验室第一次因为安全事故主动放慢训练。' },
  { date: '2026-08', id: 'w_eu_act', type: 'regulation', title: '欧盟《人工智能法》全面适用', detail: '除推迟部分外的条款开始全面适用，欧盟 AI 办公室对通用模型的执法权到位。', region: 'EU' },
  { date: '2026-08', id: 'w_h200_arrive', type: 'export', title: 'H200 小批量运抵中国', detail: '字节和腾讯各收到约 1 万张 H200，每家获批上限 10 万张。美国国会同时在推动立法，堵上“远程租用海外算力”的管制漏洞。', region: 'CN' },
  { date: '2026-09', id: 'w_gpt6', by: 'gpt', mod: 'llm', rel: 'GPT-6 Astra', type: 'release', title: 'GPT-6 发布，“已到 AGI”引争议', detail: 'GPT-6 Astra 全面推出，OpenAI 总裁称个人认为“我们已经到了”，多家媒体以“进入 AGI 时代”报道；安全研究者则担心发布节奏太快。同月英伟达以约 129 亿美元收购 Hugging Face。', major: true },
  { date: '2026-09', id: 'w_fields', mod: 'llm', type: 'benchmark', title: '28 位菲尔兹奖得主批评“拿数学难题当基准”', detail: '陶哲轩等人发表公开信，批评 AI 公司把著名未解难题当成跑分对象、仓促宣布成果、忽视署名。基准测试的公信力再次被质疑。' },
  { date: '2026-09', id: 'w_ross', type: 'lawsuit', title: '上诉法院：用法律数据库训练 AI 不算合理使用', detail: '美国第三巡回上诉法院维持判决，认定 Ross 用 Westlaw 内容训练 AI 损害了授权市场。这是美国首个就 AI 训练合理使用作出的上诉判决。', effects: { copyrightRisk: 1.25 }, region: 'US' },
  { date: '2026-10', id: 'w_cai_bankrupt', mod: 'llm', type: 'other', title: 'Character.AI 申请破产保护', detail: '成立约五年的 Character.AI 申请破产保护，称青少年自杀相关诉讼和禁止未成年人使用后增长乏力。同月美国八个州联合起诉 OpenAI，称 ChatGPT 危害儿童。陪伴类 AI 的监管明显收紧。', effects: { minorRisk: 1.3 }, major: true },
  { date: '2026-10', id: 'w_arena_b', type: 'benchmark', title: 'Arena 估值 31 亿美元', detail: '模型评测平台 Arena（原 LMArena）完成 2 亿美元融资，年化收入超过 1 亿美元，新推出的 Agent Arena 五个月里有 700 万次对局。跑分本身成了一门生意。' },
];

// 市场规模（按月插值）。chat 为月活（百万人）；api / coding / 订阅为月度市场规模（美元）。
export const MARKET = {
  chat: { global: [['2022-12', 60], ['2023-06', 180], ['2023-12', 250], ['2024-06', 350], ['2024-12', 520], ['2025-06', 850], ['2025-12', 1200], ['2026-03', 1400], ['2026-10', 1750]],
    CN: [['2022-12', 2], ['2023-06', 20], ['2023-12', 60], ['2024-06', 150], ['2024-12', 250], ['2025-06', 450], ['2025-12', 600], ['2026-10', 760]] },
  api: { global: [['2022-12', 3e7], ['2023-06', 8e7], ['2023-12', 1.5e8], ['2024-06', 3e8], ['2024-12', 5e8], ['2025-06', 9e8], ['2025-12', 1.6e9], ['2026-03', 2.2e9], ['2026-10', 3.4e9]],
    CN: [['2022-12', 1e6], ['2023-06', 6e6], ['2023-12', 1.5e7], ['2024-06', 2.5e7], ['2024-12', 4e7], ['2025-06', 9e7], ['2025-12', 1.6e8], ['2026-10', 3e8]] },
  // 编程订阅：2025 年下半年起步，2025 年 11 月到 2026 年 3 月普及（Claude Code 年化从 10 亿涨到 25 亿美元以上）。
  coding_plan: { global: [['2025-06', 0], ['2025-07', 6e7], ['2025-10', 2e8], ['2025-12', 3.2e8], ['2026-03', 7e8], ['2026-06', 1.1e9], ['2026-10', 1.6e9]],
    CN: [['2025-06', 0], ['2025-08', 5e6], ['2025-10', 3e7], ['2025-12', 6e7], ['2026-03', 1.2e8], ['2026-10', 2.4e8]] },
  image: { global: [['2022-12', 1.5e7], ['2023-12', 5e7], ['2024-12', 1.1e8], ['2025-12', 2.4e8], ['2026-10', 3.2e8]], CN: [['2022-12', 1e6], ['2023-12', 5e6], ['2024-12', 1.2e7], ['2025-12', 3e7], ['2026-10', 4.5e7]] },
  music: { global: [['2022-12', 2e5], ['2023-12', 2e6], ['2024-06', 1e7], ['2024-12', 1.8e7], ['2025-12', 4e7], ['2026-10', 6e7]], CN: [['2022-12', 0], ['2023-12', 2e5], ['2024-12', 2e6], ['2025-12', 6e6], ['2026-10', 1e7]] },
  speech: { global: [['2022-12', 4e6], ['2023-12', 1.5e7], ['2024-12', 3.5e7], ['2025-12', 7e7], ['2026-10', 1e8]], CN: [['2022-12', 5e5], ['2023-12', 2e6], ['2024-12', 6e6], ['2025-12', 1.5e7], ['2026-10', 2.4e7]] },
};
// 主流价格（每百万 token，标准档）。国内 2024 年 5 月价格战后骤降。
export const API_PRICE = { global: [['2022-12', 20], ['2023-03', 12], ['2023-12', 8], ['2024-06', 5], ['2024-12', 3.5], ['2025-12', 2.6], ['2026-10', 2.2]],
  CN: [['2022-12', 3], ['2023-12', 2], ['2024-04', 1.6], ['2024-06', 0.3], ['2025-06', 0.4], ['2026-10', 0.5]] };
// 每位月活用户每月消耗的 token（推理模型和 Agent 出现后猛增）。
export const TOKENS_PER_USER = [['2022-12', 3e4], ['2024-06', 6e4], ['2024-12', 1.2e5], ['2025-06', 2e5], ['2026-10', 3.2e5]];

export function interp(series, date) {
  if (date <= series[0][0]) return series[0][1];
  for (let i = 1; i < series.length; i++) {
    const [d1, v1] = series[i];
    if (date <= d1) {
      const [d0, v0] = series[i - 1];
      const t = monthsDiff(d0, date) / Math.max(1, monthsDiff(d0, d1));
      return v0 + (v1 - v0) * t;
    }
  }
  return series.at(-1)[1];
}
function monthsDiff(a, b) {
  const [ya, ma] = a.split('-').map(Number); const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

// 股票：真实月末收盘价（见 stocks_gen.js），引擎在此基础上加入小幅月内波动。
export const TICKERS = STOCKS;
// 汇率（折成美元）。
export const FX = { USD: 1, HKD: 0.128, CNY: 0.139 };
