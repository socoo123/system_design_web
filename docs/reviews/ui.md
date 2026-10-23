# UI 预览交付记录

日期：2026-10-22。范围：U1–U3 的两版 UI 预览；U4 检查器/D2 工具迁移和逐章内容改写尚未开始。

## 第一版

由 Astra High 作为公共 UI 唯一写入者完成 `assets/css/style.css`、`index.html`、`assets/js/nav.js`、`assets/js/progress.js`。

- 淡绿页面底、浅色阅读面、首页模块导航与学习进度。
- 章节目录在桌面固定、窄屏可收起；表格/代码局部滚动，避免页面被撑宽。
- 代码复制及失败后选中手动复制；已读与继续学习使用本地存储。
- 保留双语、闪卡、动态图及原有播放控件。

第一版用户反馈：“好看多了”。随后要求增加章节色块、分隔线，并恢复原德古拉深色。

## 第二版

站点变更仅在 `assets/css/style.css`，由同一 Astra High 写入者完成，主代理负责截图与回归检查。

- 首页章号、章节页章号加入小色块；各小节标题加入浅色标题带和细侧标。
- 首页模块间新增细分隔线；正文节间细线配合标题带区分内容。
- 表头及正文相邻单元格加入单侧 1 px 竖线，保留横向行线与容器内滚动。
- 深色恢复原来的黑灰底、粉色强调和紫色块，普通 UI 不再使用第一版的墨绿背景和绿色装饰。动态图沿用原 Dracula 语义配色。
- 保持第一版字号、正文宽度、响应式布局和交互。深色次级文字在原紫灰色相上适当提亮，保证可读性。

## 验证

- `node tools/check.mjs`、修改过的公共 JS 语法检查、`git diff --check` 通过。
- [布局结果](./ui-layout-results.json)：348 项通过，0 整页横向溢出、0 JS 运行错误、0 HTTP 资源错误；包括首页及全部 45 章在 390 px、两主题、三语言的检查，以及首页/Ch01/Ch09/Ch41 在 320/768/1440 px 的补充检查。
- [样式实测](./ui-v2-style-results.json)：浅色/深色表格相邻列均为 1 px 实线；深色页面底色为 `rgb(13,14,19)`，标题带为紫灰色 `rgb(40,33,49)`。
- 逐章 HTML SHA256 对照 [改前基线](./ui-baseline.json)，45 章均未变化，276 组 / 1,411 帧动画完整保留。
- 实际检查了首页、Ch09 章节/表格、手机页面的两主题截图；没有重新做逐帧语义审阅。本轮不涉及教材技术结论修正。
- 第一版独立交互复核覆盖：目录展开/语言切换/锚点、代码复制及拒绝回退、`file://` 回退、闪卡键盘、已读持久化、继续学习、跨页/跨标签进度、播放器翻页/播放暂停/倍速循环与减少动态效果。第二版仅调整 CSS。

## 预览与截图

本地服务：<http://127.0.0.1:8765/>，章节页：<http://127.0.0.1:8765/chapters/ch09.html>。

| 页面 | 浅色 | 深色 |
|---|---|---|
| 首页 | [截图](./screenshots/ui-v2/home-parchment.png) | [截图](./screenshots/ui-v2/home-dracula.png) |
| 章节页 | [截图](./screenshots/ui-v2/chapter-parchment.png) | [截图](./screenshots/ui-v2/chapter-dracula.png) |
| 表格 | [截图](./screenshots/ui-v2/table-parchment.png) | [截图](./screenshots/ui-v2/table-dracula.png) |
| 手机章节页 | [截图](./screenshots/ui-v2/mobile-parchment.png) | [截图](./screenshots/ui-v2/mobile-dracula.png) |

未提交、推送或部署。U4 尚未完成，不能把两版视觉预览写成全部 U 阶段及内容改写已完成。
