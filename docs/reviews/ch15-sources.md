# Ch15 · primary-source verification

Actually re-opened through browsing on 2026-10-23. These sources support the stated mechanisms; scale, timing, quota semantics, the guard/generation protocol and its implementation are chapter assumptions/design. No production results are inferred.

| Ref | Primary source | Verified support / boundary |
|---|---|---|
| 1 | [Venti, FAST 2002 original paper](https://www.usenix.org/legacy/events/fast02/quinlan/quinlan_html/) | §§Abstract/3: digest addressing, write once and duplicate coalescing. Its historical hash/performance are not adopted. The cat-v mirror was robots-blocked; the USENIX original was opened successfully. |
| 2 | [Dropbox Content Hash](https://docs.dropboxapi.com/dropbox-api/docs/technical-reference/content-hash) | 4,194,304-byte blocks, SHA-256 per block, binary digest concatenation then aggregate SHA-256; zero-length file rule. No claim about Dropbox’s internal object layout. |
| 3 | [restic design](https://restic.readthedocs.io/en/stable/100_references.html#backups-and-deduplication) | Rabin CDC; unchanged blobs reused after insertion/removal. Read/write-ordering section also distinguishes writing content before a snapshot. Not this chapter’s block parameters or GC implementation. |
| 4 | [tus 1.0.0](https://tus.io/protocols/resumable-upload) | Core HEAD/Upload-Offset/PATCH, mismatched offset 409. A sequential upload offset differs from independent block-object state. |
| 5 | [S3 multipart overview](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html) | Numbered parts and complete, ETag need not be MD5, completion/abort and unfinished-part storage. No inference that application complete equals multipart complete. |
| 6 | [S3 multipart limits](https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html) | 5 MiB minimum for nonfinal parts; final part exception. 4 MiB independent ordinary PUTs are a different layer. |
| 7 | [RFC 9110 §13.1.1](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.1) | Strong If-Match comparison; false condition must not apply mutation; 412 response and already-applied success alternative. The chapter deliberately chooses 412 for new stale-parent requests. |
| 8 | [AWS transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) | Database/outbox atomicity, rollback invisibility and possible duplicates. Does not provide exactly-once device delivery. |
| 9 | [Drive Retrieve changes](https://developers.google.com/workspace/drive/api/guides/manage-changes) | Saved start/page tokens and subsequent changes listing. No claim that vendor opaque tokens are integer counters. |
| 10 | [Drive push notifications](https://developers.google.com/workspace/drive/api/guides/push) | files/changes notification bodies are empty; metadata/content are retrieved separately. The chapter’s periodic catch-up is its own reliability rule. |
| 11 | [PostgreSQL 18 row locks](https://www.postgresql.org/docs/18/explicit-locking.html) / [sequence semantics](https://www.postgresql.org/docs/18/functions-sequence.html) | Row locks held to transaction end; nextval values are not reclaimed on abort. Guard-first writers and an ordinary transactional counter are our design, with tenant serialization cost. |
| 12 | [S3 presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html) | Reusable until expiry, same-key PUT replacement, explicit checksums, bearer access, and downloads begun before expiry can continue. This motivates exact staging versions, frozen final generations and read-pin drain requirements. |
| 13 | [S3 deleting object versions](https://docs.aws.amazon.com/AmazonS3/latest/userguide/DeletingObjectVersions.html) | Ordinary DELETE may create a delete marker; exact version ID deletes a specific version. Never-reused generation keys are our additional rule against stale deletes. |

All cited links are placed in the corresponding bilingual page paragraphs, with full reference entries. Capacity arithmetic is recomputed by `examples/ch15/check.py` and recorded in `ch15-code-results.json`.
