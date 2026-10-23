// 引擎入口：界面与测试只从这里导入。
export * from './sim/game.js';
// 自洽世界（M1）：世界状态、两段式日结、SimProvider。界面只从这里导入。
export * from './world/index.js';
// 自洽世界的股市（M.5.5、M.5.10，M2a）：界面和校准读这几个。
export { finalWealth, isListed, poolPrice, fairPrice, borrowRate, lendable, holdingsLiquidation, shortsBuyback, SHARES0 } from './world/exchange.js';
// 交易所页（M.7）：只读的报价、盘面、持股公示，两只指数和上市窗口。
export { quote as exQuote, quoteMax as exQuoteMax, boardOf as exBoard, ownBoard as exOwnBoard, stakesOf as exStakes, sectorIndex } from './world/exchange.js';
export { chipIndexValue, ipoOpenOf } from './world/valuation.js';
// 世界存档（E8）与电脑公司（M.3.12）：存档函数、存储适配层、电脑公司的难度出口。
export { WORLD_SAVE_VERSION, FEATURES_WORLD, serialize, deserialize, migrateWorld, storage } from './world/save.js';
export { botThink, botPublish, followAdvice, tradeTick, distillTick, accuseTick } from './world/bots.js';
// 联机客户端的镜像（M4）：公开视图拼成只读世界，装上 MirrorProvider。
export { openMirror, refreshMirror, MirrorProvider } from './world/mirror.js';
export { applyDiff, PROTOCOL_V } from './net/protocol.js';
// M0 世界接缝：命令表、Provider 的换入口、发布表的读取点（规格 M.9、F3 只列这几个名字）。
export { applyCommand, COMMANDS } from './sim/commands.js';
export { botStep } from './sim/bot.js';
export { setProvider, P } from './sim/provider.js';
export { relById } from './data/rivals.js';
export { techStatus, researchSlots, knowFx, researchSpeed, researchNeed, researchCheck, researchOptions, daysLeft, unpublishedFirsts } from './sim/research.js';
export {
  runBenchmark, scaleById, computeCaps, dimUnlocked, tokensPerGpu, inferGpuEq, leaseGpus, clsOf, archOf,
  modelSpeed, costPerMillion, contamination, validBoost, rivalScore, isMine, peerCls, knowledgeCap, projectEta, projectProgress, capsFor, distillCaps,
  historyTeacher, DISTILL_MIN_DAYS, genPlan,
  effectiveEpochs, repeatEfficiency, pretrainRepeat, pretrainCredit, KNOW_PRETRAIN, REPEAT_RSTAR, MAX_EPOCHS,
} from './sim/model.js';
export { simulateService, previewService, productQ, hypeIndex, tickerSeries, fx, ccySign, tickerListed, refApiPrice, marketShares, listPrice } from './sim/economy.js';
// “谁最强”只有一种口径（规格 D1）：综合分、旗舰、对手排名、榜单取最强、SOTA 标签都从 sota.js 来。
export { qOf, worldSota, sotaAt, familyBest, orgBest, benchBest, rivalStandings, worldRank, relDims, relRole, orgOf } from './sim/sota.js';
// 徽章判定（D11.2）：界面只从这里读，不自己算。发布时已经写进 snap.badges，对手的发布没有存，页面上按当时可见的数据现判。
export { badgesFor } from './sim/expect.js';
// 公司历程要列开局前本公司的 SOTA 记录（D10.5）：读真实发布排出来的标签链，按模态分。
export { SOTA_HISTORY } from './sim/sota.js';
export { advise, applyAdvice } from './sim/advisor.js';
export { grantWindow, grantGap } from './sim/strategy_ai.js';
// 开局设置页校验品牌词：真实公司的品牌词表（只读）。
export { ORG_BRANDS } from './sim/naming.js';
export { chooseBase } from './sim/bot.js';
export { daysBetween, inDays, fmtShortDay } from './sim/clock.js';
// 策略页要读整棵树的节点和分支名（页面拿 strategyOptions 只有节点状态，没有 branches）；特质名用来显示公司特质。
export { resolvedTree, spiritDef } from './sim/strategy.js';
export * as util from './sim/util.js';
