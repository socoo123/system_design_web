# Ch09 教学实现与验证

页面共享四份源码：`schema.sql`、`create.pseudo`、`redirect.pseudo`、`revoke.sql`。
SQL 是 PostgreSQL 18 教学片段；`:name` 代表驱动绑定参数，并非可直接粘贴执行的 psql 变量。伪代码不是可编译 Java 或完整生产服务。风险准入、URL 解析、HTTP 适配、超时与数据库连接管理依赖正文明确的外层契约；唯一性与提交边界没有由这些辅助函数代替。

从仓库根目录运行：

```sh
node examples/ch09/sync.mjs
node examples/ch09/sync.mjs --check
node examples/ch09/verify.mjs
node tools/audit-chapter.mjs ch09
```

`verify.mjs` 是可执行契约模型与独立数值复算，检查正常创建、两个先查 miss、同 alias 同 key、不同参数、回滚、提交回执丢失、随机碰撞及重试上限、过期后幂等回放、缓存原截止、pending、版本 floor、条件撤销与 outbox。它**假定**已按 PostgreSQL 18 官方文档核对的唯一约束/事务语义，不会连接 PostgreSQL 或 Redis，不是数据库并发、跨机时钟或服务压测证据。源码与页面同源由 `sync.mjs --check` 验证；模型不冒充伪代码编译器。

视觉复现使用已有 Playwright/Chrome；本次机器的入口：

```sh
PLAYWRIGHT_MODULE=/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs node diagrams/ch09/capture.mjs after
PLAYWRIGHT_MODULE=/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs node diagrams/ch09/check-page.mjs
```

其他机器设 `PLAYWRIGHT_MODULE` 或安装 `@playwright/test`；可用 `CHROME` 指定浏览器、`SITE_BASE` 指定已运行的站点。默认站点为 `http://127.0.0.1:8765`。`capture.mjs before` 要求 `CH09_BEFORE` 指向原页面副本；本次前图已经保存在仓库证据目录。源码中的 SVG 仍是图的权威维护来源，`repair-layout.py` 仅记录本次坐标级修复。

验收范围、来源和限制见 [Ch09 自检记录](../../docs/reviews/ch09.md)。
