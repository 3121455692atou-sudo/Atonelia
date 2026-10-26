# 未确认选卡草稿持久化（会话格式 v2）

## 修复

复现：DeepSeek / 2025，默认四张移除千问（3/4），或移除后加入双语偏好对（自定义4/4）；返回训练再刷新会恢复默认四张。根因是 UI 仅改 `st.postPlanDeck`，真实 `draftDeck` 未写入。

现在每次合法加入/移除调用 `postPlan.updateDraft`，复用既有 `transactPostPlan`：克隆→校验→写主存档→成功后替换实时状态。UI、卡面预加载、确认操作统一读 ledger，不再读局部影子草稿。保存期间选牌、确认和返回按钮禁用，synthetic/rapid click 同样被 busy guard 拦截；只显示最后已成功提交的选择。保存失败则显示失败信息、保持实时状态及原存储字节，用户可重试。强制刷新时只能承诺恢复最后一次已完成的主存档写入，不把 pending 当成功。

更新草稿不确认、不签发抽牌票据、不消费 RNG、不扣演练预算、不创建回执、不改变模型/作业/方案 epoch。保留基础卡，1–4 张，顺序保持，禁止重复、未知、未解锁或异模态卡。revision 拒绝陈旧点击和陈旧确认；确认后的草稿不可变。

## 严格 schema 和新局要求

`POST_PLAN_FORMAT` 改为 `solo-post-plan-catalog-v2`。会话必须包含整数 `draftChanges`，满足：

`revision = draftChanges + choiceRevision + controlChanges + (confirmedDeck ? 1 : 0)`

未知字段、缺字段、错误计数、非法草稿、confirmed/draft 不一致均拒绝。v1 ledger（即使没有 session）不迁移、不静默重置；提示「后训练会话版本已更新（v2），不支持旧版或损坏格式；请新开一局，原存档未修改」。拒绝继续/导入不会改写原字节。

无卡牌 ledger 的普通当前存档仍可由底层 `safeLoadState` 校验，但现有产品 `preflightSoloPostPlanSave` 本来就要求当前卡牌方案；本改动没有放宽该入口，也没有添加旧存档兼容。旧 `postCards` 实验格式继续拒绝。

## 改动清单

源文件：
- `src/career/sim/post_card_profiles.js`：格式 v2。
- `src/career/sim/post_plan_state.js`：草稿命令、计数、严格校验、确认幂等重试基准。
- `src/career/sim/post_plans.js`：导出命令实现。
- `src/career/sim/commands.js`：import 和单机命令注册（共享文件，请按块合并）。
- `src/career/ui/panels/post_plan.js`：草稿持久化、busy 禁用、唯一 ledger 源和诚实提示。

测试：新增 `tests/post_cards/draft_persistence.test.mjs`；修改 `panel.test.mjs`、`art_loading.test.mjs`（不再期待局部草稿）、`native.test.mjs`、`product.test.mjs`（v2）。

未修改 `post_plan_transaction.js`、`post_only.js`、`home.js`、存储代码或其他候选。

## 实际验证

- 17:05:55 UTC 启动后训练全部专测，2.54 秒：**513/513 通过**。
- 随后加上 damaged-ledger 编辑前校验、rapid click/busy 返回/顺序/旧确认额外断言；17:06:56 UTC：草稿、panel、save-boundary **21/21 通过**（0.55 秒）。
- 最后加强整个 JSON 严格往返及产品 preflight 拒旧断言；17:07:32 UTC：草稿最终 **5/5 通过**（0.41 秒）。
- 未跑全量，未启动浏览器；真实浏览器由父代理与界面审计代理在集成后使用新局补验。

运行：`node --test tests/post_cards/draft_persistence.test.mjs tests/post_cards/panel.test.mjs tests/post_cards/save_boundary.test.mjs`。

浏览器补验：新建 v2 DeepSeek/2025 → 默认4移除千问 → 3/4确认禁用 → 返回/刷新/继续仍3；加入双语偏好对 → 自定义4/4 → 刷新同方案号、同顺序、未抽牌；仅明确确认后揭示首手。测试旧v1时导出并保存原文，不覆盖浏览器原存档。
