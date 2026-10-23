// 静态检查用的小工具：列出目录下的 .js 文件，以及每个文件导入了哪些模块（静态 import、export ... from、动态 import()）。
// 用正则扫源码，够用于这个项目的写法（单引号、import 语句从行首开始）；扫描器本身在 tests/career/ui_imports.test.mjs 里有样例测试。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 测试环境：读写已经删掉的 s.project、s.focus 直接抛错（规格 T11.2）。
globalThis.__MRP_STRICT__ = true;

export const CAREER = fileURLToPath(new URL('../../src/career/', import.meta.url));

// 目录下（含子目录）所有 .js 文件的绝对路径，排序。隐藏文件（.DS_Store、外置盘上自动生成的 ._ 伴随文件）不算。
export function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (e.name.startsWith('.')) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? jsFiles(p) : e.name.endsWith('.js') ? [p] : [];
  }).sort();
}

// 一段源码里写出来的模块名（原样，不解析路径）。
export function specifiersIn(src) {
  const out = [];
  for (const m of src.matchAll(/^\s*(?:import|export)\s[^'"`;]*?\sfrom\s*['"]([^'"]+)['"]/gm)) out.push(m[1]);
  for (const m of src.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) out.push(m[1]);
  for (const m of src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  return out;
}

// 一个文件导入的模块：{ spec: 原样写法, target: 相对路径解析后的绝对路径；不是相对路径的写法（node:fs、网址）target 为 null }。
export function importsOf(file) {
  return specifiersIn(fs.readFileSync(file, 'utf8')).map(spec => ({
    spec,
    target: spec.startsWith('.') ? path.resolve(path.dirname(file), spec.replace(/[?#].*$/, '')) : null,
  }));
}

// 相对 src/career/ 的路径，用 / 分隔，方便比较。
export const careerRel = file => path.relative(CAREER, file).split(path.sep).join('/');
