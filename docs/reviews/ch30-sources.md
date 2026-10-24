# Ch30 source support · rechecked 2026-10-24

All checks used the web tool on primary official documentation or original papers.
Numbers A1–A12 and all capacity assumptions are the chapter's own examples. The
source does not establish our service boundaries, ACL policy, hardware capacity,
quality thresholds or production correctness. Sentence-adjacent numbered links
resolve to these entries in the page; exact source revisions are retained where relevant.

| Ref | Source / checked section | Supports and limits |
|---|---|---|
|1|[Lewis et al., RAG v4,2021](https://arxiv.org/abs/2005.11401v4), abstract|Combines parametric/nonparametric memory. Does not specify this Catalog/ACL/publication design.|
|2|[Microsoft chunking](https://learn.microsoft.com/en-us/azure/search/vector-search-how-to-chunk-documents), Content overlap considerations|512-token/25% suggested start and content-dependent tuning; chapter's512/64 is an assumption.|
|3|[Elastic RRF](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reciprocal-rank-fusion), formula/parameters|One-based ranks, missing-lane zero contribution, rank_constant default60. The original [Cormack et al.2009 paper](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf) was also opened. No blanket assertion that tuning is unnecessary.|
|4|[Sentence Transformers Retrieve & Re-Rank](https://sbert.net/examples/sentence_transformer/applications/retrieve_rerank/README.html), pipeline/CrossEncoder|Rerank a retrieved shortlist, beyond corpus-wide pair scoring.80-pair cap is ours.|
|5|[pgvector README fixed v0.8.0](https://github.com/pgvector/pgvector/blob/v0.8.0/README.md), Filtering/Iterative Index Scans|ANN scan then filtering can underfill; iterative scan stops at enough results or configured cap. Pinned historical behavior, not a universal latest-version/vendor claim.|
|6|[Microsoft security filter pattern](https://learn.microsoft.com/en-us/azure/search/search-security-trimming-for-azure-search), About the pattern|Principal-string filters do not themselves authenticate/authorize. Current page also links separate native ACL support; this chapter discusses the ordinary filter pattern.|
|7|[ALCE2023 paper](https://aclanthology.org/2023.emnlp-main.398.pdf), §3.3 / PDF p4|Citation recall tests whether concatenated cited passages support a statement; precision detects irrelevant citations, using a fallible NLI model. ID membership is a separate engineering rule.|
|8|[RAGAS2024 paper](https://aclanthology.org/2024.eacl-demo.16.pdf), §3 Faithfulness / PDF p3|Decompose answer into statements and estimate supported/total. This is context support, not source truth or retrieval recall. Current API names/versions are not claimed.|
|9|[Lost in the Middle v3,2023](https://arxiv.org/abs/2307.03172v3), abstract/tasks|Position sensitivity in tested models/tasks; no universal claim about all current models.|
|10|[Microsoft Prompt Shields](https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/content-filter-prompt-shields), introduction/document attacks|Distinguishes document-injected instructions and says provenance is not independently verified. Detectors/delimiters are not an absolute prevention guarantee.|
|11|[Elastic Refresh an index](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-indices-refresh), operation description|Refresh makes recent operations available for search; refresh call is synchronous. Chapter avoids assuming a fixed interval or equating this with global visibility/atomic publication.|
|12|[PostgreSQL18 Explicit Locking](https://www.postgresql.org/docs/18/explicit-locking.html), row locks/deadlocks|Row-lock/transaction boundaries and consistent lock ordering. Executable adapter uses SQLite, not PG.|

Fresh official content was read rather than relying on older checked2026-10-07
labels. No vendor API calls were executed. Search receipt validation is an explicit
adapter contract tied to every manifest ID/hash/role and the serving-reader scope;
no canary is represented as a full-manifest proof. Safe input/policy checks,
whole-pack invalidation, check/send semantics and migration barriers are this
chapter's conservative design decisions.
