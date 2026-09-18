/**
 * Full-content preview of one literature / distillation file, as a dialog over
 * whatever opened it. Literature is mostly PDF, DOCX and markdown, and each is
 * shown WHOLE, by what it is:
 *
 *   pdf   → the browser's own viewer over /fs/raw (scroll, zoom, search)
 *   docx  → mammoth converts the bytes to HTML client-side
 *   else  → the registry kind's renderer (markdown, briefs, …), or plain text
 *
 * The bytes come from the host-configured rawFileUrl (see api.ts); text comes
 * through the same reader every viewer uses.
 */
import { useEffect, useState } from "react";
import { Box, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import { Dialog, DialogContent, DialogDescription, DialogTitle, isStructuredName, resolveRef } from "crosscut";
import { rawFileUrlFor, readVirtualDirectoryFile } from "../../api";
import { extensionOfPath, previewForPath } from "../../lib/filePreviews";
import { SplitNodeView } from "../SplitNodeView";

const MONO = { fontFamily: "ui-monospace, monospace" } as const;

function DocxBody({ url }: { url: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setHtml(null); setErr(null);
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`${r.status} fetching the document`); return r.arrayBuffer(); })
      .then((buf) => import("mammoth").then((m) => m.convertToHtml({ arrayBuffer: buf })))
      .then((r) => { if (live) setHtml(r.value); })
      .catch((e: unknown) => { if (live) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [url]);
  if (err) return <Typography sx={{ p: 3, fontSize: 12.5, color: "#dc2626" }}>{err}</Typography>;
  if (html === null) return <Box sx={{ p: 4, textAlign: "center" }}><CircularProgress size={20} /></Box>;
  return (
    <Box sx={{ maxWidth: 760, mx: "auto", px: 4, py: 3,
               "& p": { fontSize: 13.5, lineHeight: 1.65, my: 1 },
               "& h1": { fontSize: 20, fontWeight: 700, mt: 2.5, mb: 1 },
               "& h2": { fontSize: 16.5, fontWeight: 700, mt: 2, mb: 0.75 },
               "& h3": { fontSize: 14, fontWeight: 700, mt: 1.5, mb: 0.5 },
               "& ul, & ol": { pl: 3, my: 1, fontSize: 13.5, lineHeight: 1.6 },
               "& table": { borderCollapse: "collapse", "& td, & th": { border: "1px solid #e2e5eb", px: 1, py: 0.5, fontSize: 12.5 } } }}
         dangerouslySetInnerHTML={{ __html: html }} />
  );
}

function TextBody({ base, file, onDrill }: {
  base: string;
  file: string;
  onDrill?: (pane: { key: string; title: string; render: () => React.ReactNode }) => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setContent(null); setErr(null);
    readVirtualDirectoryFile(base, file).then(
      (r) => { if (live) setContent(r.content); },
      (e: unknown) => { if (live) setErr(e instanceof Error ? e.message : String(e)); },
    );
    return () => { live = false; };
  }, [base, file]);
  if (err) return <Typography sx={{ p: 3, fontSize: 12.5, color: "#dc2626" }}>{err}</Typography>;
  if (content === null) return <Box sx={{ p: 4, textAlign: "center" }}><CircularProgress size={20} /></Box>;
  const kind = previewForPath(file);
  // The rendered document's OWN absolute path is the base for ITS refs —
  // anchoring at the opener's base sends doc-relative refs into the wrong
  // directory (a stream opened from a project resolved under /projects/).
  const abs = resolveRef(base, file);
  if (kind) return <kind.Renderer content={content} height="100%" agentId={abs} path={abs} onDrill={onDrill} />;
  return <Box component="pre" sx={{ fontSize: 12, p: 3, m: 0, whiteSpace: "pre-wrap" }}>{content}</Box>;
}

/** The per-format content body — the dialog uses it, and a single-item stage
 *  renders it INLINE (the pane is the document; no dialog needed). */
export function FileContentBody({ base, file, onDrill }: {
  base: string;
  file: string;
  /** Inline hosts (a lone-item stage on a PaneTrail) pass this so the
   *  document's own drill-downs push panes instead of squeezing into a
   *  side-by-side layout that has no width to give. */
  onDrill?: (pane: { key: string; title: string; render: () => React.ReactNode }) => void;
}) {
  // A structured `*.node` ref opens as ITSELF — the split node view (a
  // compact composite board for domain-style nodes) — never as a text read,
  // which would fail on a folder.
  if (isStructuredName(file)) {
    return <SplitNodeView path={resolveRef(base, file)} />;
  }
  const ext = extensionOfPath(file);
  const raw = rawFileUrlFor(base, file);
  if (ext === "pdf") {
    return raw
      ? <iframe title={file} src={raw} style={{ width: "100%", height: "100%", border: 0 }} />
      : <Typography sx={{ p: 3, fontSize: 12.5, color: "#b45309" }}>
          This host has no raw-bytes endpoint configured, so a PDF cannot be shown here.
        </Typography>;
  }
  if (ext === "docx" || ext === "doc") {
    return raw
      ? <DocxBody url={raw} />
      : <Typography sx={{ p: 3, fontSize: 12.5, color: "#b45309" }}>
          This host has no raw-bytes endpoint configured, so a Word document cannot be shown here.
        </Typography>;
  }
  return <TextBody base={base} file={file} onDrill={onDrill} />;
}

export default function FileContentDialog({ base, file, label, open, onClose, subtitle }: {
  /** Absolute path of the referencing document (the refs' base). */
  base: string;
  /** The literature file, as written in the store (doc-relative or absolute). */
  file: string | null;
  label?: string;
  open: boolean;
  onClose: () => void;
  /** Extra chip content next to the name (e.g. the reverse index). */
  subtitle?: React.ReactNode;
}) {
  if (!file) return null;
  const ext = extensionOfPath(file);
  const raw = rawFileUrlFor(base, file);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex h-[88dvh] flex-col gap-0 p-0 sm:max-w-[80vw]" showCloseButton>
        <DialogTitle className="sr-only">{label ?? file}</DialogTitle>
        <DialogDescription className="sr-only">Full content of {file}</DialogDescription>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", px: 2, py: 1.25,
                 borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 650 }}>{label ?? file}</Typography>
          <Chip size="small" label={ext || "file"}
                sx={{ height: 20, fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                      bgcolor: "#0f172a12", color: "text.secondary" }} />
          {subtitle}
          <Box sx={{ flex: 1 }} />
          <Typography sx={{ fontSize: 12, ...MONO, color: "text.disabled", pr: 3 }}>{file}</Typography>
        </Stack>
        <Box sx={{ flex: 1, minHeight: 0, overflow: ext === "pdf" ? "hidden" : "auto", bgcolor: "#fff" }}>
          <FileContentBody base={base} file={file} />
        </Box>
      </DialogContent>
    </Dialog>
  );
}
