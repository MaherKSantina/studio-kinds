/**
 * What is still missing — a checklist, not a report.
 *
 * A `.flow` is only as good as its captures, and the states that lack one are exactly the states
 * nobody has looked at. They are also the hardest to find: they are scattered across screens, and
 * a state you cannot see is a state you forget exists. This tab pulls them into one list.
 *
 * The useful half is the PARAMETERS. Knowing "Checkout Payment — Shipping cost — $0 has no
 * screenshot" is not actionable on its own; knowing you have to set `listingShippingType =
 * price_on_request` and `sellerQuotedAmount = zero` to make the app show you that screen is. Each
 * row therefore carries the minimal pin set that produces it, solved by the same function the
 * state cards use, so the list cannot disagree with what clicking a state does.
 *
 * Two grades, because they are different jobs:
 *   • NO CAPTURE — the state renders nothing at all. Someone has to go and take the screenshot.
 *   • INHERITS  — the state falls back to its screen's generic capture. Sometimes right (an order
 *     summary whose shipping line is the only difference), sometimes a gap nobody noticed. It is
 *     listed second and quieter, because it is a judgement call rather than a task.
 */
import { Box, Button, Chip, Paper, Stack, Tooltip, Typography } from "@mui/material";
import CameraAltOutlinedIcon from "@mui/icons-material/CameraAltOutlined";
import SouthIcon from "@mui/icons-material/South";
import {
  type Assignment, type FlowBody, type FlowDoc, type FlowScreen,
  assignmentForVariant, panelsOf, resolveVariant, screenAssignment, shotsOf, updateScreen,
  updateVariant,
} from "../../lib/flowEngine";
import { MUTED, EMPH, COND, WARN, HOVER_BG, ACTION_BG, ACTION_BG_HOVER, ACTION_FG } from "./flowPalette";


export interface FlowGap {
  screenId: string;
  screenTitle: string;
  /** -1 when the SCREEN itself has no capture and declares no states. */
  variantIndex: number;
  label: string;
  /** Parameters that make this state render. Null when nothing can produce it. */
  pins: Assignment | null;
  inherits: boolean;
  note: string | null;
  /**
   * Captures the ORIGINAL side already has for this same state, when this is one half of a diff.
   *
   * A full-document diff duplicates its source, so a screenshot added to the source does not
   * appear in the proposal — and the pane's only existing remedy is Reset, which replaces the
   * whole New side and throws the proposal away. Carrying the original's shots here makes the
   * additive half of that possible: fill what is empty, touch nothing else.
   */
  fromOriginal: string[];
}

/** The same identity the diff uses: a screen is its TITLE, a state is its LABEL. */
function originalShots(base: FlowBody | null | undefined, screenTitle: string, label: string | null): string[] {
  if (!base) return [];
  const screen = base.screens.find((s) => s.title === screenTitle);
  if (!screen) return [];
  if (label === null) return shotsOf(screen);
  const v = screen.variants.find((x) => x.label === label);
  return v ? shotsOf(v) : [];
}

/**
 * Drop the pins that do not actually matter for THIS state.
 *
 * `assignmentForVariant` returns every raw dimension the screen reacts to, which is right for
 * selecting a state but wrong for a checklist: "Pickup only" needs `listingOffersShipping = false`
 * and nothing else, yet the solver also hands back the delivery method, which that state ignores.
 * A checklist with three redundant lines on it is a checklist people stop reading.
 *
 * Pruned greedily and then VERIFIED — if the smaller set no longer selects the state, the full one
 * is used instead. A shorter list is only worth having if it is still true.
 */
function minimalPins(screen: FlowScreen, index: number, body: FlowBody, pins: Assignment): Assignment {
  const target = screen.variants[index];
  const selects = (a: Assignment) => resolveVariant(screen, screenAssignment(body, screen.id, a)) === target;
  const out: Assignment = { ...pins };
  for (const key of Object.keys(pins)) {
    const without = { ...out };
    delete without[key];
    if (selects(without)) delete out[key];
  }
  return selects(out) ? out : pins;
}

/**
 * Every rendering with NOTHING of its own to show, worst first.
 *
 * "Nothing" is measured in PANELS, not screenshots: a state whose content is a `.brief` is
 * evidenced, and listing it as a missing capture would send the reader off to photograph a
 * document that is already on the page.
 */
export function flowGaps(body: FlowBody, base?: FlowBody | null): FlowGap[] {
  const out: FlowGap[] = [];
  for (const screen of body.screens) {
    const screenShots = panelsOf(screen);
    if (!screen.variants.length) {
      if (!screenShots.length) {
        out.push({
          screenId: screen.id, screenTitle: screen.title, variantIndex: -1,
          label: screen.title, pins: {}, inherits: false, note: screen.description,
          fromOriginal: originalShots(base, screen.title, null),
        });
      }
      continue;
    }
    const from = screenAssignment(body, screen.id);
    screen.variants.forEach((v, i) => {
      if (panelsOf(v).length) return;
      const solved = assignmentForVariant(screen, i, body, from);
      out.push({
        screenId: screen.id, screenTitle: screen.title, variantIndex: i, label: v.label,
        pins: solved && minimalPins(screen, i, body, solved),
        inherits: screenShots.length > 0,
        note: v.description,
        fromOriginal: originalShots(base, screen.title, v.label),
      });
    });
  }
  return out.sort((a, b) => Number(a.inherits) - Number(b.inherits));
}

export default function FlowGapsList({
  body, baseBody, onOpen, onDocChange,
}: {
  body: FlowBody;
  /** The Original side, when this is one half of a `.diff`. */
  baseBody?: FlowBody | null;
  onOpen: (screenId: string, variantIndex: number) => void;
  /** Absent when this surface is read-only, which hides every take-from-original control. */
  onDocChange?: (mutate: (draft: FlowDoc) => { ok: boolean; error?: string }) => void;
}) {
  const gaps = flowGaps(body, baseBody);
  const takeable = gaps.filter((g) => g.fromOriginal.length > 0);

  /** Fill an empty state from the original. Purely ADDITIVE — it only ever writes where there is
   *  nothing, so it cannot overwrite a capture the proposal deliberately changed. */
  const take = (rows: FlowGap[]) => {
    if (!onDocChange) return;
    onDocChange((draft) => {
      for (const g of rows) {
        if (!g.fromOriginal.length) continue;
        if (g.variantIndex < 0) updateScreen(draft, g.screenId, { screenshots: g.fromOriginal });
        else updateVariant(draft, g.screenId, g.variantIndex, { screenshots: g.fromOriginal });
      }
      return { ok: true };
    });
  };
  const missing = gaps.filter((g) => !g.inherits);
  const inherits = gaps.filter((g) => g.inherits);

  if (!gaps.length) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography sx={{ fontSize: 12, color: MUTED }}>
          Every state has its own capture. Nothing to collect.
        </Typography>
      </Box>
    );
  }

  const group = (title: string, rows: FlowGap[], hint: string) => rows.length > 0 && (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" }}>
        {title} ({rows.length})
      </Typography>
      <Typography sx={{ fontSize: 12, color: MUTED, mb: 0.5 }}>{hint}</Typography>
      <Stack spacing={0.5}>
        {rows.map((g) => (
          <Paper
            key={`${g.screenId}:${g.variantIndex}`} variant="outlined"
            onClick={() => onOpen(g.screenId, g.variantIndex)}
            sx={{
              p: 0.85, cursor: "pointer", opacity: g.inherits ? 0.75 : 1,
              "&:hover": { bgcolor: HOVER_BG, borderColor: COND, opacity: 1 },
            }}
          >
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75, flexWrap: "wrap" }}>
              <CameraAltOutlinedIcon sx={{ fontSize: 13, color: MUTED, alignSelf: "center" }} />
              <Typography sx={{ fontSize: 13, color: MUTED }}>{g.screenTitle}</Typography>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: EMPH }}>{g.label}</Typography>
              <Box sx={{ flex: 1 }} />
              {g.fromOriginal.length > 0 && onDocChange && (
                <Tooltip title="The Original side already has this capture. Copies it here without touching anything else.">
                  <Button
                    size="small" startIcon={<SouthIcon sx={{ fontSize: 13 }} />}
                    onClick={(e) => { e.stopPropagation(); take([g]); }}
                    sx={{ fontSize: 12, textTransform: "none", py: 0, minWidth: 0, color: COND }}
                  >
                    Take from original
                  </Button>
                </Tooltip>
              )}
              <Typography sx={{ fontSize: 12, color: MUTED }}>open →</Typography>
            </Box>

            {/* The actionable half: what to set to make the app show you this. */}
            <Box sx={{ display: "flex", gap: 0.4, flexWrap: "wrap", mt: 0.5, alignItems: "center" }}>
              {g.pins === null ? (
                <Typography sx={{ fontSize: 12, color: WARN }}>
                  No parameters produce this state — it cannot be reached, so it cannot be captured.
                </Typography>
              ) : Object.keys(g.pins).length === 0 ? (
                <Typography sx={{ fontSize: 12, color: MUTED }}>Shown under any parameters.</Typography>
              ) : (
                <>
                  <Typography sx={{ fontSize: 12, color: MUTED }}>set</Typography>
                  {Object.entries(g.pins).map(([k, v]) => (
                    <Chip key={k} size="small" label={`${k} = ${String(v)}`}
                      sx={{ height: 20, fontSize: 12, bgcolor: `${COND}22`, color: COND }} />
                  ))}
                </>
              )}
            </Box>

            {g.note && (
              <Typography sx={{ fontSize: 12, color: MUTED, mt: 0.4, whiteSpace: "pre-line" }}>{g.note}</Typography>
            )}
          </Paper>
        ))}
      </Stack>
    </Box>
  );

  return (
    <Box sx={{ height: "100%", overflow: "auto", p: 1 }}>
      {/* The bulk case is the common one: you added captures to the source and the proposal, being
          a copy of it, never saw them. Reset would pull them in and discard the proposal with
          them; this fills only what is empty. */}
      {takeable.length > 0 && onDocChange && (
        <Paper variant="outlined" sx={{ p: 0.85, mb: 1.25, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", bgcolor: `${COND}0f` }}>
          <Typography sx={{ fontSize: 13, color: EMPH }}>
            {takeable.length} of these already {takeable.length === 1 ? "has a capture" : "have captures"} on the Original side.
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Button
            size="small" variant="contained" startIcon={<SouthIcon sx={{ fontSize: 14 }} />}
            onClick={() => take(takeable)}
            sx={{ fontSize: 13, textTransform: "none", bgcolor: ACTION_BG, color: ACTION_FG, "&:hover": { bgcolor: ACTION_BG_HOVER } }}
          >
            Take all {takeable.length} from original
          </Button>
        </Paper>
      )}
      {group("No capture", missing, "These render nothing. Set the parameters shown, then screenshot the app.")}
      {group("Falls back to the screen's capture", inherits, "These show the screen's generic image. Check whether that is honest for this state.")}
    </Box>
  );
}
