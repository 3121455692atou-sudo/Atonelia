# 蒸馏要花多少算力、多少天，学生能练多好：定稿建议（2026-10-21）

临时脚本已全部删除，只在 `/Volumes/ESD-EPA/atonelia-scratch/decisions/distill/` 下算过，没有复制项目、没有 npm install。

## 零、先看结论

1. **300 H100·月不能收。**
   - 它相当于让 37B 激活的老师生成约 1 万亿 token（按吞吐不同，在 0.5 到 2.2 万亿之间）。
   - 这是 R1 蒸馏集（80 万条，约 43 亿 token）的 100 到 500 倍，也是 DeepSeek 线上服务整整 6 天的全部输出（168B token/天）。
   - R1 级蒸馏集真实只要 1 到 5 H100·月。公开例子里算力最贵的 OpenThoughts3 是 22,000 H100·小时，约 31 H100·月，也比 300 小 10 倍。
2. **400 H100·月（合成教材）只对“激活约 170B 的老师”成立。**
   - 游戏里这份教材是 0.3T token。
   - 配 3B 到 49B 激活的老师，实际只要 7 到 115 H100·月。
   - 原版这一项完全不收算力（`computeH100` 字段从没被读），也偏小。
3. **“14 天、不占训练卡”对 R1 级蒸馏集更接近现实。**
   - 384 张 H100 的小公司，拿 30% 的卡，纯算力 1 天，加整理约 4 到 7 天。
   - 缺点是它不看老师大小、公司大小，也没有“老师放得下放不下”的约束。
   - 对 3000 亿 token 的合成教材，它又偏乐观。
4. **推荐：做“生成数据花算力”（待定项 7 选“做”），用下面的公式。**
   - 占卡不超过 30%，从推理份额扣，绝不停训。
   - “蒸馏最短 7 天”（待定项 6）建议留。7 天是流程下限，不是算力下限。
5. **学生差距既不是只看总参数，也不是只看激活参数。**
   - 等效稠密规模 N_eff 约等于 总参数^0.7 × 激活参数^0.3。
   - 稀疏度超过约 1/27 之后，多出来的总参数不再兑现，N_eff 封顶为 10×激活参数。
   - 120B 总参、0.5B 激活的学生约等于一个 5B 稠密模型，不是 20B。
6. **老师按能力最强选（familyBest），生成算力按激活参数付钱，不按总参数。**
   - 例如游戏 RAW 里 Qwen3.5-397B-A17B（17B 激活）的 q 是 88.64，高于 DeepSeek-V3.2（37B 激活）的 87.26。
   - DeepSeek-V4.1-Flash（13B 激活）的 q 是 88.9，约为 V4-Pro-0813（93.12，官方卡 49B 激活）的 95%，而每 token 成本只有它的 27%。

## 一、推荐公式（可直接写进规格）

单位约定：A 是激活参数（十亿），T 是总参数（十亿），N 是生成 token（十亿），D 是学生训练 token（万亿）。1 H100·月按 720 小时算。游戏里训练的 1 H100·月是 1e21 有效 FLOPs（`core.js:152`，约 40% MFU）。

**F1 生成算力（老师推理，主要是逐 token 解码）**
- H100·小时 = 5.6 × A老师 × N × ρ
- H100·月 = 0.0078 × A × N × ρ
- 换个说法：1 H100·月只能生成约 128/A 十亿 token。A=37 是 35 亿，A=3 是 427 亿，A=405 是 3 亿。
- 对应每 token 约 2A FLOPs，按 10% 的有效利用率（η=10%）折算，利用率是相对 H100 的 BF16 稠密峰值 989 TFLOPs。
- 实测系数范围是 1.5 到 31（见表 A）。常规取 5.6，乐观 3，保守 9，老流水线极端 30。
- ρ 是过采样倍数。不筛选取 1，“只留答对的”取 3（R1 没公布比例，待核实）。
- 同一个量按游戏训练 FLOPs 口径写是 8·A·N，也就是生成一个 token 约等于训练 8A，比 SFT 的 6A 还贵一点。

**F2 老师放不放得下（最少卡数）**
- n_min = ceil(1.3 × T老师 × 字节数 / 80)，FP8 取 1 字节，BF16 取 2 字节，卡按 H100 80GB。
- 671B 的 FP8 老师是 11 张，实务上用 16 张 H100 或 8×H200（SGLang 文档推荐 8×H200）。
- 235B 是 4 张，1.6T 是 26 张。
- 1.3 这个开销系数是估算，待核实。
- 若公司卡数的 30% 小于 n_min，只能换小老师或买 API。

**F3 到货天数下限**
- 天数 = max(7, ceil(3 + G / (24 × n用)))，G 是 F1 的 H100·小时。
- n用 = 0.3 × 折成 H100 当量的卡数，折算沿用 `core.js` 的 infer 列（A100=0.45、H200=1.35）。
- 要求 n用 ≥ n_min。
- “3 天整理加验证”和“7 天下限”是设计取值，没有直接出处。

**F4 占卡上限**
- 生成最多占全部卡的 30%，优先从推理份额扣，绝不停训。
- BASE 本来就是这么做的：`game.js` 的 `monthClose` 里是 `Math.min(0.3, …)`。
- 真实依据是 DeepSeek 白天全部节点做推理，夜间 “reduce inference nodes and allocate resources to research and training”。它日均 226.75 节点，峰值 278，约空出 18%。

**F5 SFT 算力（学生后训练）**
- H100·月 = 0.006 × A学生 × D_token（十亿）× epoch，即 6·A·D 按 1e21 折算。
- 这是游戏口径（40% MFU）。
- 小团队实际常是它的 4 到 6 倍：OpenThinker-32B 实测 2,880 H100·小时，Sky-T1 实测 152 H100·小时。

**F6 预训练式蒸馏（老师在线给 logits，Gemma 和 Llama 3.2 的做法）**
- H100·月 = (6·A学生 + 2·A老师) × D。
- 老师只做前向，效率按训练算。
- 游戏现在的“蒸馏小模型项目”其实是这一类，不是 R1-Distill 那种 SFT。后者需要现成底座，不从零造学生。
- BASE 的成本是 6·A·D×0.45，8B 学生配 22B 老师、1.5T token 是 32 H100·月。按 F6 是 138，低估约 4 倍。
- 默认 1.5T token 也偏小。真实小模型是 Gemma 3 的 2T 到 12T，Llama 3.2 的 9T，Qwen3 的 36T。

**F7 学生差距（每维分数点，相对同期旗舰老师）**
- N_eff = min(T^0.7 · A^0.3, 10·A)
- 差距 = max(2.5, 25 · N_eff^-0.55 · (D/36T)^-0.2)
- 可选的分维系数：知识 ×1.8、代码 ×0.6、数学 ×0.55、写作和 Agent ×1，系数来自 Qwen3 数据。这样 q 的总差距不变。
- 学生各维不超过 老师维 − 差距。
- 另加界面约束：MoE 学生的激活参数不低于总参数的 1/40。
- 为什么这样写，见第三节 D。

## 二、各档例子

**表 1：生成算力（η=10%，k=5.6；h=H100·小时，月=H100·月）**

| 生成 token | A=3B | A=13B | A=22B | A=37B | A=49B | A=405B |
|---|---|---|---|---|---|---|
| 10亿 | 17h | 73h | 124h | 208h | 275h | 3.2月 |
| 43亿（R1 整套） | 73h | 315h | 533h | 1.2月 | 1.6月 | 14月 |
| 130亿（R1×ρ3） | 219h | 1.3月 | 2.2月 | 3.8月 | 5.0月 | 41月 |
| 250亿（Cosmopedia） | 422h | 2.5月 | 4.3月 | 7.2月 | 9.6月 | 79月 |
| 1000亿 | 2.3月 | 10月 | 17月 | 29月 | 38月 | 316月 |
| 3000亿（游戏合成教材） | 7.0月 | 30月 | 52月 | 87月 | 115月 | 948月 |
| 1万亿 | 23月 | 101月 | 172月 | 289月 | 382月 | 3161月 |

**表 2：按游戏里的公司规模看到货天数（30% 卡，3 天整理，7 天下限）**

| 任务 | 小公司2023（96 张 A100，约 43 H100 当量） | 小公司2025（384 H100） | 专精2025（1200 H100） | 大厂2025（6000 H100） |
|---|---|---|---|---|
| R1 级（130亿 token，老师 37B/671B） | 12 天 | 7 天 | 7 天 | 7 天 |
| 1000亿 token，13B/284B 老师（V4-Flash 级） | 27 天 | 7 天 | 7 天 | 7 天 |
| 3000亿合成教材，37B/671B 老师 | 204 天 | 26 天 | 11 天 | 7 天 |
| 3000亿合成教材，3B/30B 老师（自家小旗舰） | 20 天 | 7 天 | 7 天 | 7 天 |

- 每家公司的 30% 卡数分别是 13、115、360、1800 张。
- 小公司2023 放得下 671B 老师（n_min=11 张，勉强），但要排 8.7 天纯算力。
- 改动包占满训练卡的天数：小公司2023 约 293 天（审查报告实测约 420 天，口径略有出入），小公司2025 约 23 天，专精2025 约 8 天。

## 三、真实数据与出处

### A. 老师生成的真实吞吐

“折算”是相对 H100 BF16 稠密峰值 989 TFLOPs 的利用率。NVIDIA 官网给的 1,979 是带稀疏口径，我折半。

| 场景 | 每卡输出 token/s | 折算 | 每十亿 token 的 H100·小时 | 出处 |
|---|---|---|---|---|
| DeepSeek 线上解码（8×H800/节点 14.8k） | 1,850 | 13.8% | 150 | [DeepSeek 推理系统概览](https://github.com/deepseek-ai/open-infra-index/blob/main/202502OpenSourceWeek/day_6_one_more_thing_deepseekV3R1_inference_system_overview.md) |
| DeepSeek 线上全包（168B 输出/天，226.75 节点，含预填充） | 1,072 | 8.0% | 259 | 同上，按 8 卡/节点、24 小时自算 |
| SGLang 96×H100 大规模专家并行（22.3k/节点，输入 2000） | 2,788 | 20.9% | 100 | [LMSYS 博客](https://lmsys.org/blog/2025-05-05-large-scale-ep/) |
| TRT-LLM，8×H200 跑 R1（输入 1K 输出 2K，批 1024） | 1,436 | 10.7% | 193 | [TensorRT-LLM 文档](https://nvidia.github.io/TensorRT-LLM/0.19.0/blogs/Best_perf_practice_on_DeepSeek-R1_in_TensorRT-LLM.html) |
| SGLang 离线，8×H200（输入 3200 输出 800） | 789 | 5.9% | 352 | [dstack 实测](https://dstack.ai/blog/h200-mi300x-deepskeek-benchmark/)，6,311/8 卡 |
| TRT-LLM FP8，H100 上 Llama-3.1-70B（TP8，1000/1000） | 1,385 | 19.6% | 200 | [TRT-LLM 性能总览](https://nvidia.github.io/TensorRT-LLM/1.0.0rc2/performance/perf-overview.html) |
| 同上，405B（500/2000） | 458 | 37.5% | 606 | 同上 |
| 同上，8B（TP1，1000/1000） | 15,270 | 24.7% | 18 | 同上 |
| Magpie-Pro 用 vLLM 在 A100 上跑 70B | 约 216（A100） | 9.7%（相对 A100 峰值） | 约 580（按 A100=0.45 H100 折） | [Magpie 论文](https://arxiv.org/html/2406.08464v2)，614 A100·h 生成 100 万条、平均 478 token/轮 |
| Cosmopedia（Mixtral-8x7B，约 12.9B 激活） | ≤694 | ≤1.8% | ≥400 | [HF 仓库](https://github.com/huggingface/cosmopedia)，“>10k H100 GPU hours”，250 亿 token |

- 说明：稠密模型加 FP8 的极限能到 25% 到 38%，MoE 通常 10% 到 21%。
- 单机版 vLLM 和 SGLang 大约 6% 到 10%。老的开源流水线只有 2% 左右。
- 我取 10%，处在中间。
- DeepSeek 概览里按 $2/卡时算，每百万输出 token 的成本约 $0.52。SGLang 博客是 $0.20。

### B. 公开蒸馏数据集的规模

| 数据集 | 条数 | token 或算力 | 出处 |
|---|---|---|---|
| Alpaca | 5.2 万条，text-davinci-003 | API 花费不到 $500；微调 8×A100 约 3 小时。token 数我按 $0.02/1K 反推约 ≤2500 万，待核实 | [Alpaca 仓库](https://github.com/tatsu-lab/stanford_alpaca)、[Willison 转述](https://simonwillison.net/2023/Mar/13/alpaca/) |
| Magpie-Air | 300 万条，Llama-3-8B-Instruct | 206 A100·h（4×A100 服务器），平均约 426 token/轮 | Magpie 论文，同上 |
| Magpie-Pro | 100 万条，Llama-3-70B-Instruct | 614 A100·h，平均约 478 token/轮 | 同上 |
| OpenHermes 2.5 | 约 100 万条，GPT-4 合成 | token 数未公布，待核实 | [数据集卡](https://huggingface.co/datasets/teknium/OpenHermes-2.5) |
| NuminaMath-CoT | 859,608 条 | token 数未公布，待核实 | [数据集卡](https://huggingface.co/datasets/AI-MO/NuminaMath-CoT) |
| OpenThoughts-114k | 11.4 万条，R1 老师 | 算力未公布 | [数据集卡](https://huggingface.co/datasets/open-thoughts/OpenThoughts-114k) |
| OpenThoughts3-1.2M | 120 万条（数学 85 万、代码 25 万、科学 10 万），QwQ-32B 老师，每题采 16 条 | 标注用 22,000 H100·h（约 31 H100·月）；7B 学生训练 25,000 A100·h | [论文附录 O](https://arxiv.org/html/2506.04178v1) |
| DeepSeek-R1 的 80 万条 SFT 集 | 804,745 条（数学 395,285、代码 211,129、通用 177,812 等） | 平均 5,355 token/条，合计约 43.1 亿 token；R1 本体 SFT 训 2 个 epoch | [R1 论文 v2 表 5](https://arxiv.org/html/2501.12948v2)、[v1 §2.3.3](https://arxiv.org/html/2501.12948v1) |
| Llama-Nemotron 后训练集 | 33,011,757 条（数学 2207 万、代码 1011 万） | token 数未给；LN-Ultra 的 RL 阶段约 140k H100·h | [论文](https://arxiv.org/html/2505.00949) |
| Cosmopedia | 3000 万+ 文件，约 250 亿 token | >10,000 H100·h，实测比公式慢约 5 倍 | HF 仓库 |
| Nemotron-CC | 合成约 1.9 万亿 token，Mistral NeMo 12B（FP8） | GPU 小时未给；我按 F1 估约 12.8 万 H100·h（约 178 H100·月） | [论文](https://arxiv.org/html/2412.02595) |
| Phi-4 | 合成约 4000 亿 token（50 类），占预训练约 40% | 老师 GPT-4o，参数不公开，算不了 | [论文](https://arxiv.org/html/2412.08905) |

- 同类参照：游戏里 `ds_r1_traces` 的 {math 1.2, code 0.6} 比例，与 R1 集的数学占 49%、代码占 26% 基本吻合，可以把“R1 整套”当 1 档数据包。
- 真实 R1 级蒸馏集（约 100 万条）的生成算力范围是 1 到 31 H100·月：公式算 1.2 到 5，OpenThoughts3 实测 31。

### C. 学生训练的真实例子

- Sky-T1-32B：8×H100 约 19 小时，不到 $450（[TechCrunch](https://techcrunch.com/2025/01/11/researchers-open-source-sky-t1-a-reasoning-ai-model-that-can-be-trained-for-less-than-450)）。
- OpenThinker-32B：114k 条、3 个 epoch，4 节点 ×8 H100 约 90 小时，即 2,880 H100·小时（来自模型卡镜像，待核实原卡，[镜像](https://huggingface.co/shaffhausen/OpenThinker-32B)）。
- 按 F5 算 R1 整套（43 亿 token）训 2 个 epoch：
  - 1.5B 是 0.08 H100·月
  - 7B 是 0.36
  - 32B 是 1.66
  - 70B 是 3.6
- R1-Distill 各尺寸的 epoch 论文没写，我按 2 个算，待核实。
- Llama 3.2：1B 用 37 万 H100·小时、3B 用 46 万，训到最多 9T token，期间用 8B 和 70B 的 logits 当目标（[模型卡](https://github.com/meta-llama/llama-models/blob/main/models/llama3_2/MODEL_CARD.md)）。
  - 折成 H100·月是 514 和 639。
  - 模型卡里文字写合计 916k、表里加起来 833k，两边对不上。
  - 按 F6 算 1B 只要 210 H100·月，报告值是它的 2.4 倍。
- Gemma 3 的 1B、4B、12B、27B 分别训 2T、4T、12T、14T token，全部用蒸馏，每个 token 取老师 256 个 logits（[报告](https://arxiv.org/html/2503.19786)）。
- Qwen3 全家用 36T token；小模型用旗舰做“强到弱蒸馏”，只花四阶段训练 1/10 的 GPU 小时。8B 学生上，在线蒸馏用 1,800 GPU 小时，纯 RL 用 17,920。蒸馏后 AIME'24 是 74.4，RL 是 67.6（[Qwen3 报告表 21](https://arxiv.org/html/2505.09388)，卡型没写）。
- Minitron：从大模型剪枝加蒸馏，每个模型最多少用 40 倍训练 token（[论文](https://arxiv.org/abs/2407.14679)）。
- 《Distillation Scaling Laws》：总成本是学生 6·N·D 加老师前向 2·N_老师·D；老师越强不一定学生越好，存在 U 形（[论文](https://arxiv.org/abs/2502.08606)）。

### D. 学生能练多好

**D1. R1-Distill 相对 R1（只做 SFT，不做 RL）**

R1 本体：AIME 79.8、MATH-500 97.3、GPQA 71.5、LiveCodeBench 65.9。数据出自 R1 论文 v1 的表 4、5。下表是学生分数占 R1 的比例。

| 学生 | AIME | MATH | GPQA | LCB |
|---|---|---|---|---|
| Qwen-1.5B | 36% | 86% | 47% | 26% |
| Qwen-7B | 70% | 95% | 69% | 57% |
| Llama-8B | 63% | 92% | 69% | 60% |
| Qwen-14B | 87% | 97% | 83% | 81% |
| Qwen-32B | 91% | 97% | 87% | 87% |
| Llama-70B | 88% | 97% | 91% | 87% |

- 32B 到 70B 基本停在约 3 分（游戏曲线下）。我取下限 2.5，规格里现在的 0.5 太乐观。
- 同表 6 里，直接对 32B 做 RL 的 AIME 只有 47.0，蒸馏版是 72.6。论文自己也说小模型靠大规模 RL 要花巨大算力。

**D2. Qwen3 小模型占旗舰 235B-A22B（思考模式，表 11、13、15、17、19）**

| 学生 | MMLU-Redux | GPQA | AIME'24 | LCB v5 |
|---|---|---|---|---|
| 32B | 98% | 96% | 95% | 93% |
| 30B-A3B | 97% | 93% | 94% | 89% |
| 14B | 96% | 90% | 93% | 90% |
| 8B | 94% | 87% | 89% | 81% |
| 4B | 90% | 79% | 86% | 77% |
| 1.7B | 80% | 56% | 56% | 47% |
| 0.6B | 60% | 39% | 12% | 17% |

- 我用 `benchmarks.js` 的曲线把这些分数反推成游戏分数，再对 5 个稠密尺寸拟合，得到 F7 的 25·N^-0.55。
- 反推出的游戏差距（知识、数学、代码三维平均）：
  - 32B 约 3.7
  - 14B 约 6.1
  - 8B 约 7.9
  - 4B 约 10.4
  - 1.7B 约 18.4
  - 0.6B 约 30.8
- R1-Distill 单独拟合得到指数 -0.55、系数 21，跟 Qwen3 一致。
- 现有规格公式 1.5 + 6·log10(A老师/A学生) 在中间尺寸还行，对小模型明显偏小：
  - 8B 是 4.1，实测约 7.9
  - 1.7B 是 8.2，实测 18.4
  - 0.6B 是 10.9，实测 30.8
- 其他几个交叉验证：
  - Llama 3.2 3B 相对 3.1 8B：MMLU 63.4/69.4，GSM8K 77.7/84.5，MATH 48.0/51.9（模型卡）。
  - Gemma 2 的 9B（蒸馏）平均分 70.2，只比 27B 低 4.2。
  - Gemma 2 表 6：2B 学生训 500B token，蒸馏 67.7 对从头训 60.3（[报告](https://arxiv.org/html/2408.00118)）。

**D3. 学生差距主要看总参数还是激活参数：MoE 对照实验**

| 对照 | 总/激活 | 结果 | 反推等效稠密规模 |
|---|---|---|---|
| Qwen1.5-MoE-A2.7B 对 Qwen1.5-7B（[博客](https://qwenlm.github.io/blog/qwen-moe/)） | 14.3B/2.7B | MMLU 62.5/61.0，GSM8K 61.5/62.5，HumanEval 34.2/36.0 | 约 7B（α≈0.43） |
| OLMoE-1B-7B 对 OLMo-1B 和 OLMo-7B（[论文表 4](https://arxiv.org/html/2409.02060)） | 6.9B/1.3B | MMLU 54.1 对 32.1 和 54.9；ARC-C 62.1 对 36.4 和 68.0 | 约 5 到 7B（α 0 到 0.2） |
| Qwen3-30B-A3B 对 14B/8B/32B（报告表 5、6、15） | 30B/3B | 基座 MMLU 81.38 对 14B 的 81.05，MATH 59.04 对 14B 的 62.02、8B 的 60.8；思考模式 AIME'24 80.4 对 79.3 和 81.4 | 约 14 到 19B（α≈0.26）；Qwen 自己说“约 1/5 激活参数” |
| Ling-mini-2.0（[模型卡](https://huggingface.co/inclusionAI/Ling-mini-2.0)，厂商口径） | 16B/1.4B | 厂商称等于 7 到 8B 稠密 | α≈0.31 |
| Gemma 4 26B-A4B 对 31B（[模型卡](https://huggingface.co/google/gemma-4-26B-A4B-it)） | 25.2B/3.8B 对 30.7B | MMLU-Pro 82.6/85.2，GPQA 82.3/84.3，AIME26 88.3/89.2，LCB 77.1/80.0；但 Codeforces 1718/2150，Tau2 68.2/76.9，HLE 8.7/19.5，MRCR 44.1/66.4 | 约 12B（α≈0.38） |
| Qwen3.5-35B-A3B、27B、122B-A10B（[35B 卡](https://huggingface.co/Qwen/Qwen3.5-35B-A3B)、[122B 卡](https://huggingface.co/Qwen/Qwen3.5-122B-A10B)） | 35B/3B；122B/10B | MMLU-Pro 85.3/86.1/86.7，GPQA 84.2/85.5/86.6，LCB 74.6/80.7/78.9，SWE-bench Verified 69.2/72.4/72.0 | 35B-A3B 略低于 27B 稠密；122B-A10B 约等于 27B |
| Qwen3-Next-80B-A3B 对 30B-A3B-2507 和 235B-A22B-2507（[卡](https://huggingface.co/Qwen/Qwen3-Next-80B-A3B-Instruct)） | 80B/3B | MMLU-Pro 80.6/78.4/83.0，GPQA 72.9/70.4/77.5，AIME25 69.5/61.3/70.3，TAU2-Retail 57.3/57.0/74.6 | 激活相同、总参数 ×2.6：知识和推理涨 2 到 8 点，Agent 基本不涨 |
| DeepSeek-V4-Flash 对 V4-Pro（[Flash 卡](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash)、[Pro 卡](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro)） | 284B/13B 对 1.6T/49B | SimpleQA-Verified 34.1/57.9；MMLU-Pro 86.2/87.5；GPQA 88.1/90.1；LCB 91.6/93.5；Terminal-Bench 56.9/67.9；BrowseComp 73.2/83.4 | 冷门事实随总参数掉得大，考试式推理掉得小，Agent 居中 |

- 对 Gemma 4 那一行，我用 F7 的拟合反推：26B-A4B 比 31B 差约 2.5 分，对应 N_eff 约 12B，公式给 14.3B，吻合。
- α 是激活参数在对数意义下的权重。6 个点的均值约 0.3，所以取 N_eff = T^0.7·A^0.3。
- 总参数救不了很小的激活参数。理论依据是《Mixture of Parrots》（[论文](https://arxiv.org/abs/2410.19034)）：激活参数固定时，加专家主要提升记忆（知识），对推理帮助很小。
- 实测里“难题、Agent、长上下文”掉得更多：Gemma 4 的 Codeforces、Tau2、HLE，Qwen3-Next 的 TAU2，V4-Flash 的 Terminal-Bench。
- 稀疏度的已知上限：Kimi K2 是 1/31（[卡](https://huggingface.co/moonshotai/Kimi-K2-Base)，1T/32B），V4-Pro 是 1/33（1.6T/49B），Qwen3-Next 是 1/27（80B/3B）。
- 观察到的最大“杠杆”（等效稠密规模除以激活参数）：
  - 激活 ≤1.5B 的模型最多约 7（Ling）。
  - 激活 3B 的最好成绩约 12（Qwen3-Next）。
  - 所以 N_eff 封顶取 10·A。
- 封顶在稀疏度超过 1/27 时才起作用，与已知最稀的旗舰（约 1/33）吻合。规格建议的“激活不低于总参数 1/40”留了余量。
- 120B 总参、0.5B 激活这种 1/240 的比例，没有任何公开先例，是外推。
  - 公式给出 N_eff=5B，差距约 10（D=36T）。D=1.5T 时约 20。
  - 外包里那个 7 天练出 Q72.8、比自家旗舰高 13 分的学生，在这个公式下不可能出现。

**D4. 其他结论（规格里要留意）**
- 小模型学长推理链会吃亏：3B 以下的学生从强推理老师那里学到的更少，混合长短推理链更好（[论文](https://arxiv.org/abs/2502.12143)）。
- Gemma 3 报告（§5.4）：短训练时用小老师更好，训得久了趋势反过来。

## 四、300 H100·月对 14 天，哪个更接近现实

| 项目 | 改动包 | 原版 | 真实/公式 | 谁更近 |
|---|---|---|---|---|
| 开源蒸馏（SFT 式，R1 整套规模） | 300 H100·月，占训练卡 | 14 天，扣推理份额上限 30% | 1.2 到 5 H100·月；384 H100 的小公司约 4 到 7 天；实测最贵 31 H100·月 | 原版。改动包高 10 到 250 倍 |
| 合成教材（0.3T token） | 400 H100·月 | 不收算力 | 7（A=3）到 115（A=49）H100·月，要看老师激活参数 | 都不准，用 F1。400 约等于 171B 激活的老师 |
| 占卡方式 | 占满训练卡，能停训一年多 | 扣推理份额，上限 30% | DeepSeek 把夜间闲置推理节点转给研究和训练 | 原版 |

- 改动包只在“预训练语料规模”的生成任务上算对了量级：Nemotron-CC 的 1.9T token 约 178 H100·月，与 300 同一数量级。
- 原版的毛病是工期固定，与老师大小、公司大小无关，也没检查老师放不放得下。

## 五、待核实和估算项

1. ρ（R1 拒绝采样的过采样倍数）未公布，取 3 是估计。OpenThoughts3 每题 16 条，保留率没找到。
2. R1-Distill 各尺寸训练 epoch 论文未写，按 2 个算。
3. 长推理链生成的 η 可能低于 10%。OpenThoughts3 的 22,000 H100·h 对应的 token 数没公布，无法反推吞吐。
4. “3 天整理加 7 天下限”和“1.3 倍显存系数”是设计取值，无直接出处。
5. α=0.3 由 6 个对照拟合：混了厂商自报（Ling、Qwen3.5）、基准接近饱和、不同年代配方。D 项指数 −0.2 没有直接的蒸馏实测，是借用一般数据缩放规律，只在 1.5T 到 15T 区间与规格原来的 −log2 项同量级。
6. 游戏 RAW 里 Kimi K3、GLM-5.3、Muse Spark Open、V4-Pro-0813 的结构未逐个核实。GLM-5 是 744B/40B（[卡](https://huggingface.co/zai-org/GLM-5)，总参另有 754B 的写法），V4-Pro 是 1.6T/49B（Pro 卡），0813 版沿用的假设待核实。
7. DeepSeek-V4 发布日期各源有 4 月 24 日和 26 日两种写法，不影响结论。
8. SGLang 博客的 22.3k 没写输出长度；Qwen3-30B-A3B 激活参数论文写 3B，HF 卡可能是 3.3B。
9. Llama 3.2 模型卡的 GPU 小时，文字和表格合计对不上（916k 对 833k）。
10. OpenThinker-32B 的 90 小时来自卡镜像，没核原卡。Alpaca 的 token 数是反推。OpenHermes、NuminaMath、Llama-Nemotron 的 token 数没找到。

代码和规格参照（均只读）：`src/career/sim/game.js` 里 `distillOptions` 的 `gpuMonths=300`、`doDistillData` 的 `addDays(14)`、`monthClose` 的 0.3 上限；`src/career/sim/model.js` 里 `previewDistill` 的 `3+7·log10`；`docs/spec/v1.0-spec.md` 的 D7；`docs/spec/v0.9.2-review.md` 的 C2、四·16 以及决策项 6、7。

---

# 核对

# 蒸馏调研「定稿建议」核对报告（2026-10-21）

核对方式：用 WebFetch 逐条打开原始来源，一共抽查约 55 处。网络搜索额度中途用完，所以 2026 年新模型改用 Hugging Face 官方模型卡和官方 API 列表核对。q 值用项目模块和 `sota_check.mjs` 的修订表（fixes 和 adds）复算，临时脚本已删，没有复制项目，没有 npm install。

## 一、核对表

「对」表示核实无误，「微」表示基本对但有措辞或口径小问题，「错」表示需要更正。

### 1. 真实吞吐和训练规模

| 条目 | 原文 | 核实结果 | 出处 | 有误？ |
|---|---|---|---|---|
| DeepSeek 线上 | 168B 输出/天，226.75 节点，峰值 278，解码 14.8k/节点，$2/卡时，夜间转给研究和训练 | 全部一致。我复算：每卡 1,850 和 1,072 tok/s，利用率 13.8% 和 8.0%，空出约 18.4% | [DeepSeek 推理系统概览](https://github.com/deepseek-ai/open-infra-index/blob/main/202502OpenSourceWeek/day_6_one_more_thing_deepseekV3R1_inference_system_overview.md) | 对 |
| SGLang 96×H100 | 输出 22.3k tok/s/节点，$0.20/百万 | 一致；页面写的输入长度是 2000 | [LMSYS 博客](https://lmsys.org/blog/2025-05-05-large-scale-ep/) | 对 |
| TRT-LLM 跑 R1 | 8×H200，输入 1K 输出 2K，批 1024，1,436 tok/s/卡 | 一致（总 11,489，每卡 1,436.16） | [TRT-LLM 文档](https://nvidia.github.io/TensorRT-LLM/0.19.0/blogs/Best_perf_practice_on_DeepSeek-R1_in_TensorRT-LLM.html) | 对 |
| TRT-LLM Llama | 8B 15,270；70B 1,385；405B 458 | 页面是总吞吐：8B 15,270.02，70B 11,082.48，405B 3,661.85。除以 8 得 1,385 和 458，原文的换算对。 | [perf-overview](https://nvidia.github.io/TensorRT-LLM/1.0.0rc2/performance/perf-overview.html) | 对 |
| dstack 6,311 | 8×H200 SGLang 离线，输入 3200 输出 800 | 6,311 tok/s 属实。页面文字没写这一档的输入输出长度（3200 只出现在在线测试里），长度口径无法核实 | [dstack](https://dstack.ai/blog/h200-mi300x-deepskeek-benchmark/) | 微（长度待核实） |
| Magpie | Air 300 万条 206 A100·h；Pro 100 万条 614 A100·h；426 和 478 token/轮 | 一致。Pro 总 4.77 亿 token，由此得约 216 tok/s/卡，也一致 | [Magpie](https://arxiv.org/html/2406.08464v2) | 对 |
| Cosmopedia | 3000 万+文件，25B token，>10k H100·h | 一致。生成模型是 Mixtral-8x7B-Instruct | [HF 仓库](https://github.com/huggingface/cosmopedia) | 对 |
| Nemotron-CC | 合成 1.9T，Mistral NeMo 12B，FP8，GPU 小时未给 | 一致。正文也出现「over 1.8T」，表 3 合计约 1.87T | [论文](https://arxiv.org/html/2412.02595) | 对 |
| Phi-4 | 合成约 4000 亿 token，50 类，占 40%，老师 GPT-4o | 一致 | [论文](https://arxiv.org/html/2412.08905) | 对 |
| OpenThoughts3 | 85 万数学 + 25 万代码 + 10 万科学，QwQ-32B，每题 16 条，标注 22,000 H100·h，7B 训练 25,000 A100·h | 全部一致（附录 O 写的是 16 个 GH200 节点） | [论文](https://arxiv.org/html/2506.04178v1) | 对 |
| R1 的 80 万条 SFT 集 | 804,745 条，数学 395,285，代码 211,129，通用 177,812，平均 5,355 token，SFT 2 个 epoch | 一致。表 5 还给出 STEM 10,124、逻辑 10,395；平均 5,355.3；v1 原文是「two epochs, about 800k samples」。我复算总量约 43.1 亿 token | [v2 表 5](https://arxiv.org/html/2501.12948v2)、[v1 §2.3.3](https://arxiv.org/html/2501.12948v1) | 对 |
| Llama-Nemotron | 33,011,757 条，数学 2207 万，代码 1011 万，LN-Ultra RL 约 140k H100·h | 一致 | [论文](https://arxiv.org/html/2505.00949) | 对 |
| Llama 3.2 | 1B 370k、3B 460k，最多 9T，用 8B 和 70B 的 logits；文字 916k 与表合计 833k 对不上 | 全部一致，矛盾确实存在。我复算：514 和 639 H100·月，F6 算出 210 | [模型卡](https://github.com/meta-llama/llama-models/blob/main/models/llama3_2/MODEL_CARD.md) | 对 |
| Gemma 3 | 1B/4B/12B/27B 训 2T/4T/12T/14T，每 token 取 256 个 logits，§5.4 小老师短训更好 | 一致 | [报告](https://arxiv.org/html/2503.19786) | 对 |
| Gemma 2 | 表 6：2B 训 500B token，蒸馏 67.7 对从头训 60.3；9B 平均 70.2，27B 74.4 | 一致。表 6 的平均只含 3 个基准。27B 其实是从头训的，原文没说它蒸馏，没错 | [报告](https://arxiv.org/html/2408.00118) | 对 |
| Sky-T1 | 8×H100，约 19 小时，不到 $450 | 一致，即 152 H100·h（样本数文章没写） | [TechCrunch](https://techcrunch.com/2025/01/11/researchers-open-source-sky-t1-a-reasoning-ai-model-that-can-be-trained-for-less-than-450) | 对 |
| OpenThinker-32B | 114k 条，3 个 epoch，4 节点×8 H100，约 90 小时，2,880 H100·h | 原卡和镜像都核实了：「On 4 nodes, this took around 90 hours」，8×H100 P5 节点。2,880 是乘出来的 | [原卡](https://huggingface.co/open-thoughts/OpenThinker-32B) | 对（可去掉「待核实」） |
| Alpaca | 5.2 万条，<$500，微调 8×A100 约 3 小时 | 数据成本 <$500 和 52K 在 GitHub README；「3 小时、8×A100、<$100」在斯坦福博客，不在 README | [CRFM 博客](https://crfm.stanford.edu/2023/03/13/alpaca.html)、[README](https://github.com/tatsu-lab/stanford_alpaca) | 微（出处应改引博客） |
| NuminaMath-CoT | 859,608 条 | 来源明细合计 859,608，行数字段显示 859,594 | [数据集卡](https://huggingface.co/datasets/AI-MO/NuminaMath-CoT) | 对 |
| OpenHermes 2.5 | 约 100 万条 | 100 万行，标签是 Synthetic/GPT-4/Distillation | [数据集卡](https://huggingface.co/datasets/teknium/OpenHermes-2.5) | 对 |

### 2. 学生能练多好

| 条目 | 原文 | 核实结果 | 出处 | 有误？ |
|---|---|---|---|---|
| R1 与 R1-Distill 分数 | R1：AIME 79.8，MATH 97.3，GPQA 71.5，LCB 65.9；Qwen-1.5B 到 Llama-70B 各档百分比 | 我用 v1 表 4、5 的原始分数逐格复算，占比全部对（例：32B 为 72.6/94.3/62.1/57.2 对应 91/97/87/87%） | [R1 v1](https://arxiv.org/html/2501.12948v1) | 对 |
| 表 6 | 直接 RL 的 32B AIME 47.0，蒸馏版 72.6 | 一致（R1-Zero-Qwen-32B 47.0/91.6/55.0/40.2） | 同上 | 对 |
| Qwen3 思考模式 | 235B 与各小模型的 MMLU-Redux、GPQA、AIME'24、LCB v5 | 8 行 32 个分数全部一致；占比我复算，全对 | [Qwen3 报告](https://arxiv.org/html/2505.09388) | 对 |
| Qwen3 表 21 | 8B：在线蒸馏 1,800 GPU·h，AIME'24 74.4；RL 17,920 GPU·h，67.6；约 1/10 | 数字全对。但原文「纯 RL」措辞不准：表里 RL 和在线蒸馏都是从同一个「离线蒸馏好的 8B 检查点」出发，不是从底座纯 RL。离线蒸馏那一步的算力表里没给（「-」） | 同上，表 21 | 微（措辞） |
| Qwen3 36T | 全家 36T token | 一致 | 同上 | 对 |
| 反推游戏差距 | 32B 3.7、14B 6.1、8B 7.9、4B 10.4、1.7B 18.4、0.6B 30.8 | 我用 `benchmarks.js` 的 σ 曲线独立反推：3.7、6.1、8.1、10.7、18.7、30.3，最大偏差 0.5，复现成立 | `src/career/data/benchmarks.js` | 对 |
| 分维系数 | 知识×1.8、代码×0.6、数学×0.55 | 中档（4B 到 32B）知识约 1.7 到 2.0、代码 0.5 到 0.7、数学 0.5 到 0.6，成立。但 1.7B 和 0.6B 时知识降到 1.3 到 1.5，数学升到 0.7 到 0.9，常数系数在小模型上偏离。「q 总差距不变」实际是 0.989 倍 | 同上，自算 | 微 |
| 现有公式的偏小 | 1.5+6·log10(22/s)：8B 4.1、1.7B 8.2、0.6B 10.9 | 复算 4.14、8.17、10.89，全对。D7 里的「T_k − 0.5」、`previewDistill` 的 `3+7·log10` 也与代码一致 | `v1.0-spec.md:1021`、`model.js:221` | 对 |
| Llama 3.2 3B 对 3.1 8B | MMLU 63.4/69.4，GSM8K 77.7/84.5，MATH 48.0/51.9 | 一致 | 同上模型卡 | 对 |
| 蒸馏标度律 | 成本=学生 6ND+老师前向 2N_T·D；存在 U 形 | 论文式 9 是 3F(N_S)D+F(N_T)D，F≈2N，等价。图 4：学生损失随老师增大先降后升（"capacity gap"） | [论文](https://arxiv.org/abs/2502.08606) | 对 |
| Mixture of Parrots | 激活固定时加专家主要提升记忆，推理饱和 | 一致 | [论文](https://arxiv.org/abs/2410.19034) | 对 |
| 小模型学不动强推理链 | ≤3B 学生从长推理链学得差，混合更好 | 一致 | [论文](https://arxiv.org/abs/2502.12143) | 对 |
| Minitron | 最多少用 40 倍训练 token | 一致，全模型家族总算力省 1.8 倍 | [论文](https://arxiv.org/abs/2407.14679) | 对 |

### 3. MoE 对照实验与结构参数

| 条目 | 原文 | 核实结果 | 出处 | 有误？ |
|---|---|---|---|---|
| Qwen1.5-MoE | 14.3B/2.7B；MMLU 62.5/61.0，GSM8K 61.5/62.5，HumanEval 34.2/36.0 | 一致；α≈0.43 我复算对 | [博客](https://qwenlm.github.io/blog/qwen-moe/) | 对 |
| OLMoE | 6.9B/1.3B；MMLU 54.1/32.1/54.9；ARC-C 62.1/36.4/68.0 | 一致（表 4） | [论文](https://arxiv.org/html/2409.02060) | 对 |
| Qwen3-30B-A3B | 论文写 3B，HF 卡写 3.3B；基座 MMLU 81.38 对 14B 81.05；MATH 59.04、62.02、60.80 | 一致。卡上是 30.5B 总参、3.3B 激活，128 专家激活 8 个 | [卡](https://huggingface.co/Qwen/Qwen3-30B-A3B)、报告表 5、6 | 对 |
| Ling-mini-2.0 | 16B/1.4B，厂商称等于 7 到 8B 稠密 | 一致，卡上自称 1/32 激活比、「over 7× equivalent dense performance」 | [卡](https://huggingface.co/inclusionAI/Ling-mini-2.0) | 对 |
| Gemma 4 | 25.2B/3.8B 对 30.7B；全部 9 个指标 | 逐项一致（含 Codeforces 1718/2150，Tau2 68.2/76.9，HLE 8.7/19.5，MRCR 44.1/66.4） | [卡](https://huggingface.co/google/gemma-4-26B-A4B-it) | 对 |
| Qwen3.5 | 35B-A3B 3B 激活；MMLU-Pro 85.3/86.1/86.7；GPQA 84.2/85.5/86.6；LCB 74.6/80.7/78.9；SWE 69.2/72.4/72.0 | 一致 | [35B 卡](https://huggingface.co/Qwen/Qwen3.5-35B-A3B) | 对 |
| Qwen3-Next | 80B/3B；MMLU-Pro 80.6/78.4/83.0；GPQA 72.9/70.4/77.5；AIME25 69.5/61.3/70.3；TAU2-Retail 57.3/57.0/74.6 | 一致 | [卡](https://huggingface.co/Qwen/Qwen3-Next-80B-A3B-Instruct) | 对 |
| V4-Flash 对 V4-Pro | 284B/13B 对 1.6T/49B；SimpleQA-V 34.1/57.9；MMLU-Pro 86.2/87.5；GPQA 88.1/90.1；LCB 91.6/93.5；TB 56.9/67.9；BC 73.2/83.4 | 全部一致（Max 列）。Flash 的卡片元数据写 291B，与正文 284B 有出入 | [Flash 卡](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash)、[Pro 卡](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro) | 对 |
| Kimi K2 | 1T/32B，稀疏 1/31 | 一致（384 专家选 8 个 + 1 个共享） | [卡](https://huggingface.co/moonshotai/Kimi-K2-Base) | 对 |
| GLM-5 | 744B/40B，另有 754B 写法 | 一致 | [卡](https://huggingface.co/zai-org/GLM-5) | 对 |
| V4-Pro 稀疏度 | 1/33 | 49/1600=1/32.7 | Pro 卡 | 对 |
| DeepSeek-V3.2 | 37B 激活 | 卡上只写 685B（含 MTP 模块），没写 37B；37B 沿用 V3 的已知值。V3.2 卡 MMLU-Pro 85.0、GPQA 82.4 | [卡](https://huggingface.co/deepseek-ai/DeepSeek-V3.2) | 微（出处弱） |
| H100 峰值 | 989 TFLOPs 是 BF16 稠密 | NVIDIA 官网：BF16 1,979、FP8 3,958，都带稀疏，故稠密 989 和 1,979，原文折半正确 | [NVIDIA](https://www.nvidia.com/en-us/data-center/h100/) | 对，但见口径提醒 |
| SGLang 单机 | 671B 用 8×H200 | 文档 FP8 一栏写「8× H200、8× B200、8× MI300X、2×8× H100/H800/H20」。16 张 H100 才是官方配置，F2 的 n_min=11 偏乐观，原文已说实务用 16 | [SGLang 文档](https://docs.sglang.io/basic_usage/deepseek_v3.html) | 微 |

### 4. 游戏数据修订（用 qOf 加修订表复算）

| 条目 | 原文 | 复算结果 | 出处 | 有误？ |
|---|---|---|---|---|
| Qwen3.5-397B-A17B | q=88.64 | 0.22×(90+90+92+84)+0.12×86=88.64 | `rivals.js:201` | 对 |
| DeepSeek-V3.2 | q=87.26 | 87.26；高于它的 Qwen3.5 排名成立。官方卡也同向：Qwen3.5-397B 的 MMLU-Pro 87.8、GPQA 88.4，对 V3.2 的 85.0、82.4 | `rivals.js:119` | 对 |
| V4.1-Flash 与 V4-Pro-0813 | 88.9 与 93.12，比值约 95% | 88.90 与 93.12，比值 95.47% | `rivals.js:127、121` | 对 |
| 「每 token 成本只有 27%」 | 13B 对 49B | 13B 是 V4-Flash 的值，不是 V4.1-Flash。见下文更正一 | V4.1-Flash 卡 | 错 |
| 修订表影响 | 修订批次（o1、R1、GLM-4、Qwen3-2507）与这几行无关 | 不影响上面几个 q 值和排序。修订后 R1=76.92、o1 修订值 [86,82,87,80,80,42]，与 `sota_check.mjs` 一致 | `sota_check.mjs` | 对 |
| 家族最强（按 q，含修订） | 老师按能力选最强 | DeepSeek 系 V4-Pro-0813 93.12；GLM 系 GLM-5.3 92.80；Kimi K3 92.68；Muse Spark Open 91.54。参数最大的 K3（2.8T）并不是最强，正好印证制作人的原则 | `rivals.js` | 对 |

### 5. 代码与规格引用、公式复算

| 条目 | 核实结果 | 有误？ |
|---|---|---|
| `gpuMonths=300`、`addDays(14)`、`Math.min(0.3,…)`、`previewDistill` 的 `3+7·log10`、`core.js:152` 的 40% MFU | 全部在源码中位置一致（`game.js:531、566、915`，`model.js:221`，`core.js:152`）。注意本机源码是 BASE：`300` 在这里是「占 300 张卡」，从推理份额里扣，上限 30%。改动包里「300 H100·月占训练卡」的版本不在本机，无法直接核对，只能与审查报告 C2「生成任务排在训练前面，能把训练卡全部吃光」「96 张 A100 的小公司要停训 420 天左右」互相印证 | 对（改动包版本未核） |
| `computeH100: 400` 从没被读，tokens 0.3 | `datasets.js:46` 的 `computeH100` 全仓库只出现这一处；tokens=0.3 | 对 |
| `ds_r1_traces` {math 1.2, code 0.6} 与 R1 集数学 49%、代码 26% | 395,285/804,745=49.1%，211,129/804,745=26.2% | 对 |
| 公司硬件 | 小公司 2023 为 96 张 A100，小公司 2025 为 384 张 H100，专精 2025 为 1200 张 H100，`major`（原文叫「大厂」）2025 为 6000 张 H100 | 微：`bigtech` 2025 是 24,000 张，原文的「大厂2025」其实是 `major` |
| F1 系数 | 2A FLOPs/token，利用率 10%，989 TFLOPs：每十亿 token 5.617 H100·h，即 0.00778 H100·月；游戏口径 8A | 对 |
| 表 1 | 大部分一致；个别格因系数取 0.0078 而不是 0.007778 差 1 到 2%（A=37、1000 亿：28.8；3000 亿：86.3，原文 87；A=405 的 4.3B：13.5 月，原文 14） | 微 |
| 表 2 | 12/7/7/7；27/7/7/7；3000 亿 A=37 小公司2023 我算 203 天（原文 204）；26；11；7；20/7/7/7。30% 卡数 13、115、360、1800 | 对 |
| 占满训练卡天数 | 小公司2023 293 天，小公司2025 23.4 天，专精2025 7.5 天；与原文逐位一致 | 对 |
| F2 | 671B 11 张，235B 4 张，1.6T 26 张 | 对 |
| F5/F6 | F5：0.08/0.36/1.66/3.62。F6：8B/22B/1.5T 为 138，BASE 为 32.4，低估 4.3 倍 | 对 |
| F7 | 120B/0.5B 的 N_eff=5，差距 10.3；D=1.5T 时 19.5。Gemma 4 N_eff=14.3；Ling 7.7；封顶起效点 10^(1/0.7)=26.8，即稀疏度 1/27 | 对 |
| 300 H100·月的换算 | A=37 约 1.04 万亿 token；按 100 到 400 h/十亿 token 的实测范围得 0.54 到 2.16 万亿，与原文 0.5 到 2.2 万亿一致；是 R1 集的 116 到 510 倍；等于线上 6 天输出 | 对 |
| 「400 约等于 171B 激活」 | 400×720/(5.6×300)=171.4 | 对 |

### 6. 本次没能核实的条目

- ρ=3、1.3 倍显存系数、「3 天整理加 7 天下限」都是设计取值，无公开来源，原文已标注。
- Cosmopedia、Nemotron-CC 的算力是否按 η=10% 取值，没有独立证据。
- 搜索额度用完，DeepSeek-V4 发布日期（4 月 24 日还是 26 日）没能再核。V4-Pro 的 HF 页面标注论文发表于 4 月 26 日，倾向 26 日。
- 原文的 R1 过采样比例、R1-Distill 各尺寸 epoch、OpenThoughts3 的 token 数，我也没找到公开数字。

## 二、需要更正的地方

**更正一（错，影响结论 6）：V4.1-Flash 不是 13B 激活。**
- 官方卡原话：「552B backbone parameters」「activate only 8B parameters per token during prefill」「16B during decode」，另有 196B 的 Engram 条件记忆，元数据写 763B。13B/284B 是上一代 V4-Flash。出处：[V4.1-Flash 卡](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash)。
- 原文「每 token 成本只有 V4-Pro 的 27%」应改为：约 33%（解码按 16B 对 49B，即 0.327）；只算预填充则约 16%。
- 作为老师生成数据，应按解码的 16B 计价，不是 13B。3000 亿 token 合成教材约 37 H100·月，不是原文暗示的约 30 月。
- 能力比 95% 不变。
- V4-Pro-0813 的激活参数卡上没写。官方说它「built on the Preview model's structure」，所以暂按 49B，HF 元数据总参为 1.7T，仍待核实。

**更正二（遗漏，影响老师清单和 7 到 115 H100·月的上限）：「3B 到 49B 激活的老师」漏掉了当前最大的几个旗舰。**

| 老师 | 总参/激活 | 来源 | 3000 亿 token 合成教材 |
|---|---|---|---|
| Kimi K3 | 2.8T/104B（896 专家选 16+2 共享） | [卡](https://huggingface.co/moonshotai/Kimi-K3) | 243 H100·月 |
| Qwen3.8-2.4T-A95B | 2.4T/95B | [卡](https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B) | 222 |
| V4-Pro-0813 | 约 1.6T/49B | Pro 卡 | 114 |
| Muse Spark Open | 816B/42B | [卡](https://huggingface.co/meta-models/Muse-Spark-Open-816B-A42B) | 98 |
| GLM-5.3 | 总参约 753B，激活卡上没写（GLM-5 是 744B/40B，暂按 40B） | [GLM-5.3 卡](https://huggingface.co/zai-org/GLM-5.3) | 约 93 |
| V4.1-Flash | 552B 骨干/16B 解码 | 见更正一 | 37 |
| Qwen3.5-397B | 397B/17B | [卡](https://huggingface.co/Qwen/Qwen3.5-397B-A17B) | 40 |

- 范围应改为 37 到 243 H100·月。「400 H100·月只对激活约 170B 的老师成立」这个结论仍然成立，因为目前没有 170B 激活的开源老师，最大的 Kimi K3 才 104B。
- 原文里 A=405B（Llama 3.1 405B 稠密）那一列是历史参照，不是当前旗舰。
- 这些老师放得下的最少卡数：K3 约 46 张，Qwen3.8 约 39 张，V4-Pro 约 27 张。小公司2025 的 30% 卡有 115 张，放得下。
- 3000 亿合成教材配 K3，到货天数：小公司2025 约 67 天，专精2025 约 24 天，`major` 2025 约 8 天。

**更正三（RAW 数据疑点，需要制作人或下一轮研究处理）：Qwen3.8 的开源权重被标成了闭源。**
- RAW 里 `Qwen3.8-Max` 标记为 `frontier`、`open=0`，q=93.34。
- Hugging Face 上 2026-08-08 已有开源的 Qwen3.8-2.4T-A95B。官方卡说 Max 是「the official version based on Qwen3.8-2.4T-A95B with more features」，开源版是纯文本、必须开思考模式。
- 所以 Qwen 家族当前的开源最强不是 Qwen3.5-397B（88.64），而是 2.4T-A95B。q 值约略低于 Max，具体分数没法定。
- 原文第 0.6 条拿 Qwen3.5-397B 当 Qwen 老师的例子，在 2026-10 时点已经过时。
- 建议在 RAW 里补一行开源的 Qwen3.8-2.4T-A95B（2026-08，开放权重，大型），q 取 Max 略低一点，待核实。

**更正四（RAW 数据疑点，较轻）：**
- `DeepSeek-V4.1-Flash-1017`（HF 创建于 2026-10-17）在 RAW 里没有。官方称它是「a minor update」，各项成绩比 V4.1-Flash 高（HLE 36.8 到 42.6，Terminal-Bench 4.0 31.2 到 42.3）。若想要「当前旗舰」口径，建议加一行，待核实。
- Muse Spark Open：RAW 记 2026-10，卡上写 2026-10-15（HF 仓库建于 9-15）。V4.1-Flash 与 RAW 的 2026-09 一致（HF 2026-09-10）。Kimi K3 的 RAW 记 2026-07，卡上评测日期为 7 月，也合理（仓库建于 6-13）。V4-Pro-0813、GLM-5.3 的日期与 RAW 一致。

**更正五（口径提醒，不是错误）：**
- 表 A 的「折算利用率」是把 FP8 实测吞吐除以 BF16 稠密峰值 989。H100 的 FP8 稠密峰值是 1,979，所以 FP8 跑出来的「25% 到 38%」换成 FP8 峰值只有约 12% 到 19%。F1 的系数是直接用吞吐标定的，结果不受影响，但文字里最好写明「相对 BF16 稠密峰值」。

**更正六（口径与措辞，较轻）：**
- 稀疏度上限：原文写已知最稀的旗舰约 1/33（V4-Pro）。按新卡，V4.1-Flash 解码是 16/552=1/34.5，预填充 8/552=1/69，若算上 Engram 的 763B 总参则是 1/47.7，K3 是 1/27。规格建议的「激活不低于总参数 1/40」会误杀 V4.1-Flash 这类真实旗舰，建议放宽到 1/50，或写明按「骨干、解码激活」计。
- N_eff 封顶 10·A，与原文自己写的「3B 激活观察到的最大杠杆约 12」不一致。要么把封顶改成 12·A，要么注明 10 是保守值。
- Qwen3 表 21：「纯 RL」应改为「在已离线蒸馏好的 8B 上继续 RL」。
- Alpaca 的「3 小时、8×A100」应引斯坦福博客。
- 分维系数在 1.7B 以下偏离，用在小模型上要放宽。
- 表 2 的「大厂2025（6000 张 H100）」应写作「major 档」，`bigtech` 档是 24,000 张。
- 表 2 把 2025 年的 671B 老师放进 2023 年的 A100 行，老师当时并不存在。A100 也没有原生 FP8，671B 要按 BF16 或 INT8 放（约 22 张，仍放得下 28.8 张）。这行只能当「算力够不够」的示意。

## 三、整体可信度评价

**高。** 抽查约 55 处事实、数字和复算，错误只有一处实质性的（V4.1-Flash 激活参数），另有一处过时和遗漏（Qwen3.8 开源旗舰，加上 K3、Muse Spark Open、GLM-5.3 的结构参数补齐）。

- 论文和官方卡的数字几乎逐字对得上。
- 所有关键公式（F1、F2、F5 到 F7、两张表、293/23/8 天、q 值与 95% 比例）我都独立复算，只有取整级别的差异，最大约 2%。
- 学生差距的 25·N^-0.55 在我独立反推下复现，误差不超过 0.5 分。
- 原文自己标的「待核实」项基本都如实标了，其中 OpenThinker-32B 的 90 小时我已用原卡核实，可去掉标记。

核心结论不受这些更正影响：
- 300 H100·月不能收：对 R1 级蒸馏集高估 10 到 250 倍。
- 400 H100·月只在激活约 170B 时成立：现实中最贵的老师 K3 是 243。
- 生成数据花算力、占卡不超过 30%、蒸馏最短 7 天都可以留。
- 老师按能力最强选、按激活参数付钱：这一点被新数据加强了。参数最大的 Kimi K3（2.8T/104B）和 Qwen3.8（2.4T/95B）在 RAW 的 q 值里都不是最强，最强的是 V4-Pro-0813。

建议把更正一、二、三纳入下一版，其中更正三要转给制作人，因为它涉及 RAW 里一个开源/闭源标记。