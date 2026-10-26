// 名人堂的结束内容指纹：只用于同一存档反复导入的幂等记账，不作安全校验。
// 游戏没有独立 runId；完整玩家状态（排除已记账标志）区分相同种子下的不同选择与结局。
// 世界只取稳定的开局身份与结局，不把升级标记或 UI 记账写进引擎确定性状态。
import { HOF_KEY, load, setRaw } from './storage.js';
const pending = new WeakMap();
const stable = v => {
  if (Array.isArray(v)) return `[${Array.from(v, item => stable(item) ?? 'null').join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().filter(k => v[k] !== undefined && typeof v[k] !== 'function').map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
};
export async function hallKey(s, world = null) {
  const { hofSaved, ...state } = s;
  const data = stable({ state, world: world ? { seed: world.seed, mode: world.mode, start: world.start, end: world.end, settings: world.settings, result: world.result } : null });
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return `end-v1:${Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('')}`;
}
export function recordHall(s, world, row) {
  if (s.hofSaved) return Promise.resolve(true);
  if (pending.has(s)) return pending.get(s);
  const p = (async () => {
    try {
      const key = await hallKey(s, world);
      // 摘要计算以后再读最新记录；检查与写入之间不 await，避免两个结束任务互相覆盖。
      const prior = load(HOF_KEY);
      const rows = Array.isArray(prior) ? prior : [];
      if (!rows.some(x => x?.key === key) && !setRaw(HOF_KEY, JSON.stringify([{ ...row, key }, ...rows].slice(0, 50)))) return false;
      s.hofSaved = true;
      return true;
    } catch { return false; }
    finally { pending.delete(s); }
  })();
  pending.set(s, p);
  return p;
}
