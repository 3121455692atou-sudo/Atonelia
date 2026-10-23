# 13 个国产家族旗舰核对：真实最强 vs 游戏 qOf 最强

**口径**：qOf 按 D1 固定权重，并套用 sota_check.mjs 里的 fixes/adds。真实强弱优先看同一版本的 Artificial Analysis（AA）指数 v4.3.2，再看模型卡、论文和 Arena。这 13 家全是语言模型，图像、音乐、语音不涉及。没有核对 jev/TypeSafe AI、Fable 线（不在这 13 家里）。

## 表 1：家族 × 月份（只列不一致或接近的行）

| 家族 | 月份 | 真实最强 | 游戏 qOf 最强 | 一致？ |
|---|---|---|---|---|
| deepseek_pro | 2025-03 | R1（01-20） | V3-0324 79.64（R1 只有 76.92） | 不一致 |
| qwen | 2025-03 | QwQ-32B（03-06，表里没有） | Qwen2.5-Max 74.34 | 不一致（缺行） |
| qwen | 2024-11 | 接近：QwQ-32B-Preview 的 GPQA/AIME 强，Qwen2.5-72B 的知识/写作强 | Qwen2.5-72B 71.16（QwQ-P 65.16） | 接近，不改 |
| deepseek / deepseek_pro | 2026-07 | V4 Flash 0731（AA 34） | V4-Pro 预览 90.54（Flash-0731 只有 86.78） | 不一致 |
| deepseek_pro | 2026-08 | V4 Pro 0813（AA 36，高于 Flash-0731 的 34） | Pro-0813 93.12 | 一致 |
| deepseek / deepseek_pro | 2026-09 | V4.1 Flash（AA 39，高于 Pro-0813 的 36） | Pro-0813 93.12（Flash 只有 88.90） | 不一致 |
| deepseek | 2026-10 | V4.1 Flash 1017（AA 45，表里没有） | V4.1-Flash 88.90 | 不一致（缺行） |
| qwen | 2026-09 | Qwen3.8 Max 0902（AA 45，高于 0803 的 40） | Qwen3.8-Max 93.34 | 不一致（缺行） |
| minimax | 2026-10 | M3.1 Flash（AA 43，高于 M3 的 29） | M3 89.36 | 不一致（缺行） |
| glm | 2024-08 | GLM-4-Plus（表里没有） | GLM-4 62.04 | 不一致（缺行，待核实） |
| yi | 2024-10 | Yi-Lightning（Arena 总榜第 6，表里没有） | Yi-Large 62.52 | 不一致（缺行） |
| baichuan | 2024-05 | Baichuan 4（表里没有） | Baichuan 3 59.28 | 不一致（缺行，待核实） |
| hunyuan | 2025-12 | HY 2.0（12-05，表里没有） | Hunyuan-T1 75.20 | 不一致（缺行，数值待核实） |
| deepseek（Flash 线） | 2025-01 | 接近：R1-Distill-Qwen-32B 与 Llama-70B 几乎打平 | Qwen-32B 68.40 | 接近，不改 |
| rwkv | 2025-03 | 接近：Goose 2.9B 追平 Finch 14B | Finch 14B 43.60（Goose 40.96） | 接近，不改 |
| qwen | 2025-09 | 接近：Qwen3-Max 与 235B-2507-Thinking | Qwen3-Max 86.80 | 接近，不改 |
| qwen | 2026-02 | 接近：Qwen3.5-397B 与 Qwen3-Max-Thinking（表里没有） | Qwen3.5 88.64 | 接近，不改 |
| ernie | 2026-05 | 文心 5.1（参数只有 5.0 的约 1/3，反而更强） | 5.1 85.22（5.0 为 80.68） | 一致 |
| glm | 2026-08 | GLM-5.3（753B）强于 5.3-Flash（320B） | GLM-5.3 | 一致 |

## 表 2：四个剧本开局日（v1.0 按日取 familyBest）

- **2023-01**：13 家在游戏里都没有在线模型，设计如此，不改。真实有 GLM-130B（2022-08）等老模型，我没有查。
- **2024-01**：表内全部一致（67B、Qwen-72B、Kimi Chat、ChatGLM3-6B 等）。真实在线旗舰可能比开源小号更强，涉及 ChatGLM3 大号 API、通义千问 2.0、Baichuan2-Turbo。我没找到可靠数字，待核实，不改。
- **2025-01**：
  - 不一致三家：glm 应为 GLM-4-Plus，yi 应为 Yi-Lightning，baichuan 应为 Baichuan 4，都是缺行。
  - 其余：deepseek_pro 的 V3、qwen 的 Qwen2.5-72B、stepfun 的 Step-2、rwkv 的 Finch 14B 都一致。
  - kimi、minimax、seed、hunyuan、ernie 我没找到更强的已验证型号，待核实。
- **2026-01**：只有 hunyuan 不一致，该用 HY 2.0 而不是 T1。rwkv 的 G0 13.3B（2025-10）可能比 G1 7B 强，但官方卡没给跑分，待核实。其余 11 家一致。
- 现行 game.js 对 y2023–y2025 用 latestRelease 按月取最新，会取到开局之后才发布的型号（如 R1 在 01-20、GLM-4 在 01-16）。v1.0 改按日后与上面一致。

## 修订清单

所有改动用 sota_check 同款逻辑重算过：开源 LLM 间隔 1.5、闭源跟随者 1.0，全部 LLM 行 0 违规。R1 仍低于 o1 减 1，V3-0324 仍高于 V3。

1. **V3-0324 压到 R1 之下**
   - 改 `DeepSeek-V3-0324` 的 dims：[86,84,80,82,64,55] 改成 [85,80,80,78,64,45]，qOf 79.64 变 76.46。
   - 这样 R1 76.92 高于 V3-0324 76.46，V3-0324 仍高于 V3 的 74.26。数学维没动，换算出的 AIME 约 58，真实 59.4。
   - 出处：
     - R1 的 MMLU-Pro/GPQA/AIME/LiveCodeBench 为 84.0/71.5/79.8/65.9（[R1 模型卡](https://huggingface.co/deepseek-ai/DeepSeek-R1)）。
     - V3-0324 为 81.2/68.4/59.4/49.2（[V3-0324 卡](https://huggingface.co/deepseek-ai/DeepSeek-V3-0324)）。
     - AA v4.3.2 上 R1（1 月版）11，V3-0324 为 10（[R1 页](https://artificialanalysis.ai/models/deepseek-r1-0120)、[V3-0324 页](https://artificialanalysis.ai/models/deepseek-v3-0324)）。旧版 v4.1 为 19 对 15，来自搜索摘要，待核实。
   - 原因：V3-0324 的写作和 Agent 维分数偏高，把 qOf 抬过了 R1。

2. **新增 QwQ-32B**
   - 新行：`['qwen','2025-03','QwQ-32B','mid',1,[80,79,86,78,58,40],'budget']`，发布日 03-06，标签 R,S,LP，qOf 75.86。
   - 它高于 Qwen2.5-74.34，低于 R1 76.92。
   - 出处：
     - [Qwen 官方博客](https://qwenlm.github.io/blog/qwq-32b/)称与 R1 相当。
     - [Qwen3 技术报告](https://arxiv.org/abs/2505.09388)表 11/13：QwQ-32B 的 AIME24 79.5、LCB v5 62.7、LiveBench 72.0、BFCL 66.4、GPQA 65.6，R1 为 79.8、64.3、71.6、56.9、71.5。
     - [Qwen2.5-Max 博客](https://qwenlm.github.io/blog/qwen2.5-max/)只说它略胜 V3，具体数字在图里，待核实。
   - 副作用：
     - QwQ-32B 与世界 SOTA 差 6.4，大于 ms_open_reasoning_frontier 的门槛 4，不会抢这个里程碑。
     - D4.5 的断言需要复跑一遍。

3. **DeepSeek 2026 下半年的 Flash/Pro 顺序（AA v4.3.2 同一口径）**
   - 真实顺序：Flash-0420 为 24，Pro-0424 为 30，Flash-0731 为 34，Pro-0813 为 36，V4.1-Flash 为 39，V4.1-Flash-1017 为 45。
   - 出处：
     - [flash-0420 对比页](https://artificialanalysis.ai/models/comparisons/deepseek-v4-flash-0420-vs-deepseek-v4-pro)：Pro 0813 为 36，Flash 0420 为 24。
     - [v4-1-flash 对比页](https://artificialanalysis.ai/models/comparisons/deepseek-v4-1-flash-vs-deepseek-v4-pro-0424)：V4.1 Flash 为 39，Pro 0424 为 30。
     - [Flash 页](https://artificialanalysis.ai/models/deepseek-v4-flash)为 34，[1017 页](https://artificialanalysis.ai/models/deepseek-v4-1-flash-1017)为 45。
     - AA 自己的发布帖说 V4.1 Flash 取代 Pro 成为新旗舰（[X 帖，转引自搜索结果](https://x.com/ArtificialAnlys/status/2098148674203488422)）。
     - [Rundown](https://www.therundown.ai/news/deepseek-v4-1-flash-ai-pricing)：9 月 14 日起 Pro 请求路由到 Flash。
     - 旧版 v4.1 上 Flash-0731 为 50、Pro 为 44（[eesel](https://www.eesel.ai/blog/deepseek-v4-flash-vs-v4-pro)）。
   - 改动（括号里是改前 qOf 变改后）：

     | 行 | 新 dims | qOf 变化 |
     |---|---|---|
     | Flash-0731 | [92,95,94,82,67,93] | 86.78 变 91.02 |
     | Pro-0813 | [93,93,94,86,72,91] | 93.12 变 91.44 |
     | V4.1-Flash | [92,94,95,85,69,95] | 88.90 变 91.92 |

   - 新增行：`['deepseek','2026-10','DeepSeek-V4.1-Flash-1017','large',1,[93,95,96,85,70,96],'budget']`，发布日 10-17，qOf 92.70。
   - 注意：Pro-0813 要降 1.7 分，因为它的 AA 36 比 Kimi K3 的 44、GLM-5.3 的 45 低很多，原来的 93.12 偏高。
   - 如果只想动 Flash 行，也可以不降 Pro，把 V4.1-Flash 抬到 93.3 以上。代价是它会反超 K3 和 GLM-5.3，与真实不符。

4. **新增 Qwen3.8 Max 0902**
   - 新行：`['qwen','2026-09','Qwen3.8-Max（0902）','frontier',0,[95,95,96,88,76,95],'standard']`，发布日 09-02，qOf 93.68，高于 0803 的 93.34。
   - 出处：[AA 0902 页](https://artificialanalysis.ai/models/qwen3-8-max)为 45，[0803 页](https://artificialanalysis.ai/models/qwen3-8-max-0803)为 40。
   - 另有一点：8 月 12 日 2.4T-A95B 已放出权重（[Slash Digital](https://slash-digital.io/en/insights/open-weight-models-2026/)，二手，待核实）。游戏里 3.8-Max 仍标闭源，可选补一行开源行。

5. **新增 MiniMax-M3.1-Flash**
   - 新行：`['minimax','2026-10','MiniMax-M3.1-Flash','large',0,[93,95,95,84,68,95],'budget']`，发布日 10-19，qOf 92.14，高于 M3 的 89.36。
   - 出处：[AA M3.1-Flash 页](https://artificialanalysis.ai/models/minimax-m3-1-flash)为 43，闭源；[M3 页](https://artificialanalysis.ai/models/minimax-m3)为 29，开源。[The Decoder](https://the-decoder.com/minimax-m3-1-flash-shows-chinas-ai-price-race-has-no-floor-in-sight/)说权重计划 10-23 放出，待核实。

6. **新增 Yi-Lightning**
   - 新行：`['yi','2024-10','Yi-Lightning','large',0,[78,66,64,82,64,15],'budget']`，发布日 10-16，qOf 65.60，高于 Yi-Large 的 62.52。
   - 出处：[arXiv 2412.01253](https://arxiv.org/abs/2412.01253)，Arena 总榜第 6，中文/数学/代码/难题类 2–4 名。dims 是按 Arena 位置估的，待核实。

7. **新增 GLM-4-Plus（待核实）**
   - 新行：`['glm','2024-08','GLM-4-Plus','large',0,[81,68,62,78,66,26],'standard']`，发布日 08-28，qOf 66.70，高于 GLM-4 的 62.04，低于 Llama 3.1 405B 的 68.08。
   - 出处：[KDD 介绍转述](https://jiweipreview.laoyaoba.com/n/915477)说与 GPT-4o、Llama3.1-405B 相当，SuperBench 九月榜前三。只有二手来源，数值待核实。

8. **新增 Baichuan 4（待核实）**
   - 新行：`['baichuan','2024-05','Baichuan 4','large',0,[80,64,62,76,64,12],'standard']`，发布日 05-22，qOf 63.48。
   - 出处：[量子位](https://www.qbitai.com/2024/05/145905.html)报 SuperCLUE 80.64，略超 GPT-4-Turbo；[IT之家](https://www.ithome.com/0/769/899.htm)。7 月半年报只排国内并列第 4（[pedaily](https://news.pedaily.cn/20240712/89763.shtml)），厂商口径，待核实。

9. **新增 HY 2.0（数值待核实）**
   - 新行：`['hunyuan','2025-12','Hunyuan HY 2.0（Think）','large',0,[86,84,89,80,70,72],'budget']`，发布日 12-05，qOf 83.22，介于 T1 的 75.20 与 Hy3-preview 的 86.64 之间。
   - 出处：[IT之家](https://www.ithome.com/0/902/856.htm)、[TechNode](https://technode.com/2025/12/08/tencent-releases-hunyuan-2-0-its-next-generation-ai-model/)。406B 总参数 / 32B 激活，Think 版强于 T1-0822，但官方图表是图片，没有数字，是否开源也没查到，这里按闭源写，待核实。
   - 副作用：开局路线表 B6 里 hunyuan y2026 格子需要复核，因为开局旗舰变成了闭源模型。

10. **RWKV 不改**
    - Goose 2.9B 的 MMLU 为 55.0（[论文表 3](https://arxiv.org/html/2503.14456)），Finch 14B 为 56.05（[Featherless，二手](https://featherless.ai/models/RWKV/v6-Finch-14B-HF)），基本打平。
    - 顺手核对到：Finch 14B 的博客发布于 2024-09-03（[RWKV 博客](https://blog.rwkv.com/p/rwkv-v6-finch-14b-is-here)），游戏写的是 2024-04。
    - RWKV7-G0 13.3B 官方卡没给跑分，待核实。

11. **其他不改项**
    - R1-Distill-Qwen-32B 与 Llama-70B：AIME 72.6 对 70.0，GPQA 62.1 对 65.2，打平（[R1 卡](https://huggingface.co/deepseek-ai/DeepSeek-R1)）。
    - AA v4.3.2 上 Qwen3-Max 为 16（估计值），235B-2507-Thinking 为 13（[Max 页](https://artificialanalysis.ai/models/qwen3-max)、[235B 页](https://artificialanalysis.ai/models/qwen3-235b-a22b-instruct-2507-reasoning)）。
    - Qwen3-Max-Thinking 为 21（估计值），Qwen3.5-397B 为 18（[Thinking 页](https://artificialanalysis.ai/models/qwen3-max-thinking)、[Qwen3.5 页](https://artificialanalysis.ai/models/qwen3-5-397b-a17b)）。
    - GLM-5 为 28（估计值），GLM-5.1 为 26（[GLM-5](https://artificialanalysis.ai/models/glm-5)、[GLM-5.1](https://artificialanalysis.ai/models/glm-5-1)）。
    - 这些要么打平，要么只是估计值，不足以推翻游戏里的顺序。
    - V3.2 的真实日期是 12-01，游戏按 12-15 算，建议补进日期表。GLM-5.3 在项目时间线是 08-14，AA 页面写 08-18，待核实。

## 附：Llama 例子（你举的 3.1 405B 对 3.3 70B）

- Meta 官方卡上 405B 更强或打平：
  - 405B 的 MMLU 88.6、MMLU-Pro 73.3、HumanEval 89.0、BFCL 81.1。
  - 3.3 70B 为 86.0、68.9、88.4、77.3。
  - 3.3 70B 只在 MATH（77.0 对 73.8）、IFEval（92.1 对 88.6）、GPQA（50.5 对 49.0）上略高。
- 出处：[3.3 70B 卡](https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct)、[3.1 405B 卡](https://huggingface.co/meta-llama/Llama-3.1-405B-Instruct)。
- 游戏里 405B 的 qOf 68.08 也高于 3.3 70B，v1.0 的 familyBest 会自动选 405B。结论：y2025 开局旗舰选 3.1 405B。
- 没取到同期 LMArena 榜单，只有 Portkey 的二手页给 405B 1266 分、第 7，待核实。

**一句话总结：13 家里 8 个旗舰缺行或排序有误，其中 DeepSeek 最重要（V4.1 Flash 已经取代 Pro 成为真实旗舰）；我给了 4 处改值和 8 条新增行，经 D4 校验无违规，GLM-4-Plus、Baichuan 4、HY 2.0 三处数值待核实。**

---

# 核对

# 核对报告：audit-llm-cn（13 个国产家族旗舰）

核对范围：抽查了 28 处，远超 8 处的要求。其中 4 处用 qOf 和 sota_check 逻辑在本地复算，其余用网络查证。

- **未核实的部分：** 搜索额度在中途用完，GLM-4-Plus 的具体跑分、LMArena 榜单、Portkey 二手页没能再查。
- **临时文件：** 已删除，只用过 `/Volumes/ESD-EPA/atonelia-scratch/decisions/` 下我自己建的目录。

## 一、核对表

| # | 条目 | 原文 | 核实结果 | 出处 | 是否有误 |
|---|---|---|---|---|---|
| 1 | R1 模型卡 | MMLU-Pro/GPQA/AIME/LCB = 84.0/71.5/79.8/65.9 | 一致 | [R1 卡](https://huggingface.co/deepseek-ai/DeepSeek-R1) | 无 |
| 2 | V3-0324 模型卡 | 81.2/68.4/59.4/49.2 | 一致。V3 原版 75.9/59.1/39.6/39.2。卡上是条目不是表格 | [V3-0324 卡](https://huggingface.co/deepseek-ai/DeepSeek-V3-0324) | 无 |
| 3 | QwQ-32B 对 R1（Qwen3 技术报告） | QwQ 的 AIME24 79.5、LCB 62.7、LiveBench 72.0、BFCL 66.4、GPQA 65.6；R1 为 79.8、64.3、71.6、56.9、71.5 | 全部一致。R1 在表 11，QwQ 在表 13（表 15 同值），没有一张表同时含两者 | [arXiv 2505.09388 HTML](https://arxiv.org/html/2505.09388) | 无 |
| 4 | QwQ-32B 发布日和定性说法 | 03-06，官方称与 R1 相当 | 一致。博客正文没有数字，只有图 | [Qwen 博客](https://qwenlm.github.io/blog/qwq-32b/) | 无 |
| 5 | Qwen2.5-Max 博客 | 只说略胜 V3，数字在图里 | 一致。发布日 01-28。文字称在 Arena-Hard、LiveBench、LCB、GPQA-D 上超过 V3，MMLU-Pro 只是"有竞争力" | [Qwen2.5-Max 博客](https://qwenlm.github.io/blog/qwen2.5-max/) | 无 |
| 6 | AA v4.3.2：R1 与 V3-0324 | R1（1 月版）11，V3-0324 为 10 | 一致，发布日 2025-01-20 和 03-25 也对 | [R1 页](https://artificialanalysis.ai/models/deepseek-r1-0120)、[V3-0324 页](https://artificialanalysis.ai/models/deepseek-v3-0324) | 无，但差距只有 1 分，证据偏弱（见第二节 5） |
| 7 | AA：DeepSeek 四档 | Flash-0420 为 24，Pro-0424 为 30，Flash-0731 为 34，Pro-0813 为 36，V4.1 Flash 为 39，1017 版为 45 | 全部一致，都是 v4.3.2。1017 版为 AA 总榜第 2/121，发布日 10-17 | [0420 对比](https://artificialanalysis.ai/models/comparisons/deepseek-v4-flash-0420-vs-deepseek-v4-pro)、[4.1 对比](https://artificialanalysis.ai/models/comparisons/deepseek-v4-1-flash-vs-deepseek-v4-pro-0424)、[Flash 页](https://artificialanalysis.ai/models/deepseek-v4-flash)、[1017 页](https://artificialanalysis.ai/models/deepseek-v4-1-flash-1017) | 无 |
| 8 | Pro 请求转给 Flash | 9 月 14 日起 | 一致。V4.1-Flash 发布于 09-10，Pro 请求 09-14 04:00 UTC 转到 Flash，价格沿用 Flash，V4.1-Pro 没有日期 | [Rundown](https://www.therundown.ai/news/deepseek-v4-1-flash-ai-pricing) | 无 |
| 9 | eesel 的旧榜数字 | 旧版 v4.1 上 Flash-0731 为 50、Pro 为 44 | 数字一致（50 对 44，称"领先 6 分"）。文章没写指数版本，Pro 指的是预览版 | [eesel](https://www.eesel.ai/blog/deepseek-v4-flash-vs-v4-pro) | 部分有误："v4.1"是原作者推断，没有出处 |
| 10 | AA 发布帖说 V4.1 Flash 取代 Pro | 转引自 X 帖 | 没能核实。搜索没有找到这句话。结论本身有第 7、8 行支持 | 搜索结果未见 | 不能确认（待核实） |
| 11 | Qwen3.8 Max 两个版本 | 0902 为 45，0803 为 40 | 一致。0902 闭源，发布日 09-02。0803 闭源，发布日 08-03，页面标注已弃用 | [0902 页](https://artificialanalysis.ai/models/qwen3-8-max)、[0803 页](https://artificialanalysis.ai/models/qwen3-8-max-0803) | 无。项目时间线写 09-03（引自 OpenRouter），差一天，不影响排序 |
| 12 | MiniMax M3.1 Flash 与 M3 | M3.1 Flash 为 43 且闭源，M3 为 29 且开源；权重 10-23 放出 | 基本一致。AA 页写 43，闭源，发布日 10-19。M3 页写 29，开源，发布日 06-01。The Decoder 10-19 的文章写 42，权重 10-23 | [M3.1 页](https://artificialanalysis.ai/models/minimax-m3-1-flash)、[M3 页](https://artificialanalysis.ai/models/minimax-m3)、[The Decoder](https://the-decoder.com/minimax-m3-1-flash-shows-chinas-ai-price-race-has-no-floor-in-sight/) | 有 1 分出入（42 或 43），不影响排序 |
| 13 | Qwen3.8 开放权重 | 8-12 放权重，Slash Digital 二手，待核实 | 已核实，不用再标待核实。HF 仓库 `Qwen/Qwen3.8-2.4T-A95B` 存在，2.4T 总参数/95B 激活，是后训练模型。项目时间线记 2026-08-12 | [HF 仓库](https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B) | 原文把一手来源当二手，可上调可信度 |
| 14 | Yi-Lightning | arXiv 2412.01253，Arena 总榜第 6，中文/数学/代码/难题类 2–4 名 | 一致。中文报道称与 Grok-2-08-13 并列第 6，发布日 10-16 也对 | [arXiv](https://arxiv.org/abs/2412.01253)、[中国日报](https://cn.chinadaily.com.cn/a/202410/16/WS670f919ba310b59111d9e4be.html) | 无。dims 是估的，作者已标待核实 |
| 15 | GLM-4-Plus | 08-28，与 GPT-4o、Llama3.1-405B 相当，只有二手来源 | 一致。发布于 KDD 现场，官方说法是定性的，我没找到具体跑分 | [火山引擎转载](https://developer.volcengine.com/articles/7412467375905177654) | 无。dims 确实只能待核实 |
| 16 | Baichuan 4 | 05-22，SuperCLUE 80.64，略超 GPT-4-Turbo；7 月半年报并列第 4 | 一致。80.64 比前一名高 0.61，比 GPT-4-Turbo-0125 高 1.51。半年报得分 72，与 360gpt2-pro、豆包、Kimi 并列第 4 | [量子位](https://www.qbitai.com/2024/05/145905.html)、[澎湃/pedaily](https://news.pedaily.cn/20240712/89763.shtml) | 无。量子位文章落款 05-23，05-22 是 IT之家/DoNews 的发布日 |
| 17 | HY 2.0 | 12-05，406B/32B，Think 强于 T1-0822，是否开源没查到 | 日期、参数、"强于 T1-0822"都对，256K 上下文。但没有数字跑分。IT之家写腾讯"将开源，无时间表" | [IT之家](https://www.ithome.com/0/902/856.htm)、[TechNode](https://technode.com/2025/12/08/tencent-releases-hunyuan-2-0-its-next-generation-ai-model/) | 小误："没查到是否开源"不准确。dims 待核实，作者已标 |
| 18 | RWKV 打平 | Goose 2.9B 的 MMLU 55.0（表 3），Finch 14B 为 56.05 | 一致。表 3 是 5-shot，RWKV-6 3B 只有 28.3。Finch 14B 的 56.05 来自 Featherless，没写评测套件 | [论文](https://arxiv.org/html/2503.14456)、[Featherless](https://featherless.ai/models/RWKV/v6-Finch-14B-HF) | 无 |
| 19 | Finch 14B 发布日 | 博客 2024-09-03，游戏写 2024-04 | 博客日期对，但不是模型发布日。HF 仓库首次提交是 2024-07-21，项目时间线记 2024-07 | [RWKV 博客](https://blog.rwkv.com/p/rwkv-v6-finch-14b-is-here)、[HF 提交记录](https://huggingface.co/RWKV/v6-Finch-14B-HF/commits/main) | 有误：该改 2024-07，不是 09-03 |
| 20 | Llama 对比 | 405B 的 MMLU/MMLU-Pro/HumanEval/BFCL 为 88.6/73.3/89.0/81.1，3.3 70B 为 86.0/68.9/88.4/77.3；70B 只在 MATH、IFEval、GPQA 略高 | 全部一致（MATH 77.0 对 73.8，IFEval 92.1 对 88.6，GPQA 50.5 对 49.0） | [3.3 70B 卡](https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct) | 无 |
| 21 | R1 蒸馏小号 | AIME 72.6 对 70.0，GPQA 62.1 对 65.2 | 一致 | 同第 1 行 | 无 |
| 22 | AA 估计值那一批 | Qwen3-Max 16（估）、235B-2507-Thinking 13、Qwen3-Max-Thinking 21（估）、Qwen3.5-397B 18、GLM-5 28（估）、GLM-5.1 26 | 全部一致，估计标注也对。235B 那页发布日是 07-25 | [Max](https://artificialanalysis.ai/models/qwen3-max)、[235B](https://artificialanalysis.ai/models/qwen3-235b-a22b-instruct-2507-reasoning)、[Max-Thinking](https://artificialanalysis.ai/models/qwen3-max-thinking)、[3.5](https://artificialanalysis.ai/models/qwen3-5-397b-a17b)、[GLM-5](https://artificialanalysis.ai/models/glm-5)、[GLM-5.1](https://artificialanalysis.ai/models/glm-5-1) | 无 |
| 23 | GLM-5.3 日期与参数 | 项目 08-14，AA 页 08-18；753B 强于 5.3-Flash 320B | 一致。AA 上 GLM-5.3 为 45，GLM-5.3-Flash 为 42（The Decoder 转述）。项目时间线里 753B、320B 也对 | [GLM-5.3 页](https://artificialanalysis.ai/models/glm-5-3) | 无 |
| 24 | 文心 5.1 | 参数只有 5.0 的约 1/3，反而更强 | 基本一致。官方称总参数压缩到约 1/3、激活参数约 1/2，5 月 9 日发布。AA 没查到 | [量子位](https://www.qbitai.com/2026/05/414496.html) | 无。"更强"依据的是百度自己的说法 |
| 25 | V3.2 日期 | 真实 12-01，游戏按 12-15 | 一致。项目时间线是 2025-12-01，sota_check 里确实取 12-15 | `docs/research/timeline-2023-2026.json` | 无 |
| 26 | RWKV G0 13.3B | 2025-10，官方卡没给跑分 | 日期有误：7.2B 在 2025-10-05，13.3B 约 2025-11-30（时间线，置信度 medium）。另外时间线还有 G1c（2026-01-10）、G1i（2026-08-05）、G1k（2026-09-30），原文没提 | `docs/research/timeline-2023-2026.json` | 小误，不影响"不改" |
| 27 | qOf 复算（全部 LLM 数字） | V3-0324 79.64→76.46、R1 76.92、QwQ-32B 75.86、Flash-0731 86.78→91.02、Pro-0813 93.12→91.44、V4.1-Flash 88.90→91.92、1017 版 92.70、Qwen3.8-0902 93.68、M3.1-Flash 92.14、Yi-Lightning 65.60、GLM-4-Plus 66.70、Baichuan 4 63.48、HY 2.0 83.22 | 逐个重算，全部一致。表 1 里的旧值也全对：V3 74.26、Qwen2.5-Max 74.34、Qwen3-Max 86.80、Qwen3.5 88.64、文心 5.0/5.1 为 80.68/85.22、Finch 43.60、Goose 40.96 等 | 本地用 `rivals.js` 加 sota_check 的 fixes/adds 复算 | 无 |
| 28 | 重跑 sota_check（开源 LLM 1.5、闭源跟随者 1.0） | 全部 LLM 行 0 违规，R1<o1−1，V3-0324>V3 | 成立。整表只剩 1 条违规：音乐 Bark，原本就有，规格写明跳过。R1 与 o1 差 1.82（77.74>76.92）。V3-0324 为 76.46，高于 V3 的 74.26。QwQ-32B 距世界 SOTA 6.46，原文写 6.4，Qwen3-235B-A22B 为 3.86，都对 | 本地复算 | 无（6.4 应写 6.5，可忽略） |

## 二、需要更正或补充的地方

1. **Finch 14B 的日期：** 游戏里的 2024-04 确实错了。更正为 **2024-07**（HF 仓库 07-21 建，项目时间线也记 2024-07）。原文建议的 2024-09-03 是博客公告日，不是模型发布日。
2. **RWKV G0 13.3B：** 日期改为约 2025-11-30（7.2B 是 2025-10-05）。时间线里 2026 年还有 G1c/G1i/G1k。原文把 RWKV 的 2026-01 旗舰写成"G0 13.3B 可能比 G1 7B 强"，应补上这几个后续型号，但仍无可靠跑分，"不改"可维持。
3. **Qwen3.8 开放权重：** 删掉"二手待核实"。HF 一手仓库和项目时间线都确认 2026-08-12 放出权重，2.4T/95B。游戏里 Qwen3.8-Max 仍标闭源，可补一行开源行，由制作人定。
4. **来源标注要补：**
   - 第 9 行的"旧版 v4.1"，文章没写版本，应删去版本号或标"待核实"。
   - 第 10 行的 AA X 帖没能核实，要标"待核实"。结论本身不依赖它。
   - 第 12 行的 M3.1-Flash，AA 页写 43，The Decoder 写 42，注明两处出入。
5. **V3-0324 排在 R1 之下的证据偏弱：**
   - AA 上只差 1 分（11 对 10）。模型卡的推理跑分差距才明显（AIME 79.8 对 59.4，LCB 65.9 对 49.2）。
   - 人类偏好榜（LMArena）上 V3-0324 可能不输 R1，我没能核实。
   - 我用 benchmarks.js 的曲线回推：改后 V3-0324 的 AIME 为 57.9，和真实 59.4 接近，原文"约 58"正确。但 LCB 回推为 60.5，真实是 49.2，原文没提。想更贴真实，可把代码维从 80 再降到约 76。这样 qOf 为 75.58，仍高于 V3 的 74.26、低于 R1 的 76.92。这一项是可选的，我没实跑 D4。
6. **原文漏掉的同类问题，Qwen3.8-Max 0803（建议复核）：**
   - AA 为 40，游戏 qOf 为 93.34，高于 Kimi K3（AA 44，92.68）和 GLM-5.3（AA 45，92.80）。
   - 这和原文用来下调 Pro-0813 的理由（AA 36 却排在 K3 和 GLM-5.3 之上）是同一类。
   - 若一并处理，把 0803 降到约 92.2（例如 `[93,94,95,87,76,92]`）。
   - 0902 的 93.68 与 AA 45 持平的 GLM-5.3 相比偏高 0.9，可接受。
   - 降低只会让跟随者行更保守，不会新增 sota_check 违规。这是我按逻辑推的，没有实跑。
7. **Qwen 2026-02 判"接近不改"：** Qwen3-Max-Thinking 为 21（估计值），Qwen3.5-397B 为 18。原文对 DeepSeek 的 24 对 30 当决定性差距，这里 3 分却不改。可以接受，因为 21 是估计值，建议 AA 出实测后再看一次。
8. **HY 2.0 的开源状态：** 腾讯已说"将开源"，没有时间表。当前按闭源写合理，但不是"没查到"。

## 三、整体可信度

**高，约九成可直接采用。**

- **核对结果：** 抽查的 28 处里，数字和日期全部对上（含 AA 的 20 多个分数和日期、4 份模型卡/论文表格、Llama 数值）。qOf 逐行复算全部一致。重跑 sota_check 确认 LLM 部分 0 违规，QwQ-32B 不会抢走 `ms_open_reasoning_frontier`（差 6.46，门槛 4）。
- **核心结论站得住：** DeepSeek 下半年"V4.1 Flash 取代 Pro 成为真实旗舰"（AA 36→39→45，且 DeepSeek 官方把 Pro 请求转给 Flash）。Qwen3.8 Max 0902（45）高于 0803（40）。M3.1 Flash（43）高于 M3（29）。这几条都成立。
- **作者自己标的弱点：** GLM-4-Plus、Baichuan 4、HY 2.0 的 dims 确实没有硬数字，Yi-Lightning 的 dims 是按 Arena 排名估的。这些保持"待核实"是对的，我也没能补出数字。
- **主要不足：** 一个来源无法核实（AA 的 X 帖）。有两个小日期错误（Finch 14B、G0 13.3B）。一处遗漏的一致性问题（Qwen3.8-Max 0803）。V3-0324 压到 R1 之下的证据较弱。除这些外未发现编造或张冠李戴。