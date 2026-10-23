// 用 docs/research/timeline-2023-2026.json 给对手发布补上具体到日的日期，生成 src/career/data/release_days_gen.js。
// 匹配规则：型号名按 norm() 规范化（去括号内容、空白和标点，转小写）后相等，且 timeline 条目的日期是“YYYY-MM-DD”、月份等于 RAW 行的月份。
// timeline 里的合并条目（“Grok 4 / Grok 4 Heavy”“Llama 2 (7B/13B/70B)”“FLUX.1 [pro] / [dev]”）先展开成别名再比。
// 匹配不到的行不在这里补：手写进 data/release_days_overrides.js（带出处）。手写的优先于生成的。
// 用法：node scripts/build_release_days.mjs          生成并打印报告（有缺口时退出码 1）
//       node scripts/build_release_days.mjs --check  只检查已提交的 release_days_gen.js 是不是最新、缺口是不是补全了
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RAW_RELEASES, FAMILIES } from '../src/career/data/rivals.js';
import { RELEASE_DAYS_OVERRIDES } from '../src/career/data/release_days_overrides.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GEN_FILE = ROOT + 'src/career/data/release_days_gen.js';
const TIMELINE = ROOT + 'docs/research/timeline-2023-2026.json';

export const norm = s => String(s).normalize('NFKC').toLowerCase().replace(/（.*?）|\(.*?\)/g, '').replace(/[\s\-_·.]/g, '');
const flat = s => String(s).normalize('NFKC').toLowerCase().replace(/[\s\-_·.()]/g, '');

// timeline 的一个型号名 → 可以单独匹配的规范化别名集合。
export function aliases(model) {
  const m = String(model).normalize('NFKC').trim();
  const out = new Set([norm(m)]);
  let base = m, inner = null;
  const g = m.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (g) { base = g[1]; inner = g[2]; }
  // “Llama 2 (7B/13B/70B)”“Gemma 2（9B / 27B）”：括号里是并列的规格，展开成“Llama 2 70B”。
  if (inner && /[\/、]/.test(inner)) for (const v of inner.split(/\s*[\/、]\s*/)) out.add(norm(`${base} ${v}`));
  else if (inner) out.add(flat(m));
  out.add(norm(base));
  // “A / B / C”：逐个展开；“FLUX.1 [pro] / [dev]”里只有方括号的部分，借第一个的前缀。
  const parts = base.split(/\s+\/\s+|\/(?=\s*\[)/).map(x => x.trim()).filter(Boolean);
  if (parts.length > 1) {
    const stem = parts[0].replace(/\s*\[[^\]]*\]\s*$/, '');
    for (const [i, p] of parts.entries()) out.add(norm(i > 0 && p.startsWith('[') ? `${stem} ${p}` : p));
  }
  return out;
}

// 返回 { gen: { 型号: 日期 }, via: { 型号: timeline 条目名 }, multi: [...] }
export function matchDays(rows = RAW_RELEASES, timeline = JSON.parse(fs.readFileSync(TIMELINE, 'utf8')).releases) {
  const idx = new Map();
  for (const t of timeline) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date)) continue;
    for (const a of aliases(t.model)) { if (!idx.has(a)) idx.set(a, []); idx.get(a).push(t); }
  }
  const gen = {}, via = {}, multi = [];
  for (const [, date, name] of rows) {
    const hits = (idx.get(norm(name)) || []).filter(t => t.date.slice(0, 7) === date);
    if (!hits.length) continue;
    const days = [...new Set(hits.map(t => t.date))].sort();
    gen[name] = days[0]; via[name] = hits[0].model;
    if (days.length > 1) multi.push(`${name}：${hits.map(t => `${t.date} ${t.model}`).join(' | ')}（取最早）`);
  }
  return { gen, via, multi };
}

export const renderGen = gen => `// 自动生成，不要手改：node scripts/build_release_days.mjs
// 来源：docs/research/timeline-2023-2026.json，按规范化后的型号名匹配（见 scripts/build_release_days.mjs）。匹配不到的行手写在 release_days_overrides.js。
export const RELEASE_DAYS_GEN = {
${RAW_RELEASES.filter(r => gen[r[2]]).map(r => `  '${r[2].replace(/'/g, "\\'")}': '${gen[r[2]]}',`).join('\n')}
};
`;

// 缺口：LLM 行、开源行、pusher 家族的行必须有日期（生成的或手写的）；手写的日期必须落在 RAW 行的月份里。
export function gaps(gen) {
  const missing = [], badMonth = [];
  for (const [family, date, name, , open] of RAW_RELEASES) {
    const f = FAMILIES[family];
    const day = RELEASE_DAYS_OVERRIDES[name]?.day ?? gen[name];
    if (RELEASE_DAYS_OVERRIDES[name] && !RELEASE_DAYS_OVERRIDES[name].src) badMonth.push(`${name}：手写日期没有出处`);
    if (!day) { if (f.mod === 'llm' || open || f.pusher) missing.push(`${name}（${family} ${date}）`); continue; }
    if (day.slice(0, 7) !== date) badMonth.push(`${name}：日期 ${day} 不在 RAW 的月份 ${date}`);
  }
  const unused = Object.keys(RELEASE_DAYS_OVERRIDES).filter(n => !RAW_RELEASES.some(r => r[2] === n));
  return { missing, badMonth, unused };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');
  const { gen, via, multi } = matchDays();
  const text = renderGen(gen);
  const { missing, badMonth, unused } = gaps(gen);
  const overlap = Object.keys(RELEASE_DAYS_OVERRIDES).filter(n => gen[n]);
  const diff = overlap.filter(n => RELEASE_DAYS_OVERRIDES[n].day !== gen[n]);
  let bad = missing.length + badMonth.length + unused.length;
  if (check) {
    const cur = fs.readFileSync(GEN_FILE, 'utf8');
    if (cur !== text) { console.log('release_days_gen.js 不是最新：请运行 node scripts/build_release_days.mjs'); bad++; }
  } else fs.writeFileSync(GEN_FILE, text);
  const approx = Object.entries(RELEASE_DAYS_OVERRIDES).filter(([, e]) => e.approx).map(([n, e]) => `${n} ${e.day}`);
  console.log(`RAW ${RAW_RELEASES.length} 行：timeline 匹配 ${Object.keys(gen).length} 行，手写 ${Object.keys(RELEASE_DAYS_OVERRIDES).length} 行（其中 ${overlap.length} 行与生成结果重叠，${diff.length} 行日期不同），其余用 dayInMonth 哈希兜底`);
  if (multi.length) console.log('同月有多个候选，取最早：\n  ' + multi.join('\n  '));
  if (diff.length) console.log('手写覆盖了生成结果：\n  ' + diff.map(n => `${n}：手写 ${RELEASE_DAYS_OVERRIDES[n].day}，timeline ${gen[n]}（${via[n]}）`).join('\n  '));
  console.log(`approx（具体日待核实）${approx.length} 条：\n  ` + approx.join('\n  '));
  if (missing.length) console.log('缺日期的 LLM / 开源 / pusher 行：\n  ' + missing.join('\n  '));
  if (badMonth.length) console.log('手写日期有问题：\n  ' + badMonth.join('\n  '));
  if (unused.length) console.log('手写条目对不上任何 RAW 行：\n  ' + unused.join('\n  '));
  process.exit(bad ? 1 : 0);
}
