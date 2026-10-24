final class Ch27LocationReview {
    private static int checks;
    private static void expect(String name, boolean expected, long now,
                               LocationGate.Point p, boolean bounded) {
        if (LocationGate.fresh(now,p,bounded)!=expected) throw new AssertionError(name);
        checks++;
    }
    public static void main(String[] args) {
        expect("normal",true,100000,new LocationGate.Point(100000,5,31,121),true);
        expect("old equality",true,100000,new LocationGate.Point(75000,50,31,121),true);
        expect("old one millisecond",false,100000,new LocationGate.Point(74999,5,31,121),true);
        expect("future equality",true,100000,new LocationGate.Point(105000,5,31,121),true);
        expect("future one millisecond",false,100000,new LocationGate.Point(105001,5,31,121),true);
        expect("unknown clock",false,100000,new LocationGate.Point(100000,5,31,121),false);
        expect("no point",false,100000,null,true);
        expect("negative now",false,-1,new LocationGate.Point(0,5,31,121),true);
        expect("negative capture",false,100000,new LocationGate.Point(-1,5,31,121),true);
        expect("negative accuracy",false,100000,new LocationGate.Point(100000,-.01,31,121),true);
        expect("accuracy over limit",false,100000,new LocationGate.Point(100000,50.01,31,121),true);
        expect("zero accuracy",true,100000,new LocationGate.Point(100000,0,31,121),true);
        expect("accuracy NaN",false,100000,new LocationGate.Point(100000,Double.NaN,31,121),true);
        expect("accuracy infinity",false,100000,new LocationGate.Point(100000,Double.POSITIVE_INFINITY,31,121),true);
        expect("latitude NaN",false,100000,new LocationGate.Point(100000,5,Double.NaN,121),true);
        expect("longitude infinity",false,100000,new LocationGate.Point(100000,5,31,Double.NEGATIVE_INFINITY),true);
        expect("positive coordinate edges",true,100000,new LocationGate.Point(100000,5,90,180),true);
        expect("negative coordinate edges",true,100000,new LocationGate.Point(100000,5,-90,-180),true);
        expect("latitude over edge",false,100000,new LocationGate.Point(100000,5,90.01,121),true);
        expect("longitude over edge",false,100000,new LocationGate.Point(100000,5,31,-180.01),true);
        expect("large signed time",true,Long.MAX_VALUE,new LocationGate.Point(Long.MAX_VALUE,5,31,121),true);
        expect("huge stale interval",false,Long.MAX_VALUE,new LocationGate.Point(0,5,31,121),true);
        expect("large future interval",false,0,new LocationGate.Point(Long.MAX_VALUE,5,31,121),true);
        System.out.println("LocationReview checks="+checks);
    }
}
