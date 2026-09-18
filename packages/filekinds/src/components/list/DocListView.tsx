/**
 * The `.list` node open: its documents as rows, each opening WHOLE in the
 * content dialog. This node is an entity by itself — streams write into it
 * item by item, and other streams take it as an input stage.
 *
 * TYPED rows: items may carry per-item FIELDS (a classify step's norm_type,
 * actor, …) and REFS edges. Fields render as chips under each row, and every
 * low-cardinality field becomes a selectable DIMENSION — pick one, and the
 * OneDList pills filter the rows by its values. Search runs over labels and
 * field values alike.
 */
import { useEffect, useMemo, useState } from "react";
import { Box, Chip, Dialog, DialogContent, IconButton, Stack, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { EventRow, OneDList } from "crosscut";
import { collateList } from "../../lib/listCollate";
import { parseDocList, type DocListItem } from "../../lib/listDoc";
import { extensionOfPath, type ViewerProps } from "../../lib/filePreviews";
import FileContentDialog from "../points/FileContentDialog";

const MONO = { fontFamily: "ui-monospace, monospace" } as const;

/** A field value that is a link — rendered clickable everywhere it appears. */
const isUrl = (v: string): boolean => /^https?:\/\/\S+$/i.test(v.trim());

/** "https://www.seek.com.au/job/93779214" → "seek.com.au" */
const hostOf = (v: string): string => {
  try { return new URL(v.trim()).hostname.replace(/^www\./, ""); }
  catch { return v.trim(); }
};

/**
 * A row's own fields, links clickable, with an open-the-source button.
 * Shared: the list's row dialog shows it, and so does a policy run's
 * why-dialog — wherever a row is inspected, the ad itself is one click away.
 */
export function RowFieldsBlock({ it }: { it: DocListItem }) {
  const fields = Object.entries(it.fields ?? {}).filter(([, v]) => v.trim());
  const link = fields.find(([, v]) => isUrl(v))?.[1];
  return (
    <>
      <Stack spacing={0.75}>
        {fields.map(([k, v]) => (
          <Box key={k} sx={{ display: "flex", gap: 1, alignItems: "baseline" }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                              letterSpacing: "0.06em", color: "text.disabled", width: 78, flexShrink: 0 }}>
              {k}
            </Typography>
            {isUrl(v) ? (
              <Typography component="a" href={v} target="_blank" rel="noopener noreferrer"
                sx={{ fontSize: 12.5, color: "#4f46e5", wordBreak: "break-all" }}>
                {v}
              </Typography>
            ) : (
              <Typography sx={{ fontSize: 12.5, color: "text.primary" }}>{v}</Typography>
            )}
          </Box>
        ))}
        {!fields.length && (
          <Typography sx={{ fontSize: 12, color: "text.disabled", fontStyle: "italic" }}>
            This row carries no fields.
          </Typography>
        )}
      </Stack>
      {link && (
        <Box component="a" href={link} target="_blank" rel="noopener noreferrer"
          sx={{ mt: 1.75, display: "inline-flex", alignItems: "center", gap: 0.5, px: 1.25, py: 0.6,
                borderRadius: 1.5, bgcolor: "#4f46e5", color: "#fff", fontSize: 12, fontWeight: 700,
                textDecoration: "none", "&:hover": { bgcolor: "#4338ca" } }}>
          <OpenInNewIcon sx={{ fontSize: 14 }} /> Open {hostOf(link)}
        </Box>
      )}
    </>
  );
}

/** Everything a fieldful row knows, in a dialog over the list. */
function RowDetails({ it, index, onClose }: { it: DocListItem | null; index: number; onClose: () => void }) {
  return (
    <Dialog open={!!it} onClose={onClose} maxWidth="sm" fullWidth disablePortal>
      {it && (
        <DialogContent sx={{ p: 2.5 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", mb: 1.25 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 650, flex: 1, minWidth: 0 }}>
              {it.label ?? `Item ${index + 1}`}
            </Typography>
            <IconButton size="small" aria-label="Close" onClick={onClose}>
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Stack>
          <RowFieldsBlock it={it} />
        </DialogContent>
      )}
    </Dialog>
  );
}

/** Field keys worth offering as a filter dimension: present on some rows,
 *  with a repeating, enumerable value set. */
function dimensionCandidates(items: DocListItem[]): string[] {
  const values = new Map<string, Set<string>>();
  let carriers = 0;
  for (const it of items) {
    if (!it.fields) continue;
    carriers++;
    for (const [k, v] of Object.entries(it.fields)) {
      if (!v.trim()) continue;
      if (!values.has(k)) values.set(k, new Set());
      values.get(k)!.add(v);
    }
  }
  if (!carriers) return [];
  return [...values.entries()]
    .filter(([, vs]) => vs.size >= 2 && vs.size <= 12)
    .map(([k]) => k);
}

function FieldChips({ it, skip }: { it: DocListItem; skip?: string | null }) {
  const fields = Object.entries(it.fields ?? {}).filter(([k, v]) => v.trim() && k !== skip);
  const refs = it.refs ?? [];
  if (!fields.length && !refs.length) return null;
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.4, mt: 0.4, px: 1, pb: 0.75 }}>
      {fields.map(([k, v]) => (isUrl(v) ? (
        // A link field opens the real thing — the ad, the doc, the source.
        <Chip key={k} size="small" clickable component="a" href={v} target="_blank" rel="noopener noreferrer"
          title={v}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          icon={<OpenInNewIcon sx={{ fontSize: 13, ml: 0.5 }} />}
          label={<span><Box component="span" sx={{ fontWeight: 700, opacity: 0.65 }}>{k}</Box>{`: ${hostOf(v)}`}</span>}
          sx={{ height: 17, fontSize: 12, bgcolor: "#4f46e514", color: "#4f46e5", cursor: "pointer",
                maxWidth: 340, "& .MuiChip-label": { px: 0.75 },
                "&:hover": { bgcolor: "#4f46e526" } }} />
      ) : (
        <Chip key={k} size="small"
          label={<span><Box component="span" sx={{ fontWeight: 700, opacity: 0.65 }}>{k}</Box>{`: ${v}`}</span>}
          sx={{ height: 20, fontSize: 12, bgcolor: "#0f172a08", color: "text.secondary",
                maxWidth: 340, "& .MuiChip-label": { px: 0.75 } }} />
      )))}
      {refs.map((r, i) => (
        <Chip key={`r${i}`} size="small" label={`${r.kind} → ${r.to}`}
          sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: "#4f46e514", color: "#4f46e5",
                "& .MuiChip-label": { px: 0.75 } }} />
      ))}
    </Box>
  );
}

export default function DocListView({ content, height = "100%", agentId }: ViewerProps) {
  const doc = useMemo(() => parseDocList(content), [content]);
  const [open, setOpen] = useState<{ file: string; label?: string } | null>(null);
  // A row with no document still has everything it knows — its fields open
  // in a details dialog, with any link a click away.
  const [details, setDetails] = useState<{ it: DocListItem; i: number } | null>(null);

  // A list with `sources:` shows the collation; without, its own items.
  const [collated, setCollated] = useState<DocListItem[] | null>(null);
  useEffect(() => {
    if (!doc.sources.length || !agentId) { setCollated(null); return; }
    let live = true;
    setCollated(null);
    collateList(doc, agentId).then((rows) => { if (live) setCollated(rows); });
    return () => { live = false; };
  }, [doc, agentId]);
  const loading = doc.sources.length > 0 && collated === null;
  const items = collated ?? doc.items;

  const candidates = useMemo(() => dimensionCandidates(items), [items]);
  const [dim, setDim] = useState<string | null>(null);
  // First candidate is the default lens the moment the list is typed.
  const active = dim === null ? (candidates[0] ?? null) : (dim === "" ? null : dim);
  // Rows keep their ORIGINAL numbering through any filter.
  const indexed = useMemo(() => items.map((it, i) => ({ it, i })), [items]);

  const row = (it: DocListItem, i: number) => (
    <EventRow
      label={it.label ?? it.file ?? `Item ${i + 1}`}
      leading={<span style={{ fontSize: 12, fontWeight: 700, width: 18, display: "inline-block", textAlign: "right" }} className="text-muted-foreground">{i}.</span>}
      badge={it.file ? (
        <Chip size="small" label={extensionOfPath(it.file) || "file"}
              sx={{ height: 20, fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                    bgcolor: "#0f172a0d", color: "text.secondary" }} />
      ) : undefined}
      subtitle={
        <>
          {it.file && <Typography component="span" sx={{ fontSize: 12, ...MONO, color: "text.disabled" }}>{it.file}</Typography>}
          <FieldChips it={it} skip={active} />
        </>
      }
      open={false}
      onToggle={
        it.file ? () => setOpen({ file: it.file!, label: it.label })
          : it.fields && Object.keys(it.fields).length ? () => setDetails({ it, i })
            : undefined
      }
    />
  );

  return (
    <Box sx={{ height, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Box sx={{ px: 1.5, py: 0.75, borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {doc.title}
          {doc.sources.length > 0 && (
            <Typography component="span" sx={{ fontSize: 12, color: "#4f46e5", ml: 0.75, fontWeight: 700 }}>
              collated from {doc.sources.length} list{doc.sources.length === 1 ? "" : "s"}
              {loading ? " — reading…" : ` · ${items.length} rows`}
            </Typography>
          )}
        </Typography>
        {candidates.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.6, alignItems: "center" }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "text.disabled" }}>
              filter by
            </Typography>
            {candidates.map((k) => (
              <Chip key={k} size="small" clickable label={k}
                onClick={() => setDim(active === k ? "" : k)}
                sx={{ height: 20, fontSize: 12, fontWeight: 700,
                      bgcolor: active === k ? "#4f46e51f" : "#0f172a08",
                      color: active === k ? "#4f46e5" : "text.secondary",
                      border: "1px solid", borderColor: active === k ? "#4f46e555" : "transparent" }} />
            ))}
          </Box>
        )}
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 1.25 }}>
        <OneDList
          items={indexed}
          keyOf={(p) => String(p.i)}
          dimension={active ? { of: (p: { it: DocListItem; i: number }) => p.it.fields?.[active] ?? "", fallback: "—" } : undefined}
          mode="filter"
          search={(p: { it: DocListItem; i: number }) =>
            `${p.it.label ?? ""} ${p.it.file ?? ""} ${Object.values(p.it.fields ?? {}).join(" ")} ${(p.it.refs ?? []).map((r) => `${r.kind} ${r.to}`).join(" ")}`}
          searchPlaceholder="Search rows and fields"
          renderItem={(p) => row(p.it, p.i)}
          empty={
            <Typography sx={{ fontSize: 13, color: "text.disabled", fontStyle: "italic" }}>
              Empty — streams save documents into this node one by one.
            </Typography>
          }
        />
      </Box>
      {agentId && (
        <FileContentDialog base={agentId} file={open?.file ?? null} label={open?.label}
          open={!!open} onClose={() => setOpen(null)} />
      )}
      <RowDetails it={details?.it ?? null} index={details?.i ?? 0} onClose={() => setDetails(null)} />
    </Box>
  );
}
