# 系统设计面试学习站 · 示例代码排版整理计划

> 唯一执行计划与进度。清空上下文后先读 `AGENTS.md` 和本文件 §0，再读 §2–§5；聊天记录不作为进度依据。
> **全站示例代码排版已验收45/45：Ch39样板及第1–11批全部完成，最后第11批Ch42–Ch45已收口，全部任务锁释放。** 本轮到此停止；提交、推送或部署须另行明确授权。
> 已完成的中文文案计划原样归档于 [PLAN.archive-2026-10-29.md](./PLAN.archive-2026-10-29.md)，此前技术计划见 2026-10-25、2026-10-22 两份归档。历史完成状态不代表本轮代码排版已完成。

## 0. 当前状态与续接位置

更新时间：**2026-11-03**。

| 项目 | 当前记录 |
|---|---|
| 目标 | 改善章节示例代码的缩进、换行、分段与结构可读性，保持行为与讲解含义 |
| 当前阶段 | **第11批Ch42–Ch45已验收并收口，全站完成**；四份最终hash独立PASS已正式接收 |
| 已验收 | **45/45：Ch01–Ch45**；旧轮中文文案45/45单独保留 |
| 待完成 | **0/45**；本轮无下一批 |
| 当前任务 | 本轮结束：25hash/16同源、主验证/27class原字节/语义/结构、48浏览器组合/44截图实看清理、四独立PASS及最终范围封存通过；所有作者/复核已交接 |
| 下次从哪里开始 | **停止，不再重开排版或中文润色**；见[第11批记录](./docs/reviews/code-format-batch-11.md)。其他任务或发布等待另行明确授权 |
| 任务锁 | **全部释放**；无作者写锁、活动只读复核或共享记录维护锁，四原子会话及临时恢复主均succeeded/idle |
| 授权 | 用户明确执行最后第11批Ch42–Ch45，允许嵌套四linked child，全员Sol/max；不提交、推送、部署，验收交接清锁后停止 |
| 工作区基线 | 执行前已有Ch01–Ch41、入口与历史记录改动全部保留；Ch42–45原无改动，基线已备份，见下文 |
| 提交状态 | 用户于2026-11-03授权推送；排版提交`ea4ec71`及此前本地提交`fd61a12`已推送至GitHub `main`，远端hash已核实；Pages自动构建配置见§6，未验收上线 |

样板基线：`/private/var/folders/5k/y6qh6sfd2g30js0v0qrv4mfr0000gn/T/opencode/code-format-ch39-5tvy1tej`。执行前 HEAD 为 `fd61a122399c786edc8b169e8f62d5c8ec829de4`；`baseline.json` 保存 HEAD、工作区状态和 2,543 个已有文件的 SHA-256，另备份原计划、入口、Ch39 页面及四个示例目录文件。临时基线失效时，先根据记录、Git 和当前工作区恢复证据，不能直接还原用户改动。

第1批基线：`/private/var/folders/5k/y6qh6sfd2g30js0v0qrv4mfr0000gn/T/opencode/code-format-batch-01-kygy0bvy`。HEAD 同上；`baseline.json` 保存执行前状态、2,545个已有文件 SHA-256、四章页面去除代码内容后的哈希；`files/` 备份本批文件、原 PLAN/AGENTS 及原有 Ch04 测试结果。

第2批基线：`/private/var/folders/5k/y6qh6sfd2g30js0v0qrv4mfr0000gn/T/opencode/code-format-batch-02-ls6x2ebc`。HEAD同上；`baseline.json` 保存执行前状态、2,546个已有文件SHA-256、四页受保护部分哈希；`files/` 备份四章全部维护文件、页面与既有计划/记录。保留前批全部未提交改动。

第3批基线：`/private/var/folders/5k/y6qh6sfd2g30js0v0qrv4mfr0000gn/T/opencode/code-format-batch-03-44a1tuqt`。HEAD同上；`baseline.json` 保存执行前状态、2,547个已有文件SHA-256、四页代码外HTML哈希；`files/`备份四章完整示例目录、页面、PLAN/AGENTS及已有排版记录。实际主代理 `ses_e77fee873ffe66XPhI2Ohdz661` 为 `openai/gpt-6.1-sol#max`，外层仅路由，不实施/复核/写共享记录。

第4批基线：`/private/var/folders/5k/y6qh6sfd2g30js0v0qrv4mfr0000gn/T/opencode/code-format-batch-04-u9yo2imh`。HEAD同上；`baseline.json`保存执行前状态、2,548个已有文件SHA-256与四页代码外HTML哈希，`files/`备份44个本批/共享记录文件。实际主代理 `ses_e77dd669dffe16mxIzJDFqhq2Y` 已由会话API确认 `openai/gpt-6.1-sol#max`；外层仅路由，不实施/复核/写共享记录。

第5批基线：`/private/var/folders/5k/y6qh6sfd2g30js0v0qrv4mfr0000gn/T/opencode/code-format-batch-05-tjqzwkmp`。HEAD同上，main ahead 1；`baseline.json`保存2,549个已有文件SHA-256、原状态及四页代码外HTML哈希，`files/`备份49个本批/共享文件。实际主代理 `ses_e75ad27d6ffenb0CLB36eT9sXK` 经API确认 `openai/gpt-6.1-sol#max`；外层仅路由。四作者linked child精确模型/max已核验，上一批会话均succeeded/idle。

第6批基线：`/private/var/folders/5k/y6qh6sfd2g30js0v0qrv4mfr0000gn/T/opencode/code-format-batch-06-_s4t20nj`。HEAD同上，main ahead 1；`baseline.json`保存2,550个Git可见已有文件SHA-256、原状态和四页代码外HTML哈希，`files/`备份59个本批/共享文件。完整文件系统另封存12,619个受保护文件/符号链接（含忽略目录，不含.git与本批允许范围）。实际主代理 `ses_e68b56218ffetCzd9eOaMoHUSy` 经API确认 `openai/gpt-6.1-sol#max`，外层Astra仅路由，不实施/复核/写共享记录。前批四会话已核对succeeded/idle，无在办旧任务。

第7批基线：`/private/var/folders/5k/y6qh6sfd2g30js0v0qrv4mfr0000gn/T/opencode/code-format-batch-07-1tcxdc4h`。HEAD同上，main ahead 1；`baseline.json`保存2,551个Git可见文件SHA-256、原状态和四页代码外HTML哈希，`files/`备份59个本批/共享文件，完整文件系统另封存12,620个受保护文件/符号链接。实际主代理 `ses_e68621b2affeQy0Ke7t06k8vbm` 经API确认 `openai/gpt-6.1-sol#max`；外层Astra仅路由。第6批四会话均已核对succeeded/idle，四新linked child精确模型/max及parent已确认。

第8批基线：`/private/var/folders/5k/y6qh6sfd2g30js0v0qrv4mfr0000gn/T/opencode/code-format-batch-08-j9QepHAI`。HEAD同上，main ahead 1；`baseline.json`保存2,552个Git可见文件SHA-256、原状态和四页代码外HTML哈希，`files/`备份265个本批/相关历史证据/共享文件，完整文件系统另封存12,636个受保护文件/符号链接。实际主代理 `ses_e681ae856ffec5AeNtFF2lz6K6` 经API确认 `openai/gpt-6.1-sol#max`；外层Astra仅路由。第7批四会话已核对succeeded/idle，四新linked child精确模型/max及parent已确认。

第9批基线：`/private/var/folders/5k/y6qh6sfd2g30js0v0qrv4mfr0000gn/T/opencode/code-format-batch-09-KxLeoNEr`。HEAD同上，main ahead 1；`baseline.json`保存2,553个Git可见文件SHA-256、原状态和四页代码外HTML哈希，`files/`备份236个本批/相关历史证据/共享文件，完整文件系统另封存12,642个受保护文件/符号链接。实际主代理 `ses_e631ee6c9ffeGHVuhezltOLFKK` 经API确认 `openai/gpt-6.1-sol#max`；外层Astra仅路由。第8批四会话已核实succeeded/idle，四新linked child精确模型/max、目录及parent已确认。

第10批基线：`/private/var/folders/5k/y6qh6sfd2g30js0v0qrv4mfr0000gn/T/opencode/code-format-batch-10-nuL9mTi8`。HEAD同上，main ahead 1；`baseline.json`保存2,554个Git可见文件SHA-256、原状态及四页代码外HTML，`files/`备份319个本批/相关历史证据/共享文件，完整文件系统另封存12,637个受保护文件/符号链接。实际主代理`ses_e6143b40fffeK6VlVf4PbkKYrk`经API确认`openai/gpt-6.1-sol#max`；外层Astra仅路由，不实施/复核/写共享记录。第9批四会话已核实succeeded/idle；四新linked child精确模型/max、目录及parent已确认。

第11批基线：`/private/var/folders/5k/y6qh6sfd2g30js0v0qrv4mfr0000gn/T/opencode/code-format-batch-11-h21vqZmH`。HEAD同上，main ahead 1；`baseline.json`保存2,555个Git可见文件SHA-256、原状态与四页代码外HTML哈希，`files/`备份245个本批/相关历史证据/共享文件，完整文件系统另封存12,641个受保护文件/符号链接。实际主代理`ses_e612821f2ffeD918KdlwJYNWmr`因服务超时中断，Sol/max恢复主`ses_e5e79d94effeom6ICsoDKGNAGA`仅恢复原四子、接续证据；原主回归后经明确交接及恢复主idle核对接回唯一维护权，完成最终接收与收口。全部模型/max由API确认，原parent不变，无第二套作者团队、无共享记录并写；见`original-main-return-handoff.md`。

### 0.1 任务锁与交接

| 任务 | 负责人 / 模型 | 独占范围 | 状态 | 下一步 |
|---|---|---|---|---|
| Ch39 样板编写 | format_ch39_writer / `ses_e7ad3c1bcffej3qg3ekO4YxDz8` / gpt-6.1-sol + max | 无活动写锁 | 已交接 | 最终39项测试及3/3同源检查通过 |
| 独立复核 | format_ch39_reviewer / `ses_e7ad0163cffeRwDkEEAKL8NM5R` / gpt-6.1-sol + max | 只读任务已结束 | PASS，已交接 | 最终两版8个class逐字节一致，语义与范围通过，无阻断项 |
| 样板计划与记录 | 主 agent | 无活动维护锁 | 样板已收口 | 最终12个浏览器组合、8张实看画面与范围检查通过；后续见第1批记录 |
| 第1批 Ch01 作者 A / 复核 | `ses_e78a69d3affeJXQLxKwRdYvYRu` / gpt-6.1-sol + max | 无活动写锁或复核任务 | 作者已交接；Ch02最终复核PASS并交接 | 新页面hash精确确认，首轮排版返修项已关闭；本批结束 |
| 第1批 Ch02 作者 B / 复核 | `ses_e78a69d3affdc40ypC3wdxflBG` / gpt-6.1-sol + max | 无写锁或复核任务 | Ch02返修已交接；审Ch03 PASS已交接 | 仅2行拆4行，Java未变；本批结束 |
| 第1批 Ch03 作者 C / 复核 | `ses_e78a69d39ffeKYaJSPvg6RYlBw` / gpt-6.1-sol + max | 无活动写锁或复核任务 | 作者已交接；审Ch04 PASS已交接 | 3文件hash、Lua346token、PythonAST及Redis7/7确认；本批结束 |
| 第1批 Ch04 作者 D / 复核 | `ses_e78a69d3affcH0bFmFIC36eb1M` / gpt-6.1-sol + max | 无写锁或复核任务 | Ch04作者已交接；审Ch01 PASS已交接 | 最终3文件hash、674个非布局token及AST确认；本批结束 |
| 第1批 计划与验收 | `ses_e78a7fa15ffe2gQOc85mHp2Ioo` / gpt-6.1-sol + max | 无活动维护锁 | 已验收并收口 | 最终48个浏览器组合、40张实际read后清理截图、2,534个受保护文件检查通过；下一批Ch05–Ch08 |
| 第2批 Ch05 作者 A / 复核 | `ses_e7857dd63ffesr9t9vUqWxAVX0` / gpt-6.1-sol + max | 无写锁或活动复核 | 作者及审Ch06最终PASS已交接，succeeded/idle | D对Ch05最终5hash PASS；本批结束 |
| 第2批 Ch06 作者 B / 复核 | `ses_e7857dd62ffdSmHhMcdm9P00Gb` / gpt-6.1-sol + max | 无写锁或活动复核 | 作者及审Ch07最终PASS已交接，succeeded/idle | A对Ch06最终5hash PASS；本批结束 |
| 第2批 Ch07 作者 C / 复核 | `ses_e7857dd63ffd8Ydfq6eRGb453K` / gpt-6.1-sol + max | 无写锁或活动复核 | 作者及审Ch08最终PASS已交接，succeeded/idle | B对Ch07最终5hash PASS；本批结束 |
| 第2批 Ch08 作者 D / 复核 | `ses_e7857dd62ffep96i38BlekybnR` / gpt-6.1-sol + max | 无写锁或活动复核 | 作者及审Ch05最终PASS已交接，succeeded/idle | C对Ch08最终10hash PASS（含未改release）；本批结束 |
| 第2批 计划与验收 | `ses_e78591ea9ffe0l1cIGheDf5cR1` / gpt-6.1-sol + max | 无活动维护锁 | 全部验收并收口；25目标hash闭环、48浏览器组合、72张实看后清理截图及范围通过 | 累计9/45，下一批Ch09–Ch12，本次停止 |
| 第3批 Ch09 作者 A / 复核 | `ses_e77fdbe6fffe32wdLkGj7vY4Qg` / gpt-6.1-sol + max | 无写锁或活动复核 | 作者及审Ch10最终PASS均已交接，succeeded/idle | D对Ch09最终6hash PASS；本批结束 |
| 第3批 Ch10 作者 B / 复核 | `ses_e77fdbe6cffeIa6kbJddMGXpmc` / gpt-6.1-sol + max | 无写锁或活动复核 | 作者及审Ch11最终PASS均已交接，succeeded/idle | A对Ch10最终7hash PASS；本批结束 |
| 第3批 Ch11 作者 C / 复核 | `ses_e77fdbe6effdsi8Ogg9uVZhZR0` / gpt-6.1-sol + max | 无写锁或活动复核 | 作者及审Ch12最终PASS均已交接，succeeded/idle | B对Ch11最终8hash PASS；本批结束 |
| 第3批 Ch12 作者 D / 复核 | `ses_e77fdbe6effe6SBstQpqS44eJd` / gpt-6.1-sol + max | 无写锁或活动复核 | 作者及审Ch09最终PASS均已交接，succeeded/idle | C对Ch12最终8hash PASS；本批结束 |
| 第3批 计划与验收 | `ses_e77fee873ffe66XPhI2Ohdz661` / gpt-6.1-sol + max | 无活动维护锁 | 全部验收并收口；29hash闭环、48浏览器组合、54张实看清理截图及2,517保护文件通过 | 累计13/45，下一批Ch13–Ch16，本次停止 |
| 第4批 Ch13 作者 A / 复核 | `ses_e77dbb4b9ffeGBPO4ljs6RUQLj` / gpt-6.1-sol + max | 无写锁或活动复核 | 作者及审Ch14独立PASS均交接，succeeded/idle | D对Ch13最终6hash PASS；本批结束 |
| 第4批 Ch14 作者 B / 复核 | `ses_e77dbb4b9ffc8zWgYH9fZE3YR6` / gpt-6.1-sol + max | 无写锁或活动复核 | 作者及审Ch15独立PASS均交接，succeeded/idle | A对Ch14最终7hash PASS；本批结束 |
| 第4批 Ch15 作者 C / 复核 | `ses_e77dbb4baffe4UqF0RfZcEthMV` / gpt-6.1-sol + max | 无写锁或活动复核 | 作者及审Ch16独立PASS均交接，succeeded/idle | B对Ch15最终8hash PASS；本批结束 |
| 第4批 Ch16 作者 D / 复核 | `ses_e77dbb4b9ffdgr0s1aIanQSISB` / gpt-6.1-sol + max | 无写锁或活动复核 | 作者及审Ch13独立PASS均交接，succeeded/idle | C对Ch16最终9hash PASS；本批结束 |
| 第4批 计划与验收 | `ses_e77dd669dffe16mxIzJDFqhq2Y` / gpt-6.1-sol + max | 无活动维护锁 | 全部验收并收口；30hash闭环、48浏览器组合、48张实看清理截图及2,517保护文件通过 | 累计17/45，下一批Ch17–Ch20，本次停止 |
| 第5批 Ch17 作者 A / 复核 | `ses_e75aaca36ffdC0SWD3nFYmb386` / gpt-6.1-sol + max | 无作者写锁或活动复核 | 作者及审Ch18独立PASS均已交接，succeeded/idle | D对Ch17最终7hash PASS及主代理验收通过；本批结束 |
| 第5批 Ch18 作者 B / 复核 | `ses_e75aaca36ffeuTyMP4urepcKoi` / gpt-6.1-sol + max | 无作者写锁或活动复核 | 作者及审Ch19独立PASS均已交接，succeeded/idle | A对Ch18最终10hash PASS及主代理验收通过；本批结束 |
| 第5批 Ch19 作者 C / 复核 | `ses_e75aaca39ffeX9C65OFwmGYvn4` / gpt-6.1-sol + max | 无作者写锁或活动复核 | 作者及审Ch20独立PASS均已交接，succeeded/idle | B对Ch19最终8hash PASS及主代理验收通过；本批结束 |
| 第5批 Ch20 作者 D / 复核 | `ses_e75aaca34ffecQ3TXpZ3Ef1LfM` / gpt-6.1-sol + max | 无作者写锁或活动复核 | 作者及审Ch17独立PASS均已交接，succeeded/idle | C对Ch20最终10hash PASS及主代理验收通过；本批结束 |
| 第5批 计划与验收 | `ses_e75ad27d6ffenb0CLB36eT9sXK` / gpt-6.1-sol + max | 无活动维护锁 | 已验收并收口；35hash/19原入口/33class/48组合/56实看截图及最终范围封存通过 | 累计21/45，下一批Ch21–Ch24，本次停止 |
| 第6批 Ch21 作者 A / 复核 | `ses_e68b13532ffdi7Gm7On6XsM1aU` / gpt-6.1-sol + max | 无作者写锁或活动复核 | 作者及审Ch22独立PASS均已交接，succeeded/idle | D对Ch21最终12hash PASS及主代理验收通过；本批结束 |
| 第6批 Ch22 作者 B / 复核 | `ses_e68b13532ffewKB1PQxCdOXvaR` / gpt-6.1-sol + max | 无作者写锁或活动复核 | 作者及审Ch23独立PASS均已交接，succeeded/idle | A对Ch22最终9hash PASS及主代理验收通过；run_java.py/sync原样 |
| 第6批 Ch23 作者 C / 复核 | `ses_e68b13531ffe7dhbo7Cug5c1QT` / gpt-6.1-sol + max | 无作者写锁或活动复核 | 作者及审Ch24独立PASS均已交接，succeeded/idle | B对Ch23最终9hash PASS及主代理验收通过；原区域标记保持 |
| 第6批 Ch24 作者 D / 复核 | `ses_e68b13530ffeUVISbf1q6vNxaR` / gpt-6.1-sol + max | 无作者写锁或活动复核 | 作者及审Ch21独立PASS均已交接，succeeded/idle | C对Ch24最终12hash PASS及主代理验收通过；keys.sql原样，旧文案探针失败另列 |
| 第6批 计划与验收 | `ses_e68b56218ffetCzd9eOaMoHUSy` / gpt-6.1-sol + max | 无活动维护锁 | 已验收并收口；42hash/19原入口/16class/48组合/62实看截图/四独立PASS及最终范围封存通过 | 累计25/45，下一批Ch25–Ch28，本次停止；历史探针原失败未计PASS |
| 第7批 Ch25 作者 A / 复核 | `ses_e685d8fa2ffe2ORWved8ftRy6O` / gpt-6.1-sol + max | 无作者写锁或活动复核 | 作者及审Ch26独立PASS均已交接，succeeded/idle | D对Ch25最终9hash PASS及主代理验收通过；本批结束 |
| 第7批 Ch26 作者 B / 复核 | `ses_e685d8f98ffe0fwXmTCy79TAqp` / gpt-6.1-sol + max | 无作者写锁或活动复核 | 作者及审Ch27独立PASS均已交接，succeeded/idle | A对Ch26最终12hash PASS及主代理验收通过；真实RedisLua已执行 |
| 第7批 Ch27 作者 C / 复核 | `ses_e685d8f99ffeTrt8xUbYOl8Fqs` / gpt-6.1-sol + max | 无作者写锁或活动复核 | 作者及审Ch28独立PASS均已交接，succeeded/idle | B对Ch27最终11hash PASS及主代理验收通过；keys.sql原样，可选Redis跳过单列 |
| 第7批 Ch28 作者 D / 复核 | `ses_e685d8f9affeR0nfQKLMiTed8Y` / gpt-6.1-sol + max | 无作者写锁或活动复核 | 作者及审Ch25独立PASS均已交接，succeeded/idle | C对Ch28最终10hash PASS及主代理验收通过；api.txt原样 |
| 第7批 计划与验收 | `ses_e68621b2affeQy0Ke7t06k8vbm` / gpt-6.1-sol + max | 无活动维护锁 | 已验收并收口；42hash/21原入口及探针命令/28class/48组合/64实看清理截图/四独立PASS及最终范围封存通过 | 累计29/45，下一批Ch29–Ch32，本次停止；Ch27可选Redis未计PASS |
| 第8批 Ch29 作者 A / 复核 | `ses_e681740d5ffdfxIb9GwPdkG6BW` / gpt-6.1-sol + max | 无作者写锁或活动复核 | 作者及审Ch30独立PASS均已正式接收，succeeded/idle | D对Ch29最终10hash PASS及主代理验收通过；本批结束 |
| 第8批 Ch30 作者 B / 复核 | `ses_e681740d5ffeJVZl9Gt3s2UL76` / gpt-6.1-sol + max | 无作者写锁或活动复核 | 作者及审Ch31独立PASS均已正式接收，succeeded/idle | A对Ch30最终8hash PASS；原会话超时已恢复，旧事务表述缺口另列 |
| 第8批 Ch31 作者 C / 复核 | `ses_e681740d3ffdP9KwsWgTAT0PBc` / gpt-6.1-sol + max | 无作者写锁或活动复核 | 作者及审Ch32独立PASS均已正式接收，succeeded/idle | B对Ch31最终4hash PASS及主代理验收通过；本批结束 |
| 第8批 Ch32 作者 D / 复核 | `ses_e681740d3ffesje77F5Csr5yHy` / gpt-6.1-sol + max | 无作者写锁或活动复核 | 作者及审Ch29独立PASS均已正式接收，succeeded/idle | C对Ch32最终5hash PASS及主代理验收通过；本批结束 |
| 第8批 计划与验收 | `ses_e681ae856ffec5AeNtFF2lz6K6` / gpt-6.1-sol + max | 无活动维护锁 | 已验收并收口；27hash/21原入口及探针命令/31class/48组合/52实看清理截图/四独立PASS及最终范围封存通过 | 累计33/45，下一批Ch33–Ch36，本次停止；Ch30旧表述缺口另行授权返修 |
| 第9批 Ch33 作者 A / 复核 | `ses_e631c8337ffeJD3p90Xbms7cwu` / gpt-6.1-sol + max | 无作者写锁或活动复核 | 作者及审Ch34最终7hash PASS已接收，succeeded/idle | D对Ch33最终6hash PASS及主验收通过；旧问题另列 |
| 第9批 Ch34 作者 B / 复核 | `ses_e631c8338ffeoFHu0Vn7B5oKLl` / gpt-6.1-sol + max | 无作者写锁或活动复核 | 作者及审Ch35最终4hash PASS已接收，succeeded/idle | A对Ch34最终7hash PASS及主验收通过；英文期限旧限定缺口另列 |
| 第9批 Ch35 作者 C / 复核 | `ses_e631c8337ffdUTJDh8hF0N3NBS` / gpt-6.1-sol + max | 无作者写锁或活动复核 | 作者及审Ch36最终5hash PASS已接收，succeeded/idle | B对Ch35最终4hash PASS及主验收通过；Ch36旧hash包装器失败另列 |
| 第9批 Ch36 作者 D / 复核 | `ses_e631c8334ffeWS2j3lp62hhnoW` / gpt-6.1-sol + max | 无作者写锁或活动复核 | 作者及审Ch33最终6hash PASS已接收，succeeded/idle | Ch33/Ch36主验收通过，旧问题另列 |
| 第9批 计划与验收 | `ses_e631ee6c9ffeGHVuhezltOLFKK` / gpt-6.1-sol + max | 无活动维护锁 | 已验收并收口；22hash/14原入口/1class/48组合/42实看清理截图、四独立PASS及最终范围/会话封存通过 | 累计37/45，下一批Ch37/38/40/41，本次停止；三项旧问题另列 |
| 第10批 Ch37 作者A / 复核 | `ses_e6141c2cfffeTAHggOYKQ3Cphu` / gpt-6.1-sol + max | 无写锁或活动复核 | 作者及审Ch38最终7hash PASS均已接收，succeeded/idle | D对Ch37最终8hash PASS及主验收通过；publication原样 |
| 第10批 Ch38 作者B / 复核 | `ses_e6141c2cbffeJswCaKIYl1xJ0n` / gpt-6.1-sol + max | 无写锁或活动复核 | 作者及审Ch40最终4hash PASS均已接收，succeeded/idle | A对Ch38最终PASS已接收 |
| 第10批 Ch40 作者C / 复核 | `ses_e6141c2cdffe7pnts4QvDnkYes` / gpt-6.1-sol + max | 无写锁或活动复核 | 作者及审Ch41最终9hash PASS均已接收，succeeded/idle | B对Ch40最终4hash PASS及主验收通过 |
| 第10批 Ch41 作者D / 复核 | `ses_e6141c2c9ffe93KKaJxtDedBnN` / gpt-6.1-sol + max | 无写锁或活动复核 | 作者及审Ch37最终8hash PASS均已接收，succeeded/idle | C对Ch41最终9hash PASS及主验收通过 |
| 第10批 计划与验收 | `ses_e6143b40fffeK6VlVf4PbkKYrk` / gpt-6.1-sol + max | 无活动维护锁 | 已验收并收口；28hash/15原入口/19class/48组合/40实看清理截图、四独立PASS及最终范围/会话封存通过 | 累计41/45，下一批Ch42–45；辅助器失败/未运行旧hash包装器如实留证 |
| 第11批 计划与验收 | 原主`ses_e612821f2ffeD918KdlwJYNWmr`；临时恢复主`ses_e5e79d94effeom6ICsoDKGNAGA`已交回 / Sol + max | 无活动维护锁 | 已验收并收口；25hash/16同源/27class/48组合/44实看清理截图及四独立PASS通过，超时恢复如实留证 | **累计45/45，停止，无下一批**；未提交推送部署 |
| 第11批 Ch42 作者A / 复核 | `ses_e61253aa7ffcG672P6mkIF4ETr` / gpt-6.1-sol + max | 无写锁或活动复核 | 作者及审Ch43最终4hash独立PASS已接收，succeeded/idle | D对Ch42最终7hash PASS及主验收通过；本轮结束 |
| 第11批 Ch43 作者B / 复核 | `ses_e61253aa7ffdH2vJ7lbEYi999s` / gpt-6.1-sol + max | 无写锁或活动复核 | 作者及审Ch44最终7hash独立PASS已接收，succeeded/idle | A对Ch43最终4hash PASS及主验收通过；本轮结束 |
| 第11批 Ch44 作者C / 复核 | `ses_e61253aa7ffeCgu6elDST4ipAq` / gpt-6.1-sol + max | 无写锁或活动复核 | 作者及审Ch45最终7hash独立PASS已接收，succeeded/idle | B对Ch44最终7hash PASS及主验收通过；原区域机制保持 |
| 第11批 Ch45 作者D / 复核 | `ses_e61253aa6ffeZzckDIX5sI66iy` / gpt-6.1-sol + max | 无写锁或活动复核 | 作者及审Ch42最终7hash独立PASS已接收，succeeded/idle | C对Ch45最终7hash PASS及主验收通过；本轮结束 |

主 agent 是共享记录的唯一写入者；子 agent 不写计划、入口或共享文件。没有完成交接的旧锁不能直接视作仍在运行：清空上下文后，先核对会话、实际文件和最后交接，再恢复。

### 0.2 每次恢复

1. 读取本节状态、任务锁、§3 逐章表和当前批次记录，检查 `git status` 与实际文件。
2. 先续接编写中、待复核或返修中的章节；已通过的同批章节不重复编写。
3. 若无未完成任务，选最早未验收批次；不要因中文文案已完成而跳过代码整理。
4. 主 agent 在每次派发、作者交接、复核、返修和验收后更新锁与逐章状态，写明文件范围、证据和下一动作。
5. 一批验收后，所有子任务完成交接，保存记录、清锁、写明下一批，然后结束本次任务。由用户或外部会话控制器清空上下文，再发送 §7 的同一提示词。
6. 不声称能靠提示词自行清空上下文；未交接任务、失败检查和阻塞项必须落盘。45/45 后停止，不重新启动已完成批次。

## 1. 范围与行为约束

- 整理 `chapters/chNN.html` 中的展示代码及其实际维护源码；可同步整理本章直接配套的测试代码，保留测试内容、顺序和断言。
- 有维护源码时先改源码，再按本章已有同步机制更新页面；只有内联代码的章节，精确修改对应 `<pre><code>` 内容。先盘点，不能假定所有章节都有 `sync.mjs`。
- 保留函数、变量、常量、接口和文件命名，保留字符串与注释原文、技术含义、条件判断顺序、短路行为、状态更新顺序、锁与事务边界、异常行为及时间采样位置。
- 允许安全添加语句块大括号、拆开同一行的多条语句、统一空格与缩进、换行、按逻辑阶段留空行。涉及作用域或语法歧义时先核对实际语义。
- 本轮不改中英文正文、图注、闪卡、图/SVG、图源、公共 CSS/JS、页面结构与交互，不整页格式化 HTML。源码区域标记、HTML 属性和代码块数量保持。
- 同步/验证工具默认原样使用；若工具错误地依赖旧空白或排版，记录阻塞和最小修复方案，不能删除、放宽断言来取得通过。
- 发现原有技术问题时记录位置与影响，另列后续返修；不能借排版改算法、拆函数、改命名、补功能或改变示例抽象层级。

## 2. 样板与排版标准

样板为 `examples/ch39/LoadBalancing.java`、直接配套的 `LoadBalancingTest.java` 和 `chapters/ch39.html` 的 pick/admit/drain 三段代码。正式验收证据记录在 `docs/reviews/code-format-ch39.md`；后续开始前必须实际阅读样板与记录。

1. **缩进遵循语言惯例。** Java/Python 用 4 空格；SQL、Lua、伪代码沿本章合理层级统一，不能把 Python、YAML 或有语义的字符串空白当作随意可改。
2. **一行一个独立语句。** 展开 `a(); b();`、单行条件体和 `try/finally` 等结构；`for` 头等语法结构不机械拆分。
3. **长表达式分层。** 多个条件、长参数列表、链式调用合理换行；约 100 列为参考，字符串、URL、协议样例和不可拆标记可例外，不为达标改内容。
4. **逻辑阶段之间留空行。** 例如获取状态、检查条件、更新状态、返回结果；同一小步骤不逐行插空行。
5. **让边界清晰可见。** 锁释放、事务提交、异常处理、重试出口等显式展开；不移动其执行位置。
6. **语言分别处理。** Java 的大括号示例不是 SQL/HTTP/伪代码的统一模板；公式、HTTP 载荷、输出和协议文本先确认空白是否有语义。
7. **不追求改动量。** 已清晰的代码可核验后原样保留，逐章说明；不设最少改行数、函数长度或强制重写比例。

## 3. 批次与逐章进度

状态：**待开始 → 编写中 → 待复核 → 返修中 / 已完成**。只有独立复核及相应检查通过后才计入已验收；没有必要改动的章节也要实际检查并留证。

2026-10-29 只读盘点覆盖所有 45 章。下表代码块数取当前 `<pre>`；“有源/总数”表示含 `data-source` 的块数，并不保证路径已核验。每章执行时再核对映射、语言、区域标记与运行命令。

| 批次 | 章节 | 有源/总数 | 状态 | 证据 |
|---|---|---|---|---|
| 样板 | Ch39 | 3/3 | 已完成 | [样板记录](./docs/reviews/code-format-ch39.md) |
| 1 | Ch01 | 0/1 | 已完成 | [第1批记录](./docs/reviews/code-format-batch-01.md) |
| 1 | Ch02 | 1/3 | 已完成 | 同上；独立操作拆行返修已由原A确认关闭 |
| 1 | Ch03 | 1/1 | 已完成 | 同上 |
| 1 | Ch04 | 0/4 | 已完成 | 同上 |
| 2 | Ch05 | 3/3 | 已完成 | [第2批记录](./docs/reviews/code-format-batch-02.md)；D最终独立PASS及主代理验收通过 |
| 2 | Ch06 | 4/4 | 已完成 | 同上；A最终独立PASS及主代理验收通过 |
| 2 | Ch07 | 3/3 | 已完成 | 同上；B最终独立PASS及主代理验收通过 |
| 2 | Ch08 | 7/7 | 已完成 | 同上；C最终独立PASS及主代理验收通过，release.lua核验原样保留 |
| 3 | Ch09 | 4/5 | 已完成 | [第3批记录](./docs/reviews/code-format-batch-03.md)；D最终6hash独立PASS及主代理验收通过，HTTP块原样 |
| 3 | Ch10 | 5/6 | 已完成 | 同上；A最终7hash独立PASS及主代理验收通过，HTTP块原样 |
| 3 | Ch11 | 5/5 | 已完成 | 同上；B最终8hash独立PASS及主代理验收通过，原sync区域标记保护 |
| 3 | Ch12 | 5/5 | 已完成 | 同上；C最终8hash独立PASS及主代理验收通过，既有探针亦通过 |
| 4 | Ch13 | 3/3 | 已完成 | [第4批记录](./docs/reviews/code-format-batch-04.md)；D最终6hash独立PASS及主验收通过，原PAGE标记保护 |
| 4 | Ch14 | 5/5 | 已完成 | 同上；A最终7hash独立PASS及主验收通过，原分号全部保留 |
| 4 | Ch15 | 5/5 | 已完成 | 同上；B最终8hash独立PASS及主验收通过，65＋27＋40既有检查保持 |
| 4 | Ch16 | 5/5 | 已完成 | 同上；C最终9hash独立PASS及主验收通过，原argv/真实隔离Redis67项保持 |
| 5 | Ch17 | 5/5 | 已完成 | [第5批记录](./docs/reviews/code-format-batch-05.md)；D最终7hash独立PASS及主代理验收通过 |
| 5 | Ch18 | 6/6 | 已完成 | 同上；A最终10hash独立PASS及主代理验收通过 |
| 5 | Ch19 | 5/5 | 已完成 | 同上；B最终8hash独立PASS及主代理验收通过 |
| 5 | Ch20 | 6/6 | 已完成 | 同上；C最终10hash独立PASS及主代理验收通过，三份清楚数据/SQL保持 |
| 6 | Ch21 | 7/7 | 已完成 | [第6批记录](./docs/reviews/code-format-batch-06.md)；D最终12hash独立PASS及主代理验收通过 |
| 6 | Ch22 | 4/4 | 已完成 | 同上；A最终9hash独立PASS及主代理验收通过，原run_java.py/sync保持 |
| 6 | Ch23 | 6/6 | 已完成 | 同上；B最终9hash独立PASS及主代理验收通过，原区域标记保持 |
| 6 | Ch24 | 8/8 | 已完成 | 同上；C最终12hash独立PASS及主代理验收通过，keys.sql原样，历史文案探针失败另列 |
| 7 | Ch25 | 6/6 | 已完成 | [第7批记录](./docs/reviews/code-format-batch-07.md)；D最终9hash独立PASS及主代理验收通过 |
| 7 | Ch26 | 6/6 | 已完成 | 同上；A最终12hash独立PASS及主代理验收通过，真实RedisLua已执行 |
| 7 | Ch27 | 7/7 | 已完成 | 同上；B最终11hash独立PASS及主代理验收通过，keys.sql原样，可选Redis跳过单列 |
| 7 | Ch28 | 7/7 | 已完成 | 同上；C最终10hash独立PASS及主代理验收通过，api.txt原样 |
| 8 | Ch29 | 7/7 | 已完成 | [第8批记录](./docs/reviews/code-format-batch-08.md)；D最终10hash独立PASS及主代理验收通过 |
| 8 | Ch30 | 6/6 | 已完成 | 同上；A最终8hash独立PASS及主代理验收通过；原会话恢复已交接，旧事务表述缺口另列 |
| 8 | Ch31 | 3/3 | 已完成 | 同上；B最终4hash独立PASS已正式接收，22命令全0、11class原字节及主代理验收通过；作者辅助器旧失败留证 |
| 8 | Ch32 | 4/4 | 已完成 | 同上；C最终5hash独立PASS已正式接收，12命令全0及主代理验收通过 |
| 9 | Ch33 | 3/3 | 已完成 | [第9批记录](./docs/reviews/code-format-batch-09.md)；D最终6hash独立PASS及主代理验收通过；旧墓碑表述缺口另列 |
| 9 | Ch34 | 4/4 | 已完成 | 同上；A最终7hash独立PASS及主代理验收通过；英文期限旧限定缺口另列 |
| 9 | Ch35 | 4/4 | 已完成 | 同上；B最终4hash独立PASS及主代理验收通过，原105项/既有72项与class原字节保持 |
| 9 | Ch36 | 4/4 | 已完成 | 同上；C最终5hash独立PASS及主代理验收通过；partition原样，历史hash包装器旧失败另列 |
| 10 | Ch37 | 3/3 | 已完成 | [第10批记录](./docs/reviews/code-format-batch-10.md)；D最终8hash独立PASS及主代理验收通过，publication原样 |
| 10 | Ch38 | 4/4 | 已完成 | 同上；A最终7hash独立PASS及主代理验收通过 |
| 10 | Ch40 | 3/3 | 已完成 | 同上；B最终4hash独立PASS及主代理验收通过；辅助器失败留证 |
| 10 | Ch41 | 4/4 | 已完成 | 同上；C最终9hash独立PASS及主代理验收通过；作者辅助器失败留证 |
| 11 | Ch42 | 5/5 | 已完成 | [第11批记录](./docs/reviews/code-format-batch-11.md)；D最终7hash独立PASS及主验收通过 |
| 11 | Ch43 | 3/3 | 已完成 | 同上；A最终4hash独立PASS及主验收通过 |
| 11 | Ch44 | 4/4 | 已完成 | 同上；B最终7hash独立PASS及主验收通过，原两空格标记/摘录机制保持 |
| 11 | Ch45 | 4/4 | 已完成 | 同上；C最终7hash独立PASS及主验收通过 |

总计：Ch39样板＋11批×4章＝45章。**45/45全部验收，剩余0章，所有子任务已交接并清锁；本轮停止，无下一批。** 不重新启动已完成排版或中文润色，不自动提交、推送或部署。

## 4. 1 个主 agent＋4 个子 agent

- 实施与独立复核沿用 **GPT-6.1-Sol（`gpt-6.1-sol`）＋Max（`max`）**。派发前查询实际模型及档位，明确指定；不可用时报告阻塞，不静默替换。后续主会话也按该模型与档位启动。
- 主 agent 负责基线、分工、共享记录、验收汇总和收口；4 个子 agent 各负责本批一章，独占本章列明的源码、配套测试和页面代码块。
- 作者交接后，仍由这 4 个子 agent 轮换只读复核：A 审 B、B 审 C、C 审 D、D 审 A，不自编自审、不在复核中直接改文件。返修由原作者处理，原复核者确认最终文件。
- 按真实并发上限派发；若只能并发 3 个子任务，按 3＋1 分段，不能宣称 4 个同时运行。复用作者会话或释放已完成任务，不额外开启第二套 4 人编写团队。
- 不足 4 章时按实际剩余数量安排，单章须有独立作者和复核者。当前 Ch39 样板仅安排一位作者和一位独立复核者。

## 5. 检查、证据与完成条件

每批先保存执行前 HEAD、状态、本批文件和受保护范围的哈希；保留此前尚未提交的批次与用户改动。先检查已有同步/测试入口，避免无意运行写入式脚本。

每章必须完成：

1. **源码与页面一致。** 执行已有同源检查；内联片段记录精确位置与前后范围。页面去除允许改动的代码内容后，与本批基线逐字节一致。
2. **行为保持。** 独立复核 diff，确认条件、短路、锁/事务、时间采样、更新与异常顺序；按语言使用合适的 AST、token 或编译产物对比辅助。不能只删除空白比较，因为字符串空格和 Python 缩进有语义。
3. **已有验证。** 运行与改动相关的既有编译、测试或契约检查，以及 `node tools/check.mjs`、`node tools/audit-chapter.mjs chNN`、`git diff --check`。不为低风险排版新增镜像测试，不重跑无关章节实验。
4. **页面阅读。** 用真实浏览器看改动代码块，至少桌面与真实 320px 手机视口、两主题；核验 zh/en/both 显示。检查缩进、截断、容器内横向滚动和整页溢出；截图临时保存、实际查看后清理。
5. **范围检查。** 核对源文件、测试、页面代码块及记录之外的文件未变；源文件中的字符串、注释和区域标记保留。已有问题及工具限制如实记载，不以未执行冒充通过。
6. **独立复核。** 作者交接、复核结论及返修关闭必须对应最终文件哈希；未确认最终版本不能标完成。

样板记录为 `docs/reviews/code-format-ch39.md`，后续每批为 `docs/reviews/code-format-batch-NN.md`。记录包括：范围、基线、作者和复核会话/模型、最终哈希、少量前后对照、实际命令与结果、页面证据、遗留事项、下一步。无需为每次排版生成庞大测试档案。

## 6. 收口与发布

逐章更新状态和计数；一批全部完成后，清锁、写明下一批，给用户简短报告并结束本次任务。中途阻塞则记录精确恢复动作，不伪造整批完成。

提交、推送与部署按用户另行明确授权执行。既有仓库为 <https://github.com/socoo123/system_design_web>，Pages 自动构建配置需在发布时核实；不能把推送成功当作上线已验证。

### 2026-11-03 GitHub推送记录

- 用户明确要求将代码push到GitHub；提交`ea4ec7189e47dd9536a442a8faa1ce729449cade`收录已验收的45章排版及计划/验收记录，共324文件，同时推送此前未发布的`fd61a12`。
- `git fetch origin`后确认无远端独有提交；`git diff --check`与`node tools/check.mjs`通过。`git push origin main`成功，`git ls-remote origin refs/heads/main`确认远端为上述排版提交。
- GitHub Pages配置为`legacy`、来源`main:/`，推送会触发自动构建；本次仅确认GitHub推送，未手动部署或将上线状态计为已验收。排版仍45/45完成，全部任务锁释放。

## 7. 清空上下文后重复使用的提示词

每次完成并交接一批后，由用户或外部会话控制器清空上下文/开启新主会话，再发送下面同一段。一次“任务”默认就是一批最多 4 章，不是每改完一个文件就清空。

```text
继续执行全站示例代码排版整理。先读取 AGENTS.md 和 PLAN.md，按 §0 核对实际工作区、逐章进度、任务锁和续接位置，再读 §2–§5 及当前批次记录。先恢复未完成批次；若没有，再从 §3 选择最早尚未验收的一批，最多 4 章。45/45 后直接报告完成并停止。

采用 1 个主 agent＋4 个子 agent，均使用 gpt-6.1-sol + max；模型或档位不可用时报告阻塞。主 agent 维护计划和共享记录，4 个子 agent 各负责一章，按真实并发上限分段派发；作者完成后轮换只读复核，不自编自审。

实际阅读 Ch39 样板及验收记录，按样板整理代码缩进、换行、语句块和逻辑分段。先改维护源码，再同步页面摘录；保留代码行为、命名、字符串、注释、条件顺序、锁与事务边界。遵守 PLAN.md 的范围，不扩大为正文、图或公共页面代码改造。

完成本批相关编译/既有测试、同源检查、结构检查、桌面与手机代码块查看和独立复核。每次交接及时把真实状态写入 PLAN.md；验收后记录最终文件哈希、证据、完成总数和下一批位置，确认全部子任务交接并清锁。

本次只执行这一批，完成后报告并停止，等待我清空上下文再发送同一提示词；不在当前上下文直接启动下一批，不自动提交、推送或部署。遇到阻塞先把恢复位置落盘，不把未通过章节标成完成。
```
