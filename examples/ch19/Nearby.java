import java.util.*;

/** Java 17 teaching core. Storage, authentication and clock bounds are adapter contracts. */
public final class Nearby {
    public static final double R = 6_371_008.8; // Chosen spherical model, metres.
    public record Point(double lat, double lon) {
        public Point {
            if (!Double.isFinite(lat) || !Double.isFinite(lon) || lat < -90 || lat > 90
                    || lon < -180 || lon > 180) throw new IllegalArgumentException("point");
            lon = lon == 180 ? -180 : lon;
        }
    }
    public record Cell(int x, int y, int precision) { }
    public record Span(double lo, double hi) { }
    public record Member(long id, long version) { }
    public record Row(long id, long version, Point point, String type, boolean deleted,
                      boolean open, boolean mover, long observedAt, boolean published,
                      Set<Long> audience) {
        public Row { audience = Set.copyOf(audience); }
    }
    public record Hit(long id, long version, double displayMetres, Point publicPin) { }
    private record Ranked(Row row, double metres) { }
    public static final class Unavailable extends RuntimeException {
        public Unavailable(String why) { super(why); }
    }

    // BEGIN PAGE cover
    public static Set<Cell> cover(Point q, double radius, int precision, int maxCells) {
        if (!Set.of(500d, 1000d, 2000d, 5000d).contains(radius)
                || precision < 1 || precision > 6 || maxCells < 1)
            throw new IllegalArgumentException("radius / precision / budget");
        int bits = 5 * precision, nx = 1 << ((bits + 1) / 2), ny = 1 << (bits / 2);
        double phi = Math.toRadians(q.lat), lambda = q.lon;
        double angular = radius / R + 1e-12; // Outward rounding guard (~6 micrometres).
        double south = Math.max(-90, Math.toDegrees(phi - angular));
        double north = Math.min(90, Math.toDegrees(phi + angular));
        List<Span> longitude = new ArrayList<>();
        if (Math.abs(phi) + angular >= Math.PI / 2) {
            longitude.add(new Span(-180, 180)); // A cap touching a pole needs all longitudes.
        } else {
            double dl = Math.toDegrees(Math.asin(Math.min(1, Math.sin(angular) / Math.cos(phi))));
            double lo = lambda - dl, hi = lambda + dl;
            if (lo < -180) {
                longitude.add(new Span(lo + 360, 180));
                longitude.add(new Span(-180, hi));
            } else if (hi > 180) {
                longitude.add(new Span(lo, 180));
                longitude.add(new Span(-180, hi - 360));
            } else longitude.add(new Span(lo, hi));
        }
        Set<Cell> cells = new HashSet<>();
        for (Span span : longitude)
            addClosedBox(cells, span, south, north, nx, ny, precision, maxCells);
        return Set.copyOf(cells); // Budget failures throw; never return a truncated cover.
    }
    // END PAGE cover

    private static void addClosedBox(Set<Cell> out, Span lon, double south, double north,
                                     int nx, int ny, int precision, int budget) {
        int x0 = bin(lon.lo, -180, 360, nx), x1 = bin(lon.hi, -180, 360, nx);
        int y0 = bin(south, -90, 180, ny), y1 = bin(north, -90, 180, ny);
        if ((long) (x1 - x0 + 1) * (y1 - y0 + 1) > budget)
            throw new Unavailable("cover exceeds work budget; choose coarser routing or reject");
        for (int x = x0; x <= x1; x++) for (int y = y0; y <= y1; y++) {
            out.add(new Cell(x, y, precision));
            if (out.size() > budget) throw new Unavailable("cover exceeds work budget");
        }
    }
    private static int bin(double value, double origin, double span, int n) {
        return Math.max(0, Math.min(n - 1, (int) Math.floor((value - origin) / span * n)));
    }
    public static Cell cell(Point p, int precision) {
        int bits = 5 * precision;
        return new Cell(bin(p.lon, -180, 360, 1 << ((bits + 1) / 2)),
                bin(p.lat, -90, 180, 1 << (bits / 2)), precision);
    }
    public static String geohash(Cell cell) {
        String alphabet = "0123456789bcdefghjkmnpqrstuvwxyz";
        int bits = cell.precision * 5, lonBits = (bits + 1) / 2, latBits = bits / 2;
        StringBuilder result = new StringBuilder();
        int value = 0;
        for (int i = 0; i < bits; i++) {
            int bit = (i % 2 == 0) ? ((cell.x >>> --lonBits) & 1) : ((cell.y >>> --latBits) & 1);
            value = (value << 1) | bit;
            if (i % 5 == 4) { result.append(alphabet.charAt(value)); value = 0; }
        }
        return result.toString();
    }
    public static double distance(Point a, Point b) {
        double p = Math.toRadians(a.lat), q = Math.toRadians(b.lat);
        double dlat = q - p, dlon = Math.toRadians(b.lon - a.lon);
        double h = Math.pow(Math.sin(dlat / 2), 2)
                + Math.cos(p) * Math.cos(q) * Math.pow(Math.sin(dlon / 2), 2);
        return 2 * R * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
    }

    // BEGIN PAGE rank
    public static List<Hit> rank(Point query, double radius, String type, long viewer,
            Collection<Member> members, Map<Long, Optional<Row>> authority,
            long sendBy, long clockError, int maxCandidates) {
        if (clockError < 0 || maxCandidates < 1 || !Set.of(500d, 1000d, 2000d, 5000d).contains(radius))
            throw new IllegalArgumentException("policy");
        if (members.size() > maxCandidates) throw new Unavailable("candidate budget");
        Map<Long, Long> recalled = new HashMap<>();
        for (Member m : members) recalled.merge(m.id, m.version, Math::max);
        List<Ranked> eligible = new ArrayList<>();
        for (var entry : recalled.entrySet()) {
            Optional<Row> value = authority.get(entry.getKey());
            if (value == null) throw new Unavailable("authority missing, not confirmed absent");
            if (value.isEmpty()) continue; // Confirmed absent in the authoritative snapshot.
            Row row = value.get();
            if (row.id != entry.getKey() || row.version < entry.getValue())
                throw new Unavailable("authority behind candidate");
            if (row.deleted || !row.open || !row.type.equals(type)) continue;
            if ((!row.published || row.mover) && !row.audience.contains(viewer)) continue;
            if (row.mover) {
                double ageUpper = (double) sendBy - row.observedAt + clockError;
                if (ageUpper < 0 || ageUpper > 30_000) continue;
            }
            double metres = distance(query, row.point); // Latest permitted coordinates first.
            if (metres <= radius) eligible.add(new Ranked(row, metres));
        }
        eligible.sort(Comparator.comparingDouble(Ranked::metres).thenComparingLong(r -> r.row.id));
        return eligible.stream().limit(20).map(r -> new Hit(r.row.id, r.row.version,
                r.row.mover ? Math.floor(r.metres / 100) * 100 : r.metres,
                r.row.mover ? null : r.row.point)).toList(); // Never serialize private coordinates.
    }
    // END PAGE rank
}
