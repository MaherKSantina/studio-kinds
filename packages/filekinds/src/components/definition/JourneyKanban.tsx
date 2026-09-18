/**
 * The JOURNEY as ONE KANBAN — every stage's board merged into a single row
 * of columns, in journey order, grouped under stage captions. Every
 * instance is a card in the column of its first unfilled required slot;
 * each stage keeps its own Done column, so "analysis cleared but the
 * application hasn't started" reads as exactly that. Clicking a card opens
 * the instance whole.
 */
import { useEffect, useState } from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { resolveRef } from "crosscut";
import { readVirtualDirectoryFile } from "../../api";
import { JourneyDoc, fillProgress, parseDefinitionFile, variantLabel } from "../../lib/definitionDoc";
import { boardStrip, columnOf, variantOf } from "./BoardView";
import { NodeRefDialog } from "../points/PointsView";

interface KCard { path: string; title: string; column: string; waiting: boolean; filled: number; total: number }
/** One shape of one stage — variants get their OWN column group; their data
 *  is never merged with another shape's. */
interface KGroup {
  stage: string;
  /** Variant label, or null for a definition with no variants. */
  shape: string | null;
  firstOfStage: boolean;
  columns: { key: string; label: string }[];
  cards: KCard[];
}

async function load(doc: JourneyDoc, basePath: string): Promise<KGroup[]> {
  const out: KGroup[] = [];
  for (const ref of doc.journey) {
    const boardAbs = resolveRef(basePath, ref);
    const board = parseDefinitionFile((await readVirtualDirectoryFile(boardAbs, boardAbs)).content);
    if (board.role !== "board") continue;
    const defAbs = resolveRef(boardAbs, board.definition);
    const def = parseDefinitionFile((await readVirtualDirectoryFile(defAbs, defAbs)).content);
    if (def.role !== "definition") continue;

    const byShape = new Map<string | null, KCard[]>();
    for (const iref of board.instances) {
      const abs = resolveRef(boardAbs, iref);
      try {
        const inst = parseDefinitionFile((await readVirtualDirectoryFile(abs, abs)).content);
        if (inst.role !== "instance") continue;
        const { column, waiting } = columnOf(def, inst);
        const { filled, total } = fillProgress(def, inst);
        const key = variantOf(def, inst);
        byShape.set(key, [...(byShape.get(key) ?? []), {
          path: abs,
          title: inst.title ?? abs.slice(abs.lastIndexOf("/") + 1).replace(/\.definition$/, ""),
          column, waiting, filled, total,
        }]);
      } catch { /* an unreadable instance never blocks the board */ }
    }

    const stage = board.title ?? def.title;
    const shapes: (string | null)[] = def.variants.length ? def.variants.map((v) => v.key) : [null];
    let first = true;
    for (const key of shapes) {
      const cards = byShape.get(key) ?? [];
      // A shape with nothing in it stays out of the merged board.
      if (def.variants.length && !cards.length) continue;
      out.push({
        stage,
        shape: key === null ? null : variantLabel(def, key),
        firstOfStage: first,
        columns: boardStrip(def, key),
        cards,
      });
      first = false;
    }
  }
  return out;
}

const COLW = 168;

export default function JourneyKanban({ doc, basePath }: { doc: JourneyDoc; basePath: string }) {
  const [stages, setStages] = useState<KGroup[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openRef, setOpenRef] = useState<{ node: string; label?: string } | null>(null);

  useEffect(() => {
    let live = true;
    setStages(null); setErr(null);
    load(doc, basePath).then(
      (d) => { if (live) setStages(d); },
      (e: unknown) => { if (live) setErr(e instanceof Error ? e.message : String(e)); },
    );
    return () => { live = false; };
  }, [doc, basePath]);

  if (err) return <Typography sx={{ p: 3, fontSize: 12, color: "error.main" }}>{err}</Typography>;
  if (!stages) return <Typography sx={{ p: 3, fontSize: 12, color: "text.disabled" }}>Reading the boards…</Typography>;

  return (
    <Box sx={{ height: "100%", minHeight: 0, overflow: "auto", bgcolor: "#fafbfc", p: 2 }}>
      <Typography sx={{ fontSize: 12, color: "text.disabled", mb: 1 }}>
        Each card sits under the step it has most recently <b>completed</b>; the amber “next” box in its DAG is what it owes.
      </Typography>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2.5, minWidth: "fit-content" }}>
        {stages.map((s, si) => (
          <Box key={si} sx={{ flexShrink: 0,
                              ...(si > 0 ? { borderLeft: s.firstOfStage ? "1px solid" : "1px dashed",
                                             borderColor: "divider", pl: 2.5 } : {}) }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                              color: "#4f46e5", mb: s.shape ? 0.15 : 1 }}>
              {s.stage}
            </Typography>
            {s.shape && (
              <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                                color: "text.disabled", mb: 1 }}>
                {s.shape}
              </Typography>
            )}
            <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
              {s.columns.map((col) => {
                const here = s.cards.filter((c) => c.column === col.key);
                const done = col.key === "";
                return (
                  <Box key={col.key || "__done"} sx={{ width: COLW, flexShrink: 0 }}>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", px: 0.5, mb: 0.75 }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                                        textTransform: "uppercase",
                                        color: done ? "#15803d" : "text.disabled", flex: 1 }} noWrap>
                        {col.label}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: "text.disabled" }}>{here.length}</Typography>
                    </Stack>
                    <Stack spacing={0.75}>
                      {here.map((c) => (
                        <Box key={c.path} onClick={() => setOpenRef({ node: c.path, label: c.title })}
                          title={c.path}
                          sx={{ border: "1px solid", borderColor: done ? "#15803d44" : "divider", borderRadius: 1.5,
                                bgcolor: "#fff", p: 0.9, cursor: "pointer", boxShadow: "0 1px 3px #0f172a14",
                                "&:hover": { borderColor: "#4f46e5" } }}>
                          <Typography sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{c.title}</Typography>
                          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", mt: 0.4 }}>
                            <Chip size="small" label={`${c.filled}/${c.total}`}
                              sx={{ height: 20, fontSize: 12, fontWeight: 700,
                                    bgcolor: done ? "#15803d1a" : "#4f46e514",
                                    color: done ? "#15803d" : "#4f46e5" }} />
                            {c.waiting && (
                              <Chip size="small" label="waiting"
                                sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: "#b4530914", color: "#b45309" }} />
                            )}
                          </Stack>
                        </Box>
                      ))}
                      {!here.length && (
                        <Box sx={{ border: "1px dashed", borderColor: "divider", borderRadius: 1.5, py: 1,
                                   textAlign: "center" }}>
                          <Typography sx={{ fontSize: 12, color: "text.disabled", fontStyle: "italic" }}>—</Typography>
                        </Box>
                      )}
                    </Stack>
                  </Box>
                );
              })}
            </Box>
          </Box>
        ))}
      </Box>
      <NodeRefDialog base={basePath} nodeRef={openRef} onClose={() => setOpenRef(null)} />
    </Box>
  );
}
