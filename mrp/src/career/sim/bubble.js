// AI 泡沫破裂（规格 K5，虚构剧情）。史实局在 BUBBLE.HIST_DAY 那天按玩家自己判；自洽和联机在世界收盘时对全世界判（world/index.js 调 worldBubble）。
// 检查点之前连续 3 个月经营利润为正的大公司能躲过：史实局整段剧情不发生、拿到“扭亏为盈”；自洽和联机任何一家满足，泡沫对全世界都不发生。
// 没躲过：估值 ×0.5、热度降到 0.6、融资和上市（含增发）关 180 天、企业 API 需求 ×0.8、订阅 ×0.9、卡的回收价 ×0.6、租卡 ×0.7，
// 董事会目标里检查点之后到期的经营目标撤掉，换成一条“活下去”。
import { BUBBLE } from '../data/economy.js';
import { addDays, daysBetween } from './clock.js';
import { applyEffects } from './effects.js';
import { log } from './log.js';
import { P } from './provider.js';

// 泡沫状态：{ day, until, averted, by } | null（史实存在 s.bubble；自洽在 world.flags.bubble，经 P().bubble 读）。
export const bubbleOf = s => P().bubble?.(s) ?? s?.bubble ?? null;
export const bubbleActive = (s, day = s?.day) => { const b = bubbleOf(s); return !!b && !b.averted && day >= b.day && day < b.until; };
// 泡沫期间的乘子（没有泡沫时都是 1）。
export const bubbleMult = (s, key) => (bubbleActive(s) ? BUBBLE[key] : 1);

// 大公司：史实看档位（前沿、大厂、主要），自洽看按 V 排的档。
export const isBig = s => BUBBLE.BIG.includes(P().tierOf(s) || s.company?.tier);
// 检查点之前连续 n 个月经营利润为正（月结报表的 profit，含推理成本、研发和折旧）。
export function profitRun(s, n = BUBBLE.PROFIT_MONTHS) {
  const rows = (s.history || []).slice(-n);
  return rows.length === n && rows.every(h => Number.isFinite(h.profit) && h.profit > 0);
}
export const canAvert = s => isBig(s) && profitRun(s);

// 对一家公司落下泡沫（史实和自洽共用）。
export function applyBurst(s, day) {
  applyEffects(s, { valuation: BUBBLE.VAL, demand: { ...BUBBLE.DEMAND, days: BUBBLE.DAYS } }, { source: 'world', id: 'ai_bubble' });
  if (s.capital?.round) { s.capital.round = null; delete s.due?.funding; }
  if (s.capital?.ipo && !s.capital.listed) { s.capital.ipo = null; delete s.due?.ipo; }
  // 董事会：检查点之后到期的经营目标撤掉，换成“活下去”（终局时没破产、没被清算就算达成）。
  const end = (s.goals || []).find(g => g.check?.type === 'final')?.date ?? s.date;
  s.goals = (s.goals || []).filter(g => g.check?.type === 'final' || g.status !== 'pending' || g.date <= s.date);
  if (!s.goals.some(g => g.id === 'survive_bubble')) {
    s.goals.push({ id: 'survive_bubble', date: end, title: '活下去', status: 'pending', check: { type: 'survive' },
      desc: 'AI 泡沫破了。融资和上市的窗口关了半年，客户在砍预算。活到终局就是胜利。' });
    s.goals.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  s.news.unshift({ date: s.date, day, type: 'controversy', title: 'AI 泡沫破裂', detail: '一家明星 AI 公司的融资谈崩，市场意识到这一行几乎没人赚钱。估值腰斩，投资人集体收手。' });
  s.queue.push({ kind: 'notice', title: 'AI 泡沫破裂', text: `投资人终于开始问同一个问题：这一行到底谁在赚钱？答案让他们集体收手。估值腰斩；${BUBBLE.DAYS} 天内谈不成任何融资，也不能上市或增发；企业客户在砍 API 预算，订阅也在流失。好消息只有一个：卡便宜了，租卡价格降了三成。董事会只剩一个目标：活下去。` });
  log(s, 'AI 泡沫破裂：估值腰斩，融资窗口关闭半年');
}
// 躲过：史实局玩家自己（me = true），自洽和联机里由盈利的那一家触发，其余公司只看到新闻。
export function applyAverted(s, day, byName, me) {
  if (me) {
    applyEffects(s, { brand: BUBBLE.AVERT.brand, valuation: BUBBLE.AVERT.valuation }, { source: 'world', id: 'ai_profit' });
    s.marks.ach_profitable = day;
    s.queue.push({ kind: 'notice', title: '扭亏为盈', text: '连续三个月经营利润为正，算上推理、研发和折旧。市场原本在等一个“这一行没人赚钱”的理由，你们给了一个反例。泡沫没有破，你们拿到了一个几乎没人拿到过的成就。' });
    log(s, '隐藏成就：扭亏为盈，泡沫没有破');
  }
  s.news.unshift({ date: s.date, day, type: 'release', title: `${byName} 实现盈利`, detail: '一家大模型公司连续三个月经营盈利，“AI 泡沫论”暂时退潮。' });
}

// 史实局：检查点那天判一次（loop.js 每天调）。之后什么都不做，乘子由 bubbleMult 读。
export function bubbleTick(s) {
  if (P().mode !== 'history' || s.bubble || s.day < BUBBLE.HIST_DAY || s.start >= BUBBLE.HIST_DAY.slice(0, 7)) return null;
  const day = s.day;
  if (canAvert(s)) {
    s.bubble = { day, until: day, averted: true, by: s.charId };
    applyAverted(s, day, s.company.company, true);
  } else {
    s.bubble = { day, until: addDays(day, BUBBLE.DAYS), averted: false, by: null };
    applyBurst(s, day);
  }
  return s.bubble;
}
export const bubbleDaysLeft = s => { const b = bubbleOf(s); return b && !b.averted && s.day < b.until ? daysBetween(s.day, b.until) : 0; };

// 自洽和联机：开局后 75% 处对全世界判一次（world/index.js 的收盘调）。任何一家满足就躲过，泡沫对全世界都不发生。
export function worldBubbleDay(world) {
  const total = daysBetween(world.startDay, world.end) + 1;
  return addDays(world.startDay, Math.floor(total * BUBBLE.WORLD_FRAC));
}
export function worldBubble(world, day = world.day) {
  const f = (world.flags ??= {});
  if (f.bubble || day < worldBubbleDay(world)) return null;
  const live = Object.values(world.companies).filter(c => c.s && c.s.status === 'playing').sort((a, b) => (a.id < b.id ? -1 : 1));
  const winners = live.filter(c => canAvert(c.s));
  // 不止一家时取最近 3 个月经营利润最多的那家拿成就。
  const sum = c => c.s.history.slice(-BUBBLE.PROFIT_MONTHS).reduce((a, h) => a + h.profit, 0);
  const by = winners.sort((a, b) => sum(b) - sum(a) || (a.id < b.id ? -1 : 1))[0] ?? null;
  if (by) {
    f.bubble = { day, until: day, averted: true, by: by.id };
    for (const c of live) applyAverted(c.s, day, by.name, c.id === by.id);
    world.news.unshift({ date: day.slice(0, 7), day, type: 'release', title: `${by.name} 实现盈利，泡沫没有破`, detail: '连续三个月经营盈利。市场找到了“这一行能赚钱”的证据。' });
  } else {
    f.bubble = { day, until: addDays(day, BUBBLE.DAYS), averted: false, by: null };
    for (const c of live) applyBurst(c.s, day);
    world.news.unshift({ date: day.slice(0, 7), day, type: 'controversy', title: 'AI 泡沫破裂', detail: '没有一家大模型公司能证明自己赚钱。估值腰斩，融资和上市的窗口关了半年。' });
  }
  return f.bubble;
}
