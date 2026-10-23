# 静态图公共容器验收

日期：2026-10-22。范围：U4 本地 D2 SVG 的最小阅读组件。只在 `assets/css/style.css` 追加 `.static-diagram` 规则；不修改已有主题、动态图或 JavaScript。

## 接入约定

- `figure.static-diagram` 包含淡绿与 Dracula 两个 `a[data-diagram-theme]`，各自链接本地同主题 SVG，里面的 `img` 使用同一路径与有意义的 `alt`。
- 链接设置 `target="_blank" rel="noopener"`。每个链接内 `span.static-diagram-open` 用 `.lang-zh` / `.lang-en` 明示“查看大图（新标签页） / Open full-size diagram (new tab)”。图本身也可点击。
- `figcaption` 解释图意；`.static-diagram-hint` 明示“图宽时可左右滚动 / Scroll horizontally when needed”。语言沿用 `html[data-locale]`，无需新增切换逻辑。
- 默认显示淡绿 SVG；`html[data-theme="dracula"]` 只显示深色 SVG。隐藏版本 `display:none`，不会占布局或增加键盘焦点。
- 每个链接独立横向滚动。图片最小宽度 720 px，保持小屏文字大小；整个页面不横向溢出。查看大图文字随容器横向粘附，不会滚出左边界。
- 键盘 Tab 聚焦链接，左右方向键可横向滚动，Enter 在新标签打开原 SVG；浏览器正常关闭新标签即可回到原阅读位置。原生链接在禁用 JavaScript 时可用。

预览：<http://127.0.0.1:8765/tools/diagrams/preview.html>。

## 验证

使用独立 headless Chrome + Playwright，复用 `tools/diagrams/preview.html` 的真实 figure 和 D2 输出，临时注入 Ch01 阅读容器，再点击站点原有主题/语言按钮。未将 fixture 写入章节文件；截图中的工具图只用于公共组件验收，不属于 Ch01 教学内容。另在原始工具预览页关闭 JavaScript 验证原生链接。

| 检查 | 结果 |
|---|---|
| 390 / 1440 × 淡绿 / Dracula × zh / en / both | 12 组通过；每次只显示匹配主题的图，实时切换无需刷新 |
| 整页宽度 | 390 px 下 scrollWidth=390；1440 px 下 scrollWidth=1440，无整页横向溢出 |
| 图片阅读宽度 | 手机链接容器 296 px，图宽 720 px；桌面图宽 828 px，无局部溢出 |
| 字号 | 源 SVG 772×168、文字 16 px；手机最小显示图宽 720 px，文字约 14.9 px |
| 本地资源 | 两份 SVG 完整加载；href 与 src 相同；0 HTTP 资源错误、0 JS 运行错误 |
| 三种语言 | zh 仅中文提示/图注，en 仅英文，both 双语；图中统一英文短标签 |
| 键盘 | Tab/Shift+Tab 可进入可见链接，隐藏版本不进入焦点序列；ArrowRight 实测横滚 40 px；Enter 新标签打开对应 Dracula SVG，关闭后返回原页 |
| 无 JavaScript | 默认淡绿图片可见；Enter 在新标签打开本地淡绿 SVG |
| 变更范围 | 只追加静态图选择器；未改动态 SVG、播放器或公共 JS；`git diff --check` 通过 |

已目视检查以下四张截图：图文对比清楚，桌面可看全图；手机图在独立容器中滚动，查看原图入口及滚动提示始终可发现。滚动提示采用“图宽时”条件措辞，在桌面也保留，无需 JavaScript 测量。

| 尺寸 | 淡绿 | Dracula |
|---|---|---|
| 390 px | [截图](./screenshots/diagram-ui/390-parchment.png) | [截图](./screenshots/diagram-ui/390-dracula.png) |
| 1440 px | [截图](./screenshots/diagram-ui/1440-parchment.png) | [截图](./screenshots/diagram-ui/1440-dracula.png) |

本记录只验证公共静态图组件；各章实际图的布局、语义、密集度仍随章节验收。
