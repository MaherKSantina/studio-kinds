/**
 * The parameter pills, in ONE place above everything.
 *
 * They used to live in each screen's page, filtered to "what changes THIS screen". That filtering
 * was genuinely useful and it was also a lie about ownership: `deliveryMethod` is one fact about
 * one journey, and showing it inside Request Payment made it read as a property of that screen —
 * so setting it felt like something you had to redo everywhere it appeared. Here it is set once,
 * it is visible wherever you are standing, and walking through an event that `sets` it moves the
 * pill, because the pill and the walk are the same state.
 *
 * The per-screen insight survives as EMPHASIS rather than as filtering: a dimension the current
 * screen cannot react to is dimmed, not hidden. You can still set it — you are setting a fact
 * about the world, and the world does not stop existing off-screen.
 *
 * A screen's LOCALS are the one thing that cannot move here, because they genuinely belong to the
 * screen and reset when you leave it. They get their own group, named after the screen, so the
 * difference between "true until something changes it" and "true while you are on this page" is
 * visible rather than something you have to remember.
 */
import { Box, Chip, Divider, Tooltip, Typography } from "@mui/material";
import { useIsNarrow } from "./useIsNarrow";
import {
  type Assignment, type DimValue, type FlowBody, type FlowScreen,
  screenParams,
} from "../../lib/flowEngine";
import { MUTED, EMPH, SEL_BG, COND } from "./flowPalette";


/** Right-aligned name column. Wide enough for `listingOffersShipping`, the longest real one. */
const LABEL_W = 148;

export default function FlowParamBar({
  body, screen, assignment, onSetParam,
}: {
  body: FlowBody;
  /** The screen being stood on, whose locals join the bar. Null while nothing is focused. */
  screen: FlowScreen | null;
  assignment: Assignment;
  onSetParam: (name: string, value: DimValue) => void;
}) {
  const narrow = useIsNarrow();
  const relevant = screen ? new Set(screenParams(screen, body).base) : new Set<string>();
  const derived = screen ? screenParams(screen, body).derived : [];
  const hasAnything = body.dimensionOrder.length > 0 || (screen?.localOrder.length ?? 0) > 0;
  if (!hasAnything) return null;

  // One key per LINE, with the names in a column of their own. Laid out inline the names became
  // punctuation between runs of values and you had to read the whole bar to find the one you
  // wanted; stacked, the keys form a list you can scan down and the values line up beside them.
  const group = (name: string, values: DimValue[], dim: boolean) => (
    <Box key={name} sx={{
      display: "flex", gap: narrow ? 0.2 : 0.75, opacity: dim ? 0.45 : 1,
      // Narrow: the name goes ABOVE its values. A 148px right-aligned column plus a row of chips
      // does not fit, and shrinking the column truncates the very names you are reading by.
      ...(narrow ? { flexDirection: "column", alignItems: "flex-start" } : { alignItems: "center" }),
    }}>
      <Typography
        title={name}
        sx={{
          fontSize: 12, fontWeight: 600, color: MUTED, flexShrink: 0,
          ...(narrow ? null : { width: LABEL_W, textAlign: "right" }),
        }}
        noWrap
      >
        {name}
      </Typography>
      <Box sx={{ display: "flex", gap: 0.4, flexWrap: "wrap" }}>
        {values.map((v) => {
          const on = assignment[name] === v;
          return (
            <Chip
              key={String(v)} size="small" label={String(v)}
              onClick={() => onSetParam(name, v)}
              variant={on ? "filled" : "outlined"}
              sx={{
                fontSize: 12, height: 20,
                ...(on ? { bgcolor: SEL_BG, color: EMPH, fontWeight: 700 } : {}),
              }}
            />
          );
        })}
      </Box>
    </Box>
  );

  return (
    // A capped, scrollable column. Stacking one key per line costs height on a surface whose whole
    // point is the screenshot, so the bar is allowed to grow to a few rows and then scroll rather
    // than push the image off the bottom of a long model.
    <Box sx={{
      flexShrink: 0, display: "flex", flexDirection: "column", gap: 0.5,
      px: 1, py: 0.75, border: "1px solid", borderColor: "divider", borderRadius: 0.5,
      // Sized so the realistic worst case fits without scrolling — the seller proposal's four
      // globals, its derived value and one screen's local is six rows. The cap is a guard against
      // a pathological model, not the normal experience; a bar you have to scroll hides a pill.
      maxHeight: narrow ? 200 : 224, overflowY: "auto",
    }}>
      <Tooltip title="Set once. Walking through an event that assigns one of these moves it too.">
        <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
          Parameters
        </Typography>
      </Tooltip>

      {body.dimensionOrder.map((dim) =>
        group(dim, body.dimensions[dim] ?? [], !!screen && !relevant.has(dim)))}

      {/* Derived values are READ-ONLY: they are computed from the pills above, and offering them
          as something to click would invite setting a value the rules then overwrite. */}
      {derived.map((name) => (
        <Box key={name} sx={{
          display: "flex", gap: narrow ? 0.2 : 0.75,
          ...(narrow ? { flexDirection: "column", alignItems: "flex-start" } : { alignItems: "center" }),
        }}>
          <Typography
            title={name}
            sx={{
              fontSize: 12, fontWeight: 600, color: COND, flexShrink: 0,
              ...(narrow ? null : { width: LABEL_W, textAlign: "right" }),
            }}
            noWrap
          >
            {name}
          </Typography>
          <Tooltip title="Derived from the parameters above — set its inputs to change it">
            <Chip size="small" label={String(assignment[name] ?? "—")}
              sx={{ fontSize: 12, height: 20, bgcolor: `${COND}33`, color: COND }} />
          </Tooltip>
        </Box>
      ))}

      {screen && screen.localOrder.length > 0 && (
        <>
          <Divider sx={{ my: 0.25 }} />
          <Tooltip title={`Owned by ${screen.title}. Resets when you arrive here from another screen.`}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
              {screen.title} only
            </Typography>
          </Tooltip>
          {screen.localOrder.map((name) => group(name, screen.locals[name] ?? [], false))}
        </>
      )}
    </Box>
  );
}
