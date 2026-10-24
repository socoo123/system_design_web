# Ch38 实施前盘点

2026-10-24。GPT-6.1-Sol + Max；限定本章、examples/ch38和ch38专属证据，不修改共享文件和PLAN。
完整阅读原935行页面、PLAN §0/4–8、Ch34/Ch36样板与上一批验收；原HTML见批次baseline/ch38.html。

## 保留

- 原7组38帧：D1读路径5、D2 HTTP6、D3持久失效6、D4旧回填5、D5缺席5、D6 jitter5、D7故障/恢复6。
- 原76个title/desc ID、帧序、request/reply/async/failure语义和逐跳回程；逐帧清单、标题与SVG SHA256见ch38-animation-baseline.json。
- cards-grid原12张双语闪卡、主题/语言/目录/复制/播放/进度公共机制。
- 公开目录卡贯穿，图片哈希URL与交易权威分开；保留必要A1–A12条件与计算。

## 删重与提炼

- 开篇长假设表转为可展开计算前提，默认先呈现三项决定和正常路径。
- 正常读、失效、故障重复陈述归位；删论文实测峰值与Token默认频率等对本例决策无帮助的数字，不以字数下限补文。
- 关键失败边界默认展开；长算术与替代方案按需折叠，不能把全部有效内容隐藏。

## 补实现

1. 固定权威observed_at/hard_expires，不以L1拷贝/HTTP重新包装/软刷新失败续命；Java17年龄计算与测试。
2. 同key进程内singleflight，独立等待deadline不取消公共任务；明确多进程仍各有leader，运行并发反例。
3. 缓存服务写端在同一SQLite文件事务内领取lease、失效抬floor/撤销、guarded fill：跨进程真实竞争测试，元数据丢失/epoch切换失败关闭；这是教学存储适配器，不是Redis集群实现。
4. HTTP策略伪代码：查共享缓存前的授权分流、Vary/ETag表示、304新证明、剩余shared max-age、no-store错误。契约与例子同源。

## 纠错/核验重点

- 原singleflight“leader总截止时间到则终止”需限定：等待超时不证明Store已停止，不能据此提前释放真实并发名额。
- 原s-maxage公式只扣2秒时钟余量，需明确最终发送≤1秒预算是否另扣，及n=0时必须重读或失败，不能304无限续证明。
- floor/epoch/token原子边界写实，元数据丢失不允许旧token复活；数据version不能由旧读者随便伪装为新代次。
- purge接受不是所有POP完成；浏览器缓存不被CDN purge撤回；已发送旧响应仍由统一年龄边界约束。
- Authorization允许共享缓存的RFC例外与本章更严格的pass政策区分；Vary不是鉴权；ETag必须覆盖确切表示，GET的If-None-Match用弱比较/列表解析，不能字符串等号伪装完整HTTP实现。
- Store圆柱title/subtitle bbox候选需目视判定；改动组全帧两主题留前后证据，不以自动几何代替视觉。

## 待完成验证

一手标准/官方来源核对；Java17/SQLite正常、失败、真实并发；同源逐字；check/audit/diff；真实320/390/768/1440×两主题×三语言；全部动画翻帧/播放，复制、闪卡、进度和图横滚；本章最终源码哈希与未做事项。
