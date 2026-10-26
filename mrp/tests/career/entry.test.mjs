// 真实年代经营模式（v0.7）：页面入口。原来在 career.test.mjs 里，按 describe 拆成单独的文件。
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { resolveAll } from '../helpers/career_bot.mjs';
import { CAREER, jsFiles, importsOf, careerRel, specifiersIn } from '../helpers/imports.mjs';
import * as L from '../helpers/legacy_jobs.mjs';

describe('页面入口', () => {
  it('入口：唯一 bootstrap 在隔离验证后动态加载唯一 canonical app，其它模块仍不得导入 app', () => {
    const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)];
    assert.equal(scripts.length, 1, '不能附加会绕过隔离的脚本');
    const srcs = [...html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(srcs, ['./src/career/ui/bootstrap.js']);
    const app = path.join(CAREER, 'ui/app.js'), bootstrap = path.join(CAREER, 'ui/bootstrap.js');
    const files = jsFiles(CAREER);
    assert.ok(files.length >= 60, `src/career 下只扫到 ${files.length} 个模块`);
    const importers = files.filter(f => importsOf(f).some(i => i.target === app)).map(careerRel);
    assert.deepEqual(importers, ['ui/bootstrap.js'], `只有composition root能载入app：${importers.join('、')}`);
    const src = fs.readFileSync(bootstrap, 'utf8');
    const dynamicApp = /\bimport\(\s*['"]\.\/app\.js['"]\s*\)/g;
    assert.equal([...src.matchAll(dynamicApp)].length, 1, '必须只有一个无查询串的动态app导入');
    assert.deepEqual(specifiersIn(src.replace(dynamicApp, 'APP_LOADER')), ['./practice_context.js'], '删去唯一dynamic app后，只能静态导入纯隔离模块');
    assert.match(src, /bootWithPractice\(\{ loadApp: async \(\) =>/);
    assert.match(src, /await app\.bootReady/);
    const context = path.join(CAREER, 'ui/practice_context.js');
    assert.deepEqual(importsOf(context), [], '隔离叶模块不得预载UI/engine');
    const boundary = fs.readFileSync(context, 'utf8');
    assert.match(boundary, /const kind = installPracticeContext\(global, href\);\s*await loadApp\(\)/, '先完整验证隔离，再调用loader');
  });
  it('预训练进度按月推进，界面上的预计月数和实际推进一致', () => {
    const s = E.createGame('qwen', 'y2023', 4);
    resolveAll(s);
    L.startProject(s, { total: 7, active: 7, arch: 'dense', tokens: 1 });
    const eta = Math.ceil(E.projectEta(s));
    let n = 0;
    while (E.hasBaseJob(s) && n < 12) { L.act(s, 'research'); resolveAll(s); n += 1; }
    assert.equal(E.hasBaseJob(s), false, '项目没有完成');
    assert.ok(Math.abs(n - eta) <= 1, `预计 ${eta} 个月，实际 ${n} 个月`);
  });
});
