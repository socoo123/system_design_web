# Ch32 · 独立来源抽核

2026-10-24。OpenAI 事实按 OpenAI Docs 技能先查询官方域，再实际打开官方页；
无需 API key（只读文档，无 provider 调用）。技术来源仅一手官方文档/标准。

| 来源/版本 | 本次独立核对的支持句子 |
|---|---|
| [OpenAI Chat Completions streaming events](https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events)，访问日可变文档 | usage 通常只在 include_usage 的末 chunk 给出；中断/取消可能拿不到末 usage。支持保留 UNKNOWN，不支持“客户端没收到所以零成本”。实际打开 usage 字段原文。 |
| [OpenAI Rate limits](https://developers.openai.com/api/docs/guides/rate-limits)，访问日可变文档 | 失败请求也贡献分钟限制；应用重试需关闭 SDK 重试或合并总次数/总时间，valid Retry-After 超过可接受最大时间不能提前重试；quota/billing 类别不该当瞬时限流。支持本章错误白名单与预算/限流分离。未抄账户数值。 |
| [OpenAI Counting tokens](https://developers.openai.com/api/docs/guides/token-counting)，访问日可变文档 | 两类 output cap 包括不可见生成 token；计量不能由可见字数/事件数推得。A8 已把50 token/s限定为与可见输出计数一致的教学场景，没有拿隐藏推理除以可见速率。 |
| [OpenAI Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)，访问日可变文档 | FAQ 明确缓存前缀仍生成新响应，不能等同答案缓存或保证相同输出。章节未移植产品寿命/定价。 |
| [Claude API usage primer](https://platform.claude.com/docs/en/claude_api_primer)，官方访问日文档；[Streaming messages](https://platform.claude.com/docs/en/build-with-claude/streaming) 官方检索结果 | primer 实际打开并核对 message_delta usage 为累计，事件带命名类型。Streaming 正文两次抓取超时，另一次Markdown抓取类型不支持，未假称整页成功打开；官方检索原页返回同一累计说明与流内 error 示例，故结合 primer 核对这两个支持点。未核验所有 beta 事件或每个供应商行为。 |
| [Claude Rate limits](https://platform.claude.com/docs/en/api/rate-limits)，访问日可变文档 | Messages API区分 RPM、ITPM、OTPM，部分模型行共享限制；支持“换key不代表换额度”和 separate provider admission。未引用当前账户限额。 |
| [WHATWG HTML §9.2](https://html.spec.whatwg.org/multipage/server-sent-events.html)，页面标示2026-10-22更新 | UTF-8与逐行/空行事件解析；EventSource构造只给URL与credentials配置，不是携POST正文的completion调用器。支持 fetch/SDK + 自己按SSE解析、网络read不等于事件。 |
| [RFC9110 §9.2.2/§10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html)，2022 | 自动重试非幂等请求需已知语义/未执行证据；Retry-After为等待提示。本网关rid只去重自己的记录，并不从RFC得到供应商幂等保证。 |
| [SQLite Transaction](https://www.sqlite.org/lang_transaction.html) / [Isolation](https://www.sqlite.org/isolation.html)，官方文档；实际Python适配库3.51.0 | BEGIN IMMEDIATE写事务、单写者序列化与提交可见性，支持本次多连接实验。没有据此宣称执行了PG、复制、断电或外部API与本库原子提交。 |

独立数字计算是自设假设下的算术，不引厂商吞吐、实际价格或SLO。
