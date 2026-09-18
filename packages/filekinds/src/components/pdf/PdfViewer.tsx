/**
 * The `.pdf` kind — the browser's own viewer (scroll, zoom, search) over the
 * host-configured raw-bytes endpoint. A binary file's text `content` is
 * empty; the PATH is what matters here.
 */
import { Typography } from "@mui/material";
import { rawFileUrlFor } from "../../api";
import type { ViewerProps } from "../../lib/filePreviews";

export default function PdfViewer({ path, agentId, height = "100%" }: ViewerProps) {
  const abs = path ?? agentId ?? "";
  const raw = abs ? rawFileUrlFor(abs, abs) : null;
  if (!raw) {
    return (
      <Typography sx={{ p: 2, fontSize: 12, color: "text.disabled" }}>
        This host has no raw-bytes endpoint configured, so the PDF cannot be shown here.
      </Typography>
    );
  }
  return (
    <iframe
      title="PDF document"
      src={raw}
      style={{ width: "100%", height, minHeight: 420, border: "none", display: "block", background: "#fff" }}
    />
  );
}
