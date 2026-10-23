// M0 世界原型：用子进程跑 120 天，确认能跑通、报错为 0，并且世界账本至少挂上过一次 SOTA。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCRIPT = fileURLToPath(new URL('../../scripts/world_proto.mjs', import.meta.url));

describe('world_proto（M0 施工包第③条）', () => {
  it('3 家从零开局跑 120 天：退出码 0、0 报错、至少挂上过一次 SOTA', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--days', '120'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 180000,
    });
    assert.equal(r.error, undefined, r.error?.message);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const text = `${r.stdout || ''}\n${r.stderr || ''}`;
    assert.match(text, /0 报错/, '输出里要有“0 报错”');
    assert.doesNotMatch(text, /报错：[1-9]/, '不能有非零报错');
    assert.match(text, /SOTA 第一次挂上：\d{4}-\d{2}-\d{2}/, '世界账本要至少挂上过一次 SOTA');
    assert.match(text, /2023-01-01 起点 q=/, '学界起点要按 M.3.7 算出来');
  });
});
