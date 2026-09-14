#!/usr/bin/env python3
"""生成桌面 App 图标:羊皮纸底 + client→server→db 架构图(呼应站内 D2 图配色)。

输出 src-tauri/app-icon.png(1024x1024 RGBA),配合 `npx tauri icon` 生成全套尺寸。
先按 2x 超采样绘制再缩小,保证圆弧和箭头平滑。
三个节点垂直中心对齐 y=512,两个箭头同高,读作一条请求流水线。
"""

from PIL import Image, ImageDraw

S = 2048  # 超采样画布,最终缩到 1024
OUT = "src-tauri/app-icon.png"

# 站点同款配色:羊皮纸底 + d2Render.ts 的叶子调色板
BG = "#E9E2D4"
AMBER_FILL, AMBER_STROKE = "#FFE082", "#F9A825"
TEAL_FILL, TEAL_STROKE = "#80DEEA", "#00838F"
GREEN_FILL, GREEN_STROKE = "#A5D6A7", "#2E7D32"
INK = "#3B3428"

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)


def s(v: float) -> float:
    return v * S / 1024


def arrow(p_from, p_to, width):
    """带实心三角箭头的连线(占节点间距七八成,小尺寸下仍能读出流向)。"""
    (x1, y1), (x2, y2) = p_from, p_to
    d.line([s(x1), s(y1), s(x2), s(y2)], fill=INK, width=int(s(width)))
    import math

    ang = math.atan2(y2 - y1, x2 - x1)
    head, spread = 44, 0.52
    p3 = (x2 - head * math.cos(ang), y2 - head * math.sin(ang))
    left = (p3[0] - head * spread * math.sin(-ang), p3[1] - head * spread * math.cos(-ang))
    right = (p3[0] + head * spread * math.sin(-ang), p3[1] + head * spread * math.cos(-ang))
    d.polygon(
        [s(x2), s(y2), s(left[0]), s(left[1]), s(right[0]), s(right[1])],
        fill=INK,
    )


# 1) macOS 风圆角方形底(约 22.5% 圆角),外圈留透明
d.rounded_rectangle(
    [s(36), s(36), s(1024 - 36), s(1024 - 36)],
    radius=int(s(230)),
    fill=BG,
)

# 2) 客户端:圆形节点(amber),内画人形剪影
d.ellipse(
    [s(85), s(407), s(295), s(617)],
    fill=AMBER_FILL,
    outline=AMBER_STROKE,
    width=int(s(14)),
)
d.ellipse([s(163), s(455), s(217), s(509)], fill=INK)
d.pieslice([s(135), s(522), s(245), s(604)], 180, 360, fill=INK)

# 3) 服务端:圆角矩形(teal),内画三条槽线
d.rounded_rectangle(
    [s(395), s(422), s(635), s(602)],
    radius=int(s(38)),
    fill=TEAL_FILL,
    outline=TEAL_STROKE,
    width=int(s(14)),
)
for i, yy in enumerate((470, 512, 554)):
    d.rounded_rectangle(
        [s(428), s(yy), s(612 if i == 0 else 524), s(yy + 17)],
        radius=int(s(8)),
        fill=TEAL_STROKE,
    )

# 4) 数据库:圆柱(green),与 client/server 同一垂直中心
cx, rx, ry, top, bottom = 818, 95, 42, 418, 606
d.rectangle([s(cx - rx), s(top), s(cx + rx), s(bottom)], fill=GREEN_FILL)
d.ellipse([s(cx - rx), s(top - ry), s(cx + rx), s(top + ry)], fill=GREEN_FILL, outline=GREEN_STROKE, width=int(s(14)))
d.pieslice([s(cx - rx), s(bottom - ry), s(cx + rx), s(bottom + ry)], 0, 180, fill=GREEN_FILL, outline=GREEN_STROKE, width=int(s(14)))
# 圆柱中段一道分隔弧,增强「数据库」识别度
d.arc([s(cx - rx), s(top - ry + 50), s(cx + rx), s(top + ry + 50)], 0, 180, fill=GREEN_STROKE, width=int(s(10)))

# 5) 连线:客户端→服务端→数据库(同一水平线)
arrow((303, 512), (387, 512), 22)
arrow((643, 512), (707, 512), 22)

img = img.resize((1024, 1024), Image.LANCZOS)
img.save(OUT)
print(f"wrote {OUT}")
