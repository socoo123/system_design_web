# Ch34 交叉独立复核

复核者：同批Ch36作者，GPT-6.1-Sol + Max，2026-10-24。只读 `chapters/ch34.html` 与 `examples/ch34/`；未修改作者页面/示例或共享文件，所有复核脚本、JSON和截图均为 `ch34-independent*` 专属证据。初始finding留档，作者返修后重新执行。最终签署信息在末节填写。

## 技术结论与已关闭问题

正文、双语、13张闪卡、四段代码与7组37帧均完整阅读。主线可从持久接单、领取owner、固定输入/attempt、提交输出、精确动作、观察/恢复、暂停、取消与补偿连续复述。可执行适配明确是两个独立SQLite文件的契约模型，完整Ch33授权/资源检查是可信外部前提，没有把本地写锁宣称分布式保证。

| 级别/问题 | 独立证据 | 修复后重验 |
|---|---|---|
| 主代理P1：用新version同时dispatch两个动作；取消后第一笔失败丢另一在途 | 主代理原始轨迹仅作定位，不替代本次输入 | 新输入不同tenant/actor/intent与金额37。第二动作在DISPATCHING及UNKNOWN时均拒绝；显式构造遗留双在途，第一FAILED_KNOWN仍CANCEL_REQUESTED；过期接管可领取剩余义务，第二SUCCESS进COMPENSATING。关闭。 |
| 本次新P1：observe局部status被run状态覆盖，OBSERVED.outcome记录COMPENSATING而非SUCCESS | `ch34-independent-observed-event-finding.json`在旧model6d35e216上实际复现，receipt与action为SUCCESS而event不同 | 作者分离outcome与next_status。独立重验晚到成功、第一已知失败、补偿成功：事件outcome均保持动作结果。关闭。 |
| 本次新P1：已observe SUCCESS后cancel卡CANCEL_REQUESTED，无在途也不能补偿 | `ch34-independent-cancel-confirmed-finding.json`实际调用cancel、claim、重复observe与compensate得到拒绝 | 作者cancel区分pending/confirmed/no-effect，并保留终态。独立43金额案例直接进COMPENSATING，核账/原key退款后COMPENSATED；重复cancel保留，全部已知失败可CANCELLED。关闭。 |
| 本次P2：320px长代码标题挤压Copy为Cop/y | 真实viewport、截图`copy/320-parchment-en-code4.png`及初始32按钮测量；both代码2/3/4与EN代码4出现48.6875px双行按钮 | 作者仅缩3个data-language，未动共享CSS/代码内容；最终32按钮测量全为28.34375px单行，独立关闭。 |

## 实际新输入与正常/故障轨迹

`ch34-independent-probes.py`直接导入作者Runtime/Gateway，使用全新orchid / buyer-17身份、r9工具、p31策略、resource_version19、17/23/37/43等金额，临时建两库。62项实际检查见`ch34-independent-probe-results.json`，不是复述作者或主代理测试：

- 正常start_step取得更新后的attemptVersion，旧入口version提交被拒，新token提交成功并复用已存输出，不增加物理attempt。续租后的旧version同样拒绝；恢复固定检索/时间/随机输入，物理重试不改逻辑step，缺usage保留占用，可信晚usage一次结算。
- owner/epoch/version/role_revision分别破坏即拒绝；实际改角色后新token也不能执行旧Agent绑定动作；未完成step换workflow revision必须显式迁移。四个独立连接同时领取同一READY行只有一owner。
- 批准早于park仍可权威查询；tenant/actor/Agent/intent/tool/tool_revision/route/resource/resource_version/policy_revision/args逐字段变化被拒；approval ID与过期也被拒。精确决定只接纳一次，取消后重复已接纳通知不复活；四组真实cancel/resume并发竞态保留取消结果。
- 新串行门与遗留多在途按上表重走；UNKNOWN阻止新模型提案。晚到成功保留效果，取消不等于远端没执行。
- 已确认效果后取消可补偿；UNKNOWN补偿不能结束COMPENSATED。两笔17金额效果建立undo依赖：前置PREPARED/UNKNOWN都挡住后继，查回原回执后才执行下一项并完成补偿。
- Gateway同key重放原回执，不同金额冲突；真实SQLite触发器让回执插入失败，业务余额与之一起回滚。未知原动作不可凭推测补偿；NEEDS_REVIEW先持久工单，精确持久回执前不能ack，ack也不删除UNKNOWN义务。

`step.pseudo`先bump再固定attemptVersion，与以上实际正常路径一致。代码复核未将`BEGIN IMMEDIATE`外的网络请求纳入本地事务。所有新输入执行前后chapter/examples九份非编译源码字典一致。

作者runner重跑为另一类证据：`ch34-independent-checks.py`保持全部检查逻辑，**只在内存将结果输出路径改成独立文件**，没有改源码或覆盖作者结果。`ch34-independent-author-rerun.json`101项通过，不能替代上述62项新输入。`node examples/ch34/sync.mjs --check`逐字检查四片段，chapter audit与git diff --check通过，命令输出见`ch34-independent-check-results.json`。

## 独立算式与来源

`ch34-independent-numeric.py`不导入作者容量代码，使用Fraction独立复算20项：100逻辑model/s、6000/min、60tool/s；110物理model/s、26.4M TPM（无重试24M）；11.06s/221.2活跃；额外0.5次模型给12.06s/241.2；1800待批；满12模型/8工具路径26.8s/536平均在途，超320为216；160delta写/s、0.32MB/s、27.648GB/天、七天两份387.072GB；16补偿为总调用数而非每秒。均通过，见`ch34-independent-numeric-results.json`。均值、峰值持续全天、十进制与稳定等待前提保留，未据均值证明p99。

已重新web抽核官方LangGraph Persistence、Checkpointers Replay/Durability modes及Interrupts，具体支持语句与定位见`ch34-independent-sources.md`。确认checkpoint/thread与store分工、旧checkpoint之后LLM/API/interrupt重跑、sync/async/exit差异，以及同thread恢复和interrupt节点从头运行。章节将自己的已存输出复用规则与显式LangGraph replay区分，引用成立。

## 图、双语、闪卡与实际浏览

独立渲染37帧×两主题=74图，全部7组双主题接触表已实际目视，尤其修改组D1/D4/D5/D6/D7的27帧×两主题=54画面。观察正常回程、下游提交但run pending、旧epoch拒绝、先提交handoff、批准早到与权威复查、UNKNOWN补偿/人工义务；未发现新增逻辑错误、遮挡或裁切。D2/D3保留的有界loop/固定workflow也逐帧复看，预算与业务边和文字一致。

截图在`docs/reviews/screenshots/ch34-independent/after/contact-d1.png`至`contact-d7.png`。实际页面为Chrome+Playwright真实viewport，服务127.0.0.1:8765；没有用CLI裁切冒充手机。24布局为320/390/768/1440×两主题×三语言，innerWidth与整页scrollWidth相等；details展开仍无页面横溢。390/1440双语两主题全148次翻帧，4代码复制、播放/键盘/速度循环、13卡片网格/翻面、已读与设置持久化均通过。实际看320中文护眼、390双语深色、窄屏代码以及D4/D7横向滚动。SVG和代码在容器内横向滚动。

## 实际范围与未执行边界

运行的是SQLite契约适配，非LangGraph SDK、真实LLM、Ch33 HTTP/签名grant、PostgreSQL复制或生产集群。current权限、正确资源归属、审批凭证真实性及执行时重新检查为可信fixture前提；本次验证精确绑定比较和状态门，不证明真实授权系统。网络失包用两库提交间隙与延迟调用模拟，未做基础设施故障注入。

实际可执行覆盖owner/epoch/version、固定输入/已存输出、token占用、动作串行、批准/取消、回执及补偿。完整workflow迁移/handoff、上下文投影、全局320槽、累计120活跃秒计时、供应商attempt幂等/账单、完整历史回放、对象存储、监控/调度与真实远端取消没有实现或执行。20算式是教学假设复算，非吞吐或可靠性承诺。补偿fixture仅固定全额退款业务，图中资源释放与通知修复仍为契约手推。

## 最终签署

**独立复核通过，未关闭P0/P1/P2为0。** 最终HTML `45989d2c609e36f48706a521fb04ea6b565dd75bda375abf03c17fc248be485d`，最终model `c83c16ab812c98f2322c1e939787a1c2317940dbf8caa90823f71c6c54394838`。62项新输入、20项独立复算、作者101项另重跑、四项命令/同源检查通过；最新HTML的24布局/148翻帧/4复制及32个320/390代码头测量均通过，按钮高度全28.34375px。最终74帧渲染绑定同一HTML，修改组全帧54幅目视已完成。

`ch34-independent-source-hashes.json` 按要求保存 `{before:{path:sha},after:{path:sha},unchanged:true}`，包含chapter与examples全部9份非编译源码，与作者最终字典逐项相等。初始旧6d35版本finding与初始源字典继续保留，作者两项逻辑返修和元数据局修均明确记录；最终签署仅针对返修后的冻结版本。汇总见 `ch34-independent-final-results.json`。未提交、推送或部署。
