# Ch04 · 令牌桶教学实现

`token-bucket.lua` 是 Redis 7+ Lua 教学示例，与页面代码逐字一致。固定策略 v1：B=4、r=1/15 token/s；一个 token=15,000 整数信用，每毫秒补 1 信用。输入一个可信 `KEYS[1]` 和整数 `ARGV[1]` cost（1–4），输出 `[allowed(0/1), remaining_credit, wait_ms]`。Gateway 将余额除以15,000、等待毫秒向上取整成HTTP秒。此示例不包含策略在线迁移、请求去重、多桶事务或业务调用。

在自用测试 Redis 上执行（key 由调用者认证结果生成，不能接受客户端任意提供）：

```sh
redis-cli --eval examples/ch04/token-bucket.lua 'rl:{tenant42:user9}:items' , 1
```

Redis 执行整个 EVAL，读取、TIME、补充、判断和唯一 SET PX 不能被其他请求插入。状态 JSON 和 TTL 在唯一写命令一起提交；写前验证 cost、策略版本、数值范围与 JSON。错误不是 deny；脚本不承诺自动回滚或切主持久性。PX 为120,000ms+回拨欠时，等待也加入欠时；向前跳钟、驱逐、复制丢失仍可能重置额度。

## 可重跑验证

需要 Python 3、一个本地 Redis server 二进制。只用标准库，不连接现有 Redis：程序自动启动仅监听临时 Unix socket 的独立进程，关闭持久化，结束后清理目录与进程。

```sh
python3 examples/ch04/verify.py /absolute/path/to/redis-server
```

本次验证用从 Redis 官方 `https://download.redis.io/releases/redis-7.2.5.tar.gz` 下载并在 `/tmp` 编译的 Redis 7.2.5；未全局安装，未修改项目依赖。结果写入 `docs/reviews/ch04-code-results.json`。

覆盖：页面/源文件一致性；真实 Redis 中图2正常轨迹（仅替换取时行为注入固定测试时间）；20个并发客户端竞争最后一个token（原始Lua、真实TIME，仅一个allow）；future-last 回拨状态的等待115秒、TTL220秒；非法cost、损坏JSON/状态均不修改；ACL禁止SET导致错误且余额不变；丢弃已执行判定的回复后重试会扣两次；窗口反例与容量算术。

未验证：系统调时、故障切主、复制丢失、内存驱逐、性能与容量。注入时间和预置future-last不是操作系统调时实验，丢弃回复也不是网络故障注入。它们不证明生产环境的分布式可靠性。
