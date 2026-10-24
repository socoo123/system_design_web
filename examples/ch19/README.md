# Ch19 · 可运行示例与教学契约

`Nearby.java` / `NearbyTest.java` 无第三方依赖，Java 17。页面共享两个源码节选：球面保守覆盖与权威候选筛选。三个 `.pseudo` 文件是教学协议，不冒充Java或生产服务。

```sh
python3 examples/ch19/sync.py --check
PYTHONDONTWRITEBYTECODE=1 python3 examples/ch19/verify.py
```

运行器使用`JAVA_HOME_19`指定JDK；默认本机`/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home`，不可用时用PATH。编译产物进入临时目录并删除；输出写到`docs/reviews/ch19-code-results.json`。

- `cover(point,radius,precision,maxCells)`：允许半径500/1000/2000/5000米、精度1–6。输出经纬网格，`geohash`辅助函数按经度优先交错为标准base32键。以自选球半径6,371,008.8m为共同距离模型，闭区间保守覆盖边界，拆反经线，触极点覆盖所有经度。超工作预算抛`Unavailable`，不返回截断覆盖。生产可换可靠地理库，但必须重新核对距离模型与覆盖责任。
- `rank(...)`：输入完整候选、当前权威读取快照、鉴权viewer、sendBy、设备时钟误差上界。权威Map必须为所有候选区分已确认空行和失败/缺失；缺键或落后于索引版本时抛错。候选原坐标不作为提前丢id的理由。输出排序使用球面实际距离/id，最后才对移动端桶化并隐藏坐标；调用方发送逾期必须重验。权威适配器须读新鲜的授权与状态，不用滞后副本；权限是该读取快照的决定，未承诺已发副本可撤回。
- 距离排序只对已召回且完整读取的候选集合精确；异步索引尚未召回的进圈实体无法由回表恢复。严格当前完整近邻请用同步数据库索引同一快照，或实现完整可见屏障，不能从本地Java推导分布式保证。
- `report.pseudo`：实体、设备序号、接受额度、完整意图回执、outbox同实体分片事务；属主认证在回执重放前，回执在新鲜度/额度前。相同request_id不同intent拒绝；未知提交同键重试。
- `project.pseudo`：一格的成员/墓碑/revision由本格数据库事务和guard串行化；跨格add/remove不原子，中间失败靠同版本重放。equal-version不同payload视为损坏。事件保留更新前后坐标供每代路由计算；无孩子位置的父格墓碑复制到四个孩子，不能丢掉。只有全部副作用完成才连续推进offset。墓碑GC要求持久重放栅栏，本例不实现GC。
- `migrate.pseudo`：两个投影屏障、完整父格快照、版本复制与增量、每来源分区连续offset向量、目录CAS、宽限期双投影、旧路由和在途读者AND条件。日志保留覆盖迁移；所有可能移动入/出的分区都参与。epoch验证由存储适配器提供，单次目录CAS不提供跨key事务。

`model.py`在真实SQLite中验证同事务报告与每格投影。SQLite `BEGIN IMMEDIATE`锁粒度更粗，不能当PostgreSQL行锁或分布式数据库证明。`Migration`是协议状态探针，不是消息队列/跨机执行器。未启动PostgreSQL/PostGIS、Redis集群、真实CDC/队列、真实时钟同步、授权服务或负载测试。
