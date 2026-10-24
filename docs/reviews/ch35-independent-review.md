# Ch35 独立只读复核

2026-10-24，GPT-6.1-Sol + Max。复核者是本批Ch34作者，未派新agent。
**结论：通过本轮独立复核。此前锁前采时P1已用真实锁等待跨期限独立重验；本次1项可访问元数据P2已由原作者修复并关闭。未发现未关闭P0/P1或阻碍阅读的P2。**

最终页面：`c5a834dfbe100cbab2dc051f2d712c9fd16ebd5e00926af7856591c26235db6c`。
复核期间未改页面、examples或共享资源；只写本复核证据。[before/after字典](ch35-independent-source-hashes.json)保留最初冻结与最终快照。`unchanged=false`仅因为原作者在复核中修复D3F2 title / D3F4 desc；全部5份examples逐字不变，独立[两字段差异检查](ch35-independent-label-results.json)证明除此之外全文相同。不是复核者修改作者文件。

## 审阅范围与发现

独立通读完整中英正文、A1–A12、全部33帧title/desc/图中文字/图注、14张闪卡、4段页面代码及5份examples文件。主线的bundle/READY/多维信用/发布与drain一致；SQL/事务只保证一个SQLite权威文件内状态，不把物理GPU安全包含在数据库提交中。

| 项 | 独立判断与关闭证据 |
|---|---|
| 既有P1：拿写锁前传整数now，锁等待跨deadline仍准入 | 当前reserve、begin_dispatch、consume、expire均在write_tx成功后调用clock。独立以真实monotonic时间、80ms期限、独立连接写锁阻塞130ms；锁内前clock调用数均0，实际锁后样本173/174/161/164ms。reserve拒绝且无permit/扣款；dispatch/consume不给发送/启动权；未派发hold的expire成功。见[独立新输入](ch35-independent-probe-results.json)。 |
| 本次P2：D3F2 title benchmark throughput / F4 desc benchmark capacity与“未实测假设”口径不齐 | 原作者仅改为assumed admission capacity。独立核到原快照hash完全匹配before，移除title/desc后的全文逐字相同；最终24真实布局/132翻帧、66双主题渲染重新跑到新hash，关闭。 |
| goodput与C | goodput仅为符合SLO的完成率，不能直接推出总接纳容量；例如同样goodput可能来自不同超时/拒绝组合。本章把C=4限定为固定负载/profile/SLO下的待测接纳率假设，未将来源或本地代码当GPU性能证明。 |
| 同80%故障预算 | 9副本失3后仅19.2/s规划，20/s需拒绝至少0.8/s（4%）或另验降级SLO；11的4/4/3失4后22.4/s，10仍19.2/s。独立枚举1至10均不足，并实际编译Java17验证。 |
| 物理完成 | release依赖可信适配器保证全部kernel/copy/stream已终止或旧进程设备隔离；CUDA event仅覆盖captured work，未record的空event也可Success。SQL传worker/epoch不能自行证明物理停止。页面、README与代码注释均明确这一前提，未越界宣称实际GPU验证。 |
| 发布与兼容 | bundle/API/checkpoint schema兼容拒绝、expected_rev CAS、幂等结果/快照/审计同事务成立；质量/容量/warmup证据是显式外部前提。新revision不重绑旧RUNNING；drain后不承诺热回退；expand/contract保留旧writer/reader格式的时序双语一致。 |

## 新输入实跑、作者runner与手推分别记录

[独立脚本](ch35-independent-probes.py)不导入作者check或其fixture，直接调用ledger，新造team/blue/green、epoch41、ctx16k与不同KV额度。**72项检查通过**，包括17项数字检查与实际Java17编译/运行；其余是状态、事务和锁时序检查，不是72种生产故障实验。

- 正常HELD→DISPATCHING→RUNNING→RETIRING→RELEASED，原key/body/信用冲突与终态不重开；重复dispatch/consume不再授发送/启动权；晚TTL不释放RUNNING。
- 独立5连接最后KV与最后sequence争用；只剩9 MiB时5个各5 MiB请求仅一赢家，sequence仍空闲；replica失败回滚tenant扣款。注入第二步前异常，两个维度与permit一起回滚。
- 四种真实写锁等待跨deadline测试，见上表；这与作者的逻辑时钟字典样例及主代理29项输入分开，未复述其结论作为证据。
- 三个发布者同expected_rev仅一成功；错误state/API schema不推进revision；旧缓存不能新hold；切新发布保留原RUNNING bundle。
- 撤路由后drain只过期HELD，RUNNING/派发未知阻卸载；先前已获DISPATCHING者在原deadline内仍可consume，符合页面明确契约；随后retire与注入可信完成通知才可卸载，不能再热回退到draining worker。
- 物理完成只注入可信fixture，没有调用GPU或CUDA。旧epoch完成拒绝、重复完成不双退款均实际检查。

[作者runner重跑包装](ch35-independent-author-rerun.py)执行作者原check逻辑，仅将报告路径改为独立文件，得到[105项SQLite断言](ch35-independent-author-rerun-results.json)。它是作者测试的再执行，未算进独立72项。子进程真实退出等覆盖属于该runner，独立新输入不冒称重新设计了那些实验。

Java实际Oracle17.0.10，以`javac --release 17`编译原Capacity.java到临时目录，同JDK运行；输出160/5/7、24.0/19.2与11，退出码0。未向examples写class/pyc。

独立数字还复算：12起步/20全重叠卡；40GB÷2GB/s+100s=120s；9份360GB共享2GB/s纯下载下界180s；20×0.2=4平均排队；2/s×300=600期望灰度样本，不能作置信保证；5%×10%=0.5%聚合错误；24GiB=24576MiB；512K/64K=8只为token工作量比，不保证耗时线性八倍。所有数均为本章假设/算术。

## 图形、浏览器与来源

独立生成[66张双主题渲染](ch35-independent-render-results.json)与[12张接触表](ch35-independent-contact-results.json)，全部实际逐张查看。D1/D3/D4/D6修改组的23×2=46帧逐帧核对：入口边界不穿chat文字，故障域整组不可用/0 live值清楚，多维信用与唯一dispatch门一致，热回退斜线避开底部错误率说明。D2/D5亦看过全部帧，未因未改而免审。

[最终真实Chrome](ch35-independent-browser-results.json)：320/390/768/1440×两主题×zh/en/both共24组合，实际innerWidth=scrollWidth，details展开无整页溢出；132帧导航、4段逐字复制、播放/键盘/设置持久化、闪卡/进度通过，pageerror和资源错误0。抽看真实320 EN、390对照、桌面深色代码和D3/D6横滚画面，代码/图在自身容器横滚。未用CLI裁切冒充手机。

第一次独立浏览器脚本的基线文件名适配误变为不存在的ch35-ch35-ch36-baseline，启动前失败；修正为既有ch34-ch35-ch36-baseline后完整重跑。它是复核工具适配错误，未误列为站点缺陷，也未沿用失败运行作通过证据。

[独立官方来源抽核](ch35-independent-sources.md)实际重新打开7份：CUDA13.4、vLLM固定v0.15.1与可变stable安全、HF download、Kubernetes spread、GPU Operator24.9.1、KServe Next。支持机制与版本边界，与正文引用相符；未采用来源当作本章吞吐/延迟证明。

结构audit、4段sync、浏览器/渲染脚本语法与git diff --check通过。最终复核材料中页面/源码哈希均见各结果及字典；模型核心源码与原冻结完全相同。

## 未执行范围

没有GPU/CUDA、真实模型/权重字节校验、Kubernetes/TP、真实SSE/网络、生产压测、签名和时钟同步、PostgreSQL、通用状态迁移。可信完成通知不能由本地SQLite运行证明。发布代码不测自动质量/容量门槛，签名/READY/warmup/资源需求计算来自可信适配前提。以上限制已在站点中说明，不当作本次验证完成。
