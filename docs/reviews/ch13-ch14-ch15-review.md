# Ch13 / Ch14 / Ch15 本批整合验收

2026-10-23，用户授权“重构下一波 用3个agent”。本批按 PLAN §7 处理 Ch13 搜索系统、Ch14 视频系统、Ch15 网盘。三位子 agent 的派发均明确设置 `model: "gpt-6.1-sol"`、`reasoning_effort: "max"`；先各实施一章，再交叉只读独立复核，主代理负责共享文件和最终验收。

**2026-10-23已完成实施、交叉独立复核与主代理验收；本次范围内2项P1与5项P2全部关闭，无未关闭P0/P1或阻碍阅读P2。** 未提交、推送或部署。

## 范围与授权前基线

[授权前基线](ch13-ch14-ch15-baseline.json)保存 6,724 个既有文件的工作区 SHA256、未提交状态和三章动画清单；[三章原始 HTML](ch13-ch14-ch15-baseline/)用于逐帧对比。每章原6组30帧，共18组90帧；原三章均无代码块。此前章节、共享UI、工具和既有未提交成果均属于须保留的授权前状态。

写入范围限 PLAN、三章页面、对应 examples/diagrams/assets/diagrams 专属资源与本批审查证据；其他42章、公共 CSS/JS、首页和工具不在实施范围。[范围检查脚本](ch13-ch14-ch15-scope.mjs)使用本批工作区基线，不以 HEAD 抹掉既有工作。

## 主代理独立预审

[独立算术复核](ch13-ch14-ch15-numeric-review.json)从原章的教学输入计算，未把假设当成生产测量：

- 搜索：正常回源4K/s，每片三份各约1,333/s，损失一份后各2K/s；命中降为40%时故障后各3K/s。四片独立各99%按时到达时，全部到达概率为96.059601%。深offset候选40,080个、1,282,560字节，`search_after`候选80个、2,560字节；这只比较候选数量，不宣称跳过索引扫描。200/s积压十分钟为120,000条，恢复处理600/s且持续入200/s，理想追赶300秒。
- 视频：源150TB/day、上传峰值69.44Gb/s；25M次完整观看产生7.5PB/day，峰值约3.472Tb/s。95%有效字节命中仍给源站173.61Gb/s，高于100Gb/s假设；至少97.12%才满足该算术预算。三档共510MB/title，每日255TB，源及产物365天逻辑量147.825PB；70%预算需要4,961个教学worker。AV1每次合格观看省$0.00075，$6增量成本需8,000次同周期合格观看。
- 网盘：文件保存峰值约1,157/s；1PB/day入站峰值462.96Gb/s。每文件取整给块PUT峰值严格上界约14,954.78/s，预算约15K。64个4MiB块在20Mb/s理想下限107.374s，整GiB为429.497s；在线5s同步目标不能覆盖整GiB。配额500PB是逻辑上限，30天新增字节90PB（三份模型）不是全站存量。

主代理独立抽核的一手来源及对应边界：

- [Elastic分页文档](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results)：固定query/sort、PIT和完整排序锚点；每次使用最新PIT ID，过期应按产品契约重启。
- [Elastic Index API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-index)：`external`仅接受严格更高版本；相等冲突不能无条件作为同内容成功。物理删除后的版本保留另需审核，正文采用持久逻辑墓碑。
- [S3条件写](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html)：create-only需要真实条件请求与权限保障；当前对象不存在或为delete marker时仍可写入，不能把条件写等同于永远不可覆盖。
- [S3 multipart](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)与[预签名URL](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)：完成对象有精确版本身份；能力到期前可重复使用，源/产物读取不得只依赖可变key。
- [PostgreSQL18显式锁](https://www.postgresql.org/docs/18/explicit-locking.html)：行锁在事务内保护共享判定；对象存储并未加入数据库事务，删除前的状态标记、发布互斥和物理generation需要应用协议落实。

[原终帧截图](screenshots/ch13-ch14-ch15-root/before/)保存三章六组两主题。主代理实际目视三张全组接触表，并单看Ch13浅色D1、Ch15深色D4和浅色D1；原图大体可读，重点保留并局部同步语义。[几何候选](ch13-ch14-ch15-geometry-before.json)仅帮助定位，`getBBox`对store标题与副标题等会报边缘交叠；不把候选直接当视觉缺陷，也不据此机械重画。

## 实施结果

| 章节 | 最终内容与关键实现 | 证据 |
|---|---|---|
| Ch13 搜索 | 同ID持久逻辑墓碑与严格外部版本；Java确定性top-k合并；完整分片、PIT最新ID、扫描锚点及权威过滤；3段同源代码 | [作者](ch13.md) / [独立复核](ch13-independent-review.md) |
| Ch14 视频 | 精确源版本与持久任务同事务；领取epoch与物理产物版本；清单引用闭包、发布/完成；播放grant准入/续期与GC共享状态门，固定root/期限；5段同源伪代码 | [作者](ch14.md) / [独立复核](ch14-independent-review.md) |
| Ch15 网盘 | 同一元数据权威中的租户约束、可信核验/pin、父版本条件提交、提交序游标、DELETING与物理generation；5段同源SQL/伪代码 | [作者](ch15.md) / [独立复核](ch15-independent-review.md) |

三章主线提炼并同步中英、图注、无障碍描述和统一网格闪卡。完整假设与延伸追问按需展开，关键前提、算式和反例就地保留。原18组90帧、组序和帧ID保留，不添重复总图或D2。13段关键代码使全站50→63段，数量仅作盘点；Java页面标为教学节选并链接可运行完整类，其余代码明确标为伪代码或SQL约束形状。

## 交叉独立复核与返修

Ch15作者复核Ch13，Ch13作者复核Ch14，Ch14作者复核Ch15。复核者只读作者页面/示例，修复交回原作者。实施期间纠错见各章作者记录；独立复核发现按2项P1与5项P2记录，相关分支按同类问题家族计。

| 问题 | 修复与独立复验 |
|---|---|
| Ch15 · P1，SQL租户范围 | 原guard更新没有WHERE，GC只有generation条件；实际双租户SQL使B的计数/用量和READY代际也被A改变。所有本地键/辅助函数绑定认证tenant，相关SQL显式加tenant谓词。独立原负例和修后相同输入确认B不变，40项独立探针通过，关闭。作者另保留65项原契约与27项双租户检查。 |
| Ch14 · P1，播放grant/续期与GC准入 | 普通读旧ready后迟到签发会落在GC已标DELETING的窗口。新增grant.pseudo：同Video→Job→Build锁序重查PUBLISHED，先持久grant与保护上界再签固定root/expiry；GC先赢拒绝，grant先赢阻止回收。未知提交恢复核intent；已提交续期prior优先于旧grant过期检查；固定期限不因重试延长。41项独立探针含15项该家族反例通过，关闭。 |
| Ch13 · P2，Java节选性质/运行入口 | 展示块缺imports和外层类，原runnable标识易误导。改为teaching excerpt，邻近双语链接完整SearchMerge.java和README运行命令；独立HTTP200、内容hash与实际JDK17编译运行复验，关闭。 |
| Ch14 · P2，D1提交后状态 | F4/F5 Metadata副标签UPLOADING与提交后的UPLOADED矛盾；仅两帧同步状态，双主题独立复验关闭。 |
| Ch14 · P2，D3低档图注 | “先有可播低档”易与基线全三档READY混淆，双语改为“先生成低档”，明确BASE变体另有发布门槛，关闭。 |
| Ch14 · P2，D6拒绝AV1箭头 | 文字拒绝而支路仍像执行。F5淡化AV1节点及支路，红线停在阻断X，补SKIP AV1与desc；独立整组全帧双主题和390左右中目视关闭。 |
| Ch15 · P2，D1入口标签跨分区 | 原session/version左端112.328125穿过x120边界，init/commit仅留3.71875。F1–F5共10个text的中心160→180，其他字节保持；修后最小边界间距12.328125，距Metadata最小22.328125。作者最小修复后，独立全5帧两主题、真实390左右中30图及20个bbox测量复验通过，关闭。 |

Ch15入口问题在主代理初次终帧目视中未被发现，独立复核用真实Chrome字框定位后重新打开处理；[作者前后/字框证据](ch15-d1-labels-browser-results.json)、[10坐标范围证明](ch15-d1-labels-scope.json)与[独立逆向对比](ch15-independent-label-scope.json)保留。没有用“全页不溢出”替代图内排版检查。

独立执行证据：Ch13自写JDK17 oracle穷举28,561份语料、228,493断言，以及142项SQLite/协议/数字/同源检查；Ch14独立41项正常/反例和Fraction复算，实际字节CRC32/SHA256及简化清单闭包；Ch15独立40项包括真实SQL作用域负例、原样schema、新数据下正常提交与并发父版本、未知对象结果/GC/游标。各报告区分自写见证、作为被测对象加载的作者模型与未运行的分布式依赖，没有把作者自检数量当独立结论。

## 主代理最终验证、视觉与范围

[运行器](ch13-ch14-ch15-validate.py)、[17项命令输出](ch13-ch14-ch15-checks.txt)及[源码哈希](ch13-ch14-ch15-checks.json)实际通过全站静态检查、三章audit、播放器语法、diff、13段代码的页面/源一致性、JDK17.0.10编译与112项合并检查、Ch13的37项协议/数字、Ch14的77项契约、Ch15的65+27项，以及[独立边界反例](ch13-ch14-ch15-root-probes.json)。全站45章/276组/1,411帧/63代码块；3条既有迁移提示来自本批之外，三章audit无迁移提示。

主代理反例另用真实SQL版本谓词复现“保留v13墓碑挡住v12，删掉保留状态后v12能重新插入”；用实际两段字节计算full SHA256与part-digest composite不同；SQL父版本条件只有一个赢家；独立物理名称下旧删除不伤新generation。S3校验类型由[官方说明](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html)支持；Ch14明确multipart源为CRC32 FULL_OBJECT、产物按精确GET校验SHA256，没有混用。

[浏览器脚本](ch13-ch14-ch15-browser.mjs)与[最终结果](ch13-ch14-ch15-browser-results.json)覆盖三章×320/390/768/1440×两主题×zh/en/both，共72个不同真实组合。默认与展开所有details后实际innerWidth/scrollWidth相等，360次翻帧、13段逐字复制、键盘/自动播放/速度/循环、闪卡、已读及主题语言持久化通过，无页面或资源错误。返修只按受影响章重验，最终矩阵每章保留24个不同组合；未用CLI裁切图冒充手机。

作者对三章全部90帧两主题逐组目视，改动组另做真实390左右中视图；独立复核的实际覆盖见各章报告。主代理目视前后终帧接触表，另单看Ch13 D1/D5、Ch14 D1/D4/D6、Ch15 D1/D2/D4/D6与三章390代码。最终[grant移动预览](ch13-ch14-ch15-grant-preview.json)和两主题截图核对新增准入代码，最终Ch15 D1标签也已实际目视。[几何结果](ch13-ch14-ch15-geometry-after.json)只是定位辅助；store标题/副标题的字框候选仍由实际页面判读，不当作自动视觉合格证明。

[范围检查](ch13-ch14-ch15-scope.mjs)与[结果](ch13-ch14-ch15-scope-results.json)对照授权前6,724文件哈希：仅PLAN、三章、专属示例/资源和本批审查证据变化，其他42章、公共CSS/JS、首页、工具和既有成果保持基线，无越界新增或删除。原90帧中Ch13有7帧、Ch14有13帧、Ch15有16帧局部SVG变化，余54帧逐字不变。帧数、顺序和ID完整保留。

## 最终源码与限制

- Ch13：`7c4911d8868730bb15844a7c1a3d877b3ed7eb26064188a5bfd76113f6757369`
- Ch14：`a6df2e3090d1e7bf9a0a441e6b6ae0417c3871d321c12a9eeb6011c2646b39db`
- Ch15：`39385aea292a15a9f37a7482ed82725a18e913183b1eb4415a7e325af780eb61`

[证据一致性脚本](ch13-ch14-ch15-evidence.py)核对页面、浏览器、代码、反例、几何与独立报告中的最终源码哈希，独立结论仍由主代理实际读报告判断，文件存在本身不构成验收。

未运行真实Elasticsearch/Redis/PostgreSQL/S3/CDN/消息集群、真实编码器、IAM集成、设备fsync/断电、共识切主、网络/时钟故障或生产压测。SQLite锁粒度、对象模型、Java纯内核、简化清单解析等都有限定范围；它们不证明部署耐久性或性能。部署须兑现权限、条件写、精确对象版本、持久日志、时钟和读取排空契约；无法给出排空界限就保留引用，不能以令牌到期推断读取结束。

既有共享UI两项表现继续记录：320/both品牌可竖向换行但控件可达，大图横滚时同slide长图注一起移动、滚回可读。未扩大公共UI范围。

PLAN已更新至C阶段12/42，三章任务锁已清除。本批未提交、推送或部署，不自动推进下一批。
