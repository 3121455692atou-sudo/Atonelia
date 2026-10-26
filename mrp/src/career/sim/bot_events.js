// Existing bot event decisions, shared without importing the full planner/engine.
import {currentEvent,resolveEvent} from './queue.js';
import {wantsDistill} from './strategy_ai.js';
// 明显不负责任的选项（偷偷降智、否认、放任反代等）机器人不选。
const AVOID = new Set(['quant_secret', 'deny', 'partial', 'ignore', 'welcome', 'overseas', 'free', 'defend']);

// 带 distill 标记的选项（下载别家权重做蒸馏，规格 A10）：只在 wantsDistill 为真、老师就是卡上那一家时选；
// 否则选同一事件里不带标记的选项（还是“第一个不在 AVOID 里的”）。别的事件照旧。“已被抢先”这类提示直接关掉。
function defaultChoice(s, opts) {
  const d = opts.find(o => o.distill);
  if (d && wantsDistill(s, s.queue[0]?.fam ?? s.queue[0]?.params?.family ?? null)) return d;
  const plain = opts.filter(o => !o.distill);
  return plain.find(o => !AVOID.has(o.id)) || plain[0] || opts[0];
}
export function resolveAll(s, pick) {
  let guard = 0;
  while (s.queue.length && s.status === 'playing' && guard++ < 50) {
    const ev = currentEvent(s);
    const opts = ev.choices.filter(c => !c.disabled);
    let c = pick?.(ev, opts) || defaultChoice(s, opts);
    if (ev.id === 'e429') c = opts.find(o => o.id === 'rent') || c;
    if (ev.id === 'lawsuit') c = opts.find(o => o.id === 'remediate') || c;
    resolveEvent(s, c.id);
  }
}
