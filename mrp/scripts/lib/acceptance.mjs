// 验收不把空样本、旧结果或 JSON 丢失的非有限数当成零。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
export const sha256 = x => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
export function positiveInt(x, label) {
  const n = Number(x);
  if (!Number.isSafeInteger(n) || n < 1 || n > 0xffffffff) throw new Error(`${label} 必须是 1..4294967295 的整数`);
  return n;
}
export function seedsFrom(file, count, scale = 1) {
  if (!file) return Array.from({ length: positiveInt(count, 'seeds') }, (_, i) => (i + 1) * scale);
  const seeds = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(seeds) || !seeds.length) throw new Error('seed-list 必须是非空 JSON 数组');
  seeds.forEach(s => { if (typeof s !== 'number') throw new Error('seed 必须是数字'); positiveInt(s, 'seed'); });
  if (new Set(seeds).size !== seeds.length) throw new Error('seed-list 重复');
  return seeds;
}
export function parseOptions(args, values, flags = []) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const k = args[i];
    if (Object.hasOwn(out, k)) throw new Error(`重复参数 ${k}`);
    if (flags.includes(k)) out[k] = true;
    else if (values.includes(k) && args[i + 1] != null && !args[i + 1].startsWith('--')) out[k] = args[++i];
    else throw new Error(`未知参数或缺值 ${k}`);
  }
  if (out['--seed-list'] && out['--seeds']) throw new Error('--seed-list 与 --seeds 不能混用');
  return out;
}
export function sourceIdentity(root) {
  const files = [];
  const visit = dir => { for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) visit(rel);
    else if (e.isFile()) files.push([rel, sha256(fs.readFileSync(path.join(root, rel)).toString('base64'))]);
  } };
  for (const dir of ['src', 'content']) visit(dir);
  return { commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sourceSha256: sha256(files) };
}
export function finiteProblems(value, at = '$', out = []) {
  if (typeof value === 'number' && !Number.isFinite(value)) out.push(at);
  else if (value && typeof value === 'object') for (const [k,v] of Object.entries(value)) finiteProblems(v, `${at}.${k}`, out);
  return out;
}
export const f4Key = r => `${r.mode}/${r.id}/${r.sc}/${r.rawSeed}`;
export const worldKey = r => `${r.kind}/${r.year}/${r.tier ?? 'specialist'}/${r.n ?? 6}/${r.seed}/${r.shift ?? 0}`;
export function checkRows(rows, manifest, keyOf, required = []) {
  const problems = [];
  if (!manifest || !Array.isArray(manifest.expectedKeys) || !manifest.expectedKeys.length) return ['缺少非空预期样本清单'];
  const expected = new Set(manifest.expectedKeys), seen = new Set();
  if (expected.size !== manifest.expectedKeys.length) problems.push('manifest 预期键重复');
  for (const r of rows) {
    const k = keyOf(r);
    if (seen.has(k)) problems.push(`重复 ${k}`);
    seen.add(k);
    if (!expected.has(k)) problems.push(`非预期 ${k}`);
    if (r.runId !== manifest.runId || r.sourceSha256 !== manifest.sourceSha256 || r.commit !== manifest.commit) problems.push(`来源不符 ${k}`);
    if (r.completed !== true || r.thrown || r.error || r.nan || r.errors !== 0 || r.bad?.length || r.paused) problems.push(`未完成或有错误 ${k}`);
    for (const f of required) if (typeof r[f] !== 'number' || !Number.isFinite(r[f])) problems.push(`数值无效 ${k}.${f}`);
    for (const f of finiteProblems(r)) problems.push(`非有限数 ${k}${f}`);
  }
  for (const k of expected) if (!seen.has(k)) problems.push(`缺行 ${k}`);
  if (rows.length !== expected.size) problems.push(`样本数 ${rows.length} != ${expected.size}`);
  return problems;
}
export function verdict(numerator, denominator, min = -Infinity, max = Infinity) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 'UNVERIFIED';
  return numerator / denominator >= min && numerator / denominator <= max ? 'PASS' : 'FAIL';
}
export function compareStrictReports(base, current) {
  const problems = [];
  if (base.node !== current.node || base.seed !== current.seed || base.problems?.length || current.problems?.length) problems.push('基线环境/种子/完整性不符');
  const keys = new Set([...Object.keys(base.games || {}), ...Object.keys(current.games || {})]);
  if (!keys.size) problems.push('指纹样本为空');
  for (const k of keys) {
    for (const r of [base.games?.[k], current.games?.[k]]) {
      if (!r || !/^[0-9a-f]{64}$/.test(r.sha256 || '') || !r.state || !Array.isArray(r.cp) || !Array.isArray(r.errors) || r.errors.length || r.status === 'playing') { problems.push(`${k}: 无效完整指纹`); continue; }
      if (sha256(r.state) !== r.sha256 || r.cp.some(c => !c.state || sha256(c.state) !== c.sha256)) problems.push(`${k}: 状态与哈希不符`);
    }
    if (JSON.stringify(base.games?.[k]) !== JSON.stringify(current.games?.[k])) problems.push(`${k}: 检查点或完整终局不一致`);
  }
  return problems;
}
