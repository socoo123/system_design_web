import { D2 } from "@terrastruct/d2";

const d2 = new D2();
const src = `direction: right
s1: "Step 1"
s2: "Step 2"
s1 -> s2
client: {
  app: "App"
}
gw: {
  lb: "LB"
}
client.app -> gw.lb
`;
const compiled = await d2.compile(src, { layout: "elk" });
const svg = await d2.render(compiled.diagram, { themeID: 0, pad: 16, noXMLTag: true });
console.log("arch svg bytes", svg.length);
const seq = `shape: sequence_diagram
you: "you"
they: "interviewer"
you -> they: "hi"
`;
const c2 = await d2.compile(seq);
const s2 = await d2.render(c2.diagram, { themeID: 200, noXMLTag: true });
console.log("seq svg bytes", s2.length);
