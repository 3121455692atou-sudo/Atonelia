// 核对规格 §1.3 里训练作业的四组常量（JOBS、REPAIR、LAB、EVAL）和 consts.mjs 逐项相同。
// 默认读 docs/spec/v1.0-spec.md；也可以传一个文件路径（例如修订稿 docs/spec/patch-training-jobs.md）。不一致时以 1 退出。
import fs from 'node:fs';
const c = await import('../consts.mjs');
const file = process.argv[2] ?? new URL('../../../v1.0-spec.md', import.meta.url);
const t = fs.readFileSync(file, 'utf8');
const hit = t.match(/\/\/ 训练作业（T 章[\s\S]*?\n```/);
if (!hit) { console.log('没找到 “// 训练作业（T 章” 开头的代码段：', String(file)); process.exit(1); }
const m = hit[0].replace(/```$/, '');
const out = {};
new Function('out', m.replace(/export const (\w+) =/g, 'out.$1 ='))(out);
const same = JSON.stringify(out) === JSON.stringify({ JOBS: c.JOBS, REPAIR: c.REPAIR, LAB: c.LAB, EVAL: c.EVAL });
console.log('spec §1.3 block equals consts.mjs:', same);
if (!same) process.exit(1);
