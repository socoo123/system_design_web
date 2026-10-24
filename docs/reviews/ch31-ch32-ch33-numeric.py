"""Independent arithmetic from the chapter assumptions; no vendor benchmark claims."""
from decimal import Decimal as D
from pathlib import Path
import datetime
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
rows = []


def eq(chapter, name, formula, actual, expected, unit):
    actual, expected = D(str(actual)), D(str(expected))
    rows.append({"chapter": chapter, "name": name, "formula": formula,
                 "actual": str(actual), "expected": str(expected), "unit": unit,
                 "passed": actual == expected})


eq(31, "raw vector", "768 × 4", 768 * 4, 3072, "B/vector")
eq(31, "raw dataset", "100,000,000 × 3072 / 10^9", D(100_000_000) * 3072 / 10**9, "307.2", "GB")
eq(31, "raw dataset binary", "307.2 × 10^9 / 2^30", D("307.2") * 10**9 / 2**30, "286.102294921875", "GiB")
eq(31, "raw shard", "307.2 × 10^9 / 4 / 2^30", D("307.2") * 10**9 / 4 / 2**30, "71.52557373046875", "GiB")
eq(31, "hot memory", "128 × 0.7", D(128) * D("0.7"), "89.6", "GiB")
eq(31, "remaining hot memory", "89.6 − 71.52557373046875", D("89.6") - D("71.52557373046875"), "18.07442626953125", "GiB")
eq(31, "replicated raw vectors", "307.2 × 2", D("307.2") * 2, "614.4", "GB")
eq(31, "independent full scans", "200 × 307.2 / 1000", D(200) * D("307.2") / 1000, "61.44", "TB/s logical")
eq(31, "simplified bottom-layer adjacency", "100,000,000 × 2 × 16 × 4 / 10^9", D(100_000_000) * 2 * 16 * 4 / 10**9, "12.8", "GB, excludes other graph costs")
eq(31, "PQ subspace", "768 / 96", D(768) / 96, 8, "dimensions")
eq(31, "PQ code", "96 × 8 / 8", D(96) * 8 / 8, 96, "B/vector")
eq(31, "PQ code plus ID", "100,000,000 × (96 + 8) / 10^9", D(100_000_000) * 104 / 10**9, "10.4", "GB")
eq(31, "mean list size", "25,000,000 / 4096", D(25_000_000) / 4096, "6103.515625", "vectors/list under uniformity")
eq(31, "codes examined per shard", "25,000,000 × 16 / 4096", D(25_000_000) * 16 / 4096, "97656.25", "codes/query under uniformity")
eq(31, "all-shard compressed reads", "97,656.25 × 104 × 4 / 10^6", D("97656.25") * 104 * 4 / 10**6, "40.625", "MB/query logical")
eq(31, "compressed read rate", "40.625 × 200 / 1000", D("40.625") * 200 / 1000, "8.125", "GB/s logical")
eq(31, "rescore input", "4 × 100 × 3072", 4 * 100 * 3072, 1_228_800, "B/query maximum")
eq(31, "rescore read rate", "1,228,800 × 200 / 10^6", D(1_228_800) * 200 / 10**6, "245.76", "MB/s logical")
eq(31, "small allowset scan", "5000 × 3072 / 10^6", D(5000) * 3072 / 10**6, "15.36", "MB/query")
eq(31, "postfilter survivors", "100 × 0.001", D(100) * D("0.001"), "0.1", "expected under independence")
eq(31, "candidate expectation", "10 / 0.001", D(10) / D("0.001"), 10_000, "candidates, not a probability guarantee")
eq(31, "steady replica load", "200 / 2", D(200) / 2, 100, "queries/s/replica under even split")
eq(31, "one-loss capacity shortfall", "200 − 120", 200 - 120, 80, "queries/s/shard")
eq(31, "logical WAL rate", "100 × 4096 / 10^6", D(100) * 4096 / 10**6, "0.4096", "MB/s, before replication")

eq(32, "request minute", "20 × 60", 20 * 60, 1200, "requests/min under stated window")
eq(32, "input TPM", "1200 × 2000", 1200 * 2000, 2_400_000, "tokens/min")
eq(32, "output TPM", "1200 × 400", 1200 * 400, 480_000, "tokens/min")
eq(32, "actual aggregate", "1200 × (2000 + 400)", 1200 * 2400, 2_880_000, "tokens/min")
eq(32, "reservation volume", "1200 × (2000 + 1000)", 1200 * 3000, 3_600_000, "tokens/min held; not provider limiter semantics")
eq(32, "reservation excess", "3,600,000 − 2,880,000", 3_600_000 - 2_880_000, 720_000, "tokens/min")
eq(32, "context requirement", "8000 + 1000", 8000 + 1000, 9000, "tokens, excludes 4k route")
eq(32, "first-response budget", "0.2 + 0.8 + 0.2 + 0.7", D("0.2") + D("0.8") + D("0.2") + D("0.7"), "1.9", "seconds")
eq(32, "single attempt released hold", "3000 − 2400", 3000 - 2400, 600, "tokens")
eq(32, "modeled stream duration", "0.5 + (400 − 1) / 50", D("0.5") + D(399) / 50, "8.48", "seconds")
eq(32, "mean stream population", "20 × 8.48", D(20) * D("8.48"), "169.60", "streams; not tail capacity")
eq(32, "buffer cap", "200 × 64 × 1024 / 2^20", D(200) * 64 * 1024 / 2**20, "12.5", "MiB, excludes process overhead")
eq(32, "reuse fraction", "40 / 500 × 100", D(40) / 500 * 100, 8, "%")
eq(32, "conditional error fraction", "1 / 40 × 100", D(1) / 40 * 100, "2.5", "% among cache hits")
eq(32, "overall error fraction", "1 / 500 × 100", D(1) / 500 * 100, "0.2", "% among all test queries")
eq(32, "ideal saved generation rate", "20 × 0.08", D(20) * D("0.08"), "1.60", "generations/s, before embedding and error costs")

eq(33, "logical tool calls", "20 × 3", 20 * 3, 60, "calls/s assumption")
eq(33, "base mean in-flight", "60 × 0.3", D(60) * D("0.3"), 18, "RPCs")
eq(33, "with 10 percent one-retry mix", "60 × 1.1 × 0.3", D(60) * D("1.1") * D("0.3"), "19.8", "RPCs under steady mix")
eq(33, "approval arrival rate", "60 × 0.2", D(60) * D("0.2"), 12, "approvals/s")
eq(33, "mean pending approvals", "12 × 30", 12 * 30, 360, "pending under steady wait")
eq(33, "result buffer cap", "64 × 64 × 1024 / 2^20", D(64) * 64 * 1024 / 2**20, 4, "MiB")
eq(33, "daily baseline audit", "2000 × 60 × 86400 / 10^9", D(2000) * 60 * 86400 / 10**9, "10.368", "GB/day if peak lasts all day")
eq(33, "seven-day two-copy hot audit", "10.368 × 7 × 2", D("10.368") * 7 * 2, "145.152", "GB baseline")
eq(33, "thirty-day two-copy cold audit", "10.368 × 30 × 2", D("10.368") * 30 * 2, "622.080", "GB baseline")
eq(33, "total deadline", "3.5 + 0.2 + 3.5 + 0.8", D("3.5") + D("0.2") + D("3.5") + D("0.8"), 8, "seconds")

result = {
    "at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "chapterHashes": {f"ch{n}": hashlib.sha256((ROOT / f"chapters/ch{n}.html").read_bytes()).hexdigest() for n in (31, 32, 33)},
    "method": "Decimal arithmetic derived independently from stated A-assumptions. Does not verify empirical performance or production topology.",
    "checks": rows, "passed": all(row["passed"] for row in rows),
}
(ROOT / "docs/reviews/ch31-ch32-ch33-numeric-review.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"passed": result["passed"], "equations": len(rows), "failures": [r for r in rows if not r["passed"]]}))
raise SystemExit(0 if result["passed"] else 1)
