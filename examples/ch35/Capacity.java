import java.util.Arrays;

// Java 17. All rates are teaching assumptions for one fixed workload/profile.
public final class Capacity {
    static double surviving(int[] perNode, double admittedPerReplica) {
        int total = Arrays.stream(perNode).sum();
        int largestLoss = Arrays.stream(perNode).max().orElseThrow();
        return (total - largestLoss) * admittedPerReplica;
    }
    static int sameBudgetReplicas(int domains, double peak, double planned) {
        for (int n = 1; ; n++) {
            int largestLoss = (n + domains - 1) / domains;
            if ((n - largestLoss) * planned >= peak) return n;
        }
    }
    public static void main(String[] args) {
        double peak = 20, residence = 8, cap = 4, headroom = 0.8;
        int slots = 32;
        System.out.printf("meanActive=%.0f slotLowerBound=%.0f normal=%.0f%n",
            peak * residence, Math.ceil(peak * residence / slots),
            Math.ceil(peak / (cap * headroom)));
        System.out.printf("nine: rawSurvivor=%.1f plannedSurvivor=%.1f%n",
            surviving(new int[]{3, 3, 3}, cap),
            surviving(new int[]{3, 3, 3}, cap * headroom));
        System.out.printf("same-budget N-1 across 3 nodes: %d%n",
            sameBudgetReplicas(3, peak, cap * headroom));
        if (sameBudgetReplicas(3, peak, 3.2) != 11) throw new AssertionError();
        if (surviving(new int[]{4, 4, 3}, 3.2) < peak) throw new AssertionError();
        if (surviving(new int[]{4, 3, 3}, 3.2) >= peak) throw new AssertionError();
    }
}
