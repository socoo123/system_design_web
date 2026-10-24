# Ch39 executable teaching model

Java 17 standard library only. Run from repository root:

```sh
mkdir -p /tmp/ch39-classes
/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin/javac -d /tmp/ch39-classes examples/ch39/LoadBalancing.java examples/ch39/LoadBalancingTest.java
/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin/java -cp /tmp/ch39-classes LoadBalancingTest
node examples/ch39/sync.mjs --check
```

Three HTML excerpts come verbatim from named source regions, with common indentation removed. `sync.mjs` updates them, `--check` verifies them.

`choose` implements equal-capacity P2C over a unique endpoint snapshot: READY plus the selector's current healthy/not-ejected view. Two candidate indices are distinct. `observedActive` is the ingress's observed unfinished attempts, not a globally exact App count; no available target returns null. This explicit rejection policy is not Envoy's default panic policy, and this model does not implement Envoy's unequal-weight branch.

`Gate` is the authoritative local admission mechanism for **one App incarnation**. All ingress paths invoke it at the App before a handler starts. It limits physically active handlers/streams with no waiting queue; a real service must apply the gate before expensive resource acquisition and keep separate memory/connection limits. This is an in-process reference harness, not a remote permit protocol. A permit remains held until actual server handler completion; caller timeout or cancellation request is insufficient. `finish` is idempotent and bound to its gate/incarnation.

The coordinator assigns a fresh, non-reused incarnation when an endpoint address is reused. An old Gate never becomes READY again after DRAINING/UNHEALTHY; a replacement process uses a new Gate. A second Gate in the same live process must never hide still-active old work; any overlapping process needs independently budgeted resources. Only WARMING can become READY, after externally verified version/dependency/warmup checks. Probe collection, discovery publication and warmup are explicit integration preconditions, not implemented network calls.

`beginDrain` rejects commands for an old incarnation before closing the local gate. The coordinator then withdraws this incarnation at the specified membership revision and calls `acknowledgeRemoval` only after its real relevant-ingress barrier. Kubernetes endpoint updates alone do not supply that barrier. Repeated drain of the same revision preserves its original cutoff. `pollDrain` reports CLEAN_EXIT only after barrier confirmation and zero active handlers; cutoff returns FORCE_REQUIRED without zeroing counters. An external supervisor must cancel/close or kill and observe actual process exit. STOPPED belongs to that observer: no local return value proves that the OS process exited, or that a remote business write was rolled back.

Clocks use process-local monotonic nanoseconds. Request deadlines are converted into this clock domain once at receipt; raw `System.nanoTime` values cannot be sent between hosts. Differences are compared modulo signed-long arithmetic; all budgets and relevant observation distances must stay below 2^62 ticks. The tests use a controllable clock and **real Java threads** blocked on the implementation lock to move across admission/drain cutoffs. They also race two ingress threads for a last slot, test duplicate completion, stale generations, ACK mismatch and wraparound. These tests demonstrate local invariants, not distributed availability, network GOAWAY behavior, real Kubernetes/Envoy health integration, production p99 or capacity.
