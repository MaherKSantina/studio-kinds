/**
 * THE STREAM, for one point — the view orthogonal to whatever document
 * projected it. Reads bottom-up: the instance's filled values, the definition
 * whose slots they fill, every key's citations back through the distillation
 * files into the literature, and the sibling instances that manifest the same
 * definition elsewhere.
 *
 * Rendered inside a PaneTrail drill from a playbook event, and as the detail
 * pane of the `.points` viewer — one component, both hosts.
 */
import { useEffect, useState } from "react";
import { Box, Chip, Stack, Tooltip, Typography } from "@mui/material";
import { resolveRef } from "crosscut";
import {
  Citation, Point, PointTarget, PointsDoc, definitionOf, emptySlots, instancesOf, roleOf, strayKeys,
} from "../../lib/pointsDoc";
import { readVirtualDirectoryFile } from "../../api";
import { parsePlaybook, type PlaybookDoc } from "../../lib/playbookDoc";
import { itemAt, parseDocList } from "../../lib/listDoc";
import FileContentDialog, { FileContentBody } from "./FileContentDialog";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import { InlineFile } from "../../lib/AnnotationContent";
import ElementView from "../playbook/ElementView";

const MONO = { fontFamily: "ui-monospace, monospace" } as const;
const AMBER = "#b45309";

export function TypeChip({ type }: { type?: string }) {
  if (!type) {
    return (
      <Tooltip title="Identity before shape — it exists; nobody has typed it yet">
        <Chip size="small" label="untyped" sx={{ height: 20, fontSize: 12, color: "text.disabled", bgcolor: "#0f172a0a", fontStyle: "italic" }} />
      </Tooltip>
    );
  }
  return <Chip size="small" label={type} sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: "#0f172a12", color: "text.secondary" }} />;
}

export function RoleChip({ doc, p }: { doc: PointsDoc; p: Point }) {
  const r = roleOf(p);
  if (r.role === "point") return null;
  const label = r.alsoInstance ? "definition · instance" : r.role;
  const tip = r.role === "definition"
    ? (r.alsoInstance
        ? "Declares slots for its own instances AND manifests a higher definition — a shape that shifted up a level"
        : `Declares ${p.defines?.length ?? 0} empty slot(s) its instances fill`)
    : `Manifests ${definitionOf(doc, p)?.label ?? p.of} — its keys fill that definition's slots`;
  return (
    <Tooltip title={tip}>
      <Chip size="small" label={label}
            sx={{ height: 20, fontSize: 12, fontWeight: 700,
                  bgcolor: r.role === "definition" ? "#0e74901a" : "#7c3aed1a",
                  color: r.role === "definition" ? "#0e7490" : "#7c3aed" }} />
    </Tooltip>
  );
}

function CitationRow({ c, kind, onOpenFile }: { c: Citation; kind: "from" | "via"; onOpenFile?: (file: string) => void }) {
  return (
    <Box sx={{ pl: 1, py: 0.25, borderLeft: "2px solid", borderColor: kind === "from" ? "#0e749066" : "#c3c9d2" }}>
      <Stack direction="row" spacing={0.6} sx={{ alignItems: "baseline" }}>
        <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "text.disabled" }}>
          {kind === "from" ? "from" : "via"}
        </Typography>
        <Typography onClick={onOpenFile ? () => onOpenFile(c.file) : undefined}
                    sx={{ fontSize: 12, ...MONO, color: "text.secondary",
                          ...(onOpenFile ? { cursor: "pointer", textDecoration: "underline", textDecorationColor: "#c3c9d2" } : {}) }}>
          {c.label ?? c.file}
        </Typography>
      </Stack>
      {c.quote && (
        <Typography sx={{ fontSize: 13, fontStyle: "italic", color: "text.secondary", mt: 0.1 }}>
          “{c.quote}”
        </Typography>
      )}
    </Box>
  );
}

export function KeyRows({ p, onOpenFile }: { p: Point; onOpenFile?: (file: string) => void }) {
  if (!p.keys.length) {
    return (
      <Typography sx={{ fontSize: 13, color: "text.disabled", fontStyle: "italic" }}>
        No keys yet — the point exists; its shape is still unknown.
      </Typography>
    );
  }
  return (
    <Stack spacing={0.75}>
      {p.keys.map((k) => (
        <Box key={k.key}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "baseline" }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, ...MONO, color: "text.secondary", flexShrink: 0 }}>
              {k.key}
            </Typography>
            <Typography sx={{ fontSize: 13 }}>{k.value ?? <em style={{ color: "#9ca3af" }}>unset</em>}</Typography>
          </Stack>
          {(k.from ?? []).map((c, i) => <CitationRow key={`f${i}`} c={c} kind="from" onOpenFile={onOpenFile} />)}
          {(k.via ?? []).map((c, i) => <CitationRow key={`v${i}`} c={c} kind="via" onOpenFile={onOpenFile} />)}
        </Box>
      ))}
    </Stack>
  );
}

/** The node a targeted point IS — rendered here, in the stream, as the SAME
 *  reference the policy shows: the element view for a decision or event, the
 *  file itself for content. One entity, two places it can be opened from. */
function TargetNode({ base, target }: { base: string; target: PointTarget }) {
  const abs = resolveRef(base, target.file);
  const [full, setFull] = useState(false);
  const [doc, setDoc] = useState<PlaybookDoc | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const wantsElement = !!target.element;
  useEffect(() => {
    if (!wantsElement) return;
    let live = true;
    setDoc(null); setErr(null);
    readVirtualDirectoryFile(abs, abs).then(
      (r) => { if (live) setDoc(parsePlaybook(r.content)); },
      (e: unknown) => { if (live) setErr(e instanceof Error ? e.message : String(e)); },
    );
    return () => { live = false; };
  }, [abs, wantsElement]);

  const header = (
    <Stack direction="row" spacing={0.6} sx={{ alignItems: "center", mb: 0.5 }}>
      <Chip size="small" label="same reference"
            sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: "#4f46e514", color: "#4f46e5",
                  border: "1px solid", borderColor: "#4f46e555" }} />
      <Typography sx={{ fontSize: 12, ...MONO, color: "text.disabled" }}>
        {target.file}{target.element ? ` · ${target.element}` : ""}
      </Typography>
    </Stack>
  );

  if (!wantsElement) {
    return (
      <Box>
        {header}
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", px: 1.25, py: 0.5,
                   borderBottom: "1px solid", borderColor: "divider", bgcolor: "#f8f9fb" }}>
            <Typography sx={{ fontSize: 13, fontWeight: 650, flex: 1, minWidth: 0 }} noWrap>{target.file}</Typography>
            <Tooltip title="Open properly, full size">
              <Box component="button" onClick={() => setFull(true)}
                   sx={{ display: "inline-flex", p: 0.4, border: "none", bgcolor: "transparent",
                         cursor: "pointer", color: "#4f46e5", borderRadius: 1, "&:hover": { bgcolor: "#4f46e514" } }}>
                <OpenInFullIcon sx={{ fontSize: 14 }} />
              </Box>
            </Tooltip>
          </Stack>
          <Box sx={{ maxHeight: 420, overflow: "auto", bgcolor: "#fff" }}>
            <FileContentBody base={base} file={target.file} />
          </Box>
        </Box>
        <FileContentDialog base={base} file={full ? target.file : null} open={full} onClose={() => setFull(false)} />
      </Box>
    );
  }
  const [kind, key] = (target.element ?? "").split(":");
  if (kind === "item") {
    // A LIST-NODE item: "item:0" … "item:last". The stream saved this
    // document into the shared list at that position; show the document.
    return (
      <Box>
        {header}
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
          <ListItemTarget listAbs={abs} spec={key} />
        </Box>
      </Box>
    );
  }
  return (
    <Box>
      {header}
      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
        {err ? <Typography sx={{ p: 2, fontSize: 13, color: "#dc2626" }}>{err}</Typography>
          : doc === null ? <Typography sx={{ p: 2, fontSize: 13, color: "text.disabled" }}>Loading…</Typography>
            : kind === "decision" || kind === "event"
              ? <ElementView doc={doc} kind={kind} elKey={key} base={abs} />
              : <Typography sx={{ p: 2, fontSize: 13, color: "#b45309" }}>Unknown element “{target.element}”.</Typography>}
      </Box>
    </Box>
  );
}

/** One saved position of a list node — the document at that index, whole. */
function ListItemTarget({ listAbs, spec }: { listAbs: string; spec: string }) {
  const [state, setState] = useState<{ file?: string; label?: string; index: number } | "missing" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    let live = true;
    setState(null); setErr(null);
    readVirtualDirectoryFile(listAbs, listAbs).then(
      (r) => {
        if (!live) return;
        const hit = itemAt(parseDocList(r.content), spec);
        setState(hit ? { ...hit.item, index: hit.index } : "missing");
      },
      (e: unknown) => { if (live) setErr(e instanceof Error ? e.message : String(e)); },
    );
    return () => { live = false; };
  }, [listAbs, spec]);
  if (err) return <Typography sx={{ p: 2, fontSize: 13, color: "#dc2626" }}>{err}</Typography>;
  if (state === null) return <Typography sx={{ p: 2, fontSize: 13, color: "text.disabled" }}>Loading…</Typography>;
  if (state === "missing") {
    return <Typography sx={{ p: 2, fontSize: 13, color: AMBER }}>No item “{spec}” in the list yet — the save has not landed.</Typography>;
  }
  return (
    <Box>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", px: 1.25, py: 0.6,
               borderBottom: "1px solid", borderColor: "divider", bgcolor: "#f8f9fb" }}>
        <Typography sx={{ fontSize: 12, fontWeight: 700, ...MONO, color: "text.secondary" }}>item {spec} → {state.index}</Typography>
        <Typography sx={{ fontSize: 13, fontWeight: 650 }}>{state.label ?? state.file}</Typography>
        <Box sx={{ flex: 1 }} />
        {state.file && <Typography sx={{ fontSize: 12, ...MONO, color: "text.disabled" }}>{state.file}</Typography>}
        {state.file && (
          <Tooltip title="Open properly, full size">
            <Box component="button" onClick={() => setFull(true)}
                 sx={{ display: "inline-flex", p: 0.4, border: "none", bgcolor: "transparent",
                       cursor: "pointer", color: "#4f46e5", borderRadius: 1, "&:hover": { bgcolor: "#4f46e514" } }}>
              <OpenInFullIcon sx={{ fontSize: 14 }} />
            </Box>
          </Tooltip>
        )}
      </Stack>
      {state.file
        ? <Box sx={{ maxHeight: 420, overflow: "auto", bgcolor: "#fff" }}><FileContentBody base={listAbs} file={state.file} /></Box>
        : <Typography sx={{ p: 2, fontSize: 13, color: "text.disabled", fontStyle: "italic" }}>A label-only row — no document attached.</Typography>}
      {state.file && (
        <FileContentDialog base={listAbs} file={full ? state.file : null} label={state.label}
          open={full} onClose={() => setFull(false)} />
      )}
    </Box>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6,
                        color: "text.disabled", mb: 0.5 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

export default function PointStream({ doc, pointId, onOpenFile, onJumpPoint, base }: {
  doc: PointsDoc;
  pointId: string;
  /** The stream document's abs path — targets resolve against it. */
  base?: string;
  /** Host opens a cited/literature file (usually as another drill pane). */
  onOpenFile?: (file: string) => void;
  /** Host re-targets the stream at another point (a sibling, the definition). */
  onJumpPoint?: (id: string) => void;
}) {
  const p = doc.points.find((x) => x.id === pointId);
  if (!p) {
    return (
      <Typography sx={{ p: 2, fontSize: 13, color: AMBER }}>
        No point “{pointId}” in this store — the reference is dangling.
      </Typography>
    );
  }
  const def = definitionOf(doc, p);
  const siblings = def ? instancesOf(doc, def.id).filter((x) => x.id !== p.id) : [];
  const gaps = emptySlots(doc, p);
  const strays = strayKeys(doc, p);

  return (
    <Box sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 0.25 }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 650 }}>{p.label ?? p.id}</Typography>
        <TypeChip type={p.type} />
        <RoleChip doc={doc} p={p} />
      </Stack>
      <Typography sx={{ fontSize: 12, ...MONO, color: "text.disabled", mb: 1.25 }}>{p.id}</Typography>
      {p.note && <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1.25 }}>{p.note}</Typography>}

      <Section title={def ? "This instance sets" : "Keys"}>
        <KeyRows p={p} onOpenFile={onOpenFile} />
        {!!gaps.length && (
          <Typography sx={{ fontSize: 12, color: AMBER, mt: 0.75 }}>
            Unfilled slots: {gaps.join(", ")} — declared by the definition, not set here yet.
          </Typography>
        )}
        {!!strays.length && (
          <Typography sx={{ fontSize: 12, color: AMBER, mt: 0.5 }}>
            Keys outside the definition's slots: {strays.join(", ")} — the definition owns the shape.
          </Typography>
        )}
      </Section>

      {p.target && base && (
        <Section title="The node it references">
          <TargetNode base={base} target={p.target} />
        </Section>
      )}

      {def && (
        <Section title="Manifests the definition">
          <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 0.5,
                     ...(onJumpPoint ? { cursor: "pointer" } : {}) }}
                   onClick={onJumpPoint ? () => onJumpPoint(def.id) : undefined}>
              <Typography sx={{ fontSize: 13, fontWeight: 650 }}>{def.label ?? def.id}</Typography>
              <TypeChip type={def.type} />
            </Stack>
            {!!def.defines?.length && (
              <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 0.5 }}>
                Declares: {def.defines.map((s) => (
                  <Box key={s} component="span" sx={{ ...MONO, fontSize: 12, px: 0.4, mr: 0.4,
                        bgcolor: "#0f172a0a", borderRadius: 0.5 }}>{s}</Box>
                ))}
              </Typography>
            )}
            <KeyRows p={def} onOpenFile={onOpenFile} />
          </Box>
        </Section>
      )}

      {!!p.defines?.length && !def && (
        <Section title="Declares for its instances">
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            {p.defines.map((s) => (
              <Box key={s} component="span" sx={{ ...MONO, fontSize: 12, px: 0.5, mr: 0.5,
                    bgcolor: "#0f172a0a", borderRadius: 0.5 }}>{s}</Box>
            ))}
            — empty slots; each instance fills them itself. Nothing here is a default.
          </Typography>
        </Section>
      )}

      {!!siblings.length && (
        <Section title={`Other manifestations · ${siblings.length}`}>
          <Stack spacing={0.4}>
            {siblings.map((s) => (
              <Stack key={s.id} direction="row" spacing={0.6} sx={{ alignItems: "baseline",
                       ...(onJumpPoint ? { cursor: "pointer" } : {}) }}
                     onClick={onJumpPoint ? () => onJumpPoint(s.id) : undefined}>
                <Typography sx={{ fontSize: 13, textDecoration: onJumpPoint ? "underline" : "none",
                                  textDecorationColor: "#c3c9d2" }}>
                  {s.label ?? s.id}
                </Typography>
                <Typography sx={{ fontSize: 12, ...MONO, color: "text.disabled" }}>{s.id}</Typography>
              </Stack>
            ))}
          </Stack>
        </Section>
      )}

      {!!doc.literature.length && (
        <Section title="Literature">
          <Stack spacing={0.3}>
            {doc.literature.map((l) => (
              <Typography key={l.file}
                          onClick={onOpenFile ? () => onOpenFile(l.file) : undefined}
                          sx={{ fontSize: 13, color: "text.secondary",
                                ...(onOpenFile ? { cursor: "pointer", textDecoration: "underline", textDecorationColor: "#c3c9d2" } : {}) }}>
                {l.label ?? l.file} <Box component="span" sx={{ ...MONO, fontSize: 12, color: "text.disabled" }}>{l.file}</Box>
              </Typography>
            ))}
          </Stack>
        </Section>
      )}
    </Box>
  );
}
