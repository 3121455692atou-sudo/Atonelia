#!/usr/bin/env python3
"""硬件照片与事件背景的网页缩略图。

- assets/hardware/*.jpg      → assets/thumbs/hw-<id>.webp（宽 720）
- assets/backgrounds/*.png   → assets/thumbs/bg-<name>.webp（宽 1536）
- assets/hardware/CREDITS.json → src/career/data/hardware_gen.js（署名）
在项目根目录运行：python3 scripts/make_hw_thumbs.py
"""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
thumbs = root / 'assets' / 'thumbs'
thumbs.mkdir(exist_ok=True)

for src in sorted((root / 'assets' / 'hardware').glob('*.jpg')):
    im = Image.open(src).convert('RGB')
    w = min(720, im.width)
    im.resize((w, round(im.height * w / im.width)), Image.LANCZOS).save(thumbs / f'hw-{src.stem}.webp', 'WEBP', quality=82, method=6)

for src in sorted((root / 'assets' / 'backgrounds').glob('*.png')):
    out = thumbs / f'bg-{src.stem}.webp'
    if out.exists() and out.stat().st_mtime >= src.stat().st_mtime:
        continue
    im = Image.open(src).convert('RGB')
    w = min(1536, im.width)
    im.resize((w, round(im.height * w / im.width)), Image.LANCZOS).save(out, 'WEBP', quality=82, method=6)

credits = json.loads((root / 'assets' / 'hardware' / 'CREDITS.json').read_text())
rows = {c['id']: {k: c[k] for k in ('title', 'author', 'license', 'license_url', 'source_url')} for c in credits}
(root / 'src' / 'career' / 'data' / 'hardware_gen.js').write_text(
    '// 由 scripts/make_hw_thumbs.py 根据 assets/hardware/CREDITS.json 生成。照片均来自 Wikimedia Commons，按各自许可署名使用。\n'
    f'export const HW_CREDITS = {json.dumps(rows, ensure_ascii=False, indent=1)};\n')
print('ok', len(rows), 'credits')
