/**
 * The frame a page renders in — a `.page` open, and a `.views` page view. It
 * is sandboxed (scripts and popups allowed, the host's origin withheld — the
 * frame an `.html` file opens in) and handed Nunjucks, the template, the
 * partials and the model; a template can reach JavaScript, so it runs where
 * JavaScript cannot reach the Studio. The frame says whether it rendered: when
 * it did not, the engine's message shows in its place until a text renders.
 */
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { CircleAlert } from "lucide-react";
import engineSource from "nunjucks/browser/nunjucks.min.js?raw";
import { pageError, pageFrame, type PageRender } from "../../lib/pageDoc";

/** Nunjucks' browser build as a script the frame loads — a data URL, so no text of it is parsed as markup. */
const ENGINE = `data:text/javascript;charset=utf-8,${encodeURIComponent(engineSource)}`;

let frames = 0;

export function PageFrame({ page, title, height = "100%" }: { page: PageRender; title: string; height?: number | string }) {
  const { token, srcDoc } = useMemo(() => {
    const token = `page-${++frames}`;
    return { token, srcDoc: pageFrame(page, ENGINE, token) };
  }, [page]);
  const frame = useRef<HTMLIFrameElement>(null);
  /** The last word from the current frame, kept while the next text renders: an error stays up until one renders. */
  const [error, setError] = useState<string | null>(null);

  // Layout effects run as the frame is committed, before any of its tasks can: no word is missed.
  const current = useRef(token);
  useLayoutEffect(() => { current.current = token; }, [token]);
  useLayoutEffect(() => {
    const heard = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const said = e.data as { studioPage?: unknown; error?: unknown } | null;
      if (!said || said.studioPage !== current.current) return;
      setError(typeof said.error === "string" ? pageError(said.error) : null);
    };
    window.addEventListener("message", heard);
    return () => window.removeEventListener("message", heard);
  }, []);

  return (
    <div style={{ height }} className="flex min-h-0 flex-col bg-background text-foreground">
      {error !== null && (
        <div className="m-4 space-y-2 rounded-lg border border-red-300 bg-red-50/50 px-3 py-2">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold">
            <CircleAlert className="size-3.5 text-red-600" /> The page did not render
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded border bg-background p-2 font-mono text-[13px] leading-4 text-red-700">{error}</pre>
        </div>
      )}
      <iframe
        ref={frame}
        title={title}
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-popups"
        style={{ flex: 1, width: "100%", minHeight: 320, border: "none", display: error !== null ? "none" : "block", background: "#fff" }}
      />
    </div>
  );
}
