两件事的结论：榜单页按每个基准各取每家最强，闭源前沿单独一档、不并入"大"。下面分别给做法、理由和出处。

我用 `sota_check.mjs` 里 fixes/adds 修订后的数据重算了游戏自己的 `leaderboard()` 和 `latestRelease`，临时脚本已删。个别脚本只带了其中与 LLM 相关的主要几行，不影响结论。综合分按 v1.0 D1 的 qOf，满分 100。

# 一、榜单怎么列

## 推荐做法：两层口径，各管各的

1. **"这家的旗舰"只有一个定义，就是 familyBest。**
   - 按 qOf 综合分，截至当天，每家取最高的一款。不是最新的，也不是参数最大的。
   - 用在对手页、旗舰标签、蒸馏老师、SOTA 和 worldRank。这和 v1.0 D1 一致，不用改。
2. **榜单页和目标判定，按"每个基准各取该家最强"。**
   - 每个基准榜里，每家只占一行，取该家截至当天在这个基准上分最高的已发布型号。
   - 现行 `model.js leaderboard()` 用的是 `latestRelease`（最新发布的一款），要换掉。
   - 点开可以展开该家全部型号，这是可选项。

对外部改动包的两处修正：
- **单位用 org（`ownerOf`），不用 family。**
  - 现在 Claude 和 Fable、DeepSeek 大肥鱼和小肥鱼各占两行，"总榜前 N"会被同一家占位。
  - 量级榜是例外，先筛量级再取每家最强，见第二部分。
- **某家在这个基准上最强的型号不是它的综合旗舰时，行上加个小标。**
  - 两者分差小于约 1 分（和跑分噪声同量级）时，取综合旗舰，避免名次每月翻来翻去。

## 理由

1. **真实榜单的一行是一个型号或一个系统，没有把榜单收成"每家一款综合最强"的。**
   - Artificial Analysis 把每个推理档位单独列一行，例如 Opus 5.5 的 max/xhigh/high/medium/low 各一行（[AA 榜单](https://artificialanalysis.ai/leaderboards/models)）。
   - Arena 每个模型一个唯一名次，并行给出名次区间（[Arena ranking method](https://arena.ai/blog/ranking-method)）。
   - LiveBench 评的是具体型号：闭源若干加 0.5B–405B 的几十个开源模型（[论文摘要](https://arxiv.org/abs/2406.19314)）。
   - SWE-bench 的条目是"模型+脚手架"系统，另有 Bash Only 过滤器用统一脚手架比纯模型（[experiments README](https://github.com/SWE-bench/experiments)、[Bash Only 页](https://www.swebench.com/bash-only.html)）。
   - Epoch 的基准中心按模型跟踪 410 个，只收聊天/指令版本，主要大厂的旗舰优先（[Epoch Benchmarking Hub](https://epoch.ai/benchmarks)）。
2. **"每家一款"在真实世界只出现在概览图里，是折叠视图，不是榜单本身。**
   - AA 的智能图默认只画 706 个模型里的 27 个，可以再加（[AA 模型页](https://artificialanalysis.ai/models)）。
   - Epoch 有"只看前沿趋势线"开关，还能按机构、国家、开放程度着色。
   - 所以榜单页逐基准列最像真实榜单，每家一行就是默认折叠。
3. **每个基准各有各的头名，一个综合分代替不了。**
   - AA 的总指数 v4.3.2 本身是 10 项评测按四大类加权：Agents 30%、Coding 20%、科学推理 20%、通用 30%（[AA 方法页](https://artificialanalysis.ai/methodology/intelligence-benchmarking)）。
4. **"取最新"才是现行的毛病，实测如下。**
   - LLM 的 938 个"家族×月份"里，34 个（3.6%）最新型号不是综合最强。例子：
     - Gemini 3.5 Flash 91.9 对 3.1 Pro 92.9
     - Claude Sonnet 5 94.1 对 Opus 4.8 94.5
     - gpt-oss-120b 对 GPT-5
     - Seed-OSS-36B 对 Seed 1.6
     - Llama 3.3 70B 66.5 对 3.1 405B 68.1
   - 前三名单和现行"取最新"规则不同的月份占比：
     - Arena 5/34
     - MMLU-Pro 9/29
     - GPQA 12/34
     - AIME25 9/21
     - SWE-bench Verified 6/27
     - HLE 10/22
   - 这就是 v0.9.2 审查报告第四节第 12 条"发布轻量版会把旧旗舰挤出榜单"和"bestClosedQ 遇到最新一款是开源的就整家跳过"的根源。
5. **逐基准取最强和综合取一款，榜单上差别不大，但前者更贴近真实榜单。**
   - 前三名单不同的月份：Arena 1/34、GPQA 6/34、AIME25 3/21、SWE-bench Pro 0/14、Terminal-Bench 0/18。
   - 逐基准取最强更贴近真实榜单的做法，也不用在榜单页再引入一个综合分。
6. **代价很小，但阈值要重标。**
   - 每个榜单计算约 0.22 毫秒，按（基准，天）缓存即可。
   - 逐基准取最强会抬高对手分数：Arena 第 3 名平均 +2.7 分（最大 +19），第 12 名平均 +2.5 分（最大 +15）。分数单位是游戏里 Elo 标度。
   - `goals.js` 里 `T(3,12,15,3)` 这类名次阈值和 advisor 的 `goalTarget` 要跑一遍 `calibrate.mjs` 重标。

# 二、量级怎么分

## 推荐做法：保留四档，"前沿闭源"单独一档，不并入"大"

1. **分档规则**
   - 参数公开的按总参数分：小 ≤15B、中 15–100B、大 >100B。
   - 参数不公开的闭源旗舰进"前沿"档。
   - 图像、音乐、语音在 RAW 里本来就没有 frontier 行，继续只用三档。`classOnly` 实际只有 LLM 小团队目标在用。
2. **量级榜怎么算：先筛量级，再按 org 取该量级里最强一款，只收 24 个月内发布的。**
   - 现行 `leaderboard(cls)` 先取每家最新一款，再按量级过滤。一家只会出现在它最新型号所在的那一档。
   - 24 个月窗口对应真实榜单的"当前/下架"概念：AA 排行榜默认 Status 为 Current，Arena 政策里模型下线一个月后会被撤榜（[Arena 政策](https://arena.ai/company/policy/)，我只读到搜索摘要，待核实原文）。
3. **用游戏自己的 `leaderboard()` 实测，现在"同量级前三"形同虚设。**

   | 玩家 | 日期 | small 档对手数 | mid 档对手数 |
   |---|---|---|---|
   | RWKV | 2024-06 | 2 | 5 |
   | Perplexity | 2025-02 | 2 | 4 |
   | NovelAI | 2026-04 | 2 | 2 |
   | Jev | 2026-04 | 2 | 2 |
   | Perplexity | 2026-04 | 2 | 1 |

   - 对手 ≤2 家时，玩家加上自己最多 3 行，必然"前三"。
   - 改成"先筛量级再取最强（24 个月内）"后：2024-06 的 small 档有 9 家，2026-04 的 mid 档有 9 家。
   - small 档 2025 年起仍只有 2–3 家，因为 RAW 里 2025 年后几乎没有小模型。
4. **补数据与过渡规则**
   - small、mid 两档每个时间点至少要有 6 家当前型号。
   - 候选之一是 Qwen3 全系，2025-04-29 发布：0.6B 到 32B 的稠密模型，加 30B-A3B 和 235B-A22B（[Qwen3 官博](https://qwenlm.github.io/blog/qwen3/)）。
   - gpt-oss-20b/120b（2025-08）、Gemma 3、Phi-4-mini 的规格我没核到官方页（OpenAI 官方页返回 403），待核实。分数要按各自技术报告表格换算，也待核实。
   - 补齐之前，建议目标阈值取 N = min(3, 对手数÷2 向下取整)，至少 1：2 家对手要求第一，4 家要求前二，6 家起前三。

## 为什么不并入"大"

1. **真实世界没人给闭源前沿模型分参数档。**
   - AA：尺寸档写在开源权重页，Tiny ≤4B、Small <40B、Medium 40–150B、Large >150B，那张表只列开源模型；闭源只在开源对闭源的对比图里作为一条线出现（[AA 开源模型页](https://artificialanalysis.ai/models/open-source)）。
   - Hugging Face Open LLM Leaderboard（v1 代码）：只评开源模型，尺寸档 ~1.5、~3、~7、~13、~35、~60、70+，另有一个 "?" 档放未知（[utils.py](https://huggingface.co/spaces/open-llm-leaderboard-old/open_llm_leaderboard/blob/main/src/display/utils.py)）。
   - Hugging Face Hub 的参数筛选是 <1B 到 >500B 的滑块，不是分档（[Hub 模型页](https://huggingface.co/models)）。
   - Epoch 不分档，只给估计值并标可信度：Confident 在 3 倍内、Likely 在 10 倍内、Speculative 在 30 倍内。它的"前沿"按训练算力定义（发布时排前 5），不按参数（[Epoch 数据说明](https://epoch.ai/data/ai-models)，页面抓取，引用前请对原页）。
   - Arena、LiveBench、SWE-bench 的榜单根本没有参数这一栏。
   - 所以"闭源前沿"在真实世界本来就是独立的一类，对应游戏的 `frontier`，保留单独一档就是照搬这个做法。
2. **参数大不等于强，并入"大"等于假设闭源就是最大。**
   - Epoch 2024-12 估计 GPT-4o 约 200B，Claude 3.5 Sonnet 约 400B（作者自己标了"推测"），比 GPT-4 的约 1.8T 小一个数量级（[Epoch 文章](https://epoch.ai/gradient-updates/frontier-language-models-have-become-much-smaller)）。
   - Llama 3.3 70B 对 3.1 405B（[官方模型卡](https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct)）：

     | 基准 | 3.3 70B | 3.1 405B |
     |---|---|---|
     | IFEval | 92.1 | 88.6 |
     | GPQA Diamond | 50.5 | 49.0 |
     | MATH | 77.0 | 73.8 |
     | MMLU | 86.0 | 88.6 |
     | HumanEval | 88.4 | 89.0 |

   - 开源这边反而有超大模型：AA 开源页里 MiMo-V2.6-Pro 总参数 1.0T、激活 42B。
   - 这正是"实力最强的就是当前旗舰，而不是参数最大的"。
3. **同量级目标会被前沿闭源模型挤掉。**
   - large 档单独算，第 3 名的综合分 2026-04 是 89.7，2026-10 是 92.7。
   - 并入 frontier（约 8–9 家，含 GPT、Claude、Gemini）后变成 92.9 和 96.3，抬高 3.2 到 3.6 分。
   - 小团队选 `m670`、`m1t` 这类"大"档规模，或像 NovelAI 的 Xialong 本来就是 large 档，就等于要和前沿实验室比，违背"小团队只和同量级比"的设计。
   - 年度评审里小团队的能力分（`game.js:1834`）也用同量级名次，并入会让它失真。

## 必须同步改的两处（否则分档名存实亡）

- **玩家永远不会被分到"前沿"档。**
  - `SCALES.llm` 里 `f2t` 写了 `cls:'frontier'`，但 `game.js:244` 对 LLM 用 `weightClass(total)` 覆盖，而 `weightClass` 只返回 small、mid、large。
  - 结果是前沿实验室玩家的 2T 模型显示为"大型"，量级名次拿去和十几家 large 的开源对手比，`office.js:59` 和榜单页的"前沿"筛选键也对不上。
  - 建议 LLM 的 cls 取规模表里写明的值（`f2t` 得 frontier），其余按总参数。
- **large 的下限建议从 >100B 改成 >150B，与 AA 的 Large 一致。**
  - 数据里 gpt-oss-120b 标的是 mid，总参数约 117B，而 `weightClass(117)` 返回 large，标签和规则对不上。
  - 玩家可选规模在 70B 和 236B 之间没有选项，所以这个改动不影响玩家。

# 待核实（没拿到原文）

- AA 尺寸档按总参数还是激活参数，页面没写。AA 排行榜上"Size"下拉的选项原文也没读到，只看到过滤器存在。
- `arena.ai` 返回 403。Arena 是否有"按实验室"的视图、列的具体标签，没核到官方页，License 和 Provider 列只见于第三方快照。Arena 政策只读到搜索摘要。
- Open LLM Leaderboard v2 的尺寸筛选档位没核到，只核实了 v1 代码，退役的 [Fourrier 帖子](https://threadreaderapp.com/user/clefourrier)也只读到搜索摘要。
- OpenCompass、SuperCLUE 的开源闭源与参数分组，没查到权威页面，未采用。
- LiveBench 官网是 JS 渲染，没读到行结构，只引用了论文摘要。
- Epoch 的"前沿"定义（前 5）来自页面抓取，请对原页。
- 2025-08 之后的小模型（gpt-oss-20b、Gemma 3/4 小号、Qwen3.5 小号等）规格与分数均未核实。

相关代码：`/Users/mac/model-raising-plan/src/career/sim/model.js`（`leaderboard`、`clsOf`）、`src/career/data/core.js`（`SCALES`、`weightClass`、`WEIGHT_CLASSES`）、`src/career/sim/game.js:244, 1794, 1834`、`src/career/sim/advisor.js`（`goalTarget`）、`src/career/ui/office.js:59, 160`。

---

# 核对

# 核对报告：榜单口径与量级分档（board）

核对方式：用 `sota_check.mjs` 里 fixes/adds 修订后的数据，直接 import 项目的 `rivals.js`、`core.js`、`model.js` 重算，没有复制项目、没有 npm install。临时脚本已删除。网络出处逐条抓了原页。

## 一、核对表

### A. 游戏数据复算（qOf 及榜单结构）

| 条目 | 原文 | 核实结果 | 出处 | 是否有误 |
|---|---|---|---|---|
| 轻量版 vs 旗舰分 | Gemini 3.5 Flash 91.9 对 3.1 Pro 92.9；Sonnet 5 94.1 对 Opus 4.8 94.5；Llama 3.3 70B 66.5 对 3.1 405B 68.1 | 复算 91.88/92.86、94.12/94.46、66.54/68.08，一致 | `rivals.js` + `sota_check.mjs` 的 qOf | 无误 |
| gpt-oss-120b 对 GPT-5、Seed-OSS-36B 对 Seed 1.6 | 只写"对" | 复算 78.5 对 88.8、73.9 对 83.0 | 同上 | 无误 |
| 最新款不是综合最强的占比 | 938 个家族×月份中 34 个（3.6%） | 938 个一致。34 个要把新增行的日期统一成"年-月"才复现；保留 `sota_check` 里的具体日期则是 29 个（3.1%） | 同上 | 无误，需注明口径 |
| "取最新"与"逐基准取最强"的前三名单差异 | Arena 5/34、MMLU-Pro 9/29、GPQA 12/34、AIME25 9/21、SWE-bench Verified 6/27、HLE 10/22 | 六项全部一致，用 `rivalScore` 逐月重算，按家族或按 org 结果相同 | `benchmarks.js` + `model.js rivalScore` | 无误 |
| 综合取一款与逐基准取最强的前三名单差异 | Arena 1/34、GPQA 6/34、AIME25 3/21、SWE-bench Pro 0/14、Terminal-Bench 0/18 | 五项全部一致 | 同上 | 无误 |
| 抬高对手分数（Arena Elo 标度） | 第 3 名平均 +2.7（最大 +19），第 12 名平均 +2.5（最大 +15） | 只部分复现。第 3 名：+2.6 到 +3.0，最大 19，对得上。第 12 名：均值 +2.7 到 +3.9，最大 15 到 19。方向和量级对，第 12 名均值偏低 | 同上 | 数字不精确，不影响结论 |
| "同量级前三"形同虚设（现行 `leaderboard()` 的小档/中档对手数） | RWKV 2024-06 为 2/5；Perplexity 2025-02 为 2/4；NovelAI 2026-04 为 2/2；Jev 2026-04 为 2/2；Perplexity 2026-04 为 2/1 | 用游戏自己的 `leaderboard()` 复算，五行完全一致 | `model.js leaderboard` | 无误 |
| 新规则后的家数 | 2024-06 小档 9 家，2026-04 中档 9 家 | 一致，以 Jev 为玩家算。RWKV 作玩家时小档是 8 家，因为 RWKV 自己被排除 | 同上 | 无误 |
| 新规则后小档的时间走势 | small 档"2025 年起仍只有 2–3 家" | 与 24 个月窗口规则下的实际不符。2025-01 到 06 是 9 家，07 是 8，08 是 7，09 是 5，10 是 4，11 到 2026-01 是 3，2026-02 起才是 2。"2025 年后 RAW 几乎没有小模型"成立：2025 年只有 3 个小模型，2026 年只有 Jev | 同上 | 有误（时间点） |
| large 档第 3 名分数 | 2026-04 为 89.7，2026-10 为 92.7；并入前沿后 92.9 和 96.3，抬高 3.2 到 3.6 | 四个数一致，按家族、`ownerOf`、公司三种分组口径结果相同。前沿 8 到 9 家也对 | 同上 | 无误 |
| gpt-oss-120b 的标签 | 数据标 mid，`weightClass(117)` 返回 large | 属实 | `rivals.js`；`core.js:386` | 无误 |
| 玩家永远分不到"前沿"档 | `f2t` 写 `cls:'frontier'`，但 `game.js:244` 对 LLM 用 `weightClass(total)` 覆盖 | 属实。但只改 `game.js:244` 不够，见更正 2 | `core.js:129`；`game.js:244`；`model.js:58` | 结论对，漏了一处 |
| 玩家规模在 70B 与 236B 之间没有选项 | 改 large 下限不影响玩家 | 属实：`d70` 之后就是 `m230`（236B） | `core.js SCALES` | 无误 |
| 图像/音乐/语音没有 frontier 行；`classOnly` 只有 LLM 小团队在用 | 同左 | 属实。非 LLM 的量级只有 large 47、mid 22、small 8 行。`classOnly` 只出现在 `goals.js` 的小团队目标和 `game.js:276` | `rivals.js`；`goals.js` | 无误 |
| 单位用 org（`ownerOf`） | "Claude 和 Fable、DeepSeek 大肥鱼和小肥鱼各占两行"，改用 `ownerOf` | 现象属实，但 `ownerOf` 只合并了 DeepSeek。`ownerOf('claude')` 是 claude，`ownerOf('fable')` 是 fable，Gemini 与 Gemma 同样分开 | `core.js OWNER_OF`；`v1.0-spec.md` D1 | 有误（见更正 1） |
| 每个榜单约 0.22 毫秒 | 同左 | 我测的是 0.13 毫秒，同一量级，与机器有关 | 本机实测 | 无误 |
| 代码位置 | `game.js:1794`、`game.js:1834`、`office.js:59`、`office.js:160`、`goals.js T(3,12,15,3)`、`calibrate.mjs` | 全部属实 | 代码读取 | 无误 |

### B. 网络出处

| 条目 | 原文 | 核实结果 | 出处 | 是否有误 |
|---|---|---|---|---|
| AA 总指数权重 | v4.3.2，10 项评测，Agents 30%、Coding 20%、科学推理 20%、通用 30% | 一致。页面原话是"v4.3.2 incorporates 10 evaluations" | [AA 方法页](https://artificialanalysis.ai/methodology/intelligence-benchmarking) | 无误 |
| AA 尺寸档 | Tiny ≤4B、Small <40B、Medium 40–150B、Large >150B；页面没写按总参数还是激活参数 | 一致，页面确实没写口径 | [AA 开源页](https://artificialanalysis.ai/models/open-source) | 无误 |
| MiMo-V2.6-Pro | 总参数 1.0T、激活 42B | 一致 | 同上 | 无误 |
| AA 榜单一行一个推理档位 | Opus 5.5 的 max/xhigh/high/medium/low 各一行 | 一致。页面还显示 Status 默认 Current、Size 默认 All，选项原文页面没列，与原文"没读到选项"一致 | [AA 榜单](https://artificialanalysis.ai/leaderboards/models) | 无误 |
| AA 默认只画 27 个 | 706 个里画 27 个 | 一致。页面 FAQ 另有"134""273"两个口径不同的数 | [AA 模型页](https://artificialanalysis.ai/models) | 无误 |
| Llama 3.3 70B 对 3.1 405B | IFEval 92.1/88.6、GPQA Diamond 50.5/49.0、MATH 77.0/73.8、MMLU 86.0/88.6、HumanEval 88.4/89.0 | 十个数全部一致 | [官方模型卡](https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct) | 无误 |
| Epoch 估计 | 2024-12，GPT-4o 约 200B，Claude 3.5 Sonnet 约 400B（推测），GPT-4 约 1.8T，"比 GPT-4 小一个数量级" | 数字和日期（2024-12-13）一致。GPT-4o 约小 9 倍，作者自称"可能差 2 倍"。Claude 3.5 Sonnet 只小约 4.5 倍，不到一个数量级 | [Epoch 文章](https://epoch.ai/gradient-updates/frontier-language-models-have-become-much-smaller) | 措辞偏夸大（见更正 5） |
| Epoch 置信度与前沿定义 | Confident 在 3 倍内、Likely 在 10 倍内、Speculative 在 30 倍内；前沿 = 发布时训练算力前 5 | 一致，页面原话 | [Epoch 数据说明](https://epoch.ai/data/ai-models) | 无误 |
| Epoch 基准中心 | 410 个模型，只收聊天/指令版，主要大厂旗舰优先；有仅前沿趋势线开关，可按机构、国家、开放程度着色 | 一致。着色选项是 Country、Organization、Accessibility，"开放程度"是对 Accessibility 的推断 | [Epoch 基准中心](https://epoch.ai/benchmarks) | 无误 |
| Qwen3 | 2025-04-29，0.6B 到 32B 稠密，加 30B-A3B 和 235B-A22B | 一致，稠密是 0.6、1.7、4、8、14、32B | [Qwen3 官博](https://qwenlm.github.io/blog/qwen3/) | 无误 |
| gpt-oss-120b 规格 | 总参数约 117B，2025-08 | 总参数 116.8B，激活 5.1B，2025-08-05 发布，Apache 2.0。NVIDIA 页把激活写成 5.7B，与 OpenAI 的 5.13B 不一致 | [OpenAI 模型卡 arXiv 2508.10925](https://arxiv.org/pdf/2508.10925)，搜索摘要 | 无误 |
| HF Open LLM Leaderboard v1 尺寸档 | ~1.5、~3、~7、~13、~35、~60、70+，另有 "?" 档 | 一致，边界为 2、4、9、20、45、70 | [utils.py](https://huggingface.co/spaces/open-llm-leaderboard-old/open_llm_leaderboard/blob/main/src/display/utils.py) | 无误 |
| HF Hub 参数筛选 | <1B 到 >500B 的滑块 | 标签为 "<1B、6B、12B、32B、128B、>500B"，是否滑块是推断 | [Hub 模型页](https://huggingface.co/models) | 无误 |
| LiveBench | 闭源若干加 0.5B–405B 几十个开源模型 | 一致 | [论文 2406.19314](https://arxiv.org/abs/2406.19314) | 无误 |
| Arena 唯一名次加区间 | 同左 | 一致，原话是 raw rank 加 rank spread | [Arena ranking method](https://arena.ai/blog/ranking-method) | 无误 |
| SWE-bench 的 Bash Only | 用统一脚手架比纯模型 | 搜索摘要显示它用 mini-SWE-agent 固定脚手架。我直接抓 bash-only 页得到 404，但搜索结果里有该页。experiments README 说它是 Verified 榜上的一个过滤视图。README 没有明说"模型加脚手架"是条目定义，那是推断 | [experiments README](https://github.com/SWE-bench/experiments)、[Bash Only 页](https://www.swebench.com/bash-only.html) | 基本无误 |
| Arena 下线一个月撤榜 | Arena 政策里模型下线一个月后会被撤榜 | 这句话来自 2024-03 的旧政策。现行政策（页面标注 2026-09-01 更新）只写"保留下线模型的权利"，下线条件包括不再公开可用、同系列有新型号、有更便宜且严格更好的模型。另有规则：公开发布的模型 API 至少开放 30 天，否则撤榜 | [现行政策](https://arena.ai/blog/policy)、[旧政策](https://www.lmsys.org/blog/2024-03-01-policy) | 有误（见更正 4） |

## 二、需要更正的地方

1. **org 单位不能用 `ownerOf`，要用 `FAMILIES[f].company`。**
   - 实测 `ownerOf` 只合并 DeepSeek 的 pro 和 flash。
   - Claude 和 Fable 仍是两个 org，Gemini 和 Gemma 也是。
   - 按 `FAMILIES[f].company` 分组，会合并 Anthropic（claude+fable）、Google（gemini+gemma）、深度求索（deepseek_pro+deepseek）。
   - v1.0 规格 D1 本来就打算给 COMPANIES 加 `org` 字段，也该用它。
   - large 第 3 名的 89.7、92.7、92.9、96.3 在三种分组下都一样，所以不影响那几个数字。

2. **前沿档的修复要改两处，不是一处。**
   - 除了 `game.js:244`，`model.js:58` 的 `clsOf` 对 LLM 也直接返回 `weightClass(model.total)`，不读 `model.cls`。
   - 只改 `game.js:244` 的话，`office.js:59`、榜单页的前沿筛选键、量级名次都还是拿到 large。
   - 两处都要改。

3. **"large 下限改 >150B"会造成新的标签冲突。**
   - 数据里 Command R+ 和 Mistral Large 2 标的是 large。
   - Command R+ 是 104B（[HF 模型卡](https://huggingface.co/CohereLabs/c4ai-command-r-plus)），Mistral Large 2 是 123B（[Mistral 官方页](https://mistral.ai/news/mistral-large-2407)），按 >150B 都该是 mid。
   - 改下限能修好 gpt-oss-120b，却同时让这两行不一致。
   - 要么这两行一并改成 mid，要么保持 >100B、只把 gpt-oss-120b 改成 large。
   - "与 AA 一致"也只对最上面一档：AA 的 Small 是 <40B，游戏是 ≤15B，Medium 的下限也对不上。

4. **Arena 的"一个月撤榜"不能当成现行政策。**
   - 现行政策是自由裁量，但明确允许"同系列有新型号时下线"，这和"按家族取最新"方向相近。
   - 24 个月窗口是游戏自己的设计，没有真实榜单出处，原文应写成"设计取值"。

5. **小档家数的时间点要改。**
   - 应写成"24 个月窗口下，2025-11 起降到 3 家，2026-02 起降到 2 家"。
   - 更要紧的是，补数据的需求从 2025 年下半年开始，不是 2025 年初。

6. **措辞微调。**
   - Epoch 估计里，GPT-4o 比 GPT-4 小约一个数量级，Claude 3.5 Sonnet 只小约 4.5 倍。
   - 第 12 名的"平均 +2.5 分"建议改成"约 +2.5 到 +4 分，随窗口而定"。
   - 34/938 要注明新增行的日期按"年-月"算。

## 三、整体可信度评价

**高。** 抽查约 30 处，只发现 3 处实质问题，都在推荐方案的细节上。

- **算出来的数字几乎全对：** 938 与 34（3.6%）、所有型号分数、两张前三名单差异表、同量级对手数表、large 第 3 名的四个分数，我从项目数据独立复算，全部一致。唯一对不上的是 Arena 第 12 名的平均抬高分数。
- **外部出处基本无误：** AA 权重与尺寸档、Llama 模型卡的十个数、Epoch 的置信度与前沿定义、Qwen3 日期与阵容、gpt-oss 规格、HF v1 尺寸档，都能在原页对上。原文标"待核实"的几项，我也没发现与之矛盾的证据。
- **实质问题集中在推荐方案：**
  - `ownerOf` 并不能把 Claude 和 Fable、Gemini 和 Gemma 合成一家。
  - 前沿档修复漏了 `clsOf`。
  - >150B 的建议会让 Command R+ 和 Mistral Large 2 的标签对不上。
  - Arena"一个月撤榜"来自旧政策。
- **结论仍然成立：** 榜单按基准取每家最强、闭源前沿单独一档、旗舰按综合分取一款。按更正 1 到 3 修改后可以采用。

**未重新核实：**
- 2025-08 之后小模型（gpt-oss-20b、Gemma 4、Qwen3.5 小号等）的规格与分数，原文也是"待核实"。
- OpenCompass、SuperCLUE 的分组，原文没有采用。
- AA 尺寸档按总参数还是激活参数，AA 页面确实没写。

临时文件夹已清理，项目目录未做任何改动。