import java.util.*;

class Ch30IndependentProbe {
    static int checks;
    static void check(boolean ok, String label) {
        checks++; if (!ok) throw new AssertionError(label);
    }
    static RagCore.Span span(String doc, int start, int end, String text) {
        return new RagCore.Span("tenant-green", doc, 11, "alpha", start, end, text);
    }
    public static void main(String[] args) {
        var scores = RagCore.rrf(List.of(
            List.of(new RagCore.Hit("sparse-filtered", 99), new RagCore.Hit("both", 8), new RagCore.Hit("both", 2)),
            List.of(new RagCore.Hit("both", 50), new RagCore.Hit("single", 1))), 80);
        check(scores.get(0).qualifiedId().equals("both"), "best original rank within lane");
        check(Math.abs(scores.get(0).score() - (1.0/62 + 1.0/110)) < 1e-12, "duplicates contribute once");
        check(Math.abs(scores.stream().filter(s->s.qualifiedId().equals("sparse-filtered")).findFirst().orElseThrow().score()-1.0/159)<1e-12,
              "authorization filtering preserves original 99");
        List<RagCore.Hit> ids = new ArrayList<>();
        for(int i=100;i>=1;i--) ids.add(new RagCore.Hit(String.format("qualified-%03d",i),i));
        check(RagCore.rrf(List.of(ids), 80).size()==80,"result cap 80");
        var permuted=RagCore.rrf(List.of(List.of(new RagCore.Hit("b",7),new RagCore.Hit("a",7))),80);
        check(permuted.get(0).qualifiedId().equals("a"),"tie by identity");
        // Character-count fixture tests control flow, not production tokenization.
        RagCore.Renderer render = new RagCore.Renderer() {
            public String evidence(List<RagCore.Span> spans) {
                return spans.stream().map(s->"<source>"+s.text()+"</source>").reduce("",String::concat);
            }
            public String prompt(List<RagCore.Span> spans) { return "q".repeat(1024)+evidence(spans); }
        };
        // 8 x 512 raw bytes cannot fit after provenance wrappers.
        List<RagCore.Span> eight=new ArrayList<>();
        for(int i=0;i<8;i++) eight.add(span("doc-"+i,0,512,"x".repeat(512)));
        var packed=RagCore.pack(eight,render,String::length,5632).orElseThrow();
        check(packed.spans().size()==7,"wrapper budget excludes eighth full chunk");
        check(packed.inputTokens()==1024+7*(512+17),"complete serialized prompt counted");
        check(packed.inputTokens()+512<=5632,"output reserve retained");
        var parent=span("parent",0,200,"p".repeat(100));
        var child=span("parent",0,100,"c".repeat(20));
        var disjoint=span("parent",200,300,"d".repeat(20));
        var overlap=RagCore.pack(List.of(parent,child,disjoint),render,String::length,5632).orElseThrow();
        check(overlap.spans().equals(List.of(parent,disjoint)),"higher-ranked parent discards overlapping child, adjacent survives");
        var laterSmall=RagCore.pack(List.of(span("oversize",0,5000,"x".repeat(5000)),span("small",0,1,"a")),render,String::length,5632).orElseThrow();
        check(laterSmall.spans().size()==1 && laterSmall.spans().get(0).doc().equals("small"),"oversize does not prevent later small evidence");
        var exact=RagCore.pack(List.of(span("exact",0,4079,"x".repeat(4079))),render,String::length,5632).orElseThrow();
        check(exact.inputTokens()==5120,"provenance included at exact 4096 evidence boundary");
        check(RagCore.pack(List.of(span("over",0,4080,"x".repeat(4080))),render,String::length,5632).isEmpty(),"one character over serialized evidence rejected");
        check(RagCore.pack(List.of(span("exact",0,4079,"x".repeat(4079))),render,String::length,5631).isEmpty(),"reserve checked against model context");
        check(RagCore.pack(List.of(),render,String::length,5632).isEmpty(),"empty evidence cannot generate");
        System.out.println("{\"passed\":true,\"assertions\":"+checks+",\"tokenizer\":\"character fixture only\"}");
    }
}
