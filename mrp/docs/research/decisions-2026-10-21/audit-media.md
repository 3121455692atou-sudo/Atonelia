# 图像 / 音乐 / 语音 23 个家族：游戏旗舰 vs 真实最强（核对日 2026-10-21）

## 0. 范围和口径

- 范围：只看图像 9 个、音乐 7 个、语音 7 个家族。LLM（含 Llama 3.1 405B 对 3.3 70B 那一例）不在这批家族里，没核对。
- 本批没有虚构条目，没有需要跳过的。
- 游戏的 qOf 已套用 D3 的修订：SD3 Medium、FLUX.1 [dev]、Qwen-Image、FLUX.2 [dev]、HunyuanImage 3.0、Qwen-Image-2.0，加新增的 FLUX.1 [pro]。
- 判“真实最强”的口径：同家族内，按公开竞技场和跑分比；参数大小不作依据。
- Elo 不同快照会差几分，下面的数字只用来比先后。

**出处简称**
- 【AA图】https://artificialanalysis.ai/image/leaderboard/text-to-image （AA-Image-T2I v2.1，2026-10-21 读取）
- 【AA语】https://artificialanalysis.ai/text-to-speech/leaderboard （同日）
- 【AA人声】https://artificialanalysis.ai/music/leaderboard/vocals
- 【AA器乐】https://artificialanalysis.ai/music/leaderboard/instrumental （这两个是 AA Music v1.1，提示词更难）
- 【AA乐旧】https://benchmarklist.com/arenas/artificial_analysis_music_vocals/ 与 …/artificial_analysis_music_instrumental/ （v1.0，2026-09-02 快照）
- 【LUM】https://lumenfall.ai/arena/text-to-image （2026-10-11）
- 【LMA】https://arena.ai/blog/nano-banana
- 【BFL】https://docs.bfl.ml/release-notes ，另有 https://bfl.ai/blog/24-08-01-bfl 、https://bfl.ai/blog/flux-3-image-klein
- 【MJ】https://en.wikipedia.org/wiki/Midjourney
- 【TL】项目 docs/research/timeline-2023-2026.json，每条自带官方链接

AA 页面是经抓取工具转述的，关键数字我尽量用两个来源互相印证。

## 1. 家族 × 月份：真实最强 / 游戏最强 / 是否一致（只列不一致或接近）

下表“游戏最强”的 qOf 以 D3 修订后为准。

### 图像

| 家族 | 月份 | 真实最强（出处） | 游戏最强（qOf） | 结论 |
|---|---|---|---|---|
| imagen | 2025-08 | Nano Banana：LMArena 文生图榜首（【LMA】），压过同家族 Imagen 4 | Imagen 4 与 Nano Banana 都是 84.00，靠行序才选到 Nano Banana | 平局，不稳 |
| flux | 2024-08 | FLUX.1 [pro]，[dev] 是它的蒸馏版（BFL 发布稿，https://bfl.ai/blog/24-08-01-bfl ；AA：[dev] 823） | [pro] 79.50 > [dev] 76.50（D3 新增后） | 一致，但 [pro] 行还没落库；同月两行，旧 latestRelease 取行序最后一行，[pro] 必须排在 [dev] 后面 |
| flux | 2024-10 | FLUX1.1 [pro]，发布日 2024-10-02（【BFL】、【TL】） | 记在 2024-11 | 一致，但差一个月 |
| flux | 2025-11 起 | FLUX.2 的 [pro]/[flex]/[max] 都不弱于 [dev]。AA：flex 1026 / max 1021 / pro 1003 / dev 1000；LUM：pro 1264 / max=flex 1252 / dev 1246 | 只有 [dev] 86.50，开源的最弱款当了旗舰 | 不一致 |
| flux | 2026-10 | FLUX 3 Image，2026-10-01，仅 API（【BFL】）；AA 1117，约第 13 名。另有 10-15 的开源小号 Klein 5.6B | 仍是 FLUX.2 [dev] 86.50 | 不一致 |
| seedream | 2025-12 | Seedream 4.5（12-03）。AA 1026；LUM 1260，高于 4.0 的 1244 | 4.0 为 87.75 | 不一致，2026-01 开局旗舰也错 |
| seedream | 2026-02 | 5.0 Lite 不比 4.5 强（AA 1017<1026；LUM 1232<1260） | 游戏没收录 Lite | 一致，不要加 |
| qwen_image | 2026-07 | Qwen-Image-3.0（07-21，闭源）。AA 1070，3.0-Pro 1095，2.0 是 990 | Qwen-Image-2.0，89.25 | 不一致 |
| qwen_image | 2026-09 | 仍是 3.0 最强；2.1（09-20，7B 开源）AA 1042，比 3.0 小也比 3.0 弱 | 无此行 | 提示陷阱：加了就得打 S 标签 |
| hunyuan_image | 2026-01 | HunyuanImage 3.0 Instruct（01-26）。AA 987，3.0 开源版 932 | 3.0，83.75 | 不一致（小） |
| ideogram | 2026-09 | 4.5 与 4.0 打平（AA：4.0 Quality 1026，4.5 High 1015） | 4.0，88.50 | 接近，不动 |

### 音乐

| 家族 | 月份 | 真实最强（出处） | 游戏最强（qOf） | 结论 |
|---|---|---|---|---|
| mureka | 2026-01 到 2026-08 | V8（01-28）→ V9（04-09）→ V9.5（08）。人声榜：V9 1159、V8 1140，都高于 Suno v5 的 1097 和 Lyria 3 Pro 的 1082（【AA乐旧】）；V9.5 1107 高于 Lyria 3.5 的 1052（【AA人声】） | Mureka O1，71.25 | 严重不一致 |
| lyria | 2026-03 | Lyria 3 Pro（03-25，3 分钟版），AA 器乐 1080，与 3.5 的 1078 基本一样 | Lyria 3 为 78.75（02 月），到 07 月才有 3.5（82.75） | 03–06 月缺一档 |
| stable_audio | 2025-09 / 2026-05 | 2.5（2025-09-10）；Stable Audio 3 Large（2026-05-20，2.7B，仅 API）。AA 器乐：3 Large 1014 > 2.5 984 > 2.0 959 | Stable Audio 2.0，35.25 | 不一致 |
| eleven_music | 2026-09 | v2.5（09-11）与 v2 打平（v1.1 人声 1012 对 999，器乐 1001 对 1011） | v2，80.50 | 一致，接近 |

### 语音

| 家族 | 月份 | 真实最强（出处） | 游戏最强（qOf） | 结论 |
|---|---|---|---|---|
| openai_tts | 2026-05 | OpenAI 唯一独立的 TTS 是 gpt-4o-mini-tts（2025-03-20），在 TTS Arena 上高于 tts-1-hd（https://benchmarklist.com/benchmarks/speech_arena/ ，1593 对 1527）。GPT-Realtime-2（05-07）是语音到语音的对话模型，OpenAI 没配新 TTS（https://thenextweb.com/news/openai-gpt-realtime-2-voice-models ）。AA 上它 1076，低于 TTS-1 HD 的 1102 | GPT-Realtime-2，69.00，高于 gpt-4o-mini-tts 的 64.25 | 不一致 |
| elevenlabs | 2024-07 | Turbo v2.5（1098）与 Multilingual v2（1096）打平（【AA语】） | Turbo 80.25 对 Multilingual 78.00 | 一致，接近 |
| elevenlabs | 2026-09 | v4（1328）与 v4 Turbo（1330）打平，小号追平大号 | v4，92.25 | 一致 |
| cartesia | 2025-10 到 2026-08 | Sonic 3（2025-10）、3.5（2026-05）、3.6（08-27，AA 1290，约第 4 名）（https://magica.com/news/cartesia-sonic-3-6-text-to-speech ） | 仍是 Sonic，2024-05，75.00 | 不一致 |
| gemini_tts | 2026-09 | Gemini 3.8 Flash TTS（09-23，AA 1279）（https://letsdatascience.com/news/google-launches-gemini-38-text-to-speech-models-cee3c0a7 ）。小号比大号强：2.5 Flash TTS 1062 > 2.5 Pro 1038 | 3.1 Flash TTS，2026-04，75.75 | 不一致 |
| cosyvoice | 2026-07 到 09 | Qwen-Audio-3.0/3.1-TTS-Plus，闭源 API，AA 1264 / 1298（约第 6 名 / 第 3 名） | Qwen3-TTS（0.6B/1.7B 开源），84.25；AA 上它只有 930 | 不一致 |
| minimax_speech | 2025-10 | Speech 2.6 HD 1129，介于 02-HD 1111 与 2.8 HD 1174 之间 | Speech-02，85.00，再下一款是 2.8 的 88.25 | 接近：2.8 仍是最强，只缺中间一代 |
| seed_tts | 2025-10 | Seed-TTS 2.0（10-16，https://www.pingwest.com/w/308310 ），没有第三方评测，强弱待核实 | Seed-TTS（2024-06），80.75 | 缺行，待核实 |

## 2. 四个剧本开局日：游戏在线旗舰是否等于当时最强

| 剧本 | 家族 | 真实当时最强 | 游戏开局旗舰 | 结论 |
|---|---|---|---|---|
| y2023 | 全部 | 一致。sd 只有 1.4，真实有 1.5 和 2.1，差别极小，不动 | | 一致 |
| y2024 | imagen | Imagen 2（2023-12-13，【TL】） | 没有这个家族的行 | 缺行，可选 |
| y2025 | 全部 | 一致（elevenlabs：Turbo v2.5 与 Multilingual v2 打平） | | 一致 |
| y2026 | flux | FLUX.2 [pro]/[max]/[flex] | FLUX.2 [dev] | 不一致 |
| y2026 | seedream | Seedream 4.5 | 4.0 | 不一致 |
| y2026 | cartesia | Sonic 3 | Sonic（2024-05） | 不一致 |
| y2026 | stable_audio | Stable Audio 2.5 | 2.0 | 不一致 |
| y2026 | mureka | V7.6/O2（2025-12-09，强弱待核实）；V8 要到 01-28 才出 | O1 | 不一致 |
| y2026 | minimax_speech | Speech 2.6 | Speech 2.8（01-23 才发） | 按月判断造成的错位 |
| y2026 | cosyvoice | Qwen3-TTS-Flash（2025-09）等 | Qwen3-TTS（01-22 才发） | 同上 |
| y2026 | seed_tts | Seed-TTS 2.0 | Seed-TTS | 缺行，待核实 |
| y2026 | image2、midjourney（V7）、imagen（Nano Banana Pro）、suno（v5）、elevenlabs（v3）、lyria（Lyria 2）、udio、eleven_music、openai_tts（gpt-4o-mini-tts）、gemini_tts、ideogram、qwen_image、hunyuan_image | 与游戏一致 | | 一致 |

关于按月判断的错位：游戏现在按“月份 ≤ 开局月”取旗舰，所以 2026-01 当月下旬才发的模型会被当成开局已在线。D2 改成按日后，这些会自动变成“下个月要发的”。但那时 Speech 2.6 必须在库里，否则 minimax_speech 开局会退回到 2025 年的 Speech-02。

## 3. 修订清单

新增行格式同 RAW：`[家族, 月份, 型号, 量级, 开源, dims, 定价档]`。

### A. 现有行排序错了（必改）

**A1. Nano Banana 的“指令遵循”90 改 92**
- dims 从 `[86,90,70,90,84]` 改为 `[86,92,70,90,84]`，qOf 84.00 → 84.50。
- 理由：LMArena 当月文生图榜首是 Nano Banana，游戏里却与 Imagen 4 并列；familyBest 遇到平局会含糊（【LMA】）。
- 配套：D1 的 familyBest 同分时取日期晚的一款。

**A2. GPT-Realtime-2 降到不超过 gpt-4o-mini-tts**
- dims 从 `[88,15,86,87,86]` 改为 `[83,12,80,78,86]`，qOf 69.00 → 63.25，比 gpt-4o-mini-tts 低 1.0。
- 理由：见上表。
- 置信度：中。AA 上查不到 gpt-4o-mini-tts，两个榜口径还不一样。严格按 AA 字面读，它甚至该低于 2023 年的 OpenAI TTS（56.25），我只改到最小必要。待核实。

**A3. FLUX1.1 [pro] 的月份 2024-11 改 2024-10**
- 理由：发布日 2024-10-02（【BFL】、【TL】，AA 也记 Oct 2024）。
- 顺带确认：RAW 里新增的 FLUX.1 [pro] 要排在 FLUX.1 [dev] 之后。

### B. 缺行，旗舰过期且差距大

```js
['flux',         '2025-11', 'FLUX.2 [pro]',            'large', 0, [90, 88, 80, 92, 64], 'standard'], // 87.50，排在 [dev] 之后
['flux',         '2026-10', 'FLUX 3 Image',            'large', 0, [91, 91, 86, 92, 66], 'standard'], // 90.00
['seedream',     '2025-12', 'Seedream 4.5',            'large', 0, [90, 91, 85, 91, 80], 'budget'],   // 89.25
['qwen_image',   '2026-07', 'Qwen-Image-3.0',          'large', 0, [90, 92, 93, 91, 78], 'budget'],   // 91.50
['hunyuan_image','2026-01', 'HunyuanImage 3.0 Instruct','large',1, [86, 87, 80, 87, 78], 'budget'],   // 85.00
['mureka',       '2026-01', 'Mureka V8',               'mid',   0, [88, 86, 80, 78, 55], 'budget'],   // 83.00
['mureka',       '2026-04', 'Mureka V9',               'mid',   0, [89, 87, 81, 81, 58], 'budget'],   // 84.50
['mureka',       '2026-08', 'Mureka V9.5',             'mid',   0, [90, 88, 82, 80, 60], 'budget'],   // 85.00
['lyria',        '2026-03', 'Lyria 3 Pro',             'large', 0, [86, 80, 74, 89, 82], 'standard'], // 82.25
['stable_audio', '2025-09', 'Stable Audio 2.5',        'mid',   0, [66,  8,  8, 72, 72], 'budget'],   // 38.50
['stable_audio', '2026-05', 'Stable Audio 3 Large',    'mid',   0, [72,  8,  8, 80, 76], 'budget'],   // 42.00
['cartesia',     '2025-10', 'Sonic 3',                 'mid',   0, [84, 80, 82, 72, 60], 'standard'], // 79.50
['cartesia',     '2026-05', 'Sonic 3.5',               'mid',   0, [90, 85, 88, 86, 62], 'standard'], // 87.25
['cartesia',     '2026-08', 'Sonic 3.6',               'mid',   0, [92, 87, 90, 87, 64], 'standard'], // 89.00
['gemini_tts',   '2026-09', 'Gemini 3.8 Flash TTS',    'large', 0, [92, 75, 90, 90, 85], 'standard'], // 86.75
['cosyvoice',    '2026-09', 'Qwen-Audio-3.1-TTS-Plus', 'mid',   0, [91, 85, 90, 86, 60], 'budget'],   // 88.00
```

**逐项出处和说明**

- **FLUX.2 [pro]、FLUX 3 Image**：出处见上面表格。Klein 不加。它比 FLUX 3 Image 小也弱，旧 latestRelease 会把它当最新一款选中，成了陷阱。
- **Seedream 4.5**：AA 图 1026，LUM 里高于 4.0（1260 对 1244）；发布 2025-12-03（https://www.hedra.com/models/image/bytedance/seedream-45 ）。
- **Qwen-Image-3.0**：2026-07-21，闭源，没公布参数、基准和权重（https://unite.ai/alibaba-launches-qwen-image-3-0-without-benchmarks-or-weights ）；量级暂写 large，待核实。
- **HunyuanImage 3.0 Instruct**：Hugging Face 说明页写 2026-01-26，托管商页写 01-28，日期有 2 天出入；AA 987 对 932。
- **Mureka**
  - 发布时间：V8 消费端 2026-01-28（仅新闻报道），API 2026-03-02；V9 API 官方更新日志 2026-04-09；V9.5 有 08-18（昆仑万维国内稿）和 08-31（GlobeNewswire）两个日期，Pandaily 报道为 7 月，待核实。出处 https://invideo.io/blog/mureka-ai-music-generator/ 、https://www.creativeainews.com/blog/mureka-v9-5-ai-music-model-vocals-2026/ 。
  - 为什么不让 V8 压过 Suno v5：Mureka 不是 pusher，D4 要求它 ≤ 同期 SOTA − 1.0。所以 V8 只能到 83.00（Suno v5 是 84.00），V9 和 V9.5 压在 Suno v5.5（86.00）下面一点。真实里 V8/V9 的人声分高于 Suno v5，这点只能保持“接近”。
  - 想完全还原的办法：把 mureka 加进音乐 pusher 名单，这是改规格，先不做。
  - Mureka O1 日期：游戏记 2025-03，项目 timeline 只有 API 日 2025-07-29。我记得 O1 是 2025-03 发布的，没找到来源，待核实。
- **Lyria 3 Pro**：2026-03-25，3 分钟，Lyria 3 只有 30 秒（https://chromeunboxed.com/googles-lyria-3-pro-brings-full-length-ai-music-generation-to-gemini/ ）。Lyria 3 与 3 Pro 没有直接对比数据，Pro 更强是依据功能判断，待核实。
- **Stable Audio**
  - 2.5：2025-09-10（https://stability.ai/news/stability-ai-introduces-stable-audio-25-the-first-audio-model-built-for-enterprise-sound-production-at-scale ）。
  - 3 Large：2026-05-20，Large 仅 API，Medium/Small 开源（https://the-decoder.com/stability-ai-launches-stable-audio-3-0-with-up-to-six-minute-tracks-and-open-weights/ ）。
  - 这是纯器乐模型，人声和歌词两维保持 8。
- **Cartesia**：Sonic 3 是 2025-10；3.5 约 2026-05（AA 标 May 2026，官方日期没找到）；3.6 是 2026-08-27（https://magica.com/news/cartesia-sonic-3-6-text-to-speech ）。游戏里 3.6 为 89.00，低于 Eleven v3 正式版的 89.50，这是为了不动 SOTA，真实榜上它更高。
- **Gemini 3.8 Flash TTS**：2026-09-23，支持用 30 秒样本复刻声音，所以音色克隆一维从 40 提到 75。
- **Qwen-Audio-3.1-TTS-Plus**
  - AA 排第 3，1298，闭源。我没搜到它的官方发布稿，只在 AA 上看到 3.0 和 3.1；3.0 的第三方日期是 2026-07-01 或 07-14，AA 都标 Sept 2026，所以月份和名字待核实。
  - 跟随者上限：它不是 pusher，只能到同期 SOTA − 1.5，也就是 88.00。

### C. 可选（强弱依据弱，或影响小）

```js
['seed_tts',       '2025-10', 'Seed-TTS 2.0', 'mid',   0, [90, 87, 72, 84, 70], 'budget'],   // 83.25，无第三方评测，待核实
['minimax_speech', '2025-10', 'Speech 2.6',   'mid',   0, [89, 86, 86, 84, 61], 'budget'],   // 86.25，补中间一代；D2 按日后 y2026 开局需要它
['imagen',         '2023-12', 'Imagen 2',     'large', 0, [76, 66, 35, 76, 82], 'standard'], // 63.25，补 y2024 开局空档
['qwen_image',     '2026-09', 'Qwen-Image-2.1','mid',  1, [89, 91, 92, 90, 78], 'budget'],   // 90.50，7B 开源，研究许可
```

- Qwen-Image-2.1 要加的话，tags 必须带 S，否则旧 latestRelease 会选中它这个比 3.0 弱的新款。
- 另一个小项：Qwen-Image-2.0 是 7B，却标了 large（来源 Puter 和 lilting.ch 页面，待核实）。如果核实，量级 large 应改 mid。这正是“新出的小一号反而更强”的例子：7B 的 2.0 比 20B 的初代强（AA 990 对 903）。

### D. 复核结果

- 用 sota_check 的同一套逻辑复核：A 和 B（含 C）全部套上后，违规仍只有 Bark 那 1 条（规格已知）。
- 新增接近线（差值在 −2 以内）：Mureka V8 −1.00、V9 −1.50、V9.5 −1.00，Qwen-Audio-3.1 −1.50，都没越线。
- 音乐、语音的 SOTA 持有者序列完全不变。图像序列只变了一处：FLUX1.1 [pro] 的日期从 11 月前移到 10-02，持有者没变。

### E. 对 D1 的两条提醒

1. **familyBest 同分时取日期晚的。**
2. **要用 S 标签挡住“新出但更弱”的款。**
   - 旧的 latestRelease 取的是行序最后一行。
   - onSale 要跳过 S 标签。
   - 已知会踩的：Qwen-Image-2.1、FLUX 3 Image Klein、Gemini 3.8 Flash-Lite TTS。

## 4. 额外发现（跨家族，没放进修订清单，你自己定）

- 真实语音榜上，Gemini 3.1 Flash TTS（1212）高于 Eleven v3 正式版（1181）。Sonic 3.6（1290）和 Qwen-Audio-3.1（1298）在 2026-08 到 09 月也超过 v3，直到 Eleven v4（1328）。游戏里这三家都排在 ElevenLabs 之后。
- Qwen3-TTS 在游戏里 84.25，但 AA 上只有 930，低于 2023 年的 OpenAI TTS-1 HD（1102）。
- 音乐的 Q 公式让纯器乐模型天然吃亏：Stable Audio 3 Large 的 AA 器乐分（1014）约等于 Eleven Music（1021），游戏里分别是 42.00 和 74.50。

## 5. 一句话总结

这 23 个家族里，现有行排序错的只有 Nano Banana 平局和 GPT-Realtime-2 偏高两处，其余的问题基本都是缺了真实最强的那一款（Mureka、Cartesia、FLUX、Stable Audio 最严重），补上 B 组 16 行并改 A 组三处后，旗舰就等于真实最强，且不破坏“跟随者不超过同期 SOTA”。

临时文件已删，项目目录未改动。

---

# 核对

# audit-media 核对结果（核对日 2026-10-21）

**怎么核的**：查了约 35 处（要求至少 8 处），涵盖跑分、发布日期、参数和开源状态、吞吐类数据。这批调研里没有论文公式和吞吐数据，所以没有可核的。Artificial Analysis（下称 AA）和 benchmarklist 的页面是用网页读取工具转述的，我对关键数字用第二个来源或重读做了互相印证。游戏数据修订类条目用 qOf 全部复算过。临时文件已删，项目目录没动。

## 一、核对表

### 图像

| 条目 | 原文 | 核实结果 | 出处 | 有误？ |
|---|---|---|---|---|
| FLUX.2 四款 AA 分 | flex 1026 / max 1021 / pro 1003 / dev 1000 | 一致。但 [max] 发布是 2025-12-16，不是 11 月（调研把三款都记成 11 月，没加 [max] 行，所以不影响） | [AA 图像榜](https://artificialanalysis.ai/image/leaderboard/text-to-image)、[BFL 更新日志](https://docs.bfl.ml/release-notes) | 小误 |
| FLUX.2 的 LUM 分 | pro 1264 / max=flex 1252 / dev 1246 | 一致（快照 2026-10-11） | [Lumenfall](https://lumenfall.ai/arena/text-to-image) | 无 |
| FLUX 3 Image | 2026-10-01，AA 1117，约第 13，仅 API | 日期、分数、名次一致。BFL 页面没明写“仅 API”，只写了开源小号 Klein 5.6B（10-15）有开放权重 | AA 图像榜、BFL 更新日志、[Klein 发布稿](https://bfl.ai/blog/flux-3-image-klein) | 基本无 |
| FLUX1.1 [pro] 日期 | 2024-10-02，出处 BFL | 日期对：Gigazine、Simon Willison 都记 10-02/03，AA 也记 Oct 2024（870，高于 [dev] 的 823）。但 BFL 更新日志页里没有这个日期，引用要换 | [Gigazine](https://gigazine.net/gsc_news/en/20241004-flux-1-1-pro)、[Simon Willison](https://simonwillison.net/2024/Oct/3/flux11-pro)、AA 图像榜 | 日期对，出处要换 |
| FLUX.1 [dev] AA 分 | 823 | 一致 | AA 图像榜 | 无 |
| Seedream 4.5 | 2025-12-03；AA 1026；LUM 1260 高于 4.0 的 1244 | 全部一致。5.0 Lite 的 AA 1017、LUM 1232 也一致 | [Hedra](https://www.hedra.com/models/image/bytedance/seedream-45)、AA、Lumenfall | 无 |
| Qwen-Image-3.0 | 2026-07-21，闭源，AA 1070，3.0-Pro 1095，2.0 是 990 | 一致。发布稿未公布参数，所以“large”确是猜的。**但漏了 Qwen Image 2.0 Pro**（AA 1030，2026-04-22，报道称它是 3.0 之前的旗舰） | [Unite.ai](https://unite.ai/alibaba-launches-qwen-image-3-0-without-benchmarks-or-weights)、AA | 有遗漏 |
| Qwen-Image-2.1 | 2026-09-20，7B 开源，研究许可，AA 1042 | 一致（日期和许可来自二手报道，AA 分来自 AA 页） | [AI Indigo](https://aiindigo.com/blog/ai-arena-qwen-image-2-1-release)、AA | 无 |
| Qwen-Image-2.0 是 7B | 7B，来源待核实 | 仍有争议：有来源说“8B 编码器加 7B 解码器，总量约 15B”，有来源说“7B 对初代 20B”。发布日 2026-02-10 对 | [Webkul](https://webkul.com/blog/qwen-image-2/) 等 | 待核实 |
| HunyuanImage 3.0 Instruct | AA 987 对 932；HF 01-26，托管商 01-28 | AA 分一致。01-28 有两个页面支持，HF 的 01-26 本次没重查。参数约 80B MoE，激活约 13B | AA、[immers.cloud](https://en.immers.cloud/ai/tencent/HunyuanImage-3.0-Instruct/) | 无 |
| Ideogram | 4.0 Quality 1026，4.5 High 1015 | 一致 | AA 图像榜 | 无 |
| Nano Banana 压过 Imagen 4 | LMArena 文生图榜首，压过 Imagen 4 | **只部分成立**。LMArena 博客（2025-08-27）只说它会登顶，没提 Imagen 4。arena.ai 2026-07-10 快照（搜索结果转述）：Nano Banana 约 1151，Imagen Ultra 4.0 约 1148（误差内持平），普通 Imagen 4 约 1129。AA 旧榜（2025-10，法文博客转述）里 Imagen 4 Ultra 1170 反而高于 Nano Banana 1165 | [LMArena 博客](https://arena.ai/blog/nano-banana)、[arena.ai 榜](https://arena.ai/leaderboard/text-to-image/overall)、[blogdumoderateur](https://www.blogdumoderateur.com/ia-10-generateurs-images-performants-octobre-2025/) | 结论偏强 |
| Midjourney V8 | 游戏记 2026-03 | 官方文档：V8.0 Alpha 于 2026-03-17 上线 | [Midjourney 文档](https://docs.midjourney.com/docs/models) | 无 |
| Imagen 2 | 2023-12-13 | 一致 | [Google Cloud 博客](https://cloud.google.com/blog/products/ai-machine-learning/imagen-2-on-vertex-ai-is-now-generally-available) | 无 |

### 音乐

| 条目 | 原文 | 核实结果 | 出处 | 有误？ |
|---|---|---|---|---|
| AA 人声榜 v1.1 | Mureka V9.5 1107，Lyria 3.5 1052 | 一致。同榜 Suno v6 1146 排第 1，调研没提；Eleven v2.5 1012 对 v2 999 一致 | [AA 人声](https://artificialanalysis.ai/music/leaderboard/vocals) | 无 |
| AA 器乐榜 v1.1 | 3 Large 1014 > 2.5 984；Lyria 3 Pro 1080 对 3.5 1078；Eleven v2 1011 对 v2.5 1001 | 全部一致。Eleven Music（不带版本）1021，也一致 | [AA 器乐](https://artificialanalysis.ai/music/leaderboard/instrumental) | 无 |
| 旧版 AA 榜（v1.0，2026-09-02） | 人声 V9 1159、V8 1140、Suno v5 1097、Lyria 3 Pro 1082；Stable Audio 2.0 为 959 | 数字全部一致。**但同一页 Suno v5.5 是 1170，高于 V9 的 1159**，调研只拿 v5 比，有点挑数。器乐里 V9 1177、V8 1166、Suno v5 1160 | [benchmarklist 人声](https://benchmarklist.com/arenas/artificial_analysis_music_vocals/)、[器乐](https://benchmarklist.com/arenas/artificial_analysis_music_instrumental/) | 轻微挑数 |
| Mureka O1 日期 | 游戏记 2025-03，“没找到来源” | 已找到：2025-03-26 发布（与 V6 同日），游戏写对了 | [Technode](https://technode.global/?p=96998) | 无，可去掉“待核实” |
| Mureka V8 日期 | 2026-01-28 | 一致 | [东方财富](https://finance.eastmoney.com/a/202601283633999892.html) | 无 |
| Mureka V9 日期 | API 官方更新日志 2026-04-09 | 只有一处二手指南引用该更新日志；另有一篇评测说消费端 03-27 发布。2026-04-24 的公司公告还在引 V8 的 AA 成绩，所以 V9 日期证据偏弱，但月份在 03 到 04 之间 | [glbgpt](https://www.glbgpt.com/hub/mureka-ai-review) 等 | 待核实 |
| Mureka V9.5 日期 | 08-18、08-31 两个日期，Pandaily 为 7 月 | 都对：2026-07-19 世界人工智能大会首次宣布（同时预告 O3），08-18 国内放量，08-31 美国新闻稿。调研写“Pandaily 7 月”是对的 | [Pandaily](https://news.pedaily.cn/20260721/134627.shtml)、[东方财富](https://wap.eastmoney.com/a/202608183844385437.html)、[Variety](https://variety.com/2026/shopping/news/ai-music-generator-mureka-v9-5-o3-models-launch-details-1236839140/) | 无 |
| Mureka V7.6 / O2 日期 | 2025-12-09 | 日期有出入：AIbase 报道日期是 2025-11-28 | [AIbase](https://www.aibase.com/zh/news/23195) | 待核实 |
| Lyria 3 Pro | 2026-03-25，3 分钟；Lyria 3 只有 30 秒 | 一致 | [Chrome Unboxed](https://chromeunboxed.com/googles-lyria-3-pro-brings-full-length-ai-music-generation-to-gemini/) | 无 |
| Stable Audio 2.5 | 2025-09-10 | 页面写 Sep 10（没显示年份），与 2025 年相符 | [Stability 新闻](http://stability.ai/news-updates/stability-ai-introduces-stable-audio-25-the-first-audio-model-built-for-enterprise-sound-production-at-scale) | 无 |
| Stable Audio 3 | 2026-05-20，Large 2.7B 仅 API，Medium/Small 开源；纯器乐 | 日期、参数、开闭状态全对。“纯器乐”页面没写，本次没证实 | [The Decoder](https://the-decoder.com/stability-ai-launches-stable-audio-3-0-with-up-to-six-minute-tracks-and-open-weights/) | “纯器乐”待核实 |
| Eleven Music v2.5 | 2026-09-11 | 一致 | [Digg 转述](https://digg.com/tech/a31f6072-8cde-4020-b911-cfde901ddb6b) | 无 |

### 语音

| 条目 | 原文 | 核实结果 | 出处 | 有误？ |
|---|---|---|---|---|
| AA 语音榜主要数字 | Eleven v4 1328 / v4 Turbo 1330；Eleven v3 1181；Qwen-Audio-3.1 1298 / 3.0 1264；Sonic 3.6 1290；Gemini 3.8 Flash 1279 / 3.1 Flash 1212；Gemini 2.5 Flash 1062 > 2.5 Pro 1038；Speech 2.8 HD 1174 / 2.6 HD 1129 / 02-HD 1111；GPT-Realtime-2 1076 / TTS-1 HD 1102；Qwen3 TTS 930；Turbo v2.5 1098 / Multilingual v2 1096 | **全部一致** | [AA 语音榜](https://artificialanalysis.ai/text-to-speech/leaderboard) | 无 |
| Qwen-Audio-3.1 | AA 1298，闭源；名字和月份待核实 | AA 模型页确有该模型（1297.84）。3.1 于 2026-09-22 云栖大会发布的报道也对得上 9 月。官方发布稿仍没找到 | [AA 模型页](https://artificialanalysis.ai/text-to-speech/models/qwen-audio-3-1-tts-plus)、[AlphaSignal](https://alphasignal.ai/news/alibaba-s-qwen-audio-3-1-slashes-voice-api-prices-by-up-to-95) | 基本核实 |
| Qwen-Audio-3.0 日期 | 第三方日期 07-01 或 07-14 | **不对**。The Decoder 稿件日期是 2026-07-21（当时 AA 1236，登顶，高于 Gemini 3.1 Flash 的 1214 和 Sonic 3.5 的 1207）；另一来源写 07-20。AA 现在把它标成 Sept 2026，是后来分数更新 | [The Decoder](https://the-decoder.com/alibabas-qwen-audio-3-0-tts-plus-tops-the-competition-in-the-text-to-speech-rankings/) | 有误 |
| Qwen3-TTS | 游戏 2026-01-22 | 对：2026-01-22 开源，0.6B 和 1.7B。Qwen3-TTS-Flash（2025-09）本次只确认“与 Qwen3-Omni 同日、仅 API”，具体日期没直接搜到 | [ComfyUI Wiki](https://comfyui-wiki.com/en/news/2026-01-22-alibaba-qwen3-tts-release) | 无 |
| Cartesia Sonic | Sonic 3（2025-10）、3.5（2026-05）、3.6（08-27，AA 1290） | AA 标 Sonic 3 Oct 2025（1056）、3.5 May 2026（1191）、3.6 Aug 2026，一致。08-27 是正式可用日，8 月中旬已有 API 预览 | [Magica](https://magica.com/news/cartesia-sonic-3-6-text-to-speech)、AA | 无 |
| Gemini 3.8 Flash TTS | 2026-09-23；支持 30 秒样本复刻 | 日期对，API 名 gemini-3.8-flash-tts。“30 秒样本”页面没写，只说 AI Studio 有自定义声音和声音复刻 | [LetsDataScience](https://letsdatascience.com/news/google-launches-gemini-38-text-to-speech-models-cee3c0a7) | “30 秒”待核实 |
| MiniMax Speech 2.8 | 01-23 | 对 | [Gradually AI](https://www.gradually.ai/en/ai-models/minimax-speech-2-8/) | 无 |
| OpenAI 没有新 TTS | GPT-Realtime-2（05-07）是语音到语音，OpenAI 没配新 TTS | 一致。同日三款是 Realtime-2、Realtime-Translate、Realtime-Whisper，LangWatch 文档（2026-06）仍把 gpt-4o-mini-tts 当现役 TTS。AA 榜前十里的 “Realtime TTS-2” 是 Inworld 的，不是 OpenAI 的 | [The Next Web](https://thenextweb.com/news/openai-gpt-realtime-2-voice-models)、[Inworld](https://inworld.ai/realtime-tts-2) | 无 |
| TTS Arena 分数 | gpt-4o-mini-tts 1593，tts-1-hd 1527 | **数字对不上**。重读两次逐行引用，快照 2026-09-02：mini-tts 1542（第 3），TTS-1 1505，TTS-1-HD 1463。先后顺序不变 | [benchmarklist](https://benchmarklist.com/benchmarks/speech_arena/) | 有误（数字） |
| AA 上有没有 gpt-4o-mini-tts | “查不到” | AA 有它的模型页，但没有可读的 Elo（页面说可能是投票不足），榜上也没列。结论没错，表述改成“没有可读 Elo” | [AA 模型页](https://artificialanalysis.ai/text-to-speech/models/gpt-4o-mini-tts) | 表述不准 |
| Seed-TTS 2.0 | 2025-10-16，无第三方评测 | 日期对；AA 榜上没有它；文章只有厂商自称 | [PingWest](https://www.pingwest.com/w/308310) | 无 |

## 二、游戏数据修订：用 qOf 复算

用项目自己的 `rivals.js`（套上 D3 的 fixes 和 adds）加调研的 A、B、C 三组改动，权重取 D1 的固定权重。日期按月中、月初、月末三种取法各跑一遍。

1. **新值全部复算对。** A1 的 Nano Banana 84.00 变 84.50，A2 的 GPT-Realtime-2 69.00 变 63.25（比 gpt-4o-mini-tts 的 64.25 低 1.00）。B 组 16 行和 C 组 4 行的 qOf 与调研标注逐个相同，一个不差。
2. **违规检查**（跟随者须 ≤ 同期 SOTA − 1.0，规格里 FOLLOW_GAP 就是 1.0）：改完后仍只有 Bark 一条（规格已知）。三种取日期法结果相同。
3. **逼近线数字对得上：** Mureka V8 −1.00、V9 −1.50、V9.5 −1.00，Qwen-Audio-3.1 −1.50，都没越线。V8 和 V9.5 刚好等于 −1.00，规格写的是“≤”，所以通过。
4. **SOTA 持有者序列：** 音乐和语音完全不变。图像只有 FLUX1.1 [pro] 的日期从 2024-11 前移到 2024-10，持有者不变，与调研说法一致。
5. **同分检查：** 家族内没有新出现的最高分并列（A1 之后 Nano Banana 不再和 Imagen 4 并列）。
6. **各家族旗舰（修订后 2026-10-21）：**
   - 图像和音乐：FLUX 3 Image 90.00、Qwen-Image-3.0 91.50、HunyuanImage 3.0 Instruct 85.00、Mureka V9.5 85.00、Stable Audio 3 Large 42.00。
   - 语音：Sonic 3.6 89.00、Gemini 3.8 Flash TTS 86.75、Qwen-Audio-3.1 88.00、gpt-4o-mini-tts 64.25。
   - 与调研所说“真实最强”一致。
7. **2026-01-01 开局旗舰：**
   - 变化的有：FLUX.2 [pro]、Seedream 4.5、Stable Audio 2.5、Sonic 3，另有两项来自 C 组，Speech 2.6 和 Seed-TTS 2.0。
   - **没变的有：** mureka 仍是 O1（71.25），cosyvoice 仍是 CosyVoice 2（79.00）。

## 三、需要更正的地方和更正后的值

1. **TTS Arena 数字**：1593 / 1527 改成 **1542 / 1463**（benchmarklist，快照 2026-09-02）。结论不变，A2 仍成立，置信度仍是中等。
2. **Qwen-Audio-3.0-TTS-Plus 日期**：改成 **2026-07-20 或 07-21**。
   - 所以 2026-07 到 08 月 cosyvoice 的真实旗舰是它，不是 Qwen3-TTS。调研漏了这一行。
   - 建议可选补一行（我给的数值，未经基准验证），当月 SOTA 是 89.5，上限 88.5，夹在 84.25 和 88.00 之间：
   ```js
   ['cosyvoice','2026-07','Qwen-Audio-3.0-TTS-Plus','mid',0,[89,84,88,85,60],'budget'], // 86.50
   ```
3. **漏了 Qwen Image 2.0 Pro**（AA 1030，2026-04-22，AA 页面自己标的发布日期）。2026-04 到 06 月 qwen_image 的真实旗舰是它。建议可选补一行（我给的数值），夹在 2.0 的 89.25 和 3.0 的 91.50 之间：
   ```js
   ['qwen_image','2026-04','Qwen-Image-2.0 Pro','large',0,[89,91,92,89,78],'budget'], // 90.25
   ```
4. **A1（Nano Banana 90 改 92）依据偏弱。**
   - 各榜单对 Nano Banana 和 Imagen 4 谁高，说法不一，改动只有 +0.5。
   - 调研自己写的 E.1（familyBest 同分取日期晚的）已经能选中 Nano Banana，A1 其实多余。
   - 要么删掉 A1，要么保留但标“低置信”。
5. **A3 的引用换掉**：FLUX1.1 [pro] 的 2024-10-02 改引 Gigazine、Simon Willison，或 AA 的 Oct 2024（BFL 更新日志里没有这个日期）。日期本身是对的。
6. **Mureka O1 日期**：去掉“待核实”，确认 2025-03-26。
7. **Mureka V9.5 的月份**：公开首发是 07-19（世界人工智能大会），放量是 08-18。写 2026-07 或 2026-08 都能找到出处，对违规检查没有影响（这段时间 SOTA 都是 Suno v5.5 的 86.00）。
8. **Mureka V7.6 / O2 日期**：AIbase 报道是 2025-11-28，不是 12-09，继续待核实。
9. **“Gemini 3.8 Flash TTS 支持 30 秒样本复刻”**：本次没找到出处，克隆维度 40 到 75 的理由待核实。
10. **“Stable Audio 是纯器乐”**：本次没证实，人声和歌词两维保持 8 的依据待核实。
11. **“AA 上查不到 gpt-4o-mini-tts”**：改成“AA 有页面但没有可读 Elo”。
12. **FLUX.2 [max] 日期**：是 2025-12-16，不是 11 月。
13. **“补上 B 组后旗舰就等于真实最强”说得太满。**
    - 复算显示 2026 年初 mureka 仍是 O1，而真实应是 V7.5、V7.6 或 O2（2025 年 7 到 11 月）。
    - cosyvoice 仍是 CosyVoice 2，而真实应是闭源的 Qwen3-TTS-Flash（2025-09），它没有评分数据，补不了。
    - 再加上第 2、3 条两个空档。

## 四、调研没提、值得知道的

- **跨家族次序有一处反了。** AA 上 FLUX 3 Image 1117 > Seedream 5.0 Pro 1100 > Qwen-Image-3.0 1070，而调研给的游戏值是 90.00 < 92.00（Seedream 5.0 Pro，游戏里已有）和 91.50。
  - 这不影响“家族内旗舰”，是可选微调。
  - 要保持次序，FLUX 3 Image 需要 ≥ 92.25。FLUX 是 pusher，不受跟随者上限约束，同期 SOTA 是 GPT Image 2.5（95.75）。
- **Sonic 和 Gemini TTS 其实不必压低。**
  - 它们都在 pusher 名单里，调研说压到 89.00 是“为了不动 SOTA”，那是取舍，不是规格要求。
  - 只有 cosyvoice 和 mureka 这类跟随者才必须压。
- **AA 语音榜上的其他厂家**：Gemini 3.8 Flash-Lite TTS 1251，比 Flash 弱，调研已列入 S 标签陷阱，这条对。Fish Audio、Simba、Inworld 不在这 23 个家族里。

## 五、整体可信度评价

**高。大约 8 分（满分 10）。**

- 抽查的 AA 分数、LUM 分数、benchmarklist 旧榜分数、发布日期，绝大多数逐个对得上。
- 所有 qOf 复算无误，违规检查和 SOTA 序列的结论可以直接采信。
- 主要问题有四类：
  - TTS Arena 分数写错，但结论没变。
  - Qwen-Audio-3.0 日期写错，并漏了 Qwen Image 2.0 Pro 和这个 3.0 Plus 两个真实旗舰。
  - A1 的依据偏弱，其实多余。
  - 几处“待核实”的细节（Mureka V7.6 日期、Qwen-Image-2.0 参数量、30 秒克隆、纯器乐）仍待核实，已标出。
- 调研自己标了“待核实”的地方（A2 置信度中、Qwen-Image-3.0 量级、Mureka 日期）都很诚实，没有发现隐瞒或编造。

**建议**：照调研的 A（A1 可删）和 B 组落库，再按上面第 2、3 条补两行，剩下的待核实项保持标注。

文件：未改动任何项目文件。参考过的项目文件有 `/Users/mac/model-raising-plan/docs/spec/v1.0-spec.md`、`/Users/mac/model-raising-plan/docs/spec/tools/sota_check.mjs`、`/Users/mac/model-raising-plan/src/career/data/rivals.js`。