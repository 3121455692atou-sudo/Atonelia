#!/usr/bin/env node
// SOTA 报告（规格 D3、D4、D10；P1.1 起以它为准，docs/spec/tools/sota_check.mjs 只留作历史对照）。只读，不写任何文件。
//   node scripts/sota_report.mjs              逐月打印四个模态的 SOTA 标签持有者（SOTA_HISTORY，全部行在场），
//                                             再做 D4 的“跟随者不超过同期 SOTA”复核，列出离红线 ≤ 0.3 分的行和全部日期待核实（approx）的行。
//   node scripts/sota_report.mjs --labels     另外打印标签链：每一枚怎么挂上的（fill / swap / self）、算不算“炼出”（counted、countedAt）、持到哪天。
//   node scripts/sota_report.mjs --mod llm    只看一个模态。
// 有违规时退出码为 1。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RELEASES, FAMILIES } from '../src/career/data/rivals.js';
import { RELEASE_DAYS_OVERRIDES } from '../src/career/data/release_days_overrides.js';
import { FOLLOW_GAP, OPEN_GAP_LLM } from '../src/career/data/balance.js';
import { qOf, SOTA_HISTORY } from '../src/career/sim/sota.js';

export const MODS = ['llm', 'image', 'music', 'speech'];
const MOD_NAME = { llm: '语言模型', image: '图像', music: '音乐', speech: '语音' };
// 要加例外必须写理由（规格 D4 第 1 条）。
export const SOTA_EXCEPTIONS = [];
const NEAR = 0.3;

// D4 第 1 条：按日逐条检查。跟随者（开源，或家族不是 pusher）必须 q ≤ sotaBefore − 间隔（LLM 开源行 1.5，其余 1.0）；
// sotaBefore = 更早日期的全部发布，加上同一天的闭源发布（不论跟随者自己开不开源，和运行时 pushEnvelope 按 r.day 当天可见的口径一致）；
// 这个模态此前没有任何发布时跳过。
export function followerCheck(mods = MODS) {
  const violations = [], margins = [], skipped = [];
  for (const mod of mods) {
    const list = RELEASES.filter(r => r.mod === mod);
    for (const r of list) {
      const before = list.filter(x => x !== r && (x.day < r.day || (x.day === r.day && !x.open)));
      if (!before.length) { skipped.push(r); continue; }
      const follower = r.open || !FAMILIES[r.family].pusher;
      if (!follower) continue;
      const sota = Math.max(...before.map(x => qOf(mod, x.dims)));
      const gap = mod === 'llm' && r.open ? OPEN_GAP_LLM : FOLLOW_GAP;
      const margin = sota - gap - qOf(mod, r.dims);
      const row = { mod, name: r.name, day: r.day, q: qOf(mod, r.dims), sota, margin };
      margins.push(row);
      if (margin < -1e-9 && !SOTA_EXCEPTIONS.some(x => x.name === r.name)) violations.push(row);
    }
  }
  return { violations, margins, near: margins.filter(x => x.margin <= NEAR + 1e-9).sort((a, b) => a.margin - b.margin), skipped };
}
// 某一天的标签持有者（SOTA_HISTORY，全部行在场）。
export const holderOn = (mod, day) => (SOTA_HISTORY[mod] || []).find(h => h.since <= day && (!h.until || day < h.until)) || null;
// 日期只有月份有出处、具体日待核实的行（D2：overrides 里写了 approx 的）。
export const approxRows = () => RELEASES.filter(r => RELEASE_DAYS_OVERRIDES[r.name]?.approx);

function months(from, to) {
  const out = [];
  for (let [y, m] = from.split('-').map(Number); `${y}-${String(m).padStart(2, '0')}` <= to; m === 12 ? (y++, m = 1) : m++) out.push(`${y}-${String(m).padStart(2, '0')}`);
  return out;
}
const f2 = x => x.toFixed(2);

function main(argv) {
  const labels = argv.includes('--labels');
  const mods = argv.includes('--mod') ? [argv[argv.indexOf('--mod') + 1]] : MODS;
  for (const mod of mods) {
    console.log(`\n## ${MOD_NAME[mod] || mod}：逐月 SOTA 持有者（月底那天；全部行在场）`);
    for (const m of months('2022-01', '2026-10')) {
      const h = holderOn(mod, `${m}-31`);
      console.log(`  ${m}  ${h ? `${h.name}（${FAMILIES[h.by]?.company || h.org}，q ${f2(h.q)}${h.counted && h.countedAt <= `${m}-31` ? '' : '，还不算炼出'}）` : '—（场地不足两家）'}`);
    }
    if (labels) {
      console.log(`\n## ${MOD_NAME[mod] || mod}：标签链`);
      for (const h of SOTA_HISTORY[mod] || []) {
        console.log(`  ${h.since}  ${h.name}（${h.org}）q ${f2(h.q)}  via ${h.via}  counted ${h.counted}${h.countedAt ? `（${h.countedAt}）` : ''}  持到 ${h.until || '至今'}`);
      }
    }
  }
  const { violations, near, skipped } = followerCheck(mods);
  console.log(`\n## D4 跟随者复核（闭源跟随者间隔 ${FOLLOW_GAP}，开源 LLM ${OPEN_GAP_LLM}，同日闭源算在前；例外 ${SOTA_EXCEPTIONS.length} 条）`);
  console.log(`  各模态第一条跳过：${skipped.map(r => `${r.mod} ${r.day} ${r.name}`).join('；')}`);
  console.log(`  违规 ${violations.length} 条${violations.map(v => `\n    ${v.mod} ${v.day} ${v.name} q ${f2(v.q)}，同期最强 ${f2(v.sota)}，越线 ${f2(-v.margin)}`).join('')}`);
  console.log(`  离红线 ≤ ${NEAR} 的行（改数据时必须看）：${near.map(x => `${x.name} ${f2(x.margin)}`).join('；') || '无'}`);
  const approx = approxRows();
  console.log(`\n## 日期待核实（approx）的行，共 ${approx.length} 条`);
  for (const r of approx) console.log(`  ${r.day}  ${r.name}（${FAMILIES[r.family].company}）  出处：${RELEASE_DAYS_OVERRIDES[r.name].src}`);
  return violations.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
