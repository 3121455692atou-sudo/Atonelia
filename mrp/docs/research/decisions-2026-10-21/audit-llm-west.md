# 旗舰核对：gpt / claude / gemini / gemma / llama / grok / mistral / phi / cohere / perplexity / novelai

**结论：8 家基本对得上，3 家有实质缺口（Meta、Cohere、Perplexity），另有几处小缺行。**

## 0. 怎么判“真实最强”

- 看三样：LMArena 文本榜、Artificial Analysis（AA）综合指数、厂商官方模型卡。三样互相矛盾时，标“接近”，不硬改。
- 游戏分数是 D3 修订后的 qOf，我用 node 直接 import `rivals.js` 算的。
- 限量内测的不算：Claude Mythos Preview（2026-04-07，只给 11 家机构）和 Mythos 5。
- “自家训练或微调的才算该家模型”：NovelAI 托管的 GLM-4.6 不算。
- 引用的数字都用 [S编号] 指向文末出处。AA 页面没标指数版本号，应是 9 月 4 日改版的 v4.2 [S28]，标“版本待核实”。
- LMArena 分数来自 openlm.ai 的汇总页（页面日期 2026-10-19）[S2]。arena.ai 原站我这边 403，打不开，待对照原站。

## 1. 表一：不一致或接近的行

| 家族 | 月份 | 真实最强 | 游戏最强（qOf） | 是否一致 |
|---|---|---|---|---|
| llama | 2024-12（3.3 70B 发布月） | Llama 3.1 405B。Meta 官方卡 9 项里 405B 赢 6 项（MMLU-Pro 73.3 对 68.9），3.3 赢 3 项（MATH 77.0 对 73.8、IFEval 92.1 对 88.6、GPQA 50.5 对 49.0）[S11]。LMArena 1286 对 1276 [S2]。AA 估计值 405B 为 7、3.3 为 8（仅估计，不可靠）[S12] | 405B 68.08，3.3 70B 66.54 | 一致（接近）。数据不用改，但开局取法要改（见表二） |
| llama | 2026-08 | Muse Spark 1.2（8-05，LMArena 1502）[S2][S15] | 游戏无此行，最强是 Spark 1.1 91.32 | 不一致，缺行 |
| llama | 2026-09 | Muse Spark 1.3（9-02，LMArena 1507，AA 48）[S1][S2][S15] | 无此行 | 不一致，缺行 |
| llama | 2026-10-12 | Muse Wonder Full（LMArena 1518，AA 56）和 Muse Wonder（1510，AA 52）。Wonder 有 API，Full 仅限 Muse Code 订阅 [S1][S2][S13] | 无此行 | 不一致，缺行 |
| llama | 2026-10-15 | Open 开放权重版（LMArena 1484，AA 39）比 Spark 1.1（1496）、1.3 都弱 [S2][S1][S14] | Open 91.54，排在 Spark 1.1（91.32）之上，成了 Meta 最强 | 不一致，排序反了 |
| cohere | 2025-03 | Command A（LMArena 1327，R+ 为 1233）[S2][S16] | 仍是 Command R+ 59.26 | 不一致，缺行 |
| cohere | 2025-08 | Command A Reasoning（8-21，开放权重）[S16] | 同上 | 不一致，缺行 |
| cohere | 2026-05 | Command A+（5-20，开放权重，AA 13，Command A 为 7）[S1][S9][S16] | 同上 | 不一致，缺行 |
| perplexity | 2024-07/08 | Llama 3.1 Sonar Huge 405B Online，基于 405B。日期来源冲突，OpenRouter 记 8 月，Prompthub 记 7-01，待核实 [S17] | pplx-70b-online 52.88（基于 Llama 2 70B） | 不一致，缺行。影响 y2025 开局 |
| perplexity | 2025-03 | Sonar Reasoning Pro，AA 12 对 Sonar Pro 的 8（均为估计）。日期来源冲突，OpenRouter 记 3-07，AA 页面写 1-28，待核实 [S17] | 同款，但月份写成 2025-04 | 一致，月份偏晚 |
| perplexity | 2026-04 | Sonar 2（自研，只在网页端，无公开跑分和底座信息）[S17] | 无 | 待核实，不改 |
| novelai | y2023 开局 | Krake（NeoX 20B，2022-03-11 发布，04-29 出 V2）在线 [S18] | 无在线模型，等 Clio（2023-05-23）训练完 | 不一致（小） |
| novelai | 2025-10 到 2026-03 | NovelAI 托管未微调的 GLM-4.6（10-02 先给 Opus 档，10-15 全档开放）[S18] | Erato（2024-09-23） | 按口径判一致，因为 GLM-4.6 是智谱的模型 |
| mistral | 2023-12 | Mistral Medium（闭源测试版，LMArena 1171，Mixtral 8x7B 为 1138）[S2][S7] | Mixtral 8x7B 50.02 | 不一致（小），缺行 |
| mistral | 2025-08 | Medium 3.1（8-13，LMArena 1401，Medium 3 为 1369；AA v3 为 21.1，Medium 3 为 18.7）[S2][S24] | Medium 3 73.10 | 不一致（小），缺行 |
| mistral | 2025-06 到 12 | Magistral Medium：AA v4.2 为 12*，Large 3 为 9，但 LMArena 是 1253 对 Large 3 的 1428 [S1][S2] | Large 3 77.60 | 接近，两个榜打架，不改 |
| gemini | 2024-09 | Gemini 1.5 Pro-002（LMArena 1320，已高于 GPT-4o-2024-05 的 1302）[S2]。发布日 9-24 为我的记忆，待核实 | 仍是 1.5 Pro 65.48，落后 GPT-4o 的 70.06 | 不一致（小），缺行 |
| gemini | 2026-05 | 3.1 Pro 和 3.5 Flash 接近。AA 发布时 3.5 Flash 为 55 [S20]，3.1 Pro 约 57（第三方表，待核实）[S20]。新版 v4.2 反过来 Flash 33 对 Pro 30 [S1] | 3.1 Pro 92.86，3.5 Flash 91.88 | 接近，判一致，不改 |
| gemini | 2026-07/08 | 3.6 Flash（1501）、3.7 Flash（1503）都不高于 3.1 Pro（1504）[S2] | 3.6 为 92.56，低于 Pro（一致）；3.7 为 93.56，高于 Pro 0.7 | 接近，不改 |
| gpt | 2025-02 | o1 和 GPT-4.5 有争议。LMArena：GPT-4.5 1415，o1 1366 [S2]。硬指标 o1 更强：GPQA 约 75，对 GPT-4.5 的 71.4；AIME24 约 74，对 36.7；SWE-bench Verified 40.9 对 38.0 [S26] | o1 78.74，GPT-4.5 74.70 | 接近，判一致 |
| claude | 2024-01 开局 | Claude 2.0 与 2.1 在 LMArena 上 2.0 高（1158 对 1146）[S2]，但 2.1 官方称幻觉减半 [S3] | 2.1 为 57.32，高于 2.0 的 56.18 | 接近，不改 |
| claude | 2026-06 | Opus 4.8 仍强于 Sonnet 5。LMArena 1503 对 Sonnet 5 Thinking 1485 [S2]。SWE-bench Pro 69.2 对 63.2，来自第三方，待核实 [S21] | Opus 4.8 94.46，Sonnet 5 94.12 | 一致（接近） |
| claude | 2025-09、2026-09 | 小反超大：Sonnet 4.5 对 Opus 4.1 是 1420 对 1419 [S2]。Opus 5.5（1526，AA 58）高于 Sonnet 5.5（1521，AA 56）和 Fable 5.1（1520，AA 53）[S1][S2] | Sonnet 4.5 88.88 高于 Opus 4.1 86.84；Opus 5.5 96.90 | 一致 |
| gemma | 2026-04 | Gemma 4 31B 对 26B A4B：LMArena 1449 对 1443 [S2]。Wikipedia 称 Arena 排名第 3 对第 6 [S8]。AA 却是 26B 17* 高于 31B 15，反过来，带星号 [S1] | 31B 79.60 | 一致（接近） |
| phi | 2024-04 | Phi-3-medium 实际 2024-05-21 发布，4 月只有 Phi-3-mini（我的记忆，待核实）。Phi-3.5-MoE（2024-08）MMLU 78.9、HumanEval 70.7、MATH 59.5，略强 [S23] | Phi-3-medium 57.28 | 一致，月份偏早；Phi-3.5-MoE 缺行（小） |
| phi | 2025-04 | Phi-4-reasoning-plus 与 Phi-4-reasoning 同日发（4-30），都比 Phi-4 强（MMLU-Pro 76.0 与 74.3 对 71.5）[S23] | Phi-4-reasoning 68.46，Phi-4 66.92 | 一致 |
| grok | 全程 | Grok-4.7 最强（LMArena 1507，AA 46）[S1][S2]。4.20、4.5、4.7 的 LMArena 分数逐代上升 [S2] | 同 | 一致。Grok-1.5 月份偏早（2024-03 是公告，5-15 才开放）[S6]，不影响旗舰 |

**gpt 补充：** GPT-6 Astra 与 GPT-6.1 Sol、GPT-6 Sol 并存时，Astra 最强（LMArena 1520 对 1516 对 1509，AA 53 对 52）[S1][S2][S10][S25]。游戏没收后两者，不影响旗舰判断，一致。

**claude 补充：** Fable 是真实存在的。Fable 5 在 2026-06-09，Fable 5.1 在 2026-09-01，游戏月份对得上 [S3]。它在 AA 上（53）低于 Opus 5.5（58），游戏的排序也一致，不改。

**jev 补充：** Jev 是真实产品，2026-09-15 发布，是决策型模型，没有通用跑分可比 [S27]。月份对得上，不改。

## 2. 表二：四个开局日

核对对象是 `startLineup`。v0.9 取“月份 ≤ 开局月的最新一款”，2026 剧本取“前半年内 qOf 最高的一款”。v1.0 D1 改成“familyBest”。

| 开局 | 一致的家族 | 不一致 |
|---|---|---|
| y2023（2023-01） | gpt（GPT-3.5）、claude、gemini、llama、grok、mistral、phi、cohere、perplexity 都没有在线模型，与现实相符 | novelai：现实有 Krake，游戏为空 [S18] |
| y2024（2024-01） | gpt（GPT-4 Turbo）、claude（2.1，接近）、gemini（1.0 Pro）、llama（Llama 2 70B）、grok（Grok-1）、phi（Phi-2）、novelai（Kayra）、perplexity（pplx-70b-online，2023-11-29 发布，游戏写 10 月，月份偏早）[S17] | mistral：现实最强是 Mistral Medium（闭源测试版），游戏是 Mixtral 8x7B |
| y2025（2025-01） | gpt（o1）、claude（3.5 Sonnet 新版）、gemini（2.0 Flash Thinking）、gemma（Gemma 2 27B）、grok（Grok-2）、mistral（Large 2）、phi（Phi-4）、cohere（Command R+，此时仍正确）、novelai（Erato） | llama：v0.9 取到 3.3 70B，现实最强是 3.1 405B；perplexity：现实是 Llama 3.1 Sonar Huge 405B Online |
| y2026（2026-01） | gpt（GPT-5.2）、claude（Opus 4.5）、gemini（3 Pro，LMArena 1492 高于 3 Flash 的 1465）、gemma、llama（Maverick）、grok（Grok 4.1）、mistral（Large 3）、phi、perplexity、novelai（按自家口径） | cohere：现实是 Command A Reasoning（开放权重，2025-08），游戏仍是 R+ |

## 3. 修订清单

**审查报告待定项 #1（Llama y2025 开局旗舰）：判 3.1 405B。** 依据是 Meta 官方卡 6 比 3 领先加 LMArena +10 [S11][S2]。游戏数据不用动，开局取法按 v1.0 D1 改成 familyBest 就对了（v0.9 的 `startRelease` 取的是“最新”，会取到 3.3 70B）。

行格式沿用 RAW 表：`[家族, 日期, 型号, 量级, 是否开源权重, [知识,代码,数学,写作,安全,Agent], 定价档]`，后面写 D3 的 tags。

### P1：改动后会影响旗舰判定

**1. Meta 的 llama 家族（出处 S1、S2、S13、S14、S15）**
- 把 `Muse Spark Open` 的 dims 从 `[93,92,94,88,82,90]` 改成 `[92,91,93,87,82,89]`，q 从 91.54 降到 90.54，低于 Spark 1.1 的 91.32。
- 新增 4 行：

```
['llama','2026-08-05','Muse Spark 1.2','frontier',0,[93,92,95,88,83,91],'standard']   // q 91.88，LMArena 1502
['llama','2026-09-02','Muse Spark 1.3','frontier',0,[94,94,96,89,83,94],'standard']   // q 93.34，LMArena 1507，AA 48
['llama','2026-10-12','Muse Wonder','frontier',0,[96,95,96,91,83,96],'standard']      // q 94.68，LMArena 1510，AA 52，tags R,C
['llama','2026-10-12','Muse Wonder Full','frontier',0,[96,97,97,92,84,97],'premium']  // q 95.68，LMArena 1518，AA 56，仅订阅，tags R,C
```

- Wonder Full 在 AA 上（56）高于 GPT-6 Astra、Fable 5.1、Gemini 4 Argon（都是 53），但 D4 要求跟随者 q ≤ 同期 SOTA 减 1。Opus 5.5 的 q 是 96.90，所以上限是 95.90，我取了 95.68，会排在这三家之下。想严格还原要加 `SOTA_EXCEPTIONS`，不建议。
- Spark 1.1 的发布日 7-16 目前只有一个来源，待核实。

**2. Cohere 家族（出处 S1、S2、S9、S16）**

```
['cohere','2025-03-13','Command A','large',1,[79,68,62,76,66,38],'standard']          // q 67.26，tags LN。具体日期待核实，论文 2025-04-01
['cohere','2025-08-21','Command A Reasoning','large',1,[81,72,82,74,66,48],'standard'] // q 73.74，tags R,LN。dims 为估算，待核实
['cohere','2026-05-20','Command A+','large',1,[84,82,84,76,68,66],'standard']          // q 79.64，tags R,E,LP，218B 激活 25B，Apache 2.0
```

- Command A 的 GPQA 是 50.51，与 Llama 3.3 70B 的 50.5 相同，MMLU-Pro 约 71（Opper 汇总，设置不明），q 夹在 3.3（66.54）与 405B（68.08）之间。
- Command A+ 的 AA 约 37，Decoder 称与 Gemma 4 31B 同档，所以 q 取 79.64，贴近 Gemma 4 31B 的 79.60。

**3. Perplexity 家族（出处 S17）**
- 新增（dims 无公开跑分，按底座估算，**待核实**）：

```
['perplexity','2024-08-01','Llama 3.1 Sonar Huge 405B Online','large',0,[80,65,58,77,68,28],'standard']  // q 64.96，tags S
```

- q 设成略低于 Sonar（65.20），避免 Sonar 之后不再是家族最强。
- `Sonar Reasoning Pro` 月份从 2025-04 改成 2025-03-07。
- `pplx-70b-online` 月份从 2023-10 改成 2023-11-29，官方博客日期。
- Sonar 2 不加，没有公开信息。

### P2：缺行，影响小

**4. Gemini**
- 新增：`['gemini','2024-09-24','Gemini 1.5 Pro-002','frontier',0,[83,70,70,80,74,30],'standard']`，q 70.26，略高于 GPT-4o 的 70.06，对应 LMArena 1320 对 1302 [S2]，tags C。发布日待核实。

**5. Mistral**
- 新增：`['mistral','2023-12-11','Mistral Medium（测试版）','mid',0,[73,54,46,68,58,8],'standard']`，q 53.98，高于 Mixtral 的 50.02 [S2][S7]。
- 新增：`['mistral','2025-08-13','Mistral Medium 3.1','mid',0,[84,77,69,80,70,52],'budget']`，q 74.44 [S2][S24]。
- Mistral Large 4 在 10-27 放权重，之后记得把 open 改成 1，目前预览阶段仍是 0 [S19]。

**6. NovelAI**
- 新增：`['novelai','2022-04-29','Krake（NeoX 20B）','mid',0,[44,12,12,58,18,0],'standard']`，q 27.72，dims 为估算，待核实。
- 它是 LLM 模态第一条，D4 第 1 条规定“此前没有发布则跳过”，但 `sota_check.mjs` 没有这个跳过分支，会把它和 Bark 一起打成 VIOL，要给脚本加 `sb===0` 就跳过的判断。

### P3：月份、命名

7. Phi-3-medium 月份改 2024-05。
8. 另加 `['phi','2024-08-20','Phi-3.5-MoE','small',1,[76,64,64,60,64,10],'budget']`（q 59.28，tags S,E,LP）。
9. Phi-4-reasoning 一行建议改叫 “Phi-4-reasoning（plus）”，同日发的 plus 版更强。

### D4 验证

- 我复刻了 `sota_check.mjs`（含 `--fix` 的 fixes/adds，修订后基线 1 条，是 Bark）。
- 套上以上全部改动后违规仍是 2 条：Bark 加上 Krake。Krake 只是“首条没有前置发布”，不是真超越。
- 其余新行、改行都满足“跟随者 ≤ 同期 SOTA 减 1”。
- 没改任何 pusher 家族（gpt、claude、gemini 等）的现有行。

### 顺带发现，不在本次修订内

- AA 上 xAI 的创建者现在叫 SpaceXAI。
- AA 上 Command A+、Gemma 4 31B、Mistral Medium 3.5 同档，游戏里 Medium 3.5 的 84.84 比 Gemma 4 31B 的 79.60 高 5 分，属于跨家族校准偏差，建议另行处理。

## 4. 出处

- [S1] AA 排行榜，2026-10-21 抓取：https://artificialanalysis.ai/leaderboards/models
- [S2] LMArena 汇总页（openlm.ai，2026-10-19）：https://openlm.ai/chatbot-arena/
- [S3] Claude 发布表：https://en.wikipedia.org/wiki/Claude_(language_model)
- [S4] Gemini 发布表：https://en.wikipedia.org/wiki/Gemini_(language_model)
- [S5] Llama 发布表：https://en.wikipedia.org/wiki/Llama_(language_model)
- [S6] Grok 发布表：https://en.wikipedia.org/wiki/Grok_(chatbot)
- [S7] Mistral 发布表：https://en.wikipedia.org/wiki/Mistral_AI
- [S8] Gemma 发布表：https://en.wikipedia.org/wiki/Gemma_(language_model)
- [S9] Cohere（Command A+ 5-20）：https://en.wikipedia.org/wiki/Cohere
- [S10] GPT-6 发布日期：https://en.wikipedia.org/wiki/GPT-6
- [S11] Llama 3.3 官方模型卡：https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct
- [S12] AA 单页：https://artificialanalysis.ai/models/llama-3-3-instruct-70b 、https://artificialanalysis.ai/models/llama-3-1-instruct-405b 、https://artificialanalysis.ai/models/mistral-large-3 、https://artificialanalysis.ai/models/gemini-3-5-flash
- [S13] Muse Wonder：https://artificialanalysis.ai/models/muse-wonder 、https://about.fb.com/news/2026/10/introducing-muse-wonder-models/ 、https://techcrunch.com/2026/10/12/meta-releases-its-first-frontier-model-muse-wonder/
- [S14] Muse Spark Open：https://huggingface.co/meta-models/Muse-Spark-Open-816B-A42B
- [S15] Spark 1.2、1.3：https://en.wikipedia.org/wiki/Muse_Spark 、https://officechai.com/ai/muse-spark-1-3-benchmarks/
- [S16] Cohere：https://docs.cohere.com/changelog/2025-08-21-command-a-reasoning 、https://the-decoder.com/cohere-open-sources-its-strongest-model-yet/ 、https://huggingface.co/CohereLabs/c4ai-command-a-03-2025
- [S17] Perplexity：https://hub-prod.perplexity.ai/hub/blog/introducing-pplx-online-llms 、https://openrouter.ai/perplexity/llama-3.1-sonar-huge-128k-online/apps 、https://openrouter.ai/ko-KR/perplexity/sonar-reasoning-pro 、https://artificialanalysis.ai/models/sonar-pro 、https://artificialanalysis.ai/models/sonar-reasoning-pro 、https://x.com/WesRoth/status/2049035898172645841
- [S18] NovelAI：https://docs.novelai.net/en/text/models 、https://journal.novelai.net/blog/
- [S19] Mistral Large 4：https://pasqualepillitteri.it/en/news/21196/mistral-large-4-launches-open-weights-late-october
- [S20] Gemini 3.5 Flash 对 3.1 Pro：https://artificialanalysis.ai/articles/gemini-3-5-flash-everything-you-need-to-know 、https://www.deeplearning.ai/the-batch/gemini-3-5-flash-pairs-smarts-with-speed 、https://benchlm.ai/md/compare/gemini-3-1-pro-vs-gemini-3-5-flash.md
- [S21] Sonnet 5 对 Opus 4.8：https://tech-insider.org/claude-opus-4-8-vs-sonnet-5-2026/
- [S23] Phi：https://huggingface.co/microsoft/Phi-4-reasoning 、https://huggingface.co/microsoft/Phi-3.5-MoE-instruct
- [S24] Medium 3.1：https://openrouter.ai/mistralai/mistral-medium-3.1:batch 、https://pricepertoken.com/compare/mistral-ai-mistral-medium-3-vs-mistral-ai-mistral-medium-3.1
- [S25] GPT 日期：https://www.gradually.ai/en/ai-models/gpt-6.1-sol/ 、https://www.neowin.net/amp/openai-to-release-gpt-56-sol-terra-and-luna-on-july-9/ 、https://framia.converge.ai/page/en-US/news/gpt-5-5-release-date
- [S26] GPT-4.5 与 o1：https://www.neowin.net/news/openai-announces-gpt-45-its-largest-and-most-knowledgeable-model-yet/ 、https://arxiv.org/pdf/2412.16720（o1 系统卡）
- [S27] Jev：https://thenewstack.io/typesafe-jev-system-one/
- [S28] AA v4.2：https://aiweekly.co/alerts/artificial-analysis-v42-doubles-private-test-weight-to-40
- Mythos Preview 限量：https://www.datalearner.com/en/benchmark-compare/claude-mythos-preview/claude-opus-4-7

临时文件已清理，只删了我自己的子目录，没碰同目录下其他任务的文件。

**一句话总结：** gpt、claude、gemini、gemma、grok、phi 和 Mistral 的主线旗舰与现实基本一致，Llama 3.1 405B 确实比 3.3 70B 强，开局按 familyBest 取 405B 即可；真正要补的是 Meta（Muse Spark 1.2/1.3、Muse Wonder 缺行，Spark Open 被排高）、Cohere（停在 2024 年的 R+，缺 Command A 三款）和 Perplexity（y2025 开局落后一代）三家，外加 Gemini 1.5 Pro-002、Mistral Medium 和 Medium 3.1、NovelAI 的 Krake 几处小缺行，这些改动按 D4 复验后没有新增违规。

---

# 核对

# 核对报告：旗舰核对（gpt / claude / gemini / gemma / llama / grok / mistral / phi / cohere / perplexity / novelai）

**核对范围**：抽查约 30 处，包括 LMArena 分数、AA 指数、发布日期、官方模型卡数值，以及 qOf 复算和 D4 复验。
**两个限制**：
- 本轮网络搜索额度中途用完，Jev、Sonar Reasoning Pro 的确切日期等几项没能继续查，标“未核实”。
- LMArena 数字我只能核到 openlm.ai 汇总页（页面日期 2026-10-19），和原报告用的是同一个来源，不算独立核对。arena.ai 原站没去查。

## 一、核对表

| 条目 | 原文 | 核实结果 | 出处 | 是否有误 |
|---|---|---|---|---|
| Llama 3.3 对 3.1 405B 官方卡 | 9 项里 405B 赢 6 项，3.3 赢 3 项；MMLU-Pro 73.3 对 68.9，MATH 77.0 对 73.8，IFEval 92.1 对 88.6，GPQA 50.5 对 49.0 | 数字全对。405B 赢 MMLU、MMLU-Pro、HumanEval、MBPP、BFCL、MGSM 共 6 项，3.3 赢 GPQA、MATH、IFEval 共 3 项。卡上发布日 2024-12-06 | huggingface.co/meta-llama/Llama-3.3-70B-Instruct | 无误 |
| LMArena：Llama 405B / 3.3 | 1286 / 1276 | 对 | openlm.ai/chatbot-arena（2026-10-19） | 无误 |
| LMArena 其余数字 | Command A 1327、R+ 1233；Medium 1171、Mixtral 1138；Medium 3.1 1401、Medium 3 1369、Large 3 1428、Magistral 1253；1.5 Pro-002 1320、4o-0513 1302；o1 1366、GPT-4.5 1415；Claude 2.0 1158、2.1 1146；Opus 4.8 1503、Sonnet 5 Thinking 1485；Sonnet 4.5 1420、Opus 4.1 1419；Opus 5.5 1526、Sonnet 5.5 1521、Fable 5.1 1520；Spark 1.1 / 1.2 / 1.3 为 1496 / 1502 / 1507；Wonder 1510、Wonder Full 1518、Open 1484；3.1 Pro 1504、3.6 Flash 1501、3.7 Flash 1503；Gemma 4 31B 1449、26B 1443；Grok 4.7 1507；Astra 1520、6.1 Sol 1516、6 Sol 1509 | 逐项对得上。两个小注：页面上的 o1 实为 o1-2024-12-17 版；“Mistral Medium 1171”没有标 2312，可能是别的版本 | 同上 | 无误 |
| AA 指数各值 | Opus 5.5 58，Sonnet 5.5 56，Fable 5.1 53，Astra 53，6.1 Sol 52，Argon 53，Wonder Full 56，Wonder 52，Spark 1.3 48，Spark Open 39，Grok 4.7 46，Command A+ 13，Command A 7*，Gemma 4 31B 15，26B 17*，Magistral Medium 12*，Mistral Large 3 为 9，Gemini 3.1 Pro 30，3.5 Flash 33 | 全部对得上。Llama 3.3 为 8、405B 为 7，都标了“估计” | artificialanalysis.ai/leaderboards/models 及各模型页 | 数值无误；指数版本标注有误（见更正 2） |
| AA 指数版本 | “页面没标版本，应是 9 月 4 日改版的 v4.2” | v4.2 确实在 2026-09-04 发布。但各模型页现在标的是 **v4.3.2** | aiweekly.co 的 v4.2 报道；AA 的 gemini-3-5-flash、mistral-large-3、command-a-plus 页 | 有误 |
| Muse Spark 1.1 发布日 | 7-16（单一来源，待核实） | **2026-07-09**。DataCamp、llm-stats、Tecnoblog（引扎克伯格的 X 帖）和 Wikipedia 都是这一天 | en.wikipedia.org/wiki/Muse_Spark，DataCamp 等 | 有误 |
| Muse Spark 1.2 / Open 发布日 | 8-05 / 10-15 | 对 | Wikipedia Muse Spark | 无误 |
| Muse Spark 1.3 发布日 | 9-02 | 能确认的只有：officechai 文章日期是 9-03，写“已发布”。具体哪天没查到，月份 2026-09 没问题 | officechai.com/ai/muse-spark-1-3-benchmarks | 具体日期未核实 |
| Muse Wonder / Wonder Full | 10-12 发布；Wonder 有 API，Full 仅限 Muse Code 订阅 | 对。TechCrunch 明确写 Full 只给 Muse Code 订阅者，不走 API。Wonder 经 Meta Model API 提供，定价 4 美元 / 20 美元每百万 token | about.fb.com 2026/10；techcrunch.com 2026-10-12 | 无误 |
| Command A+ | 2026-05-20，开放权重，218B 激活 25B，Apache 2.0 | 对。The Decoder 当时（5-21）写 AA“不到 37”，AA 现在写 13 | AA command-a-plus 页；the-decoder.com | 数字无误，但 13 和 37 是不同指数版本，原文没说明（见更正 3） |
| Command A | 2025-03-13；GPQA 50.51；MMLU-Pro 约 71 | 日期和 111B、CC-BY-NC（所以标 LN 没错）有多处来源。GPQA 50.51 只在一个聚合站见到，MMLU-Pro 只在一个不太可靠的站看到 69.6，都没查到论文原表 | docs.cohere.com/changelog/command-a；arXiv 2504.00698 | 日期无误；两项跑分未核实 |
| Command A Reasoning | 2025-08-21，开放权重 | HF 卡为 111B、CC-BY-NC（标 LN 对），型号带“08-2025”，但没有明确的 8-21。卡上 GPQA Diamond 66.67 | huggingface.co/CohereLabs/command-a-reasoning-08-2025 | 月份无误；8-21 未核实 |
| pplx-70b-online | 2023-11-29，基于 Llama 2 70B | 对。Perplexity 官方博客发布日为 2023-11-29，基座 llama2-70b | perplexity.ai/hub/blog/introducing-pplx-online-llms | 无误 |
| Sonar Huge 405B Online 日期 | OpenRouter 记 8 月，Prompthub 记 7-01 | Perplexity 官方更新日志 2024 年 7 月那条只列 small 和 large，没有 huge。huge 只出现在 2025-01 的下线通知里（2025-02-22 停用）。Prompthub 的 7-01 比 Llama 3.1 发布（2024-07-23，凭记忆，未重新查证）还早，不可能 | docs.perplexity.ai changelog；openrouter.ai | 7-01 不成立（见更正 4） |
| Sonar Reasoning Pro 日期 | OpenRouter 3-07，AA 写 1-28，冲突 | 官方日志 2025 年 3 月那条里提到了它，所以 3 月前已存在，和“游戏的 2025-04 偏晚”一致。具体日子我也没查到 | docs.perplexity.ai changelog | 未能裁决；原文标“待核实”合适 |
| NovelAI Krake | 2022-03-11 发布，04-29 出 V2 | 对 | docs.novelai.net/en/text/models | 无误 |
| NovelAI 其他 | Erato 2024-09-23，Clio 2023-05-23 | 对。文档还写明 Xialong 是 GLM-4.6 的微调，游戏里放在 2026-03 合理 | 同上 | 无误 |
| NovelAI 托管 GLM-4.6 | 10-02 先给 Opus 档，10-15 全档开放 | 文档写的是：GLM-4.5 于 2025-09-25 上线，**2025-10-01** 更新到 GLM-4.6。“分档”和 10-15 在文档里查不到 | 同上 | 小偏差（见更正 5） |
| Phi-4-reasoning | 4-30 发；MMLU-Pro 76.0（plus）、74.3 对 71.5（Phi-4） | 对。HF 卡发布日 2025-04-30，MMLU-Pro 三列为 71.5 / 74.3 / 76.0 | huggingface.co/microsoft/Phi-4-reasoning | 无误 |
| Phi-3.5-MoE | MMLU 78.9，HumanEval 70.7，MATH 59.5 | 对。另有 MMLU-Pro 54.3、GPQA 36.8，42B 总参数 / 6.6B 激活。发布月 2024-08 对；8-20 这一天没核到 | huggingface.co/microsoft/Phi-3.5-MoE-instruct | 数值无误；日期未核实 |
| Phi-3-medium | 实际 2024-05-21，4 月只有 mini | 我查到 Build 大会（五月）才上线 small 和 medium，OpenRouter 记 5-24。月份改 2024-05 站得住，5-21 没能确认 | azure.microsoft.com 的 Phi-3 系列博客；openrouter.ai | 月份无误；日未核实 |
| GPT-4.5 对 o1 硬指标 | GPT-4.5：GPQA 71.4、AIME24 36.7、SWE-bench Verified 38.0；o1：GPQA 约 75、AIME24 约 74、SWE-bench Verified 40.9 | GPT-4.5 三项全对。o1 的 SWE-bench Verified 在 o1 系统卡里是 40.9（卡上 o1-preview 为 41.3）。AIME 约 74 与 OpenAI 的 74% 吻合。GPQA 各来源在 73–76 之间浮动，“约 75”可接受 | neowin 的 GPT-4.5 报道；arXiv 2412.16720 | 无误 |
| Gemini 1.5 Pro-002 | 9-24（记忆，待核实） | 多处报道都是 2024-09-24 | gihyo.jp；discuss.ai.google.dev 的发布说明 | 无误（日期现已核实） |
| Mistral Medium 3.1 | 8-13；AA v3 为 21.1，Medium 3 为 18.7 | 日期各站不一（8-12、8-13、8-15、8-21），官方文档只写 2025 年 8 月，8-13 没错但不确定。引用的 pricepertoken 页面没有 21.1 和 18.7 这两个数 | docs.mistral.ai；pricepertoken.com | 日期可用；AA v3 两个数未核实 |
| Mistral Large 4 | 10-27 放权重，之后 open 改 1 | 10-06 开了公开预览，权重计划 10-27（Forklog 一家给出，官方说“月底”），到 10-20 仍未放出。许可是自定义的，不是 Apache | forklog.com；thenewstack.io | 结论可用，但漏了许可证（见更正 6） |
| Claude 日期 | Mythos Preview 04-07，仅 11 家；Fable 5 06-09；Fable 5.1 09-01 | 对。同一页上：Opus 4.8 为 05-28，Sonnet 5 为 06-30，Opus 5 为 07-24，Opus 5.5 为 09-22，Sonnet 5.5 为 09-28 | en.wikipedia.org/wiki/Claude_(language_model) | 无误 |
| Gemma 4 | Arena 第 3 对第 6 | 对。发布日 2026-04-02 | en.wikipedia.org/wiki/Gemma_(language_model) | 无误 |
| Grok | 1.5 是 3 月公告、5-15 才开放；4.20、4.5、4.7 的 LMArena 逐代上升 | 对。1.5 公告日 03-29，X 会员 05-15 可用。LMArena 为 1495 / 1504 / 1507。Grok-1 开放权重 2024-03-17，4.7 发布于 09-21 | en.wikipedia.org/wiki/Grok_(chatbot)；openlm.ai | 无误 |
| Gemini 3.5 Flash 对 3.1 Pro | AA 发布时 Flash 为 55；3.1 Pro 约 57；新版反过来 33 对 30 | Flash 55 对（AA 文章，没标版本），现在 33 对，3.1 Pro 现在 30 对，发布日 2026-05-19。**3.1 Pro 约 57 没找到出处**。BenchLM 总分 3.1 Pro 64.74 高于 Flash 61.91，但那不是 AA 的数 | AA 文章和模型页；benchlm.ai | “约 57”未核实 |
| Opus 4.8 对 Sonnet 5 | SWE-bench Pro 69.2 对 63.2（第三方） | 对，tech-insider 2026-07-17 文章如此。同一页 Sonnet 5 在 Terminal-Bench 2.1 上反超（80.4 对 74.6），印证“接近” | tech-insider.org | 无误 |
| xAI 在 AA 上叫 SpaceXAI | 如题 | 对，榜单里 Grok 的创建者显示为 SpaceXAI | AA 榜单页 | 无误 |
| Jev | 2026-09-15 发布，决策型模型 | 引用的 thenewstack 页面只看到标题，没有正文和日期；后续搜索额度用完 | thenewstack.io/typesafe-jev-system-one | 未核实 |

## 二、游戏数据修订：用 qOf 复算

我直接 import 项目的 `rivals.js` 算，并套上 sota_check 的 fixes 和 adds（o1 为 78.74，这个值与 D3 一致）。

**1. 原文里所有 q 值都复算对了**
- 现有行：
  - Llama：405B 68.08，3.3 70B 66.54，Spark 1.1 91.32，Open 91.54（原值）。
  - Cohere / Perplexity：R+ 59.26，pplx-70b-online 52.88。
  - Mistral：Mixtral 50.02，Medium 3 73.10，Large 3 77.60。
  - Gemini：3.1 Pro 92.86，3.5 Flash 91.88，3.6 Flash 92.56，3.7 Flash 93.56。
  - Claude：Opus 4.8 94.46，Sonnet 5 94.12，Sonnet 4.5 88.88，Opus 4.1 86.84，Opus 5.5 96.90。
  - 其他：GPT-4.5 74.70，Gemma 4 31B 79.60，Phi-3-medium 57.28，Phi-4-reasoning 68.46，Phi-4 66.92。
- 拟新增或改动的行：
  - Meta：Spark Open 新 dims 为 90.54，Spark 1.2 为 91.88，Spark 1.3 为 93.34，Wonder 为 94.68，Wonder Full 为 95.68。
  - Cohere：Command A 为 67.26，Command A Reasoning 为 73.74，Command A+ 为 79.64。
  - 其他：Sonar Huge 为 64.96，Krake 为 27.72，Gemini 1.5 Pro-002 为 70.26，Mistral Medium 测试版为 53.98，Medium 3.1 为 74.44，Phi-3.5-MoE 为 59.28。

**2. 改动后各家族最强款随时间单调不降，排序结论成立**
- Meta：Spark 90.18、1.1 91.32、1.2 91.88、1.3 93.34、Wonder Full 95.68。Spark Open 改后 90.54，低于 Spark 1.1，也低于后来的 Wonder，“Open 不再是 Meta 最强”成立。
- Cohere：59.26、67.26、73.74、79.64。
- Perplexity：52.88、64.96、65.20、75.80（Sonar Reasoning Pro 改到 2025-03-07 后）。
- Mistral：50.02、53.98、60.28、67.64、73.10、74.44、77.60。
- Gemini：65.48、70.26、72.50。
- Phi：Phi-3-medium 57.28（改到 2024-05）、Phi-3.5-MoE 59.28、Phi-4 66.92。
- NovelAI：Krake 27.72、Clio 29.70、Kayra 36.74。

**3. D4 复验结果与原文一致**
- 我复制 `sota_check.mjs` 到临时目录（路径改成绝对路径），套上全部拟改动：
  - 基线加 `--fix` 是 1 条违规，即 Bark。
  - 套上拟改动后是 2 条，即 Bark 加 Krake，都是“此前该模态没有发布”，和原文说法一致。
  - 其余新行和改行都满足“跟随者 ≤ 同期 SOTA 减 1”。
  - Muse Wonder Full 离红线最近，差 1.22，没过线。
- 一个原文没提到的差异：脚本对所有行统一用 1.0 的间隔，而 v1.0 规格写的是 `OPEN_GAP_LLM = 1.5`（LLM 开源行用 1.5）。我把开源 LLM 行改成 1.5 再跑，结果不变，仍是 2 条，所以不影响结论。但 `sota_check.mjs` 本身和规格不一致，建议顺手对齐。

**4. 两处“接近、不硬改”的判断，我同意**
- Command A（67.26）排在 405B（68.08）之下，是按 GPQA 等硬指标定的。LMArena 上 Command A 1327 比 405B 1286 高 41 分，两个榜打架，维持原判。
- Wonder Full 在 LMArena 上（1518）低于 Astra（1520），在 AA 上（56）高于 Astra（53）。q 95.68 排在 Astra（96.34）之下，符合 LMArena，也受 D4 的“跟随者上限”约束。

**5. Llama y2025 开局取 3.1 405B 的判断，符合制作人的原话**
- 依据是跑分：官方卡 6 比 3，LMArena 高 10 分，不是看参数大小。
- 证据偏弱的一面：AA 对两者都只有估计值（405B 为 7，3.3 为 8，方向反了），不能当证据。

## 三、需要更正的地方和更正后的值

| # | 原文 | 更正为 |
|---|---|---|
| 1 | Muse Spark 1.1 发布日 7-16 | **2026-07-09**。RAW 表里月份 `2026-07` 不用动 |
| 2 | AA 指数“应是 v4.2，版本待核实” | AA 各模型页标的是 **v4.3.2**。原文里 AA 的数字（Large 3 为 9、3.5 Flash 为 33、405B 为 7 估计、3.3 为 8 估计）与 v4.3.2 页面一致，只是版本写错了。v4.2 只是 09-04 那次改版的名字 |
| 3 | Command A+ “AA 13”和“AA 约 37”并列 | 两者是不同版本：约 37 是发布时的旧版指数（The Decoder，2026-05-21），13 是现在的 v4.3.2。同档判断（与 Gemma 4 31B、Mistral Medium 3.5 同档）两边都成立，q 取 79.64 不用改，只需补标注 |
| 4 | Sonar Huge 405B：“Prompthub 记 7-01”当作可能的日期 | 7-01 不成立（早于 Llama 3.1 发布）。官方日志只在 2025-01 的下线通知里提到 huge，OpenRouter 记 2024-08-14（这是上架日，不一定是发布日）。游戏行保持 `2024-08` 月份，标“具体日待核实” |
| 5 | NovelAI 托管 GLM-4.6：“10-02 先给 Opus 档，10-15 全档开放” | NovelAI 文档写的是 2025-09-25 上线 GLM-4.5，**2025-10-01** 更新到 GLM-4.6，“分档”和 10-15 查不到。口径结论（不算 NovelAI 自家模型）不变，对游戏数据无影响 |
| 6 | Mistral Large 4“10-27 放权重，之后 open 改 1” | 补一句：10-27 只是计划，截至 10-20 仍未放出。放出后许可是自定义许可，tags 要写 `LR`，不是 `LP`。到时再改 open 与 tags |
| 7 | Mistral Medium 3.1“AA v3 为 21.1，Medium 3 为 18.7” | 引用页面上没有这两个数，改标“未核实”。排序结论（3.1 高于 3，LMArena 1401 对 1369）不受影响 |
| 8 | Gemini 3.1 Pro“约 57（第三方表）” | 没找到出处，改标“未核实”。AA 现版两者为 30 和 33，游戏里 3.1 Pro 92.86 略高于 3.5 Flash 91.88，不改 |
| 9 | Command A 的 GPQA 50.51、MMLU-Pro 约 71 | 标“待核实”，用论文 arXiv 2504.00698 的表补。游戏 dims 夹在 3.3 和 405B 之间的取法不受影响 |
| 10 | Spark 1.3 发布日 9-02；Phi-3.5-MoE 8-20；Phi-3-medium 5-21；Command A Reasoning 8-21 | 这几个具体日子我都没能核到，月份均对。若要写入 `release_days_overrides.js`，需要补出处 |

补充一点（不算错，只是提示）：按游戏自己的基准曲线，拟加的 Command A Reasoning 的“知识加数学”折算后，GPQA 约 75，而 HF 卡上实测是 66.67，偏高约 9 个点。但现有的 Phi-4-reasoning 同样偏高（折算约 78，真实 65.8），属于“推理模型数学维度被抬高”的同一口径，我不建议单独改，保留“dims 为估算”的标注即可。

## 四、整体可信度评价

**高，约 85% 到 90%。**
- 核对的跑分、日期、官方模型卡数值里，没有发现会改变结论的错误。所有 q 值复算一致，各家族排序成立，D4 复验与原文一致。
- 查出来的错误都是外围的：
  - Spark 1.1 的发布日写错（7-16 实为 7-09）。
  - AA 指数版本标错（v4.2 应为 v4.3.2）。
  - Command A+ 的“13”和“约 37”没说明版本。
  - Prompthub 那个不可能的 7-01 没被排除。
  - GLM-4.6 的上线日差一天。
- 还没核实的：
  - Jev 的发布日和类型。
  - Sonar Reasoning Pro 的确切日子。
  - Command A 的 GPQA 和 MMLU-Pro。
  - Gemini 3.1 Pro 的“约 57”。
  - Medium 3.1 的 AA v3 两个数。
  - 若干只有月份、没有确切日期的行。
- 原文对不确定的地方已经基本标了“待核实”，没有把没查到的当事实写。我之前在 LMArena 上没能独立核对，是这份核对唯一的结构性弱点。
- 临时文件已删除，只清理了我自己的子目录 `/Volumes/ESD-EPA/atonelia-scratch/decisions/verify-audit-llm-west/`。