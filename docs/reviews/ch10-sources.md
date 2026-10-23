# Ch10 source verification · 2026-10-23

Actually opened official sources with the browsing tool. Apple’s HTML returned
its JavaScript notice; its official Markdown endpoint was then fetched with
`curl` and read. The chapter cites the human-readable Apple page. No third-party
summary was used as technical authority.

| Ref | Primary source | Specific statement supported in the chapter |
|---|---|---|
| 1 | [FCM HTTP v1 send](https://firebase.google.com/docs/cloud-messaging/send/v1-api), authorization and success-response sections | Short-lived OAuth bearer authorization and a successful JSON `name` response. It is not evidence of user reading. |
| 2 | [FCM error codes](https://firebase.google.com/docs/cloud-messaging/error-codes), HTTP v1 error table | UNREGISTERED is 404 and the registration must no longer be used; 429 reasons distinguish overall/device/topic quota, overall/topic initial delay is at least a minute; 503 respects Retry-After with backoff. |
| 2 | [FCM scale guidance](https://firebase.google.com/docs/cloud-messaging/scale-fcm), Handling retries → Timeouts / Errors | Send timeout recommendation is at least 10 seconds. Retried failed requests have a minimum interval of at least 10 seconds; 429 additionally uses Retry-After, absent header defaults to 60 seconds. This newly checked guidance is why all old 5-second FCM diagram labels/budgets were updated to 10 seconds. |
| 3 | [APNs direct-device responses](https://developer.apple.com/documentation/usernotifications/handling-notification-responses-from-apns), [official Markdown](https://developer.apple.com/tutorials/data/documentation/usernotifications/handling-notification-responses-from-apns.md) | 200 success; 410 token inactive/expired; timestamp is milliseconds since epoch at invalidation; TooManyRequests and TooManyProviderTokenUpdates are distinct 429 reasons. 5xx retry guidance says after 15 minutes. Unregistered may be reconsidered after the application retrieves the token again. |
| 4 | [RFC 5321](https://www.rfc-editor.org/rfc/rfc5321.html), §§4.2.5, 4.5.3.2.6, 6.1 | Positive completion after DATA transfers delivery/reporting responsibility. Lost final response can cause duplicate copies. 250 is not proof that a person read mail. |
| 5 | [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.html), §§3–4 | One-click HTTPS POST does not include cookies or HTTP auth; sender must not redirect; an opaque hard-to-forge URI component is recommended. Mailbox verifies DKIM coverage of both unsubscribe headers; missing coverage means it should not offer one-click. |
| 6 | [Kafka 4.1 design](https://kafka.apache.org/41/design/design/), Message Delivery Semantics | Kafka topics/offset transactions differ from exactly-once external output, which generally needs destination cooperation. Processing before committing offset has a repeat window. No assertion that Kafka uses the chapter’s visibility lease. |
| 7 | [The Tail at Scale](https://www.barroso.org/publications/TheTailAtScale.pdf), pp.75–77 | The illustrative 1% single-server tail becomes about 63% at fan-out 100; service-class isolation addresses head-of-line blocking. The chapter independently recomputes the independence approximation and does not transfer the percentage to three providers. |
| 8 | [RFC 6376](https://www.rfc-editor.org/rfc/rfc6376.html), §3.5 DKIM-Signature | Signature `h=` lists covered header fields. This is distinct from the DNS-key record’s similarly named hash-algorithm tag and from authentication of an unsubscribe POST. |
| 9 | [FCM message types](https://firebase.google.com/docs/cloud-messaging/customize-messages/set-message-type), notification/data table | Background notification display is SDK-managed, while application-managed data messages can be processed by app code. Client deduplication before display is therefore conditional. |
| 10 | [PostgreSQL 18 INSERT](https://www.postgresql.org/docs/18/sql-insert.html), [isolation](https://www.postgresql.org/docs/18/transaction-iso.html), [SELECT locking](https://www.postgresql.org/docs/18/sql-select.html) | Unique indexes arbitrate concurrent inserts; READ COMMITTED uses new statement snapshots, so a DO NOTHING conflict need not make its winner visible in that statement. Row locks and SKIP LOCKED support competing queue-table consumers; skipping locks is not a general consistent read. |
| 11 | [AWS transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html), issues / implementation | Business change and outbox share a transaction; a relay may publish duplicates, requiring idempotent consuming logic. An outbox does not make the external provider participate in the DB commit. |

Own design/assumptions, not vendor promises: 30-second DB lease, 10-second
configured HTTP timeout following the FCM recommendation, result budget,
single-authority DB durability, 24-hour minimum/30-day example key retention,
500-byte state row, 2,000/s outlet, SMS maximum four reserved attempts, callback
authentication/correlation contracts, and the conservative timestamp applicability
test with a known clock-error bound. APNs does not supply that bound. Without it,
the example chooses REGISTRATION_RECHECK instead of deleting a registration.

All throughput/storage/SLO numbers are explicitly teaching assumptions. There
was no provider API request, quota measurement, broker durability test, or real
PostgreSQL failover/concurrency experiment in this author check.
