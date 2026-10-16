#!/usr/bin/env bash
# 由 Maple Mono CN 官方 TTF 生成站点用 woff2 子集（GB2312 全部汉字 + ASCII + Latin-1 + 常用符号）。
# 用法：把官方 zip（https://github.com/subframe7536/Maple-font/releases）里的
#       MapleMono-CN-Regular.ttf / MapleMono-CN-Bold.ttf 放到 public/fonts/ 后执行本脚本。
set -euo pipefail
cd "$(dirname "$0")/../public/fonts"

python3 - <<'PY'
chars = set()
chars |= {chr(c) for c in range(0x20, 0x7F)}            # ASCII printable
chars |= {chr(c) for c in range(0xA0, 0x100)}           # Latin-1 Supplement（外文片名重音字符）
for row in range(0xB0, 0xF8):                           # GB2312 全部汉字（一级 3755 + 二级 3008）
    for col in range(0xA1, 0xFF):
        try:
            chars.add(bytes([row, col]).decode('gb2312'))
        except Exception:
            pass
chars |= set('★☆♥♪→←↑↓▶◀●○◎※§¶†‡•‣℃℉№©®™…—～‘’“”「」『』【】〔〕〈〉《》，。！？；：、（）')
chars |= {chr(c) for c in range(0xFF01, 0xFF5F)}        # 全角 ASCII
open('chars.txt', 'w', encoding='utf-8').write(''.join(sorted(chars)))
print('charset size:', len(chars))
PY

for weight in Regular Bold; do
  pyftsubset "MapleMono-CN-${weight}.ttf" \
    --text-file=chars.txt \
    --flavor=woff2 \
    --layout-features='kern,liga,ccmp,locl,mark,mkmk' \
    --name-IDs='0,1,2,3,4,5,6' \
    --no-hinting \
    --output-file="MapleMonoCN-${weight}.woff2"
done

# 清理中间产物（zip 与全量 TTF 体积大，不入库）
rm -f MapleMono-CN.zip MapleMono-CN-*.ttf
ls -lh MapleMonoCN-*.woff2
