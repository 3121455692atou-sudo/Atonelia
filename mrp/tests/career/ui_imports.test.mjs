// 界面只能从 engine.js 导入引擎（规格 §1.1，P0清理）：src/career/ui/** 下的文件只能导入 ui 内部模块、../engine.js 和 data/ 下的纯数据模块，
// 不能直接导入 sim/。data/ 下被界面导入的模块自己也不能依赖 sim/、ui/ 或 engine.js（否则就不“纯”了）。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CAREER, jsFiles, importsOf, specifiersIn, careerRel } from '../helpers/imports.mjs';

const UI = path.join(CAREER, 'ui');
const uiFiles = jsFiles(UI);

describe('界面的导入范围', () => {
  it('扫描器认得各种写法：多行 import、export ... from、副作用导入、动态 import()；不把注释和字符串里的文字当导入', () => {
    const src = [
      "import { a } from './a.js';",
      "import * as B from '../b.js';",
      "import {",
      "  c,",
      "  d,",
      "} from './c.js';",
      "export * from './e.js';",
      "export { f } from './f.js';",
      "import './g.js';",
      "const h = await import('./h.js');",
      "// import { x } from './comment.js';",
      "const s = \"hello from 'str.js'\";",
    ].join('\n');
    assert.deepEqual(specifiersIn(src).sort(), ['../b.js', './a.js', './c.js', './e.js', './f.js', './g.js', './h.js']);
  });

  it('ui/ 下每个文件的导入都在允许范围内：ui 内部、../engine.js、data/；不碰 sim/', () => {
    assert.ok(uiFiles.length >= 30, `ui/ 下只有 ${uiFiles.length} 个模块`);
    const bad = [];
    let seen = 0;
    for (const f of uiFiles) {
      for (const { spec, target } of importsOf(f)) {
        seen++;
        const where = `${careerRel(f)} 导入 ${spec}`;
        if (!target) { bad.push(`${where}（不是相对路径）`); continue; }
        if (!fs.existsSync(target)) { bad.push(`${where}（文件不存在）`); continue; }
        const rel = careerRel(target);
        const ok = rel.startsWith('ui/') || rel === 'engine.js' || rel.startsWith('data/');
        if (!ok) bad.push(`${where}（${rel}：界面只能从 engine.js 导入引擎，不能直接导入 ${rel.split('/')[0]}/）`);
      }
    }
    assert.ok(seen > 100, `只扫到 ${seen} 条导入，扫描器可能失灵了`);
    assert.deepEqual(bad, []);
  });

  it('src/career 下的文件都要能在浏览器里加载：只用相对路径导入，不导入 node: 内置模块或裸包名', () => {
    // M1a 曾在 world/index.js 里 import 'node:crypto'，Node 测试全过，浏览器里整页白屏（引擎经 export * 转出世界模块）。
    const bad = jsFiles(CAREER).flatMap(f => importsOf(f).filter(i => !i.spec.startsWith('.')).map(i => `${careerRel(f)}: ${i.spec}`));
    assert.deepEqual(bad, []);
  });

  it('界面确实经由 engine.js 取引擎（不是干脆什么都不导入）', () => {
    const viaEngine = uiFiles.filter(f => importsOf(f).some(i => i.target && careerRel(i.target) === 'engine.js'));
    assert.ok(viaEngine.length >= 15, `只有 ${viaEngine.length} 个界面文件从 engine.js 导入`);
  });

  it('界面导入的 data/ 模块都是纯数据：自己只导入 data/ 下的别的模块', () => {
    const dataFiles = new Set();
    for (const f of uiFiles) for (const { target } of importsOf(f)) if (target && careerRel(target).startsWith('data/')) dataFiles.add(target);
    assert.ok(dataFiles.size >= 5, `界面只导入了 ${dataFiles.size} 个 data/ 模块`);
    const bad = [];
    for (const f of dataFiles) {
      for (const { spec, target } of importsOf(f)) {
        if (!target || !careerRel(target).startsWith('data/')) bad.push(`${careerRel(f)} 导入 ${spec}`);
      }
    }
    assert.deepEqual(bad, []);
  });
});
