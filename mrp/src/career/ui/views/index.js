// 事件视图登记表（规格 §1.1）：currentEvent 返回的 view.kind → 怎么演出。P0.3a 一次登记全，各界面包只填自己的文件，不改这里。
// 每个视图模块导出 play(S, view) → Promise<选项 id>；没登记、或者模块还是存根（play 为 null）的种类，用 vn.js 的 playEvent（对话 + 选项）。
// 董事会目标（goal / board）有自己的检查和评测演出，仍在 flow.js 里处理。
import { playEvent } from '../vn.js';
import * as strategy from './strategy.js';
import { openIpoDecision } from '../ipo_decision.js';

// IPO 事件的“开始”先进入同一决策页；返回不执行、不消费原卡片。
async function playDecisionEvent(S, view) {
  if (view.id !== 'ipo_window') return playEvent(S, view);
  const review = { ...view, choices: view.choices.map(c => c.id === 'start' ? { ...c, label: '查看上市决策', hint: '先核对条件、募资与稀释；不会直接启动' } : c) };
  while (true) {
    const choice = await playEvent(S, review);
    if (choice !== 'start') return choice;
    const out = await openIpoDecision(S, { event: true });
    if (out.dismissed) return null;
    if (out.confirmed) return 'start';
  }
}
const VIEWS = { strategy, event: { play: playDecisionEvent } };
export const viewFor = kind => VIEWS[kind]?.play || playEvent;
