#!/usr/bin/env python3
"""由 logo-source.jpg（白底蓝发动漫少女插画）生成全套品牌图标资产。

输出（public/icons/）：
- icon-96/192/512.png   全站默认图标（PWA / manifest / 浏览器标签）
- apple-touch-icon.png  180x180 iOS 主屏幕
- favicon.ico           16/32/48 多尺寸 ICO（根目录兜底）
- paper-logo.png        纸质主题头部品牌图（256x256）
- paper-favicon.png     纸质主题 favicon（PNG，主题切换时替换）
"""
from PIL import Image
import os

SRC = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons', 'logo-source.jpg')
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')

def resize_square(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.LANCZOS)

def main():
    img = Image.open(SRC).convert('RGB')
    w, h = img.size
    print(f'source: {w}x{h}')
    side = min(w, h)
    # 居中裁方（源图本就是正方形，稳妥起见仍做一次）
    if w != h:
        left = (w - side) // 2
        top = (h - side) // 2
        img = img.crop((left, top, left + side, top + side))

    for size, name in [(96, 'icon-96.png'), (192, 'icon-192.png'), (512, 'icon-512.png'),
                       (180, 'apple-touch-icon.png'), (256, 'paper-logo.png')]:
        resize_square(img, size).save(os.path.join(OUT, name), optimize=True)
        print('written', name)

    # 多尺寸 ICO
    resize_square(img, 48).save(
        os.path.join(OUT, 'favicon.ico'),
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    print('written favicon.ico')

    # 纸质主题 favicon（48 足够标签页显示，PNG 便于主题切换直接替换 href）
    resize_square(img, 48).save(os.path.join(OUT, 'paper-favicon.png'), optimize=True)
    print('written paper-favicon.png')

    # 根目录 favicon.ico 兜底（layout icons 引用 /favicon.ico）
    resize_square(img, 48).save(
        os.path.join(OUT, '..', 'favicon.ico'),
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    print('written ../favicon.ico')

if __name__ == '__main__':
    main()
