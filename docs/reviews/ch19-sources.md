# Ch19 · 本轮一手来源核验

2026-10-23实际经浏览工具取回。引用仅支持表中具体产品/规范行为；场景容量、球面选择、版本投影与迁移协议是本章教学设计。没有引用厂商吞吐或宣称生产压测。

| 页面引用 | 实际核对来源与位置 | 支持的具体说法 / 限制 |
|---|---|---|
| [1] | [Redis GEOADD](https://redis.io/docs/latest/commands/geoadd/), coordinate limits / How it works / What Earth model | 经度±180、纬度±85.05112878；GEO为sorted set，编码交错为52-bit；内部按覆盖范围查询，不能拿它证明固定六位geohash九格；Haversine球面模型最坏约0.5%误差。该百分比不是本章Java半径常量或GPS精度的证明。 |
| [2] | [Redis GEOSEARCH](https://redis.io/docs/latest/commands/geosearch/), Optional arguments | ASC按距离；COUNT ANY够数即停，不能保证最近集合。后置业务过滤仍可能导致COUNT20不足20条；这一步是本章推论。 |
| [3] | [PostGIS ST_DWithin](https://postgis.net/docs/ST_DWithin.html), Synopsis / Description | geography输入距离用米、默认use_spheroid=true；函数含可利用空间索引的bounding-box比较。本轮未启动PostGIS或测查询计划。 |
| [4] | [H3 4.x cell statistics](https://h3geo.org/docs/core-library/restable/), Cell counts / Cell areas | 每分辨率12个五边形；同层面积依位置变化，不能当全球精确等距平面六边形。 |
| [5] | [H3 4.x grid traversal](https://h3geo.org/docs/api/traversal/), gridDistance / gridDisk | k为相邻格最少跳数，gridDisk输出无序；跨五边形行为需遵循具体函数契约，k不是公里。 |
| [6] | [Debezium 3.7 Outbox Event Router](https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html), Basic outbox table | id为唯一事件标识，可供去重；aggregateid作为事件key，有助于Kafka分区顺序。文档不自动实现本章relay顺序、消费者原子投影或完整业务幂等。 |
| [7] | [Redis EXPIRE](https://redis.io/docs/latest/commands/expire/), command description | 过期对象是key，不是GEO每成员独立位置年龄。本章绝对not_after、时钟余量和成员年龄判断是服务契约。 |
| [8] | [W3C Geolocation CR snapshot 2026-03-26 §3.2](https://www.w3.org/TR/2026/CR-geolocation-20260326/#privacy-for-recipients-of-location-information) | 按目的使用、保留、保护访问、用户更新/删除是非规范性隐私建议；原文§3.2明确non-normative。距离环交叉推断和100m桶不匿名为本章分析，不是规范声称或法律结论。 |

几何选择：Java的R=6,371,008.8m是显式教学球面参数，不复用Redis私有实现常数。覆盖与最终测距使用同一球面模型；A6的111km/度、40°N和20/48/216格仅为局部平面示意。不能把它们宣称为椭球边界或极区全局预算。数值独立复算见`ch19-code-results.json`。
