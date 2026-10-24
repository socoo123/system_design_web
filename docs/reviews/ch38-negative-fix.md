# Ch38 负缓存容量口径返修

2026-10-24。Ch37独立复核发现P1；仅返修本章和例子证据，保留全部安全守卫。

- 原20/s来自100/5，没有扣实现中固定2s安全余量。当前claim只在hard>now+2s时命中，硬5s对应不足3s的L2复用；100key持续重复、瞬时查询/填充且无淘汰时约100/3=33.3/s。
- App canSend再扣1s，从同一证明起点只有不足2s可成功发送。HTTP策略不安全时503、不自动重读，端到端频率还由刷新/条件验证/共享命中改变；33.3不是端到端或峰值上界。
- 已同步A9、中英正文、D5s3–s5标注和发送限定、README、数字runner，新增第15张cards-grid卡。AgeBudget仅新增2条断言，cache.py/原子伪代码/HTTP策略/SingleFlight/sync的安全实现未变。
- 作者新增实际30,000次SQLite claim：100key×20请求/s×15s，0/3/6/9/12s各100fill，共500/15=100/3。最终84项（含26复算）、Java16+38项、4同源与12命令全部通过。
- D5全部5帧两主题已实际重新打开；修前后76幅PNG有70幅逐字节相同，变化6幅仅D5s3–s5。新卡320双语两主题实际看过，24布局/912帧定位/4实际复制/15卡与新卡翻面通过，0页面/资源错误。

旧作者材料与PNG保存在`ch38-pre-negative-fix-*`和screenshots/ch38-author/pre-negative-fix-*；独立初始finding不改。9份源码前后变化见[ch38-negative-fix-source-transition.json](ch38-negative-fix-source-transition.json)，最终页SHA256为`a90ba925d7960aa004fd786d6f38a0ae58c398798e770103d89b9457220c1659`。

Ch37已用37key/24s与11key/18s两份新输入合计7,896次真实claim，分别296/66fill，独立确认N/3与文/图/卡一致；完整签署以[ch38-independent-review.md](ch38-independent-review.md)为准。本文不替代独立浏览器与最后签署。

后续主代理整合发现SingleFlight.main取消夹具可能被极速loader抢先完成；仅测试改为受控Executor保证先取消再执行，当前Java为16+41项，join展示区与A90页面不变。完整变化见[ch38-cancel-fixture-source-transition.json](ch38-cancel-fixture-source-transition.json)。
