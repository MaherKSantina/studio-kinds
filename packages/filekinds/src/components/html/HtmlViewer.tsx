/**
 * The `.html` kind — a standalone page rendered AS ITSELF, never as source.
 * The document is the artifact (a CV, an interactive explainer), so it runs
 * in a sandboxed iframe: scripts allowed, the host origin withheld.
 */
import type { ViewerProps } from "../../lib/filePreviews";

export default function HtmlViewer({ content, height = "100%" }: ViewerProps) {
  return (
    <iframe
      title="HTML document"
      srcDoc={content}
      sandbox="allow-scripts allow-popups"
      style={{ width: "100%", height, minHeight: 320, border: "none", display: "block", background: "#fff" }}
    />
  );
}
