/**
 * THE JOURNEY — several pipelines as one flow.
 *
 * Stages (boards) stack HORIZONTALLY; an instance fanning out into the next
 * stage stacks its destination instances VERTICALLY beside it. Every
 * instance renders as a compact strip — one small box per slot, colored by
 * state — and every box click opens its VALUE (the fill's document).
 * Instances of a later stage nobody upstream produced (scraped leads) show
 * in a "direct" band, so the funnel's second mouth stays visible.
 *
 * The links are DERIVED, never authored: a terminal list-fill's rows point
 * forward; a param fill naming an upstream instance points back. Union.
 */
import { useEffect, useState } from "react";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { resolveRef } from "crosscut";
import { readVirtualDirectoryFile } from "../../api";
import {
  DefinitionDoc, InstanceDoc, JourneyDoc, firstGap, labelOf, parseDefinitionFile, resolveVariant,
} from "../../lib/definitionDoc";
import { parseDocList } from "../../lib/listDoc";
import { NodeRefDialog } from "../points/PointsView";

const BW = 80, BH = 26, BGAP = 4, CONN = 34;

interface SlotBox {
  key: string;
  label: string;
  /** "next" = the step this instance is waiting on — its kanban column. */
  state: "filled" | "next" | "pending" | "optional";
  open: string | null;
}

interface JInst {
  path: string;
  title: string;
  slots: SlotBox[];
  children: JInst[];
}

interface Loaded {
  stageTitles: string[];
  roots: JInst[];
  /** Per stage index ≥ 1: instances nothing upstream produced. */
  direct: { stage: number; title: string; insts: JInst[] }[];
  /** X where each stage's strips START — so the direct band stacks in the
   *  SAME column as the fanned-out instances of its stage. */
  stageOffsets: number[];
}

async function readParsed(path: string) {
  return parseDefinitionFile((await readVirtualDirectoryFile(path, path)).content);
}

async function load(doc: JourneyDoc, basePath: string): Promise<Loaded> {
  interface StageData { title: string; def: DefinitionDoc; insts: { path: string; inst: InstanceDoc; j: JInst }[] }
  const stages: StageData[] = [];

  for (const ref of doc.journey) {
    const boardAbs = resolveRef(basePath, ref);
    const board = await readParsed(boardAbs);
    if (board.role !== "board") continue;
    const defAbs = resolveRef(boardAbs, board.definition);
    const def = await readParsed(defAbs);
    if (def.role !== "definition") continue;
    const insts: StageData["insts"] = [];
    for (const iref of board.instances) {
      const abs = resolveRef(boardAbs, iref);
      try {
        const inst = await readParsed(abs);
        if (inst.role !== "instance") continue;
        // Each instance renders ITS resolved shape — variants mix per row.
        const shape = resolveVariant(def, inst.variant);
        const nextKey = firstGap(def, inst)?.key ?? null;
        const slots: SlotBox[] = shape.slots.map((s) => {
          const fill = inst.fills[s.key];
          return {
            key: s.key, label: labelOf(s),
            state: fill ? "filled" : s.key === nextKey ? "next" : s.optional ? "optional" : "pending",
            open: fill ? resolveRef(abs, fill) : null,
          };
        });
        insts.push({
          path: abs, inst,
          j: { path: abs, title: inst.title ?? abs.slice(abs.lastIndexOf("/") + 1).replace(/\.definition$/, ""), slots, children: [] },
        });
      } catch { /* unreadable instances never block the journey */ }
    }
    stages.push({ title: board.title ?? def.title, def, insts });
  }

  // Link adjacent stages: terminal list rows FORWARD ∪ param fills BACKWARD.
  const direct: Loaded["direct"] = [];
  for (let i = 0; i + 1 < stages.length; i++) {
    const a = stages[i], b = stages[i + 1];
    const byPath = new Map(b.insts.map((x) => [x.path, x]));
    const claimed = new Set<string>();
    for (const src of a.insts) {
      // Terminals are variant-specific: the friend shape and the scrape
      // shape may end in different slots.
      const rd = resolveVariant(a.def, src.inst.variant);
      const consumed = new Set(rd.slots.flatMap((s) => s.from));
      const terminals = rd.slots.filter((s) => !consumed.has(s.key));
      const kids = new Set<string>();
      for (const t of terminals) {
        const fill = src.inst.fills[t.key];
        if (!fill) continue;
        const listAbs = resolveRef(src.path, fill);
        try {
          const list = parseDocList((await readVirtualDirectoryFile(listAbs, listAbs)).content);
          for (const row of list.items) if (row.file && byPath.has(resolveRef(listAbs, row.file))) kids.add(resolveRef(listAbs, row.file));
        } catch { /* a non-list terminal fill simply links nothing */ }
      }
      for (const dst of b.insts) {
        for (const p of b.def.params) {
          const fill = dst.inst.fills[p.key];
          if (fill && resolveRef(dst.path, fill) === src.path) kids.add(dst.path);
        }
      }
      for (const k of kids) { claimed.add(k); src.j.children.push(byPath.get(k)!.j); }
    }
    const unclaimed = b.insts.filter((x) => !claimed.has(x.path)).map((x) => x.j);
    if (unclaimed.length) direct.push({ stage: i + 1, title: b.title, insts: unclaimed });
  }

  // Stage k starts after every earlier stage's strip + connector + fan rail.
  const stripW = (def: DefinitionDoc) => def.slots.length * BW + Math.max(0, def.slots.length - 1) * BGAP;
  const stageOffsets: number[] = [];
  let off = 0;
  for (const s of stages) { stageOffsets.push(off); off += stripW(s.def) + CONN + 12; }

  return { stageTitles: stages.map((s) => s.title), roots: stages.length ? stages[0].insts.map((x) => x.j) : [], direct, stageOffsets };
}

function Strip({ inst, onOpenInstance, onOpenFill }: {
  inst: JInst;
  onOpenInstance: (i: JInst) => void;
  onOpenFill: (path: string, label: string) => void;
}) {
  return (
    <Box>
      <Typography onClick={() => onOpenInstance(inst)} title={inst.path}
        sx={{ fontSize: 13, fontWeight: 650, mb: 0.4, cursor: "pointer", width: "fit-content",
              maxWidth: inst.slots.length * BW + Math.max(0, inst.slots.length - 1) * BGAP,
              "&:hover": { color: "#4f46e5" } }} noWrap>
        {inst.title}
      </Typography>
      <Stack direction="row" spacing={`${BGAP}px`}>
        {inst.slots.map((s) => {
          const amber = s.state === "pending" || s.state === "next";
          const solid = s.state === "filled" || s.state === "next";
          return (
            <Tooltip key={s.key} title={`${s.label} — ${s.state === "filled" ? "click to open"
              : s.state === "next" ? "next — waiting on this step" : s.state}`}>
              <Box onClick={() => { if (s.open) onOpenFill(s.open, s.label); }}
                sx={{ width: BW, height: BH, px: 0.6, display: "flex", alignItems: "center",
                      border: s.state === "next" ? "1.5px solid" : "1px solid",
                      borderStyle: solid ? "solid" : "dashed",
                      borderColor: amber ? "#b45309" : s.state === "filled" ? "divider" : "#0f172a33",
                      borderRadius: 1,
                      bgcolor: s.state === "next" ? "#b453090f" : s.state === "filled" ? "#fff" : "#fafbfc",
                      boxShadow: solid ? "0 1px 2px #0f172a12" : "none",
                      cursor: s.open ? "pointer" : "default",
                      "&:hover": s.open ? { borderColor: "#4f46e5" } : undefined }}>
                <Typography sx={{ fontSize: 12, fontWeight: 600, lineHeight: 1.1,
                                  color: amber ? "#b45309" : s.state === "filled" ? "text.primary" : "text.disabled" }} noWrap>
                  {s.label}
                </Typography>
              </Box>
            </Tooltip>
          );
        })}
      </Stack>
    </Box>
  );
}

function Band({ inst, onOpenInstance, onOpenFill }: {
  inst: JInst;
  onOpenInstance: (i: JInst) => void;
  onOpenFill: (path: string, label: string) => void;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center" }}>
      <Strip inst={inst} onOpenInstance={onOpenInstance} onOpenFill={onOpenFill} />
      {inst.children.length > 0 && (
        <>
          <svg width={CONN} height={BH} style={{ flexShrink: 0, alignSelf: "center" }}>
            <defs>
              <marker id="journey-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 0 L 8 4 L 0 8 z" fill="#4f46e5" />
              </marker>
            </defs>
            <path d={`M 2 ${BH / 2} L ${CONN - 3} ${BH / 2}`} stroke="#4f46e5" strokeWidth={1.4}
              opacity={0.75} markerEnd="url(#journey-arrow)" />
          </svg>
          {/* One source, many destinations: the fan is the vertical stack. */}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5,
                     borderLeft: "2px solid #4f46e533", pl: 1.25 }}>
            {inst.children.map((c) => (
              <Band key={c.path} inst={c} onOpenInstance={onOpenInstance} onOpenFill={onOpenFill} />
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}

export default function JourneyView({ doc, basePath }: { doc: JourneyDoc; basePath: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openRef, setOpenRef] = useState<{ node: string; label?: string } | null>(null);

  useEffect(() => {
    let live = true;
    setData(null); setErr(null);
    load(doc, basePath).then(
      (d) => { if (live) setData(d); },
      (e: unknown) => { if (live) setErr(e instanceof Error ? e.message : String(e)); },
    );
    return () => { live = false; };
  }, [doc, basePath]);

  if (err) return <Typography sx={{ p: 3, fontSize: 12, color: "error.main" }}>{err}</Typography>;
  if (!data) return <Typography sx={{ p: 3, fontSize: 12, color: "text.disabled" }}>Walking the pipelines…</Typography>;

  const openInstance = (i: JInst) => setOpenRef({ node: i.path, label: i.title });
  const openFill = (path: string, label: string) => setOpenRef({ node: path, label });

  return (
    <Box sx={{ height: "100%", minHeight: 0, overflow: "auto", bgcolor: "#fafbfc", p: 2.5 }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {data.roots.map((r) => (
          <Band key={r.path} inst={r} onOpenInstance={openInstance} onOpenFill={openFill} />
        ))}
        {data.direct.map((d) => {
          const x = data.stageOffsets[d.stage] ?? 0;
          return (
            <Box key={d.stage} sx={{ mt: 1, pl: `${x}px` }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                                color: "text.disabled", mb: 1 }}>
                direct · {d.title} (no upstream)
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                {d.insts.map((i) => (
                  <Band key={i.path} inst={i} onOpenInstance={openInstance} onOpenFill={openFill} />
                ))}
              </Box>
            </Box>
          );
        })}
      </Box>
      <NodeRefDialog base={basePath} nodeRef={openRef} onClose={() => setOpenRef(null)} />
    </Box>
  );
}
