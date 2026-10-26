# M4 公司策略研究与新单机默认托管

独立 M3 基线增量；不包含 root 的 host-clock/random-post/SSE-dialog 补丁，合并时保留这些组合修改。

## 已实现

- 新 `automationVersion:3`、schema/planner3、四模块：companyStrategy/data/research/computeAllocation。旧明确v1/v2回放仍按对应模块运行，不静默升级旧档。
- 公司策略研究与技术研究分开：当前公开 strategyOptions+canStart+scoreNode(adaptive)，映射正常 startStrategy。独立粗策略均衡/真实公司分支/仅DeepSeek单机的卡牌前置优先。
- 当前cur无论active/paused都不搁置或替换；manual只停止未来决策。没有cancelStrategy/写idleSince/调整统计门槛。queue非空依原命令等待，不清队列或放宽联机规则。
- upfront支持真实cash/cashOfStart，后者按START_RESOURCES开局档基数；在保留期内合法续做不重复扣。共享原预算/储备，未知预付副作用拒绝，不用未来奖励抵现钱。
- 当前保守安全边界：不选互斥/重复/自动/never/stance/license；不选raise等未白名单完成效果、不接受未来负现金承诺、不新增blocks类特质或移除特质。节点价值按现有公开adaptive分排序，零分不填槽。该边界意味着某些分支会明确等待，非整个策略树全部可自动。
- 新单机历史开局与自洽开局默认四项自动，开局页可逐项关，局内托管页可接管/改方向。低层createGame仍是无UI的模拟构造器，不强行给所有既有测试/模拟注入新规则；真实UI开始历史局无条件启用v3，自洽设置携带version3。
- NPC接管保持完整业务状态，只一次初始化当前房间版本精确模块schema/rev0/空动作账。联机无cardDefault，也没有post_cards方向。

## 卡牌接口范围

冻结适配当前kernel规则：DeepSeek ds_found对应replay，ds_grpo（另需技术grpo）对应finish；真实前置路径ds_found→ds_coder→ds_grpo。代码不写卡牌解锁/技术、也未合入卡牌引擎。已有技术研究模块负责正常技术研究。其它公司暂无真实映射则不显示该选项，不捏造ds节点。待卡牌正式版本变更时同步适配，不声称本分支已完成全卡组集成。

## 排程/版本/恢复

v3固定日结顺序：公司策略→数据→技术研究→算力分配。共享lastDay窗口/cursor/rev/receipt；设置切换不再启动当天动作。只WAL tick内部applyNow，不双写自动命令WAL。新服务端room.start强制3；未知/损坏/MP带cardDefault及版本不匹配加载前拒绝。

## 验证范围与保留红记录

首轮8项6PASS/2FAIL：Kimi成本夹具未标记更高分免费km_founded已完成，实际合法选免费节点；修夹具后真实扣费/续做测试通过。
扩大208项206PASS/2FAIL：UI直接import sim违反既有边界，已改engine导出；旧v2测试助手错误设置不存在的第四模块，改为按真实模块集合枚举。
最终结果看 game_qa_autopilot_design/m4-focused-final.txt。包括真实35天正常策略完成、不cancel刷idle、预算/分支/暂停、真实HTTP+SIGKILL+周期snapshot、精确NPC接管、单机默认UI入口。历史开局默认有静态入口检查，自洽开局默认有实际函数测试；仍需浏览器实际开局/第四控件和root组合回归。

## 合并提示

增量基于M3。room.start两处automationVersion改3时保留clockRulesVersion和random-post版本；resolveExpired仅拓展支持版本集合，不覆盖host权限。自动化UI使用engine.strategyPresets，不直接import sim；保留browser代理的SSE当前dialog同步修复。请同步当前新局schema测试为四模块，保留完整businessState比较，不删除断言。

未实现购卡、检修、预训练、经营、发布、资本的完整托管，仍需继续推进多数模块目标。
