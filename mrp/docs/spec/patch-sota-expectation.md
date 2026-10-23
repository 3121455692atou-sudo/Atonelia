**改了什么（本轮）**：两位检查员的必改项全部修掉，合理的应改项也都改了。①自家史线只给炼出过 SOTA 的公司用；不领先时，最多算到对手最强 +1。新手第一次冲顶不再被白白抵消。②冠军期待过期后进入“前冠军”档，同一款发布不会从挨罚跳成重奖。③补上没有对手时的规则：临时锚、推迟判定、空值约定。④“能干活”改按一年前同量级的水平，并用小模型上限封顶；“开源最强”也要求模型没被污染。⑤60 天内的发布，结果比上次好就加评。⑥授名改用 `sotaWouldTake`，发布前就能判。⑦场地凑满时挂上的标签，要领先 3 分或挡住一次挑战才算“炼出”；○ 改为部分储备；自家新旗舰接标签不需要高 0.1。⑧蒸馏系数的位置、工作包依赖、存档迁移、F4 分桶一并修正。附录全部重跑，新增三张表：真实机器人冲顶力、期待分布、“能干活”门槛。

# 规格修订稿：SOTA 标签、难度曲线、炼出 SOTA、市场期待

本稿直接并入 `/Users/mac/model-raising-plan/docs/spec/v1.0-spec.md`。每处改动都写明「替换」或「新增」，后面跟完整的新文本。项目文件没有改动。

**并入须知**：为了能单独渲染，下文插入或替换的表格行都自带一行 `|---|` 分隔线。并入已有表格时只插数据行，把这行分隔线去掉。

**写法依据**
- 骨架用 curve 方案：
  - 难度锚点不含玩家快照，这是防棘轮的关键；
  - 冲顶力由四样相乘得出；
  - 蒸馏那一份一律在 qCapD 前收口；
  - 一个模态里有发布的公司不到 2 家时，不挂标签。
- 从 integrate 方案移植：单维护栏、新底座出生护栏、`g_sota` 自动完成并由 `ms_first_sota` 庆祝、存档迁移、测试清单、F3 接口写法。
- 从 market 方案移植：
  - 冠军期待会过期；
  - 挑战者的容差按公司档位分；
  - “比上次追近 2 分也算符合预期”；
  - “能干活”看主业两维；
  - 融资回报做成单独的经营事件；
  - 发布面板上有期待预告；
  - 用真实发布做测试夹具。
- 删掉的东西：放话档、闭关冲刺、`fundOdds`、`budget`、董事会宽限期改动、董事会问询、冠军档的董事会文案改动。

**数值模拟**
- 脚本目录：`/private/tmp/claude-501/-Users-mac-Documents/bdd54aa1-c186-4792-85a8-72ab1d964b53/scratchpad/sota2/final/`
- 运行方式：`node run.mjs`（约 3 秒）、`node expect.mjs`（约 2 秒）、`node botA.mjs`（约 2 秒，只读调用真实引擎和机器人）。
- 结果见附录 A。

**第一轮评审必改项的处理**（本轮有更新的已注明）

| 必改项 | 处理 | 位置 |
|---|---|---|
| 期待档要按事实分，不能看节点做没做完 | 冠军档读 `sotaMade(s)`；`g_sota` 自动完成，而且新增 `auto` 字段，不能手动开始 | D11.1、A2、A6 |
| GPT 自家线被隐藏，后训练会冻结 | 锚点加入“别家史实 − 1”和“自家史线”。**本轮**：自家史线只给炼出过的公司用，不领先时最多算到对手最强 +1 | D6.2、附录表 7 |
| 一个维度能把世界甩开很远 | 逐维 δ_k 加上 `DIM_SLACK`、`DIM_STEEP` | D6.2、附录表 4 |
| class_best 有 MoE 漏洞 | 删掉 class_best；“社区之选”按总参分量级 | D11.2 |
| 小公司的徽章靠蒸馏就能白拿 | 被污染的模型（含续训来的）拿不到任何徽章；社区之选要高出同尺寸蒸馏基线 1 分 | D11.2、D7 |
| workhorse 判定太松 | **本轮再改**：“能干活”改按一年前同量级的水平，并用小模型上限封顶 | D11.2、附录表 12 |
| “投资人上门”卡挤占发布弹窗预算 | 改为月结时检查的经营事件 `ev_hot_round` | D11.6 |
| 冠军的“不及预期”没有冷却 | 差 1 分以内只罚一半；惩罚 180 天内最多一次；**本轮**：540 天没持标转入“前冠军”档 | D11.4、D11.5 |
| 新底座出生绕过难度曲线 | 出生时钳到 `anchor − 1`；**本轮**：没有对手时按临时锚同样生效 | D6.5 |
| 垂直模态公司的冲顶力永远是 0 | 参照值按模态分成两张表。**本轮**：真实机器人仍是 0，原因是数据补不上，A10 新增补数据规则 | D6.2、A10、附录表 9 |
| 新手惩罚太弱 | 新手 ρ = 0.45；首次与再次拿标的耗时比为 1.66（玩家）、2.22（机器人） | D6.2、附录表 2 |
| “机器人几乎做不到”不能靠 resolveAll 的默认选项 | 明确的 `wantsDistill` 规则；**本轮**：只作用于带 `distill: true` 标记的选项 | A10 |
| 锚点含玩家快照会产生棘轮 | 锚点不含玩家；发布间隔 14、60、120 天，到 +3 都是 570 天 | D6、附录表 3 |
| 蒸馏那一份要锚在老师上 | `qCapD = min(老师, worldSota) − APPROACH` | D7 |
| 第一条发布白送标签 | **本轮再改**：场地凑满时挂上的标签，要领先 3 分或挡住一次挑战才算炼出 | D10.2 |

**本轮检查意见的处理**

| # | 意见 | 处理 | 位置 |
|---|---|---|---|
| 1 必改 | 自家史线抵消了“技术储备不足” | 自家史线 `ownHist` 只在 `sotaMade` 时计入。不领先时，最多算到 `worldSota + GHOST_CAP（1.0）`。“领先”包括“在练模型现在发布就能拿标”，免得玩家为保授名暂不发布就被卡住。重跑结果：Claude y2024 玩家全力，没炼出过的 0/20 拿标，炼出过的 20/20 | D6.2、D6.4、D9 6.9–6.10、附录表 6、表 7、自检 |
| 2 必改 | 冠军期待过期前后，结果从挨罚跳成重奖 | 新增“前冠军”档：超出仍须拿标，其余最多算平淡（倒退除外）。`histLast` 和 `lastHeldDay` 取持标区间的结束日。加 ±2 天测试 | D11.1、D11.4、D11.5、D10.3、D11.11 |
| 3 必改 | 没有可比对象时出现空值和 NaN | 本模态没有任何别家发布时，用临时锚 `tempAnchor`；`worldSota` 为空或场地不足时，判定推迟到第一次挂标签，推迟期间不罚；“能干活”找不到同量级发布时不发；所有数据读取写 `?? 0`；新增有限数测试。临时锚和检查员的建议（直接取 MusicGen 28.75）不同，取的是本模态截至当天的全部真实发布，含本公司和 S 副线。原因：否则 ElevenLabs y2023 全年卡在 56 分附近，而史实里它当年已经有 65–78 分 | D6.2、D11.3、D11.2、D7、D9 6.11–6.12 |
| 4 必改 | “能干活”门槛对小团队两头不对 | 门槛 = min(一年前同量级可见发布的最高分, `knowledgeCap(总参, 1.6) + KCAP_OFFSET`) − 2；同量级为空时不发。F4 加“每个小团队 × 剧本至少有一条可达的超出路径”和“平均每年超出 ≤ 1 次” | D11.2、F4、附录表 12 |
| 5 必改 | “开源最强”不看污染 | 加上“没被污染、底座不是续训来的”。被污染的模型拿不到任何徽章 | D11.2、D11.8、D11.11 |
| 6 必改 | 60 天规则漏掉 R1、o3 | 60 天内、同一底座的发布先试算：结果比上次好才加评，只升不降，上次的结果不撤回。R1 在 y2024 被加评为超出，在 y2025 是首评超出 | D11.3、D11.11、附录表 10 |
| 7 应改 | F4 的期待目标和史料、模拟两头对不上 | 目标改为“与史实夹具的 LLM 分布相差 ≤ 15 个百分点”。附录新增：真实机器人的冲顶力（表 9）、史实夹具（表 10）、机器人期待分布（表 11）。表 9 发现，★ 垂直模态机器人的自有数据补不上，F = 0，所以 A10 新增补数据规则 | F4、A10、附录 |
| 8 应改 | 场地凑满时白送的标签被算成“炼出过” | 凑满时领先别家（含 S 副线）≥ `FILL_LEAD = 3` 才算。不够的先只显示，挡住一款别家主线新发布后才算。F4 加“—·非 LLM”一行 | D10.2、D10.4、F4 |
| 9 应改 | ○ 当成完全中性 | ○ 加特质 `g_sota_kin`（`sotaEase −0.3`，ρ = 0.7）。MusicGen 那一枚只靠 Bark 副线凑满场地，后来又被换走，不算数，所以 Llama 改为 — | A4、A8、D10.4、附录表 8 |
| 10 应改 | 冠军自家小幅升级会挨罚 | 自家新旗舰只要 q ≥ 自家持标款，就接过标签，不需要高 0.1。冠军档“符合” = 发布后本公司持标，且 q ≥ 原持标款 − 0.1 | D10.2、D11.4 |
| 11 必改 | 授名条件 `sota:true` 在发布前没法判定 | 新增 `sotaWouldTake(s, q)`。ModelCond `sota` 在授名检查和预告里用它；场地不足时回退成 `lead:0`，没有可见对手时视为成立 | D1、D10.2、E2、F3 |
| 12 必改 | D9#10 和 D7 公式矛盾 | 把 `(1 + 0.1σ)` 移进蒸馏那一项，越线后自有那一份严格是 (1−σ) 倍；附录表 5 重跑 | D7、D9#10 |
| 13 应改 | 常量名对不上 | 统一写 `DISTILL_MIX.*`，D6.2 里注明 `SOTA.*`、`CURVE.*` | D6.2、D7 |
| 14 应改 | “不做放话”和 boldClaim 矛盾 | §0.3 改成“期待系统里不新增放话档”；boldClaim 改用 `gapOf`，列进 P1.1 的替换点 | 改动 3、D1、D11.7 |
| 15 应改 | 工作包的阶段依赖方向反了 | 按方案 ①：P0.3a 的存根定死期待接口；P2.2、P2.3 用构造数据测；P3.E 负责验收真实行为。F3 重写 | F2、F3 |
| 16 应改 | `judgeRelease` 签名、`s.expect` 初始化没写 | `initExpect()` 放在 P0.3a 存根里，开局和迁移都调用它；`judgeRelease(s, snap, lab)` | D10.3、D11.10、E8 |
| 17 应改 | 发布结果卡没有归属包 | 归 P3.U2，加入 `ui/bench.js`（只加“市场反应”一行）；“预告与判定一致”这条验收移到 P3.E | F2 |
| 18 应改 | P1.2 的测试读不到 ρ | `s.strategy` 不存在时，按 `sotaMade` 和 `seed` 回退；P2.2 登记这项指纹变更 | D6.2、F2 |
| 19 应改 | 存档迁移会补弹卡、重复完成节点 | milestones 步骤静默记 `ms_first_sota`；`g_sota` 没完成才 bypass；加三条迁移测试 | E8 |
| 20 应改 | 董事会文案和实际检查对不上 | 删掉这一条，董事会保持原样 | D11.7、F2 |
| 21 应改 | `distillBaseline` 的数据质量传不进去 | `previewDistill(s, cfg, { quality })`；新增 `EXPECT.BASE_QUALITY`；函数名统一为 `knowledgeCap` | D7 |
| 22 应改 | `g_sota` 拿标当天能被手动开始 | A2 新增 `auto` 字段；校验器禁止 omit `g_sota` | A2、A6 |
| 23 应改 | F4 分桶有歧义 | 按“播种档 × 模态 × tier”分桶；grok y2026 归“★·LLM·非 frontier”，image2 归“★·非 LLM” | F4 |
| 小问题 | 表头写错、标签链漏 GPT-3.5、Maverick 的 x、大额加分跳过越线成本、家数和格数、硬不变量、qCap 与 qCapD 混用、许可口径、histLast、A6 清单、createGame 顺序、resolveAll 范围、C3 括注、tags 措辞、已上市公司、表格分隔线 | 逐条照改 | 各处 |

---

## 改动 1：替换 §0.1 第 4 条，并在其后新增第 5 条

4. **天花板**：离当前最强越近，涨得越慢。想超过最强，算力、自有数据、技术积累和独门技术缺一不可。从没做出过最强模型的公司，最后几步特别难；做出过一次会轻松一些，但仍然不容易。靠蒸馏别人的模型追得最快，但只能无限接近老师和当时的最强，永远差一口气。
5. **市场期待**：每次发布旗舰，市场都会按公司的身份打一次分。
   - 正当红的冠军：大家等着新旗舰再拿第一。
   - 过气的前冠军：重回第一有惊喜，追得近就行。
   - 中间档的公司：追得近就算好。
   - 小团队：只要做出对开源社区有用的小模型，或者一个真能干活的模型，就算超出预期，可能会有投资人上门。

## 改动 2：§0.2 关键决定

**替换第 6 行：**

| 6 | Q 改用固定权重：知识、代码、数学、写作各 0.22，agent 0.12，不计安全，从开局起就这样算。对手发布按日可见。<br>**SOTA 是挂在模型上的标签（D10）**：<br>① 每个模态同一天只有一款；<br>② 只在主线发布之间争，包括对手不带 `S` 标签的发布和玩家已发布的旗舰；<br>③ 别家要比现任高出 0.1 才换手；自家新旗舰不低于自家现任就接过；<br>④ 这个模态里有发布的公司不到 2 家时不挂标签；<br>⑤ 场地凑满时挂上的那一枚，要领先 3 分或挡住一次挑战，才算“炼出过”。 |
|---|---|

**替换第 7 行：**

| 7 | **蒸馏上限**：<br>- 被污染的模型整体钳在 `qCap = min(最强老师 q, worldSota) − APPROACH`，每天只走剩余距离的一半，所以只会无限逼近。<br>- 没被污染但掺了蒸馏数据的模型，蒸馏那一份在 `qCapD`（按本类数据的老师算）前收口。<br>- “谱系污染”终身有效，只有换新底座才能清除。在开源权重上续训，以及用被污染的模型生成合成教材去训新底座，都算污染。<br><br>**反超**：<br>- 被污染的模型想翻身，唯一的途径是策略节点 `g_beyond`，再加 60 天只用自有数据的干净训练。机器人和顾问永远不选它。<br>- 干净的自研模型可以按 D6 的难度曲线超过 SOTA，但越接近越慢，越过以后每多一分都更贵。 |
|---|---|

**在第 11 行之后新增两行：**

| 12 | **难度曲线（D6）**<br>- 离当前最强越近，训练涨得越慢；越过以后，每多一分都更贵。<br>- 锚点只看对手和真实历史（`anchor`），不看玩家自己发过的模型，所以频繁发小版本没法把自己越推越高。<br>- 自家的真实史线只给炼出过 SOTA 的公司用；不领先时，最多算到对手最强 +1。<br>- 能不能冲过去，取决于两样东西：<br>　- 冲顶力：算力、自有数据、技术积累、独门技术四样相乘；<br>　- 技术储备：炼出过的公司更容易，同集团别的领域炼出过的稍好，从没炼出过的最难。 |
|---|---|
| 13 | **市场期待（D11）**<br>- 只在发布那一刻判定一次，结果分五种：超出、符合、平淡、略低、不及。<br>- 奖惩走 `applyEffects`，不弹卡，也不做持续的好感度条。<br>- 期待按公司分四档：冠军（炼出过，且 540 天内持过标签）、前冠军、挑战者、小团队。 |
|---|---|

## 改动 3：在 §0.3 末尾追加三条

- 单项 SOTA（例如“编程第一”）：只在新闻里提一句，不挂标签。
- 持续的“市场好感度”数值条：期待只做发布时的一次性判定。
- 期待系统里新增的放话档、闭关冲刺之类主动冲顶或抬高期待的玩法。已有的 `media_interview` 放话选项（boldClaim）保留，只按 D1 改用 `gapOf`，不并入期待。

## 改动 4：§1.1 文件树

- **替换** sim 表中「P0.3a 新建」一行：

| P0.3a 新建 | `effects.js`、`cond.js`、`modifiers.js`、`sota.js`、`route.js`、`strategy.js`、`strategy_ai.js`、`exclusive.js`、`expect.js` |
|---|---|

- **替换** `src/career/data/` 的「新建」第一条：
  - `balance.js`（常量）、`routes.js`、`strategy_core.js`、`spirits.js`、`credits.js`、`expect.js`、`release_days_gen.js`、`release_days_overrides.js`

## 改动 5：替换 §1.3 代码块全文

```js
export const DIM_MAX = 99, TRAIN_PACE = 0.8;
export const KCAP_OFFSET = { knowledge: 6, other: 14 };            // 统一 computeCaps 与 previewDistill（P0.3b）；蒸馏小模型沿用现有的 kcap 钳制，只把偏移统一成这个值
export const RENT_FACTOR = { 2023: 1.25, 2024: 1, 2025: 0.75, 2026: 0.6 };
// SOTA / 上限 / 蒸馏
export const FOLLOW_GAP = 1.0, OPEN_GAP_LLM = 1.5, APPROACH = 0.3, OWN_EDGE = 1.5;
export const DISTILL_HEAVY = 0.15, TAINT_MIN_DIST = 0.5, SYNTH_TAINT = 0.25, SMALL_DISTILL_GAP = 0.5;
export const BEYOND = { know: 350, ownCats: 3, ownLevel: 2, distillDep: 0.1, team: 150, trialDays: 60 };
// SOTA 标签（D10）与难度锚点（D6.2）
export const SOTA = { EPS: 0.1, FIELD: 2, FILL_LEAD: 3.0, HIST_SLACK: 1.0, HIST_LOOKAHEAD: 90, GHOST_CAP: 1.0, LOG_MAX: 40 };
// 难度曲线（D6）
export const CURVE = { W0: 1.5, F0: 0.5, B0: 1.0, A0: 0.3, A_MAX: 1.5, F_MAX: 0.85, RHO_MIN: 0.3, RHO_MAX: 2,
                       DIM_SLACK: 3, DIM_STEEP: 2, BIRTH_GAP: 1.0, GAIN_STEP: 0.1 };
export const EFFORT = {
  COMP: [0.15, 1.2], DATA: [0.1, 1.25], KNOW: [0.3, 1.2], LEAD_STEP: 0.25, LEAD_MAX: 2,
  TRAIN_REF: { llm:   { 2023: 1900, 2024: 11600, 2025: 30000, 2026: 73000, 2027: 146000 },   // H100 当量，frontier 档开局卡数的一半
               other: { 2023: 80,   2024: 170,   2025: 600,   2026: 1080,  2027: 2000 } },   // H100 当量，specialist 档开局卡数的一半
  KNOW_REF:  { llm:   { 2023: 120, 2024: 156, 2025: 192, 2026: 228, 2027: 264 },              // frontier 档开局技术积累
               other: { 2023: 40,  2024: 52,  2025: 64,  2026: 76,  2027: 88 } },             // specialist 档开局技术积累
};
export const SOTA_EASE = { maker: 0.6, kin: -0.3, rookie: -0.55, selfReliant: 0.2, selfBuilt: 0.1 };   // 特质 mods.sotaEase 的取值
export const DISTILL_MIX = { SPEED: 2.5, ZONE: 1.5 };
// 市场期待（D11）
export const EXPECT = {
  JUDGE_GAP: 60, CHAMP_DECAY: 540, CHAMP_LEAD: 1.0, NEAR_MISS: 1.0,
  CHAL_NEAR: 1.0, OPEN_NEAR: 2.0, CLOSE_BY: 2.0, BAND: { frontier: 2, bigtech: 4, major: 5, specialist: 4 },
  SMALL_UP: 1.0, REGRESS: 0.1,
  OPEN_MARGIN: 0.1, COMM_MARGIN: 1.0, COMM_FIELD: 2, COMM_MAX_TOTAL: 100,
  BASE_MARGIN: 1.0, BASE_TOKENS: 15, BASE_QUALITY: 1.0,
  WORKS_LAG: 365, WORKS_SLACK: 2, WORKS_QUALITY: 1.6, WORKS_COOL: 365,
  COOL: 180, HOT_WINDOW: 45, ROUND_COOL: 365, LOG_MAX: 40,
};
// 机器人与顾问（A10）
export const BOT = { DISTILL_GAP: 2, TEACHER_MIN: 0.5, DISTILL_EVERY: 90, HOLD_MAX_DAYS: 45, MAKER_DATA: 2.0 };
// 策略与路线
export const STRATEGY_DAYS = [14, 35, 70, 105], SHELF_DAYS = 30, SEED_WINDOW = 90, SEED_MIN_LEFT = 7;
export const ROUTE_COOLDOWN = 120, DELAY_DAYS = 180, SPIRIT_SHOW = 6;
export const RIGHT_TAIL = { afterReal: 365, afterDone: 180 };
// 弹窗
export const POPUP_PER_HOOK = 1, SUPER_GAP_DAYS = 60, IDLE_ADVICE_EVERY = 14;
```

删掉的常量：`EDGE_TIER`、`FRONTIER_LOOKAHEAD`。

**新常量一览**（全部是 P4.2 校准前的初值）

| 常量 | 初值 | 含义 |
|---|---|---|
| `SOTA.EPS` | 0.1 | 别家新模型要比现任高出这么多，标签才换手（自家换代不需要） |
| `SOTA.FIELD` | 2 | 一个模态里有发布的 org 不到这个数，就不挂标签 |
| `SOTA.FILL_LEAD` | 3.0 | 场地凑满时挂上的标签，要比别家最强高出这么多才算“炼出过” |
| `SOTA.HIST_SLACK` | 1.0 | 史实地板：锚点不低于“真实前沿 − 1” |
| `SOTA.HIST_LOOKAHEAD` | 90 | 自家真实发布提前多少天计入（只对炼出过的公司） |
| `SOTA.GHOST_CAP` | 1.0 | 不领先时，自家史线最多算到对手最强 + 这么多 |
| `SOTA.LOG_MAX` | 40 | “曾为 SOTA”最多记多少条 |
| `CURVE.W0` | 1.5 | 落后区宽度，实际值是 W0/ρ；数越大，越早开始减速 |
| `CURVE.F0` | 0.5 | 贴线速度的基数 |
| `CURVE.B0` | 1.0 | 越线后衰减的宽度，实际值是 B0·ρ：每多领先这么多分，速度再降到 1/e |
| `CURVE.A0` | 0.3 | 冲顶力门槛：A 不高于它时贴线速度为 0，只能无限逼近 |
| `CURVE.A_MAX` / `F_MAX` | 1.5 / 0.85 | 冲顶力上限 / 贴线速度上限 |
| `CURVE.RHO_MIN` / `RHO_MAX` | 0.3 / 2 | 储备系数 ρ 的夹逼范围 |
| `CURVE.DIM_SLACK` | 3 | 单维比世界包络高出这么多以内，不额外减速 |
| `CURVE.DIM_STEEP` | 2 | 超出 DIM_SLACK 的部分按几倍折算成越线分数 |
| `CURVE.BIRTH_GAP` | 1.0 | 新底座出生最多到 anchor − 1 |
| `CURVE.GAIN_STEP` | 0.1 | 事件、史实一类的大额加分按 Q 每段不超过 0.1 分段乘 H |
| `EFFORT.COMP` / `DATA` / `KNOW` | 见代码 | 冲顶力三个因子各自的夹逼范围 |
| `EFFORT.LEAD_STEP` / `LEAD_MAX` | 0.25 / 2 | 每项独门技术给冲顶力 +25%，最多算 2 项 |
| `EFFORT.TRAIN_REF` | 见代码 | 算力参照，按模态分两张表，年内线性插值 |
| `EFFORT.KNOW_REF` | 见代码 | 技术积累参照，按模态分两张表，年内线性插值 |
| `SOTA_EASE.maker` | +0.6 | 特质“炼出过 SOTA”，ρ = 1.6 |
| `SOTA_EASE.kin` | −0.3 | 特质“集团在别的领域出过 SOTA”，ρ = 0.7 |
| `SOTA_EASE.rookie` | −0.55 | 特质“技术储备不足”，ρ = 0.45 |
| `SOTA_EASE.selfReliant` / `selfBuilt` | +0.2 / +0.1 | g_beyond 奖励特质 / 通用树“坚持从零训练” |
| `DISTILL_MIX.SPEED` | 2.5 | 蒸馏那一份的速度倍数（不受难度曲线影响） |
| `DISTILL_MIX.ZONE` | 1.5 | 离 qCapD 最后这么多分，蒸馏那一份线性收口 |
| `EXPECT.BASE_QUALITY` | 1.0 | 蒸馏基线用的数据质量 |
| `EXPECT.WORKS_QUALITY` | 1.6 | “能干活”门槛的封顶：这个尺寸用这档数据能装下的上限 |
| `EXPECT.*`（其余） | 见代码 | 见 D11，每一项在 D11 里都有说明 |
| `BOT.DISTILL_GAP` | 2 | 机器人落后 worldSota 至少这么多才考虑蒸馏 |
| `BOT.TEACHER_MIN` | 0.5 | 老师至少比自己强这么多才蒸馏 |
| `BOT.DISTILL_EVERY` | 90 | 机器人买蒸馏数据的最短间隔（天） |
| `BOT.HOLD_MAX_DAYS` | 45 | “再练一阵”最多推迟多少天（顾问和机器人共用） |
| `BOT.MAKER_DATA` | 2.0 | 炼出过的机器人把 Q 计入的各类后训练数据补到这一档 |

## 改动 6：§A2 数据 schema

**在 `StrategyNode` 代码块里 `repeatable` 一行之后新增：**
```js
  auto: false,                      // true：只能由 bypass 或开局播种完成。startStrategy 拒绝开始，strategyOptions 不给“开始”按钮（目前只有 g_sota）
```

**在 A2 末尾（树校验器规则）追加：**
- 每棵公司树都不能 `omit` 掉 `g_sota`。每棵树都必须有 `base` 分支，`g_sota` 固定放在它的顶端。
- `auto: true` 的节点必须同时满足：有 `bypass`，`ai.never` 为真，`popup` 为 `'none'`。

## 改动 7：替换 §A4「规则」第 7 条全文

7. **播种**（`initStrategy`）：
   - 先应用 `startSpirits` 和国家说明特质。
   - **第 0 步，炼出 SOTA**：读 `s.sota.seed`（P1.1 的 `initSota` 按 D10.4 算好）。
     - `'★'`：`completeNode(s, 'g_sota', 'start')`，即加上 `g_sota_maker`。
     - `'○'`：加 `g_sota_kin`。
     - `'—'`：加 `g_sota_rookie`。

     这是一条通用规则，不写进各公司的 `startOverride`。
   - `hist.date < 开局日` 的史实节点，按日期顺序、在前置已满足的前提下记为 `how:'start'`。互斥方随之排除，跳过 `fiction` 节点。
   - 再从 `hist.date ∈ [开局, 开局 + SEED_WINDOW)` 中挑最早一个前置已满足的节点作为 `cur`：
     - `days = clamp(need − 距史实日天数, 0, need − SEED_MIN_LEFT)`；
     - 校验器要求这个节点开局时 `available` 成立；
     - `auto` 节点不参与挑选。
   - 没有可播种的节点时，`cur = pickStrategy(s, 'adaptive')`，进度为 0，保证开局总有一项在进行。
   - 最后应用 `startOverride`。
   - 路线不经过播种：开局路线以 B6 的表为准。测试要求：已预完成的路线节点按顺序施加后，结果等于表里的值。

## 改动 8：§A6 共享主干

**在表格最后一行（`g_beyond`）之后新增一行：**

| `g_sota` | 炼出 SOTA | 14 | 四棵 core_* 都有，放在 base 分支顶端。<br>- `auto: true`：不能手动开始，也不会占用策略槽。<br>- `available: {sotaMade:true}`，`bypass: {sotaMade:true}`：真的发布过一款拿到“算数”标签的旗舰（或开局前就有），由 A4 规则 2 的 `autoBypass` 在次日自动完成。<br>- 特质：`add g_sota_maker`，`remove g_sota_rookie、g_sota_kin`。<br>- `popup:'none'`，`ai:{base:0, never:true}`。<br>- 庆祝卡由 self 型里程碑 `ms_first_sota` 负责（E4）。 |
|---|---|---|---|

**替换表格下方说明中的这一条：**
- `core_image`、`core_music`、`core_speech` 包含：`g_sota`、6 个路线节点、`safety_first`/`move_fast`，以及各自一个模态押注节点：（下面三条子项不变）

**在表格下方的说明列表末尾追加一条：**
- `g_sota` 是所有公司共有的“国策”，对应永久增益（D6 的 ρ）。策略页把它显示在 base 分支顶端，标“自动完成，不占策略槽”；没完成时，条件清单写“发布一款拿到 SOTA 标签的旗舰（当前：离最强还差 x）”。

## 改动 9：§A8 通用特质列表

- **替换** `gs_self_built` 一行：
  - `gs_self_built`：`research ×1.1`，`sotaEase +0.1`
- **在列表末尾追加：**
  - `g_sota_maker`“炼出过 SOTA”：`sotaEase +0.6`。说明：“做出过世界最强的模型，最后几步怎么走心里有数。再冲会顺一些，但仍然不容易。”
  - `g_sota_kin`“集团出过 SOTA”：`sotaEase −0.3`。说明：“集团在别的领域做出过世界最强，经验能借一点，这个领域还得自己摸索。”
  - `g_sota_rookie`“技术储备不足”：`sotaEase −0.55`。说明：“还没做出过世界最强的模型。离最强还差一截时训练就开始吃力，最后几步特别难。”
  - `g_self_reliant`“青出于蓝”（D8 授予）：`sotaEase +0.2`

## 改动 10：替换 §A10 全文

### A10. 顾问与机器人（`sim/strategy_ai.js`；advisor 和 bot 共用）
```js
export function scoreNode(s, node, mode)  // mode: 'historic' | 'adaptive'
// 基础：ai.base × Π(满足条件的 factors.mult)
// historic：节点有 hist 且 |hist − 今天| ≤ 60 天时，加 ai.historic；hist 比今天晚 180 天以上时 ×0.1；fiction 节点得 0
// adaptive：董事会目标加权（营收目标 → market 分支 ×1.5；榜单目标 → reason/arch 分支 ×1.5）；与 strengths 匹配 ×1.3
// 两种模式都得 0 的：ai.never（含 g_beyond、g_sota）；auto 节点；路线节点（core 主干的通用路线节点永远不选；公司史实路线节点只在 historic 模式、离 hist ±60 天内才选）
export function pickStrategy(s, mode = 'adaptive')   // 同分时按 id 排序，结果确定
export function wantsDistill(s)                      // 机器人和顾问共用的蒸馏规则，见下
export function shouldHold(s)                        // 发布时机规则，顾问和机器人共用，见下
```

**顾问**
- 策略空闲时，`advise()` 在团队任务之前插一条：
  ```js
  { kind: 'free', id: 'strategy', label: `定下一项公司策略：${title}`, detail: describeEffects(node.effects) 加上特质说明, op: { type: 'strategy', id } }
  ```
  - 用 adaptive 模式选；如果 historic 模式有日期吻合的节点，优先推荐它，并注明“现实中这家公司这时走了这一步”。
  - 不主动推荐会改路线的节点，除非它是本家史实节点而且日期吻合。
  - test_career 里“建议能直接执行、不建议灰色做法、最后一条是团队任务”的三条约束继续成立。
- **训练方向**：`postPreview` 已经包含难度系数和蒸馏混合（D6、D7），顾问照旧按预估涨幅选方向。贴线时各方向涨幅都低于 0.6，会触发原有的“立项新底座”建议。
- **发布时机**：`shouldHold(s)` 为真时，把“发布”建议换成“再练一阵（最多 `BOT.HOLD_MAX_DAYS` 天）”，并写明还差多少才能拿到标签。`shouldHold` 为真的条件是以下全部成立：
  - `expectPreview(s, m)` 的档为冠军，预告结果为“不及”或“略低”；
  - 在练模型近 30 天还涨了 ≥ 0.3；
  - 45 天内没有董事会截止；
  - 这一轮推迟还没满 45 天。

  `expectPreview` 返回 null（P3.E 合入前的存根，或场地不足）时为假。
- **数据**：`sotaMade(s)` 为真时，把后训练数据的补货建议提到 `BOT.MAKER_DATA` 档。
- **蒸馏**：`wantsDistill(s)` 为真时，在数据建议里给出同一条，文案是“蒸馏 X：能很快追近，但这一代永远超不过 X 和当前最强”。

**机器人**（`sim/bot.js`）
- 每 7 天看一次局面，空闲时 `pickStrategy(s, 'historic')`。
- 永远不选 `g_beyond` 和 fiction 节点。`g_sota` 自动完成，不需要选。
- 遇到“已被抢先”的 notice 直接关闭。
- **发布时机**：发布前同样看 `shouldHold(s)`。
- **补数据**：
  - `sotaMade(s)` 为真时，把 Q 计入的各类后训练数据补到 `BOT.MAKER_DATA = 2` 档。只买 licensed、permissive 的数据，每周最多下一单，现金门槛同原规则。
  - 其他公司仍按原规则：某类低于 1.5 档才买。
  - 为什么要加这条：附录表 9 显示，真实机器人在 ★ 的垂直模态公司里，自有后训练数据长期停在最低档，冲顶力 A ≈ 0.14，贴线速度为 0，永远拿不到标签。补数据后 A ≈ 1.08，贴线速度到顶 0.85。
- `wantsDistill(s)` 为真时，买那位老师的蒸馏数据。只用 LP 许可的开源老师，不用闭源 API，也不用 LR 许可。

**蒸馏规则** `wantsDistill(s)`：以下全部成立才为真。
- `!sotaMade(s)`：炼出过 SOTA 的公司永远不蒸馏；
- 在练模型 `q ≤ worldSota(s).q − BOT.DISTILL_GAP`（没有可见对手时为假）；
- 存在对玩家可见、非自家、许可为 LP 的开源 `familyBest`，`q ≥ 在练 q + BOT.TEACHER_MIN`；
- 距上次买蒸馏数据 ≥ `BOT.DISTILL_EVERY` 天。

**resolveAll**（bot 和 playAdvised 共用）：
- 只对带 `distill: true` 标记的选项生效：`wantsDistill(s)` 为真才选它，否则选同一事件里不带标记的那个选项。
- 其他事件照旧，用“第一个非 AVOID 选项”的规则，不影响指纹和 F4 基线。
- `distill` 字段加进事件、里程碑选项的 schema。P2.3 标注 `data/events.js` 里的选项，P1.4 标注里程碑里的选项。

**结果**：没炼出过 SOTA、又落后较多的机器人公司，会变成“乌龟”：被污染，永远差一口气。前沿公司比所有开源老师都强，自然不会蒸馏。附录表 6 显示，不管蒸不蒸馏，非前沿机器人一年内拿到标签的概率都是 0%。

**对手**：只按脚本发布，不跑策略树。

## 改动 11：§C3、§C4

- **替换 C3 三行：**

| hn_gpt4 | GPT-4 | gpt · gpt_scale_bet（2023-03-14） | `{role:'flagship', open:false, minTotal:400, sota:true, atLeast:{name:'GPT-4',d:2}}` | `{ms:{ms_gpt4:'notOther'}}` | base | ex_gpt4_exam |
|---|---|---|---|---|---|---|
| hn_claude3_opus | Claude 3 Opus | claude · cl_three_tier（2024-03-04） | `{role:'flagship', open:false, sota:true}`；另需 `{smallLive:{exists:true}}` | — | base | ex_claude3_tops |
| hn_llama31_405b | Llama 3.1 405B | llama · mt_herd_405b（2024-07-23） | `{open:true, arch:['dense'], minTotal:400, gap:6, lead:null}`（不要求领先；用了别家老师的受 qCap 约束） | `{ms:{ms_open_frontier:'notOther'}}` | base | ex_llama_open_letter |

- 授名条件里的 `sota:true`，在发布面板和 `beforeRelease` 里按 `sotaWouldTake` 判定（E2）。
- **替换 C4 两条：**
  - `ex_gpt4_exam`：release；cond `{model:{sota:true}}`；选项：公布技术报告（`brand ×1.1`，`papers 'all'`）/ 不披露细节（`brand ×1.05`，`risk {distilled:0.7}`）。
  - `ex_claude3_tops`：release；cond `{model:{sota:true}}`；`brand ×1.12`。

## 改动 12：替换 §D1 全文

### D1. 唯一定义（`sim/sota.js`，P1.1）
```js
export const Q_W = { llm: { knowledge: .22, code: .22, math: .22, writing: .22, agent: .12 },   // 固定权重，从开局起就计 agent
  image: { aesthetics: .25, adherence: .25, text: .25, realism: .25 }, music: { composition: .25, vocals: .25, lyrics: .25, fidelity: .25 },
  speech: { naturalness: .25, cloning: .25, multilingual: .25, expressive: .25 } };
export const qOf = (mod, dims) => Object.entries(Q_W[mod]).reduce((a, [k, w]) => a + w * (dims[k] || 0), 0);   // 取代 overallQ，没有日期参数
export const isMine = (s, fam) => FAMILIES[fam].org === s.company.org && FAMILIES[fam].mod === s.mod;          // 同 org 同模态即自家；取代 sibling
export const visible = (s, r, day = s.day) => r.day <= day && !isMine(s, r.family);
export function relDims(s, r)                 // r.dims 减去跟随者钳制量 s.world.adj[r.id]（D5）
export function familyBest(s, fam, day)       // 家族截至当天 Q 最高的一款；用于排名、老师、对手实力
export function onSale(s, fam, day)           // 家族截至当天最新的一款主线发布（不含 'S' 标签）；用于“市场上在卖什么”
export function worldSota(s, { day = s.day, mod = s.mod, open = null } = {})   // 只算对手 → { q, dims, rel } | null（没有可见对手）
export function sotaAt(s, { day = s.day, mod = s.mod } = {})                   // 标签持有者：当天取 s.sota.holder，过去的日子按 s.sota.log 回查
                                                                               // → { q, holder: 'me'|fam, id, name, since, counted } | null（场地不足）
export function sotaWouldTake(s, q, { day = s.day, mod = s.mod } = {})         // D10.2：q 这一版现在发布能否拿到标签 → true | false | null（发布后场地仍不足）
export function envelope(s, { day, mod, includeMine = false })                 // 各维度最大值（用相同的可见性规则）
export const SOTA_PRE                         // D10.4：数据起点之前的持有者（带出处）
export const SOTA_HISTORY                     // D10.4：全部真实主线发布按 D10.2 排出的持有者序列（带 via、counted、countedAt、until）；载入时算一次
export function histOther(s, { day = s.day, mod = s.mod } = {})    // 别家全部真实主线截至 day 的最强 q（不做可见性过滤和跟随者钳制）；没有则 null
export function ownHist(s, { day = s.day, mod = s.mod } = {})      // 本公司 org 本模态真实主线截至 day + HIST_LOOKAHEAD 的最强 q；没有则 null
export function tempAnchor(s, { day = s.day, mod = s.mod } = {})   // 本模态全部真实发布（含本公司、含 S）截至 day 的最强 q；一条都还没有时取本模态第一条真实发布的 q
export function anchor(s, { day = s.day, mod = s.mod } = {})       // D6.2 的 R，永远是有限数
export function anchorEnv(s, { day = s.day, mod = s.mod } = {})    // D6.2 的 E_k，同一规则逐维计算
export function labelOnRival(s, r)            // D10.2：对手发布在 r.day 变为可见时调用 → { changed, filled, defended }
export function labelOnRelease(s, snap)       // D10.2：doRelease 里调用 → { got, prev, via, counted }
export const sotaMade = s => !!s.sota?.before || (s.sota?.made?.length ?? 0) > 0
export function lastHeldDay(s)                // 玩家正持标 = 今天；否则取 s.sota.log 里自家最后一段的 until 与 s.sota.histLast 中较晚的；都没有则 null
export const gapOf = (s, dims, day) => { const w = worldSota(s, { day }); return w ? qOf(s.mod, dims) - w.q : null; };
export function worldRank(s, q, day)          // 1 + 各 org 截至当天最强一款中 Q 高于 q 的个数
export function realQ(name)                   // 具名真实型号的 Q，给 atLeast 用
export function pushEnvelope(s, day)          // D5
```

| 用途 | 口径 |
|---|---|
| SOTA 标签；里程碑、超事件、发布时“你是不是最强” | `sotaAt`（D10 标签） |
| 授名条件 `sota`、发布预告 | `sotaWouldTake` |
| 条件 `gap`、`lead`；蒸馏上限；被别家蒸馏；跟随者判断；市场期待里的差距 x | `worldSota` |
| 难度曲线、单维护栏、底座出生护栏 | `anchor`、`anchorEnv`（不含玩家快照；自家史线只给炼出过的公司） |
| 开局播种、公司历程、交叉测试 | `SOTA_HISTORY`、`SOTA_PRE` |
| 榜单、对手页、蒸馏老师 | `familyBest` |
| 新闻、市场份额里的“在售” | `onSale` |

**替换点**：
- milestones.js:11-29（`bestClosedQ`、`bestRivalQ`）、87-90（`topRank`）；
- model.js:362-372（`rivalQs`、`topRival` → `rivalStandings(s, day)`）、`leaderboard`、`distillTeachers`；
- economy.js:258-260；release.js 的发布品牌；reputation.js；super.js:9；data_ops.js 的 `distillOptions`；research.js 的 `techStatus`（改用 `isMine`）；
- game.js:1217-1220 的 boldClaim 一年后检查：`topRival`、`overallQ` 改成 `gapOf(s, m.dims) < −1`，`gapOf` 为 null 时不罚。
- 删除 game.js:73-78 为 2026 打的 `startRelease` 补丁，统一用 `familyBest`。
- 删除 `frontierRef` 及其全部调用。

## 改动 13：替换 §D6 全文

### D6. 难度曲线（取代“自研上限”的硬顶；`sim/model.js`，P1.2）

#### D6.1 上限只剩三项

```
selfCap_k(m) = min( m.base_k + HEADROOM[mod][k] + Σ_{t ∈ s.techs \ m.techs} TECH_CAP[t][k] + modifier(s, 'cap.' + k),
                    k ≠ safety && m.kcap ? m.kcap + KCAP_OFFSET(k) : ∞,
                    DIM_MAX )
```
- 这三项管“这个底座、这个规模最多能到哪”。难度曲线管“离当前最强还有多远”。
- `m.techs` 是底座完成时的技术快照；开局继承的模型取开局时的技术。这样修掉了技术加成重复计算的问题：DeepSeek y2025 的 V3-0324，数学上限不再到 99。
- 原来的第三项 `frontierRef.env_k + edge_k`，以及 `edgeQ`、`EDGE_TIER`、`frontierRef()`，全部删除。

#### D6.2 难度系数 `hardness(s, m)`（按天缓存，和 modifier 共用失效点）

**锚点**（`sota.js` 的 `anchor`、`anchorEnv`，P1.1）
```
WS    = worldSota(s)?.q ?? null                         // 对手最强；没有可见对手时为 null
HO    = histOther(s)                                    // 别家全部真实主线截至今天的最强（不做可见性过滤和跟随者钳制）；没有为 null
OG    = sotaMade(s) ? ownHist(s) : null                 // 自家真实主线，提前 SOTA.HIST_LOOKAHEAD 天计入；没炼出过就不计
lead  = s.sota.holder?.by === 'me' || WS === null || sotaWouldTake(s, qOf(在练模型.dims)) === true
own   = OG === null ? −∞ : lead ? OG − SOTA.HIST_SLACK : min(OG − SOTA.HIST_SLACK, WS + SOTA.GHOST_CAP)
R     = max(WS ?? −∞, HO === null ? −∞ : HO − SOTA.HIST_SLACK, own)
R 仍是 −∞ 时：R = tempAnchor(s)                          // 本模态还没有任何别家发布，自家史线也不计
E_k   = anchorEnv(s)[k]：同一规则逐维计算（WS → envelope_k；HO → 别家史实各维最高；OG → 自家史实各维最高；临时锚 → 本模态全部真实发布各维最高）
```
- **自家史线只给炼出过 SOTA 的公司用。** 它补的是“自家线被隐藏”的漏洞（GPT y2023 看不见 GPT-4），不能给新手白送一段快车道。没炼出过的公司，锚点就是对手和别家的史实。
- **不领先时，自家史线最多算到对手最强 + 1。** “领先”指以下任一：正持有标签；本模态还没有可见对手；在练模型现在发布就能拿到标签。最后一条避免了“为了留着授名暂不发布，就被卡住”的陷阱（附录表 7 末行）。
- **临时锚**只在本模态一条别家发布都还没有时用。例如 Suno y2023 在 2023-06-15 MusicGen 出现之前，ElevenLabs y2023 在 2023-11-15 OpenAI TTS 出现之前。这时没有“最强”可比，就按真实历史这个模态当时的水平算。出生护栏（D6.5）同样按它生效。

**冲顶力与储备**
```
A     = min(CURVE.A_MAX, fComp · fData · fKnow · fLead)                  // 冲顶力：四样必须同时到位
  fComp = clamp( √( trainFlops(s) × (s.project ? 0.25 : 1) / (EFFORT.TRAIN_REF[ref][年] × 1e21) ), ...EFFORT.COMP )
  fData = clamp( Σ_k Q_W[mod][k] · (s.data.post[cat(k)] ?? 0) / 2, ...EFFORT.DATA )   // 只算自有后训练数据
  fKnow = clamp( s.know / EFFORT.KNOW_REF[ref][年], ...EFFORT.KNOW )
  fLead = 1 + EFFORT.LEAD_STEP · min(EFFORT.LEAD_MAX, |leadTechs(s)|)   // 玩家已掌握、对外 techStatus 仍是 secret/proof 的技术
  ref   = mod === 'llm' ? 'llm' : 'other'；“年”按日期在相邻两年之间线性插值
ρ     = clamp(1 + ease, CURVE.RHO_MIN, CURVE.RHO_MAX)                    // 技术储备：炼出过 1.6，集团出过 0.7，技术储备不足 0.45
  ease = s.strategy ? modifier(s, 'sotaEase')
       : sotaMade(s) ? SOTA_EASE.maker : s.sota.seed === '○' ? SOTA_EASE.kin : SOTA_EASE.rookie
       // 回退：P2.2 合入前、旧存档迁移前，s.strategy 还不存在
F     = min(CURVE.F_MAX, CURVE.F0 · ρ · clamp((A − CURVE.A0) / (1 − CURVE.A0), 0, CURVE.A_MAX))   // 贴线时的速度
b     = CURVE.B0 · ρ                                                     // 越线后：每多 b 分，速度再降到 1/e
W     = CURVE.W0 / ρ                                                     // 落后区宽度：储备越少，越早开始减速
δ     = qOf(dims) − R
δ_k   = max(δ, CURVE.DIM_STEEP · (dims_k − E_k − CURVE.DIM_SLACK))       // 单维护栏：一科比世界包络高出 3 分以后按 2 倍折算
H(x)  = x ≤ 0 ? 1 − (1 − F) · e^(x / W)  :  F · e^(−x / b)
H_k   = H(δ_k)
```
- **空值约定**：所有 `s.data.post[c]`、`s.data.distill[c]` 的读取一律写 `?? 0`。A、F、H、δ 永远是有限数（D9 6.12）。
- 安全维不乘 H。刷榜（benchmax）只写 `w.boost`，不受影响。炸炉（spike）的负涨幅照常生效。

**参考值**（附录表 0；“越线成本”是从 0 爬到 +x 所花的时间，折合成满速时涨几分）

| 情况 | ρ | F | b | W | δ=−3 | −1 | 0 | +1 | +2 | +3 | 越线到 +1 / +2 / +3 的成本 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 炼出过，A ≥ 1.04（ρ = 1.6 时 F 已到顶） | 1.6 | .85 | 1.6 | .94 | .99 | .95 | .85 | .45 | .24 | .13 | 1.6 / 4.7 / 10.4 |
| 炼出过，A = 0.9 | 1.6 | .69 | 1.6 | .94 | .99 | .89 | .69 | .37 | .20 | .11 | 2.0 / 5.8 / 12.9 |
| 炼出过，A = 0.6 | 1.6 | .34 | 1.6 | .94 | .97 | .77 | .34 | .18 | .10 | .05 | 4.1 / 11.6 / 25.8 |
| 集团出过（○），冲顶力满 | 0.7 | .52 | .70 | 2.14 | .88 | .70 | .52 | .13 | .03 | .01 | 4.2 / 21.9 / 95.7 |
| 没炼出过，冲顶力满 | .45 | .34 | .45 | 3.33 | .73 | .51 | .34 | .04 | — | — | 11（拿到第一枚算数的标签，次日就变成“炼出过”） |
| 没炼出过，A = 0.9 | .45 | .19 | .45 | 3.33 | .67 | .40 | .19 | .02 | — | — | 19 |
| 任何人，A ≤ 0.3（以没炼出过为例） | .45 | 0 | — | 3.33 | .59 | .26 | 0 | 0 | 0 | 0 | 过不去，只能无限逼近 |

#### D6.3 作用点
- **后训练**：`postPreview` 把 `H_k` 放进 D7 的混合系数 `mix_k`，`dailyFocus` 用 `applyGains(…, {preMixed:true})` 写入。界面预估和顾问选方向因此跟实际一致。
- **其他来源**：事件、里程碑、史实、效果里的 `dims`，在 `applyGains` 第 0 步乘 `H_k`（σ = 0）。大额加分按 Q 每段不超过 `CURVE.GAIN_STEP`（0.1）分段：每段按当时的 δ_k 算 H_k，加完再算下一段，免得一次性发放跳过越线成本。
- **底座**：缩放律算出的 `m.base` 不乘 H。用大算力练大底座就是正当的“大努力”：它抬高 cap，后训练就爬得更快。但出生时有护栏，见 D6.5。

#### D6.4 越过以后；锚点为什么不含玩家；自家史线怎么算
- 越过 SOTA 以后，锚点仍然是“最强对手”，所以领先第二名越多越难。对手发布新的最强模型后，δ 变小，又能涨了。
- 锚点不看玩家自己发过的模型。如果锚点算上自己，领先者每发一版，线就抬到自己头上，δ 归零，靠频繁发小版本就能无限拉开差距。附录表 3：锚点含玩家时，到 +3 只要 331 天，而且发布越勤越快；本稿不管间隔 14、60 还是 120 天，都是 570 天。
- 自家史线补的是被隐藏的自家线。例如 GPT y2023 看不见 GPT-4：只看对手时锚点是 Claude 的 51.1，后训练会冻结一年；加上自家史线后，在练模型 92 天就能到 58.8（附录表 7）。
- 自家史线不给新手。上一稿让新手也算自家史线，Claude y2024（没炼出过）玩家全力 20 局全部拿标，中位第 43 天，和炼出过的几乎一样快。本稿：没炼出过 0/20，炼出过 20/20（附录自检）。
- 不领先时，自家史线钳到对手最强 + 1。附录表 6 全部 1089 局，不领先时“锚点 − 对手最强”最高 1.00。

#### D6.5 底座出生护栏（同时修掉 game.js:1007 绕过上限的问题）
`finishPretrain` 和 `startFinetune` 写完 dims 后，调用 `birthClamp(s, m)`：
1. Q 计入的各维：`dims_k = min(dims_k, E_k + CURVE.DIM_SLACK)`；
2. 若 `qOf(dims) > R − CURVE.BIRTH_GAP`，Q 计入的各维统一减去超出量（不低于 0）；
3. `m.base`、`m.kcap`、cap 都不动。新底座出生在最强之下 1 分处，最后几步要靠后训练爬上去。

- 这条主要管非 LLM 底座（`nonLlmBase` 出生时接近满额）。LLM 底座的 agent 维被钳在 30 以内，出生 q 本来就远低于 R。
- R 来自临时锚时同样生效。例如 Suno y2023 在 MusicGen 出现之前，a3 底座（base 60）出生时不超过 31.25 − 1 = 30.25。

#### D6.6 界面
- **训练面板**：只加一行状态，主界面不加按钮。
  - 落后时：“离最强对手还差 1.2 分，涨分速度 ×0.58”；
  - 领先时：“领先第二名 0.8 分，再往上每多 1.6 分，涨得再慢一大截”；
  - R 来自史实时，加一句“按真实历史，这时的前沿约在 X”；
  - R 来自临时锚时：“这个领域还没有对手，按真实历史这时的水平约在 X”。
- **冲顶力**：在面板的展开区画四根条：算力、自有数据、技术积累、独门技术。后面写一句：“四样相乘不到 0.3，就只能无限接近，过不去。”
- **预估涨幅**：后面标“接近最强 ×0.42”。

## 改动 14：§D7 局部替换

**替换「每天训练方向 d」代码块全文：**
```
O = s.data.post[c] ?? 0；D = ownOnly ? 0 : Σ_f (s.data.distill[c]?.[f] ?? 0)；σ = D / (O + D)（O、D 都为 0 时 σ = 0）
eff₀    = moraleMult × computeMult × modifier(s,'post') × modifier(s,'post.'+k0) × (1 + knowFx.post)   // 不再含数据档位，也不含 (1 + 0.1σ)
raw_k   = 原公式：主维 (cap_k0 − cur) · rate · eff₀；副维按 side 系数，正值不超过 cap_k − dims_k
qCapD   = min(max_{f ∈ 本类数据的老师} teachers[f].q, worldSota(s)?.q ?? +∞) − APPROACH        // D = 0 时为 −∞
fade    = clamp((qCapD − q) / DISTILL_MIX.ZONE, 0, 1)
mix_k   = (1 − σ) · levelMult(O) · H_k
        + σ · levelMult(min(2.5, O + D)) · DISTILL_MIX.SPEED · fade · (1 + 0.1σ)
          // 自有那一份吃难度曲线；蒸馏那一份不吃，但在 qCapD 前 DISTILL_MIX.ZONE 分内线性收口
          // 掺蒸馏的那点小加成只放在蒸馏那一份上，所以越线后（fade = 0）日涨幅严格是同条件纯自研的 (1 − σ) 倍
          // 安全维：mix = levelMult(min(2.5, O + D))，不拆分、不乘 H
gains_k = raw_k × mix_k（只对正值；负值照旧）
postPreview 返回 gains 和 { R, δ, H_k, A, F, mix }；dailyFocus 调 applyGains(s, m, gains, { preMixed: true })；G = 实际 Q 涨幅
m.post.own += G(1−σ)；m.post.dist += Gσ；m.post.teachers[f] += Gσ · D_f / D
一旦 m.post.dist ≥ TAINT_MIN_DIST 且 dist/(own+dist) ≥ DISTILL_HEAVY，就设 m.tainted = true（终身有效，只有换新底座才清零）
```
- 蒸馏仍是最快的追法。附录表 5：同一家公司从差 10 追起，蒸馏 60 天就追到差 2.58；不蒸馏要 180 天才到差 3.60。
- 但蒸馏追不到 qCapD，更追不到 SOTA。
- 堵掉的两个漏洞：
  - 只掺一点蒸馏数据（σ < 0.15，不触发污染）时，蒸馏那一份照样只能推到 qCapD；
  - 蒸馏数据不再抬高自有那一份的档位。

**替换「`applyGains(s, m, gains)`」代码块及其后两条说明：**
```
applyGains(s, m, gains, { preMixed = false } = {})     // 后训练、benchmax 以外的所有 dims 加分都必须经过这里
第 0 步：preMixed 为 false 时，Q 计入维的正涨幅乘 H_k（D6，σ = 0）；
        这批正涨幅折成 Q 超过 CURVE.GAIN_STEP 时，按每段 ≤ GAIN_STEP 分段：每段按当时的 δ_k 算 H_k，写入后再算下一段
tainted = m.tainted && !m.untainted
cap_k   = tainted ? min(selfCap_k, T_k − APPROACH + ownEdge_k) : selfCap_k
          T_k       = max_{f ∈ m.post.teachers} teachers[f].dims[k]
          ownEdge_k = OWN_EDGE × min(1, (s.data.post[cat(k)] ?? 0) / 2.5)
qCap    = tainted ? min(max_f teachers[f].q, worldSota(s)?.q ?? +∞) − APPROACH : ∞      // 整模型的污染上限
第 1 步：正涨幅逐维钳到 max(0, cap_k − dims_k)；负涨幅照常生效
第 2 步：q0 = qOf(dims)，q1 = qOf(dims + g)；若 q1 > qCap：
         f = q0 ≥ qCap ? 0 : 0.5 × (qCap − q0) / (q1 − q0)，所有正涨幅乘以 f   // 每次只走剩余距离的一半，只会无限逼近
已有的 dims 永远不往下削（主维度、副维度一视同仁，修掉 model.js:277 的副维度漏洞）
```
- 弱老师卡死的老 bug 不会复现：没被污染的模型不受 `T_k` 约束，蒸馏那一份在 qCapD 前收口，自有那一份照常涨。
- 第一次使用某位老师的数据前，如果这位老师弱于当前模型，弹出确认：“用它训练会把这一代锁在 X 以下，而且不可逆”。
- 记号：`qCap` 指整模型的污染上限，按 `m.post.teachers` 算；`qCapD` 只出现在“蒸馏那一份收口”处，按本类数据的老师算。

**替换「蒸馏小模型」段的第 2 条，并在其后新增两条：**
- 每维不超过 `T_k − 0.5`，也不超过 `knowledgeCap(学生总参, 数据质量) + KCAP_OFFSET(k)`（非 LLM 没有这一项）；整体不超过 `min(老师 q, worldSota) − 0.5`。
  - 这条 kcap 钳制是沿用现有的，P0.3b 只把偏移从 4/12 统一成 `KCAP_OFFSET`。
  - 数据质量默认取 `max(poolStats.quality, 1.6)`，这时 7B 蒸馏模型的 q 最多约 76.2。
- `previewDistill(s, cfg, { quality } = {})`：新增可选的数据质量参数，不传时按默认值。函数名统一写 `knowledgeCap`（model.js:86）。
- `distillBaseline(s, snap)`（D11 的徽章用）：
  - 老师：当天对玩家可见、许可为 LP 或 LR 的最强开源发布；
  - 学生：与 snap 相同的总参和激活参数；
  - `tokens = EXPECT.BASE_TOKENS` 万亿，`quality = EXPECT.BASE_QUALITY`（1.0），用 `previewDistill` 算出 q；
  - 意思是“随手蒸一个同尺寸的模型能到哪”。质量为 1 时，7B 最多约 73.5，32B 约 80.8。

**蒸馏表单**加一行：“这条路最多走到 92.8（老师 93.1 和当前最强 93.8 里取低的，再减 0.3），永远过不去。”

## 改动 15：替换 §D8 全文

### D8. 极难的反超：`g_beyond`（`core_llm`，105 天，`ai.never`）

**定位**：被污染模型唯一的翻身路。干净的自研模型按 D6 曲线就能超过 SOTA，不需要这个节点。

- **`available`**（全部满足才能开始）：
  - 在线旗舰已被污染（含续训来的），并且 `q ≥ qCap − 0.5`，也就是已经练到顶；
  - `know ≥ 350`；
  - 自有后训练数据至少 3 个类别达到 2 档；
  - 365 天内首创过至少一项技术；
  - `distillDep ≤ 0.1`；
  - `team ≥ 150`。
- **完成**：给当前在练模型写 `m.beyondTrial = { need: 60, clean: 0 }`。
  - 之后每天只用自有数据（`ownOnly`）训练、而且不出 spike，计数 +1；
  - 出 spike 就归零；中途用了蒸馏数据，试炼作废；
  - 满 60 天时设 `m.untainted = true`，这一代改按干净口径计算；同时加特质 `g_self_reliant`（`sotaEase +0.2`）和 `know +30`。
- **解除污染以后**：`qCap` 不再整体钳住这一代，但 D6 难度曲线照常生效。没炼出过 SOTA 的公司仍然带着“技术储备不足”，冲过去照样要冲顶力。续训来的底座（`m.lineage.kind === 'finetune'`）解除污染后仍然拿不到“开源最强”（D11.2）。
- 整个过程没有随机抽签，难度来自门槛和 spike 风险。顾问和机器人永远不选这个节点（附录表 6、F4：次数为 0）。

## 改动 16：替换 §D9 全文

### D9. 难度曲线、上限与蒸馏的测试（`tests/career/distill.test.mjs`、`caps.test.mjs`、`curve.test.mjs`）

1. 单一老师练 400 天（被污染的模型）：每天都满足 `q ≤ min(T, worldSota) − APPROACH + 1e-9`。
2. o1、R1、Claude 3.5 三位老师混合：`q < 三人中最高的 q − APPROACH`。
3. 副维度不超过 `cap_k`。
4. 关于数据和老师：
   - 买到同档的自有数据后，上限不会消失；
   - 没被污染时，弱老师的数据不会卡死模型：蒸馏那一份在 qCapD 前收口，自有那一份照常涨。
5. 关于蒸馏小模型：
   - 小模型立项后老师掉出前 6，完成时 dims 不为空，`teacher` 有值；`ms_on_shoulders` 能够达成；
   - 蒸馏小模型每维不超过 `knowledgeCap + KCAP_OFFSET`；
   - `previewDistill(s, cfg, {quality: 1})` 下 7B 的 q ≤ 73.5 + 0.1。
6. 难度曲线：
   1. H 连续、单调不增：δ 从 −20 到 +10，步长 0.01，用五组 (A, ρ) 检查（含 ρ = 0.7），相邻两点 H 不升，差 ≤ 0.02。
   2. A ≤ A0 时：对手线固定，1000 天内 q 始终低于 `anchor`。
   3. 锚点不含玩家：同一夹具下，发布间隔 14、60、120 天，领先到 +1 和 +3 的天数完全相同。
   4. 首次与再次：确定性夹具（前沿全力，从差 3 到拿标），“没炼出过 / 炼出过”的天数比在 1.5–2.5。
   5. 单维护栏：
      - DeepSeek y2025 主攻数学 200 天：`math ≤ anchorEnv.math + DIM_SLACK + 0.5`；
      - 夹具中“炼出过且全力”只练数学 600 天：`math ≤ anchorEnv.math + DIM_SLACK + 4`。
   6. 出生护栏：
      - `finishPretrain`、`startFinetune` 之后，`qOf(dims) ≤ anchor − BIRTH_GAP + 1e-9`，且各维 `≤ anchorEnv_k + DIM_SLACK`；
      - 各年 frontier 配额能练出的最大底座也满足上一条。
   7. 自家线隐藏：
      - GPT y2023 的在练模型（56.8）120 天内能涨到 58.8；
      - 同一夹具里玩家练到 58.8 才第一次发布（3 月 15 日起不持标），到 58.8 的天数与“能拿标就发”相差 ≤ 7 天；
      - Claude y2026 开局 30 天内，在练模型的日涨幅大于 0。
   8. ρ 回退：`s.strategy` 不存在时，DeepSeek y2025 的 ρ = 0.45，GPT y2023 的 ρ = 1.6，Gemini y2024 的 ρ = 0.7；P2.2 合入后，同一状态下的 ρ 不变。
   9. 自家史线：
      - `sotaMade` 为假时，`anchor ≤ max(worldSota.q, histOther − HIST_SLACK) + 1e-9`；
      - 不领先（不持标、有可见对手、在练模型也拿不到标签）时，`anchor − worldSota.q ≤ GHOST_CAP + 1e-9`。
   10. 新手更难：Claude y2024 夹具，玩家全力 20 个种子：没炼出过的一年内拿标局数 ≤ 炼出过的一半。
   11. 临时锚：Suno y2023 在 2023-06-15 之前 `anchor === tempAnchor`（Bark 31.25），这段时间里出生的 a3 底座 q ≤ 30.25。
   12. 有限数：24×4 局机器人，每天检查所有 dims、H、A、F、δ，以及 `gapOf` 不为 null 时的 x，都是有限数。
7. 用被污染的模型生成合成教材，训出的新底座同样被污染。
8. `g_beyond` 的试炼：用确定性夹具（直接设置 `cleanStreak`，并注入随机数）验证 60 天后解除污染；中途用了蒸馏数据就作废。
9. 机器人 24×4 局：
   - `untainted` 次数为 0；
   - 被污染的模型每天满足 `q ≤ worldSota(s).q − APPROACH + 1e-9`（没有可见对手的日子跳过），这是硬不变量；
   - 被污染的快照从未拿到标签（`sotaAt(s)` 先判空再比较）。
10. 掺蒸馏但没被污染：
    - σ = 0.5 的模型，`q ≥ anchor` 且 fade = 0 以后，每日涨幅 ≤ 同条件纯自研的 (1 − σ) 倍 + 1e-9；
    - σ < DISTILL_HEAVY 时，越线后的日涨幅 ≤ 纯自研。
11. 没有 spike、没有钳制的那天，`postPreview` 的预估涨幅和 `dailyFocus` 实际写入的涨幅相差 ≤ 1e-9。
12. 大额加分分段：一次 `dims` 加分折成 Q 为 1.0、δ 从 0 起时，实际涨幅等于按 0.1 一段逐段积分的结果，小于“一次性按 δ = 0 乘 H”的结果。

## 改动 17：在 §D9 之后新增 §D10

### D10. SOTA 标签（`sim/sota.js`，P1.1）

#### D10.1 定义
- SOTA 是挂在模型上的标签。每个模态同一天只有一款，就是 0.2#6 说的“截至当天最强”。
- 四个模态各一枚，公司只争自己模态的那一枚。同一集团其他模态的换手只进新闻。
- 大模型、小模型一视同仁，但只在**主线**发布之间争：
  - 对手：不带 `S` 标签的发布；
  - 玩家：role 为 flagship 的已发布快照。
- 标签只看 `qOf(dims)`。刷榜、评测污染都没用。

#### D10.2 挂上、转移与“算不算炼出”
1. **候选**：
   - 对手：对玩家可见、不带 `S` 的发布，q 用 `relDims` 算；
   - 玩家：已发布的 flagship 快照（含开局继承的 `m.hist` 型号），q 用发布时的 dims。
2. **场地**：本模态里有过任何发布的 org 不到 `SOTA.FIELD = 2` 家时，不挂标签，`holder = null`。
   - 计算家数时，带 `S` 的副线和玩家自己都算。
   - 第一次凑满 2 家的那一刻，标签直接给当时候选里 q 最高的一款，不需要高出 EPS。
   - **这一枚算不算“炼出”**：它比当时别家任何发布（含 S 副线）的最强高出 `SOTA.FILL_LEAD = 3` 分才算（`counted = true`）。否则先只显示（`counted = false`），等它在持标期间挡住了一款别家主线新发布（对方没能高出 EPS），才算，`countedAt` 记为那天。
3. **换手**：之后每出现一条新候选（对手在 `r.day` 变为可见，或玩家 `doRelease`）：
   - 别家的候选：`q > holder.q + SOTA.EPS` 才换手，换手得来的一定算数；
   - 与持有者同 org 的候选（自家换代）：`q ≥ holder.q` 就接过，不需要 EPS，`counted` 照旧继承；
   - 同一天有多条，按 q 从高到低逐条处理；
   - 别家差不到 0.1 不换手，同分也不换手。
4. **被超过的**：
   - 玩家快照写 `m.sota.until`；
   - 每次换手都在 `s.sota.log` 记一条，玩家的也记，最多 `LOG_MAX` 条；
   - 自家换代也记，标 `via:'self'`。
5. **玩家快照拿到标签时**：
   - 开局后发布的、而且算数：`s.sota.made.push({ modelId, day, q, via })`，写 `m.sota = { from, until: null }`。
   - 开局继承的 `m.hist` 型号（只会在“场地凑满”那一刻发生）：算数时只设 `s.sota.before = true` 并写 `m.sota`，不记 made，不弹卡。
   - 不算数的标签：只写 `holder` 和 `m.sota`，不进 made，也不改 before。之后被认定算数时，再按上两条补记。
6. **`sotaWouldTake(s, q)`**：按当前状态试算“q 这一版现在发布能不能拿到标签”，和 `labelOnRelease` 用同一套判断。
   - 发布后本模态有发布的 org 仍不到 FIELD：返回 null；
   - 当前没有持有者（这一版发布让场地凑满）：q 是否高于全部候选；
   - 持有者是自家：`q ≥ holder.q`；
   - 其余：`q > holder.q + EPS`。
7. **开局**（`createGame` → `initSota`）：
   - 先按 D10.4 设 `seed`、`before`、`histLast`；
   - 再把开局日之前对玩家可见的对手主线发布，和开局继承的玩家快照，按日期回放一遍以上规则，得到 `holder`、`log`。回放时不发新闻、不弹卡。

#### D10.3 状态与调用顺序
```js
s.sota = {
  holder: { by: 'me' | fam, id, name, q, since, counted } | null,
  field: ['openai', 'anthropic'],                  // 本模态有过发布的 org
  log: [{ by, id, name, q, from, until, via, counted }],  // 曾为 SOTA，最多 LOG_MAX 条；via: 'fill' | 'swap' | 'self'
  made: [{ modelId, day, q, via }],                 // 开局后发布、拿到过算数标签的玩家快照
  before: false,                                    // 开局前（含开局继承的型号）拿到过算数的标签
  seed: '★' | '○' | '—',                            // D10.4，给 A4.7 第 0 步和 ρ 回退用
  histLast: null | 'YYYY-MM-DD',                    // 开局前本公司本模态最后一段持标区间的结束日；开局时仍在持标则取开局日
};
m.sota = { from, until } | undefined;
```
- `createGame` 的钩子顺序：`(开局阵容、继承型号) → initSota → initExpect → initRoute → initStrategy → initNaming`。
- `loop.js` 在 `r.day` 处理对手发布时调用 `labelOnRival`：
  - 换手新闻和 D2 的同日新闻合并成一条；
  - 返回 `filled`（场地第一次凑满）时，调用 `judgeDeferred(s)`（D11.3）；
  - 返回 `defended`（玩家持有的标签因此变成算数）时，按 D10.2 第 5 条补记。
- `release.js` 的 `doRelease` 顺序固定：
  `beforeRelease`（命名、开源规则；授名用 `sotaWouldTake`）→ 建快照 → `lab = labelOnRelease(s, snap)` → `judgeRelease(s, snap, lab)`（D11）→ `afterRelease`（`fire`、专属事件）。
  这样 `{model:{sota:true}}` 在里程碑和专属事件里就能读到结果。

#### D10.4 `SOTA_HISTORY`、`SOTA_PRE` 与开局播种
```js
export const SOTA_PRE = { llm: [{ org: 'openai', name: 'ChatGPT（GPT-3.5）', day: '2022-11-30', src: 'https://openai.com/index/chatgpt/' }] };
```
- **为什么要补 SOTA_PRE**：rivals.js 的 LLM 数据从 GPT-3.5 开始，2023-02 之前只有 OpenAI 一家，按场地规则挂不上标签，但现实里它当时就是最强。所以数据起点之前的持有者只补这一条，算数。
- **`SOTA_HISTORY` 的算法**：对全部真实主线发布（含各家自家线，不做可见性过滤，不做跟随者钳制，用原始 dims），按 D10.2 的规则（含算不算数、自家换代）排出持有者序列，再把 `SOTA_PRE` 放在最前面。
- **播种规则**（开局日 st）：
  - ★：同 org、同模态在 st 之前有过一枚算数的标签（`countedAt < st`）；
  - ○：只有同 org 的别的模态有过；
  - —：其余。

  `histLast` 取同 org、同模态在 st 之前最后一段持标区间的结束日（`until`）；开局时仍在持标则取 st。

**按 D3 修订后的数据算出的开局状态**（附录表 8）

| 公司 | y2023 | y2024 | y2025 | y2026 | 第一枚算数标签的依据 |
|---|---|---|---|---|---|
| gpt | ★ | ★ | ★ | ★ | ChatGPT（2022-11-30，SOTA_PRE） |
| image2 | ★ | ★ | ★ | ★ | DALL·E 2（2022-08 场地凑满，领先 SD 1.4 共 5.5 分） |
| midjourney | ★ | ★ | ★ | ★ | V4（2022-11 换手） |
| suno | — | ★ | ★ | ★ | Chirp v2（2023-11 换手） |
| elevenlabs | — | ★ | ★ | ★ | Eleven Multilingual v2（2023-11 场地凑满，领先 OpenAI TTS 21.75 分） |
| claude、fable | — | — | ★ | ★ | Claude 3 Opus（2024-03-04；fable 与 claude 同 org 同模态，按 `isMine` 算自家） |
| gemini | — | ○ | ★ | ★ | Lyria（音乐，2023-11 换手）；Gemini 1.5 Pro（2024-02-15） |
| grok | — | — | — | ★ | Grok 3（2025-02） |
| seed | — | — | ○ | ○ | Seed-TTS（语音，2024-06） |
| minimax | — | — | — | ○ | Speech-02（语音，2025-04） |
| llama | — | — | — | — | MusicGen 那一枚不算数：2023-06 它挂上标签，靠的是 Suno 的 Bark 副线凑满场地，领先 −2.5；3 个月后又被 Stable Audio 换走，从没挡住过挑战 |
| 其余 12 家：qwen、deepseek、kimi、glm、rwkv、ernie、mistral、perplexity、hunyuan、stepfun、novelai、jev | — | — | — | — | 从未持有 |

- 每个剧本带 ★ 的家数依次为 3、5、8、9；四个剧本全是 — 的共 13 家（含 llama）。
- 和 `sota-timeline.json` 对照，有 9 格不同，写进测试白名单 `SEED_DIFF`：
  - gemini y2024：○ 对 —（Lyria）；
  - gemini y2025：★ 对 —（Gemini 1.5 Pro，D3 已认定）；
  - image2 y2023：★ 对 ○（DALL·E 2，timeline 没有 2022 年的数据）；
  - seed y2025：○ 对 —（Seed-TTS）；
  - fable y2025、y2026：★ 对 ○（口径不同：同 org 同模态即自家）；
  - llama y2024、y2025、y2026：— 对 ○（MusicGen 那一枚不算数）。

#### D10.5 新闻与界面
- **新闻**：“最强易主：{新} 比 {旧} 高 0.4 分。”
  - 自家换代不发这条，只把角标转到新快照上；
  - 同一集团其他模态的换手只发新闻，没有任何效果。
- **模型卡、榜单、对手页**：金色“SOTA”角标；灰色“曾为 SOTA（2025-03 至 2025-05）”。场地凑满时挂上、还不算数的标签，角标照常显示，悬停说明“还没经过挑战”。
- **公司历程**：“我们的 SOTA 时刻”，包括开局前 `SOTA_HISTORY` 里本公司的记录。
- 主界面不加按钮。

#### D10.6 测试（`tests/career/sota.test.mjs`）
1. 换手规则：
   - 别家差不到 0.1 不换；同日多条按 q 从高到低处理；
   - 带 `S` 的发布不参与；
   - 场地不足 2 家时不挂；凑满 2 家时给当时最强的一款；
   - 自家新旗舰 q ≥ 自家现任就接过，不需要 EPS；
   - 开局继承的型号拿到标签，只设 `before`，不进 made，不弹卡。
2. 算不算数：
   - MusicGen（领先 −2.5）不算数，Eleven Multilingual v2（领先 21.75）算数；
   - 构造夹具：领先 1 分挂上的标签，挡住一款别家主线新发布的那天变成算数，并在那天补记 made。
3. `sotaWouldTake(s, q)` 与随后 `labelOnRelease(s, snap).got` 在 1000 个随机状态上一致（null 对应 false）。
4. `SOTA_HISTORY` 的链条：
   - LLM 链依次为：GPT-3.5（2023-02-15 场地凑满，算数）→ GPT-4（2023-03-14，自家换代）→ GPT-4 Turbo（自家换代）→ Gemini 1.5 Pro（2024-02-15）→ Claude 3 Opus → GPT-4o → Claude 3.5 Sonnet → o1-preview → Claude 3.5 Sonnet（新版）→ o1（2024-12-05）→ Grok 3（2025-02-15）→ Claude 3.7 Sonnet → Gemini 2.5 Pro → …；
   - 音乐链：MusicGen（不算数）→ Stable Audio → Chirp v2 → Lyria → …；
   - 语音链的第一枚是 Eleven Multilingual v2（场地凑满，算数）。
5. 24×4 的播种结果等于 D10.4 的表；和 `sota-timeline.json` 的差异只能是 `SEED_DIFF` 里的 9 格。
6. 运行时：
   - GPT y2023 开局后，LLaMA 在 2023-02-15 变为可见时，标签挂在继承来的 GPT-3.5 上，不弹卡；
   - ElevenLabs y2023 在第二家语音公司出现之前没有标签；
   - 玩 OpenAI 时，被钳制后的跟随者（D5）拿不到标签。

## 改动 18：在 §D10 之后新增 §D11

### D11. 市场期待（`sim/expect.js`、`data/expect.js`，P3.E）

放在 D 章末尾，因为它的输入是 D10 的标签和 D6 的差距，输出走发布流程，和 SOTA 放在一起更清楚。期待是**发布那一刻的一次性判定**，不做持续的好感度条（避开 0.3 已排除的 devEco）。

#### D11.1 期待档（发布时按顺序取第一个符合的）
1. **冠军**：`sotaMade(s)`，并且 `CHAMP_DECAY = 0` 或 `今天 − lastHeldDay(s) ≤ CHAMP_DECAY`（540 天）。
   - 市场期待新旗舰成为 SOTA。
   - 看的是事实（`s.sota`），不是 `g_sota` 节点。
2. **前冠军**：`sotaMade(s)`，但 540 天没再持过标签（例如 Grok y2026 在 2026-08-18 之后，Midjourney y2026 在 2026-01-23 之后）。
   - 市场期待“重回第一有惊喜，追得近就行”。
3. **小团队**：tier 为 small；或 tier 为 specialist、但从没炼出过 SOTA（例如 Suno y2023）。
   - 市场期待“做出一个能用的东西”。
4. **挑战者**：其余所有公司。
   - 市场期待留在第一梯队，或者明显追近。

#### D11.2 同类徽章（`badgesFor(s, snap)`，发布时判定，存进 `snap.badges`，之后不追踪转移）
共同前提：被别家老师污染的模型（`m.tainted && !m.untainted`，在开源权重上续训的也算）拿不到任何徽章。

| 徽章 | 判定（全部满足） |
|---|---|
| 开源最强 `open_top` | 开放权重（玩家：`snap.open` 且 `license ∈ {permissive, restrictive}`；对手：许可 LP 或 LR）；<br>底座不是续训来的（`m.lineage?.kind !== 'finetune'`）；<br>q > 可见开源发布（任意尺寸，含自家已发布）的最高 q + `OPEN_MARGIN` |
| 社区之选 `community`<br>（“对开源社区很有用的小模型”） | 开放权重（口径同上）；<br>总参 ≤ `COMM_MAX_TOTAL`（非 LLM：cls 不是 large）；<br>同量级（玩家按 `weightClass(总参)`，对手按 `r.cls`，frontier 并入 large）可见的对手开源发布累计 ≥ `COMM_FIELD` 款；<br>q ≥ 同量级可见开源最强（含自家）+ `COMM_MARGIN`；<br>q ≥ `distillBaseline(s, snap)` + `BASE_MARGIN` |
| 能干活 `works`<br>（“能用的工作模型”） | LLM 须已掌握 `func_call`；<br>主业两维（`strengths` 去掉 safety，不够两维时 LLM 用 code、agent 补齐）每一维 ≥ `bar_k`；<br>发布时 API、对话、订阅产品至少开着一个 |

```
bar_k = min( 一年前（今天 − WORKS_LAG）同量级可见发布的 dims_k 最高值,
             knowledgeCap(snap.total, WORKS_QUALITY) + KCAP_OFFSET(k) ) − WORKS_SLACK
```
- 同量级的口径同社区之选。非 LLM 按 cls 分，没有 knowledgeCap 那一项。
- 一年前同量级一款可见发布都没有时，不发这枚徽章。实际效果：2024 年 2–3 月以前，任何量级都拿不到。
- **门槛的意思**：一年前同尺寸最好的模型能干的活，你现在也能干；但门槛不超过这个尺寸用 1.6 档数据能装下的上限。所以每个尺寸都可达，要靠好数据练满。附录表 12 列出了 2024–2026 年四个小团队在 7B、14B、32B、70B 上的门槛和上限。
- **蒸馏基线**的作用：比“随手拿最强开源老师蒸一个同尺寸模型”高出 1 分，才算社区之选。这样同量级长期没有新发布时，也没法白拿。

#### D11.3 哪些发布要评
- **旗舰**满足以下任一条就评：
  - 开局后的第一款；
  - 换了底座；
  - 离上次被评的旗舰 ≥ `JUDGE_GAP` 天。
- **加评**：不满足上面三条时（60 天内、同一底座），先按 D11.4 试算。结果比上次被评那款更好（不及 < 略低 < 平淡 < 符合 < 超出），才加评；否则只发新闻。
  - 加评只升不降，所以结果只可能更好；
  - 加评照常发奖惩（受冷却限制），上一次的结果不撤回。
  - 例子：DeepSeek y2024 的 R1 比 V3 晚 25 天，V3 判“符合”，R1 试算“超出”，于是加评。
- **推迟判定**：发布时 `worldSota` 为 null（没有可见对手），或发布后场地仍不足 2 家，就先记 `s.expect.pending`。
  - 场地第一次凑满时，由 `judgeDeferred(s)` 评最新的那一款，x 和标签按那一刻算；
  - 推迟的判定不罚：算出“不及”或“略低”的，一律记为平淡。
- **小模型**：只对小团队档评，而且只评“超出”。
- **开局继承的型号**：不评。
- **同一快照只评一次**：重新开源旧版、改名再发都不评。

#### D11.4 判定
记号：
- `x = q − worldSota(s).q`，取发布前一刻，只算对手；同一天已经可见的对手发布算在内；
- `label` = 这一版发布后成了 SOTA 持有者；`holdAfter` = 发布后本公司持标（标签可能还在自家旧快照上）；
- `ownHolderQ` = 发布前自家持标快照的 q（不持标时为 −∞）；
- `prev` = 自家上一款同角色已发布快照的 q；
- `last` = 上一次被评的旗舰（含它当时的 x）；
- 倒退 = `q < prev − REGRESS`。

| 档 | 超出 | 符合 | 平淡 | 不及 |
|---|---|---|---|---|
| 冠军 | `label`，且 `q − max(worldSota.q, ownHolderQ) ≥ CHAMP_LEAD` | `holdAfter`，且（`label` 或 `q ≥ ownHolderQ − REGRESS`） | — | 其余。`x ≥ −NEAR_MISS` 且没有倒退时算“略低”，惩罚减半 |
| 前冠军 | `label` | `x ≥ −NEAR_MISS`；或 `x − last.x ≥ CLOSE_BY` | 其余 | 只有倒退 |
| 挑战者 | `label`；或 `open_top` 且 `x ≥ −OPEN_NEAR`；或 `x ≥ −CHAL_NEAR` | `x ≥ −BAND[tier]`；或 `open_top`；或 `x − last.x ≥ CLOSE_BY` | 这家公司的第一款被评旗舰达不到“符合”时 | 其余；倒退一律算不及 |
| 小团队 | `label`、`open_top`、`community`、`works` 任一（`works` 每 `WORKS_COOL` 天只算一次） | 首发；或 `q ≥ prev + SMALL_UP` | 其余 | 倒退 |

- `BAND = { frontier: 2, bigtech: 4, major: 5, specialist: 4 }`。中间档的期待是“离最强 5 分以内”，追近也算数。
- **冠军和前冠军的交界**：同一款发布放在 540 天前后，结果只会在“不及 / 略低”和“符合 / 平淡”之间变，不会跳成“超出”，因为两档的超出都必须拿标。
- **防降低期待刷分**：冠军、前冠军、挑战者的旗舰一旦倒退，直接算“不及”，不享受“略低”。

#### D11.5 奖惩（`data/expect.js` 的 `EXPECT_FX`，全部走 `applyEffects`，`ctx.source = 'release'`）

| 档 | 超出 | 符合 | 不及（“略低”减半） |
|---|---|---|---|
| 冠军 | `brand ×1.06`，`rep +2`，`valuation ×1.06`，`stockShock {self:+0.06}` | `brand ×1.02`，`rep +1` | `brand ×0.96`，`rep −3`，`valuation ×0.93`，`stockShock {self:−0.08}` |
| 前冠军 | 同冠军的超出 | `brand ×1.02`，`rep +1` | 同挑战者的不及（只有倒退才会出现） |
| 挑战者 | `brand ×1.10`，`rep +3`，`valuation ×1.10`，`stockShock {self:+0.06}`；记 `s.expect.hot` | `rep +1` | `rep −2`，`valuation ×0.96`，`stockShock {self:−0.04}` |
| 小团队 | `brand ×1.12`，`rep +4`，`valuation ×1.10`；记 `s.expect.hot` | `rep +0.5` | `rep −1` |

“平淡”没有任何效果。

**正面效果按新鲜度打折**：乘以 `releaseFreshness(s)`。
- 乘法量按 `1 + (x − 1) × fresh`；
- 加法量直接 `× fresh`；
- 负面效果不打折。

**“减半”的算法**：乘法量按 `1 + (x − 1) / 2`，加法量直接 `/ 2`。

**冷却**：
- 同一档的“超出”数值奖励，`COOL` 天内只给一次；
- “不及”的数值惩罚，`COOL` 天内最多一次；
- 冷却期内只写结果行和新闻。

**集团内团队**（bigtech、gemini）：
- `valuation`、`raise` 由 `applyEffects` 自动忽略；
- `stockShock.self` 取母公司代码，幅度减半。

#### D11.6 融资回报（经营事件，P2.3；月结检查，不占发布钩子的弹窗预算）
- **`ev_hot_round`“投资人上门”**：
  - 出现条件：cond `{all:[{expectHot:true}, {canRaise:true}]}`，再加事件自带的冷却 `ROUND_COOL` 天。
    - `expectHot`：`s.expect.hot` 在 `HOT_WINDOW` 天内；
    - `canRaise`：公司 kind 为 private、没上市（`!s.capital.listed`）、没有进行中的融资轮、没有 `blocks:['funding']` 特质。口径和 `fundingOffers`（game.js:883）一致。
  - 选项：
    - “接：按新估值出让 8%”：`{valuation:1.1, raise:0.08}`，不掷骰；
    - “先不融”：`rep +1`。
  - 小团队一次“超出”，估值最多涨到原来的 1.10 × 1.10 = 1.21 倍。
  - 已上市公司的“超出”只走 `stockShock`，不会出现这个事件。
- **`ev_group_budget`“集团追加预算”**（集团内团队专用）：
  - 出现条件：cond `{all:[{expectHot:true}, {kind:'division'}]}`，冷却同上。
  - 效果 `cashOfStart +0.06`。没有选项，只进新闻。

#### D11.7 接到现有系统
- **发布品牌**：`doRelease` 原来的品牌分支（game.js:654-656，1.15 / 1.04）改为固定 `brand ×= 1 + 0.04 × releaseFreshness(s)`，再叠加 D11.5，避免重复奖励。“小模型开源 +6%”保持不变。
- **董事会**：不改。不加新的目标类型，也不改文案。榜单目标查的是竞技场排名，和期待档无关。
- **年终评级**：不改。口碑和资本两项已经吸收了期待的影响。
- **boldClaim**：只按 D1 改用 `gapOf`，不并入期待。
- **超事件**：`super_sota` 改为用标签判定（E4）。

#### D11.8 防刷汇总
1. 同一快照只评一次；60 天内的小版本只有结果更好才加评。
2. 标签和徽章只看 `qOf(dims)`。
3. 被污染的模型（含续训来的）拿不到任何徽章；被污染的模型按 D7 永远拿不到 SOTA 标签。
4. 社区之选必须高出同尺寸蒸馏基线 1 分。
5. 冠军、前冠军、挑战者发布倒退版本，直接算“不及”。
6. 奖惩各有 180 天冷却；`ev_hot_round` 365 天最多一次。
7. 推迟判定不罚，但也只评一款。

#### D11.9 界面与文案
主界面不加按钮。

**发布面板加一行预告**（`expectPreview(s, m)`，按当前分数假设立即发布）：
- 冠军档：“市场期待：新的世界第一。按现在的水平拿不到（差 0.8），会略低于预期。”
- 前冠军档：“市场期待：重回第一有惊喜。按现在差 0.6，符合预期。”
- 挑战者档：“市场期待：离最强 5 分以内。按现在差 3.2，符合预期；开源的话还能拿‘开源最强’。”
- 小团队档：“社区之选：还差 1.6 分｜能干活：代码差 2，Agent 已达标。”
- 场地不足：“这个领域还没有对手，等第一家对手出现时再评。”

**发布结果卡加一行**：“市场反应：超出预期。开源，而且离最强只差 1.8。”后面跟 `describeEffects` 生成的变化说明。

**文案示例**：
- 冠军不及：“大家等的是新的世界第一，它只排第二。股价跌了 8%。”
- 前冠军符合：“没能重回第一，但已经贴得很近，老用户松了口气。”
- 挑战者超出：“开源，而且几乎追平世界最强。开发者在刷屏，投资人在排队。”
- 小团队超出：“社区把你们的 7B 当成了新的默认底座，三家基金发来了邮件。”
- 能干活：“有客户把它接进了工作流，说‘够用了’。”

**榜单、对手页**：“开源最强”“社区之选”“能干活”小标签，点开在原位展开说明。

#### D11.10 状态与接口
```js
export function initExpect() { return { lastJudged: { flagship: null, small: null }, cool: {}, hot: null, worksDay: null, pending: null, log: [] }; }
// lastJudged.flagship / small: null | { modelId, day, q, x, gen, result }；log 最多 LOG_MAX 条
export function judgeRelease(s, snap, lab)   // lab = labelOnRelease 的返回值 → 写 snap.expect，返回它
export function judgeDeferred(s)             // 场地第一次凑满时由 loop.js 调用
export function expectPreview(s, m)          // → { tier, result, x, need, badges, text } | null
snap.badges = ['open_top', …]; snap.expect = { tier, result: 'over'|'meet'|'flat'|'under'|'under_half'|null, why, rejudge: bool };
```
- 上面四个函数都由 P0.3a 的存根先导出：`initExpect` 返回上面的结构，其余返回 null 或空结果。P3.E 只替换实现，不改签名。
- `s.expect` 由 `createGame` 的 `initExpect` 钩子和 E8 的结构步骤写入。P3.E 的函数里统一先写 `s.expect ??= initExpect()`。

#### D11.11 测试（`tests/career/expect.test.mjs`）
**史实夹具**（D3 修订后的数据，x 相对当时的对手最强，同一天先可见的对手发布算在内；附录表 10）：

| 发布 | 剧本与档 | 情况 | 结果 |
|---|---|---|---|
| DeepSeek-R1 | y2025 挑战者 | 开局后第一款；开源最强，x = −1.82 | 超出 |
| DeepSeek-R1 | y2024 挑战者 | V3（2024-12-26）判符合；25 天后 R1 试算超出 → 加评 | 超出 |
| Qwen3-235B-A22B-2507 | 挑战者 | 开源最强，x = −1.74 | 超出 |
| Qwen2.5-72B | 挑战者 | 开源最强，x = −3.76 | 符合 |
| Llama 3.1 405B | 挑战者 | 开源最强，x = −5.60 | 符合 |
| Kimi K2 | 挑战者 | x = −3.44 | 符合 |
| GLM-4.5 | 挑战者 | x = −2.32 | 符合 |
| Llama 4 Maverick | 挑战者 | x = −14.82（同日的 o3 先可见） | 不及 |
| GPT-4o | 冠军 | 拿标，领先 1.14 | 超出 |
| GPT-4 Turbo | 冠军 | 自家换代接标，比原持标款高 3.4 | 超出 |
| GPT-4.5 → o3 | y2025 冠军 | GPT-4.5 x = −7.62 判不及；47 天后 o3 拿标，领先 0.60 → 加评 | 不及 → 符合 |
| Claude 3 Opus | y2024 挑战者 | 拿到标签 | 超出 |
| Grok 4 | 冠军（Grok 3 只持标 9 天） | x = −1.32 | 不及 |
| Grok 4.7 | 前冠军（2026-09-21） | x = −2.56 | 平淡 |
| Eleven Multilingual v2 | y2023 小团队 | 推迟到 2023-11-15 场地凑满；拿标 | 超出 |

**其他用例**：
- 四档 × 各种结果各有正反用例；
- 冷却生效；集团内团队不改估值；已上市公司不出现 `ev_hot_round`；同一快照只评一次；
- 冠军与前冠军交界：同一发布在 `CHAMP_DECAY` 前后 ±2 天，结果不会从“不及 / 略低”变成“超出”；
- 加评：60 天内结果不比上次好时不评；更好时加评，上次的结果不撤回；
- 推迟判定：GPT y2023 在 LLaMA 出现前发布的旗舰不罚，2023-02-15 补评；
- 冠军自家小幅升级：自家持标款 90、对手最强 88 时，新旗舰 90.05 接标，判符合；89.95 判符合（本公司仍持标）；89.85 判不及（倒退）；
- 徽章：
  - 社区之选在被污染或低于蒸馏基线时不给；
  - 开源最强：rwkv y2025 续训 DeepSeek-R1 加蒸馏 Claude 3.7 Sonnet，练到 80 分，也不给；
  - 能干活：要求 `func_call`；一年前同量级为空时不给；
- 枚举：每个小团队 × 剧本，至少存在一种“尺寸 + 数据档”组合，在剧本内能拿到 `works` 或 `community`；
- `expectPreview(s, m).result` 等于紧接着发布时 `judgeRelease` 写进 `snap.expect.result` 的值（1000 个随机状态）。

## 改动 19：§E1、§E2、§E3、§E4、§E8

**E1**
- `ctx.source` 的取值加上 `'release'`。
- 替换 `stockShock` 一行：

| stockShock | {NVDA:-0.15} / {self:+0.06} | 一律累加。`self` 指玩家自己：已上市的取自家代码；集团内团队取母公司代码，幅度减半；两者都没有就忽略 |
|---|---|---|

**E2**
- 在表格末尾新增三行：

| sotaMade: true \| 'first' | true：开局前或开局后拿到过算数的 SOTA 标签（`sotaMade(s)`）；`'first'`：开局后才第一次拿到（`made.length > 0 && !before`），给 `ms_first_sota` 用 |
|---|---|
| expectHot: true | `s.expect.hot` 在 `EXPECT.HOT_WINDOW` 天内（D11.6） |
| canRaise: true | 公司 kind 为 private、没上市、没有进行中的融资轮、没有 `blocks:['funding']` 特质（D11.6） |

- ModelCond 子键追加：
  - `sota: true`，按场合分三种语义：
    - 在 release 钩子里：这一版发布后是 SOTA 持有者，读 `snap.sota`；
    - 在授名检查（`nameGrantCheck`、`beforeRelease`）和 `expectPreview` 里：`sotaWouldTake(s, qOf(dims))`；返回 null（发布后场地仍不足）时，回退成 `lead:0`，即 `q ≥ worldSota.q`，没有可见对手时视为成立；
    - 用于 live 时：当前持标。用于 working 时同授名检查的语义。
  - `badge: 'open_top' | 'community' | 'works'`：只在 release 钩子里可用，读 `snap.badges`。
- 两者都要配 condWhy 文案，例如：“这一版拿到 SOTA 标签（当前：离最强还差 0.8）”；“拿到‘社区之选’（当前：比同量级开源最强低 1.2）”。

**E3**：替换最后一行。

| strategySpeed / slots / sotaEase / releaseGapDays / cap.<dim> | 加 | strategy.js；research.js `researchSlots`；model.js `hardness`（通过 postPreview、applyGains 生效；`s.strategy` 不存在时按 D6.2 回退）；release.js `releaseBlock`；model.js `computeCaps` |
|---|---|---|

`frontierEdge` 删除。

**E4**
- 替换“不重叠的规则”中 `super_sota` 那半句：

  `super_cn_first` 并入 `super_sota`，作为中国公司的文案变体。`super_sota` 的条件是以下全部成立：
  - 玩家旗舰持有算数的 SOTA 标签满 30 天；
  - 领先 worldSota ≥ 1.0；
  - 这款快照是开局之后发布的；
  - 这个模态至少有 3 家对手发布过。

- 在“不重叠的规则”末尾追加：
  - milestone 新增 self 型 `ms_first_sota`：
    - `on: ['release','month','rival']`，cond `{sotaMade:'first'}`，效果 `know +20`。加上 `rival`，是因为“挡住挑战后才算数”发生在对手发布的那天；
    - 文案：“从今天起，世界上最强的{模态}模型是我们的 {model}。”
    - 被同一钩子里优先级更高的卡挤掉时，下个月结补弹。
  - event 新增 `ev_hot_round`、`ev_group_budget`（D11.6）。
  - 市场期待（D11）的结果不是事件，不占弹窗预算，只写在发布结果卡和新闻里。

**E8**：替换“特性步骤”中 `sota`、`milestones`、`strategy` 三条，并在结构步骤末尾追加一条。
- **结构步骤**（P0.3a 的 `migrate.js`）末尾：`s.expect ??= initExpect()`。旧发布不补评。
- **`sota`**（P1.1）：
  - 给已发布模型补 `releasedDay`（缺的用月份 + 15 日）；
  - 按存档日期计算 `s.world.adj`；
  - `ms` 账本补 `modelId`；
  - 建 `s.sota`：
    - 按 D10.4 设 `seed`、`before`、`histLast`；
    - 再把存档日之前可见的对手主线发布和玩家已发布的旗舰，按日期回放一遍 D10.2 的规则，补上 `holder`、`log`、`made` 和各快照的 `m.sota`。
- **`milestones`**（P1.4）：除原有内容外，`cond(s, {sotaMade:'first'})` 为真时，静默记账 `ms_first_sota`，不弹卡。
- **`strategy`**（P2.2）：
  - `initStrategy` 预完成存档日期之前的史实节点，`cur` 为空；
  - 按 A4.7 第 0 步播种特质；
  - `sotaMade(s)` 为真、而且 `g_sota` 还没完成时，才 `completeNode('g_sota','bypass')`，并去掉 rookie、kin 特质；
  - 入队一条 notice：“公司策略上线了”。
- 特质在存档里只存 id，数值来自数据。旧特质里的 `frontierEdge` 随数据一起消失，不用另外迁移。
- **迁移测试**追加三条（6 份 v3 夹具各跑一遍）：
  - 迁移后的 `holder`、`log` 与“同日 createGame 加回放”的结果一致；
  - `g_sota` 已完成，当且仅当 `sotaMade(s)`；
  - 迁移后推进 60 天，不弹 `ms_first_sota`。

## 改动 20：§F1、§F2、§F3、§F4、§F5

**F1**：替换第四行。
```
  ─→ P3.D ─→ (P3.1 ∥ P3.T-×22 ∥ P3.U1 ∥ P3.U2 ∥ P3.U3 ∥ P3.U4 ∥ P3.E) ─→ G3
```

**F2**：替换下列各行，并新增 P3.E 行。表后“**中**”一行追加 P3.E。

| **P0.3a 接缝**（指纹不变） | 设计重 | 新建 `sim/{effects,cond,modifiers,sota,route,strategy,strategy_ai,exclusive,expect}.js`（后六个是存根；`sota.js` 用旧算法做过渡实现，`sotaWouldTake` 暂时返回 null；`expect.js` 按 D11.10 导出 `initExpect` 和三个空函数）、`sim/migrate.js`、`sim/migrations/**`（结构步骤框架和 6 个空特性存根）、`data/{balance,routes,strategy_core,spirits,credits,expect}.js` 存根、`data/companies/**`（24 个导出 null 的存根、4 个通用树存根、index）、`ui/views/index.js`；修改 `sim/loop.js`、`release.js`、`game.js`、`queue.js`，只加钩子和 `registerKind` | **钩子**：<br>`tickDay` → `strategyTick`、`routeTick`；<br>`monthClose` → `exclusiveMonth`、特质到期；<br>`doRelease` → `beforeRelease` → 建快照 → `labelOnRelease` → `judgeRelease` → `afterRelease`，顺序固定；<br>`loop.js` 的对手发布 → `labelOnRival` → `judgeDeferred`；<br>`createGame` → `initSota` → `initExpect` → `initRoute` → `initStrategy` → `initNaming`。<br>`applyEffects` 先接管语义完全相同的几处。<br>**词表一次登记全**：E1 的 `source:'release'`、`stockShock.self`；E2 的 `sotaMade`、`expectHot`、`canRaise`、ModelCond 的 `sota`、`badge`；E3 的 `sotaEase`（不登记 `frontierEdge`）；事件选项 schema 的 `distill`；节点 schema 的 `auto`。<br>balance.js 按 §1.3 一次写全 | 词表测试（数据里所有 effects、cond、mods 的键都在词表内）；`applyEffects` 和 `cond` 每个键都有正反用例，`why` 是中文，新叶子读不到 `s.sota`、`s.expect` 时按 false 处理；`modifier(s,'train')` 等在 50 个随机状态上和旧的 `techMult` 一致；只有允许的三个文件调用 `setStance` 的静态测试；**指纹不变** |
|---|---|---|---|---|
| **P1.1 SOTA 与对手数据** | 先做数据提交（机械），再做 `sota.js` 和调用点（设计重）；**单独先跑** | `data/rivals.js`、`data/release_days_{gen,overrides}.js`、`scripts/{build_release_days,sota_report}.mjs`、`sim/sota.js`、`data/core.js`（COMPANIES 加 `org`；gemini 家族加 gemma；agent 维度改为 `needTech`）；修改调用点：`sim/{milestones,model,economy,release,reputation,super,data_ops,research,loop,game}.js`（只限 SOTA、可见性、开局阵容、标签换手、boldClaim 检查相关的行）、`sim/migrations/sota.js`、`tests/career/{sota,rivals}.test.mjs` | D1–D5、D10 全部：<br>`s.sota`、换手、算不算数、自家换代、`sotaWouldTake`、`SOTA_HISTORY`、`SOTA_PRE`、`histOther`、`ownHist`、`tempAnchor`、`anchor`、`anchorEnv`、`sotaMade`、`lastHeldDay`、`initSota`；<br>删除 `frontierRef` | D4、D10.6 全部通过；`sota_report` 逐月打印 SOTA 持有者（`--labels` 打印标签链和 counted），四个模态在全部行在场时违规为 0；D5 的钳制测试；DeepSeek y2025 的在线模型是 V3 |
| **P1.2 难度曲线、上限与蒸馏** | 设计重 | `sim/{model,focus,projects,data_ops}.js`（P1.1 之后）、`data/datasets.js`、`ui/panels/train.js`、`ui/pages/{data,distill_form}.js`、`sim/migrations/distill.js`、`tests/career/{distill,caps,curve}.test.mjs` | D6–D8：<br>`hardness`（含 ρ 回退）、`applyGains`（含第 0 步和分段）、`postPreview` 的混合系数、`birthClamp`、`previewDistill(s, cfg, {quality})`、`distillBaseline`；<br>`cleanStreak` 和炸炉计数、续训项目、“只用自有数据”开关、老师和差距显示；<br>训练面板的状态行和冲顶力四根条；蒸馏表单的上限说明 | D9 全部；审计 3.4 的每个复现用例都变成测试并通过 |
| **P1.4 里程碑与弹窗预算** | 中 | `sim/{milestones,super,queue,milestone_view}.js`、`data/{milestones,super}.js`、`data/milestones_gen.js`（只用 `--only` 重新生成约 15 条）、`content/milestones/**`、`scripts/build_milestones.mjs`、`sim/migrations/milestones.js`、`tests/career/milestones.test.mjs` | 门槛改用 `atLeast`、`gap`、`rank`（例如 `ms_gpt4 → atLeast GPT-4 −0.5`、`ms_open_commercial → Llama 2 70B`、`ms_small_strong → Mistral 7B`、`ms_open_frontier → Llama 3.1 405B`；`ms_million_ctx` 和 `ms_trillion_open` 改看对手 tags 里的 C、T）；<br>新增 `ms_open_reasoning_frontier`、`ms_first_sota`；<br>`super_sota` 改用标签判定；<br>里程碑选项标注 `distill: true`；<br>`fire()`、弹窗预算、`supersedes`；超事件清理 | 没有玩家干预时，每个“行业第一次”的归属 org 等于现实持有者；QwQ-Preview 只拿到 `ms_open_reasoning`；开局首月不触发超事件；同一个钩子最多一张卡片；开局就是 ★ 的公司不触发 `ms_first_sota`；E8 迁移测试第 3 条 |
| **P2.2 策略引擎** | 设计重 | `sim/{strategy,strategy_ai,exclusive,advisor,bot}.js`、`data/{strategy_core,spirits}.js`、`data/companies/{index,_schema}.js`、`sim/migrations/strategy.js`、`scripts/strategy_sim.mjs`、`tests/career/{strategy,trees}.test.mjs` | A1–A6、A10、C4 的引擎部分；树校验器（含 `auto`、禁止 omit `g_sota`、必须有 base 分支）；<br>`g_sota` 和 maker、kin、rookie 三个特质；A4.7 第 0 步；<br>`gs_self_built`、`g_self_reliant` 改用 `sotaEase`；<br>`wantsDistill`、`shouldHold`（按 D11.10 的存根接口写）、机器人补数据规则、resolveAll 的 `distill` 规则 | 同一时间只有一项；搁置 30 天；暂停和永久失效；AND/OR 前置、互斥、绕过；`auto` 节点不能手动开始；路线冷却；路线连通性；播种规则；没有随机数、结果可复现；24×4 的开局状态合法，第 0 步结果等于 D10.4 的表；拿到第一枚算数标签的次日 `g_sota` 以 bypass 完成；顾问建议都可执行；机器人不选 `ai.never` 节点；sotaMade 为真的机器人从不蒸馏；`shouldHold` 用构造的 `expectPreview` 返回值测正反用例。**指纹变更登记**：ρ 改由特质提供（数值与 P1.2 的回退相同） |
| **P2.3 日期抉择与经营事件** | 机械 | `data/events.js`、`sim/events.js`（P1.3 之后）、`tests/career/events.test.mjs` | E5 全部；`CASES.tos` 带上厂商参数；`license_fork` 新选项；`ev_hot_round`、`ev_group_budget`（D11.6）；事件选项标注 `distill: true` | 全库搜不到日期抉择；价格战只在满足条件时弹，正文不点玩家自家；用构造的 `s.expect.hot` 测：`ev_hot_round` 只在 45 天内、`canRaise` 时出现，365 天最多一次；已上市公司不出现；集团内团队只会出现 `ev_group_budget` |
| **P3.E 市场期待**（新增） | 中 | `sim/expect.js`、`data/expect.js`、`tests/career/expect.test.mjs`；修改 `sim/release.js`（只改发布品牌那三行） | D11 全部：期待档、`badgesFor`、`judgeRelease`、`judgeDeferred`、`expectPreview`、冷却、加评、推迟判定。只替换 P0.3a 存根的实现，不改签名 | D11.11 全部通过；在真实 `judgeRelease`、`expectPreview` 下，顾问和机器人的 `shouldHold`、`ev_hot_round`、`ev_group_budget` 的用例通过；`expectPreview` 与随后的判定一致。**指纹变更登记**：机器人发布时机 |
| **P3.U2 命名界面** | 机械 | `ui/panels/{release,release_name,train}.js`（train 只动命名相关，状态行归 P1.2）、`ui/pages/project_form.js`、`ui/bench.js`（只加结果卡上的“市场反应”一行）、`css/naming.css` | 名字输入和实时校验；“使用史实型号名”勾选和条件 ✓/✗；代号输入；开源一行按路线规则只读或可选；去掉 app.js:446 的正则；发布面板的期待预告行和结果卡上的“市场反应”行 | 不合法的名字当场提示原因；授名条件逐条显示当前值；有预告、无预告（存根返回 null）、有结果、无结果四种情况都能渲染、不抛错 |
| **P3.U4 董事会与公司历程** | 机械 | `ui/pages/{board,history,model,boards,rivals}.js`（后三个只加角标、徽章和“曾为 SOTA”）、`css/history.css`、`data/goals.js`（只改文案和常量） | E6；SOTA 金色角标（含“还没经过挑战”的说明）、“曾为 SOTA”、三枚徽章；公司历程的“我们的 SOTA 时刻” | 全仓库“里程碑”只有一个含义；董事会文案从常量生成；24 家公司的模型页、榜单页、对手页在有、无标签和徽章时都能渲染 |
| **P4.2 校准** | 设计重 | `data/balance.js`、`scripts/calibrate.mjs`、`data/routes.js`、`data/companies/*.js` 和 `data/expect.js` 里的数值字段、`docs/NEXT.md` | calibrate 新增指标（F4 全部），并输出附录表 9、表 11 的同口径版本，只调数值。顺序固定：<br>① 先抬整体节奏（TRAIN_PACE、底座缩放），让“★·LLM·frontier 机器人拿到标签”进入目标区间；<br>② 再调 CURVE、SOTA_EASE、EFFORT；<br>③ 最后调 EXPECT 和 EXPECT_FX | F4 全部达标 |

**F3**：替换第二、三行，并新增两行。

| P0.3a → P1.1、P2.2、P2.3、P3.E、P3.U2、P3.U4 | 期待接口（存根，签名以 D11.10 为准）：`initExpect()` 返回的 `s.expect` 结构；`judgeRelease(s, snap, lab)`；`judgeDeferred(s)`；`expectPreview(s, m)` 返回 `{ tier, result, x, need, badges, text } \| null`；`snap.expect`、`snap.badges` 的取值 |
|---|---|
| P1.1 → P1.2、P1.3、P1.4、P2.1、P2.2、P3.E | `worldSota`、`sotaAt`、`sotaWouldTake`、`anchor`、`anchorEnv`、`histOther`、`ownHist`、`tempAnchor`、`SOTA_HISTORY`、`sotaMade`、`lastHeldDay`、`gapOf`、`s.sota`、`familyBest`、`relDims`、`r.tags`、`r.day`、`isMine`（`frontierRef` 删除） |
| P1.2 → P2.1、P2.2、P3.E | `m.train`、`m.cleanStreak`、`m.tainted`、`m.lineage`、`m.techs`、`m.teacher`、`m.releasedDay`、`applyGains`、`hardness`、`distillBaseline`、`previewDistill(s, cfg, {quality})` |
| P3.E → 无 | 只替换 P0.3a 存根的实现，不新增接口 |

**F4**：替换全文。

### F4. 平衡目标（P4.2 验收；calibrate 每个剧本跑 96 局，机器人和大按钮各一遍）

| 指标 | 目标 |
|---|---|
| 被污染模型 `q ≤ worldSota(s).q − APPROACH + 1e-9` | **每天成立**（硬不变量，机器人和大按钮都是；没有可见对手的日子跳过） |
| 被污染的快照拿到 SOTA 标签 | **0** 次 |
| 机器人完成 `g_beyond` 或解除污染的次数 | **0** |
| 跟随者对手的 `qOf(relDims)` 超过 `pushEnvelope − 1.0` | 0（测试保证） |
| 蒸馏模型离 SOTA 的距离 | 始终 > 0（测试保证） |
| 机器人评级分布 | S+A ≤ 12%；C–E ≥ 55%；F+G ≤ 12%；撤换 ≤ 8%（v0.9 基线是 S1/A9/B18/C23/D26/E10/F6/G3，撤换 7） |
| 大按钮评级分布 | S+A ≤ 20%；B–D ≥ 60%；撤换 ≤ 6%（基线 S2/A13/B25/C37/D7/E10/F0/G2，撤换 4） |
| 机器人开局后拿到过算数标签的局（按播种档 × 模态 × tier 分桶） | ★·LLM·frontier（gpt 全剧本；claude、fable、gemini y2025 起）：25–70%<br>★·LLM·非 frontier（grok y2026）：≤ 15%<br>★·非 LLM（image2、midjourney 全剧本；suno、elevenlabs y2024 起）：40–90%（依赖 A10 补数据规则，见附录表 9）<br>—·非 LLM（suno、elevenlabs y2023）：≥ 30%（史实里它们本来就是先行者）<br>○/—·LLM·frontier（claude、fable、gemini y2023–y2024）：≤ 30%<br>○/—·LLM·bigtech、major：≤ 5%<br>small：≤ 1% |
| 大按钮开局后拿到过算数标签的局（同样分桶） | ★·LLM·frontier：35–80%；★·非 LLM：50–95%；○/—·LLM·frontier：10–50%；○/—·LLM·bigtech、major：≤ 10%；small：≤ 2% |
| 首次 / 再次拿标耗时比（curve.test 夹具：前沿全力，从差 3 到拿标） | 1.5–2.5（初值：玩家 1.66，机器人 2.22） |
| 机器人领先第二名 ≥ 3 分的天数（不计史实里本公司当天也领先 ≥ 3 分的日子） | ≤ 2% |
| 护栏：大按钮的 q 比 `max(histOther, 自家真实主线截至当天)` 高 3 以上的天数 | ≤ 5% |
| 期待判定（机器人，按被评发布计） | 冠军、挑战者：“超出”“符合及以上”“不及（含略低）”三个合并比例，与附录表 10 的 LLM 史实分布相差 ≤ 15 个百分点（史实：冠军 35% / 70% / 30%；挑战者 6% / 58% / 29%）<br>前冠军：不及 ≤ 10%<br>小团队：≥ 10% 的局至少超出一次（大按钮 ≥ 30%）；平均每年超出 ≤ 1 次；每个小团队 × 剧本至少有一条可达的超出路径（expect.test 枚举） |
| 授名率（机器人史实模式） | DeepSeek y2025 的 R1 ≥ 60%；DeepSeek y2024 的 R1 25–60%；GPT y2023 的 GPT-4 ≥ 60%；所有剧本内可达的授名平均 35–75% |
| 策略 | y2023 每局完成 18–30 项；空闲天数 ≤ 15%（y2023）、≤ 10%（其他剧本） |
| 路线 | 终局路线与史实吻合 ≥ 80%（按公司 × 剧本计）；GPT、Claude 在机器人局里从不走到 open_restricted 或 open |
| 开源推理 | DeepSeek y2024：玩家 2024-11-28 前没有发布开源推理模型的局里，`ms_open_reasoning` 归 QwQ 的比例 ≥ 95% |
| 弹窗 | 每个游戏月平均需要处理的卡片 ≤ 1.5；同一天 ≤ 1 张 |
| 性能 | 一局机器人全程 ≤ 400 ms；`advise()` 单次 < 2 ms（`hardness`、`anchor` 按天缓存） |

**现状**（附录估算，供 P4.2 参考）：
- ★·LLM·frontier 机器人：约 27%，补数据后约 36%（表 6）；
- ★·非 LLM 机器人：不补数据时必为 0%（表 9，F = 0）；
- 冠军档机器人的“不及（含略低）”：真实 SOTA 线下为 67–92%，台阶前沿下为 15–25%（表 11）。真实线涨得太快，是这一项的主要原因。

**F5**：追加三条。
- **整体节奏比曲线更关键**。真实 SOTA 线 2024–25 年每年涨约 10 分。附录表 6：有没有难度曲线，前沿全力玩家一年内拿到标签的比例都在 67–70%。表 11：同一个机器人，真实线下冠军档“不及”占 64–79%，换成每月 +0.4 的台阶前沿只剩 0–11%。所以 P4.2 必须先抬节奏，再调曲线和期待。
- **播种口径**以游戏数据为准，和研究表有 9 格差异，由 `SEED_DIFF` 白名单和交叉测试兜底。以后改 rivals.js 的数值时，要同步重跑。
- **冲顶力的数据项依赖机器人买数据的习惯**。真实机器人在垂直模态里的自有后训练数据长期停在最低档（表 9），所以 A10 加了补数据规则。改机器人买数据的规则时，要重跑表 9。

---

## 附录 A：数值模拟

**脚本**：`/private/tmp/claude-501/-Users-mac-Documents/bdd54aa1-c186-4792-85a8-72ab1d964b53/scratchpad/sota2/final/`

| 文件 | 内容 |
|---|---|
| `curve.mjs` | 本稿的公式和常量，与 §1.3、D6.2 一一对应（含 `anchorOf` 的自家史线规则） |
| `data.mjs` | 按 D3 修订载入全部真实发布；算标签链（含算不算数、自家换代）、别家史实线、自家史线、临时锚、播种表 |
| `sim.mjs` | 逐日模拟一条旗舰线（含“领先”判定、场地凑满、发布时机规则） |
| `arch.mjs` | 典型公司的参数 |
| `run.mjs` | 表 0–8 和自检 |
| `expect.mjs` | 表 10–12：史实夹具、机器人期待分布、“能干活”门槛 |
| `botA.mjs` | 表 9：只读调用真实引擎和 `tests/helpers/career_bot.mjs`，跑 24 家 × 4 剧本的第一年，按 D6.2 公式算 A、F |

**运行**：
```
cd /private/tmp/claude-501/-Users-mac-Documents/bdd54aa1-c186-4792-85a8-72ab1d964b53/scratchpad/sota2/final
node run.mjs          # 约 3 秒
node expect.mjs       # 约 2 秒；加 -v 打印逐条判定
node botA.mjs         # 约 2 秒；加 full 打印 96 行明细
```
- 脚本只读 import `data/core.js`、`data/rivals.js`、`data/datasets.js`、`sim/model.js`、`engine.js`、`tests/helpers/career_bot.mjs` 和 `docs/research/timeline-2023-2026.json`，不写任何文件。
- 涨分速度沿用 curve 方案按真实引擎校准过的口径：每天缩小 cap 差距约 0.6–0.9%。

**表 0：D6.2 参考值**：见 D6.2 的表。

**表 1：静态夹具**
- 设定：对手线固定在 80，起点差 10，cap 等于对手线 + 12，不换底座。
- 数字是 8 个种子的中位天数；“末差”是第 1200 天离对手最强的差。

| 类型 | A | F | 差 3 | 差 1 | 拿标（+0.1） | +0.5 | +1 | +3 | 末差 |
|---|---|---|---|---|---|---|---|---|---|
| 前沿·炼出过·玩家全力 | 1.50 | .85 | 110 | 163 | 202 | 216 | 251 | 570 | +4.24 |
| 前沿·炼出过·机器人 | 0.90 | .69 | 135 | 195 | 243 | 264 | 309 | 757 | +3.76 |
| 前沿·炼出过·机器人 | 0.60 | .34 | 136 | 199 | 265 | 316 | 397 | ∞ | +2.86 |
| 前沿·集团出过（○）·玩家全力 | 1.50 | .52 | 124 | 186 | 240 | 255 | 281 | 609 | +4.20 |
| 前沿·没炼出过·玩家全力 | 1.50 | .34 | 135 | 213 | 288 | 313 | 338 | 666 | +4.12 |
| 前沿·没炼出过·机器人 | 0.90 | .19 | 158 | 267 | 398 | 464 | 509 | 966 | +3.46 |
| 追赶者·没炼出过·玩家全力 | 1.40 | .34 | 147 | 241 | 322 | 339 | 376 | 730 | +3.96 |
| 追赶者·没炼出过·机器人 | 0.17 | 0 | 206 | 374 | ∞ | ∞ | ∞ | ∞ | −0.00 |
| 小公司·玩家全力（假设有大底座） | 0.36 | .02 | 201 | 362 | 986 | ∞ | ∞ | ∞ | +0.21 |
| 小公司·机器人（假设有大底座） | 0.03 | 0 | 269 | 488 | ∞ | ∞ | ∞ | ∞ | −0.02 |
| 小公司·玩家全力（真实底座，cap 比对手线低 7） | 0.36 | .02 | ∞ | ∞ | ∞ | ∞ | ∞ | ∞ | −7.29 |

前沿·炼出过·机器人补数据到 2 档后（A ≈ 1.06），F 到顶，各项天数与第一行完全相同。

**表 2：首次拿标和再次拿标（从差 3 到拿标的天数）**

| 对照 | 没炼出过 | 炼出过 | 比值 |
|---|---|---|---|
| 前沿玩家全力 | 153 | 92 | 1.66 |
| 前沿机器人 | 240 | 108 | 2.22 |

**表 3：锚点含不含玩家（前沿·炼出过·玩家全力，领先到 +1 / +3 的天数）**

| 锚点 | 每 14 天发一次 | 每 60 天 | 每 120 天 |
|---|---|---|---|
| 本稿：只看对手和史实 | 251 / 570 | 251 / 570 | 251 / 570 |
| 反例：锚点含玩家快照（棘轮） | 242 / 331 | 250 / 369 | 250 / 387 |

**表 4：单维护栏（只练数学，数学 cap 再高 12）——数学比世界包络高出的最大值**

| 设置 | 炼出过·全力·600 天 | 没炼出过·全力·600 天 | 追赶者机器人·200 天 |
|---|---|---|---|
| 本稿（DIM_SLACK 3，DIM_STEEP 2） | 6.68 | 4.13 | 3.00 |
| 去掉单维护栏 | 17.50 | 17.50 | 12.89 |

**表 5：蒸馏芝诺（`(1 + 0.1σ)` 移进蒸馏那一份后重跑）**
- 设定：追赶者，自有数据 0.5 档，蒸馏 2.5 档，每 90 天按当天重买老师。
- 数字是离对手最强的差距。

| 情形 | 第 0 天 | 30 | 60 | 90 | 120 | 180 | 240 | 300 | 360 | 399 | 400 天内最小 | 始终 >0 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 静态，老师 = SOTA | 10.00 | 5.84 | 2.58 | 0.73 | 0.48 | 0.34 | 0.30 | 0.30 | 0.30 | 0.30 | 0.300 | 是 |
| 静态，老师 = 开源（比最强低 3） | 10.00 | 5.84 | 3.59 | 3.30 | 3.30 | 3.30 | 3.30 | 3.30 | 3.30 | 3.30 | 3.300 | 是 |
| 真实 SOTA 线，2025-01 起，老师 = SOTA | 10.00 | 5.45 | 5.38 | 5.80 | 4.40 | 2.33 | 3.43 | 1.83 | 2.93 | 0.97 | 0.682 | 是 |
| 对照：同一家不蒸馏（静态） | 10.00 | 8.42 | 7.05 | 5.86 | 5.11 | 3.60 | 2.48 | 1.68 | 1.12 | 0.81 | 0.815 | — |

掺一点蒸馏（前沿·炼出过·玩家全力，静态，σ 约 0.1，不触发污染）：

| 数据 | 拿标 | +1 | +3 | 从 +1 到 +3 |
|---|---|---|---|---|
| 纯自有数据 | 202 | 251 | 570 | 319 天 |
| 自有 2.2 档 + 蒸馏 0.25 档 | 182 | 222 | 550 | 328 天 |

蒸馏让追近更快，但越线后帮不上忙，反而略慢。

**表 6：一年内拿到标签的概率**
- 设定：真实 SOTA 线（D3 修订）。开局日在 2024-01 到 2025-10 之间每 20 天取一个，每个开局日 3 个种子，共 99 局，每局跑 365 天。
- “Anthropic 视角”指对手线排除 Anthropic；Anthropic 自家的真实线按 D6.2 只在炼出过时计入。
- 最后一列：既不持标、在练模型也拿不到标签时，锚点 − 对手最强的最大值。

| 类型 | 一年内拿到标签 | 首次拿标中位天 | 持标天数占比 | 一年末与对手最强差 | 被污染的局 | 不领先时锚点 − 对手最强 |
|---|---|---|---|---|---|---|
| 前沿·炼出过·机器人（A≈0.9） | 27% | 91 | 1.6% | −5.52 | 0% | 1.00 |
| 前沿·炼出过·机器人（A≈0.6） | 27% | 91 | 1.2% | −5.65 | 0% | 1.00 |
| 前沿·炼出过·机器人（补数据到 2 档，A≈1.06） | 36% | 91 | 3.9% | −4.79 | 0% | 1.00 |
| 前沿·没炼出过·机器人（自家史线不计） | 0% | ∞ | 0% | −7.11 | 0% | 0.00 |
| 追赶者·机器人·不蒸馏 | 0% | ∞ | 0% | −9.04 | 0% | 0.00 |
| 追赶者·机器人·优先蒸馏（开源老师） | 0% | ∞ | 0% | −7.47 | 100% | 0.00 |
| 追赶者·机器人·优先蒸馏（闭源 SOTA 当老师，最坏情况） | 0% | ∞ | 0% | −4.76 | 100% | 0.00 |
| 小公司·机器人·优先蒸馏（闭源 SOTA 当老师） | 0% | ∞ | 0% | −20.78 | 100% | 0.00 |
| 对照：前沿·炼出过·玩家全力 | 67% | 37 | 13.3% | −5.10 | 0% | 1.00 |
| 对照：前沿·集团出过（○）·玩家全力 | 36% | 55 | 5.5% | −5.73 | 0% | 1.00 |
| 对照：前沿·没炼出过·玩家全力 | 9% | 79 | 1.8% | −6.56 | 0% | 1.00 |
| 对照：追赶者·玩家全力（不蒸馏） | 0% | ∞ | 0% | −8.23 | 0% | 0.00 |
| 参照：前沿·炼出过·玩家全力，v0.9 无曲线 | 70% | 36 | 14.7% | −4.97 | 0% | 1.00 |

**表 6b：同上，但对手线换成“台阶前沿”**
- 设定：对手线平均每月 +0.4（约等于 2026 年的真实节奏），cap 每年 +4.8，60 个种子，每局 365 天。

| 类型 | 一年内拿到标签 | 首次拿标中位天 | 持标天数占比 | 一年末差 |
|---|---|---|---|---|
| 前沿·炼出过·机器人（A≈0.9 / 0.6 / 补数据） | 100% / 98% / 100% | 91 | 40.1% / 12.6% / 55.7% | +0.76 / −0.02 / +1.17 |
| 前沿·没炼出过·机器人 | 0% | ∞ | 0% | −0.90 |
| 追赶者·机器人（不蒸馏 / 开源老师 / 闭源老师） | 0% / 0% / 0% | ∞ | 0% | −2.55 / −2.55 / −1.65 |
| 小公司·机器人·优先蒸馏 | 0% | ∞ | 0% | −11.93 |
| 对照：前沿·炼出过·玩家全力 | 100% | 38 | 86.6% | +1.17 |
| 对照：前沿·○·玩家全力 | 100% | 55 | 79.0% | +1.16 |
| 对照：前沿·没炼出过·玩家全力 | 100% | 78 | 65.3% | +1.12 |
| 对照：追赶者·玩家全力（不蒸馏） | 5% | 334 | 0.1% | −1.08 |

**表 7：GPT y2023（自家线被隐藏）**
- 设定：在练 GPT-4 级模型，起点 56.8，cap 64.2；继承的 GPT-3.5 为 48.0。

| 锚点 | 发布方式 | 到 58.8（GPT-4 授名门槛） | 到 60.8（真实 GPT-4） | 2023-06-30 的 q | 2023-12-31 的 q |
|---|---|---|---|---|---|
| curve 原稿：只看对手 | 能拿标就发 | 到不了 | 到不了 | 57.7 | 58.8 |
| 史实地板，不加前瞻 | 能拿标就发 | 第 177 天 | 到不了 | 58.9 | 60.4 |
| **本稿：自家史线 + 前瞻 90 天** | 能拿标就发 | **第 92 天** | 第 311 天 | 59.7 | 61.3 |
| **本稿：同上** | 练到 58.8 才第一次发布（3 月 15 日起不持标，但在练模型高过 Claude，按“领先”算） | **第 92 天** | 第 311 天 | 59.7 | 61.3 |

如果“领先”只看是否持标，最后一行会变成第 298 天才到 58.8，而且到不了 60.8。这就是 D6.2 把“在练模型已能拿标”也算作领先的原因。

**表 8：开局播种**：见 D10.4。
- 与研究表不一致的 9 格见 `SEED_DIFF`。
- y2026 的 `histLast`：gpt 2025-11-18；gemini 2025-11-24；claude、fable、suno、elevenlabs 开局时仍在持标，取 2026-01-01；grok 2025-02-24；image2 2025-09-15；midjourney 2024-08-01。

**表 9：真实机器人第一年的冲顶力**（`botA.mjs`；一年内每周采样取中位；“补数据”= A10 新增的 ★ 机器人规则）

| 分组 | 局数 | A 中位（最低–最高） | F 中位 | F = 0 的局 | 补数据后 A 中位 | 补数据后 F 中位 | 补数据后 F = 0 的局 |
|---|---|---|---|---|---|---|---|
| ★·LLM·frontier | 10 | 0.77（0.61–0.95） | 0.53 | 0 | 1.22 | 0.85 | 0 |
| ★·LLM·非 frontier（grok y2026） | 1 | 0.12 | 0 | 1 | 0.19 | 0 | 1 |
| ★·非 LLM | 14 | 0.14（0.10–0.22） | 0 | 14 | 1.08 | 0.85 | 0 |
| —·非 LLM（suno、elevenlabs y2023） | 2 | 0.13 | 0 | 2 | — | — | — |
| ○/—·LLM·frontier | 6 | 0.88（0.50–0.99） | 0.19 | 0 | — | — | — |
| ○/—·LLM·bigtech | 20 | 0.31（0.10–0.44） | 0 | 9 | — | — | — |
| ○/—·LLM·major | 27 | 0.11（0.03–0.21） | 0 | 27 | — | — | — |
| 小团队 | 16 | 0.03（0.00–0.05） | 0 | 16 | — | — | — |

- 前沿 LLM 机器人开局第一周只有 0.10–0.60（开局时后训练数据几乎为空），半年后升到 0.9–1.0。
- 垂直模态机器人一年里后训练数据只买到一两类，fData 停在 0.1 的下限，所以 A10 加了补数据规则。
- grok y2026 是 major 档的算力，补了数据也只有 0.19，所以单独分桶。

**表 10：史实夹具**（`expect.mjs`；真实主线发布按 D11 逐条判定）
- 徽章按史料口径近似：能干活只看一年前同量级和 func_call 的日期；社区之选不算蒸馏基线；所有发布都当作没被污染。

| 模态 | 档 | 被评 | 超出 | 符合 | 平淡 | 略低 | 不及 |
|---|---|---|---|---|---|---|---|
| LLM | 冠军 | 37 | 35% | 35% | 0 | 5% | 24% |
| LLM | 前冠军 | 1 | 0 | 0 | 100% | 0 | 0 |
| LLM | 挑战者 | 99 | 6% | 52% | 13% | 0 | 29% |
| LLM | 小团队 | 12 | 25% | 67% | 0 | 0 | 8% |
| 图像 | 冠军 / 前冠军 | 10 / 2 | 80% / 0 | 0 / 0 | 0 / 100% | 10% / 0 | 10% / 0 |
| 音乐 | 冠军 / 小团队 | 6 / 1 | 100% / 100% | 0 | 0 | 0 | 0 |
| 语音 | 冠军 / 小团队 | 4 / 1 | 75% / 100% | 0 | 0 | 25% / 0 | 0 |

垂直模态的冠军几乎每次都“超出”：它们在史实里经常领先 4–10 分。所以 F4 的期待目标只拿 LLM 的分布比。

**表 11：机器人被评旗舰的期待结果**（表 6 同设定，前沿·炼出过，Anthropic 视角，每局 730 天；“发布时机”= A10 的 `shouldHold`）

| 机器人 | 发布时机规则 | 冠军：超出 / 符合 / 略低 / 不及 | 前冠军：超出 / 符合 / 平淡 / 不及 |
|---|---|---|---|
| A≈0.9，真实线 | 无 | 2% / 8% / 11% / 79% | 19% / 53% / 28% / 0 |
| A≈0.9，真实线 | 有 | 1% / 23% / 12% / 64% | 33% / 46% / 21% / 0 |
| A≈0.6，真实线 | 有 | 0 / 17% / 11% / 71% | 16% / 58% / 26% / 0 |
| 补数据 A≈1.06，真实线 | 有 | 5% / 27% / 14% / 53% | 43% / 37% / 20% / 0 |
| A≈0.9，台阶前沿（每月 +0.4） | 无 | 14% / 61% / 14% / 11% | — |
| A≈0.9，台阶前沿（每月 +0.4） | 有 | 17% / 68% / 15% / 0 | — |

- 真实线下，冠军档的“不及（含略低）”有 67–92%，离史实的 30% 很远。台阶前沿下只有 15–25%。
- 差距主要来自整体节奏，不来自期待规则本身。发布时机规则能把“不及”压低约 15 个百分点。

**表 12：“能干活”门槛与上限**（`expect.mjs`；主业两维，格式为“门槛 / 数据质量 1.6 时的上限”）

| 日期 | 公司（主业两维） | 7B | 14B | 32B | 70B |
|---|---|---|---|---|---|
| 2024-07-01 | perplexity、rwkv（知识、写作） | 50/70，58/78 | 50/73，58/81 | 57/77，53/85 | 57/81，53/89 |
| 2024-07-01 | novelai（写作、代码） | 54/78，31/78 | 54/81，31/81 | 53/85，34/85 | 53/89，34/89 |
| 2024-07-01 | jev（Agent、代码） | −2/78，31/78 | −2/81，31/81 | −2/85，34/85 | −2/89，34/89 |
| 2025-07-01 | perplexity、rwkv | 68/70，70/78 | 71/73，70/81 | 75/77，72/85 | 78/81，72/89 |
| 2025-07-01 | novelai | 58/78，56/78 | 58/81，56/81 | 72/85，66/85 | 72/89，66/89 |
| 2025-07-01 | jev | 6/78，56/78 | 6/81，56/81 | 20/85，66/85 | 20/89，66/89 |
| 2026-07-01 | perplexity、rwkv | 68/70，70/78 | 71/73，70/81 | 75/77，80/85 | 79/81，80/89 |
| 2026-07-01 | novelai | 64/78，72/78 | 64/81，72/81 | 78/85，74/85 | 78/89，74/89 |
| 2026-07-01 | jev | 13/78，72/78 | 13/81，72/81 | 48/85，74/85 | 48/89，74/89 |

- 2024-01-01 之前，任何量级都还没有“一年前的发布”，所以拿不到这枚徽章。
- 门槛永远比上限低 2 分以上，所以每个尺寸都可达，但知识类主业要把数据练到接近满档。

**自检（全部通过）**
- H 单调不增，并且连续（五组 A、ρ，含 ρ = 0.7）；
- A ≤ 0.3 时，1000 天内 q 始终低于锚点（最高差 −0.011）；
- 发布间隔 14、60、120 天，到 +3 都是 570 天；
- 故意让底座按锚点 +8 出生，195 次出生都钳在锚点 −1.000；
- 不领先时，锚点 − 对手最强 ≤ 1.0（表 6 全部 1089 局，最高 1.000）；
- Claude y2024 玩家全力：没炼出过 0/20 拿标，炼出过 20/20；
- σ = 0.5、越线后（fade = 0），日涨幅只有纯自研的 0.438 倍，不超过 (1 − σ)；
- 场地凑满时：MusicGen（领先 −2.50）不算数，Eleven Multilingual v2（领先 21.75）算数。

**结论**
- 非前沿的电脑玩家，不管蒸不蒸馏，一年内拿到 SOTA 标签都是 0%。
- 前沿公司的机器人里，炼出过的能拿，没炼出过的拿不到。这和史实一致：Claude、Gemini 第一次登顶都是“玩家级”的投入。
- 玩家全力投入：炼出过的约 67%，集团出过的约 36%，没炼出过的约 9%（真实线），属于“可能但难”。
- 自家史线不再给新手开快车道；GPT y2023 这类“自家线被隐藏”的冠军照样能练到真实水平。
- 真实 SOTA 线涨得太快，冠军档的期待结果和拿标率都偏低，这是全局节奏问题，交给 P4.2。

## 仍需制作人拍板的问题

1. **冠军期待会不会过期？**
   - 推荐：540 天没持过标签，就转入“前冠军”档。“炼出过 SOTA”的永久增益不受影响。前冠军拿标算超出，追近算符合，其余算平淡，只有倒退才罚。
   - 备选：永不过期（设为 0），更贴近原话“曾炼出过的，期待就是新模型成为 SOTA”。代价是 Midjourney y2026、Grok y2026 这类公司每次发布都会挨罚。Grok 3 只持标 9 天，史实夹具里 Grok 4 到 4.5 连判四次“不及”。
2. **场地凑满时挂上的标签，算不算“炼出过”？**
   - 推荐：领先别家 ≥ 3 分，或者之后挡住一次挑战，才算。ElevenLabs、DALL·E 2、GPT-3.5 都满足；MusicGen 不满足，所以 Llama 改为 —。
   - 备选 A：一律算，Llama 回到 ○，ElevenLabs y2023 开局后几乎必然变成“炼出过”。
   - 备选 B：一律不算，只认换手。ElevenLabs y2024 开局会变成 —，和研究表冲突。
3. **○（同集团别的领域出过 SOTA）给多少储备？**
   - 推荐：`sotaEase −0.3`（ρ = 0.7），介于“炼出过”和“技术储备不足”之间。表 6 中玩家全力一年拿标率约 36%。
   - 备选：完全中性（ρ = 1.0），或者和 — 一样（ρ = 0.45）。
4. **开局播种以哪份数据为准？**
   - 推荐：以 D3 修订后的游戏数据为准，和运行时的标签同源；与研究表的 9 格差异写进白名单。
   - 备选：逐格改成研究表的结果。这样会出现“游戏里明明拿过标签，开局却算新手”的矛盾。
5. **机器人的蒸馏和补数据规则怎么定？**
   - 推荐：
     - 蒸馏：没炼出过、落后至少 2 分、有更强的 LP 开源老师时才蒸馏；炼出过的公司永不蒸馏。
     - 补数据：炼出过的机器人把后训练数据补到 2 档，否则 ★ 的垂直模态机器人永远拿不到标签（表 9）。
   - 备选：不加补数据规则，改为把非 LLM 的 fData 参照从 2 档降到 1 档。代价是玩家在垂直模态里也更容易冲顶。
6. **`g_sota` 自动完成，还是做成手动节点？**
   - 推荐：自动完成（`auto: true`，bypass）。不占槽，不弹策略卡，由 `ms_first_sota` 庆祝。这样玩家没法拖着不点、留在低档刷“超出”，新手惩罚也不会多挂一段时间。
   - 备选：手动节点，更像 HOI4，但要另外堵上这两个口子。
7. **整体节奏先抬，还是先接受偏低的标签率？**
   - 推荐：P4.2 先抬 TRAIN_PACE 和底座缩放，直到“★·LLM·frontier 机器人开局后拿到过标签”进入 25–70%，再调曲线和期待。
   - 按现在的节奏，Claude y2024 玩家全力也只有 0/20 拿标，所以 `hn_claude3_opus` 授名基本拿不到；冠军档机器人的“不及”有 64–79%。
   - 备选：不抬节奏，把这一项目标降到 15–40%，同时把冠军档的期待目标改成“不及 ≤ 75%”。