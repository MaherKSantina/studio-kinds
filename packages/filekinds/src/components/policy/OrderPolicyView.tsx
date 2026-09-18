/**
 * The ORDER policy (`role: order`) — stage 2 of the chain, operable:
 *
 *   left   — INPUT: the tag dimensions as playbook-style value pills (the
 *            same `DecisionPills` a playbook renders). Click values to build
 *            a combination.
 *   right  — OUTPUT: the ranking itself, one row per combination in priority
 *            order — the compact all-at-once view of every dimension and
 *            value the order names. No invented names and no special lanes:
 *            a row IS its combination, top to bottom, and an empty-when row
 *            at the bottom takes everything left. Rows touching the selected
 *            values light up and the row the combination actually lands on
 *            is marked.
 *
 * The header reaches one level further down: a button opens the tags policy
 * itself, showing how each value is derived from an item's params.
 */
import { useEffect, useState } from "react";
import { Box, Chip, Dialog, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import RuleIcon from "@mui/icons-material/Rule";
import { DecisionPills, resolveRef, splitRef, useIsMobile } from "crosscut";
import { readVirtualDirectoryFile } from "../../api";
import {
  OrderEntry, OrderPolicyDoc, TagsPolicyDoc, applyOrder, hasCatchAll, parseTagsPolicy,
  refCovers, visibleTags, whenHolds,
} from "../../lib/policyChain";
import TagsPolicyView from "./TagsPolicyView";

/** One combination as chips — "Platform: iOS" per ref, selected refs lit. */
function WhenChips({ when, tags, locks }: {
  when: string[];
  tags: TagsPolicyDoc | null;
  locks: string[];
}) {
  if (!when.length) {
    return <Typography sx={{ fontSize: 13, fontStyle: "italic", color: "text.secondary" }}>anything</Typography>;
  }
  return (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
      {when.map((ref) => {
        const [dk, vk] = splitRef(ref);
        const d = tags?.tags.find((x) => x.key === dk);
        const label = vk.split("|").filter(Boolean)
          .map((v) => d?.values.find((x) => x.key === v)?.label ?? v).join(" or ") || vk;
        const on = locks.some((l) => refCovers(ref, l));
        // A plain span, styled inline: the on-state changes EVERY toggle, and
        // inline style on our own host element survives what MUI's sx-class
        // pipeline sometimes doesn't (stale class on rapid re-renders).
        return (
          <span key={ref}
            style={{ display: "inline-flex", alignItems: "center", height: 17,
                     borderRadius: 9, padding: "0 7px", fontSize: 12, fontWeight: 700,
                     backgroundColor: on ? "#4f46e5" : "#0f172a0d",
                     color: on ? "#fff" : "#64748b", whiteSpace: "nowrap" }}>
            <span style={{ opacity: 0.65, marginRight: 3 }}>{d?.label ?? dk}:</span> {label}
          </span>
        );
      })}
    </Stack>
  );
}

export default function OrderPolicyView({ doc, base, height = "100%" }: {
  doc: OrderPolicyDoc;
  /** Absolute path of THIS order policy — its `tags` ref resolves relative
   *  to it. */
  base: string;
  height?: number | string;
}) {
  const [tags, setTags] = useState<TagsPolicyDoc | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** The combination under construction — `dimension=value` refs. */
  const [locks, setLocks] = useState<string[]>([]);
  const [tagsOpen, setTagsOpen] = useState(false);
  const isMobile = useIsMobile();
  const [pane, setPane] = useState<"input" | "output">("input");

  useEffect(() => {
    let live = true;
    setTags(null); setErr(null); setLocks([]);
    (async () => {
      try {
        if (!doc.tags) { setErr("This order policy names no `tags:` document."); return; }
        const abs = resolveRef(base, doc.tags);
        const d = parseTagsPolicy((await readVirtualDirectoryFile(abs, abs)).content);
        if (live) setTags(d);
      } catch (e: unknown) {
        if (live) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { live = false; };
  }, [doc, base]);

  const verdict = locks.length ? applyOrder(doc, locks) : null;

  const entryRow = (e: OrderEntry, i: number) => {
    const winner = verdict?.index === i;
    /** Candidate rows narrow as answers accumulate: a row lights only when
     *  it accepts EVERY chosen answer (AND) — a value-OR ref accepts any of
     *  its alternatives. */
    const touched = !winner && locks.length > 0
      && locks.every((l) => e.when.some((r) => refCovers(r, l)));
    const satisfied = locks.length > 0 && whenHolds(locks, e.when);
    return (
      <Box key={i}
        sx={{ border: "1px solid",
              borderColor: winner ? "#4f46e5" : touched ? "#4f46e588" : "divider",
              borderRadius: 1.5, px: 1, py: 0.6,
              bgcolor: winner ? "#4f46e50d" : "#fff",
              boxShadow: winner ? "0 0 0 2px #4f46e522" : "none",
              display: "flex", gap: 0.75, alignItems: "center" }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700, flexShrink: 0, width: 18, textAlign: "right",
                          color: "text.disabled" }}>
          {i + 1}
        </Typography>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {e.label && (
            <Typography sx={{ fontSize: 13, fontWeight: 650, mb: 0.25 }}>{e.label}</Typography>
          )}
          <WhenChips when={e.when} tags={tags} locks={locks} />
          {e.detail && (
            <Typography sx={{ fontSize: 12, color: "text.disabled", mt: 0.25 }}>{e.detail}</Typography>
          )}
        </Box>
        {winner && (
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#4f46e5", flexShrink: 0 }}>
            claims it
          </Typography>
        )}
        {!winner && satisfied && (
          <Tooltip title="Your combination satisfies this row too, but a higher entry already claimed it — the order stops at the first match.">
            <Typography sx={{ fontSize: 12, color: "text.disabled", flexShrink: 0 }}>also matches</Typography>
          </Tooltip>
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ height, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ px: 1.5, py: 0.75, borderBottom: "1px solid", borderColor: "divider",
                 display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 650, flex: 1, minWidth: 0,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {doc.title}
          <Typography component="span" sx={{ fontSize: 13, color: "text.secondary", ml: 1 }}>
            order policy — tag combinations ranked, position is priority
          </Typography>
        </Typography>
        {isMobile && (
          <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
            {(["input", "output"] as const).map((p) => (
              <Chip key={p} size="small" clickable label={p === "input" ? "Input" : "Output"}
                onClick={() => setPane(p)}
                sx={{ height: 20, fontSize: 12, fontWeight: 700,
                      bgcolor: pane === p ? "#4f46e5" : "#0f172a0d",
                      color: pane === p ? "#fff" : "text.secondary" }} />
            ))}
          </Stack>
        )}
        <Tooltip title="Open the tags policy — how each value is derived from an item">
          <Chip size="small" clickable icon={<RuleIcon sx={{ fontSize: 13, ml: 0.5 }} />}
            label={isMobile ? undefined : "Tags policy"} onClick={() => setTagsOpen(true)}
            sx={{ height: 20, fontSize: 12, fontWeight: 700, flexShrink: 0,
                  bgcolor: "#4f46e514", color: "#4f46e5",
                  "& .MuiChip-label": isMobile ? { px: 0.25 } : undefined,
                  "&:hover": { bgcolor: "#4f46e526" } }} />
        </Tooltip>
      </Box>

      {err && <Typography sx={{ p: 2, fontSize: 12, color: "error.main" }}>{err}</Typography>}

      <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
        {/* ── INPUT: the tag dimensions, as playbook pills ── */}
        {(!isMobile || pane === "input") && (
          <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "auto", p: 1.5,
                     borderRight: isMobile ? 0 : "1px solid", borderColor: "divider" }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                              textTransform: "uppercase", color: "text.disabled", mb: 0.25 }}>
              Input — tags
            </Typography>
            <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1 }}>
              {tags
                ? <>from <b>{tags.title}</b> — pick values to watch where the combination ranks</>
                : "loading the tags policy…"}
            </Typography>
            {tags && (
              <DecisionPills decisions={visibleTags(tags)} value={locks} onChange={setLocks} size="regular" />
            )}
            {locks.length > 0 && (
              <Chip size="small" label="clear" onClick={() => setLocks([])}
                sx={{ height: 20, fontSize: 12, fontWeight: 700, mt: 1.25, cursor: "pointer",
                      bgcolor: "#0f172a0d", color: "text.secondary" }} />
            )}
          </Box>
        )}

        {/* ── OUTPUT: the ranking — every combination, best first ── */}
        {(!isMobile || pane === "output") && (
          <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "auto", p: 1.5 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                              textTransform: "uppercase", color: "text.disabled", mb: 1 }}>
              Output — the order, best first
            </Typography>
            <Stack spacing={0.5}>
              {doc.order.map(entryRow)}
              {!doc.order.length && (
                <Typography sx={{ fontSize: 13, fontStyle: "italic", color: "text.disabled" }}>
                  No entries — nothing is ranked.
                </Typography>
              )}
              {/* Only without an authored catch-all is there anything left. */}
              {!hasCatchAll(doc) && (
                <Box sx={{ border: "1px dashed",
                           borderColor: verdict?.index === -1 ? "#4f46e5" : "divider",
                           borderRadius: 1.5, px: 1, py: 0.6,
                           display: "flex", gap: 0.75, alignItems: "center" }}>
                  <Typography sx={{ fontSize: 13, fontStyle: "italic", color: "text.secondary", flex: 1 }}>
                    anything left — unranked, parked
                  </Typography>
                  {verdict?.index === -1 && (
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#4f46e5" }}>lands here</Typography>
                  )}
                </Box>
              )}
            </Stack>
          </Box>
        )}
      </Box>

      {/* ── one level further down: the tags policy itself ── */}
      <Dialog open={tagsOpen} onClose={() => setTagsOpen(false)} maxWidth="md" fullWidth
        disablePortal PaperProps={{ sx: { height: "85vh" } }}>
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <Box sx={{ display: "flex", justifyContent: "flex-end", px: 1, pt: 1, flexShrink: 0 }}>
            <IconButton size="small" aria-label="Close" onClick={() => setTagsOpen(false)}>
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            {tags
              ? <TagsPolicyView doc={tags} height="100%" />
              : <Typography sx={{ p: 2, fontSize: 12, color: "text.disabled" }}>
                  {err ?? "Loading the tags policy…"}
                </Typography>}
          </Box>
        </Box>
      </Dialog>
    </Box>
  );
}
