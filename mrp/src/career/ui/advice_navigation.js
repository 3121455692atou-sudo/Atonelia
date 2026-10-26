// 只存界面上的推荐对象；导航不提交研究命令，也不改变玩家的托管授权。
const researchPicks = new WeakMap();
export function setResearchRecommendation(S, id) {
  if (S && typeof id === 'string') researchPicks.set(S, id);
}
export const researchRecommendation = S => researchPicks.get(S) ?? null;

// 顾问的执行数据仍供机器人/明确授权的托管使用；手动入口独立呈现为审阅与选择。
export function manualAdvice(a) {
  if (a.op?.type === 'tech') return { ...a, kind: 'page', label: a.label.replace(/^研究：/, '去研究页挑选 · '), detail: `${a.detail} 打开研究页查看推荐并自行选择，不会立即开始。` };
  if (a.op?.type === 'ipo') return { ...a, kind: 'page', label: '审议 IPO 上市方案', detail: '查看当前上市条件、预计募资、持股变化与风险；明确确认后才启动，不会立即上市。' };
  return a;
}
