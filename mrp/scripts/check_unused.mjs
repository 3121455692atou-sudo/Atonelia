#!/usr/bin/env node
// 死导出检查（规格 P4.1、E7）：src/career 下每个导出的名字，在别的文件（src、server、scripts、tests、index.html）里至少要出现一次；
// 本文件里除了导出那一处也没人用的，就是死代码。按整词匹配，命名空间用法（E.foo）也算用到。
//   node scripts/check_unused.mjs [--json]
// 有意留着、只给外部脚本或手动排查用的名字写进 KEEP，并写明为什么。退出码：有死导出时为 1。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN = ['src', 'server', 'scripts', 'tests'];
// 有意保留的导出：名字 → 原因。
const KEEP = {
  _finishEvalNow: '规格 E7：evals.js 的 _finishEvalNow 留给测试和手动排查，不删',
  ENGINE_COMMANDS: '协议清单（规格 M.6.5）：客户端、服务器和文档共用，只加不删',
  ROOM_COMMANDS: '协议清单（规格 M.6.5）：房间命令，只加不删',
  SYS_COMMANDS: '协议清单（规格 M.6.5、M.6.9a）：系统命令，只加不删',
};

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.') || ent.name === 'node_modules') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(m?js)$/.test(ent.name)) out.push(p);
  }
  return out;
}
const files = SCAN.flatMap(d => (fs.existsSync(path.join(ROOT, d)) ? walk(path.join(ROOT, d)) : []));
const text = new Map(files.map(f => [f, fs.readFileSync(f, 'utf8')]));
const html = fs.existsSync(path.join(ROOT, 'index.html')) ? fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8') : '';
// 去掉注释再数：注释里提到的名字不算用到。
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
const code = new Map([...text].map(([f, t]) => [f, stripComments(t)]));
// 只是转出去（export { x } from '…'）不算用到：要有人真的读它。数“别的文件”时去掉转出语句。
const stripReexports = src => src.replace(/^export\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?/gm, '');
const usage = new Map([...code].map(([f, t]) => [f, stripReexports(t)]));

// 一个文件导出了哪些名字（本地定义的；export * 和 export { x } from 不算定义）。
function exportsOf(src) {
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s+(?:const|let|var)\s+\{([^}]*)\}/gm)) for (const x of m[1].split(',')) { const n = x.split(':').pop().trim(); if (n) names.add(n); }
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}\s*;?\s*$/gm)) for (const x of m[1].split(',')) { const n = x.trim().split(/\s+as\s+/).pop(); if (n && n !== 'default') names.add(n); }
  return names;
}
const count = (src, name) => (src.match(new RegExp(`(?<![\\w$])${name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g')) || []).length;

const dead = [];
for (const f of files.filter(f => f.startsWith(path.join(ROOT, 'src', 'career')))) {
  const src = code.get(f);
  for (const name of exportsOf(src)) {
    if (KEEP[name]) continue;
    let used = count(src, name) > 1;                       // 本文件里除了定义还有人用
    if (!used) for (const [g, t] of usage) if (g !== f && count(t, name) > 0) { used = true; break; }
    if (!used && count(html, name) > 0) used = true;
    if (!used) dead.push({ file: path.relative(ROOT, f), name });
  }
}
if (process.argv.includes('--json')) console.log(JSON.stringify(dead, null, 1));
else {
  for (const d of dead) console.log(`${d.file}  ${d.name}`);
  console.log(dead.length ? `死导出 ${dead.length} 个` : '没有死导出');
}
process.exitCode = dead.length ? 1 : 0;
