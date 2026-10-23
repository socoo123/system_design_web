# Ch18 · 订单事务与资金责任

页面的六段明确标识伪代码来自本目录：checkout、holds、attempt、capture、delivery、scan。`node examples/ch18/sync.mjs --check`逐字检查页面同源；不把伪代码冒充可运行Java或生产服务。全部注释为英文，三语言共用一份程序。

```sh
node examples/ch18/sync.mjs --check
python3 examples/ch18/check.py
```

`schema.sql`与`model.py`为Python3标准库SQLite契约模型；测试执行真实SQLite事务、唯一约束、条件UPDATE、并发线程及故障注入。`BEGIN IMMEDIATE`串行化整个DB写者，粒度比正文PG18订单/预留/有序库存行锁粗；它不证明PostgreSQL行锁、复制持久性或分布式支付保证。测试用本章临时独立DB，不改站点数据，报告写到`docs/reviews/ch18-code-results.json`。

输入身份包含认证owner、非空request_key、不可变报价、币种、地址版本与排序SKU数量。原始成功创建回执单独保存，后续paid不改变重放内容。新单失败整笔回滚，拒绝身份不永久保存。多SKU固定锁序；所有终结路径先锁订单，再按SKU锁本单预留和库存。`finish_holds_locked`处在调用者同一事务内，核对明细完整性；状态、计数、归属、outbox任一步异常都会回滚。正常关单冲突选择退款分支，不当异常吞收款。

尝试先保存PREPARED和不可变外调参数，PSP调用在事务外。UNKNOWN/PREPARED/处理中/OBSERVED_REVIEW均阻止新尝试；只有渠道明确且不可再收款的NO_CAPTURE终态才可开下一笔。超时不覆盖已成功证据，截止时间不是渠道失败证据。首次对象未知时，原键重试受渠道保留窗约束，超过后保留UNKNOWN并对账。本地尝试和退款身份不会随24小时窗口删除。

真实适配层必须用官方SDK对原始字节/签名/时间戳验真，检查账户、环境和类型，并用配置账户凭据查询确切渠道对象。服务端设置且客户不能改的attempt标记、用户归属、金额、币种均与本地预期匹配，才允许在订单锁下将空provider_binding只绑定一次。模型的`signature_valid`布尔和生成的`object:<id>`只是明确的契约输入，绝不是实际签名或Stripe API验证。实际渠道若不能提供这些绑定条件，需要额外的受控对象分配/恢复协议，不能直接套用此适配层。

未知attempt/字段不符产生完整Capture、ReviewTask和outbox；OBSERVED_REVIEW只表示待核对资金，不授权履约。每笔真实capture独立处理，第二笔或关闭后收款各自留RefundDue；同capture多个event复用已经同提交的责任。immutable冲突保留完整PaymentInbox READY并告警，人工处理不能假装DONE。入站完整inbox先提交再2xx，worker在capture提交与inbox DONE之间崩溃可安全重放。示例不清理请求、attempt、capture、refund/inbox去重历史；生产保留策略须覆盖允许重放的期限。

Outbox发送后才sent，ACK未知复发同event；FulfillmentDB独立提交inbox+唯一Job后ACK。保证是一个持久任务，不是外部仓库/退款exactly-once。实际外部动作仍需稳定shipment/refund操作ID、未知查询、持久重试和最终证据。本例没有执行退款、发货、生产压测、真实PSP/Webhook或PostgreSQL实验。

扫描固定cutoff连续分页；失败不改pending/expire_at，下一轮从最老到期重启。同一订单锁重新判定付款竞态。全层100尝试/s和净70有效完成/s是教学容量目标，模型没有实现分布式全局限速或证明恢复SLO。
