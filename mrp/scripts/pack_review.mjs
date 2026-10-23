// 打评审包：规格书 + 核心代码，给外部模型检查用。不含图片等资源文件和旧版 v0.5。
// 用法：node scripts/pack_review.mjs              产物在 docs/review/
//       node scripts/pack_review.mjs --out <目录>  产物放到别处（内置盘紧张时指到外置盘；只覆盖本脚本自己的四个产物，不动目录里别的文件）
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outArg = process.argv.indexOf('--out');
if (outArg >= 0 && !process.argv[outArg + 1]) { console.error('--out 后面要跟一个目录'); process.exit(2); }
const OUT = outArg >= 0 ? path.resolve(process.argv[outArg + 1]) : path.join(ROOT, 'docs/review');
const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).filter(e => !e.name.startsWith('._') && e.name !== '.DS_Store').flatMap(e => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]).sort();

const GEN = ['src/career/data/history_gen.js', 'src/career/data/milestones_gen.js', 'src/career/data/roster.js', 'src/career/data/history_facts.js'];
const SPEC = ['docs/spec/v1.0-spec.md', 'docs/spec/v0.9-audit.md'];
const CORE = [
  'README.md', 'package.json', 'index.html', 'serve.py',
  ...walk('src/career').filter(f => !GEN.includes(f)),
  ...walk('tests').filter(f => f.endsWith('.test.mjs')), ...walk('tests/helpers'),
  'scripts/calibrate.mjs', 'scripts/pack_review.mjs', ...walk('docs/spec/tools'),
];
const OPTIONAL = [
  ...GEN,
  'docs/NEXT.md', 'scripts/build_milestones.mjs', 'scripts/build_history.mjs',
  'docs/research/generic-strategy-tree.md', 'docs/research/sota-timeline.json',
];
const ZIP_ONLY = ['docs/spec/v1.0-judges.json', 'docs/research/company-strategies.json', 'docs/research/timeline-2023-2026.json'];

const LANG = { js: 'js', mjs: 'js', css: 'css', html: 'html', py: 'python', json: 'json', md: 'markdown' };
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
function block(f) {
  const text = read(f);
  const run = Math.max(2, ...[...text.matchAll(/`+/g)].map(m => m[0].length));
  const fence = '`'.repeat(run + 1);
  return `## ${f}\n\n${fence}${LANG[path.extname(f).slice(1)] || ''}\n${text.replace(/\n?$/, '\n')}${fence}\n`;
}
function bundle(name, title, intro, files) {
  const toc = files.map(f => `- ${f}（${read(f).split('\n').length} 行）`).join('\n');
  const body = [`# ${title}\n`, intro, `\n## 本文件包含\n\n${toc}\n`, ...files.map(block)].join('\n');
  fs.writeFileSync(path.join(OUT, name), body);
  return `${name}  ${Math.round(Buffer.byteLength(body) / 1024)} KB`;
}

const OUTPUTS = ['1-spec.md', '2-spec-and-code.md', '3-optional-data.md', 'mrp-v1.0-review.zip'];
fs.mkdirSync(OUT, { recursive: true });
for (const f of OUTPUTS) fs.rmSync(path.join(OUT, f), { force: true });
const guide = read('docs/spec/REVIEW.md');
const report = [
  bundle('1-spec.md', '模型育成计划 v1.0：规格书', guide, SPEC),
  bundle('2-spec-and-code.md', '模型育成计划 v1.0：规格书与核心代码', guide, [...SPEC, ...CORE]),
  bundle('3-optional-data.md', '模型育成计划 v1.0：可选附件（生成文案、名册、开发日志、调研素材）',
    '这是评审包的可选附件，配合 `2-spec-and-code.md` 使用。评审说明见那份文件开头。', OPTIONAL),
];

// zip 按项目原路径存放。不带图片、存档夹具和美术清单，所以解压后 npm test 里依赖这些的用例（立绘哈希、夹具、页面渲染冒烟等）会失败，其余能跑。
// 暂存目录放在产物目录里（用完即删），不占系统临时目录所在的盘。
const stage = fs.mkdtempSync(path.join(OUT, '.stage-'));
const pkg = path.join(stage, 'model-raising-plan');
for (const f of [...SPEC, ...CORE, ...OPTIONAL, ...ZIP_ONLY]) {
  fs.mkdirSync(path.dirname(path.join(pkg, f)), { recursive: true });
  fs.copyFileSync(path.join(ROOT, f), path.join(pkg, f));
}
fs.writeFileSync(path.join(pkg, '00-评审说明.md'), guide);
const zip = path.join(OUT, 'mrp-v1.0-review.zip');
execFileSync('zip', ['-qrX', zip, 'model-raising-plan', '-x', '*/._*', '*.DS_Store'], { cwd: stage });   // exFAT 外置盘上复制文件会带出 ._ 附属文件，不进包
fs.rmSync(stage, { recursive: true, force: true });
report.push(`mrp-v1.0-review.zip  ${Math.round(fs.statSync(zip).size / 1024)} KB`);
console.log(report.join('\n'));
