# 真实游戏内引导

用户明确拒绝独立教程面板；旧 `ui/pages/tutorial.js` 不再由 app 导入，旧教程 CSS 不再由 index 加载。标题「新手引导」「经营操作引导」进入同一 index 的全新练习文档。

## 同一界面、同一操作

- 游戏仍是原 `ui/app.js`，主界面、后台导航、训练卡牌、各经营页面均使用原 renderer 与 click/change/pick handlers。
- coach 只创建一条短提示及一个退出按钮，给实际可用控件加 outline；不创建确认、出牌、研究、采购等替身控件，不调用教学版命令。
- 基础从真实主界面教菜单→训练，准备正常后训练作业及原默认四张草稿牌；玩家通过原 `data-pp-confirm`、`data-pp-select`、`data-pp-choose` 完成六手。没有固定分数或强制准备牌顺序。
- 经营引导在同一练习公司依次教研究、策略、采购数据、推理份额、底座立项、送评、API价档、融资和托管。通过真实导航和控件进入；实际状态变化后自动换下一句提示。送评入队即完成该操作，不要求特殊快进或刷发布成功。
- 所需资源/模型/空闲策略槽已准备好。原默认70B/2T立项可合法开始，用户不用先搭复杂前置。
- coach 顶栏预留实际高度，减少下方实际游戏视口而非浮盖按钮；短屏视觉需浏览器验收。

## 新文档隔离

`index.html` 唯一执行入口为 `ui/bootstrap.js`。它仅静态导入不依赖UI/engine的 `practice_context.js`。

没有 practice 参数时，不改浏览器存储属性，照常加载 canonical `./app.js`。合法 practice 参数时：

1. 不读取或复制任何原生 Storage 内容。
2. 独立空内存 localStorage/sessionStorage 与 undefined indexedDB 均绑定到当前 global，属性不可写、不可配置。
3. 完成属性 descriptor、引用和 Storage API 的读回验证后，才动态加载 app。未知/重复参数或任一步失败均不加载 app、不回退普通模式。
4. 原 autosave、卡牌事务、HOF、world storage fallback、账号设置均只能触达该文档内存。原正式存档不读不写。
5. 退出删除 practice 参数并跳新文档；从不恢复旧文档存储属性。因此旧 await 或 BFCache 旧 realm 即使恢复，也只能写旧内存。practice 页刷新重新生成空练习；BFCache pageshow 刷新该练习文档。
6. 返回标题直接退出练习文档；联机 create/join/rejoin 和聊天发送在请求前拒绝。源内未发现 BroadcastChannel、Web Locks、SharedWorker、serviceWorker 或 parent/top/opener存储旁路。

Chrome/Safari 是否允许覆盖这些 Window 属性必须实测；本候选只验证JS模型和原调用路径，**不宣称已通过Safari/iPhone验证**。不允许覆盖时安全停止，给一个返回按钮，不冒险载入游戏。

## 验证

- `practice_context.test.mjs`：全成功才loader、普通模式不改、未知/重复参数、不可覆盖/readback失败、原生getter触达0、不可恢复绑定、旧realm迟到回调、刷新新内存。
- `practice_real_basic.test.mjs`：全部729路径经过真实train renderer与原panel点击handler、实际事务，并逐步对照生产命令；真实autosave/world fallback、挂起HOF及post事务退出后仍只写内存；网络请求0；coach指向真实控件。
- `practice_real_advanced.test.mjs`：同一练习公司经9个原页面/pick/click/change完成，原默认项目/送评合法；多个合法滑块/价档答案均可完成。数据测试为真实pick→decideAct契约，不声称驱动了浏览器。
- 原后训练规则和相关回归继续运行。旧独立教程原始规则测试仅为遗留内部回归，不再作为真实UI验收证据；入口契约已改为真实app新文档。
- `scripts/tutorial_ui_smoke.mjs` 已改为实际主界面/导航/控件脚本；需支持的浏览器环境。未在受限环境中绕过浏览器启动限制。

部署前仍需父整合三卡真实UI候选、全量测试、私有部署及真实窄屏操作；代码/DOM替身通过不代表视觉通过或用户验收。

本候选终态 focused：566/566 PASS，0失败/跳过，其中新真实引导/隔离18项；全部729条真实UI handler路径通过。完整套件及真实浏览器尚待父整合。
