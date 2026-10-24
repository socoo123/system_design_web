import java.util.*;
import static java.lang.Math.*;

public final class NearbyTest {
    private static int assertions;
    private static void check(boolean ok, String message) {
        assertions++; if (!ok) throw new AssertionError(message);
    }
    private static void unavailable(Runnable action, String message) {
        try { action.run(); throw new AssertionError(message); }
        catch (Nearby.Unavailable expected) { assertions++; }
    }
    private static Nearby.Point destination(Nearby.Point q, double metres, double bearing) {
        double p = toRadians(q.lat()), l = toRadians(q.lon()), a = metres / Nearby.R;
        double t = toRadians(bearing);
        double lat = asin(sin(p) * cos(a) + cos(p) * sin(a) * cos(t));
        double lon = l + atan2(sin(t) * sin(a) * cos(p), cos(a) - sin(p) * sin(lat));
        double deg = ((toDegrees(lon) + 540) % 360) - 180;
        return new Nearby.Point(toDegrees(lat), deg);
    }
    private static Nearby.Row row(long id, long version, Nearby.Point p, boolean mover,
                                  long observed, boolean published, Set<Long> audience) {
        return new Nearby.Row(id, version, p, "shop", false, true, mover, observed, published, audience);
    }
    private static List<Nearby.Hit> rank(List<Nearby.Member> m, Map<Long, Optional<Nearby.Row>> rows,
                                          long now, long error) {
        return Nearby.rank(new Nearby.Point(0, 0), 1000, "shop", 7, m, rows, now, error, 1000);
    }
    public static void main(String[] args) {
        Nearby.Point beijing = new Nearby.Point(40, 116.4);
        Set<Nearby.Cell> local = Nearby.cover(beijing, 1000, 6, 100);
        check(local.size() <= 20 && local.contains(Nearby.cell(beijing, 6)), "local normal cover");
        for (Nearby.Point q : List.of(new Nearby.Point(0, 179.999), new Nearby.Point(0, -179.999),
                new Nearby.Point(89.9999, 45), new Nearby.Point(-89.9999, -120),
                new Nearby.Point(90, 180), new Nearby.Point(-90, -180), new Nearby.Point(0, 0))) {
            int p = abs(q.lat()) > 89 ? 2 : 6;
            Set<Nearby.Cell> cover = Nearby.cover(q, 1000, p, 1000);
            for (int b = 0; b < 360; b++) for (double r : new double[]{0, 500, 1000})
                check(cover.contains(Nearby.cell(destination(q, r, b), p)), "dateline/pole/border " + q + "/" + b);
        }
        unavailable(() -> Nearby.cover(new Nearby.Point(89.9999, 0), 1000, 6, 100), "polar truncation");
        unavailable(() -> Nearby.cover(beijing, 5000, 6, 1), "budget truncation");
        check(Nearby.cell(new Nearby.Point(0, 180), 6).equals(Nearby.cell(new Nearby.Point(0, -180), 6)), "date-line canonicalization");
        Random random = new Random(19);
        for (int i = 0; i < 300; i++) {
            Nearby.Point q = new Nearby.Point(random.nextDouble() * 170 - 85, random.nextDouble() * 360 - 180);
            double radius = new double[]{500, 1000, 2000, 5000}[i % 4];
            int precision = radius == 5000 ? 5 : 6;
            Set<Nearby.Cell> cover = Nearby.cover(q, radius, precision, 10000);
            for (int b = 0; b < 360; b += 5) for (double factor : new double[]{0.1, 0.999999999, 1})
                check(cover.contains(Nearby.cell(destination(q, radius * factor, b), precision)), "sampled spherical circle");
        }
        int bits = 0, x = 0, y = 0;
        String alphabet = "0123456789bcdefghjkmnpqrstuvwxyz";
        for (char c : "wx4g0b".toCharArray()) for (int j = 4; j >= 0; j--) {
            int bit = (alphabet.indexOf(c) >>> j) & 1;
            if ((bits++ & 1) == 0) x = 2 * x + bit; else y = 2 * y + bit;
        }
        check(Nearby.geohash(new Nearby.Cell(x, y - 1, 6)).equals("wx4fbz"), "southern prefix break");
        Nearby.Point center = new Nearby.Point(-90 + (y + 0.5) * 180 / 32768,
                -180 + (x + 0.5) * 360 / 32768);
        check(Nearby.cover(center, 1000, 6, 100).contains(new Nearby.Cell(x, y + 2, 6)), "nine-cell counterexample");
        check(abs(Nearby.distance(new Nearby.Point(0, 179.999), new Nearby.Point(0, -179.999)) - 222.39016) < .001,
                "date-line distance");
        List<Nearby.Member> members = new ArrayList<>();
        Map<Long, Optional<Nearby.Row>> rows = new HashMap<>();
        for (long id = 1; id <= 21; id++) {
            members.add(new Nearby.Member(id, 1));
            rows.put(id, Optional.of(new Nearby.Row(id, 1, new Nearby.Point(0, .001), "shop", false,
                    id == 21, false, 0, true, Set.of())));
        }
        check(rank(members, rows, 100000, 0).get(0).id() == 21, "filter before top K (21st shop)");
        rows.clear(); members.clear();
        rows.put(1L, Optional.of(row(1, 4, new Nearby.Point(0, .001), false, 0, true, Set.of())));
        rows.put(2L, Optional.of(row(2, 2, new Nearby.Point(0, -.001), false, 0, true, Set.of())));
        members.addAll(List.of(new Nearby.Member(2, 1), new Nearby.Member(1, 3), new Nearby.Member(1, 4)));
        List<Nearby.Hit> ranked = rank(members, rows, 100000, 0);
        check(ranked.size() == 2 && ranked.get(0).id() == 1 && ranked.get(0).version() == 4, "dedupe/version/tie id");
        check(!ranked.get(0).equals(ranked.get(1)), "separate output IDs");
        check(rank(List.of(), rows, 100000, 0).isEmpty(), "authority cannot recover an unrecalled ID");
        unavailable(() -> rank(List.of(new Nearby.Member(3, 1)), rows, 100000, 0), "authority error is not absence");
        rows.put(3L, Optional.empty());
        check(rank(List.of(new Nearby.Member(3, 1)), rows, 100000, 0).isEmpty(), "confirmed absence");
        unavailable(() -> rank(List.of(new Nearby.Member(1, 5)), rows, 100000, 0), "stale authority refused");
        rows.put(9L, Optional.of(row(9, 1, new Nearby.Point(0, .002), true, 70000, true, Set.of(7L))));
        List<Nearby.Member> privateMember = List.of(new Nearby.Member(9, 1));
        List<Nearby.Hit> privateHit = rank(privateMember, rows, 100000, 0);
        check(privateHit.size() == 1 && privateHit.get(0).publicPin() == null
                && privateHit.get(0).displayMetres() == 200, "inclusive age and private DTO");
        check(rank(privateMember, rows, 100000, 1).isEmpty(), "clock margin expires sample");
        check(rank(privateMember, rows, 100001, 0).isEmpty(), "send deadline expiry");
        rows.put(9L, Optional.of(row(9, 2, new Nearby.Point(0, .002), true, 100000, true, Set.of())));
        check(rank(privateMember, rows, 100000, 0).isEmpty(), "fresh revoked audience despite old member/public flag");
        rows.put(9L, Optional.of(row(9, 3, new Nearby.Point(0, .02), true, 100000, false, Set.of(7L))));
        check(rank(privateMember, rows, 100000, 0).isEmpty(), "authority moved outside radius");
        rows.put(9L, Optional.of(row(9, 4, new Nearby.Point(0, .001), true, 102001, false, Set.of(7L))));
        check(rank(privateMember, rows, 100000, 2000).isEmpty(), "future sample beyond clock bound");
        rows.put(9L, Optional.of(row(9, 5, new Nearby.Point(0, .001), true, 102000, false, Set.of(7L))));
        check(rank(privateMember, rows, 100000, 2000).size() == 1, "future sample within clock bound");
        List<Nearby.Member> global = new ArrayList<>(); rows.clear();
        for (long id = 1; id <= 40; id++) {
            global.add(new Nearby.Member(id, 1));
            rows.put(id, Optional.of(row(id, 1, new Nearby.Point(0, (41 - id) * .0001), false, 0, true, Set.of())));
        }
        List<Nearby.Hit> top = rank(global, rows, 100000, 0);
        check(top.size() == 20 && top.get(0).id() == 40 && top.get(19).id() == 21, "global sort before limit");
        unavailable(() -> Nearby.rank(new Nearby.Point(0, 0), 1000, "shop", 7, global, rows, 0, 0, 39), "candidate cutoff fails");
        System.out.println("{\"passed\":true,\"assertions\":" + assertions + ",\"sampledCircles\":307}");
    }
}
