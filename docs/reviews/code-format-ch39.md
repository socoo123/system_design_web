# Ch39 示例代码排版样板

日期：2026-10-29。当前状态：**已验收；作者、独立复核与主代理验收均已交接，活动锁清空**。

## 范围与基线

用户先要求抽查、不修改，看到 Ch39 `tryAdmit` 的排版示意后，明确授权先完成 Ch39，并准备供“1 个主 agent＋4 个子 agent”在清空上下文后分批执行的提示词。本次只实施 Ch39。

- 实施文件：`examples/ch39/LoadBalancing.java`、`examples/ch39/LoadBalancingTest.java`；通过已有同步脚本更新 `chapters/ch39.html` 的三个代码块。
- 排版方向：4 空格缩进，展开单行语句块与多个语句，长条件及参数分行，按逻辑阶段分段。
- 基线目录：`/private/var/folders/5k/y6qh6sfd2g30js0v0qrv4mfr0000gn/T/opencode/code-format-ch39-5tvy1tej`。
- 执行前工作区干净，HEAD 为 `fd61a122399c786edc8b169e8f62d5c8ec829de4`；`baseline.json` 保存 HEAD、状态及 2,543 个已有文件哈希，并备份本章页面、源码、测试、README、同步脚本、旧计划与入口。
- 已完成的中文文案计划原样归档为 `PLAN.archive-2026-10-29.md`，SHA-256：`aea787cc1c7f0706e4d9a4bcb42987b2e3d7142272e4c81c7b681befb9233003`，已与原计划逐字节核对。

## 作者与独立复核

| 角色 | 会话 | 模型 / 档位 | 状态 |
|---|---|---|---|
| 作者 format_ch39_writer | `ses_e7ad3c1bcffej3qg3ekO4YxDz8` | `openai/gpt-6.1-sol#max` | 最终交接完成，写锁释放 |
| 独立只读复核 | `ses_e7ad0163cffeRwDkEEAKL8NM5R` | `openai/gpt-6.1-sol#max` | 续接流程与最终源码均 PASS，已交接 |

模型和 `max` 档位已通过实际模型列表确认。主会话负责调度、记录和验收汇总；源码实施与独立复核分别交给上表指定模型的不同会话。

## 实际变化与前后对照

作者已完成两个 Java 文件的排版并同步页面。主代理发现 `tryAdmit` 初稿把一个含四项 `||` 的条件改写为四个独立 `if`；为精确符合用户已看过的样板并保留表达式结构，已退回原作者仅合并为单个 `if`、逐条件换行。该项不以“运行结果相同”代替范围约束。

初稿编译与39项既有测试、同源/结构检查通过；初稿12个浏览器组合也通过，但返修后文件已改变，未沿用中间版浏览器结果，最终版本已重新检查，见后文。

原作者随后已恢复单个 `if`，重新同步页面、编译并通过39项测试、同源和章节结构检查。最终 `tryAdmit` 保留原四项条件和执行顺序：

```java
if (expectedIncarnation != incarnation
        || phase != Phase.READY
        || now - deadline >= 0
        || active.size() >= limit) {
    return null;
}

long id = Math.incrementExact(sequence);
sequence = id;
active.add(id);
```

原 `sequence = id; active.add(id);` 已拆成独立语句行，原 `finally { lock.unlock(); }` 展开为可见的释放锁语句块；长条件、链式调用和测试参数合理换行。函数、变量、合并字段声明及所有注释和字符串原文保留。

| 页面代码块 | 行数（前 → 后） | 最长行（前 → 后） |
|---|---:|---:|
| choose / pick | 13 → 22 | 81 → 73 |
| admit | 18 → 33 | 80 → 80 |
| drain | 31 → 56 | 101 → 89 |

## 验证与最终文件

### 作者实际检查

JDK：`/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin/`；编译产物位于仓库外的临时目录。

- `javac -d <临时classes目录> examples/ch39/LoadBalancing.java examples/ch39/LoadBalancingTest.java`：通过。
- `java -cp <临时classes目录> LoadBalancingTest`：最终版本 **PASS 39 targeted checks**。
- `node examples/ch39/sync.mjs` 后执行 `node examples/ch39/sync.mjs --check`：3/3 摘录一致。
- `node tools/audit-chapter.mjs ch39`：通过。
- `node tools/check.mjs`：初稿及最终版本均通过；最终45章、276组图、1,411帧、206个代码块结构检查通过。
- `git diff --check`：作者最终交接通过。

### 最终页面检查

使用本机真实 **Chrome/156.0.8078.48**，通过 CDP 设置真实 viewport，在本地只读 HTTP 服务上加载最终页面：

- 1440×1000、320×900 × parchment/dracula × zh/en/both，共 **12 个最终版本组合**通过。
- 每组3个代码块；语言显示正确，代码保留缩进，桌面三个代码块无需横向滚动。
- 320px 下整页宽度为320，代码各自容器可横向滚动至315/366/431px，行尾可访问，并显示“左右滑动查看完整代码”提示。
- 运行时异常0；浏览器检查前后重新核对三文件哈希相同。
- 主代理实际查看8张最终截图：桌面/320px 各看 parchment 的 pick、admit、drain，以及 dracula 的 admit；缩进、分段和语句块边界清楚。其他主题/语言组合由浏览器布局及滚动断言覆盖。
- 原始 `browser.json` 和临时验证脚本位于基线目录；中间版结果不作为最终验收证据。

已查看截图 SHA-256（8张临时图片已在实际查看后清理，证据及哈希保留）：

| 截图 | SHA-256 |
|---|---|
| code-1440-parchment-1.png | `f7ec8e372c63b5df3cc84a581c551a17b61a1e751f85e5d7cca5a0458c2c307a` |
| code-1440-parchment-2.png | `1294928519897276bd486114d9131e3c7d191adc44af55fa05c6e1b0433919ba` |
| code-1440-parchment-3.png | `076a6acf535c413f7dbe0a813b712aaca6906548fda0ef77776bb71d4344558e` |
| code-1440-dracula-2.png | `c9e49e3bff318f3fe7bb10a7581aac429e98df7111d4394102a45f82e63e2870` |
| code-320-parchment-1.png | `bc258f7a35ec8b108fe8cdb91dfde65272c1637cd3f743d79198d73002a1fc47` |
| code-320-parchment-2.png | `f7a803981306a7dea3058c1c50d32b9f852f159736f52654919d953336ad8748` |
| code-320-parchment-3.png | `296609c528222f993ec5634cf411ef40186245c77f2b9db7615287cfb25e7a08` |
| code-320-dracula-2.png | `523ed442c6dbf6743a55d701174cb40e7c8c7ac74848bdcccf3eaa14165b6d5f` |

### 最终文件哈希

| 文件 | SHA-256 |
|---|---|
| `examples/ch39/LoadBalancing.java` | `9c0c8533e698ac1a1befe1f8dcad4e49c20b4d6cf08c3cad51ceeaa44f11dd4e` |
| `examples/ch39/LoadBalancingTest.java` | `dc51ab6fa4dcadc1350e1310a3e52234f68072b44d6e9b262d078c673b174ab1` |
| `chapters/ch39.html` | `ebb073942a4f980ea957956e938747c154fdc7fe829c46e17bbb1babdda08d72` |

### 独立复核与范围

独立复核者已对上述最终哈希签发 **PASS，无阻断项，无需源码修正**：

- 通读两版Java和三份完整diff，确认准入条件退回项关闭。`choose` 的随机抽样次数/顺序、`finish` 的短路及集合删除、排空的代次/版本判断和时钟读取均保留。
- 注释与字面量感知的 token 对比通过：实现仅新增14对安全语句块括号，测试新增7对；其他token完全一致。
- 使用同一 Java 17.0.10 编译器，以 `javac -g:none -encoding UTF-8 -d <独立临时目录>` 分别编译基线与最终两个Java文件，全部 **8个 `.class` 原始字节一致**。排除调试行号差异后，编译产物没有变化。
- 两版分别运行 `LoadBalancingTest`，各39项通过，完整标准输出一致。
- 独立同源、全站结构、章节结构及 `git diff --check` 通过；仅遮罩三个代码内容后的完整HTML逐字节一致。
- 复核前、运行检查后及原始class对比后，三文件哈希均与最终作者交接精确匹配；与最终浏览器证据也精确匹配。

独立检查完整命令、输出及报告位于基线目录下 `reviewer-independent-7peggph1/`，关键文件为 `manual-review.md`、`report.json`、`byte-compare.json`；主代理实际阅读并合并了最终源码复核与页面证据。

最终范围检查：仅5个既有文件改变（两个Java、Ch39页面、AGENTS、PLAN），新增原计划归档和本记录；其余 **2,538个既有文件逐字节保持基线**，包括其他44章、共享代码、全部图源以及本章 README 和同步脚本。归档计划与原计划逐字节一致。未新增仓库内编译产物或截图。

## 后续恢复

`PLAN.md` 已更新为 **1/45，Ch39已完成**；下一任务为 **第1批 Ch01–Ch04**，本次未开始其他章节。后续共11批、每批最多4章，由四位作者轮换交叉复核；每批交接记录后停止，由用户或外部控制器清空上下文，再使用 `PLAN.md` §7 的同一提示词。全部子任务已交接，无活动任务锁。

本次未提交、推送或部署；发布另按用户明确授权执行。
