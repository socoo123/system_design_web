# 系统设计面试学习站 · 计划

> **本文件是唯一计划，也是唯一进度。** 任何会话（含 Clear）先读本文件。聊天记录不是记忆。
> 用户没说出触发语，不要改站点、不要派 agent。
> 对照站点：`/Users/zy/ai_web_page/vim_study`（纯 HTML，仓库根即站点，Pages：<https://socoo123.github.io/vim_study/>）。

中英原料在 `legacy/src/content/chapters/ch01.json`–`ch45.json`（目录见 `legacy/src/content/index.json`）。译英收官，不要再派翻译。下一步是用 SVG 幻灯片重做 45 章。

## 0. 状态

| 计划 | 内容 | 状态 | 触发语 |
|---|---|---|---|
| 1 | 静态壳 + 样板 Ch01、Ch09 | **已完成 · 2026-09-27** | 「开始计划 1」 |
| 2 | 五路重构 Ch01–Ch45 | **进行中 · 2026-09-29 起按 [`OPUS_REFACTOR.md`](./OPUS_REFACTOR.md) 重构；旧规范写成的章全部待复审** | 「开始重构」/「重构下一波」/「复审 chNN」 |
| 3 | 推 GitHub 并开 Pages | **已推送 · 2026-09-28** · https://socoo123.github.io/system_design_web/ | 「提交并部署」 |

国庆（10/1–10/7）只读主线 M1–M5。要在 10/1 能开读，计划 2 需在 9/30 前至少把 Ch01–Ch35 部署出去。用户说「赶国庆」时，车道连续写完剩余章。

### 五条车道（计划 2 才填）

各写各的 `chapters/chNN.html`。

| Agent | 章 | 下一章 | 进行中（锁） | 待复审 | 本车道已完成（过 Opus 验收） |
|---|---|---|---|---|---|
| A | Ch01–Ch09 | — | — | — | Ch01, Ch02, Ch03, Ch04, Ch05, Ch06, Ch07, Ch08, Ch09 |
| B | Ch10–Ch18 | Ch14 | — | — | Ch10, Ch11, Ch12, Ch13 |
| C | Ch19–Ch27 | Ch21 | — | Ch19, Ch20 | — |
| D | Ch28–Ch36 | Ch30 | — | Ch28, Ch29 | — |
| E | Ch37–Ch45 | Ch39 | — | Ch37, Ch38 | — |

**质量基线是根目录 [`OPUS_REFACTOR.md`](./OPUS_REFACTOR.md)，样板页是 `chapters/ch02.html` 和 `chapters/ch03.html`。** 所有章节——新写、重写、复审——都必须按它 §2 的流程走完：逐张渲染现状 → 列 bug 清单 → 用 `tools/board-kit.mjs` 从一份坐标重画 → 正文逐段对图、重算数字 → 下载原文核引用 → 按 §8 验收。旧的 `CH09_REFACTOR_SPEC.md` 已删除，Ch09 不再是样板。

「待复审」是按旧规范写完、但没过 Opus 验收的章。2026-09-29 用 `node tools/audit-chapter.mjs` 扫过：这 10 章全部缺图例、仍用旧式三段圆柱，Ch11、Ch19、Ch28、Ch29、Ch38 的一手引用不足 6 条。Ch02 就是这样一章，逐张渲染后几乎每张图都有回程跳跃、箭头指空或机制画反。复审是整章按 §2 重做，不是在旧图上补图例、改颜色。复审通过后从「待复审」移到「已完成」。

`tools/check.mjs` 的 deck 数量仍然有效：Ch01–Ch08 为 4–6 组，Ch09–Ch35 为 5–7 组，Ch36–Ch45 为 6–8 组；每组 3–6 帧；`viewBox` 横版。设计题与基础章中文可见汉字目标 6,500–9,000；方法章（Ch01–Ch03）至少 5,500。英文事实、数字、图注与中文逐项对齐。不要把样板章的 deck 标题套到别的主题上。

车道 agent 不得改 `assets/js/slides.js`、`assets/css/style.css`、`tools/board-kit.mjs` 和 `OPUS_REFACTOR.md`；发现全站 bug 先报告。

锁：动笔前把自己的「进行中」写成 `ChNN · 日期`，只改自己那一行。`node tools/check.mjs` 和 `node tools/audit-chapter.mjs chNN` 都通过、且逐张截图看过后清锁；新章把「下一章」改为车道内下一章，复审章从「待复审」删掉；两种都在「已完成」里追加章号。上下文被清、锁非空 → 先写完锁住的那一章。

## 1. 计划 1 · 静态壳

单代理。做成和 vim_study 一样：**仓库根就是站点**，双击 `index.html` 能开，Pages 不用构建。

```
index.html
chapters/chNN.html
assets/css/style.css
assets/js/nav.js          顶栏、侧栏目录、主题
assets/js/slides.js       幻灯片翻页
assets/js/progress.js     localStorage 已读
assets/js/lang.js         中文 / 对照 / EN
tools/check.mjs
```

动工时把现有 Vite 入口挪到 `legacy/`（`legacy/index.html`、`legacy/src`、`legacy/package.json`）。`src-tauri` 先留着，Pages 不打包 DMG。

壳保留：首页六模块卡片、护眼 / 深色、已读进度、章节目录、文末闪卡、M6 相关芯片、中文 / 对照 / EN。图不再在浏览器里跑 D2 WASM。

样板只写两章，后面五路照着抄版式（这是计划 1 的历史；计划 2 的样板已改为 Ch02、Ch03，见 §0）：

- **Ch01** 方法章：4 步法怎么在白板上一步步画出来
- **Ch09** 设计题：短链，一条请求路径拆成一套幻灯片

`node tools/check.mjs` 检查：首页链到章、每组幻灯片是内联 `<svg>`、`viewBox` 横版（宽大于高）、没有 d2 / mermaid、没有外站 CDN script。

做完把 §0 计划 1 改成已完成，并把 A 的下一章设为 Ch02（Ch01、Ch09 算样板已完成）。

## 2. 计划 2 · 五路重构全部章节

这是按 [`OPUS_REFACTOR.md`](./OPUS_REFACTOR.md) 重做，不是把 JSON 压成提词器。原料在 `legacy/src/content/chapters/chXX.json`。版式以 `chapters/ch02.html`、`chapters/ch03.html` 为准，图元用 `tools/board-kit.mjs`，播放器是现有的 `assets/js/slides.js`。D2 退场。

细则全在 `OPUS_REFACTOR.md`，这里只列最容易犯的：

- **逐张渲染再交付。** `node tools/render-slides.mjs chNN`，每张 PNG 都看过。`check.mjs` 通过不代表图对。
- **回程逐跳。** Cache → App → LB → Edge → Client，任何一跳都不能省；故障红线也逐跳。
- **箭头落在边框上。** 不指空白，不戳进框，不缺箭头头。
- **图上机制和正文一致。** look-aside、outbox、lease、复制 fan-out 最容易画反（规范 §3 G4）。
- **一份坐标生成一组 deck。** 帧间节点不动、只加一笔；同一节点全章同名；每张有图例、`title`、`desc`。
- **存储用 path 身 + ellipse 盖**，不用旧式 `ellipse + rect + ellipse`。
- **每个数字重算一遍，最坏情况假设写出来；每条引用打开原文找到那个数。**
- 保留顶栏、护眼/深色、中文/对照/EN、文末闪卡和已读按钮。不用 D2、Mermaid、Canvas、外站 CDN。

阅读预算：

| 类型 | 分钟 | 幻灯片组数 |
|---|---|---|
| method（Ch01–03） | 25–35 | 4–6 |
| brick（Ch04–08） | 30–40 | 4–6 |
| case / ai（Ch09–35） | 30–40 | 5–7 |
| foundation（Ch36–45） | 40–50 | 6–8 |

国庆只要求主线 **M1–M5（35 章）**。M6 当词典，假期不要求读完。

| 日期 | 读 |
|---|---|
| 10/1 | Ch01–Ch03 |
| 10/2 | Ch04–Ch08 |
| 10/3 | Ch09–Ch13 |
| 10/4 | Ch14–Ch18 |
| 10/5 | Ch19–Ch23 |
| 10/6 | Ch24–Ch28 |
| 10/7 | Ch29–Ch35 |

| Agent | 章 | 气质 |
|---|---|---|
| A | Ch01–Ch09 | 方法、构件、短链 |
| B | Ch10–Ch18 | 通知到订单 |
| C | Ch19–Ch27 | LBS 到配送 |
| D | Ch28–Ch36 | 配置中心、LLM、CAP |
| E | Ch37–Ch45 | 存储到 DDD |

父代理看到「开始重构」或「重构下一波」或「分 5 个 agent 重构」：

1. 读本文件 §0。`chapters/ch01.html` 与 `chapters/ch09.html` 不存在 → 不要派，先做计划 1。
2. 有锁的车道只续写锁住的那一章。
3. **同时派 5 个** `generalPurpose`。默认每路 **1 章** 然后停。选章顺序：锁 → 「待复审」里章号最小的 → 「下一章」。
4. 用户说「赶国庆」或「重构本车道剩余」：该车道先把剩余新章连续写完，再逐章清「待复审」，每章仍先上锁、写完解锁。
5. 每人都读本文件 §0–§2、`OPUS_REFACTOR.md` 全文，以及样板 `chapters/ch02.html`、`chapters/ch03.html`。只改自己的 `chapters/chNN.html`。不得改播放器、样式、`tools/board-kit.mjs` 和规范文件。
6. 写完跑 `node tools/check.mjs`、`node tools/audit-chapter.mjs chNN`，逐张看 `render-slides` 截图，按 `OPUS_REFACTOR.md` §8.3 汇报。只改 §0 自己那一行。
7. 五路都回来后，父代理自己跑 `audit-chapter.mjs`，并用 `render-slides.mjs` 抽看每章每组的最后一帧和一张故障帧，按 `OPUS_REFACTOR.md` §8.2 一票否决项验收。不过就退回原车道，不算完成。再问要不要下一波。
8. 某路写完就停。不要把别路的章切过来，除非用户点名收割。

用户说「复审 chNN」或「按 opus 重构 chNN」：单代理只做这一章，按 `OPUS_REFACTOR.md` §2 走完，照样上锁、解锁、更新 §0。

## 3. 计划 3 · 提交并部署

仓库：<https://github.com/socoo123/system_design_web>。Pages 尚未打开。

用户说「提交并部署」之后：

1. 确认仓库根的 `index.html` 是静态站，相对链接在 `file://` 和 Pages 子路径下都能打开。
2. 提交并推 `main`。
3. 打开 GitHub Pages，源是 `main` 根目录。
4. 目标地址：<https://socoo123.github.io/system_design_web/>。
5. 壳和两章样板可以先部署一版；45 章都进静态页之后再部署终版。进行中不要自动提交。

## 4. 范围

- 只做 M1–M6 / Ch01–Ch45。M5 只做大模型与 Agent 基建
- 不做推荐系统。选修暂停
- 无编码作业、无 AWS 服务清单、无 K8s YAML
- 新图用内联 SVG。不再新写 D2、不用 mermaid
- 不主动 git commit / push
