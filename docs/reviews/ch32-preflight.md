# Ch32 · 开始前清单

2026-10-24；GPT-6.1-Sol (`gpt-6.1-sol`) + Max (`max`)。不派子 agent，不修改共享文件，不提交/发布。

- 保留原 6 组 32 帧（5/5/6/5/5/6）和全部 title/desc ID、顺序；已有末帧足够作总览，不凑静态图。
- 保留实际 usage / hold / 速率三账、UNKNOWN、响应提交边界、完整缓存键与 FAQ opt-in。
- 将长假设表折叠，合并反复开场、重述、产品术语目录；六组图各自紧贴机制。
- 核心纠错：结算唯一键以 attempt 为身份，不允许换 event id 再扣；a1 UNKNOWN 的 hold 不用于 a2；fallback 与所选 attempt/owner 的 COMMITTED 必须互斥；取消不证明远端停止；≤2 attempts 只约束同一请求集合总数，不封住跨窗峰率。
- 补三个核心机制：路由过滤伪代码、SQLite 文件库持久预占/幂等结算（两段短展示）、响应提交/有界转发伪代码。网页与 examples 同源检查。
- 测试使用真实 SQLite 多连接/进程事务、失败重开与竞态，另有协议手推。不能把这些说成运行了 PG、真实 provider、网络 SSE 或生产 tokenizer。
- 动画局修：D1/D3/D6 Ledger 两行间距；D2 primary 与 filter；D3 usage/status 与结算注；D4 末帧长注行距；D6F5/F6 重复请求标签。先按主代理基线浅色末帧接触表目视；修改后全组全帧双主题与真实 390 横滚再验。
- 事实使用 OpenAI Docs 技能：先检索本地没有 API 文档/实现，再官方 OpenAI 搜索/打开；Claude streaming/rate、HTTP/SSE、SQLite/PG 使用各自一手文档。产品文档核验日 2026-10-24；不引用账户额度、当前价格或性能。

主代理已确认该清单并补充跨统计窗重试口径。授权前哈希及帧清单见 `ch32-animation-before.json`。
