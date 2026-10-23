// 防止测试被静默跳过：npm test 只跑 tests/**/*.test.mjs，所以 tests/ 下除了 helpers/ 和 fixtures/，
// 其余文件都必须叫 *.test.mjs。不小心写成 foo.mjs 或 test_foo.mjs 的测试，不会被跑到，这里直接报错。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TESTS = path.dirname(fileURLToPath(import.meta.url));
const SKIP = new Set(['helpers', 'fixtures']);

// 隐藏文件（.DS_Store、外置盘上 macOS 自动生成的 ._ 伴随文件）不算。
function files(dir, rel = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (e.name.startsWith('.')) return [];
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) return !rel && SKIP.has(e.name) ? [] : files(path.join(dir, e.name), r);
    return [r];
  });
}

test('tests/ 下（helpers/、fixtures/ 除外）的文件都叫 *.test.mjs', () => {
  const all = files(TESTS);
  assert.ok(all.length > 1, '至少该找到几个测试文件');
  const stray = all.filter(f => !f.endsWith('.test.mjs'));
  assert.deepEqual(stray, [], `这些文件不叫 *.test.mjs，npm test 不会跑它们：${stray.join('、')}`);
});
