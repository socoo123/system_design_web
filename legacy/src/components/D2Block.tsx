import { useEffect, useRef, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { renderD2Svg } from "../lib/d2Render";

function parseErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  return "D2 渲染失败";
}

export default function D2Block({ chart }: { chart: string }) {
  const { theme } = useTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "drawing" | "done">("idle");

  useEffect(() => {
    let cancelled = false;
    const source = chart.trim();
    const wrap = wrapRef.current;
    if (!wrap) return;

    const draw = () => {
      setPhase("drawing");
      setError(null);
      void (async () => {
        try {
          const svg = await renderD2Svg(source, theme);
          if (cancelled || !hostRef.current) return;
          hostRef.current.innerHTML = svg;
          const svgEl = hostRef.current.querySelector("svg");
          if (svgEl) {
            svgEl.style.maxWidth = "100%";
            svgEl.style.width = "auto";
            svgEl.style.height = "auto";
            svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
            svgEl.setAttribute("role", "img");
          }
          setPhase("done");
        } catch (err) {
          if (cancelled) return;
          if (hostRef.current) hostRef.current.innerHTML = "";
          setError(parseErrorMessage(err));
          setPhase("idle");
        }
      })();
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          draw();
        }
      },
      { rootMargin: "480px 0px" },
    );
    io.observe(wrap);

    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [chart, theme]);

  return (
    <div ref={wrapRef} className="d2-wrap my-4">
      {phase === "drawing" && !error && (
        <div className="d2-busy text-xs text-drac-comment">正在绘制架构图…</div>
      )}
      {error && (
        <details className="d2-error-box mb-2">
          <summary className="cursor-pointer text-xs text-drac-comment">
            这张图没画出来（{error}）。点开看源码，不影响读正文。
          </summary>
          <pre className="d2-error my-2 overflow-x-auto">{chart.trim()}</pre>
        </details>
      )}
      <div
        ref={hostRef}
        className={phase === "done" ? "d2-block" : undefined}
      />
    </div>
  );
}
