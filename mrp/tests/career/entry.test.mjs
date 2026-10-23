// 真实年代经营模式（v0.7）：页面入口。原来在 career.test.mjs 里，按 describe 拆成单独的文件。
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { resolveAll } from '../helpers/career_bot.mjs';
import { CAREER, jsFiles, importsOf, careerRel } from '../helpers/imports.mjs';
import * as L from '../helpers/legacy_jobs.mjs';

describe('页面入口', () => {
  it('入口：index.html 只加载 ui/app.js 这一个脚本，且没有任何模块从 ui/app.js 导入', () => {
    const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const srcs = [...html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(srcs, ['./src/career/ui/app.js']);
    const app = path.join(CAREER, 'ui/app.js');
    const files = jsFiles(CAREER);
    assert.ok(files.length >= 60, `src/career 下只扫到 ${files.length} 个模块`);
    const importers = files.filter(f => importsOf(f).some(i => i.target === app)).map(careerRel);
    assert.deepEqual(importers, [], `这些模块从 ui/app.js 导入：${importers.join('、')}`);
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
