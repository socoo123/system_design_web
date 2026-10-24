# Ch27 独立来源抽核

2026-10-24，复核者直接通过 web 打开官方文档；以下结论另与正文/代码对照，未把作者来源记录当独立核验。

| 来源 | 独立核验结论 |
|---|---|
| [PostgreSQL 18 Explicit Locking](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS) | 冲突行锁等待事务结束；一致的多对象锁顺序可减少死锁，发生中止需重试整笔。支持订单→容量共同写路径；不证明本地SQLite等同生产PG。 |
| [PostgreSQL 18 Current Date/Time](https://www.postgresql.org/docs/18/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT) | now()/CURRENT_TIMESTAMP取事务开始；clock_timestamp取调用时刻。锁后时间检查是正确适配要求，不是单调时钟或跨主切换保证。 |
| [Redis GEOSEARCH](https://redis.io/docs/latest/commands/geosearch/) | 在半径/方框内召回成员，可设COUNT；结果没有骑手资格、容量或会话有效性语义。本地真实Redis探针也召回了无详情成员。 |
| [Redis EXPIRE](https://redis.io/docs/latest/commands/expire/) | 到期对象是key。不同详情/GEO键不联动是据此作出的推断，并由独立Redis 7.2.5实验实际确认；给整个GEO键到期则删除全部成员。 |
| [Google Routes Get a route matrix](https://developers.google.com/maps/documentation/routes/compute_route_matrix#grpc_stream_results) | 元素数=起点×终点；错误可在整请求或元素层。gRPC结果流不保证顺序，按origin/destination索引归位；REST不支持这种流式结果。正文已明确区分，没有将463元素/s说成HTTP调用数。 |
| [WHATWG Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html#the-last-event-id-header) | EventSource重建连接时携非空Last-Event-ID。应用持久历史、订单授权/重绑和控制事件恢复须由应用实现；协议本身不提供业务去重或履约持久化。 |

协议/数据库语义与教学选择区分：两槽容量、20秒offer、120秒匹配、±5秒相对时钟界、30秒候选窗口和60秒清理TTL都是本章前提；没有来源证明它们适用于生产。26项容量/单位独立复算见`ch27-independent-numeric-results.json`。
