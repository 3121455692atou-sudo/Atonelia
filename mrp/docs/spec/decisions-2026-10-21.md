# v1.0 待定项决定记录（2026-10-21）

本记录对 v0.9.2 审查报告末尾的 8 个待定项逐一拍板，依据是三份旗舰核对、重复语料、蒸馏算力、榜单分档四份调研，数字一律以核对员更正后的为准。制作人的原话是：“别问我，你自己查资料看跑分什么的，实力最强的就是当前旗舰，而不是参数最大的。”

数字的复核方式如下：
- 直接 import 项目的 `rivals.js` 和 `core.js`，先套上 `sota_check.mjs` 里 D3 的 fixes/adds，再套上本记录全部修订，然后重跑以下几项：
  - D4“跟随者不超过同期 SOTA”：闭源跟随者间隔 1.0，开源 LLM 间隔 1.5，各模态的第一条发布跳过；
  - 四个模态的 SOTA 持有者序列；
  - 四个开局日的阵容；
  - 预训练研发经验和生成工期的算例。
- 临时脚本只放在 `/Volumes/ESD-EPA/atonelia-scratch/decisions/decide-v1/`，用完已删除。项目文件一个没改。

---

## 总原则

**旗舰的定义：截至某一天，一个家族里综合分 qOf 最高的那一款。**

1. 只看已经能看到的发布（按 D2，`r.day ≤ day`），比 `qOf(relDims)`，权重按 D1：知识、代码、数学、写作各 0.22，Agent 0.12，不计安全；图像、音乐、语音四项各 0.25。
2. 同分时取发布日较晚的；还同分，取 RAW 表里行序靠后的。
3. 以下几样**一律不看**：
   - 参数大小；
   - 发布先后；
   - 开源还是闭源；
   - 定价档；
   - 带不带 `S` 标签。
4. 公司旗舰（`orgBest`）：同一个 org、同一个模态的所有家族，各取 familyBest，再取最强的一款，规则同上。例如 Anthropic 是 claude 加 fable，Google 的 LLM 是 gemini 加 gemma，深度求索是 deepseek_pro 加 deepseek。

**这条规则在五个地方的用法**

| 地方 | 用法 |
|---|---|
| D1 `familyBest` / `orgBest` | 唯一的“谁最强”口径，用于 SOTA、`worldRank`、对手页的“旗舰”和对手实力。删除 `latestRelease`、`onSale`、`startRelease`（2026 补丁）。 |
| 开局阵容 `startLineup` | 在线模型 = 开局当天玩家 org 的 `orgBest`。在训模型 = 开局后窗口内第一款**比在线旗舰强**的本家发布；窗口里没有更强的，就不设在训旗舰。 |
| 榜单 | 总榜每个 org 一行，取该 org 在**这个基准上**分数最高的一款。这款不是综合旗舰时，名字后标“（非旗舰）”。详见第 2 项。 |
| 老师选择（D7） | 开源老师 = `familyBest(open:true)`；闭源 API 老师 = `familyBest(open:false)`，限 12 个月内发布、有公开 API（不带 `X` 标签）。生成算力按老师的**激活参数**收费，不按总参数。 |
| 市场“在售旗舰” | 市场份额、定价、E5 价格战里的“对手在售档位”，一律取 `familyBest` 那一款的能力和定价档。原来 `onSale` 取“最新主线”的定义作废。新闻只播报当天发布的那条本身，不需要“最新”函数。 |

**同一条规则用到玩家自己身上**：新发布的模型比在线旗舰弱时，默认按副线发布，不顶替旗舰。玩家手动确认才顶替；顾问和机器人永远不让弱的顶替强的。这对应审查报告 D6 里“顾问不能发出比在线旗舰弱的模型”。

**`S` 标签降为纯描述**（副线、小尺寸），只用于小模型榜和文案，不再承担“挡住更弱的新款”的作用。

**为什么必须这样做**：本次复算，全部模态共 1643 个“家族×月份”格子，有 37 个格子里最新发布的一款不是最强的。例子：

| 家族 | 最新的一款 | 实际最强的一款 |
|---|---|---|
| llama | Llama 3.3 70B（66.54） | 3.1 405B（68.08） |
| llama | Muse Spark Open（90.54） | Muse Wonder Full（95.68） |
| gemini | Gemini 3.5 Flash（91.88） | 3.1 Pro（92.86） |
| gpt | GPT-4.5（74.70） | o1（78.74） |
| grok | Grok 2.5 开放权重 | Grok 4 |
| seed | Seed-OSS-36B | Seed 1.6 |
| deepseek_pro | DeepSeek-V3-0324 | R1 |
| rwkv | Goose 2.9B | Finch 14B |
| qwen_image | Qwen-Image-2.1 | Qwen-Image-3.0 |
| openai_tts | GPT-Realtime-2 | gpt-4o-mini-tts |

只看 LLM 时，榜单调研算的是 34/938（按年-月口径），核对员按具体日期算是 29/938。

“参数最大”同样不等于最强：截至今天，开源里参数最大的 Kimi K3（2.8T 总参、104B 激活，qOf 92.68）不如 GLM-5.3（约 753B，92.80）。

---

## 逐项决定

### 1. Llama y2025 开局旗舰：3.1 405B

**决定**
- Llama y2025 开局在线旗舰是 **Llama 3.1 405B**，数据不用改，按总原则取 familyBest 就会得到它。
- 调研里其他“旗舰不是最强”的案例统一按总原则处理，不再逐个打补丁。需要改数据的，见“对手数据修订表”。

**依据**
- Meta 官方模型卡 9 项基准里，405B 赢 6 项（MMLU 88.6 对 86.0、MMLU-Pro 73.3 对 68.9、HumanEval 89.0 对 88.4、BFCL 81.1 对 77.3，另有 MBPP、MGSM），3.3 70B 赢 3 项（GPQA 50.5 对 49.0、MATH 77.0 对 73.8、IFEval 92.1 对 88.6）。出处：https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct ，两位核对员都核过。
- LMArena：405B 1286，3.3 70B 1276。出处是 https://openlm.ai/chatbot-arena/ （2026-10-19 汇总页），arena.ai 原站返回 403，没能对照。
- 游戏 qOf：405B 68.08，3.3 70B 66.54。
- AA 对这两款只有估计值（405B 为 7，3.3 为 8，方向相反），不作证据。

**同类案例的处理**（括号里是出处和处理方式）
- Muse Spark Open 排在 Spark 1.1 之上（AA 39 对 48；LMArena 1484 对 1496）：改值。
- DeepSeek V3-0324 压过 R1（模型卡 AIME 59.4 对 79.8、LCB 49.2 对 65.9）：改值。
- DeepSeek 下半年 V4.1-Flash 取代 Pro（AA v4.3.2 依次是 Flash-0731 34、Pro-0813 36、V4.1-Flash 39、1017 版 45；Rundown 报道 9 月 14 日起 Pro 请求转给 Flash）：改值并新增一行。
- Qwen3.8-Max 0803（AA 40）排在 Kimi K3（44）和 GLM-5.3（45）之上：改值，这是核对员发现的同类问题。
- GPT-Realtime-2 高于 gpt-4o-mini-tts：改值。
- Gemini 3.5 Flash 对 3.1 Pro、Sonnet 5 对 Opus 4.8、gpt-oss-120b 对 GPT-5、Seed-OSS-36B、Grok 2.5、Qwen-Image-2.1、FLUX 3 Klein、Gemini 3.8 Flash-Lite TTS：数据本来就对，familyBest 自动选对，不改。

**附带后果，全部接受**
- Meta y2025 的在线推理成本从每百万 token 0.087 涨到 0.354（审查报告 G1-9）。这是真实的，P4.2 看一下 Meta y2025 的收入就行。
- 里程碑按钮写“下载 Llama 3.3 70B 的权重”，实际下单的是 405B（G1-11）：按钮文案改成读冻结的老师快照名。

**要改的规格**：D1（familyBest 定义加同分规则、删 onSale）、D2（startLineup）、D4 第 3、7 条。具体文字见“规格要改的地方”。

### 2. 榜单：每个基准各取最强，单位是 org

**决定**
- **榜单页和排名类目标**：每个基准，每个 org 一行，取该 org 截至当天在这个基准上分数最高的一款。
- **综合旗舰**：仍然只有 familyBest/orgBest 一种定义，用于对手页、SOTA、worldRank、老师。
- **其他规则**：
  - 单位用 `FAMILIES[f].org`，**不用** `ownerOf`。核对员实测 `ownerOf` 只合并了 DeepSeek，Claude 和 Fable、Gemini 和 Gemma 仍是两行。
  - 同分同名次。
  - 开源列看这一行模型自己的 `open`。
  - 只收 `r.day ≤ day` 的成绩。
  - 玩家一行取玩家已发布、换题后仍有效的最好成绩（按 modelId 找模型）。
- **不加“分差 1 分以内显示综合旗舰”的粘滞规则。** 每家在一个基准上的最高分随时间只增不减，本来就不会来回翻；加了粘滞，显示的分数反而可能下降。

**依据**
- 真实榜单一行是一个型号或一个系统，没有“每家只取一款综合最强”的：
  - AA 每个推理档位单独一行（Opus 5.5 的 max/xhigh/high/medium/low 各一行，https://artificialanalysis.ai/leaderboards/models ）；
  - Arena 每个模型一个名次加区间（https://arena.ai/blog/ranking-method ）；
  - LiveBench 评具体型号（arXiv 2406.19314）；
  - SWE-bench 条目是“模型+脚手架”，另有 Bash Only 视图（https://github.com/SWE-bench/experiments ）。
- “每家一款”只出现在概览图里，属于折叠视图：AA 的智能图默认只画 706 个模型里的 27 个（https://artificialanalysis.ai/models ）。
- 一个综合分代替不了逐项榜：AA 的总指数 v4.3.2 本身就是 10 项评测按四大类加权（https://artificialanalysis.ai/methodology/intelligence-benchmarking ）。
- 游戏里“取最新”和“逐基准取最强”的前三名单不同的月份，核对员逐项复现了：

  | 基准 | 前三名单不同的月份 |
  |---|---|
  | Arena | 5/34 |
  | MMLU-Pro | 9/29 |
  | GPQA | 12/34 |
  | AIME25 | 9/21 |
  | SWE-bench Verified | 6/27 |
  | HLE | 10/22 |

- 逐基准取最强和“综合只取一款”差别很小：Arena 1/34、GPQA 6/34、SWE-bench Pro 0/14。

**代价**
- 逐基准取最强会抬高对手分数：Arena 第 3 名平均 +2.6 到 +3.0（最大 +19），第 12 名约 +2.7 到 +3.9。
- `goals.js` 的名次阈值（如 `T(3,12,15,3)`）和 advisor 的 `goalTarget`，在 P4.2 用 `calibrate.mjs` 重标。
- 性能：单个榜单约 0.13–0.22 ms，按（基准，天，量级）缓存，每个家族的发布按日预排序。

**要改的规格**：D1 新增 D1.1“榜单”，B3 表的 model.js 榜单开源列，F4 加性能和目标重标两条。

### 3. 前沿闭源单独一档，不并入“大”

**决定**
- LLM 保留四档：小 ≤15B、中 15–100B、大 >100B（按总参数），参数不公开的闭源旗舰为“前沿”。图像、音乐、语音仍只有三档。
- **大档下限保持 >100B，不改成 >150B。** 核对员指出，改成 150B 会让数据里标 large 的 Command R+（104B）和 Mistral Large 2（123B）对不上。只把 gpt-oss-120b（116.8B）的量级从 mid 改成 large。
- 玩家可以进前沿档：LLM 的 cls 先读规模表里写明的值（`f2t` 就是 frontier），其余按总参数算。**`game.js:244` 和 `model.js` 的 `clsOf` 两处都要改**，只改一处，`office.js:59` 和榜单的前沿筛选键仍会拿到 large。
- 量级榜：先按量级筛，再在每个 org 内取这个量级里分数最高的一款，只收 730 天（24 个月）内发布的。24 个月是设计取值，没有真实榜单出处。核对员指出“Arena 下线一个月撤榜”是 2024 年的旧政策，不能当依据。
- 补齐对手之前，“同量级前 N”的 N 取 `max(1, min(3, floor(对手数 / 2)))`。也就是 2 家对手时要求第一，4 家要求前二，6 家起要求前三。

**依据**
- 真实世界没人给闭源前沿模型分参数档：
  - AA 的尺寸档 Tiny ≤4B、Small <40B、Medium 40–150B、Large >150B，只列开源模型（https://artificialanalysis.ai/models/open-source ）；
  - HF Open LLM Leaderboard v1 只评开源，另设“?”档放参数未知的；
  - Epoch 不分档，只给参数估计并标可信度（https://epoch.ai/data/ai-models ）。
- 参数大不等于强：Epoch 估计 GPT-4o 约 200B，比 GPT-4 的约 1.8T 小约 9 倍（https://epoch.ai/gradient-updates/frontier-language-models-have-become-much-smaller ）。
- 并入“大”会让小团队的目标失真：large 档第 3 名，2026-04 和 2026-10 分别是 89.7 和 92.7；并入前沿后变成 92.9 和 96.3，三种分组口径复算结果一致。NovelAI 的 Xialong 这类本来就是 large，会被迫和 Opus、GPT-5.4 比。
- 现行“同量级前三”形同虚设：用游戏的 `leaderboard()` 实测，Perplexity 2026-04 的 small 档只有 2 家、mid 档只有 1 家对手，必然“前三”。

**要改的规格**：D1.1（量级榜）、D3（gpt-oss-120b 改量级）、D4 新增量级一致性测试、F2 P1.1 文件清单加 `model.js clsOf`、balance.js 常量。

### 4. 研发经验打折：保留按工作量给，加一个按算力判断的下限

这项是游戏设计，下面给初值和理由。

**决定**
- 预训练完成时给的研发经验：

```
credit = (3 + 2·log2(max(1, 总参数/7))) × wf × novelty
wf     = max( 1 − e^(−F / 8.4e22),  0.6 × min(1, F / 2e22) )
F      = 有效训练 FLOPs = need × 重复利用率（第 5 项的公式）
novelty = 1/√(同配方已完成次数 + 1)            // 沿用改动包
```

- 下限 0.6，但**只给像样的训练**：有效算力达到 2e22 FLOPs，也就是游戏里 20 H100·月，约相当于 7B 模型练 0.5T token。低于这个量线性降到 0，不设跳变。
- **不按“3B 以上”给下限**。按参数给的话，3B 模型只练 0.06T token 也能拿下限，配合“换个 token 数就算新配方”，可以刷经验。

**理由**
- 改动包的力度对小模型太狠（7B/1T 只给 1.18），但它堵住了 BASE 的一个漏洞：BASE 不管练多少都固定给 3 + …，1.5B 的玩具模型一天练完也给 3 点。
- 新公式让真正练过一个小模型的小团队拿到 BASE 的 60% 以上；大模型和改动包一样；玩具训练拿不到经验。
- 研发经验对能力的影响本身很小（`knowFx` 每 500 点研究速度 +100%，上限 0.4），所以这里只求合理、不刷分，不求精确。

| 训练 | 有效算力（H100·月） | BASE | 改动包 | 本决定 |
|---|---|---|---|---|
| 1.5B / 0.03T（玩具） | 0.3 | 3.00 | 0.01 | 0.02 |
| 1.5B / 0.3T | 2.7 | 3.00 | 0.09 | 0.24 |
| 7B / 1T | 42 | 3.00 | 1.18 | **1.80** |
| 7B / 2T | 84 | 3.00 | 1.90 | 1.90 |
| 14B / 2T | 168 | 5.00 | 4.32 | 4.32 |
| MoE 30B-A3B / 4T | 72 | 7.20 | 4.14 | 4.32 |
| 70B / 2T | 840 | 9.64 | 9.64 | 9.64 |
| 671B-A37B / 15T | 3330 | 16.17 | 16.17 | 16.17 |
| 语音 0.5B（15 H100·月） | 15 | 3.00 | 0.49 | 1.35 |
| 图像 1B（30 H100·月） | 30 | 3.00 | 0.90 | 1.80 |

**落点**：在 v0.9.3 合并（审查报告 B4）时直接用这个公式。P0.3a 把常量 `KNOW_PRETRAIN` 搬进 `data/balance.js`；P4.2 只在 floor 0.4–0.8 区间内调。

### 5. 重复语料：用 Muennighoff 指数饱和公式，R* = 10

**决定**

```
E = 训练 token ÷ 语料池 token（练了几遍）
E ≤ 1：不折算
E > 1：等效新数据遍数 = 1 + R*·(1 − e^(−(E−1)/R*))，R* = REPEAT_RSTAR = 10
每 token 利用率 = 等效遍数 ÷ E，乘在训练信号的质量上
```

- 结构沿用改动包：
  - `repeatEfficiency()` 抽成函数；
  - 按时间段累计，用**当时**的池子算，不用炼完当天的池子；
  - 容量（kcap）用原始质量，不再因重复扣容量；
  - 算力仍按全部 E 遍付。
- 4 遍上限保留（`MAX_EPOCHS = 4`）。这个公式对任意 E 都安全，以后放宽不用改公式。
- 非语言模态先不动，保持旧公式。它们的“token”是归一化单位，没有文献可对照。
- 界面把“质量打折”改成“相当于 N.N 遍新数据”。

| 练几遍 | 1 | 2 | 4 | 8 | 16 |
|---|---|---|---|---|---|
| 本决定 R*=10，等效遍数 | 1.00 | 1.95 | **3.59** | 6.03 | 8.77 |
| 利用率 | 100% | 98% | 90% | 75% | 55% |
| 原版 v0.9（遍数^0.65） | 1.00 | 1.57 | 2.46 | 3.86 | 6.06 |
| 改动包（1+0.35·log2） | 1.00 | 1.35 | 1.70 | 2.05 | 2.40 |

第 2 遍带来的增量（按整遍算）：原版 0.57，改动包 0.35，本决定 0.95。实测是 0.87–1.02。

**依据**
- 公式和常量：Muennighoff 等 2023《Scaling Data-Constrained Language Models》Eq.5，原文拟合 R*_D = 15.39（附录 A，R² = 0.77），实验覆盖 7M–9B 参数、1–500 遍。8.7B 模型练 4 遍，验证 loss 只比 1 遍高 0.5%（§6）。https://arxiv.org/html/2305.16264v5
- 后续重拟合的结果很散：
  - Lovelace 等 2026 表 13、14 为 7.756 和 12.731，表 15 为 23.82（有效参数形式下 38.71），https://arxiv.org/html/2605.01640 ；
  - Prabhudesai 等 2025 自回归模型 31.19（表 1b），https://arxiv.org/html/2507.15857v7 。
- 小模型直接实测偏低：Chai & Xiong 2026（作者顺序以 arXiv 元数据为准）给出第 2 遍值 0.87–1.02 遍新数据（§4.1）；TPP 300 下练 8 遍，每个重复 token 约值 0.65，R*=10 给出 0.72。https://arxiv.org/html/2610.05591
- 反证：Qin 等 2026（https://arxiv.org/html/2607.25271 ）认为 R* 随模型变大而变小，外推到 70B 约 0.2，§5.3 称 4 遍训练只推荐给约 3B 的模型。但它只拟合了 14M–600M，方向又和 Chai & Xiong 相反，所以不采用。
- 取 10 不敏感：R* 取 7.5 到 15，4 遍的等效遍数只在 3.47 到 3.72 之间。

**对游戏的影响**（池 4T、质量 1.2、练 4 遍的知识分，配比 科学 10%、书籍 10%）：

| 模型 | 全新数据 | 原版 | 改动包 | 本决定 |
|---|---|---|---|---|
| 7B | 62.4 | 59.7 | 58.1 | 61.9 |
| 70B | 73.5 | 70.9 | 69.7 | 73.4 |

多练几遍变得更划算，“买新数据”的吸引力相对变小。P4.2 用 calibrate 检查数据采购路线是否还有意义，R* 只在 7.5–15 内调。

**落点**：v0.9.3 合并时改 B4 的公式本体；P0.3a 把常量搬进 balance.js。

### 6. 蒸馏最短天数：留，7 天

**决定**
- 蒸馏小模型项目、生成数据订单都保留 **7 天流程下限**。7 天代表数据整理、评测、安全检查，不是算力下限。
- 算力部分换成真实公式（按“老师在线给 logits”的预训练式蒸馏算，Gemma 和 Llama 3.2 就是这么做的）：

```
蒸馏小模型算力（游戏 FLOPs）= (6·A学生 + 2·A老师) × 1e9 × D × 1e12        // 取代 BASE 的 6·A·D×0.45
工期 = max(DISTILL_MIN_DAYS = 7, 算力 ÷ (trainFlops × 项目分卡)) × modifier('distillTime')，结果不低于 7
```

- 表单只显示一次：“约 N 天（含 7 天流程下限）”。“H100·月”改成“约占 N 张卡、跑 X 周”。

**依据**
- 《Distillation Scaling Laws》式 9：总成本是学生 6ND 加老师前向 2N_T·D（https://arxiv.org/abs/2502.08606 ）。BASE 的 ×0.45 比这个公式低估约 4.3 倍。
- 真实的小模型蒸馏都不便宜：Llama 3.2 1B 用了 37 万 H100·小时，约 514 H100·月，训到最多 9T token，期间用 8B 和 70B 的 logits 当目标（https://github.com/meta-llama/llama-models/blob/main/models/llama3_2/MODEL_CARD.md ；卡上文字写 916k、表格加起来 833k，两边对不上）。
- 用真实算力推算，下限只在“大公司 + 小学生”时才起作用，这时它代表流程时间：

| 任务 | 小公司2023（96×A100） | 小公司2025（384 H100） | 专精2025（1200） | major2025（6000） |
|---|---|---|---|---|
| 8B 学生 ← 37B 激活老师，1.5T | 239 天（旧 42） | 20 天（旧 3.4） | 7 天（算力 6.1） | 7 天（算力 1.2） |
| 8B 学生 ← 16B 激活老师（V4.1-Flash），1.5T | 157 天 | 13 天 | 7 天 | 7 天 |
| 1.5B 学生 ← 自家 7B，0.5T | 15 天 | 7 天 | 7 天 | 7 天 |

  按“项目占训练卡 75%”估算。2023 年其实并没有 37B 激活的开源老师，第一列只用来看算力量级。

- SFT 式蒸馏本身也很快，例如 Sky-T1-32B 用 8×H100 约 19 小时（https://techcrunch.com/2025/01/11/researchers-open-source-sky-t1-a-reasoning-ai-model-that-can-be-trained-for-less-than-450 ）。所以下限必须是流程时间，不能靠算力自然产生。

**代价**：蒸馏小模型变贵约 4 倍。小公司要么少练 token、要么挑小老师，表单会直接显示工期。P4.2 重点看小公司的小模型发布率，必要时调默认 token（现在 1.5T，真实小模型是 2–12T）。

**同时改学生差距**（D7 `previewDistill`），按核对员更正后的版本：

```
N_eff = min( 总参数^0.7 × 激活参数^0.3,  10 × 激活参数 )          // 10 是保守值；观察到的最大杠杆约 12
gapQ  = max(2.5, 25 × N_eff^(−0.55) × (D / 36T)^(−0.2))
各维差距 = gapQ × {知识 1.8, 代码 0.6, 数学 0.55, 写作 1, Agent 1}    // 加权后约为 0.989·gapQ；1.7B 以下偏离，放宽使用
学生各维 ≤ 老师维 − 该维差距；整体 ≤ min(老师 q, worldSota) − 2.5
MoE 学生：解码激活 ÷ 骨干总参数 ≥ 1/50
```

依据：
- R1-Distill 与 Qwen3 小模型对旗舰的比例反推出 25·N^−0.55，核对员独立复现，误差不超过 0.5 分（R1 论文表 4、5，https://arxiv.org/html/2501.12948v1 ；Qwen3 报告表 11–19，https://arxiv.org/html/2505.09388 ）。
- α = 0.3 来自 6 组 MoE 对照（Qwen1.5-MoE、OLMoE、Qwen3-30B-A3B、Ling-mini、Gemma 4 26B-A4B、Qwen3.5）。
- 稀疏度下限从审查报告建议的 1/40 放宽到 1/50。V4.1-Flash 的骨干是 552B、解码激活 16B（1/34.5），算上 Engram 总参是 763B（1/47.7），1/40 会误杀这类真实旗舰（https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash ）。
- 外包里那个“120B 总参、0.5B 激活、7 天练出 Q72.8”的学生，按新公式的 N_eff 约 5B，1.5T 时差距约 20，不可能出现。

### 7. 生成数据花算力：v1.0 做，放在 P1.2

**决定**：做。改动包的方向是对的，问题在于工作量写死、能吃光训练卡、订单不能取消。v1.0 按下面的规则重写。

**公式**（A 是老师**解码**激活参数，单位十亿，取自 `structureForRelease`；N 是生成 token，单位十亿；ρ 是过采样倍数）

```
F1 生成算力：H100·小时 = 5.6 × A × N × ρ          （= 0.0078·A·N·ρ H100·月）
   ρ：不筛 1；“只留答对的”3（待核实）
   一份蒸馏数据包按 R1 级 SFT 集算：N = 4.3，ρ = 3
   合成教材 ds_synth_self：N = 300（0.3T），ρ = 1，老师 = 下单当天的自家在线旗舰，快照冻结
F2 放得下：n_min（H100 当量）= ceil(1.3 × 老师总参数(B) × 字节数 / 80)，有 fp8 技术且卡是 Hopper 及以后时字节数取 1，否则取 2
F3 工期：天数 = max(7, ceil(3 + G / (24 × n用)))，G 为 F1 的 H100·小时
F4 占卡：n用 = min(0.3 × 全部卡的 H100 当量, 当天推理卡 − 0.05 × 全部卡)；n用 < n_min 时当天不推进，显示“推理卡放不下老师”
```

- **只从推理份额里扣，绝不自动动训练卡。** 想更快，玩家自己调高推理份额，等于主动拿训练卡去生成。
- 闭源 API 老师不花卡：沿用 BASE 的总价（蒸馏 250 万美元，`ds_gpt4_distill` 80 万美元），按进度逐日扣钱，工期 14 天（BASE 值）。
- 删除 `datasets.js` 里从没被读过的 `computeH100: 400`。

**取消、暂停与退款**
- **暂停**：随时可以，卡当天还给推理。**恢复**：随时可以，不排队。
- **取消**：随时可以，卡当天释放。完成比例 f ≥ 25% 时，按 f 入库（数据包等级或 token 数乘 f）；不到 25% 就作废。
  - 自家卡生成没有钱可退（成本是少卖的推理）；
  - API 老师未扣的部分不再扣，已扣的不退。
- **同一老师可以重新下单**，不再永久锁死。
- **顾问**：
  - 团队不在训练，或推理卡空出 ≥ n_min 时，建议恢复；
  - 暂停满 30 天提醒一次；
  - 自己下的单不能自己永久搁置。
- **旧档**：在途的 BASE 蒸馏订单按原 eta 交付，进度不清零。

**依据与算例**
- 系数 5.6 是按每 token 约 2A FLOPs、相对 H100 BF16 稠密峰值 989 TFLOPs 的 10% 有效利用率折算的，落在下面这些实测吞吐的中间。核对员把这几个来源都核过：

  | 场景 | 每张卡每秒输出 token | 折算利用率 | 出处 |
  |---|---|---|---|
  | DeepSeek 线上服务（只算解码） | 1,850 | 13.8% | DeepSeek 推理系统概览 |
  | DeepSeek 线上服务（含预填充，全天平均） | 1,072 | 8.0% | 同上 |
  | SGLang 大规模专家并行 | 2,788 | 20.9% | https://lmsys.org/blog/2025-05-05-large-scale-ep/ |
  | TRT-LLM 跑 R1 | 1,436 | 10.7% | TensorRT-LLM 文档 |

  DeepSeek 推理系统概览：https://github.com/deepseek-ai/open-infra-index/blob/main/202502OpenSourceWeek/day_6_one_more_thing_deepseekV3R1_inference_system_overview.md

- R1 的 80 万条 SFT 集：804,745 条，平均 5,355 token，合计约 43 亿 token（R1 论文 v2 表 5，https://arxiv.org/html/2501.12948v2 ）。
- 30% 上限的真实对应：DeepSeek 夜间减少推理节点，转给研究和训练，日均 226.75 节点、峰值 278，空出约 18%。BASE 的 `monthClose` 本来也是 `Math.min(0.3, …)`。
- 改动包的 300 H100·月不能收：按 A = 37 约等于生成 1 万亿 token，是 R1 集的 116 到 510 倍。公开例子里最贵的 OpenThoughts3 也只用了 22,000 H100·小时，约 31 H100·月（https://arxiv.org/html/2506.04178v1 附录 O）。

算例（老师结构按核对员更正后的值）：

| 老师（解码激活 / 总参） | n_min | R1 级蒸馏包 | 小公司2025 工期 | 0.3T 合成教材 | 小公司2025 工期 | 专精2025 工期 |
|---|---|---|---|---|---|---|
| R1 / V3（37B / 671B） | 11 | 3.7 H100·月 | 7 天 | 86 H100·月 | 26 天 | 11 天 |
| V4.1-Flash-1017（16B / 763B 含 Engram） | 13 | 1.6 | 7 天 | 37 | 13 天 | 7 天 |
| GLM-5.3（暂按 40B / 753B） | 13 | 4.0 | 7 天 | 93 | 28 天 | 11 天 |
| Qwen3.8-2.4T-A95B | 39 | 9.5 | 7 天 | 222 | 61 天 | 22 天 |
| Kimi K3（104B / 2.8T） | 46 | 10.4 | 7 天 | 243 | 67 天 | 24 天 |
| 自家 7B 稠密 | 1 | 0.7 | 7 天 | 16 | 8 天 | 7 天 |

- 合成教材的老师只能是自家在线旗舰。表里用开源大老师算，只是为了看量级。
- 96 张 A100 的小公司（约 43 H100 当量）放不下 V4.1-Flash、GLM-5.3、Qwen3.8 和 K3 这几个老师；用自家 7B 生成 0.3T 合成教材要 41 天。

### 8. 超事件真实操作：现在收，放进 v0.9.3 合并

**决定**：现在收（审查报告 A 组第 6 条），在 P0.1 之前随 v0.9.3 合并一起合入，不等 P1.4。

**合入前先修两处**
- 删掉 `superEarned` 积压补演。旧档里的这个字段在迁移时丢弃。
- 结果提示写成“自用算力中的服务占比”。

**理由**
1. 审查报告定的执行顺序是：所有要收的组都在 P0.1 生成指纹和 v3 夹具之前一次合完，“千万不要在 P0.1 之后半路合”。拖到 P1.4，就要在 P0.2a 拆分之后从 diff 里再摘一次，迁移段还得重写。
2. 和 P1.4 冲突很小。P1.4 负责的是弹窗预算、`fire()`、`supersedes`，以及删掉 `super_reasoning_pioneer` 和 `super_open_crown`，这些和“选项做什么”是两层。合入后的 `super.js` 就是 P1.4 的起点。
3. 它本身符合写实原则：
   - “加租”“扩容”真的下租卡订单，“提价”真的上调一档；
   - 去掉了凭空加估值、加技术点；
   - 每个事件都有一个不花钱的“观望”。

**要改的规格**：
- E1 把选项上的 `action` 登记为合法通道；
- E4 的超事件那一行补上规则；
- P1.4 验收加一条。

具体文字见下节。

---

## 对手数据修订表

**说明**
- 行格式沿用 RAW：`[家族, 日期, 型号, 量级, 开源, dims, 定价档]`，dims 顺序见 rivals.js 文件头。
- qOf 按 D1 固定权重，在 D3 修订基础上计算。
- “待核实”表示 dims 是按排名估的，或者日期只有一个来源。
- 名字一律不用括号区分版本：`norm()` 会去掉括号内容，导致 id 撞车。所以 0902 版写成 `Qwen3.8-Max-0902`。

### A. 改值（dims 变化）

| 家族 | 型号 | 原 dims | 新 dims | 新 qOf | 出处 | 理由 |
|---|---|---|---|---|---|---|
| llama | Muse Spark Open（日期定为 2026-10-15） | [93,92,94,88,82,90] | [92,91,93,87,82,89] | 91.54→**90.54** | AA v4.3.2：Open 39，Spark 1.3 48（https://artificialanalysis.ai/leaderboards/models ）；LMArena 1484 对 Spark 1.1 1496（openlm.ai）；HF 卡日期（https://huggingface.co/meta-models/Muse-Spark-Open-816B-A42B ） | 开放权重版比 Spark 1.1 弱，原值排反了 |
| deepseek_pro | DeepSeek-V3-0324 | [86,84,80,82,64,55] | [85,76,80,78,64,45] | 79.64→**75.58** | 模型卡：R1 的 MMLU-Pro/GPQA/AIME/LCB 为 84.0/71.5/79.8/65.9，V3-0324 为 81.2/68.4/59.4/49.2（https://huggingface.co/deepseek-ai/DeepSeek-R1 、https://huggingface.co/deepseek-ai/DeepSeek-V3-0324 ）；AA R1 11 对 10 | 原值压过 R1。代码维按核对员建议再降到 76，让 LCB 映射更接近真实的 49.2。顺序为 R1 76.92 > V3-0324 75.58 > V3 74.26 |
| deepseek | DeepSeek-V4-Flash-0731 | [87,89,91,80,67,87] | [92,95,94,82,67,93] | 86.78→**91.02** | AA v4.3.2 为 34（https://artificialanalysis.ai/models/deepseek-v4-flash ） | 真实排序是 Flash-0731 34 > Pro 预览 30 |
| deepseek_pro | DeepSeek-V4-Pro-0813 | [94,95,96,87,72,94] | [93,93,94,86,72,91] | 93.12→**91.44** | AA 36（https://artificialanalysis.ai/models/comparisons/deepseek-v4-flash-0420-vs-deepseek-v4-pro ） | AA 36，原值却排在 K3（44）和 GLM-5.3（45）之上 |
| deepseek | DeepSeek-V4.1-Flash（2026-09-10） | [89,91,94,81,68,90] | [92,94,95,85,69,95] | 88.90→**91.92** | AA 39；9-14 起 Pro 请求转给 Flash（https://www.therundown.ai/news/deepseek-v4-1-flash-ai-pricing ） | V4.1-Flash 取代 Pro 成为真实旗舰 |
| qwen | Qwen3.8-Max（0803 版，2026-08-03） | [94,95,96,88,76,94] | [93,94,95,86,76,92] | 93.34→**92.00** | AA 0803 为 40（https://artificialanalysis.ai/models/qwen3-8-max-0803 ） | 核对员发现的同类问题。取 92.00，排在 K3 92.68、GLM-5.3 92.80、M3.1-Flash 92.14 之下，高于 V4.1-Flash 91.92 |
| openai_tts | GPT-Realtime-2（2026-05-07） | [88,15,86,87,86] | [83,12,80,78,86] | 69.00→**63.25** | 它是语音到语音的对话模型，OpenAI 没配新 TTS（https://thenextweb.com/news/openai-gpt-realtime-2-voice-models ）；TTS Arena 2026-09-02 快照 mini-tts 1542、TTS-1-HD 1463（https://benchmarklist.com/benchmarks/speech_arena/ ）；AA 上 Realtime-2 1076 < TTS-1 HD 1102 | 置信度中。改到比 gpt-4o-mini-tts（64.25）低 1.0 |

### B. 改日期或量级（dims 不变）

| 家族 | 型号 | 原 | 新 | qOf | 出处 |
|---|---|---|---|---|---|
| llama | Muse Spark 1.1 | 2026-07 | 2026-07-09 | 91.32 | https://en.wikipedia.org/wiki/Muse_Spark |
| perplexity | Sonar Reasoning Pro | 2025-04 | 2025-03-07（日待核实，AA 写 01-28） | 75.80 | Perplexity 官方更新日志 2025-03 条；https://openrouter.ai/ko-KR/perplexity/sonar-reasoning-pro |
| perplexity | pplx-70b-online | 2023-10 | 2023-11-29 | 52.88 | https://hub-prod.perplexity.ai/hub/blog/introducing-pplx-online-llms |
| phi | Phi-3-medium | 2024-04 | 2024-05（暂用 05-21，待核实） | 57.28 | Build 大会才上线 small 和 medium；OpenRouter 记 05-24 |
| rwkv | RWKV-6 Finch 14B | 2024-04 | 2024-07-21 | 43.60 | HF 首次提交（https://huggingface.co/RWKV/v6-Finch-14B-HF/commits/main ）。博客的 09-03 是公告日，不是发布日 |
| flux | FLUX1.1 [pro] | 2024-11 | 2024-10-02 | 81.00 | https://gigazine.net/gsc_news/en/20241004-flux-1-1-pro 、https://simonwillison.net/2024/Oct/3/flux11-pro ；BFL 更新日志里没有这个日期 |
| gpt | gpt-oss-120b（D3 新增行） | 量级 mid | **large** | 78.48 | 116.8B 总参（OpenAI 模型卡 arXiv 2508.10925），和 >100B 的规则一致 |
| deepseek_pro | DeepSeek-V3.2 | 按 12-15 算 | 2025-12-01（写进 overrides） | 87.26 | `docs/research/timeline-2023-2026.json` |

### C. 新增 LLM 行

| 家族 | 日期 | 型号 | 量级/开源 | dims | qOf | tags | 出处 | 理由 |
|---|---|---|---|---|---|---|---|---|
| llama | 2026-08-05 | Muse Spark 1.2 | frontier/0 | [93,92,95,88,83,91] | 91.88 | — | Wikipedia Muse Spark；LMArena 1502 | 缺行 |
| llama | 2026-09-02（日待核实） | Muse Spark 1.3 | frontier/0 | [94,94,96,89,83,94] | 93.34 | — | LMArena 1507，AA 48（https://officechai.com/ai/muse-spark-1-3-benchmarks/ ） | 缺行 |
| llama | 2026-10-12 | Muse Wonder | frontier/0 | [96,95,96,91,83,96] | 94.68 | R,C | LMArena 1510，AA 52（https://about.fb.com/news/2026/10/introducing-muse-wonder-models/ ） | Meta 当前有 API 的最强款 |
| llama | 2026-10-12 | Muse Wonder Full | frontier/0 / premium | [96,97,97,92,84,97] | 95.68 | R,C,**X** | LMArena 1518，AA 56；只给 Muse Code 订阅（https://techcrunch.com/2026/10/12/meta-releases-its-first-frontier-model-muse-wonder/ ） | Meta 最强款。受 D4 约束排在 Opus 5.5 之下，见“仍不确定的” |
| cohere | 2025-03-13 | Command A | large/1 | [79,68,62,76,66,38] | 67.26 | LN | LMArena 1327 对 R+ 1233；https://huggingface.co/CohereLabs/c4ai-command-a-03-2025 | Cohere 停在 2024 年的 R+ |
| cohere | 2025-08-21 | Command A Reasoning | large/1 | [81,72,82,74,66,48] | 73.74 | R,LN | https://docs.cohere.com/changelog/2025-08-21-command-a-reasoning ；HF 卡 GPQA Diamond 66.67 | dims 估算，待核实 |
| cohere | 2026-05-20 | Command A+ | large/1 | [84,82,84,76,68,66] | 79.64 | R,E,LP | AA v4.3.2 为 13（发布时的旧版指数约 37）；218B/25B，Apache 2.0（https://the-decoder.com/cohere-open-sources-its-strongest-model-yet/ ） | 缺行 |
| perplexity | 2024-08-14（OpenRouter 上架日，发布日待核实） | Llama 3.1 Sonar Huge 405B Online | large/0 | [80,65,58,77,68,28] | 64.96 | — | https://openrouter.ai/perplexity/llama-3.1-sonar-huge-128k-online/apps | 影响 y2025 开局；dims 按底座估算 |
| gemini | 2024-09-24 | Gemini 1.5 Pro-002 | frontier/0 | [83,70,70,80,74,30] | 70.26 | C | LMArena 1320 对 GPT-4o-0513 1302；日期经核对员核实 | 缺行 |
| mistral | 2023-12-11 | Mistral Medium（原型） | mid/0 | [73,54,46,68,58,8] | 53.98 | — | 官方 La Plateforme 公告称其为“highest-quality endpoint”，MT-Bench 8.6 对 Mixtral 8.3（https://mistral.ai/news/la-plateforme ）；LMArena 1171 对 1138 | Mistral 当时的最强款。**连带 B6：mistral y2024 改 open_family** |
| mistral | 2025-08-13（日待核实） | Mistral Medium 3.1 | mid/0 | [84,77,69,80,70,52] | 74.44 | — | LMArena 1401 对 Medium 3 1369；官方文档只写 2025 年 8 月 | 缺行（引用的 AA v3 数字作废） |
| novelai | 2022-04-29 | Krake | mid/0 | [44,12,12,58,18,0] | 27.72 | — | https://docs.novelai.net/en/text/models （03-11 首发，04-29 出 V2） | y2023 开局时 NovelAI 实有在线模型；dims 估算 |
| phi | 2024-08-20（日待核实） | Phi-3.5-MoE | **mid**/1 | [76,64,64,60,64,10] | 59.28 | E,LP | HF 卡：MMLU 78.9、HumanEval 70.7、MATH 59.5，42B/6.6B（https://huggingface.co/microsoft/Phi-3.5-MoE-instruct ） | 调研写 small；42B 总参按规则是 mid，这里改了 |
| qwen | 2025-03-06 | QwQ-32B | mid/1 | [80,79,86,78,58,40] | 75.86 | R,S,LP | https://qwenlm.github.io/blog/qwq-32b/ ；Qwen3 报告表 11、13（https://arxiv.org/html/2505.09388 ） | 缺行。离世界 SOTA 差 6.46，抢不到 `ms_open_reasoning_frontier`（门槛 4） |
| deepseek | 2026-10-17 | DeepSeek-V4.1-Flash-1017 | large/1 | [93,95,96,85,70,96] | 92.70 | R,E（许可沿用 V4.1-Flash 行） | AA 45，总榜 2/121（https://artificialanalysis.ai/models/deepseek-v4-1-flash-1017 ） | 深度求索当前最强 |
| qwen | 2026-08-12 | Qwen3.8-2.4T-A95B | large/1 | [93,94,94,86,74,92] | 91.78 | R,E,T,LR（许可待核实） | https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B | Qwen 当前开源最强；dims 取比 Max 0803 略低，待核实 |
| qwen | 2026-09-02 | Qwen3.8-Max-0902 | frontier/0 | [95,95,96,88,76,95] | 93.68 | R | AA 45（https://artificialanalysis.ai/models/qwen3-8-max ） | 缺行 |
| minimax | 2026-10-19 | MiniMax-M3.1-Flash | large/0 | [93,95,95,84,68,95] | 92.14 | E | AA 43（The Decoder 写 42），https://artificialanalysis.ai/models/minimax-m3-1-flash | 缺行；10-23 放权重后改 open |
| yi | 2024-10-16 | Yi-Lightning | large/0 | [78,66,64,82,64,15] | 65.60 | — | arXiv 2412.01253，Arena 总榜第 6 | dims 按 Arena 名次估算 |
| glm | 2024-08-28 | GLM-4-Plus | large/0 | [81,68,62,78,66,26] | 66.70 | — | KDD 发布（https://developer.volcengine.com/articles/7412467375905177654 ） | 只有定性说法，dims 待核实 |
| baichuan | 2024-05-22 | Baichuan 4 | large/0 | [80,64,62,76,64,12] | 63.48 | — | SuperCLUE 80.64（https://www.qbitai.com/2024/05/145905.html ） | 厂商口径，dims 待核实 |
| hunyuan | 2025-12-05 | Hunyuan HY 2.0 Think | large/0 | [86,84,89,80,70,72] | 83.22 | E | https://www.ithome.com/0/902/856.htm 、TechNode；406B/32B | 官方图表没有数字，dims 待核实；“将开源，无时间表”，暂按闭源 |

### D. 新增图像、音乐、语音行

| 家族 | 日期 | 型号 | 量级/开源 | dims | qOf | 出处 | 理由 |
|---|---|---|---|---|---|---|---|
| flux | 2025-11 | FLUX.2 [pro] | large/0 | [90,88,80,92,64] | 87.50 | AA pro 1003 对 dev 1000；Lumenfall 1264 对 1246（https://lumenfall.ai/arena/text-to-image ） | 原来开源的最弱款当了旗舰 |
| flux | 2026-10-01 | FLUX 3 Image | large/0 | [93,94,89,94,66] | **92.50** | AA 1117（https://artificialanalysis.ai/image/leaderboard/text-to-image ）；https://docs.bfl.ml/release-notes | 采纳核对员意见，让它高于 Seedream 5.0 Pro（92.00），保持 AA 上 1117 > 1100 > 1070 的次序。开源小号 Klein 不加 |
| seedream | 2025-12-03 | Seedream 4.5 | large/0 | [90,91,85,91,80] | 89.25 | AA 1026；Lumenfall 1260 对 4.0 1244（https://www.hedra.com/models/image/bytedance/seedream-45 ） | 影响 y2026 开局 |
| qwen_image | 2026-04-22 | Qwen-Image-2.0 Pro | large/0 | [89,91,92,89,78] | 90.25 | AA 1030 对 2.0 990 | 核对员补的空档 |
| qwen_image | 2026-07-21 | Qwen-Image-3.0 | large/0 | [90,92,93,91,78] | 91.50 | AA 1070（https://unite.ai/alibaba-launches-qwen-image-3-0-without-benchmarks-or-weights ） | 量级待核实 |
| qwen_image | 2026-09-20 | Qwen-Image-2.1 | mid/1 | [89,91,92,90,78] | 90.50 | AA 1042（https://aiindigo.com/blog/ai-arena-qwen-image-2-1-release ） | tags S,LN。比 3.0 弱，familyBest 不会选它 |
| hunyuan_image | 2026-01-26 | HunyuanImage 3.0 Instruct | large/1 | [86,87,80,87,78] | 85.00 | AA 987 对 3.0 的 932；托管商记 01-28 | tags LR |
| imagen | 2023-12-13 | Imagen 2 | large/0 | [76,66,35,76,82] | 63.25 | https://cloud.google.com/blog/products/ai-machine-learning/imagen-2-on-vertex-ai-is-now-generally-available | 补 y2024 的空档；dims 估算 |
| mureka | 2026-01-28 | Mureka V8 | mid/0 | **[88,86,79,78,55]** | **82.75** | AA 旧版人声榜 V8 1140（https://benchmarklist.com/arenas/artificial_analysis_music_vocals/ ）；https://finance.eastmoney.com/a/202601283633999892.html | 调研原值 83.00 正好压线，本记录压低 0.25 留余量 |
| mureka | 2026-04-09（日待核实） | Mureka V9 | mid/0 | [89,87,81,81,58] | 84.50 | 旧版人声榜 V9 1159 | 跟随者，必须压在 Suno 之下 |
| mureka | 2026-08-18 | Mureka V9.5 | mid/0 | **[90,88,81,80,60]** | **84.75** | AA 人声榜 v1.1 1107 > Lyria 3.5 1052；07-19 首次宣布、08-18 国内放量（https://wap.eastmoney.com/a/202608183844385437.html ） | 同 V8，留 0.25 余量 |
| lyria | 2026-03-25 | Lyria 3 Pro | large/0 | [86,80,74,89,82] | 82.25 | AA 器乐 1080（https://chromeunboxed.com/googles-lyria-3-pro-brings-full-length-ai-music-generation-to-gemini/ ） | 补 03–06 月的空档 |
| stable_audio | 2025-09-10 | Stable Audio 2.5 | mid/0 | [66,8,8,72,72] | 38.50 | AA 器乐 984 > 2.0 959；Stability 官方新闻 | 影响 y2026 开局 |
| stable_audio | 2026-05-20 | Stable Audio 3 Large | mid/0 | [72,8,8,80,76] | 42.00 | AA 器乐 1014；https://the-decoder.com/stability-ai-launches-stable-audio-3-0-with-up-to-six-minute-tracks-and-open-weights/ | — |
| cartesia | 2025-10（日待核实） | Sonic 3 | mid/0 | [84,80,82,72,60] | 79.50 | AA 1056 | 影响 y2026 开局 |
| cartesia | 2026-05（日待核实） | Sonic 3.5 | mid/0 | [90,85,88,86,62] | 87.25 | AA 1191 | — |
| cartesia | 2026-08-27 | Sonic 3.6 | mid/0 | [92,87,90,87,64] | 89.00 | AA 1290（https://magica.com/news/cartesia-sonic-3-6-text-to-speech ） | — |
| gemini_tts | 2026-09-23 | Gemini 3.8 Flash TTS | large/0 | [92,75,90,90,85] | 86.75 | AA 1279（https://letsdatascience.com/news/google-launches-gemini-38-text-to-speech-models-cee3c0a7 ） | 克隆维 75 的依据待核实 |
| cosyvoice | 2026-07-21 | Qwen-Audio-3.0-TTS-Plus | mid/0 | [89,84,88,85,60] | 86.50 | 当时 AA 1236 登顶（https://the-decoder.com/alibabas-qwen-audio-3-0-tts-plus-tops-the-competition-in-the-text-to-speech-rankings/ ） | 核对员补的空档 |
| cosyvoice | 2026-09-22 | Qwen-Audio-3.1-TTS-Plus | mid/0 | [91,85,90,86,60] | 88.00 | AA 1298（https://artificialanalysis.ai/text-to-speech/models/qwen-audio-3-1-tts-plus ） | — |
| minimax_speech | 2025-10（日待核实） | Speech 2.6 | mid/0 | [89,86,86,84,61] | 86.25 | AA 2.6 HD 1129，介于 02-HD 1111 和 2.8 HD 1174 之间 | 按日开局后，y2026 需要它 |

### 已复核：不破坏“跟随者不超过同期 SOTA”

- 套上 D3 和上表全部改动后，按 D4 规则逐条检查（闭源跟随者间隔 1.0、开源 LLM 间隔 1.5、同日闭源算在前），**违规 0 条**。
- 各模态第一条发布按规则跳过。跟随者里只有 Bark 和 Krake；DALL·E 2、ElevenLabs Beta 是 pusher，本来就不查。
- **SOTA 持有者序列**：
  - 四个模态都不变，只有两处日期层面的变化：LLM 在 2022-04 多了 Krake 打头，图像的 FLUX1.1 [pro] 前移到 10-02；
  - LLM 仍是 GPT-4 → … → o1（2024-12-05）→ … → Claude Opus 5.5（2026-09-22，96.90）。
- **离红线最近的行**（余量单位为 qOf 分）：

  | 型号 | 余量 | 备注 |
  |---|---|---|
  | Muse Wonder Full | 0.22 | — |
  | Qwen3-235B-2507 | 0.24 | 原有 |
  | Qwen-Image、FLUX.2 [dev]、Qwen-Image-2.0 | 各 0.25 | 原有 |
  | Mureka V8、V9.5 | 各 0.25 | — |
  | R1 | 0.32 | — |

- **开局阵容变化**（familyBest、按日）：

  | 剧本 | 家族 | 原开局旗舰 | 新开局旗舰 |
  |---|---|---|---|
  | y2023 | novelai | 无 | Krake |
  | y2024 | mistral | Mixtral 8x7B | Mistral Medium（原型） |
  | y2024 | imagen | 无 | Imagen 2 |
  | y2025 | llama（相对 v0.9） | Llama 3.3 70B | 3.1 405B |
  | y2025 | perplexity | pplx-70b-online | Sonar Huge |
  | y2025 | glm | GLM-4 | GLM-4-Plus |
  | y2025 | yi、baichuan | Yi-Large、Baichuan 3 | Yi-Lightning、Baichuan 4 |
  | y2026 | hunyuan | Hunyuan-T1 | HY 2.0 Think |
  | y2026 | cohere | Command R+ | Command A Reasoning |
  | y2026 | flux、seedream | FLUX.2 [dev]、Seedream 4.0 | FLUX.2 [pro]、Seedream 4.5 |
  | y2026 | stable_audio、cartesia、minimax_speech | Stable Audio 2.0、Sonic、Speech-02 | Stable Audio 2.5、Sonic 3、Speech 2.6 |

- **在训模型规则变化**：GPT y2025 从 GPT-4.5 改为 o3；Grok y2024 从 Grok-1 开放权重改为 Grok-1.5；RWKV y2025 不再有在训旗舰（Goose 2.9B 比 Finch 14B 弱）。
- **B6 一致性**：只有 mistral y2024 需要改成 open_family，其余有改动的格子开闭都对得上。hunyuan y2026 的 HY 2.0 是闭源，和 open_family 一致，不用改。

**这次不列入的**
- Nano Banana 指令遵循 90 改 92：核对员认为依据偏弱，而且多余，“同分取较晚”已经能选中它（Imagen 4 是 2025-05，Nano Banana 是 2025-08）。
- Seed-TTS 2.0：没有第三方评测。
- Sonar 2：没有公开信息。
- Mistral Large 4 的开源标记：权重还没放出。
- Qwen-Image-2.0 改量级：参数量来源有争议。
- Phi-4-reasoning 改名为“（plus）”：只是文案，可做可不做。

---

## 规格要改的地方

### 文首
- “修订后……唯一例外是 Bark”改为：“唯一例外是 Bark 和 Krake：两者都是各自模态的第一条跟随者发布，之前没有参照，按规则豁免。”
- “不加 `--fix` 会报 8 条违规”一句保留，另加一句：“`sota_check.mjs` 要补上‘模态第一条跳过’和 `OPEN_GAP_LLM = 1.5`，并收进本次修订表（2026-10-21 决定记录）。”

### 0.2 关键决定，新增第 12 行
> | 12 | 旗舰 = 截至当天家族里综合分（qOf）最强的一款；同分取较晚发布。不看参数、发布先后、开闭源、价格档。开局阵容、对手页、市场在售、蒸馏老师都用它；榜单每个基准按 org 各取最高分。 |

### 1.3 `data/balance.js`
删除 `SMALL_DISTILL_GAP = 0.5`，追加：
```js
// 2026-10-21 待定项决定（P4.2 只在注释写的区间内调）
export const BOARD_WINDOW_DAYS = 730;                  // 量级榜只收 24 个月内发布的（设计取值）
export const CLASS_EDGES = { small: 15, mid: 100 };    // LLM 总参数（B）：≤15 小，≤100 中，>100 大；参数不公开的闭源旗舰和玩家 f2t 为 frontier
export const CLASS_GOAL_MAX = 3;                        // 同量级目标 N = max(1, min(3, floor(对手数 / 2)))
export const KNOW_PRETRAIN = { base: 3, perDoubling: 2, refFlops: 8.4e22, floor: 0.6, floorFlops: 2e22 };   // floor 区间 0.4–0.8
export const REPEAT_RSTAR = 10, MAX_EPOCHS = 4;         // R* 区间 7.5–15；只用于 LLM
export const GEN = { hPerGTok: 5.6, rho: { plain: 1, filtered: 3 }, packGTok: 4.3, maxShare: 0.3, keepInfer: 0.05,
                     memOverhead: 1.3, cleanupDays: 3, minDays: 7, apiDays: 14, cancelKeep: 0.25, nagDays: 30 };
export const DISTILL_MIN_DAYS = 7;
export const DISTILL_GAP = { k: 25, exp: -0.55, refT: 36, dataExp: -0.2, floor: 2.5, activeW: 0.3, capMult: 10, minActiveRatio: 1 / 50,
                             dimMul: { knowledge: 1.8, code: 0.6, math: 0.55, writing: 1, agent: 1 } };
export const SUPER_ACTIONS = ['rentGpus', 'setTier', 'setInferShare', 'buyGpus'];   // 超事件选项允许调用的公开命令；action 的形状以 data/super.js 为准
```

### v0.9.3 合并（P0.1 之前，对应审查报告 B4、A6）
- **B4 预训练记账**：
  - 研发经验用第 4 项的公式（`wf` 带 2e22 斜坡下限）；
  - 重复折算用第 5 项的 `effectiveEpochs` 和 `repeatEfficiency`（R* = 10，没语料时兜底 0.3，非语言模态保持旧公式）。
  - 常量先写在本地，P0.3a 搬进 balance.js。
- **A6 超事件**：删掉 `superEarned` 积压补演，迁移时丢弃这个字段；提示文案改成“自用算力中的服务占比”。

### B6 开局路线
- mistral y2024：`open/P (→open_family 2024-02-26)` 改为 **`open_family`**，删掉这个播种节点。
- 表下加注：“y2024 Mistral 的在线旗舰是闭源的 Mistral Medium（原型，2023-12-11，官方称其为‘highest-quality endpoint’），Mixtral 8x7B 作为开源小模型线。”
- P3.T-mistral 的主线素材相应调整：2024-02-26 Mistral Large 发布和微软合作，只作为新闻和节点，不再是转路线。

### D1 唯一定义
把 `familyBest`、`onSale` 两行替换为：
```js
export function familyBest(s, fam, day, { open = null, api = null } = {})
  // 家族截至当天（r.day ≤ day）qOf(relDims) 最高的一款；同分取 r.day 较晚的，再同分取 RAW 行序靠后的。
  // open 为 true/false 时只在开源或闭源行里挑；api 为 true 时排除带 X 标签的行。不看参数、发布先后、S 标签、价格档。
export function orgBest(s, org, mod, day, opts) // 同 org、同模态各家族 familyBest 里再取最强，规则同上
export function benchBest(s, org, benchId, day, { cls = null } = {})   // 见 D1.1
// onSale 删除：“在售旗舰”就是 familyBest
```
用途表替换最后两行：

| 用途 | 口径 |
|---|---|
| 对手页“旗舰”、worldRank、对手实力、市场份额和定价里的“在售旗舰”、E5 价格战的“在售档位” | `orgBest` / `familyBest` |
| 榜单页、排名类目标 | `benchBest`（D1.1） |
| 蒸馏老师 | `familyBest(open:true)`；闭源取 `familyBest(open:false, api:true)`，限 12 个月内 |
| 开局阵容 | 开局当天的 `orgBest`（D2） |

新增一条：“玩家新发布的模型比在线旗舰弱时，默认作为副线发布，不顶替旗舰；玩家手动确认才顶替；顾问和机器人永远不顶替。”

**新增 D1.1 榜单**：
- 总榜：每个 org（`FAMILIES[f].org`，不用 `ownerOf`）一行，取截至当天在这个基准上分数最高的一款；不是 orgBest 时名字后加“（非旗舰）”。
- 玩家一行：玩家已发布、换题后仍有效的最好成绩，按 modelId 找模型。
- 同分同名次；开源列看这一行模型的 `open`；只收 `r.day ≤ day`。
- 量级榜：先按 cls 筛（对手用行的 cls，玩家用 `clsOf`），再在每个 org 内取最高分；只收 `day − r.day ≤ BOARD_WINDOW_DAYS` 的发布。
- 同量级目标的 N = `max(1, min(CLASS_GOAL_MAX, floor(对手数/2)))`，advisor 的 `goalTarget` 同步。
- 缓存：按（benchId，day，cls）缓存，各家族发布按日预排序。
- 量级：玩家 LLM 的 cls 先读 SCALES 的 `cls`（`f2t` 为 frontier），否则按 `CLASS_EDGES` 和总参数算。`game.js` 的开局和立项、`model.js` 的 `clsOf` 两处都改。
- 替换点加上：`model.js` 的 `clsOf`、`goals.js` 的名次阈值（P4.2 重标）。

### D2 发布按日可见
- `startLineup` 一条替换为：
  > `startLineup` 按日判断：在线 = 开局当天玩家 org 本模态的 `orgBest`；在训 = 开局后窗口内（`r.day ≤ 开局后第 4 个月月底`，2026 剧本没有在线模型时取 6 个月）第一款 qOf 高于在线旗舰的本 org 发布；没有在线模型时取窗口内第一款；窗口内没有更强的就不设在训旗舰。实测相对 v0.9 的变化：Llama y2025 在线 3.1 405B；GPT y2025 在训 o3；Grok y2024 在训 Grok-1.5；RWKV y2025 无在训旗舰。
- 新增：
  > `release_days_overrides.js` 的条目写成 `{ day, src, approx? }`。只有月份有出处、具体日待核实时，写 `approx: true` 并注明来源；dayExact 测试对 approx 条目放行，但 `sota_report` 必须列出全部 approx 行。本次的 approx 行：Muse Spark 1.3、Sonar Huge 405B、Sonar Reasoning Pro、Mistral Medium 3.1、Phi-3-medium、Phi-3.5-MoE、Mureka V9、Sonic 3、Sonic 3.5、Speech 2.6。

### D3 对手数据修订
- 第 8 列 tags 新增：`X` 无公开 API（只在订阅产品里提供），这类行不能当闭源 API 老师。
- `S` 的说明改为：“副线或小尺寸，只作描述和小模型榜筛选，不参与旗舰判定。”
- “改值”表和“新增行”表末尾，按本记录的对手数据修订表 A–D 追加；gpt-oss-120b 的量级改为 large。
- 修订后的 LLM SOTA 持有者那段，在开头补一句“Krake（2022-04，开局前）”，其余不变。

### D4 不变量测试
- 第 1 条：“这个模态此前没有任何发布时跳过（只有 Bark 一例）”改为“（跟随者里有 Bark、Krake 两例）”。
- 第 3 条追加：“Llama y2025 开局在线模型是 Llama 3.1 405B；构造同分夹具，验证 familyBest 取较晚的一款。”
- 第 7 条改为：“全库搜不到 `overallQ`、`latestRelease`、`onSale`、`startRelease`。”
- 新增第 8 条：“开源 LLM 行的 cls 必须等于按 `structureForRelease` 总参数算出的量级；只有参数不公开的闭源行允许 frontier。”
- 新增第 9 条：“`sota_report` 打印离红线 ≤0.3 的行（当前有 Muse Wonder Full 0.22、Qwen3-235B-2507 0.24 等），改数据时必须看。”

### D6 自研上限
在 C1 例子处加注：
> V3-0324 史实值改为 [85,76,80,78,64,45] 后，继承在训模型的知识上限 83 对史实 85，差距从 3 缩到 2。HEADROOM.knowledge 的修法照旧，测试“y2025/y2026 继承在训模型各维上限不低于史实发布值”照样要加。

### D7 蒸馏上限
- **`distillOptions`**：
  - 开源老师 = 每个非自家家族的 `familyBest(open:true)`；
  - 闭源 = `familyBest(open:false, api:true)`，限 12 个月内；
  - 下拉框显示“离当前最强还差 x”，以及“约占 N 张卡、跑 X 天”。
- **新增小节“生成订单”**：第 7 项的 F1–F4、暂停、取消、退款、顾问、旧档规则原文写入。`ds_synth_self` 的老师是下单当天的自家在线旗舰，快照冻结；删除 `computeH100` 字段；API 老师按进度扣钱，工期 `GEN.apiDays`。
- **蒸馏小模型（`previewDistill`）**整段替换：
  - 用第 6 项的算力式和工期式（`DISTILL_MIN_DAYS`），以及 N_eff 和 gapQ 公式；
  - MoE 学生须满足“解码激活 ÷ 骨干总参 ≥ 1/50”；
  - 其余（冻结快照、`distillCheck`、`teacher`、污染规则）不变。

### E1 `applyEffects`
词表下加一段：
> **超事件选项的 `action` 字段**：这是 `applyEffects` 之外唯一合法的写入通道，只允许出现在超事件选项上，命令限 `SUPER_ACTIONS`。形状以 v0.9.3 合并后的 `data/super.js` 为准：`{cmd:'rentGpus'}` 走 compute.js 的租卡，卡型和张数由引擎按当前负载算（先扣掉这批开通前就会到的买卡、租卡订单，更晚才到的不扣；按多租的卡实际能多出的推理能力折张数）；`{cmd:'setTier', product, dir:+1}` 走 service.js 调一档价格；`{cmd:'setInferShare', add, max}` 把自用算力中的服务占比加 `add`，最多到 `max`，和手动拖推理份额是同一条命令；`{cmd:'buyGpus', cashShare}` 走 compute.js 的买卡，最多花 `cashShare` 的现金，占季度配额，到货前不加算力。校验和界面完全相同，做不到时选项置灰并写原因；`describeEffects` 负责生成说明；`validateEffects` 对其他来源的 `action` 报错。

### E4 事件种类
super 一行的“来源与触发”追加：“选项可以带 `action`（E1）；每个超事件都有一个不花钱的‘观望’；条件只在当下判断，错过不补演。”

### F2 包清单
- **P1.1**：独占文件加 `sim/model.js` 的 `clsOf`、`data/goals.js` 的名次函数（只改取 N 的逻辑）；验收加 D4 第 8、9 条和“B6 一致性测试通过（mistral y2024 = open_family）”。
- **P1.2**：独占文件加：
  - `sim/orders.js`（生成订单）；
  - `sim/economy.js`（只加回 gpuAllocation 的“数据生成”一桶）；
  - `sim/advisor.js`（只改生成订单的暂停、恢复建议）。

  验收加：
  - 生成订单让训练卡减少的天数为 0；
  - 小公司2023 用自家 7B 生成 0.3T 合成教材 ≤ 45 天；
  - 取消后的入库比例正确；
  - 旧档在途订单按原 eta 交付。
- **P1.3**：START_STANCE 按新的 B6 写。
- **P1.4**：验收加：“超事件选项只有 `applyEffects` 效果或白名单 `action`；没有凭空加估值、加技术点；读旧档时 `superEarned` 字段被丢弃。”

### F4 平衡目标（新增行）

| 指标 | 目标 |
|---|---|
| 生成订单造成训练卡减少的天数 | 0（测试保证） |
| “团队没在训练、生成订单却暂停 ≥30 天”的局数 | 0（机器人和大按钮都是） |
| 同量级目标的对手数 | calibrate 逐剧本打印各量级对手数；N 按 D1.1 自动取 |
| 榜单名次目标 | 逐基准取最强后，`goals.js` 阈值和 `goalTarget` 重标，达成率回到 v0.9.3 基线 ±5 个百分点 |
| 蒸馏小模型 | 小公司（small tier）机器人局里至少发布一款小模型的比例不低于 v0.9.3 基线的一半；做不到时先调默认 token，再调 `DISTILL_GAP.floor` |
| Meta y2025 | 月收入不低于 v0.9.3 基线的 70%（在线旗舰换成 405B，成本上升） |
| 性能 | 加入 D1.1 缓存后，一局机器人仍 ≤400 ms |

---

## 仍不确定的

只列证据确实不够的地方，每条都给了暂定做法。

1. **估算的 dims。** 涉及 Krake、Sonar Huge 405B Online、Command A 与 Command A Reasoning（Command A 的 GPQA 50.51、MMLU-Pro 约 70 只见于聚合站）、Yi-Lightning、GLM-4-Plus、Baichuan 4、HY 2.0 Think、Qwen3.8-2.4T-A95B、Imagen 2、Mureka V8–V9.5。
   - 暂定：按表值落库，在 overrides 注释里标 `est`。
   - 以后有跑分再改（Command A 用 arXiv 2504.00698 的原表补）。D4 测试保证改值不会越线。
2. **只有月份的日期。** 见 D2 的 approx 清单。
   - 暂定：取有来源的那一天；没有来源就取当月 15 日，标 approx。
   - Mureka V9.5 写 08-18（国内放量），07-19 只是首次宣布；对 D4 无影响，这段时间 SOTA 都是 Suno v5.5 的 86.00。
3. **补不上的真实旗舰，已知偏差。**
   - mureka y2026 开局仍是 O1：V7.5、V7.6 和 O2 的日期有冲突（11-28 还是 12-09），也没有评分。
   - cosyvoice y2026 开局仍是 CosyVoice 2：Qwen3-TTS-Flash 没有评分。
   - Seed-TTS 2.0 没有第三方评测，不加。
   - 暂定：维持现状，有第三方评分后按总原则补行。
4. **跨家族校准。**
   - Mistral Medium 3.5（84.84）比 AA 上同档的 Gemma 4 31B 和 Command A+（约 79.6）高 5 分；
   - Sonic 3.6、Gemini 3.x Flash TTS、Qwen-Audio 在 AA 上高于 Eleven v3，游戏里在它之下；
   - Qwen3-TTS 游戏值 84.25，但 AA 只有 930；
   - 纯器乐模型被 Q 公式压低（Stable Audio 3 Large 42.00 对 Eleven Music 74.50）。
   - 暂定：这次只管家族内谁是旗舰，不动这些。P1.1 数据提交之后另开一轮跨家族校准，不阻塞施工。
5. **Muse Wonder Full 的真实位置。** AA 56，高于 GPT-6 Astra 和 Fable 5.1 的 53；但 LMArena 1518 低于 Astra 的 1520。游戏受 D4 跟随者上限约束，只能给 95.68，排在 Astra 96.34 之下。
   - 暂定：接受，不加 `SOTA_EXCEPTIONS`。
6. **许可和开源状态。**
   - Qwen3.8-2.4T-A95B 的许可没查到，暂按受限（LR，偏保守）。
   - Mistral Large 4（计划 10-27）、MiniMax-M3.1-Flash（计划 10-23）放出权重后，再改 `open = 1`。Large 4 是自定义许可，tags 写 LR。
   - HY 2.0 “将开源，无时间表”，暂按闭源。
7. **老师结构参数。**
   - GLM-5.3 激活参数卡上没写，暂按 GLM-5 的 40B；
   - V4-Pro-0813 暂按 1.6T/49B；
   - V4.1-Flash 按骨干 552B、解码 16B 算生成成本，n_min 用含 Engram 的 763B。
   - 暂定：写进 `KNOWN_STRUCTURE` 并注明“待核实”。
8. **生成与蒸馏的设计常量。** 以下几项都没有公开出处，属于设计取值或估计：
   - 过采样倍数 ρ = 3；
   - 利用率 η = 10%（长推理链可能更低）；
   - 显存系数 1.3；
   - “3 天整理 + 7 天下限”；
   - α = 0.3（混有厂商自报）；
   - 数据量指数 −0.2；
   - N_eff 封顶 10·A（观察到的最大杠杆约 12）。
   - 暂定：按表值落库，P4.2 只在 balance.js 注释写的区间内调。
9. **重复语料的外推。** 没有 100B 以上、MoE、10T 以上 token 的公开重复实验；2026 年的几篇都是预印本，而且结论互相矛盾。
   - 暂定：R* = 10，保留 4 遍上限；非语言模态保持旧公式，不试 R* = 30。
10. **小档和中档的对手太少。** 24 个月窗口下，small 档 2025-11 起只剩 3 家，2026-02 起只剩 2 家。候选补行有 Qwen3 全系小号（2025-04-29，已核实阵容）、gpt-oss-20b、Gemma 3 和 4 的小号、Phi-4-mini、Qwen3.5 小号，但它们的规格和分数都没核实。
    - 暂定：先用 D1.1 的动态 N；P1.1 之后单独做一批小模型补行，每档每个时间点至少 6 家。
11. **LMArena 的数字只核到 openlm.ai 汇总页**，arena.ai 原站返回 403。
    - 暂定：照用，汇总页日期记为 2026-10-19。AA 指数一律注明是 v4.3.2；Command A+ 的“约 37”是发布时的旧版指数，“13”是 v4.3.2，两者不混用。