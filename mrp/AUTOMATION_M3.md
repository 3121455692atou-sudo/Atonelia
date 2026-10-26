# M3 算力分配真实垂直切片

基线：独立 M2；不包含 root 的 host-clock 组合修改，也未覆盖主候选。增量补丁以 M2 为基线，合并 room.start 两处时必须同时保留 host-clock 的 clockRulesVersion 和这里的 automationVersion:2。

新增模块显示名“算力分配（不含购卡、租卡与检修）”，三策略均衡/保服务只上调/保训练只下调。仅从当前公开顾问的 infer 建议映射真实 setInferShare，正常命令验证、同权威日结内部 applyNow，不增加网络动作 WAL。正常模态/资源 API 预检失败则写等待理由，不假执行。

深拷贝 allocJobs 比较原本正在运行的每个作业，不能挤到排队；下调时用实际已交付推理卡复核容量，不把在途租卡当现有卡。成功调整后 3 游戏日冷却；手动、切策略、重连都不重置冷却或预算，也不暂停/撤销任务。即时现金费为零，共享采购预算不变。

明确 v2 schema/planner/room.start 规则。v1 的两个模块及日结路径保留以重放已记录日志，绝不静默升级；单机显式启用产生 v2，联机新房间服务端强制 v2。未知、损坏、公司与房间版本错配在载入前拒绝。v2 不添加联机卡牌字段或等待。

修改范围：automation.js + 独立 automation_allocation.js、正常命令枚举、版本化世界加载/公开设置、room.start + hosted 版本识别、自动化 UI/单机试用文案、专项测试。检修 ownership 已知问题仅记录于 M3_ACTIONABLE_PLAN.md，未顺手修改。

测试记录见 ../.. / game_qa_autopilot_design/m3-focused*.txt（去掉路径中的空格）。首次自写回放测试错误地交错运行两个不同 world 而全局 Provider 指向后一局；测试改为项目既有顺序重放方式。保留原红日志 m3-first.txt，没有引擎恢复修补或删除 hash 断言。snapshot migration 的原有 mig metadata 规范化后比全状态，原始 hash 单独严格相等。

真实 HTTP 测试扩展了：新 transport seq 复用旧 requestId 直接穿透语义 receipt，rev 不回滚；同 id 不同 body 拒绝；SIGKILL 后继续用新 seq 复用旧 id 不重做。成功空操作仍按正常协议记 seq/WAL，不错误要求整个 world hash 不变；自动采购/研究/分配不另外双写 cmd。

未完成：真实浏览器 M3 第三控件验收、与 host-clock 的组合回归、全局性能/所有玩法验收。仍不是多数模块最终自动化完成；后续优先预训练规划与启动、经营/发布，再处理采购/检修/资本独立策略边界。
