# D2 画图规则（跨会话必读）

> 写任何 ````d2` 之前读本文件。Clear 之后也认这一份，不靠聊天记忆。
> 浏览器实现见 `src/lib/d2Render.ts`（时序图会在渲染后压行距）。大纲摘要见 `PLAN.md` §4.1。

**默认横着画。** 竖条、细高塔、800px 高的时序图都是不合格。D2 默认 `direction: down`，不写方向就会往下拉。

## 四种图，四种结构（不要混用）

| 类型 | 结构 | 例子 |
|---|---|---|
| **流程 / 步骤** | 全部叶子 + `direction: right` | 4 步、45 分钟剧本、卡住自救、问 4 类问题 |
| **分类对比** | 只用 **grid**（不要 `direction`） | plus vs red flag；sticky vs 无状态 |
| **架构链路** | 3–6 个叶子 + `direction: right` | App → Web → DB；App → LB → Web → Cache |
| **时序** | 必须 `shape: sequence_diagram` | 写后立刻读、缓存 miss 读路径 |

同一张图只选一种。禁止「上面一个大扇出 + 其中一条腿再挂一串」。

## 低级错误（已经犯过，禁止再犯）

| 错误 | 实际长什么样 | 正确做法 |
|---|---|---|
| 流程不写 `direction: right` | 上→下扇出树，200–400px 高 | `direction: right` 一条链 |
| `client: { app: "App" }` 一层一个空壳 | 细高塔 **154×716 / 328×1148** | 拆成叶子：`app -> web -> db` |
| 时序图画成流程图「为了变扁」 | 丢掉 lifeline，读者要的不是这个 | 保留 `sequence_diagram`；行距由渲染器压 |
| 分类图写 `direction: right` 且不写 grid | 两组变成竖条 **202×1400** | 根 `grid-rows: 2`，组内 `grid-columns: N` |
| 分类图写 `direction: down` + `grid-columns` | 两组被铺成一行 1700px | 只用 grid，不要 `direction` |
| 为了「分层」套单节点容器 | 第 2/5/7 集那种细条 | 一层里有**多个**服务才套容器，根仍要 `direction: right` |

画完用 `node scripts/check-chapters.mjs chXX` 看 viewBox：

- 流程图 / 架构链路：高度应约 **80–220**。出现 400+ 且宽度 < 400 = 细高塔，重画。
- 分类 grid：可以到 ~300 高；再高就把两组改成 `grid-columns: 2` 并排。
- 时序图：源码里会很高（~800），**不要改结构**；页面上渲染器会压到约一半。

## 流程 / 步骤

```
direction: right
a: "POST write"
b: "Primary INSERT"
c: "200"
a -> b -> c
```

- 全部叶子，不要套容器。
- 横排 ≤ 5；6 个短标签可以一行（45 分钟剧本那种）。
- 编号的自救 / 提问清单也是链，不是扇出树。

## 分类对比

```
根:     grid-rows: 2
每组内: grid-columns: N   # N = 该行叶子数，≤ 5
```

渲染（上下两行，每行横排）：

```
┌ plus ─────────────────────────────────────────┐
│  trade-off   当队友   卡住不慌   先澄清   问对问题 │
└────────────────────────────────────────────────┘
┌ red flag ─────────────────────────────────────┐
│  over-engineering   抢答   rabbit hole   沉默   不听反馈 │
└────────────────────────────────────────────────┘
```

两组要并排、且每组不超过 3 列时，根用 `grid-columns: 2`（比上下叠更扁）。条目对照**只用 grid**，`direction` 管的是有边的流程图。

## 架构链路

3–6 个节点（拆 web/DB、缓存路径、多 Region）：

```
direction: right
app.class: go
app: "App"
web.class: step
web: "Web"
db.class: store
db: "DB"
app -> web -> db
```

有分叉（Cache vs Primary、Region A vs B）时仍 `direction: right`：主干横着走，分叉可以上下两路，整体高度约 200，不要叠成四层空壳。

后面 case 真要分层：一层一个容器，**该层必须有多个服务**；根 `direction: right` 让层横排。读路径 / 写路径分开两张图。

## 时序图

```
shape: sequence_diagram
app: "App"
web: "Web"
pri: "Primary"
rep: "Replica"
app -> web: "POST write"
web -> pri: "INSERT"
web -> app: "200"
app -> web: "GET now"
web -> rep: "SELECT"
web -> app: "stale"
```

- 参与者 ≤ 4，消息标签 ≤ 12 字。
- **就是要 lifeline + 箭头。** 觉得太高：消息可以略合并，但不要改成 `direction: right` 方块链。
- 行距 D2 写死约 90px/条，渲染器（`flattenSequenceSvg`）会压；源码 viewBox 高是正常的。

## 平衡（头重脚轻 = 不合格）

- 扇出：一个父对 **N 个同等叶子**（N ≤ 5），每条腿一样长。
- 禁止：`pick → a,b,c` 然后只把 `c` 再挂一串。
- 兄弟标签长度接近（4–8 字）。

## 填充与形态

- **不要**随手写 `style.fill` / `style.stroke`。
- 画布底色由 CSS 剥掉（`.d2-svg > rect.fill-N7`）。
- 配色走 **class**（渲染器注入）。对照/正误必须标 class：

| class | 色 | 用在 |
|---|---|---|
| `go` | 黄 | 起点、输入 |
| `step` | 青 | 过程、选项 |
| `ok` | 绿 | plus、成功 |
| `bad` | 红 | red flag、失败 |
| `warn` | 橙 | 注意、级别 |
| `store` | 紫 | 存储、深入 |
| `box` | 蓝 | 中性框 |
| `group` / `groupOk` / `groupBad` | 浅底 | 分类容器 |

- 没标 class 的叶子按 黄→青→绿→橙→紫→蓝 循环。
- 同一张图形态要一样：流程题一律矩形。
- 不要套只有标题的空壳。

## 尺寸与版式

- 根：`style.font-size: 12`
- 横排 ≤ **5**；超过就折行
- 标签最多两行；整句放正文
- 渲染 `scale: 1`；页面 `max-width: 100%` 等比缩小
- **禁止图内滚动条**
- ID：英文驼峰；不用 `top` / `bot` / `near`
