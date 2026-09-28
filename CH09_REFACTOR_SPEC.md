# Ch09 审计与重构规范

> 状态：仅完成审计，尚未改动站点代码  
> 对象：`chapters/ch09.html`（设计短链服务）  
> 用途：先指导 Ch09 重构；验证通过后，作为 Grok 4.7 重构其他章节的质量基线  
> 结论日期：2026-09-28

## 1. 结论先行

当前 Ch09 不是“图太少”，而是**把卡片排布误当成了架构可视化**。

页面已有 7 组 deck、28 张 slide，看起来数量不少；但 SVG 实际由 66 个矩形、38 条直线和 38 个箭头组成，没有系统边界、队列、存储语义、时序泳道、回程路径、故障路径或完整写链路。多数 slide 只是把一两个指标或名词装进方框，不能帮助读者建立端到端系统模型。

重构目标不是继续“加方片”，而是完成下面四件事：

1. deck 进入视口后自动播放，一次播到完整图；同时保留手动控制、暂停与重播。
2. 用真正的架构图、时序图和故障图取代指标卡片；每组最后一帧必须形成完整、可口述的系统视图。
3. 补齐写路径、缓存语义、一致性、失败降级、安全滥用和数据模型等主体内容。
4. 关键事实必须绑定一手资料、标准或论文；不能只用站内章节链接冒充引用。

当前版本不适合作为其他章节照抄的终版样板。应先把 Ch09 改到本规范的验收线，再让其他章节复用其组件和表达方式。

## 2. 当前页的可核验证据

| 项目 | 当前值 | 判断 |
|---|---:|---|
| deck 数 | 7 | 数量够，类型失衡 |
| slide 数 | 28 | 页数不等于信息量 |
| SVG `rect` | 66 | 几乎所有概念都被画成同一种方框 |
| SVG `line` / `polygon` | 38 / 38 | 只有单向直线箭头 |
| SVG `path` / `circle` / `ellipse` | 0 / 0 / 0 | 没有边界、存储、队列、状态或时序语义 |
| 外部资料链接 | 0 | 主体结论不可追溯 |
| bibliography / DOI / RFC | 0 | “cite” 实际只是站内导读 |
| 播放机制 | 手动 | 无自动播放、暂停、重播、视口感知 |
| slide 切换 | `display: none/block` | 无过渡，也没有“新增这一笔”的视觉强调 |

这些数字不是要求以后堆更多 SVG 图元；它们只用于说明当前表达高度同质化。

## 3. 问题清单

### P0：必须先解决

#### 3.1 没有自动播放

`assets/js/slides.js` 只实现上一笔、下一笔、圆点和左右方向键。每个 deck 初始化后永久停在第 1 张，除非用户主动操作。

这和“一笔一笔画”的教学意图冲突：读者看到的是残缺图，且需要连续点击 21 次才能看完除首帧外的所有内容。

#### 3.2 缺少总架构图和完整写路径

当前最长的一组是读路径，但它仍有这些缺口：

- 没有一张同时呈现 create 与 redirect 两条主路径的高层总图。
- 写路径只在正文里用一句话带过，没有 `POST /shorten` 的端到端时序。
- ID allocator / segment service 没有进入系统图。
- 文案说 Analytics “异步送去”，图却从 Redirect 直接指向 Analytics，没有 MQ / event stream。
- 读路径没有画 302 返回箭头、`Location`、cache fill、过期 / 撤销判断。
- 没有任何组件故障时的降级路径。

因此读者无法回答最基本的白板问题：请求从哪里来、经过谁、状态写到哪里、失败时怎样继续服务。

#### 3.3 关键技术表述不够严谨

需要纠正以下结论，而不是仅扩写：

1. **“302 不会缓存”说得过满。** RFC 9110 规定 301 可启发式缓存，302 表示临时重定向；RFC 9111 也允许在存在显式 freshness / cache directive 时存储重定向响应。若目标是每次点击都回源统计，应明确返回 `Cache-Control: no-store`（或说明采用短 TTL / 边缘日志的另一种 trade-off），不能只依赖状态码。
2. **“base62 后固定 6 位”缺少前提。** 普通计数器的 base62 编码天然是变长的。要固定 6 位，必须明确左侧 padding、保留起始区间或采用固定宽度编码；否则“长度稳定”不成立。
3. **“Snowflake 约 11 位”需要展示推导。** 原始 Snowflake 是 63 个有效位的 64-bit ID，经典布局为 timestamp / worker / sequence。其最大值需要 11 个 base62 字符；较小或较早的 ID 可能更短，所以应说“最多 11 位，当前量级通常为 11 位”，而不是把每一个 Snowflake 都说成固定 11 位。
4. **“同一 long URL 默认返回同一码”不是通用默认。** 同一个目标常因 tenant、campaign、owner、expiry 或 analytics 维度产生多个短码。正确默认是创建接口支持 `Idempotency-Key`，去重范围由产品需求定义；不能直接做全局 `url -> code` 反向索引。
5. **“Analytics 决定必须 302”仍不完整。** 状态码、Cache-Control、CDN 策略和统计位置共同决定是否每次命中应用服务。要讲完整策略，而不是单一状态码口号。

### P1：主体内容明显不足

#### 3.4 正文像结论提词器，不像完整设计题

当前页面覆盖了 302、base62 和热点缓存，但下列面试主体基本缺失：

- functional / non-functional requirements 与明确的 out of scope；
- API 请求、响应、错误码和幂等语义；
- SLO：redirect 延迟、可用性、创建延迟、数据持久性；
- 写路径：自定义 alias、ID 分配、并发占用、条件写、失败重试；
- 最小数据模型、主键、必要索引、状态与过期字段；
- cache hit / miss / fill、negative cache、TTL、失效与 stampede；
- 删除、撤销、过期、改目标时的一致性窗口；
- Redis、KV、ID allocator、MQ 分别故障时的行为；
- 恶意 URL、钓鱼、枚举、创建滥用、scheme 校验与举报封禁；
- 顺序短码的可枚举性，以及“短”和“不可预测”不能免费兼得的 trade-off；
- 什么时候单库足够，什么时候才需要 partition / multi-region。

内容增加必须围绕“做决策—画路径—讲 trade-off”，不能扩成产品清单或云服务名词堆砌。

#### 3.5 估算没有真正驱动设计

当前把 QPS 放进两个方框后就结束了。重构后，估算必须显式导出设计决定：

- 日创建量 → ID 空间与增长年限；
- redirect 峰值 → cache 容量、命中率假设、应用实例吞吐；
- 平均 URL / metadata 大小 → 年增存储与副本成本；
- 热点分布 → 是否需要 local cache、request coalescing；
- analytics event 大小与峰值 → MQ 是否需要分区与异步批量落地。

假设和事实必须在视觉上区分，不能把“100:1”画得像公开生产数据。

### P2：表达与可访问性不足

#### 3.6 图的语义过于单一

“Alias → TTL → Analytics → Read:write”不是架构关系，却被硬画成流水线。301 / 302、容量数字和方案对比也被重复画成左右方块。它们更适合表格、公式或短文，不应占用主要 deck。

SVG 还缺少：

- `<title>` / `<desc>` 或等价的 `aria-labelledby`；
- 当前新增组件的高亮；
- 同步、异步、回程、失败线的图例；
- system boundary、trust boundary 和 source of truth 的区分；
- 移动端仍可辨认的最小字号与布局规则。

## 4. 自动播放交互规范

自动播放属于公共 deck 能力，建议在 `assets/js/slides.js` 与 `assets/css/style.css` 一次实现，并保持现有章节兼容。

### 4.1 默认行为

1. deck 至少 60% 进入视口后，从第 1 帧自动播放。
2. 默认每帧 3.5 秒；复杂时序图可用 `data-interval` 单独设为 4.5–5 秒。
3. 播到最后一帧后停止，不无限循环；最后一帧是完整架构，必须留在屏幕上。
4. deck 离开视口或页面进入后台时暂停，回来后从当前帧继续。
5. 同一时刻只允许一个 deck 自动播放，避免页面多处同时闪动。
6. 用户点击上一笔、下一笔、圆点或键盘后，视为接管：立即暂停自动播放。
7. 控制栏增加“暂停 / 播放”和“重播”；状态在中英文界面都要正确。
8. deck 再次进入视口时不自动从头循环；只有“重播”显式重置。

### 4.2 动效

- 帧切换使用 180–260 ms 的淡入和轻微位移。
- 旧组件保持稳定，新加入的组件 / 连线用一次性 emphasis 标识；不要让整张图反复缩放。
- 不使用外部动画库，不引入 CDN。
- 用户设置 `prefers-reduced-motion: reduce` 时关闭自动播放和过渡，但保留手动翻页。

### 4.3 可访问性

- 播放 / 暂停按钮必须是真正的 `<button>`，带 `aria-label` 和 `aria-pressed`。
- 计数变化使用克制的 live region；自动播放时不要每 3.5 秒打断屏幕阅读器。
- SVG 提供短 `<title>` 和描述完整路径的 `<desc>`。
- 键盘焦点进入 deck 时暂停，离开后不擅自重启。

## 5. 图形重构原则

### 5.1 架构图不是“组件数量更多”

一张合格的架构图必须回答至少三个问题：

1. 请求或事件从哪里来、到哪里去？
2. 哪个组件拥有状态，哪个只是计算 / 路由？
3. 正常、异步和失败路径分别是什么？

只展示名词、指标或优缺点的卡片不算架构图。

### 5.2 视觉语法

所有章节复用同一套语义，不按章节临时发明：

| 元素 | 语义 |
|---|---|
| 人物 / 终端轮廓 | Client / operator / external caller |
| 圆角矩形 | stateless service / process |
| 圆柱或明确的 store 图形 | durable database / KV / object store |
| 双线小容器 | cache |
| 横向管道 / queue 图形 | MQ / event stream |
| 实线箭头 | 同步请求 |
| 实线回箭头 | 同步响应 |
| 虚线箭头 | 异步事件 |
| 红色虚线 | failure / fallback |
| 大边界框 | system / region / trust boundary |
| 当前强调色 | 本帧新加的一笔 |

不能为了“丰富”而滥用形状；形状变化必须携带语义。

### 5.3 deck 的构图规则

- 每组 3–6 帧，沿用 `960 × 420` 横版 `viewBox`。
- 使用累积绘制：上一帧已经出现的关键组件在下一帧保留，避免读者重新定位。
- 每组最后一帧是完整图，不是新的孤立结论卡。
- 完整架构帧建议 7–12 个有意义节点、8–15 条带标签的边；不是硬性凑数。
- 同一个概念只用一个名称，例如 `Redirect Service` 不在后文变成 `URL Service`。
- 线上短标签，解释放 `figcaption`；边上必须标出 `GET`、`PUT-if-absent`、`cache miss`、`302 Location`、`click event` 等关键语义。
- 至少 70% 的 deck 必须是架构、时序、状态或故障演化图；指标 / 方案卡片最多占 1 组。

## 6. Ch09 的推荐新结构

目标阅读时长 35–40 分钟，7 组主 deck。估算、301/302 对比和结论表用正文 / 表格表达，把 deck 留给动态关系。

### Deck A：高层总架构（4–5 帧）

逐帧增加：

1. Browser / App → Edge / LB。
2. 分出 `POST /links` 的 Shorten Service 与 `GET /{code}` 的 Redirect Service。
3. 接入 Mapping Store 与 Redis；标出 source of truth。
4. 写侧接入 ID Allocator；读侧回 `302 + Location + Cache-Control`。
5. Redirect Service 异步发 Click Event → MQ → Analytics Sink。

最后一帧必须能在 60 秒内口述完两个主路径。

### Deck B：创建 / 写路径时序（5–6 帧）

参与者：Client、Shorten Service、Policy / Abuse Check、Idempotency Store、ID Allocator、Mapping Store。

必须覆盖：

- validate scheme / normalize 的边界；
- `Idempotency-Key` 命中直接返回；
- custom alias 用 `PUT if absent` / unique constraint 抢占；
- 普通创建从 segment allocator 取 ID，再 base62；
- mapping 与 idempotency 记录的原子性或补偿说明；
- 冲突、allocator 暂时不可用时如何失败或消耗本地剩余号段。

### Deck C：跳转 / 读路径时序（5–6 帧）

参与者：Browser、Edge / LB、Redirect Service、Local Cache、Redis、Mapping Store、MQ。

必须覆盖：

- local / Redis hit 的快路径；
- miss → store → cache fill；
- not found / expired / revoked 不得 302，并可短时 negative cache；
- 返回 `302 Location`，同时明确 Cache-Control 策略；
- click event 异步进入 MQ，失败不阻塞 redirect；
- 读路径的响应箭头必须真正画回 Browser。

### Deck D：短码与 ID 分配（4–5 帧）

这组不是左右方案卡，要画出 ID 如何产生：

1. `62^6` 容量与日增量推导。
2. Segment DB / allocator 给多个实例分配不重叠号段，实例本地递增。
3. ID → base62；若声称固定 6 位，画出 padding / reserved range。
4. Snowflake 的 bit layout：timestamp / worker / sequence，并推导 63-bit 上界为何需 11 个 base62 字符。
5. 说明截断 Snowflake 会丢失唯一性；若需要不可枚举，另讲 permutation / random token 的 trade-off。

### Deck E：热点与缓存一致性（4–5 帧）

画出 Local Cache → Redis → Mapping Store 的层级，并逐帧增加：

- Zipf-like 热点假设；
- request coalescing / singleflight 防 stampede；
- TTL + delete / retarget invalidation；
- Redis 故障时 bypass 到 store 并限流；
- store 故障时只允许怎样的 stale read，必须由产品语义决定。

### Deck F：故障与降级（4–5 帧）

在高层总图上逐个覆盖故障，不另画孤立卡片：

- Redis down：绕过、熔断、保护 Mapping Store；
- ID allocator down：使用实例已领号段，耗尽后 create 失败，redirect 不受影响；
- MQ / analytics down：redirect 成功，事件缓冲或允许统计降级；
- Mapping Store down：明确 redirect 的可用性和数据陈旧边界；
- cache 与 store 不一致：版本 / TTL / 主动失效策略。

### Deck G：安全与滥用（3–4 帧）

用 trust boundary 画出创建侧和跳转侧防线：

- 创建限流、tenant quota、允许的 URL scheme；
- malware / phishing 检测、举报与封禁状态；
- 顺序短码可枚举，短码不是访问控制；
- 预览页只作为产品选择，不能代替权限控制。

## 7. 正文最低内容清单

图之外，正文至少补齐这些可直接口述的材料：

### 7.1 需求和假设

- 创建、跳转、自定义 alias、过期 / 撤销、analytics。
- 明确短码不是私密分享凭证。
- 明确是否支持 custom domain、retarget；超出本轮范围的项目写入 out of scope。

### 7.2 API

至少给出：

- `POST /v1/links`：`long_url`、可选 `custom_alias`、`expires_at`、`Idempotency-Key`。
- `GET /{code}`：成功返回 302 和 `Location`；expired / revoked / unknown 的产品化错误语义。
- 自定义 alias 冲突使用明确错误码；不要只写“拒绝”。

### 7.3 数据模型

最小映射记录建议说明：

```text
Link(code PK, target_url, owner_id, status, created_at, expires_at, version)
Idempotency(owner_id, key, code, expires_at, PRIMARY KEY(owner_id, key))
```

是否需要 `target_url -> code` 反向索引必须由“同 URL 同码”的产品需求决定，并限定 tenant / campaign 范围，不能默认全局唯一。

### 7.4 估算

数字可以沿用当前假设，但要统一计算并标注为 assumption：

- 1M creates/day ≈ 11.6 average write QPS；10× peak ≈ 116 QPS。
- 100 redirects/create ≈ 1.16K average read QPS；10× peak ≈ 11.6K QPS。
- `62^6 = 56,800,235,584`；按 1M/day 理论空间约 155 年，实际要预留删除不复用、alias、测试和增长余量。
- 存储按记录大小 × 年新增 × 副本数算，不把目标页面流量算到短链服务。

### 7.5 trade-off

至少讲清：

- 302 + `no-store` 保统计完整，但每次点击都承担服务端流量；短 TTL / edge analytics 可换可用性和延迟。
- segment + base62 紧凑且无碰撞，但顺序可枚举且依赖号段分配。
- random token 不暴露顺序，但需要足够熵、唯一约束和碰撞处理。
- 强一致 retarget / revoke 与高可用 redirect 之间存在传播窗口。

## 8. 引用规范与 Ch09 必备资料

### 8.1 引用规则

1. 首选标准、论文、项目原始仓库和厂商工程原文。
2. 每条引用必须紧跟它支持的结论，不能只在文末堆链接。
3. “参考某章”属于站内导读，不算外部证据。
4. Snowflake 没有一篇可当作唯一原始论文的正式学术论文；应诚实引用 Twitter 的原始开源实现 / 说明。禁止虚构“Snowflake 论文”。
5. 正文用 `[1]`–`[n]`，页末给出完整标题、作者 / 机构、年份和可访问链接。
6. 引用只支撑事实，不代替本章自己的推导。例如 base62 长度要在页内算给读者看。

### 8.2 建议引用表

| 要支撑的内容 | 一手资料 / 论文 | 本章怎么用 |
|---|---|---|
| 301 / 302 语义 | [RFC 9110 · HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html) | 解释 permanent / temporary redirect 与 method 语义 |
| HTTP 缓存控制 | [RFC 9111 · HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111.html) | 纠正“302 天然不缓存”，说明显式 freshness / `no-store` |
| Snowflake 来源 | [twitter-archive/snowflake](https://github.com/twitter-archive/snowflake) | 说明它是高规模 unique ID service，并标注原实现已归档 |
| 号段与 Snowflake 工程实现 | [Leaf：美团分布式 ID 生成服务开源](https://tech.meituan.com/2019/03/07/open-source-project-leaf.html) 与 [Leaf repository](https://github.com/Meituan-Dianping/Leaf) | 支撑 segment mode 与 Snowflake mode 的工程背景 |
| 短码枚举风险 | [Georgiev & Shmatikov, *Gone in Six Characters: Short URLs Considered Harmful for Cloud Services*](https://arxiv.org/abs/1604.02734) | 支撑“短码不是访问控制”和 5–6 位 token 可被扫描的风险 |
| Web 热点 / Zipf-like 分布 | [Breslau et al., *Web Caching and Zipf-like Distributions*, INFOCOM 1999](https://doi.org/10.1109/INFCOM.1999.749260) | 给“热点分布”添加来源，同时说明它是工作负载模型而非本站实测 |
| 大规模缓存工程 | [Nishtala et al., *Scaling Memcache at Facebook*, NSDI 2013](https://www.usenix.org/conference/nsdi13/technical-sessions/presentation/nishtala) | 支撑缓存一致性、失败处理与 read-heavy 服务的讨论 |
| KV 设计背景 | [DeCandia et al., *Dynamo: Amazon’s Highly Available Key-value Store*, SOSP 2007](https://www.amazon.science/publications/dynamo-amazons-highly-available-key-value-store) | 只在讨论可用性 / 一致性 trade-off 时引用；不要借论文替具体选型背书 |

不要求每一页都塞论文，但主体的标准语义、算法来源、安全结论和工作负载假设必须可追溯。

## 9. 给 Grok 4.7 的执行约束

重构 Ch09 时：

1. 先读 `PLAN.md`、`chapters/ch01.html`、当前 `chapters/ch09.html`、`assets/js/slides.js`、`assets/css/style.css`。
2. 不得引入 D2、Mermaid、Canvas 动画或外部 CDN；图仍是内联 SVG。
3. 不得只润色文案或把现有方框改颜色；必须按第 6 节重建信息架构。
4. 不得删除中文 / English / 对照模式。
5. 自动播放必须向后兼容其他章节；旧 deck 即使没有新 data attribute，也能正常手动翻页。
6. 引用必须逐条验证可访问性和结论匹配；不确定的来源不写。
7. 每组图先画最终完整帧，再反推前面的累积帧，防止最后仍是一排卡片。
8. `figcaption` 回答“这一笔为什么加、改变了哪个设计决定”，不要复述框内标签。
9. 完成后运行 `node tools/check.mjs`，并在窄屏、中文、English、对照、护眼、深色下抽查。
10. 不主动提交或部署。

把本规范推广到其他章节时，只复用交互、视觉语法、引用标准和 review rubric；不要把 Ch09 的 7 组图标题机械套到别的主题。

## 10. 后续 Review 验收表

### 10.1 一票否决

出现任一项即退回：

- deck 仍只能手动播放，或自动播放无限循环且不能暂停；
- 没有高层总架构、完整写路径或完整读路径；
- 主体仍以名词方片 / 指标卡为主；
- 继续声称“302 一定不会缓存”；
- 继续声称普通 base62(counter) 天然固定 6 位；
- 引用不存在、打不开、与结论不匹配，或把 Snowflake 虚构成论文；
- Analytics 文案说异步，图中却没有事件队列；
- 中文和英文的事实、数字或图注不一致；
- 引入 D2 / Mermaid / 外站脚本；
- `node tools/check.mjs` 不通过。

### 10.2 评分（100 分）

| 维度 | 分值 | 通过标准 |
|---|---:|---|
| 架构表达 | 30 | 图能还原端到端路径、状态归属、异步与失败路径 |
| 内容完整与正确 | 25 | API、估算、读写、ID、缓存、一致性、安全、trade-off 齐全且无硬伤 |
| 自动播放与可用性 | 15 | 视口触发、播完停、接管暂停、重播、reduced motion、键盘可用 |
| 引用质量 | 15 | 关键结论就地引用一手来源，无伪引用 |
| 教学节奏 | 10 | 每一笔有目的，最终图可在面试口述，不堆无关复杂度 |
| 双语与工程质量 | 5 | 中英一致、响应式 / 主题正常、检查脚本通过 |

总分至少 85，且没有一票否决项，才可把 Ch09 认定为新的样板。

## 11. 实施顺序

后续收到明确修改指令时，建议按以下顺序执行：

1. 先实现并验证公共 deck 自动播放能力。
2. 重画 Ch09 的 A–C 三组主路径，确保总架构、写、读成立。
3. 补 D–G 的 ID、缓存、故障和安全图。
4. 补正文、纠正技术表述并加入引用。
5. 跑检查、做多语言 / 主题 / 窄屏 review。
6. Ch09 达到 85 分后，再让 Grok 4.7 按本规范重构其他章节。
7. 每批返回后由主 reviewer 按第 10 节验收，不因“图多”或“代码量大”直接通过。
