class InitialProbe {
 public static void main(String[] args) {
  var fresh = new LoadBalancing.Gate(2, 1, () -> 100L);
  fresh.ready(2);
  fresh.beginDrain(7, 1000); // delayed revision-7 command intended for incarnation 1
  System.out.println("newIncarnationRejectsCurrentWork=" + (fresh.tryAdmit(2, 500) == null));
 }
}