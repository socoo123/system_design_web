import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;
import java.util.random.RandomGenerator;

/** Java 17; pure split function, not a distributed claim service. */
public final class SplitPlan {
    public static final long MAX_CENTS = 1_000_000_000_000L;
    public record Share(int id, long cents) {}

    // BEGIN page:split
    public static List<Share> split(long total, int count, long minimum,
                                    boolean even, RandomGenerator random) {
        if (count < 1 || count > 100 || minimum < 1 ||
            total > MAX_CENTS || total < 1 || minimum > total / count)
            throw new IllegalArgumentException("invalid total/count/minimum");
        var plan = new ArrayList<Share>();
        long money = total;
        for (int left = count; left > 0; left--) {
            long amount;
            if (even) {
                amount = total / count + (count - left < total % count ? 1 : 0);
            } else if (left == 1) {
                amount = money;
            } else {
                long upper = Math.min(2 * money / left,
                                      money - minimum * (left - 1));
                amount = random.nextLong(minimum, upper + 1);
            }
            plan.add(new Share(count - left + 1, amount));
            money -= amount; // money >= minimum * (left - 1)
        }
        if (money != 0 || plan.stream().mapToLong(Share::cents).sum() != total)
            throw new IllegalStateException("non-conserving plan");
        for (int i = plan.size() - 1; i > 0; i--)
            Collections.swap(plan, i, random.nextInt(i + 1));
        return List.copyOf(plan); // persist once; retries must load this plan
    }
    // END page:split

    public static void main(String[] args) {
        int checks = 0;
        for (long minimum : new long[]{1, 2, 17}) {
            for (int count = 1; count <= 100; count++) {
                for (boolean even : new boolean[]{false, true}) {
                    long total = minimum * count + 1003;
                    var p = split(total, count, minimum, even, new Random(26 + count));
                    if (p.size() != count || p.stream().anyMatch(x -> x.cents() < minimum)
                        || p.stream().mapToLong(Share::cents).sum() != total
                        || p.stream().map(Share::id).distinct().count() != count)
                        throw new AssertionError(p);
                    checks++;
                }
            }
        }
        for (boolean even : new boolean[]{false, true}) {
            var p = split(100, 100, 1, even, new Random(1));
            if (p.stream().anyMatch(x -> x.cents() != 1)) throw new AssertionError();
            p = split(MAX_CENTS, 100, 10, even, new Random(1));
            if (p.stream().mapToLong(Share::cents).sum() != MAX_CENTS) throw new AssertionError();
            checks += 2;
        }
        var even = split(1003, 4, 1, true, new Random(1));
        if (even.stream().filter(x -> x.cents() == 251).count() != 3) throw new AssertionError();
        checks++;
        long[][] bad = {{0,1,1},{3,4,1},{9,3,4},{100,0,1},{100,101,1},
                        {100,2,0},{MAX_CENTS+1,1,1},{Long.MAX_VALUE,1,1},
                        {100,2,Long.MAX_VALUE}};
        for (var b : bad) {
            try { split(b[0], (int)b[1], b[2], false, new Random(1)); throw new AssertionError(); }
            catch (IllegalArgumentException expected) { checks++; }
        }
        try { even.add(new Share(5, 1)); throw new AssertionError(); }
        catch (UnsupportedOperationException expected) { checks++; }
        System.out.println("{\"javaVersion\":\"" + System.getProperty("java.version") +
                           "\",\"checks\":" + checks + ",\"passed\":true}");
    }
}
