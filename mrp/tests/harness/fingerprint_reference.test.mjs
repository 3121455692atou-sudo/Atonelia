import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STATE = { start: '2024-01', day: '2024-04-01', status: 'ended', seed: 1, marker: 1 };
const hash = s => crypto.createHash('sha256').update(JSON.stringify(s)).digest('hex').slice(0, 16);
function fixture(t, nested = false) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mrp-fp-ref-'));
  const root = nested ? path.join(repo, 'mrp') : repo;
  fs.mkdirSync(root, { recursive: true });
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const put = (p, s) => { const f = path.join(root, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
  put('package.json', '{"type":"module"}');
  put('scripts/fingerprint.mjs', fs.readFileSync(path.join(ROOT, 'scripts/fingerprint.mjs')));
  put('src/career/data/core.js', "export const COMPANIES=[{id:'demo'}]; export const SCENARIOS=[{id:'y2024'}];");
  put('src/career/sim/clock.js', 'export const daysBetween=()=>90;');
  put('tests/helpers/career_bot.mjs', `export function playGame(c,sc,seed,{onWeek}) { const s=${JSON.stringify(STATE)}; onWeek(s); return {s,errors:[]}; } export const playAdvised=playGame;`);
  const rec = { final: hash(STATE), cp: [hash(STATE)], day: STATE.day, status: STATE.status, errors: 0 };
  const base = { version: 1, seed: 1, checkpointDays: 90, node: process.version, games: { 'demo/y2024/bot': rec } };
  const save = () => put('tests/fixtures/fingerprint.json', JSON.stringify(base));
  save();
  const git = (...args) => { const r = spawnSync('git', ['-c','core.hooksPath=/dev/null','-c','user.name=QA','-c','user.email=qa@example.invalid',...args], {cwd:repo,encoding:'utf8'}); assert.equal(r.status,0,r.stderr); return r.stdout.trim(); };
  git('init','-q'); git('add','.'); git('commit','-qm','reference');
  const run = () => spawnSync(process.execPath, ['scripts/fingerprint.mjs','--diff','demo','y2024','--mode','bot'], {cwd:root,encoding:'utf8',timeout:10000});
  return { root, base, rec, save, run, put, ref: git('rev-parse', 'HEAD') };
}
test('参考与当前相同但不符合原fixture时不能退出成功', t => {
  const f=fixture(t); f.rec.final='0'.repeat(16); f.save(); const r=f.run();
  assert.equal(r.status,2,r.stdout+r.stderr); assert.match(r.stdout,/UNVERIFIED_REFERENCE/);
  assert.doesNotMatch(r.stdout,/与基线代码一致/);
});
test('参考终局相同但检查点与原fixture不同也不可确认为基线', t => {
  const f=fixture(t); f.rec.cp=['0'.repeat(16)]; f.save(); const r=f.run();
  assert.equal(r.status,2,r.stdout+r.stderr); assert.match(r.stdout,/UNVERIFIED_REFERENCE/);
});
test('缺失原fixture不能以当前与ref相同宣称验收', t => {
  const f=fixture(t); fs.unlinkSync(path.join(f.root,'tests/fixtures/fingerprint.json')); const r=f.run();
  assert.equal(r.status,2,r.stdout+r.stderr); assert.match(r.stdout,/UNVERIFIED_REFERENCE/);
});
test('参考day/status/errors逐项核对，非正常结束不认可', t => {
  for (const [key,value] of [['day','2024-04-02'],['status','playing'],['errors',1]]) {
    const f=fixture(t); f.rec[key]=value; f.save(); const r=f.run();
    assert.equal(r.status,2,`${key}: ${r.stdout}${r.stderr}`);
  }
});
test('可信参考且当前相同保持退出0', t => {
  const f=fixture(t); const r=f.run(); assert.equal(r.status,0,r.stdout+r.stderr); assert.match(r.stdout,/与基线代码一致/);
});
test('可信参考且当前代码发生真实变化保持退出1', t => {
  const f=fixture(t); const file=path.join(f.root,'tests/helpers/career_bot.mjs'); fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('"marker":1','"marker":2'));
  const r=f.run(); assert.equal(r.status,1,r.stdout+r.stderr); assert.match(r.stdout,/s.marker/);
});

// 公开快照的 Git 根在包根、游戏在 mrp/；archive 必须保留原相对导入布局。
for (const kind of ['可信相同', '参考未验证', '可信差异']) test(`包根含mrp的Git布局：${kind}`, t => {
  const f = fixture(t, true);
  if (kind === '参考未验证') { f.rec.final = '0'.repeat(16); f.save(); }
  if (kind === '可信差异') {
    const file = path.join(f.root, 'tests/helpers/career_bot.mjs');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"marker":1', '"marker":2'));
  }
  const r = f.run(), expected = kind === '可信相同' ? 0 : kind === '参考未验证' ? 2 : 1;
  assert.equal(r.status, expected, r.stdout + r.stderr);
  assert.doesNotMatch(r.stderr, /fatal:|ERR_MODULE_NOT_FOUND/);
  assert.ok(r.stdout.includes(f.ref.slice(0, 12)), '自动定位到修改fixture的真实提交');
  const cache = path.join(f.root, '.fp-cache', f.ref.slice(0, 12));
  assert.ok(fs.existsSync(path.join(cache, 'package.json')), '缓存正确剥离mrp前缀');
  assert.ok(fs.existsSync(path.join(cache, 'src/career/data/core.js')));
  assert.equal(f.run().status, expected, '再次运行复用同一缓存仍保持退出语义');
  assert.match(r.stdout, kind === '可信相同' ? /与基线代码一致/ : kind === '参考未验证' ? /UNVERIFIED_REFERENCE/ : /s.marker/);
});
