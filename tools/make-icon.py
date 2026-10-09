"""终末地音乐终端 · 图标生成器（v2）

设计语言（与 App 统一）：
  主黄 #F2C200 / 近黑 #0A0A0C / 暖白 #F1F0EA
  信息终端：切角面板 + 角标 + 极淡扫描线 + 命令行提示符与光标
  终末地：危险条纹带 + 六边形徽标
  音乐：六边形内 等化器条(eq) 或 播放三角(play)

所有装饰都裁剪在切角面板内，保证任意尺寸下轮廓干净、小图标不糊。
"""
from __future__ import annotations

import argparse
import math
import os
from PIL import Image, ImageDraw

YELLOW = (242, 194, 0, 255)      # #F2C200
YELLOW_DIM = (242, 194, 0, 110)
BLACK = (10, 10, 12, 255)        # #0A0A0C
WHITE = (241, 240, 234, 255)     # #F1F0EA
CLEAR = (0, 0, 0, 0)

S = 2048


def chamfered_polygon(x0, y0, x1, y1, c):
    return [
        (x0 + c, y0), (x1 - c, y0), (x1, y0 + c), (x1, y1 - c),
        (x1 - c, y1), (x0 + c, y1), (x0, y1 - c), (x0, y0 + c),
    ]


def hexagon(cx, cy, r):
    return [
        (cx, cy - r),
        (cx + r * math.sin(math.radians(60)), cy - r * 0.5),
        (cx + r * math.sin(math.radians(60)), cy + r * 0.5),
        (cx, cy + r),
        (cx - r * math.sin(math.radians(60)), cy + r * 0.5),
        (cx - r * math.sin(math.radians(60)), cy - r * 0.5),
    ]


def build(variant: str) -> Image.Image:
    img = Image.new('RGBA', (S, S), CLEAR)
    margin = int(S * 0.035)
    box = (margin, margin, S - margin, S - margin)
    cham = int(S * 0.115)

    # 面板遮罩：所有装饰都必须裁在它内部
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).polygon(chamfered_polygon(*box, cham), fill=255)

    # ---- 内部装饰层：底色 + 扫描线 + 危险条纹带 ---------------------------
    layer = Image.new('RGBA', (S, S), CLEAR)
    ld = ImageDraw.Draw(layer)
    ld.polygon(chamfered_polygon(*box, cham), fill=BLACK)
    # 扫描线：克制（alpha 9），只在浅色背景上隐约可见
    for y in range(box[1], box[3], 58):
        ld.line([(box[0], y), (box[2], y)], fill=(255, 255, 255, 9), width=3)

    band_top = box[1] + int(cham * 0.52)
    band_h = int(S * 0.062)
    band = (box[0] + int(cham * 0.30), band_top, box[2] - int(cham * 0.30), band_top + band_h)
    x0, y0, x1, y1 = band
    ld.rectangle(band, fill=YELLOW)
    period, width, h = int(S * 0.058), int(S * 0.023), band_h
    x = x0 - h - period
    while x < x1 + period:
        ld.polygon([(x, y1), (x + width, y1), (x + width + h, y0), (x + h, y0)], fill=BLACK)
        x += period

    img.paste(layer, (0, 0), mask)

    # 面板细描边
    d = ImageDraw.Draw(img)
    d.line(chamfered_polygon(*box, cham) + [chamfered_polygon(*box, cham)[0]],
           fill=(242, 194, 0, 105), width=int(S * 0.0055), joint='curve')

    # 角标（终端取景框）
    off = cham * 0.42
    blen, bwidth = int(S * 0.070), int(S * 0.0105)
    for (px, py, sx, sy) in (
        (box[0] + off, box[1] + off, 1, 1),
        (box[2] - off, box[1] + off, -1, 1),
        (box[0] + off, box[3] - off, 1, -1),
        (box[2] - off, box[3] - off, -1, -1),
    ):
        d.line([(px, py), (px + sx * blen, py)], fill=YELLOW, width=bwidth)
        d.line([(px, py), (px, py + sy * blen)], fill=YELLOW, width=bwidth)

    # ---- 中央六边形徽标 --------------------------------------------------
    cx, cy = S / 2, S * 0.505
    r = S * 0.243
    d.polygon(hexagon(cx, cy, r), fill=YELLOW)

    if variant == 'eq':
        bars = [0.40, 0.66, 0.48, 0.80, 0.40]
        bw = r * 0.165
        gap = bw * 1.02
        total = len(bars) * bw + (len(bars) - 1) * gap
        x = cx - total / 2
        for hh in bars:
            bh = r * 1.02 * hh
            d.rounded_rectangle([x, cy - bh / 2, x + bw, cy + bh / 2],
                                radius=bw * 0.45, fill=BLACK)
            x += bw + gap
    else:
        sz = r * 0.66
        d.polygon([(cx - sz * 0.50, cy - sz), (cx - sz * 0.50, cy + sz),
                   (cx + sz * 0.92, cy)], fill=BLACK)

    # ---- 底部命令行：提示符 + 光标 ---------------------------------------
    base_y = box[3] - int(S * 0.098)
    aw = int(S * 0.0185)
    px = cx - S * 0.115
    d.line([(px, base_y - S * 0.036), (px + S * 0.042, base_y), (px, base_y + S * 0.036)],
           fill=YELLOW, width=aw, joint='curve')
    cxb = px + S * 0.072
    d.rectangle([cxb, base_y - S * 0.034, cxb + S * 0.105, base_y + S * 0.034], fill=YELLOW)
    d.rectangle([cxb + S * 0.130, base_y - S * 0.034, cxb + S * 0.163, base_y + S * 0.034],
                fill=YELLOW_DIM)
    return img


def build_background() -> Image.Image:
    """自适应图标背景层：满幅黑 + 极淡扫描线 + 顶部危险条纹（系统负责裁形）。"""
    img = Image.new('RGBA', (S, S), BLACK)
    d = ImageDraw.Draw(img)
    for y in range(0, S, 58):
        d.line([(0, y), (S, y)], fill=(255, 255, 255, 9), width=3)
    band_top, band_h = int(S * 0.085), int(S * 0.062)
    y0, y1 = band_top, band_top + band_h
    d.rectangle([0, y0, S, y1], fill=YELLOW)
    period, width = int(S * 0.058), int(S * 0.023)
    x = -band_h - period
    while x < S + period:
        d.polygon([(x, y1), (x + width, y1), (x + width + band_h, y0), (x + band_h, y0)], fill=BLACK)
        x += period
    return img


def build_foreground(variant: str) -> Image.Image:
    """自适应图标前景层：仅六边形徽标，落在 66% 安全区内。"""
    img = Image.new('RGBA', (S, S), CLEAR)
    d = ImageDraw.Draw(img)
    cx, cy = S / 2, S / 2
    r = S * 0.205
    d.polygon(hexagon(cx, cy, r), fill=YELLOW)
    if variant == 'eq':
        bars = [0.40, 0.66, 0.48, 0.80, 0.40]
        bw, gap = r * 0.165, r * 0.168
        total = len(bars) * bw + (len(bars) - 1) * gap
        x = cx - total / 2
        for hh in bars:
            bh = r * 1.02 * hh
            d.rounded_rectangle([x, cy - bh / 2, x + bw, cy + bh / 2],
                                radius=bw * 0.45, fill=BLACK)
            x += bw + gap
    else:
        sz = r * 0.66
        d.polygon([(cx - sz * 0.50, cy - sz), (cx - sz * 0.50, cy + sz),
                   (cx + sz * 0.92, cy)], fill=BLACK)
    return img


def circular(img: Image.Image) -> Image.Image:
    size = img.size[0]
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    out = Image.new('RGBA', (size, size), CLEAR)
    out.paste(img, (0, 0), mask)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--variant', default='eq', choices=['eq', 'play'])
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    master = build(args.variant)

    master.resize((1024, 1024), Image.LANCZOS).save(
        os.path.join(args.out, f'master-{args.variant}-1024.png'))

    dens = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    for name, px in dens.items():
        master.resize((px, px), Image.LANCZOS).save(
            os.path.join(args.out, f'ic_launcher-{name}-{px}.png'))
        circular(master).resize((px, px), Image.LANCZOS).save(
            os.path.join(args.out, f'ic_launcher_round-{name}-{px}.png'))

    # 深色预览条（192 / 96 / 48）+ 48px 最近邻放大（检查小尺寸可读性）
    strip = Image.new('RGBA', (1000, 300), (18, 18, 20, 255))
    x = 24
    for px in (192, 96, 48):
        strip.alpha_composite(master.resize((px, px), Image.LANCZOS), (x, 24))
        x += px + 24
    strip.alpha_composite(master.resize((48, 48), Image.LANCZOS).resize((192, 192), Image.NEAREST),
                          (x, 24))
    strip.convert('RGB').save(os.path.join(args.out, f'preview-{args.variant}.png'))

    light = Image.new('RGBA', (48 + 72 + 96 + 144 + 140, 200), (241, 240, 234, 255))
    lx = 24
    for px in (48, 72, 96, 144):
        light.alpha_composite(master.resize((px, px), Image.LANCZOS), (lx, (200 - px) // 2))
        lx += px + 20
    light.convert('RGB').save(os.path.join(args.out, f'preview-light-{args.variant}.png'))

    # ---- 自适应图标（Android 8+）：背景层满幅 + 前景层安全区内 -------------
    bg, fg = build_background(), build_foreground(args.variant)
    adaptive = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}
    for name, px in adaptive.items():
        bg.resize((px, px), Image.LANCZOS).save(
            os.path.join(args.out, f'ic_launcher_background-{name}-{px}.png'))
        fg.resize((px, px), Image.LANCZOS).save(
            os.path.join(args.out, f'ic_launcher_foreground-{name}-{px}.png'))
    print('written to', args.out)


if __name__ == '__main__':
    main()
