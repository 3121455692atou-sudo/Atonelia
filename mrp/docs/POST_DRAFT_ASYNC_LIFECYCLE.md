# v2 草稿补丁后续：异步请求归属

相对 `post-draft-v2.patch` 的增量，不包含或回退原补丁。只改 `src/career/ui/panels/post_plan.js`，新增 `tests/post_cards/request_lifecycle.test.mjs`。

确定问题：office 原地复用 `st`。旧请求 finally 不看当前局面，无条件设 `postPlanBusy=false`，可以解锁新局新请求。现在请求使用独立 token；token 同时归属原 st、原游戏、原 world/mp。reset 清除 token，dispose 使请求失效。旧 resolve/reject/finally 不得改新 busy/error/focus/session/event，也不得重绘。初次 draw 若切走，不再发起已失效操作；完成 draw 若切走，不再追加主页面重绘。内部表现层重挂与用户真实退出分开，切换控制权不取消自己的请求。

28/28 专项通过（2026-10-25 17:14:09 UTC，0.42秒）：

`node --test tests/post_cards/request_lifecycle.test.mjs tests/post_cards/draft_persistence.test.mjs tests/post_cards/panel.test.mjs`

生命周期新增10项：旧resolve/reject × 同st reset / 离页再回 / 新游戏；正常成功与dispose；完成draw过程中reset；两个真实新局请求重叠（旧成功/失败各一），仅新请求自己清一次busy。

未触碰 transaction.js、flow.js、post_only.js、home.js。未使用浏览器，未覆盖或重建浏览器存档；浏览器写状态权限仍等待用户回答。
