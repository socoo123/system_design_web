import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import D2Block from "./D2Block";

const FOLD_RE = /<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi;

type Piece =
  | { type: "md"; body: string }
  | { type: "fold"; title: string; body: string };

function splitFolds(source: string): Piece[] {
  const pieces: Piece[] = [];
  let last = 0;
  const re = new RegExp(FOLD_RE.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    if (match.index > last) {
      pieces.push({ type: "md", body: source.slice(last, match.index) });
    }
    pieces.push({
      type: "fold",
      title: match[1].trim(),
      body: match[2].trim(),
    });
    last = match.index + match[0].length;
  }
  if (last < source.length) {
    pieces.push({ type: "md", body: source.slice(last) });
  }
  return pieces.length > 0 ? pieces : [{ type: "md", body: source }];
}

function Pre({ children }: { children?: ReactNode }) {
  const child = Children.toArray(children)[0];
  if (isValidElement(child)) {
    const className = String((child.props as { className?: string }).className ?? "");
    const text = String((child.props as { children?: unknown }).children ?? "");
    if (className.includes("language-d2")) {
      return <D2Block chart={text} />;
    }
  }
  return <pre>{children}</pre>;
}

function MarkdownInner({ source }: { source: string }) {
  if (!source.trim()) return null;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      components={{ pre: Pre }}
    >
      {source}
    </ReactMarkdown>
  );
}

export default function MarkdownView({ children }: { children: string }) {
  const pieces = splitFolds(children);

  return (
    <div className="tutorial">
      {pieces.map((piece, i) =>
        piece.type === "fold" ? (
          <details key={i} className="sd-fold group">
            <summary>{piece.title}</summary>
            <div className="sd-fold-body">
              <MarkdownInner source={piece.body} />
            </div>
          </details>
        ) : (
          <MarkdownInner key={i} source={piece.body} />
        ),
      )}
    </div>
  );
}
