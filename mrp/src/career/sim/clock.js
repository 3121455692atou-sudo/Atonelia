// 按天推进用的日期工具。存档里 s.day 是 'YYYY-MM-DD'，s.date 仍是月份键 'YYYY-MM'（榜单、发布、股价等数据都按月索引）。
import { hash01 } from './util.js';

const utc = day => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
const fromUtc = t => { const d = new Date(t); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };

export const dayKey = (ym, d) => `${ym}-${String(d).padStart(2, '0')}`;
export const monthOf = day => day.slice(0, 7);
export function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export const addDays = (day, n) => fromUtc(utc(day) + n * 864e5);
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);
export const fmtDay = day => `${Number(day.slice(0, 4))} 年 ${Number(day.slice(5, 7))} 月 ${Number(day.slice(8, 10))} 日`;
export const fmtShortDay = day => `${Number(day.slice(5, 7))} 月 ${Number(day.slice(8, 10))} 日`;
// 只知道月份的事件落在当月哪一天：按 id 散列，避开月初扎堆。同一个 id 每次都落在同一天。
export function dayInMonth(ym, id, from = 2, to = 26) {
  const last = Math.min(to, daysInMonth(ym));
  return dayKey(ym, from + Math.floor(hash01(`${id}|day`) * (last - from + 1)));
}
// “还有多久”：天数换成人话。
export function inDays(n) {
  if (n <= 0) return '今天';
  if (n === 1) return '明天';
  if (n < 14) return `${n} 天后`;
  if (n < 60) return `约 ${Math.round(n / 7)} 周后`;
  return `约 ${Math.round(n / 30)} 个月后`;
}
