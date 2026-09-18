/**
 * The PIPELINE BOARD — many instances of one definition, side by side.
 *
 * Columns are the definition's required NON-TERMINAL slots in order, plus
 * Done. A TERMINAL slot (one nothing else reads — the outcome) is not a
 * column: DONE means the terminal slots have a value. A card stands at its
 * first unfilled required slot; one that is past every working slot but
 * still awaiting its terminal fill stays in the last column, marked
 * "waiting". Status is DERIVED from the fills, never stored. Optional
 * slots never block; a card notes them when they're filled. Clicking a
 * card opens the instance whole (its DAG with live fills).
 */
import { useEffect, useState } from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { resolveRef } from "crosscut";
import { readVirtualDirectoryFile } from "../../api";
import {
  BoardDoc, DefinitionDoc, InstanceDoc, fillProgress, labelOf, parseDefinitionFile, resolveVariant,
} from "../../lib/definitionDoc";
import { NodeRefDialog } from "../points/PointsView";

interface CardData {
  path: string;
  title: string;
  inst: InstanceDoc;
  /** The shape this card runs — cards never cross variants. */
  variant: string | null;
  /** Column key: the blocking slot's key, or "" = done. */
  column: string;
  /** Every working slot filled — only the terminal outcome outstanding. */
  waiting: boolean;
  filled: number;
  total: number;
  optionalDone: number;
}

/** The RESOLVED shape's working slots — required non-terminal; a terminal
 *  slot (no consumers) is never a column, it IS the done condition. */
export function workingSlotsOf(def: DefinitionDoc): { working: string[]; terminal: string[] } {
  const consumed = new Set(def.slots.flatMap((s) => s.from));
  return {
    working: def.slots.filter((s) => !s.optional && consumed.has(s.key)).map((s) => s.key),
    terminal: def.slots.filter((s) => !s.optional && !consumed.has(s.key)).map((s) => s.key),
  };
}

/** The column key for an instance that has completed nothing yet. */
export const START = "__start";

/** Where a card stands: the step it has most recently COMPLETED — its
 *  current state, not the one it owes next. Nothing done = Not started;
 *  the terminal filled = Done. */
export function columnOf(def: DefinitionDoc, inst: InstanceDoc): { column: string; waiting: boolean } {
  const rd = resolveVariant(def, inst.variant);
  const { working, terminal } = workingSlotsOf(rd);
  const done = terminal.length
    ? terminal.every((k) => inst.fills[k])
    : working.length > 0 && working.every((k) => inst.fills[k]);
  if (done) return { column: "", waiting: false };
  let last: string | null = null;
  for (const k of working) if (inst.fills[k]) last = k;
  if (last === null) return { column: START, waiting: false };
  // Every working step done, only the ending outstanding.
  return { column: last, waiting: working.every((k) => inst.fills[k]) };
}

/** The columns of ONE shape: that variant's working slots, in its own order.
 *  Variants never merge — each shape is its own board. */
export function columnsForVariant(def: DefinitionDoc, variantKey: string | null): { key: string; label: string }[] {
  const shape = resolveVariant(def, variantKey);
  const { working } = workingSlotsOf(shape);
  return shape.slots.filter((s) => working.includes(s.key)).map((s) => ({ key: s.key, label: labelOf(s) }));
}

/** The intake column's name: the shape's own inputs — a card sitting there
 *  has exactly what it was created with, which is what its DAG shows. */
export function intakeLabel(def: DefinitionDoc): string {
  const required = def.params.filter((p) => !p.optional);
  const named = (required.length ? required : def.params).map(labelOf);
  if (!named.length) return "Start";
  return named.length > 2 ? `${named[0]} / ${named[1]} …` : named.join(" / ");
}

/** The done column's name: the shape's LAST step — finishing it is what
 *  being done means. (Still drawn green; only the wording changes.) */
export function doneLabel(def: DefinitionDoc, variantKey: string | null): string {
  const shape = resolveVariant(def, variantKey);
  const { terminal } = workingSlotsOf(shape);
  const names = terminal
    .map((k) => shape.slots.find((s) => s.key === k))
    .filter(Boolean)
    .map((s) => labelOf(s!));
  if (!names.length) return "Done";
  return names.length > 2 ? `${names[0]} / ${names[1]} …` : names.join(" / ");
}

/** The full column strip of one shape: the intake inputs, the working steps
 *  in order, then the last step (the done column). */
export function boardStrip(def: DefinitionDoc, variantKey: string | null): { key: string; label: string }[] {
  return [
    { key: START, label: intakeLabel(def) },
    ...columnsForVariant(def, variantKey),
    { key: "", label: doneLabel(def, variantKey) },
  ];
}

/** Which shape an instance belongs to — a key that really exists, so no
 *  card can fall outside every variant. Null when the definition has none. */
export function variantOf(def: DefinitionDoc, inst: InstanceDoc): string | null {
  if (!def.variants.length) return null;
  const wanted = inst.variant ?? def.defaultVariant;
  return def.variants.find((v) => v.key === wanted)?.key ?? def.variants[0].key;
}

export default function BoardView({ board, boardPath, variant, onVariantChange }: {
  board: BoardDoc;
  boardPath: string;
  /** The shape on show, hoisted so the host's other views (streams, graph)
   *  render the SAME variant. Undefined = the board keeps its own. */
  variant?: string | null;
  onVariantChange?: (key: string) => void;
}) {
  const [def, setDef] = useState<DefinitionDoc | null>(null);
  const [cards, setCards] = useState<CardData[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openRef, setOpenRef] = useState<{ node: string; label?: string } | null>(null);
  /** The shape on show. Variants never mix: this picks BOTH the columns and
   *  the cards. */
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setDef(null); setCards(null); setErr(null);
    (async () => {
      try {
        const defAbs = resolveRef(boardPath, board.definition);
        const d = parseDefinitionFile((await readVirtualDirectoryFile(defAbs, defAbs)).content);
        if (d.role !== "definition") { if (live) setErr(`${board.definition} is not a definition`); return; }
        if (live) setActive(d.variants.length ? d.defaultVariant ?? d.variants[0].key : null);
        const out: CardData[] = [];
        for (const ref of board.instances) {
          const abs = resolveRef(boardPath, ref);
          try {
            const parsed = parseDefinitionFile((await readVirtualDirectoryFile(abs, abs)).content);
            if (parsed.role !== "instance") continue;
            const { column, waiting } = columnOf(d, parsed);
            const { filled, total } = fillProgress(d, parsed);
            out.push({
              path: abs,
              title: parsed.title ?? abs.slice(abs.lastIndexOf("/") + 1).replace(/\.definition$/, ""),
              inst: parsed,
              variant: variantOf(d, parsed),
              column, waiting,
              filled, total,
              optionalDone: d.slots.filter((s) => s.optional && parsed.fills[s.key]).length,
            });
          } catch { /* an unreadable instance never blocks the board */ }
        }
        if (live) { setDef(d); setCards(out); }
      } catch (e: unknown) {
        if (live) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { live = false; };
  }, [board, boardPath]);

  if (err) return <Typography sx={{ p: 3, fontSize: 12, color: "error.main" }}>{err}</Typography>;
  if (!def || !cards) return <Typography sx={{ p: 3, fontSize: 12, color: "text.disabled" }}>Reading the instances…</Typography>;

  const hasVariants = def.variants.length > 0;
  const effective = !hasVariants ? null
    : (variant !== undefined ? variant : active) ?? def.defaultVariant ?? def.variants[0].key;
  const pick = (key: string) => { setActive(key); onVariantChange?.(key); };
  const shown = hasVariants ? cards.filter((c) => c.variant === effective) : cards;
  const columns = boardStrip(def, effective);

  return (
    <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", bgcolor: "#fafbfc", p: 2 }}>
        {hasVariants && (
          <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap", mb: 1.5 }}>
            {def.variants.map((v) => {
              const n = cards.filter((c) => c.variant === v.key).length;
              const on = effective === v.key;
              return (
                <Chip key={v.key} size="small" label={`${v.label ?? v.key} · ${n}`}
                  onClick={() => pick(v.key)}
                  sx={{ height: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                        bgcolor: on ? "#4f46e5" : "#0f172a0d", color: on ? "#fff" : "text.secondary",
                        "&:hover": { bgcolor: on ? "#4f46e5" : "#0f172a1a" } }} />
              );
            })}
          </Stack>
        )}
        <Typography sx={{ fontSize: 12, color: "text.disabled", mb: 0.75 }}>
          Each card sits under the step it has most recently <b>completed</b>; the amber “next” box in its DAG is what it owes.
        </Typography>
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", minWidth: columns.length * 216 }}>
          {columns.map((col) => {
            const here = shown.filter((c) => c.column === col.key);
            const done = col.key === "";
            return (
              <Box key={col.key || "__done"} sx={{ width: 200, flexShrink: 0 }}>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", px: 0.5, mb: 0.75 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.07em",
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
                            bgcolor: "#fff", p: 1, cursor: "pointer", boxShadow: "0 1px 3px #0f172a14",
                            "&:hover": { borderColor: "#4f46e5" } }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{c.title}</Typography>
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", mt: 0.5 }}>
                        <Chip size="small" label={`${c.filled}/${c.total}`}
                          sx={{ height: 20, fontSize: 12, fontWeight: 700,
                                bgcolor: done ? "#15803d1a" : "#4f46e514",
                                color: done ? "#15803d" : "#4f46e5" }} />
                        {c.waiting && (
                          <Chip size="small" label="waiting"
                            sx={{ height: 20, fontSize: 12, fontWeight: 700, bgcolor: "#b4530914", color: "#b45309" }} />
                        )}
                        {c.optionalDone > 0 && (
                          <Chip size="small" label={`+${c.optionalDone} optional`}
                            sx={{ height: 20, fontSize: 12, bgcolor: "#0f172a0d", color: "text.secondary" }} />
                        )}
                      </Stack>
                    </Box>
                  ))}
                  {!here.length && (
                    <Box sx={{ border: "1px dashed", borderColor: "divider", borderRadius: 1.5, py: 1.25,
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
      <NodeRefDialog base={boardPath} nodeRef={openRef} onClose={() => setOpenRef(null)} />
    </Box>
  );
}
