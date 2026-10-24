# Ch35 改前审阅与实施清单

范围：`chapters/ch35.html` 与本章示例、作者证据；不改共享文件、PLAN、其他章，不提交/推送。原页由主代理保存于 `ch35-before.html`。已读 AGENTS、PLAN §0/§4–8，Ch04/Ch09 与 Ch29/Ch32 样板/作者报告。

完整正文已抽取为 `ch35-text-before.txt` 阅读。原 **6组33帧**：D1 5 / D2 5 / D3 6 / D4 6 / D5 5 / D6 6，所有title/desc ID及SVG哈希见 `ch35-animation-before.json`。已实际Chrome渲染33帧的双主题接触表，逐组目视浅色全帧；改前D1入口chat紧贴边界、D3故障数字挤近fit行、D6热回退绕底线接近底部说明。

| 面 | 保留 | 删除重复 / 补充 / 更正 |
|---|---|---|
| 主线 | 请求面/控制面、完整bundle、desired/observed、READY、permit退休、私有池、热回滚 | 合并反复“正常/选择/故障”长解释；先列三决定，假设表折叠，扩展产品细节降级 |
| 事实 | 放置与端点选择分工、不可变版本、salting与设备隔离不同 | 重核10个旧一手链接；vLLM固定版本调参，安全页另按本次可见文档；CUDA确认仅captured work完成；不能把vLLM调参来源当取消协议证明 |
| 容量 | 20/s、8s、32槽、9副本3/3/3、12/20卡的教学例 | goodput不是接纳上限，定义C=4为未实测的联合SLO约束下接纳容量假设；9副本故障只剩19.2/s正常80%预算，额外给同预算11副本4/4/3；占用均值不保证尾部 |
| 资源 | 卡组整体ready与租户公平 | 分清权重/引擎临时内存/KV；多维槽+KV信用、异构profile、单卡/整组/机器故障损失；训练优化器/激活/checkpoint不纳入在线预算 |
| 准入 | 唯一rid→permit，HELD/RUNNING/RETIRING/RELEASED，TTL不释放UNKNOWN | 加实际SQLite单事务租户+replica多维预占；显式DISPATCHING、只有首次CAS赢家可发/启动，丢ACK保守失败；控制器故障与Ledger不可达分开 |
| 发布 | 不可变bundle、更高路由revision回旧内容、旧请求版本固定 | 加实际SQLite发布CAS+幂等+快照/审计同事务；兼容API/checkpoint schema；expand/contract迁移不在旧热窗内破坏旧reader |
| 动画 | 全部组、帧序和原ID | D1边界留白；D3故障数字行间距与失效副本标识；D4加多维/dispatch门标签；D6直连热回退避开底部说明，并同步C术语。其余正确构图保留 |
| 代码与复盘 | 双语与统一cards-grid | 新增同源Java17容量计算、SQLite准入/consume/发布摘录；执行最后额度争抢、丢回包、取消/过期竞争、回滚/drain等直接反例；保留失败轨迹，不造静态镜像测试 |

未承诺真实GPU/CUDA、生产故障演练、实际Kubernetes/serving集成或压测；DB实际行为与协议手推分开记录。
