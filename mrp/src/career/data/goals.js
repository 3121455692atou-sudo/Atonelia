// 董事会目标：像赛马娘的目标赛一样有截止月份。到期没达成，董事会给一次两个月宽限；再不达成，记一次警告。
// 阈值按公司量级区分：前沿实验室要争总榜，小团队只要求同量级领先。
import { CLASS_GOAL_MAX } from './balance.js';
// 累计几次未达成会撤换管理层（规格 E6）：董事会目标页从这里取，不写死数字。
export const BOARD_STRIKE_LIMIT = 3;
const T = (frontier, bigtech, major, small, specialist = major) => ({ frontier, bigtech, major, small, specialist });
// 名次目标要进前几（规格 D1.1）：总榜按 check.top；同量级（classOnly）按榜上的对手数定 N = max(1, min(CLASS_GOAL_MAX, floor(对手数 / 2)))，
// 即 2 家对手要第一，4 家要前二，6 家起要前三。董事会考核和顾问的目标分数都用它。
export const classTop = rivals => Math.max(1, Math.min(CLASS_GOAL_MAX, Math.floor(rivals / 2)));
export const rankTop = (check, rivals) => (check.classOnly ? classTop(rivals) : check.top);

export const GOAL_TEMPLATES = {
  llm: [
    { id: 'first_release', date: '+7', title: '发布第一个模型', check: { type: 'release' }, desc: '完成预训练和基本的后训练，把模型发布出去。' },
    { id: 'g_knowledge', date: '2023-10', title: '综合知识达标', check: { type: 'bench', bench: 'mmlu', cnBench: 'ceval', min: T(80, 72, 66, 54) },
      desc: '2023 年大家比的是 MMLU（国内看 C-Eval）。' },
    { id: 'g_arena', date: '2024-06', title: '竞技场排名', check: { type: 'rank', bench: 'arena', top: T(3, 12, 15, 3), classOnly: { small: true } },
      desc: '用户投票的 Chatbot Arena 是这一年最受关注的榜单。小团队只要求同量级前三。' },
    { id: 'g_revenue_24', date: '2024-12', title: '商业化：月收入', check: { type: 'revenue', min: T(8e7, 1.5e7, 6e6, 4e5) },
      desc: '投资人开始看收入了。' },
    { id: 'g_reasoning', date: '2025-06', title: '推理模型：AIME 2025', check: { type: 'bench', bench: 'aime25', min: T(75, 55, 50, 12) },
      desc: 'o1 和 R1 之后，没有推理能力的模型很难再被当作一线。R1 公开配方以后，追上来的窗口只有半年。' },
    { id: 'g_agent', date: '2025-12', title: 'Agent 时代：SWE-bench Verified', check: { type: 'bench', bench: 'swebv', min: T(70, 50, 50, 20) },
      desc: '编程 Agent 普及，修真实仓库的能力成了硬指标。' },
    { id: 'g_value', date: '2026-06', title: '资本市场认可', check: { type: 'valuation', min: T(3e11, 0, 1.2e10, 1e9), bigtechRevenue: 4e7 },
      desc: '创业公司看估值或上市；大厂团队看收入。' },
    { id: 'final', date: '2026-10', title: '2026 年度评审', check: { type: 'final' }, desc: '走到今天。按榜单、营收、估值、口碑和法务记录综合评级。' },
  ],
  image: [
    { id: 'first_release', date: '+6', title: '发布第一个模型', check: { type: 'release' }, desc: '' },
    { id: 'g_geneval', date: '2023-12', title: '指令遵循：GenEval', check: { type: 'bench', bench: 'geneval', min: T(68, 60, 58, 50) }, desc: 'DALL·E 3 之后，画得“对”和画得“好”同样重要。' },
    { id: 'g_arena', date: '2024-09', title: '文生图竞技场排名', check: { type: 'rank', bench: 'imgarena', top: T(6, 6, 6, 6, 4) }, desc: '' },
    { id: 'g_text', date: '2025-06', title: '文字渲染', check: { type: 'bench', bench: 'imgtext', min: T(80, 72, 68, 60, 50) }, desc: '4o 图像生成之后，图里写字成了基本要求。' },
    { id: 'g_revenue', date: '2025-12', title: '月收入', check: { type: 'revenue', min: T(3e7, 1e7, 1e7, 2e6, 1.2e7) }, desc: '' },
    { id: 'final', date: '2026-10', title: '2026 年度评审', check: { type: 'final' }, desc: '' },
  ],
  music: [
    { id: 'first_release', date: '+6', title: '发布第一个模型', check: { type: 'release' }, desc: '' },
    { id: 'g_caps', date: '2023-12', title: 'MusicCaps 文本匹配', check: { type: 'bench', bench: 'musiccaps', min: T(55, 50, 50, 40, 50) }, desc: '' },
    { id: 'g_arena', date: '2024-09', title: '盲听对战排名', check: { type: 'rank', bench: 'musicarena', top: T(2, 3, 3, 4, 2) }, desc: '' },
    { id: 'g_revenue', date: '2025-06', title: '月收入', check: { type: 'revenue', min: T(1e7, 3e6, 3e6, 5e5, 6e6) }, desc: '' },
    { id: 'g_copyright', date: '2025-12', title: '版权合规', check: { type: 'bench', bench: 'mucopy', max: 6 }, desc: '唱片公司的诉讼之后，生成结果撞上已发行作品的比例必须压下来。' },
    { id: 'final', date: '2026-10', title: '2026 年度评审', check: { type: 'final' }, desc: '' },
  ],
  speech: [
    { id: 'first_release', date: '+6', title: '发布第一个模型', check: { type: 'release' }, desc: '' },
    { id: 'g_mos', date: '2023-09', title: '自然度 MOS', check: { type: 'bench', bench: 'mos', min: T(4.2, 4, 4, 3.8, 4.1) }, desc: '' },
    { id: 'g_arena', date: '2024-09', title: 'TTS Arena 排名', check: { type: 'rank', bench: 'ttsarena', top: T(2, 3, 3, 4, 2) }, desc: '' },
    { id: 'g_revenue', date: '2025-06', title: '月收入', check: { type: 'revenue', min: T(1.5e7, 5e6, 5e6, 8e5, 8e6) }, desc: '' },
    { id: 'g_spoof', date: '2025-12', title: '防冒用', check: { type: 'bench', bench: 'spoof', min: T(85, 82, 80, 75, 80) }, desc: '声音克隆被用于诈骗之后，监管要求能拦住冒用。' },
    { id: 'final', date: '2026-10', title: '2026 年度评审', check: { type: 'final' }, desc: '' },
  ],
};

// 自洽（M.3.11）的董事会目标：全部是相对目标，不写死年份和金额。
// `+N` 从开局起算 N 个月；自洽模板不看开局有没有模型（buildGoals 只在史实路径跳过）。
export const SELF_GOALS = {
  llm: [
    { id: 'self_release', date: '+4', title: '发布第一个模型', check: { type: 'release' }, desc: '先把第一款模型发布出去，让外面知道你们在做什么。' },
    { id: 'self_rank', date: '+12', title: '竞技场进世界前一半', check: { type: 'rank', bench: 'arena', topFrac: 0.5 }, desc: '用户投票的竞技场要站到所有公司中间偏上的位置。学界不计名次。' },
    { id: 'self_share', date: '+18', title: 'API 份额', check: { type: 'share', product: 'api', minFrac: 0.5 }, desc: 'API 市场里不能只当陪跑：份额要不低于平均份额的一半。' },
    { id: 'self_value', date: '+24', title: '估值三倍', check: { type: 'valMult', mult: 3 }, desc: '两年内把公司估值做到开局的三倍。' },
    { id: 'final', date: '2026-10', title: '终局', check: { type: 'final' }, desc: '走到今天，按身家排名。' },
  ],
};

// 剧本专属的董事会目标（替换上面的通用列表）。tiers 限定只给哪些量级；日期都在开局 3 个月以后、留得出两个月宽限。
// 开局没有模型的公司只考发布和 8 月以后的目标。
// product：只看某个产品的收入；usage：调用量排行榜名次；strict：上市本身不算达标，看估值或市值；cnMin：中国公司的阈值（不再按三成折算）。
// byChar：按公司单独定阈值；chars / notChars：只给这几家 / 这几家不考，用来给不上通用榜单的公司换成本行的目标。
// 2026 年只有 10 个月：前沿实验室比 GDPval 和 Terminal-Bench 4.0，大厂和头部创业公司比编程 Agent、Coding Plan 和资本市场，小团队比同量级口碑和调用量。
export const SCENARIO_GOALS = {
  y2026: {
    llm: [
      { id: 'first_release', date: '+8', title: '发布第一个模型', check: { type: 'release' }, desc: '只剩不到一年，赶在年度评审前把第一个模型发布出去。' },
      { id: 'g26_gdpval', date: '2026-04', tiers: ['frontier'], title: '真实工作：GDPval', check: { type: 'bench', bench: 'gdpval', min: 78 },
        desc: '客户开始问“能替我干多少活”。GDPval 让资深从业者盲评报表、方案、备忘录，看模型赢过或打平专家的比例。' },
      { id: 'g26_swepro', date: '2026-04', tiers: ['bigtech', 'major'], title: '编程 Agent：SWE-bench Pro', check: { type: 'bench', bench: 'swepro', min: T(0, 38, 42, 0), byChar: { ernie: { min: 15 }, stepfun: { min: 28 } } },
        desc: 'Verified 已经刷到头，大家改报更难、更难作弊的 SWE-bench Pro。编程工具选模型主要看它。' },
      { id: 'g26_arena_small', date: '2026-04', tiers: ['small'], title: '同量级领先：竞技场', check: { type: 'rank', bench: 'arena', top: 3, classOnly: true },
        desc: '竞技场 2 月刚更新了反作弊规则。小团队拼不过前沿模型，但用户投票里要在同量级模型中排进前三。' },
      { id: 'g26_plan', date: '2026-07', tiers: ['frontier', 'bigtech', 'major'], title: 'Coding Plan 月收入', check: { type: 'revenue', product: 'coding_plan', min: T(1.6e8, 1.2e8, 5e7, 0), cnMin: T(0, 5.5e7, 5.5e7, 0) },
        desc: '编程订阅是 2026 年增长最快的生意：Claude Code 年化收入半年翻了一倍多，国内套餐卖到限购。要求上个月 Coding Plan 收入达标。' },
      { id: 'g26_router', date: '2026-07', tiers: ['small'], notChars: ['novelai'], title: 'OpenRouter 调用量', check: { type: 'usage', board: 'openrouter', top: 20 },
        desc: '开发者用脚投票：在 OpenRouter 周调用量排进前 20，说明有人真的在用你们的模型。' },
      { id: 'g26_subs', date: '2026-07', chars: ['novelai'], title: '会员订阅收入', check: { type: 'revenue', product: 'chat', min: 8.2e5 },
        desc: 'NovelAI 不上 OpenRouter，钱几乎全来自会员订阅：Tablet 每月 10 美元、Scroll 15 美元、Opus 25 美元。3 月底的 Xialong 只给 Opus 档。写手用钱包投票：要求上个月对话产品（会员订阅）收入达标。定价档位、内容策略和发版时机都会影响订阅收入。' },
      { id: 'g26_tb4', date: '2026-08', tiers: ['frontier'], title: 'Agent 时代：Terminal-Bench 4.0', check: { type: 'bench', bench: 'tbench4', min: 30 },
        desc: '8 月上线的新一代终端任务：多容器、GPU、单题最长 8 小时。旧榜接近满分以后，前沿实验室比的是这个。' },
      { id: 'g26_value', date: '2026-08', tiers: ['bigtech', 'major', 'small'], title: '资本市场：估值', check: { type: 'valuation', strict: true, min: T(0, 0, 2.5e10, 1.5e9), cnMin: T(0, 0, 3e10, 1.2e9), bigtechRevenue: 1e8, byChar: { novelai: { min: 9e8 } } },
        desc: '港股接连迎来大模型公司，美股也在等 AI 公司排队上市。光挂牌不算数：创业公司看估值，上市了就看市值；大厂团队看月收入。' },
    ],
    image: [
      { id: 'first_release', date: '+6', title: '发布第一个模型', check: { type: 'release' }, desc: '' },
      { id: 'g26_arena', date: '2026-04', title: '文生图竞技场排名', check: { type: 'rank', bench: 'imgarena', top: T(2, 3, 3, 4, 6) },
        desc: '竞技场 1 月刚换过提示词池，所有人重新排名。' },
      { id: 'g26_revenue', date: '2026-07', title: '月收入', check: { type: 'revenue', min: T(1.1e8, 1.5e7, 1.5e7, 2e6, 1.4e7) }, desc: '对话式改图让订阅用户涨了一波，要把它变成收入。' },
      { id: 'g26_value', date: '2026-08', title: '资本市场认可', check: { type: 'valuation', strict: true, min: T(4e11, 0, 1.2e10, 1e9, 8e9), bigtechRevenue: 2e7 }, desc: '投资人看的是增长和护城河。光挂牌不算数，上市了就看市值。' },
    ],
    music: [
      { id: 'first_release', date: '+6', title: '发布第一个模型', check: { type: 'release' }, desc: '' },
      { id: 'g26_arena', date: '2026-04', title: '盲听对战排名', check: { type: 'rank', bench: 'musicarena', top: T(2, 3, 3, 4, 1) }, desc: '谷歌 Lyria 3 和 ElevenLabs 的音乐模型都追上来了，要守住第一。' },
      { id: 'g26_revenue', date: '2026-07', title: '月收入', check: { type: 'revenue', min: T(1.5e7, 5e6, 5e6, 8e5, 4e7) }, desc: '订阅和授权分成都要算上。' },
      { id: 'g26_copyright', date: '2026-08', title: '授权模型：版权合规', check: { type: 'bench', bench: 'mucopy', max: 4 },
        desc: '和唱片公司和解以后，新模型要用授权曲库训练，生成结果撞上已发行作品的比例必须压到 4% 以下。' },
    ],
    speech: [
      { id: 'first_release', date: '+6', title: '发布第一个模型', check: { type: 'release' }, desc: '' },
      { id: 'g26_arena', date: '2026-04', title: 'TTS Arena 排名', check: { type: 'rank', bench: 'ttsarena', top: T(2, 3, 3, 4, 2) }, desc: '' },
      { id: 'g26_revenue', date: '2026-07', title: '月收入', check: { type: 'revenue', min: T(2e7, 7e6, 7e6, 1e6, 6e7) }, desc: '实时语音 Agent 让 API 调用量猛涨。' },
      { id: 'g26_spoof', date: '2026-08', title: '防冒用', check: { type: 'bench', bench: 'spoof', min: T(85, 82, 80, 75, 78) },
        desc: '语音 Agent 能直接打电话以后，冒用声音的诈骗更多了，监管要求能拦住未授权克隆。' },
    ],
  },
};
// 年度评审对所有剧本都一样。
for (const sc of Object.values(SCENARIO_GOALS)) for (const [mod, list] of Object.entries(sc)) list.push(GOAL_TEMPLATES[mod].find(g => g.id === 'final'));

// 2026 剧本开局就继承了成熟业务，董事会按增长考核：月收入做到开局月份的 3 倍、估值涨到 4 倍才算及格。
// 参考：Anthropic 年化收入 2 月到 5 月从 140 亿涨到 470 亿美元，估值半年涨约 5 倍；智谱股价 6 月一度是发行价的 18 倍。
// 这一年挂牌的 AI 公司太多，上市本身不再额外加分（listedBonus）。
export const SCORE_GROWTH = { y2026: { revenue: 3, valuation: 4, listedBonus: 0 } };

export const RANKS = [[0, 'G'], [24, 'F'], [32, 'E'], [40, 'D'], [49, 'C'], [58, 'B'], [67, 'A'], [77, 'S'], [87, 'SS']];
