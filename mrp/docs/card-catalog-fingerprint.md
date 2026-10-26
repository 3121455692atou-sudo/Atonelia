# 后训练卡目录机械指纹

## 用途与命令

`scripts/card_catalog_fingerprint.py` 是随主工程交付的 **只读生成/校验工具**，只依赖 Python 3 标准库；不读取策划工作目录、审计快照、旧测试证据或任何存档。它直接读取该工程中的：

- `src/career/data/post_card_catalog.js`：三个 JSON 字面量导出 `CATALOG_FINGERPRINT`、`POST_CARD_CATALOG`、`POST_CARD_RECIPES`。
- `src/career/sim/post_catalog.js`：明确导出的 `CATALOG_RULES` 版本字面量。

它不会执行 JavaScript。目录文件中出现表达式、重复键/导出或多余可执行语句会被拒绝；不要把完整游戏运行时交给 Python 求值。

```sh
# 默认核对计算结果与实际运行时嵌入常量；只读。
python3 scripts/card_catalog_fingerprint.py
python3 scripts/card_catalog_fingerprint.py check

# 生成新指纹到 stdout；不会写回源文件。
python3 scripts/card_catalog_fingerprint.py generate

# 输出参与哈希的精确 UTF-8 字节；没有尾换行。
python3 scripts/card_catalog_fingerprint.py canonical

# 默认工程根相对于脚本自身定位，不依赖 shell 当前目录。
python3 /path/to/mrp/scripts/card_catalog_fingerprint.py check
python3 scripts/card_catalog_fingerprint.py check --root /path/to/other/mrp
```

退出码：`0` 表示核对一致或生成成功；`1` 表示目录机械数据与嵌入指纹不一致；`2` 表示缺文件、非法数据、未知版本或需要审查的新字段。`generate` 可以从尚未更新嵌入指纹的合法新数据计算结果，但仍拒绝旧格式/非法数据。所有模式都不会写目录、回放、存档或审计证据。

## `mrp-card-mechanical-projection-v1` 算法

固定投影包含：

- 算法名、目录 schema、目录版本、实际 DSL 版本。
- 全部 `caps`；基础卡的 ID、cost、base、kind。
- 规则策略：单人限定、真实资源步收益限制、准备效率区间、执行率区间、禁止稀有度乘数、禁止预算退款、禁止抽牌/额外回合。
- 按原数组顺序逐卡读取：`id`、`cost`、`kind`、`modalities`、`archetypeTags`、`historyTags`、完整 `effects` AST、完整 `unlock` AST、`rarityMultiplier`、`realAbilityEffect`。
- 配方 schema、牌组尺寸、必带基础卡、不同卡角色要求、最大生效配方数、聚合规则、覆盖率数组、效率公式、角色匹配规则；逐配方保留 `id` 与完整 `roles`。

不参与机械身份：独立美术资源及其 URL/署名/brief、角色外观身份、显示名、规则说明文字、来源备注、状态文案、配方显示名、派生的单卡 `mechanicalSignature`。这些仍须遵守各自版权和数据完整性检查；**不参与这个哈希不代表允许随意覆盖或不需验证**。`src/career/data/post_card_art.js` 完全不被读取。

每张卡和顶层规则使用明确的字段分类表。出现尚未分类的新字段会拒绝，不能因忘记加入投影而悄悄放过新机制。当前 `comboPartners` 必须保持空数组；未来若赋予机械含义，必须先更新算法。完整机械代码不在此数据哈希范围内：修改 DSL 执行顺序、结算公式或相关引擎行为时，仍必须审查并提升规则版本/对应算法，不能只改代码而沿用旧身份。

规范编码步骤由脚本中的 `canonical_bytes` 明确定义：

1. 整数值浮点数归一为整数；拒绝机械数据中的非有限数。
2. 字典键递归排序；**数组顺序保留**，不额外排序卡牌、标签、效果或配方。
3. Python `json.dumps(ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)`。
4. UTF-8 编码，无尾换行；SHA-256 得到64位小写十六进制值。

这是明确版本化的项目算法，不宣称符合 RFC 8785，也不宣称复原旧版生成算法。当前数据投影中的字段名和机械字符串使用稳定键名；若未来引入新的数值精度或编码约定，应先审查算法而不是靠不同语言的默认 JSON 序列化碰运气。

## Draft 3 发布边界

`166-card-draft-3` 的已审机械变更只有 `ptc_elevenlabs_acting_tags` 前手标签条件 `calibration → curriculum`；其他参数、配方与真实收益上限未改。该目录的固定向量为：

```
f270106f1693043eaee61f773a60e460c1d95171bc666148e13f8c61c906a6f8
```

原 `166-card-draft-2` 的 `095955c92dfce152f415d078e7d6fc75da9214f0d5d4d2b30485832f7e2395da` 是保留的历史冻结常量，原生成脚本未留档。此工具在 **所有模式** 下拒绝 draft2，不重新生成、改签或把旧证据假装成新证据。未知目录/DSL schema 同样拒绝。当前算法支持同 schema 的 draft3 及后续整数 draft 版本；规则结构变化仍需显式审查。

今后机械改动的发布流程：审查必要修改 → 提升目录版本 → `generate` 得到身份 → 明确更新运行时嵌入常量 → `check` 与相关测试通过 → 按主工程版本边界发布新局。工具不自动更新版本或常量，也不自动迁移任何旧世界。**已有卡局、存档、MP 初始化/WAL 与测试世界不得靠替换指纹继续使用**；其拒绝/新局策略由对应运行时版本校验负责。

仅改独立美术、署名或显示文案，不应刷新机械身份。仍需运行 `check` 以防编辑时误碰效果或前置。

## 测试

```sh
node --test --test-concurrency=1 tests/harness/card_catalog_fingerprint.test.mjs
```

该文件也被现有 `npm test` 的测试 glob 自动包含，无需修改 `package.json`。需要 Python 3；可用 `PYTHON=/path/to/python3` 指定解释器。测试会在临时目录复制 **工具与实际运行时数据**，不需要任何策划或审计目录。覆盖：固定向量、精确规范字节、自包含/异目录运行、机械修改敏感、独立美术与文案不敏感、字段/版本拒绝、错误指纹、JSON 歧义/表达式拒绝、旧版只读拒绝。

这是目录身份专项，不是长周期游戏平衡、真实职业解锁、UI或全工程测试通过声明。
