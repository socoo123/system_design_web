import java.util.*;

/** Java 17, no dependencies. One worker's CPU ledger, not a CUDA implementation. */
public final class KvLedger {
    public record Owner(String attempt, long generation, String boot) {
        public Owner {
            if (attempt == null || attempt.isBlank() || generation <= 0 || boot == null || boot.isBlank())
                throw new IllegalArgumentException("Invalid owner");
        }
    }
    public record Handle(String boot, int slot, long incarnation) {}
    public record Ticket(String boot, long id) {}
    public enum State { RUNNING, RETIRING, RELEASED }
    public enum Reason { EOS, CANCEL, DEADLINE }
    private static final int BLOCK = 16;
    private static final class Page {
        long incarnation;
        int refs, pins;
        boolean sealed, cached;
    }
    private static final class Generation {
        final int credits;
        final Set<Handle> pages = new LinkedHashSet<>();
        int inFlight;
        State state = State.RUNNING;
        Reason reason;
        Generation(int credits) { this.credits = credits; }
    }
    private record Hold(Owner owner, List<Handle> pages) {}
    private final String boot;
    private final int contextLimit;
    private final Page[] pool;
    private final Map<Owner, Generation> generations = new HashMap<>();
    private final Map<Long, List<Hold>> launches = new HashMap<>();
    private int reserved;
    private long nextTicket;
    private boolean healthy = true;

    public KvLedger(String boot, int blocks, int contextLimit) {
        if (boot == null || boot.isBlank() || blocks <= 0 || contextLimit <= 0)
            throw new IllegalArgumentException();
        this.boot = boot;
        this.contextLimit = contextLimit;
        pool = new Page[blocks];
        Arrays.setAll(pool, i -> new Page());
    }

    // BEGIN admission
    public synchronized boolean admit(Owner owner, int prompt, int maxOutput) {
        long total = (long) prompt + maxOutput;
        if (prompt <= 0 || maxOutput <= 0 || total > contextLimit)
            throw new IllegalArgumentException("Token limits");
        if (!healthy || !boot.equals(owner.boot())) return false;
        int need = (int) ((total + BLOCK - 1) / BLOCK);
        Generation prior = generations.get(owner);
        if (prior != null) {
            if (prior.credits != need) throw new IllegalArgumentException("Changed request");
            return prior.state == State.RUNNING;
        }
        boolean oldOwnerLive = generations.entrySet().stream().anyMatch(e ->
                e.getKey().attempt().equals(owner.attempt()) && e.getValue().state != State.RELEASED);
        if (oldOwnerLive || need > pool.length - reserved) return false;
        generations.put(owner, new Generation(need));
        reserved += need;                    // promise full output; allocate no page yet
        return true;
    }

    public synchronized Handle allocate(Owner owner) {
        Generation gen = mutable(owner);
        if (gen.pages.size() >= gen.credits) throw new IllegalStateException("Credit exhausted");
        for (int i = 0; i < pool.length; i++) {
            Page page = pool[i];
            if (page.refs != 0 || page.pins != 0) continue;
            page.incarnation = Math.incrementExact(page.incarnation);
            page.cached = page.sealed = false; // evict an unused cache entry if needed
            page.refs = 1;
            Handle h = new Handle(boot, i, page.incarnation);
            gen.pages.add(h);
            return h;
        }
        throw new IllegalStateException("Pool accounting violated");
    }
    // END admission

    public synchronized void cacheFullBlock(Owner owner, Handle h) {
        Generation gen = mutable(owner);
        if (!gen.pages.contains(h)) throw new IllegalArgumentException("Not owned");
        Page page = page(h);
        page.sealed = page.cached = true;     // caller has completed the full block
    }

    public synchronized void retainPrefix(Owner owner, Handle h) {
        Generation gen = mutable(owner);
        Page page = page(h);
        if (!page.sealed || !page.cached) throw new IllegalArgumentException("Full prefix only");
        if (gen.pages.size() >= gen.credits || gen.pages.contains(h))
            throw new IllegalArgumentException("Duplicate or beyond credits");
        gen.pages.add(h);
        page.refs++;
    }

    // BEGIN issue-stop
    public synchronized Ticket issue(List<Owner> batch) {
        if (!healthy || batch.isEmpty() || new HashSet<>(batch).size() != batch.size())
            throw new IllegalArgumentException("Invalid batch");
        List<Hold> holds = new ArrayList<>();
        for (Owner owner : batch) {
            Generation gen = mutable(owner);
            if (gen.pages.isEmpty()) throw new IllegalStateException("Missing KV");
            holds.add(new Hold(owner, List.copyOf(gen.pages)));
        }                                   // validate everything before mutating
        long id = Math.incrementExact(nextTicket);
        for (Hold hold : holds) {
            generations.get(hold.owner()).inFlight++;
            for (Handle h : hold.pages()) page(h).pins++;
        }
        nextTicket = id;
        launches.put(id, List.copyOf(holds));
        return new Ticket(boot, id);          // pin before submitting any GPU access
    }

    public synchronized boolean stop(Owner owner, Reason reason) {
        Objects.requireNonNull(reason);
        Generation gen = generations.get(owner);
        if (!healthy || gen == null || gen.state != State.RUNNING) return false;
        gen.reason = reason;                 // first stop/EOS wins
        gen.state = State.RETIRING;           // prevents all later issue calls
        releaseIfRetired(gen);
        return true;
    }
    // END issue-stop

    // BEGIN retire
    public synchronized boolean complete(Ticket ticket, Set<Owner> eos) {
        if (!healthy || !boot.equals(ticket.boot())) return false;
        List<Hold> holds = launches.remove(ticket.id());
        if (holds == null) return false;      // duplicate/old completion
        for (Hold hold : holds) {
            for (Handle h : hold.pages()) page(h).pins--;
            Generation gen = generations.get(hold.owner());
            gen.inFlight--;
            if (eos.contains(hold.owner()) && gen.state == State.RUNNING) {
                gen.reason = Reason.EOS;
                gen.state = State.RETIRING;
            }
            releaseIfRetired(gen);
        }
        return true;
    }

    private void releaseIfRetired(Generation gen) {
        if (gen.state != State.RETIRING || gen.inFlight != 0) return;
        for (Handle h : gen.pages) page(h).refs--;
        gen.pages.clear();
        reserved -= gen.credits;             // return promise exactly once
        gen.state = State.RELEASED;
        // A page is reusable only at refs==0 && pins==0; cached data may remain.
    }
    // END retire

    private Generation mutable(Owner owner) {
        Generation gen = generations.get(owner);
        if (!healthy || gen == null || gen.state != State.RUNNING || gen.inFlight != 0)
            throw new IllegalStateException("Not mutable/runnable");
        return gen;
    }

    private Page page(Handle h) {
        if (!boot.equals(h.boot()) || h.slot() < 0 || h.slot() >= pool.length)
            throw new IllegalArgumentException("Wrong pool");
        Page page = pool[h.slot()];
        if (page.incarnation != h.incarnation()) throw new IllegalArgumentException("Stale address");
        return page;
    }

    public synchronized void workerDied() { healthy = false; }
    public synchronized int reserved() { return reserved; }
    public synchronized int refs(Handle h) { return page(h).refs; }
    public synchronized int pins(Handle h) { return page(h).pins; }
    public synchronized boolean cached(Handle h) { return page(h).cached; }
    public synchronized State state(Owner owner) { return generations.get(owner).state; }
    public synchronized Reason reason(Owner owner) { return generations.get(owner).reason; }
    public synchronized int freeOrEvictable() {
        int n = 0;
        for (Page page : pool) if (page.refs == 0 && page.pins == 0) n++;
        return n;
    }
}
