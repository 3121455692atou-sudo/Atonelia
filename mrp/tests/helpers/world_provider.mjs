// 测试用的世界入口：M1a 起直接转出正式的 SimProvider（以前的“最小 SimProvider”已经删掉）。
// 另外提供 restoreHistory()：在同一个进程里跑过世界以后，把发布表、Provider 和发布日覆盖表换回史实，
// 免得后面的史实测试读到自洽世界（规格 M.10 第 4 条：发布表是模块单例）。
import { setProvider, HistoryProvider } from '../../src/career/sim/provider.js';
import { setReleases, RAW_RELEASES, FAMILIES } from '../../src/career/data/rivals.js';
import { RELEASE_DAYS_OVERRIDES } from '../../src/career/data/release_days_overrides.js';

export { SimProvider as WorldSimProvider } from '../../src/career/world/sim_provider.js';

const ORIGINAL_DAYS = { ...RELEASE_DAYS_OVERRIDES };

export function restoreHistory() {
  setProvider(new HistoryProvider());
  for (const k of Object.keys(RELEASE_DAYS_OVERRIDES)) if (!(k in ORIGINAL_DAYS)) delete RELEASE_DAYS_OVERRIDES[k];
  for (const [k, v] of Object.entries(ORIGINAL_DAYS)) RELEASE_DAYS_OVERRIDES[k] = v;
  setReleases(RAW_RELEASES);
  delete FAMILIES.academia;
}
