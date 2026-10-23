#!/usr/bin/env python3
"""公司策略图标导入（规格 A11）：把生成好的 PNG（<节点 id>.png）缩成 144×144 的 webp 放进 assets/strategy/，
再按 assets/strategy/ 里实际有的文件重写 src/career/data/strategy_icons.js 的清单。

  python3 scripts/import_strategy_icons.py <放 PNG 的目录> [--only id1,id2]

只导入节点 id 认得的文件（id 表从 src/career/data 里的策略树读，见 node 那一步）；已有的 webp 会被覆盖。需要 Pillow。
"""
import json
import os
import subprocess
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'strategy')
LIST = os.path.join(ROOT, 'src', 'career', 'data', 'strategy_icons.js')
SIZE = 144

NODE_IDS_JS = """
import('./src/career/data/companies/index.js').then(async I => {
  const { CORE_TREES } = await import('./src/career/data/strategy_core.js');
  const ids = new Set();
  const add = t => { for (const n of t?.nodes || []) ids.add(n.id); };
  for (const t of Object.values(CORE_TREES)) add(t);
  for (const f of Object.values(I.GENERIC_FILES)) add(f?.tree);
  for (const f of Object.values(I.COMPANY_FILES)) add(f?.tree);
  console.log(JSON.stringify([...ids]));
});
"""


def node_ids():
    out = subprocess.run(['node', '-e', NODE_IDS_JS], cwd=ROOT, capture_output=True, text=True, check=True)
    return set(json.loads(out.stdout))


def write_list():
    have = sorted(f[:-5] for f in os.listdir(OUT) if f.endswith('.webp') and not f.startswith('.'))
    body = ',\n'.join(f"  '{i}'" for i in have)
    with open(LIST, 'w', encoding='utf-8') as fh:
        fh.write("// 公司策略节点的图标（规格 A11）：assets/strategy/<节点 id>.webp，144×144。\n")
        fh.write("// 由 scripts/import_strategy_icons.py 按 assets/strategy/ 里实际有的文件生成，不要手改；不在表里的节点显示首字。\n")
        fh.write(f"export const STRATEGY_ICONS = new Set([\n{body}{',' if have else ''}\n]);\n")
        fh.write("export const strategyIconSrc = id => `./assets/strategy/${id}.webp`;\n")
    return len(have)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    src = sys.argv[1]
    only = None
    if '--only' in sys.argv:
        only = set(sys.argv[sys.argv.index('--only') + 1].split(','))
    ids = node_ids()
    os.makedirs(OUT, exist_ok=True)
    done, skipped = 0, []
    for f in sorted(os.listdir(src)):
        if f.startswith('.') or not f.lower().endswith('.png'):
            continue
        nid = f[:-4]
        if nid not in ids or (only and nid not in only):
            skipped.append(nid)
            continue
        im = Image.open(os.path.join(src, f)).convert('RGB')
        w, h = im.size
        side = min(w, h)
        im = im.crop(((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2)).resize((SIZE, SIZE), Image.LANCZOS)
        im.save(os.path.join(OUT, f'{nid}.webp'), 'WEBP', quality=82, method=6)
        done += 1
    n = write_list()
    print(f'导入 {done} 张；清单里一共 {n} 个节点有图标' + (f'；跳过 {len(skipped)} 个不认得的文件' if skipped else ''))


if __name__ == '__main__':
    main()
