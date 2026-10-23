// 测试用的最小 SimProvider（M0）：只把 registerCompany 接到真正的登记函数上，其余口子照史实实现。
// M1 的完整 SimProvider 还没写；createGameFor 要先调 P().registerCompany，史实 Provider 按规格 M.3.2 会抛错，
// 所以测 createGameFor、自定义公司存档时用 withSimProvider 临时换上来，跑完换回去。
import { HistoryProvider, P, setProvider, registerCompany } from '../../src/career/sim/provider.js';

export class MinSimProvider extends HistoryProvider {
  mode = 'sim';
  registerCompany(spec) { return registerCompany(spec); }
}

// withSimProvider(fn)：在最小 SimProvider 下执行 fn，结束后换回原来的 Provider。
export function withSimProvider(fn) {
  const prev = P();
  setProvider(new MinSimProvider());
  try { return fn(); } finally { setProvider(prev); }
}

// 一家自定义小公司：默认语言模型、小团队，路线闭源。
export function customSpec(over = {}) {
  return {
    id: 'c_abc123',
    company: '测试小作坊',
    name: '小作坊',
    label: '测试用的小团队',
    country: 'CN',
    tier: 'small',
    modality: 'llm',
    ...over,
  };
}
