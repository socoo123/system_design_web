# Ch01 仅SVG返修 · 2026-10-22

本次按用户两张标红截图，并以 **Ch03 的节点比例和留白** 为参照重排 Ch01。之前“已修复”的视觉结论漏掉了贴边/压线，不能作为本次证据。当前修复范围仅为SVG布局与本章专属图源/检查记录；没有修改正文、双语说明、代码、图注、闪卡、公共CSS/JS或其他章。

## 布局改动

- **D1，d1s1–d1s4**：Caller→Service通道改为140px，Service宽150；底部Relay/Queue/Worker按90px通道分开，publish/deliver有实际留白。lookup、fill和回复各用独立走线，移除旧lookup字压fill线的问题。圆柱总高约90px，与Ch03的80px App框更协调。
- **D2–D5，d2s1–d5s4**：共同主干固定为Client x44、Edge x200/宽110、Product Service x445/宽150、Store中心840/宽150。三个通道约131/136/170px；恢复完整`/products/42`与`200 / 404`，不用缩短文字代替间距。主干下移，让Cache分支拥有独立的上方空间。
- **D2F3/F4**：复查发现`NO WIRE`碰到Store底部圆弧，将其移到scope note左侧独立空白区。
- **D3F3/F4**：顶部badge上移，`fill after row`与色块之间留白；正文中的100上限/80预算/98.4%语义不变。
- **D5F3**：只绘制一份Product Service节点，去掉旧/新节点覆盖重绘；F4拒绝箭头复用清楚的回复通道。保留无gate→加gate→超额503的原有演示次序与正确数字。
- 字体沿用共享样式，未缩小；所有组中已出现节点的位置与尺寸稳定。帧数、顺序、20个ID、SVG title/desc均保留。生成源为[layout.mjs](../../diagrams/ch01/layout.mjs)，可执行`node diagrams/ch01/layout.mjs`重建，已验证重复运行产物相同。

## 量字与目视证据

采用真实Chrome/Playwright加载页面实际字体；检查覆盖所有`text`，包括tiny、clock、badge-text。获取`getBBox()`，逐条采样wire，检测文字与其他节点、文字、箭头、边界、badge的4px安全距离；内部主/副标题也纳入检查。构建后进行40张SVG截图的逐组全帧目视，不以计数或零溢出代替图内检查。

在960×420原坐标下，代表标签的实测宽度/水平空白：

| 标签 | 字宽 | 通道宽 | 字至左右节点边界的最小水平空白 |
|---|---:|---:|---:|
| D1 GET / PUT | 61.75px | 140px | 39.1px |
| D1 JSON / ack | 65.23px | 140px | 37.4px |
| D1 publish | 39.42px | 90px | 25.3px |
| D1 deliver | 36.42px | 90px | 26.8px |
| D2 /products/42 | 75.48px | 136.38px | 30.6px |
| D2 200 / 404 | 57.20px | 132.09px | 30.5px |

[几何与范围证据](screenshots/ch01-layout/geometry.json)保留每帧每个文本bbox、节点bbox及实际viewport结果；最终40帧检查无候选碰撞。目视重点包括用户标红的五类通道、Cache上方线路、NO WIRE/Store圆弧、顶部色块及全部普通/故障帧。早期一次CLI截图漏绘Caller图标；真实Playwright图标正常，因此最终证据使用Playwright等待字体和两帧渲染后的截图。

- [Ch03参考](screenshots/ch01-layout/ch03-reference.png)
- D1：[前](screenshots/ch01-layout/d1s4-before.png) / [后](screenshots/ch01-layout/d1s4-parchment.png)
- D2：[前](screenshots/ch01-layout/d2s2-before.png) / [后](screenshots/ch01-layout/d2s2-parchment.png)
- 全部帧：[D1浅](screenshots/ch01-layout/d1-parchment-all.png) / [深](screenshots/ch01-layout/d1-dracula-all.png)；[D2浅](screenshots/ch01-layout/d2-parchment-all.png) / [深](screenshots/ch01-layout/d2-dracula-all.png)；[D3浅](screenshots/ch01-layout/d3-parchment-all.png) / [深](screenshots/ch01-layout/d3-dracula-all.png)；[D4浅](screenshots/ch01-layout/d4-parchment-all.png) / [深](screenshots/ch01-layout/d4-dracula-all.png)；[D5浅](screenshots/ch01-layout/d5-parchment-all.png) / [深](screenshots/ch01-layout/d5-dracula-all.png)。
- 实际页面：[1440浅色D1](screenshots/ch01-layout/page-1440-parchment-d1.png)、[1440深色D3](screenshots/ch01-layout/page-1440-dracula-d3.png)、[390浅色D2](screenshots/ch01-layout/page-390-parchment-d2.png)、[390深色D5横滚后](screenshots/ch01-layout/page-390-dracula-d5-right.png)。390/1440×两主题均记录真实innerWidth；五组图在390中可横滚406px，整页scrollWidth等于viewport。手机截图按图内滚动访问完整图，没有把大图压到390px。

## 范围与检查

改前完整章节备份：`/tmp/ch01-svg-revision-before.html`。将每个SVG整体替换为相同占位符后，**改前/改后非SVG内容逐字节相同**，SHA256均为：

`8a05bf8156c6b7eed024dc4ad9b7213b4fc1c42eef81d79ea5a55fcfffc7f67d`

最终章节SHA256：`23711e649149e9357e63a241cacd68378a9464dea91645760ea7806bbcd48096`。

`node tools/audit-chapter.mjs ch01`、`node tools/check.mjs`、两份新增MJS语法检查、限定改动文件`git diff --check`通过。5组20帧保留，全站仍276组/1411帧。12条旧代码迁移提示与本次图形修改无关。

[检查脚本](../../diagrams/ch01/check-layout.mjs)通过`PLAYWRIGHT_MODULE`指定本地Playwright安装，`CH01_BEFORE`指定改前完整HTML；它只生成证据，不修改章节。实际目视结论仅覆盖此处记录的Chrome尺寸、两主题与帧状态；最终交付以当前截图为准，不延用上一轮“图无问题”的概括。未提交、未部署。

主代理收口复核：同一最终SHA，390/1440×2主题×3语言共12组合，240次帧按钮访问无错误；非SVG hash不变，Ch03/Ch04/Ch09均与原始基线一致。记录见[ch01-layout-root-results.json](ch01-layout-root-results.json)。
