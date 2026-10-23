"""Build lightweight WebP variants of character art for the career mode UI.

stage: 1152px tall, card: 480px tall (original aspect kept); face: 160x160 head crop.
Run from the project root: python3 scripts/make_thumbs.py
"""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
src_dir = root / 'assets' / 'characters'
out_dir = root / 'assets' / 'thumbs'
out_dir.mkdir(exist_ok=True)

# 立绘顶端是武器或道具时，自动定位会偏；这些角色用人工标注的脸部中心（占宽、高的比例）。
FACE_OVERRIDES = {
    'cursor': (0.50, 0.23), 'ernie': (0.42, 0.16), 'grok': (0.53, 0.20),
    'perplexity': (0.45, 0.17), 'zcode': (0.52, 0.17),
}

for src in sorted(src_dir.glob('*.png')):
    im = Image.open(src).convert('RGBA')
    stem = src.stem
    # 原图比例不一（2:3 与约 9:16 都有），只按高度缩放，保持原比例。
    def by_height(h):
        return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    by_height(1152).save(out_dir / f'{stem}-stage.webp', 'WEBP', quality=86, method=6)
    by_height(480).save(out_dir / f'{stem}-card.webp', 'WEBP', quality=84, method=6)
    alpha = im.getchannel('A')
    box = alpha.getbbox() or (0, 0, im.width, im.height)
    left, top, right, bottom = box
    figure_h = bottom - top
    band = alpha.crop((left, top, right, top + max(8, int(figure_h * 0.14))))
    cols = [x for x in range(band.width) if any(band.getpixel((x, y)) > 40 for y in range(0, band.height, 4))]
    cx = left + (sum(cols) / len(cols) if cols else band.width / 2)
    size = int(figure_h * 0.24)
    x0 = int(max(0, min(im.width - size, cx - size / 2)))
    y0 = int(max(0, top - size * 0.04))
    override = FACE_OVERRIDES.get(stem.rsplit('-', 1)[0])
    if override:
        size = int(im.height * 0.22)
        x0 = int(max(0, min(im.width - size, override[0] * im.width - size / 2)))
        y0 = int(max(0, override[1] * im.height - size * 0.45))
    face = im.crop((x0, y0, x0 + size, y0 + size)).resize((160, 160), Image.LANCZOS)
    face.save(out_dir / f'{stem}-face.webp', 'WEBP', quality=86, method=6)
    print(stem, box, 'face', (x0, y0, size))
