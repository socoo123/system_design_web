# 系统设计面试学习站 · 计划

> **本文件是唯一计划，也是唯一进度。** 任何会话（含 Clear）先读本文件。聊天记录不是记忆。
> 用户没说出触发语，不要改站点、不要派 agent。
> 对照站点：`/Users/zy/ai_web_page/vim_study`（纯 HTML，仓库根即站点，Pages：<https://socoo123.github.io/vim_study/>）。

中英原料在 `legacy/src/content/chapters/ch01.json`–`ch45.json`（目录见 `legacy/src/content/index.json`）。译英收官，不要再派翻译。下一步是用 SVG 幻灯片重做 45 章。

## 0. 状态

| 计划 | 内容 | 状态 | 触发语 |
|---|---|---|---|
| 1 | 静态壳 + 样板 Ch01、Ch09 | **已完成 · 2026-09-27** | 「开始计划 1」 |
| 2 | 五路重构 Ch01–Ch45 | **进行中 · 第二波已回 2026-09-28** | 「开始重构」/「重构下一波」 |
| 3 | 推 GitHub 并开 Pages | **已推送 · 2026-09-28** · https://socoo123.github.io/system_design_web/ | 「提交并部署」 |

国庆（10/1–10/7）只读主线 M1–M5。要在 10/1 能开读，计划 2 需在 9/30 前至少把 Ch01–Ch35 部署出去。用户说「赶国庆」时，车道连续写完剩余章。

### 五条车道（计划 2 才填）

各写各的 `chapters/chNN.html`。Ch01、Ch09 由计划 1 写成样板后，A 从 Ch02 写到 Ch08，不要重写样板。

| Agent | 章 | 下一章 | 进行中（锁） | 本车道已完成 |
|---|---|---|---|---|
| A | Ch01–Ch09 | Ch04 | — | Ch01, Ch09, Ch02, Ch03 |
| B | Ch10–Ch18 | Ch12 | — | Ch10, Ch11 |
| C | Ch19–Ch27 | Ch21 | — | Ch19, Ch20 |
| D | Ch28–Ch36 | Ch30 | — | Ch28, Ch29 |
| E | Ch37–Ch45 | Ch39 | — | Ch37, Ch38 |

锁：动笔前把自己的「进行中」写成 `ChNN · 日期`，只改自己那一行。`node tools/check.mjs` 通过后清锁，下一章改为车道内下一章，已完成里追加章号。上下文被清、锁非空 → 先写完锁住的那一章。

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

样板只写两章，后面五路照着抄版式：

- **Ch01** 方法章：4 步法怎么在白板上一步步画出来
- **Ch09** 设计题：短链，一条请求路径拆成一套幻灯片

`node tools/check.mjs` 检查：首页链到章、每组幻灯片是内联 `<svg>`、`viewBox` 横版（宽大于高）、没有 d2 / mermaid、没有外站 CDN script。

做完把 §0 计划 1 改成已完成，并把 A 的下一章设为 Ch02（Ch01、Ch09 算样板已完成）。

## 2. 计划 2 · 五路重构全部章节

这是图文重做，不只是把 JSON 倒成 HTML。原料在 `legacy/src/content/chapters/chXX.json`（中文正文和英文口播）。版式照 `chapters/ch01.html` 和 `chapters/ch09.html`。D2 退场。每张架构图改成一套内联 SVG 幻灯片，顺序就是面试时在白板上落笔的顺序：第一张只有入口，逐张把组件加上去，最后一张才是完整图，旁边一行口述「这一笔讲什么」。失败路径和 trade-off 各用自己的一套。

幻灯片：

- `<figure class="deck">` 里每步一个 `<div class="slide">`，里面 `<svg>` + `<figcaption>`
- `viewBox` 横版，例如 `0 0 960 420`。宽小于高就重画
- 颜色用 CSS 变量。标签短，jargon 留英文
- 一组 3–6 张。时序也按步翻页
- 一组讲完，用一句话链到对应 M6 章

正文同时改三件事：事实和过时默认方案按 2026 面试改掉；中英对不上的地方改齐；一句能讲清的不要铺成教材。专业词留英文（trade-off、fan-out、hard part）。英文口播从该章 `bodyEn` / `reviewMdEn` 迁进同一页。

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
3. **同时派 5 个** `generalPurpose`。默认每路 **1 章** 然后停。
4. 用户说「赶国庆」或「重构本车道剩余」：该车道把剩余章连续写完，每章仍先上锁、写完解锁。
5. 每人都读本文件 §1–§2 和两份样板。只改自己的 `chapters/chNN.html`。
6. 写完跑 `node tools/check.mjs`，只改 §0 自己那一行。
7. 五路都回来后，父代理抽查横版 SVG、翻页、中英都在，再问要不要下一波。
8. 某路写完就停。不要把别路的章切过来，除非用户点名收割。

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
