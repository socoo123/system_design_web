# 静态 D2 图与章节检查工具

对应 `PLAN.md` §§2.3、4–6、8。此入口只补需要的静态总览/流程图；已有 `.deck` 动画继续使用原播放器。部署只需仓库里的 HTML/SVG，不需要 D2、WASM、CDN 或浏览器编译。

## 安装与重建

要求 Node.js 20+（`findLastIndex`）、本机 D2 **v0.7.1**。macOS arm64 可运行：

```sh
node tools/diagrams/install.mjs
node tools/diagrams/build.mjs
node tools/diagrams/build.mjs --check
```

安装器通过系统 `curl` 下载官方固定 release，验证 `config.json` 中的归档 SHA256，只解包到 `~/.cache/system-design-tools/d2/0.7.1/`，不运行上游安装脚本、不改 PATH、不写全局目录。已经安装时校验版本。校验值是本次下载后固定的归档标识，不是上游数字签名。

其他平台从 [官方 v0.7.1 release](https://github.com/d2lang/d2/releases/tag/v0.7.1) 安装对应 CLI，再以绝对路径指定 `D2_BIN`。版本不符会拒绝构建。只生成指定图：

```sh
D2_BIN=/absolute/path/to/d2 node tools/diagrams/build.mjs diagrams/chNN/overview.d2
D2_BIN=/absolute/path/to/d2 node tools/diagrams/build.mjs --check diagrams/chNN/overview.d2
```

`--check` 在临时目录重建并逐字节比对已有输出；不改仓库产物。默认扫描全部 `diagrams/**/*.d2`。源码、同名 JSON 元信息与两份 SVG 一起提交。不要手工编辑生成 SVG；修改源文件后重建。

## 固定参数与源码约束

参数由 `tools/diagrams/config.json` 固定：D2 0.7.1、`dagre`、pad=24、scale=1、bundled Source Sans Pro（正文/粗体/斜体等）和 Source Code Pro（等宽）、parchment=104（Everglade Green）、dracula=200（Dark Mauve）。禁用系统自动 dark-theme，单独生成两份产物，避免操作系统主题覆盖站点主题。其他显式选项包含 bundle=true、sketch=false、center=false、根 board、无动画；固定 salt 由源路径与主题派生。构建清除会覆盖参数的 `D2_*`、`SCALE`、`OMIT_VERSION` 环境值。

本最小链路接受自包含单图：不允许 D2 imports、外部 URL、icon/link/image、`d2-config` 或 layers/scenarios/steps。源图不覆盖布局和主题；引用依据放章节正文或工具说明。图内优先英文短标签，中文意义由双语图注补足，避免未嵌入的 CJK 字体依赖。样例：

- `diagrams/tooling/request-path.d2`
- `diagrams/tooling/request-path.json`：必须有非空 `title` / `description`；构建加入 SVG 的 `title`、`desc`、role 和 accessible name。
- `assets/diagrams/tooling/request-path.parchment.svg`
- `assets/diagrams/tooling/request-path.dracula.svg`

D2 内嵌字体随 SVG 分发。生成后检查 SVG 不含脚本、事件属性、foreignObject、外部资源；本地/内嵌 SVG 不应携带交互脚本。外层 SVG 可访问描述仅说明图意，不能代替 HTML img 的 alt。

官方资料：[CLI 手册](https://d2lang.com/tour/man/)（在线手册可能已升级，本工具实际选项以 v0.7.1 `--help` 验证）、[主题](https://d2lang.com/tour/themes/)（`--theme` 与系统 dark-theme 的区别）、[导出](https://d2lang.com/tour/exports/)。本轮已实际运行该固定版本的 CLI 验证用法。

## 页面引用

章节使用已有公共 `.static-diagram` 样式，不需要额外 JS：

```html
<figure class="static-diagram">
  <a data-diagram-theme="parchment" href="../assets/diagrams/chNN/overview.parchment.svg" target="_blank" rel="noopener">
    <img src="../assets/diagrams/chNN/overview.parchment.svg" alt="A meaningful English description of the diagram.">
    <span class="static-diagram-open"><span class="lang-zh">查看原图（新标签页） ↗</span><span class="lang-en">Open full image (new tab) ↗</span></span>
  </a>
  <a data-diagram-theme="dracula" href="../assets/diagrams/chNN/overview.dracula.svg" target="_blank" rel="noopener">
    <img src="../assets/diagrams/chNN/overview.dracula.svg" alt="A meaningful English description of the diagram.">
    <span class="static-diagram-open"><span class="lang-zh">查看原图（新标签页） ↗</span><span class="lang-en">Open full image (new tab) ↗</span></span>
  </a>
  <p class="static-diagram-hint"><span class="lang-zh">↔ 图宽时可左右滚动</span><span class="lang-en">↔ Scroll horizontally when needed</span></p>
  <figcaption><span class="lang-zh">图意与抽象边界。</span><span class="lang-en">Meaning and abstraction boundary.</span></figcaption>
</figure>
```

预览：启动仓库根目录 `python3 -m http.server 8765`，打开 `http://127.0.0.1:8765/tools/diagrams/preview.html`，页面链接切换主题。真实公共主题/语言按钮、键盘与禁用 JS 验收见 `docs/reviews/diagram-ui.md`。每章仍需两主题、窄屏/桌面检查连线标签、字号、裁切和技术含义；成功生成不等于图正确。

## 章节校验与迁移

```sh
node tools/check.mjs
node tools/audit-chapter.mjs ch01 ch04 ch09
node tools/validation.test.mjs
```

`STATS` 只统计字数、图数/帧数、双语节点、代码块等；不会因篇幅、帧数范围、图例、`is-new` 或中英节点数量不等失败。`FAIL` 保留真实错误：本地资源/锚点、重复 ID、语言交叉嵌套、失效章节入口、标题章号、播放器直接子 slide、每帧 SVG 与图注、SVG 可访问性、无授权说明的动画减少、代码标识和静态两主题资源。

新增/修改的代码须用 `<pre data-language="Pseudocode" data-kind="pseudocode"><code>…</code></pre>`。`data-kind` 可为 `pseudocode`、`teaching`、`runnable`、`command`、`data`。这只检查性质声明；正文仍须解释教学片段或可运行示例、依赖、保证与失败边界，UI 标签目前显示 data-language，因此 language 文案也应体现性质，如 `Java teaching snippet`。不要将伪代码标成可运行 Java。共享代码不必复制两份以凑双语节点。

`tools/validation-baseline.json` 保存迁移时每组的帧标识和原有 12 段无标识代码的精确 SHA256；旧代码只在原文未改时保留 WARN，随章重写时补齐标识。**不能重新生成基线来掩盖删除或绕开代码校验。** 原始总量证据仍使用 `docs/reviews/ui-baseline.json`。分组或帧顺序变化会单独 WARN，数量减少或原帧消失默认 FAIL；源码文字变更本身不会被误判为删帧。

有必要删除/替换动画时，在 `tools/animation-changes.json` 按章记录：

```json
{
  "chNN": {
    "removedFrameIds": ["d1s2t"],
    "reason": "具体旧问题、替代方案和教学信息保留方式",
    "reviewedBy": "实际独立复核者",
    "evidence": "docs/reviews/chNN.md"
  }
}
```

异常清单由主代理维护，链接必须存在；填写字符串并不能证明已经复核，主代理须审核记录与实际变化。保持帧 ID 相同也不证明语义没被改掉；自动校验无法发现这种替换，更不能验证译文对应、技术正确性和渲染几何。必须继续逐章独立审阅。

## 现有截图工具的边界

`tools/render-slides.mjs` 支持相对 `--out`，会检查非空 PNG 产物后才打印成功；`--page --slide=N` 按 `.slide` 序号选择，不计入 `.deck-heading`。但 Chrome CLI 会把真实布局视口限制在至少 500 CSS px，即使截图文件名标称 390 也可能只是裁切 500 px 页面。因此脚本现在明确拒绝 `--page --width<500`。320/390 px 响应式验收必须用 Playwright `page.setViewportSize` 或 CDP `Emulation.setDeviceMetricsOverride` 后截图；不能用旧 CLI 裁切图作手机验收证据。桌面/单帧截图可继续用现有 CLI。
