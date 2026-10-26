# 数据/研究托管 M2 独立实现

范围：新版本联机房间的两模块自动托管；尚未并入主candidate。不是全游戏自动经营完成。

- 新room.start由服务端写automationVersion=1，玩家本人data/research默认auto。初始化只发生新局或NPC首次接管；不清资产/旧订单/作业/研究。
- 后训练联机无卡牌选组、无manual等待/全局暂停控制；本分支不修改后训练随机收益。单机卡牌偏好仍独立。
- 唯一执行路径为已落盘tick→world.tick→tickDay→planner。自动具体命令走world.applyNow，但不再次写网络cmd日志；跟同一tick重放。
- 新v1真人hosted不再运行旧passive bot/resolveAll。manual离线仍manual；事件按现有期限由已记录sys.autoResolve处理。
- 房间公共视图只给版本；预算、策略和理由只给本人。MP设置remote-only，等待服务器ack，不本地先改镜像。
- 数据只购合法静态包（不恢复暂停生成）；技术优先同顾问建议，无候选时从玩家研究页也显示的researchOptions合法列表选预计工期短项。当前预设仅均衡/省钱，无领域排除，不声称长期最优，不解锁隐藏科技。
- 损坏/未知状态在启用、加载或日结时明确拒绝，不默默当成功、不回退旧bot花钱。最新用户要求旧档无需兼容；已有极小legacy分支未为删而删，没有继续投入旧档适配。

## 核验

`node --test --test-concurrency=1 tests/world/automation_m2.test.mjs tests/server/mp_automation_m2.test.mjs`

真实HTTP/SSE测试：双客户端独立控制、重复/过期/越权拒绝、offline hosted与重连、SIGKILL恢复、30日周期快照、半行WAL修复，full-log/snapshot/live world.hash一致。world.mig规范化元数据差异如实记录，未删除字段伪造原始SHA；同路径live/full序列化一致，snapshot路径比规范化结果与权威hash。

## 生产接入待办

1. root合并审查；server代理有独立房主暂停权限变更，本补丁仅改room.start版本参数与resolveExpired版本分支，不覆盖其逻辑。
2. 真实联机UI点击两模块控件/等待ack/断线，当前已有UI事件契约与HTTP证据，不冒称M2浏览器实点已完成。
3. 完整聚合/较长mixed-control经济局/多公司性能仍需统一预算测，不把本专项当全通过。
4. 后续沿同架构接compute、pretraining、release、business/capital和策略研究；每模块复用合法命令、共享预算与手动ownership，不加假开关。实际卡牌/联机随机收益由对应功能分支接入。
