# Ch07 闪卡布局返修 · 2026-10-23

用户反馈 Ch07 记忆闪卡与其他章节样式不同。根因是容器误用无 CSS 定义的 `flashcards`，未应用公共响应式网格。本次唯一页面修改为 `class="flashcards"` → `class="cards-grid"`，与 Ch06 / Ch08 一致；18 张双语卡片内容及共享 CSS/JS 均未改动。

- 主代理真实 Chrome：390 / 1440 px × 淡绿 / Dracula × zh / en / both，共 12 组合通过；手机 1 列、桌面 3 列，无整页横向溢出，点击 / Enter / Space 翻卡正常。
- 已目视桌面双语浅色截图；其余截图与实测数据见[结果](./ch07-flashcards-fix-results.json)和[截图目录](./screenshots/ch07-flashcards-fix/)。
- `node tools/audit-chapter.mjs ch07`、`git diff --check` 通过。
- Astra High 独立只读复核通过：唯一类名变更；全部 18 张卡片完整标记保持一致；公共 JS 绑定 `.flip`，容器修改兼容。

修复前 SHA256：`04a168ec0801e492342d186e2d4d3103292d8e4efcf957566b9aa71b33e2029d`。
修复后 SHA256：`e1a8fad98f1ef5c2e93e768baa5001604121f8c39c4871e84bb45320878e792e`。
本记录补充此前整批验收：此前翻卡交互检查通过，但漏检容器是否应用统一网格。未提交、未推送、未部署。
