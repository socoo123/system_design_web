# Ch30 implementation preflight · 2026-10-24

GPT-6.1-Sol + Max；本章唯一作者；不派子代理、不写共享文件、不提交发布。已完整读AGENTS、PLAN §0/4–8、Ch30全部正文/32份SVG/引用/数字，参考Ch03图比例、Ch04/09/25–27组织与上批报告。原基线为主代理ch28-ch29-ch30-baseline/ch30.html。

- 保留：6组32帧、全部SVG title/desc ID与帧序，在线/摄取闭环、父子块、RRF、引用门与双池迁移的教学主线；原教学假设全部复算。
- 删重：开场长说明、需求表先行与后文反复复述的稳定键/拒答/权限前提；容量细表和延伸推演折叠，结论、路径和关键代码默认展开。
- 技术纠正：current按(pool,doc)维护而非跨模型单指针；写入/搜索可见/发布不同；不可变外部键包含pool与splitter；接收任务同事务、租约代次只fence发布；索引分路去重后RRF，过滤保留原rank；父块整跨度ACL；token预算含证据包装和完整prompt重计；撤销任何已入prompt材料均作废整份draft，不能只检查被引用ID；权限超时fail closed；普通缓存不得绕过authority，答案缓存默认关闭；bundle回滚须回放删除并保留旧编码器。
- 代码落点：query.pseudo(可信身份/完整bundle/缓存)；ingest.pseudo(接收/claim/manifest/CAS)；RagCore.java两段摘录(RRF/预算装包，Java17标准库可运行)；release.pseudo(机械身份/支持判定边界/整包授权)；migration.pseudo(快照/回放/切换/回滚)。均同源examples/ch30。
- 验证：实际SQLite authority模型，只验证本地事务/条件及确定性race；Java17正常+危险反例；不声称真实PG/ES/ANN/LLM已验证；外部事实重新web查一手来源。
- 动图：先逐帧双主题渲染/目视定位，再局部修正；D5绿色箭头源码已返回RAG底边，Gateway省略会在图注说明，不做无依据重画。页面两主题三语言、320/390/768/1440真实viewport，代码复制/翻帧/闪卡/进度另验。
